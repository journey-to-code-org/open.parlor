// A level from a floor plan: rooms given as rectangles on a grid, turned into the corners, walls
// and sides the engine wants. This is how a level is written down as text and built by a script,
// where the editor builds one by hand.
//
// A room is one or more rectangles that share a name; it is one floor and one ceiling. Where two
// rooms touch there is an opening between them, and where a room touches nothing there is a
// wall. So a wall between two rooms is a gap left between their rectangles, and a doorway is a
// small rectangle across the gap. A room marked as a door is shut (its ceiling on its floor) and
// its openings lift it when pushed. Later rectangles lie over earlier ones, and a block is a
// rectangle of solid wall cut out of whatever is there: a pillar, a row of shelves.
import { type Room, type Shape, type Side, WALL_BLOCKS, WALL_LOWER_UNPEGGED, WALL_TWO_SIDED } from "./level.ts";

export interface Look {
  floor: number;
  ceiling: number;
  floorFlat: string;
  ceilingFlat: string;
  light: number;
  /** The picture on its walls. */
  wall: string;
  /** What is seen of it from a room beside it, where its floor is higher or its ceiling lower: a step's riser, a counter's front. Left out, its wall. */
  trim?: string;
  special?: number;
  tag?: number;
  /** A door: what it looks like from outside. It starts shut. */
  door?: string;
  /** What pushing the door does, if not the plain open-wait-close (1): 26, 27, 28 for a key. */
  opens?: number;
}

export type Box = [x0: number, y0: number, x1: number, y1: number];

export interface Plan {
  rooms: Record<string, Look>;
  /** Each room's rectangles, in the order they are laid: a later one lies over an earlier. */
  spaces: [room: string, ...Box][];
  /** Solid wall, cut out of the rooms. */
  blocks?: Box[];
}

/** What a door slides in, on the walls at its ends, if the game has it. */
const TRACK = "DOORTRAK";

