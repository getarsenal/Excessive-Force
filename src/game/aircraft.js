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
  call(def, target, ceiling, opts = {}) {
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
    // Yaw first, then pitch about the aircraft's own lateral axis, then roll
    // about its nose. In the default order the pitch is about the world's x
    // axis, which is nose-up flying north, a roll flying east and nose-down
    // flying south — the jets climbing away with their noses on the ground.
    model.rotation.order = 'YXZ';
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
      // Flak.
      //
      // Until the garrison had guns that could reach up, the two most expensive
      // cards in the arsenal were also the two safest: the aircraft flew
      // through a defended objective as though the airspace were empty and put
      // its bomb exactly where it was told to. Each gun still shooting over the
      // target is one roll at spoiling the run — a pilot jinking through
      // tracer, which does not stop the bomb, it stops the bomb landing where
      // he meant it to. Killing the flak first is therefore worth doing, and
      // that is the whole point of it being there.
      flak: opts.flak || 0,
    };
    if (s.flak > 0) {
      const spoil = 1 - Math.pow(0.72, s.flak);
      if (Math.random() < spoil) {
        s.harried = 22 + 26 * Math.random() * Math.min(1, s.flak / 3);
        const ang = Math.random() * Math.PI * 2;
        s.target.x += Math.cos(ang) * s.harried;
        s.target.z += Math.sin(ang) * s.harried;
        // Off early rather than off late: a pilot under fire releases sooner.
        s.releaseAt = Math.max(0.2, s.releaseAt - (0.25 + Math.random() * 0.5));
      }
    }
    this.sorties.push(s);
    return s;
  }

  update(dt) {
    for (const s of this.sorties) {
      s.t += dt;
      const m = s.model;
      if (s.lift) {
        this._updateLift(s, dt);
      } else if (s.heli) {
        this._updateHeli(s, dt);
      } else {
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
      }

      // Let go.
      if (!s.released && s.t >= s.releaseAt && !s.lift && !s.heli) {
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
            rate: s.heli ? 0.3 : s.lift ? 0.36 : s.def.aircraft.kind === 'lancer' ? 0.42 : 0.55,
            gain: s.heli ? 0.42 : s.lift ? 0.4 : 0.55, rolloff: s.heli ? 900 : 1400,
          });
        }
      }

      // Gone once it is well past and climbing away — and, for a transport,
      // once its loads are down and the canopies are gone.
      if (!s.lift && !s.heli) s.life = s.t - s.pullUpAt;
      if (s.lift) {
        if (s.life > 22 && s.lift.allDown) s.done = true;
        else if (s.life > 30) m.visible = false;
      } else if (s.heli) {
        // Ends itself.
      } else if (s.life > 14 || m.position.y > s.alt + 1600) s.done = true;
    }
    for (const s of this.sorties) {
      if (s.done) {
        this.scene.remove(s.model);
        if (s.heli) this.scene.remove(s.heli.sling);
      }
    }
    this.sorties = this.sorties.filter((s) => !s.done);
  }


  get active() { return this.sorties.length; }
}

// ─────────────────────────────────────────────────────────── the airlift ──

/**
 * C-130 Hercules. 29.8 m long, 40.4 m span, nose along +Z, ramp down.
 *
 * The transport the battery arrives in. Where the Eagle is a silhouette of
 * tails and intakes, the Hercules is a fat straight tube under a straight
 * wing with four turboprops on it and a tail that sweeps up to a tall fin —
 * and, on a drop run, the ramp open under the tail. Built the way the other
 * two are: lofted body, surfaces for the wing and tail, cylinders for the
 * nacelles. The props are spun by the sortie.
 */
