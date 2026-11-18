// Delbie's Daycare & Geriatrics: a level written as a floor plan becomes a shape; the game's own
// WAD is what its plans and art now make; and, laid over the real game, it is what the engine
// plays. The last part is skipped when the game's data isn't here (npm run build fetches it).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildGame, faults, levels, picturesUsed } from "../games/shooter/delbies/game.ts";
import { generate } from "../games/shooter/delbies/generated.ts";
// @ts-expect-error a plain script, with no typings
import { art } from "../scripts/build-delbies.mjs";
import { screenOf, startEngine, STATE_ENDING } from "../src/shooter/engine.ts";
import { KEY } from "../src/shooter/keys.ts";
import { catalogue } from "../wad/catalogue.ts";
import { decodeThings, encodeThings, levelLumps, readLevel, wallNames, WALL_LOWER_UNPEGGED } from "../wad/level.ts";
import { wallPictures } from "../wad/texture.ts";
import { decodePatch } from "../wad/picture.ts";
import { decodeDmx, songNamed } from "../wad/sound.ts";
import { SONG_NAMES, SONGS } from "../games/shooter/delbies/songs.ts";
import { fromPlan, type Look, wallNear } from "../wad/plan.ts";
import { roomAt, trouble, wallsOf } from "../wad/shape.ts";
import { linesFor, MOMENTS, plain, readWords, setLines, TEXTS, writeWords } from "../wad/words.ts";
import { readWad, writeWad } from "../wad/wad.ts";

const here = (path: string) => join(import.meta.dirname, path);
const nodes = new WebAssembly.Module(readFileSync(here("../games/shooter/nodes/nodes.wasm")));
const look = (more: Partial<Look> = {}): Look => ({ floor: 0, ceiling: 128, floorFlat: "FLOOR0_1", ceilingFlat: "CEIL3_5", light: 160, wall: "GRAY1", ...more });

/** The twelve levels, by the names the engine knows them by. */
const FLOORS = [...Array.from({ length: 9 }, (_, i) => `E1M${i + 1}`), "E2M1", "E2M2", "E2M3"];

