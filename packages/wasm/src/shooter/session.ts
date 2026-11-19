// A device's side of a room: what it says to the room and what it makes of the answers. Nothing
// here knows how the two are connected (a WebSocket to the parlor's server today) or what is on
// the page; the tests run it against a room in the same process.
import { decodeTics, encodeCommand, type FromRoom, type Member, type Settings, type Tic, type ToRoom } from "../../net/protocol.ts";

/** A connection to a room, already open. */
export interface Transport {
  send(data: string | Uint8Array): void;
  close(): void;
  /** Set by the session: what the room said. */
  onmessage: ((data: string | Uint8Array) => void) | null;
  /** Set by the session: the connection has gone. */
  onclose: (() => void) | null;
}

export interface Lobby {
  /** This device's member. */
  you: number;
  host: number;
  members: Member[];
  settings: Settings;
  playing: boolean;
}

export interface Game {
  settings: Settings;
  /** In the engine's player order. */
  players: Member[];
  /** This device's place among them, or -1 to watch. */
  slot: number;
}

export interface SessionEvents {
  lobby?(lobby: Lobby): void;
  /** The game is on: start the engine for it. */
  start(game: Game): void;
  /** The next tics, in order. */
  tics(tics: Tic[]): void;
  /** Whose commands the game is held up for, by player; none when it is running. */
  waiting?(slots: number[]): void;
  /** Someone who came late is a player from tic `at`, in place `slot`: maybe this device. */
  joined?(slot: number, at: number, member: Member): void;
  /** The room is done with this device, or the connection has gone: there will be no more tics. */
  closed(reason: string): void;
}

export interface Session {
  /** The host changes the game before it starts. */
  settings(settings: Settings): void;
  /** Play, or watch: before the game starts. */
  watch(watch: boolean): void;
  /** The host starts the game. */
  start(): void;
  /** Came late to play, and has run through the game so far: put me in. */
  ready(): void;
  /** This device's command for a tic. */
  command(tic: number, command: Uint8Array): void;
  /** Leave. */
  close(): void;
}

export function openSession(transport: Transport, name: string, watch: boolean, events: SessionEvents): Session {
  let open = true;
  /** How many tics have arrived: the next must be numbered this. */
  let received = 0;
  const say = (message: ToRoom) => open && transport.send(JSON.stringify(message));
  const closed = (reason: string) => {
    if (!open) return;
    open = false;
    transport.onmessage = transport.onclose = null;
    transport.close();
    events.closed(reason);
  };

  transport.onclose = () => closed("The connection to the game was lost.");
  transport.onmessage = (data) => {
    if (typeof data !== "string") {
      const batch = decodeTics(data);
      // A tic missing, or out of order, and this device's game would no longer be the others'.
      if (!batch || batch.first !== received) return closed("The game's messages arrived out of step.");
      received += batch.tics.length;
      return events.tics(batch.tics);
    }
    const message = JSON.parse(data) as FromRoom;
    if (message.t === "lobby") events.lobby?.(message);
    else if (message.t === "start") events.start(message);
    else if (message.t === "waiting") events.waiting?.(message.slots);
    else if (message.t === "joined") events.joined?.(message.slot, message.at, message.member);
    else if (message.t === "closed") closed(message.reason);
  };
  say({ t: "hello", name, watch });

  return {
    settings: (settings) => void say({ t: "settings", settings }),
    watch: (to) => void say({ t: "watch", watch: to }),
    start: () => void say({ t: "start" }),
    ready: () => void say({ t: "ready" }),
    command: (tic, command) => open && transport.send(encodeCommand(tic, command)),
    close: () => closed("You left the game."),
  };
}
