// Chess, with all of its rules: check, mate and stalemate; castling on either side; taking en
// passant; promotion to whatever the player chooses; and the draws (the same position three times
// or fifty moves without a capture or a pawn move, for either player to claim; five times or
// seventy-five moves, by themselves; too little left on the board to mate with; and by agreement).
// Chess960 is a preset: one of the 960 starting rows, with castling that ends where it always does.
//
// A game is recorded as it is played, in standard algebraic notation, and can be taken away as a
// PGN. A position can be read from and written as FEN.
//
// The clock is a real chess clock: each side has a bank of time that runs down on its own turn,
// with an optional increment added after each move. The table keeps the time (`TableGame.deadline`
// says when the side to move runs out, and `apply` is told how long each move took), so the engine
// stays a pure function of its moves and their times, and a game replays, clocks and all.
//
// The board is kept one way up, as a diagram is printed: a8 is cell 0 and h1 cell 63, whoever is
// looking. The seat playing Black is shown it turned round. Moves are generated, and the computer
// player thinks, in chesscore.ts.
import type { PlayStyle } from "@spades/rules";
import { settleMatch, withOffers } from "./offers.js";
import { cellName, chessCoords, type BoardChange, type BoardGame, type BoardGrid, type BoardPiece, type BoardRecord, type BoardView } from "./board.js";
import { BISHOP, BLACK, FLAG_CASTLE_K, FLAG_CASTLE_Q, FLAG_DOUBLE, FLAG_EP, KING, KNIGHT, MATE, PAWN, Position, QUEEN, ROOK, WHITE, cellOf, evaluate, moveFlag, moveFrom, movePromo, moveTo, perft, positionKey, think, type ChessSetup, type SearchResult } from "./chesscore.js";
import { careless, GameError, markReady, nextHandChoices, nextRandom, thinkFor, who, type BaseRules, type GameDeadline, type MoveTime, type ThinkBudget } from "./table.js";

export interface ChessRules extends BaseRules {
  /** The starting row: the classic one, or one of Chess960's drawn by lot (the same for both sides). */
  variant: "classic" | "960";
  /** Who plays White in the first game. */
  white: "random" | "seat1" | "seat2";
  /** The clock: minutes each side has for all its moves. 0 for no clock. */
  minutes: number;
  /** With a clock: seconds added to a side's time after each move it makes. */
  increment: number;
  /** Correspondence: days allowed for each move, instead of a clock. 0 for none. */
  days: number;
  /** Show where a picked-up piece can go. */
  hints: boolean;
  /** Games in a match: most wins takes it. Colours change every game. */
  games: number;
}

const base = { variant: "classic", white: "random", minutes: 0, increment: 0, days: 0, hints: true, games: 1 } as const;
export const classicChess: ChessRules = { id: "chess-classic", name: "Classic", ...base };
export const chess960: ChessRules = { id: "chess-960", name: "Chess960", ...base, variant: "960" };
export const bulletChess: ChessRules = { id: "chess-bullet", name: "Bullet 1+0", ...base, minutes: 1 };
export const blitzChess: ChessRules = { id: "chess-blitz", name: "Blitz 3+2", ...base, minutes: 3, increment: 2 };
export const blitz5Chess: ChessRules = { id: "chess-blitz5", name: "Blitz 5+0", ...base, minutes: 5 };
export const rapidChess: ChessRules = { id: "chess-rapid", name: "Rapid 10+0", ...base, minutes: 10 };
export const rapid15Chess: ChessRules = { id: "chess-rapid15", name: "Rapid 15+10", ...base, minutes: 15, increment: 10 };
export const correspondenceChess: ChessRules = { id: "chess-correspondence", name: "Correspondence (a day a move)", ...base, days: 1 };
const PRESETS = [classicChess, chess960, bulletChess, blitzChess, blitz5Chess, rapidChess, rapid15Chess, correspondenceChess];
const GAMES = [1, 2, 3, 4, 6];
const DAYS = [0, 1, 2, 3, 7];
const DAY_MS = 86_400_000;

type Letter = "p" | "n" | "b" | "r" | "q" | "k";
const LETTERS: Letter[] = ["p", "n", "b", "r", "q", "k"];
const CODE: Record<Letter, number> = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
/** By the move generator's number for a kind (1 is a pawn). */
const LETTER_OF: Letter[] = ["p", "p", "n", "b", "r", "q", "k"];
const KIND: Record<Letter, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const GLYPH: Record<Letter, [string, string]> = { p: ["♙", "♟"], n: ["♘", "♞"], b: ["♗", "♝"], r: ["♖", "♜"], q: ["♕", "♛"], k: ["♔", "♚"] };
const POINTS: Record<Letter, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const COLOUR = ["white", "black"] as const;

/** A piece on the board: its colour (0 White, 1 Black), what it is, and a number it keeps all game. */
export interface ChessPiece {
  c: number;
  k: Letter;
  id: number;
}

/** One piece's part in a recorded move: −1 is off the board. `was` is the piece before it was taken or promoted. */
interface ChessChange {
  id: number;
  from: number;
  to: number;
  was?: { c: number; k: Letter };
}

/** A move in the record. */
export interface ChessPly {
  san: string;
  by: number;
  /** Where the piece that moved (the king, in castling) went from and to. */
  from: number;
  to: number;
  changes: ChessChange[];
  /** The cell of the king it left in check. */
  check?: number;
}

export interface ChessState {
  game: "chess";
  rules: ChessRules;
  seats: number;
  rng: number;
  /** Which game of the match, from 1. */
  round: number;
  /** The seat playing White in this game. */
  white: number;
  /** The starting row's number, 0 to 959 (518 is the classic one). */
  setup: number;
  /** The position this game began from, as FEN. */
  start: string;
  /** a8 first, row by row, to h1. */
  cells: (ChessPiece | null)[];
  turn: number;
  /** The cell each castling rook stands on, or −1 once the right has gone: White's king side, queen side, Black's king side, queen side. */
  castling: number[];
  /** The cell a pawn that has just moved two squares passed over, or −1. */
  ep: number;
  /** Moves by either side since a capture or a pawn move. */
  half: number;
  /** The number of the move being played, from 1. */
  full: number;
  /** How often each position has come up since the last capture or pawn move. */
  seen: Record<string, number>;
  record: ChessPly[];
  /** What each seat has captured, a letter a piece. */
  taken: string[];
  /** Ms left on each seat's clock; null when there is no clock. */
  bank: number[] | null;
  /** The clocks are running: they start once White's first move has been made. */
  ticking: boolean;
  /** Who won the game just played; null for a draw (or while playing). */
  roundWinner: number | null;
  wins: number[];
  draws: number;
  phase: "playing" | "scored" | "finished";
  ready: boolean[];
  narration: string | null;
}

