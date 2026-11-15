// Mini Golf courses people make. A hole is painted on a grid, one piece a square (green, a wall,
// sand, water, a slope, a bumper, the tee, the cup), and turned here into the same kind of hole the
// built-in courses are made of (see `hole` in @journey-to-code/games). The game knows a course by
// its id in COURSES; `registerCourse` puts one there, wherever the game runs: the server, its bot
// worker threads, and a browser playing a practice game.
//
// A course is data only, checked here whatever a page sent: names are trimmed and capped, a square
// is one of the pieces, and a hole must have one tee and one cup with a way between them that
// doesn't need to cross water or a wall. So every hole that saves is a hole that can be played, by
// people and by the computer players.
import { COURSES, hole, type GolfCourse, type GolfHole } from "@journey-to-code/games";
import type { Point } from "@journey-to-code/physics";

/** What a square of the grid is. */
export const PIECES = {
  ".": { name: "Garden", hint: "Off the course" },
  g: { name: "Green", hint: "Grass to putt on" },
  "#": { name: "Wall", hint: "A brick wall the ball bounces off" },
  s: { name: "Sand", hint: "Slows a ball right down" },
  w: { name: "Water", hint: "In the water: play again, with a penalty stroke" },
  "^": { name: "Slope up", hint: "Runs downhill towards the top" },
  v: { name: "Slope down", hint: "Runs downhill towards the bottom" },
  "<": { name: "Slope left", hint: "Runs downhill to the left" },
  ">": { name: "Slope right", hint: "Runs downhill to the right" },
  o: { name: "Bumper", hint: "A toadstool that kicks the ball away" },
  t: { name: "Tee", hint: "Where every ball starts" },
  c: { name: "Cup", hint: "The hole to putt into" },
} as const;
export type Piece = keyof typeof PIECES;
const PIECE_CHARS = new Set(Object.keys(PIECES));

export interface CustomHole {
  name: string;
  par: number;
  /** One line of advice at the tee. */
  tip: string;
  cols: number;
  rows: number;
  /** One piece a square, row by row from the top left: `cols * rows` characters. */
  cells: string;
}

export interface CustomCourse {
  name: string;
  holes: CustomHole[];
}

/** One square of the grid, in the game's units. */
export const CELL = 800;
/** A margin of garden round the grid, so the rails and the scenery have room. */
const MARGIN = 800;
export const LIMITS = { cols: [5, 13], rows: [5, 17], holes: [1, 9], par: [1, 9], name: 40, holeName: 30, tip: 140 } as const;
/** How hard a slope pulls (units/s²), as on the built-in holes. */
const SLOPE_PULL = 7000;
const PULLS: Record<string, Point> = { "^": [0, -SLOPE_PULL], v: [0, SLOPE_PULL], "<": [-SLOPE_PULL, 0], ">": [SLOPE_PULL, 0] };
/** Pieces a ball can roll over (water takes it; walls and bumpers stop it). */
const ROLLS = new Set(["g", "s", "^", "v", "<", ">", "t", "c"]);

const text = (value: unknown, max: number, or: string) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max) || or;
const whole = (value: unknown, [min, max]: readonly [number, number], or: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : or;
};

/** A first hole to start from: a straight run from the tee up to the cup. */
export function starterHole(n = 1): CustomHole {
  const cols = 7;
  const rows = 13;
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c): string => (c >= 2 && c <= 4 && r >= 1 && r <= 11 ? "g" : ".")));
  grid[2]![3] = "c";
  grid[10]![3] = "t";
  return { name: `Hole ${n}`, par: 2, tip: "", cols, rows, cells: grid.map((row) => row.join("")).join("") };
}

export function starterCourse(): CustomCourse {
  return { name: "My course", holes: [starterHole(1)] };
}

