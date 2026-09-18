import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lineOfSight } from '../structure/occupancy.js';
import { solveBallistic } from './projectiles.js';
import { TOWER, WING } from '../structure/landmarks/bigben.js';
import { EIFFEL, legAt as eiffelLegAt } from '../structure/landmarks/eiffel.js';
import { CASTILLO, WARRIORS } from '../structure/landmarks/chichen.js';
import { TAJ } from '../structure/landmarks/tajmahal.js';
import { KHUFU } from '../structure/landmarks/giza.js';
import { PISA, DUOMO, axisAt as pisaAxisAt } from '../structure/landmarks/pisa.js';

/**
 * The garrison.
 *
 * Two rules give this its shape:
 *
 * 1. **Every defender is pinned to a specific stone.** When that stone is
 *    destroyed or knocked loose, the defender goes with it — so suppressing a
 *    face of the tower is not a mechanic bolted onto the destruction, it *is*
 *    the destruction. Shelling the belfry to drop the spire kills the AT team
 *    firing from it.
 *
 * 2. **Nobody shoots through a building.** Fire is checked against the
 *    solidity grid in `occupancy.js`, so a man at a north window genuinely
 *    cannot engage a gun parked to the south. Which face you approach from is
 *    therefore a real decision, and working around the building is a real
 *    tactic rather than a cosmetic one.
 *
 * Positions come from the same constants the landmark builders use to cut
 * their window openings, so a rifleman stands *in* an embrasure rather than
 * inside a wall or floating outside one. Mortar crews sit on roofs, where they
 * can lob rounds over the building at guns they cannot see — the one thing in
 * the garrison that ignores line of sight, because that is what indirect fire
 * is for.
 */

export const DEFENDER_TYPES = {
  rifleman: {
    key: 'rifleman', look: 'rifleman',
    name: 'Rifleman', health: 42, damage: 3.4, rof: 1.15, range: 230,
    accuracy: 0.5, colour: 0x6b5a3e, threat: 1, eye: 1.25,
  },
  mg: {
    key: 'mg', look: 'mg',
    name: 'MG Nest', health: 78, damage: 2.4, rof: 0.11, burst: 7, burstGap: 2.6,
    range: 330, accuracy: 0.38, colour: 0x54452f, threat: 3, eye: 0.95,
  },
  sniper: {
    key: 'sniper', look: 'sniper',
    name: 'Sniper', health: 34, damage: 17, rof: 4.2, range: 430,
    accuracy: 0.72, colour: 0x3e4634, threat: 4, eye: 1.1,
  },
  at: {
    key: 'at', look: 'at',
    name: 'AT Team', health: 90, damage: 88, rof: 8.0, range: 340,
    accuracy: 0.62, colour: 0x4a3c2c, threat: 8, eye: 1.3,
  },
  /**
   * A field gun, dug in behind the line.
   *
   * The garrison's only piece that shoots back at the guns on their own terms:
   * a direct-fire weapon with the range to reach a battery that has stood off
   * and the weight to wreck one when it hits. Slow, and it cannot traverse out
   * of its pit — everything else in the list can be anywhere, and this is the
   * one the player can outflank.
   */
  fieldgun: {
    key: 'fieldgun', look: 'fieldgun',
    name: 'Field Gun', health: 155, damage: 135, rof: 9.5, range: 470,
    accuracy: 0.6, colour: 0x4a5238, threat: 10, eye: 1.05, emplaced: true,
  },
  /**
   * Light flak, in a pit.
   *
   * Fires in long bursts at anything on the ground, and is the one thing on the
   * map that can do something about an air strike — see `aircraft.js`, which
   * asks the garrison what is still shooting before it lets a bomb go. Until
   * this existed the strike aircraft flew through a defended objective as
   * though it were empty airspace, which made the two most expensive cards in
   * the arsenal the two safest.
   */
  aa: {
    key: 'aa', look: 'aa',
    name: 'AA Gun', health: 120, damage: 6.2, rof: 0.15, burst: 12, burstGap: 3.6,
    range: 470, accuracy: 0.4, colour: 0x515a3c, threat: 7, eye: 1.15,
    emplaced: true, flak: true,
  },
  /**
   * A forward observer.
   *
   * Carries nothing and kills nobody, and while he is alive every mortar on the
   * map fires faster and straighter. He is the reason a player who has cleared
   * the roofs and the galleries still has a reason to look at the ground behind
   * the line — and, unlike everything else here, killing him is worth doing
   * even though it puts nothing on the scoreboard.
   */
  spotter: {
    key: 'spotter', look: 'spotter',
    name: 'Observer', health: 40, damage: 0, rof: 6, range: 700,
    accuracy: 1, colour: 0x6f7a52, threat: 2, eye: 1.35,
    emplaced: true, observer: true,
  },
  mortar: {
    key: 'mortar', look: 'mortar',
    name: 'Mortar', health: 60, damage: 0, rof: 7.5, range: 620,
    accuracy: 1, colour: 0x3a4a36, threat: 6, eye: 1.0,
    indirect: true,
    // 81 mm bomb: slow, high, and it does not care what is in the way.
    shell: {
      speed: 150, gravity: 9.81, trail: 0.5, minRange: 45,
      warhead: { lethal: 0.8, radius: 7.0, power: 2400, fx: 0.9 },
    },
  },
};

/**
 * How far off its facing a defender will engage.
 *
 * Line of sight now does the physical work, but an arc is still right: a man at
 * a window cannot swing his rifle through 180°, and without it every defender
 * with a clear line engages whatever is closest, which deletes an infantry team
 * in about a second.
 */
const FIRING_ARC = Math.cos(THREE.MathUtils.degToRad(72));

/**
 * How much of the near end of a shot to ignore.
 *
 * The solidity grid is 2 m coarse and a window is 1.7 m wide, so the cell a man
 * at an embrasure stands in also holds the masonry beside the opening and reads
 * as solid; the same is true of a sniper inside a 3 m minaret. Without an
 * allowance sized to the position, every defender inside a building would be
 * blocked by the building he is shooting out of and the garrison would go
 * quiet. Positions in the open get almost none, so a wall standing in front of
 * a sandbagged pit still stops the shot.
 */
function skipFor(d) {
  if (d.cover === 'window' || d.cover === 'arcade') return 3.6;
  if (d.cover === 'roof') return 2.6;
  return 1.6;
}

/**
 * The stand-in soldier, used until the real model arrives.
 *
 * A hundred defenders have to be one draw call, which rules out a hundred
 * scene-graph copies of a GLB — so the model is flattened into a single
 * geometry and fed to an InstancedMesh. That flattening is asynchronous, and
 * the garrison is posted during the loading screen, so this is what stands in
 * the windows for the second or two before the real thing lands.
 */
function soldierGeometry() {
  const parts = [];
  const push = (geo, x, y, z) => { geo.translate(x, y, z); parts.push(geo); };
  push(new THREE.BoxGeometry(0.46, 0.68, 0.28), 0, 1.08, 0);
  push(new THREE.BoxGeometry(0.16, 0.72, 0.18), -0.12, 0.36, 0);
  push(new THREE.BoxGeometry(0.16, 0.72, 0.18), 0.12, 0.36, 0);
  push(new THREE.BoxGeometry(0.26, 0.26, 0.26), 0, 1.55, 0);
  push(new THREE.BoxGeometry(0.1, 0.1, 0.86), 0.16, 1.22, 0.3);
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

/**
 * Flatten a GLB into one instanceable geometry.
 *
 * Bakes every mesh's world transform into its vertices, drops attributes the
 * merge cannot reconcile, normalises the result to a real soldier's height and
 * stands it on the ground plane. Skinned meshes come through in their bind
 * pose, which is exactly what is wanted: these are figures at a window seen
 * from two hundred metres, not animated characters.
 */
export async function loadSoldierGeometry(loader, file, targetHeight = 1.8) {
  const gltf = await loader.loadAsync(`assets/${file}.glb`);
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const parts = [];
  let material = null;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    // Merging refuses geometries whose attribute sets differ, and a character
    // GLB is full of skinning and tangent data no instanced mesh will use.
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') {
        g.deleteAttribute(name);
      }
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    parts.push(g);
    if (!material) material = Array.isArray(o.material) ? o.material[0] : o.material;
  });
  if (!parts.length) return null;

  const merged = parts.length === 1
    ? parts[0]
    : BufferGeometryUtils.mergeGeometries(parts, false);
  if (!merged) return null;

  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  const height = Math.max(0.01, bb.max.y - bb.min.y);
  const k = targetHeight / height;
  merged.translate(
    -(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2,
  );
  merged.scale(k, k, k);

  const simplified = simplifyByClustering(merged, 26);
  if (simplified && simplified !== merged) merged.dispose();
  return { geometry: simplified || merged, material };
}

/**
 * Vertex-cluster decimation.
 *
 * The source soldier is a hundred thousand vertices — a perfectly reasonable
 * number for one hero character and a catastrophic one for a hundred of them in
 * an instanced mesh, which would be three and a half million triangles a frame
 * before anything else is drawn.
 *
 * So: overlay a grid on the model, collapse every vertex in a cell onto that
 * cell's average, and drop the triangles that degenerate as a result. It is the
 * bluntest simplification there is and it does not preserve silhouettes the way
 * a proper edge-collapse would — but these are figures standing in windows two
 * hundred metres away, and at that size the difference is invisible while the
 * saving is thirty-fold.
 */
