import { KIT_MATS as M } from '../structure/landmarks/kit.js';

/**
 * The catalogued landmarks, as kit specs: the masonry half of `atlas.js`.
 *
 * Every figure is the real building's, in metres, from the usual published
 * dimensions, simplified to what a stone two metres on a side can say: the
 * plan, the storeys, the height of each tower and what caps it, the colour
 * of the stone and of the roof. `S` is how much bigger than life the level
 * builds it, which is what makes a gatehouse and a supertall the same kind
 * of fight. `yaw` is the opening camera's bearing (0 looks north from the
 * south), and every building's show front faces +z, south, toward it.
 *
 * The macros below are the recurring plans. Anything that is not one of
 * them is written out part by part.
 */

const G = 0.3;               // the gap between parts that must not share a face

/**
 * A church: nave, aisles, crossing and transepts, and a west front of one
 * tower, two, or none, facing +z.
 */
function cathedral(o) {
  const { L, W, H, mat, roofMat = M.SLATE, capMat = roofMat } = o;
  const parts = [];
  const aw = o.aisle ? o.aisle.w : 0;
  const cross = o.crossing || o.arm ? (o.crossZ ?? -L * 0.18) : null;
  const cw = W;
  const segs = cross == null ? [[-L / 2, L / 2]] : [[-L / 2, cross - cw / 2 - G], [cross + cw / 2 + G, L / 2]];
  segs.forEach(([a, b], i) => {
    const d = b - a, z = (a + b) / 2;
    const tag = i === segs.length - 1 ? 'nave' : 'choir';
    parts.push({ t: 'hall', tag, x: 0, z, w: W, d, h: H, roof: o.roof ?? 'gable', axis: 'z', roofH: o.roofH ?? W * 0.5, mat, roofMat, storey: H / 3, floors: 2 });
    if (o.aisle) {
      for (const s of [-1, 1]) {
        parts.push({ t: 'hall', tag: 'aisles', x: s * (W / 2 + G + aw / 2), z, w: aw, d, h: o.aisle.h, roof: 'flat', mat, storey: o.aisle.h / 2, floors: 1 });
      }
    }
  });
  if (cross != null) {
    const C = o.crossing;
    parts.push({ t: 'tower', tag: 'crossing', x: 0, z: cross, w: cw, h: C ? C.h : H, sides: C?.sides, round: !!C?.sides,
      cap: C ? C.cap : 'pyramid', capH: C ? C.capH : W * 0.5, mat, capMat: C?.capMat ?? capMat, taper: C?.taper ?? 1, finial: C?.finial });
    if (o.arm) {
      for (const s of [-1, 1]) {
        parts.push({ t: 'hall', tag: 'transept', x: s * (W / 2 + G + o.arm / 2), z: cross, w: o.arm, d: cw, h: H, roof: o.roof ?? 'gable', axis: 'x', roofH: o.roofH ?? cw * 0.5, mat, roofMat, storey: H / 3, floors: 1 });
      }
    }
  }
  const F = W + 2 * (aw + (aw ? G : 0));
  const T = o.towers;
  if (T) {
    const tw = T.w, z = L / 2 + G + tw / 2;
    const tower = (x) => ({ t: 'tower', tag: 'towers', x, z, w: tw, h: T.h, cap: T.cap ?? 'spire', capH: T.capH, capW: T.capW ?? tw * (T.taper ?? 1) * 0.72, capMat: T.capMat ?? capMat, mat: T.mat ?? mat, taper: T.taper ?? 1, finial: T.finial, sides: T.sides, round: !!T.sides });
    if (T.n === 1) parts.push(tower(0));
    else {
      const tx = Math.max(F / 2 - tw / 2, tw / 2 + G);
      parts.push(tower(-tx), tower(tx));
      const gap = 2 * tx - tw - 2 * G;
      if (gap > 4) parts.push({ t: 'hall', tag: 'front', x: 0, z, w: gap, d: tw * 0.8, h: H, roof: 'gable', axis: 'z', roofH: gap * 0.5, mat, roofMat, floors: 1 });
    }
  }
  return parts.concat(o.extra || []);
}

/** A domed church or monument: a central drum and dome, four arms, corner towers. */
function domed(o) {
  const { r, drumH, domeH, mat, domeMat = mat } = o;
  const parts = [{ t: 'tower', tag: 'dome', x: 0, z: 0, w: 2 * r, h: drumH, round: true, cap: o.profile ?? 'dome', capH: domeH, capMat: domeMat, mat,
    finial: o.lantern === false ? null : { cap: 'cone', w: Math.max(2, r * 0.22), h: o.lanternH ?? r * 0.5, mat: o.lanternMat ?? M.GOLD, round: true }, storey: o.storey }];
  const A = o.arms;
  if (A) {
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (A.skip && A.skip.some(([a, b]) => a === sx && b === sz)) continue;
      const len = (sz === 1 && A.front) ? A.front : A.len;
      const off = r + G + len / 2;
      const along = sx !== 0;
      parts.push({ t: 'hall', tag: 'arms', x: sx * off, z: sz * off, w: along ? len : A.w, d: along ? A.w : len, h: A.h, roof: A.roof ?? 'flat',
        axis: along ? 'x' : 'z', roofH: A.roofH, roofMat: A.roofMat ?? o.roofMat ?? domeMat, mat, storey: A.storey });
    }
  }
  const C = o.corners;
  if (C) {
    const aw = A ? A.w : 0;
    const c = C.off ?? Math.max((r + G) / Math.SQRT2 + C.w / 2 + G, aw / 2 + C.w / 2 + G);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      parts.push({ t: 'tower', tag: 'towers', x: sx * c, z: sz * c, w: C.w, h: C.h, round: !!C.round, cap: C.cap ?? 'dome', capH: C.capH ?? C.w * 0.7,
        capMat: C.capMat ?? domeMat, mat, finial: C.finial });
    }
  }
  return parts.concat(o.extra || []);
}

/** Four ranges round a courtyard: a palace quadrangle or a castle's ward. */
function quad(o) {
  const { w, d, h, depth, mat, roof = 'flat', roofMat } = o;
  const x0 = o.x ?? 0, z0 = o.z ?? 0;
  const tag = o.tag ?? 'ranges';
  const inner = d - 2 * depth - 2 * G;
  return [
    { t: 'hall', tag, x: x0, z: z0 + d / 2 - depth / 2, w, d: depth, h, roof, axis: 'x', roofH: o.roofH, mat, roofMat, storey: o.storey },
    { t: 'hall', tag, x: x0, z: z0 - d / 2 + depth / 2, w, d: depth, h, roof, axis: 'x', roofH: o.roofH, mat, roofMat, storey: o.storey },
    { t: 'hall', tag, x: x0 + w / 2 - depth / 2, z: z0, w: depth, d: inner, h, roof, axis: 'z', roofH: o.roofH, mat, roofMat, storey: o.storey },
    { t: 'hall', tag, x: x0 - w / 2 + depth / 2, z: z0, w: depth, d: inner, h, roof, axis: 'z', roofH: o.roofH, mat, roofMat, storey: o.storey },
  ];
}

/** A rectangle's corners as a closed outline. */
const rect = (w, d, x = 0, z = 0) => [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]];

/** A regular polygon outline. */
const poly = (r, n, rot = 0, x = 0, z = 0) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 + rot;
  return [x + Math.cos(a) * r, z + Math.sin(a) * r];
});

/** The shipping containers of a training range: a solid steel box each. */
const connex = (x, z, y0, mat, along = 'x') => ({
  t: 'steps', tag: 'connexes', x, z, y0, n: 1, h: 2.6, w: along === 'x' ? 12.2 : 2.44, d: along === 'x' ? 2.44 : 12.2,
  mat, coarse: 1.0, ground: false,
});

