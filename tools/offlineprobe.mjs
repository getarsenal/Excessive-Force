// Does the offline copy work? Against the built game (the dev server never
// registers it): a level loaded once online, which installs the service
// worker and keeps what the level fetched; the same level reloaded with the
// network cut, which must reach a playable battle; and a deploy faked by
// writing a different page into the page cache, after which an online load
// must find the bundle and data caches emptied and filled again.
//   npx vite build && npx vite preview --port 5190 &  node tools/offlineprobe.mjs [level=westminster] [port=5190]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', port = process.argv[3] || 5190;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
const url = `http://localhost:${port}/?level=${level}`;
const playable = () => page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 900000 });
const census = () => page.evaluate(async () => {
  const out = {};
  for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
  return { controlled: !!navigator.serviceWorker.controller, caches: out };
});
const t = () => Date.now();
let t0 = t();
await page.goto(url, { waitUntil: 'load', timeout: 600000 });
await playable();
await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 60000 });
// The first load ran before the worker held the page: load again online so
// everything the level asks for goes through it and is kept.
await page.goto(url, { waitUntil: 'load', timeout: 600000 });
await playable();
console.log('online   ', ((t() - t0) / 1000).toFixed(1), 's', JSON.stringify(await census()));

await ctx.setOffline(true);
t0 = t();
let offline = 'ok';
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await playable();
} catch (e) { offline = 'FAILED ' + String(e).slice(0, 200); }
console.log('offline  ', ((t() - t0) / 1000).toFixed(1), 's', offline, JSON.stringify(await census().catch(() => null)));
await ctx.setOffline(false);

// A deploy: a different page kept than the one the network serves.
await page.evaluate(async () => {
  const k = (await caches.keys()).find((n) => n.endsWith('-page'));
  const c = await caches.open(k);
  const key = (await c.keys())[0];
  await c.put(key, new Response('<!doctype html><title>last week</title>', { headers: { 'content-type': 'text/html' } }));
  // And a file only last week's data had: it must not survive the deploy.
  const d = await caches.open(k.replace(/-page$/, '-data'));
  await d.put(new URL('assets/last-week.json', location.href).href, new Response('{}'));
});
const before = await census();
await page.goto(url, { waitUntil: 'load', timeout: 600000 });
await playable();
const after = await census();
const sum = (c, s) => Object.entries(c.caches).filter(([k]) => k.endsWith(s)).reduce((a, [, n]) => a + n, 0);
console.log('deploy   ', JSON.stringify({ before: before.caches, after: after.caches }));
console.log('page kept is the new one:', await page.evaluate(async () => {
  const k = (await caches.keys()).find((n) => n.endsWith('-page'));
  const r = await (await caches.open(k)).match(new URL('index.html', location.href).href);
  return !!r && !(await r.text()).includes('last week');
}), '· data refilled:', sum(after, '-data') > 0, '· last week gone:', await page.evaluate(async () => {
  const k = (await caches.keys()).find((n) => n.endsWith('-data'));
  return !(await (await caches.open(k)).match(new URL('assets/last-week.json', location.href).href));
}));
console.log('errors', JSON.stringify(errors));
await b.close();
