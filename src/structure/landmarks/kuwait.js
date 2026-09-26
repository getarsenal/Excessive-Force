import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Kuwait Towers, on Ras Ajuza.
 *
 * Reference figures (Malene Bjørn and VBB; the Aga Khan Award citation; the
 * plan from tools/survey.py):
 *   main tower        187 m; the lower sphere 32 m across with its centre near
 *                     82 m, the upper 14.5 m across near 123 m
 *   second tower      147 m, one sphere of 32 m, a water tank
 *   third tower       113 m, a plain needle carrying floodlights
 *   shafts            tapering reinforced concrete, about 15 m across at the
 *                     foot of the main tower
 *   spheres           steel shells faced in enamelled discs, blue, green and grey
 *   plan              the main tower 45 m east-north-east of the origin, the
 *                     second 50 m west of it, the needle south of both
 *
 * Kind: a cantilever, three of them. The mass is the spheres and the shafts
 * are slender; each shaft is a hollow concrete cone and each sphere is a
 * shell of enamel over a solid core of water and floors. The twist is that a
 * sphere is a weight on a stick: cut the shaft below a sphere and the sphere
 * comes down whole, and everything above it comes with it. Cut it above and
 * you have taken the needle off and left the weight standing.
 *
 * The spheres are laid as courses that follow the ball — rings on the
 * outside, a coarse core inside — stepping out by less than a stone's width
 * over the shaft and back in over the top, so every course stands on the one
 * under it. The bottom two metres of each ball are left off: the profile is
 * steeper than a stone can corbel there, and from the ground it is the
 * shadow under the ball anyway.
 */

const S = 1.4;
const STONE_FINENESS = 0.85;

// Real metres, +x east, +z south, from the survey.
const TOWERS = [
  // The main tower: two spheres.
  { tag: 'tower1', x: 27.0, z: 15.0, h: 187.0, r0: 7.5, r1: 1.6,
    spheres: [{ tag: 'spheres', y: 82.0, r: 16.0 }, { tag: 'spheres', y: 123.0, r: 7.2 }] },
  // The second: one sphere, the water tank.
  { tag: 'tower2', x: -5.5, z: 11.5, h: 147.0, r0: 6.5, r1: 1.4,
    spheres: [{ tag: 'spheres', y: 80.0, r: 15.0 }] },
  // The needle.
  { tag: 'tower3', x: 5.0, z: 33.0, h: 113.0, r0: 3.8, r1: 0.7, spheres: [] },
];
const SHAFT_WALL = 1.6;
const SPHERE_WALL = 2.4;
// The plaza the three stand on: a paved podium over the rock, a step above the sea.
const PODIUM = { x0: -22.0, x1: 46.0, z0: -4.0, z1: 50.0, h: 3.6 };

/** The shaft's radius at height y. */
const shaftR = (T, y) => T.r0 + (T.r1 - T.r0) * Math.min(1, Math.max(0, y / T.h));

/** What the garrison, the flag and the level record read. */
export const KUWAIT = {
  scale: S,
  towers: TOWERS.map((T) => ({
    x: T.x * S, z: T.z * S, h: T.h * S, r0: T.r0 * S,
    spheres: T.spheres.map((sp) => ({ y: sp.y * S, r: sp.r * S, top: (sp.y + sp.r) * S })),
  })),
  podium: { x0: PODIUM.x0 * S, x1: PODIUM.x1 * S, z0: PODIUM.z0 * S, z1: PODIUM.z1 * S, h: PODIUM.h * S },
  /** Rooflines a man can be posted on, low to high: the plaza, the second sphere's top, the main lower sphere's top. */
  galleries: [PODIUM.h * S, (80.0 + 15.0) * S, (82.0 + 16.0) * S],
  // The flag flies from the tip of the main tower.
  flag: { x: TOWERS[0].x * S, y: (TOWERS[0].h + 0.5) * S, z: TOWERS[0].z * S },
};

