import * as THREE from 'three';

/**
 * The city burning.
 *
 * The town round the monument was scenery with colliders: a shell that hit a
 * terrace stopped against it and left it exactly as it was, which is the one
 * thing high explosive never does to a building. The town does not crumble —
 * a thousand buildings' worth of rubble is a thousand rigid bodies the phones
 * cannot carry, and the masonry that matters already comes down stone by stone
 * — but it burns. A hit that gets through goes off inside, and what is left
 * standing is the shell of the building: soot-black walls, the windows dark,
 * fire on the roof for a while and a column of smoke after.
 *
 * The whole town is two merged meshes, so a building is not an object that
 * can be given a new material. It is a range of vertices, and each vertex
 * carries a `aBurn` attribute the building material reads: one turns the
 * facade to char and puts its lit windows out. Burning a building is writing
 * ones into its range. The colliders stay, because a burnt-out block still
 * stops a shell.
 *
 * Small buildings go on the first hit; a block takes two or three. Bombs
 * take everything under the blast.
 */
export class CityFire {
  /**
   * @param {object} o
   * @param {THREE.Group} o.cityGroup  the context group, carrying `plots` and `cityMeshes`
   * @param {object} o.fx              ExplosionFX
   * @param {object} o.fires           Fires
   * @param {object} o.audio
   */
  constructor({ cityGroup, fx, fires, audio }) {
    this.plots = (cityGroup && cityGroup.userData.plots) || [];
    this.meshes = (cityGroup && cityGroup.userData.cityMeshes) || [];
    this.fx = fx;
    this.fires = fires;
    this.audio = audio;
    this.burnt = 0;
    this._v = new THREE.Vector3();

    // A grid over the plots: an impact asks "which building is this" once,
    // but a bomb asks for everything within sixty metres.
    this.CELL = 48;
    this.grid = new Map();
    for (let i = 0; i < this.plots.length; i++) {
      const p = this.plots[i];
      p.index = i;
      const r = Math.hypot(p.w, p.d) / 2 + 2;
      for (let cx = Math.floor((p.x - r) / this.CELL); cx <= Math.floor((p.x + r) / this.CELL); cx++) {
        for (let cz = Math.floor((p.z - r) / this.CELL); cz <= Math.floor((p.z + r) / this.CELL); cz++) {
          const k = cx * 8192 + cz;
          let b = this.grid.get(k);
          if (!b) this.grid.set(k, b = []);
          b.push(i);
        }
      }
    }
  }

