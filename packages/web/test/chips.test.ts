import { describe, expect, it } from "vitest";
import { blackjack, fiveDraw, holdem, type KitView } from "@journey-to-code/games";
import { chipStacks, chipsAtTable, playsForChips } from "../src/kit/chips";

const worth = (amount: number, columns?: number, tall?: number) => chipStacks(amount, columns, tall).reduce((n, s) => n + s.value * s.count, 0);

describe("the chips that show an amount", () => {
  it("shows nothing for nothing", () => {
    expect(chipStacks(0)).toEqual([]);
    expect(chipStacks(-5)).toEqual([]);
  });
  it("mixes the chips, biggest first", () => {
    expect(chipStacks(500).map((s) => [s.count, s.value])).toEqual([[4, 100], [3, 25], [5, 5]]);
    expect(chipStacks(10).map((s) => [s.count, s.value])).toEqual([[1, 5], [5, 1]]);
    expect(chipStacks(1).map((s) => [s.count, s.value])).toEqual([[1, 1]]);
  });
  it("adds up to the amount for the sums these tables see", () => {
    for (const n of [1, 2, 5, 10, 15, 20, 40, 60, 100, 200, 235, 500, 1000, 1500, 3000]) expect(worth(n, 4, 12), String(n)).toBe(n);
  });
  it("keeps to its columns and its height, whatever the amount", () => {
    for (const n of [7, 99, 12345, 100000, 5_000_000]) {
      const stacks = chipStacks(n, 3, 6);
      expect(stacks.length).toBeGreaterThan(0);
      expect(stacks.length).toBeLessThanOrEqual(3);
      for (const s of stacks) expect(s.count).toBeLessThanOrEqual(6);
    }
  });
});

/** Every chip on the table: behind, out in front, and in the middle. */
const total = (view: KitView) => {
  const c = chipsAtTable(view)!;
  return [...c.stacks, ...c.bets].reduce((a, n) => a + n, 0) + (c.pot ?? 0);
};

describe("the chips at a table, read from what the game says", () => {
  it("is only for games played for chips", () => {
    expect(playsForChips("holdem") && playsForChips("fivedraw") && playsForChips("blackjack")).toBe(true);
    expect(playsForChips("hearts")).toBe(false);
  });

  it("Hold'em: the blinds are out in front, and no chip is lost through a whole game of bots", () => {
    const rules = holdem.presets[0]!;
    let s = holdem.newGame(rules, 4, 11);
    const first = chipsAtTable(holdem.view(s, 0))!;
    expect([...first.bets].sort((a, b) => a - b)).toEqual([0, 0, rules.blind / 2, rules.blind]);
    expect(first.pot).toBe(0);
    let seed = 5;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let sawPot = false;
    for (let step = 0; step < 4000 && !holdem.view(s, 0).over; step++) {
      const view = holdem.view(s, 0);
      expect(total(view)).toBe(rules.startChips * 4);
      if (chipsAtTable(view)!.pot) sawPot = true;
      const seat = [0, 1, 2, 3].find((i) => holdem.bot(s, i, "steady" as never, rand));
      if (seat === undefined) break;
      s = holdem.apply(s, seat, holdem.bot(s, seat, "steady" as never, rand)!);
    }
    expect(sawPot).toBe(true);
  });

  it("Five Card Draw: the antes are in the middle from the start", () => {
    const rules = fiveDraw.presets[0]!;
    const view = fiveDraw.view(fiveDraw.newGame(rules, 3, 3), 0);
    const c = chipsAtTable(view)!;
    expect(c.pot).toBeGreaterThan(0);
    expect(total(view)).toBe(rules.startChips * 3);
  });

  it("Blackjack: a stake comes off the stack and sits in front, and there is no pot", () => {
    const rules = blackjack.presets[0]!;
    let s = blackjack.newGame(rules, 2, 9);
    expect(chipsAtTable(blackjack.view(s, 0))).toEqual({ stacks: [rules.chips, rules.chips], bets: [0, 0], pot: null });
    s = blackjack.apply(s, 0, { type: "bet", amount: 10 } as never);
    const c = chipsAtTable(blackjack.view(s, 1))!;
    expect(c.bets[0]).toBe(10);
    expect(c.stacks[0]).toBe(rules.chips - 10);
  });
});

describe("solid chips", () => {
  it("a chip dropped on a stack starts above it and lands, the higher ones a little later", async () => {
    const { dropLeft, chipHeight, CHIP_THICK } = await import("../src/kit/chips3d");
    expect(dropLeft(0, 0)).toBe(1);
    expect(dropLeft(120, 0)).toBeGreaterThan(0);
    expect(dropLeft(120, 0)).toBeLessThan(1);
    expect(dropLeft(240, 0)).toBe(0);
    expect(dropLeft(240, 3)).toBeGreaterThan(0);
    expect(dropLeft(5000, 9)).toBe(0);
    expect(chipHeight(1) - chipHeight(0)).toBeCloseTo(CHIP_THICK);
  });
  it("is not asked for where there is no browser to draw it", async () => {
    const { loadChips3d } = await import("../src/kit/chips3d");
    expect(await loadChips3d({} as HTMLCanvasElement)).toBeNull();
  });
});
