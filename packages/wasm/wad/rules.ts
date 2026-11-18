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
import { ACTIONS, RULE_STATES } from "./rule-states.ts";
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

// What a thing does. A thing is always in one of the engine's moments ("states"): a picture, how
// long it lasts, something to run, and the moment after it. A kind of thing says where its
// moments start for each thing that can happen to it. The engine has 967 moments and 137 kinds of
// thing of its own, and spare places after them for a WAD's.

/** How many moments and kinds of thing are the engine's own, and how many spare places follow them (info.h). */
export const OWN_STATES = RULE_STATES.length;
export const SPARE_STATES = 512;
export const OWN_THINGS = RULE_THINGS.length;
export const SPARE_THINGS = 32;

/** Where a thing's moments start, for each thing that can happen to it. */
export const ENTRIES = [
  { key: "spawnstate", label: "Standing about" },
  { key: "seestate", label: "Once it has noticed you" },
  { key: "painstate", label: "Flinching" },
  { key: "meleestate", label: "Attacking up close" },
  { key: "missilestate", label: "Attacking from a way off" },
  { key: "deathstate", label: "Dying" },
  { key: "xdeathstate", label: "Blown apart" },
  { key: "raisestate", label: "Brought back to life" },
] as const;
export type Entry = (typeof ENTRIES)[number]["key"];

/** What the commoner things a moment can run are, in plain words. The rest go by the engine's names. */
export const ACTION_NOTES: Record<string, string> = {
  A_Look: "Watch for a player",
  A_Chase: "Go after its target, and attack when it can",
  A_FaceTarget: "Turn to face its target",
  A_Pain: "Make its hurt sound",
  A_Scream: "Make its dying sound",
  A_XScream: "Make the blown-apart sound",
  A_Fall: "Stop being in the way (it is dead)",
  A_PosAttack: "Fire a bullet",
  A_SPosAttack: "Fire a shotgun",
  A_CPosAttack: "Fire a burst",
  A_CPosRefire: "Keep firing if the target is still in sight",
  A_TroopAttack: "Claw up close, or throw a fireball",
  A_SargAttack: "Bite",
  A_HeadAttack: "Bite up close, or spit a fireball",
  A_BruisAttack: "Claw up close, or throw a green fireball",
  A_SkullAttack: "Fly at its target",
  A_BossDeath: "End the level, if it was the last of the bosses",
  A_Explode: "Explode, hurting what is near",
  A_BFGSpray: "The biggest gun's spray",
  A_Metal: "A metal footstep, then go after its target",
  A_Hoof: "A hoof step, then go after its target",
  A_BabyMetal: "A small metal footstep, then go after its target",
  A_PlayerScream: "The player's dying sound",
};
export { ACTIONS };

export interface Moment {
  /** Its number: its place in the engine's list, or a spare place past the end of it. */
  number: number;
  sprite: string;
  /** Which picture of the sprite: 0 is A. */
  frame: number;
  bright: boolean;
  /** How long it lasts, in thirty-fifths of a second; -1 is for good. */
  tics: number;
  /** What it runs, by the engine's name; "" for nothing. */
  action: string;
  next: number;
}

/** A moment as the rules leave it. */
export function momentOf(rules: Map<string, string>, number: number, depth = 0): Moment {
  const like = Number(rules.get(`state.${number}.like`));
  const own = RULE_STATES[number];
  // A spare place starts as a copy of what it is "like", or as nothing.
  const base: Moment = own
    ? { number, sprite: own[0], frame: own[1], bright: own[2] === 1, tics: own[3], action: own[4], next: own[5] }
    : Number.isInteger(like) && like !== number && depth < 8
      ? { ...momentOf(new Map(), like, depth + 1), number }
      : { number, sprite: "TROO", frame: 0, bright: false, tics: 0, action: "", next: 0 };
  const get = (field: string) => rules.get(`state.${number}.${field}`);
  const whole = (field: string, otherwise: number) => (get(field) !== undefined && /^-?\d+$/.test(get(field)!) ? Number(get(field)) : otherwise);
  return {
    number,
    sprite: get("sprite")?.toUpperCase() ?? base.sprite,
    frame: whole("frame", base.frame),
    bright: get("bright") !== undefined ? get("bright") === "1" : base.bright,
    tics: whole("tics", base.tics),
    action: get("action") !== undefined ? (get("action") === "-" ? "" : get("action")!) : base.action,
    next: whole("next", base.next),
  };
}

/** The moments from one on, each after the last, until they end, stop for good or come round again. */
export function momentsFrom(rules: Map<string, string>, start: number, most = 60): Moment[] {
  const found: Moment[] = [];
  const seen = new Set<number>();
  for (let at = start; at > 0 && !seen.has(at) && found.length < most; ) {
    seen.add(at);
    const moment = momentOf(rules, at);
    found.push(moment);
    if (moment.tics < 0) break;
    at = moment.next;
  }
  return found;
}

