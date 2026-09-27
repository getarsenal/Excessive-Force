import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The landmark kit: a building written as a list of parts.
 *
 * The first forty-one landmarks were each written by hand, a module apiece,
 * and each one learned something the builder now knows. The catalogue after
 * them is built from those lessons rather than beside them: ten parts that
 * between them make a cathedral, a castle, a palace, a pagoda, a stupa, a
 * ziggurat, a temple, a gate, a television tower and a skyscraper, each part
 * laid by the rules the solver keeps (bonded courses, floors laid as courses
 * of the wall, ornament as relief, openings as masonry never laid), and each
 * part saying where its garrison stands.
 *
 * A spec is `{ S, mat, parts: [...] }`, every part in real metres about the
 * landmark's origin, +x east and +z south. The part types:
 *
 *   hall      a walled block of storeys: windows, floors, a flat, gabled or
 *             hipped roof. Naves, wings, palaces, keeps.
 *   tower     a square, polygonal or round tower, tapered or not, with a
 *             cap: spire, pyramid, cone, dome, onion, flat or none.
 *   dome      a drum and a dome on it, with a lantern.
 *   needle    a hollow round shaft with pods on it and a mast: the
 *             television towers.
 *   tiers     a pagoda: storeys stepping in, each with wide eaves.
 *   steps     solid terraces stepping in: a ziggurat, a stupa's plinth, a
 *             castle rock's revetment, a podium.
 *   colonnade a temple or a portico: podium, columns, entablature, roof.
 *   curtain   a castle's curtain wall round a closed outline, walk on top.
 *   arch      a gate: a block with an arch through it, attic on top.
 *   box       one solid block: a plinth, a pedestal, an attic.
 *
 * Every part may carry `y0` (the height it starts at, for stacking), `mat`,
 * and `tag` (its section, which is what the score counts); a part with
 * `base: true` is ground as far as the score is concerned.
 *
 * Stone is sized in the world, not in the model: 1.8 m at the high tier
 * whatever the scale, so a shell bites the same everywhere. A building that
 * would come out over the tier's stone budget is laid again in bigger stone
 * until it fits.
 */

const WORLD_STONE = 1.8;
const BUDGET_LOW = 5200;

/** Material names a spec may use. */
export const KIT_MATS = M;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Equal courses, never a sliver. */
function courses(y0, y1, nominal, fn) {
  if (y1 - y0 < 0.02) return;
  const n = Math.max(1, Math.round((y1 - y0) / nominal));
  const ch = (y1 - y0) / n;
  for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
}

