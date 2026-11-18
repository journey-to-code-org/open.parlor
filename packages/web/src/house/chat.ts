// A house's chat on this page: the connection that brings it live, and the ways to change it.
// Plain TypeScript that knows nothing of the page's framework.
//
// What was said, and who else is here, arrive through Zubra Sync: `connect()` follows the house's
// document on the server's `/_zb/house`, and the `<house-chat-feed>` component (a
// `'use collection housechat'` element) holds it and its presence. Nothing here asks the server
// for the chat; it only sends what this person does, and pulls once after, so the change shows
// even while the live stream is reconnecting.
//
// One connection serves the whole page, for every house, and stays open once made. Sync keeps one
// peer id for a page while each connection keeps its own live-stream key, so a connection stopped
// and another started at the same address is refused (409) until the server notices the first has
// gone, and then the page takes a new peer id. Kept open, that never happens. The server's
// `authorize` sends each member only their own houses' chats, whatever the scope says.
import { connect } from "@zubra/sync/connect";
import { houses, type HouseChat } from "../housesApi";

/** Where the houses' chats are served (app.ts on the server). */
export const HOUSE_SYNC = "/_zb/house";

export interface HouseChatActions {
  /** Each resolves to what went wrong, or null when it's done. */
  say(text: string): Promise<string | null>;
  unsay(id: number): Promise<string | null>;
  ask(question: string, options: string[]): Promise<string | null>;
  vote(id: number, option: number | null): Promise<string | null>;
  setFilter(on: boolean): Promise<string | null>;
  /** Done with this house: nothing more is sent. (The page's connection stays, for the next.) */
  stop(): void;
}

type Api = Pick<typeof houses, "say" | "unsay" | "ask" | "vote" | "setChatFilter">;
type Connect = (options: { url: string; scope: Record<string, true | string> }) => { pull(): Promise<void>; stop(): void };

// The page's one connection to the houses' chats, by the function that made it (tests make their own).
const connections = new WeakMap<Connect, ReturnType<Connect>>();

/**
 * Open a house's chat. Call it before the `<house-chat-feed>` element starts, as Sync asks, so the
 * element waits for the connection's first pull and never shows last visit's chat over this one.
 */
export function openHouseChat(slug: string, { api = houses, open = connect as Connect }: { api?: Api; open?: Connect } = {}): HouseChatActions {
  let connection = connections.get(open);
  if (!connection) connections.set(open, (connection = open({ url: HOUSE_SYNC, scope: { housechat: true } })));
  const live = connection;
  let stopped = false;
  const attempt = async (work: () => Promise<HouseChat>) => {
    if (stopped) return "The chat has closed.";
    try {
      await work();
      void live.pull().catch(() => undefined);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  return {
    say: (text) => attempt(() => api.say(slug, text)),
    unsay: (id) => attempt(() => api.unsay(slug, id)),
    ask: (question, options) => attempt(() => api.ask(slug, question, options)),
    vote: (id, option) => attempt(() => api.vote(slug, id, option)),
    setFilter: (on) => attempt(() => api.setChatFilter(slug, on)),
    stop() {
      stopped = true;
    },
  };
}

/** "3:42 PM" today, "Mon 3:42 PM" this week, "Nov 3" before that. */
export function when(at: number, now = Date.now()): string {
  const then = new Date(at);
  const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (then.toDateString() === new Date(now).toDateString()) return time;
  if (now - at < 6 * 86_400_000) return `${then.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return then.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** How a poll stands: the votes for each answer, and which this member chose (null for none). */
export function tally(poll: { options: string[]; votes: Record<string, number> }, me: string) {
  const counts = poll.options.map(() => 0);
  for (const option of Object.values(poll.votes)) if (option >= 0 && option < counts.length) counts[option]! += 1;
  return { counts, total: counts.reduce((a, b) => a + b, 0), mine: poll.votes[me] ?? null };
}
