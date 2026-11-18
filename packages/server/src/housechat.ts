// A house's own chat: one conversation for everyone in the house, on the house's page, whichever
// table they are at or none.
//
// One document per house (`housechat/<slug>`) on a Zubra Sync server of its own (`/_zb/house`,
// made in app.ts on the parlor's one log): the last messages said, polls among them, whether crude
// words are covered, and a `rev` that goes up with every change. Members' pages follow it live
// through a `'use collection housechat'` component, and see who else has the page open through
// that component's presence. Only the server writes it, through the routes below, so every message
// is checked first.
//
// A house is people who were invited, so words aren't covered unless the house's owner or an admin
// turns that on. The owner and admins can take any message down, and anyone their own; the
// parlor's host can too, from the admin app.
import { maskText } from "./names.js";
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
/** A question with a few answers, asked in the chat. Each member has one vote, and may change it. */
export interface HousePoll {
  options: string[];
  /** Member id → the option they chose. */
  votes: Record<string, number>;
}
export interface HouseMessage {
  id: number;
  /** The member who said it (their public id), and their name as it was then. */
  by: string;
  name: string;
  /** What was said; for a poll, its question. */
  text: string;
  at: number;
  poll?: HousePoll;
}
export interface ChatReply {
  status: number;
  body: unknown;
}

/** The longest a message may be: the same as at a table. */
export const MESSAGE_LIMIT = 280;
/** A poll's question, and each of its answers. */
export const QUESTION_LIMIT = 140;
export const OPTION_LIMIT = 40;
export const MAX_OPTIONS = 4;
/** How many messages a house keeps. Older ones fall off the end. */
export const KEPT = 200;
/** A member may say this many things in this long. */
const BURST = 5;
const BURST_MS = 10_000;
/** A member's phone buzzes about the chat at most this often. */
const BUZZ_EVERY = 5 * 60_000;
/**
 * Someone heard from this recently has the chat open: they are "here", and need no buzz. A page
 * says so with each presence heartbeat (every 10 seconds; Sync drops a viewer after 30) or by
 * asking for the chat.
 */
export const LOOKING = 35_000;

type Chat = { messages: HouseMessage[]; rev: number; next: number; filter: boolean };

