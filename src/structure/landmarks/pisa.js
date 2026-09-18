import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Piazza dei Miracoli at Pisa: the campanile, the Duomo, the Baptistery.
 *
 * Reference figures (Opera della Primaziale Pisana, and the 1990–2001
 * stabilisation survey):
 *   Campanile   15.48 m outer diameter, wall 4.09 m thick at the base,
 *               55.86 m on the low side and 56.67 m on the high side,
 *               eight stages, six of them open loggias of thirty columns,
 *               296 steps in a helical well inside the wall,
 *               3.97 degrees out of plumb to the south after stabilisation
 *   Duomo       about 100 m long, five aisles, an elliptical dome over the
 *               crossing, a west front of four tiers of open gallery
 *   Baptistery  35.5 m across, 54.86 m tall, the largest in Italy
 *
 * Built at 1.6x rather than the 2x the Elizabeth Tower and El Castillo are
 * built at. The piazza is not one building, it is three with real distances
 * between them, and at 2x the Baptistery stands off the edge of the baked
 * ground. 1.6x still puts the campanile at 89 m, which is Elizabeth Tower
 * territory, and keeps the whole composition inside the map.
 *
 * ── The problem, and the trick ──
 *
 * Every other landmark in this game starts plumb and the player knocks it out
 * of plumb. This one arrives already falling, which changes what the player is
 * being asked to do: not to create a lean but to finish one. So the lean is
 * built in, course by course — each ring of masonry is laid level and set a
 * little south of the ring beneath it, which is both how the game's blocks
 * work and, near enough, how the tower actually got this way.
 *
 * And then the trick, which is the true part and the part that catches people
 * out. The tower is not a tilted cylinder. It is bent. Work stopped twice for
 * most of a century, and each time it resumed the masons built *against* the
 * lean, so the upper stages come back the other way and the bell chamber is
 * set back further still. The consequence is that the four and a half metres
 * of overhang at the top is a fact about the top and nothing else: the centre
 * of gravity is comfortably inside the base, and this tower is not about to
 * fall down. Shelling the overhanging crown — which is the obvious thing to
 * do, and which every player will do first — removes the corrected part and
 * leaves the uncorrected part standing better than before.
 *
 * What is genuinely overloaded is the first stage, on the south side, at the
 * bottom, behind the blind arcade — which is exactly where the real thing was
 * crushing when they put steel cables round it in 1992. Cut there and eighty-
 * nine metres comes over in one piece.
 *
 * The way in is the stair. The 296 steps run in a helical well cut through the
 * rubble core between the two marble shells, so it is a spiral void through
 * the one part of the wall that is carrying: open the door at the foot of it
 * and every course above is weakened at a different bearing.
 */

const S = 1.6;
const TAU = Math.PI * 2;

export const PISA = {
  scale: S,
  outerR: 7.74 * S,          // 12.4 m: the outer face of the marble
  coreR0: 3.65 * S,          // the well at the bottom
  // The well at the top. Set from the wall the tower is meant to have up
  // there — 2.48 m against 4.09 m at the foot — measured off the *inset* face
  // behind the loggias rather than off the outer face, which is a metre and a
  // half further out. Taken off the outer face it leaves the rubble between
  // the two marble skins with negative thickness, and the builder lays it as a
  // ring of stones four centimetres wide that nothing can bear on.
  coreR1: 4.21 * S,
  shell: 0.60 * S,           // each marble skin, with rubble between them
  plinthR: 9.8 * S,
  plinthH: 1.1 * S,
  stage1: 10.6 * S,          // top of the blind arcade
  loggias: 6,
  loggiaH: 5.75 * S,
  bays: 30,
  // How far the columns stand outboard of the wall behind them. This is the
  // depth of the shadow in every photograph of this tower: set too shallow,
  // the loggias stop reading as galleries and the whole shaft comes out as one
  // fluted tube with stripes on it.
  gallery: 1.70 * S,
  bellY: (10.6 + 6 * 5.75) * S,
  bellR: 6.00 * S,
  bellH: 10.7 * S,
  height: 55.86 * S,
  // 3.97 degrees, and the correction the masons built into the upper stages.
  leanTan: Math.tan(3.97 * Math.PI / 180),
  correction: 0.45 * S,
  stairTurn: 0.125 * TAU / S,   // turns per game metre: six turns over the shaft
  stairHalf: 1.15 * S,          // half the width of the well, in metres of arc
  stairPhase: -Math.PI / 2,
};