export type ChessMove =
  | { type: "move"; from: number; to: number; as?: string }
  /** Claim a draw the rules allow: the same position three times, or fifty moves. */
  | { type: "claim" }
  /** The clock ran out (made by the table: see `deadline`). */
  | { type: "timeout" }
  | { type: "next" };

const other = (seat: number) => 1 - seat;

/**
 * A state to change, leaving the one given as it was. Pieces and recorded moves are never changed
 * once made (a promoted pawn is a new piece with the old one's number, and the record only grows),
 * so the copy shares them: a long game is many moves to copy otherwise, on every move tried.
 */
function copy(state: ChessState): ChessState {
  return { ...state, cells: state.cells.slice(), castling: state.castling.slice(), seen: { ...state.seen }, taken: state.taken.slice(), bank: state.bank ? state.bank.slice() : null, wins: state.wins.slice(), ready: state.ready.slice() };
}
const seatOf = (s: Pick<ChessState, "white">, colour: number) => (colour === WHITE ? s.white : other(s.white));
const colourOf = (s: Pick<ChessState, "white">, seat: number) => (seat === s.white ? WHITE : BLACK);
const GRID = { cols: 8, coords: chessCoords(8, 8) };
const at = (cell: number) => cellName(GRID, cell);

// ---- Starting rows, and FEN ---------------------------------------------------------------------

/**
 * Chess960's starting row number `n` (0 to 959), a8 to h8, by the usual numbering: the bishops go
 * on opposite colours, then the queen, then the knights, and the king goes between the rooks.
 * 518 is the classic row.
 */
export function chess960Row(n: number): Letter[] {
  const row: (Letter | null)[] = Array<Letter | null>(8).fill(null);
  const free = () => row.flatMap((p, file) => (p ? [] : [file]));
  row[(n % 4) * 2 + 1] = "b";
  n = Math.floor(n / 4);
  row[(n % 4) * 2] = "b";
  n = Math.floor(n / 4);
  row[free()[n % 6]!] = "q";
  n = Math.floor(n / 6);
  const [a, b] = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]][n % 10]!;
  const left = free();
  row[left[a!]!] = "n";
  row[left[b!]!] = "n";
  (["r", "k", "r"] as const).forEach((p, i) => (row[free()[0]!] = p));
  return row as Letter[];
}

interface Parsed {
  cells: ({ c: number; k: Letter } | null)[];
  side: number;
  castling: number[];
  ep: number;
  half: number;
  full: number;
}

/** Read a FEN. Castling may be written KQkq, or with the rooks' files (HAha) as Chess960 needs. Throws a GameError for one that isn't a position. */
export function parseFen(fen: string): Parsed {
  const bad = () => new GameError("That isn't a chess position (FEN).");
  const [place, side = "w", castle = "-", ep = "-", half = "0", full = "1"] = String(fen).trim().split(/\s+/);
  const rows = (place ?? "").split("/");
  if (rows.length !== 8) throw bad();
  const cells: Parsed["cells"] = [];
  for (const row of rows) {
    const before = cells.length;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push(null);
      else if (/[pnbrqk]/i.test(ch)) cells.push({ c: ch === ch.toLowerCase() ? BLACK : WHITE, k: ch.toLowerCase() as Letter });
      else throw bad();
    }
    if (cells.length - before !== 8) throw bad();
  }
  for (const c of [WHITE, BLACK]) if (cells.filter((p) => p?.k === "k" && p.c === c).length !== 1) throw bad();
  if (side !== "w" && side !== "b") throw bad();
  const castling = [-1, -1, -1, -1];
  for (const ch of castle === "-" ? "" : castle) {
    const c = ch === ch.toLowerCase() ? BLACK : WHITE;
    const row = c === WHITE ? 56 : 0;
    const king = cells.findIndex((p, cell) => cell >= row && cell < row + 8 && p?.k === "k" && p.c === c);
    if (king < 0) continue;
    const rookAt = (cell: number) => cells[cell]?.k === "r" && cells[cell]!.c === c;
    const low = ch.toLowerCase();
    let rook = -1;
    // K and Q mean the outermost rook on that side of the king; a file letter means that rook.
    if (low === "k") for (let cell = row + 7; cell > king && rook < 0; cell--) if (rookAt(cell)) rook = cell;
    if (low === "q") for (let cell = row; cell < king && rook < 0; cell++) if (rookAt(cell)) rook = cell;
    if (low >= "a" && low <= "h" && low !== "k" && low !== "q" && rookAt(row + low.charCodeAt(0) - 97)) rook = row + low.charCodeAt(0) - 97;
    if (rook >= 0) castling[c * 2 + (rook > king ? 0 : 1)] = rook;
  }
  let epCell = -1;
  if (ep !== "-") {
    if (!/^[a-h][36]$/.test(ep)) throw bad();
    epCell = (8 - Number(ep[1])) * 8 + ep.charCodeAt(0) - 97;
  }
  const n = (text: string, least: number) => (Number.isInteger(Number(text)) && Number(text) >= least ? Number(text) : least);
  return { cells, side: side === "w" ? WHITE : BLACK, castling, ep: epCell, half: n(half, 0), full: n(full, 1) };
}

const fenLetter = (p: { c: number; k: Letter }) => (p.c === WHITE ? p.k.toUpperCase() : p.k);

function placement(cells: readonly ({ c: number; k: Letter } | null)[]): string {
  let out = "";
  for (let row = 0; row < 8; row++) {
    let gap = 0;
    for (let col = 0; col < 8; col++) {
      const p = cells[row * 8 + col];
      if (!p) gap++;
      else {
        out += (gap ? String(gap) : "") + fenLetter(p);
        gap = 0;
      }
    }
    out += (gap ? String(gap) : "") + (row < 7 ? "/" : "");
  }
  return out;
}

/** Castling rights for a FEN: KQkq from the classic squares, the rooks' files otherwise. */
function castlingText(cells: readonly ({ c: number; k: Letter } | null)[], castling: readonly number[]): string {
  const classic = castling.every((rook, i) => rook < 0 || (rook === [63, 56, 7, 0][i] && cells[i < 2 ? 60 : 4]?.k === "k"));
  const text = castling.map((rook, i) => (rook < 0 ? "" : classic ? "KQkq"[i]! : i < 2 ? "ABCDEFGH"[rook % 8]! : "abcdefgh"[rook % 8]!)).join("");
  return text || "-";
}

/** The position on the board as FEN. */
export function chessFen(s: Pick<ChessState, "cells" | "turn" | "white" | "castling" | "ep" | "half" | "full">): string {
  return `${placement(s.cells)} ${colourOf(s, s.turn) === WHITE ? "w" : "b"} ${castlingText(s.cells, s.castling)} ${s.ep < 0 ? "-" : at(s.ep)} ${s.half} ${s.full}`;
}

