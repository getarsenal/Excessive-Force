import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Taj Mahal, built from its real dimensions.
 *
 * Reference figures (Archaeological Survey of India, widely published):
 *   plinth                  95.5 m square, ~7 m high, red sandstone
 *   mausoleum plan          ~57 m square with 7 m chamfered corners
 *   wall height to parapet  ~33 m
 *   drum                    ~18.5 m across, ~12 m tall
 *   main dome               17.7 m across, ~24 m from drum top to apex
 *   finial                  ~9 m gilt
 *   overall height          ~73 m above the plinth
 *   minarets                41.6 m, on the plinth corners, splayed outward
 *
 * Structurally this is the opposite of the Elizabeth Tower, and that is the
 * point of building it. A tower is a cantilever: cut one side and it goes over.
 * A dome is a compression shell — its weight runs down the shell into the drum,
 * and from the drum into four massive piers at the corners of the central
 * chamber. Shelling the dome itself mostly makes holes. Taking out a pier moves
 * the drum's whole load onto the remaining three, and the solver's load pass
 * does the rest.
 *
 * The minarets were famously built leaning very slightly outward so that if
 * they ever fell they would fall away from the tomb. Here they lean for real,
 * and they really do fall outward.
 */

/**
 * Onion profile: radius as a fraction of the widest point, by height fraction.
 * The bulge just above the springing and the tight neck below the finial are
 * what make it read as Mughal rather than as a hemisphere.
 */
// Normalised so the springing is exactly 1.0: the first ring has to sit
// squarely on the drum it rises from. Starting below 1.0 leaves the dome
// perched on the inner lip of the drum with almost no bearing, and the whole
// shell then reads as unsupported and drops on the first frame.
// Bulbous, which the first profile was not: it swelled ten per cent and read
// as a beehive. The Taj's dome is pinched where it leaves the drum and widest
// about a third of the way up, and that overhang is the whole of its
// silhouette. The base sits inside the drum's wall, so the shell still lands
// on masonry.
const ONION = [
  [0.00, 0.880], [0.08, 1.020], [0.18, 1.140], [0.30, 1.190],
  [0.42, 1.160], [0.54, 1.060], [0.66, 0.880], [0.77, 0.650],
  [0.87, 0.410], [0.94, 0.220], [1.00, 0.060],
];

function onion(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < ONION.length - 1; i++) {
    const [t0, r0] = ONION[i];
    const [t1, r1] = ONION[i + 1];
    if (x <= t1) {
      const k = (x - t0) / Math.max(t1 - t0, 1e-6);
      return r0 + (r1 - r0) * k;
    }
  }
  return ONION[ONION.length - 1][1];
}

/** The chamfered-square plan of the tomb: a square with its corners cut off. */
function chamferedSquare(half, cut) {
  const a = half, c = cut;
  return [
    [-a + c, -a], [a - c, -a], [a, -a + c], [a, a - c],
    [a - c, a], [-a + c, a], [-a, a - c], [-a, -a + c],
  ];
}

/**
 * How much bigger than life the complex is built.
 *
 * Everything below is written at the real survey dimensions — that is what
 * makes it checkable — and the whole block list is scaled once at the end, the
 * way the Elizabeth Tower is. At 2.2 the terrace is 210 m square and the dome
 * stands 141 m over it, which is the size the Taj has in memory rather than
 * the size it has on a drawing.
 *
 * The stone size is *not* scaled with it. Building at 0.72 of the tier's
 * nominal stone and then scaling puts the stones at about 1.6x their old size
 * in a building ten times the volume — finer relative to the monument than
 * they were before, for about two and a half times as many of them.
 */
export const TAJ_SCALE = 2.2;
const STONE_FINENESS = 0.72;

/** The finished complex's dimensions, in world metres. One source for the
 *  builder and the garrison both. */
export const TAJ = {
  scale: TAJ_SCALE,
  plinth: 95.5 * TAJ_SCALE,
  plinthH: 7.0 * TAJ_SCALE,
  half: 28.5 * TAJ_SCALE,
  wallTop: 33.0 * TAJ_SCALE,
  roof: 40.0 * TAJ_SCALE,
  mosqueX: 88 * TAJ_SCALE,
  mosqueRoof: 19.5 * TAJ_SCALE,
};

