import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Borobudur, Magelang.
 *
 * Reference figures (Balai Konservasi Borobudur; the UNESCO nomination):
 *   plan         123 x 123 m over the processional foot, 118 x 118 at the
 *                first balustrade; the corners of every square terrace are
 *                indented twice, so the plan is a twenty-sided square
 *   height       35 m to the crown of the central stupa as it stands; about
 *                42 m with the chattra it has lost
 *   terraces     six square galleries, each about 3.5 m over the last and
 *                five to six metres in from it, walled by a relief wall on
 *                the inside and a balustrade on the outside; then three
 *                round terraces, about 51, 38 and 26 m across, each a metre
 *                and a half over the last
 *   stupas       seventy-two perforated bells, 32 + 24 + 16, three and a half
 *                to four metres tall; the central stupa 9.9 m across, 16 m
 *                to where the chattra stood
 *   stairs       one up the middle of every side, through the balustrades
 *
 * It is a mountain, and the most literal one in the campaign: Borobudur is a
 * natural hill that was cut to terraces and skinned in andesite. Nothing
 * topples, the galleries are retaining walls, and a hole in the skin shows
 * the packed fill the hill is actually made of. What scores is what stands
 * on the hill rather than the hill itself: the three round terraces, the
 * seventy-two bells, and the crown. The twist the player has to find is that
 * the skin is not the mass — the terraces are a stone shell on a rubble
 * core, and cutting the core out from under the top square terrace drops the
 * round terraces and everything on them without a shell ever landing on a
 * stupa.
 */

// Twice life. At 1:1 the whole monument is thirty-five metres tall and reads
// as a car park from the camera distance the game plays at.
const S = 2.0;

// Real metres, scaled once at the end.
//
// `half` is the outer face of a terrace's wall along the middle of a side;
// `top` is the height of the gallery floor the wall carries. The corners are
// indented by `D1` and then `D2` — the twenty-sided plan — at fixed depths, so
// the galleries keep their width round the corners.
const FOOT = { half: 61.5, top: 1.5 };
const TERRACES = [
  { half: 56.5, top: 4.9 },
  { half: 51.0, top: 8.3 },
  { half: 45.5, top: 11.7 },
  { half: 40.0, top: 15.1 },
  { half: 34.5, top: 18.5 },
];
const D1 = 3.4, D2 = 7.4;
const Q1 = 0.30, Q2 = 0.62;           // where each side steps, as a fraction of the half-width
const WALL = 1.6;                     // the andesite skin
const PARAPET = { h: 1.6, t: 1.2, in: 0.3 };
const STAIR = { w: 4.0, nose: 1.0 };
const ROUND = [
  { r: 25.5, top: 20.0, n: 32 },
  { r: 19.0, top: 21.5, n: 24 },
  { r: 12.5, top: 23.0, n: 16 },
];
const BELL = { plinth: 3.6, plinthH: 0.6, r: 1.5, h: 2.0, spire: 1.2 };
const CENTRAL = { r: 5.0, plinth: 12.0, plinthH: 1.0, bellH: 7.0, spireW: 3.0, spireH: 5.0, finial: 4.0 };
const CROWN = ROUND[2].top + CENTRAL.plinthH + CENTRAL.bellH + CENTRAL.spireH + CENTRAL.finial;

/** What the garrison, the flag and the level record read. */
export const BOROBUDUR = {
  scale: S,
  plan: { w: FOOT.half * 2 * S, d: FOOT.half * 2 * S, h: CROWN * S },
  foot: { half: FOOT.half * S, top: FOOT.top * S },
  /** The gallery floors, low to high: outer face of the wall under each, and its height. */
  galleries: TERRACES.map((t) => ({ half: t.half * S, top: t.top * S })),
  round: ROUND.map((r) => ({ r: r.r * S, top: r.top * S, n: r.n })),
  parapet: { h: PARAPET.h * S, in: (PARAPET.in + PARAPET.t) * S },
  stairW: STAIR.w * S,
  flag: { x: 0, y: (CROWN + 1.0) * S, z: 0 },
};

/**
 * The twenty-sided plan of a square terrace of half-width `a`, inset by `t`.
 *
 * Every edge is along x or z, walked counter-clockwise in the x-z plane. The
 * inset moves every edge inward by `t`, which for a rectilinear outline is
 * the same as taking `t` off every coordinate — so the same function gives
 * the outer face, the skin's centreline and the fill inside it.
 */