/**
 * Where the tower's own axis is at height `y`, as an offset to the south.
 *
 * The straight term is the 3.97 degrees. The second term is the century the
 * work stood still: everything above the fourth loggia was built back against
 * the lean, and the bell chamber further back again. Take it out and the model
 * is a tilted cylinder, which is the thing this tower is famous for not being.
 */
export function axisAt(y) {
  const P = PISA;
  const lean = P.leanTan * y;
  const t = Math.max(0, Math.min(1, (y - P.stage1 - 4 * P.loggiaH)
    / (P.height - P.stage1 - 4 * P.loggiaH)));
  return lean - P.correction * t * t * (3 - 2 * t);
}

/** The well radius at height y: the wall thins as the tower rises. */
function coreAt(y) {
  const P = PISA;
  const t = Math.max(0, Math.min(1, y / P.bellY));
  return P.coreR0 + (P.coreR1 - P.coreR0) * t;
}

/**
 * An arch springing tangentially off a circle.
 *
 * `arch()` in the builder only knows two axes, and an arcade running round a
 * drum needs one per bay. Same idea — voussoirs approximated as boxes on the
 * ring, which carry in compression and drop when the crown goes — turned to
 * the tangent at that bay.
 */
function radialArch(B, cx, cz, r, aMid, span, springY, depth, thick, count, mat) {
  const rc = span / 2 + thick / 2;
  const tang = aMid + Math.PI / 2;
  const ox = cx + Math.cos(aMid) * r, oz = cz + Math.sin(aMid) * r;
  for (let i = 0; i < count; i++) {
    const tm = Math.PI * ((i + 0.5) / count);
    const s = Math.cos(tm) * rc;
    const h = Math.sin(tm) * rc;
    const seg = (Math.PI * rc) / count;
    const ins = (i % 2) * 0.05;
    B.add(ox + Math.cos(tang) * s, springY + h, oz + Math.sin(tang) * s,
      depth / 2 - ins, thick / 2 - ins, seg / 2 - ins, mat, -aMid);
  }
}

/**
 * One open loggia: a ring of columns on the cornice below, an arcade over
 * them, and the cornice they carry.
 *
 * Laid as real columns rather than as a band of wall with holes cut in it,
 * because at this bay width a cut band resolves to about one stone per bay and
 * comes out either solid or absent. Each shaft is a stack of drums, so a shell
 * takes a drum out of a column instead of deleting the column.
 */
function loggia(B, cx, cz, y0, r, bays, colH, stone, courseH, mat, phase) {
  const bay = (TAU * r) / bays;
  const colR = Math.min(bay * 0.21, 0.80 * S);
  const capH = courseH * 0.45;
  for (let i = 0; i < bays; i++) {
    const a = phase + (i / bays) * TAU;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    let y = y0;
    while (y < y0 + colH - 0.001) {
      const h = Math.min(courseH, y0 + colH - y);
      B.add(x, y + h / 2, z, colR, h / 2, colR, mat, -a);
      y += h;
    }
    // Base and capital, which is where a marble column is actually thickest.
    B.add(x, y0 + capH / 2, z, colR * 1.4, capH / 2, colR * 1.4, mat, -a);
    B.add(x, y0 + colH + capH / 2, z, colR * 1.4, capH / 2, colR * 1.4, mat, -a);
  }
  // The arcade, one arch per bay, springing capital to capital.
  //
  // The ring is sized off the bay rather than off the course height. A
  // voussoir as thick as a course is most of a two-metre bay on a coarse tier,
  // and the springing stones of such an arch land past the column they are
  // supposed to stand on — thirty of them, hanging in the air, which is
  // exactly what the first version of this tower did.
  const thick = Math.min(courseH * 0.8, bay * 0.22);
  const span = bay - thick - colR * 1.2;
  const springY = y0 + colH + capH;
  for (let i = 0; i < bays; i++) {
    const aMid = phase + ((i + 0.5) / bays) * TAU;
    radialArch(B, cx, cz, r, aMid, span, springY, colR * 2.0, thick, 5, mat);
  }
  return springY + span / 2 + thick;
}

/**
 * One cornice ring: what a loggia stands on and what it carries.
 *
 * Three courses, each standing a little further out than the one below. Eight
 * storeys of thirty columns each read as vertical fluting from any distance,
 * and the only thing that says "eight storeys" rather than "one fluted column"
 * is a hard horizontal line every five and three quarter metres — so these are
 * worth the stone.
 */
