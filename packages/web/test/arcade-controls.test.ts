// The arcade games' controls: keys and fingers in, one tick's input out.
import { SKYFIRE_SPEED, skyfire } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { skyfireControls } from "../src/arcade/controls";

const make = (autofire = false) => skyfireControls({ autofire: () => autofire });

describe("Shitstorm's controls (skyfire)", () => {
  it("rests when nothing is touched, and fires by itself only when asked to", () => {
    expect(make().read()).toEqual(skyfire.idle);
    expect(make(true).read()).toEqual({ ...skyfire.idle, fire: true });
  });

  it("moves at full speed with the arrows or WASD, no faster on a diagonal, and slowly with Shift", () => {
    const c = make();
    c.key("ArrowLeft", true);
    expect(c.read()).toMatchObject({ dx: -SKYFIRE_SPEED, dy: 0 });
    c.key("w", true);
    const diagonal = c.read();
    expect(diagonal.dx * diagonal.dx + diagonal.dy * diagonal.dy).toBeLessThanOrEqual(SKYFIRE_SPEED * SKYFIRE_SPEED);
    expect(skyfire.input(diagonal)).toEqual(diagonal);
    c.key("ArrowLeft", false);
    c.key("w", false);
    c.key("D", true);
    c.key("Shift", true);
    const slow = c.read();
    expect(slow.dx).toBeGreaterThan(0);
    expect(slow.dx).toBeLessThan(SKYFIRE_SPEED);
    c.clear();
    expect(c.read()).toEqual(skyfire.idle);
  });

  it("fires while a fire key is held, and bombs with a key or the button, once", () => {
    const c = make();
    c.key(" ", true);
    expect(c.read().fire).toBe(true);
    c.key(" ", false);
    expect(c.read().fire).toBe(false);
    c.special();
    expect(c.read().bomb).toBe(true);
    expect(c.read().bomb).toBe(false);
    c.key("x", true);
    expect(c.read().bomb).toBe(true);
  });

  it("follows a finger a tick at a time, fires while it is down, and bombs on a second finger", () => {
    const c = make();
    c.pointerDown(1, 100, 100);
    expect(c.read()).toMatchObject({ dx: 0, dy: 0, fire: true, bomb: false });
    c.pointerMove(1, 110, 100, 20); // 10 pixels right at 20 units a pixel, and a quarter more
    const first = c.read();
    expect(first.dx).toBe(SKYFIRE_SPEED);
    let moved = first.dx;
    for (let i = 0; i < 10; i++) moved += c.read().dx;
    expect(moved).toBe(250);
    c.pointerDown(2, 50, 50);
    expect(c.read().bomb).toBe(true);
    c.pointerUp(2); // not the finger that steers
    expect(c.read().fire).toBe(true);
    c.pointerUp(1);
    expect(c.read()).toEqual(skyfire.idle);
  });

  it("never asks the ship to catch up more than a moment's flying", () => {
    const c = make();
    c.pointerDown(1, 0, 0);
    c.pointerMove(1, 5000, 0, 20);
    let moved = 0;
    for (let i = 0; i < 60; i++) moved += c.read().dx;
    expect(moved).toBeLessThanOrEqual(900);
  });
});

describe("Tower of Ryan's controls (bulwark)", () => {
  it("sends each order once, with the next number, and holds the last one after", async () => {
    const { bulwarkControls } = await import("../src/arcade/controls");
    const { bulwark } = await import("@journey-to-code/games");
    const c = bulwarkControls();
    expect(c.read()).toEqual(bulwark.idle);
    c.order!("build", 3, 4, "frost");
    c.order!("send");
    const first = c.read();
    expect(first).toEqual({ n: 1, cmd: "build", col: 3, row: 4, kind: "frost" });
    expect(bulwark.input(first)).toEqual(first);
    expect(c.read()).toMatchObject({ n: 2, cmd: "send" });
    // Nothing new: the same input again, which the game has already seen and won't repeat.
    expect(c.read()).toMatchObject({ n: 2, cmd: "send" });
    c.order!("upgrade", 3, 4);
    c.clear();
    expect(c.read().n).toBe(2);
    expect(c.specialLabel).toBe("");
  });

  it("builds a tower in a real game from an order", async () => {
    const { bulwarkControls } = await import("../src/arcade/controls");
    const { bulwark, BULWARK_GRID } = await import("@journey-to-code/games");
    const state = bulwark.newGame(bulwark.normalize(null), 1, 3);
    const c = bulwarkControls();
    const free = Array.from({ length: BULWARK_GRID.cols * BULWARK_GRID.rows }, (_, i) => i).find((i) => !state.road.includes(i))!;
    c.order!("build", free % BULWARK_GRID.cols, Math.floor(free / BULWARK_GRID.cols), "dart");
    for (let t = 0; t < 10; t++) bulwark.step(state, [c.read()]);
    expect(bulwark.view(state).build!.built).toHaveLength(1);
  });
});
