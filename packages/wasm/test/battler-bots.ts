// Players that need no screen: they keep the numbers honest (battler.test.ts) and show how a run goes.
import { CARD_BY_ID } from "../src/battler/cards.ts";
import { Battle, type View } from "../src/battler/engine.ts";

const incoming = (v: View) => v.foes.reduce((sum, foe) => sum + (foe.intent.kind === "attack" ? foe.intent.amount * (foe.intent.hits ?? 1) : 0), 0);

/** One command for a careful player: block what is coming, otherwise hit, cheapest first. */
export function chooseOne(v: View): { t: "play"; uid: number; target?: number } | null {
  const playable = v.hand.filter((card) => CARD_BY_ID[card.def]!.cost <= v.energy);
  const need = Math.max(0, incoming(v) - v.block);
  const by = (kind: string) => playable.filter((card) => CARD_BY_ID[card.def]!.kind === kind);
  const weakest = [...v.foes].sort((a, b) => a.hp + a.block - (b.hp + b.block))[0]!;
  // Draw and energy first: they make the rest of the turn bigger.
  const first = playable.find((card) => (CARD_BY_ID[card.def]!.effect.draw || CARD_BY_ID[card.def]!.effect.energy) && !CARD_BY_ID[card.def]!.effect.damage);
  if (first) return { t: "play", uid: first.uid };
  const mark = playable.find((card) => CARD_BY_ID[card.def]!.effect.vulnerable);
  if (mark && v.foes.some((foe) => foe.vulnerable === 0 && foe.hp > 12)) {
    const c = CARD_BY_ID[mark.def]!;
    return c.effect.all ? { t: "play", uid: mark.uid } : { t: "play", uid: mark.uid, target: [...v.foes].sort((a, b) => b.hp - a.hp)[0]!.uid };
  }
  if (need > 0) {
    const block = by("skill").filter((card) => CARD_BY_ID[card.def]!.effect.block).sort((a, b) => CARD_BY_ID[b.def]!.effect.block! / Math.max(1, CARD_BY_ID[b.def]!.cost) - CARD_BY_ID[a.def]!.effect.block! / Math.max(1, CARD_BY_ID[a.def]!.cost))[0];
    if (block) return { t: "play", uid: block.uid };
  }
  const heal = by("skill").find((card) => CARD_BY_ID[card.def]!.effect.heal && v.hp < v.maxHp - 6);
  if (heal) return { t: "play", uid: heal.uid };
  const hit = by("attack").sort((a, b) => {
    const ea = CARD_BY_ID[a.def]!.effect;
    const eb = CARD_BY_ID[b.def]!.effect;
    const value = (e: typeof ea, cost: number) => ((e.damage ?? 0) * (e.hits ?? 1) * (e.all ? v.foes.length : 1)) / Math.max(0.5, cost);
    return value(eb, CARD_BY_ID[b.def]!.cost) - value(ea, CARD_BY_ID[a.def]!.cost);
  })[0];
  if (hit) return CARD_BY_ID[hit.def]!.effect.all ? { t: "play", uid: hit.uid } : { t: "play", uid: hit.uid, target: weakest.uid };
  const spare = by("skill").find((card) => CARD_BY_ID[card.def]!.effect.block);
  return spare ? { t: "play", uid: spare.uid } : null;
}

const LIKED = ["torque", "air-gun", "mallet", "toolbox", "gasket", "first-aid", "coffee", "hacksaw", "gloves", "catalog", "screwdriver"];

export interface RunOptions {
  /** Take a card after each fight (the best liked one), and put a starter card back. */
  deckBuild: boolean;
}

/** Plays a whole run. Returns how far it got and what it ended with. */
export function playRun(seed: number, { deckBuild }: RunOptions) {
  const battle = new Battle(seed);
  const log: string[] = [];
  for (let guard = 0; guard < 4000; guard++) {
    const v = battle.view();
    if (v.phase === "won" || v.phase === "lost") break;
    if (v.phase === "reward") {
      if (deckBuild) {
        const index = v.offers.length ? v.offers.reduce((best, id, i) => (LIKED.indexOf(id) < LIKED.indexOf(v.offers[best]!) ? i : best), 0) : -1;
        battle.command({ t: "take", index });
        const weak = battle.view().deck.find((card) => card.def === "rag");
        if (weak && battle.view().deck.filter((card) => card.def === "rag").length > 2) battle.command({ t: "remove", uid: weak.uid });
      } else battle.command({ t: "take", index: -1 });
      battle.command({ t: "go" });
      continue;
    }
    const next = chooseOne(v);
    if (next) battle.command(next);
    else battle.command({ t: "end" });
    log.push(JSON.stringify(next ?? { t: "end" }));
  }
  const v = battle.view();
  return { phase: v.phase, floor: v.floor, hp: v.hp, deck: v.deck.length, battle };
}
