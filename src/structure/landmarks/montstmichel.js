import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';
import { PLAN } from './montstmichel_plan.js';

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

// In plan, 1.3 times life: the summit is eighty-eight metres by ninety-two
// and the abbey fills it. Upward from the summit, 1.9 times: the Mont is a
// pyramid that ends in a needle, and at 1.3 all round the abbey sat on its
// rock like a chapel on a hill. Below the summit nothing is stretched — the
// crypts and the Merveille stand against the real rock — and the village and
// the ramparts round the foot are laid at their real size on their real
// ground, after the stretch.
const S = 1.3;
const SV = 1.9;
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

/** Where the builder put the church's windows, for the garrison. */
const POSTS = { nave: [], choir: [], sill: 8.0, deck: 2.0 };

/** What the garrison, the flag and the level record read. */
export const MONTSTMICHEL = {
  scale: S,
  up: SV,
  nave: { x0: NAVE.x0 * S, x1: NAVE.x1 * S, z0: NAVE.z0 * S, z1: NAVE.z1 * S, top: NAVE.h * SV },
  crossing: { x0: CROSSING.x0 * S, x1: CROSSING.x1 * S, z0: CROSSING.z0 * S, z1: CROSSING.z1 * S },
  choir: { x0: CHOIR.x0 * S, x1: CHOIR.x1 * S, z0: CHOIR.z0 * S, z1: CHOIR.z1 * S, top: CHOIR.h * SV },
  tower: { cx: TOWER.cx * S, cz: TOWER.cz * S, w: TOWER.w * S, top: TOWER.top * SV },
  merveille: { x0: MERVEILLE.x0 * S, x1: MERVEILLE.x1 * S, z0: MERVEILLE.z0 * S, z1: MERVEILLE.z1 * S, top: MERVEILLE.top * SV,
    windows: MERVEILLE.windows.map((y) => y * S), wall: MERVEILLE.wall * S },
  cloister: { x0: CLOISTER.x0 * S, x1: CLOISTER.x1 * S, z0: CLOISTER.z0 * S, z1: CLOISTER.z1 * S, floor: MERVEILLE.top * SV },
  logis: { x0: LOGIS.x0 * S, x1: LOGIS.x1 * S, z0: LOGIS.z0 * S, z1: LOGIS.z1 * S, top: (LOGIS.top + LOGIS.h) * SV },
  wall: WALL * S,
  /** Rooflines a man can be posted on, low to high. */
  galleries: [MERVEILLE.top * SV, NAVE.h * SV, TOWER.top * SV],
  plan: PLAN,
  // The flag flies from the tower's top, beside the spire's foot.
  flag: { x: (TOWER.cx + TOWER.w / 2 - 1.0) * S, y: (TOWER.top + 0.5) * SV, z: (TOWER.cz + TOWER.w / 2 - 1.0) * S },
};

