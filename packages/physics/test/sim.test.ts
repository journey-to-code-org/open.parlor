import { describe, expect, it } from "vitest";
import { frames, GARDEN_HOLE, GOLF_HOLE, POOL_TABLE, result, simulate, start, step, type Frame, type SimEvent, type World } from "../src/index.js";
import { bench, energy, momentum } from "./helpers.js";

const run = (world: World, shot?: Parameters<typeof simulate>[1]): Frame[] => [...frames(world, shot)];
const types = (events: SimEvent[]) => events.map((e) => e.type);
const putt = (power: number, angle = 27000) => simulate(GOLF_HOLE, { body: "ball", angle, power });

describe("discs meeting discs", () => {
  it("equal balls head on swap speeds", () => {
    const world = bench({ bodies: [{ id: "a", x: 0, y: 0, r: 100, vx: 6000 }, { id: "b", x: 1000, y: 0, r: 100 }] });
    const last = run(world).at(-2)!;
    expect(last.bodies[0]!.vx).toBeCloseTo(0, 6);
    expect(last.bodies[1]!.vx).toBeCloseTo(6000, 6);
  });

  it("a heavy striker keeps going and sends a light piece off faster than it came", () => {
    // Carrom: the striker is bigger and three times the weight. Head on, the sums say half and
    // one and a half times the striker's speed.
    const world = bench({ bodies: [{ id: "striker", x: 0, y: 0, r: 206, mass: 3, vx: 6000 }, { id: "piece", x: 1000, y: 0, r: 159 }] });
    const last = run(world).at(-2)!;
    expect(last.bodies[0]!.vx).toBeCloseTo(3000, 6);
    expect(last.bodies[1]!.vx).toBeCloseTo(9000, 6);
  });

  it("keeps momentum and energy through a glancing hit between unequal discs", () => {
    const world = bench({
      bodies: [
        { id: "a", x: 0, y: 0, r: 150, mass: 2.5, vx: 9000, vy: 1200 },
        { id: "b", x: 1500, y: 260, r: 90, mass: 0.7, vx: -2000, vy: -300 },
        { id: "c", x: 2600, y: -400, r: 120, mass: 1.3 },
      ],
    });
    const all = run(world);
    const before = all[0]!;
    const after = all.at(-2)!;
    expect(all.flatMap((f) => f.events).filter((e) => e.type === "hit").length).toBeGreaterThan(0);
    const [px0, py0] = momentum(world, before);
    const [px1, py1] = momentum(world, after);
    expect(px1).toBeCloseTo(px0, 6);
    expect(py1).toBeCloseTo(py0, 6);
    expect(energy(world, after) / energy(world, before)).toBeCloseTo(1, 12);
  });

  it("loses energy, never gains it, when the bounce is less than perfect", () => {
    const world = bench({ restitution: 0.8, bodies: [{ id: "a", x: 0, y: 0, r: 100, vx: 6000 }, { id: "b", x: 1000, y: 40, r: 100 }] });
    const all = run(world);
    expect(energy(world, all.at(-2)!)).toBeLessThan(energy(world, all[0]!) * 0.9);
    const [px] = momentum(world, all.at(-2)!);
    expect(px).toBeCloseTo(6000, 6);
  });

  it("a fixed disc doesn't budge, and the ball comes back off it", () => {
    const world = bench({ bodies: [{ id: "ball", x: 0, y: 0, r: 100, vx: 6000 }, { id: "peg", x: 1000, y: 0, r: 50, fixed: true }] });
    const res = simulate(world);
    expect(res.world.bodies[1]).toEqual(world.bodies[1]);
    expect(res.world.bodies[0]!.x).toBeLessThan(0);
    expect(res.events[0]).toMatchObject({ type: "hit", a: "ball", b: "peg" });
  });

  it("names the first ball the struck ball touches", () => {
    expect(simulate(POOL_TABLE, { body: "cue", angle: 0, power: 600 }).firstContact).toBe("1");
    expect(simulate(POOL_TABLE, { body: "cue", angle: 9000, power: 300 }).firstContact).toBeNull();
  });
});