function cornice(B, cx, cz, y, r, wall, courseH, stone, mat) {
  const sides = Math.max(16, Math.round((TAU * r) / stone));
  B.polyRing(cx, cz, BlockList.circle(r, sides), wall, y, courseH, stone, mat);
  B.polyRing(cx, cz, BlockList.circle(r + courseH * 0.30, sides, Math.PI / sides),
    wall * 0.9, y + courseH, courseH * 0.62, stone, mat);
  B.polyRing(cx, cz, BlockList.circle(r + courseH * 0.62, sides),
    wall * 0.7, y + courseH * 1.62, courseH * 0.55, stone, mat);
  return y + courseH * 2.2;
}

export function buildCampanile(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 2.0 * Math.min(s, 1.3);
  const courseH = 1.55 * Math.min(s, 1.3);
  const P = PISA;

  // The helical stair well, as one predicate over the whole shaft. It runs in
  // the rubble between the two marble skins, which is where it really runs,
  // and it is cut rather than carved: the wall spans it or it does not.
  const stair = (x, y, z) => {
    if (y < P.plinthH + courseH || y > P.bellY - courseH * 2) return false;
    const cz = axisAt(y);
    const dx = x, dz = z - cz;
    const r = Math.hypot(dx, dz);
    const core = coreAt(y);
    if (r < core + P.shell * 0.9 || r > P.outerR - P.shell * 0.9) return false;
    const want = P.stairPhase + y * P.stairTurn;
    const d = Math.atan2(Math.sin(Math.atan2(dz, dx) - want),
      Math.cos(Math.atan2(dz, dx) - want));
    return Math.abs(d) * r < P.stairHalf;
  };

  // The door at the foot of the stair, through the outer skin.
  const door = (x, y, z) => {
    if (y > P.plinthH + 5.2 * S) return false;
    const a = Math.atan2(z, x);
    const d = Math.atan2(Math.sin(a - P.stairPhase), Math.cos(a - P.stairPhase));
    return Math.abs(d) < 0.16 && Math.hypot(x, z) > coreAt(y) + P.shell * 0.5;
  };

  // ── The plinth. Three steps of marble on the foundation, which is three
  // metres of it on Pisan clay and is the reason for everything else here.
  B.section('plinth', () => {
    for (let k = 0; k < 3; k++) {
      const r = P.plinthR - k * 0.55 * S;
      const y = k * (P.plinthH / 3);
      // Solid, laid as concentric rings in from the edge. A single ring set on
      // the outline covers a band either side of it and nothing else, which
      // leaves the inner marble skin of the tower standing over a hole.
      const wall = stone * 1.6;
      for (let rr = r; rr > wall * 0.5; rr -= wall) {
        const mid = rr - wall / 2;
        const sides = Math.max(12, Math.round((TAU * mid) / stone));
        B.polyRing(0, 0, BlockList.circle(mid, sides, k * 0.1), wall,
          y, P.plinthH / 3, stone, M.MARBLE);
      }
    }
  });

  // ── The shaft: outer skin, rubble core, inner skin, laid course by course
  // with the whole ring set south of the one below it.
  B.section('shaft', () => {
    B.openings((x, y, z) => stair(x, y, z) || door(x, y, z), () => {
      let y = P.plinthH;
      let course = 0;
      while (y < P.bellY - 0.001) {
        const h = Math.min(courseH, P.bellY - y);
        const cz = axisAt(y + h / 2);
        const core = coreAt(y + h / 2);
        // Inboard of the loggias the outer face steps back; under the blind
        // arcade it does not, which is why the bottom stage is the thick one.
        const face = y < P.stage1 ? P.outerR : P.outerR - P.gallery;
        const rot = (course % 2) * 0.09;
        const nOut = Math.max(20, Math.round((TAU * face) / stone));
        // Between the two skins, and it has to be centred between their inner
        // and outer faces rather than on one of them: a ring is laid either
        // side of its own outline, so putting the outline on the outer skin's
        // line leaves a hand's width of daylight against the inner one.
        const rMid = (face - P.shell / 2 + core + P.shell * 1.5) / 2;
        const nMid = Math.max(16, Math.round((TAU * rMid) / stone));
        const nIn = Math.max(14, Math.round((TAU * (core + P.shell)) / stone));
        // The blind arcade: fifteen engaged columns and their arches, laid as
        // relief so they are still stones standing on the course below.
        const relief = y < P.stage1
          ? (rx, rz) => {
            const a = Math.atan2(rz - cz, rx);
            const k = a / TAU * 15;
            const f = Math.abs(k - Math.round(k));
            return f < 0.17 ? 0.42 * S : 0;
          }
          : null;
        B.polyRing(0, cz, BlockList.circle(face, nOut, rot), P.shell, y, h,
          stone, M.MARBLE, course % 2, relief);
        const fill = face - core - P.shell * 2;
        if (fill > stone * 0.3) {
          B.polyRing(0, cz, BlockList.circle(rMid, nMid, rot + 0.05), fill,
            y, h, stone, M.RUBBLE, course % 2);
        }
        B.polyRing(0, cz, BlockList.circle(core + P.shell, nIn, rot), P.shell,
          y, h, stone, M.MARBLE, course % 2);
        y += h; course++;
      }
    });
  });

  // ── Six loggias, each standing on the cornice below it.
  B.section('loggias', () => {
    const colR = P.outerR - Math.min((TAU * P.outerR / P.bays) * 0.21, 0.80 * S);
    for (let k = 0; k < P.loggias; k++) {
      const y0 = P.stage1 + k * P.loggiaH;
      const cz = axisAt(y0);
      cornice(B, 0, cz, y0 - courseH * 2.2, P.outerR - P.gallery * 0.5,
        P.gallery * 1.9, courseH, stone, M.MARBLE);
      loggia(B, 0, cz, y0, colR, P.bays, P.loggiaH * 0.62,
        stone, courseH, M.MARBLE, k * 0.05);
    }
    cornice(B, 0, axisAt(P.bellY), P.bellY - courseH * 2.2,
      P.outerR - P.gallery * 0.5, P.gallery * 2.1, courseH, stone, M.MARBLE);
  });

  // ── The bell chamber: a seventh loggia, smaller and set back against the
  // lean, on a solid parapet. Written as columns and arches like the six
  // below it, because that is what it is — the eighth stage of this tower is
  // open, not a wall with holes in it. Cutting it as a wall put a three-metre
  // opening through a five-metre bay, which at a coarse tier leaves no pier
  // between them and four spandrels standing on nothing.
  B.section('belfry', () => {
    const y0 = P.bellY;
    const parapet = P.bellH * 0.20;
    let y = y0;
    let course = 0;
    while (y < y0 + parapet - 0.001) {
      const h = Math.min(courseH, y0 + parapet - y);
      const cz = axisAt(y + h / 2);
      const n = Math.max(16, Math.round((TAU * P.bellR) / stone));
      B.polyRing(0, cz, BlockList.circle(P.bellR, n, (course % 2) * 0.1),
        1.3 * S, y, h, stone, M.MARBLE, course % 2);
      y += h; course++;
    }
    // The walk round the inside of it. The well is open the whole height of
    // the tower — that is where the stair comes up — so this is a ring on the
    // wall head and not a seventeen-metre lid over the void.
    const fr = (P.bellR + coreAt(y0) * 0.92) / 2;
    const nf = Math.max(16, Math.round((TAU * fr) / stone));
    B.polyRing(0, axisAt(y0), BlockList.circle(fr, nf),
      P.bellR - coreAt(y0) * 0.92, y0, courseH, stone, M.MARBLE);

    const cz1 = axisAt(y0 + parapet);
    const top = loggia(B, 0, cz1, y0 + parapet, P.bellR - 0.8 * S, 12,
      P.bellH * 0.40, stone, courseH, M.MARBLE, 0.13);
    cornice(B, 0, axisAt(top), top, P.bellR + 0.2 * S, 1.6 * S,
      courseH, stone, M.MARBLE);
  });

  return B;
}

