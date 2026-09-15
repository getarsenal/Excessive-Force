import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Eiffel Tower, built from its real dimensions.
 *
 * Reference figures (Société d'Exploitation de la Tour Eiffel, published):
 *   height to the tip            330 m with the broadcast mast
 *   height to the third floor    276 m
 *   second floor                 116 m, deck 35 m square
 *   first floor                  57 m, deck 65 m square
 *   base                         125 m square between the outer piers
 *   wrought iron                 7,300 t in 18,038 pieces
 *
 * This is the first landmark in the game that is not masonry, and it wants
 * building the opposite way round. A stone tower is a shell: you model the
 * walls and the openings are what is left over. A lattice is a frame: there is
 * no wall at all, only members, and if you build it as a hollow box with thin
 * sides it reads from any distance as a solid tapering chimney — which is
 * exactly what the first attempt looked like.
 *
 * So every leg here is four corner posts, tied at intervals by horizontals and
 * braced by diagonals, with nothing in between. That is more work per metre of
 * height than a ring, and it is the whole point: you can see the sky through
 * it, and the thing that fails when you shoot it is a member rather than a
 * patch of wall.
 *
 * Diagonals are stepped rather than rotated. `BlockList.add` yaws a stone but
 * cannot pitch one, so a brace running up and across is laid as a short
 * staircase of boxes. At this scale the steps read as rivetted segments, which
 * is close enough to what is actually there.
 */

/** Where a leg's centre and cross-section are at height `y`. */
const PROFILE = [
  // [height, distance of leg centre from the axis, leg half-width]
  [0, 51.0, 12.5],
  [30, 41.0, 10.6],
  [57, 31.5, 8.8],        // first floor
  [85, 22.0, 7.0],
  [116, 13.5, 5.6],       // second floor, where the legs have merged
];

export const EIFFEL = {
  firstFloor: 57,
  secondFloor: 116,
  thirdFloor: 276,
  tip: 330,
  baseHalf: 62.5,
  firstDeckHalf: 32.5,
  secondDeckHalf: 17.5,
  thirdDeckHalf: 8.0,
};

/** Linear interpolation down the leg profile table. */
function legAt(y) {
  const P = PROFILE;
  if (y <= P[0][0]) return { r: P[0][1], h: P[0][2] };
  for (let i = 0; i < P.length - 1; i++) {
    if (y <= P[i + 1][0]) {
      const t = (y - P[i][0]) / (P[i + 1][0] - P[i][0]);
      return {
        r: P[i][1] + (P[i + 1][1] - P[i][1]) * t,
        h: P[i][2] + (P[i + 1][2] - P[i][2]) * t,
      };
    }
  }
  return { r: P[P.length - 1][1], h: P[P.length - 1][2] };
}

/** Half-width of the upper shaft, which tapers from the second floor to the top. */
function shaftHalf(y) {
  const t = (y - EIFFEL.secondFloor) / (EIFFEL.thirdFloor - EIFFEL.secondFloor);
  // Concave, like the legs below it.
  return 13.5 + (4.6 - 13.5) * Math.pow(Math.max(0, Math.min(1, t)), 0.78);
}

export function buildEiffelTower(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const member = 1.5 * s;        // nominal length of one iron member
  const post = 1.5;              // posts are 3 m square in section

  /** A vertical run of posts from y0 to y1 at (x, z), tapering with the frame. */
  const column = (xOf, zOf, y0, y1, halfOf, mat = M.IRON) => {
    let y = y0;
    while (y < y1 - 0.001) {
      const h = Math.min(member * 1.6, y1 - y);
      const yc = y + h / 2;
      const w = halfOf ? halfOf(yc) : post;
      B.add(xOf(yc), yc, zOf(yc), w, h / 2 - 0.02, w, mat);
      y += h;
    }
  };

  /** A horizontal tie between two points at one height. */
  const tie = (x0, z0, x1, z1, y, thick = 0.7) => {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const ry = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(len / (member * 2.2)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      B.add(x0 + dx * t, y, z0 + dz * t, thick, thick, len / (2 * n) - 0.03, M.IRON, ry);
    }
  };

  /**
   * A brace running from (x0, z0, y0) up to (x1, z1, y1), laid as a staircase.
   * Steps overlap so consecutive boxes touch and the brace carries load.
   */
  const brace = (x0, z0, y0, x1, z1, y1, thick = 0.62) => {
    const steps = Math.max(3, Math.round((y1 - y0) / (member * 1.9)));
    const dx = (x1 - x0) / steps, dz = (z1 - z0) / steps, dy = (y1 - y0) / steps;
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const segLen = Math.hypot(dx, dz) / 2 + thick;
    for (let i = 0; i < steps; i++) {
      B.add(x0 + dx * (i + 0.5), y0 + dy * (i + 0.5), z0 + dz * (i + 0.5),
        thick, Math.abs(dy) / 2 + thick * 0.5, segLen, M.IRON, ry);
    }
  };

  // ── Foundations ──────────────────────────────────────────────────────────
  // Four separate concrete blocks, one per pier, exactly as built. They are
  // separate on purpose: the legs are four independent structures below the
  // first floor, and that is what lets one of them be cut out from under the
  // tower.
  B.section('foundation', () => {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const { r, h } = legAt(0);
      B.slab(sx * r, -1.6, sz * r, h * 2 + 7, 3.2, h * 2 + 7, member * 2.4, M.CONCRETE);
    }
  });

  // ── The four legs ────────────────────────────────────────────────────────
  B.section('legs', () => {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      // The four corner posts of this leg, as functions of height so they
      // follow the batter all the way up.
      const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [cx, cz] of corners) {
        column(
          (y) => sx * legAt(y).r + cx * legAt(y).h,
          (y) => sz * legAt(y).r + cz * legAt(y).h,
          0, EIFFEL.secondFloor,
          (y) => post * (1 - (y / EIFFEL.secondFloor) * 0.35),
        );
      }

      // Tie and brace every bay. The bays get shorter as the leg narrows,
      // which is both what the real tower does and what keeps the lattice
      // looking like lattice rather than like a ladder.
      const BAY = 9.0;
      for (let y = BAY; y < EIFFEL.secondFloor; y += BAY) {
        const a = legAt(y), b = legAt(Math.min(EIFFEL.secondFloor, y + BAY));
        const pt = (g, cx, cz) => ({ x: sx * g.r + cx * g.h, z: sz * g.r + cz * g.h });
        // Horizontal ring of ties round the leg.
        for (const [c0, c1] of [[[1, 1], [1, -1]], [[1, -1], [-1, -1]],
          [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]]]) {
          const p0 = pt(a, c0[0], c0[1]), p1 = pt(a, c1[0], c1[1]);
          tie(p0.x, p0.z, p1.x, p1.z, y);
          // And an X across that face, up to the next ring.
          if (y + BAY <= EIFFEL.secondFloor) {
            const q0 = pt(b, c0[0], c0[1]), q1 = pt(b, c1[0], c1[1]);
            brace(p0.x, p0.z, y, q1.x, q1.z, y + BAY);
            brace(p1.x, p1.z, y, q0.x, q0.z, y + BAY);
          }
        }
      }
    }
  });

  // ── The great arches ─────────────────────────────────────────────────────
  // Decorative rather than structural on the real tower, and decorative here
  // too — but they are the silhouette everyone knows, and without them the
  // base reads as four unrelated pylons.
  B.section('arches', () => {
    // Springing low, where the legs are widest, and set on the *inner* corner
    // posts rather than on the leg centrelines. An arch centred between two
    // posts lands on neither of them: the first cut of this sprang from 40 m
    // with its feet in mid-air, and eight of its voussoirs fell out of the
    // tower on the first frame. Here each foot sits exactly on the inner post,
    // so the ring bears the way an arch is supposed to.
    const y = 10;
    const g = legAt(y);
    const inner = g.r - g.h;
    for (const side of [1, -1]) {
      B.arch(0, y, side * inner, inner * 2, 2.6, 1.5,
        Math.max(9, Math.round(15 / s)), M.IRON, 'x');
      B.arch(side * inner, y, 0, inner * 2, 2.6, 1.5,
        Math.max(9, Math.round(15 / s)), M.IRON, 'z');
    }
  });

  // ── First floor ──────────────────────────────────────────────────────────
  // A square gallery, open in the middle: the deck is a ring, not a plate.
  B.section('first', () => {
    const Y = EIFFEL.firstFloor;
    const g = legAt(Y);
    // Out to the leg's outer posts, in past its inner ones, so the gallery
    // bears on the ironwork along both edges.
    const oh = Math.max(EIFFEL.firstDeckHalf, g.r + g.h + 1.0);
    const ih = g.r - g.h - 1.4;
    deck(B, Y, oh, ih, member, s);
    // Pavilions round the gallery — the restaurants, in glass and iron.
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = sx * (oh - 6.0), cz = sz * (oh - 6.0);
      const w = sx !== 0 ? 9 : 20, d = sx !== 0 ? 20 : 9;
      B.slab(cx, Y + 3.4, cz, w, 0.5, d, member * 1.8, M.IRON);
      // Six posts, not four: the long side of a pavilion is twenty metres, and
      // a roof plate spanning that on its corners alone is a plate resting on
      // nothing for most of its length.
      const longAxis = sx !== 0 ? 'z' : 'x';
      for (const e0 of [-1, 0, 1]) {
        for (const e1 of [-1, 1]) {
          const along = e0 * ((longAxis === 'z' ? d : w) / 2 - 0.7);
          const across = e1 * ((longAxis === 'z' ? w : d) / 2 - 0.7);
          const px = cx + (longAxis === 'z' ? across : along);
          const pz = cz + (longAxis === 'z' ? along : across);
          column(() => px, () => pz, Y, Y + 3.4, () => 0.5);
        }
      }
      // Clear of the corner columns on every side. Glazing that shares a few
      // centimetres with the post beside it is two bodies interpenetrating,
      // and the solver's answer to that is to throw one of them off the
      // building — which is how three panes ended up on the Champ de Mars.
      B.slab(cx, Y + 1.25, cz, w - 3.4, 2.5, d - 3.4, member * 2.2, M.GLASS);
    }
    balustrade(B, Y, oh, member);
  });

  // ── Second floor ─────────────────────────────────────────────────────────
  B.section('second', () => {
    const Y = EIFFEL.secondFloor;
    const oh = EIFFEL.secondDeckHalf;
    // The deck has to reach the legs, and the legs at this height are not
    // where the platform's published dimensions suggest. `legAt(116).r` is
    // 13.5 m *along each axis*, so a leg's own posts stand at 7.9 m and 19.1 m
    // out. A 35 m square deck — 8 m to 17.5 m — threads exactly between the
    // two and lands on neither, which is why the entire upper shaft was
    // hanging off the restaurant's glazing instead.
    const g = legAt(Y);
    // Solid, not a ring. This is the deck the whole upper shaft stands on, and
    // a ring deck is a set of strips with gaps between them: the shaft's four
    // corners have to land on plate, and threading them between two strips is
    // how a hundred and sixty metres of tower ended up bearing on the
    // restaurant's glazing. The real second platform is largely closed anyway.
    deck(B, Y, Math.max(oh, g.r + g.h + 1.0), 0, member, s);
    B.slab(0, Y + 2.2, 0, 14, 4.4, 14, member * 2.0, M.GLASS);
    balustrade(B, Y, oh, member);
  });

  // ── The upper shaft ──────────────────────────────────────────────────────
  // One frame now rather than four legs: above the second floor the tower is a
  // single tapering lattice, which is why losing a leg below is so much worse
  // than losing anything above.
  B.section('shaft', () => {
    const y0 = EIFFEL.secondFloor, y1 = EIFFEL.thirdFloor;
    // A closed caisson, not four free-standing posts.
    //
    // Above the second platform the real tower is a single braced box, and it
    // has to be one here too. Built as four bare corner posts it would not
    // stand: the bearing chain up a column of 2.3 m blocks stepping inward a
    // couple of centimetres a course kept breaking three courses above the
    // deck, and a thousand and twenty-eight stones — everything above 124 m —
    // started the level detached. A thin ring gives every course a continuous
    // seat on the one below it, which is what a caisson is for.
    //
    // The lattice is still lattice: the ring is under a metre thick against a
    // box twenty-seven metres across at the bottom, so it reads as a frame,
    // and the ties and braces below still carry the eye.
    // A constant wall. Thickening it where it meets the platform sounds right
    // and measures worse: the extra mass lands on deck plate that was already
    // at its limit, and sixty-eight stones of the platform give way instead of
    // eleven of the caisson.
    B.tower(0, 0, y0, y1,
      (t, y) => shaftHalf(y) * 2,
      () => 0.85,
      member * 1.6, member, () => M.IRON);

    // Bracing across each face, for the look of the thing.
    const BAY = 10.0;
    for (let y = y0 + BAY; y < y1 - BAY; y += BAY) {
      const ha = shaftHalf(y) - 0.7, hb = shaftHalf(y + BAY) - 0.7;
      const ring = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const c0 = ring[i], c1 = ring[(i + 1) % 4];
        brace(c0[0] * ha, c0[1] * ha, y, c1[0] * hb, c1[1] * hb, y + BAY, 0.5);
        brace(c1[0] * ha, c1[1] * ha, y, c0[0] * hb, c0[1] * hb, y + BAY, 0.5);
      }
    }
  });

  // ── Third floor, lantern and mast ────────────────────────────────────────
  B.section('summit', () => {
    const Y = EIFFEL.thirdFloor;
    const oh = EIFFEL.thirdDeckHalf;
    deck(B, Y, oh, 0, member, s);
    // The glazed observation room, and Eiffel's own apartment above it.
    B.slab(0, Y + 2.2, 0, 11, 4.4, 11, member * 1.8, M.GLASS);
    B.slab(0, Y + 4.7, 0, 12, 0.7, 12, member * 1.8, M.IRON);
    // The lantern.
    B.spire(0, 0, Y + 5.0, Y + 18, 9.0, 3.0, member * 1.5, member, M.IRON, 0.5);
    B.slab(0, Y + 19.5, 0, 3.4, 3.0, 3.4, member, M.IRON);
    // The broadcast mast, up to 330 m.
    let y = Y + 21;
    while (y < EIFFEL.tip - 6) {
      const t = (y - Y) / (EIFFEL.tip - Y);
      const w = 1.5 * (1 - t * 0.55);
      B.slab(0, y + 1.2, 0, w, 2.4, w, member, M.IRON);
      y += 2.4;
    }
    for (let k = 0; k < 4; k++) {
      B.slab(0, EIFFEL.tip - 5 + k * 1.5, 0, 0.9 - k * 0.15, 1.5, 0.9 - k * 0.15,
        member, M.IRON);
    }
  });

  return B;
}

