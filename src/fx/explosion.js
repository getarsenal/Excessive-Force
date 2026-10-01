import * as THREE from 'three';
import { BillboardParticles, makeSmokeTexture, makeSparkTexture } from './particles.js';

/**
 * Explosions, built in layers.
 *
 * A single sprite never looks like an explosion. What sells one is the order
 * things happen in: a white flash before you can see anything, a fireball that
 * expands fast and then stalls, debris that outruns the fireball, smoke that
 * keeps rising after the fire is gone, and a dust ring that runs along the
 * ground. Each layer here has its own timing curve, and they deliberately
 * overlap rather than being one animation.
 */

const FIREBALL_VERT = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uTime;
  uniform float uSeed;
  uniform float uGrow;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying float vNoise;

  // Cheap 3D value noise — enough to make the surface boil.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 p = normalize(position);

    // Two octaves rolling outward at different rates; the offset by uSeed
    // means no two blasts share a silhouette.
    float n = noise(p * 2.6 + vec3(uSeed, uSeed * 1.7, -uTime * 0.65)) * 0.62
            + noise(p * 6.1 + vec3(-uSeed, uTime * 0.9, uSeed)) * 0.28;
    vNoise = n;

    // Lumpiness relaxes as the ball expands and cools.
    float lump = mix(0.46, 0.12, clamp(uGrow, 0.0, 1.0));
    vec3 displaced = p * (1.0 + (n - 0.5) * lump);

    vPos = displaced;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const FIREBALL_FRAG = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform float uLife;     // 0..1
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying float vNoise;

  void main() {
    #include <logdepthbuf_fragment>
    // Hot core, cooler rim: the fireball is optically thick, so edges read
    // darker and sootier than the centre.
    float facing = abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
    float core = pow(clamp(facing, 0.0, 1.0), 0.85);

    float heat = clamp((1.0 - uLife * 1.15) * (0.42 + vNoise * 0.9), 0.0, 1.0);
    heat *= mix(0.55, 1.35, core);

    // Blackbody-ish ramp: white -> yellow -> orange -> deep red -> soot.
    vec3 soot   = vec3(0.055, 0.042, 0.036);
    vec3 deep   = vec3(0.52, 0.11, 0.02);
    vec3 orange = vec3(1.00, 0.33, 0.05);
    vec3 yellow = vec3(1.32, 0.82, 0.24);
    vec3 white  = vec3(1.60, 1.34, 1.00);

    vec3 col = soot;
    col = mix(col, deep,   smoothstep(0.02, 0.26, heat));
    col = mix(col, orange, smoothstep(0.18, 0.46, heat));
    col = mix(col, yellow, smoothstep(0.62, 0.88, heat));
    col = mix(col, white,  smoothstep(0.92, 1.0, heat));

    // Fade to soot rather than to nothing, so it hands off to the smoke.
    float a = (1.0 - smoothstep(0.45, 1.0, uLife)) * (0.40 + core * 0.40);
    gl_FragColor = vec4(col * uIntensity, clamp(a, 0.0, 1.0));
  }
`;

const SHOCK_VERT = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const SHOCK_FRAG = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform float uLife;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(vUv - 0.5) * 2.0;
    // A thin bright annulus that widens and softens as it travels.
    float w = mix(0.030, 0.16, uLife);
    float ring = smoothstep(1.0, 1.0 - w, r) * smoothstep(1.0 - w * 2.3, 1.0 - w, r);
    float a = ring * (1.0 - smoothstep(0.25, 1.0, uLife));
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a * 0.85);
  }
`;

class Fireball {
  constructor() {
    const geo = new THREE.IcosahedronGeometry(1, 4);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uLife: { value: 0 }, uSeed: { value: 0 },
        uGrow: { value: 0 }, uIntensity: { value: 1 },
      },
      vertexShader: FIREBALL_VERT,
      fragmentShader: FIREBALL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 12;
    this.active = false;
    this.age = 0;
    this.life = 1;
    this.radius = 1;
  }

  fire(pos, radius, life, intensity) {
    this.mesh.position.copy(pos);
    this.radius = radius;
    this.life = life;
    this.age = 0;
    this.active = true;
    this.mesh.visible = true;
    this.material.uniforms.uSeed.value = Math.random() * 100;
    this.material.uniforms.uIntensity.value = intensity;
    this.mesh.scale.setScalar(radius * 0.16);
  }

  update(dt) {
    if (!this.active) return;
    this.age += dt;
    const t = this.age / this.life;
    if (t >= 1) { this.active = false; this.mesh.visible = false; return; }

    // Fast expansion that stalls — real fireballs decelerate hard as they
    // entrain air, and a linear grow reads as a cartoon balloon.
    const grow = 1.0 - Math.pow(1.0 - t, 2.6);
    this.mesh.scale.setScalar(this.radius * (0.16 + grow * 0.92));
    // Rise slightly as it becomes buoyant.
    this.mesh.position.y += dt * this.radius * 0.32 * t;

    this.material.uniforms.uTime.value = this.age;
    this.material.uniforms.uLife.value = t;
    this.material.uniforms.uGrow.value = grow;
  }
}

