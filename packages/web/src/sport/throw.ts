// Bowling's throw, from a swipe. The way a bowling game on a phone does it: drag sideways to pick
// your spot on the foul line, then swipe up the lane. How fast the swipe goes is how hard the ball
// goes; which way it starts is the aim; and a swipe that curls at the end puts spin on the ball,
// the way it curls. It is read on the screen itself (up the screen is up the lane), so it works
// whatever the camera is doing.
//
// The guide is the ball's own path, played by the physics on the lane with no pins on it: where
// this throw goes, hook and all, before it is thrown.
import type { SportShoot, SportView } from "@journey-to-code/games";
import { frames, type Point } from "@journey-to-code/physics";

export interface Throw {
  /** Where on the foul line (its x). */
  at: number;
  /** Whole hundredths of a degree; 27000 is straight up the lane. */
  angle: number;
  power: number;
  /** Side spin, -1000 to 1000: positive hooks right. */
  spin: number;
}

/** A point of a swipe: where the finger was, on the screen, and when (ms). */
export interface Touch {
  x: number;
  y: number;
  t: number;
}

/** The aim is a few degrees either way at most: the lane is narrow, and a swipe is not precise. */
export const AIM_LIMIT = 700;
/** How much of a swipe's own angle becomes the ball's: a gentle slant is a small aim. */
const AIM_SHARE = 0.3;
/** A curl of this many degrees from the swipe's start to its end is full spin. */
const FULL_CURL = 42;
/** The softest ball a swipe throws: one that still reaches the pins on the plain lane. */
const FLOOR = 480;
/** A curl smaller than this is a straight ball: no finger swipes dead straight. */
const CURL_DEADZONE = 5;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const degrees = (rad: number) => (rad * 180) / Math.PI;

/** A swipe that goes up the screen, or null: a tap, a swipe down, a swipe mostly sideways. */
export function readSwipe(path: Touch[], shoot: SportShoot, at: number, height: number): Throw | null {
  if (path.length < 3) return null;
  const first = path[0]!;
  const last = path.at(-1)!;
  const rise = first.y - last.y;
  if (rise < Math.max(40, height * 0.08)) return null;
  // The direction it set off in: the start to where it had gone two fifths of the way up.
  const early = path.find((p) => first.y - p.y >= rise * 0.4) ?? last;
  const startAngle = Math.atan2(early.x - first.x, first.y - early.y);
  // The direction it finished in: over its last fifth.
  const late = [...path].reverse().find((p) => p.y - last.y >= rise * 0.2) ?? first;
  const endAngle = Math.atan2(last.x - late.x, late.y - last.y);
  // How fast it was going at the end, in screen heights a second, over the last tenth of a second.
  const recent = path.filter((p) => last.t - p.t <= 100);
  const from = recent[0] ?? first;
  const dt = Math.max(16, last.t - from.t);
  const speed = (Math.hypot(last.x - from.x, last.y - from.y) / dt) * (1000 / Math.max(200, height));
  // An easy flick (about two screen heights a second) is a good firm ball; a hard one is full power.
  const share = clamp((speed - 0.4) / (2.6 - 0.4), 0, 1);
  const curl = degrees(endAngle - startAngle);
  const spun = Math.abs(curl) < CURL_DEADZONE ? 0 : clamp(((Math.abs(curl) - CURL_DEADZONE) / (FULL_CURL - CURL_DEADZONE)) * Math.sign(curl), -1, 1);
  return {
    at,
    angle: Math.round(27000 + clamp(degrees(startAngle) * AIM_SHARE * 100, -AIM_LIMIT, AIM_LIMIT)),
    // Even a gentle swipe is a ball that gets to the pins: a swipe up the lane means to bowl.
    power: Math.round(Math.max(shoot.minPower, FLOOR) + share * (shoot.maxPower - Math.max(shoot.minPower, FLOOR))),
    spin: Math.round(spun * (shoot.maxSpin ?? 0)),
  };
}

/** Is this the start of a sideways drag (picking a spot on the foul line), not a swipe up the lane? */
export const sideways = (path: Touch[]) => {
  const first = path[0];
  const last = path.at(-1);
  if (!first || !last) return false;
  const dx = Math.abs(last.x - first.x);
  const dy = Math.abs(last.y - first.y);
  return dx + dy >= 12 && dx > dy * 1.4;
};

/** Where the ball goes on this throw, with nothing on the lane in its way but what doesn't move. */
export function guideOf(table: SportView["table"], ball: string, th: Throw): Point[] {
  const bodies = table.world.bodies.filter((b) => b.id === ball || b.fixed).map((b) => (b.id === ball ? { ...b, x: th.at } : b));
  const world = { ...table.world, bodies, maxTicks: Math.min(table.world.maxTicks, 900) };
  const path: Point[] = [];
  let n = 0;
  try {
    for (const f of frames(world, { body: ball, angle: th.angle, power: th.power, ...(th.spin ? { spin: { side: th.spin, top: 0 } } : {}) })) {
      const b = f.bodies.find((x) => x.id === ball);
      if (!b || !b.live) break;
      if (n++ % 4 === 0) path.push([b.x, b.y]);
    }
  } catch {
    return [];
  }
  return path;
}
