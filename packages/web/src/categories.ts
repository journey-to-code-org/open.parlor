// The shelves the front page sorts games onto: cards, boards, dice, table sports, arcade.
// A game on the kit says its own category (@journey-to-code/games 0.1.4 and later). Until the parlor
// is on that version, and for Spades and Palace, which aren't on the kit, it is worked out here from
// the kind of table the game has.
import { isBoardGame, isSportGame, kitGame } from "@journey-to-code/games";

export type GameCategory = "cards" | "board" | "dice" | "sports" | "arcade";
/** Every category in the order the front page lists them, with the words for its heading. */
export const GAME_CATEGORIES: { id: GameCategory; name: string; emoji: string }[] = [
  { id: "cards", name: "Card games", emoji: "🃏" },
  { id: "board", name: "Board games", emoji: "♟️" },
  { id: "dice", name: "Dice games", emoji: "🎲" },
  { id: "sports", name: "Table sports", emoji: "🎳" },
  { id: "arcade", name: "Arcade", emoji: "🕹️" },
];
const KNOWN = new Set<string>(GAME_CATEGORIES.map((c) => c.id));
/** Board-kit games whose table is a scorecard and dice. */
const DICE_GAMES = new Set(["yacht"]);

export function categoryOf(id: string): GameCategory {
  const said = (kitGame(id) as { category?: unknown } | undefined)?.category;
  if (typeof said === "string" && KNOWN.has(said)) return said as GameCategory;
  if (DICE_GAMES.has(id)) return "dice";
  if (isBoardGame(id)) return "board";
  if (isSportGame(id)) return "sports";
  return "cards";
}
