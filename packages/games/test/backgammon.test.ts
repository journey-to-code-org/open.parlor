// Backgammon's rules: what may be played from known positions (coming in from the bar, both dice
// when both can be played, the bigger when only one can, doubles, bearing off), hits, gammons and
// backgammons, the opening roll, taking moves back, the cube and match play to the end, and the
// computer players. Positions are written the way players say them: each side's checkers by its own
// point, 25 for the bar; whatever isn't listed has been borne off.
import { describe, expect, it } from "vitest";
import { backgammon, backgammonPips, backgammonSteps, backgammonTurns, GameError, movesOffered, newBackgammon, type BackgammonMove, type BackgammonRules, type BackgammonState } from "../src/index.js";

const rulesOf = (rules: Partial<BackgammonRules> = {}) => backgammon.normalize({ id: "backgammon-friendly", ...rules });
const fresh = (rules: Partial<BackgammonRules> = {}, seed = 1) => newBackgammon(rulesOf(rules), 2, seed);
const apply = (s: BackgammonState, seat: number, move: BackgammonMove) => backgammon.apply(s, seat, move);

type Spots = Record<number, number>;
interface Setup {
  /** Who is to move (their checkers are the first list). */
  turn?: number;
  /** The dice on the table; without them the seat is still to roll. */
  dice?: number[];
  rules?: Partial<BackgammonRules>;
}
/** A position with `turn` to play: its checkers and the other side's, each by its own points. */
function position(mine: Spots, theirs: Spots, { turn = 0, dice, rules }: Setup = {}): BackgammonState {
  const s = fresh(rules);
  s.stacks = Array.from({ length: 26 }, () => []);
  s.home = [[], []];
  for (const [seat, spots] of [[turn, mine], [1 - turn, theirs]] as [number, Spots][]) {
    let checker = seat * 15;
    for (const [point, count] of Object.entries(spots)) {
      for (let i = 0; i < count; i++) s.stacks[seat === 0 ? Number(point) : 25 - Number(point)]!.push(checker++);
    }
    while (checker < seat * 15 + 15) s.home[seat]!.push(checker++);
  }
  s.turn = turn;
  s.opening = [3, 1];
  s.rolls = 2;
  if (dice) {
    s.phase = "move";
    s.dice = dice.length === 2 && dice[0] === dice[1] ? [dice[0]!, dice[0]!, dice[0]!, dice[0]!] : dice;
    s.used = s.dice.map(() => false);
    s.thrower = s.dice.map(() => turn);
  } else s.phase = "roll";
  return s;
}

/** The cell a seat's point is drawn in, from what the view says about the track. */
function cellOf(s: BackgammonState, seat: number, point: number | "bar" | "off"): number {
  const track = backgammon.view(s, seat).grids[0]!.track!;
  if (point === "bar") return track.bar![seat]!;
  if (point === "off") return track.home![seat]!;
  return seat === 0 ? track.path[24 - point]! : track.path[point - 1]!;
}
const nameOf = (s: BackgammonState, seat: number, cell: number) => {
  for (const point of ["bar", "off", ...Array.from({ length: 24 }, (_, i) => i + 1)] as const) if (cellOf(s, seat, point) === cell) return String(point);
  return `cell ${cell}`;
};
/** What the player to move may play next, as "13/10", "bar/20", "6/off". */
const options = (s: BackgammonState) => backgammonSteps(s).map((o) => `${nameOf(s, s.turn, o.from)}/${nameOf(s, s.turn, o.to)}`).sort();
/** Play steps written the same way. */
function play(s: BackgammonState, ...steps: string[]): BackgammonState {
  for (const step of steps) {
    const seat = s.turn;
    const [from, to] = step.split("/").map((p) => (p === "bar" || p === "off" ? p : Number(p))) as [number | "bar" | "off", number | "bar" | "off"];
    s = apply(s, seat, { type: "move", from: cellOf(s, seat, from), to: cellOf(s, seat, to) });
  }
  return s;
}
/** How many checkers a seat has on one of its own points. */
const count = (s: BackgammonState, seat: number, point: number | "bar" | "off") => backgammon.view(s, seat).grids[0]!.cells[cellOf(s, seat, point)]?.count ?? 0;

/** The other side safely home, out of the way. */
const HOME: Spots = { 6: 5, 5: 5, 4: 5 };

