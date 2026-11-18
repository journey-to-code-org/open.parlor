import { ALL_GAMES } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { CARD_GROUPS, cardGroupOf, categoryOf, GAME_CATEGORIES } from "../src/categories";

describe("categoryOf", () => {
  it("puts the parlor's own card games with the cards", () => {
    expect(categoryOf("spades")).toBe("cards");
    expect(categoryOf("palace")).toBe("cards");
  });

  it("goes by what the game is, not the kit it is built on", () => {
    expect(categoryOf("hearts")).toBe("cards");
    expect(categoryOf("chess")).toBe("board");
    for (const id of ["yacht", "pig", "tenthousand", "shipcaptaincrew", "shutthebox", "liarsdice"]) expect(categoryOf(id), id).toBe("dice");
    expect(categoryOf("minigolf")).toBe("sports");
    expect(categoryOf("bowling")).toBe("sports");
    expect(categoryOf("skyfire")).toBe("arcade");
    // A game of tanks is an arcade game to someone choosing one, though it is played in turns at a table.
    expect(categoryOf("overthehill")).toBe("arcade");
    // Both are on the word kit, and neither is a game about words.
    expect(categoryOf("drawguess")).toBe("party");
    expect(categoryOf("readtheroom")).toBe("party");
    expect(GAME_CATEGORIES.find((c) => c.id === "party")?.name).toBe("Party games");
  });

  it("gives every game a category the front page has a shelf for", () => {
    const shelves = new Set(GAME_CATEGORIES.map((c) => c.id));
    for (const game of ALL_GAMES) expect(shelves.has(categoryOf(game.id)), game.id).toBe(true);
  });
});

// A deck to choose, suits to colour and a deal to make are for games played with playing cards.
describe("which games are played with cards", () => {
  it("is the card shelf without Mahjong, which is played with tiles", async () => {
    const { usesCards } = await import("../src/categories");
    for (const id of ["spades", "palace", "hearts", "cribbage", "klondike", "memory"]) expect(usesCards(id), id).toBe(true);
    for (const id of ["drawguess", "wordhunt", "minigolf", "bowling", "chess", "yacht", "liarsdice", "airhockey", "mahjongshanghai", "mahjongriichi"]) expect(usesCards(id), id).toBe(false);
  });
});

// The cards shelf is sorted into kinds of card game, so forty-odd of them aren't one long wall.
describe("the kinds of card game", () => {
  const cardGames = ["spades", "palace", ...ALL_GAMES.filter((g) => g.category === "cards").map((g) => g.id)];

  it("puts every card game on a sub-shelf", () => {
    for (const id of cardGames) expect(cardGroupOf(id), id).toBeDefined();
  });

  it("lists each game once", () => {
    const listed = CARD_GROUPS.flatMap((g) => g.games);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("names only games the parlor has", () => {
    for (const id of CARD_GROUPS.flatMap((g) => g.games)) expect(cardGames, id).toContain(id);
  });

  it("leaves other shelves alone", () => {
    expect(cardGroupOf("chess")).toBeUndefined();
    expect(cardGroupOf("yacht")).toBeUndefined();
  });
});
