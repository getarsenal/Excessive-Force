// Loose stones without a browser: build the level's structures, run the
// support solver once, and print every stone it frees, by section.
//
//   node tools/loosecheck.mjs <id> [low|medium|high|ultra]
//
// The same question `loose.mjs` asks the running game, answered in a second:
// the solver only needs the block list and a physics world, neither of which
// needs a screen. It cannot see the terrain, so every structure is stood on
// flat ground at y 0 with its own origin — which is what the solver sees in
// the game too, since a pad is levelled under each one.
import { LEVELS } from '../src/game/levels.js';
import { initPhysics, PhysicsWorld } from '../src/core/physics.js';
import { Structure } from '../src/structure/structure.js';
import * as THREE from 'three';

const [id, tierName = 'low'] = process.argv.slice(2);
if (!id || !LEVELS[id]) { console.error('usage: node tools/loosecheck.mjs <id> [tier]'); process.exit(2); }
const SCALE = { low: 1.55, medium: 1.2, high: 1.0, ultra: 0.85 };
const quality = { name: tierName, blockScale: SCALE[tierName] ?? 1.55, groundClutter: tierName !== 'low' };
await initPhysics();
const physics = new PhysicsWorld(quality);
const specs = LEVELS[id].structures(quality);
let bad = 0;
for (const sp of specs) {
  const st = new Structure(physics, sp.blocks, { groundY: 0, origin: new THREE.Vector3(0, 0, 0) });
  st.solveStability(true);
  const loose = [];
  for (let i = 0; i < st.count; i++) {
    if (!(st.flags[i] & 1) || !(st.flags[i] & 10)) continue;
    let tag = '?';
    for (const [k, [a, b]] of Object.entries(st.tagRanges || {})) if (i >= a && i < b) tag = k;
    loose.push({ tag, y: +st.py[i].toFixed(1), r: +Math.hypot(st.px[i], st.pz[i]).toFixed(1), h: [+st.hx[i].toFixed(2), +st.hy[i].toFixed(2), +st.hz[i].toFixed(2)] });
  }
  console.log(`${sp.key}: ${st.count} stones, ${loose.length} loose`);
  for (const b of loose.slice(0, 25)) console.log(`   ${b.tag.padEnd(12)} y ${String(b.y).padStart(6)}  r ${String(b.r).padStart(6)}  ${b.h.join(' x ')}`);
  if (loose.length > 25) console.log(`   … and ${loose.length - 25} more`);
  bad += loose.length;
}
process.exit(bad ? 1 : 0);
