// Mini golf courses, as data. A course is a list of holes; a hole is a physics world without a
// ball (rails, a cup, sand, water, slopes, ledges, pipes, bumpers), where the ball starts, its par,
// and a description of what everything on it is. Everything is plain JSON-serialisable data once
// built, so a hole can be stored, sent and simulated as is; `hole()` below is only a shorter way
// to write one.
//
// Lengths are tenths of a millimetre, as in the physics examples, but these are toy greens: about
// a metre wide and a metre and a half long, so a ball is big enough to see on a phone.
//
// Nothing here says what anything looks like. A hole says a rail is timber and so high, a block is
// a rock, there is a gnome by the cup; the table screen decides how a rock is drawn. Heights are
// kept (rails, blocks, terraces) although the physics is flat, so that a renderer in three
// dimensions would have what it needs.
//
// Writing a hole:
//  - Keep to whole numbers, and build shapes with + - * /, Math.sqrt and Math.round only. A hole
//    must come out identical on the server and in every browser, and sin/cos may differ in the
//    last digit.
//  - A ball must never be able to roll somewhere that is neither grass, sand nor water. Rails keep
//    it in; where a rail is left out on purpose, water (or the edge of the world) must be what is
//    beyond. test/minigolfcourse.test.ts walks everywhere a ball can get to and checks.
//  - Regions are sampled once a step. A ball at full power moves about 180 units a step, so make
//    water at least 1000 thick where a ball can cross it, or a hard shot may jump it.
//  - A slope steeper than the green's friction (6000) won't hold a ball: it rolls back off.
//  - A ledge lets a ball through from the left of its points, as listed, and stops one on the
//    right; end it on rails or blocks.
//  - Where a tunnel lets a ball out must be clear of rails, blocks, sand and water.
//  - The same test checks every hole of every course listed in COURSES: it validates, the tee and
//    the cup are on the green and clear of trouble, and a search over shots holes out within
//    par + 2. A hole that can't be finished doesn't ship.
import type { Body, Point, Region, Shape, Tunnel, Wall, World } from "@cardroom/physics";
import type { SportBlock, SportBody, SportDecor, SportGround, SportLook, SportMaterial, SportSurface, SportTunnel } from "./sport.js";

export interface GolfHole {
  id: string;
  name: string;
  par: number;
  /** One line of advice, shown at the tee. */
  tip: string;
  /** Where every ball starts. */
  tee: Point;
  /** The hole with no ball on it (its bumpers are bodies); the cup is the pocket called "cup". */
  world: World;
  look: SportLook;
  /** What the world's own bodies are: the bumpers. */
  fixtures: SportBody[];
}

export interface GolfCourse {
  id: string;
  name: string;
  holes: GolfHole[];
}

export const BALL_RADIUS = 240;
export const CUP_RADIUS = 440;
/** A ball crossing the cup faster than this (units/s) skips over it. */
export const CUP_SPEED = 4500;
export const GREEN_FRICTION = 6000;
export const SAND_FRICTION = 26000;
/** How wide and how high a rail is, unless a hole says otherwise. */
export const RAIL_WIDTH = 340;
export const RAIL_HEIGHT = 260;

/** What every hole shares: how the green plays. A full-power putt on open ground rolls about four metres. */
const GREEN = { tickRate: 120, maxTicks: 2400, friction: GREEN_FRICTION, restSpeed: 100, restitution: 0.9, wallRestitution: 0.7, maxShotSpeed: 22000 };

/** Every hole is drawn in the same portrait picture, so the ball is the same size on all of them; a wide hole lies on its side. */
const PORTRAIT = { x: 0, y: 0, w: 10400, h: 14000 };
const LANDSCAPE = { x: 0, y: 0, w: 14000, h: 10400 };

const rect = (x1: number, y1: number, x2: number, y2: number): Point[] => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

/** A rectangle with its corners cut off at 45°, which is most of what makes a green look built. */
const cut = (x1: number, y1: number, x2: number, y2: number, c: number): Point[] => [[x1 + c, y1], [x2 - c, y1], [x2, y1 + c], [x2, y2 - c], [x2 - c, y2], [x1 + c, y2], [x1, y2 - c], [x1, y1 + c]];

/** A straight strip of ground from one point to another, so wide. Square root and rounding only: the same points everywhere. */
function strip(a: Point, b: Point, width: number): Point[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = Math.round((-dy / len) * (width / 2));
  const ny = Math.round((dx / len) * (width / 2));
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}

