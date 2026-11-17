// Writes the games the <card-room> widget can deal into its source (ui/embed/card-room.zb), between
// the GAMES markers: every kit game, with Spades and Palace, by name, emoji and blurb. The widget is
// rendered ahead by open.blog's build, so the list is written into it rather than fetched.
// Run after adding a game: node scripts/embed-games.mjs (test/embed-games.test.ts checks it's current).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KIT_GAMES } from "@journey-to-code/games";

export const FILE = join(dirname(fileURLToPath(import.meta.url)), "../../ui/embed/card-room.zb");
const OWN = {
  palace: { name: "Palace", emoji: "🏰", blurb: "Shed every card first. Don't get stuck holding the pile." },
  spades: { name: "Spades", emoji: "♠︎", blurb: "Partners, bids and nils, with computer partners who talk back." },
};

export function gamesBlock() {
  const games = { ...OWN };
  // Draw & Guess can't be practised (computer players can't draw), so it can't be dealt in a page.
  for (const g of KIT_GAMES) if (g.practice !== false) games[g.id] = { name: g.name, emoji: g.emoji, blurb: g.tagline };
  return `  // GAMES: written by packages/web/scripts/embed-games.mjs\n  const GAMES = ${JSON.stringify(games, null, 2).replace(/\n/g, "\n  ")}\n  // GAMES end`;
}

export function withGames(source) {
  const start = source.indexOf("  // GAMES: written by");
  const end = source.indexOf("  // GAMES end");
  if (start < 0 || end < 0) throw new Error("embed-games: the GAMES markers are missing from card-room.zb");
  return source.slice(0, start) + gamesBlock() + source.slice(end + "  // GAMES end".length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeFileSync(FILE, withGames(readFileSync(FILE, "utf8")));
