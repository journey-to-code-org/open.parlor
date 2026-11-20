// Boards that aren't rectangles (Ludo's cross, the Chinese Checkers star) come as the rectangle
// round them with the cells that aren't there shaded "none". The table hides those and never
// offers one: this checks the engine keeps its side of that for every view of a game played through.
import { kitGame, movesOffered, type BoardView } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";

const SHARP = { skill: 1, sloppy: 0 };

describe.each(["ludo", "chinesecheckers", "snakes"])("%s", (id) => {
  it("never puts a piece on a cell that isn't there, or offers one", () => {
    const game = kitGame(id)!;
    const seats = game.seats.max;
    let state = game.newGame(game.presets[0], seats, 7);
    for (let move = 0; move < 400 && !game.summary(state).over; move++) {
      const seat = Array.from({ length: seats }, (_, i) => i).find((i) => game.bot(state, i, SHARP) !== null)!;
      const view = game.view(state, seat) as BoardView;
      const grid = view.grids[0]!;
      const shade = grid.shade as string[];
      expect(shade).toHaveLength(grid.rows * grid.cols);
      grid.cells.forEach((piece, cell) => {
        if (piece) expect(shade[cell], `a piece on cell ${cell}`).not.toBe("none");
      });
      for (const offered of movesOffered(view) as { cell?: number; from?: number; to?: number }[]) {
        for (const cell of [offered.cell, offered.from, offered.to]) if (cell !== undefined) expect(shade[cell], `offered cell ${cell}`).not.toBe("none");
      }
      // Every seat has a piece of its own colour for the table to match its squares to.
      expect(new Set(view.players.map((p) => p.piece?.tone)).size).toBe(seats);
      state = game.apply(state, seat, game.bot(state, seat, SHARP)!);
    }
  });
});
