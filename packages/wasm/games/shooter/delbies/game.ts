// Delbie's Doomsday: what is the game's own, laid over Freedoom. A WAD of the title
// picture, the name over the menu, the rats, and the levels there are so far, built from their plans.
//
// scripts/build-delbies.mjs writes it to delbies.wad, which is committed; the page fetches that
// and lays it over the game's data (wad/mod.ts: layer), for a game alone or with others.
import { encodeThings, type Shape, type Thing } from "../../../wad/level.ts";
import { buildLevel } from "../../../wad/nodes.ts";
import { modToWad } from "../../../wad/mod.ts";
import { encodePatch, type Picture } from "../../../wad/picture.ts";
import { fromPlan, wallNear } from "../../../wad/plan.ts";
import { roomAt, trouble } from "../../../wad/shape.ts";
import { type Lump, readWad, writeWad } from "../../../wad/wad.ts";
import * as mainFloor from "./main-floor.ts";

export interface Level {
  /** The level of the game it takes the place of. */
  name: string;
  title: string;
  shape: Shape;
  things: Thing[];
}

/** The levels, built from their plans. */
export function levels(): Level[] {
  const { shape } = fromPlan(mainFloor.plan);
  const out = shape.walls[wallNear(shape, mainFloor.exit.x, mainFloor.exit.y)]!;
  out.special = 11;
  shape.sides[out.front]!.middle = mainFloor.exit.picture;
  return [{ name: "E1M1", title: "The main floor", shape, things: mainFloor.things }];
}

/** What is wrong with a level, if anything: walls that cross, or something placed inside a wall. */
export function faults(level: Level): string[] {
  const found: string[] = [];
  const why = trouble(level.shape, level.shape.walls.map((_, index) => index));
  if (why) found.push(why);
  for (const thing of level.things) if (roomAt(level.shape, thing.x, thing.y) < 0) found.push(`Thing ${thing.type} at ${thing.x}, ${thing.y} is in no room.`);
  if (!level.things.some((thing) => thing.type === 1)) found.push("There is nowhere for the first player to start.");
  return found;
}

/** Every picture name the levels use: walls, and floors and ceilings. */
export function picturesUsed(all = levels()): { walls: string[]; flats: string[] } {
  const walls = new Set(all.flatMap((level) => level.shape.sides.flatMap((side) => [side.upper, side.lower, side.middle])));
  walls.delete("-");
  return { walls: [...walls].sort(), flats: [...new Set(all.flatMap((level) => level.shape.rooms.flatMap((room) => [room.floorFlat, room.ceilingFlat])))].sort() };
}

export interface Art {
  /** 320 by 200, a palette colour a pixel. */
  title: Uint8Array;
  /** The lettering for over the menu, its size, and where it is see-through. */
  logo: { pixels: Uint8Array; solid: Uint8Array; width: number; height: number };
  /** What the game says: words.txt. */
  words: Uint8Array;
  /** The rats and what they spit: each a picture, under the name of the sprite it takes the place of. */
  sprites: (Picture & { name: string })[];
}

/** The whole of it as a WAD. `nodes` is the node builder, compiled. */
export async function buildGame(nodes: WebAssembly.Module, art: Art): Promise<Uint8Array> {
  const lumps: Lump[] = [
    { name: "TITLEPIC", data: encodePatch({ width: 320, height: 200, left: 0, top: 0, pixels: art.title, solid: new Uint8Array(64000).fill(1) }) },
    { name: "M_DOOM", data: encodePatch({ width: art.logo.width, height: art.logo.height, left: 0, top: 0, pixels: art.logo.pixels, solid: art.logo.solid }) },
  ];
  lumps.push({ name: "WORDS", data: art.words });
  // Sprites go between their markers, as the engine and other tools expect.
  lumps.push(...readWad(modToWad(art.sprites.map((sprite) => ({ kind: "sprite" as const, name: sprite.name, data: encodePatch(sprite) })))).lumps);
  for (const level of levels()) {
    const wrong = faults(level);
    if (wrong.length) throw new Error(`${level.name} (${level.title}) can't be built: ${wrong.join(" ")}`);
    const placed = encodeThings(level.things);
    const built = readWad(await buildLevel(nodes, level.name, level.shape, placed));
    lumps.push({ name: level.name, data: new Uint8Array(0) }, { name: "THINGS", data: placed }, ...built.lumps);
  }
  return writeWad({ kind: "PWAD", lumps });
}