/** The position for the move generator. */
function setupOf(s: Pick<ChessState, "cells" | "turn" | "white" | "castling" | "ep" | "half" | "full">): ChessSetup {
  return { board: s.cells.map((p) => (p ? CODE[p.k] | (p.c << 3) : 0)), side: colourOf(s, s.turn), rooks: s.castling, ep: s.ep, half: s.half, full: s.full };
}

/**
 * What makes two positions the same for the repetition rule: the same pieces on the same squares,
 * the same side to move, the same castling rights, and the same en passant capture really there
 * to be made.
 */
function keyOf(s: ChessState, replies: readonly number[]): string {
  const ep = s.ep >= 0 && replies.some((m) => moveFlag(m) === FLAG_EP) ? at(s.ep) : "-";
  return `${placement(s.cells)} ${colourOf(s, s.turn) === WHITE ? "w" : "b"} ${castlingText(s.cells, s.castling)} ${ep}`;
}

function begin(s: ChessState, parsed: Parsed) {
  let id = 0;
  s.cells = parsed.cells.map((p) => (p ? { ...p, id: id++ } : null));
  s.turn = seatOf(s, parsed.side);
  s.castling = parsed.castling;
  s.ep = parsed.ep;
  s.half = parsed.half;
  s.full = parsed.full;
  s.start = chessFen(s);
  s.record = [];
  s.taken = ["", ""];
  s.seen = { [keyOf(s, new Position(setupOf(s)).legal())]: 1 };
  s.bank = s.rules.minutes > 0 ? [s.rules.minutes * 60_000, s.rules.minutes * 60_000] : null;
  s.ticking = false;
  s.roundWinner = null;
  s.phase = "playing";
  s.ready = Array<boolean>(s.seats).fill(false);
  s.narration = null;
}

function startRound(s: ChessState) {
  // A new starting row for each pair of games, so each player has it once with each colour.
  if (s.rules.variant !== "960") s.setup = 518;
  else if (s.round % 2 === 1) s.setup = Math.floor(nextRandom(s)() * 960);
  const row = chess960Row(s.setup);
  const rank = (c: number) => row.map((k) => ({ c, k }));
  const pawns = (c: number) => Array.from({ length: 8 }, () => ({ c, k: "p" as Letter }));
  const empty = Array<null>(32).fill(null);
  const rooks = row.flatMap((k, file) => (k === "r" ? [file] : []));
  begin(s, { cells: [...rank(BLACK), ...pawns(BLACK), ...empty, ...pawns(WHITE), ...rank(WHITE)], side: WHITE, castling: [56 + rooks[1]!, 56 + rooks[0]!, rooks[1]!, rooks[0]!], ep: -1, half: 0, full: 1 });
}

export function newChess(rules: ChessRules, _seats: number, seed: number): ChessState {
  const s = { game: "chess", rules, seats: 2, rng: seed >>> 0, round: 1, wins: [0, 0], draws: 0, setup: 518 } as ChessState;
  s.white = rules.white === "seat1" ? 0 : rules.white === "seat2" ? 1 : nextRandom(s)() < 0.5 ? 0 : 1;
  startRound(s);
  return s;
}

/** A game that starts from a position given as FEN, with `white` playing White: for study, and for tests. */
export function chessFromFen(fen: string, rules: ChessRules = classicChess, white = 0): ChessState {
  const parsed = parseFen(fen);
  const s = { game: "chess", rules, seats: 2, rng: 1, round: 1, wins: [0, 0], draws: 0, setup: 518, white: white === 1 ? 1 : 0 } as ChessState;
  begin(s, parsed);
  return s;
}

// ---- Moves, and how they are written ------------------------------------------------------------

/** Where a move is put down on the board: in Chess960 castling is the king onto its own rook, since the king's own square may be where it ends up, or a square it could simply step to. */
function target(s: Pick<ChessState, "rules" | "castling">, colour: number, m: number): number {
  const flag = moveFlag(m);
  if (s.rules.variant === "960" && (flag === FLAG_CASTLE_K || flag === FLAG_CASTLE_Q)) return s.castling[colour * 2 + flag - FLAG_CASTLE_K]!;
  return cellOf(moveTo(m));
}

/** A move in standard algebraic notation, without the mark for check: "Nbd7", "exd5", "e8=Q", "O-O". */
function sanOf(pos: Position, moves: readonly number[], m: number): string {
  const flag = moveFlag(m);
  if (flag === FLAG_CASTLE_K) return "O-O";
  if (flag === FLAG_CASTLE_Q) return "O-O-O";
  const from = moveFrom(m);
  const to = moveTo(m);
  const kind = pos.b[from]! & 7;
  const takes = !!pos.b[to] || flag === FLAG_EP;
  const square = (sq: number) => "abcdefgh"[sq & 7]! + ((sq >> 4) + 1);
  if (kind === PAWN) return `${takes ? `${"abcdefgh"[from & 7]}x` : ""}${square(to)}${movePromo(m) ? `=${LETTER_OF[movePromo(m)]!.toUpperCase()}` : ""}`;
  // When another piece of the same kind could go there too, say which: by file if that settles it,
  // else by rank, else both.
  const rivals = moves.filter((o) => o !== m && moveTo(o) === to && (pos.b[moveFrom(o)]! & 7) === kind && moveFlag(o) !== FLAG_CASTLE_K && moveFlag(o) !== FLAG_CASTLE_Q).map(moveFrom);
  let which = "";
  if (rivals.length) {
    if (!rivals.some((sq) => (sq & 7) === (from & 7))) which = "abcdefgh"[from & 7]!;
    else if (!rivals.some((sq) => sq >> 4 === from >> 4)) which = String((from >> 4) + 1);
    else which = square(from);
  }
  return `${LETTER_OF[kind]!.toUpperCase()}${which}${takes ? "x" : ""}${square(to)}`;
}

/** How a match stands once this game is in: finished when the games run out or one side can't be caught. */
function matchOver(s: ChessState): boolean {
  const left = s.rules.games - s.round;
  return left <= 0 || Math.abs(s.wins[0]! - s.wins[1]!) > left;
}

function endRound(s: ChessState, winner: number | null, why: string) {
  const many = s.rules.games > 1;
  if (winner === null) s.draws += 1;
  else s.wins[winner]! += 1;
  s.roundWinner = winner;
  s.ticking = false;
  s.narration = winner === null ? `${why}: ${many ? `game ${s.round} is a draw` : "it's a draw"}` : `${why}: ${who(winner)} wins${many ? ` game ${s.round}` : ""}!`;
  s.phase = matchOver(s) ? "finished" : "scored";
}

/** A draw either player may claim now, and why; null when there is none. */
function claimable(s: ChessState, replies: readonly number[]): string | null {
  if (s.phase !== "playing") return null;
  if ((s.seen[keyOf(s, replies)] ?? 0) >= 3) return "The same position three times";
  if (s.half >= 100) return "Fifty moves with no capture and no pawn moved";
  return null;
}

