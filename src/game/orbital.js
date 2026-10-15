/**
 * The lasgun: a beam from orbit.
 *
 * Nothing flies. About a second after the call a column of light stands
 * on the start of the line the player drew and walks it, burning through
 * whatever it crosses — the Harkonnen lasgun chasing the ornithopter across
 * the Arrakeen field. There is no run-in for the flak to work on and no
 * aircraft to lose; the price buys the instant.
 *
 * The beam is drawn, not simulated: one tall quad standing `TOP` metres
 * over the foot and turned to the camera every frame, painted across with
 * the beam's profile (a white core, a violet sheath, a wide orange glow,
 * each a gaussian, in one texture) and fading to nothing up the column (a
 * four-component colour attribute, so the ordinary basic material does the
 * fade), its width flickering every frame, a flare sprite at the foot.
 * Three open additive cylinders were the first draft: front and back
 * faces of three overlapping tubes summed to several times white and the
 * bloom pass turned the whole frame white from forty metres. The damage is
 * real: every `tick` seconds the beam bites once at its foot, `depth`
 * metres into whatever it stands on, and the bite goes through the same
 * impact handler as a shell (`onBite`), so it takes masonry, lights the
 * town, kills the garrison, scorches the street and pays the bounties.
 * The foot is found by a ray cast straight down from the sky, so the beam
 * stops on the first thing under it — a roof, the tower, the ground — and
 * cuts its way down from there as the bites take the top off.
 *
 * `def.strike.beam`: `charge` seconds from the call to the beam, `walk`
 * seconds down the line, `hold` seconds standing at the end, `tick` seconds
 * between bites, `width` the beam's radius on the ground.
 */
import * as THREE from 'three';
import { lasgun } from '../core/synth.js';

const TOP = 1500;        // metres of column drawn over the foot
const SKY = 900;         // where the search for the foot starts
const FOCUS = 0.9;       // seconds the array takes to close to the fine beam

let _flareTex = null;
function flareTexture() {
  if (_flareTex) return _flareTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,240,220,0.9)');
  r.addColorStop(0.45, 'rgba(255,140,60,0.45)');
  r.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  _flareTex = new THREE.CanvasTexture(c);
  _flareTex.colorSpace = THREE.SRGBColorSpace;
  return _flareTex;
}

let _beamTex = null;
/** The beam's profile across its width: core, sheath and glow, each a gaussian. */
function beamTexture() {
  if (_beamTex) return _beamTex;
  const W = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = 4;
  const g = c.getContext('2d');
  const img = g.createImageData(W, 4);
  for (let x = 0; x < W; x++) {
    const r = Math.abs(x - W / 2 + 0.5) / (W / 2);
    const core = Math.exp(-((r / 0.07) ** 2));
    const sheath = Math.exp(-((r / 0.2) ** 2)) * 0.55;
    const glow = Math.exp(-((r / 0.62) ** 2)) * 0.3;
    const a = Math.min(1, core + sheath + glow);
    // The colour is the mix of the three, weighted by what is there.
    const wsum = core + sheath + glow || 1;
    const R = (core * 255 + sheath * 205 + glow * 255) / wsum;
    const G = (core * 255 + sheath * 175 + glow * 106) / wsum;
    const B = (core * 255 + sheath * 255 + glow * 40) / wsum;
    for (let y = 0; y < 4; y++) {
      const i = (y * W + x) * 4;
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  _beamTex = new THREE.CanvasTexture(c);
  _beamTex.colorSpace = THREE.SRGBColorSpace;
  _beamTex.wrapS = _beamTex.wrapT = THREE.ClampToEdgeWrapping;
  return _beamTex;
}

/** The column: a quad `width` across, `TOP` tall, its alpha fading up it. */
function column(width) {
  const geo = new THREE.PlaneGeometry(width, TOP, 1, 10);
  geo.translate(0, TOP / 2, 0);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / TOP;                          // 0 at the foot, 1 at the top
    const a = Math.pow(1 - h, 1.4);
    col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = a;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: beamTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  }));
  m.renderOrder = 40;
  m.frustumCulled = false;
  return m;
}

export class Orbital {
  constructor({ scene, terrain, physics, fx, audio, camera, quality }) {
    this.scene = scene; this.terrain = terrain; this.physics = physics;
    this.fx = fx; this.audio = audio; this.camera = camera; this.quality = quality;
    /** @type {Array<object>} the beams up, oldest first */
    this.beams = [];
    /** A bite at `point` with warhead `w`; `structureHit` says the foot stood on something built. */
    this.onBite = null;
    /** A beam shut off: `(beam)`. */
    this.onDone = null;
    /** The array focused and the full charge on the ground: `(beam)`. */
    this.onLand = null;
    /** Camera shake, an amount a frame while the beam is on the ground. */
    this.onShake = null;
    this._v = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._down = { x: 0, y: -1, z: 0 };
    // The colour the bite's dust starts: a THREE.Color, which is what the
    // particles read (a bare number there was NaN in every vertex, and the
    // bloom pass spread the NaN over the whole frame).
    this._ember = new THREE.Color(0xffb060);
  }

