// Draws a link-preview image for every game (public/og/<id>.jpg, 1200×630): the game's own tile from
// the front page, big, on the felt, with the parlor's name. And writes public/og/games.json, each
// game's name and line, which the server puts in the page's preview tags for a link to that game
// (server/src/previews.ts). Run it against the dev server when games or their tiles change:
//
//   npm run dev -w @open-parlor/web             # Vite on 5173
//   node packages/web/scripts/og-games.mjs [http://localhost:5173] [only-these ids…]
//
// It needs a Chrome (CHROME=/path/to/chrome if it isn't /usr/bin/google-chrome).
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [server = "http://localhost:5173", ...only] = process.argv.slice(2);
const out = join(dirname(fileURLToPath(import.meta.url)), "../public/og");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" });
const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// The front page as someone who has been before: no intro, every shelf open, nothing starred.
await context.addInitScript(() => {
  localStorage.setItem("parlor.intro", "seen");
  localStorage.setItem("parlor.started", "1");
  localStorage.removeItem("parlor.folded");
  localStorage.removeItem("parlor.favorites");
});
const page = await context.newPage();
await page.goto(server);
await page.waitForSelector(".tile");
await page.waitForTimeout(1500);

// Which tile is which game: the front page's own list (a game that's a page of its own has no ?game= link, and no image).
const games = await page.evaluate(async () => (await import("/src/GamePicker.tsx")).EVERY_GAME.map((g) => ({ id: g.id, name: g.name, blurb: g.blurb, emoji: g.emoji })));
const listPath = join(out, "games.json");
const list = existsSync(listPath) ? JSON.parse(readFileSync(listPath, "utf8")) : {};

await page.addStyleTag({
  content: `
  html.og, html.og body { background: radial-gradient(ellipse 85% 95% at 50% 55%, #2f8a5f 0%, #1e6545 45%, #0f3a28 100%) !important; overflow: hidden !important; }
  html.og body * { visibility: hidden; }
  html.og body::before { display: none !important; }
  html.og .og-pick, html.og .og-pick *, html.og #og-frame, html.og #og-frame * { visibility: visible; }
  html.og .og-pick { position: fixed !important; left: 600px; top: 340px; width: 380px; z-index: 100; translate: -50% -50%; scale: 1.85; list-style: none; }
  html.og .og-pick .star { display: none !important; }
  html.og .og-pick .tile { min-height: 210px; box-shadow: 0 10px 30px rgba(0,0,0,.45); border-color: rgba(232,196,106,.6); background: radial-gradient(ellipse at 85% 20%, rgba(255,255,255,.1), transparent 60%), rgba(8,30,20,.72); }
  #og-frame { position: fixed; inset: 0; z-index: 99; pointer-events: none; box-shadow: inset 0 0 0 14px #3a2417, inset 0 0 0 16px rgba(232,196,106,.35), inset 0 0 120px rgba(0,0,0,.45); }
  #og-frame .brand { position: absolute; left: 0; right: 0; top: 34px; text-align: center; color: #f6efdf; font: 700 34px/1 Georgia, "Times New Roman", serif; letter-spacing: -.01em; }
  #og-frame .brand span { color: #e8c46a; font: 600 22px/1 system-ui, sans-serif; letter-spacing: .4em; margin-right: 12px; vertical-align: 4px; }
  #og-frame .play { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; color: #e8c46a; font: 600 26px/1 system-ui, -apple-system, "Segoe UI", sans-serif; }
`,
});

for (const game of games) {
  if (only.length && !only.includes(game.id)) continue;
  const found = await page.evaluate(({ name }) => {
    document.querySelectorAll(".og-pick").forEach((e) => e.classList.remove("og-pick"));
    document.getElementById("og-frame")?.remove();
    const tile = [...document.querySelectorAll(".grid .tile")].find((t) => t.querySelector("strong")?.textContent?.trim() === name);
    if (!tile) return false;
    tile.parentElement.classList.add("og-pick");
    document.documentElement.classList.add("og");
    const frame = document.createElement("div");
    frame.id = "og-frame";
    frame.innerHTML = `<div class="brand"><span>♠ ♥ ♣ ♦</span>open.parlor</div><div class="play"></div>`;
    frame.querySelector(".play").textContent = `Play ${name} free with family and friends`;
    document.body.append(frame);
    return true;
  }, game);
  if (!found) {
    console.log(`no tile for ${game.id}`);
    continue;
  }
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `${game.id}.jpg`), type: "jpeg", quality: 78 });
  list[game.id] = { name: game.name, blurb: game.blurb };
  console.log(game.id);
}
writeFileSync(listPath, JSON.stringify(Object.fromEntries(Object.entries(list).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");
await browser.close();
