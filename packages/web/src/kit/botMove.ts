// A computer player's move in a practice game, as a plain function of a plain job: the page calls it
// for a quick think, and the bot worker (bot.worker.ts) calls the very same function for a heavy one
// (see `TableGame.heavy`), so it doesn't matter which thread is asked.
import { QUICK_BUDGET, QUICK_STYLE, kitGame, type KitGameId, type ThinkBudget } from "@journey-to-code/games";
import { personaFor, styleFor, type Skill } from "@journey-to-code/rules";
import { learnHanded, type Handed } from "../golf/coursesApi";

/** One think: everything the move depends on. It crosses to the worker by structured clone, so it's plain data. */
export interface BotJob {
  game: KitGameId;
  state: unknown;
  seat: number;
  /** The bot's name: its persona, and so its style. */
  name: string;
  /** The table's level. */
  skill: Skill;
  /** How long the think may take, for a game that uses the time (see `TableGame.bot`). */
  budget?: ThinkBudget;
  /** Mini Golf courses and bowling lanes people made that the state is on: a worker's own copy of the game needs them handed over. */
  courses?: Handed[];
}

/** The move, exactly as the table has always asked for it. */
export function botMove(job: BotJob): Record<string, unknown> | null {
  learnHanded(job.courses);
  return kitGame(job.game)!.bot(job.state, job.seat, styleFor(personaFor(job.name).style, job.skill), undefined, job.budget);
}

/** A move that needs no thought, for a seat whose real think had to be given up on. */
export function quickMove(job: BotJob): Record<string, unknown> | null {
  learnHanded(job.courses);
  return kitGame(job.game)!.bot(job.state, job.seat, QUICK_STYLE, undefined, QUICK_BUDGET);
}
