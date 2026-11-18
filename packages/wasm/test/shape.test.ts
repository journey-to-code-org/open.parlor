// Changing what a level is built of: the shape read and written, the changes that can be made to
// it, the node builder run on the result, and the engine playing what comes out. On the real
// game's first level; skipped when the data isn't here (npm run build fetches it).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import data from "../games/shooter/data.json";
// @ts-expect-error a plain script, with no typings
import { sourcesHash } from "../scripts/sources.mjs";
import { startEngine } from "../src/shooter/engine.ts";
import { catalogue } from "../wad/catalogue.ts";
import { choices, ROOM_DOES, WALL_DOES } from "../wad/does.ts";
import { decodeShape, encodeShape, levelLumps, readLevel, SHAPE_LUMPS, type Shape, type ShapeLumps, wallNames } from "../wad/level.ts";
import { applyMod, type Change, fits, modFromWad, modToWad, wallLumps } from "../wad/mod.ts";
import { buildLevel, buildNodes } from "../wad/nodes.ts";
import { addRoomBeyond, addRoomInside, moveCorner, roomAt, splitWall, trouble, wallsAt } from "../wad/shape.ts";
import { readWad } from "../wad/wad.ts";

const here = (path: string) => join(import.meta.dirname, path);
const nodes = new WebAssembly.Module(readFileSync(here("../games/shooter/nodes/nodes.wasm")));

test("nodes.wasm was compiled from the C as it is now (if not: npm run nodes -w @open-parlor/wasm)", () => {
  const built = JSON.parse(readFileSync(here("../games/shooter/nodes/nodes.wasm.json"), "utf8")) as { sources: string };
  expect(built.sources).toBe(sourcesHash(here("../games/shooter/nodes")));
});

test("what isn't a WAD is refused by the node builder, with what it said", async () => {
  await expect(buildNodes(nodes, new Uint8Array(64))).rejects.toThrow(/WAD/);
});

/** Two square rooms side by side, 256 across, with an opening between them: enough to try every change on. */
function twoRooms(): Shape {
  const room = { floor: 0, ceiling: 128, floorFlat: "FLOOR0_1", ceilingFlat: "CEIL1_1", light: 160, special: 0, tag: 0 };
  const solid = (r: number) => ({ x: 0, y: 0, upper: "-", lower: "-", middle: "STARTAN3", room: r });
  const open = (r: number) => ({ x: 0, y: 0, upper: "STARTAN3", lower: "STARTAN3", middle: "-", room: r });
  const corners = [{ x: 0, y: 0 }, { x: 0, y: 256 }, { x: 256, y: 256 }, { x: 256, y: 0 }, { x: 512, y: 256 }, { x: 512, y: 0 }];
  // Each room's walls go round it clockwise, so their fronts are inside. The opening's front is in the first room.
  const walls = [[0, 1, 0], [1, 2, 0], [3, 0, 0], [2, 4, 1], [4, 5, 1], [5, 3, 1]].map(([from, to, r], i) => ({ from: from!, to: to!, flags: 1, special: 0, tag: 0, front: i, back: -1 }));
  const sides = [0, 0, 0, 1, 1, 1].map(solid);
  walls.push({ from: 2, to: 3, flags: 4, special: 0, tag: 0, front: sides.push(open(0)) - 1, back: sides.push(open(1)) - 1 });
  return { corners, walls, sides, rooms: [room, { ...room }] };
}

