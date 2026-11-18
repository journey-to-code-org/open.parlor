// A field game with the graphics card behind it. This file is small: it is what FieldTable
// imports. The three.js half (field3d-gl.ts) is only fetched, by `loadField3d`, once a field is on
// screen, and only where WebGL works. Anywhere else the field is painted as it always was, on a 2D
// canvas, fire and all (draw.ts), and nothing about the game is different.
//
// What the graphics card adds is light and number: a blast lights the land, the tanks and the
// smoke round it; the air bends in a ring going out from it; fire glows; and there are thousands
// of sparks and bits of earth where the 2D canvas has hundreds. The picture itself (sky, land,
// tanks, shells) is still the painter's: it is handed over as it is, and lit.
import type { Fx } from "./fx";

/** Everything one frame needs. */
export interface Frame3d {
  /** The world as the painter painted it, without fire or shake: the picture to light. */
  world: HTMLCanvasElement;
  /** The canvas's size in CSS pixels, and how many of the screen's pixels each is. */
  width: number;
  height: number;
  dpr: number;
  fx: Fx;
  /** Where a point of the field is on the canvas, in CSS pixels, and how big a unit of it is. */
  x: (wx: number) => number;
  y: (wy: number) => number;
  scale: number;
}

export interface Field3d {
  /** Draw the frame. Returns false when it couldn't (the caller paints it flat from then on). */
  render(frame: Frame3d): boolean;
  dispose(): void;
}

let loading: Promise<typeof import("./field3d-gl") | null> | null = null;

/** The lit field on `canvas`, or null where it can't be (no WebGL, less motion asked for, or `?flat` in the address). */
export function loadField3d(canvas: HTMLCanvasElement): Promise<Field3d | null> {
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  if (/[?&]flat\b/.test(location.search)) return Promise.resolve(null);
  loading ??= import("./field3d-gl").catch(() => null);
  return loading.then((m) => m?.build(canvas) ?? null).catch(() => null);
}
