// Builds games/shooter/delbies/delbies.wad: the game's own title picture and levels, as a WAD
// laid over Freedoom. Run with `npm run delbies` after changing a level's plan or the art; the
// result is committed, and a test checks it is what the plans now make.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGame } from "../games/shooter/delbies/game.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "games", "shooter");
export function art() {
  const from = (name) => new Uint8Array(readFileSync(join(root, "delbies", "art", name)));
  const logo = from("logo.raw");
  // The logo is 150 across; its height is what that leaves.
  return { title: from("title.raw"), logo: { pixels: logo, solid: from("logo.mask"), width: 150, height: logo.length / 150 } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const nodes = new WebAssembly.Module(readFileSync(join(root, "nodes", "nodes.wasm")));
  const wad = await buildGame(nodes, art());
  writeFileSync(join(root, "delbies", "delbies.wad"), wad);
  console.log(`delbies.wad: ${wad.length} bytes`);
}
