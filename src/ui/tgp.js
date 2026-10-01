import * as THREE from 'three';

/**
 * The targeting pod's picture.
 *
 * When an aircraft is sent at something, the pilot is not looking at it the
 * way the player is: he is looking at a four-inch screen of grey video from
 * the pod under his wing, the crosshair parked on the spot and the seconds
 * counting down to impact. That picture is the most recognisable image of
 * modern air war there is, and it is cheap to make: a second, narrow camera
 * on the aim point, drawn into a corner of the canvas after the frame, with
 * the grey and the grain put on by the page rather than by another pass.
 *
 * The narrow field is what keeps it affordable — at five degrees across,
 * frustum culling throws away nearly the whole scene before it is drawn —
 * and the shadow maps are not redrawn for it. It is not drawn at all on the
 * lowest tier, under the harness, or with the screen cleared for a
 * photograph.
 */
export class TargetingPod {
  constructor(engine, quality) {
    this.engine = engine;
    this.off = quality.name === 'low';
    try { if (localStorage.getItem('tt.suite') === '1') this.off = true; } catch { /* private mode */ }
    this.cam = new THREE.PerspectiveCamera(5, 4 / 3, 20, 9000);
    this.point = new THREE.Vector3();
    this.left = 0;
    this.eta = 0;
    this.spin = 0;
    this.el = null;
    this._rect = { x: 0, y: 0, w: 0, h: 0 };
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'tgp';
    el.innerHTML = `<div class="tgp-glass"></div>
      <div class="tgp-x"></div><div class="tgp-y"></div><div class="tgp-box"></div>
      <span class="tgp-tl">TGP · WHOT</span><span class="tgp-tr" data-k="name"></span>
      <span class="tgp-bl" data-k="tti"></span><span class="tgp-br">LSR ARM</span>`;
    document.body.appendChild(el);
    this.el = el;
    this.tti = el.querySelector('[data-k="tti"]');
    this.name = el.querySelector('[data-k="name"]');
  }

  /** An aircraft is on its way to `point`, arriving in `eta` seconds. */
  show(point, eta, label = '') {
    if (this.off) return;
    if (!this.el) this._build();
    this.point.copy(point);
    this.eta = eta;
    this.left = eta + 3.5;
    this.spin = Math.random() * Math.PI * 2;
    this.name.textContent = label;
    this.el.classList.add('on');
  }

  hide() {
    this.left = 0;
    if (this.el) this.el.classList.remove('on');
  }

  /** After the frame: draw the pod's view into its corner. */
  render(dt) {
    if (this.left <= 0) return;
    this.left -= dt;
    this.eta -= dt;
    if (this.left <= 0 || document.body.classList.contains('clear-view') || document.body.classList.contains('ended')) {
      this.hide();
      return;
    }
    const tti = Math.max(0, this.eta);
    this.tti.textContent = tti > 0 ? `TTI ${tti.toFixed(1)}` : 'IMPACT';
    const box = this.el.getBoundingClientRect();
    if (box.width < 8) return;
    // The pod tracks the point from a slant, the aircraft's angle off it
    // creeping round as it runs in.
    this.spin += dt * 0.05;
    const r = 1500, el = 0.62;
    const c = this.cam;
    c.position.set(
      this.point.x + Math.sin(this.spin) * Math.cos(el) * r,
      this.point.y + Math.sin(el) * r,
      this.point.z + Math.cos(this.spin) * Math.cos(el) * r,
    );
    c.aspect = box.width / box.height;
    c.updateProjectionMatrix();
    c.lookAt(this.point);
    c.updateMatrixWorld();

    const R = this.engine.renderer;
    const H = R.domElement.clientHeight;
    const x = box.left, y = H - box.bottom, w = box.width, h = box.height;
    const keep = R.getViewport(this._vp || (this._vp = new THREE.Vector4()));
    const shadow = R.shadowMap.autoUpdate;
    R.shadowMap.autoUpdate = false;
    R.setScissorTest(true);
    R.setScissor(x, y, w, h);
    R.setViewport(x, y, w, h);
    R.clear(true, true, false);
    R.render(this.engine.scene, c);
    R.setScissorTest(false);
    R.setViewport(keep);
    R.shadowMap.autoUpdate = shadow;
  }
}
