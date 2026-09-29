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

// In plan, a little over one and a half times life: the ridge is the
// survey's, two hundred metres of level top, and the castle fills it end to
// end at this size — any bigger and the gatehouse is off the east end and the
// Palas is standing on nothing over the gorge.
//
// Upward, two and a half times. Neuschwanstein is a height: slender towers
// and a sheer white wall over a drop, and at one and a half times it stood on
// its ridge in a landscape of real mountains like a model left on a hillside.
// Everything above the courtyard is stretched; everything below it — the
// footing in the rock — keeps the plan's scale, because the rock beside it is
// the real rock and does not stretch.
const S = 1.6;
const SV = 2.5;
const STONE_FINENESS = 0.9;
const BATTER = 0.05;
const WALL = 1.8;
// The whole plan is shifted fifteen metres west of the survey's origin so the
// gatehouse stands on the ridge and the Palas hangs over the gorge, which is
// the arrangement the real ridge has.
const SHIFT = -15.0;

// A breastwork, in unstretched metres: a metre high once it has been stretched.
const BREAST = 0.4;

const wAt = (wTop, top, y) => wTop + 2 * BATTER * (top - y);

// Real metres, x east, z south, the courtyard's summit at y 0.
const BLOCKS = [
  { tag: 'palas', x0: -84, x1: -26, z0: 0, z1: 46, top: 30.0, found: -58, roof: 14.0, rows: [3.5, 9.0, 14.5, 20.0, 25.5], mat: 'MARBLE', cross: 2, turrets: true },
  { tag: 'squaretower', x0: -9, x1: 3, z0: -27, z1: -15, top: 38.0, found: -6, roof: 7.0, rows: [6, 14, 22, 30, 34], mat: 'MARBLE', tower: true },
  { tag: 'gatehouse', x0: 31, x1: 52, z0: -32, z1: 1, top: 16.0, found: -16, roof: 6.0, rows: [3.5, 9.0], mat: 'REDSTONE' },
  { tag: 'gatehouse', x0: 46, x1: 52, z0: -32, z1: -26, top: 21.0, found: -16, roof: 4.0, rows: [3.5, 9.0, 15.0], mat: 'REDSTONE', tower: true, battlement: true },
  { tag: 'gatehouse', x0: 46, x1: 52, z0: -5, z1: 1, top: 21.0, found: -16, roof: 4.0, rows: [3.5, 9.0, 15.0], mat: 'REDSTONE', tower: true, battlement: true },
  { tag: 'knightshouse', x0: -32, x1: -6, z0: -18, z1: -2, top: 15.0, found: -12, roof: 8.0, rows: [3.5, 9.0], mat: 'MARBLE' },
  { tag: 'bower', x0: -22, x1: 3, z0: 11, z1: 27, top: 13.0, found: -6, roof: 5.0, rows: [3.5, 8.5], mat: 'MARBLE' },
];
// The north tower: round, at the Palas's north-east corner.
const NORTH = { x: -29, z: -1, r: 4.6, top: 55.0, roof: 65.0, found: -14, rows: [10, 20, 30, 40, 48] };

const shifted = (b) => ({ ...b, x0: b.x0 + SHIFT, x1: b.x1 + SHIFT });

/** What the garrison, the flag and the level record read (world metres). */
export const NEUSCHWANSTEIN = {
  scale: S,
  up: SV,
  blocks: BLOCKS.map(shifted).map((b) => ({ ...b, x0: b.x0 * S, x1: b.x1 * S, z0: b.z0 * S, z1: b.z1 * S, top: b.top * SV, rows: b.rows.map((r) => r * SV) })),
  north: { x: (NORTH.x + SHIFT) * S, z: NORTH.z * S, r: NORTH.r * S, top: NORTH.top * SV, rows: NORTH.rows.map((r) => r * SV) },
  wall: WALL * S,
  /** Rooflines a man can be posted on, low to high. */
  galleries: [16.0 * SV, 30.0 * SV, 38.0 * SV, 55.0 * SV],
  // The flag flies from the north tower's roof.
  flag: { x: (NORTH.x + SHIFT) * S, y: (NORTH.roof + 0.5) * SV, z: NORTH.z * S },
};

