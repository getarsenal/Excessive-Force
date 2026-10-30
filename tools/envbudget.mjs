// The environment's budget: what everything but the target costs a frame.
//
// The abstract world (src/world/abstract.js) is built to a hard triangle
// budget. This loads a level in it (or in the survey, ENV=survey), sums the
// triangles of every mesh by what it belongs to — the town, the ground and
// the apron, the works, the target's own structures, everything else — and
// prints the town's own breakdown (buildings, trees, roads, the scatter
// past the edge) against BUDGET.
//   node tools/envbudget.mjs [level=westminster]      ENV=survey TIER=low TT_PORT=5177
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', port = process.env.TT_PORT || 5177;
const env = process.env.ENV || 'abstract', tier = process.env.TIER || 'low';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
for (let k = 0; k < 2; k++) {
  await page.goto(`http://localhost:${port}/?level=${level}&env=${env}`, { waitUntil: 'load', timeout: 300000 });
  try { await page.waitForFunction((id) => document.getElementById('loading')?.style.display === 'none' && window.battle && window.__levelId === id, level, { timeout: 400000 }); break; } catch { if (k) throw new Error('level never loaded'); }
}
const r = await page.evaluate(() => {
  const scene = window.engine.scene;
  const tri = (o) => (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  const out = { town: 0, ground: 0, works: 0, target: 0, other: 0 };
  const owner = (o) => { for (let p = o; p; p = p.parent) { if (p.name === 'context') return 'town'; if (p.name === 'fieldworks') return 'works'; if (p.userData?.structure || p.name === 'structure') return 'target'; if (p.name === 'apron' || p.name === 'ground' || p === window.terrain?.group) return 'ground'; } return 'other'; };
  scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.attributes?.position) out[owner(o)] += tri(o); });
  const ctx = scene.getObjectByName('context');
  return { tris: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v)])), detail: ctx?.userData?.detail || null, env: window.__env };
});
const { BUDGET } = await import('../src/world/abstract.js').catch(() => ({ BUDGET: null }));
console.log(`${level} · ${r.env} · ${tier}`);
console.log('  triangles by owner:', JSON.stringify(r.tris));
console.log('  environment (town + ground + works):', (r.tris.town + r.tris.ground + r.tris.works).toLocaleString());
if (r.detail) console.log('  town:', JSON.stringify(r.detail));
if (BUDGET) console.log('  budget:', JSON.stringify(BUDGET));
console.log('errors', JSON.stringify(errors.slice(0, 4)));
await b.close();
