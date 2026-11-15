// Three-dimensional dice. This file is small: it is what `Dice` imports. The three.js half
// (dice3d-gl.ts) is only fetched, by `loadDice3d`, once a table with dice is on screen, and only
// where WebGL works; anywhere else `Dice` keeps drawing its flat CSS dice, which are still the ones
// a screen reader and the keyboard deal with.
export interface DiePalette {
  body: string;
  pip: string;
  /** A one is red on the light dice, as on a real set. */
  one: string;
}
export const LIGHT: DiePalette = { body: "#f7efdc", pip: "#1d1812", one: "#b3261e" };
export const DARK: DiePalette = { body: "#5a2a22", pip: "#fffdf6", one: "#fffdf6" };

export interface Die3d {
  /** Show this face up (null leaves the die as it is). */
  show(value: number): void;
  /** Spin and land on `value` after `ms`; `delay` staggers a set of dice. */
  tumble(value: number, ms: number, delay?: number): void;
  setPalette(palette: DiePalette): void;
  dispose(): void;
}
export interface Dice3d {
  create(canvas: HTMLCanvasElement, palette: DiePalette): Die3d;
}


let loading: Promise<Dice3d | null> | null = null;

/** The 3-D dice, or null where they can't be drawn (no WebGL, or no document at all). */
export function loadDice3d(): Promise<Dice3d | null> {
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  return (loading ??= import("./dice3d-gl").then((m) => m.build()).catch(() => null));
}
