// The house's chat on the house's page. The screen is a Vue island made of Zubra components
// (house/HouseChat.vue) over a plain store (house/chat.ts); this is only the React around them:
// the heading, the sound, and the house's members handed in as they change.
import { useEffect, useRef } from "react";
import { createApp, h, reactive } from "vue";
import { play } from "./feedback/sounds";
import { openHouseChat } from "./house/chat";
import HouseChat from "./house/HouseChat.vue";
import type { House } from "./housesApi";
import { useOnline } from "./offline";

type Members = House["members"];

export function HouseChatBlock({ slug, members, me }: { slug: string; members: Members; me: string }) {
  const el = useRef<HTMLDivElement>(null);
  const online = useOnline();
  // What the island is drawn from: changed in place, so Vue sees it without the island being made again.
  const given = useRef(reactive({ members, me, online }));
  useEffect(() => {
    Object.assign(given.current, { members, me, online });
  }, [members, me, online]);

  useEffect(() => {
    const store = openHouseChat(slug, () => play("message"));
    const props = given.current;
    const app = createApp({ render: () => h(HouseChat, { store, members: props.members, me: props.me, online: props.online }) });
    app.mount(el.current!);
    return () => {
      app.unmount();
      store.stop();
    };
  }, [slug]);

  return (
    <section className="house-block" aria-label="House chat">
      <h2>House chat</h2>
      <div ref={el} />
    </section>
  );
}
