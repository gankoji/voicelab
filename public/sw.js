/* Voice Lab service worker: offline application assets only. No audio, accounts, or analytics. */
const CACHE = 'voice-lab-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network-first so new deploys update immediately, falling back to cache offline.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(request);
        const appRoot = new URL('./', self.location.href).href;
        return cached || (await cache.match(appRoot)) || Response.error();
      }
    })());
  } else {
    // Cache-first for hashed, immutable assets (content-hashed filenames self-invalidate).
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      cache.put(request, fresh.clone());
      return fresh;
    })());
  }
});
