import * as THREE from 'three';
import { BillboardParticles } from './particles.js';

/**
 * The small things the fight does that are not the fight.
 *
 * Marker smoke billowing off the spot an aircraft has been sent to; flares
 * kicked out of an aircraft that is taking fire, each a white star on a
 * curling smoke trail; vapour pulled off a jet's wings in its pull-up. None
 * of it decides anything and all of it is the difference between a game
 * about artillery and a picture of a war.
 *
 * Everything here draws through the explosion module's own particle systems
 * — one more emitter on a pool that is already drawn costs nothing in draw
 * calls — and steps itself from ExplosionFX.update, so the held clock of the
 * harness and the slow-motion beat take it with everything else. Emitters
 * are short lists of plain objects; none of it allocates per frame.
 */
export class Flourish {
  /** @param {import('./explosion.js').ExplosionFX} fx */
  constructor(fx) {
    this.fx = fx;
    this.low = fx.quality.name === 'low';
    this.markers = [];
    this.cookoffs = [];
    this.rockets = [];
    this.mushrooms = [];
    this.wilsons = [];
    /** Things to do in a moment, on the effects' own clock. */
    this._later = [];
    this.flareList = [];
    this._c = {
      // Coloured marking smoke: the canisters are red, violet and yellow,
      // and a strike gets the next one along so two in the air are told apart.
      marks: [new THREE.Color(0xd8352a), new THREE.Color(0x9b4ad8), new THREE.Color(0xe8c030)],
      markFade: new THREE.Color(0xb0a8a0),
      flare: new THREE.Color(1.6, 1.45, 1.1),
      flareCold: new THREE.Color(1.0, 0.55, 0.2),
      flareSmoke: new THREE.Color(0xe6e4e0),
      flareSmokeFade: new THREE.Color(0xbdbab4),
      vapour: new THREE.Color(0xf4f6f8),
    };
    this._mark = 0;
    this._c.glass = new THREE.Color(1.4, 1.55, 1.7);
    this._c.glassFade = new THREE.Color(0.5, 0.6, 0.7);
    this._c.paper = new THREE.Color(0.95, 0.94, 0.9);
    this._c.water = new THREE.Color(0.96, 0.98, 1.0);
    this._c.waterFade = new THREE.Color(0.78, 0.83, 0.86);
    this._c.ring = new THREE.Color(0.82, 0.8, 0.76);
    this._c.ground = new THREE.Color(0.66, 0.6, 0.5);
    this._c.groundFade = new THREE.Color(0.55, 0.5, 0.43);
    this._c.surge = new THREE.Color(0.52, 0.48, 0.42);
    this._c.surgeFade = new THREE.Color(0.47, 0.44, 0.4);
    this._c.tracer = new THREE.Color(1.6, 0.9, 0.35);
    this._c.works = [new THREE.Color(1.7, 0.3, 0.25), new THREE.Color(1.6, 1.6, 1.6), new THREE.Color(0.35, 0.6, 1.8),
      new THREE.Color(1.7, 1.25, 0.3), new THREE.Color(0.4, 1.6, 0.55), new THREE.Color(1.5, 0.45, 1.6)];
    this._c.mushDark = new THREE.Color(0.24, 0.2, 0.17);
    this._c.mushLit = new THREE.Color(1.15, 0.5, 0.14);
    this._c.mushGrey = new THREE.Color(0.46, 0.42, 0.38);
    this._c.paperSoot = new THREE.Color(0.55, 0.52, 0.48);
    // Paper is its own pool: a sheet is a small hard-edged rectangle, not a
    // puff, and there can be a few hundred of them in the air at once.
    this.paper = new BillboardParticles(this.low ? 220 : 640, paperTexture(),
      { blending: THREE.NormalBlending, emissive: 1.0, renderOrder: 12 });
    fx.scene.add(this.paper.mesh);
  }

