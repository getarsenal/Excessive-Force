import * as THREE from 'three';
import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Parthenon, built from its real dimensions.
 *
 * Reference figures (Penrose, Orlandos, and the Acropolis Restoration Service):
 *   stylobate            30.88 × 69.50 m, on a krepis of three steps
 *   peristyle            8 × 17 Doric columns, 10.43 m high, 1.905 m at the foot
 *   axial spacing        ~4.29 m (the corners contracted; not modelled)
 *   entablature          architrave 1.35 m, frieze 1.35 m, cornice ~0.6 m
 *   pediments            ~4.3 m to the apex, at the two short ends
 *   cella                21.72 × 59.02 m outside, walls ~1.2 m, hexastyle porches
 *
 * Structurally this is the one kind of building the game has not had: a
 * colonnade. Dry stone throughout — the drums sit on the drums, the
 * architrave beams sit on the capitals, the frieze and cornice sit on the
 * beams — and nothing is fixed to anything. The load path is entirely vertical
 * through forty-six columns, and every architrave beam is a lintel with a
 * column under each end. Shoot the drums from under one column and its two
 * beams and the cornice on them come down, and the next column along is left
 * holding one end of a beam that used to have two. That is the twist, and the
 * solver's same-course spanning is what makes it play: a beam-shaped stone
 * reaches sideways for bearing, a drum does not.
 *
 * There is no roof, as there has not been since 1687, and the pediments
 * stand as the ruin does — the cornice complete, the tympana above it broken
 * off part way. The cella walls stand to their full height, which is more than
 * the real ruin has, because a level needs something for the garrison to
 * stand in and something for the player to break.
 */

const S = 3.0;
const STONE_FINENESS = 0.56;

// Real metres. The whole list is scaled once at the end.
const STYLO_W = 30.88, STYLO_L = 69.50;
const STEP_H = 0.55, STEP_TREAD = 0.70;
const COL_H = 10.43, COL_FOOT = 1.905, COL_TOP = 1.48;
const CAP_H = 0.55, CAP_W = 2.05;
const ARCH_H = 1.35, FRIEZE_H = 1.35, CORN_H = 0.60;
const PED_H = 4.30;
const CELLA_W = 21.72, CELLA_L = 59.02, CELLA_WALL = 1.2;
const CELLA_TOP = COL_H;                   // the walls rise to the architrave
const NAOS_L = 29.9;                       // interior length of the naos proper
const PORCH_OFF = 4.3;                     // porch columns stand this far off the end wall

// Column axes: 17 along x, 8 along z, corners about a metre in from the edge.
const AX_L = STYLO_L / 2 - 1.0, AX_W = STYLO_W / 2 - 1.0;
const COLS_X = Array.from({ length: 17 }, (_, i) => -AX_L + (2 * AX_L) * i / 16);
const COLS_Z = Array.from({ length: 8 }, (_, i) => -AX_W + (2 * AX_W) * i / 7);

const KREPIS_TOP = STEP_H * 3;
const CAP_TOP = KREPIS_TOP + COL_H + CAP_H;
const ARCH_TOP = CAP_TOP + ARCH_H;
const FRIEZE_TOP = ARCH_TOP + FRIEZE_H;
const CORN_TOP = FRIEZE_TOP + CORN_H;

/** The finished building's dimensions, in world metres, for the garrison. */
export const PARTHENON = {
  scale: S,
  styloW: STYLO_W * S, styloL: STYLO_L * S,
  krepisTop: KREPIS_TOP * S,
  colH: COL_H * S,
  capTop: CAP_TOP * S,
  cornTop: CORN_TOP * S,
  pedH: PED_H * S,
  cellaW: CELLA_W * S, cellaL: CELLA_L * S, cellaWall: CELLA_WALL * S,
  cellaTop: (KREPIS_TOP + CELLA_TOP) * S,
  naosL: NAOS_L * S,
  porchOff: PORCH_OFF * S,
  colsX: COLS_X.map((x) => x * S), colsZ: COLS_Z.map((z) => z * S),
  // The flag flies from the east end of the cella's south wall.
  flag: { x: (CELLA_L / 2 - 3.0) * S, y: (KREPIS_TOP + CELLA_TOP + 0.3) * S, z: -(CELLA_W / 2 - 0.6) * S },
};

