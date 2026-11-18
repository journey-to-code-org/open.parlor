// Delbie's Stockroom: the sim as a module, and as a game. The first half checks the module does what
// it says (its tables, its commands, that the same game is the same game); the second plays whole
// months with simple bots, which is how the numbers in the C are kept honest: a change that makes
// doing nothing pay, or a price of twice the fair one, fails here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { PARTS, SHELVES } from "../src/market/catalog.ts";
import { COMMAND, EVENT, G, P, PHASE, RESULT, loadSim, type Sim } from "../src/market/sim.ts";

const dir = join(import.meta.dirname, "../games/market");
const bytes = readFileSync(join(dir, "market.wasm"));
const source = readFileSync(join(dir, "engine/market.c"), "utf8");

let module: WebAssembly.Module;
beforeAll(async () => {
  module = await WebAssembly.compile(bytes);
});
const fresh = async (seed = 1): Promise<Sim> => {
  const sim = await loadSim(module);
  sim.init(seed);
  return sim;
};
const hour = (sim: Sim, hours = 1) => sim.step(sim.shape.ticsPerHour * hours);
const day = (sim: Sim, days = 1) => sim.step(sim.shape.ticsPerDay * days);

describe("the module", () => {
  test("imports nothing and uses no floating point to keep time or money", () => {
    expect(WebAssembly.Module.imports(module)).toEqual([]);
  });

  test("the page's column numbers are the C's (the enums in market.c)", () => {
    const names = (prefix: "G" | "P") => {
      const body = new RegExp(`enum \\{\\s*((?:${prefix}_[A-Z_]+,?[^\\n]*\\n\\s*)+)\\};`).exec(source);
      if (!body) throw new Error(`no ${prefix}_ enum in market.c`);
      return [...body[1]!.matchAll(new RegExp(`${prefix}_([A-Z_]+)`, "g"))].map((match) => match[1]);
    };
    const table = (prefix: "G" | "P", columns: Record<string, number>) => {
      const found = names(prefix);
      expect(found.pop()).toBe("COUNT");
      expect(Object.fromEntries(found.map((name, index) => [name, index]))).toEqual(Object.fromEntries(Object.entries(columns).filter(([name]) => name !== "COUNT")));
    };
    table("G", G);
    table("P", P);
  });

  test("commands and events are numbered as the C numbers them", () => {
    for (const [name, value] of Object.entries(COMMAND)) expect(source).toMatch(new RegExp(`C_${name} = ${value}\\b`));
    for (const [name, value] of Object.entries(EVENT)) expect(source).toMatch(new RegExp(`E_${name} = ${value},`));
    for (const [name, value] of Object.entries(RESULT)) expect(source).toMatch(new RegExp(`R_${name} = ${value}\\b`));
  });

  test("the page names every part and shelf the sim has, six to a shelf", async () => {
    const sim = await fresh();
    expect(PARTS).toHaveLength(sim.shape.parts);
    expect(SHELVES).toHaveLength(sim.shape.shelves);
    for (let i = 0; i < PARTS.length; i++) expect(sim.part(i, P.CAT)).toBe(Math.floor(i / 6));
  });

  test("a new month starts with the day, the cash and the shelves the rules say", async () => {
    const sim = await fresh(9);
    expect(sim.store[G.DAY]).toBe(0);
    expect(sim.store[G.CASH]).toBe(sim.shape.startCash);
    expect(sim.store[G.PHASE]).toBe(PHASE.OPEN);
    let stock = 0;
    for (let i = 0; i < sim.shape.parts; i++) {
      expect(sim.part(i, P.COST)).toBe(sim.part(i, P.BASE));
      expect(sim.part(i, P.PRICE)).toBe(sim.part(i, P.FAIR));
      stock += sim.part(i, P.STOCK);
    }
    expect(sim.store[G.STOCK]).toBe(stock);
    expect(stock).toBeLessThan(sim.shape.shelf);
  });
});

