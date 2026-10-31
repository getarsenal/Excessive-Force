/**
 * The abstract world: a themed, low-poly town laid out for the fight.
 *
 * The owner's direction (October 2026): the world round the target is a
 * clean low-poly abstraction, the way Fortnite draws an island, with a strict
 * triangle budget, one detail level throughout, a theme for the place and
 * buildings put where they matter to the fight rather than copied from a
 * survey. The ground and the water stay the real ones (the DEM, the coast,
 * the river): that is half of "real landmarks on their real ground", and it
 * is cheap. What goes is the surveyed town, which on a phone was most of a
 * frame's triangles and none of its gameplay.
 *
 * The plan, from the landmark out:
 *
 *   the ring       a road round the landmark's own ground, just outside the
 *                  precinct: the garrison's line, and the edge of the square.
 *   the cover      one- and two-storey buildings close round the ring, dense:
 *                  what the defenders fight from and what the player burns.
 *   the town       street-fronting blocks along the radial avenues and the
 *                  outer ring, two to five storeys by theme, a few taller
 *                  anchors well out and never across the opening view.
 *   the lanes      six avenues out from the ring, one laid toward the level's
 *                  own camera: the approach a battery sets up on, kept open.
 *   the country    scattered farms, trees in clumps, boulders on the slopes,
 *                  and a thin scatter past the map's edge to the fog.
 *
 * Everything is built from a handful of shapes per theme (`KITS`): boxes,
 * gabled, hipped, flat, domed and Tibetan roofs, a window band of colour per
 * storey rather than geometry, icosahedron crowns, cones and palms; no
 * texture anywhere, and faceted normals, so the light does the shading. It
 * publishes the same group the surveyed builder does (`plots`, `cityMeshes`
 * with each building's ranges for the fire, `roofs`, the road `network` the
 * traffic and the checkpoint run on), so the fire, the colliders, the
 * garrison and the strike sites work unchanged.
 *
 * Chosen on SETTINGS (WORLD: SURVEYED / ABSTRACT, `tt.env`) or `?env=` on
 * the address; the survey stays the default until the owner has looked.
 * `node tools/envbudget.mjs <level>` counts what it costs against BUDGET.
 */
import * as THREE from 'three';
import { mergeChunked, burnable, PropSet } from './detail.js';
import { buildPrecinct } from './places.js';
import { valueNoise } from './terrain.js';

/** What the environment may cost, in triangles, everything but the target. */
export const BUDGET = { buildings: 60000, trees: 28000, roads: 8000, countryHouses: 9000, countryTrees: 15000 };

// ── The switch ───────────────────────────────────────────────────────────

const ENV_KEY = 'tt.env';
/** 'survey' or 'abstract': `?env=` first, then SETTINGS. */
export function envMode() {
  try {
    const q = new URLSearchParams(window.location.search).get('env');
    if (q === 'abstract' || q === 'survey') return q;
  } catch { /* no location */ }
  try { return localStorage.getItem(ENV_KEY) === 'abstract' ? 'abstract' : 'survey'; } catch { return 'survey'; }
}
export function setEnvMode(m) {
  try { localStorage.setItem(ENV_KEY, m === 'abstract' ? 'abstract' : 'survey'); } catch { /* private mode */ }
}

// ── The themes ───────────────────────────────────────────────────────────

/**
 * A theme is a few wall colours, a window band, roofs, a roof form, a height
 * range in storeys and a tree. Colours are written muted: the place's
 * character is in the hue, and the light does the rest.
 */
const KITS = {
  temperate: {
    walls: [0xd8cbb2, 0xc7b59b, 0xb9a48c, 0xe0d9cb, 0xa96850], band: 0x4f5965,
    roofs: [0x56606b, 0x5e5049, 0x6d4c42], roof: 'gable', floors: [2, 5],
    tower: { floors: [8, 13], walls: [0xc9ced2, 0xb8bfc4] }, tree: 'broadleaf', road: 0x666a70,
  },
  nordic: {
    walls: [0xd9cfbd, 0xc6b49c, 0xa66a52, 0xd8d3c8], band: 0x46505a,
    roofs: [0x4d5660, 0x5d3f37], roof: 'gable', floors: [2, 4], pitch: 1.3,
    tower: null, tree: 'conifer', road: 0x62666c,
  },
  mediterranean: {
    walls: [0xeee7da, 0xe6d9c1, 0xe5cfac, 0xdcc6a6], band: 0x5d6d7a,
    roofs: [0xbd6340, 0xb0593c, 0xc27450], roof: 'hip', floors: [2, 4],
    tower: null, tree: 'umbrella', road: 0x8c8172,
  },
  tropical: {
    walls: [0xefe2c8, 0xd6e2cc, 0xeed3bf, 0xe7e2d6], band: 0x55666c,
    roofs: [0x9a5440, 0x6e7c5c, 0xa86a4a], roof: 'hip', floors: [1, 4],
    tower: { floors: [7, 12], walls: [0xdfe3e2, 0xcfd6d4] }, tree: 'palm', road: 0x76716a,
  },
  desert: {
    walls: [0xe7dbc0, 0xd8c39d, 0xefe8db, 0xcfb28a], band: 0x5f8a91,
    roofs: null, roof: 'flat', domes: 0.22, floors: [1, 3],
    tower: null, tree: 'palm', road: 0xa8946f,
  },
  highland: {
    walls: [0xefece4, 0xe6e0d2, 0xdcd3c0], band: 0x3d322c, trim: 0x7a3229,
    roofs: null, roof: 'tibetan', floors: [1, 4], taper: 0.9,
    tower: null, tree: 'conifer', road: 0x8a7a63,
  },
};
const KIT_FOR = {
  temperate: 'temperate', alpine: 'nordic', nordic: 'nordic', mediterranean: 'mediterranean',
  subtropical: 'tropical', tropical: 'tropical', desert: 'desert', steppe: 'desert', highland: 'highland',
};
export const kitFor = (clime) => KIT_FOR[clime] || 'temperate';

