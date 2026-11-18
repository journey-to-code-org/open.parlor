// The stockroom's sim, running: the .wasm module instantiated, and the few calls the page makes
// into it. The module imports nothing, so it starts the same in a page and in Node, and nothing
// here touches the DOM.
//
// The state is not fetched a number at a time. It sits in three tables in the module's memory
// (the store, the parts, the wholesale prices), which this file looks at in place through typed
// arrays: reading the cost of all 48 parts is 48 array reads, not 48 calls. The module's memory
// never grows, so the views made at the start stay good.

/** Columns of the store table (G in games/market/engine/market.c). */
export const G = {
  PHASE: 0,
  TIC: 1,
  DAY: 2,
  HOUR: 3,
  CASH: 4,
  TEMP: 5,
  REP: 6,
  RATS: 7,
  TRAPS: 8,
  RENT_DAY: 9,
  UNITS_TODAY: 10,
  REVENUE_TODAY: 11,
  MISSED_TODAY: 12,
  REVENUE: 13,
  MISSED: 14,
  SPENT: 15,
  STOCK: 16,
  INBOUND: 17,
  WORTH: 18,
  HIST_N: 19,
  EV_HEAD: 20,
  SHIFT: 21,
  SHIFT_LEFT: 22,
  REP_ACC: 23,
  COUNT: 24,
} as const;

/** Columns of the parts table (P). */
export const P = {
  CAT: 0,
  BASE: 1,
  FAIR: 2,
  RATE: 3,
  COST: 4,
  PRICE: 5,
  STOCK: 6,
  INBOUND: 7,
  SOLD_TODAY: 8,
  SOLD: 9,
  MISSED: 10,
  AUTO_BELOW: 11,
  AUTO_TO: 12,
  DEMAND: 13,
  COUNT: 14,
} as const;

export const COMMAND = { BUY: 1, PRICE: 2, AUTO: 3, MARKUP: 4, TRAP: 5 } as const;

export const RESULT = { OK: 0, NO_CASH: 1, BAD: 2, NO_ROOM: 3, OVER: 4 } as const;
export type Result = (typeof RESULT)[keyof typeof RESULT];

export const PHASE = { OPEN: 0, FINISHED: 1, BROKE: 2 } as const;

export const EVENT = {
  DAY: 1,
  SOLD_OUT: 2,
  DELIVERED: 3,
  RATS: 4,
  COLD: 5,
  STRIKE: 6,
  SALE: 7,
  RAIN: 8,
  RENT: 9,
  END: 10,
  AUTO: 11,
  TRAP: 12,
} as const;

/** The store table as a record of its columns, so that a column read is a number and not "a number or nothing". */
export type Store = Record<(typeof G)[keyof typeof G], number>;

export interface GameEvent {
  kind: number;
  a: number;
  b: number;
  /** The tic it happened on. */
  tic: number;
}

/** What the module says about its own tables; the page checks it agrees (see `loadSim`). */
export interface Shape {
  parts: number;
  shelves: number;
  partColumns: number;
  storeColumns: number;
  history: number;
  events: number;
  ticsPerDay: number;
  days: number;
  shelf: number;
  rent: number;
  startCash: number;
  trapCost: number;
  ticsPerHour: number;
  rentEvery: number;
  /** Per cent of a part's table rate that its customers come at: `rate` is tenths of a unit a day before this. */
  demandPercent: number;
}

interface Exports {
  memory: WebAssembly.Memory;
  init(seed: number): void;
  step(tics: number): number;
  command(kind: number, a: number, b: number): number;
  state_hash(): number;
  globals(): number;
  parts(): number;
  history(): number;
  events(): number;
  shape(which: number): number;
}

export interface Sim {
  readonly shape: Shape;
  /** The store, live: index it with G. (It is the module's own memory, so it can be written, but only the module should.) */
  readonly store: Store;
  /** How much memory the module has, in bytes. */
  readonly bytes: number;
  /** Starts a new month. */
  init(seed: number): void;
  /** Runs up to `tics` tics, or until the month ends. Says the phase it is in. */
  step(tics: number): number;
  hash(): number;

