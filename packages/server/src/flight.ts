// Shitstorm at a table, live: the arcade game that is steered every tick.
//
// A room's moves are requests, and a ship can't be flown by request. So the table is two things.
// The room does what rooms do: seats, invitations, computer players, the start, and at the end the
// result. The flying happens beside it, on a socket: the server plays the one real game, sixty ticks
// a second, with whatever each seat's controls were last said to be doing, and tells every page at
// the table what the controls did on each tick. The game is deterministic, so a page that starts
// from the game as it stood when it joined and is told every tick's controls plays the very same
// game, a moment behind. Nothing but controls crosses the wire after that first picture.
//
// When the game is over its result is left where the room's deadline finds it, and the next beat
// of the room writes it into the room's own log. A game the server lost (a restart) can't be picked
// up again: the room gives up on it after a while.
import { arcadeGame, type ArcadeGame } from "@journey-to-code/games";
import { personaFor, styleFor, type TableSettings } from "@journey-to-code/rules";
import { RefusedMove, type RoomDefinition } from "@journey-to-code/rooms/server";

export const FLIGHT_GAMES = ["skyfire"] as const;
export type FlightGameId = (typeof FLIGHT_GAMES)[number];
export const isFlight = (id: unknown): id is FlightGameId => FLIGHT_GAMES.includes(id as FlightGameId);

export interface FlightOptions {
  game: FlightGameId;
  rules: { id: string; name: string } & Record<string, unknown>;
  seats: number;
}
export interface FlightResult {
  score: number;
  stage: string;
  scores: number[];
  ticks: number;
}
export interface FlightState {
  game: FlightGameId;
  rules: FlightOptions["rules"];
  seats: number;
  seed: number;
  /** What the server's own end-of-game move has to say, so that nobody at the table can make it. Never in a view. */
  key: string;
  /** Ms the room has waited for the game, all told. */
  waited: number;
  result: FlightResult | null;
}
export type FlightMove = { type: "beat" } | { type: "end"; key: string; result: FlightResult };
export interface FlightView {
  live: true;
  /** Played over a socket, not through the room's moves. */
  stream: true;
  game: FlightGameId;
  seats: number;
  seat: number;
  over: boolean;
  result: FlightResult | null;
}

/** How often the room looks for the game's result, in ms. */
export const FLIGHT_BEAT_MS = 2000;
/** How long the room waits for a game before giving up on it. */
const GIVE_UP_MS = 2 * 60 * 60 * 1000;

const gameFor = (id: unknown): ArcadeGame<any, any, any> => {
  if (!isFlight(id)) throw new Error(`No such live game: ${String(id)}`);
  return arcadeGame(id)! as ArcadeGame<any, any, any>;
};
export function flightOptions(game: unknown, rules: unknown, seats: unknown): FlightOptions {
  const g = gameFor(game);
  const given = g.normalize(rules);
  const clean = g.validate(given).length === 0 ? given : g.presets[0];
  const n = Number(seats);
  return { game: g.id as FlightGameId, rules: { ...clean, name: String(clean.name ?? "").trim().slice(0, 30) || g.presets[0].name }, seats: Number.isInteger(n) && n >= g.seats.min && n <= g.seats.max ? n : g.seats.default };
}
const keyOf = (seed: number) => (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0).toString(36) + (Math.imul(seed + 0x7f4a7c15, 0xc2b2ae35) >>> 0).toString(36);

/** Results of games that have ended, waiting for their room's next beat. */
const results = new Map<string, FlightResult>();
const whole = (n: unknown) => (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0);

