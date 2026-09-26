import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Atomium, Brussels.
 *
 * Reference figures (Waterkeyn's drawings via the Atomium asbl; the Overture
 * outline, a 51-point hexagonal footprint 99 × 97 m centred three metres from
 * the origin, with a lower sphere on the bearing 12° south of east):
 *   height            102 m to the top of the top sphere
 *   spheres           nine, 18 m across, at the corners and centre of a cube
 *                     standing on one vertex; edges 41 m centre to centre
 *   tubes             3.3 m across: the twelve cube edges, six half-diagonals
 *                     from the centre sphere, and the vertical column through
 *                     bottom, centre and top
 *   bipods            three pairs of legs under the three lower outer spheres
 *   base pavilion     the entrance under the bottom sphere
 *
 * Kind: a lattice. The mass is in the spheres and the spheres carry only
 * themselves; the load runs down the column and the three bipods. The tubes
 * are stacks of yawed stones that corbel — each steps sideways by less than
 * its own width — so the solver's "underneath" walk follows them from sphere
 * to sphere. Take the bipods and it is a tower on one leg; take the column at
 * the pavilion and the whole molecule comes down. STEEL throughout, with
 * glass only where nothing rests on it.
 */

const S = 2.0;
const STONE_FINENESS = 0.7;

// Real metres, scaled once at the end.
const L = 41.0;                              // cube edge, sphere centre to sphere centre
const R = 9.0;                               // sphere radius
const TUBE = 3.3;                            // tube diameter
const LEG = 2.2;                             // a bipod leg
const BOTTOM_Y = 22.0;                       // the bottom sphere's centre
const PAVILION = { w: 32, d: 26, h: 9.0 };
const RING_R = L * Math.sqrt(2 / 3);         // 33.5: the six outer spheres' radius from the axis
const LOWER_Y = BOTTOM_Y + L / Math.sqrt(3); // 45.7
const UPPER_Y = BOTTOM_Y + 2 * L / Math.sqrt(3);   // 69.3
const TOP_Y = BOTTOM_Y + L * Math.sqrt(3);   // 93.0
const CENTRE_Y = (BOTTOM_Y + TOP_Y) / 2;     // 57.5
const AZ0 = (12 * Math.PI) / 180;            // a lower sphere's bearing, from +x toward +z
const deg = (a) => (a * Math.PI) / 180;

/** The nine spheres, by name, with their centres. */
const SPHERES = (() => {
  const out = { bottom: [0, BOTTOM_Y, 0], centre: [0, CENTRE_Y, 0], top: [0, TOP_Y, 0] };
  for (let i = 0; i < 3; i++) {
    const a = AZ0 + i * deg(120);
    out[`lower${i}`] = [Math.cos(a) * RING_R, LOWER_Y, Math.sin(a) * RING_R];
    const b = a + deg(60);
    out[`upper${i}`] = [Math.cos(b) * RING_R, UPPER_Y, Math.sin(b) * RING_R];
  }
  return out;
})();
/** The twelve edges of the cube. */
const EDGES = (() => {
  const e = [];
  for (let i = 0; i < 3; i++) {
    e.push(['bottom', `lower${i}`]);
    e.push([`lower${i}`, `upper${i}`]);
    e.push([`lower${i}`, `upper${(i + 2) % 3}`]);
    e.push([`upper${i}`, 'top']);
  }
  return e;
})();
/** The half-diagonals from the centre sphere to the six outer ones. */
const DIAGONALS = (() => {
  const d = [];
  for (let i = 0; i < 3; i++) { d.push(['centre', `lower${i}`]); d.push(['centre', `upper${i}`]); }
  return d;
})();

/** What the garrison, the flag and the level record read. */
export const ATOMIUM = {
  scale: S,
  radius: R * S, tube: TUBE * S,
  spheres: Object.fromEntries(Object.entries(SPHERES).map(([k, [x, y, z]]) => [k, { x: x * S, y: y * S, z: z * S }])),
  pavilion: { w: PAVILION.w * S, d: PAVILION.d * S, h: PAVILION.h * S },
  /** Height of a sphere's window sill above its centre, and the sill's radius, in world metres. */
  window: { dy: 1.6 * S, r: Math.sqrt(R * R - 1.6 * 1.6) * S },
  /** Rooflines a man can be posted on, low to high. */
  galleries: [PAVILION.h * S, (TOP_Y + R) * S],
  flag: { x: 0, y: (TOP_Y + R + 0.5) * S, z: 0 },
};