export const SPECS = {
  // ── Boot Camp ───────────────────────────────────────────────────────────
  tutorial: {
    // Finer than the catalogue's stone, so the lesson lasts the lesson, and
    // a real tower: sixty metres of concrete under a glass cab, a hundred in
    // the game. The ground is cleared three hundred metres round it — it is a
    // practice ground, and a battery wants room to be laid out in a row.
    S: 1.6, yaw: 0.55, mat: M.CONCRETE, fine: 0.7, clear: 300, budget: 1.4,
    parts: [
      { t: 'hall', tag: 'operations', x: 0, z: 18, w: 34, d: 16, h: 10.5, roof: 'flat', mat: M.LIMESTONE, storey: 3.5 },
      { t: 'tower', tag: 'tower', x: 0, z: -6, w: 13, h: 60, wall: 2.2, cap: 'flat', capH: 1.0, capW: 17, mat: M.CONCRETE, floors: 4, storey: 6, roofPosts: false },
      { t: 'hall', tag: 'cab', x: 0, z: -6, y0: 61, w: 16.4, d: 16.4, h: 5, roof: 'flat', roofH: 0.8, mat: M.CURTAIN, storey: 5, floors: 0, floorBelow: true, ground: false },
      { t: 'tower', tag: 'mast', x: 0, z: -6, y0: 66.8, w: 1.6, h: 12, cap: 'spire', capH: 3, mat: M.STEEL, capMat: M.STEEL, ground: false, roofPosts: false, windows: false, floors: 0 },
      connex(32, -18, 0, M.SANDSTONE), connex(32, -15, 0, M.VERDE), connex(32, -15, 2.6, M.LIMESTONE),
      connex(32, -12, 0, M.VERDE), connex(32, -3, 0, M.SANDSTONE), connex(32, 0, 0, M.LIMESTONE), connex(32, 0, 2.6, M.SANDSTONE),
      connex(32, 9, 0, M.VERDE), connex(32, 12, 0, M.SANDSTONE), connex(32, 12, 2.6, M.VERDE),
      connex(-28, -16, 0, M.VERDE, 'z'), connex(-31, -16, 0, M.SANDSTONE, 'z'), connex(-31, -16, 2.6, M.VERDE, 'z'),
      connex(-34, -16, 0, M.LIMESTONE, 'z'), connex(-28, 4, 0, M.SANDSTONE, 'z'), connex(-31, 4, 0, M.VERDE, 'z'),
    ],
  },

  // ── The catalogue ──
  // ── Europe ──────────────────────────────────────────────────────────────
  milan: {
    S: 1.1, yaw: 0.45, mat: M.MARBLE, roofMat: M.MARBLE,
    parts: cathedral({ L: 150, W: 19, H: 40, mat: M.MARBLE, roofMat: M.MARBLE, roofH: 8,
      aisle: { w: 24, h: 30 }, arm: 14, crossing: { h: 58, cap: 'spire', capH: 44, sides: 8, capMat: M.MARBLE, finial: { cap: 'spire', w: 1.4, h: 5, mat: M.GOLD } } }),
  },
  stvitus: {
    S: 1.2, yaw: -0.5, mat: M.VERDE, roofMat: M.SLATE,
    parts: cathedral({ L: 124, W: 16, H: 33, mat: M.VERDE, aisle: { w: 10, h: 18 }, arm: 10,
      crossing: { h: 40, cap: 'pyramid', capH: 10 },
      towers: { n: 2, w: 11, h: 48, cap: 'spire', capH: 34 },
      extra: [{ t: 'tower', tag: 'greattower', x: 22, z: -22, w: 14, h: 62, cap: 'onion', capH: 26, capMat: M.VERDE, mat: M.VERDE, floors: 3 }] }),
  },
  ulm: {
    S: 1.0, yaw: 0.5, mat: M.LIMESTONE, roofMat: M.BRICK,
    parts: cathedral({ L: 110, W: 15, H: 41, mat: M.LIMESTONE, roofMat: M.BRICK, aisle: { w: 12, h: 20 },
      towers: { n: 1, w: 22, h: 75, cap: 'spire', capH: 86, capMat: M.LIMESTONE },
      extra: [
        { t: 'tower', tag: 'choirtowers', x: -9, z: -60, w: 7, h: 50, cap: 'spire', capH: 36, capMat: M.LIMESTONE, mat: M.LIMESTONE },
        { t: 'tower', tag: 'choirtowers', x: 9, z: -60, w: 7, h: 50, cap: 'spire', capH: 36, capMat: M.LIMESTONE, mat: M.LIMESTONE },
      ] }),
  },
  brandenburg: {
    S: 2.2, yaw: 0.35, mat: M.LIMESTONE,
    parts: [
      { t: 'colonnade', tag: 'gate', x: 0, z: 0, w: 41, d: 11, podH: 0.8, colH: 14, colW: 1.7, bay: 7.4, rows: 'twin', entH: 2.6, roof: 'flat', roofH: 1.2, attic: 4.5, atticMat: M.LIMESTONE, mat: M.LIMESTONE },
      { t: 'tower', tag: 'quadriga', x: 0, z: 0, y0: 19.9, w: 6, d: 3, h: 3, cap: 'flat', capH: 0.6, mat: M.VERDE, roofPosts: false, windows: false, floors: 0 },
      { t: 'hall', tag: 'pavilions', x: -26, z: 0, w: 10, d: 12, h: 11, roof: 'flat', mat: M.LIMESTONE, storey: 5.5 },
      { t: 'hall', tag: 'pavilions', x: 26, z: 0, w: 10, d: 12, h: 11, roof: 'flat', mat: M.LIMESTONE, storey: 5.5 },
    ],
  },
  stephansdom: {
    S: 1.1, yaw: 0.6, mat: M.LIMESTONE, roofMat: M.GOLD,
    parts: cathedral({ L: 104, W: 34, H: 28, mat: M.LIMESTONE, roofMat: M.GOLD, roofH: 26,
      towers: { n: 2, w: 9, h: 48, cap: 'spire', capH: 18, capMat: M.VERDE },
      extra: [
        { t: 'tower', tag: 'southtower', x: 27, z: -8, w: 16, h: 70, cap: 'spire', capH: 66, capW: 9.5, capMat: M.LIMESTONE, mat: M.LIMESTONE, taper: 0.8, floors: 3 },
        { t: 'tower', tag: 'northtower', x: -26, z: -8, w: 14, h: 60, cap: 'onion', capH: 10, capMat: M.VERDE, mat: M.LIMESTONE },
      ] }),
  },
  hohensalzburg: {
    S: 0.9, yaw: -0.4, mat: M.TILE, roofMat: M.BRICK,
    parts: [
      { t: 'curtain', tag: 'curtain', pts: [[-110, -40], [-40, -70], [60, -60], [115, -10], [90, 50], [-10, 70], [-100, 40]], h: 16, thick: 4, mat: M.TILE,
        towers: { w: 12, h: 24, round: true, cap: 'cone', capH: 9, capMat: M.BRICK, mat: M.TILE } },
      { t: 'hall', tag: 'hoherstock', x: 0, z: 0, w: 44, d: 30, h: 32, roof: 'hip', roofH: 12, mat: M.TILE, roofMat: M.BRICK, storey: 6.4 },
      { t: 'tower', tag: 'keep', x: 36, z: -22, w: 14, h: 40, cap: 'onion', capH: 12, capMat: M.VERDE, mat: M.TILE },
      { t: 'hall', tag: 'ranges', x: -60, z: 5, w: 40, d: 18, h: 18, roof: 'gable', roofH: 8, axis: 'x', mat: M.TILE, roofMat: M.BRICK },
      { t: 'hall', tag: 'ranges', x: 55, z: 30, w: 34, d: 16, h: 16, roof: 'gable', roofH: 7, axis: 'x', mat: M.TILE, roofMat: M.BRICK },
    ],
  },
  versailles: {
    // The palace laid out from the town: the old brick-and-stone hunting
    // lodge round the Marble Court with its gilded roofs, the two arms of
    // the corps de logis reaching forward from it to the Royal Court, the
    // ministers' wings either side of the forecourt, the Royal Chapel with
    // its tall roof, and the garden front behind: the Hall of Mirrors in
    // the middle and the North and South Wings running away from it, three
    // storeys of stone under a flat roof and a balustrade.
    S: 0.85, yaw: 0.25, mat: M.LIMESTONE, roofMat: M.SLATE, budget: 1.6,
    parts: [
      // The garden front: the corps de logis and the two great wings, three
      // storeys of stone with the slate roofs drawn up behind the balustrade.
      { t: 'hall', tag: 'corps', x: 0, z: 30, w: 150, d: 34, h: 26, roof: 'hip', roofH: 7, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 8.6 },
      { t: 'hall', tag: 'wings', x: -140, z: 50, w: 130, d: 30, h: 23, roof: 'hip', roofH: 6, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 7.6 },
      { t: 'hall', tag: 'wings', x: 140, z: 50, w: 130, d: 30, h: 23, roof: 'hip', roofH: 6, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 7.6 },
      // The end pavilions of the wings, a storey proud of them.
      ...[-1, 1].map((s) => ({ t: 'tower', tag: 'wings', x: s * 212, z: 50, w: 22, d: 36, h: 27, cap: 'hip', capH: 8, capMat: M.SLATE, mat: M.LIMESTONE, floors: 3 })),
      // The arms of the corps de logis toward the town, slate mansards.
      ...[-1, 1].map((s) => ({ t: 'hall', tag: 'corps', x: s * 55, z: -30, w: 30, d: 90, h: 24, roof: 'hip', roofH: 11, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 8 })),
      // The Marble Court: Louis XIII's lodge, brick and stone, gilded roofs.
      { t: 'hall', tag: 'marblecourt', x: 0, z: -40, w: 70, d: 18, h: 22, roof: 'hip', roofH: 11, mat: M.BRICK, roofMat: M.SLATE, storey: 7.2 },
      { t: 'tower', tag: 'marblecourt', x: 0, z: -40, y0: 22, w: 26, d: 16, h: 7, cap: 'hip', capH: 9, capMat: M.GOLD, mat: M.LIMESTONE, ground: false, floors: 0 },
      ...[-1, 1].map((s) => ({ t: 'hall', tag: 'marblecourt', x: s * 28, z: -62, w: 14, d: 30, h: 20, roof: 'hip', roofH: 10, mat: M.BRICK, roofMat: M.SLATE, storey: 6.6 })),
      ...[-1, 1].map((s) => ({ t: 'tower', tag: 'marblecourt', x: s * 28, z: -76, w: 12, d: 6, h: 22, cap: 'pyramid', capH: 6, capMat: M.GOLD, mat: M.BRICK, floors: 2 })),
      // The ministers' wings, either side of the forecourt.
      ...[-1, 1].map((s) => ({ t: 'hall', tag: 'ministers', x: s * 95, z: -100, w: 26, d: 110, h: 20, roof: 'hip', roofH: 10, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 6.8 })),
      ...[-1, 1].map((s) => ({ t: 'tower', tag: 'ministers', x: s * 95, z: -158, w: 30, d: 14, h: 22, cap: 'hip', capH: 9, capMat: M.SLATE, mat: M.LIMESTONE, floors: 2 })),
      // The Royal Chapel: the tallest roof on the palace, a gilded ridge
      // and a lantern on it.
      { t: 'hall', tag: 'chapel', x: -100, z: 5, w: 26, d: 56, h: 34, roof: 'gable', axis: 'z', roofH: 18, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 11 },
      { t: 'tower', tag: 'chapel', x: -100, z: 5, y0: 44, w: 5, d: 5, h: 8, cap: 'spire', capH: 8, capMat: M.GOLD, mat: M.GOLD, ground: false, floors: 0 },
      // The roof pavilions over the garden front's centre.
      ...[-1, 0, 1].map((s) => ({ t: 'tower', tag: 'corps', x: s * 50, z: 30, y0: 26, w: 18, d: 12, h: 4, cap: 'hip', capH: 4, capMat: M.GOLD, mat: M.LIMESTONE, ground: false, floors: 0 })),
      // The gilded Royal Gate across the forecourt.
      { t: 'box', tag: 'gate', x: 0, z: -172, w: 110, d: 1.6, h: 4.5, mat: M.GOLD },
      ...[-1, 1].map((s) => ({ t: 'tower', tag: 'gate', x: s * 14, z: -172, w: 4, d: 4, h: 9, cap: 'pyramid', capH: 2, capMat: M.GOLD, mat: M.LIMESTONE, floors: 0 })),
    ],
  },
  chambord: {
    S: 1.0, yaw: 0.5, mat: M.TILE, roofMat: M.SLATE,
    parts: [
      { t: 'curtain', tag: 'enceinte', pts: rect(150, 110), h: 14, thick: 6, mat: M.TILE,
        towers: { w: 18, h: 24, round: true, cap: 'cone', capH: 14, capMat: M.SLATE, mat: M.TILE } },
      { t: 'hall', tag: 'donjon', x: 0, z: -12, w: 44, d: 44, h: 30, roof: 'flat', roofH: 1.2, mat: M.TILE, storey: 7.5 },
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ t: 'tower', tag: 'donjontowers', x: sx * 27, z: -12 + sz * 27, w: 18, h: 30, round: true, cap: 'cone', capH: 16, capMat: M.SLATE, mat: M.TILE, ground: false })),
      { t: 'tower', tag: 'lantern', x: 0, z: -12, y0: 31.2, w: 10, h: 10, round: true, cap: 'cone', capH: 14, capMat: M.SLATE, mat: M.TILE, ground: false, roofPosts: false },
    ],
  },
  seville: {
    // The largest Gothic cathedral in the world: a hall church five aisles
    // wide under stepped flat roofs, the nave and transept rising over them
    // with a lantern at the crossing, a forest of buttress pinnacles down both
    // flanks, the Court of the Oranges walled off the north side and the
    // Giralda at its corner: a Moorish brick shaft with a Renaissance belfry
    // in three white stages on top.
    S: 1.0, yaw: -0.55, mat: M.LIMESTONE, roofMat: M.LIMESTONE,
    parts: [
      { t: 'hall', tag: 'cathedral', x: 0, z: 0, w: 76, d: 116, h: 26, roof: 'flat', roofH: 1.2, mat: M.LIMESTONE, storey: 9, bay: 8 },
      { t: 'hall', tag: 'nave', x: 0, z: 0, y0: 26, w: 22, d: 108, h: 14, roof: 'gable', axis: 'z', roofH: 7, mat: M.LIMESTONE, roofMat: M.LIMESTONE, storey: 7, ground: false },
      { t: 'hall', tag: 'nave', x: 0, z: 6, y0: 26, w: 70, d: 18, h: 14, roof: 'gable', axis: 'x', roofH: 7, mat: M.LIMESTONE, roofMat: M.LIMESTONE, storey: 7, ground: false },
      { t: 'tower', tag: 'crossing', x: 0, z: 6, y0: 40, w: 16, h: 8, sides: 8, cap: 'dome', capH: 9, capMat: M.LIMESTONE, mat: M.LIMESTONE, ground: false, floors: 0,
        finial: { cap: 'spire', w: 2, h: 5, mat: M.LIMESTONE } },
      ...[-1, 1].flatMap((s) => [-48, -33, -18, -3, 12, 27, 42].map((z) => ({ t: 'tower', tag: 'pinnacles', x: s * 39.5, z, w: 3.4, h: 30, cap: 'spire', capH: 9, capMat: M.LIMESTONE, mat: M.LIMESTONE, floors: 0, windows: false, roofPosts: false }))),
      { t: 'hall', tag: 'sagrario', x: -46, z: 30, w: 16, d: 44, h: 22, roof: 'flat', mat: M.LIMESTONE, storey: 7 },
      { t: 'curtain', tag: 'naranjos', pts: [[-36, -60], [36, -60], [36, -112], [-36, -112]], h: 9, thick: 2.2, mat: M.LIMESTONE },
      { t: 'tower', tag: 'giralda', x: 50, z: -52, w: 13.6, h: 70, mat: M.REDSTONE, cap: 'flat', capH: 1, floors: 3 },
      { t: 'tower', tag: 'belfry', x: 50, z: -52, y0: 71, w: 11, h: 10, mat: M.MARBLE, cap: 'flat', capH: 0.8, ground: false, floors: 1 },
      { t: 'tower', tag: 'belfry', x: 50, z: -52, y0: 81.8, w: 8.4, h: 8, mat: M.MARBLE, cap: 'flat', capH: 0.6, ground: false, floors: 0 },
      { t: 'tower', tag: 'belfry', x: 50, z: -52, y0: 90.4, w: 6, h: 6, round: true, mat: M.MARBLE, cap: 'dome', capH: 5, capMat: M.GOLD, ground: false, floors: 0,
        finial: { cap: 'spire', w: 1.4, h: 5, mat: M.GOLD } },
    ],
  },
  alhambra: {
    // The red fortress along the Sabika hill: the Alcazaba at the west end
    // with the Torre de la Vela over the city, the Nasrid palaces round their
    // courts behind the Comares tower, Charles V's square palace, the church
    // of Santa Maria, and the curtain round the whole ridge with a square
    // tower every few dozen metres, each battlemented.
    S: 1.0, yaw: 0.4, mat: M.REDSTONE, roofMat: M.BRICK, budget: 1.3,
    parts: [
      { t: 'curtain', tag: 'alcazaba', pts: [[-150, -24], [-118, -48], [-70, -56], [-10, -58], [40, -54], [92, -46], [150, -22], [138, 28], [80, 40], [20, 46], [-40, 44], [-100, 36], [-150, 18]], h: 13, thick: 3.2, mat: M.REDSTONE,
        towers: { w: 10, h: 20, cap: 'flat', capH: 1, mat: M.REDSTONE } },
      // The Alcazaba's own inner wall and the watchtower.
      { t: 'curtain', tag: 'alcazaba', pts: [[-148, -18], [-118, -40], [-92, -36], [-92, 28], [-146, 14]], h: 15, thick: 3, mat: M.REDSTONE,
        towers: { w: 9, h: 21, cap: 'flat', capH: 1, mat: M.REDSTONE } },
      { t: 'tower', tag: 'vela', x: -128, z: -6, w: 16, h: 27, cap: 'flat', capH: 1, mat: M.REDSTONE, floors: 3 },
      { t: 'tower', tag: 'vela', x: -128, z: -6, y0: 28, w: 4, h: 5, cap: 'pyramid', capH: 3, capMat: M.BRICK, mat: M.REDSTONE, ground: false, floors: 0 },
      // The Nasrid palaces: Comares, the Court of the Myrtles, the Court of the Lions.
      { t: 'tower', tag: 'comares', x: -30, z: -40, w: 16, h: 45, cap: 'flat', capH: 1, mat: M.REDSTONE, floors: 3 },
      { t: 'hall', tag: 'nasrid', x: -30, z: -14, w: 22, d: 36, h: 10, roof: 'hip', roofH: 4, mat: M.TILE, roofMat: M.BRICK, storey: 5 },
      { t: 'hall', tag: 'nasrid', x: -6, z: -16, w: 30, d: 12, h: 10, roof: 'hip', roofH: 4, mat: M.TILE, roofMat: M.BRICK, storey: 5 },
      { t: 'colonnade', tag: 'nasrid', x: 6, z: 6, w: 30, d: 18, podH: 0.6, colH: 5, colW: 0.8, bay: 3, rows: 'ring', roof: 'hip', roofH: 4, roofMat: M.BRICK, mat: M.TILE },
      ...[-1, 1].map((s) => ({ t: 'tower', tag: 'nasrid', x: 6 + s * 15, z: 6, w: 6, h: 12, cap: 'pyramid', capH: 4, capMat: M.BRICK, mat: M.TILE, floors: 0 })),
      // Charles V's palace: a square of stone round a round court.
      { t: 'hall', tag: 'carlosv', x: 50, z: -8, w: 63, d: 63, h: 17, roof: 'flat', mat: M.LIMESTONE, storey: 8.5 },
      // Santa Maria, with its belfry.
      { t: 'hall', tag: 'church', x: 92, z: 12, w: 34, d: 14, h: 14, roof: 'gable', axis: 'x', roofH: 5, mat: M.LIMESTONE, roofMat: M.BRICK, storey: 7 },
      { t: 'tower', tag: 'church', x: 110, z: 12, w: 7, h: 22, cap: 'pyramid', capH: 5, capMat: M.BRICK, mat: M.LIMESTONE, floors: 2 },
      // The Partal and the Torre de las Damas, on the north wall.
      { t: 'hall', tag: 'nasrid', x: 20, z: 36, w: 20, d: 10, h: 9, roof: 'hip', roofH: 4, mat: M.TILE, roofMat: M.BRICK, storey: 4.5 },
    ],
  },
  malbork: {
    S: 1.1, yaw: 0.5, mat: M.BRICK, roofMat: M.BRICK,
    parts: [
      ...quad({ w: 62, d: 62, h: 22, depth: 13, mat: M.BRICK, roof: 'gable', roofH: 12, roofMat: M.BRICK, tag: 'highcastle' }),
      { t: 'tower', tag: 'maintower', x: 38, z: -26, w: 11, h: 52, cap: 'pyramid', capH: 10, capW: 7, capMat: M.BRICK, mat: M.BRICK, floors: 3 },
      ...quad({ x: -30, z: 70, w: 110, d: 60, h: 16, depth: 12, mat: M.BRICK, roof: 'gable', roofH: 9, roofMat: M.BRICK, tag: 'middlecastle' }),
    ],
  },
  warsaw: {
    // Full size among its real neighbours: see shanghaitower.
    S: 1, yaw: 0.3, mat: M.LIMESTONE, roofMat: M.LIMESTONE,
    parts: [
      { t: 'tower', tag: 'tower', x: 0, z: 0, w: 42, d: 42, h: 120, cap: 'flat', capH: 1.5, mat: M.LIMESTONE, floors: 3, taper: 0.8 },
      { t: 'tower', tag: 'tower', x: 0, z: 0, y0: 121.5, w: 22, h: 45, cap: 'flat', capH: 1, mat: M.LIMESTONE, ground: false, roofPosts: false },
      { t: 'tower', tag: 'spire', x: 0, z: 0, y0: 167.5, w: 10, h: 12, cap: 'spire', capH: 55, capMat: M.GOLD, mat: M.LIMESTONE, ground: false, roofPosts: false },
      { t: 'hall', tag: 'wings', x: -58, z: 0, w: 73, d: 60, h: 30, roof: 'flat', mat: M.LIMESTONE, storey: 7.5 },
      { t: 'hall', tag: 'wings', x: 58, z: 0, w: 73, d: 60, h: 30, roof: 'flat', mat: M.LIMESTONE, storey: 7.5 },
      ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => ({ t: 'tower', tag: 'corners', x: sx * 34, z: sz * 34, w: 12, h: 58, cap: 'spire', capH: 18, capMat: M.LIMESTONE, mat: M.LIMESTONE })),
    ],
  },
  bran: {
    // "Dracula's Castle": a white-rendered castle of four storeys round a
    // tiny courtyard, packed onto the top of a rock that stands sixty metres
    // over the pass, its red-tiled roofs at every height and a tower on every
    // corner: the round tower on the east, the square keep on the south-west,
    // the gate tower and a turret on the north.
    S: 2.0, yaw: -0.4, mat: M.TILE, roofMat: M.BRICK,
    parts: [
      { t: 'steps', tag: 'rock', base: true, x: 0, z: 0, w: 40, d: 32, h: 14, n: 3, wTop: 30, dTop: 25, batter: 0.25, mat: M.GRANITE, posts: false, ground: false, coarse: 2.2 },
      { t: 'hall', tag: 'castle', x: 0, z: -9, y0: 14, w: 26, d: 7, h: 14, roof: 'gable', axis: 'x', roofH: 5, mat: M.TILE, roofMat: M.BRICK, storey: 3.6, ground: false },
      { t: 'hall', tag: 'castle', x: 0, z: 9, y0: 14, w: 26, d: 7, h: 12, roof: 'gable', axis: 'x', roofH: 5, mat: M.TILE, roofMat: M.BRICK, storey: 3.6, ground: false },
      { t: 'hall', tag: 'castle', x: -10.5, z: 0, y0: 14, w: 7, d: 11, h: 16, roof: 'gable', axis: 'z', roofH: 5, mat: M.TILE, roofMat: M.BRICK, storey: 3.6, ground: false },
      { t: 'hall', tag: 'castle', x: 10.5, z: 0, y0: 14, w: 7, d: 11, h: 13, roof: 'gable', axis: 'z', roofH: 5, mat: M.TILE, roofMat: M.BRICK, storey: 3.6, ground: false },
      { t: 'tower', tag: 'towers', x: 15, z: 4, y0: 14, w: 9, h: 21, round: true, cap: 'cone', capH: 9, capMat: M.BRICK, mat: M.TILE, ground: false },
      { t: 'tower', tag: 'towers', x: -13, z: 10, y0: 14, w: 7.5, h: 24, cap: 'pyramid', capH: 8, capMat: M.BRICK, mat: M.TILE, ground: false },
      { t: 'tower', tag: 'towers', x: -4, z: -12.5, y0: 14, w: 6, h: 20, cap: 'pyramid', capH: 7, capMat: M.BRICK, mat: M.TILE, ground: false },
      { t: 'tower', tag: 'towers', x: 12.5, z: -10.5, y0: 14, w: 4.5, h: 18, round: true, cap: 'cone', capH: 6, capMat: M.BRICK, mat: M.TILE, ground: false },
    ],
  },
  bucharest: {
    S: 0.7, yaw: 0.35, mat: M.MARBLE,
    parts: [
      ...quad({ w: 240, d: 150, h: 42, depth: 45, mat: M.MARBLE, roof: 'flat', roofH: 2, storey: 7, tag: 'palace' }),
      { t: 'hall', tag: 'core', x: 0, z: 0, w: 148.8, d: 58.8, h: 70, roof: 'flat', roofH: 2, mat: M.MARBLE, storey: 7, ground: false },
      { t: 'colonnade', tag: 'portico', x: 0, z: 87, w: 90, d: 20, podH: 2, colH: 18, colW: 2.2, bay: 6.5, rows: 'front', roof: 'flat', mat: M.MARBLE },
    ],
  },
  kronborg: {
    S: 1.1, yaw: 0.55, mat: M.LIMESTONE, roofMat: M.VERDE,
    parts: [
      { t: 'steps', tag: 'bastions', base: true, x: 0, z: 0, w: 150, d: 150, h: 7, n: 1, batter: 0.5, mat: M.VERDE, coarse: 3, posts: true },
      ...quad({ y0: 7, w: 80, d: 80, h: 20, depth: 13, mat: M.LIMESTONE, roof: 'hip', roofH: 10, roofMat: M.VERDE, tag: 'castle' }).map((p) => ({ ...p, y0: 7, ground: false })),
      { t: 'tower', tag: 'towers', x: 40, z: 40, y0: 7, w: 10, h: 38, cap: 'spire', capH: 30, capMat: M.VERDE, mat: M.LIMESTONE, ground: false },
      { t: 'tower', tag: 'towers', x: -40, z: 40, y0: 7, w: 9, h: 32, cap: 'onion', capH: 16, capMat: M.VERDE, mat: M.LIMESTONE, ground: false },
      { t: 'tower', tag: 'towers', x: -40, z: -40, y0: 7, w: 12, h: 30, cap: 'spire', capH: 20, capMat: M.VERDE, mat: M.LIMESTONE, ground: false },
    ],
  },
  stockholm: {
    S: 1.0, yaw: 0.45, mat: M.LIMESTONE,
    parts: [
      ...quad({ w: 120, d: 115, h: 30, depth: 20, mat: M.LIMESTONE, roof: 'flat', roofH: 1.4, storey: 6, tag: 'palace' }),
      { t: 'hall', tag: 'wings', x: -40, z: 76, w: 24, d: 35.4, h: 24, roof: 'flat', roofH: 1.4, mat: M.LIMESTONE, storey: 6 },
      { t: 'hall', tag: 'wings', x: 40, z: 76, w: 24, d: 35.4, h: 24, roof: 'flat', roofH: 1.4, mat: M.LIMESTONE, storey: 6 },
    ],
  },
  hallgrimskirkja: {
    S: 1.8, yaw: 0.4, mat: M.TILE, roofMat: M.CONCRETE,
    parts: [
      { t: 'tower', tag: 'tower', x: 0, z: 18, w: 11, d: 9, h: 60, cap: 'spire', capH: 14.5, capMat: M.TILE, mat: M.TILE, floors: 3 },
      ...[1, 2, 3, 4].flatMap((i) => [-1, 1].map((s) => ({ t: 'hall', tag: 'wings', x: s * (5.5 + G + (i - 0.5) * 5.1), z: 18, w: 4.8, d: 9, h: 50 - i * 9, roof: 'flat', roofH: 0.8, mat: M.TILE, storey: 5, floors: 1 }))),
      { t: 'hall', tag: 'nave', x: 0, z: -10.5, w: 26, d: 38.4, h: 18, roof: 'gable', axis: 'z', roofH: 14, mat: M.TILE, roofMat: M.CONCRETE, storey: 6 },
    ],
  },
  trakai: {
    S: 1.6, yaw: -0.5, mat: M.BRICK, roofMat: M.BRICK,
    parts: [
      { t: 'curtain', tag: 'bailey', pts: rect(70, 60, 0, 15), h: 9, thick: 2.2, mat: M.BRICK,
        towers: { w: 8, h: 16, round: true, cap: 'cone', capH: 7, capMat: M.BRICK, mat: M.BRICK } },
      ...quad({ z: -35, w: 36, d: 30, h: 16, depth: 9, mat: M.BRICK, roof: 'gable', roofH: 7, roofMat: M.BRICK, tag: 'palace' }),
      { t: 'tower', tag: 'donjon', x: 0, z: -12, w: 11, h: 32, cap: 'pyramid', capH: 9, capMat: M.BRICK, mat: M.BRICK, floors: 3 },
    ],
  },
  winterpalace: {
    S: 0.9, yaw: 0.4, mat: M.VERDE, roofMat: M.SLATE,
    parts: [
      ...quad({ w: 200, d: 160, h: 23, depth: 26, mat: M.VERDE, roof: 'flat', roofH: 1.6, storey: 7.6, tag: 'palace' }),
      { t: 'colonnade', tag: 'portico', x: 0, z: 84, w: 60, d: 7, podH: 0.8, colH: 20, colW: 1.4, bay: 4.2, rows: 'front', roof: 'flat', mat: M.MARBLE },
    ],
  },
  belem: {
    S: 3.0, yaw: 0.5, mat: M.MARBLE,
    parts: [
      { t: 'hall', tag: 'bastion', x: 0, z: 6, w: 28, d: 18, h: 10, roof: 'flat', roofH: 1, mat: M.MARBLE, storey: 5 },
      { t: 'tower', tag: 'tower', x: 0, z: -9.3, w: 12, h: 30, cap: 'flat', capH: 1, mat: M.MARBLE, floors: 3 },
      ...[[-1, 1], [1, 1]].map(([sx, sz]) => ({ t: 'tower', tag: 'turrets', x: sx * 15.5, z: 6 + sz * 10.5, w: 3, h: 13, round: true, cap: 'dome', capH: 2.2, capMat: M.MARBLE, mat: M.MARBLE, ground: false, windows: false, floors: 0, roofPosts: false })),
      ...[[-1, -1], [1, -1]].map(([sx]) => ({ t: 'tower', tag: 'turrets', x: sx * 7.9, z: -15, y0: 30, w: 2.6, h: 5, round: true, cap: 'dome', capH: 2, capMat: M.MARBLE, mat: M.MARBLE, ground: false, windows: false, floors: 0, roofPosts: false })),
    ],
  },
  salisbury: {
    S: 1.1, yaw: 0.6, mat: M.LIMESTONE, roofMat: M.SLATE,
    parts: cathedral({ L: 135, W: 12, H: 25, mat: M.LIMESTONE, aisle: { w: 8, h: 13 }, arm: 22,
      crossing: { h: 62, cap: 'spire', capH: 61, capMat: M.LIMESTONE },
      extra: [{ t: 'hall', tag: 'front', x: 0, z: 68.8, w: 34, d: 2.4, h: 32, roof: 'flat', roofH: 0.8, mat: M.LIMESTONE, windows: false, floors: 0, roofPosts: false, ground: false }] }),
  },
  windsor: {
    // The longest-inhabited castle in Europe, along its chalk ridge over the
    // Thames: the Round Tower on its motte in the Middle Ward, the Upper Ward
    // to the east closed by the State Apartments and the private apartments
    // round a quadrangle, the Lower Ward to the west with St George's Chapel
    // (Perpendicular, a pinnacle on every buttress) and the ranges along its
    // walls, the curtain round the lot with a tower every sixty metres.
    S: 0.9, yaw: -0.3, mat: M.LIMESTONE, roofMat: M.SLATE,
    parts: [
      { t: 'curtain', tag: 'curtain', pts: [[-135, -34], [-60, -44], [-10, -46], [50, -50], [122, -44], [124, 44], [50, 48], [-10, 40], [-70, 38], [-135, 30]], h: 14, thick: 3.2, mat: M.LIMESTONE,
        towers: { w: 11, h: 21, cap: 'flat', capH: 1, mat: M.LIMESTONE } },
      // Middle Ward: the motte and the Round Tower, a flag turret on it.
      { t: 'steps', tag: 'motte', base: true, x: -5, z: 0, w: 52, h: 16, n: 2, wTop: 38, round: true, mat: M.TURF, posts: true },
      { t: 'tower', tag: 'roundtower', x: -5, z: 0, y0: 16, w: 30, h: 20, round: true, cap: 'flat', capH: 1, mat: M.LIMESTONE, ground: false, floors: 2 },
      { t: 'tower', tag: 'roundtower', x: 3, z: -6, y0: 37, w: 6, h: 7, cap: 'flat', capH: 0.6, mat: M.LIMESTONE, ground: false, floors: 0 },
      // Upper Ward: the quadrangle.
      { t: 'hall', tag: 'stateapartments', x: 78, z: -34, w: 86, d: 18, h: 22, roof: 'flat', roofH: 1, mat: M.LIMESTONE, storey: 6.5 },
      { t: 'hall', tag: 'stateapartments', x: 112, z: 0, w: 18, d: 52, h: 22, roof: 'flat', roofH: 1, mat: M.LIMESTONE, storey: 6.5 },
      { t: 'hall', tag: 'stateapartments', x: 78, z: 34, w: 86, d: 16, h: 20, roof: 'flat', roofH: 1, mat: M.LIMESTONE, storey: 6.5 },
      ...[[38, -40], [118, -38], [118, 38], [38, 38]].map(([x, z]) => ({ t: 'tower', tag: 'stateapartments', x, z, w: 13, h: 28, cap: 'flat', capH: 1, mat: M.LIMESTONE, floors: 3 })),
      // Lower Ward: St George's Chapel and the ranges on its walls.
      { t: 'hall', tag: 'stgeorge', x: -82, z: 2, w: 72, d: 20, h: 21, roof: 'gable', axis: 'x', roofH: 5, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 10.5 },
      { t: 'hall', tag: 'stgeorge', x: -82, z: 2, w: 12, d: 34, h: 21, roof: 'gable', axis: 'z', roofH: 5, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 10.5 },
      ...[-1, 1].flatMap((s) => [-112, -100, -88, -76, -64, -52].map((x) => ({ t: 'tower', tag: 'stgeorge', x, z: 2 + s * 10.8, w: 2.6, h: 25, cap: 'spire', capH: 6, capMat: M.LIMESTONE, mat: M.LIMESTONE, floors: 0, windows: false, roofPosts: false }))),
      { t: 'hall', tag: 'lowerward', x: -95, z: 30, w: 60, d: 10, h: 12, roof: 'gable', axis: 'x', roofH: 4, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 6 },
      { t: 'hall', tag: 'lowerward', x: -100, z: -28, w: 48, d: 10, h: 12, roof: 'gable', axis: 'x', roofH: 4, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 6 },
      // Henry VIII's gate at the foot of the Lower Ward.
      { t: 'arch', tag: 'gate', x: -60, z: 40, w: 16, d: 10, h: 16, span: 5, spring: 6, axis: 'z', mat: M.LIMESTONE },
    ],
  },
  nidaros: {
    S: 1.2, yaw: 0.5, mat: M.VERDE, roofMat: M.VERDE,
    parts: cathedral({ L: 100, W: 14, H: 21, mat: M.VERDE, roofMat: M.VERDE, aisle: { w: 8, h: 12 }, arm: 14,
      crossing: { h: 40, cap: 'spire', capH: 46, capMat: M.VERDE },
      towers: { n: 2, w: 10, h: 38, cap: 'spire', capH: 14, capMat: M.VERDE } }),
  },
  helsinki: {
    S: 1.8, yaw: 0.35, mat: M.TILE, roofMat: M.VERDE,
    parts: [
      { t: 'steps', tag: 'podium', base: true, x: 0, z: 0, w: 80, d: 80, h: 4, n: 1, mat: M.TILE, posts: true, ground: true },
      ...domed({ r: 12, drumH: 38, domeH: 12, mat: M.TILE, domeMat: M.VERDE, lanternMat: M.GOLD,
        arms: { len: 13, w: 22, h: 24, roof: 'gable', roofH: 6, roofMat: M.VERDE },
        corners: { w: 7, h: 30, round: true, cap: 'dome', capH: 5, capMat: M.VERDE } }).map((p) => ({ ...p, y0: 4 })),
    ],
  },
  chillon: {
    S: 1.6, yaw: 0.5, mat: M.TILE, roofMat: M.BRICK,
    parts: [
      { t: 'curtain', tag: 'walls', pts: [[-50, -12], [-10, -22], [45, -18], [55, 8], [10, 22], [-45, 14]], h: 12, thick: 2.2, mat: M.TILE,
        towers: { w: 6, h: 18, round: true, cap: 'cone', capH: 7, capMat: M.BRICK, mat: M.TILE } },
      { t: 'tower', tag: 'keep', x: 5, z: 0, w: 10, h: 25, cap: 'pyramid', capH: 8, capMat: M.BRICK, mat: M.TILE, floors: 3 },
      { t: 'hall', tag: 'halls', x: 32, z: 0, w: 22, d: 14, h: 15, roof: 'gable', axis: 'x', roofH: 6, mat: M.TILE, roofMat: M.BRICK },
      { t: 'hall', tag: 'halls', x: -26, z: 0, w: 22, d: 14, h: 13, roof: 'gable', axis: 'x', roofH: 6, mat: M.TILE, roofMat: M.BRICK },
    ],
  },
  saintsava: {
    S: 1.2, yaw: 0.4, mat: M.MARBLE, roofMat: M.VERDE,
    parts: domed({ r: 18, drumH: 45, domeH: 20, mat: M.MARBLE, domeMat: M.VERDE, lanternH: 9,
      arms: { len: 17, w: 30, h: 30, roof: 'flat', roofH: 1.2, storey: 7.5 },
      corners: { w: 9, h: 32, round: true, cap: 'dome', capH: 6, capMat: M.VERDE } }),
  },

  // ── Asia ────────────────────────────────────────────────────────────────
  taipei101: {
    // Full size, 508 m to the tip, like every skyline landmark: see shanghaitower.
    S: 1, yaw: 0.5, mat: M.CURTAIN,
    parts: [
      { t: 'tower', tag: 'base', x: 0, z: 0, w: 58, h: 90, taper: 0.72, cap: 'flat', capH: 2, mat: M.CURTAIN, storey: 11, floors: 2 },
      ...Array.from({ length: 8 }, (_, i) => ({ t: 'tower', tag: 'segments', x: 0, z: 0, y0: 92 + i * 34, w: 36, h: 32, taper: 1.18, cap: 'flat', capH: 2, mat: M.CURTAIN, ground: false, storey: 16, floors: i % 3 === 0 ? 1 : 0, roofPosts: i === 7 })),
      { t: 'tower', tag: 'crown', x: 0, z: 0, y0: 364, w: 20, h: 26, cap: 'flat', capH: 1, mat: M.CURTAIN, ground: false, roofPosts: false },
      { t: 'tower', tag: 'spire', x: 0, z: 0, y0: 391, w: 6, h: 10, cap: 'spire', capH: 107, capMat: M.MAST, mat: M.STEEL, ground: false, roofPosts: false, windows: false, floors: 0 },
    ],
  },
  shanghaitower: {
    // Full size. At half it stood 306 m among neighbours surveyed at their
    // real heights, and the World Financial Centre (492 m, a street away)
    // and Jin Mao (420 m) both stood over the third tallest building on
    // Earth. A skyline landmark is built at its real height or not at all.
    S: 1, yaw: -0.4, mat: M.CURTAIN, clear: 180,
    parts: [
      { t: 'tower', tag: 'tower', x: 0, z: 0, w: 76, h: 560, round: true, taper: 0.58, cap: 'flat', capH: 2, mat: M.CURTAIN, storey: 36, floors: 3 },
      { t: 'tower', tag: 'crown', x: 0, z: 0, y0: 562, w: 30, h: 50, round: true, taper: 0.7, cap: 'none', mat: M.STEEL, ground: false, roofPosts: false, windows: false, floors: 0 },
      { t: 'hall', tag: 'podium', x: 0, z: 70, w: 110, d: 60, h: 24, roof: 'flat', mat: M.CURTAIN, storey: 8 },
    ],
  },
  wildgoose: {
    S: 2.2, yaw: 0.45, mat: M.RUBBLE, roofMat: M.RUBBLE,
    parts: [
      { t: 'steps', tag: 'platform', base: true, x: 0, z: 0, w: 45, d: 48, h: 4.2, n: 1, mat: M.RUBBLE, posts: true },
      { t: 'tiers', tag: 'pagoda', x: 0, z: 0, y0: 4.2, n: 7, w: 25, wTop: 13, h0: 9, hk: 6.2, eave: 1.2, mat: M.RUBBLE, roofMat: M.RUBBLE, win: 2.2,
        cap: 'pyramid', capH: 4, finial: { h: 5, w: 1.2, mat: M.GOLD } },
    ],
  },
  landmark81: {
    S: 0.6, yaw: 0.35, mat: M.CURTAIN,
    parts: [
      { t: 'tower', tag: 'core', x: 0, z: 0, w: 34, h: 390, cap: 'flat', capH: 2, mat: M.CURTAIN, storey: 20, floors: 2 },
      { t: 'tower', tag: 'crown', x: 0, z: 0, y0: 392, w: 22, h: 40, taper: 0.4, cap: 'spire', capH: 29, capMat: M.STEEL, mat: M.CURTAIN, ground: false, roofPosts: false, windows: false, floors: 0 },
      { t: 'tower', tag: 'tubes', x: 25.3, z: 0, w: 16, d: 34, h: 330, cap: 'flat', capH: 2, mat: M.CURTAIN, storey: 20, floors: 1 },
      { t: 'tower', tag: 'tubes', x: -25.3, z: 0, w: 16, d: 34, h: 290, cap: 'flat', capH: 2, mat: M.CURTAIN, storey: 20, floors: 1 },
      { t: 'tower', tag: 'tubes', x: 0, z: 25.3, w: 66.6, d: 16, h: 240, cap: 'flat', capH: 2, mat: M.CURTAIN, storey: 20, floors: 1 },
      { t: 'hall', tag: 'podium', x: 0, z: -60, w: 110, d: 70, h: 30, roof: 'flat', mat: M.CURTAIN, storey: 7.5 },
    ],
  },
  boudhanath: {
    S: 1.5, yaw: 0.3, mat: M.TILE, sheds: false,
    parts: [
      { t: 'steps', tag: 'terraces', base: true, x: 0, z: 0, w: 100, h: 9, n: 3, wTop: 64, mat: M.TILE, posts: true },
      { t: 'dome', tag: 'dome', x: 0, z: 0, y0: 9, r: 28, drumH: 0, h: 16, profile: 'round', mat: M.TILE, domeMat: M.TILE, lantern: false },
      { t: 'tower', tag: 'harmika', x: 0, z: 0, y0: 24, w: 9, h: 6, cap: 'flat', capH: 0.8, mat: M.GOLD, ground: false, windows: false, floors: 0, roofPosts: false },
      { t: 'tower', tag: 'spire', x: 0, z: 0, y0: 31.3, w: 7, h: 12, taper: 0.4, cap: 'spire', capH: 5, capMat: M.GOLD, mat: M.GOLD, ground: false, windows: false, floors: 0, roofPosts: false },
      ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([sx, sz]) => ({ t: 'arch', tag: 'gates', x: sx * 58, z: sz * 58, w: sz ? 10 : 6, d: sz ? 6 : 10, h: 8, span: 3.6, spring: 3.4, axis: sz ? 'z' : 'x', mat: M.TILE })),
    ],
  },
  victoriamemorial: {
    S: 1.3, yaw: 0.35, mat: M.MARBLE,
    parts: domed({ r: 16, drumH: 34, domeH: 18, mat: M.MARBLE, domeMat: M.MARBLE, lanternMat: M.VERDE, lanternH: 8,
      arms: { len: 34, w: 30, h: 22, roof: 'flat', roofH: 1.2, storey: 7.3, front: 22 },
      corners: { w: 11, h: 26, cap: 'dome', capH: 7, capMat: M.MARBLE, off: 40 } }),
  },
  hawamahal: {
    // The Palace of Winds: a screen, not a building. Five storeys of Jaipur's
    // pink sandstone one room deep, stepping in to a narrow top like a
    // crown, its face made entirely of jharokhas, the little projecting
    // windows stacked in columns, each column and storey roofed with a small
    // dome: nine hundred and fifty-three windows for the women of the court
    // to watch the street through.
    S: 3.0, yaw: 0.2, mat: M.ROSE, roofMat: M.ROSE, budget: 1.3,
    parts: [
      { t: 'hall', tag: 'palace', x: 0, z: 2.5, w: 30, d: 5.5, h: 6.2, roof: 'flat', roofH: 0.5, mat: M.ROSE, storey: 3.1, win: 1.1, bay: 2.2 },
      { t: 'hall', tag: 'palace', x: 0, z: 2.5, y0: 6.7, w: 24, d: 5, h: 3, roof: 'flat', roofH: 0.4, mat: M.ROSE, storey: 3, win: 1.1, bay: 2.2, ground: false },
      { t: 'hall', tag: 'crown', x: 0, z: 2.5, y0: 10.1, w: 13, d: 4.2, h: 3, roof: 'flat', roofH: 0.4, mat: M.ROSE, storey: 3, win: 1.1, bay: 2.2, ground: false },
      { t: 'hall', tag: 'crown', x: 0, z: 2.5, y0: 13.5, w: 7, d: 3.4, h: 2.8, roof: 'flat', roofH: 0.4, mat: M.ROSE, storey: 2.8, win: 1.0, bay: 2.2, ground: false },
      // The jharokha columns across the face, as tall as the storeys behind
      // them, each capped with its small dome.
      ...[-13.5, -11.2, -8.9, -6.6, -4.4, -2.2, 0, 2.2, 4.4, 6.6, 8.9, 11.2, 13.5].map((x) => {
        const a = Math.abs(x);
        const top = a < 3 ? 16.3 : a < 6 ? 13.1 : a < 11.5 ? 9.7 : 6.7;
        return { t: 'tower', tag: a < 6 ? 'crown' : 'palace', x, z: -0.9, w: 1.9, h: top, sides: 8, cap: 'dome', capH: 1.3, capMat: M.ROSE, mat: M.ROSE, floors: 0, roofPosts: false };
      }),
      // The three chhatris on the top, white domes.
      ...[-2.6, 0, 2.6].map((x) => ({ t: 'tower', tag: 'crown', x, z: 2.5, y0: 16.7, w: 1.8, h: 1.4, round: true, cap: 'dome', capH: 1.6, capMat: M.MARBLE, mat: M.ROSE, ground: false, windows: false, floors: 0, roofPosts: false })),
    ],
  },
  redfort: {
    // Shah Jahan's fort: a mile and a half of red sandstone rampart round an
    // irregular octagon, a domed kiosk on every bastion, the Lahori Gate on
    // the west under its row of seven white chhatris and the Delhi Gate on
    // the south; inside, the Hall of Public Audience in red sandstone, the
    // Hall of Private Audience and the Rang Mahal in white marble along the
    // river wall, and the three marble domes of the Pearl Mosque.
    S: 1.0, yaw: 0.25, mat: M.SANDSTONE, budget: 1.4,
    parts: [
      { t: 'curtain', tag: 'ramparts', pts: [[-170, 30], [-150, -60], [-60, -95], [60, -95], [150, -70], [170, 0], [150, 75], [60, 100], [-60, 100], [-150, 80]], h: 20, thick: 6, mat: M.SANDSTONE,
        towers: { w: 14, h: 25, sides: 8, cap: 'dome', capH: 6, capMat: M.MARBLE, mat: M.SANDSTONE } },
      // The Lahori Gate on the west: a portal between two octagonal towers,
      // the row of white chhatris over it.
      { t: 'arch', tag: 'lahorigate', x: -165, z: 0, w: 16, d: 36, h: 26, span: 9, spring: 9, pointed: true, axis: 'x', mat: M.SANDSTONE, attic: { cap: 'flat', w: 8, d: 20, h: 4 } },
      ...[-1, 1].map((s) => ({ t: 'tower', tag: 'lahorigate', x: -165, z: s * 21, w: 9, h: 33, sides: 8, cap: 'dome', capH: 6, capMat: M.MARBLE, mat: M.SANDSTONE })),
      ...[-9, -6, -3, 0, 3, 6, 9].map((z) => ({ t: 'tower', tag: 'lahorigate', x: -165, z, y0: 30, w: 2.6, h: 2.6, round: true, cap: 'dome', capH: 2.2, capMat: M.MARBLE, mat: M.MARBLE, ground: false, windows: false, floors: 0, roofPosts: false })),
      // The Delhi Gate on the south.
      { t: 'arch', tag: 'delhigate', x: 0, z: 98, w: 30, d: 14, h: 22, span: 8, spring: 8, pointed: true, axis: 'z', mat: M.SANDSTONE },
      ...[-1, 1].map((s) => ({ t: 'tower', tag: 'delhigate', x: s * 18, z: 98, w: 8, h: 28, sides: 8, cap: 'dome', capH: 5, capMat: M.MARBLE, mat: M.SANDSTONE })),
      // Chhatta Chowk, the covered bazaar from the Lahori Gate.
      { t: 'hall', tag: 'bazaar', x: -110, z: 0, w: 80, d: 14, h: 9, roof: 'flat', mat: M.SANDSTONE, storey: 4.5 },
      // The Hall of Public Audience.
      { t: 'colonnade', tag: 'diwaniaam', x: -10, z: 0, w: 54, d: 24, podH: 1.2, colH: 8, colW: 1.4, bay: 5, rows: 'ring', roof: 'flat', mat: M.SANDSTONE },
      // Along the river wall: the Rang Mahal, the Diwan-i-Khas, the Khas Mahal, in marble.
      { t: 'hall', tag: 'riverpalaces', x: 120, z: 20, w: 24, d: 46, h: 10, roof: 'flat', mat: M.MARBLE, storey: 5 },
      { t: 'colonnade', tag: 'riverpalaces', x: 120, z: -30, w: 30, d: 20, podH: 1.2, colH: 7, colW: 1.2, bay: 4, rows: 'ring', roof: 'flat', mat: M.MARBLE },
      ...[-1, 1].flatMap((s) => [[120 + s * 12, -30 + 8], [120 + s * 12, -30 - 8]]).map(([x, z]) => ({ t: 'tower', tag: 'riverpalaces', x, z, y0: 9, w: 3.4, h: 3, round: true, cap: 'dome', capH: 3, capMat: M.GOLD, mat: M.MARBLE, ground: false, windows: false, floors: 0, roofPosts: false })),
      { t: 'hall', tag: 'riverpalaces', x: 120, z: 65, w: 22, d: 30, h: 10, roof: 'flat', mat: M.MARBLE, storey: 5 },
      // The Pearl Mosque: a little marble hall with three domes.
      { t: 'hall', tag: 'motimasjid', x: 70, z: -60, w: 26, d: 14, h: 9, roof: 'flat', mat: M.MARBLE, storey: 4.5 },
      ...[-8, 0, 8].map((x) => ({ t: 'dome', tag: 'motimasjid', x: 70 + x, z: -62, y0: 9.6, r: 3.4, drumH: 1.5, h: 5, mat: M.MARBLE, domeMat: M.MARBLE, lantern: true, lanternMat: M.GOLD })),
    ],
  },
  gatewayindia: {
    S: 2.2, yaw: 0.3, mat: M.LIMESTONE,
    parts: [
      { t: 'arch', tag: 'gateway', x: 0, z: 0, w: 22, d: 15, h: 17, span: 8.5, spring: 7.5, pointed: true, axis: 'z', mat: M.LIMESTONE, attic: { cap: 'dome', w: 8, d: 8, h: 5, round: true } },
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ t: 'tower', tag: 'turrets', x: sx * 13.4, z: sz * 6, w: 4.2, h: 21, sides: 8, cap: 'dome', capH: 3, capMat: M.LIMESTONE, mat: M.LIMESTONE, floors: 1 })),
      { t: 'hall', tag: 'halls', x: -21, z: 0, w: 12, d: 13, h: 10, roof: 'flat', mat: M.LIMESTONE, storey: 5 },
      { t: 'hall', tag: 'halls', x: 21, z: 0, w: 12, d: 13, h: 10, roof: 'flat', mat: M.LIMESTONE, storey: 5 },
    ],
  },
  osaka: {
    S: 2.0, yaw: 0.45, mat: M.TILE, roofMat: M.VERDE,
    parts: [
      { t: 'steps', tag: 'base', base: true, x: 0, z: 0, w: 60, d: 54, h: 13, n: 1, batter: 0.3, mat: M.LIMESTONE, posts: true },
      { t: 'tiers', tag: 'keep', x: 0, z: 0, y0: 13, n: 5, w: 34, d: 28, wTop: 18, h0: 7, hk: 5.4, eave: 2.0, mat: M.TILE, roofMat: M.VERDE, win: 2,
        cap: 'gable', capH: 4, finial: { h: 3, w: 1.4, mat: M.GOLD } },
    ],
  },
  kinkakuji: {
    S: 4.0, yaw: 0.35, mat: M.GOLD, roofMat: M.SLATE,
    parts: [
      { t: 'steps', tag: 'plinth', base: true, x: 0, z: 0, w: 20, d: 16, h: 1, n: 1, mat: M.LIMESTONE, posts: true },
      { t: 'tiers', tag: 'pavilion', x: 0, z: 0, y0: 1, n: 3, w: 15, d: 11, wTop: 8, h0: 4.2, hk: 3.4, eave: 1.8, mat: M.GOLD, roofMat: M.SLATE, win: 1.4,
        cap: 'pyramid', capH: 2.6, finial: { h: 2.2, w: 0.8, mat: M.GOLD } },
    ],
  },
  juche: {
    S: 1.2, yaw: 0.4, mat: M.TILE,
    parts: [
      { t: 'hall', tag: 'base', x: 0, z: 0, w: 36, d: 36, h: 10, roof: 'flat', mat: M.TILE, storey: 5 },
      { t: 'tower', tag: 'obelisk', x: 0, z: 0, y0: 10.8, w: 18, h: 138, taper: 0.55, cap: 'flat', capH: 1, mat: M.TILE, ground: false, storey: 12, floors: 3 },
      { t: 'tower', tag: 'flame', x: 0, z: 0, y0: 149.8, w: 8, h: 4, cap: 'pointed', capH: 16, capMat: M.MADDER, mat: M.GOLD, ground: false, roofPosts: false, windows: false, floors: 0 },
    ],
  },
  monas: {
    // A slender obelisk: finer stone, or the first volley cuts it through (see cntower).
    S: 1.6, yaw: 0.3, mat: M.MARBLE, budget: 2.4, fine: 0.7,
    parts: [
      { t: 'steps', tag: 'cawan', x: 0, z: 0, w: 45, h: 17, n: 2, wTop: 30, mat: M.MARBLE, posts: true },
      { t: 'tower', tag: 'obelisk', x: 0, z: 0, y0: 17, w: 8, h: 98, taper: 0.7, cap: 'flat', capH: 1, mat: M.MARBLE, ground: false, storey: 10, floors: 2 },
      { t: 'tower', tag: 'flame', x: 0, z: 0, y0: 116, w: 6, h: 3, round: true, cap: 'pointed', capH: 14, capMat: M.GOLD, mat: M.GOLD, ground: false, roofPosts: false, windows: false, floors: 0 },
    ],
  },
  prambanan: {
    S: 1.8, yaw: 0.4, mat: M.VERDE,
    parts: [
      { t: 'steps', tag: 'terrace', base: true, x: 0, z: 0, w: 110, h: 3, n: 1, mat: M.VERDE, posts: true },
      { t: 'steps', tag: 'shiva', x: 0, z: 0, y0: 3, w: 34, h: 44, n: 11, wTop: 3, mat: M.VERDE },
      ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => ({ t: 'steps', tag: 'shrines', x: sx * 34, z: sz * 30, y0: 3, w: 16, h: 26, n: 8, wTop: 2, mat: M.VERDE })),
      { t: 'arch', tag: 'gate', x: 0, z: 25, y0: 3, w: 10, d: 6, h: 10, span: 3.4, spring: 4, axis: 'z', mat: M.VERDE },
      { t: 'arch', tag: 'gate', x: 0, z: -25, y0: 3, w: 10, d: 6, h: 10, span: 3.4, spring: 4, axis: 'z', mat: M.VERDE },
    ],
  },
  minarpakistan: {
    S: 2.4, yaw: 0.3, mat: M.TILE,
    parts: [
      { t: 'steps', tag: 'platforms', x: 0, z: 0, w: 40, h: 8, n: 3, wTop: 22, mat: M.TILE, posts: true },
      { t: 'needle', tag: 'minar', x: 0, z: 0, y0: 8, r0: 5.5, r1: 3.2, h: 50, mat: M.TILE, podMat: M.TILE, pods: [{ y: 36, r: 6, h: 3 }] },
      { t: 'tower', tag: 'cupola', x: 0, z: 0, y0: 58, w: 6.4, h: 3, round: true, cap: 'dome', capH: 4, capMat: M.TILE, mat: M.TILE, ground: false, roofPosts: false, windows: false, floors: 0 },
    ],
  },
  lotustower: {
    // Full size among its real neighbours: see shanghaitower. A needle at
    // full height in the ordinary budget was a few big stones across, and
    // sixteen rounds cut it through; it gets more and finer stone.
    S: 1, budget: 2.4, fine: 0.7, yaw: 0.35, mat: M.CONCRETE,
    parts: [
      { t: 'hall', tag: 'podium', x: 0, z: 0, w: 80, d: 80, h: 18, roof: 'flat', mat: M.CONCRETE, storey: 6 },
      { t: 'needle', tag: 'tower', x: 0, z: 0, y0: 19, r0: 15, r1: 10, h: 230, mat: M.CONCRETE, podMat: M.MADDER, pods: [{ y: 190, r: 26, h: 30 }], mast: 100 },
    ],
  },
  bayterek: {
    S: 2.2, yaw: 0.3, mat: M.TILE,
    parts: [
      { t: 'steps', tag: 'base', x: 0, z: 0, w: 30, h: 4, n: 1, round: true, mat: M.TILE, posts: true },
      { t: 'needle', tag: 'tower', x: 0, z: 0, y0: 4, r0: 7, r1: 4, h: 76, mat: M.TILE, podMat: M.TILE, pods: [{ y: 70, r: 9, h: 4 }], ball: 11, ballMat: M.GOLD },
    ],
  },
  registan: {
    // Three madrasas round the square, each a portal (pishtaq) taller than
    // the building behind it, faced in turquoise and lapis tile, with a
    // minaret at each front corner: Ulugh Beg on the west, Sher-Dor facing it
    // on the east with a fluted blue dome either side of its portal,
    // Tilya-Kori on the north with the great blue dome of its mosque.
    S: 1.3, yaw: 0.2, mat: M.LIMESTONE, domeMat: M.AZURE, budget: 1.4,
    parts: [
      ...[[-60, 0, 'x'], [60, 0, 'x'], [0, -60, 'z']].flatMap(([x, z, ax], i) => {
        const along = ax === 'x';
        const tag = ['ulughbeg', 'sherdor', 'tilyakori'][i];
        const out = x < 0 ? -1 : x > 0 ? 1 : -1;
        const bx = along ? x + out * 34 : x, bz = along ? z : z - 34;
        // The face of the portal, toward the square.
        const fx = along ? x - out * 6.4 : x, fz = along ? z : z + 6.4;
        return [
          { t: 'arch', tag, x, z, w: along ? 12 : 34, d: along ? 34 : 12, h: 36, span: 14, spring: 16, pointed: true, solid: true, axis: along ? 'x' : 'z', mat: M.LIMESTONE },
          // The tile: a turquoise frame round the arch and a band over it.
          ...[-1, 1].map((s) => ({ t: 'box', tag, x: along ? fx : x + s * 12.5, z: along ? z + s * 12.5 : fz, w: along ? 0.9 : 7, d: along ? 7 : 0.9, h: 32, mat: M.AZURE })),
          { t: 'box', tag, x: fx, z: fz, y0: 30, w: along ? 0.9 : 32, d: along ? 32 : 0.9, h: 5, mat: M.AZURE },
          { t: 'hall', tag, x: bx, z: bz, w: along ? 55.4 : 70, d: along ? 70 : 55.4, h: 15, roof: 'flat', mat: M.LIMESTONE, storey: 7.5 },
          // Corner turrets (guldasta) on the back of the court.
          ...[-1, 1].map((s) => ({ t: 'tower', tag, x: along ? bx + out * 26 : bx + s * 33, z: along ? bz + s * 33 : bz - 26, w: 5, h: 19, round: true, cap: 'dome', capH: 4, capMat: M.AZURE, mat: M.LIMESTONE, floors: 0, windows: false, roofPosts: false })),
          // The minarets: brick to the gallery, tile over it.
          ...[-1, 1].flatMap((s) => {
            const mx = along ? x + out * 12 : x + s * 36, mz = along ? z + s * 36 : z - 12;
            return [
              { t: 'tower', tag: `${tag}minarets`, x: mx, z: mz, w: 6.5, h: 16, round: true, cap: 'flat', capH: 0.6, mat: M.LIMESTONE, floors: 1 },
              { t: 'tower', tag: `${tag}minarets`, x: mx, z: mz, y0: 16.6, w: 5.8, h: 19, round: true, cap: 'flat', capH: 1.2, mat: M.AZURE, floors: 1, ground: false },
            ];
          }),
        ];
      }),
      // Sher-Dor's two fluted domes, behind its portal.
      ...[-1, 1].map((s) => ({ t: 'dome', tag: 'sherdordomes', x: 78, z: s * 22, y0: 15, r: 7.5, drumH: 7, h: 10, mat: M.LIMESTONE, domeMat: M.AZURE, profile: 'round', lantern: false })),
      // Tilya-Kori's mosque dome, on its west side.
      { t: 'dome', tag: 'tilyakoridome', x: -22, z: -94, y0: 15, r: 11, drumH: 9, h: 13, mat: M.LIMESTONE, domeMat: M.AZURE, lantern: false },
    ],
  },
  flametowers: {
    S: 1.0, yaw: 0.4, mat: M.CURTAIN,
    parts: [
      { t: 'tower', tag: 'flame1', x: 0, z: -20, w: 44, h: 130, round: true, taper: 0.62, capW: 21.8, cap: 'pointed', capH: 52, capMat: M.CURTAIN, mat: M.CURTAIN, storey: 14, floors: 3 },
      { t: 'tower', tag: 'flame2', x: -46, z: 18, w: 40, h: 112, round: true, taper: 0.62, capW: 19.8, cap: 'pointed', capH: 48, capMat: M.CURTAIN, mat: M.CURTAIN, storey: 14, floors: 3 },
      { t: 'tower', tag: 'flame3', x: 46, z: 18, w: 38, h: 96, round: true, taper: 0.62, capW: 18.8, cap: 'pointed', capH: 44, capMat: M.CURTAIN, mat: M.CURTAIN, storey: 14, floors: 3 },
    ],
  },
  azadi: {
    S: 2.0, yaw: 0.3, mat: M.MARBLE, sheds: false,
    parts: [
      { t: 'arch', tag: 'arch', x: 0, z: 0, w: 60, d: 42, h: 30, span: 22, spring: 10, pointed: true, axis: 'z', mat: M.MARBLE },
      { t: 'hall', tag: 'crown', x: 0, z: 0, y0: 31, w: 26, d: 26, h: 12, roof: 'flat', mat: M.MARBLE, storey: 6, ground: false },
      { t: 'tower', tag: 'crown', x: 0, z: 0, y0: 43.8, w: 14, h: 2, cap: 'pyramid', capH: 3, capMat: M.MARBLE, mat: M.MARBLE, ground: false, windows: false, floors: 0, roofPosts: false },
    ],
  },
  kingdomcentre: {
    S: 0.8, yaw: 0.35, mat: M.CURTAIN,
    parts: [
      { t: 'tower', tag: 'tower', x: 0, z: 0, w: 72, d: 40, h: 300, taper: 0.5, cap: 'none', mat: M.CURTAIN, storey: 20, floors: 3, hole: { y: 190, w: 40 } },
      { t: 'hall', tag: 'podium', x: 0, z: 70, w: 160, d: 90, h: 24, roof: 'flat', mat: M.CURTAIN, storey: 8 },
    ],
  },
  baalbek: {
    S: 1.6, yaw: 0.6, mat: M.LIMESTONE, sheds: false,
    parts: [
      { t: 'colonnade', tag: 'temple', x: 0, z: 0, w: 35, d: 66, podH: 5, colH: 19, colW: 1.9, bay: 4.4, rows: 'ring', entH: 3, roof: 'gable', roofH: 6, cella: { w: 23, d: 44, wall: 2 }, mat: M.LIMESTONE },
      { t: 'steps', tag: 'stair', base: true, x: 0, z: 39, w: 20, d: 12, h: 4.6, n: 3, wTop: 20, dTop: 4, mat: M.LIMESTONE, posts: true, ground: false },
    ],
  },
  ur: {
    S: 2.2, yaw: 0.45, mat: M.RUBBLE,
    parts: [
      { t: 'steps', tag: 'ziggurat', x: 0, z: 0, w: 64, d: 46, h: 20, n: 2, wTop: 38, dTop: 26, batter: 0.2, mat: M.RUBBLE },
      { t: 'hall', tag: 'shrine', x: 0, z: 0, y0: 20, w: 20, d: 14, h: 6, roof: 'flat', mat: M.BRICK, storey: 6, windows: false, floors: 0, ground: false },
      { t: 'arch', tag: 'gate', x: 0, z: 30, w: 14, d: 8, h: 8, span: 4, spring: 4, axis: 'z', mat: M.RUBBLE },
    ],
  },

  // ── Africa ──────────────────────────────────────────────────────────────
  djoser: {
    S: 1.0, budget: 1.6, yaw: 0.5, mat: M.LIMESTONE,
    parts: [
      { t: 'steps', tag: 'pyramid', x: 0, z: 0, w: 121, d: 109, h: 62, n: 6, wTop: 36, dTop: 26, batter: 0.15, mat: M.LIMESTONE, coarse: 1.8 },
      { t: 'colonnade', tag: 'colonnade', x: 0, z: 90, w: 60, d: 14, podH: 0.6, colH: 6.6, colW: 1.6, bay: 4.2, rows: 'twin', roof: 'flat', mat: M.LIMESTONE },
    ],
  },
  yamoussoukro: {
    S: 0.8, yaw: 0.25, mat: M.MARBLE,
    parts: [
      ...domed({ r: 45, drumH: 58, domeH: 50, mat: M.MARBLE, domeMat: M.VERDE, lanternH: 20, storey: 14,
        arms: { len: 26, w: 50, h: 30, roof: 'flat', roofH: 1.5, storey: 10 } }),
      { t: 'colonnade', tag: 'colonnade', x: 0, z: 110, w: 170, d: 12, podH: 1, colH: 20, colW: 2.4, bay: 8, rows: 'twin', roof: 'flat', mat: M.MARBLE },
    ],
  },

  // ── The Americas and Oceania ────────────────────────────────────────────
  cntower: {
    // Full size among its real neighbours: see shanghaitower. A needle at
    // full height in the ordinary budget was a few big stones across, and
    // sixteen rounds cut it through; it gets more and finer stone.
    S: 1, budget: 2.4, yaw: 0.4, mat: M.CONCRETE,
    parts: [
      { t: 'needle', tag: 'tower', x: 0, z: 0, r0: 20, r1: 8, h: 450, mat: M.CONCRETE, podMat: M.CONCRETE, pods: [{ y: 335, r: 26, h: 32 }, { y: 440, r: 11, h: 8 }], mast: 100 },
      { t: 'hall', tag: 'base', x: 0, z: 60, w: 80, d: 40, h: 16, roof: 'flat', mat: M.CONCRETE, storey: 8 },
    ],
  },
  frontenac: {
    // A railway hotel built as a chateau over the St Lawrence: walls of
    // brown brick and stone, roofs of green copper as tall as the storeys
    // under them, a turret with a pointed copper hat on every corner, and
    // the central tower of seventeen storeys under its own steep pyramid
    // with turrets at its corners.
    S: 1.2, yaw: 0.45, mat: M.BRICK, roofMat: M.COPPER, budget: 1.0,
    parts: [
      { t: 'tower', tag: 'tower', x: 0, z: 0, w: 22, h: 58, cap: 'pyramid', capH: 24, capMat: M.COPPER, mat: M.BRICK, floors: 3 },
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ t: 'tower', tag: 'tower', x: sx * 10, z: sz * 10, y0: 50, w: 4, h: 8, round: true, cap: 'cone', capH: 7, capMat: M.COPPER, mat: M.BRICK, ground: false, floors: 0, windows: false, roofPosts: false })),
      { t: 'hall', tag: 'wings', x: -38, z: 0, w: 53, d: 18, h: 30, roof: 'hip', roofH: 15, mat: M.BRICK, roofMat: M.COPPER, storey: 5 },
      { t: 'hall', tag: 'wings', x: 38, z: 0, w: 53, d: 18, h: 27, roof: 'hip', roofH: 14, mat: M.BRICK, roofMat: M.COPPER, storey: 5 },
      { t: 'hall', tag: 'wings', x: -58, z: 35, w: 18, d: 51.4, h: 26, roof: 'hip', roofH: 13, mat: M.BRICK, roofMat: M.COPPER, storey: 5 },
      { t: 'hall', tag: 'wings', x: 58, z: 33, w: 18, d: 48, h: 24, roof: 'hip', roofH: 12, mat: M.BRICK, roofMat: M.COPPER, storey: 5 },
      // The turrets: every corner of every wing.
      ...[[-67.5, -11, 34], [67.5, -11, 31], [-67.5, 61, 30], [67.5, 57, 28], [-49, 61, 28], [49, 57, 26], [-14, -11, 36], [14, -11, 34]].map(([x, z, h]) => ({ t: 'tower', tag: 'turrets', x, z, w: 7, h, round: true, cap: 'cone', capH: 11, capMat: M.COPPER, mat: M.BRICK })),
    ],
  },
  capitolio: {
    S: 1.0, yaw: 0.3, mat: M.TILE,
    parts: [
      ...domed({ r: 17, drumH: 58, domeH: 26, mat: M.TILE, domeMat: M.TILE, lanternH: 10, storey: 9,
        arms: { len: 80, w: 44, h: 22, roof: 'flat', roofH: 1.4, storey: 7.3, front: 12, skip: [[0, -1]] } }),
      { t: 'colonnade', tag: 'portico', x: 0, z: 43, w: 40, d: 12, podH: 4, colH: 14, colW: 1.6, bay: 4.4, rows: 'twin', roof: 'gable', roofH: 5, mat: M.TILE, axis: 'z' },
    ],
  },
  bellasartes: {
    S: 1.3, yaw: 0.35, mat: M.MARBLE, sheds: false,
    parts: domed({ r: 14, drumH: 30, domeH: 17, mat: M.MARBLE, domeMat: M.GOLD, lanternMat: M.GOLD, lanternH: 7, profile: 'bell',
      arms: { len: 32, w: 28, h: 25, roof: 'flat', roofH: 1.2, storey: 8.3 },
      corners: { w: 9, h: 29, cap: 'dome', capH: 7, capMat: M.GOLD } }),
  },
  teatroamazonas: {
    S: 2.4, yaw: 0.35, mat: M.SANDSTONE, roofMat: M.GOLD,
    parts: [
      { t: 'hall', tag: 'theatre', x: 0, z: 10, w: 34, d: 42, h: 16, roof: 'flat', mat: M.SANDSTONE, storey: 5.3 },
      { t: 'tower', tag: 'dome', x: 0, z: -21.5, w: 18, h: 18, round: true, cap: 'bell', capH: 10, capMat: M.GOLD, mat: M.SANDSTONE, finial: { cap: 'cone', w: 2, h: 4, mat: M.MARBLE, round: true } },
      { t: 'colonnade', tag: 'portico', x: 0, z: 37, w: 26, d: 8, podH: 2, colH: 7, colW: 1.1, bay: 3.4, rows: 'twin', roof: 'flat', mat: M.MARBLE },
    ],
  },
  obelisco: {
    S: 2.8, yaw: 0.4, mat: M.TILE,
    parts: [
      { t: 'steps', tag: 'plaza', base: true, x: 0, z: 0, w: 40, h: 0.6, n: 1, round: true, mat: M.LIMESTONE, posts: true, ground: false },
      { t: 'tower', tag: 'obelisk', x: 0, z: 0, y0: 0.6, w: 6.8, h: 63, taper: 0.52, cap: 'pyramid', capH: 4.5, capMat: M.TILE, mat: M.TILE, storey: 9, floors: 2 },
    ],
  },
  cartagena: {
    // Castillo San Felipe de Barajas: the largest Spanish fort in the
    // Americas, laid over San Lazaro hill in battered stone terraces that
    // step up to a summit battery, its bastions thrust out at the corners
    // of each level and a domed stone sentry box (garita) on every point.
    S: 0.9, yaw: 0.35, mat: M.LIMESTONE, budget: 1.3,
    parts: [
      { t: 'steps', tag: 'bastions', x: 0, z: 0, w: 170, d: 120, h: 14, n: 1, batter: 0.35, mat: M.GRANITE, coarse: 2.4 },
      // The lower bastions, thrust out past the terrace.
      ...[[-88, 46, 34], [92, 50, 30], [-80, -52, 32], [86, -46, 28], [0, 64, 26]].map(([x, z, w]) => ({ t: 'steps', tag: 'bastions', x, z, w, d: w, h: 14, n: 1, batter: 0.35, mat: M.GRANITE, coarse: 2.4, posts: true })),
      { t: 'steps', tag: 'bastions', x: 12, z: -6, y0: 14, w: 120, d: 82, h: 12, n: 1, batter: 0.35, mat: M.LIMESTONE, coarse: 2.4, ground: false },
      ...[[-50, 36, 22], [70, 34, 20], [62, -42, 20]].map(([x, z, w]) => ({ t: 'steps', tag: 'bastions', x, z, y0: 14, w, d: w, h: 12, n: 1, batter: 0.35, mat: M.LIMESTONE, coarse: 2.4, ground: false, posts: true })),
      { t: 'steps', tag: 'bastions', x: 22, z: -10, y0: 26, w: 70, d: 46, h: 10, n: 1, batter: 0.3, mat: M.LIMESTONE, coarse: 2.2, ground: false },
      { t: 'steps', tag: 'bastions', x: 28, z: -12, y0: 36, w: 38, d: 24, h: 6, n: 1, batter: 0.2, mat: M.LIMESTONE, coarse: 2.0, ground: false },
      { t: 'hall', tag: 'barracks', x: 20, z: -12, y0: 42, w: 24, d: 10, h: 5, roof: 'flat', mat: M.LIMESTONE, storey: 5, ground: false },
      // The garitas, on the points of the bastions at every level.
      ...[[-102, 60, 14], [-74, 32, 14], [104, 62, 14], [80, 38, 14], [-94, -66, 14], [98, -58, 14], [12, 76, 14],
        [-60, 46, 26], [-40, 26, 26], [79, 43, 26], [71, -51, 26], [-46, -45, 26], [70, 33, 26],
        [-12, 12, 36], [56, 12, 36], [56, -32, 36], [-12, -32, 36],
        [10, 0, 42], [46, 0, 42], [46, -24, 42], [10, -24, 42]].map(([x, z, y0]) => ({ t: 'tower', tag: 'garitas', x, z, y0, w: 3.2, h: 3.6, round: true, cap: 'dome', capH: 2.2, capMat: M.LIMESTONE, mat: M.LIMESTONE, ground: false, roofPosts: false, floors: 0, windows: false })),
    ],
  },
  skytower: {
    S: 0.9, yaw: 0.35, mat: M.CONCRETE,
    parts: [
      { t: 'needle', tag: 'tower', x: 0, z: 0, r0: 9, r1: 6, h: 200, mat: M.CONCRETE, podMat: M.CONCRETE, pods: [{ y: 180, r: 20, h: 24 }], mast: 128 },
      { t: 'hall', tag: 'casino', x: 0, z: 45, w: 70, d: 40, h: 20, roof: 'flat', mat: M.CURTAIN, storey: 6.6 },
    ],
  },
};

