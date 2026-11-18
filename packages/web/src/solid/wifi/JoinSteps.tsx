/* @jsxImportSource solid-js */
// Joining a table on this wifi, before the game: scan (or paste) the host's code, show yours back,
// say your name, and wait to be seated; or, if the table closed, scan the host's new code. The
// session (wifi/joining.ts) does the connecting.
//
// A Solid island inside the React app (wifi/WifiJoin.tsx mounts it). Once the host starts, the
// React table takes over from the same session.
import "@open-parlor/ui/zubra-ui/text-field.zb?element";
import { Match, Show, Switch, createSignal } from "solid-js";
import { render } from "solid-js/web";
import type { Joining } from "../../wifi/joining";
import { canLink } from "../../wifi/link";
import { QrCode, QrScanner } from "./Qr";
import { follow } from "./store";

export interface JoinStepsProps {
  joining: Joining;
  onLeave: () => void;
}

function JoinSteps(props: JoinStepsProps) {
  const state = follow(props.joining);
  const [typed, setTyped] = createSignal("");
  const step = () => state().step;
  return (
    <main class="setup wifi">
      <header class="setup-head">
        <div class="suits" aria-hidden="true">
          📶
        </div>
        <h1>Join a table on this wifi</h1>
        <p>No internet needed: you and the host only have to be on the same wifi.</p>
      </header>
      <button type="button" class="link" onClick={() => props.onLeave()}>
        ← All games
      </button>
      <Switch>
        <Match when={step().at === "scan"}>
          <section class="wifi-step" aria-label="Scan the host's code">
            <h2>Scan the host's code</h2>
            <p class="fine">The host picks a game and taps “Play on this wifi”. Point this device at the code on their screen.</p>
            <Show when={canLink()}>
              <QrScanner onRead={(text) => props.joining.join(text)} />
            </Show>
            <form
              class="wifi-paste"
              onSubmit={(event) => {
                event.preventDefault();
                void props.joining.join(typed());
              }}
            >
              <text-field prop:label="The host's link" prop:description="Or paste it here, if the camera can't read it." prop:value={typed()} prop:autocomplete="off" on:valuechange={(event: CustomEvent<string>) => setTyped(event.detail)} />
              <button type="submit" class="secondary" disabled={!typed().trim()}>
                Join
              </button>
            </form>
          </section>
        </Match>
        <Match when={step().at === "answer" && (step() as { code: string })}>
          {(answer) => (
            <section class="wifi-step" aria-label="Show this to the host">
              <h2>Now show this to the host</h2>
              <QrCode text={answer().code} label="A QR code for the host to scan" />
              <p class="fine">They tap “Scan their code” and point their device at this one. Keep this screen open.</p>
              <text-field
                class="wifi-paste"
                prop:label="Your name"
                prop:description="What the table calls you."
                prop:value={state().name}
                prop:maxlength={20}
                prop:autocomplete="given-name"
                on:valuechange={(event: CustomEvent<string>) => props.joining.setName(event.detail)}
              />
              <text-field
                class="wifi-paste"
                prop:label="Your code"
                prop:description="Or send them this code."
                prop:readonly={true}
                prop:value={answer().code}
                on:focusin={(event: FocusEvent) => (event.target as HTMLInputElement).select?.()}
              />
            </section>
          )}
        </Match>
        <Match when={step().at === "seated" && (step() as { names: string[] })}>
          {(seated) => (
            <section class="wifi-step" role="status">
              <h2>You're in</h2>
              <Show when={seated().names.length > 0}>
                <p>At the table: {seated().names.join(", ")}.</p>
              </Show>
              <p class="fine">Waiting for the host to start the game.</p>
            </section>
          )}
        </Match>
        <Match when={step().at === "gone"}>
          <section class="wifi-step" role="status">
            <h2>The table has closed</h2>
            <p class="fine">The host left, or one of you dropped off the wifi. If it was you, the host can let you back in to the same seat: they tap “Let … back in” under the table and show you a new code.</p>
            <button type="button" class="primary" onClick={() => props.joining.again()}>
              📷 Scan the host's new code
            </button>
            <button type="button" class="secondary" onClick={() => props.onLeave()}>
              All games
            </button>
          </section>
        </Match>
      </Switch>
      <Show when={state().problem}>
        <p class="error">{state().problem}</p>
      </Show>
    </main>
  );
}

/** Draw the guest's steps into `into`; returns what takes them away. */
export function mountJoinSteps(into: HTMLElement, props: JoinStepsProps): () => void {
  return render(() => <JoinSteps {...props} />, into);
}
