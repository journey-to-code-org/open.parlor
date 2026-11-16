// Road to the Shootout in a house: a member's garage kept by the house, and the marketplace where
// pieces and cars pass between members, with the scrappers in it.
import { memoryLog } from "@zubra/sync/server";
import { garageAct, giveCar, newGarage, pieceWorth, settleUp, type GarageState } from "@journey-to-code/games";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { createGarages } from "../src/garages.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

async function house() {
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
  const owner = phone();
  const made = (await owner("/houses", { name: "The Parts Store", you: "McMikey" })).body;
  const friend = phone();
  await friend(`/houses/${made.slug}/join`, { code: made.code, name: "Dubs" });
  return { owner, friend, stranger: phone(), at: `/houses/${made.slug}` };
}

/** A garage with tools, money, and a car torn down on to the shelf. */
function stocked(seed: number): GarageState {
  const g = newGarage(seed);
  settleUp(g, 5000);
  for (const tool of ["jack", "wrenches"]) garageAct(g, { cmd: "tool", tool });
  garageAct(g, { cmd: "strip", car: giveCar(g, { model: 5, engine: 800, rubber: 700, parts: { exhaust: 2 } }, true)!.id });
  giveCar(g, { model: 0, engine: 600, rubber: 600, name: "The Turd" }, true);
  return JSON.parse(JSON.stringify(g));
}

describe("a garage kept by a house", () => {
  it("is saved and fetched by its member only, and refuses a save made from an older one", async () => {
    const { owner, friend, stranger, at } = await house();
    expect((await owner(`${at}/garage`)).body).toEqual({ state: null, rev: 0 });
    const g = stocked(1);
    expect((await owner(`${at}/garage`, { state: g, rev: 0 })).body).toEqual({ rev: 1 });
    expect((await owner(`${at}/garage`)).body).toMatchObject({ rev: 1, state: { cash: g.cash } });
    expect((await friend(`${at}/garage`)).body).toEqual({ state: null, rev: 0 });
    // Another device, still on the first save.
    const stale = await owner(`${at}/garage`, { state: { ...g, cash: 1 }, rev: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ rev: 1, state: { cash: g.cash } });
    expect((await owner(`${at}/garage`, { state: { ...g, cash: 99 }, rev: 1 })).body).toEqual({ rev: 2 });
    expect((await owner(`${at}/garage`, { state: { v: 1, cars: "none" }, rev: 2 })).status).toBe(400);
    expect((await stranger(`${at}/garage`)).status).toBe(403);
    expect((await stranger(`${at}/market`)).status).toBe(403);
  });

  it("shows the house what everybody has, quickest car first, and never the garage itself", async () => {
    const { owner, friend, at } = await house();
    await owner(`${at}/garage`, { state: stocked(1), rev: 0 });
    const quick = newGarage(2);
    giveCar(quick, { model: 11, engine: 1000, rubber: 1000, name: "Poster" }, true);
    await friend(`${at}/garage`, { state: JSON.parse(JSON.stringify(quick)), rev: 0 });
    const seen = (await owner(`${at}/garages`)).body.garages;
    expect(seen.map((x: { name: string }) => x.name)).toEqual(["Dubs", "McMikey"]);
    expect(seen[0].cars[0]).toMatchObject({ name: "Poster", tier: "Sought after" });
    expect(seen[1]).toMatchObject({ me: true });
    expect(JSON.stringify(seen)).not.toContain("cash");
  });
});

