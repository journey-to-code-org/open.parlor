// A table sport in three dimensions. This file is small: it is what SportTable imports. The
// three.js half (scene3d-gl.ts) is only fetched, by `loadSport3d`, once a table is on screen, and
// only where WebGL works. Anywhere else (no WebGL, a table with something the 3-D scene doesn't
// have yet) SportTable keeps drawing the table as it always has, flat on a 2D canvas, and that
// drawing is still what the aim, the streaks and the splashes are drawn with, on top of this one.
import { inShape, within } from "./paint/terrain";
import type { SportView } from "@journey-to-code/games";
import type { Disc } from "./draw";
import type { Projection } from "./projection";

type Table = SportView["table"];

/** Everything one frame of the scene needs: the very things the flat drawing is given. */
export interface Frame3d {
  table: Table;
  discs: Disc[];
  proj: Projection;
  width: number;
  height: number;
  dpr: number;
  /** ms, for what moves by itself (the water, the pennant on the flag, the marker on your ball). */
  time: number;
  /** The person has asked for less motion. */
  still: boolean;
}

export interface Sport3d {
  /** Draw the frame. Returns false when this table can't be drawn here (the caller draws it flat). */
  render(frame: Frame3d): boolean;
  /** Is this table one the scene can draw? */
  supports(table: Table): boolean;
  dispose(): void;
}

/**
 * What the scene can't draw: a patch of ground set lower than the ground it lies in (a lawn at the
 * foot of a raised bed). The scene builds raised ground as solid blocks, and can't cut a dip into
 * one, so a table with such a patch stays flat, and nothing on it is ever in the wrong place.
 * Terraces, steps, slopes that rise and tunnels are all drawn.
 */
export function drawsIn3d(table: Table): boolean {
  const ground = table.look.ground;
  return ground.every((g, i) => {
    if (g.level === undefined) return true;
    const [x, y] = within(g.shape);
    return ground.slice(0, i).every((u) => !inShape(u.shape, x, y) || (u.level ?? 0) <= g.level!);
  });
}

let loading: Promise<typeof import("./scene3d-gl") | null> | null = null;

/** The 3-D scene on `canvas`, or null where it can't be (no WebGL, or no document at all). */
export function loadSport3d(canvas: HTMLCanvasElement): Promise<Sport3d | null> {
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  if (/[?&]flat\b/.test(location.search)) return Promise.resolve(null);
  loading ??= import("./scene3d-gl").catch(() => null);
  return loading.then((m) => m?.build(canvas) ?? null).catch(() => null);
}
