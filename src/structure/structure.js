import * as THREE from 'three';
import { MATERIALS, MATERIAL_PROPS } from './builder.js';
import { Occupancy } from './occupancy.js';

/**
 * A destructible masonry structure.
 *
 * Three ideas carry the whole thing:
 *
 * 1. **One static body.** Every intact stone is a collider on a single fixed
 *    rigid body. Rapier stores them in the broad phase but integrates nothing,
 *    so an intact 7,000-stone tower costs essentially zero per step.
 *
 * 2. **A real load path.** Stones know which stones sit on them. Each solver
 *    pass pushes weight downward through that graph and pulls support upward
 *    from the foundations. Shell a column and the load it was carrying moves
 *    onto its neighbours; overload them and they fail too. That cascade is the
 *    progressive collapse — it is not scripted anywhere.
 *
 * 3. **Island welding.** When a large section detaches, simulating 3,000 loose
 *    stones is neither affordable nor accurate — real masonry sections topple
 *    as a slab and shatter on impact. So a detached group becomes ONE dynamic
 *    body carrying all its colliders, and fragments progressively each time it
 *    lands hard. A phone gets the same toppling spire as a desktop; it just
 *    fragments into fewer pieces on the way down.
 */

const ALIVE = 1;
const FREE = 2;       // has its own dynamic rigid body
const GROUNDED = 4;   // foundation stone, an anchor for the support search
const ISLAND = 8;     // member of a welded island
const SETTLED = 16;

const EPS = 0.075;          // joint tolerance when deciding adjacency
const WELD_THRESHOLD = 26;  // above this, a detached group welds instead of freeing

// How many stones bearing support may travel sideways along a course. Four is
// enough for a lintel or a slab between close supports, and short enough that a
// wall cut through at its base still comes down.
const LATERAL_SPAN = 4;

export class Structure {
  /**
   * @param {import('../core/physics.js').PhysicsWorld} physics
   * @param {import('./builder.js').BlockList} blockList
   */
  constructor(physics, blockList, opts = {}) {
    this.physics = physics;
    this.rapier = physics.rapier;
    this.quality = physics.quality;
    this.groundY = opts.groundY ?? 0;
    this.origin = opts.origin ?? new THREE.Vector3();
    this.tagRanges = blockList.tagRanges;
    this.onChunkDestroyed = opts.onChunkDestroyed || null;
    this.onIslandImpact = opts.onIslandImpact || null;

    const blocks = blockList.blocks;
    const n = blocks.length;
    this.count = n;

    // ── Struct-of-arrays. Keeps the solver passes cache friendly and avoids
    // allocating anything per stone per frame.
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.hx = new Float32Array(n); this.hy = new Float32Array(n); this.hz = new Float32Array(n);
    this.ry = new Float32Array(n);
    this.mat = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.health = new Float32Array(n);
    this.maxHealth = new Float32Array(n);
    this.mass = new Float32Array(n);
    this.load = new Float32Array(n);
    this.strength = new Float32Array(n);
    this.structural = new Uint8Array(n);
    this.colliderOf = new Int32Array(n).fill(-1);
    this.bodyOf = new Array(n).fill(null);
    this.islandOf = new Int32Array(n).fill(-1);
    this.tagOf = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      const b = blocks[i];
      this.px[i] = b.x + this.origin.x;
      this.py[i] = b.y + this.origin.y;
      this.pz[i] = b.z + this.origin.z;
      this.hx[i] = b.hx; this.hy[i] = b.hy; this.hz[i] = b.hz;
      this.ry[i] = b.ry || 0;
      this.mat[i] = b.mat;
      this.tagOf[i] = b.tag;

      const props = MATERIAL_PROPS[b.mat];
      this.structural[i] = props.structural ? 1 : 0;
      const vol = 8 * b.hx * b.hy * b.hz;
      this.mass[i] = vol * props.density * 1000; // tonnes -> kg
      // Health scales with volume so a big foundation block genuinely shrugs
      // off what shatters a clock-face mullion.
      this.maxHealth[i] = props.toughness * Math.pow(vol, 0.62) * 21.0;
      this.health[i] = this.maxHealth[i];
      this.flags[i] = ALIVE;
      if (this.py[i] - this.hy[i] <= this.groundY + 0.45) this.flags[i] |= GROUNDED;
    }

    // Scratch buffers reused by the solver and the transform sync — allocated
    // before mesh construction, which writes the first batch of matrices.
    this._reach = new Uint8Array(n);
    this._stack = new Int32Array(n);
    this._comp = new Int32Array(n);
    this._spanBudget = new Uint8Array(n);
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();

    this._buildAdjacency();
    this._groutOrphans();
    this._buildStaticBody();
    this._buildMeshes();

    // Solidity grid for line-of-sight. Built after the grout pass so stones
    // that were never part of the building don't block anyone's shot, and
    // maintained from `_detachCollider`, which is the single point every stone
    // passes through on its way out of the standing structure.
    this._inGrid = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (this.flags[i] & ALIVE) this._inGrid[i] = 1;
    this.occupancy = new Occupancy(this);

    this.islands = new Map();
    this._nextIslandId = 1;
    this.stabilityDirty = true;
    this.destroyedCount = 0;
    // Stones culled by the grout pass were never part of the building, so they
    // must not count toward the mass the player has to bring down.
    let total = 0;
    for (let i = 0; i < n; i++) if (this.flags[i] & ALIVE) total += this.mass[i];
    this.totalMass = total;
    this.aliveMass = total;
    this.fallenMass = 0;