describe("the marketplace between a house's garages", () => {
  it("moves a piece from one shelf to a listing to another shelf, and the money to the seller", async () => {
    const { owner, friend, at } = await house();
    const mine = stocked(1);
    await owner(`${at}/garage`, { state: mine, rev: 0 });
    const theirs = newGarage(2);
    settleUp(theirs, 2000);
    await friend(`${at}/garage`, { state: JSON.parse(JSON.stringify(theirs)), rev: 0 });
    const piece = mine.shelf.find((p) => p.kind === "gearbox")!;
    // Not from a garage that has moved on.
    expect((await owner(`${at}/market`, { do: "list", rev: 0, piece: piece.id, price: 400 })).status).toBe(409);
    const listed = await owner(`${at}/market`, { do: "list", rev: 1, piece: piece.id, price: 400 });
    expect(listed.status).toBe(200);
    expect(listed.body.rev).toBe(2);
    expect(listed.body.state.shelf.some((p: { id: number }) => p.id === piece.id)).toBe(false);
    expect((await owner(`${at}/market`, { do: "list", rev: 2, piece: piece.id, price: 400 })).status).toBe(400);
    const lot = (await friend(`${at}/market`)).body.lots.find((l: { mine: boolean; scrapper: boolean }) => !l.mine && !l.scrapper);
    expect(lot).toMatchObject({ seller: "McMikey", price: 400, piece: { kind: "gearbox", name: "Gearbox" } });
    expect((await owner(`${at}/market`, { do: "buy", rev: 2, id: lot.id })).status).toBe(400);
    const bought = await friend(`${at}/market`, { do: "buy", rev: 1, id: lot.id });
    expect(bought.body).toMatchObject({ rev: 2, bought: "Gearbox", state: { cash: theirs.cash - 400 } });
    expect(bought.body.state.shelf).toHaveLength(1);
    expect((await friend(`${at}/market`, { do: "buy", rev: 2, id: lot.id })).status).toBe(409);
    // The seller is owed, and collects.
    expect((await owner(`${at}/market`)).body.waiting).toBe(400);
    const paid = await owner(`${at}/market`, { do: "collect", rev: 2 });
    expect(paid.body).toMatchObject({ rev: 3, waiting: 0, sales: [{ amount: 400, from: "Dubs", what: "Gearbox" }], state: { cash: mine.cash + 400 } });
    expect((await owner(`${at}/market`, { do: "collect", rev: 3 })).body).toMatchObject({ rev: 3, sales: [] });
  });

  it("sells a whole car, and takes back what nobody bought", async () => {
    const { owner, friend, at } = await house();
    const mine = stocked(1);
    await owner(`${at}/garage`, { state: mine, rev: 0 });
    const theirs = newGarage(2);
    settleUp(theirs, 2000);
    await friend(`${at}/garage`, { state: JSON.parse(JSON.stringify(theirs)), rev: 0 });
    const car = mine.cars[0]!;
    const listed = await owner(`${at}/market`, { do: "list", rev: 1, car: car.id, price: 700 });
    expect(listed.body.state.cars).toEqual([]);
    const lot = listed.body.lots.find((l: { mine: boolean }) => l.mine);
    expect(lot.car).toMatchObject({ name: "The Turd", runs: true });
    // Changed their mind.
    const back = await owner(`${at}/market`, { do: "unlist", rev: 2, id: lot.id });
    expect(back.body.state.cars).toHaveLength(1);
    expect(back.body.state.slipsWon).toBe(0);
    const again = await owner(`${at}/market`, { do: "list", rev: 3, car: back.body.state.cars[0].id, price: 700 });
    const id = again.body.lots.find((l: { mine: boolean }) => l.mine).id;
    const bought = await friend(`${at}/market`, { do: "buy", rev: 1, id });
    expect(bought.body.state.cars[0]).toMatchObject({ name: "The Turd", engine: 600 });
    expect(bought.body.state.slipsWon).toBe(0);
    expect((await owner(`${at}/market`, { do: "unlist", rev: 4, id })).status).toBe(409);
    expect((await friend(`${at}/market`, { do: "list", rev: 2, price: 3 })).status).toBe(400);
  });
});