  /**
   * The windows go. A gutted building throws its glass out of every face:
   * a glittering shower off each wall, falling fast and catching the sun.
   */
  glass(p, k = 1) {
    const fx = this.fx;
    const n = Math.round((this.low ? 12 : 30) * k);
    const ca = Math.cos(p.yaw || 0), sa = Math.sin(p.yaw || 0);
    const H = Math.min(p.h, 60);
    for (let i = 0; i < n; i++) {
      // A point on one of the four faces, and out from it.
      const side = i % 4;
      const u = (Math.random() - 0.5);
      let lx, lz, nx, nz;
      if (side < 2) { lx = u * p.w; lz = (side ? 1 : -1) * p.d / 2; nx = 0; nz = side ? 1 : -1; }
      else { lz = u * p.d; lx = (side === 3 ? 1 : -1) * p.w / 2; nz = 0; nx = side === 3 ? 1 : -1; }
      const x = p.x + lx * ca + lz * sa, z = p.z - lx * sa + lz * ca;
      const wx = nx * ca + nz * sa, wz = -nx * sa + nz * ca;
      const sp = 4 + Math.random() * 9;
      fx.sparks.spawn({
        x, y: p.base + 2 + Math.random() * H * 0.9, z,
        vx: wx * sp + (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 4, vz: wz * sp + (Math.random() - 0.5) * 3,
        life: 1.2 + Math.random() * 1.3, size0: 0.55, size1: 0.25,
        color0: this._c.glass, color1: this._c.glassFade,
        drag: 0.4, grav: -14, alpha: 0.95, spin: (Math.random() - 0.5) * 20,
      });
    }
  }

  /**
   * And the paper. Every office in the town goes up the same way: the heat
   * lifts its paper out through the windows and it comes down for a minute
   * afterwards over the street, tumbling, half of it charred.
   */
  paperSnow(x, y, z, spread = 20, n = 30) {
    if (this.low) n = Math.round(n * 0.4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      const sooty = Math.random() < 0.45;
      this.paper.spawn({
        x: x + Math.cos(a) * r, y: y + Math.random() * spread * 0.4, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * (1 + Math.random() * 3) + 1.5, vy: 5 + Math.random() * 9, vz: Math.sin(a) * (1 + Math.random() * 3) + 0.5,
        life: 14 + Math.random() * 12,
        size0: 0.55 + Math.random() * 0.35, size1: 0.5,
        color0: sooty ? this._c.paperSoot : this._c.paper, color1: sooty ? this._c.paperSoot : this._c.paper,
        drag: 1.1, grav: -1.1, turb: 2.4, alpha: 1,
        spin: (Math.random() - 0.5) * 7,
      });
    }
  }

  /**
   * A smoke canister at the aim point: a dense coloured plume rising and
   * leaning downwind until the strike arrives, and a while after.
   */
  markerSmoke(point, life = 20) {
    const colour = this._c.marks[this._mark++ % this._c.marks.length];
    // Never more than three: the oldest is put out.
    if (this.markers.length >= 3) this.markers.shift();
    this.markers.push({ x: point.x, y: point.y + 0.4, z: point.z, t: 0, life, acc: 0, colour });
  }

  _stepMarkers(dt) {
    const fx = this.fx, rate = this.low ? 0.16 : 0.08;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t += dt;
      if (m.t > m.life) { this.markers.splice(i, 1); continue; }
      // Thicker at first, as a canister is, and thinning to a wisp.
      const k = 1 - Math.max(0, (m.t - m.life * 0.6) / (m.life * 0.4));
      m.acc += dt;
      while (m.acc > rate) {
        m.acc -= rate;
        fx.smoke.spawn({
          x: m.x + (Math.random() - 0.5) * 0.8, y: m.y, z: m.z + (Math.random() - 0.5) * 0.8,
          vx: 1.2 + Math.random() * 1.6, vy: 4.5 + Math.random() * 3.5, vz: 0.4 + (Math.random() - 0.5) * 1.4,
          life: 5 + Math.random() * 4,
          size0: 1.4, size1: 10 + Math.random() * 8,
          color0: m.colour, color1: this._c.markFade,
          drag: 0.55, grav: -0.35, turb: 1.4, alpha: 0.82 * k,
          spin: (Math.random() - 0.5) * 0.8,
        });
      }
      // The canister itself fizzes.
      if (Math.random() < 0.5) {
        fx.sparks.spawn({
          x: m.x, y: m.y, z: m.z,
          vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 4,
          life: 0.18, size0: 0.9, size1: 0.3,
          color0: m.colour, color1: m.colour, drag: 2, grav: -6, alpha: 0.9,
        });
      }
    }
  }

