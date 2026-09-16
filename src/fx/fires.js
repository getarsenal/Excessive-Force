import * as THREE from 'three';

/**
 * Fires that keep burning after the blast.
 *
 * An explosion is over in a second and a half, and until now the building
 * looked exactly as it had before, minus some stone. A heavy hit on masonry
 * now leaves a fire behind it: flame at the base, a column of dark smoke
 * leaning off downwind, and embers lifting out of it, dying down over half a
 * minute. Nothing about it is simulated — it is a source that keeps feeding
 * the same particle systems the blast used — but it is what makes a shelled
 * face look shelled from across the map.
 */
export class Fires {
  constructor(fx, quality) {
    this.fx = fx;
    this.list = [];
    this.max = quality.name === 'low' ? 4 : quality.name === 'medium' ? 7 : 12;
    this.wind = new THREE.Vector2(1.0, 0.3).normalize();
  }

  /**
   * @param {number} strength 0.5 (a small hit) .. 3 (a section gone)
   * @param {number} life     seconds until it burns out
   */
  ignite(x, y, z, strength = 1, life = 24) {
    const s = THREE.MathUtils.clamp(strength, 0.5, 3);
    // Two fires within a few metres are one fire.
    for (const f of this.list) {
      if (Math.hypot(f.x - x, f.y - y, f.z - z) < 6) {
        f.s = Math.min(3, f.s + s * 0.5);
        f.life = Math.max(f.life, f.age + life);
        return f;
      }
    }
    const f = { x, y, z, s, life, age: 0, acc: 0, seed: Math.random() * 10 };
    if (this.list.length >= this.max) {
      // Replace whichever is nearest its end.
      let k = 0;
      for (let i = 1; i < this.list.length; i++) {
        if (this.list[i].life - this.list[i].age < this.list[k].life - this.list[k].age) k = i;
      }
      this.list[k] = f;
    } else {
      this.list.push(f);
    }
    return f;
  }

  update(dt) {
    const fx = this.fx, c = fx._c;
    for (let n = this.list.length - 1; n >= 0; n--) {
      const f = this.list[n];
      f.age += dt;
      if (f.age >= f.life) { this.list.splice(n, 1); continue; }
      const fade = Math.pow(1 - f.age / f.life, 0.6);
      const s = f.s * fade;
      f.acc += dt * (5 + 7 * s);
      while (f.acc >= 1) {
        f.acc -= 1;
        const r = 1.2 + s * 1.4;
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
        const px = f.x + Math.cos(a) * rr, pz = f.z + Math.sin(a) * rr;
        // Flame: low, short-lived, additive.
        fx.fire.spawn({
          x: px, y: f.y + 0.3, z: pz,
          vx: (Math.random() - 0.5) * 1.5, vy: 2.5 + Math.random() * 3 * s, vz: (Math.random() - 0.5) * 1.5,
          life: 0.45 + Math.random() * 0.5,
          size0: (0.9 + s * 0.5), size1: (2.2 + s * 1.2),
          color0: c.fireHot, color1: c.fireMid,
          drag: 1.6, grav: -2.0, spin: (Math.random() - 0.5) * 2, alpha: 0.85,
        });
        // Smoke: dark, slow, leaning downwind, and it lasts.
        if (Math.random() < 0.7) {
          fx.smoke.spawn({
            x: px, y: f.y + 1.2 + s, z: pz,
            vx: this.wind.x * (1.5 + s) + (Math.random() - 0.5), vy: 2.6 + Math.random() * 2.4 * s,
            vz: this.wind.y * (1.5 + s) + (Math.random() - 0.5),
            life: 4.5 + Math.random() * 4.5 * s,
            size0: 1.4 + s, size1: (7 + Math.random() * 6) * s,
            color0: c.smokeDark, color1: c.smokeLight,
            drag: 0.55, grav: -0.35, turb: 1.4, spin: (Math.random() - 0.5) * 0.6, alpha: 0.62,
          });
        }
        // Embers, now and then, carried up in the heat.
        if (Math.random() < 0.28) {
          fx.sparks.spawn({
            x: px, y: f.y + 0.8, z: pz,
            vx: (Math.random() - 0.5) * 3 + this.wind.x * 1.5, vy: 4 + Math.random() * 6,
            vz: (Math.random() - 0.5) * 3 + this.wind.y * 1.5,
            life: 1.4 + Math.random() * 2.2,
            size0: 0.22 + s * 0.06, size1: 0.04,
            color0: c.spark, color1: c.sparkCold,
            drag: 0.7, grav: -3.0, turb: 2.0, alpha: 1.0,
          });
        }
      }
    }
  }
}
