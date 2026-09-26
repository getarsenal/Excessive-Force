import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Temple I and Temple II, on the Great Plaza at Tikal.
 *
 * Reference figures (the Tikal Project, University of Pennsylvania; Overture
 * has both outlines, `Templo del Gran Jaguar` 45 x 44 m at 45 m ESE of the
 * origin and `Templo de las Máscaras` 47 x 49 m at 89 m WSW — the outlines
 * take in the lowest aprons; the bodies are smaller):
 *   Temple I     47 m to the top of the roof comb; nine steep terraces on a
 *                base about 35 x 33 m to a summit platform 31 m up; the
 *                shrine on it about 12 x 7.5 with two narrow vaulted rooms
 *                and one door, west; the comb over the rear room, hollow,
 *                about 10 m wide, 3 m thick and 12 m tall
 *   Temple II    38 m; three broad terraces on a base about 38 m square to a
 *                platform at 25 m; its shrine and a broad, eroded comb; its
 *                stair faces east, at Temple I across the plaza
 *   the plaza    the two temples face each other about 115 m apart, centre
 *                to centre, over the Great Plaza
 *
 * A mountain with a comb on it. The pyramid is solid and cannot topple —
 * every terrace stands on a wider one — and nine tenths of the mass is that
 * pyramid, which is why the terraces do not score. What scores is what
 * stands on the summit: the stair, the shrine, and above all the comb. The
 * comb is the twist. It is a wall three metres thick, ten wide and twelve
 * tall, hollow, standing on the back of the shrine's roof a hundred metres
 * over the plaza: a cantilever on top of a mountain. Cut its base and the
 * whole comb goes over as one piece, and the shrine under it goes with it.
 */

// Two and two fifths life. Temple I is forty-seven metres tall and steep, and
// from the plaza distance the game plays at it needs to be a hundred and
// thirteen to read as the tallest thing the Maya ever built.
const S = 2.4;

/** Everything in real metres, scaled once at the end. */
const T1 = {
  base: { hx: 17.5, hz: 16.5 },     // half-widths at the foot, x east-west, z north-south
  top: { hx: 6.5, hz: 6.25 },       // half-widths of the summit platform
  height: 31.0,                     // to the summit platform
  terraces: 9,
  shrine: { x: 1.5, w: 7.5, d: 12.5, wall: 1.8, roomH: 2.8, h: 7.0, door: 1.0 },
  comb: { x: 2.2, w: 3.0, d: 10.5, wall: 0.9, h: 12.0, topW: 2.4, topD: 9.0 },
  stair: { dir: -1, w: 8.0, nose: 2.0 },   // up the west face
};
const T2 = {
  base: { hx: 19.0, hz: 19.0 },
  top: { hx: 8.5, hz: 8.5 },
  height: 25.0,
  terraces: 3,
  shrine: { x: -1.5, w: 8.5, d: 14.0, wall: 1.9, roomH: 2.8, h: 6.0, door: 1.0 },
  comb: { x: -2.0, w: 3.2, d: 12.0, wall: 0.9, h: 7.0, topW: 2.6, topD: 11.0 },
  stair: { dir: 1, w: 9.0, nose: 2.0 },    // up the east face, at Temple I
};
const SKIN = 1.4;                   // the dressed limestone skin, a stone thick
const MOULDING = 0.3;               // the projecting moulding at the head of every terrace


/**
 * A solid course of fill on a fixed lattice.
 *
 * `slab` divides whatever width it is given into equal stones, so a pyramid
 * whose courses each step in a little lays every course on a slightly
 * different pitch, and each stone straddles two below it. The solver shares
 * a stone's load equally between its supporters, and over twenty-six courses
 * that leak runs the weight of the whole hill into the two stones under its
 * centre — four hundred meganewtons onto a block rated for three hundred and
 * fifty, crushed on the first frame with nobody firing. Laid on one lattice,
 * every interior stone stands squarely on the one below it and carries its
 * own column and nothing else; only the closer at each edge, which carries
 * next to nothing, varies with the course.
 */