/** A square gallery deck: a ring of plate between `ih` and `oh` half-widths. */
function deck(B, y, oh, ih, member, s) {
  const step = Math.max(2.4, member * 2.2);
  const n = Math.max(2, Math.round((oh - Math.max(0, ih)) / step));
  if (ih <= 0.5) {
    // Solid plate — the summit deck, and the second platform the whole upper
    // tower stands on. Kept thin: thickening it to a girder deck pushed its
    // underside down into the tops of the legs, and sixty-one stones of deck
    // then spent the first frame shoving at the ironwork holding them up.
    B.slab(0, y - 0.45, 0, oh * 2, 0.9, oh * 2, step, M.IRON);
    return;
  }
  for (let i = 0; i < n; i++) {
    const r0 = ih + (oh - ih) * (i / n);
    const r1 = ih + (oh - ih) * ((i + 1) / n);
    const mid = (r0 + r1) / 2, wide = r1 - r0;
    for (const side of [1, -1]) {
      B.slab(0, y - 0.45, side * mid, oh * 2, 0.9, wide, step, M.IRON);
      B.slab(side * mid, y - 0.45, 0, wide, 0.9, ih * 2, step, M.IRON);
    }
  }
}

/**
 * Iron railings round a gallery.
 *
 * A continuous low screen rather than a row of individual standards. A 32 cm
 * baluster standing on a deck plate is a stone whose entire bearing is a patch
 * the size of a hand, and three dozen of them round each gallery were the last
 * things on this tower still starting the level detached.
 */