/**
 * Whether `colour` could ever give mate with what it has, for when the other side's clock runs
 * out: with no way to mate, running out of time is only a draw. A lone king can't; a king and one
 * knight, or a king and bishops all on one colour of square, can only with the loser's own pieces
 * in the way of their king, so it goes by what the loser has left (as the big chess sites do; the
 * laws of chess ask whether any series of legal moves at all ends in mate, which this follows in
 * every case that comes up in practice).
 */
function couldMate(s: ChessState, colour: number): boolean {
  const mine: { k: Letter; dark: boolean }[] = [];
  const theirs: { k: Letter; dark: boolean }[] = [];
  s.cells.forEach((p, cell) => {
    if (p && p.k !== "k") (p.c === colour ? mine : theirs).push({ k: p.k, dark: ((cell >> 3) + (cell & 7)) % 2 === 1 });
  });
  if (mine.some((p) => p.k === "p" || p.k === "r" || p.k === "q")) return true;
  if (!mine.length) return false;
  const knights = mine.filter((p) => p.k === "n").length;
  const bishops = mine.filter((p) => p.k === "b");
  if (knights && bishops.length) return true;
  if (knights >= 2) return true;
  if (knights === 1) return theirs.some((p) => p.k !== "q");
  // Bishops only.
  if (bishops.some((p) => p.dark) && bishops.some((p) => !p.dark)) return true;
  return theirs.some((p) => p.k === "n" || p.k === "p" || (p.k === "b" && p.dark !== bishops[0]!.dark));
}

const describeMove = (piece: Letter, from: number, to: number, taken: Letter | null, promo: Letter | null) =>
  `${KIND[piece]} ${at(from)} ${taken ? `takes the ${KIND[taken]} on` : "to"} ${at(to)}${promo ? `, and becomes a ${KIND[promo]}` : ""}`;

/** Make a legal move on the board, write it in the record, and see whether the game is over. Changes `s` and `pos`. */
function carryOut(s: ChessState, pos: Position, moves: readonly number[], m: number, seat: number) {
  const colour = colourOf(s, seat);
  const from = cellOf(moveFrom(m));
  const to = cellOf(moveTo(m));
  const flag = moveFlag(m);
  const promo = movePromo(m);
  const piece = s.cells[from]!;
  const changes: ChessChange[] = [];
  let san = sanOf(pos, moves, m);
  let said: string;
  if (flag === FLAG_CASTLE_K || flag === FLAG_CASTLE_Q) {
    const rf = s.castling[colour * 2 + flag - FLAG_CASTLE_K]!;
    const rt = (to & ~7) + (flag === FLAG_CASTLE_K ? 5 : 3);
    const rook = s.cells[rf]!;
    // Both off, then both on: in Chess960 either may land where the other stood.
    s.cells[from] = null;
    s.cells[rf] = null;
    s.cells[to] = piece;
    s.cells[rt] = rook;
    changes.push({ id: rook.id, from: rf, to: rt }, { id: piece.id, from, to });
    said = `castles ${flag === FLAG_CASTLE_K ? "king" : "queen"} side`;
  } else {
    const where = flag === FLAG_EP ? to + (colour === WHITE ? 8 : -8) : to;
    const captured = s.cells[where] ?? null;
    if (captured) {
      s.cells[where] = null;
      s.taken[seat] += captured.k;
      changes.push({ id: captured.id, from: where, to: -1, was: { c: captured.c, k: captured.k } });
    }
    s.cells[from] = null;
    const becomes = promo ? LETTER_OF[promo]! : null;
    s.cells[to] = becomes ? { ...piece, k: becomes } : piece;
    changes.push({ id: piece.id, from, to, ...(becomes ? { was: { c: piece.c, k: piece.k } } : {}) });
    said = describeMove(piece.k, from, to, captured?.k ?? null, becomes) + (flag === FLAG_EP ? " in passing" : "");
  }
  pos.make(m);
  const rights = pos.castle;
  s.castling = s.castling.map((rook, i) => (rights & (1 << i) ? rook : -1));
  // As a FEN has it: the square passed over by any double step, whether or not it can be taken.
  s.ep = flag === FLAG_DOUBLE ? (from + to) >> 1 : -1;
  s.half = pos.half;
  s.full = pos.full;
  s.turn = other(seat);

  const replies = pos.legal();
  const checked = pos.inCheck();
  san += checked ? (replies.length ? "+" : "#") : "";
  const kingCell = cellOf(pos.king[pos.side]!);
  s.record = [...s.record, { san, by: seat, from, to, changes, ...(checked ? { check: kingCell } : {}) }];
  // Nothing before a capture or a pawn move can come round again.
  if (s.half === 0) s.seen = {};
  const key = keyOf(s, replies);
  s.seen[key] = (s.seen[key] ?? 0) + 1;
  s.narration = `${who(seat)} plays ${san}: ${said}${checked && replies.length ? ", check" : ""}`;

  if (!replies.length) endRound(s, checked ? seat : null, checked ? `Checkmate (${san})` : `Stalemate: ${who(s.turn)} has no move and isn't in check`);
  else if (pos.dead()) endRound(s, null, "Neither side has enough left to give mate");
  else if (s.seen[key]! >= 5) endRound(s, null, "The same position five times");
  else if (s.half >= 150) endRound(s, null, "Seventy-five moves with no capture and no pawn moved");
}