export function buildNeuschwanstein(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.9 * s;
  // Courses are laid thinner by the stretch, so they come out of it the height
  // a course should be rather than as standing slabs.
  const course = 1.3 * s * (S / SV);
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  /** Coarse in the rock, the face's own grain above the summit. */
  // Under the summit nothing is stretched, so the footing's courses are laid at
  // the unstretched height.
  const grain = (y, found) => (y < found + 3.0 ? 3.2 * SV / S : y < -1.0 ? 1.8 * SV / S : 1.0);
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
        // In a window row the stones are short, so that a window cut from them
        // is a window: cut from stones longer than it is wide, whether it was
        // there at all depended on where a joint happened to fall.
        const inRow = b.rows.some((r) => y + h / 2 > r && y + h / 2 < r + 2.4);
        B.ring(cx, cz, wAt(w, b.top, y), wAt(d, b.top, y), WALL + (g > 1 ? 0.6 : 0), y, h, inRow ? 0.9 : stone * g, skin(y, mat), c % 2 ? 0.5 : 0);
        if (y >= -1.0 && b.cross) {
          for (let k = 1; k <= b.cross; k++) {
            B.slab(b.x0 + (w * k) / (b.cross + 1), y + h / 2, cz, WALL, h, d - WALL * 2 - 0.1, stone, mat);
          }
        }
        y += h;
      }
      // A floor under each window row, its top on the row and its edge on
      // the wall at that height — the wall is battered, and a floor sized for
      // the wall-head stood a metre clear of it lower down.
      for (const r of b.rows) {
        if (r <= 0) continue;
        B.ring(cx, cz, wAt(w, b.top, r) - WALL * 2 + 0.1, wAt(d, b.top, r) - WALL * 2 + 0.1,
          Math.min(3.0, Math.min(w, d) / 2 - WALL - 0.4), r - 0.5, 0.5, stone * 1.3, mat, 0);
      }
    });
    if (b.battlement) {
      // The Torbau's corner towers are battlemented, not roofed: a flat top
      // over the walls and a breastwork round it, low enough after the
      // stretch that a man's eye is over it, merlons at the corners.
      B.slab(cx, b.top + 0.15, cz, w, 0.3, d, 99, mat);
      courses(b.top + 0.3, b.top + 0.3 + BREAST, BREAST, (y, h) => B.ring(cx, cz, w, d, 0.5, y, h, stone, mat, 0));
      for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        B.slab(cx + ex * (w / 2 - 0.5), b.top + 0.3 + BREAST + 0.2, cz + ez * (d / 2 - 0.5), 1.0, 0.4, 1.0, 99, mat);
      }
    } else if (b.tower) {
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
        const inRow = NORTH.rows.some((row) => y + h / 2 > row && y + h / 2 < row + 2.4);
        B.polyRing(cx, cz, BlockList.circle(r, sides, (c % 2) * (Math.PI / sides)), 1.4 + (g > 1 ? 0.5 : 0), y, h, inRow ? 0.8 : stone * g, skin(y, M.MARBLE), 0);
        y += h;
      }
      // A floor under each window row, out to the wall at that height.
      for (const row of NORTH.rows) {
        const r = NORTH.r + BATTER * (NORTH.top - row);
        B.polyRing(cx, cz, BlockList.circle(r - 0.7 - 1.05, 12, 0), 2.1, row - 0.5, 0.5, stone * 1.2, M.MARBLE, 0);
      }
    });
    B.slab(cx, NORTH.top + course * 0.3, cz, NORTH.r * 1.3, course * 0.6, NORTH.r * 1.3, stone * 1.2, M.MARBLE);
    B.spire(cx, cz, NORTH.top + course * 0.6, NORTH.roof, NORTH.r * 2 + 1.0, 0.8, course * 0.8, stone * 0.8, M.SLATE, 0.55);
    B.pinnacle(cx, cz, NORTH.roof, 2.4, 1.0, stone * 0.6, M.GILT);
  });

  stretch(B);
  return B;
}

/**
 * The scale, applied: S across, S down into the rock, SV up from the summit.
 * A stone that straddles the summit has its bottom and its top mapped
 * separately, so the courses stay stacked on each other.
 */
function stretch(B) {
  const up = (y) => (y > 0 ? y * SV : y * S);
  for (const b of B.blocks) {
    const y0 = up(b.y - b.hy), y1 = up(b.y + b.hy);
    b.x *= S; b.z *= S; b.hx *= S; b.hz *= S;
    b.y = (y0 + y1) / 2; b.hy = (y1 - y0) / 2;
  }
}

