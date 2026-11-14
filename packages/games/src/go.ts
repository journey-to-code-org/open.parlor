// Go (Weiqi in China, Baduk in Korea). Two players, black and white stones, put down one at a time
// on the crossings of a grid of lines. Stones of one colour that touch along the lines stand or
// fall together: a group with no empty crossing beside it (a liberty) is captured and comes off.
// The board may never be put back the way it has been before (the ko rule), a stone may not be
// played where it would have no liberty unless it captures, and a player may pass. Two passes in a
// row end the play, and whoever holds more of the board wins.
//
// "Holds more" is counted in one of two ways, and a table picks:
//
//   Chinese (area):        your stones on the board, plus the empty points only you surround.
//   Japanese (territory):  the empty points only you surround, plus the stones you have captured.
//
// White is given points for moving second (komi), and the half point in it means no draws.
//
// Either way the count needs to know which stones left on the board could not have been saved
// (dead stones are lifted off first), and no simple rule says which. So after two passes the game
// goes to a counting phase, as it does over a real board: the game proposes which groups are dead
// from its own estimate, either player may tap a group to change that, and the count stands when
// both have agreed to the same marking. A player who doesn't accept it says "Play on", and the game
// carries on with the other player to move: captured is the one status nobody argues with.
//
// A handicap gives the weaker player (Black, by convention) stones on the star points before the
// game starts; White then moves first and gets only the half point.
//
// The board itself, the count and the computer player's search are in goboard.ts.
import type { PlayStyle } from "@spades/rules";
import { settleMatch, withOffers } from "./offers.js";
import type { BoardGame, BoardGrid, BoardPiece, BoardView } from "./board.js";
import { BLACK, EMPTY, GoBoard, WHITE, boardFromCells, countGo, deadFromOwners, estimateOwners, goGeometry, goPrior, groupCells, handicapCells, searchGo, starPoints, type GoCount, type Stone } from "./goboard.js";
import { careless, GameError, markReady, nextHandChoices, nextRandom, thinkFor, who, type BaseRules, type Choices, type SummaryRow, type ThinkBudget } from "./table.js";

export interface GoRules extends BaseRules {
  /** The board is size × size lines. */
  size: number;
  /** How the game is counted: "area" (Chinese: stones and surrounded points) or "territory" (Japanese: surrounded points and prisoners). */
  scoring: "area" | "territory";
  /** Points White is given for moving second. A whole number allows a drawn game. */
  komi: number;
  /** Stones Black starts with on the star points (2 to 9; 1 is just "no komi"). With any handicap White gets half a point and no more. */
  handicap: number;
  /** Who plays Black in the first game. */
  black: "random" | "seat1" | "seat2";
  /** What may not be repeated: any earlier position of the board ("superko"), or only the position before the last move ("simple"). */
  ko: "superko" | "simple";
  /** A move that leaves its own group without a liberty is allowed, and takes that group off. */
  suicide: boolean;
  /** Games in a match: most wins takes it. */
  games: number;
}

export const smallGo: GoRules = { id: "go-small", name: "Small board (9×9)", size: 9, scoring: "area", komi: 7.5, handicap: 0, black: "random", ko: "superko", suicide: false, games: 1 };
export const mediumGo: GoRules = { ...smallGo, id: "go-medium", name: "Medium board (13×13)", size: 13 };
export const fullGo: GoRules = { ...smallGo, id: "go-full", name: "Full board (19×19)", size: 19 };
export const japaneseGo: GoRules = { ...smallGo, id: "go-japanese", name: "Japanese rules (9×9)", scoring: "territory", komi: 6.5, ko: "simple" };
const PRESETS = [smallGo, mediumGo, fullGo, japaneseGo];
const SIZES = [9, 13, 19];
const KOMI = [0, 0.5, 5.5, 6, 6.5, 7, 7.5];

/** What White is actually given at a table: the komi, or half a point when Black has a handicap. */
export const komiOf = (r: Pick<GoRules, "komi" | "handicap">) => (r.handicap > 0 ? 0.5 : r.komi);

export interface GoState {
  game: "go";
  rules: GoRules;
  seats: number;
  rng: number;
  /** Which game of the match, from 1. */
  round: number;
  /** The seat playing Black in this game. */
  black: number;
  /** The board, a character a crossing, row by row from the top left: "." empty, "X" black, "O" white. */
  board: string;
  turn: number;
  /** Stones and passes played in this game. */
  moves: number;
  /** Passes in a row just now. */
  passes: number;
  /** Somebody has passed in this game (the first pass is asked about before it is sent). */
  passed: boolean;
  /** Where the last stone went down; null at the start and after a pass. */
  last: number | null;
  /** The crossing that can't be played this turn because it would take a ko straight back. */
  ko: number | null;
  /** Stones each seat has captured. */
  captured: number[];
  /**
   * The hash of every position this game's board has been in (see `GoBoard.hash`), for the superko
   * rule. Hashes, not boards: a few bytes a move. Empty when the table plays simple ko.
   */
  seen: number[];
  /**
   * "counting": play has stopped and the players are agreeing which stones are dead.
   * "scored": between games of a match. "finished": the match (or the one game) is over.
   */
  phase: "playing" | "counting" | "scored" | "finished";
  /** While counting, and after: the stones marked dead, as cells. */
  dead: number[];
  /** While counting: who has agreed to the marking as it stands. */
  agreed: boolean[];
  /** How many times the counting has been broken off to play on, in this game. */
  resumes: number;
  /** The count each seat finished with, komi included; null while playing, and for a game that was resigned. */
  score: number[] | null;
  /** Who won the game just played; null for a draw (or while playing). */
  roundWinner: number | null;
  wins: number[];
  draws: number;
  ready: boolean[];
  narration: string | null;
}

