import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Elizabeth Tower, built from its real dimensions.
 *
 * Reference figures (Palace of Westminster survey data, widely published):
 *   overall height          96.3 m to the tip of the finial
 *   shaft                   12.2 m square, brick core faced in Anston limestone
 *   brick shaft top         ~61 m, where the clock stage begins
 *   clock dial centres      ~55 m above ground, dials 7 m across
 *   belfry (Big Ben itself) ~62-68 m, open arcade
 *   cast-iron spire         ~68 m to 96 m
 *   foundation raft         15 m square, 3 m thick concrete
 *
 * The tower is genuinely hollow: a 12.2 m square shaft with walls that taper
 * from about 2.3 m thick at the base to 0.9 m near the belfry, exactly as the
 * real one does. That hollowness matters — it is why the tower can be cut
 * through from one side and topple, rather than simply eroding.
 */

/**
 * How much bigger than life the tower is built.
 *
 * Everything below is written at the real survey dimensions — that is what
 * makes it checkable — and the whole block list is scaled once at the end. At
 * 2 the tower is 24.4 m square and 192 m to the finial, which is the size the
 * thing has in memory rather than the size it has on a drawing.
 *
 * The stone size is *not* doubled with it. Scaling the geometry alone would
 * leave the same number of stones, each twice as big, and a building made of
 * boulders comes apart in slabs. Building at 0.79 of the tier's nominal stone
 * and then doubling puts the stones at about 1.5x their old size in a
 * structure eight times the volume — about twice as many of them, and finer
 * *relative* to the tower than they were before.
 */
export const TOWER_SCALE = 2;
const STONE_FINENESS = 0.74;

/**
 * Where the tower's windows are, in build space — before `TOWER_SCALE`.
 *
 * Twelve bays on each of the four faces. The real tower has six over 61 m of
 * shaft; this one has 122 m of shaft, and a building twice as tall with the
 * same number of storeys reads as a model of itself.
 */
const TOWER_WINDOWS = {
  heights: [12.5, 16.5, 20.5, 24.5, 28.5, 32.5,
    36.5, 40.5, 44.5, 48.5, 52.0, 56.0],
  halfWidth: 0.85,      // opening is 1.7 m across
  halfHeight: 1.15,     // and 2.3 m tall
  faceInset: 3.0,       // how far out from the axis a wall stone has to be
};

const W = 12.2;              // shaft width, metres
const PLINTH_TOP = 6.0;
const SHAFT_TOP = 61.0;
const CLOCK_Y = 55.0;
const BELFRY_TOP = 68.5;
const SPIRE_TOP = 96.3;

/** Wall thickness and outer width at a given height in build space. */
const wallAt = (y) => 2.3 - ((y - PLINTH_TOP) / (SHAFT_TOP - PLINTH_TOP)) * 1.4;
const widthAt = (y) => W - ((y - PLINTH_TOP) / (SHAFT_TOP - PLINTH_TOP)) * 0.5;

/**
 * The finished tower's dimensions, in world metres.
 *
 * One source for the builder and the garrison both. A defender's position and
 * the hole he is shooting through have to come from the same numbers, or he
 * ends up embedded in a wall or floating a metre outside it — and while those
 * numbers were written out twice, in two files, scaling the tower moved the
 * masonry and left the men where they were.
 */
export const TOWER = {
  scale: TOWER_SCALE,
  width: W * TOWER_SCALE,
  plinthTop: PLINTH_TOP * TOWER_SCALE,
  shaftTop: SHAFT_TOP * TOWER_SCALE,
  clockY: CLOCK_Y * TOWER_SCALE,
  belfryTop: BELFRY_TOP * TOWER_SCALE,
  spireTop: SPIRE_TOP * TOWER_SCALE,
  windows: {
    heights: TOWER_WINDOWS.heights.map((h) => h * TOWER_SCALE),
    halfWidth: TOWER_WINDOWS.halfWidth * TOWER_SCALE,
    halfHeight: TOWER_WINDOWS.halfHeight * TOWER_SCALE,
  },
  /** Wall thickness at a world height above the tower's base. */
  wallAt: (y) => wallAt(y / TOWER_SCALE) * TOWER_SCALE,
  /** Outer width at a world height above the tower's base. */
  widthAt: (y) => widthAt(y / TOWER_SCALE) * TOWER_SCALE,
};

