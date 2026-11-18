// From a file someone dropped to a lump the engine reads, and back out to a file they can open
// in a paint program. This is the half of the editor that needs a browser: the decoding of
// pictures and sounds is the browser's; fitting them to the game is ../../wad.
import type { Kind } from "../../wad/catalogue.ts";
import { decodeFlat, decodePatch, encodeFlat, encodePatch, FLAT, fromRgba, type Palette, type Picture, TALLEST, toRgba } from "../../wad/picture.ts";
import { decodeDmx, encodeDmx, mixDown, RATE, resample, type Sound } from "../../wad/sound.ts";

export const isSound = (kind: Kind) => kind === "sound";

/** The picture in a lump of this kind, or null. */
export const pictureOf = (kind: Kind, data: Uint8Array): Picture | null => (kind === "floor" ? decodeFlat(data) : decodePatch(data));

export interface Fit {
  /** A sprite may take the new picture's own size (it is drawn that size in the game); everything else is made the size of what it replaces. */
  ownSize: boolean;
  /** Blend pixels when the size changes. Off keeps pixel art crisp. */
  smooth: boolean;
}

/** A sprite wider than this is a mistake; the engine's screen is 320. */
const WIDEST = 1024;

/** The widths a wall picture repeats properly at: the engine wraps one at a power of two. */
const WALL_WIDTHS = [8, 16, 32, 64, 128, 256];
/** As tall as a wall picture may be and still repeat up a wall. */
const WALL_HEIGHT = 128;

/**
 * A picture file, as a lump to take the place of `original`; or, with no original, as something
 * new: a floor the size floors are, a wall its own shape at a size the engine repeats properly.
 */
export async function pictureLump(file: Blob, kind: Kind, original: Picture | null, palette: Palette, fit: Fit): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file isn't a picture this browser can open.");
  });
  let { width, height } = original ?? { width: FLAT, height: FLAT };
  if (!original && kind !== "floor") {
    const scale = Math.min(1, WALL_HEIGHT / bitmap.height);
    const wide = bitmap.width * scale;
    width = WALL_WIDTHS.reduce((best, one) => (Math.abs(one - wide) < Math.abs(best - wide) ? one : best));
    height = Math.max(1, Math.round(bitmap.height * scale));
  } else if (kind === "sprite" && fit.ownSize) {
    // Its own size, brought down if it is bigger than the engine can draw.
    const scale = Math.min(1, TALLEST / bitmap.height, WIDEST / bitmap.width);
    width = Math.max(1, Math.round(bitmap.width * scale));
    height = Math.max(1, Math.round(bitmap.height * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = fit.smooth;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // Where it stands is kept: a sprite's feet stay on the floor, at whatever size.
  const origin = original ? { left: Math.round((original.left * width) / original.width), top: Math.round((original.top * height) / original.height) } : { left: 0, top: 0 };
  const picture = fromRgba(context.getImageData(0, 0, width, height).data, width, height, palette, origin);
  if (kind === "floor") {
    // A floor has no see-through: what would be is the palette's first colour, usually black.
    picture.solid.fill(1);
    return encodeFlat(picture);
  }
  return encodePatch(picture);
}

let audio: AudioContext | null = null;
const speaker = () => (audio ??= new AudioContext());

/** A sound file, as a lump: one channel, at the game's rate. */
export async function soundLump(file: Blob): Promise<Uint8Array> {
  const decoded = await speaker()
    .decodeAudioData(await file.arrayBuffer())
    .catch(() => {
      throw new Error("That file isn't a sound this browser can open.");
    });
  const samples = mixDown(Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)));
  return encodeDmx(resample({ rate: decoded.sampleRate, samples }, RATE));
}

/** Plays a sound lump. */
export function play(data: Uint8Array): void {
  const sound: Sound | null = decodeDmx(data);
  if (!sound) return;
  const context = speaker();
  void context.resume();
  const buffer = context.createBuffer(1, sound.samples.length, sound.rate);
  buffer.getChannelData(0).set(sound.samples);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
}

/** Draws a picture on a canvas, at its own size: the page scales it. */
export function draw(canvas: HTMLCanvasElement, picture: Picture, palette: Palette): void {
  canvas.width = picture.width;
  canvas.height = picture.height;
  canvas.getContext("2d")!.putImageData(new ImageData(toRgba(picture, palette), picture.width, picture.height), 0, 0);
}

/** Hands the browser a file to save. */
export function download(name: string, blob: Blob): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

/** The picture as a PNG, to change in a paint program and drop back. */
export async function png(picture: Picture, palette: Palette): Promise<Blob> {
  const canvas = document.createElement("canvas");
  draw(canvas, picture, palette);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture couldn't be saved."))), "image/png"));
}

/** A floor's size, for the page to say. */
export const FLOOR = FLAT;
