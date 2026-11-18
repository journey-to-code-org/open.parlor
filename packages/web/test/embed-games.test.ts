import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a build script, in plain JavaScript
import { FILE, gameChoices, manifest, withGames } from "../scripts/embed-games.mjs";

describe("the <card-room> widget's games", () => {
  it("lists every game it can deal (run scripts/embed-games.mjs after adding one)", () => {
    const source = readFileSync(FILE, "utf8");
    expect(withGames(source)).toBe(source);
    for (const id of ["spades", "palace", "hearts", "chess", "minigolf", "secretword"]) expect(source).toContain(`"${id}": {`);
    expect(source).not.toContain(`"drawguess": {`);
  });

  it("serves the same list as a manifest, for a widget that was copied somewhere before a game was added", () => {
    const source = readFileSync(FILE, "utf8");
    const written = JSON.parse(source.slice(source.indexOf("const GAMES = ") + "const GAMES = ".length, source.indexOf("  // GAMES end")));
    expect(manifest()).toEqual({ games: written });
  });

  it("offers an open.blog form every game but the two its declaration writes out, by name", () => {
    const choices = gameChoices() as { value: string; label: string }[];
    const ids = choices.map((c) => c.value);
    expect(ids).not.toContain("spades");
    expect(ids).not.toContain("palace");
    expect([...ids, "spades", "palace"].sort()).toEqual(Object.keys(manifest().games).sort());
    expect(choices.map((c) => c.label)).toEqual([...choices.map((c) => c.label)].sort((a, b) => a.localeCompare(b, "en")));
    // open.blog takes at most 500 choices from a file, each a single line of at most 120 characters.
    expect(choices.length).toBeLessThanOrEqual(500);
    for (const c of choices) expect(c.label.length > 0 && c.label.length <= 120 && !c.label.includes("\n"), c.value).toBe(true);
  });

  it("lists the arcade and idle games too, marked as played against the game itself", async () => {
    const { ARCADE_GAMES, IDLE_GAMES } = await import("@journey-to-code/games");
    const source = readFileSync(FILE, "utf8");
    const games = JSON.parse(source.slice(source.indexOf("const GAMES = ") + "const GAMES = ".length, source.indexOf("  // GAMES end"))) as Record<string, { solo?: boolean }>;
    for (const g of [...ARCADE_GAMES, ...IDLE_GAMES]) expect(games[g.id]?.solo, g.id).toBe(true);
    for (const id of ["spades", "palace", "hearts", "chess"]) expect(games[id]?.solo, id).toBeUndefined();
  });
});