function towerWindowCutter() {
  const { heights, halfWidth, halfHeight, faceInset } = TOWER_WINDOWS;
  return (x, y, z) => {
    for (const wy of heights) {
      if (y < wy - halfHeight || y > wy + halfHeight) continue;
      // A window is cut where a stone sits on a face (far out on one axis,
      // near the centre line on the other).
      if (Math.abs(x) < halfWidth && Math.abs(z) > faceInset) return true;
      if (Math.abs(z) < halfWidth && Math.abs(x) > faceInset) return true;
    }
    return false;
  };
}

export function buildElizabethTower(quality) {
  const B = new BlockList();
  const s = quality.blockScale * STONE_FINENESS;

  // Stone sizes scale with quality tier; the tower's dimensions never change,
  // only how finely it is divided.
  const stone = 1.15 * s;      // nominal stone length
  const course = 0.95 * s;     // course height

  // ── Foundation raft ──────────────────────────────────────────────────────
  // Grounded stones are the anchors the support solver floods out from.
  B.section('foundation', () => {
    B.slab(0, -1.4, 0, 15.0, 2.8, 15.0, stone * 1.9, M.CONCRETE);
  });

  // ── Plinth ───────────────────────────────────────────────────────────────
  B.section('plinth', () => {
    let y = 0;
    while (y < 6.0) {
      const h = Math.min(course * 1.25, 6.0 - y);
      const t = y / 6.0;
      const w = 14.4 - t * 1.6;
      B.ring(0, 0, w, w, 3.0, y, h, stone * 1.3, M.REDSTONE, Math.round(y / course) % 2);
      y += h;
    }
  });

  // ── Main shaft ───────────────────────────────────────────────────────────
  // Brick core with a limestone skin. The skin is a separate, thinner ring so
  // that a hit can strip facing without opening the core — and so the core,
  // being weaker brick, is what actually fails under redistributed load.
  B.section('shaft', () => {
    // Window openings are cut by simply not laying the stone, which means the
    // support graph is correct from the start: the wall genuinely spans each
    // opening through the lintel course, and shooting that lintel out genuinely
    // drops the masonry above it.
    B.openings(towerWindowCutter(), () => {
      let y = 6.0;
      let c = 0;
      while (y < SHAFT_TOP) {
        const h = Math.min(course, SHAFT_TOP - y);
        const t = (y - 6.0) / (SHAFT_TOP - 6.0);
        // Walls thin as they rise, like the real tower.
        const wall = 2.3 - t * 1.4;
        const w = W - t * 0.5;

        // Structural brick ring.
        B.ring(0, 0, w - 1.0, w - 1.0, wall, y, h, stone, M.BRICK, c % 2);
        // Limestone facing, half a course out of phase with the core.
        B.ring(0, 0, w, w, 0.55, y, h, stone * 0.9, M.REDSTONE, (c + 1) % 2);

        y += h;
        c++;
      }
    });

    // Lintel and sill for every opening. The lintel is one stone spanning the
    // whole bay, so the courses above it bear on masonry rather than relying on
    // the solver's lateral spanning — and it is a single point of failure the
    // player can aim at, which is the point of having one.
    const { heights, halfWidth, halfHeight } = TOWER_WINDOWS;
    for (const wy of heights) {
      const t = (wy - 6.0) / (SHAFT_TOP - 6.0);
      const wall = 2.3 - t * 1.4;
      const w = W - t * 0.5;
      const span = halfWidth * 2 + 1.5;
      for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const off = (w - wall) / 2;
        const cx = ax * off, cz = az * off;
        const hxL = ax !== 0 ? wall / 2 : span / 2;
        const hzL = ax !== 0 ? span / 2 : wall / 2;
        B.add(cx, wy + halfHeight + 0.32, cz, hxL, 0.30, hzL, M.REDSTONE);
        B.add(cx, wy - halfHeight - 0.28, cz, hxL, 0.26, hzL, M.REDSTONE);
      }
    }

    // Corner buttresses run the full height and carry a real share of load.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let by = 6.0;
      let bc = 0;
      while (by < SHAFT_TOP) {
        const h = Math.min(course, SHAFT_TOP - by);
        const t = (by - 6.0) / (SHAFT_TOP - 6.0);
        const off = (W / 2 - 0.3) - t * 0.25;
        const bw = 2.1 - t * 0.5;
        B.slab(sx * off, by + h / 2, sz * off, bw, h, bw, stone, M.REDSTONE);
        by += h;
        bc++;
      }
    }
  });

  // ── Clock stage ──────────────────────────────────────────────────────────
  // Four dials, each 7 m across, set in stone surrounds. Glass is by far the
  // weakest material in the game — the dials go early and they go loudly.
  B.section('clock', () => {
    const dialR = 3.5;
    const stageY0 = CLOCK_Y - 4.6;
    const stageY1 = CLOCK_Y + 4.6;
    let y = stageY0;
    let c = 0;
    while (y < stageY1) {
      const h = Math.min(course, stageY1 - y);
      B.ring(0, 0, W + 0.9, W + 0.9, 1.25, y, h, stone, M.REDSTONE, c % 2);
      y += h;
      c++;
    }

    const faceOffset = (W + 0.9) / 2 - 0.2;
    const dialStone = Math.max(0.55, 0.72 * s);
    // Each dial: a disc of glass segments in a gilt frame, on all four faces.
    for (const [ax, az, rot] of [
      [0, 1, 0], [0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, Math.PI / 2],
    ]) {
      const cx = ax * faceOffset;
      const cz = az * faceOffset;
      const nx = Math.round((dialR * 2) / dialStone);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nx; j++) {
          const lx = -dialR + (i + 0.5) * (dialR * 2 / nx);
          const ly = -dialR + (j + 0.5) * (dialR * 2 / nx);
          const r = Math.hypot(lx, ly);
          if (r > dialR) continue;
          const isRim = r > dialR - dialStone * 1.4;
          const mat = isRim ? M.GILT : M.GLASS;
          const hs = dialStone / 2 * 0.94;
          if (ax !== 0) B.add(cx, CLOCK_Y + ly, cz + lx, 0.28, hs, hs, mat);
          else B.add(cx + lx, CLOCK_Y + ly, cz, hs, hs, 0.28, mat);
        }
      }
    }
  });

  // ── Belfry ───────────────────────────────────────────────────────────────
  // Open arcade housing the bells. Structurally this is the tower's weak
  // point: the load of the whole spire lands on eight slender piers.
  B.section('belfry', () => {
    const y0 = CLOCK_Y + 4.6;
    const bw = W + 0.4;
    const CORNICE = 2.2;      // depth of the ring that closes the arcade
    // Corner piers.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let y = y0;
      let c = 0;
      while (y < BELFRY_TOP) {
        const h = Math.min(course, BELFRY_TOP - y);
        B.slab(sx * (bw / 2 - 1.1), y + h / 2, sz * (bw / 2 - 1.1), 2.2, h, 2.2, stone, M.REDSTONE);
        y += h;
        c++;
      }
    }
    // Mid-face piers, thinner. They run the full height of the stage: stopping
    // them short left the cornice above bearing on the four corners alone, and
    // at this size that is a twenty-five metre span carried on nothing.
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let y = y0;
      while (y < BELFRY_TOP - CORNICE) {
        const h = Math.min(course, BELFRY_TOP - CORNICE - y);
        B.slab(sx * (bw / 2 - 0.8), y + h / 2, sz * (bw / 2 - 0.8), 1.3, h, 1.3, stone, M.REDSTONE);
        y += h;
      }
    }
    // Arches spanning between the piers, then the lintel course they carry.
    const archY = BELFRY_TOP - 4.4;
    for (const side of [1, -1]) {
      B.arch(0, archY, side * (bw / 2 - 0.9), 6.4, 1.6, 0.9, Math.max(5, Math.round(9 / s)), M.REDSTONE, 'x');
      B.arch(side * (bw / 2 - 0.9), archY, 0, 6.4, 1.6, 0.9, Math.max(5, Math.round(9 / s)), M.REDSTONE, 'z');
    }
    // The cornice: a continuous ring closing the arcade, bearing on every pier
    // and on the crowns of the arches. This is what the roof slab — and
    // through it the whole spire — actually sits on.
    {
      let y = BELFRY_TOP - CORNICE;
      let c = 0;
      while (y < BELFRY_TOP) {
        const h = Math.min(course, BELFRY_TOP - y);
        B.ring(0, 0, bw, bw, 1.5, y, h, stone, M.REDSTONE, c % 2);
        y += h;
        c++;
      }
    }
    // Belfry roof slab — the mass the spire sits on.
    B.slab(0, BELFRY_TOP + 0.8, 0, bw, 1.6, bw, stone * 1.2, M.REDSTONE);

    // Big Ben: 13.7 tonnes of bell, modelled as a dense iron mass. When the
    // belfry gives way this is what punches through the floors below.
    //
    // It hangs from a headstock rather than floating in the middle of the
    // arcade: two iron beams across the stage, with the bell under them. A
    // mass this dense with nothing over it and nothing under it is a stone the
    // solver has no reason to hold up, and it simply fell out of the tower.
    for (const along of [-1, 1]) {
      B.slab(along * 2.2, BELFRY_TOP - 1.0, 0, 0.9, 0.8, bw - 2.2, stone * 1.6, M.IRON);
    }
    B.slab(0, BELFRY_TOP - 3.0, 0, 2.8, 2.6, 2.8, 1.4 * s, M.IRON);
  });

  // ── Spire ────────────────────────────────────────────────────────────────
  B.section('spire', () => {
    const y0 = BELFRY_TOP + 1.6;
    // Ornate lower stage.
    B.spire(0, 0, y0, y0 + 7.0, 11.4, 8.6, course * 1.1, stone, M.SLATE, 0.34);
    // Main cast-iron spire.
    B.spire(0, 0, y0 + 7.0, SPIRE_TOP - 3.4, 8.6, 1.5, course * 1.2, stone, M.IRON, 0.38);
    // Finial and cross.
    B.slab(0, SPIRE_TOP - 3.0, 0, 1.6, 1.4, 1.6, 0.7 * s, M.GILT);
    B.slab(0, SPIRE_TOP - 1.6, 0, 0.7, 1.8, 0.7, 0.6 * s, M.GILT);
    B.slab(0, SPIRE_TOP - 0.4, 0, 1.5, 0.32, 0.32, 0.5 * s, M.GILT);

    // Corner pinnacles around the spire base.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      B.pinnacle(sx * 5.2, sz * 5.2, y0 + 1.0, 9.0, 2.0, stone, M.REDSTONE);
    }
  });

  return B.scaleAll(TOWER_SCALE);
}

