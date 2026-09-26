import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Edinburgh Castle, on Castle Rock.
 *
 * Reference figures (Historic Environment Scotland; the plan from the
 * survey, which has thirteen of the castle's buildings by name on the
 * summit, and the bake, which cuts Castle Rock as a crag and tail with the
 * summit at 130 m ASL and Princes Street 85 m below it):
 *   the summit          about 220 x 115 m of level ground, sheer to the
 *                       north, south and west, the Esplanade east
 *   Half Moon Battery   the great curved wall at the east end, some 30 m
 *                       from the Esplanade to its parapet, David's Tower
 *                       buried inside it
 *   Crown Square        the Royal Palace (23 x 41), the Great Hall (27 x 14),
 *                       the Queen Anne Building and the Scottish National
 *                       War Memorial round it
 *   St Margaret's       the twelfth-century chapel on the very top, 10 x 6
 *   the north rim       the Argyle Battery and Mills Mount, where the One
 *                       O'Clock Gun is fired
 *   the west            the New Barracks (56 x 63) and the Governor's House
 *   the Gatehouse       14 x 35, at the foot of the Half Moon on the Esplanade
 *
 * A fortress on a hill: the Potala's kind, read §2b of the playbook. Every
 * wall here is founded below the summit and carried up, so that where the
 * rock falls away — the Half Moon over the Esplanade, the Palace and the
 * Barracks over the southern cliff, the batteries over the gardens — the
 * masonry is exposed as the retaining wall it is, and where the rock is level
 * it is buried and coarse. Nothing here topples; it is a siege, and the
 * Half Moon is the face of it: a battered wall with the fill of the battery
 * and the Palace's ground behind it.
 *
 * Grey sandstone reads as LIMESTONE; roofs are SLATE.
 */

// One and a half times life. The brief asked for 1.6; the survey's summit is
// 220 m long and the castle's real plan already fills it, so the scale is
// what keeps the Barracks on the rock and the Half Moon over the Esplanade.
const S = 1.5;
const STONE_FINENESS = 0.9;
// Metres in per metre up, for every face on the hill.
const BATTER = 0.06;
const WALL = 1.8;
const PARAPET = 1.6;

/** Half-width of a battered wall at height y, given its width at its top. */
const wAt = (wTop, top, y) => wTop + 2 * BATTER * (top - y);

// Real metres, the survey's own frame: x east, z south, the summit at y 0.
// `found` is where each wall starts, a few metres under the lowest ground the
// bake shows beneath its footprint; `top` is its wall-head over the summit.
const BLOCKS = [
  { tag: 'palace', x0: 21, x1: 39, z0: 30, z1: 70, top: 16.0, found: -37, roof: 6.0, rows: [3.0, 9.0] },
  { tag: 'palace', x0: 21, x1: 30, z0: 30, z1: 39, top: 26.0, found: -37, roof: 4.0, rows: [3.0, 9.0, 15.0, 21.0], tower: true },
  { tag: 'greathall', x0: -7, x1: 20, z0: 62, z1: 74, top: 13.0, found: -37, roof: 6.0, rows: [6.5] },
  { tag: 'greathall', x0: -27, x1: -6, z0: 38, z1: 72, top: 15.0, found: -37, roof: 5.0, rows: [3.0, 9.0] },   // the Queen Anne Building
  { tag: 'chapel', x0: -14, x1: 24, z0: 12, z1: 38, top: 14.5, found: -6, roof: 6.0, rows: [4.0, 9.5] },       // the War Memorial
  { tag: 'chapel', x0: -23, x1: -13, z0: -11, z1: -5, top: 8.0, found: -5, roof: 3.0, rows: [3.5] },          // St Margaret's
  { tag: 'gatehouse', x0: 64, x1: 78, z0: -6, z1: 29, top: 12.7, found: -31, roof: 5.0, rows: [3.0, 8.0] },
  { tag: 'gatehouse', x0: 64, x1: 71, z0: -6, z1: 1, top: 19.0, found: -31, roof: 3.0, rows: [3.0, 8.0, 14.0], tower: true },
  { tag: 'gatehouse', x0: 64, x1: 71, z0: 22, z1: 29, top: 19.0, found: -31, roof: 3.0, rows: [3.0, 8.0, 14.0], tower: true },
  { tag: 'barracks', x0: -114, x1: -58, z0: 8, z1: 71, top: 18.0, found: -41, roof: 6.0, rows: [3.0, 8.0, 13.0], cross: 2 },
  { tag: 'barracks', x0: -93, x1: -70, z0: -18, z1: 18, top: 12.0, found: -20, roof: 5.0, rows: [3.0, 8.0] },   // the Governor's House
];
// The north rim: the Argyle Battery and Mills Mount, straight battered walls
// with a walk behind and a parapet with embrasures.
const RIM = [
  { tag: 'batteries', x0: -40, x1: 15, z: -40, found: -14 },
  { tag: 'batteries', x0: -95, x1: -45, z: -38, found: -31 },
];
// The Half Moon: a D of wall round David's Tower and the battery's fill,
// the arc facing the Esplanade.
const HALFMOON = { cx: 33, cz: 30, r: 28, a0: -115, a1: 115, wall: 4.0, found: -34, deck: 5.0, top: 7.0 };
// Where the One O'Clock Gun stands: Mills Mount, on the summit's own ground.
const GUN = { x: -66, z: -27 };

