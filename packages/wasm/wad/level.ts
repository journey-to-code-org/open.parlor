// A level: what is placed in it, and what it is built of.
//
// A level in a WAD is a marker lump with its name (E1M1, MAP01) and then ten lumps of fixed names.
// THINGS is everything that starts in the level: the players, the monsters, what can be picked up,
// the scenery. Changing it needs nothing else rebuilt.
//
// Four lumps are the level's shape: VERTEXES (corners), LINEDEFS (walls, each between two
// corners), SIDEDEFS (what a wall looks like from one side, and which room that side is in) and
// SECTORS (rooms: a floor, a ceiling, how bright). The other five (SEGS, SSECTORS, NODES, REJECT,
// BLOCKMAP) are worked out from the shape by a node builder (nodes.ts) and must be worked out
// again when it changes.
import { describe } from "./names.ts";
import { THING_TYPES, type ThingType } from "./things.ts";
import type { Lump, Wad } from "./wad.ts";

export interface Thing {
  x: number;
  y: number;
  /** The way it faces, in degrees: 0 is east, 90 north. The engine keeps eight directions. */
  angle: number;
  /** What it is: a number from THING_TYPES, or a player's start. */
  type: number;
  /** See the FLAG_ bits. */
  flags: number;
}

/** In the game at the two easiest skills. */
export const FLAG_EASY = 1;
/** In the game at medium skill. */
export const FLAG_MEDIUM = 2;
/** In the game at the two hardest skills. */
export const FLAG_HARD = 4;
/** A monster that waits to be seen, and doesn't come at a noise. */
export const FLAG_AMBUSH = 8;
/** Only in a game with other players. */
export const FLAG_MULTIPLAYER = 16;

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** A wall with nothing behind it, as opposed to an edge between two rooms. */
  solid: boolean;
  /** Does something when crossed, pushed or shot: a door, a switch, a lift, an exit. */
  special: boolean;
}

/** Where walls meet. */
export interface Corner {
  x: number;
  y: number;
}

/** A wall, from one corner to another. Its front is on the right, going from `from` to `to`. */
export interface Wall {
  from: number;
  to: number;
  /** See the WALL_ bits. */
  flags: number;
  /** What it does when crossed, pushed or shot (a door, a switch, an exit); 0 for nothing. */
  special: number;
  /** Which rooms it does it to: those with the same tag. */
  tag: number;
  /** Its sides, in `sides`. A wall with nothing behind it has no back: -1. */
  front: number;
  back: number;
}

/** A wall seen from one side: up to three pictures, by name ("-" for none), and the room that side is in. */
export interface Side {
  x: number;
  y: number;
  /** Above the opening to the next room, where its ceiling is lower. */
  upper: string;
  /** Below the opening, where its floor is higher: a step. */
  lower: string;
  /** The whole wall where there is no opening; across an opening, something seen through (bars). */
  middle: string;
  room: number;
}

/** A room: one floor and one ceiling. */
export interface Room {
  floor: number;
  ceiling: number;
  floorFlat: string;
  ceilingFlat: string;
  /** 0 (dark) to 255. */
  light: number;
  /** What the room does: hurts, flickers, counts as a secret; 0 for nothing. */
  special: number;
  tag: number;
}

/** What a level is built of. */
export interface Shape {
  corners: Corner[];
  walls: Wall[];
  sides: Side[];
  rooms: Room[];
}

/** Players and monsters can't cross. */
export const WALL_BLOCKS = 1;
/** Monsters can't cross. */
export const WALL_BLOCKS_MONSTERS = 2;
/** Has a room on both sides. */
export const WALL_TWO_SIDED = 4;
/** The upper picture hangs from the ceiling, not up from the opening. */
export const WALL_UPPER_UNPEGGED = 8;
/** The lower picture is drawn from the ceiling down: it stays still when the floor moves. */
export const WALL_LOWER_UNPEGGED = 16;
/** Drawn on the map as a plain wall: a hidden door. */
export const WALL_SECRET = 32;
/** Sound doesn't pass. */
export const WALL_BLOCKS_SOUND = 64;

export interface Level {
  name: string;
  lines: Line[];
  shape: Shape;
  things: Thing[];
  /** The corners of everything in it. */
  bounds: { left: number; bottom: number; right: number; top: number };
}