/** `n` evenly spread picks out of 1..m-1 (the storeys that get a floor). */
function spread(m, n) {
  const out = [];
  if (m <= 1) return out;
  const want = Math.min(n, m - 1);
  for (let i = 0; i < want; i++) {
    const s = Math.round(((i + 1) * m) / (want + 1));
    if (s >= 1 && s < m && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Window centres along a face of half-length `half`: fixed by the spec, not the tier. */
function bays(half, win, bay, margin) {
  const room = half - margin - win / 2;
  // A face too narrow for a row still takes one window in its middle, with
  // a pier either side of it: an obelisk's slit.
  if (room < 0) return half >= win / 2 + 1.1 ? [0] : [];
  const n = Math.max(0, Math.floor((2 * room) / bay));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(n === 0 ? 0 : -room + (i * 2 * room) / n);
  return out;
}

const PROFILES = {
  round: (t) => Math.sqrt(Math.max(0, 1 - t * t)),
  cone: (t) => 1 - t,
  pointed: (t) => Math.pow(Math.max(0, 1 - t), 0.75),
  onion: (t) => (t < 0.38 ? 1 + 0.26 * Math.sin((t / 0.38) * Math.PI / 2) : 1.26 * Math.pow(Math.cos(((t - 0.38) / 0.62) * Math.PI / 2), 1.2)),
  bell: (t) => (t < 0.5 ? 1 - 0.18 * t : 0.91 * Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2))),
};

class Kit {
  constructor(spec, k) {
    this.spec = spec;
    this.S = spec.S;
    this.k = k;
    this.B = k.dry ? null : new BlockList();
    if (this.B) this.B.joint = JOINT / spec.S;
    this.posts = [];
    this.top = { y: 0, x: 0, z: 0 };
    this.bbox = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    this.tags = new Set();
    this.baseTags = new Set();
  }

  // ── bookkeeping ─────────────────────────────────────────────────────────
  post(kind, x, y, z, facing, extra = {}) { this.posts.push({ kind, x, y, z, facing, ...extra }); }
  reach(x, z, hx, hz) {
    const b = this.bbox;
    b.x0 = Math.min(b.x0, x - hx); b.x1 = Math.max(b.x1, x + hx);
    b.z0 = Math.min(b.z0, z - hz); b.z1 = Math.max(b.z1, z + hz);
  }
  peak(x, y, z) { if (y > this.top.y) this.top = { x, y, z }; }
  get stone() { return this.k.stone; }
  get course() { return this.k.course; }
  mat(p, key = 'mat') { return p[key] ?? this.spec[key] ?? this.spec.mat ?? M.LIMESTONE; }
  section(p, fn) {
    const tag = p.tag || p.t;
    (p.base ? this.baseTags : this.tags).add(tag);
    if (this.B) this.B.section(tag, fn); else fn();
  }

  // ── primitives that know the solver's rules ─────────────────────────────

  /** A solid rectangular course of coarse stone. */
  solid(cx, y, cz, w, h, d, mat, coarse = 1.6) {
    if (!this.B || w < 0.05 || d < 0.05) return;
    this.B.slab(cx, y + h / 2, cz, w, h, d, this.stone * coarse, mat);
  }

  /** A solid disc course, on a grid that does not change from course to course. */
  disc(cx, cz, y, h, R, mat, coarse = 1.3) {
    const B = this.B;
    if (!B) return;
    const pitch = this.stone * coarse;
    if (R < pitch * 1.2) { B.add(cx, y + h / 2, cz, Math.max(0.2, R * 0.8), B.shrink(h / 2), Math.max(0.2, R * 0.8), mat); return; }
    const n = Math.ceil(R / pitch) + 1;
    for (let i = -n; i < n; i++) {
      for (let j = -n; j < n; j++) {
        const px = (i + 0.5) * pitch, pz = (j + 0.5) * pitch;
        if (Math.hypot(px, pz) + pitch * 0.62 > R) continue;
        B.add(cx + px, y + h / 2, cz + pz, B.shrink(pitch / 2), B.shrink(h / 2), B.shrink(pitch / 2), mat);
      }
    }
  }

  /** One round course: a ring whose outer face is at R, `W` thick. */
  roundRing(cx, cz, y, h, R, W, c, mat, sides = 0) {
    const B = this.B;
    if (!B) return;
    const r = R - W / 2;
    const n = sides || Math.max(10, Math.round((2 * Math.PI * r) / this.stone));
    B.polyRing(cx, cz, BlockList.circle(r, n, (c % 2) * (Math.PI / n) + (sides ? Math.PI / n : 0)), W, y, h, this.stone, mat, 0);
  }

  /**
   * A cap on a tower or a roof on a hall: `kind` over a footprint `w` x `d`
   * (or radius `r` when round) from `y`. Hollow where it can be, so a roof
   * forty metres across is a few hundred stones and not a few thousand.
   */
  cap(kind, cx, cz, y, w, d, h, mat, round = false, axis = 'x', sides = 0) {
    const B = this.B;
    if (kind === 'none' || h <= 0.05) return y;
    const c = this.course;
    if (kind === 'flat') {
      if (B) {
        if (round) this.disc(cx, cz, y, h, w / 2, mat);
        else this.solid(cx, y, cz, w, h, d, mat);
      }
      this.peak(cx, y + h, cz);
      return y + h;
    }
    if (kind === 'spire' && !round) {
      if (B) B.spire(cx, cz, y, y + h, Math.min(w, d), Math.max(0.35, Math.min(w, d) * 0.06), c, this.stone, mat, 0.42);
      this.peak(cx, y + h, cz);
      return y + h;
    }
    if (round || kind === 'dome' || kind === 'onion' || kind === 'cone' || kind === 'spire' || kind === 'bell' || kind === 'pointed') {
      const prof = PROFILES[kind === 'dome' ? 'round' : kind === 'spire' ? 'cone' : kind] || PROFILES.round;
      const R = Math.min(w, d) / 2;
      const wall = clamp(R * 0.3, this.stone * 0.7, this.stone * 1.4);
      if (B) {
        courses(y, y + h, c * (kind === 'dome' || kind === 'onion' || kind === 'bell' ? 0.6 : 1), (yy, ch, k) => {
          const t = (yy + ch / 2 - y) / h;
          const r = R * prof(t);
          if (r <= wall * 1.1 || r < this.stone * 0.9) {
            const s = Math.max(r * 1.5, Math.min(this.stone * 0.8, R * 0.5));
            B.add(cx, yy + ch / 2, cz, s / 2, B.shrink(ch / 2), s / 2, mat);
          } else {
            this.roundRing(cx, cz, yy, ch, r, wall, k, mat, sides);
          }
        });
      }
      this.peak(cx, y + h, cz);
      return y + h;
    }
    // pyramid, hip, gable: hollow rings stepping in, the top closed solid.
    // Each ring is thicker than the step to the next, by most of a stone, so
    // the course above always lands on it: a hip over a wide wing that
    // stepped in faster than its ring was thick laid its upper courses on
    // nothing, and the solver threw them away.
    const n = Math.max(1, Math.round(h / c));
    const ch = h / n;
    const t0 = Math.max(this.stone * 0.9, 0.8);
    const tip = this.stone * 0.5;
    const shrinkW = kind === 'gable' && axis === 'x' ? 0 : (w - tip) / n / 2;
    const shrinkD = kind === 'gable' && axis === 'z' ? 0 : (d - tip) / n / 2;
    const t = Math.max(t0, Math.max(shrinkW, shrinkD) + this.stone * 0.7);
    for (let i = 0; i < n; i++) {
      // `axis` is the ridge: a gable keeps its length along it.
      const ww = Math.max(t0, w - 2 * shrinkW * i);
      const dd = Math.max(t0, d - 2 * shrinkD * i);
      if (!B) continue;
      if (Math.min(ww, dd) <= t * 2.2) this.solid(cx, y + i * ch, cz, ww, ch, dd, mat, 1.2);
      else B.ring(cx, cz, ww, dd, t, y + i * ch, ch, this.stone * 1.2, mat, i % 2);
    }
    this.peak(cx, y + h, cz);
    return y + h;
  }

  /**
   * The walls of a storeyed block, square or round, with its windows, its
   * floors and the posts at them. Returns the height of its top.
   */
  walls(p, { cx, cz, w, d, y0, h, wall, mat, round = false, sides = 0, taper = 1 }) {
    const B = this.B;
    const S = this.S;
    const storeyH = p.storey || Math.max(5.2, 5.6 / S);
    const nSt = Math.max(1, Math.round(h / storeyH));
    const sh = h / nSt;
    const win = p.win ?? Math.max(1.8, 3.0 / S);
    const winH = Math.min(p.winH ?? Math.max(3.0, 3.6 / S), sh * 0.62);
    const margin = win / 2 + Math.max(2.4, 6.0 / S);
    const bay = p.bay ?? Math.max(4.8, win + 6.0 / S);
    const floorsAt = p.floors === 0 || p.windows === false ? [] : spread(nSt, p.floors ?? 3);
    const lines = [];
    for (let i = 0; i < nSt; i++) lines.push(y0 + i * sh);
    const trim = p.trim ?? null;
    const ft = Math.min(1.0, sh * 0.22);

    // Width at height y, for a tapered block.
    const wAt = (y) => w * (1 - (1 - taper) * ((y - y0) / h));
    const dAt = (y) => d * (1 - (1 - taper) * ((y - y0) / h));

    // Window centres per face, the same at every tier.
    const alongX = bays(w / 2 * (0.5 + taper / 2), win, bay, margin);
    const alongZ = bays(d / 2 * (0.5 + taper / 2), win, bay, margin);
    const angles = round ? roundAngles(w, bay) : [];
    // Where each storey's window row starts: over the floor course where
    // there is one, a sill's height up where there is not, and a door's
    // height from the ground on the ground floor.
    const sill = (i) => (i === 0 ? y0 : floorsAt.includes(i) ? lines[i] + ft : lines[i] + Math.min(0.9, sh * 0.2));
    const inWindow = (x, y, z) => {
      if (p.windows === false) return false;
      let row = false;
      for (let i = 0; i < nSt; i++) {
        const a = sill(i);
        if (y > a && y < a + (i === 0 && !p.floorBelow ? Math.min(winH, 3.2) : winH)) { row = true; break; }
      }
      if (!row) return false;
      const ww = wAt(y), dd = dAt(y);
      if (round) {
        const r = Math.hypot(x - cx, z - cz);
        if (r < ww / 2 - wall - 0.3) return false;
        const a = Math.atan2(z - cz, x - cx);
        for (const b of angles) {
          let da = Math.abs(a - b) % (Math.PI * 2);
          if (da > Math.PI) da = Math.PI * 2 - da;
          if (da * r < win / 2) return true;
        }
        return false;
      }
      const onZ = Math.abs(z - cz) > dd / 2 - wall - 0.2, onX = Math.abs(x - cx) > ww / 2 - wall - 0.2;
      if (onZ === onX) return false;                     // interior, or a corner
      const along = onZ ? x - cx : z - cz;
      const list = onZ ? alongX : alongZ;
      const faceHalf = onZ ? ww / 2 : dd / 2;
      const slit = list.length === 1 && list[0] === 0;
      if (!slit && Math.abs(along) > faceHalf - Math.max(margin - win / 2, this.stone * 1.5)) return false;
      for (const c of list) if (Math.abs(along - c) < win / 2) return true;
      return false;
    };

    // Columns under a wide floor. A slab spans five metres from what bears
    // it and no further, and a hall seventy metres across with three floors
    // in it was three plates hanging from their edges: the solver let them
    // go. A grid of piers ten metres apart in the world is what carries a
    // real one.
    const piers = [];
    if (!round && (floorsAt.length || p.roof === 'flat' || p.roof === undefined)) {
      const P = 10 / S;
      const iw = w * taper - 2 * wall, id = d * taper - 2 * wall;
      const nx = Math.floor(iw / P), nz = Math.floor(id / P);
      if (iw > P * 1.1 || id > P * 1.1) {
        for (let i = 1; i <= nx; i++) for (let j = 1; j <= Math.max(1, nz); j++) {
          if (nz === 0 && j > 1) continue;
          piers.push([cx - iw / 2 + (i * iw) / (nx + 1), nz ? cz - id / 2 + (j * id) / (nz + 1) : cz]);
        }
        if (nx === 0) for (let j = 1; j <= nz; j++) piers.push([cx, cz - id / 2 + (j * id) / (nz + 1)]);
      }
    }
    const pw = Math.max(1.0, this.stone * 0.7);
    const pierCourse = (yy, ch) => {
      for (const [px, pz] of piers) B.add(px, yy + ch / 2, pz, B.shrink(pw / 2), B.shrink(ch / 2), B.shrink(pw / 2), p.floorMat ?? mat);
    };
    if (B) {
      B.openings(inWindow, () => {
        for (let i = 0; i < nSt; i++) {
          const a = lines[i], b = i === nSt - 1 ? y0 + h : lines[i + 1];
          const floor = floorsAt.includes(i);
          const start = floor ? a + ft : a;
          if (floor) {
            // The floor: a course of the wall, the room filled across.
            const ww = wAt(a), dd = dAt(a);
            if (round) {
              this.roundRing(cx, cz, a, ft, ww / 2, wall, i, mat, sides);
              this.disc(cx, cz, a, ft, ww / 2 - wall - 0.12, p.floorMat ?? mat, 1.5);
            } else {
              B.ring(cx, cz, ww, dd, wall, a, ft, this.stone, mat, i % 2);
              this.solid(cx, a, cz, ww - 2 * wall - 0.24, ft, dd - 2 * wall - 0.24, p.floorMat ?? mat, 1.7);
            }
          }
          if (piers.length) courses(start, b, this.course, (yy, ch) => pierCourse(yy, ch));
          courses(start, b, this.course, (yy, ch, c) => {
            const ww = wAt(yy), dd = dAt(yy);
            const last = i === nSt - 1 && yy + ch >= y0 + h - 0.01;
            const m = last && trim != null ? trim : mat;
            if (round) this.roundRing(cx, cz, yy, ch, ww / 2, wall, c + i, m, sides);
            else B.ring(cx, cz, ww, dd, wall, yy, ch, this.stone, m, (c + i) % 2, last ? () => 0.18 : null);
          });
        }
      });
    }

    // Posts: a man in each of a few windows of each floor, facing out.
    const postAt = floorsAt.map((i) => lines[i] + ft);
    if (p.floorBelow && p.windows !== false) postAt.unshift(y0);
    for (const y of postAt) {
      const ww = wAt(y), dd = dAt(y);
      const high = y * S > 45;
      if (round) {
        const r = ww / 2 - wall / 2;
        angles.forEach((a, j) => {
          if (j % 2 && angles.length > 3) return;
          this.post('window', cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, Math.atan2(Math.cos(a), Math.sin(a)), { high });
        });
        continue;
      }
      const pick = (list) => (list.length <= 2 ? list : [list[Math.floor(list.length * 0.25)], list[Math.floor(list.length * 0.75)]]);
      for (const sz of [-1, 1]) {
        for (const c of pick(alongX)) this.post('window', cx + c, y, cz + sz * (dd / 2 - wall / 2), sz > 0 ? 0 : Math.PI, { high });
      }
      for (const sx of [-1, 1]) {
        for (const c of pick(alongZ).slice(0, 1)) this.post('window', cx + sx * (ww / 2 - wall / 2), y, cz + c, sx > 0 ? Math.PI / 2 : -Math.PI / 2, { high });
      }
    }
    this.peak(cx, y0 + h, cz);
    return y0 + h;
  }

  /** Ground posts round a footprint: a few metres out, facing away. */
  groundRing(cx, cz, w, d, round = false) {
    const off = 3.5 / Math.max(1, this.S * 0.6);
    if (round) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const r = w / 2 + off;
        this.post('ground', cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r, Math.atan2(Math.cos(a), Math.sin(a)));
      }
      return;
    }
    for (const sz of [-1, 1]) this.post('ground', cx + (sz * w) / 5, 0, cz + sz * (d / 2 + off), sz > 0 ? 0 : Math.PI);
    for (const sx of [-1, 1]) this.post('ground', cx + sx * (w / 2 + off), 0, cz - (sx * d) / 5, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  /** Roof posts at the edges of a flat top, facing out. */
  roofRing(cx, cz, y, w, d, round = false) {
    const inset = Math.min(1.2, Math.min(w, d) * 0.15);
    const high = y * this.S > 45;
    if (round) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        const r = w / 2 - inset;
        this.post('roof', cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, Math.atan2(Math.cos(a), Math.sin(a)), { high });
      }
      return;
    }
    this.post('roof', cx, y, cz + d / 2 - inset, 0, { high });
    this.post('roof', cx, y, cz - d / 2 + inset, Math.PI, { high });
    this.post('roof', cx + w / 2 - inset, y, cz, Math.PI / 2, { high });
    this.post('roof', cx - w / 2 + inset, y, cz, -Math.PI / 2, { high });
  }

  // ── the parts ───────────────────────────────────────────────────────────

  hall(p) {
    const cx = p.x ?? 0, cz = p.z ?? 0, y0 = p.y0 ?? 0;
    const w = p.w, d = p.d, h = p.h;
    const wall = p.wall ?? 1.1;
    const mat = this.mat(p);
    this.reach(cx, cz, w / 2, d / 2);
    this.section(p, () => {
      const top = this.walls(p, { cx, cz, w, d, y0, h, wall, mat });
      const roof = p.roof ?? 'flat';
      const roofMat = p.roofMat ?? this.spec.roofMat ?? M.SLATE;
      const rh = p.roofH ?? (roof === 'flat' ? 0.8 : Math.min(w, d) * 0.38);
      const axis = p.axis ?? (w >= d ? 'x' : 'z');
      const eave = roof === 'flat' ? 0 : (p.eave ?? 0);
      this.cap(roof, cx, cz, top, w + 2 * eave, d + 2 * eave, rh, roof === 'flat' ? (p.roofMat ?? mat) : roofMat, false, axis);
      if (roof === 'flat' && p.roofPosts !== false) this.roofRing(cx, cz, top + rh, w, d);
      this.peak(cx, top + rh, cz);
    });
    if (y0 < 1 && p.ground !== false) this.groundRing(cx, cz, w, d);
  }

  tower(p) {
    const cx = p.x ?? 0, cz = p.z ?? 0, y0 = p.y0 ?? 0;
    const w = p.w, d = p.d ?? p.w, h = p.h;
    const round = !!p.round || !!p.sides;
    const wall = p.wall ?? clamp(w * 0.16, 0.9, 3.0);
    const mat = this.mat(p);
    const taper = p.taper ?? 1;
    this.reach(cx, cz, w / 2, d / 2);
    if (Math.min(w, d) < this.k.stoneLow * 2.4) {
      // Too thin to be hollow at the coarsest tier: a solid shaft, capped.
      this.section(p, () => {
        if (this.B) {
          courses(y0, y0 + h, this.course, (yy, ch) => {
            const f = (yy - y0) / h, ww = w * (1 - (1 - taper) * f), dd = d * (1 - (1 - taper) * f);
            if (round) this.disc(cx, cz, yy, ch, ww / 2 + 0.3, mat, 1.0);
            else this.solid(cx, yy, cz, ww, ch, dd, mat, 1.0);
          });
        }
        this.peak(cx, y0 + h, cz);
        const cap = p.cap ?? 'flat';
        this.cap(cap, cx, cz, y0 + h, w * taper, d * taper, p.capH ?? w * 0.9, p.capMat ?? (cap === 'flat' ? mat : this.spec.roofMat ?? M.SLATE), round);
      });
      return;
    }
    this.section(p, () => {
      const hole = p.hole ? this.holeOf(p, cx, cz, y0, h) : null;
      const top = hole
        ? this.withHole(hole, () => this.walls({ storey: Math.max(6, 6 / this.S), floors: 2, ...p }, { cx, cz, w, d, y0, h, wall, mat, round, sides: p.sides || 0, taper }))
        : this.walls({ storey: Math.max(6, 6 / this.S), floors: 2, ...p }, { cx, cz, w, d, y0, h, wall, mat, round, sides: p.sides || 0, taper });
      const tw = w * taper, td = d * taper;
      const cap = p.cap ?? 'flat';
      const capMat = p.capMat ?? (cap === 'flat' ? mat : this.spec.roofMat ?? M.SLATE);
      const capW = p.capW ?? tw;
      const ch = p.capH ?? (cap === 'flat' ? 0.8 : cap === 'spire' ? tw * 3 : tw * 0.9);
      let base = top;
      if (p.capW && p.capW < Math.min(tw, td) * 0.9 && cap !== 'flat' && cap !== 'none') {
        // A gallery: the tower closed over with a floor, the cap standing
        // back from its edge, and men on the ledge between.
        const LT = 1.0;
        this.cap('flat', cx, cz, top, tw, td, LT, mat, round);
        base = top + LT;
        if (p.roofPosts !== false) this.roofRing(cx, cz, base, tw, td, round);
      }
      const y1 = this.cap(cap, cx, cz, base, capW, p.capW ?? td, ch, capMat, round, 'x', p.sides || 0);
      if (cap === 'flat' && p.roofPosts !== false) this.roofRing(cx, cz, top + ch, capW, p.capW ?? td, round);
      if (p.finial) {
        const f = p.finial;
        this.cap(f.cap ?? 'spire', cx, cz, y1, f.w ?? tw * 0.3, f.w ?? tw * 0.3, f.h, f.mat ?? M.GOLD, f.round ?? round, 'x');
      }
    });
    if (y0 < 1 && p.ground !== false) this.groundRing(cx, cz, w, d, round);
  }

  /**
   * A hole through the top of a tower: a parabola, widest at the top, cut
   * through the whole depth along z. The Kingdom Centre's.
   */
  holeOf(p, cx, cz, y0, h) {
    const H = p.hole;
    const yTop = y0 + h, yB = H.y;
    return (x, y) => {
      if (y < yB) return false;
      const f = Math.sqrt(Math.max(0, (y - yB) / Math.max(1, yTop - yB)));
      return Math.abs(x - cx) < (H.w / 2) * f;
    };
  }

  withHole(pred, fn) {
    if (!this.B) return fn();
    let out;
    this.B.openings(pred, () => { out = fn(); });
    return out;
  }

  dome(p) {
    const cx = p.x ?? 0, cz = p.z ?? 0, y0 = p.y0 ?? 0;
    const r = p.r, drumH = p.drumH ?? r * 0.5;
    const wall = p.wall ?? clamp(r * 0.14, 0.9, 2.6);
    const mat = this.mat(p);
    this.reach(cx, cz, r, r);
    this.section(p, () => {
      let y = y0;
      if (drumH > 0.1) {
        y = this.walls({ storey: Math.max(drumH, 4), floors: 0, win: 1.4, ...p, windows: p.windows ?? true },
          { cx, cz, w: 2 * r, d: 2 * r, y0, h: drumH, wall, mat, round: true });
      }
      const dh = p.h ?? r * 0.95;
      const domeMat = p.domeMat ?? this.spec.domeMat ?? mat;
      if (this.B) {
        this.B.dome(cx, cz, y, dh, r - wall / 2, wall, this.course * 0.6, this.stone, domeMat, PROFILES[p.profile ?? 'round']);
      }
      y += dh;
      this.peak(cx, y, cz);
      if (p.lantern !== false) {
        const lr = p.lanternR ?? Math.max(1.2, r * 0.16);
        const lh = p.lanternH ?? lr * 2.4;
        this.cap(p.lanternCap ?? 'cone', cx, cz, y - this.course * 0.3, lr * 2, lr * 2, lh, p.lanternMat ?? M.GOLD, true);
      }
    });
    if (y0 < 1) this.groundRing(cx, cz, 2 * r, 2 * r, true);
  }

  /** A television tower: shaft, pods, mast. */
  needle(p) {
    const cx = p.x ?? 0, cz = p.z ?? 0, y0 = p.y0 ?? 0;
    const r0 = p.r0, r1 = p.r1 ?? p.r0 * 0.6, h = p.h;
    const mat = this.mat(p);
    const podMat = p.podMat ?? this.spec.podMat ?? M.CONCRETE;
    const pods = (p.pods || []).slice().sort((a, b) => a.y - b.y);
    const rAt = (y) => r0 + (r1 - r0) * clamp((y - y0) / h, 0, 1);
    this.reach(cx, cz, Math.max(r0, ...pods.map((q) => q.r)), Math.max(r0, ...pods.map((q) => q.r)));
    this.section(p, () => {
      const c = this.course;
      const B = this.B;
      // Where each pod's flare starts: the shaft steps out to it by less
      // than a stone a course, so every course stands on the one below.
      const bands = pods.map((q) => {
        const flare = Math.max(1, Math.ceil((q.r - rAt(q.y)) / (this.stone * 0.7)));
        return { ...q, y0: q.y - flare * c, y1: q.y + q.h, flare };
      });
      let y = y0;
      let idx = 0;
      for (const b of bands) {
        // The shaft up to the flare.
        courses(y, b.y0, c, (yy, ch, k) => {
          const R = rAt(yy);
          const W = clamp(R * 0.4, 0.8, 3.0);
          if (R < W * 1.4) this.disc(cx, cz, yy, ch, R, mat); else this.roundRing(cx, cz, yy, ch, R, W, k, mat);
        });
        // The flare: rings stepping out, closing to a solid floor at the top.
        const n = b.flare;
        for (let i = 0; i < n; i++) {
          const yy = b.y0 + i * c;
          const R = rAt(yy) + ((b.r - rAt(yy)) * (i + 1)) / n;
          const W = Math.min(R, this.stone * 0.8 + ((b.r - rAt(yy)) / n) * 1.3 + 0.6);
          if (i === n - 1) this.disc(cx, cz, yy, c, R, podMat);
          else this.roundRing(cx, cz, yy, c, R, Math.min(W, R), i, podMat);
        }
        // The pod: its wall with windows, and a solid roof.
        const RT = Math.min(1.0, b.h * 0.25);
        const podTop = this.walls({ storey: b.h, floors: 0, win: 1.6, winH: Math.min(2.4, b.h * 0.5), windows: true, floorBelow: true },
          { cx, cz, w: 2 * b.r, d: 2 * b.r, y0: b.y, h: b.h - RT, wall: clamp(b.r * 0.2, 1.0, 2.2), mat: podMat, round: true });
        this.disc(cx, cz, podTop, RT, b.r, podMat);
        this.post('roof', cx, podTop + RT, cz + b.r - 1.2, 0, { high: true });
        this.post('roof', cx, podTop + RT, cz - b.r + 1.2, Math.PI, { high: true });
        // Back in to the shaft over the top.
        y = podTop + RT;
        const back = Math.max(1, Math.ceil((b.r - rAt(y)) / (this.stone * 0.9)));
        for (let i = 0; i < back && B; i++) {
          const R = b.r - ((b.r - rAt(y)) * (i + 1)) / (back + 1);
          this.disc(cx, cz, y + i * c, c, R, podMat);
        }
        y += back * c;
        idx++;
      }
      courses(y, y0 + h, c, (yy, ch, k) => {
        const R = rAt(yy);
        const W = clamp(R * 0.4, 0.8, 3.0);
        if (R < W * 1.4) this.disc(cx, cz, yy, ch, R, mat); else this.roundRing(cx, cz, yy, ch, R, W, k, mat);
      });
      let top = y0 + h;
      if (p.mast) {
        const mw = Math.max(0.6, r1 * 0.5);
        this.cap('spire', cx, cz, top, mw * 2, mw * 2, p.mast, p.mastMat ?? M.MAST, false);
        top += p.mast;
      }
      if (p.ball) {
        // A ball on the top: the Bayterek's.
        const R = p.ball;
        const yb = top;
        courses(yb, yb + 2 * R, c * 0.7, (yy, ch, k) => {
          const t = (yy + ch / 2 - yb - R) / R;
          const rr = Math.max(r1, R * Math.sqrt(Math.max(0, 1 - t * t)));
          this.roundRing(cx, cz, yy, ch, rr, Math.min(rr, clamp(R * 0.3, 1.0, 2.6)), k, p.ballMat ?? M.GOLD);
          if (rr > 3.2) this.disc(cx, cz, yy, ch, rr - clamp(R * 0.3, 1.0, 2.6) - 0.12, podMat);
        });
        this.post('roof', cx, yb + R, cz + R - 1.2, 0, { high: true });
        top = yb + 2 * R;
      }
      this.peak(cx, top, cz);
    });
    this.groundRing(cx, cz, 2 * r0, 2 * r0, true);
  }

  /** A pagoda: storeys stepping in, each with its eaves. */
  tiers(p) {
    const cx = p.x ?? 0, cz = p.z ?? 0;
    let y = p.y0 ?? 0;
    const n = p.n, w0 = p.w, w1 = p.wTop ?? p.w * 0.45;
    const d0 = p.d ?? p.w, d1 = (p.wTop ?? p.w * 0.45) * (d0 / w0);
    const h0 = p.h0 ?? 5.5, hk = p.hk ?? 4.4;
    const eave = p.eave ?? 1.6;
    const mat = this.mat(p);
    const roofMat = p.roofMat ?? this.spec.roofMat ?? M.SLATE;
    const wall = p.wall ?? 0.9;
    this.reach(cx, cz, w0 / 2 + eave, d0 / 2 + eave);
    this.section(p, () => {
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : i / (n - 1);
        const w = w0 + (w1 - w0) * f, d = d0 + (d1 - d0) * f;
        const h = i === 0 ? h0 : hk;
        const top = this.walls({ storey: h, floors: 0, win: p.win ?? 1.6, winH: Math.min(2.4, h * 0.5), windows: p.windows ?? true, floorBelow: i > 0 },
          { cx, cz, w, d, y0: y, h, wall, mat, round: !!p.round, sides: p.sides || 0 });
        // Eaves and ridge: the floor of the storey above.
        const rt = 1.1;
        if (this.B) {
          if (p.round || p.sides) {
            this.disc(cx, cz, top, rt * 0.6, w / 2 + eave, roofMat);
            this.disc(cx, cz, top + rt * 0.6, rt * 0.4, w / 2 + eave * 0.3, roofMat);
          } else {
            this.solid(cx, top, cz, w + 2 * eave, rt * 0.6, d + 2 * eave, roofMat, 1.5);
            this.solid(cx, top + rt * 0.6, cz, w + eave * 0.6, rt * 0.4, d + eave * 0.6, roofMat, 1.5);
          }
        }
        y = top + rt;
      }
      if (p.cap) this.cap(p.cap, cx, cz, y, w1 * 0.8, d1 * 0.8, p.capH ?? w1, p.capMat ?? roofMat, !!p.round);
      else if (p.roofPosts !== false) this.roofRing(cx, cz, y, w1 + eave * 0.6, d1 + eave * 0.6, !!p.round);
      if (p.finial) this.cap('spire', cx, cz, y + (p.cap ? p.capH ?? w1 : 0), p.finial.w ?? 1.2, p.finial.w ?? 1.2, p.finial.h, p.finial.mat ?? M.GOLD, false);
      this.peak(cx, y + (p.capH ?? 0) + (p.finial?.h ?? 0), cz);
    });
    if ((p.y0 ?? 0) < 1) this.groundRing(cx, cz, w0 + 2 * eave, d0 + 2 * eave, !!p.round);
  }

  /** Solid terraces stepping in, each `h / n` high. Posts on each terrace. */
  steps(p) {
    const cx = p.x ?? 0, cz = p.z ?? 0, y0 = p.y0 ?? 0;
    const n = p.n ?? 1;
    const w0 = p.w, d0 = p.d ?? p.w;
    const w1 = p.wTop ?? (n === 1 ? w0 : w0 * 0.5), d1 = p.dTop ?? (n === 1 ? d0 : (d0 * w1) / w0);
    const round = !!p.round;
    const mat = this.mat(p);
    const sh = p.h / n;
    this.reach(cx, cz, w0 / 2, d0 / 2);
    this.section(p, () => {
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : i / (n - 1);
        const w = w0 + (w1 - w0) * f, d = d0 + (d1 - d0) * f;
        const yA = y0 + i * sh;
        const m = p.mats ? p.mats[i % p.mats.length] : mat;
        const batter = p.batter ?? 0;
        courses(yA, yA + sh, this.course * (p.coarse ?? 1.5), (yy, ch) => {
          const down = yA + sh - (yy + ch / 2);
          const ww = w + 2 * batter * down, dd = d + 2 * batter * down;
          if (round) this.disc(cx, cz, yy, ch, ww / 2, m, p.coarse ?? 1.8);
          else this.solid(cx, yy, cz, ww, ch, dd, m, p.coarse ?? 2.2);
        });
        // A post on the terrace edge, where the next step leaves room.
        const next = i + 1 < n ? (w0 + (w1 - w0) * ((i + 1) / (n - 1))) : 0;
        const room = (w - next) / 2;
        if (p.posts !== false && (room > 1.2 || i === n - 1)) {
          const top = yA + sh;
          const inset = Math.min(1.0, room * 0.4) || 1.0;
          if (round) {
            const a = 0.4 + i * 1.3;
            this.post('roof', cx + Math.cos(a) * (w / 2 - inset), top, cz + Math.sin(a) * (w / 2 - inset), Math.atan2(Math.cos(a), Math.sin(a)));
          } else {
            const side = i % 4;
            const fx = [0, 1, 0, -1][side], fz = [1, 0, -1, 0][side];
            this.post('roof', cx + fx * (w / 2 - inset), top, cz + fz * (d / 2 - inset), Math.atan2(fx, fz));
            if (i === n - 1 || n === 1) this.post('roof', cx - fx * (w / 2 - inset), top, cz - fz * (d / 2 - inset), Math.atan2(-fx, -fz));
          }
        }
      }
      this.peak(cx, y0 + p.h, cz);
    });
    if (y0 < 1 && p.ground !== false) this.groundRing(cx, cz, w0, d0, round);
  }

  /** One solid block. */
  box(p) {
    this.steps({ n: 1, posts: p.posts ?? false, ground: false, ...p });
  }

  /** A temple or portico: podium, columns, entablature, roof. */
  colonnade(p) {
    const cx = p.x ?? 0, cz = p.z ?? 0;
    const y0 = p.y0 ?? 0;
    const w = p.w, d = p.d;
    const podH = p.podH ?? 1.5;
    const colH = p.colH;
    const colW = p.colW ?? 1.8;
    const bay = p.bay ?? colW * 2.4;
    const ent = p.entH ?? Math.max(1.6, colW * 1.1);
    const mat = this.mat(p);
    const colMat = p.colMat ?? mat;
    const inset = colW * 0.8;
    const xs = [], zs = [];
    const nx = Math.max(1, Math.round((w - 2 * inset) / bay)), nz = Math.max(1, Math.round((d - 2 * inset) / bay));
    for (let i = 0; i <= nx; i++) xs.push(cx - w / 2 + inset + (i * (w - 2 * inset)) / nx);
    for (let j = 0; j <= nz; j++) zs.push(cz - d / 2 + inset + (j * (d - 2 * inset)) / nz);
    const cols = [];
    const rows = p.rows ?? 'ring';
    for (const x of xs) for (const z of zs) {
      const edge = x === xs[0] || x === xs[xs.length - 1] || z === zs[0] || z === zs[zs.length - 1];
      if (rows === 'ring' && !edge) continue;
      if (rows === 'front' && !(z === zs[zs.length - 1])) continue;
      if (rows === 'twin' && !(z === zs[0] || z === zs[zs.length - 1])) continue;
      cols.push([x, z]);
    }
    this.reach(cx, cz, w / 2, d / 2);
    this.section(p, () => {
      const B = this.B;
      const yc0 = y0 + podH;
      if (B) {
        if (podH > 0.05) courses(y0, yc0, this.course * 1.4, (yy, ch) => this.solid(cx, yy, cz, w + 1.2, ch, d + 1.2, p.podMat ?? mat, 2.0));
        courses(yc0, yc0 + colH, this.course, (yy, ch, c) => {
          for (const [x, z] of cols) {
            if (p.round !== false) this.roundColumn(x, z, yy, ch, colW / 2, colMat);
            else B.add(x, yy + ch / 2, z, B.shrink(colW / 2), B.shrink(ch / 2), B.shrink(colW / 2), colMat);
          }
          if (p.cella) {
            const cw = p.cella.w, cd = p.cella.d;
            B.ring(cx, cz + (p.cella.z ?? 0), cw, cd, p.cella.wall ?? 1.2, yy, ch, this.stone, mat, c % 2);
          }
        });
        // The entablature: a ring over the column lines, laid in flat
        // stones that reach from one column to the next.
        const ew = xs[xs.length - 1] - xs[0] + colW, ed = zs[zs.length - 1] - zs[0] + colW;
        courses(yc0 + colH, yc0 + colH + ent, this.course * 0.8, (yy, ch, c) => {
          if (rows === 'ring') B.ring(cx, cz, ew, ed, colW * 1.1, yy, ch, Math.max(this.stone, bay * 0.5), p.entMat ?? mat, c % 2);
          else if (rows === 'front') this.solid(cx, yy, zs[zs.length - 1], ew, ch, colW * 1.2, p.entMat ?? mat, Math.max(1.2, bay * 0.5 / this.stone));
          else this.solid(cx, yy, cz, ew, ch, ed, p.entMat ?? mat, Math.max(1.2, bay * 0.5 / this.stone));
        });
      }
      const top = yc0 + colH + ent;
      const roof = p.roof ?? 'flat';
      const rh = p.roofH ?? (roof === 'flat' ? 0.8 : d * 0.18);
      const ew = xs[xs.length - 1] - xs[0] + colW, ed = zs[zs.length - 1] - zs[0] + colW;
      const edd = rows === 'front' ? colW * 1.2 : ed;
      this.cap(roof, cx, rows === 'front' ? zs[zs.length - 1] : cz, top, ew, edd, rh, p.roofMat ?? mat, false, p.axis ?? (w >= d ? 'x' : 'z'));
      if (roof === 'flat' && rows !== 'front') this.roofRing(cx, cz, top + rh, ew, edd);
      if (p.attic) this.cap('flat', cx, cz, top + rh, ew * 0.4, edd * 0.8, p.attic, p.atticMat ?? mat);
      this.peak(cx, top + rh + (p.attic ?? 0), cz);
      // Men between the columns, facing out, under cover.
      const front = zs[zs.length - 1];
      for (let i = 0; i < xs.length - 1; i += Math.max(1, Math.floor(xs.length / 4))) {
        this.post('arcade', (xs[i] + xs[i + 1]) / 2, yc0, front - colW * 0.2, 0);
      }
      if (rows !== 'front') {
        const back = zs[0];
        for (let i = 0; i < xs.length - 1; i += Math.max(1, Math.floor(xs.length / 3))) {
          this.post('arcade', (xs[i] + xs[i + 1]) / 2, yc0, back + colW * 0.2, Math.PI);
        }
      }
    });
    if (y0 < 1) this.groundRing(cx, cz, w, d);
  }

  /** A round column course: a small solid disc, or one stone when thin. */
  roundColumn(x, z, y, h, r, mat) {
    const B = this.B;
    if (r * 2 < this.stone * 1.7) {
      // Octagonal read at a distance: two crossed stones.
      B.add(x, y + h / 2, z, B.shrink(r), B.shrink(h / 2), B.shrink(r), mat, 0);
      return;
    }
    this.disc(x, z, y, h, r, mat, 1.0);
  }

  /** A curtain wall round a closed outline, with towers at its corners. */
  curtain(p) {
    const pts = p.pts;
    const h = p.h, thick = p.thick ?? 2.6;
    const y0 = p.y0 ?? 0;
    const mat = this.mat(p);
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x / pts.length; cz += z / pts.length; }
    for (const [x, z] of pts) this.reach(x, z, thick, thick);
    this.section(p, () => {
      if (this.B) {
        courses(y0, y0 + h, this.course, (yy, ch, c) => {
          this.B.polyRing(0, 0, pts, thick, yy, ch, this.stone, c === Math.round(h / this.course) - 1 && p.trim != null ? p.trim : mat, c % 2);
        });
      }
      // The wall walk: a post at the middle of each run, facing out.
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        let nx = mx - cx, nz = mz - cz;
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 12) return;
        this.post('roof', mx, y0 + h, mz, Math.atan2(nx, nz));
        this.post('ground', mx + (nx / Math.hypot(nx, nz)) * 4, 0, mz + (nz / Math.hypot(nx, nz)) * 4, Math.atan2(nx, nz));
      });
      this.peak(cx, y0 + h, cz);
    });
    if (p.towers) {
      pts.forEach(([x, z], i) => {
        this.tower({ tag: p.towerTag ?? `${p.tag || 'curtain'}towers`, x, z, ground: false, ...p.towers, y0, floors: 1 });
      });
    }
  }

  /** A gate: a block with an arch through it, and an attic over the arch. */
  arch(p) {
    const cx = p.x ?? 0, cz = p.z ?? 0, y0 = p.y0 ?? 0;
    const w = p.w, d = p.d, h = p.h;
    const span = p.span, spring = p.spring ?? h * 0.4;
    const axis = p.axis ?? 'z';                 // the passage runs along z: the arch is in the x-y plane
    const mat = this.mat(p);
    const pointed = !!p.pointed;
    const wall = p.wall ?? Math.min(w, d) * 0.3;
    this.reach(cx, cz, w / 2, d / 2);
    const inArch = (x, y, z) => {
      const along = axis === 'z' ? x - cx : z - cz;
      const perp = axis === 'z' ? z - cz : x - cx;
      const depth = axis === 'z' ? d : w;
      if (Math.abs(perp) > depth / 2 + 0.5) return false;
      if (y < y0 - 0.1) return false;
      const r = span / 2;
      if (Math.abs(along) > r) return false;
      if (y < y0 + spring) return true;
      const dy = y - (y0 + spring);
      if (pointed) {
        // Two arcs of radius `span * 0.8` struck from inside the springing.
        const R = span * 0.8, off = R - r;
        const a = Math.abs(along) + off;
        return a * a + dy * dy < R * R;
      }
      return along * along + dy * dy < r * r;
    };
    this.section(p, () => {
      if (this.B) {
        this.B.openings(inArch, () => {
          courses(y0, y0 + h, this.course, (yy, ch, c) => {
            const hollow = p.solid ? false : Math.min(w, d) > wall * 2.4;
            if (hollow) this.B.ring(cx, cz, w, d, wall, yy, ch, this.stone, mat, c % 2, yy + ch > y0 + h - 0.01 ? () => 0.25 : null);
            else this.solid(cx, yy, cz, w, ch, d, mat, 1.1);
          });
        });
        // The roof, over the walls and the hollow between them.
        this.solid(cx, y0 + h, cz, w, 1.0, d, p.roofMat ?? mat, 1.5);
      }
      const top = y0 + h + 1.0;
      this.roofRing(cx, cz, top, w, d);
      this.peak(cx, top, cz);
      if (p.attic) {
        this.cap(p.attic.cap ?? 'flat', cx, cz, top, p.attic.w ?? w * 0.5, p.attic.d ?? d * 0.6, p.attic.h, p.attic.mat ?? mat, !!p.attic.round);
      }
      // Men under the arch, facing out both ways.
      const f = axis === 'z' ? [0, 1] : [1, 0];
      for (const s of [-1, 1]) {
        this.post('arcade', cx + f[0] * s * (w / 2 - 1.0) + (axis === 'z' ? span * 0.3 : 0), y0, cz + f[1] * s * (d / 2 - 1.0) + (axis === 'x' ? span * 0.3 : 0), Math.atan2(f[0] * s, f[1] * s));
      }
    });
    if (y0 < 1) this.groundRing(cx, cz, w, d);
  }
}

