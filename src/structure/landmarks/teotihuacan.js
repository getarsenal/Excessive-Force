import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Pyramid of the Sun, Teotihuacan, and the Pyramid of the Moon at the
 * head of the Avenue of the Dead.
 *
 * Reference figures (INAH; Millon's Teotihuacan Mapping Project; Overture has
 * `Pirámide del Sol` as a 276 x 273 m outline, which takes in the Adosada
 * and the platform round the foot):
 *   the Sun      223 x 224 m at the base, 65 m to the platform on top, in
 *                five bodies of talud-tablero — a sloped face under a short
 *                vertical panel — with a tread between each; the stair up
 *                the west face; the Adosada, a four-tier platform about 60 m
 *                wide and 20 m tall, built against the foot of the west face
 *                with the lower stair up its front; a small temple platform
 *                on the summit
 *   the cave     a natural lava tube under the pyramid, entered at the foot
 *                of the Adosada, running about a hundred metres east to a
 *                four-lobed chamber under the centre
 *   the Moon     about 150 x 130 m and 43 m tall, four bodies and its own
 *                Adosada facing south, 800 m north and 300 m west
 *
 * A mountain, Khufu's kind: a million cubic metres of rubble and earth in a
 * skin of red-plastered stone, and nothing about it can be made to fall.
 * It is quarried. What makes that a level rather than a chore is what the
 * archaeologists found in 1971: the cave. It is laid here as a real void
 * through the lowest body with the chamber under the centre, and along it,
 * walled into the fill, are the demolition charges — soft enough that the
 * round which reaches one sets it off, and the reward for digging in from
 * the west where the tunnel mouth is rather than shelling the skin off
 * everywhere at once.
 */

// Life size. The base is two hundred and twenty-four metres across; the
// pyramid is already the biggest thing on any map but Giza and needs no help.
const S = 1.0;

/**
 * The five bodies of the Sun, real metres: each body rises `h` on a talud
 * that steps in `talud` over that height, then the next body starts `tread`
 * further in. The top course of a body is laid vertical and proud, which is
 * the tablero.
 */
const SUN = {
  base: 112.0,                               // half-width at the foot
  bodies: [
    { h: 16.0, talud: 13.6, tread: 8.0 },
    { h: 14.0, talud: 11.9, tread: 8.0 },
    { h: 12.0, talud: 10.2, tread: 8.0 },
    { h: 11.0, talud: 9.4, tread: 8.0 },
    { h: 12.0, talud: 10.2, tread: 0.0 },
  ],
  skin: 3.2,
  tablero: 0.6,
  stair: { w: 12.0, nose: 2.5 },
  temple: { w: 14.0, h: 4.0, wall: 2.0 },
};
const ADOSADA = {
  width: 60.0,                               // north-south
  out: 28.0,                                 // how far west of the pyramid's foot it reaches
  bodies: [{ h: 5.0, inset: 5.0 }, { h: 5.0, inset: 4.5 }, { h: 4.0, inset: 4.0 }, { h: 4.0, inset: 3.5 }],
};
const CAVE = {
  y0: 0.9, y1: 5.1,                          // the void's height band
  halfW: 1.6,                                // half-width of the tube
  x0: -112.0, x1: 10.0,                      // from the west foot to under the centre
  chamber: { r: 7.0, y1: 7.6 },              // the four-lobed chamber under the centre
};
const MOON = {
  base: 75.0,                                // half-width, east-west; north-south is `aspect` of it
  aspect: 65.0 / 75.0,
  bodies: [
    { h: 12.0, talud: 10.0, tread: 6.0 },
    { h: 11.0, talud: 9.0, tread: 6.0 },
    { h: 10.0, talud: 8.5, tread: 6.0 },
    { h: 10.0, talud: 8.5, tread: 0.0 },
  ],
  skin: 3.6,
  tablero: 0.6,
  adosada: { width: 40.0, out: 20.0, h: 12.0 },
  offset: { x: -300, z: -780 },
};