// ── Shapes ───────────────────────────────────────────────────────────────

const STOREY = 3.3;
const _c = new THREE.Color();

/** Flat-shaded, colour-only geometry: every piece shares one attribute set, so they merge. */
function prep(geo, hex, jitter = 1) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  _c.setHex(hex).multiplyScalar(jitter);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Triangles written as world points, each turned to face away from `inside`. */
function tris(list, inside) {
  const pos = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (const [a, b, c] of list) {
    ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
    m.set((a.x + b.x + c.x) / 3 - inside.x, (a.y + b.y + c.y) / 3 - inside.y, (a.z + b.z + c.z) / 3 - inside.z);
    const flip = n.dot(m) < 0;
    for (const p of flip ? [a, c, b] : [a, b, c]) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A box from the ground up, without its underside. */
function body(w, h, d, taper = 1) {
  const tw = w * taper, td = d * taper;
  const b = [V(-w / 2, 0, -d / 2), V(w / 2, 0, -d / 2), V(w / 2, 0, d / 2), V(-w / 2, 0, d / 2)];
  const t = [V(-tw / 2, h, -td / 2), V(tw / 2, h, -td / 2), V(tw / 2, h, td / 2), V(-tw / 2, h, td / 2)];
  const L = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; L.push([b[i], b[j], t[j]], [b[i], t[j], t[i]]); }
  L.push([t[0], t[1], t[2]], [t[0], t[2], t[3]]);
  return tris(L, V(0, h / 2, 0));
}

/** The four sides of a box only, between y0 and y1, proud of the wall by `out`. */
function band(w, d, y0, y1, out = 0.06) {
  const hw = w / 2 + out, hd = d / 2 + out;
  const b = [V(-hw, y0, -hd), V(hw, y0, -hd), V(hw, y0, hd), V(-hw, y0, hd)];
  const t = b.map((p) => V(p.x, y1, p.z));
  const L = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; L.push([b[i], b[j], t[j]], [b[i], t[j], t[i]]); }
  return tris(L, V(0, (y0 + y1) / 2, 0));
}

/** A pitched roof over w by d at height y: gabled (ridge along the long side) or hipped. */
function roofPitched(w, d, y, rise, hip) {
  const o = 0.5, ww = w / 2 + o, dd = d / 2 + o;
  const alongX = w >= d;
  const half = alongX ? ww : dd, across = alongX ? dd : ww;
  const inset = hip ? Math.min(across, half * 0.9) : 0;
  const r0 = alongX ? V(-half + inset, y + rise, 0) : V(0, y + rise, -half + inset);
  const r1 = alongX ? V(half - inset, y + rise, 0) : V(0, y + rise, half - inset);
  const e = [V(-ww, y, -dd), V(ww, y, -dd), V(ww, y, dd), V(-ww, y, dd)];
  const L = [];
  if (alongX) {
    L.push([e[0], e[1], r1], [e[0], r1, r0]);   // the -z slope
    L.push([e[3], e[2], r1], [e[3], r1, r0]);   // the +z slope
    L.push([e[0], e[3], r0], [e[1], e[2], r1]); // the ends: gables, or the hips' triangles
  } else {
    L.push([e[0], e[3], r1], [e[0], r1, r0]);
    L.push([e[1], e[2], r1], [e[1], r1, r0]);
    L.push([e[0], e[1], r0], [e[3], e[2], r1]);
  }
  return tris(L, V(0, y + rise * 0.3, 0));
}

function dome(r, y) {
  const g = new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// ── Plan geometry ────────────────────────────────────────────────────────

/** Separating-axis overlap of two yawed rectangles {x,z,w,d,yaw}, grown by `pad`. */
function rectsOverlap(a, b, pad = 0) {
  const axes = [];
  for (const r of [a, b]) {
    const c = Math.cos(r.yaw || 0), s = Math.sin(r.yaw || 0);
    axes.push([c, -s], [s, c]);
  }
  const corners = (r) => {
    const c = Math.cos(r.yaw || 0), s = Math.sin(r.yaw || 0), hw = r.w / 2 + pad / 2, hd = r.d / 2 + pad / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [r.x + u * hw * c + v * hd * s, r.z - u * hw * s + v * hd * c]);
  };
  const ca = corners(a), cb = corners(b);
  for (const [ax, az] of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of ca) { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of cb) { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

function segDist(px, pz, s) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / L2));
  return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── The builder ──────────────────────────────────────────────────────────

