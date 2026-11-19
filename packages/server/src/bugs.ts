// "Report a problem" and "Ask for a game": the parlor's side of @journey-to-code/relay (the issue
// filing, the limits and the screenshots all live there). What's here is what only the parlor knows:
// where the relay keeps its few records (the sync log, in a collection the pull route never shares),
// who is asking (the player cookie), and how to describe a table without saying who is at it.
//
//   bugs/shot-<id>   server only: one screenshot (served at /bugs/shots/<id>.jpg)
//   bugs/shots       server only: when each was taken, for dropping the oldest
//   bugs/reports     server only: issue number → the table it was sent from
//
// And one route of the parlor's own: GET /bugs/fixed?n=12,34 says which of those issues have been
// closed as fixed, so a page can tell the player who reported one (see web/src/fixedNotice.ts). It
// says only what the issue already says in public: its number, its title and that it's fixed.
import { createRelay, type RelayOptions } from "@journey-to-code/relay/server";
import { LIMITS } from "@journey-to-code/relay";
import { playerOf, type RoomDoc } from "@journey-to-code/rooms/server";
import { gameName, gameOfOptions } from "./games.js";

interface Rooms {
  sync: {
    write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
    documents(): Promise<{ get(collection: string, key: string): Record<string, unknown> | undefined }>;
  };
  room(id: string): Promise<RoomDoc<unknown> | undefined>;
}

/** The relay's own options that the parlor lets its host (and its tests) change. */
export type BugOptions = Pick<RelayOptions, "token" | "repo" | "version" | "mount" | "each" | "daily" | "tidy" | "tidies" | "fetch" | "now">;

/** Where reports go when `CARDROOM_GITHUB_REPO` isn't set. */
export const DEFAULT_REPO = "journey-to-code-org/open.parlor";
/** The biggest body the server reads from a report: a screenshot as base64, and the rest. */
export const REPORT_LIMIT = LIMITS.report;

export function createBugs(rooms: Rooms, options: BugOptions = {}) {
  const docs = rooms.sync.documents();

  /** What everyone at a table can see about it that helps explain a problem: never who's there. */
  async function tableLines(id: string): Promise<string[] | null> {
    const room = /^[a-z0-9-]{1,40}$/i.test(id) ? await rooms.room(id) : undefined;
    if (!room) return null;
    const people = room.seats.filter((s) => s.name && !s.bot).length;
    const bots = room.seats.filter((s) => s.bot).length;
    const moves = Object.keys((await docs).get("moves", id) ?? {}).length;
    return [
      `Game: ${gameName(gameOfOptions(room.info ?? room.summary))}`,
      `Seats: ${room.seats.length} (${people} ${people === 1 ? "person" : "people"}, ${bots} computer, ${room.seats.length - people - bots} empty)`,
      `Dealt: ${room.started ? `yes, ${moves} ${moves === 1 ? "move" : "moves"} in` : "not yet"}`,
      `Kind of table: ${room.locked ? "tournament match" : room.open ? "open to everyone" : "family table"}`,
      ...(room.settings ? [`Settings: ${JSON.stringify(room.settings)}`] : []),
      ...(room.info ? [`Rules: ${JSON.stringify(room.info).slice(0, 3000)}`] : []),
    ];
  }

  const repo = /^[\w.-]+\/[\w.-]+$/.test(options.repo?.trim() ?? "") ? options.repo!.trim() : DEFAULT_REPO;
  const relay = createRelay({
    appName: "open.parlor",
    userNoun: "player",
    mount: "/bugs",
    actions: { report: "Report a problem", request: "Ask for a game" },
    labels: { bug: ["bug", "player report"], request: ["enhancement", "game request"] },
    requestTitle: "Game request",
    enrichTitle: "The table",
    store: {
      read: async (key) => (await docs).get("bugs", key),
      patch: async (key, fields) => void (await rooms.sync.write("bugs", key, fields)),
    },
    identify: (request) => playerOf(request) ?? undefined,
    enrich: ({ ref }) => tableLines(ref),
    ...options,
    repo,
  });
  const fixed = fixedIssues({ repo, token: options.token, fetch: options.fetch, now: options.now });
  return {
    ...relay,
    /** The relay's routes, and /bugs/fixed. */
    fetch: async (request: Request) => (await fixed(request)) ?? relay.fetch(request),
  };
}

/** The most issues one page may ask about at once. */
export const FIXED_ASKED = 10;
/** How long what GitHub said about an issue is kept before asking again: a fix doesn't need telling to the minute. */
export const FIXED_KEPT_MS = 15 * 60_000;

/**
 * GET /bugs/fixed?n=12,34 → { fixed: [{ number, title }] }: which of those issues are closed as
 * completed. Closed as not planned, or still open, is left out. Each issue is asked of GitHub at most
 * once every FIXED_KEPT_MS, whoever asks; without a token it answers that none are.
 */
function fixedIssues({ repo, token, fetch: get = globalThis.fetch, now = Date.now }: { repo: string; token?: string; fetch?: typeof fetch; now?: () => number }) {
  const known = new Map<number, { at: number; fixed: { number: number; title: string } | null }>();
  async function look(number: number) {
    const kept = known.get(number);
    if (kept && now() - kept.at < FIXED_KEPT_MS) return kept.fixed;
    let fixed: { number: number; title: string } | null = null;
    try {
      const answer = await get(`https://api.github.com/repos/${repo}/issues/${number}`, { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "open.parlor" } });
      if (!answer.ok) return null;
      const issue = (await answer.json()) as { state?: string; state_reason?: string | null; title?: string; pull_request?: unknown };
      if (!issue.pull_request && issue.state === "closed" && issue.state_reason === "completed") fixed = { number, title: String(issue.title ?? "").slice(0, 200) };
    } catch {
      return null;
    }
    known.set(number, { at: now(), fixed });
    // Kept small: the oldest go first.
    if (known.size > 2000) known.delete(known.keys().next().value!);
    return fixed;
  }
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (url.pathname !== "/bugs/fixed") return null;
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET" } });
    const asked = [...new Set((url.searchParams.get("n") ?? "").split(",").map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n < 1e7).slice(0, FIXED_ASKED);
    const fixed = token ? (await Promise.all(asked.map(look))).filter((f): f is { number: number; title: string } => !!f) : [];
    return Response.json({ fixed }, { headers: { "cache-control": "no-store" } });
  };
}
