// What is drawn in 3-D, and what the parlor calls things: the small files the tables import.
import { ARCADE_GAMES, KIT_GAMES } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { arcadeBlurb, arcadeSays } from "../src/arcade/flavour";
import { hasArcade3d } from "../src/arcade/scene3d";
import { hasBoard3d } from "../src/board/board3d";
import { wants3d } from "../src/display";
import { GAME_LIST } from "../src/GamePicker";
import { cardKey } from "../src/handOrder";

describe("which games have a scene", () => {
  it("every game played at the arcade table has one", () => {
    // Road to the Shootout has a screen of its own, and its own strip in 3-D (drive/strip3d.ts).
    // Air hockey has a table of its own too (arcade/AirHockeyTable.tsx), seen from straight above.
    for (const g of ARCADE_GAMES.filter((a) => a.id !== "pinkslips" && a.id !== "airhockey" && a.id !== "zubraquest")) expect(hasArcade3d(g.id), g.id).toBe(true);
  });
  it("every board of squares has one, and a card game never asks for one", () => {
    for (const id of ["chess", "checkers", "reversi", "go", "tictactoe", "dropfour", "combat"]) expect(hasBoard3d(id), id).toBe(true);
    for (const g of KIT_GAMES.filter((k) => k.category === "cards")) expect(hasBoard3d(g.id), g.id).toBe(false);
  });
  it("the setting decides, and mini golf's best is its flat drawing", () => {
    expect(wants3d("chess", "auto")).toBe(true);
    expect(wants3d("minigolf", "auto")).toBe(false);
    expect(wants3d("minigolf", "3d")).toBe(true);
    expect(wants3d("bowling", "flat")).toBe(false);
  });
});

describe("the parlor's words for Shitstorm", () => {
  it("changes whole phrases and words inside a line", () => {
    expect(arcadeSays("skyfire", "Bombs")).toBe("Flushes");
    expect(arcadeSays("skyfire", "Thunderhead")).toBe("The Fan");
    expect(arcadeSays("skyfire", "Press X for a bomb, or tap with a second finger.")).toBe("Press X for a flush, or tap with a second finger.");
  });
  it("leaves the other games as their engines have them", () => {
    expect(arcadeSays("bulwark", "Bombs")).toBe("Bombs");
    expect(arcadeBlurb("bulwark", "as given")).toBe("as given");
  });
});

describe("games the parlor can't draw yet", () => {
  it("lists every game the engine has, billiards included now that it has been seen on a screen", () => {
    for (const g of KIT_GAMES) expect(GAME_LIST.some((l) => l.id === g.id), g.id).toBe(true);
  });
  it("lists Mahjong Riichi now that it has a table", () => {
    expect(GAME_LIST.some((g) => g.id === "mahjongriichi")).toBe(true);
  });
  it("leaves a rack of tiles in the order the engine gave it", () => {
    const tile = { kind: "tile" as const };
    expect(cardKey(tile)).toEqual({ suit: 6, rank: 0 });
  });
});
