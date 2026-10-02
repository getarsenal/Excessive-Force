import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Machu Picchu: the citadel on its saddle, laid out as it is.
 *
 * Reference (Instituto Nacional de Cultura; Wright and Valencia Zegarra's
 * survey; Overture has seventy-one house outlines on the summit, 12 x 14 m
 * and smaller):
 *   the ridge        a saddle running north-south at 2,430 m, the level top
 *                    180 x 342 m in the bake, the Urubamba 560 m below;
 *                    Huayna Picchu 180 m higher, 600 m north
 *   the plaza        the long open lawn down the middle of the saddle,
 *                    separating the upper town on the west from the lower
 *                    town on the east
 *   the upper town   at its north end the Intihuatana, a rock knoll wrapped
 *                    in terraces stepping up to the carved stone on top; under
 *                    it the Sacred Plaza, with the Principal Temple (three
 *                    walls of great ashlar open to the plaza) and the Temple
 *                    of the Three Windows; south of that the royal compounds
 *                    and the Torreón, the curved tower on its boulder
 *   the lower town   the kanchas: walled compounds of two to four houses round
 *                    a yard, the Three Doorways at the north, the Mortars, the
 *                    Condor at the south
 *   the houses       a single room, 7 x 4.5 m, granite walls 3 m tall leaning
 *                    a little inward, a trapezoid door, a gable at each end as
 *                    steep as fifty degrees; a few carry the thatch of ichu
 *                    grass they all once had
 *   the terraces     the andenes, wrapping the slopes under the town: walls
 *                    two metres tall holding strips of field, following the
 *                    hill's contours round it
 *
 * Granite, the pale grey of the mountain it was quarried from, laid without
 * mortar. Nearly two thirds life: nothing here is taller than a house, and
 * at 1:1 the camera that frames the saddle sees a scatter of pebbles.
 *
 * Nothing at Machu Picchu is tall enough to fall over, and that is the
 * twist: it is a town, not a tower. The Intihuatana is the objective, a
 * knoll of terrace walls holding fill under the stone on top — cut a wall
 * and the fill goes, and the terrace above it with it — and the Torreón on
 * its rock is the second. The houses are a few courses each and come down
 * a house at a time.
 */

const S = 1.6;
const WALL = 1.0;

/** The Intihuatana knoll, north-west of the plaza: four terraces wrapped round a rock. */
const KNOLL = {
  // At the head of the plaza, where the summit is still level under the
  // whole of its foot: further west the ground falls away, and a knoll
  // built there stood out over the slope on nothing.
  cx: -12.0, cz: -63.0,
  rx: 14.0, rz: 10.5,           // the foot of the lowest terrace
  shrink: 2.5,                  // each terrace steps in this much on rx (rz in proportion)
  tiers: 4, rise: 2.2,
  sides: 20,
  gnomon: { base: { w: 3.2, d: 2.4, h: 1.0 }, post: { w: 0.7, d: 0.9, h: 1.8 } },
};
/** The outline's wobble: a knoll is not an ellipse. */
const wobble = (a) => 1 + 0.09 * Math.sin(3 * a + 0.7) + 0.05 * Math.cos(5 * a - 0.3);
const knollR = (i) => ({ rx: KNOLL.rx - KNOLL.shrink * i, rz: KNOLL.rz - KNOLL.shrink * (KNOLL.rz / KNOLL.rx) * i });

/** The Sacred Plaza, under the knoll. */
const PRINCIPAL = { cx: -30.0, cz: -44.0, w: 11.0, d: 8.0, wall: 1.2, h: 4.0 };     // open to the south
const WINDOWS = { cx: -17.0, cz: -44.0, w: 5.5, d: 10.0, wall: 1.1, h: 3.6, sill: 1.1, head: 2.4, at: [-2.6, 0, 2.6] };

/**
 * The kanchas: walled yards, the houses inside along two or three of their
 * walls, a door in the wall that faces the plaza. `door` is the side.
 */
