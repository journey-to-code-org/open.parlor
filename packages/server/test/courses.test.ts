// Mini Golf courses people make (courses.ts): saved like card designs, shared or not, a new version
// with each change of holes, and played at real tables, by people and by the computer players in
// their worker threads.
import { COURSES } from "@journey-to-code/games";
import { starterHole, unregisterCourse, type CustomHole } from "@open-parlor/courses";
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { builtFile, createBotPool } from "../src/botpool.js";
import { quick, think, type ThinkJob } from "../src/brain.js";
import { tableRoom } from "../src/games.js";

const BASE = "http://test";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const drawn = (name: string, rows: string[], par = 3): CustomHole => ({ name, par, tip: "", cols: rows[0]!.length, rows: rows.length, cells: rows.join("") });
const dogleg = drawn("Dogleg", [".......", ".ggggc.", ".g###..", ".g#....", ".g#....", ".gtg...", "......."]);

let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(async () => {
  await Promise.all(open.map((a) => a.close()));
  open = [];
});

function setup(extra: Parameters<typeof createCardRoom>[0] = {}) {
  let clock = 1_000_000;
  const log = memoryLog({ keep: "latest" });
  const app = createCardRoom({ log, botDelay: 1, talk: false, ...extra });
  open.push(app);
  const phone = () => {
    let cookie = "";
    return async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie, ...headers }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: r.status, body: await r.json() };
    };
  };
  /** What seat 0 sees at a table. */
  const view = async (id: string) => ((await app.rooms.sync.documents()).get("views", `${id}/0`) as { view: { table: { key: string; name: string } } }).view;
  return { app, log, phone, view, tick: (ms = 2000) => (clock += ms) };
}

