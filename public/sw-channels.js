/* Round 564 — offline copy for the public channel-reference page (/channels/*).
 * Scope is limited to /channels/ (see the register call in ChannelReferenceClient.js), so nothing else in the app is touched.
 *  - page HTML: network first, falls back to the last saved copy when offline
 *  - /_next/static (hashed, immutable) and fonts/images: saved as they are loaded
 *  - NEVER caches /api/*: the rate tables are kept (only after a visitor opened them) in that browser's own localStorage.
 * Bump VERSION to drop old caches. */
const VERSION = "v1";
const PAGES = "chan-pages-" + VERSION;
const ASSETS = "chan-assets-" + VERSION;

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("chan-") && k !== PAGES && k !== ASSETS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate" && url.pathname.startsWith("/channels/")) {
    e.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(url.pathname, res.clone());
        return res;
      } catch {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
        return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:sans-serif;padding:24px'><h3>You're offline</h3><p>Open this page once while online and it will be available offline next time.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  const isAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/fonts/") || /\.(png|jpg|jpeg|webp|svg|woff2?|ttf)$/i.test(url.pathname);
  if (!isAsset) return;
  e.respondWith((async () => {
    const cache = await caches.open(ASSETS);
    const hit = await cache.match(req);
    if (hit && url.pathname.startsWith("/_next/static/")) return hit;           // hashed file: never changes
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      if (hit) return hit;
      throw new Error("offline");
    }
  })());
});
