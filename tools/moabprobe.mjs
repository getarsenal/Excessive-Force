// A B-1's MOAB, measured: a level loaded on a phone profile, the Lancer
// called on a point (EDGE=1: the playfield's edge, where the last men of a
// garrison end up; else the landmark), the sortie flown to the end, and
// before and after: the JS heap, the renderer's geometries and textures,
// physics bodies (dynamic and all), whether the physics trapped, context
// loss, page errors, and the worst single frame. A phone tab that runs out
// of memory is killed and reloads to the title, which is what a crash on
// the bomb looks like from the player's side.
//   EDGE=1 node tools/moabprobe.mjs [level=westminster] [tier=low] [port=5177]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', tier = process.argv[3] || 'low', port = process.argv[4] || process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const errors = [], logs = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 400)));
page.on('console', (m) => { const t = m.text(); if (/trapped|context lost|error|Error/.test(t)) logs.push(t.slice(0, 300)); });
page.on('crash', () => errors.push('PAGE CRASHED'));
let booted = false;
page.on('framenavigated', (f) => { if (booted && f === page.mainFrame()) errors.push('NAVIGATED to ' + f.url()); });
await page.addInitScript((tier) => { try { localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}&c=999`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const snap = () => page.evaluate(() => {
  const r = window.__engine.renderer, P = window.battle.physics;
  let bodies = 0; try { bodies = P.world.bodies.len(); } catch { bodies = -1; }
  return { heapMB: +(performance.memory?.usedJSHeapSize / 1048576 || 0).toFixed(0), geo: r.info.memory.geometries, tex: r.info.memory.textures,
    bodies, dyn: P.dynamicSet.size, dead: !!P.dead, deadReason: P.deadReason || null, lost: r.getContext().isContextLost?.() || false,
    burnt: window.battle.cityFire?.burnt || 0, state: window.battle.state, bar: +window.battle.objectiveProgress.toFixed(3), defenders: (window.battle.garrison?.defenders || []).filter((d) => d.alive).length, sceneKids: window.__engine.scene.children.length, t: +window.battle.elapsed.toFixed(1) };
});
booted = true;
await page.evaluate(() => { window.__lastState = []; const B = window.battle; const ev = B.onEvent; B.onEvent = (n, d) => { window.__lastState.push(`${B.elapsed.toFixed(1)} ${n}`); if (window.__lastState.length > 40) window.__lastState.shift(); try { localStorage.setItem('tt.probe.last', JSON.stringify(window.__lastState.concat([B.state]))); } catch {} return ev.call(B, n, d); }; });
// The town first, when LATE=1: four 500-pounders' worth of it already gutted,
// as it is by the time the last of a garrison is out at the edge.
if (process.env.LATE) await page.evaluate(() => {
  const B = window.battle, o = B.primary.origin, T = window.THREE;
  for (let k = 0; k < 6; k++) { const a = k * 1.05; B.cityFire?.blast(new T.Vector3(o.x + Math.sin(a) * 260, 0, o.z + Math.cos(a) * 260), 40, 64); }
});
if (process.env.LATE) await page.evaluate(() => window.__fastForward(4, 1 / 30));
// Where the time and the memory go at the moment the bomb lands: each piece
// of the impact wrapped, its milliseconds and the heap it took kept.
await page.evaluate((near) => { window.__probeNear = near; }, !!process.env.NEAR);
await page.evaluate(() => {
  const B = window.battle, prof = window.__prof = {};
  const heap = () => performance.memory?.usedJSHeapSize || 0;
  const wrap = (obj, name, label) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const f = obj[name];
    obj[name] = function (...a) {
      const t0 = performance.now(), h0 = heap();
      try { return f.apply(this, a); } finally {
        const r = prof[label] || (prof[label] = { n: 0, ms: 0, worst: 0, mb: 0 });
        const ms = performance.now() - t0; r.n++; r.ms += ms; r.worst = Math.max(r.worst, ms); r.mb += (heap() - h0) / 1048576;
      }
    };
  };
  wrap(B, '_strikeImpact', 'impact (all)');
  wrap(B, '_streetBlast', 'streetBlast');
  wrap(B.cityFire, 'blast', 'cityFire.blast');
  wrap(B.cityFire, 'burn', 'cityFire.burn');
  wrap(B.fx, 'strikeBlast', 'fx.strikeBlast');
  wrap(B.fx, 'dustColumn', 'fx.dustColumn');
  wrap(B.fx, 'detonate', 'fx.detonate');
  wrap(B.fx.flourish, 'mushroom', 'flourish.mushroom');
  wrap(B.fx.flourish, 'wilson', 'flourish.wilson');
  wrap(B.fx.flourish, 'glass', 'flourish.glass');
  wrap(B.fx.flourish, 'paperSnow', 'flourish.paperSnow');
  wrap(B.fires, 'ignite', 'fires.ignite');
  wrap(B.fires, 'update', 'fires.update');
  wrap(B.craters, 'add', 'craters.add');
  wrap(B.fx, 'update', 'fx.update');
  wrap(B.garrison, 'splash', 'garrison.splash');
  for (const st of B.structures) wrap(st, 'explode', 'structure.explode');
});
const gpuBytes = () => page.evaluate(() => {
  const seen = new Set(); let bytes = 0, tris = 0, meshes = 0;
  window.__engine.scene.traverse((o) => {
    const g = o.geometry; if (!g) return; meshes++;
    for (const a of Object.values(g.attributes)) { const arr = a.array || a.data?.array; if (arr && !seen.has(arr)) { seen.add(arr); bytes += arr.byteLength; } }
    if (g.index && !seen.has(g.index.array)) { seen.add(g.index.array); bytes += g.index.array.byteLength; }
  });
  return { bufMB: +(bytes / 1048576).toFixed(1), meshes };
});
console.log('buffers before', JSON.stringify(await gpuBytes()));
const before = await snap();
const r = await page.evaluate(async ([edge, town]) => {
  const B = window.battle, T = window.THREE, o = B.primary.origin, t = window.terrain;
  B.unlockAll = true; B.freeBuild = true; B.invulnerable = true;
  // Nothing shoots the Lancer down: the question is the bomb, not the flak.
  if (B.garrison) B.garrison.fireEnabled = false;
  if (B.sams) { try { for (const s of B.sams.sites || []) s.dead = true; } catch {} B.sams.enabled = false; }
  let at;
  if (edge) {
    // The playfield's edge on the camera's side, on dry ground.
    const cam = window.__engine.camera.position, a = Math.atan2(cam.x - o.x, cam.z - o.z);
    for (let rr = t.span * 0.97; rr > t.span * 0.6 && !at; rr -= 15) {
      for (const da of [0, 0.3, -0.3, 0.6, -0.6]) {
        const x = o.x + Math.sin(a + da) * rr, z = o.z + Math.cos(a + da) * rr;
        if (Math.abs(x) < t.span && Math.abs(z) < t.span && !t.isWater(x, z)) { at = new T.Vector3(x, t.heightAt(x, z), z); break; }
      }
    }
  }
  if (town) {
    // The thickest part of the town, out past two hundred metres.
    const plots = window.__engine.scene.getObjectByName('context')?.userData?.plots || [];
    let best = null, bn = 0;
    for (const p of plots) {
      const r = Math.hypot(p.x - o.x, p.z - o.z);
      if (r < 220) continue;
      let n = 0; for (const q of plots) if (Math.abs(q.x - p.x) < 110 && Math.abs(q.z - p.z) < 110) n++;
      if (n > bn) { bn = n; best = p; }
    }
    if (best) at = new T.Vector3(best.x, t.heightAt(best.x, best.z), best.z);
  }
  if (!at) at = new T.Vector3(o.x, t.heightAt(o.x, o.z), o.z);
  // NEAR=1: the camera where the player had it, zoomed in on the men he was
  // bombing, so the cloud comes up all round the view.
  if (window.__probeNear) { window.__rig.focus(at.clone().setY(at.y + 4), 140); window.__rig.update?.(1); }
  const s = B.callStrike('b1', at);
  return { called: !!s, at: at.toArray().map((v) => +v.toFixed(0)), span: t.span };
}, [!!process.env.EDGE, !!process.env.TOWN]);
console.log('call', JSON.stringify(r));
// Fly it out, a second at a time, noting the worst frame.
let worst = 0, peakHeap = before.heapMB, peakGeo = before.geo, peakDyn = 0;
for (let s = 0; s < (+process.env.SECS || 70); s++) {
  let ms = 0;
  try {
    ms = await page.evaluate((draw) => { const t0 = performance.now(); window.__fastForward(1, 1 / 30); if (draw) window.__frame?.(); return performance.now() - t0; }, s % 5 === 4 && !(s >= 17 && s <= 30));
    // Through the cloud, a frame a second, the draw timed to the GPU's finish.
    // and the fill: every live particle's share of the screen, summed, as
    // drawn (sizes clamped to half their distance, the near ones faded out)
    // and as it was drawn before the clamp. A share is at most one screen.
    if (s >= 17 && s <= 30) {
      const f = await page.evaluate(() => {
        const fx = window.battle.fx, cam = window.__engine.camera;
        cam.updateMatrixWorld(); const inv = cam.matrixWorldInverse;
        const k = 2 * Math.tan((cam.fov * Math.PI / 180) / 2);
        const pools = new Map();
        const look = (o, pre) => { for (const [key, v] of Object.entries(o || {})) if (v && v.size0 instanceof Float32Array && v.age && v.life && typeof v.count === 'number' && !pools.has(v)) pools.set(v, pre + key); };
        look(fx, ''); look(fx.flourish, 'flourish.');
        const by = {};
        const v = new window.THREE.Vector3();
        let raw = 0, drawn = 0, n = 0;
        for (const [P, name] of pools) {
          const before = drawn;
          for (let i = 0; i < P.count; i++) {
            const t = Math.min(1, P.age[i] / Math.max(1e-6, P.life[i]));
            const size = P.size0[i] + (P.size1[i] - P.size0[i]) * Math.pow(t, 0.55);
            v.set(P.pos[i * 3], P.pos[i * 3 + 1], P.pos[i * 3 + 2]).applyMatrix4(inv);
            const d = -v.z; if (d <= 0.05) continue;
            n++;
            raw += Math.min(1, (size / (k * d)) ** 2);
            const sz = Math.min(size, d * 0.5), fade = Math.min(1, Math.max(0, (d - 0.5) / 2.5));
            if (fade > 0.004 && !(P.thin < 1 && P.seed[i] > P.thin)) drawn += Math.min(1, (sz / (k * d)) ** 2);
          }
          if (drawn - before > 0.5) by[name] = [P.count, +(drawn - before).toFixed(1)];
        }
        return { particles: n, screensRaw: +raw.toFixed(1), screensDrawn: +drawn.toFixed(1), governor: [+(fx.fillNow || 0).toFixed(1), +(fx.thinNow ?? 1).toFixed(2), fx.fillBudget], by };
      });
      console.log('   frame t+' + (s + 1), JSON.stringify(f));
      // SHOT=1: the cloud photographed as drawn and with no budget, side by side.
      if (process.env.SHOT && (s + 1 === 21 || s + 1 === 25)) {
        for (const [tag, budget] of [['budget', null], ['unbudgeted', 1e9], ['phone', 20]]) {
          await page.evaluate((b) => { const fx = window.battle.fx; fx._saved = fx._saved ?? fx.fillBudget; fx.fillBudget = b ?? fx._saved; fx.update(1e-4); window.__engine.render(); }, budget);
          await page.screenshot({ path: `/tmp/out/moab-t${s + 1}-${tag}.png`, timeout: 600000 });
        }
        await page.evaluate(() => { const fx = window.battle.fx; fx.fillBudget = fx._saved; });
      }
    }
  } catch (e) { errors.push('evaluate failed: ' + String(e).slice(0, 200)); break; }
  worst = Math.max(worst, ms);
  const m = await snap().catch(() => null);
  if (!m) break;
  peakHeap = Math.max(peakHeap, m.heapMB); peakGeo = Math.max(peakGeo, m.geo); peakDyn = Math.max(peakDyn, m.dyn);
  if (s % 5 === 4) {
    const air = await page.evaluate(() => { const B = window.battle; return { sorties: B.air.sorties.map((q) => [q.def.id, +q.t.toFixed(1), q.releaseAt && +q.releaseAt.toFixed(1)]), bombs: (B.projectiles?.list || B.projectiles || []).length ?? null, ev: (window.__lastState || []).slice(-6).join(' | ') }; }).catch(() => null);
    console.log(' t+' + (s + 1), Math.round(ms) + 'ms', JSON.stringify(m), JSON.stringify(air));
  }
  if (m.dead) break;
}
const after = await snap().catch(() => null);
console.log('buffers after ', JSON.stringify(await gpuBytes().catch(() => null)));
const prof = await page.evaluate(() => window.__prof).catch(() => null);
if (prof) for (const [k, r] of Object.entries(prof).sort((a, b) => b[1].ms - a[1].ms)) console.log('  ' + k.padEnd(20), String(r.n).padStart(5), 'calls', r.ms.toFixed(0).padStart(6), 'ms', 'worst', r.worst.toFixed(1).padStart(6), 'heap', r.mb.toFixed(1), 'MB');
console.log('before', JSON.stringify(before));
console.log('after ', JSON.stringify(after));
console.log('peaks  heap', peakHeap, 'MB · geometries', peakGeo, '· dynamic bodies', peakDyn, '· worst step', Math.round(worst), 'ms');
console.log('errors', JSON.stringify(errors.slice(0, 5)));
console.log('logs  ', JSON.stringify(logs.slice(0, 6)));
try { console.log('last events', await page.evaluate(() => localStorage.getItem('tt.probe.last'))); } catch (e) { console.log('no last events', String(e).slice(0, 100)); }
await b.close();
