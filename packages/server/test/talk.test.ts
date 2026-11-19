import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";

const BASE = "http://test";
let app: ReturnType<typeof createCardRoom> | null = null;
afterEach(() => app?.close());

/** What's been said at every table, as the tables' pages follow it live (the parlor's chat, `/_zb/chat`). */
const tableChats = (changes: { collection: string; key: string; field: string; value: unknown }[]) => {
  const latest = new Map<string, { by: string; text: string; bot?: true }[]>();
  for (const c of changes) if (c.collection === "chats" && c.key.startsWith("table:") && c.field === "messages") latest.set(c.key, c.value as never);
  return [...latest.values()].flat().map((m) => ({ seat: /^seat:\d+$/.test(m.by) ? Number(m.by.slice(5)) : -1, text: m.text, bot: m.bot === true }));
};

describe("bots at a real table", () => {
  it("say hello, answer when spoken to by name, and play on", async () => {
    app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 50 });
    let cookie = "";
    const send = async (path: string, body?: unknown) => {
      const r = (await app!.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return r.json();
    };
    const { id } = await send("/rooms", { options: {} });
    await send(`/rooms/${id}/sit`, { seat: 0, name: "brokennil" });
    for (const [seat, name] of [[1, "Hank"], [2, "Dot"], [3, "Lou"]] as const) await send(`/rooms/${id}/bot`, { seat, name });
    await send(`/rooms/${id}/start`, {});
    await send(`/rooms/${id}/say`, { text: "good luck Dot 🍀" });
    await new Promise((r) => setTimeout(r, 3000));

    const chat = tableChats((await send(`/_zb/chat/pull?since=0`)).changes);
    expect(chat[0]).toMatchObject({ seat: 0, text: "good luck Dot 🍀", bot: false });
    const dot = chat.filter((m) => m.seat === 2 && m.bot);
    expect(dot.length).toBeGreaterThan(0);
    // Bots also bid meanwhile: the game moved on without anyone waiting on chat.
    expect((await send(`/rooms/${id}`)).summary.phase).toBe("bidding");
  }, 10_000);
});
