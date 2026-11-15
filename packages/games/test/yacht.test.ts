import { describe, expect, it } from "vitest";
import { classicYacht, GameError, movesOffered, newYacht, quickYacht, shotzee, yacht, YACHT_BONUS, yachtBoxes, yachtOptions, yachtPlan, yachtScore, yachtTotal, yatzyYacht, type BoardView, type YachtMove, type YachtRules, type YachtState } from "../src/index.js";

const g = yacht;
const SHARP = { skill: 1, sloppy: 0 };
const CARELESS = { skill: 0.3, sloppy: 0.3 };
const start = (rules: Partial<YachtRules> = {}, seats = 2, seed = 1) => newYacht(g.normalize({ ...classicYacht, ...rules }), seats, seed);
/** Whose go it is: the seat whose turn it is, or (everyone at once) the first seat that still owes a move. */
const mover = (s: YachtState) => Array.from({ length: s.seats }, (_, i) => i).find((seat) => g.bot(s, seat, SHARP) !== null)!;
/** The same game with these dice in the mover's hand, as if just rolled (`rolls` of the three used). */
function withDice(s: YachtState, dice: number[], rolls = 1, seat = mover(s)): YachtState {
  const next = structuredClone(s);
  const hand = next.hands[next.rules.order === "together" ? seat : 0]!;
  hand.dice = dice;
  hand.rolls = rolls;
  hand.held = dice.map(() => false);
  return next;
}
/** The same game with some of a seat's boxes filled in. */
function withBoxes(s: YachtState, seat: number, filled: Record<string, number>): YachtState {
  const next = structuredClone(s);
  yachtBoxes(s.rules).forEach((b, i) => {
    if (b.id in filled) next.sheets[seat]![i] = filled[b.id]!;
  });
  return next;
}
const score = (s: YachtState, seat: number, cell: string) => g.apply(s, seat, { type: "score", cell });
const roll = (s: YachtState, seat = mover(s)) => g.apply(s, seat, { type: "roll" });
const hold = (s: YachtState, die: number, seat = mover(s)) => g.apply(s, seat, { type: "hold", die });
const refused = (fn: () => unknown, message?: RegExp) => {
  expect(fn).toThrow(GameError);
  if (message) expect(fn).toThrow(message);
};
/** A seat's sheet from its view, as { column label: cell }. */
const cellsOf = (v: BoardView, seat: number) => Object.fromEntries(v.sheet!.columns.map((c, i) => [c.label, v.sheet!.rows.find((r) => r.seat === seat)!.cells[i]]));
const picksOf = (v: BoardView) => Object.fromEntries((v.sheet!.pick?.cells ?? []).map((c) => [v.sheet!.columns[c.column]!.id, Number(c.would)]));
/** A game played to the end by the computer players, checking each view on the way. */
function playOut(rules: Partial<YachtRules>, seats: number, seed: number, style = SHARP) {
  let s = start(rules, seats, seed);
  for (let moves = 0; s.phase !== "finished"; moves++) {
    if (moves > 5000) throw new Error("the game went on too long");
    const seat = mover(s);
    const move = g.bot(s, seat, style)!;
    expect(movesOffered(g.view(s, seat)).some((m) => JSON.stringify(m) === JSON.stringify(move)), JSON.stringify(move)).toBe(true);
    s = g.apply(s, seat, move);
  }
  return s;
}

