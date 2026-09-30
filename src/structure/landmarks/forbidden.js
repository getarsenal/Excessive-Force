import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Forbidden City, Beijing: the Three Great Halls on their terrace, in the
 * court the galleries close round them.
 *
 * Reference figures (Palace Museum survey; Liang Sicheng, "A Pictorial History
 * of Chinese Architecture"):
 *   the terrace            the 工-shaped three-tier white marble platform,
 *                          about 230 m north to south, 130 m across the wide
 *                          ends, 8.13 m high, balustraded on every tier, with
 *                          a dragon-head spout under every baluster post
 *   Hall of Supreme Harmony (Taihedian)   64 × 37 m in plan, 26.9 m from the
 *                          terrace to the ridge, double-eaved hip roof of
 *                          yellow glazed tile on seventy-two red columns
 *   Hall of Central Harmony (Zhonghedian)  a 24 m square pavilion, single
 *                          pyramidal roof under a gilded ball, about 19 m
 *   Hall of Preserving Harmony (Baohedian) 50 × 25 m, double-eaved
 *                          gable-and-hip roof, about 29 m
 *   the court              closed by single-storey galleries east, west and
 *                          north, the Gate of Supreme Harmony's range to the
 *                          south, and on the east and west galleries the two
 *                          pavilions, Tirenge and Hongyige
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
 * What makes it read as itself, and what the first version did not have:
 *   the roof's curve — steep at the ridge and flattening to a wide eave, the
 *   hips picked out in darker ridge tile, the corners of the eave turned up,
 *   and the glaze laid in alternating rows so the tile reads as tile;
 *   the painted beam under the eave, blue-green, and the red columns standing
 *   proud of the lattice doors between them, on a marble plinth;
 *   the stairs up the south face climbing *to* the halls, the balusters, and
 *   the spouts;
 *   and the court: grey paving to the galleries, which are red under yellow
 *   like everything else in the palace, so the halls stand in a place rather
 *   than on a plate in a field.
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
const BALUSTRADE = { h: 1.0, t: 0.6 };
const STAIR_RUN = TERRACE_H * 1.7;            // how far the south flights reach into the court

const WALL = 1.0;                             // a hall's wall, columns and brick between
const BAY = 4.8, PIER = 1.5, DOOR_H = 5.6;    // the column rhythm of every front
const BEAM_H = 0.8;                           // the painted architrave under the brackets
const EAVE_BRACKET = [1.2, 2.4];              // how far each bracket course stands proud
const BRACKET_H = 0.7;
const ROOF_OVER = 1.4;                        // the eave past the bracket's outer face
const ROOF_T = 2.4;                           // a roof ring's thickness, horizontal
const ROOF_STEP = 1.45;                       // how far a roof course steps in on the one below
const PLINTH = { h: 1.1, out: 2.2 };          // the marble xumizuo each hall stands in

/**
 * The curve of a Chinese roof, as the rise of each course.
 *
 * A straight pitch is a Western roof. The rafters of a hall are laid on
 * purlins that step down more steeply the higher they are (juzhe), so the
 * roof is steep at the ridge and nearly flat at the eave — a concave sweep.
 * At the resolution of a stone that is a stack of rings stepping in by the
 * same amount and rising by more each time.
 */
function roofCourses(halfShort) {
  const n = Math.max(2, Math.ceil((halfShort - ROOF_T * 1.05) / ROOF_STEP) + 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = n > 1 ? i / (n - 1) : 1;
    const slope = 0.26 + 0.86 * Math.pow(p, 1.5);
    out.push(ROOF_STEP * slope);
  }
  return out;
}
const roofRise = (halfShort) => roofCourses(halfShort).reduce((a, b) => a + b, 0);

/**
 * The halls, south to north. `lowerH` is the column height to the first
 * eave, `upperIn` how far the upper wall of a double-eaved hall stands
 * inside the lower, `upperH` its height; `pyramid` closes the roof on a
 * point rather than a ridge.
 */
const HALLS = [
  { tag: 'supreme', cx: 0, cz: 52.0, w: 64.0, d: 37.0, lowerH: 9.4, upperIn: 3.5, upperH: 2.8, doors: true },
  { tag: 'central', cx: 0, cz: -8.0, w: 24.0, d: 24.0, lowerH: 8.5, upperIn: 0, upperH: 0, pyramid: true, doors: true },
  { tag: 'preserving', cx: 0, cz: -60.0, w: 50.0, d: 25.0, lowerH: 8.8, upperIn: 3.0, upperH: 2.6, doors: true },
];

/** The heights a hall's parts land at, from the floor it stands on. */
function hallLevels(h) {
  const bracketH = BRACKET_H * EAVE_BRACKET.length;
  const lowerTop = h.lowerH;
  const lowerBrackets = lowerTop + bracketH;
  const over = EAVE_BRACKET[1] + ROOF_OVER;
  if (!h.upperIn) {
    const halfOut = Math.min(h.w, h.d) / 2 + over;
    return { lowerTop, lowerBrackets, roofBase: lowerBrackets, roofTop: lowerBrackets + roofRise(halfOut), halfOut };
  }
  // The skirt roof steps in from the lower eave to the foot of the upper wall,
  // shallow all the way: it is the flattest part of the curve.
  const skirtOut = h.d / 2 + over;
  const skirtIn = h.d / 2 - h.upperIn;
  const skirtN = Math.max(1, Math.ceil((skirtOut - skirtIn) / ROOF_STEP));
  const skirtTop = lowerBrackets + skirtN * ROOF_STEP * 0.34;
  const upperTop = skirtTop + h.upperH;
  const upperBrackets = upperTop + bracketH;
  const halfOut = skirtIn + over;
  return { lowerTop, lowerBrackets, skirtTop, skirtN, upperTop, upperBrackets,
    roofBase: upperBrackets, roofTop: upperBrackets + roofRise(halfOut), halfOut };
}

// Where the garrison stands in a hall's front, so the doors they stand in
// are left open and the rest get their lattice.
function doorPosts(h) {
  const n = h.tag === 'central' ? 2 : 4;
  const out = [];
  for (let i = 0; i < n; i++) out.push(h.cx + (i - (n - 1) / 2) * (h.w / (n + 1)));
  return out;
}

// The posts on the edge of the top tier, real metres, where the garrison
// stands behind the balustrade: the builder leaves the baluster posts out
// there, so a man stepping up to the rail has rail to stand on and not a post.
const EDGE_INSET = TIER_STEP * (TIERS - 1) + 2.3;
const EDGE_POSTS = (() => {
  const south = TERRACE_PARTS[0], north = TERRACE_PARTS[2];
  const out = [];
  const sFront = south.cz + south.d / 2 - EDGE_INSET;
  for (let i = 0; i < 6; i++) out.push({ x: (i - 2.5) * ((south.w - 2 * EDGE_INSET) / 6.5), z: sFront, yaw: 0, kind: i % 2 ? 'at' : 'mg' });
  for (const sx of [-1, 1]) {
    const yaw = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    out.push({ x: sx * (south.w / 2 - EDGE_INSET), z: south.cz, yaw, kind: 'at' });
    out.push({ x: sx * (north.w / 2 - EDGE_INSET), z: north.cz, yaw, kind: 'mg' });
  }
  return out;
})();
const nearEdgePost = (x, z) => EDGE_POSTS.some((p) => Math.hypot(p.x - x, p.z - z) < 5.0);

const supreme = HALLS[0];
const supremeTop = TERRACE_H + PLINTH.h + hallLevels(supreme).roofTop;

// The court, real metres from the origin: galleries on its edges.
const COURT = {
  x: 108,              // the east and west galleries' centre lines
  zN: -132,            // the north gallery
  zS: 198,             // the south range, with the gate in it
  depth: 10,           // a gallery front to back
  wallH: 6.2,
  gate: 24,            // the half-width of the gate passage through the south range
  pavilionZ: 40,       // Tirenge and Hongyige, on the east and west galleries
};

/** What the garrison, the flag and the level record read (world metres). */
export const FORBIDDEN = {
  scale: S,
  terrace: { h: TERRACE_H * S, tiers: TIERS, step: TIER_STEP * S,
    parts: TERRACE_PARTS.map((p) => ({ cz: p.cz * S, w: p.w * S, d: p.d * S })) },
  halls: HALLS.map((h) => {
    const L = hallLevels(h);
    return { tag: h.tag, cz: h.cz * S, w: h.w * S, d: h.d * S, wall: WALL * S,
      floor: (TERRACE_H + PLINTH.h) * S,
      lowerTop: (PLINTH.h + L.lowerTop) * S, skirtTop: (PLINTH.h + (L.skirtTop ?? L.lowerBrackets)) * S,
      roofTop: (PLINTH.h + L.roofTop) * S, doorH: DOOR_H * S,
      posts: doorPosts(h).map((x) => x * S) };
  }),
  /** Rooflines a man can be posted on, low to high. */
  galleries: [TERRACE_H * S, (TERRACE_H + PLINTH.h + hallLevels(HALLS[0]).lowerBrackets) * S],
  court: { x: COURT.x * S, zN: COURT.zN * S, zS: COURT.zS * S, depth: COURT.depth * S, wallH: COURT.wallH * S },
  flag: { x: 0, y: (supremeTop + 0.6) * S, z: supreme.cz * S },
  edgePosts: EDGE_POSTS.map((p) => ({ ...p, x: p.x * S, z: p.z * S })),
};

/**
 * The pieces every hall and gallery is made of, over one BlockList: the
 * red wall with its columns, the painted beam and brackets, and the curved
 * roof with its hips, ridge and upturned corners.
 */
function kit(B, stone, course) {
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  // Columns proud of the wall every bay, on both fronts and both ends.
  const columns = (cx, cz, w, d) => (x, z) => {
    const onX = Math.abs(Math.abs(z - cz) - d / 2) < WALL;       // a long front
    const t = onX ? Math.abs(x - cx) : Math.abs(z - cz);
    const along = (t + BAY / 2) % BAY;
    return (along < PIER / 2 || along > BAY - PIER / 2) ? 0.35 : 0;
  };
  /** The painted beam course and the bracket courses corbelling out over it. */
  const beamAndBrackets = (cx, cz, w, d, y0) => {
    B.ring(cx, cz, w, d, WALL, y0, BEAM_H, stone, M.BEAM, 0, () => 0.2);
    let y = y0 + BEAM_H;
    for (const e of EAVE_BRACKET) {
      B.ring(cx, cz, w, d, WALL, y, BRACKET_H, stone, M.BEAM, 0.5, () => e);
      y += BRACKET_H;
    }
    return y;
  };
  /**
   * A roof ring stack from the eave to the ridge: the curve, alternating
   * glaze rows, the hips in ridge tile, the corners turned up, the ridge
   * and its ornaments. Returns the height it closed at.
   */
  const roof = (cx, cz, y0, wOut, dOut, pyramid, chiwen = true) => {
    const rises = roofCourses(Math.min(wOut, dOut) / 2);
    let y = y0, w = wOut, d = dOut;
    for (let c = 0; c < rises.length; c++) {
      const h = rises[c];
      const closes = Math.min(w, d) <= ROOF_T * 2.1 || c === rises.length - 1;
      if (closes) {
        // The ridge: a solid course along the long axis, or the apex, in the
        // darker ridge tile.
        B.slab(cx, y + h / 2, cz, Math.max(w, 1.0), h, Math.max(d, 1.0), stone, M.RIDGE);
        y += h;
        if (pyramid) {
          B.pinnacle(cx, cz, y, 2.6, 2.4, stone * 0.7, M.GILT);
        } else if (chiwen) {
          // The chiwen: the dragon-fish at either end of the ridge.
          const half = Math.max(w, d) / 2 - 0.8;
          const alongX = w >= d;
          for (const s of [-1, 1]) {
            B.pinnacle(cx + (alongX ? s * half : 0), cz + (alongX ? 0 : s * half), y, 2.4, 1.6, stone * 0.7, M.RIDGE);
          }
        }
        return y;
      }
      B.ring(cx, cz, w, d, ROOF_T, y, h, stone, c % 2 ? M.GLAZE : M.GOLD, c % 2 ? 0.5 : 0);
      // The hips: a cap of ridge tile on the corner the next course leaves
      // bare, so the four hips run up the roof as dark lines.
      const cap = ROOF_STEP * 0.92;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const hx = cx + sx * (w / 2 - cap / 2), hz = cz + sz * (d / 2 - cap / 2);
        B.add(hx, y + h + 0.2, hz, B.shrink(cap / 2), 0.2, B.shrink(cap / 2), M.RIDGE);
        // The eave's corners turned up: two more caps on the lowest course.
        if (c === 0) {
          B.add(hx, y + h + 0.6, hz, B.shrink(cap / 2) * 0.8, 0.2, B.shrink(cap / 2) * 0.8, M.RIDGE);
          B.add(hx, y + h + 1.0, hz, B.shrink(cap / 2) * 0.55, 0.2, B.shrink(cap / 2) * 0.55, M.RIDGE);
        }
      }
      y += h;
      w -= 2 * ROOF_STEP; d -= 2 * ROOF_STEP;
      if (!pyramid) {
        // Past the ridge the long axis stops shrinking: a hip roof, and the
        // ridge is what the ends leave when the sides meet.
        if (d <= ROOF_T * 2.1) w = Math.max(w, wOut - dOut + ROOF_T * 2.1);
        if (w <= ROOF_T * 2.1) d = Math.max(d, dOut - wOut + ROOF_T * 2.1);
      }
    }
    return y;
  };
  return { courses, columns, beamAndBrackets, roof };
}

