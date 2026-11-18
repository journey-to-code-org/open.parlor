// Changes to what a level is built of: moving a corner, splitting a wall, adding a room, taking a
// room or a corner away. Each takes a shape and changes it in place, or leaves it alone and says
// why it can't be done. And a level to start from: one empty room.
//
// What a level's shape has to be for the engine to draw it: every wall's front is in a room; a
// wall with a room behind it has a back; no two walls cross; and each room is closed, its walls
// meeting corner to corner all the way round. Nothing here opens a room, and anything that would
// make walls cross is refused.
import { type Corner, FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, type Room, type Shape, type Side, type Thing, type Wall, WALL_BLOCKS, WALL_TWO_SIDED } from "./level.ts";

/** Corners are kept on a grid of this many units, the size wall pictures line up on. */
export const GRID = 8;
export const snap = (value: number) => Math.round(value / GRID) * GRID;

/** Twice the area of the triangle a, b, c: positive when c is to the left of a going to b. */
const turn = (a: Corner, b: Corner, c: Corner) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const same = (a: Corner, b: Corner) => a.x === b.x && a.y === b.y;

/** Whether two stretches cross, or one's end lies along the other. Meeting at an end doesn't count. */
function cross(a: Corner, b: Corner, c: Corner, d: Corner): boolean {
  const [abc, abd, cda, cdb] = [turn(a, b, c), turn(a, b, d), turn(c, d, a), turn(c, d, b)];
  if (abc === 0 && abd === 0) {
    // Along the same line: they cross if they share more than a point.
    const along = (p: Corner) => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? p.x : p.y);
    const [a1, a2] = [Math.min(along(a), along(b)), Math.max(along(a), along(b))];
    const [c1, c2] = [Math.min(along(c), along(d)), Math.max(along(c), along(d))];
    return Math.min(a2, c2) > Math.max(a1, c1);
  }
  const meet = same(a, c) || same(a, d) || same(b, c) || same(b, d);
  if (meet) return false;
  return abc > 0 !== abd > 0 && cda > 0 !== cdb > 0 ? true : (abc === 0 && within(a, b, c)) || (abd === 0 && within(a, b, d)) || (cda === 0 && within(c, d, a)) || (cdb === 0 && within(c, d, b));
}
/** p, known to be on the line through a and b, is between them. */
const within = (a: Corner, b: Corner, p: Corner) => Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);

/** Why these walls can't stand as they are, among all the level's walls; null if they can. */
export function trouble(shape: Shape, walls: number[]): string | null {
  for (const index of walls) {
    const wall = shape.walls[index]!;
    const [a, b] = [shape.corners[wall.from]!, shape.corners[wall.to]!];
    if (same(a, b)) return "That would leave a wall with no length.";
    for (let other = 0; other < shape.walls.length; other++) {
      if (other === index) continue;
      const one = shape.walls[other]!;
      // Two walls between the same two corners are one on top of the other.
      if ((one.from === wall.from && one.to === wall.to) || (one.from === wall.to && one.to === wall.from)) return "That would put one wall on top of another.";
      if (cross(a, b, shape.corners[one.from]!, shape.corners[one.to]!)) return "Walls can't cross.";
    }
  }
  return null;
}

/** The walls that end at a corner. */
export const wallsAt = (shape: Shape, corner: number) => shape.walls.flatMap((wall, index) => (wall.from === corner || wall.to === corner ? [index] : []));

/** Moves a corner, and every wall that ends at it. */
export function moveCorner(shape: Shape, corner: number, x: number, y: number): string | null {
  const at = shape.corners[corner]!;
  const was = { ...at };
  if (shape.corners.some((other, index) => index !== corner && other.x === x && other.y === y && wallsAt(shape, index).length)) return "There is a corner there already.";
  Object.assign(at, { x, y });
  const why = trouble(shape, wallsAt(shape, corner));
  if (why) Object.assign(at, was);
  return why;
}