describe("a shape", () => {
  test("is written as it was read", () => {
    const shape = twoRooms();
    expect(decodeShape(encodeShape(shape))).toEqual(shape);
    // A corner no wall uses (a node builder leaves them behind) is dropped, and the walls still meet where they did.
    const spare = { ...shape, corners: [{ x: 9, y: 9 }, ...shape.corners], walls: shape.walls.map((wall) => ({ ...wall, from: wall.from + 1, to: wall.to + 1 })) };
    expect(decodeShape(encodeShape(spare))).toEqual(shape);
  });

  test("says which room a point is in", () => {
    const shape = twoRooms();
    expect([roomAt(shape, 100, 100), roomAt(shape, 300, 30), roomAt(shape, -50, 100), roomAt(shape, 600, 100), roomAt(shape, 100, 300)]).toEqual([0, 1, -1, -1, -1]);
  });

  test("lets a corner be moved, but not so that walls cross or shut", () => {
    const shape = twoRooms();
    expect(moveCorner(shape, 4, 640, 320)).toBeNull();
    expect(shape.corners[4]).toEqual({ x: 640, y: 320 });
    // Across the first room, through its far wall.
    expect(moveCorner(shape, 5, -64, 128)).toBe("Walls can't cross.");
    // Onto another corner.
    expect(moveCorner(shape, 5, 256, 0)).toBe("There is a corner there already.");
    expect(shape.corners[5]).toEqual({ x: 512, y: 0 });
    expect(trouble(shape, shape.walls.map((_, i) => i))).toBeNull();
  });

  test("splits a wall in two that look as the one did", () => {
    const shape = twoRooms();
    const corner = splitWall(shape, 6, 250, 100) as number;
    expect(shape.corners[corner]).toEqual({ x: 256, y: 104 });
    expect(shape.walls).toHaveLength(8);
    expect(wallsAt(shape, corner)).toEqual([6, 7]);
    const [first, second] = [shape.walls[6]!, shape.walls[7]!];
    expect([first.from, first.to, second.from, second.to]).toEqual([2, corner, corner, 3]);
    // The pictures carry on across the split: by 152 on the front's second half, by 104 on the back's first.
    expect([shape.sides[first.front]!.x, shape.sides[second.front]!.x, shape.sides[first.back]!.x, shape.sides[second.back]!.x]).toEqual([0, 152, 104, 0]);
    expect(roomAt(shape, 100, 100)).toBe(0);
    // A point at the wall's end is taken for its middle.
    expect(shape.corners[splitWall(shape, 0, 0, 0) as number]).toEqual({ x: 0, y: 128 });
  });

  test("takes a room inside a room, and one behind a wall", () => {
    const shape = twoRooms();
    const inner = addRoomInside(shape, 128, 128, 64) as number;
    expect(inner).toBe(2);
    expect([roomAt(shape, 128, 128), roomAt(shape, 40, 40), roomAt(shape, 300, 128)]).toEqual([2, 0, 1]);
    expect(shape.rooms[2]).toEqual(shape.rooms[0]);
    // Nowhere it would cross a wall, or sit across two rooms.
    expect(addRoomInside(shape, 256, 128, 64)).toMatch(/inside one room/);
    expect(addRoomInside(shape, 128, 128, 128)).toMatch(/inside one room|cross/);
    expect(shape.rooms).toHaveLength(3);

    const beyond = addRoomBeyond(shape, 4, 128) as number;
    expect(beyond).toBe(3);
    expect([roomAt(shape, 576, 128), roomAt(shape, 700, 128)]).toEqual([3, -1]);
    // The wall is now an opening, with the picture it had kept for above and below.
    expect(shape.walls[4]).toMatchObject({ flags: 4 });
    expect(shape.sides[shape.walls[4]!.front]).toMatchObject({ middle: "-", upper: "STARTAN3", lower: "STARTAN3", room: 1 });
    expect(shape.sides[shape.walls[4]!.back]).toMatchObject({ room: 3 });
    expect(addRoomBeyond(shape, 4)).toMatch(/already/);
    // Not into a room that is there: behind the first room's bottom wall after a room is put below the second's.
    expect(trouble(shape, shape.walls.map((_, i) => i))).toBeNull();
  });

  test("offers what walls and rooms do, and keeps a number it doesn't know", () => {
    expect(new Set(WALL_DOES.map((one) => one.number)).size).toBe(WALL_DOES.length);
    expect(new Set(ROOM_DOES.map((one) => one.number)).size).toBe(ROOM_DOES.length);
    expect(choices(WALL_DOES, 1)).toHaveLength(WALL_DOES.length);
    expect(choices(WALL_DOES, 9).at(-1)).toEqual({ value: "9", label: "Something else (number 9)" });
  });
});

const file = here(`../public/data/${data.file}`);

