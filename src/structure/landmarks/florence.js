import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Santa Maria del Fiore, Florence: Brunelleschi's dome, the nave, the three
 * tribunes and Giotto's campanile.
 *
 * Reference figures (Saalman, "Filippo Brunelleschi: The Cupola of Santa
 * Maria del Fiore"; the Opera del Duomo; the Overture outline, which puts
 * the façade 32 m west of the origin, the crossing 76 m east of it, the
 * tribunes' tips 48 m out from the crossing's centre, and the campanile's
 * 14 m square 26 m west and 29 m south):
 *   nave              153 m over all, 38 m wide, four bays of 20 m; the
 *                     aisle roofs at 24 m, the nave roof to 48 m
 *   crossing          an octagon 54 m across its flats, eight corner piers,
 *                     four great arches at 22 m springing to a 30 m crown
 *   drum              the same octagon, 42 to 55 m, a 6 m oculus in each face
 *   dome              a pointed octagonal shell (quinto acuto), 55 to 91 m,
 *                     terracotta with eight white ribs
 *   lantern           91 to 114 m, the gilt ball on top
 *   tribunes          three half-octagons 37 m across, 40 m to the eave,
 *                     conical roofs against the drum
 *   campanile         14.45 m square, 84.7 m, banded white, green and pink
 *
 * Kind: a shell. Nothing here topples, and the suite must not expect it to.
 * The twist is where the dome's weight goes: the dome bears on the drum, the
 * drum on the eight piers at the crossing's corners, and between the piers
 * on the four great arches. Take the piers at one corner out and the drum
 * loses its bearing on that side, and the dome above it comes down in a
 * sheet, into the crossing. The tribunes wrap those piers, so the way to a
 * pier is through a tribune, and the garrison knows it.
 */

const S = 1.4;
const STONE_FINENESS = 0.8;

// Real metres, scaled once at the end. The level's origin is on the nave's
// axis, 32 m inside the façade.
const FACADE_X = -32.0;
const DX = 76.0;                            // the crossing's centre
const APOTHEM = 27.0;                       // the crossing octagon, centre to the outer face of a flat
const NAVE_W = 42.0;                        // over the aisle walls
const AISLE_WALL = 1.8, CLER_WALL = 2.0, CROSS_WALL = 3.0, DRUM_WALL = 3.0, DOME_WALL = 3.5;
const VESSEL_W = 19.0;                      // the nave proper, between the arcades
const AISLE_H = 24.0;                       // the aisle wall, to its eave
const CLER_H = 42.0;                        // the clerestory wall
const RIDGE_H = 48.0;
const FACADE_H = 52.0;
const BAYS = 4;
const BAY_L = (DX - APOTHEM - FACADE_X) / BAYS;   // 20.25
const ARCH_SPRING = 22.0, ARCH_HALF = 8.0;  // the great arches of the crossing
const DRUM_Y0 = 42.0, DRUM_Y1 = 55.0;
const DOME_D = 50.0;                        // the pointed profile's span
const DOME_TOP_A = 3.2;                     // apothem at which the shell closes under the lantern
const LANTERN_A = 3.4, LANTERN_H = 14.0, LANTERN_SPIRE = 7.0, BALL = 2.4;
const TRIB_A = 18.5;                        // a tribune's apothem
const TRIB_H = 40.0;
const CAMP = { x: -26.4, z: 29.4, w: 14.45, h: 84.7, wall: 2.6 };

// The dome's outer apothem at height y above its springing: a pointed arch
// whose radius is four fifths of the span (the quinto acuto), so each face's
// arc is centred three tenths of the span past the axis.
const domeA = (y) => -0.3 * DOME_D + Math.sqrt(Math.max(0, 0.64 * DOME_D * DOME_D - y * y));
const DOME_RISE = Math.sqrt(0.64 * DOME_D * DOME_D - (0.3 * DOME_D + DOME_TOP_A) ** 2);   // ~35.7
const DOME_Y0 = DRUM_Y1, DOME_Y1 = DRUM_Y1 + DOME_RISE;
const LANTERN_Y0 = DOME_Y1, LANTERN_TOP = LANTERN_Y0 + LANTERN_H + LANTERN_SPIRE + BALL;

