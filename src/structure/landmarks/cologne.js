import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Cologne Cathedral, built from its real dimensions.
 *
 * Reference figures (Dombauverwaltung Köln):
 *   length                  144.6 m; west front 61.5 m wide; transept 86.3 m
 *   towers                  157.2 m (north) and 157.4 m (south), ~19 m square
 *   nave                    five aisles, 43.4 m to the vault, ridge about 61 m
 *   crossing turret         109 m
 *
 * Structurally this is a pair of cantilevers on a hall. Each tower is a
 * hollow square shaft a hundred metres high with a hollow octagonal spire
 * for its last fifty-seven, and the whole of that stands on the shaft's four
 * corners — the faces between them are window from the second stage up.
 * Cut the corners on one side and the tower goes over that way, and what it
 * lands on is a nave roof that is a thin corbelled shell on two rows of
 * clerestory wall braced by flying buttresses. Take the flyers off one side
 * and that wall has nothing holding it against its own roof.
 *
 * The south tower stands on the level's origin, not the plan's centre. The
 * building is what the guns are for, and the tower is what the eye and the
 * suite's opacity probe both go through; centred on the nave, a line down
 * the axis at half the building's height passes between the towers and over
 * the roof and finds nothing at all.
 *
 * Grey trachyte reads as LIMESTONE here; the roofs are SLATE; the finials
 * GILT. Everything is stone doing as little work as it can, which is the
 * gothic idea and also the reason a gothic building comes down when you ask
 * it to.
 */

const S = 1.3;
const STONE_FINENESS = 0.66;

// Real metres, in a frame with the south tower's axis at (0, 0) and the nave
// running east along +x. North is -z in the game, so the north tower is at
// negative z.
const TW = 19.0;                 // tower plan, square
const TOWER_Z = [0, -42.0];      // south, north
const TOWER_H = 100.0;           // the square shaft
const SPIRE_TOP = 157.3;
const FRONT_W = 61.5;            // the west front, tower to tower
const FRONT_H = 66.0;            // the centre section between the towers, to its gable
const AXIS_Z = -21.0;            // the nave axis
const NAVE_X0 = TW / 2, NAVE_X1 = 80.0;   // the tower's east face to the crossing
const AISLE_HALF = 22.5, AISLE_H = 20.5;
const CLERE_HALF = 6.6, CLERE_H = 43.4;
const RIDGE = 61.0;
const CROSS_X0 = 80.0, CROSS_X1 = 100.0, TRANSEPT_HALF = 43.0;
const CHOIR_X1 = 136.0;          // the straight choir; the apse beyond it
const BAY = 7.5;
const FLYERS_FROM = 26.0;

/** The finished cathedral's dimensions, in world metres, for the garrison. */
export const DOM = {
  scale: S,
  towerW: TW * S, towerZ: TOWER_Z.map((z) => z * S), towerH: TOWER_H * S, spireTop: SPIRE_TOP * S,
  frontH: FRONT_H * S, axisZ: AXIS_Z * S,
  naveX0: NAVE_X0 * S, naveX1: NAVE_X1 * S,
  aisleHalf: AISLE_HALF * S, aisleH: AISLE_H * S,
  clereHalf: CLERE_HALF * S, clereH: CLERE_H * S, ridge: RIDGE * S,
  crossX0: CROSS_X0 * S, crossX1: CROSS_X1 * S, transeptHalf: TRANSEPT_HALF * S,
  choirX1: CHOIR_X1 * S, bay: BAY * S,
  // The tower's window stages: heights the garrison can stand at.
  stages: [30, 52, 74, 92].map((y) => y * S),
  // The flag flies from the crossing turret's base, on the ridge.
  flag: { x: ((CROSS_X0 + CROSS_X1) / 2) * S, y: (RIDGE + 1.0) * S, z: AXIS_Z * S },
};