describe.skipIf(!existsSync(file))("the real game's first level", () => {
  const game = existsSync(file) ? new Uint8Array(gunzipSync(readFileSync(file))) : new Uint8Array(0);
  const wad = existsSync(file) ? readWad(game) : { kind: "IWAD" as const, lumps: [] };
  const engine = new WebAssembly.Module(readFileSync(here("../games/shooter/shooter.wasm")));
  const own = () => levelLumps(wad, "E1M1")!;
  const things = () => own().get("THINGS")!.lump.data;

  /** The level played for a moment from its start: whether the engine is still running, and what it drew. */
  async function play(bytes: Uint8Array) {
    let clock = 0;
    let picture = new Uint8ClampedArray(0);
    const errors: string[] = [];
    const running = await startEngine(engine, new Map([["freedoom1.wad", bytes]]), "freedoom1.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), log: (line) => void (/error/i.test(line) && errors.push(line)) }, ["-warp", "1", "1", "-nomonsters"]);
    const run = (tics: number) => {
      for (let i = 0; i < tics; i++) {
        clock += 1000 / 35;
        running.frame();
      }
    };
    run(60);
    const stood = picture;
    // A turn all the way round and a walk forward: every wall in sight is drawn, and the player moves through the nodes.
    running.analog(60, 0, 40);
    run(120);
    return { stopped: running.stopped, errors, stood, after: picture };
  }
  /** How much of the view (not the status bar) two pictures share. */
  const alike = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    let same = 0;
    for (let i = 0; i < 320 * 160 * 4; i++) same += a[i] === b[i] ? 1 : 0;
    return same / (320 * 160 * 4);
  };

  test("is read whole and written back byte for byte", () => {
    const level = readLevel(wad, "E1M1");
    expect(level.shape.walls).toHaveLength(own().get("LINEDEFS")!.lump.data.length / 14);
    expect(level.shape.walls.every((wall) => level.shape.sides[wall.front]!.room < level.shape.rooms.length)).toBe(true);
    const written = encodeShape(level.shape);
    for (const lump of ["LINEDEFS", "SIDEDEFS", "SECTORS"] as const) expect(written[lump]).toEqual(own().get(lump)!.lump.data.slice());
    // Its corners, less the ones the game's own node builder added, which no wall uses.
    expect(written.VERTEXES).toEqual(own().get("VERTEXES")!.lump.data.slice(0, written.VERTEXES.length));
    // Every picture its walls name is one the game has.
    const names = new Set(["-", ...wallNames(wad)]);
    expect(wallNames(wad).length).toBeGreaterThan(300);
    expect(level.shape.sides.flatMap((side) => [side.upper, side.lower, side.middle]).filter((name) => !names.has(name))).toEqual([]);
    // Where the player starts is in a room.
    const start = level.things.find((thing) => thing.type === 1)!;
    expect(roomAt(level.shape, start.x, start.y)).toBeGreaterThanOrEqual(0);
  });

  test("built again from its walls, is the level the engine plays, and looks as it did", async () => {
    const level = readLevel(wad, "E1M1");
    const data = await buildLevel(nodes, "E1M1", level.shape, things());
    expect(fits("walls", data)).toBe(true);
    expect([...wallLumps(data)!.keys()]).toEqual(["LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS", "NODES", "SECTORS", "REJECT", "BLOCKMAP"]);
    // The same shape comes back out of it.
    const lumps = wallLumps(data)!;
    const again = encodeShape(decodeShape(Object.fromEntries(SHAPE_LUMPS.map((name) => [name, lumps.get(name)])) as ShapeLumps));
    for (const lump of SHAPE_LUMPS) expect(again[lump]).toEqual(encodeShape(level.shape)[lump]);

    const changed = applyMod(game, [{ kind: "walls", name: "E1M1", data }]);
    expect(levelLumps(readWad(changed), "E1M1")!.get("NODES")!.lump.data).toEqual(lumps.get("NODES"));
    expect(levelLumps(readWad(changed), "E1M2")!.get("NODES")!.lump.data).toEqual(levelLumps(wad, "E1M2")!.get("NODES")!.lump.data);
    const [before, after] = [await play(game), await play(changed)];
    expect(after.stopped).toBeNull();
    expect(after.errors).toEqual([]);
    // Other nodes cut the walls elsewhere, so a few pixels along the cuts may differ; the rooms are the same.
    expect(alike(before.stood, after.stood)).toBeGreaterThan(0.97);
    expect(alike(before.after, after.after)).toBeGreaterThan(0.9);
  });

  test("with a platform under the player and a room added behind a wall, is built and played", async () => {
    const level = readLevel(wad, "E1M1");
    const shape = level.shape;
    const start = level.things.find((thing) => thing.type === 1)!;
    const round = roomAt(shape, start.x, start.y);
    const platform = addRoomInside(shape, start.x, start.y, 64) as number;
    expect(typeof platform).toBe("number");
    shape.rooms[platform]!.floor += 24;
    expect(roomAt(shape, start.x, start.y)).toBe(platform);

    // The first wall of the player's room with nothing behind it that has space beyond.
    const rooms = shape.rooms.length;
    const wall = shape.walls.findIndex((one, index) => one.back < 0 && shape.sides[one.front]!.room === round && typeof addRoomBeyond(shape, index, 96) === "number");
    expect(wall).toBeGreaterThanOrEqual(0);
    expect(shape.rooms).toHaveLength(rooms + 1);
    const corner = splitWall(shape, wall) as number;
    expect(typeof corner).toBe("number");
    expect(trouble(shape, shape.walls.map((_, i) => i))).toBeNull();

    const change: Change = { kind: "walls", name: "E1M1", data: await buildLevel(nodes, "E1M1", shape, things()) };
    const changed = applyMod(game, [change]);
    const [before, after] = [await play(game), await play(changed)];
    expect(after.stopped).toBeNull();
    expect(after.errors).toEqual([]);
    // Standing 24 higher, the room is seen from somewhere else.
    expect(alike(before.stood, after.stood)).toBeLessThan(0.9);

    // Kept as a file for other engines: the level whole. And taken back from it as the same walls, with what is placed in it left as the game's.
    const kept = modToWad([change], wad);
    expect(readWad(kept).lumps.map((one) => one.name)).toEqual(["E1M1", "THINGS", "LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS", "NODES", "SECTORS", "REJECT", "BLOCKMAP"]);
    const back = modFromWad(kept, catalogue(wad), wad);
    expect(back.skipped).toEqual([]);
    expect(back.changes.map((one) => `${one.kind}/${one.name}`)).toEqual(["walls/E1M1"]);
    expect(back.changes[0]!.data).toEqual(change.data);
  });
});
