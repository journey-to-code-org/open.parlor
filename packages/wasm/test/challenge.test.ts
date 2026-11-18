// A challenge is a month written down: its seed, who asked, how it ended, and every command given.
// These check the writing and reading of one, and that playing the commands again gets to the same
// place (which is what lets a stranger's score be believed).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { MAX_CHARS, MAX_LOG, NAME, cleanName, decode, encode, verify, type Challenge } from "../src/market/challenge.ts";
import { outcome, recorder, replay } from "../src/market/replay.ts";
import { COMMAND, G, P, PHASE, RESULT, loadSim, type Sim } from "../src/market/sim.ts";

let module: WebAssembly.Module;
beforeAll(async () => {
  module = await WebAssembly.compile(readFileSync(join(import.meta.dirname, "../games/market/market.wasm")));
});
const fresh = async () => loadSim(module);

/** A month played by a simple stocker, hour by hour, through a recorder, as the page would. */
async function played(seed: number, percent = 160) {
  const sim = await fresh();
  sim.init(seed);
  const rec = recorder(sim);
  for (let hour = 0; sim.store[G.PHASE] === PHASE.OPEN; hour++) {
    if (hour === 0) {
      for (let shelf = 0; shelf < 8; shelf++) rec.run(COMMAND.MARKUP, shelf, percent);
      rec.run(COMMAND.TRAP, 0, 0);
      rec.run(COMMAND.TRAP, 0, 0);
    }
    if (hour % 24 === 3) {
      for (let part = 0; part < 48; part++) {
        const have = sim.part(part, P.STOCK) + sim.part(part, P.INBOUND);
        const want = Math.ceil((sim.part(part, P.RATE) * sim.shape.demandPercent) / 1000) + 1;
        if (have < want) rec.run(COMMAND.BUY, part, want - have);
      }
    }
    if (hour === 40) rec.run(COMMAND.AUTO, 36, 20 + 30 * 1000);
    sim.step(10);
  }
  return { sim, log: [...rec.entries()], result: outcome(sim) };
}
const asked = (game: Awaited<ReturnType<typeof played>>, seed: number, name = "Delbie"): Challenge => ({ seed, name, phase: game.result.phase, day: game.result.day, worth: game.result.worth, log: game.log });

describe("playing a month again", () => {
  test("its commands, played from its seed, end where it ended, to the last bit", async () => {
    const game = await played(11);
    expect(game.log.length).toBeGreaterThan(20);
    const again = replay(await fresh(), 11, game.log);
    expect(again).toEqual(game.result);
  });

  test("a refused command is not kept, so the log has only what did something", async () => {
    const sim = await fresh();
    sim.init(3);
    const rec = recorder(sim);
    expect(rec.run(COMMAND.BUY, 31, 150)).toBe(RESULT.NO_CASH);
    expect(rec.run(COMMAND.BUY, 99, 1)).toBe(RESULT.BAD);
    expect(rec.entries()).toEqual([]);
    expect(rec.run(COMMAND.BUY, 0, 2)).toBe(RESULT.OK);
    expect(rec.entries()).toEqual([{ tic: 0, kind: COMMAND.BUY, a: 0, b: 2 }]);
    rec.clear();
    expect(rec.entries()).toEqual([]);
  });

  test("a different command is a different month", async () => {
    const game = await played(11);
    const changed = game.log.map((entry, i) => (i === 3 ? { ...entry, b: entry.b === 200 ? 125 : 200 } : entry));
    expect(replay(await fresh(), 11, changed).hash).not.toBe(game.result.hash);
  });

  test("a log that runs backwards, or asks for what the store would refuse, is not valid", async () => {
    const sim = await fresh();
    expect(replay(sim, 5, [{ tic: 50, kind: COMMAND.TRAP, a: 0, b: 0 }, { tic: 10, kind: COMMAND.TRAP, a: 0, b: 0 }]).valid).toBe(false);
    expect(replay(sim, 5, [{ tic: 0, kind: COMMAND.BUY, a: 31, b: 150 }]).valid).toBe(false);
    expect(replay(sim, 5, [{ tic: 0, kind: 77, a: 0, b: 0 }]).valid).toBe(false);
  });

  test("an empty log is a month where nothing was done", async () => {
    const sim = await fresh();
    const idle = replay(sim, 5, []);
    expect(idle.valid).toBe(true);
    expect(idle.phase).not.toBe(PHASE.OPEN);
  });
});

