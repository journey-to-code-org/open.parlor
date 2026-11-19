/** The engine has room for four. */
export declare const MAX_PLAYERS = 4;
export interface Settings {
    /** Together against the monsters, or against each other. */
    mode: "coop" | "deathmatch";
    /** 1 (easiest) to 5. */
    skill: number;
    /** Where the game starts. */
    episode: number;
    map: number;
    monsters: boolean;
    /** Whether the game may be listed for anyone to watch. Someone with the room's code can always watch. */
    listed: boolean;
}
export declare const DEFAULT_SETTINGS: Settings;
export interface Member {
    id: number;
    name: string;
    /** Here to watch, not to play. */
    watching: boolean;
}
/** From a device. */
export type ToRoom = {
    t: "hello";
    name: string;
    watch: boolean;
}
/** The host changes the game before it starts. */
 | {
    t: "settings";
    settings: Settings;
}
/** A member changes between playing and watching, before the game starts. */
 | {
    t: "watch";
    watch: boolean;
}
/** The host starts the game. */
 | {
    t: "start";
}
/** A device that came after the start to play has run through the game so far: it can be put in it. */
 | {
    t: "ready";
};
/** From the room. */
export type FromRoom = {
    t: "lobby";
    you: number;
    host: number;
    members: Member[];
    settings: Settings;
    playing: boolean;
}
/** The game is on. `players` are the members playing, in the engine's player order; `slot` is this device's place among them, or -1 to watch. */
 | {
    t: "start";
    settings: Settings;
    players: Member[];
    slot: number;
}
/**
 * Someone who came after the start is a player from tic `at`, in the engine's place `slot` (a
 * new one, or one left by someone who went). Said to everyone; the device that is them makes
 * its player's commands from `at` on.
 */
 | {
    t: "joined";
    slot: number;
    at: number;
    member: Member;
}
/** The game is held up for these players' commands (none: it is running). */
 | {
    t: "waiting";
    slots: number[];
}
/** The room has no more to say to this device. */
 | {
    t: "closed";
    reason: string;
};
/** The most tics one message carries. */
export declare const TICS_PER_MESSAGE = 200;
/** No engine's command is anywhere near this long. */
export declare const MAX_COMMAND = 64;
/** A device's command for a tic. */
export declare function encodeCommand(tic: number, command: Uint8Array): Uint8Array;
export declare function decodeCommand(bytes: Uint8Array): {
    tic: number;
    command: Uint8Array;
} | null;
/** One tic: who is playing (bit 0 the first player), then the four players' commands end to end. */
export interface Tic {
    playing: number;
    commands: Uint8Array;
}
/** Tics in order, the first of them numbered `first`. They must all carry commands of one size. */
export declare function encodeTics(first: number, tics: Tic[]): Uint8Array;
export declare function decodeTics(bytes: Uint8Array): {
    first: number;
    tics: Tic[];
} | null;
/** A setting from a device is taken for what it is worth: anything out of range becomes the default. */
export declare function cleanSettings(from: unknown): Settings;
/** A name as the room will show it: what can be printed of it, to a sensible length. */
export declare function cleanName(from: unknown): string;
