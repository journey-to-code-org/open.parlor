// Someone's changes to a game: the lumps they have replaced, and nothing else. Laid over the
// game's own WAD they make the WAD the engine is given; on their own they are a small WAD to keep
// or to hand to someone.
import { type Asset, canAdd, catalogue, isLevelKind, isNewName, key, type Kind } from "./catalogue.ts";
import { decodePatch, FLAT } from "./picture.ts";
import { decodeDmx } from "./sound.ts";
import { isShape, LEVEL_LUMPS, levelLumps, SHAPE_LUMPS } from "./level.ts";
import { addWallPictures } from "./texture.ts";
import { type Lump, readWad, type Wad, writeWad } from "./wad.ts";

export interface Change {
  kind: Kind;
  name: string;
  /**
   * The lump that takes the original's place. A level's walls are nine lumps (everything of a
   * level but THINGS), so that change is a small WAD of them, already built (nodes.ts).
   */
  data: Uint8Array;
}

/**
 * A game with another WAD laid over it: the pictures, sounds and levels of `over` in the place of
 * the game's own of the same names. This is how a game of our own sits on top of the data it is
 * built on. What `over` has that the game has no place for is left out.
 */
export function layer(game: Uint8Array, over: Uint8Array): Uint8Array {
  let wad = readWad(game);
  // The game's words are a lump of our own: one the game hasn't a place for yet is given one.
  const words = readWad(over).lumps.find((lump) => lump.name === "WORDS");
  if (words && !wad.lumps.some((lump) => lump.name === "WORDS")) {
    game = writeWad({ kind: wad.kind, lumps: [...wad.lumps, { name: "WORDS", data: new Uint8Array([35, 10]) }] });
    wad = readWad(game);
  }
  return applyMod(game, modFromWad(over, catalogue(wad), wad).changes);
}

/** The lumps of a "walls" change, by name; null if it isn't a level's shape, built. */
export function wallLumps(data: Uint8Array): Map<string, Uint8Array> | null {
  try {
    const lumps = new Map(readWad(data).lumps.map((lump) => [lump.name, lump.data]));
    const shape = Object.fromEntries(SHAPE_LUMPS.map((name) => [name, lumps.get(name)]));
    return isShape(shape) && ["SEGS", "SSECTORS", "NODES", "BLOCKMAP"].every((name) => lumps.get(name)?.length) ? lumps : null;
  } catch {
    return null;
  }
}

/** The most a lump that is taken as it comes may be: a long song is a few megabytes. */
const BIGGEST = 32 * 1048576;

/** Whether a change is something new: of a kind a game can be given more of, under a name it could go by, and the right bytes. */
export const isAddition = (change: Change) => canAdd(change.kind) && isNewName(change.name) && fits(change.kind, change.data);

/** Whether these bytes are what the engine expects of this kind of lump. */
export function fits(kind: Kind, data: Uint8Array): boolean {
  // Ten bytes a thing, and a level with nothing in it has nowhere for the player to start.
  if (kind === "things") return data.length > 0 && data.length % 10 === 0;
  if (kind === "walls") return wallLumps(data) !== null;
  if (kind === "words") return data.length > 0 && data.length < 65536;
  // Any bytes at all: what they must be is between whoever dropped them and the engine.
  if (kind === "other") return data.length > 0 && data.length <= BIGGEST;
  if (kind === "sound") return decodeDmx(data) !== null;
  if (kind === "floor") return data.length >= FLAT * FLAT;
  return decodePatch(data) !== null;
}

/**
 * The game's WAD with the changes made: each changed lump in its original's place. What the game
 * has nothing of that name for is added if it is a floor, a wall or a lump of no other kind (a
 * floor and a wall piece among the game's own, a wall with a wall picture of its name made for
 * it), and left out if it is anything else.
 */