/** The shape of a plan, and each room's number in it by name. */
export function fromPlan(plan: Plan, pictures?: Set<string>): { shape: Shape; rooms: Record<string, number> } {
  const names = Object.keys(plan.rooms);
  const numbers = Object.fromEntries(names.map((name, index) => [name, index]));
  const looks = names.map((name) => plan.rooms[name]!);
  for (const [room] of plan.spaces) if (!(room in numbers)) throw new Error(`The plan has a rectangle for "${room}", which isn't one of its rooms.`);
  const boxes = [...plan.spaces.map(([, ...box]) => box), ...(plan.blocks ?? [])];
  for (const [x0, y0, x1, y1] of boxes) if (x1 <= x0 || y1 <= y0) throw new Error(`A rectangle of the plan has no size: ${x0}, ${y0} to ${x1}, ${y1}.`);
  const sorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
  const xs = sorted(boxes.flatMap(([x0, , x1]) => [x0, x1]));
  const ys = sorted(boxes.flatMap(([, y0, , y1]) => [y0, y1]));

  // Which room each cell of the grid is in: -1 for none.
  const owner = Array.from({ length: xs.length - 1 }, () => new Array<number>(ys.length - 1).fill(-1));
  const fill = ([x0, y0, x1, y1]: Box, room: number) => {
    for (let i = xs.indexOf(x0); xs[i]! < x1; i++) for (let j = ys.indexOf(y0); ys[j]! < y1; j++) owner[i]![j] = room;
  };
  for (const [room, ...box] of plan.spaces) fill(box, numbers[room]!);
  for (const box of plan.blocks ?? []) fill(box, -1);
  const at = (i: number, j: number) => owner[i]?.[j] ?? -1;
  for (const name of names) if (!owner.some((column) => column.includes(numbers[name]!))) throw new Error(`Nothing is left of the room "${name}" in the plan.`);

  // A stretch of wall between two cells of different rooms, from its front's left end to its right.
  interface Edge {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    front: number;
    back: number;
  }
  const edges: Edge[] = [];
  /** Which of the two is the front: a door's opening faces away from the door, so it is pushed from outside. */
  const faces = (first: number, second: number) => (first < 0 ? false : second < 0 ? true : !looks[first]!.door || !!looks[second]!.door);
  for (let i = 0; i < xs.length; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      // Going north, the right is the east.
      const [west, east] = [at(i - 1, j), at(i, j)];
      if (west === east) continue;
      if (faces(east, west)) edges.push({ ax: xs[i]!, ay: ys[j]!, bx: xs[i]!, by: ys[j + 1]!, front: east, back: west });
      else edges.push({ ax: xs[i]!, ay: ys[j + 1]!, bx: xs[i]!, by: ys[j]!, front: west, back: east });
    }
  for (let j = 0; j < ys.length; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      // Going east, the right is the south.
      const [south, north] = [at(i, j - 1), at(i, j)];
      if (south === north) continue;
      if (faces(south, north)) edges.push({ ax: xs[i]!, ay: ys[j]!, bx: xs[i + 1]!, by: ys[j]!, front: south, back: north });
      else edges.push({ ax: xs[i + 1]!, ay: ys[j]!, bx: xs[i]!, by: ys[j]!, front: north, back: south });
    }

  // Stretches that carry straight on, between the same rooms, with nothing else meeting them, are one wall.
  const spot = (x: number, y: number) => `${x},${y}`;
  const meeting = new Map<string, Edge[]>();
  for (const edge of edges) for (const key of [spot(edge.ax, edge.ay), spot(edge.bx, edge.by)]) meeting.set(key, [...(meeting.get(key) ?? []), edge]);
  const gone = new Set<Edge>();
  for (const edge of edges) {
    if (gone.has(edge)) continue;
    for (;;) {
      const here = meeting.get(spot(edge.bx, edge.by))!;
      const next = here.length === 2 ? here.find((one) => one !== edge)! : null;
      const straight = next && next.ax === edge.bx && next.ay === edge.by && (next.bx - next.ax) * (edge.by - edge.ay) === (next.by - next.ay) * (edge.bx - edge.ax);
      if (!next || !straight || next.front !== edge.front || next.back !== edge.back || gone.has(next) || next === edge) break;
      gone.add(next);
      meeting.set(spot(next.bx, next.by), meeting.get(spot(next.bx, next.by))!.map((one) => (one === next ? edge : one)));
      [edge.bx, edge.by] = [next.bx, next.by];
    }
  }

  const has = (name: string) => !pictures || pictures.has(name);
  const shape: Shape = { corners: [], walls: [], sides: [], rooms: looks.map((look): Room => ({ floor: look.floor, ceiling: look.door ? look.floor : look.ceiling, floorFlat: look.floorFlat, ceilingFlat: look.ceilingFlat, light: look.light, special: look.special ?? 0, tag: look.tag ?? 0 })) };
  const corners = new Map<string, number>();
  const corner = (x: number, y: number) => corners.get(spot(x, y)) ?? corners.set(spot(x, y), shape.corners.push({ x, y }) - 1).get(spot(x, y))!;
  const side = (to: Partial<Side> & { room: number }) => shape.sides.push({ x: 0, y: 0, upper: "-", lower: "-", middle: "-", ...to }) - 1;
  for (const edge of edges.filter((one) => !gone.has(one))) {
    const [front, back] = [looks[edge.front]!, looks[edge.back]];
    const ends = { from: corner(edge.ax, edge.ay), to: corner(edge.bx, edge.by) };
    if (!back) {
      // A door's own walls are what it slides in, and stay still as it lifts.
      const track = front.door && has(TRACK);
      shape.walls.push({ ...ends, flags: WALL_BLOCKS | (track ? WALL_LOWER_UNPEGGED : 0), special: 0, tag: 0, front: side({ room: edge.front, middle: track ? TRACK : front.wall }), back: -1 });
      continue;
    }
    // An opening. What shows above and below it, from either side, is the other room: its step, its lower ceiling, its door.
    const door = back.door && !front.door ? back : null;
    const seen = (look: Look) => look.trim ?? look.wall;
    shape.walls.push({ ...ends, flags: WALL_TWO_SIDED, special: door ? (door.opens ?? 1) : 0, tag: 0, front: side({ room: edge.front, upper: door ? door.door! : seen(back), lower: seen(back) }), back: side({ room: edge.back, upper: seen(front), lower: seen(front) }) });
  }
  return { shape, rooms: numbers };
}

/** The wall of a shape nearest a point: for giving one wall of a plan a picture or something to do. */
export function wallNear(shape: Shape, x: number, y: number): number {
  let best = -1;
  let nearest = Infinity;
  shape.walls.forEach((wall, index) => {
    const [a, b] = [shape.corners[wall.from]!, shape.corners[wall.to]!];
    const along = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
    const distance = Math.hypot(x - (a.x + (b.x - a.x) * along), y - (a.y + (b.y - a.y) * along));
    if (distance < nearest) [nearest, best] = [distance, index];
  });
  return best;
}
