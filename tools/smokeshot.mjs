// Smoke off hot metal: the M240 laid on THE RANGE and run hot (the trigger
// held till the barrel locks), photographed from the gunner's eye with the
// trigger let go, then an M777 fired and its muzzle photographed from beside
// the gun a second and three seconds after the shot. Prints the live smoke
// particle count at each picture.
//   node tools/smokeshot.mjs  -> /tmp/out/smoke-{mg,gun1,gun3}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const smokeN = () => page.evaluate(() => window.battle.fx.smoke.count);
await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true;
  B.deploy('m240', new T.Vector3(-22, terrain.heightAt(-22, 20), 20)); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  window.__lay.enter(u);
  B.layTurn(0, 0);
  // Run near the lock: the trigger held over a few real frames, the
  // battle stepped on between them, then let go.
  window.__lay.hold(true);
  for (let k = 0; k < 60 && B.lay.heat < 0.9; k++) { window.__fastForward(0.1, 1 / 60); await new Promise((r) => requestAnimationFrame(r)); }
  window.__lay.hold(false);
});
await page.waitForTimeout(2500);
console.log(JSON.stringify({ shot: 'mg', heat: await page.evaluate(() => +window.battle.lay.heat.toFixed(2)), smoke: await smokeN() }));
await page.screenshot({ path: '/tmp/out/smoke-mg.png', timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 80)));
await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  window.__lay.exit();
  B.deploy('m777', new T.Vector3(40, terrain.heightAt(40, 30), 30)); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  // The model (and the barrel cut out of it) loads on its own time.
  for (let k = 0; k < 200 && !u.barrelB; k++) await new Promise((r) => setTimeout(r, 50));
  window.__u = u;
  window.__lay.enter(u);
  u.cooldown = 0;
  window.__lay.fire();
});
for (const [tag, ms] of [['gun1', 1200], ['gun3', 2500]]) {
  await page.waitForTimeout(ms);
  console.log(JSON.stringify({ shot: tag, ...(await page.evaluate(() => { const L = window.battle.lay; return { same: L?.unit === window.__u, kind: L?.unit.def.id, smokeT: L?.unit.smokeT, recoil: L?.unit.recoilT, cd: L?.unit.cooldown }; })), smoke: await smokeN() }));
  await page.screenshot({ path: `/tmp/out/smoke-${tag}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 80)));
}
console.log('errors', errors.length ? errors : 'none');
await b.close();
