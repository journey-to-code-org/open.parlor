// The open.parlor server: rooms (moves, seats, bots), the sync log, and the built apps: the parlor
// itself at /, the card designer at /designer/, the watch page at /watch/, the admin app at /admin/
// and the WebAssembly games at /wasm/.
//
//   PORT=8787 CARDROOM_DB=cardroom.db node dist/index.js
//
// Settings are CARDROOM_*; the older SPADES_* names still work (CARDROOM_* wins if both are set).
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { WebSocketServer } from "ws";
import { playerOf } from "@journey-to-code/rooms/server";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createCardRoom } from "./app.js";
import { createBackups } from "./backup.js";
import { workersFrom } from "./bots.js";
import { warmSports } from "./kit.js";
import { lanNotice } from "./lan.js";

/** A setting: CARDROOM_<name>, or the older SPADES_<name>. */
function setting(name: string): string | undefined {
  const now = process.env[`CARDROOM_${name}`];
  const old = process.env[`SPADES_${name}`];
  if (now === undefined && old !== undefined) console.log(`SPADES_${name} is now CARDROOM_${name} (the old name still works)`);
  return now ?? old;
}

const port = Number(process.env.PORT ?? 8787);
const web = resolve(setting("WEB") ?? fileURLToPath(new URL("../../web/dist", import.meta.url)));
// The other apps live under the parlor's address, each from its own build.
const apps = [
  { at: "/designer/", root: resolve(setting("DESIGNER") ?? fileURLToPath(new URL("../../designer/dist", import.meta.url))), build: "npm run build -w @open-parlor/designer" },
  { at: "/watch/", root: resolve(setting("WATCH") ?? fileURLToPath(new URL("../../watch/dist", import.meta.url))), build: "npm run build -w @open-parlor/watch" },
  { at: "/admin/", root: resolve(setting("ADMIN") ?? fileURLToPath(new URL("../../admin/dist/browser", import.meta.url))), build: "npm run build -w @open-parlor/admin" },
  { at: "/wasm/", root: resolve(setting("WASM") ?? fileURLToPath(new URL("../../wasm/dist", import.meta.url))), build: "npm run build -w @open-parlor/wasm" },
];

// A SQLite log keeps tables across restarts; without CARDROOM_DB, they live in memory.
const db = setting("DB");
const log = db ? await (await import("@zubra/sync/sqlite")).sqliteLog(db, { keep: "latest" }) : undefined;
// Copies of that database, beside it unless CARDROOM_BACKUPS says where ("off" for none).
const backupDir = setting("BACKUPS");
const backups = db && db !== ":memory:" && backupDir !== "off" ? createBackups({ db, dir: backupDir || undefined, keep: Number(setting("BACKUP_KEEP")) || undefined, hours: Number(setting("BACKUP_HOURS")) || undefined }) : undefined;
// Bots take humanlike time unless CARDROOM_BOT_DELAY fixes it (handy for testing).
const botDelay = setting("BOT_DELAY");
const cardRoom = createCardRoom({
  log,
  botDelay: botDelay ? Number(botDelay) : undefined,
  // Moderation (the admin app) is on when the server has an admin token.
  adminToken: setting("ADMIN_TOKEN"),
  backups,
  // Push notifications are on when the server has VAPID keys (`npx web-push generate-vapid-keys`).
  push: {
    publicKey: setting("VAPID_PUBLIC_KEY"),
    privateKey: setting("VAPID_PRIVATE_KEY"),
    subject: setting("VAPID_SUBJECT"),
  },
  // Words that names on open tables may not contain, on top of the built-in list.
  // "Report a problem" opens an issue on GitHub when the server has a token that may (see the README).
  bugs: { token: setting("GITHUB_TOKEN"), repo: setting("GITHUB_REPO"), version: setting("VERSION") ?? process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) },
  lobby: { blockedNames: (setting("BLOCKED_NAMES") ?? "").split(",").map((w) => w.trim()).filter(Boolean) },
  // Houses can connect their own AI key for their bots' table talk; this seals those keys at rest.
  // CARDROOM_AI_KEY is the parlor's own key: with it, every table's bots talk through a model.
  // Computer players think in worker threads: as many as CARDROOM_BOT_WORKERS says (0 for none), or
  // what suits the machine. The workers start, and warm up, while the server is already listening.
  bots: { workers: workersFrom(setting("BOT_WORKERS")), budgetMs: Number(setting("BOT_BUDGET")) || undefined, ceilingMs: Number(setting("BOT_CEILING")) || undefined },
  ai: { secret: setting("SECRET"), shared: { key: setting("AI_KEY"), provider: setting("AI_PROVIDER"), model: setting("AI_MODEL"), daily: Number(setting("AI_DAILY")) || undefined } },
});
if (!setting("SECRET")) console.log("houses' AI keys are stored unsealed: set CARDROOM_SECRET to encrypt them");
if (db && !backups) console.log("backups are off (CARDROOM_BACKUPS=off): nothing copies the database");
if (!cardRoom.moderation.enabled) console.log("moderation is off: set CARDROOM_ADMIN_TOKEN to turn on the admin app at /admin/");
if (!cardRoom.bugs.enabled) console.log("players can't report problems: set CARDROOM_GITHUB_TOKEN (a token that may open issues) to turn that on");
if (!cardRoom.push.enabled) console.log("push notifications are off: set CARDROOM_VAPID_PUBLIC_KEY and CARDROOM_VAPID_PRIVATE_KEY to turn them on");

