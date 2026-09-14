import * as THREE from 'three';
import { valueNoise } from './terrain.js';

/**
 * The street network: a city's actual skeleton.
 *
 * What was here before was not a network at all. It was two families of
 * perfectly straight lines drawn at a fixed pitch across the whole map, and a
 * separate grid of buildings laid out on the same pitch, in the hope that the
 * two would interleave. From the air it read exactly as what it was: infinite
 * parallel stripes, buildings standing in the carriageway where the phases
 * drifted apart, roads charging into the river and stopping dead, and a bridge
 * with no road leading to it.
 *
 * This builds the thing properly, in the order a city grows:
 *
 *   1. a graph of junctions and the streets between them, laid on a grid that
 *      is then pushed around by a smooth noise field, so streets bend and
 *      blocks come out in a hundred different shapes while the topology stays
 *      simple enough to reason about;
 *   2. every street checked along its whole length against the water, so the
 *      network *ends* at the river instead of driving into it, and the only
 *      way across is the bridge — which gets its own approach roads, joined to
 *      the nearest junctions on each bank;
 *   3. an embankment road following the bank itself, which is what a real
 *      riverside looks like from above;
 *   4. blocks derived from the graph rather than guessed, so the buildings can
 *      be placed *inside* them and can never land in the road.
 *
 * Everything downstream — surfaces, markings, furniture, building plots — is
 * generated from this graph, so there is only ever one city.
 */

/** Road classes, in metres. The hierarchy is most of what makes a plan legible. */
export const ROAD_CLASS = {
  avenue: { road: 13.0, pave: 4.4, kerb: 0.8, dashes: true, trees: true, lamp: 24 },
  street: { road: 8.8, pave: 3.2, kerb: 0.6, dashes: false, trees: false, lamp: 30 },
  mews: { road: 6.0, pave: 1.9, kerb: 0.45, dashes: false, trees: false, lamp: 46 },
};

export function halfWidth(cls) {
  const c = ROAD_CLASS[cls];
  return c.road / 2 + c.pave + c.kerb;
}

/**
 * Lay out the graph.
 *
 * `opts`: { pitch, reach, exclude (radius kept clear for the landmark),
 *           bridge: { a, b, half } | null }
 */
