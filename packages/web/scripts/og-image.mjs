// Draws the link-preview image (public/og.jpg, 1200×630) from the app's own cards: a board, dice and cards on
// the felt, with the name and some of the games. Run it against a running parlor when the games
// change:
//
//   npm run dev -w @open-parlor/server            # or any running parlor
//   npm install --no-save puppeteer-core     # once; it isn't a dependency of the app
//   node packages/web/scripts/og-image.mjs [http://localhost:8787] [path/to/og.jpg]
//
// It needs a Chrome or Chromium (CHROME=/path/to/chrome if it isn't /usr/bin/google-chrome).
import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = process.argv[2] ?? "http://localhost:8787";
const out = process.argv[3] ?? new URL("../public/og.jpg", import.meta.url).pathname;
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox", "--font-render-hinting=none"] });
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await p.goto(`${server}/?game=spades`, { waitUntil: "networkidle0" });
await p.evaluate(async () => {
  for (let i = 0; i < 50 && !customElements.get("playing-card"); i++) await new Promise((r) => setTimeout(r, 100));
  document.documentElement.removeAttribute("data-suits");
  document.head.insertAdjacentHTML("beforeend", `<style>
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
    body::before { display: none !important; }
    #og { position: relative; width: 1200px; height: 630px; overflow: hidden; box-sizing: border-box;
      background: radial-gradient(ellipse 80% 90% at 68% 55%, #2f8a5f 0%, #1e6545 45%, #0f3a28 100%); }
    #og::after { content: ""; position: absolute; inset: 0; box-shadow: inset 0 0 0 14px #3a2417, inset 0 0 0 16px rgba(232,196,106,.35), inset 0 0 120px rgba(0,0,0,.45); pointer-events: none; }
    #og .words { position: absolute; left: 76px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; gap: 14px; color: #f6efdf; }
    #og .suits { font: 600 30px/1 "Apple Symbols", "Noto Sans Symbols 2", "Segoe UI Symbol", serif; letter-spacing: .5em; color: #e8c46a; }
    #og h1 { margin: 0; font: 700 96px/1 Georgia, "Times New Roman", serif; letter-spacing: -.01em; text-shadow: 0 4px 18px rgba(0,0,0,.35); }
    #og .tag { margin: 0; font: italic 400 36px/1.25 Georgia, serif; color: #f1e6cc; }
    #og .games { margin: 10px 0 0; font: 600 25px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e8c46a; }
    #og .fan { position: absolute; left: 915px; top: 700px; width: 0; height: 0; --card-w: 150px; --card-h: 210px; }
    #og .fan .slot { position: absolute; left: -75px; top: -505px; transform-origin: 75px 505px; filter: drop-shadow(0 14px 22px rgba(0,0,0,.45)); }
  </style>`);
  document.body.innerHTML = `<div id="og"><div class="words"><div class="suits">♠ ♥ ♣ ♦</div><h1>open.parlor</h1><p class="tag">Family card and board games</p><p class="games">Spades · Palace · Hearts · Euchre<br>Chess · Go · Backgammon · Yacht<br>Mini Golf · Checkers · and more</p></div><div class="fan"></div></div>`;
  // The right half: a board with checkers and a Go stone, two dice, and two cards, so it reads as a
  // whole game room and not only a deck.
  const fan = document.querySelector("#og .fan");
  fan.style.cssText = "position:absolute;left:0;top:0;width:1200px;height:630px;--card-w:130px;--card-h:182px";
  const squares = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) squares.push(`<rect x="${c * 50}" y="${r * 50}" width="50" height="50" fill="${(r + c) % 2 ? "#2a6b4b" : "#efe3c4"}"/>`);
  const disc = (c, r, fill, edge) => `<circle cx="${c * 50 + 25}" cy="${r * 50 + 25}" r="19" fill="${fill}" stroke="${edge}" stroke-width="3"/><circle cx="${c * 50 + 25}" cy="${r * 50 + 25}" r="11" fill="none" stroke="${edge}" stroke-width="2" opacity=".5"/>`;
  const board = `<svg viewBox="0 0 300 300" width="300" height="300" style="position:absolute;left:660px;top:120px;transform:rotate(-8deg);filter:drop-shadow(0 14px 22px rgba(0,0,0,.45))"><rect x="-8" y="-8" width="316" height="316" rx="8" fill="#3a2417"/>${squares.join("")}${disc(1, 0, "#b3261e", "#6e1511")}${disc(3, 0, "#b3261e", "#6e1511")}${disc(2, 1, "#b3261e", "#6e1511")}${disc(5, 1, "#b3261e", "#6e1511")}${disc(0, 4, "#22201c", "#000")}${disc(2, 5, "#22201c", "#000")}${disc(4, 4, "#22201c", "#000")}${disc(3, 3, "#22201c", "#000")}</svg>`;
  const pips = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  const die = (n, x, y, rot) => `<svg viewBox="0 0 100 100" width="92" height="92" style="position:absolute;left:${x}px;top:${y}px;transform:rotate(${rot}deg);filter:drop-shadow(0 10px 14px rgba(0,0,0,.45))"><rect x="4" y="4" width="92" height="92" rx="18" fill="#f8f1e0" stroke="#cdbf9c" stroke-width="2"/>${pips[n].map(([c, r]) => `<circle cx="${26 + c * 24}" cy="${26 + r * 24}" r="8" fill="${n === 1 ? "#b3261e" : "#1c1a17"}"/>`).join("")}</svg>`;
  fan.insertAdjacentHTML("beforeend", board + die(5, 940, 400, 14) + die(2, 1040, 330, -10));
  [[13, "hearts", 930, 90, 12], [14, "spades", 860, 130, -6]].forEach(([rank, suit, x, y, rot]) => {
    const slot = document.createElement("div");
    slot.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:rotate(${rot}deg);filter:drop-shadow(0 14px 22px rgba(0,0,0,.45))`;
    const el = document.createElement("playing-card");
    el.card = { kind: "pip", rank, suit };
    el.size = "hand";
    slot.append(el);
    fan.append(slot);
  });
});
await sleep(800);
await p.screenshot({ path: out, type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await b.close();
console.log("wrote", out);
