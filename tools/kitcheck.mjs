// A kit spec, dry: build it at a tier and run the support solver on it, the
// way loosecheck does for a level, before any level is wired to it.
//
//   node tools/kitcheck.mjs <atlas-id>... [--tier low] [--solve]
//
// Without --solve it only lays the stones (instant): count, box, posts.
import { SPECS } from '../src/game/atlas_specs.js';
import { buildKit, layoutKit } from '../src/structure/landmarks/kit.js';

const args = process.argv.slice(2);
const tier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : 'low';
const solve = args.includes('--solve');
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--tier');
const SCALE = { low: 1.55, medium: 1.2, high: 1.0, ultra: 0.85 };
const quality = { name: tier, blockScale: SCALE[tier], groundClutter: tier !== 'low' };
let physics = null, Structure = null, THREE = null;
if (solve) {
  const P = await import('../src/core/physics.js');
  Structure = (await import('../src/structure/structure.js')).Structure;
  THREE = await import('three');
  await P.initPhysics();
  physics = new P.PhysicsWorld(quality);
}
let bad = 0;
for (const id of ids.length ? ids : Object.keys(SPECS)) {
  const spec = SPECS[id];
  if (!spec) { console.log(`${id}: no spec`); bad++; continue; }
  const t0 = Date.now();
  const B = buildKit(spec, quality);
  const L = layoutKit(spec);
  const kinds = {};
  for (const q of L.posts) kinds[q.kind] = (kinds[q.kind] || 0) + 1;
  let line = `${id.padEnd(16)} ${String(B.length).padStart(6)} stones  ${(L.box.x1 - L.box.x0).toFixed(0)}x${(L.box.z1 - L.box.z0).toFixed(0)}x${L.top.y.toFixed(0)} m  posts ${JSON.stringify(kinds)}  ${Date.now() - t0} ms`;
  if (solve) {
    const before = Object.fromEntries(Object.entries(B.tagRanges).map(([k, [a, b]]) => [k, b - a]));
    const st = new Structure(physics, B, { groundY: 0, origin: new THREE.Vector3(0, 0, 0) });
    const lost = {};
    for (const [k, n] of Object.entries(before)) {
      const r = st.tagRanges?.[k];
      const now = r ? r[1] - r[0] : 0;
      if (now < n) lost[k] = n - now;
    }
    st.solveStability(true);
    let loose = 0, crushed = 0;
    const where = {};
    for (let i = 0; i < st.count; i++) {
      if (!(st.flags[i] & 1)) continue;
      if (st.health[i] <= 0) crushed++;
      if (st.flags[i] & 10) {
        loose++;
        for (const [k, [a, b]] of Object.entries(st.tagRanges || {})) if (i >= a && i < b) where[k] = (where[k] || 0) + 1;
      }
    }
    const culled = st.culledStones || 0;
    line += `  loose ${loose} crushed ${crushed} culled ${culled} grouted ${st.groutedEdges || 0} ${loose ? JSON.stringify(where) : ''}${culled ? ' culled from ' + JSON.stringify(lost) : ''}`;
    bad += loose + crushed + culled;
    st.dispose?.();
  }
  console.log(line);
}
process.exit(bad ? 1 : 0);