export function buildMontstmichel(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  // The same stone from high up: a desktop lays the abbey much as a phone does.
  const s = Math.max(1.0, quality.blockScale) * STONE_FINENESS;
  const stone = 1.4 * s;
  // The stretch makes a course half as tall again, which at this size is a
  // big abbey's big stones rather than a slab.
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
  const grain = (y) => (y < ROUGH ? { st: rough, co: roughCourse, mat: M.RUBBLE } : { st: stone, co: course, mat: M.GRANITE });
  const walls = (x0, x1, z0, z1, wall, y0, y1, fn) => {
    if (y0 < ROUGH) courses(y0, Math.min(ROUGH, y1), roughCourse, (y, h, c) => fn(y, h, c, rough, M.RUBBLE));
    if (y1 > ROUGH) courses(Math.max(ROUGH, y0), y1, course, (y, h, c) => fn(y, h, c, stone, M.GRANITE));
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
        if (along === 'x') B.slab((x0 + x1) / 2, y + ch / 2, (z0 + z1) / 2, x1 - x0, ch, Math.max(2 * half, stone * 0.6), stone, M.SCOTSLATE);
        else B.slab((x0 + x1) / 2, y + ch / 2, (z0 + z1) / 2, Math.max(2 * half, stone * 0.6), ch, z1 - z0, stone, M.SCOTSLATE);
        return;
      }
      for (const side of [-1, 1]) {
        const c = along === 'x' ? (z0 + z1) / 2 + side * (half - thick / 2) : (x0 + x1) / 2 + side * (half - thick / 2);
        if (along === 'x') run('x', c, x0, x1, y, ch, thick, stone, M.SCOTSLATE);
        else run('z', c, z0, z1, y, ch, thick, stone, M.SCOTSLATE);
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
    box(x0, x1, z0, z1, WALL, y, ch, c, stone, M.GRANITE, g, lintel ? 0.8 : 0, 0, omit,
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
      box(CROSSING.x0, CROSSING.x1, NAVE.z0, NAVE.z1, WALL, y, h, c, stone, M.GRANITE, {}, 0, 0, 'n s');
    });
    courses(0, CHOIR.h, course, (y, h, c) => churchBox(CHOIR.x0, CHOIR.x1, CHOIR.z0, CHOIR.z1, CHOIR.h, 'w', y, h, c));
    // A gallery round the inside of the nave and the choir at the window
    // sills, and a floor in the belfry under its openings: what a man at a
    // window stands on.
    B.ring((NAVE.x0 + NAVE.x1) / 2, 0, NAVE.x1 - NAVE.x0 - 2 * WALL + 0.1, NAVE.z1 - NAVE.z0 - 2 * WALL + 0.1, 2.4, winY - 0.6, 0.6, stone * 1.3, M.GRANITE);
    B.ring((CHOIR.x0 + CHOIR.x1) / 2, 0, CHOIR.x1 - CHOIR.x0 - 2 * WALL + 0.1, CHOIR.z1 - CHOIR.z0 - 2 * WALL + 0.1, 2.4, winY - 0.6, 0.6, stone * 1.3, M.GRANITE);
    B.ring(TOWER.cx, TOWER.cz, TOWER.w - 2 * WALL + 0.1, TOWER.w - 2 * WALL + 0.1, 2.2, TOWER.top - 8.6, 0.6, stone * 1.3, M.GRANITE);
    // Where the windows fell, for the garrison: it depends on the stone size.
    POSTS.nave = wins(NAVE.x0, NAVE.x1, 6.0, 2.2, MARGIN).map(([p, q]) => (p + q) / 2);
    POSTS.choir = wins(CHOIR.x0, CHOIR.x1, 6.0, 2.2, MARGIN).map(([p, q]) => (p + q) / 2);
    POSTS.sill = winY;
    POSTS.deck = MERVEILLE.top + course * 0.6;
    // Pinnacles on the wall-heads over every buttress, nave and choir, and a
    // ring of them round the choir's east end: the flamboyant silhouette the
    // Mont is known by, standing on the walls it tops.
    for (const [x0, x1, zs] of [[NAVE.x0, NAVE.x1, [NAVE.z0, NAVE.z1]], [CHOIR.x0, CHOIR.x1, [CHOIR.z0, CHOIR.z1]]]) {
      for (let x = x0 + 3.0; x < x1 - 1.0; x += 6.0) {
        for (const z of zs) {
          const zc = z < 0 ? z + WALL / 2 : z - WALL / 2;
          B.pinnacle(x, zc, NAVE.h, 5.5, 1.5, stone * 0.6, M.GRANITE);
        }
      }
    }
    for (const z of [-4.5, 0, 4.5]) B.pinnacle(CHOIR.x1 - WALL / 2, z, CHOIR.h, 6.5, 1.5, stone * 0.6, M.GRANITE);
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
      box(T.cx - T.w / 2, T.cx + T.w / 2, T.cz - T.w / 2, T.cz + T.w / 2, WALL, y, h, c, stone, M.GRANITE, g, lintel ? 0.8 : 0, yc > T.top - course * 1.1 ? 0.25 : 0);
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
      if (wl >= T.w / 2 - 0.3) B.slab(T.cx, y + h / 2, T.cz, T.w, h, T.w, stone, M.GRANITE);
      else box(T.cx - T.w / 2, T.cx + T.w / 2, T.cz - T.w / 2, T.cz + T.w / 2, wl, y, h, c, stone, M.GRANITE);
    });
    const sy = T.top + close * course;
    B.spire(T.cx, T.cz, sy, SPIRE.top, SPIRE.base, SPIRE.tip, course * 0.9, stone * 0.9, M.GRANITE, 0.4);
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
      B.ring((Mv.x0 + Mv.x1) / 2, (Mv.z0 + Mv.z1) / 2, Mv.x1 - Mv.x0 - 2 * Mv.wall - 2 * GAP, Mv.z1 - Mv.z0 - 2 * Mv.wall - 2 * GAP, stone * 1.6, fy - course * 0.3, course * 0.6, stone, M.SCOTSLATE);
    }
    // The deck: one course over the whole top, every stone within span of a
    // wall or a cross wall.
    const dw = Mv.x1 - Mv.x0, dd = Mv.z1 - Mv.z0;
    const nx = Math.round(dw / (stone * 1.1)), nz = Math.round(dd / (stone * 1.1));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      B.add(Mv.x0 + (i + 0.5) * dw / nx, Mv.top + course * 0.3, Mv.z0 + (k + 0.5) * dd / nz, B.shrink(dw / nx / 2), B.shrink(course * 0.3), B.shrink(dd / nz / 2), M.GRANITE);
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
      box(C.x0, C.x1, C.z0, C.z1, 1.6, y, h, c, stone, M.GRANITE, g, lintel ? 0.7 : 0);
    });
    // A lean-to roof round the walk: one course, inside the arcade.
    B.ring((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, C.x1 - C.x0 - 0.4, C.z1 - C.z0 - 0.4, 3.6, y0 + C.h, course * 0.6, stone, M.SCOTSLATE);
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

  stretch(B);
  // Laid at the rock's own size, on its own ground.
  B.joint = JOINT;
  village(B);
  ramparts(B);
  return B;
}

