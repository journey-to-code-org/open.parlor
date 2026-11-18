// A game across devices, all in one process: real engines, the real room, and each device's
// session, joined by a connection that is a function call. What is checked is the one thing the
// whole design rests on: devices that are only told each other's commands end up with the same game.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import data from "../games/shooter/data.json";
import { DEFAULT_SETTINGS, type Settings } from "../net/protocol.ts";
import { Room } from "../net/room.ts";
import { type Engine, netArgs, screenOf, startEngine } from "../src/shooter/engine.ts";
import { KEY } from "../src/shooter/keys.ts";
import { type Game, type Lobby, openSession, type Session, type Transport } from "../src/shooter/session.ts";

const wad = join(import.meta.dirname, "../public/data", data.file);
const TIC = 1000 / 35;

interface Device {
  name: string;
  session: Session;
  engine: Engine | null;
  lobby: Lobby | null;
  game: Game | null;
  waiting: number[];
  closed: string | null;
  picture: Uint8ClampedArray;
  /** Cuts the connection, as a closed tab does. */
  unplug(): void;
}

function table(options: { dropAfter?: number } = {}) {
  const clock = { now: 0 };
  const room = new Room("TEST", { now: () => clock.now, ...options });
  const bytes = new Uint8Array(gunzipSync(readFileSync(wad)));
  const module = new WebAssembly.Module(readFileSync(join(import.meta.dirname, "../games/shooter/shooter.wasm")));
  const devices: Device[] = [];
  /** Engines being started: a device's engine starts when the room says the game is on. */
  const starting: Promise<void>[] = [];
  /** What each device's game had come to at each tic it stood at. */
  const history = new Map<Device, Map<number, number>>();

  function connect(name: string, watch = false): Device {
    // The two ends of a connection. What is sent arrives at once, as a copy, like bytes off a wire.
    const transport: Transport = { send: (sent) => seat.receive(typeof sent === "string" ? sent : sent.slice()), close: () => seat.leave(), onmessage: null, onclose: null };
    const seat = room.join({ send: (sent) => transport.onmessage?.(typeof sent === "string" ? sent : sent.slice()), close: () => transport.onclose?.() });
    const device: Device = { name, engine: null, lobby: null, game: null, waiting: [], closed: null, picture: new Uint8ClampedArray(0), session: null as unknown as Session, unplug: () => (seat.leave(), transport.onclose?.()) };
    /** Tics that arrive while the engine is still starting. */
    const early: Parameters<Engine["tic"]>[0][] = [];
    device.session = openSession(transport, name, watch, {
      lobby: (lobby) => (device.lobby = lobby),
      waiting: (slots) => (device.waiting = slots),
      closed: (reason) => (device.closed = reason),
      tics: (tics) => (device.engine ? tics.forEach(device.engine.tic) : early.push(...tics)),
      start(game) {
        device.game = game;
        starting.push(
          startEngine(
            module,
            new Map([["freedoom1.wad", bytes]]),
            "freedoom1.wad",
            { now: () => clock.now, frame: (pixels) => (device.picture = pixels.slice()), command: (tic, command) => device.session.command(tic, command) },
            netArgs(game.settings, game.players.length, game.slot),
          ).then((engine) => {
            device.engine = engine;
            early.forEach(engine.tic);
          }),
        );
      },
    });
    devices.push(device);
    return device;
  }

  return {
    room,
    clock,
    connect,
    /** Waits for every engine the room has asked for. */
    async started() {
      while (starting.length) await starting.pop();
    },
    /** This much game time passes on every device. */
    run(tics: number) {
      for (let i = 0; i < tics; i++) {
        clock.now += TIC;
        for (const device of devices) {
          if (!device.engine?.frame()) continue;
          if (!history.has(device)) history.set(device, new Map());
          history.get(device)!.set(device.engine.tics(), device.engine.checksum());
        }
        room.check();
      }
    },
    /**
     * Whether the devices have had the same game: wherever two of them have stood at the same tic,
     * everything that moves was in the same place. (At any moment they are a tic or two apart.)
     * Also how many devices there are and how many tics they were compared at.
     */
    agreement() {
      const seen = new Map<number, Set<number>>();
      for (const record of history.values()) for (const [tic, sum] of record) seen.set(tic, (seen.get(tic) ?? new Set()).add(sum));
      const shared = [...seen.entries()].filter(([tic]) => [...history.values()].filter((record) => record.has(tic)).length > 1);
      return { devices: history.size, compared: shared.length, same: shared.every(([, sums]) => sums.size === 1) };
    },
  };
}

