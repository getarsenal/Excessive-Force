/**
 * Napalm.
 *
 * The F-4 comes in low along the line the player drew and lets four
 * canisters go one after another. They tumble, they hit, and each throws
 * its jelly forward along the run: a wall of fire rolls out sixty or eighty
 * metres from where it struck, faster than it looks like it should, and
 * stands there burning under a column of oily black smoke for half a
 * minute. Four of them laid end to end are a street on fire.
 *
 * What it does, as against what the bombs do: very little to a stone wall
 * at a glance, and everything to what is in the open round it. A man in a
 * trench has no cover from it (the jelly runs into the trench), so the
 * garrison along the line is gone, the flak pits with it, and the town's
 * houses along it are gutted. Masonry inside the flames heats: timber,
 * thatch and lattice go in seconds, glass and gilding run, iron and steel
 * soften and let go, brick and stone spall and crumble away at the foot of
 * a wall over the half minute it burns. Which undercuts it, and the support
 * solver does the rest; what it cannot touch is the Burj's armoured core.
 * The smoke hides the battery from the men who are left.
 *
 * Drawn as cheaply as it can be made to read: the flames are cards stood up
 * on the ground and turned to the camera about their upright, one instanced
 * draw for every flame in the battle, painted by a small noise shader that
 * licks upward; the ground under them is a second instanced draw of flat
 * glowing quads; the rolling fireball and the smoke are the existing particle
 * pools, so the fill governor sees them. A burning patch is a capsule (a
 * segment and a half-width) for every test.
 */
import * as THREE from 'three';
import { MATERIALS } from '../structure/builder.js';
import { crack } from '../core/synth.js';

/** Seconds of full exposure a stone a metre thick takes to fail, by material. */
const M = MATERIALS;
const RESIST = {
  [M.THATCH]: 2.5, [M.KYEMA]: 3, [M.BEAM]: 3.5, [M.LATTICE]: 3.5, [M.CHARGE]: 3,
  [M.GLASS]: 3, [M.GILT]: 4, [M.GOLD]: 7, [M.GLAZE]: 7, [M.AZURE]: 7, [M.COPPER]: 6,
  [M.RAILING]: 5, [M.IRON]: 7, [M.IRONWORK]: 8, [M.STEEL]: 8, [M.MAST]: 10,
  [M.TILE]: 18, [M.SLATE]: 18, [M.SCOTSLATE]: 18, [M.RIDGE]: 12,
  [M.BRICK]: 13, [M.MADDER]: 12, [M.ROSE]: 15, [M.SANDSTONE]: 15, [M.REDSTONE]: 16,
  [M.LIMESTONE]: 16, [M.ASHLAR]: 16, [M.MARBLE]: 18, [M.VERDE]: 18, [M.GRANITE]: 26,
  [M.CONCRETE]: 24, [M.RUBBLE]: 30, [M.TURF]: 40,
  [M.CURTAIN]: Infinity, [M.RAFT]: Infinity, [M.SPINE]: Infinity,
};

const FRONT = 1.1;        // seconds the jelly takes to roll out to its full reach
const TICK = 0.2;         // seconds between the burn's damage passes

