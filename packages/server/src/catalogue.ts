// The catalogue: which games this parlor offers, in what order, and whether people may watch
// tables that have players at them. Its host sets it from the admin app; every page reads it.
//
//   settings/catalogue   server only: the order, the games switched off, the watching switch
//
// The arcade and idle games are in it too. No table is ever opened for one (they are played in the browser,
// against the game itself), but the host places them among the rest and can switch them off.
//
// A game the host has never placed (one added to the parlor since) comes after the ones they
// have, switched on. Switching a game off stops new tables of it; tables already going carry on.
import { ARCADE_GAMES, IDLE_GAMES, type ArcadeGameId, type IdleGameId } from "@journey-to-code/games";
import { GAMES as TABLE_GAMES, type GameId } from "./games.js";

/** Everything the parlor offers: the games tables are opened for, then the arcade. */
const GAMES: { id: GameId | ArcadeGameId | IdleGameId; name: string; emoji: string; seats: [number, number]; teams: boolean }[] = [
  ...TABLE_GAMES,
  ...[...ARCADE_GAMES, ...IDLE_GAMES].map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, seats: [g.seats.min, g.seats.max] as [number, number], teams: g.teams })),
];
const isOffered = (id: unknown): id is GameId | ArcadeGameId | IdleGameId => GAMES.some((g) => g.id === id);

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{ get(collection: string, key: string): Record<string, unknown> | undefined }>;
}

interface Saved {
  order?: unknown;
  off?: unknown;
  watching?: unknown;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-cache" } });
const ids = (value: unknown): (GameId | ArcadeGameId | IdleGameId)[] => [...new Set(Array.isArray(value) ? value.filter(isOffered) : [])];

export function createCatalogue(sync: Sync, { mount = "/catalogue" } = {}) {
  const docs = sync.documents();
  const saved = async () => ((await docs).get("settings", "catalogue") ?? {}) as Saved;

  /** Every game, in the host's order, each on or off; and whether tables with players can be watched. */
  async function state() {
    const s = await saved();
    const off = new Set(ids(s.off));
    const placed = ids(s.order);
    const order = [...placed, ...GAMES.map((g) => g.id).filter((id) => !placed.includes(id))];
    return {
      games: order.map((id) => ({ ...GAMES.find((g) => g.id === id)!, on: !off.has(id) })),
      watching: s.watching !== false,
    };
  }

  return {
    state,
    /** Whether new tables of this game may be opened. */
    async isOn(game: GameId): Promise<boolean> {
      return !ids((await saved()).off).includes(game);
    },
    /** Whether tables with players at them may be watched. */
    async watching(): Promise<boolean> {
      return (await saved()).watching !== false;
    },
    /** Change the catalogue (moderation). Resolves to a problem, or null. */
    async set(change: { order?: unknown; off?: unknown; watching?: unknown }): Promise<string | null> {
      const fields: Record<string, unknown> = {};
      if (change.order !== undefined) fields.order = ids(change.order);
      if (change.off !== undefined) {
        const off = ids(change.off);
        if (off.length >= GAMES.length) return "Leave at least one game switched on.";
        fields.off = off;
      }
      if (change.watching !== undefined) fields.watching = change.watching === true;
      if (Object.keys(fields).length) await sync.write("settings", "catalogue", fields);
      return null;
    },
    /** Answers GET /catalogue; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const { pathname } = new URL(request.url);
      if (pathname !== mount) return null;
      if (request.method !== "GET") return json({ error: "Not found" }, 404);
      return json(await state());
    },
  };
}

export type Catalogue = ReturnType<typeof createCatalogue>;
