// Does the house chat leave anything behind when it leaves the page?
//
// Opens a house's page with a long chat (a poll among the messages), then goes to one of the
// house's tables and back, inside the app, many times: each time the Vue island, its Zubra
// components, the Sync collection element and the dialogs teleported to the body are made and
// taken away again. Before and after, it forces a garbage collection and reads Chrome's own
// counters: the JavaScript heap, the DOM nodes still alive (on the page or held by something), and
// the event listeners. It also counts the live streams opened to /_zb/chat (the page keeps one).
//
// A leak shows as nodes or listeners that grow with every trip. A heap a few hundred KB larger
// after is the JIT and caches warming up; it should not grow with the number of trips.
//
//   node packages/web/scripts/house-chat-leaks.mjs [http://localhost:8787] [trips]
//
// Needs a parlor running at that address (`npm start` after `npm run build`) and Playwright's
// Chromium (`npx playwright install chromium`, or CHROMIUM=<path to chrome>).
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:8787";
const trips = Number(process.argv[3] ?? 30);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-sandbox", "--js-flags=--expose-gc"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const other = await browser.newContext();

const house = await (await context.request.post(`${base}/houses`, { data: { name: "Leak Check", you: "Mikey" } })).json();
await other.request.post(`${base}/houses/${house.slug}/join`, { data: { code: house.code, name: "Grammi" } });
const say = (ctx, body) => ctx.request.post(`${base}/houses/${house.slug}/chat`, { data: body });
for (let i = 0; i < 60; i++) {
  await say(i % 2 ? other : context, { text: `Line ${i}: ${"words ".repeat(1 + (i % 7))}` });
  // The chat lets each person say five things in ten seconds.
  if (i % 8 === 7) await new Promise((r) => setTimeout(r, 10_500));
}
await say(context, { poll: { question: "Spades or Palace?", options: ["Spades", "Palace", "Both"] } });
await context.request.post(`${base}/houses/${house.slug}/tables`, { data: { game: "spades" } });

const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
let streams = 0;
page.on("request", (r) => r.url().includes("/_zb/chat/live") && streams++);
const cdp = await context.newCDPSession(page);

async function measure() {
  for (let i = 0; i < 3; i++) {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(200);
  }
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  const { nodes, jsEventListeners } = await cdp.send("Memory.getDOMCounters");
  const onPage = await page.evaluate(() => ({ rooms: document.querySelectorAll("chat-room").length, dialogs: document.querySelectorAll("dialog").length }));
  return { heapKB: Math.round(usedSize / 1024), nodes, listeners: jsEventListeners, ...onPage };
}

async function trip() {
  await page.locator(".house-list li").first().getByRole("button").click();
  await page.locator("chat-room").waitFor({ state: "detached" });
  await page.waitForTimeout(400);
  await page.goBack();
  await page.locator("chat-room .chat-msg").first().waitFor();
  await page.waitForTimeout(400);
}

await page.goto(`${base}/?house=${house.slug}`);
await page.locator("chat-room .chat-msg[data-poll]").waitFor({ timeout: 15_000 });
// Warm up: the first trips load the table's code and fill caches.
for (let i = 0; i < 3; i++) await trip();
const before = await measure();
for (let i = 0; i < trips; i++) await trip();
const after = await measure();

const per = (key) => ((after[key] - before[key]) / trips).toFixed(1);
console.log(`${trips} trips from the house page to a table and back`);
console.log("before:", before);
console.log("after: ", after);
console.log(`per trip: ${per("nodes")} nodes, ${per("listeners")} listeners, ${per("heapKB")} KB of heap`);
console.log(`live streams opened to /_zb/chat: ${streams}`);
console.log(`errors: ${errors.length ? errors.join("; ") : "none"}`);
await browser.close();
