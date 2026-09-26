import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * The Shwedagon Pagoda, Yangon: the great stupa on Singuttara Hill.
 *
 * Reference figures (Department of Archaeology, Myanmar; Moore, "Shwedagon:
 * Golden Pagoda of Myanmar"):
 *   height              99 m from the platform to the tip of the hti
 *   the plinth          three square-and-octagonal terraces, the lowest
 *                       about 115 m across (the survey has it 115 × 113),
 *                       then the octagonal bands the bell rises from
 *   the bell            the inverted bowl at about 26 m, 50 m across at its
 *                       foot, drawn up through the turban bands and the
 *                       inverted lotus into the banana bud
 *   the hti             the seven-tiered umbrella, 10 m, with the vane and
 *                       the diamond bud, all of it hung with bells
 *   the platform        5.6 ha on a hill 50 m over the city, with sixty-four
 *                       small stupas round the foot and four devotional
 *                       halls at the cardinal points
 *
 * Kind: a mountain. The stupa is solid brick, gilded, and nothing about it
 * falls over — it has to be quarried, from the outside in, and it is the
 * heaviest thing in the campaign for its height. The small stupas and the
 * halls are the finesse: they come down for a round apiece and they are what
 * the garrison shoots from.
 *
 * GOLD throughout the stupa (gilded brick, structural: a stupa carries
 * itself and everything over it). MARBLE for the halls and the platform's
 * stone, GILT for the hti, which is iron under leaf and carries nothing.
 */

const S = 1.3;
const STONE_FINENESS = 1.0;

// Real metres, scaled once at the end.
// The stupa's profile, bottom to top: [top of the band, circumradius,
// sides]. Eight sides is the terrace and band work; many sides is the bell.
const PROFILE = [
  { top: 4.0, r: 57.0, sides: 8 },
  { top: 8.0, r: 50.0, sides: 8 },
  { top: 12.0, r: 43.0, sides: 8 },
  { top: 17.0, r: 36.5, sides: 8 },
  { top: 21.0, r: 31.5, sides: 8 },
  // The bell: from its foot to the turban, a concave curve.
  { top: 55.0, r: 26.0, curveTo: 13.0, power: 2.3 },
  { top: 60.0, r: 13.2, curveTo: 12.0, power: 1.0 },        // the turban bands
  { top: 68.0, r: 12.6, curveTo: 9.8, power: 0.7 },         // the inverted lotus
  { top: 90.0, r: 10.0, curveTo: 2.6, power: 0.85 },        // the banana bud
];
const HTI = 9.0;
const TOP = PROFILE[PROFILE.length - 1].top;
const BELL_FOOT = PROFILE[5 - 1].top;                      // where the round work begins

const SMALL = { n: 64, at: 64.0, w: 3.0, h: 6.5 };
const HALL = { at: 78.0, w: 22.0, d: 15.0, h: 7.5, roofTiers: 3, tier: 2.2 };

/** Circumradius and side count of the stupa at height y (real metres). */
function ringAt(y) {
  let y0 = 0;
  for (const p of PROFILE) {
    if (y < p.top) {
      if (p.curveTo === undefined) return { r: p.r, sides: p.sides };
      const t = (y - y0) / (p.top - y0);
      return { r: p.curveTo + (p.r - p.curveTo) * Math.pow(1 - t, p.power), sides: 0 };
    }
    y0 = p.top;
  }
  return null;
}

/** What the garrison, the flag and the level record read (world metres). */
export const SHWEDAGON = {
  scale: S,
  terraces: PROFILE.slice(0, 5).map((p) => ({ top: p.top * S, r: p.r * S, apothem: p.r * Math.cos(Math.PI / 8) * S })),
  bellFoot: BELL_FOOT * S,
  height: (TOP + HTI) * S,
  small: { n: SMALL.n, at: SMALL.at * S, h: SMALL.h * S },
  hall: { at: HALL.at * S, w: HALL.w * S, d: HALL.d * S, h: HALL.h * S, roofTop: (HALL.h + HALL.roofTiers * HALL.tier) * S },
  galleries: PROFILE.slice(0, 3).map((p) => p.top * S),
  flag: { x: 0, y: (PROFILE[2].top + 0.6) * S, z: -PROFILE[2].r * Math.cos(Math.PI / 8) * S + 3.0 },
};

export function buildShwedagon(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.1 * s;
  const course = 1.0 * s;
  const coreT = stone * 2.2;
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  /**
   * One solid course of the stupa: a skin of fine stone on the outline and
   * concentric rings of coarse stone filling it to the centre, all on the
   * same polygon so the rings nest exactly — same side count, apothems a
   * ring's thickness apart, every box face on its neighbour's and nothing
   * between them. Every ring stands on the ring under it; where the stupa
   * steps in a lot (a terrace) the whole course lands on the solid course
   * below. The rings turn half a step each course, which is the bond that
   * spreads the load sideways instead of down one column, and the square at
   * the centre is cut to one stone and then two, for the same reason.
   *
   * Eight sides for the terraces and the bands, which are octagons; the bell
   * gets as many as its skin's stones will draw, capped so that the inner
   * rings are still made of stones and not of slivers.
   */
  const solidCourse = (y, h, r, sides, mat, c) => {
    const n = sides || Math.max(8, Math.min(32, Math.round((2 * Math.PI * r) / (2 * stone))));
    const rot = (c % 2) * (Math.PI / n);
    const cosn = Math.cos(Math.PI / n);
    const skin = Math.min(stone * 1.2, r * 0.45);
    let a = r * cosn;                                  // apothem of the face being laid
    B.polyRing(0, 0, BlockList.circle((a - skin / 2) / cosn, n, rot), skin, y, h, stone, mat, 0);
    a -= skin;
    // As many full rings as leave a centre between half a ring and a ring
    // and a half across: the square that fills it is then never a sliver
    // over a hole, and always overlaps the square in the course below.
    const k = Math.max(0, Math.floor(a / coreT - 0.55));
    for (let i = 0; i < k; i++) {
      B.polyRing(0, 0, BlockList.circle((a - coreT / 2) / cosn, n, rot), coreT, y, h, coreT, mat, c % 2);
      a -= coreT;
    }
    if (a > 0.3) {
      const w = 1.4 * a;
      B.slab(0, y + h / 2, 0, w, h, w, w / (c % 2 ? 1 : 2), mat);
    }
  };

  const lay = (y0, y1) => courses(y0, y1, course, (y, h, c) => {
    const ring = ringAt(y + h / 2);
    if (!ring) return;
    solidCourse(y, h, ring.r, ring.sides, M.GOLD, c);
  });

  // ── The terraces and the octagonal bands: the plinth, and where the men are.
  B.section('terraces', () => lay(0, BELL_FOOT));
  // ── The bell and everything over it, to the hti.
  B.section('stupa', () => {
    lay(BELL_FOOT, TOP);
    // The hti: leaf over an iron frame, on the tip, carrying nothing.
    B.pinnacle(0, 0, TOP, HTI * 0.55, 6.0, stone * 0.8, M.GILT);
    B.pinnacle(0, 0, TOP + HTI * 0.55, HTI * 0.45, 2.2, stone * 0.7, M.GILT);
  });

  // ── The sixty-four small stupas round the foot: a square base, a bell of
  // courses stepping in, a spike.
  B.section('smallstupas', () => {
    for (let i = 0; i < SMALL.n; i++) {
      const a = (i + 0.5) / SMALL.n * Math.PI * 2;
      const cx = Math.cos(a) * SMALL.at, cz = Math.sin(a) * SMALL.at;
      const n = 4;
      const ch = SMALL.h / n;
      for (let k = 0; k < n; k++) {
        const w = SMALL.w * (1 - k / n * 0.7);
        B.slab(cx, (k + 0.5) * ch, cz, w, ch, w, w / (k < 2 ? 2 : 1), M.GOLD);
      }
      B.pinnacle(cx, cz, SMALL.h, 2.4, 0.9, stone * 0.6, M.GILT);
    }
  });

  // ── The four devotional halls at the cardinal points: open arcaded
  // pavilions under tiered pyatthat roofs, facing the stupa.
  B.section('halls', () => {
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = ax * HALL.at, cz = az * HALL.at;
      // The long side faces the stupa.
      const w = ax ? HALL.d : HALL.w, d = ax ? HALL.w : HALL.d;
      const bay = 3.8, pier = 1.3;
      const arcade = (x, y, z) => {
        if (y > HALL.h - 1.4) return false;                             // the lintel course
        const onZ = Math.abs(z - cz) > d / 2 - 1.2, onX = Math.abs(x - cx) > w / 2 - 1.2;
        const along = onZ ? x - cx : z - cz, half = onZ ? w / 2 : d / 2;
        if (Math.abs(along) > half - 2.0) return false;
        const k = ((Math.abs(along) + bay / 2) % bay);
        return k > pier / 2 && k < bay - pier / 2;
      };
      B.openings(arcade, () => {
        courses(0, HALL.h, course, (y, ch, c) => {
          B.ring(cx, cz, w, d, 1.0, y, ch, stone, M.MARBLE, c % 2 ? 0.5 : 0);
        });
      });
      // The eave plate on the piers, and the tiers stepping in on it.
      B.slab(cx, HALL.h + course * 0.5, cz, w + 2.0, course, d + 2.0, stone * 1.6, M.GOLD);
      let y = HALL.h + course, ww = w + 2.0, dd = d + 2.0;
      for (let k = 0; k < HALL.roofTiers; k++) {
        const step = 2.4;
        courses(y, y + HALL.tier, course, (yy, ch, c) => {
          B.ring(cx, cz, ww, dd, Math.min(step + 0.4, Math.min(ww, dd) / 2.2), yy, ch, stone, M.GOLD, c % 2 ? 0.5 : 0);
        });
        y += HALL.tier; ww -= 2 * step; dd -= 2 * step;
        if (Math.min(ww, dd) > 1.5) B.slab(cx, y + course * 0.3, cz, ww, course * 0.6, dd, stone * 1.6, M.GOLD);
      }
      B.pinnacle(cx, cz, y + course * 0.6, 3.5, 1.4, stone * 0.7, M.GILT);
    }
  });

  B.scaleAll(S);
  return B;
}

