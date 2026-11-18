// Read the Room at a table. The table itself is React, like every table; this puts the game's two
// islands in it and keeps them fed: what the room is asked and said (Solid, solid/RoomBoard.tsx),
// and, for someone sitting at the table, the form they answer with (Vue, RoomForm.vue).
import type { WordView } from "@journey-to-code/games";
import { useEffect, useRef } from "react";
import { createApp, h, reactive } from "vue";
import { mountRoomBoard } from "../solid/RoomBoard";
import RoomForm from "./RoomForm.vue";

interface Props {
  view: WordView;
  names: string[];
  /** Somebody watching has no form, and gets the board big. */
  watching: boolean;
  busy: boolean;
  send: (move: Record<string, unknown>) => void;
}

export function RoomPanel({ view, names, watching, busy, send }: Props) {
  const boardEl = useRef<HTMLDivElement>(null);
  const formEl = useRef<HTMLDivElement>(null);
  const board = useRef<ReturnType<typeof mountRoomBoard> | null>(null);
  const form = useRef<{ form: WordView["form"]; names: string[]; busy: boolean; shown: boolean } | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    board.current = mountRoomBoard(boardEl.current!, { view, names, big: watching });
    const props = reactive({ form: view.form ?? null, names, busy, shown: !!view.room });
    form.current = props;
    const app = watching ? null : createApp({ render: () => h(RoomForm, { ...props, onSend: (move: Record<string, unknown>) => sendRef.current(move) }) });
    if (formEl.current) app?.mount(formEl.current);
    return () => {
      board.current?.dispose();
      app?.unmount();
    };
    // Mounted once: the effect below hands both islands every view after the first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching]);

  useEffect(() => {
    board.current?.update({ view, names, big: watching });
    if (form.current) Object.assign(form.current, { form: view.form ?? null, names, busy, shown: !!view.room });
  }, [view, names, busy, watching]);

  return (
    <div className={`room${watching ? " room-watching" : ""}`}>
      <div ref={boardEl} />
      {!watching && <div ref={formEl} />}
    </div>
  );
}
