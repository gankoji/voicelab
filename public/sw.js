/* Voice Lab service worker: offline application assets only. No audio, accounts, or analytics. */
const CACHE = 'voice-lab-v2';

self.addEventListener('install', (event) => {
  // The guide is optional: a failed fetch must not prevent offline app updates.
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.add(new URL('./guide/index.html', self.location.href).href))
    .catch(() => {})
    .then(() => self.skipWaiting()));
});

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
        if (cached) return cached;
        // A missing guide or other page must never silently become the app.
        if (url.pathname === new URL(appRoot).pathname || url.pathname === new URL('index.html', appRoot).pathname) {
          return (await cache.match(appRoot)) || Response.error();
        }
        return Response.error();
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
