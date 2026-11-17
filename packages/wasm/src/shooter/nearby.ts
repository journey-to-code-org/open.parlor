// Playing together with no server at all, for devices on the same wifi, internet or no. One
// device hosts: the room that is in the parlor's server for an internet game is in its page
// instead, and the others reach it over channels opened by showing each other a QR code.
//
// Each person is added with two scans: they scan the host's code (their camera app will do: it is
// a link to this page, which opens from what the device kept), and the host scans theirs.
import { Room } from "../../net/room.ts";
import { canLink, offerSeat, stayAwake, takeSeat } from "../wifi/link.ts";
import { qrCode, scan } from "../wifi/qr.ts";
import { codeIn, joinLink } from "../wifi/signal.ts";
import type { Transport } from "./session.ts";

export { canLink };

/** A room in this page, and the ways into it. */
export interface Hosting {
  /** The host's own way in: a connection that is a function call. */
  local(): Transport;
  /** Another device's channel, once it is open. */
  attach(transport: Transport): void;
  /** Ends it: everyone else's game ends with it. */
  stop(): void;
}

export function host(): Hosting {
  const room = new Room("WIFI", { now: () => performance.now() });
  const timer = setInterval(() => room.check(), 250);
  const awake = stayAwake();
  const channels = new Set<Transport>();
  return {
    local() {
      // Delivered a moment later, as a real connection's messages are: never in the middle of the send.
      const transport: Transport = { send: (data) => queueMicrotask(() => seat.receive(data)), close: () => seat.leave(), onmessage: null, onclose: null };
      const seat = room.join({ send: (data) => queueMicrotask(() => transport.onmessage?.(data)), close: () => queueMicrotask(() => transport.onclose?.()) });
      return transport;
    },
    attach(transport) {
      channels.add(transport);
      const seat = room.join({ send: (data) => transport.send(data), close: () => transport.close() });
      transport.onclose = () => {
        channels.delete(transport);
        seat.leave();
      };
      transport.onmessage = (data) => seat.receive(data);
    },
    stop() {
      clearInterval(timer);
      awake();
      for (const channel of [...channels]) channel.close();
    },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(name: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function button(label: string, run: () => void, main = false): HTMLButtonElement {
  const node = el("button", main ? "shooter-go" : "lobby-small", label);
  node.type = "button";
  node.addEventListener("click", run);
  return node;
}

/** A code on the screen: as a QR code for a camera, and as text to copy for when there is none. */
function shown(text: string, label: string): HTMLElement {
  const box = el("div", "nearby-code");
  const words = el("input");
  words.readOnly = true;
  words.value = text;
  words.setAttribute("aria-label", `${label}, as text`);
  words.addEventListener("focus", () => words.select());
  const copy = button("Copy", () => void navigator.clipboard?.writeText(text).then(() => (copy.textContent = "Copied"), () => words.focus()));
  const row = el("div", "lobby-share");
  row.append(words, copy);
  box.append(qrCode(text, label), row);
  return box;
}

/** A code to be read off another screen: the camera, or a box to paste it into. `take` answers whether it was the one wanted. */
function asked(label: string, take: (code: string) => Promise<boolean>): { node: HTMLElement; stop(): void } {
  const box = el("div", "nearby-read");
  const camera = el("div", "qr-scan");
  let stop = () => {};
  const look = button("Use the camera", () => {
    look.hidden = true;
    stop = scan(camera, (text) => take(codeIn(text)));
  });
  const typed = el("input");
  typed.placeholder = "or paste it here";
  typed.setAttribute("aria-label", `${label}, pasted`);
  const go = button("Connect", () => typed.value.trim() && void take(codeIn(typed.value)));
  const row = el("div", "lobby-share");
  row.append(typed, go);
  box.append(look, camera, row);
  return { node: box, stop: () => stop() };
}

/**
 * The host adds someone: this device's code for them to scan, then theirs to scan back. `joined`
 * is given their channel; `done` is called when the host is finished here, either way.
 */
export function invite(card: HTMLElement, page: string, joined: (transport: Transport) => void, done: () => void): void {
  const status = el("p", "nearby-status", "Making a code…");
  let cancel = () => {};
  let stopReading = () => {};
  // While this is set the card is this screen's: news from the room doesn't draw over it.
  card.dataset.nearby = "invite";
  const finish = () => {
    stopReading();
    delete card.dataset.nearby;
    done();
  };
  const actions = el("div", "lobby-actions");
  actions.append(button("Done", () => (cancel(), finish())));
  card.replaceChildren(el("h1", "", "Add someone on this wifi"), status, actions);
  card.hidden = false;
  void offerSeat().then(
    (seat) => {
      cancel = seat.cancel;
      const reading = asked("Their code", async (code) => {
        status.textContent = "Connecting…";
        try {
          joined(await seat.answered(code));
          cancel = () => {};
          finish();
          return true;
        } catch (error) {
          status.textContent = (error as Error).message;
          return false;
        }
      });
      stopReading = reading.stop;
      status.textContent = "";
      card.replaceChildren(
        el("h1", "", "Add someone on this wifi"),
        el("p", "", "1. They point their camera at this code. If the game is already open on their device, they choose “Join a game on this wifi” and scan it there."),
        shown(joinLink(seat.code, page), "This game's code"),
        el("p", "", "2. Their screen then shows a code of its own. Read it with this device:"),
        reading.node,
        status,
        actions,
      );
    },
    (error: Error) => (status.textContent = error.message),
  );
}

/**
 * Someone joins a host. With no `offer` yet, the host's code is asked for first. Then this
 * device's code is shown for the host to scan, and `joined` is given the channel once they have.
 */
export function join(card: HTMLElement, offer: string | null, joined: (transport: Transport) => void, back: () => void): void {
  let cancel = () => {};
  let stopReading = () => {};
  const leave = () => {
    cancel();
    stopReading();
    back();
  };
  const actions = el("div", "lobby-actions");
  actions.append(button("Back", leave));
  const status = el("p", "nearby-status");

  async function answer(code: string): Promise<boolean> {
    try {
      const seat = await takeSeat(code);
      stopReading();
      cancel = seat.cancel;
      status.textContent = "Waiting for the host to read it…";
      card.replaceChildren(el("h1", "", "Show this to the host"), el("p", "", "The host reads this code with their device, and you are in."), shown(seat.code, "This device's code"), status, actions);
      seat.joined.then(
        (transport) => {
          cancel = () => {};
          joined(transport);
        },
        (error: Error) => (status.textContent = error.message),
      );
      return true;
    } catch (error) {
      status.textContent = (error as Error).message;
      return false;
    }
  }

  card.hidden = false;
  if (offer) {
    card.replaceChildren(el("h1", "", "Joining a game on this wifi"), status, actions);
    status.textContent = "Making a code…";
    return void answer(offer);
  }
  const reading = asked("The host's code", answer);
  stopReading = reading.stop;
  card.replaceChildren(el("h1", "", "Join a game on this wifi"), el("p", "", "The host chooses “Add someone” and shows a code. Read it with this device:"), reading.node, status, actions);
}
