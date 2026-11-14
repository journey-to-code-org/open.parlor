// Every hole of every course: it is a world the physics accepts, everything its description names
// is there, the tee and the cup are on the green and clear of trouble, a ball can never get
// anywhere that isn't grass, sand or water, tunnels let a ball out somewhere safe, water is too
// wide to jump, and it can be finished. A hole added to a course is checked here without touching
// this file.
import { simulate, validateWorld, type Point, type Shape } from "@cardroom/physics";
import { describe, expect, it } from "vitest";
import { BALL_RADIUS, COURSES, CUP_RADIUS, bestPutt, distanceToCup, holeWorld, type GolfHole } from "../src/index.js";

function inside(s: Shape, x: number, y: number): boolean {
  if (!("points" in s)) return (x - s.x) ** 2 + (y - s.y) ** 2 < s.r ** 2;
  let hit = false;
  for (let i = 0, j = s.points.length - 1; i < s.points.length; j = i++) {
    const [xi, yi] = s.points[i]!;
    const [xj, yj] = s.points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function toWalls(h: GolfHole, [x, y]: Point): number {
  let best = Infinity;
  for (const w of h.world.walls) {
    const n = w.closed ? w.points.length : w.points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = w.points[i]!;
      const b = w.points[(i + 1) % w.points.length]!;
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey)));
      best = Math.min(best, Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey));
    }
  }
  return best;
}
/** The narrowest a shape gets: a circle's width, or for a polygon the least of its widths across each side. */
function thickness(s: Shape): number {
  if (!("points" in s)) return 2 * s.r;
  let least = Infinity;
  s.points.forEach((a, i) => {
    const b = s.points[(i + 1) % s.points.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    least = Math.min(least, Math.max(...s.points.map((p) => Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / len)));
  });
  return least;
}

/** A player who always hits the putt the search finds: how many strokes to hole out (or `most` + 1). */
function strokesToHoleOut(h: GolfHole, most: number): number {
  let [x, y] = h.tee;
  for (let stroke = 1; stroke <= most; stroke++) {
    const putt = bestPutt(h, x, y);
    const at = simulate(holeWorld(h, { id: "ball", x, y }), { body: "ball", angle: putt.angle, power: putt.power }).world.bodies.find((b) => b.id === "ball")!;
    if (at.pocketed !== undefined) return stroke;
    if (at.out === undefined) [x, y] = [at.x, at.y];
  }
  return most + 1;
}

/** Whether the straight step from one point to another crosses a piece of wall that would stop it. */
function blocked(h: GolfHole, from: Point, to: Point): boolean {
  for (const w of h.world.walls) {
    const n = w.closed ? w.points.length : w.points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = w.points[i]!;
      const b = w.points[(i + 1) % w.points.length]!;
      const side = (p: Point) => (p[0] - a[0]) * -(b[1] - a[1]) + (p[1] - a[1]) * (b[0] - a[0]);
      const s1 = side(from);
      const s2 = side(to);
      if (s1 > 0 === s2 > 0) continue;
      // A ledge is crossed freely from its left (the negative side).
      if (w.oneWay && s1 < 0) continue;
      const along = (p: Point) => (p[0] - from[0]) * -(to[1] - from[1]) + (p[1] - from[1]) * (to[0] - from[0]);
      if (along(a) > 0 !== along(b) > 0) return true;
    }
  }
  return false;
}

/**
 * Everywhere a ball's centre could get to from the tee: stepping across the hole on a fine grid,
 * stopped by rails and blocks, through ledges one way only, into (but not on through) water, and
 * out of every tunnel. The grid is set a little off the round numbers holes are written in, so no
 * point lies exactly on a rail.
 */
function reachable(h: GolfHole): { x: number; y: number; wet: boolean }[] {
  const STEP = 130;
  const f = h.look.frame;
  const seen = new Map<string, { x: number; y: number; wet: boolean }>();
  const wet = (x: number, y: number) => h.world.regions.some((r) => r.out && inside(r.shape, x, y));
  const snap = (v: number, o: number) => o + 37 + Math.round((v - o - 37) / STEP) * STEP;
  const queue: Point[] = [[snap(h.tee[0], f.x), snap(h.tee[1], f.y)], ...(h.world.tunnels ?? []).map((t): Point => [snap(t.to[0], f.x), snap(t.to[1], f.y)])];
  for (const [x, y] of queue) seen.set(`${x}/${y}`, { x, y, wet: wet(x, y) });
  while (queue.length) {
    const [x, y] = queue.pop()!;
    if (seen.get(`${x}/${y}`)!.wet) continue;
    for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as const) {
      const next: Point = [x + dx, y + dy];
      const key = `${next[0]}/${next[1]}`;
      if (seen.has(key) || blocked(h, [x, y], next)) continue;
      // Off the picture altogether: recorded, and not walked on from.
      const off = next[0] < f.x || next[0] > f.x + f.w || next[1] < f.y || next[1] > f.y + f.h;
      seen.set(key, { x: next[0], y: next[1], wet: off || wet(next[0], next[1]) });
      if (!off) queue.push(next);
    }
  }
  return [...seen.values()];
}

