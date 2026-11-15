// Where a point of a table lands on the screen, and back again. A table sport is drawn as a model
// looked down on from the south at an angle: the plan is kept as it is (left is left, and up the
// screen is away from you), distances away from you are foreshortened, and anything with height
// rises straight up the screen, so it shows its top and the face towards you. That is a camera
// tilted back from straight overhead by `tilt`, with no perspective: a ball is the same size
// wherever it lies, and parallel rails stay parallel.
//
// Everything that draws or reads the pointer goes through this file, so the screen and the thumb
// can never disagree about where the ground is. With `tilt` at nothing it is the plain view from
// straight above.
//
// A table that fits the screen better on its side is turned before it is looked at: the camera
// always looks up the screen, and it is the world that turns under it. "The camera's frame" below
// means the world after that turn: x to the right, y towards the camera, z up.
import type { Point } from "@journey-to-code/physics";

export interface Projection {
  /** CSS pixels to one unit of the world. */
  scale: number;
  /** Where the world's origin (on the ground) lands, in CSS pixels. */
  ox: number;
  oy: number;
  /** Quarter turns clockwise that the world is turned through before it is looked at. */
  turn: number;
  /** How far the camera is tipped back from straight overhead, in radians. Nothing: seen from above. */
  tilt: number;
}

/** The tilt a table is seen at unless someone asks for the view from above: about 40°. */
export const TILT = 0.7;

/** How much of a length running away from the camera is left on the screen. */
export const depthOf = (p: Pick<Projection, "tilt">) => Math.cos(p.tilt);
/** How far up the screen one unit of height goes, in units of the ground. */
export const riseOf = (p: Pick<Projection, "tilt">) => Math.sin(p.tilt);

// A quarter turn is exact, so a table on its side has no rounding in it.
function turnOf(turn: number): [cos: number, sin: number] {
  const q = ((turn % 4) + 4) % 4;
  if (q === 0) return [1, 0];
  if (q === 1) return [0, 1];
  if (q === 2) return [-1, 0];
  if (q === 3) return [0, -1];
  return [Math.cos((turn * Math.PI) / 2), Math.sin((turn * Math.PI) / 2)];
}

/** A point (or a direction) of the world, in the camera's frame. */
export function toCamera(turn: number, x: number, y: number): Point {
  const [c, s] = turnOf(turn);
  return [x * c - y * s, x * s + y * c];
}
/** And back: a point of the camera's frame, in the world. */
export function fromCamera(turn: number, x: number, y: number): Point {
  const [c, s] = turnOf(turn);
  return [x * c + y * s, -x * s + y * c];
}

/** Where a point of the world, `z` above the ground, is on the screen (CSS pixels). */
export function project(p: Projection, x: number, y: number, z = 0): Point {
  const [cx, cy] = toCamera(p.turn, x, y);
  return [p.ox + cx * p.scale, p.oy + (cy * depthOf(p) - z * riseOf(p)) * p.scale];
}

/** The point of the world that is under a point of the screen, on ground `z` high. */
export function unproject(p: Projection, sx: number, sy: number, z = 0): Point {
  const cx = (sx - p.ox) / p.scale;
  const cy = ((sy - p.oy) / p.scale + z * riseOf(p)) / depthOf(p);
  return fromCamera(p.turn, cx, cy);
}

/**
 * A movement across the screen, as the movement along the ground that looks like it: what turns
 * a drag of the thumb into an aim. A drag straight down the screen is a pull straight towards the
 * camera; a slanting one is steeper on the ground than it looks, because the ground is
 * foreshortened.
 */
export function unprojectVector(p: Projection, dx: number, dy: number): Point {
  return fromCamera(p.turn, dx / p.scale, dy / (p.scale * depthOf(p)));
}

/** A direction along the ground, as the direction across the screen it is drawn in. */
export function projectVector(p: Projection, dx: number, dy: number): Point {
  const [cx, cy] = toCamera(p.turn, dx, dy);
  return [cx * p.scale, cy * depthOf(p) * p.scale];
}

/** How much room is kept above the far edge of the frame for things that stand there, in world units of height. */
const HEADROOM = 700;

/** The size of the picture a frame makes, in world units across the screen, when turned so. */
function pictureOf(frame: { x: number; y: number; w: number; h: number }, turn: number, tilt: number) {
  const corners = [toCamera(turn, frame.x, frame.y), toCamera(turn, frame.x + frame.w, frame.y), toCamera(turn, frame.x + frame.w, frame.y + frame.h), toCamera(turn, frame.x, frame.y + frame.h)];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const left = Math.min(...xs);
  const top = Math.min(...ys) * Math.cos(tilt) - HEADROOM * Math.sin(tilt);
  return { left, top, w: Math.max(...xs) - left, h: Math.max(...ys) * Math.cos(tilt) - top };
}

/**
 * The biggest the frame can be drawn in a box, centred. `top` keeps a strip at the top clear (a
 * sign is standing there). If turning the table on its side would show it a good deal bigger
 * (a tall hole on a wide screen, or a wide one on a phone), the world is turned, and then looked
 * at the same way as ever.
 */
export function fitFrame(frame: { x: number; y: number; w: number; h: number }, width: number, height: number, { pad = 4, top = 0, tilt = TILT }: { pad?: number; top?: number; tilt?: number } = {}): Projection {
  const roomW = Math.max(1, width - 2 * pad);
  const roomH = Math.max(1, height - top - 2 * pad);
  const fitted = (turn: number) => {
    const picture = pictureOf(frame, turn, tilt);
    return { turn, picture, scale: Math.max(0.0001, Math.min(roomW / picture.w, roomH / picture.h)) };
  };
  const upright = fitted(0);
  // A wide table on a tall screen is turned so that its left (where a hole's tee is) comes to the
  // bottom; a tall one on a wide screen so that its bottom comes to the left. Seen at an angle a
  // table has a right way up (the tee nearest you, steps and pipes facing you), so it is only
  // turned when that shows it a good deal bigger. A tall hole on a wide screen is foreshortened
  // into the room it has and stays upright; the one wide hole is turned on a phone.
  const sideways = fitted(frame.w > frame.h ? 3 : 1);
  const { turn, picture, scale } = sideways.scale > upright.scale * 1.3 ? sideways : upright;
  const cx = width / 2;
  const cy = top + (height - top) / 2;
  return { scale, turn, tilt, ox: cx - (picture.left + picture.w / 2) * scale, oy: cy - (picture.top + picture.h / 2) * scale };
}

/**
 * The canvas transform that draws in the world's own units on ground `z` high: a circle drawn
 * through it comes out as the ellipse a circle on the ground is seen as.
 */
export function groundMatrix(p: Projection, dpr: number, z = 0): DOMMatrix {
  const [c, s] = turnOf(p.turn);
  const k = depthOf(p);
  const f = p.scale * dpr;
  return new DOMMatrix([f * c, f * k * s, -f * s, f * k * c, p.ox * dpr, (p.oy - z * riseOf(p) * p.scale) * dpr]);
}