export function makeHercules() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.7, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.18, metalness: 0.8 });

  // The body: radome, the flight deck stepping up to the full tube, the tube,
  // and the upsweep to the tail where the ramp is.
  g.add(part(loft([
    { z: 14.9, w: 0.12, h: 0.12, y: 0.15, n: 2.0 },
    { z: 13.7, w: 2.30, h: 2.30, y: 0.15, n: 2.2 },
    { z: 12.0, w: 3.70, h: 3.80, y: 0.02, n: 2.6 },
    { z: 9.8, w: 4.30, h: 4.40, n: 3.0 },
    { z: 3.0, w: 4.30, h: 4.40, n: 3.2 },
    { z: -4.5, w: 4.30, h: 4.40, n: 3.2 },
    { z: -7.5, w: 4.00, h: 3.60, y: 0.55, n: 3.0 },
    { z: -10.5, w: 3.10, h: 2.40, y: 1.45, n: 2.7 },
    { z: -13.2, w: 1.80, h: 1.30, y: 2.25, n: 2.3 },
    { z: -14.9, w: 0.50, h: 0.40, y: 2.60, n: 2.0 },
  ], 14), grey, 0, 0, 0));
  // Flight deck glazing: the wrap of windows over the nose.
  g.add(part(new THREE.BoxGeometry(3.3, 0.7, 1.6), glass, 0, 1.25, 11.9));
  // The open cargo hold, and the ramp down under the tail.
  g.add(part(new THREE.BoxGeometry(3.2, 2.5, 1.2), black, 0, 0.25, -7.6));
  const ramp = part(new THREE.BoxGeometry(3.3, 0.24, 4.4), grey, 0, -1.55, -9.6);
  ramp.rotation.x = -0.42;
  g.add(ramp);
  // Main gear pods down both sides of the belly.
  for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(1.1, 1.3, 6.8), grey, s * 2.55, -1.55, 1.0, 0, 0, 0));

  // The wing: high, straight, a little dihedral, over the middle of the tube.
  const wing = surface({ span: 20.2, root: 4.9, tip: 2.7, sweep: 0.7, thick: 0.72, dihedral: 0.045 });
  pair(g, wing, grey, 2.0, 1.95, 3.1);
  g.add(part(new THREE.BoxGeometry(4.6, 0.75, 4.9), grey, 0, 1.95, 0.65));
  // Four turboprops: nacelle forward of the leading edge, prop on the nose.
  for (const x of [-10.6, -5.1, 5.1, 10.6]) {
    g.add(part(loft([
      { z: 5.0, w: 1.10, h: 1.10, n: 2.2 },
      { z: 3.6, w: 1.55, h: 1.65, y: -0.05, n: 2.6 },
      { z: 0.0, w: 1.55, h: 1.65, y: -0.05, n: 2.8 },
      { z: -2.6, w: 1.05, h: 1.35, y: 0.05, n: 2.6 },
    ], 10), grey, x, 1.35, 0));
    const prop = new THREE.Group();
    prop.add(part(new THREE.CylinderGeometry(0.28, 0.32, 0.6, 10).rotateX(Math.PI / 2), dark, 0, 0, 0.3));
    for (let k = 0; k < 4; k++) {
      const blade = part(new THREE.BoxGeometry(0.28, 2.05, 0.06), black, 0, 1.02, 0.25);
      const holder = new THREE.Group();
      holder.add(blade);
      holder.rotation.z = (k / 4) * Math.PI * 2;
      prop.add(holder);
    }
    // The disc a spinning prop reads as at any distance.
    const disc = part(new THREE.CylinderGeometry(2.05, 2.05, 0.05, 20).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.28, depthWrite: false }), 0, 0, 0.25);
    prop.add(disc);
    prop.position.set(x, 1.35, 5.1);
    prop.name = 'prop';
    g.add(prop);
  }

  // The tail: a tall fin on the upswept tail, and the tailplane at its foot.
  const fin = surface({ span: 7.0, root: 6.4, tip: 2.9, sweep: 3.6, thick: 0.5 });
  const finMesh = new THREE.Mesh(fin, grey);
  finMesh.position.set(0, 2.5, -9.9);
  finMesh.rotation.z = Math.PI / 2;
  finMesh.castShadow = true;
  g.add(finMesh);
  const tail = surface({ span: 8.0, root: 3.4, tip: 1.7, sweep: 1.3, thick: 0.42 });
  pair(g, tail, grey, 0.5, 2.7, -11.8);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

/** A parachute canopy: a dome, open below, with its rigging to the load. */
function makeCanopy(radius, colour, loadY, loadHalf = 0.35) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
    // Lit a little from within: the underside of a canopy is what the
    // player mostly sees, and a dome shaded only by the sun is black there.
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.95, side: THREE.DoubleSide,
      emissive: new THREE.Color(colour), emissiveIntensity: 0.38, transparent: true }),
  );
  dome.position.y = -radius * 0.12;
  dome.castShadow = true;
  g.add(dome);
  // Rigging lines from the skirt to the load's corners.
  const pts = [];
  const rimY = dome.position.y + radius * Math.cos(Math.PI * 0.52);
  const rimR = radius * Math.sin(Math.PI * 0.52);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR));
    pts.push(new THREE.Vector3(Math.cos(a) * loadHalf, loadY, Math.sin(a) * loadHalf));
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xd8d4c8, transparent: true, opacity: 0.8 }),
  );
  g.add(lines);
  g.userData.dome = dome;
  return g;
}

/**
 * The airlift.
 *
 * The battery does not appear where the player taps: it is flown in. A
 * package of drops goes out as a formation of Hercules, one aircraft a drop,
 * in from behind the camera the way the strike aircraft come, and each puts
 * its load out of the ramp short of its own point. Infantry come down as a
 * stick of men under their own canopies; a gun or a vehicle comes down on
 * a platform under a cluster of four. The chutes steer onto the point —
 * the player paid for that placement — and on touchdown the canopies
 * collapse and the load becomes the unit, whose setup starts there.
 *
 * Nothing in the air can be hit, and nothing on the ground can hit it.
 */
const LIFT = { speed: 95, height: 112, clearance: 45, runIn: 720, spacing: 82, stagger: 0.9, perAircraft: 6, cluster: 150 };
const CHUTE = { troopRate: 7.6, cargoRate: 7.0, freeFall: 1.0, open: 0.5, stick: 0.36 };

