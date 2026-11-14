// Solid things, drawn the way the camera sees them: a top, the faces towards you, each as bright
// as the light makes it. Everything on a table that stands up is built from the few shapes here
// (a block with straight or leaning sides, a drum, a cone, a ball, a mound), so every one of them
// is lit from the same place and throws its shadow the same way.
//
// Positions are in the camera's frame and in world units (see projection.ts); what is drawn is in
// CSS pixels, so a line a pixel wide is a pixel wide whatever the size of the screen.
import type { Point } from "@cardroom/physics";
import { turning, type Ctx } from "./geometry";
import type { Land } from "./terrain";
import { textured, type Texture } from "./textures";

/** What every routine that draws a solid thing is handed. */
export interface Stage {
  ctx: Ctx;
  /** CSS pixels to a world unit. */
  s: number;
  /** How much of a length running away from the camera is left, and how far up the screen a unit of height goes. */
  k: number;
  r: number;
  /** Where a point of the camera's frame is on the screen. */
  at(x: number, y: number, z?: number): Point;
  land: Land;
}

/** A colour, or a texture laid at life size (with its grain turned, or made bigger). */
export type Paint = string | { texture: Texture; turn?: number; zoom?: number };

export function paintOf(st: Stage, paint: Paint, at: Point = [0, 0]): string | CanvasPattern {
  return typeof paint === "string" ? paint : textured(st.ctx, paint.texture, 1, paint.turn ?? 0, paint.zoom ?? 1, at);
}

// ---- The light ------------------------------------------------------------------------------------
// It comes from the upper left and a little behind the table, so tops are bright, the faces
// towards the camera are in shade, and shadows fall to the right and slightly towards you.

/** The way the light travels, in the camera's frame. */
const LIGHT: [number, number, number] = [0.44, 0.3, -0.846];
/** How far along the ground a shadow reaches for each unit of height. */
export const SHADOW: Point = [-LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2]];

