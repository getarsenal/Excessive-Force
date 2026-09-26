import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Tower Bridge, London.
 *
 * Reference figures (Barry and Jones's drawings, the Corporation of London;
 * the survey, which puts the origin on Tower Hill at 6.9 m with the Tower of
 * London's White Tower 57 m north of it, the Thames beginning 70 m south and
 * running 280 m wide to the Bermondsey bank):
 *   over all           244 m: an 82 m side span, a tower on its pier, the 61 m
 *                      central span (the bascules), the second tower, the
 *                      second side span, an abutment at either end
 *   towers             about 26 × 20 m in plan, 65 m to the pinnacles, steel
 *                      frames clad in Portland stone and Cornish granite
 *   walkways           two lattice galleries 44 m over the water between the
 *                      towers, above the bascules
 *   chains             the side spans hang from chains that run from the
 *                      tower tops down to the abutment towers
 *   piers              about 56 × 21 m, founded in the river bed
 *
 * Kind: a cantilever pair tied by a bridge. The towers stand on their piers;
 * the side spans rest on the towers and the abutments, the closed bascules
 * meet between the towers, and the walkways tie the towers at the top. Cut
 * the north tower's pier and the tower, the walkway ends and both spans on it
 * go into the river. The piers are founded below the bed, coarse and bare
 * under the water.
 *
 * Nothing in this solver spans sixty metres: a stone reaches five metres
 * sideways for bearing, no more. What holds the decks and the walkways out
 * is the solver's own cantilever pass — a stranded stone alongside a stone
 * that is standing takes a bearing edge to it, repeated outward, bounded to a
 * twentieth of the structure — which is what carries the Redeemer's arms.
 * The chains hang on hangers from the deck, as the real ones nearly do.
 *
 * LIMESTONE for the facing, STEEL for the walkways and chains, IRONWORK for
 * the decks and the bascule leaves, SLATE roofs, GILT finials.
 */

const S = 1.6;
const STONE_FINENESS = 0.9;

// Real metres, scaled once at the end. +z is south, across the river.
const DECK = 8.0;                          // the roadway, above Tower Hill
const FOUND = -14.0;                       // the piers' footing, under the bed
const WATER = -0.5;                        // where dressed stone gives way to bare footing
const ABUT = { len: 14.0, w: 30.0 };       // an abutment block along z, across x
const ABUT_TOWER = { w: 6.0, h: 22.0 };    // the little towers at the abutments' corners
const PIER = { len: 21.0, w: 50.0, cut: 8.0, top: 3.0 };
const TOWER = { w: 26.0, d: 20.0, wall: 2.6, top: 50.0, roof: 60.0, turret: 62.0, finial: 64.5 };
const SIDE_SPAN = 82.0 - PIER.len / 2 - TOWER.d / 2;   // clear, abutment face to tower face: ~61.5
const CENTRAL = 61.0;
const NT_Z = ABUT.len + SIDE_SPAN + TOWER.d / 2;      // north tower centre: ~85.5
const ST_Z = NT_Z + TOWER.d + CENTRAL;                // south tower centre: ~166.5
const S_ABUT_Z0 = ST_Z + TOWER.d / 2 + SIDE_SPAN;     // south abutment's north face
const LENGTH = S_ABUT_Z0 + ABUT.len;                  // ~262
const DECK_W = 18.0, LANES = 3, PLATE_L = 3.0, PLATE_T = 0.7;
const WALK = { x: 6.0, w: 4.0, floor: 43.0, rail: 3.0, plate: 4.0, t: 0.8 };
const CHAIN = { x: 8.6, top: 34.0, low: DECK + 4.0, seg: 3.0, t: 0.8 };   // top under the walkways: the links hang from the deck, and stay below a cut through the towers

