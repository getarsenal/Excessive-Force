/**
 * The rest of the high-value targets, and what they are worth.
 *
 * The SAM compounds are in sam.js and the command post in hq.js. Here:
 *
 *   AmmoDepot   the garrison's stocks in one fenced yard. Gone, every crew is
 *               short of rounds: they fire slower for the rest of the fight,
 *               the tubes slowest of all.
 *   Checkpoint  a roadblock on the road the enemy brings his trucks in by.
 *               Gone, the road is cut: no more columns of men come up it.
 *   Convoy      vehicles on the road. The general's, once a battle, driving
 *               to his command post, worth the most of anything on the map if
 *               he is caught; and the enemy's reinforcement columns, trucks
 *               that unload a section by the objective every few minutes
 *               while the road is open.
 *
 * The enemy artillery battery is three howitzers of the garrison itself
 * (defenders.js `howitzer`), sited by main and watched here only for when the
 * last of them goes.
 */
import * as THREE from 'three';

export const TARGETS = {
  depot: { hp: 230, bounty: 10000, rof: 0.75, tubes: 0.55 },
  checkpoint: { hp: 190, bounty: 8000 },
  battery: { bounty: 10000, buff: 0.75, seconds: 120 },
  general: { car: 20000, escort: 2000, hp: 70, speed: 9.5, at: 0.25 },
  column: { truck: 1500, hp: 60, speed: 8, first: 0.35, every: 150, max: 4, men: 8 },
  /** Blast power to hit points, as for the SAMs. */
  powerPerHp: 60,
};

function mat(color, rough = 0.85, metal = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/** Damage from a burst, as the SAMs take it. */
function damageAt(point, radius, power, x, y, z, reach = 4) {
  const R = radius + reach;
  const d = Math.hypot(point.x - x, point.z - z);
  if (d > R || Math.abs(point.y - y) > radius + 12) return 0;
  return (power / TARGETS.powerPerHp) * Math.pow(1 - d / R, 1.2);
}

/** A fixed target with hit points, a model, and a section to guard it. */
class Fixed {
  constructor({ scene, terrain, fx, site, onEvent, hp }) {
    this.terrain = terrain;
    this.fx = fx;
    this.onEvent = onEvent || (() => {});
    this.x = site.x; this.z = site.z; this.y = site.y; this.yaw = site.yaw || 0;
    this.hp = this.max = hp;
    this.alive = true;
    this._hitAt = -9;
    this._t = 0;
    this.group = new THREE.Group();
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    scene.add(this.group);
  }

  get point() { return new THREE.Vector3(this.x, this.y + 3, this.z); }

  _add(geo, m, x, y, z, ry = 0) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.rotation.y = ry;
    o.castShadow = true; o.receiveShadow = true;
    this.group.add(o);
    return o;
  }

  update(dt) { this._t += dt; }

  /** A round landing: damage; at nought, wrecked. Returns the money. */
  blast(point, radius, power) {
    if (!this.alive) return 0;
    const dmg = damageAt(point, radius, power, this.x, this.y, this.z, this.reach || 5);
    if (dmg <= 0) return 0;
    this.hp -= dmg;
    if (this.hp > 0) {
      if (this._t - this._hitAt > 1.5) {
        this._hitAt = this._t;
        this.onEvent(`${this.kind}hit`, { point: this.point, frac: this.hp / this.max });
      }
      return 0;
    }
    this.alive = false;
    this._wreck();
    this.onEvent(`${this.kind}down`, { point: this.point });
    return this.bounty;
  }

  _wreck() {
    this.group.traverse((m) => {
      if (!m.isMesh || !m.material || m.material.isMeshBasicMaterial) return;
      m.material = m.material.clone();
      m.material.color.multiplyScalar(0.25);
    });
    if (this.fx) this.fx.detonate(this.point, 3.0, { ground: true, groundY: this.y });
  }

  /** Riflemen and machine guns round it, in the garrison's `hvt` allowance. */
  _guard(garrison, posts) {
    if (!garrison) return 0;
    const n0 = garrison.defenders.length;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (const [type, lx, lz] of posts) {
      const x = this.x + lx * c + lz * s, z = this.z - lx * s + lz * c;
      if (this.terrain.isWater(x, z)) continue;
      garrison.place(type, new THREE.Vector3(x, this.terrain.heightAt(x, z), z), Math.atan2(x - this.x, z - this.z), 4,
        { cover: 'ground', emplaced: true, sandbags: true, pool: 'hvt' });
    }
    return garrison.defenders.length - n0;
  }
}

