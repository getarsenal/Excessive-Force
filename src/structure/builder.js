/**
 * Masonry primitives.
 *
 * Everything a landmark is made of comes out of this file as individual stones
 * with real dimensions. Nothing here knows about physics or rendering — it just
 * emits blocks into a flat list, which `Structure` then turns into bodies and
 * an adjacency graph.
 *
 * The important detail is that courses are *bonded*: alternating courses are
 * offset by half a stone so vertical joints don't line up. That's not
 * decoration — a running bond is why real masonry distributes load sideways,
 * and it's what makes the support graph interesting when you blow a hole in it.
 */

export const MATERIALS = {
  LIMESTONE: 0,  // Anston stone facing
  BRICK: 1,      // inner structural core
  IRON: 2,       // spire framework, cast iron
  GLASS: 3,      // clock dials
  SLATE: 4,      // roofing
  GILT: 5,       // gold leaf detail
  CONCRETE: 6,   // foundations, modern context
  MARBLE: 7,     // Makrana marble, the Taj's facing
  SANDSTONE: 8,  // Agra red sandstone
  REDSTONE: 9,   // the Palace of Westminster's own warm red-brown stone
  RUBBLE: 10,    // the packed rubble-and-mortar fill inside a pyramid
  IRONWORK: 11,  // painted structural ironwork — the Eiffel Tower's own bronze
  CHARGE: 12,    // a buried demolition charge; destroying one sets it off
  RAILING: 13,   // ironwork nothing may rest on: balustrades and screens
  VERDE: 14,     // the grey-green stone of Pisan banding
  TILE: 15,      // glazed ceramic over a concrete rib: a shell vault
  STEEL: 16,     // painted structural steel, white: the London Eye
  CURTAIN: 17,   // a supertall's high-strength concrete, glass-faced: the Burj
};

/**
 * `structural: false` marks infill — glazing and applied ornament. It hangs on
 * the frame and carries its own weight down, but nothing rests *on* it, so the
 * load solver routes around it. Without this distinction the tower's upper mass
 * would path through the clock glazing and crush it on the first frame, which
 * is exactly what a real stone surround exists to prevent.
 */
