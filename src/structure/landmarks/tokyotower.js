import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Tokyo Tower, Minato.
 *
 * Reference figures (Nippon Television City Corporation, published; the
 * envelope widths from the survey's own rings, which the bake carried as
 * concentric outlines tagged by height):
 *   height                332.9 m to the tip of the antenna
 *   base                  four legs on a square about 80 m between the feet;
 *                         the envelope is 57 m across at 66 m, 43 at 88,
 *                         35 at 106, 31 at 120
 *   main observatory      two floors at 145 and 150 m, a box 35 x 34 m
 *   special observatory   at 250 m, a room about 7 m across
 *   FootTown              the four-storey building between the feet, 20 m
 *   colours               international orange and white in bands
 *
 * The Eiffel's kind, and built the Eiffel's way: read `eiffel.js`. A lattice
 * is a frame, not a wall with holes in it — every member is a column standing
 * on the member below, and the sky between them is free. Cut a leg and the
 * tower falls toward the cut.
 *
 * The twist is where the mass is. The Eiffel carries its weight up its whole
 * height; this tower carries a two-storey box of observatory at 145 m, and
 * that box weighs more than the hundred metres of lattice above it. The fall
 * is decided low — the legs below the box are what the guns are for, and the
 * antenna is a hundred metres of nothing worth shooting.
 *
 * At life size. It is 333 m already, taller than anything else in the
 * campaign but the Burj and the Eiffel, and the survey's rings are its own.
 */

const S = 1.0;

// Heights, real metres.
const MERGE = 105;          // where the four legs close into one square
const OBS = 145;            // the main observatory's lower floor
const OBS_TOP = 157;        // its roof, which the upper shaft stands on
const SPECIAL = 248;        // the special observatory's floor
const SPECIAL_TOP = 255;    // its roof
const TIP = 333;
const FOOT_H = 20;          // FootTown, the building between the feet
const FOOT_HALF = 38;

/**
 * The outer envelope: half-width of the tower at height y.
 *
 * Two straight lines, which is what the photographs show: a steep batter over
 * the legs to about 66 m, then a gentler one up to the observatory. The
 * survey's rings — 28.5 half at 66, 21.5 at 88, 17.5 at 106, 15.5 at 120 —
 * sit on the second line within a metre.
 */
function outerAt(y) {
  if (y < 66) return 44 - 0.235 * Math.max(0, y);
  if (y < OBS) return 28.5 - 0.1835 * (y - 66);
  // The upper shaft, above the observatory box: 8.5 half at its foot,
  // narrowing to 5 under the special observatory.
  const u = Math.max(0, Math.min(1, (y - OBS_TOP) / (SPECIAL - OBS_TOP)));
  return 8.5 - 3.5 * u;
}

/** The inner face of a leg, running in to the axis by MERGE. */
function innerAt(y) {
  const t = Math.max(0, Math.min(1, y / MERGE));
  return 26 * Math.pow(1 - t, 1.15);
}

/** Where a leg's centre and half-width are at height y. Exported for the garrison. */
export function tokyoLegAt(y) {
  const o = outerAt(y);
  const i = Math.min(innerAt(y), o - 2.0);
  return { r: (o + i) / 2, h: (o - i) / 2 };
}

/** What the garrison, the flag and the level record read. */
export const TOKYOTOWER = {
  scale: S,
  merge: MERGE, obs: OBS, obsTop: OBS_TOP, special: SPECIAL, tip: TIP,
  obsHalf: 17.0, specialHalf: 5.5,
  foot: { half: FOOT_HALF, h: FOOT_H },
  legAt: tokyoLegAt,
  /** Rooflines a man can be posted on, low to high. */
  galleries: [FOOT_H, OBS, SPECIAL],
  flag: { x: 0, y: SPECIAL_TOP + 0.6, z: 3.0 },
};

/** International orange below, white above, in the bands the tower is painted in. */
const BANDS = [[0, 42], [72, 108], [128, OBS], [OBS_TOP, 185], [212, 240], [262, 290], [312, TIP]];
const paint = (y) => (BANDS.some(([a, b]) => y >= a && y < b) ? M.IRONWORK : M.STEEL);