describe("a game is its seed and its commands", () => {
  const script = (sim: Sim, tic: number) => {
    // Something is done every few hours, so chunked and unchunked runs have the same chances to differ.
    if (tic % 30 === 0) sim.buy((tic / 30) % 48, 3);
    if (tic % 90 === 0) sim.setPrice((tic / 90) % 48, 1000 + tic);
    if (tic === 600) sim.setAuto(2, 3, 12);
    if (tic === 900) sim.markup(3, 180);
    if (tic === 1200) sim.buyTrap();
  };
  const run = async (seed: number, chunk: number) => {
    const sim = await fresh(seed);
    // Commands go in on 30-tic marks, so every chunk size that divides 30 sees them on the same tic.
    for (let tic = 0; tic < 3000; tic += chunk) {
      script(sim, tic);
      sim.step(chunk);
    }
    return sim.hash();
  };

  test("however the tics are cut up, the same game ends in the same place", async () => {
    const whole = await run(5, 30);
    for (const chunk of [1, 2, 3, 5, 6, 10, 15]) expect(await run(5, chunk)).toBe(whole);
  });

  test("another seed is another game", async () => {
    expect(await run(6, 30)).not.toBe(await run(5, 30));
  });

  test("starting again starts the same", async () => {
    const sim = await fresh(3);
    const start = sim.hash();
    day(sim, 3);
    expect(sim.hash()).not.toBe(start);
    sim.init(3);
    expect(sim.hash()).toBe(start);
  });

  // Pinned so a build that is not bit for bit the same on another machine or another Node fails
  // here. If the rules were changed on purpose, this is the number to update.
  test("one fixed game ends on one fixed hash", async () => {
    const sim = await fresh(42);
    day(sim, 10);
    expect(sim.hash()).toBe(GOLDEN);
  });
});
const GOLDEN = 1790085713;

describe("buying", () => {
  test("a purchase pays now and arrives on the truck half a day later", async () => {
    const sim = await fresh();
    const cost = sim.part(0, P.COST);
    const stock = sim.part(0, P.STOCK);
    const cash = sim.store[G.CASH];
    expect(sim.buy(0, 10)).toBe(RESULT.OK);
    expect(sim.store[G.CASH]).toBe(cash - 10 * cost);
    expect(sim.part(0, P.INBOUND)).toBe(10);
    expect(sim.part(0, P.STOCK)).toBe(stock);
    sim.step(110);
    expect(sim.part(0, P.INBOUND)).toBe(10);
    sim.step(20);
    expect(sim.part(0, P.INBOUND)).toBe(0);
    // It may have sold some by now, but it is not what it was: ten came in.
    expect(sim.events(0).events.some((e) => e.kind === EVENT.DELIVERED && e.a === 0 && e.b === 10)).toBe(true);
  });

  test("it says why not: no such part, no such amount, no cash, no room", async () => {
    const sim = await fresh();
    expect(sim.buy(-1, 1)).toBe(RESULT.BAD);
    expect(sim.buy(48, 1)).toBe(RESULT.BAD);
    expect(sim.buy(0, 0)).toBe(RESULT.BAD);
    expect(sim.buy(0, 1000)).toBe(RESULT.BAD);
    // 300 catalytic converters is more cash than there is; fifty small oil filters is not more room than there is.
    expect(sim.buy(31, 300)).toBe(RESULT.NO_ROOM);
    expect(sim.buy(31, 150)).toBe(RESULT.NO_CASH);
    expect(sim.buy(0, 50)).toBe(RESULT.OK);
    const left = sim.shape.shelf - sim.store[G.STOCK] - sim.store[G.INBOUND];
    expect(sim.buy(1, left + 1)).toBe(RESULT.NO_ROOM);
  });

  test("a refused purchase costs nothing and changes nothing", async () => {
    const sim = await fresh();
    const before = sim.hash();
    sim.buy(31, 150);
    sim.buy(0, 0);
    expect(sim.hash()).toBe(before);
  });
});