/** Window bearings round a drum, the same at every tier. */
function roundAngles(w, bay) {
  const n = Math.max(3, Math.min(12, Math.floor((Math.PI * w) / bay)));
  return Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + 0.3);
}

/** Stone sizes for a tier, in the model's own metres. */
function sizes(S, blockScale, f) {
  const stone = (WORLD_STONE * blockScale * f) / S;
  return { stone, course: stone * 0.78, stoneLow: (WORLD_STONE * 1.55 * f) / S };
}

function lay(spec, k) {
  const kit = new Kit(spec, k);
  for (const p of spec.parts) {
    const fn = kit[p.t];
    if (typeof fn !== 'function') throw new Error(`kit: no part "${p.t}"`);
    fn.call(kit, p);
  }
  return kit;
}

/**
 * Build a spec at a tier. Laid once at the tier's stone; if that comes out
 * over the tier's budget, laid again in bigger stone until it fits.
 */
export function buildKit(spec, quality) {
  const bs = quality.blockScale ?? 1.55;
  const budget = BUDGET_LOW * Math.pow(1.55 / bs, 2) * (spec.budget ?? 1);
  let f = spec.fine ?? 1;
  let kit = null;
  for (let tries = 0; tries < 5; tries++) {
    kit = lay(spec, sizes(spec.S, bs, f));
    const n = kit.B.length;
    if (n <= budget * 1.08) break;
    f *= Math.pow(n / budget, 0.45);
  }
  kit.B.scaleAll(spec.S);
  return kit.B;
}

