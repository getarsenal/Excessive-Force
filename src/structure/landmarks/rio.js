import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * Christ the Redeemer, on the Corcovado.
 *
 * Reference figures (the Arquidiocese do Rio's own, and Heitor da Silva
 * Costa's drawings):
 *   Statue      30 m from the feet to the crown of the head, on an 8 m
 *               pedestal, with the head 3.75 m and each hand 3.2 m
 *   Arms        28 m from fingertip to fingertip
 *   Fabric      reinforced concrete, faced in triangular soapstone tiles
 *   Weight      635 tonnes, on a peak 710 m above the sea
 *
 * Built at 2x, like the Elizabeth Tower and El Castillo. At life size this is
 * a thirty-metre figure and the level is a mountain with a doll on it.
 *
 * ── The problem, and the trick ──
 *
 * The arms are the whole silhouette and almost none of the building.
 *
 * Twenty-eight metres of them, held out horizontally, and everybody shoots
 * them first, because they are the shape and they look like the weak point and
 * they are in fact the easiest thing on the map to hit. They are also two
 * cantilevers carrying nothing but themselves — take both and the statue is
 * still a statue, several hundred tonnes of it, standing exactly as before
 * with its arms off. It is the most satisfying wasted quarter of an hour in
 * the campaign.
 *
 * What holds this up is a hollow concrete shaft inside a robe, running from
 * the shoulders down into two legs, into a pedestal that is not solid either —
 * it is a chapel, with a door in it. The whole load of the figure crosses that
 * void on the lintels over the chapel. That is the cut.
 *
 * And then the mountain, which is half the level. Seven hundred metres of
 * granite with the ground falling five hundred of them inside the map: there
 * is no standing off at a comfortable range and firing flat. Everything is
 * shot upward, at elevations the guns were never meant for, from a road that
 * climbs — and the garrison on the terraces is firing down the whole way.
 */

// 2.5x. The Elizabeth Tower and El Castillo are doubled; this one is not a
// building, it is a figure on a mountain, and the whole point of it is that it
// can be seen from the far side of a city. At 2x it is a statue on a summit; at
// 2.5 it is the thing on the skyline.
const S = 2.5;

export const REDEEMER = {
  scale: S,
  // The terraces the summit was cut into, from the bottom up. Solid, and
  // shallow: a terrace on a mountain is cut-and-fill, not a hollow box, and
  // the fill is what everything above it stands on. Built as retaining rings
  // with walks over them instead, each terrace ends up standing on the edge
  // of a plate that is standing on nothing.
  terraces: [
    { half: 41, y: 0, h: 5.4 },
    { half: 29, y: 5.4, h: 4.5 },
    { half: 20, y: 9.9, h: 3.8 },
  ],
  plinth: 13.7,               // the top terrace, which the pedestal stands on
  pedHalf: 5.4 * S,
  pedH: 8.0 * S,
  chapelHalf: 3.2 * S,
  chapelH: 4.6 * S,
  figure: 30.0 * S,           // feet to the crown of the head
  armSpan: 14.0 * S,          // out to the fingertips, each side
  armY: 21.0 * S,             // shoulder height above the feet
  armDrop: 1.1 * S,           // how far the fingertips fall below the shoulder
  headH: 3.75 * S,
};

/**
 * The figure's section at height `t` of its own height.
 *
 * `w` runs along the arms, `d` front to back, both half-extents in metres of
 * the real statue. A robed standing figure is a handful of measurements — hem,
 * waist, chest, shoulder, neck, jaw, crown — and everything between them is a
 * straight line at the scale a stone is cut to.
 *
 * Written from the real thing's own proportions rather than eyeballed: the
 * head is 3.75 m of 30, so it starts at 0.875 and not a stone lower; the
 * shoulders are the widest part of the body and the arms leave from them at
 * 0.70; the robe is at its widest at the hem and narrows to the waist. The
 * first version of this had six stations and came out as a tapered chimney
 * with a box on top and two planks nailed across it, which is exactly what a
 * figure with no shoulder, no neck and no jaw looks like.
 */
const STATIONS = [
  [0.000, 4.70, 2.80],   // the hem
  [0.035, 4.52, 2.72],
  [0.140, 4.00, 2.50],
  [0.300, 3.50, 2.20],
  [0.460, 3.20, 2.00],   // the waist
  [0.560, 3.30, 2.05],
  [0.640, 3.70, 2.20],
  [0.700, 4.15, 2.35],   // the shoulders, and where the arms leave
  [0.730, 4.05, 2.30],
  [0.780, 2.60, 2.00],   // sloping in
  [0.820, 1.55, 1.55],
  [0.855, 1.15, 1.20],   // the neck
  // The head is 3.75 m tall and about 3.5 m across on the real thing, so its
  // half-width is 1.75 and not 2.1 — at 2.1 it comes out wider than it is
  // tall, which is why the first one read as a box on a neck. Deeper than it
  // is wide, because that is where the hair and the beard are.
  [0.875, 1.30, 1.45],   // the jaw
  [0.900, 1.66, 1.80],
  [0.935, 1.76, 1.88],   // the head at its widest
  [0.965, 1.60, 1.70],
  [0.990, 1.02, 1.08],
  [1.000, 0.40, 0.42],   // the crown
];

function sectionAt(t) {
  const u = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STATIONS.length; i++) {
    const a = STATIONS[i - 1], b = STATIONS[i];
    if (u > b[0]) continue;
    const f = (u - a[0]) / Math.max(1e-6, b[0] - a[0]);
    return { w: (a[1] + (b[1] - a[1]) * f) * S, d: (a[2] + (b[2] - a[2]) * f) * S };
  }
  const last = STATIONS[STATIONS.length - 1];
  return { w: last[1] * S, d: last[2] * S };
}

