/* @jsxImportSource solid-js */
// Read the Room, as everyone sees it: the question, who has answered, and, once all have, what the
// room said. It is what a table shows to somebody watching (a television in the corner, a laptop
// on the table) and what a player sees above their own form.
//
// A Solid island inside the React app: the files in this folder are Solid's, by the build's rule
// (vite.config.ts) and by the comment on their first line. The player's form beside it is Vue
// (room/RoomForm.vue). Both are drawn from the same view with the same Zubra components, which in
// Solid are the custom elements themselves: properties are set with `prop:`.
import "@open-parlor/ui/zubra-ui/bar-chart.zb?element";
import "@open-parlor/ui/zubra-ui/number-ticker.zb?element";
import "@open-parlor/ui/zubra-ui/status-badge.zb?element";
import "@open-parlor/ui/zubra-ui/user-avatar.zb?element";
import type { WordView } from "@journey-to-code/games";
import { For, Show, createMemo } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { render } from "solid-js/web";
import { roomNamed } from "../room/names";

export interface RoomBoardProps {
  view: Pick<WordView, "question" | "room" | "players" | "phase" | "info" | "over">;
  names: string[];
  /** A big screen for the whole room, and not one player's phone. */
  big: boolean;
}


function RoomBoard(props: RoomBoardProps) {
  const room = () => props.view.room ?? null;
  const bars = createMemo(() => (room()?.bars ?? []).map((bar) => ({ label: roomNamed(bar.label, props.names), value: bar.value })));
  const unit = () => (room()?.kind === "caption" ? " ★" : room()?.kind === "scale" ? "" : room()?.kind === "vote" ? " voted" : " said so");
  return (
    <section class="room-board" classList={{ big: props.big }}>
      <Show when={props.view.info[0]}><p class="room-count">{props.view.info[0]}</p></Show>
      <Show when={props.view.question}><h2 class="room-question">{props.view.question}</h2></Show>
      <Show
        when={room()}
        fallback={
          // On a phone the table's own row of seats says who is in; the big screen says it here.
          <ul class="room-seats" aria-label="Who has answered" hidden={!props.big}>
            <For each={props.view.players}>
              {(player, seat) => (
                <li classList={{ done: !!player.done }}>
                  <user-avatar prop:name={props.names[seat()] ?? `Player ${seat() + 1}`} prop:size={props.big ? "lg" : "md"} />
                  <status-badge prop:variant={player.done ? "success" : "neutral"} prop:dot={true}>{player.done ? "In" : "Thinking"}</status-badge>
                </li>
              )}
            </For>
          </ul>
        }
      >
        {(shown) => (
          <>
            <p class="room-headline">{roomNamed(shown().headline, props.names)}</p>
            <bar-chart prop:items={bars()} prop:label="What the room said" prop:unit={unit()} prop:max={shown().kind === "scale" ? 100 : 0} />
            <ul class="room-gains" aria-label="What it was worth" hidden={!props.big}>
              <For each={shown().gained}>
                {(gained, seat) => (
                  <li classList={{ none: !gained }}>
                    <span>{props.names[seat()] ?? `Player ${seat() + 1}`}</span>
                    <number-ticker prop:value={gained} prop:prefix="+" prop:duration={900} />
                  </li>
                )}
              </For>
            </ul>
          </>
        )}
      </Show>
    </section>
  );
}

/** Put the board on the page. `update` hands it the next view; only what changed is redrawn. */
export function mountRoomBoard(el: HTMLElement, first: RoomBoardProps) {
  const [props, set] = createStore<RoomBoardProps>(structuredClone(first));
  const dispose = render(() => <RoomBoard view={props.view} names={props.names} big={props.big} />, el);
  return { update: (next: RoomBoardProps) => set(reconcile(structuredClone(next))), dispose };
}