/** Eight sides round a centre: a flowerpot, a tree stump, a stepping stone. */
function octagon(cx: number, cy: number, r: number): Point[] {
  const k = Math.round(r * 0.4142);
  return [[cx - k, cy - r], [cx + k, cy - r], [cx + r, cy - k], [cx + r, cy + k], [cx + k, cy + r], [cx - k, cy + r], [cx - r, cy + k], [cx - r, cy - k]];
}

// The eight compass directions as unit vectors, and the eight directions halfway between them,
// written out as short decimals so that a mound is the same numbers everywhere.
const D = 0.7071;
const COMPASS: Point[] = [[1, 0], [D, D], [0, 1], [-D, D], [-1, 0], [-D, -D], [0, -1], [D, -D]];
const A = 0.9239;
const B = 0.3827;
const BETWEEN: Point[] = [[A, B], [B, A], [-B, A], [-A, B], [-A, -B], [-B, -A], [B, -A], [A, -B]];

interface Slope {
  shape: Shape;
  /** The pull on a ball here, in units/s²: which way is downhill, and how steep. */
  pull: Point;
}

/**
 * A round hill (or with a negative pull, a bowl): a ring of eight wedges from `inner` to `outer`
 * round a centre, each sloping straight away from it. Inside `inner` it is flat.
 */
function mound(cx: number, cy: number, inner: number, outer: number, pull: number): Slope[] {
  return COMPASS.map(([ux, uy], k) => {
    const [ax, ay] = BETWEEN[(k + 7) % 8]!;
    const [bx, by] = BETWEEN[k]!;
    const at = (r: number, x: number, y: number): Point => [Math.round(cx + r * x), Math.round(cy + r * y)];
    return { shape: { points: [at(inner, ax, ay), at(outer, ax, ay), at(outer, bx, by), at(inner, bx, by)] }, pull: [Math.round(pull * ux), Math.round(pull * uy)] };
  });
}

interface HoleSpec {
  id: string;
  name: string;
  par: number;
  tip: string;
  tee: Point;
  /** Which way the tee mat faces: the way a first putt usually goes. Up the screen unless said. */
  teeFacing?: number;
  cup: Point;
  /** The picture: every hole of a course is drawn to the same scale. */
  frame?: { x: number; y: number; w: number; h: number };
  /** What the rails are made of. */
  material?: SportMaterial;
  /** What lies round the hole, under everything. */
  base?: SportSurface;
  /** Scenery laid on the base before the green: paths, beds, a pond that is only to look at. */
  scenery?: SportGround[];
  /** The grass: one or more patches. */
  green: Point[][];
  /** Patches that stand higher than the rest (terraces), or are something other than grass to look at (a plank bridge). They play like the green. */
  decks?: { points: Point[]; surface?: SportSurface; level?: number }[];
  /** The rails. Left out: one round each patch of green. */
  rails?: { points: Point[]; closed?: boolean; material?: SportMaterial }[];
  /** Steps down, each from the left of its points to the right. */
  ledges?: { points: Point[]; drop: number; material?: SportMaterial }[];
  /** Solid things standing on the green. */
  blocks?: { points: Point[]; kind: SportBlock["kind"]; height?: number }[];
  /** Bumpers that knock the ball away. */
  bumpers?: { at: Point; r?: number; kick?: number }[];
  tunnels?: (Omit<Tunnel, "id" | "x" | "y" | "r"> & { from: Point; r?: number; kind: SportTunnel["kind"]; enter: number; path?: Point[]; out?: Point })[];
  slopes?: Slope[];
  sand?: Shape[];
  /** Grass laid over sand: a path through a sandpit. */
  turf?: Point[][];
  water?: Shape[];
  decor?: SportDecor[];
}

const inside = (points: Point[], x: number, y: number): boolean => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/**
 * Which side of a wall its rail stands on: the side a ball can't be. Looked at once, when the
 * hole is built, by stepping a ball's width to either side of the middle of each piece and
 * asking whether that is grass. Only how the hole is drawn depends on the answer.
 */
