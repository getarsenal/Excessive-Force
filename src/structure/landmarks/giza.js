import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Great Pyramid of Khufu, and its neighbours on the Giza plateau.
 *
 * Reference figures (Egyptian Ministry of Antiquities survey, widely published):
 *   Khufu       base 230.3 m square, original height 146.6 m, faces at 51.85 deg
 *   Khafre      base 215.5 m square, height 136.4 m, limestone casing at the apex
 *   Menkaure    base 102.2 m square, height 65.5 m, granite casing at the base
 *   Sphinx      73 m long, 20 m high
 *
 * A pyramid is the exact opposite of every other landmark in this game, and
 * that is the interesting thing about it. A tower is a cantilever: take a bite
 * out of one side and the whole of it comes over, which is the shot the player
 * is looking for on every other map. A pyramid cannot topple. There is nothing
 * to topple — every stone is already sitting on a wider stone, and the load
 * path from any block to the ground is a few metres of solid limestone.
 *
 * So the pyramid has to be *quarried*, not felled, and the level says so. What
 * makes that playable rather than tedious is the inside: the King's Chamber,
 * the Grand Gallery and the descending passage are real voids with real
 * ceilings, and the relieving stones over the chamber are a genuine structural
 * trick that can genuinely be defeated. Open the casing, work in to the
 * gallery, and a third of the mass above it has nowhere to go.
 *
 * Courses are laid at the real proportion — thick at the base, thinning as
 * they rise — rather than at a constant height, which is what stops it reading
 * as a stack of identical trays.
 */

export const KHUFU = {
  base: 230.3,
  height: 146.6,
  // The chamber system, in metres above the base.
  chamberY: 43.0,
  chamberW: 10.5,       // 10.5 x 5.2 m, long axis east-west
  chamberD: 5.2,
  chamberH: 5.8,
  galleryY: 22.0,
  galleryTop: 43.0,
};

/** Half-width of the pyramid at height `y`. */
function halfAt(y, base = KHUFU.base, height = KHUFU.height) {
  return (base / 2) * Math.max(0, 1 - y / height);
}

/**
 * One pyramid, cased and cored.
 *
 * Built as stacked square slabs rather than as a ring: a pyramid really is
 * solid, and hollowing it to save stones would make it behave like a shell —
 * blowing the corner off would drop the face into an empty middle instead of
 * exposing more core.
 *
 * `voids` is a predicate marking the passages and chambers, cut by omission
 * so the ceilings genuinely span them.
 */
function pyramid(B, cx, cz, base, height, stone, opts = {}) {
  const casingMat = opts.casing ?? M.LIMESTONE;
  const coreMat = opts.core ?? M.RUBBLE;
  const capMat = opts.cap ?? casingMat;
  // Courses thin as they rise, from about 1.4 m at the base to 0.6 m at the
  // apex, which is roughly what Khufu does.
  let y = 0;
  while (y < height - 0.001) {
    const t = y / height;
    const courseH = Math.max(stone * 0.55, (1.40 - t * 0.80) * Math.max(1, stone / 1.9));
    const h = Math.min(courseH, height - y);
    const half = halfAt(y + h / 2, base, height);
    if (half < stone * 0.9) {
      // The last few metres are one pyramidion. Never widened to the stone
      // size: a cap broader than the course beneath it is an overhang, and an
      // overhang at the apex is a block resting on air.
      const w = Math.max(0.6, half * 2);
      B.slab(cx, y + h / 2, cz, w, h, w, stone, capMat);
      y += h;
      continue;
    }
    // One solid course, not a casing ring around a core slab.
    //
    // The ring-and-core version was the more interesting model and it does not
    // stand. A 51.85 degree face steps in by 0.78 of the course height every
    // course, so with 4.5 m courses the casing moves 3.5 m inward each time:
    // every casing ring lands entirely inboard of the ring below it, bearing
    // on core rather than on casing, and a hundred and twenty-odd stones of it
    // started the level detached. They then fell, and a hundred and twenty
    // six-metre blocks of limestone is sixty thousand tonnes — which the
    // economy paid out as sixty-three thousand dollars before the player had
    // fired a shot.
    //
    // A pyramid is solid. Laying each course as one slab of stones on the
    // wider slab beneath it is both what the building actually is and the only
    // arrangement where every block has something under it by construction.
    // The casing survives as the outermost ring of blocks in each course,
    // which is where the casing is.
    const skin = Math.min(half * 0.45, Math.max(3.0, h * 1.15));
    const wall = skin * 0.5;
    // The core fills the inside of the casing ring exactly. It used to be laid
    // the full width of the course with the ring round it, so the two shared
    // a metre of volume and their tops were on the same plane — every step of
    // every pyramid was a band of tan rubble and pale limestone fighting for
    // the same pixels, which read as the stone flashing.
    B.slab(cx, y + h / 2, cz, (half + 0.45 - wall) * 2, h, (half + 0.45 - wall) * 2, stone, coreMat);
    // Dressed stone over the face, stepped back with the course so the
    // pyramid reads as cased rather than as bare core.
    const casing = opts.casingAt ? opts.casingAt(t) : casingMat;
    B.ring(cx, cz, half * 2 + 0.9, half * 2 + 0.9, wall, y, h,
      stone * 0.9, casing, Math.round(y / 1.2) % 2);
    y += h;
  }
}

