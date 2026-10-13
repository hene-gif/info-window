/* 讯息窗 service worker。路径相对本文件，因此在 /info-window/ 下同样生效。 */
const CACHE = 'info-window-1';

const PRECACHE = [
  './index.html',
  './css/app.css',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './data/index.json',
  './data/favorites.json',
  './data/issues/1013试.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.location).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request.url, {
      cache: 'no-cache',
      credentials: 'same-origin',
      redirect: 'follow',
    });
    if (fresh && fresh.ok && !fresh.redirected) {
      try {
        await cache.put(request, fresh.clone());
      } catch {
        /* 跳过无法写入的响应，仍然把本次结果交给页面。 */
      }
    }
    return fresh;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const url = new URL(request.url);
    if (request.mode === 'navigate' || url.pathname.endsWith('/')) {
      const home = await caches.match(new URL('./index.html', self.location).href);
      if (home) return home;
    }

    return new Response('离线，且没有这份缓存。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
