// The shelves the front page sorts games onto: cards, boards, dice, table sports, arcade. A game
// on the kit or the arcade says its own category; Spades and Palace, which have packages of their
// own, are card games.
import { ALL_GAMES, GAME_CATEGORIES, type GameCategory } from "@journey-to-code/games";

export { GAME_CATEGORIES, type GameCategory };

export const categoryOf = (id: string): GameCategory => ALL_GAMES.find((g) => g.id === id)?.category ?? "cards";

/** A shelf inside the card games: the kind of card game, so forty-odd of them aren't one long wall. */
export interface CardGroup {
  id: string;
  name: string;
  emoji: string;
  /** The games on it, in the order the shelf lists them. */
  games: string[];
}

/** The card games' sub-shelves, in the order they are listed. A card game on none of them lands on "More card games". */
export const CARD_GROUPS: CardGroup[] = [
  { id: "tricks", name: "Trick-taking", emoji: "♠️", games: ["spades", "hearts", "euchre", "whist", "ohhell", "pinochle", "pitch", "fivehundred", "bridge"] },
  { id: "rummy", name: "Rummy & melding", emoji: "🔢", games: ["gin", "rummy500", "contractrummy", "canasta", "handfoot"] },
  { id: "shedding", name: "Shedding & climbing", emoji: "🏃", games: ["crazy8", "switch", "president", "palace", "sevens", "durak", "spite", "kingscorner", "bluff"] },
  { id: "counting", name: "Counting & swapping", emoji: "🔄", games: ["cribbage", "golf", "thirtyone", "cuckoo"] },
  { id: "solitaire", name: "Solitaire", emoji: "🧘", games: ["klondike", "freecell", "spider", "pyramid"] },
  { id: "casino", name: "Poker & casino", emoji: "🎰", games: ["holdem", "fivedraw", "blackjack", "liarspoker"] },
  { id: "family", name: "Family & kids", emoji: "🧒", games: ["gofish", "oldmaid", "war", "slapjack", "speed", "memory", "fruitsalad"] },
  { id: "drinking", name: "Drinking games", emoji: "🍻", games: ["ridethebus", "kingscup", "horserace", "drinkingpyramid"] },
  { id: "mahjong", name: "Mahjong", emoji: "🀄", games: ["mahjongshanghai", "mahjongriichi"] },
];

/** Which sub-shelf a card game sits on (undefined for a game on none, and for a game that isn't a card game). */
export const cardGroupOf = (id: string): string | undefined => (categoryOf(id) === "cards" ? CARD_GROUPS.find((g) => g.games.includes(id))?.id : undefined);

/**
 * Whether a game is played with playing cards: whether a table of it has a deck to choose, suits
 * to colour and a deal to make. Mahjong sits on the cards shelf and is played with tiles.
 */
export const usesCards = (id: string): boolean => categoryOf(id) === "cards" && !id.startsWith("mahjong");