export function buildGreatPyramid(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  // Coarse, but not as coarse as it was. Khufu is 2.3 million cubic metres;
  // at the Elizabeth Tower's stone size this one object would be three hundred
  // thousand bodies. Six-metre blocks kept it cheap and made it unshootable —
  // a shell's blast radius is about two metres, so it could only ever touch
  // one block at a time. Four and a half metres is the compromise: two and a
  // half times the bodies, and a charge that takes out a cluster rather than a
  // single stone.
  //
  // Capped, because that reasoning was only ever true at one quality tier. The
  // coarsest tier multiplies every stone size by 1.55, which took these back
  // to seven-metre blocks — larger than the six-metre ones rejected above, and
  // unshootable for exactly the reason given: eighty rounds into one face
  // quarried nine stones out, and the player who reported that the pyramids
  // could not be destroyed was playing at that tier. Khufu grows by about half
  // again in stone count on a phone, which is the price of the level being
  // winnable there.
  const stone = 4.6 * Math.min(s, 1.35);

  const K = KHUFU;

  // Where the great granite beams sit. Shared by the void predicate and by the
  // section that lays them: a beam is a stone occupying a slot, so the slot has
  // to be cut out of the surrounding masonry first. Laying them without doing
  // that buried every one of them inside a core block, and Rapier resolves an
  // overlap by shoving — the pyramid arrived awake and settled a metre.
  const BEAM_H = 0.85;
  const beamYs = [];
  for (let k = 0; k < 6; k++) {
    beamYs.push(K.chamberY + K.chamberH
      + (k === 0 ? 0.9 : 2.2 + (k - 1) * 3.4 + 1.8));
  }

  /**
   * Where the demolition charges are walled in.
   *
   * Worked out before the masonry, because each one needs a slot cut for it in
   * exactly the same way the granite beams do: a block added inside a solid
   * course shares its volume with the stone around it, and Rapier answers an
   * overlap by shoving — which is how the pyramid once arrived awake and
   * settled a metre before the player had touched it.
   */
  const CHARGE_E = Math.max(2.0, stone * 0.62);
  const charges = [];
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.6) / 7.9;
    const y = K.height * t * 0.72 + 12;
    const half = halfAt(y, K.base, K.height);
    if (half < 14) continue;
    const a = i * 2.399963;                       // golden angle, so they spread
    const r = Math.max(6, half - (9 + (i % 3) * 5));
    const cs = Math.cos(a), sn = Math.sin(a);
    const m = Math.max(Math.abs(cs), Math.abs(sn));
    charges.push({ x: (cs / m) * r, y, z: (sn / m) * r });
  }

  /**
   * The passages and chambers.
   *
   * Cut by omission, so the masonry over them genuinely spans and genuinely
   * comes down when the span is broken. Coordinates are the real ones: the
   * descending passage enters the north face, the ascending passage climbs to
   * the Grand Gallery, and the gallery leads to the King's Chamber a third of
   * the way up.
   */
  const voids = (x, y, z) => {
    // King's Chamber.
    if (y > K.chamberY && y < K.chamberY + K.chamberH
      && Math.abs(x) < K.chamberW / 2 && Math.abs(z - 2) < K.chamberD / 2) return true;
    // The five relieving chambers stacked over it — the reason the ceiling
    // holds up sixty metres of masonry, and the thing worth shooting at.
    for (let k = 0; k < 5; k++) {
      const ry = K.chamberY + K.chamberH + 2.2 + k * 3.4;
      if (y > ry && y < ry + 1.6
        && Math.abs(x) < K.chamberW / 2 - 0.4 && Math.abs(z - 2) < K.chamberD / 2) return true;
    }
    // Grand Gallery: 47 m long, climbing at 26 degrees, 2.1 m wide.
    if (y > K.galleryY && y < K.galleryTop) {
      const along = (y - K.galleryY) / Math.tan(26 * Math.PI / 180);
      if (Math.abs(x) < 1.05 && Math.abs(z - (2 - 40 + along)) < 3.2) return true;
    }
    // Ascending and descending passages, on the same axis.
    if (y > 6 && y < K.galleryY + 2) {
      const along = (y - 6) / Math.tan(26 * Math.PI / 180);
      if (Math.abs(x) < 0.9 && Math.abs(z - (2 - 74 + along)) < 2.4) return true;
    }
    // Queen's Chamber.
    if (y > 19 && y < 25 && Math.abs(x) < 2.8 && Math.abs(z - 2) < 2.6) return true;
    // The slots the charges sit in.
    for (const c of charges) {
      if (Math.abs(x - c.x) < CHARGE_E + 0.45
        && Math.abs(y - c.y) < CHARGE_E + 0.45
        && Math.abs(z - c.z) < CHARGE_E + 0.45) return true;
    }
    // The slots the granite beams lie in.
    for (const ry of beamYs) {
      if (Math.abs(y - ry) < BEAM_H + 0.1
        && Math.abs(x) < K.chamberW / 2 + 0.3
        && Math.abs(z - 2) < K.chamberD / 2 + 2.9) return true;
    }
    return false;
  };

  B.section('bedrock', () => {
    B.slab(0, -2.0, 0, K.base + 16, 4.0, K.base + 16, stone * 2.0, M.CONCRETE);
  });

  // Entrance: the robbers' tunnel, open on the north face. A hole in the
  // casing the player can already see, and the way in if they want one. The
  // arch is laid into a slot cut for it, so the tunnel mouth is a real hole
  // with a real ring of stone round it.
  const ENTRANCE_Y = 17;
  const entranceVoid = BlockList.archVoid(0, ENTRANCE_Y, -halfAt(ENTRANCE_Y, K.base, K.height) + 1.5,
    6.0, 1.4, 3.6, 'x', 0.3);
  const entranceTunnel = (x, y, z) => y > ENTRANCE_Y - 2.6 && y < ENTRANCE_Y + 0.2
    && Math.abs(x) < 3.0 && z < -halfAt(ENTRANCE_Y, K.base, K.height) + 6.5;

  B.section('pyramid', () => {
    B.openings((x, y, z) => voids(x, y, z) || entranceVoid(x, y, z) || entranceTunnel(x, y, z), () => {
      pyramid(B, 0, 0, K.base, K.height, stone,
        { casing: M.LIMESTONE, core: M.RUBBLE, cap: M.GILT });
    });
  });

  // The great granite beams over the King's Chamber. These are the single
  // most load-bearing objects in the building and they are laid as individual
  // stones on purpose: break two of them and sixty metres of pyramid finds out
  // that it has been resting on nine slabs of Aswan granite all along.
  B.section('relieving', () => {
    for (const ry of beamYs) {
      const n = Math.max(3, Math.round(K.chamberW / (stone * 0.8)));
      for (let i = 0; i < n; i++) {
        const x = -K.chamberW / 2 + (i + 0.5) * (K.chamberW / n);
        B.add(x, ry, 2, K.chamberW / (2 * n) - 0.05, BEAM_H,
          K.chamberD / 2 + 2.7, M.IRON);
      }
    }
  });

  // ── Demolition charges ───────────────────────────────────────────────────
  //
  // Something to find. Quarrying a pyramid down is a grind by construction —
  // there is no cantilever in it to exploit, so the only way through is
  // material — and a grind wants a reason to keep cutting into the same face.
  // These are crates of explosive walled into the fill, soft enough that the
  // round which exposes one sets it off, and worth a few per cent of the
  // monument each when they go.
  //
  // Placed on a spiral so they are spread over all four faces and most of the
  // height, and set back from the surface far enough that the player has to
  // have got somewhere before finding one. Nothing marks them: the reward is
  // for digging, and a marked charge is a button.
  B.section('charges', () => {
    for (const c of charges) B.add(c.x, c.y, c.z, CHARGE_E, CHARGE_E, CHARGE_E, M.CHARGE);
  });

  B.section('entrance', () => {
    const half = halfAt(ENTRANCE_Y, K.base, K.height);
    B.arch(0, ENTRANCE_Y, -half + 1.5, 6.0, 3.0, 1.4, Math.max(7, Math.round(11 / s)),
      M.LIMESTONE, 'x');
  });

  return B;
}