/**
 * The room a point is in, or -1 for none. Looks along a line to the right of the point for the
 * nearest wall, and takes the room on the side of it the point is on.
 */
export function roomAt(shape: Shape, x: number, y: number): number {
  let nearest = Infinity;
  let found = -1;
  for (const wall of shape.walls) {
    const [a, b] = [shape.corners[wall.from]!, shape.corners[wall.to]!];
    // Counted from its lower end up to, not including, its upper: a corner on the line is one crossing.
    if (a.y === b.y || y < Math.min(a.y, b.y) || y >= Math.max(a.y, b.y)) continue;
    const reach = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x) - x;
    if (reach < 0 || reach >= nearest) continue;
    nearest = reach;
    // The front is on the right of a wall: where the point is if the wall, seen from it, goes downward.
    const side = b.y < a.y ? wall.front : wall.back;
    found = side < 0 ? -1 : shape.sides[side]!.room;
  }
  return found;
}

const length = (shape: Shape, wall: Wall) => Math.hypot(shape.corners[wall.to]!.x - shape.corners[wall.from]!.x, shape.corners[wall.to]!.y - shape.corners[wall.from]!.y);

/**
 * Splits a wall in two at the point of it nearest (x, y), or its middle. The new corner's number
 * comes back, or why it can't be split. A point off the grid makes a corner off the wall's line
 * by a fraction of a unit, as any corner on a slanted wall is.
 */
export function splitWall(shape: Shape, index: number, x?: number, y?: number): number | string {
  const wall = shape.walls[index]!;
  const [a, b] = [shape.corners[wall.from]!, shape.corners[wall.to]!];
  const whole = length(shape, wall);
  let along = 0.5;
  if (x !== undefined && y !== undefined) along = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (whole * whole)));
  // On the grid if the wall allows it, and never at either end: a point too near one is taken for the middle.
  const place = (along: number) => {
    const on = { x: snap(a.x + (b.x - a.x) * along), y: snap(a.y + (b.y - a.y) * along) };
    return turn(a, b, on) === 0 && within(a, b, on) ? on : { x: Math.round(a.x + (b.x - a.x) * along), y: Math.round(a.y + (b.y - a.y) * along) };
  };
  let at = place(along);
  if (same(at, a) || same(at, b)) at = place(0.5);
  if (same(at, a) || same(at, b)) return "This wall is too short to split.";
  const corner = shape.corners.push(at) - 1;
  const first = Math.round(Math.hypot(at.x - a.x, at.y - a.y));
  const copy = (side: number, shift: number) => (side < 0 ? -1 : shape.sides.push({ ...shape.sides[side]!, x: shape.sides[side]!.x + shift }) - 1);
  // The second half's pictures carry on where the first half's stop; from behind, it is the first half that carries on.
  const half: Wall = { ...wall, from: corner, front: copy(wall.front, first), back: copy(wall.back, 0) };
  if (wall.back >= 0) shape.sides[wall.back]!.x += Math.round(whole) - first;
  wall.to = corner;
  shape.walls.splice(index + 1, 0, half);
  return corner;
}

/** A wall picture the room already has, for new walls in it to match. */
function pictureIn(shape: Shape, room: number): string {
  const counts = new Map<string, number>();
  for (const side of shape.sides) if (side.room === room) for (const name of [side.middle, side.upper, side.lower]) if (name !== "-") counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? shape.sides.find((side) => side.middle !== "-")?.middle ?? "-";
}

const side = (room: number, picture: string, open: boolean): Side => ({ x: 0, y: 0, upper: open ? picture : "-", lower: open ? picture : "-", middle: open ? "-" : picture, room });

