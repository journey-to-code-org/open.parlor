// The few sums that painting on the ground needs: paths, polygons pushed in or out, and which way
// an edge looks. These work on the map of a table (see course.ts); what stands up is in solids.ts.
import type { Point, Shape } from "@journey-to-code/physics";

export type Ctx = CanvasRenderingContext2D;

/** What every routine that paints on the ground is handed: the canvas, how big a CSS pixel is in world units, and where the light falls. */
export interface Brush {
  ctx: Ctx;
  /** One CSS pixel, in world units. Line widths are given in these so they don't thin out on a small screen. */
  px: number;
  /** The way shadows fall along the ground, as a unit vector in the camera's frame: the light is at the upper left of the screen, however the table is turned. */
  light: Point;
}

export function trace(ctx: Ctx, shape: Shape | { points: Point[] }, closed = true) {
  if ("points" in shape) {
    shape.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (closed) ctx.closePath();
  } else {
    ctx.moveTo(shape.x + shape.r, shape.y);
    ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
  }
}
export function path(ctx: Ctx, shape: Shape | { points: Point[] }, closed = true) {
  ctx.beginPath();
  trace(ctx, shape, closed);
}

export function boxOf(shape: Shape): { x: number; y: number; w: number; h: number } {
  if (!("points" in shape)) return { x: shape.x - shape.r, y: shape.y - shape.r, w: 2 * shape.r, h: 2 * shape.r };
  const xs = shape.points.map((p) => p[0]);
  const ys = shape.points.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function centreOf(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

/** Positive when the points run clockwise as drawn (y down the screen): the inside is then on the right of each edge. */
export function turning(points: Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a;
}

/** The unit vector to the right of the way from `a` to `b` (y down the screen). */
export function rightOf(a: Point, b: Point): Point {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
}

/**
 * A chain of points moved sideways by `d` (to the right of the way it runs; negative for left),
 * with its corners mitred: each corner goes out along the line that halves the angle, far enough
 * that the pieces on either side stay `d` from where they were.
 */
export function offset(points: Point[], closed: boolean, d: number): Point[] {
  const n = points.length;
  return points.map((p, i) => {
    const before = closed || i > 0 ? rightOf(points[(i + n - 1) % n]!, p) : null;
    const after = closed || i < n - 1 ? rightOf(p, points[(i + 1) % n]!) : null;
    const a = before ?? after!;
    const b = after ?? before!;
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const len = Math.hypot(mx, my);
    if (len < 1e-6) return [p[0] + a[0] * d, p[1] + a[1] * d];
    mx /= len;
    my /= len;
    // 1 / cos of half the turn; a hairpin would shoot off to infinity, so it is cut short.
    const k = Math.min(3, 1 / Math.max(0.05, mx * a[0] + my * a[1]));
    return [p[0] + mx * d * k, p[1] + my * d * k];
  });
}

/** How much a face looking the way of `(nx, ny)` catches the light: 1 full on, -1 turned away. */
export const facing = (b: Brush, nx: number, ny: number) => -(nx * b.light[0] + ny * b.light[1]);

/** White or black at a strength, for lightening and darkening what is already there. */
export const shadeOf = (amount: number) => (amount >= 0 ? `rgba(255, 255, 255, ${Math.min(1, amount)})` : `rgba(0, 0, 0, ${Math.min(1, -amount)})`);

/** The light, as seen from inside something turned by `angle` radians. */
export function turned(b: Brush, angle: number): Brush {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  return { ...b, light: [b.light[0] * c - b.light[1] * s, b.light[0] * s + b.light[1] * c] };
}

/** Draws something at a place, facing a way: `draw` works round the origin looking along +x, lit as it should be. */
export function placed(b: Brush, x: number, y: number, hundredths: number, draw: (b: Brush) => void) {
  const angle = (hundredths * Math.PI) / 18000;
  b.ctx.save();
  b.ctx.translate(x, y);
  b.ctx.rotate(angle);
  draw(turned(b, angle));
  b.ctx.restore();
}

/** A soft shadow on the ground under something `height` tall whose footprint `draw` traces. */
export function shadow(b: Brush, height: number, draw: () => void, strength = 0.3) {
  const { ctx } = b;
  const reach = height * 0.65;
  ctx.save();
  ctx.translate(b.light[0] * reach, b.light[1] * reach);
  ctx.fillStyle = `rgba(8, 24, 12, ${strength})`;
  ctx.beginPath();
  draw();
  ctx.fill();
  ctx.restore();
}

/** A disc lit like a ball or a dome: bright where the light lands, dark on the far side. */
export function dome(b: Brush, x: number, y: number, r: number, colour: string, glint = 0.7, depth = 0.4) {
  const { ctx } = b;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - b.light[0] * r * 0.45, y - b.light[1] * r * 0.45, r * 0.05, x, y, r);
  g.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  g.addColorStop(0.45, "rgba(255, 255, 255, 0)");
  g.addColorStop(0.7, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, `rgba(0, 0, 0, ${depth})`);
  ctx.fillStyle = g;
  ctx.fill();
  if (glint > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${glint})`;
    ctx.beginPath();
    ctx.ellipse(x - b.light[0] * r * 0.42, y - b.light[1] * r * 0.42, r * 0.26, r * 0.16, Math.atan2(b.light[1], b.light[0]) + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
