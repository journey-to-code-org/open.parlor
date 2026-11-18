// What a device and a room say to each other.
//
// Setting up is JSON, a message at a time. Once a game is on, the two things that are said
// thirty-five times a second are bytes: a device's command for a tic, and the room's answer when
// it has every player's, a "tic": the four commands and who is playing.
//
// A command is whatever the engine hands over (16 bytes for this one); nothing here looks inside.
/** The engine has room for four. */
export const MAX_PLAYERS = 4;
export const DEFAULT_SETTINGS = { mode: "coop", skill: 3, episode: 1, map: 1, monsters: true, listed: false };
const COMMAND = 1;
const TICS = 2;
/** The most tics one message carries. */
export const TICS_PER_MESSAGE = 200;
/** No engine's command is anywhere near this long. */
export const MAX_COMMAND = 64;
/** A device's command for a tic. */
export function encodeCommand(tic, command) {
    const bytes = new Uint8Array(5 + command.length);
    bytes[0] = COMMAND;
    new DataView(bytes.buffer).setUint32(1, tic, true);
    bytes.set(command, 5);
    return bytes;
}
export function decodeCommand(bytes) {
    if (bytes[0] !== COMMAND || bytes.length <= 5 || bytes.length > 5 + MAX_COMMAND)
        return null;
    return { tic: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, true), command: bytes.slice(5) };
}
/** Tics in order, the first of them numbered `first`. They must all carry commands of one size. */
export function encodeTics(first, tics) {
    const size = tics[0].commands.length;
    const bytes = new Uint8Array(8 + tics.length * (1 + size));
    const view = new DataView(bytes.buffer);
    bytes[0] = TICS;
    view.setUint32(1, first, true);
    view.setUint16(5, tics.length, true);
    bytes[7] = size / MAX_PLAYERS;
    tics.forEach((tic, i) => {
        bytes[8 + i * (1 + size)] = tic.playing;
        bytes.set(tic.commands, 9 + i * (1 + size));
    });
    return bytes;
}
export function decodeTics(bytes) {
    if (bytes[0] !== TICS || bytes.length < 8)
        return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(5, true);
    const size = bytes[7] * MAX_PLAYERS;
    if (bytes.length !== 8 + count * (1 + size))
        return null;
    const tics = [];
    for (let i = 0; i < count; i++) {
        const at = 8 + i * (1 + size);
        tics.push({ playing: bytes[at], commands: bytes.slice(at + 1, at + 1 + size) });
    }
    return { first: view.getUint32(1, true), tics };
}
/** A setting from a device is taken for what it is worth: anything out of range becomes the default. */
export function cleanSettings(from) {
    const given = (typeof from === "object" && from !== null ? from : {});
    const whole = (value, low, high, otherwise) => (typeof value === "number" && Number.isInteger(value) && value >= low && value <= high ? value : otherwise);
    return {
        mode: given.mode === "deathmatch" ? "deathmatch" : "coop",
        skill: whole(given.skill, 1, 5, DEFAULT_SETTINGS.skill),
        episode: whole(given.episode, 1, 9, DEFAULT_SETTINGS.episode),
        map: whole(given.map, 1, 99, DEFAULT_SETTINGS.map),
        monsters: given.monsters !== false,
        listed: given.listed === true,
    };
}
/** A name as the room will show it: what can be printed of it, to a sensible length. */
export function cleanName(from) {
    const name = (typeof from === "string" ? from : "").replace(/[^\p{L}\p{N} '._-]/gu, "").trim().slice(0, 16);
    return name || "Player";
}