export function buildStreetNetwork(terrain, rng, opts) {
  const pitch = opts.pitch;
  const reach = opts.reach;
  const exclude = opts.exclude || 0;
  const bridge = opts.bridge || null;

  const nodes = [];
  const edges = [];

  // Footprints the network must keep out of: the abbey, the government
  // blocks, the landmark's own precinct. A city grows around those, and a
  // street driven through the middle of one is the same mistake as a street
  // driven into the river.
  const reserved = opts.reserved || [];
  const inReserved = (x, z) => {
    for (const r of reserved) {
      if (Math.abs(x - r.x) < r.w / 2 + 15 && Math.abs(z - r.z) < r.d / 2 + 15) return true;
    }
    return false;
  };

  /** Is this point properly on dry land, with `margin` metres to spare? */
  const onLand = (x, z, margin = 0, ignoreReserved = false) => {
    if (terrain.isWater(x, z)) return false;
    if (!ignoreReserved && inReserved(x, z)) return false;
    if (terrain.heightAt(x, z) < terrain.waterLevel + 1.1) return false;
    for (let a = 0; a < 8 && margin > 0; a++) {
      const th = (a / 8) * Math.PI * 2;
      const px = x + Math.cos(th) * margin, pz = z + Math.sin(th) * margin;
      if (terrain.isWater(px, pz)) return false;
      if (terrain.heightAt(px, pz) < terrain.waterLevel + 0.4) return false;
    }
    return true;
  };

  // ── 1. Junctions on a pushed-around grid.
  //
  // Two noise fields, sampled at the node's *nominal* position, displace it.
  // The frequency matters more than the amplitude: sampled coarsely, whole
  // runs of nodes drift together and the street bends as one long sweep, which
  // is what a city laid out on old field boundaries looks like. Sampled
  // finely, each node jumps independently and the streets zig-zag like a bad
  // maze. The amplitude stays under half a pitch so the grid cannot fold over
  // itself and turn blocks inside out.
  const cols = Math.floor((reach * 2) / pitch) + 1;
  const origin = -reach;
  const idx = new Int32Array(cols * cols).fill(-1);
  const AMP = pitch * 0.30;
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const bx = origin + i * pitch;
      const bz = origin + j * pitch;
      const dx = (valueNoise(bx * 0.0017 + 11.3, bz * 0.0017 - 4.1) - 0.5) * 2 * AMP
        + (rng() - 0.5) * pitch * 0.10;
      const dz = (valueNoise(bx * 0.0017 - 67.9, bz * 0.0017 + 23.5) - 0.5) * 2 * AMP
        + (rng() - 0.5) * pitch * 0.10;
      const x = bx + dx, z = bz + dz;
      if (Math.hypot(x, z) < exclude) continue;
      if (!onLand(x, z, 7)) continue;
      // Avenues every third line, in both directions: the through routes.
      const avenue = (i % 3 === 0) || (j % 3 === 0);
      idx[j * cols + i] = nodes.length;
      nodes.push({ x, z, y: terrain.heightAt(x, z), avenue, links: [], i, j });
    }
  }

  /** Walk a straight line and report whether a road could be built along it. */
  const lineClear = (a, b, margin, ignoreReserved = false) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.ceil(d / 7));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (!onLand(x, z, margin, ignoreReserved)) return false;
      if (Math.hypot(x, z) < exclude) return false;
    }
    return true;
  };

  /**
   * One street, as a polyline.
   *
   * Streets are drawn bowed rather than straight: a single lateral offset in
   * the middle, a few metres either way, is enough to stop the eye reading the
   * whole map as ruled lines, and it costs three extra quads.
   */
  const addEdge = (na, nb, cls, margin, minLen, ignoreReserved) => {
    const a = nodes[na], b = nodes[nb];
    if (!lineClear(a, b, margin ?? halfWidth(cls) + 1.5, ignoreReserved)) return null;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < (minLen ?? pitch * 0.35)) return null;
    const nx = -dz / len, nz = dx / len;
    const bow = (valueNoise(a.x * 0.004 + 3.7, a.z * 0.004 - 9.1) - 0.5)
      * Math.min(6.5, len * 0.07) * 2;
    const SEGS = 5;
    const pts = [];
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS;
      const k = Math.sin(t * Math.PI);           // zero at both junctions
      const x = a.x + dx * t + nx * bow * k;
      const z = a.z + dz * t + nz * bow * k;
      // The bowed line is checked the same way the straight one was: with the
      // caller's own margin and its own view of the reserved ground, or a
      // forced road would pass `lineClear` and then fail here.
      if (!onLand(x, z, Math.min(5, margin ?? 5), ignoreReserved)) return null;
      pts.push({ x, z, y: terrain.heightAt(x, z) });
    }
    const e = { a: na, b: nb, cls, pts, len };
    edges.push(e);
    a.links.push({ edge: e, other: nb, at: 0 });
    b.links.push({ edge: e, other: na, at: 1 });
    return e;
  };

  // ── 2. Streets between neighbouring junctions.
  const pending = [];
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const here = idx[j * cols + i];
      if (here < 0) continue;
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        const ni = i + di, nj = j + dj;
        if (ni >= cols || nj >= cols) continue;
        const there = idx[nj * cols + ni];
        if (there < 0) continue;
        const bothAvenue = nodes[here].avenue && nodes[there].avenue;
        // An avenue only runs *along* its own line, not across the grain.
        const alongAvenue = bothAvenue
          && ((di === 1 && j % 3 === 0) || (dj === 1 && i % 3 === 0));
        pending.push([here, there, alongAvenue ? 'avenue' : 'street']);
      }
    }
  }
  for (const [a, b, cls] of pending) addEdge(a, b, cls);

  // ── 3. Break the grid.
  //
  // A complete lattice still reads as a lattice however much the nodes wander.
  // Dropping a tenth of the minor streets leaves L-shaped blocks, dead ends
  // and the odd long block, which is what stops it looking machine-made — but
  // only where both junctions keep three ways out, so nothing is stranded.
  for (let k = edges.length - 1; k >= 0; k--) {
    const e = edges[k];
    if (e.cls !== 'street') continue;
    if (rng() > 0.10) continue;
    const a = nodes[e.a], b = nodes[e.b];
    if (a.links.length < 3 || b.links.length < 3) continue;
    a.links = a.links.filter((l) => l.edge !== e);
    b.links = b.links.filter((l) => l.edge !== e);
    edges.splice(k, 1);
  }
  // And a few of the survivors are narrow mews rather than full streets.
  for (const e of edges) {
    if (e.cls === 'street' && rng() < 0.14) e.cls = 'mews';
  }

  // ── 4. The embankment: a road that follows the water instead of ignoring it.
  const bank = traceBank(terrain, reach);
  const bankNodes = [];
  for (const p of bank) {
    if (Math.hypot(p.x, p.z) < exclude) { bankNodes.push(-1); continue; }
    if (!onLand(p.x, p.z, 8)) { bankNodes.push(-1); continue; }
    const n = nodes.length;
    nodes.push({ x: p.x, z: p.z, y: terrain.heightAt(p.x, p.z),
      avenue: true, links: [], bank: true });
    bankNodes.push(n);
  }
  for (let i = 0; i < bankNodes.length - 1; i++) {
    if (bankNodes[i] < 0 || bankNodes[i + 1] < 0) continue;
    addEdge(bankNodes[i], bankNodes[i + 1], 'avenue');
  }
  // Tie the embankment back into the grid, or it is a road to nowhere.
  for (let i = 0; i < bankNodes.length; i += 2) {
    const n = bankNodes[i];
    if (n < 0) continue;
    const near = nearestNode(nodes, nodes[n], 1.6 * pitch, (m) => !m.bank);
    if (near >= 0) addEdge(n, near, 'street');
  }

  // ── 5. The bridge, and the roads that actually reach it.
  //
  // The old map had a bridge standing in the river with no road within a
  // hundred metres of either end. Here each abutment gets a junction of its
  // own, placed past the ramp on ground that can carry a road, and joined into
  // the network in two directions — plus the approach itself, which runs from
  // that junction straight at the bridge. The margin on those two roads is
  // deliberately slack: an approach road *is* meant to come near the water.
  const approaches = [];
  const debug = { bridge: [] };
  if (bridge) {
    for (const [end, sign] of [[bridge.a, -1], [bridge.b, 1]]) {
      // The ramp end, then a little further, until the ground can take a
      // junction. Starting at the abutment itself only ever finds ground that
      // is too close to the bank for a road to be allowed on it.
      // `sign` points from the abutment back inland, and the ramp occupies the
      // first `run` metres of that — so the road has to start where the ramp
      // ends, not at the abutment, which is out over the bank.
      const foot = {
        x: end.x + bridge.out.x * sign * bridge.run,
        z: end.z + bridge.out.z * sign * bridge.run,
      };
      let head = null;
      // The reserved precincts are ignored here, deliberately. The ground
      // behind an abutment belongs to the abbey, to Portcullis House, to
      // whatever else the map has put there — and the bridge still has to be
      // reachable, so the approach takes precedence and anything reserved that
      // it happens to cross simply does not get built.
      for (let t = bridge.run + 46; t <= 260; t += 6) {
        const x = end.x + bridge.out.x * sign * t;
        const z = end.z + bridge.out.z * sign * t;
        if (onLand(x, z, 9, true)) { head = { x, z }; break; }
      }
      debug.bridge.push({ sign, foot: [Math.round(foot.x), Math.round(foot.z)],
        head: head ? [Math.round(head.x), Math.round(head.z)] : null });
      if (!head) continue;
      const n = nodes.length;
      nodes.push({ x: head.x, z: head.z, y: terrain.heightAt(head.x, head.z),
        avenue: true, links: [], approach: true });
      approaches.push(n);
      // The approach itself: carriageway from that junction to the foot of the
      // ramp, so the bridge is met by road rather than by grass.
      const tip = nodes.length;
      nodes.push({ x: foot.x, z: foot.z, y: terrain.heightAt(foot.x, foot.z),
        avenue: true, links: [], approach: true });
      if (!addEdge(n, tip, 'avenue', 0, 8, true)) nodes.pop();
      // Join the junction into the network in more than one direction.
      let joined = 0;
      const tried = new Set();
      for (let k = 0; k < 8 && joined < 2; k++) {
        const near = nearestNode(nodes, nodes[n], 2.6 * pitch,
          (m, mi) => !tried.has(mi) && mi !== n && !m.approach);
        if (near < 0) break;
        tried.add(near);
        if (addEdge(n, near, 'avenue', 5, undefined, true)) joined++;
      }
    }
  }

  // ── 6. Blocks: the holes in the network, which is where buildings go.
  const blocks = [];
  const linked = (a, b) => (a >= 0 && b >= 0
    && nodes[a].links.some((l) => l.other === b));
  for (let j = 0; j < cols - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const c00 = idx[j * cols + i], c10 = idx[j * cols + i + 1];
      const c01 = idx[(j + 1) * cols + i], c11 = idx[(j + 1) * cols + i + 1];
      if (c00 < 0 || c10 < 0 || c01 < 0 || c11 < 0) continue;
      // All four sides have to exist, or this is not an enclosed block and
      // something else (a square, a bigger block) belongs here.
      if (!linked(c00, c10) || !linked(c01, c11)
        || !linked(c00, c01) || !linked(c10, c11)) continue;
      const poly = [nodes[c00], nodes[c10], nodes[c11], nodes[c01]]
        .map((n) => ({ x: n.x, z: n.z }));
      const sides = [
        sideClass(nodes, c00, c10), sideClass(nodes, c10, c11),
        sideClass(nodes, c11, c01), sideClass(nodes, c01, c00),
      ];
      let cx = 0, cz = 0;
      for (const p of poly) { cx += p.x / 4; cz += p.z / 4; }
      blocks.push({ poly, sides, x: cx, z: cz });
    }
  }

  const net = { nodes, edges, blocks, pitch, reach, debug };
  buildEdgeIndex(net);
  return net;
}