/** Puts the new walls in, or takes everything added since `mark` out again and says why not. */
function settle(shape: Shape, mark: { corners: number; walls: number; sides: number; rooms: number }): string | null {
  const why = trouble(shape, Array.from({ length: shape.walls.length - mark.walls }, (_, i) => mark.walls + i));
  if (why) {
    shape.corners.length = mark.corners;
    shape.walls.length = mark.walls;
    shape.sides.length = mark.sides;
    shape.rooms.length = mark.rooms;
  }
  return why;
}
const marked = (shape: Shape) => ({ corners: shape.corners.length, walls: shape.walls.length, sides: shape.sides.length, rooms: shape.rooms.length });

/**
 * A square room inside the room at (x, y), `size` across: a platform, a pit or a pillar once its
 * floor and ceiling are changed. It starts as a copy of the room round it, so nothing is seen
 * until they are. The new room's number comes back, or why it can't be put there.
 */
export function addRoomInside(shape: Shape, x: number, y: number, size = 128): number | string {
  const half = size / 2;
  const [cx, cy] = [snap(x), snap(y)];
  // Clockwise, so that each wall's front (its right) is inside.
  const at = [
    { x: cx - half, y: cy - half },
    { x: cx - half, y: cy + half },
    { x: cx + half, y: cy + half },
    { x: cx + half, y: cy - half },
  ];
  const round = roomAt(shape, cx, cy);
  if (round < 0 || at.some((corner) => roomAt(shape, corner.x, corner.y) !== round)) return "There isn't room for it there: it has to fit inside one room.";
  const mark = marked(shape);
  const room = shape.rooms.push({ ...shape.rooms[round]!, special: 0, tag: 0 }) - 1;
  const picture = pictureIn(shape, round);
  const first = shape.corners.push(...at) - 4;
  for (let i = 0; i < 4; i++) {
    const front = shape.sides.push(side(room, picture, true)) - 1;
    const back = shape.sides.push(side(round, picture, true)) - 1;
    shape.walls.push({ from: first + i, to: first + ((i + 1) % 4), flags: WALL_TWO_SIDED, special: 0, tag: 0, front, back });
  }
  return settle(shape, mark) ?? room;
}

/**
 * A room on the far side of a wall that has nothing behind it, `depth` deep: the wall becomes an
 * opening into it. The new room is a copy of the one in front. Its number comes back, or why not.
 */
export function addRoomBeyond(shape: Shape, index: number, depth = 128): number | string {
  const wall = shape.walls[index]!;
  if (wall.back >= 0) return "There is a room behind this wall already.";
  const [a, b] = [shape.corners[wall.from]!, shape.corners[wall.to]!];
  const whole = length(shape, wall);
  // Behind is to the left, going from the wall's first corner to its second.
  const out = { x: (-(b.y - a.y) / whole) * depth, y: ((b.x - a.x) / whole) * depth };
  const mark = marked(shape);
  const front = shape.sides[wall.front]!;
  const picture = front.middle !== "-" ? front.middle : pictureIn(shape, front.room);
  const room = shape.rooms.push({ ...shape.rooms[front.room]!, special: 0, tag: 0 }) - 1;
  const far = shape.corners.push({ x: Math.round(a.x + out.x), y: Math.round(a.y + out.y) }, { x: Math.round(b.x + out.x), y: Math.round(b.y + out.y) }) - 2;
  // Round the new room with it on the right: out from the first corner, along the back, and in to the second.
  for (const [from, to] of [[wall.from, far], [far, far + 1], [far + 1, wall.to]] as const) shape.walls.push({ from, to, flags: WALL_BLOCKS, special: 0, tag: 0, front: shape.sides.push(side(room, picture, false)) - 1, back: -1 });
  const why = settle(shape, mark);
  if (why) return why;
  // The wall itself is now an opening: nothing across it, and its picture kept for when the two rooms' heights part.
  Object.assign(front, { upper: picture, lower: picture, middle: "-" });
  wall.back = shape.sides.push(side(room, picture, true)) - 1;
  wall.flags = (wall.flags | WALL_TWO_SIDED) & ~WALL_BLOCKS;
  return room;
}