export type GoMove = { type: "place"; cell: number } | { type: "pass" } | { type: "toggle"; cell: number } | { type: "agree" } | { type: "resume" } | { type: "next" };

const other = (seat: number) => 1 - seat;
const colourOf = (s: Pick<GoState, "black">, seat: number): Stone => (seat === s.black ? BLACK : WHITE);
const seatOf = (s: Pick<GoState, "black">, colour: number) => (colour === BLACK ? s.black : other(s.black));
const CHARS = ".XO";
const stoneAt = (board: string, cell: number) => (board.charCodeAt(cell) === 88 ? BLACK : board.charCodeAt(cell) === 79 ? WHITE : EMPTY);
const cellsOf = (board: string) => Uint8Array.from(board, (ch) => (ch === "X" ? BLACK : ch === "O" ? WHITE : EMPTY));

/** Columns are lettered left to right without an I (it reads as a 1 or a J), rows numbered from the bottom. */
const LETTERS = "ABCDEFGHJKLMNOPQRST";
const COORDS = new Map<number, { cols: string[]; rows: string[] }>();
function coordsOf(n: number) {
  let c = COORDS.get(n);
  if (!c) COORDS.set(n, (c = { cols: Array.from({ length: n }, (_, i) => LETTERS[i]!), rows: Array.from({ length: n }, (_, r) => String(n - r)) }));
  return c;
}
/** A crossing's name: "D4", "Q16". */
export const goPoint = (n: number, cell: number) => `${LETTERS[cell % n]}${n - Math.floor(cell / n)}`;

// ---- The board behind a state ---------------------------------------------------------------------

/** The last few boards built from a state's string: trying every move a view offers asks for the same one hundreds of times. */
const BUILT = new Map<string, GoBoard>();
/** One board of each size that `boardOf` hands out again and again: a move tried is a board copied, hundreds of times a turn. */
const LENT = new Map<number, GoBoard>();
/**
 * A board for this state, to look at or play on. It is lent: the next call for the same size gets
 * the same one, set up afresh. A caller that keeps its board across other calls here asks for its `own`.
 */
function boardOf(s: Pick<GoState, "board" | "rules" | "ko" | "last">, own = false): GoBoard {
  const n = s.rules.size;
  const key = `${n}:${s.board}`;
  let made = BUILT.get(key);
  if (!made) {
    made = boardFromCells(n, cellsOf(s.board));
    if (BUILT.size >= 4) BUILT.delete(BUILT.keys().next().value!);
    BUILT.set(key, made);
  }
  let b: GoBoard;
  if (own) b = made.clone();
  else {
    if (!LENT.has(n)) LENT.set(n, new GoBoard(made.g));
    b = LENT.get(n)!.copyFrom(made);
  }
  b.ko = s.ko === null ? 0 : b.g.at[s.ko]!;
  b.last = s.last === null ? 0 : b.g.at[s.last]!;
  return b;
}

const CODES = [CHARS.charCodeAt(0), CHARS.charCodeAt(1), CHARS.charCodeAt(2)];
function boardString(b: GoBoard): string {
  const { at } = b.g;
  const codes = new Array<number>(at.length);
  for (let i = 0; i < at.length; i++) codes[i] = CODES[b.color[at[i]!]!]!;
  return String.fromCharCode.apply(null, codes);
}

/** A spare board of each size to try a move on: one is enough, since nothing here is ever in the middle of two things. */
const SCRATCH = new Map<number, GoBoard>();
function scratchOf(b: GoBoard): GoBoard {
  let spare = SCRATCH.get(b.g.n);
  if (!spare) SCRATCH.set(b.g.n, (spare = new GoBoard(b.g)));
  return spare;
}

/** The positions a state's board has been in, as a set (kept beside the list it was made from). */
const SEEN = new WeakMap<number[], Set<number>>();
function seenOf(s: Pick<GoState, "seen">): Set<number> {
  let set = SEEN.get(s.seen);
  if (!set) SEEN.set(s.seen, (set = new Set(s.seen)));
  return set;
}

/**
 * Why `colour` can't play at `cell` on this board, in words for the player; null when it can.
 * `b` is the state's board, and is left as it was.
 */
function refusal(s: GoState, b: GoBoard, cell: number, colour: Stone): string | null {
  const p = b.g.at[cell]!;
  if (b.color[p] !== EMPTY) return "There's a stone there already.";
  if (p === b.ko) return "That would take the ko straight back: play somewhere else first.";
  const alive = b.legal(p, colour);
  if (!alive && !s.rules.suicide) return "A stone there would have no liberties.";
  const superko = s.rules.ko === "superko";
  // A stone that takes nothing off just adds itself to the position: no need to play it to know the hash.
  if (alive && !b.captures(p, colour)) return superko && seenOf(s).has(b.hashWith(p, colour)) ? "That would repeat a position the board has been in before." : null;
  const scratch = scratchOf(b).copyFrom(b);
  scratch.play(p, colour);
  // (One stone that only takes itself off changes nothing, which is no move at all.)
  if (!alive && scratch.hash === b.hash) return "A stone there would have no liberties.";
  return superko && seenOf(s).has(scratch.hash) ? "That would repeat a position the board has been in before." : null;
}

