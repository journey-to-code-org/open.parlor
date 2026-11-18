// The engine itself, booted in Node on the game's data: it starts, draws, takes input, makes
// sound, and stops when asked.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { decodeDmx } from "../wad/sound.ts";
import { type Engine, STATE_LEVEL, STATE_MENU, STATE_QUESTION, screenOf, startEngine } from "../src/shooter/engine.ts";
import { KEY } from "../src/shooter/keys.ts";

const wad = join(import.meta.dirname, "../games/shooter/delbies/delbies.wad");
const wasm = join(import.meta.dirname, "../games/shooter/shooter.wasm");
/** One game tic, in milliseconds: the engine runs 35 a second. */
const TIC = 1000 / 35;

async function boot(args: string[] = [], kept: [string, Uint8Array][] = []) {
  const game = {
    engine: null as unknown as Engine,
    clock: 0,
    frames: 0,
    /** The last frame, copied out. */
    picture: new Uint8ClampedArray(0),
    title: "",
    sounds: [] as Uint8Array[],
    /** What the engine wrote, by path. */
    written: new Map<string, Uint8Array>(),
    /** Runs the engine for this many tics of game time. */
    run(tics: number) {
      for (let i = 0; i < tics; i++) {
        game.clock += TIC;
        if (!game.engine.frame()) return;
      }
    },
    tap(key: number) {
      game.engine.key(true, key);
      game.run(2);
      game.engine.key(false, key);
      game.run(2);
    },
  };
  const files = new Map([["delbies.wad", new Uint8Array(readFileSync(wad))], ...kept]);
  game.engine = await startEngine(
    new WebAssembly.Module(readFileSync(wasm)),
    files,
    "delbies.wad",
    {
      now: () => game.clock,
      frame(pixels) {
        game.frames++;
        game.picture = pixels.slice();
      },
      title: (title) => (game.title = title),
      sound: { start: (_channel, _lump, bytes) => void game.sounds.push(bytes()), update() {}, stop() {}, playing: () => false },
      written: (path, bytes) => void game.written.set(path, bytes),
      removed: (path) => void game.written.delete(path),
    },
    args,
  );
  return game;
}

/** How many different colours a frame has: a blank or broken one has very few. */
const colours = (picture: Uint8ClampedArray) => new Set(new Uint32Array(picture.buffer, 0, picture.length / 4)).size;