/** A hole as a page sent it, made safe: sizes capped, every square a piece. Then `holeProblems`. */
export function normalizeHole(given: unknown, n = 1): CustomHole {
  const g = (given && typeof given === "object" ? given : {}) as Record<string, unknown>;
  const cols = whole(g.cols, LIMITS.cols, 7);
  const rows = whole(g.rows, LIMITS.rows, 13);
  const raw = String(g.cells ?? "");
  let cells = "";
  for (let i = 0; i < cols * rows; i++) {
    const ch = raw[i] ?? ".";
    cells += PIECE_CHARS.has(ch) ? ch : ".";
  }
  return { name: text(g.name, LIMITS.holeName, `Hole ${n}`), par: whole(g.par, LIMITS.par, 3), tip: String(g.tip ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.tip), cols, rows, cells };
}

export function normalizeCourse(given: unknown): CustomCourse {
  const g = (given && typeof given === "object" ? given : {}) as Record<string, unknown>;
  const holes = (Array.isArray(g.holes) ? g.holes : []).slice(0, LIMITS.holes[1]).map((h, i) => normalizeHole(h, i + 1));
  return { name: text(g.name, LIMITS.name, "My course"), holes };
}

const at = (h: CustomHole, c: number, r: number) => (c < 0 || r < 0 || c >= h.cols || r >= h.rows ? "." : h.cells[r * h.cols + c]!);
const find = (h: CustomHole, piece: string) => {
  const out: [number, number][] = [];
  for (let i = 0; i < h.cells.length; i++) if (h.cells[i] === piece) out.push([i % h.cols, Math.floor(i / h.cols)]);
  return out;
};

/** The shortest way from the tee to the cup over squares a ball can roll on, in squares, and its turns. Null: there's none. */
export function routeOf(h: CustomHole): { squares: number; turns: number } | null {
  const [tee] = find(h, "t");
  const [cup] = find(h, "c");
  if (!tee || !cup) return null;
  const key = (c: number, r: number) => r * h.cols + c;
  const from = new Map<number, number>([[key(...tee), -1]]);
  const queue: [number, number][] = [tee];
  while (queue.length) {
    const [c, r] = queue.shift()!;
    if (c === cup[0] && r === cup[1]) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (!ROLLS.has(at(h, nc, nr)) || from.has(key(nc, nr))) continue;
      from.set(key(nc, nr), key(c, r));
      queue.push([nc, nr]);
    }
  }
  if (!from.has(key(...cup))) return null;
  const path: number[] = [];
  for (let k = key(...cup); k !== -1; k = from.get(k)!) path.push(k);
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    const d1 = path[i - 1]! - path[i]!;
    const d2 = path[i - 2]! - path[i - 1]!;
    if (d1 !== d2) turns++;
  }
  return { squares: path.length - 1, turns };
}

/**
 * A par that suits the hole, as the built-in ones are set: two for a putt straight at the cup, one
 * more for a long way round, and one more for a way with corners in it.
 */
export function suggestPar(h: CustomHole): number {
  const route = routeOf(h);
  if (!route) return 3;
  return 2 + (route.squares >= 10 ? 1 : 0) + (route.turns >= 2 ? 1 : 0);
}

/** What's wrong with a hole, in words for its maker. Empty: it can be played. */
export function holeProblems(h: CustomHole): string[] {
  const problems: string[] = [];
  const tees = find(h, "t").length;
  const cups = find(h, "c").length;
  if (tees !== 1) problems.push(tees ? `${h.name} has ${tees} tees: it needs exactly one.` : `${h.name} needs a tee.`);
  if (cups !== 1) problems.push(cups ? `${h.name} has ${cups} cups: it needs exactly one.` : `${h.name} needs a cup.`);
  if (tees === 1 && cups === 1 && !routeOf(h)) problems.push(`On ${h.name} there's no way from the tee to the cup without crossing water, a wall or a bumper.`);
  return problems;
}

export function courseProblems(c: CustomCourse): string[] {
  if (!c.holes.length) return ["A course needs at least one hole."];
  return c.holes.flatMap(holeProblems);
}

// ---- From a grid to a hole ----------------------------------------------------------------------

