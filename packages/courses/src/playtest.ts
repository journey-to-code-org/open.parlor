// Playing a hole or a lane before it's saved: the computer plays it, the way a player at a table
// would, and the result says whether people will be able to. A route on the grid isn't enough:
// slopes pull, sand stops a ball, a bridge over water is narrow, a tunnel spits the ball out where
// it does, and only playing it finds out.
//
// A hole is played several times by a decent player (the computer's own putting, with a player's
// slips in aim and strength), and once by a perfect one. A hole the decent player never gets in is
// one people won't either, even when perfect aim can: that's "unplayable", and an editor won't save
// it. The decent tries say how hard the rest are and what par they play to. One typical try is
// kept, shot by shot, so an editor can show it.
import { bowling, LANES, miniGolf, newBowling, newMiniGolf, nineHoles, tenFrames, type BowlingMove, type MiniGolfState, type SportShot } from "@journey-to-code/games";
import { buildCourse, type CustomHole } from "./index.js";
import { buildLane, type CustomLane } from "./lanes.js";
import { COURSES } from "@journey-to-code/games";

/** The same random numbers every time for the same seed: a playtest gives the same answer twice. */
function seeded(seed: number) {
  let r = seed >>> 0 || 1;
  return () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export interface Attempt {
  /** Strokes taken, the penalty strokes included; more than `limit` when it wasn't holed. */
  strokes: number;
  holed: boolean;
  /** Every shot, as a table records it: enough to play it again (see SportShot). */
  shots: SportShot[];
  /** What went wrong on the way, in a few words each: "in the water", "off the course". */
  trouble: string[];
}

export interface HoleTest {
  /** The decent player's tries. */
  tries: number;
  holed: number;
  /** Average strokes over the tries that holed out. */
  average: number | null;
  /** The par the hole plays to, from the decent player's strokes. */
  par: number;
  /** Most strokes a hole allows before picking up. */
  limit: number;
  /** Can a perfect player hole it at all? (When it can and a decent one never did, it's still unplayable: too hard for people.) */
  possible: boolean;
  /** How it plays, for its maker: "easy", "fair", "hard", "very hard", or "unplayable" (a decent player never got it in). */
  rating: "easy" | "fair" | "hard" | "very hard" | "unplayable";
  /** One typical try, for showing. */
  shown: Attempt;
}

let tests = 0;

/** One hole, alone on a course of its own in the game's list while it's played, and taken out again. */
function onItsOwn<T>(hole: CustomHole, play: (course: string) => T): T {
  const id = `custom-playtest${++tests}-1`;
  COURSES.push(buildCourse({ name: "Playtest", holes: [hole] }, id));
  try {
    return play(id);
  } finally {
    COURSES.splice(
      COURSES.findIndex((c) => c.id === id),
      1,
    );
  }
}

const troubleOf = (s: MiniGolfState): string | null => {
  const said = s.narration ?? "";
  if (/finds the water/i.test(said)) return "in the water";
  if (/is off the course/i.test(said)) return "off the course";
  return null;
};

function attempt(course: string, skill: number, seed: number): Attempt {
  const rules = miniGolf.normalize({ ...nineHoles, course, holes: 1 });
  let s = newMiniGolf(rules, 1, seed);
  const rand = seeded(seed);
  const shots: SportShot[] = [];
  const trouble: string[] = [];
  for (let n = 0; n < rules.limit + 4 && s.phase !== "finished"; n++) {
    const move = miniGolf.bot(s, 0, { skill, sloppy: skill >= 1 ? 0 : 0.05 } as never, skill >= 1 ? () => 0.5 : rand);
    if (!move) break;
    s = miniGolf.apply(s, 0, move);
    const last = s.lasts[0];
    if (last && last !== shots.at(-1)) shots.push(last);
    const t = troubleOf(s);
    if (t) trouble.push(t);
  }
  const strokes = (s as unknown as { card: number[][] }).card[0]?.[0] ?? rules.limit + 1;
  return { strokes, holed: strokes <= rules.limit, shots, trouble };
}

/** How a decent player gets on with a hole, and whether a perfect one can hole it. The hole should have no `holeProblems`. */
export function playtestHole(hole: CustomHole, { tries = 6, skill = 0.5, seed = 7 }: { tries?: number; skill?: number; seed?: number } = {}): HoleTest {
  return onItsOwn(hole, (course) => {
    const limit = miniGolf.normalize({ ...nineHoles, course, holes: 1 }).limit;
    const perfect = attempt(course, 1, seed);
    const all = Array.from({ length: tries }, (_, i) => attempt(course, skill, seed + 101 * (i + 1)));
    const holedOut = all.filter((a) => a.holed);
    const average = holedOut.length ? holedOut.reduce((n, a) => n + a.strokes, 0) / holedOut.length : null;
    const share = holedOut.length / tries;
    const rating: HoleTest["rating"] = !perfect.holed || share === 0 ? "unplayable" : share === 1 && (average ?? 9) <= 2.6 ? "easy" : share >= 0.8 ? "fair" : share >= 0.5 ? "hard" : "very hard";
    // The par it plays to: what the decent player takes, rounded, or what a perfect one takes and one more.
    const par = Math.max(1, Math.min(9, average !== null ? Math.round(average) : perfect.strokes + 1));
    // Show the try nearest the typical one; when none holed, the perfect one, so the maker sees the way it can be done.
    const sorted = [...all].sort((a, b) => a.strokes - b.strokes);
    const shown = holedOut.length ? sorted[Math.floor((holedOut.length - 1) / 2)]! : perfect;
    return { tries, holed: holedOut.length, average, par, limit, possible: perfect.holed, rating, shown };
  });
}

/** Just whether a perfect player can hole it: quick, for a server checking a course it's sent. */
export function canBeHoled(hole: CustomHole, seed = 7): boolean {
  return onItsOwn(hole, (course) => attempt(course, 1, seed).holed);
}

// ---- Lanes --------------------------------------------------------------------------------------

export interface LaneTest {
  /** Pins a decent bowler knocks down with a first ball, on average over the tries. */
  firstBall: number;
  /** A perfect bowler's first ball. */
  best: number;
  rating: "easy" | "fair" | "hard" | "very hard" | "unplayable";
  /** One typical first ball, for showing. */
  shown: SportShot | null;
}

/** How a decent bowler gets on with a lane: first balls at a full rack. */
export function playtestLane(lane: CustomLane, { tries = 8, skill = 0.5, seed = 7 }: { tries?: number; skill?: number; seed?: number } = {}): LaneTest {
  const id = `custom-lanetest${++tests}-1`;
  LANES.push(buildLane(lane, id));
  try {
    const rules = { ...tenFrames, lane: id };
    const first = (style: { skill: number }, rand: () => number) => {
      const s = newBowling(rules, 1, seed);
      const move = bowling.bot(s, 0, { ...style, sloppy: 0 } as never, rand) as BowlingMove;
      const after = bowling.apply(s, 0, move);
      return { pins: after.rolls[0]![0] ?? 0, shot: after.last };
    };
    const best = first({ skill: 1 }, () => 0.5);
    const rand = seeded(seed);
    const balls = Array.from({ length: tries }, () => first({ skill }, rand));
    const firstBall = balls.reduce((n, b) => n + b.pins, 0) / tries;
    const rating: LaneTest["rating"] = best.pins === 0 ? "unplayable" : firstBall >= 8 ? "easy" : firstBall >= 6 ? "fair" : firstBall >= 3.5 ? "hard" : "very hard";
    const typical = [...balls].sort((a, b) => a.pins - b.pins)[Math.floor(tries / 2)]!;
    return { firstBall: Math.round(firstBall * 10) / 10, best: best.pins, rating, shown: typical.shot };
  } finally {
    LANES.splice(
      LANES.findIndex((l) => l.id === id),
      1,
    );
  }
}

