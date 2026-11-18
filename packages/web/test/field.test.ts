// A field game on the screen: a shot is flown again from what the view carries and shown a tick
// at a time, ending on the field the view shows; and the screen and the field's own units agree
// about where a finger is.
import { QUICK_STYLE, kitGame, type FieldView } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { fitField, lookAt } from "../src/field/draw";
import { Fx } from "../src/field/fx";
import { lookOf } from "../src/field/looks";
import { BURST_FOR, HOLD, beginPlayback, eventsBetween, frameAt, playbackOver, shellLook } from "../src/field/play";
import { controls } from "../src/HowToPlay";
import { sharesDevice } from "../src/kit/sameDevice";

const game = kitGame("overthehill")!;
/** A game a few shots in: the view after each shot fired. */
function shots(n: number, rules: unknown = game.presets[0]): FieldView[] {
  let state = game.newGame(game.normalize(rules), 2, 12) as unknown;
  const views: FieldView[] = [];
  let dice = 1;
  const rand = () => ((dice = (dice * 16807) % 2147483647) - 1) / 2147483646;
  while (views.length < n) {
    const seat = (game.view(state, 0) as FieldView).turn!;
    state = game.apply(state, seat, game.bot(state, seat, QUICK_STYLE, rand)!);
    const view = game.view(state, 0) as FieldView;
    if (view.last && view.last.n > (views.at(-1)?.last?.n ?? 0)) views.push(view);
  }
  return views;
}

describe("playing a shot back", () => {
  it("starts on the field the shot was fired over and ends on the field the view shows", () => {
    for (const view of shots(8)) {
      const p = beginPlayback(view)!;
      expect(p).not.toBeNull();
      const first = frameAt(p, 0);
      expect(first.land).toBe(view.last!.from.land);
      expect(first.pieces).toBe(view.last!.from.pieces);
      const last = frameAt(p, p.flight.ticks + HOLD);
      expect(last.land).toEqual(view.field.land);
      expect(last.pieces).toEqual(view.last!.rest);
      expect(last.shells).toEqual([]);
      expect(last.bursts).toEqual([]);
    }
  });

  it("has the shell in the air at the start, with a streak behind it that grows", () => {
    const p = beginPlayback(shots(1)[0]!)!;
    const early = frameAt(p, 1);
    expect(early.shells.length).toBeGreaterThan(0);
    const later = frameAt(p, Math.min(12, p.flight.ticks - 2));
    if (later.shells.length) expect(later.shells[0]!.trail.length).toBeGreaterThan(early.shells[0]!.trail.length);
  });

  it("shows a burst from the tick it happens, for a while, and what it took off whoever it hit", () => {
    const hit = shots(20).find((v) => v.last!.hits.length > 0)!;
    expect(hit).toBeDefined();
    const p = beginPlayback(hit)!;
    const struck = p.flight.events.find((e) => e.hits.length > 0)!;
    expect(frameAt(p, struck.tick - 1).numbers).toEqual([]);
    const at = frameAt(p, struck.tick);
    expect(at.bursts.some((b) => b.x === struck.x && b.age === 0)).toBe(true);
    expect(at.numbers.map((n) => [n.piece, n.damage])).toEqual(expect.arrayContaining(struck.hits.map((h) => [h.piece, h.damage])));
    expect(frameAt(p, struck.tick + BURST_FOR + 1).bursts.some((b) => b.x === struck.x && b.y === struck.y)).toBe(false);
  });

  it("is over a moment after the last thing has landed, and hands each event out once", () => {
    const p = beginPlayback(shots(1)[0]!)!;
    expect(playbackOver(p)).toBe(false);
    const heard: number[] = [];
    for (let was = 0; !playbackOver(p); was = p.tick) {
      p.tick += 1.7;
      heard.push(...eventsBetween(p, was, p.tick).map((e) => e.tick));
    }
    expect(heard).toEqual(p.flight.events.map((e) => e.tick));
    expect(p.tick).toBeGreaterThanOrEqual(p.flight.ticks + HOLD);
  });

  it("doesn't fly a shot from another version of the flight, or when there is none", () => {
    const view = shots(1)[0]!;
    expect(beginPlayback({ ...view, last: { ...view.last!, version: view.last!.version + 1 } })).toBeNull();
    expect(beginPlayback({ ...view, last: null })).toBeNull();
  });
});

