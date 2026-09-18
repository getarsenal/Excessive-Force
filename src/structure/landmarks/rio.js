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

const S = 2.0;

export const REDEEMER = {
  scale: S,
  // The terraces the summit was cut into, from the bottom up. Solid, and
  // shallow: a terrace on a mountain is cut-and-fill, not a hollow box, and
  // the fill is what everything above it stands on. Built as retaining rings
  // with walks over them instead, each terrace ends up standing on the edge
  // of a plate that is standing on nothing.
  terraces: [
    { half: 34, y: 0, h: 4.6 },
    { half: 24, y: 4.6, h: 3.8 },
    { half: 16, y: 8.4, h: 3.2 },
  ],
  plinth: 11.6,               // the top terrace, which the pedestal stands on
  pedHalf: 5.4 * S,
  pedH: 8.0 * S,
  chapelHalf: 3.2 * S,
  chapelH: 4.6 * S,
  figure: 30.0 * S,           // feet to the crown of the head
  armSpan: 14.0 * S,          // out to the fingertips, each side
  armY: 21.0 * S,             // shoulder height above the feet
  headH: 3.75 * S,
};

/**
 * The figure's section at height `y` above its own feet.
 *
 * `w` runs along the arms, `d` front to back. Written as a list of stations
 * and interpolated, because a robed standing figure is a handful of
 * measurements — hem, waist, chest, shoulder, neck, head — and everything
 * between them is a straight line at the scale a stone is cut to.
 */
const STATIONS = [
  [0.00, 4.5, 2.6],
  [0.06, 4.6, 2.7],
  [0.42, 3.4, 2.1],
  [0.62, 3.9, 2.2],
  [0.72, 4.8, 2.3],
  [0.74, 4.9, 2.3],
  [0.80, 1.5, 1.4],
  [0.86, 1.3, 1.3],
  [0.90, 1.9, 1.9],
  [0.95, 2.0, 2.0],
  [1.00, 0.7, 0.7],
];

function sectionAt(t) {
  const u = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STATIONS.length; i++) {
    const a = STATIONS[i - 1], b = STATIONS[i];
    if (u > b[0]) continue;
    const f = (u - a[0]) / Math.max(1e-6, b[0] - a[0]);
    return { w: (a[1] + (b[1] - a[1]) * f) * S, d: (a[2] + (b[2] - a[2]) * f) * S };
  }
  return { w: STATIONS[STATIONS.length - 1][1] * S, d: STATIONS[STATIONS.length - 1][2] * S };
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

  // ── The figure. Courses of soapstone-faced concrete, laid to the section.
  B.section('statue', () => {
    let y = feet;
    let c = 0;
    while (y < feet + R.figure - 0.001) {
      const h = Math.min(courseH, feet + R.figure - y);
      const t = (y + h / 2 - feet) / R.figure;
      const q = sectionAt(t);
      // Hollow through the trunk, which is what the shaft with the stair in it
      // actually is, and solid once the section is too small to be hollow.
      const wall = 1.1 * S;
      // `w` is the shoulder measurement and goes on the z axis, because that
      // is the axis the arms run on; `d` is front to back and goes on x, which
      // is the way this statue looks. Laid the other way round the arms start
      // four metres clear of the body, and every stone in them is culled
      // before the level loads — which is how the first build of this arrived
      // with its arms already off.
      if (q.w > wall * 2.4 && q.d > wall * 2.4) {
        B.ring(0, 0, q.d * 2, q.w * 2, wall, y, h, stone, M.VERDE, c % 2);
      } else {
        B.slab(0, y + h / 2, 0, q.d * 2, h, q.w * 2, stone, M.VERDE);
      }
      y += h; c++;
    }
  });

  // ── The arms. Two horizontal cantilevers off the shoulders, carrying
  // nothing but themselves, and the first thing anybody shoots.
  B.section('arms', () => {
    const y0 = feet + R.armY;
    const shoulder = sectionAt(R.armY / R.figure).w;
    for (const sg of [1, -1]) {
      const len = R.armSpan - shoulder;
      const mid = sg * (shoulder + len / 2);
      B.slab(0, y0 + 1.15 * S, mid, 2.3 * S, 2.3 * S, len, stone, M.VERDE);
      // The hand, which is three metres of it on the real thing.
      B.slab(0, y0 + 1.15 * S, sg * (R.armSpan - 0.9 * S), 2.9 * S, 2.9 * S,
        1.8 * S, stone, M.VERDE);
    }
  });

  return B;
}
