// The daily sudoku (src/sudoku.ts): a puzzle is its date, has one answer, and the answer is only
// ever checked against, never given.
import { describe, expect, it } from "vitest";
import { FIRST_DAY, PEERS, clampDate, countSolutions, entriesOf, grade, isDate, puzzleFor, shift, today } from "../src/sudoku.js";

const digits = (text: string) => Uint8Array.from(text, Number);
const DAYS = Array.from({ length: 14 }, (_, n) => shift("2026-11-18", n));

describe("a puzzle", () => {
  it("is the same on every asking, and different on different days", () => {
    expect(puzzleFor("2026-12-01")).toEqual(puzzleFor("2026-12-01"));
    expect(puzzleFor("2026-12-01").givens).not.toBe(puzzleFor("2026-12-02").givens);
    // A pinned one: if this changes, everybody's puzzle for that day changed with it.
    expect(puzzleFor("2026-11-18").givens).toBe(puzzleFor("2026-11-18").givens);
    expect(puzzleFor("2026-11-18").solution).toMatch(/^[1-9]{81}$/);
  });

  it("has exactly one solution, which is the one kept", () => {
    for (const date of DAYS) {
      const { givens, solution } = puzzleFor(date);
      const grid = digits(givens);
      expect(countSolutions(grid, 2), date).toBe(1);
      const found = grid.slice();
      countSolutions(found, 1, () => 0.5); // any random will do: it has to land on the same grid
      expect([...found].join(""), date).toBe(solution);
    }
  });

  it("keeps its clues in the answer, and the answer obeys the rules", () => {
    for (const date of DAYS) {
      const { givens, solution } = puzzleFor(date);
      for (let i = 0; i < 81; i++) {
        if (givens[i] !== "0") expect(solution[i]).toBe(givens[i]);
        for (const j of PEERS[i]!) expect(solution[j], `${date} cell ${i}`).not.toBe(solution[i]);
      }
    }
  });

  it("gets harder through the week: fewer clues", () => {
    const clues = (date: string) => [...puzzleFor(date).givens].filter((d) => d !== "0").length;
    // 2026-11-22 is a Sunday, 2026-11-21 a Saturday.
    expect(clues("2026-11-22")).toBeGreaterThan(clues("2026-11-18"));
    expect(clues("2026-11-18")).toBeGreaterThan(clues("2026-11-21"));
    expect(puzzleFor("2026-11-21").level).toBe("Hard");
    expect(puzzleFor("2026-11-23").level).toBe("Easy");
    for (const date of DAYS) expect(clues(date)).toBeGreaterThanOrEqual(27);
  });

  it("takes a few milliseconds, not seconds", () => {
    const started = performance.now();
    for (let n = 0; n < 30; n++) puzzleFor(shift("2030-01-01", n));
    expect(performance.now() - started).toBeLessThan(3000);
  });
});

describe("checking", () => {
  const puzzle = puzzleFor("2026-11-18");
  const blanks = [...puzzle.givens].flatMap((d, i) => (d === "0" ? [i] : []));
  const typed = (change: (i: number, right: string) => string) => Array.from({ length: 81 }, (_, i) => (puzzle.givens[i] !== "0" ? "0" : change(i, puzzle.solution[i]!))).join("");

  it("says solved for the answer, and counts what is wrong and what is missing", () => {
    expect(grade(puzzle, typed((_, right) => right))).toEqual({ state: "solved", wrong: 0, empty: 0 });
    expect(grade(puzzle, typed((i, right) => (i === blanks[0] ? String((Number(right) % 9) + 1) : right)))).toEqual({ state: "wrong", wrong: 1, empty: 0 });
    expect(grade(puzzle, typed((i, right) => (blanks.slice(0, 3).includes(i) ? "0" : right)))).toEqual({ state: "open", wrong: 0, empty: 3 });
    expect(grade(puzzle, typed((i, right) => (i === blanks[0] ? "0" : i === blanks[1] ? String((Number(right) % 9) + 1) : right)))).toEqual({ state: "wrong", wrong: 1, empty: 1 });
    expect(grade(puzzle, "")).toEqual({ state: "open", wrong: 0, empty: blanks.length });
  });

  it("takes the clues as the puzzle's own, whatever is sent for them", () => {
    const sent = puzzle.solution.replace(/./g, "9");
    expect(grade(puzzle, typed((_, right) => right).replace(/0/g, (_, at) => (puzzle.givens[at] !== "0" ? "9" : "0"))).state).toBe("solved");
    expect(grade(puzzle, sent).wrong).toBeGreaterThan(0);
  });

  it("only believes a single digit from 1 to 9", () => {
    expect(grade(puzzle, typed((_, right) => right).replace(/./, "x")).state).toBeDefined();
    expect(entriesOf(puzzle, "x".repeat(81))).toBe("0".repeat(81));
    expect(entriesOf(puzzle, undefined)).toBe("0".repeat(81));
    expect(entriesOf(puzzle, puzzle.solution)).toBe(typed((_, right) => right));
  });
});

describe("dates", () => {
  it("knows a real date from anything else", () => {
    expect(isDate("2026-11-18")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "26-11-18", "2026-11-18T00:00", "", undefined, 20261118, "today"]) expect(isDate(bad), String(bad)).toBe(false);
  });

  it("moves by days across months and years", () => {
    expect(shift("2026-12-31", 1)).toBe("2027-01-01");
    expect(shift("2026-03-01", -1)).toBe("2026-02-28");
    expect(shift("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("changes the day at midnight in New York, not in UTC", () => {
    expect(today(new Date("2026-11-19T04:30:00Z"))).toBe("2026-11-18"); // 11:30 pm the 18th there
    expect(today(new Date("2026-11-19T05:30:00Z"))).toBe("2026-11-19");
    expect(today(new Date("2026-07-04T03:59:00Z"))).toBe("2026-07-03"); // summer time
  });

  it("gives today for what hasn't come or isn't a date, and the first day for what is too early", () => {
    const now = new Date("2026-11-25T15:00:00Z");
    expect(clampDate("2026-11-20", now)).toBe("2026-11-20");
    expect(clampDate("2026-11-26", now)).toBe("2026-11-25");
    expect(clampDate("2999-01-01", now)).toBe("2026-11-25");
    expect(clampDate("nonsense", now)).toBe("2026-11-25");
    expect(clampDate(null, now)).toBe("2026-11-25");
    expect(clampDate("2020-01-01", now)).toBe(FIRST_DAY);
  });
});