describe("what a thing in the air looks like", () => {
  it("goes by what the shell does", () => {
    const shells = Object.fromEntries((game.view(game.newGame(game.normalize({}), 2, 1), 0) as FieldView).shells.map((s) => [s.id, s]));
    expect(shellLook(shells.shot, false)).toBe("shell");
    expect(shellLook(shells.laser, false)).toBe("beam");
    expect(shellLook(shells.jump, false)).toBe("orb");
    expect(shellLook(shells.dirt, false)).toBe("dirt");
    expect(shellLook(shells.napalm, false)).toBe("fire");
    // The pieces of a shell that splits look like what they are.
    expect(shellLook(shells.cluster, true)).toBe("bomblet");
    expect(shellLook(shells.napalm, true)).toBe("fire");
    expect(shellLook(shells.slide, true)).toBe("dirt");
    expect(shellLook(undefined, false)).toBe("shell");
  });

  it("is between its two points between two ticks", () => {
    const p = beginPlayback(shots(1)[0]!)!;
    const [a, b, mid] = [frameAt(p, 3).shells[0]!, frameAt(p, 4).shells[0]!, frameAt(p, 3.5).shells[0]!];
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 6);
  });
});

describe("the show", () => {
  const earth = lookOf("meadow").earth;
  const flat = () => 400;

  it("makes fire, sparks, flying earth and smoke of a burst, more of a bigger one, and shakes the screen", () => {
    const small = new Fx();
    small.event({ tick: 1, kind: "burst", x: 500, y: 400, r: 50, hits: [] }, earth);
    const big = new Fx();
    big.event({ tick: 1, kind: "burst", x: 500, y: 400, r: 200, hits: [] }, earth);
    for (const kind of ["flash", "ring", "fire", "spark", "chunk", "smoke"]) expect(small.bits.some((b) => b.kind === kind), kind).toBe(true);
    expect(big.bits.length).toBeGreaterThan(small.bits.length);
    expect(big.shake).toBeGreaterThan(small.shake);
    expect(small.shake).toBeGreaterThan(0);
    expect(big.jolt.some((n) => n !== 0)).toBe(true);
  });

  it("has something to show for every kind of thing a flight does", () => {
    for (const kind of ["burst", "fire", "heap", "skip", "bore", "split", "carry"] as const) {
      const fx = new Fx();
      fx.event({ tick: 1, kind, x: 500, y: 400, r: 60, hits: [] }, earth);
      expect(fx.bits.length, kind).toBeGreaterThan(0);
    }
    // A tracer has no bang: a puff, and no shake.
    const tracer = new Fx();
    tracer.event({ tick: 1, kind: "burst", x: 500, y: 400, r: 8, hits: [] }, earth);
    expect(tracer.shake).toBe(0);
    expect(tracer.bits.some((b) => b.kind === "fire")).toBe(false);
  });

  it("dies away by itself: everything ages out, the shake settles, and earth comes to rest on the ground", () => {
    const fx = new Fx();
    fx.event({ tick: 1, kind: "burst", x: 500, y: 400, r: 120, hits: [{ piece: "tank1", damage: 30 }] }, earth);
    fx.say("Direct hit!", 500, 400, "good");
    expect(fx.busy).toBe(true);
    let rested = 0;
    for (let i = 0; i < 400; i++) {
      fx.step(1, 0, 100, flat);
      rested += fx.bits.filter((b) => b.kind === "chunk" && b.vx === 0 && b.vy === 0 && b.y === 400).length;
      for (const b of fx.bits) if (b.kind === "chunk") expect(b.y).toBeGreaterThanOrEqual(400);
    }
    expect(rested).toBeGreaterThan(0);
    expect(fx.bits).toEqual([]);
    expect(fx.shouts).toEqual([]);
    expect(fx.shake).toBe(0);
    expect(fx.busy).toBe(false);
  });

  it("keeps a fire burning for a while, and a wreck smoking for good, wherever the wreck ends up", () => {
    const fire = new Fx();
    fire.event({ tick: 1, kind: "fire", x: 500, y: 400, r: 50, hits: [] }, earth);
    for (let i = 0; i < 100; i++) fire.step(1, 0, 100, flat);
    expect(fire.bits.some((b) => b.kind === "flame")).toBe(true);
    for (let i = 0; i < 400; i++) fire.step(1, 0, 100, flat);
    expect(fire.busy).toBe(false);

    const wreck = new Fx();
    wreck.wreck("tank1", 800, 400, earth);
    for (let i = 0; i < 600; i++) {
      wreck.smoulder("tank1", 800, 300);
      wreck.step(1, 3, 100, flat);
    }
    expect(wreck.busy).toBe(true);
    const smoke = wreck.bits.filter((b) => b.kind === "smoke");
    expect(smoke.length).toBeGreaterThan(0);
    // The wind leans it, and it rises from where the wreck now is.
    expect(smoke.some((b) => b.vx > 0)).toBe(true);
    expect(Math.min(...smoke.map((b) => b.y))).toBeGreaterThan(300);
    // A new game clears the air, but a wreck is asked after again by whoever draws it.
    wreck.clear();
    expect(wreck.bits).toEqual([]);
  });

  it("never holds more than it can draw", () => {
    const fx = new Fx();
    for (let i = 0; i < 60; i++) fx.event({ tick: 1, kind: "burst", x: 500, y: 400, r: 240, hits: [] }, earth);
    expect(fx.bits.length).toBeLessThanOrEqual(700);
  });
});

