// Delbie's Daycare & Geriatrics: a level written as a floor plan becomes a shape; the game's own
// WAD is what its plans and art now make; and, laid over the real game, it is what the engine
// plays. The last part is skipped when the game's data isn't here (npm run build fetches it).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import data from "../games/shooter/data.json";
import { buildGame, faults, levels, picturesUsed } from "../games/shooter/delbies/game.ts";
// @ts-expect-error a plain script, with no typings
import { art } from "../scripts/build-delbies.mjs";
import { startEngine } from "../src/shooter/engine.ts";
import { KEY } from "../src/shooter/keys.ts";
import { catalogue } from "../wad/catalogue.ts";
import { levelLumps, readLevel, wallNames, WALL_LOWER_UNPEGGED } from "../wad/level.ts";
import { layer, modFromWad } from "../wad/mod.ts";
import { fromPlan, type Look, wallNear } from "../wad/plan.ts";
import { roomAt, trouble, wallsOf } from "../wad/shape.ts";
import { linesFor, MOMENTS, plain, readWords, setLines, TEXTS, writeWords } from "../wad/words.ts";
import { readWad, writeWad } from "../wad/wad.ts";

const here = (path: string) => join(import.meta.dirname, path);
const nodes = new WebAssembly.Module(readFileSync(here("../games/shooter/nodes/nodes.wasm")));
const look = (more: Partial<Look> = {}): Look => ({ floor: 0, ceiling: 128, floorFlat: "FLOOR0_1", ceilingFlat: "CEIL3_5", light: 160, wall: "GRAY1", ...more });

