// Word Hunt's trace: the line drawn through the letters a word has taken.
import { describe, expect, it } from "vitest";
import { tracePoints } from "../src/word/WordPieces";

describe("the trace on Word Hunt's square", () => {
  // A 2×2 square of tiles 100 across with their middles at 50 and 150.
  const middles: [number, number][] = [[50, 50], [150, 50], [50, 150], [150, 150]];

  it("goes through the middle of each tile, in the order they were taken", () => {
    expect(tracePoints([0, 3, 1], middles)).toBe("50,50 150,150 150,50");
    expect(tracePoints([2], middles)).toBe("50,150");
    expect(tracePoints([], middles)).toBe("");
  });

  it("leaves out a tile it has no place for, and keeps to a tenth of a pixel", () => {
    expect(tracePoints([0, 9, 1], middles)).toBe("50,50 150,50");
    expect(tracePoints([0], [[33.3333, 66.6666]])).toBe("33.3,66.7");
    // Nothing measured yet: nothing to draw.
    expect(tracePoints([0, 1], [])).toBe("");
  });
});
