import { COURSES, miniGolf, newMiniGolf, nineHoles, type MiniGolfState } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import {
  CELL,
  buildHole,
  courseId,
  courseProblems,
  holeProblems,
  isCustomCourse,
  normalizeCourse,
  normalizeHole,
  registerCourse,
  routeOf,
  starterCourse,
  starterHole,
  suggestPar,
  unregisterCourse,
  type CustomHole,
} from "../src/index.js";

/** A hole drawn as rows of pieces, for reading. */
const drawn = (name: string, rows: string[], par = 3): CustomHole => ({ name, par, tip: "", cols: rows[0]!.length, rows: rows.length, cells: rows.join("") });

// Up a ramp onto high ground, along it, and down the step to the cup.
const terrace = drawn("The Terrace", [
  ".........",
  ".ggggggg.",
  ".ggggcgg.",
  ".ggggggg.",
  ".hhhhhhh.",
  ".hhhhhhh.",
  ".v######.",
  ".vgggggg.",
  ".gggggtg.",
  ".........",
]);

// A wall all the way across: the only way through is down the tunnel.
const mole = drawn("The Mole", [
  ".......",
  ".ggcgg.",
  ".ggxgg.",
  ".#####.",
  ".gg1gg.",
  ".ggggg.",
  ".ggtgg.",
  ".......",
]);

// Round a corner, past sand, a bumper, a slope and the water's edge.
const corner = drawn("The Corner", [
  ".........",
  ".gggggggc",
  ".gg#ogggg",
  ".gg#gwwww",
  ".g>##....",
  ".gs#.....",
  ".gg#.....",
  ".gg#.....",
  ".gtg.....",
  ".ggg.....",
  ".........",
]);

