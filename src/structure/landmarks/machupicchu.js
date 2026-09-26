import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Machu Picchu: the Intihuatana and the Sacred Plaza, the Torreón, and the
 * agricultural terraces down the south end of the ridge.
 *
 * Reference figures (Instituto Nacional de Cultura; the Wright Paleohydrology
 * survey; Overture has seventy-one house outlines on the summit, 12 x 14 m
 * and smaller, with heights read off the canopy):
 *   the ridge        a saddle running north-south at 2,430 m, the level top
 *                    180 x 342 m in the bake, the Urubamba 400 m below on
 *                    both sides; Huayna Picchu 180 m higher, 600 m north
 *   the Intihuatana  a terraced outcrop about 60 x 45 m at its foot and 20 m
 *                    high, its retaining walls stepping up to a platform with
 *                    the carved gnomon on it; the stair up its east side from
 *                    the Sacred Plaza
 *   the plaza        the Principal Temple, three walls of great ashlar 11 x 8
 *                    and 4 m tall, open to the south; the Temple of the Three
 *                    Windows, its east wall pierced by three trapezoids over
 *                    the plaza below; the priest's houses
 *   the Torreón      the Temple of the Sun: a D-shaped tower of the finest
 *                    ashlar, about 10 m across and 5 m tall, on a granite
 *                    boulder with the Royal Tomb hollowed under it, and the
 *                    enclosure beside it
 *   the terraces     the andenes: retaining walls 2 to 4 m tall stepping down
 *                    the south end of the ridge, dry-laid, holding the fields
 *
 * A mountain, but a low one: nothing at Machu Picchu is tall enough to fall
 * over, and the whole site is retaining walls with buildings standing on the
 * ground they hold. That is the twist. The temples on the plaza are a few
 * courses of ashlar laid without mortar — there is nothing to bring down but
 * the courses themselves — while the Intihuatana's terraces are the walls
 * that hold the hill up under the stone on top, and cutting one drops the
 * fill and the platform above it. The terraces at the south end are the same
 * construction, exposed on a slope, and are scenery: they are what the place
 * looks like, and they count for nothing.
 */

// Nearly twice life. Nothing here is taller than twenty metres, and at 1:1
// the ashlar the place is famous for is a kerb from the camera.
const S = 1.8;

// Real metres, scaled once at the end. `FOUND` is where the walls start,
// under the summit, so that wherever the ridge falls away the masonry meets
// it; `ROUGH` is below every exposed face and the blocks under it are coarse.
const FOUND = -46.0;
const WALL = 1.2;

/** The Intihuatana: five terraces of retaining wall round a fill, stepping up to the gnomon. */
const MOUND = {
  cx: -6.0, cz: -12.0,
  base: { hx: 30.0, hz: 22.0 },
  top: { hx: 7.5, hz: 5.5 },
  terraces: 5,
  rise: 4.0,
  stair: { w: 2.6, nose: 1.2 },       // up the east face, from the plaza
  gnomon: { plinth: 5.0, plinthH: 0.5, w: 2.0, d: 1.8, h: 1.6 },
};
/** The Sacred Plaza, east of the mound. */
const PRINCIPAL = { cx: 30.0, cz: -4.0, w: 11.0, d: 8.0, wall: 1.0, h: 4.0, open: 'south' };
const WINDOWS = { cx: 38.0, cz: 8.0, w: 5.0, d: 10.0, wall: 1.0, h: 3.5, sill: 1.0, head: 2.4, at: [-2.4, 0, 2.4], half: 0.7 };
const HOUSES = [
  { cx: 30.0, cz: 16.0, w: 8.0, d: 5.0 },
  { cx: 30.0, cz: 24.0, w: 8.0, d: 5.0 },
  { cx: 30.0, cz: 32.0, w: 8.0, d: 5.0 },
  { cx: 41.0, cz: 20.0, w: 8.0, d: 5.0 },
  { cx: 41.0, cz: 29.0, w: 8.0, d: 5.0 },
  { cx: 8.0, cz: 30.0, w: 9.0, d: 5.5 },
  { cx: -4.0, cz: 30.0, w: 9.0, d: 5.5 },
];
const HOUSE = { wall: 0.8, h: 3.0, gable: 2.0 };

