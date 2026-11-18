// The main floor: the front porch, the store front with its counter and aisles, and the back
// rooms. The way out is up the stairs at the back, to the attic.
//
// North is the back of the store. A wall between two rooms is a gap of 16 left between them.
import { FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, type Thing } from "../../../wad/level.ts";
import type { Look, Plan } from "../../../wad/plan.ts";

const room = (look: Partial<Look> & Pick<Look, "wall">): Look => ({ floor: 0, ceiling: 128, floorFlat: "FLOOR0_1", ceilingFlat: "CEIL3_5", light: 176, ...look });
const door = (look: Partial<Look> = {}): Look => room({ wall: "GRAY1", door: "DOOR3", ...look });
const STEPS = 8;

export const title = "The main floor";

export const plan: Plan = {
  rooms: {
    // Outside, under the sky.
    porch: room({ ceiling: 176, floorFlat: "FLAT5_2", ceilingFlat: "F_SKY1", light: 224, wall: "BRICK1" }),
    frontDoor: door({ door: "BIGDOOR2" }),
    // The store front, and behind the counter.
    store: room({ wall: "GRAY1" }),
    // Too high to climb, low enough to see over.
    counter: room({ floor: 40, floorFlat: "FLAT5_2", wall: "WOOD1" }),
    // Rows of boxes on shelves, nearly to the ceiling.
    shelves: room({ floor: 96, floorFlat: "CRATOP2", wall: "CRATWIDE" }),
    breakDoor: door(),
    hallDoor: door(),
    returnsDoor: door(),
    breakRoom: room({ floorFlat: "FLOOR5_1", light: 160, wall: "BROWN1" }),
    hall: room({ light: 144, wall: "GRAY4" }),
    // George's desk: warranties and returns, and boxes of both.
    returns: room({ light: 160, wall: "BROWNGRN" }),
    returnsBoxes: room({ floor: 64, floorFlat: "CRATOP1", wall: "CRATE1" }),
    // Occupied. It wants the bathroom key (the blue one).
    bathDoor: door({ opens: 26, door: "DOORBLU2" }),
    bathroom: room({ floorFlat: "FLOOR4_8", light: 208, wall: "STONE2", special: 9 }),
    // Jessica's office: the light is off after half past two.
    officeDoor: door(),
    office: room({ floorFlat: "FLAT14", light: 96, wall: "PANEL1" }),
    ...Object.fromEntries(Array.from({ length: STEPS }, (_, i) => [`step${i + 1}`, room({ floor: 16 * (i + 1), ceiling: 288, floorFlat: "STEP1", light: 160, wall: "BROWN1", trim: "STEP4" })])),
    landing: room({ floor: 16 * STEPS, ceiling: 288, light: 192, wall: "BROWN1" }),
  },
  spaces: [
    ["porch", -256, -704, 256, -528],
    ["frontDoor", -64, -528, 64, -512],
    ["store", -448, -512, 448, -48],
    // The counter runs from the west wall; the way round it is at the east end.
    ["counter", -448, -208, 256, -176],
    ["shelves", -368, -448, -336, -272],
    ["shelves", -208, -448, -176, -272],
    ["shelves", 176, -448, 208, -272],
    ["shelves", 336, -448, 368, -272],
    ["breakDoor", -336, -48, -272, -32],
    ["hallDoor", -32, -48, 32, -32],
    ["returnsDoor", 272, -48, 336, -32],
    ["breakRoom", -448, -32, -112, 224],
    ["hall", -96, -32, 96, 480],
    ["returns", 112, -32, 448, 224],
    ["returnsBoxes", 368, -32, 448, 32],
    ["returnsBoxes", 112, 160, 176, 224],
    ["bathDoor", -112, 304, -96, 368],
    ["bathroom", -320, 256, -112, 416],
    ["officeDoor", 96, 304, 112, 368],
    ["office", 112, 256, 352, 416],
    ...Array.from({ length: STEPS }, (_, i): Plan["spaces"][number] => [`step${i + 1}`, -48, 480 + 24 * i, 48, 504 + 24 * i]),
    ["landing", -96, 480 + 24 * STEPS, 96, 608 + 24 * STEPS],
  ],
};

