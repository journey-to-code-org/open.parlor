// Forehead's room, from a player's side: the game as the server shows it to this seat, and the
// video call between everyone in it.
//
// The game goes through the parlor's server (packages/server/src/foreheads.ts), which never sends
// a seat its own card. The call is a mesh: this browser holds one WebRTC connection to each other
// player, and the server only carries their handshakes.
//
// Beside the picture and sound, each connection has a little channel for where that player's
// forehead is (face.ts), so their card can sit on it.
//
// Of any two players, the one in the lower seat makes the offer. The other asks for one ("hello")
// when it arrives or when its connection fails. Offers are numbered, so a late message for an old
// connection is ignored.

import { packPose, unpackPose, type Pose } from "./face";

export interface Rules {
  rounds: number;
  seconds: number;
  guesses: number;
}
export interface Buzz {
  n: number;
  round: number;
  by: number;
  seat: number;
  redealt: number | null;
}
/** One of the games a host picks from, for a round. */
export interface Mode {
  id: string;
  name: string;
  emoji: string;
  rule: string;
  silent?: boolean;
  turns?: boolean;
  one?: boolean;
}
export interface SeatView {
  seat: number;
  score: number;
  /** Whether they have a card on this round (in the hot seat, only one player does). */
  wearing: boolean;
  /** Null on your own forehead, until you guess it or the cards are turned over. */
  card: string | null;
  hint: string;
  won: number | null;
  guessesLeft: number;
  guesses: { text: string; right: boolean }[];
}
export interface GameView {
  phase: "picking" | "playing" | "reveal" | "over";
  round: number;
  rounds: number;
  host: number;
  mode: Mode | null;
  modes: Mode[];
  /** Whose turn it is to ask the room, in a game played in turns. */
  asker: number | null;
  /** Every microphone is off: a silent room, while it is played. */
  silent: boolean;
  you: number | null;
  endsAt: number;
  players: SeatView[];
  buzzes: Buzz[];
  winners: number[];
}
export interface RoomView {
  code: string;
  you: number | null;
  host: number;
  rules: Rules;
  players: { seat: number; name: string; here: boolean }[];
  canStart: boolean;
  full: boolean;
  game: GameView | null;
  now: number;
}

interface Ticket {
  code: string;
  seat: number;
  token: string;
  ice: RTCIceServer[];
  view: RoomView;
  v: number;
}
interface Signal {
  type: "hello" | "offer" | "answer" | "candidate" | "bye";
  gen?: number;
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
}
interface Peer {
  pc: RTCPeerConnection | null;
  gen: number;
  pending: RTCIceCandidateInit[];
  retry: ReturnType<typeof setTimeout> | null;
  /** When this side last asked the other for an offer. */
  asked: number;
  /** The channel that carries where each of the two foreheads is. */
  face: RTCDataChannel | null;
}

/** How long a forehead is believed without word of it (the tracker says it at least once a second). */
const FACE_STALE_MS = 2500;

const error = async (r: Response) => ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `The server said ${r.status}`;
const post = (path: string, body: unknown, keepalive = false) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive }).catch(() => null);
const OFFLINE = "Couldn't reach the parlor's server: this game needs the internet.";

/** The link the others open to join. */
export const joinLink = (code: string) => {
  const url = new URL(location.href);
  url.search = "?forehead=join";
  url.hash = code;
  return url.href;
};

/** A seat is kept for the tab that took it, so a reload comes back to it. */
const KEY = (code: string) => `forehead:${code}`;
function remembered(code: string): { seat: number; token: string } | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY(code)) ?? "null") as { seat?: unknown; token?: unknown } | null;
    return kept && typeof kept.seat === "number" && typeof kept.token === "string" ? { seat: kept.seat, token: kept.token } : null;
  } catch {
    return null;
  }
}
const remember = (t: Ticket) => {
  try {
    sessionStorage.setItem(KEY(t.code), JSON.stringify({ seat: t.seat, token: t.token }));
  } catch {}
};
/** Whether this tab already has a seat in that room (it was reloaded). */
export const hasSeat = (code: string) => remembered(code) !== null;

/** Camera and microphone, or as much of them as there is leave to use. */
async function media(): Promise<{ stream: MediaStream; note: string | null }> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return { stream: new MediaStream(), note: "This browser can't use a camera here (it needs a secure https address)." };
  try {
    return { stream: await md.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 20 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }), note: null };
  } catch {
    try {
      return { stream: await md.getUserMedia({ audio: true }), note: "No camera: the others will hear you, and see your card on an empty tile." };
    } catch {
      return { stream: new MediaStream(), note: "No camera or microphone: you can see and hear the others, and type your guesses." };
    }
  }
}