  /**
   * The beam called down a path: `{pts, cum, len}` from `battle.beamPath`,
   * points along the drawing with their distance from its start, walked at
   * one speed over `walk` seconds whatever its shape.
   */
  call(def, path) {
    const B = def.strike.beam;
    const from = path.pts[0], to = path.pts[path.pts.length - 1];
    const g = new THREE.Group();
    // The column comes in off the vertical: the platform is never straight
    // overhead. Five to ten degrees, on a heading of its own each time, and
    // drifting a little through the walk as the platform moves on. Everything
    // that is the beam hangs under `lean`; the mark on the ground does not.
    const lean = new THREE.Group();
    lean.userData.tilt = THREE.MathUtils.degToRad(5 + Math.random() * 5);
    lean.userData.az = Math.random() * Math.PI * 2;
    g.add(lean);
    const core = column(B.width * 7);
    lean.add(core);
    // The array: five thinner beams standing in a ring round the mark as
    // the platform brings its emitters to bear, converging on the centre
    // over `FOCUS` seconds into the one fine beam.
    const rays = [];
    for (let k = 0; k < 5; k++) { const r = column(B.width * 2.6); r.visible = false; r.material.opacity = 0; lean.add(r); rays.push(r); }
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flareTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    }));
    flare.renderOrder = 41;
    flare.scale.setScalar(B.width * 5);
    lean.add(flare);
    // The targeting mark before the beam: a thin ring on the ground, pulsing.
    const mark = new THREE.Mesh(new THREE.RingGeometry(B.width * 2.2, B.width * 2.8, 32),
      new THREE.MeshBasicMaterial({ color: 0xff8a40, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    mark.rotation.x = -Math.PI / 2;
    mark.renderOrder = 36;
    g.add(mark);
    g.visible = true;
    core.visible = flare.visible = false;
    this.scene.add(g);
    const b = {
      def, B, path, from: from.clone(), to: to.clone(), t: 0, done: false,
      foot: from.clone(), group: g, lean, core, flare, mark, rays, landed: false,
      charge: B.charge, dur: B.charge + B.walk + B.hold, nextBite: B.charge, bites: 0,
      sound: null, seed: Math.random() * 100, lit: false,
    };
    this._placeFoot(b, 0);
    g.position.copy(b.foot);
    b.sound = this.audio ? lasgun(this.audio, b.foot, b.dur, B.width >= 2.5 ? 1 : 0.7, B.charge) : null;
    this.beams.push(b);
    return b;
  }

  /** The point `u` of the way down the path, on the first thing under the sky there. */
  _placeFoot(b, u) {
    const P = b.path, s = u * P.len, c = P.cum;
    let i = 1; while (i < c.length - 1 && c[i] < s) i++;
    const pa = P.pts[i - 1], pb = P.pts[i] || pa;
    const t = c[i] > c[i - 1] ? Math.min(1, Math.max(0, (s - c[i - 1]) / (c[i] - c[i - 1]))) : 0;
    const x = pa.x + (pb.x - pa.x) * t, z = pa.z + (pb.z - pa.z) * t;
    const gy = this.terrain.heightAt(x, z);
    let y = gy, built = false;
    if (this.physics && this.physics.castRay) {
      const top = Math.max(gy, b.from.y, b.to.y) + SKY;
      const res = this.physics.castRay({ x, y: top, z }, this._down, SKY + 50);
      if (res && res.toi != null) {
        const hy = top - res.toi;
        if (hy > gy + 0.3) { y = hy; built = true; }
      }
    }
    b.foot.set(x, y, z);
    b.built = built;
    return b.foot;
  }

  update(dt) {
    if (!this.beams.length) return;
    const fx = this.fx;
    for (const b of this.beams) {
      b.t += dt;
      const B = b.B;
      if (b.t < b.charge) {
        // The mark on the ground tightens and brightens to the beam.
        const k = b.t / b.charge;
        const s = 1 + (1 - k) * 2.2;
        b.mark.scale.set(s, s, 1);
        b.mark.material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(b.t * 28));
        b.group.position.copy(b.foot);
        continue;
      }
      if (!b.lit) {
        b.lit = true;
        b.mark.visible = false;
        b.core.visible = b.flare.visible = true;
        for (const r of b.rays) r.visible = true;
      }
      // The focus: from a wide, faint array to the fine beam, and the ground
      // takes the full charge the moment it closes.
      const f = Math.min(1, (b.t - b.charge) / FOCUS);
      const fe = 1 - (1 - f) * (1 - f) * (1 - f);           // out-cubic
      const ring = B.width * 9 * (1 - fe);
      for (let k = 0; k < b.rays.length; k++) {
        const r = b.rays[k], a = b.t * 1.6 + k * Math.PI * 2 / 5;
        r.position.set(Math.cos(a) * ring, 0, Math.sin(a) * ring);
        r.material.opacity = 0.7 * (1 - fe);
        r.scale.set(Math.max(0.01, 0.4 + 0.6 * (1 - fe)), 1, 1);
        r.visible = f < 1;
      }
      if (f >= 1 && !b.landed) {
        b.landed = true;
        if (this.onLand) this.onLand(b);
        if (fx) { const gy = this.terrain.heightAt(b.foot.x, b.foot.z); fx.groundBurst(b.foot, 0.9 + B.width * 0.4, gy); fx.dustColumn(b.foot.x, b.foot.y, b.foot.z, 1 + B.width * 0.4); }
      }
      const cam = this.camera.position;
      const walk = Math.min(1, (b.t - b.charge) / B.walk);
      this._placeFoot(b, walk);
      b.group.position.copy(b.foot);
      if (b.sound && b.sound.move) b.sound.move(b.foot);
      // The flicker: the core breathes, the glow throbs out of step with it.
      const n1 = 0.82 + 0.18 * Math.sin(b.t * 61 + b.seed) * Math.sin(b.t * 17.3);
      const n2 = 0.75 + 0.25 * Math.sin(b.t * 23 + b.seed * 2) * Math.cos(b.t * 7.1);
      const end = b.t > b.dur - 0.35 ? Math.max(0, (b.dur - b.t) / 0.35) : 1;
      const wide = 1 + 3.5 * (1 - fe);                         // the beam closing down
      b.core.scale.set(Math.max(0.01, n1 * end * wide), 1, 1);
      b.core.material.opacity = (0.8 + 0.2 * n2) * (0.3 + 0.7 * fe);
      b.flare.scale.setScalar(B.width * (4 + 2.5 * n1) * end * (0.3 + 0.7 * fe));
      // The hand of God on the ground: a shake every frame, by the beam's
      // size and the camera's distance, and the earth's own roar under it.
      const dist = cam.distanceTo(b.foot);
      const near = Math.min(1, 110 / Math.max(30, dist));
      if (this.onShake) this.onShake((0.012 + 0.012 * Math.min(2, B.width)) * near * fe * end);
      if (this.audio && b.t - (b.rumbleAt ?? -9) > 0.5 && f >= 1) { b.rumbleAt = b.t; this.audio.rumble(Math.min(1, 0.45 + 0.2 * B.width) * end, b.foot); }
      // Turned to the camera, and leaning a hair as it walks, as if the
      // platform were slewing.
      // The lean: the column's axis tilted off the vertical on its heading,
      // the heading drifting, and the quads turned to the camera within it.
      const L = b.lean, tilt = L.userData.tilt + Math.sin(b.t * 2.3 + b.seed) * 0.004, az = L.userData.az + b.t * 0.06;
      this._axis.set(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
      L.quaternion.setFromUnitVectors(this._up, this._axis);
      b.group.rotation.set(0, 0, 0);
      b.group.updateMatrixWorld(true);
      const lc = L.worldToLocal(this._v.copy(cam));
      const yaw = Math.atan2(lc.x, lc.z);
      b.core.rotation.y = yaw;
      for (const r of b.rays) r.rotation.y = yaw;
      // The bites, and the show at the foot between them.
      while (b.t >= b.nextBite && b.t <= b.dur) {
        b.nextBite += B.tick;
        b.bites++;
        const at = b.foot.clone();
        at.y -= B.depth * (b.built ? 1 : 0.4);
        if (this.onBite) this.onBite(at, b.def.warhead, b.built, b);
        if (fx) {
          // Embers off whatever it is cutting, and the dirt thrown up from
          // under it: a ground burst every other bite on open ground, the
          // column of it every third, dust always.
          fx.stoneBurst(b.foot.x, b.foot.y, b.foot.z, 0.5 + B.width * 0.25, this._ember);
          fx.impactDust(b.foot.x, b.foot.y, b.foot.z, 0.8 + B.width * 0.35);
          if (!b.built && b.bites % 2 === 0) fx.groundBurst(b.foot, 0.45 + B.width * 0.2, this.terrain.heightAt(b.foot.x, b.foot.z));
          if (b.bites % 3 === 0) fx.dustColumn(b.foot.x, b.foot.y, b.foot.z, 0.6 + B.width * 0.35);
        }
      }
      if (fx && fx.trail) fx.trail(b.foot, 1.2 + B.width * 0.4);
      if (b.t >= b.dur) this._finish(b);
    }
    this.beams = this.beams.filter((b) => !b.done);
  }

  _finish(b) {
    if (b.done) return;
    b.done = true;
    if (b.sound && b.sound.stop) b.sound.stop();
    this.scene.remove(b.group);
    for (const m of [b.core, b.mark, ...b.rays]) { m.geometry.dispose(); m.material.dispose(); }
    b.flare.material.dispose();
    if (this.onDone) this.onDone(b);
  }

  /** Every beam shut off at once (the battle ending, a reload). */
  clear() { for (const b of this.beams) this._finish(b); this.beams.length = 0; }
}
