import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Angkor Wat: the temple-mountain inside its galleries, from the western
 * causeway to the five towers.
 *
 * Reference figures (EFEO plans; APSARA National Authority; the survey has
 * the three enclosures at 234 × 209, 142 × 126 and 83 × 77 with their
 * gopuras):
 *   outer gallery (third enclosure)   215 × 187 m, an open colonnade facing
 *                                      outward under a corbelled vault, on
 *                                      a low terrace, with gopuras at the
 *                                      corners and the middle of each side
 *   second gallery                     115 × 100 m on a terrace about 6.5 m
 *                                      up, towers at its four corners
 *   the bakan                          the inner enclosure, 60 × 60 m on a
 *                                      three-tiered pyramid 13 m high, its
 *                                      gallery joining the four corner towers
 *   the towers                         the quincunx: the central tower 65 m
 *                                      over the ground, the corners about 55,
 *                                      lotus-bud spires on square cells
 *   the causeway                       350 m west to the moat, 9.5 m wide
 *
 * Kind: a temple-mountain — a shell standing on a mountain. The terraces
 * and the pyramid are solid and are quarried, not toppled; the galleries
 * are colonnades, lintels over pillars, and come down a bay at a time; the
 * five towers are the contract, and each one stands on a corner pier of the
 * bakan or on its core. The twist is that the towers are solid and heavy and
 * the pier under each is the only thing holding it up: cut the bakan's
 * corner and the tower on it goes down the pyramid's steps.
 *
 * The stone budget says the galleries are coarse and the towers fine.
 * LIMESTONE for the grey sandstone (its colour is close enough under the
 * canopy), RUBBLE for the laterite fill inside every terrace.
 */

const S = 1.3;
const STONE_FINENESS = 1.0;

// Real metres, scaled once at the end. +x is east; the temple faces west.
const OUTER = { cx: -10.0, w: 215.0, d: 187.0, depth: 6.0, h: 5.5, plinth: 1.2 };
const SECOND = { cx: -16.0, w: 115.0, d: 100.0, depth: 5.0, h: 5.0, terrace: 6.5 };
const BAKAN = { w: 75.0, top: 60.0, h: 13.0, tiers: 3, gallery: { depth: 4.0, h: 4.2 } };
const TOWER = { base: 12.0, cell: 10.0, central: 42.0, corner: 33.0, at: 24.0 };
const CAUSEWAY = { len: 100.0, w: 9.5, h: 1.6 };
const GOPURA = { w: 14.0, d: 10.0, h: 13.0 };
const LIBRARY = { w: 17.0, d: 13.0, h: 6.0, at: { x: -60.0, z: 28.0 } };
const WALL = 1.2;

const GROUND_BAKAN = SECOND.terrace + BAKAN.h;

/** Half-width of a tower's lotus-bud spire, t of the way up. */
const budHalf = (t) => (TOWER.base / 2) * (Math.pow(1 - t, 0.55) * (1 + 0.12 * Math.sin(Math.PI * t))) + 0.4 * t;

/** What the garrison, the flag and the level record read (world metres). */
export const ANGKOR = {
  scale: S,
  outer: { cx: OUTER.cx * S, w: OUTER.w * S, d: OUTER.d * S, depth: OUTER.depth * S, h: (OUTER.plinth + OUTER.h) * S, plinth: OUTER.plinth * S },
  second: { cx: SECOND.cx * S, w: SECOND.w * S, d: SECOND.d * S, depth: SECOND.depth * S, terrace: SECOND.terrace * S, roof: (SECOND.terrace + SECOND.h + 2.4) * S },
  bakan: { top: GROUND_BAKAN * S, w: BAKAN.top * S, galleryRoof: (GROUND_BAKAN + BAKAN.gallery.h + 1.8) * S },
  towers: { at: TOWER.at * S, base: TOWER.base * S, cell: TOWER.cell * S,
    centralTop: (GROUND_BAKAN + TOWER.central) * S, cornerTop: (GROUND_BAKAN + TOWER.corner) * S },
  galleries: [(OUTER.plinth + OUTER.h) * S, (SECOND.terrace + SECOND.h) * S, GROUND_BAKAN * S],
  flag: { x: 0, y: (GROUND_BAKAN + TOWER.central + 0.6) * S, z: 0 },
};

