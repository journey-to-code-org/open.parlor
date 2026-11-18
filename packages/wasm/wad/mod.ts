// Someone's changes to a game: the lumps they have replaced, and nothing else. Laid over the
// game's own WAD they make the WAD the engine is given; on their own they are a small WAD to keep
// or to hand to someone.
import { type Asset, catalogue, key, type Kind } from "./catalogue.ts";
import { decodePatch, FLAT } from "./picture.ts";
import { decodeDmx } from "./sound.ts";
import { LEVEL_LUMPS, levelLumps } from "./level.ts";
import { type Lump, readWad, type Wad, writeWad } from "./wad.ts";

export interface Change {
  kind: Kind;
  name: string;
  /** The lump that takes the original's place. */
  data: Uint8Array;
}

/** Whether these bytes are what the engine expects of this kind of lump. */
export function fits(kind: Kind, data: Uint8Array): boolean {
  // Ten bytes a thing, and a level with nothing in it has nowhere for the player to start.
  if (kind === "things") return data.length > 0 && data.length % 10 === 0;
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
    // Under the lump's own name: a level's things are known by the level, but the lump is THINGS.
    lumps[asset.index] = { name: wad.lumps[asset.index]!.name, data: change.data };
    changed++;
  }
  return changed ? writeWad({ kind: wad.kind, lumps }) : game;
}

const MARKERS: Partial<Record<Kind, [string, string]>> = { sprite: ["SS_START", "SS_END"], wall: ["PP_START", "PP_END"], floor: ["FF_START", "FF_END"] };
const marker = (name: string): Lump => ({ name, data: new Uint8Array(0) });

/**
 * The changes as a WAD of their own: the kind other Doom engines load on top of a game. A level
 * whose things are changed goes in whole (its walls as the game has them), since a level can only
 * be replaced whole: for that the game's own WAD is needed, and without it changed levels are left out.
 */
export function modToWad(changes: Iterable<Change>, game?: Wad): Uint8Array {
  const all = [...changes];
  const lumps: Lump[] = all.filter((change) => !MARKERS[change.kind] && change.kind !== "things").map(({ name, data }) => ({ name, data }));
  for (const change of all.filter((one) => one.kind === "things")) {
    const level = game && levelLumps(game, change.name);
    if (!level) continue;
    lumps.push(marker(change.name), ...LEVEL_LUMPS.filter((name) => level.has(name)).map((name) => ({ name, data: name === "THINGS" ? change.data : level.get(name)!.lump.data })));
  }
  for (const [kind, [start, end]] of Object.entries(MARKERS) as [Kind, [string, string]][]) {
    const inside = all.filter((change) => change.kind === kind);
    if (inside.length) lumps.push(marker(start), ...inside.map(({ name, data }) => ({ name, data })), marker(end));
  }
  return writeWad({ kind: "PWAD", lumps });
}

/**
 * The changes in a WAD of changes, for a game with these assets. A lump only counts if the game
 * has something of that name and kind and the bytes are right for it; the names of the rest come
 * back as `skipped`. A level counts only for what is placed in it, and only if its walls are the
 * game's own (`game` is given to tell): this is not yet somewhere new walls can go.
 */
export function modFromWad(bytes: Uint8Array, assets: Asset[], game?: Wad): { changes: Change[]; skipped: string[] } {
  const known = new Set(assets.map((asset) => key(asset.kind, asset.name)));
  const changes: Change[] = [];
  const skipped: string[] = [];
  // The same reading of sections and names as the game's own WAD gets.
  const wad = readWad(bytes);
  const read = catalogue(wad);
  const taken = new Set(read.map((asset) => asset.index));
  const same = (a?: Uint8Array, b?: Uint8Array) => !!a && !!b && a.length === b.length && a.every((byte, i) => byte === b[i]);
  for (const asset of read) {
    const data = wad.lumps[asset.index]!.data;
    let ours = known.has(key(asset.kind, asset.name)) && fits(asset.kind, data);
    if (asset.kind === "things") {
      const theirs = levelLumps(wad, asset.name);
      const own = game && levelLumps(game, asset.name);
      ours &&= !!theirs && !!own && ["VERTEXES", "LINEDEFS", "SIDEDEFS", "SECTORS"].every((name) => same(theirs.get(name)?.lump.data, own.get(name)?.lump.data));
      // The rest of the level came along to make a whole one; it isn't a change, or something left out.
      for (const { index } of theirs?.values() ?? []) taken.add(index);
      taken.add(asset.index - 1);
    }
    if (ours) changes.push({ kind: asset.kind, name: asset.name, data: data.slice() });
    else skipped.push(asset.name);
  }
  wad.lumps.forEach((lump, index) => {
    if (lump.data.length && !taken.has(index)) skipped.push(lump.name);
  });
  return { changes, skipped };
}
