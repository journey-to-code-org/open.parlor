// Computer players thinking in worker threads (bots.ts): the move is the same whichever thread
// works it out, for every game in the card room, and a real table's bot gets its moves from a worker.
import { KIT_GAMES, kitGame } from "@cardroom/games";
import { PALACE_PRESETS } from "@cardroom/palace";
import { classic, familyTable, jokersAndDeuces, pickPersonas, quick250, mulberry32, type Skill } from "@spades/rules";
import { memoryLog } from "@zubra/sync/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { builtFile, createBotPool, type BotPool } from "../src/botpool.js";
import { createBots, workersFrom, defaultWorkers } from "../src/bots.js";
import { quick, think, type ThinkJob } from "../src/brain.js";
import { TIMEOUT_BUDGET, tableRoom, type TableOptions } from "../src/games.js";
import { kitHeavy } from "../src/kit.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every game the card room plays, at every preset: the room options that deal it, and how many sit down. */
function everyTable(): { name: string; options: TableOptions; seats: number; kit: boolean }[] {
  const tables: { name: string; options: TableOptions; seats: number; kit: boolean }[] = [];
  for (const preset of [familyTable, classic, jokersAndDeuces, quick250]) tables.push({ name: `spades/${preset.name}`, options: preset, seats: 4, kit: false });
  for (const rules of PALACE_PRESETS) for (const seats of [2, 4]) tables.push({ name: `palace/${rules.id}/${seats}`, options: { game: "palace", rules, seats }, seats, kit: false });
  for (const game of KIT_GAMES) for (const rules of game.presets) tables.push({ name: `${game.id}/${rules.id}`, options: { game: game.id, rules, seats: game.seats.default }, seats: game.teams ? 4 : game.seats.default, kit: true });
  return tables;
}

describe("a think is the same move on any thread", () => {
  let pool: BotPool<ThinkJob>;
  beforeAll(async () => {
    // The workers run the built server's brain (dist/brain.js); this thread runs src/brain.ts.
    pool = createBotPool<ThinkJob>({ brain: builtFile("brain"), local: { think, quick }, size: 2, ceilingMs: 120_000 });
    await pool.ready;
  });
  afterAll(() => pool.close());

  // Each table is played by computer players only, twice over at once: every move is worked out on
  // this thread and in a worker from the same job, and the two move logs must match to the byte.
  // The dice (many bots roll `Math.random`) come from a seed in the job, so a think can be repeated;
  // the level cycles through the table settings so every strength of every bot is compared.
  const SKILLS: Skill[] = ["mixed", "hard", "medium", "easy"];
  const LIMIT = 160;
  const tables = everyTable();

  it("covers every registered game", () => {
    expect(new Set(tables.filter((t) => t.kit).map((t) => (t.options as { game: string }).game))).toEqual(new Set(KIT_GAMES.map((g) => g.id)));
    expect(tables.length).toBeGreaterThan(KIT_GAMES.length);
  });

  it(
    "for every game at every preset: the main thread's move log and the workers' are identical",
    async () => {
      let thinks = 0;
      let heavy = 0;
      const refused: string[] = [];
      const sent: Promise<void>[] = [];
      for (const [index, table] of tables.entries()) {
        const seed = 1000 + index;
        const names = pickPersonas(table.seats, mulberry32(seed)).map((p) => p.name);
        const settings = tableRoom.settings!({ skill: SKILLS[index % SKILLS.length] });
        let state = tableRoom.setup(table.options, seed);
        const here: string[] = [];
        const there: Promise<string>[] = [];
        for (let n = 0; n < LIMIT && !tableRoom.finished!(state); n++) {
          let moved = false;
          for (let seat = 0; seat < table.seats; seat++) {
            const job: ThinkJob = { state, seat, name: names[seat]!, settings, budget: { ms: 2000 }, seed: seed * 7919 + n * 31 + seat };
            const move = think(job);
            // A game only calls a think heavy when there is a move to think about.
            if (table.kit && kitHeavy(state as never, seat)) {
              heavy += 1;
              expect(move, `${table.name}: heavy, but no move`).not.toBeNull();
            }
            // Whether a seat has a move never depends on how it's asked.
            expect(quick(job) === null, `${table.name}: the quick move and the real one disagree about there being one`).toBe(move === null);
            if (move === null) continue;
            // The same job, to a worker. Not awaited here: the game goes on from this thread's move,
            // and the workers' answers are compared at the end.
            there.push(pool.think(job, { table: `${table.name}#${n}` }).then((m) => JSON.stringify([seat, m])));
            here.push(JSON.stringify([seat, move]));
            thinks += 1;
            try {
              state = tableRoom.act(state, seat, move, { at: 0, elapsed: 0 });
            } catch {
              // A bot's move the game refuses (it happens: a timid persona's bet in Blackjack can come
              // out as no amount at all) stops a real table too. The worker must make the same mistake.
              refused.push(table.name);
              break;
            }
            moved = true;
            break;
          }
          if (!moved) break;
        }
        expect(here.length, `${table.name}: nobody moved`).toBeGreaterThan(0);
        sent.push(Promise.all(there).then((log) => expect(log, table.name).toEqual(here)));
      }
      await Promise.all(sent);
      expect(heavy).toBeGreaterThan(100);
      // Nothing new is refused: only the bet above.
      expect(refused.filter((name) => !name.startsWith("blackjack/"))).toEqual([]);
      expect(pool.stats()).toMatchObject({ thinks, abandoned: 0, onMain: 0 });
    },
    300_000,
  );

  it("ignores the budget in every game there is today: any budget, the same move", () => {
    for (const id of ["checkers", "reversi", "dropfour", "minigolf", "tictactoe", "gofish"]) {
      const game = kitGame(id)!;
      const state = tableRoom.setup({ game: game.id, rules: game.presets[0], seats: game.seats.default }, 5);
      const seat = [0, 1].find((s) => think({ state, seat: s, name: "Bot", settings: null, seed: 1 }) !== null)!;
      const moves = [undefined, { ms: 1 }, TIMEOUT_BUDGET, { ms: 60_000 }].map((budget) => JSON.stringify(think({ state, seat, name: "Bot", settings: { skill: "hard" }, budget, seed: 3 })));
      expect(new Set(moves).size, id).toBe(1);
    }
  });
});

