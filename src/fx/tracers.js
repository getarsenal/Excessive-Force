import * as THREE from 'three';

/**
 * Small-arms fire, as something you can actually read.
 *
 * The old version drew each shot as a straight yellow line from muzzle to
 * target for one frame. It carried no information: you couldn't tell where a
 * burst came from, which way it was going, whether it connected, or what was
 * shooting at you.
 *
 * What replaces it is the three things you actually see when a round is fired
 * at you from a building:
 *
 *   - a **muzzle flash** at the window, bright, wide, and gone in 50 ms — this
 *     is what tells you which embrasure to shell next;
 *   - a **tracer** that *travels*: a short bright streak flying the gap at the
 *     round's real speed, so a sniper shot from 400 m visibly takes longer to
 *     arrive than an MG burst from 80 m, and you can see the line of fire
 *     converging on a gun before the damage lands;
 *   - an **impact**: sparks and a dust puff where the round strikes, in a
 *     different colour depending on whether it hit or went wide, so suppression
 *     reads differently from effective fire.
 *
 * Everything is instanced — three draw calls for the entire garrison's fire —
 * and each weapon gets its own colour, streak length and calibre, so an AT
 * rocket does not look like a rifle round.
 */

const MAX_TRACERS = 320;
const MAX_FLASHES = 96;
const MAX_SPARKS = 220;

/**
 * Per-weapon look. Speed is metres/second of visible travel.
 *
 * The streaks are drawn far wider than a bullet is — a 7.62 mm round is 8 mm
 * across, and at the distances this camera works at, a geometrically honest
 * tracer is a fraction of a pixel and simply invisible. What a tracer actually
 * looks like at night is a bright line, because the eye integrates it; these
 * widths are what reproduce that impression in daylight at 150 m.
 */
const LOOK = {
  rifleman: { color: 0xffa832, core: 0xfff0d0, speed: 520, len: 9.0, width: 0.30, flash: 1.0 },
  mg: { color: 0xff7a18, core: 0xffd090, speed: 560, len: 12.0, width: 0.36, flash: 1.35 },
  sniper: { color: 0x62d8ff, core: 0xffffff, speed: 780, len: 16.0, width: 0.30, flash: 1.5 },
  at: { color: 0xff3a12, core: 0xffc078, speed: 210, len: 5.0, width: 0.62, flash: 2.6 },
  mortar: { color: 0xff3a12, core: 0xffc078, speed: 220, len: 4.5, width: 0.56, flash: 2.4 },
};
const DEFAULT_LOOK = LOOK.rifleman;

export class TracerFX {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.enabled = true;

    // ── Tracers: a unit-length box along +Z, scaled per instance to the
    // streak's width and length and oriented down the line of flight.
    const tGeo = new THREE.BoxGeometry(1, 1, 1);
    // Pivot at the leading tip with the body trailing along local +Z, which the
    // orientation below maps to the direction the round came from.
    tGeo.translate(0, 0, 0.5);
    this.tracerMesh = new THREE.InstancedMesh(
      tGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
      MAX_TRACERS,
    );
    this._prepare(this.tracerMesh, MAX_TRACERS);

