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

const states = new Map();
for (const [, sprite, name] of info.matchAll(/^\s*\{SPR_(\w{4}),\d+,[^\n]*\},?\s*\/\/ (S_\w+)/gm)) states.set(name, sprite);

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
