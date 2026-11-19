// Changing what a level is built of: the shape read and written, the changes that can be made to
// it, the node builder run on the result, and the engine playing what comes out. On the real
// game's first level; skipped when the data isn't here (npm run build fetches it).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error a plain script, with no typings
import { sourcesHash } from "../scripts/sources.mjs";
import { startEngine } from "../src/shooter/engine.ts";
import { catalogue } from "../wad/catalogue.ts";
import { choices, ROOM_DOES, WALL_DOES } from "../wad/does.ts";
import { decodeShape, encodeShape, levelLumps, readLevel, SHAPE_LUMPS, type Shape, type ShapeLumps, wallNames } from "../wad/level.ts";
import { applyMod, type Change, fits, modFromWad, modToWad, wallLumps } from "../wad/mod.ts";
import { buildLevel, buildNodes } from "../wad/nodes.ts";
import { addDoor, addRoomBeyond, addRoomInside, emptyLevel, lookOf, moveCorner, removeCorner, removeRoom, roomAt, splitWall, trouble, wallsAt, wallsOf } from "../wad/shape.ts";
import { composeWall, wallPictures } from "../wad/texture.ts";
import { encodeThings, levelNames } from "../wad/level.ts";
import { KEY } from "../src/shooter/keys.ts";
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

  test("gives up a room: one inside another closes over, any other leaves its neighbours walled", () => {
    const shape = twoRooms();
    const whole = structuredClone(shape);
    // A room inside the first, then taken away: the level is as it was (but for corners and sides no wall uses).
    const inner = addRoomInside(shape, 128, 128, 64) as number;
    expect(removeRoom(shape, inner)).toBeNull();
    expect(decodeShape(encodeShape(shape))).toEqual(whole);

    // The second room, with something standing in it, stays; empty, it goes, and the opening is the first room's wall.
    expect(removeRoom(shape, 1, [{ x: 300, y: 100 }])).toMatch(/Move what is placed/);
    expect(removeRoom(shape, 1, [{ x: 100, y: 100 }])).toBeNull();
    expect(shape.rooms).toHaveLength(1);
    expect(shape.walls).toHaveLength(4);
    expect([roomAt(shape, 100, 100), roomAt(shape, 300, 100)]).toEqual([0, -1]);
    const was = shape.walls.find((wall) => shape.corners[wall.from]!.x === 256 && shape.corners[wall.to]!.x === 256)!;
    expect(was).toMatchObject({ back: -1, flags: 1 });
    expect(shape.sides[was.front]).toMatchObject({ middle: "STARTAN3", upper: "-", lower: "-", room: 0 });
    expect(trouble(shape, shape.walls.map((_, i) => i))).toBeNull();
    expect(removeRoom(shape, 0)).toMatch(/one room/);

    // The first room of two: the second is renumbered, and its walls with it.
    const other = twoRooms();
    expect(removeRoom(other, 0)).toBeNull();
    expect([roomAt(other, 100, 100), roomAt(other, 300, 100)]).toEqual([-1, 0]);
    expect(wallsOf(other, 0)).toHaveLength(4);
    expect(decodeShape(encodeShape(other)).sides.every((side) => side.room === 0)).toBe(true);
  });

  test("gives up a corner where one wall was split, and nowhere else", () => {
    const shape = twoRooms();
    const whole = structuredClone(shape);
    const corner = splitWall(shape, 6) as number;
    expect(removeCorner(shape, corner)).toBeNull();
    expect(decodeShape(encodeShape(shape))).toEqual(whole);
    // Where three walls meet, and where the two belong to different rooms.
    expect(removeCorner(shape, 2)).toMatch(/More than two/);
    const beyond = addRoomBeyond(shape, 4, 128);
    expect(typeof beyond).toBe("number");
    expect(removeCorner(shape, 5)).toMatch(/More than two/);
    // A square's corner: the two walls would lie across the room, on no other wall, so it is allowed and the room is a triangle.
    const square = emptyLevel({ wall: "STARTAN3", floor: "FLOOR0_1", ceiling: "CEIL1_1" }).shape;
    expect(removeCorner(square, 0)).toBeNull();
    expect(square.walls).toHaveLength(3);
    // But not down to two walls, one on top of the other.
    expect(removeCorner(square, 1)).toMatch(/on top of another/);
    expect(square.walls).toHaveLength(3);
  });

  test("starts a level from one empty room", () => {
    const { shape, things } = emptyLevel({ wall: "STARTAN3", floor: "FLOOR0_1", ceiling: "CEIL1_1" });
    expect(trouble(shape, shape.walls.map((_, i) => i))).toBeNull();
    expect(things.map((thing) => thing.type)).toEqual([1, 2, 3, 4]);
    expect(things.every((thing) => roomAt(shape, thing.x, thing.y) === 0)).toBe(true);
    expect(lookOf(twoRooms())).toEqual({ wall: "STARTAN3", floor: "FLOOR0_1", ceiling: "CEIL1_1" });
  });

  test("offers what walls and rooms do, and keeps a number it doesn't know", () => {
    expect(new Set(WALL_DOES.map((one) => one.number)).size).toBe(WALL_DOES.length);
    expect(new Set(ROOM_DOES.map((one) => one.number)).size).toBe(ROOM_DOES.length);
    expect(choices(WALL_DOES, 1)).toHaveLength(WALL_DOES.length);
    expect(choices(WALL_DOES, 9).at(-1)).toEqual({ value: "9", label: "Something else (number 9)" });
  });
});

