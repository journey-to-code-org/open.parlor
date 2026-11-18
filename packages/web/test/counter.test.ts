// Delbie's Counter in the parlor: the shift that the screen is drawn from. The screen itself is
// Zubra components in a Vue island; this is the plain store under it.
import { COUNTER_PARTS, COUNTER_VEHICLES, counterTotals, delbiesCounter, replay } from "@journey-to-code/games";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controlsFor } from "../src/arcade/controls";
import { startShift, type ShiftEnd } from "../src/counter/shift";
import type { ArcadeRules } from "../src/storage";

const TUESDAY = { id: "tuesday" } as unknown as ArcadeRules;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance", "Date"] });
  vi.stubGlobal("document", { hidden: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Delbie's Counter", () => {
  it("has a screen of its own", () => {
    expect(() => controlsFor("counter", { autofire: () => false })).toThrow(/own screen/);
  });

  it("gives every car's parts a label of their own to look up by", () => {
    for (let car = 0; car < COUNTER_VEHICLES.length; car++) {
      const labels = COUNTER_PARTS.filter((p) => p.vehicle === car).map((p) => `${p.name} · ${p.grade_name}`);
      expect(labels).toHaveLength(24);
      expect(new Set(labels).size).toBe(24);
    }
  });

  it("plays a shift: commands go out one a tick, the screen is told, and the log plays back to the same score", () => {
    const ends: ShiftEnd[] = [];
    const shift = startShift(TUESDAY, 7, (e) => ends.push(e));
    let told = 0;
    shift.subscribe(() => told++);
    vi.advanceTimersByTime(1500);
    expect(told).toBeGreaterThan(10);
    const first = shift.view().counter!;
    expect(first.line.length).toBe(1);
    // Ring something up and take it off again: two commands, carried out on two ticks.
    const part = COUNTER_PARTS[0]!;
    shift.send({ do: "ring", sku: part.sku, qty: 2 });
    shift.send({ do: "core", on: true });
    vi.advanceTimersByTime(100);
    expect(shift.view().counter!.ticket.lines).toHaveLength(1);
    vi.advanceTimersByTime(100);
    const ticket = shift.view().counter!.ticket;
    expect(ticket.coreBack).toBe(true);
    expect(ticket.total).toBe(counterTotals([{ sku: part.sku, qty: 2 }], true, 0).total);
    shift.send({ do: "void", sku: part.sku });
    vi.advanceTimersByTime(200);
    expect(shift.view().counter!.ticket.lines).toEqual([]);
    // To the end of the shift.
    vi.advanceTimersByTime(181_000);
    expect(ends).toHaveLength(1);
    const end = ends[0]!;
    expect(end.summary.over).toBe(true);
    const again = replay(delbiesCounter, delbiesCounter.normalize({ id: "tuesday" }), 1, 7, end.log);
    expect(delbiesCounter.summary(again).score).toBe(end.summary.score);
  });

  it("waits while the page is hidden", () => {
    const shift = startShift(TUESDAY, 7, () => undefined);
    vi.advanceTimersByTime(1000);
    const tick = shift.view().tick;
    expect(tick).toBeGreaterThan(5);
    vi.stubGlobal("document", { hidden: true });
    vi.advanceTimersByTime(5000);
    expect(shift.view().tick).toBe(tick);
    shift.stop();
  });
});
