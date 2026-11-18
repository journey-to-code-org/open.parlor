// Tunables: the numbers a game lets its host change. Checked against each game's shape, kept as a
// versioned override, read by the game without a password and changed only with the admin token.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { check, TUNABLE_GAMES } from "../src/tunables.js";

const BASE = "http://test";
const TOKEN = "let-grammi-in";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

function setup() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false, adminToken: TOKEN });
  open.push(app);
  const call = async (path: string, body?: unknown, token: string | null = TOKEN) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const r = (await app.fetch(new Request(BASE + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) })))!;
    return { status: r.status, body: (await r.json()) as any };
  };
  return { app, call, admin: (path: string, body?: unknown, token?: string | null) => call(`/moderation${path}`, body, token) };
}

describe("the shape of a game's tunables", () => {
  const room = TUNABLE_GAMES["back-room"]!.shape;

  it("takes a sparse override of cards, foes and the two global numbers", () => {
    expect(check(room, {})).toEqual([]);
    expect(check(room, { rest: 10, maxHp: 50, cards: { wrench: { damage: 8 } }, foes: { rat: { hp: 20, pattern: [{ kind: "attack", amount: 7 }] } } })).toEqual([]);
  });

  it("says where each thing is wrong", () => {
    expect(check(room, { cards: { wrench: { damage: -1 } } })).toEqual(["cards.wrench.damage must be from 0 to 99."]);
    expect(check(room, { foes: { rat: { hp: 0 } } })).toEqual(["foes.rat.hp must be from 1 to 999."]);
    expect(check(room, { foes: { rat: { pattern: [] } } })).toEqual(["foes.rat.pattern must have 1 to 12 entries."]);
    expect(check(room, { foes: { rat: { pattern: [{ kind: "flee", amount: 1 }] } } })).toEqual(["foes.rat.pattern[0].kind must be one of attack, block."]);
    expect(check(room, { cards: { Wrench: {} } })).toEqual(["cards.Wrench isn't a valid name."]);
    expect(check(room, { foes: { rat: { pattern: [{ kind: "attack" }] } } })).toEqual(["foes.rat.pattern[0].amount is needed."]);
    expect(check(room, { foes: { rat: { pattern: [{}] } } })).toEqual(["foes.rat.pattern[0].kind is needed.", "foes.rat.pattern[0].amount is needed."]);
    expect(check(room, { cards: { wrench: { luck: 3 } } })).toEqual(["cards.wrench.luck isn't something this game lets you change."]);
    expect(check(room, { rest: 1.5 })).toEqual(["rest must be a whole number."]);
    expect(check(room, { rest: "8" })).toEqual(["rest must be a whole number."]);
    expect(check(room, [])).toEqual(["values must be an object."]);
  });

  it("refuses an object that only looks like one, and the usual prototype tricks", () => {
    expect(check(room, JSON.parse('{"__proto__": {"x": 1}}'))).not.toEqual([]);
    expect(check(room, { cards: Object.create({ wrench: {} }) })).toEqual(["cards must be an object."]);
  });

  it("the sudoku's clues are seven numbers, one for each weekday", () => {
    const sudoku = TUNABLE_GAMES.sudoku!.shape;
    expect(check(sudoku, { clues: [40, 38, 36, 33, 31, 29, 27] })).toEqual([]);
    expect(check(sudoku, { clues: [40, 38] })).toEqual(["clues must have 7 entries."]);
    expect(check(sudoku, { clues: [40, 38, 36, 33, 31, 29, 3] })).toEqual(["clues[6] must be from 22 to 60."]);
  });
});

