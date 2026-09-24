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
const TERRACE = { w: 400.0, d: 172.0, h: 46.0, batter: 0.085 };
const WALL = 5.2;                 // the thickness of a palace wall at its head
const PARAPET = 4.0;              // the dark kyema frieze every roofline carries
const DECK = 3.2;                 // the terrace walk round the palace

/**
 * The terraces under the palace, outermost and lowest first.
 *
 * The Potala does not stand on a plinth. It stands on a staircase of
 * retaining walls that steps out and down the face of Marpo Ri — four of
 * them here, each one a battered wall from the rock to its own top, nested
 * inside the one below and pushed south so the steps show on the face you
 * see from the valley and the back stays flush against the hill. The first
 * pass laid one box thirty-four metres tall and it read as a crate.
 *
 * `z` is how far south of the palace's own axis each one is centred.
 */
const TIERS = [
  { w: 452.0, d: 232.0, h: 14.0, z: 30.0, wall: 8.0 },
  { w: 428.0, d: 210.0, h: 24.0, z: 20.0, wall: 7.0 },
  { w: 412.0, d: 190.0, h: 32.0, z: 10.0, wall: 6.0 },
];

/**
 * The blocks of the palace, east to west, laid on the terrace deck.
 *
 * Five, not three. The White Palace does not end in a wall — it steps down
 * twice at either end, and those steps are half of what the silhouette is.
 * They are listed once and read four times: the builder raises them, the
 * terrace lays a wall under each of their footprints so the palace stands on
 * masonry that goes to the rock rather than on a deck plate, the deck is cut
 * where they come through it, and the garrison reads their loopholes.
 */
const BLOCKS = [
  { cx: -155.0, cz: 6.0, w: 46.0, d: 78.0, h: 44.0, batter: 0.075,
    mat: 'MARBLE', tag: 'east-low' },
  { cx: -98.0, cz: 6.0, w: 65.0, d: 92.0, h: 62.0, batter: 0.075,
    mat: 'MARBLE', tag: 'east' },
  { cx: 0.0, cz: -6.0, w: 126.0, d: 106.0, h: 88.0, batter: 0.07,
    mat: 'MADDER', tag: 'red' },
  { cx: 104.0, cz: 6.0, w: 74.0, d: 92.0, h: 60.0, batter: 0.075,
    mat: 'MARBLE', tag: 'west' },
  { cx: 169.0, cz: 6.0, w: 52.0, d: 78.0, h: 42.0, batter: 0.075,
    mat: 'MARBLE', tag: 'west-low' },
];

/** The Red Palace, which is the contract. */
const RED = BLOCKS.find((b) => b.tag === 'red');

/**
 * Shöl: the quarters along the front of the lower terraces.
 *
 * Whitewashed blocks with the same dark windows as the palace, standing on
 * the tiers' own walls so that the masonry under each of them goes to the
 * rock. In Lhasa these are the village at the foot, the printing house and
 * the stables; here they are what turns a stepped plinth into a place where
 * people lived.
 */
const SHOL = [];
{
  // A village, not a barrack square. Sizes and spacing wander — the first
  // pass laid three even rows of one size and from the valley it read as a
  // car park with a palace behind it.
  let seed = 0x5f3a91;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rows = [
    // [tier index or -1 for the ground at the foot, south offset, how many]
    [-1, 166.0, 9], [0, 0.0, 7], [1, 0.0, 6], [2, 0.0, 4],
  ];
  for (const [ti, footZ, n] of rows) {
    const t = ti >= 0 ? TIERS[ti] : null;
    const halfSpan = t ? t.w / 2 - 34 : 200.0;
    const y = t ? t.h : 0.0;
    const z = t ? t.z + t.d / 2 - t.wall * 1.1 : footZ;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      SHOL.push({
        x: -halfSpan + u * halfSpan * 2 + (rnd() - 0.5) * 18,
        z: z + (rnd() - 0.5) * 9,
        y,
        w: 18 + rnd() * 18,
        d: 12 + rnd() * 7,
        h: 9 + rnd() * 9,
      });
    }
  }
}

