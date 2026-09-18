import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Sydney Opera House, on Bennelong Point.
 *
 * Reference figures (Utzon/Arup, and the Sydney Opera House Trust):
 *   Podium      about 185 m along the point by 120 m across, granite-faced,
 *               standing on 588 concrete piers driven to bedrock
 *   Shells      fourteen of them in three groups, every one a segment of the
 *               same sphere of radius 75.2 m, built of precast concrete ribs
 *               post-tensioned together and clad in 1,056,006 tiles
 *   Height      the tallest shell 67 m above sea level, about 58 m above the
 *               podium deck
 *   Skin        the shell itself is 100–120 mm of concrete between the ribs
 *
 * Built at life size. The whole point of this building is its size against a
 * headland, and there is nothing here small enough to need doubling.
 *
 * ── The problem, and the trick ──
 *
 * This is the first landmark in the campaign that is not masonry. There is no
 * wall to undercut, no core to remove and, most of all, no mass: a shell is an
 * arch that has been swept sideways, and an arch is a line of compression with
 * nothing on it. Every instinct the first five contracts teach is wrong here.
 * Shelling the crown of a vault takes a hole out of the crown. The two halves
 * either side of that hole are still arches, still standing on their own feet,
 * and still perfectly happy — so a player who spends the match hammering the
 * famous white roof from two hundred metres will finish the match with a
 * beautifully perforated building standing exactly where it was.
 *
 * What kills an arch is a hinge in the wrong place. Take the haunch — the low
 * quarter, where the thrust has turned from vertical to horizontal and is
 * being handed to the podium — and the vault is no longer an arch, it is a
 * four-bar mechanism, and it comes down entire. The haunches are at deck
 * level, behind the glass, where a gun on the point can actually see them.
 *
 * And the glass is the joke. The great mouths are bronze-framed glazing, and
 * glazing carries nothing: the solver knows it, so the most spectacular shot
 * available on this map — sixty metres of glass wall coming down in one
 * piece — moves the needle by exactly nothing.
 *
 * The other half of the level is the ground. Bennelong Point has water on
 * three sides and one neck of land to the south, so for the first time in the
 * campaign there is no choosing an angle: everything deploys on the same
 * approach, and the garrison knows it.
 *
 * One nice accident. Each rib here is laid as a circular arc through its own
 * feet and crown, and for the tallest shell — 27.5 m of half-span under 58 m
 * of rise — that arc comes out at a radius of 74.9 m. Utzon's sphere is 75.2.
 */

export const OPERA = {
  podiumX: 60,               // half-width, across the point
  podiumZ: 92,               // half-length, along it
  podiumH: 9.4,              // the substructure, under the deck slab
  deck: 11.0,                // the deck's own top, which everything stands on
  wall: 3.2,
  bayX: 30,                  // the substructure's own grid of cross walls
  bayZ: 23,
  stepsW: 88,
  stepsRun: 38,
  arcadeH: 5.0,
  // Each shell: where its mouth is, which way it faces, and how far it runs.
  //
  // The mouths face south-west, over Circular Quay and the city, and the tips
  // point north-east out to the harbour mouth — which is why every aerial
  // photograph of this building shows points at the far end and glass at the
  // near one. Each group runs tallest-first from the steps and steps *down*
  // going north, so the tail of one shell passes inside the next, and from the
  // quay you get the stack of arcs the thing is famous for. Built the other
  // way round, tallest at the front, it is a row of aircraft hangars.
  //
  // The eastern group is the Concert Hall and is the taller of the two.
  shells: [
    { x: 27, z: -56, yaw: 0.05, len: 78, s: 27.5, h: 58.0, group: 'concert' },
    { x: 25, z: -18, yaw: 0.05, len: 62, s: 24.0, h: 47.0, group: 'concert' },
    { x: 23, z: 14, yaw: 0.05, len: 46, s: 19.5, h: 35.0, group: 'concert' },
    { x: 21, z: 44, yaw: 0.05, len: 32, s: 14.5, h: 23.0, group: 'concert' },
    { x: -28, z: -46, yaw: -0.05, len: 66, s: 23.0, h: 46.0, group: 'opera' },
    { x: -26, z: -14, yaw: -0.05, len: 50, s: 19.0, h: 35.0, group: 'opera' },
    { x: -24, z: 16, yaw: -0.05, len: 36, s: 14.0, h: 24.0, group: 'opera' },
    { x: -3, z: -74, yaw: 0.55, len: 30, s: 11.0, h: 17.0, group: 'bennelong' },
    { x: -3, z: -74, yaw: -0.55, len: 26, s: 9.5, h: 14.5, group: 'bennelong' },
  ],
  // Where a rib stops being a haunch and starts being a shell, as a fraction
  // of the arc measured up from the foot.
  haunch: 0.26,
};

