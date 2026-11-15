// How high the ground is, as the table screen works it out from a view's heights, and which of
// two things is nearer the camera. Checked on the real course: a step is a step, a ramp meets the
// ground at both ends, and nothing a ball can rest on is far below the rails round it.
import { backGarden, miniGolf, newMiniGolf, nineHoles } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { nearnessAt } from "../src/sport/paint/order";
import { landOf } from "../src/sport/paint/terrain";
import { toCamera } from "../src/sport/projection";

function tableOf(id: string) {
  const s = newMiniGolf({ ...nineHoles }, 2, 1);
  s.hole = backGarden.holes.findIndex((h) => h.id === id);
  return miniGolf.view(s, 0).table;
}

describe("the lie of the land", () => {
  it("steps down the terraces and climbs the ramp between them", () => {
    const land = landOf(tableOf("terraces"), 0);
    expect(land.heightAt(6000, 3000)).toBe(900);
    expect(land.heightAt(6000, 6500)).toBe(450);
    expect(land.heightAt(6000, 11000)).toBe(0);
    // The ramp: level with the bottom at its foot, with the top terrace at its head, and even between.
    expect(land.heightAt(2400, 8590)).toBeCloseTo(0, -1);
    expect(land.heightAt(2400, 4410)).toBeCloseTo(900, -1);
    expect(land.heightAt(2400, 6500)).toBeCloseTo(450, 0);
  });

  it("gives the same heights however the table is turned", () => {
    const table = tableOf("whole-garden");
    const upright = landOf(table, 0);
    for (const turn of [1, 3]) {
      const turned = landOf(table, turn);
      for (const [x, y] of [[2700, 11900], [7700, 10100], [5200, 2600], [2100, 7300], [5200, 9000]] as const) {
        const [cx, cy] = toCamera(turn, x, y);
        expect(turned.heightAt(cx, cy)).toBe(upright.heightAt(x, y));
      }
    }
  });

  it("sinks water and sand a little below what they are set in, and nothing else", () => {
    const garden = landOf(tableOf("whole-garden"), 0);
    // The raised bed, the sand in it, the paddling pool in it, the last green a step down, the lawn.
    expect(garden.heightAt(2700, 11900)).toBe(300);
    expect(garden.heightAt(5200, 2600)).toBeLessThan(300);
    expect(garden.bankAt(5200, 2600)).toBe(300);
    expect(garden.heightAt(2100, 7300)).toBeLessThan(garden.heightAt(5200, 2600));
    expect(garden.heightAt(7700, 10100)).toBe(0);
    expect(garden.heightAt(5200, 9000)).toBe(0);
    // A grass path laid over sand is back at the level of the grass.
    const pit = landOf(tableOf("sandpit"), 0);
    expect(pit.heightAt(5200, 11900)).toBe(0);
    expect(pit.heightAt(8000, 9000)).toBeLessThan(0);
  });

  it("puts the cup on top of the mole's hill, with no cliff round it", () => {
    const land = landOf(tableOf("mole-run"), 0);
    expect(land.heightAt(3300, 2700)).toBe(240);
    for (let a = 0; a < 16; a++) {
      const [ux, uy] = [Math.cos((a * Math.PI) / 8), Math.sin((a * Math.PI) / 8)];
      let last = land.heightAt(3300, 2700);
      for (let far = 100; far <= 1800; far += 50) {
        const here = land.heightAt(3300 + ux * far, 2700 + uy * far);
        expect(Math.abs(here - last)).toBeLessThan(40);
        last = here;
      }
      expect(last).toBe(0);
    }
  });

  it("never has a ball resting far below the ground round a hole", () => {
    // Ground a ball rolls on that lay below the lawn would hide the ball behind its near edge.
    for (const h of backGarden.holes) {
      const land = landOf(tableOf(h.id), 0);
      expect(land.heightAt(h.tee[0], h.tee[1])).toBeGreaterThanOrEqual(0);
      expect(land.heightAt(h.world.pockets[0]!.x, h.world.pockets[0]!.y)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("what is in front of what", () => {
  const rail: [number, number][] = [[0, 1000], [4000, 1000], [4000, 1340], [0, 1340]];
  const slanted: [number, number][] = [[0, 0], [300, 0], [4300, 4000], [4000, 4000]];
  it("compares a footprint with a point where they line up across the screen", () => {
    expect(nearnessAt(rail, 2000)).toBe(1170);
    // A long slanting rail is behind a ball at one end of it and in front of one at the other.
    expect(nearnessAt(slanted, 1000)).toBeLessThan(2000);
    expect(nearnessAt(slanted, 3500)).toBeGreaterThan(2000);
  });
});
