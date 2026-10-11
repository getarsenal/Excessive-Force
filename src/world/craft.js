import * as THREE from 'three';
import { carParts } from './carkit.js';

/**
 * The boats, and which of them belong where.
 *
 * Each kind is a real working type — a spritsail barge says London the way
 * a red bus does, a péniche says Paris, a dhow with a high stern says the
 * Gulf — and `FLEETS` says which of them a level puts on its water.
 *
 * The first cut of these got the types right and the boats wrong. Every hull
 * sat on the water rather than in it, its keel at the surface; every deck was
 * a flat plate level with the gunwale, so nothing had a side; and every cabin
 * was a box with no window in it. From the camera that is a grey brick with a
 * smaller brick on it whatever it is meant to be. So the kit is now:
 *
 * - a hull lofted to its draft, so the waterline is where it should be, with
 *   bulwarks standing above a sunk deck, the bottom in antifouling, a boot-top
 *   at the waterline and a sheer stripe under the rail where the type has one;
 * - houses with a band of dark glass round them and a roof that overhangs,
 *   wheelhouses glazed all round, funnels with their company band and a black
 *   top, rails on the open decks;
 * - sails cut as sails, on spars, and the small things that say what a boat
 *   is for: leeboards, hatch boards, thwarts, net gantries, a car on the deck
 *   of a barge.
 *
 * Everything is still one vertex-coloured geometry per kind and one instanced
 * draw per kind, three to nine hundred triangles a hull, and nothing touches
 * the physics world. The water-side life (bob, roll and the wake) is in
 * life.js, which asks each kind its `wake` length and how much it rolls.
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
  parts = parts.flat().filter(Boolean);
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

/** Raw triangles with one colour; flat normals. */
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

/** A round spar from a to b. */
function spar(a, b, r, hex, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r * 0.75, r, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return paint(g, hex);
}

function mast(x, z, yBase, h, hex = 0x6d5236, rake = 0) {
  const top = [x, yBase + h * Math.cos(rake), z + h * Math.sin(-rake)];
  return spar([x, yBase, z], top, 0.16, hex);
}

/**
 * A sail: a panel through its corners (the instanced material is
 * double-sided, so one face is enough), with a belly pushed out to one side
 * so the light falls across it.
 */
function sail(corners, hex, belly = 0.5, side = 1) {
  const [a, b, c, d] = corners;
  const n = d ? 4 : 3;
  const cx = (a[0] + b[0] + c[0] + (d ? d[0] : 0)) / n;
  const cy = (a[1] + b[1] + c[1] + (d ? d[1] : 0)) / n;
  const cz = (a[2] + b[2] + c[2] + (d ? d[2] : 0)) / n;
  const m = [cx + belly * side, cy, cz];
  const list = d ? [[a, b, m], [b, c, m], [c, d, m], [d, a, m]] : [[a, b, m], [b, c, m], [c, a, m]];
  return tris(list, hex);
}

const DARKGLASS = 0x1c2630;

/**
 * A deckhouse: walls, a band of dark glass round all four sides, and a roof
 * slab that overhangs. `rake` pulls the front wall's top back (a wheelhouse's
 * screen); `win` is the band's bottom and top as fractions of the height.
 */
function house({ w, h, d, x = 0, y, z, wall, roof = wall, glass = DARKGLASS, win = [0.45, 0.85], over = 0.18, rake = 0, slab = 0.14, front = true }) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h;
  const zf = z1 - rake;   // the front wall's top
  const parts = [];
  parts.push(tris([
    // sides
    [[x1, y, z0], [x1, y1, z0], [x1, y1, zf]], [[x1, y, z0], [x1, y1, zf], [x1, y, z1]],
    [[x0, y, z0], [x0, y, z1], [x0, y1, zf]], [[x0, y, z0], [x0, y1, zf], [x0, y1, z0]],
    // front (raked) and back
    [[x0, y, z1], [x1, y, z1], [x1, y1, zf]], [[x0, y, z1], [x1, y1, zf], [x0, y1, zf]],
    [[x0, y, z0], [x0, y1, z0], [x1, y1, z0]], [[x0, y, z0], [x1, y1, z0], [x1, y, z0]],
  ], wall));
  // The glass, a hair proud of the walls, inset from the corners.
  const g0 = y + h * win[0], g1 = y + h * win[1], e = 0.025, ins = Math.min(0.25, w * 0.08);
  const fz = (yy) => z1 + e - rake * ((yy - y) / h);
  const G = [
    [[x1 + e, g0, z0 + ins], [x1 + e, g1, z0 + ins], [x1 + e, g1, z1 - ins - rake * win[1]]], [[x1 + e, g0, z0 + ins], [x1 + e, g1, z1 - ins - rake * win[1]], [x1 + e, g0, z1 - ins - rake * win[0]]],
    [[x0 - e, g0, z0 + ins], [x0 - e, g0, z1 - ins - rake * win[0]], [x0 - e, g1, z1 - ins - rake * win[1]]], [[x0 - e, g0, z0 + ins], [x0 - e, g1, z1 - ins - rake * win[1]], [x0 - e, g1, z0 + ins]],
    [[x0 + ins, g0, z0 - e], [x0 + ins, g1, z0 - e], [x1 - ins, g1, z0 - e]], [[x0 + ins, g0, z0 - e], [x1 - ins, g1, z0 - e], [x1 - ins, g0, z0 - e]],
  ];
  if (front) G.push([[x0 + ins, g0, fz(g0)], [x1 - ins, g0, fz(g0)], [x1 - ins, g1, fz(g1)]], [[x0 + ins, g0, fz(g0)], [x1 - ins, g1, fz(g1)], [x0 + ins, g1, fz(g1)]]);
  parts.push(tris(G, glass));
  if (slab > 0) parts.push(box(w + over * 2, slab, d - rake + over * 2, x, y1 + slab / 2, (z0 + zf) / 2, roof));
  return parts;
}

