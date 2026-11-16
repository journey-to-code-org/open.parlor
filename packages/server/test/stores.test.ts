// A member's idle game kept by their house: saved and fetched by that member only, refused when it
// was made from an older save, and shown to the rest of the house as a standing, never as itself.
import { memoryLog } from "@zubra/sync/server";
import { delbies } from "@journey-to-code/games";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

function setup() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5 });
  open.push(app);
  const phone = () => {
    let cookie = "";
    return async (path: string, body?: unknown) => {
      const response = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: response.status, body: await response.json() };
    };
  };
  return { phone };
}

const clock = { now: 1_800_000_000, minute: 9 * 60, day: 2 };
/** A store that has taken in about this many dollars. */
function store(dollars: number, hires: ("tommy" | "pluto")[] = []) {
  const s = delbies.newGame(1, clock);
  s.earned = dollars * 100;
  s.cash = dollars * 100;
  for (const who of hires) s.crew[who].hired = true;
  return JSON.parse(JSON.stringify(s));
}

async function house() {
  const { phone } = setup();
  const owner = phone();
  const made = (await owner("/houses", { name: "The Parts Store", you: "McMikey" })).body;
  const friend = phone();
  await friend(`/houses/${made.slug}/join`, { code: made.code, name: "Dubs" });
  return { slug: made.slug as string, owner, friend, stranger: phone() };
}