/** Every crossing `seat` may play now. */
export function legalGoMoves(s: GoState, seat: number): number[] {
  const b = boardOf(s);
  const colour = colourOf(s, seat);
  const out: number[] = [];
  for (let cell = 0; cell < s.board.length; cell++) if (s.board.charCodeAt(cell) === 46 && refusal(s, b, cell, colour) === null) out.push(cell);
  return out;
}

// ---- Dead stones and the count --------------------------------------------------------------------

/** How many games an estimate plays out: enough to tell a dead group from a live one, on each size. */
const estimateGames = (n: number) => (n <= 9 ? 160 : n <= 13 ? 120 : 80);

const PROPOSED = new Map<string, number[]>();
/**
 * The game's own view of which stones are dead: every group that ends up the other side's in most
 * of a batch of games played out from here (goboard.ts). It depends on the position and nothing
 * else, so it replays, and a computer player asked what it thinks gets the same answer.
 */
export function proposedDead(s: Pick<GoState, "board" | "rules" | "ko" | "last">, toMove: Stone): number[] {
  const n = s.rules.size;
  const key = `${n}:${toMove}:${s.board}`;
  let dead = PROPOSED.get(key);
  if (!dead) {
    const b = boardOf({ ...s, ko: null, last: null }, true);
    dead = deadFromOwners(n, cellsOf(s.board), estimateOwners(b, toMove, estimateGames(n), b.lo ^ 0x51ed27));
    if (PROPOSED.size >= 8) PROPOSED.delete(PROPOSED.keys().next().value!);
    PROPOSED.set(key, dead);
  }
  return dead;
}

export interface GoScore {
  count: GoCount;
  /** Each seat's total, komi included. */
  totals: number[];
  /** What each seat's total is made of, in the order it is read out. */
  rows: SummaryRow[];
}

const fmt = (points: number) => (Number.isInteger(points) ? String(points) : points.toFixed(1));

/** The count of a state's board with `dead` lifted off, under the table's scoring. */
export function scoreGo(s: Pick<GoState, "board" | "rules" | "black" | "captured">, dead: readonly number[]): GoScore {
  const count = countGo(s.rules.size, cellsOf(s.board), dead);
  const komi = komiOf(s.rules);
  const white = other(s.black);
  const by = (black: number, whiteValue: number) => (s.black === 0 ? [black, whiteValue] : [whiteValue, black]);
  const territory = by(count.territory[BLACK], count.territory[WHITE]);
  const komiRow: SummaryRow = { label: "Komi", values: by(0, komi).map((k) => (k ? fmt(k) : "")) };
  let totals: number[];
  let rows: SummaryRow[];
  if (s.rules.scoring === "area") {
    const stones = by(count.stones[BLACK], count.stones[WHITE]);
    totals = [0, 1].map((seat) => stones[seat]! + territory[seat]! + (seat === white ? komi : 0));
    rows = [{ label: "Stones", values: stones.map(String) }, { label: "Territory", values: territory.map(String) }];
  } else {
    // A dead stone is a prisoner as well as a point of territory once it is lifted.
    const prisoners = by(s.captured[s.black]! + count.dead[WHITE], s.captured[white]! + count.dead[BLACK]);
    totals = [0, 1].map((seat) => territory[seat]! + prisoners[seat]! + (seat === white ? komi : 0));
    rows = [{ label: "Territory", values: territory.map(String) }, { label: "Prisoners", values: prisoners.map(String) }];
  }
  if (komi) rows.push(komiRow);
  rows.push({ label: "Total", values: totals.map(fmt), tone: "score" });
  return { count, totals, rows };
}

// ---- Starting -------------------------------------------------------------------------------------

function startRound(s: GoState) {
  const n = s.rules.size;
  const cells = new Uint8Array(n * n);
  for (const cell of handicapCells(n, s.rules.handicap)) cells[cell] = BLACK;
  const b = boardFromCells(n, cells);
  s.board = boardString(b);
  // With stones given, White has the first move.
  s.turn = s.rules.handicap >= 2 ? other(s.black) : s.black;
  s.moves = 0;
  s.passes = 0;
  s.passed = false;
  s.last = null;
  s.ko = null;
  s.captured = [0, 0];
  s.seen = s.rules.ko === "superko" ? [b.hash] : [];
  s.phase = "playing";
  s.dead = [];
  s.agreed = [false, false];
  s.resumes = 0;
  s.score = null;
  s.roundWinner = null;
  s.ready = [false, false];
  s.narration = null;
}

export function newGo(rules: GoRules, _seats: number, seed: number): GoState {
  const s = { game: "go", rules, seats: 2, rng: seed >>> 0, round: 1, wins: [0, 0], draws: 0 } as GoState;
  s.black = rules.black === "seat1" ? 0 : rules.black === "seat2" ? 1 : nextRandom(s)() < 0.5 ? 0 : 1;
  startRound(s);
  return s;
}

// ---- Moves ----------------------------------------------------------------------------------------