/**
 * The great stair, which zigzags up the south face.
 *
 * One flight to each terrace, each running the opposite way to the one below
 * it and standing on the walk of the tier under it, leaning against the face
 * of the tier above — which is the real geometry, because a stair up a
 * stepped hill has nowhere else to be. The first pass drew two long diagonals
 * and buried both of them inside the terraces they were supposed to climb.
 *
 * It is a masonry ramp with steps cut in its top, which is what a Tibetan
 * stair on a hillside is: courses stacked one on the next, each shorter than
 * the one below so the pile's top follows the climb, and so that every stone
 * in it stands on the stone under it rather than on air.
 */
const STAIR = [
  { x0: 128.0, z0: 154.0, x1: 2.0, z1: 152.0, y0: 0.0, y1: TIERS[0].h },
  { x0: -14.0, z0: 133.0, x1: 112.0, z1: 131.0, y0: TIERS[0].h, y1: TIERS[1].h },
  { x0: 128.0, z0: 112.0, x1: 2.0, z1: 111.0, y0: TIERS[1].h, y1: TIERS[2].h },
  { x0: -14.0, z0: 93.0, x1: 112.0, z1: 92.0, y0: TIERS[2].h, y1: TERRACE.h },
];

/** Where a battered wall's face is at height `y` of a block `h` tall. */
const taper = (w, y, h, batter) => w * (1 - batter * (y / h));