export class ForeheadRoom {
  view: RoomView;
  /** Everyone else's picture and sound, by seat. */
  streams = new Map<number, MediaStream>();
  /** Where everyone's forehead is, by seat (this player's own too), as their camera last showed it. */
  faces = new Map<number, Pose>();
  private faceAt = new Map<number, number>();
  private faceTimer: ReturnType<typeof setInterval> | null = null;
  private faceNews: ReturnType<typeof setTimeout> | null = null;
  ended: string | null = null;
  private version: number;
  private after = 0;
  private stopped = false;
  /** Whether the player wants their microphone on. A silent room overrides it while it lasts. */
  private micWanted = true;
  private peers = new Map<number, Peer>();
  private listeners = { view: new Set<(v: RoomView) => void>(), streams: new Set<(s: Map<number, MediaStream>) => void>(), faces: new Set<(f: Map<number, Pose>) => void>(), ended: new Set<(why: string) => void>() };

  private constructor(
    private readonly ticket: Ticket,
    readonly local: MediaStream,
    /** Why there's no camera or microphone, if there isn't. */
    readonly note: string | null,
  ) {
    this.view = ticket.view;
    this.version = ticket.v;
    remember(ticket);
    this.applyMicrophone();
    this.sync();
    void this.hear();
    // A forehead nobody has heard of for a while (the tracker stopped, the connection is stuck) is forgotten.
    this.faceTimer = setInterval(() => {
      let gone = false;
      for (const [seat, at] of this.faceAt)
        if (Date.now() - at > FACE_STALE_MS && seat !== this.seat) {
          this.faceAt.delete(seat);
          gone = this.faces.delete(seat) || gone;
        }
      if (gone) this.tellFaces();
    }, 1000);
  }

  get code() {
    return this.ticket.code;
  }
  get seat() {
    return this.ticket.seat;
  }

