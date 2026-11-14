// Mini Golf, for one to six players: the first game on the physics core and on the table-sports
// kit. Putt the ball into the cup in as few strokes as you can, hole after hole; the lowest total
// wins.
//
// Each player has a ball of their own colour. Whether balls touch depends on how the table plays.
//
// *In turn*, every ball that is out on the hole is on the table for every shot, and balls knock
// into each other as they would on a real green. What a family would expect then happens:
//  - a ball that is knocked stays where it comes to rest, and its owner plays it from there;
//  - a ball knocked into the cup is holed for its owner, at the strokes they had already taken
//    (a house rule, `knockIn`: turned off, it is put back where it lay);
//  - a ball knocked into the water or off the course goes back where it lay, at no cost to anyone:
//    only the player who struck pays for where their own ball ends up.
// Everyone starts from the same tee, so a ball still lying on it (a timid putt, or one sent back
// from the water) is lifted while the next player tees off and put back afterwards: it is drawn
// faintly and can't be hit. The same goes for any ball lying on top of the one being struck, which
// only a ball put back can be. Nothing else is ever lifted. A table can also turn all of this off
// (`collide`), and balls then pass through each other as they do when everyone plays at once.
//
// *Everyone at once*, balls can't collide, because there is no one table: each player plays the
// hole at their own pace, and one may be holing out while another is still on the tee. Each shot
// is simulated with only the striker's ball, and the other balls are drawn as faint ghosts.
//
// Who putts when is a house rule. *In turn*: everyone tees off in order (the honour moves round
// one seat a hole), and after that whoever is furthest from the cup plays next, as on a real
// green. *Everyone at once*: no turns; each player plays the hole at their own pace and the table
// moves on when all of them have holed out or picked up.
//
// What is stored, and why (the replay decision). The state keeps where every ball lies as whole
// numbers and, for the last shot each seat took, the shot, the bodies it started from, where the
// physics came to rest and the physics version that played it. A view is made from that alone:
// nothing is simulated to draw a table, and what a browser animates is checked against the stored
// rest. The room on the server, though, rebuilds a table after a restart by replaying its move
// log through `apply`, which simulates each shot again. The physics core is bit-for-bit
// deterministic (test/minigolf.test.ts steps a recorded shot and compares), so under the same
// PHYSICS_VERSION and the same course data a replay is exact. A change to either can only alter
// rounds that are in progress across the deploy: finished rounds are never replayed for their
// results, and a replayed round stays a legal game (every logged shot is still a shot), it may
// just come out differently. Making history immune to that needs the room to keep a snapshot of
// the state beside the move log, which is on the roadmap for the rooms kit and not something an
// engine can do from inside `apply`.
import { PHYSICS_VERSION, simulate, type Point, type Shape, type World } from "@cardroom/physics";
import type { PlayStyle } from "@spades/rules";
import { BALL_RADIUS, courseOf, COURSES, holeWorld, type GolfHole, type PlacedBall } from "./minigolfcourse.js";
import { angleTo, restOf, type ShotMove, type SportBody, type SportCard, type SportGame, type SportGhost, type SportShot, type SportTone, type SportView } from "./sport.js";
import { careless, clone, GameError, markReady, nextHandChoices, nextRandom, rankSeats, thinkFor, who, type BaseRules, type RoundResult } from "./table.js";

export interface MiniGolfRules extends BaseRules {
  /** Which course (see COURSES). */
  course: string;
  /** How many of its holes to play, from the first. */
  holes: number;
  /** In turn, or everyone at once. */
  order: "turns" | "together";
  /** Strokes allowed on a hole. Not in by then: pick up, and write down one more than this. */
  limit: number;
  /** Strokes added for a ball in the water or off the course. It is played again from where it was struck. */
  penalty: number;
  /** In turn: balls knock into each other. (Everyone at once, they never do.) */
  collide: boolean;
  /** A ball knocked into the cup by someone else's counts as holed. Off: it is put back where it lay. */
  knockIn: boolean;
}

export const nineHoles: MiniGolfRules = { id: "minigolf-nine", name: "Nine holes, in turn", course: "back-garden", holes: 9, order: "turns", limit: 6, penalty: 1, collide: true, knockIn: true };
export const nineTogether: MiniGolfRules = { id: "minigolf-together", name: "Nine holes, all at once", course: "back-garden", holes: 9, order: "together", limit: 6, penalty: 1, collide: true, knockIn: true };
export const quickThree: MiniGolfRules = { id: "minigolf-quick", name: "Quick three, in turn", course: "back-garden", holes: 3, order: "turns", limit: 6, penalty: 1, collide: true, knockIn: true };
export const quickTogether: MiniGolfRules = { id: "minigolf-quick-together", name: "Quick three, all at once", course: "back-garden", holes: 3, order: "together", limit: 6, penalty: 1, collide: true, knockIn: true };
const PRESETS = [nineHoles, nineTogether, quickThree, quickTogether];

/** The gentlest and hardest a ball may be struck. A putt of nothing would be a stroke that moves nothing. */
export const MIN_POWER = 20;
export const MAX_POWER = 1000;

export interface GolfBall {
  x: number;
  y: number;
  /** Strokes on this hole so far, penalties included. */
  strokes: number;
  /** Has left the tee on this hole. */
  teed: boolean;
  done: "holed" | "pickup" | null;
}

