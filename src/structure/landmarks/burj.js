import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Burj Khalifa, built from its real dimensions and then made smaller.
 *
 * Reference figures (Baker, Korista & Novak, "Burj Dubai: engineering the
 * world's tallest building"; Emaar):
 *   height                  828 m to the tip; the concrete structure to ~585 m
 *   plan                    a Y of three wings on a hexagonal core, ~130 m across at the foot
 *   setbacks                27, nine to a wing, the wings ending at different heights
 *   spire                   steel, telescoped into place, from ~585 m
 *
 * Structurally a buttressed core: the hexagonal core goes all the way up and
 * each wing braces it, and each wing above a setback stands on the setback
 * under it. Take a wing at its foot and the wing above is a free body while
 * the core stands; take the core at a setback and everything above the cut is
 * a free body with a very long way to fall. At six tenths of life size it is
 * still half a kilometre, twice the Eiffel, and the reason for the scale is
 * the guns: the suite's battery at two hundred metres has to be able to put a
 * shell on a useful part of it.
 *
 * Concrete for the core and the wing frames, faced as the glass it wears —
 * `CURTAIN` is the frame's strength with the curtain wall's colour, because
 * the game's GLASS carries nothing and a tower skinned in it would have
 * nothing to stand on. Steel for the spire.
 */

// Four fifths of life size: six hundred and sixty metres, twice the Eiffel and
// twice anything else in the campaign.
//
// It is as tall as the collapse can carry, and the collapse is what fixes the
// number. Breaking up happens on the ground; a wreck still in the air is one
// welded column, and at six hundred and sixty the tip is eleven and a half
// seconds of free fall from the deck. It was two fifths, which was chosen
// when the tower came down as a four-thousand-stone slab at six tenths — the
// difference is that the stones are coarser now, so the same height is far
// fewer bodies for the fragmenter to get through.
const S = 0.8;
const STONE_FINENESS = 2.4;      // coarse: two thirds of a kilometre of tower on a phone

// Real metres, scaled once at the end.
const CORE_R = 13.5, CORE_WALL = 3.6;
const WING_W = 17.0, WING_WALL = 1.4;
// Where a wing's walls begin, measured from the axis. Inside the core's inner
// face, not at its outer one: a buttressed core is buttressed because the wing
// walls run *into* it. Started at the face they touched nothing — the hexagon
// falls away to either side of the wing's centre line, so the two long walls
// passed it at arm's length and the innermost stones of every course stood as
// their own island with the running bond carrying nothing.
const WING_IN = 7.4;
const WING_L0 = 52.0;            // from the core's face to the wing's end, at the foot
const SETBACKS = 9;
// The setbacks whose floors the garrison holds, and so the courses that get a
// loophole knocked through the glass at either side of the wing.
const WIN_K = [1, 2, 3];
const WING_TOP = [585.0, 515.0, 445.0];   // where each wing ends
const SPIRE_TOP = 828.0;
const PODIUM = { r: 95.0, h: 18.0, inner: CORE_R + WING_L0 + 2 };
// Three steps, and thick ones, because of where the garrison stands. A man's
// floor has to be a stone: one course under his feet, its centre well below
// them, air under that, and nothing at his own level within a couple of
// metres. The terrace was eight thin rings rising half a metre each, which
// left stone level with a rifleman's boots and stone half a metre under them,
// and shelling out everything the footing check looks at still left the
// occupancy cell full — the floor went and the men stood on the hole.
const TERRACE_STEPS = 3;
const TERRACE_RISE = 1.6;
const TERRACE_RUN = PODIUM.r - 4.0 - PODIUM.inner;
const TERRACE_STEP = TERRACE_RUN / TERRACE_STEPS;
/** The outer edge, the exposed walk's middle, and the top of terrace ring i. */
function terrace(i) {
  const outer = PODIUM.r - TERRACE_STEP * i;
  const nextOuter = i + 1 < TERRACE_STEPS ? PODIUM.r - TERRACE_STEP * (i + 1) : PODIUM.inner;
  const inner = i + 1 < TERRACE_STEPS ? outer - TERRACE_STEP - 4.0 : PODIUM.inner;
  return { outer, inner, walk: (outer + nextOuter) / 2,
    y: PODIUM.h + TERRACE_RISE * i, top: PODIUM.h + TERRACE_RISE * (i + 1) };
}
const WING_ANGLES = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];

