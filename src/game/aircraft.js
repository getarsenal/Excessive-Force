import * as THREE from 'three';

/**
 * The air wing.
 *
 * Two aircraft the player can call rather than place: a Strike Eagle on a
 * low pass with a 500 lb bomb, and a Lancer at height with the MOAB. Each
 * call is a sortie — the aircraft comes in from behind the camera so the
 * player sees it cross the target, releases where the ballistics say the
 * bomb will land on the point, flies through, pulls up and leaves.
 *
 * The aircraft are built here from primitives. They are seen for a few
 * seconds at a few hundred metres, and what makes an F-15 an F-15 at that
 * range is twin tails, a broad flat body between two engines and a long
 * nose; a B-1 is a long dark spindle with wings swept right back. Both are
 * a couple of hundred triangles.
 */

/** Dark grey, the way both of them are actually painted. */
const EAGLE_GREY = 0x565b61;
const LANCER_GREY = 0x3a3e43;

function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

/** A thin swept panel: a box with its near edge at (x0, z0), sweeping back. */
function panel(mat, span, chord, thick, sweep, y, side, z0, taper = 0.45) {
  // A tapered swept wing is a trapezoid; a box skewed by rotation is close
  // enough at this range, and the taper comes from a scaled far end.
  const g = new THREE.BoxGeometry(span, thick, chord);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = (x / span + 0.5);             // 0 at the root, 1 at the tip
    pos.setZ(i, pos.getZ(i) * (1 - t * (1 - taper)) - t * sweep);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.position.set(side * span / 2, y, z0);
  if (side < 0) m.scale.x = -1;
  m.castShadow = true;
  return m;
}

/** Nose forward along +Z, about 19 m long. */
export function makeEagle() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: EAGLE_GREY, roughness: 0.62, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.2, metalness: 0.7 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });

  // Body: a flat broad box between the intakes, a rounded nose ahead of it.
  g.add(part(new THREE.BoxGeometry(4.2, 1.5, 9.5), grey, 0, 0, -1.5));
  const nose = new THREE.ConeGeometry(0.85, 6.5, 10);
  nose.rotateX(Math.PI / 2);
  g.add(part(nose, grey, 0, 0.15, 6.4));
  g.add(part(new THREE.CylinderGeometry(0.85, 0.85, 3.4, 10).rotateX(Math.PI / 2), grey, 0, 0.15, 1.5));
  // Canopy.
  g.add(part(new THREE.BoxGeometry(1.2, 0.7, 3.2), glass, 0, 0.95, 1.0));
  // Intakes either side, square-jawed.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(1.3, 1.5, 4.0), dark, s * 2.0, -0.1, 1.5));
  }
  // Wings: broad, moderately swept, and the tailplanes behind them.
  for (const s of [-1, 1]) {
    g.add(panel(grey, 6.4, 5.6, 0.22, 3.2, 0.1, s, -1.2, 0.45));
    g.add(panel(grey, 3.0, 2.6, 0.18, 1.6, -0.2, s, -6.2, 0.5));
    // Twin tails, canted a touch outward.
    const tail = new THREE.BoxGeometry(0.16, 3.2, 2.6);
    const pos = tail.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 3.2 + 0.5;
      pos.setZ(i, pos.getZ(i) * (1 - t * 0.5) - t * 1.6);
    }
    tail.computeVertexNormals();
    g.add(part(tail, grey, s * 1.5, 1.9, -5.4, 0, 0, s * -0.12));
    // Engines: two nozzles with the burner lit.
    g.add(part(new THREE.CylinderGeometry(0.62, 0.72, 1.6, 10).rotateX(Math.PI / 2), dark, s * 0.85, -0.1, -7.0));
    const flame = new THREE.ConeGeometry(0.5, 4.2, 8);
    flame.rotateX(-Math.PI / 2);
    g.add(part(flame, glow, s * 0.85, -0.1, -9.6));
  }
  // The bomb on the centreline, until it is dropped.
  const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.0, 8).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5e6b3a, roughness: 0.6 }));
  bomb.position.set(0, -1.05, 0.5);
  bomb.name = 'bomb';
  g.add(bomb);
  return g;
}

