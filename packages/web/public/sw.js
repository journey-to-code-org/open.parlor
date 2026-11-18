// The service worker. Two jobs:
//
// 1. Notifications: shows the buzz when the server pushes one, and opens the right table when it's
//    tapped.
// 2. Playing offline: keeps a copy of the app on this device, so a practice game, a solitaire, an
//    arcade game or a game shared on this device starts with no connection at all. Which kinds of
//    game are kept is the person's to choose (the "Offline games" sheet): the core is always kept,
//    and each kind of game is a pack that is kept or not. Until they choose, everything is. Family tables,
//    houses, the lobby and everything else that lives on the server are never answered from here:
//    those requests go to the network as they always did.
//
// The build writes the list of the app's files in place of the empty one below
// (scripts/precache.mjs). With an empty list (the dev server) nothing is kept and the page is
// always fetched, as before.
const PRECACHE = { version: "dev", files: [], core: [], packs: {}, sizes: {} }; /* __PRECACHE__ */
const PREFIX = "open-parlor-";
const CACHE = `${PREFIX}${PRECACHE.version}`;
const scope = self.registration.scope;
const SHELL = new URL("index.html", scope).href;
const href = (file) => new URL(file, scope).href;
const KEPT = new Set(PRECACHE.files.map(href));
const offline = PRECACHE.files.length > 0;

// What the person has chosen to keep. It is kept in a cache of its own, since that is the one
// place a service worker can put something by: it outlives every copy of the app. (Its name
// doesn't start as the copies' do, so clearing old copies leaves it alone.)
const CHOICES = "parlor-offline-choice";
const CHOICE = href("__offline-choice__");
const EVERYTHING = { all: true, packs: [] };
const PACK_IDS = Object.keys(PRECACHE.packs ?? {});

async function readChoice() {
  try {
    const saved = await (await caches.open(CHOICES)).match(CHOICE);
    const choice = saved ? await saved.json() : null;
    if (choice && typeof choice.all === "boolean" && Array.isArray(choice.packs)) return { all: choice.all, packs: choice.packs.filter((id) => typeof id === "string") };
  } catch {}
  return EVERYTHING;
}
async function writeChoice(choice) {
  await (await caches.open(CHOICES)).put(CHOICE, new Response(JSON.stringify(choice), { headers: { "content-type": "application/json" } }));
}
/** The files a choice keeps: the core, and each chosen pack's. (A build from before there were packs keeps them all.) */
function wantedBy(choice) {
  if (!PACK_IDS.length && !(PRECACHE.core ?? []).length) return new Set(KEPT);
  const files = new Set(PRECACHE.core.map(href));
  for (const id of PACK_IDS) if (choice.all || choice.packs.includes(id)) for (const file of PRECACHE.packs[id]) files.add(href(file));
  return files;
}
let wanting = null;
/** The files wanted now. Worked out once, and again when the choice changes. */
const wanted = () => (wanting ??= readChoice().then(wantedBy));

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (!offline) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // All or nothing: a copy with a file missing would start and then fail somewhere in a game.
      // "reload" goes past the browser's own cache, which may hold an older index.html.
      await cache.addAll([...(await wanted())].map((url) => new Request(url, { cache: "reload" })));
    })(),
  );
});

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Keep this copy and the one before it: a page opened before the update still asks for the
      // older files (a game's 3D scene, the bot worker) the first time it needs them.
      // (caches.keys() lists them in the order they were made, oldest first.)
      const copies = (await caches.keys()).filter((name) => name.startsWith(PREFIX) && name !== CACHE);
      await Promise.all(copies.slice(0, -1).map((name) => caches.delete(name)));
      if (!offline) await Promise.all(copies.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  ),
);

/** This copy's file first, then an older copy's. */
async function kept(url) {
  const cache = await caches.open(CACHE);
  return (await cache.match(url)) ?? (await caches.match(url));
}

/** The page itself: the server's when it answers in good time (so an update shows up at once), the copy kept here when it doesn't. */
async function shell(request) {
  const saved = await kept(SHELL);
  if (!saved) return fetch(request);
  let timer;
  const slow = new Promise((resolve) => (timer = setTimeout(() => resolve(null), 3000)));
  const fresh = fetch(request)
    .then((response) => (response.ok ? response : null))
    .catch(() => null);
  const first = await Promise.race([fresh, slow]);
  clearTimeout(timer);
  return first ?? saved;
}

