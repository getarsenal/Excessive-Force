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
    S: 1.0, yaw: 0.25, mat: M.LIMESTONE, roofMat: M.SLATE,
    parts: [
      { t: 'hall', tag: 'corps', x: 0, z: -20, w: 150, d: 26, h: 21, roof: 'flat', roofH: 1.4, mat: M.LIMESTONE, storey: 7 },
      { t: 'hall', tag: 'wings', x: -58, z: 22, w: 34, d: 57.4, h: 21, roof: 'hip', roofH: 8, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 7 },
      { t: 'hall', tag: 'wings', x: 58, z: 22, w: 34, d: 57.4, h: 21, roof: 'hip', roofH: 8, mat: M.LIMESTONE, roofMat: M.SLATE, storey: 7 },
      { t: 'hall', tag: 'chapel', x: -95, z: 10, w: 22, d: 46, h: 30, roof: 'gable', axis: 'z', roofH: 12, mat: M.LIMESTONE, roofMat: M.SLATE },
      { t: 'tower', tag: 'pavilion', x: 0, z: 0.3, w: 28, d: 14, h: 24, cap: 'hip', capH: 7, capMat: M.GOLD, mat: M.LIMESTONE, ground: false },
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
    S: 1.0, yaw: -0.55, mat: M.LIMESTONE, roofMat: M.LIMESTONE,
    parts: [
      { t: 'hall', tag: 'cathedral', x: 0, z: 0, w: 83, d: 116, h: 36, roof: 'flat', roofH: 1.5, mat: M.LIMESTONE, storey: 9, bay: 9 },
      { t: 'tower', tag: 'giralda', x: 50, z: -52, w: 13.6, h: 70, mat: M.REDSTONE, cap: 'flat', capH: 1, floors: 3 },
      { t: 'tower', tag: 'belfry', x: 50, z: -52, y0: 71, w: 9, h: 20, mat: M.TILE, cap: 'dome', capH: 8, capMat: M.GOLD, ground: false, finial: { cap: 'spire', w: 1.5, h: 5, mat: M.GOLD } },
    ],
  },
  alhambra: {
    S: 1.0, yaw: 0.4, mat: M.REDSTONE, roofMat: M.BRICK,
    parts: [
      { t: 'curtain', tag: 'alcazaba', pts: [[-140, -30], [-80, -55], [60, -50], [140, -20], [130, 30], [0, 45], [-130, 25]], h: 14, thick: 3.5, mat: M.REDSTONE,
        towers: { w: 11, h: 22, cap: 'flat', capH: 1, mat: M.REDSTONE } },
      { t: 'tower', tag: 'comares', x: 20, z: -20, w: 16, h: 45, cap: 'flat', capH: 1, mat: M.REDSTONE, floors: 3 },
      { t: 'tower', tag: 'vela', x: -110, z: -5, w: 16, h: 27, cap: 'flat', capH: 1, mat: M.REDSTONE },
      { t: 'hall', tag: 'carlosv', x: 70, z: 5, w: 44, d: 44, h: 17, roof: 'flat', mat: M.LIMESTONE, storey: 8.5 },
      { t: 'hall', tag: 'nasrid', x: -35, z: 10, w: 50, d: 24, h: 10, roof: 'hip', roofH: 5, mat: M.TILE, roofMat: M.BRICK },
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
    S: 2.0, yaw: -0.4, mat: M.TILE, roofMat: M.BRICK,
    parts: [
      { t: 'steps', tag: 'rock', base: true, x: 0, z: 0, w: 46, d: 38, h: 8, n: 1, batter: 0.3, mat: M.VERDE, posts: false, ground: false },
      { t: 'hall', tag: 'castle', x: -4, z: 2, y0: 8, w: 30, d: 22, h: 14, roof: 'hip', roofH: 8, mat: M.TILE, roofMat: M.BRICK, storey: 4.6 },
      { t: 'tower', tag: 'towers', x: 16, z: -6, y0: 8, w: 8, h: 22, round: true, cap: 'cone', capH: 9, capMat: M.BRICK, mat: M.TILE },
      { t: 'tower', tag: 'towers', x: -18, z: 10, y0: 8, w: 7, h: 18, cap: 'pyramid', capH: 7, capMat: M.BRICK, mat: M.TILE },
      { t: 'tower', tag: 'towers', x: 12, z: 12, y0: 8, w: 7, h: 16, cap: 'flat', capH: 0.8, mat: M.TILE },
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
    S: 0.9, yaw: -0.3, mat: M.LIMESTONE, roofMat: M.SLATE,
    parts: [
      { t: 'steps', tag: 'motte', base: true, x: 0, z: 0, w: 60, h: 14, n: 2, wTop: 44, round: true, mat: M.VERDE, posts: true },
      { t: 'tower', tag: 'roundtower', x: 0, z: 0, y0: 14, w: 32, h: 22, round: true, cap: 'flat', capH: 1, mat: M.LIMESTONE, ground: false, floors: 2 },
      { t: 'curtain', tag: 'upperward', pts: [[-110, -40], [70, -45], [85, 45], [-100, 55]], h: 15, thick: 3, mat: M.LIMESTONE,
        towers: { w: 12, h: 22, cap: 'flat', capH: 1, mat: M.LIMESTONE } },
      { t: 'hall', tag: 'stateapartments', x: -30, z: -25, w: 70, d: 18, h: 20, roof: 'flat', roofH: 1, mat: M.LIMESTONE, storey: 6.5 },
      { t: 'hall', tag: 'stgeorge', x: -40, z: 30, w: 70, d: 16, h: 24, roof: 'flat', roofH: 1, mat: M.LIMESTONE, storey: 8 },
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
    S: 3.0, yaw: 0.2, mat: M.SANDSTONE, roofMat: M.SANDSTONE,
    parts: [
      { t: 'tiers', tag: 'palace', x: 0, z: 0, n: 5, w: 52, d: 12, wTop: 18, h0: 5, hk: 3.6, eave: 0.6, mat: M.SANDSTONE, roofMat: M.MARBLE, win: 1.2 },
      ...[-6, 0, 6].map((x) => ({ t: 'tower', tag: 'chhatris', x, z: 0, y0: 5 + 1.1 + 4 * (3.6 + 1.1), w: 3.2, h: 2.4, round: true, cap: 'dome', capH: 2.2, capMat: M.MARBLE, mat: M.SANDSTONE, ground: false, windows: false, floors: 0, roofPosts: false })),
    ],
  },
  redfort: {
    S: 1.0, yaw: 0.25, mat: M.SANDSTONE,
    parts: [
      { t: 'curtain', tag: 'ramparts', pts: [[-150, 40], [-150, -40], [150, -40], [150, 40]], h: 18, thick: 6, mat: M.SANDSTONE,
        towers: { w: 14, h: 24, sides: 8, cap: 'dome', capH: 7, capMat: M.MARBLE, mat: M.SANDSTONE } },
      { t: 'arch', tag: 'lahorigate', x: 0, z: 40, w: 36, d: 16, h: 24, span: 9, spring: 8, pointed: true, axis: 'z', mat: M.SANDSTONE, attic: { cap: 'flat', w: 20, d: 8, h: 4 } },
      ...[-1, 1].map((s) => ({ t: 'tower', tag: 'gatetowers', x: s * 22, z: 40, w: 8, h: 30, sides: 8, cap: 'dome', capH: 5, capMat: M.MARBLE, mat: M.SANDSTONE })),
      { t: 'colonnade', tag: 'diwaniaam', x: 0, z: -10, w: 54, d: 24, podH: 1.2, colH: 7, colW: 1.4, bay: 5, rows: 'ring', roof: 'flat', mat: M.SANDSTONE },
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
    S: 1.6, yaw: 0.3, mat: M.MARBLE,
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
    S: 1.3, yaw: 0.2, mat: M.LIMESTONE, domeMat: M.VERDE,
    parts: [
      // Three madrasas round the square: Ulugh Beg west, Sher-Dor east, Tilya-Kori north.
      ...[[-60, 0, 'x'], [60, 0, 'x'], [0, -60, 'z']].flatMap(([x, z, ax], i) => {
        const along = ax === 'x';
        const tag = ['ulughbeg', 'sherdor', 'tilyakori'][i];
        const out = x < 0 ? -1 : x > 0 ? 1 : -1;
        const bx = along ? x + out * 34 : x, bz = along ? z : z - 34;
        return [
          { t: 'arch', tag, x, z, w: along ? 12 : 34, d: along ? 34 : 12, h: 34, span: 14, spring: 14, pointed: true, solid: true, axis: along ? 'x' : 'z', mat: M.LIMESTONE },
          { t: 'hall', tag, x: bx, z: bz, w: along ? 55.4 : 70, d: along ? 70 : 55.4, h: 14, roof: 'flat', mat: M.LIMESTONE, storey: 7 },
          ...[-1, 1].map((s) => ({ t: 'tower', tag: `${tag}minarets`, x: along ? x + out * 12 : x + s * 36, z: along ? z + s * 36 : z - 12, w: 6, h: 33, round: true, cap: 'flat', capH: 1, mat: M.LIMESTONE, floors: 1 })),
        ];
      }),
      { t: 'dome', tag: 'tilyakoridome', x: 22, z: -95, y0: 14.8, r: 9, drumH: 6, h: 10, mat: M.LIMESTONE, domeMat: M.VERDE, lantern: false },
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
    S: 1.0, yaw: 0.5, mat: M.LIMESTONE,
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
    S: 1.2, yaw: 0.45, mat: M.BRICK, roofMat: M.VERDE,
    parts: [
      { t: 'tower', tag: 'tower', x: 0, z: 0, w: 22, h: 58, cap: 'hip', capH: 20, capW: 15, capMat: M.VERDE, mat: M.BRICK, floors: 3 },
      { t: 'hall', tag: 'wings', x: -38, z: 0, w: 53, d: 18, h: 34, roof: 'hip', roofH: 12, mat: M.BRICK, roofMat: M.VERDE, storey: 5.6 },
      { t: 'hall', tag: 'wings', x: 38, z: 0, w: 53, d: 18, h: 30, roof: 'hip', roofH: 12, mat: M.BRICK, roofMat: M.VERDE, storey: 5.6 },
      { t: 'hall', tag: 'wings', x: -58, z: 35, w: 18, d: 51.4, h: 28, roof: 'hip', roofH: 10, mat: M.BRICK, roofMat: M.VERDE, storey: 5.6 },
      ...[[-1, 1], [1, 1]].map(([s]) => ({ t: 'tower', tag: 'turrets', x: s * 67.5, z: -11, w: 8, h: 34, round: true, cap: 'cone', capH: 12, capMat: M.VERDE, mat: M.BRICK })),
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
    S: 0.9, yaw: 0.35, mat: M.LIMESTONE,
    parts: [
      { t: 'steps', tag: 'bastions', x: 0, z: 0, w: 190, d: 130, h: 36, n: 4, wTop: 90, dTop: 50, batter: 0.4, mat: M.LIMESTONE, coarse: 2.4 },
      { t: 'hall', tag: 'barracks', x: -20, z: -5, y0: 36, w: 50, d: 20, h: 10, roof: 'flat', mat: M.LIMESTONE, storey: 5, ground: false },
      ...[[-40, 22], [40, 22], [40, -22]].map(([x, z]) => ({ t: 'tower', tag: 'garitas', x, z, y0: 36, w: 4, h: 5, round: true, cap: 'dome', capH: 2.5, capMat: M.LIMESTONE, mat: M.LIMESTONE, ground: false, roofPosts: false, floors: 0 })),
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
  versailles: 2.32,
  chambord: 2.40,
  seville: 1.80,
  alhambra: 1.44,
  malbork: 2.06,
  warsaw: 1.25,
  bran: 1.30,
  bucharest: 2.50,
  kronborg: 1.89,
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
  djoser: 2.27,
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