/**
 * The garrison. Riflemen at the Palas's windows over the gorge and the
 * valley, snipers at the top storeys of the two towers, machine guns at the
 * Knights' House and the Bower looking out from the courtyard's flanks,
 * anti-tank teams at the gatehouse over the approach, and mortars in the
 * courtyard. Every man is posted on a window the builder really cut, on the
 * floor under it, a pace inside the wall at that height: the walls are
 * battered, and a man posted a fixed distance in from the wall-head was
 * inside the masonry on every storey below the top one.
 */
export function populateNeuschwanstein(g, origin, groundY) {
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const blocks = BLOCKS.map(shifted);
  /**
   * A man at a window of block `i` on face `face` ('x0' west, 'x1' east,
   * 'z0' north, 'z1' south), `frac` of the way along it, at window row `row`.
   */
  const at = (type, i, face, frac, row, cover = 'window') => {
    const b = blocks[i];
    const r = b.rows[row];
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const onZ = face[0] === 'z';
    const half = onZ ? w / 2 : d / 2;
    // The window nearest the fraction asked for: they are every 4.5 m, at 1.25 past each multiple.
    let along = (frac - 0.5) * 2 * (half - 2.6);
    along = Math.round((along - 1.25) / 4.5) * 4.5 + 1.25;
    if (Math.abs(along) > half - 2.6) along -= Math.sign(along) * 4.5;
    // Not on a cross wall: the window beside it, toward the middle.
    if (onZ && b.cross) {
      for (let k = 1; k <= b.cross; k++) {
        const xw = b.x0 + (w * k) / (b.cross + 1) - cx;
        if (Math.abs(along - xw) < WALL / 2 + 0.8) along -= Math.sign(along || 1) * 4.5;
      }
    }
    // A pace inside the wall's inner face at chest height.
    const inner = (onZ ? wAt(d, b.top, r + 1.2) : wAt(w, b.top, r + 1.2)) / 2 - WALL - 0.6;
    const sign = face[1] === '1' ? 1 : -1;
    const x = onZ ? cx + along : cx + sign * inner;
    const z = onZ ? cz + sign * inner : cz + along;
    const facing = onZ ? (sign > 0 ? 0 : Math.PI) : (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.place(type, V(x * S, r * SV + 0.05, z * S), facing, 3, { cover });
  };
  // The Palas: the south face over the valley, the north face, the west end over the gorge.
  [0.1, 0.3, 0.5, 0.7, 0.9].forEach((f, k) => at(k === 2 ? 'mg' : 'rifleman', 0, 'z1', f, 3));
  [0.2, 0.5, 0.8].forEach((f) => at('rifleman', 0, 'z0', f, 2));
  [0.3, 0.7].forEach((f) => at('rifleman', 0, 'x0', f, 3));
  // The square tower's top storey, three faces.
  for (const face of ['x1', 'x0', 'z0']) at('sniper', 1, face, 0.5, 4);
  // The north tower's top storey: its windows are at the diagonals.
  const nx = NORTH.x + SHIFT, nz = NORTH.z;
  const row = NORTH.rows[4];
  const nr = NORTH.r + BATTER * (NORTH.top - row) - 0.7 - 0.9;
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4]) {
    g.place('sniper', V((nx + Math.cos(a) * nr) * S, row * SV + 0.05, (nz + Math.sin(a) * nr) * S), Math.atan2(Math.cos(a), Math.sin(a)), 3, { cover: 'window' });
  }
  // The Knights' House north face, the Bower south face.
  [0.25, 0.5, 0.75].forEach((f, k) => at(k === 1 ? 'mg' : 'rifleman', 5, 'z0', f, 1));
  [0.25, 0.5, 0.75].forEach((f, k) => at(k === 1 ? 'mg' : 'rifleman', 6, 'z1', f, 1));
  // The gatehouse: anti-tank teams over the approach from the east, and a
  // man on each of its battlemented corner towers.
  [0.3, 0.7].forEach((f) => at('at', 2, 'x1', f, 1));
  for (const i of [3, 4]) {
    const b = blocks[i];
    const x = (b.x0 + b.x1) / 2 + 1.2, z = (b.z0 + b.z1) / 2;
    g.place(i === 3 ? 'mg' : 'rifleman', V(x * S, (b.top + 0.3) * SV + 0.05, z * S), Math.PI / 2, 3, { cover: 'roof' });
  }
  // Mortars in the courtyard.
  for (const [x, z] of [[0, -2], [12, 4], [-12, 4]]) {
    g.place('mortar', V((x + SHIFT) * S, 0.4, z * S), 0, 20, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
