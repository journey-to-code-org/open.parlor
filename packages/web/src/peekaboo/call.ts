// Peekaboo's video call: one parent with the baby, the other anywhere. Camera, microphone and the
// shared board go browser to browser over WebRTC; the parlor's server only carries the handshake
// between them (packages/server/src/calls.ts).
//
// The side that starts the call ("a", with the baby) always makes the offer; the side that joins
// ("b") answers. When b joins again (a reload, another phone), or the connection fails, a offers
// again on a new connection, numbered, so a late message for an old one is ignored.

export type CallState = "waiting" | "connecting" | "connected" | "reconnecting" | "ended";
export type Side = "a" | "b";

interface Signal {
  type: "joined" | "offer" | "answer" | "candidate" | "bye";
  gen?: number;
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
  rejoin?: boolean;
}

interface Ticket {
  code: string;
  side: Side;
  token: string;
  ice: RTCIceServer[];
}

const error = async (r: Response) => ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `The server said ${r.status}`;

/** The link the other parent opens to join. */
export const joinLink = (code: string) => {
  const url = new URL(location.href);
  url.search = "?peekaboo=join";
  url.hash = code;
  return url.href;
};

/** Camera and microphone, or as much of them as there is leave to use. */
async function media(): Promise<{ stream: MediaStream; note: string | null }> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return { stream: new MediaStream(), note: "This browser can't use a camera here (it needs a secure https address)." };
  try {
    return {
      stream: await md.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
      note: null,
    };
  } catch {
    try {
      return { stream: await md.getUserMedia({ audio: true }), note: "No camera: the call is sound only from this side." };
    } catch {
      return { stream: new MediaStream(), note: "No camera or microphone: the board is shared, but there's no picture or sound from this side." };
    }
  }
}

export class PeekabooCall<M = unknown> {
  state: CallState;
  remote: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private gen = 0;
  private after = 0;
  private stopped = false;
  private pending: RTCIceCandidateInit[] = [];
  private retry: ReturnType<typeof setTimeout> | null = null;
  private listeners = { state: new Set<(s: CallState) => void>(), remote: new Set<(s: MediaStream | null) => void>(), message: new Set<(m: M) => void>(), open: new Set<() => void>() };

  private constructor(
    private readonly ticket: Ticket,
    readonly local: MediaStream,
    /** Why there's no camera or microphone, if there isn't. */
    readonly note: string | null,
  ) {
    this.state = ticket.side === "a" ? "waiting" : "connecting";
    void this.hear();
  }

  get code() {
    return this.ticket.code;
  }
  get side() {
    return this.ticket.side;
  }
  get open() {
    return this.channel?.readyState === "open";
  }

  /** Start a call, from the device with the baby. */
  static async start<M>(): Promise<PeekabooCall<M>> {
    const { stream, note } = await media();
    const r = await fetch("/calls", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    if (!r?.ok) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(r ? await error(r) : "Couldn't reach the parlor's server: a call needs the internet.");
    }
    return new PeekabooCall<M>((await r.json()) as Ticket, stream, note);
  }

