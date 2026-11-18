// Every game that is a page of its own beside the parlor has a tile on the front page (the list
// `ELSEWHERE` in src/home/Home.tsx), so it is on a shelf and the search finds it. A game page
// added to packages/wasm without one fails here.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const wasm = fileURLToPath(new URL("../../wasm/", import.meta.url));
const home = readFileSync(fileURLToPath(new URL("../src/home/Home.tsx", import.meta.url)), "utf8");
/** Pages there that aren't games: the editor is a tool, reached from the shooter's own page. */
const NOT_GAMES = new Set(["editor", "dist", "node_modules", "public"]);

test("every game page under /wasm/ has a tile on the front page", () => {
  const pages = ["", ...readdirSync(wasm, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !NOT_GAMES.has(entry.name) && existsSync(`${wasm}${entry.name}/index.html`)).map((entry) => `${entry.name}/`)];
  expect(pages.length).toBeGreaterThan(2);
  expect(pages.filter((page) => !home.includes(`href: "wasm/${page}"`))).toEqual([]);
});
