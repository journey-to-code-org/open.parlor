// A field game at a table on the server: someone watching sees the field, the tanks and everyone's
// shells, as every seat does, and nobody's aim or pick.
import { kitGame, type FieldView } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { watchView } from "../src/games.js";

const game = kitGame("overthehill")!;
const views = (state: unknown, seats: number) => Array.from({ length: seats }, (_, seat) => game.view(state, seat));

describe("watching Over the Hill", () => {
  it("shows the whole field and no way to fire", () => {
    const state = game.newGame(game.normalize(game.presets[0]), 3, 4);
    const turn = (game.view(state, 0) as FieldView).turn!;
    const mine = game.view(state, turn) as FieldView;
    expect(mine.aim).not.toBeNull();
    const watch = watchView("overthehill", views(state, 3)) as FieldView;
    expect(watch.aim).toBeNull();
    expect(watch.pick).toBeNull();
    expect(watch.field).toEqual(mine.field);
    expect(watch.players).toEqual(mine.players);
    expect(watch.shells).toEqual(mine.shells);
    expect(watch.turn).toBe(turn);
    expect(watch.scores).toEqual(mine.scores);
  });

  it("shows the shells still to be chosen, and the shot just fired", () => {
    const draft = game.newGame(game.normalize({ id: "draft" }), 2, 4);
    const choosing = watchView("overthehill", views(draft, 2)) as FieldView;
    expect(choosing.pool!.length).toBeGreaterThan(0);
    expect(choosing.pick).toBeNull();
    let state = game.newGame(game.normalize(game.presets[0]), 2, 4);
    const seat = (game.view(state, 0) as FieldView).turn!;
    state = game.apply(state, seat, { type: "fire", shell: "shot", angle: 60, power: 50 });
    const after = watchView("overthehill", views(state, 2)) as FieldView;
    expect(after.last).toEqual((game.view(state, 0) as FieldView).last);
    expect(after.narration).toBe((game.view(state, 0) as FieldView).narration);
  });
});