function apply(state: ChessState, seat: number, move: ChessMove, time?: MoveTime): ChessState {
  if (move?.type === "next") {
    if (state.phase !== "scored") throw new GameError("There's a game going on.");
    const s = copy(state);
    if (markReady(s.ready, seat)) {
      // Colours change every game.
      s.round += 1;
      s.white = other(s.white);
      startRound(s);
    }
    return s;
  }
  if (move?.type !== "move" && move?.type !== "claim" && move?.type !== "timeout") throw new GameError("That's not a move in Chess.");
  if (state.phase !== "playing") throw new GameError("This game is over.");
  if (seat !== 0 && seat !== 1) throw new GameError("You're not playing at this table.");
  const elapsed = Math.max(0, Number(time?.elapsed) || 0);
  if (move.type === "claim") {
    const why = claimable(state, new Position(setupOf(state)).legal());
    if (!why) throw new GameError("There's no draw to claim: it takes the same position three times, or fifty moves with no capture and no pawn moved.");
    const s = copy(state);
    endRound(s, null, `${who(seat)} claims a draw. ${why}`);
    return s;
  }
  if (state.turn !== seat) throw new GameError("It's not your turn.");
  if (move.type === "timeout") {
    const due = deadline(state);
    if (!due) throw new GameError("There's no clock running.");
    // Only when the time really has gone. (A table that doesn't say how long a move took is taken at its word.)
    if (time && elapsed < due.after - 1000) throw new GameError("Your clock is still running.");
    const s = copy(state);
    if (s.bank) s.bank[seat] = 0;
    const winner = other(seat);
    if (couldMate(s, colourOf(s, winner))) endRound(s, winner, `${who(seat)} ran out of time`);
    else endRound(s, null, `${who(seat)} ran out of time, but ${who(winner)} has nothing to mate with`);
    return s;
  }
  const from = Number(move.from);
  const to = Number(move.to);
  const on = (cell: number) => Number.isInteger(cell) && cell >= 0 && cell < 64;
  if (!on(from) || !on(to)) throw new GameError("That's not on the board.");
  const colour = colourOf(state, seat);
  const pos = new Position(setupOf(state));
  const moves = pos.legal();
  const fits = moves.filter((m) => cellOf(moveFrom(m)) === from && target(state, colour, m) === to);
  if (!fits.length) {
    if (state.cells[from]?.c !== colour) throw new GameError("That's not your piece.");
    throw new GameError(pos.inCheck() ? "You're in check: that doesn't get you out of it." : "That piece can't go there.");
  }
  let m = fits[0]!;
  if (movePromo(m)) {
    const as = LETTERS.find((k) => KIND[k] === move.as);
    const chosen = as ? fits.find((o) => movePromo(o) === CODE[as]) : undefined;
    if (!chosen) throw new GameError("Choose what the pawn becomes: a queen, a rook, a bishop or a knight.");
    m = chosen;
  }
  const s = copy(state);
  // The clock: the time the move took comes off the mover's bank, and the increment goes on. White's
  // first move is free, and starts the clocks.
  if (s.bank) {
    if (s.ticking) s.bank[seat] = Math.max(0, s.bank[seat]! - elapsed);
    s.bank[seat]! += s.rules.increment * 1000;
  }
  s.ticking = true;
  carryOut(s, pos, moves, m, seat);
  return s;
}

/**
 * The game's clock: when the side to move runs out of time, the table makes its "timeout" move.
 * With a chess clock that is the time left in its bank; in correspondence play, so many days for
 * the move. Nothing runs until White's first move has been made.
 */
function deadline(s: ChessState): GameDeadline<ChessMove> | null {
  if (s.phase !== "playing" || !s.ticking) return null;
  if (s.bank) return { after: s.bank[s.turn]!, seat: s.turn, move: { type: "timeout" }, strict: true };
  if (s.rules.days > 0) return { after: s.rules.days * DAY_MS, seat: s.turn, move: { type: "timeout" }, strict: true };
  return null;
}

/**
 * The move a line of notation means in this position, as the table would send it: "Nf3", "exd5",
 * "O-O", "e8=Q+" (or the squares alone: "g1f3", "e7e8q"). Null if it is no legal move.
 */
export function chessMove(s: ChessState, text: string): ChessMove | null {
  if (s.phase !== "playing") return null;
  const pos = new Position(setupOf(s));
  const moves = pos.legal();
  const colour = colourOf(s, s.turn);
  const plain = (san: string) => san.replace(/0/g, "O").replace(/[+#!?]/g, "");
  const wanted = plain(String(text).trim());
  const square = (sq: number) => "abcdefgh"[sq & 7]! + ((sq >> 4) + 1);
  const m = moves.find((o) => plain(sanOf(pos, moves, o)) === wanted) ?? moves.find((o) => `${square(moveFrom(o))}${square(moveTo(o))}${movePromo(o) ? LETTER_OF[movePromo(o)] : ""}` === String(text).trim().toLowerCase());
  if (m === undefined) return null;
  return { type: "move", from: cellOf(moveFrom(m)), to: target(s, colour, m), ...(movePromo(m) ? { as: KIND[LETTER_OF[movePromo(m)]!] } : {}) };
}

/** How many positions are exactly `depth` moves from this one: the standard check of a move generator. */
export const chessPerft = (s: ChessState, depth: number): number => perft(new Position(setupOf(s)), depth);

/** "1-0", "0-1", "1/2-1/2", or "*" while the game on the board is being played. */
function resultOf(s: ChessState): string {
  if (s.phase === "playing") return "*";
  return s.roundWinner === null ? "1/2-1/2" : s.roundWinner === s.white ? "1-0" : "0-1";
}

/**
 * The game on the board as a PGN. Players are named {0} and {1} as in every text from an engine,
 * unless `names` are given.
 */
export function chessPgn(s: ChessState, names?: string[]): string {
  const start = parseFen(s.start);
  const classic = s.rules.variant !== "960" && s.start === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const name = (seat: number) => names?.[seat] ?? who(seat);
  const control = s.rules.minutes > 0 ? `${s.rules.minutes * 60}${s.rules.increment ? `+${s.rules.increment}` : ""}` : s.rules.days > 0 ? `1/${s.rules.days * 86_400}` : "-";
  const tags: [string, string][] = [
    ["Event", "Card Room"],
    ["Site", "?"],
    ["Date", "????.??.??"],
    ["Round", String(s.round)],
    ["White", name(s.white)],
    ["Black", name(other(s.white))],
    ["Result", resultOf(s)],
    ...(s.rules.variant === "960" ? ([["Variant", "Chess960"]] as [string, string][]) : []),
    ...(classic ? [] : ([["SetUp", "1"], ["FEN", s.start]] as [string, string][])),
    ["TimeControl", control],
  ];
  const words: string[] = [];
  let n = start.full;
  let colour = start.side;
  s.record.forEach((ply, i) => {
    if (colour === WHITE) words.push(`${n}.`);
    else if (i === 0) words.push(`${n}...`);
    words.push(ply.san);
    if (colour === BLACK) n++;
    colour ^= 1;
  });
  words.push(resultOf(s));
  // Lines of movetext are kept under 80 characters.
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > 79) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return `${tags.map(([tag, value]) => `[${tag} "${value.replace(/["\\]/g, "")}"]`).join("\n")}\n\n${lines.join("\n")}\n`;
}

/** Best first. A drawn match lists the player who had Black in the last game first. */
function order(s: ChessState): number[] {
  const [a, b] = s.wins as [number, number];
  if (a !== b) return a > b ? [0, 1] : [1, 0];
  return [other(s.white), s.white];
}
const winners = (s: ChessState) => (s.wins[0] === s.wins[1] ? [0, 1] : [s.wins[0]! > s.wins[1]! ? 0 : 1]);

// ---- What a seat sees ---------------------------------------------------------------------------

function pieceOf(s: Pick<ChessState, "white">, p: { c: number; k: Letter }): BoardPiece {
  return { owner: seatOf(s, p.c), kind: KIND[p.k], glyph: GLYPH[p.k][p.c]!, label: `${COLOUR[p.c]} ${KIND[p.k]}`, tone: p.c === WHITE ? "light" : "dark" };
}

const clockName = (r: ChessRules) => (r.minutes > 0 ? `${r.minutes}+${r.increment}` : r.days > 0 ? (r.days === 1 ? "a day a move" : `${r.days} days a move`) : "");

