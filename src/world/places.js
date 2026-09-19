import * as THREE from 'three';
import { box, cyl } from './detail.js';
import { valueNoise } from './terrain.js';

/**
 * The places, as opposed to the streets.
 *
 * Three things live here, and they have one idea in common: ground that has
 * nothing on it reads as a mistake, and the cure is not more clutter but a
 * *reason*. A precinct is a precinct because of what stands round its edge; a
 * block is a block because of what it is for; and the country beyond the town
 * is farms and an airfield and a reservoir, because that is what is beyond a
 * town. Everything here is merged into the same prop buckets as the rest of the
 * detail pass, so the whole lot is a handful of draw calls.
 */

// ───────────────────────────────────────────────────────────────── precinct ──

/**
 * What stands around the landmark.
 *
 * Described by the level rather than decided here, so adding a map means
 * writing down what is actually at that place instead of editing this. At
 * Westminster that is ironwork on a stone plinth with gate piers, lawn and
 * paved walks inside it, and statues on plinths; at Agra it is the red
 * sandstone wall with its crenellated coping and the quartered garden with a
 * water channel down the middle.
 */
export function buildPrecinct(props, terrain, rng, opts) {
  const spec = opts.precinct;
  if (!spec) return {};
  const net = opts.net;
  const yaw = opts.yaw || 0;
  const counts = { railing: 0, piers: 0, statues: 0, walks: 0, beds: 0 };
  const gy = (x, z) => terrain.surfaceAt(x, z);
  const cu = Math.cos(yaw), su = Math.sin(yaw);
  // Grid space: the axes the plan is laid out on, so the enclosure is square to
  // the streets round it rather than square to the map.
  const toGrid = (x, z) => ({ u: x * cu - z * su, v: x * su + z * cu });
  const toWorld = (u, v) => ({ x: u * cu + v * su, z: -u * su + v * cu });

  // The enclosure follows the building, not a compass.
  //
  // A ring of fence at a fixed radius reads as a circle drawn round a monument
  // — which is what it is. What stands round a palace is a wall along its own
  // frontage, so the boundary is the landmarks' combined footprint, set out in
  // the grid's axes and given a generous forecourt, with its corners cut off.
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const l of (opts.landmarks || [])) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const g = toGrid(l.x + sx * l.w / 2, l.z + sz * l.d / 2);
      u0 = Math.min(u0, g.u); u1 = Math.max(u1, g.u);
      v0 = Math.min(v0, g.v); v1 = Math.max(v1, g.v);
    }
  }
  if (!isFinite(u0)) {
    const r = opts.radius;
    u0 = -r; u1 = r; v0 = -r; v1 = r;
  }
  const PAD = 26;
  u0 -= PAD; u1 += PAD; v0 -= PAD; v1 += PAD;
  const CUT = Math.min(18, (u1 - u0) * 0.22, (v1 - v0) * 0.22);
  // The outline, corners cut, walked as one closed polyline.
  const poly = [
    [u0 + CUT, v0], [u1 - CUT, v0], [u1, v0 + CUT], [u1, v1 - CUT],
    [u1 - CUT, v1], [u0 + CUT, v1], [u0, v1 - CUT], [u0, v0 + CUT],
  ].map(([u, v]) => toWorld(u, v));

  // Where a street points at the enclosure, leave a gap and mark it with piers.
  const gates = [];
  for (const n of (net?.nodes || [])) {
    if (!n.links.length) continue;
    const g = toGrid(n.x, n.z);
    if (g.u < u0 - 70 || g.u > u1 + 70 || g.v < v0 - 70 || g.v > v1 + 70) continue;
    gates.push({ x: n.x, z: n.z });
  }
  const atGate = (x, z) => gates.some((q) => Math.hypot(q.x - x, q.z - z) < 26);

  const sandstone = spec.boundary === 'sandstone';
  const STEP = 3.2;
  // A precinct only gets a boundary if it has one.
  //
  // This function used to read two fields out of the spec — whether the wall
  // was sandstone and whether the garden was a charbagh — and build a London
  // square for every other answer. Giza's spec says `boundary: 'none'`,
  // `ground: 'sand'`, `ornament: 'none'`, and its comment says there is no
  // wall on the plateau, only sand. It was getting ironwork on a plinth all
  // the way round, eight statues, and a gravel walk in from every gate.
  if (spec.boundary !== 'none') for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n2 = Math.max(1, Math.round(len / STEP));
    const ang = Math.atan2(dx, dz);
    for (let k = 0; k < n2; k++) {
      const t = (k + 0.5) / n2;
      const x = a.x + dx * t, z = a.z + dz * t;
      if (terrain.isWater(x, z)) continue;
      if (net && net.roadClearance(x, z) < 1.5) continue;
      const g = gy(x, z);
      if (atGate(x, z)) {
        if (k % 6 !== 0) continue;
        props.add('stone', box(1.8, 3.6, 1.8, x, g + 1.8, z, ang),
          sandstone ? 0x9c5a44 : 0xb3ab97, 0.9 + rng() * 0.14);
        props.add('stone', box(2.2, 0.5, 2.2, x, g + 3.85, z, ang),
          sandstone ? 0xb06a50 : 0xc7bfa9, 0.95);
        counts.piers++;
        continue;
      }
      const seg = len / n2 + 0.12;
      if (sandstone) {
        props.add('stone', box(1.6, 3.4, seg, x, g + 1.7, z, ang), 0x9e5c45,
          0.88 + rng() * 0.18);
        if (k % 2 === 0) {
          props.add('stone', box(1.2, 0.8, seg * 0.46, x, g + 3.8, z, ang), 0xa9644c, 0.95);
        }
      } else {
        // A continuous stone plinth with ironwork standing on it, and a post
        // every few bays rather than at every one — a post at every bay reads
        // as a row of black dashes rather than as a railing.
        props.add('stone', box(1.1, 0.8, seg, x, g + 0.4, z, ang), 0xb0a894,
          0.9 + rng() * 0.14);
        props.add('metal', box(0.07, 2.0, seg, x, g + 1.8, z, ang), 0x252b30, 0.92);
        props.add('metal', box(0.11, 0.16, seg, x, g + 2.72, z, ang), 0x1e2429, 1);
        if (k % 4 === 0) {
          props.add('metal', box(0.3, 2.7, 0.3, x, g + 2.15, z, ang), 0x1d2226, 1);
          props.add('paint', box(0.22, 0.3, 0.22, x, g + 3.62, z, ang), 0xb08a34, 1);
        }
      }
      counts.railing++;
    }
  }

  // ── Inside the enclosure: ground with a plan to it, and never on the
  // building itself.
  const onLandmark = (x, z) => (opts.landmarks || []).some(
    (l) => Math.abs(x - l.x) < l.w / 2 + 6 && Math.abs(z - l.z) < l.d / 2 + 6);
  const clear = (x, z) => !terrain.isWater(x, z) && !onLandmark(x, z)
    && (!net || net.roadClearance(x, z) > 4);
  const inside = (x, z) => {
    const g = toGrid(x, z);
    return g.u > u0 + 4 && g.u < u1 - 4 && g.v > v0 + 4 && g.v < v1 - 4;
  };

  if (spec.ground === 'charbagh') {
    // Four quarters divided by raised walks, with a water channel down the
    // middle of each and a fountain where they cross: a Mughal garden.
    for (const along of [0, Math.PI / 2]) {
      const dx = Math.sin(yaw + along), dz = Math.cos(yaw + along);
      for (let t = -300; t <= 300; t += 6) {
        const x = dx * t, z = dz * t;
        if (!inside(x, z) || !clear(x, z)) continue;
        props.add('stone', box(8.0, 0.3, 6.2, x, gy(x, z) + 0.2, z, yaw + along),
          0xcac0a6, 0.92 + rng() * 0.1);
        props.add('glass', box(2.8, 0.22, 5.6, x, gy(x, z) + 0.35, z, yaw + along),
          0x33566b, 0.95);
        counts.walks++;
      }
    }
  } else if (spec.ground !== 'sand') {
    // A square with a plan to it: a gravel walk round the inside of the
    // railings, walks in from the gates to the building, a few planted beds,
    // and a line of plane trees along the fence.
    //
    // Not on sand. The walks run from each gate to the middle of the
    // enclosure, and the enclosure is the landmarks' combined footprint — on
    // a plateau holding three pyramids and a sphinx that is most of the map,
    // so every one of them drew a paved line hundreds of metres across open
    // desert. From above they are the pale scratches fanning out from the
    // pyramids: a garden path, laid on the Western Desert.
    //
    // The grass itself is the ground's — the terrain paints the whole pad as
    // lawn — so nothing green is laid on top of it. The version this replaces
    // scattered ninety lawn panels of random size and shade across the
    // precinct, overlapping each other, the walks and the building's foot,
    // and from a phone the whole square read as a patchwork quilt.
    const WALK = 3.4;
    const walk = (x, z, len, ang) => {
      if (!clear(x, z)) return false;
      props.add('stone', box(WALK, 0.16, len + 0.1, x, gy(x, z) + 0.14, z, ang),
        0xc6bca2, 0.92 + rng() * 0.1);
      counts.walks++;
      return true;
    };
    // The perimeter walk: the enclosure's outline again, eight metres in, so
    // the trees stand on the grass between it and the railings.
    const IN = 8;
    const cut2 = Math.max(4, CUT - IN * 0.4);
    const inner = [
      [u0 + IN + cut2, v0 + IN], [u1 - IN - cut2, v0 + IN], [u1 - IN, v0 + IN + cut2],
      [u1 - IN, v1 - IN - cut2], [u1 - IN - cut2, v1 - IN], [u0 + IN + cut2, v1 - IN],
      [u0 + IN, v1 - IN - cut2], [u0 + IN, v0 + IN + cut2],
    ].map(([u, v]) => toWorld(u, v));
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const n2 = Math.max(1, Math.round(len / 6));
      const ang = Math.atan2(dx, dz);
      for (let k = 0; k < n2; k++) {
        const t = (k + 0.5) / n2;
        walk(a.x + dx * t, a.z + dz * t, len / n2, ang);
      }
    }
    // From each gate, straight in to the building's foot.
    const cx = (u0 + u1) / 2, cz = (v0 + v1) / 2;
    const centre = toWorld(cx, cz);
    const seen = [];
    for (const gt of gates) {
      if (seen.some((s) => Math.hypot(s.x - gt.x, s.z - gt.z) < 40)) continue;
      seen.push(gt);
      const dx = centre.x - gt.x, dz = centre.z - gt.z;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const ux = dx / len, uz = dz / len;
      const ang = Math.atan2(ux, uz);
      for (let t = 3; t < len; t += 5) {
        const x = gt.x + ux * t, z = gt.z + uz * t;
        if (!inside(x, z)) continue;
        if (onLandmark(x, z)) break;
        walk(x, z, 5, ang);
      }
    }
    // Beds: a handful, round, dark earth with planting, and never on a walk.
    for (let k = 0, tries = 0; k < 6 && tries < 40; tries++) {
      const u = u0 + IN + 10 + rng() * (u1 - u0 - 2 * IN - 20);
      const v = v0 + IN + 10 + rng() * (v1 - v0 - 2 * IN - 20);
      const q = toWorld(u, v);
      if (!clear(q.x, q.z)) continue;
      const dg = centre.x - q.x, dgz = centre.z - q.z;
      const onCross = seen.some((gt) => {
        const ex = centre.x - gt.x, ez = centre.z - gt.z, el = Math.hypot(ex, ez);
        const s = ((q.x - gt.x) * ex + (q.z - gt.z) * ez) / (el * el);
        if (s < 0 || s > 1) return false;
        const px = gt.x + ex * s, pz = gt.z + ez * s;
        return Math.hypot(q.x - px, q.z - pz) < 6;
      });
      if (onCross || Math.hypot(dg, dgz) < 12) continue;
      const g = gy(q.x, q.z);
      const r = 2.6 + rng() * 1.4;
      props.add('stone', cyl(r + 0.4, r + 0.4, 0.3, 10, q.x, g + 0.2, q.z), 0xb9b09a, 0.95);
      props.add('dark', cyl(r, r, 0.4, 10, q.x, g + 0.3, q.z), 0x4b3627, 1);
      props.add('foliage', cyl(r * 0.55, r * 0.9, 0.9, 8, q.x, g + 0.85, q.z),
        [0x7a3a5a, 0xa8474a, 0xc9a23a, 0x4e7a3a][Math.floor(rng() * 4)], 0.9 + rng() * 0.2);
      counts.beds++;
      k++;
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n2 = Math.max(1, Math.round(len / 17));
      for (let k = 0; k < n2; k++) {
        const t = (k + 0.5) / n2;
        let x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        // Step inward off the railing line.
        const g2 = toGrid(x, z);
        const inU = g2.u > (u0 + u1) / 2 ? -7 : 7;
        const inV = g2.v > (v0 + v1) / 2 ? -7 : 7;
        const q = toWorld(g2.u + inU * 0.6, g2.v + inV * 0.6);
        x = q.x; z = q.z;
        if (!clear(x, z) || !inside(x, z)) continue;
        const gg = gy(x, z);
        const h = 10 + rng() * 5;
        props.add('dark', cyl(0.3, 0.45, h * 0.4, 5, x, gg + h * 0.2, z), 0x4a3c2e, 1);
        props.add('foliage', cyl(h * 0.12, h * 0.36, h * 0.66, 7, x, gg + h * 0.62, z),
          rng() < 0.4 ? 0x3f6630 : 0x4a7238, 0.84 + rng() * 0.28);
        counts.walks++;
      }
    }
  }

  // ── Ornament. A square with nothing to look at is a lawn with a fence round
  // it, and a statue on a plinth is the cheapest possible full stop.
  const ornaments = spec.ornament === 'none' ? 0
    : spec.ornament === 'pavilions' ? 4 : 8;
  for (let k = 0; k < ornaments; k++) {
    let placed = false;
    for (let tries = 0; tries < 20 && !placed; tries++) {
      const u = u0 + 14 + rng() * (u1 - u0 - 28);
      const v = v0 + 14 + rng() * (v1 - v0 - 28);
      const q = toWorld(u, v);
      if (!clear(q.x, q.z)) continue;
      const x = q.x, z = q.z, g = gy(x, z);
      if (spec.ornament === 'pavilions') {
        for (let c = 0; c < 8; c++) {
          const ca = (c / 8) * Math.PI * 2;
          props.add('stone', cyl(0.22, 0.26, 3.6, 6,
            x + Math.sin(ca) * 2.2, g + 1.8, z + Math.cos(ca) * 2.2), 0xd9cfb4, 1);
        }
        props.add('stone', box(6.0, 0.4, 6.0, x, g + 3.8, z, yaw), 0xd2c8ad, 1);
        props.add('stone', cyl(0.3, 2.6, 2.2, 12, x, g + 5.1, z), 0xdcd3b8, 1);
        props.add('paint', cyl(0.05, 0.16, 1.1, 6, x, g + 6.7, z), 0xc09a3e, 1);
      } else {
        props.add('stone', box(2.8, 0.55, 2.8, x, g + 0.28, z, yaw), 0xb8b09a, 1);
        props.add('stone', box(2.0, 3.2, 2.0, x, g + 2.15, z, yaw), 0xa9a18c,
          0.92 + rng() * 0.12);
        props.add('stone', cyl(0.42, 0.58, 2.6, 8, x, g + 5.05, z), 0x9aa0a4, 1);
        props.add('stone', box(1.5, 0.4, 0.9, x, g + 5.9, z, yaw + 0.3), 0x9aa0a4, 1);
      }
      counts.statues++;
      placed = true;
    }
  }
  return counts;
}

