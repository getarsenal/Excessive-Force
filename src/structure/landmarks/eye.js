import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The London Eye.
 *
 * Not an objective. It stands across the river from the Palace because it is
 * what stands across the river from the Palace — a hundred and thirty-five
 * metres of white steel wheel leaning out over the Thames from Jubilee
 * Gardens — and from Westminster Bridge it is half of what makes the view
 * that view. It comes down if you shoot it, because everything here does, and
 * it counts for nothing on the progress bar, because it is scenery.
 *
 * ── What kind of structure it is, and what kind it has to pretend to be
 *
 * The real Eye is a bicycle wheel: a rim hung from its hub on cable spokes in
 * tension, the hub carried on an A-frame with backstays to the ground behind.
 * The support solver knows nothing of tension. It walks bearing downward, from
 * a stone to the stones under it, and a rim hung from spokes has nothing under
 * its lowest point but air — the solver would free the bottom three quarters
 * of the wheel the moment it was built.
 *
 * So the wheel stands as well as hangs. A plinth rises from the boarding
 * platform to meet the rim at its lowest point, and from there the rim is a
 * masonry ring standing on it: every rim piece bears on the one below it,
 * down either side to the plinth, the way an arch does. The spokes run from
 * the hub to the rim and bear on whichever end is lower. The hub sits on the
 * two legs, the legs on their feet, the backstays run down to their anchors.
 * All of it is compression as far as the solver can see, and all of it is
 * connected — cut the plinth and the lower rim goes, cut a leg and the hub
 * drops the wheel into the river.
 *
 * ── Why the pieces are the shape they are
 *
 * A stone here is an axis-aligned box turned only about the vertical, and the
 * wheel is a circle in a vertical plane: no stone can lie along the rim. Each
 * rim piece is instead a box stretched along whichever of its two axes is
 * nearer the tangent there — tall where the rim runs up the sides, long where
 * it runs over the top — so it is always a member and never a lump, and it
 * reaches its neighbours with an eighth of its length to spare. The spokes are
 * built the same way along the radial. The legs and stays are chains of
 * overlapping cubes, because a sloped member has no axis to stretch along.
 *
 * Dimensions are the real ones, in metres, and the whole thing is scaled at
 * the end the way the tower is: the tower is twice life size, and a wheel
 * that is life size beside it reads as a fairground ride.
 */
export const EYE = {
  scale: 1.4,
  radius: 60,                 // rim centreline
  hubY: 64,                   // hub over the platform, so the rim clears it by three metres
  hubX: -38,                  // the hub stands out over the river, west of the feet
  legFoot: { z: 22 },         // the two feet, either side of the axis, at x = 0
  stay: { x: 34, z: 9 },      // each backstay's anchor, inland
  rimSegments: 96,
  spokes: 16,
  capsules: 32,
};

/** The reach of an axis-aligned box along a unit direction (uy, uz). */
function reach(hy, hz, uy, uz) {
  return hy * Math.abs(uy) + hz * Math.abs(uz);
}

/** A run of cubes from `a` to `b`, each overlapping the next. */
function chain(b, a, c, half, step, mat) {
  const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(2, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(a.x + dx * t, a.y + dy * t, a.z + dz * t, half, half, half, mat);
  }
}

export function buildLondonEye(quality) {
  void quality;                       // one wheel at every tier: it is scenery
  const b = new BlockList();
  const R = EYE.radius, CY = EYE.hubY, HX = EYE.hubX;

  // The rim: a ring of members, each stretched along the tangent.
  const N = EYE.rimSegments;
  const c = (2 * Math.PI * R) / N;
  const rimHalf = (th) => ({
    hy: Math.max(0.9, 0.54 * c * Math.abs(Math.cos(th))),
    hz: Math.max(0.9, 0.54 * c * Math.abs(Math.sin(th))),
  });
  b.section('rim', () => {
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      const { hy, hz } = rimHalf(th);
      b.add(HX, CY + R * Math.sin(th), R * Math.cos(th), 1.6, hy, hz, M.STEEL);
    }
  });

  // The hub, and the spokes out from it.
  const HUB = 5.2;
  b.section('hub', () => {
    b.add(HX + 1.0, CY, 0, 5.5, HUB, HUB, M.STEEL);
  });
  b.section('spokes', () => {
    const L = 5.0;
    const r0 = HUB - 0.6, r1 = R - 0.3;
    const n = Math.ceil((r1 - r0) / (L * 0.94));
    const pitch = (r1 - r0 - L) / (n - 1);
    for (let k = 0; k < EYE.spokes; k++) {
      const th = (k / EYE.spokes) * Math.PI * 2 + Math.PI / EYE.spokes;
      const uy = Math.sin(th), uz = Math.cos(th);
      for (let i = 0; i < n; i++) {
        const rc = r0 + L / 2 + i * pitch;
        const hy = Math.max(0.5, 0.53 * L * Math.abs(uy));
        const hz = Math.max(0.5, 0.53 * L * Math.abs(uz));
        b.add(HX, CY + rc * uy, rc * uz, 0.5, hy, hz, M.STEEL);
      }
    }
  });

  // The capsules, hung on the outside of the rim.
  b.section('capsules', () => {
    for (let k = 0; k < EYE.capsules; k++) {
      const th = (k / EYE.capsules) * Math.PI * 2;
      const uy = Math.sin(th), uz = Math.cos(th);
      const { hy, hz } = rimHalf(th);
      // Just into the rim's outer face, so the two are touching.
      const rc = R + reach(hy, hz, uy, uz) + reach(2.0, 2.0, uy, uz) - 0.3;
      b.add(HX, CY + rc * uy, rc * uz, 4.0, 2.0, 2.0, M.GLASS);
    }
  });

  // The A-frame: two legs from their feet up to the hub, and the backstays
  // from the hub down to their anchors behind.
  b.section('legs', () => {
    for (const s of [-1, 1]) {
      const foot = { x: 0, y: 1.5, z: s * EYE.legFoot.z };
      const top = { x: HX + 6.0, y: CY - 1.5, z: s * 2.0 };
      chain(b, foot, top, 1.5, 2.6, M.STEEL);
      b.add(foot.x, 0.6, foot.z, 3.2, 0.6, 3.2, M.CONCRETE);
    }
    for (const s of [-1, 1]) {
      const top = { x: HX + 6.0, y: CY + 2.5, z: s * 2.5 };
      const anchor = { x: EYE.stay.x, y: 1.0, z: s * EYE.stay.z };
      chain(b, top, anchor, 0.9, 1.6, M.STEEL);
      b.add(anchor.x, 0.5, anchor.z, 2.6, 0.5, 2.6, M.CONCRETE);
    }
  });

  // The boarding platform, and the plinth that carries the rim's lowest point.
  b.section('platform', () => {
    const bottom = CY - R - rimHalf(-Math.PI / 2).hy;   // the rim's underside
    b.add(HX, bottom / 2 + 0.05, 0, 4.0, bottom / 2 + 0.05, 6.0, M.CONCRETE);
    b.add(HX, 0.5, 14, 6.0, 0.5, 8.0, M.CONCRETE);
    b.add(HX, 0.5, -14, 6.0, 0.5, 8.0, M.CONCRETE);
  });

  return b.scaleAll(EYE.scale);
}