/** Khafre — smaller, steeper, and still wearing its casing at the top. */
export function buildKhafre(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  // Khafre stays coarse: it is a secondary objective, and doubling its body
  // count to make it shootable would cost more than the level gains.
  const stone = 7.0 * s;
  B.section('bedrock', () => {
    B.slab(0, -2.0, 0, 224, 4.0, 224, stone * 2.0, M.CONCRETE);
  });
  B.section('khafre', () => {
    // The band of Tura casing still on the top third is the thing that tells
    // Khafre from Khufu at any distance.
    pyramid(B, 0, 0, 215.5, 136.4, stone,
      { casing: M.SANDSTONE, core: M.RUBBLE, cap: M.LIMESTONE,
        casingAt: (t) => (t > 0.70 ? M.LIMESTONE : M.SANDSTONE) });
  });
  return B;
}

/** Menkaure — the small one, granite-cased at the base. */
export function buildMenkaure(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 5.2 * s;
  B.section('bedrock', () => {
    B.slab(0, -1.6, 0, 112, 3.2, 112, stone * 2.0, M.CONCRETE);
  });
  B.section('menkaure', () => {
    // Granite-cased for its first sixteen courses, which is the red band at
    // its foot.
    pyramid(B, 0, 0, 102.2, 65.5, stone,
      { casing: M.LIMESTONE, core: M.RUBBLE, cap: M.LIMESTONE,
        casingAt: (t) => (t < 0.25 ? M.REDSTONE : M.LIMESTONE) });
  });
  return B;
}