/**
 * The arm's section at `f` of the way out from the shoulder.
 *
 * Thick at the sleeve, thin at the wrist, and then the hand — three and a
 * quarter metres of it, held flat and open, which is wider than the wrist it
 * is on the end of and is most of what makes this silhouette readable from a
 * kilometre away.
 */
function armAt(f) {
  const hand = f > 0.80;
  const g = Math.min(1, f / 0.80);
  // The sleeve is the thickest part and it is thickest right at the body: a
  // separate collar of stone bolted on at the shoulder reads as a yoke, and
  // raises the shoulder line until the head looks like it is sitting on it.
  const hy = (1.42 - 0.72 * g) * S;
  const hx = (1.52 - 0.74 * g) * S;
  if (!hand) return { hy, hx };
  const k = (f - 0.80) / 0.20;
  // Flat: it gains breadth front-to-back and loses depth top-to-bottom.
  return { hy: hy * (1 - 0.34 * k), hx: hx * (1 + 1.25 * k) };
}

export function buildRedeemer(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 1.8 * Math.min(s, 1.3);
  const courseH = 1.4 * Math.min(s, 1.3);
  const R = REDEEMER;

  // ── The terraces. Three of them cut into the summit, each a retaining wall
  // with a deck on it — which is where the garrison is and where the view is.
  B.section('terraces', () => {
    for (const t of R.terraces) {
      let y = t.y;
      while (y < t.y + t.h - 0.001) {
        const h = Math.min(courseH, t.y + t.h - y);
        B.slab(0, y + h / 2, 0, t.half * 2, h, t.half * 2, stone, M.CONCRETE);
        y += h;
      }
      // A parapet round the edge of each one, which is what the crowd leans on
      // and what the garrison shoots over.
      B.ring(0, 0, t.half * 2, t.half * 2, 1.4 * S, t.y + t.h,
        courseH * 1.2, stone, M.LIMESTONE, 0);
    }
  });

  // ── The pedestal, which is a chapel with a door in it and not a block of
  // stone. Everything above crosses this void on the lintels over it.
  B.section('pedestal', () => {
    const y0 = R.plinth;
    B.openings((x, y, z) => {
      if (y < y0 + courseH || y > y0 + R.chapelH) return false;
      if (Math.abs(x) < R.chapelHalf && Math.abs(z) < R.chapelHalf) return true;
      // The door, on the side the terraces climb from.
      return Math.abs(x) < 1.6 * S && z > R.chapelHalf;
    }, () => {
      let y = y0;
      let c = 0;
      while (y < y0 + R.pedH - 0.001) {
        const h = Math.min(courseH, y0 + R.pedH - y);
        const f = (y - y0) / R.pedH;
        const half = R.pedHalf * (1 - f * 0.22);
        B.ring(0, 0, half * 2, half * 2, 2.2 * S, y, h, stone,
          f > 0.88 ? M.LIMESTONE : M.CONCRETE, c % 2);
        y += h; c++;
      }
    });
  });

  const feet = R.plinth + R.pedH;

  // ── The figure.
  //
  // Laid at half the stone of everything under it. A head three and three
  // quarter metres tall is three blocks across at the terraces' 2.3 m stone,
  // and three blocks across is a cube — so the statue gets its own grid, fine
  // enough that a jaw, a neck and a shoulder are shapes rather than rounding.
  const fine = 1.05 * Math.min(s, 1.3);
  const fineH = 0.95 * Math.min(s, 1.3);

  B.section('statue', () => {
    let y = feet;
    let c = 0;
    while (y < feet + R.figure - 0.001) {
      const h = Math.min(fineH, feet + R.figure - y);
      const t = (y + h / 2 - feet) / R.figure;
      const q = sectionAt(t);
      // The robe, as relief rather than as geometry: vertical folds running
      // the height of it, deepest at the hem and gone by the shoulder. The
      // block is laid that much thicker and shifted out by half of it, so a
      // fold is still a stone standing on the stone below.
      const foldDepth = t < 0.70 ? 0.42 * S * (1 - t / 0.70) ** 0.5 : 0;
      const fold = foldDepth > 0.02
        ? (fx, fz) => {
          const a = Math.atan2(fz, fx);
          return foldDepth * (0.5 + 0.5 * Math.cos(a * 7));
        }
        : null;
      // Hollow where the section can carry a wall, solid where it cannot —
      // the neck and the crown are 2 m of stone and there is nothing to be
      // hollow about.
      const wall = 0.95 * S;
      if (q.w > wall * 2.2 && q.d > wall * 2.2) {
        B.ring(0, 0, q.d * 2, q.w * 2, wall, y, h, fine, M.VERDE, c % 2, fold);
      } else {
        B.slab(0, y + h / 2, 0, q.d * 2, h, q.w * 2, fine, M.VERDE);
      }
      y += h; c++;
    }
  });

  // ── The arms.
  //
  // Two cantilevers, and the shape everybody knows. They leave the shoulders
  // at seventy per cent of the figure's height, fall about a metre over their
  // own length, taper from sleeve to wrist and finish in a flat open hand.
  // Laid as a run of short segments rather than one long box, so the taper and
  // the droop are in the stone and not in a comment.
  B.section('arms', () => {
    const shoulder = sectionAt(R.armY / R.figure).w;
    const reach = R.armSpan - shoulder;
    const n = Math.max(6, Math.round(reach / fine));
    const y0 = feet + R.armY;
    for (const sg of [1, -1]) {
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const a = armAt(f);
        const u = shoulder + f * reach;
        const len = reach / n;
        // A shoulder that slopes into the arm rather than meeting it square.
        const drop = R.armDrop * Math.pow(f, 1.3);
        B.slab(0, y0 - drop, sg * u, a.hx * 2, a.hy * 2, len * 1.08, fine, M.VERDE);
      }
    }
  });

  return B;
}
