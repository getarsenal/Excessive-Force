import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Pena Palace, Sintra.
 *
 * Reference figures (Parques de Sintra; the plan from tools/survey.py):
 *   the crag              the bake's summit is at 500 m and level for about
 *                         113 x 162 m; the ground is 30 to 40 m lower a
 *                         hundred metres out in every direction
 *   the palace            a cluster running north-south along the ridge, about
 *                         100 x 60 m in all: the red monastery with its
 *                         cloister and chapel and the clock tower at the north
 *                         end, the yellow New Palace at the south, the great
 *                         round bastion at the south-west corner, the Arches
 *                         Yard between, the drawbridge gate on the south
 *   heights               the blocks 12 to 16 m, the clock tower about 30 m,
 *                         the bastion about 20 m over its terrace
 *
 * Kind: a fortress on a hill, the Potala's kind, and built the Potala's way:
 * a battered terrace founded twenty-six metres under the summit and run up,
 * buried where the crag is high and standing clear at either end where it
 * falls away, full of rubble, with the palace on its deck. The twist is the
 * bastion: the round tower stands on the cliff edge on its own foundations,
 * a hand clear of the terrace, and the New Palace leans on it. Undercut the
 * bastion and it goes down the west face alone; open the terrace under the
 * New Palace and the palace goes with the terrace.
 *
 * SANDSTONE for the red (the game's red is an ochre, which Pena's is),
 * LIMESTONE for the yellow, TILE for the azulejo bands, SLATE for the roofs.
 */

const S = 1.8;
const STONE_FINENESS = 0.9;
// One batter for every face on the hill: metres in per metre up.
const BATTER = 0.10;
// The terrace's footing, in real metres under the summit. The ground under
// the terrace's ends is thirty-odd metres down; this clears it.
const FOUND = -26.0;
// Below this the masonry is inside the crag: coarse and bare.
const ROUGH = -8.0;

// Real metres, +x east, +z south; the origin is the summit.
const TERRACE = { w: 60.0, d: 100.0, h: 4.0, wall: 4.0 };
const DECK = 1.2;
const WALL = 1.8;
const PARAPET = 2.2;
const BLOCKS = [
  { tag: 'monastery', cx: -2.0, cz: -32.0, w: 30.0, d: 28.0, h: 14.0, mat: 'SANDSTONE', win: 4.6, rows: [3.0, 8.5] },
  { tag: 'chapel', cx: 18.0, cz: -38.0, w: 10.0, d: 14.0, h: 11.0, mat: 'LIMESTONE', win: 3.5, rows: [5.0] },
  { tag: 'newpalace', cx: 2.0, cz: 6.0, w: 34.0, d: 30.0, h: 16.0, mat: 'LIMESTONE', win: 4.2, rows: [3.0, 9.5], band: true },
  { tag: 'gate', cx: 10.0, cz: 44.0, w: 14.0, d: 8.0, h: 12.0, mat: 'SANDSTONE', win: 4.0, rows: [7.0], door: 4.0 },
];
const TOWER = { cx: 18.0, cz: -22.0, w: 9.0, h: 32.0, roof: 6.0 };
const BASTION = { cx: -26.0, cz: 40.0, r: 10.0, wall: 3.0, h: 24.0, dome: 6.0 };
const GAP = 0.15;

/** Half-width of a battered wall at height y, given its width at its top. */
const wAt = (wTop, top, y) => wTop + 2 * BATTER * (top - y);

/** What the garrison, the flag and the level record read. */
export const PENA = {
  scale: S,
  terrace: { w: TERRACE.w * S, d: TERRACE.d * S, h: (TERRACE.h + DECK) * S, parapet: PARAPET * S },
  blocks: BLOCKS.map((b) => ({ tag: b.tag, cx: b.cx * S, cz: b.cz * S, w: b.w * S, d: b.d * S, h: b.h * S, top: (TERRACE.h + DECK + b.h) * S,
    rows: b.rows.map((r) => (TERRACE.h + DECK + r) * S), wall: WALL * S })),
  tower: { cx: TOWER.cx * S, cz: TOWER.cz * S, w: TOWER.w * S, top: (TERRACE.h + DECK + TOWER.h) * S },
  bastion: { cx: BASTION.cx * S, cz: BASTION.cz * S, r: BASTION.r * S, top: BASTION.h * S },
  /** Rooflines a man can be posted on, low to high. */
  galleries: [(TERRACE.h + DECK) * S, (TERRACE.h + DECK + 14.0) * S, (TERRACE.h + DECK + TOWER.h) * S],
  // The flag flies from the clock tower.
  flag: { x: TOWER.cx * S, y: (TERRACE.h + DECK + TOWER.h + TOWER.roof + 0.5) * S, z: TOWER.cz * S },
};

