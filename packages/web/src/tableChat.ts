// A table's chat on this page. It is open.chat's, in the parlor's chat (packages/server/src/
// tablechat.ts): `openChat()` keeps the page's one connection to the chat's Sync server and sends
// what's said, and `<chat-feed>` (TableChatFeed.tsx) follows the table's room live. The table draws
// it as it always has (Chat.tsx: the chat panel, and bubbles over the seats), so what arrives is put
// the way the table reads it.
import { openChat, type ChatActions } from "@journey-to-code/chat/client";
import type { ChatMessage as RoomMessage } from "@journey-to-code/rooms/client";
import { useMemo } from "react";

/** A table's room in the chat, as the server names it. */
export const tableRoomOf = (id: string) => `table:${id}`;

/** A message as the chat keeps it. */
interface Said {
  id: number;
  by: string;
  name: string;
  text: string;
  at: number;
  bot?: boolean;
  notice?: boolean;
  poll?: unknown;
}

/** What was said, as the table reads it: each person by their seat, the host's notices by none (-1). */
export function asTableMessages(messages: unknown[]): RoomMessage[] {
  return (messages as Said[]).flatMap((m) =>
    m.poll ? [] : [{ seat: /^seat:\d+$/.test(m.by) ? Number(m.by.slice(5)) : -1, name: m.name, text: m.text, at: m.at, bot: m.bot === true, ...(m.notice ? { notice: true } : {}) }],
  );
}

/** Open a table's chat: before its feed starts, so the feed waits for the first pull. */
export function useTableChat(id: string): ChatActions {
  return useMemo(() => openChat({ room: tableRoomOf(id), endpoint: `/rooms/${encodeURIComponent(id)}/chat` }), [id]);
}
