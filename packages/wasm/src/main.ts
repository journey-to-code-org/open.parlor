// The page: one game for now. As more games that compile to WebAssembly arrive, this becomes the
// shelf they are picked from.
import FREEDOOM from "../games/shooter/data.json";
import art from "../games/shooter/delbies/art/title.webp?url";
import wasm from "../games/shooter/shooter.wasm?url";
import { forgetAssetsExcept } from "../host/assets.ts";
import { applyMod } from "../wad/mod.ts";
import { loadMod } from "../wad/saved.ts";
import { DELBIES, withDelbies } from "./shooter/delbies.ts";
import { mountShooter } from "./shooter/player.ts";
import "./shooter/shooter.css";
import "./styles.css";

// The game is Delbie's Doomsday, set in the store its crew call Delbie's Daycare & Geriatrics (which
// is also the name of the parlor's idle game, and what the title picture says): its own title and levels (games/shooter/delbies) laid
// over Freedoom, free levels, pictures and sounds for the Doom engine, which is everything of the
// game that isn't its own yet. scripts/fetch-data.mjs puts the release named in data.json under
// public/data/.
const wad = `${import.meta.env.BASE_URL}data/${FREEDOOM.file}`;

mountShooter(document.getElementById("game")!, {
  wasm,
  wad: { url: wad, name: "freedoom1.wad", megabytes: FREEDOOM.megabytes },
  base: withDelbies,
  art,
  title: "Delbie's Doomsday",
  blurb: "Delbie's Daycare & Geriatrics is overrun with rats. Clear it out, floor by floor. A first-person shooter on the open-source Doom engine, running in your browser.",
  // Freedoom: Phase 1 is four episodes of nine maps.
  levels: { episodes: 4, maps: 9 },
  // The parlor's server has the rooms that let devices play together; a site without it plays alone.
  rooms: `${import.meta.env.BASE_URL}play`,
  // What the player has changed in the editor is what they play with, alone.
  editor: `${import.meta.env.BASE_URL}editor/`,
  own: {
    apply: async (game) => applyMod(game, await loadMod()),
    note: async () => {
      const changed = (await loadMod()).length;
      return changed ? `Playing alone, you play with the ${changed === 1 ? "one thing" : `${changed} things`} you have changed.` : "";
    },
  },
});

// An older version of the game's data, kept by an earlier visit, is let go.
void forgetAssetsExcept([wad, DELBIES]);

// This page's own service worker keeps it for playing with no connection. Not on the dev server,
// where it would hold on to files that are being changed.
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
