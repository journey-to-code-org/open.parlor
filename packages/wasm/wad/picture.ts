// The engine's pictures, to and from pixels.
//
// Everything is drawn in one palette of 256 colours (the PLAYPAL lump), so a pixel is a number
// from 0 to 255. There are two kinds of picture:
//
// - A "patch": sprites, wall pieces, the status bar, the menus, the title. It is stored as
//   columns, each a list of "posts" (runs of pixels with a gap above), which is how it has
//   see-through parts. It carries two offsets that say where it sits: for a sprite, where its
//   feet are.
// - A "flat": a floor or a ceiling. Exactly 64 by 64 pixels, row by row, nothing see-through.

export interface Picture {
  width: number;
  height: number;
  /** Where the picture's origin is, from its left and top: for a sprite, its middle and its feet. */
  left: number;
  top: number;
  /** A palette number for each pixel, row by row. */
  pixels: Uint8Array;
  /** 1 where there is a pixel, 0 where the picture is see-through. */
  solid: Uint8Array;
}

/** A patch can't be taller: a post's place in its column is one byte, and 255 ends the column. */
export const TALLEST = 254;
export const FLAT = 64;

/** The picture in a patch lump, or null if the lump isn't one. Strict: every column must be whole. */
export function decodePatch(data: Uint8Array): Picture | null {
  if (data.length < 8) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getInt16(0, true);
  const height = view.getInt16(2, true);
  if (width < 1 || width > 2048 || height < 1 || height > TALLEST || data.length < 8 + width * 4) return null;
  const picture: Picture = { width, height, left: view.getInt16(4, true), top: view.getInt16(6, true), pixels: new Uint8Array(width * height), solid: new Uint8Array(width * height) };
  for (let x = 0; x < width; x++) {
    let at = view.getInt32(8 + x * 4, true);
    if (at < 8 + width * 4 || at >= data.length) return null;
    for (;;) {
      const start = data[at]!;
      if (start === 255) break;
      const length = data[at + 1];
      // A post is its place, its length, a spare byte, the pixels, and a spare byte.
      if (length === undefined || at + 4 + length > data.length || start + length > height) return null;
      for (let i = 0; i < length; i++) {
        picture.pixels[(start + i) * width + x] = data[at + 3 + i]!;
        picture.solid[(start + i) * width + x] = 1;
      }
      at += length + 4;
      if (at >= data.length) return null;
    }
  }
  return picture;
}

/** A patch lump of this picture. */
export function encodePatch(picture: Picture): Uint8Array {
  const { width, height, pixels, solid } = picture;
  if (width < 1 || height < 1 || height > TALLEST) throw new Error(`A picture for the engine is at most ${TALLEST} pixels tall.`);
  const columns: number[][] = [];
  for (let x = 0; x < width; x++) {
    const column: number[] = [];
    for (let y = 0; y < height; ) {
      if (!solid[y * width + x]) {
        y++;
        continue;
      }
      // A run of pixels, in posts of no more than 128: the original tools wrote none longer.
      let end = y;
      while (end < height && solid[end * width + x] && end - y < 128) end++;
      column.push(y, end - y, 0);
      for (let i = y; i < end; i++) column.push(pixels[i * width + x]!);
      column.push(0);
      y = end;
    }
    column.push(255);
    columns.push(column);
  }
  const bytes = new Uint8Array(8 + width * 4 + columns.reduce((sum, column) => sum + column.length, 0));
  const view = new DataView(bytes.buffer);
  view.setInt16(0, width, true);
  view.setInt16(2, height, true);
  view.setInt16(4, picture.left, true);
  view.setInt16(6, picture.top, true);
  let at = 8 + width * 4;
  columns.forEach((column, x) => {
    view.setInt32(8 + x * 4, at, true);
    bytes.set(column, at);
    at += column.length;
  });
  return bytes;
}

/** The picture in a flat lump, or null if the lump isn't one. */
export function decodeFlat(data: Uint8Array): Picture | null {
  // A few flats carry spare bytes after their 4096; none has fewer.
  if (data.length < FLAT * FLAT) return null;
  return { width: FLAT, height: FLAT, left: 0, top: 0, pixels: data.slice(0, FLAT * FLAT), solid: new Uint8Array(FLAT * FLAT).fill(1) };
}

/** A flat lump of this picture, which must be 64 by 64. See-through pixels have no meaning on a floor: they keep whatever number they have. */
export function encodeFlat(picture: Picture): Uint8Array {
  if (picture.width !== FLAT || picture.height !== FLAT) throw new Error("A floor is 64 by 64 pixels.");
  return picture.pixels.slice();
}

/** The game's colours: 256 of them, three bytes each (red, green, blue). The first palette of a PLAYPAL lump. */
export type Palette = Uint8Array;

export function paletteOf(playpal: Uint8Array): Palette {
  if (playpal.length < 768) throw new Error("This game has no palette.");
  return playpal.slice(0, 768);
}

/** The picture as a canvas takes it: red, green, blue, alpha for each pixel. */
export function toRgba(picture: Picture, palette: Palette): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(picture.width * picture.height * 4);
  for (let i = 0; i < picture.pixels.length; i++) {
    if (!picture.solid[i]) continue;
    const colour = picture.pixels[i]! * 3;
    rgba[i * 4] = palette[colour]!;
    rgba[i * 4 + 1] = palette[colour + 1]!;
    rgba[i * 4 + 2] = palette[colour + 2]!;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/**
 * For a palette, the number of each of its own colours, and the nearest of its colours to any
 * other: the second worked out once, for colours rounded to five bits a channel.
 */
const lookups = new WeakMap<Palette, { own: Map<number, number>; near: Uint8Array }>();

function lookup(palette: Palette) {
  let found = lookups.get(palette);
  if (found) return found;
  const own = new Map<number, number>();
  // A colour the palette has twice is its first.
  for (let i = 255; i >= 0; i--) own.set((palette[i * 3]! << 16) | (palette[i * 3 + 1]! << 8) | palette[i * 3 + 2]!, i);
  const near = new Uint8Array(32 * 32 * 32);
  for (let colour = 0; colour < near.length; colour++) {
    // The middle of each rounded step.
    const r = ((colour >> 10) << 3) | 4;
    const g = (((colour >> 5) & 31) << 3) | 4;
    const b = ((colour & 31) << 3) | 4;
    let best = 0;
    let distance = Infinity;
    for (let i = 0; i < 256; i++) {
      const dr = r - palette[i * 3]!;
      const dg = g - palette[i * 3 + 1]!;
      const db = b - palette[i * 3 + 2]!;
      // Weighted the way an eye is: most by green, least by blue.
      const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
      if (d < distance) {
        distance = d;
        best = i;
      }
    }
    near[colour] = best;
  }
  found = { own, near };
  lookups.set(palette, found);
  return found;
}

/**
 * Any picture, in the game's colours: a pixel already one of them stays as it is, any other becomes
 * the palette's nearest colour to it, and a pixel less than half there becomes see-through. `rgba` is red, green, blue, alpha, row by row.
 */
export function fromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, palette: Palette, origin: { left: number; top: number } = { left: 0, top: 0 }): Picture {
  const { own, near } = lookup(palette);
  const picture: Picture = { width, height, ...origin, pixels: new Uint8Array(width * height), solid: new Uint8Array(width * height) };
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3]! < 128) continue;
    picture.solid[i] = 1;
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    picture.pixels[i] = own.get((r << 16) | (g << 8) | b) ?? near[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]!;
  }
  return picture;
}
