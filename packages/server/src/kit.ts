// The games on the kit, card games, board games and table sports alike, in the parlor: one room definition
// serves them all. A room's options say which game, its house rules and how many seats. Nothing
// here looks inside a view, so it doesn't matter what a game's table is made of.
import { kitGame, QUICK_STYLE, SPORT_GAMES, type BoardView, type KitGameId, type KitSummary, type KitView, type SportView, type TableGame, type ThinkBudget } from "@journey-to-code/games";
import { paceDelay, personaFor, styleFor, type TableSettings } from "@journey-to-code/rules";
import type { Deadline, RoomDefinition, TableInfo } from "@journey-to-code/rooms/server";

export interface KitOptions {
  game: KitGameId;
  rules: { id: string; name: string } & Record<string, unknown>;
  seats: number;
}

/** Options from a page or a house: rules checked (else the game's first preset), seats in range. */
export function kitOptions(game: TableGame<any, any, any, any>, rules: unknown, seats: unknown): KitOptions {
  const given = game.normalize(rules);
  const clean = game.validate(given).length === 0 ? given : game.presets[0];
  const n = Number(seats);
  const fits = Number.isInteger(n) && n >= game.seats.min && n <= game.seats.max;
  return {
    game: game.id,
    rules: { ...clean, name: String(clean.name ?? "").trim().slice(0, 30) || game.presets[0].name },
    seats: game.teams ? 4 : fits ? n : game.seats.default,
  };
}

/**
 * How long past a game's own clock the server waits before it makes the timeout move, in ms. A shot
 * clock counts from when you can see the other player's move, and that takes a moment to reach your
 * screen, as your answer does to get back; without this a move made with a blink to spare would
 * lose to the clock on a slow connection. Pages count down to the time without it.
 */
export const GAME_CLOCK_GRACE_MS = 400;

/**
 * A game's own clock (see `TableGame.deadline`) as a room deadline. A computer player's seat has
 * none: bots keep their own time, and `botDelay` below keeps them inside it. A `strict` clock is
 * the exception (a chess clock): it is part of the game for whoever is in the seat, so it is
 * armed on a computer player too, which loses on time if its move doesn't come.
 */
function gameDeadline(state: { game: KitGameId } & Record<string, unknown>, table: TableInfo): Deadline<Record<string, unknown>> | null {
  const due = gameFor(state.game).deadline?.(state);
  if (!due || !table.seats[due.seat] || (table.seats[due.seat]!.bot && !due.strict)) return null;
  return { after: due.after, grace: GAME_CLOCK_GRACE_MS, seat: due.seat, move: () => due.move };
}

/** A computer player on the game's own clock moves well inside it, whatever the table's pace. */
function insideTheClock(state: { game: KitGameId } & Record<string, unknown>, seat: number, delay: number): number {
  const due = gameFor(state.game).deadline?.(state);
  return due && due.seat === seat ? Math.min(delay, Math.round(due.after * 0.6)) : delay;
}

const gameFor = (id: unknown) => {
  const game = kitGame(id);
  if (!game) throw new Error(`No such game: ${String(id)}`);
  return game;
};

export const kitRoom: RoomDefinition<{ game: KitGameId } & Record<string, unknown>, Record<string, unknown>, KitView | BoardView | SportView, KitOptions, KitSummary> = {
  seats: (options) => kitOptions(gameFor(options.game), options.rules, options.seats).seats,
  setup: (options, seed) => {
    const game = gameFor(options.game);
    const o = kitOptions(game, options.rules, options.seats);
    return game.newGame(o.rules, o.seats, seed);
  },
  // A game is told how long the move took: one that keeps time in its state (offers.ts) needs it.
  act: (state, seat, move, time) => gameFor(state.game).apply(state, seat, move, time),
  view: (state, seat) => gameFor(state.game).view(state, seat),
  summary: (state) => gameFor(state.game).summary(state),
  finished: (state) => gameFor(state.game).summary(state).over,
  botDelay: (state, seat, name, settings?: TableSettings) =>
    gameFor(state.game).reactionTime?.(state, seat, styleFor(personaFor(name).style, settings?.skill)) ??
    insideTheClock(state, seat, paceDelay(settings?.pace ?? "natural", () => Math.round(gameFor(state.game).thinkingTime(state, seat) * personaFor(name).pace * (0.8 + Math.random() * 0.5)))),
  bot: (state, seat, name, settings?: TableSettings) => kitBot(state, seat, name, settings),
  // The game's own clock, if it has one running (a shot clock). The table's turn timer is added in games.ts.
  deadline: gameDeadline,
};

type KitState = { game: KitGameId } & Record<string, unknown>;

/**
 * A computer player's move: the game's own bot, playing in its persona's style or at the table's
 * level. `budget` is how long it may think, for a game that uses the time (see `TableGame.bot`).
 * `quick` asks for a move that takes no thought at all, whoever the bot is: what a seat plays when
 * its real think had to be given up on.
 */
export function kitBot(state: KitState, seat: number, name: string, settings?: TableSettings | null, budget?: ThinkBudget, quick = false): Record<string, unknown> | null {
  return gameFor(state.game).bot(state, seat, quick ? QUICK_STYLE : styleFor(personaFor(name).style, settings?.skill), undefined, budget);
}

/** Whether that move is worth working out off the main thread (see `TableGame.heavy`). */
export const kitHeavy = (state: KitState, seat: number): boolean => gameFor(state.game).heavy?.(state, seat) ?? false;

/**
 * The move the turn timer makes for a person who has run out of time: the computer player's move
 * on the board. Where a game's computer player would do something else first (answer an offer),
 * the game says what that move is (`TableGame.play`); nobody's offer is answered for them. It is
 * worked out on the main thread, there and then, so a game that thinks by the clock is given a short
 * `budget` for it.
 */
export function kitTimeoutMove(state: { game: KitGameId } & Record<string, unknown>, seat: number, name: string, settings?: TableSettings, budget?: ThinkBudget): Record<string, unknown> | null {
  const game = gameFor(state.game);
  return (game.play ?? game.bot).call(game, state, seat, styleFor(personaFor(name).style, settings?.skill), undefined, budget);
}

/** Ms of the wait for the next move that have gone by already, over an offer and its answer (`TableGame.spent`). */
export const kitSpent = (state: { game: KitGameId } & Record<string, unknown>): number => gameFor(state.game).spent?.(state) ?? 0;

/**
 * The table sports simulate their shots, and a computer player simulates hundreds to choose one.
 * That is quick once the JavaScript engine has warmed to it and slow the first time, so the server
 * does the first time itself as it starts. Returns how long it took, in ms.
 */
export function warmSports(): number {
  const began = performance.now();
  for (const game of SPORT_GAMES) game.warmUp?.();
  return Math.round(performance.now() - began);
}