export function simplifyByClustering(geo, cells = 26) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.attributes.position;
  const n = pos.count;
  if (n < 3000) return geo;

  src.computeBoundingBox();
  const bb = src.boundingBox;
  const sx = Math.max(1e-6, bb.max.x - bb.min.x) / cells;
  const sy = Math.max(1e-6, bb.max.y - bb.min.y) / cells;
  const sz = Math.max(1e-6, bb.max.z - bb.min.z) / cells;

  const key = new Int32Array(n);
  const sums = new Map();     // cell -> [x, y, z, count, outIndex]
  for (let i = 0; i < n; i++) {
    const cx = Math.floor((pos.getX(i) - bb.min.x) / sx);
    const cy = Math.floor((pos.getY(i) - bb.min.y) / sy);
    const cz = Math.floor((pos.getZ(i) - bb.min.z) / sz);
    const k = (cy * (cells + 2) + cz) * (cells + 2) + cx;
    key[i] = k;
    let e = sums.get(k);
    if (!e) sums.set(k, (e = [0, 0, 0, 0, -1]));
    e[0] += pos.getX(i); e[1] += pos.getY(i); e[2] += pos.getZ(i); e[3]++;
  }

  const outPos = [];
  for (const e of sums.values()) {
    e[4] = outPos.length / 3;
    outPos.push(e[0] / e[3], e[1] / e[3], e[2] / e[3]);
  }

  const outIdx = [];
  for (let t = 0; t < n; t += 3) {
    const a = sums.get(key[t])[4];
    const b = sums.get(key[t + 1])[4];
    const c = sums.get(key[t + 2])[4];
    if (a === b || b === c || a === c) continue;   // collapsed to a sliver
    outIdx.push(a, b, c);
  }
  if (!outIdx.length) return geo;

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(outPos), 3));
  out.setIndex(outPos.length / 3 > 65535
    ? new THREE.BufferAttribute(new Uint32Array(outIdx), 1)
    : new THREE.BufferAttribute(new Uint16Array(outIdx), 1));
  out.computeVertexNormals();
  if (src !== geo) src.dispose();
  return out;
}

