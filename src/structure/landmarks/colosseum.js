import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Colosseum, Rome.
 *
 * Reference figures (Lancaster, "Concrete Vaulted Construction in Imperial
 * Rome"; the Parco archeologico del Colosseo; the Overture outline, which has
 * the ring at 188 × 142 m centred fourteen metres east of the origin with its
 * long axis fourteen degrees south of east):
 *   outer ring        189 × 156 m, 48 m to the top of the attic cornice
 *   three arcades     10.5, 11.9 and 11.6 m, eighty arches each, piers 2.4 m,
 *                     openings 4.4 m; then the attic, 13.7 m, with pilasters
 *                     and a small square window in every other bay
 *   inner ring        the wall of the inner ambulatory, about 14 m inside the
 *                     outer face, standing to some 38 m where the outer is gone
 *   arena             87 × 55 m; the hypogeum's walls are what shows in it
 *   what stands       two fifths of the outer ring, on the north side; the
 *                     rest was quarried for the Renaissance
 *
 * Kind: a shell, a ring. Nothing here topples as a whole; it is broken bay by
 * bay. The twist is that the outer wall is eighty piers carrying three storeys
 * of arches with nothing behind them where the cavea has gone: kick two
 * adjacent ground-tier piers out and the bays above them have nothing under
 * them and come down outward. Where the cavea survives, radial walls tie the
 * outer ring to the inner, and the same shot brings down less. The garrison
 * lives in the arches, which is what they were built as: eighty ways in.
 *
 * Travertine for the outer ring (LIMESTONE is its colour), brick for the inner
 * ring, and the cavea a stepped mass of rubble fill.
 */

const S = 1.5;
const STONE_FINENESS = 1.0;

// Real metres, scaled once at the end.
const A = 94.5, BZ = 78.0;                 // outer semi-axes
const YAW = (14.2 * Math.PI) / 180;        // the long axis, from +x toward +z (south of east)
const BAYS = 80;
const PIER = 2.4;                          // pier width along the ring
const WALL = 2.7;                          // the outer ring's thickness
const TIERS = [10.5, 11.9, 11.6];          // the three arcades
const ATTIC = 13.7;
const TOP = TIERS[0] + TIERS[1] + TIERS[2] + ATTIC;   // 47.7
const ENTAB = 1.7;                         // the entablature band at the head of each tier
const INNER_OFF = 14.0;                    // the inner ring, this far inside the outer face
const INNER_WALL = 2.4;
const INNER_TOP = 38.0;
const ARENA = { a: 43.5, b: 27.5 };
const PODIUM = 4.5;                        // the arena wall, and the first seat
const STEPS = 12;                          // seating rings from the podium to the inner ring
const STAND_BAYS = 32;                     // two fifths of eighty

// ── The ellipse, by arc length. Bays are equal lengths of the outer face,
// and the openings in the inner ring stand on the same radial lines.
const N_TAB = 4096;
const arcTable = (() => {
  const s = new Float64Array(N_TAB + 1);
  let acc = 0, px = A, pz = 0;
  for (let i = 1; i <= N_TAB; i++) {
    const t = (i / N_TAB) * Math.PI * 2;
    const x = A * Math.cos(t), z = BZ * Math.sin(t);
    acc += Math.hypot(x - px, z - pz);
    px = x; pz = z; s[i] = acc;
  }
  return s;
})();
const PERIM = arcTable[N_TAB];
const BAY = PERIM / BAYS;
/** Arc length along the outer ellipse at parametric angle t. */
const sAt = (t) => {
  const u = ((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const f = (u / (Math.PI * 2)) * N_TAB;
  const i = Math.min(N_TAB - 1, Math.floor(f));
  return arcTable[i] + (arcTable[i + 1] - arcTable[i]) * (f - i);
};
/** Parametric angle at arc length s. */
const tAt = (s) => {
  const u = ((s % PERIM) + PERIM) % PERIM;
  let lo = 0, hi = N_TAB;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arcTable[m] <= u) lo = m; else hi = m; }
  const f = lo + (u - arcTable[lo]) / Math.max(1e-9, arcTable[hi] - arcTable[lo]);
  return (f / N_TAB) * Math.PI * 2;
};
/** A point on the ellipse (a, b) at parametric angle t, in the building's own frame. */
const onEllipse = (a, b, t) => [a * Math.cos(t), b * Math.sin(t)];
/** Into the world: yaw the building's frame. */
const toWorld = (x, z) => [x * Math.cos(YAW) - z * Math.sin(YAW), x * Math.sin(YAW) + z * Math.cos(YAW)];
const fromWorld = (x, z) => [x * Math.cos(YAW) + z * Math.sin(YAW), -x * Math.sin(YAW) + z * Math.cos(YAW)];
/** Parametric angle of a world point, read against ellipse (a, b). */
const tOf = (x, z, a, b) => { const [u, v] = fromWorld(x, z); return Math.atan2(v / b, u / a); };

