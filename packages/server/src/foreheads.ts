// Forehead, the video-call guessing game (forehead-game.ts has its rules): the rooms.
//
// The server deals and keeps score, and gives each player the game as their seat sees it: everyone
// else's card and never their own. The pictures and the sound go browser to browser over WebRTC,
// every player to every other (a mesh); the server carries only their handshakes, as calls.ts does
// for Peekaboo, in a mailbox for each seat.
//
//   POST /foreheads                  { name }: open a room. Its code, your seat and token, the ICE servers
//   POST /foreheads/<code>/join      { name } to sit down; { seat, token } to come back to your seat
//   POST /foreheads/<code>/do        { seat, token, action, … }: start, rules { rules }, pick { mode },
//                                    guess { text }, pass, buzz { player, spoiled? }, reveal, next, again, leave
//   POST /foreheads/<code>/say       { seat, token, to, message }: a handshake, into another seat's box
//   GET  /foreheads/<code>/hear      ?seat&token&after=n&v=n: what is in your box after n, and the room
//                                    as you see it if it has changed since v. Waits for either.
//
// Whoever opened the room hosts until the game starts; from then the game says who the host is,
// a new one each round. A host who drops off the call is replaced by the next player who is there.
// Rooms live in memory and are forgotten an hour after everyone stops asking.
import type { CallOptions, RTCIceServerLike } from "./calls.js";
import { nameOk } from "./names.js";
import { buzz, cleanRules, DEFAULT_RULES, ForeheadError, guess, hostAfter, MAX_PLAYERS, MIN_PLAYERS, newGame, next, pass, passHost, pick, reveal, tick, view, type Game, type GameView, type Rules } from "./forehead-game.js";

const LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 6;
const IDLE_MS = 60 * 60_000;
const BOX_LIMIT = 400;
const MESSAGE_LIMIT = 16_000;
const MAX_ROOMS = 500;
const NAME_LIMIT = 20;
/** Wrong codes one address may try in ten minutes. */
export const WRONG_TRIES = 12;
const TRY_WINDOW_MS = 10 * 60_000;
/** How long after a player's page last asked before they count as away. */
export const AWAY_MS = 12_000;
/** How long the host may be away before the game is handed to the next player. */
export const HOST_AWAY_MS = 25_000;
const DEFAULT_ICE: RTCIceServerLike[] = [{ urls: "stun:stun.l.google.com:19302" }];

export interface ForeheadOptions extends CallOptions {
  /** The seed for a game's deal, for tests. */
  seed?: () => number;
}

