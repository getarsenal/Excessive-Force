import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * El Castillo, and the Temple of the Warriors, at Chichén Itzá.
 *
 * Reference figures (INAH survey, widely published):
 *   El Castillo     base 55.3 m square, 24 m to the upper platform,
 *                   30 m to the roof of the temple, nine terraces,
 *                   four stairways of 91 steps
 *   Inner pyramid   an earlier structure, about 33 m square and 20 m high,
 *                   entirely enclosed by the later one, with a chamber near
 *                   its crown holding the jaguar throne
 *   Warriors        a stepped platform about 40 m square carrying a temple,
 *                   fronted by the Group of a Thousand Columns
 *
 * Built at 2x, like the Elizabeth Tower, because at life size a thirty-metre
 * pyramid is a kerbstone from the distance this game plays at.
 *
 * ── The problem, and the trick ──
 *
 * A pyramid cannot topple: every stone already stands on a wider stone, and
 * there is nothing to undercut. Giza's answer to that is scale — two and a
 * third million cubic metres, quarried a shell at a time. El Castillo is a
 * two-hundredth of Khufu, so that answer does not transfer: a battery would
 * flatten it in a couple of minutes and the level would be over before it had
 * started.
 *
 * What it has instead is the thing Khufu does not: a second pyramid inside it.
 * The Maya built over their own work, and the earlier structure is still in
 * there, complete, with its own temple and its own chamber. So this is built
 * the way it actually is — the outer pyramid's core stops at the inner one's
 * flanks, and its upper terraces stand *on* the older building. Shelling the
 * skin gets a player about a third of the way and then stops paying, because
 * under the skin is not more skin: it is a solid older pyramid that the top of
 * the newer one is resting on.
 *
 * The way in is the way the archaeologists went in. The north stairway has a
 * passage under it to the inner temple, and the chamber at the top of the
 * inner pyramid is a real void with a real ceiling. Open the stair, work along
 * the passage, break the chamber's crown, and the whole upper third of the
 * outer pyramid has nothing under it any more.
 */

const S = 2.0;

export const CASTILLO = {
  scale: S,
  base: 55.3 * S,           // 110.6 m across the bottom terrace
  platform: 24.0 * S,       // 48 m to the upper platform
  top: 30.0 * S,            // 60 m to the temple roof
  terraces: 9,
  platHalf: 19.5 * S / 2,   // the upper platform, half-width
  templeHalf: 13.4 * S / 2,
  templeH: 6.0 * S,
  stairW: 10.0 * S,         // each of the four stairways
  // The older pyramid inside.
  innerBase: 33.0 * S,
  innerTop: 20.0 * S,
  chamberY: 15.0 * S,
  chamberW: 6.0 * S,
  chamberD: 4.0 * S,
  chamberH: 3.2 * S,
};

export const WARRIORS = {
  scale: S,
  base: 40.0 * S,
  height: 11.0 * S,
  steps: 4,
  templeHalf: 12.0 * S / 2,
  templeH: 5.0 * S,
  // The colonnade in front of it: rows of square piers under a flat roof.
  colCols: 9,
  colRows: 5,
  colPitch: 4.2 * S,
  colH: 4.6 * S,
  colPier: 0.9 * S,
  offset: { x: 150, z: -120 },
};

/** Half-width of a stepped pyramid at height `y`, quantised to its terraces. */
function terraceHalf(y, base, height, platHalf, n) {
  const t = Math.max(0, Math.min(1, y / height));
  const step = Math.min(n - 1, Math.floor(t * n));
  const f = step / (n - 1 || 1);
  return (base / 2) + ((platHalf) - (base / 2)) * f;
}

/**
 * A solid stepped pyramid.
 *
 * Solid, and for the same reason Khufu is: a casing ring round a core slab has
 * every ring landing inboard of the ring below it, bearing on core rather than
 * on casing, and a hundred stones start the level detached. Each course here is
 * one slab of stones on a wider slab, which is both what the building is and
 * the only arrangement where every block has something under it by
 * construction. The casing survives as the outermost blocks of each course.
 *
 * `solidAt(x, z, y)` may veto a block — that is how the outer pyramid is kept
 * out of the older one's volume, so the two do not share the same cubic metres.
 */
