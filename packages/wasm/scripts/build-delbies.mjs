// Builds games/shooter/delbies/delbies.wad: the whole game, as the one WAD the engine needs. Run with `npm run delbies` after changing a level's plan or the art; the
// result is committed, and a test checks it is what the plans now make.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGame } from "../games/shooter/delbies/game.ts";
import { readWords, writeWords } from "../wad/words.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "games", "shooter");
export function art() {
  const from = (name) => new Uint8Array(readFileSync(join(root, "delbies", "art", name)));
  const logo = from("logo.raw");
  // The logo is 150 across; its height is what that leaves.
  // The pictures drawn by the scripts in art/: each is its pixels and then, the same size again, where it is solid.
  const pictures = (name) => {
    const drawn = new Uint8Array(gunzipSync(from(`${name}.bin.gz`)));
    return JSON.parse(readFileSync(join(root, "delbies", "art", `${name}.json`), "utf8")).map(({ name, width, height, left, top, at }) => ({ name, width, height, left, top, pixels: drawn.subarray(at, at + width * height), solid: drawn.subarray(at + width * height, at + 2 * width * height) }));
  };
  // The rats, and the status bar: Delbie's face, and the bar.
  // And tools from the store, in place of the weapons and what is picked up: sprites too.
  // And what is around the game: the menus' lettering, the small letters, the page between levels, how to play, the credits.
  const [sprites, screens] = [[...pictures("sprites"), ...pictures("tools")], [...pictures("hud"), ...pictures("menu")]];
  // What the game says, as the editor would write it: no comments, one ending for a line.
  const words = writeWords(readWords(new Uint8Array(readFileSync(join(root, "delbies", "words.txt")))));
  // Everything heard: a byte a sample, at the engine's own rate.
  const heard = new Uint8Array(gunzipSync(from("sounds.bin.gz")));
  const sounds = JSON.parse(readFileSync(join(root, "delbies", "art", "sounds.json"), "utf8")).map(({ name, at, length }) => ({ name, samples: heard.subarray(at, at + length) }));
  // Every wall, sky, floor and ceiling: a palette colour a pixel, and nothing see-through.
  const painted = new Uint8Array(gunzipSync(from("textures.bin.gz")));
  const textures = JSON.parse(readFileSync(join(root, "delbies", "art", "textures.json"), "utf8")).map(({ name, kind, width, height, at }) => ({ name, kind, width, height, pixels: painted.subarray(at, at + width * height) }));
  return { palette: from("palette.bin"), textures, words, screens, sounds, title: from("title.raw"), logo: { pixels: logo, solid: from("logo.mask"), width: 150, height: logo.length / 150 }, sprites };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const nodes = new WebAssembly.Module(readFileSync(join(root, "nodes", "nodes.wasm")));
  const wad = await buildGame(nodes, art());
  writeFileSync(join(root, "delbies", "delbies.wad"), wad);
  console.log(`delbies.wad: ${wad.length} bytes`);
}
