import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Great Hypostyle Hall of Karnak, with its two pylons and the Great
 * Court and First Pylon west of it.
 *
 * Reference figures (Chevrier; the Karnak Hypostyle Hall Project, Memphis;
 * the plan from tools/survey.py):
 *   the hall              103 m north-south, 52 m east-west, inside the pylons
 *   central columns       12 in two rows, 21 m to the top of the open papyrus
 *                         capital, 3.6 m across the shaft
 *   side columns          122 in fourteen rows of nine, less the four the
 *                         lateral doors take, 15 m with closed bud capitals,
 *                         2.7 m across
 *   architraves           one bay each, about 1.6 m deep, on the abaci
 *   clerestory            the six metres between the two roof levels, on the
 *                         first side rows, filled with stone grilles
 *   Second Pylon          west of the hall, about 100 m wide and 14 m thick,
 *                         ruined to about 30 m
 *   Third Pylon           east of it, mostly ruined
 *   Great Court           84 m east-west by 100 m, the Kiosk of Taharqa in it
 *   First Pylon           113 m wide, 15 m thick, 43 m and unfinished
 *
 * Kind: a colonnade, the Parthenon's kind, and the biggest one there is.
 * Nothing here is fixed to anything. Drums stand on drums, the architraves
 * lie on the abaci, the roof slabs lie on the architraves, and the whole
 * roof is carried on a hundred and thirty-four points. The twist is the
 * Parthenon's: the lintels are the load path, so cutting a column drops its
 * two architraves and the roof over them, and the column beside it is left
 * holding one end of a beam — and here it happens at two heights, because the
 * clerestory rides on the difference between the fifteen-metre columns and
 * the twenty-one-metre ones. Take a tall column and the central roof falls
 * on the side roof; take a first-row side column and the clerestory wall
 * over it goes, and with it the outer edge of the central roof.
 *
 * One stone throughout, because it is: Nubian sandstone from Gebel Silsila.
 * Laid as LIMESTONE, not SANDSTONE. The game's SANDSTONE is Agra's red, and a
 * first render in it came out as a brick kiln; Karnak's stone is the pale
 * honey the Theban hills are, which is the tan LIMESTONE already carries.
 *
 * The roof is the ruin's: three slabs in four are gone, as they have been
 * for two thousand years, and it is through the gaps that the columns are
 * the picture. The enclosure walls stand to half their height for the same
 * reason.
 */

const S = 2.0;
const STONE_FINENESS = 0.75;
const STONE = M.LIMESTONE;

// Real metres, +x east, +z south. The origin is the centre of the hall.
const HALL_X = 26.5;                 // half the east-west depth, inside the pylons
const HALL_Z = 51.0;                 // half the north-south width, inside the walls
const WALL_T = 3.0;                  // the north and south enclosure walls
// The rows run east-west; these are the rows' z positions on the north half,
// mirrored. The first pair is the nave.
const NAVE_Z = 4.9;
const ROW_GAP = 6.0;
const SIDE_ROWS = 7;
const ROWS_Z = Array.from({ length: SIDE_ROWS }, (_, k) => NAVE_Z + ROW_GAP * (k + 1));
const OUTER_Z = ROWS_Z[SIDE_ROWS - 1];
// Columns along a row.
const COL_X0 = -22.4, COL_X1 = 22.4;
const SIDE_N = 9, NAVE_N = 6;
const SIDE_X = Array.from({ length: SIDE_N }, (_, i) => COL_X0 + (COL_X1 - COL_X0) * i / (SIDE_N - 1));
const NAVE_X = Array.from({ length: NAVE_N }, (_, i) => COL_X0 + (COL_X1 - COL_X0) * i / (NAVE_N - 1));