function matchOver(s: GoState): boolean {
  const left = s.rules.games - s.round;
  return left <= 0 || Math.abs(s.wins[0]! - s.wins[1]!) > left;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Both have agreed: count the board and end the game. */
function finish(s: GoState) {
  const { totals } = scoreGo(s, s.dead);
  const [a, b] = totals as [number, number];
  const many = s.rules.games > 1;
  s.score = totals;
  if (a === b) {
    s.draws += 1;
    s.roundWinner = null;
    s.narration = `${many ? `Game ${s.round} is a draw` : "It's a draw"}, ${fmt(a)} all`;
  } else {
    const winner = a > b ? 0 : 1;
    s.wins[winner]! += 1;
    s.roundWinner = winner;
    s.narration = `${who(winner)} wins${many ? ` game ${s.round}` : ""} by ${plural(Math.abs(a - b), "point")}: ${fmt(Math.max(a, b))} to ${fmt(Math.min(a, b))}`;
  }
  s.phase = matchOver(s) ? "finished" : "scored";
}

function apply(state: GoState, seat: number, move: GoMove): GoState {
  if (seat !== 0 && seat !== 1) throw new GameError("You're not playing at this table.");
  if (move?.type === "next") {
    if (state.phase !== "scored") throw new GameError("There's a game going on.");
    const s: GoState = { ...state, ready: [...state.ready], wins: [...state.wins] };
    if (markReady(s.ready, seat)) {
      s.round += 1;
      // Players take turns with Black, unless Black is the one being given stones.
      if (s.rules.handicap === 0) s.black = other(s.black);
      startRound(s);
    }
    return s;
  }
  const n = state.rules.size;

  if (move?.type === "toggle" || move?.type === "agree" || move?.type === "resume") {
    if (state.phase !== "counting") throw new GameError(state.phase === "playing" ? "The game isn't being counted yet: that starts when both players pass." : "This game is over.");
    if (move.type === "resume") {
      // Back to the board, and the player who wanted to stop there gets to answer first.
      return { ...state, phase: "playing", turn: other(seat), passes: 0, dead: [], agreed: [false, false], resumes: state.resumes + 1, narration: `${who(seat)} plays on: ${who(other(seat))} to move` };
    }
    if (move.type === "toggle") {
      const cell = Number(move.cell);
      if (!Number.isInteger(cell) || cell < 0 || cell >= state.board.length) throw new GameError("That's not on the board.");
      if (stoneAt(state.board, cell) === EMPTY) throw new GameError("There's no stone there to mark.");
      const group = groupCells(n, cellsOf(state.board), cell);
      const wasDead = state.dead.includes(cell);
      const rest = state.dead.filter((d) => !group.includes(d));
      // A changed marking is a new proposal: nobody has agreed to it yet.
      return { ...state, dead: wasDead ? rest : [...rest, ...group].sort((a, b) => a - b), agreed: [false, false], narration: `${who(seat)} says the ${plural(group.length, "stone")} at ${goPoint(n, cell)} ${group.length === 1 ? "is" : "are"} ${wasDead ? "alive" : "dead"}` };
    }
    if (state.agreed[seat]) throw new GameError(`You've agreed already: waiting for ${who(other(seat))}.`);
    const s: GoState = { ...state, agreed: state.agreed.map((yes, i) => yes || i === seat), wins: [...state.wins], narration: `${who(seat)} is happy with the count` };
    if (s.agreed.every(Boolean)) finish(s);
    return s;
  }

  if (move?.type !== "place" && move?.type !== "pass") throw new GameError("That's not a move in Go.");
  if (state.phase !== "playing") throw new GameError(state.phase === "counting" ? "Play has stopped: agree the count, or say \"Play on\"." : "This game is over.");
  if (state.turn !== seat) throw new GameError("It's not your turn.");

  if (move.type === "pass") {
    const s: GoState = { ...state, moves: state.moves + 1, passes: state.passes + 1, passed: true, last: null, ko: null, turn: other(seat) };
    if (s.passes < 2) {
      s.narration = `${who(seat)} passes`;
      return s;
    }
    // Two passes: stop, and work out what is dead. Whoever would have moved next is who a
    // playout starts with.
    s.phase = "counting";
    s.dead = proposedDead(s, colourOf(s, other(seat)));
    s.agreed = [false, false];
    s.narration = `${who(seat)} passes too: time to count`;
    return s;
  }

  const cell = Number(move.cell);
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.board.length) throw new GameError("That's not on the board.");
  const colour = colourOf(state, seat);
  const b = boardOf(state);
  const no = refusal(state, b, cell, colour);
  if (no) throw new GameError(no);
  b.play(b.g.at[cell]!, colour);
  const captured = [...state.captured];
  // A stone that took its own group off (a table that allows it) hands those stones to the other side.
  const own = b.last === 0;
  captured[own ? other(seat) : seat]! += b.taken;
  return {
    ...state,
    board: boardString(b),
    turn: other(seat),
    moves: state.moves + 1,
    passes: 0,
    last: own ? null : cell,
    ko: b.ko ? b.g.cell[b.ko]! : null,
    captured,
    seen: state.rules.ko === "superko" ? [...state.seen, b.hash] : state.seen,
    narration: `${who(seat)} plays ${goPoint(n, cell)}${b.taken ? (own ? `, and ${plural(b.taken, "stone")} of their own ${b.taken === 1 ? "comes" : "come"} off` : `, capturing ${plural(b.taken, "stone")}`) : ""}`,
  };
}

