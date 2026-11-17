// The service worker. Two jobs:
//
// 1. Notifications: shows the buzz when the server pushes one, and opens the right table when it's
//    tapped.
// 2. Playing offline: keeps a copy of the app on this device, so a practice game, a solitaire, an
//    arcade game or a game shared on this device starts with no connection at all. Family tables,
//    houses, the lobby and everything else that lives on the server are never answered from here:
//    those requests go to the network as they always did.
//
// The build writes the list of the app's files in place of the empty one below
// (scripts/precache.mjs). With an empty list (the dev server) nothing is kept and the page is
// always fetched, as before.
const PRECACHE = { version: "dev", files: [] }; /* __PRECACHE__ */
const PREFIX = "open-parlor-";
const CACHE = `${PREFIX}${PRECACHE.version}`;
const scope = self.registration.scope;
const SHELL = new URL("index.html", scope).href;
const KEPT = new Set(PRECACHE.files.map((file) => new URL(file, scope).href));
const offline = PRECACHE.files.length > 0;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (!offline) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // All or nothing: a copy with a file missing would start and then fail somewhere in a game.
      // "reload" goes past the browser's own cache, which may hold an older index.html.
      await cache.addAll([...KEPT].map((url) => new Request(url, { cache: "reload" })));
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

/** A file of the app: the copy kept here, or the network's, which is then kept too. */
async function asset(request) {
  const saved = await kept(request.url);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
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
