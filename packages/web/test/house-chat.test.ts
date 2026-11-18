// The house's chat in the parlor: the plain part under the screen. What was said arrives live
// through Zubra Sync (the <house-chat-feed> element); this sends what the person does, opens and
// closes the connection, and counts a poll's votes.
import { describe, expect, it, vi } from "vitest";
import { HOUSE_SYNC, openHouseChat, tally, when } from "../src/house/chat";
import type { HouseChat } from "../src/housesApi";

const answer = { rev: 1, here: [], messages: [], canRemove: false, filter: false, limit: 280, others: 2 } as HouseChat;

function setup(fail?: string) {
  const sent: unknown[][] = [];
  const op =
    (name: string) =>
    async (...args: unknown[]) => {
      sent.push([name, ...args]);
      if (fail) throw new Error(fail);
      return answer;
    };
  const api = { say: op("say"), unsay: op("unsay"), ask: op("ask"), vote: op("vote"), setChatFilter: op("filter") };
  const connection = { pull: vi.fn(async () => undefined), stop: vi.fn() };
  const open = vi.fn(() => connection);
  return { sent, connection, open, chat: openHouseChat("parts", { api, open }) };
}

describe("the house's chat, as a page keeps it", () => {
  it("follows the houses' chats on their own Sync server, with one connection for the page that every house shares and nothing stops", () => {
    const { open, connection, chat } = setup();
    expect(open).toHaveBeenCalledWith({ url: HOUSE_SYNC, scope: { housechat: true } });
    expect(HOUSE_SYNC).toBe("/_zb/house");
    chat.stop();
    const again = openHouseChat("other-house", { api: {} as never, open });
    again.stop();
    expect(open).toHaveBeenCalledOnce();
    expect(connection.stop).not.toHaveBeenCalled();
  });

  it("sends what the person does, and pulls once after each, so it shows while the live stream reconnects", async () => {
    const { sent, connection, chat } = setup();
    expect(await chat.say("Hello")).toBeNull();
    expect(await chat.ask("Tonight?", ["Yes", "No"])).toBeNull();
    expect(await chat.vote(3, 1)).toBeNull();
    expect(await chat.vote(3, null)).toBeNull();
    expect(await chat.unsay(2)).toBeNull();
    expect(await chat.setFilter(true)).toBeNull();
    expect(sent).toEqual([
      ["say", "parts", "Hello"],
      ["ask", "parts", "Tonight?", ["Yes", "No"]],
      ["vote", "parts", 3, 1],
      ["vote", "parts", 3, null],
      ["unsay", "parts", 2],
      ["filter", "parts", true],
    ]);
    expect(connection.pull).toHaveBeenCalledTimes(6);
  });

  it("hands back what went wrong, and pulls nothing then", async () => {
    const { connection, chat } = setup("Give the others a moment to answer.");
    expect(await chat.say("too much")).toBe("Give the others a moment to answer.");
    expect(connection.pull).not.toHaveBeenCalled();
  });

  it("sends nothing once it has stopped", async () => {
    const { sent, chat } = setup();
    chat.stop();
    expect(await chat.say("Anyone?")).toBe("The chat has closed.");
    expect(sent).toEqual([]);
  });
});

describe("a poll", () => {
  it("counts each member's one vote, and knows which is this member's", () => {
    const poll = { options: ["Spades", "Palace", "Hearts"], votes: { a: 1, b: 1, c: 0, me: 1, stale: 7 } };
    expect(tally(poll, "me")).toEqual({ counts: [1, 3, 0], total: 4, mine: 1 });
    expect(tally(poll, "nobody").mine).toBeNull();
    expect(tally({ options: ["Yes", "No"], votes: {} }, "me")).toEqual({ counts: [0, 0], total: 0, mine: null });
  });
});

describe("when a message was said", () => {
  const now = new Date(2026, 10, 17, 22, 0).getTime();
  it("is a time today, a day and a time this week, and a date before that", () => {
    expect(when(new Date(2026, 10, 17, 15, 42).getTime(), now)).toMatch(/3:42/);
    expect(when(new Date(2026, 10, 15, 15, 42).getTime(), now)).toMatch(/Sun.*3:42/);
    expect(when(new Date(2026, 10, 3, 15, 42).getTime(), now)).toMatch(/Nov 3|3 Nov/);
  });
});
