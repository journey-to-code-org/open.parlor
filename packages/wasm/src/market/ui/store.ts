// The game as the screen sees it: the sim, the loop that runs it, and the numbers Solid draws.
//
// The sim lives in a module and is read in place (see ../sim.ts). Once a frame, if tics came due,
// this reads the tables into plain objects and sets the signals the page is drawn from. Setting
// those is where Zubra's components start work: every cell of the parts table, the tickers, the
// bars. So how often that happens is a setting (`redraw`), and how long it takes is measured
// (`meter`): the "Under the hood" tab is a gauge of how Zubra holds up under a live number.
import { batch, createSignal } from "solid-js";
import { PARTS, SHELVES, SPEEDS, partName, say, shelfName, type Line } from "../catalog.ts";
import { G, P, PHASE, RESULT, loadSim, type Result, type Sim } from "../sim.ts";

export interface Row {
  id: number;
  part: string;
  shelf: string;
  stock: number;
  truck: number;
  /** Dollars. */
  cost: number;
  price: number;
  /** Per cent of the price that is not the wholesale price. */
  margin: number;
  sold: number;
}

export interface Clock {
  day: number;
  hour: number;
  phase: number;
  cash: number;
  worth: number;
  temp: number;
  rep: number;
  rats: number;
  traps: number;
  stock: number;
  truck: number;
  room: number;
  revenueToday: number;
  missedToday: number;
  /** Days until the rent is taken, 0 being tonight. */
  rentIn: number;
}

export interface Entry extends Line {
  id: number;
  day: number;
}

export interface Meter {
  /** Tics the sim ran in the last second. */
  tics: number;
  /** Times the screen was given new numbers in the last second. */
  updates: number;
  /** Milliseconds the sim took to run a frame's tics, and the page to take the new numbers (the work it does itself; Zubra's own redraw follows). */
  stepMs: number;
  publishMs: number;
  /** Milliseconds between frames, the slowest of the last second. */
  frameMs: number;
  /** Elements on the page that are Zubra's, and elements altogether. */
  components: number;
  elements: number;
  memoryKb: number;
}

export type Redraw = "frame" | "10" | "2";
export const REDRAWS: Record<Redraw, number> = { frame: 0, "10": 100, "2": 500 };

const BEST = "open.parlor.stockroom.best";
const REASON: Record<number, string> = {
  [RESULT.NO_CASH]: "Not enough cash for that.",
  [RESULT.NO_ROOM]: "No room: the shelves, and the truck, are full.",
  [RESULT.BAD]: "That isn't something the store can do.",
  [RESULT.OVER]: "The month is over.",
};

export const best = {
  read(): number {
    try {
      return Number(localStorage.getItem(BEST)) || 0;
    } catch {
      return 0;
    }
  },
  write(cents: number) {
    try {
      localStorage.setItem(BEST, String(cents));
    } catch {
      /* private browsing: the best month is only this visit's */
    }
  },
};

/** A toast, from anywhere: zubra-ui's <toast-region> listens on the document. */
export function toast(message: string, variant: Line["variant"] = "info", heading?: string) {
  document.dispatchEvent(new CustomEvent("toast", { detail: { message, variant, heading } }));
}

