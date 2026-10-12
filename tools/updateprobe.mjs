// A stale page takes up the new build. Against the built game on the preview
// server: a level loaded once, which installs the worker and keeps the page;
// an old page written into the kept copy (a deploy, seen backwards); then a
// title load with the network held four seconds, so the worker's race gives
// up and serves the kept copy — after which the network's page arrives,
// differs, the worker says so, and the title must reload itself onto the
// real page within a few seconds.
//   npx vite build && npx vite preview --port 5190 & node tools/slowproxy.mjs 5191 5190 &  node tools/updateprobe.mjs [port=5191]
import { chromium } from 'playwright';
const port = process.argv[2] || 5191;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
const page = await ctx.newPage();
const base = `http://localhost:${port}/`;
await page.goto(base, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready, null, { timeout: 60000 }).catch(() => {});
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
// The deploy, seen backwards: an older page in the kept copy than the one the network serves.
const stale = await page.evaluate(async () => {
  const keys = await caches.keys();
  const pk = keys.find((k) => k.endsWith('-page'));
  if (!pk) return 'no page cache';
  const c = await caches.open(pk);
  const url = new URL('index.html', location.href).href;
  const res = await c.match(url);
  if (!res) return 'no kept page';
  const text = (await res.text()).replace('<title>', '<title>OLD BUILD · ');
  await c.put(url, new Response(text, { headers: { 'content-type': 'text/html' } }));
  return 'kept page marked old';
});
console.log('stale copy:', stale);
// The network held: the proxy answers page navigations four seconds late
// (a route on the page would not reach the worker's own fetch).
await fetch(`${base}__slow?ms=4000`);
const navs = [];
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push({ at: Date.now(), url: f.url() }); });
const t0 = Date.now();
await page.goto(base, { waitUntil: 'commit', timeout: 60000 });
const firstTitle = await page.title().catch(() => '?');
console.log('served first:', firstTitle.startsWith('OLD BUILD') ? 'the kept (old) page' : `the network page (${firstTitle})`, `after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
// Now the real page should arrive, differ, and the title reload itself.
const reloaded = await page.waitForFunction((n) => performance.getEntriesByType('navigation').length >= 1 && !document.title.startsWith('OLD BUILD'), 0, { timeout: 20000 }).then(() => true).catch(() => false);
await page.waitForTimeout(500);
const finalTitle = await page.title().catch(() => '?');
console.log('reloaded onto the new page:', reloaded && !finalTitle.startsWith('OLD BUILD'), `· navigations ${navs.length} · final title "${finalTitle}"`);
await fetch(`${base}__slow?ms=0`).catch(() => {});
await b.close();