  part(part: number, column: number): number;
  /** The last `count` wholesale prices of a part, oldest first, one an hour. */
  history(part: number, count: number): number[];
  /** Things that happened since `cursor` (start at 0), and the cursor to ask from next time. */
  events(cursor: number): { events: GameEvent[]; cursor: number };

  buy(part: number, units: number): Result;
  setPrice(part: number, cents: number): Result;
  /** Orders more by itself whenever stock and truck fall under `below`, up to `to`. `to` 0 turns it off. */
  setAuto(part: number, below: number, to: number): Result;
  /** Puts every part of a shelf at this percent of its usual wholesale price. */
  markup(shelf: number, percent: number): Result;
  buyTrap(): Result;
}

const SHAPES: (keyof Shape)[] = [
  "parts",
  "shelves",
  "partColumns",
  "storeColumns",
  "history",
  "events",
  "ticsPerDay",
  "days",
  "shelf",
  "rent",
  "startCash",
  "trapCost",
  "ticsPerHour",
  "rentEvery",
  "demandPercent",
];

/** Instantiates the module. `source` is the .wasm file's bytes, or a module already compiled. */
export async function loadSim(source: BufferSource | WebAssembly.Module): Promise<Sim> {
  const instance = source instanceof WebAssembly.Module ? await WebAssembly.instantiate(source, {}) : (await WebAssembly.instantiate(source, {})).instance;
  const wasm = instance.exports as unknown as Exports;

  const shape = Object.fromEntries(SHAPES.map((name, which) => [name, wasm.shape(which)])) as unknown as Shape;
  if (shape.storeColumns !== G.COUNT || shape.partColumns !== P.COUNT) {
    throw new Error(`the sim's tables are ${shape.storeColumns} by ${shape.partColumns}; this page expects ${G.COUNT} by ${P.COUNT}`);
  }

  const buffer = wasm.memory.buffer;
  const words = new Int32Array(buffer, wasm.globals(), G.COUNT);
  const store = words as unknown as Store;
  const rows = new Int32Array(buffer, wasm.parts(), shape.parts * P.COUNT);
  const hist = new Int32Array(buffer, wasm.history(), shape.parts * shape.history);
  const log = new Int32Array(buffer, wasm.events(), shape.events * 4);

  wasm.init(1);
  return {
    shape,
    store,
    bytes: buffer.byteLength,
    init: (seed) => wasm.init(seed >>> 0),
    step: (tics) => wasm.step(tics),
    hash: () => wasm.state_hash() >>> 0,
    part: (part, column) => rows[part * P.COUNT + column] ?? 0,
    history(part, count) {
      const kept = Math.min(count, shape.history);
      const end = store[G.HIST_N];
      return Array.from({ length: kept }, (_, k) => hist[part * shape.history + ((end - kept + k) % shape.history)] ?? 0);
    },
    events(cursor) {
      const head = store[G.EV_HEAD];
      // A cursor that is further back than the log goes is told only what is left of it.
      const from = Math.max(cursor, head - shape.events);
      const events: GameEvent[] = [];
      for (let n = from; n < head; n++) {
        const at = (n % shape.events) * 4;
        events.push({ kind: log[at] ?? 0, a: log[at + 1] ?? 0, b: log[at + 2] ?? 0, tic: log[at + 3] ?? 0 });
      }
      return { events, cursor: head };
    },
    buy: (part, units) => wasm.command(COMMAND.BUY, part, units) as Result,
    setPrice: (part, cents) => wasm.command(COMMAND.PRICE, part, cents) as Result,
    setAuto: (part, below, to) => wasm.command(COMMAND.AUTO, part, below + to * 1000) as Result,
    markup: (shelf, percent) => wasm.command(COMMAND.MARKUP, shelf, percent) as Result,
    buyTrap: () => wasm.command(COMMAND.TRAP, 0, 0) as Result,
  };
}
