import * as THREE from 'three';

/**
 * A coarse solidity grid over a structure, so anything in the game can ask
 * "can I see from here to there?" without touching the physics broad phase.
 *
 * Defenders used to shoot straight through the building they were standing in:
 * a man at a north window could hit a gun parked to the south, through ninety
 * metres of marble. A firing arc hid the worst of it but could never fix it,
 * because the arc is about where a man is facing and this is about what is in
 * the way.
 *
 * The grid holds, per cell, how many *intact* stones overlap it. Stones are
 * added once at construction and decremented when they are destroyed or come
 * loose, which is O(cells-per-stone) — one or two — so maintenance is free.
 * A query is a 3D DDA across the cells the segment crosses, which for a shot
 * across the Taj is a few dozen array reads.
 *
 * Deliberately coarse (2 m): the question is "is there a building in the way",
 * not "does this round clear the mullion by 3 cm". Anything finer would make
 * defenders fire through arrow slits and cost more to maintain.
 */

const CELL = 2.0;

export class Occupancy {
  /** @param {import('./structure.js').Structure} st */
  constructor(st, cell = CELL) {
    this.cell = cell;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const n = st.count;
    const ax = st._aabbX, az = st._aabbZ;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, st.px[i] - ax[i]); maxX = Math.max(maxX, st.px[i] + ax[i]);
      minY = Math.min(minY, st.py[i] - st.hy[i]); maxY = Math.max(maxY, st.py[i] + st.hy[i]);
      minZ = Math.min(minZ, st.pz[i] - az[i]); maxZ = Math.max(maxZ, st.pz[i] + az[i]);
    }
    if (!isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 1; }

    this.min = new THREE.Vector3(minX - cell, minY - cell, minZ - cell);
    this.max = new THREE.Vector3(maxX + cell, maxY + cell, maxZ + cell);
    this.nx = Math.max(1, Math.ceil((this.max.x - this.min.x) / cell));
    this.ny = Math.max(1, Math.ceil((this.max.y - this.min.y) / cell));
    this.nz = Math.max(1, Math.ceil((this.max.z - this.min.z) / cell));
    this.counts = new Uint16Array(this.nx * this.ny * this.nz);
    this.solidCells = 0;

    for (let i = 0; i < n; i++) if (st.flags[i] & 1) this.addChunk(st, i, 1);
  }

  _index(x, y, z) { return (y * this.nz + z) * this.nx + x; }

  /** Rasterise one stone's world AABB into the grid. `delta` is +1 or -1. */
  addChunk(st, i, delta) {
    const ax = st._aabbX[i], az = st._aabbZ[i], ay = st.hy[i];
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((st.px[i] - ax - this.min.x) / c));
    const x1 = Math.min(this.nx - 1, Math.floor((st.px[i] + ax - this.min.x) / c));
    const y0 = Math.max(0, Math.floor((st.py[i] - ay - this.min.y) / c));
    const y1 = Math.min(this.ny - 1, Math.floor((st.py[i] + ay - this.min.y) / c));
    const z0 = Math.max(0, Math.floor((st.pz[i] - az - this.min.z) / c));
    const z1 = Math.min(this.nz - 1, Math.floor((st.pz[i] + az - this.min.z) / c));
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const row = (y * this.nz + z) * this.nx;
        for (let x = x0; x <= x1; x++) {
          const k = row + x;
          const was = this.counts[k];
          if (delta > 0) {
            this.counts[k] = was + 1;
            if (was === 0) this.solidCells++;
          } else if (was > 0) {
            this.counts[k] = was - 1;
            if (was === 1) this.solidCells--;
          }
        }
      }
    }
  }

  /**
   * Does a segment pass through solid masonry?
   *
   * `skipStart` and `skipEnd` are metres trimmed off each end, so a defender
   * standing in a window embrasure is not blocked by his own sill, and a shot
   * at a unit resting against a wall still connects.
   */
  blocked(from, to, skipStart = 1.4, skipEnd = 0.6) {
    if (this.solidCells === 0) return false;

    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return false;
    const ux = dx / len, uy = dy / len, uz = dz / len;

    let t0 = Math.min(skipStart, len);
    let t1 = Math.max(t0, len - skipEnd);

    // Clip the segment to the grid box first; most shots never enter it.
    const clip = this._clip(from, ux, uy, uz, t0, t1);
    if (!clip) return false;
    t0 = clip[0]; t1 = clip[1];

    const c = this.cell;
    let px = from.x + ux * t0, py = from.y + uy * t0, pz = from.z + uz * t0;
    let ix = Math.floor((px - this.min.x) / c);
    let iy = Math.floor((py - this.min.y) / c);
    let iz = Math.floor((pz - this.min.z) / c);
    ix = clampInt(ix, 0, this.nx - 1);
    iy = clampInt(iy, 0, this.ny - 1);
    iz = clampInt(iz, 0, this.nz - 1);

    const stepX = ux > 0 ? 1 : -1, stepY = uy > 0 ? 1 : -1, stepZ = uz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(ux) < 1e-9 ? Infinity : Math.abs(c / ux);
    const tDeltaY = Math.abs(uy) < 1e-9 ? Infinity : Math.abs(c / uy);
    const tDeltaZ = Math.abs(uz) < 1e-9 ? Infinity : Math.abs(c / uz);

    // Distance along the ray to the first cell boundary on each axis
    // (Amanatides & Woo). The boundary is the far face in the step direction.
    const firstCross = (i, p, u, step, minV) => {
      if (Math.abs(u) < 1e-9) return Infinity;
      const edge = minV + (i + (step > 0 ? 1 : 0)) * c;
      return t0 + (edge - p) / u;
    };
    let tMaxX = firstCross(ix, px, ux, stepX, this.min.x);
    let tMaxY = firstCross(iy, py, uy, stepY, this.min.y);
    let tMaxZ = firstCross(iz, pz, uz, stepZ, this.min.z);

    let guard = 0;
    const maxSteps = (this.nx + this.ny + this.nz) * 2 + 8;
    let t = t0;
    while (t <= t1 && guard++ < maxSteps) {
      if (this.counts[this._index(ix, iy, iz)] > 0) return true;
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        ix += stepX; t = tMaxX; tMaxX += tDeltaX;
        if (ix < 0 || ix >= this.nx) return false;
      } else if (tMaxY <= tMaxZ) {
        iy += stepY; t = tMaxY; tMaxY += tDeltaY;
        if (iy < 0 || iy >= this.ny) return false;
      } else {
        iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
        if (iz < 0 || iz >= this.nz) return false;
      }
    }
    return false;
  }

  /** Slab clip of the ray against the grid's box, within [t0, t1]. */
  _clip(o, ux, uy, uz, t0, t1) {
    const axes = [
      [o.x, ux, this.min.x, this.max.x],
      [o.y, uy, this.min.y, this.max.y],
      [o.z, uz, this.min.z, this.max.z],
    ];
    let lo = t0, hi = t1;
    for (const [p, u, mn, mx] of axes) {
      if (Math.abs(u) < 1e-9) {
        if (p < mn || p > mx) return null;
        continue;
      }
      let a = (mn - p) / u, b = (mx - p) / u;
      if (a > b) { const s = a; a = b; b = s; }
      lo = Math.max(lo, a); hi = Math.min(hi, b);
      if (lo > hi) return null;
    }
    return [lo, hi];
  }

  /** Solid-cell test at a world point, for placing things inside a building. */
  solidAt(x, y, z) {
    const c = this.cell;
    const ix = Math.floor((x - this.min.x) / c);
    const iy = Math.floor((y - this.min.y) / c);
    const iz = Math.floor((z - this.min.z) / c);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= this.nx || iy >= this.ny || iz >= this.nz) return false;
    return this.counts[this._index(ix, iy, iz)] > 0;
  }
}

function clampInt(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Is the line between two points clear of every structure in the level? */
export function lineOfSight(structures, from, to, skipStart = 1.4, skipEnd = 0.6) {
  for (const s of structures) {
    if (s.occupancy && s.occupancy.blocked(from, to, skipStart, skipEnd)) return false;
  }
  return true;
}