/** How thick a door is. */
const DOOR = 16;

/**
 * A door in a wall that has nothing behind it, and a room behind the door, `depth` deep. A door
 * is a thin room with its ceiling on its floor, between two openings that lift it when pushed;
 * it opens from either side. `picture`, if given, is what the door looks like; otherwise it
 * looks like the wall. The room behind comes back, or why it can't be done.
 */
export function addDoor(shape: Shape, index: number, depth = 128, picture?: string): number | string {
  const before = structuredClone(shape);
  const door = addRoomBeyond(shape, index, DOOR);
  if (typeof door === "string") return door;
  // The door's far wall is the second of the three that were made.
  const far = shape.walls.length - 2;
  const beyond = addRoomBeyond(shape, far, depth);
  if (typeof beyond === "string") {
    Object.assign(shape, before);
    return beyond;
  }
  // Shut, after the room behind was copied from it. Pushed from the front only, so the far opening is turned to face the room behind.
  shape.rooms[door]!.ceiling = shape.rooms[door]!.floor;
  flip(shape.walls[far]!);
  for (const opening of [shape.walls[index]!, shape.walls[far]!]) {
    opening.special = 1;
    if (picture) shape.sides[opening.front]!.upper = picture;
  }
  return beyond;
}

/** A change to a room that the engine can't draw: its ceiling below its floor. */
export const roomTrouble = (room: Room) => (room.ceiling < room.floor ? "A room's ceiling can't be below its floor." : null);

/** The room on one side of a wall; -1 for the back of a wall that has none. */
const roomOn = (shape: Shape, wall: Wall, which: "front" | "back") => (wall[which] < 0 ? -1 : shape.sides[wall[which]]!.room);
/** The walls of a room: those with a side in it. */
export const wallsOf = (shape: Shape, room: number) => shape.walls.flatMap((wall, index) => (roomOn(shape, wall, "front") === room || roomOn(shape, wall, "back") === room ? [index] : []));

/** Turns a wall round: its front is its back. Only a wall with a room on both sides can be. */
function flip(wall: Wall) {
  [wall.from, wall.to, wall.front, wall.back] = [wall.to, wall.from, wall.back, wall.front];
}

/**
 * Takes a room away. A room that lies inside one other (all its walls openings into it) is
 * taken with its walls, and the room round it closes over where it was. Any other room leaves a
 * hole: its openings into its neighbours become their walls, and its own walls go. `placed` is
 * where things are in the level: nothing may be left in a hole.
 */
export function removeRoom(shape: Shape, room: number, placed: Corner[] = []): string | null {
  if (shape.rooms.length < 2) return "A level needs one room at least.";
  const own = wallsOf(shape, room);
  const beyond = (wall: Wall) => (roomOn(shape, wall, "front") === room ? roomOn(shape, wall, "back") : roomOn(shape, wall, "front"));
  const neighbours = new Set(own.map((index) => beyond(shape.walls[index]!)));
  const inside = neighbours.size === 1 && !neighbours.has(-1) && !neighbours.has(room);
  if (!inside && placed.some((thing) => roomAt(shape, thing.x, thing.y) === room)) return "Move what is placed in it somewhere else first: it would be left inside solid wall.";
  const gone = new Set<number>();
  for (const index of own) {
    const wall = shape.walls[index]!;
    const next = beyond(wall);
    // An opening into another room becomes that room's wall, in the picture that was above or below the opening.
    if (inside || next < 0 || next === room) {
      gone.add(index);
      continue;
    }
    if (roomOn(shape, wall, "front") === room) flip(wall);
    const kept = shape.sides[wall.front]!;
    const picture = [kept.middle, kept.upper, kept.lower].find((name) => name !== "-") ?? pictureIn(shape, next);
    Object.assign(kept, { upper: "-", lower: "-", middle: picture });
    Object.assign(wall, { back: -1, flags: (wall.flags | WALL_BLOCKS) & ~WALL_TWO_SIDED, special: 0, tag: 0 });
  }
  shape.walls = shape.walls.filter((_, index) => !gone.has(index));
  shape.rooms.splice(room, 1);
  // Every room after it is one earlier. (A side of the room that went is on no wall now.)
  for (const one of shape.sides) one.room = one.room === room ? 0 : one.room > room ? one.room - 1 : one.room;
  return null;
}

