/* Hours service worker: caches the app shell so it opens offline.
   Bump CACHE on every deploy so phones pick up the new files. */
var CACHE = 'hours-v1';
var SHELL = ['./', './index.html', './parser.js', './stats.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-maskable-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Serve from cache, refresh the cache from the network in the background.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(e.request, { ignoreSearch: true }).then(function (cached) {
      var network = fetch(e.request).then(function (res) {
        if (res && res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    });
  }));
});