export interface MiniGolfState {
  game: "minigolf";
  rules: MiniGolfRules;
  seats: number;
  rng: number;
  /** The physics that plays this table's shots. */
  physics: number;
  /** Which hole, from 0. */
  hole: number;
  /** Who tees off first on this hole. */
  first: number;
  /** In turn: whose shot it is. Everyone at once: always null. */
  turn: number | null;
  balls: GolfBall[];
  /** What each seat wrote down for each hole: card[seat][hole]; null until the hole is finished. */
  card: (number | null)[][];
  /** Shots taken in the whole round. */
  shots: number;
  /** Each seat's last shot on this hole. */
  lasts: (SportShot | null)[];
  phase: "playing" | "holed" | "finished";
  ready: boolean[];
  narration: string | null;
}

export type MiniGolfMove = ShotMove | { type: "next" };

const holesOf = (s: { rules: MiniGolfRules }): GolfHole[] => courseOf(s.rules.course).holes.slice(0, s.rules.holes);
const holeOf = (s: Pick<MiniGolfState, "rules" | "hole">): GolfHole => holesOf(s)[s.hole]!;
export const ballId = (seat: number) => `ball-${seat}`;
const seatOfBall = (id: string) => (id.startsWith("ball-") ? Number(id.slice(5)) : -1);
const cupOf = (h: GolfHole) => h.world.pockets[0]!;
/** Whether this table's balls knock into each other: in turn, unless the house says no. */
export const ballsCollide = (rules: MiniGolfRules) => rules.order === "turns" && rules.collide;

/** A ball lying this close to the tee (centre to centre) is lifted while someone tees off. */
export const TEE_CLEAR = 3 * BALL_RADIUS;

/**
 * The balls on the hole for a shot by `striker` (or, with nobody to play, as they lie), in seat
 * order, and the seats whose balls are lifted out of the way for it.
 *
 * Where balls collide that is every ball that has left the tee, with the ones that are in or
 * picked up marked as out of play, so the list is the same list for everyone at the table.
 * Where they don't, it is the striker's ball alone.
 */
function onTheTable(s: MiniGolfState, striker: number | null): { balls: PlacedBall[]; lifted: number[] } {
  const mark = (seat: number): PlacedBall => {
    const b = s.balls[seat]!;
    return { id: ballId(seat), x: b.x, y: b.y, ...(b.done ? { pocketed: b.done === "holed" ? "cup" : "pickup" } : {}) };
  };
  if (!ballsCollide(s.rules)) return { balls: striker === null ? [] : [mark(striker)], lifted: [] };
  const mine = striker === null ? null : s.balls[striker]!;
  const balls: PlacedBall[] = [];
  const lifted: number[] = [];
  s.balls.forEach((b, seat) => {
    if (seat === striker || b.done) return void balls.push(mark(seat));
    // Not yet teed off: still in its owner's hand.
    if (!b.teed) return;
    if (mine) {
      const reach = mine.teed ? 2 * BALL_RADIUS : TEE_CLEAR;
      if ((b.x - mine.x) * (b.x - mine.x) + (b.y - mine.y) * (b.y - mine.y) < reach * reach) return void lifted.push(seat);
    }
    balls.push(mark(seat));
  });
  return { balls, lifted };
}

function startHole(s: MiniGolfState, hole: number) {
  const h = holesOf(s)[hole]!;
  s.hole = hole;
  s.balls = Array.from({ length: s.seats }, () => ({ x: h.tee[0], y: h.tee[1], strokes: 0, teed: false, done: null }));
  s.lasts = Array<null>(s.seats).fill(null);
  s.phase = "playing";
  s.ready = Array<boolean>(s.seats).fill(false);
  s.narration = null;
  s.turn = s.rules.order === "turns" ? nextUp(s) : null;
}

export function newMiniGolf(rules: MiniGolfRules, seats: number, seed: number): MiniGolfState {
  const s = { game: "minigolf", rules, seats, rng: seed >>> 0, physics: PHYSICS_VERSION, shots: 0 } as MiniGolfState;
  s.card = Array.from({ length: seats }, () => Array<null>(holesOf(s).length).fill(null));
  s.first = Math.floor(nextRandom(s)() * seats);
  startHole(s, 0);
  return s;
}

/** Seats in the order they tee off on this hole. */
const teeOrder = (s: Pick<MiniGolfState, "first" | "seats">) => Array.from({ length: s.seats }, (_, i) => (s.first + i) % s.seats);

/**
 * In turn: who plays next. Anyone still on the tee goes first, in tee order; after that it is
 * whoever lies furthest from the cup (the earlier in tee order if two are as far).
 */
function nextUp(s: MiniGolfState): number | null {
  const order = teeOrder(s).filter((seat) => !s.balls[seat]!.done);
  const onTee = order.find((seat) => !s.balls[seat]!.teed);
  if (onTee !== undefined) return onTee;
  const cup = cupOf(holeOf(s));
  const far = (seat: number) => (s.balls[seat]!.x - cup.x) * (s.balls[seat]!.x - cup.x) + (s.balls[seat]!.y - cup.y) * (s.balls[seat]!.y - cup.y);
  let best: number | null = null;
  for (const seat of order) if (best === null || far(seat) > far(best)) best = seat;
  return best;
}

// ---- Scores -------------------------------------------------------------------------------------