export const DUOMO = {
  scale: S,
  len: 100 * S,              // west front to the back of the apse
  halfZ: 17.7 * S,           // out to the outer aisle wall
  naveHalfZ: 7.0 * S,        // the nave arcade, between the inner aisles
  aisleH: 17.0 * S,
  naveH: 34.2 * S,
  crossX: 25 * S,            // how far east of centre the crossing sits
  transHalf: 35.6 * S,       // half the length of the transept
  transHalfX: 13.0 * S,
  domeR: 9.4 * S,
  domeTop: 51.1 * S,
  frontTiers: 4,
  offset: { x: -96, z: -40 },
};

export const BAPTISTERY = {
  scale: S,
  r: 17.75 * S,
  wall: 2.6 * S,
  blindH: 12.4 * S,          // the ground storey, blind arcading
  galleryH: 9.8 * S,         // the open gallery over it
  drumH: 9.0 * S,
  domeH: 23.6 * S,
  height: 54.86 * S,
  bays: 20,
  offset: { x: -256, z: -40 },
};

/**
 * A straight wall with round-arched openings cut through it.
 *
 * The same idea as everywhere else here: the arch is masonry that was never
 * laid, so the wall genuinely spans it and genuinely drops when the head of
 * the arch is shot out. `axis` is the direction the wall runs.
 */
