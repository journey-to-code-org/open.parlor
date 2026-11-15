// Backgammon: fifteen checkers a side, two dice, and a race round the board in opposite
// directions. A checker lands on any point the other side doesn't hold with two or more; landing on
// one alone (a blot) sends it to the bar, and it has to come back in before anything else moves.
// Once all fifteen are in your home board you bear them off; the first to bear off all of them wins:
// a single game, a gammon (double) if the loser has borne off none, a backgammon (triple) if the
// loser also still has a checker on the bar or in the winner's home board.
//
// A turn is several moves to the server, as a run of jumps is in Checkers: roll, then one checker
// a die, the seat keeping the turn until its dice are played or nothing more can be. What may be
// played at each step comes from one generator of whole legal turns, so "you must play both dice if
// you can" and "if only one can be played it must be the bigger" hold a step at a time. Until the
// turn is over the steps made so far can be taken back: the dice are already on the table, so
// nothing is learned by it. A roll that can't be played passes on its own.
//
// The doubling cube and match play are house rules: a friendly game without the cube, a money game
// (with the Jacoby rule and automatic doubles as options), or a match to a number of points with
// the Crawford rule.
//
// The board is kept one way whoever is looking: the points are numbered as the first seat counts
// them, 24 down to 1, and the second seat travels them the other way. Each seat's view asks the
// table to draw the board from its own side.
//
// Resigning isn't here yet: when the kit's shared offers arrive, Backgammon opts in for resign only
// (never a draw), and what a resignation gives is the cube times what the position could still lose
// (a single game, or a gammon or backgammon while those are still possible).
import { mulberry32, type PlayStyle } from "@spades/rules";
import type { BoardCube, BoardGame, BoardGrid, BoardPiece, BoardView } from "./board.js";
import { careless, clone, GameError, markReady, nextHandChoices, nextRandom, who, type BaseRules, type Choice, type RoundResult } from "./table.js";

export interface BackgammonRules extends BaseRules {
  /** A match to this many points; 0 is a single game. */
  match: number;
  /** The doubling cube is in play. */
  cube: boolean;
  /** In a match: no doubling in the first game after a player comes within a point of winning. */
  crawford: boolean;
  /** In a single game with the cube: gammons and backgammons only count once the cube has been turned. */
  jacoby: boolean;
  /** In a single game with the cube: a tied opening roll doubles the stakes (once). */
  autoDoubles: boolean;
  /** Where the checkers start: the standard position, or Nackgammon's (two more checkers back). */
  start: "standard" | "nack";
  /** A turn isn't over until its player says so, and can be taken back until then. */
  confirm: boolean;
  /** Tapping a checker that has only one place to go plays it at once. */
  quick: boolean;
}

export const friendlyBackgammon: BackgammonRules = { id: "backgammon-friendly", name: "Friendly", match: 0, cube: false, crawford: false, jacoby: false, autoDoubles: false, start: "standard", confirm: false, quick: false };
export const moneyBackgammon: BackgammonRules = { ...friendlyBackgammon, id: "backgammon-money", name: "Money game (with the cube)", cube: true, jacoby: true };
const matchTo = (n: number): BackgammonRules => ({ ...friendlyBackgammon, id: `backgammon-match${n}`, name: `Match to ${n}`, match: n, cube: true, crawford: true });
export const match3Backgammon = matchTo(3);
export const match5Backgammon = matchTo(5);
export const match7Backgammon = matchTo(7);
export const nackgammon: BackgammonRules = { ...friendlyBackgammon, id: "backgammon-nack", name: "Nackgammon", start: "nack" };
const PRESETS = [friendlyBackgammon, moneyBackgammon, match3Backgammon, match5Backgammon, match7Backgammon, nackgammon];
const MATCHES = [0, 3, 5, 7, 9, 11];
const CUBE_MAX = 64;

/** Where the fifteen checkers start, by the point as their own side counts it: [point, how many]. */
const STARTS: Record<BackgammonRules["start"], [number, number][]> = {
  standard: [[24, 2], [13, 5], [8, 3], [6, 5]],
  nack: [[24, 2], [23, 2], [13, 4], [8, 3], [6, 4]],
};

/** One checker moved by one die, as the state remembers it (so it can be taken back). */
export interface BackgammonStep {
  seat: number;
  /** Where from and where to, as places of `stacks`; `to` is null for a checker borne off. */
  from: number;
  to: number | null;
  /** Which of the dice was used. */
  die: number;
  /** A blot was hit and sent to the bar. */
  hit: boolean;
}

export interface BackgammonResult {
  winner: number;
  kind: "single" | "gammon" | "backgammon";
  /** The other player turned down a double. */
  dropped: boolean;
  /** A gammon that didn't count: the Jacoby rule, and the cube was never turned. */
  jacoby: boolean;
  points: number;
}

export interface BackgammonState {
  game: "backgammon";
  rules: BackgammonRules;
  seats: number;
  rng: number;
  /** Which game of the match, from 1. */
  round: number;
  /**
   * Who is where: 26 places, each a pile of checkers from the bottom up. 1 to 24 are the points as
   * the first seat counts them (it travels from 24 down to 1, the second seat from 1 up to 24); 25
   * is the first seat's bar and 0 the second's. Checkers 0 to 14 are the first seat's, 15 to 29 the
   * second's, and each keeps its number all game.
   */
  stacks: number[][];
  /** The checkers each seat has borne off. */
  home: number[][];
  /**
   * "opening": each rolls a die to see who starts. "roll": `turn` is to roll (or double first).
   * "offer": `turn` has offered a double and the other seat must take or drop. "move": `turn` is
   * playing its dice.
   */
  phase: "opening" | "roll" | "offer" | "move" | "scored" | "finished";
  turn: number;
  /** The opening roll: what each seat has thrown so far. */
  opening: (number | null)[];
  /** The dice on the table (four of them for a double), which have been played, and who threw each. */
  dice: number[];
  used: boolean[];
  thrower: number[];
  /** How many throws there have been, so the table knows when to tumble the dice. */
  rolls: number;
  /** The moves made so far this turn. */
  steps: BackgammonStep[];
  /** The turn before, for marking where it went. */
  last: BackgammonStep[];
  cube: { value: number; owner: number | null; turned: boolean };
  /** Tied opening rolls that have doubled the stakes this game. */
  autos: number;
  /** This is the Crawford game; and whether the match has had one. */
  crawford: boolean;
  crawfordDone: boolean;
  /** Points won so far (in a single game, what it was won for). */
  score: number[];
  result: BackgammonResult | null;
  ready: boolean[];
  narration: string | null;
}

export type BackgammonMove =
  | { type: "roll" }
  | { type: "move"; from: number; to: number }
  | { type: "undo" }
  | { type: "confirm" }
  | { type: "double" }
  | { type: "take" }
  | { type: "drop" }
  | { type: "next" };

const other = (seat: number) => 1 - seat;
const ownerOf = (checker: number) => (checker < 15 ? 0 : 1);

// ---- The board as the table sees it -------------------------------------------------------------
// Two rows of fourteen cells: six points, the bar, six points, a tray. The first seat's home board
// is the bottom right and its tray below the second seat's.

const COLS = 14;
const BAR_CELL = [20, 6];
const HOME_CELL = [27, 13];
/** The cell a place of `stacks` is drawn in. */
function cellOfPlace(place: number): number {
  if (place === 0) return BAR_CELL[1]!;
  if (place === 25) return BAR_CELL[0]!;
  if (place >= 19) return place - 12;
  if (place >= 13) return place - 13;
  if (place >= 7) return 26 - place;
  return 27 - place;
}
const PLACE_OF_CELL: (number | null)[] = Array.from({ length: COLS * 2 }, (_, cell) => {
  for (let place = 0; place <= 25; place++) if (cellOfPlace(place) === cell) return place;
  return null;
});
/** The points in the order the first seat travels them: 24 down to 1. */
const PATH = Array.from({ length: 24 }, (_, i) => cellOfPlace(24 - i));

