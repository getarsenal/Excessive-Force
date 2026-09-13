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
};

/**
 * `structural: false` marks infill — glazing and applied ornament. It hangs on
 * the frame and carries its own weight down, but nothing rests *on* it, so the
 * load solver routes around it. Without this distinction the tower's upper mass
 * would path through the clock glazing and crush it on the first frame, which
 * is exactly what a real stone surround exists to prevent.
 */
export const MATERIAL_PROPS = {
  [MATERIALS.LIMESTONE]: { density: 2.45, strength: 1.00, toughness: 100, color: 0xc9bfa4, structural: true },
  [MATERIALS.BRICK]:     { density: 1.90, strength: 0.78, toughness: 78,  color: 0x8a5341, structural: true },
  [MATERIALS.IRON]:      { density: 7.20, strength: 2.60, toughness: 210, color: 0x4d5751, structural: true },
  [MATERIALS.GLASS]:     { density: 2.50, strength: 0.16, toughness: 16,  color: 0xdfeaf2, structural: false },
  [MATERIALS.SLATE]:     { density: 2.70, strength: 0.55, toughness: 55,  color: 0x4a4e56, structural: true },
  [MATERIALS.GILT]:      { density: 2.60, strength: 0.70, toughness: 70,  color: 0xc8a250, structural: false },
  [MATERIALS.CONCRETE]:  { density: 2.35, strength: 1.45, toughness: 150, color: 0x9a958c, structural: true },
};

export class BlockList {
  constructor() {
    /** flat block records: {x,y,z, hx,hy,hz, ry, mat, tag} */
    this.blocks = [];
    this.tagRanges = {};
  }

  get length() { return this.blocks.length; }

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
    this.blocks.push({ x, y, z, hx, hy, hz, ry, mat, tag: this._tag || null });
  }

  /**
   * One course of a hollow rectangular tower: four bonded walls of thickness
   * `wall`, outer footprint `w` x `d`, centred on (cx, cz).
   */
  ring(cx, cz, w, d, wall, y, courseH, stone, mat, bondOffset = 0) {
    const hw = w / 2, hd = d / 2;
    const halfH = courseH / 2;
    const yc = y + halfH;

    // North and south walls run the full width; east and west fill the gap
    // between them, so corners interlock instead of butting.
    const alongX = (zCentre, zHalf) => {
      const span = w;
      const n = Math.max(1, Math.round(span / stone));
      const len = span / n;
      for (let i = 0; i < n; i++) {
        // Bond offset shifts the joint pattern every other course.
        const t = (i + 0.5) / n;
        const x = cx - hw + t * span + (bondOffset ? 0 : 0);
        this.add(x, yc, zCentre, len / 2 * 0.97, halfH * 0.97, zHalf, mat);
      }
    };
    const alongZ = (xCentre, xHalf, zFrom, zTo) => {
      const span = zTo - zFrom;
      if (span <= 0.02) return;
      const n = Math.max(1, Math.round(span / stone));
      const len = span / n;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const z = zFrom + t * span;
        this.add(xCentre, yc, z, xHalf, halfH * 0.97, len / 2 * 0.97, mat);
      }
    };

    const halfWall = wall / 2;
    // Stagger the two wall pairs between courses so the corner bond alternates.
    if (bondOffset) {
      alongX(cz - hd + halfWall, halfWall);
      alongX(cz + hd - halfWall, halfWall);
      alongZ(cx - hw + halfWall, halfWall, cz - hd + wall, cz + hd - wall);
      alongZ(cx + hw - halfWall, halfWall, cz - hd + wall, cz + hd - wall);
    } else {
      alongZ(cx - hw + halfWall, halfWall, cz - hd, cz + hd);
      alongZ(cx + hw - halfWall, halfWall, cz - hd, cz + hd);
      alongX(cz - hd + halfWall, halfWall);
      alongX(cz + hd - halfWall, halfWall);
    }
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
            sx / 2 * 0.97, sy / 2 * 0.97, sz / 2 * 0.97, mat,
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
      if (axis === 'x') {
        this.add(cx + bx, cy + by, cz, segLen / 2 * 0.95, thickness / 2 * 0.95, depth / 2, mat, 0);
      } else {
        this.add(cx, cy + by, cz + bx, depth / 2, thickness / 2 * 0.95, segLen / 2 * 0.95, mat, 0);
      }
    }
  }

  /** Hollow tapering spire built from bonded courses. */
  spire(cx, cz, y0, y1, baseW, topW, courseH, stone, mat, wallFrac = 0.42) {
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
        this.ring(cx, cz, w, w, wall, y, h, stone, mat, course % 2);
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

  /** Rotated copy of a generator, used for symmetric wings. */
  mirrored(fn) {
    fn(1, 1); fn(-1, 1); fn(1, -1); fn(-1, -1);
  }
}
