import * as THREE from 'three';

/**
 * White flags.
 *
 * When the landmark is down the men still in it have nothing left to hold,
 * and they say so: a white rag on a stick over every surviving post, the
 * nearest few first, waving. It is the cheapest way there is of telling the
 * player the fight is over and who won it.
 *
 * One cloth geometry shared by every flag and rippled on the CPU — a dozen
 * vertices — and one pole geometry; each flag is a group of two meshes,
 * and there are never more than thirty of them.
 */
export class WhiteFlags {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'whiteflags';
    scene.add(this.group);
    this.cloth = new THREE.PlaneGeometry(1.1, 0.7, 8, 2);
    this.cloth.translate(0.55, 0, 0);
    this._rest = Float32Array.from(this.cloth.attributes.position.array);
    this.clothMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.9, side: THREE.DoubleSide });
    this.pole = new THREE.CylinderGeometry(0.025, 0.03, 2.2, 5);
    this.pole.translate(0, 1.1, 0);
    this.poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
    this.flags = [];
    this.t = 0;
  }

  /**
   * Over each living defender, nearest the camera first, one after another.
   * @param {object[]} defenders  each with `alive` and `pos`
   */
  raise(defenders, camera, max = 30) {
    // Once a battle: a win played on and won again does not plant a second
    // flag beside every first one.
    if (this.flags.length) return 0;
    const alive = defenders.filter((d) => d.alive && d.pos);
    alive.sort((a, b) => a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
    const n = Math.min(max, alive.length);
    for (let i = 0; i < n; i++) {
      const d = alive[i];
      const g = new THREE.Group();
      const pole = new THREE.Mesh(this.pole, this.poleMat);
      const cloth = new THREE.Mesh(this.cloth, this.clothMat);
      cloth.position.y = 1.85;
      g.add(pole, cloth);
      g.position.set(d.pos.x + 0.3, d.pos.y + 0.4, d.pos.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      // Up one after another, as the word goes round.
      g.scale.setScalar(0.0001);
      this.group.add(g);
      this.flags.push({ g, at: 0.25 + i * 0.12 + Math.random() * 0.3, sway: Math.random() * 6 });
    }
    return n;
  }

  update(dt) {
    if (!this.flags.length) return;
    this.t += dt;
    for (const f of this.flags) {
      if (this.t < f.at) continue;
      const k = Math.min(1, (this.t - f.at) / 0.35);
      f.g.scale.setScalar(Math.max(0.0001, k * 1.6));
      // Waved, not hung: the stick goes side to side.
      f.g.rotation.z = Math.sin(this.t * 3.2 + f.sway) * 0.35;
    }
    // The cloth ripples, the free end most.
    const p = this.cloth.attributes.position.array, r = this._rest;
    for (let i = 0; i < p.length; i += 3) {
      const x = r[i];
      p[i + 2] = Math.sin(this.t * 7 - x * 5.5) * 0.12 * x;
      p[i + 1] = r[i + 1] - x * x * 0.08;
    }
    this.cloth.attributes.position.needsUpdate = true;
    this.cloth.computeVertexNormals();
  }
}
