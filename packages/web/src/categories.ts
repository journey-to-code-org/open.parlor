// The shelves the front page sorts games onto: cards, boards, dice, table sports, arcade. A game
// on the kit or the arcade says its own category; Spades and Palace, which have packages of their
// own, are card games.
import { ALL_GAMES, GAME_CATEGORIES, type GameCategory } from "@journey-to-code/games";

export { GAME_CATEGORIES, type GameCategory };

export const categoryOf = (id: string): GameCategory => ALL_GAMES.find((g) => g.id === id)?.category ?? "cards";

/**
 * Whether a game is played with playing cards: whether a table of it has a deck to choose, suits
 * to colour and a deal to make. Mahjong sits on the cards shelf and is played with tiles.
 */
export const usesCards = (id: string): boolean => categoryOf(id) === "cards" && !id.startsWith("mahjong");