// ── The flame shader: a card stood on the ground, turned to the camera about
// its upright, licking upward. Additive; the colour runs from deep red at
// the ragged top to the yellow-white of the base.
const FLAME_VS = /* glsl */`
  attribute vec3 aPos;
  attribute vec3 aSize;     // width, height, seed
  attribute float aHeat;
  uniform vec3 uCam;
  varying vec2 vUv;
  varying float vSeed;
  varying float vHeat;
  void main() {
    vec3 to = uCam - aPos; to.y = 0.0;
    float l = length(to);
    vec3 f = l > 1e-3 ? to / l : vec3(0.0, 0.0, 1.0);
    vec3 r = vec3(f.z, 0.0, -f.x);
    float h = aSize.y * (0.3 + 0.7 * aHeat);
    vec3 p = aPos + r * position.x * aSize.x + vec3(0.0, (position.y + 0.5) * h, 0.0);
    vUv = uv; vSeed = aSize.z; vHeat = aHeat;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const NOISE = /* glsl */`
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.0; a *= 0.5; } return v; }
`;
const FLAME_FS = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  varying float vHeat;
  ${NOISE}
  void main() {
    float t = uTime * 1.7 + vSeed * 13.0;
    float n = fbm(vec2(vUv.x * 2.6 + vSeed * 7.0, vUv.y * 1.9 - t));
    float n2 = fbm(vec2(vUv.x * 5.5 - vSeed * 3.0, vUv.y * 3.6 - t * 1.6));
    float x = abs(vUv.x - 0.5) * 2.0;
    // The body: wide and solid at the foot, torn into tongues toward the top.
    float body = (1.0 - vUv.y) * 1.3 - x * x * 1.05 + (n - 0.5) * 1.1 + (n2 - 0.5) * 0.45;
    float a = smoothstep(0.02, 0.32, body) * smoothstep(0.0, 0.06, vUv.y) * vHeat;
    if (a < 0.004) discard;
    float hot = clamp(body * 1.25, 0.0, 1.0);
    // Deep red and smoky at the torn tips, burning orange through the body,
    // a yellow core low down: solid, not added light, so a sunlit street
    // does not wash it to cream.
    vec3 col = mix(vec3(0.34, 0.05, 0.01), vec3(0.98, 0.34, 0.03), smoothstep(0.05, 0.45, hot));
    col = mix(col, vec3(1.0, 0.66, 0.16), smoothstep(0.55, 0.95, hot));
    gl_FragColor = vec4(col * 1.25, a * 0.92);
  }
`;
// ── The ground under the flames: a flat quad of embers and running jelly.
const GROUND_VS = /* glsl */`
  attribute vec3 aPos;
  attribute vec4 aShape;    // width, length, yaw, seed
  attribute float aHeat;
  varying vec2 vUv;
  varying float vSeed;
  varying float vHeat;
  void main() {
    float c = cos(aShape.z), s = sin(aShape.z);
    vec2 q = vec2(position.x * aShape.x, position.y * aShape.y);
    vec3 p = aPos + vec3(q.x * c + q.y * s, 0.0, -q.x * s + q.y * c);
    vUv = uv; vSeed = aShape.w; vHeat = aHeat;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const GROUND_FS = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  varying float vHeat;
  ${NOISE}
  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.55, 1.0, length(d * vec2(1.0, 0.8)));
    float n = fbm(vUv * vec2(4.0, 6.0) + vec2(vSeed * 9.0, uTime * 0.35));
    float flick = 0.75 + 0.25 * sin(uTime * 9.0 + vSeed * 40.0 + n * 6.0);
    float a = edge * smoothstep(0.32, 0.72, n + 0.18 * vHeat) * vHeat * flick;
    if (a < 0.004) discard;
    vec3 col = mix(vec3(0.5, 0.06, 0.0), vec3(1.0, 0.5, 0.08), smoothstep(0.45, 0.9, n));
    gl_FragColor = vec4(col * 1.2, a * 0.85);
  }
`;

/** An instanced quad with its own attributes, `n` long. */
function cards(n, attrs, vs, fs, renderOrder, blending = THREE.AdditiveBlending) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const a = {};
  for (const [name, size] of attrs) {
    a[name] = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
    a[name].setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a[name]);
  }
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } },
    transparent: true, depthWrite: false, blending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.keep = true;
  return { mesh, g, a, mat, n };
}

