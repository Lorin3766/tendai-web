/* Obrium PWA service worker.
   Network-first for HTML and JS so a new deploy is not stuck on stale code.
   Cache-first for static assets. Bump CACHE_NAME on each release. */
const CACHE_NAME = 'obrium-shell-v11d-2';
const OFFLINE_URL = './offline.html';

const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './favicon.ico',
  './styles/theme.css',
  './styles/layout.css',
  './styles/components.css',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-192-maskable.png',
  './assets/icons/icon-512-maskable.png',
];

function isHtmlRequest(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return req.method === 'GET' && accept.includes('text/html');
}

function isJsRequest(url) {
  return /\.m?js(\?|$)/i.test(url.pathname);
}

function isStaticAsset(url) {
  return /\.(css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|json)(\?|$)/i.test(url.pathname);
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(PRECACHE.map(function (url) { return cache.add(url); }));
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
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  if (isHtmlRequest(req) || isJsRequest(url)) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          if (isHtmlRequest(req)) {
            return caches.match(OFFLINE_URL).then(function (offline) {
              return offline || caches.match('./index.html');
            });
          }
          return Response.error();
        });
      })
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
  }
});
