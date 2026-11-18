// A month is its seed and the commands given in it, so a month can be written down and played again.
// This is what a challenge is built on: a friend's score is only believed once the page has played
// their commands through a second copy of the module and come to the same place.
import { G, PHASE, RESULT, type Sim } from "./sim.ts";

/** One command that was carried out: the tic it was given on, and the numbers `Sim.command` takes. */
export interface Logged {
  tic: number;
  kind: number;
  a: number;
  b: number;
}

/** Where a month ended. */
export interface Outcome {
  phase: number;
  day: number;
  /** Cents: cash and the stock at the day's wholesale prices. */
  worth: number;
  hash: number;
  /** False if the log was not one this page could have written: it ran backwards, or asked for something the store refused. */
  valid: boolean;
}

export const outcome = (sim: Sim, valid = true): Outcome => ({ phase: sim.store[G.PHASE], day: sim.store[G.DAY], worth: sim.store[G.WORTH], hash: sim.hash(), valid });

/**
 * Wraps a sim so that every command that does something is written down. A command that is refused
 * changes nothing (a test in market.test.ts holds the sim to that), so it need not be kept.
 */
export function recorder(sim: Sim) {
  let log: Logged[] = [];
  return {
    run(kind: number, a: number, b: number) {
      const result = sim.command(kind, a, b);
      if (result === RESULT.OK) log.push({ tic: sim.store[G.TIC], kind, a, b });
      return result;
    },
    /** What has been done so far. */
    entries: (): readonly Logged[] => log,
    clear() {
      log = [];
    },
  };
}

/** Plays a month from its seed through its commands to the end (or as far as it goes), and says where it ended. */
export function replay(sim: Sim, seed: number, log: readonly Logged[]): Outcome {
  sim.init(seed);
  for (const entry of log) {
    const now = sim.store[G.TIC];
    // A log that goes backwards, or on past the end, or does what the store refuses, is not one this page wrote.
    if (entry.tic < now) return outcome(sim, false);
    if (entry.tic > now) sim.step(entry.tic - now);
    if (sim.store[G.PHASE] !== PHASE.OPEN || sim.command(entry.kind, entry.a, entry.b) !== RESULT.OK) return outcome(sim, false);
  }
  // Nothing more is done: the rest of the month runs itself.
  while (sim.store[G.PHASE] === PHASE.OPEN) sim.step(sim.shape.ticsPerDay);
  return outcome(sim);
}