describe("pricing and customers", () => {
  const sold = async (setup: (sim: Sim) => void) => {
    const sim = await fresh(4);
    // Plenty on the shelf for a week, so the only thing that limits sales is the customers.
    sim.buy(36, 60);
    sim.step(130);
    const before = sim.part(36, P.SOLD);
    setup(sim);
    day(sim, 6);
    return sim.part(36, P.SOLD) - before;
  };

  test("the dearer a part, the fewer sell", async () => {
    const cheap = await sold((sim) => sim.setPrice(36, Math.round(sim.part(36, P.FAIR) * 0.8)));
    const fair = await sold(() => {});
    const dear = await sold((sim) => sim.setPrice(36, Math.round(sim.part(36, P.FAIR) * 1.25)));
    expect(cheap).toBeGreaterThan(fair);
    expect(fair).toBeGreaterThan(dear);
    expect(dear).toBeGreaterThan(0);
  });

  test("a price that is 45 percent over fair sells nothing", async () => {
    expect(await sold((sim) => sim.setPrice(36, Math.round(sim.part(36, P.FAIR) * 1.5)))).toBe(0);
  });

  test("the register takes what the shelf says", async () => {
    const sim = await fresh(4);
    const cash = sim.store[G.CASH];
    const price = sim.part(0, P.PRICE);
    day(sim);
    expect(sim.store[G.REVENUE]).toBeGreaterThan(0);
    expect(sim.store[G.CASH]).toBe(cash + sim.store[G.REVENUE]);
    expect(sim.store[G.REVENUE] % 5).toBe(0);
    expect(price % 5).toBe(0);
  });

  test("a shelf that is empty loses customers, and the store's name with them", async () => {
    const sim = await fresh(4);
    const rep = sim.store[G.REP];
    day(sim, 5);
    expect(sim.store[G.MISSED]).toBeGreaterThan(0);
    expect(sim.store[G.REP]).toBeLessThan(rep);
  });

  test("prices are kept to what a shelf can show", async () => {
    const sim = await fresh();
    expect(sim.setPrice(0, 0)).toBe(RESULT.BAD);
    expect(sim.setPrice(0, 100000)).toBe(RESULT.BAD);
    expect(sim.setPrice(99, 500)).toBe(RESULT.BAD);
    expect(sim.setPrice(0, 777)).toBe(RESULT.OK);
    expect(sim.part(0, P.PRICE)).toBe(777);
  });

  test("a mark-up sets a whole shelf from the usual wholesale price, to the nearest five cents", async () => {
    const sim = await fresh();
    expect(sim.markup(3, 180)).toBe(RESULT.OK);
    for (let i = 18; i < 24; i++) {
      expect(sim.part(i, P.PRICE)).toBe(Math.floor((sim.part(i, P.BASE) * 180) / 100 / 5 + 0.5) * 5);
    }
    expect(sim.part(0, P.PRICE)).toBe(sim.part(0, P.FAIR));
    expect(sim.markup(3, 99)).toBe(RESULT.BAD);
    expect(sim.markup(8, 150)).toBe(RESULT.BAD);
  });
});

describe("standing orders", () => {
  test("a part that falls under its line is ordered up to its top, by itself", async () => {
    const sim = await fresh(2);
    expect(sim.setAuto(36, 20, 25)).toBe(RESULT.OK);
    hour(sim);
    expect(sim.part(36, P.STOCK) + sim.part(36, P.INBOUND)).toBeGreaterThanOrEqual(25 - 1);
    expect(sim.events(0).events.some((e) => e.kind === EVENT.AUTO && e.a === 36)).toBe(true);
  });

  test("it is turned off with a top of nothing, and refuses a line over its top", async () => {
    const sim = await fresh(2);
    sim.setAuto(36, 20, 25);
    expect(sim.setAuto(36, 0, 0)).toBe(RESULT.OK);
    expect(sim.part(36, P.AUTO_TO)).toBe(0);
    expect(sim.setAuto(36, 30, 20)).toBe(RESULT.BAD);
    expect(sim.setAuto(36, 5, 100)).toBe(RESULT.BAD);
  });

  test("it spends only the cash there is, and only the room there is", async () => {
    const sim = await fresh(2);
    for (let i = 0; i < 48; i++) sim.setAuto(i, 90, 99);
    day(sim, 3);
    expect(sim.store[G.CASH]).toBeGreaterThanOrEqual(0);
    expect(sim.store[G.STOCK] + sim.store[G.INBOUND]).toBeLessThanOrEqual(sim.shape.shelf);
  });
});