/** Where the peristyle columns stand, as [x, z] axes in real metres. */
function peristyle() {
  const out = [];
  for (const x of COLS_X) for (const z of COLS_Z) {
    const edge = Math.abs(x) > AX_L - 0.1 || Math.abs(z) > AX_W - 0.1;
    if (edge) out.push([x, z]);
  }
  return out;
}

export function buildParthenon(quality) {
  const B = new BlockList();
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.15 * s;
  const course = 0.95 * s;

  // ── The krepis: the platform everything stands on, three steps high.
  //
  // One thick layer of paving-sized stones under the stylobate, and the two
  // lower steps as rings round it. Three layers of very large slabs was the
  // obvious way and it was wrong twice: a man between the columns had three
  // slabs under him and losing the top one left him standing on the second,
  // and a slab ten metres across put its centre too far from anyone for the
  // footing check to find. The paving is a single course of stones a man's
  // width, so what is under him is one stone and that stone is his.
  B.section('stylobate', () => {
    // One layer at every tier, laid by hand: `slab` divides height by the
    // same stone it divides plan by, and at the fine tiers that made two
    // layers, the lower of which the sloping rock at the east end swallowed.
    // A fixed size, not the tier's: at the fine tiers the paving came out at
    // two metres and the end columns, carrying the pediments, crushed the
    // stones under their feet; at four metres, which is the coarse tier's
    // size, it carries everywhere. A man's floor stone is still one stone.
    const ps = 1.2;
    const nx = Math.max(1, Math.round(STYLO_L / ps)), nz = Math.max(1, Math.round(STYLO_W / ps));
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        B.add(-STYLO_L / 2 + (i + 0.5) * (STYLO_L / nx), KREPIS_TOP / 2, -STYLO_W / 2 + (k + 0.5) * (STYLO_W / nz),
          (STYLO_L / nx) / 2 - 0.02, KREPIS_TOP / 2 - 0.02, (STYLO_W / nz) / 2 - 0.02, M.LIMESTONE);
      }
    }
    for (let i = 0; i < 2; i++) {
      const w = STYLO_W + 2 * STEP_TREAD * (2 - i);
      const l = STYLO_L + 2 * STEP_TREAD * (2 - i);
      B.ring(0, 0, l, w, STEP_TREAD, 0, STEP_H * (i + 1), stone * 2.0, M.LIMESTONE, i);
    }
  });

  // A Doric column: stacked drums with a gentle entasis and a square abacus on
  // top. One stone per drum — a drum is one stone in life — so the column is
  // the column and not a bundle, and a shell into a drum takes the drum.
  const column = (cx, cz, h) => {
    const n = Math.max(4, Math.round(h / (course * 1.15)));
    const dh = h / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      // Entasis: the shaft swells a little in its lower third before it tapers.
      const d = COL_FOOT + (COL_TOP - COL_FOOT) * t + 0.06 * Math.sin(Math.PI * t) * (1 - t);
      // Four stones to a drum. One stone per drum was the honest thing — a
      // drum is one stone in life — and it was ninety cubic metres of marble
      // at this scale, three times any stone on the Taj, and a howitzer's
      // shell would not bite it: the suite fired fourteen rounds into the
      // colonnade and destroyed nothing. Quartered, a drum can be chipped and
      // a column can be cut, which is what the level is for.
      B.slab(cx, KREPIS_TOP + i * dh + dh / 2, cz, d, dh, d, d / 2 + 0.02, M.MARBLE);
    }
    // Echinus and abacus, as a squared capital, quartered the same way.
    B.slab(cx, KREPIS_TOP + h + CAP_H / 2, cz, CAP_W, CAP_H, CAP_W, CAP_W / 2 + 0.02, M.MARBLE);
  };

  // ── The peristyle.
  const axes = peristyle();
  B.section('columns', () => {
    for (const [x, z] of axes) column(x, z, COL_H);
  });

  // ── The entablature.
  //
  // The architrave is beams: one stone from column axis to column axis, in
  // two slabs through the depth, lying on the capitals. Then the frieze and
  // the cornice run as continuous courses round the whole rectangle on top of
  // the beams, the cornice standing proud.
  B.section('entablature', () => {
    const beamY = CAP_TOP + ARCH_H / 2;
    const depth = CAP_W * 0.46;
    // Along the long sides.
    for (const z of [-AX_W, AX_W]) {
      for (let i = 0; i < COLS_X.length - 1; i++) {
        const x0 = COLS_X[i], x1 = COLS_X[i + 1];
        for (const k of [-1, 1]) {
          B.add((x0 + x1) / 2, beamY, z + k * depth / 2, (x1 - x0) / 2 - 0.02, ARCH_H / 2 - 0.02, depth / 2 - 0.02, M.MARBLE);
        }
      }
    }
    // Along the short sides (the corner bays are shared; step in one).
    for (const x of [-AX_L, AX_L]) {
      for (let i = 0; i < COLS_Z.length - 1; i++) {
        const z0 = COLS_Z[i], z1 = COLS_Z[i + 1];
        for (const k of [-1, 1]) {
          B.add(x + k * depth / 2, beamY, (z0 + z1) / 2, depth / 2 - 0.02, ARCH_H / 2 - 0.02, (z1 - z0) / 2 - 0.02, M.MARBLE);
        }
      }
    }
    // Frieze: a course the depth of the capitals, on the beams.
    B.ring(0, 0, 2 * AX_L + CAP_W, 2 * AX_W + CAP_W, CAP_W, ARCH_TOP, FRIEZE_H, stone * 1.4, M.MARBLE, 0,
      (x, z) => {
        // Triglyphs: every other metre and a bit stands a hand proud.
        const along = Math.abs(z) > AX_W - 0.2 ? x : z;
        return Math.abs(((along + 100) % 2.14) - 1.07) < 0.42 ? 0.10 : 0;
      });
    // Cornice: the geison, projecting.
    B.ring(0, 0, 2 * AX_L + CAP_W, 2 * AX_W + CAP_W, CAP_W, FRIEZE_TOP, CORN_H, stone * 1.4, M.MARBLE, 1, () => 0.42);
  });

  // ── The pediments, ruined. Courses of the tympanum wall stepping in toward
  // the apex, on the cornice at each short end, broken off part way up: the
  // east one keeps two thirds of its height, the west one a little more.
  B.section('pediment', () => {
    const halfSpan = AX_W + CAP_W / 2;
    for (const [x, keep] of [[AX_L, 0.62], [-AX_L, 0.74]]) {
      let y = CORN_TOP;
      let c = 0;
      while (y < CORN_TOP + PED_H * keep - 0.001) {
        const h = Math.min(course, CORN_TOP + PED_H * keep - y);
        const t = (y + h / 2 - CORN_TOP) / PED_H;
        const half = halfSpan * (1 - t);
        // The wall, and the raking cornice standing proud along its top edge.
        const n = Math.max(1, Math.round((2 * half) / (stone * 1.3)));
        const len = (2 * half) / n;
        for (let i = 0; i < n; i++) {
          const z = -half + (i + 0.5) * len;
          const ragged = keep < 0.7 && t > keep * 0.7 && Math.abs(z) > half * 0.3 && (i % 3 === 0);
          if (ragged) continue;
          B.add(x, y + h / 2, z, 0.55, h / 2 - 0.01, len / 2 - 0.01, M.MARBLE);
        }
        y += h; c++;
      }
    }
  });

  // ── The cella: the walled inner building, with a hexastyle porch at each
  // end and a great door in each end wall, and the cross wall that divides
  // the naos from the opisthodomos.
  B.section('cella', () => {
    const hl = CELLA_L / 2, hw = CELLA_W / 2;
    const DOOR_HALF = 2.45, DOOR_TOP = KREPIS_TOP + 8.0;
    const door = (x, y, z) => Math.abs(x) > hl - CELLA_WALL - 0.3 && Math.abs(z) < DOOR_HALF
      && y > KREPIS_TOP && y < DOOR_TOP;
    B.openings(door, () => {
      let y = KREPIS_TOP;
      let c = 0;
      while (y < KREPIS_TOP + CELLA_TOP - 0.001) {
        const h = Math.min(course, KREPIS_TOP + CELLA_TOP - y);
        const yc = y + h / 2;
        // A plinth course at the foot and a string at the top stand proud.
        const band = yc < KREPIS_TOP + 1.0 ? 0.18 : yc > KREPIS_TOP + CELLA_TOP - course * 1.1 ? 0.22 : 0;
        B.ring(0, 0, CELLA_L, CELLA_W, CELLA_WALL, y, h, stone, M.MARBLE, c % 2, () => band);
        y += h; c++;
      }
    });
    // Lintels over the doors: one long stone each, so the wall above bears on
    // masonry and the player has a stone to aim at.
    for (const sx of [-1, 1]) {
      B.add(sx * (hl - CELLA_WALL / 2), DOOR_TOP + course * 0.5, 0, CELLA_WALL / 2 + 0.16, course * 0.5 - 0.01, DOOR_HALF + 0.9, M.MARBLE);
    }
    // The cross wall between the naos and the opisthodomos. Solid: the two
    // rooms never connected, the opisthodomos opening only to the west, and
    // it is what stops the building being a tube you can see down.
    const crossX = hl - CELLA_WALL - NAOS_L - CELLA_WALL / 2;
    {
      let y = KREPIS_TOP;
      while (y < KREPIS_TOP + CELLA_TOP - 0.001) {
        const h = Math.min(course, KREPIS_TOP + CELLA_TOP - y);
        B.slab(crossX, y + h / 2, 0, CELLA_WALL, h, CELLA_W - 2 * CELLA_WALL, stone, M.MARBLE);
        y += h;
      }
    }
    // The porch columns: six at each end, standing off the end wall.
    for (const sx of [-1, 1]) {
      const x = sx * (hl + PORCH_OFF);
      for (let i = 0; i < 6; i++) {
        const z = -(hw - 1.6) + (2 * (hw - 1.6)) * i / 5;
        column(x, z, COL_H);
      }
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Rifles and machine guns on the stylobate between the columns,
 * which is where a man in this building can see out — the cella walls stop at
 * the architrave, so a man on top of them is looking into the beams; snipers
 * on the broken tops of the pediment walls, above the cornice; anti-tank teams
 * in the porches; mortars on the naos floor, where the walls hide them and a
 * steep arc clears.
 */
export function populateParthenon(g, origin, groundY) {
  const P = PARTHENON;
  const floor = groundY + P.krepisTop + 0.6;
  const hl = P.cellaL / 2, hw = P.cellaW / 2;
  // Between the columns, a step inside the axis line, facing out.
  const xs = P.colsX, zs = P.colsZ;
  for (let i = 1; i < xs.length - 1; i += 2) {
    const x = (xs[i] + xs[i + 1]) / 2;
    for (const sz of [-1, 1]) {
      g.place(i % 4 === 1 ? 'mg' : 'rifleman', new THREE.Vector3(origin.x + x, floor, origin.z + sz * (zs[zs.length - 1] - 3.2)),
        sz > 0 ? 0 : Math.PI, 8, { cover: 'arcade' });
    }
  }
  for (let i = 1; i < zs.length - 1; i += 2) {
    const z = (zs[i] + zs[i + 1]) / 2;
    for (const sx of [-1, 1]) {
      g.place(i === 3 ? 'mg' : 'rifleman', new THREE.Vector3(origin.x + sx * (xs[xs.length - 1] - 3.2), floor, origin.z + z),
        sx > 0 ? Math.PI / 2 : -Math.PI / 2, 8, { cover: 'arcade' });
    }
  }
  // Anti-tank teams in the porches, between the porch columns and the wall.
  for (const sx of [-1, 1]) {
    for (const z of [-hw * 0.5, hw * 0.5]) {
      g.place('at', new THREE.Vector3(origin.x + sx * (hl + P.porchOff / 2), floor, origin.z + z),
        sx > 0 ? Math.PI / 2 : -Math.PI / 2, 8, { cover: 'arcade' });
    }
  }
  // Snipers on the broken tops of the pediment walls, over the cornice.
  for (const [sx, keep] of [[1, 0.62], [-1, 0.74]]) {
    for (const z of [-hw * 0.28, hw * 0.28]) {
      g.place('sniper', new THREE.Vector3(origin.x + sx * (xs[xs.length - 1]), groundY + P.cornTop + P.pedH * keep * 0.55 + 0.6, origin.z + z),
        sx > 0 ? Math.PI / 2 : -Math.PI / 2, 8, { cover: 'roof' });
    }
  }
  // Mortars on the naos floor.
  for (const [fx, fz] of [[0.25, 0.3], [0.25, -0.3], [-0.1, 0]]) {
    g.place('mortar', new THREE.Vector3(origin.x + fx * P.naosL, floor, origin.z + fz * hw),
      0, 9, { cover: 'ground' });
  }
}