// The side column: shaft, closed bud capital, abacus, architrave, roof slab.
const SIDE = { h: 15.0, foot: 2.7, top: 2.35, caps: [3.1], capH: 1.8, abW: 2.6, abH: 1.0, beamW: 2.2, beamH: 1.6, roofT: 0.7 };
// The nave column: taller, fatter, the open capital in two flaring courses.
const NAVE = { h: 21.0, foot: 3.6, top: 3.2, caps: [4.4, 5.4], capH: 1.5, abW: 4.0, abH: 1.2, beamW: 3.6, beamH: 1.8, roofT: 0.9 };
const SIDE_ABACUS_TOP = SIDE.h + SIDE.caps.length * SIDE.capH + SIDE.abH;   // 17.8
const SIDE_BEAM_TOP = SIDE_ABACUS_TOP + SIDE.beamH;           // 19.4: the side roof's underside
const SIDE_ROOF_TOP = SIDE_BEAM_TOP + SIDE.roofT;             // 20.1
const NAVE_ABACUS_TOP = NAVE.h + NAVE.caps.length * NAVE.capH + NAVE.abH;   // 25.2
const NAVE_BEAM_TOP = NAVE_ABACUS_TOP + NAVE.beamH;           // 27.0: the clerestory's top
const NAVE_ROOF_TOP = NAVE_BEAM_TOP + NAVE.roofT;             // 27.9
const CLERE_T = 1.4;                                          // the clerestory wall
const CLERE_WIN = { w: 2.4, y0: SIDE_BEAM_TOP + 1.0, y1: SIDE_BEAM_TOP + 5.4 };
// The doorways through the north and south walls.
const DOOR = { w: 4.2, h: 9.0 };
const WALL_H = 12.0;                 // what stands of the enclosure walls

// A pylon: two battered towers either side of a gate portal.
//   x       the pylon's centre line
//   t       its thickness at the ground
//   zOut    how far the towers reach from the axis
//   gate    half the gate's clear width
//   jamb    the jamb piers' thickness (they stand against the towers)
//   hN, hS  the two towers' surviving heights, north and south
//   gateH   the clear height of the gate; lintel and a little wall above
//   gateTop where the masonry over the gate stops
const PYLON_BATTER = 0.06;           // metres in per metre up, on the outer faces
const SKIN = 2.5;                    // the dressed skin over the rubble fill
const GAP = 0.15;                    // between stacks that are not meant to share load; see the pylon
const PYLON2 = { x: -(HALL_X + 7.0), t: 14.0, zOut: HALL_Z + WALL_T, gate: 4.0, jamb: 2.0, hN: 34.0, hS: 30.0, gateH: 24.0, gateTop: 30.0 };
const PYLON3 = { x: HALL_X + 7.0, t: 14.0, zOut: HALL_Z + WALL_T, gate: 4.0, jamb: 2.0, hN: 24.0, hS: 20.0, gateH: 16.0, gateTop: 19.0 };
const COURT = { x0: PYLON2.x - PYLON2.t / 2 - 84.0, x1: PYLON2.x - PYLON2.t / 2, z: 51.5, wallH: 10.0, wallT: 3.0 };
const PYLON1 = { x: COURT.x0 - 7.5, t: 15.0, zOut: 56.5, gate: 4.0, jamb: 2.0, hN: 32.0, hS: 43.0, gateH: 20.0, gateTop: 26.0 };
const KIOSK = { x: (COURT.x0 + COURT.x1) / 2, z: 0, h: 21.0 };

/** A pylon's figures in world metres, for the garrison. */
const pylonOut = (P) => ({
  x: P.x * S, t: P.t * S, zOut: P.zOut * S, gate: P.gate * S, jamb: P.jamb * S,
  hN: P.hN * S, hS: P.hS * S, skin: SKIN * S, batter: PYLON_BATTER,
  /** The x of the skin's top course on the side away from the hall, at a tower's height. */
  skinX(hTop) { return this.x + (this.x < 0 ? -1 : 1) * ((this.t - 2 * this.batter * hTop) / 2 - this.skin / 2); },
});

/** What the garrison, the flag and the level record read. */
export const KARNAK = {
  scale: S,
  hall: { x: HALL_X * S, z: HALL_Z * S },
  sideRoof: SIDE_ROOF_TOP * S,
  naveRoof: NAVE_ROOF_TOP * S,
  naveZ: NAVE_Z * S,
  outerZ: OUTER_Z * S,
  rowGap: ROW_GAP * S,
  wallH: WALL_H * S,
  colX: SIDE_X.map((x) => x * S),
  pylon2: pylonOut(PYLON2),
  pylon3: pylonOut(PYLON3),
  pylon1: pylonOut(PYLON1),
  court: { x0: COURT.x0 * S, x1: COURT.x1 * S, z: COURT.z * S, wallH: COURT.wallH * S },
  door: { h: DOOR.h * S },
  /** Rooflines a man can be posted on, low to high. */
  galleries: [SIDE_ROOF_TOP * S, NAVE_ROOF_TOP * S, PYLON2.hN * S],
  // The flag flies from the north tower of the Second Pylon.
  flag: { x: PYLON2.x * S, y: (PYLON2.hN + 0.5) * S, z: -(PYLON2.gate + PYLON2.jamb + 20.0) * S },
};

