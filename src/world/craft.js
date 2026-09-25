import * as THREE from 'three';

/**
 * The boats, and which of them belong where.
 *
 * There used to be one hull — a box with a smaller box on it — on every stretch
 * of water in the campaign, so the Thames, the Seine, Sydney Harbour and the
 * Dubai Creek all carried the same grey brick. A place is half its water, and
 * the water is what is on it: a spritsail barge says London the way a red bus
 * does, a péniche says Paris, a dhow with a high stern says the Gulf, and a
 * pointed sampan under a woven hood says the Klang. So each kind here is a
 * real working type, built from a lofted hull and a small kit of parts, with
 * its colours baked into the vertices; and `FLEETS` says which of them a level
 * puts on its water.
 *
 * Everything is one geometry per kind and one instanced draw per kind, so a
 * level with three kinds of craft costs three draw calls whether it has ten
 * boats or forty. Nothing here touches the physics world.
 */

// ── The parts kit ──────────────────────────────────────────────────────────

const _c = new THREE.Color();

/** Give a geometry a flat vertex colour, as a non-indexed copy. */
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  _c.setHex(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Concatenate painted, non-indexed geometries into one. */
function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let off = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, off);
    nor.set(p.attributes.normal.array, off);
    col.set(p.attributes.color.array, off);
    off += p.attributes.position.count * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function box(w, h, d, x, y, z, hex, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, hex);
}

function cyl(rTop, rBot, h, x, y, z, hex, seg = 10) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y, z);
  return paint(g, hex);
}

/** Raw triangles with one colour; normals computed flat. */
function tris(list, hex) {
  const pos = [];
  for (const t of list) pos.push(...t[0], ...t[1], ...t[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, hex);
}

function quad(a, b, c, d, hex) { return tris([[a, b, c], [a, c, d]], hex); }

/** A half-round canopy over the deck, axis along z: a sampan's hood. */
function arch(w, d, y0, x, z, hex, rise = 0.62) {
  const M = 8, list = [];
  const P = (k, zz) => {
    const a = Math.PI * k / M;
    return [x + (w / 2) * Math.cos(a), y0 + (w / 2) * rise * Math.sin(a), zz];
  };
  for (let k = 0; k < M; k++) {
    const a = P(k, z - d / 2), b = P(k + 1, z - d / 2), c = P(k + 1, z + d / 2), e = P(k, z + d / 2);
    list.push([a, c, b], [a, e, c]);
  }
  return tris(list, hex);
}

/** A gabled roof, ridge along z: the cabin of a yakatabune. */
function gable(w, d, y0, rise, x, z, hex, overhang = 0.35) {
  const L = [x - w / 2 - overhang, y0, 0], R = [x + w / 2 + overhang, y0, 0], T = [x, y0 + rise, 0];
  const at = (p, zz) => [p[0], p[1], zz];
  const z0 = z - d / 2 - overhang, z1 = z + d / 2 + overhang;
  return tris([
    [at(L, z0), at(T, z1), at(T, z0)], [at(L, z0), at(L, z1), at(T, z1)],
    [at(R, z0), at(T, z0), at(T, z1)], [at(R, z0), at(T, z1), at(R, z1)],
    [at(L, z0), at(T, z0), at(R, z0)], [at(L, z1), at(R, z1), at(T, z1)],
  ], hex);
}

function mast(x, z, yBase, h, hex = 0x6d5236, rake = 0) {
  const g = new THREE.BoxGeometry(0.26, h, 0.26);
  if (rake) g.rotateX(rake);
  g.translate(x, yBase + h / 2, z);
  return paint(g, hex);
}

// ── The hull ───────────────────────────────────────────────────────────────

/**
 * Loft a hull from a run of sections.
 *
 * `bow` is how the beam closes at the front: a number is an exponent, small
 * for a fine entry and large for full shoulders, and 'blunt' is a barge's
 * swim-head that never closes at all. `stern` runs 0..1 from a square transom
 * to a bow at both ends. `sheer` lifts the gunwale toward the bow; `sternRise`
 * lifts it aft, which is a dhow. `rocker` lifts the keel at the ends so the
 * thing sits in the water rather than on it.
 */
export function loft({ len, beam, depth, bow = 2.0, stern = 1.0, sheer = 0.3, sternRise = 0.0,
  bowLen = 0.36, sternLen = 0.3, rocker = 0.45, hull, deck }) {
  const N = 14, st = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const bt = Math.max(0, (t - (1 - bowLen)) / bowLen);
    const fb = bow === 'blunt' ? 1 - 0.3 * bt * bt : 1 - Math.pow(bt, bow);
    const s_ = Math.max(0, (sternLen - t) / sternLen);
    const fs = 1 - stern * Math.pow(s_, 2.2);
    const hb = Math.max(0.06, (beam / 2) * fb * fs);
    const yk = depth * rocker * Math.pow(Math.abs(2 * t - 1), 3);
    const yg = depth + sheer * t * t + sternRise * (1 - t) * (1 - t);
    st.push({ z: -len / 2 + t * len, hb, yk, yg });
  }
  const sec = (s) => {
    const m = (f) => s.yk + (s.yg - s.yk) * f;
    return [[-s.hb, s.yg], [-s.hb * 0.92, m(0.45)], [-s.hb * 0.55, m(0.08)], [0, s.yk],
      [s.hb * 0.55, m(0.08)], [s.hb * 0.92, m(0.45)], [s.hb, s.yg]];
  };
  const H = [], D = [];
  for (let i = 0; i < N; i++) {
    const A = sec(st[i]), B = sec(st[i + 1]);
    const za = st[i].z, zb = st[i + 1].z;
    for (let j = 0; j < 6; j++) {
      const a0 = [A[j][0], A[j][1], za], a1 = [A[j + 1][0], A[j + 1][1], za];
      const b0 = [B[j][0], B[j][1], zb], b1 = [B[j + 1][0], B[j + 1][1], zb];
      if (j < 3) H.push([a0, b1, b0], [a0, a1, b1]); else H.push([a0, b0, b1], [a0, b1, a1]);
    }
    const dy = 0.03;
    D.push([[A[0][0], A[0][1] - dy, za], [B[6][0], B[6][1] - dy, zb], [A[6][0], A[6][1] - dy, za]],
      [[A[0][0], A[0][1] - dy, za], [B[0][0], B[0][1] - dy, zb], [B[6][0], B[6][1] - dy, zb]]);
  }
  if (stern < 0.98) {
    const S = sec(st[0]), z = st[0].z, cy = (S[0][1] + S[3][1]) / 2;
    for (let j = 0; j < 6; j++) H.push([[0, cy, z], [S[j + 1][0], S[j + 1][1], z], [S[j][0], S[j][1], z]]);
  }
  return merge([tris(H, hull), tris(D, deck)]);
}

