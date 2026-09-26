import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Wat Arun, Bangkok: the Temple of Dawn's great prang and its four satellites.
 *
 * Reference figures (Fine Arts Department of Thailand; the 2013–17
 * restoration survey):
 *   the central prang     about 70 m to the tip of the trident, on a base of
 *                         steep tiered terraces about 40 m square, the spire
 *                         itself a redented square drawn up to a point
 *   the satellites        four smaller prangs about 25 m tall at the corners
 *                         of the base, and four mondops — square pavilions
 *                         under spired roofs — at the cardinal points
 *   the stairs            two steep flights up each face of the terraces,
 *                         a rise of one for a run of two thirds
 *   the skin              white stucco set with broken Chinese porcelain in
 *                         bands of flowers round every tier
 *
 * Kind: a mountain. A prang is solid brick under its stucco and it does not
 * topple; it has to be quarried. The terraces round its foot are what the
 * player has to find out about: they are the widest, heaviest part of the
 * thing and they carry the spire, so an undercut low on one side takes that
 * side's terraces out from under the courses above, and the skin above the
 * cut sheds itself down the steps. The satellites and the mondops are the
 * finesse — small enough to be knocked down, scored with the rest.
 *
 * MARBLE for the white stucco, TILE for the porcelain bands, GILT for the
 * trident on the tip, which carries nothing.
 */

const S = 2.0;
const STONE_FINENESS = 0.85;

// Real metres, scaled once at the end.
// The central prang's profile, bottom to top: [top of the band, half-width].
// Vertical faces between terrace tops, then the body, then the spire's curve.
const TERRACES = [
  { top: 6.0, half: 20.0 },
  { top: 12.5, half: 16.0 },
  { top: 19.0, half: 12.5 },
];
const BODY = { top: 29.0, half: 9.2 };
const SPIRE = { top: 66.0, halfTop: 0.9, power: 0.78 };
const FINIAL = 4.5;
// Where the small ones stand, and how big they are relative to the great one.
const SATELLITES = { at: 26.0, k: 0.36 };                    // corners, scaled copies
const MONDOPS = { at: 25.0, w: 8.0, h: 9.0, roof: 7.0 };     // the cardinal points
const STAIRS = { w: 4.2, off: 7.5, runPerRise: 0.7 };

/** Half-width of the central prang at height y (real metres); NaN above the tip. */
function halfAt(y, k = 1) {
  const yy = y / k;
  for (const t of TERRACES) if (yy < t.top) return t.half * k;
  if (yy < BODY.top) return BODY.half * k;
  const t = (yy - BODY.top) / (SPIRE.top - BODY.top);
  if (t >= 1) return NaN;
  return (SPIRE.halfTop + (BODY.half - SPIRE.halfTop) * Math.pow(1 - t, SPIRE.power)) * k;
}

/** What the garrison, the flag and the level record read (world metres). */
export const WATARUN = {
  scale: S,
  terraces: TERRACES.map((t) => ({ top: t.top * S, half: t.half * S })),
  body: { top: BODY.top * S, half: BODY.half * S },
  height: (SPIRE.top + FINIAL) * S,
  satellites: { at: SATELLITES.at * S, top: (SPIRE.top + FINIAL) * SATELLITES.k * S,
    terraces: TERRACES.map((t) => ({ top: t.top * SATELLITES.k * S, half: t.half * SATELLITES.k * S })) },
  mondops: { at: MONDOPS.at * S, w: MONDOPS.w * S, h: MONDOPS.h * S, top: (MONDOPS.h + MONDOPS.roof) * S },
  galleries: TERRACES.map((t) => t.top * S),
  flag: { x: 0, y: (TERRACES[2].top + 0.6) * S, z: TERRACES[2].half * S - 2.5 },
};