// ──────────────────────────────────────────────────────────────── outskirts ──

/**
 * The country beyond the town.
 *
 * Past the last street the map used to be a wash of coloured ground running to
 * the fog, which reads as the edge of the world rather than as distance. What
 * is actually out there is fields, and somewhere to land an aeroplane, and a
 * reservoir, and woods — and all four are legible from a long way off precisely
 * because they are big, flat and regular, which is the opposite of what the
 * town is. That contrast is what makes the town look like a town.
 *
 * Everything is placed by what the ground will take: an airfield wants a broad
 * flat dry run, farms want gentle slopes, woods take what is left.
 */
export function buildOutskirts(props, terrain, rng, opts) {
  const inner = opts.inner;                 // the town's own reach
  const outer = terrain.span * 2.4;
  // What is out there, which is not the same everywhere.
  //
  // Fields, an airfield and a reservoir are the right middle distance for a
  // European river city and the wrong one for everywhere else: the Yucatan is
  // forest to the horizon, the Corcovado is forest on a mountainside, and
  // Bennelong Point is mostly water. `hinterland` picks which.
  const kind = opts.hinterland || 'fields';
  const farmed = kind === 'fields';
  // A harbour city has no crops round it and it is not bare either: what is
  // out past the last street in Sydney is ovals, golf, bush and more suburb.
  // The field machinery lays exactly that shape — big flat patches with hard
  // edges — so it runs, in green, without the barns and the hedgerows.
  const patched = farmed || kind === 'harbour';
  const counts = { fields: 0, hedges: 0, barns: 0, runway: 0, hangars: 0,
    woods: 0, reservoir: 0, masts: 0, canopy: 0 };
  // The surface out here, not the DEM clamped outward: past the map those two
  // are the same number only on a map with no relief at its edge. See
  // `Terrain.surfaceAt`.
  const gy = (x, z) => terrain.surfaceAt(x, z);

  /** Is this patch dry, off the playfield, and level enough to build on? */
  //
  // Sampled across the whole disc, not round its rim. Eight points on a
  // three-hundred-metre circle are two hundred metres apart, and a river a
  // hundred and fifty metres wide went straight between two of them: the
  // airfield at Paris was laid with its runway across the Seine.
  const usable = (x, z, r, tol) => {
    if (Math.hypot(x, z) < inner) return false;
    if (terrain.isWater(x, z)) return false;
    let lo = gy(x, z), hi = lo;
    for (const f of [1 / 3, 2 / 3, 1]) {
      for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2;
        const px = x + Math.cos(th) * r * f, pz = z + Math.sin(th) * r * f;
        if (terrain.isWater(px, pz)) return false;
        const h = gy(px, pz);
        if (h < terrain.waterLevel + 1.2) return false;
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
    }
    return hi - lo <= tol;
  };

  // ── An airfield. One runway, a taxiway, an apron with hangars and a tower,
  // and a few aircraft parked on it. Nothing says "this is the edge of town"
  // like two kilometres of concrete laid in a straight line.
  let field = null;
  for (let k = 0; k < (farmed ? 220 : 0) && !field; k++) {
    const a0 = rng() * Math.PI * 2;
    const rr = inner * 1.25 + rng() * (outer - inner * 1.25);
    const x = Math.sin(a0) * rr, z = Math.cos(a0) * rr;
    if (Math.abs(x) > outer || Math.abs(z) > outer) continue;
    if (usable(x, z, 300, 9)) field = { x, z, yaw: rng() * Math.PI };
  }
  if (field) {
    const { x: fx, z: fz, yaw } = field;
    const ux = Math.sin(yaw), uz = Math.cos(yaw);
    const vx = -uz, vz = ux;
    const at = (u, v) => ({ x: fx + ux * u + vx * v, z: fz + uz * u + vz * v });
    const RUN = 520, W = 44;
    // The strip itself, in slabs so it follows the ground.
    for (let u = -RUN / 2; u < RUN / 2; u += 26) {
      const p = at(u + 13, 0);
      props.add('markings', box(W, 0.4, 26.4, p.x, gy(p.x, p.z) + 0.2, p.z, yaw),
        0x3f4247, 0.92 + rng() * 0.12);
      counts.runway++;
    }
    // Centreline and threshold bars.
    for (let u = -RUN / 2 + 20; u < RUN / 2 - 20; u += 36) {
      const p = at(u, 0);
      props.add('markings', box(1.2, 0.1, 22, p.x, gy(p.x, p.z) + 0.45, p.z, yaw),
        0xd8d4c6, 1);
    }
    for (const end of [-1, 1]) {
      for (let s = -4; s <= 4; s++) {
        if (!s) continue;
        const p = at(end * (RUN / 2 - 16), s * 4.2);
        props.add('markings', box(2.0, 0.1, 22, p.x, gy(p.x, p.z) + 0.45, p.z, yaw),
          0xe2ded0, 1);
      }
    }
    // Taxiway and apron along one side.
    for (let u = -RUN / 2; u < RUN / 2; u += 26) {
      const p = at(u + 13, W / 2 + 40);
      props.add('markings', box(18, 0.4, 26.4, p.x, gy(p.x, p.z) + 0.2, p.z, yaw),
        0x44484d, 0.94);
    }
    // Hangars: big pale sheds with curved roofs.
    for (let k = 0; k < 4; k++) {
      const p = at(-110 + k * 62, W / 2 + 86);
      const g = gy(p.x, p.z);
      props.add('stone', box(46, 12, 34, p.x, g + 6, p.z, yaw), 0xa9aeb2,
        0.9 + rng() * 0.14);
      const roof = new THREE.CylinderGeometry(18, 18, 46, 10, 1, false, 0, Math.PI);
      roof.rotateZ(Math.PI / 2); roof.rotateY(yaw);
      roof.translate(p.x, g + 12, p.z);
      props.add('metal', roof, 0x8e949a, 0.92);
      counts.hangars++;
    }
    // A control tower, and the windsock beside it.
    {
      const p = at(-190, W / 2 + 92);
      const g = gy(p.x, p.z);
      props.add('stone', box(11, 17, 11, p.x, g + 8.5, p.z, yaw), 0xbdc1c4, 0.95);
      props.add('glass', box(14, 4.2, 14, p.x, g + 19, p.z, yaw), 0x2e4552, 1);
      props.add('metal', box(15.5, 0.6, 15.5, p.x, g + 21.4, p.z, yaw), 0x7e858b, 1);
      props.add('metal', cyl(0.12, 0.16, 7, 5, p.x + 10, g + 3.5, p.z), 0x9aa0a6, 1);
      props.add('paint', box(0.6, 1.2, 3.4, p.x + 10, g + 6.6, p.z, yaw), 0xd4642e, 1);
      counts.masts++;
    }
    // Aircraft on the apron: a fuselage, a wing and a fin is enough at this
    // distance, and the silhouette is unmistakable.
    for (let k = 0; k < 5; k++) {
      const p = at(-130 + k * 56, W / 2 + 58);
      const g = gy(p.x, p.z) + 1.9;
      const a = yaw + (rng() - 0.5) * 0.3;
      const fuse = new THREE.CylinderGeometry(1.5, 1.2, 26, 8);
      fuse.rotateX(Math.PI / 2); fuse.rotateY(a);
      fuse.translate(p.x, g, p.z);
      props.add('paint', fuse, 0xe6e8ea, 1);
      props.add('paint', box(30, 0.5, 4.6, p.x, g - 0.4, p.z, a + Math.PI / 2),
        0xdfe2e4, 0.96);
      props.add('paint', box(0.5, 6.0, 5.0, p.x - Math.sin(a) * 11,
        g + 3.2, p.z - Math.cos(a) * 11, a), 0xc3502f, 1);
      props.add('paint', box(11, 0.4, 2.6, p.x - Math.sin(a) * 11,
        g + 0.4, p.z - Math.cos(a) * 11, a + Math.PI / 2), 0xdfe2e4, 1);
    }
  }

  // ── Farmland. Fields are the one thing a long way off that reads instantly,
  // because they are flat colour with hard straight edges and a hedge round
  // each one. Laid on their own rotated grid so they do not line up with the
  // town's.
  const FARM_YAW = 0.41;
  const fca = Math.cos(FARM_YAW), fsa = Math.sin(FARM_YAW);
  const CROPS = [0x7d8a45, 0x9aa055, 0x6f7f3e, 0xb0a469, 0x5f7238, 0xa89a5e];
  const CROPS_GREEN = [0x4f6b3a, 0x5d7742, 0x46613a, 0x6c8149, 0x3f5c34, 0x738b52];
  for (let u = patched ? -outer : outer + 1; u <= outer; u += 104) {
    for (let v = -outer; v <= outer; v += 104) {
      const jx = u + (rng() - 0.5) * 30, jz = v + (rng() - 0.5) * 30;
      const x = jx * fca - jz * fsa, z = jx * fsa + jz * fca;
      const w = 74 + rng() * 54, d = 70 + rng() * 50;
      if (!usable(x, z, Math.max(w, d) * 0.55, 26)) continue;
      const g = gy(x, z);
      const pal = farmed ? CROPS : CROPS_GREEN;
      const crop = pal[Math.floor(rng() * pal.length)];
      props.add('foliage', box(w, 0.3, d, x, g + 0.18, z, FARM_YAW), crop,
        0.86 + rng() * 0.28);
      counts.fields++;
      // A hedge round two sides, which is what gives the patchwork its lines.
      for (const [ow, od, hw, hd] of [[0, d / 2, w, 2.2], [w / 2, 0, 2.2, d]]) {
        const hx = x + (ow * fca + od * fsa), hz = z + (-ow * fsa + od * fca);
        props.add('foliage', box(hw, 2.4, hd, hx, gy(hx, hz) + 1.2, hz, FARM_YAW),
          0x3d5a2c, 0.88 + rng() * 0.2);
        counts.hedges++;
      }
      // A farmstead every so often: a house, a barn and a yard. Not where
      // there is no farming — those patches are playing fields and bush.
      if (farmed && rng() < 0.16) {
        const g2 = gy(x, z);
        props.add('stone', box(14, 7, 10, x, g2 + 3.5, z, FARM_YAW), 0xbdae94, 0.95);
        props.add('dark', box(15, 1.2, 11, x, g2 + 7.6, z, FARM_YAW), 0x6b4b3a, 1);
        props.add('metal', box(22, 8, 13, x + 20 * fca, g2 + 4, z - 20 * fsa,
          FARM_YAW), 0x8a8f86, 0.92);
        counts.barns++;
      }
    }
  }

  // ── Forest.
  //
  // Not a wood, which is a shape with fields round it — a canopy, laid on a
  // jittered grid over everything out here that is dry and is not already
  // something else. Trees grow on slopes, so this does not use `usable`: the
  // flanks of the Corcovado are forty-five degrees of rainforest and refusing
  // them leaves the most-photographed mountain in Brazil bald.
  if (kind === 'jungle' || kind === 'forest') {
    const tall = kind === 'jungle';
    // Wide pitch and big trees: see the note on the in-field canopy. The
    // outskirts disc is nearly four kilometres across and a tight grid over it
    // is tens of thousands of meshes.
    const step = 88 / Math.max(0.5, opts.canopyFar || 1);
    const lim = outer * 0.92;
    for (let gx = -lim; gx <= lim; gx += step) {
      for (let gz = -lim; gz <= lim; gz += step) {
        const x = gx + (rng() - 0.5) * step * 0.85;
        const z = gz + (rng() - 0.5) * step * 0.85;
        const r = Math.hypot(x, z);
        if (r < inner || r > lim) continue;
        if (terrain.isWater(x, z)) continue;
        const g = gy(x, z);
        if (g < terrain.waterLevel + 1.0) continue;
        // Clearings, so it reads as forest and not as a lawn with a texture.
        if (rng() < 0.16) continue;
        const h = (tall ? 24 : 20) + rng() * (tall ? 18 : 14);
        const w = h * (0.32 + rng() * 0.14);
        props.add('dark', cyl(0.9, 1.5, h * 0.46, 4, x, g + h * 0.22, z),
          0x46352a, 1);
        props.add('foliage', cyl(w, w * 0.55, h * 0.62, 6, x, g + h * 0.68, z),
          rng() < 0.45 ? 0x2c4a22 : 0x37582a, 0.76 + rng() * 0.38);
        counts.canopy++;
      }
    }
  }

  // ── Woods, and a reservoir with a dam wall. Both are single large shapes,
  // which is exactly what the middle distance needs between the fields.
  for (let k = 0; k < (farmed ? 26 : 0); k++) {
    const a0 = rng() * Math.PI * 2;
    const rr = inner * 1.15 + rng() * (outer - inner * 1.15);
    const cx = Math.sin(a0) * rr, cz = Math.cos(a0) * rr;
    if (!usable(cx, cz, 60, 40)) continue;
    const n = 18 + Math.floor(rng() * 26);
    for (let t = 0; t < n; t++) {
      const ta = rng() * Math.PI * 2, tr = rng() * 58;
      const x = cx + Math.sin(ta) * tr, z = cz + Math.cos(ta) * tr;
      if (terrain.isWater(x, z)) continue;
      const g = gy(x, z);
      const h = 9 + rng() * 8;
      props.add('dark', cyl(0.4, 0.6, h * 0.35, 4, x, g + h * 0.17, z), 0x4a3a2c, 1);
      props.add('foliage', cyl(0.2, h * 0.42, h * 0.8, 6, x, g + h * 0.55, z),
        rng() < 0.4 ? 0x3c5f2c : 0x476b33, 0.82 + rng() * 0.3);
    }
    counts.woods++;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────── block content ──

/**
 * What an open block is *for*.
 *
 * "Open" used to mean a garden square or a car park, and a city of nothing but
 * those two reads as a diagram with the interesting parts left out. A real
 * block is a market, or a pitch with goalposts on it, or a graveyard, or a
 * school with a playground, or allotments, or a builder's yard with a crane
 * over it — and each of those is instantly legible from the air because of its
 * *pattern*: stalls in rows, a white rectangle on grass, small stones in ranks,
 * a court with a net across it.
 *
 * Laid in the block's own frame, so everything in it agrees with the streets
 * that bound it.
 */
export const BLOCK_PROGRAMMES = [
  'market', 'pitch', 'cemetery', 'allotments', 'school',
  'yard', 'courts', 'pond', 'bandstand',
];

export function fillOpenBlock(props, terrain, rng, kind, frame) {
  const { cx, cz, w, d, yaw } = frame;
  const cu = Math.cos(yaw), su = Math.sin(yaw);
  const put = (u, v) => ({ x: cx + u * cu + v * su, z: cz - u * su + v * cu });
  const gy = (x, z) => terrain.surfaceAt(x, z);
  const n = {};
  const bump = (k) => { n[k] = (n[k] || 0) + 1; };

  switch (kind) {
    case 'market': {
      // Stalls in rows under striped awnings, with a lorry at one end.
      const rows = Math.max(1, Math.floor(d / 9));
      const per = Math.max(2, Math.floor(w / 5));
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < per; i++) {
          const p = put(-w / 2 + 3 + i * 5, -d / 2 + 5 + r * 9);
          const g = gy(p.x, p.z);
          props.add('dark', box(3.4, 0.9, 2.2, p.x, g + 0.55, p.z, yaw), 0x5b4a3a, 1);
          props.add('paint', box(4.0, 0.2, 2.8, p.x, g + 2.4, p.z, yaw),
            [0xc9503f, 0xd8d2c2, 0x3c6f8d, 0x6c9450][Math.floor(rng() * 4)],
            0.9 + rng() * 0.2);
          for (const s of [-1, 1]) {
            const q = put(-w / 2 + 3 + i * 5 + s * 1.7, -d / 2 + 5 + r * 9);
            props.add('metal', cyl(0.05, 0.05, 2.3, 4, q.x, gy(q.x, q.z) + 1.25, q.z),
              0x9aa0a6, 1);
          }
          bump('stalls');
        }
      }
      break;
    }
    case 'pitch': {
      // A marked-out pitch, goalposts, and a line of spectators' railings.
      const pw = Math.min(w - 8, 64), pd = Math.min(d - 8, 42);
      props.add('markings', box(pw, 0.1, 0.4, cx, gy(cx, cz) + 0.24, cz, yaw), 0xe4e0d2, 1);
      for (const s of [-1, 1]) {
        let p = put(0, s * pd / 2);
        props.add('markings', box(pw, 0.1, 0.4, p.x, gy(p.x, p.z) + 0.24, p.z, yaw),
          0xe4e0d2, 1);
        p = put(s * pw / 2, 0);
        props.add('markings', box(0.4, 0.1, pd, p.x, gy(p.x, p.z) + 0.24, p.z, yaw),
          0xe4e0d2, 1);
        // Goal: two posts and a bar.
        const gp = put(s * (pw / 2 - 1), 0);
        for (const t of [-3.7, 3.7]) {
          const q = put(s * (pw / 2 - 1), t);
          props.add('paint', cyl(0.14, 0.14, 2.5, 5, q.x, gy(q.x, q.z) + 1.25, q.z),
            0xf0efe8, 1);
        }
        props.add('paint', box(0.2, 0.2, 7.8, gp.x, gy(gp.x, gp.z) + 2.5, gp.z, yaw),
          0xf0efe8, 1);
        bump('goals');
      }
      break;
    }
    case 'cemetery': {
      // Ranks of small stones, a few larger tombs, and a chapel.
      const cols = Math.max(2, Math.floor((w - 10) / 3.2));
      const rows = Math.max(2, Math.floor((d - 14) / 4.2));
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < cols; i++) {
          if (rng() < 0.12) continue;
          const p = put(-w / 2 + 6 + i * 3.2, -d / 2 + 9 + r * 4.2);
          const g = gy(p.x, p.z);
          const h = 0.7 + rng() * 0.7;
          props.add('stone', box(0.7, h, 0.22, p.x, g + h / 2, p.z, yaw + (rng() - 0.5) * 0.1),
            0xa9a598, 0.84 + rng() * 0.3);
          bump('graves');
        }
      }
      {
        const p = put(0, d / 2 - 8);
        const g = gy(p.x, p.z);
        props.add('stone', box(9, 6, 13, p.x, g + 3, p.z, yaw), 0xb2ab98, 0.95);
        props.add('dark', box(10, 1.0, 14, p.x, g + 6.5, p.z, yaw), 0x4c5560, 1);
        props.add('stone', cyl(0.3, 1.8, 7, 6, p.x, g + 9.5, p.z), 0xb6af9c, 1);
        bump('chapel');
      }
      break;
    }
    case 'allotments': {
      // Strips of dug earth with sheds, water butts and bean poles.
      const strips = Math.max(2, Math.floor(w / 7));
      for (let i = 0; i < strips; i++) {
        const p = put(-w / 2 + 4 + i * 7, 0);
        const g = gy(p.x, p.z);
        props.add('foliage', box(5.6, 0.22, d - 6, p.x, g + 0.15, p.z, yaw),
          [0x6b5a3e, 0x55702f, 0x7c6a49][Math.floor(rng() * 3)], 0.86 + rng() * 0.26);
        const s = put(-w / 2 + 4 + i * 7, -d / 2 + 4);
        props.add('dark', box(2.2, 2.2, 2.6, s.x, gy(s.x, s.z) + 1.1, s.z, yaw),
          0x6a5540, 0.88 + rng() * 0.22);
        props.add('metal', cyl(0.7, 0.7, 1.4, 6, s.x + 2, gy(s.x, s.z) + 0.7, s.z),
          0x4c5a44, 1);
        for (let k = 0; k < 5; k++) {
          const q = put(-w / 2 + 4 + i * 7 + (rng() - 0.5) * 4, (rng() - 0.4) * (d - 12));
          props.add('dark', cyl(0.05, 0.05, 2.2, 4, q.x, gy(q.x, q.z) + 1.1, q.z),
            0x7a6a4c, 1);
        }
        bump('plots');
      }
      break;
    }
    case 'school': {
      // A hall, a playground with painted markings, and a bike shelter.
      const p = put(0, -d / 4);
      const g = gy(p.x, p.z);
      props.add('stone', box(Math.min(w - 12, 44), 9, Math.min(d / 2 - 6, 20),
        p.x, g + 4.5, p.z, yaw), 0xc0b49a, 0.95);
      props.add('dark', box(Math.min(w - 11, 45), 1.1, Math.min(d / 2 - 5, 21),
        p.x, g + 9.6, p.z, yaw), 0x585f64, 1);
      const y = put(0, d / 4);
      props.add('markings', box(Math.min(w - 14, 40), 0.18, Math.min(d / 2 - 8, 22),
        y.x, gy(y.x, y.z) + 0.16, y.z, yaw), 0x53585e, 0.95);
      for (let k = 0; k < 3; k++) {
        const q = put(-12 + k * 12, d / 4);
        props.add('markings', cyl(4.2, 4.2, 0.08, 16, q.x, gy(q.x, q.z) + 0.3, q.z),
          [0xd7c14a, 0xc8503f, 0x4f87b0][k], 1);
      }
      bump('schools');
      break;
    }
    case 'yard': {
      // A builder's yard: containers, a spoil heap, and a tower crane over it.
      for (let k = 0; k < 7; k++) {
        const p = put((rng() - 0.5) * (w - 10), (rng() - 0.5) * (d - 10));
        const g = gy(p.x, p.z);
        props.add('paint', box(2.6, 2.7, 6.2, p.x, g + 1.35, p.z, yaw + (rng() < 0.4 ? 1.57 : 0)),
          [0xa8563c, 0x3c6f8d, 0x6c8450, 0xb0a48a][Math.floor(rng() * 4)],
          0.85 + rng() * 0.3);
        bump('containers');
      }
      const c = put(w / 4, -d / 4);
      const g = gy(c.x, c.z);
      props.add('paint', box(5, 0.8, 5, c.x, g + 0.4, c.z, yaw), 0xb0aca0, 1);
      props.add('metal', box(1.5, 34, 1.5, c.x, g + 17, c.z, yaw), 0xd8b23a, 1);
      props.add('metal', box(40, 1.1, 1.1, c.x, g + 34, c.z, yaw + 0.5), 0xd8b23a, 1);
      props.add('metal', box(1.0, 5.0, 1.0, c.x + Math.sin(yaw + 0.5) * 13,
        g + 30, c.z + Math.cos(yaw + 0.5) * 13, yaw), 0x8d9096, 1);
      bump('cranes');
      break;
    }
    case 'courts': {
      // Tennis courts: painted rectangles with nets across them.
      const cw = 11, cd = 24;
      const cols = Math.max(1, Math.floor((w - 6) / (cw + 3)));
      const rows = Math.max(1, Math.floor((d - 6) / (cd + 3)));
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < cols; i++) {
          const p = put(-w / 2 + 4 + i * (cw + 3) + cw / 2,
            -d / 2 + 4 + r * (cd + 3) + cd / 2);
          const g = gy(p.x, p.z);
          props.add('markings', box(cw, 0.18, cd, p.x, g + 0.16, p.z, yaw),
            rng() < 0.5 ? 0x3d6b52 : 0x8a5a44, 0.9 + rng() * 0.2);
          props.add('markings', box(cw - 1, 0.1, 0.25, p.x, g + 0.3, p.z, yaw), 0xe8e4d8, 1);
          props.add('dark', box(cw + 1, 1.0, 0.16, p.x, g + 0.7, p.z, yaw), 0x2e3438, 1);
          bump('courts');
        }
      }
      break;
    }
    case 'pond': {
      // Water with a reedy rim and a couple of benches looking at it.
      const rr = Math.min(w, d) * 0.32;
      props.add('glass', cyl(rr, rr, 0.3, 18, cx, gy(cx, cz) + 0.18, cz), 0x35566a, 1);
      for (let k = 0; k < 26; k++) {
        const a0 = rng() * Math.PI * 2, t = rr * (0.94 + rng() * 0.16);
        const x = cx + Math.sin(a0) * t, z = cz + Math.cos(a0) * t;
        props.add('foliage', box(0.9, 1.6, 0.9, x, gy(x, z) + 0.8, z, rng() * 3),
          0x5d7038, 0.8 + rng() * 0.35);
      }
      bump('ponds');
      break;
    }
    default: {
      // A bandstand on a lawn, with a path ring round it.
      const g = gy(cx, cz);
      props.add('stone', cyl(5.2, 5.6, 0.7, 12, cx, g + 0.35, cz), 0xb9b09a, 1);
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2;
        props.add('metal', cyl(0.14, 0.16, 3.2, 6, cx + Math.sin(a0) * 4.3,
          g + 2.3, cz + Math.cos(a0) * 4.3), 0x2f4a3c, 1);
      }
      props.add('metal', cyl(0.4, 5.6, 2.0, 12, cx, g + 4.9, cz), 0x37554a, 1);
      props.add('paint', cyl(0.06, 0.16, 1.0, 5, cx, g + 6.3, cz), 0xc09a3e, 1);
      bump('bandstands');
    }
  }
  return n;
}

