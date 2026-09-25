import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Florence Cathedral, Florence.
 *
 * TODO(florence) Reference figures, with sources: plan from tools/survey.py, elevation
 * from photographs. Then the proportion table (docs/maps/florence.md) before a number
 * below is typed.
 *
 * What kind of problem it is (cantilever / lattice / shell / mountain), and
 * the twist the player has to find: TODO(florence)
 */

// Scale above life, chosen before the constants; everything derives from it.
const S = 1.0;                       // TODO(florence)
const STONE_FINENESS = 2.0;
// One batter for every face if this stands on a hill; metres in per metre up.
const BATTER = 0.0;

// Real metres, scaled once at the end. TODO(florence): from the survey.
const PLAN = { w: 60.0, d: 40.0, h: 50.0 };
const WALL = 3.0;

/** Half-width of a battered wall at height y, given its width at its top. */
const wAt = (wTop, top, y) => wTop + 2 * BATTER * (top - y);

/** What the garrison, the flag and the level record read. */
export const FLORENCE = {
  scale: S,
  plan: { w: PLAN.w * S, d: PLAN.d * S, h: PLAN.h * S },
  /** Rooflines a man can be posted on, low to high. */
  galleries: [PLAN.h * S],
  flag: { x: 0, y: (PLAN.h + 1.0) * S, z: 0 },
};

export function buildFlorence(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.2 * s;
  const course = 1.5 * s;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  // TODO(florence) the building. A placeholder so the level loads and the harness runs.
  B.section('body', () => {
    courses(0, PLAN.h, course, (y, h, c) => {
      B.ring(0, 0, wAt(PLAN.w, PLAN.h, y), wAt(PLAN.d, PLAN.h, y), WALL, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0);
    });
    B.slab(0, PLAN.h + course * 0.3, 0, PLAN.w - WALL, course * 0.6, PLAN.d - WALL, stone, M.LIMESTONE);
  });

  B.scaleAll(S);
  return B;
}

/** The garrison, every position read from the constants above. */
export function populateFlorence(g, origin, groundY) {
  const K = FLORENCE;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  // TODO(florence) post men where the building has a floor under them and a view out.
  for (const sx of [-1, 1]) {
    g.place('rifleman', V(sx * (K.plan.w / 2 - 3), K.galleries[0] + 1.0, 0), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'roof' });
  }
}