export function buildKuwait(quality) {
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
  // A hand's gap between stacks that must not share load: the solver counts
  // any touching stone with a lower centre as a supporter.
  const GAP = 0.12;

  /**
   * A solid disc of radius `R` as one course, on a grid whose pitch never
   * changes, so every stone of the next disc stands squarely on this one.
   * Only stones wholly inside `R` are laid, which leaves the disc's edge
   * ragged and a little inside the ring that hides it.
   */
  const disc = (cx, cz, y, h, R, pitch, mat) => {
    if (R < pitch * 1.45) {
      B.add(cx, y + h / 2, cz, R * 0.75, B.shrink(h / 2), R * 0.75, mat);
      return;
    }
    const n = Math.ceil(R / pitch) + 1;
    for (let i = -n; i < n; i++) {
      for (let j = -n; j < n; j++) {
        const px = (i + 0.5) * pitch, pz = (j + 0.5) * pitch;
        if (Math.hypot(px, pz) + pitch * 0.71 > R) continue;
        B.add(cx + px, y + h / 2, cz + pz, B.shrink(pitch / 2), B.shrink(h / 2), B.shrink(pitch / 2), mat);
      }
    }
  };
  /** A ring course of radius R (to the outer face) and thickness W. */
  const ring = (cx, cz, y, h, R, W, c, mat) => {
    const sides = Math.max(10, Math.round((2 * Math.PI * (R - W / 2)) / stone));
    B.polyRing(cx, cz, BlockList.circle(R - W / 2, sides, (c % 2) * (Math.PI / sides)), W, y, h, stone, mat);
  };

  /** The shaft wall thickens toward the foot: a cone of one thickness stands
   * at its capacity under a hundred thousand tonnes of ball. */
  const wallAt = (R) => Math.max(SHAFT_WALL, R * 0.45);
  const pitch = stone * 1.15;
  // Where each sphere begins and ends, so the shaft knows where to stop.
  const bandsOf = (T) => T.spheres.map((sp) => {
    const y0 = sp.y - sp.r + 2.0;
    const n = Math.max(1, Math.round((2 * sp.r - 2.0) / course));
    const yc = y0 + (2 * sp.r - 2.0) / n / 2;
    // The ball's radius at its first course, which is what the shaft must
    // have flared out to by the time the ball begins.
    return { ...sp, y0, y1: sp.y + sp.r, R0: Math.sqrt(Math.max(0, sp.r * sp.r - (yc - sp.y) * (yc - sp.y))) };
  });

  // ── A shaft: a hollow cone, closing to solid over the courses under a
  // sphere so the ball has a floor that carries into the whole section, and
  // solid once it is too thin to be hollow.
  const shaft = (T) => {
    const bands = bandsOf(T);
    let y = PODIUM.h;
    const CLOSE = 7;                 // courses over which the wall closes to solid
    while (y < T.h - 0.01) {
      const next = bands.find((bb) => bb.y0 > y + 0.01);
      const stop = next ? next.y0 : T.h;
      courses(y, stop, course, (yy, h, k) => {
        const Rs = shaftR(T, yy + h / 2);
        const toBand = next ? next.y0 - yy : Infinity;
        const steps = Math.round(toBand / course);       // courses left before the ball
        const closing = steps <= CLOSE;
        // Under a ball the shaft flares into a collar as wide as the ball's
        // first course, a step of less than a stone a course, and closes to
        // solid as it does: the ball stands on the whole section.
        const frac = closing ? 1 - (steps - 1) / CLOSE : 0;
        const R = closing ? Rs + (next.R0 + 0.3 - Rs) * frac : Rs;
        const W0 = wallAt(R);
        const W = closing ? W0 + (R - W0) * frac : W0;
        if (R <= SHAFT_WALL * 1.3 || W >= R - pitch * 0.7) {
          disc(T.x, T.z, yy, h, R + 0.3, pitch, M.CONCRETE);
        } else {
          ring(T.x, T.z, yy, h, R, W, k, M.CONCRETE);
        }
      });
      y = next ? next.y1 : T.h;
    }
  };

  // ── A sphere: rings of enamel over a solid core, following the ball,
  // stepping out by less than a stone a course and back in over the top,
  // then closing solid where it has narrowed to the shaft's width.
  const sphere = (T, b) => {
    const enamel = (i) => (i % 2 ? M.VERDE : M.TILE);
    courses(b.y0, b.y1, course, (yy, h, k) => {
      const yc = yy + h / 2;
      const R = Math.sqrt(Math.max(0, b.r * b.r - (yc - b.y) * (yc - b.y)));
      const top = shaftR(T, yy) + SPHERE_WALL * 0.6;
      if (R <= top) {
        disc(T.x, T.z, yy, h, Math.max(R, shaftR(T, yy)) + 0.4, pitch, M.CONCRETE);
      } else {
        ring(T.x, T.z, yy, h, R, SPHERE_WALL, k, enamel(k));
        disc(T.x, T.z, yy, h, R - SPHERE_WALL - GAP, pitch, M.CONCRETE);
      }
    });
  };

  // ── The podium: a coarse footing course and one course of paving a man's
  // width, which is the floor the plaza's garrison stands on.
  B.section('podium', () => {
    const w = PODIUM.x1 - PODIUM.x0, d = PODIUM.z1 - PODIUM.z0;
    const cx = (PODIUM.x0 + PODIUM.x1) / 2, cz = (PODIUM.z0 + PODIUM.z1) / 2;
    const pave = 1.0;
    B.slab(cx, (PODIUM.h - pave) / 2, cz, w, PODIUM.h - pave, d, stone * 2.4, M.CONCRETE);
    const nx = Math.round(w / (stone * 1.3)), nz = Math.round(d / (stone * 1.3));
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        B.add(PODIUM.x0 + (i + 0.5) * w / nx, PODIUM.h - pave / 2, PODIUM.z0 + (k + 0.5) * d / nz,
          B.shrink(w / nx / 2), B.shrink(pave / 2), B.shrink(d / nz / 2), M.MARBLE);
      }
    }
  });

  for (const T of TOWERS) B.section(T.tag, () => shaft(T));
  B.section('spheres', () => {
    for (const T of TOWERS) for (const b of bandsOf(T)) sphere(T, b);
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. The towers have no floors a man can stand in — the spheres
 * are solid here — so the fight is on the plaza: riflemen and machine guns
 * behind sandbags round the towers' feet, anti-tank teams at the podium's
 * landward edge, mortars in the lee of the second tower, and snipers on the
 * tops of the two big spheres, a hundred metres up with the whole bay below
 * them.
 */
export function populateKuwait(g, origin, groundY) {
  const K = KUWAIT;
  const P = K.podium;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const floor = P.h + 0.3;
  // Round each big tower's foot, facing out.
  for (const T of K.towers.slice(0, 2)) {
    const n = T.spheres.length ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const r = T.r0 + 5.0;
      g.place(i % 3 === 0 ? 'mg' : 'rifleman', V(T.x + Math.cos(a) * r, floor, T.z + Math.sin(a) * r),
        Math.atan2(Math.cos(a), Math.sin(a)), 6, { cover: 'ground', sandbags: true });
    }
  }
  // The needle's foot: two riflemen.
  const N = K.towers[2];
  for (const sx of [-1, 1]) {
    g.place('rifleman', V(N.x + sx * (N.r0 + 4.0), floor, N.z + 3.0), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'ground', sandbags: true });
  }
  // Anti-tank teams along the podium's west and south edges, which face the land.
  for (let i = 0; i < 3; i++) {
    g.place('at', V(P.x0 + 3.0, floor, P.z0 + (i + 0.5) * (P.z1 - P.z0) / 3), -Math.PI / 2, 6, { cover: 'ground', sandbags: true });
  }
  for (let i = 0; i < 3; i++) {
    g.place('at', V(P.x0 + (i + 0.5) * (P.x1 - P.x0) / 3, floor, P.z1 - 3.0), 0, 6, { cover: 'ground', sandbags: true });
  }
  // Mortars between the towers, in the open.
  for (const [x, z] of [[12, 6], [12, 26], [26, 40]]) {
    g.place('mortar', V(x, floor, z), 0, 6, { cover: 'ground' });
  }
  // Snipers on the tops of the big spheres, either side of the shaft.
  for (const T of K.towers.slice(0, 2)) {
    const sp = T.spheres[0];
    for (const sx of [-1, 1]) {
      // One at the restaurant's window, one on the sphere's crown.
      g.place('sniper', V(T.x + sx * 5.5, sp.top + 0.3, T.z), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 8, { cover: sx > 0 ? 'window' : 'roof' });
    }
  }
}
