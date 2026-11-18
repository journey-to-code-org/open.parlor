/* @jsxImportSource solid-js */
// Letting a guest who dropped off the wifi back into the same seat. A fresh offer for that seat is
// shown as a QR code; the guest scans it and shows theirs back, as when they first joined. The
// game carries on from where it is: the seat, its hand and its score were never given away.
//
// A Solid island over the React table (kit/LocalKit.tsx mounts it, through wifi/Rejoin.tsx).
import "@open-parlor/ui/zubra-ui/text-field.zb?element";
import { Show, createSignal, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { offerSeat, type PeerLink } from "../../wifi/link";
import { codeIn, joinLink } from "../../wifi/signal";
import { QrCode, QrScanner } from "./Qr";

export interface RejoinProps {
  name: string;
  onLinked: (link: PeerLink) => void;
  onCancel: () => void;
}

type Seat = Awaited<ReturnType<typeof offerSeat>>;

function Rejoin(props: RejoinProps) {
  const [seat, setSeat] = createSignal<Seat | null>(null);
  const [scanning, setScanning] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [problem, setProblem] = createSignal<string | null>(null);
  let gone = false;
  let linked = false;
  // Closed without letting them in: the offer goes with it.
  onCleanup(() => {
    gone = true;
    if (!linked) seat()?.cancel();
  });

  /** A fresh offer for the seat (again after one that failed to connect). */
  const offer = () =>
    offerSeat().then(
      (made) => (gone ? made.cancel() : setSeat(made)),
      () => setProblem("Couldn't get the seat ready. Is this device on the wifi?"),
    );
  offer();

  const accept = async (text: string): Promise<boolean> => {
    const offered = seat();
    if (!offered || busy()) return false;
    setBusy(true);
    setProblem(null);
    try {
      const link = await offered.answered(codeIn(text));
      linked = true;
      props.onLinked(link);
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn't work. Try the code again.");
      if (e instanceof Error && !/isn't a code|isn't on a network/.test(e.message)) {
        offered.cancel();
        setSeat(null);
        offer();
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  const link = () => (seat() ? joinLink(seat()!.code) : "");

  return (
    <div class="howto-backdrop" onClick={() => props.onCancel()}>
      <section class="howto wifi-rejoin" role="dialog" aria-modal="true" aria-labelledby="rejoin-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="rejoin-title">Let {props.name} back in</h2>
        <p class="howto-tagline">Their seat is kept as they left it.</p>
        <h3>1. They scan this</h3>
        <Show when={seat()} fallback={<p class="fine">Getting the seat ready…</p>}>
          <QrCode text={link()} label={`A QR code that lets ${props.name} back in`} />
        </Show>
        <p class="fine">With their camera, or “Scan the host's new code” on their screen.</p>
        <Show when={seat()}>
          <text-field
            class="wifi-paste"
            prop:label="The link that lets them back in"
            prop:description="Or send them this link (AirDrop, Quick Share)."
            prop:readonly={true}
            prop:value={link()}
            on:focusin={(event: FocusEvent) => (event.target as HTMLInputElement).select?.()}
          />
        </Show>
        <h3>2. You scan theirs</h3>
        <Show
          when={scanning()}
          fallback={
            <button type="button" class="secondary" disabled={!seat() || busy()} onClick={() => setScanning(true)}>
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
          <button type="submit" class="secondary" disabled={!seat() || busy() || !typed().trim()}>
            {busy() ? "Connecting…" : "Connect"}
          </button>
        </form>
        <Show when={problem()}>
          <p class="error">{problem()}</p>
        </Show>
        <button type="button" class="link" onClick={() => props.onCancel()}>
          Not now
        </button>
      </section>
    </div>
  );
}

/** Draw the dialog into `into`; returns what takes it away (and the offer with it, if unused). */
export function mountRejoin(into: HTMLElement, props: RejoinProps): () => void {
  return render(() => <Rejoin {...props} />, into);
}