describe("the month", () => {
  test("a month is twenty-eight days, with rent on the seventh of each week", async () => {
    const sim = await fresh(1);
    const rents: number[] = [];
    let cursor = 0;
    while (sim.store[G.PHASE] === PHASE.OPEN) {
      sim.step(sim.shape.ticsPerDay);
      const read = sim.events(cursor);
      cursor = read.cursor;
      for (const e of read.events) if (e.kind === EVENT.RENT) rents.push(sim.store[G.DAY]);
    }
    expect(sim.store[G.PHASE]).toBe(PHASE.FINISHED);
    expect(sim.store[G.DAY]).toBe(sim.shape.days);
    expect(rents).toEqual([7, 14, 21, 28]);
  });

  test("when the month is over or the rent can't be paid, nothing more happens", async () => {
    const sim = await fresh(1);
    day(sim, 30);
    expect(sim.store[G.PHASE]).not.toBe(PHASE.OPEN);
    const after = sim.hash();
    expect(sim.step(1000)).toBe(sim.store[G.PHASE]);
    expect(sim.buy(0, 1)).toBe(RESULT.OVER);
    expect(sim.setPrice(0, 500)).toBe(RESULT.OVER);
    expect(sim.hash()).toBe(after);
  });

  test("the last event says how it ended and what the store was worth", async () => {
    const sim = await fresh(1);
    day(sim, 30);
    const { events } = sim.events(0);
    const end = events.at(-1)!;
    expect(end.kind).toBe(EVENT.END);
    expect(end.a).toBe(sim.store[G.PHASE]);
    expect(end.b).toBe(sim.store[G.WORTH]);
  });

  test("wholesale prices wander but stay within half and two and a half times the usual", async () => {
    const sim = await fresh(7);
    let low = Infinity;
    let high = 0;
    for (let d = 0; d < 28 && sim.store[G.PHASE] === PHASE.OPEN; d++) {
      day(sim);
      for (let i = 0; i < 48; i++) {
        const ratio = sim.part(i, P.COST) / sim.part(i, P.BASE);
        low = Math.min(low, ratio);
        high = Math.max(high, ratio);
      }
    }
    expect(low).toBeGreaterThanOrEqual(0.5);
    expect(high).toBeLessThanOrEqual(2.5);
    expect(high - low).toBeGreaterThan(0.1);
  });

  test("the last 48 hourly wholesale prices are kept, oldest first", async () => {
    const sim = await fresh(7);
    day(sim, 3);
    const seen = sim.history(5, 48);
    expect(seen).toHaveLength(48);
    // The newest is the price at the start of this hour.
    hour(sim, 0);
    expect(sim.history(5, 3)).toEqual(seen.slice(-3));
    hour(sim, 2);
    // Two more hours: the two oldest are gone and two new ones are at the end.
    expect(sim.history(5, 48).slice(0, 46)).toEqual(seen.slice(2));
    expect(sim.history(5, 999)).toHaveLength(48);
  });

  test("events are read from a cursor, once, and a cursor left far behind only misses what is gone", async () => {
    const sim = await fresh(7);
    day(sim, 2);
    const first = sim.events(0);
    expect(first.events.length).toBeGreaterThan(0);
    expect(sim.events(first.cursor).events).toEqual([]);
    day(sim, 20);
    const later = sim.events(first.cursor);
    expect(later.events.length).toBeLessThanOrEqual(sim.shape.events);
    expect(later.cursor).toBe(sim.store[G.EV_HEAD]);
    for (let i = 1; i < later.events.length; i++) expect(later.events[i]!.tic).toBeGreaterThanOrEqual(later.events[i - 1]!.tic);
  });
});

