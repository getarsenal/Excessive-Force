import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Cathedral of the Intercession on the Moat — Saint Basil's — on Red
 * Square.
 *
 * Reference figures (the Moscow Kremlin Museums' own survey):
 *   Plan        eight churches set round a ninth, on one raised basement:
 *               four large ones on the axes, four small ones on the
 *               diagonals, the central one between them
 *   Height      47.5 m to the cross on the central tent; the bell tower,
 *               added in 1680, about 35 m
 *   Fabric      red brick with white limestone dressings, on a stone
 *               basement, with a vaulted gallery running round it
 *   Domes       painted in the 1680s; there is no two of them alike
 *
 * Built at 2x, like the Elizabeth Tower. At life size this is a
 * thirty-four-metre building, which from the distance this game plays at is a
 * garden ornament.
 *
 * ── The problem, and the trick ──
 *
 * Nine churches, and no single cut wins.
 *
 * Everything else in the campaign is one building with one load path, so the
 * whole level is the search for where that path is thinnest — a face to
 * undercut, a leg to take, four piers under a dome. Here there are nine of
 * them and they do not touch. Each tower is its own masonry column standing on
 * its own square of basement, and the only thing above ground connecting one
 * to the next is a gallery roof that carries nothing but itself. Drop the
 * central tent and eight churches stand there and watch. It is nine small
 * problems that happen to be adjacent, and the player looking for the weak
 * point is looking for something that does not exist.
 *
 * What they do share is underneath. The whole cathedral stands on one raised
 * basement — a single vaulted podklet of brick piers, built as one piece,
 * because the church above it was set out on it as one composition. That is
 * the economical move on this map and it is the opposite of everything the
 * campaign has taught: not up, but down. Open the basement under the eastern
 * side and four towers lose their footing together.
 */

const S = 2.0;
const TAU = Math.PI * 2;

export const BASIL = {
  scale: S,
  podHalf: 17.0 * S,
  podH: 4.2 * S,
  galleryH: 3.0 * S,          // the open gallery on top of the basement
  // The nine churches. `r` is the distance out from the centre, `a` the
  // bearing, `half` the half-width of its own square base, and the four
  // heights are where the base ends, the octagon ends, the drum ends and the
  // dome's cross stands.
  // Heights are measured from the deck of the basement and not from the
  // ground, because that is where every one of these towers starts: the
  // cathedral's famous 47.5 m includes the 4.2 m of basement under it.
  central: { half: 6.3 * S, base: 10.0 * S, oct: 19.5 * S, tent: 35.0 * S, top: 41.5 * S },
  axial: { r: 10.9 * S, half: 3.7 * S, base: 7.0 * S, oct: 15.5 * S, top: 28.0 * S },
  diag: { r: 13.4 * S, half: 2.9 * S, base: 6.0 * S, oct: 12.8 * S, top: 23.0 * S },
  bell: { x: 12.0 * S, z: 15.5 * S, half: 3.6 * S, shaft: 18.0 * S, top: 29.5 * S },
};

/**
 * The colours, as materials rather than as paint.
 *
 * There is no green, blue or gold in the stone palette and there is not going
 * to be: a material here is a density, a strength and a toughness before it is
 * a colour, and adding four of them so that a dome can be blue would put four
 * new structural behaviours into the game for a decorative reason. These are
 * the five the palette already has whose colours happen to land where Saint
 * Basil's does — and every one of them is a stone or a tile a dome could
 * honestly be covered in.
 */
const DOMES = [
  [M.VERDE, M.MARBLE], [M.SLATE, M.MARBLE], [M.SANDSTONE, M.VERDE],
  [M.VERDE, M.SANDSTONE], [M.SLATE, M.MARBLE], [M.SANDSTONE, M.MARBLE],
  [M.VERDE, M.MARBLE], [M.SLATE, M.SANDSTONE],
];

/**
 * An onion with spiral ribs, laid stone by stone.
 *
 * `BlockList.dome` takes one material for the whole shell, and a Saint Basil's
 * dome in one colour is a balloon. Every one of these is ribbed, and most of
 * them spiral — the ribs wind a few degrees per course, which is done here by
 * rotating the colour phase and not the geometry. It is also the only thing
 * that makes a pale dome read at all: the cream ones were invisible against a
 * hazy sky and three of the nine churches looked as though they had lost their
 * heads.
 */
function ribbedDome(B, cx, cz, y0, height, maxR, wall, courseH, stone, pair) {
  const RIBS = 10;
  const TWIST = 0.09;
  let y = y0;
  let course = 0;
  while (y < y0 + height - 0.001) {
    const h = Math.min(courseH, y0 + height - y);
    const t = (y + h / 2 - y0) / height;
    const r = maxR * onion(t);
    if (r <= wall * 1.2) {
      const w = Math.max(r * 2, stone * 0.7);
      B.slab(cx, y + h / 2, cz, w, h, w, stone, pair[0]);
    } else {
      const n = Math.max(12, Math.round((TAU * r) / stone));
      const seg = (TAU * r) / n;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + course * TWIST;
        const k = Math.floor((((a % TAU) + TAU) % TAU) / TAU * RIBS);
        B.add(cx + Math.cos(a) * r, y + h / 2, cz + Math.sin(a) * r,
          wall / 2, h / 2, seg / 2, k % 2 ? pair[1] : pair[0], -a);
      }
    }
    y += h;
    course++;
  }
}

