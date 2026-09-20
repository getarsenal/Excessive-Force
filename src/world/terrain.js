import * as THREE from 'three';

/**
 * Real-world terrain.
 *
 * Elevation comes from `tools/bake_terrain.py`, which pulls the public AWS
 * terrain tiles for the level's actual coordinates and writes a 16-bit
 * heightmap (split across the red and green channels — Westminster only spans
 * about 28 m of relief, and 8-bit quantises into visible terraces).
 *
 * The same grid feeds Rapier as a heightfield collider, so shells landing short
 * hit the ground the player is actually looking at.
 */

export class Terrain {
  constructor(meta, heightData, maskData, quality, farData = null) {
    this.meta = meta;
    this.size = meta.size;
    this.span = meta.spanMeters;
    this.quality = quality;

    const n = this.size;
    this.heights = new Float32Array(n * n);
    const range = meta.maxElevation - meta.minElevation;
    for (let i = 0; i < n * n; i++) {
      const hi = heightData[i * 4];
      const lo = heightData[i * 4 + 1];
      this.heights[i] = meta.minElevation + ((hi * 256 + lo) / 65535) * range;
    }

    this.mask = new Float32Array(n * n * 3);
    for (let i = 0; i < n * n; i++) {
      this.mask[i * 3] = maskData[i * 4] / 255;
      this.mask[i * 3 + 1] = maskData[i * 4 + 1] / 255;
      this.mask[i * 3 + 2] = maskData[i * 4 + 2] / 255;
    }

    // The distant coastline, if this level was baked with one.
    //
    // One byte a pixel over a square seven times the playfield: forty metres to
    // the sample, which is a coarse thing to ask a shoreline to be and exactly
    // right for one nobody gets within a kilometre of. What it buys is the
    // difference between Rio de Janeiro and a hill in a field — the Lagoa,
    // Botafogo Bay and the Atlantic are all two to four kilometres from the
    // Corcovado, all of them in view from the statue's feet, and none of them
    // was anywhere in the data the level loaded.
    this.farSpan = meta.farSpan || 0;
    this.farMask = null;
    if (farData && this.farSpan) {
      const fn = Math.round(Math.sqrt(farData.length / 4));
      this.farSize = fn;
      this.farMask = new Uint8Array(fn * fn);
      for (let i = 0; i < fn * fn; i++) this.farMask[i] = farData[i * 4] > 127 ? 1 : 0;
    }

    this.cellSize = (this.span * 2) / (n - 1);
    this._relax();
    this.waterLevel = this._computeWaterLevel();
    this.openSea = this._computeOpenSea();
    this._repairRiver();
    this.mesh = null;
    this.collider = null;
  }

