// The offline copy, and the second visit's instant load.
//
// Three kinds of request, three answers:
//  - the page itself: the network first, so a deploy is seen at once, and the
//    last copy when the network is gone or slower than three seconds;
//  - the bundle Vite fingerprinted (`name-AbCd1234.js`): kept for good the
//    first time it is fetched, since that name never means another file;
//  - everything else under the site (level data, terrain, models, sound):
//    the copy kept, refreshed behind it for the next load.
// A page that differs from the one kept is a deploy, and a deploy clears
// both caches, so new code never runs on last week's level data.
// Levels the player has opened work offline; the rest need the network once.
const VERSION = 'ef-sw-1';
const PAGE = `${VERSION}-page`, HASHED = `${VERSION}-hashed`, DATA = `${VERSION}-data`;
const HASH = /-[A-Za-z0-9_-]{8}\.(js|css|wasm|woff2?)$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const scopeURL = () => new URL(self.registration.scope);
const pageKey = () => new URL('index.html', scopeURL()).href;
const keep = (res) => res && res.ok && res.status === 200 && res.type === 'basic';

async function page(req) {
  const cache = await caches.open(PAGE);
  const net = fetch(req).then(async (res) => {
    if (!keep(res)) return res;
    const text = await res.clone().text();
    const old = await cache.match(pageKey());
    if (old && (await old.text()) !== text) {
      await caches.delete(HASHED);
      await caches.delete(DATA);
    }
    await cache.put(pageKey(), res.clone()).catch(() => {});
    return res;
  });
  net.catch(() => {});
  const slow = new Promise((r) => setTimeout(r, 3000));
  try {
    const first = await Promise.race([net, slow]);
    if (first) return first;
  } catch { /* offline: the kept copy below */ }
  const kept = await cache.match(pageKey());
  return kept || net;
}

async function hashed(req) {
  const cache = await caches.open(HASHED);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (keep(res)) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function data(req, event) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => {
    // A full store (a phone's quota) costs the copy, never the answer.
    if (keep(res)) return cache.put(req, res.clone()).then(() => res, () => res);
    return res;
  });
  if (hit) {
    event.waitUntil(net.catch(() => {}));
    return hit;
  }
  return net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scopeURL().href)) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (req.mode === 'navigate') return e.respondWith(page(req));
  if (HASH.test(url.pathname)) return e.respondWith(hashed(req));
  e.respondWith(data(req, e));
});
