// The practice table's bot worker: a Web Worker that thinks for the computer players, so a search or
// a simulation doesn't freeze the page while it runs (see botThinker.ts). The engines are plain
// TypeScript with no page in them, so they run here as they are.
import { kitGame, type KitGameId } from "@cardroom/games";
import { botMove, type BotJob } from "./botMove";

type Asked = { id: number; job: BotJob } | { warm: KitGameId };
const scope = self as unknown as { onmessage: ((event: MessageEvent<Asked>) => void) | null; postMessage(message: unknown): void };

scope.onmessage = ({ data }) => {
  if ("warm" in data) {
    // This thread has its own copy of the engine, and it starts cold.
    try {
      (kitGame(data.warm) as { warmUp?(): void } | undefined)?.warmUp?.();
    } catch {}
    return;
  }
  try {
    scope.postMessage({ id: data.id, move: botMove(data.job) });
  } catch (e) {
    scope.postMessage({ id: data.id, error: e instanceof Error ? e.message : String(e) });
  }
};
