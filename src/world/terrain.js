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
  constructor(meta, heightData, maskData, quality) {
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

    this.cellSize = (this.span * 2) / (n - 1);
    this.waterLevel = this._computeWaterLevel();
    this.mesh = null;
    this.collider = null;
  }

  _computeWaterLevel() {
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

  /** Bilinear ground height at world (x, z). Metres, world units. */
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
    const fx = u - x0, fz = v - z0;
    const h = this.heights;
    const a = h[z0 * n + x0], b = h[z0 * n + x1];
    const c = h[z1 * n + x0], d = h[z1 * n + x1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
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

  isWater(x, z) {
    const n = this.size;
    const u = Math.round((x + this.span) / (this.span * 2) * (n - 1));
    const v = Math.round((this.span - z) / (this.span * 2) * (n - 1));
    if (u < 0 || v < 0 || u > n - 1 || v > n - 1) return false;
    return this.mask[(v * n + u) * 3] > 0.5;
  }

  buildMesh() {
    const n = this.size;
    // Render at a lower resolution than the collider on weaker devices; the
    // terrain is gently sloped, so the visual loss is negligible.
    const step = this.quality.name === 'low' ? 2 : 1;
    const rn = Math.floor((n - 1) / step) + 1;

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
      const green = THREE.MathUtils.smoothstep(patch, 0.10, 0.30) * 0.62;
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

      // Then the water margin, which overrides everything: silt at the line,
      // cold green below it.
      const wet = THREE.MathUtils.clamp((this.waterLevel + 1.2 - h) / 3.2, 0, 1);
      tmp.lerp(P.bank, wet * 0.8);
      tmp.lerp(P.bed, THREE.MathUtils.clamp((this.waterLevel - h) / 2.6, 0, 1) * 0.9);

      // Fine mottling on top of all of it.
      const n = valueNoise(x * 0.055, z * 0.055) * 0.22
              + valueNoise(x * 0.34, z * 0.34) * 0.10
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
    const apronGeo = frameGeometry(this.span, this.span * 7, 10);
    const ap = apronGeo.attributes.position;
    const apColors = new Float32Array(ap.count * 3);
    const at = new THREE.Color();
    const at2 = new THREE.Color();
    for (let i = 0; i < ap.count; i++) {
      const x = ap.getX(i), z = ap.getZ(i);
      const broad = valueNoise(x * 0.0048, z * 0.0048);
      const patch = valueNoise(x * 0.021 + 91.3, z * 0.021 - 17.7);
      at.copy(P.urban).lerp(P.urbanAlt, THREE.MathUtils.clamp(broad * 2.2 + 0.5, 0, 1));
      at2.copy(P.park).lerp(P.parkAlt, THREE.MathUtils.clamp(broad * 2.0 + 0.5, 0, 1));
      // More green further out: the suburbs and then open country.
      const rural = THREE.MathUtils.clamp(
        (Math.max(Math.abs(x), Math.abs(z)) - this.span) / (this.span * 3), 0, 1,
      );
      at.lerp(at2, THREE.MathUtils.smoothstep(patch, 0.08, 0.28) * 0.62 + rural * 0.38);
      const n2 = valueNoise(x * 0.055, z * 0.055) * 0.22 + broad * 0.16;
      at.multiplyScalar(0.80 + n2);
      apColors[i * 3] = at.r; apColors[i * 3 + 1] = at.g; apColors[i * 3 + 2] = at.b;
    }
    apronGeo.setAttribute('color', new THREE.BufferAttribute(apColors, 3));
    const apron = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1.0, metalness: 0,
    }));
    apron.position.y = edge - 0.4;
    apron.frustumCulled = false;
    apron.renderOrder = -5;

    this.group = new THREE.Group();
    this.group.add(apron);
    this.group.add(this.mesh);
    return this.group;
  }

  addToPhysics(physics) {
    const rapier = physics.rapier;
    const n = this.size;
    // Rapier's heightfield indexes rows along z and columns along x, with the
    // sample grid normalised to the collider's scale.
    const heights = new Float32Array(n * n);
    for (let zi = 0; zi < n; zi++) {
      for (let xi = 0; xi < n; xi++) {
        heights[xi * n + zi] = this.heights[zi * n + xi];
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
  const [height, mask] = await Promise.all([
    loadImageData(`${base}_height.png`),
    loadImageData(`${base}_mask.png`),
  ]);
  return new Terrain(meta, height, mask, quality);
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
