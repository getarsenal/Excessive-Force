// Scratch probe for the mobile audit: why a drawer or comcard reads as not
// visible, whether a unit can be deployed from a script, and whether this
// Chromium honours Emulation.setSafeAreaInsetsOverride.
import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
try {
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, bottom: 34, right: 0 } });
  console.log('safe-area override: OK');
} catch (e) { console.log('safe-area override: FAILED', e.message.slice(0, 120)); }
await page.goto(`http://localhost:${port}/?level=westminster`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 420000 });
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const d = document.getElementById('dock');
  const cs = getComputedStyle(d);
  return { dockBottom: cs.bottom, dockRect: d.getBoundingClientRect().bottom, inner: innerHeight, tbPadTop: getComputedStyle(document.getElementById('topbar')).paddingTop, state: window.battle.state };
}));
await page.evaluate(() => window.hud.setDrawer('units'));
await page.waitForTimeout(700);
console.log(await page.evaluate(() => {
  const d = document.getElementById('drawer-units');
  const chain = []; let e = d; while (e && e !== document.documentElement) { const cs = getComputedStyle(e); chain.push(`${e.id || e.tagName}:${cs.display}/${cs.opacity}/${cs.visibility}`); e = e.parentElement; }
  const r = d.getBoundingClientRect();
  return { hidden: d.hidden, cls: d.className, rect: [r.left, r.top, r.width, r.height], chain, cards: d.querySelectorAll('.unit-card').length, cardPE: getComputedStyle(d.querySelector('.unit-card')).pointerEvents };
}));
const dep = await page.evaluate(() => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.money = 99999;
  const out = { state: B.state, tried: [] };
  for (const id of ['m240', 'at4', 'm119', 'm777']) {
    for (const rad of [60, 90, 120, 160, 200]) for (let a = 0; a < 360; a += 30) {
      const x = Math.cos(a * Math.PI / 180) * rad, z = Math.sin(a * Math.PI / 180) * rad;
      const p = new T.Vector3(x, terrain.heightAt(x, z), z);
      const v = B.validPlacement(p, null);
      if (!v.ok) { out.lastReason = v.reason; continue; }
      const before = B.units.length + B.pending.length;
      let err = null;
      try { B.deploy(id, p); } catch (e) { err = e.message; }
      out.tried.push({ id, rad, a, err, after: B.units.length + B.pending.length - before });
      if (B.units.length + B.pending.length > before) { out.ok = id; return out; }
      if (out.tried.length > 6) return out;
    }
  }
  return out;
});
console.log(JSON.stringify(dep).slice(0, 1500));
await page.evaluate(() => window.__comcard?.say('us', 'Battery, this is Buck.'));
await page.waitForTimeout(800);
console.log(await page.evaluate(() => {
  const d = document.getElementById('comcard'); if (!d) return 'no comcard el';
  const chain = []; let e = d; while (e && e !== document.documentElement) { const cs = getComputedStyle(e); chain.push(`${e.id || e.tagName}:${cs.display}/${cs.opacity}`); e = e.parentElement; }
  const r = d.getBoundingClientRect();
  const f = document.getElementById('feed'); const fr = f.getBoundingClientRect();
  return { hidden: d.hidden, cls: d.className, rect: [r.left, r.top, r.width, r.height], chain, feed: [fr.left, fr.top, fr.width, fr.height], feedCss: getComputedStyle(f).left + '/' + getComputedStyle(f).top };
}));
await page.screenshot({ path: '/tmp/out/mobaudit/_debug.png' });
await b.close();
