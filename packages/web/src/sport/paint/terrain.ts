// The lie of the land: a table turned to face the camera, and how high the ground is at any point
// of it. A view gives heights as data (a patch of ground at a level, a slope that rises so far, a
// pond with no level at all); this file settles what that means for drawing: water and sand lie a
// little below whatever they are set in, a slope is a tilted plane between its foot and its top,
// and the last patch laid over a point is the one that counts.
//
// Everything here is in the camera's frame (see projection.ts): the world is turned first, once,
// and from then on "towards the camera" is simply +y. Nothing above this file has to think about
// which way a table has been turned.
import type { SportGround, SportLook, SportSurface, SportView } from "@journey-to-code/games";
import type { Point, Shape, World } from "@journey-to-code/physics";
import { toCamera } from "../projection";

/** How far a surface lies below what it is set in, when a view gives it no level of its own. */
const SUNK: Partial<Record<SportSurface, number>> = { water: 170, sand: 45 };

/** A patch of ground with its height settled. */
export interface Patch {
  shape: Shape;
  surface: SportSurface;
  /** How high its surface is. */
  z: number;
  /** How high the solid ground it is set in is: the same, except for water and sand. */
  base: number;
}

/** A slope: a plane that climbs `rise` from its foot to its top. */
export interface Ramp {
  id: string;
  shape: Shape;
  /** The way uphill, as a unit vector. */
  ux: number;
  uy: number;
  /** How far along that way the foot is, and how far it is from foot to top. */
  foot: number;
  run: number;
  /** How high the foot is, and how much higher the top. */
  z: number;
  rise: number;
}

export interface Land {
  turn: number;
  world: World;
  look: SportLook;
  patches: Patch[];
  ramps: Ramp[];
  /** How high the ground is at a point. */
  heightAt(x: number, y: number): number;
  /** How high the solid ground is there: the same, but the bank's height where there is water or sand. */
  bankAt(x: number, y: number): number;
}

export function inShape(s: Shape, x: number, y: number): boolean {
  if (!("points" in s)) return (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < s.r * s.r;
  return inPolygon(s.points, x, y);
}
export function inPolygon(points: Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A shape's outline as points: a circle becomes a many-sided figure. */
export function outlineOf(s: Shape, sides = 28): Point[] {
  if ("points" in s) return s.points;
  return Array.from({ length: sides }, (_, i): Point => [s.x + Math.cos((i / sides) * Math.PI * 2) * s.r, s.y + Math.sin((i / sides) * Math.PI * 2) * s.r]);
}

/** Some point that is inside a shape, wherever its corners go. */
export function within(s: Shape): Point {
  if (!("points" in s)) return [s.x, s.y];
  const p = s.points;
  const mid: Point = [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
  if (inPolygon(p, mid[0], mid[1])) return mid;
  // A horseshoe's middle is outside it: the middle of some corner's triangle won't be.
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    const c = p[(i + 2) % p.length]!;
    const at: Point = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    if (inPolygon(p, at[0], at[1])) return at;
  }
  return p[0]!;
}

/** A table as the camera has it: every point turned, every facing turned with it. */
function turnTable(table: SportView["table"], turn: number): { world: World; look: SportLook } {
  const at = (p: Point): Point => toCamera(turn, p[0], p[1]);
  const shape = (s: Shape): Shape => {
    if ("points" in s) return { points: s.points.map(at) };
    const [x, y] = toCamera(turn, s.x, s.y);
    return { x, y, r: s.r };
  };
  const facing = (hundredths: number) => (((hundredths + turn * 9000) % 36000) + 36000) % 36000;
  const { world, look } = table;
  const corners = [at([look.frame.x, look.frame.y]), at([look.frame.x + look.frame.w, look.frame.y + look.frame.h])];
  const fx = Math.min(corners[0]![0], corners[1]![0]);
  const fy = Math.min(corners[0]![1], corners[1]![1]);
  return {
    world: {
      ...world,
      bodies: world.bodies.map((b) => ({ ...b, x: at([b.x, b.y])[0], y: at([b.x, b.y])[1] })),
      walls: world.walls.map((w) => ({ ...w, points: w.points.map(at) })),
      pockets: world.pockets.map((p) => ({ ...p, x: at([p.x, p.y])[0], y: at([p.x, p.y])[1] })),
      regions: world.regions.map((r) => ({ ...r, shape: shape(r.shape), ...(r.slope ? { slope: at(r.slope) } : {}) })),
      ...(world.tunnels ? { tunnels: world.tunnels.map((t) => ({ ...t, x: at([t.x, t.y])[0], y: at([t.x, t.y])[1], to: at(t.to), angle: facing(t.angle) })) } : {}),
    },
    look: {
      ...look,
      frame: { x: fx, y: fy, w: Math.abs(corners[1]![0] - corners[0]![0]), h: Math.abs(corners[1]![1] - corners[0]![1]) },
      ground: look.ground.map((g): SportGround => ({ ...g, shape: shape(g.shape) })),
      tunnels: look.tunnels.map((t) => ({ ...t, enter: facing(t.enter), ...(t.path ? { path: t.path.map(at) } : {}), ...(t.out ? { out: at(t.out) } : {}) })),
      decor: look.decor.map((d) => ({ ...d, x: at([d.x, d.y])[0], y: at([d.x, d.y])[1], ...(d.angle !== undefined ? { angle: facing(d.angle) } : {}) })),
    },
  };
}

export function landOf(table: SportView["table"], turn: number): Land {
  const { world, look } = turnTable(table, turn);

  // Patches are laid in order, each on top of the ones before. One with a level stands at it; one
  // without lies on whatever is under it, a little sunk if it is water or sand.
  const patches: Patch[] = [];
  const under = (x: number, y: number, upTo: number): Patch | null => {
    for (let i = upTo - 1; i >= 0; i--) if (inShape(patches[i]!.shape, x, y)) return patches[i]!;
    return null;
  };
  look.ground.forEach((g, i) => {
    const [x, y] = within(g.shape);
    const base = g.level ?? under(x, y, i)?.base ?? 0;
    patches.push({ shape: g.shape, surface: g.surface, base, z: g.level !== undefined ? g.level : base - (SUNK[g.surface] ?? 0) });
  });
  const flat = (x: number, y: number) => under(x, y, patches.length)?.z ?? 0;

  const ramps: Ramp[] = [];
  for (const r of look.regions) {
    const region = world.regions.find((g) => g.id === r.id);
    if (r.surface !== "slope" || !region?.slope || !r.rise) continue;
    const steep = Math.hypot(region.slope[0], region.slope[1]) || 1;
    // The pull on a ball is downhill.
    const ux = -region.slope[0] / steep;
    const uy = -region.slope[1] / steep;
    const along = outlineOf(region.shape).map((p) => p[0] * ux + p[1] * uy);
    const foot = Math.min(...along);
    const run = Math.max(...along) - foot || 1;
    const [x, y] = within(region.shape);
    ramps.push({ id: r.id, shape: region.shape, ux, uy, foot, run, z: flat(x, y), rise: r.rise });
  }

  const heightAt = (x: number, y: number) => {
    for (const r of ramps) if (inShape(r.shape, x, y)) return r.z + r.rise * Math.min(1, Math.max(0, (x * r.ux + y * r.uy - r.foot) / r.run));
    return flat(x, y);
  };
  const bankAt = (x: number, y: number) => {
    const p = under(x, y, patches.length);
    return p && p.base !== p.z ? p.base : heightAt(x, y);
  };
  return { turn, world, look, patches, ramps, heightAt, bankAt };
}
