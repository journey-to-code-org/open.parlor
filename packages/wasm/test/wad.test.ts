// The editor's reading and writing of the game's data, checked two ways: on small pictures and
// sounds made here, and on the real game, where a changed lump has to show on the engine's screen
// and come out of its speaker.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { startEngine } from "../src/shooter/engine.ts";
import { KEY } from "../src/shooter/keys.ts";
import { catalogue, isDrawn, isLevelKind, isNewName, isNewNameFor, key } from "../wad/catalogue.ts";
import { decodeThings, encodeThings, FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, levelLumps, levelNames, readLevel, THING_KINDS, thingKind } from "../wad/level.ts";
import { applyMod, type Change, fits, modFromWad, modToWad } from "../wad/mod.ts";
import { decodeFlat, decodePatch, encodeFlat, encodePatch, fromRgba, paletteOf, type Picture, toRgba } from "../wad/picture.ts";
import { decodeDmx, encodeDmx, mixDown, resample } from "../wad/sound.ts";
import { ACTIONS, copyThing, momentOf, momentsFrom, named, OWN_STATES, OWN_THINGS, readRules, removeThing, RULE_THINGS, RULES, thingKey, thingsOf, writeRules } from "../wad/rules.ts";
import { wallPictures } from "../wad/texture.ts";
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

const file = join(import.meta.dirname, "../games/shooter/delbies/delbies.wad");