function steppedPyramid(B, cx, cz, o) {
  const { base, height, platHalf, terraces, stone, courseH } = o;
  o.scale = o.scale || S;
  const core = o.core ?? M.RUBBLE;
  const skin = o.skin ?? M.LIMESTONE;
  // What another building already occupies at this height. The outer pyramid
  // passes this so its core stops at the older one's flanks: the two must not
  // share the same cubic metres, and more to the point the upper terraces have
  // to be standing *on* the inner pyramid rather than beside it.
  const hole = o.hole || (() => 0);
  let y = 0;
  let c = 0;
  while (y < height - 0.001) {
    const h = Math.min(courseH, height - y);
    const full = terraceHalf(y + h / 2, base, height, platHalf, terraces);

    // Talud and tablero, which is how a Maya terrace is actually built and the
    // only reason this reads as a stepped pyramid rather than as a mound.
    //
    // Each terrace is a full-width course at its foot, a recessed panel above
    // it, and a projecting moulding at its head. A plain stepped cone gives
    // nine four-metre treads, which sounds like plenty and is not: at two
    // hundred metres the tread is three pixels and the per-stone colour
    // jitter swallows it, so the whole thing comes out as a heap of rubble.
    // A recess is in shadow whatever the sun is doing, which a projection is
    // not — the first attempt at this was a moulding alone and was invisible.
    const idx = Math.floor(((y + h / 2) / height) * terraces);
    const nxt = Math.floor(((y + h * 1.5) / height) * terraces);
    const prv = Math.floor(((y - h * 0.5) / height) * terraces);
    const head = nxt > idx;                 // the last course of this terrace
    const foot = prv < idx || idx === 0;    // and the first
    const inset = (head || foot) ? 0 : o.scale * 1.15;
    const half = full - inset;
    const wall = Math.max(stone * 1.1, full * 0.16) - inset;
    const inner = full - Math.max(stone * 1.1, full * 0.16);
    const proud = head ? o.scale * 0.85 : 0;
    B.ring(cx, cz, half * 2, half * 2, Math.max(stone * 0.8, wall), y, h,
      stone * 0.9, skin, c % 2, proud > 0 ? () => proud : null);
    const hh = hole(y + h / 2);
    if (inner > stone * 0.6) {
      if (hh > 0 && hh < inner - stone * 0.6) {
        // A ring of fill between the casing and whatever is inside.
        B.ring(cx, cz, inner * 2, inner * 2, inner - hh, y, h, stone, core, c % 2);
      } else if (hh <= 0) {
        B.slab(cx, y + h / 2, cz, inner * 2, h, inner * 2, stone, core);
      }
      // Otherwise the older building fills this course entirely and there is
      // nothing of the newer one to lay but its skin.
    }
    y += h;
    c++;
  }
}

/**
 * One stairway up a face, laid as the solid mass of stone it really is.
 *
 * A Maya stairway is not a set of treads applied to a slope — it is a wedge of
 * masonry built against the terraces with the steps cut into its face. Built
 * as applied treads each step is a block whose only neighbour is the terrace
 * behind it, and the support solver is quite right to drop the lot.
 */
/**
 * One of the four stairways.
 *
 * On the real pyramid these are the thing you see: ten metres wide, ninety-one
 * steps, standing well clear of the terraces they climb, and walled either
 * side by an alfarda — a ramped balustrade a good two metres high that runs
 * unbroken from the plaza to the temple door, and finishes at the bottom in a
 * serpent's head.
 *
 * The first version of this stood the stair three metres proud of a face that
 * steps back four and a half, with balustrades half a metre high. From the
 * plaza it was indistinguishable from the pyramid and El Castillo had no
 * stairs at all.
 */
