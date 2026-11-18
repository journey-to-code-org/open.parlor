// The floors after the first three, made by rule from a number: the same number, the same floor.
// Each is a handful of rooms on a grid, joined by halls with a door in each, one door locked and
// its key somewhere on the near side of it; shelves, pillars and bad patches of floor in the
// rooms; rats, more of them and worse the further in the floor is; and a switch at the far end.
//
// Nobody laid these out. They are built to be finishable (the key is always reachable, nothing
// is placed in a wall), not to be good: the hand-made floors are main-floor.ts, attic.ts and
// basement.ts.
import { FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, type Thing } from "../../../wad/level.ts";
import type { Box, Look, Plan } from "../../../wad/plan.ts";

export interface Floor {
  title: string;
  plan: Plan;
  exit: { x: number; y: number; picture: string };
  things: Thing[];
}

/** The floors there are, by the number of the level each is (the fourth on). */
export const TITLES: Record<number, string> = {
  4: "The stock room",
  5: "Receiving",
  6: "The overflow racks",
  7: "The battery room",
  8: "The tire loft",
  9: "The paint room",
  10: "The boiler room",
  11: "The crawl space",
  12: "The nest",
};

interface Theme {
  wall: string;
  floorFlat: string;
  ceilingFlat: string;
  light: number;
  crate: string;
  crateTop: string;
  door: string;
}
// Each is the look of one of the hand-made floors, so every picture is one the game has.
const THEMES: Theme[] = [
  { wall: "WOOD5", floorFlat: "FLAT5_2", ceilingFlat: "CEIL1_1", light: 192, crate: "CRATE1", crateTop: "CRATOP1", door: "DOOR3" },
  { wall: "STONE2", floorFlat: "FLOOR0_3", ceilingFlat: "CEIL5_1", light: 160, crate: "CRATE2", crateTop: "CRATOP2", door: "DOOR3" },
  { wall: "BROWN1", floorFlat: "FLOOR4_8", ceilingFlat: "CEIL5_1", light: 176, crate: "CRATE1", crateTop: "CRATOP1", door: "DOOR1" },
  { wall: "BRICK1", floorFlat: "FLOOR7_1", ceilingFlat: "CEIL1_1", light: 144, crate: "CRATE2", crateTop: "CRATOP2", door: "DOOR1" },
];

/** From one room's middle to the next's. */
const PITCH = 768;
const HALL = 48;
const SIZES = [192, 224, 256, 288];
const WAYS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const ALL = FLAG_EASY | FLAG_MEDIUM | FLAG_HARD;
const [GREASE_RAT, MUTANT, KING_RAT] = [3002, 3001, 3003];
const [SHOTGUN, CHAINGUN, CLIP, SHELLS, SHELL_BOX, AMMO_BOX, STIMPACK, MEDIKIT, ARMOUR_BONUS, ARMOUR, DEATHMATCH] = [2001, 2002, 2007, 2008, 2049, 2048, 2011, 2012, 2015, 2018, 11];
/** A locked door's action, and the key for it: blue, yellow, red. */
const LOCKS = [{ opens: 26, key: 5 }, { opens: 27, key: 6 }, { opens: 28, key: 13 }];

/** Numbers that look random and are the same every time for the same seed (mulberry32). */
function dice(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const below = (n: number) => Math.floor(next() * n);
  return {
    below,
    chance: (odds: number) => next() < odds,
    pick: <T>(from: readonly T[]): T => from[below(from.length)]!,
    shuffle: <T>(list: T[]): T[] => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = below(i + 1);
        [list[i], list[j]] = [list[j]!, list[i]!];
      }
      return list;
    },
  };
}

interface Cell {
  cx: number;
  cy: number;
  /** Half its width and half its depth. */
  w: number;
  h: number;
  /** The room it was reached from, and how many rooms from the start it is. */
  parent: number;
  depth: number;
  kind: "open" | "shelves" | "pillars" | "holes";
}

