// Where a crowded battle spends its frame. Loads a level, puts a big army on
// the ground the way a long game does, lets the fight run in game time and
// prints milliseconds per simulated second for each system.
//
//   node tools/perfprobe.mjs <level> [units=70] [seconds=20] [warm-up seconds=0]   (dev server on 5177)
import { chromium } from 'playwright';
const [level = 'florence', nUnits = '70', secs = '20', warm = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:5177/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(2000);
const r = await page.evaluate(([n, secs, warm]) => {
  const T = {}, C = {};
  const wrap = (obj, name, key) => {
    const f = obj[name]; if (!f) return;
    obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T[key] = (T[key] || 0) + performance.now() - t; C[key] = (C[key] || 0) + 1; } };
  };
  const tm = window.testMenu, bt = window.battle, g = bt.garrison;
  const kinds = ['m119', 'm777', 'at4', 'javelin', 'm109', 'stryker', 'm120', 'gustaf'];
  let placed = 0;
  for (let i = 0; placed < n && i < n * 3; i++) {
    const id = kinds[i % kinds.length];
    placed += tm.spawnAt(id, 1, (i * 2.39996) % (Math.PI * 2), 170 + (i % 5) * 35);
  }
  bt.airlift = false;
  // The phone's budget, which fastForward does not ask the governor for.
  window.physics.setBudget(+(new URLSearchParams(location.search).get('budget') || 180));
  window.__fastForward(warm);
  wrap(bt, 'update', 'battle.update');
  wrap(g, 'update', 'garrison.update');
  wrap(g, 'updateMortars', 'garrison.mortars');
  wrap(g, 'canSee', 'garrison.canSee');
  wrap(g, '_acquireAir', 'garrison.air');
  if (g.city) wrap(g.city, 'blocks', 'city.blocks');
  wrap(window.physics, 'step', 'physics.step');
  for (const s of window.structures) { wrap(s, 'solveStability', 'solve'); wrap(s, 'maintainIslands', 'islands'); wrap(s, 'syncTransforms', 'sync'); }
  if (bt.projectiles) wrap(bt.projectiles, 'update', 'projectiles');
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(bt))) {
    if (/^_?update[A-Z]/.test(k) && typeof bt[k] === 'function') wrap(bt, k, 'bt.' + k);
  }
  const l0 = g.losChecks;
  const t0 = performance.now();
  window.__fastForward(secs);
  const wall = performance.now() - t0;
  const eng = window.engine; eng.renderer.info.autoReset = false; eng.renderer.info.reset();
  const tr = performance.now(); window.__frame(); const frameMs = performance.now() - tr;
  const inf = eng.renderer.info;
  const withUnits = { calls: inf.render.calls, tris: inf.render.triangles };
  const byRoot = {};
  for (const c of eng.scene.children) { let n = 0; c.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints || o.isSprite) n++; }); byRoot[(c.name || c.type) + ''] = (byRoot[(c.name || c.type) + ''] || 0) + n; }
  const unitMeshes = bt.units.filter((u) => u.alive).reduce((a, u) => { let n = 0; u.group.traverse((o) => { if (o.isMesh && o.visible) n++; }); return a + n; }, 0);
  const triOf = (root) => { let t = 0; root.traverse((o) => { if ((o.isMesh) && o.visible && o.geometry) { const g = o.geometry; const n = g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3; t += n * (o.isInstancedMesh ? o.count : 1); } }); return Math.round(t); };
  const unitTris = {}; for (const u of bt.units) if (u.alive) unitTris[u.def?.id || u.type] = triOf(u.group);
  const rootTris = {}; for (const c of eng.scene.children) { const k = (c.name || c.type); rootTris[k] = (rootTris[k] || 0) + triOf(c); }
  const unitsHidden = (() => { for (const u of bt.units) u.group.visible = false; inf.reset(); window.__frame(); const r = { calls: inf.render.calls, tris: inf.render.triangles }; for (const u of bt.units) u.group.visible = true; return r; })();
  const render = { withUnits, unitTris, rootTris, unitsHidden, calls: inf.render.calls, tris: inf.render.triangles, geos: inf.memory.geometries, tex: inf.memory.textures, frameMs: frameMs.toFixed(0), unitMeshes, byRoot };
  const per = {}; for (const k in T) per[k] = `${(T[k] / secs).toFixed(1)} ms/s  (${C[k]} calls)`;
  return { placed, alive: bt.units.filter((u) => u.alive).length, defenders: g.defenders.filter((d) => d.alive).length,
    shells: bt.projectiles?.list?.length ?? bt.projectiles?.active?.length, awake: window.physics.awakeCount, sim: window.physics.dynamicSet.size,
    destroyed: window.structures.reduce((a, s) => a + s.destroyedCount, 0),
    render, wallMsPerSimSec: (wall / secs).toFixed(1), losPerSec: ((g.losChecks - l0) / secs).toFixed(0), per };
}, [+nUnits, +secs, +warm]);
console.log(JSON.stringify(r, null, 1));
await b.close();