export class Napalm {
  /** @param {object} o scene, terrain, fx, audio, camera, quality, battle */
  constructor(o) {
    Object.assign(this, o);
    const low = this.quality?.name === 'low';
    this.low = low;
    this.burns = [];
    this.time = 0;
    this.flames = cards(low ? 200 : 420, [['aPos', 3], ['aSize', 3], ['aHeat', 1]], FLAME_VS, FLAME_FS, 12, THREE.NormalBlending);
    this.ground = cards(low ? 70 : 140, [['aPos', 3], ['aShape', 4], ['aHeat', 1]], GROUND_VS, GROUND_FS, 7);
    this.scene.add(this.flames.mesh, this.ground.mesh);
    this._c = {
      hot: new THREE.Color(1.35, 0.78, 0.2), burn: new THREE.Color(1.1, 0.34, 0.04),
      black: new THREE.Color(0.06, 0.055, 0.05), grey: new THREE.Color(0.16, 0.15, 0.14),
      fireHot: new THREE.Color(0xfff0c0), fireMid: new THREE.Color(0xff7a1a),
      spark: new THREE.Color(0xffc070), sparkCold: new THREE.Color(0x802000),
    };
    this._v = new THREE.Vector3();
    this._crackle = 0;
    // How hot the picture should look: main.js warms the grade by it.
    this.glow = 0;
  }

  get active() { return this.burns.length > 0; }

  /**
   * A canister has come down. `dir` is the way it was travelling (the run);
   * the jelly goes on that way.
   */
  splash(point, dir, def, sortie = null) {
    const N = def.strike.napalm;
    const T = this.terrain;
    const len = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / len, dz = dir.z / len;
    const gy = T.heightAt(point.x, point.z);
    const b = {
      def, sortie, N,
      a: new THREE.Vector3(point.x, gy, point.z), dx, dz,
      roll: N.roll * (0.85 + Math.random() * 0.3), hw: N.width / 2,
      front: 0, age: 0, life: N.burn * (0.9 + Math.random() * 0.2),
      seed: Math.random() * 100, acc: 0, smokeAcc: 0, plumeAcc: 0,
      killed: 0, melted: 0, roofY: point.y - gy > 3 ? point.y : null,
      flameIx: [], groundIx: [], stones: [], done: false,
    };
    this.burns.push(b);
    this._place(b);
    this._gather(b);
    // What the battle does about it once: the town along it, the flak, the
    // dumps, the cars, the smoke that hides the guns (battle.js).
    this.battle._napalmSplash?.(b, this._centre(b).clone());
    this.glow = Math.min(1.4, this.glow + 0.55);
    // The flash: the light on everything round it, once.
    const fx = this.fx;
    const L = fx._freeLight?.();
    if (L) {
      L.light.position.set(point.x + dx * 20, gy + 8, point.z + dz * 20);
      L.light.distance = 340;
      L.peak = 2600;
      L.life = 1.6;
      L.age = 0;
    }
    // The first instant: a burst of added light and sparks where it hit.
    const C = this._c;
    const nFire = this.low ? 10 : 22;
    for (let i = 0; i < nFire; i++) {
      fx.fire.spawn({
        x: point.x, y: gy + 1.5, z: point.z,
        vx: dx * (30 + Math.random() * 40) + (Math.random() - 0.5) * 18, vy: 4 + Math.random() * 10,
        vz: dz * (30 + Math.random() * 40) + (Math.random() - 0.5) * 18,
        life: 0.5 + Math.random() * 0.5, size0: 6, size1: 16 + Math.random() * 8,
        color0: C.fireHot, color1: C.fireMid, drag: 2.2, grav: -1.5, alpha: 0.9,
      });
    }
    for (let i = 0; i < (this.low ? 14 : 34); i++) {
      fx.sparks.spawn({
        x: point.x, y: gy + 1, z: point.z,
        vx: dx * (20 + Math.random() * 50) + (Math.random() - 0.5) * 40, vy: 8 + Math.random() * 22,
        vz: dz * (20 + Math.random() * 50) + (Math.random() - 0.5) * 40,
        life: 1.0 + Math.random() * 1.6, size0: 0.5, size1: 0.1,
        color0: C.spark, color1: C.sparkCold, drag: 0.5, grav: -14, alpha: 1,
      });
    }
    return b;
  }

