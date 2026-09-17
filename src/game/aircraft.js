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
 * The aircraft are built here rather than loaded. They are seen for a few
 * seconds at a few hundred metres, and what carries an airframe at that
 * range is its silhouette against the sky: the F-15 is twin tails over a
 * flat tunnel between square intakes, the B-1 a long blended spindle with
 * the wings pinned right back. So the bodies are lofted — a run of cross
 * sections down the length, skinned — rather than assembled from cylinders,
 * because the shape between the sections is where an aircraft stops looking
 * like plumbing. Both are under a thousand triangles.
 *
 * Real dimensions throughout, in metres: the Eagle is 19.4 long on a 13.1
 * span, the Lancer 44.5 on 24.1 with the wings swept.
 *
 * Both are built nose along +Z, which is the axis the sortie flies down.
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

/**
 * Skin a run of cross sections.
 *
 * Each station is `{ z, w, h, y, n }`: where it sits down the body, how wide
 * and how tall it is there, how far its centre is off the axis, and how
 * square it is — `n` of 2 is an ellipse, 4 a rounded rectangle, and the
 * Eagle goes from one to the other between the radome and the nozzles.
 * A station with no width closes the body to a point, which is how both
 * noses and the Lancer's tailcone are made.
 */
function loft(stations, seg = 12) {
  const pos = [], idx = [];
  const ring = (st) => {
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const p = 2 / (st.n ?? 2.6);
      pos.push(
        Math.sign(c) * Math.abs(c) ** p * st.w * 0.5,
        Math.sign(s) * Math.abs(s) ** p * st.h * 0.5 + (st.y ?? 0),
        st.z,
      );
    }
  };
  for (const st of stations) ring(st);
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + (k + 1) % seg;
      idx.push(a, b, a + seg, b, b + seg, a + seg);
    }
  }
  // Cap both ends so the body is closed from any angle, including the one
  // the player gets when it goes over the top of the camera.
  for (const end of [0, stations.length - 1]) {
    const base = pos.length / 3;
    const st = stations[end];
    pos.push(0, st.y ?? 0, st.z);
    for (let k = 0; k < seg; k++) {
      const a = end * seg + k, b = end * seg + (k + 1) % seg;
      if (end === 0) idx.push(base, b, a); else idx.push(base, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * One flying surface: a tapered, swept panel with a ridge down it.
 *
 * Built out to +x from a root at the origin, leading edge at z = 0 and the
 * trailing edge aft at -chord. The section is a flattened diamond rather
 * than a slab, so the light breaks along the ridge and the surface reads as
 * a wing from above; a box catches one flat highlight and reads as a plank.
 * `sweep` is how far back the leading edge has gone by the tip, in metres,
 * which is easier to eyeball against a photograph than an angle.
 */
function surface(o) {
  const { span, root, tip, sweep, thick, dihedral = 0, ridge = 0.38 } = o;
  const y1 = Math.sin(dihedral) * span;
  const half = thick * 0.5;
  const pos = [
    0, 0, 0,                      0, half, -root * ridge,          0, 0, -root,
    span, y1, -sweep,             span, y1 + half * 0.55, -sweep - tip * ridge,
    span, y1, -sweep - tip,
    0, 0, 0,                      0, -half, -root * ridge,         0, 0, -root,
    span, y1, -sweep,             span, y1 - half * 0.55, -sweep - tip * ridge,
    span, y1, -sweep - tip,
  ];
  //  0-5 upper: LE root, ridge root, TE root, LE tip, ridge tip, TE tip
  //  6-11 lower, the same six points with the ridge pushed the other way.
  const quads = [
    [0, 1, 4, 3], [1, 2, 5, 4],        // upper skin, fore and aft of the ridge
    [6, 7, 10, 9], [7, 8, 11, 10],     // lower skin
    [2, 5, 11, 8],                     // trailing edge
    [3, 4, 10, 9], [4, 5, 11, 10],     // tip
    [0, 1, 7, 6], [1, 2, 8, 7],        // root
  ];
  const idx = [];
  for (const [a, b, c, d] of quads) idx.push(a, b, c, a, c, d);
  return solid(pos, idx);
}

/**
 * Face every triangle outwards.
 *
 * Winding a dozen quads by hand and getting all of them right is a game
 * nobody wins. These shapes are convex enough that "away from the centroid"
 * is the right answer everywhere, so the triangles are written in whatever
 * order reads clearly above and turned the right way round here — otherwise
 * half the wing vanishes when the aircraft banks and the back faces cull.
 */
function solid(pos, idx) {
  let cx = 0, cy = 0, cz = 0;
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * (ax - cx) + ny * (ay - cy) + nz * (az - cz) < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The same geometry reflected in x, wound so it still faces outwards. */
function mirrorX(geo) {
  const g = geo.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const idx = g.index.array;
  for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  g.computeVertexNormals();
  return g;
}

/**
 * A surface on both sides of the body. Mirrored rather than scaled by -1:
 * a negative scale turns every triangle inside out and the renderer culls
 * the wrong faces, which shows up as a wing with a hole in it.
 */
function pair(group, geo, mat, x, y, z) {
  const right = new THREE.Mesh(geo, mat);
  right.position.set(x, y, z);
  right.castShadow = true;
  group.add(right);
  const left = new THREE.Mesh(mirrorX(geo), mat);
  left.position.set(-x, y, z);
  left.castShadow = true;
  group.add(left);
}

/** An engine: a dark can with the burner lit behind it. */
function engine(group, mat, glow, x, y, z, r, len, flame) {
  for (const s of x ? [-1, 1] : [0]) {
    group.add(part(new THREE.CylinderGeometry(r, r * 1.08, len, 12).rotateX(Math.PI / 2), mat, s * x, y, z));
    const f = new THREE.ConeGeometry(r * 0.72, flame, 8);
    f.rotateX(-Math.PI / 2);
    group.add(part(f, glow, s * x, y, z - len * 0.5 - flame * 0.45));
  }
}

/** F-15E Strike Eagle. 19.4 m long, 13.1 m span, nose along +Z. */
export function makeEagle() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: EAGLE_GREY, roughness: 0.62, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.18, metalness: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });

  // The body: a round radome that squares off as it runs back, ending flat
  // and wide in the tunnel the two nozzles sit either side of.
  g.add(part(loft([
    { z: 9.7, w: 0.06, h: 0.06, n: 2.0 },
    { z: 8.4, w: 0.62, h: 0.58, n: 2.1 },
    { z: 6.6, w: 1.10, h: 1.00, n: 2.2 },
    { z: 4.6, w: 1.52, h: 1.30, y: 0.04, n: 2.4 },
    { z: 2.4, w: 1.86, h: 1.48, y: 0.04, n: 2.7 },
    { z: 0.4, w: 2.30, h: 1.52, n: 3.0 },
    { z: -2.0, w: 2.72, h: 1.44, y: -0.03, n: 3.4 },
    { z: -4.6, w: 2.92, h: 1.34, y: -0.05, n: 3.8 },
    { z: -7.0, w: 2.90, h: 1.20, y: -0.05, n: 4.0 },
    { z: -9.0, w: 2.70, h: 1.08, y: -0.05, n: 4.0 },
    { z: -9.7, w: 2.52, h: 1.00, y: -0.05, n: 4.0 },
  ]), grey, 0, 0, 0));

  // The canopy, two seats long on the E, and the dark coaming ahead of it.
  g.add(part(loft([
    { z: 5.9, w: 0.20, h: 0.12, y: 0.62, n: 2.2 },
    { z: 4.8, w: 0.94, h: 0.56, y: 0.78, n: 2.4 },
    { z: 3.4, w: 1.16, h: 0.74, y: 0.86, n: 2.6 },
    { z: 1.8, w: 1.14, h: 0.70, y: 0.84, n: 2.8 },
    { z: 0.9, w: 0.86, h: 0.40, y: 0.76, n: 3.0 },
  ], 10), glass, 0, 0, 0));

  // Intakes: square-jawed, set out from the body with a sharp lower lip —
  // the one detail that is unmistakably an Eagle from head on.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 3.9, w: 1.02, h: 1.34, n: 4.0 },
      { z: 2.6, w: 1.06, h: 1.42, n: 4.0 },
      { z: -0.4, w: 1.10, h: 1.40, n: 4.0 },
      { z: -2.2, w: 1.06, h: 1.30, n: 4.0 },
    ], 10), dark, s * 1.78, -0.12, 0, 0, 0, s * 0.05));
    // Conformal tanks along the shoulders: what makes it an E and not a C.
    g.add(part(loft([
      { z: 2.9, w: 0.30, h: 0.34, n: 3.0 },
      { z: 1.6, w: 0.72, h: 0.78, n: 3.4 },
      { z: -2.6, w: 0.76, h: 0.82, n: 3.6 },
      { z: -4.8, w: 0.34, h: 0.42, n: 3.0 },
    ], 8), grey, s * 1.62, 0.30, 0));
  }

  // Wing: 45 degrees on the leading edge, cropped square at the tip.
  const wing = surface({ span: 5.05, root: 5.6, tip: 1.9, sweep: 4.9, thick: 0.34 });
  pair(g, wing, grey, 1.42, 0.10, 0.7);
  // Stabilators, set well aft and a touch below the wing line.
  const stab = surface({ span: 2.85, root: 3.2, tip: 1.1, sweep: 3.0, thick: 0.24 });
  pair(g, stab, grey, 1.34, -0.18, -5.7);
  // Twin fins, canted out the way they are on the real thing. Rotating the
  // span axis a shade short of upright leans the top outboard; both fins are
  // the same shape, so neither needs mirroring.
  const fin = surface({ span: 3.25, root: 3.5, tip: 1.5, sweep: 2.6, thick: 0.22 });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(s > 0 ? fin : mirrorX(fin), grey);
    m.position.set(s * 1.44, 0.58, -4.5);
    m.rotation.z = s * (Math.PI / 2 - 0.10);
    m.castShadow = true;
    g.add(m);
  }
  engine(g, dark, glow, 0.92, -0.08, -9.9, 0.60, 1.5, 3.8);

  // The bomb on a pylon under the wing root, until it is dropped.
  const bomb = new THREE.Group();
  bomb.add(part(loft([
    { z: 1.6, w: 0.10, h: 0.10, n: 2 }, { z: 1.2, w: 0.34, h: 0.34, n: 2 },
    { z: -0.9, w: 0.36, h: 0.36, n: 2 }, { z: -1.5, w: 0.22, h: 0.22, n: 2 },
  ], 8), new THREE.MeshStandardMaterial({ color: 0x5e6b3a, roughness: 0.6 }), 0, 0, 0));
  bomb.add(part(new THREE.BoxGeometry(0.10, 0.5, 0.9), dark, 0, 0.42, 0.1));
  bomb.position.set(0, -1.02, 0.4);
  bomb.name = 'bomb';
  g.add(bomb);
  return g;
}

