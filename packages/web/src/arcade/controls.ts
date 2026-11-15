// Keys and fingers turned into a pilot's controls for a tick. Each arcade game has its own idea
// of an input, so each has its own controls here; the arcade table asks for the ones that go with
// its game.
import { SKYFIRE_SPEED, type ArcadeGameId, type BulwarkInput, type SkyfireInput, type TowerKind } from "@journey-to-code/games";

export interface ArcadeControls<I> {
  /** What the controls are doing now. Called once a tick: it uses up what a finger has moved since the last. */
  read(): I;
  key(key: string, down: boolean): void;
  /** A finger (or the mouse) on the field: `scale` is field units to a CSS pixel. */
  pointerDown(id: number, x: number, y: number): void;
  pointerMove(id: number, x: number, y: number, scale: number): void;
  pointerUp(id: number): void;
  /** A button on the screen for the game's special move. */
  special(): void;
  /** Let go of everything: the window lost focus, or a new game began. */
  clear(): void;
  /** The name of the special move, for its button; empty when the game has none. */
  specialLabel: string;
  /**
   * For a game that is played by giving orders (building on a grid): queue one. The table turns
   * taps on the field and on the shop into these, going by the view's `build`.
   */
  order?(cmd: string, col?: number, row?: number, key?: string): void;
}

/** A careful pace, with Shift held. */
const SLOW = 30;

/**
 * Shitstorm (skyfire): arrows or WASD to move (Shift to go slowly), Z, Space or J to fire, X, B or K to bomb.
 * A finger drags the ship from wherever it touches, a little further than the finger moves, and a
 * second finger is a bomb. `autofire` keeps the guns going without a key held.
 */
export function skyfireControls(options: { autofire: () => boolean }): ArcadeControls<SkyfireInput> {
  const keys = new Set<string>();
  let finger: { id: number; x: number; y: number } | null = null;
  /** How far the finger has moved that the ship hasn't yet, in field units. */
  let pull = { x: 0, y: 0 };
  let bomb = false;
  return {
    specialLabel: "Bomb",
    read() {
      const pace = keys.has("shift") ? SLOW : SKYFIRE_SPEED;
      let dx = 0;
      let dy = 0;
      if (keys.has("arrowleft") || keys.has("a")) dx -= pace;
      if (keys.has("arrowright") || keys.has("d")) dx += pace;
      if (keys.has("arrowup") || keys.has("w")) dy -= pace;
      if (keys.has("arrowdown") || keys.has("s")) dy += pace;
      if (dx && dy) {
        dx = Math.trunc(dx * 0.7071);
        dy = Math.trunc(dy * 0.7071);
      }
      if (!dx && !dy && (pull.x || pull.y)) {
        const far = Math.hypot(pull.x, pull.y);
        const step = Math.min(far, SKYFIRE_SPEED);
        dx = Math.round((pull.x / far) * step);
        dy = Math.round((pull.y / far) * step);
        pull = { x: Math.abs(pull.x - dx) < 1 ? 0 : pull.x - dx, y: Math.abs(pull.y - dy) < 1 ? 0 : pull.y - dy };
      }
      const input = { dx, dy, fire: options.autofire() || finger !== null || keys.has("z") || keys.has(" ") || keys.has("j"), bomb: bomb || keys.has("x") || keys.has("b") || keys.has("k") };
      bomb = false;
      return input;
    },
    key(key, down) {
      if (down) keys.add(key.toLowerCase());
      else keys.delete(key.toLowerCase());
    },
    pointerDown(id, x, y) {
      if (finger && finger.id !== id) bomb = true;
      else finger = { id, x, y };
    },
    pointerMove(id, x, y, scale) {
      if (!finger || finger.id !== id) return;
      pull.x += (x - finger.x) * scale * 1.25;
      pull.y += (y - finger.y) * scale * 1.25;
      // The ship is never asked to catch up more than a moment's flying.
      const far = Math.hypot(pull.x, pull.y);
      if (far > 900) pull = { x: (pull.x * 900) / far, y: (pull.y * 900) / far };
      finger.x = x;
      finger.y = y;
    },
    pointerUp(id) {
      if (finger?.id !== id) return;
      finger = null;
      pull = { x: 0, y: 0 };
    },
    special() {
      bomb = true;
    },
    clear() {
      keys.clear();
      finger = null;
      pull = { x: 0, y: 0 };
      bomb = false;
    },
  };
}

/**
 * Tower of Ryan (bulwark): nothing is steered. Orders wait in a line and go out one a tick, each with the next
 * number, which is how the game knows an order from the same order still being held.
 */
export function bulwarkControls(): ArcadeControls<BulwarkInput> {
  const waiting: Omit<BulwarkInput, "n">[] = [];
  let last: BulwarkInput = { n: 0, cmd: "none", col: 0, row: 0, kind: "dart" };
  return {
    specialLabel: "",
    read() {
      const next = waiting.shift();
      if (next) last = { ...next, n: last.n + 1 };
      return last;
    },
    order(cmd, col = 0, row = 0, key = "dart") {
      if (waiting.length < 8) waiting.push({ cmd: cmd as BulwarkInput["cmd"], col, row, kind: key as TowerKind });
    },
    key() {},
    pointerDown() {},
    pointerMove() {},
    pointerUp() {},
    special() {},
    clear() {
      waiting.length = 0;
    },
  };
}

export function controlsFor(game: ArcadeGameId, options: { autofire: () => boolean }): ArcadeControls<unknown> {
  switch (game) {
    case "skyfire":
      return skyfireControls(options);
    case "bulwark":
      return bulwarkControls();
  }
}
