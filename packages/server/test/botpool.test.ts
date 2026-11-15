// The bot pool on its own, with a deliberately slow fake game (test/fixtures/slowbrain.mjs): the
// queue, the ceiling and its quick move, workers that can't start, and stopping.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBotPool, type BotPool } from "../src/botpool.js";

interface Job {
  n?: number;
  spin?: number;
  boom?: boolean;
  none?: boolean;
}
const brain = new URL("./fixtures/slowbrain.mjs", import.meta.url);
const local = {
  think: (job: Job) => (job.none ? null : { played: job.n ?? 0, by: "main" }),
  quick: (job: Job) => ({ played: job.n ?? 0, by: "quick" }),
};

let pools: BotPool<Job>[] = [];
afterEach(async () => {
  await Promise.all(pools.map((p) => p.close()));
  pools = [];
  vi.restoreAllMocks();
});
function pool(size: number, ceilingMs = 5000, extra: { warm?: boolean; entry?: URL; brain?: URL } = {}) {
  const made = createBotPool<Job>({ brain, local, size, ceilingMs, warm: false, ...extra });
  pools.push(made);
  return made;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the bot pool", () => {
  it("thinks in a worker thread and counts what it did", async () => {
    const p = pool(2);
    await p.ready;
    expect(p.on).toBe(true);
    expect(await p.think({ n: 4 }, { table: "a" })).toEqual({ played: 4, by: "think" });
    expect(await p.think({ none: true }, { table: "a" })).toBeNull();
    expect(p.stats()).toMatchObject({ workers: 2, queued: 0, running: 0, thinks: 2, abandoned: 0, onMain: 0 });
    expect(p.stats().worstMs).toBeGreaterThan(0);
  });

  it("takes thinks before its workers are up: they wait", async () => {
    const p = pool(1);
    expect(await p.think({ n: 1 }, { table: "a" })).toEqual({ played: 1, by: "think" });
  });

  it("warms each worker before giving it work", async () => {
    const p = pool(2, 5000, { warm: true });
    expect(await p.think({ n: 1 }, { table: "a" })).toEqual({ played: 1, by: "think" });
    for (let i = 0; i < 50 && p.stats().warmedMs.length < 2; i++) await sleep(20);
    expect(p.stats().warmedMs).toHaveLength(2);
    expect(Math.min(...p.stats().warmedMs)).toBeGreaterThanOrEqual(15);
  });

  it("abandons a think that runs past the ceiling: the seat gets a quick move, the worker is replaced", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const p = pool(1, 150);
    await p.ready;
    const began = performance.now();
    // A runaway search, and another table's think waiting behind it for the only worker.
    const runaway = p.think({ n: 1, spin: 60_000 }, { table: "a" });
    const waiting = p.think({ n: 2 }, { table: "b" });
    expect(await runaway).toEqual({ played: 1, by: "quick" });
    expect(performance.now() - began).toBeGreaterThanOrEqual(140);
    expect(performance.now() - began).toBeLessThan(2000);
    // The table behind it wasn't hung: a fresh worker answered.
    expect(await waiting).toEqual({ played: 2, by: "think" });
    expect(p.stats()).toMatchObject({ workers: 1, abandoned: 1, thinks: 1, queued: 0, running: 0 });
    expect(said).toHaveBeenCalledWith(expect.stringContaining("gave up on a think at table a"));
    // And the pool carries on.
    expect(await p.think({ n: 3 }, { table: "a" })).toEqual({ played: 3, by: "think" });
  });

  it("never lets one table hold two workers, so a busy table can't starve the others", async () => {
    const p = pool(2);
    await p.ready;
    const order: string[] = [];
    const note = (name: string) => () => void order.push(name);
    // Table a asks three times over (dropping nothing); table b asks once, last.
    const a1 = p.think({ spin: 120 }, { table: "a" }).then(note("a1"));
    const a2 = p.think({ spin: 120 }, { table: "a" }).then(note("a2"));
    const a3 = p.think({ spin: 120 }, { table: "a" }).then(note("a3"));
    const b = p.think({ spin: 10 }, { table: "b" }).then(note("b"));
    await sleep(30);
    // One of a's is running; b went straight to the other worker, past a's queue.
    expect(p.stats()).toMatchObject({ queued: 2 });
    await Promise.all([a1, a2, a3, b]);
    expect(order).toEqual(["b", "a1", "a2", "a3"]);
    expect(p.stats().worstWaitMs).toBeGreaterThan(200);
  });

  it("serves tables in the order they asked", async () => {
    const p = pool(1);
    await p.ready;
    const order: string[] = [];
    await Promise.all(["a", "b", "c", "d"].map((table) => p.think({ spin: 15 }, { table }).then(() => void order.push(table))));
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("drops a waiting think nobody wants any more", async () => {
    const p = pool(1);
    await p.ready;
    const running = p.think({ n: 1, spin: 80 }, { table: "a" });
    const stop = new AbortController();
    const unwanted = p.think({ n: 2 }, { table: "b", signal: stop.signal });
    stop.abort();
    expect(await unwanted).toBeNull();
    expect(await running).toEqual({ played: 1, by: "think" });
    expect(p.stats()).toMatchObject({ thinks: 1, dropped: 1, queued: 0 });
    // One that was already unwanted when it was asked for is never queued at all.
    expect(await p.think({ n: 3 }, { table: "c", signal: stop.signal })).toBeNull();
    expect(p.stats().dropped).toBe(2);
  });

  it("passes on an engine's error without losing the worker", async () => {
    const p = pool(1);
    await p.ready;
    await expect(p.think({ boom: true }, { table: "a" })).rejects.toThrow("the engine fell over");
    expect(await p.think({ n: 5 }, { table: "a" })).toEqual({ played: 5, by: "think" });
    expect(p.stats()).toMatchObject({ workers: 1, abandoned: 0 });
  });

  it("thinks on the main thread when it has no workers", async () => {
    const p = pool(0);
    await p.ready;
    expect(p.on).toBe(false);
    expect(await p.think({ n: 9 }, { table: "a" })).toEqual({ played: 9, by: "main" });
    expect(p.stats()).toMatchObject({ workers: 0, thinks: 0, onMain: 1 });
  });

  it("falls back to the main thread when its workers can't start", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    // No such worker file: every start fails.
    const p = pool(2, 5000, { entry: new URL("./fixtures/no-such-worker.mjs", import.meta.url) });
    // A think asked for before that's known waits, then is answered here.
    const early = p.think({ n: 1 }, { table: "a" });
    await p.ready;
    expect(await early).toEqual({ played: 1, by: "main" });
    expect(p.on).toBe(false);
    expect(await p.think({ n: 2 }, { table: "a" })).toEqual({ played: 2, by: "main" });
    expect(p.stats()).toMatchObject({ workers: 0, onMain: 2 });
    expect(said).toHaveBeenCalledWith(expect.stringContaining("can't start"));
  });

  it("falls back to the main thread when the workers can't load the brain", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const p = pool(1, 5000, { brain: new URL("./fixtures/no-such-brain.mjs", import.meta.url) });
    await p.ready;
    expect(p.on).toBe(false);
    expect(await p.think({ n: 2 }, { table: "a" })).toEqual({ played: 2, by: "main" });
  });

  it("stops: its workers go, and thinks still out resolve to nothing", async () => {
    const p = pool(1);
    await p.ready;
    const running = p.think({ n: 1, spin: 5000 }, { table: "a" });
    const waiting = p.think({ n: 2 }, { table: "b" });
    await sleep(20);
    const began = performance.now();
    await p.close();
    expect(performance.now() - began).toBeLessThan(1000); // it didn't wait for the think
    expect(await running).toBeNull();
    expect(await waiting).toBeNull();
    expect(p.on).toBe(false);
    expect(p.stats().workers).toBe(0);
    expect(await p.think({ n: 3 }, { table: "a" })).toBeNull();
  });
});
