// Peekaboo's video calls: the server passes the handshake between the two sides, and nothing else.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { createCalls, WRONG_TRIES } from "../src/calls.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((a) => a.close());
  open = [];
});

function server(longPoll = 50) {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 50, talk: false, calls: { longPoll, ice: [{ urls: "stun:example.test" }] } });
  open.push(app);
  return async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined })))!;
    return { status: r.status, body: (await r.json()) as Record<string, any> };
  };
}

describe("a call's handshake", () => {
  it("carries messages each way, to the other side only", async () => {
    const ask = server();
    const started = await ask("/calls", {});
    expect(started.status).toBe(201);
    expect(started.body.code).toMatch(/^[a-z2-9]{8}$/);
    expect(started.body.ice).toEqual([{ urls: "stun:example.test" }]);
    const a = started.body;
    const b = (await ask(`/calls/${a.code}/join`, {})).body;
    expect(b.side).toBe("b");

    // a hears that b is there.
    const joined = await ask(`/calls/${a.code}/hear?side=a&token=${a.token}&after=0`);
    expect(joined.body.messages).toEqual([{ type: "joined", rejoin: false }]);

    await ask(`/calls/${a.code}/say`, { side: "a", token: a.token, message: { type: "offer", sdp: "v=0" } });
    const heard = await ask(`/calls/${a.code}/hear?side=b&token=${b.token}&after=0`);
    expect(heard.body.messages).toEqual([{ type: "offer", sdp: "v=0" }]);
    // Asking again after what was heard: nothing new, after the wait.
    const again = await ask(`/calls/${a.code}/hear?side=b&token=${b.token}&after=${heard.body.next}`);
    expect(again.body.messages).toEqual([]);
    expect(again.body.next).toBe(heard.body.next);

    await ask(`/calls/${a.code}/say`, { side: "b", token: b.token, message: { type: "answer", sdp: "v=0" } });
    const back = await ask(`/calls/${a.code}/hear?side=a&token=${a.token}&after=${joined.body.next}`);
    expect(back.body.messages).toEqual([{ type: "answer", sdp: "v=0" }]);
  });

  it("wakes a side that is waiting as soon as something arrives", async () => {
    const ask = server(5000);
    const a = (await ask("/calls", {})).body;
    const b = (await ask(`/calls/${a.code}/join`, {})).body;
    const started = Date.now();
    const waiting = ask(`/calls/${a.code}/hear?side=b&token=${b.token}&after=0`);
    await new Promise((r) => setTimeout(r, 30));
    await ask(`/calls/${a.code}/say`, { side: "a", token: a.token, message: { type: "candidate", candidate: "x" } });
    const heard = await waiting;
    expect(heard.body.messages).toEqual([{ type: "candidate", candidate: "x" }]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("refuses someone without the side's token", async () => {
    const ask = server();
    const a = (await ask("/calls", {})).body;
    await ask(`/calls/${a.code}/join`, {});
    expect((await ask(`/calls/${a.code}/say`, { side: "a", token: "nope", message: 1 })).status).toBe(403);
    expect((await ask(`/calls/${a.code}/hear?side=a&token=nope`)).status).toBe(403);
    expect((await ask(`/calls/${a.code}/hear?side=b&token=${a.token}`)).status).toBe(403);
  });

  it("lets the other side join again in place of the first, and tells the caller", async () => {
    const ask = server();
    const a = (await ask("/calls", {})).body;
    const first = (await ask(`/calls/${a.code}/join`, {})).body;
    const second = (await ask(`/calls/${a.code}/join`, {})).body;
    expect((await ask(`/calls/${a.code}/say`, { side: "b", token: first.token, message: 1 })).status).toBe(403);
    expect((await ask(`/calls/${a.code}/say`, { side: "b", token: second.token, message: 1 })).status).toBe(200);
    const heard = await ask(`/calls/${a.code}/hear?side=a&token=${a.token}&after=0`);
    expect(heard.body.messages).toEqual([{ type: "joined", rejoin: false }, { type: "joined", rejoin: true }, 1]);
  });

  it("ends the call for both when the caller hangs up", async () => {
    const ask = server();
    const a = (await ask("/calls", {})).body;
    const b = (await ask(`/calls/${a.code}/join`, {})).body;
    expect((await ask(`/calls/${a.code}/end`, { side: "a", token: a.token })).status).toBe(200);
    expect((await ask(`/calls/${a.code}/hear?side=b&token=${b.token}`)).status).toBe(404);
  });

  it("refuses a message too long, and a code that isn't one", async () => {
    const ask = server();
    const a = (await ask("/calls", {})).body;
    expect((await ask(`/calls/${a.code}/say`, { side: "a", token: a.token, message: "x".repeat(20_000) })).status).toBe(413);
    expect((await ask("/calls/zzzzzzzz/join", {})).status).toBe(404);
  });

  it("makes someone guessing codes wait", async () => {
    const calls = createCalls({ longPoll: 10 });
    const guess = (code: string) => calls.fetch(new Request(`${BASE}/calls/${code}/join`, { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" } }));
    for (let i = 0; i < WRONG_TRIES; i++) expect((await guess(`wrong${i}`))!.status).toBe(404);
    expect((await guess("wrongmore"))!.status).toBe(429);
  });

  it("forgets a call nobody has asked about for an hour", async () => {
    let clock = 0;
    const calls = createCalls({ longPoll: 10, now: () => clock });
    const start = await calls.fetch(new Request(`${BASE}/calls`, { method: "POST" }));
    const { code } = (await start!.json()) as { code: string };
    expect(calls.size).toBe(1);
    clock += 61 * 60_000;
    expect((await calls.fetch(new Request(`${BASE}/calls/${code}/join`, { method: "POST" })))!.status).toBe(404);
    expect(calls.size).toBe(0);
  });

  it("is answered by the parlor's own http server, not only its fetch", async () => {
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 50, talk: false, calls: { longPoll: 50 } });
    open.push(app);
    const http = createServer(async (req, res) => {
      if (!(await app.handle(req, res))) res.writeHead(404).end("not the app's");
    });
    await new Promise<void>((r) => http.listen(0, r));
    try {
      const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
      const r = await fetch(`${base}/calls`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect(r.status).toBe(201);
      const { code } = (await r.json()) as { code: string };
      expect((await fetch(`${base}/calls/${code}/join`, { method: "POST", body: "{}" })).status).toBe(200);
    } finally {
      http.close();
    }
  });
});