/** The wing's bays, in build space — before `TOWER_SCALE`. */
const WING_WINDOWS = {
  heights: [5.0, 12.0, 19.0],
  first: 6,          // z offset of the first bay from the wing's near end
  spacing: 6,        // bay spacing along the wing
  halfWidth: 1.1,
  halfHeight: 1.5,
  roof: 27,          // parapet height, where the mortar pits go
};

/** The wing's plan, in world metres. As with `TOWER`, the garrison reads this. */
const WING_PLAN = { len: 74, depth: 22, z0: 14, height: 27 };
export const WING = {
  scale: TOWER_SCALE,
  len: WING_PLAN.len * TOWER_SCALE,
  depth: WING_PLAN.depth * TOWER_SCALE,
  z0: WING_PLAN.z0 * TOWER_SCALE,
  height: WING_PLAN.height * TOWER_SCALE,
  windows: {
    heights: WING_WINDOWS.heights.map((h) => h * TOWER_SCALE),
    first: WING_WINDOWS.first * TOWER_SCALE,
    spacing: WING_WINDOWS.spacing * TOWER_SCALE,
    halfWidth: WING_WINDOWS.halfWidth * TOWER_SCALE,
    halfHeight: WING_WINDOWS.halfHeight * TOWER_SCALE,
    roof: WING_WINDOWS.roof * TOWER_SCALE,
  },
};