/** The lumps of a level, in the order they follow its marker. */
export const LEVEL_LUMPS = ["THINGS", "LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS", "NODES", "SECTORS", "REJECT", "BLOCKMAP"];
export const isLevelName = (name: string) => /^(E\dM\d|MAP\d\d)$/.test(name);

const THING_BYTES = 10;

export function decodeThings(data: Uint8Array): Thing[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const things: Thing[] = [];
  for (let at = 0; at + THING_BYTES <= data.length; at += THING_BYTES) things.push({ x: view.getInt16(at, true), y: view.getInt16(at + 2, true), angle: view.getInt16(at + 4, true), type: view.getInt16(at + 6, true), flags: view.getInt16(at + 8, true) });
  return things;
}

export function encodeThings(things: Thing[]): Uint8Array {
  const data = new Uint8Array(things.length * THING_BYTES);
  const view = new DataView(data.buffer);
  things.forEach((thing, i) => {
    const at = i * THING_BYTES;
    view.setInt16(at, thing.x, true);
    view.setInt16(at + 2, thing.y, true);
    view.setInt16(at + 4, thing.angle, true);
    view.setInt16(at + 6, thing.type, true);
    view.setInt16(at + 8, thing.flags, true);
  });
  return data;
}

/** A level's lumps, by name, and where each is in the WAD; null if the WAD has no such level. */
export function levelLumps(wad: Wad, name: string): Map<string, { lump: Lump; index: number }> | null {
  // The last lump of the name, as the engine takes it.
  let marker = wad.lumps.length - 1;
  while (marker >= 0 && wad.lumps[marker]!.name !== name) marker--;
  if (marker < 0) return null;
  const lumps = new Map<string, { lump: Lump; index: number }>();
  for (let index = marker + 1; index < wad.lumps.length && LEVEL_LUMPS.includes(wad.lumps[index]!.name); index++) lumps.set(wad.lumps[index]!.name, { lump: wad.lumps[index]!, index });
  return lumps.has("THINGS") && SHAPE_LUMPS.every((lump) => lumps.has(lump)) ? lumps : null;
}

/** The names of a WAD's levels, in the order they are in it. */
export function levelNames(wad: Wad): string[] {
  return [...new Set(wad.lumps.filter((lump) => isLevelName(lump.name)).map((lump) => lump.name))].filter((name) => levelLumps(wad, name));
}

const NONE = 0xffff;
const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
/** A name of up to eight characters, as a lump keeps it: upper case, padded with zeros. */
const nameAt = (data: Uint8Array, at: number) => String.fromCharCode(...data.subarray(at, at + 8)).replace(/\0.*$/, "").toUpperCase();
function putName(data: Uint8Array, at: number, name: string) {
  for (let i = 0; i < 8; i++) data[at + i] = i < name.length ? name.charCodeAt(i) : 0;
}

/** The four lumps of a level's shape, by name. */
export type ShapeLumps = Record<"VERTEXES" | "LINEDEFS" | "SIDEDEFS" | "SECTORS", Uint8Array>;
export const SHAPE_LUMPS = ["VERTEXES", "LINEDEFS", "SIDEDEFS", "SECTORS"] as const;

/** Whether these could be a level's shape: each lump a whole number of its records, and some of each. */
export const isShape = (lumps: Partial<ShapeLumps>): lumps is ShapeLumps =>
  ([["VERTEXES", 4], ["LINEDEFS", 14], ["SIDEDEFS", 30], ["SECTORS", 26]] as const).every(([name, bytes]) => !!lumps[name]?.length && lumps[name]!.length % bytes === 0);