const KANCHAS = [
  // The upper town, west of the plaza, in two columns, leaving the Torreón
  // its ground at the middle of the west side. Only where the summit is
  // level under the whole yard: footcheck.mjs measures it.
  ...[-24, -7, 10].map((cz) => ({ cx: -38.0, cz, w: 15.0, d: 14.0, door: 'w' })),
  ...[-24, -8, 8, 60].map((cz) => ({ cx: -22.0, cz, w: 13.0, d: 13.0, door: 'e' })),
  // The lower town, east of it: the Three Doorways at the north, then the
  // Mortars and the Condor, two columns deep down the east side.
  ...[-77, -61, -45, -29, -13, 3, 19, 35, 51].map((cz) => ({ cx: 22.0, cz, w: 13.0, d: 13.5, door: 'w' })),
  ...[-45, -29, -13, 3, 19, 35].map((cz) => ({ cx: 38.5, cz, w: 15.0, d: 14.0, door: 'e' })),
];
const KANCHA = { wall: 0.9, h: 2.4, gap: 0.5 };
const HOUSE = { wall: 0.75, h: 3.0, pitch: 1.15, door: { b: 1.1, t: 0.8, h: 2.0 } };

/** Houses standing on their own: the priests' house, the guardhouse, the storehouses. */
const LONE = [
  { cx: -36.0, cz: -35.0, w: 8.0, d: 4.6, door: 'n', thatch: true },
  { cx: -8.0, cz: 92.0, w: 7.0, d: 4.6, door: 'e', thatch: true },      // the guardhouse
  { cx: 6.0, cz: 88.0, w: 6.0, d: 4.2, door: 'n', thatch: true },
  { cx: 14.0, cz: 88.0, w: 6.0, d: 4.2, door: 'n', thatch: true },
  { cx: 22.0, cz: 88.0, w: 6.0, d: 4.2, door: 'n', thatch: true },
];

/** The Torreón, on its own ground in the upper town south of the royal compounds. */
const TORREON_AT = { x: -55, z: 62 };            // world metres from the origin
const TORREON = {
  rock: { w: 12.0, d: 12.0, h: 3.0 },
  r: 4.5, wall: 1.0, h: 5.0,
  windows: [0.5, -0.35],               // bearings on the curved wall, radians from east
  sill: 0.6, head: 2.0,                // over the rock
  enclosure: { cx: 2.0, cz: 10.5, w: 9.0, d: 6.0, wall: 0.9, h: 3.0 },
};

/** Every house in the citadel, in the yards and alone, with its world-metre door. */
function allHouses() {
  const out = [];
  KANCHAS.forEach((k, ki) => {
    const inner = { w: k.w - 2 * KANCHA.wall, d: k.d - 2 * KANCHA.wall };
    const g = KANCHA.gap;
    // Along the north and south walls, facing the yard; a third along the
    // back wall where the yard is wide enough for it.
    const hd = 4.4, hw = Math.min(8.5, inner.w - 2 * g - 1.0);
    const back = k.door === 'e' ? -1 : 1;
    const shiftX = back * 0.6;
    out.push({ cx: k.cx + shiftX, cz: k.cz - inner.d / 2 + g + hd / 2, w: hw, d: hd, door: 's', thatch: ki % 3 === 0 });
    out.push({ cx: k.cx + shiftX, cz: k.cz + inner.d / 2 - g - hd / 2, w: hw, d: hd, door: 'n', thatch: ki % 3 === 1 });
    const room = inner.d - 2 * (hd + g) - 2 * g;
    if (room >= 4.0 && inner.w >= 15) {
      const bw = 4.2, bd = Math.min(7.0, room);
      out.push({ cx: k.cx + back * (inner.w / 2 - g - bw / 2), cz: k.cz, w: bw, d: bd, door: back > 0 ? 'w' : 'e', thatch: ki % 3 === 2 });
    }
  });
  for (const h of LONE) out.push(h);
  return out;
}
const HOUSES = allHouses();