/** Open rails round a deck: a top rail at `h` each side and across the ends, on a few posts. */
function rails({ w, d, x = 0, y, z, h = 1.0, hex = 0xe8e6de, ends = true, posts = 4 }) {
  const r = 0.035, parts = [];
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  parts.push(box(r * 2, r * 2, d, x0, y + h, z, hex), box(r * 2, r * 2, d, x1, y + h, z, hex));
  if (ends) parts.push(box(w, r * 2, r * 2, x, y + h, z0, hex), box(w, r * 2, r * 2, x, y + h, z1, hex));
  for (let i = 0; i <= posts; i++) {
    const zz = z0 + (d * i) / posts;
    parts.push(box(r * 1.6, h, r * 1.6, x0, y + h / 2, zz, hex), box(r * 1.6, h, r * 1.6, x1, y + h / 2, zz, hex));
  }
  return parts;
}

/** A funnel: the stack, its company band and a black top. */
function funnel({ r, h, x = 0, y, z, hex, band = null, top = 0x1c1c1c, rake = 0.12 }) {
  const g = (y0, hh, c) => {
    const geo = new THREE.CylinderGeometry(r * 0.95, r, hh, 10);
    geo.translate(0, hh / 2, 0);
    geo.rotateX(-rake);
    geo.translate(x, y0, z - Math.sin(rake) * (y0 - y));
    return paint(geo, c);
  };
  return [g(y, h * 0.62, hex), g(y + h * 0.62, h * 0.22, band ?? hex), g(y + h * 0.84, h * 0.16, top)];
}

/** A car on a barge's deck, its paint in one colour. */
function deckCar(x, y, z, hex, ry = 0) {
  const p = carParts('hatch', { wheels: 'box' });
  const out = [];
  for (const [k, c] of [['paint', hex], ['glass', DARKGLASS], ['rubber', 0x1a1a1a], ['tail', 0x9a1c14]]) {
    const g = p[k];
    if (!g) continue;
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    g.deleteAttribute('uv');
    out.push(paint(g, c));
  }
  return out;
}

function shade(hex, k) {
  _c.setHex(hex).multiplyScalar(k);
  _c.r = Math.min(1, _c.r); _c.g = Math.min(1, _c.g); _c.b = Math.min(1, _c.b);
  return _c.getHex();
}

// ── The hull ───────────────────────────────────────────────────────────────

/**
 * Loft a hull from a run of sections, and float it.
 *
 * `bow` is the exponent the beam closes with toward the bow: small for a fine
 * entry and large for full shoulders, and 'blunt' is a barge's swim-head that
 * never closes at all. `stern` runs 0..1 from a square transom to a bow at
 * both ends. `sheer` lifts the gunwale toward the bow; `sternRise` lifts it
 * aft, which is a dhow. `rocker` lifts the keel at the ends.
 *
 * The hull is built keel at y 0 and then lowered by its `draft` (a share of
 * the depth: a laden barge sits deep, a skiff on top), so y 0 is the
 * waterline. Below it the faces take the `bottom` colour, across it a
 * `boot`-top band, under the rail a `stripe`. The topsides rise `bulwark`
 * metres above a deck sunk inside them, with the inside of the bulwark in
 * `inside`: a boat has a side to look over, and from above that is most of
 * what makes it a boat rather than a plank. `userData.deckAt(z)` is the
 * deck's height at z after the drop, for what stands on it. A boat under
 * fourteen metres is cut at ten stations rather than sixteen.
 */
export function loft({ len, beam, depth, bow = 2.0, stern = 1.0, sheer = 0.3, sternRise = 0.0,
  bowLen = 0.36, sternLen = 0.3, rocker = 0.45, hull, deck, draft = 0.42, bottom = null, boot = null,
  stripe = null, bulwark = null, inside = null, N = len < 14 ? 10 : 16 }) {
  const st = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const bt = Math.max(0, (t - (1 - bowLen)) / bowLen);
    const fb = bow === 'blunt' ? 1 - 0.3 * bt * bt : 1 - Math.pow(bt, bow);
    const s_ = Math.max(0, (sternLen - t) / sternLen);
    const fs = 1 - stern * Math.pow(s_, 2.2);
    const hb = Math.max(0.05, (beam / 2) * fb * fs);
    const yk = depth * rocker * Math.pow(Math.abs(2 * t - 1), 3);
    const yg = depth + sheer * t * t + sternRise * (1 - t) * (1 - t);
    st.push({ z: -len / 2 + t * len, hb, yk, yg });
  }
  const wl = depth * draft;                       // the waterline, over the keel
  const bw = bulwark ?? Math.min(0.9, Math.max(0.25, depth * 0.28));
  // The section, one side, gunwale to keel: [half-width share, height share].
  const SH = [[1.0, 1.0], [0.995, 0.88], [0.96, 0.66], [0.88, 0.44], [0.7, 0.24], [0.4, 0.08], [0, 0]];
  const pt = (s, k, side) => [side * s.hb * SH[k][0], s.yk + (s.yg - s.yk) * SH[k][1], s.z];
  const bottomC = bottom ?? shade(hull, 0.55), bootC = boot ?? bottomC;
  const inC = inside ?? shade(deck, 1.12);
  const H = { hull: [], bottom: [], boot: [], stripe: [], cap: [] };
  const band = (ym, k) => {
    if (k === 0 && stripe != null) return 'stripe';
    if (ym < wl - 0.1) return 'bottom';
    if (ym < wl + 0.14) return 'boot';
    return 'hull';
  };
  const D = [], IN = [];
  for (let i = 0; i < N; i++) {
    const A = st[i], B = st[i + 1];
    for (const side of [1, -1]) {
      for (let k = 0; k < SH.length - 1; k++) {
        const a0 = pt(A, k, side), a1 = pt(A, k + 1, side), b0 = pt(B, k, side), b1 = pt(B, k + 1, side);
        const key = band((a0[1] + a1[1] + b0[1] + b1[1]) / 4, k);
        H[key].push(...(side > 0 ? [[a0, b1, a1], [a0, b0, b1]] : [[a0, a1, b1], [a0, b1, b0]]));
      }
      // The inside of the bulwark, gunwale down to the deck, and the cap.
      const ia = [side * A.hb * 0.92, A.yg, A.z], ib = [side * B.hb * 0.92, B.yg, B.z];
      const ja = [side * A.hb * 0.92, A.yg - bw, A.z], jb = [side * B.hb * 0.92, B.yg - bw, B.z];
      const oa = [side * A.hb, A.yg, A.z], ob = [side * B.hb, B.yg, B.z];
      if (side > 0) { IN.push([ia, ja, jb], [ia, jb, ib]); H.cap.push([oa, ia, ib], [oa, ib, ob]); }
      else { IN.push([ia, jb, ja], [ia, ib, jb]); H.cap.push([oa, ib, ia], [oa, ob, ib]); }
    }
    // The deck, sunk inside the bulwarks.
    const da = A.yg - bw, db = B.yg - bw;
    const L = [-A.hb * 0.92, da, A.z], R = [A.hb * 0.92, da, A.z], L2 = [-B.hb * 0.92, db, B.z], R2 = [B.hb * 0.92, db, B.z];
    D.push([L, R2, R], [L, L2, R2]);
  }
  // The transom, closing the stern.
  if (stern < 0.98) {
    const S = st[0], c = [0, (S.yk + S.yg) / 2, S.z];
    for (const side of [1, -1]) {
      for (let k = 0; k < SH.length - 1; k++) {
        const a = pt(S, k, side), b = pt(S, k + 1, side);
        H.hull.push(side > 0 ? [c, b, a] : [c, a, b]);
      }
    }
  }
  const capC = stripe ?? shade(hull, 1.25);
  const parts = [
    tris(H.hull, hull), tris(H.bottom, bottomC), tris(H.boot, bootC), tris(H.stripe, stripe ?? hull),
    tris(H.cap, capC), tris(D, deck), tris(IN, inC),
  ].filter((g) => g.attributes.position.count);
  const g = merge(parts);
  g.translate(0, -wl, 0);
  g.userData = {
    deckAt: (z) => {
      const t = Math.min(1, Math.max(0, (z + len / 2) / len)), i = Math.min(N - 1, Math.floor(t * N));
      const f = t * N - i, a = st[i], b = st[i + 1];
      return a.yg + (b.yg - a.yg) * f - bw - wl;
    },
    wl, bw,
  };
  return g;
}

