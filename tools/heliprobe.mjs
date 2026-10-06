// The Chinook lift under stress, on a phone's tier: N towed guns put down in
// one package and flown in under N helicopters, the fight stepped through the
// whole flight, and every few seconds the JS heap, the renderer's geometries
// and textures, draw calls, render and update time, the slowest single step,
// the sorties alive and down, the garrison's air shots, audio voices, FX
// objects, page errors and context loss.
//   node tools/heliprobe.mjs [level=westminster] [n=10] [tier=medium] [kind=m777] [seconds=150]
import { chromium } from 'playwright';
const [level = 'westminster', nStr = '10', tier = 'medium', kind = 'm777', secStr = '150'] = process.argv.slice(2);
const n = +nStr, seconds = +secStr;
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--enable-precise-memory-info'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const snap = (label) => page.evaluate((label) => {
  const B = window.battle, E = window.__engine, R = E?.renderer, I = R?.info;
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  let rMs = 0, uMs = 0, calls = null, tris = null;
  if (E) {
    let t0 = performance.now(); for (let i = 0; i < 3; i++) E.render(); rMs = +((performance.now() - t0) / 3).toFixed(1);
    calls = I.render.calls; tris = I.render.triangles;
    t0 = performance.now(); for (let i = 0; i < 3; i++) B.update(1 / 60); uMs = +((performance.now() - t0) / 3).toFixed(1);
  }
  let objs = 0, fxObjs = 0; E?.scene?.traverse((o) => { objs++; if (o.isSprite || o.isPoints) fxObjs++; });
  const S = B.air?.sorties || [];
  return { t: label, units: B.units.filter((u) => u.alive).length, pending: B.pending.length,
    sorties: S.length, helis: S.filter((s) => s.heli).length, downed: S.filter((s) => s.downed).length, hits: S.reduce((a, s) => a + (s.hits || 0), 0),
    heapMB: mem, geos: I?.memory.geometries, tex: I?.memory.textures, programs: I?.programs?.length, tris, calls,
    bodies: B.physics?.world?.bodies?.len?.() ?? null, projectiles: B.projectiles?.list?.length ?? null, voices: window.audio?.voices ?? null,
    ctxLost: window.__ctxLost, renderMs: rMs, updateMs: uMs, maxStepMs: window.__maxStep, sceneObjs: objs, fxObjs };
}, label);
await page.evaluate(() => {
  const B = window.battle; B.freeBuild = true; B.unlockAll = true;
  window.__ctxLost = 0; window.__maxStep = 0;
  document.querySelector('canvas').addEventListener('webglcontextlost', () => { window.__ctxLost++; }, false);
  const o = B.primary.origin; B.setTarget(new window.THREE.Vector3(o.x, B.originGround + 25, o.z), 'tower');
});
const rows = [await snap('before')];
console.log(JSON.stringify(rows[0]));
const placed = await page.evaluate(([kind, n]) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  let placed = 0;
  for (let tries = 0; tries < 600 && placed < n; tries++) {
    const a = Math.random() * Math.PI * 2, rad = 200 + Math.random() * 220;
    const x = o.x + Math.cos(a) * rad, z = o.z + Math.sin(a) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    const before = B.pending.length;
    B.deploy(kind, p);
    if (B.pending.length > before) placed++;
  }
  // The package closes now rather than after its window.
  const t0 = performance.now();
  if (B.package) B._launch();
  return { placed, launchMs: +(performance.now() - t0).toFixed(1), lift: B.air?.lastLift, sorties: B.air?.sorties?.length };
}, [kind, n]);
console.log(JSON.stringify({ placed }));
for (let t = 0; t < seconds; t += 5) {
  await page.evaluate(() => {
    window.__maxStep = 0;
    for (let s = 0; s < 5 * 30; s++) { const t0 = performance.now(); window.__fastForward(1 / 30, 1 / 30); const d = performance.now() - t0; if (d > window.__maxStep) window.__maxStep = d; }
  });
  const s = await snap(t + 5); rows.push(s);
  console.log(JSON.stringify(s));
  if (s.ctxLost || errors.length > 5) break;
}
console.log(JSON.stringify({ level, tier, kind, n, errors: errors.slice(0, 8), nErrors: errors.length }));
await b.close();
