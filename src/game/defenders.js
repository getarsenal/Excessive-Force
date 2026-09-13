import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The garrison.
 *
 * Every defender is pinned to a specific stone. When that stone is destroyed or
 * detaches, the defender goes with it — so suppressing a face of the tower is
 * not a separate mechanic bolted onto the destruction, it *is* the destruction.
 * Shelling the belfry to drop the spire also kills the AT team firing from it.
 *
 * They're drawn as a single InstancedMesh, so a hundred defenders cost one
 * draw call.
 */

export const DEFENDER_TYPES = {
  rifleman: {
    name: 'Rifleman', health: 42, damage: 3.4, rof: 1.15, range: 230,
    accuracy: 0.5, colour: 0x6b5a3e, threat: 1,
  },
  mg: {
    name: 'MG Nest', health: 78, damage: 2.4, rof: 0.11, burst: 7, burstGap: 2.6,
    range: 330, accuracy: 0.38, colour: 0x54452f, threat: 3,
  },
  sniper: {
    name: 'Sniper', health: 34, damage: 17, rof: 4.2, range: 430,
    accuracy: 0.72, colour: 0x3e4634, threat: 4,
  },
  at: {
    name: 'AT Team', health: 90, damage: 88, rof: 8.0, range: 340,
    accuracy: 0.62, colour: 0x4a3c2c, threat: 8,
  },
};

/**
 * How far off its facing a defender will engage.
 *
 * Without this, all sixty defenders engage whatever is closest regardless of
 * which side of the tower they are on, and the combined fire deletes an
 * infantry team in about a second. A firing arc is both what actually happens
 * — a man at a window on the north face cannot shoot south through the tower —
 * and the thing that makes approach direction a real decision.
 */