describe("the start", () => {
  it("sets out fifteen checkers a side, 167 pips each, and waits for the opening roll", () => {
    const s = fresh();
    for (const seat of [0, 1]) {
      expect([24, 13, 8, 6].map((p) => count(s, seat, p))).toEqual([2, 5, 3, 5]);
      expect(backgammonPips(s, seat)).toBe(167);
    }
    const v = backgammon.view(s, 0);
    expect(v.grids[0]!.cells.reduce((n, p) => n + (p?.count ?? 0), 0)).toBe(30);
    expect([v.phase, v.turn, v.cube]).toEqual(["opening", null, null]);
    // The first seat's home board is the bottom right; the second seat sees the board turned over.
    expect([v.grids[0]!.flip, backgammon.view(s, 1).grids[0]!.flip]).toEqual([false, "rows"]);
    expect(v.grids[0]!.track).toMatchObject({ kind: "points", bar: [20, 6], home: [27, 13] });
    expect(v.grids[0]!.track!.path).toHaveLength(24);
    expect(v.dice!.dice).toEqual([{ id: 0, value: null, used: false, owner: 0 }, { id: 1, value: null, used: false, owner: 1 }]);
    expect(movesOffered(v)).toEqual([{ type: "roll" }]);
  });

  it("Nackgammon starts with four checkers back", () => {
    const s = fresh({ id: "backgammon-nack" });
    for (const seat of [0, 1]) {
      expect([24, 23, 13, 8, 6].map((p) => count(s, seat, p))).toEqual([2, 2, 4, 3, 4]);
      expect(backgammonPips(s, seat)).toBe(48 + 46 + 52 + 24 + 24);
    }
  });

  it("the opening roll: a die each, the higher goes first with those two dice", () => {
    for (let seed = 1; seed < 40; seed++) {
      let s = fresh({}, seed);
      s = apply(s, 1, { type: "roll" });
      expect(s.phase).toBe("opening");
      expect(() => apply(s, 1, { type: "roll" })).toThrow(GameError);
      expect(backgammon.view(s, 1).choices).toBeNull();
      const after = apply(s, 0, { type: "roll" });
      const [a, b] = [after.phase === "opening" ? null : after.dice[0]!, after.phase === "opening" ? null : after.dice[1]!];
      if (a === null || b === null) continue;
      // Nobody starts with a double, and the dice are one each.
      expect(a).not.toBe(b);
      expect(after.phase).toBe("move");
      expect(after.turn).toBe(a > b ? 0 : 1);
      expect(after.dice).toHaveLength(2);
      const v = backgammon.view(after, 0);
      expect(v.dice!.dice.map((d) => d.owner)).toEqual([0, 1]);
      expect(v.dice!.roll).toBe(2);
      expect(v.narration).toMatch(/^\{[01]\} rolls the higher die: \d-\d to start$/);
    }
  });

  it("a tied opening roll is rolled again, and doubles the stakes once with automatic doubles", () => {
    let ties = 0;
    for (let seed = 1; seed < 400 && ties < 4; seed++) {
      let s = apply(fresh({ id: "backgammon-money", autoDoubles: true }, seed), 0, { type: "roll" });
      const first = s.opening[0];
      s = apply(s, 1, { type: "roll" });
      if (s.phase !== "opening") continue;
      ties++;
      expect(s.opening).toEqual([null, null]);
      expect(s.cube).toEqual({ value: 2, owner: null, turned: false });
      expect(s.narration).toBe(`Both roll a ${first}: the cube goes to 2. Roll again`);
      expect(movesOffered(backgammon.view(s, 0))).toEqual([{ type: "roll" }]);
      // A second tie leaves it at 2.
      const again = { ...s, autos: 1 };
      for (let k = 0; k < 6; k++) {
        const t = apply(apply({ ...again, rng: k * 7919 }, 0, { type: "roll" }), 1, { type: "roll" });
        expect(t.cube.value).toBe(2);
      }
      // Without the rule the cube stays where it was.
      const plain = apply(apply(fresh({ id: "backgammon-money" }, seed), 0, { type: "roll" }), 1, { type: "roll" });
      expect([plain.phase, plain.cube.value]).toEqual(["opening", 1]);
    }
    expect(ties).toBe(4);
  });
});