/**
 * Takes a corner away where just two walls meet, making them one: what undoes a split. The two
 * must be the same wall carried on: the same rooms on the same sides.
 */
export function removeCorner(shape: Shape, corner: number): string | null {
  const at = wallsAt(shape, corner);
  if (at.length !== 2) return at.length > 2 ? "More than two walls meet here: it can only be moved." : "Nothing would be left of this wall.";
  let [first, second] = [shape.walls[at[0]!]!, shape.walls[at[1]!]!];
  if (first.from === corner && second.to === corner) [first, second] = [second, first];
  const before = [{ ...first }, { ...second }];
  const back = () => (Object.assign(first, before[0]), Object.assign(second, before[1]), "The walls either side of it belong to different rooms, or face different ways.");
  // One into the corner and one out of it; a wall with a room on both sides can be turned round to make it so.
  if (first.to !== corner || second.from !== corner) {
    const turned = first.to === corner ? second : first;
    if (turned.back < 0) return back();
    flip(turned);
  }
  if (roomOn(shape, first, "front") !== roomOn(shape, second, "front") || roomOn(shape, first, "back") !== roomOn(shape, second, "back")) return back();
  first.to = second.to;
  // From behind, the wall begins at its far end: the second half's back is the one that begins there.
  first.back = second.back;
  const index = shape.walls.indexOf(second);
  shape.walls.splice(index, 1);
  const why = trouble(shape, [shape.walls.indexOf(first)]);
  if (why) {
    shape.walls.splice(index, 0, second);
    back();
  }
  return why;
}

/**
 * A level to start from: one square room, 512 across, with the four players' starts in it,
 * facing north. `look` is what it is made of: a wall picture and two flats the game has.
 */
export function emptyLevel(look: { wall: string; floor: string; ceiling: string }): { shape: Shape; things: Thing[] } {
  const corners = [{ x: -256, y: -256 }, { x: -256, y: 256 }, { x: 256, y: 256 }, { x: 256, y: -256 }];
  const shape: Shape = {
    corners,
    // Clockwise, so each wall's front is inside.
    walls: corners.map((_, i) => ({ from: i, to: (i + 1) % 4, flags: WALL_BLOCKS, special: 0, tag: 0, front: i, back: -1 })),
    sides: corners.map(() => side(0, look.wall, false)),
    rooms: [{ floor: 0, ceiling: 128, floorFlat: look.floor, ceilingFlat: look.ceiling, light: 192, special: 0, tag: 0 }],
  };
  const things = [1, 2, 3, 4].map((type, i): Thing => ({ x: -96 + i * 64, y: -128, angle: 90, type, flags: FLAG_EASY | FLAG_MEDIUM | FLAG_HARD }));
  return { shape, things };
}

/** The wall picture and the flats a shape uses most: what to make a new level of, so it looks of a piece with the game. */
export function lookOf(shape: Shape): { wall: string; floor: string; ceiling: string } {
  const most = (names: string[]) => {
    const counts = new Map<string, number>();
    for (const name of names) if (name !== "-") counts.set(name, (counts.get(name) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
  };
  // Not the sky: a room under it needs walls made for it.
  return { wall: most(shape.sides.map((one) => one.middle)), floor: most(shape.rooms.map((room) => room.floorFlat)), ceiling: most(shape.rooms.map((room) => room.ceilingFlat).filter((name) => name !== "F_SKY1")) };
}
