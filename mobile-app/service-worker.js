/* TendAI PWA Service Worker — single registration from index.html (relative path).
   Base Directory Rule: cache paths are origin-relative so they work when app is served from any path. */
const CACHE_NAME = 'tendai-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './styles/theme.css',
  './styles/layout.css',
  './styles/components.css'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(APP_SHELL.map(function (url) { return cache.add(url); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.mode !== 'navigate' && !(req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').indexOf('text/html') !== -1)) {
    return;
  }
  event.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (c) { c.put(req.url, copy); });
      return res;
    }).catch(function () {
      return caches.match('./index.html').then(function (cached) { return cached || caches.match('./'); });
    })
  );
});
