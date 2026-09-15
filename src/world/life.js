import * as THREE from 'three';

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
  constructor(scene, terrain, net, quality, rng) {
    this.terrain = terrain;
    this.net = net;
    this.rng = rng;
    this.enabled = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);

    const dense = quality.groundClutter ? 1 : 0.45;
    this.cars = this._buildTraffic(scene, Math.round(150 * dense));
    this.boats = this._buildBoats(scene, Math.round(14 * dense));
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

  _buildBoats(scene, n) {
    if (n <= 0) return null;
    const hull = new THREE.BoxGeometry(5.4, 1.7, 21);
    hull.translate(0, 0.85, 0);
    const house = new THREE.BoxGeometry(4.0, 2.0, 6.0);
    house.translate(0, 2.7, -5);
    const geo = mergeTwo(hull, house);
    const mesh = new THREE.InstancedMesh(geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), n);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.frustumCulled = false;
    mesh.name = 'rivercraft';
    scene.add(mesh);

    // The river's own axis, found by walking the water mask.
    const span = this.terrain.span;
    const wet = [];
    for (let z = -span * 0.95; z < span * 0.95; z += 24) {
      let lo = null, hi = null;
      for (let x = -span * 0.95; x < span * 0.95; x += 6) {
        if (!this.terrain.isWater(x, z)) continue;
        if (lo === null) lo = x;
        hi = x;
      }
      if (lo !== null && hi - lo > 40) wet.push({ z, x: (lo + hi) / 2, w: hi - lo });
    }
    const boats = [];
    const c = new THREE.Color();
    for (let i = 0; i < n && wet.length > 2; i++) {
      boats.push({
        t: this.rng() * wet.length,
        speed: (0.12 + this.rng() * 0.16) * (this.rng() < 0.5 ? 1 : -1),
        off: (this.rng() - 0.5) * 0.5,
      });
      c.setHex([0x3b4249, 0x6b3f36, 0x2f4a55, 0xb0aa9a][Math.floor(this.rng() * 4)])
        .multiplyScalar(0.8 + this.rng() * 0.4);
      mesh.instanceColor.setXYZ(i, c.r, c.g, c.b);
    }
    mesh.instanceColor.needsUpdate = true;
    mesh.count = boats.length;
    return { mesh, boats, wet };
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

    if (this.boats && this.boats.wet.length > 2) {
      const { mesh, boats, wet } = this.boats;
      let w = 0;
      for (const b of boats) {
        b.t += b.speed * dt;
        if (b.t < 0) b.t += wet.length;
        if (b.t >= wet.length) b.t -= wet.length;
        const i0 = Math.floor(b.t) % wet.length;
        const i1 = (i0 + 1) % wet.length;
        const f = b.t - Math.floor(b.t);
        const a = wet[i0], c = wet[i1];
        const x = a.x + (c.x - a.x) * f + b.off * a.w * 0.5;
        const z = a.z + (c.z - a.z) * f;
        this._p.set(x, t.waterLevel + 0.15, z);
        this._q.setFromAxisAngle(UP,
          Math.atan2(c.x - a.x, c.z - a.z) + (b.speed < 0 ? Math.PI : 0));
        this._m.compose(this._p, this._q, this._s);
        mesh.setMatrixAt(w++, this._m);
      }
      mesh.count = w;
      mesh.instanceMatrix.needsUpdate = true;
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
