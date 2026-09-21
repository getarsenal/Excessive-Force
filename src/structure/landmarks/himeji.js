import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * Himeji Castle: the main keep and the west keep on their stone bases.
 *
 * Reference figures (Himeji City, the 2009–15 restoration record):
 *   ishigaki (stone base)    14.85 m high, faces battered about 1 in 3
 *   main keep (daitenshu)    31.5 m over the base, six storeys and a cellar,
 *                            five roofs stepping in, plan ~25 × 20 m at the foot
 *   west keep (nishi-kotenshu) three storeys, joined by a roofed corridor
 *
 * Structurally this is a topple standing on a plinth that does not. The base
 * is a truncated pyramid of dressed stone over fill, and it is ground as far as
 * the guns are concerned: broad, squat, solid, scored against nobody. The keep
 * on it is the other thing entirely — a tall stack of plastered walls and heavy
 * tiled roofs stepping in as it rises, top-heavy by design because a Japanese
 * roof is the heaviest part of the storey under it. Shoot the lower storey's
 * walls away on one side and the whole stack leans that way and goes.
 *
 * Timber is not a material the game has. The walls are MARBLE, which is the
 * white the plaster is and near enough the weight of a plastered timber frame
 * with its clay packing; the roofs and the timber bands under them are SLATE
 * slabs with wide eaves, which are what gives the keep its silhouette and its
 * top-heaviness; the base is LIMESTONE.
 */

const S = 2.5;
const STONE_FINENESS = 0.68;

// Real metres, scaled once at the end.
const BASE_H = 14.85;
const BASE_TOP_W = 26.0, BASE_TOP_D = 21.0;
const BATTER = 0.34;                       // metres out per metre down
const STOREYS = [                          // [width, depth, height] of each storey's walls
  [22.0, 17.5, 6.4],
  [19.4, 15.4, 5.4],
  [16.6, 13.2, 5.0],
  [13.8, 11.0, 4.6],
  [11.0, 8.8, 4.4],
  [8.2, 6.6, 4.2],
];
const ROOF_T = 0.9;                        // a roof course, eave to ridge
const EAVE = 1.25;                         // how far the eaves stand off the wall
const WALL = 0.85;

// The west keep, on a lower base joined by the corridor.
const WEST = { x: -31.0, z: 4.0, baseH: 9.5, topW: 14.0, topD: 12.0,
  storeys: [[12.0, 10.0, 5.2], [9.8, 8.0, 4.6], [7.4, 6.0, 4.2]] };
const CORRIDOR = { w: 5.0, h: 6.0 };

const keepTop = BASE_H + STOREYS.reduce((a, s) => a + s[2] + ROOF_T, 0);

/** The finished castle's dimensions, in world metres, for the garrison. */
export const HIMEJI = {
  scale: S,
  baseH: BASE_H * S, baseTopW: BASE_TOP_W * S, baseTopD: BASE_TOP_D * S,
  storeys: STOREYS.map(([w, d, h]) => ({ w: w * S, d: d * S, h: h * S })),
  roofT: ROOF_T * S, eave: EAVE * S, wall: WALL * S,
  keepTop: keepTop * S,
  west: { x: WEST.x * S, z: WEST.z * S, baseH: WEST.baseH * S, topW: WEST.topW * S, topD: WEST.topD * S,
    storeys: WEST.storeys.map(([w, d, h]) => ({ w: w * S, d: d * S, h: h * S })) },
  // Floor heights of each storey of the main keep, above the ground.
  floors: (() => { const out = []; let y = BASE_H; for (const st of STOREYS) { out.push(y * S); y += st[2] + ROOF_T; } return out; })(),
  // The flag flies from the ridge of the top roof.
  flag: { x: 0, y: keepTop * S + 0.4, z: 0 },
};