/** A seat's strokes so far: finished holes and the one in play. */
const totalOf = (s: MiniGolfState, seat: number) => s.card[seat]!.reduce<number>((n, v) => n + (v ?? 0), 0) + (s.card[seat]![s.hole] === null ? s.balls[seat]!.strokes : 0);
/** Against par, over the holes a seat has finished. */
const toParOf = (s: MiniGolfState, seat: number) => holesOf(s).reduce((n, h, i) => (s.card[seat]![i] === null ? n : n + s.card[seat]![i]! - h.par), 0);
const parText = (n: number) => (n === 0 ? "Level" : n > 0 ? `+${n}` : `−${-n}`);
const strokesText = (n: number) => `${n} stroke${n === 1 ? "" : "s"}`;

/** What golfers call a score on a hole. */
export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return "a hole in one";
  return { [-2]: "an eagle", [-1]: "a birdie", 0: "par", 1: "a bogey", 2: "a double bogey" }[strokes - par] ?? `${strokes}`;
}

const winnersOf = (s: MiniGolfState) => {
  const totals = Array.from({ length: s.seats }, (_, seat) => totalOf(s, seat));
  const best = Math.min(...totals);
  return totals.flatMap((t, seat) => (t === best ? [seat] : []));
};

// ---- Moves --------------------------------------------------------------------------------------

function apply(state: MiniGolfState, seat: number, move: MiniGolfMove): MiniGolfState {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.seats) throw new GameError("That's not a seat at this table.");
  if (move?.type === "next") {
    if (state.phase !== "holed") throw new GameError("The hole isn't finished yet.");
    const s = clone(state);
    if (markReady(s.ready, seat)) {
      // The honour moves round a seat each hole.
      s.first = (s.first + 1) % s.seats;
      startHole(s, s.hole + 1);
    }
    return s;
  }
  if (move?.type !== "shot") throw new GameError("That's not a move in Mini Golf.");
  if (state.phase !== "playing") throw new GameError(state.phase === "finished" ? "This round is over." : "Everyone is in. On to the next hole.");
  const ball = state.balls[seat]!;
  if (ball.done) throw new GameError(ball.done === "holed" ? "You've holed out. Waiting for the others." : "You've picked up on this hole.");
  if (state.turn !== null && state.turn !== seat) throw new GameError("It's not your shot.");
  if (move.body !== ballId(seat)) throw new GameError("That's not your ball.");
  if (!Number.isInteger(move.angle) || move.angle < 0 || move.angle >= 36000) throw new GameError("Aim somewhere first.");
  if (!Number.isInteger(move.power) || move.power < MIN_POWER || move.power > MAX_POWER) throw new GameError("That's not a putt: too soft or too hard.");

  const s = clone(state);
  const h = holeOf(s);
  const mine = s.balls[seat]!;
  const shot = { body: ballId(seat), angle: move.angle, power: move.power };
  const before = holeWorld(h, onTheTable(s, seat).balls);
  const played = simulate(before, shot);
  const at = played.world.bodies.find((b) => b.id === shot.body)!;
  s.shots += 1;
  s.lasts[seat] = { n: s.shots, seat, shot, from: before.bodies, rest: restOf(played.world), ticks: played.ticks, physics: PHYSICS_VERSION };
  mine.strokes += 1;
  mine.teed = true;

  if (at.pocketed !== undefined) {
    mine.done = "holed";
    mine.x = at.x;
    mine.y = at.y;
    const name = scoreName(mine.strokes, h.par);
    s.narration = mine.strokes === 1 ? `${who(seat)} makes a hole in one!` : `${who(seat)} holes out in ${mine.strokes}${/^\d/.test(name) ? "" : `: ${name}`}`;
  } else if (at.out !== undefined) {
    // Wet, or off the course: the ball goes back to where it was struck from, at a cost.
    mine.strokes += s.rules.penalty;
    const cost = s.rules.penalty ? `, plus ${strokesText(s.rules.penalty)}` : "";
    s.narration = `${who(seat)} ${at.out === "bounds" ? "is off the course" : "finds the water"}: back where it was${cost}`;
  } else {
    mine.x = at.x;
    mine.y = at.y;
    const lipped = played.events.some((e) => e.type === "skip" && e.body === shot.body);
    s.narration = lipped ? `${who(seat)} runs it over the cup: too fast to drop` : `${who(seat)} putts`;
  }
  if (!mine.done && mine.strokes >= s.rules.limit) {
    mine.done = "pickup";
    s.narration = `${who(seat)} picks up after ${s.rules.limit} and writes down ${s.rules.limit + 1}`;
  }
  if (mine.done) s.card[seat]![s.hole] = mine.done === "holed" ? Math.min(mine.strokes, s.rules.limit + 1) : s.rules.limit + 1;

  // The other balls on the table: wherever the shot left them, by the rules at the top of this file.
  const said: string[] = [];
  for (const body of played.world.bodies) {
    const other = seatOfBall(body.id);
    const ball = s.balls[other];
    if (other === seat || !ball || ball.done) continue;
    if (body.pocketed !== undefined && s.rules.knockIn) {
      ball.done = "holed";
      ball.x = body.x;
      ball.y = body.y;
      s.card[other]![s.hole] = Math.min(ball.strokes, s.rules.limit + 1);
      said.push(`${who(other)}'s ball is knocked into the cup: in, in ${ball.strokes}`);
    } else if (body.pocketed !== undefined) said.push(`${who(other)}'s ball is knocked into the cup, and goes back where it was`);
    else if (body.out !== undefined) said.push(`${who(other)}'s ball is knocked ${body.out === "bounds" ? "off the course" : "into the water"}, and goes back where it was`);
    else if (body.x !== ball.x || body.y !== ball.y) {
      ball.x = body.x;
      ball.y = body.y;
      said.push(`${who(other)}'s ball is knocked away`);
    }
  }
  if (said.length) s.narration = `${s.narration}. ${said.join(". ")}`;

  if (s.balls.every((b) => b.done)) {
    s.turn = null;
    s.phase = s.hole + 1 >= holesOf(s).length ? "finished" : "holed";
  } else if (s.rules.order === "turns") s.turn = nextUp(s);
  return s;
}

