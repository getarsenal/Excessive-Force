/**
 * Straight down on a spot with the fog off, the HUD cleared and the camera
 * unbounded, for judging the map edge and the country past it.
 *
 *   node tools/topview.mjs <level> <out> [dist] [x] [z] [pitch] [yaw]
 *   HIDE=name,name hides those scene objects; QS= adds a query.
 */
import { chromium } from 'playwright';
const [level = 'westminster', out = '/tmp/out/edge2', dist = '2400', tx = '0', tz = '0', pitch = '1.5', yaw = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 1000 } });
await page.addInitScript(() => { localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); });
await page.goto(`http://localhost:5177/?level=${level}${process.env.QS ? '&' + process.env.QS : ''}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
await page.evaluate(() => window.hud.setClearView(true));
await page.evaluate(([d, x, z, pi, ya]) => {
  const r = window.rig, T = window.terrain;
  r.maxDistance = 1e5;
  r.target.set(x, T.heightAt(x, z), z); r.desiredTarget.copy(r.target);
  r.yaw = r.desiredYaw = ya; r.pitch = r.desiredPitch = pi; r.distance = r.desiredDistance = d;
  window.engine.camera.far = 1e5; window.engine.camera.updateProjectionMatrix();
  const f = window.engine.scene.fog; if (f) f.density = 0;
}, [+dist, +tx, +tz, +pitch, +yaw]);
await page.waitForTimeout(4000);
await page.evaluate(() => { const f = window.engine.scene.fog; if (f) f.density = 0; });
if (process.env.HIDE) await page.evaluate((names) => { window.engine.scene.traverse((c) => { if (names.includes(c.name)) c.visible = false; }); }, process.env.HIDE.split(','));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}.png` });
await b.close();
