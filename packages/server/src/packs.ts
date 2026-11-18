// The pack Road to the Shootout plays here, when this parlor's host has published one of their
// own from the workshop in the admin app. Without one the game plays the pack it came with.
//
//   <beside the database>/shootout.pack   the published pack, as the workshop made it
//
// A pack is the game's whole content in one file (see packages/wasm/README.md): "WPK1", a count,
// then named files, one of them pack.json. It is kept as it came and never opened further than
// to see that it is one. A parlor with no database on disk keeps it in memory.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The biggest pack taken: the one the game comes with is under one megabyte. */
export const MOST_BYTES = 8 * 1024 * 1024;

export interface Published {
  bytes: Uint8Array;
  /** When it was published. */
  at: number;
  /** What the pack calls itself. */
  name: string;
}

/** What is wrong with these bytes as a pack, or the name the pack gives itself. */
export function readPack(bytes: Uint8Array): { name: string } | { problem: string } {
  if (bytes.length > MOST_BYTES) return { problem: `That pack is ${Math.ceil(bytes.length / 1024 / 1024)} MB. The most this parlor takes is ${MOST_BYTES / 1024 / 1024} MB.` };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "WPK1") return { problem: "That file is not a pack." };
  let at = 8;
  for (let left = view.getUint32(4, true); left > 0; left--) {
    if (at + 2 > bytes.length) return { problem: "That pack ends early." };
    const nameLength = view.getUint16(at, true);
    at += 2;
    if (at + nameLength + 4 > bytes.length) return { problem: "That pack ends early." };
    const name = new TextDecoder().decode(bytes.subarray(at, at + nameLength));
    at += nameLength;
    const length = view.getUint32(at, true);
    at += 4;
    if (at + length > bytes.length) return { problem: "That pack ends early." };
    if (name === "pack.json") {
      try {
        const described = JSON.parse(new TextDecoder().decode(bytes.subarray(at, at + length))) as { name?: unknown; start?: unknown; cars?: unknown; places?: unknown };
        const whole = [described.start, described.cars, described.places].every((part) => typeof part === "object" && part !== null);
        if (typeof described.name !== "string" || !whole) return { problem: "That pack's description is missing its name, its start, its cars or its places." };
        return { name: described.name.replace(/[^\p{L}\p{N} '.,!?&:-]/gu, "").trim().slice(0, 60) || "A pack" };
      } catch {
        return { problem: "That pack's description is not JSON." };
      }
    }
    at += length;
  }
  return { problem: "That pack has no pack.json." };
}

export function createPacks({ file, now = () => Date.now() }: { /** Where the published pack is kept. Without it, in memory. */ file?: string; now?: () => number } = {}) {
  let kept: Published | null = null;
  if (file && existsSync(file)) {
    const bytes = new Uint8Array(readFileSync(file));
    const read = readPack(bytes);
    if ("name" in read) kept = { bytes, at: statSync(file).mtimeMs, name: read.name };
  }
  return {
    /** The published pack, or null when the game plays the one it came with. */
    get: (): Published | null => kept,
    /** Publish these bytes. Resolves to what is wrong with them, or null. */
    set(bytes: Uint8Array): string | null {
      const read = readPack(bytes);
      if ("problem" in read) return read.problem;
      if (file) {
        // Written beside itself and moved into place, so a half-written pack is never served.
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(`${file}.new`, bytes);
        renameSync(`${file}.new`, file);
      }
      kept = { bytes: bytes.slice(), at: now(), name: read.name };
      return null;
    },
    /** Go back to the pack the game came with. */
    clear(): void {
      if (file) rmSync(file, { force: true });
      kept = null;
    },
  };
}

export type Packs = ReturnType<typeof createPacks>;