function archedWall(B, cx, y0, cz, len, height, thick, axis, bays, openFrac,
  spring, stone, mat, band, bandTo = Infinity) {
  const bay = len / bays;
  const open = (bay * openFrac) / 2;
  B.openings((x, y, z) => {
    if (y < y0 + stone * 0.8 || y > y0 + height - stone * 0.6) return false;
    const u = (axis === 'x' ? x - cx : z - cz) + len / 2;
    const k = u / bay - 0.5;
    const d = (k - Math.round(k)) * bay;
    if (Math.abs(d) >= open) return false;
    if (y <= y0 + spring) return true;
    const dy = y - (y0 + spring);
    return d * d + dy * dy < open * open;
  }, () => {
    if (!band) {
      B.slab(cx, y0 + height / 2, cz,
        axis === 'x' ? len : thick, height, axis === 'x' ? thick : len, stone, mat);
      return;
    }
    // Banded: white and verde in alternating courses, which is what a Pisan
    // Romanesque wall is and not a texture painted on one.
    // Banding belongs to the storeys people stand next to. Carried the whole
    // way up a fifty-metre clerestory it stops reading as courses of stone and
    // starts reading as ribbon glazing, which is what the first version of
    // this cathedral looked like from across the piazza.
    let y = y0, c = 0;
    const h = stone;
    while (y < y0 + height - 0.001) {
      const ch = Math.min(h, y0 + height - y);
      // Every third course, not every other. White marble banded with verde is
      // a wall; white and verde in equal measure is a deck chair.
      const striped = y < bandTo && c % 3 === 1;
      B.slab(cx, y + ch / 2, cz, axis === 'x' ? len : thick, ch,
        axis === 'x' ? thick : len, stone, striped ? M.VERDE : M.MARBLE);
      y += ch; c++;
    }
  });
}

/** A straight run of columns under a straight arcade: one tier of a façade. */
function straightLoggia(B, cx, y0, cz, len, axis, bays, colH, stone, courseH, mat) {
  const bay = len / bays;
  const colR = Math.min(bay * 0.20, 0.75 * S);
  const capH = courseH * 0.45;
  const at = (u) => (axis === 'x'
    ? [cx - len / 2 + u, cz] : [cx, cz - len / 2 + u]);
  for (let i = 0; i <= bays; i++) {
    const [x, z] = at(i * bay);
    let y = y0;
    while (y < y0 + colH - 0.001) {
      const h = Math.min(courseH, y0 + colH - y);
      B.add(x, y + h / 2, z, colR, h / 2, colR, mat);
      y += h;
    }
    B.add(x, y0 + colH + capH / 2, z, colR * 1.4, capH / 2, colR * 1.4, mat);
  }
  const springY = y0 + colH + capH;
  const thick = Math.min(courseH * 0.8, bay * 0.22);
  const span = bay - thick - colR * 1.2;
  for (let i = 0; i < bays; i++) {
    const [x, z] = at((i + 0.5) * bay);
    B.arch(x, springY, z, span, colR * 2.2, thick, 5, mat,
      axis === 'x' ? 'x' : 'z');
  }
  // The floor the next tier stands on.
  const top = springY + span / 2 + thick;
  B.slab(cx, top + courseH / 2, cz, axis === 'x' ? len + colR * 2 : colR * 3.2,
    courseH, axis === 'x' ? colR * 3.2 : len + colR * 2, stone, mat);
  return top + courseH;
}

/**
 * A pitched roof, laid as two stepped slopes meeting at a ridge.
 *
 * A shell rather than a wedge: there is nothing inside it, so the nave below
 * is a real volume and the roof is a real load on the arcades rather than a
 * solid block of stone sitting on them. Tile rather than marble, which is what
 * is actually up there, and which is the difference between this reading as a
 * cathedral and reading as an office block with stripes on it — the first
 * version of this had a flat slab and looked exactly like the latter.
 */
