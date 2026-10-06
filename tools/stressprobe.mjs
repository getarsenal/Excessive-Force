// How the game holds up under a big battery, on a phone: units put down in
// batches of six round the target, the fight stepped between batches, and
// after each batch the JS heap, the renderer's geometries/textures/triangles/
// draw calls, the physics body count, page errors and WebGL context loss.
//   node tools/stressprobe.mjs [level=westminster] [units=60] [tier=low]
import { chromium } from 'playwright';
const [level = 'westminster', nUnits = '60', tier = 'low'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--enable-precise-memory-info'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const B = window.battle; B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
  window.__ctxLost = 0;
  document.querySelector('canvas').addEventListener('webglcontextlost', () => { window.__ctxLost++; }, false);
  const o = B.primary.origin; B.setTarget(new window.THREE.Vector3(o.x, B.originGround + 25, o.z), 'tower');
});
const snap = () => page.evaluate(() => {
  const B = window.battle, E = window.__engine, R = E?.renderer, I = R?.info;
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  // Render and simulation timed apart, each over four passes; the renderer's
  // counters read straight after a render, before the next reset.
  let rMs = 0, uMs = 0, calls = null, tris = null;
  if (E) {
    let t0 = performance.now(); for (let i = 0; i < 4; i++) E.render(); rMs = +((performance.now() - t0) / 4).toFixed(1);
    calls = I.render.calls; tris = I.render.triangles;
    t0 = performance.now(); for (let i = 0; i < 4; i++) B.update(1 / 60); uMs = +((performance.now() - t0) / 4).toFixed(1);
  }
  let objs = 0; E?.scene?.traverse(() => objs++);
  return { units: B.units.filter((u) => u.alive).length, pending: B.pending.length, air: B.air?.sorties?.length ?? null,
    heapMB: mem, geos: I?.memory.geometries, tex: I?.memory.textures, programs: I?.programs?.length, tris, calls,
    bodies: B.physics?.world?.bodies?.len?.() ?? null, ctxLost: window.__ctxLost, renderMs: rMs, updateMs: uMs, sceneObjs: objs };
});
const rows = [await snap()];
const kinds = ['m119', 'm777', 'm240', 'm109', 'at4', 'm270', 'stryker', 'm120'];
let placed = 0, k = 0;
for (let batch = 0; placed < +nUnits && batch < 20; batch++) {
  const got = await page.evaluate(([kinds, k, n]) => {
    const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
    let placed = 0, kk = k;
    for (let tries = 0; tries < 400 && placed < n; tries++) {
      const a = Math.random() * Math.PI * 2, rad = 180 + Math.random() * 260;
      const x = o.x + Math.cos(a) * rad, z = o.z + Math.sin(a) * rad;
      const p = new T.Vector3(x, terrain.heightAt(x, z), z);
      if (!B.validPlacement(p, null).ok) continue;
      const before = B.units.length + B.pending.length;
      B.deploy(kinds[kk % kinds.length], p);
      if (B.units.length + B.pending.length > before) { placed++; kk++; }
    }
    // Through the lift and a little fighting.
    for (let s = 0; s < 40; s++) window.__fastForward(1, 1 / 30);
    return { placed, k: kk };
  }, [kinds, k, 6]);
  placed += got.placed; k = got.k;
  await page.waitForTimeout(1200);
  const s = await snap(); s.placedSoFar = placed; rows.push(s);
  console.log(JSON.stringify(s));
  if (s.ctxLost || errors.length > 5) break;
}
console.log(JSON.stringify({ level, tier, errors: errors.slice(0, 8), nErrors: errors.length }));
await b.close();
