// The chips of a table played for them, as solid chips. This file is small: it is what the card
// table imports. The three.js half (chips3d-gl.ts) is only fetched, by `loadChips3d`, once a table
// with chips on it is on screen, and only where WebGL works. Anywhere else the chips are the ones
// drawn in CSS (Chips.tsx), which are also what says where every stack goes: the scene draws one
// stack of real chips exactly where each CSS stack stands, on one see-through canvas over the table.

/** How far the chips are tipped towards you from side-on, in degrees: about what the CSS chips are drawn at. */
export const CHIP_TILT = 30;
/** A chip's thickness, as a share of its width: thicker than a real one, so a small stack still reads as one. */
export const CHIP_THICK = 0.15;

/** One stack of chips of a kind, where it stands on the canvas in CSS pixels. */
export interface Stack3d {
  /** The same stack from frame to frame (the element it stands in for), so a chip added to it can be dropped on. */
  id: object;
  /** The middle of the stack's foot across, and the nearest point of its bottom chip down. */
  x: number;
  y: number;
  /** A chip's width. */
  width: number;
  count: number;
  colour: string;
  inset: string;
  /** Chips put here arrive (a bet, the pot): a stack someone simply has is just there. */
  drops: boolean;
  /** What a chip of it is worth, said on its face when the set's mark is its value. */
  value: number;
  /** The set's look (chip-design.ts): how its edge is cut, what is in the middle, what it is made of. */
  edge: string;
  mark: string;
  finish: string;
}

export interface ChipsFrame3d {
  stacks: Stack3d[];
  /** The canvas's size on the page in CSS pixels, and the screen's pixels to one of them. */
  width: number;
  height: number;
  dpr: number;
  /** ms. */
  time: number;
  /** The person has asked for less motion: chips are put where they go. */
  still: boolean;
}

export interface Chips3d {
  /** Draw the frame. "busy" while a chip is still falling (ask again next frame); null when it can't be drawn here. */
  render(frame: ChipsFrame3d): "busy" | "idle" | null;
  dispose(): void;
}

let loading: Promise<{ build(canvas: HTMLCanvasElement): Chips3d | null } | null> | null = null;

/** The chips on `canvas`, or null where they can't be (no WebGL, or no document at all). */
export function loadChips3d(canvas: HTMLCanvasElement): Promise<Chips3d | null> {
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  if (/[?&]flat\b/.test(location.search)) return Promise.resolve(null);
  loading ??= import("./chips3d-gl").catch(() => null);
  return loading.then((m) => m?.build(canvas) ?? null).catch(() => null);
}

/** How far up its stack a chip is: the middle of chip `k`, in chip widths. */
export const chipHeight = (k: number) => (k + 0.5) * CHIP_THICK;
/** Where a chip put down `since` ms ago is on its way to its place: 1 just let go, 0 landed. A chip higher up lets go a little later. */
export function dropLeft(since: number, k: number): number {
  const t = (since - k * 28) / 240;
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return (1 - t) * (1 - t);
}
