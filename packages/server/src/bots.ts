// How the card room's computer players think: off the main thread when the game says a think is a
// heavy one (see `TableGame.heavy`), on it otherwise. The rooms kit asks `think` for every bot move;
// this decides where the work is done, and the answer is the same either way (see brain.ts).
//
// Quick thinks stay here on purpose. Handing a think to a worker costs a copy of the state there
// and of the move back, and a wait for the worker's reply: a fraction of a millisecond, which is
// several times what a card game's whole think takes. A search or a simulation takes tens of
// milliseconds or more, and is worth the trip.
import { availableParallelism } from "node:os";
import { isKitGame, type KitGameId, type ThinkBudget } from "@cardroom/games";
import type { Thinking } from "@spades/rooms/server";
import { builtFile, createBotPool, type BotPoolStats } from "./botpool.js";
import { quick, think, type ThinkJob } from "./brain.js";
import { gameOfState } from "./games.js";
import { kitHeavy } from "./kit.js";

export interface BotOptions {
  /** Worker threads to think in. 0 for none: every think on the main thread, as it always was. Default: from the machine (see `defaultWorkers`). */
  workers?: number;
  /** How long (ms) a game that thinks by the clock is told it may take over a move. Default 2000. */
  budgetMs?: number;
  /** The longest (ms) a think may run in a worker before it's abandoned for a quick move. Default: three times the budget. */
  ceilingMs?: number;
  /** Whether workers warm the engines up as they start. Default true. */
  warm?: boolean;
  /** The brain module the workers import, if not the card room's own (for tests: it must give the same answers as brain.ts). */
  brain?: URL | string;
}

export interface BotStats extends BotPoolStats {
  /** Thinks kept on the main thread because they're quick ones (or there are no workers). */
  light: number;
  budgetMs: number;
  ceilingMs: number;
}

export const DEFAULT_BUDGET_MS = 2000;

/**
 * Workers for this machine: one for each processor it may use but one (the main thread's), at least
 * one, at most four. One worker on a one-processor host is still worth having: the system shares the
 * processor between it and the main thread, so a long think no longer stops every table.
 */
export const defaultWorkers = () => Math.min(4, Math.max(1, availableParallelism() - 1));

/** What CARDROOM_BOT_WORKERS says: a number of workers, 0 (or "off") for none, or nothing for the machine's default. */
export function workersFrom(setting: string | undefined): number {
  const given = (setting ?? "").trim().toLowerCase();
  if (!given || given === "auto") return defaultWorkers();
  if (["off", "none", "no", "false"].includes(given)) return 0;
  const n = Number(given);
  return Number.isFinite(n) && n >= 0 ? Math.min(16, Math.floor(n)) : defaultWorkers();
}

type KitState = { game: KitGameId } & Record<string, unknown>;

export function createBots(options: BotOptions = {}) {
  const budgetMs = options.budgetMs && options.budgetMs > 0 ? options.budgetMs : DEFAULT_BUDGET_MS;
  const ceilingMs = options.ceilingMs && options.ceilingMs > 0 ? options.ceilingMs : budgetMs * 3;
  const budget: ThinkBudget = { ms: budgetMs };
  const size = options.workers ?? defaultWorkers();
  const pool = size > 0 ? createBotPool<ThinkJob>({ brain: options.brain ?? builtFile("brain"), local: { think, quick }, size, ceilingMs, warm: options.warm }) : null;
  let light = 0;

  return {
    /** A bot's move, as the rooms kit asks for it (see `RoomDefinition.think`): null at once when the seat has none. */
    think(state: unknown, seat: number, name: string, settings: unknown, thinking: Thinking): unknown | Promise<unknown> {
      const job: ThinkJob = { state, seat, name, settings, budget };
      if (!pool?.on || !isKitGame(gameOfState(state)) || !kitHeavy(state as KitState, seat)) {
        const move = think(job);
        if (move !== null) light += 1;
        return move;
      }
      return pool.think(job, thinking);
    },
    /** Resolves when the workers have started (thinks asked for sooner just wait). */
    get ready(): Promise<void> {
      return pool?.ready ?? Promise.resolve();
    },
    stats(): BotStats {
      const none: BotPoolStats = { workers: 0, queued: 0, running: 0, thinks: 0, averageMs: 0, worstMs: 0, worstWaitMs: 0, abandoned: 0, dropped: 0, onMain: 0, warmedMs: [] };
      return { ...(pool?.stats() ?? none), light, budgetMs, ceilingMs };
    },
    close: (): Promise<void> => pool?.close() ?? Promise.resolve(),
  };
}

export type Bots = ReturnType<typeof createBots>;
