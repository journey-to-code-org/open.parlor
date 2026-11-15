// Bowling's throw from a swipe (sport/throw.ts): up the screen is up the lane, faster is harder,
// a slant is a little aim, and a curl at the end is spin, the way it curls.
import { describe, expect, it } from "vitest";
import { readSwipe, sideways, type Touch } from "../src/sport/throw";

const SHOOT = { body: "ball", minPower: 150, maxPower: 1000, maxSpin: 1000 };
const H = 600;
/** A swipe up from (200, 520), `steps` moves `ms` apart, bent sideways by `bend(t)` (t from 0 to 1). */
const swipe = (ms: number, bend: (t: number) => number = () => 0, steps = 16, slant = 0): Touch[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return { x: 200 + slant * t * 300 + bend(t), y: 520 - t * 320, t: i * ms };
  });

describe("reading a swipe", () => {
  it("sends a straight swipe straight up the lane, with no spin, from where the bowler stands", () => {
    const th = readSwipe(swipe(18), SHOOT, 1200, H)!;
    expect(th).toMatchObject({ angle: 27000, spin: 0, at: 1200 });
  });

  it("throws harder the faster the swipe, and always hard enough to reach the pins", () => {
    const slow = readSwipe(swipe(60), SHOOT, 0, H)!;
    const quick = readSwipe(swipe(12), SHOOT, 0, H)!;
    expect(quick.power).toBeGreaterThan(slow.power);
    expect(slow.power).toBeGreaterThanOrEqual(480);
    expect(readSwipe(swipe(2), SHOOT, 0, H)!.power).toBe(1000);
  });

  it("aims a little the way the swipe slants, and never more than a few degrees", () => {
    expect(readSwipe(swipe(18, undefined, 16, 0.1), SHOOT, 0, H)!.angle).toBeGreaterThan(27000);
    expect(readSwipe(swipe(18, undefined, 16, -0.1), SHOOT, 0, H)!.angle).toBeLessThan(27000);
    expect(Math.abs(readSwipe(swipe(18, undefined, 16, 3), SHOOT, 0, H)!.angle - 27000)).toBeLessThanOrEqual(700);
  });

  it("puts spin on a swipe that curls at the end: curling left hooks left", () => {
    const left = readSwipe(swipe(18, (t) => (t > 0.6 ? -(t - 0.6) * 300 : 0)), SHOOT, 0, H)!;
    const right = readSwipe(swipe(18, (t) => (t > 0.6 ? (t - 0.6) * 300 : 0)), SHOOT, 0, H)!;
    expect(left.spin).toBeLessThan(-300);
    expect(right.spin).toBeGreaterThan(300);
  });

  it("is no throw at all for a tap, a short flick or a swipe down", () => {
    expect(readSwipe(swipe(18).slice(0, 2), SHOOT, 0, H)).toBeNull();
    expect(readSwipe(swipe(18).slice(0, 3), SHOOT, 0, H)).toBeNull();
    expect(readSwipe(swipe(18).reverse().map((p, i) => ({ ...p, t: i * 18 })), SHOOT, 0, H)).toBeNull();
  });

  it("tells a sideways drag (where to stand) from a swipe up", () => {
    expect(sideways([{ x: 0, y: 0, t: 0 }, { x: 30, y: 4, t: 30 }])).toBe(true);
    expect(sideways([{ x: 0, y: 0, t: 0 }, { x: 4, y: -30, t: 30 }])).toBe(false);
    expect(sideways([{ x: 0, y: 0, t: 0 }, { x: 3, y: 1, t: 30 }])).toBe(false);
  });
});
