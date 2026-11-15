// The card room's own chess set: six plain, solid silhouettes drawn here as SVG, so a knight looks
// the same on every phone (the chess figures in fonts don't: some are thin outlines, some are
// colour emoji, and the two sides rarely match in weight). An engine only ever says a piece's
// `kind` ("knight") and whose it is; what that looks like is decided here.
//
// Every piece is drawn in a 100 × 100 box and stands on the same foot, so they line up along a row
// and weigh about the same. A piece is a few simple shapes joined into one outline, plus a line or
// two of detail (a bishop's cut, a knight's eye) in the other colour.
import { createContext, useContext } from "react";
import type { BoardGameId, BoardPiece } from "@cardroom/games";

interface Shape {
  /** Closed outlines, filled. */
  paths: string[];
  /** Filled discs: x, y, radius. */
  discs?: [number, number, number][];
  /** Open lines of detail, drawn over the piece in the outline's colour. */
  lines?: string[];
  /** Dots of detail. */
  dots?: [number, number, number][];
}

/** The foot every piece stands on, and the band above it that the taller pieces share. */
const FOOT = "M19 91v-6q0-5 5-5h52q5 0 5 5v6z";
const BAND = "M33 61h34q4 0 4 4t-4 4h-34q-4 0-4-4t4-4z";
const SKIRT = "M36 68c0 6-4 9-9 13h46c-5-4-9-7-9-13z";

const CHESS: Record<string, Shape> = {
  pawn: {
    paths: [FOOT, "M41 52c0 11-7 19-15 29h48c-8-10-15-18-15-29z", "M37 46h26q4 0 4 4t-4 4h-26q-4 0-4-4t4-4z"],
    discs: [[50, 31, 14]],
  },
  rook: {
    paths: [FOOT, "M26 15h11v8h8v-8h10v8h8v-8h11v20q0 4-4 4h-40q-4 0-4-4z", "M34 38h32l5 43h-42z"],
    lines: ["M31 46h38"],
  },
  knight: {
    paths: [FOOT, "M29 81c1-17 9-24 17-33c-6 2-11 6-17 6c-6 0-10-5-7-10l14-17c2-4 3-9 3-15c7 2 11 5 14 9c16 3 24 22 24 60z"],
    lines: ["M57 30c7 6 10 16 10 28"],
    dots: [[41, 34, 3.2]],
  },
  bishop: {
    paths: [FOOT, BAND, SKIRT, "M50 17c12 10 19 21 19 30c0 9-8 16-19 16s-19-7-19-16c0-9 7-20 19-30z"],
    discs: [[50, 13, 5.5]],
    lines: ["M56 29l-10 15"],
  },
  queen: {
    paths: [FOOT, BAND, SKIRT, "M21 35l11 28h36l11-28l-13 15l-2-23l-7 21l-7-23l-7 23l-7-21l-2 23z"],
    discs: [[21, 32, 5], [36, 25, 5], [50, 22, 5], [64, 25, 5], [79, 32, 5]],
  },
  king: {
    paths: [FOOT, BAND, SKIRT, "M46 6h8v7h7v8h-7v10h-8v-10h-7v-8h7z", "M50 35c8-9 27-6 27 8c0 9-7 14-10 20h-34c-3-6-10-11-10-20c0-14 19-17 27-8z"],
    lines: ["M50 39v20"],
  },
};

/** The sets there are, by game: a kind only means something inside its own game (a "king" in Checkers is a crowned disc). */
const SETS: Partial<Record<BoardGameId, Record<string, Shape>>> = { chess: CHESS };

/** Which game's pieces are being drawn: the board table says, once, and every piece on it follows. */
export const PieceSet = createContext<BoardGameId | null>(null);

/** Whether a piece has a drawing here; one without is drawn as its `glyph`, as text. */
export function usePieceArt(piece: BoardPiece): React.ReactNode | null {
  const game = useContext(PieceSet);
  const shape = game ? SETS[game]?.[piece.kind] : undefined;
  if (!shape) return null;
  const solid = (
    <>
      {shape.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
      {shape.discs?.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} />)}
    </>
  );
  return (
    <svg className="piece-art" viewBox="0 0 100 100" aria-hidden focusable="false">
      {/* The outline is the same shapes drawn fatter underneath, so where two of them overlap no seam shows. */}
      <g className="edge" strokeWidth={7} strokeLinejoin="round">
        {solid}
      </g>
      <g className="fill">{solid}</g>
      <g className="detail" fill="none" strokeWidth={4} strokeLinecap="round">
        {shape.lines?.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g className="detail-dots">{shape.dots?.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} />)}</g>
    </svg>
  );
}
