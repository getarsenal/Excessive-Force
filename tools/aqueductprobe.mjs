// Shoot piers out of the aqueduct in Node and say what is left in the air.
//
//   node tools/aqueductprobe.mjs [tier] [pier,pier,...] [seconds]
//
// Every stone of the named lower piers above the ground is destroyed, the
// frame loop is run for the given time, and every stone still alive, still a
// fixed body is reported by section and bay, with every loose stone still
// above six metres (M moving, F frozen, S asleep, D awake and still). A pier
// is its index along the line, 0 in the middle. WHY=1 says what holds each
// stone over the first pier after one solve; RAY=1 says what is under every
// loose stone still up at the channel.
import { LEVELS } from '../src/game/levels.js';
import { initPhysics, PhysicsWorld } from '../src/core/physics.js';
import { Structure } from '../src/structure/structure.js';
import { SEGOVIA } from '../src/structure/landmarks/segovia.js';
import * as THREE from 'three';
import { detectQuality } from '../src/core/quality.js';

const [tierName = 'low', pierArg = '0,1', secs = '6'] = process.argv.slice(2);
const quality = detectQuality(tierName);
await initPhysics();
const physics = new PhysicsWorld(quality);
{
  // The ground: flat at 0, as the pad levelled under the aqueduct is.
  const R = physics.rapier;
  const g = physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -5, 0));
  physics.world.createCollider(R.ColliderDesc.cuboid(800, 5, 800).setFriction(0.9), g);
  physics.groundBody = g;
  physics.groundAt = () => 0;
}
const sp = LEVELS.segovia.structures(quality).find((s) => s.key === 'segovia');
const st = new Structure(physics, sp.blocks, { groundY: 0, origin: new THREE.Vector3(0, 0, 0) });
st.solveStability(true);
const A = SEGOVIA.axis;
const along = (i) => st.px[i] * A.ux + st.pz[i] * A.uz;
const across = (i) => st.px[i] * A.vx + st.pz[i] * A.vz;
const tagOf = (i) => { for (const [k, [a, b]] of Object.entries(st.tagRanges || {})) if (i >= a && i < b) return k; return '?'; };
const piers = pierArg.split(',').map(Number);
let killed = 0;
for (let i = 0; i < st.count; i++) {
  if (tagOf(i) !== 'lowerpiers' || st.py[i] < 0) continue;
  const k = Math.round(along(i) / SEGOVIA.pitch);
  if (!piers.includes(k)) continue;
  if (Math.abs(along(i) - k * SEGOVIA.pitch) > SEGOVIA.pitch * 0.4) continue;
  st.destroyChunk(i); killed++;
}
console.log(`destroyed ${killed} stones of piers ${piers.join(',')}`);
if (process.env.WHY) {
  // One solve, and for every stone over the first named pier: held by bearing
  // or by spanning, and if by bearing, standing on what.
  st.solveStability(true);
  const p0 = piers[0] * SEGOVIA.pitch;
  const rows = {};
  for (let i = 0; i < st.count; i++) {
    if (!(st.flags[i] & 1) || (st.flags[i] & 2)) continue;
    if (Math.abs(along(i) - p0) > SEGOVIA.pierAlong * 0.6 || st.py[i] < SEGOVIA.lowerSpring) continue;
    const how = st._bearing[i] ? 'bearing' : st._reach[i] ? `span ${st._spanBudget[i].toFixed(1)}` : 'none';
    const key = `${tagOf(i)} ${how.split(' ')[0]}`;
    rows[key] = (rows[key] || 0) + 1;
    if (st._bearing[i] && st.py[i] < SEGOVIA.lowerSpring + 4) {
      const under = [];
      for (let a = st.belowStart[i]; a < st.belowStart[i + 1]; a++) {
        const j = st.belowList[a];
        if (st._reach[j]) under.push(`${tagOf(j)}@y${st.py[j].toFixed(1)},s${((along(j) - p0)).toFixed(1)},bear${st._bearing[j]}`);
      }
      console.log(`  ${tagOf(i)} y ${st.py[i].toFixed(1)} s ${(along(i) - p0).toFixed(1)} on ${under.join(' ')}`);
    }
  }
  console.log(rows);
}
const dt = 1 / 60;
const steps = Math.round(Number(secs) / dt);
for (let s = 0; s < steps; s++) {
  st.solveStability(); st.maintainIslands(dt); st.tickLean(dt);
  physics.step(dt);
  physics.recycleSettled(quality.settleFrames);
  physics.auditFrozen();
  st.syncTransforms();
}
// What is still a fixed body, by bay.
const byBay = new Map();
let islands = 0, free = 0; const high = [];
for (let i = 0; i < st.count; i++) {
  if (!(st.flags[i] & 1)) continue;
  if (st.flags[i] & 2) { free++; if (st.py[i] > 6) { const b = st.bodyOf[i]; const v = b ? b.linvel() : { x: 0, y: 0, z: 0 }; high.push(`${st.py[i].toFixed(0)}@${(along(i) / SEGOVIA.pitch - piers[0]).toFixed(2)}b/${across(i).toFixed(1)}${Math.hypot(v.x, v.y, v.z) > 0.3 ? 'M' : b ? (b.bodyType() === 1 ? 'F' : b.isSleeping() ? 'S' : 'D') : 'X'}`); } continue; }
  if (st.flags[i] & 8) { islands++; continue; }
  const tag = tagOf(i);
  if (tag === 'lowerpiers' && st.py[i] < SEGOVIA.lowerSpring) continue;
  const bay = Math.floor(along(i) / SEGOVIA.pitch + 0.5 * 0) ;
  const key = `${tag}:${Math.round(along(i) / SEGOVIA.pitch * 2) / 2}`;
  byBay.set(key, (byBay.get(key) || 0) + 1);
}
console.log(`steps ${physics.stepCount} dead ${physics.dead} ${physics.deadReason || ""} gravity ${JSON.stringify(physics.world.gravity)}`);
console.log(`free stones still above 6 m: ${high.length} ${high.slice(0, 80).join(' ')}`);
console.log(`free ${free}, island stones ${islands}, lean ${st.lean ? `band ${st.lean.band} angle ${st.lean.angle?.toFixed(3)}` : 'none'}`);
const near = [...byBay.entries()].filter(([k]) => {
  const pos = Number(k.split(':')[1]);
  return piers.some((p) => Math.abs(pos - p) <= 1.5);
}).sort((a, b) => Number(a[0].split(':')[1]) - Number(b[0].split(':')[1]) || a[0].localeCompare(b[0]));
for (const [k, n] of near) console.log(`  ${k.padEnd(20)} ${n}`);
// Islands: where are they, and are they moving?
for (const [id, isl] of st.islands) {
  const m = isl.members.filter((j) => st.flags[j] & 1);
  if (!m.length) continue;
  let y = 0, s = 0; for (const j of m) { y += st.py[j]; s += along(j); }
  const body = isl.body;
  const v = body ? body.linvel() : { x: 0, y: 0, z: 0 };
  const t = body ? body.translation() : { x: 0, y: 0, z: 0 };
  console.log(`  island ${id}: ${m.length} stones at along ${(s / m.length / SEGOVIA.pitch).toFixed(2)} bays, y ${(y / m.length).toFixed(1)}, body y ${t.y.toFixed(1)} from ${isl.origin.y.toFixed(1)}, sleeping ${body ? body.isSleeping() : '-'}, vel ${v.y.toFixed(2)}`);
}
if (process.env.RAY) {
  // What is under each stone still hanging over the gap?
  const R = physics.rapier;
  for (let i = 0; i < st.count; i++) {
    if (!(st.flags[i] & 2) || st.py[i] < 50) continue;
    const b = st.bodyOf[i];
    const v = b.linvel();
    if (Math.hypot(v.x, v.y, v.z) > 0.3) continue;
    const ray = new R.Ray({ x: st.px[i], y: st.py[i] - st.hy[i] - 0.02, z: st.pz[i] }, { x: 0, y: -1, z: 0 });
    const hit = physics.world.castRay(ray, 30, true, undefined, undefined, undefined, b);
    let what = 'nothing';
    if (hit) {
      const col = hit.collider;
      const j = st.colliderToChunk.get(col.handle);
      const p = col.parent();
      what = `${hit.timeOfImpact?.toFixed?.(2) ?? hit.toi?.toFixed(2)} m to ${j === undefined ? 'other' : `chunk ${j} ${tagOf(j)} flags ${st.flags[j]} y ${st.py[j].toFixed(1)}`} body ${p ? p.bodyType() : '-'}`;
    }
    // Contacts.
    let contacts = 0;
    physics.world.contactPairsWith(b.collider(0), () => { contacts++; });
    const w = b.angvel(); const own = physics.owners.get(b.handle);
    console.log(`  v ${Math.hypot(v.x, v.y, v.z).toFixed(3)} w ${Math.hypot(w.x, w.y, w.z).toFixed(3)} loose ${!!b.__loose} timer ${own?.settleTimer}`);
    console.log(`  hanging ${i} ${tagOf(i)} y ${st.py[i].toFixed(1)} s ${(along(i) / SEGOVIA.pitch).toFixed(2)} sleeping ${b.isSleeping()} contacts ${contacts}: below ${what}`);
  }
}
