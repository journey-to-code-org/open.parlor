// An idle game's store, kept by a house: fetched when the page opens, sent every so often, and
// swapped for the house's copy when that one has been played somewhere else since.
import type { IdleGameId } from "@journey-to-code/games";

export interface Standing {
  id: string;
  name: string;
  me: boolean;
  score: number;
  perSecond: number;
  moves: number;
  crew: number;
  savedAt: number;
}

async function call(path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(path, body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

/** The store the house keeps for this player: null state when it keeps none. Null when the house can't be reached or won't say. */
export async function fetchStore(slug: string, game: IdleGameId): Promise<{ state: unknown; rev: number } | null> {
  try {
    const reply = await call(`/houses/${encodeURIComponent(slug)}/store?game=${game}`);
    return reply.status === 200 ? { state: reply.body.state ?? null, rev: Number(reply.body.rev) || 0 } : null;
  } catch {
    return null;
  }
}

/**
 * Send the store to the house. "saved" with the new rev; "newer" with the house's own copy when it
 * was played somewhere else since; "gone" when this browser is no longer in the house; "offline"
 * when the house could not be reached (try again later).
 */
export async function sendStore(slug: string, game: IdleGameId, state: unknown, rev: number): Promise<{ kind: "saved"; rev: number } | { kind: "newer"; state: unknown; rev: number } | { kind: "gone" } | { kind: "offline" }> {
  try {
    const reply = await call(`/houses/${encodeURIComponent(slug)}/store`, { game, state, rev });
    if (reply.status === 200) return { kind: "saved", rev: Number(reply.body.rev) || rev + 1 };
    if (reply.status === 409) return { kind: "newer", state: reply.body.state, rev: Number(reply.body.rev) || 0 };
    if (reply.status === 403 || reply.status === 404) return { kind: "gone" };
    return { kind: "offline" };
  } catch {
    return { kind: "offline" };
  }
}

/** How the house's stores stand, biggest first. Empty when it can't be reached. */
export async function fetchStandings(slug: string, game: IdleGameId): Promise<Standing[]> {
  try {
    const reply = await call(`/houses/${encodeURIComponent(slug)}/stores?game=${game}`);
    return reply.status === 200 && Array.isArray(reply.body.stores) ? (reply.body.stores as Standing[]) : [];
  } catch {
    return [];
  }
}

/** What goes on between a house's stores, as one member sees it. */
export interface NetworkLook {
  /** Things waiting to be collected. */
  waiting: number;
  listings: { id: string; name: string; amount: number; mine: boolean }[];
  /** Seconds until the house lets this member send another driver. */
  hotshotWait: number;
}
export interface Parcel {
  what: "hotshot" | "sold";
  from: string;
}

export async function fetchNetwork(slug: string, game: IdleGameId): Promise<NetworkLook | null> {
  try {
    const reply = await call(`/houses/${encodeURIComponent(slug)}/network?game=${game}`);
    if (reply.status !== 200) return null;
    return { waiting: Number(reply.body.waiting) || 0, listings: Array.isArray(reply.body.listings) ? reply.body.listings : [], hotshotWait: Number(reply.body.hotshotWait) || 0 };
  } catch {
    return null;
  }
}

/** Do something on the house's network. `ok` when it was done; otherwise the house's reason, or none when it could not be reached. */
export async function networkDo(slug: string, game: IdleGameId, what: "collect" | "hotshot" | "list" | "unlist" | "buy", more: Record<string, unknown> = {}): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const reply = await call(`/houses/${encodeURIComponent(slug)}/network`, { game, do: what, ...more });
    return { ok: reply.status === 200, status: reply.status, body: reply.body };
  } catch {
    return { ok: false, status: 0, body: {} };
  }
}
