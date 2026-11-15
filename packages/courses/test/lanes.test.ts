import { bowling, laneWorld, LANES, newBowling, scoreOf, type BowlingMove } from "@journey-to-code/games";
import { validateWorld } from "@journey-to-code/physics";
import { describe, expect, it } from "vitest";
import { buildLane, courseId, hasMap, LANE_COLS, LANE_ROWS, laneProblems, mapProblems, normalizeLane, normalizeMap, registerLane, registerMap, starterLane, unregisterLane, unregisterMap, type CustomLane } from "../src/index.js";

/** A lane drawn as rows of pieces (10 across), the rows not given open lane. */
const drawn = (name: string, rows: Record<number, string>): CustomLane => {
  let cells = "";
  for (let r = 0; r < LANE_ROWS; r++) cells += rows[r] ?? ".".repeat(LANE_COLS);
  return { name, cols: LANE_COLS, rows: LANE_ROWS, cells };
};

// Crates down the middle with a gap each side, sand on one side further up, a puddle on the other.
const crates = drawn("Crate Alley", {
  4: "ss......ww",
  5: "ss......ww",
  12: "....#.....",
  13: "....#.....",
  18: "..o.......",
});

describe("lanes people make", () => {
  it("a new lane is open lane all the way, and can be bowled", () => {
    expect(starterLane().cells).toBe(".".repeat(240));
    expect(laneProblems(starterLane())).toEqual([]);
  });

  it("whatever a page sends is made safe: the grid's size, every square a piece, the name trimmed", () => {
    const l = normalizeLane({ name: "  Big   lane ", cols: 99, rows: 3, cells: "#?x" });
    expect([l.name, l.cols, l.rows, l.cells.length, l.cells.slice(0, 3)]).toEqual(["Big lane", 10, 24, 240, "#.."]);
    expect(normalizeMap("bowling", { cells: "" })).toMatchObject({ name: "My lane" });
  });

  it("builds a lane the game plays: crates, sand, water, a bumper", () => {
    const lane = buildLane(crates, "test-1");
    expect(lane.blocks).toHaveLength(1);
    expect(lane.sand).toHaveLength(1);
    expect(lane.water).toHaveLength(1);
    expect(lane.bumpers).toHaveLength(1);
    LANES.push(lane);
    try {
      expect(validateWorld(laneWorld([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { bumpers: true, lane: "test-1" }))).toEqual([]);
    } finally {
      LANES.pop();
    }
  });

  it("won't save a lane no ball gets through", () => {
    const wall = drawn("Shut", { 10: "##########" });
    expect(laneProblems(wall).join(" ")).toMatch(/No ball from the foul line gets to the pins/);
    expect(mapProblems("bowling", wall)).toHaveLength(1);
    expect(registerLane(wall, courseId("shut", 1))).toBe(false);
    // The check leaves nothing behind in LANES.
    expect(LANES.map((l) => l.id)).toEqual(["plain"]);
  });

  it("the game plays a lane once it's registered, and the computer bowls a game on it", () => {
    const id = courseId("crates", 1);
    expect(registerMap("bowling", crates, id)).toBe(true);
    expect(hasMap("bowling", id)).toBe(true);
    try {
      const rules = bowling.normalize({ id: "bowling-five", lane: id });
      let s = newBowling(rules, 2, 4);
      for (let n = 0; n < 200 && s.phase === "playing"; n++) s = bowling.apply(s, s.turn, bowling.bot(s, s.turn, { skill: 1, sloppy: 0 } as never, () => 0.5) as BowlingMove);
      expect(s.phase).toBe("finished");
      expect(scoreOf(s, 0) + scoreOf(s, 1)).toBeGreaterThan(10);
      expect(bowling.view(s, 0).table.key).toContain(id);
    } finally {
      unregisterMap("bowling", id);
    }
    expect(hasMap("bowling", id)).toBe(false);
    unregisterLane("plain");
    expect(LANES.map((l) => l.id)).toEqual(["plain"]);
  }, 60_000);
});
