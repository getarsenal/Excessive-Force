// What the first-person weapon view is made of and how it renders: the
// M240 laid on the range, the view group found in the scene, each mesh's
// material read, the pixel under the receiver sampled from the canvas; then
// the same with every material swapped for a flat red one, to tell a shader
// that paints black from a mesh that is not there.
import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${process.env.TT_LEVEL || 'range'}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const r = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true;
  const p = new T.Vector3(-22, terrain.heightAt(-22, 20), 20);
  B.deploy('m240', p); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  window.__lay.enter(u);
  window.__frame();
  const E = window.__engine;
  let view = null; E.scene.traverse((o) => { if (o.userData && o.userData.belt) view = o; });
  if (!view) return { view: false };
  const mats = [];
  view.traverse((m) => { if (m.isMesh) mats.push({ type: m.type, name: m.name || m.parent?.name, mat: m.material.type, color: m.material.color?.getHexString(), emissive: m.material.emissive?.getHexString(), ei: m.material.emissiveIntensity, stylized: !!m.material.userData.stylized, layers: m.layers.mask, visible: m.visible, count: m.count }) });
  const cam = E.camera || window.rig.camera;
  const info = { near: cam.near, fov: cam.fov, camLayers: cam.layers.mask, viewPos: view.position.toArray().map((x) => +x.toFixed(2)), camPos: cam.position.toArray().map((x) => +x.toFixed(2)), lights: [] };
  E.scene.traverse((o) => { if (o.isLight) info.lights.push({ t: o.type, i: +o.intensity.toFixed(2) }); });
  return { mats, info, renderKeys: Object.keys(E).filter((k) => /render|compos|pass|grade/i.test(k)) };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: '/tmp/out/view-a.png', timeout: 120000 }).catch(() => {});
await page.evaluate(() => {
  const E = window.__engine, T = window.THREE;
  let view = null; E.scene.traverse((o) => { if (o.userData && o.userData.belt) view = o; });
  view.traverse((m) => { if (m.isMesh) m.material = new T.MeshBasicMaterial({ color: m.count ? 0x00ff00 : 0xff0000 }); });
  window.__frame();
});
await page.screenshot({ path: '/tmp/out/view-b.png', timeout: 120000 }).catch(() => {});
await b.close();