/** Best first. A drawn match lists White of the last game first, as the other board games list the second player. */
function order(s: GoState): number[] {
  const [a, b] = s.wins as [number, number];
  if (a !== b) return a > b ? [0, 1] : [1, 0];
  return [other(s.black), s.black];
}
const winners = (s: GoState) => (s.wins[0] === s.wins[1] ? [0, 1] : [s.wins[0]! > s.wins[1]! ? 0 : 1]);

// ---- What a seat sees -----------------------------------------------------------------------------

const BLACK_STONE: Omit<BoardPiece, "owner"> = { kind: "stone", glyph: "●", label: "black stone", tone: "dark" };
const WHITE_STONE: Omit<BoardPiece, "owner"> = { kind: "stone", glyph: "●", label: "white stone", tone: "light" };
const stoneOf = (s: Pick<GoState, "black">, seat: number): BoardPiece => ({ ...(seat === s.black ? BLACK_STONE : WHITE_STONE), owner: seat });

function view(s: GoState, seat: number): BoardView {
  const n = s.rules.size;
  const over = s.phase === "finished";
  const playing = s.phase === "playing";
  const counting = s.phase === "counting";
  const mine = playing && s.turn === seat;
  const many = s.rules.games > 1;
  const w = over ? winners(s) : [];
  // The count is shown while it is being agreed, and after a game that was counted.
  const counted = counting || s.score !== null;
  const score = counted ? scoreGo(s, s.dead) : null;
  const dead = new Set(counted ? s.dead : []);
  const stars = new Set(starPoints(n));
  const marks: NonNullable<BoardGrid["marks"]> = [];
  if (s.last !== null) marks.push({ cell: s.last, mark: "last" });
  if (playing && s.ko !== null) marks.push({ cell: s.ko, mark: "barred" });
  if (score) for (let cell = 0; cell < n * n; cell++) if (score.count.owner[cell] && (dead.has(cell) || stoneAt(s.board, cell) === EMPTY)) marks.push({ cell, mark: "claimed", owner: seatOf(s, score.count.owner[cell]!) });
  const stones: number[] = [];
  const cells: (BoardPiece | null)[] = [];
  for (let cell = 0; cell < n * n; cell++) {
    const colour = stoneAt(s.board, cell);
    if (colour === EMPTY) cells.push(null);
    else {
      stones.push(cell);
      const piece = stoneOf(s, seatOf(s, colour));
      cells.push(dead.has(cell) ? { ...piece, faded: true, label: `${piece.label}, dead` } : piece);
    }
  }
  const grid: BoardGrid = {
    id: "board",
    label: "Board",
    rows: n,
    cols: n,
    points: true,
    coords: coordsOf(n),
    cells,
    shade: Array.from({ length: n * n }, (_, cell) => (stars.has(cell) ? "spot" : "plain")),
    marks,
    // On your turn, every crossing the rules allow. While counting, either player may tap any group.
    tap: mine ? { type: "place", cells: legalGoMoves(s, seat) } : counting && (seat === 0 || seat === 1) ? { type: "toggle", cells: stones } : null,
  };

  let choices: Choices | null = null;
  if (mine) {
    choices = { prompt: "", options: [{ label: "Pass", move: { type: "pass" }, hint: "Give up your turn. Two passes in a row end the game.", ...(s.passed ? {} : { confirm: "Pass your turn? When both players pass, play stops and the game is counted." }) }] };
  } else if (counting && (seat === 0 || seat === 1)) {
    choices = {
      prompt: s.agreed[seat] ? `Waiting for ${who(other(seat))} to agree` : "Faded stones are dead. Tap a group to change it, then agree the count.",
      options: [...(s.agreed[seat] ? [] : [{ label: "Agree", move: { type: "agree" }, primary: true }]), { label: "Play on", move: { type: "resume" }, hint: "Carry on with the game instead. The other player moves first." }],
    };
  } else if (s.phase === "scored") choices = nextHandChoices(s.ready, seat, false, "Next game");

  const komi = komiOf(s.rules);
  const scoreTitle = s.roundWinner === null ? `Game ${s.round} is a draw` : `${who(s.roundWinner)} wins game ${s.round}`;
  const title = () => {
    if (w.length > 1) return "It's a draw!";
    const winner = w[0]!;
    if (many) return s.wins[winner]! > s.wins[other(winner)]! ? `${who(winner)} wins ${s.wins[winner]} to ${s.wins[other(winner)]}!` : `${who(winner)} wins!`;
    return s.score ? `${who(winner)} wins by ${plural(Math.abs(s.score[0]! - s.score[1]!), "point")}!` : `${who(winner)} wins!`;
  };
  const done = s.phase === "scored" || over;
  return {
    game: "go",
    seats: s.seats,
    me: seat,
    teams: false,
    phase: s.phase,
    turn: playing ? s.turn : null,
    grids: [grid],
    // The stones each player has taken, beside their name.
    reserves: [0, 1].map((i) => ({ owner: i, label: "Captured", pieces: [{ piece: stoneOf(s, other(i)), count: s.captured[i]! }] })),
    choices,
    players: [0, 1].map((i) => ({
      // (The stones each has taken are beside the name already: see `reserves`.)
      line: many ? plural(s.wins[i]!, "win") : "",
      piece: stoneOf(s, i),
      badge: counting ? (s.agreed[i] ? "Agreed" : undefined) : !playing ? undefined : s.passes === 1 && s.turn === other(i) ? "Passed" : s.moves === 0 && s.turn === i ? "Goes first" : undefined,
    })),
    info: [
      `${s.rules.scoring === "area" ? "Chinese" : "Japanese"} counting${komi ? ` · White gets ${fmt(komi)}` : ""}`,
      ...(s.rules.handicap >= 2 ? [`Black starts with ${s.rules.handicap} stones`] : []),
      ...(many ? [`Game ${s.round} of ${s.rules.games}`] : []),
    ],
    narration: s.narration ?? (mine ? (s.rules.handicap >= 2 ? "Black has the handicap stones: you're White, and you go first" : "You're Black: you go first") : null),
    // A match is scored in games won. One game shows the count once there is one, and until then the stones taken.
    scores: (many ? s.wins : score ? score.totals : s.captured).map((value, i) => ({ seats: [i], value })),
    result:
      done && (many || s.score)
        ? {
            key: `game-${s.round}`,
            title: scoreTitle,
            sides: [[0], [1]],
            rows: [...(s.score && score ? score.rows : []), ...(many ? [{ label: "Wins", values: s.wins.map(String), tone: "total" as const }, ...(s.draws ? [{ label: "Draws", values: [String(s.draws), String(s.draws)] }] : [])] : [])],
          }
        : null,
    over: over ? { winners: w, title: title() } : null,
  };
}

