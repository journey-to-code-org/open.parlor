// The channel between a host's browser and a guest's, opened with no server at all: no signalling
// server (the offer and answer are carried by hand, see signal.ts) and no STUN or TURN (both are on
// the same wifi, and reach each other at their local addresses).
//
// What comes out of it is a Transport: the same thing a WebSocket to the parlor's server is, to a
// room or to a device's session. Text and bytes both pass.
import type { Transport } from "../shooter/session.ts";
import { fromSdp, pack, toSdp, unpack } from "./signal.ts";

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

/**
 * The channel as a Transport. Made the moment the channel exists, before it is open, so that it is
 * already listening: the other side may speak the instant its end opens, and a browser can hand
 * that message over before it has said this end is open. Listening only from "open" loses it.
 */
function wrap(pc: RTCPeerConnection, channel: RTCDataChannel): Transport {
  channel.binaryType = "arraybuffer";
  /** What arrived before anyone was listening. */
  const early: (string | Uint8Array)[] = [];
  let hear: Transport["onmessage"] = null;
  let gone: Transport["onclose"] = null;
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    try {
      channel.close();
      pc.close();
    } catch {}
    gone?.();
  };
  channel.addEventListener("message", (event) => {
    const data = typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer);
    if (hear) hear(data);
    else early.push(data);
  });
  channel.addEventListener("close", end);
  pc.addEventListener("connectionstatechange", () => {
    // Not "disconnected": that is a moment's trouble on the network, and may mend itself.
    if (pc.connectionState === "failed" || pc.connectionState === "closed") end();
  });
  return {
    send(data) {
      if (over || channel.readyState !== "open") return;
      try {
        channel.send(data as string & ArrayBufferView<ArrayBuffer>);
      } catch {}
    },
    close: end,
    get onmessage() {
      return hear;
    },
    set onmessage(listener) {
      hear = listener;
      if (listener) for (const data of early.splice(0)) listener(data);
    },
    get onclose() {
      return gone;
    },
    set onclose(listener) {
      gone = listener;
    },
  };
}

/** The channel's Transport, once the channel is open. */
const opened = (pc: RTCPeerConnection, channel: RTCDataChannel, transport = wrap(pc, channel)) =>
  new Promise<Transport>((yes, no) => {
    const fail = () => {
      clearTimeout(timer);
      no(new Error(UNREACHABLE));
    };
    const timer = setTimeout(fail, CONNECT_MS);
    pc.addEventListener("connectionstatechange", () => pc.connectionState === "failed" && fail());
    const ready = () => {
      clearTimeout(timer);
      yes(transport);
    };
    if (channel.readyState === "open") ready();
    else channel.addEventListener("open", ready, { once: true });
  });

/** Whether this browser can do it at all. */
export const canLink = () => typeof RTCPeerConnection === "function";

/** The host's side: a code to show, and what to do with the code the guest shows back. */
export async function offerSeat(): Promise<{ code: string; answered(code: string): Promise<Transport>; cancel(): void }> {
  const pc = connection();
  const channel = pc.createDataChannel("game");
  const transport = wrap(pc, channel);
  await pc.setLocalDescription(await pc.createOffer());
  const code = pack(fromSdp(await described(pc)));
  return {
    code,
    async answered(answer) {
      const shake = unpack(answer);
      const link = opened(pc, channel, transport);
      await pc.setRemoteDescription({ type: "answer", sdp: toSdp(shake, "answer") });
      return link;
    },
    cancel: () => pc.close(),
  };
}

/** The guest's side: from the host's code, a code to show back, and the channel once the host has read it. */
export async function takeSeat(offer: string): Promise<{ code: string; joined: Promise<Transport>; cancel(): void }> {
  const shake = unpack(offer);
  const pc = connection();
  const joined = new Promise<Transport>((yes, no) => {
    pc.addEventListener("datachannel", (event) => opened(pc, event.channel).then(yes, no));
    // The host may take a while to scan the code back: no timer here, only a connection that fails outright.
    pc.addEventListener("connectionstatechange", () => pc.connectionState === "failed" && no(new Error(UNREACHABLE)));
  });
  joined.catch(() => {});
  await pc.setRemoteDescription({ type: "offer", sdp: toSdp(shake, "offer") });
  await pc.setLocalDescription(await pc.createAnswer());
  return { code: pack(fromSdp(await described(pc))), joined, cancel: () => pc.close() };
}

/** Keep the screen on while a game is hosted: a host's phone that sleeps stops the game for everyone. */
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
