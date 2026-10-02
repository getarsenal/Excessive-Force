// The after-action report, photographed: a fresh commander's first win on
// Paris on a phone and a desktop, the same with the XP and orders folds
// open, and the loss card; and whether every button can be tapped without
// scrolling.
//
//   node tools/endcardshot.mjs   -> /tmp/out/ec-<phone|desk>-<win|open|lose>.png
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const [tag, vp] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desk', { viewport: { width: 1280, height: 760 } }]]) {
  const ctx = await b.newContext(vp);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
  await page.addInitScript(() => { try {
    if (!sessionStorage.getItem('cleared')) { localStorage.clear(); sessionStorage.setItem('cleared', '1'); }
    localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.intros', '0');
    localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
  await page.goto('http://localhost:5177/?level=paris', { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  await page.evaluate(() => {
    const B = window.battle; B.airborne.auto = false;
    for (const ob of B.objectives) { const S = ob.structure; for (let i = 0; i < S.count; i++) if (S.isAlive(i)) S.destroyChunk(i); }
    window.__fastForward(2, 1 / 30);
  });
  await page.waitForFunction(() => !document.getElementById('endcard').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { document.getElementById('promotion')?.click(); for (const a of document.getAnimations()) { try { a.finish(); } catch {} } });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/out/ec-${tag}-win.png` });
  await page.evaluate(() => { document.getElementById('ec-fold-xp').open = true; document.getElementById('ec-fold-orders').open = true; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/out/ec-${tag}-open.png` });
  // Each button: is it on screen and can it be clicked without scrolling?
  console.log(tag, JSON.stringify(await page.evaluate(() => ['ec-next', 'ec-again', 'ec-keep', 'ec-ba', 'ec-targets', 'ec-home'].map((id) => {
    const e = document.getElementById(id); if (!e || e.hidden) return `${id}: hidden`;
    const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return `${id}: ${r.bottom <= innerHeight && r.top >= 0 && (hit === e || e.contains(hit)) ? 'reachable' : 'NOT reachable'}`;
  }))));
  await page.evaluate(() => { const B = window.battle; window.hud.showEnd('lose', B.summary(), {}); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/out/ec-${tag}-lose.png` });
  await ctx.close();
}
await b.close();
