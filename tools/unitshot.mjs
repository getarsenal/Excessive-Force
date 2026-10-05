// Three guns and a squad on the ground at low tier, from close: the contact
// shadows under them. node tools/unitshot.mjs [level] -> /tmp/out/units-<level>.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 620 } });
await page.addInitScript((tier) => { try {
  localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, process.env.TIER || 'low');
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.airborne.auto = false; B.assault.auto = false;
  const ids = ['m119', 'm777', 'm109', 'infantry'];
  let first = null, n = 0;
  for (let k = 0; k < 400 && n < ids.length; k++) {
    const a = 0.9 + k * 0.05, rad = 160 + (k % 3) * 9;
    const q = new T.Vector3(o.x + Math.sin(a) * rad, 0, o.z + Math.cos(a) * rad);
    q.y = B.terrain.heightAt(q.x, q.z);
    if (!B.validPlacement(q).ok) continue;
    if (await B.deploy(ids[n], q)) { n++; first = first || q; k += 3; }
  }
  for (let k = 0; k < 600 && B.units.filter((x) => x.alive).length < n; k++) window.__fastForward(0.1, 0.1);
  for (let k = 0; k < 40; k++) window.__fastForward(0.1, 0.1);
  const live = B.units.filter((x) => x.alive);
  const c = new T.Vector3(); for (const u of live) c.add(u.pos); c.divideScalar(live.length || 1);
  const R = window.rig; R.target.copy(c); R.desiredTarget.copy(c); R.distance = R.desiredDistance = 48; R.pitch = R.desiredPitch = 0.62;
  for (let k = 0; k < 20; k++) R.update(0.1);
  for (let k = 0; k < 4; k++) window.__frame();
  const cs = window.engine.scene.getObjectByName('contact-shadows');
  return { deployed: n, alive: live.length, discs: cs?.count, visible: cs?.visible, shadows: window.engine.renderer.shadowMap.enabled };
});
await page.waitForTimeout(400);
await page.screenshot({ path: `/tmp/out/units-${level}.png` });
console.log(JSON.stringify(r));
await b.close();