describe("the classic sheet", () => {
  const sc = (box: string, dice: number[]) => yachtScore(classicYacht, box, dice);

  it("has thirteen boxes: six numbers, then the hands", () => {
    expect(yachtBoxes(classicYacht).map((b) => b.id)).toEqual(["ones", "twos", "threes", "fours", "fives", "sixes", "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "yacht", "chance"]);
  });

  it("the top half adds up the dice of one number", () => {
    const dice = [1, 1, 3, 6, 6];
    expect(["ones", "twos", "threes", "fours", "fives", "sixes"].map((box) => sc(box, dice))).toEqual([2, 0, 3, 0, 0, 12]);
    expect(sc("fives", [5, 5, 5, 5, 5])).toBe(25);
  });

  it("three and four of a kind add up all five dice", () => {
    expect(sc("threeKind", [4, 4, 4, 2, 6])).toBe(20);
    expect(sc("threeKind", [4, 4, 2, 2, 6])).toBe(0);
    expect(sc("threeKind", [3, 3, 3, 3, 3])).toBe(15);
    expect(sc("fourKind", [4, 4, 4, 4, 6])).toBe(22);
    expect(sc("fourKind", [4, 4, 4, 2, 6])).toBe(0);
    expect(sc("fourKind", [2, 2, 2, 2, 2])).toBe(10);
  });

  it("a full house is three of one and two of another, for 25", () => {
    expect(sc("fullHouse", [3, 3, 3, 5, 5])).toBe(25);
    expect(sc("fullHouse", [5, 3, 5, 3, 3])).toBe(25);
    expect(sc("fullHouse", [3, 3, 3, 3, 5])).toBe(0);
    expect(sc("fullHouse", [3, 3, 5, 5, 6])).toBe(0);
    // Five of a kind isn't a full house by itself (as a joker it is: see below).
    expect(sc("fullHouse", [3, 3, 3, 3, 3])).toBe(0);
  });

  it("a small straight is four in a row for 30, a large straight five for 40", () => {
    for (const dice of [[1, 2, 3, 4, 6], [2, 3, 4, 5, 5], [3, 4, 5, 6, 1], [6, 5, 4, 3, 3], [1, 2, 3, 4, 5]]) expect(sc("smallStraight", dice), String(dice)).toBe(30);
    for (const dice of [[1, 2, 3, 5, 6], [1, 2, 4, 5, 6], [1, 1, 2, 3, 3]]) expect(sc("smallStraight", dice), String(dice)).toBe(0);
    expect(sc("largeStraight", [1, 2, 3, 4, 5])).toBe(40);
    expect(sc("largeStraight", [6, 2, 4, 3, 5])).toBe(40);
    expect(sc("largeStraight", [1, 2, 3, 4, 6])).toBe(0);
  });

  it("five of a kind is 50, and Chance is whatever the dice add up to", () => {
    expect(sc("yacht", [6, 6, 6, 6, 6])).toBe(50);
    expect(sc("yacht", [1, 1, 1, 1, 1])).toBe(50);
    expect(sc("yacht", [6, 6, 6, 6, 5])).toBe(0);
    expect(sc("chance", [6, 6, 6, 6, 5])).toBe(29);
    expect(sc("chance", [1, 1, 2, 1, 1])).toBe(6);
  });

  it("63 or more in the top half earns 35, and not a point less does", () => {
    const three = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15 };
    const short = withBoxes(start(), 0, { ...three, sixes: 12 });
    const made = withBoxes(start(), 0, { ...three, sixes: 18 });
    const over = withBoxes(start(), 0, { ...three, sixes: 24 });
    expect([yachtTotal(short, 0), yachtTotal(made, 0), yachtTotal(over, 0)]).toEqual([57, 63 + 35, 69 + 35]);
    // The sheet shows how far along the top half is until the bonus is won or lost.
    expect(cellsOf(g.view(withBoxes(start(), 0, three), 0), 0).Bonus).toBe("45/63");
    expect(cellsOf(g.view(short, 0), 0).Bonus).toBe("0");
    expect(cellsOf(g.view(made, 0), 0).Bonus).toBe("35");
    expect(g.view(made, 1).sheet!.rows.map((r) => r.total)).toEqual(["98", "0"]);
    // The bonus is worked out, not filled in: its column has no id and can't be chosen.
    expect(g.view(made, 0).sheet!.columns.find((c) => c.label === "Bonus")).toMatchObject({ kind: "sum", sub: "35 for 63 or more" });
  });
});

describe("extra Yachts and the joker", () => {
  /** Seat 0 to play, with the Yacht box already holding `yachtBox`, and five fours just rolled. */
  const fours = (filled: Record<string, number>, rules: Partial<YachtRules> = {}) => {
    let s = start({ ...rules });
    s = { ...s, turn: 0, first: 0 };
    return withDice(withBoxes(s, 0, filled), [4, 4, 4, 4, 4], 3, 0);
  };
  const lowerFull = { threeKind: 20, fourKind: 20, fullHouse: 25, smallStraight: 30, largeStraight: 40, chance: 20 };

  it("the first one is just 50 in the Yacht box", () => {
    const s = fours({});
    expect(picksOf(g.view(s, 0))).toMatchObject({ yacht: 50, fours: 20, fullHouse: 0, largeStraight: 0, threeKind: 20, fourKind: 20, chance: 20 });
    const next = score(s, 0, "yacht");
    expect([yachtTotal(next, 0), next.extra[0]]).toEqual([50, 0]);
  });

  it("another one has to go in its own number while that box is empty, and pays 100 on top", () => {
    const s = fours({ yacht: 50 });
    expect(picksOf(g.view(s, 0))).toEqual({ fours: 20 });
    expect(yachtOptions(s, 0)).toEqual([{ box: "fours", score: 20 }]);
    refused(() => score(s, 0, "fullHouse"), /has to go in your Fours/);
    const next = score(s, 0, "fours");
    expect([next.extra[0], yachtTotal(next, 0)]).toEqual([1, 50 + 20 + YACHT_BONUS]);
    expect(next.narration).toBe("{0} scores 20 in Fours, and 100 for another Yacht");
    // The bonus has a line of its own on the sheet.
    expect(cellsOf(g.view(next, 1), 0)["Yacht bonus"]).toBe("100");
    expect(cellsOf(g.view(next, 1), 1)["Yacht bonus"]).toBe("");
  });

  it("with its own number filled it goes anywhere in the bottom half, as a full house or a straight if need be", () => {
    const s = fours({ yacht: 50, fours: 12 });
    expect(picksOf(g.view(s, 0))).toEqual({ threeKind: 20, fourKind: 20, fullHouse: 25, smallStraight: 30, largeStraight: 40, chance: 20 });
    refused(() => score(s, 0, "ones"), /bottom half/);
    const next = score(s, 0, "largeStraight");
    expect([next.sheets[0]![10], next.extra[0], yachtTotal(next, 0)]).toEqual([40, 1, 50 + 12 + 40 + 100]);
  });

  it("with the bottom half full it has to be thrown away in the top half", () => {
    const s = fours({ yacht: 50, fours: 12, ...lowerFull });
    expect(picksOf(g.view(s, 0))).toEqual({ ones: 0, twos: 0, threes: 0, fives: 0, sixes: 0 });
    const next = score(s, 0, "sixes");
    // The bonus still comes.
    expect([next.sheets[0]![5], next.extra[0]]).toEqual([0, 1]);
  });

  it("a scratched Yacht box still makes it a joker, but there is no bonus", () => {
    const s = fours({ yacht: 0, fours: 12 });
    expect(picksOf(g.view(s, 0))).toMatchObject({ fullHouse: 25, smallStraight: 30, largeStraight: 40 });
    const next = score(s, 0, "fullHouse");
    expect([next.extra[0], yachtTotal(next, 0)]).toEqual([0, 12 + 25]);
    expect(next.narration).toBe("{0} scores 25 in Full house");
  });

  it("each extra one pays again", () => {
    let s = score(fours({ yacht: 50 }), 0, "fours");
    s = withDice({ ...s, turn: 0 }, [2, 2, 2, 2, 2], 1, 0);
    s = score(s, 0, "twos");
    expect([s.extra[0], yachtTotal(s, 0)]).toEqual([2, 50 + 20 + 10 + 200]);
    expect(g.view(s, 0).result).toBeNull();
  });

  it("with the rule switched off a second one is nothing special", () => {
    const s = fours({ yacht: 50, fours: 12 }, { bonus: false });
    expect(picksOf(g.view(s, 0))).toMatchObject({ ones: 0, fullHouse: 0, smallStraight: 0, largeStraight: 0, threeKind: 20, chance: 20 });
    const next = score(s, 0, "threeKind");
    expect([next.extra[0], yachtTotal(next, 0)]).toEqual([0, 82]);
    expect(g.view(s, 0).sheet!.columns.some((c) => c.label === "Yacht bonus")).toBe(false);
  });

  it("the Quick sheet has no top half: the joker goes anywhere", () => {
    const s = fours({ yacht: 50 }, { ...quickYacht });
    expect(picksOf(g.view(s, 0))).toEqual({ threeKind: 20, fourKind: 20, fullHouse: 25, smallStraight: 30, largeStraight: 40, chance: 20 });
    expect(yachtTotal(score(s, 0, "smallStraight"), 0)).toBe(180);
  });
});

describe("the Yatzy sheet", () => {
  const sc = (box: string, dice: number[]) => yachtScore(yatzyYacht, box, dice);

  it("has fifteen boxes, with pairs, and the straights each a set of numbers", () => {
    expect(yachtBoxes(yatzyYacht).map((b) => b.id)).toEqual(["ones", "twos", "threes", "fours", "fives", "sixes", "pair", "twoPairs", "threeKind", "fourKind", "smallStraight", "largeStraight", "fullHouse", "chance", "yacht"]);
    expect(g.view(start(yatzyYacht), 0).sheet!.columns.at(-1)).toMatchObject({ id: "yacht", label: "Yatzy" });
  });

  it("the top half is the same", () => {
    expect(["ones", "twos", "threes", "fours", "fives", "sixes"].map((box) => sc(box, [2, 2, 5, 5, 5]))).toEqual([0, 4, 0, 0, 15, 0]);
  });

  it("a pair scores the pair, the highest one there is", () => {
    expect(sc("pair", [3, 3, 5, 5, 6])).toBe(10);
    expect(sc("pair", [6, 6, 6, 1, 2])).toBe(12);
    expect(sc("pair", [1, 2, 3, 4, 6])).toBe(0);
  });

  it("two pairs are two different pairs, and score both", () => {
    expect(sc("twoPairs", [3, 3, 5, 5, 6])).toBe(16);
    expect(sc("twoPairs", [3, 3, 3, 5, 5])).toBe(16);
    expect(sc("twoPairs", [3, 3, 5, 6, 1])).toBe(0);
    // Four of a kind is one number twice over, not two pairs.
    expect(sc("twoPairs", [4, 4, 4, 4, 6])).toBe(0);
  });

  it("three and four of a kind score only the dice that make them", () => {
    expect(sc("threeKind", [4, 4, 4, 2, 6])).toBe(12);
    expect(sc("threeKind", [4, 4, 2, 2, 6])).toBe(0);
    expect(sc("fourKind", [4, 4, 4, 4, 6])).toBe(16);
    expect(sc("fourKind", [6, 6, 6, 6, 6])).toBe(24);
    expect(sc("fourKind", [4, 4, 4, 2, 6])).toBe(0);
  });

  it("the small straight is 1 to 5 for 15 and the large one 2 to 6 for 20", () => {
    expect(sc("smallStraight", [5, 4, 3, 2, 1])).toBe(15);
    expect(sc("smallStraight", [2, 3, 4, 5, 6])).toBe(0);
    expect(sc("smallStraight", [1, 2, 3, 4, 4])).toBe(0);
    expect(sc("largeStraight", [2, 3, 4, 5, 6])).toBe(20);
    expect(sc("largeStraight", [1, 2, 3, 4, 5])).toBe(0);
  });

  it("a full house scores its dice, Chance scores everything, and Yatzy is 50", () => {
    expect(sc("fullHouse", [6, 6, 6, 5, 5])).toBe(28);
    expect(sc("fullHouse", [1, 1, 2, 2, 2])).toBe(8);
    expect(sc("fullHouse", [6, 6, 6, 6, 6])).toBe(0);
    expect(sc("fullHouse", [6, 6, 5, 5, 1])).toBe(0);
    expect(sc("chance", [6, 6, 5, 5, 1])).toBe(23);
    expect(sc("yacht", [3, 3, 3, 3, 3])).toBe(50);
    expect(sc("yacht", [3, 3, 3, 3, 1])).toBe(0);
  });

  it("the top half's bonus is 50, and there are no jokers", () => {
    const three = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    expect(yachtTotal(withBoxes(start(yatzyYacht), 0, three), 0)).toBe(113);
    expect(yachtTotal(withBoxes(start(yatzyYacht), 0, { ...three, ones: 2 }), 0)).toBe(62);
    // Asking for extra Yatzys with this sheet gets you the sheet as it is.
    expect(g.normalize({ ...yatzyYacht, bonus: true }).bonus).toBe(false);
    const s = withDice(withBoxes({ ...start(yatzyYacht), turn: 0, first: 0 }, 0, { yacht: 50, fours: 12 }), [4, 4, 4, 4, 4], 3, 0);
    expect(picksOf(g.view(s, 0))).toMatchObject({ ones: 0, pair: 8, twoPairs: 0, threeKind: 12, fourKind: 16, fullHouse: 0, largeStraight: 0, chance: 20 });
    expect(score(s, 0, "fourKind").extra[0]).toBe(0);
  });
});

describe("the Quick sheet", () => {
  it("is the bottom seven boxes, with no bonus for a top half it hasn't got", () => {
    expect(yachtBoxes(quickYacht).map((b) => b.id)).toEqual(["threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "yacht", "chance"]);
    const v = g.view(start(quickYacht), 0);
    expect(v.sheet!.columns.map((c) => c.label)).toEqual(["Three of a kind", "Four of a kind", "Full house", "Small straight", "Large straight", "Yacht", "Chance", "Yacht bonus"]);
    expect(v.info).toContain("Round 1 of 7");
    expect(yachtScore(quickYacht, "fullHouse", [2, 2, 3, 3, 3])).toBe(25);
    const done = playOut(quickYacht, 2, 3);
    expect(done.round).toBe(7);
    expect(g.view(done, 0).result!.rows.map((r) => r.label)).toContain("Total");
  });
});

describe("a turn", () => {
  it("starts with nothing rolled: five blank dice and one thing to do", () => {
    const s = start();
    const seat = s.turn;
    const v = g.view(s, seat);
    expect(v.grids).toEqual([]);
    expect(v.dice).toEqual({ dice: [0, 1, 2, 3, 4].map((id) => ({ id, value: null, held: false, used: false })), roll: 0, sides: 6, tap: null });
    expect(movesOffered(v)).toEqual([{ type: "roll" }]);
    expect(v.choices!.options[0]).toMatchObject({ label: "Roll the dice", primary: true });
    expect(v.sheet!.pick).toBeNull();
    // Nobody else has anything to do.
    const other = g.view(s, 1 - seat);
    expect([other.turn, movesOffered(other)]).toEqual([seat, []]);
    refused(() => hold(s, 0), /Roll the dice first/);
    refused(() => score(s, seat, "chance"), /Roll the dice first/);
    refused(() => roll(s, 1 - seat), /not your turn/);
  });

  it("is three rolls at most, and what you keep stays as it is", () => {
    let s = start({}, 2, 5);
    const seat = s.turn;
    s = roll(s);
    const first = [...s.hands[0]!.dice];
    expect(first.every((d) => d >= 1 && d <= 6)).toBe(true);
    let v = g.view(s, seat);
    expect(v.dice).toMatchObject({ roll: 1, tap: { type: "hold", dice: [0, 1, 2, 3, 4] } });
    expect(v.choices!.options[0]!.label).toBe("Roll again (2 left)");
    // Everyone sees the dice, but only the roller can touch them.
    expect(g.view(s, 1 - seat).dice).toEqual({ ...v.dice, tap: null });

    s = hold(hold(s, 1), 3);
    expect(g.view(s, 1 - seat).dice!.dice.map((d) => d.held)).toEqual([false, true, false, true, false]);
    s = roll(s);
    expect([s.hands[0]!.dice[1], s.hands[0]!.dice[3]]).toEqual([first[1], first[3]]);
    expect(s.hands[0]!.held).toEqual([false, true, false, true, false]);
    // Let one go again and keep another.
    s = hold(hold(s, 1), 0);
    const second = [...s.hands[0]!.dice];
    s = roll(s);
    expect([s.hands[0]!.dice[0], s.hands[0]!.dice[3]]).toEqual([second[0], second[3]]);
    expect(s.hands[0]!.rolls).toBe(3);

    // After the third roll the dice are what they are: no more rolling, nothing to keep, a box to pick.
    v = g.view(s, seat);
    expect(v.dice).toMatchObject({ roll: 3, tap: null });
    expect(v.choices).toEqual({ prompt: "Pick a box to score", options: [] });
    expect(movesOffered(v)).toHaveLength(13);
    expect(movesOffered(v).every((m) => m.type === "score")).toBe(true);
    refused(() => roll(s), /last roll/);
    refused(() => hold(s, 0), /last roll/);
  });

  it("rolls the same dice from the same seed, and different ones from another", () => {
    const dice = (seed: number) => roll(roll(start({}, 2, seed))).hands[0]!.dice;
    expect(dice(7)).toEqual(dice(7));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => dice(seed).join(""))).size).toBeGreaterThan(4);
    // Every face turns up.
    let s = start({}, 1, 11);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      s = roll(s);
      s.hands[0]!.dice.forEach((d) => seen.add(d));
      s = withDice(s, s.hands[0]!.dice, 1);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("can stop after any roll, and has to end in a box that is still empty", () => {
    let s = withDice(start(), [2, 2, 2, 5, 5]);
    const seat = s.turn;
    expect(picksOf(g.view(s, seat))).toMatchObject({ twos: 6, fives: 10, threeKind: 16, fullHouse: 25, chance: 16, yacht: 0, largeStraight: 0 });
    refused(() => score(s, seat, "bonus"), /not a box/);
    refused(() => g.apply(s, seat, { type: "score" } as unknown as YachtMove), /not a box/);
    refused(() => hold(s, 5), /not one of the dice/);
    refused(() => g.apply(s, seat, { type: "hold" } as unknown as YachtMove), /not one of the dice/);
    refused(() => g.apply(s, seat, { type: "pass" } as unknown as YachtMove));
    // Scoring never changes the state it was given.
    const given = s;
    const before = JSON.stringify(given);
    s = score(s, seat, "fullHouse");
    expect(JSON.stringify(given)).toBe(before);
    expect(s.sheets[seat]![8]).toBe(25);
    expect(s.turn).toBe(1 - seat);
    expect(s.narration).toBe(`{${seat}} scores 25 in Full house`);
    const v = g.view(s, seat);
    expect(v.sheet!.last).toEqual({ seat, column: 9 });
    expect(cellsOf(v, seat)["Full house"]).toBe("25");
    // The dice lie where they were scored, dimmed, until the next player picks them up.
    expect(g.view(s, 1 - seat).dice!.dice).toEqual([2, 2, 2, 5, 5].map((value, id) => ({ id, value, held: false, used: true })));
    expect(movesOffered(g.view(s, 1 - seat))).toEqual([{ type: "roll" }]);

    // Round the table and back: that box is taken now.
    s = score(withDice(s, [1, 2, 3, 4, 5]), 1 - seat, "largeStraight");
    s = withDice(s, [3, 3, 3, 6, 6]);
    expect(picksOf(g.view(s, seat)).fullHouse).toBeUndefined();
    refused(() => score(s, seat, "fullHouse"), /filled that box in already/);
    expect(score(s, seat, "yacht").narration).toBe(`{${seat}} scratches Yacht`);
  });

  it("the first roll of a turn is all five dice, whatever was kept the turn before", () => {
    let s = roll(start({}, 2, 9));
    s = roll(hold(hold(hold(hold(s, 0), 1), 2), 3));
    s = score(s, s.turn, "chance");
    expect(s.hands[0]).toMatchObject({ rolls: 0, held: [false, false, false, false, false] });
    const next = roll(s);
    expect(next.hands[0]!.throws).toBe(3);
    expect(g.view(next, 0).dice!.dice.every((d) => !d.held && !d.used && d.value !== null)).toBe(true);
  });

  it("with every die kept there is nothing to roll", () => {
    let s = roll(start());
    for (let die = 0; die < 5; die++) s = hold(s, die);
    const v = g.view(s, s.turn);
    expect(v.choices).toEqual({ prompt: "Pick a box to score, or let go of a die to roll again", options: [] });
    refused(() => roll(s), /Let go of a die/);
    expect(g.view(hold(s, 2), s.turn).choices!.options).toHaveLength(1);
  });

  it("goes round the table, a box each a round, until every sheet is full", () => {
    let s = start({}, 3, 2);
    const first = s.first;
    const order: number[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(s.turn);
      s = roll(s);
      s = score(s, s.turn, yachtOptions(s, s.turn)[0]!.box);
    }
    expect(order).toEqual([first, (first + 1) % 3, (first + 2) % 3, first, (first + 1) % 3, (first + 2) % 3]);
    expect(s.round).toBe(3);
    expect(g.view(s, 0).info).toContain("Round 3 of 13");
    const done = playOut({}, 3, 2);
    expect(done.round).toBe(13);
    expect(done.sheets.every((sheet) => sheet.every((v) => v !== null))).toBe(true);
    const summary = g.summary(done);
    const totals = [0, 1, 2].map((seat) => yachtTotal(done, seat));
    expect(summary).toMatchObject({ over: true, phase: "finished", hand: 13, scoreLine: totals.join(" · ") });
    expect(summary.winners).toEqual(totals.flatMap((t, seat) => (t === Math.max(...totals) ? [seat] : [])));
    expect(totals[summary.order![0]!]).toBe(Math.max(...totals));
    const v = g.view(done, 1);
    expect(v.over!.winners).toEqual(summary.winners);
    expect(v.result!.rows.map((r) => r.label)).toEqual(expect.arrayContaining(["Top half", "Bonus", "Bottom half", "Total"]));
    expect(v.result!.rows.find((r) => r.label === "Total")!.values).toEqual(totals.map(String));
    expect(movesOffered(v)).toEqual([]);
    refused(() => roll(done, 0), /game is over/);
  });

  it("a tie is shared", () => {
    let s = start({ ...quickYacht }, 2, 4);
    yachtBoxes(quickYacht).forEach((_, i) => (s.sheets[0]![i] = s.sheets[1]![i] = 10));
    s = { ...s, round: 7, first: 0, turn: 1 };
    s.sheets[1]![6] = null;
    s = score(withDice(s, [1, 1, 2, 3, 3], 3, 1), 1, "chance");
    expect(g.summary(s)).toMatchObject({ over: true, winners: [0, 1] });
    expect(g.view(s, 0).over).toEqual({ winners: [0, 1], title: "Everyone ties on 70!" });
  });
});

describe("everyone rolling at once", () => {
  const all = (seats = 3, seed = 3) => start({ order: "together" }, seats, seed);

  it("gives every seat dice of its own that nobody else is shown", () => {
    let s = all();
    expect(s.hands).toHaveLength(3);
    const views = [0, 1, 2].map((seat) => g.view(s, seat));
    for (const v of views) {
      expect(v.turn).toBeNull();
      expect(v.dice!.owner).toBe(v.me);
      expect(movesOffered(v)).toEqual([{ type: "roll" }]);
      expect(v.info).toContain("Everyone rolls at once");
    }
    // One seat rolls and keeps a die: the others' views don't change by a character.
    const before = [0, 2].map((seat) => JSON.stringify(g.view(s, seat)));
    s = hold(roll(s, 1), 2, 1);
    expect([0, 2].map((seat) => JSON.stringify(g.view(s, seat)))).toEqual(before);
    const mine = g.view(s, 1);
    expect(mine.dice!.dice.map((d) => d.value)).toEqual(s.hands[1]!.dice);
    expect(mine.dice).toMatchObject({ roll: 1, owner: 1, tap: { type: "hold" } });
    expect(mine.dice!.dice[2]!.held).toBe(true);
    expect(g.view(s, 0).dice!.dice.every((d) => d.value === null)).toBe(true);
    // And nothing public says what was rolled.
    expect(JSON.stringify(g.summary(s))).toBe(JSON.stringify(g.summary(all())));
  });

  it("lets each player work at their own pace, and moves on when all have scored", () => {
    let s = all();
    // Seat 2 plays its whole turn before anyone else has rolled.
    s = roll(roll(roll(s, 2), 2), 2);
    const box = yachtOptions(s, 2)[0]!.box;
    s = score(s, 2, box);
    expect(s.round).toBe(1);
    expect(s.hands[2]!.done).toBe(true);
    expect(g.view(s, 0).players.map((p) => p.badge)).toEqual([undefined, undefined, "Scored"]);
    // What was scored is on the sheet for everyone; then that seat waits.
    expect(g.view(s, 0).sheet!.rows[2]!.cells.filter(Boolean).length).toBeGreaterThan(0);
    expect(g.view(s, 0).narration).toContain("{2}");
    expect(movesOffered(g.view(s, 2))).toEqual([]);
    expect(g.bot(s, 2, SHARP)).toBeNull();
    refused(() => roll(s, 2), /waiting for the others/);
    // The other two, in either order.
    s = roll(s, 1);
    s = roll(s, 0);
    s = score(s, 0, yachtOptions(s, 0)[0]!.box);
    expect(s.round).toBe(1);
    s = score(s, 1, yachtOptions(s, 1)[0]!.box);
    expect(s.round).toBe(2);
    expect(s.hands.map((h) => h.done)).toEqual([false, false, false]);
    for (const seat of [0, 1, 2]) expect(movesOffered(g.view(s, seat))).toEqual([{ type: "roll" }]);
    // Your own scored dice are yours to look at until you roll again.
    expect(g.view(s, 2).dice!.dice.every((d) => d.used)).toBe(true);
  });

  it("only shouts about a roll when it is five of a kind", () => {
    let s = all();
    s = roll(s, 0);
    expect(s.narration).toBeNull();
    // Four sixes kept and one die to roll: some seed makes the fifth.
    for (let rng = 1; rng < 200; rng++) {
      const held = withDice({ ...s, rng }, [6, 6, 6, 6, 1], 1, 0);
      held.hands[0]!.held = [true, true, true, true, false];
      const next = roll(held, 0);
      if (next.hands[0]!.dice[4] !== 6) continue;
      expect(next.narration).toBe("{0} rolls a Yacht!");
      expect(g.view(next, 1).narration).toBe("{0} rolls a Yacht!");
      return;
    }
    throw new Error("no seed rolled a six");
  });

  it("plays whole games at every table size", () => {
    for (const seats of [1, 2, 6]) {
      for (const rules of [classicYacht, yatzyYacht, quickYacht, shotzee]) {
        const done = playOut({ ...rules, order: "together" }, seats, seats * 7);
        expect(g.summary(done).over).toBe(true);
        expect(done.sheets.every((sheet) => sheet.every((v) => v !== null))).toBe(true);
        for (let seat = 0; seat < seats; seat++) expect(movesOffered(g.view(done, seat))).toEqual([]);
      }
    }
  });
});

describe("alone", () => {
  it("is a real game: thirteen turns for a score to beat", () => {
    let s = start({}, 1, 6);
    expect([s.seats, s.turn, s.first]).toEqual([1, 0, 0]);
    expect(g.view(s, 0).players).toHaveLength(1);
    s = roll(s);
    s = score(s, 0, "chance");
    // Straight back to you.
    expect([s.turn, s.round]).toEqual([0, 2]);
    expect(movesOffered(g.view(s, 0))).toEqual([{ type: "roll" }]);
    const done = playOut({}, 1, 6);
    const total = yachtTotal(done, 0);
    expect(total).toBeGreaterThan(100);
    expect(g.summary(done)).toMatchObject({ over: true, winners: [0], order: [0], scoreLine: `${total} points`, seats: 1 });
    expect(g.view(done, 0).over).toEqual({ winners: [0], title: `{0} scores ${total}` });
  });

  it("works on every sheet and in both orders", () => {
    for (const rules of g.presets) for (const order of ["turns", "together"] as const) expect(g.summary(playOut({ ...rules, order }, 1, 12)).over).toBe(true);
  });
});

describe("Shotzee", () => {
  it("is Classic with drinking mode on, one pick in the list, and the table takes the name", () => {
    expect(shotzee).toEqual({ ...classicYacht, id: "yacht-drinking", name: "Shotzee 🍺", drinking: true });
    expect(g.presets.at(-1)).toBe(shotzee);
    expect(g.normalize({ id: "yacht-drinking" })).toEqual(shotzee);
    expect(g.fields.some((f) => f.key === "drinking")).toBe(true);
    expect(g.describe(shotzee).join(" ")).toContain("🍺 Drinking mode");
    expect(g.describe(classicYacht).join(" ")).not.toContain("🍺");
    const v = g.view(start(shotzee), 0);
    expect(v.sheet!.title).toBe("Shotzee");
    expect(v.sheet!.columns.map((c) => c.label)).toEqual(expect.arrayContaining(["Shotzee!", "Shotzee bonus"]));
    expect(v.info.some((line) => line.includes("🍺"))).toBe(true);
    expect(g.summary(start(shotzee)).rules).toBe("Shotzee 🍺");
    // Without the mode it is Yacht, and nobody is counting drinks.
    const plain = g.view(start(), 0);
    expect(plain.sheet!.title).toBe("Yacht");
    expect(plain.players[0]!.line).toBe("0 points");
    expect(JSON.stringify(plain)).not.toContain("🍺");
  });

  it("five of a kind: everyone else takes a shot", () => {
    for (let rng = 1; rng < 300; rng++) {
      const held = withDice({ ...start(shotzee, 4), rng, turn: 2 }, [3, 3, 3, 3, 5], 2, 2);
      held.hands[0]!.held = [true, true, true, true, false];
      const next = roll(held, 2);
      if (next.hands[0]!.dice[4] !== 3) {
        // An ordinary roll costs nobody anything.
        expect(next.tally.drank).toEqual([0, 0, 0, 0]);
        continue;
      }
      expect(next.tally.drank).toEqual([1, 1, 0, 1]);
      expect(next.narration).toBe("{2} rolls a Shotzee! · 🍺 {0} and {1} and {3} drink 1");
      const v = g.view(next, 0);
      expect(v.players.map((p) => p.line)).toEqual(["0 points · 🍺 1", "0 points · 🍺 1", "0 points · 🍺 0", "0 points · 🍺 1"]);
      // Scoring it is no drink for anyone; the box is called by its name.
      const scored = score(next, 2, "yacht");
      expect(scored.narration).toBe("{2} scores 50 in Shotzee!");
      expect(scored.tally.drank).toEqual([1, 1, 0, 1]);
      expect(g.summary(scored).scoreLine).toBe("0 · 0 · 50 · 0 · 🍺 1 · 1 · 0 · 1");
      return;
    }
    throw new Error("no seed rolled the fifth three");
  });

  it("a zero on your sheet costs you a drink", () => {
    let s = withDice(start(shotzee, 2, 8), [1, 2, 2, 4, 6]);
    const seat = s.turn;
    s = score(s, seat, "largeStraight");
    expect(s.tally.drank[seat]).toBe(1);
    expect(s.tally.drank[1 - seat]).toBe(0);
    expect(s.narration).toBe(`{${seat}} scratches Large straight · 🍺 {${seat}} drinks 1`);
    // Points are no drink.
    s = score(withDice(s, [1, 2, 2, 4, 6]), 1 - seat, "twos");
    expect(s.tally.drank[1 - seat]).toBe(0);
    // In plain Yacht a zero is only a zero.
    const plain = score(withDice(start({}, 2, 8), [1, 2, 2, 4, 6]), seat, "largeStraight");
    expect(plain.tally.drank).toEqual([0, 0]);
  });

  it("keeps the tally to the end, and alone there is nobody to hand a shot to", () => {
    const done = playOut(shotzee, 3, 21, CARELESS);
    const v = g.view(done, 0);
    expect(v.result!.rows.at(-1)).toEqual({ label: "Drinks 🍺", values: done.tally.drank.map(String) });
    const zeros = done.sheets.map((sheet) => sheet.filter((x) => x === 0).length);
    // Everyone has at least the drinks their own zeros cost them.
    done.tally.drank.forEach((n, seat) => expect(n).toBeGreaterThanOrEqual(zeros[seat]!));
    const solo = playOut(shotzee, 1, 21, CARELESS);
    expect(solo.tally.drank[0]).toBe(solo.sheets[0]!.filter((x) => x === 0).length);
  });
});

describe("the rules", () => {
  it("come out whole from anything", () => {
    expect(g.normalize(null)).toEqual(classicYacht);
    expect(g.normalize({ sheet: "bingo", order: "sideways", bonus: "yes", drinking: 1 })).toEqual({ ...classicYacht, drinking: true });
    for (const p of g.presets) expect(g.normalize(p)).toEqual(p);
    expect(g.seats).toEqual({ min: 1, max: 6, default: 2 });
  });

  it("never says the other game's name", () => {
    const words = JSON.stringify([g, g.presets.map((p) => g.describe(p)), g.view(start(), 0), g.view(start(shotzee), 0), g.view(start(yatzyYacht), 0)]).toLowerCase();
    expect(words).not.toContain("yahtzee");
  });
});

describe("the computer player", () => {
  const turn = (dice: number[], rolls: number, filled: Record<string, number> = {}, rules: Partial<YachtRules> = {}) => withDice(withBoxes({ ...start(rules), turn: 0, first: 0 }, 0, filled), dice, rolls, 0);

  it("takes what is made and goes after what nearly is", () => {
    // A large straight on the first roll: take the 40.
    expect(yachtPlan(turn([1, 2, 3, 4, 5], 1), 0)).toMatchObject({ box: "largeStraight", keep: null });
    expect(g.bot(turn([1, 2, 3, 4, 5], 1), 0, SHARP)).toEqual({ type: "score", cell: "largeStraight" });
    // Four sixes with rolls to come: keep them and throw the other die.
    expect(yachtPlan(turn([6, 6, 6, 6, 2], 1), 0)).toMatchObject({ box: null, keep: [0, 0, 0, 0, 0, 0, 4] });
    // Five of a kind: stop.
    expect(yachtPlan(turn([2, 2, 2, 2, 2], 1), 0)!.box).toBe("yacht");
    // A run of four with only the large straight left to fill: throw the odd die.
    const late = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, threeKind: 20, fourKind: 0, fullHouse: 25, smallStraight: 30, yacht: 0, chance: 20 };
    expect(yachtPlan(turn([2, 3, 4, 5, 5], 2, late), 0)).toMatchObject({ box: null, keep: [0, 0, 1, 1, 1, 1, 0] });
    // Out of rolls with rubbish: it goes where it costs least, not in a box worth saving.
    const dump = yachtPlan(turn([1, 2, 2, 4, 6], 3), 0)!.box;
    expect(["ones", "twos", "chance"]).toContain(dump);
  });

  it("keeps dice a move at a time, the same plan each time it is asked, and then rolls", () => {
    let s = turn([6, 1, 6, 6, 3], 1);
    const moves: YachtMove[] = [];
    for (let i = 0; i < 6 && s.hands[0]!.rolls === 1; i++) {
      const move = g.bot(s, 0, SHARP)!;
      expect(g.bot(s, 0, SHARP)).toEqual(move);
      moves.push(move);
      s = g.apply(s, 0, move);
    }
    expect(moves).toEqual([{ type: "hold", die: 0 }, { type: "hold", die: 2 }, { type: "hold", die: 3 }, { type: "roll" }]);
    // Dice already kept that it wants stay kept; one it doesn't want is let go.
    let kept = turn([6, 1, 6, 6, 3], 1);
    kept.hands[0]!.held = [true, true, false, false, false];
    expect(g.bot(kept, 0, SHARP)).toEqual({ type: "hold", die: 1 });
    kept = g.apply(kept, 0, { type: "hold", die: 1 });
    expect(g.bot(kept, 0, SHARP)).toEqual({ type: "hold", die: 2 });
  });

  it("has a move exactly when a seat owes one, and it is always one the view offers", () => {
    const s = start({}, 3, 4);
    expect([0, 1, 2].map((seat) => g.bot(s, seat, SHARP) !== null)).toEqual([0, 1, 2].map((seat) => seat === s.turn));
    for (const style of [SHARP, CARELESS, {}]) expect(g.summary(playOut({}, 2, 17, style)).over).toBe(true);
    // A careless player never tries to roll with all five kept, even holding five of a kind with the box gone.
    let stuck = turn([4, 4, 4, 4, 4], 1, { yacht: 0, fours: 4, threeKind: 5, fourKind: 5, fullHouse: 0, smallStraight: 0, largeStraight: 0, chance: 9 }, { bonus: false });
    for (let i = 0; i < 12 && stuck.turn === 0; i++) stuck = g.apply(stuck, 0, g.bot(stuck, 0, { skill: 0, sloppy: 1 })!);
    expect(stuck.turn).toBe(1);
  });

  it("thinks fast: a move is well under a tenth of a second", () => {
    // Once to build its tables, which the first move of the day pays for.
    yachtPlan(turn([1, 2, 3, 4, 6], 1), 0);
    const times: number[] = [];
    for (const seed of [31, 32, 33]) {
      let s = start({}, 1, seed);
      while (s.phase !== "finished") {
        const began = performance.now();
        const move = g.bot(s, 0, SHARP)!;
        times.push(performance.now() - began);
        s = g.apply(s, 0, move);
      }
    }
    times.sort((a, b) => a - b);
    const average = times.reduce((a, b) => a + b, 0) / times.length;
    const most = times[Math.floor(times.length * 0.95)]!;
    console.log(`Yacht bot: ${times.length} moves, ${average.toFixed(2)} ms a move on average, 95% under ${most.toFixed(2)} ms, ${times.at(-1)!.toFixed(1)} ms at worst`);
    // Loose enough for a busy machine: the point is that it is nowhere near a tenth of a second.
    expect(average).toBeLessThan(15);
    expect(most).toBeLessThan(50);
  });

  it("the sharp one outscores the careless one, on every sheet", () => {
    const games = 120;
    for (const rules of [classicYacht, yatzyYacht, quickYacht]) {
      const average = (style: object) => {
        let sum = 0;
        for (let seed = 1; seed <= games; seed++) sum += yachtTotal(playOut(rules, 1, seed, style), 0);
        return sum / games;
      };
      const sharp = average(SHARP);
      const careless = average(CARELESS);
      console.log(`Yacht, ${rules.name}, alone, ${games} games: sharp ${sharp.toFixed(1)}, careless ${careless.toFixed(1)}`);
      expect(sharp).toBeGreaterThan(careless + 8);
    }
    // Nothing a careless player does breaks the rules of extra Yachts either.
    expect(g.summary(playOut({ bonus: true }, 4, 5, { skill: 0, sloppy: 1 })).over).toBe(true);
  }, 120_000);
});
