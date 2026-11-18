// The editor's reading and writing of the game's data, checked two ways: on small pictures and
// sounds made here, and on the real game, where a changed lump has to show on the engine's screen
// and come out of its speaker.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import data from "../games/shooter/data.json";
import { startEngine } from "../src/shooter/engine.ts";
import { KEY } from "../src/shooter/keys.ts";
import { catalogue, isLevelKind, key } from "../wad/catalogue.ts";
import { decodeThings, encodeThings, FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, levelLumps, levelNames, readLevel, THING_KINDS, thingKind } from "../wad/level.ts";
import { applyMod, type Change, fits, modFromWad, modToWad } from "../wad/mod.ts";
import { decodeFlat, decodePatch, encodeFlat, encodePatch, fromRgba, paletteOf, type Picture, toRgba } from "../wad/picture.ts";
import { decodeDmx, encodeDmx, mixDown, resample } from "../wad/sound.ts";
import { readWad, writeWad } from "../wad/wad.ts";

/** A picture with a hole in it: a 5 by 6 frame of colour 4 round nothing, with one column split in two. */
function frame(): Picture {
  const picture: Picture = { width: 5, height: 6, left: 2, top: 5, pixels: new Uint8Array(30), solid: new Uint8Array(30) };
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 5; x++) {
      const edge = x === 0 || x === 4 || y === 0 || y === 5;
      picture.solid[y * 5 + x] = edge ? 1 : 0;
      picture.pixels[y * 5 + x] = edge ? 4 + x : 0;
    }
  return picture;
}

test("a WAD's lumps come back as they went in, markers and repeated names and all", () => {
  const lumps = [
    { name: "PLAYPAL", data: new Uint8Array(768).fill(9) },
    { name: "S_START", data: new Uint8Array(0) },
    { name: "TROOA1", data: new Uint8Array([1, 2, 3]) },
    { name: "S_END", data: new Uint8Array(0) },
    { name: "THINGS", data: new Uint8Array([5]) },
    { name: "THINGS", data: new Uint8Array([6, 7]) },
  ];
  const wad = readWad(writeWad({ kind: "PWAD", lumps }));
  expect(wad.kind).toBe("PWAD");
  expect(wad.lumps.map((lump) => [lump.name, [...lump.data]])).toEqual(lumps.map((lump) => [lump.name, [...lump.data]]));
  expect(() => readWad(new Uint8Array(64))).toThrow("isn't a WAD");
  expect(() => readWad(writeWad({ kind: "IWAD", lumps }).subarray(0, 800))).toThrow("cut short");
});

test("a picture with see-through parts survives being written as the engine's columns and read back", () => {
  const picture = frame();
  const lump = encodePatch(picture);
  expect(decodePatch(lump)).toEqual(picture);
  // A column that is all gap is just its end mark; one split by the hole is two posts.
  expect(lump.length).toBe(8 + 5 * 4 + 2 * (4 + 6 + 1) + 3 * (5 + 5 + 1));
  // Anything short of a whole picture isn't one.
  expect(decodePatch(lump.subarray(0, lump.length - 1))).toBeNull();
  expect(decodePatch(new Uint8Array(100))).toBeNull();
  expect(() => encodePatch({ ...picture, height: 300 })).toThrow("254");
});

test("a tall run of pixels is written as several posts and read back whole", () => {
  const picture: Picture = { width: 1, height: 250, left: 0, top: 0, pixels: new Uint8Array(250).map((_, i) => i), solid: new Uint8Array(250).fill(1) };
  expect(decodePatch(encodePatch(picture))).toEqual(picture);
});