/** The Torreón, on its own ground 40 m east and 70 m south of the mound. */
const TORREON = {
  offset: { x: 40, z: 70 },
  rock: { w: 12.0, d: 12.0, h: 3.0 },
  r: 4.5, wall: 1.0, h: 5.0,
  windows: [0.5, -0.35],               // bearings on the curved wall, radians from east
  sill: 0.6, head: 2.0,                // over the rock
  enclosure: { cx: -10.0, cz: 0.0, w: 8.0, d: 6.0, wall: 0.9, h: 3.5 },
};

/**
 * The andenes at the south end, on their own ground where the plateau ends.
 *
 * Each row is a retaining wall across the ridge from `FOUND` to its own top,
 * holding a strip of field behind it, and the tops follow the ground the bake
 * cut: `ground` is the crest under each wall in world metres below the
 * structure's own origin, sampled from the bake at ten-metre spacing. The
 * ridge is narrow here — thirty-six metres of level ground at the top row,
 * falling away sixty metres on either hand — so the rows narrow as they go
 * down and their end walls are exposed too.
 */
const TERRACE_OFFSET = { x: 0, z: 185 };
const TERRACES = [
  { z: 0.0, ground: -2, w: 22.0 },
  { z: 5.0, ground: -9, w: 21.5 },
  { z: 10.0, ground: -18, w: 21.0 },
  { z: 15.0, ground: -27, w: 20.5 },
  { z: 20.0, ground: -36, w: 20.0 },
  { z: 25.0, ground: -45, w: 19.5 },
  { z: 30.0, ground: -55, w: 19.0 },
  { z: 35.0, ground: -61, w: 18.5 },
  { z: 40.0, ground: -64, w: 18.0 },
].map((t) => ({ ...t, top: (t.ground + 6.0) / S, rough: (t.ground - 4.0) / S, d: 5.0 }));

/** Half-width of the mound's terrace `i` along an axis. */
const moundHalf = (axis, i) => MOUND.base[axis] - (MOUND.base[axis] - MOUND.top[axis]) * (i / MOUND.terraces);

/** What the garrison, the flag and the level record read. */
export const MACHUPICCHU = {
  scale: S,
  mound: {
    cx: MOUND.cx * S, cz: MOUND.cz * S,
    top: MOUND.rise * MOUND.terraces * S,
    /** The terrace walks, low to high: the face of the wall above each, and its height. */
    ledges: Array.from({ length: MOUND.terraces - 1 }, (_, i) => ({
      hx: moundHalf('hx', i + 1) * S, hz: moundHalf('hz', i + 1) * S, y: MOUND.rise * (i + 1) * S,
    })),
    platform: { hx: moundHalf('hx', MOUND.terraces - 1) * S, hz: moundHalf('hz', MOUND.terraces - 1) * S },
  },
  principal: { cx: PRINCIPAL.cx * S, cz: PRINCIPAL.cz * S, w: PRINCIPAL.w * S, d: PRINCIPAL.d * S, h: PRINCIPAL.h * S },
  windows: WINDOWS.at.map((z) => ({ x: (WINDOWS.cx + WINDOWS.w / 2 - 1.2) * S, y: (WINDOWS.sill + 0.2) * S, z: (WINDOWS.cz + z) * S })),
  houses: HOUSES.map((h) => ({ cx: h.cx * S, cz: h.cz * S, w: h.w * S, d: h.d * S, h: HOUSE.h * S })),
  torreon: { offset: TORREON.offset, rockTop: TORREON.rock.h * S, r: TORREON.r * S, windows: TORREON.windows, enclosure: { cx: TORREON.enclosure.cx * S, h: TORREON.enclosure.h * S, w: TORREON.enclosure.w * S } },
  terraces: TERRACE_OFFSET,
  flag: { x: MOUND.cx * S, y: (MOUND.rise * MOUND.terraces + MOUND.gnomon.plinthH + MOUND.gnomon.h + 1.0) * S, z: MOUND.cz * S },
};

