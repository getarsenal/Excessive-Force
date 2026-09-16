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
  // Ten bays, all below the clock stage. The two that used to sit at 52 and
  // 56 m were cut into shaft masonry hidden inside the stage's own wall, so
  // they were never visible and the men posted in them stood inside stone.
  heights: [12.5, 16.5, 20.5, 24.5, 28.5, 32.5, 36.5, 40.5, 44.5, 48.5],
  halfWidth: 0.85,      // opening is 1.7 m across
  halfHeight: 1.15,     // and 2.3 m tall
  faceInset: 3.0,       // how far out from the axis a wall stone has to be
};

const W = 12.2;              // shaft width, metres
const PLINTH_TOP = 6.0;
const SHAFT_TOP = 61.0;      // the taper's nominal top; the stage takes over below it
const CLOCK_Y = 55.0;
const STAGE_Y0 = CLOCK_Y - 4.6;
const STAGE_Y1 = CLOCK_Y + 5.4;   // a course taller than the dial needs, for the cornice
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

/** The course grid of the shaft: course `k` is centred at this height. */
const SHAFT_Y0 = PLINTH_TOP;
const courseCentre = (k, course) => SHAFT_Y0 + (k + 0.5) * course;
/** The first course whose centre clears `y` going up, and the last below it. */
const courseAbove = (y, course) => Math.ceil((y - SHAFT_Y0) / course - 0.5);
const courseBelow = (y, course) => Math.floor((y - SHAFT_Y0) / course - 0.5);

/** Half-width of the corner buttress and its inner edge, at height `y`. */
const buttressAt = (y) => {
  const t = (y - PLINTH_TOP) / (SHAFT_TOP - PLINTH_TOP);
  const off = (W / 2 - 0.3) - t * 0.25;
  const bw = 2.1 - t * 0.5;
  return { off, bw, inner: off - bw / 2 };
};

/**
 * Where the shaft's masonry is *not* laid: the windows, the slots the lintels
 * and sills go into, and the corners the buttresses fill.
 *
 * The lintel used to be laid over an uncut wall — a stone spanning the bay
 * on top of the stones already there, sharing their volume, its outer face
 * on exactly the plane of the facing. Every lintel on the tower was a patch
 * of wall that flickered between two tints as the camera moved. Now the slot
 * is left in the course grid and the lintel is a course stone that happens to
 * be one piece.
 */
function towerShaftCutter(course) {
  const { heights, halfWidth, halfHeight, faceInset } = TOWER_WINDOWS;
  const span = halfWidth + 0.75;
  return (x, y, z) => {
    const onZ = Math.abs(z) > faceInset, onX = Math.abs(x) > faceInset;
    if (!onZ && !onX) return false;
    const along = onZ ? x : z;
    // The corner buttresses take the corners.
    const b = buttressAt(y);
    if (Math.abs(x) > b.inner && Math.abs(z) > b.inner) return true;
    for (const wy of heights) {
      const k = Math.round((y - SHAFT_Y0) / course - 0.5);
      const kL = courseAbove(wy + halfHeight, course);
      const kS = courseBelow(wy - halfHeight, course);
      if ((k === kL || k === kS) && Math.abs(along) < span) return true;
      if (y < wy - halfHeight || y > wy + halfHeight) continue;
      if (Math.abs(along) < halfWidth) return true;
    }
    return false;
  };
}

/**
 * The facing's ornament, as how far each stone stands proud of the wall.
 *
 * Jambs either side of every window, a string course at each storey, and the
 * hood over each bay. All of it is the wall's own stones laid thicker, which
 * is the only kind of ornament that stays on.
 */
