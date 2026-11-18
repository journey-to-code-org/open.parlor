// Sorting the app's files into what is always kept for playing offline (the core) and what goes
// with each kind of game (a pack), from the manifest Vite writes. A pack is named in
// src/offline/packs.json by the screens it is for; its files are those screens' own, and whatever
// they bring with them that the core doesn't already have. A file two packs share is in both, so
// it is kept while either is.
//
// Anything nobody claims goes in the core: a file is never left out by accident.

/** Every file a chunk needs to run: its own, its styles, its workers, and the same of every chunk it imports outright. */
export function closure(manifest, key, seen = new Set()) {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return [];
  seen.add(key);
  return [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? []), ...(chunk.imports ?? []).flatMap((next) => closure(manifest, next, seen))];
}

/**
 * `files`: everything to be kept (paths under dist). Returns the core's files and each pack's, all
 * sorted. A pack whose screens the manifest doesn't know is an error: the list has gone stale.
 */
export function sortFiles(manifest, packs, files) {
  const all = new Set(files);
  const keys = Object.keys(manifest);
  const claimed = new Map(
    packs.map((pack) => {
      const match = pack.match ? new RegExp(pack.match) : null;
      const entries = [...(pack.entries ?? []), ...(match ? keys.filter((key) => match.test(key)) : [])];
      const missing = (pack.entries ?? []).filter((key) => !manifest[key]);
      if (missing.length) throw new Error(`packs: "${pack.id}" names ${missing.join(", ")}, which the build doesn't have`);
      if (!entries.length) throw new Error(`packs: "${pack.id}" has nothing in it`);
      return [pack.id, entries];
    }),
  );
  const packed = new Set([...claimed.values()].flat());
  // The core: the page itself and what it imports outright, and every screen fetched later that no pack has claimed.
  const core = new Set();
  for (const key of keys) {
    const chunk = manifest[key];
    if (chunk.isEntry || (chunk.isDynamicEntry && !packed.has(key))) for (const file of closure(manifest, key)) core.add(file);
  }
  const out = {};
  const inPack = new Set();
  for (const [id, entries] of claimed) {
    const own = new Set(entries.flatMap((key) => closure(manifest, key)).filter((file) => !core.has(file) && all.has(file)));
    out[id] = [...own].sort();
    for (const file of own) inPack.add(file);
  }
  for (const file of files) if (!inPack.has(file)) core.add(file);
  return { core: [...core].filter((file) => all.has(file)).sort(), packs: out };
}
