// Brings Road to the Shootout over from where it is built: journey-to-code-org/wasm-toolkit.
//
//   (in wasm-toolkit)  make engine
//   (here)             npm run shootout -w @open-parlor/wasm -- ../wasm-toolkit
//
// The game is a Rust engine compiled to WebAssembly, the pack of content it plays, and the page
// that hosts it; the workshop is the page that edits packs. They are copied as they are and
// committed: the game into public/shootout/ here, the workshop into the admin app.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const from = resolve(process.argv[2] ?? "../wasm-toolkit");
const here = dirname(fileURLToPath(import.meta.url));
// The game, served to everyone at /wasm/shootout/: the folder's own page is the game.
const game = { to: join(here, "..", "public", "shootout"), files: { "engine.html": "index.html", "wtk.js": "wtk.js", "engine.wasm": "engine.wasm", "default.pack": "default.pack" } };
// The workshop, which makes packs: in the admin app, at /admin/workshop/. Its host.js, which is
// the parlor's own and says where the game is and how to publish, is already there and stays.
const workshop = { to: join(here, "..", "..", "admin", "public", "workshop"), files: { "workshop.html": "index.html", "workshop.js": "workshop.js", "pack.js": "pack.js" } };
for (const { files } of [game, workshop]) {
  for (const name of Object.keys(files)) {
    if (!existsSync(join(from, "web", name))) throw new Error(`${join(from, "web", name)} is not there. Run "make engine" in wasm-toolkit first.`);
  }
}
for (const { to, files } of [game, workshop]) {
  mkdirSync(to, { recursive: true });
  for (const [name, as] of Object.entries(files)) copyFileSync(join(from, "web", name), join(to, as));
}
// The workshop's "Play it" opens the game by its name there.
copyFileSync(join(from, "web", "engine.html"), join(game.to, "engine.html"));
const commit = execFileSync("git", ["-C", from, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
for (const { to } of [game, workshop]) writeFileSync(join(to, "VERSION"), `journey-to-code-org/wasm-toolkit ${commit}\n`);
console.log(`Road to the Shootout and its workshop, from wasm-toolkit ${commit.slice(0, 7)}`);
