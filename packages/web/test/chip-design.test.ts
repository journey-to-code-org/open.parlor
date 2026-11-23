import { describe, expect, it } from "vitest";
import { CHIP_STARTERS, CHIP_VALUES, MY_CHIPS_LIMIT, PARLOR_CHIPS, chipProblems, forgetChips, keepChips, myChips, normalizeChips, playWithChips, playingChips, sameChips } from "@open-parlor/ui/chip-design";
import { chipStacks } from "../src/kit/chips";

/** A Storage that lives in a Map. */
function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe("a chip design is data, checked wherever it is read", () => {
  it("fills what is missing from the parlor's own, and has a colour pair for every value", () => {
    const d = normalizeChips({});
    expect(d.chips).toHaveLength(CHIP_VALUES.length);
    expect(sameChips(d, { ...PARLOR_CHIPS, name: "My chips" })).toBe(true);
  });
  it("throws away anything that isn't a colour or one of the choices", () => {
    const d = normalizeChips({
      name: "<b>Mine</b>\u0007 ".repeat(20),
      chips: [{ colour: "red; background: url(x)", inset: "#ABCDEF" }, { colour: "#12345" }],
      edge: "<svg>",
      mark: "skull",
      finish: "chrome",
    });
    expect(d.chips[0]).toEqual({ colour: PARLOR_CHIPS.chips[0]!.colour, inset: "#abcdef" });
    expect(d.chips[1]!.colour).toBe(PARLOR_CHIPS.chips[1]!.colour);
    expect([d.edge, d.mark, d.finish]).toEqual([PARLOR_CHIPS.edge, PARLOR_CHIPS.mark, PARLOR_CHIPS.finish]);
    expect(d.name).not.toMatch(/[<>\u0007]/);
    expect(d.name.length).toBeLessThanOrEqual(40);
  });
  it("every starter can be played with", () => {
    for (const s of CHIP_STARTERS) expect(chipProblems(s), s.name).toEqual([]);
  });
  it("says when chips can't be told apart, or their insets can't be seen", () => {
    const same = normalizeChips({ chips: Array.from({ length: 8 }, () => ({ colour: "#c8322b", inset: "#ffffff" })) });
    expect(chipProblems(same).some((p) => /look the same/.test(p))).toBe(true);
    const hidden = normalizeChips({ chips: [{ colour: "#c8322b", inset: "#c9332c" }] });
    expect(chipProblems(hidden)[0]).toMatch(/insets are too close/);
  });
});

describe("the chips this browser plays with", () => {
  it("is the parlor's own until another set is chosen, and back again with null", () => {
    const store = memory();
    expect(playingChips(store)).toBe(PARLOR_CHIPS);
    playWithChips(CHIP_STARTERS[1]!, store);
    expect(sameChips(playingChips(store), CHIP_STARTERS[1]!)).toBe(true);
    playWithChips(null, store);
    expect(playingChips(store)).toBe(PARLOR_CHIPS);
  });
  it("survives a broken entry", () => {
    const store = memory();
    store.setItem("cardroom.chips", "{not json");
    expect(playingChips(store)).toBe(PARLOR_CHIPS);
  });
  it("keeps sets, changes one in place, forgets one, and stops at the limit", () => {
    const store = memory();
    const a = keepChips({ ...PARLOR_CHIPS, name: "A" }, undefined, store);
    keepChips({ ...PARLOR_CHIPS, name: "B" }, undefined, store);
    keepChips({ ...PARLOR_CHIPS, name: "A2" }, a.id, store);
    expect(myChips(store).map((s) => s.design.name).sort()).toEqual(["A2", "B"]);
    forgetChips(a.id, store);
    expect(myChips(store).map((s) => s.design.name)).toEqual(["B"]);
    for (let i = myChips(store).length; i < MY_CHIPS_LIMIT; i++) keepChips(PARLOR_CHIPS, `id${i}`, store);
    expect(() => keepChips(PARLOR_CHIPS, undefined, store)).toThrow(/keep 30/);
  });
  it("the table's stacks wear the set's colours", () => {
    const set = CHIP_STARTERS[2]!;
    const stacks = chipStacks(500, 3, 10, set);
    for (const s of stacks) {
      const i = CHIP_VALUES.indexOf(s.value as (typeof CHIP_VALUES)[number]);
      expect(s.colour).toBe(set.chips[i]!.colour);
      expect(s.inset).toBe(set.chips[i]!.inset);
    }
  });
});
