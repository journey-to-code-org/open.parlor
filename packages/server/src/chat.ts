// The parlor's chat: one open.chat (`@journey-to-code/chat`) for every conversation in the parlor,
// kept in the `chats` collection of the chat's Zubra Sync server (`/_zb/chat`, made in app.ts on the
// parlor's one log) and followed live there by the pages.
//
// Each kind of room has a prefix on its key, and its own rules: a house's (`house:<slug>`,
// housechat.ts) and a table's (`table:<id>`, tablechat.ts). They share one chat, so that a page has
// one connection for all of them, and register here what makes their rooms theirs: who may follow
// one, what to do with what's said, and who to tell.
import { chatAuthorize, createChat, type ChatMember, type ChatMessage, type ChatNotice, type ChatRoom, type ChatSync } from "@journey-to-code/chat/server";
import { maskText } from "./names.js";

export interface RoomKind {
  /** The member a request is, for a room of this kind; null for someone who may not follow it. */
  member(request: Request, key: string): Promise<ChatMember | null | undefined> | ChatMember | null | undefined;
  /** Before a person's words are kept (see open.chat's `beforeSay`). */
  beforeSay?(event: { room: ChatRoom; me: ChatMember; text: string }): string | { error: string } | Promise<string | { error: string }>;
  /** After a person said something. */
  onSay?(event: { room: ChatRoom; me: ChatMember; message: ChatMessage }): void;
  /** Members who weren't looking. */
  notify?(to: ChatMember[], notice: ChatNotice): void;
}

export type ParlorChat = ReturnType<typeof createParlorChat>;

export function createParlorChat(sync: ChatSync, { blockedWords = [] }: { /** Words a room's word filter covers as well as the usual ones. */ blockedWords?: string[] } = {}) {
  const kinds = new Map<string, RoomKind>();
  const kindOf = (key: string) => kinds.get(key.slice(0, key.indexOf(":") + 1));
  const chat = createChat(sync, {
    mask: (text) => maskText(text, blockedWords),
    beforeSay: (event) => kindOf(event.room.key)?.beforeSay?.(event) ?? event.text,
    onSay: (event) => kindOf(event.room.key)?.onSay?.(event),
    notify: (to, notice) => kindOf(notice.room.key)?.notify?.(to, notice),
  });
  return {
    chat,
    /** Rooms whose keys start with `prefix` (`house:`) are of this kind. */
    kind(prefix: string, kind: RoomKind) {
      kinds.set(prefix, kind);
    },
    /**
     * The `authorize` for the chat's Sync server: a room's members (as its kind says) may follow it
     * live and say they're there; nobody but the server writes it.
     */
    authorize: chatAuthorize(chat, { member: (request, key) => kindOf(key)?.member(request, key) ?? null }),
  };
}