describe("walls", () => {
  const lane = (restitution: number): World =>
    bench({ bodies: [{ id: "ball", x: 0, y: 0, r: 100, vx: 6000 }], walls: [{ id: "end", restitution, points: [[2000, -500], [2000, 500]] }] });

  it("bounce a ball back with the wall's own restitution", () => {
    for (const e of [1, 0.5]) {
      const all = run(lane(e));
      expect(all.at(-2)!.bodies[0]!.vx).toBeCloseTo(-6000 * e, 6);
      expect(all.flatMap((f) => f.events)[0]).toMatchObject({ type: "wall", body: "ball", wall: "end" });
    }
  });

  it("stop a ball from either side", () => {
    const world = lane(1);
    const other: World = { ...world, bodies: [{ id: "ball", x: 4000, y: 0, r: 100, vx: -6000 }] };
    expect(run(other).at(-2)!.bodies[0]!.vx).toBeCloseTo(6000, 6);
  });

  it("turn a ball off the end of a wall as off a rounded corner", () => {
    // Aimed just past the end: the ball's edge clips the wall's last point and is knocked aside.
    const world = bench({ bodies: [{ id: "ball", x: 0, y: 590, r: 100, vx: 6000 }], walls: [{ id: "end", points: [[2000, -500], [2000, 500]] }] });
    const all = run(world);
    const after = all.at(-2)!.bodies[0]!;
    expect(all.flatMap((f) => f.events).map((e) => e.type)).toEqual(["wall", "capped"]);
    expect(after.vy).toBeGreaterThan(1000);
    expect(after.vx).toBeGreaterThan(0);
    expect(energy(world, all.at(-2)!)).toBeCloseTo(energy(world, all[0]!), 3);
  });

  it("hold a ball in a closed polygon's corner without letting it through", () => {
    const res = simulate(GOLF_HOLE, { body: "ball", angle: 22500, power: 1000 });
    const ball = res.world.bodies[0]!;
    expect(res.capped).toBe(false);
    expect(ball.x).toBeGreaterThanOrEqual(212);
    expect(ball.y).toBeLessThanOrEqual(40000 - 212);
  });

  it("never let a small fast ball through, from any angle, at a thousand times a sane speed", () => {
    // A radius-4 ball moving 8000 units a step would be on the far side of the wall after one
    // step if the step only looked at where things end up.
    for (let angle = 0; angle < 36000; angle += 250) {
      const world = bench({
        maxTicks: 60,
        maxShotSpeed: 960000,
        bodies: [{ id: "ball", x: 0, y: 0, r: 4 }],
        walls: [{ id: "box", closed: true, points: [[-900, -700], [800, -900], [1000, 600], [-600, 900]] }],
      });
      const all = run(world, { body: "ball", angle, power: 1000 });
      for (const f of all) expect(Math.abs(f.bodies[0]!.x) < 1100 && Math.abs(f.bodies[0]!.y) < 1000, `angle ${angle} tick ${f.tick}`).toBe(true);
      expect(all.flatMap((f) => f.events).some((e) => e.type === "out")).toBe(false);
    }
  });

  it("never let a fast ball jump over another ball", () => {
    const world = bench({ maxTicks: 30, maxShotSpeed: 960000, bodies: [{ id: "ball", x: 0, y: 0, r: 4 }, { id: "target", x: 20003, y: 3, r: 4 }] });
    const res = simulate(world, { body: "ball", angle: 0, power: 1000 });
    expect(res.firstContact).toBe("target");
  });
});