/** Each wing's length from the core's face at height y, stepping back. */
function wingLength(y, top) {
  if (y >= top) return 0;
  const k = Math.floor((y / top) * SETBACKS);
  return WING_L0 * (1 - k / (SETBACKS + 0.6));
}

/** The finished tower's dimensions, in world metres, for the garrison. */
export const BURJ = {
  scale: S,
  coreR: CORE_R * S, wingW: WING_W * S, wingL0: WING_L0 * S,
  wingTop: WING_TOP.map((t) => t * S), spireTop: SPIRE_TOP * S,
  podium: { r: PODIUM.r * S, h: PODIUM.h * S, inner: PODIUM.inner * S },
  // The three terrace walks, outermost first: where to stand and how high.
  terrace: [0, 1, 2].map((i) => {
    const t = terrace(i);
    return { r: t.walk * S, y: t.top * S };
  }),
  angles: WING_ANGLES,
  // The first setback terraces: the height and how far out each wing still reaches there.
  terraces: [1, 2, 3].map((k) => ({ y: (k * WING_TOP[0] / SETBACKS) * S, reach: (CORE_R + WING_L0 * (1 - k / (SETBACKS + 0.6))) * S })),
  flag: { x: 0, y: (WING_TOP[2] + 1.0) * S, z: 0 },
  // The loopholes: two to a wing per held setback, one in either wall near the
  // end. Sited from the constants rather than from the course grid, because
  // the grid moves with the quality tier and the garrison does not.
  windows: WING_ANGLES.flatMap((a, wi) => WIN_K.flatMap((k) => {
    const yk = (k * WING_TOP[wi]) / SETBACKS;
    const along = CORE_R - 1.0 + wingLength(yk, WING_TOP[wi]) - 8.0;
    const lat = WING_W / 2 - 1.2;
    return [-1, 1].map((side) => ({
      x: (Math.cos(a) * along - Math.sin(a) * side * lat) * S,
      y: (yk + 2.5) * S,
      z: (Math.sin(a) * along + Math.cos(a) * side * lat) * S,
      yaw: Math.atan2(-Math.sin(a) * side, Math.cos(a) * side),
    }));
  })),
};

