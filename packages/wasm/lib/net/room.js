// A room: the devices in one game, and the one thing a game across devices needs done for it.
//
// Every device runs the same game. Each sends its own player's command for each tic; a tic can
// be run once every player's command for it is in. The room is where they come in: it waits for
// all of a tic's commands, then sends the tic to everyone, in order. It never looks at a command
// and knows nothing of the game, so it is small, and it runs the same wherever it is put: in the
// parlor's server, or one day in the browser of whoever hosts on the wifi.
//
// The room keeps every tic it has sent. That is the whole game: someone who comes late is sent it
// from the start and runs through it to catch up, and it is a replay when it is over. Someone who
// came late to play is put in the game once they have caught up, while there is a place.
import { cleanName, cleanSettings, decodeCommand, DEFAULT_SETTINGS, encodeTics, MAX_PLAYERS, TICS_PER_MESSAGE } from "./protocol.js";
/** How long after the room's last tic someone who came late is put in: a second, for every device to hear of it first. */
export const JOIN_LEAD = 35;
/** How far ahead of the tic being waited for a command may be: more is not a device playing the game. */
const AHEAD = 70;
export class Room {
    code;
    options;
    peers = [];
    nextId = 1;
    host = 0;
    settings = { ...DEFAULT_SETTINGS };
    /** The players, in the engine's order, once the game is on. */
    players = null;
    /** Every tic sent so far. */
    log = [];
    commandSize = 0;
    waitingFor = "";
    over = false;
    constructor(code, options) {
        this.code = code;
        this.options = { lateAfter: 1500, dropAfter: 10000, startWithin: 20000, watchers: 12, longest: 35 * 60 * 180, ...options };
    }
    /** Nobody is here: the room can be forgotten. */
    get empty() {
        return this.peers.length === 0;
    }
    /** What may be said of the room to someone who isn't in it. */
    get summary() {
        const members = this.peers.filter((peer) => peer.joined);
        const players = this.players ? this.players.filter((player) => player.playing).map((player) => player.peer.name) : members.filter((peer) => !peer.watching).map((peer) => peer.name);
        return { code: this.code, playing: !!this.players && !this.over, listed: this.settings.listed, players, watching: members.length - players.length, minutes: Math.floor(this.log.length / 35 / 60), settings: this.settings };
    }
    /** A device has connected. */
    join(link) {
        const peer = { id: this.nextId++, name: "", watching: false, link, joined: false, slot: -1, wants: false, ready: false };
        this.peers.push(peer);
        return {
            receive: (data) => {
                try {
                    if (typeof data === "string")
                        this.said(peer, JSON.parse(data));
                    else
                        this.command(peer, data);
                }
                catch {
                    // Not something a device of ours says: nothing to do with it.
                }
            },
            leave: () => this.left(peer),
        };
    }
    /** Call this a few times a second: it is how a player who has stopped sending is noticed. */
    check() {
        if (!this.players || this.over)
            return;
        const now = this.options.now();
        const next = this.log.length;
        const late = [];
        for (const player of this.players) {
            if (!player.playing || player.from > next || player.ahead.has(next))
                continue;
            const quiet = now - player.heard;
            if (quiet > (player.begun ? this.options.dropAfter : this.options.startWithin))
                this.drop(player, "You were away too long, and the game went on without you.");
            else if (quiet > this.options.lateAfter)
                late.push(player);
        }
        this.advance();
        this.waiting(late.filter((player) => player.playing));
    }
    send(peer, message) {
        peer.link.send(JSON.stringify(message));
    }
    members() {
        return this.peers.filter((peer) => peer.joined).map(({ id, name, watching }) => ({ id, name, watching }));
    }
    lobby() {
        const members = this.members();
        for (const peer of this.peers)
            if (peer.joined)
                this.send(peer, { t: "lobby", you: peer.id, host: this.host, members, settings: this.settings, playing: !!this.players });
    }
    said(peer, message) {
        if (message.t === "hello") {
            if (peer.joined)
                return;
            if (this.over)
                return this.turnAway(peer, "This game is over.");
            const members = this.peers.filter((other) => other.joined);
            const players = members.filter((other) => !other.watching).length;
            if (members.length - players >= this.options.watchers && (this.players || message.watch === true || players >= MAX_PLAYERS)) {
                return this.turnAway(peer, "This game has as many people watching as it can take.");
            }
            peer.joined = true;
            peer.name = cleanName(message.name);
            // A full game can only be watched. Someone who comes to a game that is on watches while
            // they catch up; if they came to play, they are put in it once they have (ready, below).
            peer.watching = message.watch === true || !!this.players || players >= MAX_PLAYERS;
            peer.wants = !!this.players && message.watch !== true;
            if (!this.host)
                this.host = peer.id;
            this.lobby();
            if (this.players)
                this.catchUp(peer);
            return;
        }
        if (message.t === "ready") {
            peer.ready = true;
            return this.letIn(peer);
        }
        if (!peer.joined || this.players)
            return;
        if (message.t === "watch") {
            const players = this.peers.filter((other) => other.joined && !other.watching && other !== peer).length;
            peer.watching = message.watch === true || players >= MAX_PLAYERS;
            this.lobby();
        }
        else if (peer.id !== this.host) {
            return;
        }
        else if (message.t === "settings") {
            this.settings = cleanSettings(message.settings);
            this.lobby();
        }
        else if (message.t === "start") {
            const playing = this.peers.filter((other) => other.joined && !other.watching).slice(0, MAX_PLAYERS);
            if (playing.length === 0)
                return;
            const now = this.options.now();
            this.players = playing.map((member, slot) => {
                member.slot = slot;
                return { peer: member, playing: true, ahead: new Map(), heard: now, begun: false, from: 0 };
            });
            this.lobby();
            for (const other of this.peers)
                if (other.joined)
                    this.started(other);
        }
    }
    /**
     * Someone who came to a game that is on, to play, has caught up: they are a player from a tic a
     * second after the last one sent, in the first place nobody is playing in. Until they have a
     * place they go on watching, and are let in as soon as one comes free.
     */
    letIn(peer) {
        if (!peer.joined || !peer.wants || !this.players || this.over)
            return;
        let slot = this.players.findIndex((player) => !player.playing);
        if (slot < 0 && this.players.length < MAX_PLAYERS)
            slot = this.players.length;
        if (slot < 0)
            return;
        const at = this.log.length + JOIN_LEAD;
        peer.wants = false;
        peer.watching = false;
        peer.slot = slot;
        this.players[slot] = { peer, playing: true, ahead: new Map(), heard: this.options.now(), begun: false, from: at };
        const member = { id: peer.id, name: peer.name, watching: false };
        for (const other of this.peers)
            if (other.joined)
                this.send(other, { t: "joined", slot, at, member });
        this.lobby();
    }
    /** A place among the players has come free: the first who is waiting to play, and caught up, may have it. */
    letInWaiting() {
        const next = this.peers.find((peer) => peer.joined && peer.wants && peer.ready);
        if (next)
            this.letIn(next);
    }
    turnAway(peer, reason) {
        this.send(peer, { t: "closed", reason });
        this.peers = this.peers.filter((other) => other !== peer);
        peer.link.close();
    }
    started(peer) {
        this.send(peer, { t: "start", settings: this.settings, players: this.players.map(({ peer: { id, name, watching } }) => ({ id, name, watching })), slot: peer.slot });
    }
    /** Someone who came after the start: the game so far, to run through. */
    catchUp(peer) {
        this.started(peer);
        for (let first = 0; first < this.log.length; first += TICS_PER_MESSAGE)
            peer.link.send(encodeTics(first, this.log.slice(first, first + TICS_PER_MESSAGE)));
    }
    command(peer, bytes) {
        const player = this.players?.[peer.slot];
        const sent = decodeCommand(bytes);
        if (!player?.playing || !sent || this.over)
            return;
        // The first command says how long this engine's commands are; the rest must agree.
        this.commandSize ||= sent.command.length;
        const next = this.log.length;
        if (sent.command.length !== this.commandSize || sent.tic < Math.max(next, player.from) || sent.tic > Math.max(next, player.from) + AHEAD)
            return;
        player.ahead.set(sent.tic, sent.command);
        player.heard = this.options.now();
        player.begun = true;
        this.advance();
    }
    /** Sends every tic whose commands are all in. */
    advance() {
        if (!this.players || this.over || !this.commandSize)
            return;
        const first = this.log.length;
        const ready = [];
        for (;;) {
            const tic = first + ready.length;
            // Someone who came late is in from their own tic, not before.
            const playing = this.players.filter((player) => player.playing && player.from <= tic);
            if (playing.length === 0 || !playing.every((player) => player.ahead.has(tic)))
                break;
            const commands = new Uint8Array(this.commandSize * MAX_PLAYERS);
            let mask = 0;
            this.players.forEach((player, slot) => {
                if (!player.playing || player.from > tic)
                    return;
                mask |= 1 << slot;
                commands.set(player.ahead.get(tic), slot * this.commandSize);
                player.ahead.delete(tic);
            });
            ready.push({ playing: mask, commands });
            if (ready.length === TICS_PER_MESSAGE)
                break;
        }
        if (ready.length === 0)
            return;
        this.log.push(...ready);
        const message = encodeTics(first, ready);
        for (const peer of this.peers)
            if (peer.joined)
                peer.link.send(message);
        this.waiting([]);
        if (this.log.length >= this.options.longest)
            this.end("This game has run as long as a game can.");
        else if (ready.length === TICS_PER_MESSAGE)
            this.advance();
    }
    waiting(late) {
        const slots = late.map((player) => player.peer.slot);
        if (slots.join() === this.waitingFor)
            return;
        this.waitingFor = slots.join();
        for (const peer of this.peers)
            if (peer.joined)
                this.send(peer, { t: "waiting", slots });
    }
    /** A player is out of the game from the next tic; the game goes on for the rest. */
    retire(player) {
        player.playing = false;
        player.ahead.clear();
        if (this.players.some((other) => other.playing)) {
            this.advance();
            // Their place may be someone's who is waiting to play.
            this.letInWaiting();
        }
        else
            this.end("Everyone who was playing has left.");
    }
    drop(player, reason) {
        this.send(player.peer, { t: "closed", reason });
        this.peers = this.peers.filter((peer) => peer !== player.peer);
        player.peer.link.close();
        this.retire(player);
        this.lobby();
    }
    end(reason) {
        if (this.over)
            return;
        this.over = true;
        for (const peer of this.peers) {
            if (peer.joined)
                this.send(peer, { t: "closed", reason });
            peer.link.close();
        }
        this.peers = [];
    }
    left(peer) {
        if (!this.peers.includes(peer))
            return;
        this.peers = this.peers.filter((other) => other !== peer);
        const player = this.players?.[peer.slot];
        if (player?.playing && player.peer === peer)
            this.retire(player);
        // The longest here is the host now.
        if (peer.id === this.host)
            this.host = this.peers.find((other) => other.joined)?.id ?? 0;
        if (!this.over)
            this.lobby();
    }
}
/** Letters that can't be mistaken for each other read aloud or written down. */
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
/** The rooms of one server. */
export class Rooms {
    rooms = new Map();
    /** When each was opened: a room nobody has come to yet is given a minute before it is swept away. */
    opened = new Map();
    options;
    most;
    random;
    /** `most`: as many rooms as this, and no more are opened. */
    constructor(options, most = 200, random = Math.random) {
        this.options = options;
        this.most = most;
        this.random = random;
    }
    /** A new room, or null when there are as many as there may be. */
    open() {
        this.sweep();
        if (this.rooms.size >= this.most)
            return null;
        for (;;) {
            const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(this.random() * LETTERS.length)]).join("");
            if (this.rooms.has(code))
                continue;
            const room = new Room(code, this.options);
            this.rooms.set(code, room);
            this.opened.set(code, this.options.now());
            return room;
        }
    }
    find(code) {
        return this.rooms.get(code.toUpperCase());
    }
    /** The games that may be listed for anyone to watch. */
    listed() {
        return [...this.rooms.values()].map((room) => room.summary).filter((room) => room.playing && room.listed);
    }
    /** Call this a few times a second. */
    check() {
        for (const room of this.rooms.values())
            room.check();
        this.sweep();
    }
    sweep() {
        const now = this.options.now();
        for (const [code, room] of this.rooms) {
            if (!room.empty || now - (this.opened.get(code) ?? 0) < 60000)
                continue;
            this.rooms.delete(code);
            this.opened.delete(code);
        }
    }
}
