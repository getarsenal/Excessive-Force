/**
 * The lasgun: a beam from orbit.
 *
 * Nothing flies. About a second after the call a column of light stands
 * on the start of the line the player drew and walks it, burning through
 * whatever it crosses — the Harkonnen lasgun chasing the ornithopter across
 * the Arrakeen field. There is no run-in for the flak to work on and no
 * aircraft to lose; the price buys the instant.
 *
 * The beam is drawn, not simulated: a white core, a violet sheath and a
 * wide orange glow, three open cylinders standing `TOP` metres over the
 * foot with their alpha fading to nothing up the column (a four-component
 * colour attribute, so the ordinary basic material does the fade), their
 * radius flickering every frame, a flare sprite at the foot. The damage is
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

/** An open cylinder whose alpha fades from `a0` at the foot to nought at the top. */
function column(radius, colour, a0, order) {
  const geo = new THREE.CylinderGeometry(radius, radius, TOP, 14, 6, true);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 4);
  const c = new THREE.Color(colour);
  for (let i = 0; i < pos.count; i++) {
    const h = (pos.getY(i) + TOP / 2) / TOP;           // 0 at the foot, 1 at the top
    const a = a0 * Math.pow(1 - h, 1.6);
    col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = a;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  }));
  m.renderOrder = order;
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
    this._v = new THREE.Vector3();
    this._down = { x: 0, y: -1, z: 0 };
  }

  /** The beam called on the line `from`→`to` (already clamped by the caller). */
  call(def, from, to) {
    const B = def.strike.beam;
    const g = new THREE.Group();
    const core = column(B.width * 0.38, 0xffffff, 1.0, 40);
    const sheath = column(B.width * 0.9, 0xc8a8ff, 0.55, 39);
    const glow = column(B.width * 2.6, 0xff6a24, 0.22, 38);
    for (const m of [glow, sheath, core]) { m.position.y = TOP / 2; g.add(m); }
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flareTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    }));
    flare.renderOrder = 41;
    flare.scale.setScalar(B.width * 9);
    g.add(flare);
    // The targeting mark before the beam: a thin ring on the ground, pulsing.
    const mark = new THREE.Mesh(new THREE.RingGeometry(B.width * 2.2, B.width * 2.8, 32),
      new THREE.MeshBasicMaterial({ color: 0xff8a40, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    mark.rotation.x = -Math.PI / 2;
    mark.renderOrder = 36;
    g.add(mark);
    g.visible = true;
    core.visible = sheath.visible = glow.visible = flare.visible = false;
    this.scene.add(g);
    const b = {
      def, B, from: from.clone(), to: to.clone(), t: 0, done: false,
      foot: from.clone(), group: g, core, sheath, glow, flare, mark,
      charge: B.charge, dur: B.charge + B.walk + B.hold, nextBite: B.charge, bites: 0,
      sound: null, seed: Math.random() * 100, lit: false,
    };
    this._placeFoot(b, 0);
    g.position.copy(b.foot);
    b.sound = this.audio ? lasgun(this.audio, b.foot, b.dur, B.width >= 2.5 ? 1 : 0.7, B.charge) : null;
    this.beams.push(b);
    return b;
  }

  /** The point `u` of the way down the line, on the first thing under the sky there. */
  _placeFoot(b, u) {
    const x = b.from.x + (b.to.x - b.from.x) * u, z = b.from.z + (b.to.z - b.from.z) * u;
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
        b.core.visible = b.sheath.visible = b.glow.visible = b.flare.visible = true;
      }
      const walk = Math.min(1, (b.t - b.charge) / B.walk);
      this._placeFoot(b, walk);
      b.group.position.copy(b.foot);
      if (b.sound && b.sound.move) b.sound.move(b.foot);
      // The flicker: the core breathes, the glow throbs out of step with it.
      const n1 = 0.82 + 0.18 * Math.sin(b.t * 61 + b.seed) * Math.sin(b.t * 17.3);
      const n2 = 0.75 + 0.25 * Math.sin(b.t * 23 + b.seed * 2) * Math.cos(b.t * 7.1);
      const end = b.t > b.dur - 0.35 ? Math.max(0, (b.dur - b.t) / 0.35) : 1;
      b.core.scale.set(n1 * end, 1, n1 * end);
      b.sheath.scale.set(n2 * end, 1, n2 * end);
      b.glow.scale.set((0.8 + 0.4 * n2) * end, 1, (0.8 + 0.4 * n2) * end);
      b.flare.scale.setScalar(B.width * (7 + 4 * n1) * end);
      // The column leans a hair as it walks, as if the platform were slewing.
      b.group.rotation.z = Math.sin(b.t * 3.1 + b.seed) * 0.004;
      b.group.rotation.x = Math.cos(b.t * 2.3 + b.seed) * 0.004;
      // The bites, and the show at the foot between them.
      while (b.t >= b.nextBite && b.t <= b.dur) {
        b.nextBite += B.tick;
        b.bites++;
        const at = b.foot.clone();
        at.y -= B.depth * (b.built ? 1 : 0.4);
        if (this.onBite) this.onBite(at, b.def.warhead, b.built, b);
        if (fx) {
          fx.stoneBurst(b.foot.x, b.foot.y, b.foot.z, 0.5 + B.width * 0.25, 0xffb060);
          fx.impactDust(b.foot.x, b.foot.y, b.foot.z, 0.6 + B.width * 0.3);
          if (b.bites % 3 === 0) fx.dustColumn(b.foot.x, b.foot.y, b.foot.z, 0.5 + B.width * 0.3);
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
    for (const m of [b.core, b.sheath, b.glow, b.mark]) { m.geometry.dispose(); m.material.dispose(); }
    b.flare.material.dispose();
    if (this.onDone) this.onDone(b);
  }

  /** Every beam shut off at once (the battle ending, a reload). */
  clear() { for (const b of this.beams) this._finish(b); this.beams.length = 0; }
}
