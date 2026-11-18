// Writes public/battler-defaults.json: the Back Room's own numbers, for the admin app's Tuning page.
// Run with `npm run battler:defaults` after changing src/battler/cards.ts.
import { writeFileSync } from "node:fs";
import { defaults } from "../src/battler/defaults.ts";

writeFileSync(new URL("../public/battler-defaults.json", import.meta.url), `${JSON.stringify(defaults(), null, 2)}\n`);
console.log("wrote public/battler-defaults.json");