/**
 * The scale, applied: S across, S down into the rock, SV up from the summit.
 * A stone that straddles the summit has its bottom and top mapped separately,
 * so the courses stay stacked on each other.
 */
function stretch(B) {
  const up = (y) => (y > 0 ? y * SV : y * S);
  for (const b of B.blocks) {
    const y0 = up(b.y - b.hy), y1 = up(b.y + b.hy);
    b.x *= S; b.z *= S; b.hx *= S; b.hz *= S;
    b.y = (y0 + y1) / 2; b.hy = (y1 - y0) / 2;
  }
}

/** A run of stones along a direction (ux, uz) from centre (cx, cz), world metres. */
function runAlong(B, cx, cz, ux, uz, a0, a1, off, y, h, thick, st, mat) {
  const len = a1 - a0;
  if (len < 0.3) return;
  const n = Math.max(1, Math.round(len / st));
  const ry = Math.atan2(ux, uz);
  for (let i = 0; i < n; i++) {
    const m = a0 + (i + 0.5) * (len / n);
    B.add(cx + ux * m + uz * off, y + h / 2, cz + uz * m - ux * off, B.shrink(thick / 2), B.shrink(h / 2), B.shrink(len / n / 2), mat, ry);
  }
}

/** Equal courses between two heights. */
function coursesOf(y0, y1, nominal, fn) {
  const n = Math.max(1, Math.round((y1 - y0) / nominal));
  const ch = (y1 - y0) / n;
  for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
}

/**
 * The village: every surveyed house on the benches, a granite box from the
 * ground the bake has under it up to eaves over its highest ground, a steep
 * slate gable and a stack. Coarse stone whatever the tier: seventy houses in
 * fine stone would cost more than the abbey.
 */
