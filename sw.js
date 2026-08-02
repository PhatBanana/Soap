/* Soap Calc service worker.
   Network-first for same-origin files: when you're online you always get the
   latest version (no need to clear the cache to see an update); the cache is
   only used as an offline fallback. This never touches localStorage, so your
   saved recipes are unaffected by any cache update or clear. */
var CACHE = "soapcalc-v35";
var SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./data.js",
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

  // Network-first, and bypass the browser's HTTP cache so "network" means the
  // real server, not a stale max-age copy of app.js/app.css from GitHub Pages.
  e.respondWith(
    fetch(req, { cache: "no-store" }).then(function (res) {
      if (res && res.status === 200 && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined);
      });
    })
  );
});