interface Box {
  messages: { n: number; message: unknown }[];
  next: number;
}
interface Player {
  seat: number;
  name: string;
  token: string;
  box: Box;
  /** Requests of theirs that are waiting for news right now. */
  listening: number;
  /** When their page last asked for anything. */
  seen: number;
}
interface Room {
  code: string;
  players: Player[];
  nextSeat: number;
  /** Who runs the room before a game starts. */
  host: number;
  rules: Rules;
  game: Game | null;
  /** Counts every change anybody could see. */
  version: number;
  /** Requests waiting for news: a change to the room wakes them all, a handshake only its seat's. */
  waiting: Set<{ seat: number; wake: () => void }>;
  /** Who was there when the room was last looked at, to notice someone dropping off. */
  there: string;
  touched: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface RoomView {
  code: string;
  you: number | null;
  host: number;
  rules: Rules;
  players: { seat: number; name: string; here: boolean }[];
  /** Whether there are enough at the table to start, and room for more. */
  canStart: boolean;
  full: boolean;
  game: GameView | null;
  /** The server's clock, to count the round down against. */
  now: number;
}

const random = (n: number, letters = LETTERS) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => letters[b % letters.length]).join("");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const tidyForeheadCode = (typed: unknown) => String(typed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function createForeheads({ ice = DEFAULT_ICE, longPoll = 20_000, now = Date.now, seed = () => crypto.getRandomValues(new Uint32Array(1))[0]! }: ForeheadOptions = {}) {
  const rooms = new Map<string, Room>();
  const wrong = new Map<string, number[]>();

  const here = (p: Player) => p.listening > 0 || now() - p.seen < AWAY_MS;
  const player = (room: Room, seat: number) => room.players.find((p) => p.seat === seat);
  const thereNow = (room: Room) => room.players.map((p) => (here(p) ? p.seat : "")).join(",");
  const changed = (room: Room) => {
    room.version++;
    room.there = thereNow(room);
    for (const w of [...room.waiting]) w.wake();
    arm(room);
  };
  /** Wake the room when the round's time is up, so the cards turn over without anyone asking. */
  function arm(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    if (room.game?.phase !== "playing") return;
    room.timer = setTimeout(() => settle(room), Math.max(0, room.game.endsAt - now()) + 20);
    room.timer.unref?.();
  }
  /** Bring a room up to the present: the round's clock, and a host who has gone. */
  function settle(room: Room) {
    let moved = false;
    const game = room.game;
    if (game) {
      if (tick(game, now())) moved = true;
      const host = player(room, game.host);
      if (game.phase !== "over" && (!host || (!here(host) && now() - host.seen > HOST_AWAY_MS))) {
        const to = hostAfter(game, game.host, (seat) => {
          const p = player(room, seat);
          return !p || !here(p);
        });
        if (to !== game.host) {
          passHost(game, to);
          moved = true;
        }
      }
    } else if (!player(room, room.host) && room.players.length) {
      room.host = room.players[0]!.seat;
      moved = true;
    }
    // Someone dropping off the call (or coming back) is news to everyone's picture of the table.
    if (moved || thereNow(room) !== room.there) changed(room);
  }
  const sweep = () => {
    for (const [code, room] of rooms) {
      if (now() - room.touched <= IDLE_MS) continue;
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(code);
    }
    for (const [who, times] of wrong) if (!times.some((t) => now() - t < TRY_WINDOW_MS)) wrong.delete(who);
  };

  function roomView(room: Room, seat: number | null): RoomView {
    return {
      code: room.code,
      you: seat,
      host: room.game ? room.game.host : room.host,
      rules: room.game?.rules ?? room.rules,
      players: room.players.map((p) => ({ seat: p.seat, name: p.name, here: here(p) })),
      canStart: room.players.length >= MIN_PLAYERS,
      full: room.players.length >= MAX_PLAYERS,
      game: room.game ? view(room.game, seat) : null,
      now: now(),
    };
  }

  function cleanName(given: unknown, room: Room | null): string {
    const typed = String(given ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_LIMIT);
    const name = typed && nameOk(typed) ? typed : `Player ${(room?.nextSeat ?? 0) + 1}`;
    // Two people with one name would be told apart by nobody: the second is numbered.
    if (!room?.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return name;
    for (let n = 2; ; n++) if (!room.players.some((p) => p.name.toLowerCase() === `${name} ${n}`.toLowerCase())) return `${name} ${n}`;
  }
  function sit(room: Room, name: unknown): Player {
    const p: Player = { seat: room.nextSeat++, name: cleanName(name, room), token: random(24), box: { messages: [], next: 1 }, listening: 0, seen: now() };
    room.players.push(p);
    return p;
  }
  const post = (room: Room, to: Player, message: unknown) => {
    to.box.messages.push({ n: to.box.next++, message });
    if (to.box.messages.length > BOX_LIMIT) to.box.messages.splice(0, to.box.messages.length - BOX_LIMIT);
    for (const w of [...room.waiting]) if (w.seat === to.seat) w.wake();
  };

  /** What a player may do, by name. Throws a ForeheadError with words for the player. */
  function act(room: Room, me: Player, input: Record<string, unknown>) {
    const game = room.game;
    const action = input.action;
    if (action === "leave") {
      // Before a game the seat is given up. During one it is kept, for them to come back to.
      if (!game || game.phase === "over" || !game.order.includes(me.seat)) room.players = room.players.filter((p) => p !== me);
      else me.seen = 0;
      for (const other of room.players) if (other !== me) post(room, other, { from: me.seat, message: { type: "bye" } });
      return;
    }
    if (action === "rules") {
      if (game && game.phase !== "over") throw new ForeheadError("The rules are set once the game has started.");
      if (me.seat !== room.host) throw new ForeheadError("Only the host sets the rules.");
      room.rules = cleanRules({ ...room.rules, ...((input.rules ?? {}) as object) });
      return;
    }
    if (action === "start" || action === "again") {
      if (game && game.phase !== "over") throw new ForeheadError("The game has already started.");
      const host = game ? game.host : room.host;
      if (me.seat !== host) throw new ForeheadError("Only the host starts the game.");
      const seats = room.players.filter(here).map((p) => p.seat);
      if (!seats.includes(me.seat)) seats.push(me.seat);
      // A new game after one that finished: whoever would have hosted next goes first.
      const first = game ? hostAfter(game, game.host, (s) => !seats.includes(s)) : me.seat;
      room.players = room.players.filter((p) => seats.includes(p.seat));
      room.game = newGame(seats.sort((a, b) => a - b), room.rules, seed(), seats.includes(first) ? first : me.seat);
      room.host = room.game.host;
      return;
    }
    if (!game) throw new ForeheadError("The game hasn't started yet.");
    if (action === "pick") return pick(game, me.seat, input.mode, now());
    if (action === "pass") return pass(game, me.seat, now());
    if (action === "guess") return void guess(game, me.seat, input.text, now());
    if (action === "buzz") return void buzz(game, me.seat, input.player, input.spoiled, now());
    if (action === "reveal") return reveal(game, me.seat, now());
    if (action === "next")
      return next(game, me.seat, (seat) => {
        const p = player(room, seat);
        return !p || !here(p);
      });
    throw new ForeheadError("That isn't something to do here.");
  }

  return {
    get size() {
      return rooms.size;
    },
    /** Answers /foreheads requests; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const url = new URL(request.url);
      const { pathname } = url;
      if (pathname !== "/foreheads" && !pathname.startsWith("/foreheads/")) return null;
      sweep();

      const body = async (): Promise<Record<string, unknown> | Response> => {
        const text = await request.text();
        if (text.length > MESSAGE_LIMIT) return json({ error: "Too long" }, 413);
        try {
          const parsed = text ? JSON.parse(text) : {};
          return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
        } catch {
          return json({ error: "Not JSON" }, 400);
        }
      };

      if (pathname === "/foreheads") {
        if (request.method !== "POST") return json({ error: "Not found" }, 404);
        if (rooms.size >= MAX_ROOMS) return json({ error: "Too many games are open right now. Try again in a little while." }, 503);
        const input = await body();
        if (input instanceof Response) return input;
        let code = random(CODE_LENGTH);
        while (rooms.has(code)) code = random(CODE_LENGTH);
        const room: Room = { code, players: [], nextSeat: 0, host: 0, rules: { ...DEFAULT_RULES }, game: null, version: 1, waiting: new Set(), there: "", touched: now(), timer: null };
        const me = sit(room, input.name);
        rooms.set(code, room);
        return json({ code, seat: me.seat, token: me.token, ice, view: roomView(room, me.seat), v: room.version }, 201);
      }

      const [, , rawCode, action] = pathname.split("/");
      const code = tidyForeheadCode(rawCode);
      const room = rooms.get(code);
      const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "someone";
      const tries = (wrong.get(address) ?? []).filter((t) => now() - t < TRY_WINDOW_MS);
      if (!room) {
        if (tries.length >= WRONG_TRIES) return json({ error: "Too many wrong codes. Wait ten minutes and ask for a new link." }, 429);
        wrong.set(address, [...tries, now()]);
        return json({ error: "That game has ended, or the link isn't right. Ask for a new one." }, 404);
      }
      room.touched = now();
      settle(room);

      const mine = (seat: unknown, token: unknown): Player | null => {
        const p = typeof seat === "number" ? player(room, seat) : undefined;
        return p && typeof token === "string" && token && p.token === token ? p : null;
      };

      if (action === "join" && request.method === "POST") {
        const input = await body();
        if (input instanceof Response) return input;
        // Coming back to a seat (a reload, a phone that slept) with the token it was given.
        const back = mine(input.seat, input.token);
        if (back) {
          // Their page starts over, so its box does too: handshakes for connections it no longer has are no use to it.
          back.box = { messages: [], next: 1 };
          back.seen = now();
          changed(room);
          return json({ code, seat: back.seat, token: back.token, ice, view: roomView(room, back.seat), v: room.version });
        }
        if (room.game && room.game.phase !== "over") return json({ error: "That game has already started. Ask them to deal you in for the next one." }, 409);
        if (room.players.length >= MAX_PLAYERS) return json({ error: `That game is full: ${MAX_PLAYERS} can play.` }, 409);
        const me = sit(room, input.name);
        changed(room);
        return json({ code, seat: me.seat, token: me.token, ice, view: roomView(room, me.seat), v: room.version });
      }

      if (action === "do" && request.method === "POST") {
        const input = await body();
        if (input instanceof Response) return input;
        const me = mine(input.seat, input.token);
        if (!me) return json({ error: "Not your seat" }, 403);
        me.seen = now();
        // Now that they are known to be here: a host who has gone is replaced before the move is judged.
        settle(room);
        try {
          act(room, me, input);
        } catch (e) {
          if (e instanceof ForeheadError) return json({ error: e.message }, 400);
          throw e;
        }
        if (!room.players.length) {
          if (room.timer) clearTimeout(room.timer);
          rooms.delete(code);
          return json({ ok: true });
        }
        settle(room);
        changed(room);
        return json({ ok: true, view: input.action === "leave" ? null : roomView(room, me.seat), v: room.version });
      }

      if (action === "say" && request.method === "POST") {
        const input = await body();
        if (input instanceof Response) return input;
        const me = mine(input.seat, input.token);
        if (!me) return json({ error: "Not your seat" }, 403);
        me.seen = now();
        const to = typeof input.to === "number" && input.to !== me.seat ? player(room, input.to) : undefined;
        if (!to) return json({ error: "Nobody is in that seat" }, 404);
        if (input.message === undefined) return json({ error: "Nothing to say" }, 400);
        post(room, to, { from: me.seat, message: input.message });
        return json({ ok: true });
      }

      if (action === "hear" && request.method === "GET") {
        const seat = Number(url.searchParams.get("seat"));
        const token = url.searchParams.get("token");
        const me = mine(Number.isInteger(seat) ? seat : null, token);
        if (!me) return json({ error: "Not your seat" }, 403);
        const after = Number(url.searchParams.get("after")) || 0;
        const seenVersion = Number(url.searchParams.get("v")) || 0;
        const since = () => me.box.messages.filter((m) => m.n > after);
        const wasHere = here(me);
        me.seen = now();
        me.listening++;
        // Coming back is news to the others: their pictures of the table show who is there.
        if (!wasHere) changed(room);
        settle(room);
        try {
          if (!since().length && room.version === seenVersion) {
            await new Promise<void>((done) => {
              const waiter = {
                seat: me.seat,
                wake: () => {
                  clearTimeout(timer);
                  room.waiting.delete(waiter);
                  done();
                },
              };
              const timer = setTimeout(waiter.wake, longPoll);
              room.waiting.add(waiter);
              request.signal?.addEventListener("abort", waiter.wake, { once: true });
            });
          }
        } finally {
          me.listening--;
          me.seen = now();
        }
        // A seat given up, or a room forgotten, while this waited.
        if (rooms.get(code) !== room || player(room, me.seat) !== me) return json({ error: "Not your seat" }, 403);
        const got = since();
        return json({ messages: got.map((m) => m.message), next: got.length ? got[got.length - 1]!.n : after, v: room.version, view: room.version === seenVersion ? null : roomView(room, me.seat) });
      }

      return json({ error: "Not found" }, 404);
    },
  };
}