// The standing arc: the bays whose middle faces nearest north, sixteen each
// side. North is -z in the world.
const northT = (() => {
  const [u, v] = fromWorld(0, -1);
  return Math.atan2(v / BZ, u / A);
})();
const BAY0 = ((Math.round(sAt(northT) / BAY - STAND_BAYS / 2) % BAYS) + BAYS) % BAYS;   // first standing bay
const bayStands = (k) => { const m = (((k - BAY0) % BAYS) + BAYS) % BAYS; return m < STAND_BAYS; };

/** Outward-facing yaw for a man standing on ring (a, b) at parametric t. */
const facingAt = (a, b, t) => {
  const nx = Math.cos(t) / a, nz = Math.sin(t) / b;
  const [fx, fz] = toWorld(nx, nz);
  return Math.atan2(fx, fz);
};

/** What the garrison, the flag and the level record read. */
export const COLOSSEUM = {
  scale: S,
  a: A * S, b: BZ * S, yaw: YAW,
  wall: WALL * S,
  tiers: TIERS.map((h) => h * S),
  tierBase: [0, TIERS[0] * S, (TIERS[0] + TIERS[1]) * S, (TIERS[0] + TIERS[1] + TIERS[2]) * S],
  top: TOP * S,
  innerA: (A - INNER_OFF) * S, innerB: (BZ - INNER_OFF) * S, innerTop: INNER_TOP * S, innerWall: INNER_WALL * S,
  arena: { a: ARENA.a * S, b: ARENA.b * S },
  podium: PODIUM * S,
  /** Top of the seating at `inset` world metres inside the inner ring's face. */
  seatTop(inset) {
    const stepW = (A - INNER_OFF - ARENA.a - 1.2) / STEPS;
    const k = Math.max(0, Math.min(STEPS - 1, Math.floor(STEPS - (inset / S - 1.2) / stepW)));
    return (PODIUM + 2.1 * (k + 1)) * S;
  },
  bays: BAYS, bay0: BAY0, standBays: STAND_BAYS,
  /** World position (already scaled) in the middle of bay k on a ring of semi-axes (a, b), pulled in by `inset`. */
  bayPoint(k, a, b, inset = 0) {
    const t = tAt((k + 0.5) * BAY);
    const [x, z] = onEllipse(a - inset, b - inset, t);
    const [wx, wz] = toWorld(x, z);
    return { x: wx, z: wz, t, facing: facingAt(a, b, t) };
  },
  bayStands,
  /** Rooflines a man can be posted on, low to high. */
  galleries: [TIERS[0] * S, (TIERS[0] + TIERS[1]) * S, TOP * S],
  flag: (() => {
    const t = tAt((BAY0 + STAND_BAYS / 2) * BAY);
    const [x, z] = onEllipse(A - WALL / 2, BZ - WALL / 2, t);
    const [wx, wz] = toWorld(x, z);
    return { x: wx * S, y: (TOP + 0.6) * S, z: wz * S };
  })(),
};

