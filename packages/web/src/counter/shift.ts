// A shift at Delbie's Counter, as it is played in this browser: the game from open.games, stepped
// ten times a second, with the commands the screen sends carried out one a tick. It is plain
// TypeScript and knows nothing of the page's framework: the screen (Counter.vue) subscribes to it,
// and so could any other.
import { delbiesCounter, recorder, type ArcadeEvent, type ArcadeLog, type ArcadeSummary, type ArcadeView, type CounterInput } from "@journey-to-code/games";
import type { ArcadeRules } from "../storage";

export type CounterCommand = Partial<Omit<CounterInput, "n">> & { do: CounterInput["do"] };
export interface Shift {
  view(): ArcadeView;
  /** Called after every tick with what the counter looks like now and what just happened. Returns how to stop listening. */
  subscribe(listener: (view: ArcadeView, events: readonly ArcadeEvent[]) => void): () => void;
  /** Have something done. Commands are carried out in order, one a tick. */
  send(command: CounterCommand): void;
  stop(): void;
}
export interface ShiftEnd { summary: ArcadeSummary; log: ArcadeLog<unknown>; rules: ArcadeRules }

export function startShift(rules: ArcadeRules, seed: number, onEnd: (end: ShiftEnd) => void): Shift {
  const game = delbiesCounter;
  const normal = game.normalize(rules);
  const state = game.newGame(normal, 1, seed);
  const rec = recorder(game, 1);
  const listeners = new Set<(view: ArcadeView, events: readonly ArcadeEvent[]) => void>();
  const waiting: CounterCommand[] = [];
  let held: CounterInput = game.idle;
  let n = 0;
  let last = performance.now();
  let owed = 0;
  const tickMs = 1000 / game.rate;

  const timer = setInterval(() => {
    const now = performance.now();
    // A page that is hidden waits: the line does not move while nobody can see it.
    owed = document.hidden ? 0 : Math.min(owed + now - last, tickMs * 5);
    last = now;
    while (owed >= tickMs) {
      owed -= tickMs;
      const next = waiting.shift();
      // A command goes out with a new number; with nothing to do, the last input is held as it was.
      if (next) held = game.input({ ...game.idle, ...next, n: ++n });
      game.step(state, rec.tick([held]));
      const view = game.view(state);
      for (const listener of listeners) listener(view, state.events);
      if (view.over) {
        clearInterval(timer);
        onEnd({ summary: game.summary(state), log: rec.log, rules: normal as unknown as ArcadeRules });
        return;
      }
    }
  }, tickMs / 2);

  return {
    view: () => game.view(state),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: (command) => void waiting.push(command),
    stop: () => clearInterval(timer),
  };
}