describe("friction and rest", () => {
  it("brings a ball to rest where the sums say, on whole numbers", () => {
    // 2 m/s against 0.5 m/s² is 4 m of roll; stepping in 120ths makes it a shade less.
    const world = bench({ friction: 5000, restSpeed: 100, maxTicks: 2000, bodies: [{ id: "ball", x: 0, y: 0, r: 100 }], maxShotSpeed: 40000 });
    const res = simulate(world, { body: "ball", angle: 0, power: 500 });
    const ball = res.world.bodies[0]!;
    expect(res.capped).toBe(false);
    expect(ball.x).toBeGreaterThan(39700);
    expect(ball.x).toBeLessThanOrEqual(40000);
    expect(Number.isInteger(ball.x) && Number.isInteger(ball.y)).toBe(true);
    expect(ball.y).toBe(0);
    expect("vx" in ball || "vy" in ball).toBe(false);
  });

  it("stops everything where it is when the step limit runs out, and says so", () => {
    const world = bench({ maxTicks: 100, bodies: [{ id: "ball", x: 0, y: 0, r: 100, vx: 1234, vy: 777 }] });
    const res = simulate(world);
    expect(res.capped).toBe(true);
    expect(res.ticks).toBe(100);
    expect(res.events.at(-1)).toEqual({ type: "capped", tick: 100 });
    expect(res.world.bodies[0]).toEqual({ id: "ball", x: Math.round((1234 * 100) / 120), y: Math.round((777 * 100) / 120), r: 100 });
  });

  it("leaves a table at rest exactly as it is", () => {
    const first = simulate(POOL_TABLE, { body: "cue", angle: 150, power: 900 }).world;
    const again = simulate(first, { body: "cue", angle: 0, power: 0 });
    expect(again.world).toEqual(first);
    expect(again.events).toEqual([]);
  });

  it("a patch of sand stops a ball shorter than grass does", () => {
    const grass = bench({ friction: 5000, restSpeed: 100, maxTicks: 2000, bodies: [{ id: "ball", x: 0, y: 0, r: 100, vx: 20000 }] });
    const sand: World = { ...grass, regions: [{ id: "sand", shape: { x: 10000, y: 0, r: 5000 }, friction: 30000 }] };
    const far = simulate(grass).world.bodies[0]!.x;
    const near = simulate(sand).world.bodies[0]!.x;
    expect(far).toBeGreaterThan(39000);
    expect(near).toBeGreaterThan(5000);
    expect(near).toBeLessThan(15000);
  });
});

describe("slopes", () => {
  it("a timid putt climbs part of the hill and rolls back down past where it turned", () => {
    const all = run(GOLF_HOLE, { body: "ball", angle: 27000, power: 400 });
    const highest = Math.min(...all.map((f) => f.bodies[0]!.y));
    const end = all.at(-1)!.bodies[0]!;
    expect(highest).toBeLessThan(24000);
    expect(highest).toBeGreaterThan(16000);
    expect(end.y).toBeGreaterThan(24000);
    expect(end.x).toBe(6000);
  });

  it("a ball set down on the hill doesn't stay there", () => {
    const world: World = { ...GOLF_HOLE, bodies: [{ id: "ball", x: 6000, y: 20000, r: 213 }] };
    const res = simulate(world);
    expect(res.capped).toBe(false);
    expect(res.world.bodies[0]!.y).toBeGreaterThan(24000);
  });

  it("a slope gentler than the friction holds a still ball", () => {
    const world: World = { ...GOLF_HOLE, bodies: [{ id: "ball", x: 6000, y: 20000, r: 213 }], regions: [{ ...GOLF_HOLE.regions[0]!, slope: [0, 4000] }] };
    const res = simulate(world);
    expect(res.world.bodies).toEqual(world.bodies);
    expect(res.ticks).toBeLessThan(10);
  });

  it("a ball that rolls downhill into a wall settles against it instead of rattling for ever", () => {
    const world = bench({
      friction: 3000,
      restSpeed: 100,
      wallRestitution: 0.6,
      maxTicks: 3600,
      bodies: [{ id: "ball", x: 0, y: 0, r: 200 }],
      walls: [{ id: "foot", points: [[-3000, 6000], [3000, 6000]] }],
      regions: [{ id: "hill", shape: { x: 0, y: 0, r: 50000 }, slope: [0, 9000] }],
    });
    const res = simulate(world);
    expect(res.capped).toBe(false);
    expect(res.world.bodies[0]).toEqual({ id: "ball", x: 0, y: 5800, r: 200 });
    // It bounced a few times on the way to lying still, and then stopped reporting.
    const bounces = res.events.filter((e) => e.type === "wall").length;
    expect(bounces).toBeGreaterThan(1);
    expect(bounces).toBeLessThan(30);
  });

  it("two balls rolled into the foot of a hill pile up and come to rest", () => {
    const world = bench({
      friction: 3000,
      restSpeed: 100,
      restitution: 0.9,
      wallRestitution: 0.6,
      maxTicks: 3600,
      bodies: [{ id: "low", x: 0, y: 3000, r: 200 }, { id: "high", x: 30, y: 0, r: 200 }],
      walls: [{ id: "pen", points: [[-600, 0], [-600, 6000], [600, 6000], [600, 0]] }],
      regions: [{ id: "hill", shape: { x: 0, y: 0, r: 50000 }, slope: [0, 9000] }],
    });
    const res = simulate(world);
    expect(res.capped).toBe(false);
    const [low, high] = res.world.bodies as [World["bodies"][0], World["bodies"][0]];
    expect(low.y).toBeGreaterThan(5500);
    expect(Math.hypot(low.x - high.x, low.y - high.y)).toBeGreaterThan(398);
  });
});