  /**
   * Take the stair-steps out of the elevation data.
   *
   * The source DEM quantises to a metre and its tiles are about ten metres to
   * the pixel, upsampled here to three and a half. What arrives is therefore
   * not a smooth landscape but a flight of one-metre terraces, and on ground
   * with twenty-eight metres of relief across the whole map those terraces are
   * most of the shading: the ground read as a contour model rather than as
   * land.
   *
   * Two passes of a 3x3 binomial blur, weighted so it cannot drift the overall
   * elevation. Wet cells are held back from the blur — the river channel was
   * deliberately carved with a sharp shoulder, and smoothing across it fills
   * the channel in and lifts the bed towards the bank.
   */
  _relax() {
    const n = this.size;
    const h = this.heights;
    const m = this.mask;
    const tmp = new Float32Array(n * n);
    for (let pass = 0; pass < 2; pass++) {
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          const i = z * n + x;
          if (m[i * 3] > 0.5) { tmp[i] = h[i]; continue; }
          let sum = 0, wsum = 0;
          for (let dz = -1; dz <= 1; dz++) {
            const zz = z + dz;
            if (zz < 0 || zz >= n) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= n) continue;
              const j = zz * n + xx;
              // Never pull the bed of the river up into the bank.
              if (m[j * 3] > 0.5) continue;
              const w = (dx === 0 ? 2 : 1) * (dz === 0 ? 2 : 1);
              sum += h[j] * w; wsum += w;
            }
          }
          tmp[i] = wsum > 0 ? sum / wsum : h[i];
        }
      }
      h.set(tmp);
    }
  }

  _computeWaterLevel() {
    // A surveyed coastline brings its own answer, measured at the shoreline
    // rather than guessed from the deepest point on the map. The guess below
    // is right for a channel carved to a known depth and wrong for a harbour:
    // Sydney's deepest sample is nine metres down, and five metres above that
    // is three metres below the quay — the tide out across the whole map.
    if (this.meta && typeof this.meta.waterSurface === 'number') {
      return this.meta.waterSurface;
    }
    // The river bed was carved to a known depth; put the surface a little above
    // the deepest carved point so the banks read correctly.
    let minWet = Infinity;
    const n = this.size;
    for (let i = 0; i < n * n; i++) {
      if (this.mask[i * 3] > 0.5) minWet = Math.min(minWet, this.heights[i]);
    }
    if (!isFinite(minWet)) return this.meta.minElevation;
    return minWet + 5.4;
  }

  /**
   * Level the ground a landmark stands on, to the height of the ring just
   * outside its footprint.
   *
   * A structure is founded at one sampled height — `terrain.heightAt` at its
   * origin — and then built as though the world were flat under all of it.
   * That is fine for a clock tower and wrong for a plinth ninety-five metres
   * square: the Taj's terrace was founded on the height at its centre and the
   * ground rose two metres across it, so a third of the plinth was underground
   * and the mausoleum looked half sunk.
   *
   * Levelling to the surrounding median rather than to the centre sample means
   * the terrace matches the ground it is cut into, and the feather blends it
   * out so the result reads as a terrace rather than as a plug. Wet cells are
   * left alone, or a landmark on a bank would dam its own river.
   */
  levelPad(cx, cz, radius, feather = 30, opts = {}) {
    const n = this.size, h = this.heights, span = this.span, c = this.cellSize;
    const uOf = (x) => (x + span) / (span * 2) * (n - 1);
    const vOf = (z) => (span - z) / (span * 2) * (n - 1);
    const rOut = radius + feather;
    const i0 = Math.max(0, Math.floor(uOf(cx - rOut)));
    const i1 = Math.min(n - 1, Math.ceil(uOf(cx + rOut)));
    const j0 = Math.max(0, Math.floor(vOf(cz + rOut)));
    const j1 = Math.min(n - 1, Math.ceil(vOf(cz - rOut)));

    const ring = [];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-span + i * c - cx, span - j * c - cz);
        if (d > radius && d < rOut) ring.push(h[j * n + i]);
      }
    }
    if (!ring.length) return null;
    ring.sort((a, b) => a - b);
    const level = ring[ring.length >> 1];

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * n + i;
        if (this.mask[idx * 3] > 0.5) continue;
        const d = Math.hypot(-span + i * c - cx, span - j * c - cz);
        if (d >= rOut) continue;
        const t = d <= radius ? 1 : 1 - (d - radius) / feather;
        const k = t * t * (3 - 2 * t);
        h[idx] += (level - h[idx]) * k;
        // Grass over the pad. Without it the levelled disc drew in the bare
        // paving colour and read as a plate the monument had been set on.
        //
        // With a ragged edge, not the levelling's own smooth ramp: the ramp
        // faded the grass out over forty metres and drew a blurred green
        // disc, which is not what a lawn's edge looks like from the air. The
        // grass runs full to just past the pad and then breaks up on a noise
        // over a few metres, so the boundary wanders and has corners.
        if (opts.park) {
          const x = -span + i * c, z = span - j * c;
          const wob = (valueNoise(x * 0.045 + 3.1, z * 0.045 - 7.7) - 0.5) * 0.5;
          const e = d <= radius ? 0 : (d - radius) / feather;
          const kp = 1 - THREE.MathUtils.smoothstep(e, 0.22 + wob, 0.42 + wob);
          this.mask[idx * 3 + 2] = Math.max(this.mask[idx * 3 + 2], kp);
        }
      }
    }
    return level;
  }

  /** Separable box blur over the DEM grid, by prefix sums. */
  _blur(src, r) {
    const n = this.size;
    const tmp = new Float32Array(n * n);
    const pre = new Float64Array(n + 1);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) pre[x + 1] = pre[x] + src[y * n + x];
      for (let x = 0; x < n; x++) {
        const lo = Math.max(0, x - r), hi = Math.min(n, x + r + 1);
        tmp[y * n + x] = (pre[hi] - pre[lo]) / (hi - lo);
      }
    }
    const out = new Float32Array(n * n);
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) pre[y + 1] = pre[y] + tmp[y * n + x];
      for (let y = 0; y < n; y++) {
        const lo = Math.max(0, y - r), hi = Math.min(n, y + r + 1);
        out[y * n + x] = (pre[hi] - pre[lo]) / (hi - lo);
      }
    }
    return out;
  }

  /**
   * Put the river where the ground says it is, and cut it in.
   *
   * Two separate things were wrong, and they had the same symptom. The river's
   * course is hand-drawn in `tools/bake_terrain.py` as a polyline, and the one
   * for Paris runs across the Trocadéro — sixty metres up a hillside, while
   * the actual Seine valley sits plainly visible in the same DEM a quarter of
   * the map away. And the carve is a flat seven metres off the centreline,
   * which is plenty for the Thames (Tilezen fills it to a shoreline barely
   * above sea level) and nothing at all for a river at forty metres or a
   * hundred and fifty. Between them, eighty-nine per cent of the Paris "river"
   * was dry ground: the Seine drew as a strip of park with a puddle in the
   * corner of the map, which is what the player saw and reported. Agra had it
   * too, less obviously.
   *
   * The DEM knows better than the polyline does. Tilezen fills water bodies
   * flat at their shoreline, so a river is a broad plateau at the bottom of
   * the map's elevation range — here, anything within a metre and a half of
   * the fifth percentile. Closing that selection (dilate, then erode) bridges
   * the gaps a levelled building pad punches through it, and the baked mask is
   * kept only where it happens to agree, which is what carries the Yamuna out
   * to the eastern edge after it has bent away from the real channel.
   *
   * A map whose DEM already carries its channel is left exactly alone — the
   * test is whether the baked mask is mostly under water already, and
   * Westminster's is.
   */
  _repairRiver() {
    // Nothing to repair when the coastline came off a survey: the mask is the
    // real shoreline and the heightmap was dredged to agree with it.
    if (this.meta && this.meta.coastline === 'surveyed') return;
    const n = this.size, N = n * n;
    const h = this.heights, mask = this.mask;

    let full = 0, under = 0;
    for (let i = 0; i < N; i++) {
      if (mask[i * 3] > 0.9) { full++; if (h[i] < this.waterLevel) under++; }
    }
    if (!full || under / full > 0.6) return;

    const sorted = Float32Array.from(h).sort();
    const low = sorted[Math.floor(N * 0.05)];

    const wet = new Float32Array(N);
    for (let i = 0; i < N; i++) wet[i] = h[i] <= low + 1.5 ? 1 : 0;
    // Close: 34 cells is about 120 m, which bridges a levelled pad without
    // swallowing the banks.
    let b = this._blur(wet, 34);
    for (let i = 0; i < N; i++) wet[i] = b[i] > 0.08 ? 1 : 0;
    b = this._blur(wet, 34);
    for (let i = 0; i < N; i++) wet[i] = b[i] > 0.86 ? 1 : 0;
    // Keep the baked course where it runs over low ground too.
    for (let i = 0; i < N; i++) {
      if (wet[i] < 0.5 && mask[i * 3] > 0.5 && h[i] <= low + 8.0) wet[i] = 1;
    }

    const soft = this._blur(wet, 4);        // a shoreline, not a cliff edge
    const level = low + 1.0;
    for (let i = 0; i < N; i++) {
      const u = Math.max(0, Math.min(1, (soft[i] - 0.05) / 0.85));
      const k = u * u * (3 - 2 * u);
      mask[i * 3] = soft[i];
      mask[i * 3 + 2] *= 1 - soft[i];       // no parkland in the river
      if (k <= 0.001) continue;
      const bed = level - 0.9 - 4.6 * k;
      if (h[i] > bed) h[i] += (bed - h[i]) * k;
    }
    this.waterLevel = level;
  }

  /**
   * Ground height at world (x, z). Metres, world units.
   *
   * Smooth-bilinear rather than plain bilinear: the cell fractions are put
   * through a smoothstep first. Straight bilinear is continuous but its
   * *slope* is not — it changes abruptly at every cell boundary — so the
   * ground picks up a crease along each of the 512 grid lines, and the
   * terrain mesh reads as a sheet of folded paper wherever the sun rakes
   * across it. Easing the fractions costs two multiplies and a subtract per
   * axis and makes the surface smooth in the derivative, which is what the
   * eye is actually judging.
   */
  heightAt(x, z) {
    const n = this.size;
    // Clamped, so sampling past the DEM extends the border height outward
    // rather than dropping to sea level — otherwise the world beyond the
    // playfield floods and the river plane becomes an ocean.
    const u = THREE.MathUtils.clamp((x + this.span) / (this.span * 2) * (n - 1), 0, n - 1);
    // +north maps to decreasing row, matching how the bake wrote it.
    const v = THREE.MathUtils.clamp((this.span - z) / (this.span * 2) * (n - 1), 0, n - 1);
    const x0 = Math.floor(u), z0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, n - 1), z1 = Math.min(z0 + 1, n - 1);
    // Linear, not eased. The rendered mesh and the physics heightfield are
    // both linear over the same grid, and the eased curve this used to take
    // between vertices put everything laid on the ground — a road at
    // heightAt() plus twenty centimetres, a lawn at ten — up to a quarter of
    // the cell's rise away from the surface actually drawn, sinking into it
    // on one slope and floating over it on the next.
    const fx = u - x0, fz = v - z0;
    const h = this.heights;
    const a = h[z0 * n + x0], b = h[z0 * n + x1];
    const c = h[z1 * n + x0], d = h[z1 * n + x1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  /**
   * Is the country beyond the map sea rather than more country?
   *
   * Measured at the boundary: a river leaves through a gap in the edge, a
   * harbour *is* the edge. Sydney is wet across a third of its boundary and
   * the river machinery drew that as three channels running off into farmland,
   * which is what the edge of Sydney Harbour is not.
   */
  _computeOpenSea() {
    const n = this.size;
    let wet = 0, total = 0;
    for (let i = 0; i < n; i++) {
      for (const idx of [i, (n - 1) * n + i, i * n, i * n + (n - 1)]) {
        total++;
        if (this.mask[idx * 3] > 0.5) wet++;
      }
    }
    return total > 0 && wet / total > 0.25;
  }

  /**
   * The height of the ground anywhere, including past the edge of the DEM.
   *
   * `heightAt` clamps, which extends the border height outward forever — and
   * the surround was drawn as one flat frame at a single sample of that
   * border. On a map with no relief at its edge the two agree and nobody ever
   * noticed. On the Corcovado they disagree by three hundred metres: the
   * frame sat at the height of the eastern edge and every tree placed out
   * there sat at the height of the *nearest* edge, so two thousand of them
   * hung in the air over the haze with nothing underneath.
   *
   * So there is one function for it, the surround is drawn from it, and
   * anything placed out there stands on it. Past the map the relief keeps
   * going and then settles toward a distant base — which is what distance
   * looks like — and where the boundary is under water it stays under water.
   */
  surfaceAt(x, z) {
    const s = this.span;
    const out = Math.max(Math.abs(x) - s, Math.abs(z) - s);
    const h = this.heightAt(x, z);
    if (out <= 0) return h;
    const t = Math.min(1, out / (s * 1.35));
    // Not down to one level: two thirds of the way to a distant base, so the
    // large-scale shape of the map's own edge is still there a long way out.
    const base = Math.min(h, this.waterLevel + 14);
    const fall = h + (base - h) * (t * t * (3 - 2 * t)) * 0.68;
    // And hills, because the alternative is a table.
    //
    // Scaled by how much relief the map itself has, so a river city's surround
    // stays as flat as the city is and a mountain's does not: the Corcovado is
    // one peak of a range and the country round it was coming out as a desert
    // pavement running to the fog.
    if (this._farAmp === undefined) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < this.heights.length; i += 7) {
        const v = this.heights[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      this._farAmp = Math.max(3, Math.min(95, (hi - lo) * 0.11));
    }
    const ridge = valueNoise(x * 0.00062 + 11.3, z * 0.00062 - 4.7) * 2 - 1;
    const grain = valueNoise(x * 0.0021 - 3.1, z * 0.0021 + 8.9) * 2 - 1;
    const hill = (ridge * 0.72 + grain * 0.28) * this._farAmp;
    const land = fall + hill * Math.min(1, out / (s * 0.45));

    // The surveyed coastline out here, where there is one.
    //
    // Taken before the open-sea guess below and in preference to it, because it
    // is the real answer and that is an inference from how wet the boundary
    // happens to be. Sunk rather than switched: the far mask is forty metres to
    // the sample, so a hard step at its edge would draw every distant shore as
    // a cliff. Nine samples over a hundred and twenty metres give a shelf.
    if (this.farMask) {
      let wetn = 0;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          if (this._farWet(x + a * 60, z + b * 60)) wetn++;
        }
      }
      if (wetn) {
        const k = wetn / 9;
        const bed = this.waterLevel - 11;
        // Only ever downward. Inland of the shore the country keeps its own
        // relief; over the water it is a bed.
        return Math.min(land, land + (bed - land) * k);
      }
    }
    if (!this.openSea) return land;

    // And the sea, where the map's boundary is under water.
    //
    // How wet the boundary is where this point leaves the map, smoothed along
    // it: a single sample turns every wet run into a ribbon of sea through
    // farmland, which is three rivers and not a harbour. Blended rather than
    // switched, so the shore shelves into the water instead of leaving a
    // rectangular plate of fields hanging over it. And the further out, the
    // more of it is water — go far enough from a harbour in any direction and
    // you are at sea, which is true enough and is the only way the horizon
    // reads as a coast rather than as a county.
    const cx = Math.max(-s, Math.min(s, x));
    const cz = Math.max(-s, Math.min(s, z));
    const along = Math.abs(x) - s > Math.abs(z) - s ? 'z' : 'x';
    let wet = 0;
    for (let k = -3; k <= 3; k++) {
      const o = k * 95;
      const px = along === 'x' ? Math.max(-s, Math.min(s, cx + o)) : cx;
      const pz = along === 'z' ? Math.max(-s, Math.min(s, cz + o)) : cz;
      if (this._maskWet(px, pz)) wet++;
    }
    const open = Math.min(1, out / (s * 2.4));
    const k2 = THREE.MathUtils.smoothstep(wet / 7 + open * 0.55, 0.36, 0.64);
    return land + ((this.waterLevel - 9) - land) * k2;
  }

  /**
   * Mask lookup: water / road / park coverage at world (x, z).
   *
   * Bilinear, not nearest. The mask is one sample every 3.5 m, and taking the
   * nearest one draws every park and road as a staircase of hard-edged
   * rectangles — which is exactly what the ground used to look like from the
   * opening camera position.
   */
  maskAt(x, z) {
    const n = this.size;
    const u = THREE.MathUtils.clamp((x + this.span) / (this.span * 2) * (n - 1), 0, n - 1);
    const v = THREE.MathUtils.clamp((this.span - z) / (this.span * 2) * (n - 1), 0, n - 1);
    const x0 = Math.floor(u), z0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, n - 1), z1 = Math.min(z0 + 1, n - 1);
    const fx = u - x0, fz = v - z0;
    const m = this.mask;
    const at = (xi, zi, ch) => m[(zi * n + xi) * 3 + ch];
    const lerp2 = (ch) =>
      (at(x0, z0, ch) * (1 - fx) + at(x1, z0, ch) * fx) * (1 - fz)
      + (at(x0, z1, ch) * (1 - fx) + at(x1, z1, ch) * fx) * fz;
    return { water: lerp2(0), road: lerp2(1), park: lerp2(2) };
  }

  /**
   * Is this point sea, lake or river, according to the survey of the country
   * beyond the map? False when the level carries no far mask.
   */
  _farWet(x, z) {
    if (!this.farMask) return false;
    const n = this.farSize, s = this.farSpan;
    const u = Math.round((x + s) / (s * 2) * (n - 1));
    const v = Math.round((s - z) / (s * 2) * (n - 1));
    if (u < 0 || v < 0 || u > n - 1 || v > n - 1) return false;
    return this.farMask[v * n + u] === 1;
  }

  /** The wet mask, and nothing else: false everywhere off the DEM. */
  _maskWet(x, z) {
    const n = this.size;
    const u = Math.round((x + this.span) / (this.span * 2) * (n - 1));
    const v = Math.round((this.span - z) / (this.span * 2) * (n - 1));
    if (u < 0 || v < 0 || u > n - 1 || v > n - 1) return false;
    return this.mask[(v * n + u) * 3] > 0.5;
  }

  isWater(x, z) {
    // Past the DEM there is no mask, but there is still a river: the channel
    // carved out to the horizon is water as far as anything that asks is
    // concerned, or the farms and the airfield get built in it.
    if (Math.abs(x) > this.span || Math.abs(z) > this.span) {
      // Past the map a river is a channel and a harbour is everything. Asking
      // only about the channel let the outskirts lay farmland, hedges and a
      // railway embankment across Sydney Harbour, because as far as this
      // function was concerned the open sea beyond the boundary was dry.
      if (this._farWet(x, z)) return true;
      if (this.openSea) return this.surfaceAt(x, z) < this.waterLevel - 0.5;
      return this.inRiverTail(x, z, 30);
    }
    return this._maskWet(x, z);
  }

  /** Is this point in (or within `pad` of) the channel beyond the playfield? */
  inRiverTail(x, z, pad = 0) {
    for (const pts of this.riverTails()) {
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const l2 = vx * vx + vz * vz;
        let t = l2 > 0 ? ((x - a.x) * vx + (z - a.z) * vz) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const half = a.half + (b.half - a.half) * t;
        if (Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t)) <= half + pad) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Halve the grid.
   *
   * Weaker devices draw the ground at half resolution, and they used to do
   * that by drawing every other vertex of a grid everything else still
   * measured at full resolution: the roads, the lawns, the physics and the
   * picker all followed the fine surface while the eye saw the coarse one,
   * and where the two disagreed the road sank into the grass. Now the grid
   * itself is halved, once, before anything is built on it, so there is one
   * ground and everything agrees about where it is.
   */
  coarsen() {
    const n = this.size;
    const rn = Math.floor((n - 1) / 2) + 1;
    const span = this.span;
    const heights = new Float32Array(rn * rn);
    const mask = new Float32Array(rn * rn * 3);
    for (let j = 0; j < rn; j++) {
      const z = span - (j / (rn - 1)) * span * 2;
      for (let i = 0; i < rn; i++) {
        const x = -span + (i / (rn - 1)) * span * 2;
        heights[j * rn + i] = this.heightAt(x, z);
        const m = this.maskAt(x, z);
        mask[(j * rn + i) * 3] = m.water;
        mask[(j * rn + i) * 3 + 1] = m.road;
        mask[(j * rn + i) * 3 + 2] = m.park;
      }
    }
    this.size = rn;
    this.heights = heights;
    this.mask = mask;
    this.cellSize = (span * 2) / (rn - 1);
    this._coarse = true;
  }

  /**
   * Open the river mouths.
   *
   * Where the DEM's channel reaches the edge of the map its bed is not
   * reliably under the waterline: the elevation tiles fill a river flat at
   * its shoreline, and along the last hundred metres of the Thames the bed
   * crept above the surface on one side, so a sandbar stood a third of the way
   * across the mouth with the tail's water starting beyond it. From a phone's
   * low angle that was a bar of land across the river. The wet run at each
   * exit is dredged: any wet cell within eighty metres of the edge is put a
   * metre and a half under, feathered inward so the bed does not step.
   */
  _openMouths() {
    const n = this.size, c = this.cellSize, span = this.span;
    const h = this.heights, mask = this.mask;
    const DEPTH = this.waterLevel - 1.6;
    for (const e of this.riverExits()) {
      const reach = e.half + 40;
      for (let j = 0; j < n; j++) {
        const z = span - j * c;
        for (let i = 0; i < n; i++) {
          const x = -span + i * c;
          // Distance out of the map along the exit's normal (negative inside),
          // and distance along the edge from the mouth.
          const ox = x - e.mid.x, oz = z - e.mid.z;
          const out = ox * e.n.x + oz * e.n.z;
          const along = Math.abs(ox * -e.n.z + oz * e.n.x);
          if (out < -80 || along > reach) continue;
          const idx = j * n + i;
          // Within the run's own width everything is river, whatever the mask
          // says — the notch that split Agra's run in two is dry in the mask
          // and was left standing as a sandbar in the middle of the mouth.
          if (along > e.half && mask[idx * 3] < 0.5) continue;
          const k = 1 - THREE.MathUtils.smoothstep(-out, 0, 80);
          if (h[idx] > DEPTH) h[idx] += (DEPTH - h[idx]) * k;
        }
      }
    }
  }

  buildMesh() {
    if (this.quality.name === 'low' && !this._coarse) this.coarsen();
    this._openMouths();
    const n = this.size;
    const rn = n;
    const cell = this.cellSize;

    const geo = new THREE.PlaneGeometry(this.span * 2, this.span * 2, rn - 1, rn - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    /**
     * The palette.
     *
     * The ground used to be four shades of the same grey, which is why the
     * whole level read as a photocopy: with only 28 m of relief over 1.8 km
     * there is almost no shading variation to carry the image, so every bit of
     * the depth in this picture has to come out of colour.
     *
     * So the mask channels are now used for what they are: parkland is really
     * green, roads are really asphalt, the ground between them is warm London
     * brick-dust rather than neutral, and the riverbed runs from silt to a deep
     * cold green. The two noise octaves then break each of those into patches
     * so no region is a single flat field.
     */
    //
     // Value separation matters as much as hue here. Colours of similar
     // brightness average into one field at this scale however different their
     // hue is, so the palette is deliberately spread from near-white paving to
     // near-black asphalt.
    const P = this.palette || (this.palette = {
      urban: new THREE.Color(0xb3ab99),   // pale paving and forecourt
      urbanAlt: new THREE.Color(0x9d927c),
      park: new THREE.Color(0x40682a),    // real grass, deep
      parkAlt: new THREE.Color(0x5f8a37),
      road: new THREE.Color(0x2e3035),    // asphalt, genuinely dark
      bank: new THREE.Color(0xb0a173),    // exposed silt at the waterline
      bed: new THREE.Color(0x2b4239),     // wet riverbed, cold green
      dry: new THREE.Color(0xc2b184),     // sun-bleached ground on high spots
    });
    const tmp = new THREE.Color();
    const tmp2 = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);

      const m = this.maskAt(x, z);

      // Broad districts: which part of town this is.
      const broad = valueNoise(x * 0.0048, z * 0.0048);
      const patch = valueNoise(x * 0.021 + 91.3, z * 0.021 - 17.7);

      tmp.copy(P.urban).lerp(P.urbanAlt, THREE.MathUtils.clamp(broad * 2.2 + 0.5, 0, 1));
      // Squares, gardens and verges outside the mapped parks — but *patches*,
      // not a wash. Thresholded rather than ramped, so green appears as
      // discrete pockets of ground with edges, which is what a city looks like
      // from above. Ramping it instead turns the entire map into one lawn.
      // The edge is a few vertices wide whatever the grid: a threshold that
      // fell within one cell drew every patch as a hard-edged square.
      const soft = Math.min(0.24, 0.10 + cell * 0.018);
      // And they do not happen on the tarmac. Where the bake says hardstanding
      // — a street, a yard, a built parcel — the ground is hardstanding, not a
      // verge with a road drawn over the top of it.
      const green = THREE.MathUtils.smoothstep(patch, 0.20 - soft, 0.20 + soft)
        * 0.62 * (1 - THREE.MathUtils.clamp(m.road * 1.6, 0, 1));
      tmp2.copy(P.park).lerp(P.parkAlt, THREE.MathUtils.clamp(broad * 2.0 + 0.5, 0, 1));
      tmp.lerp(tmp2, Math.max(green * (1 - m.water), m.park * 0.92));

      // Higher, drier ground bleaches out.
      const rel = THREE.MathUtils.clamp(
        (h - this.meta.minElevation) / Math.max(1, this.meta.maxElevation - this.meta.minElevation),
        0, 1,
      );
      tmp.lerp(P.dry, rel * 0.22);

      // Roads, straight from the bake mask — hard edges are exactly what a
      // noise-only ground lacks, and they give the eye something to measure
      // distance against.
      tmp.lerp(P.road, THREE.MathUtils.clamp(m.road * 1.35, 0, 1) * 0.82);

      // Then the water margin, which overrides everything.
      //
      // The foreshore is the part of this that was wrong. Driving it from
      // height alone put the silt in a band of exactly constant width all the
      // way along both banks, so the river met the land on a drawn line — the
      // one edge in the whole frame with no texture in it, and the first thing
      // the eye goes to. A real foreshore is ragged: it is wide where the bank
      // shelves and pinches to nothing where it is steep, and it is strewn
      // with the stuff the tide leaves.
      //
      // So the waterline is perturbed by two octaves of noise along the bank,
      // and the silt band is widened where the ground is shallow. `shelf` is
      // the local gradient, measured by sampling eight metres out: flat ground
      // gets a beach, a steep bank gets a lip.
      const ripple = (valueNoise(x * 0.018 + 5.1, z * 0.018 - 2.3) - 0.5) * 2.4
                   + (valueNoise(x * 0.071 - 8.8, z * 0.071 + 4.4) - 0.5) * 0.9;
      const slope = Math.abs(this.heightAt(x + 8, z) - this.heightAt(x - 8, z))
                  + Math.abs(this.heightAt(x, z + 8) - this.heightAt(x, z - 8));
      const shelf = THREE.MathUtils.clamp(1 - slope / 2.4, 0, 1);
      // Measured in *height* above the waterline, so it has to shrink on flat
      // ground, not grow: a six-metre band on a shelving bank is a hundred
      // metres of beach in plan, and the first cut of this turned both banks
      // of the Thames into the Wash. A steep bank can take a taller band
      // because a tall band there is still only a few metres wide.
      const margin = 1.1 + (1 - shelf) * 2.2;
      const wet = THREE.MathUtils.clamp(
        (this.waterLevel + margin + ripple * 0.5 - h) / (1.4 + (1 - shelf) * 2.0), 0, 1);
      tmp.lerp(P.bank, Math.pow(wet, 1.3) * 0.86);
      tmp.lerp(P.bed, THREE.MathUtils.clamp((this.waterLevel - h) / 2.6, 0, 1) * 0.9);

      // Fine mottling on top of all of it — but no octave finer than the grid
      // can carry. Noise with a three-metre period sampled at vertices seven
      // metres apart is a random value per vertex, and a random value per
      // vertex is a checkerboard. The grain texture supplies the fine detail
      // instead, at every resolution.
      const n = valueNoise(x * 0.055, z * 0.055) * (cell < 4.5 ? 0.22 : 0.16)
              + (cell < 2.2 ? valueNoise(x * 0.34, z * 0.34) * 0.10 : 0.05)
              + broad * 0.16;
      tmp.multiplyScalar(0.80 + n);

      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Vertex colours alone give large flat fields of one tone — the mesh has a
    // vertex every 3.5 m, which is nowhere near enough detail at ground level.
    // A tiled grain map multiplied over them adds the high-frequency break-up,
    // and a matching normal map catches the low sun so the ground has relief
    // instead of reading as painted card.
    const grain = makeGrainTexture(256);
    const grainN = makeGrainNormal(256);
    for (const t of [grain, grainN]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(170, 170);
      t.anisotropy = this.quality.anisotropy;
    }
    // The normal map is doing most of the work that relief would do on a hillier
    // map, so it is pushed hard: at this scale the sun rakes across it and the
    // ground picks up texture instead of reading as painted card.
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: grain,
      normalMap: grainN,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.94,
      metalness: 0.0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = this.quality.shadowMapSize > 0;
    this.mesh.frustumCulled = false;

    // The surround.
    //
    // Everything outside the DEM's 1.8 km square still has to be *something*,
    // and for a long time it was one flat plane of one flat colour, sixteen
    // times the size of the playfield. From the opening camera that plane was
    // most of the screen: whatever the level itself looked like, the picture
    // was a huge featureless field with a small diorama in the middle of it.
    //
    // So it gets the same treatment the playfield does — a subdivided grid,
    // coloured from the same palette and the same noise, so the city reads as
    // continuing past the edge of the data rather than stopping at it. It is
    // still flat, and fog still takes it long before that becomes legible.
    //
    // It is a *frame*, not a plane. A single plane across the whole map sits at
    // one height, and the river is carved five metres below the ground at the
    // DEM's edge — so a full plane laid at the edge height covered the Thames
    // completely, and the river rendered as a strip of dry land. Cutting the
    // playfield out of it means the surround can never overlap anything inside.
    const edge = this.heightAt(this.span, 0);
    // Subdivided far more finely than it needs to be as a flat sheet, because
    // it is no longer flat: the river's channel is cut through it, and a cut
    // with ten divisions across seven kilometres is a staircase.
    const apronGeo = frameGeometry(this.span, this.span * 7, 150);
    const ap = apronGeo.attributes.position;
    // Carve the channel. The apron sits at the DEM's edge height, which is
    // above the waterline — so without this the river simply ran into a wall of
    // ground the moment it left the map.
    //
    // `chan` records how far into the channel each vertex is: 1 on the bed, 0
    // well clear of the bank. The colour pass below needs it to lay silt and
    // riverbed down there, instead of painting the cut with the same fields as
    // everything else — which drew the reach as a bright sandy gash through
    // farmland.
    const chan = new Float32Array(ap.count);
    // Every vertex sits on `surfaceAt`, so the surround continues the relief
    // the map ends on instead of being one flat plate at one sample of it.
    for (let i = 0; i < ap.count; i++) {
      ap.setY(i, this.surfaceAt(ap.getX(i), ap.getZ(i)) - edge);
    }
    ap.needsUpdate = true;
    // A harbour has no channel to carve: the whole of it is already water.
    if (!this.openSea) {
      const tails = this.riverTails();
      const sunk = (this.waterLevel - edge) - 2.6;
      // The apron is ninety thousand vertices and the channel is a few hundred
      // segments; testing every pair is twenty-odd million distance tests at
      // boot. A padded bounding box per tail throws out the ninety per cent of
      // the countryside that is nowhere near the water for the cost of four
      // comparisons.
      const bounds = tails.map((pts) => {
        const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
        let pad = 0;
        for (const p of pts) {
          b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x);
          b.z0 = Math.min(b.z0, p.z); b.z1 = Math.max(b.z1, p.z);
          pad = Math.max(pad, p.half);
        }
        pad += 80;
        b.x0 -= pad; b.x1 += pad; b.z0 -= pad; b.z1 += pad;
        return b;
      });
      for (let i = 0; i < ap.count; i++) {
        const x = ap.getX(i), z = ap.getZ(i);
        let best = Infinity, half = 0;
        for (let ti = 0; ti < tails.length; ti++) {
          const b0 = bounds[ti];
          if (x < b0.x0 || x > b0.x1 || z < b0.z0 || z > b0.z1) continue;
          const pts = tails[ti];
          for (let k = 0; k < pts.length - 1; k++) {
            const a = pts[k], b = pts[k + 1];
            const vx = b.x - a.x, vz = b.z - a.z;
            const l2 = vx * vx + vz * vz;
            let t = l2 > 0 ? ((x - a.x) * vx + (z - a.z) * vz) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            const d = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
            if (d < best) { best = d; half = a.half + (b.half - a.half) * t; }
          }
        }
        // Banks that climb over thirty metres, not seventy. A seventy-metre
        // shoulder either side of a 240 m channel is a third of a kilometre of
        // pale shelving ground, and from the air that band — not the water —
        // was most of what the eye read as "the river out there".
        if (best > half + 80) continue;
        const k2 = best <= half ? 1
          : 1 - THREE.MathUtils.smoothstep((best - half) / 32, 0, 1);
        // The channel itself is drawn by the ribbon below, at a resolution
        // this grid cannot manage: a vertex every eighty-four metres turns a
        // thirty-metre bank into a staircase, and a chord across the ramp's
        // toe sits metres above the true profile. So under the ribbon this
        // grid is carved four metres deeper than the profile, fading to
        // nothing at the ribbon's outer edge, and the ribbon hides it.
        const under = 4 * (1 - THREE.MathUtils.smoothstep((best - half - 32) / 48, 0, 1));
        // The lower of the two: the channel cuts into the relief rather than
        // replacing it, so a tail leaving a map with hills on it still runs
        // downhill instead of jumping to one height.
        ap.setY(i, Math.min(ap.getY(i), sunk * k2 - under));
        chan[i] = k2;
      }
      ap.needsUpdate = true;
    }
    const at = new THREE.Color();
    const at2 = new THREE.Color();
    /** The country's colour at (x, z), `ch` deep into the river channel. */
    const apronColour = (x, z, ch) => {
      const broad = valueNoise(x * 0.0048, z * 0.0048);
      const patch = valueNoise(x * 0.021 + 91.3, z * 0.021 - 17.7);
      at.copy(P.urban).lerp(P.urbanAlt, THREE.MathUtils.clamp(broad * 2.2 + 0.5, 0, 1));
      at2.copy(P.park).lerp(P.parkAlt, THREE.MathUtils.clamp(broad * 2.0 + 0.5, 0, 1));
      // More green further out: the suburbs and then open country.
      const rural = THREE.MathUtils.clamp(
        (Math.max(Math.abs(x), Math.abs(z)) - this.span) / (this.span * 3), 0, 1,
      );
      // How green the country is. Fields and suburbs are half built colour;
      // rainforest is not built at all, and the Yucatan and the Tijuca were
      // both coming out the colour of a car park.
      const wild = (this.hinterland === 'jungle' || this.hinterland === 'forest')
        ? 0.86 : 0.38;
      // Clamped. `Color.lerp` extrapolates past its target for an alpha over
      // one, so the old weights adding to exactly 1.0 were load-bearing and
      // did not look it: raising the rural share to 0.86 took the far country
      // to an alpha of 1.48 and extrapolated the green straight through black,
      // which is what turned the Tijuca into a pale grey plain.
      at.lerp(at2, Math.min(1, THREE.MathUtils.smoothstep(patch, 0.08, 0.28) * 0.62
        + rural * wild));
      const n2 = valueNoise(x * 0.055, z * 0.055) * 0.22 + broad * 0.16;
      at.multiplyScalar(0.80 + n2);
      // Down the channel: silt on the shore, riverbed under the water. The
      // sheet only covers the flat bed, so the bank between the waterline and
      // the fields has to read as a bank.
      if (ch > 0) {
        at2.copy(P.bank).lerp(P.bed, THREE.MathUtils.smoothstep(ch, 0.55, 0.95));
        at.lerp(at2, THREE.MathUtils.smoothstep(ch, 0.04, 0.4));
      }
      // And the seabed, on a map whose surround is open water. Without this
      // the harbour beyond the map is farmland with a sheet of water over it,
      // which shows wherever the sheet is shallow or the sun is low.
      if (this.openSea && this.surfaceAt(x, z) < this.waterLevel - 1) {
        at.copy(P.bed);
      }
      return at;
    };
    const apColors = new Float32Array(ap.count * 3);
    for (let i = 0; i < ap.count; i++) {
      const c = apronColour(ap.getX(i), ap.getZ(i), chan[i]);
      apColors[i * 3] = c.r; apColors[i * 3 + 1] = c.g; apColors[i * 3 + 2] = c.b;
    }
    apronGeo.setAttribute('color', new THREE.BufferAttribute(apColors, 3));
    const apron = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1.0, metalness: 0,
    }));
    apron.position.y = edge - 0.4;
    apron.frustumCulled = false;
    apron.renderOrder = -5;

    // The river's own ground, drawn finely.
    //
    // A ribbon along each tail: the flat bed, the thirty-metre bank either
    // side, and a margin of ordinary country beyond, with a vertex every ten
    // metres across and at every point of the centreline along. It is laid
    // over the coarse frame, which is carved deeper underneath it, so the
    // bank you see is this one — a smooth shelf that follows the bends, not
    // the frame's staircase.
    const ribbon = this.openSea ? null : this._channelRibbon(edge, apronColour);
    if (ribbon) ribbon.position.y = edge - 0.4;

    this.group = new THREE.Group();
    this.group.add(apron);
    if (ribbon) this.group.add(ribbon);
    this.group.add(this.mesh);
    return this.group;
  }

  _channelRibbon(edge, apronColour) {
    const tails = this.riverTails();
    if (!tails.length) return null;
    const sunk = (this.waterLevel - edge) - 2.6;
    const MARGIN = 80;
    const pos = [], col = [], index = [];
    for (const pts of tails) {
      const cols = [];
      // Ten-metre columns across the widest part of this tail, symmetric.
      const wMax = pts.reduce((a, p) => Math.max(a, p.half), 0) + MARGIN;
      const nCols = Math.max(9, Math.ceil(wMax / 10) * 2 + 1);
      for (let k = 0; k < nCols; k++) cols.push((k / (nCols - 1)) * 2 - 1);
      let prev = null;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const ahead = pts[Math.min(pts.length - 1, i + 1)];
        const back = pts[Math.max(0, i - 1)];
        let tx = ahead.x - back.x, tz = ahead.z - back.z;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        const nx = -tz, nz = tx;
        const row = [];
        for (const u of cols) {
          const d = Math.abs(u) * (p.half + MARGIN);
          const k2 = d <= p.half ? 1
            : 1 - THREE.MathUtils.smoothstep((d - p.half) / 32, 0, 1);
          const x = p.x + nx * (p.half + MARGIN) * u, z = p.z + nz * (p.half + MARGIN) * u;
          row.push(pos.length / 3);
          pos.push(x, sunk * k2, z);
          const c = apronColour(x, z, k2);
          col.push(c.r, c.g, c.b);
        }
        if (prev) {
          for (let k = 0; k < cols.length - 1; k++) {
            index.push(prev[k], row[k], row[k + 1]);
            index.push(prev[k], row[k + 1], prev[k + 1]);
          }
        }
        prev = row;
      }
    }
    if (!index.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.setIndex(pos.length / 3 > 65535
      ? new THREE.BufferAttribute(new Uint32Array(index), 1)
      : new THREE.BufferAttribute(new Uint16Array(index), 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1.0, metalness: 0, side: THREE.DoubleSide,
      // Its flat margin lies on the frame at the same height.
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    mesh.frustumCulled = false;
    mesh.renderOrder = -4;
    return mesh;
  }

  /**
   * Where the river leaves the map, and which way it is going when it does.
   *
   * The playfield is a square cut out of a DEM, so the water stops dead at its
   * edge: from any height the Thames read as a lake with two square ends. A
   * river runs to both horizons, and to draw that both the water sheet and the
   * ground around it need the same description of where the channel goes — so
   * it is worked out once, here.
   *
   * Each exit is the midpoint and half-width of a wet run along one edge of the
   * square, plus the direction the channel is actually travelling, taken from
   * how the centreline moves over the last hundred metres inside the boundary
   * rather than assumed to be square to the edge.
   */
  riverExits() {
    if (this._exits) return this._exits;
    const s = this.span * 0.995;
    const out = [];
    const N = 360;
    const sides = [
      { n: { x: 0, z: -1 }, at: (t) => ({ x: -s + t * 2 * s, z: -s }) },
      { n: { x: 0, z: 1 }, at: (t) => ({ x: -s + t * 2 * s, z: s }) },
      { n: { x: -1, z: 0 }, at: (t) => ({ x: -s, z: -s + t * 2 * s }) },
      { n: { x: 1, z: 0 }, at: (t) => ({ x: s, z: -s + t * 2 * s }) },
    ];
    /** The wet centre of the channel `d` metres inside the edge, near `mid`. */
    const centreInside = (side, mid, d) => {
      const bx = mid.x - side.n.x * d, bz = mid.z - side.n.z * d;
      const tx = -side.n.z, tz = side.n.x;       // along the edge
      let lo = null, hi = null;
      for (let k = -60; k <= 60; k++) {
        const x = bx + tx * k * 12, z = bz + tz * k * 12;
        if (!this._maskWet(x, z)) continue;
        if (lo === null) lo = k;
        hi = k;
      }
      if (lo === null) return null;
      const m = (lo + hi) / 2;
      return { x: bx + tx * m * 12, z: bz + tz * m * 12, half: (hi - lo) * 6 };
    };
    const raw = [];
    for (const side of sides) {
      const close = (r) => {
        const a = side.at(r.i0 / N), b = side.at(r.i1 / N);
        const w = Math.hypot(b.x - a.x, b.z - a.z);
        if (w < 40) return;
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const near = centreInside(side, mid, 30);
        const far = centreInside(side, mid, 150);
        let dir = { x: side.n.x, z: side.n.z };
        if (near && far) {
          const dx = near.x - far.x, dz = near.z - far.z;
          const d = Math.hypot(dx, dz);
          // Only trust it if it is actually pointing outward.
          if (d > 1 && (dx * side.n.x + dz * side.n.z) / d > 0.35) {
            dir = { x: dx / d, z: dz / d };
          }
        }
        // Which corners of the map this run reaches, if any.
        const corners = [];
        if (r.i0 === 0) corners.push(side.at(0));
        if (r.i1 === N) corners.push(side.at(1));
        raw.push({ mid, half: w / 2, dir, n: { x: side.n.x, z: side.n.z }, corners });
      };
      const runs = [];
      let run = null;
      for (let i = 0; i <= N; i++) {
        const p = side.at(i / N);
        const wet = this._maskWet(p.x - side.n.x * 8, p.z - side.n.z * 8);
        if (wet) { if (!run) run = { i0: i, i1: i }; else run.i1 = i; }
        else if (run) { runs.push(run); run = null; }
      }
      if (run) runs.push(run);
      // One channel, not two creeks. A dry notch at the boundary — an island,
      // a levelled pad, a bank the mask clipped — split the Yamuna's east run
      // in two, and the river left the map as two thin ditches with a strip of
      // ground between them. Runs closer than eighty metres are one run.
      const stepLen = (2 * s) / N;
      const merged = [];
      for (const r of runs) {
        const last = merged[merged.length - 1];
        if (last && (r.i0 - last.i1) * stepLen < 80) last.i1 = r.i1;
        else merged.push({ i0: r.i0, i1: r.i1 });
      }
      for (const r of merged) close(r);
    }
    // One river crossing a corner of the map is wet along both edges that
    // meet there, and read as two rivers leaving side by side with a wedge of
    // ground between them. The two become one exit, placed between them and
    // heading between their bearings.
    const used = new Set();
    for (let i = 0; i < raw.length; i++) {
      if (used.has(i)) continue;
      let e = raw[i];
      for (let j = i + 1; j < raw.length; j++) {
        if (used.has(j)) continue;
        const o = raw[j];
        const shared = e.corners.some((c) => o.corners.some(
          (d) => Math.hypot(c.x - d.x, c.z - d.z) < 1));
        if (!shared) continue;
        used.add(j);
        const dx = e.dir.x + o.dir.x, dz = e.dir.z + o.dir.z;
        const dl = Math.hypot(dx, dz) || 1;
        const nx = e.n.x + o.n.x, nz = e.n.z + o.n.z;
        const nl = Math.hypot(nx, nz) || 1;
        e = {
          mid: { x: (e.mid.x + o.mid.x) / 2, z: (e.mid.z + o.mid.z) / 2 },
          half: (e.half + o.half) / 2,
          dir: { x: dx / dl, z: dz / dl },
          n: { x: nx / nl, z: nz / nl },
          corners: [],
        };
      }
      out.push(e);
    }
    this._exits = out;
    return out;
  }

  /**
   * The channel each exit carves through the country beyond the playfield, as a
   * centreline with a half-width at every point. Shared by the water sheet and
   * by the ground it has to be sunk into.
   */
  riverTails() {
    if (this._tails) return this._tails;
    // Far enough to put the end of the channel at the outer edge of the apron,
    // which is where the world stops.
    const reach = this.span * 6;
    // Marched coarsely and then smoothed, rather than marched finely. A river
    // a quarter of a kilometre across that changes heading every ninety metres
    // is a crinkled ribbon however small each kink is; control points a long
    // way apart, run through a spline, give the long lazy bends the thing
    // actually has.
    const CTRL = 420;
    const OUT = 70;
    const tails = [];
    for (const e of this.riverExits()) {
      // The first drawn control point has to be the river mouth exactly.
      //
      // Marching from a point behind the mouth does not achieve that: the
      // drift is applied before the first step, so the second control point —
      // the first one the spline actually draws from — lands wherever that
      // step happened to go. On the Thames that was ninety-six metres to one
      // side of where the river leaves the map, which is most of the width of
      // the river, and the join was unmissable.
      //
      // So the march starts at the mouth, and the control point behind it is
      // placed by hand, straight back along the exit bearing.
      const ctrl = [{
        x: e.mid.x - e.dir.x * CTRL, z: e.mid.z - e.dir.z * CTRL, half: e.half,
      }];
      let x = e.mid.x, z = e.mid.z;
      // The heading is kept as an offset from the exit bearing and pulled back
      // towards it every step. Integrating the noise straight into the heading
      // instead is a random walk: over a dozen steps it accumulates whole
      // turns, and the river leaves the map, curls round and comes back as a
      // lagoon. Damped, the same noise reads as a meander.
      const a0 = Math.atan2(e.dir.x, e.dir.z);
      let drift = 0;
      let half = e.half;
      for (let t = 0; t <= reach + CTRL; t += CTRL) {
        ctrl.push({ x, z, half });
        const bend = valueNoise(x * 0.0009 + 31.7, z * 0.0009 - 12.3) - 0.5;
        drift = drift * 0.72 + bend * 0.34;
        const a = a0 + drift;
        x += Math.sin(a) * CTRL;
        z += Math.cos(a) * CTRL;
        // Barely broadening. It is the same river a few kilometres further on,
        // not an estuary: at 1.028 a step it arrived at the horizon half as
        // wide again as the channel it continues, which read as the map's
        // river running into a lake.
        half *= 1.006;
      }
      // Catmull-Rom through the control points, sampled every seventy metres.
      // The first and last control points are outside the run on purpose, so
      // every real span has the two neighbours the spline needs.
      const pts = [];
      const cr = (p0, p1, p2, p3, u) => {
        const u2 = u * u, u3 = u2 * u;
        return 0.5 * ((2 * p1) + (-p0 + p2) * u
          + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
          + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
      };
      for (let k = 1; k < ctrl.length - 2; k++) {
        const p0 = ctrl[k - 1], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[k + 2];
        const n = Math.max(1, Math.round(
          Math.hypot(p2.x - p1.x, p2.z - p1.z) / OUT));
        for (let s = 0; s < n; s++) {
          const u = s / n;
          pts.push({
            x: cr(p0.x, p1.x, p2.x, p3.x, u),
            z: cr(p0.z, p1.z, p2.z, p3.z, u),
            half: p1.half + (p2.half - p1.half) * u,
          });
        }
      }
      pts.push({ x: ctrl[ctrl.length - 2].x, z: ctrl[ctrl.length - 2].z,
        half: ctrl[ctrl.length - 2].half });
      // The channel starts inside the map, not at its edge.
      //
      // The tail's cross-section is square to the channel and the map's edge
      // is square to the map, and where the river leaves at an angle the two
      // disagree by half the river's width times the sine of that angle. With
      // the centreline starting on the boundary, the ground in that wedge was
      // never sunk and a bar of raised bank stood across one side of the
      // mouth — from a phone's low angle, a land bridge over the Thames. Run
      // the centreline back inside by that much and the whole mouth is cut.
      //
      // Back along the spline's own first tangent, not the exit bearing: the
      // spline leaves the mouth a few degrees off the bearing, and a straight
      // stub on the bearing put a kink in the channel right at the boundary.
      let tx0 = pts[1].x - pts[0].x, tz0 = pts[1].z - pts[0].z;
      const tl0 = Math.hypot(tx0, tz0) || 1;
      tx0 /= tl0; tz0 /= tl0;
      const sinT = Math.abs(tx0 * e.n.z - tz0 * e.n.x);
      const back = e.half * sinT + 30;
      pts.unshift({
        x: e.mid.x - tx0 * back, z: e.mid.z - tz0 * back,
        half: e.half, inside: true,
      });
      tails.push(pts);
    }
    this._tails = tails;
    return tails;
  }

  addToPhysics(physics) {
    const rapier = physics.rapier;
    const n = this.size;
    // Rapier's heightfield is a column-major matrix: element (row i, column j)
    // lives at `heights[j * n + i]`, column j sits at x = (j/(n-1) - ½)·scale.x
    // and row i at z = (i/(n-1) - ½)·scale.z. So the row index climbs with +z.
    //
    // The DEM's does not. `heightAt` looks up row `(span - z)`, because the
    // bake writes north at the top of the image the way a map does, so its row
    // index climbs with *-z*. Copying the rows across without reversing them
    // therefore built a physics ground mirrored north-south against the one
    // being drawn — 3.6 m out on average over this map, and far more than that
    // on the river bank.
    //
    // Everything that asks the world where the ground is was wrong by that
    // much: shells detonated against invisible slopes a few metres from the
    // muzzle, rubble came to rest on ground that was not there, and the
    // freezing test — which compares a stone's height against the *visual*
    // terrain — called those stones supported and froze them in mid-air.
    const heights = new Float32Array(n * n);
    for (let zi = 0; zi < n; zi++) {
      const row = (n - 1 - zi) * n;
      for (let xi = 0; xi < n; xi++) {
        heights[xi * n + zi] = this.heights[row + xi];
      }
    }
    const body = physics.world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const desc = rapier.ColliderDesc.heightfield(
      n - 1, n - 1, heights,
      { x: this.span * 2, y: 1, z: this.span * 2 },
    ).setFriction(0.94).setRestitution(0.0);
    this.collider = physics.world.createCollider(desc, body);
    this.terrainBody = body;
    return body;
  }
}

export async function loadTerrain(levelId, quality) {
  const base = `assets/terrain/${levelId}`;
  const meta = await fetch(`${base}.json`).then((r) => r.json());
  const [height, mask, far] = await Promise.all([
    loadImageData(`${base}_height.png`),
    loadImageData(`${base}_mask.png`),
    // The coastline of the country the level is standing in, out to seven
    // spans. Optional: a level baked before this existed simply has none, and
    // falls back to the edge-of-map guess it always used.
    meta.farSpan ? loadImageData(`${base}_far.png`).catch(() => null) : null,
  ]);
  return new Terrain(meta, height, mask, quality, far);
}

/**
 * A square annulus in the XZ plane: everything between `inner` and `outer`,
 * with the middle left open. Built from eight subdivided rectangles so the
 * vertex colouring has something to interpolate across.
 */
function frameGeometry(inner, outer, div) {
  const pos = [];
  const index = [];

  const rect = (x0, z0, x1, z1) => {
    const base = pos.length / 3;
    const nx = div, nz = div;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        pos.push(x0 + (x1 - x0) * (i / nx), 0, z0 + (z1 - z0) * (j / nz));
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i;
        const b = a + 1, c = a + nx + 1, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
  };

  // Four sides plus four corners.
  rect(-outer, -outer, outer, -inner);        // north strip
  rect(-outer, inner, outer, outer);          // south strip
  rect(-outer, -inner, -inner, inner);        // west strip
  rect(inner, -inner, outer, inner);          // east strip

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(pos.length / 3 > 65535
    ? new THREE.BufferAttribute(new Uint32Array(index), 1)
    : new THREE.BufferAttribute(new Uint16Array(index), 1));
  geo.computeVertexNormals();
  return geo;
}

/** Tileable multi-octave grain, generated once at boot. */
function makeGrainTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Wrapped sampling keeps the tile seamless.
      let n = 0;
      n += tileNoise(x, y, size, 4) * 0.5;
      n += tileNoise(x, y, size, 9) * 0.27;
      n += tileNoise(x, y, size, 19) * 0.15;
      n += tileNoise(x, y, size, 41) * 0.08;
      const v = Math.round(232 + (n - 0.5) * 96);
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(150, Math.min(255, v));
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Normal map derived from the same grain field, so lighting agrees with it. */
function makeGrainNormal(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const h = (x, y) => tileNoise(x, y, size, 9) * 0.6 + tileNoise(x, y, size, 19) * 0.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h((x + 1) % size, y) - h((x - 1 + size) % size, y);
      const dy = h(x, (y + 1) % size) - h(x, (y - 1 + size) % size);
      const o = (y * size + x) * 4;
      img.data[o] = Math.round((-dx * 0.5 + 0.5) * 255);
      img.data[o + 1] = Math.round((-dy * 0.5 + 0.5) * 255);
      img.data[o + 2] = 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/** Value noise on a wrapped lattice, so the result tiles without a seam. */
function tileNoise(x, y, size, freq) {
  const fx = (x / size) * freq;
  const fy = (y / size) * freq;
  const xi = Math.floor(fx), yi = Math.floor(fy);
  const tx = fx - xi, ty = fy - yi;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const hsh = (a, b) => {
    a = ((a % freq) + freq) % freq;
    b = ((b % freq) + freq) % freq;
    let n = Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263) ^ Math.imul(freq, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const a = hsh(xi, yi), b = hsh(xi + 1, yi), cc = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (cc * (1 - sx) + d * sx) * sy;
}

/**
 * Cheap deterministic value noise for ground mottling.
 *
 * Exported because the street mesh breaks up its asphalt with the same field
 * the terrain uses, and two different noise functions over the same ground
 * produce two different-looking grounds sitting on top of each other.
 */
export function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const h = (a, b) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz - 0.5;
}

function loadImageData(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height).data);
    };
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}