export async function createGame(wasm: string, firstSeed: number) {
  const sim: Sim = await loadSim(await WebAssembly.compileStreaming(fetch(wasm)).catch(async () => WebAssembly.compile(await (await fetch(wasm)).arrayBuffer())));
  const { shape } = sim;

  const [seed, setSeed] = createSignal(firstSeed);
  const [speed, setSpeed] = createSignal<string>("1");
  const [redraw, setRedraw] = createSignal<Redraw>("frame");
  const [rows, setRows] = createSignal<Row[]>([]);
  const [clock, setClock] = createSignal<Clock>(readClock());
  const [news, setNews] = createSignal<Entry[]>([]);
  const [meter, setMeter] = createSignal<Meter>({ tics: 0, updates: 0, stepMs: 0, publishMs: 0, frameMs: 0, components: 0, elements: 0, memoryKb: 0 });
  /** Shelves' sales today, for the bar chart. */
  const [sales, setSales] = createSignal<number[]>(Array(shape.shelves).fill(0));
  /** How far the wholesale price of each shelf is from usual, per cent, and the last day of it, for the charts. Only changes on the hour. */
  const [trends, setTrends] = createSignal<{ shelf: number; change: number; points: number[] }[]>([]);
  /** A part's last 48 wholesale prices, in dollars; the part is whichever one the page last asked about. */
  const [watched, setWatched] = createSignal(0);
  /** Counts up whenever prices are set from somewhere other than the part's own slider, so the slider knows to move. */
  const [priced, setPriced] = createSignal(0);
  const [chart, setChart] = createSignal<number[]>([]);

  let cursor = 0;
  let entry = 0;
  let seenHours = -1;
  let last = performance.now();
  let carry = 0;
  let since = 0;
  const tally = { start: performance.now(), tics: 0, updates: 0, step: 0, publish: 0, frames: 0, worst: 0 };

  function readClock(): Clock {
    const s = sim.store;
    return {
      day: s[G.DAY],
      hour: s[G.HOUR],
      phase: s[G.PHASE],
      cash: s[G.CASH],
      worth: s[G.WORTH],
      temp: s[G.TEMP],
      rep: s[G.REP],
      rats: s[G.RATS],
      traps: s[G.TRAPS],
      stock: s[G.STOCK],
      truck: s[G.INBOUND],
      room: shape.shelf - s[G.STOCK] - s[G.INBOUND],
      revenueToday: s[G.REVENUE_TODAY],
      missedToday: s[G.MISSED_TODAY],
      rentIn: Math.max(0, s[G.RENT_DAY] - s[G.DAY]),
    };
  }

  function readRows(): Row[] {
    return PARTS.map((part, id) => {
      const cost = sim.part(id, P.COST);
      const price = sim.part(id, P.PRICE);
      return {
        id,
        part,
        shelf: shelfName(sim.part(id, P.CAT)),
        stock: sim.part(id, P.STOCK),
        truck: sim.part(id, P.INBOUND),
        cost: cost / 100,
        price: price / 100,
        margin: Math.round(((price - cost) / price) * 100),
        sold: sim.part(id, P.SOLD_TODAY),
      };
    });
  }

  /** Each shelf's wholesale prices as a per cent of usual, averaged over its six parts, an hour at a time. */
  function readTrends() {
    const series = PARTS.map((_, part) => sim.history(part, shape.history).map((cents) => cents / sim.part(part, P.BASE)));
    return SHELVES.map((_, shelf) => {
      const points = Array.from({ length: shape.history }, (_, n) => Math.round((series.slice(shelf * 6, shelf * 6 + 6).reduce((sum, s) => sum + (s[n] ?? 0), 0) / 6) * 1000) / 10);
      return { shelf, change: Math.round((points.at(-1) ?? 100) - 100), points };
    });
  }

  function readNews() {
    const read = sim.events(cursor);
    cursor = read.cursor;
    if (!read.events.length) return;
    const added: Entry[] = [];
    for (const event of read.events) {
      const line = say(event);
      if (!line) continue;
      const day = Math.floor(event.tic / shape.ticsPerDay);
      if (line.toast) toast(line.text, line.variant);
      added.push({ ...line, id: entry++, day });
    }
    if (added.length) setNews((old) => [...added.reverse(), ...old].slice(0, 80));
  }

  /** Reads the sim into the signals Solid draws from. */
  function publish() {
    const began = performance.now();
    readNews();
    batch(() => {
      setClock(readClock());
      setRows(readRows());
      setSales(Array.from({ length: shape.shelves }, (_, shelf) => Array.from({ length: 6 }, (_, k) => sim.part(shelf * 6 + k, P.SOLD_TODAY)).reduce((a, b) => a + b, 0)));
      // Charts move once an hour: they are given new numbers then, and not before.
      if (sim.store[G.HIST_N] !== seenHours) {
        seenHours = sim.store[G.HIST_N];
        setTrends(readTrends());
        setChart(sim.history(watched(), shape.history).map((cents) => cents / 100));
      }
    });
    tally.publish += performance.now() - began;
    tally.updates++;
  }

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(100, now - last);
    tally.worst = Math.max(tally.worst, now - last);
    last = now;
    tally.frames++;

    const rate = SPEEDS.find((s) => s.value === speed())?.tics ?? 0;
    if (rate && sim.store[G.PHASE] === PHASE.OPEN) {
      carry += (dt / 1000) * rate;
      const tics = Math.floor(carry);
      carry -= tics;
      if (tics) {
        const began = performance.now();
        sim.step(tics);
        tally.step += performance.now() - began;
        tally.tics += tics;
        since += dt;
        if (since >= REDRAWS[redraw()] || sim.store[G.PHASE] !== PHASE.OPEN) {
          since = 0;
          publish();
        }
      }
    }

    if (now - tally.start >= 1000) {
      const seconds = (now - tally.start) / 1000;
      const all = [...document.querySelectorAll("*")];
      setMeter({
        tics: Math.round(tally.tics / seconds),
        updates: Math.round(tally.updates / seconds),
        stepMs: tally.frames ? tally.step / tally.frames : 0,
        publishMs: tally.updates ? tally.publish / tally.updates : 0,
        frameMs: Math.round(tally.worst),
        components: all.filter((el) => el.localName.includes("-")).length,
        elements: all.length,
        memoryKb: Math.round(sim.bytes / 1024),
      });
      Object.assign(tally, { start: now, tics: 0, updates: 0, step: 0, publish: 0, frames: 0, worst: 0 });
    }
  }

  /** What a command did, said to the player when it did nothing. */
  function said(result: Result, ok?: string): boolean {
    if (result === RESULT.OK) {
      if (ok) toast(ok, "success");
    } else toast(REASON[result] ?? "No.", "warning");
    publish();
    return result === RESULT.OK;
  }

  let startWorth = 0;
  function restart(next: number) {
    sim.init(next);
    startWorth = sim.store[G.WORTH];
    setSeed(next);
    cursor = 0;
    seenHours = -1;
    carry = 0;
    setNews([]);
    publish();
  }

  const game = {
    seed,
    speed,
    setSpeed,
    redraw,
    setRedraw,
    rows,
    clock,
    news,
    meter,
    sales,
    trends,
    chart,
    watched,
    /** Which part the price chart shows. */
    watch(part: number) {
      setWatched(part);
      setChart(sim.history(part, shape.history).map((cents) => cents / 100));
    },
    shape,
    /** What the store was worth when the month began: the score is how many times over it was made. */
    startWorth: () => startWorth,
    /** A part as it is this moment, for the panel that works on one. */
    detail(part: number) {
      return {
        base: sim.part(part, P.BASE),
        cost: sim.part(part, P.COST),
        price: sim.part(part, P.PRICE),
        stock: sim.part(part, P.STOCK),
        truck: sim.part(part, P.INBOUND),
        sold: sim.part(part, P.SOLD),
        soldToday: sim.part(part, P.SOLD_TODAY),
        missed: sim.part(part, P.MISSED),
        below: sim.part(part, P.AUTO_BELOW),
        to: sim.part(part, P.AUTO_TO),
        demand: sim.part(part, P.DEMAND),
        rate: sim.part(part, P.RATE),
      };
    },
    /** `quiet`: the caller is ordering several and says so once itself. */
    buy: (part: number, units: number, quiet = false) => said(sim.buy(part, units), quiet ? undefined : `${units} × ${partName(part)} on the truck.`),
    priced,
    /** `quiet` is the part's own slider: it is where the price came from, so it need not move. */
    price(part: number, cents: number, quiet = false) {
      if (!quiet) setPriced((n) => n + 1);
      return said(sim.setPrice(part, cents));
    },
    auto: (part: number, below: number, to: number) => said(sim.setAuto(part, below, to)),
    markup(shelf: number, percent: number) {
      setPriced((n) => n + 1);
      return said(sim.markup(shelf, percent), `${shelfName(shelf)} are at ${percent}% of the usual wholesale price.`);
    },
    trap: () => said(sim.buyTrap(), "A trap is set."),
    restart,
  };

  restart(firstSeed);
  requestAnimationFrame(frame);
  return game;
}

export type Game = Awaited<ReturnType<typeof createGame>>;
