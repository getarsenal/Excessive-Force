import * as THREE from 'three';

/**
 * Cars, at the price of two boxes.
 *
 * Every car in the game was a body box with a cabin box on it: parked along
 * the kerb, in the car parks and driving the streets. From the camera's two or
 * three hundred metres what makes a car read as a car is not its wheels, it
 * is the silhouette — a bonnet that falls away in front of a raked
 * windscreen, a roof, a boot — and the band of dark glass round the middle of
 * it. A box has neither. So a car here is a side profile extruded across its
 * width, a glasshouse narrower than the body set on it with the glass dark and
 * the roof in the paint, two axles whose tyres stand proud of the sills, and
 * red at the tail. Each part comes out as its own geometry so it can go into
 * the material bucket it belongs to (paint, glass, rubber), all indexed and
 * with a uv channel, so they merge with the box props already in those buckets.
 *
 * The parked car is about ninety triangles against the boxes' twenty-four,
 * which over a thousand parked cars is sixty-six thousand more: a sixth of one
 * landmark's courses. The traffic, a hundred and fifty instanced, gets the same
 * shape with its tyres.
 *
 * +z is forward, y 0 is the road, x across. Lengths are real ones.
 */

// Side profiles: [z, y] round the lower body, rear to front along the sill,
// back over the top. `glass` is the greenhouse: [rear base z, rear top z,
// front top z, front base z], its base sitting on the body's shoulder.
const SHAPES = {
  // A four-door saloon: long bonnet, a boot.
  sedan: {
    len: 4.5, wid: 1.8, sill: 0.3, wheel: 0.33, axle: [-1.38, 1.35], roof: 1.44,
    body: [[-2.25, 0.3], [2.25, 0.3], [2.3, 0.6], [2.12, 0.82], [0.9, 0.94], [-1.3, 0.97], [-2.2, 0.92], [-2.3, 0.62]],
    glass: [-1.3, -0.82, 0.22, 0.9],
  },
  // A hatchback: short, the roof carried to a steep tail.
  hatch: {
    len: 4.0, wid: 1.75, sill: 0.3, wheel: 0.31, axle: [-1.25, 1.25], roof: 1.46,
    body: [[-2.0, 0.3], [2.0, 0.3], [2.04, 0.6], [1.86, 0.82], [0.85, 0.94], [-1.95, 0.98], [-2.04, 0.62]],
    glass: [-1.92, -1.62, 0.2, 0.85],
  },
  // A tall estate or SUV: high sill, upright everything.
  suv: {
    len: 4.7, wid: 1.9, sill: 0.4, wheel: 0.38, axle: [-1.45, 1.42], roof: 1.74,
    body: [[-2.35, 0.4], [2.35, 0.4], [2.4, 0.72], [2.25, 1.0], [1.15, 1.1], [-2.3, 1.14], [-2.4, 0.74]],
    glass: [-2.25, -2.05, 0.6, 1.15],
  },
  // A panel van: the glass only up front.
  van: {
    len: 5.2, wid: 2.0, sill: 0.38, wheel: 0.36, axle: [-1.7, 1.65], roof: 2.25,
    body: [[-2.6, 0.38], [2.6, 0.38], [2.64, 0.75], [2.45, 1.05], [1.6, 1.2], [1.25, 2.25], [-2.6, 2.25]],
    glass: [1.18, 1.22, 1.5, 1.62],
    glassTall: true,
  },
};

export const CAR_SHAPES = Object.keys(SHAPES);

