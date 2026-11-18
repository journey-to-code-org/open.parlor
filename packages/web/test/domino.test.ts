// A domino is drawn from the engine's glyph: the two numbers, in the order the tile lies.
import { kitGame, type BoardView } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { dominoEnds } from "../src/board/Domino";

describe("a domino's glyph", () => {
  it("is its two ends in order", () => {
    expect(dominoEnds("3|5")).toEqual([3, 5]);
    expect(dominoEnds("6|0")).toEqual([6, 0]);
    expect(dominoEnds("4|4")).toEqual([4, 4]);
  });

  it("is nothing this table draws when it isn't two numbers from none to six", () => {
    for (const glyph of ["", "3", "3|7", "a|b", "3|5|1", "●"]) expect(dominoEnds(glyph), glyph).toBeNull();
  });

  it("is what every tile of the engine's Dominoes says", () => {
    const game = kitGame("dominoes")!;
    let state = game.newGame(game.presets[0], 3, 9);
    for (let move = 0; move < 60 && !game.summary(state).over; move++) {
      const seat = [0, 1, 2].find((i) => game.bot(state, i, { skill: 1, sloppy: 0 }) !== null)!;
      state = game.apply(state, seat, game.bot(state, seat, { skill: 1, sloppy: 0 })!);
      for (const grid of (game.view(state, seat) as BoardView).grids) {
        for (const piece of grid.cells) if (piece) expect(dominoEnds(piece.glyph), piece.glyph).not.toBeNull();
      }
    }
  });
});