// ── The kinds ──────────────────────────────────────────────────────────────

const WHITE = 0xeceae2, CREAM = 0xf0e6cf, TEAK = 0x7a5a3a, DARK = 0x2a2c2f, ANTIFOUL = 0x7a2a22,
  BLACK = 0x1c1e20, SAILCLOTH = 0xe9e1cc, TANBARK = 0x9a4a2a;

/**
 * Each entry builds one geometry, +z forward, waterline at y 0, and says how
 * fast the thing goes in metres a second, how much its size may wander, how
 * much it rolls (`roll`, radians of swell) and how long a wake it draws
 * (`wake`, a share of its length). Nothing on any river does more than about
 * fourteen knots; nothing that is rowed or sailed does less than a walking pace.
 */
const KINDS = {
  // ── London. The Thames is a working river: spritsail barges, lighters
  // under a tarpaulin, and the tugs that move them.
  'thames-sail': () => {
    const hull = loft({ len: 25, beam: 5.8, depth: 1.9, bow: 1.6, stern: 0.35, sheer: 0.45, draft: 0.5,
      hull: BLACK, deck: 0x6b5a44, bottom: 0x3a2a22, stripe: 0xc9b98a, bulwark: 0.55 });
    const dk = hull.userData.deckAt, m = dk(3.5);
    return {
      speed: [1.6, 2.8], scale: [0.9, 1.1], roll: 0.02, wake: 1.0,
      geo: merge([
        hull,
        box(3.6, 0.45, 11, 0, dk(0) + 0.22, 0.5, 0x5a4636),           // hatch boards
        house({ w: 2.4, h: 1.1, d: 2.6, y: dk(-9.6), z: -9.6, wall: 0x6b4a32, roof: 0x3a2a20, win: [0.4, 0.75] }),
        mast(0, 3.5, m, 19, 0x5a4530),
        spar([0, m + 1.2, 3.5], [0, m + 16.5, -6.5], 0.11, 0x5a4530), // the sprit
        sail([[0.15, m + 1.4, 3.3], [0.15, m + 18.2, 3.3], [0.15, m + 16.2, -7.2], [0.15, m + 1.6, -8.4]], TANBARK, 0.6),
        sail([[0.15, m + 2.5, 3.8], [0.15, m + 14.5, 3.8], [0.15, dk(10) + 1.2, 11.5]], 0xa8673d, 0.4),
        // The leeboards, hung on the sides amidships.
        quad([2.95, dk(1) + 0.6, 3.2], [2.95, dk(1) + 0.6, 0.6], [3.1, -1.4, 0.9], [3.1, -1.4, 2.9], 0x3a2a20),
        quad([-2.95, dk(1) + 0.6, 0.6], [-2.95, dk(1) + 0.6, 3.2], [-3.1, -1.4, 2.9], [-3.1, -1.4, 0.9], 0x3a2a20),
      ]),
    };
  },
  'thames-barge': () => {
    const hull = loft({ len: 28, beam: 6.0, depth: 2.0, bow: 'blunt', stern: 0.2, sheer: 0.15, draft: 0.62,
      hull: BLACK, deck: 0x6b5a44, bottom: ANTIFOUL, boot: 0xd9d4c8, bulwark: 0.6 });
    const dk = hull.userData.deckAt;
    return {
      speed: [2.4, 3.8], scale: [0.9, 1.15], roll: 0.012, wake: 1.0,
      geo: merge([
        hull,
        // The tarpaulin over the hold, ridged.
        gable(4.6, 16, dk(2) + 0.7, 0.55, 0, 2.0, 0x4d5a3c, 0.05),
        box(4.7, 0.7, 16.2, 0, dk(2) + 0.35, 2.0, 0x404a34),
        house({ w: 3.4, h: 2.3, d: 3.6, y: dk(-10.5), z: -10.5, wall: 0xe8e4d8, roof: 0x2c3a46, win: [0.5, 0.88] }),
        cyl(0.18, 0.18, 1.6, 0.9, dk(-10.5) + 3.2, -11.6, DARK, 6),
      ]),
    };
  },
  'narrowboat': () => {
    const hull = loft({ len: 18, beam: 2.1, depth: 1.1, bow: 2.4, stern: 0.4, sheer: 0.15, draft: 0.6,
      hull: 0x1f3a2a, deck: 0x8a2f24, stripe: 0xc9a23a, bulwark: 0.25 });
    const dk = hull.userData.deckAt;
    return {
      speed: [1.6, 2.6], scale: [0.9, 1.1], roll: 0.01, wake: 0.7,
      geo: merge([
        hull,
        house({ w: 1.95, h: 1.45, d: 12.5, y: dk(-0.5), z: -0.5, wall: 0x2b5a3c, roof: 0xb9362b, win: [0.42, 0.72], over: 0.04, glass: 0x1a2a22 }),
        cyl(0.09, 0.09, 0.8, 0.45, dk(-4) + 1.85, -4, DARK, 6),
        box(0.5, 0.35, 0.8, 0, dk(-5) + 1.7, -5.0, 0x8a6a3e),             // logs and a bag on the roof
        spar([0, dk(-8.6) + 0.7, -8.6], [0, dk(-8.6) + 1.0, -10.2], 0.05, 0xc9a23a),
      ]),
    };
  },
  'tug': () => {
    const hull = loft({ len: 15, beam: 5.2, depth: 2.4, bow: 2.2, stern: 0.3, sheer: 0.6, draft: 0.5,
      hull: BLACK, deck: 0x5a5148, bottom: ANTIFOUL, boot: 0xd9d4c8, stripe: 0xe8e4d8, bulwark: 0.7 });
    const dk = hull.userData.deckAt;
    return {
      speed: [3.0, 5.0], scale: [0.9, 1.1], roll: 0.025, wake: 1.4,
      geo: merge([
        hull,
        house({ w: 4.0, h: 1.8, d: 6.5, y: dk(-1.5), z: -1.5, wall: 0xb03a2e, roof: 0x5a5148, win: [0.5, 0.82] }),
        house({ w: 3.0, h: 1.9, d: 3.0, y: dk(-1.5) + 1.95, z: -0.4, wall: 0xe8e4d8, roof: 0x2c2c2c, win: [0.35, 0.9], rake: 0.25 }),
        funnel({ r: 0.6, h: 2.6, y: dk(-3.6) + 1.8, z: -3.7, hex: 0x1c1c1c, band: 0xb03a2e }),
        // Fenders on the stem and the shoulders.
        box(0.6, 0.7, 0.5, 0, dk(7.0) - 0.2, 7.2, 0x141414),
        ...[-1, 1].map((s) => box(0.3, 0.6, 0.6, s * 2.25, dk(4.5) - 0.3, 4.5, 0x141414)),
      ]),
    };
  },
  // ── Paris. The Freycinet péniche is thirty-eight metres and a bateau-mouche
  // is a glass box the same length.
  'peniche': () => {
    const hull = loft({ len: 38, beam: 5.0, depth: 2.0, bow: 'blunt', stern: 0.15, sheer: 0.1, draft: 0.6,
      hull: 0x27364a, deck: 0x8d8478, bottom: 0x2a1c18, boot: 0xb63a2c, stripe: 0xe0dcd0, bulwark: 0.5 });
    const dk = hull.userData.deckAt;
    return {
      speed: [2.6, 4.2], scale: [0.92, 1.08], roll: 0.008, wake: 1.0,
      geo: merge([
        hull,
        // Hatch covers in a run of low gables.
        ...[10, 3, -4].map((z) => gable(4.0, 6.6, dk(z) + 0.55, 0.35, 0, z, 0x4d5a66, 0.02)),
        ...[10, 3, -4].map((z) => box(4.05, 0.55, 6.6, 0, dk(z) + 0.27, z, 0x3e4a55)),
        house({ w: 3.6, h: 2.3, d: 4.2, y: dk(-14.5), z: -14.5, wall: 0xe8e4d8, roof: 0x27364a, win: [0.45, 0.85] }),
        house({ w: 2.0, h: 1.2, d: 3.0, y: dk(-10), z: -10, wall: 0xe8e4d8, roof: 0x27364a, win: [0.4, 0.8] }),
        // The skipper's car on the deck aft, as every péniche carries one.
        deckCar(0, dk(-7.4) + 0.05, -7.4, 0x9a1c14, Math.PI / 2),
        // Flower boxes along the wheelhouse.
        box(3.4, 0.25, 0.3, 0, dk(-12.3) + 0.9, -12.3, 0x3d7a3a),
      ]),
    };
  },
  'bateau-mouche': () => {
    const hull = loft({ len: 32, beam: 8.2, depth: 1.6, bow: 2.6, stern: 0.15, sheer: 0.1, draft: 0.45,
      hull: WHITE, deck: 0x7e8a90, bottom: 0x2a3440, boot: 0x2a3440, bulwark: 0.3 });
    const dk = hull.userData.deckAt;
    return {
      speed: [3.0, 5.0], scale: [0.92, 1.08], roll: 0.006, wake: 1.2,
      geo: merge([
        hull,
        // The glass saloon: tall glazing under a flat white roof.
        house({ w: 7.0, h: 2.3, d: 22, y: dk(-1.5), z: -1.5, wall: WHITE, roof: WHITE, win: [0.22, 0.92], over: 0.25, glass: 0x24343e }),
        // Seats on the open roof and the rails round it.
        ...[-7, -4, -1, 2, 5].map((z) => box(6.0, 0.45, 0.6, 0, dk(z) + 2.62, z, 0x8a2a24)),
        rails({ w: 7.2, d: 22, y: dk(-1.5) + 2.44, z: -1.5, h: 0.9, posts: 8 }),
        house({ w: 2.8, h: 1.3, d: 2.4, y: dk(8) + 2.44, z: 8.0, wall: WHITE, roof: 0x2a3440, win: [0.35, 0.9], rake: 0.3 }),
      ]),
    };
  },
  // ── The Yamuna and the Nile.
  'country-boat': () => {
    const hull = loft({ len: 9.5, beam: 2.4, depth: 0.9, bow: 1.3, stern: 1.0, sheer: 0.55, sternRise: 0.4, draft: 0.35,
      hull: 0x6b4a2e, deck: 0x8f6b45, bulwark: 0.3 });
    const dk = hull.userData.deckAt;
    return {
      speed: [1.3, 2.2], scale: [0.85, 1.2], roll: 0.03, wake: 0.6,
      geo: merge([
        hull,
        arch(2.0, 3.2, dk(-1.2) + 0.2, 0, -1.2, 0x9a8a6a),
        ...[1.5, 2.8].map((z) => box(2.0, 0.08, 0.3, 0, dk(z) + 0.25, z, 0x5a4530)),
        spar([0.9, dk(-3.5) + 0.4, -3.5], [1.4, -0.4, -5.6], 0.05, 0x5a4530),   // the steering oar
      ]),
    };
  },
  'felucca': () => {
    const hull = loft({ len: 13, beam: 3.4, depth: 1.1, bow: 1.4, stern: 0.5, sheer: 0.55, draft: 0.38,
      hull: WHITE, deck: TEAK, stripe: 0x2a6ab0, bottom: 0x3a3028, bulwark: 0.3 });
    const dk = hull.userData.deckAt;
    // The lateen: a long yard slung from a short mast, the sail under it.
    const foot = dk(1.5) + 1.2;
    return {
      speed: [1.5, 2.6], scale: [0.9, 1.1], roll: 0.03, wake: 0.7,
      geo: merge([
        hull,
        mast(0, 1.5, dk(1.5), 8.5, 0x5a4530, -0.08),
        spar([0, foot - 0.5, 5.8], [0, foot + 13.5, -6.0], 0.09, 0x5a4530),
        sail([[0.2, foot - 0.3, 5.4], [0.2, foot + 13.0, -5.6], [0.2, foot, -4.6]], CREAM, 0.7),
        ...[2.5, -1.0].map((z) => box(3.0, 0.08, 0.35, 0, dk(z) + 0.3, z, 0x5a4530)),
      ]),
    };
  },
  'rowing': () => {
    const hull = loft({ len: 5.6, beam: 1.5, depth: 0.6, bow: 1.4, stern: 0.6, sheer: 0.2, draft: 0.35,
      hull: 0x8a6a3e, deck: 0xb08c5a, stripe: 0xe8e4d8, bulwark: 0.32 });
    const dk = hull.userData.deckAt;
    return {
      speed: [1.3, 2.4], scale: [0.85, 1.15], roll: 0.03, wake: 0.4,
      geo: merge([
        hull,
        ...[-1.2, 0.2, 1.4].map((z) => box(1.25, 0.06, 0.28, 0, dk(z) + 0.2, z, 0x5a4530)),
        spar([0.7, dk(0.2) + 0.32, 0.2], [2.4, -0.05, -0.5], 0.035, 0xc9a86a),
        spar([-0.7, dk(0.2) + 0.32, 0.2], [-2.4, -0.05, -0.5], 0.035, 0xc9a86a),
      ]),
    };
  },
  // ── Harbours. Sydney's First Fleet ferries: green hulls, cream houses, a funnel.
  'ferry': () => {
    const hull = loft({ len: 36, beam: 9.0, depth: 2.6, bow: 2.2, stern: 0.7, sheer: 0.35, draft: 0.45,
      hull: 0x1f5a3f, deck: 0x8d8478, bottom: ANTIFOUL, boot: 0xe8e4d8, stripe: CREAM, bulwark: 0.4 });
    const y0 = hull.userData.deckAt(0);
    return {
      speed: [5.0, 7.5], scale: [0.95, 1.05], roll: 0.012, wake: 1.8,
      geo: merge([
        hull,
        house({ w: 8.0, h: 2.4, d: 26, y: y0, z: 0, wall: CREAM, roof: 0x1f5a3f, win: [0.38, 0.86], over: 0.3 }),
        house({ w: 7.0, h: 2.2, d: 20, y: y0 + 2.54, z: -1, wall: CREAM, roof: 0x8d8478, win: [0.35, 0.85], over: 0.2 }),
        house({ w: 3.4, h: 1.7, d: 2.8, y: y0 + 4.88, z: 7.0, wall: CREAM, roof: 0x1f5a3f, win: [0.35, 0.9], rake: 0.3 }),
        house({ w: 3.4, h: 1.7, d: 2.8, y: y0 + 4.88, z: -9.0, wall: CREAM, roof: 0x1f5a3f, win: [0.35, 0.9] }),
        funnel({ r: 0.75, h: 2.8, y: y0 + 4.74, z: -2.5, hex: CREAM, band: 0x1f5a3f }),
        rails({ w: 7.2, d: 20, y: y0 + 4.74, z: -1, h: 0.95, posts: 8 }),
      ]),
    };
  },
  'vapur': () => {
    const hull = loft({ len: 40, beam: 9.5, depth: 2.8, bow: 2.0, stern: 0.7, sheer: 0.35, draft: 0.45,
      hull: WHITE, deck: 0x8d8478, bottom: ANTIFOUL, boot: 0x1c1c1c, stripe: 0x1c1c1c, bulwark: 0.4 });
    const y0 = hull.userData.deckAt(0);
    return {
      speed: [5.0, 7.5], scale: [0.95, 1.05], roll: 0.012, wake: 1.9,
      geo: merge([
        hull,
        house({ w: 8.4, h: 2.4, d: 28, y: y0, z: 0, wall: WHITE, roof: 0x8d8478, win: [0.38, 0.86], over: 0.3 }),
        house({ w: 7.6, h: 2.2, d: 24, y: y0 + 2.54, z: -1, wall: WHITE, roof: 0x3a3c40, win: [0.36, 0.86], over: 0.25 }),
        house({ w: 3.6, h: 1.8, d: 3.2, y: y0 + 4.88, z: 8.5, wall: WHITE, roof: 0x3a3c40, win: [0.35, 0.9], rake: 0.3 }),
        funnel({ r: 0.85, h: 3.4, y: y0 + 4.74, z: -4.0, hex: 0xe0b23a }),
        rails({ w: 7.8, d: 24, y: y0 + 4.74, z: -1, h: 0.95, posts: 8 }),
      ]),
    };
  },
  'rio-ferry': () => {
    const hull = loft({ len: 34, beam: 9.0, depth: 2.6, bow: 2.2, stern: 0.7, sheer: 0.3, draft: 0.45,
      hull: WHITE, deck: 0x8d8478, bottom: 0x2a3a5a, boot: 0xe0722a, stripe: 0xe0722a, bulwark: 0.4 });
    const y0 = hull.userData.deckAt(0);
    return {
      speed: [5.0, 7.0], scale: [0.95, 1.05], roll: 0.012, wake: 1.8,
      geo: merge([
        hull,
        house({ w: 8.0, h: 2.4, d: 25, y: y0, z: 0, wall: WHITE, roof: 0xe0722a, win: [0.38, 0.86], over: 0.3 }),
        house({ w: 7.0, h: 2.0, d: 18, y: y0 + 2.54, z: -1, wall: WHITE, roof: 0x8d8478, win: [0.35, 0.85] }),
        house({ w: 3.2, h: 1.6, d: 3.0, y: y0 + 4.68, z: 6.0, wall: WHITE, roof: 0xe0722a, win: [0.35, 0.9], rake: 0.3 }),
        rails({ w: 7.2, d: 18, y: y0 + 4.68, z: -1, h: 0.95, posts: 6 }),
      ]),
    };
  },
  'cruiser': () => {
    const hull = loft({ len: 13.5, beam: 4.2, depth: 1.5, bow: 1.6, stern: 0.2, sheer: 0.5, draft: 0.38,
      hull: WHITE, deck: 0xc9b58e, bottom: 0x22324a, boot: 0x22324a, stripe: 0x22324a, bulwark: 0.25 });
    const dk = hull.userData.deckAt;
    return {
      speed: [4.0, 7.0], scale: [0.85, 1.15], roll: 0.02, wake: 1.6,
      geo: merge([
        hull,
        house({ w: 3.4, h: 1.4, d: 6.0, y: dk(-1), z: -1.0, wall: WHITE, roof: WHITE, win: [0.25, 0.9], rake: 1.3, over: 0.1 }),
        rails({ w: 3.0, d: 3.2, y: dk(-1) + 1.54, z: -2.2, h: 0.75, posts: 2 }),
        box(1.8, 0.7, 1.2, 0, dk(-1) + 1.9, -1.6, 0x22324a),                  // the flybridge console
        rails({ w: 2.6, d: 3.0, y: dk(3.4), z: 3.4, h: 0.65, ends: false, posts: 3 }),
      ]),
    };
  },
  'yacht': () => {
    const hull = loft({ len: 11.5, beam: 3.5, depth: 1.2, bow: 1.5, stern: 0.25, sheer: 0.3, draft: 0.35,
      hull: WHITE, deck: 0xc9a878, bottom: 0x22324a, boot: 0x22324a, bulwark: 0.18 });
    const dk = hull.userData.deckAt, md = dk(1.0);
    return {
      speed: [2.0, 3.5], scale: [0.85, 1.2], roll: 0.035, wake: 0.9,
      geo: merge([
        hull,
        house({ w: 2.3, h: 0.55, d: 3.6, y: dk(-0.8), z: -0.8, wall: WHITE, roof: WHITE, win: [0.25, 0.75], rake: 0.4, slab: 0.06 }),
        mast(0, 1.0, md, 15, 0xc9c9c9),
        spar([0, md + 1.6, 1.0], [0, md + 1.4, -4.6], 0.07, 0xc9c9c9),       // the boom
        sail([[0.08, md + 1.7, 0.85], [0.08, md + 15.2, 0.85], [0.08, md + 1.5, -4.5]], SAILCLOTH, 0.45),
        sail([[-0.08, md + 13.4, 1.2], [-0.08, md + 0.4, 5.3], [-0.08, md + 0.7, 1.4]], SAILCLOTH, 0.35, -1),
        rails({ w: 2.8, d: 7.0, y: dk(0), z: 0, h: 0.6, ends: false, posts: 3, hex: 0xc9c9c9 }),
      ]),
    };
  },
  'river-cruise': () => {
    const hull = loft({ len: 46, beam: 8.4, depth: 2.0, bow: 2.4, stern: 0.5, sheer: 0.15, draft: 0.45,
      hull: WHITE, deck: 0x8d8478, bottom: 0x22324a, boot: 0x22324a, stripe: 0x22324a, bulwark: 0.3 });
    const y0 = hull.userData.deckAt(0);
    return {
      speed: [3.5, 5.5], scale: [0.95, 1.05], roll: 0.006, wake: 1.4,
      geo: merge([
        hull,
        house({ w: 7.4, h: 2.4, d: 36, y: y0, z: -1, wall: WHITE, roof: WHITE, win: [0.3, 0.86], over: 0.15, glass: 0x24343e }),
        rails({ w: 7.4, d: 34, y: y0 + 2.54, z: -2, h: 0.9, posts: 10 }),
        house({ w: 3.2, h: 1.5, d: 3.0, y: y0 + 2.54, z: 12.0, wall: WHITE, roof: 0x22324a, win: [0.35, 0.9], rake: 0.3 }),
        ...[-8, -4, 0, 4].map((z) => box(5.6, 0.4, 1.2, 0, y0 + 2.74, z, 0x3d6a8a)),   // loungers
      ]),
    };
  },
  // ── The Aegean and Guanabara: wooden fishing boats, high in the bow.
  'caique': () => {
    const hull = loft({ len: 12.5, beam: 4.2, depth: 1.5, bow: 1.3, stern: 0.55, sheer: 0.85, sternRise: 0.2, draft: 0.4,
      hull: WHITE, deck: TEAK, stripe: 0x2a5f9e, boot: 0x2a5f9e, bottom: 0x7a2a22, bulwark: 0.4 });
    const dk = hull.userData.deckAt;
    return {
      speed: [2.5, 4.5], scale: [0.85, 1.15], roll: 0.03, wake: 1.0,
      geo: merge([
        hull,
        house({ w: 2.6, h: 1.7, d: 2.6, y: dk(-3.2), z: -3.2, wall: WHITE, roof: 0x2a5f9e, win: [0.5, 0.85], over: 0.15 }),
        mast(0, 1.0, dk(1.0), 6.5, 0x5a4530),
        spar([0, dk(1) + 1.2, 1.0], [0, dk(1) + 4.8, 4.6], 0.07, 0x5a4530),
        cyl(0.45, 0.45, 1.2, 0, dk(-5.4) + 0.6, -5.4, 0x3d7a8a, 8),            // the net drum
      ]),
    };
  },
  'fishing': () => {
    const hull = loft({ len: 11.5, beam: 3.8, depth: 1.4, bow: 1.4, stern: 0.5, sheer: 0.65, draft: 0.42,
      hull: 0xc9472f, deck: TEAK, stripe: WHITE, boot: WHITE, bottom: 0x2a2a2a, bulwark: 0.4 });
    const dk = hull.userData.deckAt, g = dk(-5);
    return {
      speed: [2.5, 4.5], scale: [0.85, 1.15], roll: 0.03, wake: 1.0,
      geo: merge([
        hull,
        house({ w: 2.4, h: 1.6, d: 2.4, y: dk(-2.8), z: -2.8, wall: WHITE, roof: 0x1f3a5a, win: [0.5, 0.85], over: 0.12 }),
        // The gantry over the stern for the nets.
        spar([1.2, g, -5.0], [0.4, g + 3.0, -5.4], 0.07, 0x9a9a9a),
        spar([-1.2, g, -5.0], [-0.4, g + 3.0, -5.4], 0.07, 0x9a9a9a),
        box(1.0, 0.1, 0.1, 0, g + 3.0, -5.4, 0x9a9a9a),
        mast(0, 1.2, dk(1.2), 5.5, 0x5a4530),
        box(1.6, 0.45, 1.2, 0, dk(2.2) + 0.22, 2.2, 0x3a6a8a),                  // fish boxes
      ]),
    };
  },
  // ── The Rhine: eighty metres of containers with a wheelhouse at the back.
  'rhine-barge': () => {
    const hull = loft({ len: 84, beam: 10.5, depth: 3.0, bow: 'blunt', stern: 0.15, sheer: 0.1, draft: 0.65, N: 20,
      hull: 0x2b3440, deck: 0x6f6a62, bottom: 0x2a1c18, boot: 0xb63a2c, stripe: 0xe0dcd0, bulwark: 0.5 });
    const y0 = hull.userData.deckAt(0);
    const C = [0x9b3a2c, 0x2e6da4, 0xc9a23a, 0x4a7a4a, 0x7a7a7a, 0xd8d4c8];
    const stack = [];
    let k = 0;
    for (const z of [30, 17, 4, -9, -22]) {
      for (const tier of z === 4 || z === -9 ? [0, 1] : [0]) {
        for (const x of [-2.4, 2.4]) {
          stack.push(box(4.6, 2.55, 12, x, y0 + 1.3 + tier * 2.6, z, C[(k++ * 7) % C.length]));
          stack.push(box(4.62, 0.12, 12.02, x, y0 + 0.2 + tier * 2.6, z, 0x2a2a2a));   // the seam
        }
      }
    }
    return {
      speed: [2.6, 4.4], scale: [0.95, 1.05], roll: 0.004, wake: 1.4,
      geo: merge([
        hull,
        ...stack,
        house({ w: 8.0, h: 2.6, d: 7.0, y: y0, z: -36, wall: WHITE, roof: 0x2b3440, win: [0.45, 0.85] }),
        house({ w: 4.0, h: 2.2, d: 3.4, y: y0 + 4.2, z: -35.5, wall: WHITE, roof: 0x2b3440, win: [0.3, 0.92], rake: 0.25 }),
        box(0.4, 1.5, 0.4, 0, y0 + 3.4, -35.5, 0xc9c9c9),                        // the column the wheelhouse rides on
        deckCar(2.6, y0 + 2.75, -37.2, 0x2e2e2e, Math.PI / 2),
      ]),
    };
  },
  // ── Himeji: a yakatabune, the roofed pleasure boat, and a skiff.
  'yakatabune': () => {
    const hull = loft({ len: 15, beam: 3.8, depth: 1.0, bow: 1.2, stern: 0.8, sheer: 0.5, sternRise: 0.3, draft: 0.4,
      hull: 0x3a2a1c, deck: 0x9a7a55, bulwark: 0.2 });
    const y0 = hull.userData.deckAt(-0.5);
    return {
      speed: [1.6, 2.8], scale: [0.9, 1.1], roll: 0.015, wake: 0.8,
      geo: merge([
        hull,
        house({ w: 3.0, h: 1.6, d: 9.5, y: y0, z: -0.5, wall: 0x5a3a24, glass: 0xe8dcb8, roof: 0x5a3a24, win: [0.3, 0.88], slab: 0 }),
        gable(3.2, 9.7, y0 + 1.6, 1.0, 0, -0.5, 0x2c2c30),
        ...[[-1.75, 3.5], [1.75, 3.5], [-1.75, -4.5], [1.75, -4.5], [-1.75, -0.5], [1.75, -0.5]]
          .map(([x, z]) => box(0.35, 0.45, 0.35, x, y0 + 1.25, z, 0xc9352b)),       // the lanterns
      ]),
    };
  },
  'skiff-jp': () => {
    const hull = loft({ len: 7.0, beam: 1.7, depth: 0.65, bow: 1.2, stern: 0.9, sheer: 0.35, sternRise: 0.25, draft: 0.35,
      hull: 0x4a3a28, deck: 0x9a7a55, bulwark: 0.25 });
    const dk = hull.userData.deckAt;
    return {
      speed: [1.3, 2.3], scale: [0.85, 1.15], roll: 0.03, wake: 0.5,
      geo: merge([
        hull,
        spar([0.3, dk(-2.6) + 0.5, -2.6], [0.6, -0.3, -4.8], 0.04, 0x8a6a45),     // the sculling oar
        box(1.2, 0.06, 0.3, 0, dk(0.5) + 0.18, 0.5, 0x6b4a2e),
      ]),
    };
  },
  // ── The Klang: sampans under woven hoods, and the perahu with its lifted bow.
  'sampan': () => {
    const hull = loft({ len: 8.0, beam: 2.2, depth: 0.75, bow: 1.2, stern: 1.0, sheer: 0.45, sternRise: 0.45, draft: 0.35,
      hull: 0x5a4028, deck: 0x8a6a45, bulwark: 0.22 });
    const dk = hull.userData.deckAt;
    return {
      speed: [1.3, 2.4], scale: [0.85, 1.15], roll: 0.03, wake: 0.5,
      geo: merge([
        hull,
        arch(2.0, 3.6, dk(-0.5) + 0.2, 0, -0.5, 0xa88a5a, 0.7),
        spar([0.3, dk(-3) + 0.5, -3.0], [0.7, -0.3, -4.8], 0.04, 0x8a6a45),
      ]),
    };
  },
  'perahu': () => {
    const hull = loft({ len: 10.5, beam: 2.6, depth: 0.9, bow: 1.1, stern: 0.9, sheer: 0.95, sternRise: 0.5, draft: 0.35,
      hull: 0x1f7a8a, deck: 0xd9b866, stripe: 0xc9352b, boot: 0xe8e4d8, bottom: 0x2a2a2a, bulwark: 0.3 });
    const dk = hull.userData.deckAt;
    return {
      speed: [1.8, 3.2], scale: [0.85, 1.15], roll: 0.03, wake: 0.7,
      geo: merge([
        hull,
        box(0.25, 0.3, 1.6, 0, dk(4.4) + 0.5, 4.4, 0xc9352b),
        arch(1.8, 2.2, dk(-2) + 0.25, 0, -2.0, 0x3a6a3a, 0.6),
      ]),
    };
  },
  // ── The Creek: the abra water taxi and the dhow.
  'abra': () => {
    const hull = loft({ len: 9.5, beam: 3.0, depth: 1.0, bow: 1.4, stern: 0.4, sheer: 0.45, draft: 0.38,
      hull: TEAK, deck: 0xa07a50, stripe: 0xd9cfb6, bulwark: 0.3 });
    const y0 = hull.userData.deckAt(0);
    return {
      speed: [1.6, 2.8], scale: [0.9, 1.1], roll: 0.025, wake: 0.8,
      geo: merge([
        hull,
        ...[[-1.2, 2.5], [1.2, 2.5], [-1.2, -2.5], [1.2, -2.5], [-1.2, 0], [1.2, 0]].map(([x, z]) => box(0.12, 1.6, 0.12, x, y0 + 0.8, z, TEAK)),
        box(2.9, 0.12, 6.2, 0, y0 + 1.65, 0, 0xd9cfb6),
        box(2.4, 0.4, 5.0, 0, y0 + 0.2, 0, 0x8a6a45),                         // the long bench down the middle
      ]),
    };
  },
  'dhow': () => {
    const hull = loft({ len: 22, beam: 6.0, depth: 1.9, bow: 1.3, stern: 0.5, sheer: 0.7, sternRise: 1.5, draft: 0.45,
      hull: TEAK, deck: 0xa07a50, stripe: 0xd9cfb6, bottom: 0xe8e4d8, bulwark: 0.5 });
    const dk = hull.userData.deckAt;
    const foot = dk(2.0) + 1.0;
    return {
      speed: [1.8, 3.2], scale: [0.9, 1.15], roll: 0.02, wake: 1.0,
      geo: merge([
        hull,
        house({ w: 4.4, h: 1.5, d: 4.2, y: dk(-8), z: -8.0, wall: 0x9a7a55, roof: 0x6b4a2e, win: [0.4, 0.75], glass: 0x3a2a1c }),
        rails({ w: 4.6, d: 4.4, y: dk(-8) + 1.64, z: -8.0, h: 0.7, posts: 2, hex: 0x6b4a2e }),
        mast(0, 2.0, dk(2.0), 13, 0x5a4530, -0.15),
        spar([0, foot - 0.5, 9.5], [0, foot + 16, -8.5], 0.12, 0x5a4530),
        sail([[0.25, foot - 0.3, 9.0], [0.25, foot + 15.5, -8.0], [0.25, foot + 0.5, -6.0]], CREAM, 0.9),
        box(5.0, 0.6, 1.4, 0, dk(4) + 0.3, 4.0, 0x7a5a8a),                      // cargo under a cloth
        box(4.0, 0.7, 1.6, 0, dk(6.5) + 0.35, 6.5, 0x3a6a8a),
      ]),
    };
  },
  // ── Lhasa: the yak-hide coracle, which is round.
  'coracle': () => ({
    speed: [1.3, 1.9], scale: [0.9, 1.1], roll: 0.04, wake: 0.3,
    geo: merge([
      cyl(1.3, 1.1, 0.7, 0, 0.1, 0, 0x3a2a1c, 12),
      cyl(1.05, 1.05, 0.1, 0, 0.3, 0, 0x6b4a2e, 12),
      spar([0.4, 0.5, 0], [1.6, -0.2, -0.9], 0.04, 0x8a6a45),
    ]),
  }),
};

