// Road to the Shootout, kept by a house: each member's garage, and the marketplace between them.
//
// A garage is kept the way an idle game's store is (stores.ts): the page plays it and sends it here,
// the game's own `loadGarage` checks what arrives, and a save made from an older one is refused and
// handed the newer garage instead. So it is the same garage on every device a member is in the
// house on.
//
// The marketplace is different: what passes between two garages is done here, on the kept copies,
// so that a piece is in one garage or in a listing or in the other garage and never in two. To list,
// buy or take something back, the page first sends its garage, then asks; it is handed the garage
// back as it now stands.
//
// The house is not the only one in the market. The scrappers (the game's own: Ricky at Rix Racing
// and the rest) put pieces up every day, and buy what a member has priced low enough, so there is
// always something for sale and always somebody who will take a piece at a price.
import {
  CAR_MODELS, GARAGE_BAYS, PARTS, SALVAGE, SCRAPPERS, SHELF_SPACE, garageView, giveCar, givePiece, loadGarage, pieceWorth, settleUp, takeCar, takePiece, teardownWorth,
  type GarageState, type OwnedCar, type PartSlot, type Piece, type PieceKind, type SalvageKind,
} from "@journey-to-code/games";

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{
    get(collection: string, key: string): Record<string, unknown> | undefined;
  }>;
}
interface Member {
  id: string;
  name: string;
}
export interface GarageReply {
  status: number;
  body: unknown;
}

/** Something up for sale: a piece off a shelf, or a whole car. `seller` is a member's id, or `bot:<n>` for a scrapper. */
interface Lot {
  id: string;
  seller: string;
  price: number;
  at: number;
  piece?: Omit<Piece, "id">;
  car?: OwnedCar;
}
/** Money waiting for a member whose lot sold while they were away. */
interface Owed {
  amount: number;
  from: string;
  what: string;
}
interface Market {
  lots: Lot[];
  owed: Record<string, Owed[]>;
  /** The day the scrappers last put their stock up. */
  day: number;
}

/** The biggest a saved garage may be, as text. */
const LIMIT = 200_000;
/** The most lots a member may have up, and the most a house's market holds. */
const MY_LOTS = 12;
const ALL_LOTS = 120;
const DAY = 86_400_000;
/** A scrapper takes a member's lot when it has been up this long at a price worth their while. */
const PATIENCE = 10 * 60_000;
const PIECE_KINDS = [...Object.keys(PARTS), ...Object.keys(SALVAGE)] as PieceKind[];

const pieceName = (piece: Pick<Piece, "kind" | "level">) => (piece.kind in SALVAGE ? SALVAGE[piece.kind as SalvageKind].label : (PARTS[piece.kind as PartSlot].levels[piece.level - 1] ?? PARTS[piece.kind as PartSlot].label));