/**
 * The Great Sphinx.
 *
 * Carved from the bedrock rather than built, so structurally it is one lump —
 * but it is the thing everyone looks for, it holds a garrison in the paws, and
 * it is worth money.
 */
export function buildSphinx(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const stone = 2.6 * s;
  const L = M.SANDSTONE;

  B.section('sphinx', () => {
    // Laid as bands that touch and never overlap.
    //
    // The first version of this was modelled by eye — a slab for the body, a
    // slab for the chest, a slab for the headdress, a slab for the face — and
    // half of them interpenetrated. Rapier resolves an overlap by pushing the
    // two bodies apart, so the Sphinx arrived awake, shoved itself around for
    // a second and settled a metre lower, and it woke seven hundred stones
    // doing it. Nothing here shares a cubic metre with anything else.
    //
    // [y0, y1, [cx, cz, width, depth], ...]
    const BANDS = [
      // The recumbent body, 57 m of it, and the forelegs reaching out in front.
      [0, 13, [0, 5, 14, 54]],
      [0, 5, [4.6, -34, 5.0, 22], [-4.6, -34, 5.0, 22]],
      [0, 2, [4.6, -48, 5.6, 6], [-4.6, -48, 5.6, 6]],
      // Chest and haunches.
      [13, 18, [0, -6, 13, 30]],
      [13, 16, [0, 20, 12, 22]],
      // Shoulders, then the nemes headdress — which is much wider than the
      // face and is what gives the head its shape from any distance.
      [18, 21, [0, -13, 11.5, 14]],
      [21, 25.5, [0, -15.5, 12.4, 10]],
      [25.5, 27, [0, -15.5, 9.6, 8]],
      // The face, in front of the headdress rather than inside it.
      [20, 25, [0, -23, 6.6, 5]],
      // The lappets, hanging outside the headdress on both sides.
      [18, 24, [7.4, -16, 2.2, 8], [-7.4, -16, 2.2, 8]],
    ];
    for (const band of BANDS) {
      const [y0, y1] = band;
      for (let i = 2; i < band.length; i++) {
        const [cx, cz, w, d] = band[i];
        B.slab(cx, (y0 + y1) / 2, cz, w, y1 - y0, d, stone, L);
      }
    }
    // Uraeus, and the stela Thutmose IV set between the paws.
    B.slab(0, 28, -19, 1.2, 2.0, 1.2, stone, M.GILT);
    B.slab(0, 4, -47, 3.4, 8.0, 0.9, stone, M.LIMESTONE);
  });

  return B;
}