const FIRING_ARC = Math.cos(THREE.MathUtils.degToRad(78));

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

    const geo = soldierGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5d5038, roughness: 0.9, metalness: 0.02 });
    this.mesh = new THREE.InstancedMesh(geo, mat, 256);
    this.mesh.castShadow = quality.shadowMapSize > 0;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    scene.add(this.mesh);

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._col = new THREE.Color();
  }

  /**
   * Pin a defender to the nearest surviving stone to `pos`, within `maxDist`.
   * Returns false when there is nothing there to stand on.
   */
  place(type, pos, facing = 0, maxDist = 6) {
    if (this.defenders.length >= 256) return false;
    const def = DEFENDER_TYPES[type];
    if (!def) return false;

    let bestStruct = null, bestChunk = -1, bestD = maxDist * maxDist;
    for (const s of this.structures) {
      for (let i = 0; i < s.count; i++) {
        if (!(s.flags[i] & 1)) continue;
        const dx = s.px[i] - pos.x, dy = s.py[i] - pos.y, dz = s.pz[i] - pos.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; bestStruct = s; bestChunk = i; }
      }
    }
    if (bestChunk < 0) return false;

    this.defenders.push({
      type, def,
      pos: pos.clone(),
      facing,
      structure: bestStruct,
      chunk: bestChunk,
      health: def.health,
      alive: true,
      cooldown: Math.random() * def.rof,
      burstLeft: 0,
      target: null,
      muzzle: pos.clone().add(new THREE.Vector3(0, 1.25, 0)),
    });
    return true;
  }

  /** Standard Westminster garrison: base positions, window lines, the belfry. */
  populateElizabethTower(origin, groundY, counts = {}) {
    const W = 12.2;
    const faces = [
      { nx: 0, nz: 1, yaw: 0 },
      { nx: 0, nz: -1, yaw: Math.PI },
      { nx: 1, nz: 0, yaw: Math.PI / 2 },
      { nx: -1, nz: 0, yaw: -Math.PI / 2 },
    ];

    // Sandbagged positions at the foot of the tower.
    for (let i = 0; i < (counts.ground ?? 10); i++) {
      const a = (i / (counts.ground ?? 10)) * Math.PI * 2;
      const r = 11.5;
      const p = new THREE.Vector3(
        origin.x + Math.cos(a) * r, groundY + 5.4, origin.z + Math.sin(a) * r,
      );
      this.place(i % 3 === 0 ? 'mg' : 'rifleman', p, a, 8);
    }

    // Window lines up the shaft. Higher windows hold the nastier weapons.
    const windowHeights = [14, 22, 30, 38, 46];
    for (const h of windowHeights) {
      for (const f of faces) {
        const p = new THREE.Vector3(
          origin.x + f.nx * (W / 2 + 0.3),
          groundY + h,
          origin.z + f.nz * (W / 2 + 0.3),
        );
        const t = h > 36 ? 'sniper' : h > 24 ? 'mg' : 'rifleman';
        this.place(t, p, f.yaw, 5);
      }
    }

    // Clock stage corners — long sightlines, snipers.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = new THREE.Vector3(
        origin.x + sx * (W / 2 + 0.4), groundY + 59.0, origin.z + sz * (W / 2 + 0.4),
      );
      this.place('sniper', p, Math.atan2(sx, sz), 6);
    }

    // Belfry arcade: AT teams with the best field of fire in the level. Drop
    // the belfry and the whole upper garrison goes with it.
    for (const f of faces) {
      const p = new THREE.Vector3(
        origin.x + f.nx * 6.0, groundY + 64.5, origin.z + f.nz * 6.0,
      );
      this.place('at', p, f.yaw, 7);
    }
  }

  populatePalaceWing(origin, groundY) {
    const z0 = 14, len = 74, depth = 22, height = 27;
    for (let i = 0; i < 9; i++) {
      const z = origin.z + z0 + 5 + (i / 8) * (len - 10);
      for (const sx of [1, -1]) {
        const p = new THREE.Vector3(origin.x + sx * (depth / 2 - 0.6), groundY + height + 1.0, z);
        this.place(i % 3 === 1 ? 'mg' : 'rifleman', p, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 5);
      }
    }
    for (let i = 0; i < 4; i++) {
      const z = origin.z + z0 + 12 + i * 16;
      this.place('at', new THREE.Vector3(origin.x, groundY + height + 7.5, z), 0, 8);
    }
  }

  /**
   * Taj Mahal garrison. The shape of the building dictates the shape of the
   * defence: long open sightlines across the plinth, snipers on four 41 m
   * minarets that see the whole approach, and AT teams on the tomb roof.
   * Dropping a minaret takes its sniper with it, which is the one piece of the
   * garrison you can remove without touching the tomb.
   */
  populateTajMahal(origin, groundY, counts = {}) {
    const PLINTH = 95.5;
    const PLINTH_H = 7.0;
    const HALF = 28.5;
    const ROOF = PLINTH_H + 33.0;

    // Sandbagged positions along the plinth edge.
    const perimeter = counts.plinth ?? 16;
    for (let i = 0; i < perimeter; i++) {
      const t = i / perimeter;
      const a = t * Math.PI * 2;
      const half = PLINTH / 2 - 2.5;
      // Walk the square edge rather than a circle so they sit on the parapet.
      const c = Math.cos(a), sn = Math.sin(a);
      const m = Math.max(Math.abs(c), Math.abs(sn));
      const p = new THREE.Vector3(
        origin.x + (c / m) * half, groundY + PLINTH_H + 1.0, origin.z + (sn / m) * half,
      );
      this.place(i % 3 === 0 ? 'mg' : 'rifleman', p, a, 7);
    }

    // The four great iwans — covered positions looking straight down the
    // approaches.
    for (const [nx, nz, yaw] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
      for (const off of [-5, 5]) {
        const p = new THREE.Vector3(
          origin.x + nx * (HALF - 1.5) - nz * off,
          groundY + PLINTH_H + 6.0,
          origin.z + nz * (HALF - 1.5) + nx * off,
        );
        this.place('rifleman', p, yaw, 6);
      }
    }

    // Tomb roof: AT teams with the best field of fire on the level.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = new THREE.Vector3(
        origin.x + sx * 21, groundY + ROOF + 2.0, origin.z + sz * 21,
      );
      this.place('at', p, Math.atan2(sx, sz), 9);
    }

    // Minaret tops: snipers, 41 m up, seeing everything.
    const base = PLINTH / 2 - 6.0;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = new THREE.Vector3(
        origin.x + sx * (base + 0.9), groundY + PLINTH_H + 43.0, origin.z + sz * (base + 0.9),
      );
      this.place('sniper', p, Math.atan2(sx, sz), 9);
      // And a second, lower position on the shaft.
      const q = new THREE.Vector3(
        origin.x + sx * (base + 0.4), groundY + PLINTH_H + 24.0, origin.z + sz * (base + 0.4),
      );
      this.place('mg', q, Math.atan2(sx, sz), 8);
    }

    // Mosque and jawab roofs.
    for (const side of [-1, 1]) {
      for (const off of [-16, 0, 16]) {
        const p = new THREE.Vector3(origin.x + side * 88, groundY + 19.5, origin.z + off);
        this.place(off === 0 ? 'at' : 'rifleman', p, side > 0 ? Math.PI / 2 : -Math.PI / 2, 9);
      }
    }
  }

  get aliveCount() { return this.defenders.reduce((n, d) => n + (d.alive ? 1 : 0), 0); }

  /** Kill anything caught in a blast. */
  splash(center, radius, power) {
    let killed = 0;
    for (const d of this.defenders) {
      if (!d.alive) continue;
      const dist = d.pos.distanceTo(center);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      d.health -= power * falloff * 0.055;
      if (d.health <= 0) { d.alive = false; killed++; }
    }
    return killed;
  }

  /**
   * Defenders riding a stone that has been destroyed or knocked loose go with
   * it. This is checked every frame because it is the main way they die.
   */
  reconcileStructure() {
    let lost = 0;
    for (const d of this.defenders) {
      if (!d.alive) continue;
      const s = d.structure;
      const f = s.flags[d.chunk];
      const dead = !(f & 1);
      const falling = (f & 2) || (f & 8);
      if (dead || falling) { d.alive = false; lost++; }
    }
    return lost;
  }

  /**
   * Pick targets and shoot. Returns an array of shots taken this tick for the
   * caller to turn into tracers and damage.
   */
  update(dt, playerUnits, shots) {
    this.time += dt;
    for (const d of this.defenders) {
      if (!d.alive) continue;
      d.cooldown -= dt;
      if (d.cooldown > 0) continue;

      // Retarget: nearest live unit inside both range and firing arc.
      // Defenders take whatever is closest rather than optimising, which keeps
      // cheap infantry useful as a screen for the guns behind them.
      const fx = Math.sin(d.facing), fz = Math.cos(d.facing);
      let best = null, bestD = d.def.range * d.def.range;
      for (const u of playerUnits) {
        if (!u.alive) continue;
        const dx = u.pos.x - d.pos.x, dy = u.pos.y - d.pos.y, dz = u.pos.z - d.pos.z;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd >= bestD) continue;
        const flat = Math.hypot(dx, dz);
        if (flat > 0.001 && (dx * fx + dz * fz) / flat < FIRING_ARC) continue;
        bestD = dd; best = u;
      }
      if (!best) { d.cooldown = 0.4; continue; }

      const dist = Math.sqrt(bestD);
      // Accuracy falls off with range.
      const hitChance = d.def.accuracy * (1 - 0.55 * (dist / d.def.range));
      const hit = Math.random() < hitChance;

      shots.push({ from: d.muzzle, to: best.pos, hit, damage: d.def.damage, unit: best, defender: d });
      if (hit) best.health -= d.def.damage;

      if (d.def.burst) {
        d.burstLeft = d.burstLeft > 0 ? d.burstLeft - 1 : d.def.burst;
        d.cooldown = d.burstLeft > 0 ? d.def.rof : d.def.burstGap;
      } else {
        d.cooldown = d.def.rof * (0.8 + Math.random() * 0.4);
      }
    }
  }

  /** Rebuild the instance buffer. Only live defenders are drawn. */
  sync() {
    let w = 0;
    for (const d of this.defenders) {
      if (!d.alive) continue;
      this._v.copy(d.pos);
      this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.facing);
      this._m4.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(w, this._m4);
      this._col.setHex(d.def.colour);
      this.mesh.instanceColor.setXYZ(w, this._col.r, this._col.g, this._col.b);
      w++;
    }
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