function gable(B, cx, y0, cz, len, span, rise, axis, stone, courseH, mat) {
  const n = Math.max(3, Math.round(rise / courseH));
  const w = (span / n) * 1.3;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const off = (span / 2) * (1 - t) - w * 0.3;
    const y = y0 + rise * t + courseH / 2;
    for (const sg of [1, -1]) {
      if (axis === 'x') B.slab(cx, y, cz + sg * off, len, courseH, w, stone, mat);
      else B.slab(cx + sg * off, y, cz, w, courseH, len, stone, mat);
    }
  }
  // The ridge itself.
  if (axis === 'x') B.slab(cx, y0 + rise + courseH / 2, cz, len, courseH, w, stone, mat);
  else B.slab(cx + 0, y0 + rise + courseH / 2, cz, w, courseH, len, stone, mat);
}

/** A lean-to: one slope, falling away from a wall. */
function penthouse(B, cx, y0, cz, len, span, rise, axis, sg, stone, courseH, mat) {
  const n = Math.max(3, Math.round(rise / courseH));
  const w = (span / n) * 1.3;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const off = sg * (span * (1 - t) - w * 0.3);
    const y = y0 + rise * t + courseH / 2;
    if (axis === 'x') B.slab(cx, y, cz + off, len, courseH, w, stone, mat);
    else B.slab(cx + off, y, cz, w, courseH, len, stone, mat);
  }
}

/**
 * Pisa Cathedral.
 *
 * A five-aisled Romanesque basilica with an elliptical dome over the crossing
 * and a west front of four open galleries stacked over a blind arcade. It is
 * the reason the campanile exists and it is where the garrison lives: a
 * hundred and sixty metres of banded marble with a clerestory to shoot from,
 * standing between the guns and the tower.
 */