test("any picture is brought into the game's colours, and what is mostly not there is see-through", () => {
  const palette = new Uint8Array(768);
  palette.set([255, 0, 0], 3);
  palette.set([0, 0, 250], 6);
  palette.set([200, 200, 200], 9);
  const rgba = new Uint8ClampedArray([250, 10, 10, 255, 10, 20, 240, 200, 190, 210, 205, 255, 255, 0, 0, 90]);
  const picture = fromRgba(rgba, 2, 2, palette, { left: 1, top: 2 });
  expect([...picture.pixels]).toEqual([1, 2, 3, 0]);
  expect([...picture.solid]).toEqual([1, 1, 1, 0]);
  expect([picture.left, picture.top]).toEqual([1, 2]);
  expect([...toRgba(picture, palette)]).toEqual([255, 0, 0, 255, 0, 0, 250, 255, 200, 200, 200, 255, 0, 0, 0, 0]);
});

test("a floor is 64 by 64, and nothing else", () => {
  const floor = decodeFlat(new Uint8Array(4096).fill(7))!;
  expect([floor.width, floor.height, floor.solid.every(Boolean)]).toEqual([64, 64, true]);
  expect(encodeFlat(floor)).toEqual(new Uint8Array(4096).fill(7));
  expect(decodeFlat(new Uint8Array(100))).toBeNull();
  expect(() => encodeFlat(frame())).toThrow("64 by 64");
});

test("a sound survives being written for the engine, and is brought to its rate", () => {
  const wave = Float32Array.from({ length: 4410 }, (_, i) => Math.sin((i / 44100) * 2 * Math.PI * 440) * 0.8);
  const down = resample({ rate: 44100, samples: wave }, 11025);
  expect(down.samples.length).toBe(1102);
  const back = decodeDmx(encodeDmx(down))!;
  expect(back.rate).toBe(11025);
  expect(back.samples.length).toBe(1102);
  // Eight bits a sample: close, not exact.
  expect(Math.max(...back.samples.map((sample, i) => Math.abs(sample - down.samples[i]!)))).toBeLessThan(0.02);
  // Still a 440 Hz tone: it crosses zero going up about 44 times in a tenth of a second.
  const rises = back.samples.filter((sample, i) => i > 0 && back.samples[i - 1]! < 0 && sample >= 0).length;
  expect(rises).toBeGreaterThan(41);
  expect(rises).toBeLessThan(47);
  expect([...mixDown([new Float32Array([1, 0]), new Float32Array([0, 0.5])])]).toEqual([0.5, 0.25]);
  expect(resample({ rate: 8000, samples: new Float32Array([0, 1]) }, 16000).samples.length).toBe(4);
});

const file = join(import.meta.dirname, "../public/data", data.file);

