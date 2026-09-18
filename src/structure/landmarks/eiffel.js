import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Eiffel Tower, built from its real dimensions.
 *
 * Reference figures (Société d'Exploitation de la Tour Eiffel, published):
 *   height to the tip            330 m with the broadcast mast
 *   height to the third floor    276 m
 *   second floor                 116 m, deck 30 m square
 *   first floor                  57 m, deck 65 m square
 *   base                         125 m square between the outer piers
 *   wrought iron                 7,300 t in 18,038 pieces
 *
 * This is the first landmark in the game that is not masonry, and it wants
 * building the opposite way round. A stone tower is a shell: you model the
 * walls and the openings are what is left over. A lattice is a frame: there is
 * no wall at all, only members, and if you build it as a hollow box with thin
 * sides it reads from any distance as a solid tapering chimney.
 *
 * Three things had to be right together, and the file used to have one of them.
 *
 *   1. The curve. Eiffel sized the tower so the wind's overturning moment is
 *      carried by the weight above each height rather than by tension in the
 *      iron, and the shape that falls out of that condition is an exponential.
 *      It fits the published tower almost exactly: the outer envelope is
 *      62.5 m from the axis at the ground, 32.5 m at the first platform,
 *      about 15 m at the second and a few metres at the third, and
 *      `4.2 + 58.3 · e^(-y / 76)` passes through all four. A table of five
 *      points linearly interpolated — which is what was here — has a batter
 *      that barely changes over the whole height, and a tower with a constant
 *      batter is a pylon. The curve is most of what people recognise.
 *   2. The merge. The four piers are not four towers standing beside a fifth.
 *      Each one's inner face runs in to the axis and they close up into a
 *      single box at the second platform, which is where the upper tower
 *      starts. Holding the legs 8 m off the axis and then starting a separate
 *      shaft above them leaves a step in the silhouette at 116 m — the part
 *      that read as thin and chunky on top.
 *   3. The openness. The one rule the support solver enforces is that a stone
 *      must stand on something underneath it, so a lattice has to be built out
 *      of members that are continuous from the ground up: every bar is a
 *      column standing on the bar below it, and the gaps between the bars are
 *      sky. That much was already true. What was not is how much of the gap
 *      each bar took — capped at four fifths of its own spacing, so every face
 *      closed up into a plate and the tower came out as a brown chimney. The
 *      bars here take about a third, which is what the real web looks like
 *      from the Trocadéro, and they are carried by ironwork strong enough to
 *      stand at that size: see `MATERIALS.IRONWORK` in `builder.js`, which
 *      used to be rated at a tenth of wrought iron's real capacity and so
 *      could only hold the tower up as a solid.
 *
 * Diagonals are stepped rather than rotated. `BlockList.add` yaws a stone but
 * cannot pitch one, so a brace running up and across is laid as a short
 * staircase of boxes. At this scale the steps read as rivetted segments, which
 * is close enough to what is actually there.
 */

export const EIFFEL = {
  firstFloor: 57,
  secondFloor: 116,
  thirdFloor: 276,
  tip: 330,
  baseHalf: 62.5,
  firstDeckHalf: 32.5,
  secondDeckHalf: 19.0,
  thirdDeckHalf: 8.0,
};

/**
 * The outer envelope, from the ground to the summit: one curve for the whole
 * tower, legs and shaft alike.
 *
 * Eiffel's own condition — the wind moment at any height balanced by the
 * weight above it, with no tension anywhere in the iron — integrates to an
 * exponential, and this is that exponential fitted to the published widths.
 * The constant term is what stops it running to nothing at the top, where the
 * real tower still has a few metres of box under the lantern.
 */
function outerAt(y) {
  return 4.2 + 58.3 * Math.exp(-Math.max(0, y) / 76);
}

/**
 * The inner face of a pier, which runs in to the axis and meets the other
 * three at the second platform.
 *
 * Very nearly a straight line — the exponent is 1.15, not 2 — because the
 * legs' convergence is mostly the outer envelope's doing. Past the merge
 * height it is pinned at zero and the four boxes tile one square, which is the
 * upper shaft: above 116 m there are no legs, there is a tower.
 */
function innerAt(y) {
  const t = Math.max(0, Math.min(1, y / EIFFEL.secondFloor));
  return 37.5 * Math.pow(1 - t, 1.15);
}

/**
 * Where a leg's centre and cross-section are at height `y`.
 *
 * Exported because the garrison stands in this ironwork and has to know where
 * it is. It used to carry its own copy of the old profile as two numbers
 * interpolated in place, which is the kind of duplication that survives every
 * change to the thing it duplicates: the men were posted on the straight legs
 * long after the legs had stopped being straight.
 */
export function legAt(y) {
  const o = outerAt(y);
  const i = Math.min(innerAt(y), o - 2.0);
  return { r: (o + i) / 2, h: (o - i) / 2 };
}

/**
 * Half-width of the upper shaft, which is simply the envelope above the merge.
 *
 * It used to be a separate curve starting from its own guessed width, and the
 * join showed: the legs ended 19 m out and the shaft began 13.5 m out, so the
 * tower stepped inward by six metres in the space of one course and then went
 * up as a chimney. Sharing the envelope means the shaft's corners land on the
 * leg heads' outer posts with the platform between them, which is both what
 * the real tower does and what the load pass needs.
 */
function shaftHalf(y) {
  return outerAt(y);
}

export function buildEiffelTower(quality) {
  const B = new BlockList();
  // Capped, unlike every other landmark's.
  //
  // A lattice is the one structure here whose stability depends on how finely
  // it is divided. Each leg is four posts that step inward as the leg batters,
  // and the step per course is the course height times the batter — so at the
  // coarsest tier, where a course is 3.7 m instead of 2.4, each post shifts
  // 1.5 m off the one below it and most of the overlap that was holding it up
  // is gone. On a phone the whole tower came down on its own the moment the
  // map loaded: 224 stones detached, 141 of them in the legs.
  //
  // The tower is a few thousand stones against Westminster's thirty-two, so it
  // can afford to stay fine at every tier.
  const s = Math.min(quality.blockScale, 1.15);
  const member = 1.5 * s;        // nominal length of one iron member
  // Wide enough to still overlap the post below it after the batter has moved
  // it sideways. Tied to the course height rather than fixed, so this holds at
  // whatever size the tier builds at.
  const post = Math.max(1.5, member * 1.6 * 0.62);
  // Lacing thickness for the legs. The batter moves a leg about 0.4 m sideways
  // per metre of height, so one course shifts it `courseH * 0.4`; the lacing
  // must be wider than that to keep bearing on itself.
  const LACE = Math.max(1.7, member * 1.6 * 0.55);

  /** A vertical run of posts from y0 to y1 at (x, z), tapering with the frame. */
  const column = (xOf, zOf, y0, y1, halfOf, mat = M.IRONWORK) => {
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
      B.add(x0 + dx * t, y, z0 + dz * t, thick, thick, len / (2 * n) - 0.03, M.IRONWORK, ry);
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
        thick, Math.abs(dy) / 2 + thick * 0.5, segLen, M.IRONWORK, ry);
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
  //
  // A cage of continuous vertical members, not a wall with holes in it.
  //
  // Every bar is a column standing on the bar below it, so the bearing chain is
  // unbroken at every point on every face — which matters because the one rule
  // the support solver enforces is that a stone must stand on something
  // *underneath* it, and a hole cut in a wall is precisely a place where the
  // stone above has nothing under it. Build the wall out of bars instead and
  // the holes are free: the two thirds of each face that is not a bar is sky,
  // and no stone anywhere has lost its footing.
  const LEG_N = 4;                          // members across each face
  const COURSE = member * 0.9;              // finer than the ring's, on purpose:
  // the batter moves a member sideways by up to half a metre for every metre of
  // height near the ground, so a shorter course is a smaller step, and a smaller
  // step is a thinner bar that still overlaps the one beneath it.
  //
  // Nothing thinner than this, wherever the arithmetic says otherwise. At the
  // summit the spacing is under three metres and a third of that is a bar you
  // cannot see and the physics cannot keep hold of.
  const MIN_BAR = Math.max(0.34, COURSE * 0.25);

  /**
   * One tapering box built as a cage: `at(y)` gives its centre and half-width,
   * `fillOf(y)` how much of the gap between two members a member takes there.
   *
   * Sizing the members as a fraction of their own spacing rather than in metres
   * is the whole trick, and getting it wrong is what made this tower a chimney.
   * The frame narrows by a factor of four from the ground to the second
   * platform; a bar of fixed width therefore goes from covering a fifth of its
   * gap at the bottom to covering four fifths of it at the top, and four fifths
   * is a plate. Tie the bar to the gap and the face reads the same from top to
   * bottom — about a third solid, which is what the real web looks like from
   * across the river.
   *
   * The fill still varies, because the load does. A leg carries the most at its
   * foot, where it holds up the whole tower, and again at its head, where the
   * entire upper shaft and the second platform come down onto its twelve
   * members through a plate that funnels rather than spreads. Stout at both
   * ends and slender between is also what the real tower does.
   *
   * The corners get half again what the face members do. The shaft's own
   * corners stand over the legs' outer corner posts with nothing but the
   * platform in between, so a corner carries several times what a face member
   * beside it does.
   */
  const cage = (at, y0, y1, n, fillOf, courseH) => {
    const fr = [];
    for (let i = 0; i < n; i++) fr.push(-1 + (2 * i) / (n - 1));
    let y = y0;
    while (y < y1 - 0.001) {
      const h = Math.min(courseH, y1 - y);
      const yc = y + h / 2;
      const g = at(yc);
      const spacing = 2 * g.h / (n - 1);
      const f = fillOf(yc);
      // Never more than half the gap, or a stout course becomes a row of boxes
      // sharing each other's volume — which the physics answers by throwing one
      // of them off the building.
      const bar = Math.max(MIN_BAR, spacing * Math.min(f, 0.50) / 2);
      const corner = Math.max(MIN_BAR * 1.4, spacing * Math.min(f * 1.55, 0.62) / 2);
      const hy = h / 2 - 0.02;
      // The four corner posts — the arêtes, square in plan.
      for (const ex of [-1, 1]) {
        for (const ez of [-1, 1]) {
          B.add(g.cx + ex * g.h, yc, g.cz + ez * g.h, corner, hy, corner, M.IRONWORK);
        }
      }
      // And the members along each face, between the corners.
      for (let k = 1; k < n - 1; k++) {
        const fk = fr[k];
        for (const ex of [-1, 1]) {
          B.add(g.cx + ex * g.h, yc, g.cz + fk * g.h, bar, hy, bar, M.IRONWORK);
        }
        for (const ez of [-1, 1]) {
          B.add(g.cx + fk * g.h, yc, g.cz + ez * g.h, bar, hy, bar, M.IRONWORK);
        }
      }
      y += h;
    }
  };

  /**
   * A belt of horizontals round a cage at one height, and the diagonals under
   * it.
   *
   * Laid exactly on a course boundary so each belt sits on the tops of the
   * members it crosses and has a real bearing edge to every one of them. A
   * horizontal floating between two courses has nothing under it at all and
   * lives or dies on the grout pass, which is one of the ways nine hundred
   * stones came off this tower.
   */
  const belt = (at, y, bar) => {
    const g = at(y);
    for (const ex of [-1, 1]) {
      B.add(g.cx + ex * g.h, y, g.cz, bar, bar * 0.85, g.h + bar, M.IRONWORK);
      B.add(g.cx, y, g.cz + ex * g.h, g.h + bar, bar * 0.85, bar, M.IRONWORK);
    }
  };

  /**
   * The X across one bay of one face of a cage, between two belts.
   *
   * This is the part that turns a row of posts into ironwork. Four posts a face
   * with sky between them is an open frame and reads, correctly, as scaffolding;
   * what makes the Eiffel Tower look like the Eiffel Tower is that every panel
   * between two belts is crossed. The diagonals are stepped rather than pitched
   * and they run corner to corner, so each one starts on a post and every step
   * after that stands on the step below it — a brace hung in the middle of a
   * panel would be the one thing in this building with nothing underneath it.
   */
  const cross = (at, y0, y1, thick) => {
    const a = at(y0), b = at(y1);
    const ring = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const c0 = ring[i], c1 = ring[(i + 1) % 4];
      brace(a.cx + c0[0] * a.h, a.cz + c0[1] * a.h, y0,
        b.cx + c1[0] * b.h, b.cz + c1[1] * b.h, y1, thick);
      brace(a.cx + c1[0] * a.h, a.cz + c1[1] * a.h, y0,
        b.cx + c0[0] * b.h, b.cz + c0[1] * b.h, y1, thick);
    }
  };

  B.section('legs', () => {
    // Stout at the foot, stout at the head, slender in between — and never so
    // slender in the middle that a waist forms, which is the other way this has
    // been got wrong. The two added terms are small on purpose: most of the
    // shape is the flat 0.14, so the web looks the same all the way up.
    const legFill = (y) => {
      const t = Math.max(0, Math.min(1, y / EIFFEL.secondFloor));
      return 0.14 + 0.12 * Math.pow(1 - t, 1.6) + 0.14 * Math.pow(t, 2.4);
    };
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const at = (y) => {
        const g = legAt(y);
        return { cx: sx * g.r, cz: sz * g.r, h: g.h };
      };
      cage(at, 0, EIFFEL.secondFloor, LEG_N, legFill, COURSE);
      // A belt at every panel boundary and an X inside every panel, which is
      // the unit the real tower is assembled from and what gives a leg its
      // banding at a distance. The panels are eight courses deep — eleven
      // metres — because a belt is a solid hoop on all four faces at once, and
      // at four courses the legs came out striped like a radiator.
      const BAY = COURSE * 8;
      for (let y = BAY; y < EIFFEL.secondFloor - COURSE; y += BAY) {
        belt(at, y, MIN_BAR * 0.9);
      }
      for (let y = 0; y < EIFFEL.secondFloor - BAY; y += BAY) {
        cross(at, y, Math.min(y + BAY, EIFFEL.secondFloor), MIN_BAR * 0.8);
      }
    }
  });

  // ── The great arches ─────────────────────────────────────────────────────
  // Decorative rather than structural on the real tower, and decorative here
  // too — but they are the silhouette everyone knows, and without them the
  // base reads as four unrelated pylons.
  //
  // Sprung from where the piers actually are rather than from as low as they
  // would go. The real arcs spring about a quarter of the way up the legs and
  // crown just under the first platform, so the arch is nearly sixty metres
  // across and the opening under it is the size of a cathedral nave; the old
  // one sprang at 10 m, spanned a third of that, and disappeared into the
  // ironwork. Each foot still sits exactly on a pier's inner corner post — an
  // arch centred between two posts lands on neither of them, and eight of its
  // voussoirs fell out of the tower on the first frame the one time that was
  // tried.
  B.section('arches', () => {
    const y = 24;
    const inner = innerAt(y);
    const count = Math.max(13, Math.round(22 / s));
    const RING = 3.2;                       // thickness of the arc itself
    for (const side of [1, -1]) {
      B.arch(0, y, side * inner, inner * 2, 4.2, RING, count, M.IRONWORK, 'x');
      B.arch(side * inner, y, 0, inner * 2, 4.2, RING, count, M.IRONWORK, 'z');
    }
    // The spandrel: the web of ironwork between the arc's back and the
    // underside of the first platform. Hangers rather than a plate, so you can
    // still see through it, and each one stands on a voussoir — which is the
    // only place in the arch that has anything under it to stand on.
    const rc = inner + RING / 2;
    const deckU = EIFFEL.firstFloor - 1.1;
    for (const a of [0.42, 0.62, 0.82, Math.PI - 0.42, Math.PI - 0.62, Math.PI - 0.82]) {
      const bx = Math.cos(a) * rc, by = y + Math.sin(a) * rc;
      if (by > deckU - 2.5) continue;
      for (const side of [1, -1]) {
        column(() => bx, () => side * inner, by, deckU, () => MIN_BAR * 0.95);
        column(() => side * inner, () => bx, by, deckU, () => MIN_BAR * 0.95);
      }
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
      B.slab(cx, Y + 3.4, cz, w, 0.5, d, member * 1.8, M.IRONWORK);
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
    // Built as the legs are, on the same envelope, so the shaft's foot is
    // exactly the width the four leg heads make between them and the tower has
    // no step in it at 116 m.
    //
    // Stout where it leaves the platform and slender at the top, because that
    // is where the load is: the shaft's foot carries a hundred and sixty metres
    // of tower and its head carries the lantern. Sized as a fraction of the
    // spacing, like the legs — the shaft narrows threefold over its height, so
    // a bar of fixed width would close the box up into a chimney over the top
    // fifty metres, which is exactly what it used to do.
    const SN = 5;
    const shaftAt = (y) => ({ cx: 0, cz: 0, h: shaftHalf(y) });
    const shaftFill = (y) => {
      const u = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
      return 0.14 + 0.19 * Math.pow(1 - u, 2.0);
    };
    cage(shaftAt, y0, y1, SN, shaftFill, COURSE);
    // Belts and crosses on the same panel boundaries as the legs below.
    const BAY = COURSE * 8;
    for (let y = y0 + BAY; y < y1 - COURSE; y += BAY) belt(shaftAt, y, MIN_BAR * 0.9);
    for (let y = y0; y < y1 - BAY; y += BAY) {
      cross(shaftAt, y, Math.min(y + BAY, y1), MIN_BAR * 0.8);
    }
  });

  // ── Third floor, lantern and mast ────────────────────────────────────────
  B.section('summit', () => {
    const Y = EIFFEL.thirdFloor;
    const oh = EIFFEL.thirdDeckHalf;
    deck(B, Y, oh, 0, member, s);
    // The glazed observation room, and Eiffel's own apartment above it.
    B.slab(0, Y + 2.2, 0, 11, 4.4, 11, member * 1.8, M.GLASS);
    B.slab(0, Y + 4.7, 0, 12, 0.7, 12, member * 1.8, M.IRONWORK);
    // The lantern.
    B.spire(0, 0, Y + 5.0, Y + 18, 9.0, 3.0, member * 1.5, member, M.IRONWORK, 0.5);
    B.slab(0, Y + 19.5, 0, 3.4, 3.0, 3.4, member, M.IRONWORK);
    // The broadcast mast, up to 330 m.
    let y = Y + 21;
    while (y < EIFFEL.tip - 6) {
      const t = (y - Y) / (EIFFEL.tip - Y);
      const w = 1.5 * (1 - t * 0.55);
      B.slab(0, y + 1.2, 0, w, 2.4, w, member, M.IRONWORK);
      y += 2.4;
    }
    for (let k = 0; k < 4; k++) {
      B.slab(0, EIFFEL.tip - 5 + k * 1.5, 0, 0.9 - k * 0.15, 1.5, 0.9 - k * 0.15,
        member, M.IRONWORK);
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
    //
    // And coarse. Each plate stone hands its load to whatever members stand
    // under it, so a plate stone wide enough to cover two or three members
    // spreads the upper tower across the leg head instead of dropping the
    // whole of it down one post.
    B.slab(0, y - 0.45, 0, oh * 2, 0.9, oh * 2, Math.max(step, 5.0), M.IRONWORK);
    return;
  }
  for (let i = 0; i < n; i++) {
    const r0 = ih + (oh - ih) * (i / n);
    const r1 = ih + (oh - ih) * ((i + 1) / n);
    const mid = (r0 + r1) / 2, wide = r1 - r0;
    for (const side of [1, -1]) {
      B.slab(0, y - 0.45, side * mid, oh * 2, 0.9, wide, step, M.IRONWORK);
      B.slab(side * mid, y - 0.45, 0, wide, 0.9, ih * 2, step, M.IRONWORK);
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
    B.slab(0, y + 0.85, side * (half - 0.3), half * 2, 1.7, 0.36, step, M.RAILING);
    B.slab(side * (half - 0.3), y + 0.85, 0, 0.36, 1.7, half * 2 - 1.2, step, M.RAILING);
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
