import * as THREE from 'three';

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

  update(dt) {
    if (this.markers.length) this._stepMarkers(dt);
    if (this.flareList.length) this._stepFlares(dt);
  }
}