/** Rectangles that cover exactly the squares where `on` holds, as few as a simple sweep finds. */
function rectangles(h: CustomHole, on: (piece: string) => boolean): [number, number, number, number][] {
  const used = new Set<number>();
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < h.rows; r++)
    for (let c = 0; c < h.cols; c++) {
      if (used.has(r * h.cols + c) || !on(at(h, c, r))) continue;
      let w = 1;
      while (c + w < h.cols && on(at(h, c + w, r)) && !used.has(r * h.cols + c + w)) w++;
      let d = 1;
      while (r + d < h.rows && Array.from({ length: w }, (_, i) => on(at(h, c + i, r + d)) && !used.has((r + d) * h.cols + c + i)).every(Boolean)) d++;
      for (let y = r; y < r + d; y++) for (let x = c; x < c + w; x++) used.add(y * h.cols + x);
      out.push([c, r, w, d]);
    }
  return out;
}

const corner = (c: number, r: number): Point => [MARGIN + c * CELL, MARGIN + r * CELL];
const centre = (c: number, r: number): Point => [MARGIN + c * CELL + CELL / 2, MARGIN + r * CELL + CELL / 2];
const box = ([c, r, w, d]: [number, number, number, number]): Point[] => [corner(c, r), corner(c + w, r), corner(c + w, r + d), corner(c, r + d)];

/**
 * The outlines of a set of squares: one closed loop round each piece of it, corners only. Squares
 * that touch only at a corner make loops of their own (a ball can't squeeze between them anyway).
 */
function outlines(h: CustomHole, inside: (c: number, r: number) => boolean): Point[][] {
  type Edge = { from: string; to: string; dir: [number, number] };
  const id = (c: number, r: number) => `${c},${r}`;
  const starts = new Map<string, Edge[]>();
  const add = (a: [number, number], b: [number, number]) => {
    const e: Edge = { from: id(...a), to: id(...b), dir: [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])] };
    starts.set(e.from, [...(starts.get(e.from) ?? []), e]);
  };
  // Clockwise round each square (y runs down the screen), on the sides where it meets the outside.
  for (let r = 0; r < h.rows; r++)
    for (let c = 0; c < h.cols; c++) {
      if (!inside(c, r)) continue;
      if (!inside(c, r - 1)) add([c, r], [c + 1, r]);
      if (!inside(c + 1, r)) add([c + 1, r], [c + 1, r + 1]);
      if (!inside(c, r + 1)) add([c + 1, r + 1], [c, r + 1]);
      if (!inside(c - 1, r)) add([c, r + 1], [c, r]);
    }
  const loops: Point[][] = [];
  const left = () => [...starts.values()].find((list) => list.length)?.[0];
  for (let first = left(); first; first = left()) {
    const loop: [number, number][] = [];
    let e: Edge = first;
    do {
      starts.set(e.from, starts.get(e.from)!.filter((x) => x !== e));
      loop.push(e.from.split(",").map(Number) as [number, number]);
      const next: Edge[] = starts.get(e.to) ?? [];
      // At a corner where two loops touch, keep to this one: turn right (towards the inside) first.
      const right: [number, number] = [-e.dir[1], e.dir[0]];
      e = next.find((x) => x.dir[0] === right[0] && x.dir[1] === right[1]) ?? next.find((x) => x.dir[0] === e.dir[0] && x.dir[1] === e.dir[1]) ?? next[0]!;
    } while (e && e !== first && loop.length < 4 * h.cols * h.rows + 4);
    // Corners only: drop the points along a straight side.
    const kept = loop.filter((p, i) => {
      const a = loop[(i + loop.length - 1) % loop.length]!;
      const b = loop[(i + 1) % loop.length]!;
      return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
    });
    if (kept.length >= 3) loops.push(kept.map(([c, r]) => corner(c, r)));
  }
  return loops;
}

/** Garden squares with no way out to the edge of the grid: shut in by the course, they're walls. */
function shutIn(h: CustomHole): Set<number> {
  const open = new Set<number>();
  const queue: [number, number][] = [];
  for (let r = 0; r < h.rows; r++)
    for (let c = 0; c < h.cols; c++)
      if ((r === 0 || c === 0 || r === h.rows - 1 || c === h.cols - 1) && at(h, c, r) === ".") {
        open.add(r * h.cols + c);
        queue.push([c, r]);
      }
  while (queue.length) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= h.cols || nr >= h.rows || at(h, nc, nr) !== "." || open.has(nr * h.cols + nc)) continue;
      open.add(nr * h.cols + nc);
      queue.push([nc, nr]);
    }
  }
  const shut = new Set<number>();
  for (let i = 0; i < h.cells.length; i++) if (h.cells[i] === "." && !open.has(i)) shut.add(i);
  return shut;
}

