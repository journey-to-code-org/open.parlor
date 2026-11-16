// An arcade game in three dimensions. This file is small: it is what ArcadeTable imports. The
// three.js half (scene3d-gl.ts) is only fetched, by `loadArcade3d`, once a game that has a scene is
// on screen, and only where WebGL works. Anywhere else (no WebGL, a game with no scene yet, the
// classic drawing asked for in the settings) the field is drawn flat on its canvas as it always
// has been (screen.ts), and that canvas is still what lies over this one: the words that float up,
// the banner, the boss's bar and the flash of a hit are drawn there, at the spots this scene says.
import type { ArcadeEvent, ArcadeGameId, ArcadeView } from "@journey-to-code/games";
import type { ArcadePointer } from "./screen";

/** One frame's worth of what the scene is asked to draw. */
export interface ArcadeFrame3d {
  view: ArcadeView;
  /** Ticks drawn so far: what moves by itself goes by this. */
  frame: number;
  /** The canvas's size on the page, in CSS pixels, and the screen's pixels to one of them. */
  width: number;
  height: number;
  dpr: number;
  pointer?: ArcadePointer;
  /** The person has asked for less motion. */
  still: boolean;
}

export interface Arcade3d {
  /** Draw the frame. Returns false when it can't be drawn here (the caller draws it flat). */
  render(frame: ArcadeFrame3d): boolean;
  /** One tick's events, for what flies apart and flashes. Sounds are the flat screen's. */
  hear(events: readonly ArcadeEvent[]): void;
  /** Move the sparks on by a tick. */
  settle(): void;
  reset(): void;
  /** The spot of the field under a point of the canvas (0 to 1 across and down it), on the ground. */
  pick(u: number, v: number): [x: number, y: number] | null;
  /** Where a spot of the field (and a height above it) is drawn, in the field's units across the canvas. */
  project(x: number, y: number, lift?: number): [x: number, y: number];
  dispose(): void;
}

/** The games that have a scene. */
const SCENES = new Set<ArcadeGameId>(["skyfire", "bulwark", "chipstack"]);
export const hasArcade3d = (game: ArcadeGameId) => SCENES.has(game);

let loading: Promise<typeof import("./scene3d-gl") | null> | null = null;

/** The 3-D scene for `game` on `canvas`, or null where it can't be (no WebGL, no scene for the game). */
export function loadArcade3d(canvas: HTMLCanvasElement, game: ArcadeGameId, field: { width: number; height: number }): Promise<Arcade3d | null> {
  if (!hasArcade3d(game)) return Promise.resolve(null);
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  if (/[?&]flat\b/.test(location.search)) return Promise.resolve(null);
  loading ??= import("./scene3d-gl").catch(() => null);
  return loading.then((m) => m?.build(canvas, game, field) ?? null).catch(() => null);
}