describe("a house's stores", () => {
  it("keeps a member's store and gives it back to them, on any device signed in to the house", async () => {
    const { slug, owner } = await house();
    expect((await owner(`/houses/${slug}/store?game=delbies`)).body).toEqual({ state: null, rev: 0 });
    const mine = store(1234, ["tommy"]);
    expect((await owner(`/houses/${slug}/store`, { game: "delbies", state: mine, rev: 0 })).body).toEqual({ rev: 1 });
    const back = (await owner(`/houses/${slug}/store?game=delbies`)).body;
    expect(back.rev).toBe(1);
    expect(back.state).toEqual(mine);
    expect(delbies.load(back.state)).not.toBeNull();
  });

  it("refuses a save made from an older one, and hands back the newer store", async () => {
    const { slug, owner } = await house();
    await owner(`/houses/${slug}/store`, { game: "delbies", state: store(100), rev: 0 });
    // Another device plays on from that save…
    expect((await owner(`/houses/${slug}/store`, { game: "delbies", state: store(900), rev: 1 })).body).toEqual({ rev: 2 });
    // …and this one, still on the first, is told so.
    const late = await owner(`/houses/${slug}/store`, { game: "delbies", state: store(150), rev: 1 });
    expect(late.status).toBe(409);
    expect(late.body.rev).toBe(2);
    expect(late.body.state.earned).toBe(90_000);
    expect((await owner(`/houses/${slug}/store?game=delbies`)).body.state.earned).toBe(90_000);
    // A first save over one that is already there is the same thing.
    expect((await owner(`/houses/${slug}/store`, { game: "delbies", state: store(5), rev: 0 })).status).toBe(409);
  });

  it("takes nothing that is not a store, and nothing from outside the house", async () => {
    const { slug, owner, stranger } = await house();
    for (const state of [null, {}, "store", { v: 3 }, { ...store(10), cash: -1 }, { ...store(10), v: 99 }]) {
      expect((await owner(`/houses/${slug}/store`, { game: "delbies", state, rev: 0 })).status).toBe(400);
    }
    expect((await owner(`/houses/${slug}/store`, { game: "hearts", state: store(10), rev: 0 })).status).toBe(400);
    expect((await owner(`/houses/${slug}/store?game=skyfire`)).status).toBe(400);
    expect((await stranger(`/houses/${slug}/store?game=delbies`)).status).toBe(403);
    expect((await stranger(`/houses/${slug}/store`, { game: "delbies", state: store(10), rev: 0 })).status).toBe(403);
    expect((await stranger(`/houses/${slug}/stores?game=delbies`)).status).toBe(403);
    expect((await owner(`/houses/${slug}/store?game=delbies`)).body).toEqual({ state: null, rev: 0 });
  });

  it("shows the house how its stores stand, biggest first, and nobody's store itself", async () => {
    const { slug, owner, friend } = await house();
    expect((await owner(`/houses/${slug}/stores?game=delbies`)).body).toEqual({ game: "delbies", stores: [] });
    await owner(`/houses/${slug}/store`, { game: "delbies", state: store(500, ["tommy"]), rev: 0 });
    await friend(`/houses/${slug}/store`, { game: "delbies", state: store(9000, ["tommy", "pluto"]), rev: 0 });
    const { stores } = (await owner(`/houses/${slug}/stores?game=delbies`)).body;
    expect(stores.map((s: { name: string }) => s.name)).toEqual(["Dubs", "McMikey"]);
    expect(stores[0]).toMatchObject({ me: false, score: 9000, crew: 2, perSecond: 250, moves: 0 });
    expect(stores[1]).toMatchObject({ me: true, score: 500, crew: 1 });
    expect(JSON.stringify(stores)).not.toContain("rng");
    expect(stores[0].state).toBeUndefined();
    // A member's own store is theirs alone: the friend's fetch gives the friend's.
    expect((await friend(`/houses/${slug}/store?game=delbies`)).body.state.earned).toBe(900_000);
  });

  it("keeps each house's stores apart", async () => {
    const { phone } = setup();
    const me = phone();
    const one = (await me("/houses", { name: "One", you: "Pluto" })).body;
    const two = (await me("/houses", { name: "Two", you: "Pluto" })).body;
    await me(`/houses/${one.slug}/store`, { game: "delbies", state: store(700), rev: 0 });
    expect((await me(`/houses/${two.slug}/store?game=delbies`)).body).toEqual({ state: null, rev: 0 });
    expect((await me(`/houses/${two.slug}/stores?game=delbies`)).body.stores).toEqual([]);
    expect((await me(`/houses/${one.slug}/stores?game=delbies`)).body.stores).toHaveLength(1);
  });

  it("passes a hotshot from one member to another, once, and not too often", async () => {
    const { slug, owner, friend, stranger } = await house();
    const seen = (await owner(`/houses/${slug}/network?game=delbies`)).body;
    expect(seen).toMatchObject({ waiting: 0, listings: [], hotshotWait: 0 });
    expect(seen.members.map((m: { name: string }) => m.name)).toEqual(["Dubs"]);
    const dubs = seen.members[0].id;
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "hotshot", to: "nobody" })).status).toBe(400);
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "hotshot", to: dubs })).body).toEqual({ to: "Dubs" });
    // The truck has only just gone.
    const again = await owner(`/houses/${slug}/network`, { game: "delbies", do: "hotshot", to: dubs });
    expect(again.status).toBe(429);
    expect(again.body.hotshotWait).toBeGreaterThan(800);
    expect((await owner(`/houses/${slug}/network?game=delbies`)).body.hotshotWait).toBeGreaterThan(800);
    // It waits for Dubs, and is Dubs's once collected.
    expect((await friend(`/houses/${slug}/network?game=delbies`)).body.waiting).toBe(1);
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "collect" })).body).toEqual({ parcels: [] });
    expect((await friend(`/houses/${slug}/network`, { game: "delbies", do: "collect" })).body).toEqual({ parcels: [{ what: "hotshot", from: "McMikey" }] });
    expect((await friend(`/houses/${slug}/network`, { game: "delbies", do: "collect" })).body).toEqual({ parcels: [] });
    expect((await stranger(`/houses/${slug}/network?game=delbies`)).status).toBe(403);
    expect((await stranger(`/houses/${slug}/network`, { game: "delbies", do: "collect" })).status).toBe(403);
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "dance" })).status).toBe(400);
    expect((await owner(`/houses/${slug}/network?game=hearts`)).status).toBe(400);
  });

  it("puts a member's tabs up for the house, sells them once, and tells the seller", async () => {
    const { slug, owner, friend } = await house();
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "list", amount: -5 })).status).toBe(400);
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "unlist" })).status).toBe(409);
    await owner(`/houses/${slug}/network`, { game: "delbies", do: "list", amount: 10_000 });
    // One lot each: listing again replaces it.
    await owner(`/houses/${slug}/network`, { game: "delbies", do: "list", amount: 40_000 });
    const mine = (await owner(`/houses/${slug}/network?game=delbies`)).body.listings;
    expect(mine).toMatchObject([{ name: "McMikey", amount: 40_000, mine: true }]);
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "buy", id: mine[0].id })).status).toBe(400);
    const theirs = (await friend(`/houses/${slug}/network?game=delbies`)).body.listings;
    expect(theirs).toMatchObject([{ name: "McMikey", amount: 40_000, mine: false }]);
    expect((await friend(`/houses/${slug}/network`, { game: "delbies", do: "buy", id: theirs[0].id })).body).toEqual({ from: "McMikey" });
    expect((await friend(`/houses/${slug}/network`, { game: "delbies", do: "buy", id: theirs[0].id })).status).toBe(409);
    expect((await friend(`/houses/${slug}/network?game=delbies`)).body.listings).toEqual([]);
    // Too late to take them back: the money is waiting instead.
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "unlist" })).status).toBe(409);
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "collect" })).body).toEqual({ parcels: [{ what: "sold", from: "Dubs" }] });
    // Taken back in time, nobody can buy them.
    await friend(`/houses/${slug}/network`, { game: "delbies", do: "list", amount: 7_000 });
    const lot = (await owner(`/houses/${slug}/network?game=delbies`)).body.listings[0].id;
    expect((await friend(`/houses/${slug}/network`, { game: "delbies", do: "unlist" })).status).toBe(200);
    expect((await owner(`/houses/${slug}/network`, { game: "delbies", do: "buy", id: lot })).status).toBe(409);
  });
});