const courses = (y0, y1, nominal, fn) => {
  const n = Math.max(1, Math.round((y1 - y0) / nominal));
  const ch = (y1 - y0) / n;
  for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c, n);
};

/** A solid course of fill on a fixed lattice, so every stone stands squarely on the one below. */
function latticeSlab(B, cx, cz, hx, hz, y, h, pitch, mat) {
  const cuts = (H) => {
    const m = Math.floor(H / pitch);
    const edges = [];
    for (let k = -m; k <= m; k++) edges.push(k * pitch);
    if (H - m * pitch > pitch * 0.34) { edges.unshift(-H); edges.push(H); } else { edges[0] = -H; edges[edges.length - 1] = H; }
    return edges;
  };
  const ex = cuts(hx), ez = cuts(hz);
  for (let i = 0; i + 1 < ex.length; i++) {
    for (let k = 0; k + 1 < ez.length; k++) {
      const w = ex[i + 1] - ex[i], d = ez[k + 1] - ez[k];
      B.add(cx + (ex[i] + ex[i + 1]) / 2, y + h / 2, cz + (ez[k] + ez[k + 1]) / 2,
        B.shrink(w / 2), B.shrink(h / 2), B.shrink(d / 2), mat);
    }
  }
}

/** The stone for a tier, real metres: Inca ashlar is big, a metre and a half at the coarsest tier. */
function grain(quality) {
  const s = Math.min(quality.blockScale, 1.3);
  return { stone: 1.1 * s, course: 0.9 * s };
}

/** A roofless Inca house: four walls, a door, and the two gable ends stepping up. */
function house(B, hs, stone, course) {
  const { cx, cz, w, d } = hs;
  const t = HOUSE.wall;
  const door = (x, y, z) => y < 2.0 && Math.abs(x - cx) < 0.7 && z > cz + d / 2 - t - 0.1;
  B.openings(door, () => {
    courses(0, HOUSE.h, course, (y, h, c) => B.ring(cx, cz, w, d, t, y, h, stone, M.MARBLE, c % 2));
  });
  // The gables, on the two end walls, three courses stepping in.
  courses(HOUSE.h, HOUSE.h + HOUSE.gable, course, (y, h, c, n) => {
    const k = 1 - (c + 0.5) / n;
    for (const sx of [-1, 1]) {
      B.slab(cx + sx * (w / 2 - t / 2), y + h / 2, cz, t, h, Math.max(0.8, d * k), stone, M.MARBLE);
    }
  });
}

