import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Gyeongbokgung, Seoul: Geunjeongjeon, the throne hall, in its courtyard.
 *
 * Reference figures (Cultural Heritage Administration of Korea, the 1990–2010
 * restoration record):
 *   Geunjeongjeon         the throne hall, 30 × 21 m in plan, five bays by
 *                         five, a double-eaved hip-and-gable roof of grey
 *                         tile about 22 m over its terrace
 *   the woldae            the two-level granite terrace it stands on, the
 *                         lower about 68 × 52 m, each level 1.5 m, with
 *                         the twelve zodiac animals on the balustrade
 *   the courtyard         about 100 × 130 m, enclosed on all four sides by
 *                         the haenggak, a roofed cloister, with
 *                         Geunjeongmun, the two-storey gate, on the south
 *
 * Kind: a topple on a plinth, Himeji's kind. The granite terrace is ground —
 * it is fitted stone over fill and will not be shot down. The hall on it is
 * a red box of columns carrying a roof that weighs more than the storey under
 * it, so the mass is up in the eaves and the hall goes over the way the
 * player leans it. The cloister ring round the courtyard is the twist: it is
 * low and long and not the target, and it is where the garrison lives —
 * every gun on the way to the hall shoots from under its eaves.
 *
 * Timber is not a material the game has. The columns and walls are REDSTONE,
 * the terrace LIMESTONE for the granite, the roofs SLATE (they are grey
 * tile), the bracket sets under the eaves VERDE, the painted blue-green of
 * the dancheong.
 */

const S = 2.2;
const STONE_FINENESS = 0.75;

// Real metres, scaled once at the end. +z is south.
const HALL = { w: 30.0, d: 21.0, lowerH: 8.0, upperIn: 2.5, upperH: 2.4 };
const WALL = 0.9;
const TERRACE = [                                  // the woldae, lowest first: [cz, w, d, h]
  { cz: 3.0, w: 68.0, d: 52.0, h: 1.5 },
  { cz: 1.0, w: 52.0, d: 40.0, h: 1.5 },
];
const TERRACE_H = TERRACE.reduce((a, t) => a + t.h, 0);
// The courtyard, and the cloister that closes it: a colonnade on the
// courtyard side and a wall on the outside, under one long roof.
const COURT = { cz: 36.0, w: 124.0, d: 136.0 };
const CLOISTER = { depth: 6.0, h: 4.6, bay: 3.6, col: 0.9 };
// Geunjeongmun, the gate in the south range: two storeys under two roofs.
const GATE = { w: 20.0, d: 9.0, lowerH: 5.6, upperIn: 2.0, upperH: 3.2, doors: 3 };

const EAVE_BRACKET = [1.0, 2.0];
const ROOF_OVER = 0.5;
const ROOF_T = 2.2;
const ROOF_SLOPE = 0.55;
const ROOF_STEP = 1.3;

/** The heights a double-eaved hall's parts land at, from its floor. */
function levels(h) {
  const bracketH = 0.7 * EAVE_BRACKET.length;
  const lowerBrackets = h.lowerH + bracketH;
  const skirtOut = h.d / 2 + EAVE_BRACKET[1] + ROOF_OVER;
  const skirtIn = h.d / 2 - h.upperIn;
  const skirtTop = lowerBrackets + (skirtOut - skirtIn) * ROOF_SLOPE;
  const upperTop = skirtTop + h.upperH;
  const upperBrackets = upperTop + bracketH;
  const halfOut = skirtIn + EAVE_BRACKET[1] + ROOF_OVER;
  return { lowerBrackets, skirtTop, upperTop, upperBrackets, roofTop: upperBrackets + halfOut * ROOF_SLOPE };
}
const HALL_L = levels(HALL);
const GATE_L = levels(GATE);
const gateZ = COURT.cz + COURT.d / 2 - CLOISTER.depth / 2;

