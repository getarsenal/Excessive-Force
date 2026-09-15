import * as THREE from 'three';
import { MATERIALS, MATERIAL_PROPS } from './builder.js';
import { Occupancy } from './occupancy.js';
import { PhysicsWorld } from '../core/physics.js';

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

/**
 * Is this transform something we can draw?
 *
 * The last line of defence against a physics world that has gone wrong. If the
 * wasm side traps — and over a long enough session something eventually does —
 * every later read comes back as whatever was in that memory, and the numbers
 * are not merely wrong but wild. A quaternion is used as a rotation *and* a
 * scale: `|q|²` multiplies the box it is applied to, so a rotation that reads
 * back as (3, -7, 2, 5) draws a stone the size of a district, hanging in the
 * sky across half the screen. Refusing to copy a transform that cannot be real
 * leaves the stone where it last was, which is wrong quietly instead of wrong
 * catastrophically.
 */
function sane(t, r) {
  if (!isFinite(t.x) || !isFinite(t.y) || !isFinite(t.z)) return false;
  if (Math.abs(t.x) > 1e5 || Math.abs(t.y) > 1e5 || Math.abs(t.z) > 1e5) return false;
  const q = r.x * r.x + r.y * r.y + r.z * r.z + r.w * r.w;
  return q > 0.9 && q < 1.1;
}

const ALIVE = 1;
const FREE = 2;       // has its own dynamic rigid body
const GROUNDED = 4;   // foundation stone, an anchor for the support search
const ISLAND = 8;     // member of a welded island
const SETTLED = 16;

const EPS = 0.075;          // joint tolerance when deciding adjacency
const WELD_THRESHOLD = 26;  // above this, a detached group welds instead of freeing

/**
 * How far bearing support may travel sideways, in **metres**.
 *
 * This used to be a hop count — four stones along a course. That is the wrong
 * unit, and it is why blowing the base out of the Elizabeth Tower left it
 * standing: four hops of 1.15 m stone is 4.6 m of reach from *each* side of a
 * hole, so an eight-metre crater was spanned from both edges and the solver
 * concluded the wall above it was fine. Worse, the reach changed with the
 * quality tier, because a finer subdivision means smaller stones and shorter
 * hops for the same physical distance.
 *
 * In metres it is a statement about masonry: a stone lintel spans a couple of
 * metres, a flat slab acting as a beam spans further, and nothing spans a
 * crater. `spanReach` below scales the budget with how beam-like each stone is.
 */
const SPAN_BASE = 0.9;
const SPAN_PER_FLATNESS = 1.5;
const SPAN_MAX_FLATNESS = 3.0;

/**
 * Working compressive strength of the masonry, in pascals, before any damage.
 * Governed by the mortar joints rather than the stone itself.
 */
const MASONRY_STRENGTH = 14e6;

/**
 * How far out of plumb a section gets before it is past saving, in radians.
 *
 * Seven and a half degrees puts the top of a 96 m tower twelve metres off its
 * base. Generous on purpose: the lean is the most legible thing in the game —
 * it is how the player finds out the shelling is working — and cutting it short
 * at the first sign of trouble throws that away.
 */
const LEAN_CRITICAL = 0.13;

/**
 * The stress ratio recorded for a slice with no equilibrium at all.
 *
 * It has to be a number rather than infinity because it feeds the creep rate,
 * and the creep rate is what sets how long the player gets to watch a tower go
 * over. Too high and the lean is a single frame between "standing" and "gone",
 * which is the thing this whole mechanism exists to avoid.
 */
const NO_EQUILIBRIUM = 1.8;

/**
 * Gravity scale for the overturn.
 *
 * The rotation past the tipping point runs on the real thing — weight times
 * overhang over the second moment of the stack — and at 1.0 a ninety-metre
 * tower honestly takes the better part of fifteen seconds to get from its first
 * visible movement to the ground. That is a long time to watch. This keeps the
 * shape of the motion, which is the part that matters — imperceptible, then
 * unstoppable — and compresses it into about five.
 */
const LEAN_GRAVITY = 2.6;

/**
 * The fastest any piece of a collapsing section may be moving when the physics
 * engine takes it over, in metres per second.
 *
 * Small on purpose. Everything after this moment should be gravity's doing;
 * this is only here to make sure the stack is past its balance point rather
 * than balanced exactly on it.
 */