/**
 * Game scale.
 *
 * The rows above are the buildings at their real size, and the sixteen
 * original levels are not: the Elizabeth Tower is built at 193 m against its
 * real 96, the Taj Mahal at 196 against 73, Himeji at 129 against 46. A game
 * about bringing buildings down needs buildings that fill the sky, and the
 * catalogue at true size put Chambord at 55 m and the Winter Palace at 22 in
 * the same campaign as those, where they read as models.
 *
 * So each is scaled for the game here, by one rule: anything under 250 m
 * is built at up to 2.6 times its real height, less the taller it is
 * (2.4 times at 55 m real, 1.8 at 100, 1.25 at 240), counting whatever scale
 * its row already gives it, and nothing grows past about 420 m across, which
 * is the widest original site; supertalls stay at their real height, which
 * is already the point of them. A level standing on a baked pad is held
 * inside the pad. The stone budget grows with the area (up to three times),
 * so a bigger building is more stone, not the same stone in bigger blocks.
 * Explicit clearance radii grow with it.
 */
export const GAME_SCALE = {
  milan: 1.62,
  stvitus: 1.62,
  ulm: 1.48,
  brandenburg: 1.18,
  stephansdom: 1.45,
  hohensalzburg: 1.97,
  versailles: 1.0,
  chambord: 2.40,
  seville: 1.80,
  alhambra: 1.44,
  malbork: 2.06,
  warsaw: 1.25,
  bran: 1.30,
  bucharest: 2.50,
  kronborg: 1.35,        // held to its headland: at 1.89 the bastions stood out over the Sound
  stockholm: 2.60,
  hallgrimskirkja: 1.16,
  trakai: 1.62,
  winterpalace: 2.33,
  salisbury: 1.52,
  windsor: 2.26,
  nidaros: 1.64,
  helsinki: 1.28,
  chillon: 1.62,
  saintsava: 1.75,
  landmark81: 1.67,
  boudhanath: 1.70,
  victoriamemorial: 1.78,
  redfort: 1.34,
  gatewayindia: 1.18,
  osaka: 1.21,
  juche: 1.20,
  monas: 1.01,
  prambanan: 1.43,
  registan: 1.33,
  flametowers: 1.40,
  azadi: 1.26,
  kingdomcentre: 1.25,
  baalbek: 1.62,
  ur: 1.18,
  djoser: 1.7,           // a solid pyramid: past this its blocks outgrew what a 155 mm round can break
  yamoussoukro: 2.05,
  frontenac: 1.70,
  capitolio: 1.89,
  bellasartes: 1.86,
  teatroamazonas: 1.08,
  cartagena: 2.46,
  skytower: 1.11,
};
for (const [id, g] of Object.entries(GAME_SCALE)) {
  const s = SPECS[id];
  if (!s || !(g > 1)) continue;
  s.S *= g;
  if (s.clear) s.clear *= g;
  s.budget = (s.budget ?? 1) * Math.min(g * g, 3);
}
