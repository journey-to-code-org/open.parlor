// Writes wad/things.ts: what can be placed in a level, read out of the engine's own table
// (games/shooter/engine/info.c). For each thing a level can name by number: the sprite it stands
// as, how wide it is, and what sort of thing it is. Run again if the engine's table changes:
//   node scripts/gen-things.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./toolchain.mjs";

const info = readFileSync(join(root, "games/shooter/engine/info.c"), "utf8");

// The sprite and frame of every state, by the state's name: {SPR_PLAY,0,-1,{NULL},S_NULL,0,0}, // S_PLAY
const states = new Map();
for (const [, sprite, frame, name] of info.matchAll(/^\s*\{SPR_(\w{4}),(\d+),[^\n]*\},?\s*\/\/ (S_\w+)/gm)) states.set(name, { sprite, frame: String.fromCharCode(65 + (Number(frame) & 0x7fff)) });

const things = [];
for (const [, body] of info.matchAll(/\{\s*\/\/ MT_\w+\n([\s\S]*?)\n\s*\},?/g)) {
  const field = (name) => body.match(new RegExp(`^\\s*(.+?),?\\s*// ${name}$`, "m"))?.[1].trim();
  const number = Number(field("doomednum"));
  const state = states.get(field("spawnstate"));
  if (!(number > 0) || !state) continue;
  const flags = field("flags") ?? "";
  const sort = flags.includes("MF_COUNTKILL") ? "monster" : flags.includes("MF_SPECIAL") ? "pickup" : "scenery";
  things.push({ number, sprite: state.sprite, frame: state.frame, radius: Number(field("radius").replace("*FRACUNIT", "")), sort, solid: flags.includes("MF_SOLID") });
}
things.sort((a, b) => a.number - b.number);

const rows = things.map((thing) => `  { number: ${thing.number}, sprite: "${thing.sprite}", frame: "${thing.frame}", radius: ${thing.radius}, sort: "${thing.sort}", solid: ${thing.solid} },`);
writeFileSync(
  join(root, "wad/things.ts"),
  `// What can be placed in a level, by the number a level names it by. Written by
// scripts/gen-things.mjs from the engine's own table (games/shooter/engine/info.c): don't edit it.

export interface ThingType {
  /** The number a level's THINGS lump names it by. */
  number: number;
  /** The sprite it stands as (the first four letters of its pictures' names), and the frame. */
  sprite: string;
  frame: string;
  /** Half its width, in the level's units. */
  radius: number;
  /** A monster, something to pick up, or neither. */
  sort: "monster" | "pickup" | "scenery";
  /** Whether it gets in the way. */
  solid: boolean;
}

export const THING_TYPES: ThingType[] = [
${rows.join("\n")}
];
`,
);
console.log(`things: ${things.length} kinds written to wad/things.ts`);