describe("keeping them", () => {
  it("starts at version 0 with nothing changed, and anyone may read that", async () => {
    const { call } = setup();
    expect((await call("/tunables/back-room", undefined, null))).toEqual({ status: 200, body: { version: 0, values: {} } });
  });

  it("an unknown game is not found, and a write to the public route is refused", async () => {
    const { call } = setup();
    expect((await call("/tunables/chess", undefined, null)).status).toBe(404);
    expect((await call("/tunables/back-room", { values: {} }, null)).status).toBe(404);
  });

  it("saving puts the numbers where the game reads them, and each change is a new version", async () => {
    const { call, admin } = setup();
    const first = await admin("/tunables/back-room", { values: { rest: 12, cards: { wrench: { damage: 8 } } } });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ version: 1, values: { rest: 12, cards: { wrench: { damage: 8 } } } });
    expect((await call("/tunables/back-room", undefined, null)).body).toEqual({ version: 1, values: { rest: 12, cards: { wrench: { damage: 8 } } } });
    // Replaced, not merged: what is saved is exactly what was sent.
    const second = await admin("/tunables/back-room", { values: { maxHp: 50 } });
    expect(second.body).toMatchObject({ version: 2, values: { maxHp: 50 } });
    expect((await call("/tunables/back-room", undefined, null)).body.values).toEqual({ maxHp: 50 });
  });

  it("a game's numbers are its own", async () => {
    const { call, admin } = setup();
    await admin("/tunables/back-room", { values: { rest: 3 } });
    expect((await call("/tunables/sudoku", undefined, null)).body).toEqual({ version: 0, values: {} });
  });

  it("something wrong changes nothing and says why", async () => {
    const { call, admin } = setup();
    await admin("/tunables/back-room", { values: { rest: 3 } });
    const bad = await admin("/tunables/back-room", { values: { rest: 3, foes: { rat: { hp: 0 }, pup: { hp: 1000 } } } });
    expect(bad.status).toBe(422);
    expect(bad.body.problems).toEqual(["foes.rat.hp must be from 1 to 999.", "foes.pup.hp must be from 1 to 999."]);
    expect(bad.body.error).toBe(bad.body.problems[0]);
    expect((await call("/tunables/back-room", undefined, null)).body).toEqual({ version: 1, values: { rest: 3 } });
  });

  it("too much to keep is refused", async () => {
    const { admin } = setup();
    const long = Array.from({ length: 12 }, () => ({ kind: "attack", amount: 10, hits: 2 }));
    const foes = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`foe-${String(i).padStart(2, "a")}`, { hp: 10, pattern: long }]));
    const refused = await admin("/tunables/back-room", { values: { foes } });
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe("That is too much to keep.");
  });

  it("a game with nothing to tune says so", async () => {
    const { admin } = setup();
    expect((await admin("/tunables/chess", { values: {} })).status).toBe(422);
    expect((await admin("/tunables/chess/reset", {})).status).toBe(404);
  });

  it("putting them back empties the overrides but the version still goes up", async () => {
    const { call, admin } = setup();
    await admin("/tunables/back-room", { values: { rest: 3 } });
    expect((await admin("/tunables/back-room/reset", {})).body).toMatchObject({ version: 2, values: {} });
    expect((await call("/tunables/back-room", undefined, null)).body).toEqual({ version: 2, values: {} });
  });
});

describe("the host's side", () => {
  it("lists every game that can be tuned with its shape and what is saved", async () => {
    const { admin } = setup();
    await admin("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    const { status, body } = await admin("/tunables");
    expect(status).toBe(200);
    expect(body.games.map((g: { id: string }) => g.id)).toEqual(["back-room", "sudoku"]);
    expect(body.games[1].saved).toMatchObject({ version: 1, values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    // The shape reaches the admin app as plain JSON: a name pattern is its source.
    expect(body.games[0].shape.fields.cards.key).toBe("^[a-z][a-z0-9-]{0,23}$");
    expect(body.games[0].shape.fields.rest).toEqual({ type: "int", min: 0, max: 60 });
  });

  it("wants the admin token to look or to change", async () => {
    const { admin } = setup();
    expect((await admin("/tunables", undefined, null)).status).toBe(401);
    expect((await admin("/tunables/back-room", { values: {} }, "wrong")).status).toBe(401);
    expect((await admin("/tunables/back-room/reset", {}, null)).status).toBe(401);
  });

  it("writes each change in the log, with the version", async () => {
    const { admin } = setup();
    await admin("/tunables/back-room", { values: { rest: 3 } });
    await admin("/tunables/back-room/reset", {});
    const log = (await admin("/log")).body.log as { action: string; target: string; note: string }[];
    expect(log.map((e) => [e.action, e.target, e.note])).toEqual([
      ["Put a game's numbers back", "back-room", "version 2"],
      ["Changed a game's numbers", "back-room", "version 1"],
    ]);
  });
});

describe("the numbers promoted into the code", () => {
  // The files a pull request from the admin app commits. A merge that breaks one fails here, in CI.
  for (const [game, spec] of Object.entries(TUNABLE_GAMES)) {
    it(`${game}: the file in the repository is something its shape accepts`, async () => {
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const file = fileURLToPath(new URL(`../../../${spec.promoted}`, import.meta.url));
      expect(check(spec.shape, JSON.parse(readFileSync(file, "utf8")))).toEqual([]);
    });
  }
});