export function buildPena(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.4 * s;
  const course = 1.0 * s;
  const rough = stone * 3.2, roughCourse = course * 3.0;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  /** One course of a straight wall along `axis`, with gaps; no slivers. */
  const run = (axis, c, a0, a1, y, h, thick, st, mat, gaps = [], proud = 0, out = 1) => {
    const segs = [];
    let cur = a0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > cur + 0.05) segs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (a1 > cur + 0.05) segs.push([cur, a1]);
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      if (len < st * 0.35) continue;
      const n = Math.max(1, Math.round(len / st));
      for (let i = 0; i < n; i++) {
        const mid = s0 + (i + 0.5) * len / n, half = B.shrink(len / n / 2);
        const cc = c + out * proud / 2;
        if (axis === 'x') B.add(mid, y + h / 2, cc, half, B.shrink(h / 2), thick / 2 + proud / 2, mat);
        else B.add(cc, y + h / 2, mid, thick / 2 + proud / 2, B.shrink(h / 2), half, mat);
      }
    }
  };
  /**
   * One course of a hollow box, four faces bonded by the corner interlock,
   * gaps per face in the face's own along-coordinate, a lintel stone over
   * each gap when `lintel` is the bearing, `proud` for a band.
   */
  const box = (cx, cz, w, d, wall, y, h, c, st, mat, gaps = {}, lintel = 0, proud = 0) => {
    const hw = w / 2, hd = d / 2;
    const even = c % 2 === 0;
    const face = (axis, cc, a0, a1, out, g) => {
      let gl = (g || []).map(([p, q]) => (lintel ? [p - lintel, q + lintel] : [p, q])).sort((p, q) => p[0] - q[0]);
      if (lintel) {
        const min = st * 1.5;
        const merged = [];
        for (const [p, q] of gl) {
          const last = merged[merged.length - 1];
          if (last && p - last[1] < min) last[1] = q;
          else merged.push([p, q]);
        }
        gl = merged.map(([p, q]) => [p - a0 < min ? a0 - 0.5 : p, a1 - q < min ? a1 + 0.5 : q]);
      }
      run(axis, cc, a0, a1, y, h, wall, st, mat, gl, proud, out);
      if (lintel) {
        for (let [p, q] of gl) {
          p = Math.max(p, a0); q = Math.min(q, a1);
          const mid = (p + q) / 2, half = (q - p) / 2 - 0.02;
          const cc2 = cc + out * 0.25 / 2;
          if (axis === 'x') B.add(mid, y + h / 2, cc2, half, h / 2 - 0.01, wall / 2 + 0.125, mat);
          else B.add(cc2, y + h / 2, mid, wall / 2 + 0.125, h / 2 - 0.01, half, mat);
        }
      }
    };
    const xa0 = even ? cx - hw + wall : cx - hw, xa1 = even ? cx + hw - wall : cx + hw;
    const za0 = even ? cz - hd : cz - hd + wall, za1 = even ? cz + hd : cz + hd - wall;
    face('x', cz - hd + wall / 2, xa0, xa1, -1, gaps.n);
    face('x', cz + hd - wall / 2, xa0, xa1, 1, gaps.s);
    face('z', cx - hw + wall / 2, za0, za1, -1, gaps.w);
    face('z', cx + hw - wall / 2, za0, za1, 1, gaps.e);
  };
  /** Merlons: every other stone's width stands proud along a parapet. */
  const merlons = (x, z) => (Math.floor(((Math.abs(x) + Math.abs(z)) / (stone * 1.1))) % 2 ? 0.35 : 0);

  // ── The terrace: a battered retaining wall from the footing to the deck,
  // coarse and bare where it is buried, full of coarse rubble on a fixed
  // grid, the deck a course of paving over it, a battlemented parapet.
  const deckTop = TERRACE.h + DECK;
  B.section('terraces', () => {
    const skin = (y) => (y < ROUGH - 4.0 ? M.RUBBLE : M.LIMESTONE);
    const band = (a, b, st, ch) => courses(a, b, ch, (y, h, c) => {
      B.ring(0, 0, wAt(TERRACE.w, TERRACE.h, y), wAt(TERRACE.d, TERRACE.h, y), TERRACE.wall, y, h, st, skin(y), c % 2);
    });
    band(FOUND, ROUGH, rough, roughCourse);
    band(ROUGH, TERRACE.h, stone, course);
    // The fill, on a grid fixed in space, a hand clear of the skin, dropping
    // the stones the batter has come in past.
    const w0 = wAt(TERRACE.w, TERRACE.h, FOUND) - 2 * (TERRACE.wall + GAP), d0 = wAt(TERRACE.d, TERRACE.h, FOUND) - 2 * (TERRACE.wall + GAP);
    const nx = Math.round(w0 / rough), nz = Math.round(d0 / rough);
    const px = w0 / nx, pz = d0 / nz;
    courses(FOUND, TERRACE.h, roughCourse, (y, h) => {
      const yc = y + h / 2;
      const w = wAt(TERRACE.w, TERRACE.h, yc) - 2 * (TERRACE.wall + GAP), d = wAt(TERRACE.d, TERRACE.h, yc) - 2 * (TERRACE.wall + GAP);
      for (let i = 0; i < nx; i++) {
        const x = -w0 / 2 + (i + 0.5) * px;
        if (Math.abs(x) + px / 2 > w / 2 + 0.01) continue;
        for (let j = 0; j < nz; j++) {
          const z = -d0 / 2 + (j + 0.5) * pz;
          if (Math.abs(z) + pz / 2 > d / 2 + 0.01) continue;
          B.add(x, yc, z, B.shrink(px / 2), B.shrink(h / 2), B.shrink(pz / 2), M.RUBBLE);
        }
      }
    });
    // The deck: one course of paving over the whole top, a man's floor.
    const ps = stone * 1.1;
    const nxd = Math.round(TERRACE.w / ps), nzd = Math.round(TERRACE.d / ps);
    for (let i = 0; i < nxd; i++) {
      for (let k = 0; k < nzd; k++) {
        B.add(-TERRACE.w / 2 + (i + 0.5) * TERRACE.w / nxd, TERRACE.h + DECK / 2, -TERRACE.d / 2 + (k + 0.5) * TERRACE.d / nzd,
          B.shrink(TERRACE.w / nxd / 2), B.shrink(DECK / 2), B.shrink(TERRACE.d / nzd / 2), M.LIMESTONE);
      }
    }
    // The parapet round the deck's edge, with its merlons; open where the
    // gate stands on the south edge.
    courses(deckTop, deckTop + PARAPET, course, (y, h, c) => {
      const top = y + h > deckTop + PARAPET - 0.01;
      const gate = BLOCKS.find((b) => b.tag === 'gate');
      B.openings((x, _y, z) => z > TERRACE.d / 2 - 2.0 && Math.abs(x - gate.cx) < gate.w / 2 + GAP, () => {
        B.ring(0, 0, TERRACE.w - 0.6, TERRACE.d - 0.6, 1.2, y, h, stone, M.LIMESTONE, c % 2, top ? merlons : null);
      });
    });
  });

  // ── A palace block on the deck: walls with rows of windows and lintels,
  // two cross walls inside, the floors as galleries, a flat roof of one
  // course within span of a wall everywhere, and a parapet with merlons.
  const block = (b) => {
    const y0 = deckTop;
    const mat = M[b.mat];
    const hw = b.w / 2, hd = b.d / 2;
    const bays = (half) => {
      const out = [];
      const n = Math.max(1, Math.floor((2 * half - 2 * 2.6) / 5.0));
      for (let i = 0; i < n; i++) out.push(-half + 2.6 + 2.5 + (i + 0.5) * (2 * half - 2 * 2.6 - 5.0) / Math.max(1, n));
      return out.filter((a) => Math.abs(a) < half - 2.6 - b.win / 2);
    };
    const gapsX = bays(hw).map((a) => [b.cx + a - b.win / 2, b.cx + a + b.win / 2]);
    const gapsZ = bays(hd).map((a) => [b.cz + a - b.win / 2, b.cz + a + b.win / 2]);
    const winH = 2.6;
    B.section(b.tag, () => {
      courses(y0, y0 + b.h, course, (y, h, c) => {
        const yc = y + h / 2;
        const row = b.rows.find((r) => yc > y0 + r && yc < y0 + r + winH);
        const lintelRow = b.rows.find((r) => y < y0 + r + winH + 0.02 && y + h > y0 + r + winH - 0.02 && !(yc > y0 + r && yc < y0 + r + winH));
        const door = b.door && yc < y0 + b.door * 1.4;
        const doorLintel = b.door && !door && y < y0 + b.door * 1.4 + 0.02 && y + h > y0 + b.door * 1.4 - 0.02;
        const band = b.band && ((yc > y0 + b.rows[0] - course * 1.6 && yc < y0 + b.rows[0] - course * 0.5) || yc > y0 + b.h - course * 1.1);
        const g = {};
        if (row !== undefined || lintelRow !== undefined) { g.n = gapsX; g.s = gapsX; g.w = gapsZ; g.e = gapsZ; }
        if (door || doorLintel) { g.s = [...(g.s || []), [b.cx - b.door / 2, b.cx + b.door / 2]]; g.n = [...(g.n || []), [b.cx - b.door / 2, b.cx + b.door / 2]]; }
        const lintel = lintelRow !== undefined || doorLintel;
        box(b.cx, b.cz, b.w, b.d, WALL, y, h, c, stone, band ? M.TILE : mat, g, lintel ? 0.8 : 0, band ? 0.2 : 0);
        // Two cross walls, thirds of the depth, running the width.
        if (!b.door) {
          for (const k of [-1, 1]) {
            B.slab(b.cx, yc, b.cz + k * b.d / 6, b.w - 2 * WALL - 2 * GAP, h, WALL, stone, mat);
          }
        }
      });
      // The roof: one course over the walls' top, inside the parapet.
      B.slab(b.cx, y0 + b.h + course * 0.3, b.cz, b.w - WALL, course * 0.6, b.d - WALL, stone, M.SLATE);
      courses(y0 + b.h, y0 + b.h + PARAPET * 0.7, course * 0.8, (y, h, c) => {
        const top = y + h > y0 + b.h + PARAPET * 0.7 - 0.01;
        B.ring(b.cx, b.cz, b.w + 0.3, b.d + 0.3, WALL * 0.7, y, h, stone, mat, c % 2, top ? merlons : null);
      });
    });
  };
  for (const b of BLOCKS) block(b);

  // ── The clock tower: a square shaft with slit windows, a clock stage in
  // white, a slate pyramid roof.
  B.section('clocktower', () => {
    const y0 = deckTop;
    const { cx, cz, w } = TOWER;
    courses(y0, y0 + TOWER.h, course, (y, h, c) => {
      const yc = y + h / 2 - y0;
      const clock = yc > TOWER.h - 6.0;
      const slit = !clock && Math.abs(((yc + 100) % 7.0) - 4.0) < 1.0;
      const lintel = !clock && !slit && Math.abs(((y + h / 2 - y0 + 100) % 7.0) - 5.4) < h * 0.55;
      const g = slit || lintel ? { n: [[cx - 0.6, cx + 0.6]], s: [[cx - 0.6, cx + 0.6]], w: [[cz - 0.6, cz + 0.6]], e: [[cz - 0.6, cz + 0.6]] } : {};
      box(cx, cz, w, w, WALL, y, h, c, stone, clock ? M.LIMESTONE : M.SANDSTONE, g, lintel ? 0.7 : 0, clock && yc < TOWER.h - 5.0 ? 0.25 : 0);
    });
    // The roof: courses stepping in to a point.
    courses(y0 + TOWER.h, y0 + TOWER.h + TOWER.roof, course * 0.7, (y, h, c, n) => {
      const t = (y - y0 - TOWER.h) / TOWER.roof;
      const ww = w * (1 - t * 0.9);
      B.slab(cx, y + h / 2, cz, ww, h, ww, stone, M.SLATE);
    });
  });

  // ── The round bastion: a drum on its own footing at the south-west
  // corner, a hand clear of the terrace, rubble-filled to the deck, hollow
  // above with a gallery floor, battlements, and a shallow dome.
  B.section('bastion', () => {
    const { cx, cz, r, wall } = BASTION;
    courses(FOUND, ROUGH, roughCourse, (y, h, c) => B.drum(cx, cz, y, y + h, r, wall, h, rough, M.RUBBLE));
    courses(ROUGH, BASTION.h, course, (y, h, c) => {
      const yc = y + h / 2;
      const top = y + h > BASTION.h - 0.01;
      const sides = Math.max(12, Math.round((2 * Math.PI * (r - wall / 2)) / stone));
      const slot = yc > deckTop + 4.0 && yc < deckTop + 6.4;
      B.openings((x, _y, z) => slot && (Math.floor(Math.atan2(z - cz, x - cx) / (Math.PI / 4) + 8) % 2 === 0)
        && Math.abs(((Math.atan2(z - cz, x - cx) + 10 * Math.PI) % (Math.PI / 4)) - Math.PI / 8) < 0.08, () => {
        B.polyRing(cx, cz, BlockList.circle(r - wall / 2, sides, (c % 2) * (Math.PI / sides)), wall, y, h, stone, M.LIMESTONE, 0,
          top ? (x, z) => (Math.floor((Math.atan2(z - cz, x - cx) + 10) / 0.35) % 2 ? 0.35 : 0) : null);
      });
    });
    // The fill, to the deck: solid discs on a fixed grid.
    const pitch = rough;
    const n = Math.ceil(r / pitch) + 1;
    courses(FOUND, deckTop, roughCourse, (y, h) => {
      for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
        const px = (i + 0.5) * pitch, pz = (j + 0.5) * pitch;
        if (Math.hypot(px, pz) + pitch * 0.71 > r - wall - GAP) continue;
        B.add(cx + px, y + h / 2, cz + pz, B.shrink(pitch / 2), B.shrink(h / 2), B.shrink(pitch / 2), M.RUBBLE);
      }
    });
    // A gallery floor a stone wide inside the wall at the slot level.
    B.polyRing(cx, cz, BlockList.circle(r - wall - GAP - stone * 0.6, 20), stone * 1.2, deckTop + 3.0, course * 0.6, stone, M.SLATE);
    // The dome, on the drum's top course, closing over the hollow.
    B.dome(cx, cz, BASTION.h, BASTION.dome, r - 0.3, wall * 0.9, course * 0.7, stone * 0.9, M.LIMESTONE,
      (t) => Math.sqrt(Math.max(0, 1 - t * t)));
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen at the palace windows on both storeys; machine
 * guns on the terrace parapet at the corners; snipers on the clock tower's
 * clock stage and the bastion's battlements; anti-tank teams at the gate
 * and on the deck's south edge; mortars in the Arches Yard between the
 * monastery and the New Palace.
 */
export function populatePena(g, origin, groundY) {
  const K = PENA;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  // Windows: one man per face per row on the big blocks.
  for (const b of K.blocks) {
    if (b.tag === 'gate' || b.tag === 'chapel') continue;
    b.rows.forEach((ry, i) => {
      for (const sz of [-1, 1]) {
        g.place(i ? 'rifleman' : 'mg', V(b.cx + (sz > 0 ? 4 : -4), ry + 0.3, b.cz + sz * (b.d / 2 - b.wall / 2 - 0.6)), sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
      }
      for (const sx of [-1, 1]) {
        g.place('rifleman', V(b.cx + sx * (b.w / 2 - b.wall / 2 - 0.6), ry + 0.3, b.cz + (sx > 0 ? 4 : -4)), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'window' });
      }
    });
  }
  // The terrace parapet: machine guns at the corners, riflemen along the sides.
  const T = K.terrace;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    g.place('mg', V(sx * (T.w / 2 - 3.0), T.h + 0.3, sz * (T.d / 2 - 3.0)), Math.atan2(sx, sz), 7, { cover: 'roof' });
  }
  for (const sx of [-1, 1]) {
    for (const z of [-T.d * 0.3, T.d * 0.3]) {
      g.place('rifleman', V(sx * (T.w / 2 - 3.0), T.h + 0.3, z), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 7, { cover: 'roof' });
    }
  }
  // Snipers on the clock tower and the bastion.
  for (const sx of [-1, 1]) {
    g.place('sniper', V(K.tower.cx + sx * (K.tower.w / 2 - 1.6), K.tower.top - 3.0 * K.scale, K.tower.cz), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 7, { cover: 'window' });
  }
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * 0.75 + i * (Math.PI / 3);
    g.place(i === 1 ? 'sniper' : 'rifleman', V(K.bastion.cx + Math.cos(a) * (K.bastion.r - 3.0), K.bastion.top + 0.3, K.bastion.cz + Math.sin(a) * (K.bastion.r - 3.0)), Math.atan2(Math.cos(a), Math.sin(a)), 8, { cover: 'roof' });
  }
  // Anti-tank teams at the gate and the deck's south edge.
  const gate = K.blocks.find((b) => b.tag === 'gate');
  g.place('at', V(gate.cx, T.h + 0.3, gate.cz - gate.d / 2 - 3.0), 0, 7, { cover: 'arcade' });
  for (const sx of [-1, 1]) {
    g.place('at', V(sx * (T.w / 2 - 6.0), T.h + 0.3, T.d / 2 - 4.0), 0, 7, { cover: 'roof' });
  }
  // Mortars in the yard between the monastery and the New Palace.
  const mon = K.blocks.find((b) => b.tag === 'monastery'), np = K.blocks.find((b) => b.tag === 'newpalace');
  const yz = (mon.cz + mon.d / 2 + np.cz - np.d / 2) / 2;
  for (const x of [-12, 0, 12]) g.place('mortar', V(x, T.h + 0.3, yz), 0, 7, { cover: 'roof' });
}