function railSide(points: Point[], closed: boolean, green: Point[][]): "left" | "right" | "both" {
  const on = (x: number, y: number) => green.some((g) => inside(g, x, y));
  let left = 0;
  let right = 0;
  const n = closed ? points.length : points.length - 1;
  for (let k = 0; k < n; k++) {
    const [ax, ay] = points[k]!;
    const [bx, by] = points[(k + 1) % points.length]!;
    const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    // With y down the screen, (-ey, ex) points to the right of the way the wall runs.
    const nx = (-(by - ay) / len) * BALL_RADIUS;
    const ny = ((bx - ax) / len) * BALL_RADIUS;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if (on(mx + nx, my + ny)) right += len;
    if (on(mx - nx, my - ny)) left += len;
  }
  // Grass on one side: the rail stands on the other. Grass on both: it stands astride the line.
  if (right > 2 * left) return "left";
  if (left > 2 * right) return "right";
  return "both";
}

/** A hole from its parts: the world the physics plays and the description the table draws from. */
export function hole(spec: HoleSpec): GolfHole {
  const frame = spec.frame ?? PORTRAIT;
  const material = spec.material ?? "timber";
  const rails: NonNullable<HoleSpec["rails"]> = spec.rails ?? spec.green.map((points) => ({ points, closed: true }));
  const railWalls: Wall[] = rails.map((r, i) => ({ id: `rail-${i + 1}`, points: r.points, ...(r.closed ? { closed: true } : {}) }));
  const blockWalls: Wall[] = (spec.blocks ?? []).map((b, i) => ({ id: `block-${i + 1}`, closed: true, points: b.points }));
  const ledgeWalls: Wall[] = (spec.ledges ?? []).map((l, i) => ({ id: `ledge-${i + 1}`, oneWay: true, points: l.points }));
  const regions: Region[] = [
    ...(spec.slopes ?? []).map((s, i) => ({ id: `slope-${i + 1}`, shape: s.shape, slope: s.pull })),
    ...(spec.sand ?? []).map((shape, i) => ({ id: `sand-${i + 1}`, shape, friction: SAND_FRICTION })),
    // Listed after the sand, so that where the two overlap the grass decides how the ball rolls.
    ...(spec.turf ?? []).map((points, i) => ({ id: `turf-${i + 1}`, shape: { points }, friction: GREEN_FRICTION })),
    ...(spec.water ?? []).map((shape, i) => ({ id: `water-${i + 1}`, shape, out: true })),
  ];
  const bumpers: Body[] = (spec.bumpers ?? []).map((b, i) => ({ id: `toadstool-${i + 1}`, x: b.at[0], y: b.at[1], r: b.r ?? 380, fixed: true, kick: b.kick ?? 7000 }));
  const tunnels: Tunnel[] = (spec.tunnels ?? []).map(({ from, r, kind: _kind, enter: _enter, path: _path, out: _out, ...t }, i) => ({ id: `tunnel-${i + 1}`, x: from[0], y: from[1], r: r ?? 400, ...t }));
  const grounds: Point[][] = [...spec.green, ...(spec.turf ?? [])];
  return {
    id: spec.id,
    name: spec.name,
    par: spec.par,
    tip: spec.tip,
    tee: spec.tee,
    world: {
      // The rails keep every ball in, or water takes it; the bounds are the net under both.
      bounds: { x: frame.x - 500, y: frame.y - 500, w: frame.w + 1000, h: frame.h + 1000 },
      ...GREEN,
      bodies: bumpers,
      walls: [...railWalls, ...blockWalls, ...ledgeWalls],
      pockets: [{ id: "cup", x: spec.cup[0], y: spec.cup[1], r: CUP_RADIUS, maxSpeed: CUP_SPEED }],
      regions,
      ...(tunnels.length ? { tunnels } : {}),
    },
    look: {
      frame,
      base: spec.base ?? "lawn",
      ground: [
        ...(spec.scenery ?? []),
        ...spec.green.map((points): SportGround => ({ shape: { points }, surface: "green" })),
        ...(spec.decks ?? []).map((d): SportGround => ({ shape: { points: d.points }, surface: d.surface ?? "green", ...(d.level ? { level: d.level } : {}) })),
        ...(spec.sand ?? []).map((shape): SportGround => ({ shape, surface: "sand" })),
        ...(spec.turf ?? []).map((points): SportGround => ({ shape: { points }, surface: "green" })),
        ...(spec.water ?? []).map((shape): SportGround => ({ shape, surface: "water" })),
      ],
      regions: regions.flatMap((r): SportLook["regions"] => (r.out ? [{ id: r.id, surface: "water" }] : r.slope ? [{ id: r.id, surface: "slope" }] : r.id.startsWith("sand") ? [{ id: r.id, surface: "sand" }] : [])),
      rails: rails.map((r, i) => ({ wall: `rail-${i + 1}`, material: r.material ?? material, side: railSide(r.points, r.closed === true, grounds), width: RAIL_WIDTH, height: RAIL_HEIGHT })),
      blocks: (spec.blocks ?? []).map((b, i) => ({ wall: `block-${i + 1}`, kind: b.kind, height: b.height ?? 500 })),
      ledges: (spec.ledges ?? []).map((l, i) => ({ wall: `ledge-${i + 1}`, drop: l.drop, material: l.material ?? "stone" })),
      tunnels: (spec.tunnels ?? []).map((t, i) => ({ id: `tunnel-${i + 1}`, kind: t.kind, enter: t.enter, ...(t.path ? { path: t.path } : {}), ...(t.out ? { out: t.out } : {}) })),
      pockets: "cup",
      decor: [{ kind: "tee", x: spec.tee[0], y: spec.tee[1], angle: spec.teeFacing ?? 27000 }, ...(spec.decor ?? [])],
    },
    fixtures: bumpers.map((b) => ({ id: b.id, owner: null, kind: "toadstool", tone: "red", label: "a toadstool", height: 450 })),
  };
}

