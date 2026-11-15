// Playing a shot on the screen. The server has already decided where everything stops; what a
// browser does is run the very same simulation from the very same bodies, a few steps a frame,
// and draw each step. Because the physics core is deterministic to the bit, the last step lands
// exactly on the table the server stored, so the animation is a replay and never a guess.
//
// That is checked every time (`landed`), in every build, because it is cheap and because the one
// time it failed would be the time someone wants to know. If it ever does fail (a browser running
// an older build against a newer server, say), nothing breaks: the table screen shows the
// server's table when the roll ends, whatever the roll did.
import { sameRest, worldBefore, type SportShot, type SportView } from "@journey-to-code/games";
import { PHYSICS_VERSION, result, start, step, type Point, type Run, type Shape, type SimEvent, type World } from "@journey-to-code/physics";

export interface Roll {
  /** The view this shot leads to: shown once the roll is over. */
  target: SportView;
  record: SportShot;
  /** The world the shot started from. */
  world: World;
  /** The running simulation, or null when this browser can't step it (another physics version). */
  run: Run | null;
  /** Where each body of the run is now. */
  at: Map<string, { x: number; y: number; r: number; live: boolean }>;
  /** When each ball dropped into a pocket (ms on the roll's own clock). */
  sunk: Map<string, number>;
  /** When each ball that is inside a tunnel went in, and which tunnel. */
  entered: Map<string, { at: number; tunnel: string }>;
  /** Brief things to draw where they happened: a splash, a puff of sand, a ball popping out of a tunnel, one dropping in the cup. */
  effects: { kind: "splash" | "sand" | "pop" | "drop"; x: number; y: number; at: number }[];
  /** When each bumper was last hit. */
  struck: Map<string, number>;
  /** Where each fast-moving ball has just been, oldest first: a streak to draw behind it. */
  trails: Map<string, Point[]>;
  /** The sand and the water of this table, to know what a ball is ploughing through or has fallen in. */
  sand: Shape[];
  water: Set<string>;
  /** The path of the struck body, kept for when the roll is shown as a line and not as motion. */
  trace: Point[];
  /** Shown as a trace: the result at once, with the path drawn over it. */
  jump: boolean;
  /** The roll's own clock, in ms: it runs faster when the table is hurrying to catch up. */
  clock: number;
  /** Steps owed but not yet taken (a fraction of one carries over to the next frame). */
  owed: number;
  /** The clock time at which the physics came to rest, or null while it is moving. */
  rested: number | null;
  /** How long to hold the resting picture before the table moves on: longer when there is a drop or a splash to see. */
  hold: number;
  over: boolean;
}

/** A browser can only replay a shot played by the same physics it has. */
export const canStep = (record: SportShot) => record.physics === PHYSICS_VERSION;

export function beginRoll(target: SportView, jump: boolean): Roll {
  const record = target.last!;
  const world = worldBefore(target)!;
  const roll: Roll = {
    target,
    record,
    world,
    run: canStep(record) ? start(world, record.shot) : null,
    at: new Map(world.bodies.map((b) => [b.id, { x: b.x, y: b.y, r: b.r, live: b.pocketed === undefined && b.out === undefined }])),
    sunk: new Map(),
    entered: new Map(),
    effects: [],
    struck: new Map(),
    trails: new Map(),
    sand: target.table.look.regions.flatMap((g) => (g.surface === "sand" ? world.regions.filter((r) => r.id === g.id).map((r) => r.shape) : [])),
    water: new Set(target.table.look.regions.filter((g) => g.surface === "water").map((g) => g.id)),
    trace: [],
    jump: jump || !canStep(record),
    clock: 0,
    owed: 0,
    rested: null,
    hold: 250,
    over: false,
  };
  const struck = roll.at.get(record.shot.body);
  if (struck) roll.trace.push([struck.x, struck.y]);
  return roll;
}

