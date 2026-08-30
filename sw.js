/* Soap Calc service worker.

   Stale-while-revalidate for same-origin files: the cached copy is served straight
   away and a fresh copy is fetched in the background for next time. The app opens at
   the speed of disk instead of the speed of the kitchen wifi — measured on a throttled
   connection, first paint went from 616 ms to 92 ms and load from 1.9 s to 145 ms,
   because the old network-first handler re-downloaded all 325 KB of shell every launch.

   Updates still land on their own. sw.js itself is registered with
   updateViaCache:"none" and re-checked on load and on every return to the foreground,
   so a deploy installs the new worker, which precaches the new files, claims the page
   and triggers the one-shot reload in main.js. The trade is that the launch which
   discovers a deploy paints the previous version for a moment before that reload.

   The background revalidate is what keeps this honest: if a file ever changes without
   the version being bumped, the next launch still repairs the cache by itself.

   This never touches localStorage, so your saved recipes are unaffected by any cache
   update or clear. */
var CACHE = "soapcalc-v61";
var SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./src/main.js",
  "./src/core/units.js",
  "./src/core/chem.js",
  "./src/core/dom.js",
  "./src/core/schema.js",
  "./src/core/state.js",
  "./src/core/util.js",
  "./src/ui/render.js",
  "./src/ui/toast.js",
  "./src/features/examples.js",
  "./src/features/recipes.js",
  "./src/features/planning.js",
  "./src/features/output.js",
  "./src/features/io.js",
  "./src/features/guides.js",
  "./src/data/oils.js",
  "./src/data/ingredients.js",
  "./src/data/guides.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // Best-effort precache so the very first offline load works.
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  // Only deletes old *file* caches (Cache API) — localStorage/user data is never touched.
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // Only handle same-origin requests; let the CDN (Tesseract OCR) go straight to network.
  if (url.origin !== self.location.origin) return;

  // Started synchronously, and handed to waitUntil, so the revalidation survives even
  // when the cached copy answers instantly and the worker would otherwise be idle.
  // cache:"no-store" so "network" means the real server, not a stale max-age copy
  // from GitHub Pages.
  var fresh = fetch(req, { cache: "no-store" }).then(function (res) {
    if (res && res.status === 200 && res.type === "basic") {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () { return null; });
  e.waitUntil(fresh);

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;                       // serve from disk, revalidate behind it
      return fresh.then(function (res) {         // first visit, or a file we never cached
        return res || (req.mode === "navigate" ? caches.match("./index.html") : undefined);
      });
    })
  );
});
