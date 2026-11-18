// A house's own chat: said and read by its members only, kept short, taken down by whoever said
// it or by the house's owner and admins, and a buzz for the members who aren't looking.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { playerRef } from "../src/moderation.js";
import { createHouseChat, KEPT, LOOKING, MESSAGE_LIMIT } from "../src/housechat.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: "k", auth: "a" } });

function setup() {
  const sent: { to: string; notice: { title: string; body: string; url: string; tag?: string } }[] = [];
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5, talk: false, adminToken: "host", push: { send: async (s, payload) => void sent.push({ to: s.endpoint, notice: JSON.parse(payload) }) } });
  open.push(app);
  const phone = () => {
    let cookie = "";
    const call = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const response = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie, ...headers }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: response.status, body: await response.json() };
    };
    return Object.assign(call, { cookie: () => cookie.split("=")[1] ?? "" });
  };
  return { phone, sent };
}

async function house() {
  const { phone, sent } = setup();
  const owner = phone();
  const made = (await owner("/houses", { name: "The Parts Store", you: "McMikey" })).body;
  const friend = phone();
  await friend(`/houses/${made.slug}/join`, { code: made.code, name: "Dubs" });
  const third = phone();
  await third(`/houses/${made.slug}/join`, { code: made.code, name: "Grammi" });
  return { slug: made.slug as string, chat: `/houses/${made.slug}/chat`, made, owner, friend, third, stranger: phone(), sent, phone };
}