function stepped(a, t) {
  const q1 = Q1 * a - t, q2 = Q2 * a - t;
  const x0 = a - t, x1 = a - D1 - t, x2 = a - D2 - t;
  const side = [[x2, -x2], [x2, -q2], [x1, -q2], [x1, -q1], [x0, -q1], [x0, q1], [x1, q1], [x1, q2], [x2, q2]];
  const pts = [];
  for (let k = 0; k < 4; k++) {
    for (const [x, z] of side) {
      // Rotate a quarter turn each side.
      let px = x, pz = z;
      for (let r = 0; r < k; r++) { const nx = -pz, nz = px; px = nx; pz = nz; }
      pts.push([px, pz]);
    }
  }
  return pts;
}

/** The non-overlapping rectangles that tile the stepped plan inset by `t`: [cx, cz, w, d]. */
function steppedRects(a, t) {
  const q1 = Q1 * a - t, q2 = Q2 * a - t;
  const x0 = a - t, x1 = a - D1 - t, x2 = a - D2 - t;
  const out = [[0, 0, x2 * 2, x2 * 2]];
  for (const sgn of [-1, 1]) {
    out.push([sgn * (x2 + x1) / 2, 0, x1 - x2, q2 * 2]);
    out.push([sgn * (x1 + x0) / 2, 0, x0 - x1, q1 * 2]);
    out.push([0, sgn * (x2 + x1) / 2, q2 * 2, x1 - x2]);
    out.push([0, sgn * (x1 + x0) / 2, q1 * 2, x0 - x1]);
  }
  return out;
}

/**
 * One course of wall along a closed rectilinear outline, with bonded corners.
 *
 * `ring` does this for a rectangle: two walls run through the corners and
 * two stop against them, and which pair swaps every course. `polyRing` lays
 * every edge to its full length, which on a right-angled corner puts two
 * stones in the same quarter of a cubic metre — fine on a circle, where the
 * corners are shallow, and wrong on a plan with thirty-six of them. This
 * does what `ring` does for any rectilinear outline: on even courses the
 * edges along x run through and the edges along z stop short at a convex
 * corner (and start at the corner where it is re-entrant, with the through
 * edge extended past it to fill the elbow); on odd courses the reverse.
 */
export function rectRing(B, pts, wall, y, h, stone, mat, phase) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const ccw = area > 0;
  const convex = (i) => {
    const p = pts[(i - 1 + n) % n], q = pts[i], r = pts[(i + 1) % n];
    const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    return ccw ? cross > 0 : cross < 0;
  };
  const halfH = h / 2, yc = y + halfH;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const ux = dx / len, uz = dz / len;
    let nx = -uz, nz = ux;
    if (!ccw) { nx = -nx; nz = -nz; }
    const alongX = Math.abs(ux) > 0.5;
    const through = alongX === (phase % 2 === 0);
    const cvA = convex(i), cvB = convex((i + 1) % n);
    const s0 = through ? (cvA ? 0 : -wall) : (cvA ? wall : 0);
    const s1 = len + (through ? (cvB ? 0 : wall) : (cvB ? -wall : 0));
    const run = s1 - s0;
    if (run < 0.05) continue;
    const cnt = Math.max(1, Math.round(run / stone));
    const seg = run / cnt;
    for (let k = 0; k < cnt; k++) {
      const t = s0 + (k + 0.5) * seg;
      const cx = a[0] + ux * t + nx * wall / 2, cz = a[1] + uz * t + nz * wall / 2;
      B.add(cx, yc, cz,
        alongX ? B.shrink(seg / 2) : B.shrink(wall / 2), B.shrink(halfH),
        alongX ? B.shrink(wall / 2) : B.shrink(seg / 2), mat);
    }
  }
}

