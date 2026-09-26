import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Forbidden City, Beijing: the Three Great Halls on their terrace.
 *
 * Reference figures (Palace Museum survey; Liang Sicheng, "A Pictorial History
 * of Chinese Architecture"):
 *   the terrace            the 工-shaped three-tier white marble platform,
 *                          about 230 m north to south, 130 m across the wide
 *                          ends, 8.13 m high, balustraded on every tier
 *   Hall of Supreme Harmony (Taihedian)   64 × 37 m in plan, 26.9 m from the
 *                          terrace to the ridge, double-eaved hip roof of
 *                          yellow glazed tile on seventy-two red columns
 *   Hall of Central Harmony (Zhonghedian)  a 24 m square pavilion, single
 *                          pyramidal roof under a gilded ball, about 19 m
 *   Hall of Preserving Harmony (Baohedian) 50 × 25 m, double-eaved
 *                          gable-and-hip roof, about 29 m
 *
 * Kind: a topple on a plinth, Himeji's kind. The terrace is a mountain of
 * fitted stone over fill and is ground as far as the guns are concerned: it
 * cannot be shot down and it is scored against nobody. The three halls on it
 * are the other thing. Each one is a red box of columns and brick with the
 * heaviest part of the building — several thousand tonnes of glazed tile on
 * a timber frame — stacked on top of it as a roof, so the centre of mass is
 * up in the eaves. Shoot the columns out of one face and the roof leans that
 * way and takes the hall with it; the halls go over the way you lean them.
 *
 * Timber is not a material the game has. The columns and walls are MADDER,
 * the deep red the whole palace is washed in; the roofs are GOLD, which is
 * gilded fired clay and structural (GILT is leaf and carries nothing, and a
 * roof has to carry itself); the bracket sets under the eaves are SLATE,
 * the blue-green of the painted dougong, corbelling the eave out; the
 * terrace is MARBLE.
 */

// Twice life. At 1:1 the Hall of Supreme Harmony is twenty-seven metres, a
// bungalow from the camera distance the game plays at.
const S = 2.0;
const STONE_FINENESS = 0.8;

// Real metres, scaled once at the end. +z is south: the halls face south
// and the postcard is taken from the courtyard in front of them.
const TERRACE_H = 8.1;
const TIER_STEP = 4.0;                        // each tier stands this far inside the one below
// The 工: a wide south block under the Hall of Supreme Harmony, a waist under
// the Hall of Central Harmony, a wide north block under the Hall of
// Preserving Harmony. [cz, w, d] of each part of the lowest tier.
const TERRACE_PARTS = [
  { cz: 62.0, w: 130.0, d: 108.0 },
  { cz: -8.0, w: 82.0, d: 34.0 },
  { cz: -60.0, w: 130.0, d: 72.0 },
];
const TIERS = 3;
const BALUSTRADE = { h: 1.1, t: 0.6 };

const WALL = 1.0;                             // a hall's wall, columns and brick between
const EAVE_BRACKET = [1.2, 2.4];              // how far each bracket course stands proud
const ROOF_OVER = 0.6;                        // the roof edge past the bracket's outer face
const ROOF_T = 2.4;                           // a roof ring's thickness, horizontal
const ROOF_SLOPE = 0.62;                      // rise per metre in, about 32 degrees
const ROOF_STEP = 1.45;                       // how far a roof course steps in on the one below

/**
 * The halls, south to north. `lowerH` is the column height to the first
 * eave, `upperIn` how far the upper wall of a double-eaved hall stands
 * inside the lower, `upperH` its height; `pyramid` closes the roof on a
 * point rather than a ridge.
 */
const HALLS = [
  { tag: 'supreme', cz: 52.0, w: 64.0, d: 37.0, lowerH: 8.8, upperIn: 3.5, upperH: 2.6, doors: true },
  { tag: 'central', cz: -8.0, w: 24.0, d: 24.0, lowerH: 8.5, upperIn: 0, upperH: 0, pyramid: true, doors: true },
  { tag: 'preserving', cz: -60.0, w: 50.0, d: 25.0, lowerH: 8.4, upperIn: 3.0, upperH: 2.4, doors: true },
];

/** The heights a hall's parts land at, from the terrace top. */
function hallLevels(h) {
  const bracketH = 0.75 * EAVE_BRACKET.length;
  const lowerTop = h.lowerH;
  const lowerBrackets = lowerTop + bracketH;
  if (!h.upperIn) {
    // A single roof, straight up to the point.
    const halfOut = h.d / 2 + EAVE_BRACKET[1] + ROOF_OVER;
    return { lowerTop, lowerBrackets, roofBase: lowerBrackets, roofTop: lowerBrackets + halfOut * ROOF_SLOPE, halfOut };
  }
  // The skirt roof steps in from the lower eave to the foot of the upper wall.
  const skirtOut = h.d / 2 + EAVE_BRACKET[1] + ROOF_OVER;
  const skirtIn = h.d / 2 - h.upperIn;
  const skirtTop = lowerBrackets + (skirtOut - skirtIn) * ROOF_SLOPE;
  const upperTop = skirtTop + h.upperH;
  const upperBrackets = upperTop + bracketH;
  const halfOut = skirtIn + EAVE_BRACKET[1] + ROOF_OVER;
  return { lowerTop, lowerBrackets, skirtTop, upperTop, upperBrackets,
    roofBase: upperBrackets, roofTop: upperBrackets + halfOut * ROOF_SLOPE, halfOut };
}

const supreme = HALLS[0];
const supremeTop = TERRACE_H + hallLevels(supreme).roofTop;

/** What the garrison, the flag and the level record read (world metres). */
export const FORBIDDEN = {
  scale: S,
  terrace: { h: TERRACE_H * S, tiers: TIERS, step: TIER_STEP * S,
    parts: TERRACE_PARTS.map((p) => ({ cz: p.cz * S, w: p.w * S, d: p.d * S })) },
  halls: HALLS.map((h) => {
    const L = hallLevels(h);
    return { tag: h.tag, cz: h.cz * S, w: h.w * S, d: h.d * S, wall: WALL * S,
      lowerTop: L.lowerTop * S, skirtTop: (L.skirtTop ?? L.lowerBrackets) * S, roofTop: L.roofTop * S,
      doorH: 5.6 * S };
  }),
  /** Rooflines a man can be posted on, low to high. */
  galleries: [TERRACE_H * S, (TERRACE_H + hallLevels(HALLS[0]).lowerBrackets) * S],
  flag: { x: 0, y: (supremeTop + 0.6) * S, z: supreme.cz * S },
};

export function buildForbidden(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.1 * s;
  const course = 0.9 * s;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  // ── The terrace. Three tiers of solid courses, each stepping in, in coarse
  // stone: it is fill with a dressed face and it is not what the level is
  // about. The 工 plan is three rectangles a tier, laid so the waist overlaps
  // the two blocks and nothing is laid twice: the waist is cut where the
  // blocks already are.
  B.section('terrace', () => {
    const tierH = TERRACE_H / TIERS;
    for (let t = 0; t < TIERS; t++) {
      const inset = t * TIER_STEP;
      const y0 = t * tierH;
      const parts = TERRACE_PARTS.map((p) => ({ cz: p.cz, w: p.w - 2 * inset, d: p.d - 2 * inset }));
      const [south, waist, north] = parts;
      courses(y0, y0 + tierH, course * 1.8, (y, ch) => {
        for (const p of [south, north]) B.slab(0, y + ch / 2, p.cz, p.w, ch, p.d, stone * 3.4, M.MARBLE);
        // The waist runs from the south block's north face to the north block's south face.
        const z0 = north.cz + north.d / 2, z1 = south.cz - south.d / 2;
        if (z1 - z0 > 0.5) B.slab(0, y + ch / 2, (z0 + z1) / 2, waist.w, ch, z1 - z0, stone * 3.4, M.MARBLE);
      });
      // The balustrade round the tier's edge: a low parapet on the outline of
      // the 工, standing on the tier's own top course.
      const by = y0 + tierH;
      const z0 = north.cz + north.d / 2, z1 = south.cz - south.d / 2;
      const outline = [
        [-south.w / 2, south.cz + south.d / 2], [south.w / 2, south.cz + south.d / 2],
        [south.w / 2, z1], [waist.w / 2, z1], [waist.w / 2, z0], [north.w / 2, z0],
        [north.w / 2, north.cz - north.d / 2], [-north.w / 2, north.cz - north.d / 2],
        [-north.w / 2, z0], [-waist.w / 2, z0], [-waist.w / 2, z1], [-south.w / 2, z1],
      ].map(([x, z]) => [x * (1 - BALUSTRADE.t / Math.abs(x)), z]);
      // The stair bays: the balustrade stops where the three flights come up
      // the south face and where the halls' own steps land on each tier.
      const gap = (x, z) => Math.abs(z - (south.cz + south.d / 2)) < 2.0 && Math.abs(x) < 14.0 && t < TIERS;
      B.openings((x, _y, z) => gap(x, z), () => {
        courses(by, by + BALUSTRADE.h, course * 0.9, (y, ch, c) => {
          B.polyRing(0, 0, outline, BALUSTRADE.t, y, ch, stone * 1.6, M.MARBLE, c % 2);
        });
      });
    }
    // The three flights up the south face: masonry ramps with steps cut in
    // their tops, each course shorter than the one below so every stone
    // stands on stone. One wide central flight and two beside it.
    for (const fx of [-9.0, 0, 9.0]) {
      const fw = fx === 0 ? 7.0 : 5.0;
      const zFoot = TERRACE_PARTS[0].cz + TERRACE_PARTS[0].d / 2 + TERRACE_H * 1.6;
      const run = zFoot - (TERRACE_PARTS[0].cz + TERRACE_PARTS[0].d / 2 - TIERS * TIER_STEP);
      courses(0, TERRACE_H, course, (y, ch, c) => {
        const t0 = (c * ch) / TERRACE_H;
        const len = run * (1 - t0 * 0.92);
        if (len < stone) return;
        const zc = zFoot - len / 2;
        B.slab(fx, y + ch / 2, zc, fw, ch, len, stone * 1.6, M.MARBLE);
      });
    }
  });

  // ── A hall: the red walls and columns, the bracket sets corbelling the
  // eave out, and the roof — courses of gilded tile stepping in on one
  // another until they close on the ridge, which is what a tiled roof at the
  // resolution of a stone is, and the only way a roof carries itself.
  const roof = (cx, cz, y0, wOut, dOut, top, pyramid, mat) => {
    // Courses step in by ROOF_STEP on each side per course and rise by the
    // slope; the ring's own thickness is what the course above lands on.
    const rise = ROOF_STEP * ROOF_SLOPE;
    let y = y0, w = wOut, d = dOut, c = 0;
    while (y < top - 0.01 && Math.min(w, d) > 0.5) {
      const h = Math.min(rise, top - y);
      const closes = Math.min(w, d) <= ROOF_T * 2.1;
      if (closes) {
        // The ridge: a solid course along the long axis, or the apex.
        B.slab(cx, y + h / 2, cz, Math.max(w, 1.0), h, Math.max(d, 1.0), stone, mat);
      } else {
        B.ring(cx, cz, w, d, ROOF_T, y, h, stone, mat, c % 2 ? 0.5 : 0);
      }
      y += h; c++;
      w -= 2 * ROOF_STEP; d -= 2 * ROOF_STEP;
      if (pyramid) continue;
      // Past the ridge the long axis stops shrinking: the roof is a hip, and
      // the ridge is what the ends of the roof leave when the sides meet.
      if (d <= ROOF_T * 2.1) w = Math.max(w, wOut - dOut + ROOF_T * 2.1);
    }
    return y;
  };
  /** Bracket courses under an eave: the wall's own courses laid proud, in the painted blue-green. */
  const brackets = (cx, cz, y0, w, d) => {
    let y = y0;
    for (const e of EAVE_BRACKET) {
      B.ring(cx, cz, w, d, WALL, y, 0.75, stone, M.SLATE, 0, () => e);
      y += 0.75;
    }
    return y;
  };
  const hall = (h) => {
    const L = hallLevels(h);
    const y0 = TERRACE_H;
    B.section(h.tag, () => {
      // The lower wall: columns with lattice doors between them along the
      // south and north fronts, solid brick at the ends. A door is masonry
      // never laid; the piers between them are the columns. Never within a
      // stone and a half of a corner.
      const doorH = 5.6, bay = 4.8, pier = 1.5;
      const doors = (x, y, z) => {
        if (!h.doors) return false;
        if (Math.abs(z - h.cz) < h.d / 2 - WALL - 0.3) return false;      // a front face only
        if (y - y0 > doorH || y - y0 < 0.0) return false;
        if (Math.abs(x) > h.w / 2 - 2.2) return false;
        const along = ((Math.abs(x) + bay / 2) % bay);
        return along > pier / 2 && along < bay - pier / 2;
      };
      B.openings(doors, () => {
        courses(y0, y0 + L.lowerTop, course, (y, ch, c) => {
          B.ring(0, h.cz, h.w, h.d, WALL, y, ch, stone, M.MADDER, c % 2 ? 0.5 : 0);
        });
      });
      // The inner ring of columns, which is what the upper storey stands on
      // in the real hall — carried down to the floor as a wall inside the
      // outer one, out of sight.
      if (h.upperIn) {
        const iw = h.w - 2 * h.upperIn, id = h.d - 2 * h.upperIn;
        courses(y0, y0 + L.skirtTop, course, (y, ch, c) => {
          B.ring(0, h.cz, iw, id, WALL, y, ch, stone, M.MADDER, c % 2 ? 0 : 0.5);
        });
      }
      brackets(0, h.cz, y0 + L.lowerTop, h.w, h.d);
      const over = EAVE_BRACKET[1] + ROOF_OVER;
      if (!h.upperIn) {
        roof(0, h.cz, y0 + L.lowerBrackets, h.w + 2 * over, h.d + 2 * over, y0 + L.roofTop, h.pyramid, M.GOLD);
        // The gilded ball on the point.
        B.pinnacle(0, h.cz, y0 + L.roofTop, 2.6, 2.4, stone * 0.7, M.GILT);
        return;
      }
      // The skirt roof, from the lower eave in to the foot of the upper wall.
      const iw = h.w - 2 * h.upperIn, id = h.d - 2 * h.upperIn;
      {
        const rise = ROOF_STEP * ROOF_SLOPE;
        let y = y0 + L.lowerBrackets, w = h.w + 2 * over, d = h.d + 2 * over, c = 0;
        while (d > id + ROOF_T * 0.5 && y < y0 + L.skirtTop - 0.01) {
          const hh = Math.min(rise, y0 + L.skirtTop - y);
          B.ring(0, h.cz, w, d, ROOF_T, y, hh, stone, M.GOLD, c % 2 ? 0.5 : 0);
          y += hh; c++; w -= 2 * ROOF_STEP; d -= 2 * ROOF_STEP;
        }
      }
      // The upper wall, on the inner columns, with the small windows of the
      // clerestory, then its brackets and the main roof.
      const clere = (x, y, z) => Math.abs(z - h.cz) > id / 2 - WALL - 0.3 && Math.abs(x) < iw / 2 - 2.2
        && y - (y0 + L.skirtTop) > 0.6 && y - (y0 + L.skirtTop) < h.upperH - 0.6
        && ((Math.abs(x) + bay / 2) % bay) > 1.6 && ((Math.abs(x) + bay / 2) % bay) < bay - 1.6;
      B.openings(clere, () => {
        courses(y0 + L.skirtTop, y0 + L.upperTop, course, (y, ch, c) => {
          B.ring(0, h.cz, iw, id, WALL, y, ch, stone, M.MADDER, c % 2 ? 0.5 : 0);
        });
      });
      brackets(0, h.cz, y0 + L.upperTop, iw, id);
      roof(0, h.cz, y0 + L.upperBrackets, iw + 2 * over, id + 2 * over, y0 + L.roofTop, false, M.GOLD);
      // The ridge ornaments: the chiwen at either end of the ridge.
      const ridgeHalf = (iw - id) / 2;
      for (const sx of [-1, 1]) B.pinnacle(sx * ridgeHalf * 0.9, h.cz, y0 + L.roofTop, 1.8, 1.4, stone * 0.7, M.GOLD);
    });
  };
  for (const h of HALLS) hall(h);

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen in the door bays of the three halls, a step inside
 * the wall plane with the lattice doors open; machine guns at the corners of
 * the upper terrace; snipers on the skirt roofs of the two great halls, where
 * the eave hides them; anti-tank teams on the south edge of the terrace over
 * the courtyard the guns will come from; mortars on the north block behind
 * the Hall of Preserving Harmony, where nothing is over them.
 */
export function populateForbidden(g, origin, groundY) {
  const K = FORBIDDEN;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const T = K.terrace;
  const deck = T.h + 0.5;

  // In the doors, south and north fronts, both great halls and the pavilion.
  for (const h of K.halls) {
    const n = h.tag === 'central' ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (h.w / (n + 1));
      for (const sz of [-1, 1]) {
        if (h.tag === 'preserving' && sz < 0 && i % 2) continue;
        g.place(i % 3 === 1 ? 'mg' : 'rifleman', V(x, deck, h.cz + sz * (h.d / 2 - h.wall - 0.8)),
          sz > 0 ? 0 : Math.PI, 7, { cover: 'window' });
      }
    }
  }
  // Snipers on the skirt roofs of the two double-eaved halls, at the corners.
  for (const h of K.halls) {
    if (h.tag === 'central') continue;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.place('sniper', V(sx * (h.w / 2 + 1.2 * S), h.lowerTop + 1.5 * S + 0.4, h.cz + sz * (h.d / 2 + 1.2 * S)),
          Math.atan2(sx, sz), 8, { cover: 'roof' });
      }
    }
  }
  // Machine guns and AT teams round the edge of the top tier.
  const inset = T.step * (T.tiers - 1) + 2.6;
  const south = T.parts[0], north = T.parts[2];
  const sFront = south.cz + south.d / 2 - inset;
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * ((south.w - 2 * inset) / 6.5);
    g.place(i % 2 ? 'at' : 'mg', V(x, deck, sFront), 0, 8, { cover: 'roof' });
  }
  for (const sx of [-1, 1]) {
    g.place('at', V(sx * (south.w / 2 - inset), deck, south.cz), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 8, { cover: 'roof' });
    g.place('mg', V(sx * (north.w / 2 - inset), deck, north.cz), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 8, { cover: 'roof' });
  }
  // Mortars behind the Hall of Preserving Harmony, on the north block.
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 26;
    g.place('mortar', V(x, deck, north.cz - north.d / 2 + inset + 6), Math.PI, 9, { cover: 'roof' });
  }
}