function village(B) {
  B.section('village', () => {
    const st = 2.6, co = 1.7, t = 1.2;
    PLAN.houses.forEach((h, k) => {
      const ux = Math.sin(h.ry), uz = Math.cos(h.ry);
      const L = h.len, W = h.wid;
      const eaves = h.grade + Math.max(5.0, h.h * 0.8);
      // Under the ground the house stands on, the footing is laid in blocks
      // three times the size: nobody sees it, and there is a lot of it.
      const split = Math.max(h.found + 1, Math.min(h.grade - 1.0, eaves - co));
      const lay = (y, ch, c, sz) => {
        const odd = c % 2 === 1;
        const su = odd ? L / 2 - t : L / 2, sv = odd ? W / 2 : W / 2 - t;
        for (const side of [-1, 1]) {
          runAlong(B, h.cx, h.cz, ux, uz, -su, su, side * (W / 2 - t / 2), y, ch, t, sz, M.GRANITE);
          runAlong(B, h.cx, h.cz, uz, -ux, -sv, sv, side * (L / 2 - t / 2) * -1, y, ch, t, sz, M.GRANITE);
        }
      };
      if (split > h.found + 0.5) coursesOf(h.found, split, co * 2.6, (y, ch, c) => lay(y, ch, c, st * 2.2));
      coursesOf(split, eaves, co, (y, ch, c) => lay(y, ch, c, st));
      // The roof: slate stepping in from both eaves to the ridge, steep.
      const rc = 0.9, step = 0.75;
      let half = W / 2 + 0.3, y = eaves, c = 0;
      while (half > 1.2 && c < 12) {
        for (const side of [-1, 1]) runAlong(B, h.cx, h.cz, ux, uz, -L / 2, L / 2, side * (half - 0.8), y, rc, 1.6, st * 1.4, M.SCOTSLATE);
        half -= step; y += rc; c++;
      }
      runAlong(B, h.cx, h.cz, ux, uz, -L / 2, L / 2, 0, y, rc, Math.max(0.8, half * 2), st * 1.4, M.SCOTSLATE);
      // A stack on one gable, alternating ends so the street does not repeat.
      const e = (k % 2 ? 1 : -1) * (L / 2 - t / 2);
      B.add(h.cx + ux * e, y + rc + 0.9, h.cz + uz * e, 0.7, 0.9, 0.6, M.GRANITE, h.ry);
    });
  });
}

/**
 * The ramparts round the foot of the rock, through the surveyed towers from
 * Tour Gabriel in the west round the south to the Tour du Nord: stretches of
 * wall carried down to the ground under them and up to a walk above their own
 * highest ground, with a breastwork and merlons; round towers with a
 * battlemented top at each named tower.
 */
function ramparts(B) {
  B.section('ramparts', () => {
    const st = 2.4, co = 1.6, t = 3.0;
    for (const r of PLAN.ramparts) {
      const dx = r.x1 - r.x0, dz = r.z1 - r.z0, L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      // Outward is away from the rock.
      const out = (uz * cx - ux * cz) > 0 ? 1 : -1;
      const split = Math.max(r.found + 1, r.top - 9.0);
      if (split > r.found + 0.5) coursesOf(r.found, split, co * 2.6, (y, ch) => runAlong(B, cx, cz, ux, uz, -L / 2 - 0.6, L / 2 + 0.6, 0, y, ch, t, st * 2.2, M.GRANITE));
      coursesOf(split, r.top, co, (y, ch) => runAlong(B, cx, cz, ux, uz, -L / 2 - 0.6, L / 2 + 0.6, 0, y, ch, t, st, M.GRANITE));
      runAlong(B, cx, cz, ux, uz, -L / 2 - 0.3, L / 2 + 0.3, out * (t / 2 - 0.4), r.top, 1.0, 0.8, st, M.GRANITE);
      for (let u = -L / 2 + 1.0; u < L / 2 - 0.4; u += 3.2) {
        runAlong(B, cx, cz, ux, uz, u, u + 1.4, out * (t / 2 - 0.4), r.top + 1.0, 0.9, 0.8, 99, M.GRANITE);
      }
    }
    for (const w of PLAN.towers) {
      const split = Math.max(w.found + 1, w.top - 14.0);
      if (split > w.found + 0.5) coursesOf(w.found, split, co * 2.6, (y, ch, c) => B.polyRing(w.x, w.z, BlockList.circle(w.r, 8, (c % 2) * Math.PI / 8), 2.2, y, ch, st * 2.2, M.GRANITE));
      coursesOf(split, w.top, co, (y, ch, c) => B.polyRing(w.x, w.z, BlockList.circle(w.r, 12, (c % 2) * Math.PI / 12), 1.8, y, ch, st, M.GRANITE));
      B.slab(w.x, w.top - 0.4, w.z, w.r * 1.45, 0.8, w.r * 1.45, 99, M.GRANITE);
      coursesOf(w.top, w.top + 1.0, 1.0, (y, ch) => B.polyRing(w.x, w.z, BlockList.circle(w.r + 0.2, 14, 0), 0.8, y, ch, st, M.GRANITE));
    }
  });
}

