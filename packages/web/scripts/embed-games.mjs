// Writes the games the <card-room> widget can deal into its source (ui/embed/card-room.zb), between
// the GAMES markers: every kit game, with Spades and Palace, and the arcade and idle games, by name,
// emoji and blurb. The widget is rendered ahead by open.blog's build, so the list is written into it
// rather than fetched.
// Run after adding a game: node scripts/embed-games.mjs (test/embed-games.test.ts checks it's current).
//
// The build also writes the same list as a file the parlor serves, `embed/games.json`
// (node scripts/embed-games.mjs --manifest <file>): a widget already copied into a theme or a plugin
// asks for it, so it learns about new games without being copied again.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCADE_GAMES, IDLE_GAMES, KIT_GAMES } from "@journey-to-code/games";

export const FILE = join(dirname(fileURLToPath(import.meta.url)), "../../ui/embed/card-room.zb");
const OWN = {
  palace: { name: "Palace", emoji: "🏰", blurb: "Shed every card first. Don't get stuck holding the pile." },
  spades: { name: "Spades", emoji: "♠︎", blurb: "Partners, bids and nils, with computer partners who talk back." },
};

// Where the parlor words a game differently from its engine (src/arcade/flavour.ts), the widget does too.
const WORDED = {
  skyfire: "It's raining you-know-what. Fly the plunger through the storm, wave after wave, with the fan every fifth and a score to beat.",
};

/** Every game the widget can play, by id: its name, emoji and blurb, and `solo` for a game played against itself. */
export function games() {
  const games = { ...OWN };
  // Draw & Guess can't be practised (computer players can't draw), so it can't be dealt in a page.
  for (const g of KIT_GAMES) if (g.practice !== false) games[g.id] = { name: g.name, emoji: g.emoji, blurb: g.tagline };
  // An arcade or idle game is played against the game itself: `solo` tells the widget there is no
  // computer opponent to mention, no challenge to send and no family table to open.
  for (const g of [...ARCADE_GAMES, ...IDLE_GAMES]) games[g.id] = { name: g.name, emoji: g.emoji, blurb: WORDED[g.id] ?? g.tagline, solo: true };
  return games;
}

/** What the parlor serves at `embed/games.json`. */
export const manifest = () => ({ games: games() });

/**
 * The games an open.blog form offers after Palace and Spades (which its declaration writes out), by
 * name: the choices file scripts/openblog-component.mjs writes beside the theme component.
 */
export function gameChoices() {
  return Object.entries(games())
    .filter(([id]) => id !== "palace" && id !== "spades")
    .map(([value, g]) => ({ value, label: g.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}

export function gamesBlock() {
  return `  // GAMES: written by packages/web/scripts/embed-games.mjs\n  const GAMES = ${JSON.stringify(games(), null, 2).replace(/\n/g, "\n  ")}\n  // GAMES end`;
}

export function withGames(source) {
  const start = source.indexOf("  // GAMES: written by");
  const end = source.indexOf("  // GAMES end");
  if (start < 0 || end < 0) throw new Error("embed-games: the GAMES markers are missing from card-room.zb");
  return source.slice(0, start) + gamesBlock() + source.slice(end + "  // GAMES end".length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--manifest");
  if (at < 0) writeFileSync(FILE, withGames(readFileSync(FILE, "utf8")));
  else {
    const out = process.argv[at + 1];
    if (!out) throw new Error("embed-games: --manifest needs a file to write");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(manifest())}\n`);
  }
}
