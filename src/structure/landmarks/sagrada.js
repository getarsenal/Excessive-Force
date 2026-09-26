import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Sagrada Família, Barcelona.
 *
 * Reference figures (Junta Constructora del Temple, published; the plan from
 * the survey, whose outline runs 108 x 83 m along the Eixample's diagonals
 * with the crossing on the level's origin, the apse to the north-west and
 * the Nativity facade to the north-east):
 *   nave                    90 m from the apse to the Glory front, 45 m
 *                           across the five aisles; the central vault 45 m,
 *                           the aisles 30
 *   the facade towers       four to the Nativity front, 98 and 107 m; four
 *                           to the Passion front, 98 and 112 m
 *   the Evangelists         four round the crossing, 135 m
 *   Mary                    over the apse, 138 m to the star
 *   Jesus                   over the crossing, 172.5 m to the cross
 *
 * A cantilever cluster: eighteen hollow parabolic cones of stone. The eight
 * facade towers rise out of their portals, the Evangelists stand on their own
 * piers at the corners of the crossing, and the two great towers stand on
 * drums whose lower storeys are the church's own arcades — Mary on the
 * twelve piers of the ambulatory, Jesus on the four piers of the crossing,
 * each pier the width of a house. Cut two of the crossing's piers and a
 * hundred and seventy metres of stone comes down through the nave roof; the
 * roof is a corbelled shell and carries nothing.
 *
 * The old work — the apse, the Nativity front and its towers — is the warm
 * brown Montjuïc stone, REDSTONE here (SANDSTONE is Agra's red and reads as
 * a traffic cone through the grade); the rest is the paler stone of the new
 * work, LIMESTONE. The pinnacles are GILT, for the Venetian glass they are faced
 * in. Built at life size and turned 45 degrees to lie on the Eixample's grid,
 * which is where the survey puts it.
 */

const S = 1.0;
const STONE_FINENESS = 0.9;
// The nave axis, from the survey's outline: 45.2 degrees off +x, so +u runs
// south-east to the Glory front and +v south-west to the Passion front.
const YAW = 45.2 * Math.PI / 180;

// Real metres in the church's own frame: u along the nave (+ to the Glory
// front, - to the apse), v across it (+ to the Passion front, - to the
// Nativity). The crossing is at (0, 0).
const AISLE_V = 22.5, AISLE_H = 30.0;         // the outer walls
const CLERE_V = 7.5, CLERE_H = 45.0;          // the central vessel
const RIDGE = 57.0;
const NAVE_U0 = 12.0, NAVE_U1 = 48.0;         // from the crossing to the Glory front
const TRANSEPT_U = 15.0;                      // the transept's outer walls
const FACADE_V = 32.0, FACADE_T = 4.0, FACADE_H = 40.0;
const APSE_C = -15.0, APSE_R = 24.0;          // the chevet, centred on the chancel arch
const WALL = 1.8;
const BAY = 7.5;
const JESUS = { r: 11.0, wall: 3.0, drum: 60.0, base: 75.0, top: 172.5 };
const MARY = { u: -27.0, r: 8.8, wall: 2.4, drum: 58.0, top: 138.0 };
const EVANGELIST = { off: 14.0, r: 5.5, top: 135.0 };
const FACADE_TOWERS = [-15.5, -5.5, 5.5, 15.5];
const NATIVITY_H = [98.0, 107.0, 107.0, 98.0];
const PASSION_H = [98.0, 112.0, 112.0, 98.0];
const TOWER_R = 4.0;
// The old work's stone. SANDSTONE is Agra's red and came out of the grade as
// a traffic cone; the Montjuïc stone is a warm brown-grey, which is REDSTONE.
const OLD = M.REDSTONE;

/** The church's frame to the world's: a rotation about the crossing. */
const cY = Math.cos(YAW), sY = Math.sin(YAW);
const toWorld = (u, v) => ({ x: u * cY - v * sY, z: u * sY + v * cY });