/** How brightly a face is lit, from 0 (turned right away) to 1 (a flat top) and a little over. */
export function lit(nx: number, ny: number, nz = 0): number {
  const len = Math.hypot(nx, ny, nz) || 1;
  const towards = -(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / len;
  // Light wraps round a little, as it does out of doors: a face turned away is dim, not black.
  return Math.max(0, (towards + 0.5) / (0.5 - LIGHT[2]));
}

/** White or black at a strength, for lightening and darkening what is already there. */
export const veil = (amount: number) => (amount >= 0 ? `rgba(255, 255, 255, ${Math.min(1, amount)})` : `rgba(0, 0, 0, ${Math.min(1, -amount)})`);
/** The veil for a face lit so brightly: nothing on a top, darker the more it is turned away. */
export const shadeOf = (light: number, depth = 0.46) => veil(-depth * (1 - Math.min(1.25, light)));

const INK = "rgba(24, 14, 4, 0.55)";

// ---- Flat pieces ----------------------------------------------------------------------------------

export function trace(ctx: Ctx, points: Point[]) {
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** One flat face, given by its corners on the screen: painted, veiled, outlined. */
export function face(st: Stage, corners: Point[], paint: Paint, shade: string | null, ink: string | null = INK, anchor?: Point) {
  const { ctx } = st;
  ctx.beginPath();
  trace(ctx, corners);
  ctx.fillStyle = paintOf(st, paint, anchor ?? corners[0]);
  ctx.fill();
  if (shade) {
    ctx.fillStyle = shade;
    ctx.fill();
  }
  if (ink) {
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
}

/** A polygon with its points going clockwise as drawn, so that the outside is on the left of each edge. */
export const clockwise = (points: Point[]): Point[] => (turning(points) >= 0 ? points : [...points].reverse());

// ---- Blocks ----------------------------------------------------------------------------------------

export interface PrismLook {
  side: Paint;
  top: Paint;
  /** How far the top is set in from the foot: the sides lean back by this much. */
  inset?: number;
  /** A veil over the top: a touch of white makes it catch the light. */
  topShade?: number;
  /** How dark the darkest side goes. */
  depth?: number;
  ink?: string | null;
  /** The line round the top, when it isn't the same as round the sides. */
  topInk?: string | null;
  /** Where on the screen its textures are laid from, when it is one piece of something longer and the grain must run on. */
  anchor?: Point;
  /** Sides to leave out, one for each edge of the footprint as given: where a block butts against the next. */
  skip?: boolean[];
}

/**
 * A block: a footprint raised from `z0` to `z1`. Either height may be one number or one for each
 * corner (a rail that climbs a ramp). Returns the corners of its top, in the camera's frame.
 */
export function prism(st: Stage, foot: Point[], z0: number | number[], z1: number | number[], look: PrismLook): Point[] {
  const base = clockwise(foot);
  const flipped = base !== foot;
  const zs = (z: number | number[]) => (typeof z === "number" ? base.map(() => z) : flipped ? [...z].reverse() : z);
  const low = zs(z0);
  const high = zs(z1);
  const top = look.inset ? inset(base, look.inset) : base;
  const n = base.length;
  // Far faces first, so that a near one covers them where the block leans.
  const order = base.map((_, i) => i).sort((a, b) => base[a]![1] + base[(a + 1) % n]![1] - base[b]![1] - base[(b + 1) % n]![1]);
  for (const i of order) {
    const j = (i + 1) % n;
    // Turned round, an edge of the footprint as given runs the other way and is counted from the other end.
    if (look.skip?.[flipped ? (2 * n - 2 - i) % n : i]) continue;
    const quad = [st.at(base[i]![0], base[i]![1], low[i]!), st.at(base[j]![0], base[j]![1], low[j]!), st.at(top[j]![0], top[j]![1], high[j]!), st.at(top[i]![0], top[i]![1], high[i]!)];
    // Seen from behind, or edge on: nothing to draw.
    if (turning(quad) <= 0.5) continue;
    // The way the face looks: out from the foot, and up by as much as it leans.
    const ex = base[j]![0] - base[i]![0];
    const ey = base[j]![1] - base[i]![1];
    const len = Math.hypot(ex, ey) || 1;
    const lean = (look.inset ?? 0) / Math.max(1, (high[i]! + high[j]! - low[i]! - low[j]!) / 2);
    face(st, quad, look.side, shadeOf(lit(ey / len, -ex / len, lean), look.depth), look.ink, look.anchor ?? quad[3]);
  }
  face(st, top.map((p, i) => st.at(p[0], p[1], high[i]!)), look.top, look.topShade ? veil(look.topShade) : null, look.topInk === undefined ? look.ink : look.topInk, look.anchor);
  return flipped ? [...top].reverse() : top;
}

/** A polygon (clockwise) drawn in by `d` all round, its corners mitred. */
export function inset(points: Point[], d: number): Point[] {
  const n = points.length;
  return points.map((p, i) => {
    const a = points[(i + n - 1) % n]!;
    const b = points[(i + 1) % n]!;
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    // Inward is to the right of each edge.
    const n1: Point = [-(p[1] - a[1]) / la, (p[0] - a[0]) / la];
    const n2: Point = [-(b[1] - p[1]) / lb, (b[0] - p[0]) / lb];
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const len = Math.hypot(mx, my) || 1;
    mx /= len;
    my /= len;
    const k = Math.min(2.5, 1 / Math.max(0.05, mx * n1[0] + my * n1[1]));
    return [p[0] + mx * d * k, p[1] + my * d * k];
  });
}

// ---- Round things ---------------------------------------------------------------------------------

/** Light across something round: bright a third of the way in from the left, dark at the right edge. */
function roundness(st: Stage, x: number, w: number, depth = 0.4): CanvasGradient {
  const g = st.ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, "rgba(0, 0, 0, 0.08)");
  g.addColorStop(0.3, "rgba(255, 255, 255, 0.24)");
  g.addColorStop(0.62, `rgba(0, 0, 0, ${depth * 0.45})`);
  g.addColorStop(1, `rgba(0, 0, 0, ${depth})`);
  return g;
}

/** A flat disc lying level: the ellipse a circle on the ground is seen as. */
export function disc(st: Stage, x: number, y: number, z: number, r: number, paint: Paint, ink: string | null = null) {
  const { ctx } = st;
  const [cx, cy] = st.at(x, y, z);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * st.s, Math.max(0.01, r * st.s * st.k), 0, 0, Math.PI * 2);
  ctx.fillStyle = paintOf(st, paint, [cx, cy]);
  ctx.fill();
  if (ink) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
}

/** A drum standing on end from `z0` to `z1`; `r1` makes its top wider or narrower than its foot (a pot, a bucket). */
export function drum(st: Stage, x: number, y: number, r: number, z0: number, z1: number, side: Paint, top: Paint | null, opts: { r1?: number; depth?: number; ink?: string | null } = {}) {
  const { ctx } = st;
  const r1 = opts.r1 ?? r;
  const ink = opts.ink === undefined ? INK : opts.ink;
  const [bx, by] = st.at(x, y, z0);
  const [tx, ty] = st.at(x, y, z1);
  const squash = Math.max(0.01, st.k);
  ctx.beginPath();
  ctx.moveTo(tx - r1 * st.s, ty);
  ctx.lineTo(bx - r * st.s, by);
  ctx.ellipse(bx, by, r * st.s, r * st.s * squash, 0, Math.PI, 0, true);
  ctx.lineTo(tx + r1 * st.s, ty);
  ctx.ellipse(tx, ty, r1 * st.s, r1 * st.s * squash, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = paintOf(st, side, [bx, by]);
  ctx.fill();
  ctx.fillStyle = roundness(st, bx, Math.max(r, r1) * st.s, opts.depth ?? 0.42);
  ctx.fill();
  if (ink) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  if (top) disc(st, x, y, z1, r1, top, ink);
}

/** A cone standing on its base: a hat, a turret's roof. */
export function cone(st: Stage, x: number, y: number, r: number, z0: number, z1: number, colour: string, lean: Point = [0, 0]) {
  const { ctx } = st;
  const [bx, by] = st.at(x, y, z0);
  const [tx, ty] = st.at(x + lean[0], y + lean[1], z1);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx - r * st.s, by);
  ctx.ellipse(bx, by, r * st.s, Math.max(0.01, r * st.s * st.k), 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.fillStyle = roundness(st, bx, r * st.s, 0.4);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** A ball whose middle is at a height: lit from the upper left, with a glint if it shines. */
export function ball(st: Stage, x: number, y: number, z: number, r: number, colour: string, glint = 0, depth = 0.4, ink: string | null = null) {
  const { ctx } = st;
  const [cx, cy] = st.at(x, y, z);
  const R = r * st.s;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.05, cx, cy, R);
  g.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  g.addColorStop(0.45, "rgba(255, 255, 255, 0)");
  g.addColorStop(0.7, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, `rgba(0, 0, 0, ${depth})`);
  ctx.fillStyle = g;
  ctx.fill();
  if (ink) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  if (glint > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${glint})`;
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.36, cy - R * 0.42, R * 0.26, R * 0.16, -0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A mound: round on the ground, rising to `h` in the middle (a cap, a molehill, a tortoise). */
export function mound(st: Stage, x: number, y: number, z: number, r: number, h: number, paint: Paint, depth = 0.42, ink: string | null = INK) {
  const { ctx } = st;
  const [cx, cy] = st.at(x, y, z);
  const rx = r * st.s;
  // The outline of half a ball squashed to this height, seen from where the camera is.
  const up = Math.hypot(h * st.r, r * st.k) * st.s;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, Math.max(0.01, up), 0, Math.PI, Math.PI * 2);
  ctx.ellipse(cx, cy, rx, Math.max(0.01, r * st.s * st.k), 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = paintOf(st, paint, [cx, cy]);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - rx * 0.35, cy - up * 0.55, rx * 0.05, cx, cy - up * 0.1, rx * 1.15);
  g.addColorStop(0, "rgba(255, 255, 255, 0.42)");
  g.addColorStop(0.4, "rgba(255, 255, 255, 0)");
  g.addColorStop(0.7, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, `rgba(0, 0, 0, ${depth})`);
  ctx.fillStyle = g;
  ctx.fill();
  if (ink) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
}

/** A rod from one point in the air to another: a pole, a spout, a handle, a leg. */
export function rod(st: Stage, a: [number, number, number], b: [number, number, number], width: number, colour: string, ink: string | null = INK) {
  const { ctx } = st;
  const p = st.at(...a);
  const q = st.at(...b);
  const w = Math.max(1.2, width * st.s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  if (ink) {
    ctx.lineWidth = w + 1.6;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  ctx.lineWidth = w;
  ctx.strokeStyle = colour;
  ctx.stroke();
  if (w > 2.4) {
    // Round, so a line of light along the side the light is on.
    ctx.beginPath();
    ctx.moveTo(p[0] - w * 0.22, p[1] - w * 0.22);
    ctx.lineTo(q[0] - w * 0.22, q[1] - w * 0.22);
    ctx.lineWidth = w * 0.28;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.stroke();
  }
}

/**
 * A disc standing on edge, facing along the ground the way of `(nx, ny)`: the mouth of a pipe, a
 * wheel. Seen from the side it is a line; facing the camera, an ellipse.
 */
export function upright(st: Stage, x: number, y: number, z: number, r: number, nx: number, ny: number, paint: string, ink: string | null = INK) {
  const { ctx } = st;
  const [cx, cy] = st.at(x, y, z);
  ctx.save();
  // Across the disc along the ground, and straight up.
  ctx.transform(-ny * r * st.s, nx * r * st.s * st.k, 0, -r * st.s * st.r, cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.restore();
  ctx.fillStyle = paint;
  ctx.fill();
  if (ink) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
}

/** The outline on the screen of a ring of points and the same ring somewhere else: what a pipe lying down looks like. */
export function hull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A pipe lying level from one point to another, `r` across: its body, without its ends. */
export function pipe(st: Stage, a: Point, b: Point, z: number, r: number, paint: Paint) {
  const { ctx } = st;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (b[0] - a[0]) / len;
  const ny = (b[1] - a[1]) / len;
  const ring = (c: Point) => {
    const [cx, cy] = st.at(c[0], c[1], z);
    return Array.from({ length: 16 }, (_, i): Point => {
      const t = (i / 16) * Math.PI * 2;
      return [cx + Math.cos(t) * -ny * r * st.s, cy + Math.cos(t) * nx * r * st.s * st.k - Math.sin(t) * r * st.s * st.r];
    });
  };
  const outline = hull([...ring(a), ...ring(b)]);
  ctx.beginPath();
  trace(ctx, outline);
  ctx.fillStyle = paintOf(st, paint, outline[0]);
  ctx.fill();
  // Round: light along the top of it, dark underneath.
  const p = st.at(a[0], a[1], z);
  const up = Math.hypot(r * st.r, r * st.k * nx) * st.s;
  const g = ctx.createLinearGradient(0, p[1] - up, 0, p[1] + up);
  g.addColorStop(0, "rgba(255, 255, 255, 0.1)");
  g.addColorStop(0.3, "rgba(255, 255, 255, 0.3)");
  g.addColorStop(1, "rgba(0, 0, 0, 0.42)");
  if (Math.abs(nx) > 0.5) {
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    const [qx] = st.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
    ctx.fillStyle = roundness(st, qx, r * st.s, 0.42);
    ctx.fill();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Leaves: a heap of green balls with the light catching a few. */
export function foliage(st: Stage, x: number, y: number, z: number, r: number, rand: () => number, greens: string[]) {
  const blobs = 10;
  // The far ones first.
  const at = Array.from({ length: blobs }, (_, i) => {
    const a = (i / blobs) * Math.PI * 2 + rand();
    const k = i === blobs - 1 ? 0 : 0.5 + rand() * 0.15;
    return { x: x + Math.cos(a) * r * k, y: y + Math.sin(a) * r * k * 0.8, z: z + (i === blobs - 1 ? r * 0.35 : (rand() - 0.3) * r * 0.5), r: r * (0.42 + rand() * 0.16), c: greens[i % greens.length]! };
  }).sort((a, b) => a.y - a.z - (b.y - b.z));
  for (const b of at) ball(st, b.x, b.y, b.z, b.r, b.c, 0, 0.36);
  const { ctx } = st;
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const k = rand() * 0.8;
    const [lx, ly] = st.at(x + Math.cos(a) * r * k, y, z + Math.sin(a) * r * k + r * 0.2);
    ctx.fillStyle = "rgba(196, 240, 150, 0.4)";
    ctx.beginPath();
    ctx.ellipse(lx - r * st.s * 0.1, ly - r * st.s * 0.1, Math.max(0.8, r * st.s * 0.1), Math.max(0.5, r * st.s * 0.05), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A flower seen from the side and a little above: petals round a heart, on the end of nothing in particular. */
export function bloom(st: Stage, x: number, y: number, z: number, r: number, colour: string) {
  const { ctx } = st;
  const [cx, cy] = st.at(x, y, z);
  const R = Math.max(1.6, r * st.s);
  ctx.fillStyle = colour;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.5, R * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#8a5a14";
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c230";
  ctx.beginPath();
  ctx.arc(cx - R * 0.08, cy - R * 0.08, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Shadows ---------------------------------------------------------------------------------------

/**
 * Adds to a path the ground a thing shades: its footprint, and the same footprint slid along the
 * light by its height, and everything between. Every piece goes round the same way, so shadows
 * that overlap make one shadow and never a hole.
 */
export function castShadow(st: Stage, into: Path2D, foot: Point[], ground: number, height: number, lift = 0) {
  if (height <= 0) return;
  const base = clockwise(foot);
  const dx = SHADOW[0] * height;
  const dy = SHADOW[1] * height;
  const lx = SHADOW[0] * lift;
  const ly = SHADOW[1] * lift;
  const add = (points: Point[]) => {
    const on = points.map((p) => st.at(p[0], p[1], ground));
    const round = turning(on) >= 0 ? on : on.reverse();
    round.forEach(([x, y], i) => (i ? into.lineTo(x, y) : into.moveTo(x, y)));
    into.closePath();
  };
  const near = base.map(([x, y]): Point => [x + lx, y + ly]);
  const far = base.map(([x, y]): Point => [x + lx + dx, y + ly + dy]);
  if (!lift) add(near);
  add(far);
  base.forEach((_, i) => {
    const j = (i + 1) % base.length;
    add([near[i]!, near[j]!, far[j]!, far[i]!]);
  });
}

/** A ring of points round a centre, for the footprint of something round. */
export const ring = (x: number, y: number, r: number, sides = 14): Point[] => Array.from({ length: sides }, (_, i): Point => [x + Math.cos((i / sides) * Math.PI * 2) * r, y + Math.sin((i / sides) * Math.PI * 2) * r]);