export function buildColosseum(quality) {
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
   * One course along an arc of ellipse (a, b) — the ring's *outer* face —
   * from parametric t0 to t1, laid as yawed stones of `wall` thickness inside
   * that face, spaced by arc length. `relief(x, z, y)` stands a stone proud
   * of the face. Open, unlike `polyRing`: the standing part of the outer ring
   * is an arc, and a closed loop would put a chord across the arena.
   */
  const arcCourse = (a, b, t0, t1, wall, y, h, mat, phase, relief) => {
    const s0 = sAt(t0), s1raw = sAt(t1);
    const s1 = s1raw > s0 + 1e-6 ? s1raw : s1raw + PERIM;
    const len = s1 - s0;
    // Stones are sized off the wall's centre line, which is shorter than the outer face.
    const shrinkK = 1 - wall / (2 * Math.min(a, b));
    const n = Math.max(1, Math.round((len * shrinkK) / stone));
    const seg = len / n;
    for (let k = 0; k < n; k++) {
      const sm = s0 + (k + 0.5 + (phase ? 0.5 : 0)) * seg;
      if (sm > s1 - seg * 0.25) continue;
      const t = tAt(sm);
      let nx = Math.cos(t) / a, nz = Math.sin(t) / b;
      const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
      const [fx, fz] = onEllipse(a, b, t);
      const e = relief ? Math.max(0, relief(fx, fz, y + h / 2, t)) : 0;
      const cx = fx - nx * (wall / 2) + nx * (e / 2), cz = fz - nz * (wall / 2) + nz * (e / 2);
      const [wx, wz] = toWorld(cx, cz);
      // The stone's local +z runs along the course, +x through the wall.
      const [wtx, wtz] = toWorld(-nz, nx);
      const ry = Math.atan2(wtx, wtz);
      B.add(wx, y + h / 2, wz, B.shrink(wall / 2) + e / 2, B.shrink(h / 2), B.shrink((seg * shrinkK) / 2), mat, ry);
    }
  };

  // Position along the outer face relative to the middle of the nearest bay,
  // for any world point on ring (a, b); the inner ring reads the same lines.
  const bayPos = (x, z, a, b) => {
    const t = tOf(x, z, a, b);
    const sOuter = sAt(t);
    const k = Math.floor(sOuter / BAY);
    const d = sOuter - (k + 0.5) * BAY;
    const ratio = (a + b) / (A + BZ);
    return { k, d: d * ratio, bayLen: BAY * ratio };
  };

  /**
   * The arcade openings of one tier: a round-headed opening in every bay,
   * springing at `spring` above the tier's base, `openW` wide. Masonry never
   * laid — the arch over it is the ring's own stones, standing proud.
   */
  const arcadeOpening = (a, b, y0, spring, openW, standingOnly) => (x, y, z) => {
    const p = bayPos(x, z, a, b);
    if (standingOnly && !bayStands(p.k)) return false;
    const half = Math.min(openW / 2, p.bayLen / 2 - PIER / 2);
    if (Math.abs(p.d) >= half) return false;
    if (y < y0 + 0.01) return false;
    if (y <= y0 + spring) return true;
    const dy = y - (y0 + spring);
    return p.d * p.d + dy * dy < half * half;
  };

  // Relief for the outer ring: half-columns on the piers of the arcades, the
  // entablature at the head of each tier, pilasters and the crowning cornice
  // on the attic, and an archivolt round each arch.
  const OPEN_W = 4.4;
  const outerRelief = (x, z, y) => {
    const p = bayPos(x, z, A, BZ);
    let tierBase = 0, tier = 3;
    for (let i = 0; i < 3; i++) { if (y < tierBase + TIERS[i]) { tier = i; break; } tierBase += TIERS[i]; }
    if (tier < 3) {
      const top = tierBase + TIERS[tier];
      if (y > top - ENTAB) return 0.55;                              // entablature
      if (Math.abs(p.d) > p.bayLen / 2 - PIER * 0.55) return 0.45;   // the half-column on the pier
      const spring = TIERS[tier] * 0.42;
      const half = OPEN_W / 2;
      const r = Math.hypot(p.d, Math.max(0, y - (tierBase + spring)));
      if (r < half + 0.9 && r >= half - 0.2) return 0.22;            // archivolt
      return 0;
    }
    if (y > TOP - 1.5) return 0.7;                                   // cornice
    if (Math.abs(p.d) > p.bayLen / 2 - PIER * 0.5) return 0.3;       // pilasters
    if (y > TOP - ATTIC + 5.0 && y < TOP - ATTIC + 5.6) return 0.2;  // a string course
    return 0;
  };

  // ── The outer ring: the standing arc, three arcades and the attic.
  const t0 = tAt(BAY0 * BAY), t1 = tAt((BAY0 + STAND_BAYS) * BAY);
  const atticWindow = (x, y, z) => {
    const p = bayPos(x, z, A, BZ);
    if (((p.k % 2) + 2) % 2 !== 0) return false;
    const wy0 = TOP - ATTIC + 5.6, wy1 = wy0 + 2.4;
    return Math.abs(p.d) < 1.2 && y > wy0 && y < wy1;
  };
  B.section('outer', () => {
    let base = 0;
    TIERS.forEach((th) => {
      const spring = th * 0.42;
      B.openings(arcadeOpening(A, BZ, base, spring, OPEN_W, true), () => {
        courses(base, base + th, course, (y, h, c) => {
          arcCourse(A, BZ, t0, t1, WALL, y, h, M.LIMESTONE, c % 2, outerRelief);
        });
      });
      base += th;
    });
    B.openings(atticWindow, () => {
      courses(base, TOP, course, (y, h, c) => {
        arcCourse(A, BZ, t0, t1, WALL, y, h, M.LIMESTONE, c % 2, outerRelief);
      });
    });
    // The brick buttresses at the broken ends: wedges of brick against the
    // end piers, stepping down and out, as Stern and Valadier left them.
    for (const [t, dir] of [[t0, -1], [t1, 1]]) {
      const [fx, fz] = onEllipse(A - WALL / 2, BZ - WALL / 2, t);
      let nx = Math.cos(t) / A, nz = Math.sin(t) / BZ;
      const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
      const tx = -nz * dir, tz = nx * dir;             // along the ring, away from the standing arc
      const H = TIERS[0] + TIERS[1] + TIERS[2];
      const [wtx, wtz] = toWorld(tx, tz);
      const ry = Math.atan2(wtx, wtz);
      courses(0, H, course, (y, h) => {
        const reach = 6.0 * (1 - y / H);               // the wedge's length at this height
        if (reach < stone * 0.6) return;
        const n = Math.max(1, Math.round(reach / stone));
        const seg = reach / n;
        for (let k = 0; k < n; k++) {
          const d = (k + 0.5) * seg;
          const [wx, wz] = toWorld(fx + tx * d, fz + tz * d);
          B.add(wx, y + h / 2, wz, B.shrink(WALL / 2), B.shrink(h / 2), B.shrink(seg / 2), M.BRICK, ry);
        }
      });
    }
  });

  // ── The inner ring: the wall of the inner ambulatory, all the way round,
  // two arcades and a plain wall above, in brick.
  const IA = A - INNER_OFF, IB = BZ - INNER_OFF;
  const innerRelief = (x, z, y) => {
    let tierBase = 0;
    for (let i = 0; i < 2; i++) {
      if (y < tierBase + TIERS[i]) return y > tierBase + TIERS[i] - ENTAB * 0.7 ? 0.35 : 0;
      tierBase += TIERS[i];
    }
    return y > INNER_TOP - 1.0 ? 0.35 : 0;
  };
  const FULL = Math.PI * 2 - 1e-6;
  B.section('inner', () => {
    let base = 0;
    for (let i = 0; i < 2; i++) {
      const th = TIERS[i];
      // Travertine survives on the ground tier of the inner ring; above it
      // the brick-faced concrete of the ambulatory wall shows.
      const mat = i === 0 ? M.LIMESTONE : M.BRICK;
      B.openings(arcadeOpening(IA, IB, base, th * 0.42, 4.0, false), () => {
        courses(base, base + th, course, (y, h, c) => {
          arcCourse(IA, IB, 0, FULL, INNER_WALL, y, h, mat, c % 2, innerRelief);
        });
      });
      base += th;
    }
    const wy0 = base + 4.0, wy1 = base + 7.0;
    const innerWindow = (x, y, z) => {
      const p = bayPos(x, z, IA, IB);
      return Math.abs(p.d) < 1.0 && y > wy0 && y < wy1;
    };
    B.openings(innerWindow, () => {
      courses(base, INNER_TOP, course, (y, h, c) => {
        arcCourse(IA, IB, 0, FULL, INNER_WALL, y, h, M.BRICK, c % 2, innerRelief);
      });
    });
  });

  // ── The cavea: where the outer ring stands, radial walls tie it to the
  // inner ring under what was the upper seating; everywhere, the seating
  // steps down from the inner ring to the podium as a solid mass of fill.
  B.section('cavea', () => {
    const H = TIERS[0] + TIERS[1] + TIERS[2];
    for (let k = BAY0; k <= BAY0 + STAND_BAYS; k += 4) {
      const t = tAt(k * BAY);
      const [ox, oz] = onEllipse(A - WALL + 0.6, BZ - WALL + 0.6, t);
      const [ix, iz] = onEllipse(IA - 0.6, IB - 0.6, t);
      const dx = ox - ix, dz = oz - iz, len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      const [wux, wuz] = toWorld(ux, uz);
      const ry = Math.atan2(wux, wuz);
      courses(0, H, course, (y, h, c) => {
        const n = Math.max(1, Math.round(len / stone));
        const seg = len / n;
        for (let i = 0; i < n; i++) {
          const d = (i + 0.5 + (c % 2 ? 0.5 : 0)) * seg;
          if (d > len) continue;
          const [wx, wz] = toWorld(ix + ux * d, iz + uz * d);
          B.add(wx, y + h / 2, wz, B.shrink(0.75), B.shrink(h / 2), B.shrink(seg / 2),
            y < TIERS[0] ? M.LIMESTONE : M.BRICK, ry);
        }
      });
    }
    // The seating: rings of fill, each one step further out and one step
    // taller than the last, at a fixed coarse grain — it is fill, not ashlar,
    // and it is the same size on a phone as on a workstation.
    const fill = 4.0, step = 2.1;
    const stepW = (IA - ARENA.a - 1.2) / STEPS;
    for (let k = 0; k < STEPS; k++) {
      const a = ARENA.a + stepW * (k + 0.5), b = ARENA.b + stepW * (k + 0.5);
      const top = PODIUM + step * (k + 1);
      const sides = Math.max(24, Math.round((2 * Math.PI * Math.sqrt((a * a + b * b) / 2)) / fill));
      courses(0, top, step, (y, h, c) => {
        const pts = [];
        for (let i = 0; i < sides; i++) {
          const t = ((i + (c % 2) * 0.5) / sides) * Math.PI * 2;
          const [x, z] = onEllipse(a, b, t);
          pts.push(toWorld(x, z));
        }
        B.polyRing(0, 0, pts, stepW, y, h, fill, M.RUBBLE, 0);
      });
    }
  });

  // ── The hypogeum: the arena floor is gone and its cellars show — two long
  // walls down the axis and cross walls between them, in brick.
  B.section('hypogeum', () => {
    const H = PODIUM - 0.4;
    const wall = (x0, z0, x1, z1) => {
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      const [wux, wuz] = toWorld(ux, uz);
      const ry = Math.atan2(wux, wuz);
      courses(0, H, course, (y, h) => {
        const n = Math.max(1, Math.round(len / stone));
        const seg = len / n;
        for (let i = 0; i < n; i++) {
          const d = (i + 0.5) * seg;
          const [wx, wz] = toWorld(x0 + ux * d, z0 + uz * d);
          B.add(wx, y + h / 2, wz, B.shrink(0.6), B.shrink(h / 2), B.shrink(seg / 2), M.BRICK, ry);
        }
      });
    };
    for (const zz of [-9, 9]) wall(-ARENA.a + 6, zz, ARENA.a - 6, zz);
    for (let i = -3; i <= 3; i++) {
      const x = i * 11.5;
      const hz = ARENA.b * Math.sqrt(Math.max(0, 1 - (x / ARENA.a) ** 2)) - 3.5;
      wall(x, -hz, x, hz);
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison, in the arches. Anti-tank teams in the ground-tier arches of
 * the standing arc, riflemen in the second tier, machine guns in the third,
 * snipers along the top of the attic; mortars on the seating, where the
 * outer wall hides them from the guns.
 */
export function populateColosseum(g, origin, groundY) {
  const K = COLOSSEUM;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const inset = K.wall / 2;
  const k0 = K.bay0, n = K.standBays;
  // Ground tier: AT teams in every eighth arch.
  for (let i = 2; i < n - 1; i += 8) {
    const p = K.bayPoint(k0 + i, K.a, K.b, inset);
    g.place('at', V(p.x, K.tierBase[0] + 0.5, p.z), p.facing, 7, { cover: 'arcade' });
  }
  // Second tier: riflemen, every third arch.
  for (let i = 1; i < n - 1; i += 3) {
    const p = K.bayPoint(k0 + i, K.a, K.b, inset);
    g.place('rifleman', V(p.x, K.tierBase[1] + 0.5, p.z), p.facing, 7, { cover: 'arcade' });
  }
  // Third tier: machine guns, every fourth arch, offset from the riflemen.
  for (let i = 3; i < n - 1; i += 4) {
    const p = K.bayPoint(k0 + i, K.a, K.b, inset);
    g.place('mg', V(p.x, K.tierBase[2] + 0.5, p.z), p.facing, 7, { cover: 'arcade' });
  }
  // The attic top: snipers, every sixth bay.
  for (let i = 4; i < n - 2; i += 6) {
    const p = K.bayPoint(k0 + i, K.a, K.b, inset);
    g.place('sniper', V(p.x, K.top + 0.5, p.z), p.facing, 7, { cover: 'roof' });
  }
  // Mortars on the upper seating, under the standing arc.
  for (const i of [6, 16, 26]) {
    const inset = 10 * K.scale;
    const p = K.bayPoint(k0 + i, K.innerA, K.innerB, inset);
    g.place('mortar', V(p.x, K.seatTop(inset) + 0.5, p.z), p.facing, 9, { cover: 'ground' });
  }
}
