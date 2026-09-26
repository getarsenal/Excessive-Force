import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Neuschwanstein, over Hohenschwangau.
 *
 * Reference figures (Bayerische Schlösserverwaltung; the plan from the
 * survey, which has the castle's six buildings by name on a ridge the bake
 * cuts a hundred and seventy metres over the valley, level for about
 * 100 x 200 m):
 *   Palas           58 x 46 in the survey's box, five storeys, 45 m to the
 *                   ridge; at the west end of the courtyard on the rock's edge
 *   north tower     round, 65 m, at the Palas's north-east corner
 *   square tower    12 x 12, 45 m, on the north side of the courtyard
 *   Torbau          the red-brick gatehouse, 21 x 33, 22 m, at the east end
 *   Ritterhaus      the Knights' House, 26 x 16, along the north side
 *   Kemenate        the Bower, 26 x 16, along the south side
 *
 * A cantilever cluster on a ridge, and the Potala's rules for the ground
 * (§2b): no pad, every wall founded below the summit and carried up, coarse
 * and grey where it is in the rock, white where it shows. The ridge is
 * narrower than the castle, so the Palas stands on sixty metres of footing
 * down the west flank toward the Pöllat gorge, which is what the photographs
 * from the Marienbrücke are of.
 *
 * The twist is the two towers: slender shafts on the corners of a big block.
 * They go over the way they lean, and the Palas beside them is the
 * counterweight that does not.
 *
 * MARBLE for the white limestone, REDSTONE for the gatehouse's brick,
 * CONCRETE for the grey footing in the rock, SLATE roofs, GILT finials.
 */

// One and a half times life, as Edinburgh: the ridge is the survey's and the
// castle already overhangs it at this size.
const S = 1.5;
const STONE_FINENESS = 0.9;
const BATTER = 0.05;
const WALL = 1.8;
// The whole plan is shifted fifteen metres west of the survey's origin so the
// gatehouse stands on the ridge and the Palas hangs over the gorge, which is
// the arrangement the real ridge has.
const SHIFT = -15.0;

const wAt = (wTop, top, y) => wTop + 2 * BATTER * (top - y);

// Real metres, x east, z south, the courtyard's summit at y 0.
const BLOCKS = [
  { tag: 'palas', x0: -84, x1: -26, z0: 0, z1: 46, top: 30.0, found: -58, roof: 14.0, rows: [3.5, 9.0, 14.5, 20.0, 25.5], mat: 'MARBLE', cross: 2, turrets: true },
  { tag: 'squaretower', x0: -9, x1: 3, z0: -27, z1: -15, top: 38.0, found: -6, roof: 7.0, rows: [6, 14, 22, 30, 34], mat: 'MARBLE', tower: true },
  { tag: 'gatehouse', x0: 31, x1: 52, z0: -32, z1: 1, top: 16.0, found: -16, roof: 6.0, rows: [3.5, 9.0], mat: 'REDSTONE' },
  { tag: 'gatehouse', x0: 46, x1: 52, z0: -32, z1: -26, top: 21.0, found: -16, roof: 4.0, rows: [3.5, 9.0, 15.0], mat: 'REDSTONE', tower: true },
  { tag: 'gatehouse', x0: 46, x1: 52, z0: -5, z1: 1, top: 21.0, found: -16, roof: 4.0, rows: [3.5, 9.0, 15.0], mat: 'REDSTONE', tower: true },
  { tag: 'knightshouse', x0: -32, x1: -6, z0: -18, z1: -2, top: 15.0, found: -12, roof: 8.0, rows: [3.5, 9.0], mat: 'MARBLE' },
  { tag: 'bower', x0: -22, x1: 3, z0: 11, z1: 27, top: 13.0, found: -6, roof: 5.0, rows: [3.5, 8.5], mat: 'MARBLE' },
];
// The north tower: round, at the Palas's north-east corner.
const NORTH = { x: -29, z: -1, r: 4.6, top: 55.0, roof: 65.0, found: -14, rows: [10, 20, 30, 40, 48] };

const shifted = (b) => ({ ...b, x0: b.x0 + SHIFT, x1: b.x1 + SHIFT });