/** A place of `stacks` as a seat counts it: its own points 1 to 24, 25 for its own bar, 0 for the other side's. */
const pointOf = (seat: number, place: number) => (seat === 0 ? place : 25 - place);
const placeOf = pointOf;

// ---- Positions, and what can be played from them ------------------------------------------------
// Everything that works out moves does it on two short lists of numbers, from the side of whoever
// is to move, so the rules are written once and a computer player can try thousands of turns:
// `me[1..24]` is how many of my checkers are on each point as I count them (I travel from 24 down
// to 1), `me[25]` how many are on the bar and `me[0]` how many are off. `op` is the other side on
// the same numbering: `op[0]` is their bar (they come in on my low points) and `op[25]` what they
// have borne off.

type Side = Int8Array;

function sidesOf(s: Pick<BackgammonState, "stacks" | "home">, seat: number): { me: Side; op: Side } {
  const me = new Int8Array(26);
  const op = new Int8Array(26);
  for (let place = 0; place <= 25; place++) {
    const pile = s.stacks[place]!;
    if (!pile.length) continue;
    if (ownerOf(pile[0]!) === seat) me[pointOf(seat, place)] = pile.length;
    else op[pointOf(seat, place)] = pile.length;
  }
  me[0] = s.home[seat]!.length;
  op[25] = s.home[other(seat)]!.length;
  return { me, op };
}

/** The same position from the other side of the board. */
function turned(side: Side, into = new Int8Array(26)): Side {
  for (let i = 0; i <= 25; i++) into[i] = side[25 - i]!;
  return into;
}

/** My rearmost checker: the highest point I'm on (25 for the bar), or 0 with everything off. */
function rearmost(me: Side): number {
  for (let p = 25; p >= 1; p--) if (me[p]) return p;
  return 0;
}

/**
 * Whether a checker may go from `from` by `die`, given my rearmost checker `back`. Bearing off
 * needs everything home, and a die bigger than the point only takes off the rearmost checker.
 */
function canHop(op: Side, back: number, from: number, die: number): boolean {
  if (back === 25 && from !== 25) return false;
  const to = from - die;
  if (to > 0) return op[to]! < 2;
  return back <= 6 && (to === 0 || from === back);
}

/** Make a hop; says whether it hit a blot. */
function hop(me: Side, op: Side, from: number, die: number): boolean {
  const to = from - die;
  me[from]!--;
  if (to <= 0) {
    me[0]!++;
    return false;
  }
  me[to]!++;
  if (op[to] !== 1) return false;
  op[to] = 0;
  op[0]!++;
  return true;
}
function unhop(me: Side, op: Side, from: number, die: number, hit: boolean) {
  const to = from - die;
  if (to <= 0) me[0]!--;
  else {
    me[to]!--;
    if (hit) {
      op[to] = 1;
      op[0]!--;
    }
  }
  me[from]!++;
}

/** Whether anything at all can be played with `die`. */
function anyHop(me: Side, op: Side, die: number): boolean {
  const back = rearmost(me);
  for (let from = back; from >= 1; from--) if (me[from] && canHop(op, back, from, die)) return true;
  return false;
}

/**
 * The most hops that can be made with `left` dice all showing `die`. With every die the same, any
 * way of playing them can be put in order from the rearmost checker forwards (a checker only ever
 * gets to a point from a higher one), so only those orders need looking at: `from` never rises.
 */
function mostSame(me: Side, op: Side, die: number, left: number, max: number): number {
  if (!left) return 0;
  const back = rearmost(me);
  let best = 0;
  for (let from = back === 25 ? 25 : Math.min(back, max); from >= 1; from--) {
    if (!me[from] || !canHop(op, back, from, die)) continue;
    const hit = hop(me, op, from, die);
    const n = 1 + mostSame(me, op, die, left - 1, from);
    unhop(me, op, from, die, hit);
    if (n > best) best = n;
    if (best === left) break;
  }
  return best;
}

/** The most of `dice` (the ones still to play) that can be played from here. */
function mostHops(me: Side, op: Side, dice: number[]): number {
  if (!dice.length) return 0;
  if (dice.every((d) => d === dice[0])) return mostSame(me, op, dice[0]!, dice.length, 25);
  let best = 0;
  for (const [first, second] of [dice, [dice[1]!, dice[0]!]]) {
    const back = rearmost(me);
    for (let from = back; from >= 1 && best < 2; from--) {
      if (!me[from] || !canHop(op, back, from, first!)) continue;
      const hit = hop(me, op, from, first!);
      best = Math.max(best, anyHop(me, op, second!) ? 2 : 1);
      unhop(me, op, from, first!, hit);
    }
  }
  return best;
}

/** One hop that may be played now. */
interface Hop {
  from: number;
  die: number;
}

/**
 * The hops that may be played next with the dice still to play: the ones that begin a way of
 * playing as many dice as can be played, and, when only one of two different dice can be, the
 * bigger of them if it can.
 */
function legalHops(me: Side, op: Side, dice: number[]): Hop[] {
  const values = [...new Set(dice)];
  const found: (Hop & { n: number })[] = [];
  for (const die of values) {
    const rest = [...dice];
    rest.splice(rest.indexOf(die), 1);
    const back = rearmost(me);
    for (let from = back; from >= 1; from--) {
      if (!me[from] || !canHop(op, back, from, die)) continue;
      const hit = hop(me, op, from, die);
      found.push({ from, die, n: 1 + mostHops(me, op, rest) });
      unhop(me, op, from, die, hit);
    }
  }
  const most = Math.max(0, ...found.map((h) => h.n));
  let legal = found.filter((h) => h.n === most);
  if (most === 1 && values.length === 2) {
    const high = Math.max(...values);
    if (legal.some((h) => h.die === high)) legal = legal.filter((h) => h.die === high);
  }
  return legal.map(({ from, die }) => ({ from, die }));
}

/** A whole turn: the hops in the order they're played, and the position it leaves. */
interface Turn {
  hops: Hop[];
  me: Side;
  op: Side;
}

const keyOf = (me: Side, op: Side) => String.fromCharCode(...me, ...op);

/**
 * How much looking the computer players have done: one for every hop tried while listing turns and
 * one for every position judged. A look ahead is rationed by this and not by the clock, so it plays
 * the same on a slow machine, and a board full of doubles can't make it slow.
 */
let work = 0;

/**
 * Every whole legal turn with these dice, one for each different position that can be reached
 * (two orders of the same two hops are one turn). None when nothing can be played.
 */
function wholeTurns(me: Side, op: Side, dice: number[]): Turn[] {
  const most = mostHops(me, op, dice);
  if (!most) return [];
  const seen = new Map<string, Turn>();
  const hops: Hop[] = [];
  const done = () => {
    const key = keyOf(me, op);
    if (!seen.has(key)) seen.set(key, { hops: hops.map((h) => ({ ...h })), me: me.slice(), op: op.slice() });
  };
  const same = (die: number, left: number, max: number) => {
    if (!left) return done();
    const back = rearmost(me);
    for (let from = back === 25 ? 25 : Math.min(back, max); from >= 1; from--) {
      if (!me[from] || !canHop(op, back, from, die)) continue;
      const hit = hop(me, op, from, die);
      work++;
      hops.push({ from, die });
      same(die, left - 1, from);
      hops.pop();
      unhop(me, op, from, die, hit);
    }
  };
  if (dice.every((d) => d === dice[0])) same(dice[0]!, most, 25);
  else if (most === 1) {
    // One die only: the bigger if it can be played at all.
    const high = Math.max(...dice);
    same(anyHop(me, op, high) ? high : Math.min(...dice), 1, 25);
  } else {
    for (const [first, second] of [dice, [dice[1]!, dice[0]!]]) {
      const back = rearmost(me);
      for (let from = back; from >= 1; from--) {
        if (!me[from] || !canHop(op, back, from, first!)) continue;
        const hit = hop(me, op, from, first!);
        hops.push({ from, die: first! });
        same(second!, 1, 25);
        hops.pop();
        unhop(me, op, from, first!, hit);
      }
    }
  }
  return [...seen.values()];
}

