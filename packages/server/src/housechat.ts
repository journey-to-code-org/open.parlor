// A house's own chat: one conversation for everyone in the house, on the house's page, whichever
// table they are at or none.
//
// One server-only document per house (`housechat/<slug>`): the last messages said, and a `rev`
// that goes up with every change, so a page that asks with the rev it has is told "nothing new" in
// a few bytes. A house is people who were invited, so words aren't covered here, as they aren't at
// a family table: the owner and admins can take any message down, and anyone their own.
import type { Push } from "./push.js";

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{ get(collection: string, key: string): Record<string, unknown> | undefined }>;
}
interface Member {
  id: string;
  /** The player's secret cookie value: who to buzz. Never sent to anyone. */
  player: string;
  name: string;
  role: "owner" | "admin" | "member";
}
interface House {
  slug: string;
  name: string;
  members: Member[];
}
export interface HouseMessage {
  id: number;
  /** The member who said it (their public id), and their name as it was then. */
  by: string;
  name: string;
  text: string;
  at: number;
}
export interface ChatReply {
  status: number;
  body: unknown;
}

/** The longest a message may be: the same as at a table. */
export const MESSAGE_LIMIT = 280;
/** How many messages a house keeps. Older ones fall off the end. */
export const KEPT = 200;
/** A member may say this many things in this long. */
const BURST = 5;
const BURST_MS = 10_000;
/** A member's phone buzzes about the chat at most this often. */
const BUZZ_EVERY = 5 * 60_000;
/** Someone who asked for the chat this recently has it open, and needs no buzz. */
const LOOKING = 20_000;

export function createHouseChat(sync: Sync, { push }: { push?: Push } = {}) {
  const read = async (slug: string) => {
    const doc = (await sync.documents()).get("housechat", slug);
    const messages = Array.isArray(doc?.messages) ? (doc.messages as HouseMessage[]) : [];
    return { messages: [...messages], rev: typeof doc?.rev === "number" ? doc.rev : 0, next: typeof doc?.next === "number" ? doc.next : 1 };
  };
  const keep = (slug: string, chat: { messages: HouseMessage[]; rev: number; next: number }) =>
    sync.write("housechat", slug, { messages: chat.messages, rev: chat.rev, next: chat.next, deleted: false });

  // Kept in memory: losing them at a restart costs one extra buzz at most.
  const said = new Map<string, number[]>();
  const looked = new Map<string, number>();
  const buzzed = new Map<string, number>();

  const shown = (house: House, me: Member, chat: { messages: HouseMessage[]; rev: number }) => ({
    rev: chat.rev,
    messages: chat.messages.map((m) => ({ ...m, mine: m.by === me.id })),
    /** Whether this member may take down what others said. */
    canRemove: me.role !== "member",
    limit: MESSAGE_LIMIT,
    /** For the page's "nobody else here yet". */
    others: house.members.length - 1,
  });

  return {
    /** A new house at a name an old one had: it doesn't inherit that one's conversation. */
    async clear(slug: string) {
      const chat = await read(slug);
      if (chat.messages.length) await keep(slug, { messages: [], rev: chat.rev + 1, next: chat.next });
    },

    /**
     * /houses/:slug/chat, for a member of the house.
     *   GET  [?rev=]        → { rev, messages, canRemove, limit, others }, or just { rev } when that is the rev the page has
     *   POST { text }       → the same, with the message said; 429 when they are saying too much at once
     *   POST { remove: id } → the same, without it: one's own, or anyone's for the owner and admins
     */
    async handle(house: House, me: Member, method: string, input: Record<string, unknown>, query: URLSearchParams, now = Date.now()): Promise<ChatReply> {
      const who = `${house.slug}/${me.id}`;
      const chat = await read(house.slug);

      if (method === "GET") {
        looked.set(who, now);
        if (query.has("rev") && Number(query.get("rev")) === chat.rev) return { status: 200, body: { rev: chat.rev } };
        return { status: 200, body: shown(house, me, chat) };
      }
      if (method !== "POST") return { status: 404, body: { error: "There's nothing there." } };
      looked.set(who, now);

      if (input.remove !== undefined) {
        const message = chat.messages.find((m) => m.id === input.remove);
        // Already gone is the same as taken down: the page is shown the chat as it stands.
        if (message) {
          if (message.by !== me.id && me.role === "member") return { status: 403, body: { error: "Only the house owner or an admin can take down what someone else said." } };
          chat.messages = chat.messages.filter((m) => m !== message);
          chat.rev += 1;
          await keep(house.slug, chat);
        }
        return { status: 200, body: shown(house, me, chat) };
      }

      // One line: whatever was pasted, without its line breaks and the spaces around them.
      const text = typeof input.text === "string" ? input.text.replace(/\s+/g, " ").trim() : "";
      if (!text) return { status: 400, body: { error: "Say something first." } };
      if (text.length > MESSAGE_LIMIT) return { status: 400, body: { error: `That's too long: ${MESSAGE_LIMIT} characters at most.` } };
      const recent = (said.get(who) ?? []).filter((t) => now - t < BURST_MS);
      if (recent.length >= BURST) return { status: 429, body: { error: "Give the others a moment to answer." } };
      said.set(who, [...recent, now]);

      chat.messages = [...chat.messages, { id: chat.next, by: me.id, name: me.name, text, at: now }].slice(-KEPT);
      chat.next += 1;
      chat.rev += 1;
      await keep(house.slug, chat);

      // A buzz for the members who aren't looking, and not one for every line of a conversation.
      for (const m of house.members) {
        if (m.id === me.id) continue;
        const them = `${house.slug}/${m.id}`;
        if (now - (looked.get(them) ?? -Infinity) < LOOKING || now - (buzzed.get(them) ?? -Infinity) < BUZZ_EVERY) continue;
        buzzed.set(them, now);
        void push?.notify(m.player, { title: `${me.name} at ${house.name} 💬`, body: text.length > 120 ? `${text.slice(0, 117)}…` : text, url: `/?house=${house.slug}`, tag: `house-chat-${house.slug}` });
      }
      return { status: 201, body: shown(house, me, chat) };
    },
  };
}
