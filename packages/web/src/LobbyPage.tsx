// Open tables. The page is a Vue island of Zubra fields (lobby/Lobby.vue); this is only the React
// that mounts it and hands it the games a table can be opened of.
import { useEffect, useRef } from "react";
import { createApp, h } from "vue";
import { ARCADE_LIST, GAME_LIST } from "./GamePicker";
import { isLiveArcade } from "./arcade/live";
import Lobby from "./lobby/Lobby.vue";

/** The games a table can be opened of: the table games, and the arcade games that are played live. */
const TABLE_GAMES = [...GAME_LIST, ...ARCADE_LIST.filter((g) => isLiveArcade(g.id))].map(({ id, name, emoji }) => ({ id, name, emoji }));

export function LobbyPage({ onOpenTable, onLeave }: { onOpenTable: (id: string) => void; onLeave: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  // The latest callbacks, read when they're called, so the island is made once.
  const calls = useRef({ onOpenTable, onLeave });
  calls.current = { onOpenTable, onLeave };
  useEffect(() => {
    const app = createApp({ render: () => h(Lobby, { games: TABLE_GAMES, onOpenTable: (id: string) => calls.current.onOpenTable(id), onLeave: () => calls.current.onLeave() }) });
    app.mount(el.current!);
    return () => app.unmount();
  }, []);
  return <div ref={el} className="vue-island" />;
}