/** The dice still to be played this turn. */
const diceLeft = (s: Pick<BackgammonState, "dice" | "used">) => s.dice.filter((_, i) => !s.used[i]);

/** A step the seat to move may make now, as the table and `apply` name it. */
export interface BackgammonOption {
  /** Cells of the board. */
  from: number;
  to: number;
  /** The die it uses (its place among the dice on the table). */
  die: number;
}

/**
 * What the player to move may do next: one checker by one die, each as the cell it leaves and the
 * cell it lands in (the tray for a checker borne off). Two dice that would do the same thing are
 * one option: the one that fits exactly is used, and failing that the bigger.
 */
export function backgammonSteps(s: BackgammonState): BackgammonOption[] {
  if (s.phase !== "move") return [];
  const seat = s.turn;
  const { me, op } = sidesOf(s, seat);
  const out = new Map<string, BackgammonOption & { value: number; exact: boolean }>();
  for (const h of legalHops(me, op, diceLeft(s))) {
    const to = h.from - h.die;
    const from = cellOfPlace(placeOf(seat, h.from));
    const option = { from, to: to <= 0 ? HOME_CELL[seat]! : cellOfPlace(placeOf(seat, to)), die: s.dice.findIndex((d, i) => d === h.die && !s.used[i]), value: h.die, exact: to >= 0 };
    const key = `${option.from}/${option.to}`;
    const had = out.get(key);
    if (!had || (option.exact && !had.exact) || (option.exact === had.exact && option.value > had.value)) out.set(key, option);
  }
  return [...out.values()].map(({ from, to, die }) => ({ from, to, die }));
}

/** A whole turn as the player to move could play it: each step as cells, and how many of them hit. */
export interface BackgammonTurn {
  steps: { from: number; to: number; die: number }[];
}

/** Every whole turn the player to move could play with the dice still to play: one for each position it could leave. */
export function backgammonTurns(s: BackgammonState): BackgammonTurn[] {
  if (s.phase !== "move") return [];
  const seat = s.turn;
  const { me, op } = sidesOf(s, seat);
  return wholeTurns(me, op, diceLeft(s)).map((t) => ({
    steps: t.hops.map((h) => ({ from: cellOfPlace(placeOf(seat, h.from)), to: h.from - h.die <= 0 ? HOME_CELL[seat]! : cellOfPlace(placeOf(seat, h.from - h.die)), die: h.die })),
  }));
}

/** How far a seat still has to go: every checker's distance to being off, added up. */
export function backgammonPips(s: Pick<BackgammonState, "stacks" | "home">, seat: number): number {
  let pips = 0;
  for (let place = 0; place <= 25; place++) {
    const pile = s.stacks[place]!;
    if (pile.length && ownerOf(pile[0]!) === seat) pips += pile.length * pointOf(seat, place);
  }
  return pips;
}

// ---- A game ------------------------------------------------------------------------------------

function startGame(s: BackgammonState) {
  s.stacks = Array.from({ length: 26 }, () => []);
  s.home = [[], []];
  for (const seat of [0, 1]) {
    let checker = seat * 15;
    for (const [point, count] of STARTS[s.rules.start]) for (let i = 0; i < count; i++) s.stacks[placeOf(seat, point)]!.push(checker++);
  }
  s.phase = "opening";
  s.turn = 0;
  s.opening = [null, null];
  s.dice = [];
  s.used = [];
  s.thrower = [];
  s.steps = [];
  s.last = [];
  s.cube = { value: 1, owner: null, turned: false };
  s.autos = 0;
  s.result = null;
  s.ready = [false, false];
  s.narration = null;
}

export function newBackgammon(rules: BackgammonRules, _seats: number, seed: number): BackgammonState {
  const s = { game: "backgammon", rules, seats: 2, rng: seed >>> 0, round: 1, rolls: 0, crawford: false, crawfordDone: false, score: [0, 0] } as BackgammonState;
  startGame(s);
  return s;
}

const throwDie = (s: BackgammonState) => 1 + Math.floor(nextRandom(s)() * 6);

/** Whether `seat` may offer a double now. */
function canDouble(s: BackgammonState, seat: number): boolean {
  return s.rules.cube && s.phase === "roll" && s.turn === seat && !s.crawford && (s.cube.owner === null || s.cube.owner === seat) && s.cube.value < CUBE_MAX;
}

/** A point as it is said and written: "bar", "off", or its number. */
const said = (point: number) => (point === 25 ? "bar" : point <= 0 ? "off" : String(point));
/** A turn in the usual notation, from the side that played it: "24/18, 13/11*". */
function notation(steps: BackgammonStep[]): string {
  return steps.map((st) => `${said(pointOf(st.seat, st.from))}/${st.to === null ? "off" : said(pointOf(st.seat, st.to))}${st.hit ? "*" : ""}`).join(", ");
}
/** A roll as it is said: the bigger die first. */
const rolled = (dice: number[]) => (dice.length === 4 ? `double ${dice[0]}s` : `${Math.max(dice[0]!, dice[1]!)}-${Math.min(dice[0]!, dice[1]!)}`);

function endGame(s: BackgammonState, winner: number, dropped: boolean) {
  const loser = other(winner);
  let kind: BackgammonResult["kind"] = "single";
  if (!dropped && s.home[loser]!.length === 0) {
    const { op } = sidesOf(s, winner);
    // The loser's checkers on my points 1 to 6 are in my home board; `op[0]` is their bar.
    kind = op[0]! + op[1]! + op[2]! + op[3]! + op[4]! + op[5]! + op[6]! > 0 ? "backgammon" : "gammon";
  }
  const jacoby = kind !== "single" && s.rules.jacoby && !s.cube.turned;
  const points = s.cube.value * (kind === "single" || jacoby ? 1 : kind === "gammon" ? 2 : 3);
  s.score[winner]! += points;
  s.result = { winner, kind, dropped, jacoby, points };
  s.last = s.steps.length ? s.steps : s.last;
  s.steps = [];
  s.used = s.dice.map(() => true);
  // (The table turns "{0} wins" into "You win" for the player it's about: one plain verb after each name.)
  const what = dropped ? `${who(loser)} passes on the double: ${who(winner)} wins` : `${who(winner)} wins${kind === "single" ? "" : ` a ${kind}`} with the last checker off`;
  s.narration = `${what}${s.rules.cube || kind !== "single" ? ` (${points} point${points === 1 ? "" : "s"}${jacoby ? ": the cube was never turned" : ""})` : ""}`;
  s.phase = s.rules.match > 0 && s.score[winner]! < s.rules.match ? "scored" : "finished";
}

/** The dice are thrown and the turn begins; a roll that can't be played passes at once. Changes `s`. */
function begin(s: BackgammonState, seat: number, lead: string) {
  s.turn = seat;
  s.phase = "move";
  s.steps = [];
  s.used = s.dice.map(() => false);
  s.narration = lead;
  const { me, op } = sidesOf(s, seat);
  if (!legalHops(me, op, s.dice).length) {
    s.narration = `${lead} and can't move`;
    pass(s);
  }
}

/** The turn is over: the other seat is to roll. Changes `s`. */
function pass(s: BackgammonState) {
  if (s.steps.length) s.last = s.steps;
  s.steps = [];
  s.used = s.dice.map(() => true);
  s.turn = other(s.turn);
  s.phase = "roll";
}

