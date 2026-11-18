// A run written down and played back: the record is what the admin's inspector reads, so it has to
// say the same thing the run did, refuse what isn't a run, and stop where the game would have.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/battler/engine.ts";
import { decode, encode, inspect, MAX_COMMANDS, type RunRecord } from "../src/battler/record.ts";
import { tune } from "../src/battler/tables.ts";
import { playRun } from "./battler-bots.ts";

/** A whole run a bot played, as a record. */
function recorded(seed = 7, numbers = 0): RunRecord {
  const { given } = playRun(seed, { deckBuild: true });
  return { seed, numbers, commands: [...given] };
}

describe("writing a run down", () => {
  it("reads back as it was written", () => {
    const r = recorded();
    const text = encode(r);
    expect(text.startsWith("bkr1.")).toBe(true);
    expect(text).toMatch(/^bkr1\.[\w-]+$/);
    expect(decode(text)).toEqual({ record: r });
    expect(decode(`  ${text}\n`)).toEqual({ record: r });
  });

  it("turns away what isn't a run, and says why", () => {
    for (const [text, why] of [
      ["", /isn't a Back Room run/],
      ["hello", /isn't a Back Room run/],
      ["bkr1.%%%%", /damaged/],
      [`bkr1.${btoa("not json")}`, /damaged/],
      [encode({ seed: -1, numbers: 0, commands: [] }), /seed/],
      [encode({ seed: 1.5, numbers: 0, commands: [] }), /seed/],
      [encode({ seed: 1, numbers: -2, commands: [] }), /numbers/],
      [encode({ seed: 1, numbers: 0, commands: [{ t: "fly" } as never] }), /Command 1/],
      [encode({ seed: 1, numbers: 0, commands: [{ t: "end" }, { t: "play", uid: "x" } as never] }), /Command 2/],
      [encode({ seed: 1, numbers: 0, commands: Array.from({ length: MAX_COMMANDS + 1 }, () => ({ t: "end" as const })) }), /more than/],
    ] as const) {
      const out = decode(text);
      expect(out, String(text).slice(0, 30)).toHaveProperty("problem");
      expect((out as { problem: string }).problem).toMatch(why);
    }
    expect(decode(`bkr1.${btoa(JSON.stringify({ s: 1, n: 0 })).replace(/=+$/, "")}`)).toEqual({ problem: "That run has no commands." });
  });

  it("carries a command's target and leaves the rest alone", () => {
    const r: RunRecord = { seed: 3, numbers: 2, commands: [{ t: "play", uid: 4, target: 1 }, { t: "move", uid: 5, to: 0 }, { t: "take", index: 2 }, { t: "remove", uid: 9 }, { t: "go" }, { t: "end" }] };
    expect(decode(encode(r))).toEqual({ record: r });
  });
});

describe("playing it back", () => {
  it("is the run the bot played: the same place and the same hash at the end", () => {
    const seed = 11;
    const { battle, given } = playRun(seed, { deckBuild: true });
    const seen = inspect({ seed, numbers: 0, commands: [...given] });
    expect(seen.refused).toBe(-1);
    expect(seen.steps).toHaveLength(given.length + 1);
    expect(seen.hash).toBe(battle.hash());
    expect(seen.phase).toBe(battle.view().phase);
    expect(seen.steps[0]).toMatchObject({ n: 0, command: null, ok: true, turn: 1 });
    expect(seen.steps.map((s) => s.n)).toEqual(seen.steps.map((_, i) => i));
  });

  it("puts each command in words from where it was given", () => {
    const { steps } = inspect(recorded(7));
    expect(steps[0]!.says).toBe("Start");
    const plays = steps.filter((s) => s.command?.t === "play");
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((s) => /^Play [A-Z][\w' -]+( on .+)?$/.test(s.says))).toBe(true);
    expect(plays.some((s) => / on [A-Z]/.test(s.says))).toBe(true);
    expect(steps.some((s) => /foe \d|1001|gone/.test(s.says))).toBe(false);
    expect(steps.some((s) => s.says === "End the turn")).toBe(true);
    expect(steps.some((s) => /^Take /.test(s.says))).toBe(true);
  });

  it("says what is in the hand and who the foes are, by name", () => {
    const first = inspect({ seed: 5, numbers: 0, commands: [] }).steps[0]!;
    expect(first.hand.length).toBeGreaterThan(0);
    expect(first.hand.every((n) => /^[A-Z]/.test(n))).toBe(true);
    expect(first.foes[0]!.name).toMatch(/\w/);
    expect(first.hp).toBe(first.maxHp);
  });

  it("changes the hash as a run goes on, and the same commands always give the same ones", () => {
    const r = recorded(13);
    const a = inspect(r);
    const b = inspect(r);
    expect(a.steps.map((s) => s.hash)).toEqual(b.steps.map((s) => s.hash));
    expect(new Set(a.steps.map((s) => s.hash)).size).toBeGreaterThan(a.steps.length / 2);
  });

  it("stops at a command the game refuses, and shows which and why", () => {
    const r = recorded(7);
    const bad: RunRecord = { ...r, commands: [...r.commands.slice(0, 3), { t: "take", index: 0 }, ...r.commands.slice(3)] };
    const seen = inspect(bad);
    expect(seen.refused).toBe(3);
    const last = seen.steps[seen.steps.length - 1]!;
    expect(last).toMatchObject({ n: 4, ok: false, why: "not now" });
    expect(seen.steps).toHaveLength(5);
  });

  it("a different seed is a different run, and a different set of numbers can be told apart", () => {
    const r = recorded(21);
    expect(inspect({ ...r, seed: 22 }).hash).not.toBe(inspect(r).hash);
    const harder = tune({ maxHp: 10 }, 3);
    const first = inspect({ ...r, commands: [] }, harder).steps[0]!;
    expect(first.maxHp).toBe(10);
    expect(inspect({ ...r, commands: [] }).hash).not.toBe(inspect({ ...r, commands: [] }, harder).hash);
  });

  it("matches the engine's own replay of the same commands", () => {
    const r = recorded(31);
    const direct = new Battle(r.seed);
    for (const c of r.commands) direct.command(c);
    expect(inspect(r).hash).toBe(direct.hash());
  });
});