/**
 * One rib: a circular arc through its own two feet and its crown.
 *
 * A pointed arch is two arcs with offset centres, and the offset falls out of
 * the geometry — given a half-span s and a rise h, the centre sits at
 * (s² − h²)/2s along the springing line and the radius is (s² + h²)/2s. For
 * anything taller than it is wide that centre is below the springing and the
 * arch comes out pointed, which is what these are.
 *
 * Blocks yaw but do not pitch, so each voussoir is laid long-side-up where the
 * arc is running steeply and long-side-along where it is running flat. Laying
 * them all one way gives a staircase down the haunch, which is the part of
 * this building that has to look like one surface.
 */
function rib(B, ox, oz, yaw, s, h, thick, width, stone, mat, band, y0 = 0) {
  if (s < 0.5 || h < 0.5) return;
  const c = (s * s - h * h) / (2 * s);
  const R = s - c;
  const aTop = Math.acos(Math.max(-1, Math.min(1, -c / R)));
  const n = Math.max(4, Math.round((R * aTop) / stone));
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const seg = (R * aTop) / n;
  for (const sg of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      if (band && !band(f)) continue;
      const a = aTop * f;
      const q = sg * (c + R * Math.cos(a));
      const y = R * Math.sin(a);
      // The rib is deepest at the foot, where the thrust turns, and thinnest
      // at the crown — which is how it is actually cast.
      const t = thick * (1.35 - 0.5 * f);
      const steep = Math.abs(Math.cos(a)) < 0.62;
      B.add(ox + q * cy, y0 + y, oz - q * sy,
        steep ? t / 2 : seg / 2, steep ? seg / 2 : t / 2, width / 2, mat, yaw);
    }
  }
}

/** The ridge height of a shell, as a fraction of its rise, along its length. */
export function ridgeAt(t) {
  return t < 0.28
    ? 0.80 + 0.20 * Math.sin((t / 0.28) * (Math.PI / 2))
    : 0.06 + 0.94 * Math.pow(Math.cos(((t - 0.28) / 0.72) * (Math.PI / 2)), 0.85);
}

/** One shell: a pointed vault swept along the point and tapering to nothing. */
function sweep(B, sh, stone, mat, band) {
  const n = Math.max(6, Math.round(sh.len / (stone * 0.95)));
  const width = (sh.len / n) * 1.2;
  const sy = Math.sin(sh.yaw), cy = Math.cos(sh.yaw);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = sh.s * Math.pow(1 - t, 0.52);
    const h = sh.h * ridgeAt(t);
    const d = t * sh.len;
    rib(B, sh.x - d * sy, sh.z + d * cy, sh.yaw, s, h,
      Math.max(1.1, stone * 0.62), width, stone, mat, band, OPERA.deck);
  }
}

/**
 * The Opera House, podium and shells, as one structure.
 *
 * One and not two, because the shells stand on the deck and the deck stands on
 * the substructure: separate structures are placed on the terrain at their own
 * ground level and never learn about each other, and a set of shells that has
 * not heard of the podium is a set of shells with nothing under it. Built
 * together, the load runs where it really runs — and taking enough of the
 * podium out from under a vault brings the vault down with it, which is a line
 * of attack the level would not otherwise have.
 */