export function applyMod(game: Uint8Array, changes: Iterable<Change>): Uint8Array {
  const wad = readWad(game);
  const assets = new Map(catalogue(wad).map((asset) => [key(asset.kind, asset.name), asset]));
  let lumps = [...wad.lumps];
  let changed = 0;
  const added: Change[] = [];
  const names = new Set(wad.lumps.map((lump) => lump.name));
  for (const change of changes) {
    const asset = assets.get(key(change.kind, change.name));
    // A lump of no kind mustn't take a name the game uses for something else: the engine would read it as that.
    if (!asset && isAddition(change) && !(change.kind === "other" && names.has(change.name)) && !added.some((one) => one.kind === change.kind && one.name === change.name)) added.push(change);
    if (!asset || !fits(change.kind, change.data)) continue;
    if (change.kind === "walls") {
      // Each of the level's lumps, but what is placed in it, for the one of that name.
      const built = wallLumps(change.data)!;
      for (const [name, { index }] of levelLumps(wad, change.name) ?? []) if (name !== "THINGS") lumps[index] = { name, data: built.get(name) ?? new Uint8Array(0) };
    }
    // Under the lump's own name: a level's things are known by the level, but the lump is THINGS.
    else lumps[asset.index] = { name: wad.lumps[asset.index]!.name, data: change.data };
    changed++;
  }
  // What is new goes in after what is changed, so that none of the places above have moved.
  for (const [kind, ends] of [["floor", /^FF?_END$/], ["wall", /^PP?_END$/]] as const) {
    const fresh = added.filter((change) => change.kind === kind).map(({ name, data }) => ({ name, data }));
    const end = lumps.map((lump) => ends.test(lump.name)).lastIndexOf(true);
    if (!fresh.length) continue;
    // A game with no such section is given one.
    if (end < 0) lumps.push(marker(MARKERS[kind]![0]), ...fresh, marker(MARKERS[kind]![1]));
    else lumps.splice(end, 0, ...fresh);
  }
  lumps.push(...added.filter((change) => change.kind === "other").map(({ name, data }) => ({ name, data })));
  lumps = addWallPictures(lumps, newWalls(added));
  return changed || added.length ? writeWad({ kind: wad.kind, lumps }) : game;
}

/** The walls among what is new, with the size of each: what a wall picture is made for. */
const newWalls = (added: Change[]) =>
  added.flatMap((change) => {
    const piece = change.kind === "wall" ? decodePatch(change.data) : null;
    return piece ? [{ name: change.name, width: piece.width, height: piece.height }] : [];
  });

const MARKERS: Partial<Record<Kind, [string, string]>> = { sprite: ["SS_START", "SS_END"], wall: ["PP_START", "PP_END"], floor: ["FF_START", "FF_END"] };
const marker = (name: string): Lump => ({ name, data: new Uint8Array(0) });
/** Whether a game has something of a change's kind and name already. */
const gameHas = (game: Wad, change: Change) => catalogue(game).some((asset) => asset.kind === change.kind && asset.name === change.name);

/**
 * The changes as a WAD of their own: the kind other Doom engines load on top of a game. A changed
 * level goes in whole (what wasn't changed as the game has it), since a level can only be
 * replaced whole: for that the game's own WAD is needed, and without it changed levels are left out.
 */
export function modToWad(changes: Iterable<Change>, game?: Wad): Uint8Array {
  const all = [...changes];
  const lumps: Lump[] = all.filter((change) => !MARKERS[change.kind] && !isLevelKind(change.kind)).map(({ name, data }) => ({ name, data }));
  for (const name of new Set(all.filter((one) => isLevelKind(one.kind)).map((one) => one.name))) {
    const level = game && levelLumps(game, name);
    if (!level) continue;
    const things = all.find((one) => one.kind === "things" && one.name === name)?.data;
    const walls = all.find((one) => one.kind === "walls" && one.name === name);
    const built = walls && wallLumps(walls.data);
    lumps.push(marker(name), ...LEVEL_LUMPS.filter((lump) => level.has(lump)).map((lump) => ({ name: lump, data: (lump === "THINGS" ? things : built?.get(lump)) ?? level.get(lump)!.lump.data })));
  }
  for (const [kind, [start, end]] of Object.entries(MARKERS) as [Kind, [string, string]][]) {
    const inside = all.filter((change) => change.kind === kind);
    if (inside.length) lumps.push(marker(start), ...inside.map(({ name, data }) => ({ name, data })), marker(end));
  }
  // A new wall is no use to another engine without its wall picture: the two lists go too, as they are with the new ones in.
  const walls = game ? newWalls(all.filter((change) => change.kind === "wall" && isAddition(change) && !gameHas(game, change))) : [];
  if (game && walls.length) {
    const lists = (from: Lump[]) => ["PNAMES", "TEXTURE1"].map((name) => from.filter((lump) => lump.name === name).at(-1));
    const now = all.filter((change) => change.kind === "other");
    const before = lists([...game.lumps, ...now.map(({ name, data }) => ({ name, data }))]).filter((lump): lump is Lump => !!lump);
    const after = lists(addWallPictures(before, walls));
    for (const list of after) {
      if (!list) continue;
      const at = lumps.findIndex((lump) => lump.name === list.name);
      if (at < 0) lumps.unshift(list);
      else lumps[at] = list;
    }
  }
  return writeWad({ kind: "PWAD", lumps });
}