// ---- What a seat sees ---------------------------------------------------------------------------

const TONES: SportTone[] = ["white", "red", "blue", "gold", "purple", "orange"];
const lookOf = (seat: number): SportBody => ({ id: ballId(seat), owner: seat, kind: "ball", tone: TONES[seat % TONES.length]!, label: `${who(seat)}'s ball` });

function cardOf(s: MiniGolfState): SportCard {
  const holes = holesOf(s);
  return {
    title: courseOf(s.rules.course).name,
    columns: holes.map((h, i) => ({ label: String(i + 1), sub: String(h.par) })),
    current: s.phase === "finished" ? null : s.hole,
    rows: Array.from({ length: s.seats }, (_, seat) => ({
      seat,
      cells: holes.map((_, i) => (s.card[seat]![i] !== null ? String(s.card[seat]![i]) : i === s.hole && s.balls[seat]!.strokes ? String(s.balls[seat]!.strokes) : "")),
      total: String(totalOf(s, seat)),
      note: parText(toParOf(s, seat)),
    })),
    totalLabel: "Total",
    noteLabel: "To par",
  };
}

function resultOf(s: MiniGolfState): RoundResult | null {
  if (s.phase === "playing") return null;
  const seats = Array.from({ length: s.seats }, (_, i) => i);
  const h = holeOf(s);
  const total = { label: "Total", values: seats.map((i) => String(totalOf(s, i))), tone: "total" as const };
  const par = { label: "To par", values: seats.map((i) => parText(toParOf(s, i))) };
  if (s.phase === "finished") return { key: "final", title: `${courseOf(s.rules.course).name}: the final card`, sides: seats.map((i) => [i]), rows: [{ label: `Hole ${s.hole + 1}`, values: seats.map((i) => String(s.card[i]![s.hole])) }, total, par] };
  return { key: `hole-${s.hole}`, title: `Hole ${s.hole + 1}: ${h.name} (par ${h.par})`, sides: seats.map((i) => [i]), rows: [{ label: "This hole", values: seats.map((i) => String(s.card[i]![s.hole])), tone: "score" }, total, par] };
}

function overTitle(s: MiniGolfState, winners: number[]): string {
  const total = totalOf(s, winners[0]!);
  const par = toParOf(s, winners[0]!);
  const against = par === 0 ? "level par" : `${Math.abs(par)} ${par > 0 ? "over" : "under"} par`;
  if (s.seats === 1) return `Round finished: ${strokesText(total)}, ${against}`;
  if (winners.length > 1) return `It's a tie at ${total}!`;
  return `${who(winners[0]!)} wins with ${total} (${against})!`;
}

function view(s: MiniGolfState, seat: number): SportView {
  const holes = holesOf(s);
  const h = holes[s.hole]!;
  const mine = s.balls[seat]!;
  const playing = s.phase === "playing";
  const together = s.rules.order === "together";
  const canShoot = playing && !mine.done && (together || s.turn === seat);
  // In turn, everyone watches every shot. All at once, a seat watches its own, and sees the
  // other balls where they lie.
  const last = together ? s.lasts[seat]! : s.lasts.reduce<SportShot | null>((a, b) => (b && (!a || b.n > a.n) ? b : a), null);
  const winners = s.phase === "finished" ? winnersOf(s) : [];
  const onTee = playing && s.balls.every((b) => !b.teed);
  // Where balls collide the table is one table: every seat is shown it as the player whose shot
  // it is will find it (so all the seats' views agree, and so does someone watching). Where they
  // don't, each seat has the hole to itself: its own ball, with a ball that is in or picked up
  // marked as out of play, and everyone else's drawn as ghosts once they have left the tee.
  const on = ballsCollide(s.rules) ? onTheTable(s, playing ? s.turn : null) : onTheTable(s, seat);
  const ghost = (i: number): SportGhost => ({ ...lookOf(i), x: s.balls[i]!.x, y: s.balls[i]!.y, r: BALL_RADIUS });
  const ghosts = ballsCollide(s.rules) ? on.lifted.map(ghost) : s.balls.flatMap((b, i) => (i !== seat && b.teed && !b.done ? [ghost(i)] : []));
  return {
    game: "minigolf",
    seats: s.seats,
    me: seat,
    teams: false,
    phase: s.phase,
    turn: playing && !together ? s.turn : null,
    table: {
      key: `${s.rules.course}/${h.id}`,
      name: `Hole ${s.hole + 1}: ${h.name}`,
      world: holeWorld(h, on.balls),
      look: h.look,
      bodies: [...h.fixtures, ...s.balls.map((_, i) => lookOf(i))],
      ghosts,
    },
    shoot: canShoot ? { body: ballId(seat), minPower: MIN_POWER, maxPower: MAX_POWER } : null,
    last,
    card: cardOf(s),
    choices: s.phase === "holed" ? nextHandChoices(s.ready, seat, false, "Next hole") : null,
    players: s.balls.map((b, i) => ({
      line: b.done === "holed" ? `In the cup in ${b.strokes}` : b.done === "pickup" ? `Picked up: ${s.rules.limit + 1}` : b.strokes ? strokesText(b.strokes) : "On the tee",
      body: lookOf(i),
      done: !!b.done,
      badge: onTee && !together && s.seats > 1 && i === s.first ? "Tees off first" : undefined,
    })),
    info: [`Hole ${s.hole + 1} of ${holes.length}`, `Par ${h.par}`, ...(playing && !mine.done ? [`Stroke ${mine.strokes + 1} of ${s.rules.limit}`] : [])],
    narration: s.narration ?? (playing ? h.tip : null),
    scores: s.balls.map((_, i) => ({ seats: [i], value: totalOf(s, i) })),
    result: resultOf(s),
    over: s.phase === "finished" ? { winners, title: overTitle(s, winners) } : null,
  };
}

