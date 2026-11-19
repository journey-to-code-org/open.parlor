import { type Settings } from "./protocol.ts";
/** A device's connection, as the room uses it. */
export interface Link {
    send(data: string | Uint8Array): void;
    /** The room is done with this device. */
    close(): void;
}
/** What the room gives back for a connection: where to bring what the device says. */
export interface Seat {
    receive(data: string | Uint8Array): void;
    /** The connection has gone. */
    leave(): void;
}
export interface RoomOptions {
    /** Milliseconds, from any starting point. */
    now(): number;
    /** How long a player may hold the game up before the others are told who they are waiting for. */
    lateAfter?: number;
    /** How long before a player holding the game up is dropped from it, so the others can go on. */
    dropAfter?: number;
    /** How long a player has to send a first command: an engine takes a moment to start. */
    startWithin?: number;
    /** People who may watch, on top of the players. */
    watchers?: number;
    /** The longest game, in tics. */
    longest?: number;
}
/** How long after the room's last tic someone who came late is put in: a second, for every device to hear of it first. */
export declare const JOIN_LEAD = 35;
export declare class Room {
    readonly code: string;
    private options;
    private peers;
    private nextId;
    private host;
    private settings;
    /** The players, in the engine's order, once the game is on. */
    private players;
    /** Every tic sent so far. */
    private log;
    private commandSize;
    private waitingFor;
    private over;
    constructor(code: string, options: RoomOptions);
    /** Nobody is here: the room can be forgotten. */
    get empty(): boolean;
    /** What may be said of the room to someone who isn't in it. */
    get summary(): {
        code: string;
        playing: boolean;
        listed: boolean;
        players: string[];
        watching: number;
        minutes: number;
        settings: Settings;
    };
    /** A device has connected. */
    join(link: Link): Seat;
    /** Call this a few times a second: it is how a player who has stopped sending is noticed. */
    check(): void;
    private send;
    private members;
    private lobby;
    private said;
    /**
     * Someone who came to a game that is on, to play, has caught up: they are a player from a tic a
     * second after the last one sent, in the first place nobody is playing in. Until they have a
     * place they go on watching, and are let in as soon as one comes free.
     */
    private letIn;
    /** A place among the players has come free: the first who is waiting to play, and caught up, may have it. */
    private letInWaiting;
    private turnAway;
    private started;
    /** Someone who came after the start: the game so far, to run through. */
    private catchUp;
    private command;
    /** Sends every tic whose commands are all in. */
    private advance;
    private waiting;
    /** A player is out of the game from the next tic; the game goes on for the rest. */
    private retire;
    private drop;
    private end;
    private left;
}
/** The rooms of one server. */
export declare class Rooms {
    private rooms;
    /** When each was opened: a room nobody has come to yet is given a minute before it is swept away. */
    private opened;
    private options;
    private most;
    private random;
    /** `most`: as many rooms as this, and no more are opened. */
    constructor(options: RoomOptions, most?: number, random?: () => number);
    /** A new room, or null when there are as many as there may be. */
    open(): Room | null;
    find(code: string): Room | undefined;
    /** The games that may be listed for anyone to watch. */
    listed(): {
        code: string;
        playing: boolean;
        listed: boolean;
        players: string[];
        watching: number;
        minutes: number;
        settings: Settings;
    }[];
    /** Call this a few times a second. */
    check(): void;
    private sweep;
}