/** A level's shape, from its lumps. A wall that names a corner or a side that isn't there is left out. */
export function decodeShape(lumps: ShapeLumps): Shape {
  const corner = view(lumps.VERTEXES);
  const corners: Corner[] = [];
  for (let at = 0; at + 4 <= lumps.VERTEXES.length; at += 4) corners.push({ x: corner.getInt16(at, true), y: corner.getInt16(at + 2, true) });
  const side = view(lumps.SIDEDEFS);
  const sides: Side[] = [];
  // Thirty bytes: where the pictures start, three names, and the room.
  for (let at = 0; at + 30 <= lumps.SIDEDEFS.length; at += 30)
    sides.push({ x: side.getInt16(at, true), y: side.getInt16(at + 2, true), upper: nameAt(lumps.SIDEDEFS, at + 4), lower: nameAt(lumps.SIDEDEFS, at + 12), middle: nameAt(lumps.SIDEDEFS, at + 20), room: side.getUint16(at + 28, true) });
  const room = view(lumps.SECTORS);
  const rooms: Room[] = [];
  // Twenty-six bytes: two heights, two names, light, what it does, a tag.
  for (let at = 0; at + 26 <= lumps.SECTORS.length; at += 26)
    rooms.push({ floor: room.getInt16(at, true), ceiling: room.getInt16(at + 2, true), floorFlat: nameAt(lumps.SECTORS, at + 4), ceilingFlat: nameAt(lumps.SECTORS, at + 12), light: room.getInt16(at + 20, true), special: room.getInt16(at + 22, true), tag: room.getInt16(at + 24, true) });
  const wall = view(lumps.LINEDEFS);
  const walls: Wall[] = [];
  // Fourteen bytes: two corners, flags, what it does, a tag, and the side on each side (65535 for none).
  for (let at = 0; at + 14 <= lumps.LINEDEFS.length; at += 14) {
    const [from, to, front, back] = [wall.getUint16(at, true), wall.getUint16(at + 2, true), wall.getUint16(at + 10, true), wall.getUint16(at + 12, true)];
    if (from >= corners.length || to >= corners.length || front >= sides.length || (back !== NONE && back >= sides.length)) continue;
    walls.push({ from, to, flags: wall.getUint16(at + 4, true), special: wall.getUint16(at + 6, true), tag: wall.getUint16(at + 8, true), front, back: back === NONE ? -1 : back });
  }
  return { corners, walls, sides, rooms };
}

/** The lumps of a shape. Corners and sides no wall uses are left out: a node builder adds corners of its own, and they would pile up. */
export function encodeShape(shape: Shape): ShapeLumps {
  // In the order they were in, so a shape nothing was done to is written as it was read.
  const used = (indices: number[]) => new Map([...new Set(indices)].sort((a, b) => a - b).map((index, at) => [index, at]));
  const cornerAt = used(shape.walls.flatMap((wall) => [wall.from, wall.to]));
  const sideAt = used(shape.walls.flatMap((wall) => (wall.back >= 0 ? [wall.front, wall.back] : [wall.front])));
  const lumps: ShapeLumps = { VERTEXES: new Uint8Array(cornerAt.size * 4), LINEDEFS: new Uint8Array(shape.walls.length * 14), SIDEDEFS: new Uint8Array(sideAt.size * 30), SECTORS: new Uint8Array(shape.rooms.length * 26) };
  const [corner, wall, side, room] = [view(lumps.VERTEXES), view(lumps.LINEDEFS), view(lumps.SIDEDEFS), view(lumps.SECTORS)];
  for (const [index, at] of cornerAt) {
    corner.setInt16(at * 4, shape.corners[index]!.x, true);
    corner.setInt16(at * 4 + 2, shape.corners[index]!.y, true);
  }
  for (const [index, to] of sideAt) {
    const one = shape.sides[index]!;
    const at = to * 30;
    side.setInt16(at, one.x, true);
    side.setInt16(at + 2, one.y, true);
    putName(lumps.SIDEDEFS, at + 4, one.upper);
    putName(lumps.SIDEDEFS, at + 12, one.lower);
    putName(lumps.SIDEDEFS, at + 20, one.middle);
    side.setUint16(at + 28, one.room, true);
  }
  shape.walls.forEach((one, i) => {
    const at = i * 14;
    wall.setUint16(at, cornerAt.get(one.from)!, true);
    wall.setUint16(at + 2, cornerAt.get(one.to)!, true);
    wall.setUint16(at + 4, one.flags, true);
    wall.setUint16(at + 6, one.special, true);
    wall.setUint16(at + 8, one.tag, true);
    wall.setUint16(at + 10, sideAt.get(one.front)!, true);
    wall.setUint16(at + 12, one.back < 0 ? NONE : sideAt.get(one.back)!, true);
  });
  shape.rooms.forEach((one, i) => {
    const at = i * 26;
    room.setInt16(at, one.floor, true);
    room.setInt16(at + 2, one.ceiling, true);
    putName(lumps.SECTORS, at + 4, one.floorFlat);
    putName(lumps.SECTORS, at + 12, one.ceilingFlat);
    room.setInt16(at + 20, one.light, true);
    room.setInt16(at + 22, one.special, true);
    room.setInt16(at + 24, one.tag, true);
  });
  return lumps;
}

