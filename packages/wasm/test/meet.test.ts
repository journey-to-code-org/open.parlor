import { expect, test } from "vitest";
import { Meet, Meets } from "../net/meet.ts";

/** A meet with a clock to turn, and devices that keep what they are told. */
function meeting(options = {}) {
  const clock = { now: 0 };
  const meet = new Meet("lot", { now: () => clock.now, ...options });
  const come = (name?: string) => {
    const told: Record<string, unknown>[] = [];
    let open = true;
    const seat = meet.join({ send: (data) => void told.push(JSON.parse(data as string)), close: () => (open = false) });
    const say = (message: unknown) => seat.receive(typeof message === "string" ? message : JSON.stringify(message));
    if (name !== undefined) say({ t: "hello", name });
    return { say, seat, told, of: (t: string) => told.filter((m) => m.t === t), get open() { return open; } };
  };
  return { meet, clock, come };
}

test("says who is here, and tells the others who came and went", () => {
  const { meet, come } = meeting();
  const ay = come("Ay");
  expect(ay.told).toEqual([{ t: "you", id: 1, members: [{ id: 1, name: "Ay" }] }]);
  const bee = come("  Bee<script>  ");
  expect(bee.told[0]).toEqual({ t: "you", id: 2, members: [{ id: 1, name: "Ay" }, { id: 2, name: "Beescript" }] });
  expect(ay.of("join")).toEqual([{ t: "join", id: 2, name: "Beescript" }]);
  expect(meet.size).toBe(2);
  bee.seat.leave();
  expect(ay.of("left")).toEqual([{ t: "left", id: 2 }]);
  expect(meet.size).toBe(1);
  ay.seat.leave();
  expect(meet.empty).toBe(true);
});

test("passes on what a member says, with who said it, to one or to all the rest", () => {
  const { come } = meeting();
  const [ay, bee, cee] = [come("Ay"), come("Bee"), come("Cee")];
  ay.say({ t: "here", car: "box", from: 99 });
  expect(bee.of("here")).toEqual([{ t: "here", car: "box", from: 1 }]);
  expect(cee.of("here")).toEqual([{ t: "here", car: "box", from: 1 }]);
  expect(ay.of("here")).toEqual([]);
  bee.say({ t: "dare", to: 1, stake: 10 });
  expect(ay.of("dare")).toEqual([{ t: "dare", to: 1, stake: 10, from: 2 }]);
  expect(cee.of("dare")).toEqual([]);
});

test("someone who has not said hello hears nothing and is not heard", () => {
  const { come } = meeting();
  const ay = come("Ay");
  const quiet = come();
  quiet.say({ t: "here", car: "box" });
  ay.say({ t: "here", car: "box" });
  expect(ay.of("here")).toEqual([]);
  expect(quiet.told).toEqual([]);
  quiet.seat.leave();
  expect(ay.of("left")).toEqual([]);
});

test("will not pass on what is not a member's to say", () => {
  const { come } = meeting({ longest: 60 });
  const [ay, bee] = [come("Ay"), come("Bee")];
  const before = bee.told.length;
  for (const bad of ["not json", "[1]", "7", '"x"', { t: "you", id: 1, members: [] }, { t: "left", id: 2 }, { t: "join", id: 9, name: "Ghost" }, { t: "hello", name: "Again" }, { no: "t" }, { t: 5 }, { t: "x", pad: "y".repeat(80) }]) ay.say(bad);
  ay.seat.receive(new Uint8Array([1, 2, 3]));
  expect(bee.told.length).toBe(before);
});

test("drops what comes too fast, a second at a time", () => {
  const { clock, come } = meeting({ rate: 5 });
  const [ay, bee] = [come("Ay"), come("Bee")];
  clock.now = 5000;
  for (let i = 0; i < 20; i++) ay.say({ t: "pos", p: i });
  expect(bee.of("pos").length).toBe(5);
  clock.now = 6000;
  ay.say({ t: "pos", p: 99 });
  expect(bee.of("pos").length).toBe(6);
});

test("is full when it is full", () => {
  const { meet, come } = meeting({ most: 2 });
  come("Ay");
  come("Bee");
  const cee = come("Cee");
  expect(cee.told).toEqual([{ t: "full" }]);
  expect(cee.open).toBe(false);
  expect(meet.size).toBe(2);
});

test("a server's meets are made when someone comes and forgotten when the last leaves", () => {
  const meets = new Meets({ now: () => 0 }, 2);
  expect(meets.at("Not A Name")).toBeNull();
  expect(meets.at("../etc")).toBeNull();
  const lot = meets.at("shootout")!;
  const seat = lot.join({ send() {}, close() {} });
  expect(meets.at("shootout")).toBe(lot);
  meets.at("other")!.join({ send() {}, close() {} });
  expect(meets.at("third")).toBeNull();
  seat.leave();
  meets.sweep();
  expect(meets.count).toBe(1);
  expect(meets.at("third")).not.toBeNull();
});
