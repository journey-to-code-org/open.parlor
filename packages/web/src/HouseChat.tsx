// The house's chat on the house's page. The screen is a Vue island made of Zubra components
// (house/HouseChat.vue), around a Zubra Sync collection element that holds the chat live
// (house/house-chat-feed.zb); this is only the React around them: the heading, the connection,
// the sound, and the house's members handed in as they change.
import { useEffect, useRef } from "react";
import { createApp, h, reactive } from "vue";
import { play } from "./feedback/sounds";
import { openHouseChat } from "./house/chat";
import HouseChat from "./house/HouseChat.vue";
import type { House } from "./housesApi";
import { useOnline } from "./offline";

type Members = House["members"];

export function HouseChatBlock({ slug, members, me, manager }: { slug: string; members: Members; me: string; manager: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const online = useOnline();
  // What the island is drawn from: changed in place, so Vue sees it without the island being made again.
  const given = useRef(reactive({ members, me, manager, online }));
  useEffect(() => {
    Object.assign(given.current, { members, me, manager, online });
  }, [members, me, manager, online]);

  useEffect(() => {
    // The connection first, then the element that follows it (as Sync asks).
    const actions = openHouseChat(slug);
    const props = given.current;
    const app = createApp({ render: () => h(HouseChat, { slug, actions, members: props.members, me: props.me, manager: props.manager, online: props.online, onHeard: () => play("message") }) });
    app.mount(el.current!);
    return () => {
      app.unmount();
      actions.stop();
    };
  }, [slug]);

  return (
    <section className="house-block" aria-label="House chat">
      <h2>House chat</h2>
      <div ref={el} />
    </section>
  );
}