export const flightRoom: RoomDefinition<FlightState, FlightMove, FlightView, FlightOptions, { rules: string; over: boolean; score: number; stage: string; scores: number[] }> = {
  seats: (options) => flightOptions(options.game, options.rules, options.seats).seats,
  setup: (options, seed) => {
    const o = flightOptions(options.game, options.rules, options.seats);
    return { game: o.game, rules: o.rules, seats: o.seats, seed, key: keyOf(seed), waited: 0, result: null };
  },
  info: (options) => ({ game: options.game, rules: flightOptions(options.game, options.rules, options.seats).rules.name }),
  act: (s, _seat, move, time) => {
    if (s.result) throw new RefusedMove("The game is over.");
    if (move?.type === "end" && move.key === s.key && move.result && typeof move.result === "object") {
      const r = move.result;
      return { ...s, result: { score: whole(r.score), stage: String(r.stage ?? "").slice(0, 40), scores: Array.from({ length: s.seats }, (_, i) => whole(r.scores?.[i])), ticks: whole(r.ticks) } };
    }
    if (move?.type !== "beat") throw new RefusedMove("This game is flown, not moved.");
    const waited = s.waited + Math.max(0, time.elapsed);
    return waited < GIVE_UP_MS ? { ...s, waited } : { ...s, waited, result: { score: 0, stage: "Lost in the storm", scores: Array.from({ length: s.seats }, () => 0), ticks: 0 } };
  },
  view: (s, seat) => ({ live: true, stream: true, game: s.game, seats: s.seats, seat, over: !!s.result, result: s.result }),
  watch: (_s, views) => views[0],
  summary: (s) => ({ rules: s.rules.name, over: !!s.result, score: s.result?.score ?? 0, stage: s.result?.stage ?? "In the air", scores: s.result?.scores ?? Array.from({ length: s.seats }, () => 0) }),
  finished: (s) => !!s.result,
  // The computer players fly in the game itself; the room has no moves for them.
  bot: () => null,
  deadline: (s) =>
    s.result
      ? null
      : {
          after: FLIGHT_BEAT_MS,
          seat: 0,
          move: () => {
            const result = results.get(s.key);
            return result ? { type: "end", key: s.key, result } : { type: "beat" };
          },
        },
};

/** Somebody at a table, as the game sees them: somewhere to send text. */
export interface Flyer {
  send(text: string): void;
}
interface Session {
  game: ArcadeGame<any, any, any>;
  key: string;
  state: unknown;
  tick: number;
  /** What each seat's controls are doing. */
  inputs: unknown[];
  /** What a person's controls were last said to be doing; a computer player's seat has its style instead. */
  asked: unknown[];
  bots: (ReturnType<typeof styleFor> | null)[];
  flyers: Set<Flyer>;
  over: boolean;
  /** Ms of play owed, and when that was last worked out; when the last person left. */
  owed: number;
  last: number;
  emptySince: number;
}

/** A session with nobody on it this long is ended where it stands. */
const EMPTY_FOR_MS = 5 * 60 * 1000;
/** After a stall the game carries on from where it was, rather than racing to catch up. */
const MOST_OWED_MS = 250;

/**
 * The games in the air. `start` one when its room starts; `join` puts a page on it. With `every`
 * (ms) the games play by the clock; without, only when `advance` is called (tests).
 */
