import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Great Wall at Badaling.
 *
 * Reference figures (Badaling Great Wall Administration; the Ming wall as
 * rebuilt 1505–1582 and restored 1957):
 *   the wall     7.8 m high on average, 6.5 m wide at the foot and 5.8 at the
 *                top; a core of rammed earth and rubble between two leaves
 *                of dressed granite, grey brick above, a paved walk on top
 *                with a crenellated parapet on the outer side and a lower
 *                one on the inner; it follows the crest and steps with it
 *   the towers   two-storey watchtowers about 10 x 10 m and 12 m tall every
 *                hundred to two hundred metres: a vaulted room the walk runs
 *                through, with arrow loops, under an open platform with
 *                battlements
 *   the ridge    the bake cuts it north-south through the origin at 800 m,
 *                the crest level for 370 m and then falling sixty metres at
 *                the north end and thirty-five at the south, both within the
 *                wall's length
 *
 * A fortress on a ridge. The wall is a retaining wall full of rubble and
 * does not topple — cut it and the cut is a notch in a dyke — and the wall
 * is most of the mass, which is why it does not score. The towers do. They
 * are hollow, square and twice as tall as they are wide once the base under
 * them is exposed on the slope, and a tower undercut on its downhill side
 * goes over down the hill. The wall between them is cover for the garrison
 * and the way from one to the next.
 */

// Twice life. The wall is under eight metres high; from the camera distance
// this game plays at a wall that size is a kerb along the ridge.
const S = 2.0;

// Real metres, scaled once at the end.
const H = 7.8;                                   // the walk over the ground under the wall
const WIDTH = 6.0;                               // over the leaves at the top
const LEAF = 1.3;                                // the granite facing
const PARAPET = { outer: 0.9, merlon: 0.9, merlonL: 1.5, gap: 0.8, inner: 1.0, t: 0.5 };
const PIECE = 8.0;                               // the wall is laid in level pieces this long
const RUN = { z0: -122.5, z1: 127.5 };           // 500 m of wall, world -245..255
const TOWER = { w: 11.0, wall: 2.2, roomWall: 1.6, roomH: 2.6, corbel: 3, parapet: 1.2 };
const TOWERS_Z = [-111.0, -55.5, 0.0, 55.5, 111.0];

/**
 * The crest under the wall, sampled from the bake: world z along the ridge
 * against world metres below the summit, the lowest point across the wall's
 * own width at each station. Between stations it is linear. This is what the
 * wall steps down with, and what its foundations are dug to.
 */
const CREST = [
  [-270, -60], [-260, -60], [-250, -60], [-240, -60], [-230, -58], [-220, -51], [-210, -41],
  [-200, -34], [-190, -23], [-180, -13], [-170, -6], [-160, 0], [210, 0], [220, -5], [230, -10],
  [240, -17], [250, -22], [260, -30], [270, -35],
];
/** Ground under real z, in real metres below the summit. */
function groundAt(zReal) {
  const z = zReal * S;
  if (z <= CREST[0][0]) return CREST[0][1] / S;
  for (let i = 0; i + 1 < CREST.length; i++) {
    const [za, ya] = CREST[i], [zb, yb] = CREST[i + 1];
    if (z >= za && z <= zb) return (ya + (yb - ya) * ((z - za) / (zb - za))) / S;
  }
  return CREST[CREST.length - 1][1] / S;
}
/** The lowest and highest ground over a stretch of the crest. */
function groundOver(z0, z1) {
  let lo = Infinity, hi = -Infinity;
  for (let z = z0; z <= z1 + 0.01; z += 1.0) { const g = groundAt(z); lo = Math.min(lo, g); hi = Math.max(hi, g); }
  return { lo, hi };
}

/** The pieces of wall between the towers, each level, with its own top and footing. */
const PIECES = [];
{
  const inTower = (z) => TOWERS_Z.some((t) => Math.abs(z - t) < TOWER.w / 2 - 0.01);
  for (let z = RUN.z0; z < RUN.z1 - 0.01; z += PIECE) {
    let a = z, b = Math.min(z + PIECE, RUN.z1);
    // Clip to the tower faces.
    for (const t of TOWERS_Z) {
      const f0 = t - TOWER.w / 2, f1 = t + TOWER.w / 2;
      if (a < f1 && b > f0) { if (a < f0) b = Math.min(b, f0); else a = Math.max(a, f1); }
    }
    if (b - a < 1.0 || inTower((a + b) / 2)) continue;
    const g = groundOver(a, b);
    PIECES.push({ z0: a, z1: b, top: g.hi + H, rough: g.lo - 2.0, found: g.lo - 6.0 });
  }
}
/** The towers: where the walk enters each one, and where its footing is. */
const TOWERS = TOWERS_Z.map((z) => {
  const g = groundOver(z - TOWER.w / 2, z + TOWER.w / 2);
  const walk = g.hi + H;
  const roof = walk + TOWER.roomH + TOWER.corbel * 0.9 + 0.9;
  return { z, walk, roof, rough: g.lo - 2.0, found: g.lo - 6.0 };
});