class Shockwave {
  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uLife: { value: 0 }, uColor: { value: new THREE.Color(0xffb974) } },
      vertexShader: SHOCK_VERT,
      fragmentShader: SHOCK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 11;
    this.active = false;
  }

  fire(pos, radius, life) {
    this.mesh.position.copy(pos);
    this.maxRadius = radius;
    this.life = life;
    this.age = 0;
    this.active = true;
    this.mesh.visible = true;
  }

  update(dt) {
    if (!this.active) return;
    this.age += dt;
    const t = this.age / this.life;
    if (t >= 1) { this.active = false; this.mesh.visible = false; return; }
    const r = this.maxRadius * (1.0 - Math.pow(1.0 - t, 2.2));
    this.mesh.scale.set(r * 2, 1, r * 2);
    this.material.uniforms.uLife.value = t;
  }
}

export class ExplosionFX {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.time = 0;

    const smokeTex = makeSmokeTexture(quality.name === 'low' ? 64 : 128);
    const sparkTex = makeSparkTexture(64);

    // Fire and smoke are separate systems so they can use different blending:
    // fire adds light, smoke occludes it.
    this.fire = new BillboardParticles(
      Math.round(quality.maxSmokePuffs * 0.45), smokeTex,
      { blending: THREE.AdditiveBlending, emissive: 1.5, renderOrder: 13 },
    );
    this.smoke = new BillboardParticles(
      quality.maxSmokePuffs, smokeTex,
      { blending: THREE.NormalBlending, emissive: 1.0, renderOrder: 9 },
    );
    this.sparks = new BillboardParticles(
      Math.round(quality.maxDebris * 1.4), sparkTex,
      { blending: THREE.AdditiveBlending, emissive: 2.4, renderOrder: 14 },
    );
    this.dust = new BillboardParticles(
      Math.round(quality.maxSmokePuffs * 0.7), smokeTex,
      { blending: THREE.NormalBlending, emissive: 1.0, renderOrder: 8 },
    );

    // The plume of a big blast: opaque puffs that are born as fire and go
    // out to black smoke, each at its own pace, so pockets of flame burn on
    // inside a cloud already gone dark. Normal blending, not added light:
    // flame added to a sunlit scene is a pale smear, and smoke has to hide
    // what is behind it.
    this.plume = new BillboardParticles(
      Math.round(quality.maxSmokePuffs * 0.6), smokeTex,
      { blending: THREE.NormalBlending, emissive: 1.0, renderOrder: 11 },
    );
    // Clods of earth and stone thrown out of the crater, dark and heavy.
    this.clods = new BillboardParticles(
      Math.round(quality.maxSmokePuffs * 0.35), smokeTex,
      { blending: THREE.NormalBlending, emissive: 1.0, renderOrder: 10 },
    );

    for (const s of [this.smoke, this.dust, this.fire, this.sparks, this.plume, this.clods]) scene.add(s.mesh);

    // How many particles one blast may take.
    //
    // These used to be four fixed numbers — 54 fire, 70 smoke, 90 sparks, 46
    // dust — and they were low enough that a blast of any real size hit all
    // four. Measured on the air wing: a 500 lb bomb threw 48 / 66 / 78 / 46,
    // and the eleven-tonne MOAB threw 54 / 70 / 90 / 46. Twelve per cent more
    // fire, six per cent more smoke and *exactly the same* ground burst, for
    // a weapon forty times the size. Everything above a certain point looked
    // the same because above that point it was the same.
    //
    // Taken off the pool instead, they scale with what the device has agreed
    // to draw: a phone keeps roughly the old numbers, a desktop lets the big
    // one be big, and nothing can exhaust a pool and start recycling live
    // particles out from under a blast that is still going.
    /** Second beats of large blasts, waiting their turn. */
    this._rolls = [];
    const cap = (pool, frac, floor) => Math.max(floor, Math.round(pool.max * frac));
    this._caps = {
      fire: cap(this.fire, 0.34, 54),
      smoke: cap(this.smoke, 0.30, 70),
      sparks: cap(this.sparks, 0.30, 90),
      dust: cap(this.dust, 0.26, 46),
      plume: cap(this.plume, 0.4, 60),
      clods: cap(this.clods, 0.4, 40),
    };