/** What the garrison, the flag and the level record read. */
export const FLORENCE = {
  scale: S,
  facadeX: FACADE_X * S, crossX: DX * S, apothem: APOTHEM * S,
  naveW: NAVE_W * S, vesselW: VESSEL_W * S, aisleH: AISLE_H * S, clerH: CLER_H * S, ridgeH: RIDGE_H * S,
  aisleWall: AISLE_WALL * S, clerWall: CLER_WALL * S,
  bayL: BAY_L * S, bays: BAYS,
  drumY0: DRUM_Y0 * S, drumY1: DRUM_Y1 * S, domeTop: DOME_Y1 * S, lanternTop: LANTERN_TOP * S,
  tribA: TRIB_A * S, tribH: TRIB_H * S,
  camp: { x: CAMP.x * S, z: CAMP.z * S, w: CAMP.w * S, h: CAMP.h * S, wall: CAMP.wall * S,
    windows: [28, 44, 68].map((y) => y * S) },
  /** Rooflines a man can be posted on, low to high. */
  galleries: [AISLE_H * S, CLER_H * S, DRUM_Y0 * S],
  // The flag flies from the lantern's foot.
  flag: { x: DX * S, y: (LANTERN_Y0 + 1.0) * S, z: LANTERN_A * S + 0.4 },
};

