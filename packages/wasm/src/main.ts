// The page: one game for now. As more games that compile to WebAssembly arrive, this becomes the
// shelf they are picked from.
import FREEDOOM from "../games/shooter/data.json";
import wasm from "../games/shooter/shooter.wasm?url";
import { forgetAssetsExcept } from "../host/assets.ts";
import { mountShooter } from "./shooter/player.ts";
import "./styles.css";

// The game's data for now is Freedoom: free levels, pictures and sounds for the Doom engine.
// scripts/fetch-data.mjs puts the release named in data.json under public/data/.
const wad = `${import.meta.env.BASE_URL}data/${FREEDOOM.file}`;

mountShooter(document.getElementById("game")!, {
  wasm,
  wad: { url: wad, name: "freedoom1.wad", megabytes: FREEDOOM.megabytes },
  title: "Freedoom: Phase 1",
  blurb: "A first-person shooter on the open-source Doom engine, running in your browser.",
  // Freedoom: Phase 1 is four episodes of nine maps.
  levels: { episodes: 4, maps: 9 },
  // The parlor's server has the rooms that let devices play together; a site without it plays alone.
  rooms: `${import.meta.env.BASE_URL}play`,
});

// An older version of the game's data, kept by an earlier visit, is let go.
void forgetAssetsExcept([wad]);

// This page's own service worker keeps it for playing with no connection. Not on the dev server,
// where it would hold on to files that are being changed.
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
