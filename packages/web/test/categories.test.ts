import { KIT_GAMES } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { categoryOf, GAME_CATEGORIES } from "../src/categories";

describe("categoryOf", () => {
  it("puts the parlor's own card games with the cards", () => {
    expect(categoryOf("spades")).toBe("cards");
    expect(categoryOf("palace")).toBe("cards");
  });

  it("goes by what the game is, not the kit it is built on", () => {
    expect(categoryOf("hearts")).toBe("cards");
    expect(categoryOf("chess")).toBe("board");
    expect(categoryOf("yacht")).toBe("dice");
    expect(categoryOf("minigolf")).toBe("sports");
    expect(categoryOf("bowling")).toBe("sports");
  });

  it("gives every game on the kit a category the front page has a shelf for", () => {
    const shelves = new Set(GAME_CATEGORIES.map((c) => c.id));
    for (const game of KIT_GAMES) expect(shelves.has(categoryOf(game.id)), game.id).toBe(true);
  });
});
