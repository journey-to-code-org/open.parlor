// The board kit: what one seat sees of any game played on a grid, in one shared shape, the way
// KitView is for cards. One table screen (BoardTable in the web app) draws every board game from it,
// and the same room on the server runs them.
//
// It is shaped for more than the first game. A view is one or more grids (most games have one; a
// hidden-board game like Combat has yours and theirs), each a row-major list of cells that hold
// at most one piece. What you can do on a grid is said in one of two ways:
//
//   tap:    cells you can tap to move there and then (Tic-Tac-Toe, Gomoku, Reversi, Go, a shot in a
//           hidden-board game; a whole column in a drop game).
//   select: pick something up, then say where it goes (checkers, chess: a piece and its
//           destinations; placing a ship or dropping a captured piece: a reserve piece and the
//           cells it can go to).
//
// The engine lists exactly what is legal, so the table never has to know a game's rules, and the
// server still refuses anything else.
import type { BaseRules, BoardGameId, Choices, GameOver, RoundResult, Scores, TableGame } from "./table.js";

/** The colours a piece or a cell mark can take; the table decides what each looks like. */
export type BoardTone = "light" | "dark" | "red" | "blue" | "gold" | "green";

/** A piece on a cell or in a reserve. */
export interface BoardPiece {
  /** Whose it is (a seat), or null for something that is nobody's: a blocked cell, a hit, a miss. */
  owner: number | null;
  /** What it is, in the game's own words: "x", "man", "king", "pawn", "stone", "ship", "hit". */
  kind: string;
  /** What is drawn: "✕", "◯", "♛", "●". */
  glyph: string;
  /** What a screen reader says: "X", "white queen", "red king". */
  label: string;
  /** Its colour, when it isn't simply its owner's (seat 0 is the first tone, seat 1 the second…). */
  tone?: BoardTone;
  /**
   * The same piece keeps the same id from move to move, so the table can slide it to where it went.
   * Games where pieces never move (Tic-Tac-Toe) don't need one.
   */
  id?: string;
  /** Drawn faintly: a piece just taken, a ship that has sunk. */
  faded?: boolean;
  /**
   * A piece that covers several cells (a ship) is one of these per cell, all with the same `span`:
   * the table joins them into one shape, and picking up any cell of it picks up the whole piece.
   */
  span?: string;
}

/** How a cell is shaded, when it isn't plain: the two colours of a chessboard, water, a marked spot. */
export type CellShade = "plain" | "light" | "dark" | "water" | "spot";

/** Why a cell is highlighted. Several can apply to one cell. */
export type CellMark =
  /** Where the last move landed. */
  | "last"
  /** Where the last move came from. */
  | "from"
  /** Part of the winning line. */
  | "win"
  /** In danger: a king in check, a ship just hit. */
  | "threat"
  /** A piece that changed sides on the last move: a disc turned over in Reversi. */
  | "flipped"
  /** A place you could move to, in a game that points them out. Only ever sent to the seat that can. */
  | "hint"
  /** Has to move: a piece that must capture in checkers. */
  | "must"
  /** Can't be played on just now, though it is empty: the ko point in Go. */
  | "barred"
  /** Counted as a side's own at the end: territory in Go. The mark says whose (`owner`). */
  | "claimed";

