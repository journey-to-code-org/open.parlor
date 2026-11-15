// A small pool of worker threads that think for the computer players, so a long think at one table
// doesn't hold up every other table (the server has one main thread, and every table lives on it).
//
// The pool knows nothing about games. A "brain" is a module that exports `think(job)` (and, if it
// likes, `warm()`); each worker imports it and answers jobs with it. The same brain is given here as
// plain functions too (`local`), for the two times the main thread has to answer itself: when there
// are no workers (none asked for, or they couldn't start), and when a think is given up on.
//
//   - Jobs wait in one queue, first come first served, with one rule: a table never has two thinks
//     running at once. A table that keeps asking (and dropping the answers) can't take the whole pool.
//   - A think that runs past the ceiling is abandoned: its worker is terminated and replaced, and the
//     job is answered with `local.quick(job)`, a move that needs no thought. One runaway search can
//     never hang a table, or use up a worker for good.
//   - A job is a plain value: it reaches the worker by structured clone, and so does the answer.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

/** The brain, on this thread. */
export interface LocalBrain<Job> {
  /** The same function the workers run. */
  think(job: Job): unknown;
  /** A move that takes no thinking, for a job whose think was abandoned. */
  quick(job: Job): unknown;
}

export interface BotPoolOptions<Job> {
  /** The brain module the workers import: a file URL. It exports `think(job)` and perhaps `warm()`. */
  brain: URL | string;
  local: LocalBrain<Job>;
  /** How many workers. */
  size: number;
  /** The longest a think may run in a worker (ms) before it is abandoned. */
  ceilingMs: number;
  /** Whether each worker runs the brain's `warm()` as it starts (it takes no jobs until that's done). Default true. */
  warm?: boolean;
  /** The worker's entry file, if not the one beside this file. */
  entry?: URL | string;
}

export interface BotPoolStats {
  /** Workers alive now. None means every think happens on the main thread. */
  workers: number;
  /** Thinks waiting for a worker. */
  queued: number;
  /** Thinks in a worker now. */
  running: number;
  /** Thinks workers have answered. */
  thinks: number;
  /** How long those took in the worker, the trip there and back included (ms). */
  averageMs: number;
  worstMs: number;
  /** The longest any think waited in the queue (ms). */
  worstWaitMs: number;
  /** Thinks given up on at the ceiling (or lost with their worker) and answered with a quick move. */
  abandoned: number;
  /** Thinks whose answer nobody wanted by the time it was their turn, dropped from the queue. */
  dropped: number;
  /** Thinks answered on the main thread because there was no worker to ask. */
  onMain: number;
  /** Ms each worker's warm-up took (see `warm`). */
  warmedMs: number[];
}

