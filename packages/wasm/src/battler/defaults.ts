// The game's own numbers in the shape the admin app's Tuning page shows them as hints, and suggests names
// from: what a host would change is a card's or a foe's number, so those are what is listed. It is kept as
// a file beside the game (public/battler-defaults.json, from `npm run battler:defaults`), and a test fails
// when the file is out of date.
import { EFFECT_NUMBERS, DEFAULT_TABLES } from "./tables.ts";

export function defaults() {
  const t = DEFAULT_TABLES;
  return {
    maxHp: t.maxHp,
    rest: t.rest,
    cards: Object.fromEntries(
      t.cards.map((card) => [card.id, { name: card.name, cost: card.cost, ...Object.fromEntries(EFFECT_NUMBERS.filter((k) => card.effect[k] !== undefined).map((k) => [k, card.effect[k]])) }]),
    ),
    foes: Object.fromEntries(Object.values(t.foes).map((foe) => [foe.id, { name: foe.name, hp: foe.hp, pattern: foe.pattern }])),
  };
}
