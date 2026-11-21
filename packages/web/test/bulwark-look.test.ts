// The look Tower of Ryan draws, apart from the game: a bend in the road, and how a blast goes.
import { describe, expect, it } from "vitest";
import file from "../src/arcade/bulwark-look.json";
import { readBulwarkLook, lookMotion } from "../src/arcade/bulwark-look";
import { roadCenterline } from "../src/arcade/road";

describe("Tower of Ryan's look", () => {
  it("uses the numbers shipped with the game when the host has saved nothing", () => {
    expect(readBulwarkLook(undefined)).toEqual(file);
    expect(readBulwarkLook({})).toEqual(file);
  });

  it("lays a saved look over those numbers, and drops anything out of range", () => {
    expect(readBulwarkLook({ roadBend: 10, smokePuffs: 99, blast: "inferno" })).toEqual({ roadBend: 10, smokePuffs: 12, blast: "inferno" });
    expect(readBulwarkLook({ roadBend: -4, blast: "nope" }).roadBend).toBe(0);
    expect(readBulwarkLook({ blast: "nope" }).blast).toBe(file.blast);
  });

  it("plays the whole show when nothing has asked for less motion", () => {
    expect(lookMotion()).toBe(1);
  });
});

describe("the road that is drawn", () => {
  const corner: [number, number][] = [
    [0, 0],
    [0, 100],
    [100, 100],
  ];

  it("cuts the square corner when the road is allowed to bend", () => {
    const bent = roadCenterline(corner, 100, 100);
    expect(bent.some(([x, y]) => x > 8 && y < 92)).toBe(true);
  });

  it("stays on the corner when it is not", () => {
    const square = roadCenterline(corner, 100, 0);
    expect(square.every(([x, y]) => x < 12 || y > 88)).toBe(true);
  });

  it("keeps the two ends where the game put them", () => {
    const line = roadCenterline(corner, 100, 100);
    expect(line[0]).toEqual([0, 0]);
    expect(line[line.length - 1]).toEqual([100, 100]);
  });
});