function apply(state: BackgammonState, seat: number, move: BackgammonMove): BackgammonState {
  const type = move?.type;
  if (type !== "roll" && type !== "move" && type !== "undo" && type !== "confirm" && type !== "double" && type !== "take" && type !== "drop" && type !== "next") throw new GameError("That's not a move in Backgammon.");
  if (seat !== 0 && seat !== 1) throw new GameError("You're not in this game.");
  if (type === "next") {
    if (state.phase !== "scored") throw new GameError("There's a game going on.");
    const s = clone(state);
    if (markReady(s.ready, seat)) {
      s.round += 1;
      // The Crawford game is the one after somebody first gets to within a point of the match.
      s.crawford = s.rules.crawford && !s.crawfordDone && s.score.some((v) => v === s.rules.match - 1);
      if (s.crawford) s.crawfordDone = true;
      startGame(s);
    }
    return s;
  }
  if (state.phase === "scored" || state.phase === "finished") throw new GameError("This game is over.");

  if (state.phase === "opening") {
    if (type !== "roll") throw new GameError("Roll to see who goes first.");
    if (state.opening[seat] !== null) throw new GameError("You've rolled: wait for the other die.");
    const s = clone(state);
    s.opening[seat] = throwDie(s);
    s.rolls += 1;
    const a = s.opening[0] ?? null;
    const b = s.opening[1] ?? null;
    if (a === null || b === null) {
      s.narration = `${who(seat)} rolls a ${s.opening[seat]}`;
      return s;
    }
    if (a === b) {
      // A tie: roll again, and with automatic doubles the stakes go up (once).
      const auto = s.rules.autoDoubles && s.autos < 1;
      if (auto) {
        s.autos += 1;
        s.cube.value *= 2;
      }
      s.opening = [null, null];
      s.narration = `Both roll a ${a}${auto ? `: the cube goes to ${s.cube.value}` : ""}. Roll again`;
      return s;
    }
    const first = a > b ? 0 : 1;
    s.dice = [a, b];
    s.thrower = [0, 1];
    begin(s, first, `${who(first)} rolls the higher die: ${rolled([a, b])} to start`);
    return s;
  }

  if (state.phase === "offer") {
    if (seat !== other(state.turn)) throw new GameError(type === "take" || type === "drop" ? "The double isn't yours to answer." : "Waiting for an answer to the double.");
    if (type !== "take" && type !== "drop") throw new GameError("Take the double or drop it.");
    const s = clone(state);
    if (type === "drop") {
      endGame(s, s.turn, true);
      return s;
    }
    s.cube = { value: s.cube.value * 2, owner: seat, turned: true };
    s.phase = "roll";
    s.narration = `${who(seat)} takes: the cube is on ${s.cube.value}`;
    return s;
  }

  if (state.turn !== seat) throw new GameError("It's not your turn.");

  if (state.phase === "roll") {
    if (type === "double") {
      if (!state.rules.cube) throw new GameError("There's no doubling cube in this game.");
      if (state.crawford) throw new GameError("No doubling in the Crawford game.");
      if (!canDouble(state, seat)) throw new GameError(state.cube.value >= CUBE_MAX ? "The cube can't go any higher." : "The cube is on the other side: only they can double.");
      const s = clone(state);
      s.phase = "offer";
      s.narration = `${who(seat)} is doubling to ${s.cube.value * 2}`;
      return s;
    }
    if (type !== "roll") throw new GameError("Roll the dice first.");
    const s = clone(state);
    const [a, b] = [throwDie(s), throwDie(s)];
    s.dice = a === b ? [a, a, a, a] : [a, b];
    s.thrower = s.dice.map(() => seat);
    s.rolls += 1;
    begin(s, seat, `${who(seat)} rolls ${rolled(s.dice)}`);
    return s;
  }

  // Playing the dice.
  if (type === "roll") throw new GameError("You've rolled: play your dice.");
  if (type === "double" || type === "take" || type === "drop") throw new GameError("You can only double before you roll.");
  const options = backgammonSteps(state);
  if (type === "undo") {
    if (!state.steps.length) throw new GameError("There's nothing to take back.");
    const s = clone(state);
    const st = s.steps.pop()!;
    const checker = (st.to === null ? s.home[seat]! : s.stacks[st.to]!).pop()!;
    if (st.hit) s.stacks[st.to!]!.push(s.stacks[placeOf(seat, 0)]!.pop()!);
    s.stacks[st.from]!.push(checker);
    s.used[st.die] = false;
    s.narration = `${who(seat)} takes a move back`;
    return s;
  }
  if (type === "confirm") {
    if (options.length) throw new GameError("You still have dice to play.");
    const s = clone(state);
    finishTurn(s);
    return s;
  }
  const from = Number(move.from);
  const to = Number(move.to);
  const option = options.find((o) => o.from === from && o.to === to);
  if (!option) {
    const place = Number.isInteger(from) ? (PLACE_OF_CELL[from] ?? null) : null;
    const pile = place === null ? null : state.stacks[place]!;
    if (!Number.isInteger(to) || to < 0 || to >= COLS * 2 || place === null) throw new GameError("That's not on the board.");
    if (!pile!.length || ownerOf(pile![0]!) !== seat) throw new GameError("That's not your checker.");
    if (!options.length) throw new GameError("You have no more moves: finish your turn.");
    if (state.stacks[placeOf(seat, 25)]!.length && pointOf(seat, place) !== 25) throw new GameError("Your checker on the bar has to come in first.");
    if (!options.some((o) => o.from === from)) throw new GameError("That checker can't move with these dice (both have to be played if they can be).");
    throw new GameError("That checker can't go there.");
  }
  const s = clone(state);
  const fromPlace = PLACE_OF_CELL[from]!;
  const off = to === HOME_CELL[seat];
  const toPlace = off ? null : PLACE_OF_CELL[to]!;
  const checker = s.stacks[fromPlace]!.pop()!;
  let hit = false;
  if (toPlace === null) s.home[seat]!.push(checker);
  else {
    const pile = s.stacks[toPlace]!;
    if (pile.length === 1 && ownerOf(pile[0]!) !== seat) {
      s.stacks[placeOf(seat, 0)]!.push(pile.pop()!);
      hit = true;
    }
    pile.push(checker);
  }
  s.used[option.die] = true;
  s.steps.push({ seat, from: fromPlace, to: toPlace, die: option.die, hit });
  s.narration = `${who(seat)} plays ${notation(s.steps)}`;
  if (s.home[seat]!.length === 15) endGame(s, seat, false);
  else if (!s.rules.confirm && !backgammonSteps(s).length) finishTurn(s);
  return s;
}

/** The dice are played (or no more can be): say what was played and pass the turn. Changes `s`. */
function finishTurn(s: BackgammonState) {
  const left = diceLeft(s);
  s.narration = `${who(s.turn)} plays ${notation(s.steps)}${left.length ? ` and can't play the ${left.length > 1 ? "rest" : left[0]}` : ""}`;
  pass(s);
}

// ---- What a seat sees ---------------------------------------------------------------------------

const TONES = ["light", "dark"] as const;
function checkerOf(seat: number, pile?: number[]): BoardPiece {
  return { owner: seat, kind: "checker", glyph: "●", label: `${TONES[seat]} checker`, tone: TONES[seat], ...(pile ? { count: pile.length, ids: pile.map((c) => `c${c}`) } : {}) };
}

function resultOf(s: BackgammonState): RoundResult | null {
  const r = s.result;
  if (!r || !s.rules.match) return null;
  const how = r.dropped ? "the double was dropped" : r.kind === "single" ? "a single game" : `a ${r.kind}${r.jacoby ? " (not counted)" : ""}`;
  return {
    key: `game-${s.round}`,
    title: `${who(r.winner)} wins game ${s.round}: ${how}`,
    sides: [[0], [1]],
    rows: [
      { label: `Game ${s.round}`, values: [0, 1].map((seat) => (seat === r.winner ? `+${r.points}` : "")) },
      { label: `Match to ${s.rules.match}`, values: s.score.map(String), tone: "total" },
    ],
  };
}