/**
 * The garrison, on things that are there and looking out of them: the
 * ramparts' walks in the gaps between merlons and the tops of their towers;
 * the edge of the Merveille's deck beside the cloister, over the bay; the
 * galleries inside the nave and the choir, at windows the builder cut; the
 * belfry's floor at its openings; mortars dug in on the summit west of the
 * church.
 */
export function populateMontstmichel(g, origin, groundY) {
  const K = MONTSTMICHEL;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const face = (dx, dz) => Math.atan2(dx, dz);

  // The ramparts: a man in a gap on every third stretch, facing off the rock.
  PLAN.ramparts.forEach((r, i) => {
    if (i % 3 !== 1 || !r.post) return;
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const out = (uz * cx - ux * cz) > 0 ? 1 : -1;
    // The gap nearest the middle of the stretch.
    const k = Math.round((L / 2 - 3.1) / 3.2);
    const u = -L / 2 + 3.1 + 3.2 * k;
    const x = cx + ux * u + uz * out * 0.1, z = cz + uz * u - ux * out * 0.1;
    g.place(i % 9 === 4 ? 'mg' : 'rifleman', V(x, r.top + 0.05, z), face(uz * out, -ux * out), 3, { cover: 'trench' });
  });
  // The towers' tops, facing off the rock.
  PLAN.towers.forEach((w, i) => {
    const r = Math.hypot(w.x, w.z), ox = w.x / r, oz = w.z / r;
    g.place(i % 2 ? 'sniper' : 'at', V(w.x + ox * 1.0, w.top + 0.05, w.z + oz * 1.0), face(ox, oz), 3, { cover: 'roof' });
  });

  // The Merveille's deck, along its north edge beside the cloister, over the bay.
  for (let i = 0; i < 5; i++) {
    const x = (CLOISTER.x0 + 1.5 + i * (CLOISTER.x1 - CLOISTER.x0 - 3.0) / 4) * S;
    g.place(i === 2 ? 'mg' : 'rifleman', V(x, POSTS.deck * SV + 0.05, (MERVEILLE.z0 + 1.1) * S), Math.PI, 3, { cover: 'roof' });
  }

  // The church: the choir's gallery at its windows, both sides, where the
  // choir runs out east past the refectory and the lodgings — the nave's
  // windows look straight into their roofs.
  const sill = POSTS.sill * SV + 0.05;
  POSTS.choir.filter((x) => x > Math.max(LOGIS.x1, MERVEILLE.x1) + 1.5).forEach((x, i) => {
    g.place(i ? 'rifleman' : 'mg', V(x * S, sill, (CHOIR.z1 - WALL - 0.6) * S), 0, 3, { cover: 'window' });
    g.place('rifleman', V(x * S, sill, (CHOIR.z0 + WALL + 0.6) * S), Math.PI, 3, { cover: 'window' });
  });

  // The belfry: a sniper at the opening in each face.
  const bel = (TOWER.top - 8.0) * SV + 0.05;
  for (const [fx, fz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const d = TOWER.w / 2 - WALL - 0.6;
    g.place('sniper', V((TOWER.cx + fx * d) * S, bel, (TOWER.cz + fz * d) * S), face(fx, fz), 3, { cover: 'window' });
  }

  // Mortars dug in on the summit, west of the church.
  for (const k of ['west1', 'west2', 'west3']) {
    const p = PLAN.points[k];
    g.place('mortar', V(p.x, p.y + 0.3, p.z), -Math.PI / 2, 20, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
