import * as THREE from 'three';

/**
 * Smoke screens.
 *
 * The one thing the player could not do about a garrison that had the range
 * of them was hide. A smoke round lays a cloud that the men in the windows
 * cannot see through for half a minute: long enough to get a gun set up under
 * their noses, or to pull a damaged one out. The cloud is a sphere for the
 * line-of-sight test and a steady feed of white smoke for the eye, and the
 * two thin out together.
 */
export class SmokeScreens {
  constructor(fx) {
    this.fx = fx;
    this.list = [];
    this._a = new THREE.Vector3();
    this._c = new THREE.Color(0xe8e4dc);
    this._c2 = new THREE.Color(0xb9b4ab);
  }

  place(point, radius = 24, life = 28) {
    this.list.push({ x: point.x, y: point.y, z: point.z, r: radius, life, age: 0, acc: 0 });
  }

  get active() { return this.list.length > 0; }

  /** Opacity of a cloud at this point in its life: builds fast, thins slowly. */
  _density(s) {
    const t = s.age / s.life;
    return Math.min(1, s.age / 3.0) * (1 - Math.pow(t, 2.2));
  }

  /** Does the segment a→b pass through smoke thick enough to hide behind? */
  blocks(a, b) {
    for (const s of this.list) {
      const d = this._density(s);
      if (d < 0.35) continue;
      const cx = s.x, cy = s.y + s.r * 0.55, cz = s.z;
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const l2 = abx * abx + aby * aby + abz * abz;
      let t = l2 > 0 ? ((cx - a.x) * abx + (cy - a.y) * aby + (cz - a.z) * abz) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + abx * t - cx, py = a.y + aby * t - cy, pz = a.z + abz * t - cz;
      if (px * px + py * py + pz * pz < s.r * s.r * d) return true;
    }
    return false;
  }

  update(dt) {
    const fx = this.fx;
    for (let n = this.list.length - 1; n >= 0; n--) {
      const s = this.list[n];
      s.age += dt;
      if (s.age >= s.life) { this.list.splice(n, 1); continue; }
      const d = this._density(s);
      s.acc += dt * (4 + 22 * d);
      while (s.acc >= 1) {
        s.acc -= 1;
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * s.r * 0.6;
        fx.smoke.spawn({
          x: s.x + Math.cos(a) * rr, y: s.y + 0.5 + Math.random() * 2, z: s.z + Math.sin(a) * rr,
          vx: (Math.random() - 0.5) * 2.5 + 0.8, vy: 1.6 + Math.random() * 2.0, vz: (Math.random() - 0.5) * 2.5,
          life: 4 + Math.random() * 4,
          size0: s.r * 0.25, size1: s.r * (0.8 + Math.random() * 0.5),
          color0: this._c, color1: this._c2,
          drag: 0.8, grav: -0.15, turb: 1.1, spin: (Math.random() - 0.5) * 0.5, alpha: 0.7 * Math.max(0.3, d),
        });
      }
    }
  }
}
