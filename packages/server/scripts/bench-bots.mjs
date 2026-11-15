// What it costs to think in a worker thread instead of on the main thread, game by game:
//
//   npm run build && node packages/server/scripts/bench-bots.mjs
//
// Each game is played by computer players at full skill; every think is done twice, here and in a
// worker (same dice, so the same move), and timed both ways. The difference is the trip: the state
// copied there, the move copied back, and the wait for the worker's reply.
import { kitGame } from "@journey-to-code/games";
import { builtFile, createBotPool } from "../dist/botpool.js";
import { quick, think } from "../dist/brain.js";

const pool = createBotPool({ brain: builtFile("brain"), local: { think, quick }, size: 1, ceilingMs: 60_000 });
await pool.ready;
// Wait for the worker's warm-up, and warm this thread the same way.
while (!pool.stats().warmedMs.length) await new Promise((r) => setTimeout(r, 50));
for (const id of ["minigolf"]) kitGame(id).warmUp?.();

const settings = { skill: "hard", pace: "natural" };
async function play(id, presetId, moves = 150, deal = 7) {
  const game = kitGame(id);
  const rules = game.presets.find((p) => p.id === presetId) ?? game.presets[0];
  const seats = game.seats.default;
  let state = game.newGame(rules, seats, deal);
  const here = [], there = [], copy = [];
  let bytes = 0;
  for (let n = 0; n < moves && !game.summary(state).over; n++) {
    let moved = false;
    for (let seat = 0; seat < seats && !moved; seat++) {
      const job = { state, seat, name: "Bot", settings, seed: n * 31 + seat };
      const a = performance.now();
      const move = think(job);
      const b = performance.now();
      if (move === null) continue;
      const answer = await pool.think(job, { table: id });
      const c = performance.now();
      if (JSON.stringify(answer) !== JSON.stringify(move)) throw new Error(`${id}: the worker played ${JSON.stringify(answer)}, the main thread ${JSON.stringify(move)}`);
      const d = performance.now();
      for (let i = 0; i < 50; i++) structuredClone(job);
      copy.push((performance.now() - d) / 50);
      here.push(b - a);
      there.push(c - b);
      bytes = Math.max(bytes, JSON.stringify(state).length);
      state = game.apply(state, seat, move);
      moved = true;
    }
    if (!moved) break;
  }
  const avg = (list) => list.reduce((x, y) => x + y, 0) / list.length;
  const median = (list) => [...list].sort((x, y) => x - y)[Math.floor(list.length / 2)];
  const ms = (x) => x.toFixed(3).padStart(8);
  console.log(
    `${`${game.name} (${rules.name})`.padEnd(34)} ${String(here.length).padStart(4)} thinks  main avg ${ms(avg(here))} max ${ms(Math.max(...here))}  worker avg ${ms(avg(there))} max ${ms(Math.max(...there))}  trip avg ${ms(avg(there) - avg(here))} median ${ms(median(there.map((t, i) => t - here[i])))}  copy ${ms(avg(copy))}  state ${bytes} B`,
  );
}

// A round first, unmeasured and of other deals, so both threads have run each engine.
const log = console.log;
console.log = () => {};
for (const id of ["gofish", "hearts", "tictactoe", "dropfour", "reversi", "checkers", "minigolf"]) await play(id, undefined, 40, 3);
console.log = log;
console.log("ms per think, computer players at full skill");
await play("gofish");
await play("hearts");
await play("tictactoe", "tictactoe-ultimate");
await play("dropfour");
await play("reversi");
await play("checkers");
await play("checkers", "checkers-international");
await play("minigolf", undefined, 60);
console.log("pool:", JSON.stringify(pool.stats()));
await pool.close();