/**
 * Load the package onto aircraft. Drops close together go out of the same
 * ramp on one run, in the order the run reaches them; a package spread
 * across the map takes as many aircraft as it needs, no more.
 */
function loadAircraft(drops) {
  const left = drops.slice();
  const groups = [];
  while (left.length) {
    const g = [left.shift()];
    const c = { x: g[0].pos.x, z: g[0].pos.z };
    for (let i = 0; i < left.length && g.length < LIFT.perAircraft;) {
      const d = left[i];
      if (Math.hypot(d.pos.x - c.x, d.pos.z - c.z) < LIFT.cluster) {
        g.push(d); left.splice(i, 1);
        c.x = g.reduce((a, q) => a + q.pos.x, 0) / g.length;
        c.z = g.reduce((a, q) => a + q.pos.z, 0) / g.length;
      } else i++;
    }
    groups.push(g);
  }
  return groups;
}

AirWing.prototype.deliver = function deliver(drops, ceiling, onLand, ceilingAlong = null) {
  // What stands under a line across the map: the monument, the town. The
  // battle answers it; the aircraft fly over it.
  this.ceilingAlong = ceilingAlong || (() => -Infinity);
  // The towed guns come under Chinooks; everything else goes out of a
  // Hercules.
  const guns = drops.filter((d) => d.def.tier === 'GUN');
  const rest = drops.filter((d) => d.def.tier !== 'GUN');
  const groups = loadAircraft(rest);
  const n = groups.length;
  let eta = guns.length ? this._deliverHelis(guns, onLand, n) : 0;
  this.lastLift = { hercs: n, helis: guns.length };
  groups.forEach((group, i) => {
    // The run goes through the middle of the group, in from behind the camera.
    const target = new THREE.Vector3(
      group.reduce((a, d) => a + d.pos.x, 0) / group.length, 0,
      group.reduce((a, d) => a + d.pos.z, 0) / group.length);
    target.y = group.reduce((a, d) => Math.max(a, d.pos.y), -Infinity);
    const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const model = makeHercules();
    // Formation: each aircraft off to its own side of the camera's line and
    // a little behind the last, then aimed through its own group.
    const lateral = (i - (n - 1) / 2) * LIFT.spacing + 30;
    const behind = LIFT.runIn + i * LIFT.stagger * LIFT.speed;
    model.position.copy(target).addScaledVector(dir, -behind).addScaledVector(side, lateral);
    dir.set(target.x - model.position.x, 0, target.z - model.position.z).normalize();
    side.set(-dir.z, 0, dir.x);
    model.rotation.y = Math.atan2(dir.x, dir.z);
    // High enough for the whole run, and the stretch past it: the Hercules
    // flew through the Great Pyramid because the drop was clear of it and
    // the run was not.
    const ex = target.x + dir.x * 700, ez = target.z + dir.z * 700;
    const ceil = Math.max(group.reduce((a, d) => Math.max(a, d.ceiling ?? ceiling), 0),
      this.ceilingAlong(model.position.x, model.position.z, ex, ez));
    const alt = Math.max(target.y + LIFT.height, ceil + LIFT.clearance);
    model.position.y = alt;
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    this.scene.add(model);
    const runLen = Math.hypot(target.x - model.position.x, target.z - model.position.z);
    const overAt = runLen / LIFT.speed;
    // Each load goes out where the run passes its point, in that order, a
    // stick's spacing apart at least; the chutes steer the rest of the way.
    const loads = group.map((d) => {
      const troops = d.def.model === 'infantry';
      const rate = troops ? CHUTE.troopRate : CHUTE.cargoRate;
      const along = (d.pos.x - target.x) * dir.x + (d.pos.z - target.z) * dir.z;
      const lead = troops ? 1.0 : 1.3;
      const fall = CHUTE.freeFall + (alt - d.pos.y - 9.81 * CHUTE.freeFall * CHUTE.freeFall * 0.5) / rate;
      return { drop: d, releaseAt: overAt + along / LIFT.speed - lead, troops, rate, fall,
        chutes: [], out: 0, toGo: troops ? Math.max(1, d.def.crew) : 1, nextAt: 0, landed: false };
    }).sort((a, b) => a.releaseAt - b.releaseAt);
    // Spaced a stick apart — by bringing the earlier loads forward, never by
    // holding the later ones past their point. A man let go a hundred metres
    // past his drop zone has to fly the whole way back under the canopy, and
    // that is where the sticks that landed far from the ring came from.
    for (let k = loads.length - 2; k >= 0; k--) {
      const gap = loads[k + 1].releaseAt - 0.45;
      if (loads[k].releaseAt > gap) loads[k].releaseAt = gap;
    }
    const last = loads[loads.length - 1];
    const s = {
      def: group[0].def, model, dir, side, alt, target, speed: LIFT.speed, t: 0,
      releaseAt: loads[0].releaseAt,
      pullUpAt: last.releaseAt + last.toGo * CHUTE.stick + 2.0,
      climb: 0, roar: 0, life: 0, released: true, flak: 0, turn: 0, bank: 0, pitch: 0,
      // Away from the camera's side of the line, so the turn opens the view
      // rather than crossing it.
      turnDir: lateral >= 0 ? 1 : -1,
      lift: { loads, onLand },
    };
    this.sorties.push(s);
    for (const L of loads) eta = Math.max(eta, L.releaseAt + L.fall);
  });
  return eta;
};