/** A ball to put on a hole. */
export interface PlacedBall {
  id: string;
  x: number;
  y: number;
  pocketed?: string;
}

/** The hole with these balls on it (after its own bumpers), ready for one of them to be struck. */
export function holeWorld(h: GolfHole, balls: PlacedBall | PlacedBall[]): World {
  const list = Array.isArray(balls) ? balls : [balls];
  return { ...h.world, bodies: [...h.world.bodies, ...list.map((b) => ({ id: b.id, x: b.x, y: b.y, r: BALL_RADIUS, ...(b.pocketed !== undefined ? { pocketed: b.pocketed } : {}) }))] };
}

// ---- The Back Garden ----------------------------------------------------------------------------
// Nine holes round a family garden, each built round one thing: a straight putt, a bank off a
// slanted board, a path through the sandpit, a drainpipe under the rockery, a plank bridge to an
// island in the pond, toadstools that kick, terraces you can only come down, a mole's tunnels, and
// then most of it at once. The first two are gentle. From the third on, the cup is never a
// straight putt from the tee: something has to be gone round, through or over.
//
// The tee is at the bottom of the picture (large y) and the cup towards the top, except on the
// one hole that lies on its side.

const welcomeMat = hole({
  id: "welcome-mat",
  name: "Welcome Mat",
  par: 2,
  tip: "Straight up the middle. Too hard and the ball skips over the cup.",
  tee: [5200, 11700],
  cup: [5200, 3000],
  // A bottle: a neck from the tee that opens out round the cup.
  green: [[[3700, 1200], [6700, 1200], [7700, 2200], [7700, 4700], [6800, 5600], [6800, 12300], [6100, 13000], [4300, 13000], [3600, 12300], [3600, 5600], [2700, 4700], [2700, 2200]]],
  scenery: [
    { shape: { points: rect(4300, 13300, 6100, 14600) }, surface: "gravel" },
    { shape: { points: [[900, 5900], [2900, 5900], [2900, 12600], [1500, 12600], [900, 12000]] }, surface: "soil" },
    { shape: { points: [[7500, 5900], [9500, 5900], [9500, 12000], [8900, 12600], [7500, 12600]] }, surface: "soil" },
  ],
  decor: [
    { kind: "doormat", x: 5200, y: 13650, angle: 0 },
    { kind: "gnome", x: 8600, y: 2500, angle: 13500, tone: "red" },
    { kind: "flowerpot", x: 1800, y: 2300, r: 520, tone: "pink" },
    { kind: "flowerpot", x: 1900, y: 4300, r: 400, tone: "gold" },
    { kind: "flowers", x: 1900, y: 7000, tone: "pink" },
    { kind: "bush", x: 1900, y: 8700, r: 620 },
    { kind: "flowers", x: 1900, y: 10400, tone: "gold" },
    { kind: "flowers", x: 8500, y: 6900, tone: "white" },
    { kind: "bush", x: 8500, y: 8500, r: 560 },
    { kind: "flowers", x: 8500, y: 10100, tone: "purple" },
    { kind: "flowers", x: 8500, y: 11600, tone: "pink" },
    { kind: "steppingstone", x: 8700, y: 4500, r: 430 },
    { kind: "steppingstone", x: 9500, y: 3600, r: 380 },
    { kind: "wateringcan", x: 1700, y: 12950, angle: 33000 },
  ],
});

