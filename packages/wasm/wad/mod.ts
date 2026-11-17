// Someone's changes to a game: the lumps they have replaced, and nothing else. Laid over the
// game's own WAD they make the WAD the engine is given; on their own they are a small WAD to keep
// or to hand to someone.
import { type Asset, catalogue, key, type Kind } from "./catalogue.ts";
import { decodePatch, FLAT } from "./picture.ts";
import { decodeDmx } from "./sound.ts";
import { type Lump, readWad, writeWad } from "./wad.ts";

export interface Change {
  kind: Kind;
  name: string;
  /** The lump that takes the original's place. */
  data: Uint8Array;
}

/** Whether these bytes are what the engine expects of this kind of lump. */
export function fits(kind: Kind, data: Uint8Array): boolean {
  if (kind === "sound") return decodeDmx(data) !== null;
  if (kind === "floor") return data.length >= FLAT * FLAT;
  return decodePatch(data) !== null;
}

/** The game's WAD with the changes made: each changed lump in its original's place. Changes to things the game hasn't are left out. */
export function applyMod(game: Uint8Array, changes: Iterable<Change>): Uint8Array {
  const wad = readWad(game);
  const assets = new Map(catalogue(wad).map((asset) => [key(asset.kind, asset.name), asset]));
  const lumps = [...wad.lumps];
  let changed = 0;
  for (const change of changes) {
    const asset = assets.get(key(change.kind, change.name));
    if (!asset || !fits(change.kind, change.data)) continue;
    lumps[asset.index] = { name: asset.name, data: change.data };
    changed++;
  }
  return changed ? writeWad({ kind: wad.kind, lumps }) : game;
}

const MARKERS: Partial<Record<Kind, [string, string]>> = { sprite: ["SS_START", "SS_END"], wall: ["PP_START", "PP_END"], floor: ["FF_START", "FF_END"] };
const marker = (name: string): Lump => ({ name, data: new Uint8Array(0) });

/** The changes as a WAD of their own: the kind other Doom engines load on top of a game. */
export function modToWad(changes: Iterable<Change>): Uint8Array {
  const all = [...changes];
  const lumps: Lump[] = all.filter((change) => !MARKERS[change.kind]).map(({ name, data }) => ({ name, data }));
  for (const [kind, [start, end]] of Object.entries(MARKERS) as [Kind, [string, string]][]) {
    const inside = all.filter((change) => change.kind === kind);
    if (inside.length) lumps.push(marker(start), ...inside.map(({ name, data }) => ({ name, data })), marker(end));
  }
  return writeWad({ kind: "PWAD", lumps });
}

/**
 * The changes in a WAD of changes, for a game with these assets. A lump only counts if the game
 * has something of that name and kind and the bytes are right for it; the names of the rest come
 * back as `skipped`.
 */
export function modFromWad(bytes: Uint8Array, assets: Asset[]): { changes: Change[]; skipped: string[] } {
  const known = new Set(assets.map((asset) => key(asset.kind, asset.name)));
  const changes: Change[] = [];
  const skipped: string[] = [];
  // The same reading of sections and names as the game's own WAD gets.
  const wad = readWad(bytes);
  const read = catalogue(wad);
  const taken = new Set(read.map((asset) => asset.index));
  for (const asset of read) {
    const data = wad.lumps[asset.index]!.data;
    if (known.has(key(asset.kind, asset.name)) && fits(asset.kind, data)) changes.push({ kind: asset.kind, name: asset.name, data: data.slice() });
    else skipped.push(asset.name);
  }
  wad.lumps.forEach((lump, index) => {
    if (lump.data.length && !taken.has(index)) skipped.push(lump.name);
  });
  return { changes, skipped };
}
