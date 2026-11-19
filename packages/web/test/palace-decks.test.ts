import { newPalace, familyPalace, viewPalace } from "@journey-to-code/palace";
import { describe, expect, it } from "vitest";
import { palaceDeckNote, palaceDecks } from "../src/palace/decks";

describe("palace decks (#292)", () => {
  it("matches the engine's deal for every table size", () => {
    for (let seats = 2; seats <= 6; seats++) {
      const s = newPalace(familyPalace, seats, 7);
      const dealt = s.players.reduce((n, p) => n + p.down.length + p.up.length + p.hand.length, 0);
      expect(dealt + viewPalace(s, 0).deck).toBe(52 * palaceDecks(familyPalace, seats));
    }
  });
  it("explains the 50 left to draw at six players", () => {
    expect(palaceDeckNote({ handSize: 3, tableCards: 3 }, 6)).toContain("50 left to draw");
    expect(palaceDeckNote({ handSize: 3, tableCards: 3 }, 5)).toBeNull();
  });
});