export function buildForbidden(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.1 * s;
  const course = 0.9 * s;
  const K = kit(B, stone, course);
  const { courses } = K;

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
        // Big paving slabs: the terrace is fill, and every stone of it is a
        // stone the phone carries for a thing nobody can shoot down.
        for (const p of [south, north]) B.slab(0, y + ch / 2, p.cz, p.w, ch, p.d, stone * 6, M.MARBLE);
        const z0 = north.cz + north.d / 2, z1 = south.cz - south.d / 2;
        if (z1 - z0 > 0.5) B.slab(0, y + ch / 2, (z0 + z1) / 2, waist.w, ch, z1 - z0, stone * 6, M.MARBLE);
      });
      // The balustrade round the tier's edge, on the outline of the 工: a
      // plinth course whose stones jut out under every post as the dragon-
      // head spouts, a rail course, and the posts standing on the rail.
      const by = y0 + tierH;
      const z0 = north.cz + north.d / 2, z1 = south.cz - south.d / 2;
      const outline = [
        [-south.w / 2, south.cz + south.d / 2], [south.w / 2, south.cz + south.d / 2],
        [south.w / 2, z1], [waist.w / 2, z1], [waist.w / 2, z0], [north.w / 2, z0],
        [north.w / 2, north.cz - north.d / 2], [-north.w / 2, north.cz - north.d / 2],
        [-north.w / 2, z0], [-waist.w / 2, z0], [-waist.w / 2, z1], [-south.w / 2, z1],
      ].map(([x, z]) => [x * (1 - BALUSTRADE.t / Math.abs(x)), z]);
      const unit = stone * 2.4;
      const every = (x, z, k) => (Math.round(x / unit) + Math.round(z / unit)) % k === 0;
      // The stair bays: the balustrade stops where the three flights land.
      const gap = (x, z) => Math.abs(z - (south.cz + south.d / 2)) < 2.0 && Math.abs(x) < 15.0;
      B.openings((x, _y, z) => gap(x, z), () => {
        B.polyRing(0, 0, outline, BALUSTRADE.t, by, BALUSTRADE.h * 0.45, unit, M.MARBLE, 0,
          (x, z) => (every(x, z, 2) ? 0.7 : 0));
        B.polyRing(0, 0, outline, BALUSTRADE.t, by + BALUSTRADE.h * 0.45, BALUSTRADE.h * 0.55, unit, M.MARBLE, 1);
      });
      B.openings((x, _y, z) => gap(x, z) || !every(x, z, 2) || (t === TIERS - 1 && nearEdgePost(x, z)), () => {
        B.polyRing(0, 0, outline, BALUSTRADE.t * 0.8, by + BALUSTRADE.h, 0.55, unit, M.MARBLE, 0);
      });
    }
    // The three flights up the south face, climbing to the top tier: each
    // course reaches from the terrace face out into the court, shorter than
    // the one below it, so the steps rise toward the halls and every stone
    // stands on stone. The middle flight is the imperial way, the widest.
    const face = (y) => TERRACE_PARTS[0].cz + TERRACE_PARTS[0].d / 2
      - Math.min(TIERS - 1, Math.floor(y / (TERRACE_H / TIERS))) * TIER_STEP;
    for (const fx of [-10.0, 0, 10.0]) {
      const fw = fx === 0 ? 9.0 : 5.5;
      courses(0, TERRACE_H, course, (y, ch) => {
        const back = face(y + ch / 2);
        const front = face(0) + STAIR_RUN * (1 - (y + ch) / TERRACE_H) + 0.9;
        if (front - back < 0.6) return;
        B.slab(fx, y + ch / 2, (back + front) / 2, fw, ch, front - back, stone * 1.6, M.MARBLE);
      });
    }
  });

  // ── A hall on its plinth.
  const hall = (h) => {
    const L = hallLevels(h);
    const y0 = TERRACE_H + PLINTH.h;
    const cx = h.cx;
    B.section(h.tag, () => {
      // The xumizuo: a marble plinth round the hall, the red walls inside it.
      B.ring(cx, h.cz, h.w + 2 * PLINTH.out, h.d + 2 * PLINTH.out, PLINTH.out + WALL, TERRACE_H, PLINTH.h,
        stone, M.MARBLE);
      B.slab(cx, TERRACE_H + PLINTH.h / 2, h.cz, h.w - 2 * WALL, PLINTH.h, h.d - 2 * WALL, stone * 3, M.MARBLE);
      // The lower wall: columns proud of it, with the door bays between them
      // along the south and north fronts. A door is masonry never laid; the
      // piers are the columns. Never within a stone and a half of a corner.
      const posts = doorPosts(h);
      const isDoor = (x, y, z) => {
        if (!h.doors) return false;
        if (Math.abs(z - h.cz) < h.d / 2 - WALL - 0.3) return false;      // a front face only
        if (y - y0 > DOOR_H || y - y0 < 0.0) return false;
        if (Math.abs(x - cx) > h.w / 2 - 2.2) return false;
        const along = ((Math.abs(x - cx) + BAY / 2) % BAY);
        return along > PIER / 2 && along < BAY - PIER / 2;
      };
      B.openings(isDoor, () => {
        courses(y0, y0 + L.lowerTop - BEAM_H, course, (y, ch, c) => {
          B.ring(cx, h.cz, h.w, h.d, WALL, y, ch, stone, M.MADDER, c % 2 ? 0.5 : 0, K.columns(cx, h.cz, h.w, h.d));
        });
      });
      // The lattice doors, a step inside the column line, in every bay but
      // the ones the garrison stands in.
      if (h.doors) {
        const half = Math.floor((h.w / 2 - 2.2) / BAY + 0.5);
        for (let k = -half; k <= half; k++) {
          const bx = cx + k * BAY;
          if (Math.abs(bx - cx) > h.w / 2 - 2.2 - BAY / 2 + 0.1) continue;
          if (posts.some((p) => Math.abs(p - bx) < BAY * 0.6)) continue;
          for (const sz of [-1, 1]) {
            const z = h.cz + sz * (h.d / 2 - WALL * 0.7);
            B.slab(bx, y0 + DOOR_H / 2, z, BAY - PIER - 0.1, DOOR_H, 0.28, stone * 1.4, M.LATTICE);
          }
        }
      }
      // The inner ring of columns, which is what the upper storey stands on
      // in the real hall — carried down to the floor as a wall inside the
      // outer one, out of sight.
      if (h.upperIn) {
        const iw = h.w - 2 * h.upperIn, id = h.d - 2 * h.upperIn;
        courses(y0, y0 + L.skirtTop, course, (y, ch, c) => {
          B.ring(cx, h.cz, iw, id, WALL, y, ch, stone, M.MADDER, c % 2 ? 0 : 0.5);
        });
      }
      K.beamAndBrackets(cx, h.cz, h.w, h.d, y0 + L.lowerTop - BEAM_H);
      const over = EAVE_BRACKET[1] + ROOF_OVER;
      if (!h.upperIn) {
        K.roof(cx, h.cz, y0 + L.lowerBrackets, h.w + 2 * over, h.d + 2 * over, h.pyramid);
        return;
      }
      // The skirt roof, from the lower eave in to the foot of the upper wall:
      // the shallow outer sweep of the curve, its corners turned up.
      const iw = h.w - 2 * h.upperIn, id = h.d - 2 * h.upperIn;
      {
        const rise = ROOF_STEP * 0.34;
        let y = y0 + L.lowerBrackets, w = h.w + 2 * over, d = h.d + 2 * over;
        for (let c = 0; c < L.skirtN && d > id + ROOF_T * 0.5; c++) {
          B.ring(cx, h.cz, w, d, ROOF_T, y, rise, stone, c % 2 ? M.GLAZE : M.GOLD, c % 2 ? 0.5 : 0);
          const cap = ROOF_STEP * 0.92;
          for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const hx = cx + sx * (w / 2 - cap / 2), hz = h.cz + sz * (d / 2 - cap / 2);
            B.add(hx, y + rise + 0.2, hz, B.shrink(cap / 2), 0.2, B.shrink(cap / 2), M.RIDGE);
            if (c === 0) {
              B.add(hx, y + rise + 0.6, hz, B.shrink(cap / 2) * 0.8, 0.2, B.shrink(cap / 2) * 0.8, M.RIDGE);
              B.add(hx, y + rise + 1.0, hz, B.shrink(cap / 2) * 0.55, 0.2, B.shrink(cap / 2) * 0.55, M.RIDGE);
            }
          }
          y += rise; w -= 2 * ROOF_STEP; d -= 2 * ROOF_STEP;
        }
      }
      // The upper wall, on the inner columns, with the small windows of the
      // clerestory, then its beam and brackets and the main roof.
      const clere = (x, y, z) => Math.abs(z - h.cz) > id / 2 - WALL - 0.3 && Math.abs(x - cx) < iw / 2 - 2.2
        && y - (y0 + L.skirtTop) > 0.6 && y - (y0 + L.skirtTop) < h.upperH - 0.6
        && ((Math.abs(x - cx) + BAY / 2) % BAY) > 1.6 && ((Math.abs(x - cx) + BAY / 2) % BAY) < BAY - 1.6;
      B.openings(clere, () => {
        courses(y0 + L.skirtTop, y0 + L.upperTop - BEAM_H, course, (y, ch, c) => {
          B.ring(cx, h.cz, iw, id, WALL, y, ch, stone, M.MADDER, c % 2 ? 0.5 : 0);
        });
      });
      K.beamAndBrackets(cx, h.cz, iw, id, y0 + L.upperTop - BEAM_H);
      K.roof(cx, h.cz, y0 + L.upperBrackets, iw + 2 * over, id + 2 * over, false);
    });
  };
  for (const h of HALLS) hall(h);

  B.scaleAll(S);
  return B;
}