/**
 * Whether two pictures are the same view of the level. Only the middle of the picture is compared:
 * the top line is a player's messages, and the face in the status bar is each device's own.
 */
function sameView(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  let same = 0;
  const from = 320 * 16 * 4;
  const to = 320 * 160 * 4;
  for (let i = from; i < to; i++) same += a[i] === b[i] ? 1 : 0;
  // Devices are a tic or so apart at any moment, which is a flickering light's difference.
  return same / (to - from) > 0.97;
}

const settings = (change: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, skill: 2, ...change });

describe.skipIf(!existsSync(wad))("a game across devices", () => {
  test("two players and someone watching all have the same game, whatever the players do", async () => {
    const t = table();
    const ada = t.connect("Ada");
    const ben = t.connect("Ben");
    const cy = t.connect("Cy", true);
    expect(ada.lobby?.members.map((member) => `${member.name}${member.watching ? " watching" : ""}`)).toEqual(["Ada", "Ben", "Cy watching"]);
    expect(ben.lobby?.host).toBe(ada.lobby?.you);

    // Only the host sets the game up and starts it.
    ben.session.start();
    expect(ada.game).toBeNull();
    ada.session.settings(settings());
    ada.session.start();
    await t.started();
    expect([ada.game?.slot, ben.game?.slot, cy.game?.slot]).toEqual([0, 1, -1]);
    expect(ben.game?.settings.skill).toBe(2);

    t.run(40);
    expect(screenOf(ada.engine!.state())).toBe("level");
    expect(ada.engine!.players()).toBe(0b11);

    // Both run about, turn and shoot, on their own devices.
    ada.engine!.analog(50, 10, 300);
    ben.engine!.analog(40, -30, -500);
    t.run(60);
    ada.engine!.key(true, KEY.fire);
    ben.engine!.mouse(1, 400, 0);
    t.run(40);
    ada.engine!.key(false, KEY.fire);
    ada.engine!.analog(-50, 0, 0);
    ben.engine!.analog(0, 40, 800);
    t.run(80);
    ada.engine!.analog(0, 0, 0);
    ben.engine!.analog(0, 0, 0);
    ben.engine!.mouse(0, 0, 0);
    // Long enough for the last commands to have gone round.
    t.run(30);

    expect(ada.engine!.tics()).toBeGreaterThan(200);
    const { devices, compared, same } = t.agreement();
    expect(devices).toBe(3);
    expect(compared).toBeGreaterThan(100);
    expect(same).toBe(true);
    // Each sees it from where they stand.
    expect(sameView(ada.picture, ben.picture)).toBe(false);
    expect([ada.engine!.stopped, ben.engine!.stopped, cy.engine!.stopped]).toEqual([null, null, null]);
  });

  test("someone watching looks through either player's eyes, and it changes nothing", async () => {
    const t = table();
    const ada = t.connect("Ada");
    const ben = t.connect("Ben");
    const cy = t.connect("Cy", true);
    ada.session.settings(settings({ monsters: false }));
    ada.session.start();
    await t.started();
    t.run(40);
    ada.engine!.analog(50, 0, 0);
    t.run(40);
    ada.engine!.analog(0, 0, 0);
    // A running player slides a good way before stopping.
    t.run(100);

    // Nothing is moving now, so a picture is a player's view and nothing else.
    expect(sameView(ada.picture, ben.picture)).toBe(false);
    expect(sameView(cy.picture, ada.picture)).toBe(true);
    cy.engine!.view(1);
    t.run(3);
    expect(sameView(cy.picture, ben.picture)).toBe(true);
    cy.engine!.view(0);
    t.run(3);
    expect(sameView(cy.picture, ada.picture)).toBe(true);
    expect(t.agreement()).toMatchObject({ devices: 3, same: true });
  });

  test("someone who comes to watch late is sent the game so far and catches up", async () => {
    const t = table();
    const ada = t.connect("Ada");
    const ben = t.connect("Ben");
    ada.session.settings(settings());
    ada.session.start();
    await t.started();
    t.run(40);
    ada.engine!.analog(50, 0, 400);
    ben.engine!.analog(50, 0, -400);
    t.run(700);

    const dee = t.connect("Dee");
    // The game is on, so Dee watches, whatever was asked for.
    expect(dee.lobby?.members.at(-1)).toMatchObject({ name: "Dee", watching: true });
    await t.started();
    expect(dee.game?.slot).toBe(-1);
    expect(dee.engine!.behind()).toBeGreaterThan(600);
    // Twenty minutes of game is caught up in seconds: here, 700 tics in a handful of frames.
    t.run(12);
    expect(dee.engine!.behind()).toBeLessThan(10);
    ada.engine!.analog(0, 0, 0);
    ben.engine!.analog(0, 0, 0);
    t.run(30);
    expect(t.agreement()).toMatchObject({ devices: 3, same: true });
  });

  test("a player who leaves is out of the game, and it goes on for the other", async () => {
    const t = table();
    const ada = t.connect("Ada");
    const ben = t.connect("Ben");
    ada.session.settings(settings());
    ada.session.start();
    await t.started();
    t.run(60);
    ben.unplug();
    expect(ben.closed).toBe("The connection to the game was lost.");
    const before = ada.engine!.tics();
    t.run(60);
    expect(ada.engine!.tics()).toBeGreaterThan(before + 50);
    expect(ada.engine!.players()).toBe(0b01);
    expect(ada.lobby?.members.map((member) => member.name)).toEqual(["Ada"]);
  });

  test("a player who stops sending holds the game up, is named, and then is dropped", async () => {
    const t = table({ dropAfter: 4000 });
    const ada = t.connect("Ada");
    const ben = t.connect("Ben");
    ada.session.settings(settings());
    ada.session.start();
    await t.started();
    t.run(60);

    // Ben's tab goes to the background: his engine stops being run.
    const frozen = ben.engine!;
    ben.engine = null;
    const held = ada.engine!.tics();
    t.run(70);
    expect(ada.engine!.tics() - held).toBeLessThan(12);
    expect(ada.waiting).toEqual([1]);
    t.run(100);
    expect(ben.closed).toBe("You were away too long, and the game went on without you.");
    expect(ada.waiting).toEqual([]);
    expect(ada.engine!.players()).toBe(0b01);
    const going = ada.engine!.tics();
    t.run(40);
    expect(ada.engine!.tics()).toBeGreaterThan(going + 30);
    expect(frozen.stopped).toBeNull();
  });

  test("deathmatch with no monsters starts, each player in a place of their own", async () => {
    const t = table();
    const ada = t.connect("Ada");
    const ben = t.connect("Ben");
    ada.session.settings(settings({ mode: "deathmatch", monsters: false }));
    ada.session.start();
    await t.started();
    t.run(80);
    expect([ada.engine!.stopped, ben.engine!.stopped]).toEqual([null, null]);
    expect(screenOf(ben.engine!.state())).toBe("level");
    expect(sameView(ada.picture, ben.picture)).toBe(false);
    expect(t.agreement()).toMatchObject({ devices: 2, same: true });
  });
});
