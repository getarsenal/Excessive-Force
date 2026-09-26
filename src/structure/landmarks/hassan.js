import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Hassan II Mosque, Casablanca.
 *
 * Reference figures (Michel Pinseau's office, Bouygues; the plan from
 * tools/survey.py, which has the whole platform as one 270 x 182 m outline
 * centred thirty-four metres east of the origin):
 *   prayer hall       200 x 100 m, 60 m to the roof, on seventy-eight columns
 *                     of granite carrying the beams the roof lies on
 *   minaret           210 m on a 25 m square, the lantern and the jamur on top
 *   materials         Moroccan marble and granite, green zellige in bands
 *   the site          a platform built out into the Atlantic; the water is
 *                     forty metres north of the hall's north wall in the bake
 *
 * Kind: a cantilever standing on a shell. The hall is a walled box on a
 * colonnade — the Parthenon's problem at three times the height, its roof
 * lying on beams that lie on the columns — and the minaret is two hundred
 * metres of hollow square tower standing at the hall's south-west corner.
 * The twist is where it stands: the minaret's lowest storey is four corner
 * piers with an open arch through every face, so the tower is carried on
 * four points, and those points are inside the hall's corner. Take one pier
 * and two hundred metres of minaret goes over into the hall; take the hall's
 * columns and the roof comes down a bay at a time, but the minaret does not
 * care. The fight is the piers.
 *
 * Built at life size — the minaret is already the tallest thing in the
 * campaign after the Burj — in MARBLE, with VERDE for the green bands (the
 * game's TILE is off-white; the zellige here is green) and GILT for the
 * jamur.
 */

const S = 1.0;
const STONE_FINENESS = 1.0;
const STONE = M.MARBLE;
const BAND = M.VERDE;

// Real metres, +x east, +z south.
const HALL = { cx: 30.0, cz: 0.0, w: 200.0, d: 100.0, h: 50.0, wall: 3.0, ledge: 1.5 };
const BAYS_X = 14, BAYS_Z = 7;                    // 13 x 6 = 78 columns
const COL = { w: 2.6, h: 44.0, capW: 3.4, capH: 1.5 };
const BEAM = { w: 3.0, h: 2.5 };
const ROOF_T = 0.9;
const BEAM_TOP = COL.h + COL.capH + BEAM.h;       // 48.0: the roof's underside
const ROOF_TOP = BEAM_TOP + ROOF_T;
// Windows in the hall's long walls: tall arched lights between the columns
// and a row of small ones above.
const WIN = { w: 4.5, y0: 8.0, y1: 28.0 };
const WIN2 = { w: 2.4, y0: 38.0, y1: 42.0 };
// The minaret, at the hall's south-west corner, on four piers.
const MIN = { w: 25.0, wall: 4.0, pierTop: 20.0, arch: 6.0, archTop: 12.0, shaftTop: 175.0, lanternW: 14.0, lanternTop: 200.0, jamurTop: 212.0 };
MIN.cx = HALL.cx - HALL.w / 2 + MIN.w / 2;
MIN.cz = HALL.cz + HALL.d / 2 - MIN.w / 2;
MIN.windows = [60.0, 100.0, 140.0];
// The esplanade round the hall: an apron of paving a man's width, one course.
const APRON = { out: 24.0, h: 1.4 };
const GAP = 0.12;

const colsX = Array.from({ length: BAYS_X - 1 }, (_, i) => HALL.cx - HALL.w / 2 + (HALL.w / BAYS_X) * (i + 1));
const colsZ = Array.from({ length: BAYS_Z - 1 }, (_, j) => HALL.cz - HALL.d / 2 + (HALL.d / BAYS_Z) * (j + 1));
const inMinaret = (x, z, m = 0) => Math.abs(x - MIN.cx) < MIN.w / 2 + m && Math.abs(z - MIN.cz) < MIN.w / 2 + m;

/** What the garrison, the flag and the level record read. */
export const HASSAN = {
  scale: S,
  hall: { cx: HALL.cx * S, cz: HALL.cz * S, w: HALL.w * S, d: HALL.d * S, h: HALL.h * S, wall: HALL.wall * S },
  roofTop: ROOF_TOP * S,
  colsX: colsX.map((x) => x * S), colsZ: colsZ.map((z) => z * S),
  win: { y0: WIN.y0 * S, y1: WIN.y1 * S }, win2: { y0: WIN2.y0 * S },
  minaret: { cx: MIN.cx * S, cz: MIN.cz * S, w: MIN.w * S, wall: MIN.wall * S, windows: MIN.windows.map((y) => y * S), top: MIN.jamurTop * S },
  apron: { out: APRON.out * S, h: APRON.h * S },
  /** Rooflines a man can be posted on, low to high. */
  galleries: [APRON.h * S, ROOF_TOP * S, MIN.lanternTop * S],
  // The flag flies from the lantern's roof, beside the jamur.
  flag: { x: (MIN.cx + 4.0) * S, y: (MIN.lanternTop + 0.5) * S, z: (MIN.cz + 4.0) * S },
};

export function buildHassan(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.25 * s;
  const course = 1.3 * s;
  const wallStone = stone * 1.5;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  /**
   * One course of a straight wall along `axis` at the other coordinate `c`,
   * from a0 to a1, leaving `gaps` ([from, to] along the run) as openings, the
   * joints bonded by a half stone on odd courses. `out` is the outward normal
   * sign for `proud`, which lays the course thicker on that side.
   */
  const run = (axis, c, a0, a1, y, h, thick, st, mat, stagger, gaps = [], proud = 0, out = 1) => {
    const segs = [];
    let cur = a0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > cur + 0.05) segs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (a1 > cur + 0.05) segs.push([cur, a1]);
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      // No slivers: a stone a third of a stone wide is a fuse under whatever
      // stands on it, since load is shared by count of supporters.
      if (len < st * 0.35) continue;
      const n = Math.max(1, Math.round(len / st));
      const parts = [];
      if (stagger && n > 1) {
        const full = len / n;
        parts.push([s0, s0 + full / 2]);
        for (let i = 0; i < n - 1; i++) parts.push([s0 + full / 2 + i * full, s0 + full / 2 + (i + 1) * full]);
        parts.push([s1 - full / 2, s1]);
      } else {
        for (let i = 0; i < n; i++) parts.push([s0 + len * i / n, s0 + len * (i + 1) / n]);
      }
      for (const [p0, p1] of parts) {
        const mid = (p0 + p1) / 2, half = B.shrink((p1 - p0) / 2);
        const cc = c + out * proud / 2;
        if (axis === 'x') B.add(mid, y + h / 2, cc, half, B.shrink(h / 2), thick / 2 + proud / 2, mat);
        else B.add(cc, y + h / 2, mid, thick / 2 + proud / 2, B.shrink(h / 2), half, mat);
      }
    }
  };
  /**
   * One course of a hollow box, four bonded faces, with gaps per face given
   * in that face's own along-coordinate. Faces: n (z = cz - d/2, along x),
   * s, w (x = cx - w/2, along z), e. `lintel` lays a stone across each gap
   * plus its bearing, proud of the face.
   */
  const box = (cx, cz, w, d, wall, y, h, c, st, mat, gaps = {}, lintel = 0, proud = 0) => {
    const hw = w / 2, hd = d / 2;
    const even = c % 2 === 0;
    const face = (axis, cc, a0, a1, out, g) => {
      let gl = (g || []).map(([p, q]) => (lintel ? [p - lintel, q + lintel] : [p, q])).sort((p, q) => p[0] - q[0]);
      if (lintel) {
        // A lintel that would leave less than a stone and a half of pier
        // beside it runs on to the face's end, or joins the next lintel: a
        // stub a stone wide under a tower is crushed on the first frame.
        const min = st * 1.5;
        const merged = [];
        for (const [p, q] of gl) {
          const last = merged[merged.length - 1];
          if (last && p - last[1] < min) last[1] = q;
          else merged.push([p, q]);
        }
        gl = merged.map(([p, q]) => [p - a0 < min ? a0 - 0.5 : p, a1 - q < min ? a1 + 0.5 : q]);
      }
      // Bonded by the corner interlock, not by half stones: a half stone at a
      // corner takes half the corner's load on a quarter of the area.
      run(axis, cc, a0, a1, y, h, wall, st, mat, 0, gl, proud, out);
      if (lintel) {
        for (let [p, q] of gl) {
          p = Math.max(p, a0); q = Math.min(q, a1);
          const mid = (p + q) / 2, half = (q - p) / 2 - 0.02;
          const cc2 = cc + out * 0.3 / 2;
          if (axis === 'x') B.add(mid, y + h / 2, cc2, half, h / 2 - 0.01, wall / 2 + 0.15, mat);
          else B.add(cc2, y + h / 2, mid, wall / 2 + 0.15, h / 2 - 0.01, half, mat);
        }
      }
    };
    // Which pair runs through the corners swaps each course.
    const xa0 = even ? cx - hw + wall : cx - hw, xa1 = even ? cx + hw - wall : cx + hw;
    const za0 = even ? cz - hd : cz - hd + wall, za1 = even ? cz + hd : cz + hd - wall;
    face('x', cz - hd + wall / 2, xa0, xa1, -1, gaps.n);
    face('x', cz + hd - wall / 2, xa0, xa1, 1, gaps.s);
    face('z', cx - hw + wall / 2, za0, za1, -1, gaps.w);
    face('z', cx + hw - wall / 2, za0, za1, 1, gaps.e);
  };

  // ── The esplanade: one course of coarse pavers round the hall, a man's
  // floor and the garrison's ground.
  B.section('esplanade', () => {
    const w = HALL.w + 2 * APRON.out, d = HALL.d + 2 * APRON.out;
    const ps = stone * 2.6;
    const nx = Math.round(w / ps), nz = Math.round(d / ps);
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const x = HALL.cx - w / 2 + (i + 0.5) * w / nx, z = HALL.cz - d / 2 + (k + 0.5) * d / nz;
        // Not under the hall or the minaret: they have their own footing.
        if (Math.abs(x - HALL.cx) < HALL.w / 2 + 0.2 && Math.abs(z - HALL.cz) < HALL.d / 2 + 0.2) continue;
        B.add(x, APRON.h / 2, z, B.shrink(w / nx / 2), B.shrink(APRON.h / 2), B.shrink(d / nz / 2), STONE);
      }
    }
  });

  // ── The hall's walls. Thicker below the beams, where the roof's edge
  // slabs land on the ledge that leaves; tall arched lights between the
  // columns and small ones above, each with its lintel in the course grid;
  // a band of green zellige under the windows and at the top.
  B.section('hall', () => {
    const hw = HALL.w / 2, hd = HALL.d / 2;
    // Window positions along the long faces (x) and the short faces (z),
    // skipping the bays a corner or the minaret occupies.
    // The minaret takes the south-west corner: the south and west faces stop
    // at its walls, and the corner itself is the minaret's.
    const minE = MIN.cx + MIN.w / 2 + GAP, minN = MIN.cz - MIN.w / 2 - GAP;
    // A window keeps a stone and a half of pier between it and any end of
    // the masonry it is cut in: a corner, or the minaret's face.
    const MARGIN = 4.5;
    const rangeX = (z) => (z > HALL.cz ? [minE, hw + HALL.cx] : [HALL.cx - hw, HALL.cx + hw]);
    const rangeZ = (x) => (x < HALL.cx ? [HALL.cz - hd, minN] : [HALL.cz - hd, HALL.cz + hd]);
    const fits = ([p, q], [r0, r1]) => p - MARGIN > r0 && q + MARGIN < r1;
    const winsX = (z) => colsX.map((x) => [x - WIN.w / 2, x + WIN.w / 2]).filter((g) => fits(g, rangeX(z)));
    const winsZ = (x) => colsZ.map((z) => [z - WIN.w / 2, z + WIN.w / 2]).filter((g) => fits(g, rangeZ(x)));
    const smallX = (z) => colsX.map((x) => [x - WIN2.w / 2, x + WIN2.w / 2]).filter((g) => fits(g, rangeX(z)));
    const smallZ = (x) => colsZ.map((z) => [z - WIN2.w / 2, z + WIN2.w / 2]).filter((g) => fits(g, rangeZ(x)));
    courses(0, HALL.h, course, (y, h, c) => {
      const yc = y + h / 2;
      const wall = yc < BEAM_TOP ? HALL.wall + HALL.ledge : HALL.wall;
      // The outer face stays put; a thicker wall grows inward.
      const cx = HALL.cx, cz = HALL.cz, w = HALL.w, d = HALL.d;
      const inWin = yc > WIN.y0 && yc < WIN.y1, inWin2 = yc > WIN2.y0 && yc < WIN2.y1;
      const lintel = (!inWin && y < WIN.y1 + 0.02 && y + h > WIN.y1 - 0.02) || (!inWin2 && y < WIN2.y1 + 0.02 && y + h > WIN2.y1 - 0.02);
      const band = (yc > WIN.y0 - course * 1.6 && yc < WIN.y0 - course * 0.5) || yc > HALL.h - course * 1.1;
      const mat = band ? BAND : STONE;
      const gaps = inWin ? { n: winsX(cz - hd), s: winsX(cz + hd), w: winsZ(cx - hw), e: winsZ(cx + hw) }
        : inWin2 ? { n: smallX(cz - hd), s: smallX(cz + hd), w: smallZ(cx - hw), e: smallZ(cx + hw) }
          : lintel ? (yc < WIN.y1 + course ? { n: winsX(cz - hd), s: winsX(cz + hd), w: winsZ(cx - hw), e: winsZ(cx + hw) }
            : { n: smallX(cz - hd), s: smallX(cz + hd), w: smallZ(cx - hw), e: smallZ(cx + hw) }) : {};
      // The south face runs from the minaret's east wall; the west face from
      // its north wall. Laid as gaps at the minaret's end of those faces.
      gaps.s = [...(gaps.s || []), [cx - hw - 1, minE]];
      gaps.w = [...(gaps.w || []), [minN, cz + hd + 1]];
      // Lay the box with its inner face where the thickness says: a wall
      // that thickens inward keeps its outer face on the same plane.
      box(cx, cz, w - (wall - HALL.wall), d - (wall - HALL.wall), wall, y, h, c, wallStone, mat, gaps, lintel ? 1.0 : 0, band ? 0.25 : 0);
    });
  });

  // ── The columns: granite pillars in a square, capital on top.
  B.section('columns', () => {
    for (const x of colsX) {
      for (const z of colsZ) {
        if (inMinaret(x, z, 1.0)) continue;
        courses(0, COL.h, course, (y, h) => B.add(x, y + h / 2, z, B.shrink(COL.w / 2), B.shrink(h / 2), B.shrink(COL.w / 2), STONE));
        B.add(x, COL.h + COL.capH / 2, z, COL.capW / 2 - 0.02, COL.capH / 2 - 0.01, COL.capW / 2 - 0.02, STONE);
      }
    }
  });

  // ── The beams: along every row, from capital to capital and out to the
  // wall's ledge at either end, in three parallel stones.
  const ledgeX0 = HALL.cx - HALL.w / 2 + HALL.wall + HALL.ledge / 2, ledgeX1 = HALL.cx + HALL.w / 2 - HALL.wall - HALL.ledge / 2;
  const ledgeZ0 = HALL.cz - HALL.d / 2 + HALL.wall + HALL.ledge / 2, ledgeZ1 = HALL.cz + HALL.d / 2 - HALL.wall - HALL.ledge / 2;
  B.section('beams', () => {
    const y0 = COL.h + COL.capH, y1 = BEAM_TOP;
    for (const z of colsZ) {
      const xs = colsX.filter((x) => !inMinaret(x, z, 1.0));
      const pts = [ledgeX0, ...xs, ledgeX1];
      // A row the minaret cuts into starts at the minaret's face instead of
      // the ledge, and that end has nothing to rest on, so it is dropped.
      if (inMinaret(ledgeX0, z, 0)) pts.shift();
      for (let i = 0; i < pts.length - 1; i++) {
        for (let k = 0; k < 3; k++) {
          const zz = z - BEAM.w / 2 + (k + 0.5) * BEAM.w / 3;
          B.add((pts[i] + pts[i + 1]) / 2, (y0 + y1) / 2, zz, (pts[i + 1] - pts[i]) / 2 - 0.02, (y1 - y0) / 2 - 0.01, BEAM.w / 6 - 0.02, STONE);
        }
      }
    }
  });

  // ── The roof: slabs across the bays, beam to beam and beam to ledge,
  // running north-south, not laid where the minaret stands.
  B.section('roof', () => {
    const slabW = stone * 1.4;
    const rows = [ledgeZ0, ...colsZ, ledgeZ1];
    const n = Math.round((ledgeX1 - ledgeX0) / slabW);
    for (let j = 0; j < rows.length - 1; j++) {
      const z0 = rows[j], z1 = rows[j + 1];
      for (let i = 0; i < n; i++) {
        const x = ledgeX0 + (i + 0.5) * (ledgeX1 - ledgeX0) / n;
        if (inMinaret(x, z0, 1.0) || inMinaret(x, z1, 1.0)) continue;
        B.add(x, BEAM_TOP + ROOF_T / 2, (z0 + z1) / 2, (ledgeX1 - ledgeX0) / n / 2 - 0.02, ROOF_T / 2 - 0.01, (z1 - z0) / 2 - 0.02, STONE);
      }
    }
  });

  // ── The minaret. Four corner piers with an arch through every face, the
  // lintels in the course grid over them; the shaft on that, hollow, with
  // bands of green and a window at each face on three levels; the top
  // corbelled closed; the lantern; the jamur.
  B.section('minaret', () => {
    const { cx, cz, w, wall } = MIN;
    const archGap = [[-MIN.arch / 2, MIN.arch / 2]].map(([a, b]) => [a, b]);
    const gapsAt = (along0) => archGap.map(([a, b]) => [along0 + a, along0 + b]);
    const pierGaps = { n: gapsAt(cx), s: gapsAt(cx), w: gapsAt(cz), e: gapsAt(cz) };
    const winGaps = { n: [[cx - 1.2, cx + 1.2]], s: [[cx - 1.2, cx + 1.2]], w: [[cz - 1.2, cz + 1.2]], e: [[cz - 1.2, cz + 1.2]] };
    // Piers and arches.
    // Big stones in the piers: a lintel hands its load to the one or two
    // stones under each end, whatever their size, so the size is what
    // decides whether they hold two hundred metres of tower.
    courses(0, MIN.pierTop, course, (y, h, c) => {
      const yc = y + h / 2;
      const open = yc < MIN.archTop;
      const lintel = !open && y < MIN.archTop + course * 3.0;
      box(cx, cz, w, w, wall, y, h, c, wallStone, STONE, open || lintel ? pierGaps : {}, lintel ? 2.0 : 0);
    });
    // The shaft.
    courses(MIN.pierTop, MIN.shaftTop, course, (y, h, c) => {
      const yc = y + h / 2;
      const band = MIN.windows.some((wy) => yc > wy - course * 3.2 && yc < wy - course * 2.0) || yc > MIN.shaftTop - course * 1.1;
      const win = MIN.windows.some((wy) => yc > wy && yc < wy + 4.0);
      const lintel = MIN.windows.some((wy) => !win && y < wy + 4.0 + 0.02 && y + h > wy + 4.0 - 0.02);
      box(cx, cz, w, w, wall, y, h, c, stone, band ? BAND : STONE, win || lintel ? winGaps : {}, lintel ? 0.8 : 0, band ? 0.25 : 0);
    });
    // Closing the top: each course's wall a stone thicker than the last,
    // until the hollow is gone.
    const closeTop = MIN.shaftTop + course * 6;
    courses(MIN.shaftTop, closeTop, course, (y, h, c) => {
      const t = (c + 1) / 6;
      const wl = Math.min(w / 2, wall + (w / 2 - wall) * t);
      if (wl >= w / 2 - 0.3) B.slab(cx, y + h / 2, cz, w, h, w, stone, STONE);
      else box(cx, cz, w, w, wl, y, h, c, stone, STONE);
    });
    // The lantern, hollow, with a window in each face, and its roof.
    courses(closeTop, MIN.lanternTop, course, (y, h, c) => {
      const yc = y + h / 2;
      const mid = (closeTop + MIN.lanternTop) / 2;
      const win = yc > mid - 3.0 && yc < mid + 1.0;
      const lintel = !win && y < mid + 1.0 + 0.02 && y + h > mid + 1.0 - 0.02;
      const g = { n: [[cx - 1.0, cx + 1.0]], s: [[cx - 1.0, cx + 1.0]], w: [[cz - 1.0, cz + 1.0]], e: [[cz - 1.0, cz + 1.0]] };
      box(cx, cz, MIN.lanternW, MIN.lanternW, 3.0, y, h, c, stone, yc > MIN.lanternTop - course * 1.1 ? BAND : STONE, win || lintel ? g : {}, lintel ? 0.8 : 0);
    });
    // Its roof: three corbelled courses closing, then the jamur.
    courses(MIN.lanternTop, MIN.lanternTop + course * 3, course, (y, h, c) => {
      const wl = 3.0 + (MIN.lanternW / 2 - 3.0) * ((c + 1) / 3);
      if (wl >= MIN.lanternW / 2 - 0.3) B.slab(cx, y + h / 2, cz, MIN.lanternW, h, MIN.lanternW, stone, STONE);
      else box(cx, cz, MIN.lanternW, MIN.lanternW, wl, y, h, c, stone, STONE);
    });
    const jy = MIN.lanternTop + course * 3;
    B.pinnacle(cx, cz, jy, MIN.jamurTop - jy, 3.2, stone * 0.7, M.GILT);
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen and machine guns in the hall's tall windows, on
 * the sills, facing out; snipers in the minaret's windows on three levels;
 * anti-tank teams on the esplanade at the hall's corners behind sandbags;
 * mortars on the hall roof, where the walls hide them and the arc clears.
 */
export function populateHassan(g, origin, groundY) {
  const K = HASSAN;
  const H = K.hall;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const sill = K.win.y0 + 0.3;
  // The long faces: every other window.
  K.colsX.forEach((x, i) => {
    if (i === 0 || i === K.colsX.length - 1 || i % 2) return;
    for (const sz of [-1, 1]) {
      const z = H.cz + sz * H.d / 2;
      if (Math.abs(x - K.minaret.cx) < K.minaret.w / 2 + 2 && Math.abs(z - K.minaret.cz) < K.minaret.w / 2 + 2) continue;
      g.place(i % 4 === 2 ? 'mg' : 'rifleman', V(x, sill, z - sz * 1.2), sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
    }
  });
  // The short faces.
  K.colsZ.forEach((z, j) => {
    if (j === 0 || j === K.colsZ.length - 1) return;
    for (const sx of [-1, 1]) {
      const x = H.cx + sx * H.w / 2;
      if (Math.abs(x - K.minaret.cx) < K.minaret.w / 2 + 2 && Math.abs(z - K.minaret.cz) < K.minaret.w / 2 + 2) continue;
      g.place(j === 2 ? 'mg' : 'rifleman', V(x - sx * 1.2, sill, z), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'window' });
    }
  });
  // The minaret's windows: a sniper on each of three levels on the two faces
  // that look away from the hall, a rifleman on the others.
  const Mn = K.minaret;
  Mn.windows.forEach((wy, k) => {
    const faces = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    faces.forEach(([fx, fz], f) => {
      const away = (fx < 0 || fz > 0);
      const type = away ? 'sniper' : (k === 1 ? 'mg' : 'rifleman');
      g.place(type, V(Mn.cx + fx * (Mn.w / 2 - Mn.wall / 2 - 0.8), wy + 0.3, Mn.cz + fz * (Mn.w / 2 - Mn.wall / 2 - 0.8)), Math.atan2(fx, fz), 6, { cover: 'window' });
    });
  });
  // Anti-tank teams on the esplanade at the corners, facing the land.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    g.place('at', V(H.cx + sx * (H.w / 2 + 8), K.apron.h + 0.3, H.cz + sz * (H.d / 2 + 8)), Math.atan2(sx, sz), 7, { cover: 'ground', sandbags: true });
  }
  // Mortars on the roof, between the rows, well inside the walls.
  for (const x of [K.colsX[3], K.colsX[7], K.colsX[10]]) {
    g.place('mortar', V(x + 5.0, K.roofTop + 0.3, H.cz + 7.0), 0, 7, { cover: 'roof' });
  }
}
