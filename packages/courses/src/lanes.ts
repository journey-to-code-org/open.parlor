// Bowling lanes people make. A lane is painted on a grid laid over the lane between the foul line and
// the pins, one piece a square (a crate, sand, water, a slope, a toadstool bumper, or open lane), and
// turned here into a lane the game plays (a `BowlingLane` in @journey-to-code/games). The game knows
// a lane by its id in LANES; `registerLane` puts one there, wherever the game runs, as
// `registerCourse` does for Mini Golf.
//
// Every lane that saves can be bowled: a computer player's search has to find a ball from the foul
// line that knocks a pin down, with the bumpers down (the harder way).
import { bestRoll, LANE_HALF, LANES, type BowlingLane } from "@journey-to-code/games";
import type { Point } from "@journey-to-code/physics";
import { rectangles } from "./grid.js";

/** What a square of a lane is. */
export const LANE_PIECES = {
  ".": { name: "Lane", hint: "Open lane: nothing in the way" },
  "#": { name: "Crate", hint: "A crate the ball bounces off" },
  s: { name: "Sand", hint: "Slows the ball right down" },
  w: { name: "Water", hint: "A puddle: a ball that rolls in is gone, and knocks nothing more down" },
  "^": { name: "Slope up", hint: "Runs downhill towards the pins: the ball speeds up" },
  v: { name: "Slope down", hint: "Runs downhill back towards the bowler: the ball slows" },
  "<": { name: "Slope left", hint: "Runs downhill to the left: the ball curves left" },
  ">": { name: "Slope right", hint: "Runs downhill to the right: the ball curves right" },
  o: { name: "Bumper", hint: "A toadstool that kicks the ball away" },
} as const;
export type LanePiece = keyof typeof LANE_PIECES;
const LANE_CHARS = new Set(Object.keys(LANE_PIECES));

export interface CustomLane {
  name: string;
  /** Always LANE_COLS by LANE_ROWS: kept so a page can draw the grid without knowing. */
  cols: number;
  rows: number;
  /** One piece a square, row by row from the top (the pins' end) left: `cols * rows` characters. */
  cells: string;
}

/** The grid: ten squares across the lane, and from just short of the head pin back to just past the foul line's ball. */
export const LANE_COLS = 10;
export const LANE_ROWS = 24;
/** A square, in the game's units: the lane's width in ten, and its painted length in 24. */
export const LANE_CELL_W = (2 * LANE_HALF) / LANE_COLS;
export const LANE_CELL_H = 2100;
/** Where the grid starts: in front of the head pin (at 0), clear of the pin deck. */
const TOP = 5000;
export const LANE_LIMITS = { name: 40 } as const;
const SLOPE_PULL = 5000;
const PULLS: Record<string, Point> = { "^": [0, -SLOPE_PULL], v: [0, SLOPE_PULL], "<": [-SLOPE_PULL, 0], ">": [SLOPE_PULL, 0] };

const text = (value: unknown, max: number, or: string) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max) || or;

export function starterLane(): CustomLane {
  return { name: "My lane", cols: LANE_COLS, rows: LANE_ROWS, cells: ".".repeat(LANE_COLS * LANE_ROWS) };
}

/** A lane as a page sent it, made safe: the grid's size, every square a piece. Then `laneProblems`. */
export function normalizeLane(given: unknown): CustomLane {
  const g = (given && typeof given === "object" ? given : {}) as Record<string, unknown>;
  const raw = String(g.cells ?? "");
  let cells = "";
  for (let i = 0; i < LANE_COLS * LANE_ROWS; i++) {
    const ch = raw[i] ?? ".";
    cells += LANE_CHARS.has(ch) ? ch : ".";
  }
  return { name: text(g.name, LANE_LIMITS.name, "My lane"), cols: LANE_COLS, rows: LANE_ROWS, cells };
}

const corner = (c: number, r: number): Point => [Math.round(-LANE_HALF + c * LANE_CELL_W), TOP + r * LANE_CELL_H];
const centre = (c: number, r: number): Point => [Math.round(-LANE_HALF + (c + 0.5) * LANE_CELL_W), TOP + (r + 0.5) * LANE_CELL_H];
const box = ([c, r, w, d]: [number, number, number, number]): Point[] => [corner(c, r), corner(c + w, r), corner(c + w, r + d), corner(c, r + d)];

/** A lane the game plays, from a painted one. */
export function buildLane(l: CustomLane, id: string): BowlingLane {
  const solo = (piece: string) => rectangles(l, (p) => p === piece).map(box);
  const bumpers: Point[] = [];
  for (let i = 0; i < l.cells.length; i++) if (l.cells[i] === "o") bumpers.push(centre(i % l.cols, Math.floor(i / l.cols)));
  return {
    id,
    name: l.name,
    blocks: solo("#").map((points) => ({ points, kind: "crate" as const, height: 900 })),
    // A toadstool sized for a bowling ball, not a golf ball: most of a square.
    bumpers: bumpers.map((at) => ({ at, r: 850 })),
    slopes: (["^", "v", "<", ">"] as const).flatMap((d) => solo(d).map((points) => ({ shape: { points }, pull: PULLS[d]! }))),
    sand: solo("s").map((points) => ({ points })),
    water: solo("w").map((points) => ({ points })),
  };
}

/** Put a lane where the game finds it (LANES), or replace the one with that id. */
function put(lane: BowlingLane) {
  const i = LANES.findIndex((x) => x.id === lane.id);
  if (i >= 0) LANES[i] = lane;
  else LANES.push(lane);
}

let checks = 0;
/** What's wrong with a lane, in words for its maker. Empty: it can be bowled. */
export function laneProblems(l: CustomLane): string[] {
  if (!l.cells.includes(".")) return ["Leave some open lane for the ball to roll on."];
  // The search the computer bowls with, on this lane, with the bumpers down.
  const id = `check-${++checks}`;
  put(buildLane(l, id));
  try {
    if (bestRoll([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { bumpers: false, lane: id }).pins < 1)
      return ["No ball from the foul line gets to the pins. Leave a way through, or something that turns the ball towards them."];
  } finally {
    LANES.splice(
      LANES.findIndex((x) => x.id === id),
      1,
    );
  }
  return [];
}

/** Put a lane where the game finds it, or replace the one with that id. A lane with problems isn't. Resolves to whether it's there. */
export function registerLane(l: CustomLane, id: string): boolean {
  if (laneProblems(l).length) return false;
  put(buildLane(l, id));
  return true;
}

export function unregisterLane(id: string): void {
  const i = LANES.findIndex((x) => x.id === id);
  if (i >= 0 && id !== "plain") LANES.splice(i, 1);
}

export const hasLane = (id: string) => LANES.some((x) => x.id === id);