describe("Mini Golf courses people make", () => {
  it("saves a course for its maker, shares it with everyone, and refuses a hole that can't be played", async () => {
    const { phone } = setup();
    const maker = phone();
    const other = phone();
    expect((await maker("/courses", { course: { name: "No cup", holes: [drawn("X", ["ggggg", "ggtgg", "ggggg", "ggggg", "ggggg"])] } })).body).toMatchObject({ error: "X needs a cup." });

    const made = (await maker("/courses", { course: { name: "Grammi's Garden", holes: [starterHole(1), dogleg] }, author: "brokennil" })).body;
    expect(made).toMatchObject({ author: "brokennil", shared: false, mine: true, game: `custom-${made.id}-1` });
    expect(made.course.holes).toHaveLength(2);
    expect(JSON.stringify(made)).not.toMatch(/owner/);
    // Private: its maker sees it; nobody else does, not even at its link.
    expect((await maker("/courses")).body.courses.map((c: { id: string }) => c.id)).toEqual([made.id]);
    expect((await other("/courses")).body.courses).toEqual([]);
    expect((await other(`/courses/${made.id}`)).status).toBe(404);

    // Shared: in everyone's gallery, but only its maker changes it.
    await new Promise((r) => setTimeout(r, 1600));
    expect((await maker(`/courses/${made.id}`, { shared: true })).body).toMatchObject({ shared: true, game: `custom-${made.id}-1` });
    expect((await other("/courses")).body.courses).toMatchObject([{ id: made.id, mine: false, author: "brokennil" }]);
    expect((await other(`/courses/${made.id}`, { shared: false })).status).toBe(403);

    // Crude words in a shared course's names are covered.
    await new Promise((r) => setTimeout(r, 1600));
    const rude = (await other("/courses", { course: { name: "Shit Hole", holes: [starterHole(1)] } })).body;
    expect(rude.course.name).toBe("•••• Hole");
  });

  it("each change of holes is a new version, and a table plays the version it started on", async () => {
    const { log, phone, view } = setup();
    const maker = phone();
    const made = (await maker("/courses", { course: { name: "Two Holes", holes: [starterHole(1), dogleg] }, shared: true })).body;
    const v1 = made.game as string;
    expect(COURSES.some((c) => c.id === v1)).toBe(true);

    // A table on version 1: two players, dealt.
    const table = (await maker("/rooms", { options: { game: "minigolf", rules: { id: "minigolf-nine", course: v1 }, seats: 1 } })).body.id as string;
    expect((await maker(`/rooms/${table}`)).body.info).toMatchObject({ game: "minigolf" });
    await maker(`/rooms/${table}/sit`, { seat: 0, name: "Me" });
    await maker(`/rooms/${table}/start`, {});
    expect((await view(table)).table).toMatchObject({ key: `${v1}/${v1}-1`, name: "Hole 1: Hole 1" });

    // The maker changes the first hole: version 2. Saving the same holes again isn't a new one.
    await new Promise((r) => setTimeout(r, 1600));
    const v2 = (await maker(`/courses/${made.id}`, { course: { name: "Two Holes", holes: [{ ...dogleg, name: "Now first" }, starterHole(2)] } })).body.game as string;
    expect(v2).toBe(`custom-${made.id}-2`);
    await new Promise((r) => setTimeout(r, 1600));
    expect((await maker(`/courses/${made.id}`, { course: { name: "Two Holes", holes: [{ ...dogleg, name: "Now first" }, starterHole(2)] } })).body.game).toBe(v2);
    // Both versions are still there, and the table is still on the first.
    expect(COURSES.filter((c) => c.id.startsWith(`custom-${made.id}-`)).map((c) => c.id)).toEqual([v1, v2]);
    expect((await view(table)).table.name).toBe("Hole 1: Hole 1");

    // After a restart the versions come back from the log, before anyone asks.
    unregisterCourse(v1);
    unregisterCourse(v2);
    const again = createCardRoom({ log, botDelay: 1, talk: false });
    open.push(again);
    await again.courses.ready;
    expect(COURSES.filter((c) => c.id.startsWith(`custom-${made.id}-`)).map((c) => c.id)).toEqual([v1, v2]);
  });

  it("a deleted or hidden course takes no new tables; one we don't have can't be asked for", async () => {
    const { phone } = setup({ adminToken: "admin-token" });
    const maker = phone();
    const made = (await maker("/courses", { course: { name: "Short Lived", holes: [starterHole(1)] }, shared: true })).body;
    const host = (path: string, body?: unknown) => phone()(`/moderation${path}`, body, { authorization: "Bearer admin-token" });
    const table = (rules: unknown) => maker("/rooms", { options: { game: "minigolf", rules, seats: 1 } });

    expect((await table({ course: made.game })).status).toBe(201);
    expect((await host("/courses")).body.courses).toMatchObject([{ id: made.id, author: "Someone", hidden: "" }]);
    expect((await host(`/courses/${made.id}/hide`, { reason: "Not nice" })).status).toBe(200);
    expect((await table({ course: made.game })).body.error).toBe("That course was taken out of the gallery.");
    expect((await phone()("/courses")).body.courses).toEqual([]);
    expect((await maker(`/courses/${made.id}`)).body.hidden).toBe("Not nice");
    await host(`/courses/${made.id}/restore`, {});
    expect((await table({ course: made.game })).status).toBe(201);

    expect((await maker(`/courses/${made.id}/delete`, {})).body).toEqual({ ok: true });
    expect((await table({ course: made.game })).body.error).toBe("That course has been deleted.");
    expect((await table({ course: "custom-nosuch-1" })).body.error).toBe("That course isn't one we have.");
  });

  it("the computer players play a course people made, thinking in a worker thread", async () => {
    const { app, phone } = setup({ bots: { workers: 1, warm: false } });
    await app.bots!.ready;
    const made = (await phone()("/courses", { course: { name: "Bot Garden", holes: [dogleg] }, shared: true })).body;
    const id = await app.rooms.create({ game: "minigolf", rules: { id: "minigolf-nine", course: made.game }, seats: 2 }, { skill: "hard", pace: "instant" });
    await app.rooms.seatBot(id, 0, "Dot");
    await app.rooms.seatBot(id, 1, "Bot");
    expect(await app.rooms.start(id)).toBeNull();
    const over = async () => {
      const s = (await app.rooms.room(id))?.summary as { phase?: string; over?: boolean } | undefined;
      return s?.phase === "finished" || s?.over === true;
    };
    for (let i = 0; i < 1200 && !(await over()); i++) await sleep(25);
    expect(await over()).toBe(true);
    const stats = app.bots!.stats();
    expect(stats.thinks).toBeGreaterThan(0);
    expect(stats).toMatchObject({ abandoned: 0, onMain: 0 });
  }, 40_000);

  it("a worker thread is handed the course with the think, and works out the same putt as this thread", async () => {
    const { phone, app } = setup();
    const made = (await phone()("/courses", { course: { name: "Same Putt", holes: [dogleg] }, shared: true })).body;
    const state = tableRoom.setup({ game: "minigolf", rules: { id: "minigolf-nine", course: made.game }, seats: 1 }, 5);
    const job: ThinkJob = { state, seat: 0, name: "Dot", settings: { skill: "hard" }, budget: { ms: 2000 }, seed: 11 };
    const here = think(job);
    const pool = createBotPool<ThinkJob>({ brain: builtFile("brain"), local: { think, quick }, size: 1, ceilingMs: 60_000 });
    try {
      await pool.ready;
      const signal = new AbortController().signal;
      // Not handed the holes, the worker's own copy of the game plays the Back Garden: another putt.
      expect(await pool.think(job, { table: "u", signal })).not.toEqual(here);
      // Handed them, it aims at this course's cup, and keeps them for the thinks after.
      expect(await pool.think({ ...job, courses: [{ id: made.game, course: app.courses.courseNow(made.game)! }] }, { table: "t", signal })).toEqual(here);
      expect(await pool.think(job, { table: "v", signal })).toEqual(here);
    } finally {
      await pool.close();
    }
  }, 40_000);
});