/** What the garrison, the flag and the level record read, in world metres. */
export const MACHUPICCHU = {
  scale: S,
  knoll: {
    cx: KNOLL.cx * S, cz: KNOLL.cz * S, top: KNOLL.tiers * KNOLL.rise * S,
    /** The walk on each terrace, low to high: its height and the half-extents of the wall above it. */
    walks: Array.from({ length: KNOLL.tiers - 1 }, (_, i) => {
      const r = knollR(i + 1);
      return { y: (i + 1) * KNOLL.rise * S, rx: r.rx * S, rz: r.rz * S };
    }),
    platform: { rx: knollR(KNOLL.tiers - 1).rx * S, rz: knollR(KNOLL.tiers - 1).rz * S },
  },
  principal: { cx: PRINCIPAL.cx * S, cz: PRINCIPAL.cz * S, w: PRINCIPAL.w * S, d: PRINCIPAL.d * S },
  windows: WINDOWS.at.map((z) => ({ x: (WINDOWS.cx + WINDOWS.w / 2 - 1.2) * S, y: (WINDOWS.sill + 0.2) * S, z: (WINDOWS.cz + z) * S })),
  kanchas: KANCHAS.map((k) => ({ cx: k.cx * S, cz: k.cz * S, w: k.w * S, d: k.d * S, door: k.door })),
  houses: HOUSES.map((h) => ({ cx: h.cx * S, cz: h.cz * S, w: h.w * S, d: h.d * S, door: h.door })),
  torreon: { offset: TORREON_AT, rockTop: TORREON.rock.h * S, r: TORREON.r * S, windows: TORREON.windows,
    enclosure: { cx: TORREON.enclosure.cx * S, cz: TORREON.enclosure.cz * S, w: TORREON.enclosure.w * S, d: TORREON.enclosure.d * S } },
  flag: { x: KNOLL.cx * S, y: (KNOLL.tiers * KNOLL.rise + KNOLL.gnomon.base.h + KNOLL.gnomon.post.h + 1.2) * S, z: KNOLL.cz * S },
};

const courses = (y0, y1, nominal, fn) => {
  const n = Math.max(1, Math.round((y1 - y0) / nominal));
  const ch = (y1 - y0) / n;
  for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c, n);
};

/** Inca masonry, real metres: big stones, coarser on the coarser tiers. */
function grain(quality) {
  const s = Math.min(quality.blockScale, 1.3);
  return { stone: 1.05 * s, course: 0.75 * s };
}

/** A trapezoid opening in a wall, `b` wide at the sill and `t` at the head. */
const trapezoid = (u, y, y0, h, b, t) => y > y0 && y < y0 + h && Math.abs(u) < (b + (t - b) * ((y - y0) / h)) / 2;

/**
 * An Inca house: four granite walls with a trapezoid door, a window opposite,
 * a steep gable at each end, and — on some — the thatch.
 */