const TIPS = [
  "Take a look at the whole hole before the first putt.",
  "A soft putt that stops near the cup beats a hard one that skips over it.",
  "Mind the water: it costs a stroke.",
];

/** A hole the game plays, from a painted one. The hole should have no `holeProblems`. */
export function buildHole(h: CustomHole, id: string): GolfHole {
  const shut = shutIn(h);
  const wall = (c: number, r: number) => at(h, c, r) === "#" || shut.has(r * h.cols + c);
  // The course is every square that isn't open garden; walls stand on it.
  const onCourse = (c: number, r: number) => c >= 0 && r >= 0 && c < h.cols && r < h.rows && (at(h, c, r) !== "." || shut.has(r * h.cols + c));
  const solo = (piece: string) => rectangles(h, (p) => p === piece).map(box);
  const [tee] = find(h, "t");
  const [cup] = find(h, "c");
  const cells = { ...h, cells: [...h.cells].map((p, i) => (shut.has(i) ? "#" : p)).join("") };
  return hole({
    id,
    name: h.name,
    par: h.par,
    tip: h.tip || TIPS[h.cells.length % TIPS.length]!,
    tee: centre(...tee!),
    cup: centre(...cup!),
    material: "timber",
    frame: { x: 0, y: 0, w: h.cols * CELL + 2 * MARGIN, h: h.rows * CELL + 2 * MARGIN },
    green: outlines(h, onCourse),
    blocks: rectangles(cells, (p) => p === "#").map((r) => ({ points: box(r), kind: "brick" as const, height: 500 })),
    sand: solo("s").map((points) => ({ points })),
    water: solo("w").map((points) => ({ points })),
    slopes: (["^", "v", "<", ">"] as const).flatMap((d) => solo(d).map((points) => ({ shape: { points }, pull: PULLS[d]! }))),
    bumpers: find(h, "o").map(([c, r]) => ({ at: centre(c, r), r: 340 })),
    // A little garden round the course, the way the built-in holes have one.
    decor: [
      { kind: "flowers", x: MARGIN / 2, y: MARGIN / 2, tone: "pink" },
      { kind: "bush", x: h.cols * CELL + MARGIN * 1.5, y: MARGIN / 2, r: 420 },
      { kind: "flowers", x: h.cols * CELL + MARGIN * 1.5, y: h.rows * CELL + MARGIN * 1.5, tone: "gold" },
    ],
  });
}

/** The game's name for a course people made: one id a version, so a table keeps the holes it started on. */
export const courseId = (doc: string, version: number) => `custom-${doc}-${version}`;
export const isCustomCourse = (id: unknown): id is string => typeof id === "string" && /^custom-[a-z0-9]+-\d+$/.test(id);

export function buildCourse(c: CustomCourse, id: string): GolfCourse {
  return { id, name: c.name, holes: c.holes.map((h, i) => buildHole(h, `${id}-${i + 1}`)) };
}

/**
 * Put a course where the game finds it (COURSES), or replace the one with that id. A course with
 * problems isn't put there. Resolves to whether it's there now.
 */
export function registerCourse(c: CustomCourse, id: string): boolean {
  if (courseProblems(c).length) return false;
  const built = buildCourse(c, id);
  const i = COURSES.findIndex((x) => x.id === id);
  if (i >= 0) COURSES[i] = built;
  else COURSES.push(built);
  return true;
}

export function unregisterCourse(id: string): void {
  const i = COURSES.findIndex((x) => x.id === id);
  if (i >= 0 && isCustomCourse(id)) COURSES.splice(i, 1);
}

export const hasCourse = (id: string) => COURSES.some((x) => x.id === id);
