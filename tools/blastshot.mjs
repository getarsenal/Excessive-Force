// A strike's blast, photographed as it develops: one burst of a given size on
// open ground, seen from the side at a fixed distance, frozen at a run of
// moments after it goes off, and laid side by side in one strip.
//
//   node tools/blastshot.mjs [level=giza] [fx=5.0] [dist=350]   -> /tmp/out/blast-<fx>.png
//
// `fx` is the warhead's fx number: 4.6 the F-15's 500 lb, 5.0 the GBU-28,
// 9.5 the MOAB. Dev server on 5177.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [level = 'giza', fx = '5.0', dist = '350'] = process.argv.slice(2);
const TIMES = (process.env.TIMES || '0.15,0.5,1.2,2.5,5').split(',').map(Number);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 480, height: 400 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'high'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const at = await page.evaluate(([fx, dist]) => {
  const B = window.battle, THREE = window.THREE, ff = window.__fastForward;
  B.garrison.fireEnabled = false; B.airborne.auto = false;
  ff(1);
  // Open ground: a point well off the monument, clear of the town.
  const o = B.primary.origin, t = window.terrain;
  let p = null;
  for (let k = 0; k < 80 && !p; k++) {
    const a = k * 0.7, r = 260 + (k % 5) * 40;
    const q = new THREE.Vector3(o.x + Math.sin(a) * r, 0, o.z + Math.cos(a) * r);
    q.y = t.heightAt(q.x, q.z);
    if (!t.isWater(q.x, q.z) && B.validPlacement(q).ok) p = q;
  }
  window.__blastAt = p;
  const r = window.rig;
  r.target.set(p.x, p.y + 30, p.z); r.desiredTarget.copy(r.target);
  r.pitch = r.desiredPitch = 0.12; r.distance = r.desiredDistance = dist;
  for (let k = 0; k < 40; k++) r.update(0.1);
  document.body.classList.add('clear-view');
  return [p.x, p.y, p.z].map((v) => Math.round(v));
}, [+fx, +dist]);
console.log('blast at', at);
await page.evaluate(([fx]) => {
  const p = window.__blastAt;
  window.fx.strikeBlast(p.clone().setY(p.y + 1), fx, { groundY: p.y });
  window.fx.dustColumn(p.x, p.y, p.z, fx * 0.52);
  window.__blastT = 0;
}, [+fx]);
const frames = [];
for (const t of TIMES) {
  await page.evaluate((t) => {
    const step = t - window.__blastT;
    // Fast-forward steps the effects with the battle.
    if (step > 0) window.__fastForward(step, 1 / 30);
    window.__blastT = t;
    for (let k = 0; k < 3; k++) window.rig.update(0.1);
  }, t);
  await page.waitForTimeout(250);
  const f = `/tmp/out/blast-${fx}-${t}.png`;
  await page.screenshot({ path: f, timeout: 120000 });
  frames.push(f);
}
// One strip.
const html = `<html><body style="margin:0;background:#000;display:flex">${frames.map((f, i) =>
  `<div style="position:relative"><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:480px;display:block"><div style="position:absolute;top:6px;left:8px;color:#fff;font:16px sans-serif;text-shadow:0 0 3px #000">${TIMES[i]} s</div></div>`).join('')}</body></html>`;
const strip = await b.newPage({ viewport: { width: 480 * frames.length, height: 400 } });
await strip.setContent(html);
await strip.screenshot({ path: `/tmp/out/blast-${fx}.png` });
console.log(`/tmp/out/blast-${fx}.png`);
await b.close();
