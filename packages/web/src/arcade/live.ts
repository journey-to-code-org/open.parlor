// Which arcade games can be played at a table on the server. In a file of its own, so the lobby,
// a house's page and the room can ask without bringing the arcade's screens with them.
import type { ArcadeGameId } from "@journey-to-code/games";

/** The arcade games that can be played live at a table on the server: by giving orders through the room, or (Shitstorm) flown over a socket. */
export const LIVE_ARCADE: ArcadeGameId[] = ["skyfire", "bulwark", "chipstack"];
export const isLiveArcade = (id: unknown): id is ArcadeGameId => LIVE_ARCADE.includes(id as ArcadeGameId);
