// A table's chat: what the people at a table say to each other, what its computer players say back,
// and the host's notices. It is open.chat's (`@journey-to-code/chat`), in the parlor's one chat
// (chat.ts); this is what makes a table a room of it.
//
// Each table is the room `table:<id>`. Its members are its seats, `seat:<n>` (never the players'
// cookies, which the room's document would show everyone): a person is the seat they hold. Anyone
// with the table's code may follow it live, as anyone may watch, but only someone seated talks.
// Computer players, a challenge's message and the host's notices are the server's own words.
import { playerOf } from "@journey-to-code/rooms/server";
import type { ChatMember, ChatMessage, ChatRoom } from "@journey-to-code/chat/server";
import type { ParlorChat } from "./chat.js";

/** A table's room in the chat. */
export const tableRoomOf = (id: string) => `table:${id}`;
const seatMember = (seat: number) => `seat:${seat}`;
/** The seat a member of a table's room is, or -1 (a notice, someone watching). */
export const seatOfMember = (member: string) => (/^seat:\d+$/.test(member) ? Number(member.slice(5)) : -1);
/** Someone at a table without a seat: they follow the chat, and say nothing. */
const WATCHING: ChatMember = { id: "watching", name: "Watching", canSpeak: false };

/** The parts of the rooms kit a table's chat reads. */
interface Rooms {
  room(id: string): Promise<{ seats: { name: string | null; bot: boolean }[]; closed?: string } | undefined>;
  holders(id: string): Promise<(string | null)[]>;
}

/** A message at a table, as the table's pages and the parlor's host see it. */
export interface TableMessage {
  id: number;
  seat: number;
  name: string;
  text: string;
  at: number;
  bot: boolean;
  notice?: true;
}
const asTable = (m: ChatMessage): TableMessage => ({ id: m.id, seat: seatOfMember(m.by), name: m.name, text: m.text, at: m.at, bot: m.bot === true, ...(m.notice ? { notice: true as const } : {}) });

export interface TableChatHooks {
  /** A person's words on their way in: the words to keep, or `{ error }` to turn them away (lobby.ts: muted players, crude words). */
  beforeSay?(id: string, seat: number, text: string): string | { error: string } | Promise<string | { error: string }>;
  /** A person said something (app.ts: the computer players answer). */
  onSay?(id: string, message: TableMessage): void;
}

export type TableChat = ReturnType<typeof createTableChat>;

export function createTableChat(parlor: ParlorChat, rooms: Rooms, hooks: TableChatHooks = {}) {
  const { chat } = parlor;
  const idOf = (key: string) => key.slice("table:".length);

  /** The table as a room: its seats, each with whoever sits there. */
  async function roomOf(id: string): Promise<ChatRoom | null> {
    const r = await rooms.room(id);
    if (!r) return null;
    return { key: tableRoomOf(id), title: `Table ${id}`, members: r.seats.flatMap((s, i) => (s.name ? [{ id: seatMember(i), name: s.name }] : [])) };
  }
  /** The seat this browser holds at the table, or -1. */
  async function seatOf(request: Request, id: string) {
    const player = playerOf(request);
    return player ? (await rooms.holders(id)).indexOf(player) : -1;
  }

  parlor.kind("table:", {
    async member(request, key) {
      const id = idOf(key);
      const room = await roomOf(id);
      if (!room) return null;
      const seat = await seatOf(request, id);
      return room.members.find((m) => m.id === seatMember(seat)) ?? WATCHING;
    },
    async beforeSay({ room, me, text }) {
      const id = idOf(room.key);
      const r = await rooms.room(id);
      if (r?.closed) return { error: r.closed };
      return hooks.beforeSay ? hooks.beforeSay(id, seatOfMember(me.id), text) : text;
    },
    onSay({ room, message }) {
      hooks.onSay?.(idOf(room.key), asTable(message));
    },
  });

  return {
    /** Every message at a table, oldest first. */
    messages: async (id: string) => (await chat.read(tableRoomOf(id))).messages.map(asTable),
    /** The last few things said at a table, for a computer player's model. */
    recent: async (id: string, n = 8) => (await chat.read(tableRoomOf(id))).messages.slice(-n).map((m) => ({ name: m.name, text: m.text })),
    /**
     * A seat's words, from the server: a computer player's, or a person's sent on their behalf (a
     * challenge's message). Resolves to the message, or to why there's none.
     */
    async say(id: string, seat: number, text: string): Promise<TableMessage | string> {
      const who = (await rooms.room(id))?.seats[seat];
      if (!who?.name) return "No such seat.";
      const said = await chat.post(tableRoomOf(id), { id: seatMember(seat), name: who.name }, text, { bot: who.bot });
      return typeof said === "string" ? said : asTable(said);
    },
    /** The host's notice to everyone at a table ("The host paused the game"). */
    async announce(id: string, text: string): Promise<TableMessage | string> {
      if (!(await rooms.room(id))) return "No such table.";
      const said = await chat.post(tableRoomOf(id), null, text, { notice: true });
      return typeof said === "string" ? said : asTable(said);
    },
    /** The parlor's host takes a message down. Resolves to it, or null. */
    redact: async (id: string, messageId: number) => {
      const gone = await chat.redact(tableRoomOf(id), messageId);
      return gone && asTable(gone);
    },
    /**
     * /rooms/:id/chat, for someone seated at the table (see `createChat`'s `handle`); and
     * /rooms/:id/say { text }, as the rooms kit had it, for pages from before (answers the message).
     */
    async fetch(request: Request): Promise<Response | null> {
      const match = /^\/rooms\/([^/]+)\/(chat|say)$/.exec(new URL(request.url).pathname);
      if (!match) return null;
      const [, id, action] = match as unknown as [string, string, "chat" | "say"];
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      const room = await roomOf(id!);
      if (!room) return json({ error: "There's no table with that code." }, 404);
      // A closed table takes no more chat, as it takes no more seats or moves; it says why.
      const closed = (await rooms.room(id!))?.closed;
      if (closed && request.method === "POST") return json({ error: closed }, 410);
      const seat = seatMember(await seatOf(request, id!));
      const me = room.members.find((m) => m.id === seat);
      if (!me) return json({ error: "Take a seat to talk at this table." }, 403);
      const input = request.method === "POST" ? (((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>) : {};
      if (action === "say") {
        if (request.method !== "POST") return json({ error: "Not found" }, 404);
        const { status, body } = await chat.handle(room, me, "POST", { text: input.text });
        if (status >= 400) return json(body, status);
        const mine = (body as { messages: ChatMessage[] }).messages.filter((m) => m.by === me.id).at(-1)!;
        return json(asTable(mine));
      }
      const { status, body } = await chat.handle(room, me, request.method, input, new URL(request.url).searchParams);
      return json(body, status);
    },
  };
}