  /**
   * Flares out of an aircraft that is being shot at: `n` stars thrown out to
   * either side and down, each burning white-hot on a smoke trail that hangs
   * in the air behind it — from below, the angel's wings.
   */
  flares(pos, dir, speed = 120, n = 8) {
    if (this.low) n = Math.min(n, 4);
    if (this.flareList.length > 24) return;
    const side = { x: -dir.z, z: dir.x };
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      const out = 18 + Math.random() * 22;
      this.flareList.push({
        x: pos.x - dir.x * 4, y: pos.y - 1.5, z: pos.z - dir.z * 4,
        vx: dir.x * speed * 0.3 + side.x * s * out, vy: -3 - Math.random() * 7 + i * 0.6,
        vz: dir.z * speed * 0.3 + side.z * s * out,
        t: -i * 0.09, life: 3.4 + Math.random() * 1.2, acc: 0,
      });
    }
  }

  _stepFlares(dt) {
    const fx = this.fx, rate = this.low ? 0.11 : 0.06;
    for (let i = this.flareList.length - 1; i >= 0; i--) {
      const f = this.flareList[i];
      f.t += dt;
      if (f.t < 0) continue;      // still in the dispenser
      if (f.t > f.life) { this.flareList.splice(i, 1); continue; }
      const d = Math.exp(-0.9 * dt);
      f.vx *= d; f.vz *= d; f.vy = f.vy * d - 7 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const k = 1 - f.t / f.life;
      // The star: re-lit every frame, so it reads as one hard point.
      fx.sparks.spawn({
        x: f.x, y: f.y, z: f.z, life: 0.07,
        size0: 2.2 + 2.4 * k, size1: 1.6 + 1.6 * k,
        color0: this._c.flare, color1: this._c.flareCold, drag: 0, grav: 0, alpha: 1,
      });
      f.acc += dt;
      while (f.acc > rate) {
        f.acc -= rate;
        fx.smoke.spawn({
          x: f.x, y: f.y, z: f.z,
          vx: 0, vy: 0.3, vz: 0,
          life: 3.6 + Math.random() * 2.4,
          size0: 0.9, size1: 5.5 + Math.random() * 3,
          color0: this._c.flareSmoke, color1: this._c.flareSmokeFade,
          drag: 0.6, grav: 0.1, turb: 0.5, alpha: 0.5 * (0.4 + 0.6 * k),
        });
      }
    }
  }

  /**
   * Vapour off the wings: a jet pulling hard in damp air condenses the low
   * pressure over its wing into a sheet of white that it leaves behind.
   * Called each frame of the pull-up with the wingtips' span.
   */
  vapour(pos, dir, span = 7, k = 1) {
    if (this.low) return;
    const fx = this.fx;
    const sx = -dir.z, sz = dir.x;
    for (let j = 0; j < 4; j++) {
      const u = (Math.random() * 2 - 1) * span;
      fx.smoke.spawn({
        x: pos.x + sx * u, y: pos.y + 0.6 + Math.random() * 0.6, z: pos.z + sz * u,
        vx: 0, vy: 0, vz: 0,
        life: 0.35 + Math.random() * 0.3,
        size0: 1.4, size1: 3.2,
        color0: this._c.vapour, color1: this._c.vapour,
        drag: 3, grav: 0, alpha: 0.55 * k,
      });
    }
  }

  /**
   * A round into the river: no fireball, a column of white water standing
   * up out of it as tall as the charge can throw it, collapsing back into a
   * ring of spray running out across the surface.
   */
  waterPlume(x, y, z, power = 1) {
    const fx = this.fx, k = Math.pow(Math.max(0.2, power), 0.6);
    const n = Math.round((this.low ? 18 : 40) * Math.min(2.2, k));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6 * k;
      const up = (14 + Math.random() * 26) * k;
      fx.dust.spawn({
        x: x + Math.cos(a) * r, y: y + 0.3, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * (1 + Math.random() * 3) * k, vy: up, vz: Math.sin(a) * (1 + Math.random() * 3) * k,
        life: 1.8 + Math.random() * 1.6,
        size0: 1.2 * k, size1: (5 + Math.random() * 5) * k,
        color0: this._c.water, color1: this._c.waterFade,
        drag: 0.6, grav: -16, turb: 0.4, alpha: 0.85,
      });
    }
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = (8 + Math.random() * 10) * k;
      fx.dust.spawn({
        x, y: y + 0.4, z,
        vx: Math.cos(a) * sp, vy: 1 + Math.random() * 2, vz: Math.sin(a) * sp,
        life: 2.4 + Math.random() * 1.6,
        size0: 1.5 * k, size1: (6 + Math.random() * 6) * k,
        color0: this._c.water, color1: this._c.waterFade,
        drag: 1.4, grav: 0.2, turb: 0.6, alpha: 0.45,
      });
    }
  }

  /**
   * The ground in front of a heavy gun when it fires: the blast flattens the
   * grass and throws the dust off it in a fan, forward of the muzzle.
   */
  muzzleDust(pos, dir, groundY, power = 1) {
    if (this.low || pos.y - groundY > 6) return;
    const fx = this.fx, k = Math.min(2.4, Math.pow(power, 0.7));
    const n = Math.round(10 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * 2.4;
      const sp = (6 + Math.random() * 12) * k;
      fx.dust.spawn({
        x: pos.x + dir.x * 2, y: groundY + 0.4, z: pos.z + dir.z * 2,
        vx: Math.sin(a) * sp, vy: 0.6 + Math.random() * 1.6, vz: Math.cos(a) * sp,
        life: 1.6 + Math.random() * 1.4,
        size0: 1.2 * k, size1: (4 + Math.random() * 4) * k,
        color0: this._c.ground, color1: this._c.groundFade,
        drag: 1.8, grav: 0.3, turb: 0.8, alpha: 0.42,
      });
    }
  }

  /**
   * A smoke ring. Big guns blow one now and then — the propellant gas
   * leaving the muzzle as a vortex — and it drifts off along the line of
   * fire, widening and thinning.
   */
  smokeRing(pos, dir, power = 1) {
    const fx = this.fx, k = Math.min(2, Math.pow(power, 0.5));
    // Two axes across the line of fire.
    const ax = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(ax);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(ax, u).normalize();
    const n = this.low ? 14 : 24, R = 1.1 * k;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const ox = (u.x * c + v.x * s), oy = (u.y * c + v.y * s), oz = (u.z * c + v.z * s);
      fx.smoke.spawn({
        x: pos.x + ax.x * 3 + ox * R, y: pos.y + ax.y * 3 + oy * R, z: pos.z + ax.z * 3 + oz * R,
        vx: ax.x * 9 + ox * 2.2, vy: ax.y * 9 + oy * 2.2 + 0.4, vz: ax.z * 9 + oz * 2.2,
        life: 3.2 + Math.random() * 0.6,
        size0: 0.9 * k, size1: 2.6 * k,
        color0: this._c.ring, color1: this._c.ring,
        drag: 0.75, grav: 0.05, turb: 0.1, alpha: 0.6, spin: 0,
      });
    }
  }

  /**
   * An ammunition dump that has gone up keeps going: rounds cooking off in
   * the fire for several seconds, each a pop and a streak thrown off in a
   * random direction, the gaps between them getting longer.
   */
  cookOff(x, y, z, secs = 8, audio = null, crack = null) {
    if (this.cookoffs.length > 6) return;
    this.cookoffs.push({ x, y, z, t: 0, secs, next: 0.4, audio, crack });
  }

  _stepCookoffs(dt) {
    const fx = this.fx;
    for (let i = this.cookoffs.length - 1; i >= 0; i--) {
      const c = this.cookoffs[i];
      c.t += dt;
      if (c.t > c.secs) { this.cookoffs.splice(i, 1); continue; }
      c.next -= dt;
      if (c.next > 0) continue;
      const late = c.t / c.secs;
      c.next = 0.08 + Math.random() * (0.25 + late * 0.9);
      // The pop.
      fx.sparks.spawn({ x: c.x, y: c.y + 0.5, z: c.z, life: 0.16, size0: 4.2, size1: 1.0,
        color0: this._c.flare, color1: this._c.tracer, drag: 0, grav: 0, alpha: 1 });
      // And what it throws: a streak or two off in any direction.
      const m = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < m; j++) {
        const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.1, sp = 25 + Math.random() * 45;
        fx.sparks.spawn({
          x: c.x, y: c.y + 0.5, z: c.z,
          vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp,
          life: 0.6 + Math.random() * 0.8, size0: 1.5, size1: 0.6,
          color0: this._c.tracer, color1: this._c.tracer, drag: 0.5, grav: -9.8, alpha: 1,
        });
      }
      if (Math.random() < 0.5) {
        fx.smoke.spawn({ x: c.x, y: c.y + 1, z: c.z, vx: 0, vy: 2, vz: 0, life: 2.5, size0: 1.5, size1: 6,
          color0: this.fx._c.smokeDark, color1: this.fx._c.smokeLight, drag: 0.8, grav: 0.4, turb: 0.8, alpha: 0.5 });
      }
      if (c.audio && c.crack) c.crack(c.audio, { x: c.x, y: c.y, z: c.z }, 0, 0.35, 1400 + Math.random() * 1600, 0.07);
    }
  }

  /**
   * When a big section lands: the dust it drives out along the ground, a
   * wall of it rolling out down the streets for a hundred metres and more,
   * slowing and rising as it goes, and hanging over everything after.
   */
  surge(x, groundY, z, strength = 1) {
    const fx = this.fx, k = Math.max(0.6, Math.min(3, strength));
    const n = Math.min(Math.round((this.low ? 30 : 80) * k), Math.round(fx.dust.max * 0.32));
    // Three rings at three speeds, so it is a wall with depth rather than
    // one thin hoop of puffs: the front, the body and the slow heart.
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const band = i % 3;
      const sp = (band === 0 ? 30 : band === 1 ? 19 : 9) * (0.85 + Math.random() * 0.3) * k;
      fx.dust.spawn({
        x: x + Math.cos(a) * 5 * k, y: groundY + 2 + Math.random() * 3 * k, z: z + Math.sin(a) * 5 * k,
        vx: Math.cos(a) * sp, vy: 0.6 + Math.random() * 1.8 + band * 0.6, vz: Math.sin(a) * sp,
        life: 10 + Math.random() * 8,
        size0: 9 * k, size1: (30 + Math.random() * 20) * k,
        color0: this._c.surge, color1: this._c.surgeFade,
        drag: 0.5, grav: 0.12, turb: 1.0, alpha: 0.62,
        spin: (Math.random() - 0.5) * 0.25,
      });
    }
  }

  /**
   * A firework: a rocket on a hissing spark trail up to `h` metres, and a
   * break of coloured stars falling and fading under gravity. For when the
   * landmark is down and the battery wants to say so.
   */
  firework(x, y, z, h = 110, audio = null, sound = null) {
    if (this.rockets.length > 20) return;
    const colour = this._c.works[Math.floor(Math.random() * this._c.works.length)];
    const colour2 = Math.random() < 0.4 ? this._c.works[Math.floor(Math.random() * this._c.works.length)] : colour;
    const vy = Math.sqrt(2 * 9.81 * h) * 1.05;
    this.rockets.push({ x, y, z, vx: (Math.random() - 0.5) * 8, vy, vz: (Math.random() - 0.5) * 8,
      t: 0, colour, colour2, audio, sound, acc: 0 });
    if (audio && sound) { sound.thump(audio, { x, y, z }, 0, 0.3); sound.hiss(audio, { x, y, z }, 0.05, vy / 9.81 * 0.8, 0.1); }
  }

  _stepRockets(dt) {
    const fx = this.fx;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      r.vy -= 9.81 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      r.acc += dt;
      while (r.acc > 0.03) {
        r.acc -= 0.03;
        fx.sparks.spawn({ x: r.x, y: r.y, z: r.z, vx: (Math.random() - 0.5) * 2, vy: -2, vz: (Math.random() - 0.5) * 2,
          life: 0.5, size0: 1.2, size1: 0.3, color0: this._c.flare, color1: this._c.tracer, drag: 1, grav: -4, alpha: 0.9 });
      }
      if (r.vy > 4) continue;
      // The break.
      this.rockets.splice(i, 1);
      const n = this.low ? 40 : 90, sp = 22 + Math.random() * 14;
      for (let k = 0; k < n; k++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        const v = sp * (0.85 + Math.random() * 0.3);
        const c = k % 2 ? r.colour : r.colour2;
        fx.sparks.spawn({
          x: r.x, y: r.y, z: r.z,
          vx: Math.cos(a) * q * v, vy: u * v, vz: Math.sin(a) * q * v,
          life: 1.6 + Math.random() * 1.0, size0: 2.6, size1: 0.8,
          color0: c, color1: c, drag: 1.3, grav: -5, alpha: 1,
        });
      }
      const lg = fx._freeLight();
      lg.light.position.set(r.x, r.y, r.z);
      lg.light.color.copy(r.colour).multiplyScalar(0.6);
      lg.light.distance = 260; lg.peak = 900; lg.life = 0.6; lg.age = 0;
      // The light's colour is put back to the blast's warm white when it
      // next goes for a blast.
      fx.flourish.later(0.7, () => lg.light.color.set(0xffb060));
      if (r.audio && r.sound) {
        r.sound.crack(r.audio, { x: r.x, y: r.y, z: r.z }, 0, 0.6, 900, 0.25);
        for (let k = 0; k < 6; k++) r.sound.crack(r.audio, { x: r.x, y: r.y, z: r.z }, 0.5 + Math.random() * 1.2, 0.12, 3000, 0.04);
      }
    }
  }

  /**
   * A mushroom cloud, for the one bomb in the game that has earned one: the
   * column standing up out of the blast and the cap rolling over at its
   * head, rising and spreading for eight seconds, lit from inside at first
   * and then going grey and drifting.
   */
  mushroom(x, groundY, z, scale = 1) {
    this.mushrooms.push({ x, y: groundY, z, t: 0, k: scale, acc: 0 });
  }

  _stepMushrooms(dt) {
    const fx = this.fx;
    for (let i = this.mushrooms.length - 1; i >= 0; i--) {
      const m = this.mushrooms[i];
      m.t += dt;
      if (m.t > 8) { this.mushrooms.splice(i, 1); continue; }
      const k = m.k, H = 230 * k;
      const head = H * (1 - Math.exp(-m.t / 2.2));          // the head's height
      const rise = (H / 2.2) * Math.exp(-m.t / 2.2);        // and its speed
      const capR = (18 + 14 * m.t) * k;
      const lit = Math.max(0, 1 - m.t / 2.5);
      m.acc += dt;
      const every = this.low ? 0.06 : 0.03;
      while (m.acc > every) {
        m.acc -= every;
        // The cap: round its rim, rolling outward and over.
        for (let j = 0; j < 2; j++) {
          const a = Math.random() * Math.PI * 2, r = capR * (0.55 + Math.random() * 0.5);
          fx.plume.spawn({
            x: m.x + Math.cos(a) * r, y: m.y + head + (Math.random() - 0.3) * capR * 0.45, z: m.z + Math.sin(a) * r,
            vx: Math.cos(a) * 6 * k, vy: rise * 0.9, vz: Math.sin(a) * 6 * k,
            life: 6 + Math.random() * 5,
            size0: 16 * k, size1: (38 + Math.random() * 22) * k,
            color0: lit > 0.3 ? this._c.mushLit : this._c.mushDark, color1: this._c.mushDark,
            color2: this._c.mushGrey, cool: lit > 0.3 ? 0.08 : 0.3,
            drag: 0.6, grav: 0.3, turb: 1.4, alpha: 0.9,
            spin: (Math.random() - 0.5) * 0.4,
          });
        }
        // The stem: a narrower column up to under the cap.
        const h = Math.random() * head * 0.85;
        const r = (6 + 10 * (h / Math.max(1, head))) * k;
        const a = Math.random() * Math.PI * 2;
        fx.plume.spawn({
          x: m.x + Math.cos(a) * r * 0.4, y: m.y + h, z: m.z + Math.sin(a) * r * 0.4,
          vx: 0, vy: rise * 0.7, vz: 0,
          life: 5 + Math.random() * 3,
          size0: r * 1.4, size1: r * 2.6,
          color0: this._c.mushDark, color1: this._c.mushGrey,
          drag: 0.8, grav: 0.2, turb: 0.8, alpha: 0.85,
        });
      }
    }
  }

  /**
   * The condensation shell: the pressure wave of a very large blast chills
   * the damp air it passes through and for half a second there is a white
   * dome standing round the fireball, racing outward and gone.
   */
  wilson(x, y, z, radius = 140) {
    let w = this.wilsons.find((q) => !q.mesh.visible);
    if (!w) {
      if (this.wilsons.length >= 2) return;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 } },
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main() { vec4 w = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix * w; }`,
        fragmentShader: `uniform float uA; varying vec3 vN; varying vec3 vV;
          void main() { float rim = 1.0 - abs(dot(vN, vV)); float a = uA * (0.18 + 0.82 * pow(rim, 2.2)); gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a); }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
      mesh.renderOrder = 12;
      mesh.frustumCulled = false;
      this.fx.scene.add(mesh);
      w = { mesh, t: 0, r: radius };
      this.wilsons.push(w);
    }
    w.t = 0; w.r = radius;
    w.mesh.position.set(x, y, z);
    w.mesh.visible = true;
  }

  _stepWilsons(dt) {
    for (const w of this.wilsons) {
      if (!w.mesh.visible) continue;
      w.t += dt;
      const T = 0.75;
      if (w.t > T) { w.mesh.visible = false; continue; }
      const u = w.t / T;
      w.mesh.scale.setScalar(Math.max(1, w.r * (1 - Math.pow(1 - u, 2.4))));
      w.mesh.material.uniforms.uA.value = (u < 0.12 ? u / 0.12 : 1) * Math.pow(1 - u, 1.6) * 0.9;
    }
  }

  /** Run `fn` after `t` seconds of effects time. */
  later(t, fn) { if (this._later.length < 64) this._later.push({ t, fn }); }

  update(dt) {
    for (let i = this._later.length - 1; i >= 0; i--) {
      const l = this._later[i];
      l.t -= dt;
      if (l.t <= 0) { this._later.splice(i, 1); try { l.fn(); } catch { /* a callback is not worth a frame */ } }
    }
    this.paper.update(dt, this.fx.time);
    if (this.cookoffs.length) this._stepCookoffs(dt);
    if (this.rockets.length) this._stepRockets(dt);
    if (this.mushrooms.length) this._stepMushrooms(dt);
    if (this.wilsons.length) this._stepWilsons(dt);
    if (this.markers.length) this._stepMarkers(dt);
    if (this.flareList.length) this._stepFlares(dt);
  }
}

/** A sheet of paper, seen at forty metres: a pale rectangle with lines on it. */
function paperTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 32, 32);
  g.fillStyle = '#f4f2ea';
  g.fillRect(7, 3, 18, 26);
  g.fillStyle = 'rgba(80,80,90,0.35)';
  for (let y = 8; y < 27; y += 3) g.fillRect(10, y, 12, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
