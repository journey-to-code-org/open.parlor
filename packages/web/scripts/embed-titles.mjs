// The WordPress plugin and the Shopify block get their visible title from the package name
// (`--name cardroom`, which has to stay so existing installs keep their slug). Say open.parlor instead.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist/embed");
for (const [file, from, to] of [
  ["wordpress/cardroom/cardroom.php", "'title' => 'Card Room'", "'title' => 'open.parlor'"],
  ["shopify/blocks/card-room.liquid", '"name": "Card Room"', '"name": "open.parlor"'],
]) {
  const path = join(dist, file);
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`embed-titles: expected ${from} in ${file}`);
  writeFileSync(path, text.replace(from, to));
}
