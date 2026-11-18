// The numbers of Delbie's Back Room that its host may change without a release (see the parlor's
// admin app and packages/server/src/tunables.ts). The game's own numbers are in cards.ts; what the
// host saves is a sparse override of them, and `tune` lays one over the other.
//
// A run is played on one set of tables. The set carries the version of the override it came from
// (0 for the game's own), so a replay or a shared run can say which numbers it needs.
import { CARDS, FOES, type CardDef, type Effect, type FoeDef, type Intent } from "./cards.ts";

/** What the host may change, as the server keeps it. Every part is optional. */
export interface Tunables {
  maxHp?: number;
  rest?: number;
  cards?: Record<string, Partial<Record<"cost" | EffectNumber, number>>>;
  foes?: Record<string, { hp?: number; pattern?: Intent[] }>;
}

export const EFFECT_NUMBERS = ["damage", "hits", "block", "vulnerable", "draw", "energy", "heal"] as const;
export type EffectNumber = (typeof EFFECT_NUMBERS)[number];

export interface Tables {
  /** The version of the override these came from; 0 is the game's own numbers. */
  version: number;
  maxHp: number;
  /** Healed between fights. */
  rest: number;
  cards: readonly CardDef[];
  cardById: Readonly<Record<string, CardDef>>;
  foes: Readonly<Record<string, FoeDef>>;
}

export const DEFAULT_MAX_HP = 40;
export const DEFAULT_REST = 8;

const whole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** The game's numbers with an override laid over them. What the game does not have is ignored; what is not a whole number is too. */
export function tune(values: Tunables = {}, version = 0): Tables {
  const cards = CARDS.map((card): CardDef => {
    const change = values.cards?.[card.id];
    if (!change) return card;
    const effect: Effect = { ...card.effect };
    for (const key of EFFECT_NUMBERS) {
      const value = change[key];
      if (!whole(value)) continue;
      // Nothing of a thing is the thing taken away: a card that deals 0 doesn't deal.
      if (value <= 0 || (key === "hits" && value === 1)) delete effect[key];
      else effect[key] = value;
    }
    return { ...card, cost: whole(change.cost) ? change.cost : card.cost, effect };
  });
  const foes = Object.fromEntries(
    Object.entries(FOES).map(([id, foe]) => {
      const change = values.foes?.[id];
      if (!change) return [id, foe];
      const pattern = Array.isArray(change.pattern) && change.pattern.length ? change.pattern : foe.pattern;
      return [id, { ...foe, hp: whole(change.hp) && change.hp > 0 ? change.hp : foe.hp, pattern }];
    }),
  );
  return {
    version,
    maxHp: whole(values.maxHp) && values.maxHp > 0 ? values.maxHp : DEFAULT_MAX_HP,
    rest: whole(values.rest) && values.rest >= 0 ? values.rest : DEFAULT_REST,
    cards,
    cardById: Object.fromEntries(cards.map((c) => [c.id, c])),
    foes,
  };
}

/** The game's own numbers. */
export const DEFAULT_TABLES: Tables = tune();

/** What the page asks the server for. Nothing from it is believed beyond `tune`'s own checks. */
export async function load(get: (url: string) => Promise<{ version?: unknown; values?: unknown } | null>, url = "/tunables/back-room"): Promise<Tables> {
  try {
    const saved = await get(url);
    if (!saved || !whole(saved.version) || saved.version < 1 || typeof saved.values !== "object" || saved.values === null) return DEFAULT_TABLES;
    return tune(saved.values as Tunables, saved.version);
  } catch {
    return DEFAULT_TABLES;
  }
}
