// A house member's idle game, kept on the server: the same store from any device they are signed in
// to the house on, and something for the rest of the house to see.
//
// One server-only document per member per game (`stores/<house>/<game>/<member>`). A page still
// plays its store itself, from the clock, and sends it here every so often; the game's own `load`
// checks what arrives. Two devices cannot both be right, so each save says which save it was made
// from (`rev`): one made from an older save is refused and handed the newer store instead.
import { idleGame, isIdleGame, type IdleGameId } from "@journey-to-code/games";

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{
    get(collection: string, key: string): Record<string, unknown> | undefined;
    all(collection: string, prefix?: string): Array<{ key: string } & Record<string, unknown>>;
  }>;
}
interface Member {
  id: string;
  name: string;
}
export interface StoreReply {
  status: number;
  body: unknown;
}

/** The biggest a saved store may be, as text: far more than any real one. */
const LIMIT = 200_000;

export function createStores(sync: Sync) {
  const keyOf = (house: string, game: IdleGameId, member: string) => `${house}/${game}/${member}`;
  const read = async (house: string, game: IdleGameId, member: string) => {
    const doc = (await sync.documents()).get("stores", keyOf(house, game, member));
    return doc && typeof doc.rev === "number" && doc.state ? { state: doc.state as unknown, rev: doc.rev, savedAt: typeof doc.savedAt === "number" ? doc.savedAt : 0 } : null;
  };

  /** How a store stands, for the rest of the house: never the store itself. */
  function standing(game: IdleGameId, state: unknown) {
    const engine = idleGame(game)!;
    const loaded = engine.load(state);
    if (!loaded) return null;
    const at = (loaded as { t?: number }).t ?? 0;
    const view = engine.view(loaded, { now: at, minute: 12 * 60, day: 1 }) as { perSecond?: number; move?: { moves?: number }; crew?: { hired?: boolean }[] };
    return { score: engine.score(loaded), perSecond: view.perSecond ?? 0, moves: view.move?.moves ?? 0, crew: view.crew?.filter((c) => c.hired).length ?? 0 };
  }

  return {
    /**
     * /houses/:slug/store and /houses/:slug/stores, for a member of the house.
     *   GET  store?game=            → { state, rev }: this member's store, or null and 0
     *   POST store { game, state, rev } → { rev }, or 409 with the newer { state, rev }
     *   GET  stores?game=           → { game, stores }: every member's standing, biggest first
     */
    async handle(house: { slug: string; members: Member[] }, me: Member, action: string, method: string, input: Record<string, unknown>, query: URLSearchParams, now = Date.now()): Promise<StoreReply> {
      const asked = method === "POST" ? input.game : query.get("game");
      if (!isIdleGame(asked)) return { status: 400, body: { error: "That is not a game that keeps a store." } };
      const game = asked;

      if (action === "store" && method === "GET") {
        const saved = await read(house.slug, game, me.id);
        return { status: 200, body: { state: saved?.state ?? null, rev: saved?.rev ?? 0 } };
      }
      if (action === "store" && method === "POST") {
        const loaded = idleGame(game)!.load(input.state);
        if (!loaded || JSON.stringify(input.state).length > LIMIT) return { status: 400, body: { error: "That is not a store this parlor can keep." } };
        const saved = await read(house.slug, game, me.id);
        const from = typeof input.rev === "number" ? input.rev : 0;
        // Made from an older save than the one kept: another device has played since. Hand that one back.
        if (saved && saved.rev !== from) return { status: 409, body: { error: "This store was played somewhere else since.", state: saved.state, rev: saved.rev } };
        const rev = (saved?.rev ?? 0) + 1;
        await sync.write("stores", keyOf(house.slug, game, me.id), { state: loaded as Record<string, unknown>, rev, savedAt: now, deleted: false });
        return { status: 200, body: { rev } };
      }
      if (action === "stores" && method === "GET") {
        const docs = await sync.documents();
        const stores = house.members.flatMap((m) => {
          const doc = docs.get("stores", keyOf(house.slug, game, m.id));
          const stands = doc?.state ? standing(game, doc.state) : null;
          return stands ? [{ id: m.id, name: m.name, me: m.id === me.id, savedAt: typeof doc!.savedAt === "number" ? doc!.savedAt : 0, ...stands }] : [];
        });
        stores.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        return { status: 200, body: { game, stores } };
      }
      return { status: 404, body: { error: "There's nothing there." } };
    },
  };
}
