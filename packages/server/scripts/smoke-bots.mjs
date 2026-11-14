// A check on a running, built server that computer players really do think in worker threads:
//
//   PORT=8790 CARDROOM_BOT_DELAY=50 node packages/server/dist/index.js &
//   node packages/server/scripts/smoke-bots.mjs http://localhost:8790
//
// It sits a person down against a bot at a Checkers table and a Mini Golf table over HTTP, plays the
// person's side from nothing but their view, and reads /healthz/bots to see that the bot's moves
// were thought out in a worker (and none on the main thread, and none given up on). CI runs it
// against `node dist/index.js`, which is where a worker file that can't be found would show.
import { kitGame, movesOffered } from "@cardroom/games";

const origin = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = async () => (await fetch(`${origin}/healthz/bots`)).json();

function browser() {
  let cookie = "";
  return async (path, body) => {
    const r = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const answer = await r.json();
    if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(answer)}`);
    return answer;
  };
}

/** The person's move, from their view: the first thing a board offers, a firm putt, or the button on show. */
function myMove(view) {
  if (view.shoot) return { type: "shot", body: view.shoot.body, angle: 0, power: 400 };
  if (view.grids) return view.turn === view.me || view.turn === null ? (movesOffered(view)[0] ?? null) : null;
  return view.choices?.options?.[0]?.move ?? null;
}

async function play(game, wanted) {
  const send = browser();
  const kit = kitGame(game);
  const before = await stats();
  const { id } = await send("/rooms", { options: { game, rules: kit.presets[0], seats: 2 }, settings: { skill: "hard", pace: "fast" } });
  await send(`/rooms/${id}/sit`, { seat: 0, name: "Smoke" });
  await send(`/rooms/${id}/bot`, { seat: 1, name: "Dot" });
  await send(`/rooms/${id}/start`, {});
  let version = -1;
  for (const began = Date.now(); Date.now() - began < 60_000; ) {
    const now = await stats();
    if (now.thinks - before.thinks >= wanted) {
      if (now.abandoned !== before.abandoned) throw new Error(`${kit.name}: a think was abandoned: ${JSON.stringify(now)}`);
      if (now.onMain !== before.onMain) throw new Error(`${kit.name}: a think fell back to the main thread: ${JSON.stringify(now)}`);
      console.log(`${kit.name}: the bot thought ${now.thinks - before.thinks} moves out in a worker (table ${id})`);
      return;
    }
    const { changes } = await send("/_zb/sync/pull?since=0");
    const mine = changes.filter((c) => c.collection === "views" && c.key === `${id}/0`);
    const view = mine.filter((c) => c.field === "view").at(-1)?.value;
    const seen = mine.filter((c) => c.field === "version").at(-1)?.value ?? 0;
    if (view?.over) throw new Error(`${kit.name}: the game ended before the bot had thought ${wanted} moves out in a worker: ${JSON.stringify(now)}`);
    // One move per state: a move sent twice would be refused the second time.
    if (view && seen !== version) {
      const move = myMove(view);
      if (move) {
        version = seen;
        await send(`/rooms/${id}/act`, { move }).catch(() => {});
        continue;
      }
    }
    await sleep(40);
  }
  throw new Error(`${kit.name}: the bot never moved through a worker: ${JSON.stringify(await stats())}`);
}

let pool = await stats();
if (!pool?.workers) throw new Error(`This server has no bot workers (${JSON.stringify(pool)}): is CARDROOM_BOT_WORKERS 0, or couldn't they start?`);
// Each worker warms up as it starts; a think asked for sooner would only wait, but say how long warming took.
for (let i = 0; i < 300 && pool.warmedMs.length < pool.workers; i++) {
  await sleep(100);
  pool = await stats();
}
console.log(`${pool.workers} worker thread${pool.workers === 1 ? "" : "s"}, warmed up in ${pool.warmedMs.join(" and ")} ms`);
await play("checkers", 4);
await play("minigolf", 3);
console.log(JSON.stringify(await stats()));
