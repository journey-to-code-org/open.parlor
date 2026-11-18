// The pages the server renders itself (src/pages.ts): what is in the HTML before any script runs.
import { describe, expect, it } from "vitest";
import { createPages } from "../src/pages.js";

const GAMES = [
  { id: "spades", name: "Spades", emoji: "♠️", seats: [4, 4] as [number, number], teams: true, on: true },
  { id: "palace", name: "Palace", emoji: "🏰", seats: [2, 6] as [number, number], teams: false, on: true },
  { id: "chess", name: "Chess", emoji: "♟️", seats: [2, 2] as [number, number], teams: false, on: false },
  { id: "chipstack", name: "Chip Stack", emoji: "🪙", seats: [1, 1] as [number, number], teams: false, on: true },
];
const pages = createPages({ state: async () => ({ games: GAMES as never, watching: true }) });
const get = async (path: string) => (await pages.fetch(new Request(`http://parlor.test${path}`)))!;
/** The games on the page, by the cards' headings, in order. */
const names = (html: string) => [...html.matchAll(/<h3[^>]*>\s*<a href="[^"]*"[^>]*>(?:<\?zb[^>]*\?>|<!--.*?-->|\s)*([^<]+)/g)].map((m) => m[1]!.trim());

describe("the games page", () => {
  it("is HTML with every game that is switched on, in the catalogue's order", async () => {
    const response = await get("/games");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(response.headers.get("x-parlor-page")).toBe("games");
    const html = await response.text();
    expect(names(html)).toEqual(["Spades", "Palace", "Chip Stack"]);
    expect(html).toContain("3 games");
    expect(html).toContain('href="/?game=palace"');
    expect(html).toContain("2 to 6 players");
    expect(html).toContain("1 player");
    expect(html).not.toContain("Chess");
  });

  it("has a form that asks the server again, for a browser without JavaScript", async () => {
    const html = await (await get("/games")).text();
    expect(html).toMatch(/<form[^>]*method="get"/);
    expect(html).toMatch(/<input[^>]*name="q"/);
    expect(html).toMatch(/<select[^>]*name="kind"/);
    expect(html).toMatch(/type="submit"/);
  });

  it("filters by name and by kind from the address", async () => {
    expect(names(await (await get("/games?q=pa")).text())).toEqual(["Spades", "Palace"]);
    expect(names(await (await get("/games?kind=arcade")).text())).toEqual(["Chip Stack"]);
    expect(names(await (await get("/games?q=PAL&kind=table")).text())).toEqual(["Palace"]);
    const none = await (await get("/games?q=zzz")).text();
    expect(names(none)).toEqual([]);
    expect(none).toContain("No game by that name");
    // What was asked for is still in the fields.
    expect(await (await get("/games?q=pa&kind=table")).text()).toMatch(/<input[^>]*value="pa"/);
  });

  it("writes what was typed as text, never as markup", async () => {
    const html = await (await get(`/games?q=${encodeURIComponent('"><script>alert(1)</script>')}`)).text();
    expect(html).not.toContain("<script>alert(1)");
  });

  it("is switched off, not broken, when its components can't be found", async () => {
    const errors: unknown[][] = [];
    const error = console.error;
    console.error = (...said: unknown[]) => void errors.push(said);
    try {
      const off = createPages({ state: async () => ({ games: GAMES as never, watching: true }) }, { components: "/nowhere/at/all" });
      // The address is left to the app, and the modules aren't there.
      expect(await off.fetch(new Request("http://parlor.test/games"))).toBeNull();
      expect((await off.fetch(new Request("http://parlor.test/_zubra/runtime/zubra.js")))!.status).toBe(404);
      expect(errors.length).toBe(1);
    } finally {
      console.error = error;
    }
  });

  it("serves the components' modules, and nothing else", async () => {
    const html = await (await get("/games")).text();
    const module = html.match(/\/_zubra\/[^"' )]+\.js/)?.[0];
    expect(module).toBeTruthy();
    const served = await get(module!);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toMatch(/javascript/);
    expect((await get("/_zubra/nothing-here.js")).status).toBe(404);
    expect(await pages.fetch(new Request("http://parlor.test/houses"))).toBeNull();
    expect((await pages.fetch(new Request("http://parlor.test/games", { method: "POST" })))!.status).toBe(404);
  });
});