/** The floor for a level of the game: the fourth is the first there is. */
export function generate(level: number): Floor {
  const title = TITLES[level];
  if (!title) throw new Error(`There is no made-up floor for level ${level}.`);
  const roll = dice(0xde1b1e + level * 7919);
  const theme = THEMES[level % THEMES.length]!;
  /** How far in the game this floor is, from 0 to 1. */
  const far = (level - 4) / 8;

  // The rooms: each new one beside one there already is, so they make a tree.
  const cells: Cell[] = [{ cx: 0, cy: 0, w: 224, h: 224, parent: -1, depth: 0, kind: "open" }];
  const taken = new Set(["0,0"]);
  const wanted = 6 + Math.round(far * 3) + roll.below(2);
  while (cells.length < wanted) {
    // Mostly on from the newest, so there is a long way through and a few rooms off it.
    const from = roll.chance(0.7) ? cells.length - 1 : roll.below(cells.length);
    const [dx, dy] = roll.pick(WAYS);
    const [cx, cy] = [cells[from]!.cx + dx, cells[from]!.cy + dy];
    if (taken.has(`${cx},${cy}`)) continue;
    taken.add(`${cx},${cy}`);
    cells.push({ cx, cy, w: roll.pick(SIZES), h: roll.pick(SIZES), parent: from, depth: cells[from]!.depth + 1, kind: roll.pick(["open", "shelves", "shelves", "pillars", "holes"] as const) });
  }
  // The way out is the room furthest from the start: nothing is beyond it.
  const last = cells.reduce((best, cell, index) => (cell.depth > cells[best]!.depth ? index : best), 0);
  cells[last]!.kind = "open";
  const through: number[] = [];
  for (let at = last; at >= 0; at = cells[at]!.parent) through.unshift(at);
  // One door on the way through is locked: a little past half way.
  const locked = through[Math.max(1, Math.ceil(through.length * 0.6))] ?? last;
  /** Whether a room is this side of the locked door. */
  const near = (index: number) => {
    for (let at = index; at >= 0; at = cells[at]!.parent) if (at === locked) return false;
    return true;
  };
  // The key: in the furthest room this side of the door that isn't on the way through, or failing that the room before the door.
  const off = cells.map((_, index) => index).filter((index) => index > 0 && near(index) && !through.includes(index));
  const keyRoom = off.length ? off.reduce((best, index) => (cells[index]!.depth > cells[best]!.depth ? index : best)) : cells[locked]!.parent;
  const lock = LOCKS[level % LOCKS.length]!;

  const look = (over: Partial<Look> = {}): Look => ({ floor: 0, ceiling: 128, floorFlat: theme.floorFlat, ceilingFlat: theme.ceilingFlat, light: theme.light, wall: theme.wall, ...over });
  const plan: Plan = { rooms: {}, spaces: [], blocks: [] };
  const middle = (cell: Cell): [number, number] => [cell.cx * PITCH, cell.cy * PITCH];
  const furniture: [string, ...Box][] = [];
  cells.forEach((cell, index) => {
    const [x, y] = middle(cell);
    // The further rooms are the darker ones.
    plan.rooms[`room${index}`] = look({ light: Math.max(96, theme.light - 12 * cell.depth) });
    plan.spaces.push([`room${index}`, x - cell.w, y - cell.h, x + cell.w, y + cell.h]);
    // What stands in it is in its four quarters, clear of the ways across its middle and round its walls.
    const quarters = WAYS.map((_, i): Box => {
      const [sx, sy] = [i % 2 ? -1 : 1, i < 2 ? 1 : -1];
      const [x0, x1] = [x + sx * 80, x + sx * (cell.w - 64)].sort((a, b) => a - b) as [number, number];
      const [y0, y1] = [y + sy * 80, y + sy * (cell.h - 64)].sort((a, b) => a - b) as [number, number];
      return [x0, y0, x1, y1];
    });
    if (cell.kind === "shelves") {
      plan.rooms[`crates${index}`] = look({ floor: 64, floorFlat: theme.crateTop, wall: theme.crate, light: plan.rooms[`room${index}`]!.light });
      for (const box of quarters) furniture.push([`crates${index}`, ...box]);
    } else if (cell.kind === "pillars") {
      plan.blocks!.push(...quarters);
    } else if (cell.kind === "holes") {
      // Where the floor has gone: a step down, and bad to stand in. Two quarters of the four.
      plan.rooms[`hole${index}`] = look({ floor: -24, light: 64, special: 7 });
      const first = roll.below(4);
      furniture.push([`hole${index}`, ...quarters[first]!], [`hole${index}`, ...quarters[(first + 2) % 4]!]);
    }
  });
  plan.spaces.push(...furniture);
  // A hall from each room back to the one it was reached from, and a door half way along it.
  cells.forEach((cell, index) => {
    if (cell.parent < 0) return;
    const from = cells[cell.parent]!;
    const [[ax, ay], [bx, by]] = [middle(from), middle(cell)];
    const across = cell.cy === from.cy;
    const hall: Box = across
      ? [Math.min(ax + from.w, bx + cell.w), ay - HALL, Math.max(ax - from.w, bx - cell.w), ay + HALL]
      : [ax - HALL, Math.min(ay + from.h, by + cell.h), ax + HALL, Math.max(ay - from.h, by - cell.h)];
    const half = across ? (hall[0] + hall[2]) / 2 : (hall[1] + hall[3]) / 2;
    plan.rooms[`hall${index}`] = look({ ceiling: 96, light: Math.max(96, theme.light - 32) });
    plan.rooms[`door${index}`] = look({ ceiling: 96, door: index === locked ? "DOOR1" : theme.door, ...(index === locked ? { opens: lock.opens } : {}) });
    plan.spaces.push([`hall${index}`, ...hall]);
    plan.spaces.push([`door${index}`, ...(across ? [half - 8, hall[1], half + 8, hall[3]] : [hall[0], half - 8, hall[2], half + 8]) as Box]);
  });
  // The switch out: in a nook in the far wall of the last room, across from the way into it.
  const end = cells[last]!;
  const [ex, ey] = middle(end);
  const [ox, oy] = [end.cx - cells[end.parent]!.cx, end.cy - cells[end.parent]!.cy];
  plan.spaces.push([`room${last}`, ...(ox ? [ex + ox * end.w - (ox < 0 ? 32 : 0), ey - 32, ex + ox * end.w + (ox > 0 ? 32 : 0), ey + 32] : [ex - 32, ey + oy * end.h - (oy < 0 ? 32 : 0), ex + 32, ey + oy * end.h + (oy > 0 ? 32 : 0)]) as Box]);
  const exit = { x: ex + ox * (end.w + 32), y: ey + oy * (end.h + 32), picture: "SW1BRN2" };
  if (!plan.blocks!.length) delete plan.blocks;

  // What is in the rooms. A room's free places are along the two ways across its middle and in its corners.
  const things: Thing[] = [];
  const put = (type: number, x: number, y: number, angle = 270, flags = ALL) => things.push({ x, y, angle, type, flags });
  /** Which way a room's way in is, in degrees, for what is in it to face. */
  const facing = (cell: Cell) => {
    if (cell.parent < 0) return 90;
    const from = cells[cell.parent]!;
    return from.cx > cell.cx ? 0 : from.cx < cell.cx ? 180 : from.cy > cell.cy ? 90 : 270;
  };
  // The King Rat's relations, on the later floors, by the switch; and on the last floor, two.
  const kings = level === 12 ? 2 : level >= 8 && level % 2 === 0 ? 1 : 0;
  cells.forEach((cell, index) => {
    const [x, y] = middle(cell);
    const places: [number, number][] = [];
    for (let k = 64; k <= cell.w - 40; k += 64) places.push([x + k, y], [x - k, y]);
    for (let k = 64; k <= cell.h - 40; k += 64) places.push([x, y + k], [x, y - k]);
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) places.push([x + sx * (cell.w - 32), y + sy * (cell.h - 32)]);
    roll.shuffle(places);
    const angle = facing(cell);
    const next = () => places.pop()!;
    if (index === 0) {
      // Where the players start, facing the first hall, with something to hold.
      const first = cells.find((one) => one.parent === 0)!;
      const towards = first.cx > 0 ? 0 : first.cx < 0 ? 180 : first.cy > 0 ? 90 : 270;
      [1, 2, 3, 4].forEach((type, i) => put(type, x - 24 + 48 * (i % 2), y - 24 + 48 * Math.floor(i / 2), towards));
      // Not on top of them.
      const clear = places.filter(([px, py]) => Math.hypot(px - x, py - y) > 96);
      places.length = 0;
      places.push(...clear);
      put(SHOTGUN, ...next());
      put(SHELL_BOX, ...next());
      put(CLIP, ...next());
      if (keyRoom === 0) put(lock.key, ...next());
      put(DEATHMATCH, ...next(), towards);
      return;
    }
    // Room by the switch for the King Rat's relations, where there are any.
    if (index === last && kings) places.splice(0, places.length, ...places.filter(([px, py]) => Math.hypot(px - x, py - y) > 150));
    if (index === keyRoom) put(lock.key, ...next());
    // The rats: more of them the further in the game and the further into the floor.
    const rats = Math.min(places.length - 8, 2 + Math.round(far * 4) + Math.min(3, cell.depth) + roll.below(2));
    for (let i = 0; i < rats; i++) {
      const mutant = roll.chance(0.2 + far * 0.35);
      put(mutant ? MUTANT : GREASE_RAT, ...next(), angle, i < 2 ? ALL : i % 3 === 2 ? FLAG_HARD : FLAG_MEDIUM | FLAG_HARD);
    }
    // Something for the trouble.
    put(roll.chance(0.5) ? SHELLS : CLIP, ...next());
    if (index % 2) put(STIMPACK, ...next());
    if (!through.includes(index) || index === last) put(roll.chance(0.5) ? MEDIKIT : SHELL_BOX, ...next());
    if (index === keyRoom && level >= 5) put(CHAINGUN, ...next());
    if (index === keyRoom) put(AMMO_BOX, ...next());
    if (index === locked) put(ARMOUR, ...next());
    if (roll.chance(0.4) && places.length) put(ARMOUR_BONUS, ...next());
  });
  for (let i = 0; i < kings; i++) put(KING_RAT, ex + (ox ? 0 : (i ? 72 : -72) * (kings - 1)), ey + (ox ? (i ? 72 : -72) * (kings - 1) : 0), facing(end));
  // Where a game against each other puts people: four rooms, the start among them.
  for (const index of [keyRoom, last, locked]) if (index > 0) put(DEATHMATCH, ...middle(cells[index]!), facing(cells[index]!));
  return { title, plan, exit, things };
}