export function buildAtomium(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.3 * s;
  const course = 1.0 * s;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  // Sphere courses share one grid, so a tube's first stone lands on a ring's top.
  const SPH_N = Math.max(8, Math.round((2 * R) / course));
  const SPH_H = (2 * R) / SPH_N;
  const sphereGrid = (cy) => (k) => cy - R + k * SPH_H;
  const snap = (cy, y) => cy - R + Math.round((y - (cy - R)) / SPH_H) * SPH_H;
  /** Radius of the sphere's section at height dy above its centre. */
  const rAt = (dy) => Math.sqrt(Math.max(0, R * R - dy * dy));

  /**
   * A sphere as horizontal rings. Each course's ring spans from an outer
   * radius to an inner one chosen so it sits on the course below — in the
   * lower half the outer face follows the profile at the course's top and the
   * ring reaches inward past the course below's outer face; in the upper half
   * the outer face follows the profile at the course's bottom. The caps are
   * solid. `windows` are stones never laid: a sill's worth of shell at the
   * equator, one stone wide, where a man can stand.
   */
  const sphere = (cx, cy, cz, windows, glassTop) => {
    const wallMin = Math.max(2.0, stone * 1.2);
    const grid = sphereGrid(cy);
    for (let k = 0; k < SPH_N; k++) {
      const y0 = grid(k), y1 = grid(k + 1);
      const d0 = y0 - cy, d1 = y1 - cy;
      const lower = (y0 + y1) / 2 < cy;
      let b, a;
      if (lower) { b = rAt(d1); a = Math.max(0, Math.min(rAt(d0), b - wallMin)); }
      else { b = rAt(d0); a = Math.max(0, Math.min(rAt(d1), b - wallMin)); }
      const mat = glassTop && k >= SPH_N - 2 ? M.GLASS : M.STEEL;
      if (a < wallMin * 0.6 || b < wallMin * 1.2) {
        const w = Math.max(b * 2, stone * 0.8);
        B.slab(cx, (y0 + y1) / 2, cz, w, y1 - y0, w, Math.max(stone, w / 3), mat);
        continue;
      }
      const wall = b - a;
      const rc = (a + b) / 2;
      const sides = Math.max(12, Math.round((2 * Math.PI * rc) / stone));
      const rot = (k % 2) * (Math.PI / sides);
      const pts = BlockList.circle(rc, sides, rot);
      const isWindow = windows && Math.abs((y0 + y1) / 2 - (cy + 1.6)) < SPH_H * 0.5
        ? (x, z) => { const ang = Math.atan2(z - cz, x - cx); const m = ((ang % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); return Math.abs(m - Math.PI / 4) < (stone * 0.6) / rc; }
        : null;
      if (isWindow) {
        B.openings((x, y, z) => isWindow(x, z), () => B.polyRing(cx, cz, pts, wall, y0, y1 - y0, stone, mat, k % 2));
      } else {
        B.polyRing(cx, cz, pts, wall, y0, y1 - y0, stone, mat, k % 2);
      }
    }
  };

  /**
   * A tube from sphere `A` to sphere `B` as a stack of yawed stones, four to a
   * course, each course centred on the tube's axis at its own height, so the
   * stack corbels along the axis. It starts on a course top of A's rings and
   * ends on a course bottom of B's, so the solver's walk runs ring to tube to
   * ring. `pitch` is the course height; steeper tubes take a taller course.
   */
  const tube = (A, Bp, diam, pitch, mat) => {
    let lo = A, hi = Bp;
    if (lo[1] > hi[1]) { lo = Bp; hi = A; }
    const dx = hi[0] - lo[0], dy = hi[1] - lo[1], dz = hi[2] - lo[2];
    const len = Math.hypot(dx, dy, dz);
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // Where the axis leaves the lower sphere and enters the upper one.
    const yExit0 = lo[1] + uy * R, yExit1 = hi[1] - uy * R;
    const y0 = snap(lo[1], yExit0), y1 = snap(hi[1], yExit1);
    if (y1 - y0 < pitch * 0.5) return;
    const n = Math.max(1, Math.round((y1 - y0) / pitch));
    const h = (y1 - y0) / n;
    const yaw = Math.atan2(ux, uz);
    const half = diam / 2;
    // Plan footprint along the tube's horizontal direction is stretched so
    // consecutive courses overlap by more than a third of their width.
    const horiz = Math.hypot(ux, uz);
    const step = horiz > 1e-6 ? (h / uy) * horiz : 0;
    const along = Math.max(diam, step * 1.6);
    for (let k = 0; k < n; k++) {
      const yc = y0 + (k + 0.5) * h;
      const t = (yc - lo[1]) / dy;
      const cx = lo[0] + dx * t, cz = lo[2] + dz * t;
      // Four stones to a course: two across, two along.
      const ax = horiz > 1e-6 ? ux / horiz : 0, az = horiz > 1e-6 ? uz / horiz : 1;   // horizontal along
      const px = -az, pz = ax;                                                        // across
      for (const i of [-0.5, 0.5]) {
        for (const j of [-0.5, 0.5]) {
          const x = cx + ax * i * (along / 2) + px * j * half, z = cz + az * i * (along / 2) + pz * j * half;
          B.add(x, yc, z, B.shrink(half / 2), B.shrink(h / 2), B.shrink(along / 4), mat, yaw);
        }
      }
    }
  };

  // ── The base pavilion and the column through it.
  B.section('base', () => {
    const pav = (x, y, z) => Math.abs(x) < PAVILION.w / 2 - 2.0 && Math.abs(z) < PAVILION.d / 2 - 2.0
      && y > 0.5 && y < PAVILION.h - 1.5 && Math.abs(x) > TUBE * 0.9;   // hollow, but for the column
    B.openings(pav, () => {
      courses(0, PAVILION.h, course, (y, h, c) => {
        B.ring(0, 0, PAVILION.w, PAVILION.d, 2.0, y, h, stone * 1.4, M.STEEL, c % 2, (x, z) => (y + h > PAVILION.h - 0.5 ? 0.3 : 0));
      });
    });
    // The roof: one course of plates on the walls, with a hole for the column.
    B.openings((x, y, z) => Math.hypot(x, z) < TUBE * 0.9, () => {
      B.slab(0, PAVILION.h + course * 0.4, 0, PAVILION.w - 1.0, course * 0.8, PAVILION.d - 1.0, stone * 2.2, M.STEEL);
    });
  });
  B.section('column', () => {
    // From the ground to the top sphere's centre, through the bottom and
    // centre spheres, in one grid with the spheres.
    courses(0, snap(TOP_Y, TOP_Y), SPH_H, (y, h) => {
      B.slab(0, y + h / 2, 0, TUBE, h, TUBE, TUBE / 2 + 0.02, M.STEEL);
    });
  });

  // ── The spheres.
  B.section('spheres', () => {
    for (const [name, [x, y, z]] of Object.entries(SPHERES)) {
      const windows = name !== 'bottom';
      sphere(x, y, z, windows, name === 'top');
    }
  });

  // ── The tubes: the edges at 35°, the half-diagonals at 19°.
  B.section('tubes', () => {
    for (const [a, b] of EDGES) tube(SPHERES[a], SPHERES[b], TUBE, course * 0.8, M.STEEL);
    for (const [a, b] of DIAGONALS) tube(SPHERES[a], SPHERES[b], TUBE, course * 0.5, M.STEEL);
  });

  // ── The bipods: two legs under each lower outer sphere, from the ground
  // to the sphere's bottom cap, splayed either side of its bearing.
  B.section('bipods', () => {
    for (let i = 0; i < 3; i++) {
      const sp = SPHERES[`lower${i}`];
      const az = Math.atan2(sp[2], sp[0]);
      const capY = snap(sp[1], sp[1] - R + SPH_H);       // the first course's top
      for (const side of [-1, 1]) {
        const a = az + side * deg(11);
        const foot = [Math.cos(a) * (RING_R + 6.5), 0, Math.sin(a) * (RING_R + 6.5)];
        const head = [sp[0] + Math.cos(az + side * Math.PI / 2) * 1.6, capY, sp[2] + Math.sin(az + side * Math.PI / 2) * 1.6];
        const dx = head[0] - foot[0], dz = head[2] - foot[2], dy = head[1] - foot[1];
        const n = Math.max(4, Math.round(dy / course));
        const h = dy / n;
        const horiz = Math.hypot(dx, dz);
        const yaw = Math.atan2(dx, dz);
        const along = Math.max(LEG, (h / dy) * horiz * 1.6);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const cx = foot[0] + dx * t, cz = foot[2] + dz * t;
          const ax = dx / horiz, az2 = dz / horiz, px = -az2, pz = ax;
          for (const ii of [-0.5, 0.5]) {
            for (const jj of [-0.5, 0.5]) {
              B.add(cx + ax * ii * (along / 2) + px * jj * (LEG / 2), (k + 0.5) * h, cz + az2 * ii * (along / 2) + pz * jj * (LEG / 2),
                B.shrink(LEG / 4), B.shrink(h / 2), B.shrink(along / 4), M.STEEL, yaw);
            }
          }
        }
      }
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Men at the windows of the spheres, standing in the shell's
 * thickness a little above each sphere's equator, four to a sphere: riflemen
 * low, machine guns in the middle ring, snipers in the top sphere; anti-tank
 * teams on the pavilion's roof at its corners, mortars on the roof's far
 * side.
 */
export function populateAtomium(g, origin, groundY) {
  const A = ATOMIUM;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const post = (name, type) => {
    const c = A.spheres[name];
    for (const ang of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
      const r = A.window.r - 1.2;
      g.place(type, V(c.x + Math.cos(ang) * r, c.y + A.window.dy - 0.6, c.z + Math.sin(ang) * r),
        Math.atan2(Math.cos(ang), Math.sin(ang)), 6, { cover: 'window' });
    }
  };
  for (let i = 0; i < 3; i++) post(`lower${i}`, 'rifleman');
  post('centre', 'mg');
  for (let i = 0; i < 3; i++) post(`upper${i}`, i === 1 ? 'mg' : 'rifleman');
  post('top', 'sniper');
  // The pavilion roof: AT at the corners, mortars along the back.
  const P = A.pavilion;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    g.place('at', V(sx * (P.w / 2 - 3.0), P.h + 0.6, sz * (P.d / 2 - 3.0)), Math.atan2(sx, sz), 6, { cover: 'roof' });
  }
  for (const x of [-P.w * 0.25, 0, P.w * 0.25]) {
    g.place('mortar', V(x, P.h + 0.6, -(P.d / 2 - 4.0)), Math.PI, 6, { cover: 'roof' });
  }
}
