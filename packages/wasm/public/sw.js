// Keeps this page for playing with no connection. It only answers for this folder (its scope), so
// it and the parlor's own service worker, one folder up, leave each other's pages alone.
//
// The page is asked of the network first, so an update shows at once, with the kept copy as the
// fallback. Its scripts, styles and the engine are kept the first time they are fetched: their
// names carry a hash, so a kept one is never stale. The game's data (tens of megabytes) is kept by
// the page itself, in "open-wasm-assets" (host/assets.ts), and is not this worker's business.
const CACHE = "open-wasm-page";
const scope = self.registration.scope;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(scope, response.clone());
    return response;
  } catch (error) {
    const kept = await cache.match(scope);
    if (kept) return kept;
    throw error;
  }
}

async function file(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request.url);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) cache.put(request.url, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  const path = request.url.slice(scope.length).split(/[?#]/)[0];
  if (request.mode === "navigate") {
    if (path === "" || path === "index.html") event.respondWith(page(request));
  } else if (path.startsWith("assets/")) event.respondWith(file(request));
});