/** Nose forward along +Z, about 45 m long. */
export function makeLancer() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: LANCER_GREY, roughness: 0.6, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.5, metalness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff9a3c, toneMapped: false });

  // A long blended spindle: cylinder, a long nose cone, a tapered tail.
  g.add(part(new THREE.CylinderGeometry(1.7, 1.9, 22, 12).rotateX(Math.PI / 2), grey, 0, 0, 2));
  const nose = new THREE.ConeGeometry(1.7, 12, 12);
  nose.rotateX(Math.PI / 2);
  g.add(part(nose, grey, 0, 0, 19));
  const tailcone = new THREE.ConeGeometry(1.9, 10, 12);
  tailcone.rotateX(-Math.PI / 2);
  g.add(part(tailcone, grey, 0, 0.2, -14));
  // The blended wing root, a flat slab the wings come out of.
  g.add(part(new THREE.BoxGeometry(9, 1.2, 12), grey, 0, -0.3, 0));
  // Wings swept right back, the way it flies fast.
  for (const s of [-1, 1]) {
    g.add(panel(grey, 15, 7.5, 0.35, 12.5, -0.3, s, 1.0, 0.3));
    // Two engines in a pod under each wing root.
    for (const k of [0, 1]) {
      const x = s * (4.2 + k * 1.9);
      g.add(part(new THREE.CylinderGeometry(0.9, 0.95, 7.5, 10).rotateX(Math.PI / 2), dark, x, -1.55, -4.0));
      const flame = new THREE.ConeGeometry(0.7, 6.0, 8);
      flame.rotateX(-Math.PI / 2);
      g.add(part(flame, glow, x, -1.55, -10.6));
    }
    g.add(panel(grey, 5.5, 4.0, 0.25, 3.4, 1.8, s, -13.5, 0.4));
  }
  // The tall fin.
  const fin = new THREE.BoxGeometry(0.3, 6.5, 6.0);
  const pos = fin.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 6.5 + 0.5;
    pos.setZ(i, pos.getZ(i) * (1 - t * 0.45) - t * 3.4);
  }
  fin.computeVertexNormals();
  g.add(part(fin, grey, 0, 3.6, -13));
  return g;
}

/**
 * Where to let go.
 *
 * Simulates the bomb's fall from the release height with the aircraft's
 * forward speed and its own drag until it is down at the target's height,
 * and returns how far along the run it travelled. Release that far short
 * of the target and it lands on the target.
 */
export function solveRelease(dropHeight, forwardSpeed, gravity, drag) {
  let x = 0, y = 0, vx = forwardSpeed, vy = 0, t = 0;
  const dt = 0.02;
  while (y > -dropHeight && t < 60) {
    vx -= vx * drag * dt;
    vy -= (gravity + vy * drag) * dt;
    x += vx * dt; y += vy * dt; t += dt;
  }
  return { distance: x, time: t };
}

export class AirWing {
  constructor(o) {
    this.scene = o.scene;
    this.quality = o.quality;
    this.terrain = o.terrain;
    this.projectiles = o.projectiles;
    this.fx = o.fx;
    this.audio = o.audio || null;
    this.camera = o.camera;
    this.sorties = [];
    this._v = new THREE.Vector3();
  }

