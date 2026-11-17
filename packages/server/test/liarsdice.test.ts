// Liar's Dice in the parlor: what someone watching is shown. Every seat's dice are its own, so a
// watcher sees none while the bidding goes on, and every hand once a call has lifted the cups.
import { kitGame, movesOffered, type BoardView } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { watchView } from "../src/games.js";

type State = { hands: number[][]; turn: number };
const game = kitGame("liarsdice")! as unknown as { normalize(r: unknown): unknown; newGame(rules: unknown, seats: number, seed: number): State; apply(s: State, seat: number, move: unknown): State; view(s: State, seat: number): BoardView };
const views = (s: State) => [0, 1, 2].map((seat) => game.view(s, seat));

describe("watching Liar's Dice", () => {
  it("shows nobody's dice while the cups are down, even when two seats hold the same", () => {
    const s = game.newGame(game.normalize({}), 3, 5);
    // Every seat has rolled the very same dice: compared part by part, the views would agree.
    s.hands = s.hands.map(() => [6, 6, 2, 3, 4]);
    const bid = game.apply(s, s.turn, { type: "bid", count: 2, face: 6 });
    const watch = watchView("liarsdice", views(bid)) as BoardView;
    expect(watch.dice).toBeNull();
    expect(JSON.stringify(watch)).not.toContain("6 6 2 3 4");
    expect(watch.players.map((p) => p.line)).toEqual(["5 dice", "5 dice", "5 dice"]);
    expect(watch.info).toContain("The bid: 2 sixes");
    expect(watch.choices).toBeNull();
    expect(movesOffered(watch)).toEqual([]);
  });

  it("shows every hand once a call has lifted the cups, and nothing to press", () => {
    const s = game.newGame(game.normalize({}), 3, 5);
    s.hands = [[1, 2, 3, 4, 5], [2, 2, 3, 6, 6], [1, 1, 4, 5, 6]];
    const called = game.apply(game.apply(s, s.turn, { type: "bid", count: 9, face: 6 }), game.apply(s, s.turn, { type: "bid", count: 9, face: 6 }).turn, { type: "liar" });
    const watch = watchView("liarsdice", views(called)) as BoardView;
    expect(watch.players.map((p) => p.line)).toEqual(["1 2 3 4 5", "2 2 3 6 6", "1 1 4 5 6"]);
    expect(watch.narration).toMatch(/calls .* a liar on 9 sixes: there are 6 sixes/);
    expect(watch.dice).toBeNull();
    expect(movesOffered(watch)).toEqual([]);
  });
});
