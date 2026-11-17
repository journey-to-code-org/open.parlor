// Which dice tumble when the dice are thrown: the ones that lay loose before, whatever they are now.
import type { BoardDie } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { thrownDice } from "../src/board/thrown";

/** Dice from a row of letters: a digit is a loose die, `h` after it held, `u` used, `-` not rolled yet. */
const dice = (...row: string[]): BoardDie[] => row.map((d, id) => ({ id, value: d === "-" ? null : Number(d[0]), ...(d[1] === "h" ? { held: true } : {}), ...(d[1] === "u" ? { used: true } : {}) }));

describe("the dice a throw threw", () => {
  it("are the ones that weren't kept back (Yacht)", () => {
    expect(thrownDice(dice("5h", "5h", "2", "3", "6"), dice("5h", "5h", "5", "1", "4"))).toEqual([2, 3, 4]);
  });

  it("are all of them on the first roll of a game, and of a turn", () => {
    expect(thrownDice(dice("-", "-", "-"), dice("2", "4", "6"))).toEqual([0, 1, 2]);
    expect(thrownDice(dice("2u", "4u", "6u"), dice("1", "1", "3"))).toEqual([0, 1, 2]);
  });

  it("include a die that is kept the moment it lands (Ten Thousand, Ship Captain Crew)", () => {
    // A one and a five set aside earlier, a five kept from the last roll, three loose dice thrown: two of them score.
    expect(thrownDice(dice("1u", "5u", "5h", "2", "3", "6"), dice("1u", "5u", "5u", "1h", "4", "5h"))).toEqual([3, 4, 5]);
    // The ship comes aboard with the roll that finds it.
    expect(thrownDice(dice("2u", "3u", "1u", "1u", "4u"), dice("6h", "3", "5h", "2", "2"))).toEqual([0, 1, 2, 3, 4]);
    expect(thrownDice(dice("6h", "3", "5h", "2", "2"), dice("6h", "4h", "5h", "1", "6"))).toEqual([1, 3, 4]);
  });

  it("are all six when every die had scored (hot dice)", () => {
    expect(thrownDice(dice("1u", "1u", "1u", "5u", "5h", "1h"), dice("2", "3", "5h", "4", "6", "6"))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("include a roll that is spent as soon as it lands (a bust, a one in Pig)", () => {
    expect(thrownDice(dice("1u", "5h", "2", "3", "6", "6"), dice("1u", "5u", "4u", "4u", "2u", "3u"))).toEqual([2, 3, 4, 5]);
    expect(thrownDice(dice("4"), dice("1u"))).toEqual([0]);
    expect(thrownDice(dice("3u"), dice("1u"))).toEqual([0]);
  });
});
