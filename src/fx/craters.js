import * as THREE from 'three';

/**
 * Scorch marks where rounds land.
 *
 * A shell that falls short currently leaves nothing behind, which throws away
 * the most useful feedback the player gets: *where the sheaf is actually
 * landing*. Dispersion means half the rounds miss, and without a mark on the
 * ground a miss is indistinguishable from a round that never arrived.
 *
 * Drawn as one instanced disc laid flat on the terrain, so a hundred craters
 * cost a single draw call and nothing per frame once they have settled. They
 * are decals, not geometry — there is no hole in the heightfield, and shells
 * still land on the terrain as it was baked.
 */
const MAX = 160;

export class CraterFX {
  constructor(scene, terrain, quality) {
    this.terrain = terrain;
    const geo = new THREE.CircleGeometry(1, 18);
    geo.rotateX(-Math.PI / 2);

    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.82,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
      }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    scene.add(this.mesh);

    this._next = 0;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.enabled = quality.name !== 'low';
  }

  /** Mark the ground. `radius` is the warhead's blast radius. */
  add(x, groundY, z, radius) {
    if (!this.enabled) return;
    const i = this._next % MAX;
    this._next++;
    // Sit a few centimetres proud of the terrain. The heightfield is sampled
    // every 3.5 m, so a disc laid exactly on it z-fights across the seams.
    this._v.set(x, groundY + 0.09, z);
    const r = radius * (0.5 + Math.random() * 0.25);
    this._s.set(r, 1, r * (0.85 + Math.random() * 0.3));
    this._q.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    this._m4.compose(this._v, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m4);
    // Scorched earth: dark, slightly warm, and varied so a cluster of craters
    // reads as several impacts rather than one stencil repeated.
    const k = 0.16 + Math.random() * 0.1;
    this._c.setRGB(k * 1.15, k, k * 0.82);
    this.mesh.instanceColor.setXYZ(i, this._c.r, this._c.g, this._c.b);
    this.mesh.count = Math.min(MAX, this._next);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this._next = 0; this.mesh.count = 0; }
}

const UP = new THREE.Vector3(0, 1, 0);