// ---- Computer players ---------------------------------------------------------------------------
// A computer player does what a person does with more patience: it tries putts in its head. The
// physics is quick, so it simulates a couple of hundred shots (every direction at several strengths,
// then a closer look round the best of them) and keeps the one that holes out, or failing that the
// one that stops nearest the cup. "Nearest" is measured along the green, round the walls and the
// water (a ball a short way from the cup on the wrong side of a fence is not close), from a map of
// distances worked out once for each hole. The map knows a ledge can only be come down, and that
// a tunnel's mouth is as near the cup as the place it comes out.
//
// Where balls collide, the putts it tries are played with the other balls on the table, so one in
// the way is something to go round and one beside the cup is something to bounce off. It would
// rather not knock an opponent's ball in for them.
//
// That finds the putt a perfect player would make. What makes a persona is how well it then hits
// it: the aim and the strength are both nudged off by an amount that grows as skill drops, and a
// careless moment (see `careless`) is a much bigger slip.

interface Field {
  x: number;
  y: number;
  cols: number;
  rows: number;
  /** Distance to the cup along the green from each cell, in world units; Infinity where no ball can be. */
  dist: Float64Array;
  /** The pieces of the hole's ledges. */
  ledges: [Point, Point][];
}
const CELL = 200;
const FAR = 1e9;
const fields = new Map<string, Field>();

function inShape(s: Shape, x: number, y: number): boolean {
  if ("points" in s) {
    let inside = false;
    const pts = s.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!;
      const [xj, yj] = pts[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < s.r * s.r;
}

/** The square of the distance from a point to a straight piece of wall. */
function toSegment(x: number, y: number, a: Point, b: Point): number {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey)));
  const dx = x - a[0] - t * ex;
  const dy = y - a[1] - t * ey;
  return dx * dx + dy * dy;
}

/** How far each spot on a hole is from the cup by the shortest way a ball could roll there. */
export function greenDistances(h: GolfHole): Field {
  const known = fields.get(h.id);
  if (known) return known;
  const f = h.look.frame;
  const cols = Math.ceil(f.w / CELL);
  const rows = Math.ceil(f.h / CELL);
  const dist = new Float64Array(cols * rows).fill(Infinity);
  // What a step onto each cell costs: 0 where a ball can't be (against a wall, in the water),
  // more through sand than over grass.
  const cost = new Float64Array(cols * rows);
  const clear = (BALL_RADIUS - 40) * (BALL_RADIUS - 40);
  const piecesOf = (oneWay: boolean): [Point, Point][] => h.world.walls.filter((w) => (w.oneWay === true) === oneWay).flatMap((w) => w.points.slice(0, w.closed ? w.points.length : -1).map((p, i): [Point, Point] => [p, w.points[(i + 1) % w.points.length]!]));
  const pieces = piecesOf(false);
  const ledges = piecesOf(true);
  const at = (cell: number): Point => [f.x + ((cell % cols) + 0.5) * CELL, f.y + (Math.floor(cell / cols) + 0.5) * CELL];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = f.x + (c + 0.5) * CELL;
      const y = f.y + (r + 0.5) * CELL;
      if (pieces.some(([a, b]) => toSegment(x, y, a, b) < clear)) continue;
      if (h.world.bodies.some((b) => (x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) < (b.r + BALL_RADIUS - 40) * (b.r + BALL_RADIUS - 40))) continue;
      if (h.world.regions.some((g) => g.out && inShape(g.shape, x, y))) continue;
      cost[r * cols + c] = h.world.regions.some((g) => g.friction !== undefined && g.friction > h.world.friction && inShape(g.shape, x, y)) ? 3 : 1;
    }
  }
  // Dijkstra outwards from the cup, on a small heap of [distance, cell].
  const heap: [number, number][] = [];
  const push = (d: number, cell: number) => {
    heap.push([d, cell]);
    for (let i = heap.length - 1; i > 0; ) {
      const up = (i - 1) >> 1;
      if (heap[up]![0] <= heap[i]![0]) break;
      [heap[up], heap[i]] = [heap[i]!, heap[up]!];
      i = up;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const end = heap.pop()!;
    if (heap.length) {
      heap[0] = end;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let low = i;
        if (l < heap.length && heap[l]![0] < heap[low]![0]) low = l;
        if (r < heap.length && heap[r]![0] < heap[low]![0]) low = r;
        if (low === i) break;
        [heap[low], heap[i]] = [heap[i]!, heap[low]!];
        i = low;
      }
    }
    return top;
  };
  const cup = cupOf(h);
  const cellAt = (x: number, y: number) => Math.floor((y - f.y) / CELL) * cols + Math.floor((x - f.x) / CELL);
  const start = cellAt(cup.x, cup.y);
  dist[start] = 0;
  push(0, start);
  const tunnels = (h.world.tunnels ?? []).map((t) => ({ mouth: cellAt(t.x, t.y), out: cellAt(t.to[0], t.to[1]) }));
  while (heap.length) {
    const [d, cell] = pop();
    if (d > dist[cell]!) continue;
    // A tunnel's mouth is a step away from where it comes out (a mouth in a rock face is in a
    // cell no ball can rest in, which is fine: the way to it is found from there).
    for (const t of tunnels) {
      if (t.out === cell && d + CELL < dist[t.mouth]!) {
        dist[t.mouth] = d + CELL;
        push(d + CELL, t.mouth);
      }
    }
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((!dr && !dc) || r + dr < 0 || r + dr >= rows || c + dc < 0 || c + dc >= cols) continue;
        const next = (r + dr) * cols + c + dc;
        if (!cost[next]) continue;
        // The search runs backwards, from the cup out: a ball would roll from `next` to here, and
        // it can't if that is up a ledge.
        if (ledges.length && upLedge(ledges, at(next), at(cell))) continue;
        const nd = d + (dr && dc ? 1.4142 : 1) * CELL * cost[next]!;
        if (nd < dist[next]!) {
          dist[next] = nd;
          push(nd, next);
        }
      }
    }
  }
  const field = { x: f.x, y: f.y, cols, rows, dist, ledges };
  fields.set(h.id, field);
  return field;
}