function recordOf(s: ChessState): BoardRecord {
  const start = parseFen(s.start);
  let n = start.full;
  let colour = start.side;
  const moves = s.record.map((ply) => {
    const turn = n;
    if (colour === BLACK) n++;
    colour ^= 1;
    const changes: BoardChange[] = ply.changes.map((c) => ({ id: `c${c.id}`, from: c.from < 0 ? null : c.from, to: c.to < 0 ? null : c.to, ...(c.was ? { was: { ...pieceOf(s, c.was), id: `c${c.id}` } } : {}) }));
    return { label: ply.san, by: ply.by, turn, changes, ...(ply.check !== undefined ? { threat: ply.check } : {}) };
  });
  return { moves, export: { label: "PGN", text: chessPgn(s) } };
}

function view(s: ChessState, seat: number): BoardView {
  const over = s.phase === "finished";
  const playing = s.phase === "playing";
  const mine = playing && s.turn === seat;
  const many = s.rules.games > 1;
  const w = over ? winners(s) : [];
  const pos = new Position(setupOf(s));
  const moves = playing ? pos.legal() : [];
  const colour = colourOf(s, s.turn);
  const checked = playing && pos.inCheck();
  const marks: NonNullable<BoardGrid["marks"]> = [];
  const last = s.record.at(-1);
  if (last) marks.push({ cell: last.from, mark: "from" }, { cell: last.to, mark: "last" });
  const kingOf = (c: number) => s.cells.findIndex((p) => p?.k === "k" && p.c === c);
  if (checked) marks.push({ cell: kingOf(colour), mark: "threat" });
  // A game that ended in mate leaves the mated king marked.
  else if (!playing && last?.check !== undefined) marks.push({ cell: last.check, mark: "threat" });

  const sources = new Map<number, number[]>();
  const choose: NonNullable<NonNullable<BoardGrid["select"]>["choose"]> = [];
  if (mine) {
    for (const m of moves) {
      const from = cellOf(moveFrom(m));
      const to = target(s, colour, m);
      const tos = sources.get(from) ?? [];
      if (!tos.includes(to)) sources.set(from, [...tos, to]);
      // Queen first: it is nearly always what is wanted.
      if (movePromo(m) === QUEEN) choose.push({ from, to, key: "as", options: (["q", "r", "b", "n"] as Letter[]).map((k) => pieceOf(s, { c: colour, k })) });
    }
  }
  const grid: BoardGrid = {
    id: "board",
    label: "Board",
    rows: 8,
    ...GRID,
    shade: "checker",
    // White is at the bottom of `cells`; the seat playing Black sees the board turned round.
    flip: seat === seatOf(s, BLACK),
    cells: s.cells.map((p) => (p ? { ...pieceOf(s, p), id: `c${p.id}` } : null)),
    marks,
    select: mine ? { type: "move", sources: [...sources].map(([from, to]) => ({ from, to })), ...(choose.length ? { choose } : {}), ...(s.rules.hints ? {} : { quiet: true }) } : null,
  };

  const material = [0, 1].map((seatNo) => s.cells.reduce((sum, p) => sum + (p && seatOf(s, p.c) === seatNo ? POINTS[p.k] : 0), 0));
  const claim = playing ? claimable(s, moves) : null;
  const left = 100 - s.half;
  const scoreTitle = s.roundWinner === null ? `Game ${s.round} is a draw` : `${who(s.roundWinner)} wins game ${s.round}`;
  return {
    game: "chess",
    seats: s.seats,
    me: seat,
    teams: false,
    phase: s.phase,
    turn: playing ? s.turn : null,
    grids: [grid],
    // What each side has taken, biggest first, the way they are lined up beside a board.
    reserves: [0, 1].map((o) => ({
      owner: o,
      label: "Captured",
      pieces: (["q", "r", "b", "n", "p"] as Letter[]).map((k) => ({ piece: pieceOf(s, { c: colourOf(s, other(o)), k }), count: s.taken[o]!.split(k).length - 1 })),
    })),
    choices:
      s.phase === "scored"
        ? nextHandChoices(s.ready, seat, false, "Next game")
        : claim && (seat === 0 || seat === 1)
          ? { prompt: "", options: [{ label: "Claim a draw", move: { type: "claim" }, hint: claim }] }
          : null,
    players: [0, 1].map((i) => {
      const ahead = material[i]! - material[other(i)]!;
      const running = playing && s.ticking && s.turn === i;
      return {
        line: [COLOUR[colourOf(s, i)] === "white" ? "White" : "Black", ...(ahead > 0 ? [`+${ahead}`] : []), ...(many ? [`${s.wins[i]} win${s.wins[i] === 1 ? "" : "s"}`] : [])].join(" · "),
        piece: pieceOf(s, { c: colourOf(s, i), k: "k" }),
        badge: checked && s.turn === i ? "Check" : undefined,
        ...(s.bank ? { clock: { ms: s.bank[i]!, running } } : s.rules.days > 0 && running ? { clock: { ms: s.rules.days * DAY_MS, running } } : {}),
      };
    }),
    info: [
      ...(many ? [`Game ${s.round} of ${s.rules.games}`] : []),
      ...(s.rules.variant === "960" ? [`Chess960, starting row ${s.setup}`] : []),
      ...(clockName(s.rules) ? [`Clock: ${clockName(s.rules)}${playing && !s.ticking ? ", from White's first move" : ""}`] : []),
      ...(claim ? [`${claim}: either player can claim a draw`] : playing && left <= 20 ? [`A draw can be claimed in ${Math.ceil(left / 2)} more move${left <= 2 ? "" : "s"} each without a capture or a pawn move`] : []),
    ],
    narration: s.narration ?? (playing ? (mine ? "You're White: you move first" : `${who(s.turn)} is White, and moves first`) : null),
    scores: s.wins.map((value, i) => ({ seats: [i], value })),
    result:
      many && !playing
        ? { key: `game-${s.round}`, title: scoreTitle, sides: [[0], [1]], rows: [{ label: "Wins", values: s.wins.map(String), tone: "total" }, ...(s.draws ? [{ label: "Draws", values: [String(s.draws), String(s.draws)] }] : [])] }
        : null,
    over: over ? { winners: w, title: w.length > 1 ? (many ? "The match is drawn" : "It's a draw") : `${who(w[0]!)} wins${many ? ` ${s.wins[w[0]!]} to ${s.wins[other(w[0]!)]}` : ""}!` } : null,
    record: recordOf(s),
  };
}

