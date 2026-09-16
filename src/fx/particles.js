import * as THREE from 'three';

/**
 * Camera-facing billboard particles, one draw call per system.
 *
 * Everything is a flat CPU array and the instance buffers are rewritten each
 * frame with only the live particles packed to the front, so `instanceCount`
 * tracks exactly what's alive and dead particles cost nothing. Textures are
 * generated procedurally at boot — a smoke puff is a noise-warped radial
 * falloff, which is both cheaper to ship and easier to tune than an image.
 */

const VERT = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 iPos;
  attribute vec4 iData;   // x: size, y: life 0..1, z: seed, w: rotation
  attribute vec3 iColor;
  attribute float iAlpha;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vLife;
  varying float vSeed;

  void main() {
    vUv = uv;
    vColor = iColor;
    vAlpha = iAlpha;
    vLife = iData.y;
    vSeed = iData.z;

    // Billboard against the view basis so puffs always face the camera.
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    float a = iData.w;
    float ca = cos(a), sa = sin(a);
    vec2 p = position.xy;
    vec2 r = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

    vec3 world = iPos + (camRight * r.x + camUp * r.y) * iData.x;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const FRAG = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform float uEmissive;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vLife;
  varying float vSeed;

  void main() {
    #include <logdepthbuf_fragment>
    vec4 tex = texture2D(uMap, vUv);
    float a = tex.a * vAlpha;
    if (a < 0.004) discard;
    // Texture luminance modulates colour so the puff has internal structure
    // instead of reading as a flat disc.
    vec3 col = vColor * mix(0.75, 1.25, tex.r) * uEmissive;
    gl_FragColor = vec4(col, a);
  }
`;

export function makeSmokeTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const half = size / 2;

  // Layered value noise gives the puff a billowing edge; a radial falloff
  // keeps it soft. Multiplying the two avoids the "cotton ball" look.
  const noise = (x, y, f) => {
    const xi = Math.floor(x * f), yi = Math.floor(y * f);
    const fx = x * f - xi, fy = y * f - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const h = (a, b) => {
      let n = Math.imul(a + 1013, 374761393) ^ Math.imul(b + 2477, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const a = h(xi, yi), b = h(xi + 1, yi), cc = h(xi, yi + 1), dd = h(xi + 1, yi + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (cc * (1 - sx) + dd * sx) * sy;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);

      let n = 0;
      n += noise(x / size, y / size, 5) * 0.55;
      n += noise(x / size, y / size, 11) * 0.28;
      n += noise(x / size, y / size, 23) * 0.17;

      // Warp the falloff radius by the noise so the silhouette is ragged.
      const edge = 1.0 - THREE.MathUtils.smoothstep(r, 0.16, 0.78 + (n - 0.5) * 0.42);
      const a = Math.max(0, Math.min(1, edge)) * (0.6 + n * 0.5);

      const o = (y * size + x) * 4;
      const lum = Math.round(180 + n * 75);
      d[o] = lum; d[o + 1] = lum; d[o + 2] = lum;
      d[o + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeSparkTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,228,170,0.92)');
  g.addColorStop(0.55, 'rgba(255,140,40,0.45)');
  g.addColorStop(1.0, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class BillboardParticles {
  /**
   * @param {number} max        pool capacity
   * @param {THREE.Texture} map sprite
   * @param {object} opts       { blending, emissive, depthWrite }
   */
  constructor(max, map, opts = {}) {
    this.max = max;
    this.count = 0;

    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.turb = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.alpha0 = new Float32Array(max);

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;

    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    for (const a of [this.aPos, this.aData, this.aColor, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iData', this.aData);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iAlpha', this.aAlpha);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uEmissive: { value: opts.emissive ?? 1.0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: opts.depthWrite ?? false,
      depthTest: true,
      blending: opts.blending ?? THREE.NormalBlending,
    });

    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder ?? 10;

    this._tmp = new THREE.Color();
  }

  spawn(o) {
    let i;
    if (this.count < this.max) {
      i = this.count++;
    } else {
      // Pool full: recycle whichever particle is closest to dying, so a big
      // blast never starves a newer, more visible one.
      let worst = 0, worstT = -1;
      for (let k = 0; k < this.max; k++) {
        const t = this.age[k] / this.life[k];
        if (t > worstT) { worstT = t; worst = k; }
      }
      i = worst;
    }

    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.size0[i] = o.size0;
    this.size1[i] = o.size1 ?? o.size0;
    this.rot[i] = o.rot ?? Math.random() * Math.PI * 2;
    this.spin[i] = o.spin ?? 0;
    this.drag[i] = o.drag ?? 0.6;
    this.grav[i] = o.grav ?? 0;
    this.turb[i] = o.turb ?? 0;
    this.seed[i] = Math.random();
    this.alpha0[i] = o.alpha ?? 1;

    const a = o.color0, b = o.color1 ?? o.color0;
    this.c0[i * 3] = a.r; this.c0[i * 3 + 1] = a.g; this.c0[i * 3 + 2] = a.b;
    this.c1[i * 3] = b.r; this.c1[i * 3 + 1] = b.g; this.c1[i * 3 + 2] = b.b;
    return i;
  }

  update(dt, time) {
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) continue;

      const d = Math.exp(-this.drag[i] * dt);
      let vx = this.vel[i * 3] * d;
      let vy = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      let vz = this.vel[i * 3 + 2] * d;

      // Curl-ish turbulence keeps plumes from rising as straight columns.
      const tb = this.turb[i];
      if (tb > 0) {
        const s = this.seed[i] * 40.0;
        vx += Math.sin(time * 0.9 + s + this.pos[i * 3 + 1] * 0.12) * tb * dt;
        vz += Math.cos(time * 1.1 + s * 1.7 + this.pos[i * 3 + 1] * 0.1) * tb * dt;
        vy += Math.sin(time * 0.7 + s * 2.3) * tb * 0.4 * dt;
      }

      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.pos[i * 3] += vx * dt;
      this.pos[i * 3 + 1] += vy * dt;
      this.pos[i * 3 + 2] += vz * dt;
      this.rot[i] += this.spin[i] * dt;

      // Compact live particles to the front of the instance buffers.
      if (w !== i) this._move(i, w);
      this._write(w, t);
      w++;
    }
    // Anything past `w` is dead; shrink the logical pool.
    this.count = w;
    this.geometry.instanceCount = w;
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  _move(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.c0[to * 3 + k] = this.c0[from * 3 + k];
      this.c1[to * 3 + k] = this.c1[from * 3 + k];
    }
    this.age[to] = this.age[from];
    this.life[to] = this.life[from];
    this.size0[to] = this.size0[from];
    this.size1[to] = this.size1[from];
    this.rot[to] = this.rot[from];
    this.spin[to] = this.spin[from];
    this.drag[to] = this.drag[from];
    this.grav[to] = this.grav[from];
    this.turb[to] = this.turb[from];
    this.seed[to] = this.seed[from];
    this.alpha0[to] = this.alpha0[from];
  }

  _write(i, t) {
    this.aPos.array[i * 3] = this.pos[i * 3];
    this.aPos.array[i * 3 + 1] = this.pos[i * 3 + 1];
    this.aPos.array[i * 3 + 2] = this.pos[i * 3 + 2];

    const size = this.size0[i] + (this.size1[i] - this.size0[i]) * Math.pow(t, 0.55);
    this.aData.array[i * 4] = size;
    this.aData.array[i * 4 + 1] = t;
    this.aData.array[i * 4 + 2] = this.seed[i];
    this.aData.array[i * 4 + 3] = this.rot[i];

    // Colour ramps over life; alpha rises fast then falls away slowly, which
    // is what makes smoke read as dissipating rather than blinking out.
    const k = Math.pow(t, 0.7);
    this.aColor.array[i * 3] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * k;
    this.aColor.array[i * 3 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * k;
    this.aColor.array[i * 3 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * k;

    const fadeIn = Math.min(1, t / 0.08);
    const fadeOut = 1.0 - THREE.MathUtils.smoothstep(t, 0.35, 1.0);
    this.aAlpha.array[i] = this.alpha0[i] * fadeIn * fadeOut;
  }
}
