// Writes <card-room> as an open.blog theme component (open.blog ADR 0408/0409) into dist/embed/openblog/:
// the plain custom element, its CSS, its Zubra source (so open.blog can render it ahead), and the
// declaration to add to a theme's theme.json. The owner then places it from Admin's Landing page with
// a form, no code. A theme loads only its own files, so these are copied into the theme's folder.
//
// The form's list of games is a file too, card-room.games.json, which the declaration names as the
// game setting's `choicesFrom` (open.blog ADR 0433). When the parlor gains a game, a theme replaces
// that one file. Palace, Spades and both stay written in the declaration, so an open.blog from
// before choices files still offers them.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gameChoices } from "./embed-games.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../../ui/embed/card-room.zb");
const out = join(here, "../dist/embed/openblog");
mkdirSync(out, { recursive: true });
const zubra = (...args) => execFileSync("npx", ["zubra", "compile", source, ...args], { encoding: "utf8" });
writeFileSync(join(out, "card-room.js"), zubra("--emit", "element"));
writeFileSync(join(out, "card-room.css"), zubra("--emit", "css"));
copyFileSync(source, join(out, "card-room.zb"));
writeFileSync(join(out, "card-room.games.json"), `${JSON.stringify({ choices: gameChoices() }, null, 2)}\n`);

const declaration = {
  "card-room": {
    label: "Parlor",
    description: "Play one of the parlor's games right on the page, and a button to challenge you to a game.",
    script: "components/card-room.js",
    source: "components/card-room.zb",
    fallback: "A game table sits here: play one of the parlor's games, or send a challenge.",
    props: [
      { name: "server", type: "text", label: "Parlor address", required: true, maxLength: 200, help: "Where your parlor runs, like https://your-card-room.up.railway.app" },
      {
        name: "game",
        type: "choice",
        label: "Game",
        default: "both",
        choices: [
          { value: "both", label: "Palace and Spades" },
          { value: "palace", label: "Palace" },
          { value: "spades", label: "Spades" },
        ],
        choicesFrom: "components/card-room.games.json",
      },
      { name: "challenge", type: "text", label: "Challenge link code", maxLength: 40, help: "The end of your challenge link, after ?challenge=. Leave it empty for no Challenge button." },
      { name: "who", type: "text", label: "Your name on the button", maxLength: 30, default: "me", help: "Shown as “Challenge Grammi to Palace”." },
    ],
  },
};
writeFileSync(join(out, "theme-components.json"), `${JSON.stringify({ components: declaration }, null, 2)}\n`);
writeFileSync(
  join(out, "README.md"),
  `# <card-room> for an open.blog theme

1. Copy \`card-room.js\`, \`card-room.zb\`, \`card-room.css\` and \`card-room.games.json\` into your theme's
   \`components/\` folder.
2. Add the \`components\` entry from \`theme-components.json\` to your theme's \`theme.json\`, and list
   \`components/card-room.css\` under its \`stylesheets\`.
3. In Admin, open **Landing page → Add a section → Parlor**, and fill in your parlor's address and
   (optionally) your challenge link code.

With seasons, declare it on the theme the seasons extend, so every season offers it.

\`card-room.games.json\` is the list of games the form offers (open.blog reads it as the game setting's
\`choicesFrom\`). When the parlor gains a game, replace that one file with the parlor's own copy at
\`/embed/openblog/card-room.games.json\`; nothing else changes. An open.blog from before choices files
offers Palace, Spades or both.
`,
);
console.log(`open.blog theme component written to ${out}`);
