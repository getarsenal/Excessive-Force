// The progression, photographed: a fresh commander wins a level (with a few
// ribbons), the report counts the pay up into the rank bar, the promotion
// takes the screen; then the front door with its orders, crates and medals.
//
//   node tools/rankshot.mjs [level=westminster] [phone]   -> /tmp/out/rank-<n>.png
import { chromium } from 'playwright';
const [level = 'westminster', phone] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext(phone
  ? { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1100, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
const tag = phone ? '-phone' : '';
const shot = (n) => page.screenshot({ path: `/tmp/out/rank-${n}${tag}.png`, timeout: 180000 });
await page.addInitScript(() => { try {
  if (!sessionStorage.getItem('cleared')) { localStorage.clear(); sessionStorage.setItem('cleared', '1'); }
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.intros', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 })
  .catch(async (e) => { await shot('0-stuck'); console.log('stuck', await page.evaluate(() => document.body.className + ' | ' + (document.querySelector('#title') ? 'title' : '') + ' | ' + location.href)); throw e; });
await page.evaluate(() => {
  const B = window.battle, o = B.primary.origin; B.airborne.auto = false;
  const p = o.clone(); p.y = B.primary.groundY + 30;
  B.onEvent('stamp', { text: 'DIRECT HIT', point: p, kind: 'hit' });
  B.onEvent('stamp', { text: 'MULTI-KILL ×4', point: p, kind: 'kill' });
  B.onEvent('collateral', { n: 12, point: p });
  B.onEvent('secondary', { kind: 'ammo', point: p, killed: 2 });
  for (const ob of B.objectives) { const S = ob.structure; for (let i = 0; i < S.count; i++) if (S.isAlive(i)) S.destroyChunk(i); }
  window.__fastForward(2, 1 / 30);
});
await page.waitForFunction(() => !document.getElementById('endcard').hidden, null, { timeout: 120000 });
// The pay runs on the wall clock; give it time to land.
await page.waitForTimeout(4500);
await page.evaluate(() => { const e = document.getElementById('endcard'); e.scrollTop = 0; });
await shot('1-report');
await page.waitForFunction(() => document.getElementById('promotion')?.className === 'on', null, { timeout: 20000 }).catch(() => console.log('no promotion'));
await page.waitForTimeout(1500);
await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch {} } });
await shot('2-promotion');
const rep = await page.evaluate(() => JSON.parse(localStorage.getItem('tt.career')));
console.log(JSON.stringify({ xp: rep.xp, crates: rep.crates, counts: rep.counts, medals: rep.medals, orders: rep.orders }));

// The front door.
await page.evaluate(() => { localStorage.setItem('tt.autostart', '0'); });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title', { timeout: 120000 });
await page.waitForTimeout(3500);
await shot('3-title');
for (const [act, n] of [['orders', '4-orders'], ['crates', '5-crates'], ['medals', '7-medals']]) {
  await page.evaluate((a) => document.querySelector(`#title [data-act="${a}"]`)?.click(), act);
  await page.waitForTimeout(900);
  if (act === 'crates') {
    await shot(n);
    await page.evaluate(() => document.querySelector('#title .cx-btn')?.click());
    await page.waitForTimeout(3200);
    await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch {} } });
    await shot('6-opened');
  } else await shot(n);
  await page.evaluate(() => document.querySelector('#title [data-act="close"]')?.click());
  await page.waitForTimeout(500);
}
await b.close();