export function buildDuomo(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 2.1 * Math.min(s, 1.3);
  const courseH = 1.6 * Math.min(s, 1.3);
  const D = DUOMO;
  const halfX = D.len / 2;

  // ── The outer aisle walls, north and south, with their windows.
  B.section('aisles', () => {
    for (const sz of [1, -1]) {
      archedWall(B, 0, 0, sz * D.halfZ, D.len, D.aisleH, 2.2 * S, 'x',
        18, 0.34, D.aisleH * 0.52, stone, M.MARBLE, true);
      // The blind arcade along the flank: engaged columns on a plinth with a
      // string course over them. It is the one thing that says "Romanesque"
      // from a hundred metres, and without it a hundred and sixty metres of
      // banded wall is an office block with stripes on it.
      const face = sz * (D.halfZ + 1.1 * S);
      for (let i = 0; i <= 26; i++) {
        const x = -halfX + (i / 26) * D.len;
        B.slab(x, D.aisleH * 0.30, face, 1.3 * S, D.aisleH * 0.56,
          1.0 * S, stone, M.MARBLE);
        B.slab(x, D.aisleH * 0.60, face, 1.9 * S, courseH * 0.7,
          1.2 * S, stone, M.MARBLE);
      }
      B.slab(0, D.aisleH * 0.63, face, D.len, courseH * 0.8, 1.0 * S,
        stone, M.VERDE);
      B.slab(0, D.aisleH * 0.13, face, D.len, courseH * 0.9, 1.2 * S,
        stone, M.MARBLE);
    }
    // The aisle roofs: a flat walk over the outer aisle, which is where the
    // garrison stands, and a tiled lean-to falling to it off the nave wall.
    for (const sz of [1, -1]) {
      const w = D.halfZ - D.naveHalfZ;
      // A tiled lean-to falling away from the nave wall, and a marble walk at
      // the outer edge, which is the parapet the garrison stands behind.
      penthouse(B, 0, D.aisleH, sz * D.naveHalfZ, D.len, w * 0.72,
        w * 0.30, 'x', sz, stone, courseH, M.SANDSTONE);
      B.slab(0, D.aisleH + courseH / 2, sz * (D.halfZ - w * 0.14),
        D.len, courseH, w * 0.28, stone, M.MARBLE);
    }
  });

  // ── The nave: two arcades carrying the clerestory.
  B.section('nave', () => {
    // The clerestory: a second row of openings above the aisle roofs, which is
    // what a clerestory is for and what the garrison is standing at. Cut as a
    // separate predicate over the same wall, so one arcade wall carries both
    // the nave arches below and the windows above.
    const sillY = D.aisleH + 3.4 * S;
    const winR = 1.7 * S;
    const clerestory = (x, y) => {
      if (y < sillY || y > sillY + winR * 3.0) return false;
      const k = (x + D.len / 2) / (D.len / 18) - 0.5;
      const d = (k - Math.round(k)) * (D.len / 18);
      if (Math.abs(d) >= winR) return false;
      if (y <= sillY + winR * 2.0) return true;
      const dy = y - (sillY + winR * 2.0);
      return d * d + dy * dy < winR * winR;
    };
    B.openings(clerestory, () => {
      for (const sz of [1, -1]) {
        archedWall(B, 0, 0, sz * D.naveHalfZ, D.len, D.naveH, 2.0 * S, 'x',
          18, 0.62, D.aisleH * 0.62, stone, M.MARBLE, true, D.aisleH);
      }
    });
    // The nave roof: a tiled gable, which is the load the arcades carry.
    gable(B, 0, D.naveH, 0, D.len, D.naveHalfZ * 2 + 2.2 * S, D.naveHalfZ * 0.85,
      'x', stone, courseH, M.SANDSTONE);
  });

  // ── The transept, across the nave two thirds of the way east.
  B.section('transept', () => {
    for (const sx of [1, -1]) {
      archedWall(B, D.crossX + sx * D.transHalfX, 0, 0, D.transHalf * 2,
        D.aisleH * 1.35, 2.2 * S, 'z', 12, 0.34, D.aisleH * 0.6,
        stone, M.MARBLE, true);
    }
    for (const sz of [1, -1]) {
      archedWall(B, D.crossX, 0, sz * D.transHalf, D.transHalfX * 2,
        D.aisleH * 1.35, 2.2 * S, 'x', 4, 0.34, D.aisleH * 0.6,
        stone, M.MARBLE, true);
    }
    // No flat roof over the arms. Twenty-six metres of slab between two walls
    // is seventy stones with nothing under them; a gable is corbelled, each
    // course standing on the one below and stepping in, and carries itself.
    // Two of them, one on each arm, clear of the crossing.
    for (const sz of [1, -1]) {
      gable(B, D.crossX, D.aisleH * 1.35 + courseH, sz * (D.transHalf + D.domeR) / 2,
        D.transHalf - D.domeR, D.transHalfX * 2 + 2.2 * S, D.transHalfX * 0.7,
        'z', stone, courseH, M.SANDSTONE);
    }
  });

  // ── The apse, and the west front.
  B.section('apse', () => {
    const n = Math.max(14, Math.round((Math.PI * D.halfZ) / stone));
    let y = 0;
    while (y < D.aisleH * 1.25 - 0.001) {
      const h = Math.min(courseH, D.aisleH * 1.25 - y);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI;
        pts.push([Math.cos(a) * D.naveHalfZ * 1.5, Math.sin(a) * D.naveHalfZ * 1.5]);
      }
      B.polyRing(halfX - D.naveHalfZ * 0.4, 0, pts, 2.2 * S, y, h, stone,
        (Math.round(y / courseH) % 2) ? M.VERDE : M.MARBLE);
      y += h;
    }
  });

  B.section('front', () => {
    const w = D.halfZ * 2;
    archedWall(B, -halfX, 0, 0, 2.6 * S, D.aisleH, w, 'x', 1, 0.0,
      D.aisleH * 0.5, stone, M.MARBLE, true);
    // The seven blind arches of the ground storey, and four open galleries
    // over them, each one narrower than the last.
    let y = D.aisleH;
    for (let k = 0; k < D.frontTiers; k++) {
      const tierW = w * (1 - k * 0.19);
      y = straightLoggia(B, -halfX, y, 0, tierW, 'z', 10 - k, 4.2 * S,
        stone, courseH, k % 2 ? M.VERDE : M.MARBLE);
    }
  });

  // ── The dome on the crossing: a drum on four arches, then the shell.
  B.section('dome', () => {
    const y0 = D.aisleH * 1.35 + courseH;
    const drumH = D.domeTop - D.domeR * 1.15 - y0;
    let y = y0;
    let c = 0;
    while (y < y0 + drumH - 0.001) {
      const h = Math.min(courseH, y0 + drumH - y);
      const n = Math.max(16, Math.round((Math.PI * 2 * D.domeR) / stone));
      B.polyRing(D.crossX, 0, BlockList.circle(D.domeR, n, (c % 2) * 0.1),
        1.8 * S, y, h, stone, c % 3 === 1 ? M.VERDE : M.MARBLE, c % 2);
      y += h; c++;
    }
    // Pointed, and with a lantern on it. Pisa's is an elliptical dome and
    // reads as a cone with a rounded shoulder from the plaza, not as the
    // hemisphere a cosine profile gives — which came out as a white ball
    // resting on the roof.
    const dh = D.domeR * 1.55;
    B.dome(D.crossX, 0, y0 + drumH, dh, D.domeR, 1.4 * S, courseH * 0.7, stone,
      M.MARBLE, (t) => Math.pow(Math.max(0, 1 - Math.pow(t, 1.45)), 0.62));
    const ly = y0 + drumH + dh;
    let y2 = ly;
    while (y2 < ly + 4.0 * S - 0.001) {
      const h = Math.min(courseH, ly + 4.0 * S - y2);
      const n2 = Math.max(10, Math.round((TAU * D.domeR * 0.22) / stone));
      B.polyRing(D.crossX, 0, BlockList.circle(D.domeR * 0.22, n2), 0.8 * S,
        y2, h, stone, M.MARBLE);
      y2 += h;
    }
    B.slab(D.crossX, ly + 4.6 * S, 0, D.domeR * 0.7, courseH * 0.8,
      D.domeR * 0.7, stone, M.MARBLE);
  });

  return B;
}

