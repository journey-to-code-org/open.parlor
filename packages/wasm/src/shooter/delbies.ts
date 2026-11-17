// Delbie's Doomsday, laid over Freedoom: the game's own title picture and levels
// (games/shooter/delbies), fetched once and kept for playing with no connection.
import over from "../../games/shooter/delbies/delbies.wad?url";
import { asset } from "../../host/assets.ts";
import { layer } from "../../wad/mod.ts";

/** Where the game's own WAD is, for whoever keeps a list of what the page has fetched. */
export const DELBIES = over;

/** Freedoom with Delbie's laid over it. */
export async function withDelbies(game: Uint8Array): Promise<Uint8Array> {
  return layer(game, await asset(over, { valid: (bytes) => String.fromCharCode(...bytes.subarray(0, 4)) === "PWAD" }));
}