function stairway(B, cx, cz, dirX, dirZ, o) {
  const { base, height, platHalf, terraces, width, stone, courseH } = o;
  const half = width / 2;
  const sc = o.scale;
  let y = 0;
  while (y < height - 0.001) {
    const h = Math.min(courseH, height - y);
    const face = terraceHalf(y + h / 2, base, height, platHalf, terraces);
    // The nose stands clear of the terrace, and clear of the recessed panel
    // in it, so the ramp is a solid wedge against the stepped flank.
    const out = face + 2.4 * sc;
    const depth = out - platHalf * 0.4;
    if (depth < stone) { y += h; continue; }
    const mx = cx + dirX * (out + platHalf * 0.4) / 2;
    const mz = cz + dirZ * (out + platHalf * 0.4) / 2;
    B.slab(mx, y + h / 2, mz,
      dirX ? depth : width, h, dirX ? width : depth, stone, M.LIMESTONE);
    // The tread nose: a course-deep lip at the outer edge of every course, so
    // the ramp reads as steps and not as a slide.
    const nx = cx + dirX * (out - 0.9 * sc);
    const nz = cz + dirZ * (out - 0.9 * sc);
    B.slab(nx, y + h * 0.78, nz,
      dirX ? 1.8 * sc : width, h * 0.45, dirX ? width : 1.8 * sc,
      stone, M.LIMESTONE);
    // The alfardas, standing a full two metres over the steps between them.
    for (const sgn of [-1, 1]) {
      const bx = mx + (dirX ? 0 : sgn * (half + 1.1 * sc));
      const bz = mz + (dirX ? sgn * (half + 1.1 * sc) : 0);
      const rise = 1.9 * sc;
      B.slab(bx, y + (h + rise) / 2, bz,
        dirX ? depth : 2.2 * sc, h + rise, dirX ? 2.2 * sc : depth,
        stone, M.LIMESTONE);
    }
    y += h;
  }
}

export function buildElCastillo(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 2.75 * Math.min(s, 1.3);
  const courseH = 2.4 * Math.min(s, 1.3);
  const C = CASTILLO;

  // ── The older pyramid, inside.
  //
  // Built first and built solid, because the newer one is going to stand on
  // it. Its chamber is a real void with a real ceiling — the relieving course
  // above it is what the crown of the outer pyramid is ultimately resting on,
  // and breaking it is the whole level.
  B.section('inner', () => {
    const half = C.chamberW / 2, deep = C.chamberD / 2;
    const y0 = C.chamberY, y1 = C.chamberY + C.chamberH;
    // The chamber, and the passage the archaeologists cut in to reach it —
    // one predicate, because an opening is masonry that was never laid and
    // there is nothing to cut afterwards.
    B.openings((x, y, z) => {
      if (y > y0 && y < y1 && Math.abs(x) < half && Math.abs(z) < deep) return true;
      return y > y0 - 0.6 && y < y0 + 2.4 * S
        && Math.abs(x) < 1.5 * S && z < -deep && z > -C.innerBase / 2 - 2;
    }, () => {
      steppedPyramid(B, 0, 0, {
        base: C.innerBase, height: C.innerTop, platHalf: C.innerBase * 0.22,
        terraces: 5, stone: stone * 1.15, courseH: courseH * 1.15,
        core: M.RUBBLE, skin: M.SANDSTONE,
      });
    });
  });

  // ── The temple on the inner pyramid's own platform, sealed in the fill.
  B.section('inner', () => {
    const t = C.innerBase * 0.22;
    B.ring(0, 0, t * 2, t * 2, 1.4 * S, C.innerTop, courseH * 1.2,
      stone, M.SANDSTONE, 0);
  });

  // ── The pyramid everyone sees.
  //
  // Its core stops at the older one's flanks. That is not an optimisation: it
  // is the load path that makes this level what it is. The upper terraces
  // stand on the inner pyramid, so the crown of El Castillo is carried by a
  // building nobody can see.
  B.section('castillo', () => {
    const innerHalfAt = (y) => (y >= C.innerTop ? 0
      : (C.innerBase / 2) * (1 - y / C.innerTop) + 1.2);
    steppedPyramid(B, 0, 0, {
      base: C.base, height: C.platform, platHalf: C.platHalf,
      terraces: C.terraces, stone, courseH,
      core: M.RUBBLE, skin: M.LIMESTONE,
      hole: innerHalfAt,
    });
  });

  // ── Four stairways, one per face.
  B.section('stairs', () => {
    const o = {
      base: C.base, height: C.platform, platHalf: C.platHalf,
      terraces: C.terraces, width: C.stairW, stone, courseH, scale: S,
    };
    stairway(B, 0, 0, 0, -1, o);      // north, the one with the passage
    stairway(B, 0, 0, 0, 1, o);
    stairway(B, 0, 0, 1, 0, o);
    stairway(B, 0, 0, -1, 0, o);
  });

  // ── The temple of Kukulcán on top: four doorways, a thick roof, and the
  // roof comb above it.
  B.section('temple', () => {
    const y0 = C.platform;
    const h = C.templeH;
    const half = C.templeHalf;
    const door = 2.2 * S;
    B.openings((x, y, z) => (
      y < y0 + h * 0.72 && y > y0 + 0.4
      && ((Math.abs(x) < door && Math.abs(z) > half - 2.6)
        || (Math.abs(z) < door && Math.abs(x) > half - 2.6))
    ), () => {
      let y = y0;
      let c = 0;
      while (y < y0 + h - 0.001) {
        const ch = Math.min(courseH, y0 + h - y);
        B.ring(0, 0, half * 2, half * 2, 2.6 * S, y, ch, stone, M.LIMESTONE, c % 2,
          // A plain band at the top of the wall, which is what the temple has
          // instead of a cornice.
          (x, z, yy) => (yy > y0 + h * 0.74 ? 0.35 : 0));
        y += ch; c++;
      }
    });
    // The roof: solid, because the doorways below it are openings in a wall
    // rather than voussoired arches, and something has to span them.
    B.slab(0, y0 + h + courseH, 0, half * 2 + 1.6, courseH * 2, half * 2 + 1.6,
      stone, M.LIMESTONE);
    // The roof comb.
    B.slab(0, y0 + h + courseH * 3.2, 0, half * 1.1, courseH * 3.2, 1.6 * S,
      stone, M.LIMESTONE);
  });

  return B;
}