// ───────────────────────────────────────────────────────────────── horizon ──

/**
 * The far skyline.
 *
 * A map that ends in a smooth gradient reads as a diorama on a table, however
 * good the middle distance is — the eye looks for something standing up against
 * the sky at the limit of vision and finds nothing. A ring of towers well
 * outside the playfield fixes that for almost nothing: they are boxes, they are
 * never approached, and they are the difference between "a city" and "a model
 * of a city".
 */
export function buildHorizon(props, terrain, rng) {
  const span = terrain.span;
  let towers = 0;
  // Keep going until there is a skyline, rather than taking a fixed number of
  // guesses at where one might go. On a river city nearly every guess lands on
  // dry ground and the two are the same thing; on a harbour most of the ring
  // is open sea, and a hundred and ninety tries came back with thirty-one
  // towers — which from Bennelong Point is a horizon with gaps in it.
  for (let k = 0; k < 1200 && towers < 150; k++) {
    const a = rng() * Math.PI * 2;
    const r = span * (1.9 + rng() * 1.5);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (terrain.isWater(x, z)) continue;
    const g = terrain.surfaceAt(x, z);
    if (!isFinite(g)) continue;
    // Clustered: a few districts of tall ones rather than an even sprinkle,
    // which is what a real skyline looks like from twenty kilometres.
    const cluster = valueNoise(x * 0.0009 + 4.2, z * 0.0009 - 1.7);
    const h = (18 + rng() * 34) * (0.5 + cluster * 2.2);
    const w = 16 + rng() * 26, d = 16 + rng() * 26;
    props.add('dark', box(w, h, d, x, g + h / 2, z, rng() * 3.1),
      0x6e7788, 0.82 + rng() * 0.3);
    if (h > 70 && rng() < 0.5) {
      props.add('glow', box(1.4, 1.4, 1.4, x, g + h + 1.6, z), 0xff5a4a, 1);
    }
    towers++;
  }
  return { towers };
}

