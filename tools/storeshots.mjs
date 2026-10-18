// App Store screenshots: the iPhone 6.9" set (1320x2868) rendered from the
// game itself at the phone's own point size (440x956). The title and the
// campaign map are drawn at three times the density; a battle is drawn at
// twice (the software rasteriser never finishes a load at 3.8 Mpx a frame)
// and scaled to the set's size by tools/storeshots_scale.py afterwards.
//   node tools/storeshots.mjs            -> /tmp/out/store/{01-title,02-battery,03-collapse,04-campaign}.png
//   python3.13 tools/storeshots_scale.py -> every frame at 1320x2868
import { chromium } from 'playwright';
import fs from 'node:fs';
const port = process.env.TT_PORT || 5177;
const W = 440, H = 956, DPR = 3;
fs.mkdirSync('/tmp/out/store', { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
const shot = (page, n) => page.screenshot({ path: `/tmp/out/store/${n}.png`, timeout: 240000 });
const only = process.env.ONLY;   // ONLY=battle skips the title and the map

// 1. The title.
if (!only || only === 'title') {
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
}

// 2 and 3. A battle each: a battery laid, time run on, the frame drawn.
const ctx2 = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
async function battle(level, kinds, seconds, name, aim) {
  const p = await ctx2.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
  await p.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await p.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.testMenu, null, { timeout: 900000 });
  await p.evaluate(({ kinds, seconds, aim }) => {
    const B = window.battle, tm = window.testMenu, T = window.THREE;
    B.freeBuild = true;
    // A picture of the demolition, not of the garrison winning: the battery is
    // invulnerable and the defenders hold their fire, as the par probe does.
    B.invulnerable = true; if (B.garrison) B.garrison.fireEnabled = false;
    document.getElementById('test-btn')?.setAttribute('hidden', '');   // a developer's button, not the store's
    for (const [kind, n, ang, dist] of kinds) tm.spawnAt(kind, n, ang, dist);
    // The landmark stands on the origin: designate its body so the battery
    // fires on the masonry rather than waiting on the garrison.
    try { B.setTarget(new T.Vector3(0, window.terrain.heightAt(0, 0) + (aim ?? 14), 0), 'cab'); } catch (e) { console.log('designate', e.message); }
    for (let t = 0; t < seconds; t += 0.5) window.__fastForward(0.5, 1 / 30);
    try { localStorage.removeItem('tt.suite'); } catch {}
    window.__frame?.();
  }, { kinds, seconds, aim });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__frame?.(); window.__frame?.(); });
  const t0 = Date.now();
  await shot(p, name);
  console.log(name, 'shot in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await p.close();
}
await battle('westminster', [['m777', 6, 1.1, 230], ['m119', 4, 0.6, 180]], 75, '02-battery', 30);
await battle('agra', [['m777', 8, 0.9, 300], ['m777', 6, 2.2, 300], ['m109', 4, 1.6, 280]], 260, '03-collapse', 30);
await b.close();
console.log(fs.readdirSync('/tmp/out/store').join(' '));