/** Which road class runs along this side of a block. */
function sideClass(nodes, a, b) {
  const l = nodes[a].links.find((k) => k.other === b);
  return l ? l.edge.cls : 'street';
}

function nearestNode(nodes, from, maxDist, ok) {
  let best = -1, bd = maxDist;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n === from) continue;
    if (ok && !ok(n, i)) continue;
    const d = Math.hypot(n.x - from.x, n.z - from.z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * Follow the near bank of the river, a fixed distance inland.
 *
 * Marching along z and stepping out to the waterline gives a line that is as
 * ragged as the mask; smoothing it three times gives one a road can run along.
 */
function traceBank(terrain, reach) {
  const raw = [];
  for (let z = -reach; z <= reach; z += 26) {
    let found = null;
    for (let x = -reach * 0.2; x < reach; x += 5) {
      if (terrain.isWater(x, z)) { found = x; break; }
    }
    if (found === null) continue;
    raw.push({ x: found - 21, z });
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < raw.length - 1; i++) {
      raw[i].x = (raw[i - 1].x + raw[i].x * 2 + raw[i + 1].x) / 4;
    }
  }
  // Thin it to junction spacing.
  const out = [];
  for (let i = 0; i < raw.length; i += 3) out.push(raw[i]);
  return out;
}

// ─────────────────────────────────────────────────────────────── lookups ──

/**
 * A grid of the segments, so "is this spot in the road?" is a handful of
 * distance tests rather than a walk over the whole network. Every building
 * placement asks that question, several times.
 */
