// What a computer player's think is, for every game in the card room, as plain functions of a plain
// job: the bot pool's worker threads import this file and run `think`, and the main thread runs the
// very same functions when it has to answer itself (see botpool.ts and bots.ts). Nothing here keeps
// anything between calls that changes an answer, so it doesn't matter which thread is asked.
import { QUICK_BUDGET, isKitGame, type KitGameId, type ThinkBudget } from "@journey-to-code/games";
import { mulberry32, type TableSettings } from "@journey-to-code/rules";
import { gameOfState, tableRoom } from "./games.js";
import { kitBot, warmSports } from "./kit.js";

/** One think: everything the move depends on. It crosses to a worker by structured clone, so it's plain data. */
export interface ThinkJob {
  /** The game's state; which game it is is written in it. */
  state: unknown;
  seat: number;
  /** The bot's name: its persona, and so its style. */
  name: string;
  /** The table's settings (how well the bots play). */
  settings: unknown;
  /** How long the think may take, for a game that uses the time (see `TableGame.bot`). */
  budget?: ThinkBudget;
  /**
   * For a think that has to be repeatable (tests, chasing a bug): the dice are rolled from this seed
   * instead of `Math.random`, so the same job gives the same move on any thread. Never set in play.
   */
  seed?: number;
}

type KitState = { game: KitGameId } & Record<string, unknown>;

/** Run `fn` with `Math.random` rolling from a seed. Nothing else runs meanwhile: a think never waits. */
function seeded<T>(seed: number | undefined, fn: () => T): T {
  if (seed === undefined) return fn();
  const real = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/** The move: exactly what the room's `bot` gives for this state, seat, name and settings. */
export function think(job: ThinkJob): unknown {
  return seeded(job.seed, () =>
    isKitGame(gameOfState(job.state))
      ? kitBot(job.state as KitState, job.seat, job.name, job.settings as TableSettings | null, job.budget)
      : (tableRoom.bot!(job.state as never, job.seat, job.name, job.settings) ?? null),
  );
}

/**
 * A move that needs no thought, for a seat whose real think was abandoned: the game's bot at no
 * skill with next to no time. Spades and Palace think quickly whatever they're asked.
 */
export function quick(job: ThinkJob): unknown {
  return seeded(job.seed, () =>
    isKitGame(gameOfState(job.state))
      ? kitBot(job.state as KitState, job.seat, job.name, job.settings as TableSettings | null, QUICK_BUDGET, true)
      : (tableRoom.bot!(job.state as never, job.seat, job.name, job.settings) ?? null),
  );
}

/** Get the engines hot (see `warmSports`). Each thread has its own copy of them, and its own cold start. */
export function warm(): number {
  return warmSports();
}