/** Whether going straight from one point to another crosses a ledge from its shut side. */
function upLedge(ledges: [Point, Point][], from: Point, to: Point): boolean {
  for (const [a, b] of ledges) {
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    // Which side of the ledge's line each end is on: positive is its right, the shut side.
    const s1 = (from[0] - a[0]) * -ey + (from[1] - a[1]) * ex;
    const s2 = (to[0] - a[0]) * -ey + (to[1] - a[1]) * ex;
    if (s1 <= 0 || s2 > 0) continue;
    // And whether the crossing falls between the ledge's ends.
    const t = s1 / (s1 - s2);
    const along = (from[0] + (to[0] - from[0]) * t - a[0]) * ex + (from[1] + (to[1] - from[1]) * t - a[1]) * ey;
    if (along >= 0 && along <= ex * ex + ey * ey) return true;
  }
  return false;
}

/** How far a ball lying here is from the cup, along the green. */
export function distanceToCup(h: GolfHole, x: number, y: number): number {
  const f = greenDistances(h);
  const c = Math.floor((x - f.x) / CELL);
  const r = Math.floor((y - f.y) / CELL);
  // A ball resting against a wall is in a cell no ball's centre is meant to reach: use its neighbours.
  let best = FAR;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (r + dr < 0 || r + dr >= f.rows || c + dc < 0 || c + dc >= f.cols) continue;
      // A ball lying under a ledge is not as near as the cell on top of it.
      if ((dr || dc) && f.ledges.length && upLedge(f.ledges, [x, y], [f.x + (c + dc + 0.5) * CELL, f.y + (r + dr + 0.5) * CELL])) continue;
      const d = f.dist[(r + dr) * f.cols + c + dc]! + (dr || dc ? CELL : 0);
      if (d < best) best = d;
    }
  }
  return best;
}

const wrap = (angle: number) => ((Math.round(angle) % 36000) + 36000) % 36000;
const clampPower = (power: number) => Math.min(MAX_POWER, Math.max(MIN_POWER, Math.round(power)));

/** A putt tried in the head: lower is better; anything under zero is in the cup. */
const HOLED = -1e6;
function tryPutt(h: GolfHole, x: number, y: number, angle: number, power: number, penalty: number, others: PlacedBall[]): number {
  const bodies = simulate(holeWorld(h, [{ id: "ball", x, y }, ...others]), { body: "ball", angle, power }).world.bodies;
  const at = bodies.find((b) => b.id === "ball")!;
  // Holing someone else's ball for them is worth avoiding, but not at the price of a worse lie.
  const gift = others.length && bodies.some((b) => b.id !== "ball" && b.pocketed === "cup") ? 600 : 0;
  if (at.pocketed !== undefined) return HOLED + gift;
  // In the water: as bad as staying put and throwing strokes away.
  if (at.out !== undefined) return distanceToCup(h, x, y) + 3000 * (1 + penalty) + gift;
  return distanceToCup(h, at.x, at.y) + gift;
}

export interface Putt {
  angle: number;
  power: number;
  /** What the search made of it: under zero means it expects to hole out. */
  score: number;
  /** How many putts were simulated to find it. */
  tried: number;
}
const COARSE_POWERS = [200, 320, 430, 530, 640, 800, 1000];
const thoughts = new Map<string, Putt>();

/**
 * The best putt from here that a search can find: what a player with a perfect stroke would hit.
 * The work is bounded (at most 286 simulated putts) and remembered, since a table asks more than once.
 * `others` are the balls lying on the hole that this one can knock into.
 */
