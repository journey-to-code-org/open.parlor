// The numbers the host may change: laid over the game's own, ignored where they don't fit, and a run
// played on them is a run on them, start to end.
import { describe, expect, it } from "vitest";
import { CARD_BY_ID, FOES } from "../src/battler/cards.ts";
import { Battle, REST, MAX_HP, replay } from "../src/battler/engine.ts";
import { DEFAULT_TABLES, load, tune } from "../src/battler/tables.ts";
import { playRun } from "./battler-bots.ts";

describe("laying an override over the game's numbers", () => {
  it("nothing changed is the game's own, at version 0", () => {
    expect(tune()).toMatchObject({ version: 0, maxHp: MAX_HP, rest: REST });
    expect(tune({}).cardById.wrench).toEqual(CARD_BY_ID.wrench);
    expect(DEFAULT_TABLES.foes.rat).toEqual(FOES.rat);
  });

  it("changes only what it names", () => {
    const t = tune({ cards: { wrench: { damage: 9, cost: 0 } }, foes: { rat: { hp: 30 } }, rest: 12, maxHp: 55 }, 3);
    expect(t.version).toBe(3);
    expect(t.cardById.wrench!.effect).toEqual({ damage: 9 });
    expect(t.cardById.wrench!.cost).toBe(0);
    expect(t.cardById.rag).toEqual(CARD_BY_ID.rag);
    expect(t.foes.rat!.hp).toBe(30);
    expect(t.foes.rat!.pattern).toEqual(FOES.rat!.pattern);
    expect(t.foes.customer).toEqual(FOES.customer);
    expect([t.rest, t.maxHp]).toEqual([12, 55]);
    // The game's own is untouched.
    expect(CARD_BY_ID.wrench!.effect.damage).toBe(6);
  });

  it("nothing of an effect takes it away, and one hit is just a hit", () => {
    const t = tune({ cards: { hacksaw: { hits: 1 }, "price-gun": { vulnerable: 0 }, rag: { block: 0 } } });
    expect(t.cardById.hacksaw!.effect.hits).toBeUndefined();
    expect(t.cardById["price-gun"]!.effect.vulnerable).toBeUndefined();
    expect(t.cardById.rag!.effect.block).toBeUndefined();
  });

  it("leaves out what the game does not have and what is not a whole number", () => {
    const t = tune({ cards: { ghost: { damage: 5 }, wrench: { damage: 2.5, block: "3" as unknown as number } }, foes: { dragon: { hp: 1 }, rat: { hp: -4 } }, maxHp: 0, rest: -1 });
    expect(t.cards.map((c) => c.id)).toEqual(DEFAULT_TABLES.cards.map((c) => c.id));
    expect(t.cardById.wrench).toEqual(CARD_BY_ID.wrench);
    expect(t.foes.rat!.hp).toBe(FOES.rat!.hp);
    expect(Object.keys(t.foes)).not.toContain("dragon");
    expect([t.maxHp, t.rest]).toEqual([MAX_HP, REST]);
  });

  it("an empty pattern keeps the foe's own", () => {
    expect(tune({ foes: { rat: { pattern: [] } } }).foes.rat!.pattern).toEqual(FOES.rat!.pattern);
    expect(tune({ foes: { rat: { pattern: [{ kind: "block", amount: 3 }] } } }).foes.rat!.pattern).toEqual([{ kind: "block", amount: 3 }]);
  });
});

