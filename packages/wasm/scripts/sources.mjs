// A hash of everything a game's .wasm is compiled from: its build.json and every .c and .h in the
// folders that names. The build writes it beside the .wasm; a test compares it with the sources as
// they are now, so C that was changed without recompiling fails the tests, not a player.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function sourcesHash(gameDir) {
  const config = readFileSync(join(gameDir, "build.json"));
  const hash = createHash("sha256").update(config);
  for (const folder of JSON.parse(config.toString()).sources)
    for (const name of readdirSync(join(gameDir, folder)).filter((file) => /\.[ch]$/.test(file)).sort())
      hash.update(`${folder}/${name}\0`).update(readFileSync(join(gameDir, folder, name)));
  return hash.digest("hex");
}