describe("what may be played", () => {
  it("a checker on the bar comes in first, on a point that isn't held", () => {
    // They hold my 22 point (their 3): a 3 can't come in, a 5 can.
    const s = position({ 25: 1, 6: 5, 13: 2 }, { 3: 2, 6: 5, 9: 3 }, { dice: [5, 3] });
    expect(options(s)).toEqual(["bar/20"]);
    expect(() => play(s, "13/8")).toThrow("Your checker on the bar has to come in first.");
    expect(() => play(s, "bar/22")).toThrow(GameError);
    const v = backgammon.view(s, 0);
    expect(v.grids[0]!.marks).toContainEqual({ cell: cellOf(s, 0, "bar"), mark: "must" });
    expect(v.grids[0]!.select!.sources).toEqual([{ from: cellOf(s, 0, "bar"), to: [cellOf(s, 0, 20)] }]);
    const next = play(s, "bar/20");
    expect(options(next)).toEqual(["13/10", "20/17", "6/3"]);
    expect(count(next, 0, "bar")).toBe(0);
  });

  it("two on the bar and one way in: one comes in and the turn is over", () => {
    const s = position({ 25: 2, 6: 5 }, { 1: 2, 2: 2, 3: 2, 4: 2, 6: 2 }, { dice: [5, 2] });
    expect(options(s)).toEqual(["bar/20"]);
    const next = play(s, "bar/20");
    expect([next.phase, next.turn, count(next, 0, "bar")]).toEqual(["roll", 1, 1]);
    expect(next.narration).toBe("{0} plays bar/20 and can't play the 2");
  });

  it("a roll that can't be played passes by itself", () => {
    // A closed board with a checker on the bar: whatever is rolled, nothing comes in.
    for (const confirm of [false, true]) {
      const s = position({ 25: 1, 6: 5 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 }, { rules: { confirm } });
      const next = apply(s, 0, { type: "roll" });
      expect([next.phase, next.turn]).toEqual(["roll", 1]);
      expect(next.narration).toMatch(/^\{0\} rolls (double \d+s|\d-\d) and can't move$/);
      expect(JSON.stringify(next.stacks)).toBe(JSON.stringify(s.stacks));
      const v = backgammon.view(next, 0);
      // The dice that couldn't be played are still on the table, spent.
      expect(v.dice!.dice.every((d) => d.used && d.value !== null && d.owner === 0)).toBe(true);
      expect(v.dice!.roll).toBe(3);
      expect(movesOffered(v)).toEqual([]);
      expect(movesOffered(backgammon.view(next, 1))).toEqual([{ type: "roll" }]);
    }
  });

  it("both dice have to be played when there is a way to", () => {
    // 13/10 and then 10/4 plays both. 4/1 with the 3 would leave the 6 with nowhere to go (they hold my 7).
    const s = position({ 13: 1, 4: 1 }, { 18: 2, 6: 5 }, { dice: [6, 3] });
    expect(options(s)).toEqual(["13/10"]);
    expect(() => play(s, "4/1")).toThrow("That checker can't move with these dice (both have to be played if they can be).");
    expect(backgammonTurns(s)).toHaveLength(1);
    const mid = play(s, "13/10");
    expect([mid.phase, mid.turn]).toEqual(["move", 0]);
    expect(options(mid)).toEqual(["10/4"]);
    const done = play(mid, "10/4");
    expect([done.phase, done.turn, done.narration]).toEqual(["roll", 1, "{0} plays 13/10, 10/4"]);
  });

  it("when only one die can be played it is the bigger, if that one can", () => {
    // They hold my 4 point: 13/7 or 13/10, and then the other die is blocked either way.
    const s = position({ 13: 1 }, { 21: 2, 6: 5 }, { dice: [3, 6] });
    expect(options(s)).toEqual(["13/7"]);
    expect(() => play(s, "13/10")).toThrow(GameError);
    const done = play(s, "13/7");
    expect([done.phase, done.turn, done.narration]).toEqual(["roll", 1, "{0} plays 13/7 and can't play the 3"]);
    // With my 7 point held as well, the 6 can't be played at all: then it's the 3.
    const low = position({ 13: 1 }, { 21: 2, 18: 2, 6: 5 }, { dice: [3, 6] });
    expect(options(low)).toEqual(["13/10"]);
    expect(play(low, "13/10").narration).toBe("{0} plays 13/10 and can't play the 6");
  });

  it("a double is played as many times as it can be", () => {
    const s = position({ 13: 1, 12: 1 }, { 21: 2, 6: 5 }, { dice: [3, 3] });
    expect(backgammon.view(s, 0).dice!.dice.map((d) => [d.id, d.value, d.used])).toEqual([[0, 3, false], [1, 3, false], [2, 3, false], [3, 3, false]]);
    // Four threes: the checker from the 13 stops at the 7 (they hold my 4 point), the other can run on.
    expect(options(s)).toEqual(["12/9", "13/10"]);
    const three = play(s, "13/10", "10/7", "12/9");
    expect(backgammon.view(three, 0).dice!.dice.map((d) => d.used)).toEqual([true, true, true, false]);
    expect(options(three)).toEqual(["9/6"]);
    expect(play(three, "9/6").narration).toBe("{0} plays 13/10, 10/7, 12/9, 9/6");
    // One checker: two threes and it is stuck behind their point.
    const one = position({ 13: 1 }, { 21: 2, 6: 5 }, { dice: [3, 3] });
    const stuck = play(one, "13/10", "10/7");
    expect([stuck.phase, stuck.turn, stuck.narration]).toEqual(["roll", 1, "{0} plays 13/10, 10/7 and can't play the rest"]);
  });

  it("bearing off: the point the die shows, or the highest when nothing is higher", () => {
    const s = position({ 6: 1, 4: 1, 2: 1 }, HOME, { dice: [4, 1] });
    expect(options(s)).toEqual(["2/1", "4/3", "4/off", "6/2", "6/5"]);
    // A 5 with a checker on the 6 point moves it; it doesn't take the 4 off.
    expect(options(position({ 6: 1, 4: 1, 2: 1 }, HOME, { dice: [5, 5] }))).toEqual(["6/1"]);
    // With nothing above the 4, a 5 takes the 4 off: and not the 2 while the 4 is there.
    const high = position({ 4: 1, 2: 2 }, HOME, { dice: [5, 5] });
    expect(options(high)).toEqual(["4/off"]);
    const off = play(high, "4/off");
    expect(options(off)).toEqual(["2/off"]);
    expect(count(off, 0, "off")).toBe(13);
    expect(backgammon.view(off, 0).grids[0]!.marks).toContainEqual({ cell: cellOf(off, 0, "off"), mark: "last" });
    // A 6 and a 5 both take the checker on the 4 off: it is offered once, and uses the bigger.
    const either = position({ 4: 1, 3: 1 }, HOME, { dice: [5, 6] });
    expect(options(either)).toEqual(["4/off"]);
    const used = play(either, "4/off");
    expect(used.used).toEqual([false, true]);
    // The die that fits exactly is the one used when both would do.
    expect(play(position({ 4: 1, 3: 1 }, HOME, { dice: [6, 4] }), "4/off").used).toEqual([false, true]);
  });

  it("no bearing off with a checker outside the home board, or on the bar", () => {
    const outside = position({ 7: 1, 6: 2, 5: 2 }, HOME, { dice: [6, 1] });
    expect(options(outside).some((o) => o.endsWith("/off"))).toBe(false);
    expect(options(outside)).toEqual(["5/4", "6/5", "7/1", "7/6"]);
    expect(() => play(outside, "6/off")).toThrow("That checker can't go there.");
    // Once it is home, the other die can bear off.
    expect(options(play(outside, "7/6"))).toEqual(["6/off"]);
    const barred = position({ 25: 1, 6: 2, 5: 2 }, { 13: 2, 8: 3 }, { dice: [6, 5] });
    expect(options(barred)).toEqual(["bar/19", "bar/20"]);
    expect(options(play(barred, "bar/20")).some((o) => o.endsWith("/off"))).toBe(false);
  });

  it("the second seat travels the other way and plays by the same rules", () => {
    const s = position({ 25: 1, 6: 5, 13: 2 }, { 3: 2, 6: 5, 9: 3 }, { turn: 1, dice: [5, 3] });
    expect(options(s)).toEqual(["bar/20"]);
    const next = play(s, "bar/20");
    expect(options(next)).toEqual(["13/10", "20/17", "6/3"]);
    // Its 20 point is the first seat's 5 point.
    expect(cellOf(s, 1, 20)).toBe(cellOf(s, 0, 5));
    const v = backgammon.view(next, 1);
    expect(v.grids[0]!.cells[cellOf(s, 0, 5)]).toMatchObject({ owner: 1, tone: "dark", count: 1 });
  });

  it("counts the whole turns of positions worked out by hand", () => {
    // The opening position.
    const opening = (dice: number[]) => position({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 5 }, { dice });
    // 6-5: 24/18 13/8, 24/18 8/3, 24/13, 13/7 13/8, 13/7 8/3, 13/2 (three ways round), 8/2 8/3.
    expect(backgammonTurns(opening([6, 5]))).toHaveLength(7);
    // Double 6s: a six moves a back checker (two of them, once each), a midpoint checker (once
    // each) or one from the 8 point (three of them): 4 + 4 + 3 ways to share four sixes out.
    expect(backgammonTurns(opening([6, 6]))).toHaveLength(11);
    // Two checkers on the 6 and 5 with a 2-1: they end on 4 and 4, 5 and 3, or 6 and 2.
    const two = position({ 6: 1, 5: 1 }, HOME, { dice: [2, 1] });
    expect(backgammonTurns(two)).toHaveLength(3);
    expect(options(two)).toEqual(["5/3", "5/4", "6/4", "6/5"]);
    // A 6-6 takes them both off: one turn.
    expect(backgammonTurns(position({ 6: 1, 5: 1 }, HOME, { dice: [6, 6] }))).toHaveLength(1);
    // One checker and a 6-4 with nothing in the way: 13/3, whichever die goes first.
    expect(backgammonTurns(position({ 13: 1 }, HOME, { dice: [6, 4] }))).toHaveLength(1);
    // On the bar against a point: nothing.
    expect(backgammonTurns(position({ 25: 1 }, { 4: 2 }, { dice: [4, 4] }))).toHaveLength(0);
    // Every step a turn begins with is one the board offers, and the other way round.
    for (const s of [opening([6, 5]), opening([3, 1]), opening([2, 2]), two]) {
      const firsts = new Set(backgammonTurns(s).map((t) => `${t.steps[0]!.from}/${t.steps[0]!.to}`));
      for (const first of firsts) expect(backgammonSteps(s).some((o) => `${o.from}/${o.to}` === first)).toBe(true);
    }
  });
});

describe("hitting", () => {
  it("a blot that is landed on goes to the bar and has to come back in", () => {
    const s = position({ 13: 2, 6: 5 }, { 15: 1, 6: 5, 8: 3 }, { dice: [3, 1] });
    // Their 15 point is my 10.
    const hit = play(s, "13/10");
    expect(count(hit, 1, "bar")).toBe(1);
    expect(backgammon.view(hit, 0).grids[0]!.cells[cellOf(hit, 0, 10)]).toMatchObject({ owner: 0, count: 1 });
    expect(hit.steps.at(-1)).toMatchObject({ hit: true });
    expect(hit.narration).toBe("{0} plays 13/10*");
    expect(backgammonPips(hit, 1)).toBe(backgammonPips(s, 1) + 10);
    const v = backgammon.view(hit, 1);
    expect(v.grids[0]!.cells[v.grids[0]!.track!.bar![1]!]).toMatchObject({ owner: 1, count: 1 });
    // The checker that was hit is the same checker on the bar.
    expect(v.grids[0]!.cells[v.grids[0]!.track!.bar![1]!]!.ids).toEqual(backgammon.view(s, 1).grids[0]!.cells[cellOf(s, 1, 15)]!.ids);
    const theirs = apply(play(hit, "10/9"), 1, { type: "roll" });
    if (theirs.phase === "move") expect(options(theirs).every((o) => o.startsWith("bar/"))).toBe(true);
  });

  it("two checkers hold a point: it can't be landed on", () => {
    const s = position({ 13: 2, 6: 5 }, { 15: 2, 6: 5, 8: 3 }, { dice: [3, 1] });
    expect(options(s)).not.toContain("13/10");
    expect(() => play(s, "13/10")).toThrow(GameError);
  });
});

describe("taking moves back", () => {
  it("undoes this turn's steps, a hit included, and nothing else", () => {
    const s = position({ 13: 2, 6: 5 }, { 15: 1, 6: 5, 8: 3 }, { dice: [3, 1] });
    expect(() => apply(s, 0, { type: "undo" })).toThrow("There's nothing to take back.");
    expect(backgammon.view(s, 0).choices).toBeNull();
    const hit = play(s, "13/10");
    expect(backgammon.view(hit, 0).choices!.options.map((o) => o.move)).toEqual([{ type: "undo" }]);
    expect(backgammon.view(hit, 1).choices).toBeNull();
    expect(() => apply(hit, 1, { type: "undo" })).toThrow("It's not your turn.");
    const back = apply(hit, 0, { type: "undo" });
    expect(back.narration).toBe("{0} takes a move back");
    expect({ ...back, narration: null }).toEqual({ ...s, narration: null });
    // Without a Done press the turn is over with the last die, and can't be taken back.
    const done = play(hit, "10/9");
    expect([done.phase, done.turn]).toEqual(["roll", 1]);
    expect(() => apply(done, 0, { type: "undo" })).toThrow(GameError);
  });

  it("with Done on, the turn waits to be finished and can be taken back whole", () => {
    const s = position({ 13: 2, 6: 5 }, { 15: 1, 6: 5, 8: 3 }, { dice: [3, 1], rules: { confirm: true } });
    expect(() => apply(s, 0, { type: "confirm" })).toThrow("You still have dice to play.");
    const played = play(s, "13/10", "10/9");
    expect([played.phase, played.turn]).toEqual(["move", 0]);
    expect(backgammon.view(played, 0).choices!.options.map((o) => [o.label, o.move.type, !!o.primary])).toEqual([["Done", "confirm", true], ["Undo", "undo", false]]);
    expect(backgammon.view(played, 0).grids[0]!.select!.sources).toEqual([]);
    expect(() => play(played, "13/12")).toThrow("You have no more moves: finish your turn.");
    const back = apply(apply(played, 0, { type: "undo" }), 0, { type: "undo" });
    expect({ ...back, narration: null }).toEqual({ ...s, narration: null });
    const done = apply(played, 0, { type: "confirm" });
    expect([done.phase, done.turn, done.narration]).toEqual(["roll", 1, "{0} plays 13/10*, 10/9"]);
    expect(backgammon.bot(played, 0, {})).toEqual({ type: "confirm" });
  });
});

describe("winning", () => {
  const last = (theirs: Spots, rules: Partial<BackgammonRules> = {}) => play(position({ 1: 1 }, theirs, { dice: [6, 5], rules }), "1/off");

  it("a single game when the loser has borne a checker off", () => {
    const s = last({ 6: 5, 5: 5, 4: 4 });
    expect(s.result).toEqual({ winner: 0, kind: "single", dropped: false, jacoby: false, points: 1 });
    expect([s.phase, s.score]).toEqual(["finished", [1, 0]]);
    const v = backgammon.view(s, 1);
    expect(v.over).toEqual({ winners: [0], title: "{0} wins!" });
    expect(movesOffered(v)).toEqual([]);
    expect(backgammon.summary(s)).toMatchObject({ over: true, winners: [0], order: [0, 1], scoreLine: "1 to 0" });
  });

  it("a gammon when the loser has borne off none", () => {
    const s = last({ 6: 5, 5: 5, 4: 5 });
    expect(s.result).toMatchObject({ kind: "gammon", points: 2 });
    expect(backgammon.view(s, 0).over!.title).toBe("{0} wins a gammon: 2 points!");
    // One of theirs out in my outer board is still only a gammon.
    expect(last({ 18: 1, 6: 5, 5: 5, 4: 4 }).result).toMatchObject({ kind: "gammon", points: 2 });
  });

  it("a backgammon when the loser also has a checker on the bar or in the winner's home board", () => {
    expect(last({ 19: 1, 6: 5, 5: 5, 4: 4 }).result).toMatchObject({ kind: "backgammon", points: 3 });
    expect(last({ 25: 1, 6: 5, 5: 5, 4: 4 }).result).toMatchObject({ kind: "backgammon", points: 3 });
    // With a checker off it is a single game wherever the rest are.
    expect(last({ 25: 1, 24: 2, 6: 5, 5: 5, 4: 1 }).result).toMatchObject({ kind: "single", points: 1 });
  });

  it("the second seat wins the same way", () => {
    const s = play(position({ 1: 1 }, { 23: 2, 6: 5, 5: 5, 4: 3 }, { turn: 1, dice: [2, 1] }), "1/off");
    expect(s.result).toMatchObject({ winner: 1, kind: "backgammon", points: 3 });
    expect(backgammon.summary(s)).toMatchObject({ winners: [1], order: [1, 0], scoreLine: "0 to 3" });
  });
});

describe("the cube", () => {
  const money = { id: "backgammon-money" };

  it("isn't there in a friendly game", () => {
    const s = position({ 6: 5 }, HOME);
    expect(backgammon.view(s, 0).cube).toBeNull();
    expect(movesOffered(backgammon.view(s, 0))).toEqual([{ type: "roll" }]);
    expect(() => apply(s, 0, { type: "double" })).toThrow("There's no doubling cube in this game.");
  });

  it("is offered before rolling, and taken: the stakes double and it changes sides", () => {
    const s = position({ 6: 5 }, HOME, { rules: money });
    expect(backgammon.view(s, 0).cube).toEqual({ value: 1, owner: null, offered: null, dead: false });
    expect(movesOffered(backgammon.view(s, 0))).toEqual([{ type: "roll" }, { type: "double" }]);
    expect(() => apply(s, 1, { type: "double" })).toThrow("It's not your turn.");
    const offer = apply(s, 0, { type: "double" });
    expect(offer.phase).toBe("offer");
    // It is the other player's move now, and all they can do is answer.
    const [mine, theirs] = [backgammon.view(offer, 0), backgammon.view(offer, 1)];
    expect([mine.turn, theirs.turn]).toEqual([1, 1]);
    expect(mine.cube).toEqual({ value: 1, owner: null, offered: 0, dead: false });
    expect(movesOffered(mine)).toEqual([]);
    expect(movesOffered(theirs)).toEqual([{ type: "take" }, { type: "drop" }]);
    expect(theirs.narration).toBe("{0} is doubling to 2");
    expect(() => apply(offer, 0, { type: "roll" })).toThrow("Waiting for an answer to the double.");
    expect(() => apply(offer, 0, { type: "take" })).toThrow("The double isn't yours to answer.");
    expect(() => apply(offer, 1, { type: "roll" })).toThrow("Take the double or drop it.");

    const taken = apply(offer, 1, { type: "take" });
    expect(taken.cube).toEqual({ value: 2, owner: 1, turned: true });
    expect([taken.phase, taken.turn]).toEqual(["roll", 0]);
    expect(backgammon.view(taken, 0).cube).toEqual({ value: 2, owner: 1, offered: null, dead: false });
    // The doubler rolls; the cube is the other side's now, so only they can double next.
    expect(movesOffered(backgammon.view(taken, 0))).toEqual([{ type: "roll" }]);
    expect(() => apply(taken, 0, { type: "double" })).toThrow("The cube is on the other side: only they can double.");
    const theirTurn = { ...taken, turn: 1 };
    expect(movesOffered(backgammon.view(theirTurn, 1))).toEqual([{ type: "roll" }, { type: "double" }]);
    const again = apply(apply(theirTurn, 1, { type: "double" }), 0, { type: "take" });
    expect(again.cube).toEqual({ value: 4, owner: 0, turned: true });
    // Once the dice are rolled it is too late to double.
    const rolledState = position({ 6: 5 }, HOME, { rules: money, dice: [2, 1] });
    expect(() => apply(rolledState, 0, { type: "double" })).toThrow("You can only double before you roll.");
  });

  it("dropped: the doubler wins what the game stood at", () => {
    const s = { ...position({ 24: 2, 6: 5 }, HOME, { rules: money }), cube: { value: 2, owner: 0, turned: true } };
    const dropped = apply(apply(s, 0, { type: "double" }), 1, { type: "drop" });
    expect(dropped.result).toEqual({ winner: 0, kind: "single", dropped: true, jacoby: false, points: 2 });
    expect([dropped.phase, dropped.score]).toEqual(["finished", [2, 0]]);
    expect(dropped.narration).toBe("{1} passes on the double: {0} wins (2 points)");
    expect(backgammon.view(dropped, 1).over).toEqual({ winners: [0], title: "{0} wins: 2 points!" });
  });

  it("Jacoby: a gammon only counts once the cube has been turned", () => {
    const gammon = (cube: BackgammonState["cube"], rules: Partial<BackgammonRules>) => play({ ...position({ 1: 1 }, { 6: 5, 5: 5, 4: 5 }, { dice: [6, 5], rules }), cube }, "1/off");
    const unturned = gammon({ value: 1, owner: null, turned: false }, money);
    expect(unturned.result).toEqual({ winner: 0, kind: "gammon", dropped: false, jacoby: true, points: 1 });
    expect(unturned.narration).toBe("{0} wins a gammon with the last checker off (1 point: the cube was never turned)");
    expect(gammon({ value: 2, owner: 1, turned: true }, money).result).toMatchObject({ kind: "gammon", jacoby: false, points: 4 });
    // An automatic double isn't a turn of the cube.
    expect(gammon({ value: 2, owner: null, turned: false }, { ...money, autoDoubles: true }).result).toMatchObject({ jacoby: true, points: 2 });
    // Without the rule a gammon is a gammon.
    expect(gammon({ value: 1, owner: null, turned: false }, { ...money, jacoby: false }).result).toMatchObject({ jacoby: false, points: 2 });
    expect(backgammon.view(position({ 6: 5 }, HOME, { rules: money }), 0).info).toEqual(["Jacoby rule: gammons count once the cube is turned"]);
  });

  it("the rules that go with the cube and with a match keep to their own kind of game", () => {
    expect(backgammon.normalize({ id: "backgammon-friendly", crawford: true, jacoby: true, autoDoubles: true })).toMatchObject({ cube: false, crawford: false, jacoby: false, autoDoubles: false });
    expect(backgammon.normalize({ id: "backgammon-match5", jacoby: true, autoDoubles: true })).toMatchObject({ match: 5, cube: true, crawford: true, jacoby: false, autoDoubles: false });
    expect(backgammon.normalize({ id: "backgammon-money", crawford: true, match: 4 })).toMatchObject({ match: 0, crawford: false, jacoby: true });
    expect(backgammon.presets.map((p) => p.id)).toEqual(["backgammon-friendly", "backgammon-money", "backgammon-match3", "backgammon-match5", "backgammon-match7", "backgammon-nack"]);
  });
});

describe("a match", () => {
  const match3 = { id: "backgammon-match3" };
  /** Seat `winner` bears off its last checker: a single game at whatever the cube says. */
  const winGame = (s: BackgammonState, winner: number): BackgammonState => {
    const set = position({ 1: 1 }, { 6: 5, 5: 5, 4: 4 }, { turn: winner, dice: [6, 5] });
    return play({ ...s, stacks: set.stacks, home: set.home, phase: "move", turn: winner, dice: set.dice, used: set.used, thrower: set.thrower, steps: [] }, "1/off");
  };
  const nextGame = (s: BackgammonState) => apply(apply(s, 0, { type: "next" }), 1, { type: "next" });

  it("carries the score across games, with a new opening roll each game", () => {
    let s = winGame(fresh(match3), 1);
    expect([s.phase, s.score, s.round]).toEqual(["scored", [0, 1], 1]);
    const v = backgammon.view(s, 0);
    expect(v.result).toMatchObject({ title: "{1} wins game 1: a single game", rows: [{ label: "Game 1", values: ["", "+1"] }, { label: "Match to 3", values: ["0", "1"], tone: "total" }] });
    expect(v.over).toBeNull();
    expect(movesOffered(v)).toEqual([{ type: "next" }]);
    expect(() => apply(s, 0, { type: "roll" })).toThrow("This game is over.");
    // Both move on before the next game is set out.
    const one = apply(s, 0, { type: "next" });
    expect([one.phase, one.round]).toEqual(["scored", 1]);
    expect(() => apply(one, 0, { type: "next" })).toThrow(GameError);
    s = apply(one, 1, { type: "next" });
    expect([s.phase, s.round, s.score, s.crawford]).toEqual(["opening", 2, [0, 1], false]);
    expect([24, 13, 8, 6].map((p) => count(s, 0, p))).toEqual([2, 5, 3, 5]);
    expect(s.cube).toEqual({ value: 1, owner: null, turned: false });
    expect(backgammon.view(s, 0).players.map((p) => p.line)).toEqual(["167 pips · 0 of 3", "167 pips · 1 of 3"]);
    expect(backgammon.view(s, 0).info).toEqual(["Match to 3 · game 2"]);
    expect(backgammon.summary(s)).toMatchObject({ over: false, hand: 2, scoreLine: "0 to 1", winners: null });
  });

  it("Crawford: no doubling in the game after someone gets within a point, and only that game", () => {
    // The second seat wins two games running: 2-0 in a match to 3.
    let s = nextGame(winGame(fresh(match3), 1));
    expect(s.crawford).toBe(false);
    s = nextGame(winGame(s, 1));
    expect([s.score, s.crawford, s.crawfordDone]).toEqual([[0, 2], true, true]);
    const rolling = { ...s, phase: "roll" as const, turn: 0 };
    expect(backgammon.view(rolling, 0).cube).toEqual({ value: 1, owner: null, offered: null, dead: true });
    expect(backgammon.view(rolling, 0).info).toEqual(["Match to 3 · game 3", "The Crawford game: no doubling"]);
    expect(movesOffered(backgammon.view(rolling, 0))).toEqual([{ type: "roll" }]);
    expect(() => apply(rolling, 0, { type: "double" })).toThrow("No doubling in the Crawford game.");
    expect(backgammon.bot(rolling, 0, { skill: 1 })).toEqual({ type: "roll" });
    // The trailer wins the Crawford game: the game after it, the cube is back.
    s = nextGame(winGame(s, 0));
    expect([s.score, s.crawford, s.crawfordDone, s.round]).toEqual([[1, 2], false, true, 4]);
    const after = { ...s, phase: "roll" as const, turn: 0 };
    expect(movesOffered(backgammon.view(after, 0))).toEqual([{ type: "roll" }, { type: "double" }]);
    // With nothing to lose the one behind doubles at once; in an even position the leader takes.
    expect(backgammon.bot(after, 0, { skill: 1 })).toEqual({ type: "double" });
    const offer = apply(after, 0, { type: "double" });
    expect(backgammon.bot(offer, 1, { skill: 1 })).toEqual({ type: "take" });
    const taken = apply(offer, 1, { type: "take" });
    // The leader needs one point: a cube on 2 is no use to them.
    expect(backgammon.bot({ ...taken, turn: 1 }, 1, { skill: 1 })).toEqual({ type: "roll" });
    // 1-2 with the cube on 2: whoever wins this game wins the match.
    const won = winGame(taken, 0);
    expect([won.phase, won.score, won.result!.points]).toEqual(["finished", [3, 2], 2]);
    expect(backgammon.view(won, 1).over).toEqual({ winners: [0], title: "{0} wins the match 3 to 2!" });
    expect(backgammon.view(won, 1).result!.rows).toEqual([{ label: "Game 4", values: ["+2", ""] }, { label: "Match to 3", values: ["3", "2"], tone: "total" }]);
    expect(backgammon.summary(won)).toMatchObject({ over: true, winners: [0], order: [0, 1], scoreLine: "3 to 2", hand: 4 });
  });

  it("a match without the Crawford rule never takes the cube away", () => {
    let s = nextGame(winGame(fresh({ ...match3, crawford: false }), 1));
    s = nextGame(winGame(s, 1));
    expect([s.score, s.crawford]).toEqual([[0, 2], false]);
    expect(movesOffered(backgammon.view({ ...s, phase: "roll", turn: 0 }, 0))).toEqual([{ type: "roll" }, { type: "double" }]);
  });

  it("a gammon with the cube turned can win a match in one game", () => {
    const s = play({ ...position({ 1: 1 }, { 6: 5, 5: 5, 4: 5 }, { dice: [6, 5], rules: { id: "backgammon-match7" } }), cube: { value: 4, owner: 1, turned: true } }, "1/off");
    expect([s.phase, s.score, s.result!.points]).toEqual(["finished", [8, 0], 8]);
  });

  it("computer players play a whole match to the end, cube and all", () => {
    for (const seed of [3, 11]) {
      let s = fresh({ id: "backgammon-match5" }, seed);
      const seen = new Set<string>();
      for (let n = 0; s.phase !== "finished"; n++) {
        if (n > 6000) throw new Error("the match went on too long");
        const seat = [0, 1].find((o) => backgammon.bot(s, o, { skill: 1 }))!;
        const move = backgammon.bot(s, seat, { skill: 1 })!;
        seen.add(move.type);
        s = apply(s, seat, move);
        expect(s.score.every((v) => v >= 0)).toBe(true);
      }
      expect(Math.max(...s.score)).toBeGreaterThanOrEqual(5);
      expect(s.score[s.result!.winner]).toBe(Math.max(...s.score));
      expect([...seen]).toEqual(expect.arrayContaining(["roll", "move", "next"]));
    }
  }, 60_000);
});

describe("what a seat sees", () => {
  it("stacks, the last move, pip counts and whose dice they are", () => {
    const s = play(position({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 5 }, { dice: [3, 1] }), "8/5", "6/5");
    const roll = apply(s, 1, { type: "roll" });
    for (const seat of [0, 1]) {
      const v = backgammon.view(roll, seat);
      const g = v.grids[0]!;
      expect(g.cells[cellOf(s, 0, 5)]).toMatchObject({ owner: 0, kind: "checker", tone: "light", count: 2, label: "light checker" });
      expect(g.cells[cellOf(s, 0, 5)]!.ids).toHaveLength(2);
      // The turn before is marked until this one makes a move.
      expect(g.marks).toEqual(expect.arrayContaining([{ cell: cellOf(s, 0, 8), mark: "from" }, { cell: cellOf(s, 0, 5), mark: "last" }]));
      expect(v.players.map((p) => p.line)).toEqual(["163 pips", "167 pips"]);
      expect(v.dice!.dice.every((d) => d.owner === 1 && !d.used)).toBe(true);
      expect(v.turn).toBe(1);
      // Only the player with the dice is offered anything.
      expect(movesOffered(v).length > 0).toBe(seat === 1);
    }
    // Every checker keeps its id from move to move.
    const ids = (state: BackgammonState) => backgammon.view(state, 0).grids[0]!.cells.flatMap((p) => p?.ids ?? []).sort();
    expect(ids(roll)).toEqual(ids(fresh()));
    expect(new Set(ids(roll)).size).toBe(30);
  });

  it("one tap moves is a table rule the board is told about", () => {
    const quick = position({ 13: 1 }, HOME, { dice: [6, 4], rules: { quick: true } });
    expect(backgammon.view(quick, 0).grids[0]!.select).toMatchObject({ type: "move", quick: true });
    expect(backgammon.view(position({ 13: 1 }, HOME, { dice: [6, 4] }), 0).grids[0]!.select).toMatchObject({ quick: false });
  });

  it("refuses what isn't a move, and never changes the state it is given", () => {
    const s = position({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 5 }, { dice: [3, 1] });
    const before = JSON.stringify(s);
    for (const junk of [null, {}, { type: "nonsense" }, { type: "move" }, { type: "move", from: -1, to: 3 }, { type: "move", from: "x", to: "y" }, { type: "move", from: 13, to: 1e9 }, { type: "move", from: cellOf(s, 0, "off"), to: 3 }, { type: "roll" }, { type: "confirm" }, { type: "take" }]) {
      expect(() => apply(s, 0, junk as BackgammonMove), JSON.stringify(junk)).toThrow(GameError);
    }
    // Their checker isn't mine to move.
    expect(() => apply(s, 0, { type: "move", from: cellOf(s, 1, 6), to: cellOf(s, 1, 5) })).toThrow("That's not your checker.");
    expect(() => apply(s, 1, { type: "move", from: cellOf(s, 1, 6), to: cellOf(s, 1, 5) })).toThrow("It's not your turn.");
    for (const o of backgammonSteps(s)) apply(s, 0, { type: "move", from: o.from, to: o.to });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("the computer players", () => {
  const sharp = { skill: 1, sloppy: 0 };
  /** Play the turn out with one computer player and say what it played, as "13/7, 8/7". */
  function turnOf(s: BackgammonState, style = sharp): string {
    const seat = s.turn;
    while (s.phase === "move" && s.turn === seat) s = apply(s, seat, backgammon.bot(s, seat, style)!);
    const point = (place: number | null) => (place === null ? "off" : (seat === 0 ? place : 25 - place) === 25 ? "bar" : String(seat === 0 ? place : 25 - place));
    return s.last.map((st) => `${point(st.from)}/${point(st.to)}${st.hit ? "*" : ""}`).join(", ");
  }

  it("gives the same answer each time it is asked, and one the board offers", () => {
    const s = position({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 5 }, { dice: [4, 2] });
    for (const style of [sharp, { skill: 0.65, sloppy: 0.06 }, { skill: 0.25, sloppy: 0.3 }, {}]) {
      const move = backgammon.bot(s, 0, style);
      expect(backgammon.bot(s, 0, style)).toEqual(move);
      expect(movesOffered(backgammon.view(s, 0))).toContainEqual(move);
    }
    expect(backgammon.bot(s, 1, sharp)).toBeNull();
  });

  it("makes its points with the opening rolls everybody knows", () => {
    const opening = (dice: number[]) => position({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 5 }, { dice });
    expect(turnOf(opening([3, 1])).split(", ").sort()).toEqual(["6/5", "8/5"]);
    expect(turnOf(opening([4, 2])).split(", ").sort()).toEqual(["6/4", "8/4"]);
    expect(turnOf(opening([6, 1])).split(", ").sort()).toEqual(["13/7", "8/7"]);
    expect(turnOf(opening([5, 3])).split(", ").sort()).toEqual(["6/3", "8/3"]);
  });

  it("hits a blot in its home board when it can shut the checker out", () => {
    const hit = position({ 6: 3, 5: 3, 4: 3, 3: 3, 8: 3 }, { 23: 1, 6: 3, 5: 3, 4: 3, 3: 3, 2: 2 }, { dice: [4, 1] });
    expect(turnOf(hit)).toContain("*");
  });

  it("bears off as fast as it can in a race", () => {
    expect(turnOf(position({ 6: 2, 5: 2, 2: 2 }, HOME, { dice: [6, 5] })).split(", ").sort()).toEqual(["5/off", "6/off"]);
    expect(turnOf(position({ 3: 1, 2: 1 }, HOME, { dice: [3, 2] })).split(", ").sort()).toEqual(["2/off", "3/off"]);
  });

  it("doubles a race it is well ahead in, and holds the cube in one that is close or lost", () => {
    const race = (mine: Spots, theirs: Spots) => position(mine, theirs, { rules: { id: "backgammon-money" } });
    const even: Spots = { 6: 5, 5: 4, 4: 3, 3: 3 };
    const ahead: Spots = { 6: 3, 5: 3, 4: 3, 3: 3, 2: 3 };
    const behind: Spots = { 10: 3, 8: 3, 6: 5, 5: 4 };
    expect(backgammon.bot(race(ahead, even), 0, sharp)).toEqual({ type: "double" });
    expect(backgammon.bot(race(even, even), 0, sharp)).toEqual({ type: "roll" });
    expect(backgammon.bot(race(behind, even), 0, sharp)).toEqual({ type: "roll" });
    // Offered a double: taken in a close race, dropped a long way behind.
    const offered = (mine: Spots, theirs: Spots) => apply(race(mine, theirs), 0, { type: "double" });
    expect(backgammon.bot(offered(even, even), 1, sharp)).toEqual({ type: "take" });
    expect(backgammon.bot(offered(ahead, behind), 1, sharp)).toEqual({ type: "drop" });
    // The player who offered waits for the answer.
    expect(backgammon.bot(offered(even, even), 0, sharp)).toBeNull();
  });

  it("thinks for well under a quarter of a second a turn at its sharpest", () => {
    let slowest = 0;
    for (const seed of [5, 6]) {
      let s = fresh({ id: "backgammon-money" }, seed);
      for (let n = 0; s.phase !== "finished"; n++) {
        if (n > 3000) throw new Error("the game went on too long");
        const seat = [0, 1].find((o) => backgammon.bot(s, o, sharp))!;
        const t0 = performance.now();
        const move = backgammon.bot(s, seat, sharp)!;
        slowest = Math.max(slowest, performance.now() - t0);
        s = apply(s, seat, move);
      }
    }
    expect(slowest).toBeLessThan(250);
  }, 60_000);
});
