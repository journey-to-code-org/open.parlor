import { expect, test } from "vitest";
import { cleanName, cleanSettings, decodeCommand, decodeTics, DEFAULT_SETTINGS, encodeCommand, encodeTics, type FromRoom } from "../net/protocol.ts";
import { JOIN_LEAD, Room, Rooms } from "../net/room.ts";

/** A room with a clock to turn, and devices that keep what they are told. */
function table(options = {}) {
  const clock = { now: 0 };
  const room = new Room("ROOM", { now: () => clock.now, ...options });
  const sit = (name?: string, watch = false) => {
    const told: FromRoom[] = [];
    const tics: number[] = [];
    let open = true;
    const seat = room.join({
      send(data) {
        if (typeof data === "string") told.push(JSON.parse(data));
        else for (let i = 0, batch = decodeTics(data)!; i < batch.tics.length; i++) tics.push(batch.first + i);
      },
      close: () => (open = false),
    });
    const say = (message: object) => seat.receive(JSON.stringify(message));
    if (name) say({ t: "hello", name, watch });
    return {
      say,
      seat,
      told,
      tics,
      last: <T extends FromRoom["t"]>(type: T) => told.filter((message) => message.t === type).at(-1) as Extract<FromRoom, { t: T }> | undefined,
      command: (tic: number, size = 16) => seat.receive(encodeCommand(tic, new Uint8Array(size).fill(tic))),
      get open() {
        return open;
      },
    };
  };
  return { room, clock, sit };
}

test("commands and tics come back from bytes as they went in", () => {
  expect(decodeCommand(encodeCommand(70000, new Uint8Array([1, 2, 3])))).toEqual({ tic: 70000, command: new Uint8Array([1, 2, 3]) });
  const tics = [
    { playing: 0b0011, commands: new Uint8Array(64).fill(7) },
    { playing: 0b0001, commands: new Uint8Array(64).fill(9) },
  ];
  expect(decodeTics(encodeTics(41, tics))).toEqual({ first: 41, tics });
  expect(decodeTics(new Uint8Array([2, 0, 0]))).toBeNull();
  expect(decodeCommand(new Uint8Array(200).fill(1))).toBeNull();
});

test("what a device says of itself is tidied, not trusted", () => {
  expect(cleanSettings({ mode: "deathmatch", skill: 99, episode: 2, map: "x", monsters: false, listed: true })).toEqual({ mode: "deathmatch", skill: 3, episode: 2, map: 1, monsters: false, listed: true });
  expect(cleanSettings(null)).toEqual(DEFAULT_SETTINGS);
  expect(cleanName("  <b>Grammi</b> the Great & Powerful ")).toBe("bGrammib the Gre");
  expect(cleanName(42)).toBe("Player");
});

test("the first to come is the host; four play, and the fifth watches", () => {
  const t = table();
  const people = ["Ada", "Ben", "Cy", "Dee", "Eve"].map((name) => t.sit(name));
  const lobby = people[4]!.last("lobby")!;
  expect(lobby.host).toBe(people[0]!.last("lobby")!.you);
  expect(lobby.members.map((member) => member.watching)).toEqual([false, false, false, false, true]);
  // Someone gives up a place, and the fifth can take it.
  people[1]!.say({ t: "watch", watch: true });
  people[4]!.say({ t: "watch", watch: false });
  expect(people[0]!.last("lobby")!.members.map((member) => member.watching)).toEqual([false, true, false, false, false]);
});

test("only the host sets the game up and starts it, and the next longest here is host when the host goes", () => {
  const t = table();
  const ada = t.sit("Ada");
  const ben = t.sit("Ben");
  ben.say({ t: "settings", settings: { ...DEFAULT_SETTINGS, skill: 5 } });
  ben.say({ t: "start" });
  expect(ada.last("lobby")!.settings.skill).toBe(3);
  expect(ada.last("start")).toBeUndefined();
  ada.seat.leave();
  expect(ben.last("lobby")!.host).toBe(ben.last("lobby")!.you);
  ben.say({ t: "start" });
  expect(ben.last("start")).toMatchObject({ slot: 0, players: [{ name: "Ben" }] });
});

