// Forehead's words on the page: the clock, a buzz, the placings.
import { describe, expect, it } from "vitest";
import { buzzLine, clock, placed } from "../src/forehead/words";

const name = (seat: number) => ["Mikey", "Grammi", "Delbie"][seat]!;

describe("forehead", () => {
  it("counts the round down in minutes and seconds", () => {
    expect(clock(180_000)).toBe("3:00");
    expect(clock(61_200)).toBe("1:02");
    expect(clock(900)).toBe("0:01");
    expect(clock(-5)).toBe("0:00");
  });

  it("says who was buzzed and who has a new card, to each reader in their own terms", () => {
    const buzz = { n: 1, round: 1, by: 0, seat: 1, redealt: 2 };
    expect(buzzLine(buzz, 0, name)).toBe("Grammi has been buzzed, and loses a point. Delbie's card was given away, so they have a new one.");
    expect(buzzLine(buzz, 1, name)).toBe("You've been buzzed: you lose a point. Delbie's card was given away, so they have a new one.");
    expect(buzzLine(buzz, 2, name)).toBe("Grammi has been buzzed, and loses a point. It was your card that was given away, so you have a new one.");
    expect(buzzLine({ ...buzz, redealt: null }, 2, name)).toBe("Grammi has been buzzed, and loses a point.");
  });

  it("places the players, equal scores sharing a place", () => {
    expect(placed([{ seat: 0, score: 2 }, { seat: 1, score: 5 }, { seat: 2, score: 2 }, { seat: 3, score: -1 }]).map((p) => [p.seat, p.place])).toEqual([[1, 1], [0, 2], [2, 2], [3, 4]]);
  });
});