describe("the scrappers in a house's market", () => {
  const members = [{ id: "a", name: "McMikey" }, { id: "b", name: "Dubs" }];
  function setup() {
    const docs = new Map<string, Record<string, unknown>>();
    const garages = createGarages({
      write: async (collection, key, fields) => void docs.set(`${collection}/${key}`, JSON.parse(JSON.stringify(fields))),
      documents: async () => ({ get: (collection, key) => docs.get(`${collection}/${key}`) }),
    });
    const ask = (who: number, action: string, method: string, input: Record<string, unknown>, now: number) => garages.handle({ slug: "store", members }, members[who]!, action, method, input, now);
    return { ask };
  }
  const T = 1_800_000_000_000;

  it("put six pieces up a day, Ricky three of them, priced by somebody who knows", async () => {
    const { ask } = setup();
    const lots = ((await ask(0, "market", "GET", {}, T)).body as { lots: { seller: string; scrapper: boolean; price: number; piece: { worth: number } }[] }).lots;
    expect(lots).toHaveLength(6);
    expect(lots.every((l) => l.scrapper)).toBe(true);
    expect(lots.filter((l) => l.seller === "Ricky at Rix Racing")).toHaveLength(3);
    for (const l of lots) expect(l.price).toBeGreaterThanOrEqual(l.piece.worth * 0.9);
    // The same stock all day, and a new lot of it tomorrow.
    const later = ((await ask(1, "market", "GET", {}, T + 3_600_000)).body as { lots: { id: string }[] }).lots;
    expect(later.map((l) => l.id).sort()).toEqual(lots.map((l) => (l as unknown as { id: string }).id).sort());
    const tomorrow = ((await ask(1, "market", "GET", {}, T + 86_400_000)).body as { lots: { id: string }[] }).lots;
    expect(tomorrow).toHaveLength(6);
    expect(tomorrow.some((l) => later.some((x) => x.id === l.id))).toBe(false);
  });

  it("sell a piece to a member, and buy one a member has priced too low", async () => {
    const { ask } = setup();
    const g = stocked(3);
    settleUp(g, 50_000);
    await ask(0, "garage", "POST", { state: g, rev: 0 }, T);
    const stock = ((await ask(0, "market", "GET", {}, T)).body as { lots: { id: string; price: number }[] }).lots[0]!;
    const bought = (await ask(0, "market", "POST", { do: "buy", rev: 1, id: stock.id }, T)).body as { state: GarageState; rev: number; waiting: number };
    expect(bought.state.cash).toBe(g.cash - stock.price);
    expect(bought.state.shelf).toHaveLength(g.shelf.length + 1);
    // One priced fairly sits; one priced at half its worth is gone in ten minutes, to a scrapper.
    const [fair, cheap] = bought.state.shelf.filter((p) => pieceWorth(p) >= 100);
    let rev = bought.rev;
    rev = ((await ask(0, "market", "POST", { do: "list", rev, piece: fair!.id, price: pieceWorth(fair!) }, T)).body as { rev: number }).rev;
    rev = ((await ask(0, "market", "POST", { do: "list", rev, piece: cheap!.id, price: Math.floor(pieceWorth(cheap!) / 2) }, T)).body as { rev: number }).rev;
    const soon = (await ask(0, "market", "GET", {}, T + 5 * 60_000)).body as { lots: { mine: boolean }[]; waiting: number };
    expect([soon.lots.filter((l) => l.mine).length, soon.waiting]).toEqual([2, 0]);
    const after = (await ask(0, "market", "GET", {}, T + 11 * 60_000)).body as { lots: { mine: boolean }[]; waiting: number };
    expect([after.lots.filter((l) => l.mine).length, after.waiting]).toEqual([1, Math.floor(pieceWorth(cheap!) / 2)]);
    const paid = (await ask(0, "market", "POST", { do: "collect", rev }, T + 12 * 60_000)).body as { sales: { from: string }[] };
    expect(["Ricky at Rix Racing", "Junkyard Dale", "Patty's Parts Barn", "Two-Bay Tony"]).toContain(paid.sales[0]!.from);
  });
});