function house(B, hs, stone, course) {
  const { cx, cz, w, d, door } = hs;
  const t = HOUSE.wall, H = HOUSE.h;
  const alongX = w >= d;                   // the long axis; the gables close the short ends
  const long = alongX ? w : d, short = alongX ? d : w;
  // The door, and a window high in the wall opposite.
  const D = HOUSE.door;
  const onSide = (x, z, side) => side === 'n' ? z < cz - d / 2 + t + 0.1
    : side === 's' ? z > cz + d / 2 - t - 0.1
      : side === 'w' ? x < cx - w / 2 + t + 0.1 : x > cx + w / 2 - t - 0.1;
  const opposite = { n: 's', s: 'n', e: 'w', w: 'e' }[door];
  const along = (x, z, side) => (side === 'n' || side === 's') ? x - cx : z - cz;
  const cut = (x, y, z) => (onSide(x, z, door) && trapezoid(along(x, z, door), y, 0, D.h, D.b, D.t))
    || (onSide(x, z, opposite) && trapezoid(along(x, z, opposite), y, 1.3, 1.0, 0.7, 0.5));
  B.openings(cut, () => {
    courses(0, H, course, (y, h, c) => B.ring(cx, cz, w, d, t, y, h, stone, M.GRANITE, c % 2));
  });
  // The gables: the end walls carried up in courses, each narrower.
  const G = short * 0.5 * HOUSE.pitch;
  courses(H, H + G, course, (y, h, c, n) => {
    const k = 1 - (c + 0.5) / n;
    const span = Math.max(0.7, (short - 0.2) * k);
    for (const sgn of [-1, 1]) {
      if (alongX) B.slab(cx + sgn * (w / 2 - t / 2), y + h / 2, cz, t, h, span, stone, M.GRANITE);
      else B.slab(cx, y + h / 2, cz + sgn * (d / 2 - t / 2), span, h, t, stone, M.GRANITE);
    }
  });
  if (!hs.thatch) return;
  // The thatch: a course at a time up each slope from the wall heads to the
  // ridge, each course half over the one below it, overhanging the walls.
  const over = 0.35;
  const n = Math.max(2, Math.round(G / course));
  const ch = G / n;
  const step = (short / 2 + over) / (n + 0.5);
  const len = long + over * 2;
  for (let c = 0; c < n; c++) {
    const off = short / 2 + over - (c + 0.5) * step;
    for (const sgn of [-1, 1]) {
      const o = sgn * off;
      if (alongX) B.slab(cx, H + c * ch + ch / 2, cz + o, len, ch, step * 1.5, stone * 1.6, M.THATCH);
      else B.slab(cx + o, H + c * ch + ch / 2, cz, step * 1.5, ch, len, stone * 1.6, M.THATCH);
    }
  }
  if (alongX) B.slab(cx, H + G + ch * 0.4, cz, len, ch * 0.8, step * 1.8, stone * 1.6, M.THATCH);
  else B.slab(cx, H + G + ch * 0.4, cz, step * 1.8, ch * 0.8, len, stone * 1.6, M.THATCH);
}

/** A kancha's enclosing wall, with its door on the side facing the plaza. */
function kancha(B, k, stone, course) {
  const t = KANCHA.wall;
  const door = (x, y, z) => {
    if (y > 2.3) return false;
    if (k.door === 'e') return x > k.cx + k.w / 2 - t - 0.1 && Math.abs(z - k.cz) < 0.75;
    if (k.door === 'w') return x < k.cx - k.w / 2 + t + 0.1 && Math.abs(z - k.cz) < 0.75;
    if (k.door === 'n') return z < k.cz - k.d / 2 + t + 0.1 && Math.abs(x - k.cx) < 0.75;
    return z > k.cz + k.d / 2 - t - 0.1 && Math.abs(x - k.cx) < 0.75;
  };
  B.openings(door, () => {
    courses(0, KANCHA.h, course, (y, h, c) => B.ring(k.cx, k.cz, k.w, k.d, t, y, h, stone, M.GRANITE, c % 2));
  });
}

/** The knoll's outline at terrace `i`, as points round its centre. */
function knollPts(i, inset = 0) {
  const { rx, rz } = knollR(i);
  const pts = [];
  for (let k = 0; k < KNOLL.sides; k++) {
    const a = (k / KNOLL.sides) * Math.PI * 2;
    const f = wobble(a);
    pts.push([Math.cos(a) * (rx * f - inset), Math.sin(a) * (rz * f - inset)]);
  }
  return pts;
}

/** Fill a terrace's outline with a lattice of rubble, inside its wall. */
function knollFill(B, i, y, h, pitch) {
  const { rx, rz } = knollR(i);
  const { cx, cz } = KNOLL;
  for (let x = -rx; x <= rx; x += pitch) {
    for (let z = -rz; z <= rz; z += pitch) {
      const a = Math.atan2(z / rz, x / rx);
      const f = wobble(a);
      const e = Math.hypot(x / (rx * f), z / (rz * f));
      // Inside the wall by a stone, so the fill never runs into it.
      const margin = (WALL + pitch * 0.6) / Math.min(rx, rz);
      if (e > 1 - margin) continue;
      B.add(cx + x, y + h / 2, cz + z, B.shrink(pitch / 2), B.shrink(h / 2), B.shrink(pitch / 2), M.RUBBLE);
    }
  }
}