function view(s: BackgammonState, seat: number): BoardView {
  const over = s.phase === "finished";
  const playing = s.phase === "roll" || s.phase === "move" || s.phase === "offer" || s.phase === "opening";
  const moving = s.phase === "move" && s.turn === seat;
  const options = moving ? backgammonSteps(s) : [];
  const cells: (BoardPiece | null)[] = Array<BoardPiece | null>(COLS * 2).fill(null);
  for (let place = 0; place <= 25; place++) {
    const pile = s.stacks[place]!;
    if (pile.length) cells[cellOfPlace(place)] = checkerOf(ownerOf(pile[0]!), pile);
  }
  for (const o of [0, 1]) if (s.home[o]!.length) cells[HOME_CELL[o]!] = checkerOf(o, s.home[o]!);

  // Where this turn has been so far, or (before its first move) where the turn before went.
  const marks: NonNullable<BoardGrid["marks"]> = [];
  for (const st of s.steps.length ? s.steps : s.last) {
    marks.push({ cell: cellOfPlace(st.from), mark: "from" });
    marks.push({ cell: st.to === null ? HOME_CELL[st.seat]! : cellOfPlace(st.to), mark: "last" });
  }
  // A checker on the bar has to come in before anything else moves: lit for both players.
  if (s.phase === "move" && s.stacks[placeOf(s.turn, 25)]!.length) marks.push({ cell: BAR_CELL[s.turn]!, mark: "must" });

  const sources = new Map<number, number[]>();
  for (const o of options) sources.set(o.from, [...(sources.get(o.from) ?? []), o.to]);
  const grid: BoardGrid = {
    id: "board",
    label: "Board",
    rows: 2,
    cols: COLS,
    cells,
    track: { kind: "points", path: PATH, bar: BAR_CELL, home: HOME_CELL },
    // The first seat's home board is the bottom right of `cells`; the second seat sees the board turned over, so theirs is too.
    flip: seat === 1 ? "rows" : false,
    marks,
    select: moving ? { type: "move", sources: [...sources].map(([from, to]) => ({ from, to })), quick: s.rules.quick } : null,
  };

  const match = s.rules.match;
  const mine = s.turn === seat;
  let choices: BoardView["choices"] = null;
  if (s.phase === "scored") choices = nextHandChoices(s.ready, seat, false, "Next game");
  else if (s.phase === "opening" && s.opening[seat] === null) choices = { prompt: "", options: [{ label: "Roll for the first move", move: { type: "roll" }, primary: true }] };
  else if (s.phase === "roll" && mine) {
    const list: Choice[] = [{ label: "Roll", move: { type: "roll" }, primary: true }];
    if (canDouble(s, seat)) list.push({ label: `Double to ${s.cube.value * 2}`, move: { type: "double" }, hint: "Offer to double the stakes before you roll" });
    choices = { prompt: "", options: list };
  } else if (s.phase === "offer" && !mine) {
    choices = {
      // What is on offer is in the narration, and on the cube.
      prompt: "",
      options: [
        { label: "Take", move: { type: "take" }, primary: true, hint: `Play on for ${s.cube.value * 2}: the cube is yours` },
        { label: "Drop", move: { type: "drop" }, hint: `Give up this game for ${s.cube.value} point${s.cube.value === 1 ? "" : "s"}` },
      ],
    };
  } else if (moving && s.steps.length) {
    choices = {
      prompt: "",
      options: [...(options.length ? [] : [{ label: "Done", move: { type: "confirm" }, primary: true, hint: "End your turn" }]), { label: "Undo", move: { type: "undo" }, hint: "Take back your last move" }],
    };
  }

  const cube: BoardCube | null = s.rules.cube ? { value: s.cube.value, owner: s.cube.owner, offered: s.phase === "offer" ? s.turn : null, dead: s.crawford } : null;
  const r = s.result;
  const info = [
    ...(match ? [`Match to ${match} · game ${s.round}`] : []),
    ...(s.crawford && playing ? ["The Crawford game: no doubling"] : []),
    ...(s.rules.jacoby && playing && !s.cube.turned ? ["Jacoby rule: gammons count once the cube is turned"] : []),
  ];
  return {
    game: "backgammon",
    seats: 2,
    me: seat,
    teams: false,
    phase: s.phase,
    turn: s.phase === "opening" || !playing ? null : s.phase === "offer" ? other(s.turn) : s.turn,
    grids: [grid],
    reserves: [],
    dice: {
      dice:
        s.phase === "opening"
          ? [0, 1].map((o) => ({ id: o, value: s.opening[o] ?? null, used: false, owner: o }))
          : s.dice.map((value, id) => ({ id, value, used: s.phase !== "move" || s.used[id]!, owner: s.thrower[id]! })),
      roll: s.rolls,
    },
    cube,
    choices,
    players: [0, 1].map((o) => {
      const pips = backgammonPips(s, o);
      const off = s.home[o]!.length;
      return {
        line: [`${pips} pip${pips === 1 ? "" : "s"}`, ...(off ? [`${off} off`] : []), ...(match ? [`${s.score[o]} of ${match}`] : [])].join(" · "),
        piece: checkerOf(o),
        badge: s.phase === "offer" && s.turn === o ? "Doubles" : s.cube.owner === o ? `Cube ${s.cube.value}` : undefined,
      };
    }),
    info,
    narration: s.narration ?? (s.phase === "opening" ? "Each roll a die: the higher goes first, with those two dice" : null),
    scores: s.score.map((value, o) => ({ seats: [o], value })),
    result: playing ? null : resultOf(s),
    over:
      over && r
        ? {
            winners: [r.winner],
            title: match
              ? `${who(r.winner)} wins the match ${s.score[r.winner]} to ${s.score[other(r.winner)]}!`
              : `${who(r.winner)} wins${r.dropped || r.kind === "single" ? "" : ` a ${r.kind}`}${s.rules.cube || r.points > 1 ? `: ${r.points} point${r.points === 1 ? "" : "s"}` : ""}!`,
          }
        : null,
  };
}

// ---- Computer players ---------------------------------------------------------------------------
// A computer player looks at every whole turn its dice allow and judges the position each leaves,
// with a hand-built judgement and no table of positions behind it. While the two sides can still
// hit each other it weighs the race, blots by how many of the other side's 36 rolls hit them and
// what being hit would cost, points made, a run of points in front of the other side's back
// checkers, anchors, its home board against a checker on the bar, and checkers piled up or buried.
// Once the sides have passed each other it is a pure race, judged by a pip count with the usual
// corrections for a ragged bear-off and turned into a chance of winning.
//
// The sharpest player then looks a move further for its best few turns: the other side's best
// answer to each of the 21 rolls, averaged. Middling players judge without looking further, and
// beginners count pips, blots and points and little else. A careless moment (see `careless`) plays
// any legal turn.
//
// The cube goes by the same judgement: in a race the 8-9-12 rule (double from 8% ahead, redouble
// from 9%, take up to 12% behind), otherwise the chance of winning it makes of the position.
//
// What it doesn't know: it has no bear-off database, no opening book and no idea of match equity
// beyond "the cube is dead when it already wins the match" and "double at once when you're losing
// the match anyway"; and it never plays on for a gammon by holding the cube back.

/** The 21 different rolls, and how many of the 36 ways of throwing two dice each is. */
const ROLLS: { a: number; b: number; ways: number }[] = [];
for (let a = 6; a >= 1; a--) for (let b = a; b >= 1; b--) ROLLS.push({ a, b, ways: a === b ? 1 : 2 });

/**
 * How a checker `d` points behind a blot can hit it, roll by roll: with one die (`steps` 1), with
 * the two dice of a roll added together (`steps` 2: one of the two points in between must be open),
 * or with a double played two, three or four times (every point on the way open).
 */