/** What the garrison, the flag and the level record read. */
export const POTALA = {
  scale: S,
  terrace: { w: TERRACE.w * S, d: TERRACE.d * S, h: TERRACE.h * S },
  red: { w: RED.w * S, d: RED.d * S, h: RED.h * S, top: (TERRACE.h + RED.h) * S },
  white: { off: 98.0 * S, top: (TERRACE.h + 62.0) * S },
  outer: { w: TIERS[0].w * S, d: TIERS[0].d * S, h: TIERS[0].h * S, z: TIERS[0].z * S },
  /** The tier walks, low to high: where the first two lines stand. */
  tiers: TIERS.map((t) => ({ w: t.w * S, d: t.d * S, h: t.h * S, z: t.z * S })),
  /** The roofline courses a man can be posted on, low to high. */
  galleries: [TERRACE.h * S, (TERRACE.h + 34.0) * S, (TERRACE.h + 62.0) * S],
  /** On the Red Palace roof, between the two middle pavilions. */
  flag: { x: 0.5 * S, y: (TERRACE.h + RED.h + PARAPET + 1.0) * S, z: -6 * S },
  /** The gilded pavilions on the Red Palace, for the flag and the fire. */
  pavilions: [-46, -23, 0, 23, 46].map((x) => ({ x: x * S, z: -8 * S })),
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
    if (arm > stone) {
      for (const sx of [-1, 1]) {
        B.slab(cx + sx * (WALL / 2 + arm / 2), y + h / 2, cz, arm, h, WALL, stone, mat);
      }
    }
  };

  // ── The terraces. The battered mass the palace stands on, stepping down
  // and out to the south, and the single hardest thing on the map to get
  // through: four retaining walls of stone leaning into their own weight,
  // with the storage vaults inside the topmost one.
  // Every face on the hill leans at the same angle. `taper` is written as a
  // fraction of a wall's own width, so a fourteen-metre tier given the main
  // terrace's number comes out nearly vertical beside it and the whole pile
  // reads as boxes on boxes; converted to a slope it reads as one mountain of
  // masonry, which is what it is.
  const SLOPE = TERRACE.batter * TERRACE.w / 2 / TERRACE.h;
  const tierBatter = (t) => (SLOPE * t.h * 2) / t.w;
  B.section('terrace', () => {
    for (const t of TIERS) {
      const tb = tierBatter(t);
      courses(0, t.h, course, (y, h, c) => {
        const w = taper(t.w, y, t.h, tb);
        const d = taper(t.d, y, t.h, tb);
        B.ring(0, t.z, w, d, t.wall, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0);
      });
      // A walk on top of each, over its own wall and no wider — the quarters
      // along the front stand on it, and a plate across the whole tier is
      // twenty thousand stones of solid rock nobody can see.
      B.ring(0, t.z, taper(t.w, t.h, t.h, tb) + 1.4,
        taper(t.d, t.h, t.h, tb) + 1.4, t.wall * 2.4,
        t.h - course * 0.6, course * 0.6, stone, M.LIMESTONE);
      // The kyema under each terrace's lip. A band of shadow along every
      // roofline is the one mark that makes a Tibetan wall read as Tibetan,
      // and without it four hundred metres of battered stone is a dam.
      courses(t.h - course * 2.2, t.h - course * 0.6, course * 0.8, (y, h) => {
        B.ring(0, t.z, taper(t.w, t.h, t.h, tb) + 2.4,
          taper(t.d, t.h, t.h, tb) + 2.4, 2.4, y, h, stone, M.KYEMA);
      });
    }
    courses(0, TERRACE.h, course, (y, h, c) => {
      const w = taper(TERRACE.w, y, TERRACE.h, TERRACE.batter);
      const d = taper(TERRACE.d, y, TERRACE.h, TERRACE.batter);
      // Two leaves with a rubble core between them, which is how a wall this
      // thick is built and which keeps the stones inside a shell's reach.
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
      // is more than fifteen metres from a wall. Storerooms: the terraces of
      // the real building are solid with them.
      for (const wz of [-62.0, 62.0]) {
        B.slab(0, y + h / 2, wz, w - WALL * 3.2, h, WALL, stone, M.LIMESTONE);
      }
    });
    // The deck: the terrace walk, laid everywhere the palace is not. Under
    // the palace there is no walk — there are the vaults, and their walls
    // carry the building.
    //
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

  // ── The great stair.
  B.section('stair', () => {
    for (const f of STAIR) {
      const dx = f.x1 - f.x0, dz = f.z1 - f.z0;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dz, dx);
      const halfW = 7.0;
      const rise = f.y1 - f.y0;
      courses(f.y0, f.y1, course, (y, h, c) => {
        // Each course starts further along the run than the one below it, so
        // the top of the pile climbs and every stone stands on stone.
        const t0 = c * (course / rise) * 0.96;
        const ax = f.x0 + dx * t0, az = f.z0 + dz * t0;
        const run = len * (1 - t0);
        if (run < stone) return;
        const n = Math.max(1, Math.round(run / stone));
        // Three stones across the tread, not one. Fourteen metres of stair
        // laid as a single block is four hundred cubic metres, which is the
        // biggest thing on the map and more than a 155 mm round can move.
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          const mx = ax + (f.x1 - ax) * u, mz = az + (f.z1 - az) * u;
          for (const k of [-1, 0, 1]) {
            B.add(mx + k * Math.sin(yaw) * (halfW * 2 / 3),
              y + h / 2, mz + k * Math.cos(yaw) * (halfW * 2 / 3),
              (run / n) / 2, h / 2, halfW / 3, M.MARBLE, yaw);
          }
        }
      });
      // The two parapets, on the climb, which is the line that reads white
      // against the hill from three kilometres away.
      const n = Math.max(2, Math.round(len / stone));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const y = f.y0 + rise * u;
        for (const side of [-1, 1]) {
          const ox = side * Math.sin(yaw) * (halfW - 1.1);
          const oz = side * Math.cos(yaw) * (halfW - 1.1);
          B.add(f.x0 + dx * u + ox, y + course * 0.9, f.z0 + dz * u + oz,
            (len / n) / 2, course * 1.3, 1.5, M.MARBLE, yaw);
        }
      }
    }
  });

  // ── Shöl: the quarters along the front of the terraces.
  B.section('shol', () => {
    for (const q of SHOL) {
      courses(q.y, q.y + q.h, course, (y, h, c) => {
        B.ring(q.x, q.z, q.w, q.d, 2.6, y, h, stone, M.MARBLE, c % 2 ? 0.5 : 0);
      });
      B.slab(q.x, q.y + q.h - course * 0.25, q.z, q.w - 3.0, course * 0.5,
        q.d - 3.0, stone, M.SLATE);
      courses(q.y + q.h, q.y + q.h + 2.2, course * 0.7, (y, h) => {
        B.ring(q.x, q.z, q.w + 0.9, q.d + 0.9, 2.2, y, h, stone, M.KYEMA);
      });
    }
  });

  /**
   * A palace block: battered walls off the terrace deck, the ranks of dark
   * trapezoidal windows that are the whole face of this building, and the
   * kyema parapet on top.
   *
   * The windows are cut, not drawn. `openings` refuses to lay masonry where
   * the predicate says there is none, so the reveal is real, the garrison can
   * be posted in it, and a shell through one goes inside. They are ranked —
   * columns ten metres apart running the full height, storeys eleven metres
   * up — because that is what the facade is: a grid, not a scatter, and the
   * first pass scattered them.
   */
  const block = ({ cx, cz, w, d, h, batter, mat, tag }) => {
    const y0 = TERRACE.h;
    B.section(tag, () => {
      const rows = [];
      for (let ly = h * 0.2; ly < h - 8; ly += 11.0) rows.push(y0 + ly);
      const win = (x, y, z) => {
        const lx = Math.abs(x - cx), lz = Math.abs(z - cz);
        // Only the outer wall has windows in it.
        //
        // `openings` is asked about every stone laid inside it, and the cross
        // walls are laid inside it too — so the predicate, which only knows
        // about heights and bays, was cutting a window-sized hole through the
        // middle of the block on every storey. At a four-metre band that left
        // a notch the course above lapped; widened to six it took whole
        // courses of cross wall out and thirty-nine stones of the Red Palace
        // started detached.
        const ww = taper(w, y - y0, h, batter), dd = taper(d, y - y0, h, batter);
        if (lx < ww / 2 - WALL * 1.8 && lz < dd / 2 - WALL * 1.8) return false;
        // Never within a stone and a half of a corner: a window that takes a
        // corner stone out leaves the pier above it standing on nothing.
        if (lx > w / 2 - 11 && lz > d / 2 - 11) return false;
        const row = rows.find((r) => y > r && y < r + 6.2);
        if (row === undefined) return false;
        const along = lx > lz ? z : x;
        return ((along % 10) + 10) % 10 < 5.0;
      };
      const wallMat = M[mat];
      B.openings(win, () => {
        courses(y0, y0 + h, course, (y, h2, c) => {
          const ww = taper(w, y - y0, h, batter);
          const dd = taper(d, y - y0, h, batter);
          B.ring(cx, cz, ww, dd, WALL, y, h2, stone, wallMat, c % 2 ? 0.5 : 0);
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
      const ry = y0 + h + course * 0.25, rh = course * 0.5;
      const rw = taper(w, h, h, batter) - WALL * 1.6;
      const rd = taper(d, h, h, batter) - WALL * 1.6;
      if (rw > 40 && rd > 40) {
        B.ring(cx, cz, rw, rd, 13.0, y0 + h, rh, stone, M.SLATE);
        B.slab(cx, ry, cz, rw, rh, 22.0, stone, M.SLATE);
        B.slab(cx, ry, cz, 18.0, rh, rd, stone, M.SLATE);
      } else {
        B.slab(cx, ry, cz, rw, rh, rd, stone, M.SLATE);
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
  // this mountain that is not the colour of the mountain, and the thing the
  // whole silhouette is read by.
  B.section('roofs', () => {
    const base = TERRACE.h + RED.h + course * 0.5;
    for (const p of POTALA.pavilions) {
      const px = p.x / S, pz = p.z / S;
      courses(base, base + 6.0, course * 0.8, (y, h) => {
        B.ring(px, pz, 18, 18, 2.6, y, h, stone * 0.8, M.MADDER);
      });
      // The roof itself: courses stepping in, which is what a Tibetan gilt
      // roof is and also the only way a roof carries itself. Taller than the
      // first pass, because from the valley these are the building.
      courses(base + 6.0, base + 21.0, course * 0.5, (y, h, c) => {
        const k = 1 - (y - base - 6.0) / 17.0;
        B.ring(px, pz, 20 * k + 3, 20 * k + 3, 2.2, y, h, stone * 0.7, M.GILT, c % 2 ? 0.5 : 0);
      });
      B.pinnacle(px, pz, base + 21.0, 7.0, 2.6, stone * 0.6, M.GILT);
    }
    // And two on each white wing, where the real building carries them.
    for (const b of BLOCKS) {
      if (b.mat !== 'MARBLE' || b.w < 60) continue;
      const wy = TERRACE.h + b.h + course * 0.5;
      for (const ox of [-18, 18]) {
        courses(wy, wy + 11.0, course * 0.5, (y, h, c) => {
          const k = 1 - (y - wy) / 13.0;
          B.ring(b.cx + ox, b.cz, 15 * k + 3, 15 * k + 3, 2.0, y, h,
            stone * 0.7, M.GILT, c % 2 ? 0.5 : 0);
        });
      }
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
 * same constants: the same row heights, the same ten-metre bay, the same
 * corner exclusion. If one moves the other has to move with it.
 */
function loopholes(cx, cz, w, d, h, batter) {
  const out = [];
  const rows = [];
  for (let y = h * 0.2; y < h - 8; y += 11.0) rows.push(y + 2.2);
  const bays = (half) => {
    const list = [];
    for (let k = -12; k <= 12; k++) {
      const a = 10 * k + 2.5;
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
        if (Math.abs(a) > w / 2 - 11 && dd / 2 > d / 2 - 11) continue;
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

/**
 * A loophole nobody can see out of is a man taken out of the fight.
 *
 * The blocks stand two or three metres apart, so the windows in the ends
 * facing a neighbour look into a slot. The builder still cuts them — that gap
 * is a real light well and a shell into it goes somewhere — but the garrison
 * does not post anybody in one, which was a fifth of the blind ranks the
 * field-of-fire report was finding.
 */
const openEnd = (b, side) => !BLOCKS.some((o) => o !== b
  && Math.abs(o.cz - b.cz) < (o.d + b.d) / 2
  && Math.abs((b.cx + side * b.w / 2) - o.cx) < o.w / 2 + 14);
const manned = (b) => loopholes(b.cx, b.cz, b.w, b.d, b.h, b.batter)
  .filter((p) => (p.yaw === Math.PI / 2 ? openEnd(b, 1)
    : p.yaw === -Math.PI / 2 ? openEnd(b, -1) : true));

/** The loopholes of every palace block, in world metres. */
POTALA.windows = {
  red: manned(RED)
    .map((p) => ({ x: p.x * S, y: (TERRACE.h + p.y) * S, z: p.z * S, yaw: p.yaw })),
  white: BLOCKS.filter((b) => b.mat === 'MARBLE').flatMap(manned)
    .map((p) => ({ x: p.x * S, y: (TERRACE.h + p.y) * S, z: p.z * S, yaw: p.yaw })),
};

/** Where the quarters along the terraces are, for the picket on them. */
POTALA.shol = SHOL.map((q) => ({
  x: q.x * S, y: (q.y + q.h) * S, z: q.z * S,
}));

/**
 * The garrison of the Potala, which is the level.
 *
 * Nothing on this mountain falls over, so the fight is not a fight for a
 * silhouette — it is a fight up a hill against a building with a thousand
 * windows in it, and the garrison has to be laid out so that taking the
 * terraces does not take the deck and taking the deck does not take the
 * palace. Three lines, each one higher and each one harder to reach than the
 * last, and every man anchored to the stone he is standing on so that the
 * only way past a line is through the masonry under it.
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
    if (i % 5) return;
    g.place(i % 10 === 0 ? 'mg' : 'rifleman', V(p.x, p.y, p.z), p.yaw, 6, { cover: 'window' });
  });
  // The roof, between the golden pavilions: the highest ground in the campaign
  // that a man can be standing on, and snipers hold it.
  for (const p of K.pavilions) {
    for (const sz of [-1, 1]) {
      g.place('sniper', V(p.x, K.red.top + 5.0, p.z + sz * 15), sz > 0 ? 0 : Math.PI, 9, { cover: 'roof' });
    }
  }

  // ── The White Palace. Two wings of quarters stepping down at either end,
  // and the reason the fight is long: a player who works through them has
  // spent an hour on the scenery, but they shoot the whole time and they
  // cannot be left alone.
  K.windows.white.forEach((p, i) => {
    if (i % 7) return;
    g.place(i % 14 === 0 ? 'at' : 'rifleman', V(p.x, p.y, p.z), p.yaw, 6, { cover: 'window' });
  });

  // ── The terrace deck: the mortar line, in the open on the widest flat
  // surface in the game, forty-six metres above the rock.
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * (K.terrace.w / 9);
    g.place('mortar', V(x, K.terrace.h + K.terrace.d * 0 + 3.6, K.terrace.d * 0.32), 0, 10, { cover: 'roof' });
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.place(i % 4 === 0 ? 'at' : 'rifleman',
      V(Math.cos(a) * (K.terrace.w / 2 - 4), K.terrace.h + 3.6, Math.sin(a) * (K.terrace.d / 2 - 4)),
      Math.atan2(Math.cos(a), Math.sin(a)), 9, { cover: 'roof' });
  }

  // ── Shöl, on the terraces: the first line, and the one that tells the
  // player what the next two are going to be like.
  K.shol.forEach((q, i) => {
    g.place(i % 3 === 0 ? 'mg' : 'rifleman', V(q.x, q.y + 1.4, q.z), 0, 9, { cover: 'roof' });
  });
  for (const t of K.tiers) {
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * (t.w / 7);
      g.place(i % 2 ? 'rifleman' : 'sniper',
        V(x, t.h + 1.4, t.z + t.d / 2 - 3.0), 0, 9, { cover: 'roof' });
    }
  }
}
/**
 * The Pargo Kaling: the great chörten gate at the foot of the hill.
 *
 * A whitewashed stupa built over an archway, straddling the road through the
 * saddle between Marpo Ri and Chakpo Ri — everybody coming into Lhasa from the
 * west walked under it. It is not the contract and it holds no garrison worth
 * the name; it is here because the hill has a foot and the foot has a gate,
 * and because a mountain of a level needs one thing on it a player can knock
 * down inside a minute.
 */
const GATE = { pier: 11.0, span: 13.0, rise: 19.0, drum: 14.0, dome: 11.0 };

export const CHORTEN = {
  scale: 1.0,
  height: GATE.rise + GATE.drum + GATE.dome + 16.0,
  span: GATE.span,
};

export function buildChortenGate(quality) {
  const B = new BlockList();
  const s = Math.min(quality.blockScale, 1.3) * 1.15;
  const stone = 1.4 * s;
  const course = 1.3 * s;
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  const half = GATE.span / 2 + GATE.pier / 2;

  // The two piers and the barrel over the road.
  B.section('gate', () => {
    const voidAt = BlockList.archVoid(0, GATE.rise, 0, GATE.span, 1.6, GATE.pier + 2, 'x');
    B.openings((x, y, z) => voidAt(x, y, z)
      || (y < GATE.rise && Math.abs(x) < GATE.span / 2 + 0.4), () => {
      courses(0, GATE.rise + GATE.span / 2 + 2.0, course, (y, h, c) => {
        B.ring(0, 0, GATE.span + GATE.pier * 2, GATE.pier, 3.0, y, h, stone,
          M.MARBLE, c % 2 ? 0.5 : 0);
      });
    });
    B.arch(0, GATE.rise, 0, GATE.span, GATE.pier, 1.6, 13, M.MARBLE, 'x');
    // The plinth the stupa stands on, across both piers.
    B.slab(0, GATE.rise + GATE.span / 2 + 3.2, 0, half * 2, 2.4, GATE.pier + 1.4,
      stone, M.MARBLE);
  });

  // The chörten itself: a stepped plinth, the bumpa, and thirteen rings of
  // the spire with the sun and moon on top.
  B.section('chorten', () => {
    const y0 = GATE.rise + GATE.span / 2 + 4.4;
    courses(y0, y0 + GATE.drum, course, (y, h, c) => {
      const k = 1 - ((y - y0) / GATE.drum) * 0.22;
      B.ring(0, 0, 17.0 * k, 17.0 * k, 3.0, y, h, stone, M.MARBLE, c % 2 ? 0.5 : 0);
    });
    B.dome(0, 0, y0 + GATE.drum, GATE.dome, 8.0, 2.2, course, stone, M.MARBLE,
      (t) => Math.sqrt(Math.max(0, 1 - t * t * 0.94)));
    const sy = y0 + GATE.drum + GATE.dome;
    B.spire(0, 0, sy, sy + 12.0, 5.0, 1.6, course * 0.9, stone * 0.8, M.GILT, 0.6);
    B.pinnacle(0, 0, sy + 12.0, 4.0, 1.5, stone * 0.7, M.GILT);
  });

  return B;
}

/** A picket on the gate: two men in the arch and two on the plinth. */
export function populateChortenGate(g, origin, groundY) {
  for (const sx of [-1, 1]) {
    g.place('rifleman', new THREE.Vector3(origin.x + sx * 10, groundY + 1.0, origin.z),
      sx > 0 ? Math.PI / 2 : -Math.PI / 2, 7, { cover: 'arcade' });
    g.place('sniper', new THREE.Vector3(origin.x + sx * 9, groundY + GATE.rise + GATE.span / 2 + 5.0, origin.z),
      sx > 0 ? Math.PI / 2 : -Math.PI / 2, 8, { cover: 'roof' });
  }
}
