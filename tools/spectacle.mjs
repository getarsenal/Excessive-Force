// The last batch, photographed: the three optics, dirt on the lens, the
// MOAB (mushroom cloud, condensation shell, white-out) and the fireworks.
//
//   node tools/spectacle.mjs [level=westminster]   -> /tmp/out/spec-<name>.png
import { chromium } from 'playwright';
const [level = 'westminster'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); localStorage.setItem('tt.optics', 'day'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.evaluate(() => { const B = window.battle; B.unlockAll = true; B.freeBuild = true; B.airborne.auto = false; B.garrison.fireEnabled = false; });
const freeze = (ms) => page.evaluate((ms) => { for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = ms; } catch {} } }, ms);
const shot = (n) => page.screenshot({ path: `/tmp/out/spec-${n}.png`, timeout: 180000 });

// Optics: T twice, a picture each.
for (const n of ['thermal', 'nv']) {
  await page.keyboard.press('t');
  await page.waitForTimeout(900);
  await shot(`optics-${n}`);
}
await page.keyboard.press('t');

// Dirt on the lens: a blast a few metres in front of the camera.
await page.evaluate(() => {
  const c = window.battle.camera, THREE = window.THREE;
  const d = new THREE.Vector3(); c.getWorldDirection(d);
  window.fx.detonate(c.position.clone().addScaledVector(d, 25), 1.2, { ground: false });
});
await page.waitForTimeout(400);
await freeze(700);
await shot('lens');
await page.evaluate(() => { for (const a of document.getAnimations()) a.finish?.(); });

// The MOAB, on open ground: the white-out at once, the shell and the cloud.
await page.evaluate(() => {
  const B = window.battle, THREE = window.THREE, t = window.terrain, o = B.primary.origin, r = window.rig;
  let p = null;
  for (let k = 0; k < 80 && !p; k++) {
    const a = k * 0.7, rr = 330 + (k % 4) * 40;
    const q = new THREE.Vector3(o.x + Math.sin(a) * rr, 0, o.z + Math.cos(a) * rr);
    q.y = t.heightAt(q.x, q.z);
    if (!t.isWater(q.x, q.z) && B.validPlacement(q).ok) p = q;
  }
  window.__p = p;
  r.target.set(p.x, p.y + 80, p.z); r.desiredTarget.copy(r.target);
  r.pitch = r.desiredPitch = 0.12; r.distance = r.desiredDistance = 900;
  for (let k = 0; k < 40; k++) r.update(0.1);
  const def = { strike: { frac: 0.35, maxR: 120, minR: 18, fx: 9.5 } };
  const w = { lethal: 90, radius: 110, power: 400000, fx: 9.5, kinetic: 0.4 };
  B._strikeImpact({ point: p.clone(), proj: { warhead: w, strikeDef: def, vel: new THREE.Vector3(0, -50, 0), target: p.clone(), kind: 'bomb' }, groundHit: true });
});
await page.waitForTimeout(300);
await freeze(120);
await shot('moab-0');
await page.evaluate(() => { for (const a of document.getAnimations()) a.finish?.(); window.__fastForward(0.35, 1 / 30); });
await page.waitForTimeout(500);
await shot('moab-shell');
await page.evaluate(() => window.__fastForward(5, 1 / 30));
await page.waitForTimeout(600);
await shot('moab-cloud');

// Fireworks over the ruin.
await page.evaluate(async () => {
  const synth = await import('/src/core/synth.js');
  const p = window.__p, r = window.rig;
  r.target.set(p.x, p.y + 90, p.z); r.desiredTarget.copy(r.target);
  r.distance = r.desiredDistance = 420; r.pitch = r.desiredPitch = 0.05;
  for (let k = 0; k < 40; k++) r.update(0.1);
  window.__fastForward(14, 1 / 30);
  for (let i = 0; i < 6; i++) window.fx.flourish.firework(p.x + (i - 3) * 25, p.y + 1, p.z, 90 + i * 12, null, synth);
  window.__fastForward(4.6, 1 / 30);
});
await page.waitForTimeout(600);
await shot('fireworks');
await b.close();
console.log('done');