/** What the garrison, the flag and the level record read (world metres). */
export const SAGRADA = {
  scale: S,
  yaw: YAW,
  toWorld: (u, v) => { const p = toWorld(u * S, v * S); return { x: p.x, z: p.z }; },
  aisleV: AISLE_V * S, aisleH: AISLE_H * S, clereV: CLERE_V * S, clereH: CLERE_H * S,
  naveU0: NAVE_U0 * S, naveU1: NAVE_U1 * S, transeptU: TRANSEPT_U * S,
  facadeV: FACADE_V * S, facadeH: FACADE_H * S, apseC: APSE_C * S, apseR: APSE_R * S,
  jesusTop: JESUS.top * S, maryTop: MARY.top * S,
  gallery: 12.0 * S,                    // the aisle galleries' floor
  towers: FACADE_TOWERS.map((u) => u * S),
  /** Rooflines a man can be posted on, low to high. */
  galleries: [12.0 * S, AISLE_H * S, FACADE_H * S],
  flag: (() => { const p = toWorld(0, 0); return { x: p.x, y: (JESUS.top + 0.5) * S, z: p.z }; })(),
};

export function buildSagrada(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 2.2 * s;
  const course = 1.6 * s;
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  // ── Where the towers stand, so no wall or roof is laid through one.
  const towers = [];
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) towers.push({ u: su * EVANGELIST.off, v: sv * EVANGELIST.off, r: EVANGELIST.r + 0.4 });
  for (const u of FACADE_TOWERS) for (const sv of [-1, 1]) towers.push({ u, v: sv * FACADE_V, r: TOWER_R + 0.3 });
  towers.push({ u: 0, v: 0, r: JESUS.r + JESUS.wall / 2 + 0.4 });
  towers.push({ u: MARY.u, v: 0, r: MARY.r + MARY.wall / 2 + 0.4 });
  const inTower = (u, v) => towers.some((t) => Math.hypot(u - t.u, v - t.v) < t.r);

  /** A pointed window: `a` is the distance from the light's axis, y the height. */
  const light = (a, y, y0, y1, half) => {
    if (y < y0 || y > y1 || a > half) return false;
    const headFrom = y1 - half * 1.4;
    if (y < headFrom) return true;
    const t = (y - headFrom) / (y1 - headFrom);
    return a < half * Math.sqrt(Math.max(0, 1 - t * t));
  };

  /**
   * A straight wall along `axis` from a0 to a1 at the cross coordinate
   * `at`, with a pointed window in every bay. `along` is the coordinate down
   * the wall; the corner bays are left blind.
   */
  const wall = (axis, a0, a1, at, thick, h, mat, wins, gallery = false) => {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    const cu = axis === 'u' ? mid : at, cv = axis === 'u' ? at : mid;
    const cut = (x, y, z) => {
      const along = axis === 'u' ? x : z;
      if (inTower(x, z)) return true;
      if (!wins) return false;
      if (along < a0 + BAY * 0.8 || along > a1 - BAY * 0.8) return false;
      const a = Math.abs(((along - a0 + 1000 * BAY) % BAY) - BAY / 2);
      for (const [y0, y1, half] of wins) if (light(a, y, y0, y1, half)) return true;
      return false;
    };
    B.openings(cut, () => {
      courses(0, h, course, (y, ch, c) => {
        // The gallery: one course laid a walk thicker on the inside, which
        // is the ledge the men stand on.
        const g = gallery && Math.abs(y + ch / 2 - 12.0) < ch * 0.51;
        const t = g ? thick + 2.6 : thick;
        const inward = g ? -Math.sign(at) * 1.3 : 0;
        if (axis === 'u') B.slab(cu, y + ch / 2, cv + inward, len, ch, t, stone, mat);
        else B.slab(cu + inward, y + ch / 2, cv, t, ch, len, stone, mat);
      });
    });
  };

  /**
   * A corbelled roof strip: courses stepping from `from` toward `to` across
   * the axis as they rise from y0 to y1, each standing on the one below by
   * more than a third of its thickness. A lean-to when `to` is the higher
   * wall, a gable when called twice toward a ridge.
   */
  const corbel = (axis, a0, a1, from, to, y0, y1, mat) => {
    const run = Math.abs(to - from), rise = y1 - y0;
    const n = Math.max(3, Math.round(rise / (course * 0.75)));
    const step = run / n, rc = rise / n;
    const thick = step + 1.3;
    const dir = Math.sign(to - from);
    for (let i = 0; i < n; i++) {
      const off = from + dir * (step * (i + 0.5));
      const y = y0 + rc * (i + 0.5);
      const cu = axis === 'u' ? (a0 + a1) / 2 : off, cv = axis === 'u' ? off : (a0 + a1) / 2;
      B.openings((x, _y, z) => inTower(x, z), () => {
        if (axis === 'u') B.slab(cu, y, cv, a1 - a0, rc, thick, stone * 1.5, mat);
        else B.slab(cu, y, cv, thick, rc, a1 - a0, stone * 1.5, mat);
      });
    }
  };

  /**
   * A tower of revolution: a polygonal ring narrowing on a parabola from r0
   * at y0 to r1 at y1, hollow where it is wide enough and solid at the tip.
   * `cut` may open windows in it.
   */
  const cone = (cu, cv, y0, y1, r0, r1, sides, mat, cut = null, wallOf = null) => {
    const lay = () => courses(y0, y1, course, (y, h, c) => {
      const t = (y - y0) / (y1 - y0);
      const r = (r0 - r1) * Math.pow(1 - t, 0.72) + r1;
      const w = wallOf ? wallOf(r, t) : Math.max(stone * 0.55, Math.min(r * 0.45, 2.2));
      if (r <= w * 1.15) B.slab(cu, y + h / 2, cv, r * 1.9, h, r * 1.9, stone, mat);
      else B.polyRing(cu, cv, BlockList.circle(r, sides, (c % 2) * (Math.PI / sides)), w, y, h, stone, mat, 0);
    });
    if (cut) B.openings(cut, lay); else lay();
  };

  /**
   * A drum on an arcade: a polygonal ring from the ground with pointed arches
   * cut between piers at the vertices, so the piers are what carries it and
   * the courses over each arch corbel in on each other to the head.
   */
  const arcadeDrum = (cu, cv, r, w, sides, y1, arches, mat, extraCut = null) => {
    const seg = (Math.PI * 2) / arches.count;
    const cut = (x, y, z) => {
      const a = Math.atan2(z - cv, x - cu) + (arches.phase || 0);
      const frac = ((a / seg) % 1 + 1) % 1;
      const off = Math.abs(frac - 0.5);
      if (y > arches.sill && off < arches.half) {
        const head = arches.head - (arches.head - arches.sill) * 0.55 * Math.pow(off / arches.half, 2);
        if (y < head) return true;
      }
      if (arches.win && y > arches.win[0] && off < arches.win[2]) {
        const head = arches.win[1] - (arches.win[1] - arches.win[0]) * 0.5 * Math.pow(off / arches.win[2], 2);
        if (y < head) return true;
      }
      return extraCut ? extraCut(x, y, z) : false;
    };
    B.openings(cut, () => {
      courses(0, y1, course, (y, h, c) => {
        B.polyRing(cu, cv, BlockList.circle(r, sides, (c % 2) * (Math.PI / sides)), w, y, h, stone, mat, 0);
      });
    });
  };

  // ── The nave and the transept: the hall the towers stand in.
  B.section('nave', () => {
    const aisleWins = [[6.0, 24.0, 2.4]];
    const clereWins = [[32.0, 42.0, 2.2]];
    // The nave's outer walls and clerestory, from the crossing to the Glory
    // front, and the Glory front itself, closed, with its rose.
    for (const sv of [-1, 1]) {
      wall('u', NAVE_U0, NAVE_U1, sv * AISLE_V, WALL, AISLE_H, M.LIMESTONE, aisleWins, true);
      wall('u', NAVE_U0, NAVE_U1, sv * CLERE_V, WALL, CLERE_H, M.LIMESTONE, clereWins);
      // The transept's outer walls and clerestory, both arms, from the
      // crossing to the facade. On the apse side the chancel wall takes the
      // outer wall's place below v 22.
      wall('v', 7.5, FACADE_V - FACADE_T / 2, sv * TRANSEPT_U, WALL, AISLE_H, M.LIMESTONE, aisleWins, true);
      wall('v', -(FACADE_V - FACADE_T / 2), -7.5, sv * TRANSEPT_U, WALL, AISLE_H, M.LIMESTONE, aisleWins, true);
      wall('v', 9.0, FACADE_V - FACADE_T / 2, sv * CLERE_V, WALL, CLERE_H, M.LIMESTONE, clereWins);
      wall('v', -(FACADE_V - FACADE_T / 2), -9.0, sv * CLERE_V, WALL, CLERE_H, M.LIMESTONE, clereWins);
    }
    B.openings((x, y, z) => light(Math.abs(z), y, 24.0, 40.0, 5.0) || inTower(x, z), () => {
      courses(0, CLERE_H + 6.0, course, (y, ch) => {
        const gable = y > CLERE_H - 2 ? AISLE_V * (1 - (y - (CLERE_H - 2)) / 8.0) + 2 : AISLE_V;
        B.slab(NAVE_U1 - WALL / 2, y + ch / 2, 0, WALL, ch, Math.max(3.0, gable * 2), stone, M.LIMESTONE);
      });
    });
    // The roofs: aisle lean-tos from the outer walls up to the clerestory,
    // and the gable over the central vessel, nave and transept alike.
    for (const sv of [-1, 1]) {
      corbel('u', NAVE_U0, NAVE_U1 - WALL, sv * (AISLE_V + 0.6), sv * (CLERE_V + WALL), AISLE_H, CLERE_H - 3.0, M.LIMESTONE);
      corbel('u', NAVE_U0, NAVE_U1 - WALL, sv * (CLERE_V + 0.6), sv * 0.4, CLERE_H, RIDGE, M.LIMESTONE);
      for (const sgn of [-1, 1]) {
        const v0 = sgn > 0 ? 7.5 : -(FACADE_V - FACADE_T / 2), v1 = sgn > 0 ? FACADE_V - FACADE_T / 2 : -7.5;
        corbel('v', v0, v1, sv * (TRANSEPT_U + 0.6), sv * (CLERE_V + WALL), AISLE_H, CLERE_H - 3.0, M.LIMESTONE);
        corbel('v', sgn > 0 ? 9.0 : v0, sgn > 0 ? v1 : -9.0, sv * (CLERE_V + 0.6), sv * 0.4, CLERE_H, RIDGE, M.LIMESTONE);
      }
    }

    // The apse: a half-ring of chapels round the ambulatory, closed on the
    // crossing side by the chancel wall with its great arch, and roofed as a
    // half-cone stepping in to the foot of Mary's tower.
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / 8;
      pts.push([Math.cos(a) * APSE_R, Math.sin(a) * APSE_R]);
    }
    const apseCut = (x, y, z) => {
      if (inTower(x, z)) return true;
      // The chancel arch through the chord wall.
      if (Math.abs(x - APSE_C) < WALL * 1.6 && light(Math.abs(z), y, 0, 40.0, 9.0)) return true;
      // Lancets between the chapels.
      const a = Math.atan2(z, x - APSE_C);
      if (Math.cos(a) > -0.05) return false;
      const frac = ((a / (Math.PI / 8)) % 1 + 1) % 1;
      return light(Math.abs(frac - 0.5) * (Math.PI / 8) * APSE_R, y, 8.0, 38.0, 2.6);
    };
    B.openings(apseCut, () => {
      courses(0, CLERE_H, course, (y, h, c) => {
        B.polyRing(APSE_C, 0, pts, WALL * 1.6, y, h, stone, OLD, c % 2);
      });
    });
    const roofN = Math.max(6, Math.round((MARY.drum - CLERE_H) / (course * 0.75)));
    const rStep = (APSE_R - (MARY.r + MARY.wall / 2 + 1.0)) / roofN;
    for (let i = 0; i < roofN; i++) {
      const r = APSE_R - rStep * (i + 0.5);
      const y = CLERE_H + ((MARY.drum - CLERE_H) / roofN) * (i + 0.5);
      const arc = [];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI / 2 + (Math.PI * k) / 8;
        arc.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      B.openings((x, _y, z) => inTower(x, z) || x > APSE_C + 0.5, () => {
        B.polyRing(APSE_C, 0, arc, rStep + 1.3, y - (MARY.drum - CLERE_H) / roofN / 2, (MARY.drum - CLERE_H) / roofN, stone * 1.4, OLD, i % 2);
      });
    }
  });

  // ── A facade: the portal wall with its three doors and the four bell
  // towers rising out of it, hollow cones to their gilt pinnacles.
  const facade = (sv, heights, mat, tag) => {
    B.section(tag, () => {
      const v = sv * FACADE_V;
      const portal = (x, y, z) => inTower(x, z)
        || light(Math.abs(x), y, 0, 20.0, 4.5)
        || light(Math.abs(Math.abs(x) - 11.0), y, 0, 13.0, 2.8);
      B.openings(portal, () => {
        courses(0, FACADE_H + 8.0, course, (y, h) => {
          const half = y > FACADE_H - 3 ? 24.0 * (1 - (y - (FACADE_H - 3)) / 12.0) + 1 : 24.0;
          B.slab(0, y + h / 2, v, Math.max(3.0, half * 2), h, FACADE_T, stone, mat);
        });
      });
      FACADE_TOWERS.forEach((u, i) => {
        const top = heights[i];
        const win = (x, y, z) => {
          if (y < 30 || y > top - 22) return false;
          const a = Math.atan2(z - v, x - u);
          const frac = ((a / (Math.PI / 4)) % 1 + 1) % 1;
          const fy = ((y - 30) % 9.0);
          return Math.abs(frac - 0.5) < 0.16 && fy > 2.0 && fy < 6.5;
        };
        cone(u, v, 0, top - 12.0, TOWER_R, 1.6, 10, mat, win,
          (r, t) => Math.max(stone * 0.55, Math.min(r * 0.42, 1.6)));
        // The pinnacle: the glass-faced finial, solid, in GILT.
        cone(u, v, top - 12.0, top, 1.9, 0.9, 8, M.GILT, null, (r) => r);
      });
    });
  };
  facade(-1, NATIVITY_H, OLD, 'nativity');
  facade(1, PASSION_H, M.LIMESTONE, 'passion');

  // ── The four Evangelists at the corners of the crossing, on their own piers.
  B.section('evangelists', () => {
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const u = su * EVANGELIST.off, v = sv * EVANGELIST.off;
      const win = (x, y, z) => {
        if (y < 50 || y > EVANGELIST.top - 25) return false;
        const a = Math.atan2(z - v, x - u);
        const frac = ((a / (Math.PI / 3)) % 1 + 1) % 1;
        const fy = ((y - 50) % 10.0);
        return Math.abs(frac - 0.5) < 0.14 && fy > 2.0 && fy < 7.0;
      };
      cone(u, v, 0, EVANGELIST.top - 8.0, EVANGELIST.r, 1.8, 12, M.LIMESTONE, win);
      cone(u, v, EVANGELIST.top - 8.0, EVANGELIST.top, 2.6, 1.0, 8, M.GILT, null, (r) => r);
    }
  });

  // ── Mary, over the apse: the ambulatory's twelve piers, the drum, the tower
  // and the star.
  B.section('mary', () => {
    arcadeDrum(MARY.u, 0, MARY.r, MARY.wall, 12, MARY.drum, {
      count: 12, sill: 3.0, half: 0.30, head: 38.0, win: [44.0, 54.0, 0.2],
    }, OLD);
    cone(MARY.u, 0, MARY.drum, MARY.top - 6.0, MARY.r + MARY.wall / 2 - 0.2, 1.8, 12, OLD, null,
      (r, t) => Math.max(stone * 0.55, Math.min(r * 0.4, MARY.wall)));
    cone(MARY.u, 0, MARY.top - 6.0, MARY.top, 3.0, 1.2, 8, M.GILT, null, (r) => r);
  });

  // ── Jesus, over the crossing: four piers a house wide, the four arches of
  // the crossing between them, the drum and the tower to the cross. This is
  // the contract.
  B.section('jesus', () => {
    arcadeDrum(0, 0, JESUS.r, JESUS.wall, 16, JESUS.base, {
      count: 4, phase: Math.PI / 4, sill: 0.0, half: 0.26, head: 42.0, win: [62.0, 72.0, 0.12],
    }, M.LIMESTONE);
    cone(0, 0, JESUS.base, JESUS.top - 8.0, JESUS.r + JESUS.wall / 2 - 0.2, 2.0, 12, M.LIMESTONE, null,
      (r, t) => Math.max(stone * 0.55, Math.min(r * 0.4, JESUS.wall)));
    // The cross.
    cone(0, 0, JESUS.top - 8.0, JESUS.top, 3.2, 1.0, 8, M.GILT, null, (r) => r);
  });

  // ── Into the world's frame: the church lies on the Eixample's diagonals.
  for (const b of B.blocks) {
    const p = toWorld(b.x, b.z);
    b.x = p.x; b.z = p.z;
    b.ry -= YAW;
  }
  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen on the aisle galleries at every other bay, machine
 * guns on the transept galleries, snipers along the tops of the two facade
 * walls and on the aisle roofs against the clerestory, anti-tank teams in
 * the portals, and a mortar section in pits on the two squares.
 */
