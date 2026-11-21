// The road Tower of Ryan draws. The creeps walk a square path; this is the line the paint follows.
import { describe, expect, it } from "vitest";
import { roadCenterline } from "../src/arcade/road";

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
