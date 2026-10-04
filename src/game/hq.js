/**
 * The enemy's command post.
 *
 * A dug-in bunker inside the belt with a radio mast over it, a dish, a staff
 * tent and a truck, and a section of men round it. It is where the garrison
 * is run from: the mortars' spotters report to it, the crews take their
 * targets from it, and the airborne and the counter-attack are called and
 * coordinated through it.
 *
 * So it is worth going for. Brought down, it pays, and for a minute and a
 * half the garrison is on its own: every crew fires slower, the mortars are
 * blind, and any drop not yet sent for comes with a third fewer men, because
 * nobody is left to coordinate it. It takes some doing — concrete under
 * sandbags, more than a launcher — and the men round it shoot back.
 */
import * as THREE from 'three';

export const HQ = {
  hp: 260,
  /** Blast power to hit points (see SAM.powerPerHp). */
  powerPerHp: 60,
  bounty: 12000,
  /** Seconds the garrison is without its orders. */
  commsCut: 90,
  /** What the cut does: crews fire at this fraction of their rate. */
  rof: 0.6,
  /** And a drop sent for afterwards comes with this share of its men. */
  dropShare: 0.65,
};

function mat(color, rough = 0.85, metal = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

export class CommandPost {
  constructor({ scene, terrain, fx, site, desert = false, onEvent }) {
    this.terrain = terrain;
    this.fx = fx;
    this.onEvent = onEvent || (() => {});
    this.x = site.x; this.z = site.z;
    this.y = site.y;
    this.yaw = site.yaw;
    this.hp = HQ.hp;
    this.alive = true;
    this._hitAt = -9;
    this._t = 0;
    this.group = this._build(desert);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    scene.add(this.group);
  }

  _build(desert) {
    const g = new THREE.Group();
    const concrete = mat(0x7b7d76, 0.95, 0.02), bag = mat(desert ? 0xb8a074 : 0x8b8163, 0.98, 0);
    const dark = mat(0x1d2023, 0.6, 0.3), olive = mat(desert ? 0xb09468 : 0x4d5733);
    const canvas = mat(desert ? 0xc9b48a : 0x5f6646, 0.95, 0);
    const add = (geo, m, x, y, z, ry = 0, parent = g) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z); o.rotation.y = ry;
      o.castShadow = true; o.receiveShadow = true;
      parent.add(o);
      return o;
    };
    // The bunker, half sunk, with a sandbag rim and a dark door.
    add(new THREE.BoxGeometry(10, 3.2, 7.5), concrete, 0, 0.6, 0);
    add(new THREE.BoxGeometry(10.8, 0.6, 8.3), concrete, 0, 2.4, 0);
    for (const [x, z, w, d] of [[0, 4.6, 11.5, 1.2], [0, -4.6, 11.5, 1.2], [5.8, 0, 1.2, 8], [-5.8, 1.6, 1.2, 4.8]]) {
      add(new THREE.BoxGeometry(w, 1.4, d), bag, x, 0.7, z);
    }
    add(new THREE.BoxGeometry(0.15, 1.9, 1.6), dark, -5.05, 0.95, -2.4);
    // The mast: a lattice of three legs, crossbars, whips and a dish.
    const mast = new THREE.Group();
    mast.position.set(2.5, 2.7, -1.2);
    g.add(mast);
    const leg = new THREE.CylinderGeometry(0.06, 0.09, 17, 5);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      add(leg, dark, Math.cos(a) * 0.45, 8.5, Math.sin(a) * 0.45, 0, mast);
    }
    for (let h = 2; h < 17; h += 3) add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 6), dark, 0, h, 0, 0, mast);
    add(new THREE.CylinderGeometry(0.03, 0.03, 5, 4), dark, 0.3, 19.5, 0, 0, mast);
    add(new THREE.CylinderGeometry(0.03, 0.03, 3.5, 4), dark, -0.3, 18.6, 0.2, 0, mast);
    this.lamp = add(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0, 17.2, 0, 0, mast);
    const dish = add(new THREE.SphereGeometry(1.1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.32), mat(0xd8d8d2, 0.5, 0.2), -2.6, 3.4, 1.5);
    dish.rotation.x = -1.1;
    this.dish = dish;
    // The staff tent and a truck behind it.
    const tent = new THREE.CylinderGeometry(2.6, 2.6, 7, 3, 1, false);
    tent.rotateZ(Math.PI / 2);
    add(tent, canvas, -1, 1.3, 9.5);
    add(new THREE.BoxGeometry(2.5, 1.2, 6.5), olive, 7.5, 1.3, 7.5, 0.2);
    add(new THREE.BoxGeometry(2.4, 1.6, 2.2), olive, 7.9, 2.5, 9.8, 0.2);
    for (const [x, z] of [[6.4, 5.4], [8.6, 5.9], [6.6, 9.4], [8.9, 9.9]]) {
      const w = add(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10), dark, x, 0.55, z, 0.2);
      w.rotation.z = Math.PI / 2;
    }
    return g;
  }

  /** The point a marker and a stamp are put on. */
  get point() { return new THREE.Vector3(this.x, this.y + 4, this.z); }

  update(dt) {
    if (!this.alive) return;
    this._t += dt;
    // The lamp on the mast blinks, which is how it is found at night and
    // how it reads as a radio mast rather than a pylon.
    this.lamp.visible = (this._t % 1.6) < 0.8;
    this.dish.rotation.y = Math.sin(this._t * 0.3) * 0.6;
  }

  /** A round landing. Damage as the SAMs take it; returns the money. */
  blast(point, radius, power = 3000) {
    if (!this.alive) return 0;
    const R = radius + 6;
    const d = Math.hypot(point.x - this.x, point.z - this.z);
    if (d > R || Math.abs(point.y - this.y) > radius + 14) return 0;
    this.hp -= (power / HQ.powerPerHp) * Math.pow(1 - d / R, 1.2);
    if (this.hp > 0) {
      if (this._t - this._hitAt > 1.5) {
        this._hitAt = this._t;
        this.onEvent('hqhit', { point: this.point, frac: this.hp / HQ.hp });
      }
      return 0;
    }
    this.alive = false;
    this.lamp.visible = false;
    this.group.traverse((m) => {
      if (!m.isMesh || !m.material || m.material.isMeshBasicMaterial) return;
      m.material = m.material.clone();
      m.material.color.multiplyScalar(0.25);
    });
    // The mast comes down across the bunker.
    const mast = this.group.children.find((c) => c.isGroup);
    if (mast) { mast.rotation.z = 1.25; mast.position.y -= 0.6; }
    if (this.fx) {
      this.fx.detonate(this.point, 3.4, { ground: true, groundY: this.y });
      this.fx.detonate(new THREE.Vector3(this.x + 3, this.y + 2, this.z - 2), 2.4, { ground: true, groundY: this.y });
    }
    this.onEvent('hqdown', { point: this.point });
    return HQ.bounty;
  }

  /**
   * The section round it: machine guns at the corners, riflemen between and a
   * sniper on the bunker roof, in the garrison's \`hvt\` allowance.
   */
  garrison(garrison) {
    if (!garrison) return 0;
    const n0 = garrison.defenders.length;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const at = (lx, lz) => ({ x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c });
    const post = (type, lx, lz, y = null) => {
      const p = at(lx, lz);
      if (this.terrain.isWater(p.x, p.z)) return;
      const face = Math.atan2(p.x - this.x, p.z - this.z);
      garrison.place(type, new THREE.Vector3(p.x, y ?? this.terrain.heightAt(p.x, p.z), p.z), face, 4,
        { cover: 'ground', emplaced: true, sandbags: y == null, pool: 'hvt' });
    };
    post('mg', 11, 11); post('mg', -11, -11); post('mg', 11, -11);
    for (const [x, z] of [[-12, 4], [0, -13], [13, 2], [-4, 14], [-13, -6]]) post('rifleman', x, z);
    post('at', 4, 13);
    post('sniper', 0, 0, this.y + 2.75);
    return garrison.defenders.length - n0;
  }
}