describe("a house's chat", () => {
  it("is one conversation for everyone in the house", async () => {
    const { chat, owner, friend, third } = await house();
    expect((await owner(chat)).body).toMatchObject({ rev: 0, here: [expect.any(String)], messages: [], canRemove: true, limit: MESSAGE_LIMIT, others: 2 });
    const said = await owner(chat, { text: "  Spades at\n eight?  " });
    expect(said.status).toBe(201);
    await friend(chat, { text: "I'm in" });
    const seen = (await third(chat)).body;
    expect(seen.canRemove).toBe(false);
    expect(seen.messages.map((m: { name: string; text: string; mine: boolean }) => [m.name, m.text, m.mine])).toEqual([
      ["McMikey", "Spades at eight?", false],
      ["Dubs", "I'm in", false],
    ]);
    expect((await friend(chat)).body.messages.map((m: { mine: boolean }) => m.mine)).toEqual([false, true]);
    // Nothing of anyone's cookie goes out with it.
    expect(Object.keys(seen.messages[0]).sort()).toEqual(["at", "by", "id", "mine", "name", "text"]);
  });

  it("answers in a few bytes when there is nothing new", async () => {
    const { chat, owner, friend } = await house();
    await owner(chat, { text: "Anyone about?" });
    const { rev } = (await friend(chat)).body;
    expect(Object.keys((await friend(`${chat}?rev=${rev}`)).body).sort()).toEqual(["here", "rev"]);
    await owner(chat, { text: "Hello?" });
    expect((await friend(`${chat}?rev=${rev}`)).body.messages).toHaveLength(2);
  });

  it("says who has the house's page open, and stops saying so when they have gone", async () => {
    let doc: Record<string, unknown> | undefined;
    const chat = createHouseChat({ write: async (_c, _k, fields) => void (doc = fields), documents: async () => ({ get: () => doc }) });
    const [mikey, dubs, grammi] = ["Mikey", "Dubs", "Grammi"].map((name, i) => ({ id: `m${i}`, player: `p${i}`, name, role: i ? ("member" as const) : ("owner" as const) }));
    const place = { slug: "parts", name: "The Parts Store", members: [mikey!, dubs!, grammi!] };
    const ask = async (who: typeof mikey, now: number, rev?: number) => ((await chat.handle(place, who!, "GET", {}, new URLSearchParams(rev === undefined ? "" : `rev=${rev}`), now)).body as { here: string[] }).here;
    // Alone at first: the one asking is always here.
    expect(await ask(mikey, 0)).toEqual(["m0"]);
    expect(await ask(grammi, 1000)).toEqual(["m0", "m2"]);
    // Told with "nothing new" too, in the house's order.
    expect(await ask(dubs, 2000, 0)).toEqual(["m0", "m1", "m2"]);
    // Mikey's page stopped asking; the others' didn't.
    await ask(grammi, LOOKING + 500);
    expect(await ask(dubs, LOOKING + 900, 0)).toEqual(["m1", "m2"]);
    // Saying something counts as being here.
    expect(((await chat.handle(place, mikey!, "POST", { text: "Back" }, new URLSearchParams(), LOOKING + 1000)).body as { here: string[] }).here).toEqual(["m0", "m1", "m2"]);
  });

  it("is for members only", async () => {
    const { slug, chat, owner, friend, stranger } = await house();
    await owner(chat, { text: "Family business" });
    expect((await stranger(chat)).status).toBe(403);
    expect((await stranger(chat, { text: "Hi" })).status).toBe(403);
    // Someone removed from the house can't read on or say more.
    const dubs = (await owner(`/houses/${slug}`)).body.members.find((m: { name: string }) => m.name === "Dubs").id;
    await owner(`/houses/${slug}/remove`, { member: dubs });
    expect((await friend(chat)).status).toBe(403);
    expect((await friend(chat, { text: "Still here" })).status).toBe(403);
    expect((await owner(chat)).body.messages).toHaveLength(1);
  });

  it("turns away nothing, too much, and too much at once", async () => {
    const { chat, owner } = await house();
    for (const text of ["", "   \n ", undefined, 7, "x".repeat(MESSAGE_LIMIT + 1)]) expect((await owner(chat, { text })).status).toBe(400);
    expect((await owner(chat, { text: "x".repeat(MESSAGE_LIMIT) })).status).toBe(201);
    for (let i = 0; i < 4; i++) expect((await owner(chat, { text: `and ${i}` })).status).toBe(201);
    const sixth = await owner(chat, { text: "and another" });
    expect(sixth.status).toBe(429);
    expect((await owner(chat)).body.messages).toHaveLength(5);
  });

  it("lets anyone take down their own message, and the owner or an admin anyone's", async () => {
    const { slug, chat, owner, friend, third } = await house();
    await owner(chat, { text: "one" });
    await friend(chat, { text: "two" });
    await third(chat, { text: "three" });
    const [one, two, three] = (await owner(chat)).body.messages.map((m: { id: number }) => m.id);
    expect((await friend(chat, { remove: one })).status).toBe(403);
    expect((await friend(chat, { remove: two })).body.messages.map((m: { text: string }) => m.text)).toEqual(["one", "three"]);
    expect((await owner(chat, { remove: three })).body.messages.map((m: { text: string }) => m.text)).toEqual(["one"]);
    // Taking down what is already gone changes nothing and is no error.
    const before = (await owner(chat)).body.rev;
    expect((await owner(chat, { remove: three })).body.rev).toBe(before);
    // An admin can, as the owner can.
    const dubs = (await owner(`/houses/${slug}`)).body.members.find((m: { name: string }) => m.name === "Dubs").id;
    await owner(`/houses/${slug}/role`, { member: dubs, role: "admin" });
    expect((await friend(chat)).body.canRemove).toBe(true);
    expect((await friend(chat, { remove: one })).body.messages).toEqual([]);
  });

  it("keeps the last messages only, and never gives an id out twice", async () => {
    const written: Record<string, unknown>[] = [];
    let doc: Record<string, unknown> | undefined;
    const chat = createHouseChat({
      write: async (_c, _k, fields) => void written.push((doc = fields)),
      documents: async () => ({ get: () => doc }),
    });
    const me = { id: "m1", player: "p1", name: "McMikey", role: "owner" as const };
    const place = { slug: "parts", name: "The Parts Store", members: [me] };
    for (let i = 0; i < KEPT + 5; i++) await chat.handle(place, me, "POST", { text: `line ${i}` }, new URLSearchParams(), i * 60_000);
    const { messages } = (await chat.handle(place, me, "GET", {}, new URLSearchParams())).body as { messages: { id: number; text: string }[] };
    expect(messages).toHaveLength(KEPT);
    expect(messages[0]!.text).toBe("line 5");
    await chat.handle(place, me, "POST", { remove: messages.at(-1)!.id }, new URLSearchParams());
    const again = (await chat.handle(place, me, "POST", { text: "after" }, new URLSearchParams(), 1e12)).body as { messages: { id: number }[] };
    expect(again.messages.at(-1)!.id).toBe(KEPT + 6);
  });

  it("buzzes the members who aren't looking, once for a conversation", async () => {
    const { chat, owner, friend, third, sent } = await house();
    for (const [who, n] of [[owner, 1], [friend, 2], [third, 3]] as const) await who("/push/subscribe", { subscription: sub(n) });
    // Grammi has the chat open; Dubs doesn't.
    await third(chat);
    await owner(chat, { text: "Spades at eight?" });
    await owner(chat, { text: "Bring snacks" });
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.map((s) => s.to)).toEqual(["https://push.example/2"]);
    expect(sent[0]!.notice).toMatchObject({ title: "McMikey at The Parts Store 💬", body: "Spades at eight?", tag: expect.stringContaining("house-chat-") });
    expect(sent[0]!.notice.url).toMatch(/^\/\?house=/);
  });

  it("is closed to a player the parlor has blocked", async () => {
    const { chat, friend, owner } = await house();
    expect((await friend(chat, { text: "Before" })).status).toBe(201);
    expect((await owner(`/moderation/players/${playerRef(friend.cookie())}/block`, {}, { authorization: "Bearer host" })).status).toBe(200);
    expect((await friend(chat, { text: "Let me in" })).status).toBe(403);
  });

  it("asks a question with a few answers, and keeps one vote per member, which they can change or take back", async () => {
    const { chat, owner, friend, third } = await house();
    for (const poll of [{ question: "", options: ["a", "b"] }, { question: "Tonight?", options: ["only one"] }, { question: "Tonight?", options: ["a", "b", "c", "d", "e"] }, { question: "Tonight?", options: ["Yes", "yes"] }, { question: "Tonight?", options: ["x".repeat(41), "b"] }, null]) {
      expect((await owner(chat, { poll })).status).toBe(400);
    }
    const asked = await owner(chat, { poll: { question: " Spades or\nPalace? ", options: ["Spades", " Palace ", ""] } });
    expect(asked.status).toBe(201);
    const poll = asked.body.messages.at(-1);
    expect(poll).toMatchObject({ text: "Spades or Palace?", poll: { options: ["Spades", "Palace"], votes: {} } });
    const ids = (await owner(`/houses/${chat.split("/")[2]}`)).body.members.map((m: { id: string }) => m.id);
    await friend(chat, { vote: { id: poll.id, option: 1 } });
    await third(chat, { vote: { id: poll.id, option: 1 } });
    await third(chat, { vote: { id: poll.id, option: 0 } });
    expect((await owner(chat)).body.messages.at(-1).poll.votes).toEqual({ [ids[1]]: 1, [ids[2]]: 0 });
    await third(chat, { vote: { id: poll.id, option: null } });
    expect((await owner(chat)).body.messages.at(-1).poll.votes).toEqual({ [ids[1]]: 1 });
    for (const option of [2, -1, 0.5, "0"]) expect((await friend(chat, { vote: { id: poll.id, option } })).status).toBe(400);
    // A vote on something that isn't a poll, or a poll that's gone.
    await owner(chat, { text: "Just talking" });
    const talk = (await owner(chat)).body.messages.at(-1).id;
    expect((await friend(chat, { vote: { id: talk, option: 0 } })).status).toBe(404);
    await owner(chat, { remove: poll.id });
    expect((await friend(chat, { vote: { id: poll.id, option: 0 } })).status).toBe(404);
  });

  it("covers crude words only when the owner or an admin turns that on, and only from then", async () => {
    const { chat, owner, friend } = await house();
    await friend(chat, { text: "well shit" });
    expect((await friend(chat, { filter: true })).status).toBe(403);
    expect((await owner(chat, { filter: "yes" })).status).toBe(400);
    expect((await owner(chat, { filter: true })).body.filter).toBe(true);
    await friend(chat, { text: "well shit again" });
    await friend(chat, { poll: { question: "Who is a bitch at cards?", options: ["Mikey", "Dubs"] } });
    const said = (await owner(chat)).body.messages.map((m: { text: string }) => m.text);
    expect(said).toEqual(["well shit", "well •••• again", "Who is a ••••• at cards?"]);
    await owner(chat, { filter: false });
    await friend(chat, { text: "shit" });
    expect((await owner(chat)).body.messages.at(-1).text).toBe("shit");
  });

  it("lets the parlor's host read a house's chat and take a message down, and logs it", async () => {
    const { slug, chat, owner, friend } = await house();
    const host = (path: string, body?: unknown) => owner(`/moderation${path}`, body, { authorization: "Bearer host" });
    await friend(chat, { text: "Something rude" });
    await owner(chat, { poll: { question: "Tonight?", options: ["Yes", "No"] } });
    expect((await friend(`/moderation/houses/${slug}/chat`)).status).toBe(401);
    const seen = (await host(`/houses/${slug}/chat`)).body;
    expect(seen.house.name).toBe("The Parts Store");
    expect(seen.messages.map((m: { text: string }) => m.text)).toEqual(["Something rude", "Tonight?"]);
    expect(seen.messages[1].poll).toEqual({ options: ["Yes", "No"], votes: 0 });
    const rude = seen.messages[0].id;
    expect((await host(`/houses/${slug}/chat-redact`, { id: rude })).status).toBe(200);
    expect((await host(`/houses/${slug}/chat-redact`, { id: rude })).status).toBe(404);
    expect((await friend(chat)).body.messages.map((m: { text: string }) => m.text)).toEqual(["Tonight?"]);
    const log = (await host("/log")).body.log[0];
    expect(log).toMatchObject({ action: "Removed a house chat message", target: "Dubs in The Parts Store" });
  });

  it("is followed live by the house's members only, and nobody but the server writes it", async () => {
    const { slug, chat, owner, stranger } = await house();
    await owner(chat, { text: "Spades at eight?" });
    const scope = encodeURIComponent(JSON.stringify({ housechat: slug }));
    const pulled = (await owner(`/_zb/house/pull?since=0&scope=${scope}`)).body;
    const fields = Object.fromEntries(pulled.changes.map((c: { field: string; value: unknown }) => [c.field, c.value]));
    expect(fields.messages.map((m: { text: string }) => m.text)).toEqual(["Spades at eight?"]);
    expect(pulled.changes.every((c: { collection: string; key: string }) => c.collection === "housechat" && c.key === slug)).toBe(true);
    // Nothing of the house's for someone outside it (a player of the parlor's, in a house of their own), nor of anything else for a member.
    await stranger("/houses", { name: "Elsewhere", you: "Stranger" });
    expect((await stranger(`/_zb/house/pull?since=0&scope=${scope}`)).body.changes).toEqual([]);
    expect((await owner("/_zb/house/pull?since=0")).body.changes.every((c: { collection: string }) => c.collection === "housechat")).toBe(true);
    // A page can't write it, member or not.
    const change = { collection: "housechat", key: slug, field: "messages", value: [], clock: `${String(Date.now()).padStart(15, "0")}-00000-x` };
    expect((await owner("/_zb/house/push", { changes: [change] }, { origin: BASE })).status).toBe(403);
    // And the rooms' own Sync server hands none of it out.
    expect((await owner("/_zb/sync/pull?since=0")).body.changes.some((c: { collection: string }) => c.collection === "housechat")).toBe(false);
  });

  it("buzzes nobody who is following the chat live", async () => {
    const { slug, chat, owner, friend, third, sent } = await house();
    for (const [who, n] of [[owner, 1], [friend, 2], [third, 3]] as const) await who("/push/subscribe", { subscription: sub(n) });
    // Grammi's page is open on the house, so her presence heartbeats arrive; a stranger's can't.
    const hello = await third(`/_zb/house/presence`, { room: `housechat/${slug}`, peer: "grammi-tab", state: { member: "x" } }, { origin: BASE });
    // Without a live stream the peer id isn't hers to speak as, but the heartbeat was let in first.
    expect([200, 403]).toContain(hello.status);
    await owner(chat, { text: "Spades at eight?" });
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.map((s) => s.to)).toEqual(["https://push.example/2"]);
  });

  it("starts empty in a new house that takes a deleted one's name", async () => {
    const { chat, owner, slug, phone } = await house();
    await owner(chat, { text: "The old house" });
    expect((await owner(`/moderation/houses/${slug}/delete`, {}, { authorization: "Bearer host" })).status).toBe(200);
    const next = phone();
    const made = (await next("/houses", { name: "The Parts Store", you: "Someone new" })).body;
    expect(made.slug).toBe(slug);
    expect((await next(`/houses/${made.slug}/chat`)).body.messages).toEqual([]);
  });
});