describe("a floor plan", () => {
  // Two rooms with a wall of 16 between them, a door through it, and a pillar in the first.
  const plan = {
    rooms: { west: look(), east: look({ floor: 24, wall: "BROWN1", trim: "STEP4" }), door: look({ door: "DOOR3" }) },
    spaces: [["west", 0, 0, 256, 256], ["door", 256, 96, 272, 160], ["east", 272, 0, 512, 256]] as [string, number, number, number, number][],
    blocks: [[96, 96, 160, 160]] as [number, number, number, number][],
  };

  test("becomes rooms, walls where a room meets nothing, and openings where two meet", () => {
    const { shape, rooms } = fromPlan(plan);
    expect(rooms).toEqual({ west: 0, east: 1, door: 2 });
    expect(trouble(shape, shape.walls.map((_, i) => i))).toBeNull();
    // West: three whole walls, its east wall in two about the door, and the pillar's four. East: the same but the pillar. The door: two ends and two openings.
    expect(shape.walls).toHaveLength(5 + 4 + 5 + 4);
    expect([wallsOf(shape, 0).length, wallsOf(shape, 1).length, wallsOf(shape, 2).length]).toEqual([10, 6, 4]);
    expect([roomAt(shape, 50, 50), roomAt(shape, 128, 128), roomAt(shape, 264, 128), roomAt(shape, 264, 50), roomAt(shape, 400, 128)]).toEqual([0, -1, 2, -1, 1]);
    // The door is shut.
    expect(shape.rooms[2]).toMatchObject({ floor: 0, ceiling: 0 });
  });

  test("makes a door that is pushed from the rooms either side of it", () => {
    const { shape } = fromPlan(plan);
    const openings = shape.walls.filter((wall) => wall.special === 1);
    expect(openings.map((wall) => [shape.sides[wall.front]!.room, shape.sides[wall.back]!.room])).toEqual([[0, 2], [1, 2]]);
    // From outside it looks like a door; the walls it slides in stay still.
    expect(openings.map((wall) => shape.sides[wall.front]!.upper)).toEqual(["DOOR3", "DOOR3"]);
    const ends = wallsOf(shape, 2).map((index) => shape.walls[index]!).filter((wall) => wall.back < 0);
    expect(ends.map((wall) => [shape.sides[wall.front]!.middle, wall.flags & WALL_LOWER_UNPEGGED])).toEqual([["DOORTRAK", 16], ["DOORTRAK", 16]]);
  });

  test("shows a higher room's step from the lower one, and lays later rectangles over earlier", () => {
    const stepped = fromPlan({ rooms: { low: look(), high: look({ floor: 16, trim: "STEP4" }) }, spaces: [["low", 0, 0, 256, 128], ["high", 96, 0, 160, 128]] }).shape;
    // The low room is cut in two by the high one: an opening each side of it.
    const openings = stepped.walls.filter((wall) => wall.back >= 0);
    expect(openings).toHaveLength(2);
    for (const wall of openings) {
      const [low, high] = stepped.sides[wall.front]!.room === 0 ? [wall.front, wall.back] : [wall.back, wall.front];
      expect([stepped.sides[low]!.lower, stepped.sides[high]!.lower]).toEqual(["STEP4", "GRAY1"]);
    }
    expect(stepped.walls[wallNear(stepped, 128, 0)]).toMatchObject({ back: -1 });
    expect(() => fromPlan({ rooms: { a: look(), b: look() }, spaces: [["a", 0, 0, 64, 64], ["b", 0, 0, 64, 64]] })).toThrow(/Nothing is left of the room "a"/);
    expect(() => fromPlan({ rooms: { a: look() }, spaces: [["c", 0, 0, 64, 64]] })).toThrow(/isn't one of its rooms/);
  });
});

describe("the game's own levels", () => {
  test("have nothing wrong with them", () => {
    for (const level of levels()) expect(faults(level)).toEqual([]);
    expect(levels().map((level) => `${level.name} ${level.title}`)).toEqual([
      "E1M1 The main floor", "E1M2 The attic", "E1M3 The basement",
      // The nine made by rule (generated.ts): nine levels to an episode, so the last three are the second's.
      "E1M4 The stock room", "E1M5 Receiving", "E1M6 The overflow racks", "E1M7 The battery room", "E1M8 The tire loft", "E1M9 The paint room",
      "E2M1 The boiler room", "E2M2 The crawl space", "E2M3 The nest",
    ]);
    // The same number makes the same floor, every time.
    expect(generate(7)).toEqual(generate(7));
    // Each made-up floor has one locked door (seen from both sides), and the one key for it.
    for (const level of levels().slice(3)) {
      const locks = [26, 27, 28].map((door) => level.shape.walls.filter((wall) => wall.special === door).length);
      const keys = [5, 6, 13].map((key) => level.things.filter((thing) => thing.type === key).length);
      expect(`${level.name} ${locks.map((count) => count / 2)}`).toBe(`${level.name} ${keys}`);
      expect(keys.reduce((sum, count) => sum + count)).toBe(1);
      expect(level.things.filter((thing) => thing.type >= 1 && thing.type <= 4)).toHaveLength(4);
    }
    // Each has one way out; and each of its keys opens a door that is there.
    for (const level of levels()) expect(level.shape.walls.filter((wall) => wall.special === 11)).toHaveLength(1);
    const keyed = (level: number, door: number, key: number) => [levels()[level]!.shape.walls.filter((wall) => wall.special === door).length, levels()[level]!.things.filter((thing) => thing.type === key).length];
    expect([keyed(0, 26, 5), keyed(1, 27, 6), keyed(2, 28, 13)]).toEqual([[2, 1], [2, 1], [2, 1]]);
    // The King Rat is in the basement; his relations are on three of the later floors, and on the last one of them has the cyborg rat beside him.
    expect(levels().map((level) => level.things.filter((thing) => thing.type === 3003).length)).toEqual([0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1]);
    expect(levels()[11]!.things.filter((thing) => thing.type === 16)).toHaveLength(1);
    const [mainFloor] = levels();
    // One way out, at the top of the stairs; the bathroom wants its key, from either side.
    expect(mainFloor!.shape.walls.filter((wall) => wall.special === 11)).toHaveLength(1);
    expect(mainFloor!.shape.walls.filter((wall) => wall.special === 26)).toHaveLength(2);
    // Each step can be climbed.
    const floors = mainFloor!.shape.rooms.map((room) => room.floor);
    for (const wall of mainFloor!.shape.walls.filter((one) => one.back >= 0)) {
      const [a, b] = [mainFloor!.shape.sides[wall.front]!.room, mainFloor!.shape.sides[wall.back]!.room];
      const rise = Math.abs(floors[a]! - floors[b]!);
      // But for the counter and the shelves and boxes, which are there to be in the way.
      expect(rise <= 24 || rise >= 40).toBe(true);
    }
  });

  test("delbies.wad is what the plans and the art now make (if not: npm run delbies -w @open-parlor/wasm)", async () => {
    const built = await buildGame(nodes, art());
    expect(Buffer.from(built).equals(readFileSync(here("../games/shooter/delbies/delbies.wad")))).toBe(true);
    const names = readWad(built).lumps.map((lump) => lump.name);
    // A game of its own: its colours and its lists of walls first, as the engine reads them, then its title and its words.
    expect(readWad(built).kind).toBe("IWAD");
    expect(names.slice(0, 8)).toEqual(["PLAYPAL", "COLORMAP", "TEXTURE1", "PNAMES", "TITLEPIC", "M_DOOM", "RULES", "WORDS"]);
    const between = (start: string, end: string) => names.slice(names.indexOf(start) + 1, names.indexOf(end));
    // Delbie's face, 42 times, and the rest of the bar: 108 pictures. What is around the game: 208. A lump for each of 16 places a song plays. Everything heard: 108 sounds, one for every name the engine has. (And before them, the game's rules and its words.)
    expect(names.indexOf("S_START")).toBe(8 + 108 + 208 + 16 + 108);
    // 240 pictures of rats and 176 of tools, pickups, another player and what shots and drums do.
    expect(between("S_START", "S_END")).toHaveLength(240 + 176);
    // Every wall and sky is one picture of its own name; then the floors and ceilings.
    expect(between("P_START", "P_END")).toHaveLength(27);
    expect(between("F_START", "F_END")).toHaveLength(17);
    expect(names.slice(-11)).toEqual(["E2M3", "THINGS", "LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS", "NODES", "SECTORS", "REJECT", "BLOCKMAP"]);
    expect(names).toHaveLength(8 + 108 + 208 + 16 + 108 + 2 + 416 + 2 + 27 + 2 + 17 + 12 * 11);
  });
});

describe("the game's words", () => {
  test("are read and written a line each, in what the engine's font can show", () => {
    const words = readWords(new TextEncoder().encode("# a comment\r\nPicked up a clip.=Fuses.\n!kill=Got him!|One less.\n=nothing\nno equals\nempty=\n"));
    expect([...words]).toEqual([["Picked up a clip.", "Fuses."], ["!kill", "Got him!|One less."]]);
    expect(linesFor(words, "kill")).toEqual(["Got him!", "One less."]);
    setLines(words, "see", ["  It\u2019s a rat\u2026 ", "", "one | two", "caf\u00e9"]);
    expect(linesFor(words, "see")).toEqual(["It's a rat...", "one  two", "caf"]);
    setLines(words, "kill", [" "]);
    expect(words.has("!kill")).toBe(false);
    expect(new TextDecoder().decode(writeWords(words))).toBe("Picked up a clip.=Fuses.\n!see=It's a rat...|one  two|caf\n");
    expect(plain("\u201cquoted\u201d \u2013 dash")).toBe('"quoted" - dash');
  });

  test("replace words the engine really has, and Delbie has something to say at every moment", () => {
    const engine = readFileSync(here("../games/shooter/engine/d_englsh.h"), "utf8");
    for (const text of TEXTS) expect(engine).toContain(`"${text.from}"`);
    const ours = readWords(new Uint8Array(readFileSync(here("../games/shooter/delbies/words.txt"))));
    for (const moment of MOMENTS) expect(linesFor(ours, moment.key).length).toBeGreaterThan(0);
    // Everything of ours that replaces the engine's words replaces words it has, and is short enough for the screen.
    for (const [from, to] of ours) {
      if (!from.startsWith("!")) expect(engine).toContain(`"${from}"`);
      for (const line of to.split("|")) expect(plain(line)).toBe(line);
      // (But for the ending, which is a screen of its own.)
      if (from !== "!ending") for (const line of to.split("|")) expect(line.length).toBeLessThanOrEqual(56);
    }
  });
});

const file = here("../games/shooter/delbies/delbies.wad");

describe("the game, whole", () => {
  const game = new Uint8Array(readFileSync(file));
  const wad = readWad(game);
  const engine = new WebAssembly.Module(readFileSync(here("../games/shooter/shooter.wasm")));

  test("every picture its levels name is one the game has", () => {
    const { walls, flats } = picturesUsed();
    const [haveWalls, haveFlats] = [new Set(wallNames(wad)), new Set(catalogue(wad).filter((asset) => asset.kind === "floor").map((asset) => asset.name))];
    expect(walls.filter((name) => !haveWalls.has(name))).toEqual([]);
    expect(flats.filter((name) => !haveFlats.has(name))).toEqual([]);
  });

  test("all of it is the game's own: nothing is laid over anything, and nothing is left out", () => {
    const all = catalogue(wad);
    const of = (kind: string) => all.filter((asset) => asset.kind === kind).map((asset) => asset.name);
    const data = (name: string) => wad.lumps.find((lump) => lump.name === name)!.data;
    // The colours: fourteen palettes and thirty-four tables of each colour darker.
    expect([data("PLAYPAL").length, data("COLORMAP").length]).toEqual([14 * 768, 34 * 256]);
    // Everything heard is made here, and none of it silence.
    const voices = of("sound");
    expect(voices).toHaveLength(108);
    for (const name of ["DSSGTSIT", "DSBRSDTH", "DSPISTOL", "DSSHOTGN", "DSDOROPN", "DSSWTCHN", "DSITEMUP", "DSPLPAIN", "DSBAREXP", "DSSAWFUL", "DSRLAUNC", "DSPLASMA", "DSBFG"]) expect(voices).toContain(name);
    for (const voice of voices) {
      const heard = decodeDmx(data(voice))!;
      expect(heard.rate).toBe(11025);
      expect(heard.samples.length).toBeGreaterThan(300);
      expect(Math.max(...heard.samples.map(Math.abs))).toBeGreaterThan(0.5);
    }
    // Every wall is one picture of its own name and its own size, and the first of the list is the spare the engine can't show.
    const walls = wallPictures(wad);
    expect([...walls.keys()][0]).toBe("NOWALL");
    expect(walls.size).toBe(28);
    for (const [name, wall] of walls) {
      if (name === "NOWALL") continue;
      const picture = decodePatch(data(name))!;
      expect([name, wall.width, wall.height, wall.patches.map((piece) => piece.patch)]).toEqual([name, picture.width, picture.height, [name]]);
    }
    expect(of("floor")).toHaveLength(17);
    const size = (name: string) => {
      const picture = decodePatch(data(name))!;
      return [picture.width, picture.height];
    };
    const names = wad.lumps.map((lump) => lump.name);
    const around = (start: RegExp) => names.filter((name) => start.test(name));
    // What the engine asks for by name around the game is all here: the menus, the small letters, the page between levels.
    const wanted = ["NGAME", "OPTION", "LOADG", "SAVEG", "RDTHIS", "QUITG", "NEWG", "SKILL", "JKILL", "ROUGH", "HURT", "ULTRA", "NMARE", "OPTTTL", "ENDGAM", "MESSG", "MSGON", "MSGOFF", "DETAIL", "GDHIGH", "GDLOW", "SCRNSZ", "MSENS", "SVOL", "SFXVOL", "MUSVOL", "LGTTL", "SGTTL", "PAUSE", "SKULL1", "SKULL2", "THERML", "THERMM", "THERMR", "THERMO", "LSLEFT", "LSCNTR", "LSRGHT"].map((name) => `M_${name}`);
    expect(wanted.filter((name) => !names.includes(name))).toEqual([]);
    expect(around(/^STCFN0(3[3-9]|[4-8]\d|9[0-5])$/)).toHaveLength(63);
    expect(["WIF", "WIENTER", "WIOSTK", "WIOSTI", "WISCRT2", "WITIME", "WIPAR", "WIPCNT", "WICOLON", "WIMINUS", "WISUCKS", "WIMSTT", "WIFRGS", "WIKILRS", "WIVCTMS", "WIMSTAR", "WIOSTF", "WIOSTS", "WISPLAT", "WIURH0", "WIURH1", "WIP1", "WIBP4", "STBAR", "STARMS", "STTPRCNT", "STTMINUS", "STKEYS5", "STFB3", "STPB3", "AMMNUM9", "BRDR_TL", "INTERPIC", "VICTORY2"].filter((name) => !names.includes(name))).toEqual([]);
    // Every floor has its name for the page between levels, and the pages are whole screens.
    expect(FLOORS.map((_, index) => `WILV${Math.floor(index / 9)}${index % 9}`).filter((name) => !names.includes(name))).toEqual([]);
    for (const name of ["TITLEPIC", "HELP1", "HELP2", "CREDIT", "WIMAP0", "WIMAP1", "VICTORY2"]) expect([name, ...size(name)]).toEqual([name, 320, 200]);
    // The small letters are all one height, so a line of them sits level; and a line of a menu is no taller than the engine leaves room for.
    expect(new Set(around(/^STCFN0(3[3-9]|[4-8]\d|9[0-5])$/).map((name) => size(name)[1])).size).toBe(1);
    expect(around(/^M_(NGAME|OPTION|LOADG|SAVEG|RDTHIS|QUITG|JKILL|ROUGH|HURT|ULTRA|NMARE)$/).filter((name) => size(name)[1]! > 16)).toEqual([]);
    // The status bar: 42 faces of Delbie, each drawn from where the engine expects a face, and the bar across the screen.
    const faces = around(/^STF(ST|TL|TR|OUCH|EVL|KILL|GOD|DEAD)/);
    expect(faces).toHaveLength(42);
    for (const face of faces) expect([face, decodePatch(data(face))!.left, decodePatch(data(face))!.top]).toEqual([face, -5, -2]);
    expect(size("STBAR")).toEqual([320, 32]);
    // Everything that stands in a level has its picture: whatever a level places, the rats, the tools in hand, and what shots do.
    const sprites = new Set(of("sprite").map((name) => name.slice(0, 4)));
    expect(["PLAY", "SARG", "TROO", "BOSS", "BAL1", "BAL7", "PUNG", "PISG", "PISF", "SHTG", "SHTF", "CHGG", "CHGF", "SHOT", "MGUN", "CLIP", "AMMO", "SHEL", "SBOX", "STIM", "MEDI", "BON1", "BON2", "ARM1", "BKEY", "YKEY", "RKEY", "BAR1", "BEXP", "PUFF", "BLUD", "TFOG", "IFOG", "SAWG", "CSAW", "MISG", "LAUN", "MISL", "ROCK", "BROK", "PLSG", "PLSF", "PLAS", "PLSS", "PLSE", "CELL", "CELP", "BFGG", "BFGF", "BFUG", "BFS1", "BFE1", "BFE2", "BOS2", "HEAD", "SKUL", "FATT", "CYBR", "BAL2", "FATB", "FBXP"].filter((name) => !sprites.has(name))).toEqual([]);
    const placed = new Set(levels().flatMap((level) => level.things.map((thing) => thing.type)));
    expect([...placed].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 11, 13, 16, 17, 67, 69, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2011, 2012, 2013, 2014, 2015, 2018, 2023, 2025, 2026, 2035, 2046, 2048, 2049, 3001, 3002, 3003, 3005, 3006]);
    // The music: the title, the page between levels, the ending and every level has a song, each lump only naming a file that is here.
    const songs = names.filter((name) => name.startsWith("D_"));
    expect(songs.sort()).toEqual(["D_INTRO", "D_INTROA", "D_INTER", "D_VICTOR", ...FLOORS.map((name) => `D_${name}`)].sort());
    for (const song of songs) {
      const named = songNamed(data(song))!;
      expect([song, SONGS[song]]).toEqual([song, named]);
      expect(SONG_NAMES).toContain(named);
      // An MP3, small enough to fetch on a phone: under 3 MB.
      const file = readFileSync(here(`../games/shooter/delbies/music/${named}.mp3`));
      expect(file.length).toBeGreaterThan(500000);
      expect(file.length).toBeLessThan(3000000);
      expect(file[0]! === 0xff && (file[1]! & 0xe0) === 0xe0).toBe(true);
    }
    expect(songNamed(new TextEncoder().encode("song:Not A Name"))).toBeUndefined();
    expect(songNamed(new Uint8Array(4000))).toBeUndefined();
    // Twelve levels and no more: there is nothing of anyone else's behind them.
    expect(names.filter((name) => /^E\dM\d$/.test(name))).toEqual(FLOORS);
    expect(readWords(data("WORDS")).get("E1M1: Hangar")).toBe("The main floor");
    expect(readLevel(wad, "E1M1").shape.rooms).toHaveLength(levels()[0]!.shape.rooms.length);
  });

  test("the main floor is played: off the porch, through the front door, into the store", async () => {
    let clock = 0;
    let picture = new Uint8ClampedArray(0);
    const sounds: string[] = [];
    const laid = game;
    const names = readWad(laid).lumps.map((lump) => lump.name);
    const running = await startEngine(engine, new Map([["delbies.wad", laid]]), "delbies.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()), sound: { start: (_channel, lump) => void sounds.push(names[lump]!), update() {}, stop() {}, playing: () => false } }, ["-warp", "1", "1"]);
    const run = (tics: number) => {
      for (let i = 0; i < tics; i++) {
        clock += 1000 / 35;
        running.frame();
      }
    };
    const differ = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let changed = 0;
      for (let i = 0; i < 320 * 160 * 4; i++) changed += a[i] === b[i] ? 0 : 1;
      return changed / (320 * 160 * 4);
    };
    run(60);
    const porch = picture;
    // The second player's start is in line with the door; the first is a step to the left of it, so: forward and a little right.
    running.analog(50, 12, 0);
    run(50);
    running.analog(0, 0, 0);
    running.key(true, KEY.use);
    run(4);
    running.key(false, KEY.use);
    run(60);
    expect(sounds).toContain("DSDOROPN");
    running.analog(50, 0, 0);
    run(120);
    expect(running.stopped).toBeNull();
    // Inside, among the shelves, it looks nothing like the porch.
    expect(differ(porch, picture)).toBeGreaterThan(0.6);
    // And the rats have noticed: the engine's sound for its charging monster waking.
    run(60);
    expect(sounds).toContain("DSSGTSIT");
    expect(running.stopped).toBeNull();
  });

  test("each floor is played, the ninth leads on to the tenth, and the game ends after the twelfth", async () => {
    const laid = game;
    /** Starts on a level; `then` is run with the engine. */
    const on = async (bytes: Uint8Array, name: string, then: (running: Awaited<ReturnType<typeof startEngine>>, run: (tics: number) => void) => void) => {
      let clock = 0;
      const running = await startEngine(engine, new Map([["delbies.wad", bytes]]), "delbies.wad", { now: () => clock, frame: () => {} }, ["-warp", name[1]!, name[3]!]);
      then(running, (tics) => {
        for (let i = 0; i < tics; i++) {
          clock += 1000 / 35;
          running.frame();
        }
      });
      return running;
    };
    for (const map of FLOORS) {
      const running = await on(laid, map, (engine, run) => {
        run(60);
        engine.analog(50, 0, 30);
        run(200);
      });
      expect(`${map}: ${JSON.stringify(running.stopped)}`).toBe(`${map}: null`);
      expect(screenOf(running.state())).toBe("level");
    }

    // A floor again, with the player stood at the switch that ends it and no rats: the same level but for where player 1 starts.
    const atSwitch = (name: string, words: Uint8Array | null = null) => {
      const wad = readWad(laid);
      const things = levelLumps(wad, name)!.get("THINGS")!;
      // The switch is on the front of its wall, which is to the right of the way the wall runs.
      const { shape } = levels()[FLOORS.indexOf(name)]!;
      const wall = shape.walls.find((one) => one.special === 11)!;
      const [a, b] = [shape.corners[wall.from]!, shape.corners[wall.to]!];
      const long = Math.hypot(b.x - a.x, b.y - a.y);
      const [rx, ry] = [(b.y - a.y) / long, -(b.x - a.x) / long];
      const stood = { x: Math.round((a.x + b.x) / 2 + rx * 32), y: Math.round((a.y + b.y) / 2 + ry * 32), angle: Math.round((Math.atan2(-ry, -rx) * 180) / Math.PI + 360) % 360 };
      const placed = decodeThings(things.lump.data).map((thing) => (thing.type === 1 ? { ...thing, ...stood } : thing)).filter((thing) => ![3001, 3002, 3003].includes(thing.type));
      return writeWad({ kind: wad.kind, lumps: wad.lumps.map((lump, index) => (index === things.index ? { name: lump.name, data: encodeThings(placed) } : words && lump.name === "WORDS" ? { name: lump.name, data: words } : lump)) });
    };
    /** Pushes the switch, then presses on through whatever comes for half a minute: does the game's ending come, and what is on the screen after? */
    const after = async (name: string, words: Uint8Array | null = null) => {
      let ended = false;
      const running = await on(atSwitch(name, words), name, (engine, run) => {
        run(60);
        for (let i = 0; i < 70; i++) {
          engine.key(true, KEY.use);
          run(3);
          engine.key(false, KEY.use);
          run(12);
          ended ||= (engine.state() & STATE_ENDING) !== 0;
        }
      });
      expect(JSON.stringify(running.stopped)).toBe("null");
      return { ended, screen: screenOf(running.state()) };
    };
    // After the third level comes the fourth, and after the ninth the tenth, which is the next episode's first.
    expect(await after("E1M3")).toEqual({ ended: false, screen: "level" });
    expect(await after("E1M9")).toEqual({ ended: false, screen: "level" });
    // After the twelfth, the ending.
    expect((await after("E2M3")).ended).toBe(true);
    // A game that says it is three levels long ends after the third; one that doesn't say has the engine's eight.
    const said = (levels: string | null) => writeWords(new Map([...readWords(readWad(laid).lumps.find((lump) => lump.name === "WORDS")!.data)].filter(([from]) => from !== "!levels").concat(levels ? [["!levels", levels]] : [])));
    expect((await after("E1M3", said("3"))).ended).toBe(true);
    expect((await after("E1M3", said(null))).ended).toBe(false);
    expect((await after("E1M8", said(null))).ended).toBe(true);
  }, 60000);

  test("the level starts with a line of Delbie's, and without its words says nothing", async () => {
    const top = async (bytes: Uint8Array) => {
      let clock = 0;
      let picture = new Uint8ClampedArray(0);
      const running = await startEngine(engine, new Map([["delbies.wad", bytes]]), "delbies.wad", { now: () => clock, frame: (pixels) => (picture = pixels.slice()) }, ["-warp", "1", "1", "-nomonsters"]);
      for (let i = 0; i < 70; i++) {
        clock += 1000 / 35;
        running.frame();
      }
      expect(running.stopped).toBeNull();
      // The top ten rows: where a message is written.
      return picture.slice(0, 320 * 10 * 4);
    };
    const laid = game;
    const quiet = readWad(laid);
    const silent = writeWad({ kind: quiet.kind, lumps: quiet.lumps.map((lump) => (lump.name === "WORDS" ? { name: lump.name, data: writeWords(new Map([["E1M1: Hangar", "The main floor"]])) } : lump)) });
    const [said, unsaid, again] = [await top(laid), await top(silent), await top(silent)];
    const differ = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.some((value, i) => value !== b[i]);
    expect(differ(unsaid, again)).toBe(false);
    expect(differ(said, unsaid)).toBe(true);
  });
});
