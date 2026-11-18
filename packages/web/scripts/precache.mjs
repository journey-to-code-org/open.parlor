// The last step of the build: tell the service worker which files the app is made of, so it can
// keep a copy of them on the device and the games that need no server start with no connection.
//
// It runs after everything else has been written to dist/, and leaves out what isn't the app: the
// blog embed (other sites load that), the link-preview image, and the worker itself. The version is
// a hash of the files, so a build that changes nothing keeps the copy people already have.
//
// The files are sorted into the core, which is always kept, and a pack for each kind of game
// (scripts/packs.mjs), so someone can keep only the kinds they play.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sortFiles } from "./packs.mjs";

const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist");
const SKIP_DIRS = new Set(["embed", "designer", "watch", "admin", ".vite"]);
const SKIP_FILES = new Set(["sw.js", "og.jpg"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return dir === dist && SKIP_DIRS.has(name) ? [] : walk(path);
    return name.endsWith(".map") || (dir === dist && SKIP_FILES.has(name)) ? [] : [path];
  });
}

const files = walk(dist).map((path) => relative(dist, path).split(sep).join("/")).sort();
if (!files.includes("index.html")) throw new Error("precache: dist/index.html is missing; run vite build first");
const hash = createHash("sha256");
for (const file of files) hash.update(file).update("\0").update(readFileSync(join(dist, file)));
const version = hash.digest("hex").slice(0, 16);

const worker = join(dist, "sw.js");
const text = readFileSync(worker, "utf8");
const marker = /^const PRECACHE = .*\/\* __PRECACHE__ \*\/$/m;
if (!marker.test(text)) throw new Error("precache: sw.js has no PRECACHE line to fill in");
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(dist, ".vite/manifest.json"), "utf8"));
const packs = JSON.parse(readFileSync(join(here, "../src/offline/packs.json"), "utf8"));
const sorted = sortFiles(manifest, packs, files);
const sizes = Object.fromEntries(files.map((file) => [file, statSync(join(dist, file)).size]));
writeFileSync(worker, text.replace(marker, () => `const PRECACHE = ${JSON.stringify({ version, files, core: sorted.core, packs: sorted.packs, sizes })};`));
const mb = (list) => `${(list.reduce((sum, file) => sum + sizes[file], 0) / 1024 / 1024).toFixed(1)} MB`;
console.log(`precache: ${files.length} files, ${mb(files)}, kept offline as ${version}`);
console.log(`  always kept: ${sorted.core.length} files, ${mb(sorted.core)}`);
for (const pack of packs) console.log(`  ${pack.name}: ${sorted.packs[pack.id].length} files, ${mb(sorted.packs[pack.id])}`);