describe("the engine on the game", () => {
  test("starts on the title screen and draws it", async () => {
    const game = await boot();
    expect(game.engine.stopped).toBeNull();
    expect(game.title).toBe("Delbie's Doomsday");
    // The title melts in from black, which takes about a second; until it has, input is held.
    for (let i = 0; i < 10; i++) {
      expect(screenOf(game.engine.state())).toBe("wipe");
      game.run(1);
    }
    game.run(70);
    expect(screenOf(game.engine.state())).toBe("title");
    expect(game.frames).toBeGreaterThan(40);
    expect(game.picture.length).toBe(320 * 200 * 4);
    expect(colours(game.picture)).toBeGreaterThan(30);
    // Every pixel is opaque: the frame goes straight onto a canvas.
    expect(game.picture.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
    expect(game.engine.state() & (STATE_MENU | STATE_LEVEL)).toBe(0);
  });

  test("a level is played: the stick moves, a swipe turns, the trigger fires and is heard", async () => {
    const game = await boot(["-warp", "1", "1", "-skill", "1"]);
    game.run(70);
    expect(game.engine.state() & STATE_LEVEL).toBe(STATE_LEVEL);
    const still = game.picture;

    game.engine.analog(50, 0, 0);
    game.run(20);
    game.engine.analog(0, 0, 0);
    game.run(5);
    const walked = game.picture;
    expect(walked).not.toEqual(still);

    game.engine.mouse(0, 600, 0);
    game.run(5);
    expect(game.picture).not.toEqual(walked);

    const before = game.sounds.length;
    game.tap(KEY.fire);
    game.run(10);
    expect(game.sounds.length).toBeGreaterThan(before);
    const shot = decodeDmx(game.sounds.at(-1)!);
    expect(shot?.rate).toBeGreaterThanOrEqual(11025);
    expect(shot?.samples.length).toBeGreaterThan(1000);
    expect(game.engine.stopped).toBeNull();
  });

  test("a new game from the menu melts the title away into the level, a step a frame", async () => {
    const game = await boot();
    game.run(80);
    game.tap(KEY.escape);
    expect(game.engine.state() & STATE_MENU).toBe(STATE_MENU);
    // New game, the first episode, the skill it offers.
    for (let i = 0; i < 3; i++) game.tap(KEY.enter);
    // The wipe takes about a second, and the game waits for it; the frames on the way all differ.
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      game.run(2);
      seen.add(game.picture.join());
      if (i < 10) expect(screenOf(game.engine.state())).toBe("wipe");
    }
    expect(seen.size).toBeGreaterThan(15);
    game.run(40);
    expect(screenOf(game.engine.state())).toBe("level");
  });

  test("quitting from the menu stops the engine cleanly and keeps the settings", async () => {
    const game = await boot();
    game.run(80);
    game.tap(KEY.escape);
    // The last item of the main menu is Quit: up from the first wraps round to it.
    game.tap(KEY.up);
    game.tap(KEY.enter);
    expect(game.engine.state() & STATE_QUESTION).toBe(STATE_QUESTION);
    expect(screenOf(game.engine.state())).toBe("question");
    game.tap(KEY.yes);
    game.run(10);
    expect(game.engine.stopped).toEqual({ code: 0, message: "" });
    expect(game.engine.frame()).toBe(false);
    // The settings are written on the way out, and read on the way back in.
    const settings = new TextDecoder().decode(game.written.get(".default.cfg"));
    expect(settings).toMatch(/^mouse_sensitivity\s+5$/m);
    const again = await boot([], [[".default.cfg", new TextEncoder().encode(settings.replace(/^mouse_sensitivity.*$/m, "mouse_sensitivity 9"))]]);
    again.run(80);
    again.tap(KEY.escape);
    again.tap(KEY.up);
    again.tap(KEY.enter);
    again.tap(KEY.yes);
    again.run(10);
    expect(new TextDecoder().decode(again.written.get(".default.cfg"))).toMatch(/^mouse_sensitivity\s+9$/m);
  });

  test("a game saved from the menu is a file the next visit can load", async () => {
    const game = await boot(["-warp", "1", "1", "-skill", "1"]);
    game.run(80);
    game.engine.analog(50, 0, 0);
    game.run(30);
    game.engine.analog(0, 0, 0);
    // A running player slides a good way before stopping.
    game.run(70);
    const there = game.picture;
    // Menu, down to Save Game, the first slot, a name, and done.
    game.tap(KEY.escape);
    for (let i = 0; i < 3; i++) game.tap(KEY.down);
    game.tap(KEY.enter);
    game.tap(KEY.enter);
    game.tap("a".charCodeAt(0));
    game.tap(KEY.enter);
    game.run(10);
    const save = game.written.get(".savegame/doomsav0.dsg");
    expect(save?.length).toBeGreaterThan(1000);
    expect([...game.written.keys()]).not.toContain(".savegame/temp.dsg");

    const back = await boot(["-loadgame", "0"], [[".savegame/doomsav0.dsg", save!]]);
    back.run(120);
    expect(back.engine.stopped).toBeNull();
    expect(back.engine.state() & STATE_LEVEL).toBe(STATE_LEVEL);
    // Standing where the save was made, not at the level's start.
    const start = await boot(["-warp", "1", "1", "-skill", "1"]);
    start.run(120);
    const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.reduce((count, value, i) => count + (value === b[i] ? 0 : 1), 0) / a.length;
    expect(differs(back.picture, there)).toBeLessThan(differs(back.picture, start.picture));
  });

  test("a WAD that isn't one stops the engine with what it said", async () => {
    const stopped = await startEngine(new WebAssembly.Module(readFileSync(wasm)), new Map([["delbies.wad", new Uint8Array(64)]]), "delbies.wad", { frame() {} });
    expect(stopped.stopped?.code).not.toBe(0);
    expect(stopped.stopped?.message).not.toBe("");
  });
});

test("a DMX sound lump decodes to samples between -1 and 1", () => {
  const lump = new Uint8Array(8 + 64);
  lump.set([3, 0, 0x11, 0x2b, 64, 0, 0, 0]);
  lump.fill(128, 8);
  lump[8 + 16] = 255;
  lump[8 + 17] = 0;
  const sound = decodeDmx(lump)!;
  expect(sound.rate).toBe(11025);
  // The 16 samples of padding at each end are dropped.
  expect(sound.samples.length).toBe(32);
  expect(sound.samples[0]).toBeCloseTo(127 / 128);
  expect(sound.samples[1]).toBe(-1);
  expect(sound.samples[2]).toBe(0);
  expect(decodeDmx(new Uint8Array([1, 2, 3]))).toBeNull();
});
