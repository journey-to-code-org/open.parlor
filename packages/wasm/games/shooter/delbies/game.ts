// Delbie's Doomsday, whole: everything the engine needs to be a game, and all of it made here. Its
// colours, its walls, floors and skies, its title, menus and status bar, the rats, the tools, every
// sound, what it says, and its levels, built from their plans.
//
// scripts/build-delbies.mjs writes it to delbies.wad, which is committed; the page fetches that
// and gives it to the engine as the game, for a game alone or with others.
import { encodeThings, type Shape, type Thing } from "../../../wad/level.ts";
import { buildLevel } from "../../../wad/nodes.ts";
import { encodeFlat, encodePatch, type Picture } from "../../../wad/picture.ts";
import { encodeDmx, RATE, songLump } from "../../../wad/sound.ts";
import { fromPlan, wallNear } from "../../../wad/plan.ts";
import { roomAt, trouble } from "../../../wad/shape.ts";
import { type Lump, readWad, writeWad } from "../../../wad/wad.ts";
import * as attic from "./attic.ts";
import * as basement from "./basement.ts";
import { generate, TITLES } from "./generated.ts";
import { SONGS } from "./songs.ts";
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
  /** The game's colours: 14 palettes of 256 (the plain one, and it tinted for being hurt and so on), then 34 tables of each colour darker. */
  palette: Uint8Array;
  /** Every wall and sky, and every floor and ceiling: a palette colour a pixel. */
  textures: { name: string; kind: "wall" | "floor"; width: number; height: number; pixels: Uint8Array }[];
  /** Everything heard: each a byte a sample at the engine's rate, under the name the engine knows the sound by. */
  sounds: { name: string; samples: Uint8Array }[];
  /** What the game says: words.txt. */
  words: Uint8Array;
  /** The rats, the tools and everything else that stands in a level: each a picture, under the name the engine knows the sprite by. */
  sprites: (Picture & { name: string })[];
  /** The status bar's pictures: Delbie's face in each of its moods, and the bar itself. */
  screens: (Picture & { name: string })[];
}

const PALETTES = 14 * 768;
const name8 = (name: string) => Uint8Array.from({ length: 8 }, (_, i) => name.charCodeAt(i) || 0);

/**
 * The engine's two lists of walls: the names of the pictures walls are made of, and each wall's
 * recipe. Here every wall is one picture of its own name. The first wall of the list is one the
 * engine can't show (it takes its number for "no wall"), so a spare goes there.
 */
export function wallLists(walls: { name: string; width: number; height: number }[]): Lump[] {
  const all = [{ ...walls[0]!, name: "NOWALL", piece: 0 }, ...walls.map((wall, piece) => ({ ...wall, piece }))];
  const names = new Uint8Array(4 + walls.length * 8);
  new DataView(names.buffer).setInt32(0, walls.length, true);
  walls.forEach((wall, i) => names.set(name8(wall.name), 4 + i * 8));
  const table = new Uint8Array(4 + all.length * 4 + all.length * 32);
  const view = new DataView(table.buffer);
  view.setInt32(0, all.length, true);
  all.forEach((wall, i) => {
    const at = 4 + all.length * 4 + i * 32;
    view.setInt32(4 + i * 4, at, true);
    table.set(name8(wall.name), at);
    view.setInt16(at + 12, wall.width, true);
    view.setInt16(at + 14, wall.height, true);
    // One piece, at the wall's top left corner.
    view.setInt16(at + 20, 1, true);
    view.setInt16(at + 26, wall.piece, true);
    view.setInt16(at + 28, 1, true);
  });
  return [{ name: "TEXTURE1", data: table }, { name: "PNAMES", data: names }];
}

/** The whole of it as a WAD: a game of its own, needing no other. `nodes` is the node builder, compiled. */
export async function buildGame(nodes: WebAssembly.Module, art: Art): Promise<Uint8Array> {
  const marker = (name: string): Lump => ({ name, data: new Uint8Array(0) });
  const [walls, floors] = [art.textures.filter((one) => one.kind === "wall"), art.textures.filter((one) => one.kind === "floor")];
  const lumps: Lump[] = [
    { name: "PLAYPAL", data: art.palette.subarray(0, PALETTES) },
    { name: "COLORMAP", data: art.palette.subarray(PALETTES) },
    ...wallLists(walls),
    { name: "TITLEPIC", data: encodePatch({ width: 320, height: 200, left: 0, top: 0, pixels: art.title, solid: new Uint8Array(64000).fill(1) }) },
    { name: "M_DOOM", data: encodePatch({ width: art.logo.width, height: art.logo.height, left: 0, top: 0, pixels: art.logo.pixels, solid: art.logo.solid }) },
  ];
  lumps.push({ name: "WORDS", data: art.words }, ...art.screens.map((screen) => ({ name: screen.name, data: encodePatch(screen) })));
  // The songs: each lump only names its song, which the page fetches when the engine first asks for it (songs.ts).
  lumps.push(...Object.entries(SONGS).map(([name, song]) => ({ name, data: songLump(song) })));
  lumps.push(...art.sounds.map((sound) => ({ name: sound.name, data: encodeDmx({ rate: RATE, samples: Float32Array.from(sound.samples, (byte) => (byte - 128) / 127) }) })));
  // Sprites, the pictures walls are made of, and floors each go between their markers, as the engine and other tools expect.
  lumps.push(marker("S_START"), ...art.sprites.map((sprite) => ({ name: sprite.name, data: encodePatch(sprite) })), marker("S_END"));
  lumps.push(marker("P_START"), ...walls.map((wall) => ({ name: wall.name, data: encodePatch({ ...wall, left: 0, top: 0, solid: new Uint8Array(wall.pixels.length).fill(1) }) })), marker("P_END"));
  lumps.push(marker("F_START"), ...floors.map((floor) => ({ name: floor.name, data: encodeFlat({ ...floor, left: 0, top: 0, solid: new Uint8Array(floor.pixels.length).fill(1) }) })), marker("F_END"));
  const have = { walls: new Set(walls.map((wall) => wall.name)), flats: new Set(floors.map((floor) => floor.name)) };
  const used = picturesUsed();
  const missing = [...used.walls.filter((name) => !have.walls.has(name)), ...used.flats.filter((name) => !have.flats.has(name))];
  if (missing.length) throw new Error(`The levels use pictures nobody has drawn: ${missing.join(", ")}.`);
  for (const level of levels()) {
    const wrong = faults(level);
    if (wrong.length) throw new Error(`${level.name} (${level.title}) can't be built: ${wrong.join(" ")}`);
    const placed = encodeThings(level.things);
    const built = readWad(await buildLevel(nodes, level.name, level.shape, placed));
    lumps.push({ name: level.name, data: new Uint8Array(0) }, { name: "THINGS", data: placed }, ...built.lumps);
  }
  return writeWad({ kind: "IWAD", lumps });
}
