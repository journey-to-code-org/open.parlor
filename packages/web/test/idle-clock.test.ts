// The clock the idle screen hands a game: this device's second, time of day and day of the week.
import { delbies, safeClock } from "@journey-to-code/games";
import { describe, expect, it, vi } from "vitest";
import { clockNow } from "../src/idle/IdleTable";

describe("clockNow", () => {
  it("gives the second, the minute of the day and the day of the week on this device", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 17, 14, 29, 30)); // a Tuesday, half a minute before half past two
    const clock = clockNow();
    expect(clock).toEqual(safeClock(clock));
    expect(clock.minute).toBe(14 * 60 + 29);
    expect(clock.day).toBe(2);
    // The billing desk goes by it: on the clock now, and off it a minute later.
    const store = delbies.newGame(1, clock);
    store.crew.twothirty.hired = true;
    expect(delbies.view(store, clock).desk).toMatchObject({ on: true, minutes: 1 });
    vi.setSystemTime(new Date(2026, 10, 17, 14, 30, 30));
    expect(delbies.view(store, clockNow()).desk.on).toBe(false);
    vi.useRealTimers();
  });
});
