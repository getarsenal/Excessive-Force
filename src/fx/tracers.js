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

const MAX_TRACERS = 480;
/** The player's own rounds, in a pool of their own so they are never crowded out. */
const MAX_PLAYER = 200;
const MAX_FLASHES = 128;
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
  // The player's guns carry `player`: their rounds always get a slot, and
  // they are held to a wider streak on screen (`minPx`) than the garrison's,
  // because nine rounds from one team have to read against three hundred
  // from the other side.
  chaingun: { color: 0xffb21a, core: 0xfff4d8, speed: 820, len: 14.0, width: 0.16, flash: 1.6, player: true, minPx: 1.4, every: 2 },
  // American 7.62 burns red, which is also what tells the player's bursts
  // apart from the garrison's orange.
  m240: { color: 0xff4a24, core: 0xffd8c0, speed: 760, len: 12.0, width: 0.14, flash: 1.4, player: true, minPx: 1.3, every: 3 },
  // The A-10's 30 mm: long, fat and fast, and a flash at the nose like a torch.
  // One in five, as the combat mix is loaded; 30 mm is fatter than rifle
  // tracer but not by much at this range.
  gau8: { color: 0xffa020, core: 0xfff0c0, speed: 1050, len: 14.0, width: 0.16, flash: 2.2, player: true, minPx: 1.1, every: 5 },
};
const DEFAULT_LOOK = LOOK.rifleman;
/**
 * The narrowest a streak is drawn, in screen pixels, whatever its calibre.
 *
 * A 0.34 m streak at four hundred metres is three quarters of a pixel: the
 * garrison's fire still reads because there is so much of it, and a single
 * machine-gun team's burst simply was not there. Widening with distance
 * keeps a tracer a line on the screen at any zoom; up close the real width
 * is larger and wins.
 */