/** Put the next load out of the ramp. */
AirWing.prototype._release = function _release(s, L) {
  if (L.troops) {
    // The team goes out together, side by side off the ramp, so both men
    // come down on the same point at the same time.
    while (L.out < L.toGo) this._releaseOne(s, L);
    return;
  }
  this._releaseOne(s, L);
};

AirWing.prototype._releaseOne = function _releaseOne(s, L) {
  const d = L.drop, m = s.model;
  const k = L.out++;
  const g = new THREE.Group();
  let load, canopies = [], landAt;
  if (L.troops) {
    // A man under a round canopy, the figure the unit will be built from.
    load = d.figure ? d.figure(k) : new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x4a5340 }));
    load.position.y = 0;
    g.add(load);
    const c = makeCanopy(3.4, 0x76835c, 1.6, 0.3);
    c.position.y = 6.2;
    g.add(c);
    canopies.push(c);
    // Where he lands: the crew's own offsets round the point.
    landAt = d.pos.clone();
    landAt.x += (k - 0.5) * 1.3; landAt.z += (k % 2) * 0.7;
    if (!d.pos.onRoof && !d.pos.onDeck) landAt.y = this.terrain.heightAt(landAt.x, landAt.z);
  } else {
    // A platform with the load lashed to it, under four canopies.
    const size = Math.max(4, (d.def.modelLength || 6) * 0.85);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(size * 0.8, 0.35, size * 1.15),
      new THREE.MeshStandardMaterial({ color: 0x4c4a44, roughness: 0.9 }));
    platform.position.y = 0.17;
    g.add(platform);
    load = d.group || new THREE.Group();
    load.position.set(0, 0.35, 0);
    // Facing the way it will stand: the platform turns with the aircraft's
    // heading, so the load's own turn is the difference, or a Paladin came
    // down backwards and swung round on landing.
    load.rotation.y = (d.yaw || 0) - m.rotation.y;
    g.add(load);
    const R = size > 8 ? 6.2 : 5.6;
    const spots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    if (size > 8) spots.push([0, 0]);
    for (const [ox, oz] of spots) {
      const c = makeCanopy(R, 0xd9d3c2, -8.5 + 0.35, size * 0.4);
      c.position.set(ox * 3.4, 9.6 + (ox === 0 && oz === 0 ? 2.2 : 0), oz * 3.8);
      g.add(c);
      canopies.push(c);
    }
    // The extraction chute that pulled the platform out of the ramp,
    // streaming behind it until the mains take over.
    const drogue = makeCanopy(2.3, 0xc9c2ae, 0, 0.3);
    drogue.rotation.x = Math.PI / 2;
    drogue.position.set(0, 1.6, -size * 0.9);
    g.add(drogue);
    g.userData.drogue = drogue;
    landAt = d.pos.clone();
  }
  for (const c of canopies) c.scale.setScalar(0.12);
  g.position.copy(m.position);
  g.position.y -= 2.2;
  g.position.addScaledVector(s.dir, -9);
  if (L.troops) g.position.addScaledVector(s.side, (k - (L.toGo - 1) / 2) * 2.6);
  g.rotation.y = m.rotation.y;
  this.scene.add(g);
  L.chutes.push({
    g, load, canopies, landAt, landY: landAt.y,
    vel: new THREE.Vector3(s.dir.x * s.speed * 0.9, -1.5, s.dir.z * s.speed * 0.9),
    t: 0, phase: 'free', sway: Math.random() * Math.PI * 2, rate: L.rate,
  });
  L.nextAt = s.t + CHUTE.stick;
};