/** An onion: out past the drum, then in to a point. */
function onion(t) {
  return Math.pow(Math.max(0, 1 - Math.pow(t, 1.7)), 0.55)
    * (0.80 + 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.6)));
}

/** A square tower of bonded brick, with white stone at its head. */
function squareTower(B, cx, cz, y0, y1, half, wall, stone, courseH) {
  let y = y0;
  let c = 0;
  while (y < y1 - 0.001) {
    const h = Math.min(courseH, y1 - y);
    // A white string course every sixth, and the cornice in white. Saint
    // Basil's is red brick *patterned* with white stone, and without the
    // pattern a fifty-metre tower is one flat slab of red.
    const white = y > y1 - courseH * 2.2 || c % 6 === 3;
    B.ring(cx, cz, half * 2, half * 2, wall, y, h, stone,
      white ? M.LIMESTONE : M.BRICK, c % 2,
      // A pilaster at each corner and a band under the cornice: the white
      // stone on this building is laid, not painted on.
      (x, z) => ((Math.abs(x - cx) > half - 1.4 * S && Math.abs(z - cz) > half - 1.4 * S)
        || white ? 0.30 * S : 0));
    y += h; c++;
  }
}

/** An octagon, which is what every one of these churches turns into. */
function octagon(B, cx, cz, y0, y1, r, wall, stone, courseH, mat) {
  let y = y0;
  let c = 0;
  while (y < y1 - 0.001) {
    const h = Math.min(courseH, y1 - y);
    B.polyRing(cx, cz, BlockList.circle(r, 8, Math.PI / 8), wall, y, h, stone,
      (y > y1 - courseH * 1.6 || c % 6 === 2) ? M.LIMESTONE : mat, c % 2);
    y += h; c++;
  }
}

/**
 * Drum, dome and cross: the head of one church.
 *
 * Three things make this building read vertical rather than as a row of silos,
 * and all three are here. The drum is *half* the width of the tower under it,
 * not three quarters — the first version's heads were as wide as their own
 * churches and the whole cathedral came out as a red brick tank farm. The
 * kokoshniki step the tower in to the drum in receding tiers of gables rather
 * than in one shoulder, which is what a Russian church does instead of a
 * cornice. And the onion is taller than it is wide and wider than the drum it
 * sits on, which is the only reason anyone would call it an onion.
 */
function head(B, cx, cz, y0, y1, half, stone, courseH, colour) {
  const r = half * 0.56;
  // The kokoshniki: three receding tiers between the octagon and the drum.
  const tiers = 3;
  let y = y0;
  for (let k = 0; k < tiers; k++) {
    const rr = half * 0.94 + (r * 1.22 - half * 0.94) * ((k + 1) / tiers);
    const h = courseH * 0.62;
    B.polyRing(cx, cz, BlockList.circle(rr, 8, Math.PI / 8), 1.2 * S, y, h,
      stone, k % 2 ? M.LIMESTONE : M.BRICK);
    y += h;
  }
  const drumH = (y1 - y) * 0.30;
  let c = 0;
  const drumTop = y + drumH;
  while (y < drumTop - 0.001) {
    const h = Math.min(courseH, drumTop - y);
    const n = Math.max(10, Math.round((TAU * r) / stone));
    B.polyRing(cx, cz, BlockList.circle(r, n, (c % 2) * 0.1), 0.85 * S, y, h,
      stone, M.BRICK, c % 2);
    y += h; c++;
  }
  const domeH = y1 - y;
  ribbedDome(B, cx, cz, y, domeH, r / onion(0), 0.75 * S, courseH * 0.5,
    stone, colour);
  // The cross. Gilt carries nothing and nothing rests on it, which is exactly
  // right for the one piece of this building that is above everything else.
  B.add(cx, y1 + 1.1 * S, cz, 0.22 * S, 1.3 * S, 0.22 * S, M.GILT);
  B.add(cx, y1 + 1.4 * S, cz, 1.0 * S, 0.22 * S, 0.22 * S, M.GILT);
}

