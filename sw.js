/* Paragon PDX Hub — simple offline cache (same-origin GET only) */
var CACHE = "ppdx-v4";
var CORE = [
  "./",
  "./index.html",
  "./pdx-styles.css",
  "./pdx-app.js",
  "./pdx-db.js",
  "./pdx-docs.js",
  "./questions.js",
  "./weeks.js",
  "./supabase.min.js",
  "./logo.png",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./paragonpdx-dashboard"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () {})
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
        return res;
      }).catch(function () {
        return caches.match("./index.html");
      });
    })
  );
});