// ---- Computer players ---------------------------------------------------------------------------
// The search is in chesscore.ts. Here is how much of it each player gets, and when they stop.
//
// Skill sets how far ahead a player looks and how much luck is in its choice: the lowest looks two
// moves ahead and happily plays any move within most of a pawn of the best, the middle looks four
// and is choosier, and the top looks as far as its work or its time allows. A careless player
// (see `careless`) doesn't look ahead at all for that move: it plays what looks best on the board
// as it stands, so it leaves pieces where they can be taken, the way people do. From the middle
// skill up even a careless move never walks into mate on the move.
//
// When a search stops goes by which game is being played:
//
//   - No chess clock. A think is rationed by work, the number of positions looked at, the way
//     Checkers rations its own, so the same position, seat, style and dice always give the same
//     move on any machine. The ration is sized from the budget the table grants (`WORK_PER_MS`
//     positions for each ms of it): a table that allows two seconds gets a search that takes an
//     ordinary machine a fifth of a second and a slow one most of the two. The budget is kept as
//     a time limit as well, so a machine slower still stops on time (and only there is the move
//     that machine's own).
//   - A chess clock. The player is on the clock like anyone, so it thinks by the time: a share of
//     what is left in its bank, plus most of the increment, never more than the table's budget.
//     At the top skill the time is the only limit, and it is used.
//
// Either way a search asked to stop stops within a fraction of a millisecond and plays the best
// move it has, and a search with no time to look at anything plays a capture if there is one.

/**
 * Positions looked at for each ms of the table's budget, when a think is rationed by work. A
 * tenth of what an ordinary server does in the time, so the ration is used up long before the
 * budget on anything but a very slow or very busy machine, and the move stays the same everywhere.
 */
const WORK_PER_MS = 50;
/** The budget assumed when a table gives none (a test, a script): a short think. */
const UNBUDGETED_MS = 12;
/** The most each skill may look at when its think is rationed: lowest, middle, top (no cap but the ration). */
const WORK_CAP = [6_000, 40_000, Infinity];
const DEPTH = [2, 4, 64];
/** How much luck is worth to each, in hundredths of a pawn; more in the first few moves, so no two games open alike. */
const LUCK = [70, 22, 8];
const OPENING_LUCK = 16;

const tierOf = (style: PlayStyle) => ((style.skill ?? 1) >= 0.9 ? 2 : (style.skill ?? 1) >= 0.5 ? 1 : 0);

/** How long a player with a clock gives a move, in ms: a share of the bank and most of the increment, leaving time to get the move to the table. */
function allowance(s: ChessState, seat: number): number {
  const bank = s.bank![seat]!;
  return Math.max(4, Math.min(bank / 4, bank / 30 + s.rules.increment * 700) - 15);
}

/** The keys of the positions the game has been through since the last capture or pawn move, for the search. */
function seenKeys(s: ChessState): { lo: number; hi: number }[] {
  const out: { lo: number; hi: number }[] = [];
  for (const key of Object.keys(s.seen)) {
    const parsed = parseFen(`${key} 0 1`);
    out.push(positionKey({ board: parsed.cells.map((p) => (p ? CODE[p.k] | (p.c << 3) : 0)), side: parsed.side, rooks: parsed.castling, ep: parsed.ep, half: 0, full: 1 }));
  }
  return out;
}

/** After `m`, can the other side give mate at once? */
function allowsMate(pos: Position, m: number): boolean {
  pos.make(m);
  let mate = false;
  for (const reply of pos.legal()) {
    pos.make(reply);
    if (pos.inCheck() && !pos.canMove()) mate = true;
    pos.unmake(reply);
    if (mate) break;
  }
  pos.unmake(m);
  return mate;
}

/** The move that looks best without looking ahead, give or take a pawn or so: what a careless player plays. */
function hasty(pos: Position, moves: readonly number[], rand: () => number, safe: boolean): number {
  const scored = moves
    .map((m) => {
      pos.make(m);
      const value = -evaluate(pos) + rand() * 120;
      pos.unmake(m);
      return { m, value };
    })
    .sort((a, b) => b.value - a.value);
  if (safe) for (const { m } of scored.slice(0, 6)) if (!allowsMate(pos, m)) return m;
  return scored[0]!.m;
}

/**
 * The computer player's choice in this position, with what the search made of it: for the bot
 * below, and for tests and measurements. Null when there is no move to make.
 */
export function chessThink(s: ChessState, style: PlayStyle = {}, rand: () => number = Math.random, budget?: ThinkBudget): (SearchResult & { hasty: boolean }) | null {
  const began = performance.now();
  if (s.phase !== "playing") return null;
  const pos = new Position(setupOf(s));
  const tier = tierOf(style);
  if (careless(style, rand)) {
    const moves = pos.legal();
    if (!moves.length) return null;
    return { move: moves.length === 1 ? moves[0]! : hasty(pos, moves, rand, tier > 0), score: 0, depth: 0, nodes: moves.length, timedOut: false, hasty: true };
  }
  // By the clock only at a table that keeps time: one that grants no budget (a test, a script) isn't timing anything.
  const clocked = !!s.bank && !!budget;
  const granted = budget?.ms ?? UNBUDGETED_MS;
  const ms = clocked ? Math.min(granted, allowance(s, s.turn)) : budget ? granted : Infinity;
  const nodes = clocked ? WORK_CAP[tier]! : Math.min(WORK_CAP[tier]!, Math.round(granted * WORK_PER_MS));
  const luck = LUCK[tier]! + (s.record.length < 10 ? OPENING_LUCK : 0);
  // Stop a little short of the time, so the answer is back inside it.
  const stopIn = ms === Infinity ? Infinity : Math.max(1, ms - (ms >= 400 ? 25 : ms >= 40 ? 4 : 2) - (performance.now() - began));
  const result = think(pos, { depth: DEPTH[tier]!, nodes, ms: stopIn, luck, rand, seen: seenKeys(s) });
  return result.move ? { ...result, hasty: false } : null;
}

function botMove(s: ChessState, seat: number, style: PlayStyle, rand: () => number = Math.random, budget?: ThinkBudget): ChessMove | null {
  if (s.phase === "scored") return s.ready[seat] ? null : { type: "next" };
  if (s.phase !== "playing" || s.turn !== seat) return null;
  // A draw there for the claiming is taken unless the game is going its way.
  if (claimable(s, new Position(setupOf(s)).legal()) && (standing(s, seat) ?? 0) <= 0) return { type: "claim" };
  const thought = chessThink(s, style, rand, budget);
  if (!thought) return null;
  const m = thought.move;
  return { type: "move", from: cellOf(moveFrom(m)), to: target(s, colourOf(s, seat), m), ...(movePromo(m) ? { as: KIND[LETTER_OF[movePromo(m)]!] } : {}) };
}

/** How the game stands for a seat, in pawns: nothing either way when it is close. */
function standing(s: ChessState, seat: number): number | null {
  if (s.phase !== "playing") return null;
  const pos = new Position(setupOf(s));
  const value = (evaluate(pos) - 8) * (s.turn === seat ? 1 : -1);
  return Math.abs(value) < 80 ? 0 : value / 100;
}

/** Get the search warm (a thread's first think is its slowest): a table's worker calls this before the first move is wanted. */
function warmUp() {
  const s = newChess(classicChess, 2, 1);
  for (let i = 0; i < 3; i++) chessThink(s, { skill: 1, sloppy: 0 }, () => 0.5, { ms: 30 });
}

