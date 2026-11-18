import { join } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
// @ts-expect-error a plain script, with no typings
import { sourcesHash } from "../scripts/sources.mjs";

const games = join(import.meta.dirname, "../games");

test.each([
  { name: "shooter", file: "shooter.wasm", build: "npm run engine" },
  { name: "market", file: "market.wasm", build: "npm run market" },
])("$name's .wasm was compiled from the C as it is now (if not: $build -w @open-parlor/wasm)", ({ name, file }) => {
  const game = join(games, name);
  const built = JSON.parse(readFileSync(join(game, `${file}.json`), "utf8")) as { sources: string };
  expect(built.sources).toBe(sourcesHash(game));
});
