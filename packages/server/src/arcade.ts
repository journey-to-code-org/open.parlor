// The arcade games that are played by giving orders (Tower of Ryan, Chip Stack), at a table on the
// server: everyone at it shares one game, live.
//
// A room is turn-based: it moves when somebody makes a move. An arcade game runs by the clock. So
// every move here first plays the game forward by however long the table waited for it (the room
// says, in `time.elapsed`), and only then carries out what the seat asked. When nobody asks for
// anything the room's deadline makes a move that asks for nothing (a beat), so the game still gets
// to its end. Nothing reads the clock: a replay of the move log, with its times, plays the same game.
//
// A page gets the whole game in its view and plays it forward itself between moves (the game is
// deterministic), so what people see is smooth however seldom the server speaks.
//
// Shitstorm is not here: it is steered every tick, and a room's moves are requests, not a stream.
import { arcadeGame, type ArcadeGame, type ArcadeGameId } from "@journey-to-code/games";
import { personaFor, styleFor, type TableSettings } from "@journey-to-code/rules";
import { RefusedMove, type RoomDefinition } from "@journey-to-code/rooms/server";

export const LIVE_ARCADE = ["bulwark", "chipstack"] as const;
export type LiveArcadeId = (typeof LIVE_ARCADE)[number];
export const isLiveArcade = (id: unknown): id is LiveArcadeId => LIVE_ARCADE.includes(id as LiveArcadeId);

export interface ArcadeOptions {
  game: LiveArcadeId;
  rules: { id: string; name: string } & Record<string, unknown>;
  seats: number;
}
export interface LiveState {
  game: LiveArcadeId;
  rules: ArcadeOptions["rules"];
  seats: number;
  /** The arcade game's own state. */
  arcade: unknown;
  /** Time waited that has not made a whole tick yet, in thousandths of a tick. Below zero when orders have been carried out ahead of the clock. */
  owed: number;
  /** When this state was reached (server time, ms), or 0 before the first move. */
  at: number;
  /** How many orders each seat has had carried out: how a page knows which of its own have landed. */
  done: number[];
}
export type LiveMove = { type: "beat" } | { type: "cmd"; inputs: unknown[] };
export interface LiveView extends Omit<LiveState, "rules"> {
  live: true;
  seat: number;
  /** Ticks a second. */
  rate: number;
  over: boolean;
}
export interface LiveSummary {
  rules: string;
  over: boolean;
  score: number;
  stage: string;
  scores: number[];
}

/** How often the game moves when nobody asks for anything, in ms. */
export const BEAT_MS = 1500;
/** The longest a table's wait counts for. A server that was down for an hour does not play an hour of the game in one go. */
const LONGEST_WAIT_MS = 5000;
/** The most orders taken in one move: a page saves up its taps and sends them together. */
export const MOST_ORDERS = 24;
/** How far ahead a computer player is asked, in ticks. */
const LOOK_AHEAD = 30;

const gameFor = (id: unknown): ArcadeGame<any, any, any> => {
  if (!isLiveArcade(id)) throw new Error(`No such live game: ${String(id)}`);
  return arcadeGame(id as ArcadeGameId)! as ArcadeGame<any, any, any>;
};

/** Options from a page: rules checked (else the game's first preset), seats in range. */
export function arcadeOptions(game: unknown, rules: unknown, seats: unknown): ArcadeOptions {
  const g = gameFor(game);
  const given = g.normalize(rules);
  const clean = g.validate(given).length === 0 ? given : g.presets[0];
  const n = Number(seats);
  return { game: g.id as LiveArcadeId, rules: { ...clean, name: String(clean.name ?? "").trim().slice(0, 30) || g.presets[0].name }, seats: Number.isInteger(n) && n >= g.seats.min && n <= g.seats.max ? n : g.seats.default };
}

