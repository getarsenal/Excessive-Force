// A phone on its side, with the real insets emulated: the units drawer open
// as a side panel, then the generals talking with the target card and the
// feed up.   node tools/landshot.mjs  -> /tmp/out/land-drawer.png, /tmp/out/land-cards.png
import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const W = +(process.env.W || 852), H = +(process.env.H || 393);
const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await ctx.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const ins = W > H ? { top: 0, bottom: 21, left: 59, right: 59 } : { top: 59, bottom: 34, left: 0, right: 0 };
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins }).catch((e) => console.log('insets failed', e.message));
await page.goto(`http://localhost:${port}/?level=westminster`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 420000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { window.hud.setDrawer('units'); });
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/out/land-drawer.png' });
const r1 = await page.evaluate(() => {
  const b = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return [r.left | 0, r.top | 0, r.width | 0, r.height | 0]; };
  return { drawer: b('#drawer-units'), bar: b('#buildbar'), dockUnits: b('#dock-units'), dockMenu: b('#dock-menu'), survey: b('#survey-btn'), cards: document.querySelectorAll('#buildbar .unit-card').length };
});
await page.evaluate(() => { window.hud.setDrawer(null); });
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.__comcard?.say('us', 'Battery, this is Buck. Walk it onto the tower and keep it there.');
  window.hud.feed('TARGET: TOWER', 'big'); window.hud.feed('M240B EMPLACED', ''); window.hud.feed('DEFENDER DOWN', 'good');
  window.hud.status('press and drag along the line to strafe', 30);
  document.getElementById('survey-btn')?.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/out/land-cards.png' });
const r2 = await page.evaluate(() => {
  const b = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return [r.left | 0, r.top | 0, r.width | 0, r.height | 0]; };
  return { comcard: b('#comcard'), target: b('#targetcard'), feed: b('#feed'), status: b('#status'), survey: b('#survey-btn'), key: b('#survey-key') };
});
console.log(JSON.stringify({ r1, r2 }));
await b.close();