/**
 * This server's own address, for link previews: from the proxy's headers (Railway) or the Host header.
 * Anything that isn't a plain host name and port is refused, so nothing odd lands in the page.
 */
function originOf(headers: Record<string, string | string[] | undefined>): string {
  const first = (h: string | string[] | undefined) => String(Array.isArray(h) ? h[0] : (h ?? "")).split(",")[0]!.trim();
  const host = first(headers["x-forwarded-host"]) || first(headers.host);
  const proto = first(headers["x-forwarded-proto"]) === "https" ? "https" : "http";
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `${proto}://${host}` : "";
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  // A browser compiles a .wasm file as it downloads only when it is served as one.
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    // Railway (and any other host) checks this before sending traffic to a new deploy.
    if (req.url === "/healthz") return void res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    // How the computer players' thinking is going: workers, thinks waiting and running, how long they take.
    if (req.url === "/healthz/bots") return void res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(cardRoom.bots?.stats() ?? null));
    if (await cardRoom.handle(req, res)) return;
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    // /designer and /admin are their apps' front doors: with the slash, so their files resolve.
    const bare = apps.find((a) => `${path}/` === a.at);
    if (bare) return void res.writeHead(308, { location: bare.at }).end();
    const app = apps.find((a) => path.startsWith(a.at));
    const root = app?.root ?? web;
    let file = normalize(join(root, app ? path.slice(app.at.length) : path));
    if (file !== root && !file.startsWith(root + sep)) return void res.writeHead(403).end();
    // The embed's files are fetched by other sites' pages: a missing one is a 404, never the app.
    const embed = !app && path.startsWith("/embed/");
    if (embed && (!existsSync(file) || statSync(file).isDirectory())) return void res.writeHead(404).end();
    // Nor is a game's data that isn't there: the page would take the app's HTML for the game.
    if (app?.at === "/wasm/" && path.startsWith("/wasm/data/") && !existsSync(file)) return void res.writeHead(404).end();
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html"); // the app routes itself
    if (!existsSync(file)) return void res.writeHead(404).end(`Build the app first: ${app?.build ?? "npm run build -w @open-parlor/web"}`);
    // The page and the service worker must never be stale; the hashed assets can be cached for good.
    const fresh = file.endsWith("index.html") || file.endsWith("sw.js") || file.endsWith(".webmanifest");
    const hashed = /[.-][A-Za-z0-9_-]{8,}\.(js|css|woff2|wasm)$/.test(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": fresh ? "no-cache" : path.startsWith("/assets/") || (app && hashed) ? "public, max-age=31536000, immutable" : embed ? "public, max-age=300" : "public, max-age=3600",
      // A <script type="module"> on another site fetches with CORS.
      ...(embed ? { "access-control-allow-origin": "*", "cross-origin-resource-policy": "cross-origin" } : {}),
      // The admin app is nobody else's business: not in a frame, not in a search engine.
      ...(app?.at === "/admin/" ? { "x-frame-options": "DENY", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" } : {}),
    });
    // The page carries link-preview tags whose image needs this server's full address.
    if (file.endsWith("index.html")) return void res.end(readFileSync(file, "utf8").replaceAll("__ORIGIN__", originOf(req.headers)));
    createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
// A table's live game (Shitstorm): pages hold a socket open at /live/<table>. Controls come in on it,
// and what every seat's controls did on each tick goes out.
const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on("upgrade", (req, socket, head) => {
  const match = /^\/live\/([A-Za-z0-9_-]{1,40})$/.exec(new URL(req.url ?? "/", "http://x").pathname);
  if (!match) return socket.destroy();
  sockets.handleUpgrade(req, socket, head, (ws) => {
    const player = playerOf(new Request("http://x/", { headers: { cookie: req.headers.cookie ?? "" } }));
    void cardRoom.fly(match[1]!, player, { send: (text) => ws.readyState === ws.OPEN && ws.send(text) }).then((flying) => {
      if (!flying) return ws.close(4404, "No game in the air at this table.");
      ws.on("message", (data) => {
        try {
          flying.input(JSON.parse(String(data)));
        } catch {
          /* not controls: nothing to do with it */
        }
      });
      ws.on("close", () => flying.leave());
      ws.on("error", () => flying.leave());
    }, () => ws.close(1011));
  });
});

server.listen(port, () => {
  console.log(`open.parlor on http://localhost:${port}`);
  const lan = lanNotice(port, !!process.stdout.isTTY);
  if (lan) console.log(lan);
  backups?.start();
  const bots = cardRoom.bots?.stats();
  console.log(bots?.workers ? `computer players think in ${bots.workers} worker thread${bots.workers === 1 ? "" : "s"} (CARDROOM_BOT_WORKERS=0 for none)` : "computer players think on the main thread");
  // Once the door is open: the first putt of the day shouldn't be the one that waits for the physics to warm up.
  // The main thread still makes some moves itself (a turn timer's, a quick move for an abandoned think),
  // and each worker thread warms its own copy of the engines as it starts.
  setImmediate(() => console.log(`table sports warmed up in ${warmSports()} ms`));
});

// Asked to stop (a deploy, Ctrl-C): no more requests, no more bot timers, and the worker threads go.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return process.exit(1); // asked twice: now
    stopping = true;
    server.close();
    server.closeIdleConnections();
    // Pages hold a connection open to the sync log; don't wait for them to hang up.
    const hurry = setTimeout(() => process.exit(0), 3000);
    hurry.unref();
    void cardRoom.close().finally(() => process.exit(0));
  });
}
