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
});
