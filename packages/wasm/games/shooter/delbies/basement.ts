// The basement, and out the back. The warehouse with the forklift; the hydraulic hose room off
// it, where hose ends are crimped on, full of smoke that is bad to stand in, and where the bay
// door key is; the little bay door; and outside, the dump trailer of warrantied rotors, with
// what has been living in it. The switch on the far wall of the yard ends the game.
import { FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, type Thing } from "../../../wad/level.ts";
import type { Look, Plan } from "../../../wad/plan.ts";

const room = (look: Partial<Look> & Pick<Look, "wall">): Look => ({ floor: 0, ceiling: 128, floorFlat: "FLOOR0_3", ceilingFlat: "CEIL5_1", light: 144, ...look });

export const title = "The basement";

export const plan: Plan = {
  rooms: {
    foot: room({ wall: "BROWN1", light: 176 }),
    warehouse: room({ wall: "STONE2" }),
    crates: room({ floor: 64, floorFlat: "CRATOP1", wall: "CRATE1" }),
    // The forklift: up on its forks, a pallet.
    forklift: room({ floor: 48, floorFlat: "FLAT23", wall: "METAL1" }),
    hoseDoor: room({ wall: "STONE2", door: "DOOR3" }),
    hoseRoom: room({ floorFlat: "FLOOR4_8", light: 112, wall: "PIPE2", special: 7 }),
    // It wants the bay door key (the red one).
    bayDoor: room({ wall: "STONE2", door: "BIGDOOR1", opens: 28 }),
    yard: room({ ceiling: 224, floorFlat: "FLOOR7_1", ceilingFlat: "F_SKY1", light: 224, wall: "BRICK1" }),
    // The dump trailer: a step up onto its bed.
    trailer: room({ floor: 24, ceiling: 224, floorFlat: "FLAT23", ceilingFlat: "F_SKY1", light: 224, wall: "METAL1" }),
  },
  spaces: [
    ["foot", -96, -640, 96, -512],
    ["warehouse", -448, -512, 448, 64],
    ["crates", -352, -416, -224, -288],
    ["crates", 224, -416, 352, -288],
    ["crates", -352, -160, -224, -32],
    ["forklift", 96, -176, 224, -48],
    ["hoseDoor", 448, -256, 464, -192],
    ["hoseRoom", 464, -384, 720, -64],
    ["bayDoor", -64, 64, 64, 80],
    ["yard", -512, 80, 512, 720],
    ["trailer", -160, 352, 160, 544],
  ],
};

export const exit = { x: 0, y: 720, picture: "SW1BRN2" };

const ALL = FLAG_EASY | FLAG_MEDIUM | FLAG_HARD;
const at = (type: number, x: number, y: number, angle = 270, flags = ALL): Thing => ({ x, y, angle, type, flags });
const [GREASE_RAT, MUTANT, KING_RAT] = [3002, 3001, 3003];
const [SHOTGUN, CHAINGUN, SHELLS, SHELL_BOX, AMMO_BOX, STIMPACK, MEDIKIT, ARMOUR, RED_KEY, BARREL, DEATHMATCH] = [2001, 2002, 2008, 2049, 2048, 2011, 2012, 2018, 13, 2035, 11];

export const things: Thing[] = [
  ...[1, 2, 3, 4].map((type, i) => at(type, -72 + 48 * i, -592, 90)),
  at(SHOTGUN, 0, -480),
  at(SHELL_BOX, -32, -480),
  // The warehouse.
  at(GREASE_RAT, -400, -240),
  at(GREASE_RAT, -160, -352),
  at(GREASE_RAT, 160, -352),
  at(GREASE_RAT, 400, -128),
  at(GREASE_RAT, -160, -96),
  at(GREASE_RAT, 0, -200),
  at(GREASE_RAT, -400, 16, 0, FLAG_MEDIUM | FLAG_HARD),
  at(MUTANT, -400, -464, 0),
  at(MUTANT, 400, -464, 180),
  at(MUTANT, 300, 16, 180, FLAG_MEDIUM | FLAG_HARD),
  at(CHAINGUN, 32, -112),
  at(AMMO_BOX, -400, -120),
  at(MEDIKIT, 400, -240),
  at(ARMOUR, -288, -240),
  // The hose room: the key, and drums of fluid.
  at(RED_KEY, 656, -224),
  at(MUTANT, 592, -320, 180),
  at(MUTANT, 592, -128, 180),
  at(BARREL, 688, -352),
  at(BARREL, 688, -96),
  at(STIMPACK, 496, -352),
  // By the bay door, for what is on the other side of it.
  at(ARMOUR, -96, 16),
  at(SHELL_BOX, 96, 16),
  at(MEDIKIT, 0, 16),
  // Brake rotors, to throw (the engine's rocket launcher), and a stack more.
  at(2003, 48, 64),
  at(2046, -48, 64),
  // The yard, and the King Rat on his trailer.
  at(KING_RAT, 0, 448),
  at(GREASE_RAT, -400, 200, 0),
  at(GREASE_RAT, 400, 200, 180),
  at(GREASE_RAT, -400, 600, 0),
  at(GREASE_RAT, 400, 600, 180),
  at(GREASE_RAT, -240, 448, 0, FLAG_MEDIUM | FLAG_HARD),
  at(GREASE_RAT, 240, 448, 180, FLAG_MEDIUM | FLAG_HARD),
  at(MUTANT, -320, 660, 0, FLAG_HARD),
  at(MUTANT, 320, 660, 180, FLAG_HARD),
  at(SHELL_BOX, -464, 128),
  at(SHELL_BOX, 464, 128),
  at(AMMO_BOX, -464, 672),
  at(AMMO_BOX, 464, 672),
  at(MEDIKIT, -464, 400),
  at(MEDIKIT, 464, 400),
  at(SHELLS, 0, 160),
  at(DEATHMATCH, -400, -464, 0),
  at(DEATHMATCH, 400, 0, 180),
  at(DEATHMATCH, -464, 640, 0),
  at(DEATHMATCH, 464, 160, 180),
];