export function buildHimejiKeep(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;                     // a 3 cm joint in the world, not 3 cm times the scale
  const s = quality.blockScale * STONE_FINENESS;
  const stone = 1.1 * s;
  const course = 0.9 * s;
  // Equal courses, never a sliver: a storey that ends in a twenty-centimetre
  // remainder under its roof puts a joint on the solver's contact tolerance
  // at this scale, and the roof over it is then standing on nothing.
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  // ── The ishigaki. Solid courses, each a little wider than the one above,
  // so the face batters the way fitted stone does. Coarse stone: it is fill
  // with a dressed face, and it is not what the level is about.
  const base = (cx, cz, topW, topD, h, tag) => {
    B.section(tag, () => {
      courses(0, h, course * 1.6, (y, ch) => {
        const down = h - (y + ch / 2);
        B.slab(cx, y + ch / 2, cz, topW + 2 * BATTER * down, ch, topD + 2 * BATTER * down, stone * 3.4, M.LIMESTONE);
      });
    });
  };
  base(0, 0, BASE_TOP_W, BASE_TOP_D, BASE_H, 'base');
  base(WEST.x, WEST.z, WEST.topW, WEST.topD, WEST.baseH, 'westbase');

  // ── A storey: plastered walls with rows of loopholes, and the roof on it —
  // a wide eave slab standing well off the wall, and a narrower ridge slab
  // above it, which is the tiled roof at the resolution a stone allows.
  const storey = (cx, cz, y0, w, d, h, loopRows, tag) => {
    const hw = w / 2, hd = d / 2;
    // Loopholes: narrow slots in rows, and a wider window in the middle of
    // each face; masonry never laid.
    // Never within a stone and a half of a corner: a slot that cut the
    // corner stone out left the corner pier above it standing on nothing,
    // and the eave over that went with it.
    const holes = (x, y, z) => {
      const onZ = Math.abs(z - cz) > hd - WALL - 0.2, onX = Math.abs(x - cx) > hw - WALL - 0.2;
      if (!onZ && !onX) return false;
      const along = onZ ? x - cx : z - cz;
      const faceHalf = onZ ? hw : hd;
      if (Math.abs(along) > faceHalf - 1.8) return false;
      for (const ry of loopRows) {
        if (Math.abs(y - (y0 + ry)) > 0.4) continue;
        if (Math.abs(along) < 1.1) return true;                       // the window
        if (Math.abs(((Math.abs(along) + 100) % 4.4) - 3.3) < 0.3) return true;  // the slots
      }
      return false;
    };
    B.openings(holes, () => {
      courses(y0, y0 + h, course, (y, ch, c) => {
        const yc = y + ch / 2;
        // White plaster, with the dark timber band under the roof standing
        // a hand proud.
        const top = yc > y0 + h - ch * 1.1;
        B.ring(cx, cz, w, d, WALL, y, ch, stone, top ? M.SLATE : M.MARBLE, c % 2, () => (top ? 0.14 : 0));
      });
    });
    // The floor of this storey, as a thin slab on the walls below (the first
    // storey stands on the base).
    // The roof.
    const ry = y0 + h;
    // The eave slab, wide, and the ridge slab on it — wide enough that the
    // storey above stands on the ridge slab and not on air over the eave.
    B.slab(cx, ry + ROOF_T * 0.3, cz, w + 2 * EAVE, ROOF_T * 0.6, d + 2 * EAVE, stone * 1.5, M.SLATE);
    B.slab(cx, ry + ROOF_T * 0.8, cz, w + EAVE * 0.6, ROOF_T * 0.4, d + EAVE * 0.6, stone * 1.5, M.SLATE);
  };

  // ── The main keep.
  B.section('keep', () => {
    let y = BASE_H;
    STOREYS.forEach(([w, d, h], i) => {
      const rows = i === 0 ? [2.2, 4.6] : [h * 0.55];
      storey(0, 0, y, w, d, h, rows, 'keep');
      y += h + ROOF_T;
    });
    // The ridge ornaments: two shachihoko as small pinnacles at the top ridge ends.
    for (const sx of [-1, 1]) B.pinnacle(sx * STOREYS[5][0] * 0.3, 0, y, 1.4, 0.9, stone, M.SLATE);
  });

  // ── The west keep.
  B.section('westkeep', () => {
    let y = WEST.baseH;
    WEST.storeys.forEach(([w, d, h], i) => {
      storey(WEST.x, WEST.z, y, w, d, h, i === 0 ? [2.0] : [h * 0.55], 'westkeep');
      y += h + ROOF_T;
    });
  });

  // ── The corridor between them: a two-storey roofed gallery on its own
  // stretch of base, from the west keep's base to the main one's.
  B.section('corridor', () => {
    // From the west base's top edge to the main base's face at the corridor's
    // own height: the base is battered, and a wall ended at its top edge was
    // laid a metre and a half inside the stone below.
    const x0 = WEST.x + WEST.topW / 2, x1 = -(BASE_TOP_W / 2 + BATTER * (BASE_H - WEST.baseH) + 0.4);
    const cx = (x0 + x1) / 2, len = x1 - x0;
    const cz = WEST.z * 0.5;
    // Its own base, up to the west keep's base height.
    courses(0, WEST.baseH, course * 1.6, (y, ch) => {
      const down = WEST.baseH - (y + ch / 2);
      B.slab(cx, y + ch / 2, cz, len + 1.0, ch, CORRIDOR.w + 2 * BATTER * down, stone * 3.4, M.LIMESTONE);
    });
    const holes = (x, yy, z) => Math.abs(z - cz) > CORRIDOR.w / 2 - WALL - 0.2 && Math.abs(yy - (WEST.baseH + 2.2)) < 0.5
      && Math.abs((((x - cx) + 100) % 3.0) - 1.5) < 0.3;
    B.openings(holes, () => {
      courses(WEST.baseH, WEST.baseH + CORRIDOR.h, course, (yy, ch, c) => {
        B.ring(cx, cz, len + 1.0, CORRIDOR.w, WALL, yy, ch, stone, yy > WEST.baseH + CORRIDOR.h - ch * 1.1 ? M.SLATE : M.MARBLE, c % 2);
      });
    });
    B.slab(cx, WEST.baseH + CORRIDOR.h + ROOF_T * 0.3, cz, len + 1.0 + 2 * EAVE * 0.7, ROOF_T * 0.6, CORRIDOR.w + 2 * EAVE * 0.7, stone * 1.5, M.SLATE);
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen at the loopholes of the first three storeys, machine
 * guns in the corner windows of the second, snipers at the top storey, the
 * anti-tank teams on the edge of the stone base under the eaves, and mortars
 * on the open part of the base to the west, where nothing is over them.
 */
export function populateHimejiKeep(g, origin, groundY) {
  const H = HIMEJI;
  // At the windows: a man a step inside each face, at the storey's loophole row.
  H.storeys.slice(0, 4).forEach((st, i) => {
    const y = groundY + H.floors[i] + (i === 0 ? 2.2 : st.h * 0.22) * S;
    const hw = st.w / 2 - H.wall - 0.6, hd = st.d / 2 - H.wall - 0.6;
    const along = i === 0 ? [-0.6, 0, 0.6] : [-0.5, 0.5];
    for (const f of along) {
      for (const sz of [-1, 1]) {
        g.place(i === 1 && Math.abs(f) > 0.4 ? 'mg' : i === 3 ? 'sniper' : 'rifleman',
          new THREE.Vector3(origin.x + f * hw, y, origin.z + sz * hd), sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
      }
      for (const sx of [-1, 1]) {
        g.place(i === 1 && Math.abs(f) > 0.4 ? 'mg' : i === 3 ? 'sniper' : 'rifleman',
          new THREE.Vector3(origin.x + sx * hw, y, origin.z + f * hd), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'window' });
      }
    }
  });
  // Anti-tank teams on the corners of the base top, outside the eaves.
  const bw = H.baseTopW / 2 - 1.2, bd = H.baseTopD / 2 - 1.2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1]]) {
    g.place('at', new THREE.Vector3(origin.x + sx * bw, groundY + H.baseH + 0.6, origin.z + sz * bd),
      Math.atan2(sx, sz), 7, { cover: 'roof' });
  }
  // The west keep: riflemen at its first storey, a gun on its second.
  const W = H.west;
  for (const sz of [-1, 1]) {
    g.place('rifleman', new THREE.Vector3(origin.x + W.x, groundY + W.baseH + 2.0 * S, origin.z + W.z + sz * (W.storeys[0].d / 2 - H.wall - 0.6)),
      sz > 0 ? 0 : Math.PI, 6, { cover: 'window' });
  }
  g.place('mg', new THREE.Vector3(origin.x + W.x - (W.storeys[1].w / 2 - H.wall - 0.6), groundY + W.baseH + W.storeys[0].h + H.roofT + W.storeys[1].h * 0.22, origin.z + W.z),
    -Math.PI / 2, 6, { cover: 'window' });
  // Mortars on the west keep's base, clear of the eaves, and one east of the keep.
  for (const [x, z] of [[W.x - W.topW / 2 + 2.5, W.z + W.topD / 2 - 2.0], [W.x - W.topW / 2 + 2.5, W.z - W.topD / 2 + 2.0]]) {
    g.place('mortar', new THREE.Vector3(origin.x + x, groundY + W.baseH + 0.6, origin.z + z), 0, 8, { cover: 'roof' });
  }
  g.place('mortar', new THREE.Vector3(origin.x + bw - 0.5, groundY + H.baseH + 0.6, origin.z), 0, 8, { cover: 'roof' });
}