export function buildKarnak(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  // The fine tiers are held back a little: at the desktop grain this is
  // fifty-six thousand stones, which the software rasteriser cannot
  // screenshot, and the column drums are fixed-size quarters whatever the
  // tier, so the finer grain bought nothing but count.
  const s = Math.max(quality.blockScale, 1.2) * STONE_FINENESS;
  const stone = 1.3 * s;
  const course = 0.9 * s;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  /**
   * One course of a straight wall along x at z = zc (or along z at x = xc
   * when `axis` is 'z'), from a0 to a1, leaving `gaps` ([from, to] along the
   * run) as openings. Odd courses start with a half stone so the joints
   * bond. `proud` lays the course that much thicker, standing out both ways.
   */
  const run = (axis, c, a0, a1, y, h, thick, st, mat, stagger, gaps = [], proud = 0) => {
    const segs = [];
    let cur = a0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > cur + 0.05) segs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (a1 > cur + 0.05) segs.push([cur, a1]);
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      const n = Math.max(1, Math.round(len / st));
      const parts = [];
      if (stagger && n > 1) {
        const full = len / n;
        parts.push([s0, s0 + full / 2]);
        for (let i = 0; i < n - 1; i++) parts.push([s0 + full / 2 + i * full, s0 + full / 2 + (i + 1) * full]);
        parts.push([s1 - full / 2, s1]);
      } else {
        for (let i = 0; i < n; i++) parts.push([s0 + len * i / n, s0 + len * (i + 1) / n]);
      }
      for (const [p0, p1] of parts) {
        const mid = (p0 + p1) / 2, half = B.shrink((p1 - p0) / 2);
        if (axis === 'x') B.add(mid, y + h / 2, c, half, B.shrink(h / 2), thick / 2 + proud, mat);
        else B.add(c, y + h / 2, mid, thick / 2 + proud, B.shrink(h / 2), half, mat);
      }
    }
  };

  // ── A column: stacked drums with a gentle taper, the capital, the abacus.
  // Drums are quartered (the nave's cut in nine), because one stone per drum
  // at this scale is a block no shell can bite.
  const column = (cx, cz, spec) => {
    const n = Math.max(4, Math.round(spec.h / (course * 1.3)));
    const dh = spec.h / n;
    const cut = spec.foot > 3.0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const d = spec.foot + (spec.top - spec.foot) * t;
      B.slab(cx, i * dh + dh / 2, cz, d, dh, d, d / cut + 0.02, STONE);
    }
    let y = spec.h;
    for (const w of spec.caps) {
      B.slab(cx, y + spec.capH / 2, cz, w, spec.capH, w, w / cut + 0.02, STONE);
      y += spec.capH;
    }
    B.slab(cx, y + spec.abH / 2, cz, spec.abW, spec.abH, spec.abW, spec.abW / cut + 0.02, STONE);
  };

  // ── The columns.
  B.section('columns', () => {
    for (const sz of [-1, 1]) {
      for (const x of NAVE_X) column(x, sz * NAVE_Z, NAVE);
      ROWS_Z.forEach((z) => { for (const x of SIDE_X) column(x, sz * z, SIDE); });
    }
  });

  // ── The architraves: beams from abacus to abacus along every row, in
  // three or four parallel stones so a shell can take one.
  const beams = (z, xs, spec, y, top) => {
    const strands = spec.foot > 3.0 ? 4 : 3;
    const sw = spec.beamW / strands;
    for (let i = 0; i < xs.length - 1; i++) {
      for (let k = 0; k < strands; k++) {
        const zz = z - spec.beamW / 2 + (k + 0.5) * sw;
        B.add((xs[i] + xs[i + 1]) / 2, y + (top - y) / 2, zz, (xs[i + 1] - xs[i]) / 2 - 0.02, (top - y) / 2 - 0.01, sw / 2 - 0.02, STONE);
      }
    }
  };
  B.section('architraves', () => {
    for (const sz of [-1, 1]) {
      beams(sz * NAVE_Z, NAVE_X, NAVE, NAVE_ABACUS_TOP, NAVE_BEAM_TOP);
      for (const z of ROWS_Z) beams(sz * z, SIDE_X, SIDE, SIDE_ABACUS_TOP, SIDE_BEAM_TOP);
    }
  });

  // ── The clerestory: a wall on the first side rows' architraves, up to the
  // nave roof, with the stone grilles cut out of it as windows and a lintel
  // stone over each in the course grid.
  B.section('clerestory', () => {
    const wins = [];
    for (let i = 0; i < SIDE_X.length - 1; i++) {
      const cx = (SIDE_X[i] + SIDE_X[i + 1]) / 2;
      wins.push([cx - CLERE_WIN.w / 2, cx + CLERE_WIN.w / 2]);
    }
    const bear = 0.6;
    for (const sz of [-1, 1]) {
      const zc = sz * ROWS_Z[0];
      courses(SIDE_BEAM_TOP, NAVE_BEAM_TOP, course, (y, h, c) => {
        const yc = y + h / 2;
        const inWin = yc > CLERE_WIN.y0 && yc < CLERE_WIN.y1;
        const lintel = !inWin && y < CLERE_WIN.y1 + 0.02 && y + h > CLERE_WIN.y1 - 0.02;
        if (inWin) {
          run('x', zc, COL_X0, COL_X1, y, h, CLERE_T, stone, STONE, c % 2, wins);
        } else if (lintel) {
          const wide = wins.map(([a, b]) => [a - bear, b + bear]);
          run('x', zc, COL_X0, COL_X1, y, h, CLERE_T, stone, STONE, c % 2, wide);
          for (const [a, b] of wide) B.add((a + b) / 2, yc, zc, (b - a) / 2 - 0.02, h / 2 - 0.01, CLERE_T / 2 + 0.3, STONE);
        } else {
          run('x', zc, COL_X0, COL_X1, y, h, CLERE_T, stone, STONE, c % 2);
        }
      });
    }
  });

  // ── The enclosure walls, north and south, up to the side roof, with the
  // doorway on the axis and a lintel over it.
  B.section('walls', () => {
    for (const sz of [-1, 1]) {
      const zc = sz * (HALL_Z + WALL_T / 2);
      const door = [-DOOR.w / 2, DOOR.w / 2];
      courses(0, WALL_H, course, (y, h, c) => {
        const yc = y + h / 2;
        const inDoor = yc < DOOR.h;
        const lintel = !inDoor && y < DOOR.h + 0.02 && y + h > DOOR.h - 0.02;
        if (inDoor) {
          run('x', zc, -HALL_X + GAP, HALL_X - GAP, y, h, WALL_T, stone, STONE, c % 2, [door]);
        } else if (lintel) {
          const wide = [door[0] - 1.0, door[1] + 1.0];
          run('x', zc, -HALL_X + GAP, HALL_X - GAP, y, h, WALL_T, stone, STONE, c % 2, [wide]);
          // Two lintel stones through the wall's thickness; the outer one proud.
          for (const k of [-1, 1]) {
            const outer = k === sz;
            B.add(0, yc, zc + k * (WALL_T / 4 + (outer ? 0.15 : 0)), (wide[1] - wide[0]) / 2 - 0.02, h / 2 - 0.01, WALL_T / 4 - 0.02 + (outer ? 0.15 : 0), STONE);
          }
        } else {
          run('x', zc, -HALL_X + GAP, HALL_X - GAP, y, h, WALL_T, stone, STONE, c % 2);
        }
      });
    }
  });

  // ── The roof: slabs across each bay, from architrave to architrave, and
  // out over the enclosure wall at the edge. Two levels: the side aisles on
  // the small columns, the nave on the tall ones and the clerestory.
  // Three slabs in four have fallen. Which ones is a fixed hash of the slab's
  // place, so the ruin is the same ruin at every tier and on every load.
  const fallen = (x, z) => ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1 < 0.72;
  const roofBay = (z0, z1, y, t, slabW, xs = [COL_X0, COL_X1]) => {
    const n = Math.max(1, Math.round((xs[1] - xs[0]) / slabW));
    const w = (xs[1] - xs[0]) / n;
    for (let i = 0; i < n; i++) {
      const x = xs[0] + (i + 0.5) * w;
      if (fallen(x, (z0 + z1) / 2)) continue;
      B.add(x, y + t / 2, (z0 + z1) / 2, w / 2 - 0.02, t / 2 - 0.01, Math.abs(z1 - z0) / 2 - 0.02, STONE);
    }
  };
  B.section('roof', () => {
    const slabW = stone * 1.05;
    for (const sz of [-1, 1]) {
      // The side aisles, row to row. The last bay, onto the wall, is gone
      // with the wall's upper courses.
      for (let k = 0; k < ROWS_Z.length - 1; k++) roofBay(sz * ROWS_Z[k], sz * ROWS_Z[k + 1], SIDE_BEAM_TOP, SIDE.roofT, slabW);
      // The nave's outer bays, from the tall columns' architrave to the clerestory.
      roofBay(sz * NAVE_Z, sz * ROWS_Z[0], NAVE_BEAM_TOP, NAVE.roofT, slabW);
    }
    // The nave itself: nearly ten metres between the two rows, in half-width slabs.
    roofBay(-NAVE_Z, NAVE_Z, NAVE_BEAM_TOP, NAVE.roofT, slabW * 0.5);
  });

  // ── A pylon. Two hollow battered towers of dressed skin over a coarse
  // rubble fill, a gate portal between them: jamb piers against the towers'
  // inner faces, lintel stones across, and a few courses of wall on those.
  //
  // Everything that is its own stack stands a hand clear of its neighbour:
  // the fill off the skin, the jambs off the towers, the gate wall off both.
  // The solver counts any touching stone with a lower centre as a supporter
  // and splits load by the count of them, so a coarse fill course leaning on
  // a fine skin course took a share of the whole tower's weight through its
  // side and was crushed at the foot with nobody firing.
  const pylon = (P, k = 1.0) => {
    const st = stone * k, co = course * k;
    const rough = st * 2.2, roughCourse = co * 2.2;
    const tower = (sz, hTop) => {
      const inner = P.gate + P.jamb + GAP;
      courses(0, hTop, co, (y, h, c) => {
        const yc = y + h / 2;
        const w = P.zOut - inner - PYLON_BATTER * yc;    // the outer face batters, the inner is plumb
        const d = P.t - 2 * PYLON_BATTER * yc;
        B.ring(P.x, sz * (inner + w / 2), d, w, SKIN, y, h, st, STONE, c % 2);
      });
      // The fill's grid is fixed in space and carried up, every stone
      // squarely on the one under it; where the battered skin has come in
      // past a stone, that stone is left out. Re-fitting the grid to each
      // course's width put every stone a little inboard of the one below,
      // so each leaned on its inward neighbour as well, and the whole
      // tower's weight walked course by course into the two columns nearest
      // the gate until the bottom of them was at capacity.
      const w0 = P.zOut - inner - 2 * (SKIN + GAP), d0 = P.t - 2 * (SKIN + GAP);
      const nz = Math.max(1, Math.round(w0 / rough)), nx = Math.max(1, Math.round(d0 / rough));
      const pz = w0 / nz, px = d0 / nx;
      const z0 = sz * (inner + SKIN + GAP);
      courses(0, hTop - roughCourse * 0.5, roughCourse, (y, h) => {
        const yc = y + h / 2;
        const w = w0 - PYLON_BATTER * yc;
        const d = d0 - 2 * PYLON_BATTER * yc;
        for (let i = 0; i < nx; i++) {
          const x = -d0 / 2 + (i + 0.5) * px;
          if (Math.abs(x) + px / 2 > d / 2 + 0.01) continue;
          for (let j = 0; j < nz; j++) {
            if ((j + 1) * pz > w + 0.01) continue;
            B.add(P.x + x, yc, z0 + sz * (j + 0.5) * pz,
              B.shrink(px / 2), B.shrink(h / 2), B.shrink(pz / 2), M.RUBBLE);
          }
        }
      });
    };
    tower(-1, P.hN);
    tower(1, P.hS);
    // The jambs.
    for (const sz of [-1, 1]) {
      courses(0, P.gateH, co, (y, h) => {
        const d = P.t - 2 * PYLON_BATTER * (y + h / 2);
        B.slab(P.x, y + h / 2, sz * (P.gate + P.jamb / 2), d, h, P.jamb, st, STONE);
      });
    }
    // The lintels: two courses of beams across the gate, in slices through the
    // pylon's depth, bearing a metre and a half on each jamb.
    const lintelTop = P.gateH + 2.4;
    const span = 2 * (P.gate + P.jamb) - 1.0;
    courses(P.gateH, lintelTop, 1.2, (y, h) => {
      const d = P.t - 2 * PYLON_BATTER * (y + h / 2);
      const n = Math.max(1, Math.round(d / 1.4));
      for (let i = 0; i < n; i++) {
        B.add(P.x - d / 2 + (i + 0.5) * d / n, y + h / 2, 0, (d / n) / 2 - 0.02, h / 2 - 0.01, span / 2 - 0.02, STONE);
      }
    });
    // Wall over the lintels, between the towers.
    if (P.gateTop > lintelTop + 0.5) {
      courses(lintelTop, P.gateTop, co, (y, h) => {
        const d = P.t - 2 * PYLON_BATTER * (y + h / 2);
        B.slab(P.x, y + h / 2, 0, d, h, 2 * (P.gate + P.jamb), st, STONE);
      });
    }
  };
  B.section('pylon2', () => pylon(PYLON2));
  B.section('pylon3', () => pylon(PYLON3));

  // ── The Great Court and the First Pylon, coarse: they are the approach,
  // not the contract.
  B.section('court', () => {
    const cs = stone * 1.6;
    for (const sz of [-1, 1]) {
      courses(0, COURT.wallH, course * 1.4, (y, h, c) => {
        run('x', sz * COURT.z, COURT.x0 + GAP, COURT.x1 - GAP, y, h, COURT.wallT, cs, STONE, c % 2);
      });
    }
    pylon(PYLON1, 1.35);
    // The Kiosk of Taharqa: the one column of ten that still stands.
    column(KIOSK.x, KIOSK.z, { ...NAVE, h: KIOSK.h });
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen and machine guns along the edges of the side roof,
 * where a man on the hall can see over the enclosure wall; snipers on the
 * nave roof and the pylon tops; mortars on the pylons, where nothing is over
 * them; anti-tank teams in the gateways and the lateral doors, under the
 * lintels.
 */
export function populateKarnak(g, origin, groundY) {
  const K = KARNAK;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  // The side roof's north and south edges, over the outermost bay.
  const edgeZ = K.outerZ - K.rowGap / 2;
  [1, 3, 4, 5, 7].forEach((ci, i) => {
    for (const sz of [-1, 1]) {
      g.place(i % 2 ? 'mg' : 'rifleman', V(K.colX[ci], K.sideRoof + 0.3, sz * edgeZ), sz > 0 ? 0 : Math.PI, 7, { cover: 'roof' });
    }
  });
  // Snipers on the nave roof, at either end, looking over the pylons.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.place('sniper', V(sx * (K.colX[K.colX.length - 1] - 4.0), K.naveRoof + 0.3, sz * K.naveZ * 0.5), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 7, { cover: 'roof' });
    }
  }
  // The pylon tops: along the skin's top course on the face away from the
  // hall, spaced along the tower.
  const onTower = (P, sz, hTop, types) => {
    const x = P.skinX(hTop);
    types.forEach((t, i) => {
      g.place(t, V(x, hTop + 0.3, sz * (P.gate + P.jamb + 14.0 + i * 16.0)), P.x < 0 ? -Math.PI / 2 : Math.PI / 2, 8, { cover: 'roof' });
    });
  };
  onTower(K.pylon2, -1, K.pylon2.hN, ['sniper', 'mortar', 'rifleman']);
  onTower(K.pylon2, 1, K.pylon2.hS, ['sniper', 'mortar', 'rifleman']);
  onTower(K.pylon3, -1, K.pylon3.hN, ['rifleman', 'mortar']);
  onTower(K.pylon3, 1, K.pylon3.hS, ['rifleman', 'mortar']);
  onTower(K.pylon1, -1, K.pylon1.hN, ['sniper', 'mortar']);
  onTower(K.pylon1, 1, K.pylon1.hS, ['sniper', 'rifleman']);
  // Anti-tank teams in the gateways, a step inside the jambs.
  for (const P of [K.pylon2, K.pylon3, K.pylon1]) {
    for (const sz of [-1, 1]) {
      g.place('at', V(P.x, 0.6, sz * (P.gate - 2.0)), P.x < 0 ? -Math.PI / 2 : Math.PI / 2, 8, { cover: 'arcade' });
    }
  }
  // Riflemen in the lateral doorways.
  for (const sz of [-1, 1]) {
    g.place('rifleman', V(2.0, 0.6, sz * K.hall.z), sz > 0 ? 0 : Math.PI, 8, { cover: 'arcade' });
  }
  // Two more behind the court walls, on the ground.
  for (const sz of [-1, 1]) {
    g.place('rifleman', V((K.court.x0 + K.court.x1) / 2, 0.6, sz * (K.court.z - 4.0)), sz > 0 ? 0 : Math.PI, 8, { cover: 'ground', sandbags: true });
  }
}
