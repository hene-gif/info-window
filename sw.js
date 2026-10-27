/* 讯息窗 service worker。路径相对本文件，因此在 /info-window/ 下同样生效。 */

// 发布时 scripts/stamp_sw.py 把 'dev' 换成页面文件的摘要。页面代码一变，这个文件就跟着变，已经装好的应用会自己换新。
const VERSION = 'dev';
const PREFIX = 'info-window-';
const CACHE = `${PREFIX}${VERSION}`;

const SHELL = [
  './',
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
  './data/columns/index.json',
  './data/timeline/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // github.io 这个域名下还有同一账号的其他站点，只删本应用的旧缓存。
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // 只处理本站同源请求。giscus.app、GitHub 等跨域讨论请求必须交给浏览器，不能进缓存或被拦下。
  if (url.origin !== self.location.origin) return;
  if (!request.url.startsWith(self.registration.scope)) return;
  if (url.pathname.endsWith('/sw.js')) return;

  event.respondWith(networkFirst(event));
});

// 清单读自目录。取不到的文件只是跳过：整批失败会让安装失败，旧版本就一直换不掉。
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(SHELL.map((path) => store(cache, path)));
  await precacheListed(cache, './data/index.json', 'issues', './data/issues/');
  await precacheListed(cache, './data/columns/index.json', 'columns', './data/columns/');
  await precacheListed(cache, './data/timeline/index.json', 'events', './data/timeline/');
}

async function precacheListed(cache, indexPath, key, dir) {
  const response = await cache.match(new URL(indexPath, self.location).href);
  const list = response ? await response.json().then((data) => data[key]).catch(() => null) : null;
  if (!Array.isArray(list)) return;
  await Promise.all(
    list
      .filter((meta) => typeof meta?.id === 'string')
      .map((meta) => store(cache, `${dir}${encodeURIComponent(meta.id)}.json`))
  );
}

function store(cache, path) {
  return cache.add(new Request(new URL(path, self.location).href, { cache: 'no-cache' })).catch(() => {});
}

async function networkFirst(event) {
  const request = event.request;
  const navigate = request.mode === 'navigate';
  let response = null;
  try {
    response = await fetch(request.url, {
      cache: 'no-cache',
      credentials: 'same-origin',
      // 跟随重定向后的响应不能用来回答页面跳转，交给浏览器自己去跟。
      redirect: navigate ? 'manual' : 'follow',
    });
  } catch {
    /* 离线或网络出错，下面改用缓存。 */
  }

  if (response && response.status < 500) {
    if (response.ok && response.type === 'basic' && !response.redirected && !isResearch(request)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  }

  return (await fromCache(request, navigate)) || response || offline();
}

function isResearch(request) {
  try {
    return new URL(request.url).pathname.includes('/research');
  } catch {
    return false;
  }
}

async function fromCache(request, navigate) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit || !navigate) return hit;
  // 研究看板是另一套页面，断网时不要退回讯息窗首页。
  if (isResearch(request)) return undefined;
  for (const path of ['./', './index.html']) {
    const page = await cache.match(new URL(path, self.location).href, { ignoreVary: true });
    if (page) return page;
  }
  return undefined;
}

function offline() {
  return new Response('离线，且没有这份缓存。', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
