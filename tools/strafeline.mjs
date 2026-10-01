// The A-10's gun-run line as the player draws it: laid through the town
// beside the monument and photographed from the level's own camera, so a
// line that buildings would hide is visible or not.
//
//   node tools/strafeline.mjs [level]          -> /tmp/out/strafeline-<level>.png
//   PHONE=1 node tools/strafeline.mjs [level]  a phone in portrait
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const phone = !!process.env.PHONE;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage(phone
  ? { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const info = await page.evaluate(async () => {
  const B = window.battle, THREE = window.THREE;
  const { UNITS_BY_ID } = await import('/src/game/units.js');
  window.__fastForward(1);
  // A run across the town between the camera and the monument, a third of
  // the way out, square to the line of sight.
  const o = B.primary.origin, cam = B.camera.position;
  let dx = cam.x - o.x, dz = cam.z - o.z;
  const l = Math.hypot(dx, dz); dx /= l; dz /= l;
  const mid = new THREE.Vector3(o.x + dx * l * 0.35, 0, o.z + dz * l * 0.35);
  const from = mid.clone().add(new THREE.Vector3(dz * 80, 0, -dx * 80));
  const to = mid.clone().add(new THREE.Vector3(-dz * 80, 0, dx * 80));
  from.y = window.terrain.heightAt(from.x, from.z); to.y = window.terrain.heightAt(to.x, to.z);
  B.showStrafe(from, to, UNITS_BY_ID.a10);
  document.body.classList.add('clear-view');
  return { len: Math.round(from.distanceTo(to)) };
});
console.log(JSON.stringify(info));
await page.waitForTimeout(600);
await page.screenshot({ path: `/tmp/out/strafeline-${level}${phone ? '-phone' : ''}.png`, timeout: 180000 });
await b.close();