function buildEdgeIndex(net) {
  const CELL = 64;
  const map = new Map();
  const key = (cx, cz) => cx * 8192 + cz;
  const segs = [];
  for (const e of net.edges) {
    const half = halfWidth(e.cls);
    for (let i = 0; i < e.pts.length - 1; i++) {
      segs.push({ a: e.pts[i], b: e.pts[i + 1], half, cls: e.cls });
    }
  }
  for (let s = 0; s < segs.length; s++) {
    const { a, b, half } = segs[s];
    const x0 = Math.floor((Math.min(a.x, b.x) - half) / CELL);
    const x1 = Math.floor((Math.max(a.x, b.x) + half) / CELL);
    const z0 = Math.floor((Math.min(a.z, b.z) - half) / CELL);
    const z1 = Math.floor((Math.max(a.z, b.z) + half) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let bucket = map.get(k);
        if (!bucket) map.set(k, bucket = []);
        bucket.push(s);
      }
    }
  }
  net.segs = segs;
  /** Distance from (x,z) to the nearest carriageway edge; negative if inside. */
  net.roadClearance = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (let ax = cx - 1; ax <= cx + 1; ax++) {
      for (let az = cz - 1; az <= cz + 1; az++) {
        const bucket = map.get(key(ax, az));
        if (!bucket) continue;
        for (const si of bucket) {
          const s = segs[si];
          best = Math.min(best, pointSeg(x, z, s.a, s.b) - s.half);
        }
      }
    }
    return best;
  };
  // Junction pads are wider than the streets that meet them.
  net.nodeClearance = (x, z) => {
    let best = Infinity;
    for (const n of net.nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d > 60) continue;
      best = Math.min(best, d - padRadius(n));
    }
    return best;
  };
}

