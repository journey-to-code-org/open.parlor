// Which tables the 3-D scene draws and which stay flat. A table with something it can't draw yet
// (a step, a pipe, a slope) is never drawn in 3-D with a part of it missing: it stays flat.
import { describe, expect, it } from "vitest";
import { drawsIn3d } from "../src/sport/scene3d";

const table = (look: Partial<{ ledges: unknown[]; tunnels: unknown[]; regions: { id: string; surface: string; rise?: number }[] }>) =>
  ({ look: { ledges: [], tunnels: [], regions: [], ...look } }) as unknown as Parameters<typeof drawsIn3d>[0];

describe("drawsIn3d", () => {
  it("draws a plain table: rails, patches of ground and bodies", () => {
    expect(drawsIn3d(table({ regions: [{ id: "sand", surface: "sand" }] }))).toBe(true);
  });
  it("leaves a table with a step down, a pipe or a slope to the flat drawing", () => {
    expect(drawsIn3d(table({ ledges: [{}] }))).toBe(false);
    expect(drawsIn3d(table({ tunnels: [{}] }))).toBe(false);
    expect(drawsIn3d(table({ regions: [{ id: "hill", surface: "slope", rise: 300 }] }))).toBe(false);
  });
});