// ---- The computer player --------------------------------------------------------------------------
// Monte Carlo tree search over quick playouts (goboard.ts has the search itself). What is decided
// here is how much of it a player gets, and when to stop playing.
//
// How much: a think is rationed in playouts, and the ration is so many for each millisecond the
// table grants (`PLAYOUTS_PER_MS`, a little under what a modest server manages), scaled down for a
// weaker player. So a table that gives two seconds gets a search eighty times the size of one that
// gives twenty-five milliseconds, and on any machine quick enough the ration, not the clock, is
// what ends it: the same dice then give the same move everywhere. The clock is the hard stop all
// the same. Three quarters of the budget and the search ends wherever it has got to, and the move
// tried most so far is played; with almost no time at all (the table's "answer at once") that is
// simply the move that looks best at a glance. Asked with no budget (a test, a replay) the ration
// is `UNTIMED_MS` worth and the clock is never read.
//
// When to stop: it passes when every stone and point on the board is clearly somebody's, both in
// its playouts and in the count the game would propose (so the borders are closed, and nothing is
// left for either side to take); when the other player has passed and that count is a win; when it
// has no move that isn't filling its own eye; and (so that two of them always finish) when the game
// has gone on absurdly long. It doesn't give up a lost game: a person who wants out resigns.

/** Playouts a millisecond for a full-strength player, by board size. */
const PLAYOUTS_PER_MS: Record<number, number> = { 9: 8, 13: 3.2, 19: 1.2 };
/** The time a think is rationed for when nobody says how long it may take. */
const UNTIMED_MS = 15;
/** The share of a budget a think uses: the rest is for getting the move back to the table. */
const BUDGET_SHARE = 0.75;

/** How hard a computer player looks: the most games it plays out, and when it has to stop. */
export interface GoEffort {
  playouts: number;
  /** A `performance.now()` time; left out when only the count stops the search. */
  deadline?: number;
}

/** A player at full skill gets the whole ration; one at no skill about an eightieth of it. */
export function goEffort(n: number, skill: number, budget?: ThinkBudget): GoEffort {
  const ms = budget ? Math.max(0, budget.ms) * BUDGET_SHARE : UNTIMED_MS;
  const playouts = Math.max(1, Math.round((PLAYOUTS_PER_MS[n] ?? 1) * ms * Math.pow(80, Math.min(1, Math.max(0, skill)) - 1)));
  return budget ? { playouts, deadline: performance.now() + ms } : { playouts };
}

/** How sure a point's owner has to be, over the playouts, for it to count as settled. */
const SETTLED = 0.7;
/** Playouts needed before the picture they give of the board is believed. */
const ENOUGH = 16;
/** The most points that can be unsettled for the game still to be over: the liberties shared in a seki or two. */
const SHARED = 8;

/**
 * The computer player's move in a game being played: a crossing, or a pass. `effort` says how hard
 * to look (tests and measurements give their own); the dice come from `rand`.
 */
