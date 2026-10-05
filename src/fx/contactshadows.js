import * as THREE from 'three';

/**
 * Contact shadows under the guns.
 *
 * The low tier has no shadow map — a phone cannot spend a second pass over
 * the scene from the sun — and without one a howitzer on a lawn is a model
 * on a photograph: nothing ties it to the ground. The oldest trick in
 * stylised 3D ties it: a soft dark ellipse under each unit, the colour of
 * the shadows in the rest of the picture (cool, a little violet), drawn in
 * one instanced mesh however many guns are down. It is also what stands in
 * when the governor turns the real shadows off in a heavy fight, so a unit
 * never pops from shadowed to floating mid-battle.
 *
 * Only the player's units: the garrison digs in behind sandbags and sits in
 * trenches, and both of those already read as grounded.
 */
export class ContactShadows {
  constructor(scene, max = 420) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: discTexture(),
      color: 0x241f3a,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      // Lifted off the ground in the depth test, not in space: on a slope the
      // disc's far edge would otherwise sink into the grass and be cut off.
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'contact-shadows';
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /**
   * One disc per living unit, sized to the gun and turned with it. `on`
   * false (real shadows are drawing) hides the lot for nothing.
   */
  update(units, on) {
    if (!on) { if (this.mesh.count) { this.mesh.count = 0; } this.mesh.visible = false; return; }
    this.mesh.visible = true;
    let n = 0;
    for (const u of units) {
      if (!u.alive || n >= this.max) continue;
      const inf = u.def.model === 'infantry';
      const len = inf ? 2.4 : (u.def.modelLength || 7) * 0.92;
      const wid = inf ? 2.0 : Math.max(3.2, len * 0.46);
      this._p.set(u.pos.x, u.pos.y + 0.09, u.pos.z);
      this._q.setFromAxisAngle(this._up, u.yaw || 0);
      this._s.set(wid, 1, len);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(n++, this._m);
    }
    this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A soft disc: opaque in the middle, gone at the rim, nothing in the corners. */
function discTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
