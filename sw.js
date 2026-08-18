// Cook With Me — service worker
// Cache-first for the app shell so it works fully offline.

importScripts('version.js'); // provides self.APP_VERSION
const CACHE = 'cook-with-me-v' + (self.APP_VERSION || '0');
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './version.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache the response for a same-origin GET (best-effort).
function stash(request, res) {
  if (res && res.ok && new URL(request.url).origin === self.location.origin) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  // App shell (navigations + HTML/JS/CSS/manifest) is served NETWORK-FIRST so a
  // new deploy is picked up as soon as the device is online — falling back to the
  // cache only when offline. Everything else (icons, images) stays cache-first.
  const isShell = sameOrigin && (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    /\.(html|js|css|webmanifest)$/.test(url.pathname)
  );
  if (isShell) {
    event.respondWith(
      fetch(event.request)
        .then((res) => stash(event.request, res))
        .catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached ||
      fetch(event.request).then((res) => stash(event.request, res)).catch(() => caches.match('./index.html')))
  );
});