/**
 * The garrison. Riflemen and machine guns along the edges of the two lower
 * terraces, facing out over the platform; snipers on the octagonal bands
 * under the bell; anti-tank teams in the arcades of the four halls, which
 * cover the four stairways up the hill; mortars on the third terrace, which
 * is the highest flat ground nothing is over.
 */
export function populateShwedagon(g, origin, groundY) {
  const K = SHWEDAGON;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const onTerrace = (t, count, type, offset = 0) => {
    const T = K.terraces[t];
    for (let i = 0; i < count; i++) {
      const a = ((i + offset) / count) * Math.PI * 2 + Math.PI / 8;
      const r = T.apothem - 1.6;
      g.place(typeof type === 'function' ? type(i) : type, V(Math.cos(a) * r, T.top + 0.4, Math.sin(a) * r),
        Math.atan2(Math.cos(a), Math.sin(a)), 7, { cover: 'roof' });
    }
  };
  onTerrace(0, 16, (i) => (i % 4 === 0 ? 'mg' : 'rifleman'));
  onTerrace(1, 8, 'rifleman', 0.5);
  onTerrace(3, 4, 'sniper', 0.25);
  onTerrace(2, 4, 'mortar', 0.5);
  // The halls: anti-tank teams and a gun in the arcade facing away from the stupa.
  const H = K.hall;
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const out = ax ? H.d / 2 : H.d / 2;
    for (const side of [-1, 1]) {
      const along = side * H.w * 0.25;
      const x = ax * (H.at + out - 1.5) + (ax ? 0 : along);
      const z = az * (H.at + out - 1.5) + (az ? 0 : along);
      g.place(side > 0 ? 'at' : 'mg', V(x, 0.8, z), Math.atan2(ax, az), 7, { cover: 'arcade' });
    }
  }
}