describe("the look of a place", () => {
  it("is there for every place the game has, and for one nobody has heard of", () => {
    for (const scene of ["meadow", "dusk", "desert", "snow", "moon"]) {
      const look = lookOf(scene);
      expect(look.sky.length).toBeGreaterThan(1);
      expect(look.earth.soil.length).toBeGreaterThan(1);
      expect((game.view(game.newGame(game.normalize({ scene }), 2, 1), 0) as FieldView).field.scene).toBe(scene);
    }
    expect(lookOf("moon")).not.toBe(lookOf("dusk"));
    expect(lookOf("the bottom of the sea")).toBe(lookOf("dusk"));
  });
});

describe("the field on the screen", () => {
  it("fits its width, with the ground at the bottom, and a finger maps back to where it is", () => {
    const fit = fitField({ width: 2000 }, 400, 250);
    expect([fit.x(0), fit.x(2000), fit.y(0), fit.y(1250)]).toEqual([0, 400, 250, 0]);
    for (const [x, y] of [[0, 0], [1000, 400], [1999, 1250]] as const) {
      const [bx, by] = fit.back(fit.x(x), fit.y(y));
      expect(bx).toBeCloseTo(x, 6);
      expect(by).toBeCloseTo(y, 6);
    }
  });
});

describe("the camera", () => {
  const field = { width: 2000 };
  it("looks at a point as nearly as it can without showing anything off the field", () => {
    // In the middle, the point is the middle of the screen.
    const mid = lookAt(field, 400, 250, 1000, 600, 2);
    const fit = fitField(field, 400, 250, mid);
    expect(fit.x(1000)).toBeCloseTo(200, 6);
    expect(fit.y(600)).toBeCloseTo(125, 6);
    expect(fit.scale).toBeCloseTo(0.4, 6);
    // At the left edge and the bottom, it stops: the field's own edge and floor are the screen's.
    const corner = fitField(field, 400, 250, lookAt(field, 400, 250, 50, 20, 2));
    expect(corner.x(0)).toBeCloseTo(0, 6);
    expect(corner.y(0)).toBeCloseTo(250, 6);
    const right = fitField(field, 400, 250, lookAt(field, 400, 250, 1990, 20, 1.5));
    expect(right.x(2000)).toBeCloseTo(400, 6);
    // It may rise as high as it likes, after a shell.
    expect(lookAt(field, 400, 250, 1000, 5000, 1).lift).toBeGreaterThan(4000);
    // Never further off than the whole field.
    expect(lookAt(field, 400, 250, 1000, 600, 0.4).zoom).toBe(1);
  });

  it("maps a finger back through wherever it is looking", () => {
    const fit = fitField(field, 400, 250, lookAt(field, 400, 250, 700, 900, 1.6));
    for (const [x, y] of [[300, 700], [700, 900], [1100, 1100]] as const) {
      const [bx, by] = fit.back(fit.x(x), fit.y(y));
      expect(bx).toBeCloseTo(x, 6);
      expect(by).toBeCloseTo(y, 6);
    }
  });
});

describe("light and bent air, for a screen that can show them", () => {
  const earth = lookOf("meadow").earth;
  it("come from a blast and die away; a glow lasts one frame", () => {
    const fx = new Fx();
    fx.event({ tick: 1, kind: "burst", x: 500, y: 400, r: 100, hits: [] }, earth);
    expect(fx.lights).toHaveLength(1);
    expect(fx.waves).toHaveLength(1);
    expect(fx.lights[0]!.r).toBeGreaterThan(400);
    fx.glow(900, 500, 150);
    expect(fx.lights).toHaveLength(2);
    fx.step(1, 0, 100, () => 400);
    expect(fx.lights).toHaveLength(1);
    for (let i = 0; i < 60; i++) fx.step(1, 0, 100, () => 400);
    expect(fx.lights).toEqual([]);
    expect(fx.waves).toEqual([]);
  });

  it("has a great deal more of everything when it is told the screen can take it", () => {
    const [plain, rich] = [new Fx(), new Fx()];
    rich.rich = 3;
    for (const fx of [plain, rich]) fx.event({ tick: 1, kind: "burst", x: 500, y: 400, r: 120, hits: [] }, earth);
    expect(rich.bits.length).toBeGreaterThan(plain.bits.length * 2.5);
    for (let i = 0; i < 80; i++) rich.event({ tick: 1, kind: "burst", x: 500, y: 400, r: 240, hits: [] }, earth);
    expect(rich.bits.length).toBeGreaterThan(2000);
    expect(rich.bits.length).toBeLessThanOrEqual(4900);
  });
});

describe("Over the Hill in the parlor", () => {
  it("can be shared on one device, and says how it is played here", () => {
    expect(sharesDevice("overthehill")).toBe(true);
    expect(controls("overthehill").join(" ")).toMatch(/drag/i);
  });
});