describe("a run on tuned numbers", () => {
  const tuned = tune({ maxHp: 60, rest: 20, cards: { wrench: { damage: 18 } }, foes: { rat: { hp: 20, pattern: [{ kind: "attack", amount: 2 }] } } }, 4);

  it("starts with the tuned hit points and meets the tuned foe", () => {
    const view = new Battle(5, tuned).view();
    expect([view.hp, view.maxHp]).toEqual([60, 60]);
    expect(view.foes[0]).toMatchObject({ name: "Stockroom Rat", hp: 20 });
    expect(view.foes[0]!.intent).toEqual({ kind: "attack", amount: 2 });
  });

  it("plays the tuned card at the tuned strength", () => {
    const battle = new Battle(5, tuned);
    const wrench = battle.view().hand.find((c) => c.def === "wrench");
    expect(wrench).toBeTruthy();
    expect(battle.command({ t: "play", uid: wrench!.uid, target: battle.view().foes[0]!.uid }).ok).toBe(true);
    expect(battle.view().foes[0]!.hp).toBe(2);
  });

  it("heals the tuned amount between floors", () => {
    const battle = new Battle(5, tune({ rest: 20, cards: { wrench: { damage: 99, cost: 0 } }, foes: { rat: { pattern: [{ kind: "attack", amount: 10 }] } } }));
    // Take a hit first, so there is something to heal.
    battle.command({ t: "end" });
    const hurt = battle.view().hp;
    expect(hurt).toBe(30);
    for (let turn = 0; turn < 4 && battle.view().phase === "fight" && !battle.view().hand.some((c) => c.def === "wrench"); turn++) battle.command({ t: "end" });
    const before = battle.view().hp;
    const wrench = battle.view().hand.find((c) => c.def === "wrench")!;
    battle.command({ t: "play", uid: wrench.uid, target: battle.view().foes[0]!.uid });
    expect(battle.view().phase).toBe("reward");
    // Twenty back (up to the top), where the game's own eight would have left it short.
    expect(battle.view().hp).toBe(Math.min(40, before + 20));
    expect(battle.view().hp).toBeGreaterThan(Math.min(40, before + 8));
  });

  it("is the same run when replayed on the same numbers, and a different one on others", () => {
    const run = playRun(9, { deckBuild: true, tables: tuned });
    expect(run.given.length).toBeGreaterThan(10);
    const again = replay(9, run.given, tuned);
    expect(again.refused).toBe(-1);
    expect(again.battle.hash()).toBe(run.battle.hash());
    expect(replay(9, run.given).battle.hash()).not.toBe(run.battle.hash());
  });
});

describe("asking the parlor for the numbers", () => {
  it("uses what the host saved", async () => {
    const tables = await load(async () => ({ version: 2, values: { maxHp: 70 } }));
    expect([tables.version, tables.maxHp]).toEqual([2, 70]);
  });

  it("falls back to the game's own for nothing saved, an answer that isn't one, or no answer", async () => {
    expect(await load(async () => ({ version: 0, values: {} }))).toBe(DEFAULT_TABLES);
    expect(await load(async () => null)).toBe(DEFAULT_TABLES);
    expect(await load(async () => ({ version: "2", values: {} }))).toBe(DEFAULT_TABLES);
    expect(await load(async () => ({ version: 1, values: null }))).toBe(DEFAULT_TABLES);
    expect(await load(async () => { throw new Error("offline"); })).toBe(DEFAULT_TABLES);
  });
});

describe("the file of the game's own numbers", () => {
  it("is what the game has now (run `npm run battler:defaults` if not)", async () => {
    const { readFileSync } = await import("node:fs");
    const { defaults } = await import("../src/battler/defaults.ts");
    const file = JSON.parse(readFileSync(new URL("../public/battler-defaults.json", import.meta.url), "utf8"));
    expect(file).toEqual(JSON.parse(JSON.stringify(defaults())));
  });

  it("names every card and foe the Tuning page can change", async () => {
    const { defaults } = await import("../src/battler/defaults.ts");
    const d = defaults();
    expect(Object.keys(d.cards)).toEqual(DEFAULT_TABLES.cards.map((c) => c.id));
    expect(Object.keys(d.foes)).toEqual(Object.keys(DEFAULT_TABLES.foes));
    // What the page offers is what the server lets through: card and foe names fit its pattern.
    for (const id of [...Object.keys(d.cards), ...Object.keys(d.foes)]) expect(id).toMatch(/^[a-z][a-z0-9-]{0,23}$/);
  });
});
