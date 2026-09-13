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

  /** Bilinear mask lookup: water / road / park coverage at world (x, z). */
  maskAt(x, z) {
    const n = this.size;
    const u = THREE.MathUtils.clamp((x + this.span) / (this.span * 2) * (n - 1), 0, n - 1);
    const v = THREE.MathUtils.clamp((this.span - z) / (this.span * 2) * (n - 1), 0, n - 1);
    const xi = Math.round(u), zi = Math.round(v);
    const o = (zi * n + xi) * 3;
    return { water: this.mask[o], road: this.mask[o + 1], park: this.mask[o + 2] };
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

    // Urban ground, parkland, riverbed and wet mud, blended by the bake mask.
    const cUrban = new THREE.Color(0x5c5b54);
    const cPark = new THREE.Color(0x546b3c);
    const cBed = new THREE.Color(0x3f4136);
    const cBank = new THREE.Color(0x64604f);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);

      const m = this.maskAt(x, z);
      tmp.copy(cUrban).lerp(cPark, m.park);
      // Below the waterline the ground is riverbed; just above it, wet bank.
      const wet = THREE.MathUtils.clamp((this.waterLevel + 1.5 - h) / 4.0, 0, 1);
      tmp.lerp(cBank, wet * 0.7);
      tmp.lerp(cBed, THREE.MathUtils.clamp((this.waterLevel - h) / 3.0, 0, 1) * 0.85);

      // Fine mottling so the large flat expanse isn't a flat colour field.
      // Two scales of variation: broad patches that break the plain into
      // districts, and fine mottling on top.
      const broad = valueNoise(x * 0.0055, z * 0.0055);
      tmp.lerp(cPark, THREE.MathUtils.clamp(broad * 1.6 + 0.22, 0, 1) * 0.30 * (1 - m.water));
      const n = valueNoise(x * 0.035, z * 0.035) * 0.13
              + valueNoise(x * 0.31, z * 0.31) * 0.06
              + broad * 0.16;
      tmp.multiplyScalar(0.88 + n);

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
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: grain,
      normalMap: grainN,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.97,
      metalness: 0.0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = this.quality.shadowMapSize > 0;
    this.mesh.frustumCulled = false;

    // Flat apron continuing the border height to the horizon so the playfield
    // doesn't end in mid-air. It sits fractionally lower to avoid z-fighting
    // along the seam, and fog swallows the step long before it's legible.
    const edge = this.heightAt(this.span, 0);
    const apronGeo = new THREE.PlaneGeometry(this.span * 16, this.span * 16, 1, 1);
    apronGeo.rotateX(-Math.PI / 2);
    const apron = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({
      color: 0x60594c, roughness: 1.0, metalness: 0,
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

/** Cheap deterministic value noise for ground mottling. */
function valueNoise(x, z) {
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
