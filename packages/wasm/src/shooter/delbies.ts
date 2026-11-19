// Delbie's Doomsday: the game's data (games/shooter/delbies), all of it made here, fetched once and
// kept for playing with no connection.
import game from "../../games/shooter/delbies/delbies.wad?url";

/** The game: where its WAD is, the name the engine opens it by, and the size of the download, for telling whoever is waiting. */
export const DELBIES = { url: game, name: "delbies.wad", megabytes: 3 };

/** Where each of the game's songs is, by name: fetched one at a time, the first time the engine plays it. */
export const SONGS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>("../../games/shooter/delbies/music/*.mp3", { query: "?url", import: "default", eager: true })).map(([path, url]) => [path.replace(/^.*\/|\.mp3$/g, ""), url]),
);
