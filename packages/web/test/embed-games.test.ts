import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a build script, in plain JavaScript
import { FILE, withGames } from "../scripts/embed-games.mjs";

describe("the <card-room> widget's games", () => {
  it("lists every game it can deal (run scripts/embed-games.mjs after adding one)", () => {
    const source = readFileSync(FILE, "utf8");
    expect(withGames(source)).toBe(source);
    for (const id of ["spades", "palace", "hearts", "chess", "minigolf", "secretword"]) expect(source).toContain(`"${id}": {`);
    expect(source).not.toContain(`"drawguess": {`);
  });

  it("lists the arcade and idle games too, marked as played against the game itself", async () => {
    const { ARCADE_GAMES, IDLE_GAMES } = await import("@journey-to-code/games");
    const source = readFileSync(FILE, "utf8");
    const games = JSON.parse(source.slice(source.indexOf("const GAMES = ") + "const GAMES = ".length, source.indexOf("  // GAMES end"))) as Record<string, { solo?: boolean }>;
    for (const g of [...ARCADE_GAMES, ...IDLE_GAMES]) expect(games[g.id]?.solo, g.id).toBe(true);
    for (const id of ["spades", "palace", "hearts", "chess"]) expect(games[id]?.solo, id).toBeUndefined();
  });
});