function wingWindowCutter(z0, len, depth) {
  const { heights, first, spacing, halfWidth, halfHeight } = WING_WINDOWS;
  const faceX = depth / 2 - 1.6;
  return (x, y, z) => {
    if (Math.abs(x) < faceX) return false;      // only the long elevations
    for (const wy of heights) {
      if (y < wy - halfHeight || y > wy + halfHeight) continue;
      for (let bz = z0 + first; bz < z0 + len - 3; bz += spacing) {
        if (Math.abs(z - bz) < halfWidth) return true;
      }
    }
    return false;
  };
}

/**
 * A short wing of the Palace of Westminster butting onto the tower's south
 * face, so the tower doesn't read as a lone obelisk in an empty field. It is
 * fully destructible and shares the tower's support graph at the joint.
 */
export function buildPalaceWing(quality) {
  const B = new BlockList();
  // The wing is part of the same palace, so it takes the same scale and the
  // same stone. A doubled tower butting onto a wing at its old size reads as
  // two buildings from different models.
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.4 * s;
  const course = 1.1 * s;

  B.section('wing', () => {
    const { len, depth, z0, height } = WING_PLAN;

    B.slab(0, -1.0, z0 + len / 2, depth + 4, 2.0, len + 4, stone * 2.0, M.CONCRETE);

    // Three storeys of windows down both long elevations, on the real bay
    // spacing of the Palace. The garrison stands in them.
    const cut = wingWindowCutter(z0, len, depth);
    B.openings(cut, () => {
      let y = 0;
      let c = 0;
      while (y < height) {
        const h = Math.min(course, height - y);
        B.ring(0, z0 + len / 2, depth, len, 1.5, y, h, stone, M.REDSTONE, c % 2);
        y += h; c++;
      }
    });
    // Lintels over the bays.
    for (const wy of WING_WINDOWS.heights) {
      for (let z = z0 + WING_WINDOWS.first; z < z0 + len - 3; z += WING_WINDOWS.spacing) {
        for (const sx of [1, -1]) {
          B.add(sx * (depth / 2 - 0.75), wy + WING_WINDOWS.halfHeight + 0.3, z,
            0.75, 0.28, WING_WINDOWS.halfWidth + 0.7, M.REDSTONE);
          B.add(sx * (depth / 2 - 0.75), wy - WING_WINDOWS.halfHeight - 0.26, z,
            0.75, 0.24, WING_WINDOWS.halfWidth + 0.7, M.REDSTONE);
        }
      }
    }
    // Cross walls every 8 m give the wing real internal structure, and give
    // the roof bearing often enough that it does not rely on spanning.
    for (let zc = z0 + 8; zc < z0 + len; zc += 8) {
      let wy = 0;
      while (wy < height) {
        const h = Math.min(course, height - wy);
        B.slab(0, wy + h / 2, zc, depth - 2.4, h, 1.2, stone, M.BRICK);
        wy += h;
      }
    }
    // Pitched roof.
    // A spine wall down the ridge, so the narrowing upper courses of the roof
    // have something under them rather than relying on the slab below.
    let sy = height;
    while (sy < height + 6.0) {
      const hh = Math.min(course, height + 6.0 - sy);
      B.slab(0, sy + hh / 2, z0 + len / 2, 1.6, hh, len - 2, stone, M.BRICK);
      sy += hh;
    }
    const roofSteps = Math.max(3, Math.round(7 / s));
    for (let i = 0; i < roofSteps; i++) {
      const t = i / roofSteps;
      const w = depth * (1 - t * 0.92);
      B.slab(0, height + 0.6 + i * (6.0 / roofSteps), z0 + len / 2, w, 6.0 / roofSteps, len, stone * 1.2, M.SLATE);
    }
    // Victoria Tower-ish pinnacles along the parapet.
    for (let zc = z0 + 6; zc < z0 + len; zc += 11) {
      for (const sx of [1, -1]) {
        B.pinnacle(sx * (depth / 2 - 0.9), zc, height, 5.0, 1.6, stone, M.REDSTONE);
      }
    }
  });

  return B.scaleAll(TOWER_SCALE);
}
