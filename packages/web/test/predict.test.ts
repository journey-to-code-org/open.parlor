// A page flying at a live table, against a server on a slow line: what it draws of its own ship.
import { arcadeGame } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { createPredictor, type Frame } from "../src/arcade/predict";

const game = arcadeGame("skyfire")!;
type Ship = { x: number; y: number };
const shipOf = (state: unknown): Ship => (state as { pilots: Ship[] }).pilots[0]!;

/**
 * A server and one page, a tick and a frame at a time (both sixty a second), with a line between
 * them that takes `delay(tick)` ticks each way and never puts one message ahead of another.
 * `steer(tick)` is what the page's controls are doing. Gives back what was drawn each frame.
 */
function fly(ticks: number, delay: (tick: number) => number, steer: (tick: number) => { dx: number; dy: number }) {
  const server = game.newGame(game.presets[0], 1, 11);
  // Nothing can hurt this ship: a ship that is shot down comes back somewhere else, which would
  // look like a lurch and is nothing to do with the line.
  (server as { pilots: { ghost: number }[] }).pilots[0]!.ghost = 1e9;
  let asked: unknown = game.idle;
  let was = JSON.stringify(game.idle);
  const page = createPredictor(game, 0);
  page.reset(structuredClone(server), 0, [game.idle]);
  const up: { at: number; input: unknown }[] = [];
  const down: { at: number; frame: Frame }[] = [];
  let upFree = 0;
  let downFree = 0;
  const drawn: { x: number; lead: number; truth: number; steer: number }[] = [];
  for (let t = 0; t < ticks; t++) {
    // The server: hears what has arrived, plays a tick, says what changed.
    while (up.length && up[0]!.at <= t) asked = up.shift()!.input;
    const frame: Frame = JSON.stringify(asked) === was ? [] : [[0, asked]];
    was = JSON.stringify(asked);
    game.step(server, [asked]);
    downFree = Math.max(downFree, t + delay(t));
    down.push({ at: downFree, frame });
    // The page: hears what has arrived, and draws a frame.
    const told: Frame[] = [];
    while (down.length && down[0]!.at <= t) told.push(down.shift()!.frame);
    page.told(told);
    const input = game.input({ ...steer(t), fire: true, bomb: false });
    const out = page.frame(input);
    if (out.send) {
      upFree = Math.max(upFree, t + delay(t));
      up.push({ at: upFree, input: JSON.parse(out.send) });
    }
    drawn.push({ x: shipOf(out.state).x, lead: page.lead, truth: shipOf(server).x, steer: (input as { dx: number }).dx });
  }
  return drawn;
}
/** Left for a while, still, right for a while, still: over and over. */
const weave = (t: number) => {
  const beat = Math.floor(t / 40) % 4;
  return { dx: beat === 0 ? -60 : beat === 2 ? 60 : 0, dy: 0 };
};
/** A line whose delay wanders between two values, the same way every time. */
const wandering = (low: number, high: number) => {
  let r = 7;
  let now = (low + high) / 2;
  return () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    now = Math.max(low, Math.min(high, now + ((r / 2 ** 32) - 0.5) * (high - low) * 0.5));
    return Math.round(now);
  };
};
/** Frames on which the drawn ship went against the steering, and the furthest it moved in one frame. */
function judge(drawn: ReturnType<typeof fly>, from = 120) {
  let against = 0;
  let furthest = 0;
  for (let i = Math.max(1, from); i < drawn.length; i++) {
    const moved = drawn[i]!.x - drawn[i - 1]!.x;
    const steer = drawn[i]!.steer;
    if (steer && Math.sign(moved) === -Math.sign(steer)) against++;
    furthest = Math.max(furthest, Math.abs(moved));
  }
  return { against, furthest };
}

describe("a page flying on a slow line", () => {
  it("answers the controls at once, where the server's own game answers a round trip late", () => {
    const drawn = fly(600, () => 6, weave);
    expect(drawn.at(-1)!.lead).toBeGreaterThanOrEqual(11);
    // The first frame of a turn: the ship that is drawn is already moving.
    const turn = 4 * 40 * 3;
    expect(drawn[turn + 2]!.x).toBeLessThan(drawn[turn - 1]!.x);
    // The server will not have it move for a dozen ticks yet.
    expect(drawn[turn + 2]!.truth).toBe(drawn[turn - 1]!.truth);
  });

  it("draws the ship where the server will have it, on a steady line", () => {
    const delay = 6;
    const drawn = fly(900, () => delay, weave);
    // What is drawn now is what the server's game will say a fixed few ticks on (about the trip one
    // way): the same ship, ahead of time, and not just something like it.
    const off = (ahead: number) => {
      let worst = 0;
      for (let t = 300; t < drawn.length - 20; t++) worst = Math.max(worst, Math.abs(drawn[t]!.x - drawn[t + ahead]!.truth));
      return worst;
    };
    const best = Array.from({ length: 20 }, (_, ahead) => ({ ahead, worst: off(ahead) })).sort((a, b) => a.worst - b.worst)[0]!;
    expect(best.ahead).toBeGreaterThanOrEqual(delay - 3);
    expect(best.ahead).toBeLessThanOrEqual(delay + 3);
    expect(best.worst).toBeLessThanOrEqual(2);
    expect(judge(drawn, 300).against).toBe(0);
  });

  it("never draws the ship going against the steering, however the line wanders", () => {
    for (const [low, high] of [[2, 10], [1, 15], [4, 6], [0, 3]] as const) {
      const drawn = fly(1500, wandering(low, high), weave);
      const { against, furthest } = judge(drawn);
      expect(against, `delay ${low} to ${high} ticks`).toBe(0);
      // Nor lurching: steering moves it 60 a tick, and no frame moves it more than three times that.
      expect(furthest, `delay ${low} to ${high} ticks`).toBeLessThanOrEqual(180);
    }
  });

  it("ends up where the server has the ship once the steering stops", () => {
    const drawn = fly(1500, wandering(2, 12), (t) => (t < 1200 ? weave(t) : { dx: 0, dy: 0 }));
    expect(Math.abs(drawn.at(-1)!.x - drawn.at(-1)!.truth)).toBeLessThanOrEqual(2);
  });

  it("leaves someone who is only watching on the server's own game", () => {
    const watcher = createPredictor(game, null);
    const server = game.newGame(game.presets[0], 1, 11);
    watcher.reset(structuredClone(server), 0, [game.idle]);
    watcher.told([[[0, game.input({ dx: 60, dy: 0, fire: true })]], [], []]);
    const out = watcher.frame(game.input({ dx: -60, dy: 0 }));
    expect(out.send).toBeNull();
    expect(out.state).toBe(watcher.real);
  });
});