export function buildCologneCathedral(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;                     // a 3 cm joint in the world, not 3 cm times the scale
  const s = quality.blockScale * STONE_FINENESS;
  // Coarse by the standards of the other maps: a hundred and ninety metres
  // of cathedral with two hundred-metre spires is forty thousand stones at
  // the Taj's grain, and a phone lays it in twelve thousand at this one.
  const stone = 1.9 * s;
  const course = 1.45 * s;
  // Equal courses, never a sliver: see the Himeji keep for why.
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  // ── The raft under everything.
  B.section('base', () => {
    B.slab(64, -1.0, AXIS_Z, 150, 2.0, 96, stone * 3.0, M.CONCRETE);
  });

  // ── A tower: the square shaft with its lancets, then the spire.
  //
  // The lancets are two to a face and off the axis, so a line down the middle
  // of the tower meets the mullion between them. Corner buttresses stand
  // proud as relief, and the stages are marked by a string course.
  const towerShaft = (cz, tag) => {
    const half = TW / 2;
    const stages = [[22, 42], [50, 68], [76, 96]];
    const lancet = (x, y, z) => {
      const onZ = Math.abs(z - cz) > Math.abs(x);
      const along = onZ ? x : z - cz;
      for (const [y0, y1] of stages) {
        if (y < y0 || y > y1) continue;
        const a = Math.abs(along);
        if (a > 1.2 && a < 4.6) {
          // Pointed head over the top fifth.
          if (y < y1 - 4.0) return true;
          const t = (y - (y1 - 4.0)) / 4.0;
          return Math.abs(a - 2.9) < 1.7 * Math.sqrt(Math.max(0, 1 - t * t));
        }
      }
      return false;
    };
    const relief = (x, z, y) => {
      const ax = Math.abs(x), az = Math.abs(z - cz);
      let e = 0;
      if (ax > half - 2.6 && az > half - 2.6) e = 1.1 * (1 - y / TOWER_H) + 0.3;   // corner buttresses
      for (const [y0, y1] of stages) if (Math.abs(y - y1 - 1.0) < course * 0.6 || Math.abs(y - y0 + 1.0) < course * 0.6) e = Math.max(e, 0.35);
      return e;
    };
    B.section(tag, () => {
      B.openings(lancet, () => {
        courses(0, TOWER_H, course * 1.1, (y, h, c) => {
          const t = y / TOWER_H;
          const wall = 3.6 - t * 1.2;
          B.ring(0, cz, TW, TW, wall, y, h, stone, M.LIMESTONE, c % 2, (px, pz) => relief(px, pz, y + h / 2));
        });
      });
      // A floor at each stage, for the men, thin and spanning the shaft as a
      // ring of beams from the walls in: a stone floor in a nineteen-metre
      // tower is what the real one has at its bell stage.
      // On a wall course exactly — same height, same top and bottom — so the
      // solver sees the floor as the wall's own course reaching inward. Laid
      // between courses it was ten stones hanging in the shaft.
      const nT = Math.max(1, Math.round(TOWER_H / (course * 1.1)));
      const chT = TOWER_H / nT;
      for (const [, y1] of stages) {
        const yf = Math.round((y1 + 1.0) / chT) * chT;
        const wallAt = 3.6 - (yf / TOWER_H) * 1.2;
        const inner = TW - 2 * wallAt;
        B.ring(0, cz, inner, inner, inner * 0.36, yf, chT, stone * 1.6, M.LIMESTONE, 0);
      }
      // The spire: an octagon on the square, hollow, tapering to the finial.
      const octo = (r, rot = 0) => BlockList.circle(r, 8, rot + Math.PI / 8);
      courses(TOWER_H, SPIRE_TOP - 3.0, course * 1.3, (y, h, c) => {
        const t = (y - TOWER_H) / (SPIRE_TOP - TOWER_H);
        const r = (half - 0.4) * Math.pow(1 - t, 0.92) + 0.8;
        const wall = Math.max(stone * 0.6, 2.4 * (1 - t) + 0.7);
        if (r <= wall * 1.1) B.slab(0, y + h / 2, cz, r * 2, h, r * 2, stone, M.LIMESTONE);
        else B.polyRing(0, cz, octo(r, (c % 2) * (Math.PI / 8)), wall, y, h, stone, M.LIMESTONE, 0,
          // The ribs at the octagon's edges stand proud, which is the tracery
          // at the resolution a stone allows.
          (px, pz) => (Math.abs(((Math.atan2(pz - cz, px) + Math.PI * 4) % (Math.PI / 4)) - Math.PI / 8) < 0.12 ? 0.5 : 0));
      });
      B.pinnacle(0, cz, SPIRE_TOP - 3.0, 3.0, 2.0, stone, M.GILT);
    });
  };
  towerShaft(TOWER_Z[0], 'southspire');
  towerShaft(TOWER_Z[1], 'northspire');

  // ── The west front between the towers: the wall, the great window and the
  // central portal, with a gable over it.
  B.section('westfront', () => {
    const z0 = TOWER_Z[1] + TW / 2, z1 = TOWER_Z[0] - TW / 2;
    const cz = (z0 + z1) / 2, w = z1 - z0;
    const cut = (x, y, z) => {
      const a = Math.abs(z - cz);
      if (y > 3 && y < 21 && a < 4.0) return true;                                  // the portal
      if (y > 28 && y < 52 && a < 6.0) return y < 46 || a < 6.0 * Math.sqrt(Math.max(0, 1 - ((y - 46) / 6) ** 2));   // the window
      return false;
    };
    B.openings(cut, () => {
      courses(0, FRONT_H, course, (y, h) => {
        const gable = y > 56 ? (w / 2) * (1 - (y - 56) / (FRONT_H - 56)) : w / 2;
        B.slab(-TW / 2 + 3.0, y + h / 2, cz, 6.0, h, gable * 2, stone, M.LIMESTONE);
      });
    });
  });

  // ── A hall: aisle walls, clerestory walls, and a corbelled roof shell over
  // the clerestory. Used for the nave, the transept arms and the choir.
  // `a0..a1` is the hall's extent along its axis and `cross` the coordinate
  // across it: for the nave the x-range and the axis line's z, for the
  // transept the z-range and the crossing's x. The transept stood off in the
  // square once, with the two read the other way round.
  const hall = (a0, a1, cross, aisleHalf, clereHalf, tag, axis = 'x') => {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    const cx = axis === 'x' ? mid : cross;
    const cz = axis === 'x' ? cross : mid;
    const win = (u, v, y, half, y0, y1) => {
      // Windows in a wall: one per bay, pointed.
      if (y < y0 || y > y1) return false;
      const a = Math.abs(((u + 1000) % BAY) - BAY / 2);
      if (a > 2.2) return false;
      if (y < y1 - 3.5) return true;
      return a < 2.2 * Math.sqrt(Math.max(0, 1 - ((y - (y1 - 3.5)) / 3.5) ** 2));
    };
    const along = (x, z) => (axis === 'x' ? x : z);
    const across = (x, z) => (axis === 'x' ? z - cz : x - cx);
    const lay = (half, y0, y1, wall, wy0, wy1) => {
      const cut = (x, y, z) => Math.abs(Math.abs(across(x, z)) - half) < wall && win(along(x, z), 0, y, half, wy0, wy1);
      B.openings(cut, () => {
        courses(y0, y1, course, (y, h) => {
          for (const sg of [-1, 1]) {
            if (axis === 'x') B.slab(cx, y + h / 2, cz + sg * half, len, h, wall, stone * 1.3, M.LIMESTONE);
            else B.slab(cx + sg * half, y + h / 2, cz, wall, h, len, stone * 1.3, M.LIMESTONE);
          }
        });
      });
    };
    B.section(tag, () => {
      lay(aisleHalf, 0, AISLE_H, 1.6, 4, 17);
      lay(clereHalf, 0, CLERE_H, 1.8, 24, 40);
      // The aisle roofs: a lean-to shell from the aisle wall up to the
      // clerestory wall, corbelled course by course.
      const steps = Math.max(4, Math.round((aisleHalf - clereHalf) / (stone * 0.9)));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const off = aisleHalf - (aisleHalf - clereHalf) * t;
        const y = AISLE_H + 0.275 + i * 0.55;
        for (const sg of [-1, 1]) {
          if (axis === 'x') B.slab(cx, y, cz + sg * off, len, 0.55, (aisleHalf - clereHalf) / steps + 0.6, stone * 1.8, M.SLATE);
          else B.slab(cx + sg * off, y, cz, (aisleHalf - clereHalf) / steps + 0.6, 0.55, len, stone * 1.8, M.SLATE);
        }
      }
      // The main roof: a steep gable shell over the clerestory, each course a
      // little further in than the one under it, so every stone stands on
      // the stone below and nothing has to span the nave.
      const rise = RIDGE - CLERE_H;
      const n = Math.max(6, Math.round(rise / (course * 1.1)));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const off = clereHalf * (1 - t);
        const y = CLERE_H + (i + 0.5) * (rise / n);
        const thick = Math.max(1.3, clereHalf / n + 0.6);
        if (off < thick * 0.6) {
          if (axis === 'x') B.slab(cx, y, cz, len, rise / n, thick * 1.2, stone * 1.8, M.SLATE);
          else B.slab(cx, y, cz, thick * 1.2, rise / n, len, stone * 1.8, M.SLATE);
        } else {
          for (const sg of [-1, 1]) {
            if (axis === 'x') B.slab(cx, y, cz + sg * off, len, rise / n, thick, stone * 1.8, M.SLATE);
            else B.slab(cx + sg * off, y, cz, thick, rise / n, len, stone * 1.8, M.SLATE);
          }
        }
      }
    });
  };

  hall(NAVE_X0, CROSS_X0, AXIS_Z, AISLE_HALF, CLERE_HALF, 'nave');
  hall(CROSS_X1, CHOIR_X1, AXIS_Z, AISLE_HALF, CLERE_HALF, 'choir');
  // The transept, across the axis.
  hall(AXIS_Z - TRANSEPT_HALF, AXIS_Z + TRANSEPT_HALF, (CROSS_X0 + CROSS_X1) / 2, AISLE_HALF * 0.55, CLERE_HALF, 'transept', 'z');

  // ── The crossing: a square of clerestory wall where nave and transept
  // meet, with the ridge turret on it.
  B.section('crossing', () => {
    courses(CLERE_H, RIDGE + 2, course, (y, h, c) => {
      B.ring((CROSS_X0 + CROSS_X1) / 2, AXIS_Z, CLERE_HALF * 2 + 1.0, CLERE_HALF * 2 + 1.0, 1.8, y, h, stone, M.LIMESTONE, c % 2);
    });
    B.spire((CROSS_X0 + CROSS_X1) / 2, AXIS_Z, RIDGE + 2, 109, CLERE_HALF * 2 - 1.0, 1.2, course, stone, M.SLATE, 0.4);
  });

  // ── The apse: a polygonal end to the choir, half a drum of clerestory wall.
  B.section('apse', () => {
    const cx = CHOIR_X1, r = CLERE_HALF + 0.9;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 6; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    pts.push([0, r], [0, -r]);
    const win = (x, y, z) => y > 24 && y < 40 && Math.abs((((Math.atan2(z - AXIS_Z, x - cx) + 10) % 0.52) - 0.26)) < 0.11;
    B.openings(win, () => {
      courses(0, CLERE_H, course, (y, h, c) => {
        B.polyRing(cx, AXIS_Z, pts, 1.8, y, h, stone, M.LIMESTONE, c % 2);
      });
    });
    B.dome(cx, AXIS_Z, CLERE_H, RIDGE - CLERE_H, r, 1.4, course, stone * 1.2, M.SLATE, (t) => 1 - t * 0.92);
  });

  // ── Flying buttresses down both flanks of the nave and the choir: a pier
  // on the aisle wall rising past its roof, and a flyer from the pier's head
  // up to the clerestory wall, corbelled stone by stone so each stands on
  // the one before it.
  B.section('buttresses', () => {
    const flank = (x0, x1) => {
      for (let x = x0 + BAY; x < x1 - 1; x += BAY) {
        for (const sg of [-1, 1]) {
          const pz = AXIS_Z + sg * (AISLE_HALF + 1.2);
          // The pier.
          courses(0, FLYERS_FROM + 4, course * 1.2, (y, h) => {
            const w = 3.2 - (y / (FLYERS_FROM + 4)) * 0.8;
            B.slab(x, y + h / 2, pz, w, h, w, stone, M.LIMESTONE);
          });
          B.pinnacle(x, pz, FLYERS_FROM + 4, 6.0, 2.4, stone, M.LIMESTONE);
          // The flyer: from the pier's inner face at FLYERS_FROM up to the
          // clerestory wall at about 38 m.
          const zIn = AXIS_Z + sg * (CLERE_HALF + 0.9);
          const run = Math.abs(pz - zIn) - 1.6;
          // A corbel: each stone the height of the step, so it stands on the
          // one before rather than sharing its volume, and long enough to
          // overlap it by a third.
          const rise = 0.9, n = Math.max(4, Math.round(11.0 / rise));
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            const z = pz - sg * (1.6 + run * t);
            const yy = FLYERS_FROM + 1.0 + (i + 0.5) * rise;
            B.add(x, yy, z, 0.9, rise / 2 - 0.01, (run / n) * 0.75, M.LIMESTONE);
          }
        }
      }
    };
    flank(NAVE_X0, CROSS_X0);
    flank(CROSS_X1, CHOIR_X1);
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen at the tower lancets on the lower two stages,
 * machine guns at the third, snipers at the fourth and on the crossing
 * turret's base; anti-tank teams in the west portal and at the transept
 * ends; mortars on the aisle roofs, where the flyers are over them but the
 * sky is open between.
 */
export function populateCologneCathedral(g, origin, groundY) {
  const D = DOM;
  const half = D.towerW / 2 - 2.4;
  for (const cz of D.towerZ) {
    D.stages.forEach((y, i) => {
      const type = i < 2 ? 'rifleman' : i === 2 ? 'mg' : 'sniper';
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (const off of [-2.9 * S, 2.9 * S]) {
          g.place(type, new THREE.Vector3(origin.x + nx * half + nz * off, groundY + y, origin.z + cz + nz * half + nx * off),
            Math.atan2(nx, nz), 6, { cover: 'window' });
        }
      }
    });
  }
  // The crossing turret.
  const cx = (D.crossX0 + D.crossX1) / 2;
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.place('sniper', new THREE.Vector3(origin.x + cx + nx * (D.clereHalf + 0.2), groundY + D.ridge + 2.0 * S + 1.0, origin.z + D.axisZ + nz * (D.clereHalf + 0.2)),
      Math.atan2(nx, nz), 7, { cover: 'roof' });
  }
  // Anti-tank teams: the west portal, and the transept ends.
  g.place('at', new THREE.Vector3(origin.x - D.towerW / 2 + 3.0 * S, groundY + 1.0, origin.z + D.axisZ), -Math.PI / 2, 7, { cover: 'arcade' });
  for (const sg of [-1, 1]) {
    g.place('at', new THREE.Vector3(origin.x + cx, groundY + 1.0, origin.z + D.axisZ + sg * (D.transeptHalf - 3.0)), sg > 0 ? 0 : Math.PI, 7, { cover: 'arcade' });
  }
  // Mortars in the open: pits on the Domplatte before the west front and
  // behind the apse. On the aisle roofs, under the flyers and against the
  // clerestory, no arc cleared and the section never fired.
  for (const [x, z] of [[-D.towerW / 2 - 14, D.axisZ + 16], [-D.towerW / 2 - 14, D.axisZ - 16], [D.choirX1 + D.clereHalf + 18, D.axisZ]]) {
    g.place('mortar', new THREE.Vector3(origin.x + x, groundY + 0.4, origin.z + z), 0, 22, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