/** The height of the walk over real z, from the pieces. */
function walkAt(zReal) {
  for (const p of PIECES) if (zReal >= p.z0 && zReal <= p.z1) return p.top;
  for (const t of TOWERS) if (Math.abs(zReal - t.z) <= TOWER.w / 2) return t.walk;
  return groundAt(zReal) + H;
}

/** What the garrison, the flag and the level record read; world metres. */
export const GREATWALL = {
  scale: S,
  width: WIDTH * S,
  run: { z0: RUN.z0 * S, z1: RUN.z1 * S },
  towers: TOWERS.map((t) => ({ z: t.z * S, walk: t.walk * S, roof: t.roof * S, w: TOWER.w * S })),
  /** The walk's height at world z, and where the merlons stand. */
  walkAt: (zWorld) => walkAt(zWorld / S) * S,
  parapetOuterX: -(WIDTH / 2 - PARAPET.t / 2) * S,
  flag: { x: 0, y: (TOWERS[2].roof + TOWER.parapet + 1.0) * S, z: 0 },
};

const courses = (y0, y1, nominal, fn) => {
  const n = Math.max(1, Math.round((y1 - y0) / nominal));
  const ch = (y1 - y0) / n;
  for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c, n);
};

export function buildGreatwall(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3);
  const stone = 1.4 * s, course = 0.9 * s;
  const core = stone * 2.4;
  const rough = stone * 3.2, roughCourse = course * 3.0;
  // Grey granite and grey brick. CONCRETE is the grey the granite is; the
  // brick of the parapets is the blue-grey the Ming kilns made, and SLATE
  // carries only itself, which is all a parapet does.
  const GRANITE = M.CONCRETE, BRICKWORK = M.SLATE;

  /** The courses of one piece, coarse below its own `rough` and dressed above. */
  const bands = (p, fn) => {
    courses(p.found, p.rough, roughCourse, (y, h, c, n) => fn(y, h, c, false, rough, false));
    courses(p.rough, p.top, course, (y, h, c, n) => fn(y, h, c, c === n - 1, stone, true));
  };

  // ── The wall, piece by piece: the two leaves as a bonded ring, the fill
  // inside them, coarse and bare where it is buried, dressed above the
  // lowest ground the piece stands on, and the walk paved on top. One pass
  // per section, because `section` keeps one range per name.
  B.section('wall', () => {
    for (const p of PIECES) {
      const len = p.z1 - p.z0, cz = (p.z0 + p.z1) / 2;
      bands(p, (y, h, c, last, st) => {
        B.ring(0, cz, WIDTH, len, LEAF, y, h, st, GRANITE, c % 2);
        if (last) B.slab(0, y + h / 2, cz, WIDTH - LEAF * 2, h, len - LEAF * 2, stone, GRANITE);
      });
    }
  });
  B.section('fill', () => {
    for (const p of PIECES) {
      const len = p.z1 - p.z0, cz = (p.z0 + p.z1) / 2;
      bands(p, (y, h, c, last, st, fine) => {
        if (last) return;
        B.slab(0, y + h / 2, cz, WIDTH - LEAF * 2, h, len - LEAF * 2, fine ? core : rough, M.RUBBLE);
      });
    }
  });

  // ── The parapets: crenellated on the outer side, a low wall on the inner.
  B.section('parapets', () => {
    const xo = -(WIDTH / 2 - PARAPET.t / 2), xi = WIDTH / 2 - PARAPET.t / 2;
    for (const p of PIECES) {
      const len = p.z1 - p.z0, cz = (p.z0 + p.z1) / 2;
      B.slab(xo, p.top + PARAPET.outer / 2, cz, PARAPET.t, PARAPET.outer, len, stone, BRICKWORK);
      B.slab(xi, p.top + PARAPET.inner / 2, cz, PARAPET.t, PARAPET.inner, len, stone, BRICKWORK);
      // Merlons along the outer parapet.
      const pitch = PARAPET.merlonL + PARAPET.gap;
      for (let z = p.z0 + pitch / 2; z < p.z1 - PARAPET.merlonL / 2 + 0.01; z += pitch) {
        B.add(xo, p.top + PARAPET.outer + PARAPET.merlon / 2, z,
          B.shrink(PARAPET.t / 2), B.shrink(PARAPET.merlon / 2), B.shrink(PARAPET.merlonL / 2), BRICKWORK);
      }
    }
  });

  // ── The towers: a base from the rock to the walk, a vaulted room the walk
  // passes through, and a battlemented platform on top.
  B.section('towers', () => {
    const W = TOWER.w;
    for (const t of TOWERS) {
      // The base, coarse where buried.
      courses(t.found, t.rough, roughCourse, (y, h, c) => {
        B.ring(0, t.z, W, W, TOWER.wall, y, h, rough, GRANITE, c % 2);
        B.slab(0, y + h / 2, t.z, W - TOWER.wall * 2, h, W - TOWER.wall * 2, rough, M.RUBBLE);
      });
      courses(t.rough, t.walk, course, (y, h, c, n) => {
        B.ring(0, t.z, W, W, TOWER.wall, y, h, stone, GRANITE, c % 2);
        B.slab(0, y + h / 2, t.z, W - TOWER.wall * 2, h, W - TOWER.wall * 2, c === n - 1 ? stone : core, c === n - 1 ? GRANITE : M.RUBBLE);
      });
      // The room: doors where the walk comes in on both sides, arrow loops
      // outward, and a corbel vault closing over it.
      const door = (x, y, z) => y < t.walk + TOWER.roomH && Math.abs(x) < 1.0 && Math.abs(Math.abs(z - t.z) - (W / 2 - TOWER.roomWall / 2)) < TOWER.roomWall;
      const loop = (x, y, z) => y > t.walk + 1.2 && y < t.walk + 2.4 && Math.abs(Math.abs(x) - (W / 2 - TOWER.roomWall / 2)) < TOWER.roomWall
        && [-3.0, 0, 3.0].some((a) => Math.abs(z - t.z - a) < 0.45);
      B.openings((x, y, z) => door(x, y, z) || loop(x, y, z), () => {
        courses(t.walk, t.walk + TOWER.roomH, course, (y, h, c) => {
          B.ring(0, t.z, W, W, TOWER.roomWall, y, h, stone, GRANITE, c % 2);
        });
      });
      const vault0 = t.walk + TOWER.roomH;
      courses(vault0, vault0 + TOWER.corbel * 0.9, 0.9, (y, h, c, n) => {
        const wall = TOWER.roomWall + (W / 2 - TOWER.roomWall) * ((c + 1) / n) * 1.02;
        if (wall * 2.02 >= W) B.slab(0, y + h / 2, t.z, W, h, W, stone, GRANITE);
        else B.ring(0, t.z, W, W, wall, y, h, stone, GRANITE, c % 2);
      });
      // The platform and its battlements.
      B.slab(0, t.roof - 0.45, t.z, W, 0.9, W, stone, GRANITE);
      courses(t.roof, t.roof + TOWER.parapet, 0.6, (y, h, c) => {
        B.ring(0, t.z, W, W, PARAPET.t, y, h, stone * 0.8, BRICKWORK, c % 2);
      });
      const pitch = PARAPET.merlonL + PARAPET.gap;
      for (let a = -W / 2 + pitch / 2; a < W / 2 - PARAPET.merlonL / 2 + 0.01; a += pitch) {
        for (const [x, z] of [[a, -W / 2 + PARAPET.t / 2], [a, W / 2 - PARAPET.t / 2], [-W / 2 + PARAPET.t / 2, a], [W / 2 - PARAPET.t / 2, a]]) {
          const along = Math.abs(z - (W / 2 - PARAPET.t / 2)) < 0.01 || Math.abs(z + (W / 2 - PARAPET.t / 2)) < 0.01;
          B.add(x, t.roof + TOWER.parapet + PARAPET.merlon / 2, t.z + z,
            B.shrink(along ? PARAPET.merlonL / 2 : PARAPET.t / 2), B.shrink(PARAPET.merlon / 2),
            B.shrink(along ? PARAPET.t / 2 : PARAPET.merlonL / 2), BRICKWORK);
        }
      }
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison: on the tower platforms and in their loops, and along the
 * walk behind the merlons between them, facing out over the outer parapet.
 * Read from the constants above.
 */
export function populateGreatwall(g, origin, groundY) {
  const K = GREATWALL;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const OUT = -Math.PI / 2;                        // over the outer parapet, west
  // The towers: the platform holds the long guns and a mortar; the room a
  // machine gun at a loop each side.
  K.towers.forEach((t, i) => {
    const e = t.w / 2 - 2.2;
    g.place('sniper', V(-e, t.roof + 1.0, t.z - e), OUT, 6, { cover: 'roof' });
    g.place('sniper', V(-e, t.roof + 1.0, t.z + e), OUT, 6, { cover: 'roof' });
    g.place(i % 2 ? 'at' : 'mortar', V(e, t.roof + 1.0, t.z), i % 2 ? Math.PI / 2 : OUT, 6, { cover: 'roof' });
    g.place('mg', V(-(t.w / 2 - 2.6), t.walk + 1.0, t.z), OUT, 6, { cover: 'window' });
    g.place('mg', V(t.w / 2 - 2.6, t.walk + 1.0, t.z), Math.PI / 2, 6, { cover: 'window' });
  });
  // The walk: a rifleman every forty metres or so behind the outer parapet,
  // an AT team every third, and never in a tower's footprint.
  for (let z = K.run.z0 + 20; z < K.run.z1 - 10; z += 38) {
    if (K.towers.some((t) => Math.abs(z - t.z) < t.w / 2 + 3)) continue;
    const y = K.walkAt(z);
    const k = Math.round((z - K.run.z0) / 38);
    g.place(k % 3 === 0 ? 'at' : 'rifleman', V(K.parapetOuterX + 1.8, y + 1.0, z), OUT, 6, { cover: 'roof' });
  }
}