function pointSeg(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

/** How far the junction's paving reaches from its centre. */
export function padRadius(node) {
  let r = 6;
  for (const l of node.links) r = Math.max(r, halfWidth(l.edge.cls));
  return r;
}

/** Unit direction leaving `node` along one of its links. */
function linkDir(node, link) {
  const pts = link.edge.pts;
  const p = link.at === 0 ? pts[1] : pts[pts.length - 2];
  const dx = p.x - node.x, dz = p.z - node.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

// ─────────────────────────────────────────────────────────────── surface ──

const ASPHALT = new THREE.Color(0x35383d);
const PAVE = new THREE.Color(0xa8a294);
const KERB = new THREE.Color(0xc4bdab);

/**
 * The road surface: every street a ribbon, every junction a paved pad.
 *
 * The pads are the part that was missing before. Two straight ribbons crossing
 * each other overlap in a square of double-drawn, z-fighting asphalt with the
 * pavement running straight through the middle of the crossing — which is
 * exactly what a grid of independent stripes gives you. Here each street stops
 * short of the junction and the junction itself is filled with a pad built
 * from the directions of the streets that meet it, so the paving is continuous
 * and the kerb lines turn the corner.
 */
export function buildStreetSurface(net, terrain, quality) {
  const LIFT = 0.22;
  const pos = [];
  const col = [];
  const tmp = new THREE.Color();

  const vert = (x, z, y, colour) => {
    pos.push(x, y, z);
    const j = 0.88 + 0.24 * valueNoise(x * 0.03, z * 0.03);
    tmp.copy(colour).multiplyScalar(j);
    col.push(tmp.r, tmp.g, tmp.b);
  };
  // The last word on where tarmac may go. A bridge approach is allowed to run
  // closer to the bank than any other road, and the graph only ever checks the
  // centre line — so the surface checks each corner, and simply does not lay
  // the piece that would end up in the river.
  const dry = (p) => !terrain.isWater(p.x, p.z);
  const quad = (p0, p1, p2, p3, colour) => {
    if (!dry(p0) || !dry(p1) || !dry(p2) || !dry(p3)) return;
    vert(p0.x, p0.z, p0.y, colour); vert(p1.x, p1.z, p1.y, colour);
    vert(p2.x, p2.z, p2.y, colour);
    vert(p0.x, p0.z, p0.y, colour); vert(p2.x, p2.z, p2.y, colour);
    vert(p3.x, p3.z, p3.y, colour);
  };

  // ── Ribbons.
  for (const e of net.edges) {
    const c = ROAD_CLASS[e.cls];
    const lanes = [
      [-c.road / 2 - c.pave - c.kerb, -c.road / 2 - c.pave, KERB],
      [-c.road / 2 - c.pave, -c.road / 2, PAVE],
      [-c.road / 2, c.road / 2, ASPHALT],
      [c.road / 2, c.road / 2 + c.pave, PAVE],
      [c.road / 2 + c.pave, c.road / 2 + c.pave + c.kerb, KERB],
    ];
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const trimA = padRadius(a) * 0.98, trimB = padRadius(b) * 0.98;
    const line = trimPolyline(e.pts, trimA, trimB);
    if (line.length < 2) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const p = line[i], q = line[i + 1];
      const dx = q.x - p.x, dz = q.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = -dz / d, nz = dx / d;
      // Ease the ends up to the junction's own level so pad and ribbon meet.
      const yAt = (pt, w) => {
        const g = terrain.heightAt(pt.x, pt.z) + LIFT;
        if (w <= 0) return g;
        return g * (1 - w) + w * (pt.nearA ? a.y + LIFT : b.y + LIFT);
      };
      const wp = endWeight(i, line.length - 1), wq = endWeight(i + 1, line.length - 1);
      p.nearA = i < line.length / 2; q.nearA = (i + 1) < line.length / 2;
      const py = yAt(p, wp), qy = yAt(q, wq);
      for (const [f0, f1, colour] of lanes) {
        quad(
          { x: p.x + nx * f0, z: p.z + nz * f0, y: py },
          { x: q.x + nx * f0, z: q.z + nz * f0, y: qy },
          { x: q.x + nx * f1, z: q.z + nz * f1, y: qy },
          { x: p.x + nx * f1, z: p.z + nz * f1, y: py },
          colour,
        );
      }
    }
  }

  // ── Junction pads. Pavement first, asphalt a few centimetres over it: the
  // two are coplanar otherwise and the crossing flickers.
  for (const n of net.nodes) {
    if (!n.links.length) continue;
    const y = n.y + LIFT;
    const outer = [];
    const inner = [];
    for (const l of n.links) {
      const dir = linkDir(n, l);
      const c = ROAD_CLASS[l.edge.cls];
      const r = padRadius(n);
      const px = -dir.z, pz = dir.x;
      const full = c.road / 2 + c.pave + c.kerb;
      outer.push({ x: n.x + dir.x * r + px * full, z: n.z + dir.z * r + pz * full });
      outer.push({ x: n.x + dir.x * r - px * full, z: n.z + dir.z * r - pz * full });
      inner.push({ x: n.x + dir.x * r + px * c.road / 2, z: n.z + dir.z * r + pz * c.road / 2 });
      inner.push({ x: n.x + dir.x * r - px * c.road / 2, z: n.z + dir.z * r - pz * c.road / 2 });
    }
    fan(hull(outer), n, y, PAVE, vert, dry);
    fan(hull(inner), n, y + 0.03, ASPHALT, vert, dry);
  }

  // Face every triangle upward.
  //
  // The ribbons are wound from the direction the street happens to run and the
  // junction pads from whatever order the hull came out in, so roughly half of
  // this mesh would otherwise be facing the ground — invisible, since the
  // material is single-sided. Flipping by the sign of the normal is simpler
  // and more robust than trying to keep every generator's winding consistent.
  for (let t = 0; t < pos.length; t += 9) {
    const ax = pos[t + 3] - pos[t], ay = pos[t + 4] - pos[t + 1], az = pos[t + 5] - pos[t + 2];
    const bx = pos[t + 6] - pos[t], by = pos[t + 7] - pos[t + 1], bz = pos[t + 8] - pos[t + 2];
    if (az * bx - ax * bz >= 0) continue;      // y component of a × b
    for (let k = 0; k < 3; k++) {
      const s = pos[t + 3 + k]; pos[t + 3 + k] = pos[t + 6 + k]; pos[t + 6 + k] = s;
      const c = col[t + 3 + k]; col[t + 3 + k] = col[t + 6 + k]; col[t + 6 + k] = c;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  mesh.receiveShadow = quality.shadowMapSize > 0;
  mesh.frustumCulled = false;
  mesh.name = 'streets';
  return mesh;
}

function endWeight(i, last) {
  const t = i / last;
  if (t < 0.2) return 1 - t / 0.2;
  if (t > 0.8) return (t - 0.8) / 0.2;
  return 0;
}

/** Triangle fan from the centre of a junction out to its paved outline. */
function fan(ring, n, y, colour, vert, dry) {
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    if (dry && (!dry(p) || !dry(q))) continue;
    vert(n.x, n.z, y, colour);
    vert(p.x, p.z, y, colour);
    vert(q.x, q.z, y, colour);
  }
}

/** Convex hull, monotone chain. Small inputs: at most a dozen points. */
function hull(pts) {
  if (pts.length < 3) return pts;
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.z - b.z));
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

/** Cut `from` metres off the start of a polyline and `to` off the end. */
function trimPolyline(pts, from, to) {
  const total = polyLength(pts);
  if (total <= from + to + 1) return [];
  const out = [];
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    const s0 = walked, s1 = walked + seg;
    walked = s1;
    const lo = Math.max(from, s0), hi = Math.min(total - to, s1);
    if (hi <= lo) continue;
    const t0 = (lo - s0) / seg, t1 = (hi - s0) / seg;
    const at = (t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (!out.length) out.push(at(t0));
    out.push(at(t1));
  }
  return out;
}

function polyLength(pts) {
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return d;
}

// ────────────────────────────────────────────────────────────── markings ──

/**
 * Paint. Centre lines, crossings, stop lines and parking bays.
 *
 * All of it hangs off the network, so a crossing is always at a junction and
 * always across the carriageway rather than wherever a fixed-pitch loop
 * happened to put it.
 */
export function addStreetMarkings(props, net, terrain, rng, dense = 1) {
  const counts = { dashes: 0, crossings: 0, stopLines: 0, bays: 0 };
  const white = 0xd9d5c8;

  const paint = (x, z, w, d, ry, colour = white) => {
    const g = new THREE.BoxGeometry(w, 0.06, d);
    g.rotateY(ry);
    g.translate(x, terrain.heightAt(x, z) + 0.30, z);
    props.add('markings', g, colour, 0);
  };

  for (const e of net.edges) {
    const c = ROAD_CLASS[e.cls];
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const line = trimPolyline(e.pts, padRadius(a) + 3, padRadius(b) + 3);
    if (line.length < 2) continue;

    // Centre line, dashed, on anything wide enough to have two lanes.
    if (c.dashes) {
      walkPolyline(line, 9 / dense, (x, z, dir) => {
        paint(x, z, 0.32, 3.4, Math.atan2(dir.x, dir.z));
        counts.dashes++;
      });
    }
    // Parking bays: a broken line just inside the kerb, which from above reads
    // as the cars that are not there.
    if (e.cls !== 'mews' && rng() < 0.5 * dense) {
      const side = rng() < 0.5 ? 1 : -1;
      walkPolyline(line, 13 / dense, (x, z, dir) => {
        const nx = -dir.z * side, nz = dir.x * side;
        paint(x + nx * (c.road / 2 - 0.5), z + nz * (c.road / 2 - 0.5),
          0.2, 4.6, Math.atan2(dir.x, dir.z), 0xd8c96a);
        counts.bays++;
      });
    }
  }

  // Crossings and stop lines on the approach to every real junction.
  for (const n of net.nodes) {
    if (n.links.length < 3) continue;
    for (const l of n.links) {
      const c = ROAD_CLASS[l.edge.cls];
      if (c.road < 7) continue;
      const dir = linkDir(n, l);
      const r = padRadius(n) + 2.2;
      const ry = Math.atan2(dir.x, dir.z);
      // Zebra: stripes across the carriageway, running with the road.
      const stripes = Math.max(3, Math.round(c.road / (dense > 0.8 ? 1.5 : 2.4)));
      for (let s = 0; s < stripes; s++) {
        const f = (s / (stripes - 1) - 0.5) * (c.road - 1.0);
        const px = -dir.z * f, pz = dir.x * f;
        paint(n.x + dir.x * r + px, n.z + dir.z * r + pz, 0.62, 3.6, ry);
      }
      counts.crossings++;
      // Stop line beyond it.
      const sr = r + 2.8;
      paint(n.x + dir.x * sr, n.z + dir.z * sr, c.road - 0.6, 0.4, ry);
      counts.stopLines++;
    }

    // Yellow box junction on the busiest crossings: a hatched square that
    // reads, from directly above, as the one thing in the frame that is
    // unmistakably a road junction.
    const avenues = n.links.filter((l) => l.edge.cls === 'avenue').length;
    if (avenues >= 2 && n.links.length >= 3) {
      const size = padRadius(n) * 1.25;
      for (let k = -3; k <= 3; k++) {
        const off = (k / 3) * size * 0.8;
        paint(n.x + off, n.z, 0.22, size * 1.5, Math.PI / 4, 0xc8b45e);
        paint(n.x + off, n.z, 0.22, size * 1.5, -Math.PI / 4, 0xc8b45e);
      }
      counts.hatching = (counts.hatching || 0) + 1;
    }
  }

  // Patches of resurfaced road: a slightly different asphalt, laid over the
  // old. The cheapest possible cure for a perfectly uniform carriageway, and
  // at this range one of the most effective.
  counts.patches = 0;
  for (const e of net.edges) {
    if (rng() > 0.45) continue;
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const line = trimPolyline(e.pts, padRadius(a) + 4, padRadius(b) + 4);
    if (line.length < 2) continue;
    const c = ROAD_CLASS[e.cls];
    walkPolyline(line, 60, (x, z, dir) => {
      const w = 2.2 + rng() * (c.road - 2.5);
      const d = 3 + rng() * 7;
      const off = (rng() - 0.5) * (c.road - w);
      paint(x - dir.z * off, z + dir.x * off, w, d, Math.atan2(dir.x, dir.z),
        rng() < 0.5 ? 0x3d4046 : 0x2c2f34);
      counts.patches++;
    });
  }
  return counts;
}

/** Call `cb` every `spacing` metres along a polyline, with the local direction. */
function walkPolyline(pts, spacing, cb) {
  let carry = spacing * 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    const dir = { x: dx / len, z: dz / len };
    for (let s = carry; s < len; s += spacing) {
      cb(a.x + dir.x * s, a.z + dir.z * s, dir);
    }
    carry = Math.max(0, carry + Math.ceil((len - carry) / spacing) * spacing - len);
  }
}