// ── The kinds ──────────────────────────────────────────────────────────────

const WHITE = 0xe9e6dc, CREAM = 0xf0e6cf, TEAK = 0x7a5a3a, DARK = 0x2a2c2f, GLASS = 0x8fa6b4;

/**
 * Each entry builds one geometry, +z forward, waterline at y 0, and says how
 * fast the thing goes in metres a second and how much its size may wander.
 * Nothing on any river does more than about fourteen knots; nothing that is
 * rowed or sailed does less than a walking pace.
 */
const KINDS = {
  // ── London. The Thames is a working river: spritsail barges, lighters
  // under a tarpaulin, and the tugs that move them.
  'thames-sail': () => ({
    speed: [1.6, 2.8], scale: [0.9, 1.1],
    geo: merge([
      loft({ len: 25, beam: 5.8, depth: 1.5, bow: 1.6, stern: 0.35, sheer: 0.35, hull: 0x1b1d1f, deck: 0x6b5a44 }),
      box(3.4, 1.0, 12, 0, 2.0, 0.5, 0x7d3428),
      box(2.6, 1.9, 2.6, 0, 2.5, -9.6, 0xd9cfb6),
      mast(0, 3.5, 1.5, 19, 0x5a4530),
      quad([0.1, 3.2, 3.3], [0.1, 17.5, 3.3], [0.1, 15.0, -7.5], [0.1, 3.2, -8.5], 0x9a5a34),
      quad([0.1, 5.0, 3.6], [0.1, 15.5, 3.6], [0.1, 6.5, 11.0], [0.1, 3.5, 10.0], 0xa8673d),
    ]),
  }),
  'thames-barge': () => ({
    speed: [2.4, 3.8], scale: [0.9, 1.15],
    geo: merge([
      loft({ len: 28, beam: 6.0, depth: 1.6, bow: 'blunt', stern: 0.2, sheer: 0.15, hull: 0x1c1e20, deck: 0x6b5a44 }),
      box(4.4, 1.3, 17, 0, 2.2, 1.5, 0x7d3428),
      box(3.2, 2.2, 3.2, 0, 2.7, -10.5, 0xe8e4d8),
      cyl(0.3, 0.3, 1.5, 0, 4.4, -10.5, DARK),
    ]),
  }),
  'narrowboat': () => ({
    speed: [1.6, 2.6], scale: [0.9, 1.1],
    geo: merge([
      loft({ len: 18, beam: 2.1, depth: 1.1, bow: 2.4, stern: 0.4, sheer: 0.15, hull: 0x1f3a2a, deck: 0x8a2f24 }),
      box(1.9, 1.5, 12.5, 0, 1.85, -0.5, 0x2b5a3c),
      box(1.7, 0.3, 12.7, 0, 2.7, -0.5, 0xb9362b),
      cyl(0.12, 0.12, 1.2, 0.5, 3.2, -4, DARK),
    ]),
  }),
  'tug': () => ({
    speed: [3.0, 5.0], scale: [0.9, 1.1],
    geo: merge([
      loft({ len: 15, beam: 5.2, depth: 2.0, bow: 2.2, stern: 0.3, sheer: 0.5, hull: 0x1c1e20, deck: 0x5a5148 }),
      box(4.2, 1.6, 6.5, 0, 2.8, -1.5, 0xb03a2e),
      box(3.0, 2.2, 3.0, 0, 4.7, -1.0, 0xe8e4d8),
      cyl(0.6, 0.7, 2.8, 0, 6.5, -3.6, 0x232323),
    ]),
  }),
  // ── Paris. The Freycinet péniche is thirty-eight metres and a bateau-mouche
  // is a glass box the same length.
  'peniche': () => ({
    speed: [2.6, 4.2], scale: [0.92, 1.08],
    geo: merge([
      loft({ len: 38, beam: 5.0, depth: 1.6, bow: 'blunt', stern: 0.15, sheer: 0.1, hull: 0x27364a, deck: 0x8d8478 }),
      box(4.0, 0.9, 26, 0, 2.0, 3.0, 0x4d5a66),
      box(3.6, 2.3, 4.2, 0, 2.75, -14.5, 0xe8e4d8),
      box(1.8, 1.0, 3.8, 0, 2.1, -9.0, 0x3a3c40),
    ]),
  }),
  'bateau-mouche': () => ({
    speed: [3.0, 5.0], scale: [0.92, 1.08],
    geo: merge([
      loft({ len: 32, beam: 8.2, depth: 1.4, bow: 2.6, stern: 0.15, sheer: 0.1, hull: WHITE, deck: 0x7e8a90 }),
      box(7.2, 2.3, 22, 0, 2.55, -1.5, GLASS),
      box(7.6, 0.3, 22.6, 0, 3.85, -1.5, WHITE),
      box(3.0, 1.4, 2.6, 0, 4.7, -6.0, WHITE),
    ]),
  }),
  // ── The Yamuna and the Nile.
  'country-boat': () => ({
    speed: [1.3, 2.2], scale: [0.85, 1.2],
    geo: merge([
      loft({ len: 9.5, beam: 2.4, depth: 0.9, bow: 1.3, stern: 1.0, sheer: 0.55, sternRise: 0.4, hull: 0x6b4a2e, deck: 0x8f6b45 }),
      arch(2.0, 3.2, 1.1, 0, -1.2, 0x9a8a6a),
    ]),
  }),
  'felucca': () => ({
    speed: [1.5, 2.6], scale: [0.9, 1.1],
    geo: merge([
      loft({ len: 13, beam: 3.4, depth: 1.0, bow: 1.4, stern: 0.5, sheer: 0.5, hull: WHITE, deck: TEAK }),
      mast(0, 1.5, 1.0, 12, 0x5a4530, -0.12),
      quad([0.1, 2.0, 1.6], [0.1, 13.5, 3.5], [0.1, 3.5, -6.5], [0.1, 1.6, -5.0], CREAM),
    ]),
  }),
  'rowing': () => ({
    speed: [1.3, 2.4], scale: [0.85, 1.15],
    geo: merge([
      loft({ len: 5.6, beam: 1.5, depth: 0.55, bow: 1.4, stern: 0.6, sheer: 0.2, hull: 0x8a6a3e, deck: 0xb08c5a }),
      box(1.3, 0.12, 0.35, 0, 0.55, -0.6, 0x5a4530),
    ]),
  }),
  // ── Harbours. A double-decked ferry, a motor cruiser, a yacht under sail.
  'ferry': () => ({
    speed: [5.0, 7.5], scale: [0.95, 1.05],
    geo: merge([
      loft({ len: 36, beam: 9.0, depth: 2.4, bow: 2.2, stern: 0.7, sheer: 0.4, hull: 0x1f5a3f, deck: 0x8d8478 }),
      box(8.0, 2.4, 26, 0, 3.6, 0, CREAM),
      box(7.6, 2.2, 22, 0, 5.9, -1, 0x1f5a3f),
      box(8.2, 0.3, 24, 0, 7.1, -1, CREAM),
      box(3.6, 1.8, 3.4, 0, 8.1, 3.0, CREAM),
      cyl(0.7, 0.8, 2.6, 0, 8.4, -6.0, 0xd8a53a),
    ]),
  }),
  'vapur': () => ({
    speed: [5.0, 7.5], scale: [0.95, 1.05],
    geo: merge([
      loft({ len: 40, beam: 9.5, depth: 2.6, bow: 2.0, stern: 0.7, sheer: 0.4, hull: WHITE, deck: 0x8d8478 }),
      box(8.4, 2.4, 28, 0, 3.8, 0, WHITE),
      box(8.0, 2.2, 24, 0, 6.1, -1, WHITE),
      box(8.6, 0.3, 26, 0, 7.3, -1, 0x3a3c40),
      cyl(0.8, 0.9, 3.4, 0, 8.6, -4.0, 0xe0b23a),
      cyl(0.82, 0.82, 0.7, 0, 10.5, -4.0, 0x232323),
    ]),
  }),
  'rio-ferry': () => ({
    speed: [5.0, 7.0], scale: [0.95, 1.05],
    geo: merge([
      loft({ len: 34, beam: 9.0, depth: 2.4, bow: 2.2, stern: 0.7, sheer: 0.3, hull: WHITE, deck: 0x8d8478 }),
      box(8.0, 2.4, 25, 0, 3.6, 0, WHITE),
      box(8.2, 0.9, 25.4, 0, 5.2, 0, 0xe0722a),
      box(7.4, 2.0, 18, 0, 6.6, -1, WHITE),
      box(3.4, 1.6, 3.2, 0, 8.4, 3.0, WHITE),
    ]),
  }),
  'cruiser': () => ({
    speed: [4.0, 7.0], scale: [0.85, 1.15],
    geo: merge([
      loft({ len: 13.5, beam: 4.2, depth: 1.3, bow: 1.6, stern: 0.25, sheer: 0.45, hull: WHITE, deck: 0xd8d2c2 }),
      box(3.6, 1.3, 5.5, 0, 1.95, -1.5, WHITE),
      box(3.2, 0.9, 3.0, 0, 3.0, -1.0, GLASS),
      box(3.4, 0.2, 3.4, 0, 3.55, -1.0, WHITE),
    ]),
  }),
  'yacht': () => ({
    speed: [2.0, 3.5], scale: [0.85, 1.2],
    geo: merge([
      loft({ len: 11.5, beam: 3.5, depth: 1.1, bow: 1.5, stern: 0.3, sheer: 0.3, hull: WHITE, deck: 0xd2c6a8 }),
      box(2.4, 0.7, 3.4, 0, 1.45, -1.0, WHITE),
      mast(0, 1.0, 1.1, 15, 0xc9c9c9),
      tris([[[0.08, 1.9, 0.9], [0.08, 15.5, 0.9], [0.08, 1.9, -5.4]]], CREAM),
      tris([[[-0.08, 2.0, 1.2], [-0.08, 13.0, 1.2], [-0.08, 1.6, 5.5]]], CREAM),
    ]),
  }),
  'river-cruise': () => ({
    speed: [3.5, 5.5], scale: [0.95, 1.05],
    geo: merge([
      loft({ len: 46, beam: 8.4, depth: 1.6, bow: 2.4, stern: 0.5, sheer: 0.15, hull: WHITE, deck: 0x8d8478 }),
      box(7.4, 2.2, 36, 0, 2.6, -1, GLASS),
      box(7.8, 0.3, 37, 0, 3.85, -1, WHITE),
      box(3.2, 1.5, 3.0, 0, 4.7, 9.0, WHITE),
    ]),
  }),
  // ── The Aegean and Guanabara: wooden fishing boats, high in the bow.
  'caique': () => ({
    speed: [2.5, 4.5], scale: [0.85, 1.15],
    geo: merge([
      loft({ len: 12.5, beam: 4.2, depth: 1.3, bow: 1.3, stern: 0.55, sheer: 0.8, sternRise: 0.2, hull: 0x2a5f9e, deck: TEAK }),
      box(2.6, 1.6, 2.6, 0, 2.2, -3.2, WHITE),
      box(2.8, 0.15, 2.8, 0, 3.05, -3.2, 0x2a5f9e),
      mast(0, 0.5, 1.3, 6.5, 0x5a4530),
    ]),
  }),
  'fishing': () => ({
    speed: [2.5, 4.5], scale: [0.85, 1.15],
    geo: merge([
      loft({ len: 11.5, beam: 3.8, depth: 1.2, bow: 1.4, stern: 0.5, sheer: 0.6, hull: 0xc9472f, deck: TEAK }),
      box(2.4, 1.5, 2.4, 0, 2.1, -2.8, WHITE),
      box(2.6, 0.15, 2.6, 0, 2.9, -2.8, 0x1f3a5a),
      mast(0, 1.0, 1.2, 5.5, 0x5a4530),
    ]),
  }),
  // ── The Rhine: eighty metres of containers with a wheelhouse at the back.
  'rhine-barge': () => ({
    speed: [2.6, 4.4], scale: [0.95, 1.05],
    geo: merge([
      loft({ len: 84, beam: 10.5, depth: 2.2, bow: 'blunt', stern: 0.15, sheer: 0.1, hull: 0x2b3440, deck: 0x6f6a62 }),
      box(9.0, 2.5, 12, 0, 3.4, 30, 0x9b3a2c), box(9.0, 2.5, 12, 0, 3.4, 17, 0x2e6da4),
      box(9.0, 2.5, 12, 0, 3.4, 4, 0xc9a23a), box(9.0, 2.5, 12, 0, 3.4, -9, 0x4a7a4a),
      box(9.0, 2.5, 12, 0, 3.4, -22, 0x9b3a2c), box(9.0, 2.5, 12, 0, 5.9, 4, 0x2e6da4),
      box(6.0, 2.6, 6.0, 0, 5.5, -36, WHITE), box(3.0, 2.2, 3.0, 0, 7.9, -36, WHITE),
    ]),
  }),
  // ── Himeji: a yakatabune, the roofed pleasure boat, and a skiff.
  'yakatabune': () => ({
    speed: [1.6, 2.8], scale: [0.9, 1.1],
    geo: merge([
      loft({ len: 15, beam: 3.8, depth: 0.9, bow: 1.2, stern: 0.8, sheer: 0.5, sternRise: 0.3, hull: 0x3a2a1c, deck: 0x9a7a55 }),
      box(3.0, 1.6, 9.5, 0, 1.7, -0.5, 0xd9c9a3),
      gable(3.2, 9.7, 2.5, 1.0, 0, -0.5, 0x2c2c30),
      box(0.4, 0.4, 0.4, -1.75, 2.35, 3.5, 0xc9352b), box(0.4, 0.4, 0.4, 1.75, 2.35, 3.5, 0xc9352b),
      box(0.4, 0.4, 0.4, -1.75, 2.35, -4.5, 0xc9352b), box(0.4, 0.4, 0.4, 1.75, 2.35, -4.5, 0xc9352b),
    ]),
  }),
  'skiff-jp': () => ({
    speed: [1.3, 2.3], scale: [0.85, 1.15],
    geo: merge([
      loft({ len: 7.0, beam: 1.7, depth: 0.6, bow: 1.2, stern: 0.9, sheer: 0.35, sternRise: 0.25, hull: 0x4a3a28, deck: 0x9a7a55 }),
    ]),
  }),
  // ── The Klang: sampans under woven hoods, and the perahu with its lifted bow.
  'sampan': () => ({
    speed: [1.3, 2.4], scale: [0.85, 1.15],
    geo: merge([
      loft({ len: 8.0, beam: 2.2, depth: 0.7, bow: 1.2, stern: 1.0, sheer: 0.45, sternRise: 0.45, hull: 0x5a4028, deck: 0x8a6a45 }),
      arch(2.0, 3.6, 0.85, 0, -0.5, 0xa88a5a, 0.7),
    ]),
  }),
  'perahu': () => ({
    speed: [1.8, 3.2], scale: [0.85, 1.15],
    geo: merge([
      loft({ len: 10.5, beam: 2.6, depth: 0.8, bow: 1.1, stern: 0.9, sheer: 0.9, sternRise: 0.5, hull: 0x1f7a8a, deck: 0xd9b866 }),
      box(0.3, 0.3, 2.0, 0, 1.2, 4.0, 0xc9352b),
    ]),
  }),
  // ── The Creek: the abra water taxi and the dhow.
  'abra': () => ({
    speed: [1.6, 2.8], scale: [0.9, 1.1],
    geo: merge([
      loft({ len: 9.5, beam: 3.0, depth: 0.9, bow: 1.4, stern: 0.4, sheer: 0.45, hull: TEAK, deck: 0xa07a50 }),
      box(0.14, 1.5, 0.14, -1.2, 1.75, 2.5, TEAK), box(0.14, 1.5, 0.14, 1.2, 1.75, 2.5, TEAK),
      box(0.14, 1.5, 0.14, -1.2, 1.75, -2.5, TEAK), box(0.14, 1.5, 0.14, 1.2, 1.75, -2.5, TEAK),
      box(2.9, 0.12, 6.2, 0, 2.55, 0, 0xd9cfb6),
    ]),
  }),
  'dhow': () => ({
    speed: [1.8, 3.2], scale: [0.9, 1.15],
    geo: merge([
      loft({ len: 22, beam: 6.0, depth: 1.7, bow: 1.3, stern: 0.5, sheer: 0.6, sternRise: 1.4, hull: TEAK, deck: 0xa07a50 }),
      box(4.4, 1.4, 4.0, 0, 2.9, -8.0, 0x9a7a55),
      mast(0, 2.0, 1.7, 17, 0x5a4530, -0.18),
      quad([0.1, 3.0, 2.5], [0.1, 18.0, 5.5], [0.1, 4.5, -8.5], [0.1, 2.8, -6.0], CREAM),
    ]),
  }),
  // ── Lhasa: the yak-hide coracle, which is round.
  'coracle': () => ({
    speed: [1.3, 1.9], scale: [0.9, 1.1],
    geo: merge([
      cyl(1.3, 1.1, 0.7, 0, 0.35, 0, 0x3a2a1c, 12),
      cyl(1.0, 1.0, 0.1, 0, 0.7, 0, 0x6b4a2e, 12),
    ]),
  }),
};

