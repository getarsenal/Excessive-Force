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
    // `ef-state` is the page's note to the reminder below, not a copy of
    // anything: it outlives a new worker.
    for (const k of await caches.keys()) if (!k.startsWith(VERSION) && k !== 'ef-state') await caches.delete(k);
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

// ── The daily strike's reminder (src/core/reminders.js). The browser wakes
// this worker now and then; once a day, late enough, if the player asked and
// today's strike is not flown and the game is not already open, one
// notification. Nothing is sent anywhere.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
async function remind(test = false) {
  const c = await caches.open('ef-state');
  const url = new URL('./__ef-state', self.registration.scope).href;
  const r = await c.match(url);
  if (!r) return;
  const s = await r.json();
  const now = new Date(), day = ymd(now);
  if (!s.remind || s.done === day || s.told === day || now.getHours() < (s.hour ?? 17)) return;
  const open = await self.clients.matchAll({ type: 'window' });
  if (!test && open.some((w) => w.visibilityState === 'visible')) return;
  const streak = s.streak ? ` Your ${s.streak}-day streak is on the line.` : '';
  const body = s.date === day && s.target ? `Today: ${s.target}, ${s.mod}.${streak}` : `A new target is up.${streak}`;
  await self.registration.showNotification('DAILY STRIKE', { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'ef-daily' });
  s.told = day;
  await c.put(url, new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } }));
}
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'daily-reminder') e.waitUntil(remind().catch(() => {}));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => (ws.length ? ws[0].focus() : self.clients.openWindow('./'))));
});
// For tools/reminderprobe.mjs: the same decision, asked for now rather than
// when the browser next wakes the worker, with the probe's own open page not
// counted as the player being here.
self.addEventListener('message', (e) => {
  if (e.data === 'ef-remind-now') e.waitUntil(remind(true).then(() => e.source?.postMessage('ef-remind-done')).catch(() => {}));
});
