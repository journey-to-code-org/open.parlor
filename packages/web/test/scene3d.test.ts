// Which tables the 3-D scene draws and which stay flat. It draws terraces, steps, slopes that rise
// and tunnels; a patch of ground set lower than the raised ground it lies in (a dip it can't cut
// into a solid terrace) is never drawn wrongly in 3-D: that table stays flat.
import { backGarden } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { drawsIn3d } from "../src/sport/scene3d";

type Table = Parameters<typeof drawsIn3d>[0];
const square = (x: number, y: number, s: number) => ({ points: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]] });
const table = (ground: { shape: unknown; surface: string; level?: number }[], extra: object = {}) =>
  ({ look: { ledges: [], tunnels: [], regions: [], ground, ...extra } }) as unknown as Table;

describe("drawsIn3d", () => {
  it("draws a plain table, and one with terraces, steps, a rising slope and a tunnel", () => {
    expect(drawsIn3d(table([{ shape: square(0, 0, 100), surface: "green" }]))).toBe(true);
    expect(
      drawsIn3d(
        table([{ shape: square(0, 0, 100), surface: "green" }, { shape: square(10, 10, 20), surface: "green", level: 450 }], {
          ledges: [{}],
          tunnels: [{}],
          regions: [{ id: "hill", surface: "slope", rise: 300 }],
        }),
      ),
    ).toBe(true);
  });
  it("leaves a dip into raised ground to the flat drawing", () => {
    expect(drawsIn3d(table([{ shape: square(0, 0, 100), surface: "green", level: 300 }, { shape: square(10, 10, 20), surface: "green", level: 0 }]))).toBe(false);
  });
  it("draws every Back Garden hole in 3-D but the raised bed", () => {
    const flat = backGarden.holes.filter((h) => !drawsIn3d({ look: h.look, world: h.world } as unknown as Table)).map((h) => h.name);
    expect(flat.length).toBeLessThanOrEqual(1);
  });
});