export function buildTokyotower(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  // Capped, like the Eiffel's: a lattice's stability depends on how finely it
  // is divided, because each course of a battered post steps sideways by the
  // course height times the batter, and a coarse course steps off the post
  // below it.
  const s = Math.min(quality.blockScale, 1.15);
  const member = 1.5 * s;
  const COURSE = member * 0.9;
  const MIN_BAR = Math.max(0.34, COURSE * 0.25);

  /**
   * One tapering box built as a cage: `at(y)` gives centre and half-width,
   * `fillOf(y)` how much of the gap between members a member takes. Sized to
   * the spacing, never more than half the gap — see the Eiffel for why a bar
   * of fixed width turns a lattice into a chimney.
   */
  const cage = (at, y0, y1, n, fillOf, courseH) => {
    const fr = [];
    for (let i = 0; i < n; i++) fr.push(-1 + (2 * i) / (n - 1));
    let y = y0;
    while (y < y1 - 0.001) {
      const h = Math.min(courseH, y1 - y);
      const yc = y + h / 2;
      const g = at(yc);
      const spacing = 2 * g.h / (n - 1);
      const f = fillOf(yc);
      const bar = Math.max(MIN_BAR, spacing * Math.min(f, 0.50) / 2);
      const corner = Math.max(MIN_BAR * 1.4, spacing * Math.min(f * 1.55, 0.62) / 2);
      const hy = h / 2 - 0.02;
      const mat = paint(yc);
      for (const ex of [-1, 1]) {
        for (const ez of [-1, 1]) {
          B.add(g.cx + ex * g.h, yc, g.cz + ez * g.h, corner, hy, corner, mat);
        }
      }
      for (let k = 1; k < n - 1; k++) {
        const fk = fr[k];
        for (const ex of [-1, 1]) {
          B.add(g.cx + ex * g.h, yc, g.cz + fk * g.h, bar, hy, bar, mat);
        }
        for (const ez of [-1, 1]) {
          B.add(g.cx + fk * g.h, yc, g.cz + ez * g.h, bar, hy, bar, mat);
        }
      }
      y += h;
    }
  };

  /** A belt of horizontals round a cage, on a course boundary. */
  const belt = (at, y, bar) => {
    const g = at(y);
    const mat = paint(y);
    for (const ex of [-1, 1]) {
      B.add(g.cx + ex * g.h, y, g.cz, bar, bar * 0.85, g.h + bar, mat);
      B.add(g.cx, y, g.cz + ex * g.h, g.h + bar, bar * 0.85, bar, mat);
    }
  };

  /** A brace from one corner up to the next, laid as a staircase of boxes. */
  const brace = (x0, z0, y0, x1, z1, y1, thick) => {
    const steps = Math.max(3, Math.round((y1 - y0) / (member * 1.9)));
    const dx = (x1 - x0) / steps, dz = (z1 - z0) / steps, dy = (y1 - y0) / steps;
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const segLen = Math.hypot(dx, dz) / 2 + thick;
    for (let i = 0; i < steps; i++) {
      const yc = y0 + dy * (i + 0.5);
      B.add(x0 + dx * (i + 0.5), yc, z0 + dz * (i + 0.5),
        thick, Math.abs(dy) / 2 + thick * 0.5, segLen, paint(yc), ry);
    }
  };

  /** The X across every face of a cage between two belts. */
  const cross = (at, y0, y1, thick) => {
    const a = at(y0), b = at(y1);
    const ring = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const c0 = ring[i], c1 = ring[(i + 1) % 4];
      brace(a.cx + c0[0] * a.h, a.cz + c0[1] * a.h, y0, b.cx + c1[0] * b.h, b.cz + c1[1] * b.h, y1, thick);
      brace(a.cx + c1[0] * a.h, a.cz + c1[1] * a.h, y0, b.cx + c0[0] * b.h, b.cz + c0[1] * b.h, y1, thick);
    }
  };

  /** A solid deck plate, coarse, so each stone spreads its load over several posts. */
  const plate = (y, half, thick, mat = M.IRONWORK) => {
    B.slab(0, y - thick / 2, 0, half * 2, thick, half * 2, Math.max(member * 2.2, 5.0), mat);
  };

  const BAY = COURSE * 8;
  const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const legAt = (sx, sz) => (y) => {
    const g = tokyoLegAt(y);
    return { cx: sx * g.r, cz: sz * g.r, h: g.h };
  };

  // ── Foundations: four concrete blocks, one per foot, separate on purpose.
  B.section('foundation', () => {
    for (const [sx, sz] of legs) {
      const { r, h } = tokyoLegAt(0);
      B.slab(sx * r, -1.5, sz * r, h * 2 + 6, 3.0, h * 2 + 6, member * 2.4, M.CONCRETE);
    }
  });

  // ── The four legs, from the ground to where they close up.
  //
  // Stout at the foot, where each carries a quarter of the tower, stout again
  // at the head, where the merged cage lands on them, slender between.
  B.section('legs', () => {
    const legFill = (y) => {
      const t = Math.max(0, Math.min(1, y / MERGE));
      return 0.15 + 0.12 * Math.pow(1 - t, 1.6) + 0.12 * Math.pow(t, 2.4);
    };
    for (const [sx, sz] of legs) {
      const at = legAt(sx, sz);
      cage(at, 0, MERGE, 4, legFill, COURSE);
      for (let y = BAY; y < MERGE - COURSE; y += BAY) belt(at, y, MIN_BAR * 0.9);
      for (let y = 0; y < MERGE - BAY; y += BAY) cross(at, y, Math.min(y + BAY, MERGE), MIN_BAR * 0.8);
    }
  });

  // ── The arches between the feet: the curved lower chord that is the
  // tower's silhouette from the street. Each foot lands on a leg's inner
  // corner post, which is the only place in the bay with anything under it.
  B.section('arches', () => {
    const y = 26;
    const inner = innerAt(y);
    const count = Math.max(13, Math.round(20 / s));
    for (const side of [1, -1]) {
      B.arch(0, y, side * inner, inner * 2, 3.2, 2.4, count, M.IRONWORK, 'x');
      B.arch(side * inner, y, 0, inner * 2, 3.2, 2.4, count, M.IRONWORK, 'z');
    }
  });

  // ── The cage: above the merge the four boxes tile one square, which is a
  // single lattice with posts down its centre lines — and those posts are what
  // the observatory's plate lands on. A hollow box under a solid deck is a
  // deck with nothing under its middle.
  B.section('cage', () => {
    const cageFill = (y) => 0.16 + 0.10 * Math.pow((y - MERGE) / (OBS - MERGE), 2.0);
    for (const [sx, sz] of legs) {
      const at = legAt(sx, sz);
      cage(at, MERGE, OBS, 4, cageFill, COURSE);
      for (let y = MERGE + BAY; y < OBS - COURSE; y += BAY) belt(at, y, MIN_BAR * 0.9);
      for (let y = MERGE; y < OBS - BAY; y += BAY) cross(at, y, Math.min(y + BAY, OBS), MIN_BAR * 0.8);
    }
  });

  // ── The main observatory: two floors of glass box round the truss, which
  // runs on through it. The plates are solid — the upper shaft stands on the
  // roof — and the glass hangs between steel posts outside the frame.
  B.section('observatory', () => {
    const half = TOKYOTOWER.obsHalf;
    plate(OBS, half, 0.9);
    // The truss through the box: the four boxes again, as bare posts.
    for (const [sx, sz] of legs) {
      const at = legAt(sx, sz);
      cage(at, OBS, OBS_TOP, 4, () => 0.30, COURSE);
    }
    plate(OBS + 6, half - 0.5, 0.7);
    plate(OBS_TOP, half, 0.9);
    // Glass between posts on both floors, clear of the posts on every side.
    const skin = (y0, y1) => {
      const gh = half - 1.6;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const f = -1 + (2 * i + 1) / n;
        const seg = (2 * gh) / n;
        for (const side of [1, -1]) {
          B.add(f * gh, (y0 + y1) / 2, side * gh, seg / 2 - 0.6, (y1 - y0) / 2 - 0.15, 0.25, M.GLASS);
          B.add(side * gh, (y0 + y1) / 2, f * gh, 0.25, (y1 - y0) / 2 - 0.15, seg / 2 - 0.6, M.GLASS);
        }
      }
      // And the steel posts between the panes, standing on the plate below.
      for (let i = 0; i <= n; i++) {
        const f = -1 + (2 * i) / n;
        for (const side of [1, -1]) {
          B.add(f * gh, (y0 + y1) / 2, side * gh, 0.4, (y1 - y0) / 2 - 0.02, 0.4, M.STEEL);
          if (Math.abs(f) < 0.99) B.add(side * gh, (y0 + y1) / 2, f * gh, 0.4, (y1 - y0) / 2 - 0.02, 0.4, M.STEEL);
        }
      }
    };
    skin(OBS, OBS + 6 - 0.7);
    skin(OBS + 6, OBS_TOP - 0.9);
  });

  // ── The upper shaft: one lattice from the observatory roof to the special
  // observatory, five members a face, stout at its foot and slender at its
  // head.
  B.section('upper', () => {
    const shaftAt = (y) => ({ cx: 0, cz: 0, h: outerAt(Math.max(OBS_TOP, y)) });
    const shaftFill = (y) => {
      const u = Math.max(0, Math.min(1, (y - OBS_TOP) / (SPECIAL - OBS_TOP)));
      return 0.16 + 0.18 * Math.pow(1 - u, 2.0);
    };
    cage(shaftAt, OBS_TOP, SPECIAL, 5, shaftFill, COURSE);
    for (let y = OBS_TOP + BAY; y < SPECIAL - COURSE; y += BAY) belt(shaftAt, y, MIN_BAR * 0.9);
    for (let y = OBS_TOP; y < SPECIAL - BAY; y += BAY) cross(shaftAt, y, Math.min(y + BAY, SPECIAL), MIN_BAR * 0.8);
    // The special observatory: a small glazed room on a plate over the shaft
    // head, with its roof carrying the antenna.
    const sh = TOKYOTOWER.specialHalf;
    plate(SPECIAL, sh, 0.8);
    const roomTop = SPECIAL_TOP - 0.8;
    const ym = (SPECIAL + roomTop) / 2, hh = (roomTop - SPECIAL) / 2;
    for (const [ex, ez] of legs) {
      B.add(ex * (sh - 0.5), ym, ez * (sh - 0.5), 0.5, hh - 0.02, 0.5, M.STEEL);
    }
    // The shaft's posts continue through the room as the antenna's root.
    cage(() => ({ cx: 0, cz: 0, h: 2.2 }), SPECIAL, roomTop, 3, () => 0.5, COURSE);
    for (const side of [1, -1]) {
      B.add(0, ym, side * (sh - 0.5), sh - 1.3, hh - 0.15, 0.25, M.GLASS);
      B.add(side * (sh - 0.5), ym, 0, 0.25, hh - 0.15, sh - 1.3, M.GLASS);
    }
    plate(SPECIAL_TOP, sh, 0.8);
  });

  // ── The antenna: a mast of solid boxes, tapering, orange and white.
  B.section('antenna', () => {
    let y = SPECIAL_TOP;
    const h = 2.4;
    while (y < TIP - 4) {
      const t = (y - SPECIAL_TOP) / (TIP - SPECIAL_TOP);
      const w = 3.6 * (1 - t * 0.7);
      B.slab(0, y + h / 2, 0, w, h, w, member, paint(y));
      y += h;
    }
    for (let k = 0; k < 3; k++) {
      B.slab(0, y + k * 1.3 + 0.65, 0, 0.8 - k * 0.2, 1.3, 0.8 - k * 0.2, member, M.IRONWORK);
    }
  });

  // ── FootTown: the building between the feet. Concrete walls round a light
  // well, two cross walls, and a roof laid as strips over the walls so every
  // stone of it stands on masonry.
  B.section('foottown', () => {
    const stone = 2.6 * quality.blockScale;
    const course = 2.0 * quality.blockScale;
    const n = Math.max(1, Math.round(FOOT_H / course));
    const ch = FOOT_H / n;
    const WALL = 1.6;
    // The legs pass through the corners; nothing is laid where they are.
    const inLeg = (x, y, z) => {
      const o = outerAt(y) + 1.6, i = innerAt(y) - 1.6;
      return Math.abs(x) > i && Math.abs(x) < o && Math.abs(z) > i && Math.abs(z) < o;
    };
    // Windows: a band on each floor, never near the corners.
    const win = (x, y, z) => {
      const onZ = Math.abs(z) > FOOT_HALF - WALL - 0.2, onX = Math.abs(x) > FOOT_HALF - WALL - 0.2;
      if (!onZ && !onX) return false;
      const along = onZ ? x : z;
      if (Math.abs(along) > FOOT_HALF - 8) return false;
      const fy = ((y % 5) + 5) % 5;
      return fy > 1.6 && fy < 4.0 && Math.abs(((Math.abs(along) + 100) % 6) - 3) < 1.4;
    };
    B.openings((x, y, z) => inLeg(x, y, z) || win(x, y, z), () => {
      for (let c = 0; c < n; c++) {
        const y = c * ch;
        B.ring(0, 0, FOOT_HALF * 2, FOOT_HALF * 2, WALL, y, ch, stone, M.CONCRETE, c % 2 ? 0.5 : 0);
        B.slab(0, y + ch / 2, 0, WALL, ch, FOOT_HALF * 2 - WALL * 2 - 0.4, stone, M.CONCRETE);
        B.slab(0, y + ch / 2, 0, FOOT_HALF * 2 - WALL * 2 - 0.4, ch, WALL, stone, M.CONCRETE);
      }
    });
    // The roof: a walk round the outside over the wall, and two strips over
    // the cross walls. The four courts between them are open.
    const RT = 0.7;
    const ring = 5.0;
    B.openings(inLeg, () => {
      for (const side of [1, -1]) {
        B.slab(0, FOOT_H + RT / 2, side * (FOOT_HALF - ring / 2), FOOT_HALF * 2, RT, ring, stone * 1.4, M.CONCRETE);
        B.slab(side * (FOOT_HALF - ring / 2), FOOT_H + RT / 2, 0, ring, RT, FOOT_HALF * 2 - ring * 2, stone * 1.4, M.CONCRETE);
      }
      B.slab(0, FOOT_H + RT / 2, 0, 5.0, RT, FOOT_HALF * 2 - ring * 2, stone * 1.4, M.CONCRETE);
      B.slab(0, FOOT_H + RT / 2, 0, FOOT_HALF * 2 - ring * 2, RT, 5.0, stone * 1.4, M.CONCRETE);
    });
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison: riflemen and machine guns round FootTown's roof, anti-tank
 * teams at its corners, snipers on the observatory's walk outside the glass,
 * and a mortar section in pits on the ground between the feet.
 */
export function populateTokyotower(g, origin, groundY) {
  const K = TOKYOTOWER;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const ring = (y, half, n, type, cover, inset, spread) => {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 4;
      const side = Math.floor(t);
      const f = ((t - side) * 2 - 1) * spread;
      const r = half - inset;
      let x = 0, z = 0;
      if (side === 0) { x = f * r; z = r; } else if (side === 1) { x = r; z = -f * r; } else if (side === 2) { x = -f * r; z = -r; } else { x = -r; z = f * r; }
      g.place(type, V(x, y + 0.6, z), Math.atan2(x, z), 6, { cover });
    }
  };
  // FootTown's roof walk: the line the guns meet first.
  ring(K.foot.h, K.foot.half, 16, 'rifleman', 'roof', 2.2, 0.55);
  ring(K.foot.h, K.foot.half, 4, 'mg', 'roof', 2.2, 0.12);
  // Anti-tank teams on the cross strips, at the middle of each side.
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.place('at', V(nx * (K.foot.half - 9), K.foot.h + 0.6, nz * (K.foot.half - 9)), Math.atan2(nx, nz), 7, { cover: 'roof' });
  }
  // The observatory: snipers at the glass, a step inside it.
  ring(K.obs, K.obsHalf - 1.6, 8, 'sniper', 'window', 1.4, 0.6);
  ring(K.obs + 6, K.obsHalf - 1.6, 4, 'mg', 'window', 1.4, 0.3);
  // The special observatory: two snipers, 250 m over the city.
  for (const side of [1, -1]) {
    g.place('sniper', V(side * (K.specialHalf - 1.6), K.special + 0.6, 0), side > 0 ? Math.PI / 2 : -Math.PI / 2, 5, { cover: 'window' });
  }
  // Mortars in pits on the ground outside FootTown, between the feet.
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.place('mortar', V(nx * (K.foot.half + 10), 0.4, nz * (K.foot.half + 10)), 0, 22, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