/**
 * The ammunition depot: a fenced yard of crate stacks under camouflage nets,
 * fuel drums and a guard hut. It goes up in a chain, stack after stack.
 */
export class AmmoDepot extends Fixed {
  constructor(o) {
    super({ ...o, hp: TARGETS.depot.hp });
    this.kind = 'depot';
    this.bounty = TARGETS.depot.bounty;
    this.reach = 8;
    const desert = !!o.desert;
    const olive = mat(desert ? 0x9c8a62 : 0x4f5a3a), wood = mat(0x6b5236), red = mat(0x8a2a22, 0.6, 0.3);
    const post = mat(0x3b3b36), net = mat(desert ? 0xa8946a : 0x55603f, 1, 0);
    // The fence: posts round a 26 m square.
    for (let k = 0; k < 24; k++) {
      const side = Math.floor(k / 6), t = (k % 6) / 6 - 0.5;
      const [x, z] = [[t * 26, -13], [13, t * 26], [-t * 26, 13], [-13, -t * 26]][side];
      this._add(new THREE.BoxGeometry(0.15, 2.1, 0.15), post, x, 1.05, z);
    }
    for (const [x, z, w, d] of [[0, -13, 26, 0.05], [13, 0, 0.05, 26], [-13, 0, 0.05, 26]]) {
      this._add(new THREE.BoxGeometry(w, 0.05, d), post, x, 1.6, z);
      this._add(new THREE.BoxGeometry(w, 0.05, d), post, x, 0.8, z);
    }
    // Stacks of crates, two by three, each with its own net.
    this.stacks = [];
    for (const sx of [-6.5, 0, 6.5]) {
      for (const sz of [-5, 4]) {
        const h = 1.6 + Math.random() * 1.2;
        this._add(new THREE.BoxGeometry(4.2, h, 3.2), Math.random() < 0.5 ? olive : wood, sx, h / 2, sz);
        const n = this._add(new THREE.BoxGeometry(5.6, 0.08, 4.6), net, sx, h + 0.35, sz, (Math.random() - 0.5) * 0.2);
        n.rotation.z = (Math.random() - 0.5) * 0.12;
        this.stacks.push([sx, h, sz]);
      }
    }
    // Drums.
    const drum = new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10);
    for (let k = 0; k < 14; k++) this._add(drum, red, -10 + (k % 7) * 0.7, 0.45, 10 + Math.floor(k / 7) * 0.7);
    // The hut by the gate.
    this._add(new THREE.BoxGeometry(3, 2.4, 3), mat(0x6f7066), 9.5, 1.2, -9.5);
    this._add(new THREE.BoxGeometry(3.4, 0.2, 3.4), mat(0x3d3f3a), 9.5, 2.5, -9.5);
  }

  guard(garrison) {
    return this._guard(garrison, [['mg', 15, 15], ['mg', -15, -15], ['rifleman', 15, -8], ['rifleman', -15, 8],
      ['rifleman', 0, 16], ['rifleman', 0, -16], ['at', 16, 0]]);
  }

  update(dt) {
    super.update(dt);
    // The chain: once it is going, a stack at a time.
    if (this._chain && this._chain.length && this._t >= this._chain[0].at) {
      const { x, y, z } = this._chain.shift();
      if (this.fx) this.fx.detonate(new THREE.Vector3(x, y, z), 2.2 + Math.random(), { ground: true, groundY: this.y });
    }
  }

  _wreck() {
    super._wreck();
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this._chain = this.stacks.map(([lx, h, lz], k) => ({
      x: this.x + lx * c + lz * s, y: this.y + h, z: this.z - lx * s + lz * c, at: this._t + 0.4 + k * 0.45 + Math.random() * 0.3,
    }));
  }
}

/**
 * The roadblock: concrete barriers across the carriageway, a striped boom, a
 * sandbagged pillbox and a sentry box.
 */
