// The editors' playtests: each hole (or the lane) is played by the computer in a worker, and the
// answer is kept until the hole changes again. Plain TypeScript, so any framework's editor can ask;
// playtests.svelte.ts is the Svelte editors' way in.
import type { CustomHole, CustomLane } from "@open-parlor/courses";

let worker: Worker | null = null;
let asked = 0;
const waiting = new Map<number, (result: unknown) => void>();
const known = new Map<string, unknown>();

/** What a playtest is kept under: the grid alone, since a name or a par doesn't change how it plays. */
export const playtestKey = (item: CustomHole | CustomLane) => `${item.cols}x${item.rows}:${item.cells}`;

/** The computer plays a hole or a lane, off the page's thread. Null if the worker couldn't. */
export function playtest<T>(kind: "minigolf" | "bowling", item: CustomHole | CustomLane): Promise<T | null> {
  const key = `${kind}:${playtestKey(item)}`;
  if (known.has(key)) return Promise.resolve(known.get(key) as T);
  if (!worker) {
    worker = new Worker(new URL("./playtest.worker.ts", import.meta.url), { type: "module", name: "open-parlor-playtest" });
    worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      waiting.get(data.id)?.(data.result ?? null);
      waiting.delete(data.id);
    };
  }
  const id = ++asked;
  return new Promise<T | null>((resolve) => {
    waiting.set(id, (result) => {
      if (result) known.set(key, result);
      resolve(result as T | null);
    });
    // A plain copy: what an editor holds may be a framework's proxy, which a worker can't be sent.
    worker!.postMessage({ id, kind, item: { ...item } });
  });
}
