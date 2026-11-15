// A worker thread of the bot pool (see botpool.ts): imports the brain it's told to and thinks with it,
// one job at a time. Nothing here knows what a game is.
import { parentPort, workerData } from "node:worker_threads";

interface Brain {
  think(job: unknown): unknown;
  warm?(): unknown;
}

if (!parentPort) throw new Error("botworker.js is a worker thread of the bot pool; nothing runs it directly.");
const port = parentPort;
const brain = (await import((workerData as { brain: string }).brain)) as Brain;

port.on("message", (message: { warm?: true; id?: number; job?: unknown }) => {
  if (message.warm) {
    // This thread has its own copy of the engines, as cold as the main thread's was at start.
    const began = performance.now();
    try {
      brain.warm?.();
    } catch (e) {
      console.error("bots: a worker couldn't warm up", e);
    }
    return port.postMessage({ warmed: Math.round(performance.now() - began) });
  }
  try {
    port.postMessage({ id: message.id, move: brain.think(message.job) ?? null });
  } catch (e) {
    port.postMessage({ id: message.id, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
});
port.postMessage({ ready: true });