export function buildSaintBasils(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 1.9 * Math.min(s, 1.3);
  const courseH = 1.5 * Math.min(s, 1.3);
  const C = BASIL;

  // ── The basement, and the gallery on it. One piece, because the nine
  // churches above it were set out on it as one composition — and because it
  // is the only thing on this map that more than one of them is standing on.
  B.section('podium', () => {
    const openW = 4.2 * S;
    B.openings((x, y, z) => {
      if (y > C.podH * 0.72 || y < C.podH * 0.12) return false;
      // Arched openings into the vaults, all four faces.
      const on = (u, v) => Math.abs(v) > C.podHalf - 3.2 * S
        && Math.abs((u / (openW * 2.1)) - Math.round(u / (openW * 2.1))) < 0.26;
      return on(x, z) || on(z, x);
    }, () => {
      let y = 0;
      let c = 0;
      while (y < C.podH - 0.001) {
        const h = Math.min(courseH, C.podH - y);
        B.ring(0, 0, C.podHalf * 2, C.podHalf * 2, 3.2 * S, y, h, stone,
          M.LIMESTONE, c % 2);
        y += h; c++;
      }
    });
    // The piers inside it, on the grid the churches stand on. This is what the
    // basement actually is and what is holding four towers up at a time.
    for (const px of [-1, 0, 1]) {
      for (const pz of [-1, 0, 1]) {
        if (!px && !pz) continue;
        B.slab(px * C.podHalf * 0.52, C.podH / 2, pz * C.podHalf * 0.52,
          5.6 * S, C.podH, 5.6 * S, stone, M.LIMESTONE);
      }
    }
    // The deck over the vaults, which is the churches' ground.
    B.slab(0, C.podH + courseH * 0.8, 0, C.podHalf * 2 + 1.4, courseH * 1.6,
      C.podHalf * 2 + 1.4, stone, M.LIMESTONE);
  });

  const deck = C.podH + courseH * 1.6;

  // ── The eight, then the ninth. Each one is its own column of brick from the
  // deck to its own cross, and none of them touches its neighbour.
  B.section('chapels', () => {
    for (let i = 0; i < 4; i++) {
      const a = i * (TAU / 4);
      const A = C.axial;
      const x = Math.cos(a) * A.r, z = Math.sin(a) * A.r;
      squareTower(B, x, z, deck, deck + A.base, A.half, 2.1 * S, stone, courseH);
      octagon(B, x, z, deck + A.base, deck + A.oct, A.half * 0.94, 1.8 * S,
        stone, courseH, M.BRICK);
      head(B, x, z, deck + A.oct, deck + A.top, A.half, stone, courseH,
        DOMES[i]);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * (TAU / 4) + Math.PI / 4;
      const D = C.diag;
      const x = Math.cos(a) * D.r, z = Math.sin(a) * D.r;
      squareTower(B, x, z, deck, deck + D.base, D.half, 1.9 * S, stone, courseH);
      octagon(B, x, z, deck + D.base, deck + D.oct, D.half * 0.94, 1.6 * S,
        stone, courseH, M.BRICK);
      head(B, x, z, deck + D.oct, deck + D.top, D.half, stone, courseH,
        DOMES[4 + i]);
    }
  });

  // ── The Intercession itself: square, then octagon, then the tent, which is
  // the only part of this cathedral that is genuinely tall and slender and the
  // only one anybody tries to shoot.
  B.section('tent', () => {
    const T = C.central;
    squareTower(B, 0, 0, deck, deck + T.base, T.half, 2.6 * S, stone, courseH);
    octagon(B, 0, 0, deck + T.base, deck + T.oct, T.half * 0.82, 2.2 * S,
      stone, courseH, M.BRICK);
    // The shatyor: an octagonal pyramid of brick, laid as courses stepping in.
    let y = deck + T.oct;
    const y1 = deck + T.tent;
    let c = 0;
    while (y < y1 - 0.001) {
      const h = Math.min(courseH, y1 - y);
      const t = (y - (deck + T.oct)) / (T.tent - T.oct);
      const r = T.half * 0.82 * (1 - t * 0.88);
      B.polyRing(0, 0, BlockList.circle(r, 8, Math.PI / 8), 1.5 * S, y, h,
        stone, c % 3 === 1 ? M.LIMESTONE : M.BRICK, c % 2);
      y += h; c++;
    }
    head(B, 0, 0, y1, deck + T.top, T.half * 0.46, stone, courseH,
      [M.GILT, M.GILT]);
  });

  // ── The bell tower, off the south-east corner, a hundred and thirty years
  // later and not part of the composition at all.
  B.section('belltower', () => {
    const L = C.bell;
    squareTower(B, L.x, L.z, deck, deck + L.shaft, L.half, 1.9 * S, stone, courseH);
    // The open belfry: an octagon with its eight faces cut through.
    B.openings((x, y, z) => {
      if (y < deck + L.shaft + courseH || y > deck + L.shaft + (L.top - L.shaft) * 0.34) return false;
      const a = Math.atan2(z - L.z, x - L.x);
      const k = (a / TAU) * 8;
      // Narrow. Eight openings a quarter of a bay wide each leave a skeleton
      // rather than a belfry, and a skeleton with a dome on it reads, from
      // three hundred metres, as an open drum with nothing on it at all.
      return Math.abs(k - Math.round(k)) < 0.15;
    }, () => {
      octagon(B, L.x, L.z, deck + L.shaft,
        deck + L.shaft + (L.top - L.shaft) * 0.48, L.half * 0.92, 1.5 * S,
        stone, courseH, M.BRICK);
    });
    head(B, L.x, L.z, deck + L.shaft + (L.top - L.shaft) * 0.48, deck + L.top,
      L.half, stone, courseH, [M.GILT, M.GILT]);
  });

  return B;
}

