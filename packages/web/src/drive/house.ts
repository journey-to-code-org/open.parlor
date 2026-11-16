// A garage kept by a house, and the house's marketplace: fetched when the garage opens, sent after
// every change, and swapped for the house's copy when that one was changed somewhere else since.
// What passes between two garages is done by the house, which hands this garage back as it stands.

export interface MarketLot {
  id: string;
  seller: string;
  mine: boolean;
  /** One of the game's own scrappers, not a member of the house. */
  scrapper: boolean;
  price: number;
  piece?: { kind: string; level: number; tier: number; cond: number; name: string; from: string; worth: number };
  car?: { name: string; model: string; engine: number; rubber: number; body: number; runs: boolean; teardown: number };
}
export interface MarketLook {
  /** Dollars from sales, waiting to be collected. */
  waiting: number;
  lots: MarketLot[];
}
export interface HouseGarage {
  id: string;
  name: string;
  me: boolean;
  wins: number;
  races: number;
  cars: { name: string; model: string; tier: string; horsepower: number; quarter: number | null }[];
}

async function call(path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(path, body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
const at = (slug: string, what: string) => `/houses/${encodeURIComponent(slug)}/${what}`;

/** The garage the house keeps for this player: null state when it keeps none. Null when the house can't be reached or won't say. */
export async function fetchGarage(slug: string): Promise<{ state: unknown; rev: number } | null> {
  try {
    const reply = await call(at(slug, "garage"));
    return reply.status === 200 ? { state: reply.body.state ?? null, rev: Number(reply.body.rev) || 0 } : null;
  } catch {
    return null;
  }
}

export type Sent = { kind: "saved"; rev: number } | { kind: "newer"; state: unknown; rev: number } | { kind: "gone" } | { kind: "offline" };
/** Send the garage to the house. "newer" comes with the house's own copy when it was changed somewhere else since. */
export async function sendGarage(slug: string, state: unknown, rev: number): Promise<Sent> {
  try {
    const reply = await call(at(slug, "garage"), { state, rev });
    if (reply.status === 200) return { kind: "saved", rev: Number(reply.body.rev) || rev + 1 };
    if (reply.status === 409) return { kind: "newer", state: reply.body.state, rev: Number(reply.body.rev) || 0 };
    if (reply.status === 403 || reply.status === 404) return { kind: "gone" };
    return { kind: "offline" };
  } catch {
    return { kind: "offline" };
  }
}

export async function fetchMarket(slug: string): Promise<MarketLook | null> {
  try {
    const reply = await call(at(slug, "market"));
    return reply.status === 200 ? { waiting: Number(reply.body.waiting) || 0, lots: Array.isArray(reply.body.lots) ? reply.body.lots : [] } : null;
  } catch {
    return null;
  }
}

export interface MarketDone {
  ok: boolean;
  status: number;
  error?: string;
  /** The garage as the house now has it, when the house sent one (on success, and when this copy was stale). */
  state?: unknown;
  rev?: number;
  look?: MarketLook;
  bought?: string;
  sales?: { amount: number; from: string; what: string }[];
}
/** List, take back, buy or collect. The garage must have been sent first: `rev` is the house's own. */
export async function marketDo(slug: string, input: Record<string, unknown>): Promise<MarketDone> {
  try {
    const reply = await call(at(slug, "market"), input);
    const b = reply.body ?? {};
    return { ok: reply.status === 200, status: reply.status, error: b.error, state: b.state, rev: typeof b.rev === "number" ? b.rev : undefined, look: Array.isArray(b.lots) ? { waiting: Number(b.waiting) || 0, lots: b.lots } : undefined, bought: b.bought, sales: b.sales };
  } catch {
    return { ok: false, status: 0, error: "The house can't be reached just now." };
  }
}

export async function fetchGarages(slug: string): Promise<HouseGarage[]> {
  try {
    const reply = await call(at(slug, "garages"));
    return reply.status === 200 && Array.isArray(reply.body.garages) ? reply.body.garages : [];
  } catch {
    return [];
  }
}
