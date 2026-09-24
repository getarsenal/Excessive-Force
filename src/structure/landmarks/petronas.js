import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Petronas Towers, and the one thing about them everybody gets wrong.
 *
 * Reference figures (Cesar Pelli & Associates; Thornton Tomasetti; Petronas):
 *   height              451.9 m to the tip of each pinnacle, 375 m to the roof
 *   floors              88, with setbacks at 60, 73, 82 and 88
 *   plan                two squares rotated 45° with eight semicircles in the
 *                       re-entrant angles — the Rub el Hizb, 46 m across
 *   frame               a 23 m reinforced-concrete core ring-beamed to sixteen
 *                       perimeter columns; high-strength concrete, not steel
 *   skybridge           58.4 m clear span at the 41st and 42nd floors, 170 m up
 *
 * The twist is the bridge. It is the first thing anybody shoots at and it is
 * the one part of the building that cannot bring anything down with it: it is
 * not fixed to either tower. It sits on a two-hinged arch springing from the
 * 29th floor of each and slides on bearings at both ends, because two
 * four-hundred-metre towers sway independently and a rigid link between them
 * would tear itself apart on a windy afternoon. So the bridge is a free body
 * held up at two points, and taking it costs the towers nothing at all. Both
 * of them are the contract.
 *
 * Materials as Dubai's: `SPINE` for the core, which is the one thing holding
 * the building up and is gated so that a shoulder-fired rocket cannot cut it;
 * `CURTAIN` for the frame, coloured as the stainless-and-glass skin it wears;
 * `RAFT` for the lowest levels, where the whole weight arrives.
 */

// Nine tenths of life size — four hundred and seven metres to the tip. Under
// the Burj by two hundred and fifty, which is the point: this is the tower
// that was the tallest in the world until that one, and the campaign should
// be able to tell them apart from the opening camera.
const S = 0.9;
const STONE_FINENESS = 2.2;

// Real metres, scaled once at the end.
const PLAN_R = 23.0;             // half the 46 m plan across the star's points
const CORE = 11.5;               // half the 23 m core
const CORE_WALL = 1.5;
const COL_R = 22.0;              // the ring of sixteen perimeter columns
const GAP = 52.0;                // half the centre-to-centre of the two towers
const ROOF = 375.0;
const BRIDGE_Y = 170.0;
const BRIDGE_W = 8.2;            // the deck, wide enough to read at half a kilometre
const PODIUM = { w: 190.0, d: 126.0, h: 26.0 };
const DECK = 2.0;                // the plaza slab over the podium, and the towers' floor
const SETBACKS = [
  // [height the stage ends at, the plan's radius through it]
  [255.0, 1.0],
  [300.0, 0.86],
  [340.0, 0.72],
  [ROOF, 0.58],
];

/**
 * The floor plate: two squares at 45° to each other with a semicircle let into
 * each of the eight re-entrant angles. Sampled as one outline rather than
 * assembled from parts, because what the wall wants is a closed polygon.
 */
function star(r, n = 48) {
  const sq = (t, phase) => {
    const u = ((t - phase) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4;
    return (r * Math.SQRT1_2) / Math.cos(u);
  };
  // The lobes sit on the inner corners, where the two squares cross.
  const lobeR = r * 0.30;
  const lobeAt = r * 0.735;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let rad = Math.min(sq(t, 0), sq(t, Math.PI / 4));
    // Union with the eight semicircles: the nearest lobe centre, solved for
    // the ray's intersection with that circle.
    const k = Math.round(t / (Math.PI / 4));
    const ca = k * (Math.PI / 4) + Math.PI / 8;
    const d = Math.cos(t - ca) * lobeAt;
    const h2 = lobeR * lobeR - (lobeAt * lobeAt - d * d);
    if (h2 > 0) rad = Math.max(rad, d + Math.sqrt(h2));
    pts.push([Math.cos(t) * rad, Math.sin(t) * rad]);
  }
  return pts;
}