export function buildMachupicchu(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const { stone, course } = grain(quality);

  // ── The Intihuatana: four terraces of granite wall round a rubble fill,
  // each stepping in, and the carved stone on the platform at the top.
  B.section('intihuatana', () => {
    const { cx, cz, rise, tiers } = KNOLL;
    for (let i = 0; i < tiers; i++) {
      const pts = knollPts(i);
      courses(i * rise, (i + 1) * rise, course, (y, h, c) => {
        B.polyRing(cx, cz, pts, WALL, y, h, stone, M.GRANITE, c % 2);
        knollFill(B, i, y, h, stone * 1.9);
      });
    }
    // The Intihuatana stone: a carved block with the post standing out of it.
    const G = KNOLL.gnomon, top = rise * tiers;
    B.slab(cx, top + G.base.h / 2, cz, G.base.w, G.base.h, G.base.d, stone, M.GRANITE);
    B.add(cx + 0.4, top + G.base.h + G.post.h / 2, cz, G.post.w / 2, G.post.h / 2, G.post.d / 2, M.GRANITE);
  });

  // ── The Sacred Plaza: the Principal Temple, three walls of great ashlar
  // open to the south; the Temple of the Three Windows, open to the west and
  // its east wall pierced by three trapezoids over the main plaza.
  B.section('temples', () => {
    const big = stone * 1.5;
    const P = PRINCIPAL;
    const openSouth = (x, _y, z) => z > P.cz + P.d / 2 - P.wall - 0.1 && Math.abs(x - P.cx) < P.w / 2 - P.wall * 1.4;
    B.openings(openSouth, () => {
      courses(0, P.h, course * 1.25, (y, h, c) => B.ring(P.cx, P.cz, P.w, P.d, P.wall, y, h, big, M.GRANITE, c % 2));
    });
    const W = WINDOWS;
    const openWest = (x, _y, z) => x < W.cx - W.w / 2 + W.wall + 0.1 && Math.abs(z - W.cz) < W.d / 2 - W.wall * 1.4;
    const win = (x, y, z) => x > W.cx + W.w / 2 - W.wall - 0.1
      && W.at.some((a) => trapezoid(z - (W.cz + a), y, W.sill, W.head - W.sill, 1.2, 0.85));
    B.openings((x, y, z) => openWest(x, y, z) || win(x, y, z), () => {
      courses(0, W.h, course * 1.2, (y, h, c) => B.ring(W.cx, W.cz, W.w, W.d, W.wall, y, h, big, M.GRANITE, c % 2));
    });
  });

  B.scaleAll(S);
  return B;
}

/**
 * The town: the kanchas' walls and every house, in the yards and alone. Its
 * own structure, and not the objective — what the bill counts, and what
 * the garrison holds the plaza from.
 */
export function buildTown(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const { stone, course } = grain(quality);
  B.section('houses', () => {
    for (const k of KANCHAS) kancha(B, k, stone, course);
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
        B.slab(0, y + h / 2, 0, T.rock.w, h, T.rock.d, stone * 1.6, M.GRANITE);
      });
    });
    // The D: a half circle on the east, a straight wall on the west, in the
    // finest ashlar in the town.
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
        B.polyRing(0, 0, pts, T.wall, y, h, stone, M.GRANITE, c % 2);
      });
    });
    // The enclosure beside it, on the ground, with a thatched house in it.
    const E = T.enclosure;
    const door = (x, y, z) => y < 2.0 && Math.abs(x - E.cx) < 0.7 && z > E.cz + E.d / 2 - E.wall - 0.1;
    B.openings(door, () => {
      courses(0, E.h, course, (y, h, c) => B.ring(E.cx, E.cz, E.w, E.d, E.wall, y, h, stone, M.GRANITE, c % 2));
    });
  });

  B.scaleAll(S);
  return B;
}

