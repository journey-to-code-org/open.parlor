// Delbie's Doomsday: the game's data (games/shooter/delbies), all of it made here, fetched once and
// kept for playing with no connection.
import game from "../../games/shooter/delbies/delbies.wad?url";

/** The game: where its WAD is, the name the engine opens it by, and the size of the download, for telling whoever is waiting. */
export const DELBIES = { url: game, name: "delbies.wad", megabytes: 2 };