export interface BoardGrid {
  /** Names this grid in a move when a view has more than one: "board", "mine", "theirs". */
  id: string;
  /** For screen readers, and shown above the grid when there are two: "Board", "Your fleet". */
  label: string;
  /** A private grid: whose it is. Left out for the board everyone shares. */
  owner?: number;
  rows: number;
  cols: number;
  /** Row by row from the top left, rows × cols of them; null is an empty cell. */
  cells: (BoardPiece | null)[];
  /** Cell colours: "checker" for a chessboard, or a shade for every cell. Plain when left out. */
  shade?: "checker" | CellShade[];
  /** Pieces sit where the lines cross instead of in the squares (Go, Gomoku). */
  points?: boolean;
  /** The board stands on its edge, and a piece put in a column falls to where it lands (a drop game's rack). */
  gravity?: boolean;
  /** Names for the columns and rows ("a"–"h", "8"–"1"), drawn round the edge and read out. */
  coords?: { cols: string[]; rows: string[] };
  /** What each cell is called, when a row and a column don't say it well ("centre", "top left"). */
  names?: string[];
  /**
   * The grid is made of equal blocks with heavier lines between them (Ultimate Tic-Tac-Toe's nine
   * small boards). `states` has one entry per block, row by row.
   */
  blocks?: {
    rows: number;
    cols: number;
    states: {
      /** Who has taken this block, drawn over it; null for nobody (a drawn block is `closed`). */
      owner?: number | null;
      glyph?: string;
      label?: string;
      /** Where the next move has to go. */
      active?: boolean;
      /** Finished: nothing more can be played here. */
      closed?: boolean;
    }[];
  };
  /** `owner` is the seat a "claimed" cell belongs to. */
  marks?: { cell: number; mark: CellMark; owner?: number }[];
  /**
   * Draw the board turned half way round, so the last row is at the top and this seat's own pieces
   * are nearest them (the second player in checkers or chess). Only the drawing turns: cells keep
   * their numbers and their names.
   */
  flip?: boolean;
  /**
   * Cells you can tap now. Tapping one sends { type, cell } (plus `grid` when the view has more
   * than one). With `by: "col"` the whole column is the target and the move is { type, col }
   * (a drop game: any cell of the column drops a piece into it).
   */
  tap?: { type: string; cells: number[]; by?: "cell" | "col" } | null;
  /**
   * Things you can pick up now, and where each can go: `from` is a cell of this grid, or the
   * `kind` of a piece in your reserve. Choosing one and then a destination sends { type, from, to }.
   * `held` is a source that is already in hand (a checkers piece in the middle of a run of jumps):
   * the table shows it picked up without being asked. `suggest` is a source the table picks up
   * for you while you hold nothing else (the next ship to place), so one tap puts it down.
   */
  select?: {
    type: string;
    sources: { from: number | string; to: number[] }[];
    held?: number | string;
    suggest?: number | string;
    /**
     * Moves that need one more thing said (what a pawn becomes on the far row): putting `from` down
     * on `to` asks which of `options`, in a small chooser on that cell, the first being the usual
     * one, and sends { type, from, to, [key]: the chosen piece's kind }.
     */
    choose?: { from: number | string; to: number; key: string; options: BoardPiece[] }[];
    /** Don't point out where a picked-up piece can go: the table lets it be put down anywhere and the engine says no. */
    quiet?: boolean;
  } | null;
}

/** Pieces off the board, per side: captured pieces, stones or discs left, ships still to place. */
export interface BoardReserve {
  owner: number;
  /** "Captured", "Left to place". */
  label: string;
  pieces: { piece: BoardPiece; count: number }[];
}

export interface BoardSeat {
  /** A short line under the name: "2 wins", "12 discs". */
  line: string;
  /** What this seat plays as, shown beside the name (an X, a black stone). */
  piece?: BoardPiece;
  /** Partners: 0 or 1 (seats 0 and 2 are team 0). */
  team?: 0 | 1;
  /** Out of the game, or sitting this round out. */
  out?: boolean;
  /** A small badge: "Check", "Goes first". */
  badge?: string;
  /**
   * This seat's clock, in a game that has one of its own (a chess clock): the time it had left
   * when the last move was made, and whether it is the one running down now. The table counts
   * the running one down from the time of that move.
   */
  clock?: { ms: number; running: boolean };
}

/** One piece going from a cell to another in a recorded move. Null for off the board: taken (`to`), or put on (`from`). */
export interface BoardChange {
  /** The piece's `id`. */
  id: string;
  from: number | null;
  to: number | null;
  /** The piece as it was before the move, when it left the board or changed (a pawn that was promoted). */
  was?: BoardPiece;
}