/**
 * The andenes: terraces wrapped round the slopes under the town, on the
 * ground the bake cut.
 *
 * Each terrace is a wall laid along a contour of the real hillside — found
 * by walking out from the saddle along rays until the ground drops to the
 * terrace's line — with a strip of field packed behind it, its top level
 * with the wall's. Founded on the slope, stone by stone (the structure is
 * laid `onSlope`), so the wall's foot is wherever the hill is. Scenery: what
 * the place looks like, and worth nothing.
 *
 * Needs the terrain; a builder run without it (the tools in Node) gets no
 * terraces at all.
 */
export function buildTerraces(quality, terrain) {
  const B = new BlockList();
  B.joint = JOINT / S;
  if (!terrain) return B;
  const { stone } = grain(quality);
  const st = stone * 1.7, ch = 1.0 * Math.min(quality.blockScale, 1.3);
  const g0 = terrain.heightAt(0, 0);
  const H = (x, z) => (terrain.heightAt(x * S, z * S) - g0) / S;
  const C = { x: 0, z: 8 };
  const RISE = 1.9, LEVELS = 7, FIELD = 3.4, THICK = 1.0;
  const sectors = [[-40, 118], [148, 202]];
  const STEP = 3;

  B.section('terraces', () => {
    for (const [a0, a1] of sectors) {
      // Each ray's crossing of each terrace line.
      const rays = [];
      for (let a = a0; a <= a1; a += STEP) {
        const th = a * Math.PI / 180, dx = Math.cos(th), dz = Math.sin(th);
        const hits = [];
        let r = 20, k = 0, lastR = -9;
        while (r < 190 && k < LEVELS) {
          const top = -(1.2 + k * RISE);
          const line = top - RISE * 0.55;
          const x = C.x + dx * r, z = C.z + dz * r;
          if (H(x, z) <= line) {
            // Two terraces closer than a stride is a cliff, not a terrace:
            // that one is not built on this ray.
            hits[k] = r - lastR > 1.4 ? { x, z, top, g: H(x, z) } : null;
            if (hits[k]) lastR = r;
            k++;
            continue;
          }
          r += 0.5;
        }
        rays.push({ dx, dz, hits });
      }
      for (let k = 0; k < LEVELS; k++) {
        for (let j = 0; j + 1 < rays.length; j++) {
          const A = rays[j].hits[k], Bp = rays[j + 1].hits[k];
          if (!A || !Bp) continue;
          const dx = Bp.x - A.x, dz = Bp.z - A.z, L = Math.hypot(dx, dz);
          // A contour that jumps between rays has gone round a spur: not a wall.
          const expect = Math.hypot(A.x - C.x, A.z - C.z) * STEP * Math.PI / 180;
          if (L < 0.3 || L > expect * 2.6 + 1.5) continue;
          const ry = Math.atan2(dx, dz);
          // Inward: toward the saddle.
          let nx = -dz / L, nz = dx / L;
          const mx = (A.x + Bp.x) / 2 - C.x, mz = (A.z + Bp.z) / 2 - C.z;
          if (nx * mx + nz * mz > 0) { nx = -nx; nz = -nz; }
          const n = Math.max(1, Math.round(L / st)), seg = L / n;
          // The wall: from under the ground to a lip over the field.
          const base = Math.min(A.g, Bp.g) - 0.7, top = A.top + 0.25;
          courses(base, top, ch, (y, h, c) => {
            const stag = n > 1 && c % 2 ? 0.5 : 0;
            for (let i = 0; i < n; i++) {
              const t = (i + 0.5 + stag) / n;
              if (t >= 1) continue;
              B.add(A.x + dx * t, y + h / 2, A.z + dz * t,
                B.shrink(THICK / 2), B.shrink(h / 2), B.shrink(seg / 2), M.ASHLAR, ry);
            }
          });
          // The field behind it, packed up level with the wall's top.
          const off = THICK / 2 + FIELD / 2 + 0.02;
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            const fx = A.x + dx * t + nx * off, fz = A.z + dz * t + nz * off;
            const lo = Math.min(H(fx, fz), H(fx - nx * FIELD / 2, fz - nz * FIELD / 2)) - 0.3;
            const hi = A.top;
            if (hi - lo < 0.35) continue;
            B.add(fx, (lo + hi) / 2, fz, B.shrink(FIELD / 2), B.shrink((hi - lo) / 2), B.shrink(seg / 2), M.TURF, ry);
          }
        }
      }
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison: on the knoll's terrace walks and its platform, in the
 * temples, in the kancha doors and the house doors, and in the Torreón's
 * windows. Read from the constants.
 */
export function populateMachupicchu(g, origin, groundY) {
  const K = MACHUPICCHU;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const kn = K.knoll;
  const wallTop = KANCHA.h * S;
  // On the kanchas' walls first, over the plaza: a man on a wall one stone
  // thick, who comes down with it.
  K.kanchas.forEach((k, i) => {
    const sx = k.door === 'e' ? 1 : -1;
    const x = k.cx + sx * (k.w / 2 - KANCHA.wall * S / 2), z = k.cz + (i % 2 ? 1 : -1) * k.d / 4;
    g.place(i % 4 === 0 ? 'mg' : 'rifleman', V(x, wallTop + 1.0, z), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 4, { cover: 'roof' });
  });
  // The knoll's walks: four men round each, riflemen low, the long guns high.
  kn.walks.forEach((L, i) => {
    const type = i === 0 ? 'rifleman' : i === 1 ? 'mg' : 'sniper';
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2 + 0.6;
      const f = wobble(a);
      const x = kn.cx + Math.cos(a) * (L.rx * f + 1.2), z = kn.cz + Math.sin(a) * (L.rz * f + 1.2);
      g.place(type, V(x, L.y + 1.0, z), Math.atan2(Math.cos(a), Math.sin(a)), 6, { cover: 'roof' });
    }
  });
  // The platform, round the stone.
  for (const sx of [-1, 1]) {
    g.place('sniper', V(kn.cx + sx * (kn.platform.rx - 2.0), kn.top + 1.0, kn.cz), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'roof' });
  }
  g.place('mortar', V(kn.cx, kn.top + 1.0, kn.cz + kn.platform.rz - 2.0), 0, 6, { cover: 'roof' });
  // The Principal Temple: two men in its open side.
  for (const sx of [-1, 1]) {
    g.place('mg', V(K.principal.cx + sx * (K.principal.w / 2 - 2.4), 1.0, K.principal.cz + K.principal.d / 2 - 1.2), 0, 6, { cover: 'arcade' });
  }
  // The Three Windows.
  for (const w of K.windows) g.place('rifleman', V(w.x, w.y, w.z), Math.PI / 2, 5, { cover: 'window' });
  // A man in each kancha's doorway, looking out over the plaza.
  K.kanchas.forEach((k, i) => {
    const sx = k.door === 'e' ? 1 : -1;
    g.place(i % 3 === 0 ? 'at' : 'rifleman', V(k.cx + sx * (k.w / 2 + 0.6), 1.0, k.cz), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 3, { cover: 'arcade' });
  });
  // And at the doors of the houses that stand on their own, in the open.
  K.houses.slice(-LONE.length).forEach((h) => {
    const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[h.door];
    const x = h.cx + d[0] * (h.w / 2 + 0.8), z = h.cz + d[1] * (h.d / 2 + 0.8);
    g.place('rifleman', V(x, 1.0, z), Math.atan2(d[0], d[1]), 4, { cover: 'arcade' });
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
  const E = T.enclosure;
  g.place('rifleman', V(E.cx, 1.0, E.cz + E.d / 2 - 1.0), 0, 6, { cover: 'arcade' });
  g.place('rifleman', V(-T.r - 0.8, T.rockTop + 1.0, 0), -Math.PI / 2, 6, { cover: 'roof' });
}
