// A table's chat, in the parlor's chat (open.chat): the seated talk, anyone at the table reads along
// live, the computer players and the host have their say, and nobody's cookie goes out with it.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

async function table() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5, talk: false, adminToken: "host" });
  open.push(app);
  const phone = (headers: Record<string, string> = {}) => {
    let cookie = "";
    const call = async (path: string, body?: unknown) => {
      const response = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: BASE, cookie, ...headers }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: response.status, body: await response.json() };
    };
    return Object.assign(call, { cookie: () => cookie });
  };
  const grammi = phone();
  const rowdy = phone();
  const { id } = (await grammi("/rooms", { options: {} })).body;
  await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
  await rowdy(`/rooms/${id}/sit`, { seat: 1, name: "Rowdy" });
  await grammi(`/rooms/${id}/bot`, { seat: 2, name: "Dot" });
  const admin = (path: string, body?: unknown) => phone({ authorization: "Bearer host" })(`/moderation${path}`, body);
  /** The table's room as a page following it live gets it: its latest messages. */
  const live = async (who: ReturnType<typeof phone>) => {
    const changes = (await who("/_zb/chat/pull?since=0")).body.changes as { collection: string; key: string; field: string; value: unknown }[];
    return changes.filter((c) => c.collection === "chats" && c.key === `table:${id}` && c.field === "messages").at(-1)?.value as { by: string; name: string; text: string; bot?: true; notice?: true }[] | undefined;
  };
  return { app, id: id as string, chat: `/rooms/${id}/chat`, grammi, rowdy, watcher: phone(), phone, admin, live };
}

describe("a table's chat", () => {
  it("is for whoever is seated to talk in, each as their seat", async () => {
    const { chat, grammi, rowdy, watcher } = await table();
    expect((await grammi(chat, { text: "  Good luck,\n all  " })).status).toBe(201);
    const seen = (await rowdy(chat)).body;
    expect(seen.messages).toEqual([expect.objectContaining({ by: "seat:0", name: "Grammi", text: "Good luck, all", mine: false })]);
    // Nobody's cookie goes out with what they said, or with who's here.
    expect(JSON.stringify(seen)).not.toContain(grammi.cookie().split("=")[1]);
    expect(seen.here).toEqual(expect.arrayContaining(["seat:1"]));
    // Someone without a seat reads along, but doesn't talk.
    expect((await watcher(chat, { text: "Hi" })).status).toBe(403);
    expect((await watcher(chat)).status).toBe(403);
    expect((await watcher("/rooms/nosuch/chat", { text: "Hi" })).status).toBe(404);
  });

  it("is followed live by anyone at the table, seated or watching, and written by nobody but the server", async () => {
    const { id, grammi, watcher, phone, live } = await table();
    await grammi(`/rooms/${id}/chat`, { text: "Hello" });
    expect(await live(watcher)).toEqual([expect.objectContaining({ by: "seat:0", text: "Hello" })]);
    expect(await live(grammi)).toHaveLength(1);
    const push = await phone()("/_zb/chat/push", { changes: [{ collection: "chats", key: `table:${id}`, field: "messages", value: [] }] });
    expect(push.status).toBeGreaterThanOrEqual(400);
    expect(await live(grammi)).toHaveLength(1);
  });

  it("has the computer players' words, the challenge's and the host's, as the server's own", async () => {
    const { app, id, chat, grammi, admin, live } = await table();
    // A computer player says its line as its seat; a person's words can be sent for them (a challenge's message).
    expect(await app.tables.say(id, 2, "Ready when you are, sugar")).toMatchObject({ seat: 2, name: "Dot", bot: true });
    expect(await app.tables.say(id, 1, "Bring it on")).toMatchObject({ seat: 1, name: "Rowdy", bot: false });
    expect(await app.tables.say(id, 3, "Nobody's here")).toBe("No such seat.");
    // The host's notice is no one's.
    await grammi(`/rooms/${id}/bot`, { seat: 3, name: "Lou" });
    expect((await grammi(`/rooms/${id}/start`, {})).status).toBe(200);
    expect((await admin(`/tables/${id}/pause`, { reason: "Tea break" })).status).toBe(200);
    const said = await live(grammi);
    expect(said?.map((m) => [m.by, m.name, m.text, m.bot === true, m.notice === true])).toEqual([
      ["seat:2", "Dot", "Ready when you are, sugar", true, false],
      ["seat:1", "Rowdy", "Bring it on", false, false],
      ["", "", "The host paused the game: Tea break", false, true],
    ]);
    expect((await grammi(chat)).body.messages.at(-1)).toMatchObject({ notice: true });
  });

  it("closes with its table, and says why", async () => {
    const { id, chat, grammi, admin } = await table();
    await grammi(chat, { text: "Before" });
    await admin(`/tables/${id}/close`, { reason: "Keep it friendly." });
    expect(await grammi(chat, { text: "After" })).toEqual({ status: 410, body: { error: "Keep it friendly." } });
    // What was said before can still be read.
    expect((await grammi(chat)).body.messages.map((m: { text: string }) => m.text)).toEqual(["Before"]);
  });

  it("still takes /say from a page loaded before, and answers with the message as it was", async () => {
    const { id, grammi, rowdy } = await table();
    const said = await rowdy(`/rooms/${id}/say`, { text: "hi there" });
    expect(said).toEqual({ status: 200, body: { id: 1, seat: 1, name: "Rowdy", text: "hi there", at: expect.any(Number), bot: false } });
    expect((await grammi(`/rooms/${id}/say`, { text: "" })).status).toBe(400);
    expect((await grammi(`/rooms/${id}/say`)).status).toBe(404);
  });

  it("is answered on Node's http path too, body and all", async () => {
    const { app, id, grammi, rowdy } = await table();
    let status = 0;
    let body = "";
    const sent = Buffer.from(JSON.stringify({ text: "From Node" }));
    const req = Object.assign((async function* () { yield sent; })(), { url: `/rooms/${id}/chat`, method: "POST", headers: { cookie: grammi.cookie(), "content-type": "application/json" } });
    const res = { writeHead: (s: number) => void (status = s), end: (b: Buffer) => void (body = b.toString()), setHeader: () => {} };
    expect(await app.handle(req as never, res as never)).toBe(true);
    expect(status).toBe(201);
    expect(JSON.parse(body).messages.at(-1)).toMatchObject({ text: "From Node", mine: true });
    expect((await rowdy(`/rooms/${id}/chat`)).body.messages.map((m: { text: string }) => m.text)).toEqual(["From Node"]);
  });
});