const file = here("../games/shooter/delbies/delbies.wad");

describe("the game's first level", () => {
  const game = new Uint8Array(readFileSync(file));
  const wad = readWad(game);
  const engine = new WebAssembly.Module(readFileSync(here("../games/shooter/shooter.wasm")));
  const own = () => levelLumps(wad, "E1M1")!;
  const things = () => own().get("THINGS")!.lump.data;

  /** The level played for a moment from its start: whether the engine is still running, and what it drew. */
  async function play(bytes: Uint8Array) {
    let clock = 0;
    let picture = new Uint8ClampedArray(0);
    const errors: string[] = [];
    const running = await startEngine(engine, new Map([["delbies.wad", bytes]]), "delbies.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), log: (line) => void (/error/i.test(line) && errors.push(line)) }, ["-warp", "1", "1", "-nomonsters"]);
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
    expect(wallNames(wad).length).toBeGreaterThan(20);
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

  test("started again as one empty room, with a door made in it, is played and the door opens", async () => {
    const look = lookOf(readLevel(wad, "E1M1").shape);
    expect(wallNames(wad)).toContain(look.wall);
    const { shape, things: placed } = emptyLevel(look);
    // A door in the north wall, and a room behind it, lit brighter.
    const north = shape.walls.findIndex((wall) => shape.corners[wall.from]!.y === 256 && shape.corners[wall.to]!.y === 256);
    const beyond = addDoor(shape, north, 256) as number;
    expect(beyond).toBe(2);
    expect(shape.rooms.map((room) => room.ceiling - room.floor)).toEqual([128, 0, 128]);
    shape.rooms[beyond]!.light = 255;
    // Each opening of the door has its front to the room it is pushed from.
    expect(shape.walls.filter((wall) => wall.special === 1).map((wall) => shape.sides[wall.front]!.room)).toEqual([0, 2]);
    // Where there is space for the door but not for the room behind it, nothing is left half made.
    const real = readLevel(wad, "E1M1").shape;
    const tight = real.walls.findIndex((wall, index) => wall.back < 0 && typeof addRoomBeyond(structuredClone(real), index, 16) === "number" && typeof addDoor(structuredClone(real), index, 1024) === "string");
    expect(tight).toBeGreaterThanOrEqual(0);
    const whole = structuredClone(real);
    expect(addDoor(real, tight, 1024)).toMatch(/cross|on top/);
    expect(real).toEqual(whole);
    expect(trouble(shape, shape.walls.map((_, i) => i))).toBeNull();
    // The player, at the door, facing it.
    placed[0] = { ...placed[0]!, x: 0, y: 208, angle: 90 };

    const changes: Change[] = [
      { kind: "things", name: "E1M1", data: encodeThings(placed) },
      { kind: "walls", name: "E1M1", data: await buildLevel(nodes, "E1M1", shape, encodeThings(placed)) },
    ];
    const changed = applyMod(game, changes);
    let clock = 0;
    let picture = new Uint8ClampedArray(0);
    const sounds: string[] = [];
    const running = await startEngine(engine, new Map([["delbies.wad", changed]]), "delbies.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), sound: { start: (_c, lump) => void sounds.push(wad.lumps[lump]!.name), update() {}, stop() {}, playing: () => false } }, ["-warp", "1", "1"]);
    const run = (tics: number) => {
      for (let i = 0; i < tics; i++) {
        clock += 1000 / 35;
        running.frame();
      }
    };
    run(60);
    const shut = picture;
    run(40);
    // Nothing moves in an empty room: the door stays shut until it is pushed.
    expect(alike(shut, picture)).toBeGreaterThan(0.99);
    running.key(true, KEY.use);
    run(4);
    running.key(false, KEY.use);
    run(70);
    expect(running.stopped).toBeNull();
    expect(sounds).toContain("DSDOROPN");
    // Open: the bright room beyond is where the door was.
    expect(alike(shut, picture)).toBeLessThan(0.7);
  });

  test("its wall pictures are put together from their patches", () => {
    const recipes = wallPictures(wad);
    expect([...recipes.keys()].sort()).toEqual(wallNames(wad));
    const patches = new Map(catalogue(wad).filter((asset) => asset.kind === "wall").map((asset) => [asset.name, wad.lumps[asset.index]!.data]));
    const look = lookOf(readLevel(wad, "E1M1").shape);
    const picture = composeWall(recipes.get(look.wall)!, (name) => patches.get(name))!;
    expect([picture.width, picture.height]).toEqual([recipes.get(look.wall)!.width, recipes.get(look.wall)!.height]);
    // Covered all over, and not all one colour.
    expect(picture.solid.every((bit) => bit === 1)).toBe(true);
    expect(new Set(picture.pixels).size).toBeGreaterThan(4);
    // Every one of the game's recipes finds every patch it names.
    const missing = [...recipes.values()].filter((recipe) => recipe.patches.some((piece) => !patches.has(piece.patch))).map((recipe) => recipe.name);
    expect(missing).toEqual([]);
  });
});