/**
 * The Baptistery.
 *
 * A drum fifty-five metres tall with a blind arcade round the bottom, an open
 * gallery over it, and a dome inside a dome. It is the simplest problem on the
 * map and the only structure here with no lean and no trick in it: a ring of
 * masonry that stands until enough of the ring is gone.
 */
export function buildBaptistery(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 2.1 * Math.min(s, 1.3);
  const courseH = 1.6 * Math.min(s, 1.3);
  const Q = BAPTISTERY;

  B.section('drum', () => {
    // The ground storey: a wall with the blind arcade laid as relief, and the
    // four real doorways cut through it.
    B.openings((x, y, z) => {
      if (y > Q.blindH * 0.52) return false;
      const a = Math.atan2(z, x);
      for (let i = 0; i < 4; i++) {
        const d = Math.atan2(Math.sin(a - i * Math.PI / 2), Math.cos(a - i * Math.PI / 2));
        if (Math.abs(d) < 0.11) return true;
      }
      return false;
    }, () => {
      let y = 0, c = 0;
      while (y < Q.blindH - 0.001) {
        const h = Math.min(courseH, Q.blindH - y);
        const n = Math.max(20, Math.round((TAU * Q.r) / stone));
        B.polyRing(0, 0, BlockList.circle(Q.r, n, (c % 2) * 0.08), Q.wall, y, h,
          stone, c % 2 ? M.VERDE : M.MARBLE, c % 2,
          (rx, rz) => {
            const k = (Math.atan2(rz, rx) / TAU) * Q.bays;
            return Math.abs(k - Math.round(k)) < 0.16 ? 0.4 * S : 0;
          });
        y += h; c++;
      }
    });
  });

  // The open gallery: real columns carrying a real arcade, as on the tower.
  B.section('gallery', () => {
    const y0 = Q.blindH;
    const r = Q.r - 0.7 * S;
    const top = loggia(B, 0, 0, y0, r, Q.bays, Q.galleryH * 0.58,
      stone, courseH, M.MARBLE, 0.04);
    cornice(B, 0, 0, top, Q.r, Q.wall * 1.4, courseH, stone, M.MARBLE);
  });

  // The upper drum and the dome over it.
  B.section('dome', () => {
    const y0 = Q.blindH + Q.galleryH;
    let y = y0, c = 0;
    while (y < y0 + Q.drumH - 0.001) {
      const h = Math.min(courseH, y0 + Q.drumH - y);
      const n = Math.max(18, Math.round((TAU * (Q.r - 1.2 * S)) / stone));
      B.polyRing(0, 0, BlockList.circle(Q.r - 1.2 * S, n, (c % 2) * 0.08),
        Q.wall * 0.9, y, h, stone, c % 2 ? M.VERDE : M.MARBLE, c % 2);
      y += h; c++;
    }
    B.dome(0, 0, y0 + Q.drumH, Q.domeH, Q.r - 1.2 * S, 1.4 * S, courseH, stone,
      M.MARBLE, (t) => Math.cos(t * Math.PI / 2) ** 0.62);
  });

  return B;
}