function balustrade(B, y, half, member) {
  const step = Math.max(2.2, member * 2.0);
  for (const side of [1, -1]) {
    B.slab(0, y + 0.85, side * (half - 0.3), half * 2, 1.7, 0.36, step, M.IRON);
    B.slab(side * (half - 0.3), y + 0.85, 0, 0.36, 1.7, half * 2 - 1.2, step, M.IRON);
  }
}

/**
 * The Palais de Chaillot's east wing, across the river.
 *
 * The tower on its own is four legs in a park, and a park is exactly what the
 * Champ de Mars is — so unlike Westminster there is no building butting onto
 * it. This stands at the far end of the axis instead, which is where the
 * garrison that can actually see the tower's back is.
 */
export function buildChaillotWing(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 1.4 * s;
  const course = 1.1 * s;

  B.section('wing', () => {
    const len = 96, depth = 20, height = 22;
    const z0 = -210;
    B.slab(0, -1.0, z0, depth + 4, 2.0, len + 4, stone * 2.0, M.CONCRETE);
    let y = 0, c = 0;
    while (y < height) {
      const h = Math.min(course, height - y);
      B.ring(0, z0, depth, len, 1.4, y, h, stone, M.LIMESTONE, c % 2);
      y += h; c++;
    }
    for (let zc = z0 - len / 2 + 9; zc < z0 + len / 2; zc += 9) {
      let wy = 0;
      while (wy < height) {
        const hh = Math.min(course, height - wy);
        B.slab(0, wy + hh / 2, zc, depth - 2.2, hh, 1.1, stone, M.LIMESTONE);
        wy += hh;
      }
    }
    B.slab(0, height + 0.7, z0, depth + 1.6, 1.4, len + 1.6, stone * 1.3, M.SLATE);
    // A colonnade along the front, which is what the Palais actually is.
    for (let zc = z0 - len / 2 + 5; zc < z0 + len / 2; zc += 6.5) {
      B.slab(depth / 2 + 2.4, height / 2, zc, 1.8, height, 1.8, stone, M.LIMESTONE);
    }
    B.slab(depth / 2 + 2.4, height + 0.6, z0, 3.0, 1.2, len, stone * 1.3, M.LIMESTONE);
  });

  return B;
}