interface Shot {
  roll: number;
  /** The die that lands on the blot directly, or the first die of the two; a double's die. */
  a: number;
  /** The other die. */
  b: number;
  steps: number;
}
const SHOTS: Shot[][] = Array.from({ length: 25 }, (_, d) => {
  const out: Shot[] = [];
  ROLLS.forEach(({ a, b }, roll) => {
    if (a === d || b === d) out.push({ roll, a: d, b: a === d ? b : a, steps: 1 });
    else if (a !== b && a + b === d) out.push({ roll, a, b, steps: 2 });
    else if (a === b && d % a === 0 && d / a >= 2 && d / a <= 4) out.push({ roll, a, b, steps: d / a });
  });
  return out;
});

/** What a made point is worth, by the point, in pips: the home board and the points just outside it most. */
const POINT_WORTH = [0, 1, 2.5, 5, 8, 10, 9, 8, 5, 4, 3.5, 3, 2, 2.5, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
/** What an anchor in the other side's home board (or on their bar point) is worth. */
const ANCHOR_WORTH = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 6, 10, 9, 6, 4, 3, 0];
/** A run of made points in a row in front of the other side's back checkers, by its length. */
const PRIME_WORTH = [0, 0, 3, 9, 18, 30, 46];
/** A home board with this many points made, against each checker the other side has on the bar. */
const BOARD_WORTH = [0, 1, 3, 7, 13, 22, 40];
/** What being hit costs on top of the pips lost, by how many points the other side's home board has. */
const HIT_COST = [5, 6, 7, 9, 13, 19, 27];
/** How many pips of advantage it takes to turn an even game into about three to one. */
const SCALE = 26;

/** Scratch lists, so judging a position makes nothing new. */
const WORST = new Float64Array(ROLLS.length);
const THEM = new Int8Array(26);
const US = new Int8Array(26);

/**
 * What my blots stand to lose to the other side's next roll, in pips: for each roll, the dearest
 * blot it hits, weighted by how often the roll comes. `op` are the checkers that would do the
 * hitting: they travel up my numbering, from their bar at 0.
 */
function blotRisk(me: Side, op: Side, cost: number): number {
  let any = false;
  const onBar = op[0]!;
  for (let p = 1; p <= 24; p++) {
    if (me[p] !== 1) continue;
    let first = true;
    for (let j = p - 1; j >= 0; j--) {
      if (!op[j]) continue;
      // With checkers on the bar they come in first: with two or more there, nothing else moves.
      if (onBar > 1 && j > 0) continue;
      if (first) {
        if (!any) WORST.fill(0);
        any = true;
        first = false;
      }
      const loss = 25 - p + cost;
      for (const shot of SHOTS[p - j]!) {
        if (WORST[shot.roll]! >= loss) continue;
        let hits: boolean;
        if (shot.steps === 1) hits = !onBar || j === 0 || me[shot.b]! < 2;
        else if (onBar && (j > 0 || onBar > 1)) hits = false;
        else if (shot.steps === 2) hits = me[j + shot.a]! < 2 || me[j + shot.b]! < 2;
        else {
          hits = true;
          for (let k = 1; k < shot.steps; k++) if (me[j + shot.a * k]! >= 2) hits = false;
        }
        if (hits) WORST[shot.roll] = loss;
      }
    }
  }
  if (!any) return 0;
  let total = 0;
  for (let r = 0; r < ROLLS.length; r++) total += WORST[r]! * ROLLS[r]!.ways;
  return total / 36;
}

/** What my points, primes, anchors and piles are worth, in pips, against the other side's checkers `op`. */
function shape(me: Side, op: Side): number {
  let total = 0;
  let home = 0;
  let run = 0;
  let prime = 0;
  // How many of their checkers are still behind each point: on their bar, or on a lower point of mine.
  let behind = op[0]!;
  let behindRun = 0;
  for (let p = 1; p <= 24; p++) {
    const n = me[p]!;
    if (n >= 2) {
      total += POINT_WORTH[p]! + ANCHOR_WORTH[p]!;
      if (p <= 6) home++;
      if (p <= 12) {
        if (!run) behindRun = behind;
        run++;
        // A prime is only worth something with a checker stuck behind it.
        const held = PRIME_WORTH[Math.min(run, 6)]! * (behindRun >= 2 ? 1 : behindRun === 1 ? 0.6 : 0.08);
        if (held > prime) prime = held;
      }
      // Checkers piled high are doing nothing, and ones deep in the home board early are out of the game.
      if (n > 4) total -= (n - 4) * 2;
      if (p <= 3 && n > 2) total -= (n - 2) * (4 - p) * 0.6;
    } else run = 0;
    // A checker still in their home board has a long way to come and can be shut in: an anchor
    // there is worth having, but less than having got away.
    if (p >= 19) total -= n * 4;
    behind += op[p]!;
  }
  return total + prime + BOARD_WORTH[home]! * Math.min(op[0]!, 2);
}

/** How many points of their home board a side has made. `side` in its own numbering. */
const homePoints = (side: Side) => (side[1]! >= 2 ? 1 : 0) + (side[2]! >= 2 ? 1 : 0) + (side[3]! >= 2 ? 1 : 0) + (side[4]! >= 2 ? 1 : 0) + (side[5]! >= 2 ? 1 : 0) + (side[6]! >= 2 ? 1 : 0);

/**
 * A race count: the pips, plus what a ragged bear-off wastes (checkers heaped on the lowest points
 * and gaps on the high ones, after Tom Keith), and never less than the rolls it takes to bear
 * the checkers off two at a time.
 */
function raceCount(me: Side): number {
  let pips = 0;
  for (let p = 1; p <= 25; p++) pips += me[p]! * p;
  const waste = Math.max(0, me[1]! - 1) * 2 + Math.max(0, me[2]! - 1) + Math.max(0, me[3]! - 3) + (me[4] ? 0 : 1) + (me[5] ? 0 : 1) + (me[6] ? 0 : 1);
  return Math.max(pips + waste, Math.ceil((15 - me[0]!) / 2) * 7);
}