function latticeSlab(B, cx, cz, hx, hz, y, h, pitch, mat) {
  const cuts = (H) => {
    const m = Math.floor(H / pitch);
    const edges = [];
    for (let k = -m; k <= m; k++) edges.push(k * pitch);
    // A closer narrower than a third of a stone is folded into its neighbour.
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

/** Half-width of a terrace's face, terrace `i` of `n`, between the foot and the summit. */
const halfAt = (o, axis, i) => o.base[axis] - (o.base[axis] - o.top[axis]) * (i / o.terraces);

/** What the garrison, the flag and the level record read. */
const describe = (o) => {
  const th = o.height / o.terraces;
  return {
    scale: S,
    base: { hx: o.base.hx * S, hz: o.base.hz * S },
    height: o.height * S,
    /** Every terrace ledge, low to high: the face of the terrace above it, and its height. */
    ledges: Array.from({ length: o.terraces - 1 }, (_, i) => ({
      hx: halfAt(o, 'hx', i + 1) * S, hz: halfAt(o, 'hz', i + 1) * S, y: th * (i + 1) * S,
    })),
    platform: { hx: halfAt(o, 'hx', o.terraces - 1) * S, hz: halfAt(o, 'hz', o.terraces - 1) * S, y: o.height * S },
    shrine: { x: o.shrine.x * S, w: o.shrine.w * S, d: o.shrine.d * S, roof: (o.height + o.shrine.h) * S, roomH: o.shrine.roomH * S },
    comb: { x: o.comb.x * S, top: (o.height + o.shrine.h + o.comb.h) * S },
    stair: { dir: o.stair.dir, w: o.stair.w * S },
    flag: { x: o.comb.x * S, y: (o.height + o.shrine.h + o.comb.h + 1.0) * S, z: 0 },
  };
};
export const TIKAL = describe(T1);
export const TEMPLE_II = describe(T2);

/**
 * One temple: the terraced pyramid, its stair, the shrine and the comb.
 *
 * The pyramid is laid in solid courses — a skin ring of dressed stone with a
 * slab of fill inside it, the slab's edge exactly on the ring's inner face —
 * because a casing ring landing inboard of the ring below bears on fill and
 * starts the level detached. Each terrace leans in a little over its height
 * and finishes in a course laid proud, which is the moulding that makes a
 * Maya terrace read as a terrace at two hundred metres rather than a slope.
 */
function temple(B, o, stone, course) {
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c, n);
  };
  const th = o.height / o.terraces;
  const core = stone * 1.8;

  // ── The terraces.
  B.section('terraces', () => {
    for (let i = 0; i < o.terraces; i++) {
      courses(i * th, (i + 1) * th, course, (y, h, c, n) => {
        const lean = 0.12 * c;
        const hx = halfAt(o, 'hx', i) - lean, hz = halfAt(o, 'hz', i) - lean;
        const head = c === n - 1;
        B.ring(0, 0, hx * 2, hz * 2, SKIN, y, h, stone, M.LIMESTONE, c % 2,
          head ? () => MOULDING : null);
        latticeSlab(B, 0, 0, hx - SKIN, hz - SKIN, y, h, core, M.RUBBLE);
      });
    }
  });

  // ── The stair, up one face, from the plaza to the shrine door.
  //
  // A wedge of masonry standing against the terraces with its steps in its
  // top: each course reaches from the face of the terrace out to the nose,
  // so it stands on the course below it and on the ledge where the terrace
  // steps back.
  B.section('stair', () => {
    const d = o.stair.dir;
    for (let i = 0; i < o.terraces; i++) {
      courses(i * th, (i + 1) * th, course, (y, h, c) => {
        const face = halfAt(o, 'hx', i) - 0.12 * c + MOULDING * 0.5;
        const nose = o.stair.nose;
        B.slab(d * (face + 0.02 + nose / 2), y + h / 2, 0, nose, h, o.stair.w, stone, M.LIMESTONE);
      });
    }
    // Low ramps either side of the steps, one course tall, standing on the
    // step below them.
    for (let i = 0; i < o.terraces; i++) {
      courses(i * th, (i + 1) * th, course, (y, h, c) => {
        const face = halfAt(o, 'hx', i) - 0.12 * c + MOULDING * 0.5;
        for (const sz of [-1, 1]) {
          B.slab(d * (face + 0.02 + o.stair.nose / 2), y + h + 0.3, sz * (o.stair.w / 2 - 0.5), o.stair.nose, 0.6, 1.0, stone, M.LIMESTONE);
        }
      });
    }
  });

  // ── The shrine: two narrow rooms under a corbelled vault, one door facing
  // the stair, thick walls, a solid roof.
  const sh = o.shrine;
  const y0 = o.height, roofY = y0 + sh.h;
  const front = o.stair.dir;                       // which face the door is in
  const xa = sh.x + front * (sh.w / 2 - sh.wall) - front * 0.2;
  const xb = sh.x + front * sh.w / 2 + front * 0.2;
  const xLo = Math.min(xa, xb), xHi = Math.max(xa, xb);
  const inDoor = (x, y, z) => y < y0 + sh.roomH && Math.abs(z) < sh.door && x > xLo && x < xHi;
  const lintelY = y0 + sh.roomH, lintelH = course * 0.9;
  const inLintel = (x, y, z) => y > lintelY - 0.05 && y < lintelY + lintelH + 0.05
    && Math.abs(z) < sh.door + 0.9 && x > xLo && x < xHi;
  B.section('shrine', () => {
    B.openings((x, y, z) => inDoor(x, y, z) || inLintel(x, y, z), () => {
      courses(y0, roofY, course, (y, h, c) => {
        // The vault: above the room height the walls thicken inward course by
        // course until they meet, which is what a Maya corbel vault is and the
        // only roof that carries itself over a room.
        const over = Math.max(0, (y + h / 2 - (y0 + sh.roomH)) / (sh.h - sh.roomH));
        const wall = sh.wall + over * (sh.w / 2 - sh.wall) * 1.05;
        if (wall * 2.05 >= sh.w) {
          B.slab(sh.x, y + h / 2, 0, sh.w, h, sh.d, stone, M.LIMESTONE);
        } else {
          B.ring(sh.x, 0, sh.w, sh.d, wall, y, h, stone, M.LIMESTONE, c % 2);
          // The cross wall between the two rooms.
          B.slab(sh.x, y + h / 2, 0, Math.max(0.8, wall * 0.5), h, sh.d - wall * 2, stone, M.LIMESTONE);
        }
      });
    });
    // The lintel over the door: one stone across the whole opening.
    B.add((xLo + xHi) / 2, lintelY + lintelH / 2, 0,
      (xHi - xLo) / 2 - 0.05, lintelH / 2 - 0.02, sh.door + 0.85, M.LIMESTONE);
    // The roof: one solid course over the closed vault.
    B.slab(sh.x, roofY + course * 0.4, 0, sh.w + 0.4, course * 0.8, sh.d + 0.4, stone, M.LIMESTONE);
  });

  // ── The comb: hollow, thin, tall, and standing on the back of the roof.
  B.section('comb', () => {
    const cb = o.comb;
    const base = roofY + course * 0.8;
    courses(base, base + cb.h, course, (y, h, c) => {
      const t = (y + h / 2 - base) / cb.h;
      const w = cb.w + (cb.topW - cb.w) * t, d = cb.d + (cb.topD - cb.d) * t;
      if (w <= cb.wall * 2.1) B.slab(cb.x, y + h / 2, 0, w, h, d, stone, M.LIMESTONE);
      else B.ring(cb.x, 0, w, d, cb.wall, y, h, stone, M.LIMESTONE, c % 2);
    });
  });
}

