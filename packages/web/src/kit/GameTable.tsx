// The table for any game on the kit: the card table for a card game's view, the board table for a
// board game's, the word table for a word game's, the canvas table for a table sport's, the field
// table for a field game's. Family
// tables and practice games both come through here, so neither needs to know which kind of game it
// is running.
import { isBoardGame, isFieldGame, isSportGame, isWordGame, type BoardView, type FieldView, type KitView, type SportView, type WordView } from "@journey-to-code/games";
import { HowToPlay, useHowToPlay } from "../HowToPlay";
import { lazyScreen } from "../offline/lazy";
import type { KitTableProps } from "./KitTable";

// Each kind of table is fetched when a game of that kind is first opened (offline/lazy.tsx).
const BoardTable = lazyScreen(() => import("../board/BoardTable").then((m) => m.BoardTable));
const SportTable = lazyScreen(() => import("../sport/SportTable").then((m) => m.SportTable));
const WordTable = lazyScreen(() => import("../word/WordTable").then((m) => m.WordTable));
const FieldTable = lazyScreen(() => import("../field/FieldTable").then((m) => m.FieldTable));
const KitTable = lazyScreen(() => import("./KitTable").then((m) => m.KitTable));

/**
 * `rules`: what this table is played by, where it is known (practice and same-device tables), so
 * how to play can say them; elsewhere it gives the game's usual rules.
 */
export function GameTable({ view, rules, ...rest }: Omit<KitTableProps, "view" | "onHelp"> & { view: KitView | BoardView | SportView | WordView | FieldView; rules?: unknown }) {
  // The first game of each kind on this device opens how to play; the "?" opens it again.
  const help = useHowToPlay(view.game, rest.watching);
  const props = { ...rest, onHelp: help.show };
  const table = isFieldGame(view.game) ? <FieldTable view={view as FieldView} {...props} /> : isSportGame(view.game) ? <SportTable view={view as SportView} {...props} /> : isWordGame(view.game) ? <WordTable view={view as WordView} {...props} /> : isBoardGame(view.game) ? <BoardTable view={view as BoardView} {...props} /> : <KitTable view={view as KitView} {...props} />;
  return (
    <>
      {table}
      {help.open && <HowToPlay game={view.game} rules={rules} onClose={help.close} />}
    </>
  );
}
