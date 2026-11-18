// A house's chat on this page. It is open.chat's: `openChat()` keeps the page's one connection to
// the chat's Sync server and sends what the person does; `<chat-room>` (house/HouseChat.vue) shows
// the room live. This is only what makes a house a room: its key, and its route.
import { openChat, type ChatActions } from "@journey-to-code/chat/client";
import { houses } from "../housesApi";

/** A house's room in the chat, as the server names it (packages/server/src/housechat.ts). */
export const roomOf = (slug: string) => `house:${slug}`;

/** Open a house's chat. Call it before its `<chat-room>` starts. */
export function openHouseChat(slug: string, { open = openChat }: { open?: typeof openChat } = {}): ChatActions {
  return open({ room: roomOf(slug), send: (body) => houses.chatSend(slug, body) });
}
