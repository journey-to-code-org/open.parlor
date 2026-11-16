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

/** Something on its way to a member's store from another one in the house. */
interface Parcel {
  id: string;
  what: "hotshot" | "sold";
  from: string;
}
/** A member's tabs, up for the rest of the house to buy. */
interface Listing {
  id: string;
  seller: string;
  amount: number;
  at: number;
}
/** What goes on between a house's stores: one document per house per game. */
interface Network {
  inbox: Record<string, Parcel[]>;
  listings: Listing[];
  /** When each member last sent a driver out. */
  sent: Record<string, number>;
}
/** A driver can be sent this often: a little under what the game itself allows, so a slow clock never loses a run. */
const HOTSHOT_EVERY = 14 * 60_000;
/** The most that can wait for a member who has not opened their store. */
const INBOX = 30;

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

  const networkOf = async (house: string, game: IdleGameId): Promise<Network> => {
    const doc = (await sync.documents()).get("networks", `${house}/${game}`) as Partial<Network> | undefined;
    return { inbox: { ...(doc?.inbox ?? {}) }, listings: [...(doc?.listings ?? [])], sent: { ...(doc?.sent ?? {}) } };
  };
  let made = 0;
  const fresh = (now: number) => `${now.toString(36)}${(made++).toString(36)}`;

  /**
   * /houses/:slug/network, for a member of the house: what goes on between its stores.
   *   GET  ?game=                      → { waiting, listings, members, hotshotWait }
   *   POST { game, do: "collect" }      → { parcels }: what was waiting for this member, now theirs
   *   POST { game, do: "hotshot", to }  → a parcel for that member; 429 when the truck was out too recently
   *   POST { game, do: "list", amount } → this member's tabs go up for sale (one lot each)
   *   POST { game, do: "unlist" }       → and come down; 409 when somebody has bought them
   *   POST { game, do: "buy", id }      → the lot is the buyer's, and its seller is told; 409 when it is gone
   * The game decides what each of these is worth to a store. This only passes them between members.
   */
  async function network(house: { slug: string; members: Member[] }, me: Member, game: IdleGameId, method: string, input: Record<string, unknown>, now: number): Promise<StoreReply> {
    const net = await networkOf(house.slug, game);
    const nameOf = (id: string) => house.members.find((m) => m.id === id)?.name ?? "Somebody who left";
    const keep = () => sync.write("networks", `${house.slug}/${game}`, { inbox: net.inbox, listings: net.listings, sent: net.sent, deleted: false });
    // Lots whose seller has left the house are gone with them.
    net.listings = net.listings.filter((l) => house.members.some((m) => m.id === l.seller));
    const wait = () => Math.max(0, (net.sent[me.id] ?? 0) + HOTSHOT_EVERY - now);

    if (method === "GET") {
      return {
        status: 200,
        body: {
          waiting: (net.inbox[me.id] ?? []).length,
          listings: net.listings.map((l) => ({ id: l.id, name: nameOf(l.seller), amount: l.amount, mine: l.seller === me.id })),
          members: house.members.filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: m.name })),
          hotshotWait: Math.ceil(wait() / 1000),
        },
      };
    }
    switch (input.do) {
      case "collect": {
        const parcels = net.inbox[me.id] ?? [];
        if (parcels.length) {
          delete net.inbox[me.id];
          await keep();
        }
        return { status: 200, body: { parcels: parcels.map((p) => ({ what: p.what, from: p.from })) } };
      }
      case "hotshot": {
        const to = house.members.find((m) => m.id === input.to && m.id !== me.id);
        if (!to) return { status: 400, body: { error: "That is nobody in this house." } };
        if (wait() > 0) return { status: 429, body: { error: "The truck was out too recently.", hotshotWait: Math.ceil(wait() / 1000) } };
        net.sent[me.id] = now;
        net.inbox[to.id] = [...(net.inbox[to.id] ?? []), { id: fresh(now), what: "hotshot" as const, from: me.name }].slice(-INBOX);
        await keep();
        return { status: 200, body: { to: to.name } };
      }
      case "list": {
        const amount = typeof input.amount === "number" && Number.isSafeInteger(input.amount) && input.amount > 0 ? input.amount : 0;
        if (!amount) return { status: 400, body: { error: "That is not an amount." } };
        net.listings = [...net.listings.filter((l) => l.seller !== me.id), { id: fresh(now), seller: me.id, amount, at: now }];
        await keep();
        return { status: 200, body: {} };
      }
      case "unlist": {
        if (!net.listings.some((l) => l.seller === me.id)) return { status: 409, body: { error: "Somebody has bought them." } };
        net.listings = net.listings.filter((l) => l.seller !== me.id);
        await keep();
        return { status: 200, body: {} };
      }
      case "buy": {
        const lot = net.listings.find((l) => l.id === input.id);
        if (!lot) return { status: 409, body: { error: "Somebody got there first." } };
        if (lot.seller === me.id) return { status: 400, body: { error: "Those are your own." } };
        net.listings = net.listings.filter((l) => l !== lot);
        net.inbox[lot.seller] = [...(net.inbox[lot.seller] ?? []), { id: fresh(now), what: "sold" as const, from: me.name }].slice(-INBOX);
        await keep();
        return { status: 200, body: { from: nameOf(lot.seller) } };
      }
      default:
        return { status: 400, body: { error: "There is no such thing to do." } };
    }
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
      if (action === "network") return network(house, me, game, method, input, now);

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