export function createHouseChat(sync: Sync, { push, blockedWords = [] }: { push?: Push; /** Words to cover as well, when a house covers them. */ blockedWords?: string[] } = {}) {
  const read = async (slug: string): Promise<Chat> => {
    const doc = (await sync.documents()).get("housechat", slug);
    const messages = Array.isArray(doc?.messages) ? (doc.messages as HouseMessage[]) : [];
    return { messages: structuredClone(messages), rev: typeof doc?.rev === "number" ? doc.rev : 0, next: typeof doc?.next === "number" ? doc.next : 1, filter: doc?.filter === true };
  };
  const keep = (slug: string, chat: Chat) => sync.write("housechat", slug, { messages: chat.messages, rev: chat.rev, next: chat.next, filter: chat.filter });

  // Kept in memory: losing them at a restart costs one extra buzz at most.
  const said = new Map<string, number[]>();
  const looked = new Map<string, number>();
  const buzzed = new Map<string, number>();

  /** The members with the house's page open, by their public ids, in the house's own order. The one asking is always among them. */
  const here = (house: House, me: Member, now: number) => house.members.filter((m) => m.id === me.id || now - (looked.get(`${house.slug}/${m.id}`) ?? -Infinity) < LOOKING).map((m) => m.id);

  const shown = (house: House, me: Member, chat: Chat, now: number) => ({
    rev: chat.rev,
    here: here(house, me, now),
    messages: chat.messages.map((m) => ({ ...m, mine: m.by === me.id })),
    /** Whether this member may take down what others said, and switch the filter. */
    canRemove: me.role !== "member",
    filter: chat.filter,
    limit: MESSAGE_LIMIT,
    /** For the page's "nobody else here yet". */
    others: house.members.length - 1,
  });

  /** A buzz for the members who aren't looking, and not one for every line of a conversation. */
  function buzz(house: House, me: Member, body: string, now: number) {
    for (const m of house.members) {
      if (m.id === me.id) continue;
      const them = `${house.slug}/${m.id}`;
      if (now - (looked.get(them) ?? -Infinity) < LOOKING || now - (buzzed.get(them) ?? -Infinity) < BUZZ_EVERY) continue;
      buzzed.set(them, now);
      void push?.notify(m.player, { title: `${me.name} at ${house.name} 💬`, body: body.length > 120 ? `${body.slice(0, 117)}…` : body, url: `/?house=${house.slug}`, tag: `house-chat-${house.slug}` });
    }
  }

  /** One line: whatever was pasted, without its line breaks and the spaces around them. */
  const line = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

  return {
    /** A new house at a name an old one had: it doesn't inherit that one's conversation. */
    async clear(slug: string) {
      const chat = await read(slug);
      if (chat.messages.length || chat.filter) await keep(slug, { messages: [], rev: chat.rev + 1, next: chat.next, filter: false });
    },

    /** A member's page is open on the house (a presence heartbeat): no buzz for them for a while. */
    looking(slug: string, member: string, now = Date.now()) {
      looked.set(`${slug}/${member}`, now);
    },

    /** Every message, for the parlor's host. */
    async messages(slug: string) {
      return (await read(slug)).messages;
    },

    /** The parlor's host takes a message down. Resolves to it, or null when there's no such message. */
    async redact(slug: string, id: number): Promise<HouseMessage | null> {
      const chat = await read(slug);
      const message = chat.messages.find((m) => m.id === id);
      if (!message) return null;
      chat.messages = chat.messages.filter((m) => m !== message);
      chat.rev += 1;
      await keep(slug, chat);
      return message;
    },

    /**
     * /houses/:slug/chat, for a member of the house. The page follows the chat live; these are how
     * it changes it, and how a page without the live stream reads it.
     *   GET  [?rev=]                        → { rev, here, messages, canRemove, filter, limit, others }, or just { rev, here } when that is the rev the page has
     *   POST { text }                       → the same, with the message said; 429 when they are saying too much at once
     *   POST { poll: { question, options } } → the same, with a poll asked
     *   POST { vote: { id, option } }       → the same, with this member's vote on that poll (option null takes it back)
     *   POST { remove: id }                 → the same, without it: one's own, or anyone's for the owner and admins
     *   POST { filter: boolean }            → the same, with crude words covered from now on, or not (the owner and admins)
     */
    async handle(house: House, me: Member, method: string, input: Record<string, unknown>, query: URLSearchParams, now = Date.now()): Promise<ChatReply> {
      const who = `${house.slug}/${me.id}`;
      const chat = await read(house.slug);
      const manager = me.role !== "member";
      const saved = async (status = 200) => {
        chat.rev += 1;
        await keep(house.slug, chat);
        return { status, body: shown(house, me, chat, now) };
      };

      if (method === "GET") {
        looked.set(who, now);
        if (query.has("rev") && Number(query.get("rev")) === chat.rev) return { status: 200, body: { rev: chat.rev, here: here(house, me, now) } };
        return { status: 200, body: shown(house, me, chat, now) };
      }
      if (method !== "POST") return { status: 404, body: { error: "There's nothing there." } };
      looked.set(who, now);

      if (input.remove !== undefined) {
        const message = chat.messages.find((m) => m.id === input.remove);
        // Already gone is the same as taken down: the page is shown the chat as it stands.
        if (!message) return { status: 200, body: shown(house, me, chat, now) };
        if (message.by !== me.id && !manager) return { status: 403, body: { error: "Only the house owner or an admin can take down what someone else said." } };
        chat.messages = chat.messages.filter((m) => m !== message);
        return saved();
      }

      if (input.filter !== undefined) {
        if (!manager) return { status: 403, body: { error: "Only the house owner or an admin can change that." } };
        if (typeof input.filter !== "boolean") return { status: 400, body: { error: "On or off?" } };
        if (chat.filter === input.filter) return { status: 200, body: shown(house, me, chat, now) };
        chat.filter = input.filter;
        return saved();
      }

      if (input.vote !== undefined) {
        const vote = input.vote as { id?: unknown; option?: unknown } | null;
        const message = chat.messages.find((m) => m.id === vote?.id);
        if (!message?.poll) return { status: 404, body: { error: "That poll has been taken down." } };
        const option = vote?.option;
        if (option === null) delete message.poll.votes[me.id];
        else if (typeof option === "number" && Number.isInteger(option) && option >= 0 && option < message.poll.options.length) message.poll.votes[me.id] = option;
        else return { status: 400, body: { error: "That isn't one of the answers." } };
        return saved();
      }

      // Saying something, or asking: either is a new message, and counts against saying too much at once.
      const words = chat.filter ? (text: string) => maskText(text, blockedWords) : (text: string) => text;
      let message: Omit<HouseMessage, "id" | "by" | "name" | "at">;
      if (input.poll !== undefined) {
        const asked = input.poll as { question?: unknown; options?: unknown } | null;
        const question = line(asked?.question);
        const options = Array.isArray(asked?.options) ? asked.options.map(line).filter(Boolean) : [];
        if (!question) return { status: 400, body: { error: "Ask a question first." } };
        if (question.length > QUESTION_LIMIT) return { status: 400, body: { error: `That question is too long: ${QUESTION_LIMIT} characters at most.` } };
        if (options.length < 2 || options.length > MAX_OPTIONS) return { status: 400, body: { error: `Give two to ${MAX_OPTIONS} answers.` } };
        if (options.some((o) => o.length > OPTION_LIMIT)) return { status: 400, body: { error: `Keep each answer to ${OPTION_LIMIT} characters.` } };
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { status: 400, body: { error: "Two of those answers are the same." } };
        message = { text: words(question), poll: { options: options.map(words), votes: {} } };
      } else {
        const text = line(input.text);
        if (!text) return { status: 400, body: { error: "Say something first." } };
        if (text.length > MESSAGE_LIMIT) return { status: 400, body: { error: `That's too long: ${MESSAGE_LIMIT} characters at most.` } };
        message = { text: words(text) };
      }
      const recent = (said.get(who) ?? []).filter((t) => now - t < BURST_MS);
      if (recent.length >= BURST) return { status: 429, body: { error: "Give the others a moment to answer." } };
      said.set(who, [...recent, now]);

      chat.messages = [...chat.messages, { id: chat.next, by: me.id, name: me.name, at: now, ...message }].slice(-KEPT);
      chat.next += 1;
      const reply = await saved(201);
      buzz(house, me, message.poll ? `📊 ${message.text}` : message.text, now);
      return reply;
    },
  };
}