export function goBotMove(s: GoState, seat: number, effort: GoEffort, rand: () => number = Math.random, sloppy = false): GoMove {
  const n = s.rules.size;
  // No game of Go is this long: two computer players that somehow got here stop.
  if (s.moves >= n * n * 3) return { type: "pass" };
  const colour = colourOf(s, seat);
  const b = boardOf(s, true);
  const legal = legalGoMoves(s, seat);
  const seed = Math.floor(rand() * 4294967296);
  if (sloppy) {
    // A careless move: somewhere that doesn't look silly, without reading anything.
    const fair = legal.filter((cell) => !b.isEye(b.g.at[cell]!, colour) && goPrior(b, b.g.at[cell]!, colour) >= 0.45);
    if (fair.length) return { type: "place", cell: fair[Math.floor(rand() * fair.length)]! };
  }
  const komi = komiOf(s.rules);
  const thought = searchGo(b, colour, legal, { ...effort, komi, seed, passed: s.passes === 1, canPass: s.passes === 1 });
  if (thought.cell === null) return { type: "pass" };
  if (thought.playouts >= ENOUGH) {
    const cells = cellsOf(s.board);
    let unsure = 0;
    for (let cell = 0; cell < cells.length; cell++) if (Math.abs(thought.owners[cell]!) < SETTLED) unsure++;
    // What the count would be if play stopped here: the marking the game itself would propose
    // (after this pass, and the other player's if they haven't yet).
    const stopped = () => scoreGo(s, proposedDead(s, s.passes === 1 ? colourOf(s, other(seat)) : colour));
    // They have passed: if the count as it would stand is a win, so does it.
    if (s.passes === 1) {
      const { totals } = stopped();
      if (totals[seat]! > totals[other(seat)]!) return { type: "pass" };
    }
    // Nothing left to do: every stone and every point is clearly somebody's, in its playouts and in
    // that count. A point the count gives to nobody is still to be played for, unless a stone there
    // would only be thrown away (the liberties two groups share in a seki), which is nobody's for good.
    if (unsure <= SHARED) {
      const { count } = stopped();
      let todo = false;
      for (let cell = 0; cell < cells.length && !todo; cell++) {
        if (cells[cell] === EMPTY && count.owner[cell] === EMPTY) todo = b.legal(b.g.at[cell]!, colour) && b.selfAtari(b.g.at[cell]!, colour) === 0;
        else todo = Math.abs(thought.owners[cell]!) < SETTLED;
      }
      if (!todo) return { type: "pass" };
    }
  }
  return { type: "place", cell: thought.cell };
}

function bot(s: GoState, seat: number, style: PlayStyle, rand: () => number = Math.random, budget?: ThinkBudget): GoMove | null {
  if (seat !== 0 && seat !== 1) return null;
  if (s.phase === "scored") return s.ready[seat] ? null : { type: "next" };
  if (s.phase === "counting") {
    if (s.agreed[seat]) return null;
    // Its own estimate is the game's: the same playouts from the same position. It agrees to any
    // marking that costs it nothing against that, and otherwise plays on, once. A second time it
    // lets the marking stand: a person who is sure (and may be right: it can't read a seki) isn't
    // held at the board for ever.
    const own = scoreGo(s, proposedDead(s, colourOf(s, s.turn))).totals;
    const marked = scoreGo(s, s.dead).totals;
    const worse = marked[seat]! - marked[other(seat)]! < own[seat]! - own[other(seat)]!;
    return worse && s.resumes < 1 ? { type: "resume" } : { type: "agree" };
  }
  if (s.phase !== "playing" || s.turn !== seat) return null;
  const skill = style.skill ?? 1;
  // Being careless is about where a stone goes, never about whether the game is over.
  return goBotMove(s, seat, goEffort(s.rules.size, skill, budget), rand, s.passes === 0 && careless(style, rand));
}

/**
 * How the game stands for a seat, in points, by a quick estimate that depends on the position
 * alone: for a computer player asked for a draw. Close games are "level".
 */
function standing(s: GoState, seat: number): number | null {
  if (s.phase !== "playing") return null;
  const n = s.rules.size;
  const b = boardOf({ ...s, ko: null, last: null }, true);
  const owners = estimateOwners(b, colourOf(s, s.turn), Math.round(estimateGames(n) / 2), b.lo ^ 0x51ed27);
  let margin = -komiOf(s.rules);
  for (let cell = 0; cell < owners.length; cell++) margin += owners[cell]!;
  const mine = colourOf(s, seat) === BLACK ? margin : -margin;
  return Math.abs(mine) < 3 ? 0 : Math.round(mine);
}

// ---- The game -------------------------------------------------------------------------------------

function normalize(rules: unknown): GoRules {
  const given = (rules && typeof rules === "object" ? rules : {}) as Partial<GoRules>;
  const base = PRESETS.find((p) => p.id === given.id) ?? smallGo;
  const r = { ...base, ...given };
  const handicap = Math.floor(Number(r.handicap));
  return {
    id: String(r.id),
    name: String(r.name),
    size: SIZES.includes(Number(r.size)) ? Number(r.size) : 9,
    scoring: r.scoring === "territory" ? "territory" : "area",
    komi: KOMI.includes(Number(r.komi)) ? Number(r.komi) : 7.5,
    handicap: handicap >= 1 && handicap <= 9 ? handicap : 0,
    black: r.black === "seat1" || r.black === "seat2" ? r.black : "random",
    ko: r.ko === "simple" ? "simple" : "superko",
    suicide: r.suicide === true,
    games: [1, 3, 5, 7].includes(Number(r.games)) ? Number(r.games) : 1,
  };
}

