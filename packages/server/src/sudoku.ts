// The daily sudoku. A puzzle is its date: the same date gives the same grid on every machine, so
// nothing is stored, and a puzzle can be asked for by date as far back as anyone likes. The server
// keeps the answer; the page is only ever given the clues (a 81-character string, 0 for a blank).
//
// A puzzle has exactly one solution. Cells are taken out of a finished grid one at a time, and a
// cell stays out only if the solver still finds a single way to fill the grid.

/** The day the puzzle changes is the parlor's own, not the visitor's or the server's. */
export const PUZZLE_ZONE = "America/New_York";
/** The first puzzle. Asking for an earlier date gives the first. */
export const FIRST_DAY = "2026-11-18";

export interface Puzzle {
  date: string;
  /** How hard it is meant to be: the weekday sets how many clues are left. */
  level: string;
  /** 81 digits, 0 where the cell is blank. */
  givens: string;
  /** 81 digits, the answer. Never sent to a browser. */
  solution: string;
}

/** What a filled grid came to. `wrong` and `empty` count blank cells only. */
export interface Verdict {
  state: "solved" | "open" | "wrong";
  wrong: number;
  empty: number;
}

// Numbers the host has promoted into the code: a pull request opened from the admin app commits this file.
import promoted from "./promoted/sudoku.json" with { type: "json" };

const LEVELS = [
  { level: "Easy", clues: 40 }, // Sunday
  { level: "Easy", clues: 38 }, // Monday
  { level: "Easy", clues: 36 },
  { level: "Medium", clues: 33 },
  { level: "Medium", clues: 31 },
  { level: "Hard", clues: 29 },
  { level: "Hard", clues: 27 }, // Saturday
].map((day, weekday) => {
  // The clues promoted into the code stand in for the table's, when they are seven whole numbers in range.
  const own = (promoted as { clues?: unknown }).clues;
  return Array.isArray(own) && own.length === 7 && own.every((n) => Number.isInteger(n) && n >= 22 && n <= 60) ? { ...day, clues: own[weekday] as number } : day;
});

// 0..80 -> the bit each of its houses (row, column, box) needs.
const ROW = (i: number) => Math.floor(i / 9);
const COL = (i: number) => i % 9;
const BOX = (i: number) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
/** The 20 cells that share a house with each cell. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: 81 }, (_, i) =>
  Array.from({ length: 81 }, (_, j) => j).filter((j) => j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))),
);

/** Small, fast and the same everywhere. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/**
 * Counts the ways to finish a grid, stopping at `limit`. Always takes the blank with the fewest
 * possibilities, which keeps even a 27-clue grid to a few thousand steps.
 */
export function countSolutions(grid: Uint8Array, limit = 2, random?: () => number): number {
  const cells = grid.slice();
  let found = 0;
  const walk = (): void => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (cells[i]) continue;
      let used = 0;
      for (const j of PEERS[i]!) used |= 1 << cells[j]!;
      const free = ~used & 0x3fe; // bits 1..9
      let count = 0;
      for (let m = free; m; m &= m - 1) count++;
      if (count < bestCount) {
        best = i;
        bestMask = free;
        bestCount = count;
        if (count <= 1) break;
      }
    }
    if (best < 0) {
      found++;
      if (random) grid.set(cells);
      return;
    }
    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (random) shuffle(digits, random);
    for (const d of digits) {
      cells[best] = d;
      walk();
      if (found >= limit) return;
    }
    cells[best] = 0;
  };
  walk();
  return found;
}

const text = (grid: Uint8Array) => Array.from(grid, (d) => String(d)).join("");

/** A date as `YYYY-MM-DD`, and a real one. */
export const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const made = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(made.getTime()) && made.toISOString().startsWith(value);
};

/** Today's date in the parlor's own time zone. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PUZZLE_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The date a day before or after. */
export function shift(date: string, days: number): string {
  const made = new Date(`${date}T12:00:00Z`);
  made.setUTCDate(made.getUTCDate() + days);
  return made.toISOString().slice(0, 10);
}

/** The date to use for what a visitor asked for: a real one, not before the first and not yet to come. */
export function clampDate(asked: unknown, now = new Date()): string {
  const latest = today(now);
  if (!isDate(asked)) return latest;
  return asked < FIRST_DAY ? FIRST_DAY : asked > latest ? latest : asked;
}

const made = new Map<string, Puzzle>();

/**
 * The clues the host has set for each weekday (Sunday first), if they apply to `date`. A change the host
 * saved takes effect from the next day, so the puzzle somebody has open today is never swapped under
 * them. Only the latest change is kept: changing it again changes what days after the first change
 * were, so a day somebody comes back to can be a different puzzle than it was.
 */
export function tunedClues(date: string, saved: { values: Record<string, unknown>; at: number } | undefined): readonly number[] | undefined {
  const clues = saved?.values.clues;
  if (!saved || !Array.isArray(clues) || clues.length !== 7 || !clues.every((n) => Number.isInteger(n) && n >= 22 && n <= 60)) return undefined;
  return date > today(new Date(saved.at)) ? (clues as number[]) : undefined;
}

/** The puzzle for a date. The same date (and the same clues) is always the same puzzle. */
export function puzzleFor(date: string, clueCounts?: readonly number[]): Puzzle {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const key = `${date}/${clueCounts?.[weekday] ?? ""}`;
  const known = made.get(key);
  if (known) return known;
  const random = mulberry32(seedOf(`open.parlor daily sudoku ${date}`));
  // A finished grid: the solver, set loose on an empty one with shuffled digits.
  const full = new Uint8Array(81);
  countSolutions(full, 1, random);
  const { level, clues: own } = LEVELS[weekday]!;
  const clues = clueCounts?.[weekday] ?? own;
  const grid = full.slice();
  let left = 81;
  for (const i of shuffle(Array.from({ length: 81 }, (_, n) => n), random)) {
    if (left <= clues) break;
    const keep = grid[i]!;
    grid[i] = 0;
    if (countSolutions(grid, 2) === 1) left--;
    else grid[i] = keep;
  }
  const puzzle = { date, level, givens: text(grid), solution: text(full) };
  if (made.size > 400) made.clear();
  made.set(key, puzzle);
  return puzzle;
}

/**
 * `entries` is what the player has: 81 characters, a digit where they put one and anything else
 * where they didn't. The clues are the puzzle's own; what is sent for them is ignored.
 */
export function grade(puzzle: Puzzle, entries: string): Verdict {
  let wrong = 0;
  let empty = 0;
  for (let i = 0; i < 81; i++) {
    if (puzzle.givens[i] !== "0") continue;
    const entry = entries[i] ?? "";
    if (!/^[1-9]$/.test(entry)) empty++;
    else if (entry !== puzzle.solution[i]) wrong++;
  }
  return { state: wrong ? "wrong" : empty ? "open" : "solved", wrong, empty };
}

/** The clues with whatever of `entries` is a digit in a blank cell, as the page is drawn. */
export function entriesOf(puzzle: Puzzle, raw: unknown): string {
  const given = typeof raw === "string" ? raw : "";
  return Array.from({ length: 81 }, (_, i) => (puzzle.givens[i] !== "0" ? "0" : /^[1-9]$/.test(given[i] ?? "") ? given[i] : "0")).join("");
}