/** Fly one load's chutes down. Returns true when all of it is on the ground. */
AirWing.prototype._updateChutes = function _updateChutes(L, dt) {
  let landed = 0;
  for (const c of L.chutes) {
    if (c.phase === 'landed') { landed++; continue; }
    c.t += dt;
    if (c.phase === 'free' && c.t > CHUTE.freeFall) c.phase = 'open';
    const p = c.g.position;
    if (c.phase === 'free') {
      c.vel.y -= 9.81 * dt;
      c.vel.x -= c.vel.x * 1.4 * dt; c.vel.z -= c.vel.z * 1.4 * dt;
    } else {
      // The canopy fills, the fall is caught, the forward speed bleeds off,
      // and from there it steers onto the point: whatever is left to cover,
      // over the time left to cover it in.
      const open = Math.min(1, (c.t - CHUTE.freeFall) / CHUTE.open);
      for (const k of c.canopies) k.scale.setScalar(0.12 + 0.88 * open);
      if (c.g.userData.drogue) c.g.userData.drogue.scale.setScalar(Math.max(0.01, 1 - open));
      const want = -c.rate;
      c.vel.y += (want - c.vel.y) * Math.min(1, dt * 4.5);
      c.vel.x -= c.vel.x * 1.6 * dt; c.vel.z -= c.vel.z * 1.6 * dt;
      // Onto the point: what is left to cover over the time left to cover
      // it, a little ahead of that so the last metres are not a dash, and
      // with enough reach that the last man out of a full stick still gets
      // there. The player paid for the placement.
      const left = Math.max(0.5, (p.y - c.landY) / c.rate * 0.85);
      const sx = (c.landAt.x - p.x) / left, sz = (c.landAt.z - p.z) / left;
      const cap = 21;
      const sm = Math.hypot(sx, sz);
      const k = sm > cap ? cap / sm : 1;
      c.vel.x += (sx * k - c.vel.x) * Math.min(1, dt * 3.2);
      c.vel.z += (sz * k - c.vel.z) * Math.min(1, dt * 3.2);
      // A little swing under the canopy.
      const sw = Math.sin(c.t * 1.7 + c.sway) * 0.08 * open;
      c.g.rotation.x = sw; c.g.rotation.z = Math.cos(c.t * 1.3 + c.sway) * 0.06 * open;
    }
    p.addScaledVector(c.vel, dt);
    if (p.y <= c.landY) {
      p.y = c.landY;
      c.phase = 'landed';
      c.g.rotation.set(0, c.g.rotation.y, 0);
      c.landedAt = c.t;
      landed++;
      if (this.fx && this.quality.name !== 'low') this.fx.impactDust(p.x, p.y, p.z, L.troops ? 0.4 : 1.6);
    }
  }
  return landed === L.toGo && L.out === L.toGo;
};

/** Let the canopies fall over the load and take them away. */
AirWing.prototype._collapse = function _collapse(L, dt) {
  for (const c of L.chutes) {
    if (c.phase !== 'landed') continue;
    // The clock keeps running on the ground: the canopy has a second to
    // fall, and the chute is forgotten after it. (It used to stop with the
    // descent, and the collapsed canopies stayed on the ground for ever.)
    c.t += dt;
    const k = Math.min(1, (c.t - c.landedAt) / 1.0);
    for (const cn of c.canopies) {
      cn.scale.set(1 + k * 0.45, Math.max(0.03, 1 - k * 1.3), 1 + k * 0.45);
      cn.position.y *= (1 - Math.min(1, dt * 4.0));
      if (cn.userData.dome) cn.userData.dome.material.opacity = 1 - k * 0.6;
    }
    if (k >= 1) { this.scene.remove(c.g); c.gone = true; }
  }
  L.chutes = L.chutes.filter((c) => !c.gone);
};

/**
 * The transport's own business on the run: props, the sticks, the chutes,
 * and after the last load a proper departure — a gentle climbing turn away
 * from the camera's side that levels out, not the jet's pull-up held for
 * ever. A Hercules does not leave a drop zone at twenty-four degrees nose
 * up with thirty degrees of bank on.
 */
AirWing.prototype._updateLift = function _updateLift(s, dt) {
  const m = s.model;
  for (const p of m.children) if (p.name === 'prop') p.rotation.z += 38 * dt;
  let allDown = true;
  for (const L of s.lift.loads) {
    if (L.out < L.toGo && s.t >= L.releaseAt && s.t >= L.nextAt) this._release(s, L);
    if (L.out > 0 && !L.landed && this._updateChutes(L, dt)) {
      L.landed = true;
      if (s.lift.onLand) s.lift.onLand(L.drop);
    }
    if (L.out > 0) this._collapse(L, dt);
    if (!L.landed || L.chutes.length) allDown = false;
  }
  s.lift.allDown = allDown;

  // Flight. Straight and level on the run; past the last load, ease into a
  // turn away and a shallow climb, hold the turn a while, roll out.
  const past = s.t - s.pullUpAt;
  let wantBank = 0, wantPitch = 0;
  if (past > 0) {
    const turning = past < 7.5;
    wantBank = turning ? 0.36 : 0;
    wantPitch = 0.085;
    // Whatever stands ahead on the way out, climb over it.
    s.lookAhead = (s.lookAhead || 0) - dt;
    if (s.lookAhead <= 0) {
      s.lookAhead = 0.4;
      s.needAlt = this.ceilingAlong(m.position.x, m.position.z, m.position.x + s.dir.x * 520, m.position.z + s.dir.z * 520) + LIFT.clearance;
    }
    if (s.needAlt > m.position.y) wantPitch = THREE.MathUtils.clamp((s.needAlt - m.position.y) / 45, 0.085, 0.34);
    if (turning) {
      const rate = 0.16 * s.bank / 0.36;
      const a = rate * dt * s.turnDir;
      const x = s.dir.x * Math.cos(a) - s.dir.z * Math.sin(a);
      const z = s.dir.x * Math.sin(a) + s.dir.z * Math.cos(a);
      s.dir.set(x, 0, z);
    }
  }
  s.bank += (wantBank - s.bank) * Math.min(1, dt * 1.1);
  s.pitch += (wantPitch - s.pitch) * Math.min(1, dt * 0.8);
  m.position.x += s.dir.x * Math.cos(s.pitch) * s.speed * dt;
  m.position.z += s.dir.z * Math.cos(s.pitch) * s.speed * dt;
  m.position.y += Math.sin(s.pitch) * s.speed * dt;
  // Into the turn. A positive turn of the heading about +Y takes a nose on
  // +Z toward -X, which from behind is the right; a positive roll about the
  // nose drops the -X wing. Same sign, then, or it turns right banked left.
  m.rotation.set(-s.pitch, Math.atan2(s.dir.x, s.dir.z), s.turnDir * s.bank, 'YXZ');
  s.life = past;
};