export const MATERIAL_PROPS = {
  [MATERIALS.LIMESTONE]: { density: 2.45, strength: 1.00, toughness: 100, color: 0xdcc99e, structural: true },
  [MATERIALS.BRICK]:     { density: 1.90, strength: 0.78, toughness: 78,  color: 0xa4573c, structural: true },
  [MATERIALS.IRON]:      { density: 7.20, strength: 2.60, toughness: 210, color: 0x6e7d84, structural: true },
  [MATERIALS.GLASS]:     { density: 2.50, strength: 0.16, toughness: 16,  color: 0xe6f2f7, structural: false },
  [MATERIALS.SLATE]:     { density: 2.70, strength: 0.55, toughness: 55,  color: 0x7d8899, structural: true },
  [MATERIALS.GILT]:      { density: 2.60, strength: 0.70, toughness: 70,  color: 0xe2b446, structural: false },
  [MATERIALS.CONCRETE]:  { density: 2.35, strength: 1.45, toughness: 150, color: 0xa39c8e, structural: true },
  [MATERIALS.MARBLE]:    { density: 2.70, strength: 1.08, toughness: 112, color: 0xf4ece0, structural: true },
  [MATERIALS.SANDSTONE]: { density: 2.30, strength: 0.82, toughness: 84,  color: 0xb85f3e, structural: true },
  // The dark half of Pisan banding: verde di Prato, the grey-green serpentine
  // laid in courses against white Carrara. Physically it is as good a stone as
  // the marble beside it, which is why it can be a structural course rather
  // than applied facing — striping a building with something weak would put a
  // failure plane every other course, which is not what these walls are.
  //
  // Undersaturated for the same reason REDSTONE is: the per-stone jitter and
  // the grade downstream both push colour, and a convincing green here comes
  // out of the pipeline as billiard baize.
  [MATERIALS.VERDE]:     { density: 2.62, strength: 1.02, toughness: 106, color: 0x8b9489, structural: true },
  // A shell vault: precast concrete rib with a skin of glazed ceramic on it.
  // Rated as the concrete, because the concrete is what carries — the tile is
  // a millimetre of glaze and a colour. Off-white and slightly warm, which is
  // what a million Hoganas tiles look like in sunlight and a long way from the
  // grey CONCRETE would have made of the Sydney Opera House.
  [MATERIALS.TILE]:      { density: 2.40, strength: 1.40, toughness: 145, color: 0xe9e5da, structural: true },
  // Anston limestone weathered to the warm red-brown the tower reads as
  // against a low sun. Physically it is limestone; only the colour differs.
  //
  // Deliberately undersaturated. Every stone's saturation is then multiplied
  // by up to 1.4 by the per-stone jitter and pushed again by the ACES grade on
  // the way to the screen, so a swatch that looks like the right red here
  // comes out of the pipeline as a traffic cone — which is exactly what the
  // first attempt at this did to the whole Palace of Westminster.
  [MATERIALS.REDSTONE]:  { density: 2.45, strength: 1.00, toughness: 100, color: 0xa87b6c, structural: true },
  // What a pyramid is actually full of: roughly dressed local limestone packed
  // with rubble and gypsum mortar, not dressed ashlar.
  //
  // Soft on purpose, and it has to be. A stone's health goes as its volume, so
  // a six-metre pyramid block has fifteen times the health of a stone in the
  // Elizabeth Tower — eighty rounds into one face of Khufu quarried nine
  // blocks out of twenty thousand, which is a level that cannot be won. The
  // core is a quarter the toughness of dressed stone, so a shell that lands on
  // it takes a piece out of the pyramid rather than scuffing it.
  [MATERIALS.RUBBLE]:    { density: 2.10, strength: 0.70, toughness: 26,  color: 0xbaa478, structural: true },
  // "Eiffel brown", the bronze the tower is actually painted.
  //
  // Structurally identical to IRON; the colour is the whole point. Raw IRON is
  // a dark slate blue, and a lattice is the densest geometry in the game — the
  // per-stone ambient occlusion darkens a stone by how many neighbours it has,
  // and in a laced caisson that is all of them. The tower came out as a black
  // obelisk with no arches, galleries or silhouette readable at any distance.
  // "Eiffel Tower Brown" is a dark red-bronze, three shades of it up the
  // tower. At 0x9d8468 under the per-stone jitter and the tonemap it came out
  // as pale tan and the whole building read as sandstone.
  //
  // Rated as iron rather than as masonry, which it had never been. Capacity
  // here is `area x strength x 14 MPa`, and 14 MPa is the working compressive
  // strength of coursed limestone — governed by the mortar joints, not the
  // stone. A riveted wrought-iron section has no mortar in it: the material
  // runs to 200-350 MPa and a working figure near 200 is conservative. At 2.60
  // this was rated at 36 MPa, a tenth of the real thing, and that one number
  // decided the shape of the whole tower — members thin enough to see through
  // could not carry what stands on them, so the only lattice that would stand
  // was one solid enough to read as a chimney. At 14.0 it is 196 MPa and the
  // web can be the third-solid thing it is in Paris.
  [MATERIALS.IRONWORK]:  { density: 7.20, strength: 14.0, toughness: 260, color: 0x7b5f45, structural: true },
  // A crate of explosive walled into the masonry. Structural, because it is
  // packed in and the stone above rests on it, and soft, because the reward
  // for quarrying down to one should be that the next round sets it off.
  // Painted like a find: dull red read as one more brick of the core, and a
  // reward nobody notices is not a reward.
  [MATERIALS.CHARGE]:    { density: 1.10, strength: 0.40, toughness: 9,   color: 0xe0a21c, structural: true },
  // The Eiffel's railings: painted ironwork like the frame, but a screen a
  // hand's width thick is not something a tower stands on. Structural, it
  // was: the solver's grout joined the shaft's corner posts to the railing
  // two metres beside them, split the posts' hundred meganewtons across
  // both, and the railing went first.
  [MATERIALS.RAILING]:   { density: 7.20, strength: 14.0, toughness: 260, color: 0x7b5f45, structural: false },
  // White painted steel. As strong as the Eiffel's ironwork and painted the
  // colour the Eye is painted; structural, because the wheel stands on it.
  [MATERIALS.STEEL]:     { density: 7.85, strength: 14.0, toughness: 280, color: 0xeef1f3, structural: true },
  // What a supertall is actually made of: the high-strength concrete of its
  // core and its wing walls, coloured as the glass hung on the outside of it,
  // because GLASS in this game carries nothing and a tower skinned in it
  // would have nothing to stand on. Blue and pale on purpose: the per-stone
  // jitter and the grade push it toward grey, and grey is what a half-
  // kilometre of concrete already looks like.
  //
  // Two and a half times CONCRETE's strength, and for the reason the real
  // tower has it. CONCRETE here is an ordinary mix, set against a ninety-six
  // metre tower that puts 2.3 MPa on its lowest course. Half a kilometre of
  // the same puts eleven, the floors and the setbacks concentrate it, and the
  // wing walls came out standing at exactly their capacity — a tower that
  // crushes itself on the first frame with nobody firing. A building that
  // tall is not built of ordinary concrete anywhere in the world: the Burj is
  // C80, roughly this ratio over the C30 the rest of the campaign is made of.
  // The collapse it is supposed to have is still there, because it is loss of
  // support at a setback and not crushing, and capacity still scales with
  // damage, so a shelled stone fails exactly as before.
  [MATERIALS.CURTAIN]:   { density: 2.30, strength: 3.80, toughness: 120, color: 0xa8c4d6, structural: true },
};


