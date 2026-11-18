// The cards and the foes of Delbie's Back Room. Plain data: the rules that play them are in engine.ts.
// Every card is a part on a shelf, and every foe is something that goes wrong in a parts store; none
// of it is anyone's real name or real store.

export interface Effect {
  /** Damage to one foe, or to every foe with `all`. */
  damage?: number;
  /** How many times the damage lands. */
  hits?: number;
  all?: boolean;
  block?: number;
  draw?: number;
  energy?: number;
  heal?: number;
  /** The foe takes half as much again from every hit for this many of its turns. */
  vulnerable?: number;
}

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  /** Attacks are played on a foe; the rest are played on yourself. */
  kind: "attack" | "skill";
  art: string;
  effect: Effect;
  rarity: "starter" | "common" | "rare";
}

export const CARDS: readonly CardDef[] = [
  { id: "wrench", name: "Wrench", cost: 1, kind: "attack", art: "🔧", effect: { damage: 6 }, rarity: "starter" },
  { id: "rag", name: "Shop Rag", cost: 1, kind: "skill", art: "🧻", effect: { block: 5 }, rarity: "starter" },
  { id: "price-gun", name: "Price Gun", cost: 1, kind: "skill", art: "🏷️", effect: { vulnerable: 2 }, rarity: "starter" },

  { id: "screwdriver", name: "Screwdriver", cost: 0, kind: "attack", art: "🪛", effect: { damage: 3 }, rarity: "common" },
  { id: "hacksaw", name: "Hacksaw", cost: 1, kind: "attack", art: "🪚", effect: { damage: 4, hits: 2 }, rarity: "common" },
  { id: "mallet", name: "Dead-Blow Mallet", cost: 2, kind: "attack", art: "🔨", effect: { damage: 14 }, rarity: "common" },
  { id: "gasket", name: "Gasket", cost: 1, kind: "skill", art: "⭕", effect: { block: 8 }, rarity: "common" },
  { id: "gloves", name: "Work Gloves", cost: 0, kind: "skill", art: "🧤", effect: { block: 3, draw: 1 }, rarity: "common" },
  { id: "catalog", name: "Parts Catalog", cost: 1, kind: "skill", art: "📒", effect: { draw: 2 }, rarity: "common" },
  { id: "toolbox", name: "Toolbox", cost: 2, kind: "skill", art: "🧰", effect: { block: 14 }, rarity: "common" },

  { id: "air-gun", name: "Air Impact Gun", cost: 2, kind: "attack", art: "💨", effect: { damage: 5, all: true }, rarity: "rare" },
  { id: "torque", name: "Torque Wrench", cost: 2, kind: "attack", art: "🪝", effect: { damage: 10, vulnerable: 1 }, rarity: "rare" },
  { id: "coffee", name: "Break Room Coffee", cost: 0, kind: "skill", art: "☕", effect: { energy: 2 }, rarity: "rare" },
  { id: "first-aid", name: "First-Aid Kit", cost: 2, kind: "skill", art: "🩹", effect: { heal: 7, block: 4 }, rarity: "rare" },
];

export const CARD_BY_ID: Readonly<Record<string, CardDef>> = Object.fromEntries(CARDS.map((card) => [card.id, card]));
export const STARTING_DECK: readonly string[] = ["wrench", "wrench", "wrench", "wrench", "wrench", "rag", "rag", "rag", "rag", "price-gun"];

/** What a foe means to do on its turn. */
export type Intent = { kind: "attack"; amount: number; hits?: number } | { kind: "block"; amount: number };

export interface FoeDef {
  id: string;
  name: string;
  art: string;
  hp: number;
  /** Its turns, in order, round and round. */
  pattern: readonly Intent[];
}

export const FOES: Readonly<Record<string, FoeDef>> = {
  rat: { id: "rat", name: "Stockroom Rat", art: "🐀", hp: 18, pattern: [{ kind: "attack", amount: 7 }, { kind: "attack", amount: 9 }, { kind: "block", amount: 6 }] },
  customer: { id: "customer", name: "Impatient Customer", art: "😤", hp: 13, pattern: [{ kind: "attack", amount: 6 }, { kind: "attack", amount: 8 }] },
  backorder: { id: "backorder", name: "Backorder Slip", art: "📄", hp: 40, pattern: [{ kind: "block", amount: 10 }, { kind: "attack", amount: 15 }, { kind: "attack", amount: 9 }] },
  pup: { id: "pup", name: "Rat Pup", art: "🐁", hp: 9, pattern: [{ kind: "attack", amount: 5 }, { kind: "attack", amount: 6 }] },
  king: { id: "king", name: "The Rat King", art: "👑", hp: 78, pattern: [{ kind: "attack", amount: 12 }, { kind: "block", amount: 16 }, { kind: "attack", amount: 22 }, { kind: "attack", amount: 6, hits: 3 }] },
};

/** The run: the foes on each floor, last floor the boss. */
export const FLOORS: readonly { name: string; foes: readonly string[] }[] = [
  { name: "Opening time", foes: ["rat"] },
  { name: "Saturday morning rush", foes: ["customer", "customer"] },
  { name: "The special order", foes: ["backorder"] },
  { name: "Something in the cardboard", foes: ["pup", "pup", "pup"] },
  { name: "The back corner", foes: ["king"] },
];

/** What a card does, in words, for the card's face. */
export function describe(card: CardDef): string {
  const e = card.effect;
  const parts: string[] = [];
  if (e.damage) parts.push(`Deal ${e.damage}${e.hits && e.hits > 1 ? ` ×${e.hits}` : ""}${e.all ? " to all" : ""}.`);
  if (e.block) parts.push(`Block ${e.block}.`);
  if (e.vulnerable) parts.push(`Mark down ${e.vulnerable} turn${e.vulnerable === 1 ? "" : "s"}.`);
  if (e.draw) parts.push(`Draw ${e.draw}.`);
  if (e.energy) parts.push(`+${e.energy} energy.`);
  if (e.heal) parts.push(`Heal ${e.heal}.`);
  return parts.join(" ");
}

/** What a foe is about to do, in a word and a number. */
export function intentText(intent: Intent): string {
  return intent.kind === "attack" ? `⚔ ${intent.amount}${intent.hits && intent.hits > 1 ? ` ×${intent.hits}` : ""}` : `🛡 ${intent.amount}`;
}

/** Does playing this card need a foe picked? */
export const needsFoe = (card: CardDef): boolean => !card.effect.all && (card.kind === "attack" || !!card.effect.vulnerable);