const elbow = hole({
  id: "elbow",
  name: "The Elbow",
  par: 3,
  tip: "The cup is round the corner. Putt straight up: the slanted board at the top turns the ball for you.",
  tee: [2800, 11700],
  cup: [7600, 2150],
  material: "brick",
  // An L, with the outside corner cut off at 45° so a ball sent straight up is turned to the right.
  green: [[[3600, 1000], [8600, 1000], [9300, 1700], [9300, 3400], [8600, 4100], [5100, 4100], [4400, 4800], [4400, 12300], [3700, 13000], [1900, 13000], [1200, 12300], [1200, 3400]]],
  scenery: [
    { shape: { points: [[5300, 5300], [9400, 5300], [9400, 12400], [5300, 12400]] }, surface: "paving" },
    { shape: { points: rect(1900, 13300, 3700, 14600) }, surface: "gravel" },
  ],
  decor: [
    { kind: "bench", x: 7350, y: 6300, angle: 0, length: 2600 },
    { kind: "wheelbarrow", x: 7700, y: 9000, angle: 31000 },
    { kind: "flowerpot", x: 6000, y: 11300, r: 520, tone: "red" },
    { kind: "flowerpot", x: 8700, y: 11500, r: 430, tone: "purple" },
    { kind: "flowerpot", x: 5950, y: 8100, r: 380, tone: "gold" },
    { kind: "tree", x: 1500, y: 1400, r: 1250 },
    { kind: "bricks", x: 8900, y: 7700, angle: 2000 },
    { kind: "gnome", x: 9500, y: 4700, angle: 20000, tone: "blue" },
    { kind: "flowers", x: 600, y: 6000, tone: "white" },
    { kind: "flowers", x: 600, y: 9500, tone: "pink" },
  ],
});

const sandpit = hole({
  id: "sandpit",
  name: "The Sandpit",
  par: 3,
  tip: "Sand stops a ball in a hurry. Keep to the grass path, a corner at a time, or blast through and hope.",
  tee: [5200, 11900],
  cup: [5200, 2100],
  green: [cut(1000, 1000, 9400, 13000, 2000)],
  sand: [{ points: cut(1000, 1000, 9400, 13000, 2000) }],
  // The path: three straight runs with a round turning place at each corner.
  turf: [
    octagon(5200, 11900, 1150),
    strip([5200, 11900], [2700, 8700], 1700),
    octagon(2700, 8700, 1150),
    strip([2700, 8700], [7700, 5300], 1700),
    octagon(7700, 5300, 1150),
    strip([7700, 5300], [5200, 2100], 1700),
    octagon(5200, 2100, 1150),
  ],
  blocks: [{ points: [[4750, 6400], [5650, 6400], [5850, 6900], [5650, 7500], [4750, 7500], [4550, 6900]], kind: "castle", height: 700 }],
  decor: [
    { kind: "bucket", x: 7600, y: 9800, tone: "red" },
    { kind: "spade", x: 6500, y: 10600, angle: 4000, tone: "blue" },
    { kind: "shell", x: 2600, y: 4200, angle: 3000 },
    { kind: "shell", x: 7900, y: 2700, angle: 20000 },
    { kind: "shell", x: 3300, y: 11300, angle: 12000 },
    { kind: "bucket", x: 2900, y: 2900, tone: "gold" },
    { kind: "bush", x: 900, y: 1300, r: 700 },
    { kind: "bush", x: 9600, y: 12800, r: 650 },
    { kind: "flowers", x: 9500, y: 1500, tone: "gold" },
    { kind: "flowers", x: 800, y: 12700, tone: "pink" },
    { kind: "gnome", x: 5200, y: 13500, angle: 27000, tone: "green" },
  ],
});

