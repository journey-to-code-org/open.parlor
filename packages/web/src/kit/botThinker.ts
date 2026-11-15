// Thinking off the page's main thread, for practice games: one Web Worker, started the first time a
// heavy think is wanted (see `TableGame.heavy`), that runs the same `botMove` the page would.
//
// The rules are the server's (packages/server/src/botpool.ts): a think that runs past the ceiling is
// abandoned (the worker is terminated and a new one started) and the seat gets a quick move, and if
// there can be no worker (an old browser, a page whose security policy forbids them, a worker file
// that won't load) every think simply happens on the page, as it always did.
import type { KitGameId, ThinkBudget } from "@journey-to-code/games";
import { coursesFor } from "../golf/coursesApi";
import { botMove, quickMove, type BotJob } from "./botMove";

/** What a game that thinks by the clock is told it may take, and how long before the table gives up on it. */
export const THINK_BUDGET: ThinkBudget = { ms: 2000 };
export const THINK_CEILING_MS = 6000;

type Move = Record<string, unknown> | null;
interface Waiting {
  job: BotJob;
  resolve(move: Move): void;
  reject(error: Error): void;
  ceiling: ReturnType<typeof setTimeout>;
}

/** undefined: not started yet. null: there can't be one here. */
let worker: Worker | null | undefined;
const waiting = new Map<number, Waiting>();
let nextId = 1;

function start(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const made = new Worker(new URL("./bot.worker.ts", import.meta.url), { type: "module", name: "card-room-bots" });
    made.onmessage = ({ data }: MessageEvent<{ id: number; move?: Move; error?: string }>) => {
      const asked = waiting.get(data.id);
      if (!asked) return;
      waiting.delete(data.id);
      clearTimeout(asked.ceiling);
      if (data.error !== undefined) asked.reject(new Error(data.error));
      else asked.resolve(data.move ?? null);
    };
    // It couldn't load, or fell over: no more workers on this page. Whatever was waiting is thought out here.
    made.onerror = (event) => {
      event.preventDefault?.();
      if (worker === made) worker = null;
      made.terminate();
      for (const [id, asked] of [...waiting]) {
        waiting.delete(id);
        clearTimeout(asked.ceiling);
        here(asked);
      }
    };
    worker = made;
  } catch {
    worker = null;
  }
  return worker;
}

function here(asked: Pick<Waiting, "job" | "resolve" | "reject">) {
  try {
    asked.resolve(botMove(asked.job));
  } catch (e) {
    asked.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * A bot's move, worked out in the worker: a promise of exactly what `botMove(job)` gives. Null when
 * there's no worker to ask, and the caller should think for itself.
 */
export function thinkElsewhere(job: BotJob): Promise<Move> | null {
  const to = start();
  if (!to) return null;
  return new Promise<Move>((resolve, reject) => {
    const id = nextId++;
    const ceiling = setTimeout(() => {
      // A runaway think: stop it for good (the next think starts a new worker) and play something now.
      waiting.delete(id);
      if (worker === to) worker = undefined;
      to.terminate();
      // Anything else that was waiting on that worker is asked again of the new one.
      for (const [other, asked] of [...waiting]) {
        waiting.delete(other);
        clearTimeout(asked.ceiling);
        const again = thinkElsewhere(asked.job);
        if (again) again.then(asked.resolve, asked.reject);
        else here(asked);
      }
      try {
        resolve(quickMove(job));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }, THINK_CEILING_MS);
    waiting.set(id, { job, resolve, reject, ceiling });
    // A course people made goes with the think: the worker's copy of the game only knows the built-in ones.
    const courses = coursesFor(job.state);
    to.postMessage({ id, job: courses.length ? { ...job, courses } : job });
  });
}

/** Start the worker and get a game's engine warm in it, ahead of its first think. */
export function warmThinker(game: KitGameId) {
  start()?.postMessage({ warm: game });
}
