// Pieces that glide, moved by Zubra's motion module (`glide` in @zubra/runtime/motion).
//
// Everywhere else on a board a piece is drawn inside its cell, so one that moves is a new element in
// another cell, and the table's own code (useCardFlip in ../motion) slides it there by its id.
// `glide` works the other way round: it is handed elements, a change that moves them, and animates
// each from where it was to where it is. So the pieces of a board that glides are drawn in one layer
// over the grid, an element for every piece for as long as it is on the board, and a move changes
// only where that element is put.
//
// A piece is one of these when it is somebody's and has an id (alone on its cell) or ids (a stack):
// each piece of a stack is drawn, a little to the side of the one under it.
import { glide } from "@zubra/runtime/motion";
import type { BoardGrid, BoardPiece } from "@journey-to-code/games";
import { useLayoutEffect, useMemo, useRef } from "react";
import { EASE_OUT } from "../motion";

/** The games whose pieces are drawn in the layer. Each is moved over once it has been looked at in a table. */
// Snakes & Ladders moved to a board of its own (SnakesBoard.tsx), which walks each move square by square.
const GLIDES: ReadonlySet<string> = new Set<string>();
export const glides = (game: string) => GLIDES.has(game);
/** Whether this piece is drawn in the layer and not in its cell. */
export const inLayer = (piece: BoardPiece | null | undefined): piece is BoardPiece => !!piece && piece.owner !== null && (piece.id !== undefined || !!piece.ids?.length);

interface Placed {
  id: string;
  cell: number;
  /** Where it is in the stack on its cell, from the bottom, and how many are in it. */
  k: number;
  n: number;
  piece: BoardPiece;
}

interface Props {
  grid: BoardGrid;
  /** Where on the screen a cell is drawn (a board can be turned round). */
  shown: (cell: number) => number;
  /** How much pieces travel (motionScale): 0 puts them down without moving them. */
  scale: number;
  children: (piece: BoardPiece) => React.ReactNode;
}

export function GlideLayer({ grid, shown, scale, children }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const placed = useMemo(() => {
    const out: Placed[] = [];
    grid.cells.forEach((piece, cell) => {
      if (!inLayer(piece)) return;
      const ids = piece.ids?.length ? piece.ids : [piece.id!];
      ids.forEach((id, k) => out.push({ id, cell, k, n: ids.length, piece }));
    });
    // Always in the same order, so React never moves an element to keep its place in the list.
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }, [grid.cells]);
  const where = placed.map((p) => `${p.id}@${shown(p.cell)}`).join(" ");

  // After a render the elements say where they belong (data-at) but are still where they were.
  // Putting them there is the change `glide` animates.
  useLayoutEffect(() => {
    const all = [...(layer.current?.querySelectorAll<HTMLElement>(".glider") ?? [])];
    const put = (el: HTMLElement) => {
      const at = Number(el.dataset.at);
      el.style.left = `${((at % grid.cols) / grid.cols) * 100}%`;
      el.style.top = `${(Math.floor(at / grid.cols) / grid.rows) * 100}%`;
      // A piece that was dragged to its place is held there by a translate: it is in place now.
      el.style.translate = "";
      el.style.transition = "";
    };
    // One that has just come onto the board has nowhere to glide from.
    const here = all.filter((el) => {
      if (el.style.left) return true;
      put(el);
      return false;
    });
    if (scale === 0) return here.forEach(put);
    // Measured without a glide still running on it.
    for (const el of here) el.getAnimations().forEach((a) => a.finish());
    glide(here, () => here.forEach(put));
  }, [where, grid.cols, grid.rows, scale]);

  const style = { "--zb-move-duration": `${Math.round(320 * scale)}ms`, "--zb-move-easing": EASE_OUT } as React.CSSProperties;
  return (
    <div ref={layer} className="glide-layer" style={style} aria-hidden>
      {placed.map((p) => (
        <span key={p.id} className="glider" data-piece={p.id} data-cell={p.cell} data-at={shown(p.cell)} style={{ width: `${100 / grid.cols}%`, height: `${100 / grid.rows}%`, "--k": p.k, "--n": p.n } as React.CSSProperties}>
          {children(p.piece)}
        </span>
      ))}
    </div>
  );
}