describe("the course list", () => {
  it("has courses with their own ids, and a first course of nine holes", () => {
    expect(new Set(COURSES.map((c) => c.id)).size).toBe(COURSES.length);
    expect(COURSES[0]!.holes).toHaveLength(9);
    for (const c of COURSES) expect(new Set(c.holes.map((h) => h.id)).size).toBe(c.holes.length);
  });
  it("is plain data: a hole survives a trip through JSON unchanged", () => {
    for (const c of COURSES) expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});

for (const course of COURSES) {
  describe(course.name, () => {
    course.holes.forEach((h, i) => {
      describe(`hole ${i + 1}: ${h.name}`, () => {
        const cup = h.world.pockets[0]!;
        /** On something a ball can lie on: grass (a plank bridge counts) or sand. */
        const onGround = (x: number, y: number) => h.look.ground.some((g) => (g.surface === "green" || g.surface === "deck" || g.surface === "sand") && inside(g.shape, x, y));

        it("is a world the physics accepts, with one cup and nothing left on it", () => {
          expect(validateWorld(holeWorld(h, { id: "ball", x: h.tee[0], y: h.tee[1] }))).toEqual([]);
          // The only bodies a hole brings are its bumpers, each described.
          expect(h.world.bodies.every((b) => b.fixed === true && (b.kick ?? 0) > 0)).toBe(true);
          expect(h.fixtures.map((b) => b.id)).toEqual(h.world.bodies.map((b) => b.id));
          expect(h.world.pockets.map((p) => p.id)).toEqual(["cup"]);
          expect(cup.r).toBe(CUP_RADIUS);
          expect(cup.maxSpeed).toBeGreaterThan(0);
          expect(h.par).toBeGreaterThanOrEqual(2);
          expect(h.par).toBeLessThanOrEqual(5);
          expect(h.name && h.tip).toBeTruthy();
          // Everything the look names is in the world, and the frame is inside the bounds.
          const b = h.world.bounds;
          const f = h.look.frame;
          expect(f.x >= b.x && f.y >= b.y && f.x + f.w <= b.x + b.w && f.y + f.h <= b.y + b.h).toBe(true);
          for (const r of h.look.regions) expect(h.world.regions.some((g) => g.id === r.id)).toBe(true);
          // Every wall is something to look at (a rail, a block or a step), exactly once, and has a height.
          const drawn = [...h.look.rails.map((r) => r.wall), ...h.look.blocks.map((b) => b.wall), ...h.look.ledges.map((l) => l.wall)];
          expect(drawn.slice().sort()).toEqual(h.world.walls.map((w) => w.id).sort());
          for (const r of h.look.rails) expect(r.width > 0 && r.height > 0 && ["left", "right", "both"].includes(r.side)).toBe(true);
          for (const b of h.look.blocks) expect(h.world.walls.find((w) => w.id === b.wall)!.closed && b.height > 0).toBe(true);
          for (const l of h.look.ledges) expect(h.world.walls.find((w) => w.id === l.wall)!.oneWay && l.drop > 0).toBe(true);
          expect(h.look.tunnels.map((t) => t.id)).toEqual((h.world.tunnels ?? []).map((t) => t.id));
          for (const d of h.look.decor) expect(d.x >= f.x && d.x <= f.x + f.w && d.y >= f.y && d.y <= f.y + f.h, `${d.kind} is off the picture`).toBe(true);
        });

        it("has its tee and its cup on the green, clear of walls, sand and water", () => {
          for (const [what, at] of [["tee", h.tee], ["cup", [cup.x, cup.y] as Point]] as const) {
            expect(onGround(at[0], at[1]), `the ${what} is off the green`).toBe(true);
            expect(toWalls(h, at), `the ${what} is against a wall`).toBeGreaterThan(2 * BALL_RADIUS);
            for (const r of h.world.regions) if (r.out) expect(inside(r.shape, at[0], at[1]), `the ${what} is in ${r.id}`).toBe(false);
            // Where sand and a grass path overlap, the one listed last is what the ball rolls on.
            const under = h.world.regions.filter((r) => r.friction !== undefined && inside(r.shape, at[0], at[1])).at(-1);
            expect(under?.friction ?? h.world.friction, `the ${what} is in ${under?.id}`).toBe(h.world.friction);
          }
          // A ball can sit on the tee: no slope carries it off before it is struck.
          const still = simulate(holeWorld(h, { id: "ball", x: h.tee[0], y: h.tee[1] })).world.bodies.at(-1)!;
          expect([still.x, still.y]).toEqual(h.tee);
          expect(distanceToCup(h, h.tee[0], h.tee[1])).toBeLessThan(1e8);
        });

        it("keeps the ball on grass or sand, or drops it in the water: there is nowhere else to roll to", () => {
          const spots = reachable(h);
          expect(spots.length).toBeGreaterThan(500);
          const lost = spots.filter((s) => !s.wet && !onGround(s.x, s.y));
          expect(lost.slice(0, 3), "a ball can get off the course here").toEqual([]);
          // And the cup can be got to.
          expect(spots.some((s) => Math.hypot(s.x - cup.x, s.y - cup.y) < 200)).toBe(true);
          // The same thing found the hard way: a couple of hundred putts of every strength and
          // direction, each from where the last one stopped, never leave a ball anywhere else.
          let [x, y] = h.tee;
          for (let n = 0; n < 220; n++) {
            const shot = { body: "ball", angle: (n * 7919) % 36000, power: 150 + ((n * 373) % 851) };
            const played = simulate(holeWorld(h, { id: "ball", x, y }), shot);
            const at = played.world.bodies.at(-1)!;
            expect(played.capped, `${shot.angle}/${shot.power} from ${x},${y} never stopped`).toBe(false);
            if (at.pocketed !== undefined) [x, y] = h.tee;
            else if (at.out === undefined) {
              expect(onGround(at.x, at.y), `${shot.angle}/${shot.power} from ${x},${y} left the ball off the course at ${at.x},${at.y}`).toBe(true);
              [x, y] = [at.x, at.y];
            } else expect(at.out, `${shot.angle}/${shot.power} from ${x},${y} went over the edge of the world`).not.toBe("bounds");
          }
        });

        it("lets a ball out of each tunnel somewhere safe, and stands its bumpers clear", () => {
          for (const t of h.world.tunnels ?? []) {
            expect(onGround(t.to[0], t.to[1]), `${t.id} comes out off the green`).toBe(true);
            expect(toWalls(h, t.to), `${t.id} comes out in a wall`).toBeGreaterThan(BALL_RADIUS);
            for (const r of h.world.regions) if (r.out || r.id.startsWith("sand")) expect(inside(r.shape, t.to[0], t.to[1]), `${t.id} comes out in ${r.id}`).toBe(false);
            // A ball set down in the mouth goes through and comes to rest on the hole.
            const run = simulate(holeWorld(h, { id: "ball", x: t.x, y: t.y }));
            expect(run.events.slice(0, 2).map((e) => e.type)).toEqual(["tunnel", "emerge"]);
            expect(run.capped).toBe(false);
          }
          // Bumpers stand clear of the rails, the tee and the cup: a ball can always get round one.
          for (const b of h.world.bodies) {
            expect(toWalls(h, [b.x, b.y])).toBeGreaterThan(b.r + 2 * BALL_RADIUS);
            for (const at of [h.tee, [cup.x, cup.y] as Point]) expect(Math.hypot(b.x - at[0], b.y - at[1])).toBeGreaterThan(b.r + 3 * BALL_RADIUS);
          }
        });

        it("has water too wide for a ball to jump", () => {
          // Regions are sampled once a step. Five steps of travel at full power is the margin.
          const perStep = h.world.maxShotSpeed / h.world.tickRate;
          for (const r of h.world.regions) if (r.out) expect(thickness(r.shape), `${r.id} is thin enough to jump`).toBeGreaterThan(5 * perStep);
        });

        it(`can be holed out within par + 2 (${h.par + 2} strokes)`, () => {
          expect(strokesToHoleOut(h, h.par + 2)).toBeLessThanOrEqual(h.par + 2);
        });
      });
    });
  });
}