export function bestPutt(h: GolfHole, x: number, y: number, penalty = 1, others: PlacedBall[] = []): Putt {
  const key = `${h.id}/${x}/${y}/${penalty}${others.map((o) => `/${o.id}:${o.x}:${o.y}`).join("")}`;
  const known = thoughts.get(key);
  if (known) return known;
  let tried = 0;
  const score = (angle: number, power: number) => {
    tried++;
    return tryPutt(h, x, y, angle, power, penalty, others);
  };
  const cup = cupOf(h);
  const base = angleTo({ x, y }, cup);
  // Every direction, straight at the cup included, at a spread of strengths.
  let found: { angle: number; power: number; score: number }[] = [];
  for (let k = 0; k < 30; k++) for (const power of COARSE_POWERS) found.push({ angle: wrap(base + k * 1200), power, score: score(wrap(base + k * 1200), power) });
  found.sort((a, b) => a.score - b.score);
  // A closer look round the best few that aren't each other's neighbours.
  const seeds: typeof found = [];
  for (const f of found) {
    if (seeds.length >= 4) break;
    if (!seeds.some((s) => Math.abs(s.power - f.power) <= 120 && Math.min(Math.abs(s.angle - f.angle), 36000 - Math.abs(s.angle - f.angle)) <= 1200)) seeds.push(f);
  }
  for (const seed of seeds) {
    for (const da of [-360, -180, 0, 180, 360]) {
      for (const dp of [-50, 0, 50]) {
        if (!da && !dp) continue;
        const angle = wrap(seed.angle + da);
        const power = clampPower(seed.power + dp);
        found.push({ angle, power, score: score(angle, power) });
      }
    }
  }
  found.sort((a, b) => a.score - b.score);
  // Several putts may drop, in a few families: straight at the cup, off this wall, off that one.
  // From each family take the putt in the middle of its range of strengths (or, when nothing
  // drops, take the three that stop nearest), gentlest families first.
  const drops = found.filter((f) => f.score < 0).sort((a, b) => a.angle - b.angle);
  const families: (typeof found)[] = [];
  for (const f of drops) {
    const family = families.at(-1);
    if (family && f.angle - family.at(-1)!.angle <= 500) family.push(f);
    else families.push([f]);
  }
  const middles = families.map((family) => family.sort((a, b) => a.power - b.power)[family.length >> 1]!).sort((a, b) => a.power - b.power);
  const shortlist = middles.length ? middles.slice(0, 5) : found.slice(0, 3);
  // Of those, prefer the one that still works when it's hit a little wrong.
  let best = shortlist[0]!;
  let bestSteady = Infinity;
  for (const f of shortlist) {
    let near = 0;
    for (const [da, dp] of [[-120, -35], [120, -35], [-120, 35], [120, 35]] as const) near += Math.max(0, Math.min(score(wrap(f.angle + da), clampPower(f.power + dp)), 20000));
    // All else equal, the gentler putt: the plain one a person would try, not a full-power ricochet.
    const steady = (f.score < 0 ? -20000 : f.score) + near / 4 + f.power * 3;
    if (steady < bestSteady) [best, bestSteady] = [f, steady];
  }
  const putt = { ...best, tried };
  if (thoughts.size > 400) thoughts.clear();
  thoughts.set(key, putt);
  return putt;
}

/** The most a computer player's aim (hundredths of a degree) and strength (a share of it) can be off: at full skill, and how much more at none. */
export const AIM_SLIP = [300, 1100] as const;
export const POWER_SLIP = [0.2, 0.45] as const;

function bot(s: MiniGolfState, seat: number, style: PlayStyle, rand: () => number = Math.random): MiniGolfMove | null {
  if (s.phase === "holed") return s.ready[seat] ? null : { type: "next" };
  const ball = s.balls[seat];
  if (s.phase !== "playing" || !ball || ball.done || (s.turn !== null && s.turn !== seat)) return null;
  // The balls it could hit: the ones on the table for its shot that are still in play.
  const others = onTheTable(s, seat).balls.filter((b) => b.id !== ballId(seat) && b.pocketed === undefined);
  const ideal = bestPutt(holeOf(s), ball.x, ball.y, s.rules.penalty, others);
  const skill = Math.min(1, Math.max(0, style.skill ?? 1));
  const slip = careless(style, rand) ? 2 : 1;
  // Three dice make a bell: mostly near the middle, now and then out at the edge.
  const wobble = () => (rand() + rand() + rand() - 1.5) / 1.5;
  // At full skill the aim is within 3° and the strength within 20%, and usually a third of that;
  // at none, 14° and 65%. That is about what people manage with a thumb, which is the point: the
  // search alone would hole nearly everything from the tee.
  const angle = wrap(ideal.angle + wobble() * (AIM_SLIP[0] + (1 - skill) * AIM_SLIP[1]) * slip);
  const power = clampPower(ideal.power * (1 + wobble() * (POWER_SLIP[0] + (1 - skill) * POWER_SLIP[1]) * slip));
  return { type: "shot", body: ballId(seat), angle, power };
}

// ---- The game -----------------------------------------------------------------------------------

