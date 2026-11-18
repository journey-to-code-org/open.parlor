// Dominoes in the parlor: what someone watching is shown. The line is everyone's; a hand is its
// seat's own, so a watcher sees none of them, however alike two hands happen to be.
import { kitGame, movesOffered, type BoardView } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { watchView } from "../src/games.js";

type State = { hands: [number, number][][]; turn: number };
const game = kitGame("dominoes")! as unknown as { normalize(r: unknown): unknown; newGame(rules: unknown, seats: number, seed: number): State; apply(s: State, seat: number, move: unknown): State; bot(s: State, seat: number, style: unknown): unknown; view(s: State, seat: number): BoardView };

describe("watching Dominoes", () => {
  it("shows the line and how many tiles each hand holds, and no hand", () => {
    let s = game.newGame(game.normalize({}), 3, 4);
    for (let move = 0; move < 5; move++) s = game.apply(s, s.turn, game.bot(s, s.turn, { skill: 1, sloppy: 0 }));
    const views = [0, 1, 2].map((seat) => game.view(s, seat));
    const watch = watchView("dominoes", views) as BoardView;
    expect(watch.grids.map((g) => g.id)).toEqual(["line"]);
    expect(watch.grids[0]!.cells.filter(Boolean).length).toBeGreaterThan(0);
    expect(watch.players.map((p) => p.line)).toEqual(s.hands.map((h) => `${h.length} tile${h.length === 1 ? "" : "s"} · 0 points`));
    expect(watch.choices).toBeNull();
    expect(movesOffered(watch)).toEqual([]);
    // Each seat's own view has its hand, and only its own.
    for (const [seat, v] of views.entries()) expect(v.grids.filter((g) => g.owner !== undefined).map((g) => g.owner)).toEqual(s.hands[seat]!.length ? [seat] : []);
  });
});