/** Every kind there is, for the contact sheet (tools/boatshot.mjs). */
export const CRAFT_KINDS = Object.keys(KINDS);

const cache = new Map();

/** The geometry and speeds for a kind, built once. Unknown kinds are a tug. */
export function buildCraft(kind) {
  if (!cache.has(kind)) {
    const make = KINDS[kind] || KINDS.tug;
    const k = make();
    k.roll ??= 0.02;
    k.wake ??= 1;
    k.geo.computeBoundingBox();
    k.len = k.geo.boundingBox.max.z - k.geo.boundingBox.min.z;
    k.beam = k.geo.boundingBox.max.x - k.geo.boundingBox.min.x;
    cache.set(kind, k);
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
  colosseum: [],
  towerbridge: ['thames-barge', 'thames-barge', 'thames-sail', 'tug'],
  florence: ['rowing'],
  segovia: [],
  atomium: [],
  tokyotower: [],
  budapest: ['river-cruise', 'river-cruise', 'peniche'],
  sagrada: [],
  edinburgh: [],
  neuschwanstein: ['rowing'],
  montstmichel: ['fishing', 'fishing'],
  pena: [],
  hassan: ['fishing', 'fishing', 'dhow'],
  kuwait: ['dhow', 'dhow', 'yacht'],
  karnak: ['felucca', 'felucca', 'river-cruise'],
  forbidden: ['rowing', 'rowing'],
  gyeongbok: [],
  watarun: ['sampan', 'sampan', 'ferry', 'country-boat'],
  shwedagon: ['sampan', 'rowing'],
  angkor: ['sampan'],
  borobudur: [],
  tikal: [],
  teotihuacan: [],
  machupicchu: ['country-boat'],
  greatwall: [],
};