/** What the garrison, the flag and the level record read. */
export const TOWERBRIDGE = {
  scale: S,
  deck: DECK * S, deckW: DECK_W * S,
  abut: { len: ABUT.len * S, w: ABUT.w * S, towerW: ABUT_TOWER.w * S, towerH: ABUT_TOWER.h * S },
  towers: { north: NT_Z * S, south: ST_Z * S, w: TOWER.w * S, d: TOWER.d * S, wall: TOWER.wall * S, top: TOWER.top * S },
  windows: [22.0 * S, 32.0 * S],           // sills of the two window tiers
  walk: { x: WALK.x * S, w: WALK.w * S, floor: WALK.floor * S, z0: (NT_Z + TOWER.d / 2) * S, z1: (ST_Z - TOWER.d / 2) * S },
  southAbutZ: S_ABUT_Z0 * S,
  length: LENGTH * S,
  /** Rooflines a man can be posted on, low to high. */
  galleries: [DECK * S, WALK.floor * S, TOWER.top * S],
  // The flag flies from the north tower's roof.
  flag: { x: 0, y: (TOWER.roof + 0.5) * S, z: NT_Z * S },
};

export function buildTowerbridge(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.3 * s;
  const course = 0.95 * s;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  const rough = stone * 3.0, roughCourse = course * 2.6;

  // ── The abutments: a block of masonry to the deck, and a little tower at
  // each river-side corner with a slate cap.
  const abutment = (z0) => {
    const cz = z0 + ABUT.len / 2;
    courses(-4.0, 0, roughCourse, (y, h) => B.slab(0, y + h / 2, cz, ABUT.w, h, ABUT.len, rough, M.CONCRETE));
    courses(0, DECK, course, (y, h, c) => {
      B.ring(0, cz, ABUT.w, ABUT.len, 3.0, y, h, stone, M.LIMESTONE, c % 2, (x) => (y + h > DECK - 0.8 ? 0.3 : 0));
      B.slab(0, y + h / 2, cz, ABUT.w - 6.0, h, ABUT.len - 6.0, stone * 2.2, M.RUBBLE);
    });
    for (const sx of [-1, 1]) {
      const tx = sx * (ABUT.w / 2 - ABUT_TOWER.w / 2 - 1.0);
      const tz = z0 < LENGTH / 2 ? z0 + ABUT.len - ABUT_TOWER.w / 2 - 1.0 : z0 + ABUT_TOWER.w / 2 + 1.0;
      const win = (x, y, z) => y > DECK + 6 && y < DECK + 11 && Math.abs(x - tx) < 0.9 && Math.abs(z - tz) > ABUT_TOWER.w / 2 - 1.2;
      B.openings(win, () => {
        courses(DECK, DECK + ABUT_TOWER.h, course, (y, h, c) => {
          B.ring(tx, tz, ABUT_TOWER.w, ABUT_TOWER.w, 1.4, y, h, stone, M.LIMESTONE, c % 2, () => (y + h > DECK + ABUT_TOWER.h - 1.0 ? 0.35 : 0));
        });
      });
      B.pinnacle(tx, tz, DECK + ABUT_TOWER.h, 5.0, ABUT_TOWER.w + 0.6, stone, M.SLATE);
    }
  };
  B.section('abutments', () => { abutment(0); abutment(S_ABUT_Z0); });

  // ── A pier and the tower on it.
  const pier = (cz) => {
    const block = (y, h, st, mat) => {
      B.slab(0, y + h / 2, cz, PIER.w, h, PIER.len, st, mat);
      for (const sx of [-1, 1]) B.slab(sx * (PIER.w / 2 + PIER.cut / 2), y + h / 2, cz, PIER.cut, h, PIER.len * 0.6, st, mat);
    };
    courses(FOUND, WATER, roughCourse, (y, h) => block(y, h, rough, M.CONCRETE));
    courses(WATER, PIER.top, course, (y, h) => block(y, h, stone * 1.6, M.LIMESTONE));
  };
  const tower = (cz, tag) => {
    const hw = TOWER.w / 2, hd = TOWER.d / 2;
    // The road arches through the tower, north and south faces, and the
    // walkway doors high up on the face toward the central span.
    const toCentre = cz < LENGTH / 2 ? 1 : -1;
    const holes = (x, y, z) => {
      const onZ = Math.abs(Math.abs(z - cz) - hd) < TOWER.wall + 0.1;
      const onX = Math.abs(Math.abs(x) - hw) < TOWER.wall + 0.1;
      if (onZ) {
        // The road arch: 12 m wide, springing 5 m over the deck.
        if (Math.abs(x) < 6.0 && y > DECK - 0.01 && (y < DECK + 5.0 || x * x + (y - DECK - 5.0) ** 2 < 36)) return true;
        // The walkway doors, on the face toward the central span.
        if ((z - cz) * toCentre > 0 && y > WALK.floor - 0.2 && y < WALK.floor + 4.6 && Math.abs(Math.abs(x) - WALK.x) < WALK.w / 2 - 0.3) return true;
      }
      if (!onZ && !onX) return false;
      const along = onZ ? x : z - cz;
      const faceHalf = onZ ? hw : hd;
      if (Math.abs(along) > faceHalf - 3.4) return false;
      // Two tiers of paired lancets on every face.
      for (const y0 of [22.0, 32.0]) {
        if (y > y0 && y < y0 + 7.0 && Math.abs(Math.abs(along) - 2.6) < 1.0) return true;
        if (y >= y0 + 7.0 && (Math.abs(along) - 2.6) ** 2 + (y - y0 - 7.0) ** 2 < 1.0) return true;
      }
      return false;
    };
    const relief = (x, z, y) => {
      if (y > TOWER.top - 1.4) return 0.6;                                        // the cornice
      if (Math.abs(y - (DECK + 11.0)) < 0.5 || Math.abs(y - 30.5) < 0.5) return 0.25;   // string courses
      const cx = Math.abs(x) > hw - 3.2, cz2 = Math.abs(z - cz) > hd - 3.2;
      return cx && cz2 ? 0.5 : 0;                                                 // the corner turrets' bases
    };
    B.section(tag, () => {
      // Solid from the pier to the deck: the base the roadway runs over.
      courses(PIER.top, DECK, course, (y, h) => B.slab(0, y + h / 2, cz, TOWER.w, h, TOWER.d, stone * 1.6, M.LIMESTONE));
      B.openings(holes, () => {
        courses(DECK, TOWER.top, course, (y, h, c) => {
          B.ring(0, cz, TOWER.w, TOWER.d, TOWER.wall, y, h, stone, M.LIMESTONE, c % 2, (x, z) => relief(x, z, y + h / 2));
        });
      });
      // The roof: a hollow pyramid of slate courses stepping in on the walls.
      courses(TOWER.top, TOWER.roof, course, (y, h, c) => {
        const t = (y + h / 2 - TOWER.top) / (TOWER.roof - TOWER.top);
        const w = TOWER.w * (1 - t * 0.9), d = TOWER.d * (1 - t * 0.9);
        if (w <= TOWER.wall * 2.3 || d <= TOWER.wall * 2.3) B.slab(0, y + h / 2, cz, Math.max(w, stone), h, Math.max(d, stone), stone, M.SLATE);
        else B.ring(0, cz, w, d, TOWER.wall * 1.1, y, h, stone, M.SLATE, c % 2);
      });
      // Corner turrets with gilt finials.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const tx = sx * (hw - 1.8), tz = cz + sz * (hd - 1.8);
          B.pinnacle(tx, tz, TOWER.top, TOWER.turret - TOWER.top, 3.6, stone * 0.9, M.LIMESTONE);
          B.slab(tx, (TOWER.turret + TOWER.finial) / 2, tz, 1.0, TOWER.finial - TOWER.turret, 1.0, 1.2, M.GILT);
        }
      }
    });
  };
  B.section('piers', () => { pier(NT_Z); pier(ST_Z); });
  tower(NT_Z, 'northtower');
  tower(ST_Z, 'southtower');

  // ── The decks: plates of ironwork, three lanes across, from the abutment
  // face to the tower face and on through the tower over its solid base.
  //
  // Cambered: every plate stands a couple of centimetres higher than the one
  // behind it toward the middle of the span. The solver's runtime walk
  // settles lower stones first and runs five rounds; along a level chain of
  // plates whose bearing edges point back toward the tower the reach could
  // travel only one plate a round in one of the two directions, and the
  // seventh plate out came loose. With the camber every plate is higher than
  // the one it bears on, whichever end it was reached from, and the walk
  // settles the whole chain in one round. A real deck has the camber anyway.
  const CAMBER = 0.02;
  const deck = (z0, z1, mat) => {
    const n = Math.max(1, Math.round((z1 - z0) / PLATE_L));
    const pl = (z1 - z0) / n;
    const lw = DECK_W / LANES;
    for (let k = 0; k < n; k++) {
      const z = z0 + (k + 0.5) * pl;
      const rise = CAMBER * Math.min(k, n - 1 - k);
      for (let l = 0; l < LANES; l++) {
        const x = -DECK_W / 2 + (l + 0.5) * lw;
        B.add(x, DECK - PLATE_T / 2 + rise, z, B.shrink(lw / 2), B.shrink(PLATE_T / 2), B.shrink(pl / 2), mat);
      }
    }
  };
  B.section('northspan', () => deck(ABUT.len, NT_Z - TOWER.d / 2 + TOWER.wall + 0.6, M.IRONWORK));
  B.section('bascules', () => deck(NT_Z + TOWER.d / 2 - TOWER.wall - 0.6, ST_Z - TOWER.d / 2 + TOWER.wall + 0.6, M.IRONWORK));
  B.section('southspan', () => deck(ST_Z + TOWER.d / 2 - TOWER.wall - 0.6, S_ABUT_Z0, M.IRONWORK));

  // ── The chains over the side spans: a steel link every plate, hung on a
  // hanger from the deck's edge, falling from the tower to the abutment tower.
  B.section('chains', () => {
    const span = (zTower, zAbut) => {
      const len = Math.abs(zAbut - zTower);
      const n = Math.max(2, Math.round(len / CHAIN.seg));
      const seg = len / n;
      const dir = Math.sign(zAbut - zTower);
      // A link's width clear of the tower at one end and the abutment tower
      // at the other. A chain that touched the tower was a path for the
      // solver's bearing walk from the deck, up the hangers and along the
      // links into the tower top, and a tower cut clean through stood on it.
      for (let k = 1; k < n - 1; k++) {
        const z = zTower + dir * (k + 0.5) * seg;
        const t = ((k + 0.5) / n);
        const y = CHAIN.top - (CHAIN.top - CHAIN.low) * Math.pow(t, 1.5);
        for (const sx of [-1, 1]) {
          const x = sx * CHAIN.x;
          // The hanger, from the deck to the link.
          const hangerTop = y - CHAIN.t / 2;
          B.add(x, (DECK + hangerTop) / 2, z, 0.2, (hangerTop - DECK) / 2 - 0.01, 0.2, M.RAILING);
          // RAILING, not STEEL: a chain is in tension and nothing may rest on
          // it. As a stack of steel links it was a bearing path from the tower
          // top down to the abutment, and the top of a tower cut clean through
          // stood on its own chains.
          B.add(x, y, z, CHAIN.t / 2, CHAIN.t / 2, B.shrink(seg / 2), M.RAILING);
        }
      }
    };
    span(NT_Z - TOWER.d / 2, ABUT.len - 1.0);
    span(ST_Z + TOWER.d / 2, S_ABUT_Z0 + 1.0);
  });

  // ── The walkways: two galleries between the towers, a plate floor with
  // lattice sides and a plate roof, held out from the towers.
  B.section('walkways', () => {
    const z0 = NT_Z + TOWER.d / 2 + 0.05, z1 = ST_Z - TOWER.d / 2 - 0.05;
    const n = Math.max(2, Math.round((z1 - z0) / WALK.plate));
    const pl = (z1 - z0) / n;
    for (const sx of [-1, 1]) {
      const x = sx * WALK.x;
      for (let k = 0; k < n; k++) {
        const z = z0 + (k + 0.5) * pl;
        const f = WALK.floor + CAMBER * Math.min(k, n - 1 - k);   // cambered, as the deck is
        B.add(x, f + WALK.t / 2, z, B.shrink(WALK.w / 2), B.shrink(WALK.t / 2), B.shrink(pl / 2), M.STEEL);
        for (const side of [-1, 1]) {
          B.add(x + side * (WALK.w / 2 - 0.2), f + WALK.t + WALK.rail / 2, z, 0.18, B.shrink(WALK.rail / 2), B.shrink(pl / 2) - 0.05, M.RAILING);
        }
        B.add(x, f + WALK.t + WALK.rail + 0.3, z, B.shrink(WALK.w / 2 + 0.2), 0.3, B.shrink(pl / 2), M.STEEL);
      }
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen at the towers' lower windows, machine guns at the
 * upper ones on the river faces, snipers in the walkways looking down the
 * river both ways, anti-tank teams in the road arches and on the abutments,
 * mortars on the abutments behind their little towers.
 */
export function populateTowerbridge(g, origin, groundY) {
  const T = TOWERBRIDGE;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const hw = T.towers.w / 2 - T.towers.wall * 0.5, hd = T.towers.d / 2 - T.towers.wall * 0.5;
  for (const cz of [T.towers.north, T.towers.south]) {
    // Lower tier: riflemen, one each face.
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.place('rifleman', V(ux * hw, T.windows[0] + 0.3, cz + uz * hd), Math.atan2(ux, uz), 6, { cover: 'window' });
    }
    // Upper tier: machine guns on the river faces.
    for (const ux of [-1, 1]) {
      g.place('mg', V(ux * hw, T.windows[1] + 0.3, cz), Math.atan2(ux, 0), 6, { cover: 'window' });
    }
    // The road arches: an AT team either side of the roadway on the tower's base.
    for (const sx of [-1, 1]) {
      g.place('at', V(sx * (T.deckW / 2 - 1.5), T.deck + 0.3, cz), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'arcade' });
    }
  }
  // The walkways: snipers, two per gallery, looking out over the river.
  for (const sx of [-1, 1]) {
    for (const f of [0.3, 0.7]) {
      const z = T.walk.z0 + (T.walk.z1 - T.walk.z0) * f;
      g.place('sniper', V(sx * T.walk.x, T.walk.floor + 0.8 * T.scale + 0.3, z), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'window' });
    }
  }
  // The abutments: riflemen in the little towers, AT on the deck end, mortars behind.
  for (const [z0, dir] of [[0, 1], [T.southAbutZ, -1]]) {
    const cz = z0 + T.abut.len / 2;
    for (const sx of [-1, 1]) {
      const tx = sx * (T.abut.w / 2 - T.abut.towerW / 2 - 1.0 * T.scale);
      const tz = dir > 0 ? z0 + T.abut.len - T.abut.towerW / 2 - 1.0 * T.scale : z0 + T.abut.towerW / 2 + 1.0 * T.scale;
      g.place('rifleman', V(tx, T.deck + 6.0 * T.scale + 0.3, tz), Math.atan2(sx, 0), 6, { cover: 'window' });
    }
    g.place('at', V(0, T.deck + 0.3, cz), dir > 0 ? 0 : Math.PI, 6, { cover: 'ground' });
    for (const sx of [-0.6, 0.6]) g.place('mortar', V(sx * T.deckW / 2, T.deck + 0.3, cz - dir * 3.0 * T.scale), 0, 6, { cover: 'roof' });
  }
}