/** The body profile: each body's foot, its talud, and where the treads and the summit are. */
function profileOf(P) {
  const tops = [];
  let y = 0, half = P.base;
  const bodies = P.bodies.map((b) => {
    const o = { y0: y, y1: y + b.h, half0: half, talud: b.talud };
    y += b.h;
    tops.push({ y: o.y1, half: half - b.talud });
    half = half - b.talud - b.tread;
    return o;
  });
  return { bodies, tops, height: y, topHalf: tops[tops.length - 1].half };
}
const SUN_P = profileOf(SUN);
const MOON_P = profileOf(MOON);

/** What the garrison, the flag and the level record read. */
export const TEOTIHUACAN = {
  scale: S,
  base: SUN.base * 2 * S,
  height: SUN_P.height * S,
  /** The treads, low to high: the half-width of the tread's outer edge and its height. Not the summit. */
  treads: SUN_P.tops.slice(0, -1).map((t) => ({ half: t.half * S, y: t.y * S })),
  summit: { half: SUN_P.topHalf * S, y: SUN_P.height * S },
  adosada: { width: ADOSADA.width * S, out: ADOSADA.out * S, top: ADOSADA.bodies.reduce((a, b) => a + b.h, 0) * S },
  stairW: SUN.stair.w * S,
  temple: { w: SUN.temple.w * S, h: SUN.temple.h * S },
  moon: MOON.offset,
  flag: { x: 0, y: (SUN_P.height + SUN.temple.h + 1.0) * S, z: 0 },
};

/**
 * A solid course of fill on a fixed lattice, so every interior stone stands
 * squarely on the one below it and the hill's weight runs down in columns
 * instead of leaking course by course into the two stones under the centre.
 */
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

const courses = (y0, y1, nominal, fn) => {
  const n = Math.max(1, Math.round((y1 - y0) / nominal));
  const ch = (y1 - y0) / n;
  for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c, n);
};

/** Half-width of a body's face at height `y`. */
const faceAt = (prof, y) => {
  const b = prof.bodies.find((o) => y >= o.y0 && y < o.y1) || prof.bodies[prof.bodies.length - 1];
  return b.half0 - b.talud * Math.min(1, Math.max(0, (y - b.y0) / (b.y1 - b.y0)));
};

/**
 * A talud-tablero pyramid in solid courses: the sloped skin of dressed stone
 * with the fill laid inside it on the lattice, every course a slab of stones
 * on the wider slab beneath, the casing the outermost stones of each. The
 * top course of every body stands vertical and proud: the tablero.
 *
 * Two passes, one per section, because `section` keeps one range per name.
 */
function pyramid(B, P, prof, o) {
  const { stone, course, core, skin, skinMat, coreMat, aspect = 1 } = o;
  const each = (fn) => {
    for (const b of prof.bodies) {
      courses(b.y0, b.y1, course, (y, h, c, n) => {
        const head = c === n - 1;
        const t = head ? 1 : (y + h / 2 - b.y0) / (b.y1 - b.y0);
        const half = b.half0 - b.talud * t;
        fn(y, h, c, half, half * aspect, head);
      });
    }
  };
  B.section(o.tag.facing, () => each((y, h, c, hx, hz, head) => {
    B.ring(0, 0, hx * 2, hz * 2, skin, y, h, stone, skinMat, c % 2, head ? () => P.tablero : null);
  }));
  B.section(o.tag.core, () => each((y, h, c, hx, hz) => {
    latticeSlab(B, 0, 0, hx - skin, hz - skin, y, h, core, coreMat);
  }));
}