export function buildBurjKhalifa(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;                     // a 3 cm joint in the world, not 3 cm times the scale
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.3 * s;
  const course = 1.6 * s;
  // Equal courses, never a sliver: see the Himeji keep for why.
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  // ── The podium: a broad low base, a ring of storeys with a roof.
  B.section('podium', () => {
    courses(0, PODIUM.h, course, (y, h, c) => {
      B.polyRing(0, 0, BlockList.circle(PODIUM.r, 18, (c % 2) * (Math.PI / 18)), 4.0, y, h, stone * 1.5, M.CONCRETE, 0,
        () => (y + h / 2 > PODIUM.h - h * 1.1 ? 0.6 : 0));
    });
    // The podium terrace: rings stepping in and up from the ring wall, each
    // one wider than its step so their tops make one continuous walk.
    //
    // It stops where it stops. There was a slab across the middle once — one
    // deck a hundred and thirty-five metres across, spanning from this terrace
    // to the tower with nothing underneath it. This solver carries load
    // sideways about two metres, so a deck like that stands only because the
    // build-time grout hands every stone in it a bearing edge to the nearest
    // thing below, and where the grout cannot reach, the middle of the deck
    // comes off on the first frame. The tower rises out of the plaza instead,
    // and the garrison has the terrace, which is carried by the wall under it.
    for (let i = 0; i < TERRACE_STEPS; i++) {
      const t = terrace(i);
      B.polyRing(0, 0, BlockList.circle(t.outer, 18), t.outer - t.inner, t.y, TERRACE_RISE,
        stone * 1.5, M.CONCRETE, 0);
    }
  });

  // ── The core: a hexagonal drum all the way to the top of the tallest wing,
  // then the spire on it. The same high-strength concrete as the wing walls,
  // because it is the same pour — in the ordinary mix the campaign's other
  // buildings are made of, the core stood at its own capacity a third of the
  // way up and shed a course, carrying as it does the whole of the spire and
  // the inner end of every setback floor on top of four hundred metres of
  // itself.
  const hex = (r, rot) => BlockList.circle(r, 6, rot);
  B.section('core', () => {
    courses(0, WING_TOP[0], course, (y, h, c) => {
      B.polyRing(0, 0, hex(CORE_R, (c % 2) * (Math.PI / 6)), CORE_WALL, y, h, stone, M.CURTAIN, 0);
    });
  });

  // ── The wings: each a hollow bar from the core's face outward, stepping
  // back nine times, with a floor slab at every setback so the storey above
  // stands on it.
  B.section('wings', () => {
    WING_ANGLES.forEach((a, wi) => {
      const top = WING_TOP[wi];
      const ux = Math.cos(a), uz = Math.sin(a);
      // A stone's local +z runs along its course and local +x is the wall's
      // thickness — the convention `polyRing` lays to. So the yaw that puts a
      // wing wall's length along the wing is atan2 of the wing's direction,
      // not the wing's own angle: `-a` rotates every stone a quarter turn, the
      // long walls become rows of separate planks lying across the wing, and
      // the running bond overlaps nothing.
      const ry = Math.atan2(ux, uz);
      // Local (lx, lz) to world, for the floors: +x is (cos, -sin), +z is (sin, cos).
      const wx = (lx, lz) => Math.cos(ry) * lx + Math.sin(ry) * lz;
      const wz = (lx, lz) => -Math.sin(ry) * lx + Math.cos(ry) * lz;
      // A wing floor is a bay of stones, not one slab. Seventeen metres by
      // fifty as a single block is six hundred cubic metres: too tough for a
      // shell to break and too big to fall as anything but a wall.
      const floor = (cx, cz, halfW, halfL, y, hy) => {
        const nw = Math.max(1, Math.round((halfW * 2) / (stone * 1.4)));
        const nl = Math.max(1, Math.round((halfL * 2) / (stone * 1.4)));
        const sw = (halfW * 2) / nw, sl = (halfL * 2) / nl;
        for (let p = 0; p < nw; p++) for (let q = 0; q < nl; q++) {
          const lx = -halfW + (p + 0.5) * sw, lz = -halfL + (q + 0.5) * sl;
          B.add(cx + wx(lx, lz), y, cz + wz(lx, lz), sw / 2 - 0.02, hy, sl / 2 - 0.02, M.CONCRETE, ry);
        }
      };
      // The walls thicken toward the foot. A wing wall of one section all the
      // way up stands at its capacity in the lowest fifth — the weight of five
      // hundred metres on a metre and a half of concrete — and sheds stones
      // with nobody firing. Every tall building answers this the same way.
      const wallAt = (y) => WING_WALL * (1 + 0.95 * Math.max(0, 1 - y / (top * 0.45)));
      let prevL = wingLength(0, top);
      courses(0, top, course, (y, h, c) => {
        const L = wingLength(y + h / 2, top);
        const end = CORE_R - 1.0 + L;          // the wing's tip, from the axis
        const run = end - WING_IN;             // the walls' whole length, core included
        // Where the wing steps back, a floor across the new end.
        if (L < prevL - 0.5) {
          const fend = CORE_R - 1.0 + prevL;
          // A little proud of the wall above it at both ends. The course that
          // lands on this floor is laid on its own segment grid, which moves
          // when the wing shortens, so at a fine tier the first stone of the
          // new course could sit just past the edge of the floor it is meant
          // to be standing on.
          floor(ux * (WING_IN + fend) / 2, uz * (WING_IN + fend) / 2,
            WING_W / 2, (fend - WING_IN) / 2 + 1.6, y - 0.35, 0.35);
          prevL = L;
        }
        // The two long walls and the end wall of the bar, as yawed stones.
        const wall = wallAt(y + h / 2);
        const n = Math.max(1, Math.round((run + 1.0) / stone));
        const seg = (run + 1.0) / n;
        // A course just over a setback has one stone out of either wall near
        // the wing's end: the loophole the riflemen on that floor shoot from.
        // One stone wide and no more — the course above laps two below, so a
        // single missing stone is spanned and a pair of them is a hole.
        const winBand = WIN_K.some((k) => {
          const yk = (k * top) / SETBACKS;
          return y + h / 2 > yk + 0.5 && y + h / 2 < yk + course * 1.5;
        });
        for (let i = 0; i < n; i++) {
          const along = WING_IN + (i + 0.5 + (c % 2) * 0.5) * seg;
          if (along > end + 1.0 - seg * 0.4) continue;
          if (winBand && i === n - 3) continue;
          for (const side of [-1, 1]) {
            // The outer face stays on the wing's line; the wall thickens inward.
            const px = ux * along - uz * side * (WING_W / 2 - wall / 2);
            const pz = uz * along + ux * side * (WING_W / 2 - wall / 2);
            B.add(px, y + h / 2, pz, wall / 2 - 0.02, h / 2 - 0.02, seg / 2 - 0.03, M.CURTAIN, ry);
            // The floor line, every fourth course: a fascia standing proud of
            // the glass, half a course deep so the course above lands on the
            // wall and not on it. It was a course of plain CONCRETE once, and
            // that put a band two and a half times weaker than the wall across
            // the whole load path every four floors — the tower stood at its
            // capacity and shed the band on the first frame. Ornament is the
            // right way to draw a floor; a weaker course is a fuse.
            // Only where there is an outside to face: the wing walls run on
            // into the core, and a strip of facade hung inside the core's
            // hollow touches nothing and comes off on its own.
            if (c % 4 === 0 && along > CORE_R + 1.0) {
              const ox = px - uz * side * (wall / 2 + 0.3);
              const oz = pz + ux * side * (wall / 2 + 0.3);
              B.add(ox, y + h / 2, oz, 0.3, h * 0.2, seg / 2 - 0.03, M.CONCRETE, ry);
            }
          }
        }
        // The end wall.
        const ex = ux * (end + 0.5), ez = uz * (end + 0.5);
        B.add(ex, y + h / 2, ez, WING_W / 2 - wall, h / 2 - 0.02, 0.6, M.CURTAIN, ry);
        if (c % 4 === 0) {
          B.add(ux * (end + 1.4), y + h / 2, uz * (end + 1.4), WING_W / 2 - wall, h * 0.2, 0.3, M.CONCRETE, ry);
        }
      });
      // The wing's roof.
      const L = wingLength(top - 1, top);
      const rend = CORE_R - 1.0 + L;
      floor(ux * (WING_IN + rend) / 2, uz * (WING_IN + rend) / 2,
        WING_W / 2, (rend - WING_IN) / 2 + 0.5, top + 0.35, 0.35);
    });
  });

  // ── The spire: steel, hollow, tapering from the core's top to the tip.
  B.section('spire', () => {
    B.spire(0, 0, WING_TOP[0], SPIRE_TOP - 30, CORE_R * 1.6, 3.0, course * 1.3, stone, M.STEEL, 0.32);
    B.pinnacle(0, 0, SPIRE_TOP - 30, 30, 3.5, stone, M.STEEL);
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen and machine guns round the podium roof's edge,
 * anti-tank teams and snipers on the first three setback terraces of the
 * wings, mortars on the podium roof between the wings, where the sky is
 * open.
 */
export function populateBurjKhalifa(g, origin, groundY) {
  const K = BURJ;
  // The middle terrace walk: clear of the ring wall behind it and of the step
  // in front, which is what lets the footing check see the floor go.
  const mid = K.terrace[1];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.place(i % 3 === 0 ? 'mg' : 'rifleman',
      new THREE.Vector3(origin.x + Math.cos(a) * mid.r, groundY + mid.y + 0.05, origin.z + Math.sin(a) * mid.r),
      Math.atan2(Math.cos(a), Math.sin(a)), 7, { cover: 'roof' });
  }
  // On the setback terraces: at the end of each wing, on the floor exposed there.
  K.terraces.forEach((t, k) => {
    for (const a of K.angles) {
      const r = t.reach + 1.5;
      g.place(k === 0 ? 'at' : 'sniper', new THREE.Vector3(origin.x + Math.cos(a) * r, groundY + t.y + 1.0, origin.z + Math.sin(a) * r),
        Math.atan2(Math.cos(a), Math.sin(a)), 7, { cover: 'roof' });
    }
  });
  // At the loopholes, on the setback floors: the rank that shoots out of the
  // glass. Every other one a machine gun.
  K.windows.forEach((w, i) => {
    g.place(i % 2 === 0 ? 'rifleman' : 'mg',
      new THREE.Vector3(origin.x + w.x, groundY + w.y, origin.z + w.z), w.yaw, 6, { cover: 'window' });
  });

  // Mortars on the terrace walk, between the wings, where the sky is open and
  // there is a floor. They stood in the middle of the podium once, which was
  // a deck that no longer exists — the tower comes up out of the plaza now.
  for (const a of K.angles) {
    const b = a + Math.PI / 3;
    const inner = K.terrace[2];
    g.place('mortar',
      new THREE.Vector3(origin.x + Math.cos(b) * inner.r, groundY + inner.y + 0.05, origin.z + Math.sin(b) * inner.r),
      0, 8, { cover: 'roof' });
  }
}