export function createFlights(options: { every?: number; now?: () => number } = {}) {
  const now = options.now ?? (() => performance.now());
  const sessions = new Map<string, Session>();
  const ended = new Map<string, ReturnType<typeof setTimeout>>();

  function finish(id: string, s: Session) {
    if (s.over) return;
    s.over = true;
    const sum = s.game.summary(s.state);
    results.set(s.key, { score: sum.score, stage: s.game.view(s.state).stage, scores: sum.scores, ticks: sum.ticks });
    for (const f of s.flyers) f.send(JSON.stringify({ over: true }));
    // Kept a minute for a page that is late to hear; the result is the room's from its next beat.
    const gone = setTimeout(() => {
      sessions.delete(id);
      ended.delete(id);
      results.delete(s.key);
    }, 60_000);
    gone.unref?.();
    ended.set(id, gone);
  }

  /** Play `ticks` ticks of a game and tell everyone on it what every seat's controls did on each. */
  function advance(id: string, ticks: number) {
    const s = sessions.get(id);
    if (!s || s.over || ticks <= 0) return;
    const from = s.tick;
    const frames: [number, unknown][][] = [];
    for (let i = 0; i < ticks && !s.over; i++) {
      const frame: [number, unknown][] = [];
      for (let seat = 0; seat < s.inputs.length; seat++) {
        const next = s.bots[seat] ? s.game.bot(s.state, seat, s.bots[seat]!) : s.asked[seat];
        if (JSON.stringify(next) !== JSON.stringify(s.inputs[seat])) {
          s.inputs[seat] = next;
          frame.push([seat, next]);
        }
      }
      s.game.step(s.state, s.inputs);
      s.tick++;
      frames.push(frame);
      if (s.game.view(s.state).over) {
        const text = JSON.stringify({ t: from, f: frames });
        for (const f of s.flyers) f.send(text);
        return finish(id, s);
      }
    }
    const text = JSON.stringify({ t: from, f: frames });
    for (const f of s.flyers) f.send(text);
  }

  const timer = options.every
    ? setInterval(() => {
        const at = now();
        for (const [id, s] of sessions) {
          if (s.over) continue;
          // Nobody there: the game waits for them, for a while.
          if (!s.flyers.size) {
            s.last = at;
            if (at - s.emptySince > EMPTY_FOR_MS) finish(id, s);
            continue;
          }
          s.owed = Math.min(MOST_OWED_MS, s.owed + (at - s.last));
          s.last = at;
          const step = 1000 / s.game.rate;
          const ticks = Math.floor(s.owed / step);
          s.owed -= ticks * step;
          advance(id, ticks);
        }
      }, options.every)
    : null;
  timer?.unref?.();

  return {
    /** A room has started: put its game in the air. Seats that are computer players fly themselves. */
    start(id: string, state: FlightState, seats: { name: string | null; bot: boolean }[], settings?: TableSettings | null) {
      if (sessions.has(id)) return;
      const game = gameFor(state.game);
      const at = now();
      sessions.set(id, {
        game,
        key: state.key,
        state: game.newGame(state.rules, state.seats, state.seed),
        tick: 0,
        inputs: Array.from({ length: state.seats }, () => game.idle),
        asked: Array.from({ length: state.seats }, () => game.idle),
        bots: Array.from({ length: state.seats }, (_, i) => (seats[i]?.bot ? styleFor(personaFor(seats[i]!.name ?? "Bot").style, settings?.skill) : null)),
        flyers: new Set(),
        over: false,
        owed: 0,
        last: at,
        emptySince: at,
      });
    },
    /**
     * Put a page on a game: it is sent the game as it stands, and from then on every tick. `seat`
     * is the seat it flies, or null to watch. Null when there is no such game in the air.
     */
    join(id: string, seat: number | null, flyer: Flyer): { input(given: unknown): void; leave(): void } | null {
      const s = sessions.get(id);
      if (!s) return null;
      flyer.send(JSON.stringify({ snap: s.state, tick: s.tick, inputs: s.inputs, seat, over: s.over }));
      s.flyers.add(flyer);
      if (s.flyers.size === 1) s.last = now();
      return {
        input: (given) => {
          if (seat !== null && seat >= 0 && seat < s.asked.length && !s.bots[seat] && !s.over) s.asked[seat] = s.game.input(given);
        },
        leave: () => {
          s.flyers.delete(flyer);
          // Nobody is holding this seat's controls any more.
          if (seat !== null && !s.bots[seat]) s.asked[seat] = s.game.idle;
          if (!s.flyers.size) s.emptySince = now();
        },
      };
    },
    advance,
    has: (id: string) => sessions.has(id),
    close() {
      if (timer) clearInterval(timer);
      for (const t of ended.values()) clearTimeout(t);
      sessions.clear();
    },
  };
}
export type Flights = ReturnType<typeof createFlights>;
