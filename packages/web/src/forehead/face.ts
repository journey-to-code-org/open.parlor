// Where a card goes on a forehead: the sums, apart from the camera and the face detector, so they
// can be tested on their own.
//
// Each player's own browser finds their face (tracker.ts) and sends the others where their forehead
// is, as a `Pose`: four numbers, in the camera's own picture, not mirrored. The others place the
// card on that player's tile from it. No picture of anyone's face is sent anywhere for this.

/**
 * A forehead: the middle of its bottom edge, just above the eyebrows (x, y), and its width (w), as
 * fractions of the camera's picture, and its tilt (a, in radians). A card stands on that edge, so
 * however big its writing has to be to read, it grows up the forehead and never over the eyes.
 */
export interface Pose {
  x: number;
  y: number;
  w: number;
  a: number;
}
export interface Point {
  x: number;
  y: number;
}

/** How far above the eyes the eyebrows are, in eye-widths (the distance between the eyes). */
export const ABOVE_EYES = 0.45;
/** How wide a forehead is, in eye-widths. */
export const ACROSS = 2.2;

/**
 * The forehead, from the two eyes as the detector gives them (fractions of a picture `width` by
 * `height`). The first eye is the person's right, which is on the left of an unmirrored picture.
 */
export function foreheadOf(right: Point, left: Point, width: number, height: number): Pose | null {
  const dx = (left.x - right.x) * width;
  const dy = (left.y - right.y) * height;
  const apart = Math.hypot(dx, dy);
  if (!(apart > 0) || !(width > 0) || !(height > 0)) return null;
  // "Up" from the eyes: square to the line between them, toward the top of the head.
  const up = { x: dy / apart, y: -dx / apart };
  const middle = { x: ((right.x + left.x) / 2) * width, y: ((right.y + left.y) / 2) * height };
  return {
    x: (middle.x + up.x * ABOVE_EYES * apart) / width,
    y: (middle.y + up.y * ABOVE_EYES * apart) / height,
    w: (ACROSS * apart) / width,
    a: Math.atan2(dy, dx),
  };
}

/** Half way (or `k` of the way) from one pose to the next: the card glides rather than shakes. */
export function settle(was: Pose | null, now: Pose, k = 0.5): Pose {
  if (!was) return now;
  // Tilts are compared the short way round.
  let turn = now.a - was.a;
  if (turn > Math.PI) turn -= 2 * Math.PI;
  if (turn < -Math.PI) turn += 2 * Math.PI;
  return { x: was.x + (now.x - was.x) * k, y: was.y + (now.y - was.y) * k, w: was.w + (now.w - was.w) * k, a: was.a + turn * k };
}

/** Whether two poses differ by enough to be worth sending. */
export const moved = (a: Pose | null, b: Pose | null, by = 0.004): boolean =>
  !a || !b ? a !== b : Math.abs(a.x - b.x) > by || Math.abs(a.y - b.y) > by || Math.abs(a.w - b.w) > by || Math.abs(a.a - b.a) > by * 5;

/** A pose for the wire: four numbers to three places, or null for no face. */
export const packPose = (p: Pose | null): [number, number, number, number] | null => (p ? [p.x, p.y, p.w, p.a].map((n) => Math.round(n * 1000) / 1000) as [number, number, number, number] : null);

/** A pose off the wire, if it is one: anything else counts as no face. */
export function unpackPose(raw: unknown): Pose | null {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x, y, w, a] = raw as number[];
  if (x! < -0.5 || x! > 1.5 || y! < -0.5 || y! > 1.5 || w! <= 0 || w! > 1.5 || Math.abs(a!) > Math.PI + 0.01) return null;
  return { x: x!, y: y!, w: w!, a: a! };
}

/** A card's place on a tile: the middle of its bottom edge and its width, as fractions of the tile, and its tilt in radians. */
export interface Placed {
  left: number;
  top: number;
  width: number;
  angle: number;
}

/**
 * Where a pose falls on a tile that shows the picture as `object-fit: cover` does: scaled to fill
 * the tile and cut to fit. `picture` and `tile` are width over height. A mirrored tile (your own)
 * is flipped side to side, and so is the tilt. The card is kept on the tile, so a card on a head at
 * the edge of the picture is still there to read.
 */
export function onTile(pose: Pose, picture: number, tile: number, mirror = false): Placed {
  const sx = Math.max(1, picture / tile);
  const sy = Math.max(1, tile / picture);
  const x = mirror ? 1 - pose.x : pose.x;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  return {
    left: clamp((x - 0.5) * sx + 0.5, 0.12, 0.88),
    // Low enough to leave room for the card above it.
    top: clamp((pose.y - 0.5) * sy + 0.5, 0.32, 0.9),
    width: pose.w * sx,
    angle: mirror ? -pose.a : pose.a,
  };
}