  /** The flame cards and the ground quads along the patch, laid once. */
  _place(b) {
    const T = this.terrain, F = this.flames, G = this.ground;
    const step = this.low ? 9 : 6;
    const rows = this.low ? 2 : 3;
    const steps = Math.max(2, Math.ceil(b.roll / step) + 1);
    for (let k = 0; k < steps; k++) {
      const s = Math.min(b.roll, k * step);
      for (let r = 0; r < rows; r++) {
        const n = F.g.instanceCount;
        if (n >= F.n) break;
        const off = rows === 1 ? 0 : (r / (rows - 1) - 0.5) * 2 * b.hw * 0.62 + (Math.random() - 0.5) * 3;
        const along = s + (Math.random() - 0.5) * step * 0.8;
        const x = b.a.x + b.dx * along - b.dz * off, z = b.a.z + b.dz * along + b.dx * off;
        const y = this._yAt(b, x, z, along) - 0.4;
        F.a.aPos.setXYZ(n, x, y, z);
        // Taller in the middle of the run, where the most went down.
        const mid = 1 - Math.abs(along / Math.max(1, b.roll) - 0.4) * 0.8;
        const h = b.N.flame * (0.6 + 0.6 * Math.random()) * (0.7 + 0.5 * mid) * (r === Math.floor(rows / 2) ? 1.15 : 0.9);
        F.a.aSize.setXYZ(n, step * (1.5 + Math.random() * 0.6), h, Math.random() * 10);
        F.a.aHeat.setX(n, 0);
        b.flameIx.push({ i: n, along, h0: h });
        F.g.instanceCount = n + 1;
      }
    }
    const gstep = this.low ? 18 : 12;
    for (let s = 0; s <= b.roll; s += gstep) {
      const n = G.g.instanceCount;
      if (n >= G.n) break;
      const x = b.a.x + b.dx * s, z = b.a.z + b.dz * s;
      G.a.aPos.setXYZ(n, x, this._yAt(b, x, z, s) + 0.25, z);
      G.a.aShape.setXYZ(n, b.hw * 2.1, gstep * 1.9, Math.atan2(b.dx, b.dz));
      G.a.aShape.setW(n, Math.random() * 10);
      G.a.aHeat.setX(n, 0);
      b.groundIx.push({ i: n, along: s });
      G.g.instanceCount = n + 1;
    }
    for (const k of ['aPos', 'aSize', 'aHeat']) F.a[k].needsUpdate = true;
    for (const k of ['aPos', 'aShape', 'aHeat']) G.a[k].needsUpdate = true;
  }

  /** The height the fire stands at here: the roof it landed on near the strike, the ground otherwise. */
  _yAt(b, x, z, along) {
    const g = this.terrain.heightAt(x, z);
    return b.roofY != null && along < 12 ? Math.max(g, b.roofY) : g;
  }

  /**
   * The stones the fire can reach: inside the patch and low enough for the
   * flames to stand against. Taken once, at the splash; each keeps its own
   * heat and the colour it had, so a survivor can be put back sooted.
   */
  _gather(b) {
    const B = this.battle;
    const reach = b.roll, hw = b.hw + 2, top = b.N.flame + 3;
    for (const s of B.structures || []) {
      const idx = [];
      for (let i = 0; i < s.count; i++) {
        if (!s.isAlive(i)) continue;
        const px = s.px[i] - b.a.x, pz = s.pz[i] - b.a.z;
        const along = px * b.dx + pz * b.dz;
        if (along < -6 || along > reach + 6) continue;
        const across = Math.abs(-px * b.dz + pz * b.dx);
        if (across > hw + s.hx[i]) continue;
        const h = s.py[i] - s.hy[i] - this._yAt(b, s.px[i], s.pz[i], along);
        if (h > top || h < -4) continue;
        if (!Number.isFinite(RESIST[s.mat[i]] ?? 16)) continue;
        idx.push(i);
      }
      if (!idx.length) continue;
      const heat = new Float32Array(idx.length);
      const orig = new Float32Array(idx.length * 3);
      for (let k = 0; k < idx.length; k++) {
        const c = s.stoneTint ? s.stoneTint(idx[k]) : null;
        if (c) { orig[k * 3] = c[0]; orig[k * 3 + 1] = c[1]; orig[k * 3 + 2] = c[2]; }
      }
      b.stones.push({ s, idx, heat, orig });
    }
  }

