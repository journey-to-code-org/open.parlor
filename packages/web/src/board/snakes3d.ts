// Snakes & Ladders in three dimensions. This file is small: it is what SnakesBoard imports. The
// three.js half (snakes3d-gl.ts) is only fetched, by `loadSnakes3d`, when the board is to be drawn
// in 3-D and WebGL works; anywhere else SnakesBoard keeps drawing its painted SVG board.
//
// Unlike the other 3-D boards (board3d.ts), nothing is laid over the picture: the camera moves (it
// leans in on a counter as it travels), so the scene itself says which square was tapped.

/** A point on the board, in squares from its top left (the start row is the eleventh). */
export interface Pt3 {
  x: number;
  y: number;
}

export interface SnakesFrame3d {
  /** The board's look: the parlor's painted board, or the parts store. */
  store: boolean;
  seats: number;
  /** The hundred squares: the cell each is drawn in, its number and its colour. */
  tiles: { cell: number; square: number; tint: string }[];
  /** Ladders, snakes and the pair of portals, cell to cell; a snake's body follows `spine`. */
  links: { kind: string; from: number; to: number; spine: Pt3[] | null }[];
  specials: { cell: number; kind: string }[];
  /** The counters: `k` of `n` on a shared cell, and what each is (a pawn, a duck…). */
  tokens: { id: string; seat: number; cell: number; k: number; n: number; shape: string }[];
  /** Squares this seat can move to now, with what the button for each says. */
  targets: { cell: number; label: string; via: string | null }[];
  /** The cells of the way to the target being pointed at. */
  preview: number[] | null;
  /** The squares the last move hopped over. */
  steps: { seat: number; cells: number[] } | null;
  turn: number | null;
  me: number;
  winner: number | null;
  trail: { key: number; paths: { id: string; cells: number[]; by: string[] }[] } | null;
  /** Goes up with every throw: a move made on the throw waits for the dice to land. */
  roll: number;
  /** How much things travel (motionScale): 0 puts them straight down. */
  speed: number;
  /** A new game: the ladders and snakes drop on. */
  reveal: boolean;
}

export interface SnakesScene3d {
  update(frame: SnakesFrame3d): void;
  dispose(): void;
}

export interface SnakesCallbacks {
  /** A target square was tapped. */
  onTarget(cell: number): void;
  /** The pointer is over a target square (or none). */
  onHover(cell: number | null): void;
  /** A move is being walked, or has been. */
  onMoving(moving: boolean): void;
}

let loading: Promise<{ build(canvas: HTMLCanvasElement, on: SnakesCallbacks): SnakesScene3d | null } | null> | null = null;

/** The 3-D board on `canvas`, or null where it can't be (no WebGL, no document, or `?flat`). */
export function loadSnakes3d(canvas: HTMLCanvasElement, on: SnakesCallbacks): Promise<SnakesScene3d | null> {
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  if (/[?&]flat\b/.test(location.search)) return Promise.resolve(null);
  loading ??= import("./snakes3d-gl").catch(() => null);
  return loading.then((m) => m?.build(canvas, on) ?? null).catch(() => null);
}
