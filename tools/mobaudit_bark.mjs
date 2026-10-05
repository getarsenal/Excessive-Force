// The crew bark bubble, which needs a unit that has arrived and has a crew:
// deploy one, wait for it to be alive, make it talk, and measure the bubble
// against the comcard, the dock and the drawers, portrait and landscape.
//
//   node tools/mobaudit_bark.mjs   -> /tmp/out/mobaudit/bark-*.png, bark.json
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/out/mobaudit';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const insets = async (i) => cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: i }).catch(() => {});
await insets({ top: 59, left: 0, bottom: 34, right: 0 });
await page.goto(`http://localhost:${port}/?level=westminster`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 420000 });
await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; }' });
await page.evaluate(() => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.money = 99999;
  outer: for (const rad of [60, 80, 100, 120, 150]) for (let a = 0; a < 360; a += 20) {
    const x = Math.cos(a * Math.PI / 180) * rad, z = Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    const before = B.units.length + B.pending.length;
    B.deploy('m240', p);
    if (B.units.length + B.pending.length > before) break outer;
  }
});
const alive = await page.waitForFunction(() => window.battle.units.some((u) => u.alive && u.crew), null, { timeout: 90000 }).then(() => true).catch(() => false);
console.log('crewed unit alive:', alive);
const out = {};
const measure = async (name) => {
  await page.evaluate(() => {
    const B = window.battle, b = window.__barks; b.quiet = 0; b.cool = {};
    const u = B.units.find((u) => u.alive && u.crew) || B.units.find((u) => u.alive);
    b.say('idle', u);
    b.update(0.016);
    window.__comcard?.say('us', 'Battery, this is Buck. Walk it onto the tower.');
    window.hud.feed('TARGET: TOWER', 'big'); window.hud.feed('M240B EMPLACED', '');
  });
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const q = e.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height), font: getComputedStyle(e).fontSize }; };
    const inter = (a, c) => a && c ? Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y)) : 0;
    const bark = r('.bark'), cc = r('#comcard');
    const dock = [...document.querySelectorAll('.dock-btn')].map((e) => e.getBoundingClientRect());
    const dr = { x: Math.min(...dock.map((d) => d.left)), y: Math.min(...dock.map((d) => d.top)), w: 0, h: 0 }; dr.w = Math.max(...dock.map((d) => d.right)) - dr.x; dr.h = Math.max(...dock.map((d) => d.bottom)) - dr.y;
    const u = window.battle.units.find((u) => u.alive);
    const p = u ? u.pos.clone().project(window.engine.camera) : null;
    const unitScreen = p ? { x: Math.round((p.x + 1) / 2 * innerWidth), y: Math.round((1 - p.y) / 2 * innerHeight), onScreen: p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 } : null;
    return { inner: [innerWidth, innerHeight], bark, comcard: cc, barkOverComcard: inter(bark, cc), barkOverDock: inter(bark, dr), unitScreen, barkText: document.querySelector('.bark')?.textContent };
  });
  out[name] = m;
  console.log(name, JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/bark-${name}.png` });
};
await measure('portrait');
await page.setViewportSize({ width: 852, height: 393 });
await insets({ top: 0, left: 59, bottom: 21, right: 59 });
await page.waitForTimeout(1500);
await measure('landscape');
await page.evaluate(() => window.hud.setDrawer('units'));
await page.waitForFunction(() => document.getElementById('drawer-units')?.classList.contains('on'), null, { timeout: 15000 }).catch(() => {});
await measure('landscape-drawer');
fs.writeFileSync(`${OUT}/bark.json`, JSON.stringify(out, null, 1));
await b.close();