/** A tube on a bipod, for the roof crews. */
function mortarGeometry() {
  const parts = [];
  const tube = new THREE.CylinderGeometry(0.1, 0.13, 1.5, 8);
  tube.rotateX(-0.42);
  tube.translate(0, 0.85, 0.12);
  parts.push(tube);
  const base = new THREE.CylinderGeometry(0.42, 0.48, 0.12, 10);
  base.translate(0, 0.06, 0);
  parts.push(base);
  for (const sx of [-1, 1]) {
    const leg = new THREE.BoxGeometry(0.07, 1.15, 0.07);
    leg.rotateZ(sx * 0.3);
    leg.rotateX(0.32);
    leg.translate(sx * 0.26, 0.58, -0.3);
    parts.push(leg);
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

/**
 * A field gun on its trail, and light flak on its pedestal.
 *
 * Both are drawn muzzle along +Z so they can share the instance matrix with
 * everything else in the garrison, which is placed by a yaw about Y. The pit
 * they sit in is world geometry — `world/works.js` builds the spoil — and this
 * is only the piece inside it.
 */
function fieldGunGeometry() {
  const parts = [];
  const barrel = new THREE.CylinderGeometry(0.11, 0.14, 4.4, 8);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 1.15, 1.7);
  parts.push(barrel);
  const brake = new THREE.CylinderGeometry(0.2, 0.2, 0.42, 8);
  brake.rotateX(Math.PI / 2);
  brake.translate(0, 1.15, 3.8);
  parts.push(brake);
  const shield = new THREE.BoxGeometry(2.3, 1.1, 0.12);
  shield.translate(0, 0.9, 0.3);
  parts.push(shield);
  const breech = new THREE.BoxGeometry(0.55, 0.55, 1.0);
  breech.translate(0, 1.1, -0.35);
  parts.push(breech);
  for (const sx of [-1, 1]) {
    const wheel = new THREE.CylinderGeometry(0.52, 0.52, 0.2, 12);
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(sx * 1.05, 0.52, 0.1);
    parts.push(wheel);
    const trail = new THREE.BoxGeometry(0.16, 0.16, 2.6);
    trail.rotateY(sx * 0.16);
    trail.translate(sx * 0.5, 0.3, -1.5);
    parts.push(trail);
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

/** Light flak: a short barrel cocked up off a pedestal mount. */
function flakGeometry() {
  const parts = [];
  const base = new THREE.CylinderGeometry(0.62, 0.8, 0.5, 10);
  base.translate(0, 0.25, 0);
  parts.push(base);
  const ring = new THREE.BoxGeometry(1.5, 0.42, 1.5);
  ring.translate(0, 0.7, 0);
  parts.push(ring);
  for (const sx of [-0.18, 0.18]) {
    const tube = new THREE.CylinderGeometry(0.075, 0.09, 2.7, 7);
    tube.rotateX(-0.95);
    tube.translate(sx, 1.85, 0.62);
    parts.push(tube);
  }
  const box2 = new THREE.BoxGeometry(0.75, 0.5, 0.6);
  box2.translate(0, 1.15, -0.32);
  parts.push(box2);
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

/** A low horseshoe of sandbags, so ground positions read as prepared. */
function sandbagGeometry() {
  const parts = [];
  for (let ring = 0; ring < 2; ring++) {
    const r = 1.5 - ring * 0.12;
    const y = 0.22 + ring * 0.36;
    const n = 11;
    for (let i = 0; i < n; i++) {
      // Open at the back, so the position has a mouth to shoot out of.
      const a = -Math.PI * 0.72 + (i / (n - 1)) * Math.PI * 1.44 + (ring ? 0.14 : 0);
      const bag = new THREE.BoxGeometry(0.52, 0.3, 0.34);
      bag.rotateY(-a);
      bag.translate(Math.sin(a) * r, y, Math.cos(a) * r);
      parts.push(bag);
    }
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

export class Garrison {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../structure/structure.js').Structure[]} structures
   */
  constructor(scene, structures, quality) {
    this.scene = scene;
    this.structures = structures;
    this.quality = quality;
    this.defenders = [];
    this.time = 0;
    this.losEnabled = true;
    this.fireEnabled = true;
    this.damageScale = 1;
    this.losChecks = 0;
    this.losBlocked = 0;
    this.mortarsFired = 0;

    const shadows = quality.shadowMapSize > 0;
    const mk = (geo, colour, max) => {
      const m = new THREE.InstancedMesh(
        geo,
        new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9, metalness: 0.03 }),
        max,
      );
      m.castShadow = shadows;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      scene.add(m);
      return m;
    };

    // How many men the map can hold.
    //
    // A flat 256 was fine while the garrison was the men inside the building.
    // A belt of trenches round every structure and through the streets asks for
    // more than that before it reaches the second landmark, and the cap binding
    // in the middle of the first trench line is worse than a smaller belt: the
    // gun pits and the observers are posted after it and simply never appeared.
    // The figures are instanced and the cost is the line-of-sight pass, which
    // is what the tiers are for.
    this.cap = { low: 200, medium: 288, high: 360, ultra: 420 }[quality.name] ?? 288;
    this.mesh = mk(soldierGeometry(), 0xffffff, this.cap);
    this.mortarMesh = mk(mortarGeometry(), 0xffffff, 48);
    this.bagMesh = mk(sandbagGeometry(), 0xffffff, 96);
    this.gunMesh = mk(fieldGunGeometry(), 0xffffff, 40);
    this.flakMesh = mk(flakGeometry(), 0xffffff, 24);
    this._mk = mk;

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._axis = new THREE.Vector3(0, 1, 0);
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._col = new THREE.Color();
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
  }

  /**
   * Swap the box stand-in for the real figure once its model has loaded.
   *
   * The instance buffers carry over untouched — they are matrices and colours,
   * and neither cares what geometry they are drawn with — so the garrison
   * changes appearance between one frame and the next with nothing else
   * disturbed. Keeping the per-type colour tint means the real model still
   * reads as riflemen, MG crews, snipers and AT teams rather than as a hundred
   * identical soldiers.
   */
  useSoldierModel(geometry, material) {
    if (!geometry) return false;
    const old = this.mesh;
    const mat = material
      ? material.clone()
      : new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.03 });
    mat.vertexColors = false;
    // The instance colour is the type tint; a base map would fight it.
    if (mat.color) mat.color.set(0xffffff);

    const mesh = new THREE.InstancedMesh(geometry, mat, this.cap);
    mesh.castShadow = this.quality.shadowMapSize > 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix = old.instanceMatrix;
    mesh.instanceColor = old.instanceColor;
    mesh.count = old.count;
    mesh.visible = old.visible;
    this.scene.remove(old);
    old.geometry.dispose();
    this.scene.add(mesh);
    this.mesh = mesh;
    return true;
  }

  /**
   * Pin a defender to the nearest surviving stone to `pos`, within `maxDist`.
   * Returns false when there is nothing there to stand on — which is how a
   * position that would have floated in mid-air quietly declines to exist.
   */
  place(type, pos, facing = 0, maxDist = 6, opts = {}) {
    if (this.defenders.length >= this.cap) return false;
    const def = DEFENDER_TYPES[type];
    if (!def) return false;

    // A crew in a pit stands on the ground, not on the building.
    //
    // Every other position in the game is written as a height above a floor and
    // pinned to the nearest stone, which is what makes a man ride the masonry
    // down when it goes. A gun in the Champ de Mars has no masonry anywhere
    // near it, and pinning it to the nearest stone eighty metres away would
    // mean the whole belt died the moment the tower did. Emplaced positions
    // carry no anchor at all and are killed only by fire.
    const emplaced = !!(opts.emplaced || def.emplaced);
    const anchor = emplaced ? null : this._nearestStone(pos, maxDist);
    if (!anchor && !emplaced) return false;
    const bestStruct = anchor ? anchor.structure : null;
    const bestChunk = anchor ? anchor.chunk : -1;

    // Stand on the floor, whatever height the course grid put it at.
    //
    // Positions are written as a height above a roof or a sill, and the
    // roof's actual top moves with the quality tier: two courses of marble
    // are a metre and a half on one device and two and a half on another. A
    // man posted a fixed two metres up was standing inside the roof slab on a
    // phone, with his eyes below the parapet, and floating on a desktop. If
    // the stone he is anchored to is under him, he stands on it.
    const snapped = pos.clone();
    if (bestStruct) {
      const s = bestStruct, i = bestChunk;
      const top = s.py[i] + s.hy[i];
      // Inside the stone counts too: a roof slab two courses thick swallows
      // a man posted a fixed height above where its underside used to be.
      // Only onto something floor-sized, and never far upward: a mullion is
      // a stone whose footprint contains the man in the window beside it,
      // and snapping him onto its top put six of them inside the lintel.
      // Upward only: a man already standing clear of his floor is where he
      // was put, and pulling him down onto it stood the Eiffel's gunners
      // behind their own balustrade.
      const floorish = Math.min(s.hx[i], s.hz[i]) * 2 >= 1.6;
      if (floorish && Math.abs(s.px[i] - pos.x) <= s.hx[i] + 0.35 && Math.abs(s.pz[i] - pos.z) <= s.hz[i] + 0.35
        && pos.y > s.py[i] - s.hy[i] - 0.3 && pos.y < top) snapped.y = top;
    }

    const d = {
      type, def,
      pos: snapped,
      facing,
      cover: opts.cover || null,     // 'window' | 'roof' | 'ground' | 'arcade' | 'trench'
      sandbags: !!opts.sandbags,
      emplaced,
      structure: bestStruct,
      chunk: bestChunk,
      health: def.health,
      alive: true,
      cooldown: Math.random() * def.rof,
      burstLeft: 0,
      target: null,
      blocked: false,
      muzzle: snapped.clone().add(new THREE.Vector3(0, def.eye ?? 1.25, 0)),
      suppressed: 0,
    };

    this._settleIntoPosition(d);
    // Re-anchor to where he actually ended up.
    //
    // The stone he is pinned to decides whether he lives, so it needs to be
    // the stone he is standing on. It was chosen before `_settleIntoPosition`,
    // which then walks him up to five metres looking for a field of fire — and
    // as the building settles on the first few frames the original stone can
    // move further still. The two drift apart, and a man whose recorded anchor
    // is ten metres away is a man who survives the destruction of the masonry
    // under his feet and keeps firing from thin air.
    if (!emplaced) {
      const re = this._nearestStone(d.pos, Math.max(maxDist, 9));
      if (re) { d.structure = re.structure; d.chunk = re.chunk; }
    }
    this.defenders.push(d);
    return true;
  }

  /**
   * The nearest living stone to a point, preferring one underfoot.
   *
   * Weighted so a stone below counts as closer than one at the same distance
   * to the side: what holds a man up is the floor, not the wall beside him.
   */
  _nearestStone(pos, maxDist) {
    let bestStruct = null, bestChunk = -1, bestD = maxDist * maxDist;
    for (const s of this.structures) {
      for (let i = 0; i < s.count; i++) {
        if (!(s.flags[i] & 1)) continue;
        const dx = s.px[i] - pos.x, dy = s.py[i] - pos.y, dz = s.pz[i] - pos.z;
        let d = dx * dx + dy * dy + dz * dz;
        if (dy < 0 && dy > -2.6) d *= 0.45;        // underfoot beats alongside
        if (d < bestD) { bestD = d; bestStruct = s; bestChunk = i; }
      }
    }
    return bestChunk < 0 ? null : { structure: bestStruct, chunk: bestChunk };
  }

  /**
   * Shuffle a defender until he can actually shoot out of where he is standing.
   *
   * Positions are written from the same constants the landmark builders use, so
   * they land in the right place — but "the right place" and "a place with a
   * field of fire" are not quite the same thing when the opening is 1.7 m wide
   * and the solidity grid is 2 m coarse. A sniper placed at the centre of a
   * minaret shaft, or a rifleman half a metre too deep in an iwan, is a
   * defender who never fires, and in play that is indistinguishable from one
   * with no targets — it is silent, invisible and wrong.
   *
   * So each position is checked and, if it is blind, nudged outward along its
   * own facing and then upward, taking the first spot that can see out. A
   * position that cannot be rescued keeps its original place and is flagged, so
   * the test menu can report it rather than it passing unnoticed.
   */
  _settleIntoPosition(d) {
    if (d.def.indirect) return;
    // An emplaced gun is in a pit that was dug where it is. Nudging it out and
    // upward looking for a field of fire would walk it out of its own works,
    // and in the open it has one anyway.
    if (d.emplaced) { d.blind = false; return; }
    if (this.hasFieldOfFire(d)) { d.blind = false; return; }

    const fx = Math.sin(d.facing), fz = Math.cos(d.facing);
    const home = d.pos.clone();
    for (const up of [0, 1.2, 2.4]) {
      for (const out of [1.2, 2.4, 3.6, 5.0]) {
        d.pos.set(home.x + fx * out, home.y + up, home.z + fz * out);
        d.muzzle.copy(d.pos).y += d.def.eye ?? 1.25;
        if (this.hasFieldOfFire(d)) { d.blind = false; return; }
      }
    }
    d.pos.copy(home);
    d.muzzle.copy(home).y += d.def.eye ?? 1.25;
    d.blind = true;
  }

  // ───────────────────────────────────────────────────────── placement ──

  /**
   * Westminster. Ground positions behind sandbags, riflemen and MGs in the
   * shaft's window embrasures, snipers on the clock stage corners, AT teams in
   * the belfry arcade, and a mortar section on the palace roof.
   */
  populateElizabethTower(origin, groundY, counts = {}) {
    // Every figure comes from `TOWER`, which is the builder's own. These used
    // to be copied out by hand, and scaling the tower then moved the masonry
    // and left the garrison standing in mid-air where the old walls had been.
    const W = TOWER.width;
    const faces = [
      { nx: 0, nz: 1, yaw: 0 },
      { nx: 0, nz: -1, yaw: Math.PI },
      { nx: 1, nz: 0, yaw: Math.PI / 2 },
      { nx: -1, nz: 0, yaw: -Math.PI / 2 },
    ];

    // Sandbagged positions at the foot of the tower — on the ground, ringing
    // the plinth. They used to be put half way up it, which is neither on the
    // plinth (that is where the shaft's own wall stands) nor on the ground, so
    // the first sweep for men standing on nothing culled every one of them.
    const ground = counts.ground ?? 20;
    for (let i = 0; i < ground; i++) {
      const a = (i / ground) * Math.PI * 2;
      const r = W * 0.80;
      const p = new THREE.Vector3(
        origin.x + Math.cos(a) * r, groundY + 0.9, origin.z + Math.sin(a) * r,
      );
      this.place(i % 3 === 0 ? 'mg' : 'rifleman', p, Math.atan2(Math.cos(a), Math.sin(a)), 8,
        { cover: 'ground', sandbags: true });
    }

    // In the window bays. The embrasure's sill is the floor they stand on, and
    // they sit *inside* the wall plane so the reveal covers them from the side.
    const { heights, halfHeight } = TOWER.windows;
    for (let li = 0; li < heights.length; li++) {
      const wy = heights[li];
      const inset = TOWER.widthAt(wy) / 2 - TOWER.wallAt(wy) * 0.35;
      const band = li / Math.max(1, heights.length - 1);
      for (const f of faces) {
        // Two to an embrasure. The openings are 3.4 m across at this scale,
        // which is a fire position for a section rather than for one man.
        for (const along of [-1, 1]) {
          const p = new THREE.Vector3(
            origin.x + f.nx * inset + along * f.nz * 0.85,
            groundY + wy - halfHeight + 0.56,
            origin.z + f.nz * inset + along * f.nx * 0.85,
          );
          const t2 = band >= 0.66 ? 'sniper' : band >= 0.33 ? 'mg' : 'rifleman';
          this.place(t2, p, f.yaw, 4.0 * TOWER.scale, { cover: 'window' });
        }
      }
    }

    // Clock stage — long sightlines over the whole of Westminster. Eight men
    // spaced round the stage rather than two flung out past each corner: the
    // surround is 26 m across and anything beyond that is standing in the air.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const r = W / 2 - 0.6;
      const p = new THREE.Vector3(
        origin.x + Math.cos(a) * r, groundY + TOWER.clockY + 8.0,
        origin.z + Math.sin(a) * r,
      );
      this.place('sniper', p, Math.atan2(Math.cos(a), Math.sin(a)), 6, { cover: 'roof' });
    }

    // Belfry arcade: AT teams with the best field of fire in the level. Drop
    // the belfry and the whole upper garrison goes with it. Two per face.
    for (const f of faces) {
      for (const along of [-1, 1]) {
        const p = new THREE.Vector3(
          origin.x + f.nx * (W * 0.49) + along * f.nz * 3.6,
          groundY + TOWER.belfryTop - 8.0,
          origin.z + f.nz * (W * 0.49) + along * f.nx * 3.6,
        );
        this.place('at', p, f.yaw, 7, { cover: 'arcade' });
      }
    }

    // Mortars on the belfry roof slab, which can range the entire map.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.place('mortar',
          new THREE.Vector3(origin.x + sx * 5.6, groundY + TOWER.belfryTop + 3.4,
            origin.z + sz * 5.6),
          0, 6, { cover: 'roof' });
      }
    }
  }

  populatePalaceWing(origin, groundY) {
    const { z0, len, depth } = WING;
    const { heights, first, spacing, halfHeight, roof } = WING.windows;

    // One man per window bay on both elevations, weighted so the upper floors
    // hold the longer-ranged weapons.
    for (let li = 0; li < heights.length; li++) {
      const wy = heights[li];
      for (let bz = z0 + first; bz < z0 + len - 6; bz += spacing) {
        for (const sx of [1, -1]) {
          const p = new THREE.Vector3(
            origin.x + sx * (depth / 2 - 2.3),
            groundY + wy - halfHeight + 0.6,
            origin.z + bz,
          );
          const t = li === 2 ? 'sniper' : li === 1 ? 'mg' : 'rifleman';
          this.place(t, p, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 3.4 * WING.scale,
            { cover: 'window' });
        }
      }
    }

    // Roof: AT teams behind the parapet, and mortar pits amidships.
    for (let i = 0; i < 6; i++) {
      const z = origin.z + z0 + 32 + i * 20;
      this.place('at', new THREE.Vector3(origin.x, groundY + roof + 14.4, z), 0, 8,
        { cover: 'roof' });
    }
    for (const off of [20, 60, 88, 124]) {
      this.place('mortar',
        new THREE.Vector3(origin.x + 13.0, groundY + roof + 2.8, origin.z + z0 + off),
        0, 7, { cover: 'roof' });
    }
  }

  /**
   * The Eiffel Tower.
   *
   * There is no masonry to stand in, so the garrison is where the tower
   * actually has floors: the three galleries, the ironwork of the legs, and
   * gun pits in the Champ de Mars at the foot of each pier. The legs are the
   * point — every man above the second floor is riding on four of them, and
   * cutting one out drops the lot.
   */
  populateEiffelTower(origin, groundY, counts = {}) {
    // `spread` is how far along each side of the deck a man may stand, as a
    // fraction of the half-width. It is not decoration either: the four legs
    // pass through the corners of every gallery, and since they were laced
    // course by course they are closed boxes rather than open bracing. A ring
    // that runs into the corners posts a fifth of the garrison inside the
    // ironwork, looking at the inside of a girder.
    const deckRing = (y, half, n, type, cover, inset = 1.6, spread = 1) => {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 4;
        const side = Math.floor(t);
        const f = ((t - side) * 2 - 1) * spread;   // -1..1 along this side
        const r = half - inset;
        const p = new THREE.Vector3(origin.x, groundY + y + 0.6, origin.z);
        if (side === 0) { p.x += f * r; p.z += r; }
        else if (side === 1) { p.x += r; p.z -= f * r; }
        else if (side === 2) { p.x -= f * r; p.z -= r; }
        else { p.x -= r; p.z += f * r; }
        const yaw = Math.atan2(p.x - origin.x, p.z - origin.z);
        this.place(type, p, yaw, 6, { cover });
      }
    };

    // Gun pits between the piers, on the gravel of the Champ de Mars.
    //
    // On four straight runs rather than a ring. The piers stand on the corners
    // of a 125 m square and their feet are 25 m thick, so a circle drawn
    // through them puts a man inside the ironwork at every diagonal — eight of
    // twenty, each with a girder a metre from his face.
    const ground = counts.ground ?? 20;
    const perSide = Math.max(1, Math.round(ground / 4));
    const OUT = EIFFEL.baseHalf + 4;     // just beyond the piers' outer face
    const SPAN = 32;                     // and well inside their inner face
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      for (let i = 0; i < perSide; i++) {
        const f = perSide === 1 ? 0 : (i / (perSide - 1)) * 2 - 1;
        const p = new THREE.Vector3(
          origin.x + nx * OUT + (nx ? 0 : f * SPAN),
          groundY + 0.9,
          origin.z + nz * OUT + (nz ? 0 : f * SPAN),
        );
        this.place(i % 3 === 0 ? 'mg' : 'rifleman', p, Math.atan2(nx, nz), 10,
          { cover: 'ground', sandbags: true });
      }
    }

    // In the ironwork of each leg, on the bracing. On the outer face, which is
    // the one that can see the guns: the middle of a pier is a hollow caisson
    // and a man posted there is looking at the inside of his own leg.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      for (const y of [18, 36]) {
        const g = eiffelLegAt(y);
        const r = g.r + g.h * 0.72;
        const p = new THREE.Vector3(origin.x + sx * r, groundY + y + 0.8, origin.z + sz * r);
        this.place(y > 26 ? 'mg' : 'rifleman', p, Math.atan2(sx, sz), 7,
          { cover: 'arcade' });
      }
    }

    // First gallery: the widest deck and the best arcs over the city. The legs
    // pass through its corners, so the ring stops short of them.
    deckRing(EIFFEL.firstFloor, EIFFEL.firstDeckHalf, 20, 'mg', 'roof', 2.2, 0.68);
    // Second gallery. The legs have finished merging by here — above 116 m
    // there is one shaft and no corner girders in the way — so the ring runs
    // most of the way along each side instead of huddling at the middle.
    deckRing(EIFFEL.secondFloor, EIFFEL.secondDeckHalf, 12, 'sniper', 'roof', 1.8, 0.78);
    // AT teams on the galleries, at the middle of each side rather than at the
    // corners: a corner of this building is a girder, not a parapet.
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this.place('at', new THREE.Vector3(
        origin.x + nx * (EIFFEL.firstDeckHalf - 3.0) + nz * 10,
        groundY + EIFFEL.firstFloor + 0.6,
        origin.z + nz * (EIFFEL.firstDeckHalf - 3.0) + nx * 10), Math.atan2(nx, nz), 7,
      { cover: 'roof' });
      this.place('at', new THREE.Vector3(
        origin.x + nx * (EIFFEL.secondDeckHalf - 2.4) + nz * 5,
        groundY + EIFFEL.secondFloor + 0.6,
        origin.z + nz * (EIFFEL.secondDeckHalf - 2.4) + nx * 5), Math.atan2(nx, nz), 7,
      { cover: 'roof' });
    }
    // The summit: snipers at 276 m, which is every metre of the map.
    deckRing(EIFFEL.thirdFloor, EIFFEL.thirdDeckHalf, 6, 'sniper', 'roof', 1.2);
    // Mortars on the first gallery, lobbing over the whole Champ de Mars.
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this.place('mortar', new THREE.Vector3(
        origin.x + sx * (EIFFEL.firstDeckHalf - 8), groundY + EIFFEL.firstFloor + 0.6,
        origin.z + sz * (EIFFEL.firstDeckHalf - 8)), 0, 7, { cover: 'roof' });
    }
  }

  /**
   * Man the field works.
   *
   * The plan comes from the world layer, which laid the belt round the
   * landmarks' footprints and through the city's plots — so this does not know
   * or care which level it is on, and a new map gets its garrison dug in
   * without a line written for it.
   *
   * Filled from the objective outward, and stopped at whatever is left of the
   * cap once the buildings have had their men. The belt is the last thing
   * posted for exactly that reason: a hundred riflemen in a field are worth
   * less than the crews on the galleries, and if something has to go without,
   * it should be the far end of the line rather than the top of the tower.
   */
  populateFieldWorks(posts, groundY = 0) {
    if (!posts || !posts.length) return 0;
    // Guns first, then the line, each from the objective outward.
    //
    // Sorting the whole plan by range alone spent the cap inside the first
    // trench line and the map ended up with a hundred and fifty riflemen, no
    // field guns beyond the nearest few, no flak at all and no observer. A belt
    // with its guns and a thin line still reads as a prepared position; a line
    // of riflemen with nothing behind it is the garrison this was meant to
    // replace, only further out.
    const rank = (w) => (w.kind === 'pit' ? 0 : 1e6) + Math.hypot(w.x, w.z);
    const ordered = posts.slice().sort((a, b) => rank(a) - rank(b));
    let placed = 0;
    for (const w of ordered) {
      const p = new THREE.Vector3(w.x, Math.max(w.y, groundY - 40), w.z);
      if (this.place(w.type, p, w.yaw, 4, {
        cover: w.kind === 'pit' ? 'ground' : 'trench',
        sandbags: w.kind === 'trench',
        emplaced: true,
      })) placed++;
    }
    return placed;
  }

  /**
   * El Castillo.
   *
   * A pyramid gives a garrison something no other landmark here does: nine
   * terraces of parapet, each one a step back from the one below, so every man
   * on the thing can shoot over the heads of the men beneath him. That is why
   * it is worth defending and why it is unpleasant to attack — there is no
   * dead ground on the face of a stepped pyramid.
   *
   * Positions are read off the builder's own constants, so the pyramid can be
   * rescaled without leaving the garrison standing in mid-air.
   */
  populateElCastillo(origin, groundY, counts = {}) {
    const C = CASTILLO;
    // Half-width of terrace `k`, counted from the ground.
    const halfOf = (k) => (C.base / 2)
      + (C.platHalf - C.base / 2) * (Math.min(k, C.terraces - 1) / (C.terraces - 1));

    // One rank per terrace, thinning as the terraces shrink. The lower ones
    // are riflemen; the upper ones get the long weapons, because from up there
    // they can see the whole plaza.
    //
    // A man stands on the *tread* — the flat top of the terrace below him,
    // between that terrace's face and the face of the one above. Set an inset
    // in from the face instead, which is the obvious way to write it, and he
    // is six metres inside the casing: the wall of a pyramid this size is a
    // sixth of its half-width, so "just inside the edge" is buried.
    const ranks = counts.ranks ?? C.terraces - 1;
    for (let k = 1; k <= ranks; k++) {
      const y = (k / C.terraces) * C.platform;
      const r = (halfOf(k) + halfOf(k - 1)) / 2;
      const n = Math.max(4, Math.round((r * 8) / 26));
      const type = k >= ranks - 1 ? 'sniper' : k > ranks / 2 ? 'mg' : 'rifleman';
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 4;
        const side = Math.floor(t);
        const f = ((t - side) * 2 - 1) * 0.82;
        const p = new THREE.Vector3(origin.x, groundY + y + 0.5, origin.z);
        if (side === 0) { p.x += f * r; p.z += r; }
        else if (side === 1) { p.x += r; p.z -= f * r; }
        else if (side === 2) { p.x -= f * r; p.z -= r; }
        else { p.x -= r; p.z += f * r; }
        this.place(type, p, Math.atan2(p.x - origin.x, p.z - origin.z), 7,
          { cover: 'roof' });
      }
    }

    // The temple on the platform: AT teams at its doorways, which have the
    // longest sightline on the map.
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this.place('at', new THREE.Vector3(
        origin.x + nx * (C.templeHalf - 1.2),
        groundY + C.platform + 0.6,
        origin.z + nz * (C.templeHalf - 1.2)), Math.atan2(nx, nz), 7,
      { cover: 'window' });
    }
    // Mortars behind the temple's own walls.
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      this.place('mortar', new THREE.Vector3(
        origin.x + sx * C.templeHalf * 0.5, groundY + C.platform + 0.6,
        origin.z + sz * C.templeHalf * 0.5), 0, 8, { cover: 'roof' });
    }
    // The chamber inside the older pyramid. Nothing can reach these two until
    // the outer casing and then the inner one are off the top of them, which is
    // most of the level — they are the reserve, and finding them is the point
    // of the building.
    for (const dx of [-2.2, 2.2]) {
      this.place('at', new THREE.Vector3(origin.x + dx, groundY + C.chamberY + 1.0,
        origin.z), 0, 7, { cover: 'arcade' });
    }

    // And the stairways, which are the only way up and are covered as such.
    // On the stair's own surface, which stands a little proud of the terrace
    // face it is climbing.
    for (const [nx, nz] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
      for (const f of [0.34, 0.66]) {
        const k = Math.round(f * C.terraces);
        const y = (k / C.terraces) * C.platform;
        const r = halfOf(k) + 1.0;
        this.place('mg', new THREE.Vector3(
          origin.x + nx * r, groundY + y + 0.5, origin.z + nz * r),
        Math.atan2(nx, nz), 7, { cover: 'roof' });
      }
    }
  }

  /** The Temple of the Warriors, and the colonnade in front of it. */
  populateTempleOfWarriors(origin, groundY) {
    const W = WARRIORS;
    const o = W.offset;
    const base = new THREE.Vector3(origin.x + o.x, groundY, origin.z + o.z);
    // On the temple platform.
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this.place('sniper', new THREE.Vector3(
        base.x + nx * (W.templeHalf - 1.0), base.y + W.height + W.templeH * 0.55,
        base.z + nz * (W.templeHalf - 1.0)), Math.atan2(nx, nz), 7,
      { cover: 'window' });
    }
    // On the terraces — on the tread, between one face and the next, for the
    // same reason as El Castillo: an inset from the face is an inset into six
    // metres of casing.
    const halfOf = (k) => (W.base / 2)
      + (W.base * 0.30 - W.base / 2) * (Math.min(k, W.steps - 1) / (W.steps - 1));
    for (let k = 1; k < W.steps; k++) {
      const y = (k / W.steps) * W.height;
      const r = (halfOf(k) + halfOf(k - 1)) / 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const p = new THREE.Vector3(
          base.x + Math.sin(a) * r, base.y + y + 0.5, base.z + Math.cos(a) * r);
        this.place(k > W.steps / 2 ? 'mg' : 'rifleman', p,
          Math.atan2(p.x - base.x, p.z - base.z), 7, { cover: 'roof' });
      }
    }
    // Under the colonnade, at its outer line of piers. The Group of a Thousand
    // Columns is a roof on stone posts with nothing between them, which is a
    // firing position and not a wall: a man standing at the drip line has three
    // metres of slab over his head and the whole plaza in front of him. Set him
    // a row further in and the piers behind the front row take his sightline,
    // which is how this rank was blind the first time it was laid.
    // Then on the roof, which is flat and is the best firing step on this half
    // of the site.
    const { colCols: nx2, colRows: nz2, colPitch: pch, colH } = W;
    const colZ0 = base.z + W.base / 2 + pch * 1.4;
    for (let i = 0; i < nx2; i++) {
      this.place(i % 3 === 1 ? 'mg' : 'rifleman', new THREE.Vector3(
        base.x - (nx2 - 1) * pch / 2 + i * pch,
        base.y + 0.9,
        colZ0 + (nz2 - 1) * pch + pch * 0.55), 0, 8, { cover: 'arcade' });
    }
    for (let i = 0; i < nx2; i += 2) {
      for (let j = 0; j < nz2; j += 2) {
        // Standing *on* the roof, not in it: the slab and its beams are
        // nearly four metres of stone above the pier tops.
        this.place('rifleman', new THREE.Vector3(
          base.x - (nx2 - 1) * pch / 2 + i * pch,
          base.y + colH + 4.4,
          colZ0 + j * pch), 0, 7, { cover: 'roof' });
      }
    }
  }

  /**
   * The campanile at Pisa.
   *
   * Six open galleries stacked one on the next, which is the best firing step
   * any landmark here has: a ring of arches every nine metres, open the whole
   * way round, with a marble parapet at knee height and eighty-nine metres of
   * elevation over a flat piazza. Positions are taken off the tower's own axis
   * rather than off its base, because the axis moves five and a half metres
   * south on the way up and a ring drawn on the base centre puts half of every
   * gallery inside the masonry and the other half in the air.
   */
  populateCampanile(origin, groundY) {
    const P = PISA;
    const ring = (y, n, type, cover, phase = 0) => {
      const cz = pisaAxisAt(y);
      const r = P.outerR - P.gallery * 0.35;
      for (let i = 0; i < n; i++) {
        const a = phase + (i / n) * Math.PI * 2;
        const p = new THREE.Vector3(
          origin.x + Math.cos(a) * r, groundY + y + 0.6,
          origin.z + cz + Math.sin(a) * r);
        this.place(type, p, Math.atan2(Math.cos(a), Math.sin(a)), 7, { cover });
      }
    };
    for (let k = 0; k < P.loggias; k++) {
      const y = P.stage1 + k * P.loggiaH + 0.4;
      // The higher the gallery, the longer the weapon: from up there the whole
      // piazza and both approaches are inside a rifle's range anyway, so the
      // long stuff goes where it can see furthest.
      ring(y, k < 2 ? 6 : 5, k > 3 ? 'sniper' : k > 1 ? 'mg' : 'rifleman',
        'arcade', k * 0.3);
    }
    // The bell chamber, and the mortar crews on the gallery roof under it.
    const bz = pisaAxisAt(P.bellY + P.bellH * 0.3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this.place('at', new THREE.Vector3(
        origin.x + Math.cos(a) * (P.bellR - 1.0),
        groundY + P.bellY + P.bellH * 0.25,
        origin.z + bz + Math.sin(a) * (P.bellR - 1.0)),
      Math.atan2(Math.cos(a), Math.sin(a)), 8, { cover: 'window' });
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 1.1;
      this.place('mortar', new THREE.Vector3(
        origin.x + Math.cos(a) * (P.outerR - 2.2),
        groundY + P.bellY + 0.8,
        origin.z + pisaAxisAt(P.bellY) + Math.sin(a) * (P.outerR - 2.2)),
      0, 8, { cover: 'roof' });
    }
  }

  /**
   * Pisa Cathedral.
   *
   * The clerestory runs the whole hundred and sixty metres on both sides and
   * looks straight down on anything crossing the piazza, and the west front is
   * four more galleries on top of that. The aisle roofs either side of the
   * nave are the parapet walk between them.
   */
  populateDuomo(origin, groundY) {
    const D = DUOMO;
    const halfX = D.len / 2;
    // The clerestory, both sides of the nave.
    for (let i = 0; i < 9; i++) {
      const x = -halfX + 10 + i * ((D.len - 20) / 8);
      for (const sz of [1, -1]) {
        // Above the aisle roof, not below it. A clerestory window set at
        // four fifths of the aisle height is inside the aisle, looking at the
        // back of the outer wall — which is how this rank was blind.
        this.place(i % 3 === 1 ? 'mg' : 'rifleman', new THREE.Vector3(
          origin.x + x, groundY + D.aisleH + 5.6 * DUOMO.scale, origin.z + sz * D.naveHalfZ),
        sz > 0 ? Math.PI / 2 : -Math.PI / 2, 5, { cover: 'window' });
      }
    }
    // The aisle roofs, which are the walk between the nave and the outer wall.
    for (let i = 0; i < 7; i++) {
      const x = -halfX + 14 + i * ((D.len - 28) / 6);
      for (const sz of [1, -1]) {
        this.place(i % 4 === 0 ? 'at' : 'rifleman', new THREE.Vector3(
          origin.x + x, groundY + D.aisleH + 1.4,
          origin.z + sz * (D.halfZ + D.naveHalfZ) / 2),
        sz > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'roof' });
      }
    }
    // The four galleries of the west front.
    for (let k = 0; k < D.frontTiers; k++) {
      const y = D.aisleH + k * 7.4 * DUOMO.scale;
      for (const sz of [1, -1]) {
        this.place(k > 1 ? 'sniper' : 'rifleman', new THREE.Vector3(
          origin.x - halfX + 1.2, groundY + y + 0.6,
          origin.z + sz * D.halfZ * (0.55 - k * 0.09)), -Math.PI / 2, 7,
        { cover: 'arcade' });
      }
    }
    // The transept ends, and mortars behind the nave ridge.
    for (const sz of [1, -1]) {
      this.place('at', new THREE.Vector3(
        origin.x + D.crossX, groundY + D.aisleH * 1.35 + 1.4,
        origin.z + sz * (D.transHalf - 3)), sz > 0 ? Math.PI / 2 : -Math.PI / 2,
      7, { cover: 'roof' });
    }
    for (let i = 0; i < 3; i++) {
      this.place('mortar', new THREE.Vector3(
        origin.x - 30 + i * 30, groundY + D.aisleH + 1.4,
        origin.z + D.halfZ * 0.72), 0, 7, { cover: 'roof' });
    }
  }

  /** The Palais de Chaillot wing, across the Seine. */
  populateChaillot(origin, groundY) {
    const z0 = -210, len = 96, depth = 20, height = 22;
    for (let i = 0; i < 14; i++) {
      const z = origin.z + z0 - len / 2 + 6 + i * (len - 12) / 13;
      for (const sx of [1, -1]) {
        this.place(i % 3 === 0 ? 'mg' : 'rifleman', new THREE.Vector3(
          origin.x + sx * (depth / 2 - 1.2), groundY + height * 0.55, z),
        sx > 0 ? Math.PI / 2 : -Math.PI / 2, 4, { cover: 'window' });
      }
    }
    for (let i = 0; i < 4; i++) {
      this.place('at', new THREE.Vector3(origin.x, groundY + height + 2.0,
        origin.z + z0 - len / 2 + 14 + i * 22), 0, 8, { cover: 'roof' });
    }
    for (const off of [-30, 10, 34]) {
      this.place('mortar', new THREE.Vector3(origin.x + 5.0, groundY + height + 2.0,
        origin.z + z0 + off), 0, 7, { cover: 'roof' });
    }
  }

  /**
   * The Great Pyramid.
   *
   * A pyramid has no windows and no parapet, so the defence is on the faces
   * and at the corners: the casing is a staircase two hundred metres long on
   * every side, and men on it can see the whole plateau. The chambers inside
   * hold the reserve, which is the only part of this garrison that a shell
   * cannot reach until the masonry over it is gone.
   */
  populateGreatPyramid(origin, groundY, counts = {}) {
    const half = (y) => (KHUFU.base / 2) * Math.max(0, 1 - y / KHUFU.height);

    // Sandbagged batteries along the four faces, on the bedrock terrace.
    //
    // A circle is the wrong shape for a square building. Drawn wide enough to
    // clear the base along the axes it runs off the terrace on the diagonals,
    // and drawn tight enough to stay on the terrace it puts men inside the
    // bottom course. Four straight runs sit where gun pits would actually be
    // dug: hard against each face, on the rock, with the whole plateau in
    // front of them.
    const ground = counts.ground ?? 22;
    const perSide = Math.max(1, Math.round(ground / 4));
    const OUT = KHUFU.base / 2 + 5;          // clear of the casing, on the rock
    const SPAN = KHUFU.base / 2 - 8;         // and short of the terrace corners
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      for (let i = 0; i < perSide; i++) {
        const f = perSide === 1 ? 0 : (i / (perSide - 1)) * 2 - 1;
        const p = new THREE.Vector3(
          origin.x + nx * OUT + (nx ? 0 : f * SPAN),
          groundY + 0.9,
          origin.z + nz * OUT + (nz ? 0 : f * SPAN),
        );
        this.place(i % 3 === 0 ? 'mg' : 'rifleman', p, Math.atan2(nx, nz), 12,
          { cover: 'ground', sandbags: true });
      }
    }

    // On the faces. Stepped positions up all four sides — the higher the man,
    // the longer his weapon reaches.
    for (const y of [16, 34, 54, 76, 100]) {
      const h = half(y);
      const perSide = y < 60 ? 4 : 2;
      for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        for (let i = 0; i < perSide; i++) {
          const f = perSide === 1 ? 0 : (i / (perSide - 1)) * 2 - 1;
          const along = f * h * 0.66;
          const p = new THREE.Vector3(
            origin.x + nx * h + (nx ? 0 : along) - nx * 1.5,
            groundY + y + 1.0,
            origin.z + nz * h + (nz ? 0 : along) - nz * 1.5,
          );
          const t = y > 70 ? 'sniper' : y > 40 ? 'mg' : 'rifleman';
          this.place(t, p, Math.atan2(nx, nz), 8, { cover: 'roof' });
        }
      }
    }

    // AT teams at the four corners of the base, covering the causeways.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const h = half(8);
      this.place('at', new THREE.Vector3(
        origin.x + sx * (h - 4), groundY + 9.0, origin.z + sz * (h - 4)),
      Math.atan2(sx, sz), 9, { cover: 'arcade' });
    }

    // In the King's Chamber and the Grand Gallery, where nothing can reach
    // them until the masonry above has gone.
    for (const [dx, dz] of [[-3, 0], [3, 0]]) {
      this.place('at', new THREE.Vector3(origin.x + dx, groundY + KHUFU.chamberY + 1.0,
        origin.z + 2 + dz), 0, 7, { cover: 'arcade' });
    }
    for (let i = 0; i < 4; i++) {
      const y = KHUFU.galleryY + 3 + i * 4.5;
      const along = (y - KHUFU.galleryY) / Math.tan(26 * Math.PI / 180);
      this.place('rifleman', new THREE.Vector3(origin.x, groundY + y + 0.9,
        origin.z + 2 - 40 + along), 0, 6, { cover: 'arcade' });
    }

    // Mortar pits on the apex platform — the highest ground for eight hundred
    // metres in any direction.
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1]]) {
      const h = half(KHUFU.height - 8);
      this.place('mortar', new THREE.Vector3(
        origin.x + sx * h * 0.5, groundY + KHUFU.height - 7, origin.z + sz * h * 0.5),
      0, 9, { cover: 'roof' });
    }
  }

  /** Khafre, the second pyramid: a lighter picket on the faces. */
  populateKhafre(origin, groundY) {
    const half = (y) => (215.5 / 2) * Math.max(0, 1 - y / 136.4);
    for (const y of [20, 48, 80]) {
      const h = half(y);
      for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        for (const f of [-0.5, 0.5]) {
          const along = f * h * 0.7;
          this.place(y > 60 ? 'sniper' : 'mg', new THREE.Vector3(
            origin.x + nx * h + (nx ? 0 : along) - nx * 1.5,
            groundY + y + 1.0,
            origin.z + nz * h + (nz ? 0 : along) - nz * 1.5,
          ), Math.atan2(nx, nz), 8, { cover: 'roof' });
        }
      }
    }
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      this.place('mortar', new THREE.Vector3(
        origin.x + sx * half(120) * 0.5, groundY + 122, origin.z + sz * half(120) * 0.5),
      0, 9, { cover: 'roof' });
    }
  }

  /**
   * Taj Mahal. The shape of the building dictates the shape of the defence:
   * long open sightlines across the plinth, the four great iwans as covered
   * fighting positions, snipers on 41 m minarets, and mortars on the tomb roof
   * lobbing over the dome at anything working round the back.
   */
  populateTajMahal(origin, groundY, counts = {}) {
    // Every figure comes from `TAJ`, which is the builder's own, and the loose
    // offsets are multiplied by its scale. These used to be written out here
    // by hand at the survey dimensions, so scaling the monument moved the
    // marble and left the garrison standing where the old walls had been.
    const K = TAJ.scale;
    const PLINTH = TAJ.plinth;
    const PLINTH_H = TAJ.plinthH;
    const HALF = TAJ.half;
    const ROOF = TAJ.roof;

    // Sandbagged positions along the plinth parapet: four to a side, clear of
    // the corners, because the corners are where the minarets stand and a man
    // posted on the diagonal was inside one, looking at its wall.
    const half = PLINTH / 2 - 5.0 * K;
    let n = 0;
    for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      for (const t of [-0.62, -0.21, 0.21, 0.62]) {
        const p = new THREE.Vector3(
          origin.x + nx * half + nz * t * half, groundY + PLINTH_H + 1.0,
          origin.z + nz * half + nx * t * half,
        );
        this.place(n++ % 3 === 0 ? 'mg' : 'rifleman', p, Math.atan2(nx, nz), 7 * K,
          { cover: 'ground', sandbags: true });
      }
    }

    // The four great iwans — deep covered recesses looking straight down each
    // approach. Set back inside the arch so the reveal is real cover.
    for (const [nx, nz, yaw] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
      for (const off of [-5 * K, 0, 5 * K]) {
        const p = new THREE.Vector3(
          origin.x + nx * (HALF - 3.2 * K) - nz * off,
          groundY + PLINTH_H + 1.6,
          origin.z + nz * (HALF - 3.2 * K) + nx * off,
        );
        this.place(off === 0 ? 'mg' : 'rifleman', p, yaw, 7 * K, { cover: 'window' });
      }
      // A second storey of pierced screens above each iwan.
      const q = new THREE.Vector3(
        origin.x + nx * (HALF - 1.2 * K), groundY + PLINTH_H + 21.0 * K,
        origin.z + nz * (HALF - 1.2 * K),
      );
      this.place('sniper', q, yaw, 6 * K, { cover: 'window' });
    }

    // Tomb roof: AT teams at the corners, mortars beside the drum.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      // Off the diagonal: the corner chattris stand there, and a team posted
      // at 21 m on both axes was inside one, looking at its columns.
      const p = new THREE.Vector3(
        origin.x + sx * 24 * K, groundY + ROOF + 2.0, origin.z + sz * 9 * K,
      );
      this.place('at', p, Math.atan2(sx, sz), 9 * K, { cover: 'roof' });
    }
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this.place('mortar',
        new THREE.Vector3(origin.x + sx * 15 * K, groundY + ROOF + 2.0, origin.z + sz * 15 * K),
        Math.atan2(sx, sz), 9 * K, { cover: 'roof' });
    }

    // Minaret tops: snipers, seeing everything.
    const base = PLINTH / 2 - 6.0 * K;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      // On the ring of the cap and on the shaft's wall, not at the centre of
      // a hollow. A minaret is a tube; at 2.2x its bore is ten metres across
      // and a man at the axis has nothing under him.
      const p = new THREE.Vector3(
        origin.x + sx * (base + 2.3 * K), groundY + PLINTH_H + 43.0 * K,
        origin.z + sz * (base + 2.3 * K),
      );
      this.place('sniper', p, Math.atan2(sx, sz), 9 * K, { cover: 'roof' });
      const q = new THREE.Vector3(
        origin.x + sx * (base + 2.05 * K), groundY + PLINTH_H + 24.0 * K,
        origin.z + sz * (base + 2.05 * K),
      );
      this.place('mg', q, Math.atan2(sx, sz), 8 * K, { cover: 'window' });
    }

    // Mosque and jawab roofs.
    for (const side of [-1, 1]) {
      // Between the domes, not inside them: the outer domes sit at 17 m.
      for (const off of [-9 * K, 0, 9 * K]) {
        const p = new THREE.Vector3(
          origin.x + side * TAJ.mosqueX, groundY + TAJ.mosqueRoof, origin.z + off);
        this.place(off === 0 ? 'mortar' : 'rifleman', p, side > 0 ? Math.PI / 2 : -Math.PI / 2,
          9 * K, { cover: 'roof' });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────── combat ──

  /** The defender drawn as instance `id` of the figure mesh, if any. */
  defenderForInstance(id) {
    const order = this._drawOrder;
    if (!order || id < 0 || id >= order.length) return null;
    const d = order[id];
    return d && d.alive ? d : null;
  }

  get aliveCount() { return this.defenders.reduce((n, d) => n + (d.alive ? 1 : 0), 0); }

  countsByType() {
    const out = {};
    for (const d of this.defenders) {
      if (!d.alive) continue;
      out[d.type] = (out[d.type] || 0) + 1;
    }
    return out;
  }

  /** Kill anything caught in a blast, and put the heads down around it. */
  splash(center, radius, power) {
    let killed = 0;
    // A shell landing near a position stops it firing for a few seconds
    // whether or not it hurts anyone: the men are on the floor. This is the
    // whole point of suppressive fire, and it is what makes shelling a
    // window worth doing even when the shell misses.
    const supR = radius * 2.6;
    for (const d of this.defenders) {
      if (!d.alive) continue;
      const dist = d.pos.distanceTo(center);
      if (dist < supR) {
        const t = 1.2 + 3.4 * (1 - dist / supR) * Math.min(1.5, power / 6000);
        d.suppressed = Math.max(d.suppressed || 0, this.time + t);
      }
      if (dist > radius) continue;
      // Fragments do not fall off linearly, and cover is a real number rather
      // than an accident.
      //
      // It used to be a straight taper at a flat rate, which made the lethal
      // zone of an AT4 about a metre across a three-and-a-half metre burst —
      // and the sheaf of a shoulder-launched weapon at two hundred metres is a
      // couple of metres wide, so against a man in a trench it was very nearly
      // a hundred per cent misses. The curve is gentler now and the rate is
      // higher, and cover takes its cut openly: a crew below a parapet keeps
      // about a third of it off, a man at a window rather less, and a man in
      // the open none at all. An AT4 kills a trench rifleman inside about two
      // metres, which it manages often enough to be worth firing and rarely
      // enough that digging in was still worth doing.
      const cover = d.cover === 'trench' ? 0.7
        : d.sandbags ? 0.8
          : (d.cover === 'window' || d.cover === 'arcade') ? 0.85 : 1;
      const falloff = Math.pow(1 - dist / radius, 0.6);
      d.health -= power * falloff * 0.095 * cover;
      if (d.health <= 0) { d.alive = false; killed++; }
    }
    return killed;
  }

  /** How many live defenders are keeping their heads down right now. */
  get suppressedCount() {
    let n = 0;
    for (const d of this.defenders) if (d.alive && d.suppressed > this.time) n++;
    return n;
  }

  /**
   * Defenders riding a stone that has been destroyed or knocked loose go with
   * it. This is checked every frame because it is the main way they die.
   */
  reconcileStructure(groundY = -Infinity) {
    let lost = 0;
    for (const d of this.defenders) {
      if (!d.alive) continue;
      const s = d.structure;
      if (!s) continue;                      // in a pit, on the ground
      const f = s.flags[d.chunk];
      const dead = !(f & 1);
      const falling = (f & 2) || (f & 8);
      if (dead || falling) { d.alive = false; lost++; continue; }

      // And check there is still a floor under him.
      //
      // The anchor chunk is only the nearest stone that existed when he was
      // posted — up to eight metres away, and `_settleIntoPosition` can then
      // nudge him several more looking for a field of fire. So the masonry he
      // is actually standing on and the stone whose flags decide whether he
      // lives are routinely not the same stone, and shelling the plinth out
      // from under a sandbagged position left the whole section hanging in the
      // air at five metres with nothing beneath it, still shooting.
      //
      // Cheap because the solidity grid already exists for line of sight: two
      // lookups against a 2 m grid, not a search through seven thousand stones.
      if (d.pos.y - groundY < 1.6) continue;        // he is on the actual ground
      const solid = s.occupancy
        && (s.occupancy.solidAt(d.pos.x, d.pos.y - 1.0, d.pos.z)
          || s.occupancy.solidAt(d.pos.x, d.pos.y - 2.2, d.pos.z));
      if (s.occupancy && !solid) { d.alive = false; lost++; }
    }
    return lost;
  }

  /**
   * Can this defender see that unit?
   *
   * The near-end skip is the whole subtlety here. The solidity grid is 2 m
   * coarse, and a window is 1.7 m wide — so the cell a man at a window stands
   * in also contains the masonry on either side of the opening, and counts as
   * solid. Without skipping past it, every defender in the building would be
   * blocked by the wall he is shooting through, and the garrison would simply
   * stop firing. Positions in the open need no such allowance, and giving them
   * one would let them shoot through a real wall standing right in front.
   */
  canSee(d, unit, structures) {
    if (!this.losEnabled) return true;
    this.losChecks++;
    this._from.copy(d.muzzle);
    this._to.copy(unit.pos).setY(unit.pos.y + 1.1);
    // A smoke screen between the two is a wall for as long as it lasts.
    if (this.smokes && this.smokes.active && this.smokes.blocks(this._from, this._to)) {
      this.losBlocked++;
      return false;
    }
    const clear = lineOfSight(
      structures || this.structures, this._from, this._to, skipFor(d), 0.5,
    );
    if (!clear) this.losBlocked++;
    return clear;
  }

  /**
   * Does this defender have a clear shot in the direction he is facing?
   *
   * A diagnostic, not a game rule: a position that can never see anything is a
   * placement bug, and it is invisible in play because a silent defender looks
   * exactly like one with nothing to shoot at.
   */
  hasFieldOfFire(d, range = 130, structures) {
    if (d.def.indirect) return true;      // a mortar shoots over everything
    const list = structures || this.structures;
    const skip = skipFor(d);
    // Sample a fan across the firing arc rather than one ray: a single ray
    // straight ahead can clip a mullion and libel a perfectly good position.
    //
    // Level first, then a shallow depression. A steeper probe finds the deck
    // the position is standing on and calls a perfectly good embrasure blind —
    // real depression onto a gun a few hundred metres out is a couple of
    // degrees, not a dive. (Scaling the dip by the muzzle's *world* height
    // rather than its height above ground was worse still: on a level 150 m
    // above sea level it fired every defender into his own floor.)
    for (const dip of [0, range * 0.035]) {
      for (const off of [0, 0.4, -0.4, 0.9, -0.9]) {
        const a = d.facing + off;
        const to = this._to.set(
          d.muzzle.x + Math.sin(a) * range,
          d.muzzle.y - dip,
          d.muzzle.z + Math.cos(a) * range,
        );
        if (lineOfSight(list, d.muzzle, to, skip, 0.0)) return true;
      }
    }
    return false;
  }

  /** How many live defenders can see out of where they are standing. */
  fieldOfFireReport(structures) {
    let clear = 0, blind = 0;
    const blindBy = {};
    for (const d of this.defenders) {
      if (!d.alive) continue;
      if (this.hasFieldOfFire(d, 130, structures)) clear++;
      else {
        blind++;
        const k = `${d.type}/${d.cover}`;
        blindBy[k] = (blindBy[k] || 0) + 1;
      }
    }
    return { clear, blind, blindBy };
  }

  /**
   * Pick targets and shoot. Returns the shots taken this tick through `shots`,
   * for the caller to turn into tracers.
   *
   * Indirect-fire crews are skipped here — they run in `updateMortars`, which
   * puts a real shell in the air rather than resolving a hit instantly.
   */
  update(dt, playerUnits, shots, structures) {
    this.time += dt;
    if (!this.fireEnabled) return;
    for (const d of this.defenders) {
      if (!d.alive || d.def.indirect) continue;
      d.cooldown -= dt;
      if (d.cooldown > 0) continue;
      // Head down: nothing until the shelling stops.
      if (d.suppressed > this.time) { d.cooldown = 0.3; continue; }

      const best = this._acquire(d, playerUnits, structures);
      if (!best) { d.cooldown = 0.4; continue; }

      const dist = d.pos.distanceTo(best.pos);
      // Accuracy falls off with range.
      const hitChance = d.def.accuracy * (1 - 0.55 * (dist / d.def.range));
      const hit = Math.random() < hitChance;

      // A crew that has dug in takes a third less: the sandbags are real.
      const damage = d.def.damage * this.damageScale * (best.dugIn ? 0.65 : 1);
      shots.push({ from: d.muzzle, to: best.pos, hit, damage, unit: best, defender: d });
      if (hit) best.health -= damage;

      // Face what you are shooting at, so the instanced soldier reads right.
      d.facing = Math.atan2(best.pos.x - d.pos.x, best.pos.z - d.pos.z);

      if (d.def.burst) {
        d.burstLeft = d.burstLeft > 0 ? d.burstLeft - 1 : d.def.burst;
        d.cooldown = d.burstLeft > 0 ? d.def.rof : d.def.burstGap;
      } else {
        d.cooldown = d.def.rof * (0.8 + Math.random() * 0.4);
      }
    }
  }

  /** Nearest live unit inside range, arc and line of sight. */
  _acquire(d, playerUnits, structures) {
    const fx = Math.sin(d.facing), fz = Math.cos(d.facing);
    const r2 = d.def.range * d.def.range;
    // Sort by distance implicitly: take candidates nearest first so the
    // line-of-sight test runs on as few as possible.
    let best = null, bestD = r2;
    const blockedOnly = this._cand || (this._cand = []);
    blockedOnly.length = 0;
    for (const u of playerUnits) {
      if (!u.alive) continue;
      const dx = u.pos.x - d.pos.x, dy = u.pos.y - d.pos.y, dz = u.pos.z - d.pos.z;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd >= bestD) continue;
      const flat = Math.hypot(dx, dz);
      if (!d.def.indirect && flat > 0.001 && (dx * fx + dz * fz) / flat < FIRING_ARC) {
        continue;
      }
      blockedOnly.push({ u, dd });
    }
    blockedOnly.sort((a, b) => a.dd - b.dd);
    for (const c of blockedOnly) {
      if (!this.canSee(d, c.u, structures)) continue;
      best = c.u;
      break;
    }
    d.blocked = !best && blockedOnly.length > 0;
    return best;
  }

  /**
   * Indirect fire. Mortar crews engage anything inside range regardless of what
   * is between them and it — the round goes over the top — but they need a
   * minimum range, they are slow, and the shell is a real object that can be
   * seen coming and can miss.
   */
  updateMortars(dt, projectiles, units) {
    if (!this.fireEnabled || !projectiles) return;
    // Is anyone observing? A mortar crew cannot see what it is shooting at —
    // that is the whole nature of indirect fire — so without an observer it is
    // firing on a map reference and correcting by ear, and with one it is being
    // walked onto the target. The difference is worth a real amount, because
    // otherwise nobody would ever bother to kill him.
    const observed = this.defenders.some((o) => o.alive && o.def.observer);
    this.observed = observed;
    for (const d of this.defenders) {
      if (!d.alive || !d.def.indirect) continue;
      d.cooldown -= dt;
      if (d.cooldown > 0) continue;
      if (d.suppressed > this.time) { d.cooldown = 0.5; continue; }
      let best = null, bestD = d.def.range * d.def.range;
      for (const u of units) {
        if (!u.alive) continue;
        const dd = d.pos.distanceToSquared(u.pos);
        if (dd < d.def.shell.minRange * d.def.shell.minRange) continue;
        if (dd < bestD) { bestD = dd; best = u; }
      }
      if (!best) { d.cooldown = 1.0; continue; }

      // Lead the shot a little and scatter it, so a mortar suppresses a
      // position rather than deleting whatever stands in it.
      const spread = observed ? 4.5 : 11;
      const aim = best.pos.clone();
      aim.x += (Math.random() - 0.5) * spread;
      aim.z += (Math.random() - 0.5) * spread;
      aim.y = best.pos.y;

      const sh = d.def.shell;
      const sol = solveBallistic(d.muzzle, aim, sh.speed, sh.gravity, 14.0);
      if (!sol) { d.cooldown = 1.4; continue; }

      projectiles.fire({
        pos: d.muzzle, vel: sol.vel, gravity: sh.gravity, kind: 'arc',
        speed: sh.speed, warhead: sh.warhead, owner: null, target: aim,
        trail: sh.trail, hostile: true,
      });
      d.facing = Math.atan2(aim.x - d.pos.x, aim.z - d.pos.z);
      d.cooldown = d.def.rof * (observed ? 0.6 : 1.0) * (0.75 + Math.random() * 0.5);
      this.mortarsFired++;
      if (this.onMortarFire) this.onMortarFire(d);
    }
  }

  /**
   * Live flak that can reach a point, weighted by how hard it is shooting.
   *
   * Asked by `aircraft.js` before a bomb goes, which is the only place in the
   * game where a defender affects something it cannot draw a line of sight to.
   * A gun that is suppressed counts for nothing: crews with shells landing on
   * them are not tracking anything.
   */
  flakOver(point, radius = 0) {
    let n = 0;
    for (const d of this.defenders) {
      if (!d.alive || !d.def.flak) continue;
      if (d.suppressed > this.time) continue;
      const reach = d.def.range + radius;
      if (d.pos.distanceToSquared(point) > reach * reach) continue;
      n++;
    }
    return n;
  }

  /** Rebuild the instance buffers. Only live defenders are drawn. */
  sync() {
    let w = 0, mw = 0, bw = 0, gw = 0, fw = 0;
    // Which defender each drawn figure is, so a tap on one can be traced back.
    // The instanced mesh is packed with only the living, in no fixed order, so
    // without this the raycast knows a soldier was hit and nothing else.
    const order = this._drawOrder || (this._drawOrder = []);
    order.length = 0;
    for (const d of this.defenders) {
      if (!d.alive) continue;
      this._q.setFromAxisAngle(this._axis, d.facing);

      if (d.def.indirect) {
        this._v.copy(d.pos);
        this._m4.compose(this._v, this._q, this._s);
        if (mw < this.mortarMesh.instanceMatrix.count) {
          this.mortarMesh.setMatrixAt(mw, this._m4);
          this._col.setHex(0x596247);
          this.mortarMesh.instanceColor.setXYZ(mw, this._col.r, this._col.g, this._col.b);
          mw++;
        }
        // Plus a crewman kneeling beside the tube.
        this._v.set(d.pos.x + Math.cos(d.facing) * 0.9, d.pos.y,
          d.pos.z - Math.sin(d.facing) * 0.9);
      } else {
        this._v.copy(d.pos);
      }

      // The piece, where there is one, and a crewman standing to the side of
      // it rather than inside the breech.
      if (d.def.key === 'fieldgun' || d.def.key === 'aa') {
        const pit = d.def.key === 'aa' ? this.flakMesh : this.gunMesh;
        const cur = d.def.key === 'aa' ? fw : gw;
        if (cur < pit.instanceMatrix.count) {
          this._m4.compose(d.pos, this._q, this._s);
          pit.setMatrixAt(cur, this._m4);
          this._col.setHex(0x4e5639);
          pit.instanceColor.setXYZ(cur, this._col.r, this._col.g, this._col.b);
          if (d.def.key === 'aa') fw++; else gw++;
        }
        this._v.set(d.pos.x + Math.cos(d.facing) * 1.5, d.pos.y,
          d.pos.z - Math.sin(d.facing) * 1.5);
      }

      if (d.sandbags && bw < this.bagMesh.instanceMatrix.count) {
        this._m4.compose(this._v, this._q, this._s);
        this.bagMesh.setMatrixAt(bw, this._m4);
        this._col.setHex(0x8b8163);
        this.bagMesh.instanceColor.setXYZ(bw, this._col.r, this._col.g, this._col.b);
        bw++;
      }

      // A suppressed man is drawn crouched: the squat is the tell.
      const ducking = d.suppressed > this.time;
      if (ducking && !this._sDuck) this._sDuck = new THREE.Vector3(1, 0.55, 1);
      this._m4.compose(this._v, this._q, ducking ? this._sDuck : this._s);
      this.mesh.setMatrixAt(w, this._m4);
      this._col.setHex(d.def.colour);
      this.mesh.instanceColor.setXYZ(w, this._col.r, this._col.g, this._col.b);
      order[w] = d;
      w++;
    }
    this.mesh.count = w;
    this.mortarMesh.count = mw;
    this.bagMesh.count = bw;
    this.gunMesh.count = gw;
    this.flakMesh.count = fw;
    for (const m of [this.mesh, this.mortarMesh, this.bagMesh, this.gunMesh, this.flakMesh]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }
}