/** A list of triangles ([x,y,z] x3) to an indexed geometry with flat normals and a dummy uv. */
function fromTris(list) {
  const n = list.length * 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(n);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let k = 0;
  for (const t of list) {
    a.fromArray(t[0]); b.fromArray(t[1]); c.fromArray(t[2]);
    e1.subVectors(b, a); e2.subVectors(c, a);
    const nn = e1.cross(e2).normalize();
    for (const p of t) {
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      nor[k * 3] = nn.x; nor[k * 3 + 1] = nn.y; nor[k * 3 + 2] = nn.z;
      idx[k] = k;
      k++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/**
 * Extrude a convex-enough side profile across the width, both side faces
 * fan-triangulated from the profile's centre, the edges as quads.
 */
function extrude(profile, halfW, out, halfTop = halfW) {
  let cz = 0, cy = 0;
  for (const [z, y] of profile) { cz += z; cy += y; }
  cz /= profile.length; cy /= profile.length;
  const n = profile.length;
  // Each vertex's half width: narrower toward the top, so the glasshouse
  // tumbles home as a real one does.
  const ys = profile.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const hw = (y) => halfW + (halfTop - halfW) * ((y - y0) / Math.max(1e-6, y1 - y0));
  const hc = hw(cy);
  for (let i = 0; i < n; i++) {
    const [za, ya] = profile[i], [zb, yb] = profile[(i + 1) % n];
    const wa = hw(ya), wb = hw(yb);
    // The profiles run clockwise seen from +x (rear to front along the sill,
    // back over the top), so each face is wound to face out from there.
    out.push([[hc, cy, cz], [wb, yb, zb], [wa, ya, za]]);
    out.push([[-hc, cy, cz], [-wa, ya, za], [-wb, yb, zb]]);
    // The band between the two sides.
    out.push([[wa, ya, za], [-wb, yb, zb], [-wa, ya, za]]);
    out.push([[wa, ya, za], [wb, yb, zb], [-wb, yb, zb]]);
  }
}

/** An axle's two tyres: a hexagonal prism across the car, sides only and the outer caps. */
function axle(z, r, halfW, out) {
  const S = 6, pts = [];
  for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2 + Math.PI / 6;
    pts.push([Math.sin(a) * r, r + Math.cos(a) * r]);
  }
  for (const s of [-1, 1]) {
    const xo = s * halfW, xi = s * (halfW - 0.24);
    for (let i = 0; i < S; i++) {
      const [za, ya] = pts[i], [zb, yb] = pts[(i + 1) % S];
      // Tread.
      if (s > 0) {
        out.push([[xo, ya, z + za], [xi, ya, z + za], [xi, yb, z + zb]], [[xo, ya, z + za], [xi, yb, z + zb], [xo, yb, z + zb]]);
        out.push([[xo, r, z], [xo, ya, z + za], [xo, yb, z + zb]]);
      } else {
        out.push([[xo, ya, z + za], [xi, yb, z + zb], [xi, ya, z + za]], [[xo, ya, z + za], [xo, yb, z + zb], [xi, yb, z + zb]]);
        out.push([[xo, r, z], [xo, yb, z + zb], [xo, ya, z + za]]);
      }
    }
  }
}

/**
 * One car's parts in its own frame: `paint` (the body and roof), `glass`,
 * `rubber` (tyres) and `tail` (the lamps). Indexed, flat-shaded, uv'd.
 * `wheels: 'box'` gives each axle one dark block for the parked rows;
 * `false` leaves the tyres off.
 */
export function carParts(shape = 'sedan', { wheels = true } = {}) {
  const S = SHAPES[shape] || SHAPES.sedan;
  const half = S.wid / 2;
  const paint = [], glass = [], rubber = [], tail = [];
  extrude(S.body, half, paint);
  // The glasshouse, on the shoulder: [rear base, rear top, front top, front base].
  const [rb, rt, ft, fb] = S.glass;
  const shoulder = (z) => {
    // The body's top line under z, from the profile's upper edge.
    const top = S.body.filter((p) => p[1] > S.sill + 0.2).sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < top.length - 1; i++) {
      if (z >= top[i][0] && z <= top[i + 1][0]) {
        const t = (z - top[i][0]) / Math.max(1e-6, top[i + 1][0] - top[i][0]);
        return top[i][1] + (top[i + 1][1] - top[i][1]) * t;
      }
    }
    return top[top.length - 1][1];
  };
  if (!S.glassTall) {
    const gh = [[rb, shoulder(rb) - 0.02], [fb, shoulder(fb) - 0.02], [ft, S.roof], [rt, S.roof]];
    extrude(gh, half - 0.06, glass, half - 0.24);
    // The roof panel in the paint, a hair over the glass.
    const ry = S.roof + 0.015, w = half - 0.26;
    paint.push([[w, ry, rt + 0.06], [-w, ry, rt + 0.06], [-w, ry, ft - 0.06]], [[w, ry, rt + 0.06], [-w, ry, ft - 0.06], [w, ry, ft - 0.06]]);
  } else {
    // A van's windscreen and cab side windows are let into the body.
    const zA = S.body[4][0], yA = S.body[4][1], zB = S.body[5][0], yB = S.body[5][1];
    const w = half + 0.01, f = 0.12;
    const lerp = (t) => [zA + (zB - zA) * t, yA + (yB - yA) * t];
    const [z0, y0] = lerp(f), [z1, y1] = lerp(1 - f);
    glass.push([[w, y0, z0 + 0.01], [-w, y1, z1 + 0.01], [-w, y0, z0 + 0.01]], [[w, y0, z0 + 0.01], [w, y1, z1 + 0.01], [-w, y1, z1 + 0.01]]);
    for (const s of [1, -1]) {
      const x = s * (half + 0.01), za = 0.35, zb2 = 1.2, ya = 1.25, yb = 1.95;
      const q = [[x, ya, za], [x, ya, zb2], [x, yb, zb2 - 0.2], [x, yb, za]];
      if (s > 0) glass.push([q[0], q[2], q[1]], [q[0], q[3], q[2]]); else glass.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
    }
  }
  // Tail lamps: two quads on the back face.
  const back = Math.min(...S.body.map((p) => p[0])) - 0.012;
  const ly0 = S.sill + 0.42, ly1 = ly0 + 0.16;
  for (const s of [1, -1]) {
    const xa = s * (half - 0.08), xb = s * (half - 0.42);
    const q = [[xa, ly0, back], [xb, ly0, back], [xb, ly1, back], [xa, ly1, back]];
    if (s > 0) tail.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]); else tail.push([q[0], q[2], q[1]], [q[0], q[3], q[2]]);
  }
  if (wheels === 'box') {
    // The parked rows: a dark block per axle standing a little proud of the
    // sills. From a hundred metres it is a pair of tyres, at a sixth of the cost.
    for (const z of S.axle) {
      const r = S.wheel, x = half + 0.03, a = r * 0.82;
      const v = (sx, sy, sz) => [sx * x, r + sy * r, z + sz * a];
      const faces = [
        [v(1, -1, -1), v(1, -1, 1), v(1, 1, 1), v(1, 1, -1)],
        [v(-1, -1, 1), v(-1, -1, -1), v(-1, 1, -1), v(-1, 1, 1)],
        [v(-1, -1, 1), v(-1, 1, 1), v(1, 1, 1), v(1, -1, 1)],
        [v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1), v(-1, -1, -1)],
      ];
      for (const q of faces) rubber.push([q[0], q[2], q[1]], [q[0], q[3], q[2]]);
    }
  } else if (wheels) for (const z of S.axle) axle(z, S.wheel, half + 0.02, rubber);
  return {
    paint: fromTris(paint),
    glass: fromTris(glass),
    rubber: rubber.length ? fromTris(rubber) : null,
    tail: fromTris(tail),
    len: S.len, wid: S.wid,
  };
}

/** Which shapes a level's streets carry, in what proportion. */
export function pickShape(rng) {
  const r = rng();
  return r < 0.42 ? 'sedan' : r < 0.74 ? 'hatch' : r < 0.93 ? 'suv' : 'van';
}

/**
 * One merged, vertex-coloured geometry of a whole car, for instancing: the
 * paint left white so the instance colour is the paint, and the glass,
 * tyres and lamps given colours dark enough that the paint multiplying
 * them barely shows. Three multiplies the vertex colour by the instance
 * colour, so white is the only colour that comes through as the paint.
 */
export function carInstanceGeometry(shape = 'sedan') {
  const p = carParts(shape);
  const colour = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const parts = [colour(p.paint, 0xffffff), colour(p.glass, 0x1a1f25), colour(p.tail, 0x8a1810)];
  if (p.rubber) parts.push(colour(p.rubber, 0x141414));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