export function buildOperaHouse(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 2.3 * Math.min(s, 1.3);
  const courseH = 1.8 * Math.min(s, 1.3);
  const O = OPERA;

  buildPodium(B, stone, courseH);

  // The haunches first, as their own section: the low quarter of every rib,
  // which is the part of this building that is worth a shell.
  B.section('haunches', () => {
    for (const sh of O.shells) sweep(B, sh, stone, M.TILE, (f) => f < O.haunch);
  });
  B.section('shells', () => {
    for (const sh of O.shells) sweep(B, sh, stone, M.TILE, (f) => f >= O.haunch);
  });

  // The glass walls across the mouths. Bronze-framed glazing, which carries
  // nothing and is marked as carrying nothing, so the best-looking shot on the
  // map is also the emptiest.
  B.section('glass', () => {
    for (const sh of O.shells) {
      const h = sh.h * ridgeAt(0);
      const c = (sh.s * sh.s - h * h) / (2 * sh.s);
      const R = sh.s - c;
      const cy = Math.cos(sh.yaw), sy = Math.sin(sh.yaw);
      const step = stone * 1.05;
      for (let y = step / 2; y < h; y += step) {
        // How wide the mouth is at this height, on the same arc as the rib.
        const dy = y;
        const w = Math.sqrt(Math.max(0, R * R - dy * dy)) + c;
        if (w < step) continue;
        for (let q = -w + step / 2; q < w; q += step) {
          B.add(sh.x + q * cy, O.deck + y, sh.z - q * sy,
            step / 2, step / 2, 0.22, M.GLASS, sh.yaw);
        }
      }
    }
  });

  return B;
}

/**
 * The podium.
 *
 * Not a plinth: the podium is most of the building. The two halls, the foyers
 * and everything that is not roof are inside it, and it is built here the way
 * it is built there — a perimeter wall, a grid of cross walls carrying the
 * deck, and the monumental steps across the southern end, which is the one
 * side of Bennelong Point that is not water.
 */
function buildPodium(B, stone, courseH) {
  const O = OPERA;

  B.section('walls', () => {
    // The perimeter, with the podium's own arcade cut through the long faces.
    B.openings((x, y, z) => {
      if (y > O.arcadeH || Math.abs(x) < O.podiumX - O.wall * 1.2) return false;
      const k = z / 9.0;
      return Math.abs(k - Math.round(k)) < 0.30 && Math.abs(z) < O.podiumZ - 8;
    }, () => {
      let y = 0;
      let c = 0;
      while (y < O.podiumH - 0.001) {
        const h = Math.min(courseH, O.podiumH - y);
        B.ring(0, 0, O.podiumX * 2, O.podiumZ * 2, O.wall, y, h, stone,
          M.CONCRETE, c % 2);
        y += h; c++;
      }
    });
    // The substructure: cross walls on a grid, which is what holds the deck up
    // and what the player is really taking apart when the deck goes.
    for (let x = -O.podiumX + O.bayX; x < O.podiumX - 1; x += O.bayX) {
      B.slab(x, O.podiumH / 2, 0, O.wall * 0.8, O.podiumH,
        (O.podiumZ - O.wall) * 2, stone, M.CONCRETE);
    }
    for (let z = -O.podiumZ + O.bayZ; z < O.podiumZ - 1; z += O.bayZ) {
      B.slab(0, O.podiumH / 2, z, (O.podiumX - O.wall) * 2, O.podiumH,
        O.wall * 0.8, stone, M.CONCRETE);
    }
  });

  // The deck, which is the ground everything above stands on.
  B.section('deck', () => {
    const t = O.deck - O.podiumH;
    B.slab(0, O.podiumH + t / 2, 0, O.podiumX * 2 + 3, t,
      O.podiumZ * 2 + 3, stone, M.CONCRETE);
  });

  // The monumental steps, across the southern end.
  B.section('steps', () => {
    const n = Math.max(6, Math.round(O.deck / (courseH * 0.6)));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const y = O.deck * (1 - t);
      const z = -O.podiumZ - O.stepsRun * t;
      B.slab(0, y - courseH * 0.3, z, O.stepsW * (1 - t * 0.18), courseH * 0.6,
        (O.stepsRun / n) * 1.25, stone, M.CONCRETE);
    }
  });
}