/**
 * A railway across the map: an embankment, a viaduct over the low ground, a
 * station, and a train standing at it.
 *
 * Railways read from the air better than almost anything else a city contains,
 * because nothing else in a town is a dead-straight line half a mile long with
 * a regular rhythm along it.
 */
export function buildRailway(props, terrain, rng, opts) {
  const span = terrain.span;
  const counts = { track: 0, arches: 0, station: 0, carriages: 0 };
  const yaw = opts.yaw ?? 0.23;
  const ux = Math.cos(yaw), uz = -Math.sin(yaw);
  const vx = Math.sin(yaw), vz = Math.cos(yaw);
  const line = (off) => (t) => ({ x: ux * t + vx * off, z: uz * t + vz * off });

  // Run it across one side of the map, clear of the middle — and on the side
  // that has ground on it. Picking the offset at random works on a map that is
  // land with a river through it and fails on one that is water with a
  // headland in it: at Sydney the line landed in the harbour and the railway
  // came out as fifteen disconnected sleepers. Try both sides at a few
  // distances and keep whichever crosses the most dry ground.
  let off = span * 0.6;
  let bestDry = -1;
  for (const sg of [1, -1]) {
    for (const f of [0.55, 0.65, 0.75]) {
      const cand = span * f * sg;
      const a = line(cand);
      let dry = 0;
      for (let t = -span * 1.1; t < span * 1.1; t += 12) {
        const p = a(t);
        if (terrain.isWater(p.x, p.z)) continue;
        if (opts.net && opts.net.roadClearance(p.x, p.z) < 8) continue;
        dry++;
      }
      // A tie goes to the first tried, which keeps the four existing maps'
      // railways exactly where they were.
      if (dry > bestDry) { bestDry = dry; off = cand; }
    }
  }
  const at = line(off);

  let deck = -Infinity;
  for (let t = -span; t <= span; t += 40) {
    const p = at(t);
    deck = Math.max(deck, terrain.surfaceAt(p.x, p.z));
  }
  deck += 5.5;
  if (!isFinite(deck)) return counts;

  for (let t = -span * 1.1; t < span * 1.1; t += 12) {
    const p = at(t);
    if (terrain.isWater(p.x, p.z)) continue;
    if (opts.net && opts.net.roadClearance(p.x, p.z) < 8) continue;
    const g = terrain.surfaceAt(p.x, p.z);
    // Ballast and two rails.
    props.add('dark', box(9.4, 1.0, 12.4, p.x, deck - 0.5, p.z, yaw), 0x615a50,
      0.88 + rng() * 0.2);
    for (const s of [-1.6, 1.6]) {
      props.add('metal', box(0.22, 0.24, 12.4, p.x + vx * s * 0 + ux * 0,
        deck + 0.12, p.z, yaw), 0x8e8579, 1);
    }
    // Arches down to the ground where the line is up on a viaduct.
    const drop = deck - 1.0 - g;
    if (drop > 2.2) {
      props.add('stone', box(7.2, drop, 3.4, p.x, g + drop / 2, p.z, yaw),
        0x8d7f6d, 0.86 + rng() * 0.22);
      counts.arches++;
    } else {
      props.add('dark', box(11, Math.max(0.6, drop + 1.0), 12.4,
        p.x, g + (drop + 1.0) / 2, p.z, yaw), 0x6f6656, 0.9);
    }
    counts.track++;
  }

  // A station: a platform each side, a canopy, and a train standing at one.
  // Tried a few places along the line, because one sample can easily land in
  // the river and a railway with no station on it is a missed opportunity.
  let sp = null;
  for (let k = 0; k < 24 && !sp; k++) {
    const q = at((rng() - 0.5) * span * 1.6);
    if (terrain.isWater(q.x, q.z)) continue;
    if (terrain.surfaceAt(q.x, q.z) < terrain.waterLevel + 1.5) continue;
    sp = q;
  }
  if (sp) {
    for (const s of [-1, 1]) {
      const px = sp.x + vx * s * 7.5, pz = sp.z + vz * s * 7.5;
      props.add('stone', box(5.4, 1.2, 96, px, deck + 0.2, pz, yaw), 0xb5ad99, 0.94);
      props.add('metal', box(7.0, 0.35, 76, px, deck + 4.6, pz, yaw), 0x6c737a, 1);
      for (let k = -3; k <= 3; k++) {
        props.add('metal', cyl(0.14, 0.18, 3.8, 6, px + ux * k * 12,
          deck + 2.7, pz + uz * k * 12), 0x5e656c, 1);
      }
    }
    props.add('stone', box(16, 9, 26, sp.x + vx * 20, deck + 3.5, sp.z + vz * 20,
      yaw), 0xb8a98e, 0.95);
    props.add('dark', box(17, 1.1, 27, sp.x + vx * 20, deck + 8.6, sp.z + vz * 20,
      yaw), 0x51565c, 1);
    counts.station++;
    for (let k = 0; k < 4; k++) {
      const cx = sp.x + ux * (-36 + k * 22), cz = sp.z + uz * (-36 + k * 22);
      props.add('paint', box(3.0, 3.4, 20, cx, deck + 2.3, cz, yaw),
        k === 0 ? 0x7a3f36 : 0x3f5568, 0.9 + rng() * 0.16);
      props.add('glass', box(3.1, 1.1, 17, cx, deck + 3.1, cz, yaw), 0x2b3a44, 1);
      counts.carriages++;
    }
  }
  return counts;
}
