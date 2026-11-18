// A field game on the screen: a shot is flown again from what the view carries and shown a tick
// at a time, ending on the field the view shows; and the screen and the field's own units agree
// about where a finger is.
import { QUICK_STYLE, kitGame, type FieldView } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { fitField } from "../src/field/draw";
import { BURST_FOR, HOLD, beginPlayback, eventsBetween, frameAt, playbackOver } from "../src/field/play";
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

describe("Over the Hill in the parlor", () => {
  it("can be shared on one device, and says how it is played here", () => {
    expect(sharesDevice("overthehill")).toBe(true);
    expect(controls("overthehill").join(" ")).toMatch(/drag/i);
  });
});