/** A shape's walls as lines to draw, and the corners of everything. */
export function outline(shape: Shape): Pick<Level, "lines" | "bounds"> {
  const bounds = { left: Infinity, bottom: Infinity, right: -Infinity, top: -Infinity };
  const lines = shape.walls.map((wall): Line => {
    const [a, b] = [shape.corners[wall.from]!, shape.corners[wall.to]!];
    bounds.left = Math.min(bounds.left, a.x, b.x);
    bounds.right = Math.max(bounds.right, a.x, b.x);
    bounds.bottom = Math.min(bounds.bottom, a.y, b.y);
    bounds.top = Math.max(bounds.top, a.y, b.y);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, solid: wall.back < 0, special: wall.special !== 0 };
  });
  return { lines, bounds };
}

/**
 * A level to draw and to change. `things`, if given, are used in place of the level's own; so is
 * `shape`: the lumps of a changed shape (what a "walls" change holds, see mod.ts).
 */
export function readLevel(wad: Wad, name: string, things?: Uint8Array, shape?: Partial<ShapeLumps>): Level {
  const lumps = levelLumps(wad, name);
  if (!lumps) throw new Error(`This game has no level ${name}.`);
  const own = Object.fromEntries(SHAPE_LUMPS.map((lump) => [lump, lumps.get(lump)?.lump.data])) as Partial<ShapeLumps>;
  const from = shape && isShape(shape) ? shape : own;
  if (!isShape(from)) throw new Error(`${name} isn't a whole level.`);
  const built = decodeShape(from);
  return { name, ...outline(built), shape: built, things: decodeThings(things ?? lumps.get("THINGS")!.lump.data) };
}

/** The names of the wall pictures a game has: what a side's upper, lower and middle can be. */
export function wallNames(wad: Wad): string[] {
  const names = new Set<string>();
  for (const lump of wad.lumps.filter((one) => /^TEXTURE[12]$/.test(one.name) && one.data.length >= 4)) {
    const table = view(lump.data);
    const count = table.getInt32(0, true);
    for (let i = 0; i < count && 8 + i * 4 <= lump.data.length; i++) {
      const at = table.getInt32(4 + i * 4, true);
      if (at >= 0 && at + 8 <= lump.data.length) names.add(nameAt(lump.data, at));
    }
  }
  return [...names].sort();
}

/** What a thing in a level is, for someone choosing or looking at one. */
export interface ThingKind extends ThingType {
  name: string;
  /** Where a player begins, a monster, something to pick up, or scenery. */
  group: "start" | "monster" | "pickup" | "scenery";
}

/** Things a level names that aren't in the engine's table of things: where players begin. */
const STARTS: [number, string][] = [
  [1, "Where player 1 starts"],
  [2, "Where player 2 starts"],
  [3, "Where player 3 starts"],
  [4, "Where player 4 starts"],
  [11, "A start for playing against each other"],
];
const OTHER_NAMES: Record<number, string> = { 14: "Where a teleport lands", 2035: "Barrel", 10: "A dead player", 12: "A dead player", 15: "A dead player" };
const MONSTER_SPRITES = new Set(THING_TYPES.filter((type) => type.sort === "monster").map((type) => type.sprite));

function named(type: ThingType): string {
  const known = OTHER_NAMES[type.number] ?? describe("sprite", type.sprite);
  if (!known) return `Scenery (${type.sprite})`;
  // A monster's sprite on something that isn't one is its body.
  return type.sort === "scenery" && MONSTER_SPRITES.has(type.sprite) && !OTHER_NAMES[type.number] ? `${known}, dead` : known;
}

/** Everything that can be placed in a level. */
export const THING_KINDS: ThingKind[] = [
  ...STARTS.map(([number, name]): ThingKind => ({ number, name, group: "start", sprite: "PLAY", frame: "A", radius: 16, sort: "scenery", solid: false })),
  ...THING_TYPES.map((type): ThingKind => ({ ...type, name: named(type), group: type.sort })),
].sort((a, b) => a.name.localeCompare(b.name));

const BY_NUMBER = new Map(THING_KINDS.map((kind) => [kind.number, kind]));

/** What a thing of this number is; one the engine doesn't know is called that. */
export const thingKind = (number: number): ThingKind => BY_NUMBER.get(number) ?? { number, name: `Something the engine doesn't know (${number})`, group: "scenery", sprite: "", frame: "A", radius: 16, sort: "scenery", solid: false };