/** What the garrison, the flag and the level record read (world metres). */
export const EDINBURGH = {
  scale: S,
  blocks: BLOCKS.map((b) => ({ ...b, x0: b.x0 * S, x1: b.x1 * S, z0: b.z0 * S, z1: b.z1 * S, top: b.top * S, rows: b.rows.map((r) => r * S) })),
  rim: RIM.map((r) => ({ ...r, x0: r.x0 * S, x1: r.x1 * S, z: r.z * S })),
  halfmoon: { cx: HALFMOON.cx * S, cz: HALFMOON.cz * S, r: HALFMOON.r * S, deck: HALFMOON.deck * S, top: HALFMOON.top * S, a0: HALFMOON.a0, a1: HALFMOON.a1 },
  gun: { x: GUN.x * S, z: GUN.z * S },
  wall: WALL * S,
  /** Rooflines a man can be posted on, low to high. */
  galleries: [HALFMOON.deck * S, 16.0 * S, 26.0 * S],
  // The flag flies from the Palace's Crown tower.
  flag: { x: 25.5 * S, y: (26.0 + 4.0 + 0.6) * S, z: 34.5 * S },
};

export function buildEdinburgh(quality) {
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
  /** Coarse under the ground, the face's own stone above it. */
  const grain = (y, found) => (y < found + 3.0 ? 3.2 : y < -2.0 ? 1.8 : 1.0);

  /** Small castle windows: a light per 5 m bay in the rows given, clear of the corners. */
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
    const row = b.rows.find((r) => y > r && y < r + 2.2);
    if (row === undefined) return false;
    return Math.abs(((along + 1000) % 5.0) - 2.5) < 0.65;
  };

  /**
   * A stepped slate roof: rings stepping in as they rise, closing on a ridge
   * along the long axis. Steep, which is what a Scottish roof is.
   */
  const roof = (cx, cz, w, d, y0, maxH) => {
    const step = 0.8, rise = 1.0, thick = 2.2;
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

  /** A building: battered ring walls from the rock to the wall-head, cross walls, a roof. */
  const block = (b, omit = null) => {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const win = windowsOf(b);
    B.openings((x, y, z) => win(x, y, z) || (omit ? omit(x, y, z) : false), () => {
      let y = b.found;
      while (y < b.top - 0.01) {
        const g = grain(y, b.found);
        const ch = Math.min(course * g, b.top - y);
        // Never a sliver: the last course takes the remainder if it is small.
        const h = (b.top - (y + ch) < course * 0.5) ? b.top - y : ch;
        const c = Math.round((y - b.found) / course);
        B.ring(cx, cz, wAt(w, b.top, y), wAt(d, b.top, y), WALL + (g > 1 ? 0.6 : 0), y, h, stone * g, M.LIMESTONE, c % 2 ? 0.5 : 0);
        if (y >= -2.0 && b.cross) {
          for (let k = 1; k <= b.cross; k++) {
            B.slab(b.x0 + (w * k) / (b.cross + 1), y + h / 2, cz, WALL, h, d - WALL * 2 - 0.1, stone, M.LIMESTONE);
          }
        }
        // A floor at each window row, as a gallery round the inside.
        for (const r of b.rows) {
          if (Math.abs(y - (r - 0.4)) < h * 0.5 && y > 0) {
            B.ring(cx, cz, w - WALL * 2 + 0.1, d - WALL * 2 + 0.1, Math.min(3.0, Math.min(w, d) / 2 - WALL - 0.4), y, h, stone * 1.3, M.LIMESTONE, 0);
          }
        }
        y += h;
      }
    });
    if (b.tower) {
      // A tower ends in a parapet and a low pyramid.
      courses(b.top, b.top + PARAPET, course * 0.8, (y, h) => {
        B.ring(cx, cz, w + 0.6, d + 0.6, WALL * 0.8, y, h, stone, M.LIMESTONE);
      });
      B.slab(cx, b.top + course * 0.3, cz, w - WALL * 2 + 0.1, course * 0.6, d - WALL * 2 + 0.1, stone * 1.2, M.LIMESTONE);
      roof(cx, cz, w - 1.2, d - 1.2, b.top + course * 0.6, b.roof);
    } else {
      roof(cx, cz, w, d, b.top, b.roof);
    }
  };

  // ── Crown Square, St Margaret's, the Barracks, the Governor's House, the
  // Gatehouse: every block founded on the rock and built up.
  const towersOf = BLOCKS.filter((b) => b.tower);
  const inTower = (x, z) => towersOf.some((t) => x > t.x0 - 0.3 && x < t.x1 + 0.3 && z > t.z0 - 0.3 && z < t.z1 + 0.3);
  for (const b of BLOCKS) {
    B.section(b.tag, () => block(b, b.tower ? null : (x, _y, z) => inTower(x, z)));
  }

  // ── The north rim: straight battered walls over the gardens, a walk
  // behind each on the summit's own ground, and a parapet with embrasures.
  B.section('batteries', () => {
    for (const r of RIM) {
      const len = r.x1 - r.x0, cx = (r.x0 + r.x1) / 2;
      const top = 1.5;
      let y = r.found;
      while (y < top - 0.01) {
        const g = grain(y, r.found);
        const ch = Math.min(course * g, top - y);
        const h = (top - (y + ch) < course * 0.5) ? top - y : ch;
        const t = 3.0 + 2 * BATTER * (top - y);
        // The outer face batters; the inner face is plumb.
        B.slab(cx, y + h / 2, r.z - (t - 3.0) / 2, len, h, t, stone * g, M.LIMESTONE);
        y += h;
      }
      // The parapet, with an embrasure every eight metres.
      B.openings((x) => Math.abs(((x - r.x0 + 1000) % 8.0) - 4.0) < 0.9 && x > r.x0 + 3 && x < r.x1 - 3, () => {
        courses(top, top + PARAPET, course * 0.7, (yy, h) => {
          B.slab(cx, yy + h / 2, r.z - 0.6, len, h, 1.8, stone, M.LIMESTONE);
        });
      });
      // The walk, on the ground.
      B.slab(cx, 0.3, r.z + 1.5 + 3.0, len, 0.6, 6.0, stone * 1.4, M.LIMESTONE);
    }
  });

  // ── The Half Moon Battery: a D of battered wall round the fill, its arc
  // over the Esplanade, David's Tower's stump inside it, the gun platform on
  // top and the parapet round that. The Palace's north half stands on the
  // platform.
  B.section('halfmoon', () => {
    const H = HALFMOON;
    const arc = (r, n) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = (H.a0 + ((H.a1 - H.a0) * i) / n) * Math.PI / 180;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return pts;
    };
    let y = H.found;
    while (y < H.top - 0.01) {
      const g = grain(y, H.found);
      const ch = Math.min(course * g, H.top - y);
      const h = (H.top - (y + ch) < course * 0.5) ? H.top - y : ch;
      const c = Math.round((y - H.found) / course);
      const r = H.r + BATTER * (H.top - y);
      // Above the platform it is a parapet, thinner, with embrasures.
      const parapet = y >= H.deck + 1.2 - 0.01;
      const lay = () => B.polyRing(H.cx, H.cz, arc(r, 14 + (c % 2)), parapet ? 1.8 : H.wall + (g > 1 ? 0.8 : 0), y, h, stone * g, M.LIMESTONE, 0);
      if (parapet) {
        B.openings((x, _y, z) => Math.abs((((Math.atan2(z - H.cz, x - H.cx) * 180 / Math.PI) + 1000) % 16) - 8) < 2.2, lay);
      } else lay();
      // The fill: radial walls from the chord to the arc, every seven
      // metres, and the tower's stump in the middle. Above the summit they
      // carry the platform; below it they are what the rock is.
      if (y >= -3.0 && !parapet) {
        for (let k = -3; k <= 3; k++) {
          const zc = H.cz + k * 7.0;
          const xr = H.cx + Math.sqrt(Math.max(0, r * r - (zc - H.cz) ** 2)) - H.wall * 0.6;
          const x0 = H.cx + Math.cos(H.a1 * Math.PI / 180) * r + H.wall * 0.6;
          if (xr - x0 > stone) B.slab((x0 + xr) / 2, y + h / 2, zc, xr - x0, h, WALL, stone, M.LIMESTONE);
        }
      }
      y += h;
    }
    // The platform: one thick course over the fill, inside the wall.
    const chordX = H.cx + Math.cos(H.a1 * Math.PI / 180) * H.r;
    B.openings((x, _y, z) => Math.hypot(x - H.cx, z - H.cz) > H.r - H.wall * 0.55 || x < chordX + H.wall * 0.55, () => {
      B.slab(H.cx, H.deck + 0.6, H.cz, H.r * 2 + 2, 1.2, H.r * 2 + 2, stone * 1.1, M.LIMESTONE);
    });
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen and machine guns along the Half Moon's parapet
 * and the two northern batteries, riflemen in the Palace's and the
 * Barracks' windows, snipers on the Crown tower and the Gatehouse turrets,
 * anti-tank teams at the Gatehouse and on the Half Moon, and a mortar section
 * in the open on Crown Square.
 */
export function populateEdinburgh(g, origin, groundY) {
  const K = EDINBURGH;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  // The Half Moon's parapet: a man at every other embrasure, facing out.
  const H = K.halfmoon;
  for (let i = 0; i < 8; i++) {
    const a = (H.a0 + ((H.a1 - H.a0) * (i + 0.5)) / 8) * Math.PI / 180;
    const r = H.r - 2.4;
    g.place(i % 4 === 1 ? 'mg' : i % 4 === 3 ? 'at' : 'rifleman',
      V(H.cx + Math.cos(a) * r, H.deck + 1.2 + 0.6, H.cz + Math.sin(a) * r), Math.atan2(Math.cos(a), Math.sin(a)), 7, { cover: 'roof' });
  }
  // The batteries: the walk behind the parapet, facing north over the gardens.
  for (const r of K.rim) {
    const n = Math.max(3, Math.round((r.x1 - r.x0) / (14 * S)));
    for (let i = 0; i < n; i++) {
      const x = r.x0 + ((r.x1 - r.x0) * (i + 0.5)) / n;
      g.place(i === Math.floor(n / 2) ? 'mg' : 'rifleman', V(x, 0.6, r.z + 4.5 * S), Math.PI, 8, { cover: 'roof' });
    }
  }
  // Windows: the Palace's east and south faces, the Barracks' west face.
  const palace = K.blocks[0];
  for (const z of [0.3, 0.5, 0.7, 0.9]) {
    g.place('rifleman', V(palace.x1 - K.wall - 0.8, palace.rows[1] + 0.3, palace.z0 + (palace.z1 - palace.z0) * z), Math.PI / 2, 6, { cover: 'window' });
  }
  const barracks = K.blocks[9];
  for (const z of [0.2, 0.4, 0.6, 0.8]) {
    g.place(z === 0.4 ? 'mg' : 'rifleman', V(barracks.x0 + K.wall + 0.8, barracks.rows[2] + 0.3, barracks.z0 + (barracks.z1 - barracks.z0) * z), -Math.PI / 2, 6, { cover: 'window' });
  }
  // Snipers on the Crown tower and the Gatehouse turrets.
  for (const t of K.blocks.filter((b) => b.tower)) {
    const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
    for (const [nx, nz] of [[1, 0], [0, -1]]) {
      g.place('sniper', V(cx + nx * ((t.x1 - t.x0) / 2 - K.wall), t.top + 0.9 * S + 0.4, cz + nz * ((t.z1 - t.z0) / 2 - K.wall)), Math.atan2(nx, nz), 6, { cover: 'roof' });
    }
  }
  // Anti-tank teams in the Gatehouse's windows over the Esplanade.
  const gate = K.blocks[6];
  for (const z of [0.3, 0.7]) {
    g.place('at', V(gate.x1 - K.wall - 0.8, gate.rows[1] + 0.3, gate.z0 + (gate.z1 - gate.z0) * z), Math.PI / 2, 6, { cover: 'window' });
  }
  // Mortars on Crown Square, in the open.
  for (const [x, z] of [[0, 48], [10, 55], [-10, 55]]) {
    g.place('mortar', V(x * S, 0.4, z * S), 0, 20, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