const drainpipe = hole({
  id: "drainpipe",
  name: "The Drainpipe",
  par: 3,
  tip: "The rockery is in the way. Roll the ball into the pipe and it comes out on the far side, or take the long way round by the sand.",
  tee: [5200, 11700],
  cup: [6500, 2500],
  material: "stone",
  green: [cut(1200, 1000, 9200, 13000, 1200)],
  // Three rocks shoulder to shoulder from the left-hand rail; the gap is on the right.
  blocks: [
    { points: [[1200, 6000], [2300, 5800], [3100, 6300], [3100, 7700], [2200, 8000], [1200, 7800]], kind: "rock", height: 800 },
    { points: [[3100, 6300], [4100, 6300], [4100, 7700], [3100, 7700]], kind: "rock", height: 900 },
    { points: [[4100, 6300], [5400, 5900], [6900, 6200], [7400, 6900], [6800, 7900], [5300, 8100], [4100, 7700]], kind: "rock", height: 1000 },
  ],
  tunnels: [{ kind: "pipe", from: [3600, 7780], r: 400, to: [3600, 6040], angle: 27000, speed: 5200, ticks: 40, enter: 27000, out: [3600, 6220] }],
  sand: [{ points: [[7700, 6500], [9200, 6100], [9200, 8000], [7900, 7900]] }],
  decor: [
    { kind: "rock", x: 600, y: 6700, r: 520 },
    { kind: "rock", x: 9800, y: 6900, r: 450 },
    { kind: "bush", x: 600, y: 5300, r: 520 },
    { kind: "flowers", x: 700, y: 8600, tone: "purple" },
    { kind: "flowers", x: 9750, y: 5600, tone: "gold" },
    { kind: "gnome", x: 9500, y: 1200, angle: 13500, tone: "blue" },
    { kind: "wateringcan", x: 900, y: 12700, angle: 30000 },
    { kind: "tree", x: 9300, y: 13300, r: 1100 },
    { kind: "flowerpot", x: 900, y: 1300, r: 480, tone: "red" },
  ],
});

const lilyPond = hole({
  id: "lily-pond",
  name: "Lily Pond",
  par: 3,
  tip: "Over the plank bridge to the island. There is no rail on the bridge: in the water costs a stroke, and you play again from where you were.",
  tee: [5200, 12000],
  cup: [6800, 3700],
  // The bank the tee is on, the bridge, and the island: one piece of ground.
  green: [
    [[2200, 10800], [8200, 10800], [8200, 12300], [7500, 13000], [2900, 13000], [2200, 12300]],
    rect(4400, 7500, 6000, 10900),
    [[4100, 2200], [6300, 2200], [7800, 3700], [7800, 5900], [6300, 7600], [4100, 7600], [2600, 5900], [2600, 3700]],
  ],
  decks: [{ points: rect(4400, 7600, 6000, 10800), surface: "deck", level: 160 }],
  // Rails round the back of the bank and behind the cup. Everything else is open to the pond.
  rails: [{ points: [[2200, 10800], [2200, 12300], [2900, 13000], [7500, 13000], [8200, 12300], [8200, 10800]] }, { points: [[2600, 5900], [2600, 3700], [4100, 2200], [6300, 2200], [7800, 3700], [7800, 5900]] }],
  // The pond is everything inside its bank that isn't the island or the bridge.
  water: [
    {
      points: [
        [2600, 900], [7800, 900], [9500, 2600], [9500, 9200], [8200, 10800], [6000, 10800], [6000, 7600], [6300, 7600], [7800, 5900], [7800, 3700], [6300, 2200], [4100, 2200], [2600, 3700], [2600, 5900], [4100, 7600], [4400, 7600], [4400, 10800], [2200, 10800], [900, 9200], [900, 2600],
      ],
    },
  ],
  blocks: [{ points: octagon(4300, 4700, 420), kind: "stone", height: 350 }],
  decor: [
    { kind: "lilypad", x: 2300, y: 8300, r: 520, angle: 4000 },
    { kind: "lilypad", x: 3200, y: 9400, r: 380, angle: 15000, tone: "pink" },
    { kind: "lilypad", x: 8200, y: 8000, r: 480, angle: 30000, tone: "pink" },
    { kind: "lilypad", x: 7300, y: 9300, r: 340, angle: 9000 },
    { kind: "lilypad", x: 8700, y: 4600, r: 420, angle: 20000 },
    { kind: "lilypad", x: 1700, y: 4300, r: 400, angle: 1000, tone: "white" },
    { kind: "fish", x: 7400, y: 7200, angle: 21000, tone: "orange" },
    { kind: "fish", x: 2000, y: 6400, angle: 3000, tone: "gold" },
    { kind: "fish", x: 8700, y: 2900, angle: 12000, tone: "white" },
    { kind: "duck", x: 3000, y: 1700, angle: 2000 },
    { kind: "reeds", x: 1500, y: 10200 },
    { kind: "reeds", x: 9000, y: 9900 },
    { kind: "reeds", x: 1300, y: 2100 },
    { kind: "rock", x: 9100, y: 1500, r: 480 },
    { kind: "bush", x: 900, y: 12300, r: 650 },
    { kind: "flowers", x: 9300, y: 12300, tone: "gold" },
    { kind: "gnome", x: 1300, y: 11300, angle: 31500, tone: "red" },
  ],
});