// ───────────────────────────────────────────────────────────── furniture ──

/**
 * Everything that stands at the kerb.
 *
 * Driving this off the network rather than off the buildings is what puts a
 * lamp post on the pavement instead of in the middle of a garden, and lets the
 * spacing be a real rhythm down the street — which is what the eye reads at
 * this range, far more than any single object.
 */
export function addNetworkFurniture(props, net, terrain, rng, dense) {
  const counts = { lamps: 0, streetTrees: 0, parked: 0, signals: 0, bollards: 0,
    busStops: 0, hydrants: 0, bins: 0 };
  const CAR_COLOURS = [0x9aa3ad, 0x2f3a45, 0x8c3a32, 0x3d5a46, 0xb8b2a4, 0x24303a];

  for (const e of net.edges) {
    const c = ROAD_CLASS[e.cls];
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const line = trimPolyline(e.pts, padRadius(a) + 2, padRadius(b) + 2);
    if (line.length < 2) continue;
    let flip = 1;

    // Lamps, alternating sides down the street.
    walkPolyline(line, c.lamp / dense, (x, z, dir) => {
      flip = -flip;
      const off = (c.road / 2 + c.pave * 0.55) * flip;
      const px = x - dir.z * off, pz = z + dir.x * off;
      if (terrain.isWater(px, pz)) return;
      const y = terrain.heightAt(px, pz);
      const post = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 5);
      post.translate(px, y + 3.2, pz);
      props.add('dark', post, 0x2b3138, 0);
      const arm = new THREE.BoxGeometry(0.9, 0.16, 0.24);
      arm.rotateY(Math.atan2(dir.x, dir.z));
      arm.translate(px - dir.z * off * 0.12, y + 6.4, pz + dir.x * off * 0.12);
      props.add('dark', arm, 0x2b3138, 0);
      const head = new THREE.BoxGeometry(0.7, 0.22, 0.34);
      head.translate(px, y + 6.5, pz);
      props.add('paint', head, 0xd9d2bd, 0);
      counts.lamps++;
    });

    // Street trees line the avenues. Nothing says "boulevard" faster.
    if (c.trees) {
      walkPolyline(line, 19 / dense, (x, z, dir) => {
        const side = rng() < 0.5 ? 1 : -1;
        const off = (c.road / 2 + c.pave * 0.5) * side;
        const px = x - dir.z * off, pz = z + dir.x * off;
        if (terrain.isWater(px, pz)) return;
        const y = terrain.heightAt(px, pz);
        const h = 6 + rng() * 3.4;
        const trunk = new THREE.CylinderGeometry(0.16, 0.24, h * 0.46, 5);
        trunk.translate(px, y + h * 0.23, pz);
        props.add('dark', trunk, 0x5a4432, 0);
        const crown = new THREE.SphereGeometry(h * 0.31, 6, 5);
        crown.scale(1, 0.82, 1);
        crown.translate(px, y + h * 0.72, pz);
        props.add('foliage', crown, 0x4a7a32, 0.18);
        // A tree pit in the pavement: a square of dark earth with a grate.
        const pit = new THREE.BoxGeometry(1.5, 0.08, 1.5);
        pit.translate(px, y + 0.27, pz);
        props.add('dark', pit, 0x3a332a, 0);
        counts.streetTrees++;
      });
    }

    // Parked cars, nose to tail along the kerb, aligned with the street.
    if (e.cls !== 'mews') {
      walkPolyline(line, 7.5 / dense, (x, z, dir) => {
        if (rng() > 0.5 * dense + 0.2) return;
        const side = rng() < 0.5 ? 1 : -1;
        const off = (c.road / 2 - 1.15) * side;
        const px = x - dir.z * off, pz = z + dir.x * off;
        if (terrain.isWater(px, pz)) return;
        const y = terrain.heightAt(px, pz);
        const ry = Math.atan2(dir.x, dir.z);
        const body = new THREE.BoxGeometry(1.86, 0.92, 4.3);
        body.rotateY(ry); body.translate(px, y + 0.62, pz);
        props.add('paint', body, CAR_COLOURS[Math.floor(rng() * CAR_COLOURS.length)], 0.1);
        const cabin = new THREE.BoxGeometry(1.7, 0.66, 2.2);
        cabin.rotateY(ry); cabin.translate(px, y + 1.34, pz);
        props.add('glass', cabin, 0x59626b, 0.06);
        counts.parked++;
      });
    }
  }

  // Junction kit: signals on the big crossings, bollards on the corners.
  for (const n of net.nodes) {
    const ways = n.links.length;
    if (!ways) continue;
    const y = n.y;
    const major = n.links.filter((l) => l.edge.cls === 'avenue').length >= 2;
    for (const l of n.links) {
      const dir = linkDir(n, l);
      const c = ROAD_CLASS[l.edge.cls];
      const r = padRadius(n) + 1.2;
      const side = c.road / 2 + c.pave * 0.6;
      for (const s of [-1, 1]) {
        const px = n.x + dir.x * r - dir.z * side * s;
        const pz = n.z + dir.z * r + dir.x * side * s;
        if (terrain.isWater(px, pz)) continue;
        const gy = terrain.heightAt(px, pz);
        if (major && ways >= 3 && s > 0) {
          const post = new THREE.CylinderGeometry(0.1, 0.12, 3.6, 5);
          post.translate(px, gy + 1.8, pz);
          props.add('dark', post, 0x2b3138, 0);
          const box = new THREE.BoxGeometry(0.34, 0.9, 0.3);
          box.rotateY(Math.atan2(dir.x, dir.z));
          box.translate(px, gy + 4.0, pz);
          props.add('dark', box, 0x23282d, 0);
          for (let k = 0; k < 3; k++) {
            const lens = new THREE.SphereGeometry(0.1, 5, 4);
            lens.translate(px, gy + 4.3 - k * 0.28, pz - 0.17);
            props.add('paint', lens, [0xd14b3a, 0xd7b23c, 0x4fa85a][k], 0);
          }
          counts.signals++;
        } else if (rng() < 0.5) {
          const b = new THREE.CylinderGeometry(0.13, 0.15, 0.95, 6);
          b.translate(px, gy + 0.48, pz);
          props.add('dark', b, 0x3b4148, 0);
          counts.bollards++;
        }
      }
    }
    // A bus stop on some of the through routes.
    if (major && rng() < 0.25) {
      const l = n.links[Math.floor(rng() * n.links.length)];
      const dir = linkDir(n, l);
      const off = ROAD_CLASS[l.edge.cls].road / 2 + 2.2;
      const px = n.x + dir.x * (padRadius(n) + 9) - dir.z * off;
      const pz = n.z + dir.z * (padRadius(n) + 9) + dir.x * off;
      if (!terrain.isWater(px, pz)) {
        const gy = terrain.heightAt(px, pz);
        const ry = Math.atan2(dir.x, dir.z);
        const roof = new THREE.BoxGeometry(4.2, 0.16, 1.7);
        roof.rotateY(ry); roof.translate(px, gy + 2.6, pz);
        props.add('metal', roof, 0x8e949a, 0);
        const back = new THREE.BoxGeometry(4.2, 2.4, 0.1);
        back.rotateY(ry); back.translate(px - Math.cos(ry) * 0.8, gy + 1.3, pz + Math.sin(ry) * 0.8);
        props.add('glass', back, 0x76838c, 0);
        counts.busStops++;
      }
    }
    if (rng() < 0.3) {
      const px = n.x + (rng() - 0.5) * 4, pz = n.z + (rng() - 0.5) * 4;
      const gy = terrain.heightAt(px, pz);
      const bin = new THREE.CylinderGeometry(0.33, 0.28, 1.0, 7);
      bin.translate(px + padRadius(n) * 0.9, gy + 0.5, pz);
      props.add('dark', bin, 0x3f4640, 0);
      counts.bins++;
    }

    // A street name plate on one corner, and guard rails on the busy ones so
    // the junction has something standing at it besides the signals.
    if (n.links.length >= 3 && rng() < 0.45) {
      const l = n.links[Math.floor(rng() * n.links.length)];
      const dir = linkDir(n, l);
      const off = ROAD_CLASS[l.edge.cls].road / 2 + 2.0;
      const px = n.x + dir.x * (padRadius(n) + 1.5) - dir.z * off;
      const pz = n.z + dir.z * (padRadius(n) + 1.5) + dir.x * off;
      if (!terrain.isWater(px, pz)) {
        const gy = terrain.heightAt(px, pz);
        const ry = Math.atan2(dir.x, dir.z);
        const post = new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5);
        post.translate(px, gy + 1.2, pz);
        props.add('dark', post, 0x50565c, 0);
        const plate = new THREE.BoxGeometry(1.15, 0.3, 0.05);
        plate.rotateY(ry); plate.translate(px, gy + 2.3, pz);
        props.add('paint', plate, 0xe6e2d6, 0);
        counts.signs = (counts.signs || 0) + 1;
      }
    }
    if (major && n.links.length >= 3) {
      for (const l of n.links) {
        const dir = linkDir(n, l);
        const c = ROAD_CLASS[l.edge.cls];
        for (const sgn of [-1, 1]) {
          if (rng() > 0.4) continue;
          for (let k = 0; k < 4; k++) {
            const along = padRadius(n) + 3 + k * 1.3;
            const off = (c.road / 2 + 0.5) * sgn;
            const px = n.x + dir.x * along - dir.z * off;
            const pz = n.z + dir.z * along + dir.x * off;
            if (terrain.isWater(px, pz)) continue;
            const gy = terrain.heightAt(px, pz);
            const rail = new THREE.BoxGeometry(0.08, 1.05, 1.25);
            rail.rotateY(Math.atan2(dir.x, dir.z));
            rail.translate(px, gy + 0.55, pz);
            props.add('metal', rail, 0x9aa0a6, 0);
            counts.guardRails = (counts.guardRails || 0) + 1;
          }
        }
      }
    }
  }

  // Drainage: a gully at the kerb every so often, and a manhole in the
  // carriageway. Both are flat and tiny and both are visible from straight
  // above, which is where this game is played from.
  counts.drains = 0;
  for (const e of net.edges) {
    const c = ROAD_CLASS[e.cls];
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const line = trimPolyline(e.pts, padRadius(a) + 3, padRadius(b) + 3);
    if (line.length < 2) continue;
    walkPolyline(line, 34 / dense, (x, z, dir) => {
      const side = rng() < 0.5 ? 1 : -1;
      const off = (c.road / 2 - 0.35) * side;
      const px = x - dir.z * off, pz = z + dir.x * off;
      if (terrain.isWater(px, pz)) return;
      const gy = terrain.heightAt(px, pz);
      const gully = new THREE.BoxGeometry(0.5, 0.06, 0.8);
      gully.rotateY(Math.atan2(dir.x, dir.z));
      gully.translate(px, gy + 0.3, pz);
      props.add('markings', gully, 0x25282c, 0);
      counts.drains++;
      if (rng() < 0.45) {
        const mx = x + (rng() - 0.5) * c.road * 0.5;
        const mz = z + (rng() - 0.5) * c.road * 0.5;
        const cover = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 8);
        cover.translate(mx, terrain.heightAt(mx, mz) + 0.3, mz);
        props.add('markings', cover, 0x33373c, 0);
        counts.drains++;
      }
    });
  }
  return counts;
}
