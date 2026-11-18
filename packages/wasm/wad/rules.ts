// The game's rules: what each thing is (how much it can take, how fast and big it is, what it
// sounds like and is drawn with), how much ammunition is held, and a handful of numbers the
// engine was written with. They live in a lump of the WAD called RULES, which the engine reads
// when it starts (games/shooter/engine/rules.c). It is plain text, a line each:
//
//   thing.12.health=45        a thing, by its place in the engine's list (rule-things.ts)
//   thing.12.seesound=DSRAT1  a sound by its lump's name, or - for none
//   thing.12.sprite=RATA      what it is drawn with
//   ammo.0.max=400
//   rule.gun.damage=8
//
// Only what differs from the engine's own is written, so a lump with nothing in it changes nothing.
import { RULE_THINGS, type RuleThing } from "./rule-things.ts";

/** The lump's name, and so the name its change goes by. */
export const RULES = "RULES";

/** What of a thing can be changed, and what each is. */
export const THING_NUMBERS = [
  { key: "health", label: "Health", help: "How much it takes to kill." },
  { key: "speed", label: "Speed", help: "How far it goes each step." },
  { key: "radius", label: "Half its width", help: "Too wide and it won't fit through doors." },
  { key: "height", label: "Height", help: "" },
  { key: "mass", label: "Weight", help: "Heavier is knocked back less." },
  { key: "damage", label: "Damage", help: "For something thrown or shot: what it does when it lands, times a roll of 1 to 8." },
  { key: "painchance", label: "How easily it flinches", help: "Out of 256: at 256 every hit stops it for a moment." },
  { key: "reaction", label: "How long before it acts", help: "Longer gives you the first shot." },
] as const;
export const THING_SOUNDS = [
  { key: "seesound", label: "When it notices you" },
  { key: "attacksound", label: "When it attacks" },
  { key: "painsound", label: "When it is hurt" },
  { key: "deathsound", label: "When it dies" },
  { key: "activesound", label: "Now and then" },
] as const;

/** The four kinds of ammunition, in the engine's order. */
export const AMMO = [
  { label: "Bullets", max: 200, clip: 10 },
  { label: "Shells", max: 50, clip: 4 },
  { label: "Cells", max: 300, clip: 20 },
  { label: "Rockets", max: 50, clip: 1 },
] as const;

/** The numbers by name: the key after "rule.", what the engine's own is, and what it is. */
export const NUMBERS = [
  { key: "initial_health", own: 100, label: "Health you start with", group: "You" },
  { key: "initial_bullets", own: 50, label: "Bullets you start with", group: "You" },
  { key: "max_health", own: 200, label: "The most health bonuses take you to", group: "You" },
  { key: "max_armor", own: 200, label: "The most armour bonuses take you to", group: "You" },
  { key: "max_soulsphere", own: 200, label: "The most the big health prize takes you to", group: "You" },
  { key: "soulsphere_health", own: 100, label: "What the big health prize gives", group: "You" },
  { key: "fist.damage", own: 2, label: "The fist: damage, times a roll of 1 to 10", group: "Weapons" },
  { key: "saw.damage", own: 2, label: "The chainsaw: damage, times a roll of 1 to 10", group: "Weapons" },
  { key: "gun.damage", own: 5, label: "A bullet or a pellet: damage, times a roll of 1 to 3", group: "Weapons" },
  { key: "shotgun.pellets", own: 7, label: "Pellets in a shotgun shot", group: "Weapons" },
  { key: "shotgun.scatter", own: 20, label: "How wide a shotgun shot goes (18 is tight, each one more is twice as wide)", group: "Weapons" },
  { key: "bfg_cells_per_shot", own: 40, label: "Cells the biggest gun uses a shot", group: "Weapons" },
  { key: "species_infighting", own: 0, label: "Monsters of a kind fight each other (1 for yes)", group: "Monsters" },
] as const;

/** The lump as what is set to what. */
export function readRules(data: Uint8Array | undefined): Map<string, string> {
  const rules = new Map<string, string>();
  for (const line of new TextDecoder("latin1").decode(data ?? new Uint8Array(0)).split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (line.startsWith("#") || at <= 0 || at === line.length - 1) continue;
    rules.set(line.slice(0, at), line.slice(at + 1));
  }
  return rules;
}

/** The rules as a lump: a line each, in order, so the same rules are always the same bytes. */
export function writeRules(rules: Map<string, string>): Uint8Array {
  const natural = new Intl.Collator("en", { numeric: true });
  const lines = [...rules].filter(([key, value]) => key && value !== "" && !/[=\n\r]/.test(key) && !/[\n\r]/.test(value)).sort(([a], [b]) => natural.compare(a, b));
  return new TextEncoder().encode(`# The game's rules. Read by the engine (engine/rules.c) and changed in the editor's Rules tab.\n${lines.map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
}

/** A thing's key in the lump for one of its fields. */
export const thingKey = (thing: RuleThing, field: string) => `thing.${thing.index}.${field}`;

/** The sprites and sounds the rules name: what the engine will look for, some of them under names of the WAD's own. */
export function named(rules: Map<string, string>): { sprites: string[]; sounds: string[] } {
  const [sprites, sounds] = [new Set<string>(), new Set<string>()];
  for (const [key, value] of rules) {
    if (/^thing\.\d+\.sprite$/.test(key)) sprites.add(value.toUpperCase());
    else if (/^thing\.\d+\.\w+sound$/.test(key) && value !== "-") sounds.add(value.toUpperCase());
  }
  return { sprites: [...sprites], sounds: [...sounds] };
}

export { RULE_THINGS, type RuleThing };