export function buildAngkor(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.4 * s;                       // the towers' stone
  const course = 1.0 * s;
  const coarse = stone * 2.0;                  // the galleries'
  const fill = stone * 2.6;                    // the terraces' laterite
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  /**
   * A solid course: a skin of dressed stone on the face and a core of fill
   * inside it, in one course, the core's grid changing count every course so
   * two courses never stack into columns that cannot share load sideways.
   */
  const lastN = new Map();
  const solid = (cx, cz, y, h, w, d, skinMat, coreMat, coreStone, skinStone = coarse) => {
    const key = `${cx.toFixed(1)},${cz.toFixed(1)}`;
    const prev = lastN.get(key) ?? 0;
    if (Math.min(w, d) <= skinStone * 2.2) {
      const n = prev === 1 ? 2 : 1;
      lastN.set(key, n);
      B.slab(cx, y + h / 2, cz, w, h, d, Math.min(w, d) / n, skinMat);
      return;
    }
    const wall = Math.min(skinStone * 0.9, Math.min(w, d) * 0.3);
    const cw = w - 2 * wall, cd = d - 2 * wall;
    let n = Math.max(1, Math.round(Math.min(cw, cd) / coreStone));
    if (n === prev) n = n > 2 ? n - 1 : n + 1;
    lastN.set(key, n);
    B.slab(cx, y + h / 2, cz, cw, h, cd, Math.min(cw, cd) / n, coreMat);
    B.ring(cx, cz, w, d, wall, y, h, skinStone, skinMat, prev % 2 ? 0.5 : 0);
  };

  /**
   * A gallery: the wall on one side, a row of pillars on the other, a lintel
   * course over the pillars, and a corbelled vault stepping in from both
   * sides to a ridge — which is what a Khmer gallery is, and the only roof
   * that carries itself here. `open` says which side the pillars are on.
   */
  const gallery = (cx, cz, w, d, depth, y0, h, open, tag) => {
    const hw = w / 2, hd = d / 2;
    const bay = 3.4, pier = 1.2;
    const outerRing = open === 'out';
    // The pillars: one ring with everything between them left out below the lintel.
    const pillars = (x, y, z) => {
      if (y - y0 > h - course * 1.05) return false;
      const ring = outerRing ? { hw, hd } : { hw: hw - depth, hd: hd - depth };
      const onZ = Math.abs(z - cz) > ring.hd - WALL - 0.3, onX = Math.abs(x - cx) > ring.hw - WALL - 0.3;
      const along = onZ ? x - cx : z - cz, half = onZ ? ring.hw : ring.hd;
      if (Math.abs(along) > half - 2.6) return false;
      const k = ((Math.abs(along) + bay / 2) % bay);
      return k > pier / 2 && k < bay - pier / 2;
    };
    courses(y0, y0 + h, course, (y, ch, c) => {
      const solidRing = outerRing ? [hw - depth, hd - depth] : [hw, hd];
      const openRing = outerRing ? [hw, hd] : [hw - depth, hd - depth];
      B.ring(cx, cz, solidRing[0] * 2, solidRing[1] * 2, WALL, y, ch, coarse, M.LIMESTONE, c % 2 ? 0.5 : 0);
      B.openings(pillars, () => {
        B.ring(cx, cz, openRing[0] * 2, openRing[1] * 2, WALL, y, ch, coarse, M.LIMESTONE, c % 2 ? 0 : 0.5);
      });
    });
    // The vault: a course spanning wall to pillars, then two stepping in
    // from both edges toward the ridge over the middle of the gallery.
    const ry = y0 + h;
    const inner = depth - WALL, ov = 0.5;
    B.ring(cx, cz, w + 2 * ov, d + 2 * ov, depth + 2 * ov, ry, course, coarse, M.LIMESTONE, 0);
    B.ring(cx, cz, w - 2 * WALL, d - 2 * WALL, depth - 2 * WALL, ry + course, course, coarse, M.LIMESTONE, 1);
    const mid = depth / 2;
    B.ring(cx, cz, w - 2 * mid + inner * 0.5, d - 2 * mid + inner * 0.5, inner * 0.5, ry + 2 * course, course, coarse, M.LIMESTONE, 0);
  };

  /** A tower: a square cell with a doorway in each face, and the lotus bud over it, solid. */
  const tower = (cx, cz, y0, top) => {
    const b = TOWER.base;
    const doors = (x, y, z) => y - y0 < 4.0 && y - y0 > 0
      && (Math.abs(x - cx) < 1.3 || Math.abs(z - cz) < 1.3);
    B.openings(doors, () => {
      courses(y0, y0 + TOWER.cell, course, (y, ch) => {
        solid(cx, cz, y, ch, b, b, M.LIMESTONE, M.LIMESTONE, stone * 1.6, stone);
      });
    });
    const y1 = y0 + TOWER.cell;
    courses(y1, top, course, (y, ch) => {
      const t = (y + ch / 2 - y1) / (top - y1);
      const half = budHalf(t);
      if (half < 0.4) return;
      solid(cx, cz, y, ch, half * 2, half * 2, M.LIMESTONE, M.LIMESTONE, stone * 1.6, stone);
    });
  };

  /** A gopura or a library: a small hall with a doorway through it and a stepped roof. */
  const pavilion = (cx, cz, w, d, y0, h, roofH) => {
    const door = (x, y, z) => y - y0 < h * 0.55 && Math.abs(z - cz) < 1.4 && Math.abs(x - cx) > w / 2 - WALL - 1.0;
    B.openings(door, () => {
      courses(y0, y0 + h, course, (y, ch, c) => {
        B.ring(cx, cz, w, d, WALL, y, ch, coarse, M.LIMESTONE, c % 2 ? 0.5 : 0);
      });
    });
    const n = Math.max(3, Math.round(roofH / course));
    const ch = roofH / n;
    for (let i = 0; i < n; i++) {
      const k = 1 - (i + 0.5) / (n + 1);
      B.slab(cx, y0 + h + (i + 0.5) * ch, cz, w * k + 1.0, ch, d * k + 1.0, coarse, M.LIMESTONE);
    }
  };

  // ── The outer gallery on its plinth, with its gopuras.
  B.section('outer', () => {
    const O = OUTER;
    const ring = (y, ch, extra) => {
      B.ring(O.cx, 0, O.w + extra, O.d + extra, O.depth + extra, y, ch, fill, M.LIMESTONE, 0);
    };
    courses(0, O.plinth, course * 1.2, (y, ch) => ring(y, ch, 2.0));
    gallery(O.cx, 0, O.w, O.d, O.depth, O.plinth, O.h, 'out', 'outer');
    // Gopuras: the corners, and the middle of each side; the west one is the entrance.
    const hw = O.w / 2, hd = O.d / 2;
    for (const [gx, gz, big] of [[-hw, 0, true], [hw, 0, false], [0, -hd, false], [0, hd, false],
      [-hw, -hd, false], [-hw, hd, false], [hw, -hd, false], [hw, hd, false]]) {
      const k = big ? 1.5 : 1.0;
      pavilion(O.cx + gx, gz, GOPURA.w * k, GOPURA.d * k + O.depth, 0, GOPURA.h * (big ? 0.9 : 0.75), GOPURA.h * 0.6 * k);
    }
  });

  // ── The second enclosure: a terrace of laterite in a sandstone skin, the
  // gallery on it, a tower at each corner, and the two libraries below it.
  B.section('inner', () => {
    const T = SECOND;
    courses(0, T.terrace, course * 1.3, (y, ch) => {
      solid(T.cx, 0, y, ch, T.w + 2 * WALL, T.d + 2 * WALL, M.LIMESTONE, M.RUBBLE, fill, coarse);
    });
    gallery(T.cx, 0, T.w, T.d, T.depth, T.terrace, T.h, 'in', 'inner');
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = T.cx + sx * (T.w / 2 - T.depth / 2), cz = sz * (T.d / 2 - T.depth / 2);
        courses(T.terrace, T.terrace + T.h + 3 * course, course, (y, ch) => {
          solid(cx, cz, y, ch, T.depth + 2.0, T.depth + 2.0, M.LIMESTONE, M.LIMESTONE, stone * 1.6, stone);
        });
        const y1 = T.terrace + T.h + 3 * course;
        courses(y1, y1 + 9.0, course, (y, ch) => {
          const t = (y + ch / 2 - y1) / 9.0;
          const half = (T.depth / 2 + 1.0) * Math.pow(1 - t, 0.6) + 0.3;
          solid(cx, cz, y, ch, half * 2, half * 2, M.LIMESTONE, M.LIMESTONE, stone * 1.6, stone);
        });
      }
    }
    for (const sz of [-1, 1]) {
      pavilion(LIBRARY.at.x, sz * LIBRARY.at.z, LIBRARY.w, LIBRARY.d, 0, LIBRARY.h, 3.0);
    }
  });

  // ── The bakan: three steep tiers of fill in a skin, the gallery round its
  // top, and the piers the towers stand on.
  B.section('bakan', () => {
    const tierH = BAKAN.h / BAKAN.tiers;
    for (let t = 0; t < BAKAN.tiers; t++) {
      const w = BAKAN.w - (BAKAN.w - BAKAN.top) * (t / BAKAN.tiers);
      const y0 = SECOND.terrace + t * tierH;
      courses(y0, y0 + tierH, course * 1.3, (y, ch) => {
        solid(0, 0, y, ch, w, w, M.LIMESTONE, M.RUBBLE, fill, coarse);
      });
    }
    const G = BAKAN.gallery;
    gallery(0, 0, BAKAN.top, BAKAN.top, G.depth, GROUND_BAKAN, G.h, 'in', 'bakan');
    // The cruciform core under the central tower: a pier from the bakan top.
    courses(GROUND_BAKAN, GROUND_BAKAN + 1.0, course, (y, ch) => {
      solid(0, 0, y, ch, TOWER.base + 6.0, TOWER.base + 6.0, M.LIMESTONE, M.LIMESTONE, stone * 1.6, stone);
    });
  });

  // ── The five towers.
  B.section('towers', () => {
    tower(0, 0, GROUND_BAKAN + 1.0, GROUND_BAKAN + TOWER.central);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        tower(sx * TOWER.at, sz * TOWER.at, GROUND_BAKAN + BAKAN.gallery.h + 3 * course, GROUND_BAKAN + TOWER.corner);
      }
    }
  });

  // ── The western causeway: a raised stone walk from the west gopura toward the moat.
  B.section('causeway', () => {
    const x1 = OUTER.cx - OUTER.w / 2 - GOPURA.d - 1.0;
    const x0 = x1 - CAUSEWAY.len;
    courses(0, CAUSEWAY.h, course, (y, ch, c) => {
      B.slab((x0 + x1) / 2, y + ch / 2, 0, CAUSEWAY.len, ch, CAUSEWAY.w + (c ? 0 : 1.0), fill, M.LIMESTONE);
    });
    for (const sz of [-1, 1]) {
      B.slab((x0 + x1) / 2, CAUSEWAY.h + 0.45, sz * (CAUSEWAY.w / 2 - 0.4), CAUSEWAY.len, 0.9, 0.7, coarse, M.LIMESTONE);
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen in the outer gallery's colonnade facing out, along
 * the west and south fronts; machine guns on the second gallery's corner
 * towers; anti-tank teams in the doorways of the four corner towers of the
 * bakan; snipers on the bakan gallery's vault; mortars on the second terrace
 * east of the bakan, in the lee of the pyramid.
 */
export function populateAngkor(g, origin, groundY) {
  const K = ANGKOR;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const O = K.outer;
  // The colonnade of the outer gallery, west and south fronts.
  for (let i = 0; i < 6; i++) {
    const z = (i - 2.5) * (O.d / 7);
    g.place(i % 3 === 1 ? 'mg' : 'rifleman', V(O.cx - O.w / 2 + 1.6, O.plinth + 0.3, z), -Math.PI / 2, 8, { cover: 'arcade' });
  }
  for (let i = 0; i < 6; i++) {
    const x = O.cx + (i - 2.5) * (O.w / 7);
    g.place(i % 3 === 1 ? 'mg' : 'rifleman', V(x, O.plinth + 0.3, O.d / 2 - 1.6), 0, 8, { cover: 'arcade' });
    if (i % 2) g.place('rifleman', V(x, O.plinth + 0.3, -(O.d / 2 - 1.6)), Math.PI, 8, { cover: 'arcade' });
  }
  // The second gallery: guns at the corner towers' feet, on the terrace edge.
  const T = K.second;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.place('mg', V(T.cx + sx * (T.w / 2 - T.depth - 1.5), T.terrace + 0.3, sz * (T.d / 2 - T.depth - 1.5)),
        Math.atan2(sx, sz), 8, { cover: 'roof' });
    }
  }
  // Anti-tank teams in the corner towers' west doorways on the bakan; snipers on its gallery vault.
  const W = K.towers;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.place('at', V(sx * W.at - W.base / 2 + 1.0 * S, K.bakan.top + K.bakan.galleryRoof * 0 + (BAKAN.gallery.h + 3) * S + 0.3, sz * W.at),
        -Math.PI / 2, 9, { cover: 'window' });
      g.place('sniper', V(sx * (K.bakan.w / 2 - 2.0), K.bakan.galleryRoof + 0.3, sz * (K.bakan.w / 2 - 12.0)),
        Math.atan2(sx, 0), 8, { cover: 'roof' });
    }
  }
  // Mortars dug in on the lawn between the second and outer enclosures, north
  // of the pyramid. A crew on a terrace has the terrace's own stone in the
  // muzzle's cell and the arc is refused before the bomb has left the pit;
  // on open ground every high arc clears the galleries.
  for (let i = 0; i < 4; i++) {
    g.place('mortar', V(SECOND.cx * S + (i - 1.5) * 16, 0.3, -(SECOND.d / 2 + 18) * S), 0, 9, { cover: 'roof', emplaced: true });
  }
}