describe("pockets", () => {
  it("a cup takes a ball that arrives gently", () => {
    const res = putt(530);
    expect(types(res.events)).toEqual(["pocket"]);
    expect(res.world.bodies[0]).toEqual({ id: "ball", x: 6000, y: 5000, r: 213, pocketed: "cup" });
  });

  it("a ball going too fast skips over the cup and plays on", () => {
    const res = putt(1000);
    expect(res.events[0]).toMatchObject({ type: "skip", body: "ball", pocket: "cup" });
    expect(types(res.events)).not.toContain("pocket");
    expect(res.world.bodies[0]!.pocketed).toBeUndefined();
  });

  it("a ball that slows down while still over the cup drops", () => {
    const world = bench({ friction: 20000, restSpeed: 100, maxTicks: 2000, bodies: [{ id: "ball", x: 0, y: 0, r: 100, vx: 10100 }], pockets: [{ id: "cup", x: 3000, y: 0, r: 600, maxSpeed: 1000 }] });
    const res = simulate(world);
    expect(types(res.events)).toEqual(["skip", "pocket"]);
  });

  it("a pool pocket takes a ball at any speed, and a pocketed ball sits out the next shot", () => {
    // Straight at the bottom-left corner from the cue ball's spot.
    const res = simulate(POOL_TABLE, { body: "cue", angle: 13500, power: 1000 });
    expect(res.events).toEqual([{ type: "pocket", tick: res.events[0]!.tick, body: "cue", pocket: "bottom-left" }]);
    expect(res.world.bodies[0]).toMatchObject({ id: "cue", x: 0, y: 12700, pocketed: "bottom-left" });
    const next = simulate(res.world, { body: "1", angle: 18000, power: 500 });
    expect(next.world.bodies[0]).toEqual(res.world.bodies[0]);
  });

  it("a ball rolling along the rail goes past the side pocket", () => {
    const world: World = { ...POOL_TABLE, bodies: [{ id: "cue", x: 9000, y: 286, r: 286 }] };
    const res = simulate(world, { body: "cue", angle: 0, power: 80 });
    expect(types(res.events)).not.toContain("pocket");
    expect(res.world.bodies[0]!.x).toBeGreaterThan(14000);
  });
});

describe("out of play", () => {
  it("a ball that ends a step in the pond is out, where it went in", () => {
    const world: World = { ...GOLF_HOLE, bodies: [{ id: "ball", x: 6000, y: 12500, r: 213 }] };
    const res = simulate(world, { body: "ball", angle: 18000, power: 300 });
    expect(types(res.events)).toEqual(["out"]);
    expect(res.events[0]).toMatchObject({ body: "ball", region: "pond" });
    const ball = res.world.bodies[0]!;
    expect(ball.out).toBe("pond");
    expect(ball.x).toBeLessThan(3500);
    expect(Number.isInteger(ball.x)).toBe(true);
  });

  it("a ball that leaves the world's bounds is out", () => {
    const world = bench({ bounds: { x: -1000, y: -1000, w: 2000, h: 2000 }, bodies: [{ id: "ball", x: 0, y: 0, r: 100, vx: 6000, vy: 100 }] });
    const res = simulate(world);
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({ type: "out", body: "ball", region: "bounds" });
    expect(res.capped).toBe(false);
  });
});