  /** The building standing at `point`, if one is — the box padded by `pad`. */
  plotAt(point, pad = 1.6) {
    const cx = Math.floor(point.x / this.CELL), cz = Math.floor(point.z / this.CELL);
    let best = null, bestD = Infinity;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const b = this.grid.get((cx + ox) * 8192 + (cz + oz));
        if (!b) continue;
        for (const i of b) {
          const p = this.plots[i];
          const top = p.top ?? (p.base + p.h);
          if (point.y < p.base - 1.5 || point.y > top + 2.5) continue;
          const dx = point.x - p.x, dz = point.z - p.z;
          const ca = Math.cos(p.yaw || 0), sa = Math.sin(p.yaw || 0);
          const lx = Math.abs(dx * ca - dz * sa) - p.w / 2;
          const lz = Math.abs(dx * sa + dz * ca) - p.d / 2;
          const d = Math.max(lx, lz);
          if (d < pad && d < bestD) { best = p; bestD = d; }
        }
      }
    }
    return best;
  }

  /**
   * A round has arrived at `point`. Returns the building it burnt, the one
   * it damaged, or null if it hit nothing of the town's.
   */
  hit(point, warhead) {
    const p = this.plotAt(point);
    if (!p) return null;
    if (p.burnt) return { plot: p, burnt: false };
    // What it takes: a house goes on one shell, a block on two or three. A
    // warhead's blast radius is the honest measure of its charge here — a
    // mortar bomb is eight, a heavy howitzer twenty-odd.
    p.dmg = (p.dmg || 0) + Math.max(4, warhead.radius || 8);
    const need = 5 + Math.min(p.w, p.d) * 0.3 + Math.min(p.h, 40) * 0.12;
    if (p.dmg < need) {
      // Not yet. A puff of dust and a scorch on the wall would be right;
      // the detonation the caller already draws is most of that.
      return { plot: p, burnt: false };
    }
    this.burn(p);
    return { plot: p, burnt: true };
  }

  /** A bomb: everything under it goes. */
  blast(point, radius) {
    const cx = Math.floor(point.x / this.CELL), cz = Math.floor(point.z / this.CELL);
    const reach = Math.ceil(radius / this.CELL);
    const seen = new Set();
    let n = 0;
    for (let ox = -reach; ox <= reach; ox++) {
      for (let oz = -reach; oz <= reach; oz++) {
        const b = this.grid.get((cx + ox) * 8192 + (cz + oz));
        if (!b) continue;
        for (const i of b) {
          if (seen.has(i)) continue;
          seen.add(i);
          const p = this.plots[i];
          if (p.burnt) continue;
          // Within the blast by the near edge of the building, not its centre:
          // a long terrace with one end in the fire is in the fire.
          const dx = point.x - p.x, dz = point.z - p.z;
          const ca = Math.cos(p.yaw || 0), sa = Math.sin(p.yaw || 0);
          const lx = Math.max(0, Math.abs(dx * ca - dz * sa) - p.w / 2);
          const lz = Math.max(0, Math.abs(dx * sa + dz * ca) - p.d / 2);
          if (Math.hypot(lx, lz) > radius) continue;
          this.burn(p, 0.15 + Math.hypot(lx, lz) / radius * 0.8);
          n++;
        }
      }
    }
    return n;
  }

  /**
   * Gut the building. The walls go to char, the windows go dark, the roof
   * catches, and the smoke stands over it.
   */
  burn(p, quiet = 1) {
    p.burnt = true;
    this.burnt++;
    for (const m of this.meshes) {
      const ranges = m.userData.plotRanges && m.userData.plotRanges.get(p.index);
      if (!ranges) continue;
      const a = m.geometry.attributes.aBurn;
      if (!a) continue;
      for (const [start, count] of ranges) {
        for (let i = start; i < start + count; i++) a.setX(i, 1);
      }
      a.needsUpdate = true;
    }
    const top = p.top ?? (p.base + p.h);
    const size = Math.hypot(p.w, p.d);
    if (this.fx) {
      // The charge goes off inside; the fireball comes out of the windows.
      this._v.set(p.x, p.base + Math.min(p.h, 40) * 0.55, p.z);
      this.fx.detonate(this._v, (1.8 + size * 0.03) * quiet, { ground: false });
      this.fx.dustColumn(p.x, top, p.z, (0.45 + size * 0.012) * quiet);
    }
    if (this.fires) {
      // Fire along the roof: one for a house, several for a block.
      const n = Math.max(1, Math.min(4, Math.round(size / 20)));
      const ca = Math.cos(p.yaw || 0), sa = Math.sin(p.yaw || 0);
      for (let i = 0; i < n; i++) {
        const u = (n === 1 ? 0 : (i / (n - 1) - 0.5)) * p.w * 0.6;
        const v = (Math.random() - 0.5) * p.d * 0.5;
        const fx = p.x + u * ca + v * sa, fz = p.z - u * sa + v * ca;
        this.fires.ignite(fx, top - 0.4, fz, 1.4 + size * 0.02, 45 + size * 1.5);
      }
    }
    if (this.audio) {
      this._v.set(p.x, top, p.z);
      this.audio.play('explosion', this._v, { rate: 0.72, gain: 0.55 + Math.min(0.4, size * 0.006), rolloff: 420 });
    }
  }
}