/** A move in the game's record, in the game's own notation, with enough to put the board back as it was before it. */
export interface BoardRecordMove {
  /** "Nf3", "exd5", "O-O". */
  label: string;
  by: number;
  /** The number it is written under: "1." for both White's first move and Black's. */
  turn: number;
  /** What moved, in the order it happened; the piece that made the move is last. */
  changes: BoardChange[];
  /** A cell left in danger by it: the king it checks. */
  threat?: number;
}

/**
 * The game so far, move by move, for a game that keeps a record (Chess): the table lists it, and
 * steps back and forward through it on the first grid by undoing `changes`.
 */
export interface BoardRecord {
  moves: BoardRecordMove[];
  /** The whole record as text to copy: a PGN. Seats are named {0}, {1} as everywhere. */
  export?: { label: string; text: string };
}

/** What a player can do besides move: give the game up, or ask the other player for something. */
export type OfferKind = "resign" | "draw" | "takeback";

/**
 * Offers at a two-player board (see offers.ts): what is open, and what this seat may do about it.
 * It is data, the same for every game, and the table says it in its own words. The moves are
 * always the same four, and `offerMoves` lists the ones a view allows.
 */
export interface BoardOffers {
  /** What this seat may send now: { type: "resign" }, or { type: "offer", offer: "draw" | "takeback" }. */
  can: OfferKind[];
  /** The offer waiting for an answer, and who made it. Everyone at the table sees this. */
  open: { kind: "draw" | "takeback"; by: number } | null;
  /** It is this seat's to answer, with { type: "accept" } or { type: "decline" }. */
  answer: boolean;
  /**
   * The last thing that happened with an offer, until play has moved on past it. "lapsed" is an
   * offer that was played through instead of answered.
   */
  last: { kind: OfferKind; by: number; outcome: "offered" | "accepted" | "declined" | "lapsed" } | null;
}

export interface BoardView {
  game: BoardGameId;
  seats: number;
  me: number;
  teams: boolean;
  phase: string;
  /** Whose move it is, or null when everyone may move (both placing their ships, say). */
  turn: number | null;
  /** The boards, the main one first. A second is drawn smaller beside or under it. */
  grids: BoardGrid[];
  reserves: BoardReserve[];
  /** Buttons: "Pass", "Offer a draw", a promotion, "Next game". */
  choices: Choices | null;
  players: BoardSeat[];
  /** Small facts for the table: "Four in a row wins", "Game 2 of 3". */
  info: string[];
  /** What just happened, in words. */
  narration: string | null;
  scores: Scores;
  /** After a round of a longer match, until everyone moves on. */
  result: RoundResult | null;
  /** `winners` is every seat when it's a draw. */
  over: GameOver | null;
  /** Resigning, draw offers and taking moves back, in a game that has them. */
  offers?: BoardOffers;
  /** The moves so far in notation, in a game that keeps a record. */
  record?: BoardRecord;
}

/** A board game: an engine whose seats see a `BoardView`. */
export interface BoardGame<R extends BaseRules = BaseRules, S = unknown, M = Record<string, unknown>> extends TableGame<R, S, M, BoardView> {
  id: BoardGameId;
}

// ---- Helpers for engines ------------------------------------------------------------------------

export const cellAt = (cols: number, row: number, col: number) => row * cols + col;
export const rowOf = (cols: number, cell: number) => Math.floor(cell / cols);
export const colOf = (cols: number, cell: number) => cell % cols;

/** The eight directions as [row, col] steps; the first four are enough to find lines through a cell. */
export const DIRECTIONS: readonly (readonly [number, number])[] = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];

/** "a", "b", … for columns and "1", "2", … for rows counted from the bottom, as on a chessboard. */
export function chessCoords(rows: number, cols: number): { cols: string[]; rows: string[] } {
  return { cols: Array.from({ length: cols }, (_, c) => String.fromCharCode(97 + c)), rows: Array.from({ length: rows }, (_, r) => String(rows - r)) };
}