describe("stepping", () => {
  it("is pure: a frozen world goes in and a new one comes out", () => {
    const freeze = (o: unknown): unknown => {
      if (typeof o === "object" && o !== null) Object.values(o).forEach(freeze), Object.freeze(o);
      return o;
    };
    const world = freeze(JSON.parse(JSON.stringify(POOL_TABLE))) as World;
    const res = simulate(world, { body: "cue", angle: 0, power: 1000 });
    expect(world).toEqual(POOL_TABLE);
    expect(res.world).not.toBe(world);
    expect(res.world.bodies).toHaveLength(16);
  });

  it("hands out events in the step they happen, and the last frame is the resting table", () => {
    const shot = { body: "cue", angle: 0, power: 1000 };
    const all = run(POOL_TABLE, shot);
    const res = simulate(POOL_TABLE, shot);
    expect(all.at(-1)!.done).toBe(true);
    expect(all.slice(0, -1).every((f) => !f.done)).toBe(true);
    expect(all.map((f) => f.tick)).toEqual(all.map((_, i) => i + 1));
    for (const f of all) for (const e of f.events) expect(e.tick).toBe(f.tick);
    expect(all.flatMap((f) => f.events)).toEqual(res.events);
    expect(all.at(-1)!.bodies.map((b) => [b.id, b.x, b.y])).toEqual(res.world.bodies.map((b) => [b.id, b.x, b.y]));
    expect(all.at(-1)!.bodies.every((b) => b.vx === 0 && b.vy === 0)).toBe(true);
  });

  it("start, step and result are the same thing by hand", () => {
    const shot = { body: "ball", angle: 26000, power: 700 };
    const r = start(GOLF_HOLE, shot);
    expect(() => result(r)).toThrow();
    while (!r.done) step(r);
    expect(() => step(r)).toThrow();
    expect(result(r)).toEqual(simulate(GOLF_HOLE, shot));
  });
});

