// Sounds (and on a phone, the buzz that goes with each: see BUZZES) for the kit's tables, read from
// how the view changed, as useTableSounds does for Spades: the end of a game, a piece put down or
// taken on a board, and a new deal of cards.
import type { BoardGrid } from "@journey-to-code/games";
import { useEffect, useRef } from "react";
import { play } from "./sounds";

/**
 * The end of a game: a fanfare if you won (or your side did), a gentler sound if not. Once per game,
 * and not for someone watching, nor at a table several people share (whose win would it be?).
 */
export function useOverSound(over: { winners: number[] } | null | undefined, me: number, quiet = false) {
  const heard = useRef(!!over);
  useEffect(() => {
    if (!over) {
      heard.current = false;
      return;
    }
    if (heard.current) return;
    heard.current = true;
    if (!quiet) play(over.winners.includes(me) ? "won" : "lost");
  }, [over, me, quiet]);
}

/** How many pieces each grid holds, and where: enough to tell a move from a capture. */
const pieces = (grids: BoardGrid[]) =>
  grids.flatMap((g) => g.cells.map((c, i) => (c ? `${g.id}:${i}:${c.owner}:${c.kind}` : null)).filter((x): x is string => x !== null));

/**
 * A board changing: a piece taken (fewer pieces than before) or put down or moved. Go and the
 * other games played on the points get the click of a stone.
 */
export function useBoardSounds(grids: BoardGrid[], quiet = false) {
  const before = useRef<string[] | null>(null);
  useEffect(() => {
    const now = pieces(grids);
    const was = before.current;
    before.current = now;
    if (!was || quiet) return;
    if (now.length === was.length && now.every((p, i) => p === was[i])) return;
    if (now.length < was.length) play("capture");
    else play(grids.some((g) => g.points) ? "stone" : "piece");
  }, [grids, quiet]);
}

/** A new deal: your hand fills up again from nothing, or a new hand number. */
export function useDealSound(handSize: number, hand: number | undefined) {
  const before = useRef<{ size: number; hand: number | undefined } | null>(null);
  useEffect(() => {
    const was = before.current;
    before.current = { size: handSize, hand };
    if (!was) return;
    if ((hand !== undefined && was.hand !== undefined && hand > was.hand) || (was.size === 0 && handSize > 1)) play("deal");
  }, [handSize, hand]);
}