    const ballCount = quality.name === 'low' ? 5 : quality.name === 'medium' ? 8 : 14;
    this.fireballs = Array.from({ length: ballCount }, () => {
      const f = new Fireball();
      scene.add(f.mesh);
      return f;
    });
    this.shocks = Array.from({ length: ballCount }, () => {
      const s = new Shockwave();
      scene.add(s.mesh);
      return s;
    });

    // A short-lived light per blast is what makes nearby stone flare.
    // These stay visible for the life of the scene, lit and unlit by intensity
    // alone, and that is not a detail.
    //
    // Three.js keys its shader programs on how many lights are *visible*. Turn
    // one on for a blast and off again afterwards and the count changes twice,
    // and on each change every material in the scene that takes light is
    // marked for recompile. While a program is rebuilding, what it is drawing
    // is not there — so a scene lit like this flashes black, repeatedly, at
    // exactly the moments the game is most worth looking at. Costlier shaders
    // make it worse, which is why it went from a flicker to something genuinely
    // unpleasant the moment phones stopped being handed the cheapest tier.
    //
    // An unused point light costs a few instructions per fragment. A recompiled
    // scene costs the frame. Keep the count still.
    const lightCount = quality.name === 'low' ? 2 : quality.name === 'medium' ? 4 : 7;
    this.lights = Array.from({ length: lightCount }, () => {
      const l = new THREE.PointLight(0xffb060, 0, 190, 2.0);
      l.visible = true;
      l.intensity = 0;
      scene.add(l);
      return { light: l, age: 0, life: 0, peak: 0 };
    });

