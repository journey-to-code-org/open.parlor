// The pictures on walls. A wall's picture isn't a lump: it is a recipe, in the TEXTURE1 and
// TEXTURE2 lumps, for laying one or more "patches" (the lumps between P_START and P_END) on a
// rectangle. PNAMES lists the patches' names; a recipe names them by their place in that list.
// This reads the recipes and puts a picture together, to show what a wall will look like.
import { decodePatch, type Picture } from "./picture.ts";
import type { Lump, Wad } from "./wad.ts";

export interface WallPicture {
  name: string;
  width: number;
  height: number;
  /** The patches, in the order they are laid: later ones over earlier. */
  patches: { x: number; y: number; patch: string }[];
}

/** The last lump of a name, as the engine takes it. */
const last = (wad: Wad, name: string) => wad.lumps.filter((lump) => lump.name === name).at(-1)?.data;
const nameAt = (data: Uint8Array, at: number) => String.fromCharCode(...data.subarray(at, at + 8)).replace(/\0.*$/, "").toUpperCase();

/** Every wall picture a game has, by name. One named twice is the first, as it is to the engine. */
export function wallPictures(wad: Wad): Map<string, WallPicture> {
  const found = new Map<string, WallPicture>();
  const list = last(wad, "PNAMES");
  if (!list || list.length < 4) return found;
  const count = new DataView(list.buffer, list.byteOffset, list.byteLength).getInt32(0, true);
  const patchNames = Array.from({ length: Math.max(0, Math.min(count, (list.length - 4) >> 3)) }, (_, i) => nameAt(list, 4 + i * 8));
  for (const table of ["TEXTURE1", "TEXTURE2"]) {
    const data = last(wad, table);
    if (!data || data.length < 4) continue;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const recipes = view.getInt32(0, true);
    for (let i = 0; i < recipes && 8 + i * 4 <= data.length; i++) {
      const at = view.getInt32(4 + i * 4, true);
      // Twenty-two bytes: a name, four unused, the size, four unused, how many patches; then ten bytes a patch.
      if (at < 0 || at + 22 > data.length) continue;
      const patches = view.getInt16(at + 20, true);
      if (patches < 0 || at + 22 + patches * 10 > data.length) continue;
      const picture: WallPicture = { name: nameAt(data, at), width: view.getInt16(at + 12, true), height: view.getInt16(at + 14, true), patches: [] };
      for (let p = 0; p < patches; p++) {
        const from = at + 22 + p * 10;
        const patch = patchNames[view.getInt16(from + 4, true)];
        if (patch) picture.patches.push({ x: view.getInt16(from, true), y: view.getInt16(from + 2, true), patch });
      }
      if (!found.has(picture.name)) found.set(picture.name, picture);
    }
  }
  return found;
}

/**
 * A wall picture, put together. `lump` gives a patch's bytes by name, so that a patch someone has
 * changed shows as they changed it. Null if the size is nonsense; a patch that is missing or
 * unreadable is left out, and where no patch reaches is see-through.
 */
export function composeWall(wall: WallPicture, lump: (name: string) => Uint8Array | undefined): Picture | null {
  const { width, height } = wall;
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) return null;
  const picture: Picture = { width, height, left: 0, top: 0, pixels: new Uint8Array(width * height), solid: new Uint8Array(width * height) };
  for (const { x, y, patch } of wall.patches) {
    const data = lump(patch);
    const piece = data && decodePatch(data);
    if (!piece) continue;
    for (let py = Math.max(0, -y); py < piece.height && y + py < height; py++)
      for (let px = Math.max(0, -x); px < piece.width && x + px < width; px++) {
        if (!piece.solid[py * piece.width + px]) continue;
        const to = (y + py) * width + x + px;
        picture.pixels[to] = piece.pixels[py * piece.width + px]!;
        picture.solid[to] = 1;
      }
  }
  return picture;
}

const nameBytes = (name: string) => Uint8Array.from({ length: 8 }, (_, i) => name.charCodeAt(i) || 0);

/**
 * The lumps of a game with wall pictures added: each a picture of one piece, the piece of its own
 * name. The piece goes on the end of PNAMES and its recipe on the end of TEXTURE1, both of which
 * the game must have. One the game already has a picture named for is left as it is.
 */
export function addWallPictures(lumps: Lump[], walls: { name: string; width: number; height: number }[]): Lump[] {
  const wad: Wad = { kind: "PWAD", lumps };
  const have = wallPictures(wad);
  const wanted = walls.filter((wall, index) => !have.has(wall.name) && walls.findIndex((one) => one.name === wall.name) === index);
  const at = (name: string) => lumps.map((lump) => lump.name).lastIndexOf(name);
  const [names, table] = [at("PNAMES"), at("TEXTURE1")];
  if (!wanted.length || names < 0 || table < 0 || lumps[names]!.data.length < 4 || lumps[table]!.data.length < 4) return lumps;
  const [list, recipes] = [lumps[names]!.data, lumps[table]!.data];
  const pieces = new DataView(list.buffer, list.byteOffset, list.byteLength).getInt32(0, true);
  const count = new DataView(recipes.buffer, recipes.byteOffset, recipes.byteLength).getInt32(0, true);
  if (pieces < 0 || 4 + pieces * 8 > list.length || count < 0 || 4 + count * 4 > recipes.length) return lumps;

  const newList = new Uint8Array(4 + (pieces + wanted.length) * 8);
  newList.set(list.subarray(0, 4 + pieces * 8));
  new DataView(newList.buffer).setInt32(0, pieces + wanted.length, true);
  wanted.forEach((wall, i) => newList.set(nameBytes(wall.name), 4 + (pieces + i) * 8));

  // The table of where each recipe is grows by four bytes a new one, so every recipe moves along; the new ones (32 bytes each) go on the end.
  const shift = wanted.length * 4;
  const body = recipes.subarray(4 + count * 4);
  const newTable = new Uint8Array(4 + (count + wanted.length) * 4 + body.length + wanted.length * 32);
  const [from, to] = [new DataView(recipes.buffer, recipes.byteOffset, recipes.byteLength), new DataView(newTable.buffer)];
  to.setInt32(0, count + wanted.length, true);
  for (let i = 0; i < count; i++) to.setInt32(4 + i * 4, from.getInt32(4 + i * 4, true) + shift, true);
  newTable.set(body, 4 + (count + wanted.length) * 4);
  wanted.forEach((wall, i) => {
    const start = recipes.length + shift + i * 32;
    to.setInt32(4 + (count + i) * 4, start, true);
    newTable.set(nameBytes(wall.name), start);
    to.setInt16(start + 12, wall.width, true);
    to.setInt16(start + 14, wall.height, true);
    to.setInt16(start + 20, 1, true);
    // One piece, at the corner: x, y, which piece, and two the engine ignores.
    to.setInt16(start + 26, pieces + i, true);
  });
  return lumps.map((lump, index) => (index === names ? { name: lump.name, data: newList } : index === table ? { name: lump.name, data: newTable } : lump));
}