/** What the garrison and the level record read. */
export const PETRONAS = {
  scale: S,
  planR: PLAN_R * S,
  gap: GAP * S,
  roof: ROOF * S,
  bridgeY: BRIDGE_Y * S,
  bridgeSpan: (GAP - COL_R) * 2 * S,
  podium: { w: PODIUM.w * S, d: PODIUM.d * S, h: PODIUM.h * S },
  colR: COL_R * S,
  /** The two tower axes, in world metres from the level origin. */
  towers: [-GAP * S, GAP * S],
  /** On the west tower's roof, at the foot of the mast. */
  flag: { x: -GAP * S, y: (ROOF + 1.0) * S, z: 0 },
  /** Floor heights a man can be posted on, low to high. */
  floors: (() => {
    const out = [];
    for (let y = 44; y < ROOF - 20; y += 41) out.push(y * S);
    return out;
  })(),
};

export function buildPetronasTowers(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  // Capped at the coarse end. A stone the guns cannot bite is not a stone:
  // at the phone tier the uncapped grain put six-metre blocks in the podium,
  // a hundred and thirty cubic metres each, which is five times anything on
  // the Taj and more than one 155 mm round can take out.
  const s = Math.min(quality.blockScale, 1.35) * STONE_FINENESS;
  const stone = 1.35 * s;
  const course = 1.75 * s;
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  // Armour where the weight arrives, exactly as the Burj carries it.
  const HARD_TO = 44.0;
  const hard = (y, m) => (y < HARD_TO ? M.RAFT : m);

  // ── The podium: six storeys of shopping under both towers, and the ground
  // the whole thing stands on. Not the contract — it is scored as plinth.
  //
  // It is not, however, what the towers stand on. Both cores and both rings
  // of perimeter columns go through it to the raft, which is what they do in
  // Kuala Lumpur — a hundred and four piles a tower, down to bedrock through
  // sixty metres of Klang valley silt — and which is also the only way the
  // building holds together here. Stood on the plaza slab instead, the towers
  // came off it: the slab is a plate spanning between the podium's walls and
  // a four-hundred-metre tower standing on the middle of one is not a load a
  // plate takes. So the podium is laid round the towers, the deck is cut
  // where they come through it, and the towers start at the ground.
  const towerVoid = (x, z) => {
    for (const cx of [-GAP, GAP]) {
      if (Math.hypot(x - cx, z) < PLAN_R + 1.8) return true;
    }
    return false;
  };
  B.section('podium', () => {
    courses(0, PODIUM.h, course, (y, h) => {
      B.ring(0, 0, PODIUM.w, PODIUM.d, 1.8, y, h, stone, M.RAFT);
      // Cross walls clear of both towers, so the podium is not a hoop with
      // nothing in it and the plaza has something under its middle.
      for (const cx of [-PODIUM.w * 0.41, -26.0, 26.0, PODIUM.w * 0.41]) {
        B.slab(cx, y + h / 2, 0, 1.8, h, PODIUM.d - 3.6, stone, M.RAFT);
      }
    });
    // The deck over it, which is the plaza the towers rise out of — with two
    // holes in it where they do.
    B.openings((x, _y, z) => towerVoid(x, z), () => {
      B.slab(0, PODIUM.h + DECK / 2, 0, PODIUM.w, DECK, PODIUM.d, stone, M.RAFT);
    });
  });

  const tower = (cx, tag) => {
    B.section(tag, () => {
      // From the ground, through the podium. See the note on the podium.
      let stageBase = 0;
      for (const [top, k] of SETBACKS) {
        const r = PLAN_R * k;
        const outline = star(r, quality.blockScale > 1.3 ? 32 : 48);
        const colRing = COL_R * k;
        courses(stageBase, top, course, (y, h, c) => {
          // The skin: the star, one stone thick, which is the curtain wall and
          // the ring beams together.
          B.polyRing(cx, 0, outline, 1.15, y, h, stone, hard(y, M.CURTAIN), c % 2 ? 0.5 : 0);
          // The core, all the way up and never softened: it is the one thing
          // carrying the tower and it is the thing a player has to break.
          B.ring(cx, 0, CORE * 2 * (k > 0.8 ? 1 : 0.86), CORE * 2 * (k > 0.8 ? 1 : 0.86),
            CORE_WALL, y, h, stone, M.SPINE, c % 2 ? 0.5 : 0);
        });
        // The sixteen perimeter columns, standing the full stage.
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
          const px = cx + Math.cos(a) * colRing, pz = Math.sin(a) * colRing;
          courses(stageBase, top, course, (y, h) => {
            B.add(px, y + h / 2, pz, 1.25, h / 2, 1.25, hard(y, M.CURTAIN), a);
          });
        }
        // A plate across the top of the stage. Each setback steps the ring of
        // columns three metres in, so without one the stage above starts with
        // its whole perimeter standing over the void the stage below left.
        if (top < ROOF) {
          const kk = k > 0.8 ? 1 : 0.86;
          const rIn = CORE * kk + CORE_WALL / 2;
          const rOut = PLAN_R * k;
          B.polyRing(cx, 0, BlockList.circle((rIn + rOut) / 2, quality.blockScale > 1.3 ? 20 : 26),
            rOut - rIn, top - course * 0.42, course * 0.42, stone * 0.78, M.CONCRETE);
        }
        stageBase = top;
      }

      // ── The floors, one every ten courses or so.
      //
      // Two concentric bands of plate, abutting each other, the inner one
      // landing on the core's outer face and the outer one on the ring of
      // perimeter columns, so each band has masonry under each of its edges
      // rather than hanging off one of them. Laid just under the course
      // boundary, the way every floor in the campaign is: a plate sitting on
      // top of a course stands on a joint, and a joint is a gap.
      //
      // There was a third ring of columns between the two, a single course
      // tall, standing at the floor's own height on nothing at all and buried
      // inside the outer band. It came off at load, took the plate with it,
      // and was doing no work even when it stayed put.
      for (const y of PETRONAS.floors.map((f) => f / S)) {
        const k = SETBACKS.find(([top]) => y < top)?.[1] ?? 0.58;
        const kk = k > 0.8 ? 1 : 0.86;
        const rIn = CORE * kk + CORE_WALL / 2;
        const rOut = COL_R * k + 1.25;
        const rMid = (rIn + rOut) / 2;
        const n = quality.blockScale > 1.3 ? 20 : 26;
        // Thin courses and a finer grain than the walls: a floor plate laid
        // at the wall's own coarseness is a sixty-cubic-metre slab, which is
        // three of anything on the Taj and more than a shell can take out.
        B.polyRing(cx, 0, BlockList.circle((rIn + rMid) / 2, n), rMid - rIn,
          y - course * 0.42, course * 0.42, stone * 0.78, M.CONCRETE);
        B.polyRing(cx, 0, BlockList.circle((rMid + rOut) / 2, n), rOut - rMid,
          y - course * 0.42, course * 0.42, stone * 0.78, M.CONCRETE);
      }

      // ── The roof deck at 375, which the mast stands on. The core is a
      // hollow ring nineteen metres across and the mast is eight; without a
      // deck the whole seventy-six metres of it starts over the shaft.
      {
        const kk = 0.86;
        const rIn = CORE * kk + CORE_WALL / 2;
        const rOut = PLAN_R * 0.58;
        B.slab(cx, ROOF - course * 0.3, 0, rIn * 2.2, course * 0.6, rIn * 2.2,
          stone * 0.8, M.CONCRETE);
        B.polyRing(cx, 0, BlockList.circle((rIn + rOut) / 2, quality.blockScale > 1.3 ? 20 : 26),
          rOut - rIn, ROOF - course * 0.42, course * 0.42, stone * 0.78, M.CONCRETE);
      }

      // ── The pinnacle: a steel mast on a tapering ring, the last seventy-six
      // metres of the tower and the reason it was the tallest in the world.
      // Solid, not a ring. At a third of its own width the wall left four
      // corner rods with daylight between them, and seventy-six metres of
      // that on top of a tower reads as a bundle of pipes rather than as the
      // needle that made this the tallest building in the world.
      B.spire(cx, 0, ROOF, ROOF + 46, PLAN_R * 0.34, PLAN_R * 0.11, course * 0.8, stone * 0.8, M.MAST, 0.56);
      B.pinnacle(cx, 0, ROOF + 46, 31, PLAN_R * 0.1, stone, M.MAST);
    });
  };

  tower(-GAP, 'tower-west');
  tower(GAP, 'tower-east');

  // ── The skybridge, and the arch that holds it.
  //
  // It carries itself between two towers and is tied to neither: two legs
  // springing from the 29th floor to the bridge's own underside, and the deck
  // resting on them. Shoot it and it falls on the plaza, and both towers
  // stand there and watch it go.
  B.section('skybridge', () => {
    const face = GAP - COL_R;                  // the tower's inner face
    const legFoot = BRIDGE_Y - 62.0;           // the 29th floor, where it springs
    // The arch: two legs, one off each tower, meeting under the middle of the
    // deck. Springing from the tower faces and not from inside them — the
    // legs used to start eight metres in, which buried three quarters of the
    // arch in the masonry it is supposed to be leaning against and left the
    // bridge apparently hanging in the gap on nothing.
    for (const side of [-1, 1]) {
      const footX = side * face;
      const headX = side * 3.0;
      const n = 20;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = footX + (headX - footX) * t;
        const y = legFoot + (BRIDGE_Y - legFoot) * t;
        const dy = (BRIDGE_Y - legFoot) / n;
        for (const z of [-BRIDGE_W * 0.36, BRIDGE_W * 0.36]) {
          B.add(x, y + dy / 2, z, 2.6, dy * 0.66, 1.9, M.STEEL, 0);
        }
      }
    }
    // The deck: two storeys of it, resting on the arch's crown and sliding on
    // a bearing at either tower. Tied to neither, which is the level.
    for (const y of [BRIDGE_Y, BRIDGE_Y + 5.4]) {
      B.slab(0, y + 1.0, 0, face * 2 - 1.2, 2.0, BRIDGE_W, stone * 1.1, M.STEEL);
      for (const z of [-BRIDGE_W / 2 + 0.4, BRIDGE_W / 2 - 0.4]) {
        B.slab(0, y + 3.0, z, face * 2 - 1.2, 2.6, 0.7, stone * 1.1, M.GLASS);
      }
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison: a tower with no roof to speak of and no window to lean out of.
 *
 * Both of the ways the campaign usually posts men fail here. There is no
 * parapet — the skin is a curtain wall one stone thick and the thing behind it
 * is a floor plate — and there are no loopholes, because a glass tower's
 * openings are the whole wall. So every man in this building stands on a floor
 * plate at the perimeter with the glass in front of him, which is where the
 * people in the real building stand too, and the level reads as eighty-eight
 * storeys of men rather than a battlement.
 *
 * The bridge is the exception and it is deliberate: it is the most exposed
 * position on the map, it is the first thing that gets shot, and everyone on
 * it dies when it goes. That is the lesson the bridge teaches, and it costs
 * the towers nothing, which is the other one.
 */
export function populatePetronasTowers(g, origin, groundY) {
  const K = PETRONAS;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);

  // The plaza deck over the podium: the outer ring of the position and the
  // only ground-level thing here. Mortars in the middle of it, machine guns
  // round the edge where they can see the approaches.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rx = K.podium.w * 0.46, rz = K.podium.d * 0.46;
    g.place(i % 3 === 0 ? 'mg' : 'rifleman',
      V(Math.cos(a) * rx, K.podium.h + 2.2, Math.sin(a) * rz),
      Math.atan2(Math.cos(a), Math.sin(a)), 9, { cover: 'roof' });
  }
  for (const cx of K.towers) {
    for (const sz of [-1, 1]) {
      g.place('mortar', V(cx, K.podium.h + 2.2, sz * K.podium.d * 0.3), 0, 9, { cover: 'roof' });
    }
  }

  // The floors. Eight men to a plate on the plates that are held, working up
  // the tower: riflemen low, anti-tank in the middle where a rocket out of a
  // window is worth something, snipers at the top.
  K.floors.forEach((y, k) => {
    if (k % 2) return;                       // every other floor, or it is a wall of men
    for (const cx of K.towers) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k * 0.4;
        const r = K.colR * (y > K.roof * 0.78 ? 0.58 : y > K.roof * 0.6 ? 0.78 : 1) - 1.6;
        const type = k < 3 ? (i % 3 === 0 ? 'mg' : 'rifleman')
          : k < 7 ? (i % 2 === 0 ? 'at' : 'rifleman') : 'sniper';
        g.place(type, V(cx + Math.cos(a) * r, y + 1.4, Math.sin(a) * r),
          Math.atan2(Math.cos(a), Math.sin(a)), 6, { cover: 'window' });
      }
    }
  });

  // The bridge. Two ranks along the deck, and they go with it.
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    const x = -K.bridgeSpan / 2 + K.bridgeSpan * t;
    g.place(i % 4 === 0 ? 'at' : 'rifleman', V(x, K.bridgeY + 3.2, 0),
      i % 2 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'roof' });
  }
}