// ---- The game -----------------------------------------------------------------------------------

function normalize(rules: unknown): ChessRules {
  const given = (rules && typeof rules === "object" ? rules : {}) as Partial<ChessRules>;
  const preset = PRESETS.find((p) => p.id === given.id) ?? classicChess;
  const r = { ...preset, ...given };
  const whole = (value: unknown, min: number, max: number, or: number) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.round(Number(value)))) : or);
  const minutes = whole(r.minutes, 0, 180, preset.minutes);
  return {
    id: String(r.id),
    name: String(r.name),
    variant: r.variant === "960" ? "960" : "classic",
    white: r.white === "seat1" || r.white === "seat2" ? r.white : "random",
    minutes,
    // An increment is something a clock has, and a game has one kind of time limit.
    increment: minutes > 0 ? whole(r.increment, 0, 60, preset.increment) : 0,
    days: minutes > 0 ? 0 : DAYS.includes(Number(r.days)) ? Number(r.days) : 0,
    hints: r.hints !== false,
    games: GAMES.includes(Number(r.games)) ? Number(r.games) : 1,
  };
}

const rules: BoardGame<ChessRules, ChessState, ChessMove> & { warmUp(): void } = {
  id: "chess",
  name: "Chess",
  emoji: "♟️",
  blurb: "Checkmate the king, against the clock if you like",
  tagline: "The whole game: castling, en passant, promotion and every kind of draw, with a chess clock, Chess960, and the moves written down as you play.",
  seats: { min: 2, max: 2, default: 2 },
  teams: false,
  presets: PRESETS,
  fields: [
    { key: "variant", label: "Starting position", kind: "choice", options: [["classic", "Classic"], ["960", "Chess960: a starting row drawn by lot"]] },
    { key: "white", label: "Who plays White", kind: "choice", options: [["random", "Luck of the draw"], ["seat1", "The first seat"], ["seat2", "The second seat"]] },
    { key: "minutes", label: "Clock: minutes each", hint: "Each side's time for the whole game. 0 for no clock", kind: "number", min: 0, max: 180 },
    { key: "increment", label: "Clock: seconds added a move", hint: "Added to your time after each move you make", kind: "number", min: 0, max: 60 },
    { key: "days", label: "Correspondence: time for each move", hint: "Instead of a clock, for a game played over days", kind: "choice", options: [[0, "No limit"], [1, "A day"], [2, "Two days"], [3, "Three days"], [7, "A week"]] },
    { key: "hints", label: "Show where a piece can go", hint: "Off for purists: a piece put down where it can't go is simply refused", kind: "toggle" },
    { key: "games", label: "Games in a match", kind: "choice", options: [[1, "Just one"], [2, "Two"], [3, "Three"], [4, "Four"], [6, "Six"]] },
  ],
  normalize,
  validate(r) {
    return [...(r.minutes > 0 && r.days > 0 ? ["Pick a clock or a time for each move, not both."] : []), ...(r.increment > 0 && !(r.minutes > 0) ? ["Seconds added a move need a clock to be added to."] : [])];
  },
  describe(r) {
    return [
      r.variant === "960"
        ? "Chess960: the pieces behind the pawns start in one of 960 rows, drawn by lot and the same for both sides. The bishops are on opposite colours and the king is between the rooks."
        : "Chess, from the classic starting position.",
      `White moves first${r.white === "random" ? "; who plays White is the luck of the draw" : `, and that's the ${r.white === "seat1" ? "first" : "second"} seat`}. Tap a piece and then where it goes, or drag it there.`,
      "You win by checkmate: the king is attacked and has no way out. You may never leave your own king in check.",
      r.variant === "960"
        ? "Castling: the king and a rook that haven't moved, nothing between or in the way of either, and the king not in check or crossing an attacked square. They finish where they would in classic chess (king on the g- or c-file, rook beside it). To castle, put your king on that rook."
        : "Castling: the king moves two squares towards a rook and the rook hops over it, if neither has moved, nothing is between them, and the king isn't in check or crossing an attacked square.",
      "A pawn that has just moved two squares can be taken as if it had moved one (en passant), on the next move only. A pawn that reaches the far row becomes a queen, rook, bishop or knight: you choose.",
      "It's a draw by stalemate (no legal move, and not in check) or when neither side has enough left to mate. Either player can claim a draw when the same position has come up three times, or after fifty moves each with no capture and no pawn moved; at five times, or seventy-five moves, the game is drawn anyway.",
      ...(r.minutes > 0
        ? [`Each side has ${r.minutes} minute${r.minutes === 1 ? "" : "s"} for all its moves${r.increment ? `, and gets ${r.increment} second${r.increment === 1 ? "" : "s"} back after each one` : ""}. The clocks start when White has moved. Run out of time and you lose, unless the other side has nothing left to mate with: then it's a draw. Computer players are on the clock too.`]
        : r.days > 0
          ? [`Correspondence: you have ${r.days === 1 ? "a day" : r.days === 7 ? "a week" : `${r.days} days`} for each move, from White's first. Run out and you lose (a draw if the other side has nothing left to mate with).`]
          : []),
      ...(r.hints ? [] : ["The squares a piece can go to aren't shown."]),
      ...(r.games > 1 ? [`A match is ${r.games} games; most wins takes it. Colours change every game.`] : []),
    ];
  },
  newGame: newChess,
  apply,
  view,
  bot: botMove,
  // A search: off the table's main thread (see TableGame.heavy).
  heavy: (s, seat) => s.phase === "playing" && s.turn === seat,
  // A player on the clock doesn't sit and look thoughtful with its time running.
  thinkingTime(s, seat) {
    const usual = thinkFor(6, s.record.length < 6 ? 0.6 : 1.1);
    return s.bank && s.phase === "playing" ? Math.round(Math.min(usual, allowance(s, seat) * 0.5)) : usual;
  },
  deadline,
  summary(s) {
    const over = s.phase === "finished";
    return {
      game: "chess",
      rules: s.rules.name,
      phase: s.phase,
      over,
      hand: s.round,
      scoreLine: `${s.wins[0]} to ${s.wins[1]}${s.draws ? ` · ${s.draws} drawn` : ""}`,
      order: over ? order(s) : null,
      winners: over ? winners(s) : null,
      teams: false,
      seats: s.seats,
    };
  },
  warmUp,
};

/**
 * Chess, with resigning and draw offers, and taking a move back in a friendly game with no clock
 * (see offers.ts): a move can't be had back once time has been spent on it.
 */
export const chess = withOffers<ChessRules, ChessState, ChessMove>(rules, {
  settle(s, result) {
    s.ticking = false;
    settleMatch(s, result);
  },
  takeBack: (s) => !s.bank && !(s.rules.days > 0),
  standing,
});

export { MATE as CHESS_MATE };