const TOPPLE_NUDGE = 1.6;

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
    // Mortar bond, 1 down to a floor. Blast shatters the joints well beyond the
    // crater it leaves, and a course of stone whose mortar has been shaken to
    // dust carries a fraction of what it did — which is most of why shelling
    // the base of a tower matters far more than the hole itself suggests.
    this.bond = new Float32Array(n).fill(1);
    this.strength = new Float32Array(n);
    this.structural = new Uint8Array(n);
    /**
     * Rapier collider handle per chunk. Float64, and it has to be.
     *
     * This was an Int32Array, which looks obviously right and was silently
     * destroying every handle in the building. Rapier's JS bindings hand back a
     * handle that is *not* an integer index — it is a 64-bit value reinterpreted
     * as a double, and for a young world that comes out as a denormal around
     * 1e-312. Storing one in an Int32Array truncates it to zero. So every chunk
     * in every structure recorded its collider as handle 0, the map keyed on the
     * real handle never matched, and `_detachCollider` spent the whole game
     * removing collider zero — or nothing — instead of the stone it was asked
     * to remove.
     *
     * What that looks like in play: a stone that is blasted or freed keeps its
     * original collider on the static body, so the building's *physical* shape
     * never changes even as its geometry does, and a section that has gone
     * dynamic sinks through the ghost of itself at the solver's penetration
     * recovery speed — a constant metre a second, never accelerating, which is
     * the tower "drifting away slowly" instead of falling.
     *
     * A Float64Array round-trips the value exactly, and -1 is still a perfectly
     * good sentinel.
     */
    this.colliderOf = new Float64Array(n).fill(-1);
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
    this._spanBudget = new Float32Array(n);
    this._bearing = new Uint8Array(n);   // supported from directly below
    this._stress = new Float32Array(n);  // last computed bearing stress, Pa

    // How far each stone can carry load sideways. A flat slab is a beam and
    // spans; a cube is a wall stone and barely does.
    this.spanReach = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const flat = Math.max(this.hx[i], this.hz[i]) / Math.max(0.05, this.hy[i]);
      this.spanReach[i] = SPAN_BASE + SPAN_PER_FLATNESS * Math.min(SPAN_MAX_FLATNESS, flat);
    }
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();

    // The ground this building actually stands on, as an axis-aligned box.
    //
    // Everything used to ask "is this within 26 m of the structure's origin?",
    // which is a fine question for a tower and a meaningless one for a wing
    // seventy-five metres long — both of these share an origin at the foot of
    // the clock tower, so the whole palace read as open ground and a gun could
    // be deployed inside it, firing into a wall a metre from its own muzzle.
    let fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const r = Math.max(this.hx[i], this.hz[i]);
      if (this.px[i] - r < fx0) fx0 = this.px[i] - r;
      if (this.px[i] + r > fx1) fx1 = this.px[i] + r;
      if (this.pz[i] - r < fz0) fz0 = this.pz[i] - r;
      if (this.pz[i] + r > fz1) fz1 = this.pz[i] + r;
    }
    this.footprint = { x0: fx0, x1: fx1, z0: fz0, z1: fz1 };

    this._buildAdjacency();
    this._groutOrphans();
    this._groutBearing();
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
    // Below this, a slice is carrying ornament rather than building.
    this._significantLoad = Math.max(40000, total * 0.03);
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
   * Eccentric bearing: the reason a cut tower comes down.
   *
   * Connectivity alone says a tower with one wall shot away is fine — the other
   * three walls still reach the ground, so nothing is "unsupported". A rigid-
   * body overturning test agrees, because the centre of mass of a symmetric
   * tower stays comfortably inside what is left of a square base. Both are
   * wrong, and between them they are why blowing the base out of the Elizabeth
   * Tower used to leave it standing there.
   *
   * What actually happens is a stress problem, not a balance problem. Masonry
   * has no tensile strength. Once the load arriving at a course is off-centre,
   * the section cannot develop the tension needed to keep the far side in
   * contact, so the joint opens, the bearing area shrinks to the compressed
   * part only, and the whole load concentrates on what is left. That is a
   * runaway: less area means more eccentricity means less area still.
   *
   * So this does the standard no-tension analysis, per horizontal slice:
   *
   *   1. Take the surviving bearing stones in the slice and the weight of
   *      everything above it.
   *   2. Assume a linear stress distribution across the section and work out
   *      which stones come out in tension.
   *   3. Throw those out — they have lifted off — and redo it with what is
   *      left, until every remaining stone is in compression.
   *   4. The peak stress on the compression edge is then real. Compare it to
   *      what the damaged masonry can still carry.
   *
   * Stones past their capacity are crushed, which shifts the bearing further
   * and brings the next tick round harder. When the compressed zone collapses
   * to nothing — the resultant has walked outside the section entirely — there
   * is no equilibrium at all and the slice is gone.
   *
   * @param {Uint8Array} load  what presses down — includes a leaning section
   *                           that has gone dynamic but not yet fallen
   * @param {Uint8Array} reach  what is still fixed, and so can bear
   * @returns {{band:number, ratio:number, crushed:number}} the worst slice
   */
  _bearingAnalysis(load, reach) {
    const n = this.count;
    const B = this.bandCount;

    // Weight carried into each slice, accumulated from the top down, *from
    // where the building is actually standing* — which, once it is out of
    // plumb, is not where it was built.
    //
    // This is the P-delta term, and leaving it out was why a shelled tower
    // leaned a few degrees and then stopped: the analysis kept measuring an
    // upright building, so the eccentricity never grew, so the overstress
    // never grew, so the creep rate stayed constant and the spring simply
    // settled at whatever angle it had reached. With it, four degrees of tilt
    // on a forty-metre centre of mass moves the load three metres off centre —
    // a quarter of the tower's width — and the joint opens the rest of the way
    // on its own. That feedback *is* the collapse.
    const basis = this._leanBasis();
    const lp = this._leanPt || (this._leanPt = { x: 0, y: 0, z: 0 });
    this._bMass.fill(0); this._bMomX.fill(0); this._bMomZ.fill(0);
    for (let i = 0; i < n; i++) {
      if (!load[i]) continue;
      const b = this.bandOf[i];
      const m = this.mass[i];
      let x = this.px[i], z = this.pz[i];
      if (basis && b >= basis.band && !(this.flags[i] & (FREE | ISLAND))) {
        this._leanApply(basis, x, this.py[i], z, lp);
        x = lp.x; z = lp.z;
      }
      this._bMass[b] += m;
      this._bMomX[b] += x * m;
      this._bMomZ[b] += z * m;
    }

    const active = this._bearActive || (this._bearActive = new Uint8Array(n));
    let worstBand = -1, worstRatio = 0, crushedTotal = 0;
    // The most deeply cut slice carrying real load, whether or not it is
    // failing. A slice that has lost a quarter of its bearing is a slice the
    // building is visibly sitting on differently, and that is worth handing to
    // the physics engine even when the arithmetic says it still holds.
    let cutBand = -1, cutFrac = 1;
    let aboveMass = 0, aboveMomX = 0, aboveMomZ = 0;

    for (let b = B - 1; b >= 1; b--) {
      aboveMass += this._bMass[b];
      aboveMomX += this._bMomX[b];
      aboveMomZ += this._bMomZ[b];
      // Only slices carrying a real share of the building are interesting. A
      // pinnacle or a chattri weighs a few tonnes, sits on almost nothing, and
      // will report itself in crisis on every tick — which used to short out
      // the whole scan before it reached the slice that mattered.
      if (aboveMass < this._significantLoad) continue;

      const s0 = this.bandStart[b - 1], s1 = this.bandStart[b];
      if (s1 <= s0) continue;

      const comX = aboveMomX / aboveMass;
      const comZ = aboveMomZ / aboveMass;
      const P = aboveMass * 9.81;

      // ── 1. the surviving bearing in this slice
      let area = 0;
      for (let k = s0; k < s1; k++) {
        const j = this.bandList[k];
        const ok = reach[j] && this.structural[j] ? 1 : 0;
        active[j] = ok;
        if (ok) area += 4 * this.hx[j] * this.hz[j];
      }
      if (area <= 0.01) continue;
      const frac = area / Math.max(1e-6, this.bandArea0[b - 1]);
      if (frac > 0.985) continue;                                   // untouched
      if (frac < cutFrac) { cutFrac = frac; cutBand = b; }

      // ── 2-3. drop the stones that come out in tension, and redo it
      let cx = 0, cz = 0, peak = 0, peakDir = 0, ok = false;
      for (let iter = 0; iter < 8; iter++) {
        area = 0; cx = 0; cz = 0;
        for (let k = s0; k < s1; k++) {
          const j = this.bandList[k];
          if (!active[j]) continue;
          const a = 4 * this.hx[j] * this.hz[j];
          area += a; cx += this.px[j] * a; cz += this.pz[j] * a;
        }
        if (area <= 0.01) break;
        cx /= area; cz /= area;

        let ex = comX - cx, ez = comZ - cz;
        const e = Math.hypot(ex, ez);
        if (e < 1e-4) {
          // Concentric: uniform stress, nothing lifts off.
          peak = P / area;
          peakDir = 0;
          ok = true;
          break;
        }
        const ux = ex / e, uz = ez / e;

        // Second moment of the surviving bearing about its centroid, measured
        // along the direction the load has shifted.
        let I = 0;
        for (let k = s0; k < s1; k++) {
          const j = this.bandList[k];
          if (!active[j]) continue;
          const a = 4 * this.hx[j] * this.hz[j];
          const s = (this.px[j] - cx) * ux + (this.pz[j] - cz) * uz;
          // Parallel-axis term, so a wide stone resists rotation on its own.
          const half = Math.abs(this.hx[j] * ux) + Math.abs(this.hz[j] * uz);
          I += a * (s * s + half * half / 3);
        }
        if (I <= 1e-6) break;

        // σ(s) = P/A + P·e·s/I. Lift off anything the formula puts in tension.
        let lifted = 0, hi = 0;
        for (let k = s0; k < s1; k++) {
          const j = this.bandList[k];
          if (!active[j]) continue;
          const s = (this.px[j] - cx) * ux + (this.pz[j] - cz) * uz;
          const sigma = P / area + (P * e * s) / I;
          this._stress[j] = sigma;
          if (sigma < 0) { active[j] = 0; lifted++; } else if (sigma > hi) hi = sigma;
        }
        peak = hi;
        peakDir = Math.atan2(ux, uz);
        if (lifted === 0) { ok = true; break; }
      }

      if (!ok || area <= 0.01) {
        // No compressed zone survives: the resultant is outside the section
        // altogether and there is no equilibrium to be had. Recorded as
        // decisively failing, but the scan carries on — a slice further down
        // may be worse still, and it is the lowest failure that decides where
        // the building breaks.
        if (worstRatio < NO_EQUILIBRIUM) { worstRatio = NO_EQUILIBRIUM; worstBand = b; }
        continue;
      }

      // ── 4. what the damaged masonry can still carry
      let capacity = 0, capArea = 0;
      for (let k = s0; k < s1; k++) {
        const j = this.bandList[k];
        if (!active[j]) continue;
        const a = 4 * this.hx[j] * this.hz[j];
        const props = MATERIAL_PROPS[this.mat[j]];
        capArea += a;
        capacity += a * props.strength * MASONRY_STRENGTH
          * (this.health[j] / this.maxHealth[j]) * this.bond[j];
      }
      const allow = capArea > 0 ? capacity / capArea : 1;
      const ratio = peak / Math.max(1, allow);
      if (ratio > worstRatio) { worstRatio = ratio; worstBand = b; }

      // Overstressed: crush the stones on the compression edge. They are the
      // ones actually failing, and removing them is what walks the bearing
      // further off-centre on the next tick.
      //
      // How many go is set by how far past capacity the edge is. One per pass
      // was the same rate whether the joint was at 1.01 times its allowable or
      // at four times it, which made a badly overloaded slice erode at the pace
      // of a lightly loaded one — a tower being taken apart in slow motion no
      // matter how hard it was hit.
      if (ratio > 1) {
        const ux = Math.sin(peakDir), uz = Math.cos(peakDir);
        const want = Math.min(8, Math.ceil((ratio - 1) * 2.5));
        for (let c2 = 0; c2 < want; c2++) {
          let best = -1, bestS = -Infinity;
          for (let k = s0; k < s1; k++) {
            const j = this.bandList[k];
            if (!active[j]) continue;
            const s = (this.px[j] - cx) * ux + (this.pz[j] - cz) * uz;
            if (s > bestS) { bestS = s; best = j; }
          }
          if (best < 0) break;
          this.health[best] = 0;
          active[best] = 0;
          reach[best] = 0;
          crushedTotal++;
          this.stabilityDirty = true;
        }
      }
    }

    return { band: worstBand, ratio: worstRatio, crushed: crushedTotal, cutBand, cutFrac };
  }

  /**
   * Rigid-body overturning: the case the stress analysis cannot see.
   *
   * A slice can be in compression everywhere and still have the mass above it
   * hanging off the edge of what is left — the arithmetic of *stress* is fine,
   * the arithmetic of *balance* is not. This finds the lowest slice where that
   * is true.
   *
   * It reports the slice rather than acting on it. It used to cut the structure
   * loose here and weld everything above into one body, which is why a shelled
   * tower went from perfectly upright to a seven-thousand-stone slab lying on
   * the ground between one tick and the next, with no lean in between: there
   * were two independent routes out of "standing" and this was the faster one.
   * Now there is one, through `tickLean`, and this feeds it.
   *
   * @returns {number} the failing band, or -1
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
      return b;
    }
    return -1;
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

  /**
   * Make the building stand *by the rules the solver actually uses*.
   *
   * `_groutOrphans` guarantees every stone is connected to the ground through
   * the adjacency graph. The support solver does not use the adjacency graph:
   * it walks *bearing* — a stone is held up only by something underneath it —
   * and then relaxes a limited amount of sideways spanning over the top. That
   * is a strictly harder test, so a stone can be perfectly well grouted and
   * still have nothing beneath it, and the solver condemns it on the first
   * frame of the game.
   *
   * Which is exactly what was happening: six hundred and twenty-seven stones
   * of the Palace Wing, one course of them at nine and a half metres, were
   * declared unsupported before a shot was fired. They were harmless while
   * detaching a collider did not work — they were freed, but the physics never
   * noticed — and the moment that was fixed they became six hundred loose
   * bodies starting the match interpenetrating their neighbours, which the
   * solver resolves by flinging them. Bricks spraying off the building on
   * load.
   *
   * So: run the solver's own reachability here, at build time, and give
   * anything it cannot reach a bearing edge to the nearest masonry below it.
   * Real buildings solve this with a corbel, a relieving arch or a bit of
   * bedding mortar; the effect is the same. If a stone has nothing below it
   * within reach at all, it was never part of the building and `_groutOrphans`
   * has already removed it.
   *
   * The invariant this establishes — *a structure stands when it is built* —
   * is worth having as a build step rather than as something each landmark
   * author has to get right by hand.
   */
  _groutBearing() {
    const n = this.count;
    const byHeight = this.heightOrder;
    const reach = new Uint8Array(n);

    // The solver's bearing walk, lowest stone first.
    const below = new Array(n);
    for (let i = 0; i < n; i++) {
      below[i] = [];
      for (let a = this.belowStart[i]; a < this.belowStart[i + 1]; a++) {
        below[i].push(this.belowList[a]);
      }
    }
    const flood = () => {
      reach.fill(0);
      for (let k = n - 1; k >= 0; k--) {
        const i = byHeight[k];
        if (!(this.flags[i] & ALIVE)) continue;
        if (this.flags[i] & GROUNDED) { reach[i] = 1; continue; }
        for (const j of below[i]) if (reach[j]) { reach[i] = 1; break; }
      }
    };

    let added = 0;
    for (let pass = 0; pass < 6; pass++) {
      flood();
      const stranded = [];
      for (let i = 0; i < n; i++) {
        if ((this.flags[i] & ALIVE) && !reach[i]) stranded.push(i);
      }
      if (!stranded.length) break;

      // The window widens with each pass. A finely modelled dome or a chattri
      // has ornament sitting a long way clear of anything below it, and a
      // window tight enough to be honest about a wall is too tight for those.
      const maxDrop = 3.0 + pass * 1.2;
      const maxSide = 2.2 + pass * 0.9;
      let joined = 0;
      for (const i of stranded) {
        const bot = this.py[i] - this.hy[i];
        let best = -1, bestD = Infinity;
        for (let j = 0; j < n; j++) {
          if (j === i || !(this.flags[j] & ALIVE)) continue;
          const top = this.py[j] + this.hy[j];
          const drop = bot - top;
          if (drop < -0.6 || drop > maxDrop) continue;      // not underneath
          const dx = Math.abs(this.px[j] - this.px[i]) - this._aabbX[i] - this._aabbX[j];
          const dz = Math.abs(this.pz[j] - this.pz[i]) - this._aabbZ[i] - this._aabbZ[j];
          if (dx > maxSide || dz > maxSide) continue;
          // Prefer something already standing, then the closest.
          const d = Math.max(0, dx) + Math.max(0, dz) + Math.max(0, drop)
            + (reach[j] ? 0 : 6);
          if (d < bestD) { bestD = d; best = j; }
        }
        if (best >= 0) { below[i].push(best); added++; joined++; }
      }
      if (!joined) break;
    }

    // Anything the widest search still cannot find a floor for has nothing
    // under it at all, at any distance — it was never part of the building, in
    // the same sense `_groutOrphans` means when it culls a stone nothing at all
    // is touching. Removing it is better than shipping a building that sheds it
    // on the first frame.
    flood();
    let culled = 0;
    for (let i = 0; i < n; i++) {
      if ((this.flags[i] & ALIVE) && !reach[i]) { this.flags[i] &= ~ALIVE; culled++; }
    }
    this.bearingCulled = culled;
    if (!added) { this.bearingGrout = 0; return; }

    // Fold the new bearing edges back into both graphs. They have to reach the
    // adjacency list too, or spanning and island connectivity disagree with
    // what the support pass now believes.
    let belowEdges = 0;
    for (let i = 0; i < n; i++) belowEdges += below[i].length;
    this.belowStart = new Int32Array(n + 1);
    this.belowList = new Int32Array(belowEdges);
    let cursor = 0;
    for (let i = 0; i < n; i++) {
      this.belowStart[i] = cursor;
      for (const j of below[i]) this.belowList[cursor++] = j;
    }
    this.belowStart[n] = cursor;

    const adj = new Array(n);
    let adjEdges = 0;
    for (let i = 0; i < n; i++) {
      const seen = new Set();
      for (let a = this.adjStart[i]; a < this.adjStart[i + 1]; a++) seen.add(this.adjList[a]);
      for (const j of below[i]) seen.add(j);
      seen.delete(i);
      adj[i] = [...seen];
      adjEdges += adj[i].length;
    }
    // Symmetric: a stone that bears on another is a neighbour of it.
    this.adjStart = new Int32Array(n + 1);
    this.adjList = new Int32Array(adjEdges);
    cursor = 0;
    for (let i = 0; i < n; i++) {
      this.adjStart[i] = cursor;
      for (const j of adj[i]) this.adjList[cursor++] = j;
    }
    this.adjStart[n] = cursor;
    this.bearingGrout = added;
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
        const ao = 1 - THREE.MathUtils.clamp((nb - 7) / 16, 0, 1) * 0.22;

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
    // A settling structure is drawn leaning. The stones' own coordinates stay
    // upright and authoritative; the tilt is applied here and baked in only if
    // and when the section actually goes over.
    if (this.lean && this._leaning(i)) {
      const lq = this._leanTransform();
      this._leanPosition(i, this._v);
      this._q.premultiply(lq);
    }
    this._s.set(this.hx[i] * 2, this.hy[i] * 2, this.hz[i] * 2);
    // `compose` treats the quaternion as a rotation *and* a scale: it applies
    // |q|² to the box. A stone whose rotation is not unit length therefore
    // draws at the wrong size — and a stone whose rotation is garbage draws the
    // size of a district. Normalising here is four multiplies and makes that
    // impossible however the numbers got in.
    const qn = this._q.lengthSq();
    if (!(qn > 0.99 && qn < 1.01)) {
      if (qn > 1e-6 && isFinite(qn)) this._q.normalize();
      else this._q.set(0, 0, 0, 1);
    }
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

    // A lean moves thousands of stones that are otherwise perfectly static, so
    // their matrices have to be rewritten while it is running — and once more
    // after it ends, or a structure that straightened back up stays drawn at
    // the angle it was abandoned at.
    if (this._leanDirty) {
      const from = this.lean ? this.lean.band : (this._leanWasBand ?? 0);
      for (let i = 0; i < this.count; i++) {
        if (this.bandOf[i] < from) continue;
        if (!(this.flags[i] & ALIVE) || (this.flags[i] & (FREE | ISLAND))) continue;
        this._writeMatrix(i);
        moved++;
      }
      this._leanDirty = false;
      this._meshDirty = true;
    }

    // Free bodies.
    for (let i = 0; i < this.count; i++) {
      if (!(this.flags[i] & FREE)) continue;
      const body = this.bodyOf[i];
      // `alive` as well as null: a free stone's body can be removed out from
      // under its flag (a runaway culled, a chunk destroyed mid-frame), and
      // asking a removed body whether it is sleeping traps in wasm — which
      // leaves the world borrowed and ends the simulation, not just the frame.
      if (!PhysicsWorld.alive(body) || body.isSleeping()) continue;
      const t = body.translation();
      const r = body.rotation();
      if (!sane(t, r)) continue;
      this.px[i] = t.x; this.py[i] = t.y; this.pz[i] = t.z;
      this.qx[i] = r.x; this.qy[i] = r.y; this.qz[i] = r.z; this.qw[i] = r.w;
      this._writeMatrix(i);
      moved++;
    }

    // Island members ride their parent body.
    for (const island of this.islands.values()) {
      const body = island.body;
      if (!PhysicsWorld.alive(body)) continue;
      const t = body.translation();
      const r = body.rotation();
      if (!sane(t, r)) continue;
      // Skipped on sleep, not on stillness. The two are not the same: Rapier
      // reports a fixed body as sleeping, and a section that is frozen back
      // into scenery is fixed — so `isSleeping()` alone stopped its stones
      // being redrawn from the frame it was frozen, and they stayed wherever
      // they had last been written while the section itself had moved on.
      // Measured at nearly four metres of drift between a stone and its own
      // collider. Comparing the transform instead costs one read per section,
      // and there are tens of those.
      const last = island.lastSync;
      if (last && last.x === t.x && last.y === t.y && last.z === t.z
        && last.qx === r.x && last.qy === r.y && last.qz === r.z && last.qw === r.w) {
        continue;
      }
      island.lastSync = { x: t.x, y: t.y, z: t.z,
        qx: r.x, qy: r.y, qz: r.z, qw: r.w };
      // The section's own rotation, in scratch nothing else touches.
      //
      // This is the ball of masonry, and it was never physics at all. The body
      // rotation used to be held in `this._q` and the offset in `this._v` —
      // which are the same two scratch objects `_writeMatrix` uses, and
      // `_writeMatrix` is called at the bottom of this very loop. So the first
      // stone of a section was placed correctly and then had `this._q`
      // overwritten with its own world rotation; the second stone's local
      // offset was rotated by *that* instead of by the body's, the third by the
      // second's, and so on down the section.
      //
      // What that draws is a section's stones sprayed around the body's origin
      // at assorted angles: a long thin piece of tower, seventeen metres by
      // eighteen by fifty-seven, drawn as a sixty-metre ball. It moves as one
      // lump because it really is one rigid body, and it sinks slowly because
      // that body is falling — which is exactly what it looks like. The
      // colliders were always in the right place; only the drawing was wrong,
      // which is why every physics fix made no difference to it.
      const bq = this._islandQ || (this._islandQ = new THREE.Quaternion());
      const bv = this._islandV || (this._islandV = new THREE.Vector3());
      const lq = this._islandLQ || (this._islandLQ = new THREE.Quaternion());
      bq.set(r.x, r.y, r.z, r.w);
      const bn = bq.lengthSq();
      if (!(bn > 0.99 && bn < 1.01)) {
        if (bn > 1e-6 && isFinite(bn)) bq.normalize(); else bq.set(0, 0, 0, 1);
      }
      for (let m = 0; m < island.members.length; m++) {
        const i = island.members[m];
        if (!(this.flags[i] & ALIVE)) continue;
        bv.set(island.localPos[m * 3], island.localPos[m * 3 + 1], island.localPos[m * 3 + 2]);
        bv.applyQuaternion(bq);
        this.px[i] = t.x + bv.x;
        this.py[i] = t.y + bv.y;
        this.pz[i] = t.z + bv.z;
        lq.set(island.localQuat[m * 4], island.localQuat[m * 4 + 1],
          island.localQuat[m * 4 + 2], island.localQuat[m * 4 + 3]);
        lq.premultiply(bq);
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
   *
   * `opts.dir` is the direction the round was travelling and `opts.kinetic` how
   * much of its effect comes from momentum rather than blast. A shoulder-fired
   * HEAT round detonates on the surface and throws rubble in every direction;
   * a 155 mm shell arriving at 200 m/s carries that momentum straight through
   * the wall, and the masonry leaves the far side. Getting this right is what
   * makes the direction you shoot from legible in the debris — hit the north
   * face and the stone lands to the south.
   *
   * Returns the number of stones destroyed.
   */
  explode(center, lethal, radius, power, opts = {}) {
    const destroyed = [];
    const thrown = [];
    const r2 = radius * radius;

    // Rubble that settled on this wall is about to have the wall taken out
    // from under it. It is fixed scenery by now, so nothing in the solver will
    // ever notice — this is where to notice, once per blast.
    this.physics.wakeNear(center, radius * 2.4);

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

    // Shock damage to the mortar, out to well beyond the crater.
    //
    // A stone that survives a near miss looking untouched is not undamaged: the
    // joints around it have been shaken apart, and a course whose mortar has
    // gone carries a fraction of what it did. Without this the model says a
    // tower with one face cleanly removed still has a fivefold margin in
    // compression — which is arithmetically true of undamaged masonry, and has
    // nothing to do with what is left after six rounds of 105 mm.
    const shockR = radius * 2.4;
    const shockR2 = shockR * shockR;
    for (let i = 0; i < this.count; i++) {
      if (!(this.flags[i] & ALIVE)) continue;
      if (this.bond[i] <= 0.16) continue;
      const dx = this.px[i] - center.x;
      const dy = this.py[i] - center.y;
      const dz = this.pz[i] - center.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > shockR2) continue;
      const f = 1 - Math.sqrt(d2) / shockR;
      this.bond[i] = Math.max(0.15, this.bond[i] - f * f * 0.7);
    }

    // Anything already leaning takes the hit as a real impulse on the section,
    // so shelling a tower that is out of plumb visibly rocks it.
    if (this.islands.size) {
      for (const island of this.islands.values()) {
        if (!island.settling || !PhysicsWorld.alive(island.body)) continue;
        const t = island.body.translation();
        const dx = t.x - center.x, dy = t.y - center.y, dz = t.z - center.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        if (d > radius * 9) continue;
        // Deliberately not scaled to the island's mass. A shell genuinely does
        // rock a loose two-hundred-stone chunk and genuinely does not move a
        // thirteen-thousand-tonne tower; the impulse being negligible against
        // the big one is the correct answer, not a missing feature.
        const scale = power * 30 / (1 + d * 0.2);
        island.body.applyImpulseAtPoint(
          {
            x: (opts.dir ? opts.dir.x : dx / d) * scale,
            y: (opts.dir ? opts.dir.y : dy / d) * scale * 0.3,
            z: (opts.dir ? opts.dir.z : dz / d) * scale,
          },
          { x: center.x, y: center.y, z: center.z },
          true,
        );
      }
    }

    // Throw the survivors on the rim. This is what turns a hole into a spray of
    // masonry rather than a clean bite — and the mix of radial blast and the
    // round's own momentum is what aims that spray.
    const dir = opts.dir || null;
    const kinetic = Math.max(0, Math.min(1, opts.kinetic ?? 0.3));
    const budget = this.physics.reclaim(Math.min(thrown.length, 220));
    let used = 0;
    for (const t of thrown) {
      if (used >= budget) break;
      if (t.falloff < 0.12) continue;
      const inv = 1 / (t.d || 1);
      const mag = power * t.falloff * 0.0055 * this.mass[t.i];

      let ix = t.dx * inv, iy = t.dy * inv, iz = t.dz * inv;
      if (dir) {
        // Blend the radial push toward the line of flight. Stones already on
        // the far side get the full downrange kick; stones on the near side are
        // partly shielded and mostly just spall outward.
        const facing = ix * dir.x + iy * dir.y + iz * dir.z;   // +1 downrange
        const w = kinetic * (0.55 + 0.45 * Math.max(0, facing));
        ix = ix * (1 - w) + dir.x * w;
        iy = iy * (1 - w) + dir.y * w;
        iz = iz * (1 - w) + dir.z * w;
        const len = Math.hypot(ix, iy, iz) || 1;
        ix /= len; iy /= len; iz /= len;
      }

      const imp = {
        x: ix * mag,
        y: iy * mag + mag * (0.28 - kinetic * 0.16),
        z: iz * mag,
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
    // Always forget the handle, even if the lookup below finds nothing: a
    // stale entry is how one stone ends up removing another stone's collider.
    this.colliderOf[i] = -1;
    if (h < 0) return;
    this.colliderToChunk.delete(h);
    const col = this.physics.world.getCollider(h);
    // And only remove it if it is still the collider we think it is. Handles
    // are reused, so a slot freed elsewhere can come back holding somebody
    // else's collider between one frame and the next.
    if (col && col.handle === h) this.physics.world.removeCollider(col, true);
  }

  /** Give a stone its own dynamic body. Returns false if the budget is spent. */
  freeChunk(i, impulse) {
    if (!(this.flags[i] & ALIVE)) return false;
    if (this.flags[i] & FREE) {
      const have = this.bodyOf[i];
      if (!PhysicsWorld.alive(have)) {
        // Flagged free with no body behind it: the body went and the flag did
        // not. Clear it and fall through to build a fresh one rather than
        // reaching into a corpse.
        this.flags[i] &= ~FREE;
        this.bodyOf[i] = null;
      } else {
        if (impulse) have.applyImpulse(impulse, true);
        return true;
      }
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
    const bearing = this._bearing;
    bearing.fill(0);
    for (let k = n - 1; k >= 0; k--) {
      const i = byHeight[k];
      if (!(this.flags[i] & ALIVE)) continue;
      if (this.flags[i] & (FREE | ISLAND)) continue;
      if (this.flags[i] & GROUNDED) { reach[i] = 1; bearing[i] = 1; continue; }
      for (let a = this.belowStart[i]; a < this.belowStart[i + 1]; a++) {
        if (reach[this.belowList[a]]) { reach[i] = 1; bearing[i] = 1; break; }
      }
    }

    // Spanning, measured in metres of reach rather than in stones.
    //
    // A lintel over a door, a slab between two walls and a modest corbel all
    // carry load sideways for a short distance, and a model with no beam action
    // at all drops every floor and roof in the building on the first frame. But
    // the budget has to be a physical distance: in hops it changed with the
    // quality tier, and four hops of small stone reached far enough from both
    // sides of an eight-metre crater to declare the wall above it supported.
    // That single line is most of why the tower used to survive having its base
    // shot out.
    // Relaxed in a fixed number of sweeps rather than with a work queue: the
    // longest reach is a few metres and the stones are of the order of a metre,
    // so six passes settle it, and a bounded loop cannot be made to spin by a
    // pathological joint graph.
    const span = this._spanBudget;
    span.fill(0);
    for (let i = 0; i < n; i++) if (bearing[i]) span[i] = this.spanReach[i];
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (let k = 0; k < n; k++) {
        const i = byHeight[k];
        const budget = span[i];
        if (budget <= 0) continue;
        for (let a = this.sideStart[i]; a < this.sideStart[i + 1]; a++) {
          const j = this.sideList[a];
          if (!(this.flags[j] & ALIVE)) continue;
          if (this.flags[j] & (FREE | ISLAND)) continue;
          const step = Math.hypot(this.px[j] - this.px[i], this.pz[j] - this.pz[i]);
          // A stone's own reach caps what it can pass on: a deep slab relays
          // further than a thin course of wall stones.
          const left = Math.min(budget - step, this.spanReach[j]);
          if (left <= span[j] + 0.01) continue;
          span[j] = left;
          reach[j] = 1;
          changed = true;
        }
      }
      if (!changed) break;
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
    let top = this.groundY;
    const mask = this._winMask;
    for (let i = 0; i < n; i++) {
      if (!(this.flags[i] & ALIVE)) continue;
      if (this.flags[i] & FREE) continue;
      if (this.flags[i] & ISLAND) {
        // A leaning-but-not-fallen section is still standing masonry.
        if (this._isSettling(i)) {
          standing += this.mass[i];
          top = Math.max(top, this.py[i] + this.hy[i]);
          if (mask && mask[i]) winStanding += this.mass[i];
        }
        continue;
      }
      if (reach[i]) {
        standing += this.mass[i];
        top = Math.max(top, this.py[i] + this.hy[i]);
        if (mask && mask[i]) winStanding += this.mass[i];
        continue;
      }
      detached.push(i);
    }
    this.standingMass = standing;
    this._winStanding = winStanding;
    // Cached here rather than rescanned by `standingHeight`, because the flags
    // alone cannot tell the difference between masonry that is standing and
    // rubble the body budget could not afford to set in motion. Both are
    // "alive and not dynamic"; only the support solver knows which is which.
    this._standingTop = top;

    // A large section still sitting on surviving masonry has not fallen — it
    // has *settled onto it*. Handing it to the physics engine in that state is
    // the difference between a tower that vanishes downward the instant the
    // solver condemns it and one that sags into its crater, leans, and then
    // makes up its mind.
    let leanBand = -1, leanRatio = 0;
    // Groups handed to the lean instead of being released. If no lean actually
    // arms, they have to be let go — see below.
    const deferred = [];
    for (const group of this._connectedGroups(detached)) {
      let groupMass = 0;
      for (const i of group) groupMass += this.mass[i];
      // Leaning is a whole-structure gesture: it rotates everything above a
      // slice. Arming it for a detached pinnacle would tilt the entire tower
      // because one piece of ornament came loose, so it is reserved for a
      // section big enough that "the building is going over" is a fair
      // description of what just happened.
      if (group.length > WELD_THRESHOLD
          && groupMass > this._significantLoad * 3
          && this._restingCount(group, reach) >= 4) {
        // It has lost its bearing but it is still sitting on the stumps. Let
        // it lean off them rather than dropping it: a section this size handed
        // straight to the contact solver sinks through its own base.
        let lowest = this.bandCount;
        for (const i of group) lowest = Math.min(lowest, this.bandOf[i]);
        if (leanBand < 0 || lowest < leanBand) leanBand = lowest;
        leanRatio = Math.max(leanRatio, NO_EQUILIBRIUM * 0.9);
        deferred.push(group);
      } else {
        this._releaseGroup(group);
      }
    }
    if (detached.length) this.stabilityDirty = true;

    // Connectivity is satisfied at this point. What remains is the question it
    // cannot answer: can what is left still *carry* the mass above it without
    // the joints opening up? That is the bearing analysis, and it is what
    // brings a cut tower down.
    //
    // A section that has already gone dynamic but is still leaning in place is
    // folded into the load it puts on the base, so the crushing underneath it
    // carries on and the lean keeps getting worse.
    const carried = this._carried || (this._carried = new Uint8Array(n));
    let anyCarried = false;
    if (this.islands.size) {
      carried.fill(0);
      for (const island of this.islands.values()) {
        if (!island.settling) continue;
        for (const j of island.members) {
          if (this.flags[j] & ALIVE) { carried[j] = 1; anyCarried = true; }
        }
      }
    }
    const loadMask = anyCarried ? this._mergeMask(reach, carried) : reach;

    const bearing2 = this._bearingAnalysis(loadMask, reach);
    if (bearing2.band > 0 && bearing2.ratio > 0.5
        && (bearing2.band < leanBand || leanBand < 0)) {
      leanBand = bearing2.band;
      leanRatio = Math.max(leanRatio, bearing2.ratio);
    }

    // Arm on the cut, not on the failure.
    //
    // Waiting for the stress analysis to condemn a slice meant the lean only
    // started once the load was already within a few per cent of walking off
    // the edge of what was left — so the structure went from dead upright to
    // gone inside one tick, with none of the six seconds of accelerating tilt
    // the whole mechanism exists to produce. A building whose bearing has been
    // cut is settling *now*; whether that settlement runs away or stops is
    // then decided, honestly, by the margin it has left.
    if (bearing2.cutBand > 0 && bearing2.cutFrac < 0.86
        && (bearing2.cutBand < leanBand || leanBand < 0)) {
      leanBand = bearing2.cutBand;
      leanRatio = Math.max(leanRatio, bearing2.ratio);
    }

    // Balance, as opposed to stress. A slice can be comfortably in compression
    // and still be carrying a load that has walked off the edge of it.
    const overturn = this._checkOverturning(reach);
    if (overturn > 0 && (overturn < leanBand || leanBand < 0)) {
      leanBand = overturn;
      leanRatio = Math.max(leanRatio, NO_EQUILIBRIUM);
    }

    // Everything that is failing — overloaded, off-centre, or simply resting on
    // stumps — becomes the *same* thing: a lean. There is one control path out
    // of "standing" and it runs through `tickLean`, which grows the tilt at a
    // rate set by how badly the bearing is overworked and only hands the
    // section to the physics engine once it is past the point of recovery.
    //
    // The alternative, handing a failing structure straight to the contact
    // solver, is what this used to do, and it is why the tower either ignored
    // the shelling completely or vanished downward in a single frame: a
    // thirteen-thousand-tonne welded body resting on a damaged base sinks
    // through it. Falling is the right answer eventually — but only after it
    // has visibly gone over, and by then it is falling through air.
    if (leanBand > 0) this._armLean(leanBand, leanRatio, loadMask, reach);

    // Nothing may be deferred to a lean that never comes.
    //
    // A group that has lost its bearing is handed to the lean rather than
    // released, on the understanding that the lean will carry it. But
    // `_armLean` refuses for perfectly good reasons — the slice has already
    // let go once and cannot lean again, the mass above it is too small to be
    // worth tilting, the bearing has no area left — and when it refuses,
    // nobody released the group either. Those stones then sit exactly where
    // they were: alive, unsupported, and still fixed bodies, which is masonry
    // hanging motionless in the air over a demolished building. Measured at
    // its worst: a thousand stones, the highest eighty-six metres up.
    if (deferred.length && !this.lean) {
      for (const group of deferred) this._releaseGroup(group);
    }

    this.lastStressRatio = bearing2.ratio;
    this.lastStressBand = bearing2.band;
    this.lastCutFrac = bearing2.cutFrac;
    const moved = 0;

    // A leaning section is damaged, not demolished. It is still up, it is still
    // the thing the player is trying to bring down, and the readout has to say
    // so — otherwise the integrity bar empties the instant the tower tilts and
    // the level is won while it is still standing there at eighty degrees.
    if (this.lean) {
      let extra = 0, extraWin = 0;
      for (let i = 0; i < n; i++) {
        if (reach[i] || !this._leaning(i)) continue;
        extra += this.mass[i];
        top = Math.max(top, this.py[i] + this.hy[i]);
        if (mask && mask[i]) extraWin += this.mass[i];
      }
      this.standingMass += extra;
      this._winStanding += extraWin;
      this._standingTop = top;
    }

    const toppled = 0;
    if (moved || bearing2.crushed) {
      let remaining = 0;
      for (let i = 0; i < n; i++) {
        if (!(this.flags[i] & ALIVE)) continue;
        if (this.flags[i] & FREE) continue;
        if (this.flags[i] & ISLAND) {
          if (this._isSettling(i)) remaining += this.mass[i];
          continue;
        }
        if (reach[i]) remaining += this.mass[i];
      }
      this.standingMass = remaining;
    }

    return detached.length + crushed.length + toppled + moved + bearing2.crushed;
  }

  /**
   * Settlement, and the lean that comes with it.
   *
   * A masonry structure carrying an off-centre load does not stand perfectly
   * still until the moment it fails. The overloaded edge crushes — not much,
   * and not fast, but continuously — and the whole thing above rotates about
   * the compression edge as it does. That rotation moves the centre of mass
   * further out, which loads the edge harder, which crushes it faster. Towers
   * lean for years doing this; a tower being shelled does it in seconds.
   *
   * Modelling it as a rotation rather than by handing the mass to the contact
   * solver is a deliberate choice. Thirteen thousand tonnes of welded masonry
   * resting on a damaged stump is a mass ratio no iterative solver will hold:
   * it sinks through its own base and the tower drops like a lift. A rigid
   * rotation about the bearing edge is what actually happens, costs nothing,
   * and stays under control right up to the point where the structure really
   * is going over — and *then* Rapier gets it, and does the part it is good at.
   */
  /**
   * Is the load actually past the base it would land on?
   *
   * `reachOut` measures the bearing in the hinge band, which is the right
   * quantity for the creep: that band is what is being crushed. It is the
   * wrong quantity for deciding to hand the section to Rapier, because Rapier
   * will not rest it on that band — the band is going with it. What catches it
   * is the stump underneath, which on a tower shelled from one side is wider
   * than the slice that failed, and a section whose centre of mass is still
   * over that stump is a stable stack. Hand one of those over and it sits
   * exactly where it was, and — because the slice is then marked as fallen and
   * can never lean again — the tower stands there for the rest of the match
   * with its base shot out. Measured: eighty-five per cent intact, peak lean
   * 7.58°, no height lost at all.
   *
   * So the handover asks about the stump: three bands of it, which is as far
   * down as a toppling section can reasonably come to rest.
   */
  _overPhysicalBase(L) {
    const dx = L.axisZ, dz = -L.axisX;
    const offset = (L.off0 ?? 0) * Math.cos(L.angle) + (L.comH ?? 20) * Math.sin(L.angle);
    let widest = 0;
    const from = Math.max(0, L.band - 3);
    for (let b = from; b < L.band; b++) {
      for (let k = this.bandStart[b]; k < this.bandStart[b + 1]; k++) {
        const j = this.bandList[k];
        if (!(this.flags[j] & ALIVE)) continue;
        // Rubble counts. A section coming over does not care whether what
        // catches it is masonry that is still standing or the heap of its own
        // building that fell an hour ago — and the heap is usually wider than
        // the stump, because that is what a heap is. Leaving it out is how
        // this still handed over sections that then sat on the pile.
        const proj = (this.px[j] - L.pivotX) * dx + (this.pz[j] - L.pivotZ) * dz
          + Math.abs(this.hx[j] * dx) + Math.abs(this.hz[j] * dz);
        if (proj > widest) widest = proj;
      }
    }
    // Nothing underneath at all: whatever is up there is going over.
    if (widest <= 0.05) return true;
    return offset > widest;
  }

  _armLean(band, ratio, loadMask, reach) {
    const b = band;
    if (b <= 0) return;
    if (this._fallenBand !== undefined && b >= this._fallenBand) return;
    // Once a lean is running, keep it: re-arming on a different slice every
    // tick would make the pivot jitter. But the *geometry* of a running lean
    // still has to be re-measured, because the thing that decides whether a
    // tower recovers or goes over is how far its bearing still reaches, and
    // every shell that lands takes some of that away.
    let refresh = false;
    if (this.lean) {
      // Keep feeding the running lean: the creep rate is driven by how hard
      // the bearing is working *now*, so without this it stalls at whatever
      // angle it reached in the first second and never moves again.
      this.lean.ratio = Math.max(this.lean.ratio, ratio);
      if (this.lean.band < b) return;
      if (this.lean.band === b) refresh = true;
      else {
        // Something lower has started to fail. That becomes the new hinge, and
        // the tilt it has already accumulated carries over.
        const carryAngle = this.lean.angle, carryVel = this.lean.vel;
        const carryTarget = this.lean.target;
        this.lean = null;
        this._leanCarry = { angle: carryAngle, vel: carryVel, target: carryTarget };
      }
    }

    // Which way is it going? The direction from the surviving bearing's
    // centroid toward the centre of mass it is carrying.
    const s0 = this.bandStart[b - 1], s1 = this.bandStart[b];
    let area = 0, cx = 0, cz = 0;
    for (let k = s0; k < s1; k++) {
      const j = this.bandList[k];
      if (!reach[j] || !this.structural[j]) continue;
      const a = 4 * this.hx[j] * this.hz[j];
      area += a; cx += this.px[j] * a; cz += this.pz[j] * a;
    }
    if (area <= 0.01) return;
    cx /= area; cz /= area;

    const basis = this._leanBasis();
    const lp = this._leanPt || (this._leanPt = { x: 0, y: 0, z: 0 });
    let mAbove = 0, mx = 0, mz = 0, my = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.bandOf[i] < b) continue;
      if (!(this.flags[i] & ALIVE) || (this.flags[i] & FREE)) continue;
      if ((this.flags[i] & ISLAND) && !this._isSettling(i)) continue;
      const m = this.mass[i];
      let x = this.px[i], z = this.pz[i];
      if (basis && this.bandOf[i] >= basis.band && !(this.flags[i] & ISLAND)) {
        this._leanApply(basis, x, this.py[i], z, lp);
        x = lp.x; z = lp.z;
      }
      mAbove += m; mx += x * m; mz += z * m; my += this.py[i] * m;
    }
    // Nothing worth tilting above this slice.
    if (mAbove < this._significantLoad * 3) return;
    const pivotY = this.groundY + b * this.bandHeight;
    let dx = mx / mAbove - cx, dz = mz / mAbove - cz;
    const off = Math.hypot(dx, dz);
    if (off < 0.05) { dx = 1; dz = 0; } else { dx /= off; dz /= off; }

    // How far the surviving bearing still reaches the way the load is going.
    // This is the tipping edge: a building goes over when the resultant walks
    // past it, and the whole of the drama is in how close it gets.
    let reachOut = 0;
    for (let k = s0; k < s1; k++) {
      const j = this.bandList[k];
      if (!reach[j] || !this.structural[j]) continue;
      const proj = (this.px[j] - cx) * dx + (this.pz[j] - cz) * dz
        + Math.abs(this.hx[j] * dx) + Math.abs(this.hz[j] * dz);
      if (proj > reachOut) reachOut = proj;
    }
    // Lever arm of the load above the hinge. Rotating by theta walks the
    // centre of mass out by comH * sin(theta) — which for a tower is metres
    // per degree, and is why a lean that starts never simply stops.
    const comH = Math.max(0.5, my / mAbove - pivotY);

    if (refresh && this.lean) {
      this.lean.reachOut = reachOut;
      this.lean.comH = comH;
      this.lean.off0 = off;
      return;
    }

    const carry = this._leanCarry || { angle: 0, vel: 0, target: 0 };
    this._leanCarry = null;
    this.lean = {
      band: b,
      pivotX: cx, pivotY, pivotZ: cz,
      // It rotates *toward* (dx, dz), which is a rotation about the horizontal
      // axis perpendicular to that.
      axisX: -dz, axisZ: dx,
      angle: carry.angle, vel: carry.vel, target: carry.target,
      ratio, reachOut, comH, off0: off,
    };
  }

  /**
   * Advance the lean. Called once a frame with real time.
   *
   * The target angle creeps while the bearing is overworked; the actual angle
   * chases it through a lightly damped spring, which is what gives a shelled
   * tower its sway — hit it and it rings, leave it and it settles into its new
   * attitude. Past the critical angle the centre of mass is outside the base
   * for real and the section is handed to the physics engine to fall.
   */
  tickLean(dt) {
    const L = this.lean;
    if (!L) return 0;

    // Where the load is standing now, measured along the direction of tilt:
    // its static offset, plus what the tilt itself has added.
    const comH = L.comH ?? 20;
    const reachOut = Math.max(0.25, L.reachOut ?? 1);
    const offset = (L.off0 ?? 0) * Math.cos(L.angle) + comH * Math.sin(L.angle);
    // 1.0 means the resultant is standing on the very edge of what is left.
    const tip = offset / reachOut;
    L.tip = tip;

    // How hard the compression edge is working, by two measures, whichever is
    // worse.
    //
    // The stress ratio alone was not enough, and the reason is a real property
    // of masonry rather than a bug: good stone crushes at about 14 MPa and even
    // a ninety-metre tower only puts 2 MPa on its own foot, so the arithmetic
    // says "comfortable" right up until the bearing has been cut down to a
    // strip a metre wide — at which point the structure goes from untouched to
    // gone between two shells, with no lean worth the name in between.
    //
    // What that misses is that long before the *average* stress matters, the
    // resultant walking out toward the edge of the bearing piles the whole load
    // onto the last stones on that side, and those crush. So the geometry gets
    // a vote: once the load is past halfway to the edge, the edge is failing,
    // and how fast follows the square of how far out it has got.
    const geo = Math.max(0, (tip - 0.45) / 0.55);
    const over = Math.max(Math.max(0, (L.ratio || 0) - 0.6), geo * geo * 1.6);
    L.ratio *= Math.pow(0.6, dt);      // decays unless the analysis renews it

    if (tip >= 1) {
      // ── Past the edge: an inverted pendulum, and nothing else.
      //
      // Once the resultant has walked outside the bearing there is no restoring
      // moment left and no more arithmetic to do — the section is a stack of
      // masonry hinging on its own compression edge, and gravity does the rest.
      // Torque is the weight times the overhang past that edge, and the second
      // moment is that of a slender stack of height 2*comH about its foot.
      //
      // This is where the drama lives, and it comes out of the mechanics rather
      // than a timer: the overhang starts at centimetres, so the first degree
      // takes seconds, and each degree adds comH*dTheta of fresh overhang, so
      // the last five take well under one. It accelerates because towers do.
      L.committed = true;
      const overhang = offset - reachOut;
      const alpha = 3 * 9.81 * overhang / (4 * comH * comH);
      L.vel += alpha * LEAN_GRAVITY * dt;
      L.angle += L.vel * dt;
      L.target = L.angle;
    } else if (L.committed) {
      // Momentum carries it on through a moment of recovered balance.
      L.angle += L.vel * dt;
      L.vel = Math.max(0, L.vel - 0.4 * dt);
      L.target = L.angle;
    } else {
      // ── Still inside the bearing: creep, driven by the crushing edge.
      //
      // Expressed as the rate the bearing is being consumed rather than as an
      // angle, because a degree per second means nothing without knowing how
      // tall the thing is: what matters is how fast the resultant travels
      // toward the edge, and the lever arm converting the two is the height of
      // the load above the hinge.
      const crush = Math.min(0.32, 0.06 * over);
      L.target += crush * (reachOut / comH) * dt;

      // Crushing eats the bearing, and the bearing does not grow back.
      //
      // This is the ratchet that makes a collapse a collapse. The edge the
      // load is standing on is being crushed — that is what `over` means — and
      // every millimetre of it that goes is a millimetre the resultant is
      // closer to the edge for good. Without it the arithmetic is reversible:
      // shell the base, watch the tower lean, and then watch it stand back up
      // because the analysis stopped condemning it, which is the one thing
      // masonry never does. Measured on the self-test, that recovery was the
      // whole of the remaining "it kept two thirds of itself and lost no
      // height at all" failures.
      if (L.reachOut0 === undefined) L.reachOut0 = reachOut;
      if (over > 0.001) {
        L.reachOut = Math.max(0.25, reachOut - crush * reachOut * 0.5 * dt);
      }

      // Nothing is allowed to stand still out of plumb.
      //
      // A lean used to hold whatever angle it happened to reach: the creep rate
      // fell to zero once the bearing analysis stopped condemning the slice,
      // the spring settled, and the tower stood there at four degrees for the
      // rest of the level. That is the one outcome masonry never produces.
      // Either the damage is winning, in which case it keeps going, or it is
      // not, in which case the structure straightens back onto its bearing.
      // Straightening is only for a building that has not yet been hurt. Once
      // it is properly out of plumb, or once a real part of its bearing has
      // been crushed away, there is no way back onto it.
      const recoverable = L.angle < 0.026                 // about a degree and a half
        && L.reachOut > (L.reachOut0 ?? reachOut) * 0.92;
      if (over <= 0.001 && recoverable) {
        L.target = Math.max(0, L.target - 0.09 * dt);
        if (L.target <= 0 && L.angle < 0.0035 && Math.abs(L.vel) < 0.004) {
          // Put the colliders back on the geometry before forgetting the lean,
          // or the building is drawn upright and shot at where it used to be.
          L.angle = 0; L.vel = 0;
          this._syncLeanColliders();
          this._leanWasBand = L.band;
          this.lean = null;
          this._leanDirty = true;
          this.markMeshDirty();
          return 0;
        }
      }

      // Nothing waits out of plumb for a commitment that is not coming.
      //
      // With the bearing ratchet in place a lean can no longer straighten once
      // it is properly over, so a slice that stops being condemned by the
      // analysis would otherwise hold its angle for the rest of the level.
      // After a couple of seconds of that, the decision is made for it: a
      // tower that has stood at five degrees for two seconds is going over.
      if (over <= 0.001 && L.angle > 0.026) {
        L.idle = (L.idle || 0) + dt;
        if (L.idle > 2.5) {
          L.committed = true;
          L.vel = Math.max(L.vel, 0.05);
        }
      } else {
        L.idle = 0;
      }

      // Lightly damped second-order chase, so it sways rather than sliding.
      const k = 26, c = 1.6;
      L.vel += (k * (L.target - L.angle) - c * L.vel) * dt;
      L.angle += L.vel * dt;
    }
    if (L.angle < 0) { L.angle = 0; L.vel = Math.max(0, L.vel); }

    this._leanDirty = true;
    this.markMeshDirty();
    // The worst it has ever been, kept for the life of the structure. The
    // suite's collapse test runs last by necessity and by then the tower has
    // taken enough real damage to be a stump, which has no lean in it — so
    // without a high-water mark there is nothing left to assert the mechanism
    // against on the level it matters most for.
    const deg = L.angle * 180 / Math.PI;
    if (deg > (this.peakLean || 0)) this.peakLean = deg;
    if (this.onLean) this.onLean(L);

    // Keep the bearing analysis alive while it leans. The solver only runs
    // when something has changed, so without this a structure that is still
    // genuinely overloaded stops creeping the moment the dust settles, and the
    // lean freezes at whatever angle it reached in the first second.
    L.poll = (L.poll || 0) + dt;
    if (L.poll > 0.4) { L.poll = 0; this.stabilityDirty = true; }

    // Hand over on the angle *and* on commitment, which are two different
    // questions and both have to be yes.
    //
    // The angle alone was the rule, on the grounds that passing the tipping
    // point is what starts a fall rather than what finishes it — a section
    // handed over while essentially upright sits back down on its own stumps.
    // True, and the mirror of it is just as true: a section handed over at
    // seven and a half degrees that has *never* had its resultant outside its
    // bearing is still a stable stack, and Rapier quite correctly leaves it
    // standing. Measured on a failing run: peak lean 7.58°, handed over at
    // 7.45°, and the tower finished the test sixty-eight per cent intact and
    // exactly as tall as it started.
    //
    // So: it goes when it is leaning far enough *and* something has actually
    // committed it — the resultant has walked outside the bearing at some
    // point — or when it is so far out of plumb that the question is academic.
    if (L.angle > LEAN_CRITICAL
      && (this._overPhysicalBase(L) || L.angle > 0.21)) {
      // Going over. Hand it to Rapier from exactly where it is standing now,
      // moving exactly the way it is already moving.
      const band = L.band;
      this._lastLeanState = {
        axisX: L.axisX, axisZ: L.axisZ, vel: L.vel,
        pivotX: L.pivotX, pivotY: L.pivotY, pivotZ: L.pivotZ,
      };
      this._bakeLean();
      const moved = this._goDynamic(band, this._reach);
      this.lean = null;
      this.stabilityDirty = true;
      // A slice that has let go cannot lean again — there is nothing standing
      // on it any more. Without this the solver re-armed the same slice on the
      // next tick, tipped it on the one after, and sat in that loop for the
      // rest of the level, baking a fraction of a degree each time.
      if (moved) {
        this._fallenBand = Math.min(this._fallenBand ?? Infinity, band);
        // ...provisionally. A slice that has let go cannot lean again, which
        // is true of a slice that *went* — and a disaster for one that was
        // handed over and then sat down on the rubble, because the lockout
        // applies to every band above it too and the building can never lean
        // again at all. That is how a tower finished a test sixty-eight per
        // cent intact with seventy rounds still to come and no mechanism left
        // that could bring it down. So the lockout is watched, and lifted if
        // the section is still standing where it was a few seconds later.
        this._fallenWatch = {
          band,
          top: this.standingHeight(),
          t: 0,
        };
      }
      return 1;
    }
    // Keep the colliders roughly with the geometry so shells still hit the
    // tower where it is drawn. Four-hertz is plenty at these angles and avoids
    // rewriting several thousand collider transforms every frame.
    this._leanColliderTimer = (this._leanColliderTimer || 0) + dt;
    if (this._leanColliderTimer > 0.25) {
      this._leanColliderTimer = 0;
      this._syncLeanColliders();
    }
    return 0;
  }

  /**
   * The lean as bare scalars.
   *
   * `_leanPosition` is the same rotation through THREE.Quaternion, which is
   * fine for a few hundred stones a frame but not for several thousand inside
   * the stability solver. This form is allocation-free and applies with nine
   * multiplies, so the bearing analysis can afford to ask where every stone in
   * the building actually is.
   */
  _leanBasis() {
    const L = this.lean;
    if (!L || L.angle <= 1e-5) return null;
    const n = Math.hypot(L.axisX, L.axisZ) || 1;
    return {
      ax: L.axisX / n, az: L.axisZ / n,
      c: Math.cos(L.angle), s: Math.sin(L.angle),
      ox: L.pivotX, oy: L.pivotY, oz: L.pivotZ,
      band: L.band,
    };
  }

  /** Rodrigues rotation of one point about the lean's horizontal hinge. */
  _leanApply(B, x, y, z, out) {
    const rx = x - B.ox, ry = y - B.oy, rz = z - B.oz;
    const dot = B.ax * rx + B.az * rz;          // a · r  (a has no y term)
    const k = (1 - B.c) * dot;
    out.x = B.ox + rx * B.c + (-B.az * ry) * B.s + B.ax * k;
    out.y = B.oy + ry * B.c + (B.az * rx - B.ax * rz) * B.s;
    out.z = B.oz + rz * B.c + (B.ax * ry) * B.s + B.az * k;
    return out;
  }

  /** The lean as a rotation, reused rather than rebuilt per stone. */
  _leanTransform() {
    const L = this.lean;
    if (!L) return null;
    const q = this._leanQ || (this._leanQ = new THREE.Quaternion());
    const axis = this._leanAxis || (this._leanAxis = new THREE.Vector3());
    axis.set(L.axisX, 0, L.axisZ).normalize();
    q.setFromAxisAngle(axis, L.angle);
    return q;
  }

  /** Is this stone carried by the current lean? */
  _leaning(i) {
    const L = this.lean;
    return !!L && this.bandOf[i] >= L.band
      && (this.flags[i] & ALIVE) && !(this.flags[i] & (FREE | ISLAND));
  }

  /** Write the leaned position of a stone into `out`. */
  _leanPosition(i, out) {
    const L = this.lean;
    const q = this._leanTransform();
    out.set(this.px[i] - L.pivotX, this.py[i] - L.pivotY, this.pz[i] - L.pivotZ);
    out.applyQuaternion(q);
    out.set(out.x + L.pivotX, out.y + L.pivotY, out.z + L.pivotZ);
    return out;
  }

  _syncLeanColliders() {
    const L = this.lean;
    if (!L) return;
    const q = this._leanTransform();
    const v = this._v;
    const rot = this._leanRot || (this._leanRot = new THREE.Quaternion());
    const own = this._leanOwn || (this._leanOwn = new THREE.Quaternion());
    for (let i = 0; i < this.count; i++) {
      if (!this._leaning(i)) continue;
      const h = this.colliderOf[i];
      if (h < 0) continue;
      const col = this.physics.world.getCollider(h);
      // Handles are reused, so a stale one can resolve to a live collider that
      // belongs to something else entirely — and moving that is how one stone's
      // lean teleports another stone across the map.
      if (!col || col.handle !== h) continue;
      this._leanPosition(i, v);
      const half = this.ry[i] * 0.5;
      own.set(0, Math.sin(half), 0, Math.cos(half));
      rot.copy(q).multiply(own);
      col.setTranslationWrtParent({ x: v.x, y: v.y, z: v.z });
      col.setRotationWrtParent({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
    }
  }

  /** Fold the lean into the stones' own transforms and forget it. */
  _bakeLean() {
    const L = this.lean;
    if (!L) return;
    const q = this._leanTransform().clone();
    const v = this._v;
    this._ensureQuatArrays();
    const own = new THREE.Quaternion();
    const rot = new THREE.Quaternion();
    for (let i = 0; i < this.count; i++) {
      if (!this._leaning(i)) continue;
      this._leanPosition(i, v);
      this.px[i] = v.x; this.py[i] = v.y; this.pz[i] = v.z;
      own.set(this.qx[i], this.qy[i], this.qz[i], this.qw[i]);
      rot.copy(q).multiply(own);
      this.qx[i] = rot.x; this.qy[i] = rot.y; this.qz[i] = rot.z; this.qw[i] = rot.w;
    }
    this._leanWasBand = L.band;
    this.lean = null;
    this._leanDirty = false;
  }

  /** How far out of plumb the structure is right now, in degrees. */
  get leanDegrees() {
    let worst = this.lean ? this.lean.angle * 180 / Math.PI : 0;
    for (const island of this.islands.values()) {
      if (!island.settling) continue;
      worst = Math.max(worst, (island.tilt || 0) * 180 / Math.PI);
    }
    return worst;
  }

  /**
   * Is this section sitting on something, or hanging in the air?
   *
   * The joint graph answers that for a clean break, but not for a shelled one:
   * cut a course out of a tower and the masonry above has no *neighbour*
   * beneath it, yet it is plainly still sitting on the stumps and the rubble in
   * the crater. Treating that as unsupported is what made a tower drop ninety
   * metres in a single frame the moment the last stone of one course went.
   *
   * So: joint contact if there is any, and failing that, whether there is still
   * masonry standing in the few metres underneath it.
   */
  _restingCount(group, reach) {
    let n = 0;
    for (const i of group) {
      for (let a = this.belowStart[i]; a < this.belowStart[i + 1]; a++) {
        if (reach[this.belowList[a]]) { n++; break; }
      }
    }
    if (n) return n;

    let lowBand = this.bandCount;
    for (const i of group) lowBand = Math.min(lowBand, this.bandOf[i]);
    // The ground itself counts: a section whose feet are at grade is resting on
    // the earth, not falling toward it.
    if (lowBand <= 1) return 8;

    // Otherwise: is there masonry under *this section's own footprint*?
    //
    // This used to count every reachable stone in the three bands below,
    // anywhere in the structure — so a tower cut clean through on one side
    // reported itself as resting, because the *other* side of the building was
    // still standing at that height. The section then got the lean treatment
    // instead of being released, and hung in the air above the gap, held up by
    // a hinge with nothing under it. Which is precisely the severed tower left
    // floating at seven degrees.
    //
    // Support is a question about a place, not about a height.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const i of group) {
      if (this.bandOf[i] > lowBand + 1) continue;      // the section's feet
      minX = Math.min(minX, this.px[i] - this._aabbX[i]);
      maxX = Math.max(maxX, this.px[i] + this._aabbX[i]);
      minZ = Math.min(minZ, this.pz[i] - this._aabbZ[i]);
      maxZ = Math.max(maxZ, this.pz[i] + this._aabbZ[i]);
    }
    if (!isFinite(minX)) return 0;
    // A little slack, because a stone half a metre proud of the footprint is
    // still something the section would come down on.
    const PAD = 1.2;
    for (let b = Math.max(0, lowBand - 3); b < lowBand; b++) {
      for (let k = this.bandStart[b]; k < this.bandStart[b + 1]; k++) {
        const j = this.bandList[k];
        if (!reach[j] || !this.structural[j]) continue;
        if (this.px[j] < minX - PAD || this.px[j] > maxX + PAD) continue;
        if (this.pz[j] < minZ - PAD || this.pz[j] > maxZ + PAD) continue;
        n++;
      }
    }
    return n >= 8 ? n : 0;
  }

  /** Union of two masks into a scratch buffer, for the load accounting. */
  _mergeMask(a, b) {
    const out = this._maskScratch || (this._maskScratch = new Uint8Array(this.count));
    for (let i = 0; i < this.count; i++) out[i] = (a[i] || b[i]) ? 1 : 0;
    return out;
  }

  /**
   * Hand the damaged superstructure to the physics engine.
   *
   * Up to this point everything standing is a *fixed* body: it cannot move, so
   * it cannot settle, lean or wobble, and the only thing a solver can do with
   * it is decide it has failed and teleport it into a falling state. That is
   * why shelling the base used to produce either nothing at all or an abrupt
   * collapse, with none of the sag and sway in between.
   *
   * So once a slice is genuinely overstressed, everything above it stops being
   * fixed and becomes one dynamic body resting on the masonry that survives
   * beneath it. From that moment Rapier owns the outcome: the section settles
   * into the crater under its own weight, leans toward the side that lost its
   * bearing, and either finds a new equilibrium — visibly out of plumb — or
   * keeps going and comes down. Nothing about the direction or the timing is
   * scripted; it falls the way you cut it.
   *
   * The base stays fixed on purpose. A heavy dynamic body resting on static
   * geometry is something a constraint solver handles well; the same body
   * resting on a stack of loose one-tonne stones is a mass ratio of ten
   * thousand to one, which it does not.
   */
  _goDynamic(band, reach) {
    // Everything above the hinge that is still standing masonry — *not* only
    // what the support flood can still reach.
    //
    // Filtering on `reach` here was backwards, and it is the reason a demolished
    // tower left thousands of stones hanging motionless in the air. By the time
    // a slice has failed badly enough to go over, the flood has already given up
    // on the masonry above it: those stones are precisely the ones with no
    // support left, so requiring support to fall meant the part of the building
    // that was in the worst trouble was the part that never moved. The height
    // readout, which counts only supported stone, agreed that the tower was
    // down — while the tower was still there.
    const doomed = [];
    for (let bb = band; bb < this.bandCount; bb++) {
      for (let k = this.bandStart[bb]; k < this.bandStart[bb + 1]; k++) {
        const j = this.bandList[k];
        if (!(this.flags[j] & ALIVE) || (this.flags[j] & (FREE | ISLAND))) continue;
        doomed.push(j);
      }
    }
    if (doomed.length < 12) return 0;

    for (const j of doomed) reach[j] = 0;

    // Break the falling part into stacked segments rather than welding it into
    // one body.
    //
    // A single rigid slab is both wrong and ugly. A toppling masonry tower is
    // not a beam — it has no tensile capacity along its length, so it hinges
    // and separates as it goes over, and the top hits the ground long after
    // the base has. Welding the lot into one body gave a ninety-metre domino
    // that lay on the ground fully intact for ten seconds while the fragmenter
    // chewed through it one split at a time, which is exactly what the tower
    // looked like when it had "fallen".
    //
    // It goes over as one body. Not as a stack — as one.
    //
    // Splitting the falling section into segments seemed obviously better, and
    // is catastrophically wrong, for a reason that only shows up when you
    // measure it. A tower topples because *its* centre of mass is outside
    // *its* base. Cut it into pieces and each piece is perfectly stable on the
    // one below: a segment tilted seven degrees has its centre of mass a
    // fraction of a metre off a twelve-metre base, and every interface in the
    // stack is comfortable. So nothing tips. The pile shears sideways instead,
    // held up by its own lower segments the whole way down, and creeps off
    // across the map. Measured at three segments: the section's top sat at
    // 65 m for six solid seconds while its centre of mass fell three metres.
    // As one body the same section sweeps its top from 120 m to 100 m in the
    // same time and is still accelerating. It is not a question of how many;
    // any subdivision throws away the only thing that makes a tower fall over.
    //
    // The damaged bearing is lost at handover as well: separate bodies rest on
    // their full footprint, not on the narrow strip the shelling left.
    //
    // So the fall is one rigid body, which is what it physically is, and
    // breaking it into rubble is the *landing's* job — which is now fast
    // enough to do it (a nine-hundred-stone section is a hundred and thirty
    // within six seconds of touching down).
    const byBand = new Map([[0, doomed]]);

    // Carry the lean's rotation through — but bounded.
    //
    // Handing the segments over at rest threw away everything the lean had
    // built: a stack tilted seven degrees, released with no velocity and the
    // heavy damping meant for a section still settling, simply stood there
    // leaning, held up by friction. So they leave the hinge moving.
    //
    // Moving at the *rigid* rate, though, is worse, and in a way that is not
    // obvious until you watch it. The velocity field of a body rotating about
    // its foot grows with height — which is correct for one rigid body and
    // catastrophic for a stack of independent ones. Each segment leaves on its
    // own tangent, nothing supplies the internal forces that would keep them
    // rotating together, and the tower does not topple at all: it *shears*,
    // like a pushed deck of cards, and the whole stack slides away across the
    // map at four metres a second, held up the entire time by its own lower
    // segments. Gravity never gets a look in — measured, the top section's
    // vertical speed sat at 1.9 m/s for five seconds while it travelled sixty
    // metres sideways and out over the river.
    //
    // Keeping the *shape* of the field and capping its magnitude gives the
    // right thing: the top leads the way over, the base barely moves, and the
    // stack goes past its balance point and falls under gravity — which is
    // what Rapier is good at and what the lean spent six seconds setting up.
    const L = this._lastLeanState;
    let vel = null;
    if (L && L.vel > 0) {
      const n2 = Math.hypot(L.axisX, L.axisZ) || 1;
      let wx = (L.axisX / n2) * L.vel, wz = (L.axisZ / n2) * L.vel;
      let maxR = 0;
      for (const j of doomed) {
        const dy = this.py[j] - L.pivotY;
        const dx = this.px[j] - L.pivotX, dz = this.pz[j] - L.pivotZ;
        maxR = Math.max(maxR, Math.hypot(dx, dy, dz));
      }
      const fastest = Math.hypot(wx, wz) * maxR;
      const scale = fastest > TOPPLE_NUDGE ? TOPPLE_NUDGE / fastest : 1;
      vel = {
        w: { x: wx, y: 0, z: wz },
        scale,
        pivot: { x: L.pivotX, y: L.pivotY, z: L.pivotZ },
      };
    }

    let moved = 0;
    for (const segment of byBand.values()) {
      for (const group of this._connectedGroups(segment)) {
        if (group.length < 12) { this._releaseGroup(group); moved += group.length; continue; }
        const island = this._weldIsland(group, null, { settling: true, spin: vel });
        if (island) moved += group.length;
      }
    }
    this.stabilityDirty = true;
    this.lastOverturnHeight = this.groundY + band * this.bandHeight;
    return moved;
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
  _weldIsland(group, inheritVel, opts = {}) {
    const rapier = this.rapier;
    const alive = group.filter((i) => (this.flags[i] & ALIVE));
    if (alive.length === 0) return null;
    // A single stone would rather be a free body, but only if the budget will
    // have it. If not it becomes a one-collider island — which is the same
    // thing, bypassing the budget — because the alternative, returning here
    // having done nothing, leaves a stone with no body and no collider sitting
    // exactly where it was. That is the masonry the player sees hanging in the
    // air over a demolished building, and there was no other way to produce it.
    if (alive.length === 1 && this.freeChunk(alive[0])) return null;
    const settling = !!opts.settling;

    // Mass-weighted centre so it pivots where it should.
    let mx = 0, my = 0, mz = 0, mt = 0;
    for (const i of alive) {
      const m = this.mass[i];
      mx += this.px[i] * m; my += this.py[i] * m; mz += this.pz[i] * m; mt += m;
    }
    mx /= mt; my /= mt; mz /= mt;

    // A section that is easing into its crater gets heavy damping so it sags
    // rather than dropping; one that is on its way over gets almost none.
    // `settling` alone used to decide that, which meant a tower released past
    // its tipping point was braked to a standstill in mid-topple.
    const brake = settling && !opts.spin;
    const body = this.physics.world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(mx, my, mz)
        .setLinearDamping(brake ? 0.9 : 0.03)
        .setAngularDamping(brake ? 0.55 : 0.1)
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
      // A settling section has not fallen yet — it is standing, out of plumb.
      // Counting it as rubble the moment it goes dynamic would crater the
      // integrity readout and win the level while the tower is still up.
      if (!settling) this.fallenMass += this.mass[i];
    }

    if (inheritVel) {
      body.setLinvel(inheritVel.lin, true);
      body.setAngvel(inheritVel.ang, true);
    } else if (opts.spin) {
      // Rigid rotation about the lean's hinge: v = omega x r at this segment's
      // own centre, so the top of a toppling tower leaves faster than its foot.
      const { w, pivot } = opts.spin;
      const s = opts.spin.scale ?? 1;
      const rx = mx - pivot.x, ry = my - pivot.y, rz = mz - pivot.z;
      body.setAngvel(w, true);
      body.setLinvel({
        x: (w.y * rz - w.z * ry) * s,
        y: (w.z * rx - w.x * rz) * s,
        z: (w.x * ry - w.y * rx) * s,
      }, true);
    }

    const island = {
      id, body, members, localPos, localQuat, impacts: 0,
      settling, age: opts.age || 0,
      origin: { x: mx, y: my, z: mz },
      mass: mt,
    };
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
    // Removing a rigid body takes every collider attached to it with it, so
    // each member's recorded handle is about to name a collider that no longer
    // exists. Left behind, the next `_detachCollider` on one of those stones
    // looks the handle up, finds whatever Rapier has since put in that slot,
    // and removes *that* — a stone somewhere else in the building silently
    // loses its collider, and enough of those ends in a panic inside the
    // solver. Harmless while every handle was truncated to zero and nothing
    // was ever really removed; not harmless now that they work.
    if (island.body) {
      for (const i of island.members) {
        const h = this.colliderOf[i];
        if (h >= 0) { this.colliderToChunk.delete(h); this.colliderOf[i] = -1; }
      }
      this.physics.remove(island.body);
    }
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
    if (!island || !PhysicsWorld.alive(island.body)) return;
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
      // Whatever the budget will not take is re-welded *together* rather than
      // one stone at a time, so a fragmentation that runs out of room part way
      // leaves one piece of rubble instead of a scatter of single-collider
      // bodies — which is both cheaper and what a half-shattered slab is.
      const stranded = [];
      for (const i of members) {
        if (!this.freeChunk(i)) { stranded.push(i); continue; }
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
      if (stranded.length) {
        for (const g of this._connectedGroups(stranded)) {
          this._weldIsland(g, vel, { age: island.age || 0 });
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
    const lo = axis === 'x' ? minX : axis === 'y' ? minY : minZ;
    const hi = axis === 'x' ? maxX : axis === 'y' ? maxY : maxZ;

    // Cut into more than two when there is a lot to get through.
    //
    // Halving is the right shape for a section that has just landed and is
    // breaking in the middle, but it is a poor way to reduce a thousand stones
    // to rubble: five generations of it, each waiting out its own rest timer,
    // is most of a minute during which the wreck is still visibly made of
    // building-sized pieces. Slicing to roughly a hundred and fifty stones a
    // piece gets there in one or two.
    const slices = Math.max(2, Math.min(5, Math.round(members.length / 150)));
    const span = Math.max(1e-3, hi - lo);
    const parts = Array.from({ length: slices }, () => []);
    for (const i of members) {
      const v = axis === 'x' ? this.px[i] : axis === 'y' ? this.py[i] : this.pz[i];
      // Clamped at both ends and NaN-proof. A stone whose position has gone
      // non-finite — a body the solver has thrown a long way, or one caught
      // mid-removal — produces a NaN slice index, and `parts[NaN]` is
      // undefined, which took the whole frame down from inside the fragmenter.
      let k = Math.floor(((v - lo) / span) * slices);
      if (!Number.isFinite(k)) k = 0;
      k = Math.max(0, Math.min(slices - 1, k));
      parts[k].push(i);
    }
    // Re-split each slice into truly connected pieces so we never weld two
    // fragments that are no longer touching. The age carries over: a piece of
    // something that has been lying on the ground for three seconds has itself
    // been lying there for three seconds, and resetting that clock on every
    // split is what made each generation wait all over again.
    for (const part of parts) {
      if (part.length === 0) continue;
      for (const g of this._connectedGroups(part)) {
        this._weldIsland(g, vel, { age: island.age || 0 });
      }
    }
    // (The pieces this call created already carry `vel` — `_weldIsland` takes
    // it, and the freed stones are given it above. There used to be a sweep
    // here that pushed it onto every island in the structure with no recorded
    // impact, which is nearly all of them: each split therefore re-kicked the
    // entire rubble field back up to the speed of whatever had just broken.
    // Nothing ever slowed down, so nothing ever qualified to be split, and a
    // collapse took the better part of a minute to finish coming apart while
    // the whole heap drifted gently across the map.)
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
  maintainIslands(dt = 1 / 60) {
    // Lift the lockout if the section that was handed over never went.
    //
    // Cheap, and it runs whether or not there are islands left, because the
    // case it exists for is a section that sat down and stayed sitting.
    const w = this._fallenWatch;
    if (w) {
      w.t += dt;
      if (w.t > 3.0) {
        this._fallenWatch = null;
        if (this.standingHeight() > w.top - 3) {
          // It is still as tall as it was: whatever was released is resting on
          // the rubble rather than falling, and the building has to be allowed
          // to lean again or nothing can ever bring it down.
          if (this._fallenBand === w.band) this._fallenBand = undefined;
          this.stabilityDirty = true;
        }
      }
    }
    if (this.islands.size === 0) return 0;

    // A settling section is still part of the building until it has visibly
    // left. Watching how far it has actually moved is the only honest test:
    // a tower that sinks a few centimetres into its crater and leans two
    // degrees is damaged, not demolished, and a player looking at it would say
    // the same. Past the threshold it is coming down, and it counts as rubble.
    // Age everything, here, where the loop is unconditional.
    //
    // The clock used to be advanced inside the split loop below, which stops
    // after six splits and again when the body budget is full — so on a big
    // collapse the great majority of islands were never visited and never aged,
    // and the "it has been down long enough, break it up" backstop could not
    // fire for precisely the pile it exists for.
    for (const island of this.islands.values()) {
      if (!island.settling) island.age = (island.age || 0) + dt;
    }

    for (const island of this.islands.values()) {
      if (!island.settling || !PhysicsWorld.alive(island.body)) continue;
      const t = island.body.translation();
      const drop = island.origin.y - t.y;
      const slide = Math.hypot(t.x - island.origin.x, t.z - island.origin.z);
      const r = island.body.rotation();
      // Angle between the body's up axis and world up, from the quaternion.
      const tilt = Math.acos(Math.max(-1, Math.min(1,
        1 - 2 * (r.x * r.x + r.z * r.z))));
      island.tilt = tilt;
      island.drop = drop;
      if (drop > 1.6 || slide > 1.6 || tilt > 0.12) {
        island.settling = false;
        this.fallenMass += island.mass;
        this.stabilityDirty = true;
        // It is past the point of settling; take the brakes off so it falls
        // like masonry rather than sinking through treacle.
        island.body.setLinearDamping(0.03);
        island.body.setAngularDamping(0.12);
        if (this.onSectionFalling) this.onSectionFalling(island);
      }
    }

    // Break up what has come to rest.
    //
    // Up to three splits a frame, not one. A section that has landed and is
    // still a single welded body is the single most conspicuously wrong thing
    // on screen — a building-shaped object lying on its side with every stone
    // in perfect register — and at one split per frame, gated behind thirty
    // frames of stillness each, a large collapse stayed that way for ten
    // seconds or more. Splitting is cheap; looking like that is not.
    let did = 0;
    for (const island of this.islands.values()) {
      if (did >= 6) break;
      // Splitting always costs bodies, and past the budget there are none to
      // spend — but "past the budget" is not the same as "out of room". Most of
      // what is holding a slot after a collapse is debris that has already come
      // to rest, and that can be frozen back into scenery for nothing. Giving
      // up without asking is why a phone was left with a four-hundred-stone
      // section of tower lying on the ground intact: the budget was full of
      // pebbles that had stopped moving two seconds earlier.
      if (this.physics.dynamicSet.size > this.physics.activeBudget
          && this.physics.reclaim(32) <= 0) break;
      const body = island.body;
      if (!PhysicsWorld.alive(body)) continue;
      // A clump this size already reads as rubble. Splitting further multiplies
      // bodies without changing the picture, and a landed collapse can cascade
      // into hundreds of them in a couple of seconds if nothing says stop.
      if (island.members.length <= WELD_THRESHOLD) continue;
      // A section that found a new equilibrium leaning against its own base is
      // still a building; leave it whole rather than shattering it in place.
      if (island.settling) continue;

      // Two ways to earn a split, and a collapse needs both.
      //
      // "Has stopped", not "is asleep": Rapier only sleeps a body that has been
      // still for a while, and a heap of interpenetrating slabs shuffling
      // against each other never quite is. And even that is not enough on its
      // own — a pile that keeps nudging itself never reads as stopped at all,
      // which left a fallen tower lying there as a row of welded slabs for as
      // long as anyone cared to watch. So anything that has been down for a few
      // seconds comes apart whether it has settled or not. Masonry that has hit
      // the ground is rubble; the only question is when we admit it.
      if (island.age < 2.6 && !body.isSleeping()) {
        const v = body.linvel(), w = body.angvel();
        if (Math.hypot(v.x, v.y, v.z) > 0.45 || Math.hypot(w.x, w.y, w.z) > 0.5) {
          island.restTimer = 0;
          continue;
        }
      }
      island.restTimer = (island.restTimer || 0) + 1;
      if (island.restTimer < 6) continue;
      this.fragmentIsland(island.id);
      did++;
    }
    return did;
  }

  /** Is this stone part of a section that is leaning but has not yet fallen? */
  _isSettling(i) {
    if (!(this.flags[i] & ISLAND)) return false;
    const isl = this.islands.get(this.islandOf[i]);
    return !!(isl && isl.settling);
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
    return this._standingTop ?? this.groundY;
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
