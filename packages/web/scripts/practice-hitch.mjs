// How much a computer player's think freezes the page in practice mode, measured in headless Chrome
// with the CPU slowed four times (a middling phone):
//
//   node packages/web/scripts/practice-hitch.mjs http://localhost:8787 [runs]
//
// against a running parlor (any server that serves the built web app). It plays practice games
// of Checkers (International, the big board) and Mini Golf (all at once, five computer players) at
// full skill, and reports the main thread's long tasks and the longest gap between two frames while
// the computer players are thinking. Chrome and playwright-core are the ones the conformance tests use.
import { chromium } from "playwright-core";

const origin = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const runs = Number(process.argv[3] ?? 3);
const THROTTLE = 4;

/** Runs in the page before anything else: seeded dice (so every run deals the same game), and the watching. */
function watch() {
  let a = 0x2f6e2b1;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const seen = { tasks: [], gaps: [], on: false, workers: 0 };
  window.__seen = seen;
  new PerformanceObserver((list) => {
    if (seen.on) for (const entry of list.getEntries()) seen.tasks.push(entry.duration);
  }).observe({ entryTypes: ["longtask"] });
  let last = performance.now();
  const frame = (now) => {
    if (seen.on) seen.gaps.push(now - last);
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const Real = window.Worker;
  window.Worker = class extends Real {
    constructor(...args) {
      super(...args);
      seen.workers += 1;
    }
  };
}

async function measure(browser, game, rules, seats, play) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();
  await page.addInitScript(watch);
  await page.addInitScript(
    ([game, rules, seats]) => {
      localStorage.setItem("cardroom:tableSettings", JSON.stringify({ skill: "hard", pace: "fast" }));
      localStorage.setItem(`cardroom:${game}:last`, JSON.stringify(rules));
      localStorage.setItem(`cardroom:${game}:seats`, JSON.stringify(seats));
    },
    [game, rules, seats],
  );
  await page.goto(`${origin}/?game=${game}`);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.getByRole("button", { name: "Practice against the computer" }).click();
  await page.waitForSelector("main.table");
  await page.waitForTimeout(1500); // the table has settled; the worker (if any) has warmed
  await page.evaluate(() => void (window.__seen.on = true));
  await play(page);
  const seen = await page.evaluate(() => window.__seen);
  await context.close();
  const sum = (list) => list.reduce((x, y) => x + y, 0);
  return { tasks: seen.tasks.length, worstTask: Math.max(0, ...seen.tasks), taskTime: sum(seen.tasks), worstGap: Math.max(0, ...seen.gaps), over100: seen.gaps.filter((g) => g > 100).length, workers: seen.workers };
}

/** Checkers: the person plays the first piece that can move to the first place it can go, twelve times. */
async function checkers(page) {
  for (let moves = 0; moves < 12; ) {
    if (await page.locator(".board-over, .won-sheet").count()) break;
    const piece = page.locator(".cell.source").first();
    if (!(await piece.count())) {
      await page.waitForTimeout(50);
      continue;
    }
    await piece.click();
    // A capture carries on with the same piece: keep tapping while there's somewhere to go.
    const to = page.locator(".cell.target").first();
    if (await to.count()) await to.click();
    moves += 1;
    await page.waitForTimeout(700);
  }
}

/**
 * Mini Golf, all at once: the computer players putt away on their own while the person putts
 * straight at the cup (the Putt button) and moves everyone on to the next hole, for forty seconds.
 * The first hole is a tap-in; the thinking is on the holes after it.
 */
async function miniGolf(page) {
  for (const began = Date.now(); Date.now() - began < 40_000; ) {
    const next = page.locator(".sheet button.primary, .kit-choices button.primary").first();
    const putt = page.getByRole("button", { name: "Putt", exact: true });
    if (await next.count()) await next.click().catch(() => {});
    else if ((await putt.count()) && (await putt.isEnabled())) await putt.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const international = { id: "checkers-international", name: "International (10×10)", size: 10, backward: true, flying: true, forced: true, most: true, crowning: "pass", opens: "light", first: "seat2", quiet: 40, games: 1 };
const together = { id: "minigolf-together", name: "Nine holes, all at once", course: "back-garden", holes: 9, order: "together", limit: 6, penalty: 1 };
const ms = (x) => `${Math.round(x)} ms`;
console.log(`${origin}, CPU slowed ${THROTTLE}×, ${runs} run${runs === 1 ? "" : "s"} each`);
for (const [name, ...scene] of [["Checkers (International)", "checkers", international, 2, checkers], ["Mini Golf (all at once, 5 bots)", "minigolf", together, 6, miniGolf]]) {
  for (let run = 1; run <= runs; run++) {
    const r = await measure(browser, ...scene);
    console.log(`${name.padEnd(32)} run ${run}: longest frame gap ${ms(r.worstGap).padStart(8)}, frames over 100 ms ${String(r.over100).padStart(3)}, long tasks ${String(r.tasks).padStart(3)} (worst ${ms(r.worstTask)}, ${ms(r.taskTime)} in all), workers started ${r.workers}`);
  }
}
await browser.close();
