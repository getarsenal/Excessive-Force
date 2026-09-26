import * as THREE from 'three';
import { buildCraft } from './craft.js';

/**
 * The things that move.
 *
 * Everything else in this city is merged geometry that never changes, which is
 * what makes it cheap — and also what makes it a photograph. A still city is
 * uncanny at any level of detail: the eye reads *motion* as life long before it
 * reads a bench or a bollard, so a hundred cars going somewhere is worth more
 * than a thousand more props standing still.
 *
 * Three instanced meshes and one update: traffic on the street network, craft
 * on the river, and birds that scatter when something lands near them. Each is
 * a single draw call and none of them touches the physics world.
 */

const UP = new THREE.Vector3(0, 1, 0);

export class Life {
  constructor(scene, terrain, net, quality, rng, fleet = [], plots = []) {
    this.terrain = terrain;
    this.net = net;
    // The town's footprints, on a coarse grid, so the router can refuse water
    // that has a building standing on it. The mask and the survey disagree in
    // places — a culverted stream under a Kuala Lumpur block is "water" to the
    // one and a shophouse to the other — and a boat that trusts the mask alone
    // sails through the shophouse.
    this._plotGrid = new Map();
    this._plotCell = 32;
    for (const p of plots) {
      if (p.wharf || p.x == null || p.w == null) continue;
      const r = Math.hypot(p.w, p.d) / 2;
      const c0x = Math.floor((p.x - r) / this._plotCell), c1x = Math.floor((p.x + r) / this._plotCell);
      const c0z = Math.floor((p.z - r) / this._plotCell), c1z = Math.floor((p.z + r) / this._plotCell);
      for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
        const k = `${cx},${cz}`;
        if (!this._plotGrid.has(k)) this._plotGrid.set(k, []);
        this._plotGrid.get(k).push(p);
      }
    }
    this.rng = rng;
    this.enabled = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);

    const dense = quality.groundClutter ? 1 : 0.45;
    this.cars = this._buildTraffic(scene, Math.round(150 * dense));
    this.boats = this._buildBoats(scene, Math.round(14 * dense), fleet);
    this.birds = this._buildBirds(scene, Math.round(120 * dense));
  }

  // ─────────────────────────────────────────────────────────────── traffic ──

  /**
   * Cars, each one driving a route along the network.
   *
   * A route is a list of edges walked end to end, chosen by turning at each
   * junction, so a car goes somewhere rather than shuttling along one street.
   * Position is a distance along that route; the heading comes from the
   * polyline it is on, so cars lean into bends and keep to their own side.
   */
  _buildTraffic(scene, n) {
    const edges = (this.net?.edges || []).filter((e) => e.pts.length > 1 && e.len > 26);
    if (!edges.length || n <= 0) return null;
    const body = new THREE.BoxGeometry(1.85, 0.78, 4.3);
    body.translate(0, 0.39, 0);
    const cabin = new THREE.BoxGeometry(1.7, 0.62, 2.2);
    cabin.translate(0, 1.06, -0.15);
    const geo = mergeTwo(body, cabin);
    const mesh = new THREE.InstancedMesh(geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.28 }),
      n);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.name = 'traffic';
    scene.add(mesh);

    const PALETTE = [0x9aa3ad, 0x2f3a45, 0x8c3a32, 0x3d5a46, 0xb8b2a4,
      0xd8d4c8, 0x24282c, 0x6b7a86];
    const cars = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const e = edges[Math.floor(this.rng() * edges.length)];
      cars.push({
        edge: e,
        forward: this.rng() < 0.5,
        s: this.rng() * e.len,
        speed: 7 + this.rng() * 9,
        lane: 2.0 + this.rng() * 0.6,
      });
      c.setHex(PALETTE[Math.floor(this.rng() * PALETTE.length)])
        .multiplyScalar(0.8 + this.rng() * 0.4);
      mesh.instanceColor.setXYZ(i, c.r, c.g, c.b);
    }
    mesh.instanceColor.needsUpdate = true;
    return { mesh, cars, edges };
  }

  /** Where along an edge, and which way is it facing there? */
  _onEdge(e, s, forward) {
    const pts = e.pts;
    let walked = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (walked + seg >= s || i === pts.length - 2) {
        const t = seg > 0 ? Math.min(1, (s - walked) / seg) : 0;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = (a.y !== undefined && b.y !== undefined)
          ? a.y + (b.y - a.y) * t
          : this.terrain.heightAt(x, z) + 0.22;
        const dx = (b.x - a.x) / (seg || 1), dz = (b.z - a.z) / (seg || 1);
        return { x, y, z, dx: forward ? dx : -dx, dz: forward ? dz : -dz };
      }
      walked += seg;
    }
    return null;
  }

  /** Pick the next street to drive down, preferring not to turn back. */
  _nextEdge(e, atNode) {
    const node = this.net.nodes[atNode];
    if (!node || node.links.length === 0) return null;
    const out = node.links.filter((l) => l.edge !== e && l.edge.len > 20);
    if (!out.length) return null;
    return out[Math.floor(this.rng() * out.length)].edge;
  }

  // ───────────────────────────────────────────────────────────────── river ──

  /**
   * The waterways: every navigable channel on the map, as polylines whose
   * every sample and every segment is verified wet.
   *
   * The old router scanned rows of constant z, took the *outermost* wet
   * points on each row, and called their midpoint the channel. That is a
   * river's centreline only for one river running straight down the map. On
   * a harbour with two shores the midpoint of the outermost wet points is the
   * headland between them; on an island it is the island; on a meander that
   * crosses the row twice it is the bank. And the boat was then interpolated
   * in a straight line between two such midpoints. That is the fleet of
   * barges the player found ploughing across dry land on most of the sea
   * maps, and it was never going to be fixed by a wider row.
   *
   * So: each row is cut into its separate contiguous wet runs, each run's
   * own midpoint is a sample — wet by construction — and samples in adjacent
   * rows are linked into a chain only where the straight segment between them
   * tests wet every six metres along its length. Columns are scanned the same
   * way for the reaches that run across the map. What comes out is one chain
   * per channel or shore, and nothing on any of them can be over land.
   */
  /** Is there a building standing on this point? */
  _built(x, z) {
    const list = this._plotGrid.get(`${Math.floor(x / this._plotCell)},${Math.floor(z / this._plotCell)}`);
    if (!list) return false;
    for (const p of list) {
      const a = -(p.yaw || 0), dx = x - p.x, dz = z - p.z;
      const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
      if (Math.abs(lx) <= p.w / 2 + 2 && Math.abs(lz) <= p.d / 2 + 2) return true;
    }
    return false;
  }

  /**
   * Can a boat be here? Three things have to agree, and the first cut asked
   * only the first: the mask says wet; the ground the renderer actually
   * draws — `heightAt` interpolates between cells, so a point beside a bank
   * reads the bank — is under the sheet; and nothing has been built on it.
   */
  _navigable(x, z) {
    const t = this.terrain;
    return t.isWater(x, z) && t.heightAt(x, z) < t.waterLevel - 0.3 && !this._built(x, z);
  }

  _waterways() {
    const t = this.terrain, span = t.span, lim = span * 0.95;
    // MIN_RUN is a sampan, not a barge: the Klang through Kuala Lumpur is two
    // coarse cells wide, and the strip of it whose *rendered* bed is under the
    // sheet is about fifteen metres. At thirty the level had no boats at all.
    const STEP = 24, SUB = 6, MIN_RUN = 14, LINK = 80, MIN_CHAIN = 160;
    const nav = (x, z) => this._navigable(x, z);
    const wetSeg = (a, b) => {
      const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / SUB));
      for (let i = 1; i < n; i++) {
        const f = i / n;
        if (!nav(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f)) return false;
      }
      return true;
    };
    // The contiguous wet runs along one line, as midpoints with widths.
    const runs = (fixed, alongX) => {
      const out = [];
      let lo = null, prev = null;
      for (let u = -lim; u <= lim + SUB; u += SUB) {
        const wet = u <= lim && (alongX ? nav(u, fixed) : nav(fixed, u));
        if (wet && lo === null) lo = u;
        if (!wet && lo !== null) {
          const w = prev - lo;
          if (w >= MIN_RUN) {
            const m = (lo + prev) / 2;
            out.push(alongX ? { x: m, z: fixed, w } : { x: fixed, z: m, w });
          }
          lo = null;
        }
        if (wet) prev = u;
      }
      return out;
    };
    const chains = [];
    const sweep = (alongX) => {
      const lines = [];
      for (let v = -lim; v <= lim; v += STEP) lines.push(runs(v, alongX));
      // Drop the runs that are the *length* of a reach rather than its width:
      // a row that happens to lie along a channel reports a kilometre of
      // water whose midpoint is nowhere in particular.
      const all = lines.flat();
      if (all.length > 4) {
        const med = all.map((p) => p.w).sort((x, y) => x - y)[all.length >> 1];
        for (const L of lines) for (let i = L.length - 1; i >= 0; i--) if (L[i].w > med * 3) L.splice(i, 1);
      }
      const open = new Map(); // sample -> chain it ends
      for (let i = 0; i < lines.length; i++) {
        const next = lines[i + 1] || [];
        const claimed = new Set();
        for (const a of lines[i]) {
          let best = null, bd = LINK;
          for (const b of next) {
            if (claimed.has(b)) continue;
            const d = alongX ? Math.abs(b.x - a.x) : Math.abs(b.z - a.z);
            if (d < bd && wetSeg(a, b)) { bd = d; best = b; }
          }
          const ch = open.get(a) || (chains.push([a]), chains[chains.length - 1]);
          open.delete(a);
          if (best) { ch.push(best); claimed.add(best); open.set(best, ch); }
        }
      }
    };
    sweep(true);
    sweep(false);
    const out = [];
    for (const pts of chains) {
      let total = 0;
      for (let i = 0; i < pts.length; i++) {
        pts[i].s = total;
        if (i < pts.length - 1) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      }
      if (total >= MIN_CHAIN) out.push({ pts, total });
    }
    return out;
  }

  /**
   * Craft on the water: one instanced mesh per kind in the level's fleet,
   * each boat on a verified chain, and nothing on dry land.
   */
  _buildBoats(scene, n, fleet) {
    if (n <= 0 || !fleet || !fleet.length) return null;
    const chains = this._waterways();
    this.channels = chains.length;
    if (!chains.length) return null;
    const grand = chains.reduce((a, c) => a + c.total, 0);
    // As many boats as there is water for. Six on three hundred metres of
    // stream is a queue; one every hundred and twenty metres reads as a
    // working river whatever its size.
    n = Math.max(1, Math.min(n, Math.ceil(grand / 120)));

    const kinds = [...new Set(fleet)];
    const meshes = new Map();
    const slots = new Map();
    for (const kind of kinds) {
      const { geo } = buildCraft(kind);
      const mesh = new THREE.InstancedMesh(geo,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, side: THREE.DoubleSide }), n);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      mesh.frustumCulled = false;
      mesh.name = `craft-${kind}`;
      mesh.count = 0;
      scene.add(mesh);
      meshes.set(kind, mesh);
      slots.set(kind, 0);
    }

    const boats = [];
    for (let i = 0; i < n; i++) {
      const kind = fleet[Math.floor(this.rng() * fleet.length)];
      const { speed, scale } = buildCraft(kind);
      // A chain by its share of the water, so a long reach carries more.
      let pick = this.rng() * grand, chain = chains[0];
      for (const c of chains) { if (pick < c.total) { chain = c; break; } pick -= c.total; }
      const slot = slots.get(kind); slots.set(kind, slot + 1);
      const mesh = meshes.get(kind);
      mesh.count = slot + 1;
      const tint = 0.82 + this.rng() * 0.3;
      mesh.instanceColor.setXYZ(slot, tint, tint, tint);
      mesh.instanceColor.needsUpdate = true;
      boats.push({
        kind, mesh, slot, chain,
        s: this.rng() * chain.total,
        speed: (speed[0] + this.rng() * (speed[1] - speed[0])) * (this.rng() < 0.5 ? 1 : -1),
        off: (this.rng() - 0.5) * 0.4,
        k: scale[0] + this.rng() * (scale[1] - scale[0]),
      });
    }
    const first = meshes.values().next().value;
    return { meshes, boats, chains, total: grand, mesh: first };
  }

  // ───────────────────────────────────────────────────────────────── birds ──

  _buildBirds(scene, n) {
    if (n <= 0) return null;
    const g = new THREE.BufferGeometry();
    // A two-triangle chevron: at this size that is a bird.
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -0.9, 0.25, -0.5, -0.5, 0, 0.1,
      0, 0, 0, 0.9, 0.25, -0.5, 0.5, 0, 0.1,
    ], 3));
    g.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(g,
      new THREE.MeshBasicMaterial({ color: 0x3a3f46, side: THREE.DoubleSide }), n);
    mesh.frustumCulled = false;
    mesh.name = 'birds';
    scene.add(mesh);
    const birds = [];
    for (let i = 0; i < n; i++) {
      birds.push({
        x: (this.rng() - 0.5) * this.terrain.span * 1.2,
        z: (this.rng() - 0.5) * this.terrain.span * 1.2,
        y: 0, h: 22 + this.rng() * 40,
        a: this.rng() * Math.PI * 2,
        turn: (this.rng() - 0.5) * 0.4,
        speed: 9 + this.rng() * 7,
        flap: this.rng() * 9,
      });
    }
    return { mesh, birds };
  }

  /** Something loud happened here: birds within earshot climb and scatter. */
  startle(x, z, radius = 130) {
    const b = this.birds;
    if (!b) return;
    for (const q of b.birds) {
      const d = Math.hypot(q.x - x, q.z - z);
      if (d > radius) continue;
      q.a = Math.atan2(q.x - x, q.z - z) + (this.rng() - 0.5) * 0.8;
      q.speed = 16 + this.rng() * 10;
      q.h = Math.min(120, q.h + 22 + this.rng() * 30);
      q.turn = (this.rng() - 0.5) * 0.2;
    }
  }

  // ──────────────────────────────────────────────────────────────── update ──

  update(dt) {
    if (!this.enabled || !(dt > 0)) return;
    const t = this.terrain;

    if (this.cars) {
      const { mesh, cars } = this.cars;
      let w = 0;
      for (const car of cars) {
        car.s += car.speed * dt;
        if (car.s > car.edge.len) {
          // Arrived at a junction: turn onto another street.
          const atNode = car.forward ? car.edge.b : car.edge.a;
          const next = this._nextEdge(car.edge, atNode);
          if (next) {
            car.forward = this.net.nodes[next.a] === this.net.nodes[atNode]
              || next.a === atNode;
            car.edge = next;
            car.s = 0;
          } else {
            car.forward = !car.forward;
            car.s = 0;
          }
        }
        const p = this._onEdge(car.edge, car.forward ? car.s : car.edge.len - car.s,
          car.forward);
        if (!p) continue;
        // Keep left, like the traffic outside the window this is a model of.
        const nx = -p.dz, nz = p.dx;
        this._p.set(p.x + nx * car.lane, p.y + 0.06, p.z + nz * car.lane);
        this._q.setFromAxisAngle(UP, Math.atan2(p.dx, p.dz));
        this._m.compose(this._p, this._q, this._s);
        mesh.setMatrixAt(w++, this._m);
      }
      mesh.count = w;
      mesh.instanceMatrix.needsUpdate = true;
    }

    if (this.boats) {
      const { boats } = this.boats;
      for (const b of boats) {
        const { pts, total } = b.chain;
        // Turn at the ends rather than wrapping round to the other one. A
        // river is not a loop; a working boat goes up it and then comes back.
        b.s += b.speed * dt;
        if (b.s < 0) { b.s = -b.s; b.speed = -b.speed; }
        else if (b.s > total) { b.s = 2 * total - b.s; b.speed = -b.speed; }
        let i0 = 0;
        while (i0 < pts.length - 2 && pts[i0 + 1].s <= b.s) i0++;
        const i1 = Math.min(pts.length - 1, i0 + 1);
        const seg = Math.max(0.001, pts[i1].s - pts[i0].s);
        const f = Math.min(1, Math.max(0, (b.s - pts[i0].s) / seg));
        const a = pts[i0], c = pts[i1];
        const wid = Math.min(a.w + (c.w - a.w) * f, 120);
        const cx = a.x + (c.x - a.x) * f, cz = a.z + (c.z - a.z) * f;
        // Off the centreline by a share of the width — and back onto it if
        // that share turns out to be bank. The centreline itself is wet by
        // construction; a boat that still reads dry is one nobody sees.
        let x = cx + b.off * wid * 0.5;
        if (!this._navigable(x, cz)) x = cx;
        const shown = this._navigable(x, cz);
        this._p.set(x, t.waterLevel + 0.1, cz);
        this._q.setFromAxisAngle(UP,
          Math.atan2(c.x - a.x, c.z - a.z) + (b.speed < 0 ? Math.PI : 0));
        this._s.setScalar(shown ? b.k : 0);
        this._m.compose(this._p, this._q, this._s);
        b.mesh.setMatrixAt(b.slot, this._m);
      }
      for (const m of this.boats.meshes.values()) m.instanceMatrix.needsUpdate = true;
      this._s.set(1, 1, 1);
    }

    if (this.birds) {
      const { mesh, birds } = this.birds;
      const span = t.span * 1.3;
      let w = 0;
      for (const b of birds) {
        b.a += b.turn * dt;
        b.x += Math.sin(b.a) * b.speed * dt;
        b.z += Math.cos(b.a) * b.speed * dt;
        if (Math.abs(b.x) > span) b.x = -Math.sign(b.x) * span;
        if (Math.abs(b.z) > span) b.z = -Math.sign(b.z) * span;
        b.speed += (11 - b.speed) * Math.min(1, dt * 0.25);
        b.flap += dt * 13;
        const g = t.heightAt(b.x, b.z);
        this._p.set(b.x, g + b.h + Math.sin(b.flap * 0.4) * 1.2, b.z);
        this._q.setFromAxisAngle(UP, b.a);
        // Wingbeat, as a scale pulse on the chevron — cheaper than a second
        // mesh and legible at the distance these are ever seen from.
        const k = 1.5 + Math.sin(b.flap) * 0.55;
        this._s.set(k, 1, 1.5);
        this._m.compose(this._p, this._q, this._s);
        mesh.setMatrixAt(w++, this._m);
      }
      this._s.set(1, 1, 1);
      mesh.count = w;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Merge two box geometries into one, keeping a vertex colour attribute. */
function mergeTwo(a, b) {
  const pa = a.attributes.position.array, pb = b.attributes.position.array;
  const na = a.attributes.normal.array, nb = b.attributes.normal.array;
  const ia = a.index ? a.index.array : null;
  const ib = b.index ? b.index.array : null;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa, 0); pos.set(pb, pa.length);
  const nor = new Float32Array(na.length + nb.length);
  nor.set(na, 0); nor.set(nb, na.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (ia && ib) {
    const idx = new Uint16Array(ia.length + ib.length);
    idx.set(ia, 0);
    const shift = pa.length / 3;
    for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + shift;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}