describe("courses people make", () => {
  it("a new course starts with a hole that plays", () => {
    const c = starterCourse();
    expect(courseProblems(c)).toEqual([]);
    expect(routeOf(c.holes[0]!)).toEqual({ squares: 8, turns: 0 });
    expect(suggestPar(c.holes[0]!)).toBe(2);
  });

  it("a hole needs one tee, one cup, and a way between them a ball can roll", () => {
    expect(holeProblems(drawn("A", ["ggggg", "ggggg", "ggggg", "ggggg", "ggggg"]))).toEqual(["A needs a tee.", "A needs a cup."]);
    expect(holeProblems(drawn("B", ["gtgtg", "ggggg", "ggggg", "ggggg", "ggcgg"]))).toEqual(["B has 2 tees: it needs exactly one."]);
    expect(holeProblems(drawn("C", ["ggcgg", "ggggg", "wwwww", "ggggg", "ggtgg"]))[0]).toMatch(/no way from the tee to the cup/);
    expect(holeProblems(drawn("D", ["ggcgg", "ggggg", "##o##", "ggggg", "ggtgg"]))[0]).toMatch(/no way/);
    expect(holeProblems(corner)).toEqual([]);
    expect(routeOf(corner)).toEqual({ squares: 13, turns: 1 });
    expect(courseProblems({ name: "Empty", holes: [] })).toEqual(["A course needs at least one hole."]);
  });

  it("whatever a page sends is made safe: sizes capped, every square a piece, names trimmed", () => {
    const h = normalizeHole({ name: "  A   very long hole name that goes on and on  ", cols: 99, rows: 2, cells: "<script>", par: 40, tip: 7 });
    expect(h).toMatchObject({ cols: 13, rows: 5, par: 9, tip: "7" });
    expect(h.name.length).toBeLessThanOrEqual(30);
    expect(h.cells).toHaveLength(65);
    expect([...h.cells].every((ch) => ".g#swo^v<>tc".includes(ch))).toBe(true);
    expect(normalizeCourse({ holes: Array.from({ length: 20 }, () => starterHole()) }).holes).toHaveLength(9);
    expect(normalizeCourse(null)).toEqual({ name: "My course", holes: [] });
  });

  it("turns a painted hole into one the game plays: rails round the green, walls, sand, water, a slope, a bumper", () => {
    const h = buildHole(corner, "test-1");
    const walls = h.world.walls.map((w) => w.id);
    expect(walls.filter((w) => w.startsWith("rail-"))).toHaveLength(1);
    expect(walls.filter((w) => w.startsWith("block-")).length).toBeGreaterThan(0);
    expect(h.world.regions?.map((r) => r.id.replace(/-\d+$/, "")).sort()).toEqual(expect.arrayContaining(["sand", "slope", "water"]));
    expect(h.world.bodies).toHaveLength(1);
    expect(h.world.pockets).toEqual([expect.objectContaining({ id: "cup", x: 800 + 8 * CELL + CELL / 2, y: 800 + CELL + CELL / 2 })]);
    expect(h.tee).toEqual([800 + 2 * CELL + CELL / 2, 800 + 8 * CELL + CELL / 2]);
    // The green is one outline, corners only.
    const green = h.look.ground.filter((g) => g.surface === "green");
    expect(green).toHaveLength(1);
    expect(("points" in green[0]!.shape ? green[0]!.shape.points : []).length).toBeLessThan(20);
  });

  it("garden shut in by the course is a wall, not a hole in the green", () => {
    const ring = drawn("Ring", ["ggggg", "g...g", "g...g", "gtggc", "ggggg"]);
    const h = buildHole(ring, "ring-1");
    expect(h.look.ground.filter((g) => g.surface === "green")).toHaveLength(1);
    expect(h.world.walls.some((w) => w.id.startsWith("block-"))).toBe(true);
  });

  it("high ground is climbed only by a slope up to it, and stepped down from anywhere", () => {
    expect(holeProblems(terrace)).toEqual([]);
    // The way: left, up the ramp (two slope squares), along the top, down the step to the cup.
    expect(routeOf(terrace)).not.toBeNull();
    // Without the ramp there is no way up.
    const noRamp = { ...terrace, cells: terrace.cells.replaceAll("v", "g") };
    expect(routeOf(noRamp)).toBeNull();
    expect(holeProblems(noRamp).join(" ")).toMatch(/climbing up high ground/);
    // A slope the wrong way (downhill towards the high ground) is no way up either.
    expect(routeOf({ ...terrace, cells: terrace.cells.replaceAll("v", "^") })).toBeNull();

    const built = buildHole(terrace, "t-1");
    expect(built.look.ground.some((g) => g.level === 450)).toBe(true);
    // One step down along the top of the terrace, none where the ramp meets it.
    expect(built.look.ledges).toHaveLength(1);
    const ledge = built.world.walls.find((w) => w.id === "ledge-1")!;
    expect(ledge.oneWay).toBe(true);
    // Running right to left along the top edge: the high ground (below it) is on its left.
    expect(ledge.points).toEqual([
      [8 * CELL + 800, 4 * CELL + 800],
      [CELL + 800, 4 * CELL + 800],
    ]);
  });

  it("a tunnel goes from its mouth to its molehill, and each needs the other", () => {
    expect(holeProblems(mole)).toEqual([]);
    expect(routeOf(mole)).not.toBeNull();
    expect(routeOf({ ...mole, cells: mole.cells.replace("1", "g") })).toBeNull();
    expect(holeProblems({ ...mole, cells: mole.cells.replace("x", "g") }).join(" ")).toMatch(/tunnel 1 needs molehill 1/);
    expect(holeProblems({ ...mole, cells: mole.cells.replace("1", "g") }).join(" ")).toMatch(/molehill 1 needs tunnel 1/);
    const built = buildHole(mole, "m-1");
    expect(built.world.tunnels).toHaveLength(1);
    const t = built.world.tunnels![0]!;
    // Out of the molehill towards the cup, which is straight up.
    expect([t.x, t.y, t.to, t.angle]).toEqual([3 * CELL + 1200, 4 * CELL + 1200, [3 * CELL + 1200, 2 * CELL + 1200], 27000]);
    expect(built.look.tunnels[0]).toMatchObject({ kind: "burrow" });
  });

  it("the game plays a course once it's registered, and the computer players get round it", () => {
    const id = courseId("abc123", 1);
    expect(isCustomCourse(id)).toBe(true);
    expect(isCustomCourse("back-garden")).toBe(false);
    expect(registerCourse({ name: "Test Garden", holes: [starterHole(1), corner, terrace, mole] }, id)).toBe(true);
    expect(registerCourse({ name: "Broken", holes: [drawn("X", ["ggggg", "ggggg", "ggggg", "ggggg", "ggggg"])] }, courseId("bad", 1))).toBe(false);
    try {
      const rules = miniGolf.normalize({ ...nineHoles, course: id });
      expect(rules).toMatchObject({ course: id, holes: 4 });
      expect(miniGolf.validate(rules)).toEqual([]);
      expect(miniGolf.describe(rules)[0]).toMatch(/All 4 holes of Test Garden/);

      let s: MiniGolfState = newMiniGolf(rules, 2, 9);
      let seed = 4;
      const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
      for (let move = 0; move < 400 && s.phase !== "finished"; move++) {
        const seat = [0, 1].find((i) => miniGolf.bot(s, i, { skill: 1 }, rand));
        expect(seat, `nobody can move: ${s.phase}`).not.toBeUndefined();
        s = miniGolf.apply(s, seat!, miniGolf.bot(s, seat!, { skill: 1 }, rand)!);
      }
      expect(s.phase).toBe("finished");
      // Round in decent time: never past the limit, and holed under it at least once each.
      const card = (s as unknown as { card: number[][] }).card;
      expect(card.flat().every((n) => n >= 1 && n <= rules.limit + 1)).toBe(true);
      expect(card.every((holes) => holes.some((n) => n <= rules.limit))).toBe(true);
    } finally {
      unregisterCourse(id);
    }
    expect(COURSES.some((c) => c.id === id)).toBe(false);
  }, 60_000);
});
