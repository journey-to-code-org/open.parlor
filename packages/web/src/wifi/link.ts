// The channel between a host's browser and a guest's, opened with no server at all: no signalling
// server (the offer and answer are carried by hand, see signal.ts) and no STUN or TURN (both are on
// the same wifi, and reach each other at their local addresses).
import { fromSdp, pack, toSdp, unpack } from "./signal";

/** What passes over the channel. The host runs the game; a guest sends moves and is sent its own seat's view. */
export type WifiMessage =
  | { t: "hello"; name: string }
  | { t: "seated"; names: string[] }
  | { t: "view"; seat: number; names: string[]; view: unknown }
  | { t: "move"; id: number; move: Record<string, unknown> }
  | { t: "ack"; id: number; error: string | null }
  | { t: "bye" };

export interface PeerLink {
  readonly open: boolean;
  send(message: WifiMessage): void;
  /** Hear every message; ones that came before anyone listened are delivered first. */
  listen(heard: (message: WifiMessage) => void): () => void;
  /** Told once, when the other side has gone (it left, slept, or walked out of range). */
  closed(gone: () => void): () => void;
  close(): void;
}

const GATHER_MS = 2500;
const CONNECT_MS = 20_000;
export const UNREACHABLE = "Couldn't reach the other device. Are you both on the same wifi? (A guest network, or a mobile hotspot's \"client isolation\", keeps devices apart.)";

/** No ICE servers: the only addresses offered are this device's own on the local network. */
const connection = () => new RTCPeerConnection({ iceServers: [] });

/** The local description once every address has been found (there are no servers to wait on, so this is quick). */
async function described(pc: RTCPeerConnection): Promise<string> {
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((done) => {
      const timer = setTimeout(done, GATHER_MS);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState !== "complete") return;
        clearTimeout(timer);
        done();
      });
    });
  }
  return pc.localDescription!.sdp;
}

function wrap(pc: RTCPeerConnection, channel: RTCDataChannel): PeerLink {
  const listeners = new Set<(message: WifiMessage) => void>();
  const leavers = new Set<() => void>();
  const early: WifiMessage[] = [];
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    for (const gone of leavers) gone();
    try {
      channel.close();
      pc.close();
    } catch {}
  };
  channel.addEventListener("message", (event) => {
    let message: WifiMessage;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!message || typeof message !== "object" || typeof message.t !== "string") return;
    if (message.t === "bye") return end();
    if (listeners.size) for (const heard of listeners) heard(message);
    else early.push(message);
  });
  channel.addEventListener("close", end);
  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") end();
  });
  return {
    get open() {
      return !over && channel.readyState === "open";
    },
    send(message) {
      if (over || channel.readyState !== "open") return;
      try {
        channel.send(JSON.stringify(message));
      } catch {}
    },
    listen(heard) {
      listeners.add(heard);
      for (const message of early.splice(0)) heard(message);
      return () => listeners.delete(heard);
    },
    closed(gone) {
      if (over) queueMicrotask(gone);
      else leavers.add(gone);
      return () => leavers.delete(gone);
    },
    close() {
      if (!over && channel.readyState === "open") {
        try {
          channel.send(JSON.stringify({ t: "bye" }));
        } catch {}
      }
      end();
    },
  };
}

const opened = (pc: RTCPeerConnection, channel: RTCDataChannel) =>
  new Promise<PeerLink>((yes, no) => {
    const fail = () => {
      clearTimeout(timer);
      no(new Error(UNREACHABLE));
    };
    const timer = setTimeout(fail, CONNECT_MS);
    pc.addEventListener("connectionstatechange", () => pc.connectionState === "failed" && fail());
    const ready = () => {
      clearTimeout(timer);
      yes(wrap(pc, channel));
    };
    if (channel.readyState === "open") ready();
    else channel.addEventListener("open", ready, { once: true });
  });

/** Whether this browser can do it at all. */
export const canLink = () => typeof RTCPeerConnection === "function";

/** The host's side: a code to show, and what to do with the code the guest shows back. */
export async function offerSeat(): Promise<{ code: string; answered(code: string): Promise<PeerLink>; cancel(): void }> {
  const pc = connection();
  const channel = pc.createDataChannel("table");
  await pc.setLocalDescription(await pc.createOffer());
  const code = pack(fromSdp(await described(pc)));
  return {
    code,
    async answered(answer) {
      const shake = unpack(answer);
      const link = opened(pc, channel);
      await pc.setRemoteDescription({ type: "answer", sdp: toSdp(shake, "answer") });
      return link;
    },
    cancel: () => pc.close(),
  };
}

/** The guest's side: from the host's code, a code to show back, and the channel once the host has read it. */
export async function takeSeat(offer: string): Promise<{ code: string; joined: Promise<PeerLink>; cancel(): void }> {
  const shake = unpack(offer);
  const pc = connection();
  const joined = new Promise<PeerLink>((yes, no) => {
    pc.addEventListener("datachannel", (event) => opened(pc, event.channel).then(yes, no));
    // The host may take a while to scan the code back: no timer here, only a connection that fails outright.
    pc.addEventListener("connectionstatechange", () => pc.connectionState === "failed" && no(new Error(UNREACHABLE)));
  });
  joined.catch(() => {});
  await pc.setRemoteDescription({ type: "offer", sdp: toSdp(shake, "offer") });
  await pc.setLocalDescription(await pc.createAnswer());
  return { code: pack(fromSdp(await described(pc))), joined, cancel: () => pc.close() };
}

/** Keep the screen on while a table is running: a host's phone that sleeps stops the game for everyone. */
export function stayAwake(): () => void {
  let lock: { release(): Promise<void> } | null = null;
  let done = false;
  const ask = () => {
    if (done || document.visibilityState !== "visible") return;
    (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen").then(
      (got) => (done ? void got.release() : (lock = got)),
      () => {},
    );
  };
  ask();
  document.addEventListener("visibilitychange", ask);
  return () => {
    done = true;
    document.removeEventListener("visibilitychange", ask);
    void lock?.release().catch(() => {});
  };
}
