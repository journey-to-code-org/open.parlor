// Writes wad/rule-things.ts: every kind of thing the engine has, in the order of its own table
// (games/shooter/engine/info.c), with what it is as the engine was written: how much it can take,
// how fast and big it is, and what it sounds like. This is what the editor's Rules tab lists, and
// a thing's place in the list is how a RULES lump names it (games/shooter/engine/rules.c). Run
// again if the engine's table changes:
//   node scripts/gen-rules.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./toolchain.mjs";

const info = readFileSync(join(root, "games/shooter/engine/info.c"), "utf8");

// Every moment a thing can be in, in the engine's order: {SPR_TROO,0,10,{A_Look},S_TROO_STND2,0,0}, // S_TROO_STND
const moments = [...info.matchAll(/^\s*\{SPR_(\w{4}),(\d+),(-?\d+),\{(\w+)\},(S_\w+),[^\n]*\},?\s*\/\/ (S_\w+)/gm)].map(([, sprite, frame, tics, action, next, id]) => ({ id, sprite, frame: Number(frame) & 0x7fff, bright: (Number(frame) & 0x8000) !== 0, tics: Number(tics), action: action === "NULL" ? "" : action, next }));
const place = new Map(moments.map((moment, index) => [moment.id, index]));
const states = new Map(moments.map((moment) => [moment.id, moment.sprite]));
// What a moment can run: the engine's own list of them, as info.c declares it.
const actions = [...info.matchAll(/^void\s+(A_\w+)\s*\(\s*\)\s*;/gm)].map(([, name]) => name);
writeFileSync(
  join(root, "games/shooter/engine/rules_actions.h"),
  `// [open.wasm] A new file. What a moment of a thing can run, by the engine's name for it: for the
// WAD's rules to name (rules.c). Written by scripts/gen-rules.mjs from info.c: don't edit it.
${actions.map((name) => `void ${name}();`).join("\n")}

static const struct
{
    const char *name;
    void (*action)();
} rules_actions[] = {
${actions.map((name) => `    {"${name}", ${name}},`).join("\n")}
};
`,
);
writeFileSync(
  join(root, "wad/rule-states.ts"),
  `// Every moment a thing can be in, in the engine's order, as the engine was written: the sprite,
// which picture of it (0 is A), whether it is lit, how long it lasts (in thirty-fifths of a
// second; -1 is for good), what it runs, and the moment after it. Written by
// scripts/gen-rules.mjs from games/shooter/engine/info.c: don't edit it.

export type RuleState = [sprite: string, frame: number, bright: 0 | 1, tics: number, action: string, next: number];

export const RULE_STATES: RuleState[] = [
${moments.map((moment) => `  ${JSON.stringify([moment.sprite, moment.frame, moment.bright ? 1 : 0, moment.tics, moment.action, place.get(moment.next) ?? 0])},`).join("\n")}
];

/** What a moment can run, by the engine's names. */
export const ACTIONS: string[] = ${JSON.stringify(actions)};
`,
);

const things = [];
for (const [, id, body] of info.matchAll(/\{\s*\/\/ (MT_\w+)\n([\s\S]*?)\n\s*\},?/g)) {
  const field = (name) => body.match(new RegExp(`^\\s*(.+?),?\\s*// ${name}$`, "m"))?.[1].trim() ?? "";
  const whole = (name) => Number(field(name).replace(/\s*\*\s*FRACUNIT/, "")) || 0;
  const sound = (name) => (field(name) === "sfx_None" || field(name) === "0" || !field(name) ? "" : `DS${field(name).replace("sfx_", "").toUpperCase()}`);
  const flags = field("flags");
  things.push({
    index: things.length,
    id,
    number: Number(field("doomednum")),
    sprite: states.get(field("spawnstate")) ?? "",
    // Where its moments start, by their place in the engine's list (0 is none).
    spawnstate: place.get(field("spawnstate")) ?? 0,
    seestate: place.get(field("seestate")) ?? 0,
    painstate: place.get(field("painstate")) ?? 0,
    meleestate: place.get(field("meleestate")) ?? 0,
    missilestate: place.get(field("missilestate")) ?? 0,
    deathstate: place.get(field("deathstate")) ?? 0,
    xdeathstate: place.get(field("xdeathstate")) ?? 0,
    raisestate: place.get(field("raisestate")) ?? 0,
    sort: flags.includes("MF_COUNTKILL") ? "monster" : flags.includes("MF_MISSILE") ? "shot" : flags.includes("MF_SPECIAL") ? "pickup" : id === "MT_PLAYER" ? "player" : "scenery",
    health: whole("spawnhealth"),
    speed: whole("speed"),
    radius: whole("radius"),
    height: whole("height"),
    mass: whole("mass"),
    damage: whole("damage"),
    painchance: whole("painchance"),
    reaction: whole("reactiontime"),
    seesound: sound("seesound"),
    attacksound: sound("attacksound"),
    painsound: sound("painsound"),
    deathsound: sound("deathsound"),
    activesound: sound("activesound"),
  });
}

writeFileSync(
  join(root, "wad/rule-things.ts"),
  `// Every kind of thing the engine has, in its own order, as the engine was written. Written by
// scripts/gen-rules.mjs from games/shooter/engine/info.c: don't edit it.

export interface RuleThing {
  /** Its place in the engine's list: how a RULES lump names it. */
  index: number;
  /** The engine's name for it. */
  id: string;
  /** The number a level names it by, or -1 if it is never placed in one. */
  number: number;
  /** The sprite it stands as. */
  sprite: string;
  sort: "monster" | "shot" | "pickup" | "player" | "scenery";
  /** Where its moments start, by their place in the engine's list: 0 is none. */
  spawnstate: number;
  seestate: number;
  painstate: number;
  meleestate: number;
  missilestate: number;
  deathstate: number;
  xdeathstate: number;
  raisestate: number;
  health: number;
  speed: number;
  radius: number;
  height: number;
  mass: number;
  damage: number;
  painchance: number;
  reaction: number;
  /** Its sounds, by their lumps' names; "" for none. */
  seesound: string;
  attacksound: string;
  painsound: string;
  deathsound: string;
  activesound: string;
}

export const RULE_THINGS: RuleThing[] = [
${things.map((thing) => `  ${JSON.stringify(thing)},`).join("\n")}
];
`,
);
console.log(`rules: ${things.length} kinds of thing written to wad/rule-things.ts`);