describe("a floor plan", () => {
  // Two rooms with a wall of 16 between them, a door through it, and a pillar in the first.
  const plan = {
    rooms: { west: look(), east: look({ floor: 24, wall: "BROWN1", trim: "STEP4" }), door: look({ door: "DOOR3" }) },
    spaces: [["west", 0, 0, 256, 256], ["door", 256, 96, 272, 160], ["east", 272, 0, 512, 256]] as [string, number, number, number, number][],
    blocks: [[96, 96, 160, 160]] as [number, number, number, number][],
  };

  test("becomes rooms, walls where a room meets nothing, and openings where two meet", () => {
    const { shape, rooms } = fromPlan(plan);
    expect(rooms).toEqual({ west: 0, east: 1, door: 2 });
    expect(trouble(shape, shape.walls.map((_, i) => i))).toBeNull();
    // West: three whole walls, its east wall in two about the door, and the pillar's four. East: the same but the pillar. The door: two ends and two openings.
    expect(shape.walls).toHaveLength(5 + 4 + 5 + 4);
    expect([wallsOf(shape, 0).length, wallsOf(shape, 1).length, wallsOf(shape, 2).length]).toEqual([10, 6, 4]);
    expect([roomAt(shape, 50, 50), roomAt(shape, 128, 128), roomAt(shape, 264, 128), roomAt(shape, 264, 50), roomAt(shape, 400, 128)]).toEqual([0, -1, 2, -1, 1]);
    // The door is shut.
    expect(shape.rooms[2]).toMatchObject({ floor: 0, ceiling: 0 });
  });

  test("makes a door that is pushed from the rooms either side of it", () => {
    const { shape } = fromPlan(plan);
    const openings = shape.walls.filter((wall) => wall.special === 1);
    expect(openings.map((wall) => [shape.sides[wall.front]!.room, shape.sides[wall.back]!.room])).toEqual([[0, 2], [1, 2]]);
    // From outside it looks like a door; the walls it slides in stay still.
    expect(openings.map((wall) => shape.sides[wall.front]!.upper)).toEqual(["DOOR3", "DOOR3"]);
    const ends = wallsOf(shape, 2).map((index) => shape.walls[index]!).filter((wall) => wall.back < 0);
    expect(ends.map((wall) => [shape.sides[wall.front]!.middle, wall.flags & WALL_LOWER_UNPEGGED])).toEqual([["DOORTRAK", 16], ["DOORTRAK", 16]]);
  });

  test("shows a higher room's step from the lower one, and lays later rectangles over earlier", () => {
    const stepped = fromPlan({ rooms: { low: look(), high: look({ floor: 16, trim: "STEP4" }) }, spaces: [["low", 0, 0, 256, 128], ["high", 96, 0, 160, 128]] }).shape;
    // The low room is cut in two by the high one: an opening each side of it.
    const openings = stepped.walls.filter((wall) => wall.back >= 0);
    expect(openings).toHaveLength(2);
    for (const wall of openings) {
      const [low, high] = stepped.sides[wall.front]!.room === 0 ? [wall.front, wall.back] : [wall.back, wall.front];
      expect([stepped.sides[low]!.lower, stepped.sides[high]!.lower]).toEqual(["STEP4", "GRAY1"]);
    }
    expect(stepped.walls[wallNear(stepped, 128, 0)]).toMatchObject({ back: -1 });
    expect(() => fromPlan({ rooms: { a: look(), b: look() }, spaces: [["a", 0, 0, 64, 64], ["b", 0, 0, 64, 64]] })).toThrow(/Nothing is left of the room "a"/);
    expect(() => fromPlan({ rooms: { a: look() }, spaces: [["c", 0, 0, 64, 64]] })).toThrow(/isn't one of its rooms/);
  });
});

describe("the game's own levels", () => {
  test("have nothing wrong with them", () => {
    for (const level of levels()) expect(faults(level)).toEqual([]);
    const [mainFloor] = levels();
    expect(mainFloor).toMatchObject({ name: "E1M1", title: "The main floor" });
    // One way out, at the top of the stairs; the bathroom wants its key, from either side.
    expect(mainFloor!.shape.walls.filter((wall) => wall.special === 11)).toHaveLength(1);
    expect(mainFloor!.shape.walls.filter((wall) => wall.special === 26)).toHaveLength(2);
    // Each step can be climbed.
    const floors = mainFloor!.shape.rooms.map((room) => room.floor);
    for (const wall of mainFloor!.shape.walls.filter((one) => one.back >= 0)) {
      const [a, b] = [mainFloor!.shape.sides[wall.front]!.room, mainFloor!.shape.sides[wall.back]!.room];
      const rise = Math.abs(floors[a]! - floors[b]!);
      // But for the counter and the shelves and boxes, which are there to be in the way.
      expect(rise <= 24 || rise >= 40).toBe(true);
    }
  });

  test("delbies.wad is what the plans and the art now make (if not: npm run delbies -w @open-parlor/wasm)", async () => {
    const built = await buildGame(nodes, art());
    expect(Buffer.from(built).equals(readFileSync(here("../games/shooter/delbies/delbies.wad")))).toBe(true);
    const names = readWad(built).lumps.map((lump) => lump.name);
    expect(names.slice(0, 4)).toEqual(["TITLEPIC", "M_DOOM", "WORDS", "SS_START"]);
    expect(names.slice(-12)).toEqual(["SS_END", "E1M1", "THINGS", "LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS", "NODES", "SECTORS", "REJECT", "BLOCKMAP"]);
    expect(names).toHaveLength(16 + 175);
  });
});

describe("the game's words", () => {
  test("are read and written a line each, in what the engine's font can show", () => {
    const words = readWords(new TextEncoder().encode("# a comment\r\nPicked up a clip.=Fuses.\n!kill=Got him!|One less.\n=nothing\nno equals\nempty=\n"));
    expect([...words]).toEqual([["Picked up a clip.", "Fuses."], ["!kill", "Got him!|One less."]]);
    expect(linesFor(words, "kill")).toEqual(["Got him!", "One less."]);
    setLines(words, "see", ["  It\u2019s a rat\u2026 ", "", "one | two", "caf\u00e9"]);
    expect(linesFor(words, "see")).toEqual(["It's a rat...", "one  two", "caf"]);
    setLines(words, "kill", [" "]);
    expect(words.has("!kill")).toBe(false);
    expect(new TextDecoder().decode(writeWords(words))).toBe("Picked up a clip.=Fuses.\n!see=It's a rat...|one  two|caf\n");
    expect(plain("\u201cquoted\u201d \u2013 dash")).toBe('"quoted" - dash');
  });

  test("replace words the engine really has, and Delbie has something to say at every moment", () => {
    const engine = readFileSync(here("../games/shooter/engine/d_englsh.h"), "utf8");
    for (const text of TEXTS) expect(engine).toContain(`"${text.from}"`);
    const ours = readWords(new Uint8Array(readFileSync(here("../games/shooter/delbies/words.txt"))));
    for (const moment of MOMENTS) expect(linesFor(ours, moment.key).length).toBeGreaterThan(0);
    // Everything of ours that replaces the engine's words replaces words it has, and is short enough for the screen.
    for (const [from, to] of ours) {
      if (!from.startsWith("!")) expect(engine).toContain(`"${from}"`);
      for (const line of to.split("|")) expect(plain(line)).toBe(line);
      for (const line of to.split("|")) expect(line.length).toBeLessThanOrEqual(56);
    }
  });
});

const file = here(`../public/data/${data.file}`);

describe.skipIf(!existsSync(file))("laid over the real game", () => {
  const game = existsSync(file) ? new Uint8Array(gunzipSync(readFileSync(file))) : new Uint8Array(0);
  const wad = existsSync(file) ? readWad(game) : { kind: "IWAD" as const, lumps: [] };
  const over = new Uint8Array(readFileSync(here("../games/shooter/delbies/delbies.wad")));
  const engine = new WebAssembly.Module(readFileSync(here("../games/shooter/shooter.wasm")));

  test("every picture its levels name is one the game has", () => {
    const { walls, flats } = picturesUsed();
    const [haveWalls, haveFlats] = [new Set(wallNames(wad)), new Set(catalogue(wad).filter((asset) => asset.kind === "floor").map((asset) => asset.name))];
    expect(walls.filter((name) => !haveWalls.has(name))).toEqual([]);
    expect(flats.filter((name) => !haveFlats.has(name))).toEqual([]);
  });

  test("all of it has a place, and the rest of the game is as it was", () => {
    const { changes, skipped } = modFromWad(over, catalogue(wad), wad);
    // But for its words, which Freedoom has no lump for: layer() makes them a place.
    expect(skipped).toEqual(["WORDS"]);
    expect(changes.filter((change) => change.kind !== "sprite").map((change) => `${change.kind}/${change.name}`).sort()).toEqual(["screen/M_DOOM", "screen/TITLEPIC", "things/E1M1", "walls/E1M1"]);
    // The rats: every picture of the three monsters they take the place of, and of what the mutant spits; none left as it was.
    const drawn = new Set(changes.filter((change) => change.kind === "sprite").map((change) => change.name));
    const theirs = wad.lumps.map((lump) => lump.name).filter((name) => /^(SARG|TROO|BOSS)[A-Z][0-8]|^BAL1/.test(name));
    expect(theirs.filter((name) => !drawn.has(name))).toEqual([]);
    expect(drawn.size).toBe(theirs.length);
    const laid = readWad(layer(game, over));
    // One lump more than the game came with: its words, which Freedoom has no place for.
    expect(laid.lumps).toHaveLength(wad.lumps.length + 1);
    expect(readWords(laid.lumps.at(-1)!.data).get("E1M1: Hangar")).toBe("The main floor");
    expect(readLevel(laid, "E1M1").shape.rooms).toHaveLength(levels()[0]!.shape.rooms.length);
    expect(levelLumps(laid, "E1M2")!.get("LINEDEFS")!.lump.data).toEqual(levelLumps(wad, "E1M2")!.get("LINEDEFS")!.lump.data);
    expect(laid.lumps.filter((lump) => lump.name === "TITLEPIC").at(-1)!.data).toEqual(readWad(over).lumps[0]!.data);
  });

  test("the main floor is played: off the porch, through the front door, into the store", async () => {
    let clock = 0;
    let picture = new Uint8ClampedArray(0);
    const sounds: string[] = [];
    const laid = layer(game, over);
    const names = readWad(laid).lumps.map((lump) => lump.name);
    const running = await startEngine(engine, new Map([["freedoom1.wad", laid]]), "freedoom1.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), sound: { start: (_channel, lump) => void sounds.push(names[lump]!), update() {}, stop() {}, playing: () => false } }, ["-warp", "1", "1"]);
    const run = (tics: number) => {
      for (let i = 0; i < tics; i++) {
        clock += 1000 / 35;
        running.frame();
      }
    };
    const differ = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let changed = 0;
      for (let i = 0; i < 320 * 160 * 4; i++) changed += a[i] === b[i] ? 0 : 1;
      return changed / (320 * 160 * 4);
    };
    run(60);
    const porch = picture;
    // The second player's start is in line with the door; the first is a step to the left of it, so: forward and a little right.
    running.analog(50, 12, 0);
    run(50);
    running.analog(0, 0, 0);
    running.key(true, KEY.use);
    run(4);
    running.key(false, KEY.use);
    run(60);
    expect(sounds).toContain("DSDOROPN");
    running.analog(50, 0, 0);
    run(120);
    expect(running.stopped).toBeNull();
    // Inside, among the shelves, it looks nothing like the porch.
    expect(differ(porch, picture)).toBeGreaterThan(0.6);
    // And the rats have noticed: the engine's sound for its charging monster waking.
    run(60);
    expect(sounds).toContain("DSSGTSIT");
    expect(running.stopped).toBeNull();
  });

  test("the level starts with a line of Delbie's, and without its words says nothing", async () => {
    const top = async (bytes: Uint8Array) => {
      let clock = 0;
      let picture = new Uint8ClampedArray(0);
      const running = await startEngine(engine, new Map([["freedoom1.wad", bytes]]), "freedoom1.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()) }, ["-warp", "1", "1", "-nomonsters"]);
      for (let i = 0; i < 70; i++) {
        clock += 1000 / 35;
        running.frame();
      }
      expect(running.stopped).toBeNull();
      // The top ten rows: where a message is written.
      return picture.slice(0, 320 * 10 * 4);
    };
    const laid = layer(game, over);
    const quiet = readWad(laid);
    const silent = writeWad({ kind: quiet.kind, lumps: quiet.lumps.map((lump) => (lump.name === "WORDS" ? { name: lump.name, data: writeWords(new Map([["E1M1: Hangar", "The main floor"]])) } : lump)) });
    const [said, unsaid, again] = [await top(laid), await top(silent), await top(silent)];
    const differ = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.some((value, i) => value !== b[i]);
    expect(differ(unsaid, again)).toBe(false);
    expect(differ(said, unsaid)).toBe(true);
  });
});
