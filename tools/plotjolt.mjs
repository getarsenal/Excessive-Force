// The mortar's plot at the shot: an M120 laid on the range, FIRE, the
// plot's jolt and the camera's movement read frame by frame from the press
// to a second after, so the jolt is seen to land when the shell leaves.
//   node tools/plotjolt.mjs [level=range]
import { chromium } from 'playwright';
const [level = 'range'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const r = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true;
  const p = new T.Vector3(10, terrain.heightAt(10, 20), 20);
  B.deploy('m120', p); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  window.__lay.enter(u);
  for (let k = 0; k < 60 && u.cooldown > 0; k++) window.__fastForward(0.2, 1 / 30);
  window.__frame();
  const cam = window.rig.camera, R = window.__lay.recoil;
  const rows = [];
  const p0 = cam.position.clone();
  B.handFire();
  let t = 0;
  for (let i = 0; i < 20; i++) {
    window.__fastForward(0.05, 1 / 60); t += 0.05;
    window.__frame();
    rows.push(`${t.toFixed(2)} shake=${R.shake.toFixed(2)} cam±${cam.position.distanceTo(p0).toFixed(2)}m pending=${!!u.live?.pending}`);
  }
  return rows;
});
console.log(r.join('\n'));
await b.close();