export function buildTeotihuacan(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  // REDSTONE for the skin, not SANDSTONE: the volcanic stone was plastered
  // red once and is red-brown now, and Agra's sandstone came out of the
  // grade as a traffic cone two hundred metres across — the same lesson the
  // Palace of Westminster taught, in the material that was made for it.
  //
  // Khufu's cap, for Khufu's reason: on the coarsest tier the fill is a
  // five and three quarter metre block of rubble — a quarter the toughness
  // of dressed stone, so a round still takes one out — and the skin is a
  // four and a half metre stone of sandstone, three deep, which is about the
  // most a 155 mm shell will bite.
  const s = Math.min(quality.blockScale, 1.25);
  const core = 4.6 * s;
  const stone = 3.6 * s;
  const course = 2.4 * s;
  const P = SUN_P;

  // ── The cave, and the charges along it.
  //
  // Both are cut out of the fill before it is laid, because a block added
  // inside a solid course shares its volume with the stone round it, and the
  // physics answers an overlap by shoving.
  const CH = Math.max(1.6, core * 0.45);
  const charges = [];
  for (let i = 0; i < 5; i++) {
    const x = CAVE.x0 + 14 + i * 22;
    charges.push({ x, y: (CAVE.y0 + CAVE.y1) / 2, z: (i % 2 ? 1 : -1) * (CAVE.halfW + CH + 1.2) });
  }
  charges.push({ x: CAVE.x1 + CAVE.chamber.r + CH + 1.0, y: 3.4, z: 0 });
  charges.push({ x: CAVE.x1, y: CAVE.chamber.y1 + CH + 0.8, z: 0 });
  const inCave = (x, y, z) => {
    if (y > CAVE.y0 && y < CAVE.y1 && Math.abs(z) < CAVE.halfW && x > CAVE.x0 - 1 && x < CAVE.x1) return true;
    // The four-lobed chamber.
    if (y > CAVE.y0 && y < CAVE.chamber.y1) {
      const dx = x - CAVE.x1, r = CAVE.chamber.r;
      if (Math.hypot(dx, z) < r) return true;
      for (const [lx, lz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.hypot(dx - lx, z - lz) < r * 0.55) return true;
    }
    for (const c of charges) {
      if (Math.abs(x - c.x) < CH + 0.4 && Math.abs(y - c.y) < CH + 0.4 && Math.abs(z - c.z) < CH + 0.4) return true;
    }
    return false;
  };

  B.openings(inCave, () => {
    pyramid(B, SUN, P, {
      stone, course, core, skin: SUN.skin, skinMat: M.REDSTONE, coreMat: M.RUBBLE,
      tag: { facing: 'facing', core: 'core' },
    });
  });

  B.section('tunnel', () => {
    for (const c of charges) B.add(c.x, c.y, c.z, CH, CH, CH, M.CHARGE);
  });

  // ── The Adosada, against the foot of the west face: four bodies stepping
  // in, each course reaching from the talud out to its own front.
  B.section('adosada', () => {
    let y = 0, inset = 0;
    for (const a of ADOSADA.bodies) {
      courses(y, y + a.h, course, (yy, h, c, n) => {
        const t = c === n - 1 ? 1 : (yy + h / 2 - y) / a.h;
        const front = SUN.base + ADOSADA.out - inset - a.inset * t;
        const halfZ = ADOSADA.width / 2 - inset - a.inset * t;
        const face = faceAt(P, yy + h / 2) + 0.05;
        const depth = front - face;
        if (depth < 1) return;
        B.slab(-(face + depth / 2), yy + h / 2, 0, depth, h, halfZ * 2, stone, M.REDSTONE);
      });
      y += a.h; inset += a.inset;
    }
  });

  // ── The stairs: up the Adosada's front, then up the west face to the summit.
  B.section('stair', () => {
    const adTop = ADOSADA.bodies.reduce((a, b) => a + b.h, 0);
    let y = 0, inset = 0;
    for (const a of ADOSADA.bodies) {
      courses(y, y + a.h, course, (yy, h, c, n) => {
        const t = c === n - 1 ? 1 : (yy + h / 2 - y) / a.h;
        const front = SUN.base + ADOSADA.out - inset - a.inset * t + 0.05;
        B.slab(-(front + SUN.stair.nose / 2), yy + h / 2, 0, SUN.stair.nose, h, SUN.stair.w, stone, M.REDSTONE);
      });
      y += a.h; inset += a.inset;
    }
    for (const b of P.bodies) {
      if (b.y1 <= adTop) continue;
      courses(Math.max(adTop, b.y0), b.y1, course, (yy, h) => {
        const face = faceAt(P, yy + h / 2) + 0.05;
        B.slab(-(face + SUN.stair.nose / 2), yy + h / 2, 0, SUN.stair.nose, h, SUN.stair.w, stone, M.REDSTONE);
      });
    }
  });

  // ── The temple platform on the summit.
  B.section('temple', () => {
    const T = SUN.temple;
    courses(P.height, P.height + T.h, course * 0.8, (y, h, c) => {
      B.ring(0, 0, T.w, T.w, T.wall, y, h, stone * 0.7, M.REDSTONE, c % 2);
    });
  });

  B.scaleAll(S);
  return B;
}

/** The Pyramid of the Moon: coarse, scenery, on its own pad at the head of the avenue. */
export function buildMoon(quality) {
  const B = new BlockList();
  const s = Math.min(quality.blockScale, 1.25);
  const core = 6.5 * s, stone = 5.0 * s, course = 3.0 * s;
  const P = MOON_P;
  pyramid(B, MOON, P, {
    stone, course, core, skin: MOON.skin, skinMat: M.REDSTONE, coreMat: M.RUBBLE,
    aspect: MOON.aspect,
    tag: { facing: 'moon', core: 'moonfill' },
  });
  // Its Adosada, on the south face.
  B.section('moonado', () => {
    const A = MOON.adosada;
    courses(0, A.h, course, (y, h) => {
      const t = (y + h / 2) / A.h;
      const face = faceAt(P, y + h / 2) * MOON.aspect + 0.05;
      const front = face + A.out * (1 - t * 0.6);
      B.slab(0, y + h / 2, (face + front) / 2, A.width * (1 - t * 0.3), h, front - face, stone, M.REDSTONE);
    });
  });
  return B;
}

/**
 * The garrison: on the treads between the bodies, on the Adosada, and on the
 * summit round the temple. Read from the constants above.
 */
export function populateTeotihuacan(g, origin, groundY) {
  const K = TEOTIHUACAN;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  // The treads: a man at the middle of each side and at each corner of the
  // lower two, riflemen low, MGs and AT in the middle, snipers high.
  K.treads.forEach((t, i) => {
    const r = t.half - 3.0;
    const type = i === 0 ? 'rifleman' : i === 1 ? 'mg' : i === 2 ? 'at' : 'sniper';
    const spots = [[r, 0], [-r, 0], [0, r], [0, -r]];
    if (i < 2) spots.push([r, r], [-r, r], [r, -r], [-r, -r]);
    for (const [x, z] of spots) {
      if (x < 0 && Math.abs(z) < K.stairW / 2 + 2) continue;      // not on the stair
      g.place(type, V(x, t.y + 1.0, z), Math.atan2(x, z), 7, { cover: 'roof' });
    }
  });
  // The Adosada's top, facing west down the avenue.
  for (let i = 0; i < 4; i++) {
    const z = (i - 1.5) * (K.adosada.width / 5);
    if (Math.abs(z) < K.stairW / 2 + 2) continue;
    g.place(i % 2 ? 'rifleman' : 'mg', V(-(K.base / 2 + K.adosada.out - 6), K.adosada.top + 1.0, z), -Math.PI / 2, 7, { cover: 'roof' });
  }
  // The summit: mortars behind the temple, snipers at the edge.
  for (const [x, z] of [[K.temple.w * 0.9, 0], [-K.temple.w * 0.9, 0], [0, K.temple.w * 0.9]]) {
    g.place('mortar', V(x, K.summit.y + 1.0, z), Math.atan2(x, z), 7, { cover: 'roof' });
  }
  const e = K.summit.half - 3;
  for (const [x, z] of [[e, e], [-e, e], [e, -e], [-e, -e]]) {
    g.place('sniper', V(x, K.summit.y + 1.0, z), Math.atan2(x, z), 7, { cover: 'roof' });
  }
}
