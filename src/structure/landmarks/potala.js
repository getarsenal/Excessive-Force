import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Potala Palace, on Marpo Ri.
 *
 * Reference figures (Tibet Autonomous Region cultural relics bureau; Larsen &
 * Sinding-Larsen, "The Lhasa Atlas"):
 *   the hill              Marpo Ri, about 130 m of red rock over the valley
 *   the palace            ~360 m east to west, ~110 m of building over the
 *                         terraces, thirteen storeys
 *   walls                 rammed earth and stone, 3 to 5 m thick, battered
 *                         inward about one in ten, with copper poured into
 *                         the foundations against earthquakes
 *   the White Palace      the outer, lime-washed wings: living quarters
 *   the Red Palace        the central block: the assembly halls, the chapels
 *                         and the eight golden tombs of the Dalai Lamas
 *
 * It is a mountain, not a tower. Nothing about it topples — the walls lean
 * into their own mass, every one of them is thicker at the foot than a tank is
 * long, and the whole thing is bonded to a rock outcrop. It has to be quarried
 * out, and that is the level: the longest, hardest contract in the campaign.
 *
 * The twist is that the white is not the building. The White Palace is a
 * curtain of living quarters wrapped round three sides of the thing that
 * matters, and a player who flattens the wings has spent an hour on the
 * scenery. The Red Palace in the middle and the golden roofs on it are the
 * contract; `scoreTags` says so, and the bar does not move for the wings.
 */

// Fifteen per cent above life size. The real palace is already vast — at
// this scale it is four hundred and sixty metres end to end, which makes it
// the widest thing in the campaign by a factor of two — and it goes up rather
// than down because the whole level is one hill and the camera stands a long
// way back from it. It does not go up further than this: the game levels a
// pad under the whole footprint of a structure, and a palace much wider than
// this cuts the summit of Marpo Ri off square and eats the first firing shelf
// with it.
const S = 1.15;
const STONE_FINENESS = 2.15;

// Real metres, scaled once at the end.
const TERRACE = { w: 400.0, d: 172.0, h: 34.0, batter: 0.085 };
const WHITE = { w: 112.0, d: 92.0, h: 62.0, batter: 0.075, off: 122.0 };
const RED = { w: 126.0, d: 106.0, h: 88.0, batter: 0.07 };
const WALL = 5.2;                 // the thickness of a palace wall at its head
const PARAPET = 4.0;              // the dark kyema frieze every roofline carries
const DECK = 3.2;                 // the terrace walk round the palace
// The lower terrace step, which is as much of the hill's fortification as
// fits on the summit. The Potala's real outer wall is at the foot of Marpo
// Ri, a hundred and thirty metres below and six hundred metres across, and
// there is no summit in the world that would hold it.
const OUTER = { w: 436.0, d: 212.0, h: 12.0 };

/**
 * The three blocks of the palace, west to east, laid on the terrace deck.
 *
 * They are listed once and read three times: the builder raises them, the
 * terrace lays a wall under each of their footprints so that the palace
 * stands on masonry rather than on a plate, and the deck is cut where they
 * come through it. The east wing's inner face is half a metre clear of the
 * Red Palace's; they read as one building from the valley and they are three
 * structures, which is the trick of the level.
 */
const BLOCKS = [
  { cx: -WHITE.off, cz: 6.0, w: WHITE.w, d: WHITE.d, h: WHITE.h,
    batter: WHITE.batter, mat: 'MARBLE', tag: 'white-east' },
  { cx: 0.0, cz: -6.0, w: RED.w, d: RED.d, h: RED.h,
    batter: RED.batter, mat: 'MADDER', tag: 'red' },
  { cx: WHITE.off, cz: 6.0, w: WHITE.w * 0.92, d: WHITE.d, h: WHITE.h * 0.94,
    batter: WHITE.batter, mat: 'MARBLE', tag: 'white-west' },
];

/** Where a battered wall's face is at height `y` of a block `h` tall. */
const taper = (w, y, h, batter) => w * (1 - batter * (y / h));