const toadstools = hole({
  id: "toadstools",
  name: "Toadstool Ring",
  par: 3,
  tip: "Toadstools knock the ball away, hard. There's one right between you and the cup: go round it, or bounce in off a board.",
  frame: LANDSCAPE,
  tee: [2900, 5200],
  teeFacing: 0,
  cup: [11200, 5200],
  green: [cut(1300, 1200, 12700, 9200, 1900)],
  bumpers: [{ at: [7000, 5200] }, { at: [8900, 3300] }, { at: [8900, 7100] }, { at: [5300, 2900] }, { at: [5300, 7500] }, { at: [11000, 3000], r: 320 }, { at: [11000, 7400], r: 320 }],
  decor: [
    { kind: "tree", x: 1200, y: 1300, r: 1300 },
    { kind: "gnome", x: 12900, y: 1500, angle: 13500, tone: "green" },
    { kind: "gnome", x: 13100, y: 8900, angle: 22500, tone: "red" },
    { kind: "flowers", x: 800, y: 8800, tone: "white" },
    { kind: "flowers", x: 5000, y: 600, tone: "purple" },
    { kind: "flowers", x: 9000, y: 9800, tone: "gold" },
    { kind: "bush", x: 13350, y: 5200, r: 480 },
    { kind: "steppingstone", x: 700, y: 4400, r: 420 },
    { kind: "steppingstone", x: 600, y: 5600, r: 380 },
    { kind: "rock", x: 2300, y: 9700, r: 420 },
  ],
});

const terraces = hole({
  id: "terraces",
  name: "The Terraces",
  par: 4,
  tip: "You can roll down a step but never up one. Take the ramp on the left to the top, then drop down to the cup.",
  tee: [6600, 11600],
  cup: [7400, 6500],
  material: "stone",
  // The top-left corner is a slanted board: a firm putt up the ramp is turned along the top terrace.
  green: [[[3400, 1000], [8400, 1000], [9200, 1800], [9200, 12200], [8400, 13000], [2000, 13000], [1200, 12200], [1200, 3200]]],
  decks: [
    { points: [[3400, 1000], [8400, 1000], [9200, 1800], [9200, 4400], [1200, 4400], [1200, 3200]], level: 600 },
    { points: rect(3900, 4400, 9200, 8600), level: 300 },
  ],
  // The fence between the ramp and the middle terrace.
  blocks: [{ points: rect(3600, 4400, 3900, 8600), kind: "timber", height: 400 }],
  ledges: [
    { points: [[3900, 4400], [9200, 4400]], drop: 300 },
    { points: [[3900, 8600], [9200, 8600]], drop: 300 },
  ],
  slopes: [{ shape: { points: rect(1200, 4400, 3600, 8600) }, pull: [0, 7500] }],
  decor: [
    { kind: "rock", x: 9800, y: 4400, r: 520 },
    { kind: "rock", x: 9750, y: 8600, r: 470 },
    { kind: "rock", x: 600, y: 8700, r: 430 },
    { kind: "bush", x: 600, y: 4700, r: 520 },
    { kind: "flowers", x: 9800, y: 6500, tone: "pink" },
    { kind: "flowers", x: 9800, y: 2600, tone: "gold" },
    { kind: "birdbath", x: 1700, y: 1400, r: 620 },
    { kind: "gnome", x: 9700, y: 12600, angle: 22500, tone: "gold" },
    { kind: "flowerpot", x: 700, y: 12800, r: 460, tone: "purple" },
  ],
});