/**
 * Stones are laid a hair under their nominal size so they don't start the
 * simulation interpenetrating.
 *
 * The shrink has to be an absolute distance, not a percentage. At 3 % a 1 m
 * stone loses 3 cm and still touches its neighbour, but a 4 m core block loses
 * 12 cm — wider than the adjacency tolerance — so large blocks silently stop
 * connecting to each other and whatever they were holding up falls down. That
 * bug is invisible in the geometry and only shows up as a building collapsing
 * on the first frame.
 */
export const JOINT = 0.015;

export class BlockList {
  constructor() {
    /** flat block records: {x,y,z, hx,hy,hz, ry, mat, tag} */
    this.blocks = [];
    this.tagRanges = {};
    /**
     * Half the joint a stone is laid with, in the builder's own metres.
     *
     * A builder that writes at real size and scales up afterwards should set
     * this to `JOINT / scale`, so the joint is 3 cm in the world and not
     * 3 cm times the scale: at two and a half times life the plain joint is
     * 7.5 cm, which is exactly the solver's contact tolerance, and whether a
     * course stands on the one below then depends on floating-point noise —
     * the Himeji keep's first storey came apart at one tier and not another
     * on that alone.
     */
    this.joint = JOINT;
  }

  shrink(half) {
    return Math.max(half - this.joint, half * 0.6);
  }

  get length() { return this.blocks.length; }

  /**
   * Scale the whole structure about its own origin.
   *
   * A landmark is written at its real dimensions, which is what makes the
   * builder readable and checkable against survey figures — so making one
   * bigger is a transform applied afterwards rather than a hundred edited
   * constants that then have to be kept in step with the garrison.
   *
   * The joint shrink each stone was laid with scales too, so a doubled tower
   * has 3 cm joints rather than 1.5 cm. That is still well inside the 7.5 cm
   * the support solver treats as touching, which is the number that matters:
   * open the joints past it and the building silently stops being connected
   * to itself.
   */
  scaleAll(k) {
    if (k === 1) return this;
    for (const b of this.blocks) {
      b.x *= k; b.y *= k; b.z *= k;
      b.hx *= k; b.hy *= k; b.hz *= k;
    }
    return this;
  }

  /** Group the blocks emitted by `fn` under a name, for gameplay queries. */
  section(tag, fn) {
    const start = this.blocks.length;
    this._tag = tag;
    fn();
    this._tag = null;
    this.tagRanges[tag] = [start, this.blocks.length];
  }

  add(x, y, z, hx, hy, hz, mat, ry = 0) {
    if (hx <= 0.01 || hy <= 0.01 || hz <= 0.01) return;
    // An opening is simply masonry that was never laid.
    if (this._omit && this._omit(x, y, z)) return;
    this.blocks.push({ x, y, z, hx, hy, hz, ry, mat, tag: this._tag || null });
  }

  /**
   * Run `fn` with an opening predicate in force: any stone whose centre
   * satisfies `pred` is skipped.
   *
   * This is how doors, windows and the Taj's great iwans get cut. Doing it by
   * omission rather than by carving afterwards means the support graph is
   * correct from the start — the wall genuinely spans the opening through the
   * arch above it, and shooting out that arch genuinely drops the wall over it.
   */
  openings(pred, fn) {
    const prev = this._omit;
    this._omit = prev ? (x, y, z) => prev(x, y, z) || pred(x, y, z) : pred;
    try { fn(); } finally { this._omit = prev; }
  }

