// A challenge: "here is a month, and what I made of it", small enough to be a link.
//
// It is the seed, who is asking, where their month ended, and every command they gave, written as
// bytes and then as base64url. Whoever opens it plays the same market, and the page checks the claim
// first by playing the commands through a second copy of the module (see replay.ts): a score that
// does not come out of its own commands is thrown away and the seed is kept.
import { PHASE } from "./sim.ts";
import { replay, type Logged, type Outcome } from "./replay.ts";
import type { Sim } from "./sim.ts";

export interface Challenge {
  seed: number;
  /** Who is asking, as they gave it. At most `NAME` characters. */
  name: string;
  phase: number;
  day: number;
  worth: number;
  /** Empty when the month was too busy to fit in a link: the score is then only a claim. */
  log: Logged[];
}

export const NAME = 24;
/** The most commands a challenge may carry, and the most characters its link may be. A month played by hand is a few hundred commands. */
export const MAX_LOG = 5000;
export const MAX_CHARS = 12_000;
const VERSION = 1;

function put(bytes: number[], value: number) {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`a challenge keeps only whole numbers from zero up, not ${value}`);
  while (value >= 0x80) {
    bytes.push((value % 0x80) | 0x80);
    value = Math.floor(value / 0x80);
  }
  bytes.push(value);
}

class Reader {
  at = 0;
  constructor(private bytes: Uint8Array) {}
  byte() {
    const value = this.bytes[this.at++];
    if (value === undefined) throw new RangeError("the challenge stops short");
    return value;
  }
  number() {
    let value = 0;
    for (let shift = 1; ; shift *= 0x80) {
      const byte = this.byte();
      value += (byte & 0x7f) * shift;
      if (!(byte & 0x80)) return value;
      if (shift > 2 ** 42) throw new RangeError("a number in the challenge is too big");
    }
  }
  text(length: number) {
    if (this.at + length > this.bytes.length) throw new RangeError("the challenge stops short");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(this.bytes.subarray(this.at, this.at + length));
    this.at += length;
    return text;
  }
  get done() {
    return this.at === this.bytes.length;
  }
}

/** The name as it may be shown: no longer than `NAME`, no control characters, and never nothing. */
export const cleanName = (name: string) => [...name.replace(/[\p{C}\p{Z}]+/gu, " ").trim()].slice(0, NAME).join("") || "A friend";

export function encode(challenge: Challenge): string {
  const log = challenge.log.length <= MAX_LOG ? challenge.log : [];
  const bytes: number[] = [VERSION];
  put(bytes, challenge.seed);
  put(bytes, challenge.phase);
  put(bytes, challenge.day);
  put(bytes, challenge.worth);
  const name = new TextEncoder().encode(cleanName(challenge.name));
  put(bytes, name.length);
  bytes.push(...name);
  put(bytes, log.length);
  let tic = 0;
  for (const entry of log) {
    put(bytes, entry.tic - tic);
    tic = entry.tic;
    put(bytes, entry.kind);
    put(bytes, entry.a);
    put(bytes, entry.b);
  }
  let binary = "";
  for (let at = 0; at < bytes.length; at += 4096) binary += String.fromCharCode(...bytes.slice(at, at + 4096));
  const text = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  // Too long for a link: the same challenge without the commands, which can still be played against.
  return text.length > MAX_CHARS && log.length ? encode({ ...challenge, log: [] }) : text;
}

/** Reads a challenge back. Throws if it is not one, or is cut short, or asks for more than a month could hold. */
export function decode(text: string): Challenge {
  if (text.length > MAX_CHARS * 2) throw new RangeError("the challenge is too long");
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const reader = new Reader(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  if (reader.byte() !== VERSION) throw new RangeError("a challenge from another version of the game");
  const seed = reader.number();
  const phase = reader.number();
  const day = reader.number();
  const worth = reader.number();
  const name = reader.text(Math.min(reader.number(), NAME * 4));
  const count = reader.number();
  if (seed < 1 || seed > 0xffffffff || phase > PHASE.BROKE || day > 99 || count > MAX_LOG) throw new RangeError("not a challenge this game made");
  const log: Logged[] = [];
  let tic = 0;
  for (let i = 0; i < count; i++) {
    tic += reader.number();
    log.push({ tic, kind: reader.number(), a: reader.number(), b: reader.number() });
  }
  if (!reader.done) throw new RangeError("the challenge goes on past its end");
  return { seed, name: cleanName(name), phase, day, worth, log };
}

/** Is it so? Plays the commands from the seed on `sim` (a copy of the module that nothing else is using) and compares. */
export function verify(sim: Sim, challenge: Challenge): { ok: boolean; outcome: Outcome | null } {
  if (!challenge.log.length) return { ok: false, outcome: null };
  const outcome = replay(sim, challenge.seed, challenge.log);
  return { ok: outcome.valid && outcome.phase === challenge.phase && outcome.worth === challenge.worth && outcome.day === challenge.day, outcome };
}