  /** How deep in the fire a point is, 0..1, by the capsule and the front. */
  _exposure(b, x, z, h) {
    const px = x - b.a.x, pz = z - b.a.z;
    const along = px * b.dx + pz * b.dz;
    if (along < -4 || along > b.front + 4) return 0;
    const across = Math.abs(-px * b.dz + pz * b.dx);
    const e = 1 - THREE.MathUtils.smoothstep(across, b.hw * 0.55, b.hw + 1.5);
    if (e <= 0) return 0;
    const high = 1 - THREE.MathUtils.clamp(h / b.N.flame, 0, 1);
    return e * Math.pow(high, 0.7);
  }

  /** The burn's strength over its life: full while the jelly lasts, then dying. */
  _intensity(b) {
    const t = b.age / b.life;
    if (t < 0.55) return 1;
    return Math.max(0, 1 - (t - 0.55) / 0.45) ** 1.3;
  }

  update(dt) {
    this.time += dt;
    this.glow = Math.max(0, this.glow - dt * 0.18);
    const F = this.flames, G = this.ground;
    F.mat.uniforms.uTime.value = this.time;
    G.mat.uniforms.uTime.value = this.time;
    if (this.camera) F.mat.uniforms.uCam.value.copy(this.camera.position);
    if (!this.burns.length) { F.mesh.visible = G.mesh.visible = false; return; }
    F.mesh.visible = G.mesh.visible = true;
    let anyHot = false;
    for (const b of this.burns) {
      b.age += dt;
      b.front = b.roll * (1 - Math.pow(1 - Math.min(1, b.age / FRONT), 2));
      const I = this._intensity(b);
      if (I > 0.02) anyHot = true;
      // The flames: up as the front reaches them, flickering, dying with it.
      for (const f of b.flameIx) {
        const lit = THREE.MathUtils.clamp((b.front - f.along) / 8 + 0.4, 0, 1);
        const flick = 0.85 + 0.15 * Math.sin(this.time * 7 + f.i * 1.7);
        F.a.aHeat.setX(f.i, lit * I * flick * (b.age < FRONT * 1.6 ? 1.25 : 1));
      }
      for (const q of b.groundIx) {
        const lit = THREE.MathUtils.clamp((b.front - q.along) / 10 + 0.5, 0, 1);
        G.a.aHeat.setX(q.i, lit * Math.min(1, I * 1.3));
      }
      this._particles(b, dt, I);
      b.acc += dt;
      while (b.acc >= TICK && I > 0) { b.acc -= TICK; this._tick(b, TICK * I); }
      if (b.age >= b.life && !b.done) this._finish(b);
    }
    F.a.aHeat.needsUpdate = true;
    G.a.aHeat.needsUpdate = true;
    this._crackleSound(dt);
    if (this.burns.every((b) => b.done)) this._clear();
    this.hot = anyHot;
  }