function towerRelief(course) {
  const { heights, halfWidth, halfHeight } = TOWER_WINDOWS;
  const STRINGS = [10.5, 26.5, 42.5];
  return (x, z, y) => {
    const onZ = Math.abs(z) > Math.abs(x);
    const along = onZ ? x : z;
    let e = 0;
    for (const sy of STRINGS) if (Math.abs(y - sy) < course * 0.55) e = Math.max(e, 0.30);
    for (const wy of heights) {
      const a = Math.abs(along);
      if (a > halfWidth + 0.02 && a < halfWidth + 1.05
        && Math.abs(y - wy) < halfHeight + course * 1.6) e = Math.max(e, 0.22);
      // The hood mould: one course over the lintel, a little wider than it.
      if (a < halfWidth + 1.05 && y > wy + halfHeight + course
        && y < wy + halfHeight + course * 2.1) e = Math.max(e, 0.26);
    }
    return e;
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
    // The shaft stops where the clock stage begins. It used to run on inside
    // the stage's own wall to 61 m and into the belfry piers above that —
    // three thousand stones sharing volume with the sleeve around them.
    const relief = towerRelief(course);
    B.openings(towerShaftCutter(course), () => {
      let y = SHAFT_Y0;
      let c = 0;
      while (y < STAGE_Y0) {
        const h = Math.min(course, STAGE_Y0 - y);
        const t = (y - SHAFT_Y0) / (SHAFT_TOP - SHAFT_Y0);
        // Walls thin as they rise, like the real tower.
        const wall = 2.3 - t * 1.4;
        const w = W - t * 0.5;
        const yc = y + h / 2;

        // Structural brick ring, its outer face exactly on the facing's inner
        // one. Five centimetres of overlap used to put the brick's face just
        // behind the stone's — close enough to show through it from the
        // default camera as a flicker of orange.
        B.ring(0, 0, w - 1.1, w - 1.1, wall, y, h, stone, M.BRICK, c % 2);
        // Limestone facing, half a course out of phase with the core.
        B.ring(0, 0, w, w, 0.55, y, h, stone * 0.9, M.REDSTONE, (c + 1) % 2,
          (x, z) => relief(x, z, yc));

        y += h;
        c++;
      }
    });

    // Lintel, sill and mullion for every opening. The lintel is one stone
    // spanning the whole bay, so the courses above it bear on masonry rather
    // than relying on the solver's lateral spanning — and it is a single point
    // of failure the player can aim at, which is the point of having one.
    //
    // Both are laid in the course grid, in the slot the cutter left for them,
    // and stand a little proud of the face: a dressed surround, and no two
    // faces on the same plane.
    //
    // The mullion is the bar up the middle, and it is not decoration. Openings
    // are cut by dropping the stones whose centres fall inside the box, so a
    // coarse tier blooms a 3.4 m window into a six-metre hole, and a hole that
    // wide on two opposite faces is a clear line straight through a hollow
    // tower. Which faces bloomed and which did not came down to where the
    // course grid happened to fall, so the same building was see-through at one
    // quality setting and solid at another. A stone standing on the bay's
    // centre line settles it at every tier: there is always masonry on the
    // axis, and the two lights either side are what the garrison shoots from.
    const { heights, halfWidth, halfHeight } = TOWER_WINDOWS;
    const MULLION = 0.30;      // half-width, so 0.6 m on the drawing
    // Further out than the jambs beside them, so where a sill's end and a
    // jamb stone share a few centimetres their faces are on different planes.
    const PROUD = 0.32;
    for (const wy of heights) {
      const span = halfWidth + 0.75;
      for (const k of [courseAbove(wy + halfHeight, course), courseBelow(wy - halfHeight, course)]) {
        const yc = courseCentre(k, course);
        const t = (yc - course / 2 - SHAFT_Y0) / (SHAFT_TOP - SHAFT_Y0);
        const wall = 2.3 - t * 1.4;
        const w = W - t * 0.5;
        const hy = course / 2 - 0.015;
        for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          // The brick half of the slot, then the facing half standing proud.
          const offB = (w - 1.1) / 2 - wall / 2;
          B.add(ax * offB, yc, az * offB,
            ax !== 0 ? wall / 2 : span, hy, ax !== 0 ? span : wall / 2, M.BRICK);
          const offF = w / 2 - 0.275 + PROUD / 2;
          B.add(ax * offF, yc, az * offF,
            ax !== 0 ? 0.275 + PROUD / 2 : span, hy,
            ax !== 0 ? span : 0.275 + PROUD / 2, M.REDSTONE);
        }
      }
      const t = (wy - SHAFT_Y0) / (SHAFT_TOP - SHAFT_Y0);
      const wall = 2.3 - t * 1.4;
      const w = W - t * 0.5;
      // From the top of the sill to the underside of the lintel, so it stands
      // on the one and carries the other whatever the course grid does.
      const sillTop = courseCentre(courseBelow(wy - halfHeight, course), course) + course / 2;
      const lintelBot = courseCentre(courseAbove(wy + halfHeight, course), course) - course / 2;
      for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const off = (w - wall) / 2;
        // Between the two, and thin enough to sit inside the narrowest hole
        // any tier cuts — one stone straddling the axis is the whole point.
        B.add(ax * off, (sillTop + lintelBot) / 2, az * off,
          ax !== 0 ? wall * 0.42 : MULLION, (lintelBot - sillTop) / 2 - 0.012,
          ax !== 0 ? MULLION : wall * 0.42, M.REDSTONE);
      }
    }

    // Corner buttresses run the full height and carry a real share of load.
    // Toothed: alternate courses a hand wider, which is what quoins are.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let by = SHAFT_Y0;
      let bc = 0;
      while (by < STAGE_Y0) {
        const h = Math.min(course, STAGE_Y0 - by);
        const b = buttressAt(by + h / 2);
        const tooth = bc % 2 ? 0.14 : -0.14;
        const bw = b.bw + tooth;
        // Grows outward only: the inner edge stays on the cutter's line.
        const off = b.inner + bw / 2;
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
    const stageY0 = STAGE_Y0;
    const stageY1 = STAGE_Y1;
    const SW = W + 0.9;
    // The dial sits in a hole in the stage, not on top of it, with a proud
    // surround of stone round it and a corbelled cornice closing the stage.
    // With a lintel course over each hole, one stone spanning it, so the
    // stage above bears on masonry rather than on the glass.
    const kLintel = Math.ceil((CLOCK_Y + dialR - stageY0) / course - 0.5);
    const LSPAN = dialR + 0.7;
    const dialHole = (x, y, z) => {
      const onZ = Math.abs(z) > SW / 2 - 1.7, onX = Math.abs(x) > SW / 2 - 1.7;
      if (!onZ && !onX) return false;
      const along = onZ ? x : z;
      if (Math.round((y - stageY0) / course - 0.5) === kLintel) return Math.abs(along) < LSPAN;
      return Math.hypot(along, y - CLOCK_Y) < dialR + 0.05;
    };
    for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const off = SW / 2 - 0.8 + 0.22;
      B.add(ax * off, stageY0 + (kLintel + 0.5) * course, az * off,
        ax !== 0 ? 1.02 : LSPAN, course / 2 - 0.015, ax !== 0 ? LSPAN : 1.02, M.REDSTONE);
    }
    B.openings(dialHole, () => {
      let y = stageY0;
      let c = 0;
      while (y < stageY1) {
        const h = Math.min(course, stageY1 - y);
        const yc = y + h / 2;
        // As thick as the brick and the facing it replaces, since the whole
        // belfry and spire now come down through it.
        B.ring(0, 0, SW, SW, 1.6, y, h, stone, M.REDSTONE, c % 2, (x, z) => {
          const r = Math.hypot(Math.abs(z) > Math.abs(x) ? x : z, yc - CLOCK_Y);
          if (r > dialR && r < dialR + 1.1) return 0.32;
          if (yc > stageY1 - course * 1.05) return 0.45;   // cornice
          if (yc < stageY0 + course * 1.05) return 0.25;   // base band
          return 0;
        });
        y += h;
        c++;
      }
    });

    const faceOffset = SW / 2 - 0.2;
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
    const y0 = STAGE_Y1;
    const bw = W + 0.4;
    const CORNICE = 2.2;      // depth of the ring that closes the arcade
    // Corner piers.
    // Up to the cornice, which then sits on them: run through it and the two
    // share the corner's volume.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let y = y0;
      let c = 0;
      while (y < BELFRY_TOP - CORNICE) {
        const h = Math.min(course, BELFRY_TOP - CORNICE - y);
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
    //
    // Set low enough that the crown clears the cornice above. A 6.4 m arch
    // springing 4.4 m below the belfry top crests 1 m *inside* the cornice,
    // and two stones sharing a cubic metre is how ten blocks of it ended up
    // starting the level detached.
    // Wide enough to land on the corner piers. A 6.4 m arch between piers
    // 10.4 m apart puts both feet in the middle of an opening, and the
    // voussoirs near the crown then have nothing holding them up at all.
    const pier = bw / 2 - 1.1;
    // The crown — springing plus radius plus the ring's own thickness — has
    // to clear the underside of the cornice, not just the springing.
    const archY = BELFRY_TOP - CORNICE - pier - 0.9 - 0.15;
    for (const side of [1, -1]) {
      B.arch(0, archY, side * (bw / 2 - 0.9), pier * 2, 1.6, 0.9,
        Math.max(5, Math.round(9 / s)), M.REDSTONE, 'x');
      B.arch(side * (bw / 2 - 0.9), archY, 0, pier * 2, 1.6, 0.9,
        Math.max(5, Math.round(9 / s)), M.REDSTONE, 'z');
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
      B.slab(along * 2.2, BELFRY_TOP - 1.0, 0, 0.9, 0.8, bw - 3.1, stone * 1.6, M.IRON);
    }
    B.slab(0, BELFRY_TOP - 3.0, 0, 2.8, 2.6, 2.8, 1.4 * s, M.IRON);
  });

  // ── Spire ────────────────────────────────────────────────────────────────
  B.section('spire', () => {
    const y0 = BELFRY_TOP + 1.6;
    // Ornate lower stage, with a lucarne on each face: four courses of the
    // roof laid a metre proud, which from the ground is a gabled dormer.
    // Narrow enough that the corner pinnacles stand beside it on the belfry
    // roof rather than inside its wall.
    B.spire(0, 0, y0, y0 + 7.0, 9.6, 8.6, course * 1.1, stone, M.SLATE, 0.34,
      (x, z, y, c) => {
        const along = Math.abs(z) > Math.abs(x) ? x : z;
        return c < 4 && Math.abs(along) < 1.3 ? 1.0 - c * 0.12 : 0;
      });
    // Main cast-iron spire, with a rib up each corner.
    B.spire(0, 0, y0 + 7.0, SPIRE_TOP - 3.4, 8.6, 1.5, course * 1.2, stone, M.IRON, 0.38,
      (x, z) => {
        const a = Math.abs(x), b = Math.abs(z);
        return Math.abs(a - b) < 0.45 && Math.max(a, b) > 1.6 ? 0.22 : 0;
      });
    // Finial and cross, each piece standing on the one below.
    B.slab(0, SPIRE_TOP - 2.7, 0, 1.6, 1.4, 1.6, 0.7 * s, M.GILT);
    B.slab(0, SPIRE_TOP - 1.1, 0, 0.7, 1.8, 0.7, 0.6 * s, M.GILT);
    B.slab(0, SPIRE_TOP - 0.04, 0, 1.5, 0.32, 0.32, 0.5 * s, M.GILT);

    // Corner pinnacles around the spire base, on the belfry roof.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      B.pinnacle(sx * 5.5, sz * 5.5, y0, 9.0, 1.6, stone, M.REDSTONE);
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

/** The wing's bay centres along its length. */
function wingBays(z0, len) {
  const out = [];
  for (let bz = z0 + WING_WINDOWS.first; bz < z0 + len - 3; bz += WING_WINDOWS.spacing) out.push(bz);
  return out;
}

/**
 * Windows, and the slots for their lintels and sills, on the long elevations.
 * The wing's course grid starts at the ground, so course `k` is centred at
 * `(k + 0.5) * course`.
 */
function wingWindowCutter(z0, len, depth, course) {
  const { heights, halfWidth, halfHeight } = WING_WINDOWS;
  const faceX = depth / 2 - 1.6;
  const bays = wingBays(z0, len);
  return (x, y, z) => {
    if (Math.abs(x) < faceX) return false;      // only the long elevations
    const k = Math.round(y / course - 0.5);
    for (const wy of heights) {
      const kL = Math.ceil((wy + halfHeight) / course - 0.5);
      const kS = Math.floor((wy - halfHeight) / course - 0.5);
      const slot = k === kL || k === kS;
      const light = y > wy - halfHeight && y < wy + halfHeight;
      if (!slot && !light) continue;
      for (const bz of bays) {
        if (Math.abs(z - bz) < (slot ? halfWidth + 0.7 : halfWidth)) return true;
      }
    }
    return false;
  };
}

/**
 * The Palace's own ornament: pilasters between the bays, jambs round each
 * window, a string course at each floor, a battered plinth and a corbelled
 * cornice under the parapet. As on the tower, every bit of it is a wall stone
 * laid thicker.
 */
function wingRelief(z0, len, depth, height, course) {
  const { heights, halfWidth, halfHeight, spacing } = WING_WINDOWS;
  const bays = wingBays(z0, len);
  const faceX = depth / 2 - 1.6;
  return (x, z, y) => {
    let e = 0;
    if (y < 2.2) e = Math.max(e, 0.40);                                   // plinth
    if (y > height - 0.05) e = Math.max(e, 0.55);                          // cornice
    for (const sy of [9.0, 16.0]) if (Math.abs(y - sy) < course * 0.55) e = Math.max(e, 0.30);
    if (Math.abs(x) < faceX) return e;        // the ends carry only the bands
    for (const bz of bays) {
      const dz = Math.abs(z - bz);
      if (dz > halfWidth + 0.02 && dz < halfWidth + 0.95) {
        for (const wy of heights) {
          if (Math.abs(y - wy) < halfHeight + course * 1.6) e = Math.max(e, 0.22);
        }
      }
      // Pilaster strip midway to the next bay, full height.
      if (Math.abs(z - (bz + spacing / 2)) < 0.65 && y < height - 0.05) e = Math.max(e, 0.36);
    }
    return e;
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
    //
    // The wall runs two courses above the roof line as a parapet, which is
    // what the pinnacles stand on and what hides the foot of the roof.
    const PARAPET = course * 2;
    const relief = wingRelief(z0, len, depth, height, course);
    const cut = wingWindowCutter(z0, len, depth, course);
    B.openings(cut, () => {
      let y = 0;
      let c = 0;
      while (y < height + PARAPET) {
        const h = Math.min(course, height + PARAPET - y);
        const yc = y + h / 2;
        B.ring(0, z0 + len / 2, depth, len, 1.5, y, h, stone, M.REDSTONE, c % 2,
          (x, z) => relief(x, z, yc));
        y += h; c++;
      }
    });
    // Lintels and sills, in their slots, standing proud of the face — and
    // further out than the jambs, so the two never share a plane.
    const PROUD = 0.32;
    for (const wy of WING_WINDOWS.heights) {
      const kL = Math.ceil((wy + WING_WINDOWS.halfHeight) / course - 0.5);
      const kS = Math.floor((wy - WING_WINDOWS.halfHeight) / course - 0.5);
      for (const bz of wingBays(z0, len)) {
        for (const sx of [1, -1]) {
          for (const k of [kL, kS]) {
            B.add(sx * (depth / 2 - 0.75 + PROUD / 2), (k + 0.5) * course, bz,
              0.75 + PROUD / 2, course / 2 - 0.015, WING_WINDOWS.halfWidth + 0.7, M.REDSTONE);
          }
        }
      }
    }
    // Cross walls every 8 m give the wing real internal structure, and give
    // the roof bearing often enough that it does not rely on spanning. They
    // meet the outer walls exactly, rather than running into them.
    for (let zc = z0 + 8; zc < z0 + len; zc += 8) {
      let wy = 0;
      while (wy < height) {
        const h = Math.min(course, height - wy);
        B.slab(0, wy + h / 2, zc, depth - 3.0, h, 1.2, stone, M.BRICK);
        wy += h;
      }
    }
    // Pitched roof, set inside the parapet.
    // A spine wall down the ridge, so the narrowing upper courses of the roof
    // have something under them rather than relying on the slab below. The
    // roof is laid round it, not through it.
    const ROOF_H = 6.0;
    let sy = height;
    while (sy < height + ROOF_H) {
      const hh = Math.min(course, height + ROOF_H - sy);
      B.slab(0, sy + hh / 2, z0 + len / 2, 1.6, hh, len - 3.4, stone, M.BRICK);
      sy += hh;
    }
    const roofSteps = Math.max(3, Math.round(7 / s));
    const inner = depth - 3.2;
    B.openings((x) => Math.abs(x) < 0.8 + 0.01, () => {
      for (let i = 0; i < roofSteps; i++) {
        const t = i / roofSteps;
        const w = inner * (1 - t * 0.92);
        B.slab(0, height + (i + 0.5) * (ROOF_H / roofSteps), z0 + len / 2,
          w, ROOF_H / roofSteps, len - 3.4, stone * 1.2, M.SLATE);
      }
    });
    // Victoria Tower-ish pinnacles, on the parapet.
    for (let zc = z0 + 6; zc < z0 + len; zc += 11) {
      for (const sx of [1, -1]) {
        B.pinnacle(sx * (depth / 2 - 0.75), zc, height + PARAPET, 5.0, 1.5, stone, M.REDSTONE);
      }
    }
  });

  return B.scaleAll(TOWER_SCALE);
}
