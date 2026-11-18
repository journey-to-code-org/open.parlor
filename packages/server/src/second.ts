// More than one person at one device, at a table on the server.
//
// A seat at a table belongs to a browser: its `rooms_player` cookie says who it is, and a player
// holds one seat. So two people who share a phone could only ever take one seat between them. For
// a game with nothing to hide (Mini Golf, Bowling, Chess: the web app's sameDevice.ts has the list)
// that is no way to play with a friend who is on a phone of their own.
//
// The answer here needs nothing new from the rooms kit. A request whose path starts
// `/second/<n>/` is the same request with that part taken off, made by somebody else: a player
// whose id is worked out from this browser's own id and `n`. So the second person at a device has
// a seat, a view and moves of their own, through the very same routes, and the page keeps a second
// room open at `/second/1/rooms` beside its first (web: second.ts).
//
// The worked-out id cannot be turned back into the browser's, and nobody can ask for it without
// that browser's cookie, so a second seat is as much its device's as the first. Only the rooms,
// their sync log and the lobby's "still here" are reached this way: a second person is somebody at
// a table, not a member of a house or the maker of a design.
import { createHash } from "node:crypto";
import { newPlayerId, playerCookie, playerOf } from "@journey-to-code/rooms/server";

/** How many more people a device can seat beside its own player. */
export const SECONDS = 3;
const PREFIX = /^\/second\/([1-9])(\/.*)?$/;
/** What a second person may reach. */
const REACH = ["/rooms", "/_zb", "/lobby"];

/** The player a device's `n`th extra person is: the same for the same device every time, and not the device's own. */
export const secondOf = (player: string, n: number) => createHash("sha256").update(`${player}:second:${n}`).digest("hex").slice(0, 32);

export interface Second {
  /** Which extra person, from 1. */
  n: number;
  /** The path with `/second/<n>` taken off. */
  path: string;
}

/** Whether a path is a second person's, and if so whose and for what. Null for any other path. */
export function secondPath(pathname: string): Second | null {
  const match = PREFIX.exec(pathname);
  return match ? { n: Number(match[1]), path: match[2] ?? "/" } : null;
}

/**
 * A request's query as its second person would send it. A page's live stream names the tab it is
 * for (`peer`), and the sync log gives a tab one stream; the second person's stream is opened by
 * the same tab, so it is given a name of its own, the same every time it reconnects.
 */
export function secondSearch(search: string, n: number): string {
  const query = new URLSearchParams(search);
  const peer = query.get("peer");
  if (!peer) return search;
  query.set("peer", `${peer}-${n}`);
  return `?${query}`;
}

/** Whether a second person may ask for this: an extra person there is room for, at a route that is about a table. */
export const secondAllowed = (second: Second) => second.n <= SECONDS && REACH.some((m) => second.path === m || second.path.startsWith(`${m}/`));

/**
 * The cookies of a request as its second person would send them. A browser that is nobody yet is
 * made somebody first, so that its second person is the same one next time: `setCookie` is then the
 * header to send back.
 */
export function secondCookie(cookie: string, n: number, request?: Request): { cookie: string; setCookie: string | null } {
  let player = playerOf(new Request("http://x/", { headers: { cookie } }));
  let setCookie: string | null = null;
  if (!player) {
    player = newPlayerId();
    setCookie = playerCookie(player, request);
  }
  const others = cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("rooms_player="));
  return { cookie: [...others, `rooms_player=${secondOf(player, n)}`].join("; "), setCookie };
}
