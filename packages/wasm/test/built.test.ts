import { join } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
// @ts-expect-error a plain script, with no typings
import { sourcesHash } from "../scripts/sources.mjs";

const game = join(import.meta.dirname, "../games/shooter");

test("shooter.wasm was compiled from the C as it is now (if not: npm run engine -w @open-parlor/wasm)", () => {
  const built = JSON.parse(readFileSync(join(game, "shooter.wasm.json"), "utf8")) as { sources: string };
  expect(built.sources).toBe(sourcesHash(game));
});