export class Checkpoint extends Fixed {
  constructor(o) {
    super({ ...o, hp: TARGETS.checkpoint.hp });
    this.kind = 'checkpoint';
    this.bounty = TARGETS.checkpoint.bounty;
    this.reach = 6;
    const conc = mat(0x9a9890, 0.95, 0), bag = mat(o.desert ? 0xb8a074 : 0x8b8163, 0.98, 0);
    // Barriers either side of a single lane down the middle, staggered, so a
    // truck slows to pass and the road reads as held. The road runs along z.
    const jersey = new THREE.BoxGeometry(3.2, 0.95, 0.6);
    for (const [x, z] of [[-4.6, -4], [4.6, -4], [-4.6, 4], [4.6, 4], [-7.6, 0], [7.6, 0]]) this._add(jersey, conc, x, 0.48, z);
    // The boom, raised, striped.
    this._add(new THREE.BoxGeometry(0.5, 1.1, 0.5), mat(0x3a3a36), -3.2, 0.55, 0);
    for (let k = 0; k < 5; k++) this._add(new THREE.BoxGeometry(0.14, 1, 0.14), mat(k % 2 ? 0xd8d6cf : 0xb3261e), -3.2, 1.6 + k, 0);
    // The pillbox: a sandbag ring with a slab roof.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      if (k === 2) continue;
      this._add(new THREE.BoxGeometry(1.5, 1.5, 0.7), bag, 9 + Math.cos(a) * 2.4, 0.75, -6 + Math.sin(a) * 2.4, -a);
    }
    this._add(new THREE.BoxGeometry(5.6, 0.35, 5.6), conc, 9, 1.75, -6);
    this._add(new THREE.BoxGeometry(1.4, 2.4, 1.4), mat(0x5c6150), -8.5, 1.2, 4.5);
  }

  guard(garrison) {
    return this._guard(garrison, [['mg', 9, -6], ['mg', -9, 5], ['rifleman', 6, 6], ['rifleman', -5, -7], ['rifleman', 12, 2]]);
  }
}

// ── Vehicles on the road.

function makeVehicle(kind, desert) {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const tyre = mat(0x161616, 0.95, 0), dark = mat(0x1d2023, 0.6, 0.3);
  if (kind === 'car') {
    const body = mat(0x15171a, 0.35, 0.6);
    add(new THREE.BoxGeometry(2.0, 0.8, 5.0), body, 0, 0.8, 0);
    add(new THREE.BoxGeometry(1.8, 0.65, 2.6), body, 0, 1.5, -0.2);
    add(new THREE.BoxGeometry(1.82, 0.4, 0.05), dark, 0, 1.55, 1.12);
    // Pennants on the wings: this is the one.
    add(new THREE.BoxGeometry(0.02, 0.35, 0.5), mat(0xc0281e, 0.8, 0), 0.9, 1.5, 2.2);
    add(new THREE.BoxGeometry(0.02, 0.35, 0.5), mat(0xc0281e, 0.8, 0), -0.9, 1.5, 2.2);
  } else {
    const body = mat(desert ? 0xa08c62 : 0x4d5733);
    add(new THREE.BoxGeometry(2.4, 1.0, 7.0), body, 0, 1.1, 0);
    add(new THREE.BoxGeometry(2.4, 1.5, 2.0), body, 0, 2.0, 2.4);
    add(new THREE.BoxGeometry(2.5, 1.9, 4.6), mat(desert ? 0xb8a77e : 0x5e6646, 0.95, 0), 0, 2.4, -1.0);
  }
  const wheel = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10);
  for (const z of kind === 'car' ? [1.6, -1.6] : [2.5, -1.2, -2.6]) {
    for (const x of [-1.05, 1.05]) { const w = add(wheel, tyre, x, 0.45, z); w.rotation.z = Math.PI / 2; }
  }
  return g;
}

/**
 * A route along the street graph, as a polyline: Dijkstra from the node
 * nearest `from` to the node nearest `to`. Null if the graph has no way.
 */
