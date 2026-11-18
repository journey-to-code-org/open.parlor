// A house's chat as this browser has it: what was said, who is here, and the asking that keeps
// both fresh. Plain TypeScript that knows nothing of the page's framework: the screen
// (HouseChat.vue) subscribes to it, as Delbie's Counter does to its shift.
import { houses, type HouseChat, type HouseMessage } from "../housesApi";

/** How often the page asks whether anything was said, while it is being looked at. */
const ASK_EVERY = 4000;

export interface ChatLook {
  /** Null until the house has answered once. */
  chat: HouseChat | null;
  /** The members with the house's page open now, by id. */
  here: string[];
}

export interface ChatStore {
  look(): ChatLook;
  /** Told whenever what was said or who is here changes. Returns how to stop being told. */
  subscribe(listener: (look: ChatLook) => void): () => void;
  /** Resolves to what went wrong, or null when it was said. */
  say(text: string): Promise<string | null>;
  /** Take a message down. Resolves to what went wrong, or null. */
  unsay(id: number): Promise<string | null>;
  stop(): void;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** "3:42 PM" today, "Mon 3:42 PM" this week, "Nov 3" before that. */
export function when(at: number, now = Date.now()): string {
  const then = new Date(at);
  const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (then.toDateString() === new Date(now).toDateString()) return time;
  if (now - at < 6 * 86_400_000) return `${then.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return then.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Open a house's chat. `onHeard` is told of each message from someone else that arrives after the
 * first look (for a sound to be made of it).
 */
export function openHouseChat(slug: string, onHeard?: (message: HouseMessage) => void, api: Pick<typeof houses, "chat" | "say" | "unsay"> = houses): ChatStore {
  let now: ChatLook = { chat: null, here: [] };
  let heard: number | null = null;
  let stopped = false;
  const listeners = new Set<(look: ChatLook) => void>();
  const tell = (next: ChatLook) => {
    now = next;
    for (const listener of listeners) listener(now);
  };
  const take = (found: HouseChat | { rev: number; here: string[] }) => {
    if (stopped) return;
    if ("messages" in found) {
      const newest = found.messages.at(-1);
      if (heard !== null && newest && newest.id > heard) for (const m of found.messages) if (m.id > heard && !m.mine) onHeard?.(m);
      heard = newest?.id ?? heard ?? 0;
      tell({ chat: found, here: found.here });
    } else if (!same(found.here, now.here)) tell({ chat: now.chat, here: found.here });
  };
  const ask = async () => {
    if (stopped || document.visibilityState !== "visible" || !navigator.onLine) return;
    try {
      take(await api.chat(slug, now.chat?.rev));
    } catch {
      /* out of reach for now: the next ask will tell */
    }
  };
  const attempt = async (work: () => Promise<HouseChat>) => {
    try {
      take(await work());
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  void ask();
  const tick = setInterval(ask, ASK_EVERY);
  document.addEventListener("visibilitychange", ask);
  window.addEventListener("online", ask);

  return {
    look: () => now,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    say: (text) => attempt(() => api.say(slug, text)),
    unsay: (id) => attempt(() => api.unsay(slug, id)),
    stop() {
      stopped = true;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", ask);
      window.removeEventListener("online", ask);
      listeners.clear();
    },
  };
}
