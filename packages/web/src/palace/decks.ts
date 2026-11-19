import type { PalaceRules } from "@journey-to-code/palace";

/**
 * How many 52-card decks a Palace deal uses. Mirrors `newPalace` in @journey-to-code/palace: when
 * everyone's cards (hand, face-up and face-down) come to more than 52, two decks are shuffled together.
 * Six players with three of each take 54, so a second deck goes in and 50 are left to draw.
 */
export function palaceDecks(rules: Pick<PalaceRules, "handSize" | "tableCards">, seats: number): 1 | 2 {
  return seats * (rules.handSize + rules.tableCards * 2) > 52 ? 2 : 1;
}

/** The setup screen's line about the deck, or null when it's an ordinary single deck. */
export function palaceDeckNote(rules: Pick<PalaceRules, "handSize" | "tableCards">, seats: number): string | null {
  if (palaceDecks(rules, seats) === 1) return null;
  const each = rules.handSize + rules.tableCards * 2;
  const left = 104 - seats * each;
  return `${seats} players need ${seats * each} cards, more than one deck, so two decks are shuffled together (${left} left to draw after the deal).`;
}