interface Queued<Job> {
  id: number;
  job: Job;
  table: string;
  at: number;
  resolve(move: unknown): void;
  reject(error: Error): void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface Hand<Job> {
  worker: Worker;
  /** Up and able to take a job. */
  ready: boolean;
  warming: boolean;
  job: (Queued<Job> & { began: number }) | null;
  ceiling: ReturnType<typeof setTimeout> | null;
  /** Never answered anything yet: a worker that dies like this is a worker that can't start. */
  fresh: boolean;
  gone: boolean;
}

/**
 * A file built beside this one: `dist/<name>.js` when this is the built server, and the same built
 * file when this is the source (under vitest, which runs `src/*.ts`: a worker thread can't, so
 * tests think with the last build, as they already do with the other packages).
 */
export function builtFile(name: string): URL {
  const beside = new URL(`./${name}.js`, import.meta.url);
  return existsSync(fileURLToPath(beside)) ? beside : new URL(`../dist/${name}.js`, import.meta.url);
}

/** A worker that can't start is tried this many times in a row before the pool does without it. */
const START_TRIES = 3;
/** Warming up has a ceiling too, a generous one: a cold simulation on a small, busy host. */
const WARM_CEILING_MS = 120_000;

export function createBotPool<Job>(options: BotPoolOptions<Job>) {
  const entry = options.entry ?? builtFile("botworker");
  const queue: Queued<Job>[] = [];
  const hands: Hand<Job>[] = [];
  const stats = { thinks: 0, totalMs: 0, worstMs: 0, worstWaitMs: 0, abandoned: 0, dropped: 0, onMain: 0, warmedMs: [] as number[] };
  let nextId = 1;
  let closed = false;
  let failedStarts = 0;
  /** Called each time a worker comes up or is given up on, for `ready`. */
  let settled: () => void = () => {};

  function spawn() {
    if (closed) return;
    let worker: Worker;
    try {
      worker = new Worker(entry, { workerData: { brain: String(options.brain) } });
    } catch (e) {
      return cannotStart(e);
    }
    const hand: Hand<Job> = { worker, ready: false, warming: false, job: null, ceiling: null, fresh: true, gone: false };
    hands.push(hand);
    worker.on("message", (message: { ready?: true; warmed?: number; id?: number; move?: unknown; error?: string }) => {
      if (hand.gone) return;
      if (message.ready) {
        failedStarts = 0;
        hand.fresh = false;
        if (options.warm ?? true) {
          hand.warming = true;
          hand.ceiling = setTimeout(() => lose(hand, new Error("it took too long to warm up")), WARM_CEILING_MS);
          worker.postMessage({ warm: true });
        } else hand.ready = true;
        settled();
        pump();
        return rest(hand);
      }
      if (message.warmed !== undefined) {
        if (hand.ceiling) clearTimeout(hand.ceiling);
        hand.ceiling = null;
        hand.warming = false;
        hand.ready = true;
        stats.warmedMs.push(message.warmed);
        pump();
        return rest(hand);
      }
      const job = hand.job;
      if (!job || job.id !== message.id) return;
      release(hand);
      const took = performance.now() - job.began;
      stats.thinks += 1;
      stats.totalMs += took;
      stats.worstMs = Math.max(stats.worstMs, took);
      if (message.error !== undefined) job.reject(new Error(message.error));
      else job.resolve(message.move ?? null);
      pump();
      rest(hand);
    });
    // A worker that throws outside a think, or exits, is gone: whatever it was doing gets a quick answer.
    worker.on("error", (e) => lose(hand, e));
    worker.on("exit", () => lose(hand, new Error("it exited")));
  }

  /**
   * An idle worker never keeps the process from ending (a script that's done, a test run); one that
   * is starting, warming up or thinking does, or its answer would never be heard.
   */
  function rest(hand: Hand<Job>) {
    if (!hand.gone && hand.ready && !hand.job) hand.worker.unref();
  }

  function cannotStart(e: unknown) {
    failedStarts += 1;
    if (failedStarts >= START_TRIES) {
      if (failedStarts === START_TRIES) console.error(`bots: a worker thread can't start (${e instanceof Error ? e.message : String(e)}); ${hands.length ? `carrying on with ${hands.length}` : "computer players will think on the main thread"}`);
      settled();
      // With nobody left to ask, whatever is waiting is answered here.
      if (!hands.length) for (const job of queue.splice(0)) answerHere(job);
      return;
    }
    spawn();
  }

  /** The hand is free again. */
  function release(hand: Hand<Job>) {
    if (hand.ceiling) clearTimeout(hand.ceiling);
    hand.ceiling = null;
    if (hand.job?.signal && hand.job.onAbort) hand.job.signal.removeEventListener("abort", hand.job.onAbort);
    hand.job = null;
  }

  /** A worker is lost (it died, or was terminated for running too long): answer its job quickly and put another in its place. */
  function lose(hand: Hand<Job>, why: unknown) {
    if (hand.gone) return;
    hand.gone = true;
    hands.splice(hands.indexOf(hand), 1);
    const job = hand.job;
    const fresh = hand.fresh;
    release(hand);
    void hand.worker.terminate();
    if (closed) return;
    if (job) {
      stats.abandoned += 1;
      console.error(`bots: gave up on a think at table ${job.table} after ${Math.round(performance.now() - job.began)} ms (${why instanceof Error ? why.message : String(why)}); playing a quick move`);
      try {
        job.resolve(options.local.quick(job.job) ?? null);
      } catch (e) {
        job.reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
    if (fresh) cannotStart(why);
    else spawn();
    pump();
  }

  function answerHere(job: Queued<Job>) {
    stats.onMain += 1;
    try {
      job.resolve(options.local.think(job.job) ?? null);
    } catch (e) {
      job.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** Give waiting thinks to idle workers: the oldest first, passing over a table that has one running already. */
  function pump() {
    if (closed) return;
    for (const hand of hands) {
      if (!hand.ready || hand.job || hand.gone) continue;
      const busy = new Set(hands.map((h) => h.job?.table));
      const at = queue.findIndex((q) => !busy.has(q.table));
      if (at < 0) return;
      const job = queue.splice(at, 1)[0]!;
      const began = performance.now();
      stats.worstWaitMs = Math.max(stats.worstWaitMs, began - job.at);
      hand.job = { ...job, began };
      hand.ceiling = setTimeout(() => lose(hand, new Error(`over the ${options.ceilingMs} ms ceiling`)), options.ceilingMs);
      hand.worker.ref();
      hand.worker.postMessage({ id: job.id, job: job.job });
    }
  }

  let up: Promise<void> = Promise.resolve();
  function start() {
    const size = Math.max(0, Math.floor(options.size));
    let waiting = size;
    up = new Promise<void>((done) => {
      settled = () => {
        if (--waiting <= 0) done();
      };
      if (!size) done();
    });
    for (let i = 0; i < size; i++) spawn();
  }
  start();

  return {
    /** Resolves when every worker has started (or been given up on). Thinks can be asked for before then: they wait. */
    get ready() {
      return up;
    },
    /** Whether there is anyone to think but the main thread. */
    get on() {
      return !closed && hands.length > 0;
    },
    /**
     * A think: resolves to the brain's answer for the job. When `signal` aborts before a worker has
     * started on it, it's dropped and resolves null; one that's already running finishes (and its
     * table's next think waits for it).
     */
    think(job: Job, { table, signal }: { table: string; signal?: AbortSignal }): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const queued: Queued<Job> = { id: nextId++, job, table, at: performance.now(), resolve, reject, signal };
        if (closed) return resolve(null);
        if (signal?.aborted) return void ((stats.dropped += 1), resolve(null));
        if (!hands.length) return answerHere(queued);
        queued.onAbort = () => {
          const at = queue.indexOf(queued);
          if (at < 0) return; // already with a worker: let it finish
          queue.splice(at, 1);
          stats.dropped += 1;
          resolve(null);
        };
        signal?.addEventListener("abort", queued.onAbort, { once: true });
        queue.push(queued);
        pump();
      });
    },
    stats(): BotPoolStats {
      return {
        workers: hands.length,
        queued: queue.length,
        running: hands.filter((h) => h.job).length,
        thinks: stats.thinks,
        averageMs: stats.thinks ? Math.round((stats.totalMs / stats.thinks) * 100) / 100 : 0,
        worstMs: Math.round(stats.worstMs * 100) / 100,
        worstWaitMs: Math.round(stats.worstWaitMs * 100) / 100,
        abandoned: stats.abandoned,
        dropped: stats.dropped,
        onMain: stats.onMain,
        warmedMs: [...stats.warmedMs],
      };
    },
    /** Stop every worker. Thinks still waiting or running resolve null: nobody is left to want them. */
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const job of queue.splice(0)) job.resolve(null);
      const going = hands.splice(0);
      for (const hand of going) {
        hand.gone = true;
        const job = hand.job;
        release(hand);
        job?.resolve(null);
      }
      await Promise.all(going.map((h) => h.worker.terminate()));
    },
  };
}

export type BotPool<Job> = ReturnType<typeof createBotPool<Job>>;
