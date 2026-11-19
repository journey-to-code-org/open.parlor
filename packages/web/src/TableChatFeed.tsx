// The table's room, live on the page: a Zubra component (table-chat-feed.zb; see tableChat.ts).
import Feed from "./table-chat-feed.zb";
import type { ChatMessage as RoomMessage } from "@journey-to-code/rooms/client";
import { asTableMessages, tableRoomOf } from "./tableChat";

/** The table's room, live: draws nothing, and says what's been said each time it changes. */
export function TableChatFeed({ id, onMessages }: { id: string; onMessages: (messages: RoomMessage[]) => void }) {
  return <Feed doc={tableRoomOf(id)} onChatchange={(e: CustomEvent<{ messages: unknown[] }>) => onMessages(asTableMessages(e.detail.messages))} />;
}