export function buildWatarun(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.1 * s;
  const course = 0.9 * s;
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  /**
   * One solid course of a prang: a coarse core filling the inside exactly,
   * and a ring of fine stone round it that is the stuccoed face. Both in the
   * same course, so every stone above has stone under it however the face
   * steps; a casing ring that steps in lands on the core below it, which is
   * what a solid tower is.
   *
   * The core's grid changes count every course. The load pass hands a
   * stone's weight to whatever it overlaps below in equal shares, so two
   * courses cut to the same grid are columns that never share sideways —
   * and where the spire narrows to a point above them, everything it weighs
   * funnels down the centre column and crushes the stone at the bottom of
   * it. A grid of five over a grid of six over a grid of five is a running
   * bond in three dimensions, and the spire's weight spreads out through it
   * the way it does through real brick.
   */
  const lastN = new Map();
  const solid = (cx, cz, y, h, half, mat) => {
    const w = half * 2;
    const key = `${cx},${cz}`;
    const prev = lastN.get(key) ?? 0;
    if (w <= stone * 2.2) {
      const n = w > stone * 1.3 ? (prev === 2 ? 1 : 2) : 1;
      lastN.set(key, n);
      B.slab(cx, y + h / 2, cz, w, h, w, w / n, mat);
      return;
    }
    const wall = Math.min(stone * 1.1, half * 0.45);
    const coreW = w - 2 * wall;
    let n = Math.max(1, Math.round(coreW / (stone * 1.5)));
    if (n === prev) n = n > 2 ? n - 1 : n + 1;
    lastN.set(key, n);
    B.slab(cx, y + h / 2, cz, coreW, h, coreW, coreW / n, mat);
    B.ring(cx, cz, w, w, wall, y, h, stone, mat, prev % 2 ? 0.5 : 0);
  };
  /** The porcelain bands: a course of TILE under every terrace top and at intervals up the spire. */
  const skin = (y, k) => {
    const yy = y / k;
    for (const t of TERRACES) if (Math.abs(yy - (t.top - 0.8)) < 0.6) return M.TILE;
    if (yy > BODY.top && Math.round((yy - BODY.top) / 3.6) % 2 === 1 && ((yy - BODY.top) % 3.6) < 1.2) return M.TILE;
    return M.MARBLE;
  };

  /** A prang, the great one at k = 1 and the satellites at their fraction of it. */
  const prang = (cx, cz, k, y0, y1) => {
    courses(y0, y1, course, (y, h) => {
      const half = halfAt(y + h / 2, k);
      if (!(half > 0.3)) return;
      solid(cx, cz, y, h, half, skin(y + h / 2, k));
    });
  };
  const trident = (cx, cz, k) => {
    // The trident on the tip: leaf over iron, carrying nothing.
    B.pinnacle(cx, cz, SPIRE.top * k, FINIAL * k, Math.max(1.0, SPIRE.halfTop * 2 * k), stone * 0.7, M.GILT);
  };
  const SPLIT = TERRACES[2].top;

  // ── The great prang: the terraces and their stairs, then the spire.
  B.section('terraces', () => {
    prang(0, 0, 1, 0, SPLIT);
    // Two flights up each face, either side of the mondop, to the top of the
    // terraces: masonry ramps whose courses shorten as they rise, each stone
    // on the stone below, leaning on the face they climb.
    const H = SPLIT;
    const run = H * STAIRS.runPerRise;
    for (const face of [0, 1, 2, 3]) {
      const ax = face % 2 === 0 ? 0 : (face === 1 ? 1 : -1);
      const az = face % 2 === 0 ? (face === 0 ? 1 : -1) : 0;
      for (const side of [-1, 1]) {
        const ox = -az * side * STAIRS.off, oz = ax * side * STAIRS.off;
        courses(0, H, course, (y, h) => {
          const yc = y + h / 2;
          const inner = halfAt(Math.min(yc, H - 0.01));
          const outer = TERRACES[0].half + run * (1 - yc / H);
          const len = outer - inner;
          if (len < stone * 0.6) return;
          const mid = (inner + outer) / 2;
          const px = ax * mid + ox, pz = az * mid + oz;
          B.add(px, yc, pz, ax ? len / 2 : STAIRS.w / 2, h / 2 - B.joint, az ? len / 2 : STAIRS.w / 2, M.MARBLE);
        });
      }
    }
  });
  B.section('core', () => {
    prang(0, 0, 1, SPLIT, SPIRE.top);
    trident(0, 0, 1);
  });

  // ── The satellites at the corners.
  B.section('satellites', () => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        prang(sx * SATELLITES.at, sz * SATELLITES.at, SATELLITES.k, 0, SPIRE.top * SATELLITES.k);
        trident(sx * SATELLITES.at, sz * SATELLITES.at, SATELLITES.k);
      }
    }
  });

  // ── The mondops at the cardinal points: an open square pavilion — four
  // corner piers and a doorway in every face — under a spired roof of
  // courses stepping in to a point.
  B.section('mondops', () => {
    const { w, h, roof } = MONDOPS;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = ax * MONDOPS.at, cz = az * MONDOPS.at;
      const door = (x, y, z) => y < h - 1.2 && (Math.abs(x - cx) < w / 2 - 2.2 || Math.abs(z - cz) < w / 2 - 2.2);
      B.openings(door, () => {
        courses(0, h, course, (y, ch, c) => {
          B.ring(cx, cz, w, w, 1.2, y, ch, stone, M.MARBLE, c % 2 ? 0.5 : 0);
        });
      });
      // The eave course is one plate on the four piers, and the roof steps in on it.
      B.slab(cx, h + course * 0.5, cz, w + 1.6, course, w + 1.6, stone * 1.6, M.TILE);
      const n = Math.max(3, Math.round(roof / course));
      const ch = roof / n;
      for (let i = 0; i < n; i++) {
        const ww = (w + 1.6) * (1 - (i + 0.5) / n) + 0.8;
        B.slab(cx, h + course + (i + 0.5) * ch, cz, ww, ch, ww, stone, i % 3 === 2 ? M.TILE : M.MARBLE);
      }
      B.pinnacle(cx, cz, h + course + roof, 2.4, 1.0, stone * 0.6, M.GILT);
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen and machine guns on the walks of the first two
 * terraces, facing out over the river and the town; snipers on the third,
 * under the body of the spire; anti-tank teams at the feet of the four
 * satellite prangs; mortars on the mondop roofs, which are the only flat
 * places on the map nothing is over.
 */
export function populateWatarun(g, origin, groundY) {
  const K = WATARUN;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const walk = (t, i, n, type) => {
    // Along each face of a terrace's top, inside the edge, clear of the stairs.
    const T = K.terraces[t];
    const inset = 1.6;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = (i - (n - 1) / 2) * ((T.half * 2 - 2 * inset - 4) / n);
      if (Math.abs(Math.abs(a) - STAIRS.off * S) < STAIRS.w * S * 0.6) continue;   // a stair comes up here
      const x = ax * (T.half - inset) - az * a, z = az * (T.half - inset) + ax * a;
      g.place(type, V(x, T.top + 0.4, z), Math.atan2(ax, az), 7, { cover: 'roof' });
    }
  };
  for (let i = 0; i < 3; i++) walk(0, i, 3, i === 1 ? 'mg' : 'rifleman');
  for (let i = 0; i < 2; i++) walk(1, i, 2, 'rifleman');
  walk(2, 0, 1, 'sniper');
  // Anti-tank teams at the corners, on the first terrace of each satellite.
  const sat = K.satellites;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = sat.terraces[0];
      g.place('at', V(sx * (sat.at + t.half - 1.2), t.top + 0.4, sz * (sat.at + t.half - 1.2)), Math.atan2(sx, sz), 7, { cover: 'roof' });
    }
  }
  // Mortars on the mondops' eave plates.
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.place('mortar', V(ax * (K.mondops.at + K.mondops.w * 0.4), K.mondops.h + 1.2 * S, az * (K.mondops.at + K.mondops.w * 0.4)),
      Math.atan2(ax, az), 8, { cover: 'roof' });
  }
}