describe("tunnels", () => {
  const pipe = { id: "pipe", x: 2000, y: 0, r: 300, to: [0, 5000] as [number, number], angle: 9000, speed: 6000, ticks: 12 };
  const table = (over: Partial<typeof pipe> = {}, vx = 6000): World => bench({ bodies: [{ id: "a", x: 0, y: 0, r: 100, vx }], tunnels: [{ ...pipe, ...over }] });

  it("take a ball at the mouth and roll it out of the other end at the tunnel's own speed and heading", () => {
    const all = run(table());
    const events = all.flatMap((f) => f.events);
    expect(types(events)).toEqual(["tunnel", "emerge", "capped"]);
    const [went, came] = events as Extract<SimEvent, { type: "tunnel" | "emerge" }>[];
    expect([went!.body, went!.tunnel, came!.tunnel]).toEqual(["a", "pipe", "pipe"]);
    // The rim is 1700 away at 50 a step: the ball is on it as step 34 ends and in at the start of
    // 35; twelve steps inside, and out on the next.
    expect([went!.tick, came!.tick]).toEqual([35, 48]);
    // While it is inside it is off the table, at the mouth, and says which tunnel it is in.
    const inside = all[40]!.bodies[0]!;
    expect(inside).toEqual({ id: "a", x: 2000, y: 0, vx: 0, vy: 0, live: false, in: "pipe" });
    // It comes out where the tunnel says, heading straight down the screen at 6000.
    const out = all[47]!.bodies[0]!;
    expect(out.live).toBe(true);
    expect(out.in).toBeUndefined();
    expect([out.x, out.vx, out.vy]).toEqual([0, 0, 6000]);
    expect(out.y).toBe(5050);
  });

  it("with no steps inside, the ball is out on the very next step", () => {
    const events = run(table({ ticks: 0 })).flatMap((f) => f.events);
    expect(events.slice(0, 2).map((e) => e.tick)).toEqual([35, 36]);
    const { ticks: _ticks, ...bare } = pipe;
    expect(types(simulate(bench({ bodies: [{ id: "a", x: 0, y: 0, r: 100, vx: 6000 }], tunnels: [bare] })).events).slice(0, 2)).toEqual(["tunnel", "emerge"]);
  });

  it("let a ball that is going too fast carry on over the mouth", () => {
    const fast = simulate(table({ maxSpeed: 3000 }));
    expect(types(fast.events)).toEqual(["capped"]);
    expect(fast.world.bodies[0]!.x).toBeGreaterThan(2300);
    // At the limit or under it, in it goes.
    expect(types(simulate(table({ maxSpeed: 6000 })).events)).toContain("tunnel");
    // A fast ball that is turned back and slows down while still over the mouth goes in then.
    const wall = { id: "back", points: [[2150, -1000], [2150, 1000]] as [number, number][], restitution: 0.4 };
    const back = simulate({ ...table({ maxSpeed: 3000 }), walls: [wall] });
    expect(types(back.events).slice(0, 3)).toEqual(["wall", "tunnel", "emerge"]);
  });

  it("can't be jumped: the mouth is found on the way, however fast the ball", () => {
    // 60000 units/s is 500 a step: the mouth, 200 across, lies between two steps.
    const res = simulate(bench({ maxTicks: 60, bodies: [{ id: "a", x: 30, y: 0, r: 100, vx: 60000 }], tunnels: [{ ...pipe, r: 100 }] }));
    expect(types(res.events).slice(0, 2)).toEqual(["tunnel", "emerge"]);
  });

  it("keep the shot going until the ball is out, and set it down at the far end if the steps run out first", () => {
    const friction = { friction: 5000, restSpeed: 100 };
    const slow = simulate({ ...table({ ticks: 200, speed: 0 }), ...friction, maxTicks: 1000 });
    // Nothing on the table was moving for two hundred steps, and the shot waited.
    expect(slow.capped).toBe(false);
    expect(slow.ticks).toBeGreaterThan(234);
    expect(slow.world.bodies[0]).toEqual({ id: "a", x: 0, y: 5000, r: 100 });
    const cut = simulate({ ...table({ ticks: 200 }), maxTicks: 100 });
    expect(cut.capped).toBe(true);
    expect(types(cut.events)).toEqual(["tunnel", "capped", "emerge"]);
    expect(cut.world.bodies[0]).toEqual({ id: "a", x: 0, y: 5000, r: 100 });
  });

  it("knock into whatever is standing at the far end", () => {
    const world = table();
    world.bodies.push({ id: "b", x: 0, y: 5400, r: 100 });
    const res = simulate(world);
    expect(types(res.events).slice(0, 3)).toEqual(["tunnel", "emerge", "hit"]);
    expect(res.firstContact).toBeNull();
  });
});

describe("ledges", () => {
  // Listed left to right: the top of the screen (smaller y) is on the wall's left, its open side.
  const ledge = { id: "ledge", oneWay: true, points: [[-2000, 0], [0, 0], [2000, 0]] as [number, number][] };
  const from = (y: number, vy: number, x = 500): World => bench({ walls: [ledge], bodies: [{ id: "a", x, y, r: 100, vy }] });

  it("let a ball roll off from the open side and stop one coming back the other way", () => {
    const down = simulate(from(-1000, 6000));
    expect(types(down.events)).toEqual(["capped"]);
    expect(down.world.bodies[0]!.y).toBeGreaterThan(1000);
    const up = run(from(1000, -6000));
    expect(types(up.flatMap((f) => f.events))).toEqual(["wall", "capped"]);
    expect(up.every((f) => f.bodies[0]!.y >= 100 - 1e-6)).toBe(true);
    expect(up.at(-2)!.bodies[0]!.vy).toBe(6000);
  });

  it("are no more solid at a point along them than anywhere else", () => {
    // Straight over the joint in the middle, and over an end.
    for (const x of [0, 30, -2000, 2000]) expect(types(simulate(from(-1000, 6000, x)).events), `x ${x}`).toEqual(["capped"]);
    // From the shut side, the joint and the ends stop a ball like the rest.
    for (const x of [0, 30]) expect(types(simulate(from(1000, -6000, x)).events)).toEqual(["wall", "capped"]);
  });

  it("stop a ball that has dropped off from being pulled back up", () => {
    // A slope pushes back towards the ledge the ball has just come down.
    const world: World = { ...from(-1000, 4000), friction: 0, maxTicks: 600, regions: [{ id: "tilt", shape: { points: [[-5000, 0], [5000, 0], [5000, 9000], [-5000, 9000]] }, slope: [0, -8000] }] };
    const all = run(world);
    expect(types(all.flatMap((f) => f.events))).toContain("wall");
    // Once its centre was over the edge it never got back.
    const over = all.findIndex((f) => f.bodies[0]!.y > 0);
    expect(all.slice(over).every((f) => f.bodies[0]!.y > 0)).toBe(true);
  });
});