    this._c = {
      fireHot: new THREE.Color(0xfff0c8),
      fireMid: new THREE.Color(0xff8a26),
      fireCold: new THREE.Color(0x421505),
      smokeDark: new THREE.Color(0x2b2620),
      smokeLight: new THREE.Color(0x8d8578),
      dust: new THREE.Color(0xa89a82),
      dustFade: new THREE.Color(0x776d5c),
      spark: new THREE.Color(0xffd08a),
      sparkCold: new THREE.Color(0x803000),
      stone: new THREE.Color(0xbcae92),
      // The plume's three stops: white-hot at the core, burning orange, and
      // the oily black a high-explosive fireball leaves.
      // Kept below the clip in the warm channels, so the fire stays orange
      // on screen instead of saturating to cream.
      plumeHot: new THREE.Color(1.35, 0.82, 0.22),
      plumeBurn: new THREE.Color(1.05, 0.36, 0.05),
      plumeBlack: new THREE.Color(0.075, 0.068, 0.062),
      plumeGrey: new THREE.Color(0.2, 0.19, 0.18),
      surge: new THREE.Color(0.64, 0.58, 0.49),
      surgeFade: new THREE.Color(0.5, 0.46, 0.4),
      clod: new THREE.Color(0.2, 0.16, 0.12),
    };
    this._v = new THREE.Vector3();
  }

  _freeFireball() { return this.fireballs.find((f) => !f.active) || null; }
  _freeShock() { return this.shocks.find((s) => !s.active) || null; }
  _freeLight() { return this.lights.find((l) => l.life <= 0) || this.lights[0]; }

  /**
   * A high-explosive detonation.
   * @param {THREE.Vector3} pos
   * @param {number} power 0.4 (AT4) .. 3.0 (HIMARS)
   * @param {object} opts { ground: boolean, normal: THREE.Vector3 }
   */
  detonate(pos, power, opts = {}) {
    const q = this.quality;
    const scale = Math.pow(power, 0.72);
    const radius = 5.2 * scale;

    const ball = this._freeFireball();
    if (ball) ball.fire(pos, radius, 0.52 + 0.2 * scale, 1.0 + scale * 0.25);

    if (opts.ground) {
      const sw = this._freeShock();
      if (sw) {
        const p = this._v.copy(pos);
        p.y = (opts.groundY ?? pos.y) + 0.6;
        sw.fire(p, radius * 4.2, 0.55 + 0.12 * scale);
      }
    }

    const lg = this._freeLight();
    lg.light.position.copy(pos);
    lg.light.distance = radius * 14;
    lg.peak = 900 * scale * scale;
    lg.life = 0.42 + 0.1 * scale;
    lg.age = 0;

    // ── Fire: a dense burst that dies within half a second.
    const fireN = Math.round(THREE.MathUtils.clamp(16 * scale, 8, this._caps.fire) * (q.name === 'low' ? 0.5 : 1));
    for (let i = 0; i < fireN; i++) {
      const dir = randomDir();
      const sp = (7 + Math.random() * 17) * scale;
      this.fire.spawn({
        x: pos.x + dir.x * radius * 0.28,
        y: pos.y + dir.y * radius * 0.28,
        z: pos.z + dir.z * radius * 0.28,
        vx: dir.x * sp, vy: dir.y * sp + 2.4 * scale, vz: dir.z * sp,
        life: 0.34 + Math.random() * 0.42,
        size0: radius * 0.34, size1: radius * (0.9 + Math.random() * 0.7),
        color0: this._c.fireHot, color1: this._c.fireMid,
        drag: 3.4, grav: 3.0, spin: (Math.random() - 0.5) * 3.2, alpha: 0.95,
      });
    }

    // ── Smoke: slower, bigger, lasts long after the fire is out.
    const smokeN = Math.round(THREE.MathUtils.clamp(22 * scale, 10, this._caps.smoke) * (q.name === 'low' ? 0.45 : 1));
    for (let i = 0; i < smokeN; i++) {
      const dir = randomDir();
      const sp = (3.5 + Math.random() * 9) * scale;
      this.smoke.spawn({
        x: pos.x + dir.x * radius * 0.35,
        y: pos.y + dir.y * radius * 0.35,
        z: pos.z + dir.z * radius * 0.35,
        vx: dir.x * sp, vy: Math.abs(dir.y) * sp * 0.7 + 4.2 * scale, vz: dir.z * sp,
        life: 2.6 + Math.random() * 3.4 * scale,
        size0: radius * 0.5, size1: radius * (2.1 + Math.random() * 1.9),
        color0: this._c.smokeDark, color1: this._c.smokeLight,
        drag: 1.15, grav: 1.5, turb: 2.4 * scale,
        spin: (Math.random() - 0.5) * 0.9, alpha: 0.72,
      });
    }

    // ── Sparks and glowing fragments, thrown further than the fireball.
    const sparkN = Math.round(THREE.MathUtils.clamp(26 * scale, 12, this._caps.sparks) * (q.name === 'low' ? 0.4 : 1));
    for (let i = 0; i < sparkN; i++) {
      const dir = randomDir();
      const sp = (16 + Math.random() * 44) * scale;
      this.sparks.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp, vy: Math.abs(dir.y) * sp * 0.8 + 6 * scale, vz: dir.z * sp,
        life: 0.7 + Math.random() * 1.5,
        size0: 0.34 * scale, size1: 0.06 * scale,
        color0: this._c.spark, color1: this._c.sparkCold,
        drag: 0.5, grav: -16.0, alpha: 1.0,
      });
    }

    if (opts.ground) this.groundBurst(pos, scale, opts.groundY ?? pos.y);

    // ── The roll.
    //
    // A big charge does not go off in one event. The first ball is the
    // detonation; a beat later the fuel and everything it threw up burn in
    // air, and that is the part that reads as enormous — slower, darker,
    // wider, rising. Without it a large blast is a small blast drawn bigger,
    // which is exactly how eleven tonnes looked next to a 500-pounder.
    //
    // Only real charges earn it. A tank round goes off once.
    if (scale > 4.0) {
      this._rolls.push({
        t: 0.19, x: pos.x, y: pos.y, z: pos.z, scale,
        ground: !!opts.ground, groundY: opts.groundY ?? pos.y,
      });
    }
  }

  /**
   * An air-dropped bomb going off.
   *
   * `detonate` is a shell: one ball, one light, a handful of sparks, and it is
   * the right event for a 105 mm round landing on a parapet. Scaling the same
   * thing up for eleven tonnes of high explosive gives a small blast drawn
   * bigger — which is what "the damage is great and the visual is awful" was
   * about. A bomb is a different *shape* of event, and it is built here out of
   * the parts that actually make it read:
   *
   *  - a white flash, over in a tenth of a second, that blows the exposure;
   *  - the ball, and then the roll a beat later, which is the fuel burning in
   *    air after the detonation and is the part that looks enormous;
   *  - a shock ring at the burst itself rather than only on the ground, because
   *    a bomb that goes off forty metres up still has one;
   *  - the base surge: a low, fast, wide ring of dust rolling *outward* along
   *    the ground, which is what gives the eye the scale of it;
   *  - ejecta — a flat spray of fragments thrown much further than the
   *    fireball, and thrown *outward and down* rather than in a sphere.
   *
   * The masonry itself is thrown by the structure, not here: real stones with
   * real bodies, so they land and stay landed. This is the part that has to
   * arrive on the same frame as the flash, before any of them have moved.
   */
  /**
   * A bomb going off.
   *
   * What a bomb looks like from a few hundred metres is not a ball of fire.
   * It is a dark, lumpy mass of smoke as wide as it is tall, thrown up in a
   * second, with fire showing in pockets inside it for a moment longer; a
   * white skirt of dust racing out along the ground under it; and clods of
   * earth and stone flung out of it in arcs that trail dirt behind them.
   * Then the column, which stands for the rest of the level.
   *
   * It used to be a smooth orange sphere — a lit dome that read as a
   * computer graphic — a flat ring on the ground like a ripple on a pond,
   * and a modest grey puff. Each part of that is replaced:
   *
   * - The plume is fifty-odd opaque puffs thrown out of the burst on a hard
   *   drag, each born white-hot, burning orange for a fraction of its life
   *   and then going out to black, at its own pace. Opaque, so the black
   *   hides the burning ones behind it and the fire shows in pockets.
   * - The surge is fast, low and pale, the way the shock lifts dust.
   * - The clods are chains of dark puffs launched together at slightly
   *   different speeds, so each spreads along its own arc into a streak.
   *
   * The flash and the light are kept; the dome and the ripple are not.
   */
  strikeBlast(pos, power, opts = {}) {
    const q = this.quality;
    const low = q.name === 'low';
    const scale = Math.pow(power, 0.72);
    const radius = 5.2 * scale;
    const groundY = opts.groundY ?? pos.y;
    const high = pos.y - groundY;
    const ground = high < radius * 2.2;
    const C = this._c;

    // ── The flash: one frame you cannot look at, and the light on the stone.
    const flash = this._freeLight();
    flash.light.position.copy(pos);
    flash.light.distance = radius * 26;
    flash.peak = 1450 * scale * scale;
    flash.life = 0.13;
    flash.age = 0;
    const core = this._freeFireball();
    if (core) core.fire(pos, radius * 0.45, 0.1, 1.6);

    // ── The plume.
    const plumeN = Math.round(THREE.MathUtils.clamp(16 * scale, 40, this._caps.plume) * (low ? 0.6 : 1));
    // Two kinds of puff, drawn in this order. The core burns: smaller and
    // slower, kept inside, holding its fire for two or three seconds. The
    // shell goes black almost at once and is drawn over the core, so the
    // fire shows only where the shell is ragged — pockets of flame in a dark
    // mass, which is what the photographs show, and not the reverse (a black
    // heart in an orange halo), which is what random order drew.
    const coreN = Math.round(plumeN * 0.3);
    for (let i = 0; i < plumeN; i++) {
      const inner = i < coreN;
      const dir = randomDir();
      // A ground burst throws up and out, not down into the earth, and more
      // up than out: the mass stands taller than it is wide.
      if (ground) { dir.y = Math.abs(dir.y) * 1.3 + 0.25; dir.x *= 0.8; dir.z *= 0.8; }
      const sp = (inner ? 6 + Math.random() * 12 : 14 + Math.random() * 30) * Math.sqrt(scale);
      this.plume.spawn({
        x: pos.x + dir.x * radius * (inner ? 0.4 : 0.9) * Math.random(),
        y: pos.y + Math.abs(dir.y) * radius * (inner ? 0.4 : 0.9) * Math.random(),
        z: pos.z + dir.z * radius * (inner ? 0.4 : 0.9) * Math.random(),
        vx: dir.x * sp, vy: dir.y * sp + (inner ? 18 : 22) * Math.sqrt(scale), vz: dir.z * sp,
        life: 9 + Math.random() * 6,
        size0: radius * (inner ? 1.2 + Math.random() * 0.5 : 1.8 + Math.random() * 0.8),
        size1: radius * (inner ? 2.6 + Math.random() * 1.0 : 4.2 + Math.random() * 1.8),
        color0: C.plumeHot, color1: C.plumeBurn, color2: Math.random() < 0.75 ? C.plumeBlack : C.plumeGrey,
        cool: inner ? 0.2 + Math.random() * 0.14 : 0.03 + Math.random() * 0.05,
        drag: 2.0 + Math.random() * 0.6, grav: 5.0 + Math.random() * 4.0, turb: 2.0 * scale,
        spin: (Math.random() - 0.5) * 0.4, alpha: 0.97,
      });
    }

    // ── A little added light in the first instant, for the heat.
    const fireN = Math.round(THREE.MathUtils.clamp(10 * scale, 10, this._caps.fire * 0.5) * (low ? 0.5 : 1));
    for (let i = 0; i < fireN; i++) {
      const dir = randomDir();
      const sp = (10 + Math.random() * 20) * Math.sqrt(scale);
      this.fire.spawn({
        x: pos.x, y: pos.y + radius * 0.2, z: pos.z,
        vx: dir.x * sp, vy: Math.abs(dir.y) * sp + 3 * scale, vz: dir.z * sp,
        life: 0.25 + Math.random() * 0.35,
        size0: radius * 0.5, size1: radius * (1.1 + Math.random() * 0.6),
        color0: C.fireHot, color1: C.fireMid,
        drag: 3.0, grav: 1.0, alpha: 0.85,
      });
    }

    // ── Hot fragments: a few, fast, in a flat disc.
    const fragN = Math.round(THREE.MathUtils.clamp(30 * scale, 24, this._caps.sparks * 0.6) * (low ? 0.45 : 1));
    for (let i = 0; i < fragN; i++) {
      const a = Math.random() * Math.PI * 2;
      const rise = Math.pow(Math.random(), 1.8) * 0.9 + 0.08;
      const sp = (40 + Math.random() * 80) * Math.sqrt(scale);
      this.sparks.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp, vy: rise * sp * 0.8, vz: Math.sin(a) * sp,
        life: 0.8 + Math.random() * 1.6,
        size0: 0.45 * scale, size1: 0.08 * scale,
        color0: C.spark, color1: C.sparkCold,
        drag: 0.35, grav: -19.0, alpha: 1.0,
      });
    }

    // ── Clods: chains of dark puffs on the same heading at slightly
    // different speeds, so each spreads along its arc into a streak of dirt.
    const jets = Math.round(THREE.MathUtils.clamp(5 + scale * 2.5, 6, 18) * (low ? 0.6 : 1));
    const chain = low ? 5 : 9;
    for (let j = 0; j < jets; j++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.45 + Math.random() * 0.75;
      const sp = (32 + Math.random() * 36) * Math.sqrt(scale);
      const hx = Math.cos(a), hz = Math.sin(a);
      for (let k = 0; k < chain && this.clods.count < this.clods.max; k++) {
        const f = 1 - k * 0.075;
        this.clods.spawn({
          x: pos.x + hx * radius * 0.2, y: pos.y + radius * 0.1, z: pos.z + hz * radius * 0.2,
          vx: hx * sp * f, vy: up * sp * f, vz: hz * sp * f,
          life: 2.6 + Math.random() * 1.2,
          size0: radius * (0.22 - k * 0.014), size1: radius * (0.7 + k * 0.06),
          color0: C.clod, color1: C.dustFade,
          drag: 0.25 + k * 0.05, grav: -15, alpha: 0.9 - k * 0.07,
        });
      }
    }

    // ── The surge: pale, low and fast.
    if (ground) {
      const surgeN = Math.round(THREE.MathUtils.clamp(26 * scale, 36, this._caps.dust) * (low ? 0.5 : 1));
      for (let i = 0; i < surgeN; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (30 + Math.random() * 50) * Math.sqrt(scale);
        this.dust.spawn({
          x: pos.x + Math.cos(a) * radius * 0.5,
          y: groundY + 0.5 + Math.random() * 1.0,
          z: pos.z + Math.sin(a) * radius * 0.5,
          vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * 2.0, vz: Math.sin(a) * sp,
          life: 3.0 + Math.random() * 3.0,
          size0: radius * 1.3, size1: radius * (2.8 + Math.random() * 1.0),
          color0: C.surge, color1: C.surgeFade,
          drag: 2.3, grav: 0.3, turb: 1.4,
          spin: (Math.random() - 0.5) * 0.5, alpha: 0.3,
        });
      }
    }

    // ── The column, rising out of the plume: the second beat.
    this._rolls.push({ t: 0.5, x: pos.x, y: pos.y, z: pos.z, scale: scale * 1.1, ground, groundY });
  }

  /** The second beat of a large blast: the column rising out of the plume. */
  _roll(r) {
    const q = this.quality;
    const scale = r.scale;
    const radius = 5.2 * scale;
    const pos = this._v.set(r.x, r.y + radius * 0.6, r.z);
    const C = this._c;

    const lg = this._freeLight();
    lg.light.position.copy(pos);
    lg.light.distance = radius * 14;
    lg.peak = 380 * scale * scale;
    lg.life = 0.9;
    lg.age = 0;

    // Dark, slow and buoyant: the head of the column, still burning low
    // down for a moment. In the smoke layer, which is drawn before the
    // plume: spawned half a second after it and drawn on top, it put a black
    // heart in the middle of the fireball.
    const n = Math.round(THREE.MathUtils.clamp(10 * scale, 12, this._caps.smoke * 0.5)
      * (q.name === 'low' ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const dir = randomDir();
      const sp = (3 + Math.random() * 6) * Math.sqrt(scale);
      const burning = Math.random() < 0.35;
      this.smoke.spawn({
        x: pos.x + dir.x * radius * 0.6,
        y: pos.y + Math.abs(dir.y) * radius * 0.6,
        z: pos.z + dir.z * radius * 0.6,
        vx: dir.x * sp, vy: Math.abs(dir.y) * sp * 0.5 + 6.5 * Math.sqrt(scale) * 1.6, vz: dir.z * sp,
        life: 7 + Math.random() * 6,
        size0: radius * 0.9, size1: radius * (2.4 + Math.random() * 1.6),
        color0: burning ? C.plumeBurn : C.plumeBlack, color1: C.plumeBlack,
        color2: Math.random() < 0.5 ? C.plumeGrey : C.smokeLight,
        cool: burning ? 0.06 : 0.3,
        drag: 0.9, grav: 1.4, turb: 3.0 * scale,
        spin: (Math.random() - 0.5) * 0.5, alpha: 0.9,
      });
    }
  }

  /** Dust running outward along the ground at the base of a blast. */
  groundBurst(pos, scale, groundY) {
    const n = Math.round(THREE.MathUtils.clamp(18 * scale, 8, this._caps.dust) * (this.quality.name === 'low' ? 0.45 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (9 + Math.random() * 20) * scale;
      this.dust.spawn({
        x: pos.x, y: groundY + 0.5 + Math.random() * 1.2, z: pos.z,
        vx: Math.cos(a) * sp, vy: 1.4 + Math.random() * 3.0, vz: Math.sin(a) * sp,
        life: 2.2 + Math.random() * 2.8,
        size0: 1.6 * scale, size1: (9 + Math.random() * 9) * scale,
        color0: this._c.dust, color1: this._c.dustFade,
        drag: 1.5, grav: 0.4, turb: 1.2,
        spin: (Math.random() - 0.5) * 0.6, alpha: 0.55,
      });
    }
  }

  /**
   * Pulverised masonry. Called for every stone the structure destroys, so it
   * has to stay cheap — this is the difference between a hole appearing and a
   * hole *bursting*.
   */
  stoneBurst(x, y, z, size, colorHint) {
    const c = colorHint || this._c.stone;
    const n = size > 1.2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const dir = randomDir();
      const sp = 4 + Math.random() * 11;
      this.dust.spawn({
        x, y, z,
        vx: dir.x * sp, vy: Math.abs(dir.y) * sp * 0.6 + 2.0, vz: dir.z * sp,
        life: 1.1 + Math.random() * 1.7,
        size0: size * 0.8, size1: size * (3.2 + Math.random() * 2.6),
        color0: c, color1: this._c.dustFade,
        drag: 1.9, grav: -1.1, turb: 0.7,
        spin: (Math.random() - 0.5) * 1.4, alpha: 0.5,
      });
    }
  }

  /** Dust kicked up where a heavy section slams into the ground. */
  impactDust(x, y, z, energy) {
    const scale = THREE.MathUtils.clamp(energy, 0.4, 4.0);
    const n = Math.round(6 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (6 + Math.random() * 16) * scale;
      this.dust.spawn({
        x, y: y + 0.4, z,
        vx: Math.cos(a) * sp, vy: 2.2 + Math.random() * 4.5, vz: Math.sin(a) * sp,
        life: 2.0 + Math.random() * 2.6,
        size0: 1.4 * scale, size1: (7 + Math.random() * 8) * scale,
        color0: this._c.dust, color1: this._c.dustFade,
        drag: 1.6, grav: 0.5, turb: 1.0, alpha: 0.5,
      });
    }
  }

  /**
   * The column that stands over a collapse.
   *
   * A building coming down throws a plume that keeps rising for half a minute
   * after the noise stops and then leans over and drifts — and it is the single
   * most recognisable thing about the event. The impact dust above is the right
   * shape for a section hitting the ground and much too short-lived for this: it
   * is gone in three seconds, so the aftermath of a ninety-metre tower looked
   * like the aftermath of a dropped brick.
   *
   * Slow, large, long-lived particles with almost no gravity and a steady drift,
   * seeded up a vertical line so the column has height from the moment it
   * appears rather than growing out of a puddle.
   */
  dustColumn(x, y, z, strength = 1) {
    // The ceiling was four, which a collapse and a 500 lb bomb and eleven
    // tonnes of MOAB all reached, so all three stood the same column. Six now,
    // and the particle count is held to the device's own dust budget rather
    // than growing without limit.
    const s = THREE.MathUtils.clamp(strength, 0.5, 6);
    const n = Math.min(Math.round(26 * s), Math.round(this.dust.max * 0.34));
    const wind = 0.6 + Math.random() * 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = Math.random() * Math.PI * 2;
      const r = (2 + Math.random() * 9) * s * (0.4 + t);
      this.dust.spawn({
        x: x + Math.cos(a) * r,
        y: y + t * 26 * s + Math.random() * 6,
        z: z + Math.sin(a) * r,
        vx: Math.cos(a) * (1.2 + Math.random() * 2.4) + wind * 3.4,
        vy: 3.4 + Math.random() * 5.5 * s,
        vz: Math.sin(a) * (1.2 + Math.random() * 2.4) + wind * 1.1,
        life: 11 + Math.random() * 13,
        size0: 6 * s, size1: (26 + Math.random() * 26) * s,
        color0: this._c.dust, color1: this._c.dustFade,
        drag: 0.32, grav: -0.05, turb: 0.5, alpha: 0.34,
      });
    }
  }

  /** Muzzle flash for a firing gun. */
  muzzleFlash(pos, dir, power) {
    const scale = Math.pow(power, 0.5);
    const lg = this._freeLight();
    lg.light.position.copy(pos);
    lg.light.distance = 60 * scale;
    lg.peak = 300 * scale;
    lg.life = 0.1;
    lg.age = 0;

    for (let i = 0; i < Math.round(7 * scale); i++) {
      const d = randomDir();
      const sp = 14 + Math.random() * 26;
      this.fire.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp * 1.7 + d.x * sp * 0.45,
        vy: dir.y * sp * 1.7 + d.y * sp * 0.45,
        vz: dir.z * sp * 1.7 + d.z * sp * 0.45,
        life: 0.11 + Math.random() * 0.14,
        size0: 1.3 * scale, size1: 3.4 * scale,
        color0: this._c.fireHot, color1: this._c.fireMid,
        drag: 5.0, grav: 0, alpha: 0.95,
      });
    }
    for (let i = 0; i < Math.round(5 * scale); i++) {
      const d = randomDir();
      const sp = 6 + Math.random() * 12;
      this.smoke.spawn({
        x: pos.x + dir.x * 2, y: pos.y, z: pos.z + dir.z * 2,
        vx: dir.x * sp + d.x * 3, vy: 1.5 + Math.random() * 2, vz: dir.z * sp + d.z * 3,
        life: 1.3 + Math.random() * 1.4,
        size0: 1.2 * scale, size1: 6.5 * scale,
        color0: this._c.smokeLight, color1: this._c.smokeLight,
        drag: 1.9, grav: 0.7, turb: 1.0, alpha: 0.34,
      });
    }
  }

  /** Thin smoke trail behind a shell in flight. */
  trail(pos, scale = 1) {
    this.smoke.spawn({
      x: pos.x, y: pos.y, z: pos.z,
      vx: 0, vy: 0.9, vz: 0,
      life: 0.9 + Math.random() * 1.0,
      size0: 0.55 * scale, size1: 3.4 * scale,
      color0: this._c.smokeLight, color1: this._c.smokeLight,
      drag: 1.0, grav: 0.35, turb: 0.5, alpha: 0.26,
    });
  }

  update(dt) {
    this.time += dt;
    // The second beat of any large blast that is due.
    for (let i = this._rolls.length - 1; i >= 0; i--) {
      const r = this._rolls[i];
      r.t -= dt;
      if (r.t <= 0) { this._rolls.splice(i, 1); this._roll(r); }
    }
    for (const f of this.fireballs) f.update(dt);
    for (const s of this.shocks) s.update(dt);

    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.age += dt;
      const t = l.age / l.life;
      if (t >= 1) { l.life = 0; l.light.intensity = 0; continue; }
      // Sharp attack, exponential decay — the flash is over before the eye
      // resolves it, which is exactly right.
      l.light.intensity = l.peak * Math.pow(1 - t, 3.0) * (t < 0.06 ? t / 0.06 : 1);
    }

    this.fire.update(dt, this.time);
    this.smoke.update(dt, this.time);
    this.sparks.update(dt, this.time);
    this.dust.update(dt, this.time);
    this.plume.update(dt, this.time);
    this.clods.update(dt, this.time);
  }
}

function randomDir() {
  // Uniform on the sphere.
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return { x: Math.cos(a) * r, y: u, z: Math.sin(a) * r };
}
