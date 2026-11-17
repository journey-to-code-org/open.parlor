// A level, as far as placing things in it goes: its walls, to draw, and its things, to change.
//
// A level in a WAD is a marker lump with its name (E1M1, MAP01) and then ten lumps of fixed names.
// THINGS is everything that starts in the level: the players, the monsters, what can be picked up,
// the scenery. Changing it needs nothing else rebuilt, which changing the walls would.
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

export interface Level {
  name: string;
  lines: Line[];
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
  return lumps.has("THINGS") && lumps.has("LINEDEFS") && lumps.has("VERTEXES") ? lumps : null;
}

/** The names of a WAD's levels, in the order they are in it. */
export function levelNames(wad: Wad): string[] {
  return [...new Set(wad.lumps.filter((lump) => isLevelName(lump.name)).map((lump) => lump.name))].filter((name) => levelLumps(wad, name));
}

/** A level to draw and to place things in. `things`, if given, are used in place of the level's own. */
export function readLevel(wad: Wad, name: string, things?: Uint8Array): Level {
  const lumps = levelLumps(wad, name);
  if (!lumps) throw new Error(`This game has no level ${name}.`);
  const corners = lumps.get("VERTEXES")!.lump.data;
  const walls = lumps.get("LINEDEFS")!.lump.data;
  const corner = new DataView(corners.buffer, corners.byteOffset, corners.byteLength);
  const wall = new DataView(walls.buffer, walls.byteOffset, walls.byteLength);
  const count = corners.length >> 2;
  const lines: Line[] = [];
  const bounds = { left: Infinity, bottom: Infinity, right: -Infinity, top: -Infinity };
  // A line is fourteen bytes: its two corners, flags, what it does, a tag, and the wall on each side (65535 for none).
  for (let at = 0; at + 14 <= walls.length; at += 14) {
    const a = wall.getUint16(at, true);
    const b = wall.getUint16(at + 2, true);
    if (a >= count || b >= count) continue;
    const line: Line = { x1: corner.getInt16(a * 4, true), y1: corner.getInt16(a * 4 + 2, true), x2: corner.getInt16(b * 4, true), y2: corner.getInt16(b * 4 + 2, true), solid: wall.getUint16(at + 12, true) === 0xffff, special: wall.getUint16(at + 6, true) !== 0 };
    lines.push(line);
    bounds.left = Math.min(bounds.left, line.x1, line.x2);
    bounds.right = Math.max(bounds.right, line.x1, line.x2);
    bounds.bottom = Math.min(bounds.bottom, line.y1, line.y2);
    bounds.top = Math.max(bounds.top, line.y1, line.y2);
  }
  return { name, lines, things: decodeThings(things ?? lumps.get("THINGS")!.lump.data), bounds };
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