export function buildTajMahal(quality) {
  const B = new BlockList();
  const s = quality.blockScale * STONE_FINENESS;

  const stone = 1.5 * s;
  const course = 1.15 * s;

  const PLINTH = 95.5;        // square, metres
  const PLINTH_H = 7.0;
  const HALF = 28.5;          // tomb half-width
  const CHAMFER = 7.0;
  const WALL_TOP = 33.0;      // parapet, above plinth
  const DRUM_R = 8.9;
  const DRUM_H = 12.0;
  const DOME_H = 24.0;
  const DOME_R = 8.9;

  const plan = chamferedSquare(HALF, CHAMFER);

  // ── Plinth ───────────────────────────────────────────────────────────────
  // Faced sandstone over a rubble core. Built as a shell with a paved top
  // rather than 64,000 m³ of solid stone — which is both how it was actually
  // made and the difference between 9,000 blocks and 400,000.
  B.section('plinth', () => {
    // `polyRing` centres its wall on the outline, so the outline runs down
    // the middle of the rim: the rim's outer face is then the plinth's true
    // edge and its inner face meets the paving. With the outline on the edge
    // itself the rim stood two metres outside the platform and a trench ran
    // round the terrace between the two.
    const half = PLINTH / 2 - 2.25;
    const outline = [[-half, -half], [half, -half], [half, half], [-half, half]];
    let y = -1.5;
    let c = 0;
    while (y < PLINTH_H) {
      const h = Math.min(course * 1.5, PLINTH_H - y);
      const yc = y + h / 2;
      // A footing, a string course and a coping, all laid proud.
      const band = yc < 0.6 ? 0.5 : Math.abs(yc - 3.6) < h * 0.55 ? 0.3
        : yc > PLINTH_H - h * 1.05 ? 0.55 : 0;
      B.polyRing(0, 0, outline, 4.5, y, h, stone * 1.6, M.SANDSTONE, c % 2, () => band);
      y += h; c++;
    }
    // Rubble core. The plinth is a solid platform, not a box with a lid — and
    // modelling it hollow leaves the paving, and therefore the entire tomb,
    // standing on nothing but its own rim. Coarse blocks keep it cheap.
    //
    // Up to the underside of the paving exactly, and exactly as wide as the
    // hole inside the rim. It used to run the full height *through* the
    // paving and half a metre into the rim, on the theory that overlap was
    // safer than a joint — and the price was the whole terrace: the core's
    // top and the paving's top on the same plane, flickering against each
    // other from the default camera across two hundred metres of sandstone.
    // The adjacency test sees a joint of a few millimetres perfectly well.
    const PAVING = course * 1.5;
    B.slab(0, (PLINTH_H - PAVING - 1.5) / 2, 0,
      PLINTH - 9, PLINTH_H - PAVING + 1.5, PLINTH - 9, stone * 3.0, M.SANDSTONE);
    // Paving, and the bearing the tomb actually stands on.
    B.slab(0, PLINTH_H - PAVING / 2, 0, PLINTH - 9, PAVING, PLINTH - 9, stone * 2.4, M.SANDSTONE);
  });

  // ── Tomb walls ───────────────────────────────────────────────────────────
  // Marble facing outside a brick core, which is how it is built and which
  // gives the solver a weaker inner path to fail through.
  // The great iwan on each face: a 17 m recess rising two thirds of the wall.
  // Everything inside this volume is simply never laid, so the wall spans it
  // through the arch above — and losing that arch really does drop the wall.
  const IWAN_HALF = 8.6;
  const IWAN_TOP = PLINTH_H + 21.0;
  // Pointed, not square-topped. The opening was a rectangle up to the arch
  // ring, so what you saw from the garden was a letterbox with an arch drawn
  // above it. The width now closes over the top two fifths of the height, on
  // a curve, so the void itself is the pointed arch and the ring sits on it.
  const SPRING = PLINTH_H + 12.0;
  const RISE = IWAN_TOP - SPRING;
  const RING = 1.9;
  const iwanHalfAt = (y) => {
    if (y <= SPRING) return IWAN_HALF;
    const t = (y - SPRING) / RISE;
    return IWAN_HALF * Math.sqrt(Math.max(0, 1 - t * t));
  };
  const iwanOpening = (x, y, z) => {
    if (y < PLINTH_H + 0.8 || y > IWAN_TOP) return false;
    const w = iwanHalfAt(y);
    // North/south faces, then east/west.
    if (Math.abs(z) > HALF - 5.0 && Math.abs(x) < w) return true;
    if (Math.abs(x) > HALF - 5.0 && Math.abs(z) < w) return true;
    return false;
  };
  /**
   * The ring round each iwan, as relief: the wall's own stones, laid proud,
   * along a band the ring's width outside the pointed opening.
   *
   * Not a ring of voussoirs. That was tried, laid into a slot cut for it, and
   * it is the one thing the support solver cannot hold up: it knows bearing
   * as standing on something underneath, and near the crown of a forty-metre
   * pointed arch each voussoir stands beside the next, not on it. The ring
   * came down on the first frame, took the springing stones with it, and the
   * wall over the iwan followed. As relief the ring is the wall, and the wall
   * spans the opening the way it always has.
   */
  const inRing = (along, y) => {
    const a = Math.abs(along);
    if (y < PLINTH_H + 0.8) return false;
    if (y <= SPRING) return a > IWAN_HALF - 0.05 && a < IWAN_HALF + RING;
    const u = a / (IWAN_HALF + RING), v = (y - SPRING) / (RISE + RING);
    return u * u + v * v < 1;
  };

  /**
   * The smaller arched recesses: two tiers on each chamfer, and two tiers
   * either side of the great iwan on each face. Cut into the marble and the
   * outer half of the brick, so they have depth without being doors.
   */
  const NICHE_HALF = 2.2, NICHE_RISE = 3.2;
  const NICHE_TIERS = [[PLINTH_H + 1.6, PLINTH_H + 7.4], [PLINTH_H + 13.2, PLINTH_H + 19.0]];
  const nicheAt = (along, y, tier) => {
    const [y0, spring] = tier;
    if (y < y0) return false;
    if (y <= spring) return Math.abs(along) < NICHE_HALF;
    const u = along / NICHE_HALF, v = (y - spring) / NICHE_RISE;
    return u * u + v * v < 1;
  };
  const CHAMFER_D = (HALF - CHAMFER / 2) * Math.SQRT2;   // distance of a chamfer's plane
  const niches = (x, y, z) => {
    // On the main faces, flanking the iwan.
    const onZ = Math.abs(z) > HALF - 1.7, onX = Math.abs(x) > HALF - 1.7;
    if (onZ || onX) {
      const along = Math.abs(onZ ? x : z) - (IWAN_HALF + 6.6);
      for (const tier of NICHE_TIERS) if (nicheAt(along, y, tier)) return true;
    }
    // On the chamfers, measured along the chamfer's own plane.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const dist = (x * sx + z * sz) * Math.SQRT1_2;
      if (dist < CHAMFER_D - 1.7) continue;
      const along = (x * sz - z * sx) * Math.SQRT1_2;
      for (const tier of NICHE_TIERS) if (nicheAt(along, y, tier)) return true;
    }
    return false;
  };

  /**
   * The pishtaq: the rectangular frame round each great iwan, standing well
   * proud of the wall, and the parapet band along the top. As on every other
   * landmark, the frame is the wall's own stones laid thicker.
   */
  const FRAME_IN = IWAN_HALF + RING + 0.4, FRAME_OUT = FRAME_IN + 1.8;
  const FRAME_TOP = IWAN_TOP + RING + 1.2;
  const tombRelief = (x, z, y) => {
    const onZ = Math.abs(z) > Math.abs(x);
    const along = Math.abs(onZ ? x : z);
    const face = Math.max(Math.abs(x), Math.abs(z)) > HALF - 0.6;   // not a chamfer
    let e = 0;
    if (y > PLINTH_H + WALL_TOP - course * 1.05) e = 0.35;            // parapet coping
    if (y < PLINTH_H + 1.3) e = Math.max(e, 0.3);                     // dado
    if (face) {
      if (inRing(along, y)) e = Math.max(e, 0.45);
      if (along > FRAME_IN && along < FRAME_OUT && y < FRAME_TOP + 1.5) e = Math.max(e, 0.6);
      if (along < FRAME_OUT && y > FRAME_TOP && y < FRAME_TOP + 1.5) e = Math.max(e, 0.6);
    }
    return e;
  };

  B.section('tomb', () => {
    B.openings((x, y, z) => iwanOpening(x, y, z) || niches(x, y, z), () => {
      let y = PLINTH_H;
      let c = 0;
      while (y < PLINTH_H + WALL_TOP) {
        const h = Math.min(course, PLINTH_H + WALL_TOP - y);
        const yc = y + h / 2;
        B.polyRing(0, 0, plan, 1.1, y, h, stone, M.MARBLE, c % 2, (px, pz) => tombRelief(px, pz, yc));
        // Inner brick wall, set back, carrying most of the load.
        B.polyRing(0, 0, chamferedSquare(HALF - 2.6, CHAMFER), 3.0, y, h, stone, M.BRICK, (c + 1) % 2);
        y += h; c++;
      }
    });
    // The parapet: two courses above the roof line, round the whole plan.
    let y = PLINTH_H + WALL_TOP;
    for (let k = 0; k < 2; k++) {
      B.polyRing(0, 0, plan, 1.1, y, course, stone, M.MARBLE, k % 2, () => (k === 1 ? 0.4 : 0.2));
      y += course;
    }
    // Guldastas: a slender pinnacle at each corner of the chamfered plan,
    // standing on the roof.
    for (const [px, pz] of chamferedSquare(HALF - 2.9, CHAMFER)) {
      B.pinnacle(px, pz, PLINTH_H + WALL_TOP + course * 2, 7.5, 1.9, stone, M.MARBLE);
    }
  });

  // ── The central chamber ──────────────────────────────────────────────────
  // An octagonal wall around the cenotaph chamber, and the thing that actually
  // carries the dome: load runs dome -> drum -> this wall -> plinth. The outer
  // walls carry only themselves and the roof.
  //
  // It has to be a continuous wall rather than four isolated piers. The solver
  // resolves load through contact, not bending, so a beam spanning between
  // columns has nothing underneath it and would fall on frame one — which is
  // also true of real masonry, and why domes of this period sit on continuous
  // drums and squinches rather than on posts.
  const CHAMBER_R = 12.0;
  const CHAMBER_WALL = 3.5;
  B.section('chamber', () => {
    // Eight arched doorways, so the chamber reads as a room and so a shell
    // through an iwan can reach the wall that matters.
    // Pointed-headed, like every opening in the building. The head used to be
    // a ring of voussoirs laid over the uncut wall — buried, sharing its
    // volume with the stones already there — and cut a slot for it instead,
    // it came down: see the iwans for why. A pointed void the wall spans is
    // what the solver holds up.
    const doorway = (x, y, z) => {
      if (y < PLINTH_H + 1.0 || y > PLINTH_H + 13.5) return false;
      const a = Math.atan2(z, x);
      // Centre of the nearest of eight faces.
      const k = Math.round((a / (Math.PI * 2)) * 8) / 8 * Math.PI * 2;
      const off = Math.abs(((a - k + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const half = y <= PLINTH_H + 10.5 ? 0.20
        : 0.20 * Math.sqrt(Math.max(0, 1 - ((y - PLINTH_H - 10.5) / 3.0) ** 2));
      return off < half;   // ~6 m of opening on each face
    };

    B.openings(doorway, () => {
      let y = PLINTH_H;
      let c = 0;
      while (y < PLINTH_H + WALL_TOP + course * 2) {
        const h = Math.min(course, PLINTH_H + WALL_TOP + course * 2 - y);
        B.polyRing(0, 0, BlockList.circle(CHAMBER_R, 8), CHAMBER_WALL, y, h, stone, M.BRICK, c % 2);
        // eslint-disable-line -- eight long edges, so the per-edge stagger is safe
        y += h; c++;
      }
    });
  });

  // ── Roof, drum and dome ──────────────────────────────────────────────────
  const roofY = PLINTH_H + WALL_TOP;
  B.section('drum', () => {
    // An annulus: the roof spans from the outer walls to the chamber and stops.
    // Leaving it solid would put the drum on the roof and route the dome's
    // entire weight out to the outer walls, making the chamber redundant.
    B.openings((x, y, z) => Math.hypot(x, z) < CHAMBER_R + 0.5, () => {
      B.slab(0, roofY + course, 0, HALF * 1.85, course * 2, HALF * 1.85, stone * 1.5, M.MARBLE);
    });
    B.drum(0, 0, roofY + course * 2, roofY + course * 2 + DRUM_H - course, DRUM_R, 2.2, course, stone, M.MARBLE);
    // The lotus band the dome rises from: one corbelled course, standing half
    // a metre out from the drum, its inner face still on the drum's.
    const ly = roofY + course * 2 + DRUM_H - course;
    const sides = Math.max(12, Math.round((2 * Math.PI * (DRUM_R + 0.5)) / stone));
    B.polyRing(0, 0, BlockList.circle(DRUM_R + 0.5, sides), 2.7, ly, course, stone, M.MARBLE);
  });

  const domeY = roofY + course * 2 + DRUM_H;
  B.section('dome', () => {
    B.dome(0, 0, domeY, DOME_H, DOME_R, 1.5, course, stone, M.MARBLE, onion);
  });

  B.section('finial', () => {
    const y0 = domeY + DOME_H;
    B.slab(0, y0 + 1.2, 0, 2.2, 2.4, 2.2, stone * 0.8, M.GILT);
    for (let i = 0; i < 4; i++) {
      B.slab(0, y0 + 3.0 + i * 1.5, 0, 1.5 - i * 0.28, 1.5, 1.5 - i * 0.28, stone * 0.7, M.GILT);
    }
    B.slab(0, y0 + 9.4, 0, 0.5, 2.6, 0.5, stone * 0.6, M.GILT);
  });

  // ── Chattris ─────────────────────────────────────────────────────────────
  // The four domed kiosks around the main dome.
  B.section('chattris', () => {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cx = sx * 17.5, cz = sz * 17.5;
      const y0 = roofY + course * 2;
      // Eight slender columns.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        let y = y0;
        while (y < y0 + 5.5) {
          const h = Math.min(course, y0 + 5.5 - y);
          B.slab(cx + Math.cos(a) * 3.4, y + h / 2, cz + Math.sin(a) * 3.4,
            1.2, h, 1.2, stone, M.MARBLE);
          y += h;
        }
      }
      B.drum(cx, cz, y0 + 5.5, y0 + 6.6, 4.0, 1.4, course, stone, M.MARBLE);
      B.dome(cx, cz, y0 + 6.6, 6.0, 3.9, 1.0, course, stone, M.MARBLE, onion);
      B.slab(cx, y0 + 13.4, cz, 0.6, 2.0, 0.6, stone * 0.6, M.GILT);
    }
  });

  // ── Minarets ─────────────────────────────────────────────────────────────
  // Built with a real outward lean, as the originals were, so that a collapse
  // falls away from the tomb rather than onto it. The lean is applied by
  // shifting each course outward as it rises.
  B.section('minarets', () => {
    const base = PLINTH / 2 - 6.0;
    const H = 41.6;
    const LEAN = 0.9; // metres of outward offset over the full height
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const bx = sx * base, bz = sz * base;
      let y = PLINTH_H;
      let c = 0;
      while (y < PLINTH_H + H) {
        const h = Math.min(course, PLINTH_H + H - y);
        const t = (y - PLINTH_H) / H;
        let r = 4.1 - t * 0.75;
        let wall = 1.5;
        // Three balconies up each shaft, corbelled: the course is laid wider,
        // and because the wall is thicker by the same amount it still lands
        // on the course below. A ring hung off the outside would have
        // nothing under it at all.
        for (const bt of [0.33, 0.62, 0.90]) {
          if (Math.abs(t - bt) < course / H) { r += 1.3; wall += 1.3; }
        }
        const lean = LEAN * t;
        const sides = Math.max(10, Math.round((2 * Math.PI * r) / stone));
        B.polyRing(bx + sx * lean, bz + sz * lean,
          BlockList.circle(r, sides, (c % 2) * (Math.PI / sides)), wall, y, h, stone, M.MARBLE);
        y += h; c++;
      }
      // Chattri cap.
      const capY = PLINTH_H + H;
      const lx = bx + sx * LEAN, lz = bz + sz * LEAN;
      B.drum(lx, lz, capY, capY + 1.2, 3.9, 1.5, course, stone, M.MARBLE);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        let yy = capY + 1.2;
        while (yy < capY + 5.0) {
          const hh = Math.min(course, capY + 5.0 - yy);
          B.slab(lx + Math.cos(a) * 3.1, yy + hh / 2, lz + Math.sin(a) * 3.1,
            1.2, hh, 1.2, stone, M.MARBLE);
          yy += hh;
        }
      }
      B.dome(lx, lz, capY + 5.0, 5.2, 3.9, 1.1, course, stone, M.MARBLE, onion);
      B.slab(lx, capY + 11.2, lz, 0.5, 1.8, 0.5, stone * 0.6, M.GILT);
    }
  });

  return B.scaleAll(TAJ_SCALE);
}

