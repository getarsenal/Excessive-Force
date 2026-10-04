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
  /**
   * `color` and `shape`: the drop's survivors are red arrows; the high-value
   * targets (see `updatePoints`) are gold diamonds.
   */
  constructor(scene, { color = 0xff4a24, shape = 'arrow', cap = CAP } = {}) {
    // A short cone, point down, with a flat collar on top so it reads as an
    // arrow from the side and as a ring from above; or a diamond.
    let cone;
    if (shape === 'diamond') {
      cone = new THREE.OctahedronGeometry(0.75, 0);
      cone.scale(0.8, 1.25, 0.8);
      cone.translate(0, 0.95, 0);
    } else {
      cone = new THREE.ConeGeometry(0.55, 1.3, 4, 1);
      cone.rotateX(Math.PI);
      cone.translate(0, 0.65, 0);
    }
    this.cap = cap;
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95,
      depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(cone, mat, cap);
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

  /**
   * Over fixed points instead of men: the SAM launchers and radars and the
   * command post, while they stand. Higher over them and slower, since they
   * are vehicles and buildings, not a man's head.
   */
  updatePoints(dt, points, camera, on) {
    this.t += dt;
    let n = 0;
    if (on) {
      const cam = camera.position;
      for (const p of points) {
        if (n >= this.cap) break;
        this._p.set(p.x, p.y, p.z);
        const dist = cam.distanceTo(this._p);
        const s = Math.min(14, Math.max(1.4, dist * 0.016));
        const bounce = Math.abs(Math.sin(this.t * 2.2 + n * 0.9));
        this._p.y += 9 + 1.6 * s + bounce * 0.7 * s;
        this._q.setFromAxisAngle(this._up, this.t * 1.4 + n);
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

  /** `on` is whether the level is waiting on the drop; the men come from the garrison. */
  update(dt, garrison, camera, on) {
    this.t += dt;
    let n = 0;
    if (on && garrison) {
      const cam = camera.position;
      for (const d of garrison.defenders) {
        if (!d.alive || !DROP_POOLS.has(d.pool)) continue;
        if (n >= this.cap) break;
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
