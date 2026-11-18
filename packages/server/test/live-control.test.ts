// Holding a game and stepping in, from the admin app: the table is paused (nobody can move, the players
// are told in the chat and on the room), resumed, and a seat's turn can be played for the player by the
// game's own computer player. Every step is in the activity log and in the table's chat.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";

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
  const phone = () => {
    let cookie = "";
    return async (path: string, body?: unknown) => {
      const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: r.status, body: (await r.json()) as any };
    };
  };
  const admin = async (path: string, body?: unknown, token: string | null = TOKEN) => {
    const r = (await app.fetch(new Request(`${BASE}/moderation${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })))!;
    return { status: r.status, body: (await r.json()) as any };
  };
  return { app, phone, admin };
}

const PALACE = { options: { game: "palace", rules: { id: "family-palace", name: "Family Palace" }, seats: 2 } };

/** A dealt two-seat Palace table with two people at it. */
async function dealt() {
  const world = setup();
  const grammi = world.phone();
  const rowdy = world.phone();
  const id = (await grammi("/rooms", PALACE)).body.id as string;
  await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
  await rowdy(`/rooms/${id}/sit`, { seat: 1, name: "Rowdy" });
  await grammi(`/rooms/${id}/start`, {});
  return { ...world, grammi, rowdy, id };
}

describe("pausing a table", () => {
  it("holds it: nobody can move, the room says so, the table is told, and it is in the log", async () => {
    const { admin, grammi, rowdy, id } = await dealt();
    expect((await admin(`/tables/${id}/pause`, { reason: "Checking something." })).status).toBe(200);

    const room = (await grammi(`/rooms/${id}`)).body;
    expect(room.paused).toMatchObject({ reason: "Checking something." });
    for (const who of [grammi, rowdy]) {
      const refused = await who(`/rooms/${id}/act`, { move: { type: "ready" } });
      expect(refused.status).toBe(423);
      expect(refused.body.error).toBe("The table is paused: Checking something.");
    }
    // The table is told, in the chat, by the host and not by a seat.
    const chat = (await admin(`/tables/${id}`)).body.chat;
    expect(chat.at(-1)).toMatchObject({ seat: -1, name: "The host", text: "The host paused the game: Checking something.", notice: true });
    // The admin's list shows it, and the log has it.
    expect((await admin("/tables")).body.tables[0]).toMatchObject({ status: "playing", paused: { reason: "Checking something." } });
    expect((await admin("/log")).body.log[0]).toMatchObject({ action: "Paused a table", note: "Checking something." });
    // Chat still works for the players.
    expect((await rowdy(`/rooms/${id}/say`, { text: "hello?" })).status).toBe(200);
  });

  it("lets the game go on after a resume, and says so", async () => {
    const { admin, grammi, id } = await dealt();
    await admin(`/tables/${id}/pause`, {});
    expect((await admin(`/tables/${id}/pause`, {})).status).toBe(200); // again: nothing changes
    expect((await admin(`/tables/${id}/resume`, {})).status).toBe(200);
    expect((await grammi(`/rooms/${id}`)).body.paused ?? null).toBeNull();
    expect((await admin(`/tables/${id}/resume`, {})).status).toBe(409);
    const chat = (await admin(`/tables/${id}`)).body.chat;
    expect(chat.map((m: any) => m.text)).toEqual(["The host paused the game.", "The host paused the game.", "The host resumed the game."]);
    expect((await admin("/log")).body.log.map((e: any) => e.action)).toEqual(["Resumed a table", "Paused a table", "Paused a table"]);
  });

  it("is for the admin only, a table that is going, and one that exists", async () => {
    const { admin, id, phone } = await dealt();
    expect((await admin(`/tables/${id}/pause`, {}, null)).status).toBe(401);
    expect((await admin(`/tables/${id}/pause`, {}, "guess")).status).toBe(401);
    expect((await admin(`/tables/${id}/resume`, {}, "guess")).status).toBe(401);
    expect((await admin("/tables/nosuch/pause", {})).status).toBe(404);
    // A player can't pause a table, by any route.
    const stranger = phone();
    expect((await stranger(`/rooms/${id}/pause`, {})).status).not.toBe(200);
    expect((await stranger(`/moderation/tables/${id}/pause`, {})).status).toBe(401);
    // A table not yet dealt, and a closed one.
    const grammi = phone();
    const fresh = (await grammi("/rooms", PALACE)).body.id as string;
    const early = await admin(`/tables/${fresh}/pause`, {});
    expect(early.status).toBe(409);
    expect(early.body.error).toBe("The game hasn't started.");
    await admin(`/tables/${id}/close`, { reason: "done" });
    expect((await admin(`/tables/${id}/pause`, {})).status).toBe(409);
  });
});

describe("playing a seat's turn", () => {
  it("needs the table paused", async () => {
    const { admin, id } = await dealt();
    const r = await admin(`/tables/${id}/play-for`, { seat: 0 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Pause the table first.");
  });

  it("plays what the game's computer player would, as the host, and tells the table", async () => {
    const { admin, grammi, id } = await dealt();
    await admin(`/tables/${id}/pause`, { reason: "Grammi stepped away" });
    const before = JSON.stringify((await grammi(`/rooms/${id}`)).body.summary);
    // Whichever seat can move does; the other has nothing to play.
    const answers = [await admin(`/tables/${id}/play-for`, { seat: 0 }), await admin(`/tables/${id}/play-for`, { seat: 1 })];
    const moved = answers.filter((a) => a.status === 200);
    expect(moved.length).toBeGreaterThanOrEqual(1);
    for (const a of answers.filter((x) => x.status !== 200)) expect(a.status).toBe(409);
    expect(JSON.stringify((await grammi(`/rooms/${id}`)).body.summary)).not.toBe(before);
    // Still held: the players can't move, and the table was told whose turn the host played.
    expect((await grammi(`/rooms/${id}`)).body.paused).toBeTruthy();
    expect((await grammi(`/rooms/${id}/act`, { move: { type: "ready" } })).status).toBe(423);
    const chat = (await admin(`/tables/${id}`)).body.chat.map((m: any) => m.text);
    expect(chat.some((t: string) => /^The host played a turn for (Grammi|Rowdy)\.$/.test(t))).toBe(true);
    expect((await admin("/log")).body.log.some((e: any) => e.action === "Played a turn for a seat")).toBe(true);
  });

  it("refuses a seat that doesn't exist, and a table that doesn't", async () => {
    const { admin, id } = await dealt();
    await admin(`/tables/${id}/pause`, {});
    expect((await admin(`/tables/${id}/play-for`, { seat: 9 })).body.error).toBe("No such seat.");
    expect((await admin(`/tables/${id}/play-for`, { seat: "x" })).status).toBe(409);
    expect((await admin("/tables/nosuch/play-for", { seat: 0 })).status).toBe(404);
  });
});