  /**
   * One course of a hollow rectangular tower: four bonded walls of thickness
   * `wall`, outer footprint `w` x `d`, centred on (cx, cz).
   *
   * `relief(x, z)` is how a wall gets its ornament. It returns how far a stone
   * at that point stands proud of the face, in metres, and the stone is laid
   * that much thicker and shifted outward by half of it — so a string course,
   * a pilaster, a window surround or a corbelled cornice is still a stone
   * standing squarely on the course beneath it, and the solver never sees
   * anything it has to think about. Ornament hung on the outside of a wall as
   * separate blocks has nothing under it and falls off on the first frame.
   */
  ring(cx, cz, w, d, wall, y, courseH, stone, mat, bondOffset = 0, relief = null) {
    const hw = w / 2, hd = d / 2;
    const halfH = courseH / 2;
    const yc = y + halfH;

    // Two walls run between the other two, and which pair runs through swaps
    // every course, so corners interlock instead of butting.
    //
    // Both pairs used to run the full length on even courses, so every even
    // course laid its four corners twice: two stones sharing the same cubic
    // metre with their outer faces on exactly the same plane. On screen that
    // is a corner that flickers between two tints as the depth test changes
    // its mind, on every ring-built structure in the game; in the physics it
    // is two bodies interpenetrating.
    const alongX = (zCentre, zHalf, out, xFrom, xTo) => {
      const span = xTo - xFrom;
      if (span <= 0.02) return;
      const n = Math.max(1, Math.round(span / stone));
      const len = span / n;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = xFrom + t * span;
        const e = relief ? Math.max(0, relief(x, zCentre + out * zHalf)) : 0;
        this.add(x, yc, zCentre + out * e / 2, this.shrink(len / 2), this.shrink(halfH), zHalf + e / 2, mat);
      }
    };
    const alongZ = (xCentre, xHalf, out, zFrom, zTo) => {
      const span = zTo - zFrom;
      if (span <= 0.02) return;
      const n = Math.max(1, Math.round(span / stone));
      const len = span / n;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const z = zFrom + t * span;
        const e = relief ? Math.max(0, relief(xCentre + out * xHalf, z)) : 0;
        this.add(xCentre + out * e / 2, yc, z, xHalf + e / 2, this.shrink(halfH), this.shrink(len / 2), mat);
      }
    };

    const halfWall = wall / 2;
    if (bondOffset) {
      alongX(cz - hd + halfWall, halfWall, -1, cx - hw, cx + hw);
      alongX(cz + hd - halfWall, halfWall, 1, cx - hw, cx + hw);
      alongZ(cx - hw + halfWall, halfWall, -1, cz - hd + wall, cz + hd - wall);
      alongZ(cx + hw - halfWall, halfWall, 1, cz - hd + wall, cz + hd - wall);
    } else {
      alongZ(cx - hw + halfWall, halfWall, -1, cz - hd, cz + hd);
      alongZ(cx + hw - halfWall, halfWall, 1, cz - hd, cz + hd);
      alongX(cz - hd + halfWall, halfWall, -1, cx - hw + wall, cx + hw - wall);
      alongX(cz + hd - halfWall, halfWall, 1, cx - hw + wall, cx + hw - wall);
    }
  }

  /**
   * The volume an `arch` will occupy, as an opening predicate.
   *
   * An arch is laid *into* a wall, not onto one: the masonry has to be left
   * out where the ring and the opening under its crown will be, and then the
   * voussoirs fill the gap. Laid over an uncut wall — which is what the Taj's
   * iwans and the chamber doorways did — every voussoir shares its volume with
   * the stones already there, the ring is buried, and the faces that do show
   * fight the wall's for the same pixels.
   */
  static archVoid(cx, cy, cz, span, thickness, depth, axis = 'x', margin = 0.12) {
    const rOut = span / 2 + thickness + margin;
    const hd = depth / 2 + margin;
    return (x, y, z) => {
      if (y < cy - 0.05) return false;
      const along = axis === 'x' ? x - cx : z - cz;
      const perp = axis === 'x' ? z - cz : x - cx;
      if (Math.abs(perp) > hd) return false;
      return Math.hypot(along, y - cy) < rOut;
    };
  }

  /** A stack of bonded ring courses between two heights. */
  tower(cx, cz, y0, y1, wOf, wallOf, courseH, stone, matOf) {
    let y = y0;
    let course = 0;
    while (y < y1 - 0.001) {
      const h = Math.min(courseH, y1 - y);
      const t = (y - y0) / Math.max(y1 - y0, 0.001);
      const w = wOf(t, y);
      const wall = wallOf(t, y);
      const mat = matOf(t, y, course);
      this.ring(cx, cz, w, w, wall, y, h, stone, mat, course % 2);
      y += h;
      course++;
    }
    return course;
  }

  /** Solid slab, split into a grid of stones. */
  slab(cx, cy, cz, w, h, d, stone, mat) {
    const nx = Math.max(1, Math.round(w / stone));
    const ny = Math.max(1, Math.round(h / stone));
    const nz = Math.max(1, Math.round(d / stone));
    const sx = w / nx, sy = h / ny, sz = d / nz;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          this.add(
            cx - w / 2 + (i + 0.5) * sx,
            cy - h / 2 + (j + 0.5) * sy,
            cz - d / 2 + (k + 0.5) * sz,
            this.shrink(sx / 2), this.shrink(sy / 2), this.shrink(sz / 2), mat,
          );
        }
      }
    }
  }

  /**
   * A semicircular arch of wedge blocks over an opening. Voussoirs are
   * approximated as rotated boxes — close enough that the arch genuinely
   * carries load through compression and genuinely drops when you shoot the
   * keystone out.
   */
  arch(cx, cy, cz, span, depth, thickness, count, mat, axis = 'x') {
    const r = span / 2;
    for (let i = 0; i < count; i++) {
      const a0 = Math.PI * (i / count);
      const a1 = Math.PI * ((i + 1) / count);
      const am = (a0 + a1) / 2;
      const rc = r + thickness / 2;
      const bx = Math.cos(am) * rc;
      const by = Math.sin(am) * rc;
      const segLen = (Math.PI * rc) / count;
      // Neighbouring voussoirs overlap a little where the ring curves, and
      // their faces would then share a plane. Alternate ones are laid a
      // hand's width smaller all round, so no face of one is on a face of
      // the next — which is what a rusticated ring looks like anyway.
      const ins = (i % 2) * 0.07;
      if (axis === 'x') {
        this.add(cx + bx, cy + by, cz, this.shrink(segLen / 2) - ins, this.shrink(thickness / 2) - ins, depth / 2 - ins, mat, 0);
      } else {
        this.add(cx, cy + by, cz + bx, depth / 2 - ins, this.shrink(thickness / 2) - ins, this.shrink(segLen / 2) - ins, mat, 0);
      }
    }
  }

  /** Hollow tapering spire built from bonded courses. */
  spire(cx, cz, y0, y1, baseW, topW, courseH, stone, mat, wallFrac = 0.42, relief = null) {
    let y = y0;
    let course = 0;
    while (y < y1 - 0.001) {
      const h = Math.min(courseH, y1 - y);
      const t = (y - y0) / (y1 - y0);
      // Slightly concave taper reads much more like a real gothic spire than
      // a straight cone.
      const w = baseW + (topW - baseW) * Math.pow(t, 0.86);
      const wall = Math.max(stone * 0.55, w * wallFrac * (1 - t * 0.35));
      if (w <= wall * 2.1) {
        this.slab(cx, y + h / 2, cz, w, h, w, stone, mat);
      } else {
        this.ring(cx, cz, w, w, wall, y, h, stone, mat, course % 2,
          relief ? (x, z) => relief(x, z, y, course) : null);
      }
      y += h;
      course++;
    }
  }

  /** Corner turret / pinnacle. */
  pinnacle(cx, cz, y0, height, baseW, stone, mat) {
    const courses = Math.max(2, Math.round(height / (stone * 1.1)));
    const ch = height / courses;
    for (let i = 0; i < courses; i++) {
      const t = i / courses;
      const w = baseW * (1 - t * 0.82);
      this.slab(cx, y0 + (i + 0.5) * ch, cz, w, ch, w, stone, mat);
    }
  }

  /**
   * A course laid along an arbitrary closed outline.
   *
   * Blocks are yawed to follow each edge, so this builds any plan shape — the
   * Taj's chamfered octagon, a circular drum, and eventually a real
   * OpenStreetMap footprint — from one primitive. `pts` are [x, z] offsets from
   * (cx, cz), walked as a closed loop.
   */
  polyRing(cx, cz, pts, wall, y, courseH, stone, mat, phase = 0, relief = null) {
    const halfH = courseH / 2;
    const yc = y + halfH;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;

      const count = Math.max(1, Math.round(len / stone));
      const seg = len / count;
      // Local +z runs along the edge, local +x is the wall thickness.
      const ry = Math.atan2(dx, dz);
      // Which way is out: the edge normal that points away from the centre.
      // Relief is laid along it, the same way `ring` does — see there.
      let nx = dz / len, nz = -dx / len;
      const mx = a[0] + dx / 2, mz = a[1] + dz / 2;
      if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }

      // Only stagger when the edge actually holds more than one stone. With a
      // single stone the half-segment shift pushes it past the end of the edge
      // and it is dropped — which silently emptied every odd course of every
      // curved wall, because a circle approximated finely enough has exactly
      // one stone per edge. Rings alternated solid and absent, and anything
      // standing on them believed it was floating.
      const stagger = count > 1 && phase ? 0.5 : 0;

      for (let k = 0; k < count; k++) {
        const t = (k + 0.5 + stagger) / count;
        if (t >= 1.0) continue;
        const sx = cx + a[0] + dx * t, sz = cz + a[1] + dz * t;
        const e = relief ? Math.max(0, relief(sx + nx * wall / 2, sz + nz * wall / 2)) : 0;
        this.add(
          sx + nx * e / 2, yc, sz + nz * e / 2,
          this.shrink(wall / 2) + e / 2, this.shrink(halfH), this.shrink(seg / 2), mat, ry,
        );
      }
    }
  }

  /**
   * Regular polygon outline, for drums and towers of revolution.
   * `rot` turns the whole ring, which is how consecutive courses of a curved
   * wall get their bond — rotating the outline can't drop stones the way
   * shifting them along an edge can.
   */
  static circle(radius, sides, rot = 0) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + rot;
      pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
    return pts;
  }

  /** A cylindrical drum: stacked circular courses. */
  drum(cx, cz, y0, y1, radius, wall, courseH, stone, mat) {
    let y = y0;
    let course = 0;
    while (y < y1 - 0.001) {
      const h = Math.min(courseH, y1 - y);
      const sides = Math.max(12, Math.round((2 * Math.PI * radius) / stone));
      const rot = (course % 2) * (Math.PI / sides);
      this.polyRing(cx, cz, BlockList.circle(radius, sides, rot), wall, y, h, stone, mat);
      y += h;
      course++;
    }
  }

  /**
   * An onion dome, laid as horizontal rings of voussoirs.
   *
   * This is a genuinely different structure from a tower and the solver treats
   * it as one. Load runs down the shell into the drum and then into the piers,
   * so the interesting failure is not the dome being hit — it is the drum
   * losing enough bearing that the whole shell drops as one piece.
   *
   * `profile(t)` returns radius as a fraction of `maxR` at height fraction t.
   */
  dome(cx, cz, y0, height, maxR, wall, courseH, stone, mat, profile) {
    let y = y0;
    let course = 0;
    while (y < y0 + height - 0.001) {
      const h = Math.min(courseH, y0 + height - y);
      const t = (y + h / 2 - y0) / height;
      const r = maxR * profile(t);

      if (r <= wall * 1.15) {
        // Near the apex the ring closes up; lay it solid.
        const w = Math.max(r * 2, stone * 0.7);
        this.slab(cx, y + h / 2, cz, w, h, w, stone, mat);
      } else {
        const sides = Math.max(10, Math.round((2 * Math.PI * r) / stone));
        const rot = (course % 2) * (Math.PI / sides);
        this.polyRing(cx, cz, BlockList.circle(r, sides, rot), wall, y, h, stone, mat);
      }
      y += h;
      course++;
    }
  }

  /** Rotated copy of a generator, used for symmetric wings. */
  mirrored(fn) {
    fn(1, 1); fn(-1, 1); fn(1, -1); fn(-1, -1);
  }
}