describe("a challenge as a link", () => {
  test("writes and reads back what it was given", async () => {
    const game = await played(21);
    const text = encode(asked(game, 21, "Delbie"));
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decode(text)).toEqual(asked(game, 21, "Delbie"));
  });

  test("a whole month by a careful player fits in a link", async () => {
    const game = await played(21);
    expect(encode(asked(game, 21)).length).toBeLessThan(MAX_CHARS / 2);
  });

  test("names are kept to what can be shown", () => {
    expect(cleanName("  Mikey\u0007\n  N  ")).toBe("Mikey N");
    expect(cleanName("")).toBe("A friend");
    expect(cleanName("x".repeat(100))).toHaveLength(NAME);
    expect(cleanName("🙂".repeat(40))).toBe("🙂".repeat(NAME));
    const wide = decode(encode({ seed: 1, name: "<img src=x onerror=alert(1)>", phase: 1, day: 28, worth: 5, log: [] }));
    // Text, not markup: the page puts it on the screen as text. It is only kept short.
    expect(wide.name.length).toBeLessThanOrEqual(NAME);
  });

  test("a month with too many commands for a link goes without them, and says so by having none", () => {
    const log = Array.from({ length: MAX_LOG + 1 }, (_, i) => ({ tic: i, kind: COMMAND.PRICE, a: i % 48, b: 500 + i }));
    expect(decode(encode({ seed: 9, name: "Busy", phase: 1, day: 28, worth: 1234, log })).log).toEqual([]);
  });

  test("rubbish is refused rather than believed", () => {
    for (const bad of ["", "!!!", "AAAA", "Ag", btoa("\u0001"), btoa("\u0002abc")]) expect(() => decode(bad)).toThrow();
    const good = encode({ seed: 4, name: "A", phase: 1, day: 28, worth: 99, log: [{ tic: 5, kind: 1, a: 2, b: 3 }] });
    expect(() => decode(good.slice(0, -2))).toThrow();
    expect(() => decode(good + "AA")).toThrow();
    expect(() => decode("A".repeat(MAX_CHARS * 2 + 1))).toThrow();
    // A seed of nothing is not a month.
    expect(() => decode(encode({ seed: 4, name: "A", phase: 1, day: 28, worth: 99, log: [] }).replace(/^AQ./, "AQA"))).toThrow();
  });

  test("it cannot say a number the sim could not have", () => {
    expect(() => encode({ seed: -1, name: "A", phase: 1, day: 1, worth: 1, log: [] })).toThrow();
    expect(() => encode({ seed: 1, name: "A", phase: 1, day: 1, worth: 1.5, log: [] })).toThrow();
  });
});

describe("believing a score", () => {
  test("one that comes out of its own commands is believed", async () => {
    const game = await played(31);
    const checked = verify(await fresh(), asked(game, 31));
    expect(checked.ok).toBe(true);
    expect(checked.outcome?.worth).toBe(game.result.worth);
  });

  test("one that came by a link is believed the same", async () => {
    const game = await played(31);
    expect(verify(await fresh(), decode(encode(asked(game, 31)))).ok).toBe(true);
  });

  test("a score made bigger is not", async () => {
    const game = await played(31);
    const claim = asked(game, 31);
    expect(verify(await fresh(), { ...claim, worth: claim.worth + 100 }).ok).toBe(false);
    expect(verify(await fresh(), { ...claim, phase: PHASE.FINISHED === claim.phase ? PHASE.BROKE : PHASE.FINISHED }).ok).toBe(false);
  });

  test("commands from another month are not", async () => {
    const game = await played(31);
    expect(verify(await fresh(), { ...asked(game, 31), seed: 32 }).ok).toBe(false);
  });

  test("a score with no commands behind it is a claim, not a proof", async () => {
    const game = await played(31);
    const checked = verify(await fresh(), { ...asked(game, 31), log: [] });
    expect(checked.ok).toBe(false);
    expect(checked.outcome).toBeNull();
  });

  test("checking leaves no mark: the copy is only used, and a second check says the same", async () => {
    const game = await played(31);
    const copy: Sim = await fresh();
    const claim = asked(game, 31);
    expect(verify(copy, claim).ok).toBe(true);
    expect(verify(copy, claim).ok).toBe(true);
  });
});
