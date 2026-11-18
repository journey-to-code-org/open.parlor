// A run, written down: its seed, the numbers it was played on, and every command given. The engine is
// deterministic, so that is enough to play it again anywhere: the admin app's inspector reads one back
// and steps through it. A record is text a player can copy and send ("bkr1." and a URL-safe base64 of
// the JSON), and nothing in it is believed until `decode` has checked it.
import { Battle, type Command, type Refusal } from "./engine.ts";
import { DEFAULT_TABLES, type Tables } from "./tables.ts";

export interface RunRecord {
  /** The seed. */
  seed: number;
  /** The version of the host's numbers the run was played on (0: the game's own). */
  numbers: number;
  commands: Command[];
}

const PREFIX = "bkr1.";
/** A run is at most a few hundred commands; this is only to stop a pasted novel. */
export const MAX_COMMANDS = 2000;

const whole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

function command(value: unknown): value is Command {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  switch (c.t) {
    case "play": return whole(c.uid) && (c.target === undefined || whole(c.target));
    case "move": return whole(c.uid) && whole(c.to);
    case "take": return whole(c.index);
    case "remove": return whole(c.uid);
    case "end":
    case "go": return true;
    default: return false;
  }
}

const bytes = (text: string) => new TextEncoder().encode(text);
const toBase64Url = (text: string) => btoa(String.fromCharCode(...bytes(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text: string) => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export function encode(record: RunRecord): string {
  return PREFIX + toBase64Url(JSON.stringify({ s: record.seed, n: record.numbers, c: record.commands }));
}

/** The record in some text, or what is wrong with it. */
export function decode(text: string): { record: RunRecord } | { problem: string } {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PREFIX)) return { problem: "That isn't a Back Room run: it should start with bkr1." };
  let parsed: any;
  try {
    parsed = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length)));
  } catch {
    return { problem: "That run is damaged: it can't be read." };
  }
  if (!parsed || !whole(parsed.s) || parsed.s < 0 || parsed.s > 0xffffffff) return { problem: "That run's seed isn't a number the game uses." };
  if (!whole(parsed.n) || parsed.n < 0) return { problem: "That run doesn't say which numbers it was played on." };
  if (!Array.isArray(parsed.c)) return { problem: "That run has no commands." };
  if (parsed.c.length > MAX_COMMANDS) return { problem: `That run has more than ${MAX_COMMANDS} commands.` };
  const bad = parsed.c.findIndex((c: unknown) => !command(c));
  if (bad >= 0) return { problem: `Command ${bad + 1} of that run isn't one the game has.` };
  return { record: { seed: parsed.s, numbers: parsed.n, commands: parsed.c as Command[] } };
}

/** One moment in a run: the state after a command (the first, "start", is before any). */
export interface Step {
  /** 0 for the start; then the number of the command just given. */
  n: number;
  command: Command | null;
  /** The command in words ("Play Wrench on Rat"); "Start" for the first step. */
  says: string;
  /** Whether the engine took it. A command it refused is the end of the replay. */
  ok: boolean;
  why?: Refusal;
  /** Two runs with the same hash here are in the same place with the same cards in the same order. */
  hash: number;
  phase: string;
  floor: number;
  floorName: string;
  turn: number;
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  hand: string[];
  foes: { name: string; hp: number }[];
  news: string[];
}

export interface Inspection {
  steps: Step[];
  /** The command the engine refused (so the record is not one this game could have made), or -1. */
  refused: number;
  /** Where it ended. */
  hash: number;
  phase: string;
}

/** Plays the record from its start on `tables`, writing down each moment. */
export function inspect(record: RunRecord, tables: Tables = DEFAULT_TABLES): Inspection {
  const battle = new Battle(record.seed, tables);
  const name = (def: string) => tables.cardById[def]?.name ?? def;
  /** A command in words, from the state it is given in. */
  const say = (given: Command): string => {
    const v = battle.view();
    const card = (uid: number) => {
      const found = [...v.hand, ...v.deck].find((c) => c.uid === uid);
      return found ? name(found.def) : `card ${uid}`;
    };
    switch (given.t) {
      case "play": return `Play ${card(given.uid)}${given.target === undefined ? "" : ` on ${v.foes.find((f) => f.uid === given.target)?.name ?? "a foe that is gone"}`}`;
      case "move": return `Move ${card(given.uid)} to place ${given.to + 1}`;
      case "end": return "End the turn";
      case "take": return `Take ${v.offers[given.index] ? name(v.offers[given.index]!) : `offer ${given.index + 1}`}`;
      case "remove": return `Put ${card(given.uid)} back`;
      case "go": return "Go to the next fight";
    }
  };
  const at = (n: number, given: Command | null, ok: boolean, why?: Refusal, says = "Start"): Step => {
    const v = battle.view();
    return { n, command: given, says, ok, why, hash: battle.hash(), phase: v.phase, floor: v.floor, floorName: v.floorName, turn: v.turn, hp: v.hp, maxHp: v.maxHp, block: v.block, energy: v.energy, hand: v.hand.map((c) => name(c.def)), foes: v.foes.map((f) => ({ name: f.name, hp: f.hp })), news: [...v.news] };
  };
  const steps = [at(0, null, true)];
  let refused = -1;
  for (let i = 0; i < record.commands.length; i++) {
    const given = record.commands[i]!;
    const says = say(given);
    const result = battle.command(given);
    if (!result.ok) {
      steps.push(at(i + 1, given, false, result.why, says));
      refused = i;
      break;
    }
    steps.push(at(i + 1, given, true, undefined, says));
  }
  const last = steps[steps.length - 1]!;
  return { steps, refused, hash: last.hash, phase: last.phase };
}
