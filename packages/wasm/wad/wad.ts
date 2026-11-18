// A WAD file: the Doom engine's one container for everything a game is made of. It is a short
// header, the "lumps" (named runs of bytes: a picture, a sound, a level's walls) end to end, and a
// directory that says where each is. Reading and writing one is all this file does; what the
// lumps mean is for its neighbours.

export interface Lump {
  /** Up to eight characters, upper case. Names repeat: every level has a lump called THINGS. */
  name: string;
  data: Uint8Array;
}

export interface Wad {
  /** An IWAD is a whole game; a PWAD is pieces to lay over one. */
  kind: "IWAD" | "PWAD";
  lumps: Lump[];
}

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/** The lumps of a WAD. Each lump's bytes are a view of `bytes`, not a copy. Throws if it isn't a WAD. */
export function readWad(bytes: Uint8Array): Wad {
  const kind = text(bytes.subarray(0, 4));
  if (bytes.length < 12 || (kind !== "IWAD" && kind !== "PWAD")) throw new Error("This isn't a WAD file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getInt32(4, true);
  const directory = view.getInt32(8, true);
  if (count < 0 || directory < 12 || directory + count * 16 > bytes.length) throw new Error("This WAD file is cut short.");
  const lumps: Lump[] = [];
  for (let i = 0; i < count; i++) {
    const entry = directory + i * 16;
    const at = view.getInt32(entry, true);
    const size = view.getInt32(entry + 4, true);
    if (size < 0 || (size > 0 && (at < 0 || at + size > bytes.length))) throw new Error("This WAD file is cut short.");
    const name = text(bytes.subarray(entry + 8, entry + 16)).replace(/\0.*$/, "").toUpperCase();
    lumps.push({ name, data: size ? bytes.subarray(at, at + size) : new Uint8Array(0) });
  }
  return { kind, lumps };
}

/** A WAD file of these lumps, in this order. */
export function writeWad(wad: Wad): Uint8Array {
  const size = wad.lumps.reduce((sum, lump) => sum + lump.data.length, 0);
  const bytes = new Uint8Array(12 + size + wad.lumps.length * 16);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = wad.kind.charCodeAt(i);
  view.setInt32(4, wad.lumps.length, true);
  view.setInt32(8, 12 + size, true);
  let at = 12;
  wad.lumps.forEach((lump, i) => {
    const entry = 12 + size + i * 16;
    bytes.set(lump.data, at);
    // A lump with nothing in it (a marker) is conventionally at 0.
    view.setInt32(entry, lump.data.length ? at : 0, true);
    view.setInt32(entry + 4, lump.data.length, true);
    for (let c = 0; c < 8 && c < lump.name.length; c++) bytes[entry + 8 + c] = lump.name.charCodeAt(c);
    at += lump.data.length;
  });
  return bytes;
}
