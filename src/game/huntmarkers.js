/**
 * The last of the drop, pointed out.
 *
 * Once the building is down and the level is waiting on the airborne and the
 * counter-attack, the men still fighting are a handful of figures somewhere
 * in a burning city, the colour of the city. Each gets a small red pointer
 * over his head, bouncing, turning, drawn through walls and smoke, and kept
 * the same size on screen from any distance, until he is down.
 *
 * One instanced mesh, rebuilt each frame from the garrison; nothing to tidy
 * when a man dies, he just is not in the next frame's list.
 */
import * as THREE from 'three';

const CAP = 600;
const DROP_POOLS = new Set(['air', 'wave']);

export class HuntMarkers {
  constructor(scene) {
    // A short cone, point down, with a flat collar on top so it reads as an
    // arrow from the side and as a ring from above.
    const cone = new THREE.ConeGeometry(0.55, 1.3, 4, 1);
    cone.rotateX(Math.PI);
    cone.translate(0, 0.65, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4a24, transparent: true, opacity: 0.95,
      depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(cone, mat, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = 'hunt-markers';
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this.t = 0;
    this.shown = 0;
  }

  /** `on` is whether the level is waiting on the drop; the men come from the garrison. */
  update(dt, garrison, camera, on) {
    this.t += dt;
    let n = 0;
    if (on && garrison) {
      const cam = camera.position;
      for (const d of garrison.defenders) {
        if (!d.alive || !DROP_POOLS.has(d.pool)) continue;
        if (n >= CAP) break;
        const dist = cam.distanceTo(d.pos);
        const s = Math.min(9, Math.max(0.8, dist * 0.012));
        const bounce = Math.abs(Math.sin(this.t * 4 + n * 0.7));
        this._p.set(d.pos.x, d.pos.y + (d.def.eye ?? 1.25) + 1.4 * s + bounce * 0.9 * s, d.pos.z);
        this._q.setFromAxisAngle(this._up, this.t * 2.2 + n);
        this._s.setScalar(s);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(n++, this._m);
      }
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
    this.shown = n;
  }
}