  /** Join a call from its link. */
  static async join<M>(code: string): Promise<PeekabooCall<M>> {
    const { stream, note } = await media();
    const r = await fetch(`/calls/${encodeURIComponent(code)}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    if (!r?.ok) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(r ? await error(r) : "Couldn't reach the parlor's server: a call needs the internet.");
    }
    return new PeekabooCall<M>((await r.json()) as Ticket, stream, note);
  }

  on(event: "state", heard: (s: CallState) => void): () => void;
  on(event: "remote", heard: (s: MediaStream | null) => void): () => void;
  on(event: "message", heard: (m: M) => void): () => void;
  on(event: "open", heard: () => void): () => void;
  on(event: keyof PeekabooCall["listeners"], heard: (x: never) => void) {
    const set = this.listeners[event] as Set<typeof heard>;
    set.add(heard);
    return () => set.delete(heard);
  }

  send(message: M) {
    if (this.channel?.readyState !== "open") return;
    try {
      this.channel.send(JSON.stringify(message));
    } catch {}
  }

  setMicrophone(on: boolean) {
    this.local.getAudioTracks().forEach((t) => (t.enabled = on));
  }
  setCamera(on: boolean) {
    this.local.getVideoTracks().forEach((t) => (t.enabled = on));
  }

  async hangUp() {
    if (this.stopped) return;
    this.finish();
    await fetch(`/calls/${this.ticket.code}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ side: this.ticket.side, token: this.ticket.token }), keepalive: true }).catch(() => {});
  }

  private finish() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.local.getTracks().forEach((t) => t.stop());
    this.channel?.close();
    this.pc?.close();
    this.pc = null;
    this.setRemote(null);
    this.setState("ended");
  }

  private setState(s: CallState) {
    if (this.state === s) return;
    this.state = s;
    this.listeners.state.forEach((l) => l(s));
  }
  private setRemote(s: MediaStream | null) {
    this.remote = s;
    this.listeners.remote.forEach((l) => l(s));
  }

  private async say(message: Signal) {
    await fetch(`/calls/${this.ticket.code}/say`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ side: this.ticket.side, token: this.ticket.token, message }) }).catch(() => {});
  }

  /** Listen for the other side's handshake, for as long as the call lasts. */
  private async hear() {
    let quietFor = 0;
    while (!this.stopped) {
      const r = await fetch(`/calls/${this.ticket.code}/hear?side=${this.ticket.side}&token=${this.ticket.token}&after=${this.after}`, { cache: "no-store" }).catch(() => null);
      if (this.stopped) return;
      if (!r) {
        // No connection to the server just now: the call itself may still be fine. Try again soon.
        await new Promise((w) => setTimeout(w, Math.min(10_000, 1000 * ++quietFor)));
        continue;
      }
      quietFor = 0;
      if (r.status === 403 || r.status === 404) return this.finish(); // the call ended, or someone else took this side
      if (!r.ok) {
        await new Promise((w) => setTimeout(w, 2000));
        continue;
      }
      const { messages, next } = (await r.json()) as { messages: Signal[]; next: number };
      this.after = next;
      for (const m of messages) await this.handle(m).catch(() => {});
    }
  }

  private async handle(m: Signal) {
    if (m.type === "bye") return this.finish();
    if (m.type === "joined" && this.ticket.side === "a") return this.offer();
    if (m.type === "offer" && this.ticket.side === "b" && m.sdp && m.gen) {
      this.gen = m.gen;
      const pc = this.connect();
      await pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
      await this.flush(pc);
      await pc.setLocalDescription(await pc.createAnswer());
      await this.say({ type: "answer", gen: this.gen, sdp: pc.localDescription!.sdp });
      return;
    }
    if (m.type === "answer" && this.ticket.side === "a" && m.gen === this.gen && this.pc && m.sdp) {
      await this.pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
      await this.flush(this.pc);
      return;
    }
    if (m.type === "candidate" && m.gen === this.gen && m.candidate) {
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(m.candidate).catch(() => {});
      else this.pending.push(m.candidate);
    }
  }

  private async flush(pc: RTCPeerConnection) {
    for (const c of this.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  }

  /** A new connection, in place of any before it. */
  private connect(): RTCPeerConnection {
    this.pc?.close();
    this.pending = [];
    const gen = this.gen;
    const pc = new RTCPeerConnection({ iceServers: this.ticket.ice });
    this.pc = pc;
    for (const track of this.local.getTracks()) pc.addTrack(track, this.local);
    // Receive picture and sound even from a side that has neither to send.
    if (!this.local.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });
    if (!this.local.getAudioTracks().length) pc.addTransceiver("audio", { direction: "recvonly" });
    pc.addEventListener("icecandidate", (e) => {
      if (e.candidate && this.pc === pc) void this.say({ type: "candidate", gen, candidate: e.candidate.toJSON() });
    });
    pc.addEventListener("track", (e) => {
      if (this.pc !== pc) return;
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      if (this.remote !== stream) this.setRemote(stream);
    });
    pc.addEventListener("connectionstatechange", () => {
      if (this.pc !== pc || this.stopped) return;
      if (pc.connectionState === "connected") this.setState("connected");
      else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.setState("reconnecting");
        // The caller tries again on a new connection; a brief "disconnected" often comes back by itself.
        if (this.ticket.side === "a") {
          if (this.retry) clearTimeout(this.retry);
          this.retry = setTimeout(() => this.pc === pc && pc.connectionState !== "connected" && void this.offer(), pc.connectionState === "failed" ? 500 : 5000);
        }
      }
    });
    if (this.ticket.side === "a") this.useChannel(pc.createDataChannel("board"));
    else pc.addEventListener("datachannel", (e) => this.pc === pc && this.useChannel(e.channel));
    return pc;
  }

  private useChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.addEventListener("open", () => this.channel === channel && this.listeners.open.forEach((l) => l()));
    channel.addEventListener("message", (e) => {
      if (this.channel !== channel) return;
      try {
        const m = JSON.parse(String(e.data)) as M;
        this.listeners.message.forEach((l) => l(m));
      } catch {}
    });
  }

  private async offer() {
    if (this.stopped) return;
    this.gen++;
    this.setState(this.state === "waiting" ? "connecting" : "reconnecting");
    const pc = this.connect();
    await pc.setLocalDescription(await pc.createOffer());
    await this.say({ type: "offer", gen: this.gen, sdp: pc.localDescription!.sdp });
  }
}