/** The stone for a tier: a 1.4 m dressed block at the coarsest tier, a metre at the finest. */
function grain(quality) {
  const s = Math.min(quality.blockScale, 1.3);
  return { stone: (2.6 * s) / S, course: (2.2 * s) / S };
}

export function buildTikal(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const { stone, course } = grain(quality);
  temple(B, T1, stone, course);
  B.scaleAll(S);
  return B;
}

export function buildTempleII(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const { stone, course } = grain(quality);
  temple(B, T2, stone, course);
  B.scaleAll(S);
  return B;
}

/**
 * The garrison of a temple: on the terrace ledges facing the plaza, on the
 * stair ramps, in the shrine door and on its roof beside the comb. Every
 * position is read from the constants above.
 */
function populateTemple(g, K, origin, groundY, opts) {
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const d = K.stair.dir;
  const front = d > 0 ? Math.PI / 2 : -Math.PI / 2;
  // The ledges: a man every other terrace at each corner, and two on the
  // front face either side of the stair.
  K.ledges.forEach((L, i) => {
    if (i % 2 !== (opts.odd ? 1 : 0)) return;
    const type = i < 3 ? 'rifleman' : (i < 6 ? 'mg' : 'sniper');
    for (const sz of [-1, 1]) {
      g.place(type, V(d * (L.hx + 1.0), L.y + 1.0, sz * (K.stair.w / 2 + 3.5)), front, 6, { cover: 'roof' });
      g.place(i % 4 === 0 ? 'at' : 'rifleman', V(-d * (L.hx + 1.0), L.y + 1.0, sz * (L.hz * 0.6)), -front, 6, { cover: 'roof' });
    }
  });
  // The door, and the roof beside the comb.
  g.place('mg', V(K.shrine.x + d * (K.shrine.w / 2 - 1.0), K.platform.y + 0.6, 0), front, 6, { cover: 'arcade' });
  for (const sz of [-1, 1]) {
    g.place('sniper', V(K.shrine.x - d * 1.0, K.shrine.roof + 1.2, sz * (K.shrine.d / 2 - 2.0)), front, 6, { cover: 'roof' });
  }
  if (opts.mortars) {
    for (const sz of [-1, 1]) {
      g.place('mortar', V(-d * (K.base.hx * 0.35), K.ledges[0].y + 1.0, sz * K.base.hz * 0.5), -front, 7, { cover: 'roof' });
    }
  }
}

export function populateTikal(g, origin, groundY) {
  populateTemple(g, TIKAL, origin, groundY, { odd: false, mortars: true });
}

export function populateTempleII(g, origin, groundY) {
  populateTemple(g, TEMPLE_II, origin, groundY, { odd: true, mortars: false });
}
