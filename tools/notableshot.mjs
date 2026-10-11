// The town's own landmarks (notables.js), photographed: every plot the pass
// dressed, listed with its manner and name, and the biggest few framed from a
// playing distance. Writes /tmp/out/notables/<level>-<k>.png.
//   node tools/notableshot.mjs [level=westminster] [count=4] [port=5177]   TIER=low|medium  DIST=120
import { chromium } from 'playwright';
import fs from 'node:fs';
const level = process.argv[2] || 'westminster', count = +(process.argv[3] || 4), port = process.argv[4] || process.env.TT_PORT || 5177;
const out = '/tmp/out/notables';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 852, height: 480 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (/town stages|notable/i.test(m.text())) console.log('  ', m.text().slice(0, 300)); });
await page.addInitScript((tier) => { try { localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, process.env.TIER || 'low');
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.addStyleTag({ content: '#ui, #hud, .hud, #topbar, #dock { display: none !important; }' });
const list = await page.evaluate(() => {
  const ctx = window.__engine.scene.getObjectByName('context');
  const plots = ctx?.userData?.plots || [];
  return plots.filter((p) => p.extra?.length || (p.kind && /church|mosque|religious|shrine|station|cathedral|temple/.test(p.kind)))
    .map((p) => ({ x: p.x, z: p.z, y: p.base, h: p.h, w: p.w, d: p.d, kind: p.kind, name: p.name, extra: (p.extra || []).length, top: Math.max(p.base + p.h, ...(p.extra || []).map((e) => e.y1)) }))
    .sort((a, b) => b.w * b.d - a.w * a.d);
});
console.log(level, list.length, 'notable plots');
for (const n of list.slice(0, 14)) console.log('  ', (n.kind || '-').padEnd(13), String(Math.round(n.top - n.y)).padStart(4), 'm', n.extra, 'solids ', n.name || '');
const dist = +(process.env.DIST || 0);
for (let i = 0; i < Math.min(count, list.length); i++) {
  const n = list[i];
  await page.evaluate(({ n, dist }) => {
    const rig = window.__rig;
    const D = dist || Math.max(70, Math.max(n.w, n.d) * 2.4 + (n.top - n.y));
    rig.desiredTarget.set(n.x, n.y + (n.top - n.y) * 0.35, n.z); rig.target?.copy?.(rig.desiredTarget);
    rig.desiredDistance = rig.distance = D;
    rig.desiredPitch = rig.pitch = 0.42;
    if (window.__frame) for (let k = 0; k < 4; k++) window.__frame();
  }, { n, dist });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${level}-${i}.png`, timeout: 120000 });
}
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close();
