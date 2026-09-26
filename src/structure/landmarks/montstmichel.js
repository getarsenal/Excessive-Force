import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Mont-Saint-Michel: the abbey on the summit of the rock.
 *
 * Reference figures (Centre des monuments nationaux; the plan from
 * tools/survey.py):
 *   the rock            80 m at the summit, level for about 88 x 92 m, falling
 *                       to the sands 150 m out on every side, steepest north
 *                       and east; the bay floods at high water in the bake
 *   the church          64 x 42 m with its transepts, the nave floor at 80 m,
 *                       the spire to 157 m; the choir standing on the Crypte
 *                       des Gros Piliers over the east face
 *   La Merveille        two three-storey ranges along the north face, 35 m
 *                       high, the cloister on top of the western one at the
 *                       church's floor level
 *   the village         seventy surveyed houses, hotels and towers on the
 *                       south-east benches, 70 to 120 m out, inside the
 *                       ramparts: the survey has them all by name and the
 *                       level keeps them
 *
 * Kind: a mountain with a spire. The rock is the bake's and nothing is
 * flattened: every wall is founded under the summit and run up, coarse where
 * it is inside the rock, dressed where the face falls away and the wall
 * shows — which along the north face is the whole thirty-five metres of the
 * Merveille, and on the east is the crypt under the choir. The twist is the
 * crypts: the church stands on the summit only at its nave; the choir and
 * the north transept stand on crypts built out over the rock's flanks. Break
 * a crypt and the church above it goes down the face.
 *
 * LIMESTONE for the granite, SLATE for the roofs, GILT for the archangel.
 */

const S = 1.3;
const STONE_FINENESS = 0.9;
// The footings, in real metres under the summit; the rock under each part is
// nearer than this everywhere, so the courses below are buried.
const FOUND = { crypt: -32.0, transept: -20.0, merveille: -36.0, logis: -16.0, nave: -6.0 };
// Below this the masonry is inside the rock: coarse and bare.
const ROUGH = -14.0;

// Real metres, +x east, +z south; the origin is the summit, the nave floor.
const WALL = 2.5;
const NAVE = { x0: -24.0, x1: 14.0, z0: -10.0, z1: 10.0, h: 22.0 };
const CROSSING = { x0: 14.0, x1: 26.0, z0: -21.0, z1: 21.0, h: 22.0 };
const TOWER = { cx: 20.0, cz: 0.0, w: 14.0, top: 46.0 };
const SPIRE = { base: 12.0, tip: 1.2, top: 77.0, angel: 4.5 };
const CHOIR = { x0: 26.0, x1: 46.0, z0: -9.0, z1: 9.0, h: 22.0 };
const ROOF = { rise: 9.0 };                       // the gables, corbelled to a ridge
const MERVEILLE = { x0: -40.0, x1: 30.0, z0: -45.0, z1: -23.0, top: 2.0, wall: 2.5, floors: [-26.0, -14.0], windows: [-31.0, -20.0, -9.0], bay: 10.0 };
const CLOISTER = { x0: -38.0, x1: -12.0, z0: -43.0, z1: -25.0, h: 5.5, arch: 2.2 };
const LOGIS = { x0: -10.0, x1: 30.0, z0: 12.0, z1: 30.0, top: 0.0, h: 12.0 };
const GAP = 0.15;