/** B-1B Lancer, wings swept. 44.5 m long, 24.1 m span, nose along +Z. */
export function makeLancer() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: LANCER_GREY, roughness: 0.6, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.5, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.2, metalness: 0.75 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff9a3c, toneMapped: false });

  // One long blended body, waisted where the wings come out of it and drawn
  // out to a point at both ends. No seams: on the real aircraft there are
  // none to see.
  g.add(part(loft([
    { z: 22.2, w: 0.08, h: 0.08, n: 2.0 },
    { z: 19.4, w: 1.05, h: 0.95, n: 2.1 },
    { z: 16.0, w: 2.05, h: 1.85, y: 0.05, n: 2.3 },
    { z: 12.0, w: 2.95, h: 2.55, y: 0.05, n: 2.6 },
    { z: 6.0, w: 3.75, h: 3.10, n: 2.9 },
    { z: 0.0, w: 4.35, h: 3.30, n: 3.1 },
    { z: -6.0, w: 4.10, h: 3.15, n: 3.0 },
    { z: -12.0, w: 3.20, h: 2.80, y: 0.10, n: 2.8 },
    { z: -17.0, w: 2.10, h: 2.05, y: 0.25, n: 2.5 },
    { z: -21.0, w: 0.90, h: 1.00, y: 0.35, n: 2.2 },
    { z: -22.3, w: 0.20, h: 0.24, y: 0.35, n: 2.0 },
  ], 14), grey, 0, 0, 0));

  // The chines: flat shelves that carry the blend out sideways, so the
  // planform is broad while the side view stays a spindle.
  const chine = surface({ span: 3.4, root: 15.0, tip: 6.5, sweep: 8.5, thick: 0.55 });
  pair(g, chine, grey, 1.9, -0.35, 9.0);

  // Flight deck: a low windscreen rather than a bubble.
  g.add(part(loft([
    { z: 17.6, w: 0.5, h: 0.24, y: 1.02, n: 2.6 },
    { z: 16.4, w: 1.55, h: 0.62, y: 1.16, n: 3.0 },
    { z: 14.6, w: 1.95, h: 0.74, y: 1.26, n: 3.2 },
    { z: 12.8, w: 1.70, h: 0.52, y: 1.28, n: 3.4 },
  ], 10), glass, 0, 0, 0));

  // Wings pinned right back, which is how it crosses a target.
  const wing = surface({ span: 9.7, root: 8.2, tip: 2.6, sweep: 18.2, thick: 0.62, dihedral: -0.02 });
  pair(g, wing, grey, 2.25, 0.25, 6.4);

  // Four engines in two pods under the blend, the inboard pair tucked in.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 2.2, w: 3.55, h: 1.95, n: 3.4 },
      { z: 0.0, w: 3.70, h: 2.05, n: 3.6 },
      { z: -6.5, w: 3.60, h: 2.00, n: 3.6 },
      { z: -8.6, w: 3.40, h: 1.86, n: 3.4 },
    ], 10), dark, s * 3.5, -2.05, 0));
    for (const k of [0, 1]) {
      const x = s * (2.6 + k * 1.85);
      const f = new THREE.ConeGeometry(0.62, 5.4, 8);
      f.rotateX(-Math.PI / 2);
      g.add(part(f, glow, x, -2.05, -11.6));
      g.add(part(new THREE.CylinderGeometry(0.78, 0.78, 0.5, 10).rotateX(Math.PI / 2), grey, x, -2.05, 2.3));
    }
  }

  // The fin, and the stabilators low on its root.
  const fin = surface({ span: 6.6, root: 8.0, tip: 3.0, sweep: 6.2, thick: 0.45 });
  const fm = new THREE.Mesh(fin, grey);
  fm.position.set(0, 1.5, -10.6);
  fm.rotation.z = Math.PI / 2;
  fm.castShadow = true;
  g.add(fm);
  const stab = surface({ span: 5.3, root: 4.6, tip: 1.8, sweep: 3.9, thick: 0.34 });
  pair(g, stab, grey, 0.9, 1.9, -14.6);
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