const cache = new Map();

/** The geometry and speeds for a kind, built once. Unknown kinds are a tug. */
export function buildCraft(kind) {
  if (!cache.has(kind)) {
    const make = KINDS[kind] || KINDS.tug;
    cache.set(kind, make());
  }
  return cache.get(kind);
}

/**
 * What each level puts on its water. Repetition is weight: Sydney has more
 * ferries than cruisers. A level with no water gets no boats whatever this
 * says, because the router finds no channel to put them on.
 */
export const FLEETS = {
  westminster: ['thames-sail', 'thames-barge', 'thames-barge', 'narrowboat', 'tug'],
  paris: ['peniche', 'peniche', 'bateau-mouche'],
  agra: ['country-boat'],
  giza: ['felucca'],
  chichen: [],
  pisa: ['rowing'],
  sydney: ['ferry', 'ferry', 'yacht', 'yacht', 'cruiser'],
  moscow: ['river-cruise', 'peniche'],
  rio: ['rio-ferry', 'yacht', 'fishing', 'fishing'],
  athens: ['caique', 'caique', 'yacht'],
  istanbul: ['vapur', 'vapur', 'fishing'],
  cologne: ['rhine-barge', 'rhine-barge', 'peniche'],
  himeji: ['yakatabune', 'skiff-jp', 'skiff-jp'],
  petronas: ['sampan', 'sampan', 'perahu'],
  dubai: ['dhow', 'abra', 'abra', 'yacht'],
  potala: ['coracle'],
};
