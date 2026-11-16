// The same player on another device. A player is a cookie, so a new phone is a new player: no
// houses, no standing on a leaderboard, none of the decks and courses they made. This hands the
// cookie over, with no account and no password:
//
//   POST /me/move          on the device that has it: a short code, good once, for ten minutes
//   POST /me/move/<code>   on the new device: it becomes the same player, and is told their houses
//
// Both devices are the player from then on. The codes live in memory: one that was waiting when
// the server restarted is asked for again.
import { playerCookie, playerOf } from "@journey-to-code/rooms/server";

// No letters that read as each other aloud or on a screen.
const LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;
export const CODE_MINUTES = 10;
/** Wrong codes one address may try before it has to wait: a code is one in 850 billion, and this keeps it that way. */
export const WRONG_TRIES = 8;
const TRY_WINDOW_MS = 10 * 60_000;

const random = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => LETTERS[b % LETTERS.length]).join("");
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
/** A code as typed: any case, with or without the dash it is shown with. */
export const tidyCode = (typed: unknown) => String(typed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

interface Waiting {
  player: string;
  name: string;
  until: number;
}

export function createDevices({ mount = "/me", housesOf = async () => [], now = Date.now }: { mount?: string; /** The houses a player belongs to, as their front page lists them. */ housesOf?: (player: string) => Promise<{ slug: string; name: string }[]>; now?: () => number } = {}) {
  const waiting = new Map<string, Waiting>();
  const wrong = new Map<string, number[]>();
  const sweep = () => {
    for (const [code, entry] of waiting) if (entry.until <= now()) waiting.delete(code);
    for (const [who, times] of wrong) if (!times.some((t) => now() - t < TRY_WINDOW_MS)) wrong.delete(who);
  };

  return {
    /** Answers /me requests; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const { pathname } = new URL(request.url);
      if (pathname !== `${mount}/move` && !pathname.startsWith(`${mount}/move/`)) return null;
      if (request.method !== "POST") return json({ error: "Not found" }, 404);
      sweep();
      const player = playerOf(request);
      const input = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

      if (pathname === `${mount}/move`) {
        if (!player) return json({ error: "There's nothing on this device to move yet: join a house, sit at a table or make something first." }, 400);
        // One code at a time: asking again replaces the one before.
        for (const [code, entry] of waiting) if (entry.player === player) waiting.delete(code);
        const code = random(CODE_LENGTH);
        const until = now() + CODE_MINUTES * 60_000;
        waiting.set(code, { player, name: String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 20), until });
        return json({ code, minutes: CODE_MINUTES, until });
      }

      // Whoever is guessing is known by their address and by the cookie they have, if any.
      const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      // A device with neither (a parlor reached directly, a first visit) shares one count with every other such device.
      const known = [address, player].filter((k): k is string => !!k);
      const who = known.length ? known : ["someone"];
      const tries = (key: string) => (wrong.get(key) ?? []).filter((t) => now() - t < TRY_WINDOW_MS);
      if (who.some((key) => tries(key).length >= WRONG_TRIES)) return json({ error: "Too many wrong codes. Wait ten minutes and get a new one." }, 429);
      const code = tidyCode(pathname.slice(`${mount}/move/`.length));
      const entry = waiting.get(code);
      if (!entry) {
        for (const key of who) wrong.set(key, [...tries(key), now()]);
        return json({ error: "That code isn't right, or it has run out. Get a new one on the other device." }, 404);
      }
      waiting.delete(code); // good once
      if (entry.player === player) return json({ same: true, name: entry.name, houses: await housesOf(entry.player) });
      return json({ same: false, name: entry.name, houses: await housesOf(entry.player) }, 200, { "set-cookie": playerCookie(entry.player, request) });
    },
  };
}