/**
 * @param {Terrain} terrain
 * @param {object} quality
 * @param {object} opts  levelId, clime, landmarks, precinct, exclude, clearings,
 *                       hinterland, cameraYaw
 */
export function buildAbstract(terrain, quality, opts = {}) {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'context';
  const rng = mulberry32(hashStr(`abstract:${opts.levelId || 'x'}`));
  const R = (a, b) => a + rng() * (b - a);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const kitId = kitFor(opts.clime || 'temperate');
  const K = KITS[kitId];
  const span = terrain.span;
  const reach = span * 0.92;
  const EX = opts.exclude || 66;
  const wl = terrain.waterLevel;

  // The landmark's ground, and how far it reaches.
  const marks = (opts.landmarks || []).map((l) => ({ x: l.x, z: l.z, w: l.w, d: l.d, yaw: 0, scenery: l.scenery, open: l.open }));
  let reachMark = EX;
  for (const l of marks) {
    if (l.scenery) continue;
    reachMark = Math.max(reachMark, Math.hypot(Math.abs(l.x) + l.w / 2, Math.abs(l.z) + l.d / 2));
  }
  const clearings = opts.clearings || [];

  const wet = (x, z) => terrain.maskAt(x, z).water > 0.2 || terrain.heightAt(x, z) < wl + 0.5;
  const inMark = (x, z, pad) => marks.some((l) => Math.abs(x - l.x) < l.w / 2 + pad && Math.abs(z - l.z) < l.d / 2 + pad);
  const inClearing = (x, z, pad = 0) => clearings.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2);
  const onMap = (x, z) => Math.abs(x) < reach && Math.abs(z) < reach;
  // One world to the fog (terrain `_skirt`): the map's own height and water on
  // the map, the real far relief and the far water past it, meeting at the edge.
  // What stands on the map is solid and burns (`plots`); past it the same
  // buildings are scenery. Everything thins smoothly to the rim, with no line.
  const onField = (x, z) => Math.abs(x) <= span && Math.abs(z) <= span;
  const inside = (x, z) => Math.abs(x) < span - 4 && Math.abs(z) < span - 4;
  const worldR = (terrain.worldR || span * 1.9) * 0.96;
  const inWorld = (x, z) => Math.hypot(x, z) < worldR;
  const groundAt = (x, z) => (onField(x, z) ? terrain.heightAt(x, z) : terrain.surfaceAt(x, z));
  const wetAt = (x, z) => (onField(x, z) ? wet(x, z)
    : (!!terrain._farWet?.(x, z) || terrain.surfaceAt(x, z) < wl + 0.5));
  const falloff = (r) => 1 - 0.75 * THREE.MathUtils.smoothstep(r, span, worldR);
  /** Whether a straight road can run from a to b: on dry land, off the landmark, on the map. */
  const lineClear = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 7));
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      if (!onMap(x, z) || wet(x, z) || inMark(x, z, 10)) return false;
    }
    return true;
  };

  // ── The roads.
  const nodes = [], edges = [], segs = [];
  const HW = { avenue: 5.5, street: 4 };
  const node = (x, z) => {
    const n = { x, z, y: terrain.heightAt(x, z), links: [] };
    nodes.push(n);
    return nodes.length - 1;
  };
  const link = (ia, ib, cls) => {
    const a = nodes[ia], b = nodes[ib];
    if (!lineClear(a.x, a.z, b.x, b.z)) return null;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.ceil(len / 10));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
      pts.push({ x, z, y: terrain.heightAt(x, z) });
    }
    const e = { a: ia, b: ib, cls, pts, len };
    edges.push(e);
    a.links.push({ edge: e, other: ib, at: 0 });
    b.links.push({ edge: e, other: ia, at: 1 });
    segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, hw: HW[cls] });
    return e;
  };
  // The approach: the side the level's own camera looks from.
  const cy = opts.cameraYaw ?? 0.5;
  const RADIALS = 6;
  const rRing = Math.min(reach * 0.6, Math.max(EX + 30, reachMark + 24));
  const ringN = Math.max(12, Math.min(40, Math.round((Math.PI * 2 * rRing) / 45)));
  const ring = [];
  for (let k = 0; k < ringN; k++) {
    const a = cy + (k / ringN) * Math.PI * 2;
    const x = Math.sin(a) * rRing, z = Math.cos(a) * rRing;
    ring.push(onMap(x, z) && !wet(x, z) && !inMark(x, z, 10) ? node(x, z) : -1);
  }
  for (let k = 0; k < ringN; k++) {
    const a = ring[k], b = ring[(k + 1) % ringN];
    if (a >= 0 && b >= 0) link(a, b, 'avenue');
  }
  const rOuter = rRing + 230;
  const outerN = Math.max(16, Math.min(56, Math.round((Math.PI * 2 * rOuter) / 60)));
  const outer = [];
  if (rOuter < reach - 40) {
    for (let k = 0; k < outerN; k++) {
      const a = cy + (k / outerN) * Math.PI * 2;
      const x = Math.sin(a) * rOuter, z = Math.cos(a) * rOuter;
      outer.push(onMap(x, z) && !wet(x, z) ? node(x, z) : -1);
    }
    for (let k = 0; k < outerN; k++) {
      const a = outer[k], b = outer[(k + 1) % outerN];
      if (a >= 0 && b >= 0) link(a, b, 'street');
    }
  }
  // The avenues: out from the ring, a node every ninety metres, as far as dry
  // ground goes; the first is the approach.
  const radialAngles = [];
  for (let k = 0; k < RADIALS; k++) {
    const a = cy + (k / RADIALS) * Math.PI * 2;
    radialAngles.push(a);
    const ki = Math.round((k / RADIALS) * ringN) % ringN;
    let prev = ring[ki];
    if (prev < 0) continue;
    for (let r = rRing + 90; r < reach * 1.42; r += 90) { // (a diagonal runs on to the square's edge)
      // Onto the outer ring where it crosses it.
      let ni = -1;
      if (outer.length && Math.abs(r - rOuter) < 46) {
        const ko = Math.round((k / RADIALS) * outerN) % outerN;
        ni = outer[ko];
        r = rOuter;
      }
      if (ni < 0) {
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (!onMap(x, z) || wet(x, z)) break;
        ni = node(x, z);
      }
      if (!link(prev, ni, 'avenue')) break;
      prev = ni;
    }
  }
  // The town's streets: a grid square to the approach, a hundred and ten
  // metres a block, from just outside the ring to past the outer ring, laid
  // wherever the ground lets it run (across the river too, which the avenues
  // stop at). A street joins the plan only where both its ends are on it.
  {
    const P = 110, c = Math.cos(cy), s0 = Math.sin(cy);
    const rIn = rRing + 55, rOut = Math.min(reach, rOuter + 170);
    const grid = new Map();
    const at = (i, j) => {
      const key = `${i},${j}`;
      if (grid.has(key)) return grid.get(key);
      const u = i * P, v = j * P;
      const x = u * c + v * s0, z = -u * s0 + v * c, r = Math.hypot(x, z);
      const ok = r > rIn && r < rOut && onMap(x, z) && !wet(x, z) && !inMark(x, z, 14);
      const id = ok ? node(x, z) : -1;
      grid.set(key, id);
      return id;
    };
    const M = Math.ceil(rOut / P) + 1;
    for (let j = -M; j <= M; j++) {
      for (let i = -M; i <= M; i++) {
        const a = at(i, j);
        if (a < 0) continue;
        const b = at(i + 1, j), d = at(i, j + 1);
        if (b >= 0) link(a, b, 'street');
        if (d >= 0) link(a, d, 'street');
      }
    }
    // Nodes nothing joined are dropped from the plan's count only: the
    // network is read by edges, and a node with no links is never walked.
  }
  // Country roads to the fog, one down each avenue's line: from the town's
  // furthest road node that way (the avenue's own end where it reached the
  // edge) straight out, broken where it meets water and taken up again on the
  // far bank. Scenery: the traffic keeps to the map's network.
  const farRoads = [];
  for (let k = 0; k < RADIALS; k++) {
    const a = radialAngles[k], ux = Math.sin(a), uz = Math.cos(a);
    let best = -1, bestR = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n.links.length) continue;
      const along = n.x * ux + n.z * uz, across = Math.abs(n.x * uz - n.z * ux);
      if (along > bestR && across < Math.max(60, along * 0.18)) { best = i; bestR = along; }
    }
    if (best < 0) continue;
    let pts = [{ x: nodes[best].x, z: nodes[best].z, y: groundAt(nodes[best].x, nodes[best].z) }];
    const flush = () => {
      if (pts.length >= 2) {
        farRoads.push(pts);
        for (let i = 0; i + 1 < pts.length; i++) {
          segs.push({ ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, hw: HW.avenue });
        }
      }
      pts = [];
    };
    for (let r = bestR + 40; r < worldR * 0.92; r += 40) {
      // Bent onto the avenue's line over the first stretch, then along it.
      const t = Math.min(1, (r - bestR) / 400);
      const ox = nodes[best].x - ux * bestR, oz = nodes[best].z - uz * bestR;
      const x = ux * r + ox * (1 - t), z = uz * r + oz * (1 - t);
      if (wetAt(x, z)) { flush(); continue; }
      pts.push({ x, z, y: groundAt(x, z) });
    }
    flush();
  }
  const nearRoad = (x, z, pad) => segs.some((s) => segDist(x, z, s) < s.hw + pad);

  // ── The buildings.
  const plots = [];
  const parts = [];           // building geometry, each tagged with its plot
  const rects = [];
  let buildTris = 0;
  const cameraLane = (x, z) => {
    // Within thirty degrees of the approach avenue: nothing tall here.
    let d = Math.atan2(x, z) - cy;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) < 0.5;
  };
  let countryTris = 0;
  const tryPlace = (x, z, w, d, yaw, floors, opt = {}) => {
    const scenery = !inside(x, z);
    if (scenery ? countryTris > BUDGET.countryHouses : (plots.length >= 900 || buildTris > BUDGET.buildings)) return false;
    const r = { x, z, w, d, yaw };
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // The centre and the outline every six metres or less: corners alone
    // let a long terrace's middle sit across a curving road.
    const pts = [[0, 0]];
    const nu = Math.max(1, Math.ceil(w / 6)), nv = Math.max(1, Math.ceil(d / 6));
    for (let i = 0; i <= nu; i++) for (const v of [-1, 1]) pts.push([(i / nu - 0.5) * w, v * d / 2]);
    for (let j = 1; j < nv; j++) for (const u of [-1, 1]) pts.push([u * w / 2, (j / nv - 0.5) * d]);
    let lo = Infinity, hi = -Infinity;
    for (const [u, v] of pts) {
      const px = x + u * c + v * s, pz = z - u * s + v * c;
      if (!(scenery ? inWorld(px, pz) && !inside(px, pz) : inside(px, pz))) return false;
      if (wetAt(px, pz) || inMark(px, pz, 12) || inClearing(px, pz, 4)) return false;
      if (Math.hypot(px, pz) < EX + 6) return false;
      if (nearRoad(px, pz, 1.5)) return false;
      const h = groundAt(px, pz);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo > (kitId === 'highland' ? 6 : 3.5)) return false;
    for (const o of rects) if (rectsOverlap(r, o, 2.5)) return false;
    rects.push(r);
    const base = lo - 0.4;
    const hBody = floors * STOREY + (hi - lo) + 0.4;
    const top = base + hBody;
    const index = plots.length;
    const plot = { x, z, w, d, h: hBody, base, yaw, eave: top, topW: w, topD: d,
      ax: w * Math.abs(c) + d * Math.abs(s), az: w * Math.abs(s) + d * Math.abs(c), real: false, front: null };
    const add = (g, hex, jit = 1) => {
      const p = prep(g, hex, jit);
      p.rotateY(yaw); p.translate(x, base, z);
      if (scenery) countryTris += p.attributes.position.count / 3;
      else { p.userData.plot = index; buildTris += p.attributes.position.count / 3; }
      parts.push(p);
    };
    const tower = !!opt.tower;
    const walls = tower ? K.tower.walls : K.walls;
    const wall = pick(walls), jit = R(0.94, 1.05);
    const taper = K.taper && !tower ? K.taper : 1;
    add(body(w, hBody, d, taper), wall, jit);
    // A window band a storey, a little below each floor's head.
    const lower = hi - lo + 0.4;
    for (let f = 0; f < floors; f++) {
      const y0 = lower + f * STOREY + 1.0, y1 = y0 + (tower ? 1.4 : 1.0);
      const k = taper === 1 ? 1 : 1 - (1 - taper) * ((y0 + y1) / 2) / hBody;
      add(band(w * k, d * k, y0, y1), K.band, jit);
    }
    let form = tower || opt.flat ? 'flat' : K.roof;
    if (form === 'flat' && K.domes && !tower && rng() < K.domes && Math.min(w, d) < 14) form = 'dome';
    if (form === 'gable' || form === 'hip') {
      const rise = Math.min(w, d) * 0.32 * (K.pitch || 1);
      add(roofPitched(w, d, hBody, rise, form === 'hip'), pick(K.roofs), R(0.94, 1.04));
      plot.flat = false; plot.pitched = true; plot.top = top + rise;
    } else {
      // A parapet; on the plateau the maroon band the Tibetan houses wear.
      const trim = form === 'tibetan' ? K.trim : wall;
      const tw = w * taper, td = d * taper;
      add(band(tw, td, hBody - (form === 'tibetan' ? 1.1 : 0), hBody + 0.7, 0.05), trim, form === 'tibetan' ? 1 : 0.92);
      if (form === 'dome') add(dome(Math.min(w, d) * 0.32, hBody), wall, 1.04);
      plot.flat = form !== 'dome'; plot.pitched = false;
      plot.top = top + (form === 'dome' ? Math.min(w, d) * 0.32 : 0.7);
    }
    if (!scenery) plots.push(plot);
    return true;
  };

  // Along the roads, both sides, facing them: the ring first (the cover),
  // then the avenues and the outer ring (the town), thinning out with distance.
  const band0 = rRing + 110, band1 = rOuter + 70;
  const alongRoads = (filter) => {
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, rm = Math.hypot(mx, mz);
      if (!filter(rm, e)) continue;
      const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
      const yaw = Math.atan2(-uz, ux);
      for (const side of [-1, 1]) {
        let t = 4;
        while (t < e.len - 6) {
          const x0 = a.x + ux * t, z0 = a.z + uz * t, r0 = Math.hypot(x0, z0);
          const cover = r0 < band0, town = r0 < band1;
          // Clusters and open stretches, not a row: where the noise is low a
          // run of the road goes unbuilt. Every road lined end to end with
          // the same box at the same setback read as a model railway, the
          // Potala's ring and Giza's above all.
          const lull = valueNoise(x0 * 0.013 + side * 5.7 + 7.1, z0 * 0.013 - 3.3);
          // (`valueNoise` runs from -0.5 to 0.5: about a fifth of the ring
          // and a quarter of the town's frontage open.)
          if (lull < (cover ? -0.22 : town ? -0.17 : -1)) { t += R(12, 30); continue; }
          let w = cover ? R(8, 13) : town ? R(10, 18) : R(9, 13);
          let dd = cover ? R(7, 10) : town ? R(9, 14) : R(8, 11);
          // A terrace or a block, flat-roofed and deep enough to put a gun
          // on: a gabled town's only deployable roofs were its few towers.
          const terrace = town && !cover && rng() < 0.14;
          if (terrace) { w *= R(1.5, 2.1); dd = Math.max(dd, 13); }
          const gap = cover ? R(2.5, 7) : town ? R(3, 11) : R(18, 60);
          // Set back by a varying front yard, now and then a deep one, and a
          // little off square to the road.
          const yard = rng() < 0.15 ? R(4, 9) : R(0, 2.5);
          const off = HW[e.cls] + 3.5 + dd / 2 + yard;
          const skew = yaw + R(-0.07, 0.07);
          const cx = x0 + ux * w / 2 - uz * side * off, cz = z0 + uz * w / 2 + ux * side * off;
          let floors;
          if (cover) floors = rng() < 0.6 ? 1 : 2;
          else if (town) floors = Math.round(R(K.floors[0], K.floors[1]));
          else floors = rng() < 0.7 ? 1 : 2;
          const anchor = town && !cover && K.tower && r0 > rRing + 160 && !cameraLane(cx, cz) && rng() < 0.08;
          if (anchor) floors = Math.round(R(K.tower.floors[0], K.tower.floors[1]));
          if (cameraLane(cx, cz) && r0 < band1) floors = Math.min(floors, 2);
          if (terrace) floors = Math.max(floors, 2);
          const placed = tryPlace(cx, cz, w, dd, anchor ? yaw : skew, floors, { tower: anchor, flat: terrace });
          // A second row behind the first, in town; or an outbuilding at
          // right angles behind it, round a yard.
          if (placed && town && !cover && rng() < 0.5) {
            const off2 = off + dd / 2 + 3 + dd / 2 + R(0, 4);
            tryPlace(x0 + ux * w / 2 - uz * side * off2, z0 + uz * w / 2 + ux * side * off2,
              w * R(0.7, 1.05), dd, yaw + R(-0.1, 0.1), Math.max(1, floors - 1));
          } else if (placed && rng() < 0.3) {
            const ow = R(5, 8), od = R(4, 6), along = (rng() < 0.5 ? -1 : 1) * (w / 2 - ow / 2);
            const off2 = off + dd / 2 + R(4, 7) + ow / 2;
            tryPlace(cx + ux * along - uz * side * (off2 - off), cz + uz * along + ux * side * (off2 - off),
              od, ow, skew + Math.PI / 2, 1);
          }
          t += w + gap;
        }
      }
    }
  };
  alongRoads((rm) => rm < band0);
  alongRoads((rm) => rm >= band0 && rm < band1);
  alongRoads((rm) => rm >= band1);
  // The country, from the town out to the fog, by one rule on and off the
  // map: villages along the roads, and farms and hamlets where the noise
  // says, thinning with distance.
  for (const pts of farRoads) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      const yaw = Math.atan2(-uz, ux);
      for (const side of [-1, 1]) {
        if (rng() > 0.45 * falloff(Math.hypot(a.x, a.z))) continue;
        const w = R(9, 14), dd = R(7, 10), off = HW.avenue + 3.5 + dd / 2;
        tryPlace(a.x + ux * L / 2 - uz * side * off, a.z + uz * L / 2 + ux * side * off, w, dd, yaw, rng() < 0.7 ? 1 : 2);
      }
    }
  }
  for (let k = 0; k < 3200; k++) {
    const a = R(0, Math.PI * 2), r = Math.sqrt(R(band1 * band1, worldR * worldR));
    if (rng() > falloff(r)) continue;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (valueNoise(x * 0.004 + 3.1, z * 0.004 - 7.7) < 0.05) continue;
    tryPlace(x, z, R(8, 14), R(7, 11), R(0, Math.PI), rng() < 0.75 ? 1 : 2);
  }

  // ── Trees, rocks and the country past the edge.
  const props = new PropSet(quality);
  const tone = terrain.tones || null;
  const leaf = tone ? tone.grass.clone().multiplyScalar(0.72) : new THREE.Color(0x4c6b34);
  const leafHex = leaf.getHex();
  let treeTris = 0, farTris = 0;
  const tree = (x, z, scale = 1, far = false) => {
    if (far ? farTris > BUDGET.countryTrees : treeTris > BUDGET.trees) return false;
    const y = groundAt(x, z) - 0.2;
    const s = scale * R(1.35, 2.0);
    const kind = K.tree;
    const jit = R(0.85, 1.12);
    const put = (g, hex, j = 1) => {
      const p = prep(g, hex, j);
      p.translate(x, y, z);
      if (far) p.userData.far = 1;
      if (far) farTris += p.attributes.position.count / 3;
      else treeTris += p.attributes.position.count / 3;
      props.add('trees', p);
    };
    const trunk = 0x5b4636;
    if (kind === 'conifer') {
      put(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 2.4 * s, 5, 1, true).translate(0, 1.2 * s, 0), trunk);
      put(new THREE.ConeGeometry(2.6 * s, 5.2 * s, 6, 1, true).translate(0, 4.2 * s, 0), leafHex, jit * 0.85);
      put(new THREE.ConeGeometry(1.9 * s, 4.0 * s, 6, 1, true).translate(0, 6.6 * s, 0), leafHex, jit * 0.92);
    } else if (kind === 'palm') {
      const h = 7 * s;
      put(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, h, 5, 1, true).translate(0, h / 2, 0), 0x7a6650);
      const fronds = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + R(-0.2, 0.2);
        const dx = Math.sin(a), dz = Math.cos(a);
        const c = V(0, h, 0), tip = V(dx * 3.6 * s, h - 1.4 * s, dz * 3.6 * s);
        const sx = -dz * 0.7 * s, sz = dx * 0.7 * s;
        const mid = V(dx * 1.8 * s, h + 0.4 * s, dz * 1.8 * s);
        fronds.push([c, V(mid.x + sx, mid.y, mid.z + sz), tip], [c, tip, V(mid.x - sx, mid.y, mid.z - sz)]);
      }
      put(tris(fronds, V(0, h - 3, 0)), leafHex, jit);
    } else if (kind === 'umbrella') {
      put(new THREE.CylinderGeometry(0.22 * s, 0.32 * s, 3.4 * s, 5, 1, true).translate(0, 1.7 * s, 0), trunk);
      put(new THREE.IcosahedronGeometry(2.8 * s, 0).scale(1.25, 0.55, 1.25).translate(0, 4.6 * s, 0), leafHex, jit * 0.9);
    } else {
      put(new THREE.CylinderGeometry(0.25 * s, 0.38 * s, 2.6 * s, 5, 1, true).translate(0, 1.3 * s, 0), trunk);
      put(new THREE.IcosahedronGeometry(2.7 * s, 0).translate(0, 4.6 * s, 0), leafHex, jit);
      put(new THREE.IcosahedronGeometry(1.8 * s, 0).translate(R(-1.4, 1.4) * s, 5.6 * s, R(-1.4, 1.4) * s), leafHex, jit * 1.06);
    }
    return true;
  };
  const clearOf = (x, z, pad) => {
    if (!inWorld(x, z) || wetAt(x, z) || inMark(x, z, pad + 4) || inClearing(x, z, pad)) return false;
    if (Math.hypot(x, z) < EX + 4) return false;
    if (nearRoad(x, z, pad)) return false;
    const r = { x, z, w: pad * 2, d: pad * 2, yaw: 0 };
    for (const o of rects) if (rectsOverlap(r, o, 1)) return false;
    return true;
  };
  // Rows down the avenues, and clumps where the ground says park or wood.
  for (const e of edges) {
    if (e.cls !== 'avenue') continue;
    const a = nodes[e.a], b = nodes[e.b];
    const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
    for (let t = 8; t < e.len - 8; t += R(16, 24)) {
      for (const side of [-1, 1]) {
        const off = HW.avenue + 2.2;
        const x = a.x + ux * t - uz * side * off, z = a.z + uz * t + ux * side * off;
        if (clearOf(x, z, 1.6)) tree(x, z, 0.85);
      }
    }
  }
  const woody = opts.hinterland === 'forest' || opts.hinterland === 'jungle';
  const thresh = kitId === 'desert' ? 0.33 : woody ? 0.05 : 0.18;
  // Every candidate first, then placed in a shuffled order, so a budget that
  // runs out thins the woods everywhere rather than leaving one side bare.
  const cand = [];
  for (let gz = -span; gz < span; gz += 11) {
    for (let gx = -span; gx < span; gx += 11) {
      const x = gx + R(-4, 4), z = gz + R(-4, 4);
      const park = terrain.maskAt(x, z).park;
      const n = valueNoise(x * 0.009 + 11.3, z * 0.009 - 4.1) + park * 0.35;
      if (n < thresh || rng() > 0.55) continue;
      cand.push([x, z]);
    }
  }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  for (const [x, z] of cand) {
    if (!clearOf(x, z, 3.5)) continue;
    if (!tree(x, z, 1)) break;
  }
  // And on past the map the same woods, drawn so a clump is about the same
  // size on the screen near or far: fewer the further out (the samples fall
  // off with the square of the distance) and a little larger.
  {
    const ratio = worldR / span;
    const far = [];
    for (let k = 0; k < 9000; k++) {
      const r = span * Math.pow(ratio, rng()), a = R(0, Math.PI * 2);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (onField(x, z)) continue;
      const n = valueNoise(x * 0.009 + 11.3, z * 0.009 - 4.1);
      if (n < thresh) continue;
      far.push([x, z, r]);
    }
    for (const [x, z, r] of far) {
      if (!clearOf(x, z, 3.5)) continue;
      if (!tree(x, z, 1 + 1.2 * THREE.MathUtils.smoothstep(r, span, worldR), true)) break;
    }
  }
  // Boulders: on the slopes, and a few lying out in the open, as the island does.
  const rock = tone ? tone.rock.getHex() : 0x8a8178;
  let rocks = 0;
  for (let k = 0; k < 1800 && rocks < 160; k++) {
    const r = span * Math.pow(worldR / span, rng() * rng()), a = R(0, Math.PI * 2);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const slope = Math.abs(groundAt(x + 6, z) - groundAt(x - 6, z))
      + Math.abs(groundAt(x, z + 6) - groundAt(x, z - 6));
    if (slope < 3 && rng() > 0.06) continue;
    if (!clearOf(x, z, 3)) continue;
    const s = R(1.2, 4.2) * (slope > 3 ? 1.2 : 1);
    const g = new THREE.IcosahedronGeometry(s, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * R(0.8, 1.3), p.getY(i) * R(0.55, 0.85), p.getZ(i) * R(0.8, 1.3));
    const q = prep(g, rock, R(0.9, 1.1));
    q.rotateY(R(0, Math.PI));
    q.translate(x, groundAt(x, z) - s * 0.25, z);
    props.add('rocks', q);
    rocks++;
  }
  const farN = farRoads.length;

  // ── The roads, drawn: a ribbon a road and a disc at every junction.
  const roadGeo = [];
  const roadHex = K.road;
  for (const e of [...edges, ...farRoads.map((pts) => ({ cls: 'avenue', pts }))]) {
    const hw = HW[e.cls];
    const pos = [];
    const P = e.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i], p1 = P[i + 1];
      const dx = p1.x - p0.x, dz = p1.z - p0.z, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * hw, nz = dx / L * hw;
      const y0 = p0.y + 0.14, y1 = p1.y + 0.14;
      pos.push(p0.x - nx, y0, p0.z - nz, p1.x - nx, y1, p1.z - nz, p1.x + nx, y1, p1.z + nz);
      pos.push(p0.x - nx, y0, p0.z - nz, p1.x + nx, y1, p1.z + nz, p0.x + nx, y0, p0.z + nz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // Wound to face up whichever way the edge runs.
    const arr = g.attributes.position.array;
    for (let t = 0; t < arr.length; t += 9) {
      const ax = arr[t + 3] - arr[t], az = arr[t + 5] - arr[t + 2];
      const bx = arr[t + 6] - arr[t], bz = arr[t + 8] - arr[t + 2];
      if (az * bx - ax * bz < 0) {
        for (let k = 0; k < 3; k++) { const tmp = arr[t + 3 + k]; arr[t + 3 + k] = arr[t + 6 + k]; arr[t + 6 + k] = tmp; }
      }
    }
    roadGeo.push(prep(g, roadHex));
  }
  let junctions = 0;
  for (const n of nodes) {
    if (n.links.length < 3) continue;
    junctions++;
    const g = new THREE.CircleGeometry(HW.avenue + 1.5, 10).rotateX(-Math.PI / 2).translate(n.x, n.y + 0.17, n.z);
    roadGeo.push(prep(g, roadHex));
  }
  for (const g of roadGeo) props.add('roads', g);

  // ── The landmark's own square, as the surveyed builder lays it.
  // The two questions the rest of the world asks of a street plan: how far a
  // point is from the nearest road's edge, and from the nearest junction's.
  const net = {
    nodes, edges, real: false, bridges: [], abstract: true,
    roadClearance: (x, z) => {
      let best = Infinity;
      for (const s of segs) best = Math.min(best, segDist(x, z, s) - s.hw);
      return best;
    },
    nodeClearance: (x, z) => {
      let best = Infinity;
      for (const n of nodes) if (n.links.length >= 3) best = Math.min(best, Math.hypot(x - n.x, z - n.z) - (HW.avenue + 1.5));
      return best;
    },
  };
  const counts = {};
  try {
    Object.assign(counts, buildPrecinct(props, terrain, rng, {
      precinct: opts.precinct, radius: EX - 4, net,
      landmarks: marks.filter((l) => !l.scenery), yaw: 0, clearings,
    }));
  } catch (err) { console.warn('[abstract] precinct not laid', err); }

  // ── Merge.
  const shadows = quality.shadowMapSize > 0;
  const bmat = burnable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const cityMeshes = mergeChunked(parts, bmat, { name: 'buildings', burn: true, cast: shadows, receive: shadows });
  for (const m of cityMeshes) group.add(m);
  props.flush(group, {
    roads: { offset: true, offsetLevel: 2, cast: false },
    trees: { cast: true },
    rocks: { cast: true },
    far: { cast: false },
  });

  // Deployable roofs: flat, broad, and standing clear of the ground behind.
  const roofs = plots.filter((p) => p.flat && Math.min(p.w, p.d) > 12 && p.h > 6);
  let total = 0;
  group.traverse((o) => { if (o.isMesh) total += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  group.userData = {
    plots, cityMeshes, roofs, network: net, gridYaw: 0, layout: [], bridge: null, bridges: [],
    detail: { plan: `abstract (${kitId})`, real: 0, junctions, canopy: Math.round(treeTris / 40), tris: Math.round(total),
      buildings: plots.length, rocks, farRoads: farN, buildTris: Math.round(buildTris), treeTris: Math.round(treeTris),
      countryTris: Math.round(countryTris + farTris), worldR: Math.round(worldR), ...counts },
  };
  console.log(`[tumble] abstract town (${kitId}): ${plots.length} buildings, ${edges.length} roads, `
    + `${Math.round(total / 1000)}k triangles (buildings ${Math.round(buildTris / 1000)}k, trees ${Math.round(treeTris / 1000)}k), `
    + `${(performance.now() - t0).toFixed(0)} ms`);
  return group;
}
