import * as THREE from 'three';

/**
 * Scorch marks where rounds land.
 *
 * A shell that falls short currently leaves nothing behind, which throws away
 * the most useful feedback the player gets: *where the sheaf is actually
 * landing*. Dispersion means half the rounds miss, and without a mark on the
 * ground a miss is indistinguishable from a round that never arrived.
 *
 * Drawn as one instanced quad laid flat on the terrain, so a hundred craters
 * cost a single draw call and nothing per frame once they have settled. They
 * are decals, not geometry — there is no hole in the heightfield, and shells
 * still land on the terrain as it was baked.
 *
 * They were flat grey discs, and a flat grey disc is a coin, not a burn. Each
 * mark now carries one of four scorch textures painted once at start-up: a
 * charred core, radial streaks where the blast threw burning debris, a ring of
 * ash, and an edge bitten ragged so no two of them share an outline. The
 * texture is what makes it a burn; the instancing is what makes it free.
 */
const MAX = 160;
const TILES = 4;              // variants, in a 2 × 2 atlas

export class CraterFX {
  constructor(scene, terrain, quality) {
    this.terrain = terrain;
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    const tile = new Float32Array(MAX);
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tile, 1));
    this._tile = geo.attributes.aTile;

    const map = scorchAtlas();
    const material = new THREE.MeshBasicMaterial({
      map, color: 0xffffff, transparent: true, opacity: 0.94,
      // A whisker of polygon offset, not four units of it: the factor scales
      // with the depth slope, and a decal seen at a grazing angle was pulled
      // so far forward it drew on the roof of the cathedral standing over it.
      // The nine centimetres it sits proud of the ground do the real work.
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1,
    });
    // Pick each instance's quarter of the atlas. The material's own UV
    // transform is bypassed: the atlas is a plain grid.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile;')
        .replace('#include <uv_vertex>',
          '#include <uv_vertex>\n'
          + 'vMapUv = (uv + vec2(mod(aTile, 2.0), floor(aTile / 2.0))) * 0.5;');
    };

    this.mesh = new THREE.InstancedMesh(geo, material, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    scene.add(this.mesh);

    this._next = 0;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.enabled = quality.name !== 'low';
  }

  /** Mark the ground. `radius` is the warhead's blast radius. */
  add(x, groundY, z, radius) {
    if (!this.enabled) return;
    const i = this._next % MAX;
    this._next++;
    // Sit a few centimetres proud of the terrain. The heightfield is sampled
    // every 3.5 m, so a decal laid exactly on it z-fights across the seams.
    this._v.set(x, groundY + 0.09, z);
    // The texture's burn reaches about seventy percent of the quad, so the
    // quad is a little wider than the mark the old disc drew.
    const r = radius * (0.62 + Math.random() * 0.3);
    this._s.set(r, 1, r * (0.85 + Math.random() * 0.3));
    this._q.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    this._m4.compose(this._v, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m4);
    this._tile.setX(i, Math.floor(Math.random() * TILES));
    this._tile.needsUpdate = true;
    // The texture carries the black; the tint only varies it — a shade warmer
    // where the ground is still hot, a shade cooler where it is ash.
    const k = 0.82 + Math.random() * 0.18;
    this._c.setRGB(k * (0.96 + Math.random() * 0.08), k * 0.95, k * 0.9);
    this.mesh.instanceColor.setXYZ(i, this._c.r, this._c.g, this._c.b);
    this.mesh.count = Math.min(MAX, this._next);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this._next = 0; this.mesh.count = 0; }
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Four burn marks, painted onto one canvas.
 *
 * Each is built the way the ground actually gets marked: a charred core where
 * the charge went off, streaks flung out along the radii, a lighter ring of
 * ash and dust just outside the char, and an edge that the fire reached
 * unevenly. Everything in it is painted with alpha, so the mark is the
 * ground under it, darkened — it works on grass, on paving and on sand.
 */
function scorchAtlas() {
  const T = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = T * 2;
  const ctx = canvas.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };

  for (let t = 0; t < TILES; t++) {
    const ox = (t % 2) * T, oy = Math.floor(t / 2) * T;
    const cx = ox + T / 2, cy = oy + T / 2;
    const R = T * 0.36;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, T, T); ctx.clip();

    // Ash and dust, the widest and faintest layer.
    let g = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.3);
    g.addColorStop(0, 'rgba(70, 64, 58, 0.55)');
    g.addColorStop(0.55, 'rgba(90, 84, 76, 0.28)');
    g.addColorStop(1, 'rgba(90, 84, 76, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2); ctx.fill();

    // Streaks: burning debris thrown along the radii.
    ctx.lineCap = 'round';
    const streaks = 26 + Math.floor(rnd() * 12);
    for (let i = 0; i < streaks; i++) {
      const a = rnd() * Math.PI * 2;
      const r0 = R * (0.3 + rnd() * 0.3), r1 = R * (0.85 + rnd() * 0.5);
      ctx.strokeStyle = `rgba(18, 14, 11, ${0.35 + rnd() * 0.4})`;
      ctx.lineWidth = 2 + rnd() * 7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a + (rnd() - 0.5) * 0.12) * r1, cy + Math.sin(a + (rnd() - 0.5) * 0.12) * r1);
      ctx.stroke();
    }

    // The char: black at the centre, breaking up toward the edge as lumps.
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(8, 6, 5, 0.97)');
    g.addColorStop(0.45, 'rgba(14, 11, 9, 0.9)');
    g.addColorStop(0.8, 'rgba(24, 20, 17, 0.55)');
    g.addColorStop(1, 'rgba(30, 26, 22, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    const lumps = 70;
    for (let i = 0; i < lumps; i++) {
      const a = rnd() * Math.PI * 2, d = R * (0.55 + rnd() * 0.5);
      const rr = R * (0.08 + rnd() * 0.16);
      ctx.fillStyle = `rgba(12, 9, 7, ${0.3 + rnd() * 0.45})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2); ctx.fill();
    }

    // A few embers' worth of colour where the ground is still hot.
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = R * rnd() * 0.5;
      const rr = R * (0.03 + rnd() * 0.05);
      ctx.fillStyle = `rgba(120, 50, 18, ${0.25 + rnd() * 0.3})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2); ctx.fill();
    }

    // Bite the edge ragged: the fire did not reach the same distance all round.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2, d = R * (1.0 + rnd() * 0.45);
      const rr = R * (0.12 + rnd() * 0.22);
      const gg = ctx.createRadialGradient(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0,
        cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr);
      gg.addColorStop(0, 'rgba(0,0,0,0.9)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2); ctx.fill();
    }
    // And nothing reaches the tile's own edge, or the atlas bleeds.
    const fade = ctx.createRadialGradient(cx, cy, T * 0.42, cx, cy, T * 0.5);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(ox, oy, T, T);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
