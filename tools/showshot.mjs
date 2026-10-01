// The show at the end: stamps fired through the battle's own events, then
// the landmark knocked down so the news and the white flags come up, each
// photographed.
//
//   node tools/showshot.mjs [level=westminster] [phone]   -> /tmp/out/show-<n>.png
import { chromium } from 'playwright';
const [level = 'westminster', phone] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage(phone
  ? { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1100, height: 680 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const tag = phone ? '-phone' : '';
// The software rasteriser draws a frame a second at best, and CSS animations
// only advance on frames: freeze each one at `ms` so the picture shows it.
const freeze = (ms) => page.evaluate((ms) => {
  for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = ms; } catch {} }
  return document.getAnimations().length;
}, ms);
await page.evaluate(() => {
  const B = window.battle, o = B.primary.origin;
  B.airborne.auto = false;
  const p = o.clone(); p.y = B.primary.groundY + 40;
  B.onEvent('stamp', { text: 'DIRECT HIT', point: p, kind: 'hit' });
  B.onEvent('collateral', { n: 23, point: p });
});
await page.waitForTimeout(300);
console.log('animations', await freeze(500));
await page.screenshot({ path: `/tmp/out/show-1-stamps${tag}.png`, timeout: 180000 });
await page.evaluate(() => {
  const B = window.battle;
  for (const o of B.objectives) { const S = o.structure; for (let i = 0; i < S.count; i++) if (S.isAlive(i)) S.destroyChunk(i); }
  window.__fastForward(2, 1 / 30);
});
await page.waitForFunction(() => window.battle.state === 'won', null, { timeout: 120000 }).catch(() => console.log('not won'));
await page.waitForTimeout(2600);
const n = await page.evaluate(() => {
  const g = window.engine?.scene?.getObjectByName('whiteflags');
  // The flags step with the effects; the card that comes up at seven
  // seconds is kept off this picture.
  const st = document.createElement('style');
  st.textContent = '#endcard{display:none!important}';
  document.head.appendChild(st);
  window.__fastForward(2.5, 1 / 30);
  const f = g && g.children[0];
  if (f) {
    const r = window.rig;
    r.target.set(f.position.x, f.position.y + 1.5, f.position.z); r.desiredTarget.copy(r.target);
    r.distance = r.desiredDistance = 18; r.pitch = r.desiredPitch = 0.2;
    for (let k = 0; k < 30; k++) r.update(0.1);
  }
  return { flags: g ? g.children.length : -1, alive: window.battle.garrison.aliveCount, state: window.battle.state,
    news: document.getElementById('newsflash')?.className, scale: f ? f.scale.x : null, pos: f ? f.position.toArray().map(Math.round) : null };
});
console.log(JSON.stringify(n));
await page.waitForTimeout(900);
await freeze(5000);
await page.screenshot({ path: `/tmp/out/show-2-news-flags${tag}.png`, timeout: 180000 });
await b.close();
