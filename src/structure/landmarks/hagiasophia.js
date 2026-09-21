import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Hagia Sophia, built from its real dimensions.
 *
 * Reference figures (Mainstone, "Hagia Sophia"; Van Nice's survey):
 *   plan                    ~82 × 73 m over the buttresses; nave 32.6 × 76 m
 *   dome                    31.2 m across, springing ~40 m, crown 55.6 m, 40 windows
 *   great piers             four, ~7.5 × 5 m, at the corners of the central square
 *   half-domes              east and west, the same radius as the dome, from ~30 m
 *   buttress piers          north and south, four, ~35 m high
 *   minarets                four, about 60 m
 *
 * Structurally a shell held from outside. The dome is a shallow cap on a
 * windowed drum, the drum stands on a square block of arch and pendentive
 * over the four great piers, and the thrust of all that runs east and west
 * into the half-domes and north and south into the buttress piers leaning
 * in against the tympanum walls. It does not topple, and the level does not
 * expect it to. It breaks: open a buttress or take the head off a half-dome
 * and the square under the drum loses the bracing on that side, the wall
 * there spreads, and what is on it comes down in a sheet.
 *
 * The four great arches are not laid as arches. The solver holds a stone up
 * by what is underneath it, and near the crown of a thirty-metre arch each
 * voussoir stands beside the next and not on it — the Taj's iwans found that
 * out. So the arch is a wall with a round-headed opening in it that the wall
 * spans, which is what the solver can hold and what the eye reads as an arch
 * from inside.
 *
 * Brick for the walls and vaults, as the real building is; limestone for the
 * piers and buttresses; lead-grey slate for the domes, which are what a shell
 * looks like from the guns.
 */

const S = 1.6;
const STONE_FINENESS = 0.66;

// Real metres, scaled once at the end. The nave axis runs along x.
const SQ = 31.2;                 // the central square, pier axis to pier axis
const PIER_W = 7.5, PIER_D = 5.2;
const PIER_H = 26.0;             // to the springing of the great arches
const BLOCK_TOP = 34.0;          // the top of the arch-and-pendentive block
const DRUM_TOP = 40.5;           // the dome springs here
const DOME_R = 15.6, DOME_RISE = 15.4;
const HALF_R = 15.6, HALF_Y0 = 26.0;         // the half-domes spring here
const OUTER_X = 76.0 / 2, OUTER_Z = 70.0 / 2; // the outer walls
const OUTER_H = 21.0;
const GALLERY_Z = SQ / 2 + 8.5;   // the aisle's inner wall, which carries the galleries
const BUTTRESS = { x: 9.5, z: OUTER_Z + 3.0, w: 8.0, d: 10.0, h: 36.0 };
const MINARET = { r: 2.0, h: 62.0, at: [[OUTER_X + 2, OUTER_Z + 2], [-OUTER_X - 2, OUTER_Z + 2], [OUTER_X + 2, -OUTER_Z - 2], [-OUTER_X - 2, -OUTER_Z - 2]] };

/** The finished building's dimensions, in world metres, for the garrison. */
export const SOPHIA = {
  scale: S,
  sq: SQ * S, pierW: PIER_W * S, pierD: PIER_D * S, pierH: PIER_H * S,
  blockTop: BLOCK_TOP * S, drumTop: DRUM_TOP * S, domeR: DOME_R * S, crown: (DRUM_TOP + DOME_RISE) * S,
  outerX: OUTER_X * S, outerZ: OUTER_Z * S, outerH: OUTER_H * S,
  galleryZ: GALLERY_Z * S,
  buttress: { x: BUTTRESS.x * S, z: BUTTRESS.z * S, w: BUTTRESS.w * S, d: BUTTRESS.d * S, h: BUTTRESS.h * S },
  minaret: { r: MINARET.r * S, h: MINARET.h * S, at: MINARET.at.map(([x, z]) => [x * S, z * S]) },
  // The flag flies from the top of the drum, on the south side.
  flag: { x: 0, y: DRUM_TOP * S + 0.4, z: (DOME_R - 1.0) * S },
};

export function buildHagiaSophia(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;                     // a 3 cm joint in the world, not 3 cm times the scale
  const s = quality.blockScale * STONE_FINENESS;
  // Coarser than the Taj's grain: a building this size at its grain is
  // twenty-four thousand stones on a phone, and thirteen at this one.
  const stone = 1.6 * s;
  const course = 1.25 * s;

  // Equal courses, never a sliver under a slab: a remainder course a few
  // centimetres tall puts its joint on the solver's contact tolerance.
  const courses = (y0, y1, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / course));
    const h = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * h, h, c);
  };

  // ── The raft.
  B.section('base', () => {
    B.slab(0, -0.9, 0, OUTER_X * 2 + 10, 1.8, OUTER_Z * 2 + 10, stone * 3.0, M.CONCRETE);
  });

  // ── The outer walls: the aisles and galleries, with two tiers of windows,
  // and the inner gallery walls, with a corbelled lean-to roof between them.
  B.section('nave', () => {
    const win = (x, y, z) => {
      const onZ = Math.abs(z) > OUTER_Z - 2.0, onX = Math.abs(x) > OUTER_X - 2.0;
      if (!onZ && !onX) return false;
      const along = onZ ? x : z;
      const a = Math.abs(((along + 1000) % 6.0) - 3.0);
      if (a > 1.2) return false;
      for (const [y0, y1] of [[3.0, 8.5], [12.0, 18.0]]) {
        if (y > y0 && y < y1) return y < y1 - 1.2 || a < 1.2 * Math.sqrt(Math.max(0, 1 - ((y - (y1 - 1.2)) / 1.2) ** 2));
      }
      return false;
    };
    B.openings(win, () => {
      courses(0, OUTER_H, (y, h, c) => {
        B.ring(0, 0, OUTER_X * 2, OUTER_Z * 2, 1.8, y, h, stone, M.BRICK, c % 2,
          () => (y + h / 2 > OUTER_H - course * 1.1 ? 0.25 : 0));
      });
    });
    // The gallery walls, north and south of the nave, up to the springing.
    courses(0, HALF_Y0, (y, h, c) => {
      for (const sg of [-1, 1]) {
        B.slab(0, y + h / 2, sg * GALLERY_Z, SQ + 2 * PIER_W, h, 2.0, stone, M.BRICK);
      }
    });
    // Lean-to roofs from the outer wall up to the gallery wall, corbelled.
    const run = OUTER_Z - 0.9 - (GALLERY_Z + 1.0);
    const steps = Math.max(4, Math.round(run / (stone * 0.9)));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const z = OUTER_Z - 0.9 - run * t;
      const y = OUTER_H + 0.25 + i * 0.5;
      for (const sg of [-1, 1]) B.slab(0, y, sg * z, OUTER_X * 2 - 3.6, 0.5, run / steps + 0.5, stone * 1.4, M.SLATE);
    }
    // And over the east and west aisles, from the end walls in to the half-domes.
    for (const sg of [-1, 1]) {
      const x0 = sg * (OUTER_X - 0.9), x1 = sg * (SQ / 2 + PIER_W / 2 + HALF_R * 0.2);
      const n = Math.max(4, Math.round(Math.abs(x1 - x0) / (stone * 0.9)));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * t;
        B.slab(x, OUTER_H + 0.25 + i * 0.5, 0, Math.abs(x1 - x0) / n + 0.5, 0.5, GALLERY_Z * 2 - 2.0, stone * 1.4, M.SLATE);
      }
    }
  });

  // ── The four great piers.
  B.section('piers', () => {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cx = sx * SQ / 2, cz = sz * SQ / 2;
      courses(0, PIER_H, (y, h) => {
        B.slab(cx, y + h / 2, cz, PIER_W, h, PIER_D, stone * 1.6, M.LIMESTONE);
      });
    }
  });

  // ── The arch-and-pendentive block: a square of wall on the piers, its
  // east and west faces opened by the great arches the half-domes abut, its
  // north and south faces the tympanum walls with their rows of windows.
  B.section('arches', () => {
    const half = SQ / 2 + PIER_W / 2;
    const opening = (x, y, z) => {
      const onX = Math.abs(x) > half - PIER_W - 0.1;
      const onZ = Math.abs(z) > half - PIER_W - 0.1;
      if (onX && !onZ) {
        // The great arch: a round-headed void the wall spans.
        const span = SQ / 2 - PIER_D - 1.6;
        const a = Math.abs(z);
        if (a > span) return false;
        return y < PIER_H + Math.sqrt(Math.max(0, span * span - a * a)) * 0.75;
      }
      if (onZ && !onX) {
        // Tympanum windows: two rows.
        const a = Math.abs(((Math.abs(x) + 1000) % 4.4) - 2.2);
        return a < 0.9 && ((y > PIER_H + 0.8 && y < PIER_H + 3.6) || (y > PIER_H + 4.6 && y < PIER_H + 7.2));
      }
      return false;
    };
    B.openings(opening, () => {
      courses(PIER_H, BLOCK_TOP, (y, h, c) => {
        B.ring(0, 0, half * 2, half * 2, PIER_W, y, h, stone, M.BRICK, c % 2);
      });
    });
    // The pendentive zone closes the square to the drum's circle: a course
    // or two of ring that fills the corners.
    courses(BLOCK_TOP, BLOCK_TOP + course * 2, (y, h, c) => {
      B.ring(0, 0, half * 2, half * 2, PIER_W + 1.0, y, h, stone, M.BRICK, c % 2);
    });
  });

  // ── The drum, with its forty windows, and the dome on it.
  B.section('dome', () => {
    const y0 = BLOCK_TOP + course * 2;
    const win = (x, y, z) => {
      if (y < y0 + 1.0 || y > DRUM_TOP - 0.8) return false;
      const a = Math.atan2(z, x);
      const k = ((a + Math.PI * 4) % (Math.PI * 2 / 40)) - Math.PI / 40;
      return Math.abs(k) < Math.PI / 40 * 0.5;
    };
    B.openings(win, () => {
      courses(y0, DRUM_TOP, (y, h, c) => {
        const sides = Math.max(24, Math.round((2 * Math.PI * DOME_R) / stone));
        B.polyRing(0, 0, BlockList.circle(DOME_R, sides, (c % 2) * Math.PI / sides), 2.6, y, h, stone, M.BRICK, 0,
          () => (y + h / 2 > DRUM_TOP - course * 1.1 ? 0.3 : 0));
      });
    });
    // Near enough a hemisphere: the real dome's rise is within a metre of
    // its radius. `dome` closes the crown with a slab once the ring is tight.
    B.dome(0, 0, DRUM_TOP, DOME_RISE, DOME_R, 2.2, course, stone, M.SLATE,
      (t) => Math.sqrt(Math.max(0, 1 - t * t)));
    B.pinnacle(0, 0, DRUM_TOP + DOME_RISE, 3.0, 1.6, stone, M.GILT);
  });

  // ── The half-domes, east and west, leaning against the block. Half rings
  // stepping in course by course, each stone on the one below, with the
  // exedrae as two small quarter-domes under each.
  const halfDome = (cx, sx, y0, R, rise, wall, mat) => {
    // Half rings stepping in, each on the one below. A quarter-sphere's rings
    // step in faster than a wall is thick near the crown, so the step is
    // capped at four fifths of the wall and the top closes as a solid half
    // disc — a little pointed, which is how a brick half-dome of this size
    // was built anyway.
    const n = Math.max(6, Math.round(rise / course));
    let prev = R;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const y = y0 + (i + 0.5) * (rise / n);
      let r = R * Math.sqrt(Math.max(0.0, 1 - t * t));
      r = Math.max(r, prev - wall * 0.8);
      prev = r;
      if (r <= wall * 1.2) {
        // Solid half disc.
        const w = Math.max(r * 2, stone);
        const k = Math.max(1, Math.round(w / stone));
        for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
          const lx = (a + 0.5) * (w / k) - w / 2, lz = (b + 0.5) * (w / k) - w / 2;
          if (lx * sx < -0.01 || Math.hypot(lx, lz) > r + 0.3) continue;
          B.add(cx + lx, y, lz, (w / k) / 2 - 0.02, rise / n / 2 - 0.01, (w / k) / 2 - 0.02, mat);
        }
        continue;
      }
      const segs = Math.max(6, Math.round((Math.PI * r) / stone));
      for (let j = 0; j < segs; j++) {
        const a = -Math.PI / 2 + (Math.PI * (j + 0.5)) / segs;
        const px = cx + sx * Math.cos(a) * r, pz = Math.sin(a) * r;
        B.add(px, y, pz, wall / 2, rise / n / 2 - 0.01, (Math.PI * r) / segs / 2 - 0.02, mat, Math.atan2(sx * Math.cos(a), Math.sin(a)) + Math.PI / 2);
      }
    }
  };
  B.section('halfdomes', () => {
    for (const sx of [-1, 1]) {
      const cx = sx * (SQ / 2 + PIER_W / 2 - 0.4);
      // The wall under the half-dome: a half drum from the ground up to the springing.
      courses(0, HALF_Y0, (y, h) => {
        const r = HALF_R;
        const segs = Math.max(8, Math.round((Math.PI * r) / stone));
        for (let j = 0; j < segs; j++) {
          const a = -Math.PI / 2 + (Math.PI * (j + 0.5)) / segs;
          // Doors and windows in the half drum: every third stone of the lower
          // courses and a band at gallery height.
          const open = (y < 6 && j % 3 === 1) || (y > 14 && y < 19 && j % 2 === 0);
          if (open) continue;
          B.add(cx + sx * Math.cos(a) * r, y + h / 2, Math.sin(a) * r, 1.1, h / 2 - 0.01, (Math.PI * r) / segs / 2 - 0.02, M.BRICK,
            Math.atan2(sx * Math.cos(a), Math.sin(a)) + Math.PI / 2);
        }
      });
      halfDome(cx, sx, HALF_Y0, HALF_R, HALF_R * 0.9, 2.0, M.SLATE);
    }
  });

  // ── The buttress piers, north and south: four great masses of limestone
  // against the tympanum walls, with a lean-to top.
  B.section('buttresses', () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * BUTTRESS.x, cz = sz * (SQ / 2 + PIER_W / 2 + BUTTRESS.d / 2 - 0.5);
      courses(0, BUTTRESS.h, (y, h) => {
        const t = y / BUTTRESS.h;
        const d = BUTTRESS.d * (1 - t * 0.35);
        B.slab(cx, y + h / 2, cz + sz * (BUTTRESS.d - d) / 2 * -1, BUTTRESS.w, h, d, stone * 2.0, M.LIMESTONE);
      });
    }
  });

  // ── The minarets.
  B.section('minarets', () => {
    for (const [mx, mz] of MINARET.at) {
      B.drum(mx, mz, 0, MINARET.h, MINARET.r, MINARET.r * 0.5, course * 1.3, stone * 0.9, M.LIMESTONE);
      // Two balconies, as rings standing proud.
      for (const by of [MINARET.h * 0.55, MINARET.h * 0.8]) {
        B.polyRing(mx, mz, BlockList.circle(MINARET.r + 0.5, 12), 0.9, by, course * 0.7, stone * 0.9, M.LIMESTONE, 0);
      }
      B.pinnacle(mx, mz, MINARET.h, 7.0, MINARET.r * 2.2, stone * 0.9, M.SLATE);
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen at the upper windows of the outer walls, machine
 * guns at the tympanum windows, snipers on the minaret balconies, anti-tank
 * teams in the ground-floor doorways of the half-drums, and mortars on the
 * aisle roofs between the buttresses, where the sky is open.
 */
export function populateHagiaSophia(g, origin, groundY) {
  const H = SOPHIA;
  // Upper windows of the outer walls.
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -H.outerX * 0.8 + (H.outerX * 1.6) * i / (n - 1);
    for (const sz of [-1, 1]) {
      g.place('rifleman', new THREE.Vector3(origin.x + x, groundY + 15.0 * S, origin.z + sz * (H.outerZ - 1.8 * S - 0.6)), sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
    }
  }
  for (const z of [-H.outerZ * 0.5, 0, H.outerZ * 0.5]) {
    for (const sx of [-1, 1]) {
      g.place('rifleman', new THREE.Vector3(origin.x + sx * (H.outerX - 1.8 * S - 0.6), groundY + 15.0 * S, origin.z + z), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'window' });
    }
  }
  // Machine guns at the tympanum windows, over the aisle roofs.
  for (const sz of [-1, 1]) {
    for (const x of [-6.6 * S, 6.6 * S]) {
      g.place('mg', new THREE.Vector3(origin.x + x, groundY + H.pierH + 1.4 * S, origin.z + sz * (H.sq / 2 + H.pierW / 2 - 0.6)), sz > 0 ? 0 : Math.PI, 7, { cover: 'window' });
    }
  }
  // Snipers on the minaret balconies.
  for (const [mx, mz] of H.minaret.at) {
    g.place('sniper', new THREE.Vector3(origin.x + mx + Math.sign(mx) * (H.minaret.r + 0.3), groundY + H.minaret.h * 0.8 + 1.0, origin.z + mz), Math.atan2(Math.sign(mx), Math.sign(mz)), 5, { cover: 'roof' });
  }
  // Anti-tank teams in the half-drum doorways, east and west.
  for (const sx of [-1, 1]) {
    for (const z of [-6 * S, 6 * S]) {
      g.place('at', new THREE.Vector3(origin.x + sx * (H.sq / 2 + H.pierW / 2 + H.domeR * 0.85), groundY + 0.6, origin.z + z), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 7, { cover: 'arcade' });
    }
  }
  // Mortars on the aisle roofs, between the buttresses.
  for (const [x, sz] of [[0, 1], [0, -1], [-H.buttress.x * 2.2, 1]]) {
    g.place('mortar', new THREE.Vector3(origin.x + x, groundY + H.outerH + 1.6, origin.z + sz * (H.outerZ - 6.0)), 0, 8, { cover: 'roof' });
  }
}