    // ── Muzzle flashes: a camera-facing star.
    this.flashMesh = new THREE.InstancedMesh(
      flashGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
        toneMapped: false, side: THREE.DoubleSide,
      }),
      MAX_FLASHES,
    );
    this._prepare(this.flashMesh, MAX_FLASHES);
    this.flashMesh.renderOrder = 12;

    // ── Impact sparks: tiny billboards that fall and fade.
    this.sparkMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide,
      }),
      MAX_SPARKS,
    );
    this._prepare(this.sparkMesh, MAX_SPARKS);

    scene.add(this.tracerMesh, this.flashMesh, this.sparkMesh);

    this.tracers = [];
    this.flashes = [];
    this.sparks = [];
    this.fired = 0;

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._c2 = new THREE.Color();
    this._qRoll = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 0, -1);
  }

  _prepare(mesh, max) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  /**
   * Register one shot.
   * @param {THREE.Vector3} from muzzle
   * @param {THREE.Vector3} to   where the round is going
   * @param {object} def         the defender type (carries `look` or a name)
   * @param {boolean} hit        did it connect?
   */
  fire(from, to, def, hit) {
    if (!this.enabled) return;
    const look = LOOK[def?.look] || LOOK[def?.key] || DEFAULT_LOOK;
    this.fired++;

    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return;
    dir.multiplyScalar(1 / dist);

    // A miss goes past the target rather than stopping at it — that is what
    // makes suppression legible: rounds cracking around the gun, not into it.
    const end = hit ? dist : dist * (1.02 + Math.random() * 0.06);
    const scatter = hit ? 0 : 1.4;

    const aim = to.clone();
    if (!hit) {
      aim.x += (Math.random() - 0.5) * scatter * 2;
      aim.y += (Math.random() - 0.5) * scatter * 2;
      aim.z += (Math.random() - 0.5) * scatter * 2;
    }

    if (this.tracers.length < MAX_TRACERS) {
      this.tracers.push({
        from: from.clone(), dir: dir.clone(), end, t: 0,
        speed: look.speed, len: look.len, width: look.width,
        color: look.color, core: look.core, hit, aim,
        // Not every round is a tracer; every fourth or so glows, which is both
        // correct and stops a burst reading as a solid bar of light.
        bright: Math.random() < 0.82 ? 1 : 0.34,
      });
    }

    if (this.flashes.length < MAX_FLASHES) {
      this.flashes.push({
        pos: from.clone(), dir: dir.clone(), t: 0,
        life: 0.055 + look.flash * 0.012,
        size: 0.9 * look.flash, color: look.core,
        roll: Math.random() * Math.PI,
      });
    }
  }

  /** Sparks where something lands. Also used by mortar rounds. */
  impact(point, colour = 0xffb870, n = 6, energy = 1) {
    for (let i = 0; i < n && this.sparks.length < MAX_SPARKS; i++) {
      this.sparks.push({
        pos: point.clone(),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 9 * energy,
          Math.random() * 7 * energy + 1.2,
          (Math.random() - 0.5) * 9 * energy,
        ),
        t: 0, life: 0.22 + Math.random() * 0.3,
        size: 0.16 + Math.random() * 0.22 * energy,
        color: colour,
      });
    }
  }

  update(dt) {
    this._updateTracers(dt);
    this._updateFlashes(dt);
    this._updateSparks(dt);
  }

  _updateTracers(dt) {
    let w = 0;
    const live = [];
    for (const t of this.tracers) {
      t.t += dt;
      const travelled = t.t * t.speed;
      if (travelled - t.len > t.end) {
        if (t.hit) this.impact(t.aim, 0xffd0a0, 4, 0.7);
        else this.impact(t.aim, 0x9fb6c8, 3, 0.5);
        continue;
      }
      live.push(t);
      if (w >= MAX_TRACERS) continue;

      const tip = Math.min(travelled, t.end);
      const tail = Math.max(0, tip - t.len);
      const len = tip - tail;
      if (len <= 0.01) continue;

      this._v.copy(t.from).addScaledVector(t.dir, tip);
      this._q.setFromUnitVectors(this._up, t.dir);
      this._s.set(t.width, t.width, len);
      this._m4.compose(this._v, this._q, this._s);
      this.tracerMesh.setMatrixAt(w, this._m4);

      // Bright at the tip, cooling along the streak: approximated by fading the
      // whole instance as it ages, which at this size reads the same. The
      // overall gain is well above 1 because this is additive over a daylit
      // scene — at unit brightness a warm tracer washes out to a grey smear.
      const fade = t.bright * (1 - Math.min(1, (t.t * t.speed) / (t.end + t.len)) * 0.35);
      this._c2.setHex(t.color);
      this._c.setHex(t.core).lerp(this._c2, 0.62).multiplyScalar(fade * 2.1);
      this.tracerMesh.instanceColor.setXYZ(w, this._c.r, this._c.g, this._c.b);
      w++;
    }
    this.tracers = live;
    this.tracerMesh.count = w;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    this.tracerMesh.instanceColor.needsUpdate = true;
  }

  _updateFlashes(dt) {
    let w = 0;
    const live = [];
    for (const f of this.flashes) {
      f.t += dt;
      if (f.t > f.life) continue;
      live.push(f);
      if (w >= MAX_FLASHES) continue;
      const k = 1 - f.t / f.life;
      // Flashes out fast and wide, then collapses.
      const s = f.size * (0.5 + k * 1.5);
      this._v.copy(f.pos).addScaledVector(f.dir, 0.35);
      this._q.setFromUnitVectors(this._up, f.dir);
      this._q.multiply(this._qRoll.setFromAxisAngle(this._up, f.roll));
      this._s.set(s, s, s);
      this._m4.compose(this._v, this._q, this._s);
      this.flashMesh.setMatrixAt(w, this._m4);
      this._c.setHex(f.color).multiplyScalar(k * k * 2.4);
      this.flashMesh.instanceColor.setXYZ(w, this._c.r, this._c.g, this._c.b);
      w++;
    }
    this.flashes = live;
    this.flashMesh.count = w;
    this.flashMesh.instanceMatrix.needsUpdate = true;
    this.flashMesh.instanceColor.needsUpdate = true;
  }

  _updateSparks(dt) {
    let w = 0;
    const live = [];
    for (const s of this.sparks) {
      s.t += dt;
      if (s.t > s.life) continue;
      s.vel.y -= 22 * dt;
      s.pos.addScaledVector(s.vel, dt);
      live.push(s);
      if (w >= MAX_SPARKS) continue;
      const k = 1 - s.t / s.life;
      this._s.set(s.size, s.size, s.size);
      this._m4.compose(s.pos, this._camQuat || this._q.identity(), this._s);
      this.sparkMesh.setMatrixAt(w, this._m4);
      this._c.setHex(s.color).multiplyScalar(k * 1.8);
      this.sparkMesh.instanceColor.setXYZ(w, this._c.r, this._c.g, this._c.b);
      w++;
    }
    this.sparks = live;
    this.sparkMesh.count = w;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.sparkMesh.instanceColor.needsUpdate = true;
  }

  /** Billboarding for the sparks; called once a frame with the live camera. */
  setCamera(camera) {
    this._camQuat = camera.quaternion;
  }

  clear() {
    this.tracers.length = 0;
    this.flashes.length = 0;
    this.sparks.length = 0;
    for (const m of [this.tracerMesh, this.flashMesh, this.sparkMesh]) m.count = 0;
  }
}

/** A four-point star, so a flash reads as a flash rather than a dot. */
function flashGeometry() {
  const shapes = [];
  const quad = (w, h) => {
    const g = new THREE.PlaneGeometry(w, h);
    return g;
  };
  const a = quad(1.0, 0.22);
  const b = quad(0.22, 1.0);
  const c = quad(0.62, 0.62);
  c.rotateZ(Math.PI / 4);
  shapes.push(a, b, c);

  // Merge by hand: three small plane geometries into one buffer.
  let vtx = 0, idx = 0;
  for (const g of shapes) { vtx += g.attributes.position.count; idx += g.index.count; }
  const pos = new Float32Array(vtx * 3);
  const index = new Uint16Array(idx);
  let vo = 0, io = 0;
  for (const g of shapes) {
    const p = g.attributes.position.array;
    pos.set(p, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

export { LOOK as TRACER_LOOK };
