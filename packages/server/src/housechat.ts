// A house's own chat: one conversation for everyone in the house, on the house's page. It is
// open.chat's (`@journey-to-code/chat`); this is only what makes a house a room of it.
//
// Each house is the room `house:<slug>` in the `chats` collection of the chat's Zubra Sync server
// (`/_zb/chat`, made in app.ts on the parlor's one log). The house's members are the room's
// members, its owner and admins its managers. Crude words are covered with the parlor's own list
// when a manager switches that on, and a member who isn't looking is buzzed through the parlor's
// push notifications.
import { chatAuthorize, createChat, type ChatMember, type ChatRoom, type ChatSync } from "@journey-to-code/chat/server";
import { maskText } from "./names.js";
import type { Push } from "./push.js";

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

/** A house's room in the chat. */
export const roomOf = (slug: string) => `house:${slug}`;

const member = (m: Member): ChatMember => ({ id: m.id, name: m.name, manager: m.role !== "member" });

export function createHouseChat(sync: ChatSync, { push, blockedWords = [] }: { push?: Push; /** Words to cover as well, when a house covers them. */ blockedWords?: string[] } = {}) {
  // The players to buzz, by room and member, kept from the last time each room was used: the chat
  // names members by their public ids, and only the parlor knows whose phone each is.
  const players = new Map<string, Map<string, string>>();
  const room = (house: House): ChatRoom => {
    players.set(roomOf(house.slug), new Map(house.members.map((m) => [m.id, m.player])));
    return { key: roomOf(house.slug), title: house.name, members: house.members.map(member) };
  };

  const chat = createChat(sync, {
    mask: (text) => maskText(text, blockedWords),
    notify(to, { room: where, from, body }) {
      const slug = where.key.slice("house:".length);
      for (const m of to) {
        const player = players.get(where.key)?.get(m.id);
        if (player) void push?.notify(player, { title: `${from.name} at ${where.title} 💬`, body, url: `/?house=${slug}`, tag: `house-chat-${slug}` });
      }
    },
  });

  return {
    /** A new house at a name an old one had: it doesn't inherit that one's conversation. */
    clear: (slug: string) => chat.clear(roomOf(slug)),
    /** Every message, for the parlor's host. */
    messages: async (slug: string) => (await chat.read(roomOf(slug))).messages,
    /** The parlor's host takes a message down. */
    redact: (slug: string, id: number) => chat.redact(roomOf(slug), id),
    /** What others said in the house's chat since this member last had it open. */
    unread: (slug: string, member: string) => chat.unread(roomOf(slug), member),
    /** /houses/:slug/chat, for a member of the house (see `createChat`'s `handle`). */
    handle: (house: House, me: Member, method: string, input: Record<string, unknown>, query: URLSearchParams) => chat.handle(room(house), member(me), method, input, query),
    /**
     * The `authorize` for the chat's Sync server: a house's members may follow its room live and
     * say they're there; nobody but the server writes it. `memberOf` finds who is asking.
     */
    authorize: (memberOf: (request: Request, slug: string) => Promise<Member | undefined>) =>
      chatAuthorize(chat, {
        member: async (request, key) => {
          if (!key.startsWith("house:")) return null;
          const me = await memberOf(request, key.slice("house:".length));
          return me ? member(me) : null;
        },
      }),
  };
}
