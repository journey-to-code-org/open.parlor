// Air hockey at its own table: which end a finger steers, who is said to have won, and that the
// game the table plays is the one the setup screen describes.
import { ARCADE_GAMES, airHockey } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { airHockeyResult, endAt } from "../src/arcade/AirHockeyTable";
import { controlsFor } from "../src/arcade/controls";
import { hasArcade3d } from "../src/arcade/scene3d";

describe("air hockey's table", () => {
  it("gives the whole table to the near end against the house, and half each to two players", () => {
    expect(endAt(100, 8000, 1)).toBe(0);
    expect(endAt(7900, 8000, 1)).toBe(0);
    expect(endAt(100, 8000, 2)).toBe(1);
    expect(endAt(3999, 8000, 2)).toBe(1);
    expect(endAt(4000, 8000, 2)).toBe(0);
    expect(endAt(7900, 8000, 2)).toBe(0);
  });

  it("says who won in the words of whoever is playing", () => {
    expect(airHockeyResult(0, 1)).toBe("You win");
    expect(airHockeyResult(1, 1)).toBe("The house wins");
    expect(airHockeyResult(0, 2)).toBe("Blue wins");
    expect(airHockeyResult(1, 2)).toBe("Red wins");
    expect(airHockeyResult(2, 1)).toBe("A draw");
    expect(airHockeyResult(2, 2)).toBe("A draw");
  });

  it("is on the arcade shelf, for one against the house or two at a screen, with a table of its own", () => {
    expect(ARCADE_GAMES).toContain(airHockey);
    expect(airHockey.seats).toMatchObject({ min: 1, max: 2 });
    expect(() => controlsFor("airhockey", { autofire: () => false })).toThrow(/own table/);
    expect(hasArcade3d("airhockey")).toBe(false);
  });

  it("takes a finger's place on the field as a seat's whole control", () => {
    const s = airHockey.newGame(airHockey.normalize(null), 2, 1);
    const before = airHockey.view(s).rink!.ends.map((e) => e.x);
    for (let t = 0; t < 30; t++) airHockey.step(s, [{ x: 1000, y: 7000 }, { x: 5000, y: 1000 }]);
    const after = airHockey.view(s).rink!.ends;
    expect(after[0]).toMatchObject({ seat: 0, x: 1000, y: 7000 });
    expect(after[1]).toMatchObject({ seat: 1, x: 5000, y: 1000 });
    expect(before).toEqual([3000, 3000]);
  });
});
