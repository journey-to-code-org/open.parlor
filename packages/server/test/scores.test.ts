// A house's arcade scores: a run is played again on the server, and only what it really earns is
// kept, one best for each member for each set of rules and crew.
import { memoryLog } from "@zubra/sync/server";
import { ARCADE_GAMES, arcadeGame, recorder, type ArcadeGameId } from "@journey-to-code/games";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";

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
  return { slug: made.slug as string, owner, friend, stranger: phone() };
}

/** Play a game to its end with computer players at the controls, and write the run down. `skill` 0 plays badly. */
function play(id: ArcadeGameId, seed: number, skill = 0.75, seats = 1) {
  const game = arcadeGame(id)!;
  const rules = game.presets[0]!;
  const state = game.newGame(rules, seats, seed);
  const rec = recorder(game, seats);
  let r = seed >>> 0;
  const rand = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < game.rate * 60 * 40 && !game.view(state).over; i++) {
    const inputs = Array.from({ length: seats }, (_, seat) => game.bot(state, seat, { skill, sloppy: skill ? 0.04 : 0.5 }, rand));
    game.step(state, rec.tick(inputs));
  }
  expect(game.view(state).over).toBe(true);
  return { game: id, rules, seats, seed, log: rec.log, score: game.summary(state).score };
}

describe("a house's arcade scores", () => {
  it("keeps a run that earns its score, for every arcade game", async () => {
    const { slug, owner } = await house();
    for (const game of ARCADE_GAMES) {
      const run = play(game.id, 11);
      const sent = await owner(`/houses/${slug}/scores`, run);
      expect(sent.status, game.id).toBe(200);
      expect(sent.body).toMatchObject({ kept: true, best: run.score });
      expect(sent.body.runs).toMatchObject([{ name: "McMikey", me: true, score: run.score, seed: 11, seats: 1 }]);
      expect(sent.body.runs[0].rules).toEqual(game.normalize(run.rules));
      expect(sent.body.runs[0].log).toBeUndefined();
    }
  }, 120_000);

  it("refuses a run that claims more than it earns, is not over, or is not a run", async () => {
    const { slug, owner, stranger } = await house();
    const run = play("skyfire", 5, 0);
    expect((await owner(`/houses/${slug}/scores`, { ...run, score: run.score + 100 })).body.error).toBe("That run does not earn that score.");
    expect((await owner(`/houses/${slug}/scores`, { ...run, seed: 6 })).status).toBe(400);
    const cut = { changes: run.log.changes.filter((c) => c[0] < 60), ticks: 60 };
    expect((await owner(`/houses/${slug}/scores`, { ...run, log: cut, score: 0 })).body.error).toBe("That run is not over.");
    expect((await owner(`/houses/${slug}/scores`, { ...run, log: { changes: [], ticks: 1e12 } })).status).toBe(400);
    // Packed, it is the same run; packed nonsense is not one.
    const { log, ...rest } = run;
    expect((await owner(`/houses/${slug}/scores`, { ...rest, logz: "not gzip at all" })).status).toBe(400);
    expect((await owner(`/houses/${slug}/scores`, { ...rest, logz: gzipSync(JSON.stringify(log)).toString("base64"), score: run.score + 1 })).body.error).toBe("That run does not earn that score.");
    expect((await owner(`/houses/${slug}/scores`, { ...rest, logz: gzipSync(JSON.stringify(log)).toString("base64") })).body).toMatchObject({ kept: true, best: run.score });
    for (const bad of [{ log: null }, { seats: 99 }, { seed: -1 }, { score: 1.5 }, { game: "hearts" }, { log: { changes: "x", ticks: 3 } }]) {
      expect((await owner(`/houses/${slug}/scores`, { ...run, ...bad })).status).toBe(400);
    }
    expect((await stranger(`/houses/${slug}/scores`, run)).status).toBe(403);
    expect((await stranger(`/houses/${slug}/scores?game=skyfire`)).status).toBe(403);
    expect((await owner(`/houses/${slug}/scores?game=delbies`)).status).toBe(400);
    expect((await owner(`/houses/${slug}/scores?game=skyfire`)).body.runs).toHaveLength(1);
  }, 120_000);

  it("keeps each member's best for a set of rules, best first, with the seed to take it on", async () => {
    const { slug, owner, friend } = await house();
    const poor = play("skyfire", 21, 0);
    const good = play("skyfire", 22, 0.9);
    expect(good.score).toBeGreaterThan(poor.score);
    await owner(`/houses/${slug}/scores`, good);
    // A worse run does not replace a better one.
    expect((await owner(`/houses/${slug}/scores`, poor)).body).toMatchObject({ kept: false, best: good.score });
    await friend(`/houses/${slug}/scores`, poor);
    // The same seed, played by the friend: it is theirs once it beats their own.
    const again = await friend(`/houses/${slug}/scores`, good);
    expect(again.body.kept).toBe(true);
    const duo = play("skyfire", 23, 0.75, 2);
    await friend(`/houses/${slug}/scores`, duo);
    const { runs } = (await owner(`/houses/${slug}/scores?game=skyfire`)).body;
    const solo = runs.filter((r: { seats: number }) => r.seats === 1);
    expect(solo.map((r: { name: string }) => r.name)).toEqual(["McMikey", "Dubs"]);
    expect(solo.every((r: { seed: number; score: number }) => r.seed === 22 && r.score === good.score)).toBe(true);
    expect(solo[0].board).toBe(solo[1].board);
    // With a computer player it is another board.
    const pair = runs.filter((r: { seats: number }) => r.seats === 2);
    expect(pair).toMatchObject([{ name: "Dubs", me: false, seed: 23 }]);
    expect(pair[0].board).not.toBe(solo[0].board);
  }, 120_000);
});