/**
 * The Temple of the Warriors, and the Group of a Thousand Columns.
 *
 * A different structure from the pyramid in the only way that matters here:
 * the colonnade is a flat roof on a hundred slender piers, and a flat roof on
 * slender piers is the one arrangement in this game that comes down all at
 * once. Take out a rank of columns and the bays above them have nothing left
 * to stand on — which is a thing the player can do with a single well-placed
 * salvo, and is the fastest score on the map.
 */
export function buildTempleOfWarriors(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 2.6 * Math.min(s, 1.3);
  const courseH = 2.2 * Math.min(s, 1.3);
  const W = WARRIORS;

  B.section('warriors', () => {
    steppedPyramid(B, 0, 0, {
      base: W.base, height: W.height, platHalf: W.base * 0.30,
      terraces: W.steps, stone, courseH,
      core: M.RUBBLE, skin: M.LIMESTONE,
    });
    // The temple on its platform.
    const y0 = W.height;
    const half = W.templeHalf;
    B.openings((x, y, z) => (
      y < y0 + W.templeH * 0.7 && y > y0 + 0.4
      && Math.abs(x) < 3.0 * S && z < -half + 2.6
    ), () => {
      let y = y0, c = 0;
      while (y < y0 + W.templeH - 0.001) {
        const ch = Math.min(courseH, y0 + W.templeH - y);
        B.ring(0, 0, half * 2, half * 2, 2.4 * S, y, ch, stone, M.LIMESTONE, c % 2);
        y += ch; c++;
      }
    });
    B.slab(0, y0 + W.templeH + courseH, 0, half * 2 + 1.4, courseH * 2,
      half * 2 + 1.4, stone, M.LIMESTONE);
    // The stair up the west front.
    stairway(B, 0, 0, -1, 0, {
      base: W.base, height: W.height, platHalf: W.base * 0.30,
      terraces: W.steps, width: 12 * S, stone, courseH, scale: S,
    });
  });

  // ── The colonnade.
  B.section('columns', () => {
    const { colCols: nx, colRows: nz, colPitch: p, colH: h, colPier: r } = W;
    const x0 = -(nx - 1) * p / 2;
    const z0 = W.base / 2 + p * 1.4;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = x0 + i * p, z = z0 + j * p;
        // Each pier is a stack of drums, so a shell takes a course out of one
        // rather than deleting the whole column.
        let y = 0;
        while (y < h - 0.001) {
          const ch = Math.min(courseH, h - y);
          B.slab(x, y + ch / 2, z, r * 2, ch, r * 2, stone, M.LIMESTONE);
          y += ch;
        }
      }
    }
    // The roof, laid as beams along one axis so it spans pier to pier and the
    // bays fail one at a time rather than as a single plate.
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * p;
      B.slab(x, h + courseH * 0.6, z0 + (nz - 1) * p / 2,
        r * 2.4, courseH * 1.2, (nz - 1) * p + r * 4, stone * 1.2, M.LIMESTONE);
    }
    B.slab(0, h + courseH * 1.9, z0 + (nz - 1) * p / 2,
      (nx - 1) * p + r * 4, courseH * 1.3, (nz - 1) * p + r * 4,
      stone * 1.4, M.LIMESTONE);
  });

  return B;
}