  /**
   * Send one aircraft at a point.
   * @param {object} def   the unit definition, with `strike` and `aircraft`
   * @param {THREE.Vector3} target
   * @param {number} ceiling  the highest standing masonry near the run, so a
   *                          low pass is low but not through the tower
   */
  call(def, target, ceiling) {
    const a = def.aircraft;
    const p = def.projectile;
    // Run in from behind the camera, across the target, and out the far side.
    const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
    // Offset the run a touch to one side so it never flies straight down
    // the camera's own line and vanishes behind the HUD.
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const alt = Math.max(target.y + a.height, ceiling + a.clearance);
    const drop = alt - target.y;
    const rel = solveRelease(drop, a.speed, p.gravity, p.drag || 0);
    const model = def.aircraft.kind === 'lancer' ? makeLancer() : makeEagle();
    // The start is pushed off the camera's line; the run is then re-aimed
    // from there straight through the target, so the bomb still lands on
    // it and the aircraft crosses it at a slight angle to the view.
    model.position.copy(target).addScaledVector(dir, -a.runIn).addScaledVector(side, a.offset || 0);
    dir.set(target.x - model.position.x, 0, target.z - model.position.z).normalize();
    side.set(-dir.z, 0, dir.x);
    model.rotation.y = Math.atan2(dir.x, dir.z);
    model.position.y = alt;
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    this.scene.add(model);
    const runLen = Math.hypot(target.x - model.position.x, target.z - model.position.z);
    const s = {
      def, model, dir, side, alt, target: target.clone(),
      speed: a.speed, t: 0, released: false,
      releaseAt: (runLen - rel.distance) / a.speed,   // seconds into the run
      pullUpAt: runLen / a.speed + 1.2,
      climb: 0, roar: 0, life: 0,
      fall: rel.time,
    };
    this.sorties.push(s);
    return s;
  }

  update(dt) {
    for (const s of this.sorties) {
      s.t += dt;
      const m = s.model;
      // Straight and level, then a climbing turn away once past the target.
      if (s.t > s.pullUpAt) {
        s.climb = Math.min(1, s.climb + dt * 0.5);
      }
      const pitch = s.climb * 0.42;
      const vx = s.dir.x * Math.cos(pitch), vz = s.dir.z * Math.cos(pitch), vy = Math.sin(pitch);
      m.position.x += vx * s.speed * dt;
      m.position.z += vz * s.speed * dt;
      m.position.y += vy * s.speed * dt;
      m.rotation.x = -pitch;
      // A little bank into the pull-up so it reads as a turn, not a lift.
      m.rotation.z = s.climb * 0.5;

      // Let go.
      if (!s.released && s.t >= s.releaseAt) {
        s.released = true;
        const bomb = m.getObjectByName('bomb');
        if (bomb) bomb.visible = false;
        const p = s.def.projectile;
        this.projectiles.fire({
          pos: m.position.clone().setY(m.position.y - 1.6),
          vel: new THREE.Vector3(s.dir.x * s.speed, 0, s.dir.z * s.speed),
          gravity: p.gravity, kind: 'bomb', drag: p.drag || 0, speed: s.speed,
          warhead: s.def.warhead, owner: null, target: s.target, trail: p.trail,
          strikeDef: s.def,
        });
        if (this.audio) this.audio.play('rocket', m.position, { rate: 0.7, gain: 0.5, rolloff: 900 });
      }

      // Engine smoke and the roar. The roar is the rocket clip pitched down,
      // played on a short cycle while the aircraft is anywhere near.
      if (this.fx && this.quality.name !== 'low') {
        this._v.copy(m.position).addScaledVector(s.dir, -10);
        this._v.y -= 0.5;
        this.fx.trail(this._v, 1.6);
      }
      s.roar -= dt;
      if (s.roar <= 0 && this.audio) {
        s.roar = 1.1;
        const d = this.camera.position.distanceTo(m.position);
        if (d < 2400) {
          this.audio.play('rocket', m.position, {
            rate: s.def.aircraft.kind === 'lancer' ? 0.42 : 0.55, gain: 0.55, rolloff: 1400,
          });
        }
      }

      // Gone once it is well past and climbing away.
      s.life = s.t - s.pullUpAt;
      if (s.life > 14 || m.position.y > s.alt + 1600) s.done = true;
    }
    for (const s of this.sorties) {
      if (s.done) this.scene.remove(s.model);
    }
    this.sorties = this.sorties.filter((s) => !s.done);
  }

  get active() { return this.sorties.length; }
}
