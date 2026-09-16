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
 * That is the tension this file has never fully resolved, and the comment used
 * to claim a resolution it does not have. Each leg was four corner posts with
 * nothing between them, which looks right and does not stand: the posts step
 * inward faster than they are wide and the bearing chain breaks a few courses
 * off the ground. It is a laced ring instead — see `legs` below — which stands
 * and reads as more solid than the real thing does.
 *
 * Cutting the middle out of every panel to get the openness back has been
 * tried and measured: the build-time bearing graph stays clean, and the
 * runtime load solver then sheds nine hundred stones on load and the tower is
 * see-through on its own centre line. Anyone taking another run at this wants
 * to start from the load pass in `structure.js`, not from the geometry.
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

/**
 * Half-width of the upper shaft, which tapers from the second floor to the top.
 *
 * Concave, like the legs below it — but not a bare power curve. `t^0.78` has
 * infinite slope at t = 0, so the first courses off the platform narrowed
 * faster than a course can bear on the one beneath it, and the bottom of the
 * caisson was the one part of the tower still starting the level detached.
 * Mixing in a linear term gives the same silhouette with a finite slope where
 * it leaves the deck.
 */
function shaftHalf(y) {
  const t = Math.max(0, Math.min(1,
    (y - EIFFEL.secondFloor) / (EIFFEL.thirdFloor - EIFFEL.secondFloor)));
  const shape = 0.30 * t + 0.70 * Math.pow(t, 1.35);
  return 13.5 + (4.6 - 13.5) * shape;
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
  // This has been three things and only the third one is both true and stable.
  // Four bare corner posts look right and fall down: a post that steps inward
  // faster than it is wide bears on nothing, and on a phone that took the whole
  // tower down before the player had touched it. A closed laced ring stands
  // perfectly and reads from the camera as a solid brown chimney — which is
  // not what anybody means by the Eiffel Tower. Cutting panels out of that ring
  // gives back the openness and sheds nine hundred stones on load, because the
  // one rule the support solver actually enforces is that a stone must stand on
  // something *underneath* it, and a hole in a wall is precisely a place where
  // the stone above has nothing under it.
  //
  // So: build the wall out of members that are continuous all the way up. Every
  // bar is a column standing on the bar below it, so the bearing chain is
  // unbroken at every point on every face — and the gaps between the bars,
  // which are three quarters of each face, are sky. That is also how the real
  // tower is built, which is usually a sign of being on the right track.
  const LEG_N = 6;                          // members across each face
  const COURSE = member * 0.9;              // finer than the ring's, on purpose:
  // the batter moves a member sideways by 0.4 m for every metre of height, so a
  // shorter course is a smaller step, and a smaller step is a thinner bar that
  // still overlaps the one beneath it.
  const BAR = Math.max(0.5, COURSE * 0.36);
  /** Member half-thickness, tapering from `a` at `y0` to `b` at `y1`. */
  const taper = (y0, y1, a, b) => (y) => {
    const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
    return a + (b - a) * t;
  };

  /**
   * One tapering box built as a cage: `at(y)` gives its centre and half-width,
   * `barAt(y)` the half-thickness of a member there.
   *
   * The members taper, and that is structural rather than decorative. A stone
   * is crushed when the load on it passes its plan area times its material
   * strength, and the bars at the foot of the upper shaft carry every one of
   * the hundred and sixty metres above them: at a constant 0.84 m square they
   * went straight through their twenty-six meganewtons and a hundred and
   * seventy-four of them were condemned on the first frame — which is what
   * took the whole tower over, since a loss that size arms the collapse. Stout
   * where the load is and slender where it is not is also what the real tower
   * does.
   */
  const cage = (at, y0, y1, n, barAt, courseH) => {
    const fr = [];
    for (let i = 0; i < n; i++) fr.push(-1 + (2 * i) / (n - 1));
    let y = y0;
    while (y < y1 - 0.001) {
      const h = Math.min(courseH, y1 - y);
      const yc = y + h / 2;
      const g = at(yc);
      // Never wider than the gap between members, or a stout course becomes a
      // row of boxes sharing each other's volume — which the physics answers
      // by throwing one of them off the building.
      const bar = Math.min(barAt(yc), (2 * g.h / (n - 1)) * 0.46);
      const hy = h / 2 - 0.02;
      // The four corner posts, square in plan.
      for (const ex of [-1, 1]) {
        for (const ez of [-1, 1]) {
          B.add(g.cx + ex * g.h, yc, g.cz + ez * g.h, bar, hy, bar, M.IRONWORK);
        }
      }
      // And the members along each face, between the corners.
      for (let k = 1; k < n - 1; k++) {
        const f = fr[k];
        for (const ex of [-1, 1]) {
          B.add(g.cx + ex * g.h, yc, g.cz + f * g.h, bar, hy, bar, M.IRONWORK);
        }
        for (const ez of [-1, 1]) {
          B.add(g.cx + f * g.h, yc, g.cz + ez * g.h, bar, hy, bar, M.IRONWORK);
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
   * lives or dies on the grout pass, which is the other way nine hundred stones
   * came off this tower.
   */
  const belt = (at, y, bar) => {
    const g = at(y);
    for (const ex of [-1, 1]) {
      B.add(g.cx + ex * g.h, y, g.cz, bar, bar * 0.85, g.h + bar, M.IRONWORK);
      B.add(g.cx, y, g.cz + ex * g.h, g.h + bar, bar * 0.85, bar, M.IRONWORK);
    }
  };

  B.section('legs', () => {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const at = (y) => {
        const g = legAt(y);
        return { cx: sx * g.r, cz: sz * g.r, h: g.h };
      };
      // Stout at both ends. Thick at the ground because a leg carries the
      // whole tower there, and thick again at the head because the entire
      // upper shaft and the second platform — three hundred meganewtons of it
      // — come down onto twenty members per leg through a plate that funnels
      // rather than spreads. Tapered only downward from the base, the heads
      // were the thinnest part of the leg at exactly the point carrying the
      // most, and they crushed. The real tower's leg heads are its heaviest
      // castings for the same reason.
      // One curve rather than two crossing ones. Thickest at the ground and
      // thickest again at the head, and — the part I got wrong twice — never
      // thin in between: the first version tapered only downward and crushed
      // the heads, the second crossed two tapers and left a waist at ninety
      // metres that crushed instead. A leg carries the most at its foot and at
      // its head and a good deal everywhere, so the floor matters as much as
      // the ends.
      cage(at, 0, EIFFEL.secondFloor, LEG_N, (y) => {
        const t = Math.max(0, Math.min(1, y / EIFFEL.secondFloor));
        return BAR * (1.18 + 0.55 * Math.pow(1 - t, 1.5) + 1.25 * Math.pow(t, 2.2));
      }, COURSE);
      // A belt every fourth course, which is what gives the leg its horizontal
      // banding at a distance.
      for (let y = COURSE * 4; y < EIFFEL.secondFloor - COURSE; y += COURSE * 4) {
        belt(at, y, BAR * 0.8);
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
        Math.max(9, Math.round(15 / s)), M.IRONWORK, 'x');
      B.arch(side * inner, y, 0, inner * 2, 2.6, 1.5,
        Math.max(9, Math.round(15 / s)), M.IRONWORK, 'z');
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
    // Built as the legs are: a cage of continuous members.
    //
    // This was a closed ring for the same reason the legs were, and it cost the
    // same thing. Above the second platform the real tower is a single braced
    // box a hundred and sixty metres tall, and that is most of what you see of
    // the building from anywhere on the map — solid, it turns the whole upper
    // tower into a tapering chimney. Members that run the full height bear on
    // themselves the whole way up, so the box is open and still stands.
    //
    // Fewer members than a leg has, and thinner, because the shaft barely
    // batters: it loses nine metres of half-width over a hundred and sixty of
    // height, so a course moves a member about five centimetres sideways and
    // almost anything overlaps itself.
    const SN = 5;
    const SBAR = Math.max(0.42, COURSE * 0.30);
    cage((y) => ({ cx: 0, cz: 0, h: shaftHalf(y) }), y0, y1, SN,
      taper(y0, y1, SBAR * 2.6, SBAR * 0.92), COURSE);
    for (let y = y0 + COURSE * 5; y < y1 - COURSE; y += COURSE * 5) {
      belt((yy) => ({ cx: 0, cz: 0, h: shaftHalf(yy) }), y, SBAR * 0.8);
    }

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
    B.slab(0, y - 0.45, 0, oh * 2, 0.9, oh * 2, step, M.IRONWORK);
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
    B.slab(0, y + 0.85, side * (half - 0.3), half * 2, 1.7, 0.36, step, M.IRONWORK);
    B.slab(side * (half - 0.3), y + 0.85, 0, 0.36, 1.7, half * 2 - 1.2, step, M.IRONWORK);
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