  /** The rolling fireball, the black column, the embers. */
  _particles(b, dt, I) {
    const fx = this.fx, C = this._c;
    const gy = b.a.y;
    // The fireball rolls out with the front for the first second and a half:
    // big opaque puffs born burning and going to oily black, pushed on along
    // the run and up.
    if (b.age < FRONT * 1.5) {
      b.plumeAcc += dt * (this.low ? 26 : 60);
      while (b.plumeAcc >= 1) {
        b.plumeAcc -= 1;
        const s = b.front * (0.55 + Math.random() * 0.45);
        const off = (Math.random() - 0.5) * b.hw * 1.4;
        const x = b.a.x + b.dx * s - b.dz * off, z = b.a.z + b.dz * s + b.dx * off;
        const y = this._yAt(b, x, z, s);
        const fwd = 14 + Math.random() * 22;
        fx.plume.spawn({
          x, y: y + 2 + Math.random() * 5, z,
          vx: b.dx * fwd + (Math.random() - 0.5) * 6, vy: 13 + Math.random() * 17, vz: b.dz * fwd + (Math.random() - 0.5) * 6,
          life: 8 + Math.random() * 6,
          size0: 9 + Math.random() * 7, size1: 30 + Math.random() * 20,
          color0: C.hot, color1: C.burn, color2: Math.random() < 0.8 ? C.black : C.grey,
          cool: 0.1 + Math.random() * 0.1,
          drag: 1.4, grav: 5 + Math.random() * 3, turb: 3, spin: (Math.random() - 0.5) * 0.5, alpha: 0.96,
        });
      }
    }
    // The column: black, thick and rising, as long as it burns, and heaviest
    // in the first ten seconds while the jelly is fresh.
    const fresh = b.age < 10 ? 1.8 : 1;
    b.smokeAcc += dt * (this.low ? 3.2 : 6.5) * fresh * Math.max(0.15, I);
    while (b.smokeAcc >= 1) {
      b.smokeAcc -= 1;
      const s = Math.random() * b.front;
      const x = b.a.x + b.dx * s + (Math.random() - 0.5) * 6, z = b.a.z + b.dz * s + (Math.random() - 0.5) * 6;
      fx.smoke.spawn({
        x, y: this._yAt(b, x, z, s) + b.N.flame * 0.7, z,
        vx: (Math.random() - 0.5) * 2 + 1.4, vy: 11 + Math.random() * 9, vz: (Math.random() - 0.5) * 2 + 0.4,
        life: 12 + Math.random() * 7,
        size0: 8 + Math.random() * 5, size1: 32 + Math.random() * 20,
        color0: C.burn, color1: C.black, color2: C.black, cool: 0.06,
        drag: 0.5, grav: 1.6, turb: 2.4, spin: (Math.random() - 0.5) * 0.4, alpha: 0.95 * Math.max(0.35, I),
      });
    }
    // Embers going up in the heat, now and then.
    if (Math.random() < dt * (this.low ? 5 : 12) * I) {
      const s = Math.random() * b.front;
      fx.sparks.spawn({
        x: b.a.x + b.dx * s + (Math.random() - 0.5) * b.hw, y: gy + 2, z: b.a.z + b.dz * s + (Math.random() - 0.5) * b.hw,
        vx: (Math.random() - 0.5) * 3, vy: 6 + Math.random() * 9, vz: (Math.random() - 0.5) * 3,
        life: 1.5 + Math.random() * 2, size0: 0.32, size1: 0.06,
        color0: C.spark, color1: C.sparkCold, drag: 0.7, grav: -3, turb: 2, alpha: 1,
      });
    }
  }

  /** One damage pass: the men in it, and the stone heating. `w` is seconds at full heat. */
  _tick(b, w) {
    const B = this.battle, T = this.terrain;
    const G = B.garrison;
    // The garrison: nothing in the patch is in cover from jelly, and the men
    // round it are on their faces.
    if (G && G.defenders) {
      let killed = 0;
      for (const d of G.defenders) {
        if (!d.alive) continue;
        const h = d.pos.y - T.heightAt(d.pos.x, d.pos.z);
        const e = this._exposure(b, d.pos.x, d.pos.z, Math.max(0, h));
        if (e <= 0) {
          // Within twenty metres of it: heads down.
          const px = d.pos.x - b.a.x, pz = d.pos.z - b.a.z;
          const along = px * b.dx + pz * b.dz, across = Math.abs(-px * b.dz + pz * b.dx);
          if (along > -10 && along < b.front + 10 && across < b.hw + 20) d.suppressed = Math.max(d.suppressed || 0, G.time + 2.5);
          continue;
        }
        d.health -= b.N.dps * e * w;
        d.suppressed = Math.max(d.suppressed || 0, G.time + 3);
        if (d.health <= 0) { d.alive = false; killed++; }
      }
      if (killed) { b.killed += killed; B._napalmKills?.(killed, this._centre(b)); }
    }
    // The stone. Hottest at the foot of a wall where the jelly pools; each
    // material has its own patience, and a thick stone takes longer.
    let budget = this.low ? 10 : 18;
    for (const S of b.stones) {
      const s = S.s;
      let dirty = false;
      for (let k = 0; k < S.idx.length; k++) {
        const i = S.idx[k];
        if (S.heat[k] < 0 || !s.isAlive(i)) { S.heat[k] = -1; continue; }
        const along = (s.px[i] - b.a.x) * b.dx + (s.pz[i] - b.a.z) * b.dz;
        const h = Math.max(0, s.py[i] - s.hy[i] - this._yAt(b, s.px[i], s.pz[i], along));
        const e = this._exposure(b, s.px[i], s.pz[i], h);
        if (e <= 0) continue;
        const thick = Math.max(0.5, 2 * Math.min(s.hx[i], s.hy[i], s.hz[i]));
        const resist = (RESIST[s.mat[i]] ?? 16) * Math.pow(thick, 0.8) / (b.N.melt ?? 1);
        S.heat[k] += e * w / resist;
        if (S.heat[k] >= 1 && budget > 0) {
          budget--;
          S.heat[k] = -1;
          s.destroyChunk(i, 'napalm');
          b.melted++;
          continue;
        }
        // Red hot before it goes: the stone's own colour toward a glowing
        // orange, over the last half of its heat.
        if (S.heat[k] > 0.45 && s.setStoneTint) {
          const g = Math.min(1, (S.heat[k] - 0.45) / 0.55);
          const o = k * 3;
          s.setStoneTint(i, S.orig[o] * (1 - g) + 2.4 * g, S.orig[o + 1] * (1 - g) + 0.75 * g, S.orig[o + 2] * (1 - g) + 0.18 * g, true);
          dirty = true;
        }
      }
      if (dirty) s.flushTint?.();
    }
  }