/**
 * What the garrison, the flag, the camera and the score need to know about a
 * spec, without laying a stone: posts in world metres, the footprint, the top.
 */
export function layoutKit(spec) {
  const kit = lay(spec, { ...sizes(spec.S, 1.55, spec.fine ?? 1), dry: true });
  const S = spec.S;
  const b = kit.bbox;
  return {
    S,
    posts: kit.posts.map((q) => ({ ...q, x: q.x * S, y: q.y * S, z: q.z * S })),
    box: { x0: b.x0 * S, x1: b.x1 * S, z0: b.z0 * S, z1: b.z1 * S },
    top: { x: kit.top.x * S, y: kit.top.y * S, z: kit.top.z * S },
    tags: [...kit.tags],
    baseTags: [...kit.baseTags],
  };
}

/**
 * The generic garrison: every post the parts declared, thinned to a
 * garrison's size and crewed by what suits the post.
 *
 *   window   riflemen, a machine gun in every third, snipers high up
 *   roof     machine guns and riflemen; snipers high up
 *   arcade   riflemen and machine guns under cover
 *   ground   anti-tank teams and riflemen behind sandbags round the foot
 *
 * and three mortars dug in on open ground just off the footprint.
 */
export function populateKit(L, g, origin, groundY, opts = {}) {
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const thin = (list, n) => {
    if (list.length <= n) return list;
    const out = [];
    for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)]);
    return out;
  };
  const by = (kind) => L.posts.filter((q) => q.kind === kind);
  const cap = opts.cap ?? {};
  let i = 0;
  for (const q of thin(by('window'), cap.window ?? 16)) {
    const type = q.high && i % 3 === 0 ? 'sniper' : i % 3 === 1 ? 'mg' : 'rifleman';
    g.place(type, V(q.x, q.y, q.z), q.facing, 6, { cover: 'window' });
    i++;
  }
  i = 0;
  for (const q of thin(by('roof'), cap.roof ?? 8)) {
    const type = q.high && i % 2 === 0 ? 'sniper' : i % 2 ? 'mg' : 'rifleman';
    g.place(type, V(q.x, q.y + 0.1, q.z), q.facing, 7, { cover: 'roof' });
    i++;
  }
  i = 0;
  for (const q of thin(by('arcade'), cap.arcade ?? 6)) {
    g.place(i % 2 ? 'mg' : 'rifleman', V(q.x, q.y + 0.2, q.z), q.facing, 6, { cover: 'arcade' });
    i++;
  }
  i = 0;
  for (const q of thin(by('ground'), cap.ground ?? 8)) {
    g.place(i % 2 ? 'rifleman' : 'at', V(q.x, 0.3, q.z), q.facing, 12, { cover: 'ground', sandbags: true });
    i++;
  }
  // The mortars, off the footprint in three directions.
  const b = L.box;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const hx = (b.x1 - b.x0) / 2 + 12, hz = (b.z1 - b.z0) / 2 + 12;
  for (const [x, z] of [[cx - hx, cz + hz * 0.3], [cx + hx, cz - hz * 0.3], [cx + hx * 0.3, cz - hz]]) {
    g.place('mortar', V(x, 0.4, z), 0, 24, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
