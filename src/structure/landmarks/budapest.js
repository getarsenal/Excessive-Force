import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Hungarian Parliament, Budapest.
 *
 * Reference figures (Országház, published; the plan from the survey, which
 * carries the building as a forty-three point outline named Országház,
 * 129 x 265 m with the dome at the level's origin):
 *   length along the Danube    268 m; the wings 48 m deep, the central block
 *                              115 m deep to the east front on Kossuth tér
 *   cornice                    27 m (the survey's 28.8); roofs to about 37
 *   dome                       96 m to the finial, a sixteen-sided drum about
 *                              32 m across over the central hall
 *   the great spires           two, about 70 m, flanking the dome on the
 *                              river side
 *   the pavilions              at either end of the wings, 32 m to the eaves
 *                              with their own spire to about 55
 *
 * A shell with wings. Nothing here topples: the wings are two hundred and
 * seventy metres of hollow masonry ranges round courtyards, and they are not
 * the contract — the dome is, and the dome stands on the sixteen piers of its
 * own drum, which run down through the hall to the ground. The wings' courses
 * carry the wings and nothing else. Open the drum at hall level and the dome
 * comes down in a sheet into the hall; shell the wings all day and the bar
 * does not move.
 *
 * Grey-white limestone reads as LIMESTONE; the dome and the roofs are the
 * ox-blood REDSTONE they actually are; the finials GILT.
 */

const S = 1.2;
const STONE_FINENESS = 0.82;

// Real metres, the dome's axis at (0, 0), the Danube to the west (-x), the
// wings running north (-z) and south (+z).
const RIVER_X = -40.0;            // the river facade
const WING_E = 8.0;               // the wings' east face
const WING_Z0 = 45.0;             // where a wing leaves the central block
const WING_Z1 = 134.0;            // the far end of the wing
const PAV_Z0 = 94.0;              // the pavilion at the end of each wing
const PAV_E = 15.0;
const CENTRE_E = 75.0;            // the east front, on Kossuth ter
const CORNICE = 27.0;
const PAV_CORNICE = 32.0;
const WALL = 2.2;
const BAY = 7.6;                  // one window bay
const DRUM_R = 16.0, DRUM_WALL = 2.5, DRUM_TOP = 56.0;
const DOME_H = 30.0;              // to the lantern
const LANTERN_TOP = 96.0;
const SPIRE_W = 9.0, SPIRE_SHAFT = 50.0, SPIRE_TOP = 72.0;
const SPIRES = [[-35.5, -32.0], [-35.5, 32.0]];
const PAV_SPIRE_TOP = 55.0;

/** What the garrison, the flag and the level record read. */
export const BUDAPEST = {
  scale: S,
  riverX: RIVER_X * S, wingE: WING_E * S, wingZ0: WING_Z0 * S, wingZ1: WING_Z1 * S,
  pavZ0: PAV_Z0 * S, pavE: PAV_E * S, centreE: CENTRE_E * S,
  cornice: CORNICE * S, pavCornice: PAV_CORNICE * S,
  drumR: DRUM_R * S, drumTop: DRUM_TOP * S, domeTop: (DRUM_TOP + DOME_H) * S,
  spires: SPIRES.map(([x, z]) => ({ x: x * S, z: z * S })), spireW: SPIRE_W * S, spireShaft: SPIRE_SHAFT * S,
  /** The window rows, sill heights above the ground. */
  rows: [4.5 * S, 15.0 * S],
  /** Rooflines a man can be posted on, low to high. */
  galleries: [CORNICE * S, PAV_CORNICE * S, 44.0 * S],
  flag: { x: 0, y: LANTERN_TOP * S + 0.4, z: 0 },
};

export function buildBudapest(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 2.3 * s;
  const course = 1.7 * s;
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  /**
   * Gothic windows in an outer wall: one pointed light per bay, two rows,
   * never within a bay of a corner. `along` is the coordinate along the face.
   */
  const lightAt = (along, y, faceHalf) => {
    if (Math.abs(along) > faceHalf - BAY * 0.7) return false;
    const a = Math.abs(((along + 1000) % BAY) - BAY / 2);
    for (const [y0, y1] of [[4.5, 11.5], [15.0, 23.5]]) {
      if (y < y0 || y > y1) continue;
      if (a > 1.7) return false;
      if (y < y1 - 2.6) return true;
      const t = (y - (y1 - 2.6)) / 2.6;
      return a < 1.7 * Math.sqrt(Math.max(0, 1 - t * t));
    }
    return false;
  };
  const windowsOf = (cx, cz, w, d) => (x, y, z) => {
    const lx = x - cx, lz = z - cz;
    const onZ = Math.abs(lz) > d / 2 - WALL - 0.2, onX = Math.abs(lx) > w / 2 - WALL - 0.2;
    if (!onZ && !onX) return false;
    // A corner stone is never cut.
    if (Math.abs(lx) > w / 2 - WALL - 0.2 && Math.abs(lz) > d / 2 - WALL - 0.2) return false;
    return onZ ? lightAt(lx, y, w / 2) : lightAt(lz, y, d / 2);
  };
  /** A string course at the cornice and a plinth, as relief. */
  const relief = (x, z, y) => (Math.abs(y - (CORNICE - course * 0.5)) < course * 0.55 || y < course * 1.05 ? 0.3 : 0);

  /**
   * A hipped roof: courses of ring stepping in as they rise, each standing on
   * the one below with more than half its thickness, closing to a ridge slab
   * along the long axis. It is also what the roofs are: steep, ox-blood tile.
   */
  const hipRoof = (cx, cz, w, d, y0, maxH, mat = M.REDSTONE) => {
    const step = 0.9, rise = 1.1, thick = 2.4;
    const rc = Math.max(1.6, course * 0.7);
    let y = y0, ww = w + 0.8, dd = d + 0.8, c = 0;
    while (y < y0 + maxH - 0.01) {
      const short = Math.min(ww, dd);
      if (short <= thick * 2.6) {
        // The ridge.
        const along = ww >= dd;
        B.slab(cx, y + rc * 0.6, cz, along ? ww : short * 1.1, rc * 1.2, along ? short * 1.1 : dd, stone * 1.2, mat);
        return;
      }
      B.ring(cx, cz, ww, dd, thick, y, rc, stone * 1.3, mat, c % 2 ? 0.5 : 0);
      ww -= 2 * step * (rc / rise); dd -= 2 * step * (rc / rise);
      y += rc; c++;
    }
  };

  /** A block of the building: ring walls with windows, cross walls, a roof. */
  const block = (cx, cz, w, d, top, cross, omit, roofH) => {
    const win = windowsOf(cx, cz, w, d);
    B.openings((x, y, z) => win(x, y, z) || (omit ? omit(x, y, z) : false), () => {
      courses(0, top, course, (y, h, c) => {
        B.ring(cx, cz, w, d, WALL, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0, (px, pz) => relief(px, pz, y + h / 2));
        for (const cw of cross) {
          if (cw.axis === 'x') B.slab(cw.at, y + h / 2, cz + (cw.cz ?? 0), cw.len, h, WALL, stone, M.LIMESTONE);
          else B.slab(cx + (cw.cx ?? 0), y + h / 2, cw.at, WALL, h, cw.len, stone, M.LIMESTONE);
        }
      });
      // Floors as galleries round the inside of the outer wall: one thick
      // course a man can stand on, laid on a wall course exactly.
      for (const fy of [11.5, 23.5]) {
        const n = Math.max(1, Math.round(top / course));
        const ch = top / n;
        const yf = Math.round(fy / ch) * ch;
        B.ring(cx, cz, w - WALL * 2 + 0.1, d - WALL * 2 + 0.1, 3.6, yf, ch, stone * 1.5, M.LIMESTONE, 0);
      }
    });
    if (roofH) hipRoof(cx, cz, w, d, top, roofH);
  };

  // ── The two wings, north and south, with the pavilions at their ends.
  //
  // The wing is a ring of ranges round courtyards, cut where the central
  // block's own wall stands and where the pavilion takes over; the pavilion
  // is a taller ring with its own hipped roof, four corner pinnacles and a
  // spire on the ridge.
  const wing = (sign, tag) => {
    B.section(tag, () => {
      const z0 = sign * WING_Z0, z1 = sign * PAV_Z0;
      const cz = (z0 + z1) / 2, d = Math.abs(z1 - z0);
      const cx = (RIVER_X + WING_E) / 2, w = WING_E - RIVER_X;
      // Cross walls across the wing at thirds.
      const cross = [];
      for (let k = 1; k <= 2; k++) {
        cross.push({ axis: 'x', at: cx, cz: (z0 + (z1 - z0) * (k / 3)) - cz, len: w - WALL * 2 - 0.1 });
      }
      // The ranges: two long walls a range deep inside the outer ones, so
      // the courtyards between them are bounded and the roofs have walls
      // under both eaves.
      const RANGE = 14.0;
      cross.push({ axis: 'z', at: cz, cx: -(w / 2) + RANGE, len: d - WALL * 2 - 0.1 });
      cross.push({ axis: 'z', at: cz, cx: (w / 2) - RANGE, len: d - WALL * 2 - 0.1 });
      // No wall where the centre's own stands, none where the pavilion's does.
      const omit = (x, y, z) => Math.abs(z) < WING_Z0 + 0.05 || Math.abs(z) > PAV_Z0 - 0.05;
      block(cx, cz, w, d, CORNICE, cross, omit, 0);
      // Roofs over the two ranges, the courtyard between them open.
      const rangeLen = d - WALL - 1.0;
      hipRoof(RIVER_X + RANGE / 2, cz, RANGE, rangeLen, CORNICE, 9.0);
      hipRoof(WING_E - RANGE / 2, cz, RANGE, rangeLen, CORNICE, 9.0);
      // Cross-range roofs over the cross walls.
      for (let k = 1; k <= 2; k++) {
        const zc = z0 + (z1 - z0) * (k / 3);
        hipRoof(cx, zc, w - RANGE * 2 - 0.4, 6.0, CORNICE, 6.0);
      }

      // The pavilion.
      const pz0 = sign * PAV_Z0, pz1 = sign * WING_Z1;
      const pcz = (pz0 + pz1) / 2, pd = Math.abs(pz1 - pz0);
      const pcx = (RIVER_X + PAV_E) / 2, pw = PAV_E - RIVER_X;
      const pcross = [
        { axis: 'z', at: pcz, cx: 0, len: pd - WALL * 2 - 0.1 },
        { axis: 'x', at: pcx, cz: 0, len: pw - WALL * 2 - 0.1 },
      ];
      block(pcx, pcz, pw, pd, PAV_CORNICE, pcross, null, 16.0);
      for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        B.pinnacle(pcx + ex * (pw / 2 - WALL / 2), pcz + ez * (pd / 2 - WALL / 2), PAV_CORNICE, 7.0, 2.0, stone * 0.8, M.LIMESTONE);
      }
      // The spire on the ridge, and its gilt finial.
      const ridgeY = PAV_CORNICE + 16.0 * 0.92;
      B.spire(pcx, pcz, ridgeY, PAV_SPIRE_TOP, 3.6, 1.0, course * 0.9, stone * 0.8, M.REDSTONE, 0.6);
      B.pinnacle(pcx, pcz, PAV_SPIRE_TOP, 2.0, 1.0, stone * 0.6, M.GILT);
    });
  };
  wing(-1, 'northwing');
  wing(1, 'southwing');

  // ── The central block: the hall round the drum, the east front on the
  // square, and the roofs. The drum and the two great spires stand inside
  // its footprint on their own footings, so its walls are left out where
  // they are.
  const inSpire = (x, z) => SPIRES.some(([sx, sz]) => Math.abs(x - sx) < SPIRE_W / 2 + 0.3 && Math.abs(z - sz) < SPIRE_W / 2 + 0.3);
  B.section('hall', () => {
    const cx = (RIVER_X + CENTRE_E) / 2, w = CENTRE_E - RIVER_X, d = WING_Z0 * 2;
    // Cross walls from the drum out to the walls: east to the front, north
    // and south to the wing joints, west to the river facade, each stopped
    // at the drum's face.
    const cross = [];
    const r = DRUM_R + DRUM_WALL / 2 + 0.05;
    cross.push({ axis: 'x', at: (r + CENTRE_E - WALL) / 2, cz: 14.0, len: CENTRE_E - WALL - r });
    cross.push({ axis: 'x', at: (r + CENTRE_E - WALL) / 2, cz: -14.0, len: CENTRE_E - WALL - r });
    cross.push({ axis: 'x', at: (RIVER_X + WALL - r) / 2, cz: 0, len: -r - (RIVER_X + WALL) - 0.1 });
    cross.push({ axis: 'z', at: (r + WING_Z0 - WALL) / 2, cx: -cx, len: WING_Z0 - WALL - r });
    cross.push({ axis: 'z', at: -(r + WING_Z0 - WALL) / 2, cx: -cx, len: WING_Z0 - WALL - r });
    // Two more across the east front's depth, so no run of roof is far from a wall.
    cross.push({ axis: 'z', at: 0, cx: 48.0 - cx, len: d - WALL * 2 - 0.1 });
    // The wing joints: cross walls under the wing-facing corners.
    const omit = (x, y, z) => inSpire(x, z) || Math.hypot(x, z) < DRUM_R + DRUM_WALL + 0.4;
    block(cx, 0, w, d, CORNICE, cross, omit, 0);
    // The roof: a hipped ring over the outer walls, the courts inside open
    // to the drum.
    hipRoof(cx, 0, w, d, CORNICE, 10.0);
    // The east front's gable and the entrance: a taller centre bay over the
    // great stair, with its own two pinnacles.
    courses(CORNICE, CORNICE + 8.0, course, (y, h, c) => {
      B.ring(CENTRE_E - 12.0, 0, 24.0, 22.0, WALL, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0);
    });
    hipRoof(CENTRE_E - 12.0, 0, 24.0, 22.0, CORNICE + 8.0, 8.0);
    for (const ez of [-1, 1]) {
      B.pinnacle(CENTRE_E - WALL / 2, ez * (11.0 - WALL / 2), CORNICE + 8.0, 6.0, 2.0, stone * 0.8, M.LIMESTONE);
    }
  });

  // ── The drum: sixteen piers from the ground, the pointed arcade of the
  // hall between them, a solid band, then the windowed drum the dome sits on.
  // Everything above stands on these piers and on nothing else.
  B.section('drum', () => {
    const seg = (Math.PI * 2) / 16;
    const cut = (x, y, z) => {
      const a = Math.atan2(z, x);
      const frac = ((a / seg) % 1 + 1) % 1;
      const off = Math.abs(frac - 0.5);
      // The arcade: from 3 m to a pointed head at 28, a pier a third of a
      // side wide at every vertex.
      if (y > 3.0 && off < 0.30) {
        const head = 28.0 - 13.0 * Math.pow(off / 0.30, 2);
        if (y < head) return true;
      }
      // The drum's own windows, narrower and higher.
      if (y > 38.0 && off < 0.22) {
        const head = 51.0 - 9.0 * Math.pow(off / 0.22, 2);
        if (y < head) return true;
      }
      return false;
    };
    B.openings(cut, () => {
      courses(0, DRUM_TOP, course, (y, h, c) => {
        const rot = (c % 2) * (seg / 2);
        B.polyRing(0, 0, BlockList.circle(DRUM_R, 16, rot), DRUM_WALL, y, h, stone, M.LIMESTONE, 0,
          // Ribs at the vertices, a hand proud.
          (px, pz) => {
            const f = ((Math.atan2(pz, px) / seg) % 1 + 1) % 1;
            return Math.abs(f - 0.5) > 0.42 ? 0.35 : 0;
          });
      });
    });
    // The gallery at the drum's foot, outside the windows: where the men are.
    const n = Math.max(1, Math.round(DRUM_TOP / course));
    const ch = DRUM_TOP / n;
    const yf = Math.round(35.0 / ch) * ch;
    B.polyRing(0, 0, BlockList.circle(DRUM_R + DRUM_WALL / 2 + 1.6, 16, 0), 3.2, yf, ch, stone * 1.4, M.LIMESTONE, 0);
  });

  // ── The dome: a pointed ogive laid in half courses, and the lantern.
  B.section('dome', () => {
    const y0 = DRUM_TOP;
    B.dome(0, 0, y0, DOME_H, DRUM_R + 0.6, 2.0, course * 0.6, stone, M.REDSTONE,
      (t) => Math.pow(Math.max(0, 1 - Math.pow(t, 2.3)), 0.5));
    // Sixteen ribs up the dome, as pinnacles at the drum's rim.
    for (let i = 0; i < 16; i++) {
      const a = i * (Math.PI * 2 / 16);
      B.pinnacle(Math.cos(a) * (DRUM_R + DRUM_WALL / 2 - 0.4), Math.sin(a) * (DRUM_R + DRUM_WALL / 2 - 0.4), y0, 4.0, 1.4, stone * 0.7, M.LIMESTONE);
    }
    const ly = y0 + DOME_H;
    B.spire(0, 0, ly, LANTERN_TOP - 2.0, 6.0, 1.6, course * 0.8, stone * 0.8, M.LIMESTONE, 0.55);
    B.pinnacle(0, 0, LANTERN_TOP - 2.0, 2.4, 1.4, stone * 0.6, M.GILT);
  });

  // ── The two great spires beside the dome on the river side: square shafts
  // with lancets at three stages, a floor at each, and an octagonal spire.
  B.section('spires', () => {
    for (const [sx, sz] of SPIRES) {
      const half = SPIRE_W / 2;
      const stages = [[12, 22], [26, 36], [40, 47]];
      const lancet = (x, y, z) => {
        const lx = x - sx, lz = z - sz;
        const onZ = Math.abs(lz) > Math.abs(lx);
        const along = Math.abs(onZ ? lx : lz);
        if (along > half - WALL - 0.3) return false;
        for (const [y0, y1] of stages) {
          if (y < y0 || y > y1) continue;
          if (along > 1.3) return false;
          if (y < y1 - 2.2) return true;
          const t = (y - (y1 - 2.2)) / 2.2;
          return along < 1.3 * Math.sqrt(Math.max(0, 1 - t * t));
        }
        return false;
      };
      B.openings(lancet, () => {
        courses(0, SPIRE_SHAFT, course, (y, h, c) => {
          B.ring(sx, sz, SPIRE_W, SPIRE_W, WALL, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0,
            (px, pz) => (Math.abs(px - sx) > half - 1.4 && Math.abs(pz - sz) > half - 1.4 ? 0.5 : 0));
        });
      });
      const n = Math.max(1, Math.round(SPIRE_SHAFT / course));
      const ch = SPIRE_SHAFT / n;
      for (const [, y1] of stages) {
        const yf = Math.round((y1 + 0.5) / ch) * ch;
        const inner = SPIRE_W - 2 * WALL;
        B.ring(sx, sz, inner + 0.1, inner + 0.1, inner * 0.36, yf, ch, stone * 1.4, M.LIMESTONE, 0);
      }
      const octo = (r, rot) => BlockList.circle(r, 8, rot + Math.PI / 8);
      courses(SPIRE_SHAFT, SPIRE_TOP - 2.0, course * 0.9, (y, h, c) => {
        const t = (y - SPIRE_SHAFT) / (SPIRE_TOP - SPIRE_SHAFT);
        const r = (half - 0.3) * Math.pow(1 - t, 0.9) + 0.6;
        const wall = Math.max(stone * 0.55, 1.6 * (1 - t) + 0.6);
        if (r <= wall * 1.1) B.slab(sx, y + h / 2, sz, r * 2, h, r * 2, stone, M.REDSTONE);
        else B.polyRing(sx, sz, octo(r, (c % 2) * (Math.PI / 8)), wall, y, h, stone, M.REDSTONE, 0);
      });
      B.pinnacle(sx, sz, SPIRE_TOP - 2.0, 2.4, 1.4, stone * 0.6, M.GILT);
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen along the river facade's upper windows, machine
 * guns in the pavilions' windows at both ends, snipers on the great spires'
 * top stage and on the drum's gallery, anti-tank teams in the east front's
 * windows over Kossuth ter, and a mortar section in pits on the square.
 */
export function populateBudapest(g, origin, groundY) {
  const K = BUDAPEST;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const W = 2.2 * S;
  // The river facade: a man in every other bay of the upper row, both wings
  // and the centre.
  const bay = 7.6 * S;
  for (let z = -K.wingZ1 + bay * 1.5; z < K.wingZ1 - bay; z += bay * 2) {
    // Skip the bays the corners fall in.
    if (Math.abs(Math.abs(z) - K.wingZ0) < bay || Math.abs(Math.abs(z) - K.pavZ0) < bay) continue;
    g.place('rifleman', V(K.riverX + W + 0.8, K.rows[1] + 0.2, z), -Math.PI / 2, 6, { cover: 'window' });
  }
  // The pavilions: machine guns at the ends, looking up and down the river.
  for (const sz of [-1, 1]) {
    for (const x of [K.riverX + 12, K.pavE - 12]) {
      g.place('mg', V(x, K.rows[1] + 0.2, sz * (K.wingZ1 - W - 0.8)), sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
    }
    g.place('mg', V(K.riverX + W + 0.8, K.rows[0] + 0.2, sz * (K.pavZ0 + 20)), -Math.PI / 2, 6, { cover: 'window' });
  }
  // The great spires: snipers at the top stage, one a face.
  for (const sp of K.spires) {
    const half = K.spireW / 2 - W - 0.5;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.place('sniper', V(sp.x + nx * half, 44.0 * S + 0.5, sp.z + nz * half), Math.atan2(nx, nz), 6, { cover: 'window' });
    }
  }
  // The drum's gallery, over the roofs.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = K.drumR + 2.5 * S + 1.6 * S;
    g.place(i % 2 ? 'sniper' : 'rifleman', V(Math.cos(a) * r, 35.0 * S + 1.0, Math.sin(a) * r), Math.atan2(Math.cos(a), Math.sin(a)), 6, { cover: 'roof' });
  }
  // The east front: anti-tank teams in the windows over the square.
  for (const z of [-30 * S, -15 * S, 15 * S, 30 * S]) {
    g.place('at', V(K.centreE - W - 0.8, K.rows[1] + 0.2, z), Math.PI / 2, 6, { cover: 'window' });
  }
  // Mortars in pits on Kossuth ter.
  for (const z of [-40 * S, 0, 40 * S]) {
    g.place('mortar', V(K.centreE + 22 * S, 0.4, z), 0, 24, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