/**
 * The changes in a WAD of changes, for a game with these assets. A lump only counts if the game
 * has something of that name and kind and the bytes are right for it; the names of the rest come
 * back as `skipped`. A level of the game's name is two changes at most: what is placed in it, if
 * that isn't what the game has, and its walls, if they aren't the game's (`game` is given to
 * tell) and the level comes built, as other editors save them. A floor, a wall or a lump of no
 * other kind that the game has nothing by the name of is taken too, as something new.
 */
export function modFromWad(bytes: Uint8Array, assets: Asset[], game?: Wad): { changes: Change[]; skipped: string[] } {
  const known = new Set(assets.map((asset) => key(asset.kind, asset.name)));
  const named = new Set(assets.map((asset) => asset.name));
  const changes: Change[] = [];
  const skipped: string[] = [];
  // The same reading of sections and names as the game's own WAD gets.
  const wad = readWad(bytes);
  const read = catalogue(wad);
  const taken = new Set(read.map((asset) => asset.index));
  const same = (a?: Uint8Array, b?: Uint8Array) => !!a && !!b && a.length === b.length && a.every((byte, i) => byte === b[i]);
  for (const asset of read) {
    const data = wad.lumps[asset.index]!.data;
    if (asset.kind === "walls") continue;
    let ours = known.has(key(asset.kind, asset.name)) && fits(asset.kind, data);
    if (asset.kind === "things") {
      const theirs = levelLumps(wad, asset.name);
      const own = game && levelLumps(game, asset.name);
      // The rest of the level came along to make a whole one; it isn't a change, or something left out.
      for (const { index } of theirs?.values() ?? []) taken.add(index);
      taken.add(asset.index - 1);
      if (!ours || !theirs || !own) {
        skipped.push(asset.name);
        continue;
      }
      if (!SHAPE_LUMPS.every((name) => same(theirs.get(name)?.lump.data, own.get(name)?.lump.data))) {
        // Walls of its own: taken if it is a whole, built level.
        const walls = writeWad({ kind: "PWAD", lumps: LEVEL_LUMPS.filter((name) => name !== "THINGS" && theirs.has(name)).map((name) => ({ name, data: theirs.get(name)!.lump.data })) });
        if (!fits("walls", walls)) {
          skipped.push(asset.name);
          continue;
        }
        changes.push({ kind: "walls", name: asset.name, data: walls });
      }
      // What is placed in it, unless that is as the game has it.
      if (!same(data, own.get("THINGS")?.lump.data)) changes.push({ kind: "things", name: asset.name, data: data.slice() });
      continue;
    }
    // A picture or a sound under a name the game has nothing by is no use to this engine, but it is carried along as a lump, for whoever it is for.
    const stray = (asset.kind === "screen" || asset.kind === "sound") && !known.has(key(asset.kind, asset.name));
    const change: Change = { kind: stray ? "other" : asset.kind, name: asset.name, data: data.slice() };
    // Something the game hasn't, of a kind it can be given more of: a floor, a wall, a lump of no other kind.
    if (ours || (!known.has(key(change.kind, asset.name)) && isAddition(change) && !(change.kind === "other" && named.has(asset.name)))) changes.push(change);
    else skipped.push(asset.name);
  }
  wad.lumps.forEach((lump, index) => {
    if (lump.data.length && !taken.has(index)) skipped.push(lump.name);
  });
  return { changes, skipped };
}