export function buildBorobudur(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3);
  // World sizes, then the builder's own metres: a three-metre skin stone and a
  // 2.6 m course on a phone, and a six and a half metre block of fill where
  // nobody will ever see it until the skin is off — rubble is a quarter the
  // toughness of dressed stone, so a big block of it still comes out to a
  // round.
  const stone = (2.3 * s) / S;
  const course = (2.0 * s) / S;
  const core = stone * 2.2;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  // Dark andesite. CONCRETE's grey came out of the grade as pale beige beside
  // the lawns, and Borobudur's loudest fact is that it is dark; the
  // grey-green serpentine is the darker structural grey and it is what the
  // moss-blackened stone actually looks like from the park.
  const skinMat = M.VERDE;
  const fillMat = M.RUBBLE;

  // The stairs cut the balustrade on every terrace, on the axis of each side.
  const onStair = (x, z) => Math.abs(x) < STAIR.w / 2 + 0.5 || Math.abs(z) < STAIR.w / 2 + 0.5;

  /** The hill's levels, bottom to top: the foot platform and the five galleries above it. */
  const LEVELS = [{ half: FOOT.half, y0: 0, y1: FOOT.top }];
  {
    let p = FOOT;
    for (const t of TERRACES) { LEVELS.push({ half: t.half, y0: p.top, y1: t.top }); p = t; }
  }

  // ── The hill: solid courses, the fill tiled inside the stepped outline and
  // the andesite skin round it. Each tag is one section, laid in one pass,
  // because `section` keeps one range per name.
  B.section('lower', () => {
    for (const L of LEVELS) {
      const n = Math.max(1, Math.round((L.y1 - L.y0) / course));
      courses(L.y0, L.y1, course, (y, h, c) => {
        // The top course of every level is the gallery floor, paved in the
        // skin stone: a floor of bare fill is what made the whole pile read
        // as tan from anywhere above it.
        const paved = c === n - 1;
        for (const [cx, cz, w, d] of steppedRects(L.half, WALL)) {
          if (w < 0.1 || d < 0.1) continue;
          B.slab(cx, y + h / 2, cz, w, h, d, paved ? stone * 1.8 : core, paved ? skinMat : fillMat);
        }
      });
    }
  });
  B.section('galleries', () => {
    for (const L of LEVELS) {
      courses(L.y0, L.y1, course, (y, h, c) => {
        rectRing(B, stepped(L.half, WALL / 2), WALL, y, h, stone, skinMat, c);
      });
    }
    // ── The balustrades on the lip of every gallery, and the stairs through
    // them. On the foot platform too, where the lowest one runs.
    const lips = [FOOT, ...TERRACES];
    for (const t of lips) {
      B.openings((x, _y, z) => onStair(x, z), () => {
        courses(t.top, t.top + PARAPET.h, course * 0.7, (y, h, c) => {
          rectRing(B, stepped(t.half, PARAPET.in + PARAPET.t / 2), PARAPET.t, y, h, stone * 0.8, skinMat, c);
        });
      });
    }

    // ── Four stairs, one up the middle of each side.
  //
  // A ramp of masonry with its steps cut in the top, standing against the
  // wall of the terrace it climbs and running out over the gallery floor
  // below it — which is where a stair on a stepped hill has to be. Each
  // course is a slab from the wall face out to the nose, and the nose comes
  // in as the flight rises, so every stone stands on the stone below or on
  // the gallery it starts from.
    const flights = [{ half: FOOT.half, prev: FOOT.half + 3.0, y0: 0, y1: FOOT.top }];
    let p = FOOT;
    for (const t of TERRACES) { flights.push({ half: t.half, prev: p.half, y0: p.top, y1: t.top }); p = t; }
    for (const f of flights) {
      courses(f.y0, f.y1, course, (y, h) => {
        const k = 1 - (y + h / 2 - f.y0) / (f.y1 - f.y0);
        const nose = STAIR.nose + (f.prev - f.half) * k;
        const inner = f.half + 0.02, outer = f.half + nose;
        const mid = (inner + outer) / 2, depth = outer - inner;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          B.slab(dx * mid, y + h / 2, dz * mid, dx ? depth : STAIR.w, h, dx ? STAIR.w : depth, stone, skinMat);
        }
      });
    }
  });

  // ── The three round terraces.
  //
  // A circular skin of yawed stones with concentric rings of fill inside it,
  // out to the middle: a slab clipped to a circle leaves a ragged gap round
  // its edge, and this is a floor men stand on and seventy-two stupas sit on.
  B.section('round', () => {
    let below = TERRACES[TERRACES.length - 1];
    for (const r of ROUND) {
      courses(below.top, r.top, course, (y, h, c) => {
        let rad = r.r - WALL / 2, thick = WALL, first = true;
        while (rad > core * 0.6) {
          const sides = Math.max(12, Math.round((2 * Math.PI * rad) / (first ? stone : core)));
          const rot = (c % 2) * (Math.PI / sides);
          B.polyRing(0, 0, BlockList.circle(rad, sides, rot), thick, y, h, first ? stone : core, first ? skinMat : fillMat);
          rad -= thick / 2 + core / 2;
          thick = core;
          first = false;
        }
        // What the last ring leaves open in the middle, filled as one slab.
        const hole = rad + thick / 2;
        if (hole > 0.3) B.slab(0, y + h / 2, 0, hole * 2, h, hole * 2, core, fillMat);
      });
      below = r;
    }
  });

  // ── Seventy-two bells, on the three round terraces.
  B.section('stupas', () => {
    for (const r of ROUND) {
      const ring = r.r - BELL.plinth / 2 - 1.2;
      for (let i = 0; i < r.n; i++) {
        const a = (i + 0.5) / r.n * Math.PI * 2;
        const x = Math.cos(a) * ring, z = Math.sin(a) * ring;
        let y = r.top;
        B.slab(x, y + BELL.plinthH / 2, z, BELL.plinth, BELL.plinthH, BELL.plinth, BELL.plinth, skinMat);
        y += BELL.plinthH;
        // The bell: three courses stepping in, each one stone.
        const bh = BELL.h / 3;
        for (const w of [BELL.r * 2, BELL.r * 1.8, BELL.r * 1.3]) {
          B.slab(x, y + bh / 2, z, w, bh, w, w, skinMat);
          y += bh;
        }
        B.slab(x, y + BELL.spire / 2, z, 0.9, BELL.spire, 0.9, 1.0, skinMat);
      }
    }
  });

  // ── The central stupa, which is the crown and the last thing standing.
  B.section('central', () => {
    const top = ROUND[2].top;
    B.slab(0, top + CENTRAL.plinthH / 2, 0, CENTRAL.plinth, CENTRAL.plinthH, CENTRAL.plinth, stone, skinMat);
    const y0 = top + CENTRAL.plinthH;
    // Hollow, as the real bell is: there is a chamber in it.
    B.dome(0, 0, y0, CENTRAL.bellH, CENTRAL.r, WALL * 1.3, course * 0.8, stone, skinMat,
      (t) => Math.sqrt(Math.max(0.05, 1 - t * t * 0.8)));
    const y1 = y0 + CENTRAL.bellH;
    courses(y1, y1 + CENTRAL.spireH, course * 0.8, (y, h) => {
      const k = 1 - 0.3 * (y - y1) / CENTRAL.spireH;
      B.slab(0, y + h / 2, 0, CENTRAL.spireW * k, h, CENTRAL.spireW * k, stone, skinMat);
    });
    B.pinnacle(0, 0, y1 + CENTRAL.spireH, CENTRAL.finial, CENTRAL.spireW * 0.7, stone * 0.7, skinMat);
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison: on the gallery floors behind the balustrades, low to high,
 * and on the round terraces among the bells. Every position is read from the
 * constants above, and every man stands on one stone with a parapet in front
 * of him and a view over it.
 */
export function populateBorobudur(g, origin, groundY) {
  const K = BOROBUDUR;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const facing = (x, z) => Math.atan2(x, z);
  // Riflemen and MGs on the lower galleries, at the corners and the middles
  // of the sides, a stone's width behind the balustrade.
  const rows = [K.foot, ...K.galleries];
  rows.forEach((t, i) => {
    const r = t.half - K.parapet.in - 2.2;
    const spots = i % 2 === 0
      ? [[r, 0], [-r, 0], [0, r], [0, -r]]
      : [[r * 0.8, r * 0.8], [-r * 0.8, r * 0.8], [r * 0.8, -r * 0.8], [-r * 0.8, -r * 0.8]];
    // The corners are indented on the plan, so a man at the corner stands a
    // little further in than the middle of a side does.
    spots.forEach(([x, z], k) => {
      const type = i < 2 ? (k % 2 ? 'rifleman' : 'mg') : (i < 4 ? (k % 2 ? 'rifleman' : 'at') : (k % 2 ? 'sniper' : 'rifleman'));
      g.place(type, V(x, t.top + 1.0, z), facing(x, z), 7, { cover: 'arcade' });   // the gallery walk, walled both sides
    });
  });
  // The round terraces: snipers among the bells, and the mortars on the
  // widest one, where nothing overlooks them but the sky.
  K.round.forEach((r, i) => {
    const n = i === 0 ? 6 : 4;
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) / n * Math.PI * 2 + (i * 0.3);
      const rad = r.r - K.parapet.in - 3.5;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      g.place(i === 0 && k % 2 ? 'mortar' : 'sniper', V(x, r.top + 1.0, z), facing(x, z), 7, { cover: 'roof' });
    }
  });
}