describe("the card room's bots", () => {
  let open: ReturnType<typeof createCardRoom>[] = [];
  afterEach(async () => {
    await Promise.all(open.map((c) => c.close()));
    open = [];
  });
  function setup(workers: number) {
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false, bots: { workers, warm: false } });
    open.push(app);
    return app;
  }
  /** A table of `game` with a computer player in both seats, dealt: they play each other. */
  async function deal(app: ReturnType<typeof setup>, game: string) {
    const kit = kitGame(game)!;
    const id = await app.rooms.create({ game: kit.id, rules: kit.presets[0], seats: 2 }, { skill: "hard" });
    await app.rooms.seatBot(id, 0, "Dot");
    await app.rooms.seatBot(id, 1, "Bot");
    expect(await app.rooms.start(id)).toBeNull();
    return id;
  }
  /** How many moves the table's log holds. Every one went through the room's `act`, like a person's. */
  const movesAt = async (app: ReturnType<typeof setup>, id: string) => Object.keys((await app.rooms.sync.documents()).get("moves", id) ?? {}).filter((k) => /^\d+$/.test(k)).length;
  async function until(done: () => boolean | Promise<boolean>, ms = 20_000) {
    for (const began = Date.now(); Date.now() - began < ms; ) {
      if (await done()) return;
      await sleep(10);
    }
    throw new Error("It never happened.");
  }

  it("a heavy game's bots get their moves from a worker; a quick game's stay on the main thread", async () => {
    const app = setup(1);
    await app.bots!.ready;
    const checkers = await deal(app, "checkers");
    await until(async () => (await movesAt(app, checkers)) >= 12);
    const after = app.bots!.stats();
    expect(after.workers).toBe(1);
    // Every one of those moves was thought out in the worker, and none here.
    expect(after.thinks).toBeGreaterThanOrEqual(12);
    expect(after).toMatchObject({ light: 0, abandoned: 0, onMain: 0 });
    await app.rooms.closeTable(checkers, "Done.");
    await until(() => app.bots!.stats().running === 0);
    const settled = app.bots!.stats().thinks;

    // Go Fish: the bots play, and no think goes near the pool.
    const fish = await deal(app, "gofish");
    await until(async () => (await movesAt(app, fish)) >= 8);
    expect(app.bots!.stats().thinks).toBe(settled);
    expect(app.bots!.stats().light).toBeGreaterThanOrEqual(8);
  });

  it("with no workers, plays just the same on the main thread", async () => {
    const app = setup(0);
    const checkers = await deal(app, "checkers");
    await until(async () => (await movesAt(app, checkers)) >= 12);
    expect(app.bots!.stats()).toMatchObject({ workers: 0, thinks: 0, queued: 0 });
    expect(app.bots!.stats().light).toBeGreaterThanOrEqual(12);
  });

  it("a timed-out seat's move is made at once on the main thread, however busy the pool", async () => {
    // One worker, kept busy by a think that never ends (a brain that spins).
    const bots = createBots({ workers: 1, warm: false, ceilingMs: 60_000, brain: new URL("./fixtures/slowbrain.mjs", import.meta.url) });
    try {
      await bots.ready;
      const game = kitGame("checkers")!;
      const state = tableRoom.setup({ game: "checkers", rules: game.presets[0], seats: 2 }, 3);
      const seat = [0, 1].find((s) => kitHeavy(state as never, s))!;
      // Two bots at two other tables are thinking: one has the worker, one waits.
      const stop = new AbortController();
      void bots.think(state, seat, "Bot", null, { table: "one", signal: stop.signal });
      void bots.think(state, seat, "Bot", null, { table: "two", signal: stop.signal });
      await sleep(20);
      expect(bots.stats()).toMatchObject({ running: 1, queued: 1 });
      // At a third table the turn timer runs out on a person in that seat.
      const table = { settings: tableRoom.settings!({ timer: "15s" }), seats: [0, 1].map((s) => ({ name: s === seat ? "Ann" : "Cy", bot: false })) };
      const due = tableRoom.deadline!(state, table)!;
      expect(due).toMatchObject({ seat, after: 15_000 });
      const began = performance.now();
      const move = due.move();
      expect(performance.now() - began).toBeLessThan(1000);
      expect(move).toEqual(think({ state, seat, name: "Ann", settings: table.settings }) === null ? null : expect.objectContaining({ type: "move" }));
      // It went nowhere near the queue.
      expect(bots.stats()).toMatchObject({ running: 1, queued: 1 });
    } finally {
      await bots.close();
    }
  });

  it("reads CARDROOM_BOT_WORKERS", () => {
    expect(workersFrom(undefined)).toBe(defaultWorkers());
    expect(workersFrom("")).toBe(defaultWorkers());
    expect(workersFrom("0")).toBe(0);
    expect(workersFrom("off")).toBe(0);
    expect(workersFrom("3")).toBe(3);
    expect(workersFrom("lots")).toBe(defaultWorkers());
    expect(defaultWorkers()).toBeGreaterThanOrEqual(1);
    expect(defaultWorkers()).toBeLessThanOrEqual(4);
  });
});