/** What the garrison, the flag and the level record read (world metres). */
export const NEUSCHWANSTEIN = {
  scale: S,
  blocks: BLOCKS.map(shifted).map((b) => ({ ...b, x0: b.x0 * S, x1: b.x1 * S, z0: b.z0 * S, z1: b.z1 * S, top: b.top * S, rows: b.rows.map((r) => r * S) })),
  north: { x: (NORTH.x + SHIFT) * S, z: NORTH.z * S, r: NORTH.r * S, top: NORTH.top * S, rows: NORTH.rows.map((r) => r * S) },
  wall: WALL * S,
  /** Rooflines a man can be posted on, low to high. */
  galleries: [16.0 * S, 30.0 * S, 38.0 * S, 55.0 * S],
  // The flag flies from the north tower's roof.
  flag: { x: (NORTH.x + SHIFT) * S, y: (NORTH.roof + 0.5) * S, z: NORTH.z * S },
};

export function buildNeuschwanstein(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.9 * s;
  const course = 1.3 * s;
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  /** Coarse in the rock, the face's own grain above the summit. */
  const grain = (y, found) => (y < found + 3.0 ? 3.2 : y < -1.0 ? 1.8 : 1.0);
  /** Grey footing under the summit, the building's own stone above it. */
  const skin = (y, mat) => (y < -1.0 ? M.CONCRETE : mat);

  /** Arched windows, a light per 4.5 m bay in each row, clear of the corners. */
  const windowsOf = (b) => (x, y, z) => {
    if (y < 1.0) return false;
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const ww = wAt(w, b.top, y), dd = wAt(d, b.top, y);
    const lx = x - cx, lz = z - cz;
    const onZ = Math.abs(lz) > dd / 2 - WALL - 0.2, onX = Math.abs(lx) > ww / 2 - WALL - 0.2;
    if (!onZ && !onX) return false;
    if (onZ && onX) return false;
    const along = onZ ? lx : lz, half = onZ ? w / 2 : d / 2;
    if (Math.abs(along) > half - 2.6) return false;
    const row = b.rows.find((r) => y > r && y < r + 2.4);
    if (row === undefined) return false;
    const a = Math.abs(((along + 1000) % 4.5) - 2.25);
    if (y < row + 1.6) return a < 0.7;
    const t = (y - (row + 1.6)) / 0.8;
    return a < 0.7 * Math.sqrt(Math.max(0, 1 - t * t));
  };

  /** A steep slate roof: rings stepping in as they rise, closing on a ridge. */
  const roof = (cx, cz, w, d, y0, maxH) => {
    const step = 0.7, rise = 1.0, thick = 2.2;
    const rc = Math.max(1.2, course * 0.7);
    let y = y0, ww = w + 0.6, dd = d + 0.6, c = 0;
    while (y < y0 + maxH - 0.01) {
      const short = Math.min(ww, dd);
      if (short <= thick * 2.6) {
        const along = ww >= dd;
        B.slab(cx, y + rc * 0.6, cz, along ? ww : short * 1.1, rc * 1.2, along ? short * 1.1 : dd, stone * 1.2, M.SLATE);
        return;
      }
      B.ring(cx, cz, ww, dd, thick, y, rc, stone * 1.3, M.SLATE, c % 2 ? 0.5 : 0);
      ww -= 2 * step * (rc / rise); dd -= 2 * step * (rc / rise);
      y += rc; c++;
    }
  };

  /** A building: battered ring walls from the rock to the wall-head, cross walls, floors, a roof. */
  const block = (b, omit = null) => {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const win = windowsOf(b);
    const mat = M[b.mat];
    B.openings((x, y, z) => win(x, y, z) || (omit ? omit(x, y, z) : false), () => {
      let y = b.found;
      while (y < b.top - 0.01) {
        const g = grain(y, b.found);
        const ch = Math.min(course * g, b.top - y);
        const h = (b.top - (y + ch) < course * 0.5) ? b.top - y : ch;
        const c = Math.round((y - b.found) / course);
        B.ring(cx, cz, wAt(w, b.top, y), wAt(d, b.top, y), WALL + (g > 1 ? 0.6 : 0), y, h, stone * g, skin(y, mat), c % 2 ? 0.5 : 0);
        if (y >= -1.0 && b.cross) {
          for (let k = 1; k <= b.cross; k++) {
            B.slab(b.x0 + (w * k) / (b.cross + 1), y + h / 2, cz, WALL, h, d - WALL * 2 - 0.1, stone, mat);
          }
        }
        for (const r of b.rows) {
          if (Math.abs(y - (r - 0.4)) < h * 0.5 && y > 0) {
            B.ring(cx, cz, w - WALL * 2 + 0.1, d - WALL * 2 + 0.1, Math.min(3.0, Math.min(w, d) / 2 - WALL - 0.4), y, h, stone * 1.3, mat, 0);
          }
        }
        y += h;
      }
    });
    if (b.tower) {
      B.slab(cx, b.top + course * 0.3, cz, w - WALL * 2 + 0.1, course * 0.6, d - WALL * 2 + 0.1, stone * 1.2, mat);
      roof(cx, cz, w - 0.8, d - 0.8, b.top + course * 0.6, b.roof);
      B.pinnacle(cx, cz, b.top + b.roof + course * 0.6, 2.0, 1.0, stone * 0.6, M.GILT);
    } else {
      roof(cx, cz, w, d, b.top, b.roof);
    }
    if (b.turrets) {
      // Slender corner turrets on the Palas, standing on its wall-head.
      for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const tx = cx + ex * (w / 2 - WALL * 0.7), tz = cz + ez * (d / 2 - WALL * 0.7);
        courses(b.top, b.top + 8.0, course, (y, h, c) => {
          B.polyRing(tx, tz, BlockList.circle(1.6, 8, (c % 2) * (Math.PI / 8)), 1.0, y, h, stone * 0.8, mat, 0);
        });
        B.spire(tx, tz, b.top + 8.0, b.top + 13.0, 3.6, 0.8, course * 0.8, stone * 0.7, M.SLATE, 0.6);
      }
    }
  };

  const towersOf = BLOCKS.map(shifted).filter((b) => b.tower);
  const inTower = (x, z) => towersOf.some((t) => x > t.x0 - 0.3 && x < t.x1 + 0.3 && z > t.z0 - 0.3 && z < t.z1 + 0.3)
    || Math.hypot(x - (NORTH.x + SHIFT), z - NORTH.z) < NORTH.r + 0.3;
  for (const b of BLOCKS.map(shifted)) {
    B.section(b.tag, () => block(b, b.tower ? null : (x, _y, z) => inTower(x, z)));
  }

  // ── The north tower: a round shaft on the Palas's corner, windows at every
  // storey, a floor at each, a conical roof and a gilt finial. Slender by
  // design: it is the thing on this ridge that goes over.
  B.section('northtower', () => {
    const cx = NORTH.x + SHIFT, cz = NORTH.z;
    const win = (x, y, z) => {
      if (y < 1.0) return false;
      const row = NORTH.rows.find((r) => y > r && y < r + 2.4);
      if (row === undefined) return false;
      const a = Math.atan2(z - cz, x - cx);
      const frac = ((a / (Math.PI / 2)) % 1 + 1) % 1;
      return Math.abs(frac - 0.5) < 0.09;
    };
    B.openings(win, () => {
      let y = NORTH.found;
      while (y < NORTH.top - 0.01) {
        const g = grain(y, NORTH.found);
        const ch = Math.min(course * g, NORTH.top - y);
        const h = (NORTH.top - (y + ch) < course * 0.5) ? NORTH.top - y : ch;
        const c = Math.round((y - NORTH.found) / course);
        const r = NORTH.r + BATTER * (NORTH.top - y);
        const sides = 12;
        B.polyRing(cx, cz, BlockList.circle(r, sides, (c % 2) * (Math.PI / sides)), 1.4 + (g > 1 ? 0.5 : 0), y, h, stone * g, skin(y, M.MARBLE), 0);
        // A floor a course under each window row, filling to the shaft.
        if (NORTH.rows.some((row) => Math.abs(y - (row - 0.4)) < h * 0.5)) {
          B.polyRing(cx, cz, BlockList.circle(r - 1.4 - 1.05, sides, (c % 2) * (Math.PI / sides)), 2.1, y, h, stone * 1.2, M.MARBLE, 0);
        }
        y += h;
      }
    });
    B.slab(cx, NORTH.top + course * 0.3, cz, NORTH.r * 1.3, course * 0.6, NORTH.r * 1.3, stone * 1.2, M.MARBLE);
    B.spire(cx, cz, NORTH.top + course * 0.6, NORTH.roof, NORTH.r * 2 + 1.0, 0.8, course * 0.8, stone * 0.8, M.SLATE, 0.55);
    B.pinnacle(cx, cz, NORTH.roof, 2.4, 1.0, stone * 0.6, M.GILT);
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen in the Palas's south and west windows over the
 * gorge, snipers at the tops of the two towers, machine guns in the Knights'
 * House and the Bower looking out from the courtyard's flanks, anti-tank
 * teams in the gatehouse over the approach, and a mortar section in the
 * courtyard.
 */
export function populateNeuschwanstein(g, origin, groundY) {
  const K = NEUSCHWANSTEIN;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const W = K.wall;
  const palas = K.blocks[0];
  // The Palas: the south face at the third and fourth storeys, the west end.
  for (const f of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    g.place(f === 0.45 ? 'mg' : 'rifleman', V(palas.x0 + (palas.x1 - palas.x0) * f, palas.rows[3] + 0.3, palas.z1 - W - 0.8), 0, 6, { cover: 'window' });
    g.place('rifleman', V(palas.x0 + (palas.x1 - palas.x0) * f, palas.rows[2] + 0.3, palas.z0 + W + 0.8), Math.PI, 6, { cover: 'window' });
  }
  for (const f of [0.3, 0.7]) {
    g.place('rifleman', V(palas.x0 + W + 0.8, palas.rows[3] + 0.3, palas.z0 + (palas.z1 - palas.z0) * f), -Math.PI / 2, 6, { cover: 'window' });
  }
  // The towers: snipers at the top storey.
  const sq = K.blocks[1];
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, -1]]) {
    g.place('sniper', V((sq.x0 + sq.x1) / 2 + nx * ((sq.x1 - sq.x0) / 2 - W - 0.8), sq.rows[4] + 0.3, (sq.z0 + sq.z1) / 2 + nz * ((sq.z1 - sq.z0) / 2 - W - 0.8)), Math.atan2(nx, nz), 6, { cover: 'window' });
  }
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    g.place('sniper', V(K.north.x + Math.cos(a) * (K.north.r - 1.4 * S - 0.7), K.north.rows[4] + 0.3, K.north.z + Math.sin(a) * (K.north.r - 1.4 * S - 0.7)), Math.atan2(Math.cos(a), Math.sin(a)), 6, { cover: 'window' });
  }
  // The Knights' House north face, the Bower south face.
  const kh = K.blocks[5], bw = K.blocks[6];
  for (const f of [0.25, 0.5, 0.75]) {
    g.place(f === 0.5 ? 'mg' : 'rifleman', V(kh.x0 + (kh.x1 - kh.x0) * f, kh.rows[1] + 0.3, kh.z0 + W + 0.8), Math.PI, 6, { cover: 'window' });
    g.place(f === 0.5 ? 'mg' : 'rifleman', V(bw.x0 + (bw.x1 - bw.x0) * f, bw.rows[1] + 0.3, bw.z1 - W - 0.8), 0, 6, { cover: 'roof' });
  }
  // The gatehouse: anti-tank teams over the approach from the east.
  const gate = K.blocks[2];
  for (const f of [0.3, 0.7]) {
    g.place('at', V(gate.x1 - W - 0.8, gate.rows[1] + 0.3, gate.z0 + (gate.z1 - gate.z0) * f), Math.PI / 2, 6, { cover: 'window' });
  }
  // Mortars in the courtyard.
  for (const [x, z] of [[0, -2], [12, 4], [-12, 4]]) {
    g.place('mortar', V((x + SHIFT) * S, 0.4, z * S), 0, 20, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
