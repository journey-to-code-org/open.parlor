// The shelves the front page sorts games onto: cards, boards, dice, table sports, arcade. A game
// on the kit or the arcade says its own category; Spades and Palace, which have packages of their
// own, are card games.
import { ALL_GAMES, GAME_CATEGORIES, type GameCategory } from "@journey-to-code/games";

export { GAME_CATEGORIES, type GameCategory };

export const categoryOf = (id: string): GameCategory => ALL_GAMES.find((g) => g.id === id)?.category ?? "cards";