/** What the garrison, the flag and the level record read (world metres). */
export const GYEONGBOK = {
  scale: S,
  terraceH: TERRACE_H * S,
  hall: { w: HALL.w * S, d: HALL.d * S, wall: WALL * S, lowerTop: HALL.lowerH * S,
    skirtTop: HALL_L.skirtTop * S, roofTop: (TERRACE_H + HALL_L.roofTop) * S },
  court: { cz: COURT.cz * S, w: COURT.w * S, d: COURT.d * S },
  cloister: { depth: CLOISTER.depth * S, h: CLOISTER.h * S, roofTop: (CLOISTER.h + 1.4 + 3 * ROOF_STEP * ROOF_SLOPE) * S },
  gate: { z: gateZ * S, w: GATE.w * S, d: GATE.d * S, lowerTop: GATE.lowerH * S, skirtTop: GATE_L.skirtTop * S },
  galleries: [TERRACE_H * S, (CLOISTER.h + 1.4) * S, (TERRACE_H + HALL_L.lowerBrackets) * S],
  flag: { x: 0, y: (TERRACE_H + HALL_L.roofTop + 0.6) * S, z: 0 },
};

export function buildGyeongbok(quality) {
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
   * A tiled roof: courses stepping in on one another until they close on
   * the ridge. The ring's thickness is what the course above lands on, so
   * every stone of it stands on stone. `pyramid` closes on a point.
   */
  const roof = (cx, cz, y0, wOut, dOut, top, mat, pyramid = false) => {
    const rise = ROOF_STEP * ROOF_SLOPE;
    let y = y0, w = wOut, d = dOut, c = 0;
    while (y < top - 0.01 && Math.min(w, d) > 0.5) {
      const h = Math.min(rise, top - y);
      if (Math.min(w, d) <= ROOF_T * 2.1) {
        B.slab(cx, y + h / 2, cz, Math.max(w, 1.0), h, Math.max(d, 1.0), stone, mat);
      } else {
        B.ring(cx, cz, w, d, ROOF_T, y, h, stone, mat, c % 2 ? 0.5 : 0);
      }
      y += h; c++;
      w -= 2 * ROOF_STEP; d -= 2 * ROOF_STEP;
      if (!pyramid && d <= ROOF_T * 2.1) w = Math.max(w, wOut - dOut + ROOF_T * 2.1);
    }
    return y;
  };
  /** Bracket courses under an eave: the wall's own course laid proud, in the painted colour. */
  const brackets = (cx, cz, y0, w, d, mat = M.VERDE) => {
    let y = y0;
    for (const e of EAVE_BRACKET) {
      B.ring(cx, cz, w, d, WALL, y, 0.7, stone, mat, 0, () => e);
      y += 0.7;
    }
    return y;
  };

  /**
   * A double-eaved hall on a floor at `y0`: the outer columns with doors
   * between them on the south and north fronts, the inner ring of columns
   * carried to the floor under the upper wall, the skirt roof, the upper
   * wall and the main roof.
   */
  const hall = (cx, cz, h, y0, opts = {}) => {
    const L = levels(h);
    const over = EAVE_BRACKET[1] + ROOF_OVER;
    const iw = h.w - 2 * h.upperIn, id = h.d - 2 * h.upperIn;
    const bay = opts.bay ?? 4.2, pier = opts.pier ?? 1.2, doorH = opts.doorH ?? h.lowerH * 0.7;
    const doorFaces = opts.doorFaces ?? [-1, 1];
    const doors = (x, y, z) => {
      const face = Math.sign(z - cz);
      if (Math.abs(z - cz) < h.d / 2 - WALL - 0.3 || !doorFaces.includes(face)) return false;
      if (y - y0 > doorH || y - y0 < 0) return false;
      const lx = Math.abs(x - cx);
      if (lx > h.w / 2 - 2.0) return false;
      if (opts.doors && lx > opts.doors * bay / 2) return false;
      const along = (lx + bay / 2) % bay;
      return along > pier / 2 && along < bay - pier / 2;
    };
    B.openings(doors, () => {
      courses(y0, y0 + h.lowerH, course, (y, ch, c) => {
        B.ring(cx, cz, h.w, h.d, WALL, y, ch, stone, M.REDSTONE, c % 2 ? 0.5 : 0);
      });
    });
    courses(y0, y0 + L.skirtTop, course, (y, ch, c) => {
      B.ring(cx, cz, iw, id, WALL, y, ch, stone, M.REDSTONE, c % 2 ? 0 : 0.5);
    });
    brackets(cx, cz, y0 + h.lowerH, h.w, h.d);
    {
      const rise = ROOF_STEP * ROOF_SLOPE;
      let y = y0 + L.lowerBrackets, w = h.w + 2 * over, d = h.d + 2 * over, c = 0;
      while (d > id + ROOF_T * 0.5 && y < y0 + L.skirtTop - 0.01) {
        const hh = Math.min(rise, y0 + L.skirtTop - y);
        B.ring(cx, cz, w, d, ROOF_T, y, hh, stone, M.SLATE, c % 2 ? 0.5 : 0);
        y += hh; c++; w -= 2 * ROOF_STEP; d -= 2 * ROOF_STEP;
      }
    }
    const clere = (x, y, z) => Math.abs(z - cz) > id / 2 - WALL - 0.3 && Math.abs(x - cx) < iw / 2 - 2.0
      && y - (y0 + L.skirtTop) > 0.5 && y - (y0 + L.skirtTop) < h.upperH - 0.5
      && ((Math.abs(x - cx) + bay / 2) % bay) > 1.4 && ((Math.abs(x - cx) + bay / 2) % bay) < bay - 1.4;
    B.openings(clere, () => {
      courses(y0 + L.skirtTop, y0 + L.upperTop, course, (y, ch, c) => {
        B.ring(cx, cz, iw, id, WALL, y, ch, stone, M.REDSTONE, c % 2 ? 0.5 : 0);
      });
    });
    brackets(cx, cz, y0 + L.upperTop, iw, id);
    roof(cx, cz, y0 + L.upperBrackets, iw + 2 * over, id + 2 * over, y0 + L.roofTop, M.SLATE);
  };

  // ── The woldae: two levels of solid granite courses, coarse, with a
  // balustrade on each edge and the stairs up the south face.
  B.section('terrace', () => {
    let y = 0;
    for (const t of TERRACE) {
      courses(y, y + t.h, course * 1.7, (yy, ch) => {
        B.slab(0, yy + ch / 2, t.cz, t.w, ch, t.d, stone * 3.0, M.LIMESTONE);
      });
      y += t.h;
      const gap = (x, _yy, z) => Math.abs(x) < 6.0 && z > t.cz;
      B.openings(gap, () => {
        courses(y, y + 1.0, course * 0.9, (yy, ch, c) => {
          B.ring(0, t.cz, t.w - 0.6, t.d - 0.6, 0.55, yy, ch, stone * 1.5, M.LIMESTONE, c % 2 ? 0.5 : 0);
        });
      });
    }
    // Three flights up the south face, side by side, corbelled so each
    // course stands on the one under it.
    const front = TERRACE[0].cz + TERRACE[0].d / 2;
    for (const fx of [-6.5, 0, 6.5]) {
      const fw = fx === 0 ? 5.0 : 4.5;
      const zFoot = front + TERRACE_H * 1.8;
      const run = zFoot - (TERRACE[1].cz + TERRACE[1].d / 2 - 2.0);
      courses(0, TERRACE_H, course, (yy, ch, c) => {
        const len = run * (1 - (c * ch) / TERRACE_H * 0.9);
        if (len < stone) return;
        B.slab(fx, yy + ch / 2, zFoot - len / 2, fw, ch, len, stone * 1.6, M.LIMESTONE);
      });
    }
  });

  // ── Geunjeongjeon.
  B.section('hall', () => {
    hall(0, 0, HALL, TERRACE_H, { bay: 4.2, pier: 1.2, doorH: 4.8 });
    // The ridge ornaments at either end.
    const iw = HALL.w - 2 * HALL.upperIn, id = HALL.d - 2 * HALL.upperIn;
    for (const sx of [-1, 1]) B.pinnacle(sx * (iw - id) / 2 * 0.85, 0, TERRACE_H + HALL_L.roofTop, 1.4, 1.2, stone * 0.7, M.SLATE);
  });

  // ── The haenggak: the cloister round the courtyard. An outer wall and an
  // inner colonnade under one low roof; the corners are square pavilions so
  // the four roofs meet in something rather than in each other.
  B.section('cloisters', () => {
    const { cz, w, d } = COURT;
    const dep = CLOISTER.depth, h = CLOISTER.h;
    const hw = w / 2, hd = d / 2;
    // The gate takes the middle of the south range.
    const gateGap = (x, z) => z > cz + hd - dep - 1.0 && Math.abs(x) < GATE.w / 2 + 0.6;
    // The colonnade: the inner ring with everything between the columns left out.
    const colonnade = (x, y, z) => {
      if (y > h - 0.9) return false;                                    // the lintel course
      const onZ = Math.abs(z - cz) > hd - dep - WALL - 0.3, onX = Math.abs(x) > hw - dep - WALL - 0.3;
      const along = onZ ? x : z - cz;
      const half = onZ ? hw - dep : hd - dep;
      if (Math.abs(along) > half - 2.0) return false;                  // the corner piers
      const k = ((Math.abs(along) + CLOISTER.bay / 2) % CLOISTER.bay);
      return k > CLOISTER.col / 2 && k < CLOISTER.bay - CLOISTER.col / 2;
    };
    B.openings((x, y, z) => gateGap(x, z), () => {
      courses(0, h, course, (y, ch, c) => {
        B.ring(0, cz, w, d, WALL, y, ch, stone, M.REDSTONE, c % 2 ? 0.5 : 0);
      });
      B.openings(colonnade, () => {
        courses(0, h, course, (y, ch, c) => {
          B.ring(0, cz, w - 2 * dep, d - 2 * dep, WALL, y, ch, stone, M.REDSTONE, c % 2 ? 0 : 0.5);
        });
      });
      // The roof over each range: a gable along its length, from the outer
      // eave to the inner, stopping short of the corners.
      const over = EAVE_BRACKET[1] * 0.6 + ROOF_OVER;
      const ranges = [
        { cx: 0, cz: cz - hd + dep / 2, w: w - 2 * dep, d: dep },        // north
        { cx: 0, cz: cz + hd - dep / 2, w: w - 2 * dep, d: dep },        // south
        { cx: -hw + dep / 2, cz, w: dep, d: d - 2 * dep, turn: true },   // west
        { cx: hw - dep / 2, cz, w: dep, d: d - 2 * dep, turn: true },    // east
      ];
      for (const r of ranges) {
        // The brackets: one proud course on both walls of the range.
        B.ring(r.cx, r.cz, r.w, r.d, WALL, h, 0.7, stone, M.VERDE, 0, () => EAVE_BRACKET[1] * 0.6);
        // The eave course spans the two walls of the range, as the rafters do.
        B.slab(r.cx, h + 0.7 + 0.35, r.cz, r.w + (r.turn ? 2 * over : 0), 0.7, r.d + (r.turn ? 0 : 2 * over), stone * 1.6, M.SLATE);
        // Then the gable steps in on it.
        const rise = ROOF_STEP * ROOF_SLOPE;
        const across = (r.turn ? r.w : r.d) + 2 * over;
        const n = Math.max(1, Math.ceil((across / 2 - ROOF_T * 0.5) / ROOF_STEP));
        for (let c = 0; c < n; c++) {
          const a = across - 2 * ROOF_STEP * c;
          if (a < 0.8) break;
          const y = h + 1.4 + c * rise;
          const ww = r.turn ? a : r.w, dd = r.turn ? r.d : a;
          if (a <= ROOF_T * 2.1) B.slab(r.cx, y + rise / 2, r.cz, ww, rise, dd, stone, M.SLATE);
          else B.ring(r.cx, r.cz, ww, dd, ROOF_T, y, rise, stone, M.SLATE, c % 2 ? 0.5 : 0);
        }
      }
      // The corner pavilions: a square of the cloister's depth under a pyramid.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = sx * (hw - dep / 2), pz = cz + sz * (hd - dep / 2);
          B.ring(px, pz, dep, dep, WALL, h, 0.7, stone, M.VERDE, 0, () => EAVE_BRACKET[1] * 0.6);
          B.slab(px, h + 0.7 + 0.35, pz, dep + 2 * over, 0.7, dep + 2 * over, stone * 1.6, M.SLATE);
          roof(px, pz, h + 1.4, dep + 2 * over, dep + 2 * over, h + 1.4 + (dep / 2 + over) * ROOF_SLOPE + 1.0, M.SLATE, true);
        }
      }
    });
  });

  // ── Geunjeongmun: the gate, two storeys, in the south range.
  B.section('gate', () => {
    // Its own low granite plinth, through the cloister line, with the three
    // doorways cut through the lower storey.
    B.slab(0, 0.4, gateZ, GATE.w + 1.5, 0.8, GATE.d + 1.5, stone * 2.4, M.LIMESTONE);
    hall(0, gateZ, GATE, 0.8, { bay: 5.4, pier: 1.6, doorH: 4.2, doors: GATE.doors });
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen and machine guns along the cloister roofs, which is
 * the ring every gun has to shoot over; riflemen in the throne hall's doors;
 * snipers on the hall's skirt roof; anti-tank teams on the gate's upper
 * storey and at the corner pavilions; mortars on the terrace behind the hall.
 */
export function populateGyeongbok(g, origin, groundY) {
  const K = GYEONGBOK;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const C = K.court, cl = K.cloister;
  const hw = C.w / 2, hd = C.d / 2;
  // On the cloister roofs, at the eave, facing out: the first line.
  const roofY = cl.h + 1.4 * S + 0.3;
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * (C.w / 8);
    g.place(i % 3 === 0 ? 'mg' : 'rifleman', V(x, roofY, C.cz - hd + 2.0), Math.PI, 8, { cover: 'roof' });
    if (Math.abs(x) > K.gate.w / 2 + 6) g.place(i % 3 === 1 ? 'mg' : 'rifleman', V(x, roofY, C.cz + hd - 2.0), 0, 8, { cover: 'roof' });
  }
  for (let i = 0; i < 8; i++) {
    const z = C.cz + (i - 3.5) * (C.d / 9);
    for (const sx of [-1, 1]) {
      g.place(i % 4 === 0 ? 'mg' : 'rifleman', V(sx * (hw - 2.0), roofY, z), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 8, { cover: 'roof' });
    }
  }
  // Anti-tank teams at the four corner pavilions, and on the gate.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.place('at', V(sx * (hw - cl.depth / 2), roofY + 0.8, C.cz + sz * (hd - cl.depth / 2)), Math.atan2(sx, sz), 8, { cover: 'roof' });
    }
  }
  const G = K.gate;
  for (const sx of [-1, 1]) {
    g.place('at', V(sx * (G.w / 2 - 3.0 * S), G.lowerTop + 0.8 + 1.4 * S, G.z + G.d / 2 + 1.0 * S), 0, 8, { cover: 'roof' });
  }
  // In the throne hall's doors, on the terrace, and snipers on its skirt roof.
  const H = K.hall;
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * (H.w / 5);
    g.place(i % 2 ? 'rifleman' : 'mg', V(x, K.terraceH + 0.5, H.d / 2 - H.wall - 0.8), 0, 7, { cover: 'window' });
    if (i % 2) g.place('rifleman', V(x, K.terraceH + 0.5, -(H.d / 2 - H.wall - 0.8)), Math.PI, 7, { cover: 'window' });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.place('sniper', V(sx * (H.w / 2 + 1.0 * S), K.terraceH + H.lowerTop + 1.4 * S + 0.4, sz * (H.d / 2 + 1.0 * S)),
        Math.atan2(sx, sz), 8, { cover: 'roof' });
    }
  }
  // Mortars dug in on the courtyard's paving, in the south-east and south-west
  // corners inside the cloister: open ground, so every high arc clears the
  // cloister roof, where a crew on the terrace had the terrace in the way.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      g.place('mortar', V(sx * (COURT.w / 2 - 16) * S, 0.3, (COURT.cz + COURT.d / 2 - 28 - i * 10) * S), 0, 9, { cover: 'roof', emplaced: true });
    }
  }
}
