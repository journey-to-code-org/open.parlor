// Delbie's Doomsday: what is the game's own, laid over Freedoom. A WAD of the title
// picture, the name over the menu, the rats, and the levels there are so far, built from their plans.
//
// scripts/build-delbies.mjs writes it to delbies.wad, which is committed; the page fetches that
// and lays it over the game's data (wad/mod.ts: layer), for a game alone or with others.
import { encodeThings, type Shape, type Thing } from "../../../wad/level.ts";
import { buildLevel } from "../../../wad/nodes.ts";
import { modToWad } from "../../../wad/mod.ts";
import { encodePatch, type Picture } from "../../../wad/picture.ts";
import { encodeDmx, RATE } from "../../../wad/sound.ts";
import { fromPlan, wallNear } from "../../../wad/plan.ts";
import { roomAt, trouble } from "../../../wad/shape.ts";
import { type Lump, readWad, writeWad } from "../../../wad/wad.ts";
import * as attic from "./attic.ts";
import * as basement from "./basement.ts";
import { generate, TITLES } from "./generated.ts";
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
  // The three floors, in the order they are played: each in the place of one of the game's levels.
  // After them, the floors made by rule (generated.ts). Nine levels to an episode, as the engine counts them.
  const made = Object.keys(TITLES).map((level) => generate(Number(level)));
  return [mainFloor, attic, basement, ...made].map((floor, index) => {
    const { shape } = fromPlan(floor.plan);
    // The switch that ends the level.
    const out = shape.walls[wallNear(shape, floor.exit.x, floor.exit.y)]!;
    out.special = 11;
    shape.sides[out.front]!.middle = floor.exit.picture;
    return { name: `E${Math.floor(index / 9) + 1}M${(index % 9) + 1}`, title: floor.title, shape, things: floor.things };
  });
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
  /** The store's walls: pieces of wall, each under the name of the piece it takes the place of. */
  walls: (Picture & { name: string })[];
  /** The rats' voices: each a byte a sample at the engine's rate, under the name of the sound it takes the place of. */
  sounds: { name: string; samples: Uint8Array }[];
  /** What the game says: words.txt. */
  words: Uint8Array;
  /** The rats and what they spit: each a picture, under the name of the sprite it takes the place of. */
  sprites: (Picture & { name: string })[];
  /** The status bar's pictures: Delbie's face in each of its moods, and the bar itself. */
  screens: (Picture & { name: string })[];
}

/** The whole of it as a WAD. `nodes` is the node builder, compiled. */
export async function buildGame(nodes: WebAssembly.Module, art: Art): Promise<Uint8Array> {
  const lumps: Lump[] = [
    { name: "TITLEPIC", data: encodePatch({ width: 320, height: 200, left: 0, top: 0, pixels: art.title, solid: new Uint8Array(64000).fill(1) }) },
    { name: "M_DOOM", data: encodePatch({ width: art.logo.width, height: art.logo.height, left: 0, top: 0, pixels: art.logo.pixels, solid: art.logo.solid }) },
  ];
  lumps.push({ name: "WORDS", data: art.words }, ...art.screens.map((screen) => ({ name: screen.name, data: encodePatch(screen) })));
  lumps.push(...art.sounds.map((sound) => ({ name: sound.name, data: encodeDmx({ rate: RATE, samples: Float32Array.from(sound.samples, (byte) => (byte - 128) / 127) }) })));
  // Sprites go between their markers, as the engine and other tools expect.
  lumps.push(...readWad(modToWad([...art.sprites.map((sprite) => ({ kind: "sprite" as const, name: sprite.name, data: encodePatch(sprite) })), ...art.walls.map((wall) => ({ kind: "wall" as const, name: wall.name, data: encodePatch(wall) }))])).lumps);
  for (const level of levels()) {
    const wrong = faults(level);
    if (wrong.length) throw new Error(`${level.name} (${level.title}) can't be built: ${wrong.join(" ")}`);
    const placed = encodeThings(level.things);
    const built = readWad(await buildLevel(nodes, level.name, level.shape, placed));
    lumps.push({ name: level.name, data: new Uint8Array(0) }, { name: "THINGS", data: placed }, ...built.lumps);
  }
  return writeWad({ kind: "PWAD", lumps });
}