export function buildFlorence(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.5 * s;
  const course = 1.0 * s;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  /**
   * One course along a polyline, open or closed, the stones yawed to each
   * edge with the wall's thickness centred on the line — `polyRing`'s
   * algorithm with an explicit "out" (away from `cx, cz`), an open option
   * for the tribunes and the nave's U, and a material per stone so the
   * dome's corner stones can be its white ribs.
   */
  const lay = (cx, cz, pts, wall, y, h, mat, phase, relief, closed = true) => {
    const halfH = h / 2, yc = y + halfH;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const count = Math.max(1, Math.round(len / stone));
      const seg = len / count;
      const ry = Math.atan2(dx, dz);
      let nx = dz / len, nz = -dx / len;
      const mx = a[0] + dx / 2 - cx, mz = a[1] + dz / 2 - cz;
      if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
      const stagger = count > 1 && phase ? 0.5 : 0;
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5 + stagger) / count;
        if (t >= 1.0) continue;
        const sx = a[0] + dx * t, sz = a[1] + dz * t;
        const e = relief ? Math.max(0, relief(sx + nx * wall / 2, sz + nz * wall / 2, yc)) : 0;
        const m = typeof mat === 'function' ? mat(sx, sz, yc, i, k, count) : mat;
        B.add(sx + nx * e / 2, yc, sz + nz * e / 2, B.shrink(wall / 2) + e / 2, B.shrink(halfH), B.shrink(seg / 2), m, ry);
      }
    }
  };
  /** Regular octagon of apothem `a` about (cx, cz), flats facing the axes. */
  const octagon = (cx, cz, a) => {
    const R = a / Math.cos(Math.PI / 8);
    return BlockList.circle(R, 8, Math.PI / 8).map(([x, z]) => [cx + x, cz + z]);
  };
  // The Florentine wall: white marble with a course of verde every fourth and
  // a course of the pink Maremma stone every eighth, which is what the
  // panelled facing reads as from across the piazza.
  // Every sixth course, not every other: the flanks are white walls with
  // green framing, and white and green in equal measure is a deck chair.
  // The campanile really is banded that closely, and gets its own rule.
  const banded = (c) => (c % 12 === 8 ? M.REDSTONE : c % 6 === 2 ? M.VERDE : M.MARBLE);
  const campBanded = (c) => (c % 8 === 3 ? M.REDSTONE : c % 4 === 1 ? M.VERDE : M.MARBLE);

  // ── The nave: aisle walls and the façade as one U of wall, the clerestory
  // walls standing on the arcade inside it, the roofs on both.
  const hw = NAVE_W / 2, hv = VESSEL_W / 2;
  const X1 = DX - APOTHEM;                  // where the nave meets the crossing
  B.section('nave', () => {
    // Aisle windows: one tall pointed window in each bay of each aisle wall;
    // the façade's three portals and its rose.
    const aisleWindow = (x, y, z) => {
      if (Math.abs(Math.abs(z) - hw) > AISLE_WALL) return false;
      if (x < FACADE_X + 3 || x > X1 - 3) return false;
      const d = ((x - FACADE_X) % BAY_L) - BAY_L / 2;
      if (Math.abs(d) > 1.6) return false;
      if (y < 9.0) return false;
      if (y < 17.0) return true;
      return d * d + (y - 17.0) ** 2 < 1.6 * 1.6;
    };
    const facadeOpen = (x, y, z) => {
      if (Math.abs(x - FACADE_X) > AISLE_WALL) return false;
      // The great portal, and the two side portals.
      if (Math.abs(z) < 3.2 && (y < 12 || z * z + (y - 12) ** 2 < 3.2 * 3.2)) return true;
      for (const zc of [-13.5, 13.5]) {
        if (Math.abs(z - zc) < 2.2 && (y < 8 || (z - zc) ** 2 + (y - 8) ** 2 < 2.2 * 2.2)) return true;
      }
      // The rose window.
      return z * z + (y - 38) ** 2 < 4.2 * 4.2;
    };
    const naveRelief = (x, z, y) => {
      // Buttresses at the bay lines on the aisle walls, a cornice at the eave.
      if (Math.abs(x - FACADE_X) < AISLE_WALL) return y > FACADE_H - 1.6 ? 0.5 : 0;
      if (y > AISLE_H - 1.2) return 0.45;
      const d = ((x - FACADE_X) % BAY_L);
      return (d < 1.4 || d > BAY_L - 1.4) && x > FACADE_X + 1 ? 0.7 : 0;
    };
    const U = [[X1 + 0.6, hw], [FACADE_X, hw], [FACADE_X, -hw], [X1 + 0.6, -hw]];
    B.openings((x, y, z) => aisleWindow(x, y, z) || facadeOpen(x, y, z), () => {
      courses(0, AISLE_H, course, (y, h, c) => {
        lay(DX / 2, 0, U, AISLE_WALL, y, h, banded(c), c % 2, naveRelief, false);
      });
      // The façade carries on above the aisles: the gable end of the nave and
      // its own crown, set against the clerestory walls.
      courses(AISLE_H, FACADE_H, course, (y, h, c) => {
        const t = Math.max(0, (y - CLER_H) / (FACADE_H - CLER_H));
        const half = hw - t * (hw - hv - 1.5);
        lay(DX / 2, 0, [[FACADE_X, half], [FACADE_X, -half]], AISLE_WALL, y, h, banded(c), c % 2, naveRelief, false);
      });
    });
    // The arcade and the clerestory: piers at the bay lines with pointed
    // arches between them, cut out of a wall that runs from the floor to the
    // eave, with a round window in each bay above the arches.
    const arcade = (x, y, z) => {
      if (Math.abs(Math.abs(z) - hv) > CLER_WALL) return false;
      if (x < FACADE_X + AISLE_WALL + 2.5 || x > X1 - 2.5) return false;
      const d = ((x - FACADE_X) % BAY_L) - BAY_L / 2;
      const half = BAY_L / 2 - 2.6;           // the pier is 5.2 m
      if (Math.abs(d) < half) {
        if (y < 14.0) return true;
        // A pointed arch: two arcs centred a quarter-span either side.
        const cx0 = d > 0 ? -half * 0.5 : half * 0.5;
        const r = half * 1.5;
        return (d - cx0) ** 2 + (y - 14.0) ** 2 < r * r;
      }
      return false;
    };
    const oculus = (x, y, z) => {
      if (Math.abs(Math.abs(z) - hv) > CLER_WALL) return false;
      if (x < FACADE_X + AISLE_WALL + 2.5 || x > X1 - 2.5) return false;
      const d = ((x - FACADE_X) % BAY_L) - BAY_L / 2;
      return d * d + (y - 34.0) ** 2 < 2.6 * 2.6;
    };
    B.openings((x, y, z) => arcade(x, y, z) || oculus(x, y, z), () => {
      courses(0, CLER_H, course, (y, h, c) => {
        for (const sz of [-1, 1]) {
          lay(DX / 2, 0, [[FACADE_X + AISLE_WALL, sz * hv], [X1 + 0.6, sz * hv]], CLER_WALL, y, h,
            y < AISLE_H ? M.MARBLE : banded(c), c % 2, (x, z, yy) => (yy > CLER_H - 1.2 ? 0.4 : 0), false);
        }
      });
    });
    // The aisle roofs: lean-to courses from each aisle wall up to the
    // clerestory, each stepping inward by less than its own width.
    const roofLen = X1 - FACADE_X - AISLE_WALL;
    const roofX = (FACADE_X + AISLE_WALL + X1) / 2;
    const run = hw - hv - CLER_WALL / 2;
    const rise = 6.0;
    const nR = Math.max(3, Math.round(rise / (course * 0.9)));
    const rw = (run / nR) * 1.9;
    for (let k = 0; k < nR; k++) {
      const yb = AISLE_H + (rise / nR) * k;
      const zc = hw + 0.6 - (run / nR) * (k + 0.5);
      for (const sz of [-1, 1]) {
        B.slab(roofX, yb + (rise / nR) / 2, sz * zc, roofLen, rise / nR, rw, stone * 1.6, M.REDSTONE);
      }
    }
    // The nave roof: two slopes stepping in to a ridge over the clerestory
    // walls, in the same terracotta.
    const gRun = hv + CLER_WALL / 2, gRise = RIDGE_H - CLER_H;
    const nG = Math.max(3, Math.round(gRise / (course * 0.9)));
    const gw = (gRun / nG) * 1.9;
    for (let k = 0; k < nG; k++) {
      const yb = CLER_H + (gRise / nG) * k;
      const zc = hv + CLER_WALL / 2 + 0.4 - (gRun / nG) * (k + 0.5);
      if (k === nG - 1) {
        B.slab(roofX, yb + (gRise / nG) / 2, 0, roofLen, gRise / nG, Math.max(gw, zc * 2 + gw), stone * 1.6, M.REDSTONE);
      } else {
        for (const sz of [-1, 1]) B.slab(roofX, yb + (gRise / nG) / 2, sz * zc, roofLen, gRise / nG, gw, stone * 1.6, M.REDSTONE);
      }
    }
  });

  // ── The crossing: the octagon of eight piers and four great arches, up to
  // the drum. The west arch opens to the nave, the others to the tribunes.
  const oct = octagon(DX, 0, APOTHEM);
  const flatMid = (i) => {
    const a = oct[i], b = oct[(i + 1) % 8];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  // Which flats face the axes: the octagon's edges i run from vertex i to
  // i+1; with vertices at 22.5° + 45°k, edge 0 faces +x... find them.
  const faceOf = (dx, dz) => {
    let best = 0, bd = -Infinity;
    for (let i = 0; i < 8; i++) {
      const [mx, mz] = flatMid(i);
      const d = (mx - DX) * dx + (mz - 0) * dz;
      if (d > bd) { bd = d; best = i; }
    }
    return best;
  };
  const F_W = faceOf(-1, 0), F_E = faceOf(1, 0), F_N = faceOf(0, -1), F_S = faceOf(0, 1);
  const greatArch = (x, y, z) => {
    for (const f of [F_W, F_E, F_N, F_S]) {
      const [mx, mz] = flatMid(f);
      const a = oct[f], b = oct[(f + 1) % 8];
      const ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez);
      const d = ((x - mx) * ex + (z - mz) * ez) / el;          // along the flat
      const p = Math.abs(((x - mx) * -ez + (z - mz) * ex) / el);   // off the flat
      if (p > CROSS_WALL) continue;
      if (Math.abs(d) >= ARCH_HALF) continue;
      if (y < ARCH_SPRING) return true;
      if (d * d + (y - ARCH_SPRING) ** 2 < ARCH_HALF * ARCH_HALF) return true;
    }
    return false;
  };
  const crossRelief = (x, z, y) => {
    // The corner piers stand proud as buttresses; a cornice at the top.
    if (y > DRUM_Y0 - 1.4) return 0.5;
    let nearCorner = false;
    for (const v of oct) if (Math.hypot(x - v[0], z - v[1]) < 4.5) nearCorner = true;
    return nearCorner ? 1.0 : 0;
  };
  B.section('crossing', () => {
    B.openings(greatArch, () => {
      courses(0, DRUM_Y0, course, (y, h, c) => {
        lay(DX, 0, oct, CROSS_WALL, y, h, banded(c), c % 2, crossRelief);
      });
    });
  });

  // ── The drum, with an oculus in each face.
  B.section('drum', () => {
    const oculus = (x, y, z) => {
      for (let i = 0; i < 8; i++) {
        const [mx, mz] = flatMid(i);
        const r2 = (x - mx) ** 2 + (z - mz) ** 2;
        const yc = (DRUM_Y0 + DRUM_Y1) / 2;
        if (r2 + (y - yc) ** 2 < 3.0 * 3.0) return true;
      }
      return false;
    };
    B.openings(oculus, () => {
      courses(DRUM_Y0, DRUM_Y1, course, (y, h, c) => {
        lay(DX, 0, oct, DRUM_WALL, y, h, banded(c), c % 2, (x, z, yy) => (yy > DRUM_Y1 - 1.2 ? 0.6 : 0));
      });
    });
  });

  // ── The dome: octagonal courses following the pointed profile, stepping
  // inward by less than the shell's thickness, terracotta between eight
  // marble ribs at the corners; the top closes solid under the lantern.
  B.section('dome', () => {
    courses(DOME_Y0, DOME_Y1, course, (y, h, c) => {
      const a = domeA(y + h / 2 - DOME_Y0);
      if (a <= DOME_WALL * 1.15) {
        B.slab(DX, y + h / 2, 0, Math.max(a * 2, stone), h, Math.max(a * 2, stone), stone, M.REDSTONE);
        return;
      }
      // The ring's outer apothem is the profile at the course's bottom, the
      // inner at least the wall inside the profile at its top, so each course
      // sits on the one below.
      const aOut = domeA(y - DOME_Y0), aIn = Math.min(domeA(y + h - DOME_Y0) - 0.4, aOut - DOME_WALL);
      const wall = aOut - aIn;
      const pts = octagon(DX, 0, (aOut + aIn) / 2);
      lay(DX, 0, pts, wall, y, h, (sx, sz, yc, i, k, count) => (k === 0 || k === count - 1 ? M.MARBLE : M.REDSTONE),
        c % 2, (x, z) => {
          for (const v of pts) if (Math.hypot(x - v[0], z - v[1]) < 2.2) return 0.6;
          return 0;
        });
    });
  });

  // ── The lantern: an octagonal tempietto with eight buttresses, a spire
  // and the gilt ball.
  B.section('lantern', () => {
    const lanternWindow = (x, y, z) => {
      const dx = x - DX, dz = z;
      const r = Math.hypot(dx, dz);
      const ang = Math.atan2(dz, dx);
      const off = Math.abs(((ang + Math.PI / 8) % (Math.PI / 4) + Math.PI / 4) % (Math.PI / 4) - Math.PI / 8);
      return y > LANTERN_Y0 + 2.5 && y < LANTERN_Y0 + LANTERN_H - 3.0 && off * r < 0.9;
    };
    B.openings(lanternWindow, () => {
      courses(LANTERN_Y0, LANTERN_Y0 + LANTERN_H, course * 0.8, (y, h, c) => {
        const pts = octagon(DX, 0, LANTERN_A);
        lay(DX, 0, pts, 1.3, y, h, M.MARBLE, c % 2, (x, z) => {
          for (const v of pts) if (Math.hypot(x - v[0], z - v[1]) < 1.2) return 0.9;
          return 0;
        });
      });
    });
    B.spire(DX, 0, LANTERN_Y0 + LANTERN_H, LANTERN_Y0 + LANTERN_H + LANTERN_SPIRE, LANTERN_A * 2.2, 1.2, course * 0.8, stone * 0.8, M.MARBLE, 0.5);
    B.slab(DX, LANTERN_Y0 + LANTERN_H + LANTERN_SPIRE + BALL / 2, 0, BALL, BALL, BALL, BALL, M.GILT);
  });

  // ── The tribunes: three half-octagons on the north, south and east faces,
  // their end walls running into the crossing, a window in each face, and a
  // conical roof of corbelled courses leaning back against the drum.
  B.section('tribunes', () => {
    for (const [ux, uz] of [[1, 0], [0, -1], [0, 1]]) {
      const cx = DX + ux * (APOTHEM - 0.6), cz = uz * (APOTHEM - 0.6);   // the tribune's own centre, on the crossing face
      const full = octagon(cx, cz, TRIB_A);
      // Keep the five faces that lie outside the crossing (their midpoints
      // further out along (ux, uz) than the crossing face).
      const isOuter = (i) => {
        const a = full[i], b = full[(i + 1) % 8];
        const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
        return mx * ux + mz * uz > 0.5;
      };
      // Walk the chain from the edge whose predecessor is inside.
      let start = 0;
      for (let i = 0; i < 8; i++) if (isOuter(i) && !isOuter((i + 7) % 8)) start = i;
      const outer = [];
      for (let i = start; isOuter(i) && outer.length < 8; i = (i + 1) % 8) outer.push(i);
      // Order them as a chain and take the vertices, pushing the two ends
      // 0.8 m into the crossing wall so the tribune is bonded to it.
      const chain = [];
      for (const i of outer) chain.push(full[i]);
      chain.push(full[(outer[outer.length - 1] + 1) % 8]);
      const pts = chain.map((p, idx) => (idx === 0 || idx === chain.length - 1)
        ? [p[0] - ux * 1.4, p[1] - uz * 1.4] : p);
      const tribWindow = (x, y, z) => {
        // A tall pointed window in the middle of each face, well off the corners.
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez);
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
          const d = ((x - mx) * ex + (z - mz) * ez) / el;
          const p = Math.abs(((x - mx) * -ez + (z - mz) * ex) / el);
          if (p > CROSS_WALL || Math.abs(d) > 1.6) continue;
          if (y > 14 && y < 26) return true;
          if (y >= 26 && d * d + (y - 26) ** 2 < 1.6 * 1.6) return true;
        }
        return false;
      };
      B.openings(tribWindow, () => {
        courses(0, TRIB_H, course, (y, h, c) => {
          lay(cx, cz, pts, CROSS_WALL, y, h, banded(c), c % 2,
            (x, z, yy) => (yy > TRIB_H - 1.3 ? 0.5 : 0), false);
        });
      });
      // The roof: half-octagon rings shrinking toward the drum, each one
      // overlapping the one below by more than half its width. The rings'
      // ends run into the crossing's wall.
      const roofRise = 12.0;
      const nR = Math.max(4, Math.round(roofRise / (course * 0.85)));
      const ch = roofRise / nR;
      const stepIn = (TRIB_A - 4.0) / nR;
      for (let k = 0; k < nR; k++) {
        const aOut = TRIB_A + 0.6 - stepIn * k;
        const wall = Math.max(stepIn * 1.9, CROSS_WALL);
        const ring = octagon(cx, cz, aOut - wall / 2);
        const rp = [];
        for (const i of outer) rp.push(ring[i]);
        rp.push(ring[(outer[outer.length - 1] + 1) % 8]);
        const rpts = rp.map((p, idx) => (idx === 0 || idx === rp.length - 1)
          ? [p[0] - ux * 1.4, p[1] - uz * 1.4] : p);
        lay(cx, cz, rpts, wall, TRIB_H + k * ch, ch, M.REDSTONE, k % 2, null, false);
      }
    }
  });

  // ── Giotto's campanile: a banded square tower with paired windows on two
  // stages and a great triple window at the top, a cornice, and a flat roof.
  B.section('campanile', () => {
    const hwid = CAMP.w / 2;
    const campWindow = (x, y, z) => {
      const dx = x - CAMP.x, dz = z - CAMP.z;
      const onX = Math.abs(Math.abs(dx) - hwid) < CAMP.wall + 0.1;
      const onZ = Math.abs(Math.abs(dz) - hwid) < CAMP.wall + 0.1;
      if (!onX && !onZ) return false;
      const along = onX ? dz : dx;
      if (Math.abs(along) > hwid - 3.0) return false;
      // Two stages of paired lancets: two slots either side of the face's middle.
      for (const [y0, y1] of [[24, 33], [40, 49]]) {
        if (y > y0 && y < y1 && Math.abs(Math.abs(along) - 1.8) < 0.9) return true;
      }
      // The top stage: one great window per face.
      if (y > 62 && y < 74 && Math.abs(along) < 2.2) return true;
      if (y >= 74 && along * along + (y - 74) ** 2 < 2.2 * 2.2) return true;
      return false;
    };
    const campRelief = (x, z, y) => {
      if (y > CAMP.h - 1.6) return 0.8;                                   // the crowning cornice
      for (const yy of [12, 24, 36, 50, 60]) if (Math.abs(y - yy) < 0.6) return 0.25;   // string courses
      const dx = Math.abs(x - CAMP.x), dz = Math.abs(z - CAMP.z);
      return (dx > hwid - 1.6 && dz > hwid - 1.6) ? 0.4 : 0;               // corner pilasters
    };
    B.openings(campWindow, () => {
      courses(0, CAMP.h, course, (y, h, c) => {
        B.ring(CAMP.x, CAMP.z, CAMP.w, CAMP.w, CAMP.wall, y, h, stone, campBanded(c), c % 2, (x, z) => campRelief(x, z, y + h / 2));
      });
    });
    // The roof: one course of paving on the walls.
    B.slab(CAMP.x, CAMP.h + course * 0.4, CAMP.z, CAMP.w - CAMP.wall * 0.6, course * 0.8, CAMP.w - CAMP.wall * 0.6, stone, M.MARBLE);
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen at the aisle windows, machine guns at the
 * clerestory's round windows, anti-tank teams in the portals and the
 * tribunes' windows, snipers in the campanile's top windows and on the drum,
 * and mortars on the aisle roofs under the clerestory.
 */
export function populateFlorence(g, origin, groundY) {
  const F = FLORENCE;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const hw = F.naveW / 2, hv = F.vesselW / 2;
  // Aisle windows: a man at the sill of each, both sides.
  for (let k = 0; k < F.bays; k++) {
    const x = F.facadeX + F.bayL * (k + 0.5);
    for (const sz of [-1, 1]) {
      g.place('rifleman', V(x, 9.0 * F.scale + 0.3, sz * (hw - F.aisleWall * 0.5)), sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
    }
  }
  // Clerestory oculi: machine guns, alternating sides.
  for (let k = 0; k < F.bays; k++) {
    const x = F.facadeX + F.bayL * (k + 0.5);
    const sz = k % 2 ? 1 : -1;
    g.place('mg', V(x, 34.0 * F.scale - 2.6 * F.scale, sz * (hv + F.clerWall * 0.5)), sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
  }
  // The portals: anti-tank teams in the great door and the two side doors.
  for (const z of [0, -13.5 * F.scale, 13.5 * F.scale]) {
    g.place('at', V(F.facadeX + F.aisleWall * 0.5, 0.4, z), -Math.PI / 2, 6, { cover: 'arcade' });
  }
  // The tribunes' windows: an AT team in the outermost face of each, a rifleman either side.
  for (const [ux, uz] of [[1, 0], [0, -1], [0, 1]]) {
    const cx = F.crossX + ux * (F.apothem - 0.6 * F.scale), cz = uz * (F.apothem - 0.6 * F.scale);
    const r = F.tribA - 1.5 * F.scale;
    g.place('at', V(cx + ux * r, 14.0 * F.scale + 0.3, cz + uz * r), Math.atan2(ux, uz), 6, { cover: 'window' });
    for (const side of [-1, 1]) {
      const a = Math.atan2(uz, ux) + side * Math.PI / 4;
      g.place('rifleman', V(cx + Math.cos(a) * r, 14.0 * F.scale + 0.3, cz + Math.sin(a) * r), Math.atan2(Math.cos(a), Math.sin(a)), 6, { cover: 'window' });
    }
  }
  // The campanile: snipers at the great windows of the top stage, one per face.
  const C = F.camp;
  for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.place('sniper', V(C.x + ux * (C.w / 2 - C.wall * 0.5), 62.0 * F.scale + 0.3, C.z + uz * (C.w / 2 - C.wall * 0.5)),
      Math.atan2(ux, uz), 6, { cover: 'window' });
  }
  // The drum's oculi: snipers on the four diagonal faces, looking out over the roofs.
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
    const r = F.apothem - 1.5 * F.scale;
    g.place('sniper', V(F.crossX + Math.cos(a) * r, F.drumY0 + 3.5 * F.scale + 0.3, Math.sin(a) * r),
      Math.atan2(Math.cos(a), Math.sin(a)), 6, { cover: 'window' });
  }
  // Mortars on the aisle roofs, at the foot of the slope, both sides.
  for (const [k, sz] of [[1, -1], [2, 1], [3, -1]]) {
    const x = F.facadeX + F.bayL * (k + 0.5);
    g.place('mortar', V(x, F.aisleH + 1.0 * F.scale, sz * (hw - 1.4 * F.scale)), 0, 8, { cover: 'roof' });
  }
}