function inShape(s: Shape, x: number, y: number): boolean {
  if (!("points" in s)) return (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < s.r * s.r;
  let hit = false;
  for (let i = 0, j = s.points.length - 1; i < s.points.length; j = i++) {
    const [xi, yi] = s.points[i]!;
    const [xj, yj] = s.points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A ball going faster than this (units/s) leaves a streak, and one ploughing sand faster than `PUFF` kicks it up. */
const STREAK = 7500;
const PUFF = 1400;
const TRAIL = 9;

/** One step of the simulation, drawn into the roll. Returns what happened in it. */
function tick(roll: Roll): SimEvent[] {
  const frame = step(roll.run!);
  for (const b of frame.bodies) {
    const at = roll.at.get(b.id);
    if (!at) continue;
    [at.x, at.y, at.live] = [b.x, b.y, b.live];
    if (!b.live || roll.jump) {
      roll.trails.delete(b.id);
      continue;
    }
    const speed2 = b.vx * b.vx + b.vy * b.vy;
    // The streak grows while the ball is fast and is eaten from its tail once it slows.
    if (frame.tick % 2 === 0) {
      const trail = roll.trails.get(b.id) ?? [];
      if (speed2 > STREAK * STREAK) trail.push([b.x, b.y]);
      if (trail.length > TRAIL || (speed2 <= STREAK * STREAK && trail.length)) trail.shift();
      if (trail.length) roll.trails.set(b.id, trail);
      else roll.trails.delete(b.id);
    }
    if (frame.tick % 5 === 0 && speed2 > PUFF * PUFF && roll.sand.some((shape) => inShape(shape, b.x, b.y))) roll.effects.push({ kind: "sand", x: b.x, y: b.y, at: roll.clock });
  }
  for (const e of frame.events) {
    const at = "body" in e ? roll.at.get(e.body) : undefined;
    if (e.type === "pocket") {
      roll.sunk.set(e.body, roll.clock);
      if (at) roll.effects.push({ kind: "drop", x: at.x, y: at.y, at: roll.clock });
    }
    if (e.type === "out" && at && roll.water.has(e.region)) roll.effects.push({ kind: "splash", x: at.x, y: at.y, at: roll.clock });
    if (e.type === "tunnel") roll.entered.set(e.body, { at: roll.clock, tunnel: e.tunnel });
    if (e.type === "emerge") roll.entered.delete(e.body);
    if (e.type === "emerge" && at) roll.effects.push({ kind: "pop", x: at.x, y: at.y, at: roll.clock });
    if (e.type === "hit") for (const id of [e.a, e.b]) if (roll.world.bodies.find((b) => b.id === id)?.fixed) roll.struck.set(id, roll.clock);
    if (e.type === "pocket" || e.type === "out") roll.hold = 700;
  }
  // Only so many puffs are ever in the air.
  if (roll.effects.length > 40) roll.effects.splice(0, roll.effects.length - 40);
  const struck = roll.at.get(roll.record.shot.body);
  // Every few steps is plenty for a line, and always the last one.
  if (struck && (frame.tick % 4 === 0 || frame.done)) roll.trace.push([struck.x, struck.y]);
  return frame.events;
}

/** Runs the rest of the simulation at once. Returns everything that happened. */
export function finishRoll(roll: Roll): SimEvent[] {
  const events: SimEvent[] = [];
  while (roll.run && !roll.run.done) events.push(...tick(roll));
  if (!roll.run) {
    // Nothing to step: put the bodies where the server says they stopped.
    for (const r of roll.record.rest) {
      const at = roll.at.get(r.id);
      if (at) [at.x, at.y, at.live] = [r.x, r.y, r.pocketed === undefined && r.out === undefined];
      if (r.id === roll.record.shot.body) roll.trace.push([r.x, r.y]);
    }
  }
  if (roll.rested === null) roll.rested = roll.clock;
  return events;
}

/**
 * Moves a roll on by `ms` of real time at `speed`. Steps the simulation at the world's own tick
 * rate, whatever the screen's frame rate, and returns the events of the steps it took so their
 * sounds play as they happen.
 */
export function advanceRoll(roll: Roll, ms: number, speed: number): SimEvent[] {
  let events: SimEvent[] = [];
  roll.clock += ms * speed;
  if (roll.rested === null) {
    if (roll.jump || !roll.run) {
      events = finishRoll(roll);
      // A trace stays up a moment longer: it is all there is to see.
      roll.hold = Math.max(roll.hold, 700);
    } else {
      roll.owed += (ms * speed * roll.world.tickRate) / 1000;
      while (roll.owed >= 1 && !roll.run.done) {
        roll.owed -= 1;
        events.push(...tick(roll));
      }
      if (roll.run.done) roll.rested = roll.clock;
    }
  }
  if (roll.rested !== null && roll.clock - roll.rested >= roll.hold) roll.over = true;
  return events;
}

/**
 * Whether the roll stopped exactly where the server's did: every body, to the unit. True too for a
 * roll this browser couldn't step, which made no claim.
 */
export function landed(roll: Roll): boolean {
  if (!roll.run) return true;
  if (!roll.run.done) return false;
  return sameRest(result(roll.run).world, roll.record.rest);
}
