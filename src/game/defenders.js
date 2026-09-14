import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lineOfSight } from '../structure/occupancy.js';
import { solveBallistic } from './projectiles.js';
import { TOWER_WINDOWS, WING_WINDOWS } from '../structure/landmarks/bigben.js';

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

    this.mesh = mk(soldierGeometry(), 0xffffff, 256);
    this.mortarMesh = mk(mortarGeometry(), 0xffffff, 48);
    this.bagMesh = mk(sandbagGeometry(), 0xffffff, 96);

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
   * Pin a defender to the nearest surviving stone to `pos`, within `maxDist`.
   * Returns false when there is nothing there to stand on — which is how a
   * position that would have floated in mid-air quietly declines to exist.
   */
  place(type, pos, facing = 0, maxDist = 6, opts = {}) {
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

    const d = {
      type, def,
      pos: pos.clone(),
      facing,
      cover: opts.cover || null,     // 'window' | 'roof' | 'ground' | 'arcade'
      sandbags: !!opts.sandbags,
      structure: bestStruct,
      chunk: bestChunk,
      health: def.health,
      alive: true,
      cooldown: Math.random() * def.rof,
      burstLeft: 0,
      target: null,
      blocked: false,
      muzzle: pos.clone().add(new THREE.Vector3(0, def.eye ?? 1.25, 0)),
    };

    this._settleIntoPosition(d);
    this.defenders.push(d);
    return true;
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
    const W = 12.2;
    const faces = [
      { nx: 0, nz: 1, yaw: 0 },
      { nx: 0, nz: -1, yaw: Math.PI },
      { nx: 1, nz: 0, yaw: Math.PI / 2 },
      { nx: -1, nz: 0, yaw: -Math.PI / 2 },
    ];

    // Sandbagged positions at the foot of the tower, on the plinth.
    const ground = counts.ground ?? 10;
    for (let i = 0; i < ground; i++) {
      const a = (i / ground) * Math.PI * 2;
      const r = 11.5;
      const p = new THREE.Vector3(
        origin.x + Math.cos(a) * r, groundY + 5.4, origin.z + Math.sin(a) * r,
      );
      this.place(i % 3 === 0 ? 'mg' : 'rifleman', p, Math.atan2(Math.cos(a), Math.sin(a)), 8,
        { cover: 'ground', sandbags: true });
    }

    // In the window bays. The embrasure's sill is the floor they stand on, and
    // they sit *inside* the wall plane so the reveal covers them from the side.
    const { heights, halfHeight } = TOWER_WINDOWS;
    for (let li = 0; li < heights.length; li++) {
      const wy = heights[li];
      const t = (wy - 6.0) / (61.0 - 6.0);
      const wall = 2.3 - t * 1.4;
      const w = W - t * 0.5;
      const inset = w / 2 - wall * 0.35;
      for (const f of faces) {
        const p = new THREE.Vector3(
          origin.x + f.nx * inset,
          groundY + wy - halfHeight + 0.28,
          origin.z + f.nz * inset,
        );
        const t2 = li >= 4 ? 'sniper' : li >= 2 ? 'mg' : 'rifleman';
        this.place(t2, p, f.yaw, 4.0, { cover: 'window' });
      }
    }

    // Clock stage corners — long sightlines over the whole of Westminster.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = new THREE.Vector3(
        origin.x + sx * (W / 2 + 0.4), groundY + 59.0, origin.z + sz * (W / 2 + 0.4),
      );
      this.place('sniper', p, Math.atan2(sx, sz), 6, { cover: 'roof' });
    }

    // Belfry arcade: AT teams with the best field of fire in the level. Drop
    // the belfry and the whole upper garrison goes with it.
    for (const f of faces) {
      const p = new THREE.Vector3(
        origin.x + f.nx * 6.0, groundY + 64.5, origin.z + f.nz * 6.0,
      );
      this.place('at', p, f.yaw, 7, { cover: 'arcade' });
    }

    // Two mortars on the belfry roof slab, which can range the entire map.
    for (const sx of [-1, 1]) {
      this.place('mortar',
        new THREE.Vector3(origin.x + sx * 3.4, groundY + 70.4, origin.z),
        0, 6, { cover: 'roof' });
    }
  }

  populatePalaceWing(origin, groundY) {
    const z0 = 14, len = 74, depth = 22;
    const { heights, first, spacing, halfHeight, roof } = WING_WINDOWS;

    // One man per window bay on both elevations, weighted so the upper floors
    // hold the longer-ranged weapons.
    for (let li = 0; li < heights.length; li++) {
      const wy = heights[li];
      for (let bz = z0 + first; bz < z0 + len - 3; bz += spacing) {
        for (const sx of [1, -1]) {
          const p = new THREE.Vector3(
            origin.x + sx * (depth / 2 - 1.15),
            groundY + wy - halfHeight + 0.3,
            origin.z + bz,
          );
          const t = li === 2 ? 'sniper' : li === 1 ? 'mg' : 'rifleman';
          this.place(t, p, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 3.4, { cover: 'window' });
        }
      }
    }

    // Roof: AT teams behind the parapet, and a mortar pit amidships.
    for (let i = 0; i < 3; i++) {
      const z = origin.z + z0 + 16 + i * 20;
      this.place('at', new THREE.Vector3(origin.x, groundY + roof + 7.2, z), 0, 8,
        { cover: 'roof' });
    }
    for (const off of [10, 44, 62]) {
      this.place('mortar',
        new THREE.Vector3(origin.x + 6.5, groundY + roof + 1.4, origin.z + z0 + off),
        0, 7, { cover: 'roof' });
    }
  }

  /**
   * Taj Mahal. The shape of the building dictates the shape of the defence:
   * long open sightlines across the plinth, the four great iwans as covered
   * fighting positions, snipers on 41 m minarets, and mortars on the tomb roof
   * lobbing over the dome at anything working round the back.
   */
  populateTajMahal(origin, groundY, counts = {}) {
    const PLINTH = 95.5;
    const PLINTH_H = 7.0;
    const HALF = 28.5;
    const ROOF = PLINTH_H + 33.0;

    // Sandbagged positions along the plinth parapet.
    const perimeter = counts.plinth ?? 16;
    for (let i = 0; i < perimeter; i++) {
      const a = (i / perimeter) * Math.PI * 2;
      const half = PLINTH / 2 - 2.5;
      const c = Math.cos(a), sn = Math.sin(a);
      const m = Math.max(Math.abs(c), Math.abs(sn));
      const p = new THREE.Vector3(
        origin.x + (c / m) * half, groundY + PLINTH_H + 1.0, origin.z + (sn / m) * half,
      );
      this.place(i % 3 === 0 ? 'mg' : 'rifleman', p, Math.atan2(c, sn), 7,
        { cover: 'ground', sandbags: true });
    }

    // The four great iwans — deep covered recesses looking straight down each
    // approach. Set back inside the arch so the reveal is real cover.
    for (const [nx, nz, yaw] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
      for (const off of [-5, 0, 5]) {
        const p = new THREE.Vector3(
          origin.x + nx * (HALF - 3.2) - nz * off,
          groundY + PLINTH_H + 1.6,
          origin.z + nz * (HALF - 3.2) + nx * off,
        );
        this.place(off === 0 ? 'mg' : 'rifleman', p, yaw, 7, { cover: 'window' });
      }
      // A second storey of pierced screens above each iwan.
      const q = new THREE.Vector3(
        origin.x + nx * (HALF - 1.2), groundY + PLINTH_H + 21.0, origin.z + nz * (HALF - 1.2),
      );
      this.place('sniper', q, yaw, 6, { cover: 'window' });
    }

    // Tomb roof: AT teams at the corners, mortars beside the drum.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = new THREE.Vector3(
        origin.x + sx * 21, groundY + ROOF + 2.0, origin.z + sz * 21,
      );
      this.place('at', p, Math.atan2(sx, sz), 9, { cover: 'roof' });
    }
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this.place('mortar',
        new THREE.Vector3(origin.x + sx * 15, groundY + ROOF + 2.0, origin.z + sz * 15),
        Math.atan2(sx, sz), 9, { cover: 'roof' });
    }

    // Minaret tops: snipers, 41 m up, seeing everything.
    const base = PLINTH / 2 - 6.0;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = new THREE.Vector3(
        origin.x + sx * (base + 0.9), groundY + PLINTH_H + 43.0, origin.z + sz * (base + 0.9),
      );
      this.place('sniper', p, Math.atan2(sx, sz), 9, { cover: 'roof' });
      const q = new THREE.Vector3(
        origin.x + sx * (base + 0.4), groundY + PLINTH_H + 24.0, origin.z + sz * (base + 0.4),
      );
      this.place('mg', q, Math.atan2(sx, sz), 8, { cover: 'window' });
    }

    // Mosque and jawab roofs.
    for (const side of [-1, 1]) {
      for (const off of [-16, 0, 16]) {
        const p = new THREE.Vector3(origin.x + side * 88, groundY + 19.5, origin.z + off);
        this.place(off === 0 ? 'mortar' : 'rifleman', p, side > 0 ? Math.PI / 2 : -Math.PI / 2, 9,
          { cover: 'roof' });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────── combat ──

  get aliveCount() { return this.defenders.reduce((n, d) => n + (d.alive ? 1 : 0), 0); }

  countsByType() {
    const out = {};
    for (const d of this.defenders) {
      if (!d.alive) continue;
      out[d.type] = (out[d.type] || 0) + 1;
    }
    return out;
  }

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

      const best = this._acquire(d, playerUnits, structures);
      if (!best) { d.cooldown = 0.4; continue; }

      const dist = d.pos.distanceTo(best.pos);
      // Accuracy falls off with range.
      const hitChance = d.def.accuracy * (1 - 0.55 * (dist / d.def.range));
      const hit = Math.random() < hitChance;

      const damage = d.def.damage * this.damageScale;
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
    for (const d of this.defenders) {
      if (!d.alive || !d.def.indirect) continue;
      d.cooldown -= dt;
      if (d.cooldown > 0) continue;
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
      const aim = best.pos.clone();
      aim.x += (Math.random() - 0.5) * 11;
      aim.z += (Math.random() - 0.5) * 11;
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
      d.cooldown = d.def.rof * (0.75 + Math.random() * 0.5);
      this.mortarsFired++;
      if (this.onMortarFire) this.onMortarFire(d);
    }
  }

  /** Rebuild the instance buffers. Only live defenders are drawn. */
  sync() {
    let w = 0, mw = 0, bw = 0;
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

      if (d.sandbags && bw < this.bagMesh.instanceMatrix.count) {
        this._m4.compose(this._v, this._q, this._s);
        this.bagMesh.setMatrixAt(bw, this._m4);
        this._col.setHex(0x8b8163);
        this.bagMesh.instanceColor.setXYZ(bw, this._col.r, this._col.g, this._col.b);
        bw++;
      }

      this._m4.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(w, this._m4);
      this._col.setHex(d.def.colour);
      this.mesh.instanceColor.setXYZ(w, this._col.r, this._col.g, this._col.b);
      w++;
    }
    this.mesh.count = w;
    this.mortarMesh.count = mw;
    this.bagMesh.count = bw;
    for (const m of [this.mesh, this.mortarMesh, this.bagMesh]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }
}