function normalize(rules: unknown): MiniGolfRules {
  const given = (rules && typeof rules === "object" ? rules : {}) as Partial<MiniGolfRules>;
  const base = PRESETS.find((p) => p.id === given.id) ?? nineHoles;
  const r = { ...base, ...given };
  const course = courseOf(r.course);
  const whole = (v: unknown, min: number, max: number, or: number) => (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : or);
  return {
    id: String(r.id),
    name: String(r.name),
    course: course.id,
    holes: whole(r.holes, 1, course.holes.length, course.holes.length),
    order: r.order === "together" ? "together" : "turns",
    limit: whole(r.limit, 3, 12, 6),
    penalty: whole(r.penalty, 0, 3, 1),
    collide: r.collide !== false,
    knockIn: r.knockIn !== false,
  };
}

export const miniGolf: SportGame<MiniGolfRules, MiniGolfState, MiniGolfMove> = {
  id: "minigolf",
  name: "Mini Golf",
  emoji: "⛳",
  blurb: "Nine holes round the garden, in turn or all at once",
  tagline: "Pull back, let go, and hope for a hole in one. Fewest strokes round the course wins.",
  seats: { min: 1, max: 6, default: 2 },
  teams: false,
  presets: PRESETS,
  fields: [
    ...(COURSES.length > 1 ? [{ key: "course" as const, label: "Course", kind: "choice" as const, options: COURSES.map((c): [string, string] => [c.id, c.name]) }] : []),
    { key: "holes", label: "Holes to play", kind: "choice", options: [[3, "The first three (a quick game)"], [9, "All nine"]] },
    { key: "order", label: "Who putts when", kind: "choice", hint: "All at once, each player has the hole to themselves, so balls can't knock into each other.", options: [["turns", "In turn: furthest from the cup plays next"], ["together", "Everyone at once, at their own pace (balls pass through each other)"]] },
    { key: "collide", label: "Balls knock into each other", kind: "toggle", hint: "In turn only. A ball that is knocked is played from where it stops; knocked into the water, it goes back where it was at no cost." },
    { key: "knockIn", label: "A ball knocked into the cup counts", kind: "toggle", hint: "It is in, at the strokes its owner had taken. Off: it is put back where it was." },
    { key: "limit", label: "Most strokes on a hole", kind: "number", min: 3, max: 12, hint: "Not in by then? Pick up and write down one more." },
    { key: "penalty", label: "Strokes for a ball in the water", kind: "choice", options: [[0, "None: just play it again"], [1, "One"], [2, "Two"]] },
  ],
  normalize,
  validate(r) {
    const course = COURSES.find((c) => c.id === r.course);
    if (!course) return ["That course isn't one we have."];
    return r.holes < 1 || r.holes > course.holes.length ? [`${course.name} has ${course.holes.length} holes.`] : [];
  },
  describe(r) {
    const course = courseOf(r.course);
    return [
      `${r.holes >= course.holes.length ? `All ${course.holes.length} holes` : `The first ${r.holes} holes`} of ${course.name}. Putt your ball into the cup in as few strokes as you can; the lowest total wins, and a tie is shared.`,
      "To putt, pull back from the ball and let go: the further you pull, the harder it goes. A ball going too fast skips over the cup.",
      r.order === "turns" ? "Everyone tees off in turn. After that, whoever is furthest from the cup plays next." : "Everyone plays at once, each at their own pace. The table moves on when all are in.",
      r.order !== "turns"
        ? "Each player has the hole to themselves: the other balls are shown faintly and pass straight through yours. Nobody can knock yours away."
        : !r.collide
          ? "Each player has a ball of their own, and balls pass through each other: nobody can knock yours away."
          : `Balls knock into each other. A ball that is knocked is played from where it stops${r.knockIn ? "; knocked into the cup, it is in for its owner with no extra stroke" : "; knocked into the cup, it is put back where it was"}; knocked into the water, it goes back where it was at no cost. A ball still on the tee is lifted while the next player tees off.`,
      `A ball in the water is played again from where it was struck${r.penalty ? `, with ${r.penalty === 1 ? "a penalty stroke" : `${r.penalty} penalty strokes`}` : ", with no penalty"}.`,
      `Not in after ${r.limit} strokes? Pick up and write down ${r.limit + 1}.`,
    ];
  },
  newGame: newMiniGolf,
  apply,
  view,
  bot,
  thinkingTime(s, seat) {
    if (s.phase !== "playing") return 500;
    // In turn, a player watches the last putt stop before stepping up; all at once, only their own.
    const last = s.rules.order === "turns" ? s.lasts.reduce<SportShot | null>((a, b) => (b && (!a || b.n > a.n) ? b : a), null) : s.lasts[seat];
    const rolling = last ? Math.round((last.ticks * 1000) / holeOf(s).world.tickRate) : 0;
    return rolling + thinkFor(3, s.balls[seat]?.teed ? 0.8 : 1.1);
  },
  warmUp() {
    // A putt thought through from every tee: the distance maps get made, and the simulation gets hot.
    for (const course of COURSES) for (const h of course.holes) bestPutt(h, h.tee[0], h.tee[1]);
  },
  summary(s) {
    const over = s.phase === "finished";
    const seats = Array.from({ length: s.seats }, (_, i) => i);
    return {
      game: "minigolf",
      rules: s.rules.name,
      phase: s.phase,
      over,
      hand: s.hole + 1,
      scoreLine: seats.map((i) => totalOf(s, i)).join(" · ") + (s.seats === 1 ? " strokes" : ""),
      order: over ? rankSeats(seats.map((i) => ({ seats: [i], score: totalOf(s, i) })), true) : null,
      winners: over ? winnersOf(s) : null,
      teams: false,
      seats: s.seats,
    };
  },
};