/** What the garrison, the flag and the level record read. */
export const MONTSTMICHEL = {
  scale: S,
  nave: { x0: NAVE.x0 * S, x1: NAVE.x1 * S, z0: NAVE.z0 * S, z1: NAVE.z1 * S, top: NAVE.h * S },
  crossing: { x0: CROSSING.x0 * S, x1: CROSSING.x1 * S, z0: CROSSING.z0 * S, z1: CROSSING.z1 * S },
  choir: { x0: CHOIR.x0 * S, x1: CHOIR.x1 * S, z0: CHOIR.z0 * S, z1: CHOIR.z1 * S, top: CHOIR.h * S },
  tower: { cx: TOWER.cx * S, cz: TOWER.cz * S, w: TOWER.w * S, top: TOWER.top * S },
  merveille: { x0: MERVEILLE.x0 * S, x1: MERVEILLE.x1 * S, z0: MERVEILLE.z0 * S, z1: MERVEILLE.z1 * S, top: MERVEILLE.top * S,
    windows: MERVEILLE.windows.map((y) => y * S), wall: MERVEILLE.wall * S },
  cloister: { x0: CLOISTER.x0 * S, x1: CLOISTER.x1 * S, z0: CLOISTER.z0 * S, z1: CLOISTER.z1 * S, floor: MERVEILLE.top * S },
  logis: { x0: LOGIS.x0 * S, x1: LOGIS.x1 * S, z0: LOGIS.z0 * S, z1: LOGIS.z1 * S, top: (LOGIS.top + LOGIS.h) * S },
  wall: WALL * S,
  /** Rooflines a man can be posted on, low to high. */
  galleries: [MERVEILLE.top * S, NAVE.h * S, TOWER.top * S],
  // The flag flies from the tower's top, beside the spire's foot.
  flag: { x: (TOWER.cx + TOWER.w / 2 - 1.0) * S, y: (TOWER.top + 0.5) * S, z: (TOWER.cz + TOWER.w / 2 - 1.0) * S },
};

