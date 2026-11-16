// A board game's board in three dimensions. This file is small: it is what the board table
// imports. The three.js half (board3d-gl.ts) is only fetched, by `loadBoard3d`, once a board that
// has a set of solid pieces is on screen, and only where WebGL works. Anywhere else the board is
// the flat grid of buttons it has always been.
//
// The buttons are still there in 3-D, and still what is tapped, dragged, walked with the arrow keys
// and read out: they are made see-through and laid over the picture with a CSS transform that
// tips them back exactly as the scene's camera sees the board (`TILT`, `PERSPECTIVE` and the rest,
// below, are that one camera written down for both). So nothing about how the game is played
// changes; only what it looks like.

/** The camera, in terms of the board's own width on the page: how far back the eye is. */
export const PERSPECTIVE = 2.4;
/** How far the board is tipped back from flat on the screen, in degrees. */
export const TILT = 38;
/** The board is drawn a little smaller than its box, so its near edge (which comes towards you) still fits. */
export const SCALE = 0.84;
/** And a little up or down its box, as a share of its width, to sit in the middle of the room it has. */
export const SHIFT = -0.02;
/** The canvas is bigger than the board's box, for the frame and for pieces that stand up past the far edge. */
export const CANVAS = { wide: 1.16, high: 1.3 };

/** The transform that lays the grid of buttons over the picture; `--board-s` is the board's width. */
export const BOARD_TRANSFORM = `perspective(calc(var(--board-s) * ${PERSPECTIVE})) translateY(calc(var(--board-s) * ${SHIFT})) rotateX(${TILT}deg) scale(${SCALE})`;

/** The games that have a board and pieces in the scene: the chess set, Combat's fleets on their sea, and the plainer boards. */
const SETS = new Set(["chess", "combat", "checkers", "reversi", "go", "tictactoe", "dropfour"]);
export const hasBoard3d = (game: string) => SETS.has(game);

export interface Piece3d {
  /** Where it is on the screen: a cell counted from the top left as the board is drawn. */
  at: number;
  /** The same piece keeps its id from move to move, so it can be slid to where it went. */
  id: string;
  kind: string;
  light: boolean;
  /** It is one of the pieces of whoever sits at the near side: it faces up the board. */
  near: boolean;
  /** A piece that covers several squares (a ship) is one of these per square, all with the same `span`. */
  span?: string;
  /** What it is called ("Submarine"), where two pieces of a kind differ only in that. */
  name?: string;
  /** Its colour by name, where it has one that isn't simply light or dark ("red", "gold"). */
  tone?: string;
}

export interface BoardFrame3d {
  game: string;
  cols: number;
  rows: number;
  /** Pieces stand where the lines cross, not in the squares between them (Go). */
  points: boolean;
  /** The board stands on its edge: a piece put in drops down its column (Drop Four). */
  gravity: boolean;
  /** How each square is shaded, where the game says ("light", "dark", "spot"), by place on the screen. */
  shades: string[] | null;
  pieces: Piece3d[];
  /** Squares marked out: the move just made ("from", "last"), a king in check ("threat"), a winning line ("win"), territory ("claimed", with whose). */
  marks: { at: number; mark: string; tone?: string }[];
  /** A piece shown where it would go, before it is put down. */
  ghost: { at: number; kind: string; tone: string } | null;
  /** Where the piece in hand can go. */
  targets: number[];
  /** The square of the piece in hand. */
  picked: number | null;
  /** The letters and numbers round the edge, as they read across and down the screen. */
  coords: { cols: string[]; rows: string[] } | null;
  /** The canvas's size on the page in CSS pixels, the board's width, and the screen's pixels to one of them. */
  width: number;
  height: number;
  board: number;
  dpr: number;
  /** ms. */
  time: number;
  /** The person has asked for less motion: pieces are put where they go. */
  still: boolean;
}

export interface Board3d {
  /** Draw the frame. "busy" while something is still moving (ask again next frame); null when it can't be drawn here. */
  render(frame: BoardFrame3d): "busy" | "idle" | null;
  /** A piece being dragged: the square it came from, and where the pointer is on the canvas (0 to 1 across and down). Null puts it down. */
  drag(from: number | null, u?: number, v?: number): void;
  dispose(): void;
}

/** Each look is a file of its own, fetched the first time a game that has it is played. */
const loading = new Map<string, Promise<{ build(canvas: HTMLCanvasElement): Board3d | null } | null>>();

/** The 3-D board on `canvas`, or null where it can't be (no WebGL, or no document at all). */
export function loadBoard3d(canvas: HTMLCanvasElement, game: string): Promise<Board3d | null> {
  if (!hasBoard3d(game)) return Promise.resolve(null);
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  if (/[?&]flat\b/.test(location.search)) return Promise.resolve(null);
  const look = game === "combat" ? "sea" : "set";
  if (!loading.has(look)) loading.set(look, (look === "sea" ? import("./sea3d-gl") : import("./board3d-gl")).catch(() => null));
  return loading.get(look)!.then((m) => m?.build(canvas) ?? null).catch(() => null);
}