/** Everything in the air, brought down and forgotten: the harness resets. */
AirWing.prototype.abortLifts = function abortLifts() {
  for (const s of this.sorties) {
    if (!s.lift && !s.heli) continue;
    if (s.lift) for (const L of s.lift.loads) for (const c of L.chutes) this.scene.remove(c.g);
    if (s.heli) this.scene.remove(s.heli.sling);
    this.scene.remove(s.model);
    s.done = true;
  }
  this.sorties = this.sorties.filter((s) => !s.done);
};

// ─────────────────────────────────────────────────────────── the Chinook ──

/**
 * CH-47 Chinook. 15.5 m fuselage, two 18.3 m rotors, nose along +Z.
 *
 * The towed guns come in under one. A Chinook is a box with a rotor at each
 * end — the tall rear pylon and the short front one are the whole
 * silhouette — and sponsons down the sides where the fuel is. The rotors
 * turn opposite ways, as they do, and the sortie spins them.
 */
export function makeChinook() {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: 0x4a5443, roughness: 0.78, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.55, metalness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.18, metalness: 0.8 });

  g.add(part(loft([
    { z: 7.7, w: 0.6, h: 0.6, y: 0.1, n: 2.6 },
    { z: 6.7, w: 2.7, h: 2.4, y: 0.05, n: 3.0 },
    { z: 5.3, w: 3.7, h: 2.9, n: 3.6 },
    { z: -5.4, w: 3.7, h: 2.9, n: 3.7 },
    { z: -7.0, w: 3.3, h: 2.6, y: 0.25, n: 3.4 },
    { z: -7.8, w: 2.6, h: 1.4, y: 0.75, n: 3.0 },
  ], 12), olive, 0, 0, 0));
  g.add(part(new THREE.BoxGeometry(3.0, 0.9, 1.4), glass, 0, 0.85, 6.3));
  // Sponsons.
  for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.95, 1.0, 9.4), olive, s * 2.25, -0.95, -0.6));
  // Pylons: the short one over the cockpit, the tall one at the tail.
  g.add(part(new THREE.BoxGeometry(1.7, 1.1, 2.8), olive, 0, 1.95, 4.4));
  g.add(part(loft([
    { z: -4.4, w: 2.4, h: 0.4, y: 1.6, n: 3.5 },
    { z: -5.6, w: 2.4, h: 2.8, y: 2.8, n: 3.6 },
    { z: -7.4, w: 2.2, h: 3.4, y: 3.2, n: 3.4 },
    { z: -8.2, w: 1.4, h: 2.4, y: 3.6, n: 3.0 },
  ], 10), olive, 0, 0, 0));
  // Rotors: three blades and the disc they read as, at each end.
  const rotor = (y, z, name) => {
    const r = new THREE.Group();
    r.add(part(new THREE.CylinderGeometry(0.45, 0.5, 0.5, 10), dark, 0, 0, 0));
    for (let k = 0; k < 3; k++) {
      const holder = new THREE.Group();
      holder.add(part(new THREE.BoxGeometry(9.0, 0.08, 0.55), dark, 4.6, 0.1, 0));
      holder.rotation.y = (k / 3) * Math.PI * 2;
      r.add(holder);
    }
    r.add(part(new THREE.CylinderGeometry(9.15, 9.15, 0.04, 26),
      new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.2, depthWrite: false }), 0, 0.1, 0));
    r.position.set(0, y, z);
    r.name = name;
    g.add(r);
  };
  rotor(2.75, 4.4, 'rotorA');
  rotor(5.0, -6.6, 'rotorB');
  // Gear.
  for (const [x, z] of [[-1.6, 5.4], [1.6, 5.4], [-1.9, -4.6], [1.9, -4.6]]) {
    g.add(part(new THREE.BoxGeometry(0.3, 0.9, 0.3), dark, x, -1.85, z));
    g.add(part(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10).rotateZ(Math.PI / 2), dark, x, -2.3, z));
  }
  g.traverse((m) => { if (m.isMesh) m.frustumCulled = false; m.castShadow = true; });
  return g;
}