export function roadRoute(net, from, to) {
  if (!net || !net.nodes?.length || !net.edges?.length) return null;
  const adj = roadGraph(net);
  // Only nodes a road actually reaches: the graph keeps many that the
  // welding and dissolving left with nothing attached.
  const nearest = (p) => {
    let best = -1, bd = Infinity;
    for (const i of adj.keys()) {
      const n = net.nodes[i];
      if (!n) continue;
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const a = nearest(from), b = nearest(to);
  if (a < 0 || b < 0 || a === b) return null;
  return dijkstra(net, adj, a, b);
}

/** The road graph: node index to its legs, built once per network. */
export function roadGraph(net) {
  if (net._roadGraph) return net._roadGraph;
  const adj = new Map();
  for (const e of net.edges) {
    if (!e.pts || e.pts.length < 2) continue;
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    const len = e.len || e.pts.reduce((s2, p, k) => (k ? s2 + Math.hypot(p.x - e.pts[k - 1].x, p.z - e.pts[k - 1].z) : 0), 0);
    adj.get(e.a).push({ to: e.b, e, len, fwd: true });
    adj.get(e.b).push({ to: e.a, e, len, fwd: false });
  }
  net._roadGraph = adj;
  return adj;
}

function dijkstra(net, adj, a, b) {
  const dist = new Map([[a, 0]]), prev = new Map();
  const open = [a], done = new Set();
  while (open.length) {
    let k = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[k])) k = i;
    const u = open.splice(k, 1)[0];
    if (done.has(u)) continue;
    done.add(u);
    if (u === b) break;
    for (const l of adj.get(u) || []) {
      const nd = dist.get(u) + l.len;
      if (nd < (dist.get(l.to) ?? Infinity)) { dist.set(l.to, nd); prev.set(l.to, { from: u, l }); open.push(l.to); }
    }
  }
  if (!prev.has(b)) return null;
  const legs = [];
  for (let v = b; v !== a;) { const p = prev.get(v); legs.unshift(p.l); v = p.from; }
  const pts = [];
  for (const l of legs) {
    const P = l.fwd ? l.e.pts : [...l.e.pts].reverse();
    for (const p of P) {
      const q = pts[pts.length - 1];
      if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 0.5) pts.push({ x: p.x, z: p.z });
    }
  }
  return pts.length >= 2 ? pts : null;
}

/** A point `d` metres along a polyline, with the heading there. */
function along(pts, cum, d) {
  let k = 1;
  while (k < pts.length - 1 && cum[k] < d) k++;
  const a = pts[k - 1], b = pts[k];
  const seg = Math.max(1e-3, cum[k] - cum[k - 1]);
  const t = THREE.MathUtils.clamp((d - cum[k - 1]) / seg, 0, 1);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

/**
 * Vehicles driving a route in file, each with hit points. `kinds` is the
 * order of march ('car' or 'truck'); `onArrive` hears when the head of the
 * file reaches the end; `stopAt` is how far along it stops, if short of the end.
 */
export class Convoy {
  constructor({ scene, terrain, fx, route, kinds, speed, hp, desert, onEvent, name, stopAt = null }) {
    this.scene = scene; this.terrain = terrain; this.fx = fx;
    this.route = route;
    this.cum = [0];
    for (let k = 1; k < route.length; k++) this.cum.push(this.cum[k - 1] + Math.hypot(route[k].x - route[k - 1].x, route[k].z - route[k - 1].z));
    this.length = this.cum[this.cum.length - 1];
    this.stopAt = stopAt == null ? this.length : Math.min(this.length, stopAt);
    this.speed = speed;
    this.name = name;
    this.onEvent = onEvent || (() => {});
    this.head = 0;
    this.arrived = false;
    this.vehicles = kinds.map((kind, i) => {
      const group = makeVehicle(kind, desert);
      scene.add(group);
      return { kind, group, hp: kind === 'car' ? hp * 1.2 : hp, alive: true, lag: i * 14, i };
    });
    this.update(0);
  }

  get alive() { return this.vehicles.some((v) => v.alive); }

  update(dt) {
    if (!this.arrived) this.head = Math.min(this.stopAt, this.head + this.speed * dt);
    for (const v of this.vehicles) {
      const d = Math.max(0, this.head - v.lag);
      const p = along(this.route, this.cum, d);
      v.x = p.x; v.z = p.z;
      v.y = this.terrain.heightAt(p.x, p.z);
      if (!v.alive) continue;
      v.group.position.set(p.x, v.y, p.z);
      v.group.rotation.y = p.yaw;
    }
    if (!this.arrived && this.head >= this.stopAt - 0.01) {
      this.arrived = true;
      this.onEvent('arrive', this);
    }
  }

  /** A round landing on the road. Returns the vehicles it wrecked. */
  blast(point, radius, power) {
    const out = [];
    for (const v of this.vehicles) {
      if (!v.alive) continue;
      const dmg = damageAt(point, radius, power, v.x, v.y, v.z, 3);
      if (dmg <= 0) continue;
      v.hp -= dmg;
      if (v.hp > 0) continue;
      v.alive = false;
      v.group.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.color.multiplyScalar(0.22);
      });
      v.group.rotation.z = (Math.random() - 0.5) * 0.5;
      if (this.fx) this.fx.detonate(new THREE.Vector3(v.x, v.y + 1.2, v.z), 1.8, { ground: true, groundY: v.y });
      out.push(v);
    }
    return out;
  }

  /** Off the board: the ones that got away. */
  remove() { for (const v of this.vehicles) if (v.alive) this.scene.remove(v.group); }
}
