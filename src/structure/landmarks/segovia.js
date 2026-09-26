import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Aqueduct of Segovia, in the Plaza del Azoguejo.
 *
 * Reference figures (Junta de Castilla y León; Aparicio, "El acueducto de
 * Segovia"; the survey, which has the plaza's houses in a ring round the
 * origin with a clear lane running south-east to north-west through it, which
 * is the aqueduct's own line):
 *   height            28.5 m in the Azoguejo, in two tiers of arches
 *   piers             2.4 m wide at the top and about 3 m deep, stepping out
 *                     below; spans about 4.8 m, so a bay every 7.2 m
 *   the tall run      forty-odd double arches; the single-tier runs climb
 *                     away with the ground at either end
 *   stone             unmortared grey granite; the channel on top is the
 *                     only dressed work
 *   line              from the Plaza de Día Sanz in the south-east to the
 *                     Postigo del Consuelo in the north-west, 48° west of north
 *
 * Kind: an arch chain. The twist is that an arcade shares its thrust: take one
 * pier out and the two arches on it fall, the two piers beside them are now
 * unbraced, and the next hit unzips the chain to the next wide pier. Every
 * pier is founded down to meet the rock, because the ground under an aqueduct
 * is never level — that is what an aqueduct is for.
 *
 * CONCRETE for the granite (its grey is right), LIMESTONE for the channel.
 */

const S = 2.2;
const STONE_FINENESS = 0.7;

// Real metres, scaled once at the end. Heights are above the origin's ground.
const AXIS_DEG = 48;                       // the line, degrees west of north for the +s direction
const UX = -Math.sin((AXIS_DEG * Math.PI) / 180), UZ = -Math.cos((AXIS_DEG * Math.PI) / 180);   // along, toward the north-west
const VX = -UZ, VZ = UX;                   // across
const PITCH = 7.2;                         // pier to pier
const SPAN = 4.8;
const PIER_ALONG = 2.4, PIER_ACROSS = 3.0; // the upper tier's piers
const BAYS_EACH_SIDE = 13;                 // 26 bays, 27 piers: the tall run of the Azoguejo
const WIDE_EVERY = 8;                      // a wider pier every so often, where the chain stops unzipping
const FOUND = -12.0;                       // the footing, into the rock
const LOWER_SPRING = 12.5;                 // the lower arches spring here
const IMPOST = 19.5;                       // the band between the tiers
const UPPER_SPRING = 21.5;
const ARCH_T = 1.0;                        // the ring's thickness
const LOWER_CROWN = LOWER_SPRING + SPAN / 2 + ARCH_T;   // 15.9
const UPPER_CROWN = UPPER_SPRING + SPAN / 2 + ARCH_T;   // 24.9
const WALL_TOP = 27.0;                     // the top of the upper spandrel wall
const CHANNEL_H = 1.5, CHANNEL_WALL = 0.6;
const TOP = WALL_TOP + CHANNEL_H;          // 28.5

/** Pier plan at height y: [along, across], stepping out toward the foot. */
const pierPlan = (y, wide) => {
  const k = wide ? 1.5 : 1.0;
  if (y >= IMPOST) return [PIER_ALONG * k, PIER_ACROSS];
  if (y >= 4.0) return [3.0 * k, 3.6];
  return [3.6 * k, 4.2];
};
const isWide = (k) => Math.abs(k) === BAYS_EACH_SIDE || (k % WIDE_EVERY === 0 && k !== 0);

/** World (unscaled) point at `s` along the line and `t` across it. */
const at = (s, t = 0) => [s * UX + t * VX, s * UZ + t * VZ];
const RY = Math.atan2(UX, UZ);             // a stone whose local +z runs along the line

/** What the garrison, the flag and the level record read. */
export const SEGOVIA = {
  scale: S,
  axis: { ux: UX, uz: UZ, vx: VX, vz: VZ, ry: RY },
  pitch: PITCH * S, span: SPAN * S,
  piers: BAYS_EACH_SIDE, isWide,
  pierAlong: PIER_ALONG * S, pierAcross: PIER_ACROSS * S,
  lowerSpring: LOWER_SPRING * S, impost: IMPOST * S, upperSpring: UPPER_SPRING * S,
  wallTop: WALL_TOP * S, top: TOP * S, channelWall: CHANNEL_WALL * S,
  /** World (scaled) point at s along, t across, both in world metres. */
  at: (s, t = 0) => { const [x, z] = at(s / S, t / S); return { x: x * S, z: z * S }; },
  /** Rooflines a man can be posted on, low to high. */
  galleries: [IMPOST * S, WALL_TOP * S],
  // The flag flies from the channel over the middle pier.
  flag: (() => { const [x, z] = at(0, 0); return { x: x * S, y: (TOP + 0.4) * S, z: z * S }; })(),
};

export function buildSegovia(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.2 * s;
  const course = 0.9 * s;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  /** A block of masonry centred at `s` along the line, `along` by `across` in plan, one course. */
  const block = (sc, y, h, along, across, st, mat, phase = 0) => {
    const na = Math.max(1, Math.round(along / st)), nc = Math.max(1, Math.round(across / st));
    const la = along / na, lc = across / nc;
    // Bonded: odd courses shift the joints half a stone, with half stones at
    // the ends so nothing hangs over the pier's face. A stone whose centre
    // sat on the face of the pier had no equilibrium and was freed at load.
    const cuts = [0];
    if (phase && na > 1) { for (let i = 0; i < na; i++) cuts.push(Math.min(along, (i + 0.5) * la)); cuts.push(along); }
    else for (let i = 1; i <= na; i++) cuts.push(i * la);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const len = cuts[i + 1] - cuts[i];
      if (len < 0.05) continue;
      const sa = sc - along / 2 + (cuts[i] + cuts[i + 1]) / 2;
      for (let j = 0; j < nc; j++) {
        const tc = -across / 2 + (j + 0.5) * lc;
        const [x, z] = at(sa, tc);
        B.add(x, y + h / 2, z, B.shrink(lc / 2), B.shrink(h / 2), B.shrink(len / 2), mat, RY);
      }
    }
  };
  /** A run of wall along the line from s0 to s1, `across` thick, one course, with the openings in force. */
  const run = (s0, s1, y, h, across, mat, phase = 0, tOff = 0) => {
    const len = s1 - s0;
    const n = Math.max(1, Math.round(len / stone));
    const seg = len / n;
    const cuts = [0];
    if (phase && n > 1) { for (let i = 0; i < n; i++) cuts.push((i + 0.5) * seg); cuts.push(len); }
    else for (let i = 1; i <= n; i++) cuts.push(i * seg);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const l = cuts[i + 1] - cuts[i];
      if (l < 0.05) continue;
      const [x, z] = at(s0 + (cuts[i] + cuts[i + 1]) / 2, tOff);
      B.add(x, y + h / 2, z, B.shrink(across / 2), B.shrink(h / 2), B.shrink(l / 2), mat, RY);
    }
  };
  /**
   * A semicircular arch of voussoirs over the bay centred at `sc`, springing
   * at `springY`, the ring `thick` deep, `depth` across the line. The same
   * boxes-on-a-ring as `arch()`, turned to the aqueduct's own line.
   */
  const voussoirs = (sc, springY, span, depth, thick, count, mat) => {
    const rc = span / 2 + thick / 2;
    for (let i = 0; i < count; i++) {
      const am = Math.PI * ((i + 0.5) / count);
      const bs = Math.cos(am) * rc, by = Math.sin(am) * rc;
      const seg = (Math.PI * rc) / count;
      const ins = (i % 2) * 0.05;
      const [x, z] = at(sc + bs, 0);
      B.add(x, springY + by, z, depth / 2 - ins, B.shrink(thick / 2) - ins, B.shrink(seg / 2) - ins, mat, RY);
    }
  };
  /** The void an arch and the opening under it occupy, as an opening predicate on world points. */
  const archVoid = (sc, springY, span, thick, margin = 0.12) => {
    const rOut = span / 2 + thick + margin;
    return (x, y, z) => {
      if (y < springY - 30) return false;
      const along = x * UX + z * UZ - sc;
      if (Math.abs(along) >= rOut) return false;
      if (y <= springY) return true;
      return Math.hypot(along, y - springY) < rOut;
    };
  };

  // A pier's stones are never smaller than this, whatever the tier. The load
  // pass splits what a stone carries equally among the stones under it, and
  // the springer of an arch stands on the one or two stones at the pier's
  // face: at the fine tiers those were a hand's width across and were crushed
  // at load, and the arch on them went with them.
  const pierStone = Math.max(stone, 1.25);
  const S0 = -BAYS_EACH_SIDE * PITCH, S1 = BAYS_EACH_SIDE * PITCH;
  const pierS = [];
  for (let k = -BAYS_EACH_SIDE; k <= BAYS_EACH_SIDE; k++) pierS.push([k * PITCH, isWide(k)]);
  const bayS = [];
  for (let k = -BAYS_EACH_SIDE; k < BAYS_EACH_SIDE; k++) bayS.push((k + 0.5) * PITCH);
  const rough = stone * 3.0, roughCourse = course * 2.6;

  // ── The lower piers: coarse and bare below the ground, dressed above it,
  // stepping in at the setbacks, up to the lower springing.
  B.section('lowerpiers', () => {
    for (const [sc, wide] of pierS) {
      courses(FOUND, 0, roughCourse, (y, h, c) => {
        const [a, b] = pierPlan(y, wide);
        block(sc, y, h, a, b, rough, M.CONCRETE, c % 2);
      });
      courses(0, LOWER_SPRING, course, (y, h, c) => {
        const [a, b] = pierPlan(y + h / 2, wide);
        block(sc, y, h, a, b, pierStone, M.CONCRETE, c % 2);
      });
    }
  });

  // ── The lower arches: a ring over every bay, the haunches between the
  // rings on the pier tops, and the wall over the crowns up to the impost.
  const tier = (tag, springY, crownY, wallTopY, y0Piers, pierPlanAt) => {
    B.section(tag, () => {
      const across = pierPlanAt(springY + 0.1)[1];
      const voids = bayS.map((sc) => archVoid(sc, springY, SPAN, ARCH_T));
      const inVoid = (x, y, z) => voids.some((v) => v(x, y, z));
      // The haunches: courses from the springing to the crown top, cut where
      // the rings are. They stand on the piers, and the rings on them.
      B.openings(inVoid, () => {
        courses(springY, crownY, course, (y, h, c) => run(S0 - PIER_ALONG * 0.75, S1 + PIER_ALONG * 0.75, y, h, across, M.CONCRETE, c % 2));
      });
      for (const sc of bayS) voussoirs(sc, springY, SPAN, across, ARCH_T, 7, M.CONCRETE);
      // The wall over the crowns, continuous, with the impost band standing proud at its head.
      courses(crownY, wallTopY, course, (y, h, c) => {
        const band = y + h > wallTopY - course * 0.9;
        run(S0 - PIER_ALONG * 0.75, S1 + PIER_ALONG * 0.75, y, h, across + (band ? 0.5 : 0), M.CONCRETE, c % 2);
      });
    });
  };
  tier('lowerarches', LOWER_SPRING, LOWER_CROWN, IMPOST, 0, (y) => pierPlan(y, false));

  // ── The upper piers, on the impost.
  B.section('upperpiers', () => {
    for (const [sc, wide] of pierS) {
      courses(IMPOST, UPPER_SPRING, course, (y, h, c) => {
        const [a, b] = pierPlan(y + h / 2, wide);
        block(sc, y, h, a, b, pierStone, M.CONCRETE, c % 2);
      });
    }
  });
  tier('upperarches', UPPER_SPRING, UPPER_CROWN, WALL_TOP, IMPOST, (y) => pierPlan(y, false));

  // ── The channel: a floor and two low walls along the top, in dressed stone.
  B.section('channel', () => {
    const across = PIER_ACROSS;
    const floorH = 0.5;
    run(S0 - PIER_ALONG * 0.75, S1 + PIER_ALONG * 0.75, WALL_TOP, floorH, across, M.LIMESTONE, 0);
    courses(WALL_TOP + floorH, TOP, course * 0.7, (y, h, c) => {
      for (const side of [-1, 1]) {
        run(S0 - PIER_ALONG * 0.75, S1 + PIER_ALONG * 0.75, y, h, CHANNEL_WALL, M.LIMESTONE, c % 2, side * (across / 2 - CHANNEL_WALL / 2));
      }
    });
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. The channel on top is a trench 28 m up with a parapet either
 * side: riflemen and machine guns along it, snipers over the wide piers.
 * Anti-tank teams stand at the foot of the piers under the lower arches, and
 * mortars on the impost between the tiers, where the upper arcade hides them.
 */
export function populateSegovia(g, origin, groundY) {
  const A = SEGOVIA;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const P = (s, t, y) => { const p = A.at(s, t); return V(p.x, y, p.z); };
  const faceOut = (side) => Math.atan2(A.axis.vx * side, A.axis.vz * side);
  const n = A.piers;
  // Along the channel: a man over every other bay, facing alternate sides.
  for (let k = -n; k < n; k += 2) {
    const s = (k + 0.5) * A.pitch;
    const side = ((k + n) / 2) % 2 === 0 ? 1 : -1;
    const type = k % 6 === 0 ? 'mg' : 'rifleman';
    g.place(type, P(s, 0, A.wallTop + 0.5 * A.scale + 0.3), faceOut(side), 6, { cover: 'trench' });
  }
  // Snipers over the wide piers, both faces.
  for (let k = -n; k <= n; k++) {
    if (!A.isWide(k) || k === 0) continue;
    const side = k > 0 ? 1 : -1;
    g.place('sniper', P(k * A.pitch, 0, A.wallTop + 0.5 * A.scale + 0.3), faceOut(side), 6, { cover: 'trench' });
  }
  // Mortars on the impost, in the shadow of the upper arcade.
  for (const k of [-6, 2, 10]) {
    g.place('mortar', P((k + 0.5) * A.pitch, 0, A.impost + 0.3), 0, 6, { cover: 'roof' });
  }
  // Anti-tank teams at the foot of every fourth pier, one each side of the line.
  for (let k = -n + 2; k < n; k += 4) {
    const side = k % 8 === 2 ? 1 : -1;
    g.place('at', P(k * A.pitch + A.pierAlong * 0.5 + 1.2, side * (A.pierAcross / 2 + 1.0), 0.3), faceOut(side), 4, { cover: 'arcade' });
  }
}