const HELI = { speed: 56, height: 62, runIn: 640, hover: 17, sling: 11.5, lower: 1.7, spacing: 70, stagger: 1.6 };

/**
 * Send the towed guns in under Chinooks: one gun a helicopter, in trail.
 * The gun hangs on a sling under the hook, its model already on it. The
 * helicopter comes in fast, flares and slows over the last two hundred
 * metres, settles into a hover over the point, lowers until the gun is on
 * the ground, lets go, and climbs away.
 */
AirWing.prototype._deliverHelis = function _deliverHelis(drops, onLand, formationIndex = 0) {
  let eta = 0;
  drops.forEach((d, i) => {
    const target = d.pos.clone();
    const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const model = makeChinook();
    const lateral = -40 - (i + formationIndex) * 26;
    const behind = HELI.runIn + i * HELI.stagger * HELI.speed;
    model.position.copy(target).addScaledVector(dir, -behind).addScaledVector(side, lateral);
    dir.set(target.x - model.position.x, 0, target.z - model.position.z).normalize();
    model.rotation.y = Math.atan2(dir.x, dir.z);
    const cruise = Math.max(target.y + HELI.height, (d.ceiling ?? 0) + 24,
      this.ceilingAlong(model.position.x, model.position.z, target.x, target.z) + 24);
    model.position.y = cruise;
    this.scene.add(model);
    // The load, on its sling.
    const sling = new THREE.Group();
    const load = d.group || new THREE.Group();
    load.position.set(0, 0, 0);
    load.rotation.y = 0;
    sling.add(load);
    const pts = [];
    for (const [ox, oz] of [[-1.4, -1.6], [1.4, -1.6], [-1.4, 1.6], [1.4, 1.6]]) {
      pts.push(new THREE.Vector3(0, HELI.sling, 0), new THREE.Vector3(ox, 1.4, oz));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x3a3a38 }));
    sling.add(lines);
    sling.rotation.y = model.rotation.y;
    this.scene.add(sling);
    const dist0 = Math.hypot(target.x - model.position.x, target.z - model.position.z);
    const s = {
      def: d.def, model, dir, side, alt: cruise, target, speed: HELI.speed, t: 0, roar: 0, life: 0,
      released: true, flak: 0, bank: 0, pitch: 0, turnDir: 1,
      heli: { drop: d, onLand, sling, lines, phase: 'approach', hold: 0, wash: 0, cruise, vel: new THREE.Vector3(dir.x * HELI.speed, 0, dir.z * HELI.speed), yaw: model.rotation.y },
    };
    this.sorties.push(s);
    // Roughly: the run at speed less the slow-down, a hover, the lowering.
    eta = Math.max(eta, dist0 / HELI.speed + 6 + (HELI.hover - HELI.sling) / HELI.lower + 3);
  });
  return eta;
};