/** Every seat holding still: the order it last gave has been carried out, and it gives no new one. */
const held = (game: ArcadeGame<any, any, any>, s: LiveState) => {
  const seen = (s.arcade as { seen?: number[] }).seen ?? [];
  return Array.from({ length: s.seats }, (_, seat) => ({ ...game.idle, n: seen[seat] ?? 0 }));
};

/** Play forward by a wait of `ms`. */
function wait(game: ArcadeGame<any, any, any>, s: LiveState, ms: number) {
  s.owed += Math.max(0, Math.min(ms, LONGEST_WAIT_MS)) * game.rate;
  while (s.owed >= 1000) {
    s.owed -= 1000;
    game.step(s.arcade, held(game, s));
  }
}

export const arcadeRoom: RoomDefinition<LiveState, LiveMove, LiveView, ArcadeOptions, LiveSummary> = {
  seats: (options) => arcadeOptions(options.game, options.rules, options.seats).seats,
  setup: (options, seed) => {
    const o = arcadeOptions(options.game, options.rules, options.seats);
    return { game: o.game, rules: o.rules, seats: o.seats, arcade: gameFor(o.game).newGame(o.rules, o.seats, seed), owed: 0, at: 0, done: Array.from({ length: o.seats }, () => 0) };
  },
  info: (options) => ({ game: options.game, rules: arcadeOptions(options.game, options.rules, options.seats).rules.name }),
  act: (before, seat, move, time) => {
    const game = gameFor(before.game);
    if (game.view(before.arcade).over) throw new RefusedMove("The game is over.");
    const s = structuredClone(before);
    wait(game, s, time.elapsed);
    s.at = time.at;
    const given = move && typeof move === "object" && move.type === "cmd" && Array.isArray(move.inputs) ? move.inputs.slice(0, MOST_ORDERS) : [];
    for (const one of given) {
      const order = game.input(one) as { cmd?: string };
      if (!order.cmd || order.cmd === "none") continue;
      // The order is this seat's next, whatever number the page gave it, and takes a tick of its own.
      const inputs = held(game, s);
      inputs[seat] = { ...order, n: inputs[seat]!.n + 1 };
      game.step(s.arcade, inputs);
      s.owed -= 1000;
      s.done[seat] = (s.done[seat] ?? 0) + 1;
    }
    return s;
  },
  view: (s, seat) => {
    const game = gameFor(s.game);
    return { live: true, game: s.game, seats: s.seats, seat, rate: game.rate, arcade: s.arcade, owed: s.owed, at: s.at, done: s.done, over: game.view(s.arcade).over };
  },
  // Everyone at the table is on the same side and sees the same thing.
  watch: (_s, views) => views[0],
  summary: (s) => {
    const game = gameFor(s.game);
    const sum = game.summary(s.arcade);
    const view = game.view(s.arcade);
    return { rules: s.rules.name, over: view.over, score: sum.score, stage: view.stage, scores: sum.scores };
  },
  finished: (s) => gameFor(s.game).view(s.arcade).over,
  // A computer player gives an order when its game's own bot would, a moment after the last move.
  botDelay: () => 700,
  bot: (s, seat, name, settings?: TableSettings) => {
    const game = gameFor(s.game);
    if (game.view(s.arcade).over) return null;
    // A game's bot thinks on its own beat, a few ticks in every second, and is idle on the rest. The
    // room asks whenever it likes, so the bot is asked on a copy of the game played a little way
    // forward, tick by tick, until it has something to say.
    const style = styleFor(personaFor(name).style, settings?.skill);
    const ahead = structuredClone(s);
    for (let i = 0; i < LOOK_AHEAD && !game.view(ahead.arcade).over; i++) {
      const order = game.bot(ahead.arcade, seat, style) as { cmd?: string };
      if (order.cmd && order.cmd !== "none") return { type: "cmd", inputs: [order] };
      game.step(ahead.arcade, held(game, ahead));
    }
    return null;
  },
  deadline: (s) => (gameFor(s.game).view(s.arcade).over ? null : { after: BEAT_MS, seat: 0, move: () => ({ type: "beat" }) }),
};
