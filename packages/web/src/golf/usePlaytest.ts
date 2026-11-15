// The editors' playtests: each hole (or the lane) is played by the computer in a worker once
// painting stops for a moment, and the answer is kept until the hole changes again.
import type { CustomHole, CustomLane, HoleTest, LaneTest } from "@open-parlor/courses";
import { useEffect, useState } from "react";

let worker: Worker | null = null;
let asked = 0;
const waiting = new Map<number, (result: unknown) => void>();
const known = new Map<string, unknown>();

function play<T>(kind: "minigolf" | "bowling", item: CustomHole | CustomLane): Promise<T> {
  const key = `${kind}:${item.cols}x${item.rows}:${item.cells}`;
  if (known.has(key)) return Promise.resolve(known.get(key) as T);
  if (!worker) {
    worker = new Worker(new URL("./playtest.worker.ts", import.meta.url), { type: "module", name: "open-parlor-playtest" });
    worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      waiting.get(data.id)?.(data.result ?? null);
      waiting.delete(data.id);
    };
  }
  const id = ++asked;
  return new Promise<T>((resolve) => {
    waiting.set(id, (result) => {
      if (result) known.set(key, result);
      resolve(result as T);
    });
    worker!.postMessage({ id, kind, item });
  });
}

/** How the computer gets on with these: null while it's playing them (or hasn't been asked yet). */
export function usePlaytests<T extends HoleTest | LaneTest>(kind: "minigolf" | "bowling", items: (CustomHole | CustomLane | null)[]): (T | null)[] {
  const keys = items.map((i) => (i ? `${i.cols}x${i.rows}:${i.cells}` : "")).join("|");
  const [results, setResults] = useState<Record<string, T>>({});
  useEffect(() => {
    let live = true;
    const wait = setTimeout(() => {
      for (const item of items) {
        if (!item) continue;
        void play<T>(kind, item).then((r) => {
          if (live && r) setResults((was) => ({ ...was, [`${item.cols}x${item.rows}:${item.cells}`]: r }));
        });
      }
    }, 450);
    return () => {
      live = false;
      clearTimeout(wait);
    };
    // The items are named by `keys`: a new array with the same holes is the same ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, keys]);
  return items.map((i) => (i ? (results[`${i.cols}x${i.rows}:${i.cells}`] ?? null) : null));
}
