import * as THREE from 'three';

/**
 * The garrison's stores: ammunition beside the mortars, fuel beside the guns.
 *
 * A dug-in heavy weapon does not fire from an empty pit. Every mortar, field
 * gun and flak mount on open ground has its dump a few paces off — a stack of
 * olive crates for the tubes, a row of red drums for the guns — and a round
 * that lands close enough sets it off. A second or so later it goes up on its
 * own account: a blast that takes the crew with it, fire where the fuel was,
 * and a chance of the next dump along going up after it. Reading the ground
 * for the dumps is a way to take a position without walking rounds onto it.
 *
 * Only on open ground: a dump laid a metre off a roof would hang in the air,
 * so men posted on a building keep their rounds out of sight.
 */
const KINDS = {
  mortar: 'ammo', fieldgun: 'fuel', aa: 'fuel',
};
const SPEC = {
  ammo: { lethal: 3.2, radius: 7.0, power: 8000, splash: 9.0, fx: 3.0, chain: 16, bounty: 120 },
  fuel: { lethal: 2.6, radius: 6.0, power: 6500, splash: 11.0, fx: 3.6, chain: 18, bounty: 150 },
};

export class Stores {
  constructor({ scene, garrison, terrain, structures }) {
    this.scene = scene;
    this.terrain = terrain;
    this.structures = structures;
    this.garrison = garrison;
    this.list = [];
    this.pending = [];
    this.time = 0;
    this.blown = 0;
    this._build();
  }

  _build() {
    const slots = [];
    const near = (p, r) => slots.some((s) => s.pos.distanceToSquared(p) < r * r);
    for (const d of this.garrison.defenders) {
      const kind = KINDS[d.def?.key];
      if (!kind) continue;
      const g0 = this.terrain.heightAt(d.pos.x, d.pos.z);
      if (Math.abs(d.pos.y - g0) > 1.2) continue;          // on a building
      // A few paces back from the way the weapon faces, and to one side.
      const yaw = d.yaw ?? d.facing ?? 0;
      const bx = -Math.sin(yaw), bz = -Math.cos(yaw);
      const side = slots.length % 2 ? 1 : -1;
      const p = new THREE.Vector3(
        d.pos.x + bx * 3.2 + bz * side * 2.2, 0, d.pos.z + bz * 3.2 - bx * side * 2.2);
      p.y = this.terrain.heightAt(p.x, p.z);
      // Flat enough to stack on, and not another dump's ground.
      const slope = Math.max(
        Math.abs(this.terrain.heightAt(p.x + 1, p.z) - p.y),
        Math.abs(this.terrain.heightAt(p.x, p.z + 1) - p.y));
      if (slope > 0.45 || near(p, 5)) continue;
      if (this._inMasonry(p)) continue;
      slots.push({ pos: p, kind, yaw, alive: true, at: 0 });
    }
    this.list = slots;
    if (!slots.length) return;

    // Drawn as two instanced meshes: three crates a dump, four drums a dump.
    const crate = new THREE.BoxGeometry(1.1, 0.62, 0.72);
    const drum = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x4d5436, roughness: 0.85 });
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x8a2f22, roughness: 0.6, metalness: 0.2 });
    const ammo = slots.filter((s) => s.kind === 'ammo'), fuel = slots.filter((s) => s.kind === 'fuel');
    this.crates = new THREE.InstancedMesh(crate, crateMat, Math.max(1, ammo.length * 3));
    this.drums = new THREE.InstancedMesh(drum, drumMat, Math.max(1, fuel.length * 4));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    let ci = 0, di = 0;
    for (const s of slots) {
      s.parts = [];
      const place = (mesh, i, dx, dy, dz, ry) => {
        const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
        q.setFromAxisAngle(up, s.yaw + ry);
        m.compose(new THREE.Vector3(s.pos.x + dx * c + dz * sn, s.pos.y + dy, s.pos.z - dx * sn + dz * c), q, s1);
        mesh.setMatrixAt(i, m);
        s.parts.push([mesh, i]);
      };
      if (s.kind === 'ammo') {
        place(this.crates, ci++, -0.6, 0.31, 0, 0);
        place(this.crates, ci++, 0.6, 0.31, 0.05, 0.08);
        place(this.crates, ci++, 0.0, 0.93, 0.02, -0.12);
      } else {
        for (let k = 0; k < 4; k++) place(this.drums, di++, (k % 2) * 0.66 - 0.33, 0.45, Math.floor(k / 2) * 0.66 - 0.33, 0);
      }
    }
    this.crates.count = ci; this.drums.count = di;
    for (const mesh of [this.crates, this.drums]) {
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    }
  }

  /** Whether any standing stone is inside a metre and a half of `p`. */
  _inMasonry(p) {
    for (const s of this.structures) {
      for (let i = 0; i < s.count; i += 2) {
        if (!(s.flags[i] & 1)) continue;
        if (Math.abs(s.px[i] - p.x) < 1.5 && Math.abs(s.pz[i] - p.z) < 1.5 && Math.abs(s.py[i] - p.y) < 3) return true;
      }
    }
    return false;
  }

  /** A burst at `point` of radius `r`: any dump inside it is set off. */
  blast(point, r) {
    for (const s of this.list) {
      if (!s.alive || s.at) continue;
      if (s.pos.distanceTo(point) > r + 1.2) continue;
      s.at = this.time + 0.35 + Math.random() * 0.7;
      this.pending.push(s);
    }
  }

  /**
   * Runs the dumps that have been set off. `boom(s, spec)` is the battle's:
   * it does the damage and the effects; this does the bookkeeping and the
   * chain.
   */
  update(dt, boom) {
    this.time += dt;
    if (!this.pending.length) return;
    const due = this.pending.filter((s) => s.at <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((s) => s.at > this.time);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const s of due) {
      if (!s.alive) continue;
      s.alive = false;
      this.blown++;
      for (const [mesh, i] of s.parts || []) { mesh.setMatrixAt(i, z); mesh.instanceMatrix.needsUpdate = true; }
      const spec = SPEC[s.kind];
      boom(s, spec);
      // The next one along goes if it is close enough.
      this.blast(s.pos, spec.chain);
    }
  }

  get remaining() { return this.list.reduce((n, s) => n + (s.alive ? 1 : 0), 0); }

  dispose() {
    for (const mesh of [this.crates, this.drums]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose(); mesh.material.dispose();
    }
  }
}
