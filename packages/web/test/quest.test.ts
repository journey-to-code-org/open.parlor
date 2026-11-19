// Zubra Quest's screen: the pad and the tool button, and that a frame can be drawn for anything
// the game can show, with a picture of its own for every tile and every thing.
import { QUEST_DENS, QUEST_TILE, questWorld, zubraQuest } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { controlsFor } from "../src/arcade/controls";
import { BOSSES, FOES, ITEMS, tileArt } from "../src/quest/art";
import { nextTool, padWay } from "../src/quest/QuestTable";
import { questScreen } from "../src/quest/render";
import { RETRO_H, RETRO_W, RETRO_ZOOM } from "../src/retro/pixels";

const PIXELS = RETRO_W * RETRO_ZOOM * RETRO_H * RETRO_ZOOM;

describe("Zubra Quest's controls", () => {
  it("has a screen of its own", () => {
    expect(() => controlsFor("zubraquest", { autofire: () => false })).toThrow(/own screen/);
  });
  it("turns a finger on the pad into one of eight ways, and nothing in the middle", () => {
    expect(padWay(2, 1, 10)).toEqual([0, 0]);
    expect(padWay(40, 3, 10)).toEqual([1, 0]);
    expect(padWay(-40, -3, 10)).toEqual([-1, 0]);
    expect(padWay(2, -40, 10)).toEqual([0, -1]);
    expect(padWay(30, 30, 10)).toEqual([1, 1]);
    expect(padWay(-30, 28, 10)).toEqual([-1, 1]);
  });
  it("changes to the next tool the hero has, and stays put with one or none", () => {
    expect(nextTool(0, ["sword"])).toBe(0);
    expect(nextTool(0, ["sword", "bow"])).toBe(0);
    expect(nextTool(0, ["sword", "bow", "hook"])).toBe(2);
    expect(nextTool(2, ["sword", "bow", "hook"])).toBe(0);
    expect(nextTool(0, ["sword", "bow", "bombs", "hook"])).toBe(1);
  });
});

describe("Zubra Quest's pictures", () => {
  it("has one for every foe, boss and thing the land holds", () => {
    const land = questWorld(7);
    for (const room of land.rooms) {
      for (const spawn of room.spawns) expect(spawn.kind.startsWith("boss:") ? BOSSES[spawn.kind.slice(5)] : FOES[spawn.kind], spawn.kind).toBeTruthy();
      for (const ware of room.wares) expect(ITEMS[ware.key], ware.key).toBeTruthy();
      for (const loot of Object.values(room.loot)) expect(ITEMS[loot.startsWith("coins") ? "coin" : loot], loot).toBeTruthy();
    }
    for (const den of QUEST_DENS) expect(BOSSES[den.boss], den.boss).toBeTruthy();
  });
  // Every country, tile and edge: thousands of pictures, about 5 s on a busy CI runner, so it has longer than the usual 5 s.
  it("paints every tile in every kind of country, thirty-two pixels square", () => {
    for (const biome of ["meadow", "dunes", "marsh", "crags", "cave", ...QUEST_DENS.map((den) => den.biome)]) for (const tile of Object.values(QUEST_TILE)) {
      for (const mask of [0, 5, 10, 15]) {
      const art = tileArt(biome, tile, 3, 0, mask);
      expect([art.w, art.h]).toEqual([32, 32]);
      // Nothing of a tile is left unpainted.
      for (let i = 3; i < art.data.length; i += 4) expect(art.data[i]).toBe(255);
      }
    }
  }, 20_000);
  it("draws a frame for a game as it is played, and for the title", () => {
    const screen = questScreen();
    const s = zubraQuest.newGame(zubraQuest.normalize(null), 1, 7);
    expect(screen.title(0, ["NEW QUEST"], 0)).toHaveLength(PIXELS * 4);
    for (let t = 0; t < 60 * 40; t++) {
      zubraQuest.step(s, [zubraQuest.bot(s, 0, { skill: 1, sloppy: 0 }, () => 0.5)]);
      screen.hear(s.events);
      screen.settle();
      if (t % 20 === 0) expect(screen.draw(zubraQuest.view(s), t)).toHaveLength(PIXELS * 4);
    }
    // The room is not left black: the hero's screen is mostly ground.
    const frame = screen.draw(zubraQuest.view(s), 1);
    let lit = 0;
    for (let i = 48 * RETRO_ZOOM * RETRO_W * RETRO_ZOOM * 4; i < frame.length; i += 4) if (frame[i]! + frame[i + 1]! + frame[i + 2]! > 120) lit++;
    expect(lit).toBeGreaterThan((PIXELS * (RETRO_H - 48)) / RETRO_H / 2);
  });
});
