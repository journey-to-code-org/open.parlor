// Players that need no screen: they keep the numbers honest (battler.test.ts) and show how a run goes.
import { DEFAULT_TABLES, type Tables } from "../src/battler/tables.ts";
import { Battle, type Command, type View } from "../src/battler/engine.ts";

const incoming = (v: View) => v.foes.reduce((sum, foe) => sum + (foe.intent.kind === "attack" ? foe.intent.amount * (foe.intent.hits ?? 1) : 0), 0);

/** One command for a careful player: block what is coming, otherwise hit, cheapest first. */
export function chooseOne(v: View, tables: Tables = DEFAULT_TABLES): { t: "play"; uid: number; target?: number } | null {
  const playable = v.hand.filter((card) => tables.cardById[card.def]!.cost <= v.energy);
  const need = Math.max(0, incoming(v) - v.block);
  const by = (kind: string) => playable.filter((card) => tables.cardById[card.def]!.kind === kind);
  const weakest = [...v.foes].sort((a, b) => a.hp + a.block - (b.hp + b.block))[0]!;
  // Draw and energy first: they make the rest of the turn bigger.
  const first = playable.find((card) => (tables.cardById[card.def]!.effect.draw || tables.cardById[card.def]!.effect.energy) && !tables.cardById[card.def]!.effect.damage);
  if (first) return { t: "play", uid: first.uid };
  const mark = playable.find((card) => tables.cardById[card.def]!.effect.vulnerable);
  if (mark && v.foes.some((foe) => foe.vulnerable === 0 && foe.hp > 12)) {
    const c = tables.cardById[mark.def]!;
    return c.effect.all ? { t: "play", uid: mark.uid } : { t: "play", uid: mark.uid, target: [...v.foes].sort((a, b) => b.hp - a.hp)[0]!.uid };
  }
  if (need > 0) {
    const block = by("skill").filter((card) => tables.cardById[card.def]!.effect.block).sort((a, b) => tables.cardById[b.def]!.effect.block! / Math.max(1, tables.cardById[b.def]!.cost) - tables.cardById[a.def]!.effect.block! / Math.max(1, tables.cardById[a.def]!.cost))[0];
    if (block) return { t: "play", uid: block.uid };
  }
  const heal = by("skill").find((card) => tables.cardById[card.def]!.effect.heal && v.hp < v.maxHp - 6);
  if (heal) return { t: "play", uid: heal.uid };
  const hit = by("attack").sort((a, b) => {
    const ea = tables.cardById[a.def]!.effect;
    const eb = tables.cardById[b.def]!.effect;
    const value = (e: typeof ea, cost: number) => ((e.damage ?? 0) * (e.hits ?? 1) * (e.all ? v.foes.length : 1)) / Math.max(0.5, cost);
    return value(eb, tables.cardById[b.def]!.cost) - value(ea, tables.cardById[a.def]!.cost);
  })[0];
  if (hit) return tables.cardById[hit.def]!.effect.all ? { t: "play", uid: hit.uid } : { t: "play", uid: hit.uid, target: weakest.uid };
  const spare = by("skill").find((card) => tables.cardById[card.def]!.effect.block);
  return spare ? { t: "play", uid: spare.uid } : null;
}

const LIKED = ["torque", "air-gun", "mallet", "toolbox", "gasket", "first-aid", "coffee", "hacksaw", "gloves", "catalog", "screwdriver"];

export interface RunOptions {
  /** Take a card after each fight (the best liked one), and put a starter card back. */
  deckBuild: boolean;
  /** The numbers to play on; the game's own by default. */
  tables?: Tables;
}

/** Plays a whole run. Returns how far it got and what it ended with. */
export function playRun(seed: number, { deckBuild, tables = DEFAULT_TABLES }: RunOptions) {
  const battle = new Battle(seed, tables);
  const given: Command[] = [];
  for (let guard = 0; guard < 4000; guard++) {
    const v = battle.view();
    if (v.phase === "won" || v.phase === "lost") break;
    if (v.phase === "reward") {
      if (deckBuild) {
        const index = v.offers.length ? v.offers.reduce((best, id, i) => (LIKED.indexOf(id) < LIKED.indexOf(v.offers[best]!) ? i : best), 0) : -1;
        given.push({ t: "take", index });
        battle.command({ t: "take", index });
        const weak = battle.view().deck.find((card) => card.def === "rag");
        if (weak && battle.view().deck.filter((card) => card.def === "rag").length > 2) {
          given.push({ t: "remove", uid: weak.uid });
          battle.command({ t: "remove", uid: weak.uid });
        }
      } else {
        given.push({ t: "take", index: -1 });
        battle.command({ t: "take", index: -1 });
      }
      given.push({ t: "go" });
      battle.command({ t: "go" });
      continue;
    }
    const next = chooseOne(v, tables) ?? ({ t: "end" } as const);
    given.push(next as Command);
    battle.command(next as Command);
  }
  const v = battle.view();
  return { phase: v.phase, floor: v.floor, hp: v.hp, deck: v.deck.length, battle, given };
}
