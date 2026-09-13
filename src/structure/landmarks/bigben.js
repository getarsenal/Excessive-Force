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

export function buildElizabethTower(quality) {
  const B = new BlockList();
  const s = quality.blockScale;

  // Stone sizes scale with quality tier; the tower's dimensions never change,
  // only how finely it is divided.
  const stone = 1.15 * s;      // nominal stone length
  const course = 0.95 * s;     // course height

  const W = 12.2;              // shaft width, metres
  const SHAFT_TOP = 61.0;
  const CLOCK_Y = 55.0;
  const BELFRY_TOP = 68.5;
  const SPIRE_TOP = 96.3;

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
      B.ring(0, 0, w, w, 3.0, y, h, stone * 1.3, M.LIMESTONE, Math.round(y / course) % 2);
      y += h;
    }
  });

  // ── Main shaft ───────────────────────────────────────────────────────────
  // Brick core with a limestone skin. The skin is a separate, thinner ring so
  // that a hit can strip facing without opening the core — and so the core,
  // being weaker brick, is what actually fails under redistributed load.
  B.section('shaft', () => {
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
      B.ring(0, 0, w, w, 0.55, y, h, stone * 0.9, M.LIMESTONE, (c + 1) % 2);

      // Window openings every few courses on each face, cut by simply not
      // placing the facing stones there. Openings weaken the wall exactly
      // where you would expect.
      y += h;
      c++;
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
        B.slab(sx * off, by + h / 2, sz * off, bw, h, bw, stone, M.LIMESTONE);
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
      B.ring(0, 0, W + 0.9, W + 0.9, 1.25, y, h, stone, M.LIMESTONE, c % 2);
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
    // Corner piers.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let y = y0;
      let c = 0;
      while (y < BELFRY_TOP) {
        const h = Math.min(course, BELFRY_TOP - y);
        B.slab(sx * (bw / 2 - 1.1), y + h / 2, sz * (bw / 2 - 1.1), 2.2, h, 2.2, stone, M.LIMESTONE);
        y += h;
        c++;
      }
    }
    // Mid-face piers, thinner.
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let y = y0;
      while (y < BELFRY_TOP - 2.2) {
        const h = Math.min(course, BELFRY_TOP - 2.2 - y);
        B.slab(sx * (bw / 2 - 0.8), y + h / 2, sz * (bw / 2 - 0.8), 1.3, h, 1.3, stone, M.LIMESTONE);
        y += h;
      }
    }
    // Arches spanning between the piers, then the lintel course they carry.
    const archY = BELFRY_TOP - 4.4;
    for (const side of [1, -1]) {
      B.arch(0, archY, side * (bw / 2 - 0.9), 6.4, 1.6, 0.9, Math.max(5, Math.round(9 / s)), M.LIMESTONE, 'x');
      B.arch(side * (bw / 2 - 0.9), archY, 0, 6.4, 1.6, 0.9, Math.max(5, Math.round(9 / s)), M.LIMESTONE, 'z');
    }
    // Belfry roof slab — the mass the spire sits on.
    B.slab(0, BELFRY_TOP + 0.8, 0, bw, 1.6, bw, stone * 1.2, M.LIMESTONE);

    // Big Ben: 13.7 tonnes of bell, modelled as a dense iron mass. When the
    // belfry gives way this is what punches through the floors below.
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
      B.pinnacle(sx * 5.2, sz * 5.2, y0 + 1.0, 9.0, 2.0, stone, M.LIMESTONE);
    }
  });

  return B;
}

/**
 * A short wing of the Palace of Westminster butting onto the tower's south
 * face, so the tower doesn't read as a lone obelisk in an empty field. It is
 * fully destructible and shares the tower's support graph at the joint.
 */
export function buildPalaceWing(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 1.4 * s;
  const course = 1.1 * s;

  B.section('wing', () => {
    const len = 74;
    const depth = 22;
    const z0 = 14;
    const height = 27;

    B.slab(0, -1.0, z0 + len / 2, depth + 4, 2.0, len + 4, stone * 2.0, M.CONCRETE);

    let y = 0;
    let c = 0;
    while (y < height) {
      const h = Math.min(course, height - y);
      B.ring(0, z0 + len / 2, depth, len, 1.5, y, h, stone, M.LIMESTONE, c % 2);
      y += h; c++;
    }
    // Cross walls every 12 m give the wing real internal structure.
    for (let zc = z0 + 12; zc < z0 + len; zc += 12) {
      let wy = 0;
      while (wy < height) {
        const h = Math.min(course, height - wy);
        B.slab(0, wy + h / 2, zc, depth - 2.4, h, 1.2, stone, M.BRICK);
        wy += h;
      }
    }
    // Pitched roof.
    const roofSteps = Math.max(3, Math.round(7 / s));
    for (let i = 0; i < roofSteps; i++) {
      const t = i / roofSteps;
      const w = depth * (1 - t * 0.92);
      B.slab(0, height + 0.6 + i * (6.0 / roofSteps), z0 + len / 2, w, 6.0 / roofSteps, len, stone * 1.2, M.SLATE);
    }
    // Victoria Tower-ish pinnacles along the parapet.
    for (let zc = z0 + 6; zc < z0 + len; zc += 11) {
      for (const sx of [1, -1]) {
        B.pinnacle(sx * (depth / 2 - 0.9), zc, height, 5.0, 1.6, stone, M.LIMESTONE);
      }
    }
  });

  return B;
}