  _centre(b) { return this._v.set(b.a.x + b.dx * b.roll * 0.5, b.a.y, b.a.z + b.dz * b.roll * 0.5); }

  /** Burnt out: what is left of the stone cools to soot, and the report. */
  _finish(b) {
    b.done = true;
    for (const S of b.stones) {
      const s = S.s;
      let dirty = false;
      for (let k = 0; k < S.idx.length; k++) {
        if (S.heat[k] <= 0 || !s.isAlive(S.idx[k]) || !s.setStoneTint) continue;
        const soot = 1 - 0.55 * Math.min(1, S.heat[k] * 1.4);
        const o = k * 3;
        s.setStoneTint(S.idx[k], S.orig[o] * soot, S.orig[o + 1] * soot * 0.95, S.orig[o + 2] * soot * 0.9, true);
        dirty = true;
      }
      if (dirty) s.flushTint?.();
    }
    b.stones.length = 0;
    this.battle._napalmDone?.(b);
  }

  /** Every burn out: the cards go back. */
  _clear() {
    this.burns.length = 0;
    this.flames.g.instanceCount = 0;
    this.ground.g.instanceCount = 0;
  }

  /** The crackle of it, a few cracks a second from whichever burn is nearest the ear. */
  _crackleSound(dt) {
    const A = this.audio;
    if (!A || !this.camera) return;
    this._crackle -= dt;
    if (this._crackle > 0) return;
    let best = null, bd = Infinity;
    for (const b of this.burns) {
      if (b.done) continue;
      const c = this._centre(b), d = c.distanceTo(this.camera.position);
      if (d < bd) { bd = d; best = { b, c: c.clone() }; }
    }
    if (!best) { this._crackle = 0.5; return; }
    const I = this._intensity(best.b);
    this._crackle = (0.06 + Math.random() * 0.22) / Math.max(0.3, I);
    best.c.x += (Math.random() - 0.5) * best.b.roll * 0.8;
    best.c.z += (Math.random() - 0.5) * best.b.roll * 0.8;
    crack(A, best.c, 0, (0.05 + Math.random() * 0.07) * I, 900 + Math.random() * 2600, 0.025 + Math.random() * 0.04);
  }

  /** Is this point in a fire right now? (For anything that wants to keep out of one.) */
  burningAt(x, z) {
    for (const b of this.burns) if (!b.done && this._intensity(b) > 0.2 && this._exposure(b, x, z, 0) > 0.3) return true;
    return false;
  }
}
