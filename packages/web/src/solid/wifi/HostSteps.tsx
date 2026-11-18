/* @jsxImportSource solid-js */
// Hosting a table on this wifi, before the game: who's at the table, the code for the next guest
// to scan, their code to scan back, and the button that starts the game. Nothing here needs the
// internet or the parlor's server; the session (wifi/hosting.ts) does the connecting.
//
// A Solid island inside the React app (wifi/WifiHost.tsx mounts it). Once the game starts, the
// React table takes over from the same session.
import "@open-parlor/ui/zubra-ui/text-field.zb?element";
import { For, Show, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { isFull, type Hosting } from "../../wifi/hosting";
import { joinLink } from "../../wifi/signal";
import { QrCode, QrScanner } from "./Qr";
import { follow } from "./store";

export interface HostStepsProps {
  hosting: Hosting;
  game: { name: string; emoji: string };
  onLeave: () => void;
}

function HostSteps(props: HostStepsProps) {
  const state = follow(props.hosting);
  const [scanning, setScanning] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const accept = async (text: string) => {
    const done = await props.hosting.accept(text);
    if (done) {
      setScanning(false);
      setTyped("");
    }
    return done;
  };
  const left = () => state().seats - state().here.length - state().guests.length;
  const link = () => (state().code ? joinLink(state().code!) : "");
  return (
    <main class="setup wifi">
      <header class="setup-head">
        <div class="suits" aria-hidden="true">
          {props.game.emoji}
        </div>
        <h1>{props.game.name} on this wifi</h1>
        <p>No internet needed. Everyone has to be on the same wifi (or this phone's hotspot), and to have opened the parlor on their device before.</p>
      </header>
      <button type="button" class="link" onClick={() => props.onLeave()}>
        ← Back
      </button>

      <Show when={state().guests.length > 0 || state().here.length > 1}>
        <section class="wifi-step" aria-label="At the table">
          <h2>At the table</h2>
          <ul class="wifi-seats">
            <li>{state().here[0]} (you)</li>
            <For each={state().here.slice(1)}>{(person) => <li>{person} (at this device)</li>}</For>
            <For each={state().guests}>{(guest) => <li>{guest.name}</li>}</For>
          </ul>
        </section>
      </Show>

      <Show when={!isFull(state())}>
        <section class="wifi-step" aria-label="Add a player">
          <h2>{state().guests.length ? "Add another player" : "1. They scan this"}</h2>
          <Show when={state().code} fallback={<p class="fine">Getting a seat ready…</p>}>
            <QrCode text={link()} label="A QR code that joins this table" />
          </Show>
          <p class="fine">With their phone's camera, or with “Join on this wifi” on the parlor's front page.</p>
          <Show when={state().code}>
            <text-field
              class="wifi-paste"
              prop:label="The link that joins this table"
              prop:description="Or send them this link (AirDrop, Quick Share)."
              prop:readonly={true}
              prop:value={link()}
              on:focusin={(event: FocusEvent) => (event.target as HTMLInputElement).select?.()}
            />
          </Show>
          <h2>{state().guests.length ? "Then scan theirs" : "2. You scan theirs"}</h2>
          <p class="fine">Their screen shows a code back. Point this device at it.</p>
          <Show
            when={scanning()}
            fallback={
              <button type="button" class="secondary" disabled={!state().code || state().busy} onClick={() => setScanning(true)}>
                📷 Scan their code
              </button>
            }
          >
            <QrScanner onRead={accept} />
          </Show>
          <form
            class="wifi-paste"
            onSubmit={(event) => {
              event.preventDefault();
              void accept(typed());
            }}
          >
            <text-field prop:label="Their code" prop:description="Or paste it here, if the camera can't read it." prop:value={typed()} prop:autocomplete="off" on:valuechange={(event: CustomEvent<string>) => setTyped(event.detail)} />
            <button type="submit" class="secondary" disabled={!state().code || state().busy || !typed().trim()}>
              {state().busy ? "Connecting…" : "Connect"}
            </button>
          </form>
        </section>
      </Show>
      <Show when={state().problem}>
        <p class="error">{state().problem}</p>
      </Show>

      <section class="wifi-step">
        <button type="button" class="primary deal" disabled={state().guests.length === 0} onClick={() => props.hosting.start()}>
          {state().guests.length === 0 ? "Waiting for someone to join" : left() > 0 ? `Start with ${left()} computer player${left() === 1 ? "" : "s"}` : "Start the game"}
        </button>
      </section>
    </main>
  );
}

/** Draw the host's steps into `into`; returns what takes them away. */
export function mountHostSteps(into: HTMLElement, props: HostStepsProps): () => void {
  return render(() => <HostSteps {...props} />, into);
}