export function buildMontstmichel(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.4 * s;
  const course = 1.0 * s;
  const rough = stone * 3.0, roughCourse = course * 3.0;
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
   * One course of a hollow box on [x0,x1] x [z0,z1], four faces bonded by
   * the corner interlock; gaps per face (n, s, w, e) in the face's own
   * along-coordinate; `lintel` is the bearing of the stone laid over each
   * gap; `proud` a band; `omit` a set of faces not laid ('n','s','w','e').
   */
  const box = (x0, x1, z0, z1, wall, y, h, c, st, mat, gaps = {}, lintel = 0, proud = 0, omit = '', relief = null) => {
    const even = c % 2 === 0;
    const face = (axis, cc, a0, a1, out, g, name) => {
      if (omit.includes(name)) return;
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
      const pr = relief ? relief(name, y) : proud;
      run(axis, cc, a0, a1, y, h, wall, st, mat, gl, pr, out);
      if (lintel) {
        for (let [p, q] of gl) {
          p = Math.max(p, a0); q = Math.min(q, a1);
          const mid = (p + q) / 2, half = (q - p) / 2 - 0.02;
          const cc2 = cc + out * (pr + 0.25) / 2;
          if (axis === 'x') B.add(mid, y + h / 2, cc2, half, h / 2 - 0.01, wall / 2 + (pr + 0.25) / 2, mat);
          else B.add(cc2, y + h / 2, mid, wall / 2 + (pr + 0.25) / 2, h / 2 - 0.01, half, mat);
        }
      }
    };
    const xa0 = even ? x0 + wall : x0, xa1 = even ? x1 - wall : x1;
    const za0 = even ? z0 : z0 + wall, za1 = even ? z1 : z1 - wall;
    face('x', z0 + wall / 2, xa0, xa1, -1, gaps.n, 'n');
    face('x', z1 - wall / 2, xa0, xa1, 1, gaps.s, 's');
    face('z', x0 + wall / 2, za0, za1, -1, gaps.w, 'w');
    face('z', x1 - wall / 2, za0, za1, 1, gaps.e, 'e');
  };
  /** Buried masonry is coarse and bare; the face's own grain above the rock. */
  const grain = (y) => (y < ROUGH ? { st: rough, co: roughCourse, mat: M.RUBBLE } : { st: stone, co: course, mat: M.LIMESTONE });
  const walls = (x0, x1, z0, z1, wall, y0, y1, fn) => {
    if (y0 < ROUGH) courses(y0, Math.min(ROUGH, y1), roughCourse, (y, h, c) => fn(y, h, c, rough, M.RUBBLE));
    if (y1 > ROUGH) courses(Math.max(ROUGH, y0), y1, course, (y, h, c) => fn(y, h, c, stone, M.LIMESTONE));
  };
  /**
   * A gable roof: courses of two runs stepping in from the eaves by less
   * than a stone each course until they meet at the ridge. It carries
   * itself, and it is what the roof is.
   */
  const gable = (x0, x1, z0, z1, y0, rise, along = 'x') => {
    const n = Math.max(3, Math.round(rise / (course * 0.8)));
    const ch = rise / n;
    const span = along === 'x' ? z1 - z0 : x1 - x0;
    const step = Math.min(stone * 0.8, span / 2 / n);
    for (let k = 0; k < n; k++) {
      const inset = k * step;
      const y = y0 + k * ch;
      const half = span / 2 - inset;
      const thick = Math.min(step * 1.3 + 0.4, half);
      if (half <= thick) {
        // The ridge: one run closes it.
        if (along === 'x') B.slab((x0 + x1) / 2, y + ch / 2, (z0 + z1) / 2, x1 - x0, ch, Math.max(2 * half, stone * 0.6), stone, M.SLATE);
        else B.slab((x0 + x1) / 2, y + ch / 2, (z0 + z1) / 2, Math.max(2 * half, stone * 0.6), ch, z1 - z0, stone, M.SLATE);
        return;
      }
      for (const side of [-1, 1]) {
        const c = along === 'x' ? (z0 + z1) / 2 + side * (half - thick / 2) : (x0 + x1) / 2 + side * (half - thick / 2);
        if (along === 'x') run('x', c, x0, x1, y, ch, thick, stone, M.SLATE);
        else run('z', c, z0, z1, y, ch, thick, stone, M.SLATE);
      }
    }
  };
  /** Window gaps along a face between a0 and a1, `bay` apart, `w` wide, a stone and a half off the ends. */
  const wins = (a0, a1, bay, w, margin) => {
    const out = [];
    const n = Math.floor((a1 - a0 - 2 * margin) / bay);
    const start = (a0 + a1) / 2 - ((n - 1) * bay) / 2;
    for (let i = 0; i < n; i++) out.push([start + i * bay - w / 2, start + i * bay + w / 2]);
    return out.filter(([p, q]) => p - margin > a0 && q + margin < a1);
  };
  const MARGIN = stone * 1.6;

  // ── The crypts: the choir's and the north transept's, walls from the
  // footing to the church floor, the choir's with its four great piers.
  B.section('crypts', () => {
    walls(CHOIR.x0, CHOIR.x1, CHOIR.z0, CHOIR.z1, WALL + 1.0, FOUND.crypt, 0, (y, h, c, st, mat) => {
      box(CHOIR.x0, CHOIR.x1, CHOIR.z0, CHOIR.z1, WALL + 1.0, y, h, c, st, mat, {}, 0, 0, '');
      if (y > ROUGH) {
        for (const px of [CHOIR.x0 + 7.0, CHOIR.x1 - 7.0]) for (const pz of [-3.5, 3.5]) {
          B.slab(px, y + h / 2, pz, 3.0, h, 3.0, st, mat);
        }
      }
    });
    walls(CROSSING.x0, CROSSING.x1, CROSSING.z0, NAVE.z0, WALL + 1.0, FOUND.transept, 0, (y, h, c, st, mat) => {
      box(CROSSING.x0, CROSSING.x1, CROSSING.z0, NAVE.z0 - GAP, WALL + 1.0, y, h, c, st, mat, {}, 0, 0, '');
    });
    // Under the nave and the south arm the rock is at the summit: a shallow
    // footing only.
    walls(NAVE.x0, NAVE.x1, NAVE.z0, NAVE.z1, WALL, FOUND.nave, 0, (y, h, c, st, mat) => box(NAVE.x0, NAVE.x1, NAVE.z0, NAVE.z1, WALL, y, h, c, st, mat, {}, 0, 0, 'e'));
    walls(CROSSING.x0, CROSSING.x1, NAVE.z1, CROSSING.z1, WALL, FOUND.nave, 0, (y, h, c, st, mat) => box(CROSSING.x0, CROSSING.x1, NAVE.z1 + GAP, CROSSING.z1, WALL, y, h, c, st, mat, {}, 0, 0, ''));
    walls(CROSSING.x0, CROSSING.x1, NAVE.z0, NAVE.z1, WALL, FOUND.nave, 0, (y, h, c, st, mat) => box(CROSSING.x0, CROSSING.x1, NAVE.z0, NAVE.z1, WALL, y, h, c, st, mat, {}, 0, 0, 'n s'));
  });

  // ── The church: nave, crossing with its tower, transepts, choir; tall
  // windows with lintels, gable roofs.
  const winH = 6.0, winY = 8.0;
  const churchBox = (x0, x1, z0, z1, h, omit, y, ch, c) => {
    const yc = y + ch / 2;
    const inWin = yc > winY && yc < winY + winH;
    const lintel = !inWin && y < winY + winH + 0.02 && y + ch > winY + winH - 0.02;
    const g = inWin || lintel ? {
      n: wins(x0, x1, 6.0, 2.2, MARGIN), s: wins(x0, x1, 6.0, 2.2, MARGIN),
      w: wins(z0, z1, 6.0, 2.2, MARGIN), e: wins(z0, z1, 6.0, 2.2, MARGIN),
    } : {};
    // Buttresses: a pilaster standing proud between the windows.
    box(x0, x1, z0, z1, WALL, y, ch, c, stone, M.LIMESTONE, g, lintel ? 0.8 : 0, 0, omit,
      (name, yy) => (yy < h - course * 1.2 ? 0 : 0.2));
  };
  B.section('church', () => {
    courses(0, NAVE.h, course, (y, h, c) => churchBox(NAVE.x0, NAVE.x1, NAVE.z0, NAVE.z1, NAVE.h, 'e', y, h, c));
    courses(0, CROSSING.h, course, (y, h, c) => {
      // The crossing's arms: the north and south transepts, open to the
      // nave and the choir where those meet them.
      churchBox(CROSSING.x0, CROSSING.x1, CROSSING.z0, NAVE.z0 - GAP, CROSSING.h, 's', y, h, c);
      churchBox(CROSSING.x0, CROSSING.x1, NAVE.z1 + GAP, CROSSING.z1, CROSSING.h, 'n', y, h, c);
      // The crossing itself: the tower's foot, plain, west and east faces only
      // (the nave and choir walls meet the arms).
      box(CROSSING.x0, CROSSING.x1, NAVE.z0, NAVE.z1, WALL, y, h, c, stone, M.LIMESTONE, {}, 0, 0, 'n s');
    });
    courses(0, CHOIR.h, course, (y, h, c) => churchBox(CHOIR.x0, CHOIR.x1, CHOIR.z0, CHOIR.z1, CHOIR.h, 'w', y, h, c));
    // The roofs.
    gable(NAVE.x0, NAVE.x1, NAVE.z0, NAVE.z1, NAVE.h, ROOF.rise, 'x');
    gable(CHOIR.x0, CHOIR.x1, CHOIR.z0, CHOIR.z1, CHOIR.h, ROOF.rise, 'x');
    gable(CROSSING.x0, CROSSING.x1, CROSSING.z0, NAVE.z0 - GAP - WALL, CROSSING.h, ROOF.rise * 0.8, 'z');
    gable(CROSSING.x0, CROSSING.x1, NAVE.z1 + GAP + WALL, CROSSING.z1, CROSSING.h, ROOF.rise * 0.8, 'z');
    // The tower over the crossing, on the crossing's walls, with a
    // belfry stage of openings under its top.
    const T = TOWER;
    courses(CROSSING.h, T.top, course, (y, h, c) => {
      const yc = y + h / 2;
      const bel = yc > T.top - 8.0 && yc < T.top - 3.0;
      const lintel = !bel && y < T.top - 3.0 + 0.02 && y + h > T.top - 3.0 - 0.02;
      const g = bel || lintel ? { n: [[T.cx - 1.2, T.cx + 1.2]], s: [[T.cx - 1.2, T.cx + 1.2]], w: [[T.cz - 1.2, T.cz + 1.2]], e: [[T.cz - 1.2, T.cz + 1.2]] } : {};
      box(T.cx - T.w / 2, T.cx + T.w / 2, T.cz - T.w / 2, T.cz + T.w / 2, WALL, y, h, c, stone, M.LIMESTONE, g, lintel ? 0.8 : 0, yc > T.top - course * 1.1 ? 0.25 : 0);
    });
  });

  // ── The spire: on the tower's top, closing inward over its hollow first,
  // then the tapering shell, then the archangel.
  B.section('spire', () => {
    const T = TOWER;
    // Close the tower's hollow: each course's wall a stone thicker.
    const close = 4;
    courses(T.top, T.top + close * course, course, (y, h, c) => {
      const wl = Math.min(T.w / 2, WALL + (T.w / 2 - WALL) * ((c + 1) / close));
      if (wl >= T.w / 2 - 0.3) B.slab(T.cx, y + h / 2, T.cz, T.w, h, T.w, stone, M.LIMESTONE);
      else box(T.cx - T.w / 2, T.cx + T.w / 2, T.cz - T.w / 2, T.cz + T.w / 2, wl, y, h, c, stone, M.LIMESTONE);
    });
    const sy = T.top + close * course;
    B.spire(T.cx, T.cz, sy, SPIRE.top, SPIRE.base, SPIRE.tip, course * 0.9, stone * 0.9, M.LIMESTONE, 0.4);
    B.pinnacle(T.cx, T.cz, SPIRE.top, SPIRE.angel, 1.6, stone * 0.6, M.GILT);
  });

  // ── La Merveille: the ranges along the north face, three storeys of
  // windows, buttresses on the north face, cross walls every bay, gallery
  // floors, a deck at the top with the cloister on its west half and a
  // gable over its east half.
  B.section('merveille', () => {
    const Mv = MERVEILLE;
    const winW = 2.0, wH = 3.2;
    const crosses = [];
    for (let x = Mv.x0 + Mv.bay; x < Mv.x1 - Mv.bay / 2; x += Mv.bay) crosses.push(x);
    walls(Mv.x0, Mv.x1, Mv.z0, Mv.z1, Mv.wall, FOUND.merveille, Mv.top, (y, h, c, st, mat) => {
      const yc = y + h / 2;
      const row = Mv.windows.find((r) => yc > r && yc < r + wH);
      const lintel = Mv.windows.find((r) => y < r + wH + 0.02 && y + h > r + wH - 0.02 && !(yc > r && yc < r + wH));
      const g = (row !== undefined || lintel !== undefined) && y > ROUGH ? {
        n: wins(Mv.x0, Mv.x1, 5.0, winW, MARGIN), s: wins(Mv.x0, Mv.x1, 5.0, winW, MARGIN),
        w: wins(Mv.z0, Mv.z1, 5.0, winW, MARGIN), e: wins(Mv.z0, Mv.z1, 5.0, winW, MARGIN),
      } : {};
      box(Mv.x0, Mv.x1, Mv.z0, Mv.z1, Mv.wall, y, h, c, st, mat, g, lintel !== undefined ? 0.8 : 0, 0, '',
        // Buttresses: pilasters on the north face at every cross wall, and a
        // string course under each window row.
        (name, yy) => {
          if (yy < ROUGH) return 0;
          if (name === 'n') return 0.15;
          return 0;
        });
      if (y > ROUGH) {
        for (const x of crosses) B.slab(x, yc, (Mv.z0 + Mv.z1) / 2, Mv.wall, h, Mv.z1 - Mv.z0 - 2 * Mv.wall - 2 * GAP, st, mat);
      }
    });
    // The floors: galleries a stone and a half wide inside the walls.
    for (const fy of Mv.floors) {
      B.ring((Mv.x0 + Mv.x1) / 2, (Mv.z0 + Mv.z1) / 2, Mv.x1 - Mv.x0 - 2 * Mv.wall - 2 * GAP, Mv.z1 - Mv.z0 - 2 * Mv.wall - 2 * GAP, stone * 1.6, fy - course * 0.3, course * 0.6, stone, M.SLATE);
    }
    // The deck: one course over the whole top, every stone within span of a
    // wall or a cross wall.
    const dw = Mv.x1 - Mv.x0, dd = Mv.z1 - Mv.z0;
    const nx = Math.round(dw / (stone * 1.1)), nz = Math.round(dd / (stone * 1.1));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      B.add(Mv.x0 + (i + 0.5) * dw / nx, Mv.top + course * 0.3, Mv.z0 + (k + 0.5) * dd / nz, B.shrink(dw / nx / 2), B.shrink(course * 0.3), B.shrink(dd / nz / 2), M.LIMESTONE);
    }
    // The refectory's roof over the east half.
    gable(CLOISTER.x1 + 2.0, Mv.x1, Mv.z0, Mv.z1, Mv.top + course * 0.6, ROOF.rise * 0.7, 'x');
  });

  // ── The cloister: an arcade on the Merveille's deck, arches through
  // every face with their lintels.
  B.section('cloister', () => {
    const C = CLOISTER;
    const y0 = MERVEILLE.top + course * 0.6;
    courses(y0, y0 + C.h, course, (y, h, c) => {
      const yc = y + h / 2;
      const open = yc < y0 + C.h - course * 1.6;
      const lintel = !open && y < y0 + C.h - course * 0.5;
      const g = open || lintel ? {
        n: wins(C.x0, C.x1, 4.0, C.arch, MARGIN), s: wins(C.x0, C.x1, 4.0, C.arch, MARGIN),
        w: wins(C.z0, C.z1, 4.0, C.arch, MARGIN), e: wins(C.z0, C.z1, 4.0, C.arch, MARGIN),
      } : {};
      box(C.x0, C.x1, C.z0, C.z1, 1.6, y, h, c, stone, M.LIMESTONE, g, lintel ? 0.7 : 0);
    });
    // A lean-to roof round the walk: one course, inside the arcade.
    B.ring((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, C.x1 - C.x0 - 0.4, C.z1 - C.z0 - 0.4, 3.6, y0 + C.h, course * 0.6, stone, M.SLATE);
  });

  // ── The abbot's lodgings on the south face, a plain range founded down
  // the slope, with its roof.
  B.section('logis', () => {
    const L = LOGIS;
    walls(L.x0, L.x1, L.z0, L.z1, WALL, FOUND.logis, L.top + L.h, (y, h, c, st, mat) => {
      const yc = y + h / 2;
      const row = yc > L.top + 3.0 && yc < L.top + 5.6;
      const lintel = !row && y < L.top + 5.6 + 0.02 && y + h > L.top + 5.6 - 0.02;
      const g = row || lintel ? { s: wins(L.x0, L.x1, 5.0, 1.8, MARGIN), e: wins(L.z0, L.z1, 5.0, 1.8, MARGIN), w: wins(L.z0, L.z1, 5.0, 1.8, MARGIN) } : {};
      box(L.x0, L.x1, L.z0 + GAP, L.z1, WALL, y, h, c, st, mat, g, lintel ? 0.7 : 0);
      if (y > ROUGH) B.slab((L.x0 + L.x1) / 2, yc, (L.z0 + L.z1) / 2, WALL, h, L.z1 - L.z0 - 2 * WALL - 2 * GAP, st, mat);
    });
    gable(L.x0, L.x1, L.z0, L.z1, L.top + L.h, ROOF.rise * 0.6, 'x');
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen at the Merveille's windows on all three storeys,
 * looking north over the bay; machine guns in the church's windows; snipers
 * in the tower's belfry openings; anti-tank teams in the cloister's arcade
 * and at the lodgings' windows on the south, where the causeway comes up;
 * mortars on the Merveille's deck between the cloister and the refectory.
 */
export function populateMontstmichel(g, origin, groundY) {
  const K = MONTSTMICHEL;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const Mv = K.merveille;
  // The Merveille's north face: three rows, five men each.
  Mv.windows.forEach((wy, r) => {
    for (let i = 0; i < 5; i++) {
      const x = Mv.x0 + (i + 0.5) * (Mv.x1 - Mv.x0) / 5;
      g.place(r === 1 && i % 2 ? 'mg' : 'rifleman', V(x, wy + 0.3, Mv.z0 + Mv.wall / 2 + 0.6), Math.PI, 6, { cover: 'window' });
    }
  });
  // The church's windows: the nave's south side and the choir's, at the sill.
  const sill = 8.0 * K.scale + 0.3;
  for (let i = 0; i < 3; i++) {
    const x = K.nave.x0 + (i + 0.5) * (K.nave.x1 - K.nave.x0) / 3;
    g.place(i === 1 ? 'mg' : 'rifleman', V(x, sill, K.nave.z1 - K.wall / 2 - 0.6), 0, 6, { cover: 'window' });
    g.place('rifleman', V(x, sill, K.nave.z0 + K.wall / 2 + 0.6), Math.PI, 6, { cover: 'window' });
  }
  for (const sz of [-1, 1]) {
    g.place('mg', V((K.choir.x0 + K.choir.x1) / 2, sill, sz > 0 ? K.choir.z1 - K.wall / 2 - 0.6 : K.choir.z0 + K.wall / 2 + 0.6), sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
  }
  g.place('rifleman', V(K.choir.x1 - K.wall / 2 - 0.6, sill, 0), Math.PI / 2, 6, { cover: 'window' });
  // Snipers in the belfry, one a face.
  const T = K.tower;
  const bel = T.top - 6.0 * K.scale;
  for (const [fx, fz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    g.place('sniper', V(T.cx + fx * (T.w / 2 - K.wall / 2 - 0.6), bel, T.cz + fz * (T.w / 2 - K.wall / 2 - 0.6)), Math.atan2(fx, fz), 6, { cover: 'window' });
  }
  // Anti-tank teams: two in the cloister looking north and west, two at the
  // lodgings on the south.
  const C = K.cloister;
  g.place('at', V((C.x0 + C.x1) / 2, C.floor + 0.6, C.z0 + 1.6), Math.PI, 6, { cover: 'arcade' });
  g.place('at', V(C.x0 + 1.6, C.floor + 0.6, (C.z0 + C.z1) / 2), -Math.PI / 2, 6, { cover: 'arcade' });
  const L = K.logis;
  for (const x of [L.x0 + 8.0, L.x1 - 8.0]) {
    g.place('at', V(x, 3.0 * K.scale + 0.3, L.z1 - K.wall / 2 - 0.6), 0, 6, { cover: 'window' });
  }
  // Mortars on the Merveille's deck, between the cloister and the roof.
  for (const z of [Mv.z0 + 6.0, Mv.z1 - 6.0]) {
    g.place('mortar', V(C.x1 + 3.0 * K.scale * 0 + 4.0, Mv.top + 0.6, z), 0, 7, { cover: 'roof' });
  }
}