/** What the garrison, the flag and the level record read. */
export const POTALA = {
  scale: S,
  terrace: { w: TERRACE.w * S, d: TERRACE.d * S, h: TERRACE.h * S },
  red: { w: RED.w * S, d: RED.d * S, h: RED.h * S, top: (TERRACE.h + RED.h) * S },
  white: { w: WHITE.w * S, d: WHITE.d * S, h: WHITE.h * S, off: WHITE.off * S,
    top: (TERRACE.h + WHITE.h) * S },
  outer: { w: OUTER.w * S, d: OUTER.d * S, h: OUTER.h * S },
  /** The roofline courses a man can be posted on, low to high. */
  galleries: [TERRACE.h * S, (TERRACE.h + WHITE.h * 0.55) * S, (TERRACE.h + WHITE.h) * S],
  /** On the Red Palace roof, between the two middle pavilions. */
  flag: { x: 0.5 * S, y: (TERRACE.h + RED.h + PARAPET + 1.0) * S, z: -6 * S },
  /** The gilded pavilions on the Red Palace, for the flag and the fire. */
  pavilions: [-40, -13, 14, 41].map((x) => ({ x: x * S, z: -8 * S })),
};

export function buildPotalaPalace(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.4 * s;
  const course = 1.7 * s;
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  /**
   * The cross walls inside a block's footprint: one running the depth of it
   * on the axis, two running out to the side walls either side of that.
   *
   * Slabs, not rings: a ring as narrow as its own wall lays both of its long
   * faces down the same line and the two share every cubic metre they take
   * up. And the same three walls are laid twice — once in the terrace's
   * vaults and once in the palace block standing on them — because a cross
   * wall with nothing under it is a cross wall that starts detached, which
   * is what six hundred and sixty-six stones of this building were doing.
   */
  const crossWalls = (cx, cz, ww, dd, y, h, mat) => {
    B.slab(cx, y + h / 2, cz, WALL, h, dd - WALL * 2, stone, mat);
    const arm = ww / 2 - WALL * 1.5;
    for (const sx of [-1, 1]) {
      B.slab(cx + sx * (WALL / 2 + arm / 2), y + h / 2, cz, arm, h, WALL, stone, mat);
    }
  };

  // ── The lower terrace step: the broad apron the main terrace stands on,
  // and the thing that tells you the palace is a fortress before you are in
  // range of it.
  B.section('rampart', () => {
    courses(0, OUTER.h, course, (y, h, c) => {
      const w = taper(OUTER.w, y, OUTER.h * 4, 0.085);
      const d = taper(OUTER.d, y, OUTER.h * 4, 0.085);
      B.ring(0, 0, w, d, 4.2, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0);
    });
    // Bastions on the four corners, the way the real lower terraces step out
    // where the stair turns.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (OUTER.w / 2 - 12), z = sz * (OUTER.d / 2 - 12);
        courses(0, OUTER.h + 8, course, (y, h, c) => {
          const w = taper(26, y, OUTER.h + 8, 0.12);
          B.ring(x, z, w, w, 3.6, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0);
        });
      }
    }
  });

  // ── The terraces: the battered mass the palace stands on, and the single
  // hardest thing on the map to get through. Solid walls of stone leaning
  // into themselves, with the storage vaults inside them.
  B.section('terrace', () => {
    courses(0, TERRACE.h, course, (y, h, c) => {
      const w = taper(TERRACE.w, y, TERRACE.h, TERRACE.batter);
      const d = taper(TERRACE.d, y, TERRACE.h, TERRACE.batter);
      B.ring(0, 0, w, d, WALL * 1.6, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0);
      // The vault walls: laid on the footprint of the block above, so the
      // palace stands on masonry that goes to the rock rather than on the
      // deck plate. A hollow box this wide is a drum as well, and a drum four
      // hundred metres across has nothing holding its long faces apart.
      for (const b of BLOCKS) {
        B.ring(b.cx, b.cz, b.w, b.d, WALL, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0);
        crossWalls(b.cx, b.cz, b.w, b.d, y, h, M.LIMESTONE);
      }
      // And two more under the walk, front and back, so no run of the deck
      // is more than fifteen metres from a wall. Storerooms: the terraces
      // of the real building are solid with them.
      for (const wz of [-62.0, 62.0]) {
        B.slab(0, y + h / 2, wz, w - WALL * 3.2, h, WALL, stone, M.LIMESTONE);
      }
    });
    // The deck: the terrace walk, laid everywhere the palace is not. Under
    // the palace there is no walk — there are the vaults, and their walls
    // carry the building.
    // A stone's width of margin, not a hand's: `openings` reads the centre of
    // a stone, and a deck stone whose centre clears the palace wall by a foot
    // still has half its length inside it.
    const edge = stone * 1.1;
    B.openings((x, _y, z) => BLOCKS.some(
      (b) => Math.abs(x - b.cx) < b.w / 2 + edge && Math.abs(z - b.cz) < b.d / 2 + edge), () => {
      B.slab(0, TERRACE.h + DECK / 2, 0,
        taper(TERRACE.w, TERRACE.h, TERRACE.h, TERRACE.batter) - WALL, DECK,
        taper(TERRACE.d, TERRACE.h, TERRACE.h, TERRACE.batter) - WALL,
        stone * 1.1, M.LIMESTONE);
    });
  });

  /**
   * A palace block: battered walls off the terrace deck, the rows of dark
   * trapezoidal windows that are the whole face of this building, and the
   * kyema parapet on top.
   *
   * The windows are cut, not drawn. `openings` refuses to lay masonry where
   * the predicate says there is none, so the reveal is real, the garrison can
   * be posted in it, and a shell through one goes inside.
   */
  const block = ({ cx, cz, w, d, h, batter, mat, tag }) => {
    const y0 = TERRACE.h;
    B.section(tag, () => {
      const rows = [];
      for (let ly = h * 0.3; ly < h - 10; ly += 15.5) rows.push(y0 + ly);
      const win = (x, y, z) => {
        // Never within a stone and a half of a corner: a window that takes a
        // corner stone out leaves the pier above it standing on nothing.
        const lx = Math.abs(x - cx), lz = Math.abs(z - cz);
        if (lx > w / 2 - 12 && lz > d / 2 - 12) return false;
        const row = rows.find((r) => y > r && y < r + 5.2);
        if (row === undefined) return false;
        // Two metres of window, five of wall: the Potala's facade is mostly
        // wall, which is what makes the windows read at all.
        const along = lx > lz ? z : x;
        return ((along % 13) + 13) % 13 < 5.4;
      };
      const wallMat = M[mat];
      B.openings(win, () => {
        courses(y0, y0 + h, course, (y, h2, c) => {
          const ww = taper(w, y - y0, h, batter);
          const dd = taper(d, y - y0, h, batter);
          B.ring(cx, cz, ww, dd, WALL, y, h2, stone, wallMat, c % 2 ? 0.5 : 0);
          // The same three cross walls the vaults under this block carry, so
          // it is not a hollow shell standing on its own perimeter.
          crossWalls(cx, cz, ww, dd, y, h2, wallMat);
        });
      });
      // The floors inside, as galleries rather than plates.
      //
      // Not a stylistic choice — the solver will not carry a floor whose
      // stones have nothing within seven metres underneath them, and a
      // hundred-metre plate over a hall is a plate with most of itself in
      // that condition. It is also what the building is: thirteen storeys of
      // cells and chapels round light wells, with a walk round the inside of
      // every outer wall. The walk is what the garrison stands on and what a
      // shell through a window lands in.
      for (const f of [0.34, 0.58, 0.8]) {
        const fy = y0 + h * f;
        B.ring(cx, cz, taper(w, h * f, h, batter) - WALL * 1.2,
          taper(d, h * f, h, batter) - WALL * 1.2, 9.0,
          fy - course * 0.3, course * 0.6, stone, M.SLATE);
      }
      // The roof: flat rammed earth over beams, laid on the top course and
      // stopping inside the kyema so that two metres of the parapet still
      // stand above it, which is the line that reads from the valley floor.
      //
      // A walk round the inside, a cross of roof over the two cross walls,
      // and four light wells between them. The wells are not economy: a
      // thirteen-storey building in a place with no glass is lit down its
      // middle or it is not lit, and the Potala's roof is a set of courts
      // with the gilded pavilions standing between them. They are also the
      // only way this roof stands up — nothing here carries a fifty-metre
      // plate, and a plate laid anyway comes off in the first frame.
      {
        const ry = y0 + h + course * 0.25, rh = course * 0.5;
        const rw = taper(w, h, h, batter) - WALL * 1.6;
        const rd = taper(d, h, h, batter) - WALL * 1.6;
        B.ring(cx, cz, rw, rd, 13.0, y0 + h, rh, stone, M.SLATE);
        B.slab(cx, ry, cz, rw, rh, 22.0, stone, M.SLATE);
        B.slab(cx, ry, cz, 18.0, rh, rd, stone, M.SLATE);
      }
      // The kyema: the band of dark brushwood the Tibetans lay under every
      // roofline, which on this building is a metre of shadow round the top.
      const topW = taper(w, h, h, batter), topD = taper(d, h, h, batter);
      courses(y0 + h, y0 + h + PARAPET, course * 0.7, (y, h2) => {
        B.ring(cx, cz, topW + 1.2, topD + 1.2, WALL * 0.8, y, h2, stone, M.KYEMA);
      });
    });
  };

  for (const b of BLOCKS) block(b);

  // ── The golden roofs. Gilded pavilions over the tombs — the one thing on
  // this mountain that is not the colour of the mountain.
  B.section('roofs', () => {
    // On the roof, not on the parapet's head: the pavilions stand on the
    // deck the kyema runs round, two metres below the top of it.
    const base = TERRACE.h + RED.h + course * 0.5;
    for (const p of POTALA.pavilions) {
      const px = p.x / S, pz = p.z / S;
      courses(base, base + 7.0, course * 0.8, (y, h) => {
        B.ring(px, pz, 20, 19, 2.6, y, h, stone * 0.8, M.MADDER);
      });
      // The roof itself: courses stepping in, which is what a Tibetan gilt
      // roof is and also the only way a roof carries itself.
      courses(base + 7.0, base + 16.0, course * 0.55, (y, h, c) => {
        const k = 1 - (y - base - 7.0) / 11.5;
        B.ring(px, pz, 22 * k + 3, 21 * k + 3, 2.2, y, h, stone * 0.7, M.GILT, c % 2 ? 0.5 : 0);
      });
      B.pinnacle(px, pz, base + 16.0, 6.0, 2.4, stone * 0.6, M.GILT);
    }
    // Two smaller ones on the east wing, where the real building has them.
    const wy = TERRACE.h + WHITE.h + course * 0.5;
    for (const px of [-WHITE.off - 22, -WHITE.off + 22]) {
      courses(wy, wy + 9.0, course * 0.55, (y, h, c) => {
        const k = 1 - (y - wy) / 11.0;
        B.ring(px, 6, 17 * k + 3, 15 * k + 3, 2.0, y, h, stone * 0.7, M.GILT, c % 2 ? 0.5 : 0);
      });
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * Where the loopholes are, for a palace block.
 *
 * The builder cuts the windows with a predicate over world coordinates rather
 * than from a list, because `openings` wants a function and a battered wall
 * has no fixed course to hang a list on. The garrison cannot call that
 * predicate — it runs before there is a wall — so this reproduces it from the
 * same constants: the same row heights, the same thirteen-metre bay, the same
 * corner exclusion. If one moves the other has to move with it.
 */
function loopholes(cx, cz, w, d, h, batter) {
  const out = [];
  const rows = [];
  for (let y = h * 0.3; y < h - 10; y += 15.5) rows.push(y + 2.6);
  const bays = (half) => {
    const list = [];
    for (let k = -6; k <= 6; k++) {
      const a = 13 * k + 2.7;
      if (Math.abs(a) < half - 3) list.push(a);
    }
    return list;
  };
  for (const y of rows) {
    const ww = taper(w, y, h, batter), dd = taper(d, y, h, batter);
    // The two long faces, then the two ends. A man stands a metre inside the
    // reveal, facing out of it.
    for (const sz of [-1, 1]) {
      for (const a of bays(ww / 2)) {
        if (Math.abs(a) > w / 2 - 12 && dd / 2 > d / 2 - 12) continue;
        out.push({ x: cx + a, y, z: cz + sz * (dd / 2 - 1.6), yaw: sz > 0 ? 0 : Math.PI });
      }
    }
    for (const sx of [-1, 1]) {
      for (const a of bays(dd / 2)) {
        out.push({ x: cx + sx * (ww / 2 - 1.6), y, z: cz + a, yaw: sx > 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
    }
  }
  return out;
}

/** The loopholes of all three palace blocks, in world metres. */
POTALA.windows = {
  red: loopholes(0, -6, RED.w, RED.d, RED.h, RED.batter)
    .map((p) => ({ x: p.x * S, y: (TERRACE.h + p.y) * S, z: p.z * S, yaw: p.yaw })),
  white: [
    ...loopholes(-WHITE.off, 6, WHITE.w, WHITE.d, WHITE.h, WHITE.batter),
    ...loopholes(WHITE.off, 6, WHITE.w * 0.92, WHITE.d, WHITE.h * 0.94, WHITE.batter),
  ].map((p) => ({ x: p.x * S, y: (TERRACE.h + p.y) * S, z: p.z * S, yaw: p.yaw })),
};

/**
 * The garrison of the Potala, which is the level.
 *
 * Nothing on this mountain falls over, so the fight is not a fight for a
 * silhouette — it is a fight up a hill against a building with a thousand
 * windows in it, and the garrison has to be laid out so that taking the
 * rampart does not take the terrace and taking the terrace does not take the
 * palace. Three lines, each one higher and each one harder to reach than the
 * last, and every man anchored to the stone he is standing on so that the only
 * way past a line is through the masonry under it.
 *
 * The order here is the order the cap truncates in, so the contract is posted
 * first: a phone holds two hundred men and the two hundred it holds should be
 * the ones on the Red Palace.
 */
export function populatePotalaPalace(g, origin, groundY) {
  const K = POTALA;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);

  // ── The Red Palace. The contract, and the last line.
  K.windows.red.forEach((p, i) => {
    if (i % 3) return;
    g.place(i % 6 === 0 ? 'mg' : 'rifleman', V(p.x, p.y, p.z), p.yaw, 6, { cover: 'window' });
  });
  // The roof, between the golden pavilions: the highest ground in the campaign
  // that a man can be standing on, and snipers hold it.
  for (const p of K.pavilions) {
    for (const sz of [-1, 1]) {
      g.place('sniper', V(p.x, K.red.top + 5.0, p.z + sz * 14), sz > 0 ? 0 : Math.PI, 8, { cover: 'roof' });
    }
  }

  // ── The White Palace. Two wings of quarters, and the reason the fight is
  // long: a player who works through them has spent an hour on the scenery,
  // but they shoot the whole time and they cannot be left alone.
  K.windows.white.forEach((p, i) => {
    if (i % 4) return;
    g.place(i % 8 === 0 ? 'at' : 'rifleman', V(p.x, p.y, p.z), p.yaw, 6, { cover: 'window' });
  });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = sx * K.white.off + (i - 2) * 22;
      g.place(i % 2 ? 'sniper' : 'mg', V(x, K.white.top + 5.0, 6 * S + K.white.d / 2 - 4),
        0, 8, { cover: 'roof' });
    }
  }

  // ── The terrace deck: the mortar line, in the open on the widest flat
  // surface in the game, four hundred metres of it thirty above the hill.
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * (K.terrace.w / 9);
    g.place('mortar', V(x, K.terrace.h + 1.2, K.terrace.d * 0.32), 0, 10, { cover: 'roof' });
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.place(i % 4 === 0 ? 'at' : 'rifleman',
      V(Math.cos(a) * (K.terrace.w / 2 - 4), K.terrace.h + 1.2, Math.sin(a) * (K.terrace.d / 2 - 4)),
      Math.atan2(Math.cos(a), Math.sin(a)), 8, { cover: 'roof' });
  }

  // ── The rampart at the foot of the hill: the first line, and the one that
  // tells the player what the next two are going to be like.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.place(i % 3 === 0 ? 'mg' : 'rifleman',
      V(Math.cos(a) * (K.outer.w / 2 - 2.4), K.outer.h + 1.2, Math.sin(a) * (K.outer.d / 2 - 2.4)),
      Math.atan2(Math.cos(a), Math.sin(a)), 8, { cover: 'roof' });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.place('sniper', V(sx * (K.outer.w / 2 - 10), K.outer.h + 10.2, sz * (K.outer.d / 2 - 10)),
        Math.atan2(sx, sz), 9, { cover: 'roof' });
    }
  }
}