describe("the game", () => {
  const game = new Uint8Array(readFileSync(file));
  const wad = readWad(game);
  const assets = catalogue(wad);
  const palette = paletteOf(wad.lumps.find((lump) => lump.name === "PLAYPAL")!.data);
  const find = (kind: string, name: string) => assets.find((asset) => asset.kind === kind && asset.name === name)!;
  const lump = (kind: string, name: string) => wad.lumps[find(kind, name).index]!.data;
  const module = new WebAssembly.Module(readFileSync(join(import.meta.dirname, "../games/shooter/shooter.wasm")));

  test("is sorted into sprites, walls, floors, other pictures and sounds, every one of them readable", () => {
    const count = (kind: string) => assets.filter((asset) => asset.kind === kind).length;
    expect(count("sprite")).toBeGreaterThan(250);
    expect(count("wall")).toBeGreaterThan(20);
    expect(count("floor")).toBeGreaterThan(15);
    expect(count("screen")).toBeGreaterThan(200);
    expect(count("sound")).toBeGreaterThan(30);
    // (A level's walls are several lumps, found from its marker: test/shape.test.ts.)
    expect(assets.filter((asset) => asset.kind !== "walls" && !fits(asset.kind, wad.lumps[asset.index]!.data)).map((asset) => asset.name)).toEqual([]);
    expect(new Set(assets.map((asset) => key(asset.kind, asset.name))).size).toBe(assets.length);
    // Nothing of a level, and none of the game's own tables, is offered as a picture.
    expect(assets.filter((asset) => isDrawn(asset.kind) && /^(THINGS|PLAYPAL|COLORMAP|E1M1|TEXTURE1|D_E1M1|DEMO1)$/.test(asset.name))).toEqual([]);
    // The tables are there all the same, as lumps of no other kind; a level's own lumps are the level's.
    expect(["PLAYPAL", "COLORMAP", "PNAMES", "TEXTURE1"].filter((name) => !find("other", name))).toEqual([]);
    expect(assets.filter((asset) => asset.kind === "other" && /^(THINGS|SECTORS|E1M1|F_START|S_END)$/.test(asset.name))).toEqual([]);
    expect(find("other", "TEXTURE1").note).toMatch(/which wall picture/);
    // Every lump of the game with anything in it is something that can be changed, one way or another.
    const reached = new Set(assets.map((asset) => asset.name));
    expect(wad.lumps.filter((lump) => lump.data.length && !reached.has(lump.name) && !/^(THINGS|LINEDEFS|SIDEDEFS|VERTEXES|SEGS|SSECTORS|NODES|SECTORS|REJECT|BLOCKMAP)$/.test(lump.name)).map((lump) => lump.name)).toEqual([]);
    // Each level is there once for what is placed in it, and once for what it is built of.
    expect(assets.filter((asset) => asset.kind === "things").map((asset) => asset.name)).toEqual(levelNames(wad));
    expect(assets.filter((asset) => asset.kind === "walls").map((asset) => asset.name)).toEqual(levelNames(wad));
    expect(levelNames(wad)).toHaveLength(12);
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
    const titled = await startEngine(module, new Map([["delbies.wad", changed]]), "delbies.wad", host);
    run(titled, 80);
    expect(titled.stopped).toBeNull();
    // The palette's nearest colour to pure green, everywhere.
    const colours = new Set(new Uint32Array(picture.buffer, 0, picture.length / 4));
    expect(colours.size).toBe(1);
    const [r, g, b] = picture;
    expect(g!).toBeGreaterThan(r! + 100);
    expect(g!).toBeGreaterThan(b! + 100);

    const level = await startEngine(module, new Map([["delbies.wad", changed]]), "delbies.wad", host, ["-warp", "1", "1"]);
    run(level, 40);
    sounds.length = 0;
    level.key(true, KEY.fire);
    run(level, 4);
    level.key(false, KEY.fire);
    run(level, 10);
    expect(sounds.some((sound) => sound.length === tone.length && sound.every((byte, i) => byte === tone[i]))).toBe(true);
  });

  test("a floor, a wall and a lump the game never had are added, and the engine draws a level in them", async () => {
    // The palette's nearest to pure green, for both: easy to tell on the screen.
    const green = fromRgba(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1, palette).pixels[0]!;
    const wall: Picture = { width: 64, height: 128, left: 0, top: 0, pixels: new Uint8Array(64 * 128).fill(green), solid: new Uint8Array(64 * 128).fill(1) };
    const added: Change[] = [
      { kind: "floor", name: "MYFLOOR", data: new Uint8Array(4096).fill(green) },
      { kind: "wall", name: "MYWALL", data: encodePatch(wall) },
      { kind: "other", name: "MYNOTES", data: new TextEncoder().encode("anything at all") },
      { kind: "sprite", name: "ZZZZA0", data: encodePatch(frame()) },
      { kind: "sound", name: "DSMINE", data: lump("sound", "DSPISTOL").slice() },
      // Not these: a sprite and a sound whose names aren't a sprite's or a sound's, a name a WAD can't hold, a lump under a name the game uses, and names with a meaning.
      { kind: "sprite", name: "ZZZZ", data: encodePatch(frame()) },
      { kind: "sound", name: "MINE", data: lump("sound", "DSPISTOL").slice() },
      { kind: "floor", name: "far too long", data: new Uint8Array(4096) },
      { kind: "other", name: "TITLEPIC", data: new Uint8Array(50) },
      { kind: "other", name: "THINGS", data: new Uint8Array(10) },
      { kind: "floor", name: "F_END", data: new Uint8Array(4096) },
    ];
    expect([isNewName("MYFLOOR"), isNewName("far too long"), isNewName("E1M1"), isNewName("PP_START"), isNewName("")]).toEqual([true, false, false, false, false]);
    const made = readWad(applyMod(game, added));
    expect(made.lumps.length).toBe(wad.lumps.length + 5);
    expect([isNewNameFor("sprite", "RATXA0"), isNewNameFor("sprite", "RATXA2A8"), isNewNameFor("sprite", "RATX"), isNewNameFor("sprite", "RATXA9"), isNewNameFor("sound", "DSRAT"), isNewNameFor("sound", "RAT")]).toEqual([true, true, false, false, true, false]);
    const now = catalogue(made);
    expect(["floor/MYFLOOR", "wall/MYWALL", "other/MYNOTES", "sprite/ZZZZA0", "sound/DSMINE"].filter((one) => !now.some((asset) => key(asset.kind, asset.name) === one))).toEqual([]);
    // The floor is among the floors and the piece among the pieces, where the engine looks for them.
    const at = (name: string) => made.lumps.map((one) => one.name).lastIndexOf(name);
    expect(at("MYFLOOR")).toBe(at("F_END") - 1);
    expect(at("MYWALL")).toBe(at("P_END") - 1);
    expect(at("ZZZZA0")).toBe(at("S_END") - 1);
    // A wall picture of the piece's name was made for it; every other wall picture is as it was.
    const [before, after] = [wallPictures(wad), wallPictures(made)];
    expect(after.get("MYWALL")).toEqual({ name: "MYWALL", width: 64, height: 128, patches: [{ x: 0, y: 0, patch: "MYWALL" }] });
    expect(after.size).toBe(before.size + 1);
    for (const [name, picture] of before) expect(after.get(name)).toEqual(picture);
    // Added twice, it is there once.
    expect(readWad(applyMod(game, [...added, ...added])).lumps.length).toBe(made.lumps.length);

    // The first level with every floor and every wall in them.
    const everywhere = (bytes: Uint8Array) => {
      const from = readWad(bytes);
      const level = levelLumps(from, "E1M1")!;
      const name = (text: string) => Uint8Array.from({ length: 8 }, (_, i) => text.charCodeAt(i) || 0);
      const rooms = level.get("SECTORS")!.lump.data.slice();
      for (let i = 0; i + 26 <= rooms.length; i += 26) rooms.set(name("MYFLOOR"), i + 4);
      const sides = level.get("SIDEDEFS")!.lump.data.slice();
      for (let i = 0; i + 30 <= sides.length; i += 30) for (const part of [4, 12, 20]) if (sides[i + part] !== 45) sides.set(name("MYWALL"), i + part);
      return writeWad({ kind: from.kind, lumps: from.lumps.map((one, index) => (index === level.get("SECTORS")!.index ? { name: one.name, data: rooms } : index === level.get("SIDEDEFS")!.index ? { name: one.name, data: sides } : one)) });
    };
    const play = async (bytes: Uint8Array) => {
      let clock = 0;
      let picture = new Uint8ClampedArray(0);
      const engine = await startEngine(module, new Map([["delbies.wad", bytes]]), "delbies.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()) }, ["-warp", "1", "1", "-nomonsters"]);
      for (let i = 0; i < 50; i++) {
        clock += 1000 / 35;
        engine.frame();
      }
      // How much of the view (above the status bar) is green.
      let count = 0;
      for (let i = 0; i < 320 * 168 * 4; i += 4) if (picture[i + 1]! > picture[i]! + 40 && picture[i + 1]! > picture[i + 2]! + 40) count++;
      return { stopped: engine.stopped, green: count / (320 * 168) };
    };
    const [plain, ours] = [await play(game), await play(everywhere(applyMod(game, added)))];
    expect(ours.stopped).toBeNull();
    expect(plain.green).toBeLessThan(0.2);
    expect(ours.green).toBeGreaterThan(0.6);
    // Without them added, the engine stops at the names it doesn't know: that is what adding is for.
    expect((await play(everywhere(game))).stopped).not.toBeNull();

    // Saved as a file, they come back as the same additions, the wall's place in the two lists with them; and a game given the file has the wall picture.
    const kept = modToWad(added.slice(0, 3), wad);
    const back = modFromWad(kept, assets, wad);
    expect(back.changes.map((change) => key(change.kind, change.name)).sort()).toEqual(["floor/MYFLOOR", "other/MYNOTES", "other/PNAMES", "other/TEXTURE1", "wall/MYWALL"]);
    expect(back.skipped).toEqual([]);
    const again = readWad(applyMod(game, back.changes));
    expect(wallPictures(again).get("MYWALL")).toEqual(after.get("MYWALL"));
    expect(wallPictures(again).size).toBe(after.size);
    expect((await play(everywhere(writeWad(again)))).green).toBeGreaterThan(0.6);
  }, 60000);

  test("the rules change what a thing is, bring sprites and sounds under names of their own, and the song is handed to the page", async () => {
    const zombie = RULE_THINGS.find((thing) => thing.id === "MT_POSSESSED")!;
    expect([RULE_THINGS.length, zombie.index, zombie.number, zombie.health, zombie.seesound, zombie.sprite]).toEqual([137, 1, 3004, 20, "DSPOSIT1", "POSS"]);
    const rules = new Map([[thingKey(zombie, "seesound"), "DSMINE"], [thingKey(zombie, "sprite"), "RATX"], [thingKey(zombie, "health"), "5"], [thingKey(zombie, "missilestate"), "0"], ["rule.initial_bullets", "2"], ["ammo.0.max", "400"]]);
    // Written and read back the same, in an order that doesn't depend on the order they were set.
    expect(readRules(writeRules(rules))).toEqual(rules);
    expect([...writeRules(new Map([...rules].reverse()))]).toEqual([...writeRules(rules)]);
    expect(named(rules)).toEqual({ sprites: ["RATX"], sounds: ["DSMINE"] });

    const green = fromRgba(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1, palette).pixels[0]!;
    const body: Picture = { width: 60, height: 70, left: 30, top: 68, pixels: new Uint8Array(60 * 70).fill(green), solid: new Uint8Array(60 * 70).fill(1) };
    const tone = encodeDmx({ rate: 11025, samples: Float32Array.from({ length: 1777 }, (_, i) => Math.sin(i / 3)) });
    const tune = new TextEncoder().encode("not a song any browser knows, but it is what was put in the song's place");
    // A zombie stood in front of where the first level starts, looking at it; everything else that is alive taken out.
    const facing = (bytes: Uint8Array) => {
      const from = readWad(bytes);
      const things = levelLumps(from, "E1M1")!.get("THINGS")!;
      const placed = decodeThings(things.lump.data);
      const me = placed.find((thing) => thing.type === 1)!;
      const turn = (me.angle * Math.PI) / 180;
      const kept = placed.filter((thing) => thing.type <= 4 || thingKind(thing.type)?.group !== "monster");
      kept.push({ type: 3004, x: Math.round(me.x + Math.cos(turn) * 80), y: Math.round(me.y + Math.sin(turn) * 80), angle: (me.angle + 180) % 360, flags: FLAG_EASY | FLAG_MEDIUM | FLAG_HARD });
      return writeWad({ kind: from.kind, lumps: from.lumps.map((one, index) => (index === things.index ? { name: one.name, data: encodeThings(kept) } : one)) });
    };
    const play = async (changes: Change[], fire = 0) => {
      let clock = 0;
      let picture = new Uint8ClampedArray(0);
      const heard: Uint8Array[] = [];
      const songs: { data: Uint8Array; looping: boolean }[] = [];
      const sound = { start: (_c: number, _l: number, bytes: () => Uint8Array) => void heard.push(bytes()), update() {}, stop() {}, playing: () => false, music: { play: (data: Uint8Array, looping: boolean) => void songs.push({ data, looping }), stop() {}, volume() {}, pause() {} } };
      const engine = await startEngine(module, new Map([["delbies.wad", facing(applyMod(game, changes))]]), "delbies.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), sound }, ["-warp", "1", "1"]);
      const run = (tics: number) => {
        for (let i = 0; i < tics; i++) {
          clock += 1000 / 35;
          engine.frame();
        }
      };
      // Past the melt the level starts with.
      run(45);
      let count = 0;
      for (let i = 0; i < 320 * 168 * 4; i += 4) if (picture[i + 1]! > picture[i]! + 40 && picture[i + 1]! > picture[i + 2]! + 40) count++;
      if (fire) engine.key(true, KEY.fire);
      run(fire || 60);
      engine.key(false, KEY.fire);
      const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);
      return { stopped: engine.stopped, green: count / (320 * 168), tones: heard.filter((one) => same(one, tone)).length, shots: heard.filter((one) => same(one, lump("sound", "DSPISTOL"))).length, songs: songs.filter((song) => same(song.data, tune) && song.looping).length };
    };
    // A picture for each moment of standing and walking, so it is there to be seen whichever it is in.
    const sprite: Change = { kind: "sprite", name: "RATXA0", data: encodePatch(body) };
    const sprites: Change[] = [sprite, ...[..."BCD"].map((frame) => ({ kind: "sprite" as const, name: `RATX${frame}0`, data: encodePatch(body) }))];
    const voice: Change = { kind: "sound", name: "DSMINE", data: tone };
    const ruled: Change = { kind: "rules", name: RULES, data: writeRules(rules) };
    const song: Change = { kind: "other", name: "D_E1M1", data: tune };

    // As the game came: a zombie, its own colours, its own voice; the pistol fires as long as it is held; no song of ours.
    const plain = await play([], 120);
    expect(plain).toMatchObject({ stopped: null, tones: 0, songs: 0 });
    expect(plain.green).toBeLessThan(0.01);
    expect(plain.shots).toBeGreaterThan(3);
    // With the rules: it is drawn with the new sprite and heard with the new sound; two bullets is two shots; and the song put in the level's place is handed over to be played round and round.
    const ours = await play([...sprites, voice, ruled, song], 120);
    expect(ours).toMatchObject({ stopped: null, shots: 2, songs: 1 });
    expect(ours.green).toBeGreaterThan(0.02);
    expect(ours.tones).toBeGreaterThan(0);
    // The rules alone, naming a sprite and a sound the WAD hasn't got: it isn't drawn or heard, and the game goes on.
    const bare = await play([ruled]);
    expect(bare).toMatchObject({ stopped: null, tones: 0 });
    expect(bare.green).toBeLessThan(0.01);
    // The sprite and the sound without the rules are in the WAD and change nothing.
    expect(await play([sprite, voice])).toMatchObject({ stopped: null, tones: 0 });
    // A game with no rules lump is given one; they come back from a file as the same rules.
    const back = modFromWad(modToWad([sprite, voice, ruled, song], wad), assets, wad);
    expect(back.changes.map((change) => key(change.kind, change.name)).sort()).toEqual(["other/D_E1M1", "rules/RULES", "sound/DSMINE", "sprite/RATXA0"]);
    expect(readRules(back.changes.find((change) => change.kind === "rules")!.data)).toEqual(rules);
  }, 60000);

  test("a new kind of thing is made from another, with moments of its own, and does what its moments say", async () => {
    const zombie = RULE_THINGS.find((thing) => thing.id === "MT_POSSESSED")!;
    // The engine's moments, as the editor has them: a zombie stands looking about, two moments round and round.
    expect([OWN_STATES, OWN_THINGS, ACTIONS.length]).toEqual([967, 137, 74]);
    const standing = momentsFrom(new Map(), zombie.spawnstate);
    expect(standing.map((moment) => [moment.sprite, moment.frame, moment.tics, moment.action])).toEqual([["POSS", 0, 10, "A_Look"], ["POSS", 1, 10, "A_Look"]]);
    expect(standing[1]!.next).toBe(zombie.spawnstate);

    // A new kind, like the zombie: a place of its own, a number for levels, and every moment it can reach copied to spare places.
    const made = copyThing(new Map(), zombie)!;
    const mine = thingsOf(made.rules).find((thing) => thing.index === made.index)!;
    expect([made.index, mine.number, mine.health, mine.seesound]).toEqual([137, 5000, zombie.health, zombie.seesound]);
    expect(mine.spawnstate).toBeGreaterThanOrEqual(OWN_STATES);
    const copied = momentsFrom(made.rules, mine.spawnstate);
    expect(copied.map((moment) => [moment.sprite, moment.frame, moment.tics, moment.action])).toEqual(standing.map((moment) => [moment.sprite, moment.frame, moment.tics, moment.action]));
    // Its moments go round among themselves, not back to the zombie's.
    expect(copied.every((moment) => moment.number >= OWN_STATES && moment.next >= OWN_STATES)).toBe(true);
    expect(momentsFrom(made.rules, mine.deathstate).at(-1)!.tics).toBe(-1);
    // The zombie is as it was; and a second copy takes the next place and the next number.
    expect(thingsOf(made.rules).find((thing) => thing.index === zombie.index)).toEqual(zombie);
    const second = copyThing(made.rules, mine)!;
    expect([second.index, thingsOf(second.rules).find((thing) => thing.index === second.index)!.number]).toEqual([138, 5001]);
    // Taken out again, nothing of it is left.
    expect(removeThing(made.rules, made.index).size).toBe(0);
    expect([...removeThing(second.rules, second.index)].sort()).toEqual([...made.rules].sort());

    // What it does: standing about, it screams (its dying sound, which is ours) where a zombie looks for a player; and it is drawn with a sprite of its own.
    const rules = new Map(made.rules);
    for (const moment of copied) rules.set(`state.${moment.number}.action`, "A_Scream");
    rules.set(`state.${copied[0]!.number}.tics`, "4");
    rules.set(thingKey(mine, "deathsound"), "DSMINE");
    rules.set(thingKey(mine, "sprite"), "RATX");
    expect(momentOf(rules, copied[0]!.number)).toMatchObject({ action: "A_Scream", tics: 4 });
    expect(readRules(writeRules(rules))).toEqual(rules);

    const green = fromRgba(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1, palette).pixels[0]!;
    const body: Picture = { width: 60, height: 70, left: 30, top: 68, pixels: new Uint8Array(60 * 70).fill(green), solid: new Uint8Array(60 * 70).fill(1) };
    const tone = encodeDmx({ rate: 11025, samples: Float32Array.from({ length: 1777 }, (_, i) => Math.sin(i / 3)) });
    const changes: Change[] = [
      { kind: "sprite", name: "RATXA0", data: encodePatch(body) },
      { kind: "sprite", name: "RATXB0", data: encodePatch(body) },
      { kind: "sound", name: "DSMINE", data: tone },
      { kind: "rules", name: RULES, data: writeRules(rules) },
    ];
    /** The first level with one thing of a number stood in front of the player, facing away, and nothing else alive. */
    const play = async (type: number, with_: Change[]) => {
      const from = readWad(applyMod(game, with_));
      const things = levelLumps(from, "E1M1")!.get("THINGS")!;
      const placed = decodeThings(things.lump.data);
      const me = placed.find((thing) => thing.type === 1)!;
      const turn = (me.angle * Math.PI) / 180;
      const kept = placed.filter((thing) => thing.type <= 4 || thingKind(thing.type)?.group !== "monster");
      kept.push({ type, x: Math.round(me.x + Math.cos(turn) * 80), y: Math.round(me.y + Math.sin(turn) * 80), angle: me.angle, flags: FLAG_EASY | FLAG_MEDIUM | FLAG_HARD | 8 });
      const level = writeWad({ kind: from.kind, lumps: from.lumps.map((one, index) => (index === things.index ? { name: one.name, data: encodeThings(kept) } : one)) });
      let clock = 0;
      let picture = new Uint8ClampedArray(0);
      const heard: Uint8Array[] = [];
      const sound = { start: (_c: number, _l: number, bytes: () => Uint8Array) => void heard.push(bytes()), update() {}, stop() {}, playing: () => false };
      const engine = await startEngine(module, new Map([["delbies.wad", level]]), "delbies.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), sound }, ["-warp", "1", "1"]);
      for (let i = 0; i < 90; i++) {
        clock += 1000 / 35;
        engine.frame();
      }
      let count = 0;
      for (let i = 0; i < 320 * 168 * 4; i += 4) if (picture[i + 1]! > picture[i]! + 40 && picture[i + 1]! > picture[i + 2]! + 40) count++;
      return { stopped: engine.stopped, green: count / (320 * 168), tones: heard.filter((one) => one.length === tone.length && one.every((byte, i) => byte === tone[i])).length };
    };
    // The new kind, placed by its number: there, in its own sprite, screaming every few moments.
    const ours = await play(5000, changes);
    expect(ours.stopped).toBeNull();
    expect(ours.green).toBeGreaterThan(0.02);
    expect(ours.tones).toBeGreaterThan(3);
    // A zombie in the same game is still a zombie: its own colours, and quiet with its back turned.
    const theirs = await play(3004, changes);
    expect(theirs).toMatchObject({ stopped: null, tones: 0 });
    expect(theirs.green).toBeLessThan(0.01);
    // A level that places the new kind, played without the rules that made it: the thing is left out, and the game goes on.
    expect(await play(5000, [])).toMatchObject({ stopped: null, tones: 0 });
  }, 60000);

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
    // A picture under a name the game has nothing by is carried along as a lump; a sound and a sprite are a new sound and a new sprite.
    const strays = writeWad({ kind: "PWAD", lumps: [{ name: "MYPIC", data: encodePatch(frame()) }, { name: "DSMINE", data: lump("sound", "DSPISTOL").slice() }, { name: "SS_START", data: new Uint8Array(0) }, { name: "ZZZZA0", data: encodePatch(frame()) }, { name: "SS_END", data: new Uint8Array(0) }] });
    const carried = modFromWad(strays, assets);
    expect(carried.changes.map((change) => key(change.kind, change.name))).toEqual(["other/MYPIC", "sound/DSMINE", "sprite/ZZZZA0"]);
    expect(carried.skipped).toEqual([]);
    expect(partly.skipped.sort()).toEqual(["MAP01", "TITLEPIC"]);
  });

  test("a level is its walls, to draw, and its things, each of them something the engine knows", () => {
    const level = readLevel(wad, "E1M1");
    expect(level.lines.length).toBeGreaterThan(100);
    expect(level.lines.some((line) => line.solid) && level.lines.some((line) => !line.solid) && level.lines.some((line) => line.special)).toBe(true);
    expect(level.bounds.right - level.bounds.left).toBeGreaterThan(800);
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
      const engine = await startEngine(module, new Map([["delbies.wad", data]]), "delbies.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), sound: { start: (_c, lump) => void lumps.push(lump), update() {}, stop() {}, playing: () => false } }, ["-warp", "1", "1"]);
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
    const theirs = kept.lumps.map((one) => (one.name === "VERTEXES" ? { name: one.name, data: one.data.slice(0, 40) } : one.name === "NODES" ? { name: one.name, data: new Uint8Array(0) } : one));
    expect(modFromWad(writeWad({ kind: "PWAD", lumps: theirs }), assets, wad)).toEqual({ changes: [], skipped: ["E1M3"] });
  });
});
