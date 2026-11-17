import { KIT_GAMES, kitGame } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { controls } from "../src/HowToPlay";

describe("how to play", () => {
  it("says how you play every kit game here, and its rules in words", () => {
    for (const g of KIT_GAMES) {
      expect(controls(g.id).length, g.id).toBeGreaterThan(0);
      const kit = kitGame(g.id)!;
      expect(kit.describe(kit.presets[0]).length, g.id).toBeGreaterThan(0);
    }
  });
  it("gives the pull-back games their own words", () => {
    expect(controls("billiards").join(" ")).toMatch(/pull back/);
    expect(controls("drawguess").join(" ")).toMatch(/draw/);
  });
});