test("a tic goes out when every player's command for it is in, and not before", () => {
  const t = table();
  const ada = t.sit("Ada");
  const ben = t.sit("Ben");
  const cy = t.sit("Cy", true);
  ada.say({ t: "start" });
  expect([ada.last("start")!.slot, ben.last("start")!.slot, cy.last("start")!.slot]).toEqual([0, 1, -1]);
  ada.command(0);
  ada.command(1);
  expect(cy.tics).toEqual([]);
  ben.command(0);
  expect(cy.tics).toEqual([0]);
  ben.command(2);
  ben.command(1);
  expect(cy.tics).toEqual([0, 1]);
  // Someone watching can't put a command in; nor can a command be for a tic already sent, or far off.
  cy.command(2);
  ada.command(1);
  ada.command(500);
  expect(ada.tics).toEqual([0, 1]);
  ada.command(2);
  expect(ada.tics).toEqual([0, 1, 2]);
  expect(ben.tics).toEqual([0, 1, 2]);
});

test("a room that is over takes nobody, and is forgotten once it is empty", () => {
  const clock = { now: 0 };
  const rooms = new Rooms({ now: () => clock.now }, 2);
  const room = rooms.open()!;
  expect(room.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
  expect(rooms.find(room.code.toLowerCase())).toBe(room);
  expect(rooms.open()).not.toBeNull();
  // As many as there may be.
  expect(rooms.open()).toBeNull();
  // Nobody came to either: after a minute they make way.
  clock.now = 61000;
  expect(rooms.open()).not.toBeNull();
  expect(rooms.find(room.code)).toBeUndefined();
});

test("only a game that is on, and that its host has listed, is shown to people who aren't in it", () => {
  const clock = { now: 0 };
  const rooms = new Rooms({ now: () => clock.now });
  const room = rooms.open()!;
  const say = (seat: ReturnType<Room["join"]>, message: object) => seat.receive(JSON.stringify(message));
  const ada = room.join({ send() {}, close() {} });
  say(ada, { t: "hello", name: "Ada", watch: false });
  say(ada, { t: "settings", settings: { ...DEFAULT_SETTINGS, listed: true } });
  expect(rooms.listed()).toEqual([]);
  say(ada, { t: "start" });
  expect(rooms.listed()).toMatchObject([{ code: room.code, players: ["Ada"], watching: 0 }]);
  ada.leave();
  expect(rooms.listed()).toEqual([]);
});

test("when the last player leaves, the people watching are told it is over", () => {
  const t = table();
  const ada = t.sit("Ada");
  const cy = t.sit("Cy", true);
  ada.say({ t: "start" });
  ada.command(0);
  ada.seat.leave();
  expect(cy.last("closed")?.reason).toBe("Everyone who was playing has left.");
  expect(cy.open).toBe(false);
  expect(t.room.empty).toBe(true);
  const late = t.sit("Late");
  expect(late.last("closed")?.reason).toBe("This game is over.");
});

test("someone who comes late to play watches until caught up, then plays from a tic a second ahead", () => {
  const t = table();
  const ada = t.sit("Ada");
  ada.say({ t: "start" });
  for (let tic = 0; tic < 100; tic++) ada.command(tic);
  expect(ada.tics).toHaveLength(100);

  const ben = t.sit("Ben");
  expect(ben.last("start")?.slot).toBe(-1);
  expect(ben.tics).toHaveLength(100);
  ben.say({ t: "ready" });
  const joined = ben.last("joined")!;
  expect(joined).toMatchObject({ slot: 1, at: 100 + JOIN_LEAD, member: { name: "Ben", watching: false } });
  expect(ada.last("joined")).toEqual(joined);

  // Until then Ada's commands are the game; from then, it waits for Ben's too.
  for (let tic = 100; tic < 160; tic++) ada.command(tic);
  expect(ada.tics).toHaveLength(joined.at);
  ben.command(joined.at - 1);
  ben.command(joined.at);
  expect(ada.tics).toHaveLength(joined.at + 1);
  expect(t.room.summary.players).toEqual(["Ada", "Ben"]);
});

test("someone who came late to play waits while four are playing, and has the first place that comes free", () => {
  const t = table();
  const four = ["Ada", "Ben", "Cy", "Dee"].map((name) => t.sit(name));
  four[0]!.say({ t: "start" });
  const eve = t.sit("Eve");
  eve.say({ t: "ready" });
  expect(eve.last("joined")).toBeUndefined();
  four[2]!.seat.leave();
  expect(eve.last("joined")).toMatchObject({ slot: 2, member: { name: "Eve" } });
});

test("someone who came late only to watch is never put in", () => {
  const t = table();
  const ada = t.sit("Ada");
  ada.say({ t: "start" });
  const cy = t.sit("Cy", true);
  cy.say({ t: "ready" });
  expect(cy.last("joined")).toBeUndefined();
});
