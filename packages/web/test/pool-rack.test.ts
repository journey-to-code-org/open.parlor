// The pool balls shown over the table: which group each is in, whose group it is, what is sunk,
// and which ball an aim reaches first.
import { kitGame, type SportView } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { firstBall, poolRack } from "../src/sport/PoolRack";

const pool = kitGame("billiards")!;
const table = (rules: string, seats = 2) => pool.newGame(pool.normalize(pool.presets.find((p: { id: string }) => p.id === rules) ?? pool.presets[0]), seats, 5) as { world: { bodies: { id: string; x: number; y: number; r: number; pocketed?: string }[] }; groups: (string | null)[] };
const seen = (state: unknown, seat = 0) => pool.view(state, seat) as SportView;

describe("the pool rack over the table", () => {
  it("shows eight-ball's fifteen balls as solids, the 8 and stripes, in order", () => {
    const rack = poolRack(seen(table("eight")), ["Mikey", "Maggie"])!;
    expect(rack.map((g) => g.label)).toEqual(["Solids", "8", "Stripes"]);
    expect(rack[0]!.balls.map((b) => b.mark)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(rack[2]!.balls.map((b) => b.mark)).toEqual(["9", "10", "11", "12", "13", "14", "15"]);
    expect(rack[0]!.balls.every((b) => !b.striped)).toBe(true);
    expect(rack[2]!.balls.every((b) => b.striped)).toBe(true);
    // A stripe is the colour of the solid eight below it.
    expect(rack[2]!.balls.map((b) => b.tone)).toEqual(rack[0]!.balls.map((b) => b.tone));
    // The table is open: nobody has a group yet, and nothing is sunk.
    expect(rack.map((g) => [g.owner, g.mine])).toEqual([[null, false], [null, false], [null, false]]);
    expect(rack.flatMap((g) => g.balls).some((b) => b.down)).toBe(false);
  });

  it("says whose each group is once the table is no longer open, and fades what is sunk", () => {
    const state = table("eight");
    state.groups = ["stripes", "solids"];
    state.world.bodies.find((b) => b.id === "3")!.pocketed = "top-left";
    const mine = poolRack(seen(state, 0), ["Mikey", "Maggie"])!;
    expect(mine.map((g) => [g.label, g.owner, g.mine])).toEqual([["Solids", "Maggie", false], ["8", null, false], ["Stripes", "Mikey", true]]);
    expect(mine[0]!.balls.filter((b) => b.down).map((b) => b.mark)).toEqual(["3"]);
    // From the other seat it is the other group that is theirs.
    expect(poolRack(seen(state, 1), ["Mikey", "Maggie"])!.map((g) => g.mine)).toEqual([true, false, false]);
  });

  it("shows nine-ball as one row, with the ball to hit first marked", () => {
    const state = table("nine");
    const rack = poolRack(seen(state), ["Mikey", "Maggie"])!;
    expect(rack).toHaveLength(1);
    expect(rack[0]!.balls.map((b) => b.mark)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(rack[0]!.balls.filter((b) => b.next).map((b) => b.mark)).toEqual(["1"]);
    state.world.bodies.find((b) => b.id === "1")!.pocketed = "top-left";
    expect(poolRack(seen(state), [])![0]!.balls.filter((b) => b.next).map((b) => b.mark)).toEqual(["2"]);
  });

  it("has nothing to show for a game with no numbered balls", () => {
    const golf = kitGame("minigolf")!;
    expect(poolRack(golf.view(golf.newGame(golf.normalize(golf.presets[0]), 2, 1), 0) as SportView, [])).toBeNull();
  });

  it("names the ball an aim reaches first, and none when the aim misses them all", () => {
    const state = table("eight");
    const view = seen(state);
    const cue = state.world.bodies.find((b) => b.id === "cue")!;
    // Straight down the table from the head spot is the ball at the front of the rack.
    const front = [...state.world.bodies].filter((b) => b.id !== "cue").sort((a, b) => a.x - b.x)[0]!;
    expect(firstBall(view, cue, 0)?.mark).toBe(front.id);
    // Back toward the head rail there is nothing.
    expect(firstBall(view, cue, 18000)).toBeNull();
    // A sunk ball is not in the way.
    front.pocketed = "top-left";
    expect(firstBall(seen(state), cue, 0)?.mark).not.toBe(front.id);
    // Whether it is a stripe comes with it.
    const hit = firstBall(seen(state), cue, 0)!;
    expect(hit.striped).toBe(Number(hit.mark) > 8);
  });
});