/** The chance a standard normal value is below `z`. */
function normal(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const tail = 0.3989423 * Math.exp((-z * z) / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - tail : tail;
}

/** The chance of winning a race for the side about to roll, from the two counts (Kleinman's count). */
const raceChance = (roller: number, waiter: number) => normal((waiter - roller + 4) / Math.sqrt(2 * Math.max(roller + waiter - 4, 1)));

/** How many pips a side needs to get every checker home and one of them off, if it has none off yet. */
function toSave(me: Side): number {
  let pips = 1;
  for (let p = 7; p <= 25; p++) pips += me[p]! * (p - 6);
  return pips;
}

/** How a position is judged: what winning a gammon is worth to each side on top of the game (0 when it wouldn't count). */
interface Stakes {
  gammonMe: number;
  gammonOp: number;
  /** A beginner's judgement: pips, blots and points, and nothing about where. */
  crude: boolean;
}

/**
 * What a position is worth to me with the other side about to roll: about +1 for a certain win and
 * −1 for a certain loss, a little more either way for a likely gammon. Also the chance of winning
 * it stands for, in `chance`.
 */
let chance = 0.5;
function judge(me: Side, op: Side, stakes: Stakes): number {
  work++;
  if (me[0] === 15) {
    chance = 1;
    return 1 + (op[25] ? 0 : stakes.gammonMe);
  }
  let back = 25;
  while (!me[back]) back--;
  let front = 0;
  while (!op[front]) front++;
  if (back < front) {
    // Past each other: a race, with them to roll.
    const mine = raceCount(me);
    const theirs = raceCount(turned(op, THEM));
    const p = 1 - raceChance(theirs, mine);
    chance = p;
    // The counts themselves still tell turns apart when the race is as good as won or lost.
    let value = 2 * p - 1 + (theirs - mine) * 0.003;
    // A gammon either way: whoever has nothing off needs to get home and bear one off in time.
    if (!op[25] && stakes.gammonMe) value += (p * stakes.gammonMe) / (1 + Math.exp(((mine - toSave(turned(op, THEM))) / 8.17 + 1) * 1.6));
    if (!me[0] && stakes.gammonOp) value -= ((1 - p) * stakes.gammonOp) / (1 + Math.exp(((theirs - toSave(me)) / 8.17 + 0.5) * 1.6));
    return value;
  }
  let pipsMe = 0;
  let pipsOp = 0;
  for (let p = 1; p <= 25; p++) {
    pipsMe += me[p]! * p;
    pipsOp += op[25 - p]! * p;
  }
  let x = pipsOp - pipsMe - 4;
  if (stakes.crude) {
    for (let p = 1; p <= 24; p++) {
      if (me[p]! >= 2 && p <= 12) x += 3;
      else if (me[p] === 1 && p > front) x -= 7;
    }
  } else {
    const them = turned(op, THEM);
    const us = turned(me, US);
    x += shape(me, op) - shape(them, us) - blotRisk(me, op, HIT_COST[homePoints(them)]!);
    // Their blots are only in danger if they leave them there, and they move first.
    x += 0.3 * blotRisk(them, us, HIT_COST[homePoints(me)]!);
  }
  const p = 1 / (1 + Math.exp(-x / SCALE));
  chance = p;
  return 2 * p - 1 + x * 0.0004;
}

/** The dice a roll puts on the table: four of them for a double. */
const diceOf = (a: number, b: number) => (a === b ? [a, a, a, a] : [a, b]);

/**
 * What a position is worth to me (they are about to roll) after their best answer to each roll,
 * averaged over the rolls. Null if it would take more looking than `cap` allows.
 */
function lookAhead(me: Side, op: Side, stakes: Stakes, cap: number): number | null {
  const them = turned(op);
  const us = turned(me);
  const theirs: Stakes = { gammonMe: stakes.gammonOp, gammonOp: stakes.gammonMe, crude: stakes.crude };
  let total = 0;
  for (const { a, b, ways } of ROLLS) {
    if (work > cap) return null;
    const replies = wholeTurns(them, us, diceOf(a, b));
    let best = -Infinity;
    if (!replies.length) best = judge(them, us, theirs);
    else for (const r of replies) best = Math.max(best, judge(r.me, r.op, theirs));
    total -= best * ways;
  }
  return total / 36;
}

/** How hard a computer player thinks: 2 looks a move further, 1 judges every turn, 0 is a beginner. */
const tierOf = (style: PlayStyle) => ((style.skill ?? 1) >= 0.9 ? 2 : (style.skill ?? 1) >= 0.5 ? 1 : 0);
/**
 * How much luck is in a player's judgement, by tier: none at the top. It counts for most where a
 * game is in the balance, and for next to nothing where it is as good as over, so nobody dawdles
 * over bearing off a won game.
 */
const LUCK = [0.08, 0.025, 0];
/**
 * How many of the best turns the sharpest player looks further into, how close to the best they
 * must be, and the most looking it may do over one turn (see `work`). Measured over a few hundred
 * games a turn took 2 to 3 ms on average and 40 ms at the slowest, which used half this ration.
 */
const DEEP = 4;
const DEEP_WITHIN = 0.14;
const DEEP_WORK = 40_000;

function stakesFor(s: BackgammonState, seat: number, tier: number): Stakes {
  // A gammon is worth nothing under the Jacoby rule until the cube is turned, or when a single game already wins the match.
  const counts = !(s.rules.jacoby && !s.cube.turned);
  const enough = (o: number) => s.rules.match > 0 && s.score[o]! + s.cube.value >= s.rules.match;
  return { gammonMe: counts && !enough(seat) ? 0.6 : 0, gammonOp: counts && !enough(other(seat)) ? 0.6 : 0, crude: tier === 0 };
}

/** A number from a position that is the same every time: where a player's luck comes from. */
function mix(seed: number, key: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return mulberry32(h)();
}

/** The last turn a computer player worked out, so the steps after the first don't work it out again. */
let planned: { key: string; hops: Hop[] } | null = null;

/**
 * The best whole turn for the seat to move with the dice still to play, at a tier of skill (see
 * `tierOf`): its hops in order. Null when nothing can be played.
 */
function bestTurn(s: BackgammonState, tier: number): Hop[] | null {
  const seat = s.turn;
  const { me, op } = sidesOf(s, seat);
  const dice = diceLeft(s);
  const stakes = stakesFor(s, seat, tier);
  const about = `|${tier}|${stakes.gammonMe}${stakes.gammonOp}|${s.rng}`;
  /** Remember the rest of a turn for the next step: the position its first hop leaves is the key. */
  const keep = (hops: Hop[]) => {
    if (hops.length < 2) return hops;
    const hit = hop(me, op, hops[0]!.from, hops[0]!.die);
    const rest = [...dice];
    rest.splice(rest.indexOf(hops[0]!.die), 1);
    planned = { key: `${keyOf(me, op)}|${rest.join("")}${about}`, hops: hops.slice(1) };
    unhop(me, op, hops[0]!.from, hops[0]!.die, hit);
    return hops;
  };
  if (planned?.key === `${keyOf(me, op)}|${dice.join("")}${about}`) return keep(planned.hops);
  const turns = wholeTurns(me, op, dice);
  if (!turns.length) return null;
  // The same turn gets the same luck however many of its steps have been played.
  const seed = (s.rng ^ Math.imul(s.rolls + 1, 0x9e3779b1)) >>> 0;
  const scored = turns.map((turn) => {
    const value = judge(turn.me, turn.op, stakes);
    return { turn, value, luck: (mix(seed, keyOf(turn.me, turn.op)) - 0.5) * LUCK[tier]! * (0.2 + 3.2 * chance * (1 - chance)) };
  });
  scored.sort((x, y) => y.value - x.value);
  let best = scored[0]!;
  if (tier === 2 && scored.length > 1) {
    const cap = work + DEEP_WORK;
    let top = -Infinity;
    for (const o of scored.slice(0, DEEP)) {
      if (o.value < scored[0]!.value - DEEP_WITHIN) break;
      const value = lookAhead(o.turn.me, o.turn.op, stakes, cap);
      // Out of looking: the best of the turns looked into so far stands.
      if (value === null) break;
      if (value > top) [top, best] = [value, o];
    }
  } else for (const o of scored) if (o.value + o.luck > best.value + best.luck) best = o;
  return keep(best.turn.hops);
}

/**
 * The seat to roll's chance of winning as a computer player of this tier sees it, and whether the
 * position is a race with `lead`: how far ahead the roller is, as a share of its own count.
 */
function outlook(s: BackgammonState, roller: number, tier: number): { chance: number; race: boolean; lead: number; count: number } {
  const { me, op } = sidesOf(s, roller);
  // Judged from the other side, who has "just moved": the roller's chance is what is left.
  judge(turned(op), turned(me), { gammonMe: 0, gammonOp: 0, crude: tier === 0 });
  const p = 1 - chance;
  const race = rearmost(me) < 25 - rearmost(turned(op));
  const mine = raceCount(me);
  const theirs = raceCount(turned(op));
  return { chance: p, race, lead: (theirs - mine) / Math.max(mine, 1), count: mine };
}

/** Whether a computer player on roll offers a double. */
function wantsToDouble(s: BackgammonState, seat: number, tier: number): boolean {
  if (!canDouble(s, seat)) return false;
  const match = s.rules.match;
  if (match) {
    // The cube is dead once a single game wins the match: turning it only helps the other side.
    if (s.score[seat]! + s.cube.value >= match) return false;
    // A game from losing the match anyway: there is nothing to lose by doubling at once.
    if (s.score[other(seat)]! >= match - 1) return true;
  }
  const view = outlook(s, seat, tier);
  const again = s.cube.owner === seat;
  // A long race goes by the lead; a short one, and anything with hitting still in it, by the chance.
  if (view.race && view.count >= 30) return view.lead >= (again ? 0.09 : 0.08);
  return view.chance >= (again ? 0.72 : 0.69);
}

/** Whether a computer player offered a double takes it. */
function wantsToTake(s: BackgammonState, seat: number, tier: number): boolean {
  const match = s.rules.match;
  // Dropping would lose the match: play on whatever the position.
  if (match && s.score[s.turn]! + s.cube.value >= match) return true;
  const view = outlook(s, s.turn, tier);
  if (view.race && view.count >= 30) return view.lead <= 0.12;
  return view.chance <= 0.76;
}

function bot(s: BackgammonState, seat: number, style: PlayStyle): BackgammonMove | null {
  if (s.phase === "scored") return s.ready[seat] ? null : { type: "next" };
  if (s.phase === "opening") return s.opening[seat] === null ? { type: "roll" } : null;
  if (s.phase === "finished") return null;
  const tier = tierOf(style);
  // A turn is several moves, so whether this is a careless moment has to be the same each time it's
  // asked between two rolls: it is decided by the dice thrown so far, not by the clock.
  const lapse = careless(style, mulberry32((s.rng ^ Math.imul(s.rolls + 1, 0x85ebca6b) ^ Math.imul(seat + 1, 0xc2b2ae35)) >>> 0));
  if (s.phase === "offer") {
    if (seat === s.turn) return null;
    // Without thinking, a double is taken: nobody likes to give a game up.
    return lapse || wantsToTake(s, seat, tier) ? { type: "take" } : { type: "drop" };
  }
  if (s.turn !== seat) return null;
  if (s.phase === "roll") return !lapse && wantsToDouble(s, seat, tier) ? { type: "double" } : { type: "roll" };
  const options = backgammonSteps(s);
  if (!options.length) return s.steps.length ? { type: "confirm" } : null;
  if (lapse) {
    // Whatever comes to hand.
    const { me, op } = sidesOf(s, seat);
    const o = options[Math.floor(mix(s.rng ^ s.steps.length, keyOf(me, op)) * options.length)]!;
    return { type: "move", from: o.from, to: o.to };
  }
  const first = bestTurn(s, tier)![0]!;
  const to = first.from - first.die;
  return { type: "move", from: cellOfPlace(placeOf(seat, first.from)), to: to <= 0 ? HOME_CELL[seat]! : cellOfPlace(placeOf(seat, to)) };
}

/** How much looking the computer players have done so far: for measuring what a move costs. */
export const backgammonWork = () => work;

// ---- The game -----------------------------------------------------------------------------------

function normalize(rules: unknown): BackgammonRules {
  const given = (rules && typeof rules === "object" ? rules : {}) as Partial<BackgammonRules>;
  const base = PRESETS.find((p) => p.id === given.id) ?? friendlyBackgammon;
  const r = { ...base, ...given };
  const match = MATCHES.includes(Number(r.match)) ? Number(r.match) : base.match;
  const cube = !!r.cube;
  return {
    id: String(r.id),
    name: String(r.name),
    match,
    cube,
    // Each of these only means something with the cube, in a match or outside one.
    crawford: cube && match > 0 && !!r.crawford,
    jacoby: cube && match === 0 && !!r.jacoby,
    autoDoubles: cube && match === 0 && !!r.autoDoubles,
    start: r.start === "nack" ? "nack" : "standard",
    confirm: !!r.confirm,
    quick: !!r.quick,
  };
}

export const backgammon: BoardGame<BackgammonRules, BackgammonState, BackgammonMove> = {
  id: "backgammon",
  name: "Backgammon",
  emoji: "🎲",
  blurb: "Race your checkers home, and hit theirs on the way",
  tagline: "Two dice and fifteen checkers each: a friendly game, a money game with the doubling cube, or a match to 3, 5 or 7 points.",
  seats: { min: 2, max: 2, default: 2 },
  teams: false,
  presets: PRESETS,
  fields: [
    { key: "match", label: "Play", kind: "choice", options: MATCHES.map((n) => [n, n ? `A match to ${n} points` : "A single game"]) },
    { key: "cube", label: "Doubling cube", hint: "Before rolling you can offer to double the stakes; the other player takes it, or drops and loses the game", kind: "toggle" },
    { key: "crawford", label: "Crawford rule", hint: "In a match with the cube: no doubling in the first game after someone gets to within a point of winning", kind: "toggle" },
    { key: "jacoby", label: "Jacoby rule", hint: "In a single game with the cube: gammons and backgammons only count once the cube has been turned", kind: "toggle" },
    { key: "autoDoubles", label: "Automatic doubles", hint: "In a single game with the cube: a tied opening roll doubles the stakes (once)", kind: "toggle" },
    { key: "start", label: "Starting position", kind: "choice", options: [["standard", "Standard"], ["nack", "Nackgammon (four checkers back)"]] },
    { key: "confirm", label: "Finish each turn with Done", hint: "Your turn isn't over until you say so, and you can take all of it back until then", kind: "toggle" },
    { key: "quick", label: "One tap moves", hint: "Tapping a checker that has only one place to go plays it at once", kind: "toggle" },
  ],
  normalize,
  validate: () => [],
  describe(r) {
    return [
      `${r.start === "nack" ? "Nackgammon: each side starts with two checkers on its 24 point, two on its 23, four on the 13, three on the 8 and four on the 6" : "Each side starts with two checkers on its 24 point, five on the 13, three on the 8 and five on the 6"}, and moves them round to its own home board (points 1 to 6) and off. To start, each player rolls one die: the higher goes first and plays those two dice; a tie is rolled again.`,
      "On your turn, roll and move one checker for each die (a double is played four times). A checker can land on any point the other side doesn't hold with two or more. Landing on a single checker hits it: it goes to the bar and has to come back in on your home board before that player moves anything else.",
      "You have to play both dice if there is any way to; if only one can be played it has to be the bigger. A roll you can't play at all passes by itself.",
      "With all fifteen checkers in your home board you bear them off: a die takes off a checker from the point it shows, or, when nothing is on a higher point, from the highest point you have.",
      `Tap a checker, then where it goes. Until your turn is over you can take your moves back with Undo.${r.confirm ? " Your turn ends when you press Done." : " Your turn ends by itself when your dice are played."}${r.quick ? " A checker with only one place to go moves as soon as you tap it." : ""}`,
      "The first to bear off every checker wins: a gammon (double) if the loser has borne off none, a backgammon (triple) if the loser also has a checker on the bar or in the winner's home board.",
      ...(r.cube
        ? [
            `The doubling cube: before you roll you may offer to double the stakes. The other player takes (and now owns the cube: only they can double next) or drops and loses the game at the stakes as they stood.${r.jacoby ? " Jacoby rule: gammons and backgammons only count once the cube has been turned." : ""}${r.autoDoubles ? " A tied opening roll doubles the stakes, once." : ""}`,
          ]
        : []),
      ...(r.match ? [`A match to ${r.match} points: each game scores the cube times one, two or three, and the first to ${r.match} wins.${r.crawford ? " Crawford rule: in the first game after a player comes within a point of winning, nobody may double." : ""}`] : []),
    ];
  },
  newGame: newBackgammon,
  apply,
  view,
  bot,
  // A roll comes quickly, a cube decision takes a moment, and the steps after a turn's first are already thought out.
  thinkingTime: (s) => (s.phase === "offer" ? 1800 : s.phase === "move" ? (s.steps.length ? 450 : 1000) : s.phase === "roll" ? 700 : 500),
  summary(s) {
    const over = s.phase === "finished";
    const winner = s.result?.winner ?? 0;
    return {
      game: "backgammon",
      rules: s.rules.name,
      phase: s.phase,
      over,
      hand: s.round,
      scoreLine: `${s.score[0]} to ${s.score[1]}`,
      // A win is a win, whatever it was won for.
      order: over ? [winner, other(winner)] : null,
      winners: over ? [winner] : null,
      teams: false,
      seats: s.seats,
    };
  },
};
