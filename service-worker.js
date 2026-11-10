/* The Last Sysadmin - offline service worker */
const CACHE_PREFIX = 'last-sysadmin-v';
const CACHE = CACHE_PREFIX + '95';
const ASSETS = ['.', 'index.html', 'manifest.webmanifest', 'questions.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'src/feedback.js', 'daily-practice.js'];

self.addEventListener('install', (event) => {
  // addAll is intentionally atomic: a partial precache must not replace a
  // working offline release. A failed install leaves the previous worker active.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';
  if (isNavigation) {
    // Prefer the latest shell while online; use the precached app shell offline.
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
        }
        return response;
      }).catch(() => caches.match(request).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }

  // Static assets are cache-first. Do not return HTML for a missing script,
  // stylesheet, image, API request, or other non-navigation resource.
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    }))
  );
});