/**
 * The court: the galleries round the Three Great Halls, red walls under
 * yellow roofs, and the two pavilions on the side galleries. Scenery — it
 * scores nothing and holds nobody — laid in big stones, because it is a
 * frame for the halls and every stone of it is a stone the phone simulates.
 * Founded a couple of metres down so the ground's small falls across four
 * hundred metres of court never show daylight under a wall.
 */
export function buildForbiddenCourt(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 3.6 * s;
  const course = 2.0 * s;
  const K = kit(B, stone, course);
  const C = COURT;
  const FOUND = -1.4;
  const over = 1.6;

  // A gallery: a long red box, open to the court on its inner face between
  // the columns, a beam, and a low hipped roof.
  const gallery = (cx, cz, w, d, inner, cut = null) => {
    const open = (x, y, z) => {
      if (cut && cut(x, z)) return true;
      if (y < 0.2 || y > C.wallH - 1.6) return false;
      const onInner = inner === 'x'
        ? Math.abs(x - (cx - Math.sign(cx) * w / 2)) < WALL * 1.2 && Math.abs(z - cz) < d / 2 - 3
        : Math.abs(z - (cz - Math.sign(cz) * d / 2)) < WALL * 1.2 && Math.abs(x - cx) < w / 2 - 3;
      if (!onInner) return false;
      const t = inner === 'x' ? z : x;
      const along = ((Math.abs(t) + BAY) % (BAY * 2));
      return along > PIER && along < BAY * 2 - PIER;
    };
    B.openings(open, () => {
      K.courses(FOUND, C.wallH - BEAM_H, course, (y, ch, c) => {
        B.ring(cx, cz, w, d, WALL, y, ch, stone, M.MADDER, c % 2 ? 0.5 : 0);
      });
    });
    B.openings((x, _y, z) => !!(cut && cut(x, z)), () => {
      B.ring(cx, cz, w, d, WALL, C.wallH - BEAM_H, BEAM_H, stone, M.BEAM, 0, () => 0.2);
      K.roof(cx, cz, C.wallH, w + 2 * over, d + 2 * over, false, false);
    });
  };
  const PAV = { z: C.pavilionZ, w: C.depth + 12, d: 30 };
  const atPavilion = (z) => Math.abs(z - PAV.z) < PAV.d / 2 + 0.4;
  B.section('court', () => {
    const len = C.zS - C.zN;
    // East and west, the full length, cut where the pavilions stand; north
    // and south between them.
    for (const sx of [-1, 1]) {
      gallery(sx * C.x, (C.zN + C.zS) / 2, C.depth, len + C.depth, 'x', (_x, z) => atPavilion(z));
    }
    const inner = C.x * 2 - C.depth;
    gallery(0, C.zN, inner - 0.2, C.depth, 'z');
    // The south range, cut through for the gate and the piers either side.
    gallery(0, C.zS, inner - 0.2, C.depth, 'z', (x) => Math.abs(x) < C.gate + 5.2);
    for (const sx of [-1, 1]) {
      K.courses(FOUND, C.wallH + 2.5, course, (y, ch, c) => {
        B.ring(sx * (C.gate + 2.5), C.zS, 5, C.depth + 2, WALL * 1.6, y, ch, stone, M.MADDER, c % 2 ? 0.5 : 0);
      });
    }
    // Tirenge and Hongyige: two-storey pavilions standing in the east and
    // west galleries, facing each other across the court.
    for (const sx of [-1, 1]) {
      const cx = sx * C.x, cz = PAV.z, w = PAV.w, d = PAV.d;
      K.courses(FOUND, C.wallH + 6.5 - BEAM_H, course, (y, ch, c) => {
        B.ring(cx, cz, w, d, WALL, y, ch, stone, M.MADDER, c % 2 ? 0.5 : 0, K.columns(cx, cz, w, d));
      });
      K.beamAndBrackets(cx, cz, w, d, C.wallH + 6.5 - BEAM_H);
      K.roof(cx, cz, C.wallH + 6.5 + BRACKET_H * 2, w + 2 * (EAVE_BRACKET[1] + ROOF_OVER),
        d + 2 * (EAVE_BRACKET[1] + ROOF_OVER), false);
    }
  });

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

  // In the open doors, south and north fronts, both great halls and the pavilion.
  for (const h of K.halls) {
    h.posts.forEach((x, i) => {
      for (const sz of [-1, 1]) {
        if (h.tag === 'preserving' && sz < 0 && i % 2) continue;
        g.place(i % 3 === 1 ? 'mg' : 'rifleman', V(x, h.floor + 0.5, h.cz + sz * (h.d / 2 - h.wall - 0.8)),
          sz > 0 ? 0 : Math.PI, 7, { cover: 'window' });
      }
    });
  }
  // Snipers on the skirt roofs of the two double-eaved halls, at the corners.
  for (const h of K.halls) {
    if (h.tag === 'central') continue;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.place('sniper', V(sx * (h.w / 2 + 1.2 * S), h.lowerTop + 2.2 * S + 0.4, h.cz + sz * (h.d / 2 + 1.2 * S)),
          Math.atan2(sx, sz), 8, { cover: 'roof' });
      }
    }
  }
  // Machine guns and AT teams round the edge of the top tier, where the
  // builder left the balustrade's posts out for them.
  for (const p of K.edgePosts) g.place(p.kind, V(p.x, deck, p.z), p.yaw, 8, { cover: 'roof' });
  const inset = EDGE_INSET * S;
  const north = T.parts[2];
  // Mortars behind the Hall of Preserving Harmony, on the north block.
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 26;
    g.place('mortar', V(x, deck, north.cz - north.d / 2 + inset + 6), Math.PI, 9, { cover: 'roof' });
  }
}
