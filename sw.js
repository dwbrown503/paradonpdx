/* paragonpdx hub service worker — caches the app's own files only */
var CACHE = 'ppdx-hub-v3-training';
var CORE = [
  './', './index.html', './styles.css', './app.js',
  './manifest.webmanifest', './logo.png',
  './icons/icon-192.png', './icons/icon-512.png',
  './data/stronger.json', './data/unbroken.json',
  './data/vocation.json', './data/mindset.json', './data/training.json'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // never cache supabase or other outside requests — messages and posts must stay live
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // network first, fall back to cache when offline
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