export function populateSagrada(g, origin, groundY) {
  const K = SAGRADA;
  const P = (u, v, y) => { const p = K.toWorld(u, v); return new THREE.Vector3(origin.x + p.x, groundY + y, origin.z + p.z); };
  // A facing in the church's frame, turned into the world's.
  const F = (a) => a - K.yaw;
  const W = 1.8 * S;
  // The nave galleries: a man every other bay, looking out of the window.
  for (let u = K.naveU0 + 7.5 * S * 1.5; u < K.naveU1 - 7.5 * S; u += 15.0 * S) {
    for (const sv of [-1, 1]) {
      g.place('rifleman', P(u, sv * (K.aisleV - W - 1.6), K.gallery + 0.3), F(sv > 0 ? 0 : Math.PI), 6, { cover: 'window' });
    }
  }
  // The transept galleries: machine guns at the arms' middles.
  for (const sv of [-1, 1]) {
    for (const su of [-1, 1]) {
      g.place('mg', P(su * (K.transeptU - W - 1.6), sv * 21.0 * S, K.gallery + 0.3), F(su > 0 ? Math.PI / 2 : -Math.PI / 2), 6, { cover: 'window' });
    }
  }
  // The facade walls' tops: a walk four metres wide, forty up.
  for (const sv of [-1, 1]) {
    for (const u of [-20, -10, 0, 10, 20]) {
      g.place(u === 0 ? 'mg' : 'sniper', P(u * S, sv * K.facadeV, K.facadeH + 0.6), F(sv > 0 ? 0 : Math.PI), 6, { cover: 'roof' });
    }
  }
  // On the aisle roofs, against the clerestory wall, looking over the eaves.
  for (const sv of [-1, 1]) {
    for (const u of [22, 40]) {
      g.place('sniper', P(u * S, sv * (K.clereV + 3.2 * S), K.clereH - 4.5 * S), F(sv > 0 ? 0 : Math.PI), 6, { cover: 'roof' });
    }
  }
  // Anti-tank teams in the portals of both fronts.
  for (const sv of [-1, 1]) {
    for (const u of [-11, 11]) {
      g.place('at', P(u * S, sv * (K.facadeV - 4.0 * S), 0.8), F(sv > 0 ? 0 : Math.PI), 7, { cover: 'arcade' });
    }
  }
  // Mortars in pits on the Placa de Gaudi and the Placa de la Sagrada Familia.
  for (const sv of [-1, 1]) {
    for (const u of [-14, 14]) {
      g.place('mortar', P(u * S, sv * (K.facadeV + 26 * S), 0.4), 0, 24, { cover: 'ground', emplaced: true, sandbags: true });
    }
  }
}