const moleRun = hole({
  id: "mole-run",
  name: "Mole Run",
  par: 3,
  tip: "A ball that drops down a mole's hole pops up from a molehill somewhere else. The hole on the right is the one you want.",
  tee: [6900, 11700],
  cup: [3300, 2700],
  green: [[[2400, 1000], [6200, 1000], [7200, 2000], [7200, 5200], [9200, 7200], [9200, 12000], [8200, 13000], [3800, 13000], [2800, 12000], [2800, 7600], [1400, 6200], [1400, 2000]]],
  slopes: mound(3300, 2700, 600, 1500, 6500),
  tunnels: [
    // The decoy, right on the line to the cup: it brings the ball back towards the tee.
    { kind: "burrow", from: [5300, 7600], r: 420, maxSpeed: 14000, to: [4200, 11600], angle: 1500, speed: 2600, ticks: 50, enter: 9000 },
    // The good one: out beside the cup's hill.
    { kind: "burrow", from: [8300, 8300], r: 420, maxSpeed: 14000, to: [5900, 3900], angle: 20500, speed: 3200, ticks: 60, enter: 9000 },
  ],
  blocks: [{ points: octagon(6300, 9300, 430), kind: "pot", height: 600 }],
  scenery: [{ shape: { points: [[7700, 900], [9600, 900], [9600, 5200], [8900, 5900], [7700, 4700]] }, surface: "soil" }],
  decor: [
    { kind: "molehill", x: 1500, y: 9800, r: 560, tone: "black" },
    { kind: "molehill", x: 900, y: 11500, r: 420 },
    { kind: "bush", x: 8600, y: 1700, r: 430 },
    { kind: "bush", x: 8700, y: 2900, r: 430 },
    { kind: "bush", x: 8600, y: 4100, r: 430 },
    { kind: "spade", x: 9400, y: 5300, angle: 24000, tone: "green" },
    { kind: "flowers", x: 600, y: 4200, tone: "white" },
    { kind: "flowers", x: 1700, y: 12800, tone: "gold" },
    { kind: "gnome", x: 9700, y: 13200, angle: 22500, tone: "purple" },
    { kind: "tree", x: 900, y: 900, r: 1050 },
  ],
});

const wholeGarden = hole({
  id: "whole-garden",
  name: "The Whole Garden",
  par: 4,
  tip: "Past the paddling pool, then into the end of the hose: it squirts the ball out on the far side. Mind the toadstools, and drop off the step to the cup.",
  tee: [2700, 11900],
  cup: [7700, 10100],
  // A horseshoe: up the left leg, across the top, down the right.
  green: [[[2200, 1000], [8200, 1000], [9200, 2000], [9200, 10600], [8400, 11400], [7000, 11400], [6200, 10600], [6200, 4200], [4200, 4200], [4200, 12200], [3400, 13000], [2000, 13000], [1200, 12200], [1200, 2000]]],
  // The last green is a step down from everything else.
  decks: [{ points: [[6200, 8600], [9200, 8600], [9200, 10600], [8400, 11400], [7000, 11400], [6200, 10600]], level: -300 }],
  ledges: [{ points: [[6200, 8600], [9200, 8600]], drop: 300, material: "timber" }],
  water: [{ x: 2100, y: 7300, r: 950 }],
  sand: [{ points: octagon(5200, 2600, 1050) }],
  bumpers: [{ at: [8300, 5700] }, { at: [7200, 7500] }],
  tunnels: [{ kind: "hose", from: [3700, 5400], r: 400, to: [6800, 4800], angle: 9000, speed: 4200, ticks: 70, enter: 27000, path: [[3700, 5400], [3800, 4700], [4700, 4500], [5200, 5600], [5900, 6000], [6800, 5400], [6800, 4800]] }],
  scenery: [{ shape: { points: rect(4500, 6600, 5900, 13300) }, surface: "paving" }],
  decor: [
    { kind: "poolring", x: 2100, y: 7300, r: 950, tone: "blue" },
    { kind: "duck", x: 1900, y: 7100, angle: 5000 },
    { kind: "hosereel", x: 5200, y: 7600, angle: 27000 },
    { kind: "wheelbarrow", x: 5200, y: 10200, angle: 9000 },
    { kind: "flowerpot", x: 5200, y: 12500, r: 480, tone: "red" },
    { kind: "gnome", x: 9800, y: 11900, angle: 22500, tone: "red" },
    { kind: "tree", x: 9600, y: 800, r: 1000 },
    { kind: "flowers", x: 600, y: 4000, tone: "pink" },
    { kind: "flowers", x: 600, y: 9800, tone: "white" },
    { kind: "bush", x: 9900, y: 5500, r: 500 },
    { kind: "steppingstone", x: 7300, y: 12400, r: 420 },
    { kind: "steppingstone", x: 8300, y: 13100, r: 400 },
    { kind: "wateringcan", x: 700, y: 12900, angle: 31000 },
  ],
});

export const backGarden: GolfCourse = {
  id: "back-garden",
  name: "The Back Garden",
  holes: [welcomeMat, elbow, sandpit, drainpipe, lilyPond, toadstools, terraces, moleRun, wholeGarden],
};

/** Every course there is. A new course goes here, and the tests play each of its holes. */
export const COURSES: GolfCourse[] = [backGarden];
export const courseOf = (id: unknown): GolfCourse => COURSES.find((c) => c.id === id) ?? backGarden;