/** Every kind of thing as the rules leave it: the engine's own, then any the rules made. */
export function thingsOf(rules: Map<string, string>): RuleThing[] {
  const all = RULE_THINGS.map((thing) => ({ ...thing }));
  for (let index = OWN_THINGS; index < OWN_THINGS + SPARE_THINGS; index++) {
    const like = Number(rules.get(`thing.${index}.like`));
    const from = Number.isInteger(like) ? all.find((thing) => thing.index === like) : undefined;
    if (from) all.push({ ...from, index, id: `NEW_${index}`, number: -1 });
  }
  for (const thing of all) {
    const get = (field: string) => rules.get(thingKey(thing, field));
    for (const { key } of [...THING_NUMBERS, ...ENTRIES]) if (get(key) !== undefined && /^\d+$/.test(get(key)!)) thing[key] = Number(get(key));
    for (const { key } of THING_SOUNDS) if (get(key) !== undefined) thing[key] = get(key) === "-" ? "" : get(key)!;
    if (get("number") !== undefined && /^\d+$/.test(get("number")!)) thing.number = Number(get("number"));
    if (get("sprite")) thing.sprite = get("sprite")!.toUpperCase();
  }
  return all;
}

/**
 * A new kind of thing, begun as a copy of another, with moments of its own (so that changing
 * what it does leaves the one it was copied from alone) and a number of its own for levels to
 * place it by. The rules with it in, and its place; null if the spare places are used up.
 */
export function copyThing(rules: Map<string, string>, from: RuleThing): { rules: Map<string, string>; index: number } | null {
  const next = new Map(rules);
  const things = thingsOf(rules);
  let index = OWN_THINGS;
  while (things.some((thing) => thing.index === index)) index++;
  if (index >= OWN_THINGS + SPARE_THINGS) return null;
  // Its moments: every one it can reach, each given a spare place.
  const used = new Set([...rules.keys()].flatMap((key) => (/^state\.(\d+)\./.exec(key) ? [Number(/^state\.(\d+)\./.exec(key)![1])] : [])));
  const moved = new Map<number, number>();
  let free = OWN_STATES;
  const queue = ENTRIES.map(({ key }) => from[key]).filter((start) => start > 0);
  while (queue.length) {
    const at = queue.pop()!;
    if (at <= 0 || moved.has(at)) continue;
    while (used.has(free)) free++;
    if (free >= OWN_STATES + SPARE_STATES) return null;
    moved.set(at, free);
    used.add(free);
    const moment = momentOf(rules, at);
    if (moment.tics >= 0) queue.push(moment.next);
  }
  for (const [old, mine] of moved) {
    const moment = momentOf(rules, old);
    const set = (field: string, value: string) => next.set(`state.${mine}.${field}`, value);
    set("sprite", moment.sprite);
    set("frame", String(moment.frame));
    set("bright", moment.bright ? "1" : "0");
    set("tics", String(moment.tics));
    set("action", moment.action || "-");
    set("next", String(moved.get(moment.next) ?? moment.next));
  }
  // Itself: a copy of the engine's kind it comes from, then whatever the rules had changed of that.
  const root = from.index < OWN_THINGS ? from.index : Number(rules.get(`thing.${from.index}.like`));
  next.set(`thing.${index}.like`, String(root));
  for (const [key, value] of rules) {
    const field = new RegExp(`^thing\\.${from.index}\\.(\\w+)$`).exec(key)?.[1];
    if (field && field !== "like" && field !== "number") next.set(`thing.${index}.${field}`, value);
  }
  for (const { key } of ENTRIES) if (from[key] > 0) next.set(`thing.${index}.${key}`, String(moved.get(from[key])!));
  let number = 5000;
  while (things.some((thing) => thing.number === number)) number++;
  next.set(`thing.${index}.number`, String(number));
  return { rules: next, index };
}

/** The rules without a kind of thing they made, and without the moments nothing is left to reach. */
export function removeThing(rules: Map<string, string>, index: number): Map<string, string> {
  const next = new Map([...rules].filter(([key]) => !key.startsWith(`thing.${index}.`)));
  const reached = new Set<number>();
  for (const thing of thingsOf(next)) for (const { key } of ENTRIES) for (const moment of momentsFrom(next, thing[key], 400)) reached.add(moment.number);
  for (const key of [...next.keys()]) {
    const state = /^state\.(\d+)\./.exec(key);
    if (state && Number(state[1]) >= OWN_STATES && !reached.has(Number(state[1]))) next.delete(key);
  }
  return next;
}