describe.skipIf(!existsSync(file))("the real game", () => {
  const game = existsSync(file) ? new Uint8Array(gunzipSync(readFileSync(file))) : new Uint8Array(0);
  const wad = existsSync(file) ? readWad(game) : { kind: "IWAD" as const, lumps: [] };
  const assets = catalogue(wad);
  const palette = existsSync(file) ? paletteOf(wad.lumps.find((lump) => lump.name === "PLAYPAL")!.data) : new Uint8Array(768);
  const find = (kind: string, name: string) => assets.find((asset) => asset.kind === kind && asset.name === name)!;
  const lump = (kind: string, name: string) => wad.lumps[find(kind, name).index]!.data;
  const module = existsSync(file) ? new WebAssembly.Module(readFileSync(join(import.meta.dirname, "../games/shooter/shooter.wasm"))) : (null as unknown as WebAssembly.Module);

  test("is sorted into sprites, walls, floors, other pictures and sounds, every one of them readable", () => {
    const count = (kind: string) => assets.filter((asset) => asset.kind === kind).length;
    expect(count("sprite")).toBeGreaterThan(800);
    expect(count("wall")).toBeGreaterThan(300);
    expect(count("floor")).toBeGreaterThan(100);
    expect(count("screen")).toBeGreaterThan(200);
    expect(count("sound")).toBeGreaterThan(60);
    // (A level's walls are several lumps, found from its marker: test/shape.test.ts.)
    expect(assets.filter((asset) => asset.kind !== "walls" && !fits(asset.kind, wad.lumps[asset.index]!.data)).map((asset) => asset.name)).toEqual([]);
    expect(new Set(assets.map((asset) => key(asset.kind, asset.name))).size).toBe(assets.length);
    // Nothing of a level, and none of the game's own tables, is offered as a picture.
    expect(assets.filter((asset) => !isLevelKind(asset.kind) && /^(THINGS|PLAYPAL|COLORMAP|E1M1|TEXTURE1|D_E1M1|DEMO1)$/.test(asset.name))).toEqual([]);
    // Each level is there once for what is placed in it, and once for what it is built of.
    expect(assets.filter((asset) => asset.kind === "things").map((asset) => asset.name)).toEqual(levelNames(wad));
    expect(assets.filter((asset) => asset.kind === "walls").map((asset) => asset.name)).toEqual(levelNames(wad));
    expect(levelNames(wad)).toHaveLength(36);
    expect(find("screen", "TITLEPIC").note).toBe("Title screen");
    expect(find("sprite", "TROOA1").note).toBe("Fireball thrower");
    expect(find("sound", "DSPISTOL").note).toBe("Pistol shot");
  });

  test("its pictures are written back byte for byte the size they were read, and to the same pixels", () => {
    for (const [kind, name] of [["screen", "TITLEPIC"], ["sprite", "TROOA1"], ["wall", assets.find((asset) => asset.kind === "wall")!.name]] as const) {
      const picture = decodePatch(lump(kind, name))!;
      expect(decodePatch(encodePatch(picture))).toEqual(picture);
    }
    const title = decodePatch(lump("screen", "TITLEPIC"))!;
    expect([title.width, title.height]).toEqual([320, 200]);
    // Already in the game's colours, a picture comes through the conversion as itself.
    const colour = (pixel: number) => `${palette[pixel * 3]},${palette[pixel * 3 + 1]},${palette[pixel * 3 + 2]}`;
    expect(fromRgba(toRgba(title, palette), 320, 200, palette).pixels.filter((pixel, i) => colour(pixel) !== colour(title.pixels[i]!)).length).toBe(0);
  });

  test("a changed title screen and a changed pistol are what the engine shows and plays", async () => {
    // A title that is all one green, and a pistol that is a quarter of a second of a tone.
    const green = new Uint8ClampedArray(320 * 200 * 4);
    for (let i = 0; i < green.length; i += 4) green.set([0, 255, 0, 255], i);
    const title = encodePatch(fromRgba(green, 320, 200, palette));
    const tone = encodeDmx({ rate: 11025, samples: Float32Array.from({ length: 2756 }, (_, i) => Math.sin(i / 4) * 0.5) });
    const changes: Change[] = [
      { kind: "screen", name: "TITLEPIC", data: title },
      { kind: "sound", name: "DSPISTOL", data: tone },
      // Not something this game has, and not a sound at all: both are left out.
      { kind: "sprite", name: "NOSUCHA0", data: title },
      { kind: "sound", name: "DSSHOTGN", data: new Uint8Array(40) },
    ];
    const changed = applyMod(game, changes);
    const now = readWad(changed);
    expect(now.lumps.length).toBe(wad.lumps.length);
    expect(now.lumps.filter((lump, i) => lump.data.length !== wad.lumps[i]!.data.length || lump.data.some((byte, at) => byte !== wad.lumps[i]!.data[at])).map((lump) => lump.name).sort()).toEqual(["DSPISTOL", "TITLEPIC"]);
    expect(applyMod(game, [])).toBe(game);

    let clock = 0;
    let picture = new Uint8ClampedArray(0);
    const sounds: Uint8Array[] = [];
    const run = (engine: { frame(): boolean }, tics: number) => {
      for (let i = 0; i < tics; i++) {
        clock += 1000 / 35;
        engine.frame();
      }
    };
    const host = { now: () => clock, frame: (pixels: Uint8ClampedArray) => (picture = pixels.slice()), sound: { start: (_c: number, _l: number, bytes: () => Uint8Array) => void sounds.push(bytes()), update() {}, stop() {}, playing: () => false } };
    const titled = await startEngine(module, new Map([["freedoom1.wad", changed]]), "freedoom1.wad", host);
    run(titled, 80);
    expect(titled.stopped).toBeNull();
    // The palette's nearest colour to pure green, everywhere.
    const colours = new Set(new Uint32Array(picture.buffer, 0, picture.length / 4));
    expect(colours.size).toBe(1);
    const [r, g, b] = picture;
    expect(g!).toBeGreaterThan(r! + 100);
    expect(g!).toBeGreaterThan(b! + 100);

    const level = await startEngine(module, new Map([["freedoom1.wad", changed]]), "freedoom1.wad", host, ["-warp", "1", "1"]);
    run(level, 40);
    sounds.length = 0;
    level.key(true, KEY.fire);
    run(level, 4);
    level.key(false, KEY.fire);
    run(level, 10);
    expect(sounds.some((sound) => sound.length === tone.length && sound.every((byte, i) => byte === tone[i]))).toBe(true);
  });

  test("changes kept as a WAD of their own come back as the same changes", () => {
    const changes: Change[] = [
      { kind: "screen", name: "TITLEPIC", data: lump("screen", "TITLEPIC").slice() },
      { kind: "sound", name: "DSPISTOL", data: lump("sound", "DSPISTOL").slice() },
      { kind: "sprite", name: "TROOA1", data: lump("sprite", "TROOA1").slice() },
      { kind: "floor", name: assets.find((asset) => asset.kind === "floor")!.name, data: new Uint8Array(4096).fill(3) },
      { kind: "wall", name: assets.find((asset) => asset.kind === "wall")!.name, data: encodePatch(frame()) },
    ];
    const kept = modToWad(changes);
    expect(readWad(kept).kind).toBe("PWAD");
    expect(kept.length).toBeLessThan(200000);
    const back = modFromWad(kept, assets);
    expect(back.skipped).toEqual([]);
    const byKey = (list: Change[]) => new Map(list.map((change) => [key(change.kind, change.name), [...change.data]]));
    expect(byKey(back.changes)).toEqual(byKey(changes));
    // Someone else's WAD: what this game has no place for is named, not taken.
    const other = writeWad({ kind: "PWAD", lumps: [{ name: "TITLEPIC", data: new Uint8Array(50) }, { name: "MAP01", data: new Uint8Array(0) }, { name: "THINGS", data: new Uint8Array(10) }, { name: "DSPISTOL", data: lump("sound", "DSPISTOL") }] });
    const partly = modFromWad(other, assets);
    expect(partly.changes.map((change) => change.name)).toEqual(["DSPISTOL"]);
    expect(partly.skipped.sort()).toEqual(["MAP01", "TITLEPIC"]);
  });

  test("a level is its walls, to draw, and its things, each of them something the engine knows", () => {
    const level = readLevel(wad, "E1M1");
    expect(level.lines.length).toBeGreaterThan(300);
    expect(level.lines.some((line) => line.solid) && level.lines.some((line) => !line.solid) && level.lines.some((line) => line.special)).toBe(true);
    expect(level.bounds.right - level.bounds.left).toBeGreaterThan(1000);
    // One start for each of four players, and everything inside the level's corners.
    expect([1, 2, 3, 4].map((player) => level.things.filter((thing) => thing.type === player).length)).toEqual([1, 1, 1, 1]);
    expect(level.things.every((thing) => thing.x >= level.bounds.left && thing.x <= level.bounds.right && thing.y >= level.bounds.bottom && thing.y <= level.bounds.top)).toBe(true);
    // Across the whole game, nothing is placed that the table of things can't name.
    const unknown = new Set(levelNames(wad).flatMap((name) => readLevel(wad, name).things.map((thing) => thing.type)).filter((type) => !thingKind(type).sprite));
    expect([...unknown]).toEqual([]);
    expect(encodeThings(level.things)).toEqual(levelLumps(wad, "E1M1")!.get("THINGS")!.lump.data.slice());
    expect(thingKind(3004).name).toBe("Zombie with a pistol");
    expect(thingKind(1).group).toBe("start");
    expect(thingKind(2001)).toMatchObject({ name: "Shotgun to pick up", group: "pickup" });
    expect(thingKind(18).name).toBe("Zombie with a pistol, dead");
    expect(new Set(THING_KINDS.map((kind) => kind.number)).size).toBe(THING_KINDS.length);
  });

  test("a level with its things changed is the level the engine plays", async () => {
    const level = readLevel(wad, "E1M1");
    const start = level.things.find((thing) => thing.type === 1)!;
    const second = level.things.find((thing) => thing.type === 2)!;
    // No monsters, a shotgun at the player's feet, and the player started where the second player would have, turned round.
    const things = [
      ...level.things.filter((thing) => thingKind(thing.type).group !== "monster" && thing.type !== 1),
      { ...start, x: second.x, y: second.y, angle: (start.angle + 180) % 360 },
      { x: second.x, y: second.y, angle: 0, type: 2001, flags: FLAG_EASY | FLAG_MEDIUM | FLAG_HARD },
    ];
    const change: Change = { kind: "things", name: "E1M1", data: encodeThings(things) };
    const changed = applyMod(game, [change]);
    expect(decodeThings(levelLumps(readWad(changed), "E1M1")!.get("THINGS")!.lump.data)).toEqual(things);

    const play = async (data: Uint8Array) => {
      let clock = 0;
      let picture = new Uint8ClampedArray(0);
      const lumps: number[] = [];
      const engine = await startEngine(module, new Map([["freedoom1.wad", data]]), "freedoom1.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), sound: { start: (_c, lump) => void lumps.push(lump), update() {}, stop() {}, playing: () => false } }, ["-warp", "1", "1"]);
      const run = (tics: number) => {
        for (let i = 0; i < tics; i++) {
          clock += 1000 / 35;
          engine.frame();
        }
      };
      run(60);
      const stood = picture;
      // A step: things are picked up by walking into them, not by standing on them.
      engine.analog(50, 0, 0);
      run(6);
      return { engine, picture: stood, lumps };
    };
    const [before, after] = [await play(game), await play(changed)];
    expect(after.engine.stopped).toBeNull();
    // Somewhere else, looking another way.
    let same = 0;
    for (let i = 0; i < 320 * 160 * 4; i++) same += before.picture[i] === after.picture[i] ? 1 : 0;
    expect(same / (320 * 160 * 4)).toBeLessThan(0.6);
    // The shotgun was picked up where the player stood: the sound of taking a weapon, which the game as it came doesn't make at its start.
    const taking = wad.lumps.findIndex((one) => one.name === "DSWPNUP");
    expect(after.lumps).toContain(taking);
    expect(before.lumps).not.toContain(taking);
  });

  test("a changed level is saved whole, for other engines, and comes back as what was placed in it", () => {
    const things = readLevel(wad, "E1M3").things.slice(0, 20);
    const change: Change = { kind: "things", name: "E1M3", data: encodeThings(things) };
    const kept = readWad(modToWad([change], wad));
    expect(kept.lumps.map((one) => one.name)).toEqual(["E1M3", "THINGS", "LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS", "NODES", "SECTORS", "REJECT", "BLOCKMAP"]);
    const back = modFromWad(modToWad([change], wad), assets, wad);
    expect(back.skipped).toEqual([]);
    expect(back.changes).toHaveLength(1);
    expect(decodeThings(back.changes[0]!.data)).toEqual(things);
    // Without the game to copy the walls from, there is no whole level to save.
    expect(readWad(modToWad([change])).lumps).toEqual([]);
    // Someone else's level under the same name, with walls of its own but not built: nothing the engine could play.
    const theirs = kept.lumps.map((one) => (one.name === "VERTEXES" ? { name: one.name, data: one.data.slice(0, 400) } : one.name === "NODES" ? { name: one.name, data: new Uint8Array(0) } : one));
    expect(modFromWad(writeWad({ kind: "PWAD", lumps: theirs }), assets, wad)).toEqual({ changes: [], skipped: ["E1M3"] });
  });
});