/**
 * A file of the app: the copy kept here, or the network's, which is then kept too, unless it
 * belongs only to kinds of game this person has chosen not to keep.
 */
async function asset(request) {
  const saved = await kept(request.url);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok && response.type === "basic" && (!KEPT.has(request.url) || (await wanted()).has(request.url))) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request.url, copy)).catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!offline || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || !url.href.startsWith(scope)) return;
  const path = url.href.slice(scope.length).split(/[?#]/)[0];
  // The app is one page at the scope's root (the screen is in the query string). The designer, the
  // watch page, the admin app and the blog embed have addresses of their own and are left alone.
  if (request.mode === "navigate") {
    if (path === "" || path === "index.html") event.respondWith(shell(request));
    return;
  }
  const plain = url.origin + url.pathname;
  if (KEPT.has(plain) || path.startsWith("assets/")) event.respondWith(asset(new Request(plain, { credentials: "same-origin" })));
});

/** What is kept here, for the "Offline games" sheet: the choice, and for the core and each pack, its size and whether all of it is on this device. */
async function status() {
  const choice = await readChoice();
  const cache = await caches.open(CACHE);
  const here = new Set((await cache.keys()).map((request) => request.url));
  const part = (files) => ({ bytes: files.reduce((sum, file) => sum + (PRECACHE.sizes[file] ?? 0), 0), kept: files.every((file) => here.has(href(file))) });
  return { available: offline && PACK_IDS.length > 0, choice, core: part(PRECACHE.core ?? []), packs: Object.fromEntries(PACK_IDS.map((id) => [id, part(PRECACHE.packs[id])])), sizes: PRECACHE.sizes, files: PRECACHE.packs };
}

/**
 * Keep what a new choice asks for and no more: fetch what is now wanted and isn't here, and drop
 * what is here and is no longer wanted, from this copy and any older one. A file that can't be
 * fetched just now (no connection) is fetched the next time it is asked for.
 */
async function choose(choice) {
  await writeChoice(choice);
  wanting = Promise.resolve(wantedBy(choice));
  const want = await wanting;
  const cache = await caches.open(CACHE);
  const here = new Set((await cache.keys()).map((request) => request.url));
  await Promise.all([...want].filter((url) => !here.has(url)).map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {})));
  for (const name of (await caches.keys()).filter((n) => n.startsWith(PREFIX))) {
    const copy = await caches.open(name);
    await Promise.all((await copy.keys()).filter((request) => KEPT.has(request.url) && !want.has(request.url)).map((request) => copy.delete(request)));
  }
}

// The "Offline games" sheet asks what is kept, and says what to keep.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "offline-status?") return event.waitUntil(status().then((offlineStatus) => event.source?.postMessage({ offlineStatus })));
  if (!data || data.type !== "offline-choice" || !offline) return;
  const packs = Array.isArray(data.packs) ? data.packs.filter((id) => PACK_IDS.includes(id)) : [];
  event.waitUntil(
    choose({ all: data.all === true, packs })
      .then(status)
      .then((offlineStatus) => event.source?.postMessage({ offlineStatus })),
  );
});

// The page asks whether a copy of the app is kept here (the "ready to play offline" note).
self.addEventListener("message", (event) => {
  if (event.data !== "offline-ready?") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      event.source?.postMessage({ offlineReady: offline && !!(await cache.match(SHELL)) });
    })(),
  );
});

self.addEventListener("push", (event) => {
  let notice = { title: "open.parlor 🃏", body: "", url: "./" };
  try {
    notice = { ...notice, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      body: notice.body,
      tag: notice.tag,
      renotify: !!notice.tag,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      vibrate: [80, 60, 140],
      data: { url: new URL(notice.url, self.registration.scope).href },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? self.registration.scope;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse a window that's already open on the app, if there is one.
      const win = open.find((c) => c.url.startsWith(self.registration.scope));
      if (win) {
        await win.focus();
        return win.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
