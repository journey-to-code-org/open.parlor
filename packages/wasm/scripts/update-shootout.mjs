// Brings Road to the Shootout over from where it is built: journey-to-code-org/wasm-toolkit.
//
//   (in wasm-toolkit)  make engine
//   (here)             npm run shootout -w @open-parlor/wasm -- ../wasm-toolkit
//
// The game is a Rust engine compiled to WebAssembly, the pack of content it plays, and the page
// that hosts it; the workshop is the page that edits packs. They are copied as they are into
// public/shootout/, which the parlor serves at /wasm/shootout/, and committed.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const from = resolve(process.argv[2] ?? "../wasm-toolkit");
const to = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "shootout");
// What the pages are called there, and here: the game is the folder's own page.
const files = { "engine.html": "index.html", "wtk.js": "wtk.js", "engine.wasm": "engine.wasm", "default.pack": "default.pack", "workshop.html": "workshop.html", "workshop.js": "workshop.js", "pack.js": "pack.js" };
for (const name of Object.keys(files)) {
  if (!existsSync(join(from, "web", name))) throw new Error(`${join(from, "web", name)} is not there. Run "make engine" in wasm-toolkit first.`);
}
mkdirSync(to, { recursive: true });
for (const [name, as] of Object.entries(files)) copyFileSync(join(from, "web", name), join(to, as));
// The workshop's "Play it" opens the game by its name there.
copyFileSync(join(from, "web", "engine.html"), join(to, "engine.html"));
const commit = execFileSync("git", ["-C", from, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
writeFileSync(join(to, "VERSION"), `journey-to-code-org/wasm-toolkit ${commit}\n`);
console.log(`Road to the Shootout, from wasm-toolkit ${commit.slice(0, 7)}`);