export function buildMachupicchu(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const { stone, course } = grain(quality);
  const core = stone * 2.0;

  // ── The Intihuatana: five terraces of retaining wall on a rubble fill, in
  // solid courses, the walls stepping in and the stair up the east side.
  B.section('intihuatana', () => {
    const { cx, cz, rise, terraces } = MOUND;
    for (let i = 0; i < terraces; i++) {
      courses(i * rise, (i + 1) * rise, course, (y, h, c) => {
        // The outcrop is steeper on the west, so each terrace sits a little
        // east of the one below: the real thing is not a pyramid.
        const shift = 0.6 * i;
        const hx = moundHalf('hx', i) - 0.08 * c, hz = moundHalf('hz', i) - 0.08 * c;
        B.ring(cx + shift, cz, hx * 2, hz * 2, WALL, y, h, stone, M.LIMESTONE, c % 2);
        latticeSlab(B, cx + shift, cz, hx - WALL, hz - WALL, y, h, core, M.RUBBLE);
      });
    }
    // The stair, up the east face.
    for (let i = 0; i < terraces; i++) {
      courses(i * rise, (i + 1) * rise, course, (y, h, c) => {
        const face = cx + 0.6 * i + moundHalf('hx', i) - 0.08 * c + 0.03;
        B.slab(face + MOUND.stair.nose / 2, y + h / 2, cz + 2.0, MOUND.stair.nose, h, MOUND.stair.w, stone, M.LIMESTONE);
      });
    }
    // The gnomon on its plinth, on the summit.
    const G = MOUND.gnomon, top = rise * terraces, gx = cx + 0.6 * (terraces - 1);
    B.slab(gx, top + G.plinthH / 2, cz, G.plinth, G.plinthH, G.plinth, stone, M.MARBLE);
    B.add(gx, top + G.plinthH + G.h / 2, cz, G.w / 2, G.h / 2, G.d / 2, M.MARBLE);
  });

  // ── The Sacred Plaza: the Principal Temple, three walls open to the
  // south; the Temple of the Three Windows, its east wall pierced.
  B.section('temples', () => {
    const P = PRINCIPAL;
    const openSouth = (x, _y, z) => z > P.cz + P.d / 2 - P.wall - 0.1 && Math.abs(x - P.cx) < P.w / 2 - P.wall * 1.6;
    B.openings(openSouth, () => {
      courses(0, P.h, course, (y, h, c) => B.ring(P.cx, P.cz, P.w, P.d, P.wall, y, h, stone, M.MARBLE, c % 2));
    });
    const W = WINDOWS;
    const openWest = (x, _y, z) => x < W.cx - W.w / 2 + W.wall + 0.1 && Math.abs(z - W.cz) < W.d / 2 - W.wall * 1.6;
    const window = (x, y, z) => x > W.cx + W.w / 2 - W.wall - 0.1 && y > W.sill && y < W.head
      && W.at.some((a) => Math.abs(z - (W.cz + a)) < W.half);
    B.openings((x, y, z) => openWest(x, y, z) || window(x, y, z), () => {
      courses(0, W.h, course, (y, h, c) => B.ring(W.cx, W.cz, W.w, W.d, W.wall, y, h, stone, M.MARBLE, c % 2));
    });
  });

  // ── The houses, roofless, along the plaza's edge and below the mound.
  B.section('houses', () => {
    for (const hs of HOUSES) house(B, hs, stone, course);
  });

  B.scaleAll(S);
  return B;
}

/** The Torreón, on its boulder, with the Royal Tomb under it and the enclosure beside. */
export function buildTorreon(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const { stone, course } = grain(quality);
  const T = TORREON;

  B.section('torreon', () => {
    // The boulder, with the tomb hollowed into its west side.
    const tomb = (x, y, z) => y < 2.4 && x < -T.rock.w / 2 + 5.0 && Math.abs(z) < 2.6;
    B.openings(tomb, () => {
      courses(0, T.rock.h, course, (y, h) => {
        B.slab(0, y + h / 2, 0, T.rock.w, h, T.rock.d, stone * 1.6, M.LIMESTONE);
      });
    });
    // The D: a half circle on the east, a straight wall on the west.
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      pts.push([Math.cos(a) * T.r, Math.sin(a) * T.r]);
    }
    const win = (x, y, z) => y > T.rock.h + T.sill && y < T.rock.h + T.head && x > T.r * 0.4
      && T.windows.some((b) => Math.abs(Math.atan2(z, x) - b) < 0.14);
    B.openings(win, () => {
      courses(T.rock.h, T.rock.h + T.h, course, (y, h, c) => {
        B.polyRing(0, 0, pts, T.wall, y, h, stone, M.MARBLE, c % 2);
      });
    });
    // The enclosure beside it, on the ground.
    const E = T.enclosure;
    const door = (x, y, z) => y < 2.0 && Math.abs(z) < 0.7 && x > E.cx + E.w / 2 - E.wall - 0.1;
    B.openings(door, () => {
      courses(0, E.h, course, (y, h, c) => B.ring(E.cx, E.cz, E.w, E.d, E.wall, y, h, stone, M.MARBLE, c % 2));
    });
  });

  B.scaleAll(S);
  return B;
}

