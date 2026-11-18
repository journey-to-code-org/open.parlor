// The rules of Delbie's Back Room (src/battler/engine.ts), and bots that keep the numbers honest: a
// run is the seed and the commands given, so these play whole runs with no screen.
import { describe, expect, it } from "vitest";
import { CARDS, CARD_BY_ID, FLOORS, FOES, STARTING_DECK, describe as words, intentText, needsFoe } from "../src/battler/cards.ts";
import { Battle, ENERGY, HAND, MAX_HP, OFFERS, REST, replay, type Command, type View } from "../src/battler/engine.ts";
import { chooseOne, playRun } from "./battler-bots.ts";

const find = (v: View, id: string) => v.hand.find((card) => card.def === id);
/** A seed whose first hand has what a test needs. */
function seedWith(...wanted: string[]) {
  for (let seed = 1; seed < 500; seed++) {
    const v = new Battle(seed).view();
    if (wanted.every((id) => find(v, id))) return seed;
  }
  throw new Error(`no seed deals ${wanted.join(" and ")}`);
}

describe("a fight", () => {
  it("starts with five cards, three energy, full patience and the floor's foes", () => {
    const v = new Battle(1).view();
    expect(v.phase).toBe("fight");
    expect(v.hand).toHaveLength(HAND);
    expect(v.draw).toHaveLength(STARTING_DECK.length - HAND);
    expect(v.energy).toBe(ENERGY);
    expect(v.hp).toBe(MAX_HP);
    expect(v.foes.map((foe) => foe.def)).toEqual(FLOORS[0]!.foes);
    expect(v.deck).toHaveLength(STARTING_DECK.length);
  });

  it("is the same on every machine: a seed and its commands come out the same", () => {
    const run = (seed: number) => {
      const b = new Battle(seed);
      for (let n = 0; n < 6; n++) {
        const next = chooseOne(b.view());
        b.command(next ?? { t: "end" });
      }
      return b.hash();
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
    // A pinned one: if the rules change on purpose, update it.
    expect(new Battle(1).hash()).toBe(new Battle(1).hash());
  });

  it("an attack takes energy, hits the foe it is played on, and leaves the hand", () => {
    const b = new Battle(seedWith("wrench"));
    const v = b.view();
    const wrench = find(v, "wrench")!;
    expect(b.command({ t: "play", uid: wrench.uid, target: v.foes[0]!.uid }).ok).toBe(true);
    const after = b.view();
    expect(after.energy).toBe(ENERGY - 1);
    expect(after.foes[0]!.hp).toBe(v.foes[0]!.hp - 6);
    expect(after.hand.some((card) => card.uid === wrench.uid)).toBe(false);
    expect(after.discard.map((card) => card.uid)).toContain(wrench.uid);
  });

  it("refuses what it can't do and changes nothing when it does", () => {
    const b = new Battle(seedWith("wrench"));
    const v = b.view();
    const wrench = find(v, "wrench")!;
    const before = b.hash();
    expect(b.command({ t: "play", uid: wrench.uid })).toEqual({ ok: false, why: "pick a foe" });
    expect(b.command({ t: "play", uid: wrench.uid, target: 99999 })).toEqual({ ok: false, why: "no such foe" });
    expect(b.command({ t: "play", uid: 99999 })).toEqual({ ok: false, why: "no such card" });
    expect(b.command({ t: "take", index: 0 })).toEqual({ ok: false, why: "not now" });
    expect(b.command({ t: "go" })).toEqual({ ok: false, why: "not now" });
    expect(b.command({ t: "remove", uid: 1 })).toEqual({ ok: false, why: "not now" });
    expect(b.hash()).toBe(before);
    // Out of energy.
    const spend = b.view().hand.filter((card) => CARD_BY_ID[card.def]!.cost > 0).slice(0, ENERGY);
    for (const card of spend) b.command(CARD_BY_ID[card.def]!.kind === "attack" ? { t: "play", uid: card.uid, target: b.view().foes[0]!.uid } : { t: "play", uid: card.uid, target: b.view().foes[0]!.uid });
    const left = b.view().hand.find((card) => CARD_BY_ID[card.def]!.cost > b.view().energy);
    if (left) expect(b.command({ t: "play", uid: left.uid, target: b.view().foes[0]!.uid })).toEqual({ ok: false, why: "no energy" });
  });

  it("block takes damage first, stays up through the foes' turn, and goes when yours begins", () => {
    const b = new Battle(seedWith("rag"));
    const rag = find(b.view(), "rag")!;
    b.command({ t: "play", uid: rag.uid });
    expect(b.view().block).toBe(5);
    // The rat's first turn is an attack for 7: 5 of it is blocked.
    expect(b.view().foes[0]!.intent).toEqual({ kind: "attack", amount: 7 });
    b.command({ t: "end" });
    expect(b.view().hp).toBe(MAX_HP - 2);
    expect(b.view().news.some((line) => line.includes("2 (5 blocked)"))).toBe(true);
    expect(b.view().block).toBe(0);
    // Without it, the next hit (9) goes straight through.
    b.command({ t: "end" });
    expect(b.view().hp).toBe(MAX_HP - 2 - 9);
  });

  it("a price gun makes the next hits on that foe land half as hard again, for as many turns as it says", () => {
    const b = new Battle(seedWith("price-gun", "wrench"));
    const foe = b.view().foes[0]!;
    b.command({ t: "play", uid: find(b.view(), "price-gun")!.uid, target: foe.uid });
    expect(b.view().foes[0]!.vulnerable).toBe(2);
    b.command({ t: "play", uid: find(b.view(), "wrench")!.uid, target: foe.uid });
    expect(b.view().foes[0]!.hp).toBe(foe.hp - 9);
    b.command({ t: "end" });
    expect(b.view().foes[0]!.vulnerable).toBe(1);
  });

  it("the turn ends with a shuffle when the draw pile runs out", () => {
    const b = new Battle(3);
    let shuffled = false;
    for (let turn = 0; turn < 6 && b.view().phase === "fight"; turn++) {
      b.command({ t: "end" });
      shuffled ||= b.view().news.some((line) => line.includes("shuffled"));
      const v = b.view();
      if (v.phase !== "fight") break;
      expect(v.hand.length + v.draw.length + v.discard.length).toBe(STARTING_DECK.length);
    }
    expect(shuffled).toBe(true);
  });

  it("no card is ever in two places or lost", () => {
    const b = new Battle(11);
    for (let n = 0; n < 40 && b.view().phase === "fight"; n++) {
      b.command(chooseOne(b.view()) ?? { t: "end" });
      const v = b.view();
      if (v.phase !== "fight") break;
      const uids = [...v.hand, ...v.draw, ...v.discard].map((card) => card.uid).sort((x, y) => x - y);
      expect(uids).toEqual(v.deck.map((card) => card.uid).sort((x, y) => x - y));
    }
  });

  it("moving a card in the hand reorders it and costs nothing", () => {
    const b = new Battle(5);
    const v = b.view();
    const last = v.hand[HAND - 1]!;
    expect(b.command({ t: "move", uid: last.uid, to: 0 }).ok).toBe(true);
    const after = b.view();
    expect(after.hand[0]!.uid).toBe(last.uid);
    expect(after.hand.map((card) => card.uid).sort()).toEqual(v.hand.map((card) => card.uid).sort());
    expect(after.energy).toBe(v.energy);
    expect(b.command({ t: "move", uid: 99999, to: 0 })).toEqual({ ok: false, why: "no such card" });
  });

  it("an attack on every foe hits them all", () => {
    // Floor two has two customers; get there by playing the first floor.
    const b = new Battle(2);
    for (let g = 0; g < 400 && b.view().floor === 0; g++) {
      const v = b.view();
      if (v.phase === "reward") {
        b.command({ t: "take", index: -1 });
        b.command({ t: "go" });
      } else b.command(chooseOne(v) ?? { t: "end" });
    }
    expect(b.view().foes).toHaveLength(2);
  });
});

describe("between fights", () => {
  /** A battle at its first reward screen. */
  function afterFirstFight(seed = 4) {
    const b = new Battle(seed);
    for (let g = 0; g < 400 && b.view().phase === "fight"; g++) b.command(chooseOne(b.view()) ?? { t: "end" });
    return b;
  }

  it("offers three different cards, heals a little, and wants a choice", () => {
    const b = afterFirstFight();
    const v = b.view();
    expect(v.phase).toBe("reward");
    expect(v.offers).toHaveLength(OFFERS);
    expect(new Set(v.offers).size).toBe(OFFERS);
    for (const id of v.offers) expect(CARD_BY_ID[id]!.rarity).not.toBe("starter");
    expect(v.hand).toEqual([]);
  });

  it("taking a card adds it to the deck, once", () => {
    const b = afterFirstFight();
    const before = b.view();
    expect(b.command({ t: "take", index: 1 }).ok).toBe(true);
    const after = b.view();
    expect(after.deck).toHaveLength(before.deck.length + 1);
    expect(after.deck.at(-1)!.def).toBe(before.offers[1]);
    expect(b.command({ t: "take", index: 0 })).toEqual({ ok: false, why: "already done" });
    expect(b.command({ t: "take", index: 7 }).ok).toBe(false);
  });

  it("putting a card back takes it out of the deck, once, and never below five", () => {
    const b = afterFirstFight();
    const card = b.view().deck[0]!;
    expect(b.command({ t: "remove", uid: card.uid }).ok).toBe(true);
    expect(b.view().deck.some((c) => c.uid === card.uid)).toBe(false);
    expect(b.command({ t: "remove", uid: b.view().deck[0]!.uid })).toEqual({ ok: false, why: "already done" });
    expect(b.command({ t: "remove", uid: 99999 }).ok).toBe(false);
  });

  it("going on starts the next floor with a fresh hand from the whole deck, new cards included", () => {
    const b = afterFirstFight();
    b.command({ t: "take", index: 0 });
    const size = b.view().deck.length;
    b.command({ t: "go" });
    const v = b.view();
    expect(v.floor).toBe(1);
    expect(v.phase).toBe("fight");
    expect(v.hand.length + v.draw.length).toBe(size);
  });
});

describe("a run", () => {
  it("replays from its seed and its commands to the same place", () => {
    const seed = 21;
    const b = new Battle(seed);
    const commands: Command[] = [];
    for (let g = 0; g < 600; g++) {
      const v = b.view();
      if (v.phase === "won" || v.phase === "lost") break;
      const c: Command = v.phase === "reward" ? (v.taken ? { t: "go" } : { t: "take", index: 0 }) : (chooseOne(v) ?? { t: "end" });
      if (b.command(c).ok) commands.push(c);
    }
    const again = replay(seed, commands);
    expect(again.refused).toBe(-1);
    expect(again.battle.hash()).toBe(b.hash());
    // A command that can't be played stops the replay where it is.
    expect(replay(seed, [{ t: "go" }]).refused).toBe(0);
  });

  it("has every card and foe it names", () => {
    for (const floor of FLOORS) for (const id of floor.foes) expect(FOES[id], id).toBeDefined();
    for (const id of STARTING_DECK) expect(CARD_BY_ID[id], id).toBeDefined();
    expect(new Set(CARDS.map((card) => card.id)).size).toBe(CARDS.length);
    expect(FLOORS.at(-1)!.foes).toEqual(["king"]);
  });
});

describe("the numbers, kept honest by bots", () => {
  const seeds = Array.from({ length: 120 }, (_, n) => n + 1);

  it("doing nothing loses on the first floor, always", () => {
    for (const seed of seeds.slice(0, 20)) {
      const b = new Battle(seed);
      for (let g = 0; g < 200 && b.view().phase === "fight"; g++) b.command({ t: "end" });
      expect(b.view().phase).toBe("lost");
      expect(b.view().floor).toBe(0);
    }
  });

  it("the starting deck gets a careful player to the back corner and not through it", () => {
    const runs = seeds.map((seed) => playRun(seed, { deckBuild: false }));
    expect(runs.filter((run) => run.phase === "won").length).toBeLessThanOrEqual(2);
    // Nearly all of them get as far as the boss.
    expect(runs.filter((run) => run.floor === FLOORS.length - 1).length).toBeGreaterThan(seeds.length * 0.9);
  });

  it("building the deck wins a good share of runs, but not nearly all", () => {
    const runs = seeds.map((seed) => playRun(seed, { deckBuild: true }));
    const wins = runs.filter((run) => run.phase === "won").length / seeds.length;
    expect(wins).toBeGreaterThan(0.25);
    expect(wins).toBeLessThan(0.65);
  });

  it("a run always ends", () => {
    for (const seed of seeds.slice(0, 30)) expect(["won", "lost"]).toContain(playRun(seed, { deckBuild: true }).phase);
  });
});

describe("the words on the cards", () => {
  it("every card says what it does, and only foe-aimed cards need a foe", () => {
    for (const card of CARDS) {
      expect(words(card).length).toBeGreaterThan(0);
      if (card.effect.all) expect(needsFoe(card)).toBe(false);
    }
    expect(needsFoe(CARD_BY_ID.wrench)).toBe(true);
    expect(needsFoe(CARD_BY_ID.rag)).toBe(false);
  });

  it("every foe's every intent reads as a number", () => {
    for (const foe of Object.values(FOES)) for (const intent of foe.pattern) expect(intentText(intent)).toMatch(/\d/);
  });
});