    this.solveStability(true);
  }

  // ────────────────────────────────────────────────────────── construction ──

  /**
   * Adjacency by AABB overlap, found with a uniform spatial hash. Also splits
   * the graph into "who is below me" and "who is above me", which is what the
   * load pass walks.
   */
  _buildAdjacency() {
    const n = this.count;

    // World-space AABB half-extents. A yawed box is wider in world axes than
    // its own half-extents, and testing with the unrotated ones silently
    // under-connects every curved wall — a drum or dome laid with polyRing
    // ends up with half the neighbours it should have, and the support solver
    // then believes it is hanging in mid-air.
    const ax = new Float32Array(n);
    const az = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = Math.abs(Math.cos(this.ry[i]));
      const sn = Math.abs(Math.sin(this.ry[i]));
      ax[i] = this.hx[i] * c + this.hz[i] * sn;
      az[i] = this.hx[i] * sn + this.hz[i] * c;
    }
    this._aabbX = ax;
    this._aabbZ = az;

    let cell = 0;
    for (let i = 0; i < n; i++) cell = Math.max(cell, ax[i], this.hy[i], az[i]);
    cell = Math.max(cell * 2.2, 0.8);
    this.cellSize = cell;

    const grid = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    const cellRange = (i) => ({
      x0: Math.floor((this.px[i] - ax[i] - EPS) / cell),
      x1: Math.floor((this.px[i] + ax[i] + EPS) / cell),
      y0: Math.floor((this.py[i] - this.hy[i] - EPS) / cell),
      y1: Math.floor((this.py[i] + this.hy[i] + EPS) / cell),
      z0: Math.floor((this.pz[i] - az[i] - EPS) / cell),
      z1: Math.floor((this.pz[i] + az[i] + EPS) / cell),
    });

    for (let i = 0; i < n; i++) {
      const r = cellRange(i);
      for (let x = r.x0; x <= r.x1; x++)
        for (let y = r.y0; y <= r.y1; y++)
          for (let z = r.z0; z <= r.z1; z++) {
            const k = key(x, y, z);
            let list = grid.get(k);
            if (!list) grid.set(k, (list = []));
            list.push(i);
          }
    }

    const overlaps = (i, j) =>
      Math.abs(this.px[i] - this.px[j]) <= ax[i] + ax[j] + EPS &&
      Math.abs(this.py[i] - this.py[j]) <= this.hy[i] + this.hy[j] + EPS &&
      Math.abs(this.pz[i] - this.pz[j]) <= az[i] + az[j] + EPS;

    const neighbours = new Array(n);
    let edgeCount = 0;
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const r = cellRange(i);
      seen.clear();
      const out = [];
      for (let x = r.x0; x <= r.x1; x++)
        for (let y = r.y0; y <= r.y1; y++)
          for (let z = r.z0; z <= r.z1; z++) {
            const list = grid.get(key(x, y, z));
            if (!list) continue;
            for (const j of list) {
              if (j === i || seen.has(j)) continue;
              seen.add(j);
              if (overlaps(i, j)) out.push(j);
            }
          }
      neighbours[i] = out;
      edgeCount += out.length;
    }

    // Flatten to CSR.
    this.adjStart = new Int32Array(n + 1);
    this.adjList = new Int32Array(edgeCount);
    let cursor = 0;
    for (let i = 0; i < n; i++) {
      this.adjStart[i] = cursor;
      for (const j of neighbours[i]) this.adjList[cursor++] = j;
    }
    this.adjStart[n] = cursor;

    // Directed "below" lists: j supports i when j's centre is meaningfully
    // lower and their footprints overlap in plan.
    const below = new Array(n);
    let belowEdges = 0;
    for (let i = 0; i < n; i++) {
      const out = [];
      for (let a = this.adjStart[i]; a < this.adjStart[i + 1]; a++) {
        const j = this.adjList[a];
        if (this.py[j] < this.py[i] - Math.min(this.hy[i], this.hy[j]) * 0.5) out.push(j);
      }
      below[i] = out;
      belowEdges += out.length;
    }
    this.belowStart = new Int32Array(n + 1);
    this.belowList = new Int32Array(belowEdges);
    cursor = 0;
    for (let i = 0; i < n; i++) {
      this.belowStart[i] = cursor;
      for (const j of below[i]) this.belowList[cursor++] = j;
    }
    this.belowStart[n] = cursor;

    // Same-course neighbours, which is how a lintel or a slab carries across a
    // gap. Deliberately excludes anything above: masonry spans sideways, it
    // does not hang from the storey over its head.
    const side = new Array(n);
    let sideEdges = 0;
    for (let i = 0; i < n; i++) {
      const out = [];
      for (let a = this.adjStart[i]; a < this.adjStart[i + 1]; a++) {
        const j = this.adjList[a];
        if (Math.abs(this.py[j] - this.py[i]) < Math.min(this.hy[i], this.hy[j]) * 0.5) out.push(j);
      }
      side[i] = out;
      sideEdges += out.length;
    }
    this.sideStart = new Int32Array(n + 1);
    this.sideList = new Int32Array(sideEdges);
    cursor = 0;
    for (let i = 0; i < n; i++) {
      this.sideStart[i] = cursor;
      for (const j of side[i]) this.sideList[cursor++] = j;
    }
    this.sideStart[n] = cursor;

    // Top-down iteration order for the load pass.
    const py = this.py;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => py[b] - py[a]);
    this.heightOrder = Int32Array.from(order);

    // Bearing capacity: plan area x material strength.
    //
    // 14 MPa is the working compressive strength of coursed limestone masonry
    // — governed by the mortar joints, not the stone, which is nearer 50 MPa.
    // The figure matters: a 96 m tower puts only about 2.3 MPa on its lowest
    // course, so intact masonry must sit comfortably above that or the tower
    // crushes itself on the first frame. Capacity scales with health, so
    // damaged stone is what actually fails here — a column shelled to a
    // quarter strength drops below the load it used to carry, and its share
    // moves onto its neighbours. That is the progressive collapse.
    for (let i = 0; i < n; i++) {
      const area = 4 * this.hx[i] * this.hz[i];
      this.strength[i] = area * MATERIAL_PROPS[this.mat[i]].strength * 14e6;
    }

    this._buildBands();
  }

  /**
   * Horizontal slices through the structure, used by the overturning check.
   * Stored as CSR so the check can walk one band's stones without scanning
   * the whole building.
   */
  _buildBands() {
    const n = this.count;
    this.bandHeight = 3.0;
    this.bandOf = new Int32Array(n);
    let maxBand = 0;
    for (let i = 0; i < n; i++) {
      const b = Math.max(0, Math.floor((this.py[i] - this.groundY) / this.bandHeight));
      this.bandOf[i] = b;
      if (b > maxBand) maxBand = b;
    }
    this.bandCount = maxBand + 1;

    const counts = new Int32Array(this.bandCount + 1);
    for (let i = 0; i < n; i++) counts[this.bandOf[i]]++;
    this.bandStart = new Int32Array(this.bandCount + 1);
    let cursor = 0;
    for (let b = 0; b < this.bandCount; b++) { this.bandStart[b] = cursor; cursor += counts[b]; }
    this.bandStart[this.bandCount] = cursor;
    this.bandList = new Int32Array(n);
    const fill = Int32Array.from(this.bandStart);
    for (let i = 0; i < n; i++) this.bandList[fill[this.bandOf[i]]++] = i;

    // Intact bearing area per band, so the check can tell which bands have
    // actually been cut into.
    this.bandArea0 = new Float32Array(this.bandCount);
    for (let i = 0; i < n; i++) {
      if (!this.structural[i]) continue;
      this.bandArea0[this.bandOf[i]] += 4 * this.hx[i] * this.hz[i];
    }

    // Scratch for the overturning pass.
    this._bMass = new Float64Array(this.bandCount);
    this._bMomX = new Float64Array(this.bandCount);
    this._bMomZ = new Float64Array(this.bandCount);
    this._bArea = new Float64Array(this.bandCount);
    this._bSupX = new Float64Array(this.bandCount);
    this._bSupZ = new Float64Array(this.bandCount);
  }

  /**
   * Overturning.
   *
   * Connectivity alone says a tower with one wall shot away is still fine —
   * the remaining walls reach the ground, so nothing is "unsupported". Real
   * towers don't behave like that. Once the centre of mass of everything above
   * a cut moves outside what's left holding it up, the structure rotates about
   * the edge of its remaining bearing and goes over.
   *
   * So for each damaged slice we compare the centre of mass above it against
   * how far the surviving stone in that slice actually reaches in the direction
   * the mass has shifted. If the mass hangs out past the bearing, everything
   * above is released as one section — and then Rapier does the toppling, which
   * is why it falls in the direction you cut rather than a scripted one.
   *
   * This is what makes undercutting one face a real tactic.
   */
  _checkOverturning(reach) {
    const n = this.count;
    const B = this.bandCount;
    this._bMass.fill(0); this._bMomX.fill(0); this._bMomZ.fill(0);
    this._bArea.fill(0); this._bSupX.fill(0); this._bSupZ.fill(0);

    for (let i = 0; i < n; i++) {
      if (!reach[i]) continue;
      const b = this.bandOf[i];
      const m = this.mass[i];
      this._bMass[b] += m;
      this._bMomX[b] += this.px[i] * m;
      this._bMomZ[b] += this.pz[i] * m;
      if (this.structural[i]) {
        const a = 4 * this.hx[i] * this.hz[i];
        this._bArea[b] += a;
        this._bSupX[b] += this.px[i] * a;
        this._bSupZ[b] += this.pz[i] * a;
      }
    }

    // Walk down from the top, carrying the mass above each slice.
    let aboveMass = 0, aboveMomX = 0, aboveMomZ = 0;
    for (let b = B - 1; b >= 1; b--) {
      aboveMass += this._bMass[b];
      aboveMomX += this._bMomX[b];
      aboveMomZ += this._bMomZ[b];

      const area = this._bArea[b - 1];
      const area0 = this.bandArea0[b - 1];
      if (area0 <= 0 || area <= 0) continue;
      // Only slices that have actually lost bearing can overturn. The window
      // is generous because a tower can go over while most of its bearing
      // survives, if what survives is all on one side.
      if (area / area0 > 0.80) continue;
      if (aboveMass < 8000) continue; // ignore trivial caps

      const comX = aboveMomX / aboveMass;
      const comZ = aboveMomZ / aboveMass;
      const supX = this._bSupX[b - 1] / area;
      const supZ = this._bSupZ[b - 1] / area;

      let dx = comX - supX, dz = comZ - supZ;
      const off = Math.hypot(dx, dz);
      if (off < 0.35) continue; // still centred over its bearing
      dx /= off; dz /= off;

      // How far the surviving bearing reaches the way the mass has leaned.
      let reachOut = 0;
      const s0 = this.bandStart[b - 1], s1 = this.bandStart[b];
      for (let k = s0; k < s1; k++) {
        const j = this.bandList[k];
        if (!reach[j] || !this.structural[j]) continue;
        const ex = this.px[j] - supX, ez = this.pz[j] - supZ;
        const proj = ex * dx + ez * dz + Math.abs(this.hx[j] * dx) + Math.abs(this.hz[j] * dz);
        if (proj > reachOut) reachOut = proj;
      }

      // A safety factor keeps a slightly lopsided but genuinely stable tower
      // standing; past it, the overturning moment wins. It is deliberately
      // generous: the surviving bearing is measured in whole stones, so a
      // finely divided tower reports a cleaner cut than a coarse one from the
      // same shelling, and a tight margin would let the level fall noticeably
      // faster on better hardware.
      if (off <= reachOut * 1.35) continue;

      const doomed = [];
      for (let bb = b; bb < B; bb++) {
        for (let k = this.bandStart[bb]; k < this.bandStart[bb + 1]; k++) {
          const j = this.bandList[k];
          if (reach[j]) doomed.push(j);
        }
      }
      if (doomed.length === 0) continue;

      for (const j of doomed) reach[j] = 0;
      for (const group of this._connectedGroups(doomed)) this._releaseGroup(group);
      this.stabilityDirty = true;
      this.lastOverturnHeight = this.groundY + b * this.bandHeight;
      return doomed.length;
    }
    return 0;
  }

  /**
   * Tie in anything the AABB test left floating.
   *
   * Decorative stone — a dial rim, an arch springing, a pinnacle cap — often
   * sits a few centimetres clear of the mass it belongs to, and strict overlap
   * would drop it on frame one. Real buildings solve this with mortar and iron
   * cramps; we do the same, connecting each stranded stone to its nearest
   * supported neighbour. Anything with nothing at all within reach was never
   * attached to the building and is removed outright.
   *
   * Doing this at build time means the builders stay readable — they can place
   * ornament without hand-fitting every joint.
   */
  _groutOrphans() {
    const n = this.count;
    const extra = new Map(); // i -> Set(j) of added edges
    const addEdge = (i, j) => {
      if (!extra.has(i)) extra.set(i, new Set());
      if (!extra.has(j)) extra.set(j, new Set());
      extra.get(i).add(j);
      extra.get(j).add(i);
    };

    const neighboursOf = (i) => {
      const base = [];
      for (let a = this.adjStart[i]; a < this.adjStart[i + 1]; a++) base.push(this.adjList[a]);
      const ex = extra.get(i);
      if (ex) for (const j of ex) base.push(j);
      return base;
    };

    const reach = new Uint8Array(n);
    const flood = () => {
      reach.fill(0);
      const stack = [];
      for (let i = 0; i < n; i++) {
        if (this.flags[i] & GROUNDED) { reach[i] = 1; stack.push(i); }
      }
      while (stack.length) {
        const i = stack.pop();
        for (const j of neighboursOf(i)) {
          if (!reach[j]) { reach[j] = 1; stack.push(j); }
        }
      }
    };

    const dist2 = (i, j) => {
      // Gap between the two boxes, not between their centres — a long stone
      // next to a small one should still read as touching.
      const dx = Math.max(0, Math.abs(this.px[i] - this.px[j]) - this._aabbX[i] - this._aabbX[j]);
      const dy = Math.max(0, Math.abs(this.py[i] - this.py[j]) - this.hy[i] - this.hy[j]);
      const dz = Math.max(0, Math.abs(this.pz[i] - this.pz[j]) - this._aabbZ[i] - this._aabbZ[j]);
      return dx * dx + dy * dy + dz * dz;
    };

    const MAX_GAP = 1.35;
    const maxGap2 = MAX_GAP * MAX_GAP;
    let stranded = [];

    for (let pass = 0; pass < 6; pass++) {
      flood();
      stranded = [];
      for (let i = 0; i < n; i++) if (!reach[i]) stranded.push(i);
      if (stranded.length === 0) break;

      let joined = 0;
      for (const i of stranded) {
        let best = -1, bestD = maxGap2;
        // Search only supported stones; joining two floaters achieves nothing.
        for (let j = 0; j < n; j++) {
          if (j === i || !reach[j]) continue;
          const d = dist2(i, j);
          if (d < bestD) { bestD = d; best = j; }
        }
        if (best >= 0) { addEdge(i, best); reach[i] = 1; joined++; }
      }
      if (joined === 0) break;
    }

    // Whatever is still floating was never part of the building.
    flood();
    let culled = 0;
    for (let i = 0; i < n; i++) {
      if (!reach[i]) { this.flags[i] &= ~ALIVE; culled++; }
    }

    if (extra.size === 0 && culled === 0) return;

    // Rebuild the CSR arrays with the grout edges folded in.
    let edgeCount = 0;
    const lists = new Array(n);
    for (let i = 0; i < n; i++) {
      const seen = new Set();
      for (let a = this.adjStart[i]; a < this.adjStart[i + 1]; a++) seen.add(this.adjList[a]);
      const ex = extra.get(i);
      if (ex) for (const j of ex) seen.add(j);
      seen.delete(i);
      lists[i] = [...seen];
      edgeCount += lists[i].length;
    }
    this.adjStart = new Int32Array(n + 1);
    this.adjList = new Int32Array(edgeCount);
    let cursor = 0;
    for (let i = 0; i < n; i++) {
      this.adjStart[i] = cursor;
      for (const j of lists[i]) this.adjList[cursor++] = j;
    }
    this.adjStart[n] = cursor;

    // The "below" lists must agree with the new graph or load will route
    // through joints the support pass no longer believes in.
    const below = new Array(n);
    let belowEdges = 0;
    for (let i = 0; i < n; i++) {
      const out = [];
      for (const j of lists[i]) {
        if (this.py[j] < this.py[i] - Math.min(this.hy[i], this.hy[j]) * 0.5) out.push(j);
      }
      below[i] = out;
      belowEdges += out.length;
    }
    this.belowStart = new Int32Array(n + 1);
    this.belowList = new Int32Array(belowEdges);
    cursor = 0;
    for (let i = 0; i < n; i++) {
      this.belowStart[i] = cursor;
      for (const j of below[i]) this.belowList[cursor++] = j;
    }
    this.belowStart[n] = cursor;

    this.groutedEdges = extra.size;
    this.culledStones = culled;
  }

  _buildStaticBody() {
    const rapier = this.rapier;
    const world = this.physics.world;
    const desc = rapier.RigidBodyDesc.fixed();
    this.staticBody = world.createRigidBody(desc);

    this.colliderToChunk = new Map();
    for (let i = 0; i < this.count; i++) {
      if (this.flags[i] & ALIVE) this._attachStaticCollider(i);
    }
  }

  _attachStaticCollider(i) {
    const rapier = this.rapier;
    const q = this._quatFor(i);
    const cd = rapier.ColliderDesc.cuboid(this.hx[i], this.hy[i], this.hz[i])
      .setTranslation(this.px[i], this.py[i], this.pz[i])
      .setRotation(q)
      .setFriction(0.95)
      .setRestitution(0.01)
      .setDensity(MATERIAL_PROPS[this.mat[i]].density);
    const col = this.physics.world.createCollider(cd, this.staticBody);
    this.colliderOf[i] = col.handle;
    this.colliderToChunk.set(col.handle, i);
    return col;
  }

  _quatFor(i) {
    const h = this.ry[i] * 0.5;
    return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
  }

  _topY() {
    let y = -Infinity;
    for (let i = 0; i < this.count; i++) if (this.flags[i] & ALIVE) y = Math.max(y, this.py[i]);
    return isFinite(y) ? y : this.groundY + 1;
  }

  _buildMeshes() {
    // One InstancedMesh per material; a unit cube scaled per instance.
    const byMat = new Map();
    for (let i = 0; i < this.count; i++) {
      let arr = byMat.get(this.mat[i]);
      if (!arr) byMat.set(this.mat[i], (arr = []));
      arr.push(i);
    }

    this.group = new THREE.Group();
    this.meshes = [];
    this.meshIndexOf = new Int32Array(this.count);
    this.instanceIndexOf = new Int32Array(this.count);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const shadows = this.quality.shadowMapSize > 0;

    for (const [matId, list] of byMat) {
      const props = MATERIAL_PROPS[matId];
      const material = new THREE.MeshStandardMaterial({
        // White base: the per-stone instanceColor below already carries the
        // material's colour. Setting it here too multiplies the two and the
        // whole building comes out muddy and dark.
        color: 0xffffff,
        roughness: matId === MATERIALS.GLASS ? 0.12
          : matId === MATERIALS.IRON ? 0.52
            : matId === MATERIALS.GILT ? 0.28 : 0.88,
        metalness: matId === MATERIALS.IRON ? 0.75
          : matId === MATERIALS.GILT ? 0.9 : 0.02,
      });
      if (matId === MATERIALS.GLASS) {
        material.emissive = new THREE.Color(0xffeec2);
        material.emissiveIntensity = 0.85;
      }
      if (matId === MATERIALS.GILT) {
        material.emissive = new THREE.Color(0x3a2a08);
        material.emissiveIntensity = 1.0;
      }

      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      const colors = new Float32Array(list.length * 3);
      const meshIdx = this.meshes.length;
      const c = new THREE.Color();
      const hsl = { h: 0, s: 0, l: 0 };
      const yLo = this.groundY;
      const yHi = this._topY();
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        this.meshIndexOf[i] = meshIdx;
        this.instanceIndexOf[i] = k;

        c.setHex(props.color);
        c.getHSL(hsl);

        // Per-stone tonal *and* hue variation. Value alone reads as plastic
        // lit badly; a few degrees of hue scatter reads as quarried stone.
        const r1 = hash01(i), r2 = hash01(i * 2654435761 + 7);
        hsl.h = (hsl.h + (r1 - 0.5) * 0.035 + 1) % 1;
        hsl.s = THREE.MathUtils.clamp(hsl.s * (0.78 + r2 * 0.62), 0, 1);
        hsl.l = THREE.MathUtils.clamp(hsl.l * (0.86 + r1 * 0.30), 0, 1);

        // Ambient occlusion, free: a stone's neighbour count already says how
        // enclosed it is. Deep-set stones in a reveal or an arcade darken,
        // exposed corners and parapets stay bright. This is most of what gives
        // the masonry depth, and it costs one subtraction per stone at build
        // time rather than a baking pass.
        const nb = this.adjStart[i + 1] - this.adjStart[i];
        const ao = 1 - THREE.MathUtils.clamp((nb - 7) / 16, 0, 1) * 0.34;

        // Weathering: soot and rain streaking gathers low and on the underside
        // of cornices, which is how a real Victorian tower is coloured.
        const t = THREE.MathUtils.clamp((this.py[i] - yLo) / Math.max(1, yHi - yLo), 0, 1);
        const weather = 1 - (1 - t) * 0.16;

        c.setHSL(hsl.h, hsl.s, hsl.l);
        c.multiplyScalar(ao * weather);
        colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
      }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      mesh.instanceColor.setUsage(THREE.StaticDrawUsage);

      this.meshes.push({ mesh, list, matId });
      this.group.add(mesh);
    }

    this.writeAllMatrices();
  }

  // ─────────────────────────────────────────────────────────────── render ──

  _writeMatrix(i) {
    const mi = this.meshIndexOf[i];
    const entry = this.meshes[mi];
    const k = this.instanceIndexOf[i];
    if (!(this.flags[i] & ALIVE)) {
      // Collapse the instance to nothing rather than paying for a rebuild.
      this._m4.makeScale(0, 0, 0);
      entry.mesh.setMatrixAt(k, this._m4);
      return;
    }
    this._v.set(this.px[i], this.py[i], this.pz[i]);
    this._q.set(this.qx ? this.qx[i] : 0, 0, 0, 1);
    if (this.qx) {
      this._q.set(this.qx[i], this.qy[i], this.qz[i], this.qw[i]);
    } else {
      const h = this.ry[i] * 0.5;
      this._q.set(0, Math.sin(h), 0, Math.cos(h));
    }
    this._s.set(this.hx[i] * 2, this.hy[i] * 2, this.hz[i] * 2);
    this._m4.compose(this._v, this._q, this._s);
    entry.mesh.setMatrixAt(k, this._m4);
  }

  writeAllMatrices() {
    // Rotations only become non-trivial once stones start moving, so the
    // quaternion arrays are allocated lazily on first promotion.
    for (let i = 0; i < this.count; i++) this._writeMatrix(i);
    for (const e of this.meshes) e.mesh.instanceMatrix.needsUpdate = true;
  }

  _ensureQuatArrays() {
    if (this.qx) return;
    const n = this.count;
    this.qx = new Float32Array(n); this.qy = new Float32Array(n);
    this.qz = new Float32Array(n); this.qw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const h = this.ry[i] * 0.5;
      this.qy[i] = Math.sin(h); this.qw[i] = Math.cos(h);
    }
  }

  /** Pull transforms back from Rapier for everything that moved this frame. */
  syncTransforms() {
    let moved = 0;
    this._ensureQuatArrays();

    // Free bodies.
    for (let i = 0; i < this.count; i++) {
      if (!(this.flags[i] & FREE)) continue;
      const body = this.bodyOf[i];
      if (!body || body.isSleeping()) continue;
      const t = body.translation();
      const r = body.rotation();
      this.px[i] = t.x; this.py[i] = t.y; this.pz[i] = t.z;
      this.qx[i] = r.x; this.qy[i] = r.y; this.qz[i] = r.z; this.qw[i] = r.w;
      this._writeMatrix(i);
      moved++;
    }

    // Island members ride their parent body.
    for (const island of this.islands.values()) {
      const body = island.body;
      if (!body || body.isSleeping()) continue;
      const t = body.translation();
      const r = body.rotation();
      this._q.set(r.x, r.y, r.z, r.w);
      for (let m = 0; m < island.members.length; m++) {
        const i = island.members[m];
        if (!(this.flags[i] & ALIVE)) continue;
        this._v.set(island.localPos[m * 3], island.localPos[m * 3 + 1], island.localPos[m * 3 + 2]);
        this._v.applyQuaternion(this._q);
        this.px[i] = t.x + this._v.x;
        this.py[i] = t.y + this._v.y;
        this.pz[i] = t.z + this._v.z;
        const lq = this._tmpQ || (this._tmpQ = new THREE.Quaternion());
        lq.set(island.localQuat[m * 4], island.localQuat[m * 4 + 1],
          island.localQuat[m * 4 + 2], island.localQuat[m * 4 + 3]);
        lq.premultiply(this._q);
        this.qx[i] = lq.x; this.qy[i] = lq.y; this.qz[i] = lq.z; this.qw[i] = lq.w;
        this._writeMatrix(i);
        moved++;
      }
    }

    if (moved > 0 || this._meshDirty) {
      for (const e of this.meshes) e.mesh.instanceMatrix.needsUpdate = true;
      this._meshDirty = false;
    }
    return moved;
  }

  markMeshDirty() { this._meshDirty = true; }

  // ─────────────────────────────────────────────────────────────── damage ──

  /**
   * Apply an explosion. `lethal` is the radius inside which stone is pulverised;
   * out to `radius` stones take falling damage and get thrown.
   * Returns the number of stones destroyed.
   */
  explode(center, lethal, radius, power, opts = {}) {
    const destroyed = [];
    const thrown = [];
    const r2 = radius * radius;

    // Only stones near the blast can be involved; walk the spatial extent
    // cheaply by testing all chunks against a squared distance. For 7k chunks
    // this is ~0.1 ms and avoids maintaining a second acceleration structure
    // that damage would keep invalidating.
    for (let i = 0; i < this.count; i++) {
      if (!(this.flags[i] & ALIVE)) continue;
      const dx = this.px[i] - center.x;
      const dy = this.py[i] - center.y;
      const dz = this.pz[i] - center.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;

      const d = Math.sqrt(d2) || 0.001;
      // Inverse-square-ish falloff, clamped so the core is uniformly lethal.
      const falloff = Math.pow(1 - Math.min(1, d / radius), 1.7);

      // How much of this stone the blast actually encloses. Testing the centre
      // alone makes the whole model depend on how finely the building happens
      // to be divided: coarse stones at the rim survive intact even with half
      // their volume inside the blast, so the same shell cuts a much smaller
      // bearing area out of a low-detail tower than a high-detail one, and the
      // level plays easier on better hardware. Weighting by enclosed fraction
      // keeps the hole the same physical size at every quality tier.
      const hAvg = (this.hx[i] + this.hy[i] + this.hz[i]) / 3;
      const enclosed = Math.max(0, Math.min(1, (radius - d) / (2 * hAvg) + 0.5));
      if (enclosed <= 0) continue;

      const lethalFrac = Math.max(0, Math.min(1, (lethal - d) / (2 * hAvg) + 0.5));
      if (lethalFrac >= 0.6) {
        destroyed.push(i);
        continue;
      }

      this.health[i] -= power * falloff * enclosed;
      if (this.health[i] <= 0) {
        destroyed.push(i);
      } else {
        thrown.push({ i, d, dx, dy, dz, falloff: falloff * enclosed });
      }
    }

    for (const i of destroyed) this.destroyChunk(i, center);

    // Throw the survivors on the rim outward. This is what turns a hole into a
    // spray of masonry rather than a clean bite.
    const budget = this.physics.reclaim(Math.min(thrown.length, 220));
    let used = 0;
    for (const t of thrown) {
      if (used >= budget) break;
      if (t.falloff < 0.12) continue;
      const inv = 1 / (t.d || 1);
      const mag = power * t.falloff * 0.0055 * this.mass[t.i];
      const imp = {
        x: t.dx * inv * mag,
        y: t.dy * inv * mag + mag * 0.28,
        z: t.dz * inv * mag,
      };
      if (this.freeChunk(t.i, imp)) used++;
    }

    this.stabilityDirty = true;
    return destroyed.length;
  }

  /** Remove a stone from the world entirely. */
  destroyChunk(i, from) {
    if (!(this.flags[i] & ALIVE)) return;
    this.flags[i] &= ~ALIVE;
    this.destroyedCount++;
    this.aliveMass -= this.mass[i];

    if (this.onChunkDestroyed) {
      this.onChunkDestroyed(
        this.px[i], this.py[i], this.pz[i],
        Math.max(this.hx[i], this.hy[i], this.hz[i]),
        this.mat[i], from,
      );
    }

    this._detachCollider(i);

    if (this.flags[i] & FREE) {
      const body = this.bodyOf[i];
      if (body) this.physics.remove(body);
      this.bodyOf[i] = null;
      this.flags[i] &= ~FREE;
    }
    this.flags[i] &= ~ISLAND;
    this._writeMatrix(i);
    this._meshDirty = true;
    this.stabilityDirty = true;
  }

  _detachCollider(i) {
    // Leaving the static body means this stone no longer blocks anyone's line
    // of sight, whether it was destroyed, freed or welded into an island.
    if (this._inGrid && this._inGrid[i]) {
      this._inGrid[i] = 0;
      this.occupancy.addChunk(this, i, -1);
    }
    const h = this.colliderOf[i];
    if (h < 0) return;
    const col = this.physics.world.getCollider(h);
    if (col) this.physics.world.removeCollider(col, true);
    this.colliderToChunk.delete(h);
    this.colliderOf[i] = -1;
  }

  /** Give a stone its own dynamic body. Returns false if the budget is spent. */
  freeChunk(i, impulse) {
    if (!(this.flags[i] & ALIVE)) return false;
    if (this.flags[i] & FREE) {
      if (impulse) this.bodyOf[i].applyImpulse(impulse, true);
      return true;
    }
    if (this.physics.dynamicSet.size >= this.physics.activeBudget) return false;

    const rapier = this.rapier;
    if (this.flags[i] & ISLAND) this._removeFromIsland(i);
    this._detachCollider(i);

    const q = this.qx
      ? { x: this.qx[i], y: this.qy[i], z: this.qz[i], w: this.qw[i] }
      : this._quatFor(i);

    const body = this.physics.world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(this.px[i], this.py[i], this.pz[i])
        .setRotation(q)
        .setLinearDamping(0.06)
        .setAngularDamping(0.2),
    );
    const cd = rapier.ColliderDesc.cuboid(this.hx[i], this.hy[i], this.hz[i])
      .setFriction(0.92)
      .setRestitution(0.03)
      .setDensity(MATERIAL_PROPS[this.mat[i]].density);
    const col = this.physics.world.createCollider(cd, body);

    this.colliderOf[i] = col.handle;
    this.colliderToChunk.set(col.handle, i);
    this.bodyOf[i] = body;
    this.flags[i] |= FREE;
    this.physics.dynamicSet.add(body);
    this.physics.owners.set(body.handle, { structure: this, chunk: i, settleTimer: 0 });

    if (impulse) body.applyImpulse(impulse, true);
    this.fallenMass += this.mass[i];
    return true;
  }

  // ──────────────────────────────────────────────────────────── stability ──

  /**
   * The solver. Two passes:
   *   (a) support reachability — flood from the foundations through intact
   *       joints; anything the flood can't reach has nothing holding it up.
   *   (b) load accumulation — walk stones top-down, pushing each stone's weight
   *       (plus everything already resting on it) onto whatever is underneath.
   *       Damaged stone carries proportionally less, so a shelled column fails
   *       under a load it used to hold.
   *
   * Anything that fails either test detaches, and detaching dirties the graph,
   * so the next tick re-runs and the failure propagates. That loop is the
   * progressive collapse.
   */
  solveStability(force = false) {
    if (!this.stabilityDirty && !force) return 0;
    this.stabilityDirty = false;

    const n = this.count;
    const reach = this._reach;
    reach.fill(0);

    // (a) Bearing support, walked bottom-up.
    //
    // A stone is supported only if something *underneath* it is supported.
    // Flooding through all adjacency instead — which is what this did first —
    // counts sideways and even overhead contact as support, and that is wrong
    // in a way that quietly breaks buildings: cut a wall clean through and the
    // band above it stays up, because it still touches a roof slab that
    // reaches the ground somewhere else. Masonry does not hang from its
    // neighbours.
    //
    // Walking in ascending height order means one pass settles it, since
    // everything below a stone has already been decided by the time we reach
    // it. Arches, corbels and bonded courses all still work: their voussoirs
    // genuinely do have lower neighbours.
    const byHeight = this.heightOrder;
    for (let k = n - 1; k >= 0; k--) {
      const i = byHeight[k];
      if (!(this.flags[i] & ALIVE)) continue;
      if (this.flags[i] & (FREE | ISLAND)) continue;
      if (this.flags[i] & GROUNDED) { reach[i] = 1; continue; }
      for (let a = this.belowStart[i]; a < this.belowStart[i + 1]; a++) {
        if (reach[this.belowList[a]]) { reach[i] = 1; break; }
      }
    }

    // Spanning. A lintel over a door, a slab between two walls and a modest
    // corbel all carry load sideways for a short distance, and a model with no
    // beam action at all would drop every floor and roof in the building the
    // instant it was built. So bearing support spreads along a course, but only
    // a few stones — far enough to cross an opening, nowhere near far enough to
    // hold up an unsupported wall.
    const span = this._spanBudget;
    span.fill(0);
    const queue = this._stack;
    let head = 0, tail = 0;
    for (let i = 0; i < n; i++) {
      if (reach[i]) { span[i] = LATERAL_SPAN; queue[tail++] = i; }
    }
    while (head < tail && tail < n) {
      const i = queue[head++];
      const budget = span[i] - 1;
      if (budget <= 0) continue;
      for (let a = this.sideStart[i]; a < this.sideStart[i + 1]; a++) {
        const j = this.sideList[a];
        if (span[j] >= budget) continue;
        if (!(this.flags[j] & ALIVE)) continue;
        if (this.flags[j] & (FREE | ISLAND)) continue;
        span[j] = budget;
        reach[j] = 1;
        if (tail < n) queue[tail++] = j;
      }
    }

    // (b) Load pass over the still-supported set.
    const load = this.load;
    load.fill(0);
    const order = this.heightOrder;
    const crushed = [];
    for (let k = 0; k < n; k++) {
      const i = order[k];
      if (!reach[i]) continue;
      const own = this.mass[i] * 9.81;
      const total = own + load[i];

      // Damage is a direct multiplier on how much a stone can still carry.
      const capacity = this.strength[i] * (this.health[i] / this.maxHealth[i]);
      if (total > capacity) {
        crushed.push(i);
        continue;
      }

      // Weight only travels into load-bearing stone. Glazing and applied
      // ornament hang off the frame; they pass their own weight down but are
      // never a path for anything above them.
      const s0 = this.belowStart[i];
      const s1 = this.belowStart[i + 1];
      let supporters = 0;
      for (let a = s0; a < s1; a++) {
        const j = this.belowList[a];
        if (reach[j] && this.structural[j]) supporters++;
      }
      if (supporters === 0) continue;
      const share = total / supporters;
      for (let a = s0; a < s1; a++) {
        const j = this.belowList[a];
        if (reach[j] && this.structural[j]) load[j] += share;
      }
    }

    // Crushed stone stops supporting: knock its health out and re-solve next
    // tick so the cascade is visible over several frames rather than instant.
    for (const i of crushed) {
      this.health[i] = 0;
      reach[i] = 0;
      this.stabilityDirty = true;
    }

    // Everything alive, attached, and unreachable is now falling.
    // The same sweep totals what is genuinely still standing: alive, attached
    // to the ground, and not already falling. That — not "mass we have touched"
    // — is what the integrity readout and the win condition are about, so a
    // stone shoved half a metre doesn't count as demolished.
    const detached = [];
    let standing = 0;
    let winStanding = 0;
    const mask = this._winMask;
    for (let i = 0; i < n; i++) {
      if (!(this.flags[i] & ALIVE)) continue;
      if (this.flags[i] & (FREE | ISLAND)) continue;
      if (reach[i]) {
        standing += this.mass[i];
        if (mask && mask[i]) winStanding += this.mass[i];
        continue;
      }
      detached.push(i);
    }
    this.standingMass = standing;
    this._winStanding = winStanding;

    for (const group of this._connectedGroups(detached)) {
      this._releaseGroup(group);
    }
    if (detached.length) this.stabilityDirty = true;

    // Connectivity is satisfied at this point; overturning is the separate
    // question of whether what's left can still *balance* the mass above it.
    const toppled = this._checkOverturning(reach);
    if (toppled) {
      let remaining = 0;
      for (let i = 0; i < n; i++) {
        if (!(this.flags[i] & ALIVE)) continue;
        if (this.flags[i] & (FREE | ISLAND)) continue;
        if (reach[i]) remaining += this.mass[i];
      }
      this.standingMass = remaining;
    }

    return detached.length + crushed.length + toppled;
  }

  /** Split a set of indices into connected components over the joint graph. */
  _connectedGroups(indices) {
    const inSet = new Set(indices);
    const seen = new Set();
    const groups = [];
    const stack = [];
    for (const start of indices) {
      if (seen.has(start)) continue;
      const group = [];
      stack.length = 0;
      stack.push(start);
      seen.add(start);
      while (stack.length) {
        const i = stack.pop();
        group.push(i);
        for (let a = this.adjStart[i]; a < this.adjStart[i + 1]; a++) {
          const j = this.adjList[a];
          if (!inSet.has(j) || seen.has(j)) continue;
          seen.add(j);
          stack.push(j);
        }
      }
      groups.push(group);
    }
    return groups;
  }

  /** Small groups become loose stones; big ones weld into a toppling slab. */
  _releaseGroup(group) {
    if (group.length <= WELD_THRESHOLD) {
      const allowed = this.physics.reclaim(group.length);
      let used = 0;
      for (const i of group) {
        if (used < allowed && this.freeChunk(i)) { used++; continue; }
        // Out of budget: weld the remainder so it still falls as one piece.
        const rest = group.slice(group.indexOf(i));
        if (rest.length) this._weldIsland(rest);
        return;
      }
      return;
    }
    this._weldIsland(group);
  }

  /**
   * Build one dynamic body carrying every stone in `group` as a collider.
   * The section then topples as a slab — which is what a real masonry section
   * does — and fragments when it lands.
   */
  _weldIsland(group, inheritVel) {
    const rapier = this.rapier;
    const alive = group.filter((i) => (this.flags[i] & ALIVE));
    if (alive.length === 0) return null;
    if (alive.length === 1) { this.freeChunk(alive[0]); return null; }

    // Mass-weighted centre so it pivots where it should.
    let mx = 0, my = 0, mz = 0, mt = 0;
    for (const i of alive) {
      const m = this.mass[i];
      mx += this.px[i] * m; my += this.py[i] * m; mz += this.pz[i] * m; mt += m;
    }
    mx /= mt; my /= mt; mz /= mt;

    const body = this.physics.world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(mx, my, mz)
        .setLinearDamping(0.03)
        .setAngularDamping(0.12)
        .setCcdEnabled(alive.length < 400),
    );

    const id = this._nextIslandId++;
    const localPos = new Float32Array(alive.length * 3);
    const localQuat = new Float32Array(alive.length * 4);
    const members = new Int32Array(alive);

    this._ensureQuatArrays();
    for (let m = 0; m < alive.length; m++) {
      const i = alive[m];
      const lx = this.px[i] - mx, ly = this.py[i] - my, lz = this.pz[i] - mz;
      localPos[m * 3] = lx; localPos[m * 3 + 1] = ly; localPos[m * 3 + 2] = lz;
      const q = { x: this.qx[i], y: this.qy[i], z: this.qz[i], w: this.qw[i] };
      localQuat[m * 4] = q.x; localQuat[m * 4 + 1] = q.y;
      localQuat[m * 4 + 2] = q.z; localQuat[m * 4 + 3] = q.w;

      this._detachCollider(i);
      const cd = rapier.ColliderDesc.cuboid(this.hx[i], this.hy[i], this.hz[i])
        .setTranslation(lx, ly, lz)
        .setRotation(q)
        .setFriction(0.95)
        .setRestitution(0.01)
        .setDensity(MATERIAL_PROPS[this.mat[i]].density);
      const col = this.physics.world.createCollider(cd, body);
      this.colliderOf[i] = col.handle;
      this.colliderToChunk.set(col.handle, i);

      this.flags[i] |= ISLAND;
      this.flags[i] &= ~FREE;
      this.islandOf[i] = id;
      this.fallenMass += this.mass[i];
    }

    if (inheritVel) {
      body.setLinvel(inheritVel.lin, true);
      body.setAngvel(inheritVel.ang, true);
    }

    const island = { id, body, members, localPos, localQuat, impacts: 0 };
    this.islands.set(id, island);
    this.physics.dynamicSet.add(body);
    this.physics.owners.set(body.handle, { structure: this, island: id, settleTimer: 0 });
    return island;
  }

  _removeFromIsland(i) {
    const id = this.islandOf[i];
    const island = this.islands.get(id);
    this.flags[i] &= ~ISLAND;
    this.islandOf[i] = -1;
    if (!island) return;
    const idx = Array.prototype.indexOf.call(island.members, i);
    if (idx < 0) return;
    // Compact the member arrays in place.
    const n = island.members.length;
    const members = new Int32Array(n - 1);
    const lp = new Float32Array((n - 1) * 3);
    const lq = new Float32Array((n - 1) * 4);
    let w = 0;
    for (let m = 0; m < n; m++) {
      if (m === idx) continue;
      members[w] = island.members[m];
      lp[w * 3] = island.localPos[m * 3];
      lp[w * 3 + 1] = island.localPos[m * 3 + 1];
      lp[w * 3 + 2] = island.localPos[m * 3 + 2];
      lq[w * 4] = island.localQuat[m * 4];
      lq[w * 4 + 1] = island.localQuat[m * 4 + 1];
      lq[w * 4 + 2] = island.localQuat[m * 4 + 2];
      lq[w * 4 + 3] = island.localQuat[m * 4 + 3];
      w++;
    }
    island.members = members;
    island.localPos = lp;
    island.localQuat = lq;
    if (members.length === 0) this._dissolveIsland(island);
  }

  _dissolveIsland(island) {
    this.islands.delete(island.id);
    if (island.body) this.physics.remove(island.body);
    island.body = null;
  }

  /**
   * Shatter a landing island. Splits along its longest axis so repeated
   * impacts fragment it progressively — the first hit breaks a spire in two,
   * the next breaks those halves, and once a piece is small enough it becomes
   * loose stone.
   */
  fragmentIsland(id, impactPoint) {
    const island = this.islands.get(id);
    if (!island || !island.body) return;
    const members = [...island.members].filter((i) => this.flags[i] & ALIVE);
    if (members.length === 0) { this._dissolveIsland(island); return; }

    const body = island.body;
    const lin = body.linvel();
    const ang = body.angvel();
    const vel = { lin: { x: lin.x, y: lin.y, z: lin.z }, ang: { x: ang.x, y: ang.y, z: ang.z } };

    // Free the whole thing if we can afford it, otherwise halve it.
    const allowed = this.physics.reclaim(members.length);
    for (const i of members) { this.flags[i] &= ~ISLAND; this.islandOf[i] = -1; }
    this._dissolveIsland(island);

    if (members.length <= Math.max(8, allowed)) {
      for (const i of members) {
        if (!this.freeChunk(i)) { this._weldIsland([i], vel); continue; }
        const b = this.bodyOf[i];
        if (b) {
          b.setLinvel(vel.lin, true);
          // Scatter on landing rather than sliding as a carpet.
          b.setAngvel({
            x: vel.ang.x + (hash01(i * 7) - 0.5) * 6,
            y: vel.ang.y + (hash01(i * 13) - 0.5) * 6,
            z: vel.ang.z + (hash01(i * 29) - 0.5) * 6,
          }, true);
        }
      }
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const i of members) {
      minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
      minY = Math.min(minY, this.py[i]); maxY = Math.max(maxY, this.py[i]);
      minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
    }
    const ex = maxX - minX, ey = maxY - minY, ez = maxZ - minZ;
    const axis = ex >= ey && ex >= ez ? 'x' : ey >= ez ? 'y' : 'z';
    const mid = axis === 'x' ? (minX + maxX) / 2 : axis === 'y' ? (minY + maxY) / 2 : (minZ + maxZ) / 2;
    const a = [], b = [];
    for (const i of members) {
      const v = axis === 'x' ? this.px[i] : axis === 'y' ? this.py[i] : this.pz[i];
      (v < mid ? a : b).push(i);
    }
    // Re-split each half into truly connected pieces so we never weld two
    // fragments that are no longer touching.
    for (const half of [a, b]) {
      if (half.length === 0) continue;
      for (const g of this._connectedGroups(half)) {
        if (g.length === 1) { if (!this.freeChunk(g[0])) this._weldIsland(g, vel); }
        else this._weldIsland(g, vel);
      }
    }
    for (const isl of this.islands.values()) {
      if (isl.body && isl.impacts === 0) {
        isl.body.setLinvel(vel.lin, true);
        isl.body.setAngvel(vel.ang, true);
      }
    }
  }

  /**
   * Break up welded sections that have come to rest.
   *
   * A toppled spire should end as a heap of stone, not a single frozen slab
   * lying on its side. Once an island stops moving we split it — budget
   * permitting — so the rubble is made of the same individual stones the tower
   * was, and can be shelled again. Called once per frame; it does at most one
   * island per call so a big collapse spreads the cost over several frames.
   */
  maintainIslands() {
    if (this.islands.size === 0) return 0;
    for (const island of this.islands.values()) {
      if (!island.body || !island.body.isSleeping()) continue;
      if (island.members.length <= WELD_THRESHOLD) continue;
      island.restTimer = (island.restTimer || 0) + 1;
      if (island.restTimer < 30) continue;
      this.fragmentIsland(island.id);
      return 1;
    }
    return 0;
  }

  /**
   * Restrict the progress metric to named sections.
   *
   * The Taj's plinth is a 95 m solid platform and outweighs everything built on
   * it, so measuring the whole structure means the dome can fall and the number
   * barely moves — and winning would mean grinding down a terrace nobody wants
   * to shoot at. Naming the sections that constitute the monument makes the
   * readout and the win condition track the thing the level is about.
   */
  setScoreTags(tags) {
    if (!tags || !tags.length) { this._winMask = null; return; }
    const set = new Set(tags);
    const mask = new Uint8Array(this.count);
    let total = 0;
    for (let i = 0; i < this.count; i++) {
      if (!set.has(this.tagOf[i])) continue;
      mask[i] = 1;
      if (this.flags[i] & ALIVE) total += this.mass[i];
    }
    this._winMask = mask;
    this._winTotal = total;
    this._winStanding = total;
  }

  /** Fraction of the scored sections still standing, or of everything if unset. */
  get monumentIntegrity() {
    if (!this._winMask || !this._winTotal) return this.integrity;
    return Math.max(0, Math.min(1, this._winStanding / this._winTotal));
  }

  /** Fraction of the original structure still standing, 0..1. */
  get integrity() {
    if (this.standingMass === undefined) return 1;
    return Math.max(0, Math.min(1, this.standingMass / this.totalMass));
  }

  /** Mass no longer part of the standing structure — destroyed or fallen. */
  get demolishedMass() {
    return Math.max(0, this.totalMass - (this.standingMass ?? this.totalMass));
  }

  /** Highest point still attached to the ground — drives the "topple" check. */
  standingHeight() {
    let top = this.groundY;
    for (let i = 0; i < this.count; i++) {
      if (!(this.flags[i] & ALIVE)) continue;
      if (this.flags[i] & (FREE | ISLAND)) continue;
      const y = this.py[i] + this.hy[i];
      if (y > top) top = y;
    }
    return top;
  }

  chunkForCollider(handle) {
    const i = this.colliderToChunk.get(handle);
    return i === undefined ? -1 : i;
  }
}

/** Deterministic per-index noise in 0..1 — stable across reloads. */
function hash01(i) {
  let x = (i * 2654435761) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13;
  x = Math.imul(x, 3266489917); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