/**
 * The andenes, down the south end of the ridge: retaining walls from the
 * rock to their own tops, coarse and bare where they are buried and dressed
 * where the slope has left them standing, with a strip of field behind each.
 */
export function buildTerraces(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const { stone, course } = grain(quality);
  const rough = stone * 3.2, roughCourse = course * 3.0;

  B.section('terraces', () => {
    for (const t of TERRACES) {
      const cz = t.z + t.d / 2;
      const band = (y0, y1, st, ch, mat) => courses(y0, y1, ch, (y, h, c) => {
        B.ring(0, cz, t.w, t.d, WALL, y, h, st, mat, c % 2);
        B.slab(0, y + h / 2, cz, t.w - WALL * 2, h, t.d - WALL * 2, st, M.RUBBLE);
      });
      if (t.rough > FOUND) band(FOUND, t.rough, rough, roughCourse, M.LIMESTONE);
      band(Math.max(FOUND, t.rough), t.top, stone, course, M.LIMESTONE);
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison: on the Intihuatana's terrace walks, in the temples and the
 * houses on the plaza, and in the Torreón's windows. Read from the constants.
 */
export function populateMachupicchu(g, origin, groundY) {
  const K = MACHUPICCHU;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const m = K.mound;
  // The mound's walks: a man at each corner, riflemen low, the long guns high.
  m.ledges.forEach((L, i) => {
    const type = i === 0 ? 'rifleman' : i === 1 ? 'mg' : i === 2 ? 'at' : 'sniper';
    const shift = 0.6 * S * (i + 1);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = m.cx + shift + sx * (L.hx + 1.3), z = m.cz + sz * (L.hz * 0.6);
      g.place(type, V(x, L.y + 1.0, z), Math.atan2(sx, sz), 6, { cover: 'roof' });
    }
  });
  // The summit, round the gnomon.
  for (const sx of [-1, 1]) {
    g.place('sniper', V(m.cx + 0.6 * S * 4 + sx * (m.platform.hx - 2.0), m.top + 1.0, m.cz), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'roof' });
  }
  g.place('mortar', V(m.cx + 0.6 * S * 4, m.top + 1.0, m.cz + m.platform.hz - 2.0), 0, 6, { cover: 'roof' });
  // The Principal Temple: two men in the open south side.
  for (const sx of [-1, 1]) {
    g.place('mg', V(K.principal.cx + sx * (K.principal.w / 2 - 2.0), 1.0, K.principal.cz + K.principal.d / 2 - 1.0), 0, 6, { cover: 'arcade' });
  }
  // The Three Windows.
  for (const w of K.windows) g.place('rifleman', V(w.x, w.y, w.z), Math.PI / 2, 5, { cover: 'window' });
  // The houses: a man in each door.
  K.houses.forEach((h, i) => {
    g.place(i % 3 === 0 ? 'at' : 'rifleman', V(h.cx, 1.0, h.cz + h.d / 2 - 1.0), 0, 6, { cover: 'arcade' });
  });
}

export function populateTorreon(g, origin, groundY) {
  const T = MACHUPICCHU.torreon;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  // In the windows, on the rock.
  for (const b of T.windows) {
    g.place('sniper', V(Math.cos(b) * (T.r - 1.8), T.rockTop + 1.0, Math.sin(b) * (T.r - 1.8)), Math.atan2(Math.cos(b), Math.sin(b)), 6, { cover: 'window' });
  }
  // The enclosure door, and a rifleman on the rock's west lip over the tomb.
  g.place('rifleman', V(T.enclosure.cx + T.enclosure.w / 2 - 1.0, 1.0, 0), Math.PI / 2, 6, { cover: 'arcade' });
  g.place('rifleman', V(-T.r - 0.8, T.rockTop + 1.0, 0), -Math.PI / 2, 6, { cover: 'roof' });
}