export const KREMLIN = {
  scale: S,
  len: 300,                  // the stretch of wall on the square
  height: 9.5 * S,
  thick: 3.4 * S,
  walkDrop: 2.4 * S,         // the wall-walk, below the merlons
  merlon: 2.1 * S,
  merlonStep: 3.9 * S,
  towers: [
    // [z along the wall, half-width, height, whether it has a gate under it]
    { z: 0, half: 6.6 * S, h: 34.0 * S, gate: true },      // Spasskaya
    { z: -112, half: 4.4 * S, h: 18.0 * S, gate: false },
    { z: 118, half: 4.4 * S, h: 20.0 * S, gate: false },
  ],
  offset: { x: -150, z: 0 },
};

/**
 * The Kremlin wall on Red Square, with the Spasskaya Tower in it.
 *
 * The other half of this level and the opposite kind of problem: where the
 * cathedral is nine slender towers that do not touch, this is one continuous
 * mass of brick three hundred metres long. Nothing here topples and nothing
 * here is slender — it comes down by being taken away, a bay at a time, which
 * is Giza's lesson at a twentieth of Giza's scale.
 *
 * It is also where the garrison is. A wall-walk behind swallowtail merlons is
 * the best firing position in the campaign short of the Eiffel Tower, and it
 * looks straight down the square at everything coming up it.
 */
export function buildKremlinWall(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 2.1 * Math.min(s, 1.3);
  const courseH = 1.6 * Math.min(s, 1.3);
  const K = KREMLIN;
  const half = K.len / 2;

  B.section('wall', () => {
    // The gate under the Spasskaya Tower, which is the one way through.
    B.openings((x, y, z) => y < K.height * 0.55 && Math.abs(z) < 4.6 * S
      && y > 1.0, () => {
      B.slab(0, K.height / 2, 0, K.thick, K.height, K.len, stone, M.BRICK);
    });
    // The wall-walk: the top of the wall is a step down between the merlons,
    // so a man on it has masonry to his chest and not to his knees.
    B.slab(0, K.height + courseH * 0.5, 0, K.thick * 0.55, courseH,
      K.len, stone, M.LIMESTONE);
    for (let z = -half + K.merlonStep; z < half; z += K.merlonStep) {
      B.slab(K.thick * 0.28, K.height + K.merlon / 2, z, K.thick * 0.44,
        K.merlon, K.merlonStep * 0.62, stone, M.BRICK);
      // The swallowtail: two horns with a notch between them.
      for (const sg of [-1, 1]) {
        B.slab(K.thick * 0.28, K.height + K.merlon + courseH * 0.55,
          z + sg * K.merlonStep * 0.19, K.thick * 0.44, courseH * 1.1,
          K.merlonStep * 0.22, stone, M.BRICK);
      }
    }
  });

  B.section('towers', () => {
    for (const t of K.towers) {
      squareTower(B, 0, t.z, 0, t.h * 0.62, t.half, 2.4 * S, stone, courseH);
      octagon(B, 0, t.z, t.h * 0.62, t.h * 0.80, t.half * 0.82, 1.9 * S,
        stone, courseH, M.BRICK);
      // A tented spire on the gate tower, a low one on the others.
      let y = t.h * 0.80;
      let c = 0;
      while (y < t.h - 0.001) {
        const h = Math.min(courseH, t.h - y);
        const f = (y - t.h * 0.80) / (t.h * 0.20);
        B.polyRing(0, t.z, BlockList.circle(t.half * 0.82 * (1 - f * 0.88), 8,
          Math.PI / 8), 1.3 * S, y, h, stone,
        c % 3 === 1 ? M.LIMESTONE : M.BRICK, c % 2);
        y += h; c++;
      }
      B.add(0, t.h + 1.6 * S, t.z, 0.9 * S, 1.2 * S, 0.9 * S, M.GILT);
    }
  });

  return B;
}