const rules: BoardGame<GoRules, GoState, GoMove> = {
  id: "go",
  name: "Go",
  emoji: "⚪",
  blurb: "Surround more of the board than they do (Weiqi, Baduk)",
  tagline: "Go, also called Weiqi and Baduk: black and white stones on the crossings of a grid. Surround empty points to own them, and take away the last breathing space of their stones to capture them.",
  seats: { min: 2, max: 2, default: 2 },
  teams: false,
  presets: PRESETS,
  fields: [
    { key: "size", label: "Board size", hint: "9×9 is a quick game and the place to learn. The computer plays a fair game there, and a weak one on the bigger boards.", kind: "choice", options: [[9, "9×9 (small)"], [13, "13×13"], [19, "19×19 (full)"]] },
    { key: "scoring", label: "Counting", hint: "Chinese counts your stones and the points you surround. Japanese counts the points you surround and the stones you captured.", kind: "choice", options: [["area", "Chinese (area)"], ["territory", "Japanese (territory)"]] },
    { key: "komi", label: "Komi: points White gets for moving second", hint: "A half point means no drawn games. With a handicap White gets just the half point.", kind: "choice", options: KOMI.map((k) => [k, k === 0 ? "None" : String(k)]) },
    { key: "handicap", label: "Handicap stones for Black", hint: "Black starts with stones on the star points, and White moves first.", kind: "choice", options: [[0, "None"], [1, "Just no komi"], ...[2, 3, 4, 5, 6, 7, 8, 9].map((k): [number, string] => [k, `${k} stones`])] },
    { key: "black", label: "Who plays Black", hint: "Black moves first, and by custom is the less experienced player.", kind: "choice", options: [["random", "Luck of the draw"], ["seat1", "The first seat"], ["seat2", "The second seat"]] },
    { key: "ko", label: "Repeating a position", hint: "Superko: the board may never look the way it has before. Simple ko only stops a stone being taken straight back.", kind: "choice", options: [["superko", "Never (superko)"], ["simple", "Not straight away (simple ko)"]] },
    { key: "suicide", label: "Allow suicide", hint: "A stone played where it has no liberties takes its own group off the board. Most rules don't allow it.", kind: "toggle" },
    { key: "games", label: "Games in a match", kind: "choice", options: [[1, "Just one"], [3, "Three"], [5, "Five"], [7, "Seven"]] },
  ],
  normalize,
  validate: () => [],
  describe(r) {
    const komi = komiOf(r);
    return [
      `Black and White take turns putting a stone on any empty crossing of a ${r.size}×${r.size} board. ${r.handicap >= 2 ? `Black starts with ${r.handicap} stones on the star points, and White moves first.` : "Black moves first."} ${r.black === "random" ? "Who plays Black is the luck of the draw." : `The ${r.black === "seat1" ? "first" : "second"} seat plays Black.`}`,
      "Stones of one colour that touch along the lines are a group. A group with no empty crossing beside it is captured and comes off the board.",
      `${r.suicide ? "A stone played where it has no liberties takes its own group off." : "You can't play a stone where it would have no liberties, unless it captures."} ${r.ko === "superko" ? "You can't make the board look the way it has before in this game (ko)." : "You can't take a ko straight back: play somewhere else first."}`,
      "You may pass. When both players pass, play stops and you agree which stones left on the board are dead: tap a group to mark it, and the count stands when you both agree. Either of you can play on instead.",
      r.scoring === "area"
        ? `Chinese counting: your stones on the board plus the empty points only you surround.${komi ? ` White gets ${fmt(komi)} more.` : ""}`
        : `Japanese counting: the empty points only you surround, plus the stones you captured and their dead stones.${komi ? ` White gets ${fmt(komi)} more.` : ""}`,
      r.size === 9 ? "The computer plays a sensible game on this board: a beginner will find it a real opponent at Hard, and should beat it at Easy." : "The computer is weak on a board this size: it knows the basics, but an experienced player will beat it easily. It plays its best on 9×9.",
      ...(r.games > 1 ? [`A match is ${r.games} games; most wins takes it.${r.handicap ? "" : " Players take turns with Black."}`] : []),
    ];
  },
  newGame: newGo,
  apply,
  view,
  bot,
  // A search: off the table's main thread (see TableGame.heavy). Agreeing a count takes no thought.
  heavy: (s, seat) => s.phase === "playing" && s.turn === seat,
  thinkingTime: (s) => (s.phase === "playing" ? thinkFor(6, s.moves < 2 ? 0.7 : 1) : 900),
  summary(s) {
    const over = s.phase === "finished";
    return {
      game: "go",
      rules: s.rules.name,
      phase: s.phase,
      over,
      hand: s.round,
      // A match is told in games won; one game in its count, once it has been counted.
      scoreLine: s.rules.games === 1 && s.score ? `${fmt(s.score[0]!)} to ${fmt(s.score[1]!)}` : `${s.wins[0]} to ${s.wins[1]}${s.draws ? ` · ${s.draws} drawn` : ""}`,
      order: over ? order(s) : null,
      winners: over ? winners(s) : null,
      teams: false,
      seats: s.seats,
    };
  },
};

/**
 * Go, with resigning (the usual way a game of Go ends), taking a move back, and draw offers (see
 * offers.ts). A draw by agreement is not really a thing in Go, but the kit's house rule offers
 * draws and take-backs together or not at all, and a family table wants the take-back: a table
 * that wants neither sets Offers to "Neither". Only the last turn and the reply to it can be had
 * back (`history: 2`): every position kept is another copy of the game's list of hashes.
 */
export const go = withOffers<GoRules, GoState, GoMove>(rules, {
  takeBack: true,
  history: 2,
  settle: settleMatch,
  standing,
});
