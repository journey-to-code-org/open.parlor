// The attic. The good side first: lit, tidy, air filters and starters and alternators in rows
// of boxes. Then, through the door at the back, the bad side: barely lit, with holes in the floor
// to watch your step round, Dorman boxes and exhaust parts, and the most rats. The attic key is
// at the far end of the bad side; the door it opens is back on the good side, and behind that
// are the stairs down to the basement.
import { FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, type Thing } from "../../../wad/level.ts";
import type { Look, Plan } from "../../../wad/plan.ts";

const room = (look: Partial<Look> & Pick<Look, "wall">): Look => ({ floor: 0, ceiling: 128, floorFlat: "FLAT5_2", ceilingFlat: "CEIL1_1", light: 208, ...look });
const STEPS = 6;

export const title = "The attic";

export const plan: Plan = {
  rooms: {
    landing: room({ wall: "BROWN1", light: 176 }),
    good: room({ wall: "WOOD1" }),
    // Boxes, nearly to the rafters.
    boxes: room({ floor: 72, floorFlat: "CRATOP1", wall: "CRATE1" }),
    sideDoor: room({ wall: "WOOD1", door: "DOOR3" }),
    bad: room({ wall: "WOOD5", light: 88 }),
    // Where the floor has gone: a step down onto what is under it, which is not good for you.
    hole: room({ floor: -24, floorFlat: "FLOOR7_1", wall: "WOOD5", light: 64, special: 7 }),
    badBoxes: room({ floor: 72, floorFlat: "CRATOP2", wall: "CRATE2", light: 88 }),
    // It wants the attic key (the yellow one).
    keyDoor: room({ wall: "WOOD1", door: "DOOR1", opens: 27 }),
    ...Object.fromEntries(Array.from({ length: STEPS }, (_, i) => [`down${i + 1}`, room({ floor: -16 * (i + 1), floorFlat: "STEP1", light: 160, wall: "BROWN1", trim: "STEP4" })])),
    bottom: room({ floor: -16 * STEPS, light: 176, wall: "BROWN1" }),
  },
  spaces: [
    ["landing", -96, -640, 96, -512],
    ["good", -384, -512, 384, -64],
    ["boxes", -320, -432, -256, -144],
    ["boxes", -160, -432, -96, -144],
    ["boxes", 96, -432, 160, -144],
    ["boxes", 256, -432, 320, -144],
    ["sideDoor", -32, -64, 32, -48],
    ["bad", -448, -48, 448, 448],
    // The ways between the holes are the planks.
    ["hole", -384, 32, -96, 160],
    ["hole", 0, 32, 384, 160],
    ["hole", -384, 224, -32, 352],
    ["hole", 64, 224, 384, 352],
    ["badBoxes", -448, 384, -352, 448],
    ["badBoxes", 352, -48, 448, 0],
    ["keyDoor", 384, -320, 400, -256],
    ...Array.from({ length: STEPS }, (_, i): Plan["spaces"][number] => [`down${i + 1}`, 400 + 24 * i, -336, 424 + 24 * i, -240]),
    ["bottom", 400 + 24 * STEPS, -368, 528 + 24 * STEPS, -208],
  ],
};

export const exit = { x: 528 + 24 * STEPS, y: -288, picture: "SW1BRN2" };

const ALL = FLAG_EASY | FLAG_MEDIUM | FLAG_HARD;
const at = (type: number, x: number, y: number, angle = 270, flags = ALL): Thing => ({ x, y, angle, type, flags });
const [GREASE_RAT, MUTANT] = [3002, 3001];
const [SHOTGUN, SHELLS, SHELL_BOX, STIMPACK, MEDIKIT, ARMOUR_BONUS, YELLOW_KEY, DEATHMATCH] = [2001, 2008, 2049, 2011, 2012, 2015, 6, 11];

export const things: Thing[] = [
  ...[1, 2, 3, 4].map((type, i) => at(type, -72 + 48 * i, -592, 90)),
  at(SHOTGUN, 0, -480),
  at(SHELLS, -32, -480),
  // The good side: a few between the rows.
  at(GREASE_RAT, -208, -200),
  at(GREASE_RAT, -208, -360),
  at(GREASE_RAT, 208, -200),
  at(GREASE_RAT, 208, -360),
  at(GREASE_RAT, 0, -160),
  at(MUTANT, -352, -100, 0),
  at(MUTANT, 352, -100, 180, FLAG_MEDIUM | FLAG_HARD),
  at(STIMPACK, -352, -480),
  at(SHELL_BOX, 352, -480),
  // The bad side: on every plank.
  at(GREASE_RAT, -416, 0, 0),
  at(GREASE_RAT, -200, 0),
  at(GREASE_RAT, 200, -10),
  at(GREASE_RAT, -48, 96),
  at(GREASE_RAT, -416, 192, 0),
  at(GREASE_RAT, -200, 192),
  at(GREASE_RAT, 200, 192),
  at(GREASE_RAT, 416, 192, 180),
  at(GREASE_RAT, 16, 288),
  at(GREASE_RAT, -200, 400),
  at(GREASE_RAT, 200, 400),
  at(GREASE_RAT, 416, 400, 180, FLAG_MEDIUM | FLAG_HARD),
  at(MUTANT, -416, 96, 0),
  at(MUTANT, 416, 288, 180),
  at(MUTANT, -100, 416),
  at(MUTANT, 100, 416, 270, FLAG_HARD),
  at(YELLOW_KEY, 0, 416),
  at(MEDIKIT, -416, 320),
  at(SHELL_BOX, 416, 96),
  at(SHELLS, -48, 192),
  ...[-300, -200, 150, 300].map((x) => at(ARMOUR_BONUS, x, 96)),
  at(STIMPACK, 600, -288),
  at(DEATHMATCH, -352, -480, 0),
  at(DEATHMATCH, 352, -96, 180),
  at(DEATHMATCH, -300, 416, 0),
  at(DEATHMATCH, 416, 0, 180),
];
