// App Store screenshots: the iPhone 6.9" set (1320x2868) rendered from the
// game itself, as a 440x956 viewport at three times the density, which is the
// phone's own point size. Four frames: the title, a battery firing on Big Ben,
// the Taj Mahal coming down, and the campaign map.
//   node tools/storeshots.mjs            -> /tmp/out/store/{01-title,02-battery,03-collapse,04-campaign}.png
import { chromium } from 'playwright';
import fs from 'node:fs';
const port = process.env.TT_PORT || 5177;
const W = 440, H = 956, DPR = 3;
fs.mkdirSync('/tmp/out/store', { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
const shot = (page, n) => page.screenshot({ path: `/tmp/out/store/${n}.png` });

// 1. The title.
let page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title .tt-menu', { timeout: 180000 });
await page.waitForTimeout(3500);
await shot(page, '01-title');
// 4. The campaign map, off the same title.
try {
  await page.click('#title [data-act="campaign"]'); await page.waitForTimeout(2500);
  await shot(page, '04-campaign');
} catch (e) { console.log('campaign sheet:', e.message.slice(0, 80)); }
await page.close();

// 2 and 3. A battle each: a battery laid, time run on, the frame drawn.
async function battle(level, kinds, seconds, name, aim) {
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
  await p.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await p.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.testMenu, null, { timeout: 400000 });
  await p.evaluate(({ kinds, seconds, aim }) => {
    const B = window.battle, tm = window.testMenu;
    B.freeBuild = true;
    for (const [kind, n, ang, dist] of kinds) tm.spawnAt(kind, n, ang, dist);
    if (aim && B.setTarget) { const t = B.structures?.[0] || B.primary; try { B.setTarget(t, aim); } catch {} }
    for (let t = 0; t < seconds; t += 0.5) window.__fastForward(0.5, 1 / 30);
    try { localStorage.removeItem('tt.suite'); } catch {}
    window.__frame?.();
  }, { kinds, seconds, aim });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__frame?.(); window.__frame?.(); });
  await shot(p, name);
  await p.close();
}
await battle('westminster', [['m777', 6, 1.1, 230], ['m119', 4, 0.6, 180]], 28, '02-battery');
await battle('agra', [['m777', 8, 0.9, 260], ['m109', 4, 1.6, 240]], 75, '03-collapse');
await b.close();
console.log(fs.readdirSync('/tmp/out/store').join(' '));