/** The switch at the top of the stairs that ends the level: where its wall is, and what it looks like. */
export const exit = { x: 0, y: 608 + 24 * STEPS, picture: "SW1BRN2" };

const ALL = FLAG_EASY | FLAG_MEDIUM | FLAG_HARD;
const at = (type: number, x: number, y: number, angle = 270, flags = ALL): Thing => ({ x, y, angle, type, flags });
const PLAYERS = [1, 2, 3, 4];
// The rats take the place of two of the engine's monsters: a grease rat is its charging one, a
// brake-fluid mutant the one that throws.
const [GREASE_RAT, MUTANT] = [3002, 3001];
const [SHOTGUN, SHELLS, SHELL_BOX, CLIP, TORCH] = [2001, 2008, 2049, 2007, 2005];
const [STIMPACK, MEDIKIT, ARMOUR, HEALTH_BONUS, ARMOUR_BONUS] = [2011, 2012, 2018, 2014, 2015];
const [BLUE_KEY, BARREL, DEATHMATCH] = [5, 2035, 11];

export const things: Thing[] = [
  // On the porch, facing the door.
  ...PLAYERS.map((type, i) => at(type, -96 + 64 * i, -640, 90)),
  at(CLIP, 0, -576),
  at(CLIP, -32, -576),
  // The aisles: grease rats between the shelves.
  at(GREASE_RAT, -272, -360),
  at(GREASE_RAT, -272, -420),
  at(GREASE_RAT, 0, -300),
  at(GREASE_RAT, 272, -360),
  at(GREASE_RAT, 272, -420),
  at(GREASE_RAT, -416, -300, 0, FLAG_MEDIUM | FLAG_HARD),
  at(GREASE_RAT, 416, -300, 180, FLAG_MEDIUM | FLAG_HARD),
  at(SHELLS, -272, -300),
  at(SHELLS, 272, -300),
  // Behind the counter.
  at(MUTANT, -200, -112),
  at(SHOTGUN, 320, -112),
  at(GREASE_RAT, 0, -112, 270, FLAG_HARD),
  // The break room: someone's leftover pasta, and what came for it.
  at(GREASE_RAT, -300, 100),
  at(GREASE_RAT, -200, 160),
  at(GREASE_RAT, -360, 60),
  at(STIMPACK, -420, 190),
  at(STIMPACK, -380, 190),
  at(STIMPACK, -340, 190),
  at(MEDIKIT, -420, 0),
  // Returns: the bathroom key is on George's desk.
  at(MUTANT, 280, 100),
  at(GREASE_RAT, 400, 100, 180),
  at(ARMOUR, 420, 190),
  at(BLUE_KEY, 220, 190),
  at(BARREL, 200, 20),
  at(BARREL, 240, 20),
  // The hall.
  at(GREASE_RAT, 0, 300),
  ...[40, 120, 200, 420].map((y) => at(HEALTH_BONUS, 0, y)),
  // The bathroom.
  at(SHELL_BOX, -290, 390),
  at(MEDIKIT, -200, 330),
  // Under the sink: a torch and a can of brake cleaner (the engine's chainsaw).
  at(TORCH, -250, 300),
  // The office.
  at(MUTANT, 250, 340, 180),
  at(SHELL_BOX, 320, 390),
  ...[150, 190, 230, 270].map((x) => at(ARMOUR_BONUS, x, 280)),
  // The top of the stairs.
  at(MUTANT, 0, 480 + 24 * STEPS + 80),
  // For playing against each other.
  at(DEATHMATCH, -400, -480, 0),
  at(DEATHMATCH, 400, -480, 180),
  at(DEATHMATCH, -400, 180, 270),
  at(DEATHMATCH, 300, 380, 180),
  at(DEATHMATCH, 0, 480 + 24 * STEPS + 96, 270),
];