/**
 * The mosque west of the tomb (the jawab east of it is its mirror). Red
 * sandstone with three small domes — a secondary, softer target that pays for
 * the first artillery tier.
 */
export function buildTajMosque(quality, sideSign = -1) {
  const B = new BlockList();
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.5 * s;
  const course = 1.15 * s;

  B.section('mosque', () => {
    const cx = sideSign * 88;
    const w = 24, d = 56, h = 18;
    const outline = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];

    B.slab(cx, -0.8, 0, w + 5, 1.6, d + 5, stone * 2.0, M.SANDSTONE);

    // Five pointed arches down the front, facing the tomb, the centre one a
    // storey taller; a frame round each, a dado below and a cornice above.
    const front = -sideSign;                  // which way the tomb is
    const BAYS = [-22, -11, 0, 11, 22];
    const arched = (x, y, z) => {
      if ((x - cx) * front < w / 2 - 2.0) return false;
      for (const bz of BAYS) {
        const big = bz === 0;
        const half = big ? 3.4 : 2.6, y0 = 1.0, spring = big ? 8.0 : 5.6, rise = big ? 3.6 : 3.0;
        const along = z - bz;
        if (y < y0) continue;
        if (y <= spring) { if (Math.abs(along) < half) return true; continue; }
        const u = along / half, v = (y - spring) / rise;
        if (u * u + v * v < 1) return true;
      }
      return false;
    };
    const relief = (x, z, y) => {
      let e = 0;
      if (y < 1.4) e = 0.3;
      if (y > h - course * 1.05) e = Math.max(e, 0.45);
      if ((x - cx) * front < w / 2 - 0.6) return e;
      for (const bz of BAYS) {
        const big = bz === 0;
        const half = big ? 3.4 : 2.6, top = big ? 11.6 : 8.6;
        const a = Math.abs(z - bz);
        if (a > half + 0.3 && a < half + 1.3 && y < top + 1.4) e = Math.max(e, 0.4);
        if (a < half + 1.3 && y > top && y < top + 1.4) e = Math.max(e, 0.4);
      }
      return e;
    };

    let y = 0;
    let c = 0;
    B.openings(arched, () => {
      while (y < h) {
        const hh = Math.min(course, h - y);
        const yc = y + hh / 2;
        B.polyRing(cx, 0, outline, 1.8, y, hh, stone, M.SANDSTONE, c % 2, (px, pz) => relief(px, pz, yc));
        y += hh; c++;
      }
    });
    // Corner chattris on the roof.
    for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      B.pinnacle(cx + ex * (w / 2 - 1.3), ez * (d / 2 - 1.3), h + course * 2, 4.5, 1.8, stone, M.SANDSTONE);
    }
    // Cross walls, so the roof has bearing along its length rather than only
    // at the two ends.
    for (let zc = -d / 2 + 11; zc < d / 2 - 5; zc += 11) {
      let wy = 0;
      while (wy < h) {
        const hh = Math.min(course, h - wy);
        B.slab(cx, wy + hh / 2, zc, w - 2.4, hh, 1.4, stone, M.SANDSTONE);
        wy += hh;
      }
    }
    B.slab(cx, h + course, 0, w, course * 2, d, stone * 1.6, M.SANDSTONE);

    // Three domes along the ridge.
    for (const off of [-17, 0, 17]) {
      const r = off === 0 ? 6.0 : 4.4;
      B.drum(cx, off, h + course * 2, h + course * 2 + 3.0, r, 1.4, course, stone, M.SANDSTONE);
      B.dome(cx, off, h + course * 2 + 3.0, r * 2.1, r, 1.1, course, stone, M.MARBLE, onion);
    }
  });

  return B.scaleAll(TAJ_SCALE);
}