  private static async enter(path: string, body: unknown): Promise<ForeheadRoom> {
    const { stream, note } = await media();
    const r = await post(path, body);
    if (!r?.ok) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(r ? await error(r) : OFFLINE);
    }
    return new ForeheadRoom((await r.json()) as Ticket, stream, note);
  }
  /** Open a room. Whoever does hosts until the game starts. */
  static open(name: string) {
    return ForeheadRoom.enter("/foreheads", { name });
  }
  /** Sit down in a room from its link, or come back to the seat this tab had. */
  static join(code: string, name: string) {
    return ForeheadRoom.enter(`/foreheads/${encodeURIComponent(code)}/join`, { name, ...remembered(code) });
  }

  on(event: "view", heard: (v: RoomView) => void): () => void;
  on(event: "streams", heard: (s: Map<number, MediaStream>) => void): () => void;
  on(event: "faces", heard: (f: Map<number, Pose>) => void): () => void;
  on(event: "ended", heard: (why: string) => void): () => void;
  on(event: keyof ForeheadRoom["listeners"], heard: (x: never) => void) {
    const set = this.listeners[event] as Set<typeof heard>;
    set.add(heard);
    return () => set.delete(heard);
  }

  /** Something a player does: start, rules, pick, guess, pass, buzz, reveal, next, again. Resolves to a problem, or null. */
  async act(action: string, more: Record<string, unknown> = {}): Promise<string | null> {
    const r = await post(`/foreheads/${this.code}/do`, { ...more, seat: this.seat, token: this.ticket.token, action });
    if (!r) return OFFLINE;
    if (!r.ok) return error(r);
    const { view, v } = (await r.json()) as { view: RoomView | null; v: number };
    if (view && v >= this.version) this.setView(view, v);
    return null;
  }

  setMicrophone(on: boolean) {
    this.micWanted = on;
    this.applyMicrophone();
  }
  /** In a silent room nobody's microphone sends anything, whatever its button says. */
  private applyMicrophone() {
    const on = this.micWanted && !this.view.game?.silent;
    this.local.getAudioTracks().forEach((t) => (t.enabled = on));
  }
  /** Where this player's forehead is now (null: no face, or not tracking). Goes to everyone on the call. */
  setFace(pose: Pose | null) {
    if (this.stopped) return;
    this.setFaceOf(this.seat, pose);
    const wire = JSON.stringify(packPose(pose));
    for (const peer of this.peers.values()) if (peer.face?.readyState === "open") peer.face.send(wire);
  }

  private setFaceOf(seat: number, pose: Pose | null) {
    if (pose) {
      this.faces.set(seat, pose);
      this.faceAt.set(seat, Date.now());
    } else {
      this.faceAt.delete(seat);
      if (!this.faces.delete(seat)) return;
    }
    this.tellFaces();
  }
  /**
   * At most twenty times a second: five players at a dozen a second each would otherwise be sixty
   * redraws. (Not once a frame: a window in the background gets few frames or none, and its cards
   * would stand still.)
   */
  private tellFaces() {
    if (this.faceNews) return;
    this.faceNews = setTimeout(() => {
      this.faceNews = null;
      this.listeners.faces.forEach((l) => l(this.faces));
    }, 50);
  }

  private useFace(seat: number, channel: RTCDataChannel) {
    const peer = this.peers.get(seat);
    if (!peer) return channel.close();
    peer.face = channel;
    channel.addEventListener("open", () => {
      const mine = this.faces.get(this.seat);
      if (peer.face === channel && mine) channel.send(JSON.stringify(packPose(mine)));
    });
    channel.addEventListener("message", (e) => {
      if (peer.face !== channel || this.stopped || typeof e.data !== "string" || e.data.length > 200) return;
      try {
        this.setFaceOf(seat, unpackPose(JSON.parse(e.data)));
      } catch {}
    });
  }

  setCamera(on: boolean) {
    this.local.getVideoTracks().forEach((t) => (t.enabled = on));
  }

  async leave() {
    if (this.stopped) return;
    this.finish("You left the game.");
    try {
      sessionStorage.removeItem(KEY(this.code));
    } catch {}
    await post(`/foreheads/${this.code}/do`, { seat: this.seat, token: this.ticket.token, action: "leave" }, true);
  }

  /** Hang up on this device without giving up the seat: the tab can come back to it from the link. */
  close() {
    this.finish("You left the call.");
  }

  private finish(why: string) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.faceTimer) clearInterval(this.faceTimer);
    if (this.faceNews) clearTimeout(this.faceNews);
    this.local.getTracks().forEach((t) => t.stop());
    for (const seat of [...this.peers.keys()]) this.drop(seat);
    this.ended = why;
    this.listeners.ended.forEach((l) => l(why));
  }

  private setView(view: RoomView, v: number) {
    this.view = view;
    this.version = v;
    this.applyMicrophone();
    this.sync();
    this.listeners.view.forEach((l) => l(view));
  }

  private say(to: number, message: Signal) {
    return post(`/foreheads/${this.code}/say`, { seat: this.seat, token: this.ticket.token, to, message });
  }

  /** Listen for the room changing and for the others' handshakes, for as long as this tab is in it. */
  private async hear() {
    let quietFor = 0;
    while (!this.stopped) {
      const r = await fetch(`/foreheads/${this.code}/hear?seat=${this.seat}&token=${this.ticket.token}&after=${this.after}&v=${this.version}`, { cache: "no-store" }).catch(() => null);
      if (this.stopped) return;
      if (!r) {
        // No connection to the server just now: the call itself may still be fine. Try again soon.
        await new Promise((w) => setTimeout(w, Math.min(10_000, 1000 * ++quietFor)));
        continue;
      }
      quietFor = 0;
      if (r.status === 403 || r.status === 404) return this.finish("This game has ended, or your seat in it was given up.");
      if (!r.ok) {
        await new Promise((w) => setTimeout(w, 2000));
        continue;
      }
      const { messages, next, view, v } = (await r.json()) as { messages: { from: number; message: Signal }[]; next: number; view: RoomView | null; v: number };
      this.after = next;
      if (view) this.setView(view, v);
      for (const m of messages) await this.handle(m.from, m.message).catch(() => {});
    }
  }

  /** Keep a connection to everyone who is there, and none to anyone who has gone. */
  private sync() {
    if (this.stopped) return;
    const others = this.view.players.filter((p) => p.seat !== this.seat);
    for (const seat of [...this.peers.keys()]) if (!others.some((p) => p.seat === seat)) this.drop(seat);
    for (const other of others) {
      if (!other.here) continue;
      const peer = this.peers.get(other.seat);
      const state = peer?.pc?.connectionState;
      if (state === "connected" || state === "connecting" || state === "new") continue;
      if (this.seat < other.seat) {
        if (!peer?.retry) void this.offer(other.seat);
      } else this.ask(other.seat);
    }
  }

  private peer(seat: number): Peer {
    let peer = this.peers.get(seat);
    if (!peer) this.peers.set(seat, (peer = { pc: null, gen: 0, pending: [], retry: null, asked: 0, face: null }));
    return peer;
  }
  private drop(seat: number) {
    const peer = this.peers.get(seat);
    if (!peer) return;
    if (peer.retry) clearTimeout(peer.retry);
    peer.pc?.close();
    this.peers.delete(seat);
    if (this.streams.delete(seat)) this.listeners.streams.forEach((l) => l(this.streams));
    this.setFaceOf(seat, null);
  }
  /** Ask the lower seat for an offer, not more often than every few seconds. */
  private ask(seat: number) {
    const peer = this.peer(seat);
    if (Date.now() - peer.asked < 4000) return;
    peer.asked = Date.now();
    void this.say(seat, { type: "hello" });
  }

  private async handle(from: number, m: Signal) {
    if (m.type === "bye") return this.drop(from);
    if (m.type === "hello") {
      // Unless an offer is already on its way to them.
      const state = this.peers.get(from)?.pc?.connectionState;
      if (this.seat < from && state !== "new" && state !== "connecting") await this.offer(from);
      return;
    }
    const peer = this.peer(from);
    if (m.type === "offer" && this.seat > from && m.sdp && m.gen) {
      peer.gen = m.gen;
      const pc = this.connect(from);
      await pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
      await this.flush(peer, pc);
      await pc.setLocalDescription(await pc.createAnswer());
      await this.say(from, { type: "answer", gen: peer.gen, sdp: pc.localDescription!.sdp });
      return;
    }
    if (m.type === "answer" && this.seat < from && m.gen === peer.gen && peer.pc && m.sdp) {
      await peer.pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
      await this.flush(peer, peer.pc);
      return;
    }
    if (m.type === "candidate" && m.gen === peer.gen && m.candidate) {
      if (peer.pc?.remoteDescription) await peer.pc.addIceCandidate(m.candidate).catch(() => {});
      else peer.pending.push(m.candidate);
    }
  }

  private async flush(peer: Peer, pc: RTCPeerConnection) {
    for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  }

  /** A new connection to that seat, in place of any before it. */
  private connect(seat: number): RTCPeerConnection {
    const peer = this.peer(seat);
    peer.pc?.close();
    peer.pending = [];
    peer.face = null;
    const gen = peer.gen;
    const pc = new RTCPeerConnection({ iceServers: this.ticket.ice });
    peer.pc = pc;
    const current = () => this.peers.get(seat)?.pc === pc && !this.stopped;
    for (const track of this.local.getTracks()) pc.addTrack(track, this.local);
    // Receive picture and sound even from here, where there may be neither to send.
    if (!this.local.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });
    if (!this.local.getAudioTracks().length) pc.addTransceiver("audio", { direction: "recvonly" });
    pc.addEventListener("icecandidate", (e) => {
      if (e.candidate && current()) void this.say(seat, { type: "candidate", gen, candidate: e.candidate.toJSON() });
    });
    pc.addEventListener("track", (e) => {
      if (!current()) return;
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      if (this.streams.get(seat) === stream) return;
      this.streams.set(seat, stream);
      this.listeners.streams.forEach((l) => l(this.streams));
    });
    // Where the foreheads are: the lower seat opens the channel, as it makes the offer. Late is no use, so nothing is sent twice.
    if (this.seat < seat) this.useFace(seat, pc.createDataChannel("face", { ordered: false, maxRetransmits: 0 }));
    else pc.addEventListener("datachannel", (e) => current() && e.channel.label === "face" && this.useFace(seat, e.channel));
    pc.addEventListener("connectionstatechange", () => {
      if (!current()) return;
      if (pc.connectionState !== "failed" && pc.connectionState !== "disconnected") return;
      // A brief "disconnected" often comes back by itself; "failed" doesn't.
      if (peer.retry) clearTimeout(peer.retry);
      peer.retry = setTimeout(
        () => {
          peer.retry = null;
          if (!current() || pc.connectionState === "connected") return;
          if (this.seat < seat) void this.offer(seat);
          else this.ask(seat);
        },
        pc.connectionState === "failed" ? 500 : 5000,
      );
    });
    return pc;
  }

  private async offer(to: number) {
    if (this.stopped) return;
    const peer = this.peer(to);
    peer.gen++;
    const pc = this.connect(to);
    await pc.setLocalDescription(await pc.createOffer());
    await this.say(to, { type: "offer", gen: peer.gen, sdp: pc.localDescription!.sdp });
  }
}