describe("bumpers", () => {
  const table = (vx: number, kick = 6000): World => bench({ bodies: [{ id: "a", x: 0, y: 0, r: 100, vx }, { id: "post", x: 1000, y: 0, r: 200, fixed: true, kick }] });

  it("send a gentle touch away at their own speed", () => {
    const all = run(table(600));
    expect(types(all.flatMap((f) => f.events))).toEqual(["hit", "capped"]);
    expect(all.at(-2)!.bodies[0]!.vx).toBeCloseTo(-6000, 6);
    expect(all.at(-2)!.bodies[1]).toMatchObject({ x: 1000, y: 0, vx: 0, vy: 0 });
  });

  it("leave alone a ball that is already leaving faster than that", () => {
    expect(run(table(9000)).at(-2)!.bodies[0]!.vx).toBeCloseTo(-9000, 6);
    // A fixed body with no kick is the plain post it always was.
    expect(run(table(600, 0)).at(-2)!.bodies[0]!.vx).toBeCloseTo(-600, 6);
  });

  it("kick along the line between the centres, so a glancing ball keeps its sideways speed", () => {
    const world = bench({ bodies: [{ id: "a", x: 0, y: 290, r: 100, vx: 1200 }, { id: "post", x: 1000, y: 0, r: 200, fixed: true, kick: 6000 }] });
    const after = run(world).at(-2)!.bodies[0]!;
    // Away from the post, at more than the kick once what it kept along the tangent is added.
    expect(after.vy).toBeGreaterThan(5000);
    expect(Math.sqrt(after.vx * after.vx + after.vy * after.vy)).toBeGreaterThan(6000);
  });
});

describe("the garden hole", () => {
  it("is reached through the pipe, and not by a putt straight up at the ledge", () => {
    const piped = simulate(GARDEN_HOLE, { body: "ball", angle: 24026, power: 600 });
    expect(types(piped.events)).toEqual(["tunnel", "emerge"]);
    // Out on the terrace, having rolled up and to the right from where the pipe let it go.
    const at = piped.world.bodies[0]!;
    expect(at.x > 3000 && at.y < 12000 && at.y > 5000).toBe(true);
    const straight = simulate(GARDEN_HOLE, { body: "ball", angle: 27000, power: 1000 });
    expect(straight.events.some((e) => e.type === "wall" && e.wall === "ledge")).toBe(true);
    expect(straight.events.every((e) => e.type === "wall")).toBe(true);
    expect(straight.world.bodies[0]!.y).toBeGreaterThan(15000);
  });

  it("lets a ball down off the terrace, and the toadstool knocks one away", () => {
    const onTerrace = (x: number, y: number): World => ({ ...GARDEN_HOLE, bodies: [{ ...GARDEN_HOLE.bodies[0]!, x, y }, GARDEN_HOLE.bodies[1]!] });
    const down = simulate(onTerrace(3000, 12000), { body: "ball", angle: 9000, power: 500 });
    expect(down.events.some((e) => e.type === "wall" && e.wall === "ledge")).toBe(false);
    expect(down.world.bodies[0]!.y).toBeGreaterThan(15000);
    const bumped = [...frames(onTerrace(8200, 9000), { body: "ball", angle: 27000, power: 150 })];
    const hit = bumped.findIndex((f) => f.events.some((e) => e.type === "hit"));
    expect(hit).toBeGreaterThan(0);
    expect(bumped[hit]!.bodies[0]!.vy).toBeCloseTo(9000, 6);
  });
});
