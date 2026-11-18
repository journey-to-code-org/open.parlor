// The house's chat in the parlor: the plain store the screen is drawn from. The screen itself is
// Zubra components in a Vue island (house/HouseChat.vue).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openHouseChat, when, type ChatLook } from "../src/house/chat";
import type { HouseChat, HouseMessage } from "../src/housesApi";

const said = (id: number, name: string, mine = false): HouseMessage => ({ id, by: name.toLowerCase(), name, text: `line ${id}`, at: id * 1000, mine });

/** A house that answers as the server does: everything on a new rev, `{ rev, here }` on the one the page has. */
function house() {
  const state = { rev: 0, here: ["me"], messages: [] as HouseMessage[], down: false, asked: 0 };
  const whole = (): HouseChat => ({ rev: state.rev, here: [...state.here], messages: [...state.messages], canRemove: false, limit: 280, others: 2 });
  const api = {
    chat: async (_slug: string, rev?: number) => {
      state.asked += 1;
      if (state.down) throw new Error("offline");
      return rev === state.rev ? { rev: state.rev, here: [...state.here] } : whole();
    },
    say: async (_slug: string, text: string) => {
      if (text === "too much") throw new Error("Give the others a moment to answer.");
      state.messages.push({ ...said(state.messages.length + 1, "Me", true), text });
      state.rev += 1;
      return whole();
    },
    unsay: async (_slug: string, id: number) => {
      state.messages = state.messages.filter((m) => m.id !== id);
      state.rev += 1;
      return whole();
    },
  };
  const others = (...messages: HouseMessage[]) => {
    state.messages.push(...messages);
    state.rev += 1;
  };
  return { state, api, others };
}

const page = { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() };
beforeEach(() => {
  vi.useFakeTimers();
  page.visibilityState = "visible";
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const tick = () => vi.advanceTimersByTimeAsync(4000);

describe("the house's chat, as a page keeps it", () => {
  it("asks at once, then every few seconds, and tells its listeners only when something changed", async () => {
    const { state, api, others } = house();
    others(said(1, "Grammi"));
    const store = openHouseChat("parts", undefined, api);
    const looks: ChatLook[] = [];
    store.subscribe((look) => looks.push(look));
    expect(store.look()).toEqual({ chat: null, here: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(looks).toHaveLength(1);
    expect(store.look().chat?.messages.map((m) => m.id)).toEqual([1]);
    // Nothing new: asked again, nobody told.
    await tick();
    await tick();
    expect(state.asked).toBe(3);
    expect(looks).toHaveLength(1);
    // Somebody came in: told, with the same messages (the very same list, so nothing is drawn again).
    state.here = ["me", "grammi"];
    await tick();
    expect(looks).toHaveLength(2);
    expect(looks[1]!.here).toEqual(["me", "grammi"]);
    expect(looks[1]!.chat).toBe(looks[0]!.chat);
    others(said(2, "Grammi"));
    await tick();
    expect(looks.at(-1)!.chat!.messages.map((m) => m.id)).toEqual([1, 2]);
    store.stop();
  });

  it("makes a sound of what others say after the first look, never of one's own or of the history", async () => {
    const { api, others } = house();
    others(said(1, "Grammi"), said(2, "Dubs"));
    const heard: number[] = [];
    const store = openHouseChat("parts", (m) => heard.push(m.id), api);
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toEqual([]);
    expect(await store.say("Hello")).toBeNull();
    expect(heard).toEqual([]);
    others(said(4, "Grammi"), said(5, "Dubs"));
    await tick();
    expect(heard).toEqual([4, 5]);
    // Taking one down brings no sound, and neither does asking again.
    expect(await store.unsay(4)).toBeNull();
    await tick();
    expect(heard).toEqual([4, 5]);
    store.stop();
  });

  it("hands back what went wrong, and keeps what it had", async () => {
    const { state, api } = house();
    const store = openHouseChat("parts", undefined, api);
    await vi.advanceTimersByTimeAsync(0);
    expect(await store.say("too much")).toBe("Give the others a moment to answer.");
    await store.say("Hello");
    state.down = true;
    await tick();
    expect(store.look().chat?.messages).toHaveLength(1);
    store.stop();
  });

  it("doesn't ask while the page is hidden, offline, or after it has stopped", async () => {
    const { state, api } = house();
    const store = openHouseChat("parts", undefined, api);
    await vi.advanceTimersByTimeAsync(0);
    page.visibilityState = "hidden";
    await tick();
    page.visibilityState = "visible";
    vi.stubGlobal("navigator", { onLine: false });
    await tick();
    expect(state.asked).toBe(1);
    vi.stubGlobal("navigator", { onLine: true });
    await tick();
    expect(state.asked).toBe(2);
    store.stop();
    await tick();
    expect(state.asked).toBe(2);
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