AirWing.prototype._updateHeli = function _updateHeli(s, dt) {
  const H = s.heli, m = s.model, d = H.drop;
  const ra = m.getObjectByName('rotorA'), rb = m.getObjectByName('rotorB');
  if (ra) ra.rotation.y += 22 * dt;
  if (rb) rb.rotation.y -= 22 * dt;
  const tx = s.target.x, tz = s.target.z, gy = s.target.y;
  const dx = tx - m.position.x, dz = tz - m.position.z;
  const dist = Math.hypot(dx, dz);
  let wantAlt = m.position.y;
  let speedBefore = Math.hypot(H.vel.x, H.vel.z);

  if (H.phase === 'approach') {
    // Slow to arrive: the speed it should have for the distance left.
    const want = Math.min(HELI.speed, Math.max(1.5, dist / 3.6));
    const ux = dist > 0.01 ? dx / dist : s.dir.x, uz = dist > 0.01 ? dz / dist : s.dir.z;
    H.vel.x += (ux * want - H.vel.x) * Math.min(1, dt * 1.6);
    H.vel.z += (uz * want - H.vel.z) * Math.min(1, dt * 1.6);
    // Down from cruise to the hover height over the last stretch — but not
    // through whatever stands between here and there.
    const k = THREE.MathUtils.clamp((dist - 30) / 260, 0, 1);
    wantAlt = gy + HELI.hover + (H.cruise - gy - HELI.hover) * k;
    H.look = (H.look || 0) - dt;
    if (H.look <= 0) {
      H.look = 0.4;
      const reach = Math.min(dist, 220);
      H.need = this.ceilingAlong(m.position.x, m.position.z, m.position.x + ux0(H) * reach, m.position.z + uz0(H) * reach) + 22;
    }
    if (dist > 45 && H.need > wantAlt) wantAlt = H.need;
    if (dist < 1.2 && speedBefore < 1.8) { H.phase = 'hover'; H.hold = 0; }
  } else if (H.phase === 'hover') {
    H.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
    wantAlt = gy + HELI.hover;
    H.hold += dt;
    if (H.hold > 0.9) { H.phase = 'lower'; }
  } else if (H.phase === 'lower') {
    H.vel.set(0, 0, 0);
    // Until the load is on the ground: the hook is a metre and a half under
    // the belly, the sling below that, the load's own base at its origin.
    // Stepped directly, not eased: eased toward a target a step away it
    // crept down at a fraction of the rate and never arrived.
    m.position.y -= HELI.lower * dt;
    wantAlt = m.position.y;
    if (m.position.y - 1.5 - HELI.sling <= gy) {
      m.position.y = wantAlt = gy + 1.5 + HELI.sling;
      H.phase = 'hold'; H.hold = 0;
      // Let go: the load is the unit now.
      H.sling.remove(H.lines);
      if (H.onLand) H.onLand(d);
      H.released = true;
    }
  } else if (H.phase === 'hold') {
    H.hold += dt;
    wantAlt = m.position.y;
    if (H.hold > 1.3) { H.phase = 'away'; s.pullUpAt = s.t; s.turnDir = 1; }
  } else if (H.phase === 'away') {
    const past = s.t - s.pullUpAt;
    // Up first, then away: the climb-out has to clear the town it is in.
    H.look = (H.look || 0) - dt;
    if (H.look <= 0) {
      H.look = 0.4;
      H.need = this.ceilingAlong(m.position.x, m.position.z, m.position.x + s.dir.x * 360, m.position.z + s.dir.z * 360) + 26;
    }
    const clear = m.position.y >= H.need - 4;
    const want = clear ? Math.min(HELI.speed, 4 + past * 6) : Math.min(8, 2 + past * 2);
    if (past > 3 && past < 11) {
      const a = 0.14 * dt * s.turnDir;
      const x = s.dir.x * Math.cos(a) - s.dir.z * Math.sin(a);
      const z = s.dir.x * Math.sin(a) + s.dir.z * Math.cos(a);
      s.dir.set(x, 0, z);
    }
    H.vel.x += (s.dir.x * want - H.vel.x) * Math.min(1, dt * 1.2);
    H.vel.z += (s.dir.z * want - H.vel.z) * Math.min(1, dt * 1.2);
    wantAlt = m.position.y + (clear ? Math.min(6, 1.5 + past * 0.8) : 9) * dt;
    s.life = past;
  }

  m.position.x += H.vel.x * dt;
  m.position.z += H.vel.z * dt;
  if (H.phase === 'away' || H.phase === 'lower') m.position.y = wantAlt;
  else m.position.y += (wantAlt - m.position.y) * Math.min(1, dt * 2.4);
  // Attitude: nose down to accelerate, up to slow, a little roll into a turn,
  // and the heading follows the motion once there is any.
  const speed = Math.hypot(H.vel.x, H.vel.z);
  const accel = (speed - speedBefore) / Math.max(dt, 1e-3);
  const wantPitch = THREE.MathUtils.clamp(-accel * 0.03 - speed * 0.0025, -0.2, 0.2);
  s.pitch += (wantPitch - s.pitch) * Math.min(1, dt * 2.0);
  if (speed > 2) H.yaw = Math.atan2(H.vel.x, H.vel.z);
  const wantBank = H.phase === 'away' && s.life > 3 && s.life < 11 ? 0.22 : 0;
  s.bank += (wantBank - s.bank) * Math.min(1, dt * 1.4);
  // Nose down to go, up to stop: in YXZ a positive x is nose down, and the
  // pitch here is positive when the helicopter is slowing.
  m.rotation.set(-s.pitch, H.yaw, s.turnDir * s.bank, 'YXZ');

  // The load, hanging from the hook, trailing the motion a little.
  if (!H.released) {
    m.updateMatrixWorld(true);
    const hook = this._v.set(0, -1.5, -0.5).applyMatrix4(m.matrixWorld);
    // The gun hangs along the line of flight, barrel forward.
    H.sling.rotation.y = H.yaw;
    H.sling.position.set(hook.x - H.vel.x * 0.09, hook.y - HELI.sling, hook.z - H.vel.z * 0.09);
    H.sling.rotation.z = THREE.MathUtils.clamp(H.vel.x * 0.006, -0.25, 0.25);
    H.sling.rotation.x = THREE.MathUtils.clamp(-H.vel.z * 0.006, -0.25, 0.25);
  }
  // Rotor wash on the ground under a low hover.
  if (this.fx && this.quality.name !== 'low' && m.position.y - gy < 32 && dist < 40) {
    H.wash -= dt;
    if (H.wash <= 0) { H.wash = 0.22; this.fx.impactDust(tx + (Math.random() - 0.5) * 8, gy, tz + (Math.random() - 0.5) * 8, 0.45); }
  }
  if (H.phase === 'away' && s.life > 26) s.done = true;
};

function ux0(H) { const l = Math.hypot(H.vel.x, H.vel.z); return l > 0.5 ? H.vel.x / l : Math.sin(H.yaw); }
function uz0(H) { const l = Math.hypot(H.vel.x, H.vel.z); return l > 0.5 ? H.vel.z / l : Math.cos(H.yaw); }
