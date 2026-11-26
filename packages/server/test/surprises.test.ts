// Peekaboo's surprise box: sent from one phone, waiting on the baby's, opened, and the sender told.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { AUDIO_LIMIT, WAITING_LIMIT } from "../src/surprises.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((a) => a.close());
  open = [];
});

function server() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 50, talk: false });
  open.push(app);
  return async (path: string, body?: unknown) => {
    const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })))!;
    return { status: r.status, body: (await r.json()) as Record<string, any> };
  };
}

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const VOICE = "data:audio/webm;codecs=opus;base64,GkXfo0AgQoaBAUL3gQE=";

describe("the surprise box", () => {
  it("carries a surprise from Grammi's phone to the baby's, and tells her when it's opened", async () => {
    const ask = server();
    const made = await ask("/surprises/boxes", {});
    expect(made.status).toBe(201);
    const { box, key } = made.body;

    const sent = await ask(`/surprises/${box}`, { from: "Grammi", sender: "grammi-phone", picture: "animals:duck", photo: PHOTO, audio: VOICE, note: "Look, a duck!" });
    expect(sent.status).toBe(201);

    const waiting = await ask(`/surprises/boxes/${box}?key=${key}`);
    expect(waiting.body.waiting).toEqual([expect.objectContaining({ id: sent.body.id, from: "Grammi", picture: "animals:duck", photo: PHOTO, audio: VOICE, note: "Look, a duck!" })]);

    let hers = await ask(`/surprises/${box}/sent?sender=grammi-phone`);
    expect(hers.body.sent).toEqual([expect.objectContaining({ id: sent.body.id, opened: 0, photo: true })]);
    expect(hers.body.sent[0].audio).toBeUndefined();

    expect((await ask(`/surprises/boxes/${box}/${sent.body.id}/opened`, { key })).status).toBe(200);
    expect((await ask(`/surprises/boxes/${box}?key=${key}`)).body.waiting).toEqual([]);
    hers = await ask(`/surprises/${box}/sent?sender=grammi-phone`);
    expect(hers.body.sent[0].opened).toBeGreaterThan(0);
    // Someone else's sends aren't hers to see.
    expect((await ask(`/surprises/${box}/sent?sender=someone-else`)).body.sent).toEqual([]);
  });

  it("keeps the box to its own device", async () => {
    const ask = server();
    const { box } = (await ask("/surprises/boxes", {})).body;
    expect((await ask(`/surprises/boxes/${box}?key=wrong`)).status).toBe(403);
    expect((await ask(`/surprises/boxes/${box}/x/opened`, { key: "wrong" })).status).toBe(403);
  });

  it("refuses what isn't a picture, a photo or a voice", async () => {
    const ask = server();
    const { box } = (await ask("/surprises/boxes", {})).body;
    const send = (extra: Record<string, unknown>) => ask(`/surprises/${box}`, { from: "Grammi", sender: `s${Math.random()}`, ...extra });
    expect((await send({})).status).toBe(400);
    expect((await send({ photo: "javascript:alert(1)" })).status).toBe(400);
    expect((await send({ photo: "data:text/html;base64,PHNjcmlwdD4=" })).status).toBe(400);
    expect((await send({ picture: "animals:cow", audio: "data:audio/webm;base64," + "A".repeat(AUDIO_LIMIT) })).status).toBe(400);
    expect((await ask(`/surprises/${box}`, { sender: "x", picture: "animals:cow" })).status).toBe(400);
    const named = await send({ picture: "animals:cow", from: "<b>Grammi</b>" });
    expect(named.status).toBe(201);
  });

  it("makes a sender wait a moment between sends, and holds only so many unopened", async () => {
    const ask = server();
    const { box } = (await ask("/surprises/boxes", {})).body;
    expect((await ask(`/surprises/${box}`, { from: "G", sender: "one", picture: "animals:cow" })).status).toBe(201);
    expect((await ask(`/surprises/${box}`, { from: "G", sender: "one", picture: "animals:cow" })).status).toBe(429);
    for (let i = 1; i < WAITING_LIMIT; i++) expect((await ask(`/surprises/${box}`, { from: "G", sender: `s${i}`, picture: "animals:cow" })).status).toBe(201);
    expect((await ask(`/surprises/${box}`, { from: "G", sender: "late", picture: "animals:cow" })).status).toBe(429);
  });

  it("stops an old link working once the box is closed, keeping what's inside", async () => {
    const ask = server();
    const { box, key } = (await ask("/surprises/boxes", {})).body;
    await ask(`/surprises/${box}`, { from: "G", sender: "one", picture: "animals:cow" });
    expect((await ask(`/surprises/boxes/${box}/close`, { key })).status).toBe(200);
    expect((await ask(`/surprises/${box}`, { from: "G", sender: "two", picture: "animals:cow" })).status).toBe(404);
    expect((await ask(`/surprises/boxes/${box}?key=${key}`)).body.waiting).toHaveLength(1);
  });
});