const MIN_PX = 0.9;

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

    // ── The player's tracers: the same streak, but drawn solid rather than
    // added. Added light is how a tracer glows at dusk, and over a sunlit
    // city it is nearly nothing: red added to a pale roof is a pale roof.
    // Solid, it is a red line on any ground at any distance, and it tells
    // the player's fire from the garrison's at a glance.
    this.playerMesh = new THREE.InstancedMesh(
      tGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }),
      MAX_PLAYER,
    );
    this._prepare(this.playerMesh, MAX_PLAYER);

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

    scene.add(this.tracerMesh, this.playerMesh, this.flashMesh, this.sparkMesh);

    this.tracers = [];
    this.ptracers = [];
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

    const dist = from.distanceTo(to);
    if (dist < 0.01) return;

    // Where the round actually goes. A hit lands on the man, near enough; a
    // miss goes past him by a margin that grows with the range — a rifle's
    // cone at three hundred metres is metres across, not centimetres — and
    // carries on beyond, which is what makes fire that is missing look like
    // fire that is missing rather than a beam that stops at its target.
    const aim = to.clone();
    const scatter = hit ? 0.25 : Math.max(1.2, dist * 0.014);
    aim.x += (Math.random() - 0.5) * scatter * 2;
    aim.y += (Math.random() - 0.5) * scatter * (hit ? 1 : 0.9);
    aim.z += (Math.random() - 0.5) * scatter * 2;
    const dir = new THREE.Vector3().subVectors(aim, from);
    const reach = dir.length();
    dir.multiplyScalar(1 / reach);
    // A round fired downward that misses meets the ground at its scatter
    // point, kicks up dirt and may skip off it; one fired level or upward
    // (at a man in a window, at an aircraft) goes on past.
    const intoGround = !hit && dir.y < -0.04;
    const end = hit || intoGround ? reach : reach * (1.08 + Math.random() * 0.25);

    // Not every round is a tracer. A belt is loaded one in four or five; the
    // player's guns show one in `every`, which is enough to see the stream
    // walk and few enough that it does not read as a solid bar.
    if (look.every) {
      this._belt = (this._belt || 0) + 1;
      if (this._belt % look.every) {
        this._flash(from, dir, look, def?.hand);
        return;
      }
    }

    const rec = {
      player: !!look.player, minPx: look.minPx ?? MIN_PX,
      from: from.clone(), dir: dir.clone(), end, t: 0,
      speed: look.speed, len: look.len, width: look.width,
      color: look.color, core: look.core, hit, ground: intoGround,
      aim: from.clone().addScaledVector(dir, end),
      // Most of the garrison's tracers burn full; some are dim, which keeps
      // three hundred rifles from reading as one sheet of light. The
      // player's are thinned by `every` instead.
      bright: look.player || Math.random() < 0.82 ? 1 : 0.34,
    };
    if (look.player) {
      if (this.ptracers.length >= MAX_PLAYER) this.ptracers.shift();
      this.ptracers.push(rec);
    } else if (this.tracers.length < MAX_TRACERS) {
      this.tracers.push(rec);
    }

    this._flash(from, dir, look, def?.hand);
  }

  /** A tracer off the ground at a new angle, dimmer, slower and short-lived. */
  _ricochet(t, live) {
    const d = t.dir.clone();
    d.y = Math.abs(d.y) * (1.5 + Math.random() * 4) + 0.1;
    d.x += (Math.random() - 0.5) * 0.9;
    d.z += (Math.random() - 0.5) * 0.9;
    d.normalize();
    live.push({
      player: t.player, minPx: t.minPx, rico: true,
      from: t.aim.clone(), dir: d, end: 12 + Math.random() * 40, t: 0,
      speed: t.speed * 0.45, len: t.len * 0.6, width: t.width * 0.8,
      color: t.color, core: t.core, hit: true, aim: t.aim, bright: 0.55,
    });
  }

  /**
   * The muzzle flash: every round has one, tracer or not. A round fired by
   * the player's own hand (`hand`) is seen from the gunner's eye a foot
   * behind the muzzle, where the flash that reads from fifty metres fills
   * the screen: his is a sixteenth the size (a hand's breadth at the
   * muzzle), a third the light, briefer, and never widened to a minimum
   * on the screen.
   */
  _flash(from, dir, look, hand = false) {
    if (this.flashes.length >= MAX_FLASHES && look.player) {
      const k = this.flashes.findIndex((f) => !f.player);
      if (k >= 0) this.flashes.splice(k, 1);
    }
    if (this.flashes.length < MAX_FLASHES) {
      this.flashes.push({
        pos: from.clone(), dir: dir.clone(), t: 0,
        life: hand ? 0.03 : 0.055 + look.flash * 0.012,
        size: 0.9 * look.flash * (hand ? 0.06 : 1), color: look.core, player: !!look.player,
        minPx: look.player && !hand ? 3 : 0,
        gain: hand ? 0.3 : 1,
        roll: Math.random() * Math.PI,
      });
    }
  }

  /** Sparks where something lands. Also used by mortar rounds. */
  impact(point, colour = 0xffb870, n = 6, energy = 1, big = false) {
    // The player's own hits are never the ones dropped for want of a slot.
    if (big) while (this.sparks.length > MAX_SPARKS - n) this.sparks.shift();
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
        color: colour, minPx: big ? 4 : 0,
      });
    }
  }

  update(dt) {
    this._updateTracers(dt);
    this._updateFlashes(dt);
    this._updateSparks(dt);
  }

  _updateTracers(dt) {
    this.tracers = this._updateList(this.tracers, this.tracerMesh, MAX_TRACERS, dt, true);
    this.ptracers = this._updateList(this.ptracers, this.playerMesh, MAX_PLAYER, dt, false);
  }

  _updateList(list, mesh, cap, dt, additive) {
    let w = 0;
    const live = [];
    for (const t of list) {
      t.t += dt;
      const travelled = t.t * t.speed;
      if (travelled - t.len > t.end) {
        if (t.rico) continue;
        // Where the player's burst lands, said loudly enough to see from the
        // camera: a spurt of sparks and grit, bigger when it connected.
        // A round that flew on past its target and burnt out in the air
        // leaves nothing to see where it ended.
        if (t.hit || t.ground) {
          if (t.player) this.impact(t.aim, t.hit ? 0xffb070 : 0xc8b89a, t.hit ? 6 : 4, t.hit ? 1.2 : 0.9, true);
          else if (t.hit) this.impact(t.aim, 0xffd0a0, 4, 0.7);
          else this.impact(t.aim, 0x9fb6c8, 3, 0.5);
        }
        // A miss that meets the ground at a shallow angle skips off it: the
        // tracer kicks up and away at a fraction of its speed and burns out.
        if (t.ground && Math.random() < 0.3) this._ricochet(t, live);
        continue;
      }
      live.push(t);
      if (w >= cap) continue;

      const tip = Math.min(travelled, t.end);
      const tail = Math.max(0, tip - t.len);
      const len = tip - tail;
      if (len <= 0.01) continue;

      this._v.copy(t.from).addScaledVector(t.dir, tip);
      this._q.setFromUnitVectors(this._up, t.dir);
      let wid = t.width;
      if (this._cam) wid = Math.max(wid, this._v.distanceTo(this._cam.position) * this._mPerPx * t.minPx);
      this._s.set(wid, wid, len);
      this._m4.compose(this._v, this._q, this._s);
      mesh.setMatrixAt(w, this._m4);

      if (additive) {
        // Bright at the tip, cooling along the streak: approximated by fading
        // the whole instance as it ages, which at this size reads the same.
        // The overall gain is well above 1 because this is additive over a
        // daylit scene — at unit brightness a warm tracer washes out to a
        // grey smear.
        const fade = t.bright * (1 - Math.min(1, (t.t * t.speed) / (t.end + t.len)) * 0.35);
        this._c2.setHex(t.color);
        this._c.setHex(t.core).lerp(this._c2, 0.62).multiplyScalar(fade * 2.1);
      } else {
        // Solid: the hot colour itself, a little lighter toward the core.
        this._c2.setHex(t.core);
        this._c.setHex(t.color).lerp(this._c2, 0.18);
      }
      mesh.instanceColor.setXYZ(w, this._c.r, this._c.g, this._c.b);
      w++;
    }
    mesh.count = w;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    return live;
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
      let s = f.size * (0.5 + k * 1.5);
      this._v.copy(f.pos).addScaledVector(f.dir, 0.35);
      if (this._cam && f.minPx) s = Math.max(s, this._v.distanceTo(this._cam.position) * this._mPerPx * f.minPx * (0.5 + k * 0.5));
      this._q.setFromUnitVectors(this._up, f.dir);
      this._q.multiply(this._qRoll.setFromAxisAngle(this._up, f.roll));
      this._s.set(s, s, s);
      this._m4.compose(this._v, this._q, this._s);
      this.flashMesh.setMatrixAt(w, this._m4);
      this._c.setHex(f.color).multiplyScalar(k * k * 2.4 * (f.gain || 1));
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
      let sz = s.size;
      if (s.minPx && this._cam) sz = Math.max(sz, s.pos.distanceTo(this._cam.position) * this._mPerPx * s.minPx);
      this._s.set(sz, sz, sz);
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
    this._cam = camera;
    // Metres a screen pixel covers at one metre's distance.
    const h = (typeof window !== 'undefined' && window.innerHeight) || 720;
    this._mPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 50) / 2)) / h;
  }

  clear() {
    this.tracers.length = 0;
    this.ptracers.length = 0;
    this.flashes.length = 0;
    this.sparks.length = 0;
    for (const m of [this.tracerMesh, this.playerMesh, this.flashMesh, this.sparkMesh]) m.count = 0;
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