/** A small, steady source of chance from a house's name and the day: the same stock for everyone who looks. */
function chance(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function createGarages(sync: Sync) {
  const keyOf = (house: string, member: string) => `${house}/${member}`;
  const read = async (house: string, member: string) => {
    const doc = (await sync.documents()).get("garages", keyOf(house, member));
    const state = doc?.state ? loadGarage(doc.state) : null;
    return state && typeof doc!.rev === "number" ? { state, rev: doc!.rev } : null;
  };
  const keep = (house: string, member: string, state: GarageState, rev: number, now: number) => sync.write("garages", keyOf(house, member), { state: state as unknown as Record<string, unknown>, rev, savedAt: now, deleted: false });
  const marketOf = async (house: string): Promise<Market> => {
    const doc = (await sync.documents()).get("garagemarkets", house) as Partial<Market> | undefined;
    return { lots: [...(doc?.lots ?? [])], owed: { ...(doc?.owed ?? {}) }, day: typeof doc?.day === "number" ? doc.day : -1 };
  };
  let made = 0;
  const fresh = (now: number) => `${now.toString(36)}${(made++).toString(36)}`;

  /**
   * What the scrappers do when somebody looks: put the day's stock up, and take any member's lot
   * that has sat long enough at a price they like. Returns whether anything changed.
   */
  function tend(house: { slug: string; members: Member[] }, market: Market, now: number): boolean {
    let changed = false;
    // Lots whose seller has left the house go with them.
    const here = market.lots.filter((l) => l.seller.startsWith("bot:") || house.members.some((m) => m.id === l.seller));
    if (here.length !== market.lots.length) {
      market.lots = here;
      changed = true;
    }
    const today = Math.floor(now / DAY);
    if (market.day !== today) {
      const rand = chance(`${house.slug}:${today}`);
      market.lots = market.lots.filter((l) => !l.seller.startsWith("bot:"));
      // Ricky has the most on the shelf. All of it is priced by somebody who knows what it is worth.
      for (const [bot, count] of [[0, 3], [1, 1], [2, 1], [3, 1]] as const) {
        for (let i = 0; i < count; i++) {
          const kind = PIECE_KINDS[Math.floor(rand() * PIECE_KINDS.length)]!;
          const tier = rand() < 0.6 ? 0 : rand() < 0.7 ? 1 : 2;
          const models = CAR_MODELS.map((m, n) => ({ m, n })).filter((e) => e.m.tier === tier);
          const model = models[Math.floor(rand() * models.length)]!.n;
          const level = kind in SALVAGE ? 0 : 1 + Math.floor(rand() * PARTS[kind as PartSlot].levels.length);
          const piece = { kind, level, tier, model, cond: 500 + Math.floor(rand() * 41) * 10 };
          market.lots.push({ id: fresh(now), seller: `bot:${bot}`, price: Math.max(5, Math.round((pieceWorth(piece) * (95 + Math.floor(rand() * 21))) / 100 / 5) * 5), at: now, piece });
        }
      }
      market.day = today;
      changed = true;
    }
    // A member's lot priced under seven tenths of its worth (six tenths of a car's, in pieces) does not last.
    for (const lot of [...market.lots]) {
      if (lot.seller.startsWith("bot:") || now - lot.at < PATIENCE) continue;
      const cheap = lot.piece ? lot.price * 10 <= pieceWorth(lot.piece) * 7 : lot.car ? lot.price * 10 <= teardownWorth(lot.car) * 6 : false;
      if (!cheap) continue;
      const by = SCRAPPERS[chance(lot.id)() < 0.5 ? 0 : 1 + (lot.id.length % (SCRAPPERS.length - 1))]!;
      market.lots = market.lots.filter((l) => l !== lot);
      market.owed[lot.seller] = [...(market.owed[lot.seller] ?? []), { amount: lot.price, from: by, what: lot.piece ? pieceName(lot.piece) : (lot.car?.name ?? "car") }].slice(-30);
      changed = true;
    }
    return changed;
  }

  const saveMarket = (house: string, market: Market) => sync.write("garagemarkets", house, { lots: market.lots, owed: market.owed, day: market.day, deleted: false });

  function look(house: { members: Member[] }, me: Member, market: Market) {
    const nameOf = (seller: string) => (seller.startsWith("bot:") ? (SCRAPPERS[Number(seller.slice(4))] ?? SCRAPPERS[0]) : (house.members.find((m) => m.id === seller)?.name ?? "Somebody who left"));
    return {
      waiting: (market.owed[me.id] ?? []).reduce((sum, o) => sum + o.amount, 0),
      lots: market.lots
        .map((l) => ({
          id: l.id,
          seller: nameOf(l.seller),
          mine: l.seller === me.id,
          scrapper: l.seller.startsWith("bot:"),
          price: l.price,
          at: l.at,
          ...(l.piece ? { piece: { ...l.piece, name: pieceName(l.piece), from: CAR_MODELS[l.piece.model]?.name ?? "", worth: pieceWorth(l.piece) } } : {}),
          ...(l.car ? { car: { name: l.car.name, model: CAR_MODELS[l.car.model]?.name ?? "", engine: l.car.engine, rubber: l.car.rubber, body: l.car.body, runs: l.car.engine > 0 && l.car.body < 300, teardown: teardownWorth(l.car) } } : {}),
        }))
        .sort((a, b) => Number(b.mine) - Number(a.mine) || a.price - b.price),
    };
  }

  /**
   * /houses/:slug/market, for a member of the house.
   *   GET                                   → { waiting, lots }
   *   POST { do: "list", rev, piece | car, price } → the piece or car leaves the garage and goes up for sale
   *   POST { do: "unlist", rev, id }        → and comes back
   *   POST { do: "buy", rev, id }           → it is the buyer's, and the money waits for the seller
   *   POST { do: "collect", rev }           → what was waiting goes into the garage's cash
   * Each POST answers { state, rev, ...the market as GET gives it }: the garage as it now stands.
   * `rev` must be the garage's own: 409 with the kept { state, rev } when it is not.
   */
  async function market(house: { slug: string; members: Member[] }, me: Member, method: string, input: Record<string, unknown>, now: number): Promise<GarageReply> {
    const m = await marketOf(house.slug);
    const tended = tend(house, m, now);
    if (method === "GET") {
      if (tended) await saveMarket(house.slug, m);
      return { status: 200, body: look(house, me, m) };
    }
    const mine = await read(house.slug, me.id);
    if (!mine) return { status: 409, body: { error: "Keep your garage in this house first." } };
    if (mine.rev !== input.rev) return { status: 409, body: { error: "This garage was changed somewhere else since.", state: mine.state, rev: mine.rev } };
    const g = mine.state;
    const done = async (extra: Record<string, unknown> = {}): Promise<GarageReply> => {
      await keep(house.slug, me.id, g, mine.rev + 1, now);
      await saveMarket(house.slug, m);
      return { status: 200, body: { state: g, rev: mine.rev + 1, ...look(house, me, m), ...extra } };
    };
    const no = (error: string, status = 400): GarageReply => ({ status, body: { error } });

    switch (input.do) {
      case "list": {
        const price = typeof input.price === "number" && Number.isSafeInteger(input.price) && input.price >= 5 && input.price <= 1_000_000 ? input.price : 0;
        if (!price) return no("That is not a price.");
        if (m.lots.filter((l) => l.seller === me.id).length >= MY_LOTS) return no(`You can have ${MY_LOTS} things up at once.`);
        if (m.lots.length >= ALL_LOTS) return no("The market is full.");
        if (typeof input.piece === "number") {
          const piece = takePiece(g, input.piece);
          if (!piece) return no("That is not on your shelf.");
          const { id: _id, ...rest } = piece;
          m.lots.push({ id: fresh(now), seller: me.id, price, at: now, piece: rest });
        } else if (typeof input.car === "number") {
          const car = takeCar(g, input.car, true);
          if (!car) return no("You don't own that.");
          m.lots.push({ id: fresh(now), seller: me.id, price, at: now, car });
        } else return no("There is nothing there to sell.");
        return done();
      }
      case "unlist": {
        const lot = m.lots.find((l) => l.id === input.id && l.seller === me.id);
        if (!lot) return no("Somebody has bought it.", 409);
        if (lot.piece ? g.shelf.length >= SHELF_SPACE : g.cars.length >= GARAGE_BAYS) return no("There is no room to take it back.");
        if (lot.piece) givePiece(g, lot.piece);
        else if (lot.car) giveCar(g, lot.car, true);
        m.lots = m.lots.filter((l) => l !== lot);
        return done();
      }
      case "buy": {
        const lot = m.lots.find((l) => l.id === input.id);
        if (!lot) return no("Somebody got there first.", 409);
        if (lot.seller === me.id) return no("That is your own.");
        if (g.cash < lot.price) return no("You can't afford it.");
        if (lot.piece ? g.shelf.length >= SHELF_SPACE : g.cars.length >= GARAGE_BAYS) return no(lot.piece ? "Your shelf is full." : "You have no room for another car.");
        const what = lot.piece ? pieceName(lot.piece) : (lot.car?.name ?? "car");
        if (lot.piece ? !givePiece(g, lot.piece) : !lot.car || !giveCar(g, lot.car, true)) return no("That could not be handed over.");
        settleUp(g, -lot.price);
        m.lots = m.lots.filter((l) => l !== lot);
        if (!lot.seller.startsWith("bot:")) m.owed[lot.seller] = [...(m.owed[lot.seller] ?? []), { amount: lot.price, from: me.name, what }].slice(-30);
        return done({ bought: what });
      }
      case "collect": {
        const owed = m.owed[me.id] ?? [];
        if (!owed.length) return { status: 200, body: { state: g, rev: mine.rev, ...look(house, me, m), sales: [] } };
        settleUp(g, owed.reduce((sum, o) => sum + o.amount, 0));
        delete m.owed[me.id];
        return done({ sales: owed });
      }
      default:
        return no("There is no such thing to do.");
    }
  }

  return {
    /**
     * /houses/:slug/garage, /garages and /market, for a member of the house.
     *   GET  garage            → { state, rev }: this member's garage, or null and 0
     *   POST garage { state, rev } → { rev }, or 409 with the newer { state, rev }
     *   GET  garages           → { garages }: what each member has in theirs, quickest car first
     */
    async handle(house: { slug: string; members: Member[] }, me: Member, action: string, method: string, input: Record<string, unknown>, now = Date.now()): Promise<GarageReply> {
      if (action === "market") return market(house, me, method, input, now);
      if (action === "garage" && method === "GET") {
        const saved = await read(house.slug, me.id);
        return { status: 200, body: { state: saved?.state ?? null, rev: saved?.rev ?? 0 } };
      }
      if (action === "garage" && method === "POST") {
        const loaded = loadGarage(input.state);
        if (!loaded || JSON.stringify(input.state).length > LIMIT) return { status: 400, body: { error: "That is not a garage this parlor can keep." } };
        const saved = await read(house.slug, me.id);
        const from = typeof input.rev === "number" ? input.rev : 0;
        if (saved && saved.rev !== from) return { status: 409, body: { error: "This garage was changed somewhere else since.", state: saved.state, rev: saved.rev } };
        const rev = (saved?.rev ?? 0) + 1;
        await keep(house.slug, me.id, loaded, rev, now);
        return { status: 200, body: { rev } };
      }
      if (action === "garages" && method === "GET") {
        const garages = [];
        for (const member of house.members) {
          const saved = await read(house.slug, member.id);
          if (!saved) continue;
          const view = garageView(saved.state);
          const cars = view.cars.map((c) => ({ name: c.name, model: c.sheet.model, tier: c.sheet.tier, horsepower: c.sheet.horsepower, quarter: c.sheet.quarter?.et ?? null })).sort((a, b) => (a.quarter ?? 1e9) - (b.quarter ?? 1e9));
          garages.push({ id: member.id, name: member.name, me: member.id === me.id, wins: view.record.wins, races: view.record.races, cars });
        }
        garages.sort((a, b) => (a.cars[0]?.quarter ?? 1e9) - (b.cars[0]?.quarter ?? 1e9) || a.name.localeCompare(b.name));
        return { status: 200, body: { garages } };
      }
      return { status: 404, body: { error: "There's nothing there." } };
    },
  };
}