describe("rats", () => {
  const ratsAfter = async (traps: number, days: number) => {
    const sim = await fresh(3);
    for (let t = 0; t < traps; t++) expect(sim.buyTrap()).toBe(RESULT.OK);
    day(sim, days);
    return sim;
  };

  test("they multiply by the night, and chew", async () => {
    const sim = await ratsAfter(0, 20);
    expect(sim.store[G.RATS]).toBeGreaterThan(500);
  });

  test("traps keep them down", async () => {
    const none = await ratsAfter(0, 20);
    const two = await ratsAfter(2, 20);
    const four = await ratsAfter(4, 20);
    expect(two.store[G.RATS]).toBeLessThan(none.store[G.RATS]);
    expect(four.store[G.RATS]).toBe(0);
  });

  test("a trap costs money, and there is a limit to how many fit", async () => {
    const sim = await fresh(3);
    const cash = sim.store[G.CASH];
    sim.buyTrap();
    expect(sim.store[G.CASH]).toBe(cash - sim.shape.trapCost);
    expect(sim.store[G.TRAPS]).toBe(1);
    sim.store[G.CASH] = 10_000_000;
    let result: number = RESULT.OK;
    for (let i = 0; i < 40 && result === RESULT.OK; i++) result = sim.buyTrap();
    expect(result).toBe(RESULT.NO_ROOM);
    expect(sim.store[G.TRAPS]).toBe(20);
  });
});

// Bots that play a whole month. Each is a way a person might play, in a line or two.
describe("whole months, played by bots", () => {
  type Bot = (sim: Sim, hour: number) => void;
  /** Keeps `days` days of each part on hand, at a fixed mark-up, and (if asked) sets traps. */
  const stocker =
    (days: number, percent: number, traps = 0): Bot =>
    (sim, h) => {
      if (h === 0) {
        for (let shelf = 0; shelf < sim.shape.shelves; shelf++) sim.markup(shelf, percent);
        for (let t = 0; t < traps; t++) sim.buyTrap();
      }
      for (let i = 0; i < sim.shape.parts; i++) {
        const perDay = (sim.part(i, P.RATE) * sim.shape.demandPercent) / 1000;
        const want = Math.ceil(perDay * days) + 1;
        const have = sim.part(i, P.STOCK) + sim.part(i, P.INBOUND);
        if (have < want * 0.6) sim.buy(i, want - have);
      }
    };
  const idle: Bot = () => {};

  async function play(bot: Bot, seed: number) {
    const sim = await fresh(seed);
    for (let h = 0; sim.store[G.PHASE] === PHASE.OPEN; h++) {
      bot(sim, h);
      hour(sim);
    }
    return { phase: sim.store[G.PHASE], day: sim.store[G.DAY], worth: sim.store[G.WORTH], cash: sim.store[G.CASH], start: sim.shape.startCash };
  }
  const seeds = [1, 2, 3, 4, 5];
  const average = async (bot: Bot) => {
    const results = await Promise.all(seeds.map((seed) => play(bot, seed)));
    return { worth: results.reduce((sum, r) => sum + r.worth, 0) / seeds.length, results };
  };

  test("doing nothing earns about nothing", async () => {
    const { worth, results } = await average(idle);
    for (const r of results) expect(r.phase).toBe(PHASE.FINISHED);
    // It sells what it opened with and pays the rent from that; it does not get richer.
    expect(worth).toBeLessThan(results[0]!.start * 1.5);
  });

  test("keeping the shelves full at a fair mark-up beats doing nothing every time", async () => {
    const idleWorth = (await average(idle)).worth;
    const { worth, results } = await average(stocker(1, 160));
    for (const r of results) expect(r.phase).toBe(PHASE.FINISHED);
    expect(worth).toBeGreaterThan(idleWorth * 1.3);
  });

  test("and setting traps beats not setting them, which is what the rats are for", async () => {
    const without = (await average(stocker(1, 160))).worth;
    const { worth, results } = await average(stocker(1, 160, 2));
    for (const r of results) expect(r.phase).toBe(PHASE.FINISHED);
    expect(worth).toBeGreaterThan(without * 1.3);
  });

  test("charging two and a half times the usual price loses the store by the third week", async () => {
    const { results } = await average(stocker(1, 250));
    for (const r of results) {
      expect(r.phase).toBe(PHASE.BROKE);
      expect(r.day).toBeLessThan(28);
    }
  });

  test("selling at 20 percent over the usual wholesale price makes less than at 60 percent over", async () => {
    const fair = (await average(stocker(1, 160))).worth;
    const cheap = (await average(stocker(1, 120))).worth;
    expect(cheap).toBeLessThan(fair);
  });
});