/** What a cell is called: its own name if the grid gives one, "b2" with coordinates, else "row 2, column 2". */
export function cellName(grid: Pick<BoardGrid, "cols" | "coords" | "names">, cell: number): string {
  if (grid.names?.[cell]) return grid.names[cell]!;
  const r = rowOf(grid.cols, cell);
  const c = colOf(grid.cols, cell);
  return grid.coords ? `${grid.coords.cols[c] ?? c + 1}${grid.coords.rows[r] ?? r + 1}` : `row ${r + 1}, column ${c + 1}`;
}

/**
 * The longest unbroken line through `cell` of cells that `same` accepts, when it is at least
 * `need` long: the cells of the line, or null. For every N-in-a-row game.
 */
export function lineThrough(rows: number, cols: number, cell: number, need: number, same: (cell: number) => boolean): number[] | null {
  const r0 = rowOf(cols, cell);
  const c0 = colOf(cols, cell);
  let best: number[] | null = null;
  for (const [dr, dc] of DIRECTIONS.slice(0, 4)) {
    const line = [cell];
    for (const sign of [1, -1]) {
      for (let r = r0 + dr! * sign, c = c0 + dc! * sign; r >= 0 && r < rows && c >= 0 && c < cols && same(cellAt(cols, r, c)); r += dr! * sign, c += dc! * sign) {
        if (sign === 1) line.push(cellAt(cols, r, c));
        else line.unshift(cellAt(cols, r, c));
      }
    }
    if (line.length >= need && (!best || line.length > best.length)) best = line;
  }
  return best;
}

/**
 * A grid's cells as they stood after the first `count` moves of the record, worked back from how
 * they stand now by undoing the moves since. Pieces keep their ids, so a table can slide them back.
 */
export function cellsAfter(cells: readonly (BoardPiece | null)[], record: BoardRecord, count: number): (BoardPiece | null)[] {
  const out = cells.slice();
  for (let i = record.moves.length - 1; i >= Math.max(0, count); i--) {
    const changes = record.moves[i]!.changes;
    // Everything that moved is lifted before anything is put back: in a castling move one piece
    // may have landed where the other stood.
    const lifted = new Map<string, BoardPiece>();
    for (const c of changes) {
      if (c.to === null || out[c.to]?.id !== c.id) continue;
      lifted.set(c.id, out[c.to]!);
      out[c.to] = null;
    }
    for (const c of changes) {
      const piece = c.was ?? lifted.get(c.id);
      if (c.from !== null && piece) out[c.from] = piece;
    }
  }
  return out;
}

/**
 * Everything a seat can send from a view, as moves: every tappable cell, every piece and each
 * place it can go, every button. The table sends exactly these, and the shared tests check an
 * engine accepts each one it offers.
 */
export function movesOffered(view: BoardView): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const many = view.grids.length > 1;
  for (const g of view.grids) {
    const grid = many ? { grid: g.id } : {};
    if (g.tap) {
      if (g.tap.by === "col") for (const col of new Set(g.tap.cells.map((c) => colOf(g.cols, c)))) out.push({ type: g.tap.type, col, ...grid });
      else for (const cell of g.tap.cells) out.push({ type: g.tap.type, cell, ...grid });
    }
    for (const s of g.select?.sources ?? []) {
      for (const to of s.to) {
        // A move that asks a question first is one move for each answer.
        const ask = g.select!.choose?.find((c) => c.from === s.from && c.to === to);
        if (ask) for (const option of ask.options) out.push({ type: g.select!.type, from: s.from, to, [ask.key]: option.kind, ...grid });
        else out.push({ type: g.select!.type, from: s.from, to, ...grid });
      }
    }
  }
  for (const o of view.choices?.options ?? []) out.push(o.move);
  return out;
}
