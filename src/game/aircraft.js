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

/** The pitch of the roar for each airframe: the rocket clip slowed down. */
const STRIKE_RATE = { lancer: 0.42, ghostrider: 0.38, apache: 0.3, tomahawk: 0.62, warthog: 0.48 };

/** Dark grey, the way both of them are actually painted. */
const EAGLE_GREY = 0x565b61;
const LANCER_GREY = 0x3a3e43;
const HERCULES_GREY = 0x6d7378;

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
export function makeEagle({ store } = {}) {
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
  const olive = new THREE.MeshStandardMaterial({ color: 0x5e6b3a, roughness: 0.6 });
  if (store === 'gbu28') {
    // GBU-28: 5.8 m of 0.37 m gun barrel bored out and filled, which is what
    // the first ones were. Longer than the Eagle's belly is deep, so it rides
    // the centreline further down and further forward, with the laser seeker
    // and its canards on the nose and four fins on the tail.
    bomb.add(part(loft([
      { z: 3.0, w: 0.10, h: 0.10, n: 2 }, { z: 2.55, w: 0.34, h: 0.34, n: 2 },
      { z: 2.2, w: 0.38, h: 0.38, n: 2 }, { z: -2.5, w: 0.38, h: 0.38, n: 2 },
      { z: -2.85, w: 0.28, h: 0.28, n: 2 },
    ], 10), olive, 0, 0, 0));
    bomb.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10).rotateX(Math.PI / 2), dark, 0, 0, 3.0));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      bomb.add(part(new THREE.BoxGeometry(0.03, 0.34, 0.36), dark,
        Math.cos(a) * 0.3, Math.sin(a) * 0.3, 2.05, 0, 0, a - Math.PI / 2));
      bomb.add(part(new THREE.BoxGeometry(0.03, 0.62, 0.7), dark,
        Math.cos(a) * 0.42, Math.sin(a) * 0.42, -2.35, 0, 0, a - Math.PI / 2));
    }
    bomb.add(part(new THREE.BoxGeometry(0.10, 0.36, 2.2), dark, 0, 0.32, 0.2));
    bomb.position.set(0, -1.15, 0.9);
  } else {
    bomb.add(part(loft([
      { z: 1.6, w: 0.10, h: 0.10, n: 2 }, { z: 1.2, w: 0.34, h: 0.34, n: 2 },
      { z: -0.9, w: 0.36, h: 0.36, n: 2 }, { z: -1.5, w: 0.22, h: 0.22, n: 2 },
    ], 8), olive, 0, 0, 0));
    bomb.add(part(new THREE.BoxGeometry(0.10, 0.5, 0.9), dark, 0, 0.42, 0.1));
    bomb.position.set(0, -1.02, 0.4);
  }
  bomb.name = 'bomb';
  g.add(bomb);
  return g;
}

/**
 * A-10C Thunderbolt II. 16.3 m long, 17.5 m span, nose along +Z.
 *
 * Nothing else in the sky looks like it, which is the point of drawing it at
 * all: a straight, thick wing set low, the two engines in pods high on the
 * back of the fuselage, twin square fins on the ends of the tailplane, and the
 * seven barrels of the gun sticking out of the nose just off the centreline.
 */
export function makeWarthog() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x6b7177, roughness: 0.7, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.18, metalness: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false });
  g.add(part(loft([
    { z: 8.2, w: 0.5, h: 0.6, n: 2.2 },
    { z: 7.4, w: 1.1, h: 1.2, n: 2.4 },
    { z: 5.4, w: 1.5, h: 1.7, y: 0.05, n: 2.8 },
    { z: 2.0, w: 1.6, h: 1.8, y: 0.05, n: 3.0 },
    { z: -2.4, w: 1.3, h: 1.5, y: 0.1, n: 3.0 },
    { z: -6.0, w: 0.8, h: 1.0, y: 0.25, n: 2.8 },
    { z: -7.6, w: 0.4, h: 0.6, y: 0.3, n: 2.4 },
  ]), grey, 0, 0, 0));
  // The bubble canopy, high and well forward.
  g.add(part(loft([
    { z: 6.3, w: 0.2, h: 0.12, y: 0.8, n: 2.2 },
    { z: 5.5, w: 0.86, h: 0.62, y: 1.0, n: 2.4 },
    { z: 4.4, w: 0.9, h: 0.66, y: 1.02, n: 2.6 },
    { z: 3.6, w: 0.5, h: 0.3, y: 0.92, n: 2.6 },
  ], 10), glass, 0, 0, 0));
  // The gun: seven barrels in a cluster under the nose, a touch to port.
  const gun = new THREE.CylinderGeometry(0.18, 0.2, 1.4, 8).rotateX(Math.PI / 2);
  g.add(part(gun, dark, -0.18, -0.38, 8.6));
  // Straight wing, low on the body, the tips drooped a little.
  const wing = surface({ span: 7.8, root: 3.2, tip: 1.9, sweep: 0.4, thick: 0.42, dihedral: 0.06 });
  pair(g, wing, grey, 0.6, -0.42, 1.6);
  // Hardpoints and a load of stores under it.
  for (const x of [2.2, 3.6, 5.0]) {
    for (const sx of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 2.0, 8).rotateX(Math.PI / 2), dark, sx * x, -0.85, 0.6));
  }
  // The engines: two fat pods high on the back, on short pylons.
  for (const sx of [-1, 1]) {
    g.add(part(loft([
      { z: 0.0, w: 0.9, h: 0.9, n: 2.2 }, { z: -0.6, w: 1.24, h: 1.24, n: 2.2 },
      { z: -2.6, w: 1.2, h: 1.2, n: 2.2 }, { z: -3.6, w: 0.9, h: 0.9, n: 2.2 },
    ], 12), grey, sx * 1.25, 1.05, -2.2));
    g.add(part(new THREE.BoxGeometry(0.2, 0.6, 1.4), grey, sx * 0.85, 0.75, -3.2));
    const f = new THREE.ConeGeometry(0.34, 1.0, 8); f.rotateX(-Math.PI / 2);
    g.add(part(f, glow, sx * 1.25, 1.05, -6.0));
  }
  // Tailplane and the two square fins on its ends.
  const stab = surface({ span: 2.7, root: 1.8, tip: 1.5, sweep: 0.2, thick: 0.22 });
  pair(g, stab, grey, 0.3, 0.4, -5.8);
  const fin = surface({ span: 2.4, root: 1.8, tip: 1.3, sweep: 0.5, thick: 0.18 });
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(sx > 0 ? fin : mirrorX(fin), grey);
    m.position.set(sx * 3.0, 0.2, -5.7);
    m.rotation.z = sx * (Math.PI / 2);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/**
 * The airframe a strike flies, by its record: `aircraft.kind` picks the
 * builder and `aircraft.store` what the Eagle carries. Exported so the card
 * icons are rendered from exactly what the sortie draws.
 */
export function makeAirframe(def) {
  const a = def.aircraft || {};
  switch (a.kind) {
    case 'lancer': return makeLancer();
    case 'apache': return makeApache();
    case 'ghostrider': return makeGhostrider();
    case 'tomahawk': return makeTomahawk();
    case 'warthog': return makeWarthog();
    default: return makeEagle({ store: a.store });
  }
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
    if (def.aircraft?.station) return this._callLoiter(def, target, ceiling, opts);
    if (def.strike?.strafe) return this._callStrafe(def, target, ceiling, opts);
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
    const model = makeAirframe(def);
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
      // its bomb exactly where it was told to.
      //
      // It used to be a single roll taken before the aircraft was even in the
      // air — count the guns, spoil the run or do not. That was the right
      // effect arrived at the wrong way: the guns that decided it were the
      // ones near the aim point rather than the ones the run actually passed
      // over, nothing was drawn, and shooting one of them down between the
      // call and the release changed nothing. Now the aircraft flies through
      // real tracer from real crews and carries what it has been hit with:
      // every point of damage walks the bomb further off the point the player
      // marked, and a pilot who has taken enough of it leaves without
      // dropping at all. Killing the flak first is worth doing, and now it is
      // worth doing *while the aircraft is on its run*.
      flak: opts.flak || 0,
      hp: AIRFRAME.jet, hits: 0, jink: 0,
      // Which way the bomb walks. Fixed at the start, so a run that takes fire
      // all the way in does not wander: it goes further off the same way.
      jinkAt: Math.random() * Math.PI * 2,
    };
    this.sorties.push(s);
    return s;
  }

  /**
   * A gun run down a line: the A-10.
   *
   * The player draws the line, from where the stream should start to where
   * it should end; a tap with no drag is a line through the point, running
   * away from the camera. The aircraft comes in low along that line from well
   * behind its start, opens fire at a slant range of about seven hundred
   * metres, and walks a stream of 30 mm from the start of the line to its end
   * over a second and a half or so: a hundred-odd real rounds, each one a
   * projectile that stops against whatever it meets first. Then it pulls up
   * and away. Each round is a small high-explosive burst: lethal to a man
   * within a couple of metres of it, trench or not, and nothing that troubles
   * masonry beyond the face it chips.
   */
  _callStrafe(def, target, ceiling, opts = {}) {
    const a = def.aircraft, st = def.strike;
    let from = target.clone();
    let to = opts.to ? opts.to.clone() : null;
    if (!to || Math.hypot(to.x - from.x, to.z - from.z) < 12) {
      // A tap: a line through the point, along the camera's look.
      const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
      const l = Math.hypot(dx, dz) || 1;
      const half = st.defaultLen / 2;
      from = target.clone().set(target.x - dx / l * half, 0, target.z - dz / l * half);
      to = target.clone().set(target.x + dx / l * half, 0, target.z + dz / l * half);
    }
    // Not shorter than the stream needs, not longer than one burst covers.
    const len0 = Math.hypot(to.x - from.x, to.z - from.z);
    const len = THREE.MathUtils.clamp(len0, st.minLen, st.maxLen);
    const dir = new THREE.Vector3((to.x - from.x) / len0, 0, (to.z - from.z) / len0);
    to.set(from.x + dir.x * len, 0, from.z + dir.z * len);
    from.y = this.terrain.heightAt(from.x, from.z);
    to.y = this.terrain.heightAt(to.x, to.z);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const alt = Math.max(Math.max(from.y, to.y) + a.height, ceiling + a.clearance);
    const model = makeAirframe(def);
    model.rotation.order = 'YXZ';
    // Opens fire `lead` metres short of the start of the line. Steep: forty
    // degrees or so down the gun line, the way a gun run is flown, because
    // the trenches that matter are dug in streets, and a shallow stream is
    // stopped by the first block in front of them.
    const lead = Math.max(st.lead, (alt - from.y) * 1.15);
    model.position.copy(from).addScaledVector(dir, -(a.runIn + lead));
    model.position.y = alt;
    model.rotation.y = Math.atan2(dir.x, dir.z);
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    this.scene.add(model);
    const openAt = a.runIn / a.speed;
    const s = {
      def, model, dir, side, alt, target: from.clone(),
      speed: a.speed, t: 0, released: false,
      releaseAt: openAt, fall: st.burst,
      pullUpAt: openAt + st.burst + 0.8,
      climb: 0, roar: 0, life: 0,
      flak: opts.flak || 0,
      hp: AIRFRAME.jet * 2.2, hits: 0, jink: 0, jinkAt: Math.random() * Math.PI * 2,
      strafe: { from, to, fired: 0, rounds: st.rounds, burst: st.burst, brrt: false },
    };
    this.sorties.push(s);
    return s;
  }

  /** The rounds due by now, each from the gun to its point on the line. */
  _strafeFire(s) {
    const S = s.strafe, m = s.model;
    const since = s.t - s.releaseAt;
    const due = Math.min(S.rounds, Math.floor((since / S.burst) * S.rounds) + 1);
    const nose = this._v.set(0, -0.4, 8.6).applyQuaternion(m.quaternion).add(m.position);
    for (; S.fired < due; S.fired++) {
      const f = S.fired / Math.max(1, S.rounds - 1);
      // The stream walks the line, with the scatter of a gun firing from a
      // moving aircraft: a few metres either side and a little long or short.
      // Flak on the way in shakes the run off the line, but a pilot holding a
      // gun on a point corrects as he goes: a fraction of what the same hits
      // do to a bomb released blind, and never more than half a bay's width.
      const off = Math.min(3, s.jink * 0.05);
      const p = S.from.clone().lerp(S.to, f);
      p.addScaledVector(s.side, (Math.random() - 0.5) * 5.0 + Math.cos(s.jinkAt) * off);
      p.addScaledVector(s.dir, (Math.random() - 0.5) * 4.0 + Math.sin(s.jinkAt) * off);
      p.y = this.terrain.heightAt(p.x, p.z);
      const v = p.clone().sub(nose).normalize().multiplyScalar(1050);
      this.projectiles.fire({
        pos: nose.clone(), vel: v, gravity: 0, kind: 'direct', speed: 1050,
        warhead: s.def.warhead, owner: null, target: p, trail: 0,
      });
      if (this.tracers && S.fired % 2 === 0) this.tracers.fire(nose, p, { look: 'gau8' }, true);
    }
    if (this.fx) this.fx.trail(nose, 2.8);
    if (!S.brrt && this.audio) {
      S.brrt = true;
      // The gun is one sound, not a rattle of separate shots: at sixty-five
      // rounds a second the reports run together into the tearing note the
      // aircraft is named for.
      for (let k = 0; k < 5; k++) {
        setTimeout(() => this.audio.play('mg', m.position, { rate: 0.38, gain: 0.9, rolloff: 1600, cooldown: 0 }), k * 260);
      }
    }
  }

  /**
   * Everything of the player's that is in the air and can be shot at.
   *
   * Filled into a caller-owned array rather than allocating one a frame: the
   * garrison asks for this every tick of every battle.
   */
  airTargets(out = []) {
    out.length = 0;
    for (const s of this.sorties) {
      if (s.done || s.gone) continue;
      // The airframe itself. A jet that has already pulled up and is climbing
      // out is left alone — the shooting is about the run, and tracer chasing
      // a dot at three thousand metres is noise.
      if (!(s.climb > 0.9)) {
        // A helicopter is low and slow enough for anything with a barrel to
        // have a go at; the fixed-wing aircraft are the AA gun's alone.
        const heli = !!(s.heli || (s.loiter && !s.loiter.orbit));
        out.push({ kind: 'aircraft', sortie: s, pos: s.model.position,
          transport: !!(s.lift || s.heli), heli,
          hover: heli && !!(s.loiter ? s.loiter.phase === 'station' : s.heli.phase === 'hover' || s.heli.phase === 'lower' || s.heli.phase === 'hold') });
      }
      if (!s.lift) continue;
      for (const L of s.lift.loads) {
        for (const c of L.chutes) {
          if (c.phase === 'landed' || c.dead) continue;
          out.push({ kind: 'chute', sortie: s, load: L, chute: c, pos: c.g.position, seed: c.seed });
        }
      }
    }
    return out;
  }

  /**
   * A round has gone into something in the air.
   *
   * The garrison does the shooting and the deciding; this does the flying
   * consequences, which is the only half of it the aircraft knows about.
   */
  hitAir(t, damage) {
    if (!t) return;
    if (t.kind === 'chute') return this._hitChute(t, damage);
    const s = t.sortie;
    if (s.hp === undefined) return;
    s.hits++;
    s.hp -= damage;
    if (s.lift || s.heli) {
      // A transport does not abort — it is already over the drop zone and the
      // load is no use to anybody still in the aeroplane. It dumps the rest of
      // the sticks where it is and turns away, and the men come down wherever
      // that puts them.
      if (s.hp <= 0 && !s.dumping) {
        s.dumping = true;
        s.smoking = true;
        if (this.onAirEvent) this.onAirEvent('transporthit', { def: s.def });
      }
      return;
    }
    if (s.loiter) {
      if (s.hits === 1 && this.onAirEvent) this.onAirEvent('underfire', { def: s.def, loiter: true });
      if (s.hp <= 0 && s.loiter.phase !== 'down') {
        s.loiter.phase = 'down';
        s.loiter.fall = 0;
        s.smoking = true;
        if (this.onAirEvent) this.onAirEvent('shotdown', { def: s.def });
      }
      return;
    }
    if (s.released) { if (s.hp <= 0) s.smoking = true; return; }
    // Still carrying. The bomb walks off the point, and a pilot who has taken
    // enough goes home with it.
    s.jink += damage * JINK_PER_HP;
    if (s.hits === 1 && this.onAirEvent) this.onAirEvent('underfire', { def: s.def });
    if (s.hp <= 0 && !s.aborted) {
      s.aborted = true;
      s.smoking = true;
      s.pullUpAt = Math.min(s.pullUpAt, s.t);
      if (this.onAirEvent) this.onAirEvent('aborted', { def: s.def });
    }
  }

  /** A canopy takes a burst. Enough of them and it stops being a canopy. */
  _hitChute(t, damage) {
    const c = t.chute;
    if (c.dead || c.streaming) return;
    c.hp -= damage;
    if (c.hp > 0) return;
    c.streaming = true;
    // A man whose canopy has gone does not survive the ground. A platform
    // does: it lands hard, and whatever was lashed to it gets up damaged.
    c.dead = t.load.troops;
    if (this.onAirEvent) {
      this.onAirEvent('canopy', { def: t.load.drop.def, troops: t.load.troops });
    }
  }

  update(dt) {
    for (const s of this.sorties) {
      s.t += dt;
      const m = s.model;
      if (s.lift) {
        this._updateLift(s, dt);
      } else if (s.heli) {
        this._updateHeli(s, dt);
      } else if (s.loiter) {
        this._updateLoiter(s, dt);
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

      // A gun run fires for the length of its burst, unless it was driven off.
      if (s.strafe && !s.aborted && s.t >= s.releaseAt && s.strafe.fired < s.strafe.rounds) {
        s.released = true;
        this._strafeFire(s);
      }
      // Driven off: the bomb stays on the rail and the aircraft goes home.
      if (s.aborted && !s.released) s.released = true;

      // Let go.
      if (!s.released && s.t >= s.releaseAt && !s.lift && !s.heli && !s.strafe) {
        s.released = true;
        // Where it actually goes. The aim point walks off by what the pilot
        // has been hit with on the way in, and a pilot under fire lets go
        // early rather than late, so the error is short of the mark as often
        // as it is wide of it.
        if (s.jink > 0) {
          s.harried = s.jink;
          s.target.x += Math.cos(s.jinkAt) * s.jink;
          s.target.z += Math.sin(s.jinkAt) * s.jink;
        }
        const bomb = m.getObjectByName('bomb');
        if (bomb) bomb.visible = false;
        // A cruise missile has nothing to let go of: the airframe is the
        // round, and from here the projectile is what the player watches.
        if (s.def.aircraft.consumed) { m.visible = false; s.done = true; }
        const p = s.def.projectile;
        // A salvo goes out as one release of `n` rounds spaced back along the
        // run, so they arrive one after another along a line through the
        // target: the gunship's rake rather than a single crater.
        const salvo = s.def.strike?.salvo;
        const n = salvo ? salvo.n : 1, spread = salvo ? salvo.spread : 0;
        for (let k = 0; k < n; k++) {
          const back = k * spread;
          const along = (k - (n - 1) / 2) * spread * 0.7;
          this.projectiles.fire({
            pos: m.position.clone().addScaledVector(s.dir, -back).setY(m.position.y - 1.6),
            vel: new THREE.Vector3(s.dir.x * s.speed, 0, s.dir.z * s.speed),
            gravity: p.gravity, kind: 'bomb', drag: p.drag || 0, speed: s.speed,
            warhead: s.def.warhead, owner: null,
            target: n > 1 ? s.target.clone().addScaledVector(s.dir, along) : s.target, trail: p.trail,
            strikeDef: s.def,
          });
        }
        if (this.audio) this.audio.play('rocket', m.position, { rate: 0.7, gain: 0.5, rolloff: 900 });
      }

      // Rotors and props turn on a strike airframe. The lift and the Chinook
      // turn their own in their own updates; doing it here as well ran them
      // at twice the speed.
      if (!s.lift && !s.heli) for (const c of m.children) {
        if (c.name === 'prop') c.rotation.z += 38 * dt;
        else if (c.name === 'rotorA') c.rotation.y += 22 * dt;
        else if (c.name === 'tailrotor') c.rotation.x += 60 * dt;
      }

      // Engine smoke and the roar. The roar is the rocket clip pitched down,
      // played on a short cycle while the aircraft is anywhere near.
      if (this.fx && this.quality.name !== 'low') {
        this._v.copy(m.position).addScaledVector(s.dir, -10);
        this._v.y -= 0.5;
        // An aircraft that has been hit trails properly, so a player who was
        // looking somewhere else can still read what happened to his strike.
        this.fx.trail(this._v, s.smoking ? 5.0 : 1.6);
        if (s.smoking) {
          this._v.copy(m.position).addScaledVector(s.dir, -22);
          this.fx.trail(this._v, 3.4);
        }
      }
      s.roar -= dt;
      if (s.roar <= 0 && this.audio) {
        s.roar = 1.1;
        const d = this.camera.position.distanceTo(m.position);
        if (d < 2400) {
          this.audio.play('rocket', m.position, {
            rate: s.heli ? 0.3 : s.lift ? 0.36 : STRIKE_RATE[s.def.aircraft.kind] ?? 0.55,
            gain: s.heli || s.loiter ? 0.42 : s.lift ? 0.4 : 0.55, rolloff: s.heli || s.loiter ? 900 : 1400,
          });
        }
      }

      // Gone once it is well past and climbing away — and, for a transport,
      // once its loads are down and the canopies are gone.
      if (!s.lift && !s.heli && !s.loiter) s.life = s.t - s.pullUpAt;
      if (s.lift) {
        if (s.life > 22 && s.lift.allDown) s.done = true;
        else if (s.life > 30) m.visible = false;
      } else if (s.heli || s.loiter) {
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
export function makeHercules({ gunship = false } = {}) {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: HERCULES_GREY, roughness: 0.7, metalness: 0.25 });
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
  // The open cargo hold, and the ramp down under the tail. A gunship flies
  // with its ramp up: it is not delivering anything.
  if (!gunship) {
    g.add(part(new THREE.BoxGeometry(3.2, 2.5, 1.2), black, 0, 0.25, -7.6));
    const ramp = part(new THREE.BoxGeometry(3.3, 0.24, 4.4), grey, 0, -1.55, -9.6);
    ramp.rotation.x = -0.42;
    g.add(ramp);
  }
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
const LIFT = { speed: 108, height: 96, clearance: 45, runIn: 520, spacing: 82, stagger: 0.9, perAircraft: 6, cluster: 150 };
/**
 * How the load comes down.
 *
 * A man under a round canopy falls at six or seven metres a second and a
 * heavy platform rather less, and those were the numbers here. Measured from
 * the tap: fifteen seconds of run-in, eighteen and a half under the canopy —
 * half a minute of watching before the gun exists, every time, on top of a
 * delivery the player has already paid for. Eleven and a half is faster than
 * anybody jumps, and it is the difference between an airlift and a wait.
 *
 * `maxUnder` is the backstop for a drop that has to be let go from high up:
 * the aircraft clears whatever is on its run, and where that cannot be flown
 * around — a stick put down at the foot of the Burj — the canopy comes down
 * at whatever rate gets it there in the time, rather than at its own.
 */
const CHUTE = { troopRate: 11.5, cargoRate: 10.0, freeFall: 0.7, open: 0.5, stick: 0.3, maxUnder: 13 };

/**
 * What it takes to hurt something in the air.
 *
 * These are not hit points in the sense the ground units have them: nothing
 * up here is meant to be killed outright by a lucky burst. They are how long
 * a thing can stay in a cone of tracer before the pilot stops flying the run
 * he was briefed and starts flying away from the guns — which is what air
 * defence has always actually done, and is the effect worth modelling.
 *
 * A jet crossing at two hundred and forty knots is in range for a few
 * seconds and its number is small to match. A transport is slower, lower and
 * straighter, and has to stay that way until the last man is off the ramp,
 * so it is tougher and still the one that suffers. A canopy is a canopy: it
 * takes a while to shoot away with small arms, and no time at all under flak.
 */
// The Apache is built to be shot at and stays in the flak for half a minute;
// it takes about twice what the Chinook does before it goes down.
const AIRFRAME = { jet: 100, transport: 220, heli: 170, gunship: 480, ac130: 900 };
const CANOPY = { troop: 195, cargo: 340 };
/** How far off a bomb goes, in metres, per point of damage taken before release. */
const JINK_PER_HP = 0.55;
/** A streaming canopy: no steering, and down at this rate instead of its own. */
const STREAM_RATE = 23;

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

    // The way in: a line that does not have to climb.
    //
    // The run came in from behind the camera, always, and had to clear
    // whatever stood along it — which on a level with a six-hundred-metre
    // tower in it is the tower. The altitude that clears it is the altitude
    // the men leave from: a drop two hundred and sixty metres from the Burj
    // put the stick out at seven hundred and eight metres and left the player
    // watching canopies for a minute and a half, for a gun he had already
    // paid for. A transport flies round a thing like that. The camera's own
    // bearing is still the one it wants, and is kept unless another is
    // materially lower, so on a level with nothing in the way the run comes in
    // over the player's shoulder exactly as before.
    // Scored on the line itself. A drop's own `ceiling` — the tower, when the
    // drop is within two hundred metres of it — is what `_launch` hands over
    // as a floor, and taking it as one here made every bearing equal: the
    // aircraft was flown over the Burj because the *landing point* was near
    // the Burj, whichever way it came in. The line answers the question the
    // floor was standing in for, because a run to a point beside the tower
    // passes beside the tower.
    // The line a given bearing actually produces — start point, the heading
    // from it through the drop, and the stretch flown past. Scored on exactly
    // the geometry that will be flown, because the aircraft's own heading is
    // not the bearing: it is aimed from a start point set off to one side of
    // it, and those three degrees were the difference between a run passing
    // a hundred and eighty-four metres from the Burj and one passing a
    // hundred and seventy-eight, which is inside its corridor. Scoring one
    // line and flying another chose a clear approach and then climbed over
    // the tower anyway.
    const lineFor = (bear) => {
      const ux = Math.sin(bear), uz = Math.cos(bear);
      const sx = target.x - ux * behind - uz * lateral;
      const sz = target.z - uz * behind + ux * lateral;
      let fx = target.x - sx, fz = target.z - sz;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      return { sx, sz, fx, fz, ex: target.x + fx * 700, ez: target.z + fz * 700 };
    };
    const ceilOn = (L) => this.ceilingAlong(L.sx, L.sz, L.ex, L.ez);
    const camBear = Math.atan2(dir.x, dir.z);
    let line = lineFor(camBear), low = ceilOn(line);
    for (let k = 1; k < 12 && low > target.y + LIFT.height; k++) {
      const l2 = lineFor(camBear + (k / 12) * Math.PI * 2);
      const c2 = ceilOn(l2);
      // Materially lower, not merely lower: a run swung round the compass for
      // ten metres of clearance is a run that no longer comes from where the
      // player is looking.
      if (c2 < low - 25) { low = c2; line = l2; }
    }

    model.position.set(line.sx, 0, line.sz);
    dir.set(line.fx, 0, line.fz);
    side.set(-dir.z, 0, dir.x);
    model.rotation.y = Math.atan2(dir.x, dir.z);
    // High enough for the whole run, and the stretch past it: the Hercules
    // flew through the Great Pyramid because the drop was clear of it and
    // the run was not.
    const alt = Math.max(target.y + LIFT.height, low + LIFT.clearance);
    model.position.y = alt;
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    this.scene.add(model);
    const runLen = Math.hypot(target.x - model.position.x, target.z - model.position.z);
    const overAt = runLen / LIFT.speed;
    // Each load goes out where the run passes its point, in that order, a
    // stick's spacing apart at least; the chutes steer the rest of the way.
    const loads = group.map((d) => {
      const troops = d.def.model === 'infantry';
      // Its own rate, or whatever gets it down in the time when the run had to
      // be flown high: a canopy is not worth watching for a minute.
      const drop = Math.max(1, alt - d.pos.y);
      const rate = Math.max(troops ? CHUTE.troopRate : CHUTE.cargoRate, drop / CHUTE.maxUnder);
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
      hp: AIRFRAME.transport, hits: 0,
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
    hp: L.troops ? CANOPY.troop : CANOPY.cargo, seed: Math.random(),
  });
  L.nextAt = s.t + CHUTE.stick;
};

/**
 * Fly one load's chutes down. Returns true when all of it is on the ground.
 *
 * The tally is kept on the load rather than counted out of `L.chutes` each
 * tick, because that list is not the load: `_collapse` takes a canopy out of
 * it a second after it lands. That was harmless while every man of a stick
 * came down together at the same seven and a half metres a second. A canopy
 * that has been shot away falls at three times that, so the man who was hit
 * is on the ground and swept up long before his partner — and a count of
 * what was still in the list could never reach the size of the stick again.
 * The load hung in `pending` for the rest of the battle and the unit it was
 * carrying never arrived.
 */
AirWing.prototype._updateChutes = function _updateChutes(L, dt) {
  const touch = (c) => {
    c.phase = 'landed';
    c.landedAt = c.t;
    L.down = (L.down || 0) + 1;
    if (c.dead) L.deadMen = (L.deadMen || 0) + 1;
    if (c.streaming) L.streamed = (L.streamed || 0) + 1;
  };
  for (const c of L.chutes) {
    if (c.phase === 'landed') continue;
    c.t += dt;
    if (c.phase === 'free' && c.t > CHUTE.freeFall) c.phase = 'open';
    const p = c.g.position;
    if (c.streaming) {
      // Shot away. The canopy is a rag over his head, there is no steering
      // any more, and the only question left is how hard the ground is.
      for (const k of c.canopies) {
        k.scale.set(Math.max(0.06, k.scale.x - dt * 1.8), Math.max(0.06, k.scale.y - dt * 2.4), 1);
      }
      c.vel.y += (-STREAM_RATE - c.vel.y) * Math.min(1, dt * 2.2);
      c.vel.x -= c.vel.x * 0.9 * dt;
      c.vel.z -= c.vel.z * 0.9 * dt;
      c.g.rotation.x = Math.sin(c.t * 5.0) * 0.5;
      c.g.rotation.z = Math.cos(c.t * 4.1) * 0.45;
      p.addScaledVector(c.vel, dt);
      if (p.y <= c.landY) {
        p.y = c.landY;
        touch(c);
        if (this.fx) this.fx.impactDust(p.x, p.y, p.z, L.troops ? 1.1 : 2.6);
      }
      continue;
    }
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
      c.g.rotation.set(0, c.g.rotation.y, 0);
      touch(c);
      if (this.fx && this.quality.name !== 'low') this.fx.impactDust(p.x, p.y, p.z, L.troops ? 0.4 : 1.6);
    }
  }
  return (L.down || 0) >= L.toGo && L.out === L.toGo;
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
    // Hit hard enough: everything still on board goes now, wherever the
    // aeroplane happens to be. A stick dumped short has the whole descent to
    // fly back to its mark and generally cannot, which is the cost.
    if (s.dumping && !L.dumped && L.out < L.toGo) {
      L.dumped = true;
      L.releaseAt = Math.min(L.releaseAt, s.t);
      L.nextAt = Math.min(L.nextAt, s.t);
    }
    if (L.out < L.toGo && s.t >= L.releaseAt && s.t >= L.nextAt) this._release(s, L);
    if (L.out > 0 && !L.landed && this._updateChutes(L, dt)) {
      L.landed = true;
      // How it arrives. A load whose canopies were shot away comes in hard;
      // a stick that lost men arrives short-handed; a stick that lost all of
      // them does not arrive at all.
      const dead = L.deadMen || 0;
      const streamed = L.streamed || 0;
      L.drop.lost = L.troops && dead >= L.toGo;
      L.drop.arrivalHealth = L.troops
        ? Math.max(0.2, 1 - dead / Math.max(1, L.toGo))
        : (streamed ? 0.45 : 1);
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
      hp: AIRFRAME.heli, hits: 0,
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

/**
 * AH-64E Apache. 15.1 m of fuselage under a 14.6 m rotor, nose along +Z.
 *
 * What makes it read as an Apache from the game's distance: the two stepped
 * cockpits in flat-paned glass, the sensor turret on the nose with the chain
 * gun under it, the engines slung high either side of the body with their
 * exhausts turned out, the mast with the Longbow radome on top, the stub
 * wings hung with Hellfire racks and rocket pods, and the tail rotor set
 * high on the left of the fin. Painted the Army's helicopter drab.
 *
 * `rotorA` and `tailrotor` are spun by the sortie; the first Hellfire is
 * named `bomb` and is the one that leaves the rail.
 */
export function makeApache() {
  const g = new THREE.Group();
  const drab = new THREE.MeshStandardMaterial({ color: 0x3a3f36, roughness: 0.8, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.55, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.16, metalness: 0.82 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4d5445, roughness: 0.75, metalness: 0.2 });

  // The body: a narrow, deep fuselage. The sensor nose, the two cockpits
  // stepping up, the engine bay where it is widest, and the boom drawn out
  // to the fin with a rise in it.
  g.add(part(loft([
    { z: 7.25, w: 0.42, h: 0.50, y: -0.10, n: 2.2 },
    { z: 6.40, w: 0.98, h: 1.30, y: 0.00, n: 2.6 },
    { z: 5.10, w: 1.14, h: 1.78, y: 0.16, n: 3.0 },
    { z: 3.70, w: 1.22, h: 2.10, y: 0.34, n: 3.2 },
    { z: 2.30, w: 1.40, h: 2.00, y: 0.28, n: 3.2 },
    { z: 0.20, w: 1.32, h: 1.70, y: 0.24, n: 3.0 },
    { z: -2.00, w: 1.00, h: 1.22, y: 0.36, n: 2.8 },
    { z: -4.60, w: 0.70, h: 0.86, y: 0.52, n: 2.6 },
    { z: -7.00, w: 0.56, h: 0.70, y: 0.70, n: 2.4 },
    { z: -8.30, w: 0.40, h: 0.56, y: 0.80, n: 2.2 },
  ], 12), drab, 0, 0, 0));

  // The cockpits: flat panes, the gunner low and forward, the pilot behind
  // and above him, a windscreen leaning back over the gunner.
  g.add(part(new THREE.BoxGeometry(1.10, 0.74, 1.30), glass, 0, 0.78, 5.55));
  g.add(part(new THREE.BoxGeometry(1.16, 0.80, 1.40), glass, 0, 1.14, 3.95));
  const screen = part(new THREE.BoxGeometry(1.00, 0.08, 0.95), glass, 0, 0.92, 6.30);
  screen.rotation.x = -0.75;
  g.add(screen);
  // The canopy frame between the two seats, and the roof over the pilot.
  g.add(part(new THREE.BoxGeometry(1.18, 0.86, 0.14), drab, 0, 1.0, 4.72));
  g.add(part(new THREE.BoxGeometry(1.16, 0.10, 1.50), drab, 0, 1.56, 3.95));

  // The nose: the TADS/PNVS turret, a drum across the nose with the sensor
  // windows in its face, and the M230 chain gun on its cradle under it.
  g.add(part(new THREE.CylinderGeometry(0.44, 0.44, 0.86, 14), dark, 0, -0.08, 6.95, 0, 0, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.34, 0.30, 0.22), glass, -0.22, -0.02, 7.32));
  g.add(part(new THREE.BoxGeometry(0.30, 0.26, 0.22), glass, 0.24, -0.06, 7.32));
  g.add(part(new THREE.BoxGeometry(0.46, 0.34, 0.90), dark, 0, -0.98, 4.90));
  g.add(part(new THREE.CylinderGeometry(0.05, 0.06, 1.70, 8), black, 0, -1.02, 5.85, Math.PI / 2 - 0.04, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.16, 0.20, 0.24), dark, 0, -1.02, 6.60));

  // The engines: two nacelles high on the shoulders behind the cockpit, an
  // intake screen on the front of each, the exhaust turned out through the
  // infrared suppressor at the back.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 3.00, w: 0.74, h: 0.74, n: 2.3 },
      { z: 1.60, w: 0.86, h: 0.88, n: 2.6 },
      { z: -0.40, w: 0.80, h: 0.82, n: 2.6 },
      { z: -1.30, w: 0.66, h: 0.70, n: 2.4 },
    ], 10), drab, s * 1.18, 0.92, 0));
    g.add(part(new THREE.CylinderGeometry(0.30, 0.30, 0.10, 12), black, s * 1.18, 0.92, 3.02, Math.PI / 2, 0, 0));
    const ex = part(new THREE.BoxGeometry(0.62, 0.50, 0.70), dark, s * 1.42, 0.92, -1.60);
    ex.rotation.y = s * 0.55;
    g.add(ex);
    // The fairing that ties the nacelle to the body.
    g.add(part(new THREE.BoxGeometry(0.60, 0.70, 3.40), drab, s * 0.78, 0.85, 0.80));
  }

  // The mast, the rotor head and the Longbow radome on top of it.
  g.add(part(new THREE.CylinderGeometry(0.16, 0.22, 1.10, 10), dark, 0, 1.85, 1.60));
  g.add(part(new THREE.CylinderGeometry(0.62, 0.66, 0.34, 16), drab, 0, 2.86, 1.60));
  const rotor = new THREE.Group();
  rotor.add(part(new THREE.CylinderGeometry(0.34, 0.40, 0.44, 12), dark, 0, 0, 0));
  for (let k = 0; k < 4; k++) {
    const holder = new THREE.Group();
    holder.add(part(new THREE.BoxGeometry(6.90, 0.07, 0.53), black, 3.75, 0.06, 0));
    // The swept tips, which are the one thing that says Apache from above.
    const tip = part(new THREE.BoxGeometry(0.60, 0.06, 0.40), black, 7.35, 0.06, -0.14);
    tip.rotation.y = 0.35;
    holder.add(tip);
    holder.rotation.y = (k / 4) * Math.PI * 2;
    rotor.add(holder);
  }
  rotor.add(part(new THREE.CylinderGeometry(7.4, 7.4, 0.04, 28),
    new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0.06, 0));
  rotor.position.set(0, 2.42, 1.60);
  rotor.name = 'rotorA';
  g.add(rotor);

  // The stub wings and what hangs off them: a four-round Hellfire rack on
  // each inboard pylon, a nineteen-shot rocket pod on each outboard one.
  const wing = surface({ span: 2.05, root: 1.10, tip: 0.86, sweep: 0.12, thick: 0.17, ridge: 0.4 });
  pair(g, wing, drab, 0.70, 0.22, 1.85);
  let hellfire = 0;
  for (const s of [-1, 1]) {
    for (const [x, outboard] of [[1.55, false], [2.45, true]]) {
      // The pylon: a swept plate hanging from the wing.
      g.add(part(new THREE.BoxGeometry(0.14, 0.52, 0.86), drab, s * x, -0.10, 1.35));
      if (!outboard) {
        // The M299 rail: a beam with the four missiles two over two.
        g.add(part(new THREE.BoxGeometry(0.62, 0.16, 1.30), dark, s * x, -0.40, 1.30));
        for (const dx of [-0.22, 0.22]) {
          for (const dy of [-0.16, -0.60]) {
            const m = part(new THREE.CylinderGeometry(0.09, 0.09, 1.63, 10), olive, s * x + dx, -0.40 + dy, 1.20, Math.PI / 2, 0, 0);
            // Seeker dome, fins fore and aft.
            const round = new THREE.Group();
            round.add(m);
            round.add(part(new THREE.SphereGeometry(0.09, 10, 8), glass, s * x + dx, -0.40 + dy, 2.02));
            for (let k = 0; k < 4; k++) {
              const a = k * Math.PI / 2 + Math.PI / 4;
              round.add(part(new THREE.BoxGeometry(0.02, 0.16, 0.22), dark,
                s * x + dx + Math.cos(a) * 0.14, -0.40 + dy + Math.sin(a) * 0.14, 0.50, 0, 0, a));
              round.add(part(new THREE.BoxGeometry(0.02, 0.12, 0.18), dark,
                s * x + dx + Math.cos(a) * 0.13, -0.40 + dy + Math.sin(a) * 0.13, 1.72, 0, 0, a));
            }
            if (hellfire++ === 0) round.name = 'bomb';
            g.add(round);
          }
        }
      } else {
        // The M261 pod: a drum with the nineteen tubes read as a dark face.
        g.add(part(new THREE.CylinderGeometry(0.24, 0.24, 1.68, 14), olive, s * x, -0.52, 1.20, Math.PI / 2, 0, 0));
        g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 14), black, s * x, -0.52, 2.05, Math.PI / 2, 0, 0));
      }
    }
  }

  // The tail: the fin standing up from the end of the boom, the stabilator
  // at its foot, and the tail rotor high on the left of the fin.
  const fin = surface({ span: 2.05, root: 1.55, tip: 0.85, sweep: 0.55, thick: 0.22 });
  const finMesh = new THREE.Mesh(fin, drab);
  finMesh.position.set(0, 0.95, -6.90);
  finMesh.rotation.z = Math.PI / 2;
  finMesh.castShadow = true;
  g.add(finMesh);
  const stab = surface({ span: 1.70, root: 0.92, tip: 0.66, sweep: 0.20, thick: 0.14 });
  pair(g, stab, drab, 0.22, 0.70, -7.20);
  const tail = new THREE.Group();
  tail.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.30, 10), dark, 0, 0, 0, 0, 0, Math.PI / 2));
  // Four blades in the Apache's off-square X, two pairs fifty-five degrees apart.
  for (const a of [0, 0.96, Math.PI, Math.PI + 0.96]) {
    const holder = new THREE.Group();
    holder.add(part(new THREE.BoxGeometry(0.06, 1.38, 0.24), black, 0, 0.72, 0));
    holder.rotation.x = a;
    tail.add(holder);
  }
  tail.add(part(new THREE.CylinderGeometry(1.42, 1.42, 0.04, 20),
    new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, 0, 0, Math.PI / 2));
  tail.position.set(-0.36, 2.55, -7.55);
  tail.name = 'tailrotor';
  g.add(tail);
  // The gearbox fairing the tail rotor sits on.
  g.add(part(new THREE.BoxGeometry(0.30, 0.50, 0.70), drab, -0.10, 2.55, -7.55));

  // The undercarriage: two tall struts forward with the wheels on the
  // outside of them, a drag brace back to the belly, and the tail wheel.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.CylinderGeometry(0.06, 0.07, 1.30, 8), dark, s * 1.10, -1.05, 4.10, 0, 0, s * 0.18));
    g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 1.70, 8), dark, s * 0.95, -1.05, 3.30, 0.95, 0, s * 0.12));
    g.add(part(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14), black, s * 1.28, -1.68, 4.10, 0, 0, Math.PI / 2));
    g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 10), dark, s * 1.28, -1.68, 4.10, 0, 0, Math.PI / 2));
  }
  g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 0.60, 8), dark, 0, 0.05, -6.40));
  g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10), black, 0, -0.30, -6.40, 0, 0, Math.PI / 2));

  // Pitot, wire cutters, antennas: the fuzz that stops it looking moulded.
  g.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), dark, 0.42, 0.55, 7.10, Math.PI / 2, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.06, 0.55, 0.10), dark, 0, 1.98, 3.00, -0.6, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.06, 0.32, 0.20), dark, 0, 1.05, -3.60));
  g.add(part(new THREE.BoxGeometry(0.06, 0.22, 0.18), dark, 0.30, -0.55, -1.40));

  g.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  return g;
}

/**
 * AC-130J Ghostrider: a Hercules with its hold shut, painted gunship grey,
 * and armed down the left side, which is the side it fights from.
 *
 * The 30 mm GAU-23 is forward of the wheel well, the 105 mm howitzer aft of
 * the wing, both out of the port side at right angles to the run, so the
 * aircraft is seen to be shooting sideways while it rakes the line. The
 * sensor balls hang under the nose and off the port side by the crew door,
 * the satcom radome rides the spine behind the wing, and the wingtips carry
 * the Precision Strike Package pods. Props are named `prop` like the
 * transport's and spin the same way.
 */
export function makeGhostrider() {
  const g = makeHercules({ gunship: true });
  const grey = new THREE.MeshStandardMaterial({ color: 0x484e53, roughness: 0.68, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.55, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.16, metalness: 0.82 });
  // Repaint: everything in the transport's grey goes gunship grey, the
  // glazing, gear and props keep their own.
  g.traverse((m) => {
    if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === HERCULES_GREY) m.material = grey;
  });

  // The 30 mm: a cradle through the skin, the barrel out past the fuselage
  // wall with its muzzle brake, a blast deflector plate on the skin aft of it.
  g.add(part(new THREE.BoxGeometry(0.6, 0.7, 0.9), dark, 2.05, -0.55, 6.2));
  g.add(part(new THREE.CylinderGeometry(0.075, 0.085, 1.6, 10), black, 2.95, -0.55, 6.2, 0, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10), dark, 3.62, -0.55, 6.2, 0, 0, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.08, 1.2, 1.6), dark, 2.24, -0.55, 5.1));

  // The 105 mm: the M102's barrel, longer and heavier, out of the aft port
  // side with the recoil housing inboard and a flared muzzle.
  g.add(part(new THREE.BoxGeometry(0.7, 0.9, 1.3), dark, 2.0, -0.45, -5.6));
  g.add(part(new THREE.CylinderGeometry(0.1, 0.12, 2.5, 12), black, 3.4, -0.45, -5.6, 0, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.16, 0.13, 0.4, 12), dark, 4.55, -0.45, -5.6, 0, 0, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.08, 1.4, 2.0), dark, 2.24, -0.45, -6.6));

  // Sensors: the ball under the chin, the second on the port side forward,
  // the flat panel of the electro-optical suite on the crew door.
  g.add(part(new THREE.SphereGeometry(0.52, 14, 10), dark, 0, -2.15, 11.6));
  g.add(part(new THREE.BoxGeometry(0.5, 0.3, 0.3), glass, 0, -2.2, 12.05));
  g.add(part(new THREE.SphereGeometry(0.46, 14, 10), dark, 2.45, -1.0, 8.4));
  g.add(part(new THREE.BoxGeometry(0.28, 0.24, 0.3), glass, 2.85, -1.0, 8.4));
  g.add(part(new THREE.BoxGeometry(0.1, 1.5, 1.0), dark, 2.2, 0.3, 8.6));

  // The satcom radome on the spine, and the antenna farm ahead of it.
  g.add(part(loft([
    { z: -1.0, w: 1.6, h: 0.1, y: 2.2, n: 2.4 },
    { z: -2.0, w: 1.9, h: 0.8, y: 2.35, n: 2.4 },
    { z: -3.2, w: 1.6, h: 0.5, y: 2.3, n: 2.4 },
    { z: -3.8, w: 0.6, h: 0.1, y: 2.2, n: 2.2 },
  ], 12), grey, 0, 0, 0));
  for (const z of [10.6, 9.2, 7.6, 4.8, -5.0, -6.2]) g.add(part(new THREE.BoxGeometry(0.06, 0.34, 0.26), dark, 0.2, 2.35, z));
  for (const z of [6.4, -4.2]) g.add(part(new THREE.BoxGeometry(0.06, 0.3, 0.22), dark, 0.4, -2.35, z));

  // Wingtip pods and the wing-mounted flare dispensers.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.CylinderGeometry(0.36, 0.3, 3.4, 12), grey, s * 22.0, 1.95, 1.2, Math.PI / 2, 0, 0));
    g.add(part(new THREE.SphereGeometry(0.3, 10, 8), dark, s * 22.0, 1.95, 2.9));
    g.add(part(new THREE.BoxGeometry(0.9, 0.36, 0.6), dark, s * 6.9, -1.6, -1.2));
  }
  g.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  return g;
}

/**
 * BGM-109 Tomahawk in cruise: 5.56 m of half-metre tube, the wings out,
 * the four tail fins in an X, the engine's inlet scooped from under the
 * belly, nose along +Z. White, with the dark seeker window on the nose and
 * the burner lit at the tail. There is nothing to release: at the aim
 * point the missile itself becomes the round.
 */
export function makeTomahawk() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xd9dbd6, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.55, metalness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.16, metalness: 0.82 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false });

  // The tube: an ogive nose, a constant half-metre body, a short boat-tail.
  g.add(part(loft([
    { z: 2.78, w: 0.04, h: 0.04, n: 2.0 },
    { z: 2.40, w: 0.24, h: 0.24, n: 2.0 },
    { z: 1.90, w: 0.44, h: 0.44, n: 2.0 },
    { z: 1.40, w: 0.52, h: 0.52, n: 2.0 },
    { z: -2.10, w: 0.52, h: 0.52, n: 2.0 },
    { z: -2.60, w: 0.42, h: 0.42, n: 2.0 },
    { z: -2.78, w: 0.30, h: 0.30, n: 2.0 },
  ], 16), white, 0, 0, 0));
  // The seeker window on the nose, and the panel lines of the payload bay.
  g.add(part(new THREE.CylinderGeometry(0.19, 0.24, 0.16, 16), glass, 0, 0, 2.22, Math.PI / 2, 0, 0));
  for (const z of [1.35, -0.55, -1.90]) g.add(part(new THREE.CylinderGeometry(0.265, 0.265, 0.03, 16), dark, 0, 0, z, Math.PI / 2, 0, 0));

  // The wings, swung out from the mid-body: 2.67 m across, thin and square.
  const wing = surface({ span: 1.08, root: 0.56, tip: 0.44, sweep: 0.10, thick: 0.05, ridge: 0.45 });
  pair(g, wing, white, 0.24, -0.03, 0.55);

  // The inlet: the scoop under the belly behind the wings that feeds the
  // turbofan, with the exhaust pipe out of the tail.
  g.add(part(loft([
    { z: -0.60, w: 0.30, h: 0.04, y: -0.26, n: 2.6 },
    { z: -0.95, w: 0.32, h: 0.24, y: -0.36, n: 2.8 },
    { z: -2.20, w: 0.30, h: 0.22, y: -0.34, n: 2.8 },
    { z: -2.50, w: 0.20, h: 0.12, y: -0.30, n: 2.4 },
  ], 10), white, 0, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.26, 0.16, 0.04), dark, 0, -0.37, -0.95));
  g.add(part(new THREE.CylinderGeometry(0.13, 0.15, 0.30, 14), dark, 0, 0, -2.85, Math.PI / 2, 0, 0));
  const flame = new THREE.ConeGeometry(0.11, 0.9, 10);
  flame.rotateX(-Math.PI / 2);
  g.add(part(flame, glow, 0, 0, -3.35));

  // Four tail fins in an X, each a small swept panel out of the boat-tail.
  const fin = surface({ span: 0.58, root: 0.46, tip: 0.30, sweep: 0.16, thick: 0.04 });
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Mesh(fin, white);
    f.position.set(0, 0, -2.25);
    f.rotation.z = Math.PI / 4 + k * Math.PI / 2;
    f.castShadow = true;
    g.add(f);
  }
  g.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  return g;
}

/**
 * Aircraft on station: the Apache and the AC-130.
 *
 * Everything else the air wing flies is a pass: in, drop, out. These two
 * stay, for `station` seconds, and work whatever the player has designated.
 * Designate something else and they go to it: `retarget` is called by the
 * battle whenever the target changes.
 *
 * The Apache hovers at a stand-off on the player's side of the target, each
 * one in its own slot around it so two of them never share the same air,
 * and when the target moves it climbs over whatever stands between here and
 * the new slot, crosses, and comes back down to work: 70 mm rockets in
 * pairs, small and accurate, and the 30 mm on the defender nearest the mark.
 *
 * The AC-130 flies a banked left-hand orbit high over the target with its
 * guns on the inside of the turn, which is the only way a gunship can shoot,
 * and puts 105 mm shells down its port side straight at the mark. Its orbit
 * follows the target when it changes.
 *
 * Both are in the garrison's airspace the whole time and can be shot down.
 */
AirWing.prototype._callLoiter = function _callLoiter(def, target, ceiling, opts = {}) {
  const a = def.aircraft;
  const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
  const dl = Math.hypot(dx, dz) || 1;
  const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const model = makeAirframe(def);
  model.rotation.order = 'YXZ';
  model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  this.scene.add(model);
  const s = {
    def, model, dir, side, target: target.clone(),
    speed: a.speed, t: 0, released: true, climb: 0, roar: 0, life: 0,
    flak: opts.flak || 0, hits: 0, jink: 0, stones: 0, kills: 0,
    fall: 0, pullUpAt: Infinity,
  };
  if (a.orbit) {
    // Join the orbit on a tangent that runs away from the camera, so the
    // gunship arrives from behind the player and turns in over the target.
    const R = a.radius;
    const theta = Math.atan2(dir.x, -dir.z);
    const alt = Math.max(target.y + a.height, (ceiling || 0) + 150);
    const entry = new THREE.Vector3(target.x + R * Math.cos(theta), alt, target.z + R * Math.sin(theta));
    const tangent = new THREE.Vector3(Math.sin(theta), 0, -Math.cos(theta));
    model.position.copy(entry).addScaledVector(tangent, -a.runIn);
    model.rotation.y = Math.atan2(tangent.x, tangent.z);
    s.hp = AIRFRAME.ac130;
    s.alt = alt;
    s.loiter = {
      phase: 'inbound', orbit: true, centre: target.clone(), theta, entry, tangent,
      eta: a.runIn / a.speed, time: 0, shells: a.shells, nextShell: 1.0,
    };
  } else {
    s.slot = this.sorties.filter((o) => o.loiter && !o.loiter.orbit && !o.done
      && o.loiter.phase !== 'egress' && o.loiter.phase !== 'down').length;
    const station = this._stationFor(s, target);
    const start = station.clone().addScaledVector(dir, -a.runIn);
    const along = this.ceilingAlong || (() => -Infinity);
    const ground = (x, z) => (this.terrain ? this.terrain.heightAt(x, z) : 0);
    const cruise = Math.max(station.y, along(start.x, start.z, station.x, station.z) + 30, ground(start.x, start.z) + 60);
    start.y = cruise;
    model.position.copy(start);
    model.rotation.y = Math.atan2(dir.x, dir.z);
    s.hp = AIRFRAME.gunship;
    s.alt = cruise;
    s.loiter = {
      phase: 'inbound', station, cruise, eta: a.runIn / a.speed + 6, time: 0,
      vel: new THREE.Vector3(dir.x * a.speed, 0, dir.z * a.speed),
      rockets: a.rockets, nextRocket: 0.8, nextGun: 1.6, pod: 0,
    };
  }
  s.releaseAt = s.loiter.eta;
  this.sorties.push(s);
  return s;
};

/**
 * Where an Apache hovers to work `target`: out on the camera's side at the
 * stand-off, turned round the target by its slot so a second and a third
 * take the air beside the first rather than the same air, and high enough
 * to be clear of whatever the town has built under it.
 */
AirWing.prototype._stationFor = function _stationFor(s, target) {
  const a = s.def.aircraft;
  const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
  const dl = Math.hypot(dx, dz) || 1;
  const turn = [0, 0.55, -0.55, 1.1, -1.1, 1.6][s.slot % 6] + (a.offset || 0) / a.standoff;
  const c = Math.cos(turn), sn = Math.sin(turn);
  const ux = dx / dl, uz = dz / dl;
  const rx = ux * c - uz * sn, rz = ux * sn + uz * c;
  const station = target.clone();
  station.x -= rx * a.standoff;
  station.z -= rz * a.standoff;
  const along = this.ceilingAlong || (() => -Infinity);
  const ground = this.terrain ? this.terrain.heightAt(station.x, station.z) : 0;
  station.y = Math.max(target.y + a.height, ground + 40,
    along(station.x, station.z, station.x, station.z) + a.clearance);
  return station;
};

/** The target has changed: everything on station goes to it. */
AirWing.prototype.retarget = function retarget(point) {
  if (!point) return;
  for (const s of this.sorties) {
    const L = s.loiter;
    if (!L || s.done || L.phase === 'egress' || L.phase === 'down') continue;
    s.target = point.clone();
    if (L.orbit) continue;                       // the orbit drifts after it
    L.station = this._stationFor(s, point);
    if (L.phase === 'station' || L.phase === 'transit') {
      L.phase = 'transit';
      L.vel = L.vel || new THREE.Vector3();
      L.route = 0;
    }
  }
};

AirWing.prototype._updateLoiter = function _updateLoiter(s, dt) {
  if (s.loiter.orbit) { this._updateOrbit(s, dt); return; }
  const L = s.loiter, m = s.model, a = s.def.aircraft;
  const ground = (x, z) => (this.terrain ? this.terrain.heightAt(x, z) : 0);
  const along = this.ceilingAlong || (() => -Infinity);
  const face = (x, z, rate) => {
    const want = Math.atan2(x - m.position.x, z - m.position.z);
    let d = want - m.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    m.rotation.y += d * Math.min(1, dt * rate);
  };
  // Flying to a point: slow to arrive, nose down to go, and never lower
  // than what stands along the rest of the way.
  const flyTo = (st, top) => {
    const dx = st.x - m.position.x, dz = st.z - m.position.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.min(a.speed, Math.max(6, dist / 2.2));
    const ux = dist > 0.01 ? dx / dist : 0, uz = dist > 0.01 ? dz / dist : 0;
    L.vel.x += (ux * want - L.vel.x) * Math.min(1, dt * 1.4);
    L.vel.z += (uz * want - L.vel.z) * Math.min(1, dt * 1.4);
    // Climb first: it does not move sideways into something taller than it.
    const low = m.position.y < top - 4;
    const k = low ? 0.25 : 1;
    m.position.x += L.vel.x * dt * k;
    m.position.z += L.vel.z * dt * k;
    const fin = THREE.MathUtils.clamp((dist - 40) / 300, 0, 1);
    const alt = Math.max(st.y + (top - st.y) * fin, dist > 60 ? top : st.y);
    m.position.y += THREE.MathUtils.clamp(alt - m.position.y, -12 * dt, 16 * dt);
    const sp = Math.hypot(L.vel.x, L.vel.z);
    const pitch = THREE.MathUtils.clamp(sp / a.speed * 0.22, -0.12, 0.22);
    m.rotation.x += (pitch - m.rotation.x) * Math.min(1, dt * 2);
    face(dist > 60 ? st.x : s.target.x, dist > 60 ? st.z : s.target.z, 1.6);
    return dist;
  };

  if (L.phase === 'inbound' || L.phase === 'transit') {
    // The ceiling along what is left of the route, looked at twice a second.
    L.look = (L.look || 0) - dt;
    if (L.look <= 0) {
      L.look = 0.5;
      const st = L.station;
      L.top = Math.max(st.y, along(m.position.x, m.position.z, st.x, st.z) + a.clearance,
        ground(m.position.x, m.position.z) + 30);
    }
    if (L.phase === 'transit') L.time += dt;     // the clock runs on station, moving or not
    const dist = flyTo(L.station, L.top ?? L.station.y);
    if (dist < 25) {
      const first = L.phase === 'inbound';
      L.phase = 'station';
      if (first) {
        L.time = 0;
        if (this.onAirEvent) this.onAirEvent('onstation', { def: s.def, time: a.station });
      }
    }
  } else if (L.phase === 'station') {
    L.time += dt;
    const st = L.station;
    m.position.x += (st.x + Math.sin(L.time * 0.7) * 1.4 - m.position.x) * Math.min(1, dt * 1.5);
    m.position.z += (st.z + Math.cos(L.time * 0.53) * 1.1 - m.position.z) * Math.min(1, dt * 1.5);
    m.position.y += (st.y + Math.sin(L.time * 1.1) * 0.6 - m.position.y) * Math.min(1, dt * 1.5);
    m.rotation.x += (-0.03 - m.rotation.x) * Math.min(1, dt * 2);
    m.rotation.z = Math.sin(L.time * 0.9) * 0.03;
    face(s.target.x, s.target.z, 2.5);

    L.nextRocket -= dt;
    if (L.rockets > 0 && L.nextRocket <= 0) {
      L.nextRocket = a.every;
      for (let k = 0; k < a.pair && L.rockets > 0; k++, L.rockets--) this._loiterRocket(s, k);
      if (this.audio) this.audio.play('rocket', m.position, { rate: 1.35, gain: 0.5, rolloff: 900 });
    }
    L.nextGun -= dt;
    if (L.nextGun <= 0 && this.gunner) {
      L.nextGun = a.gun.every;
      const to = this.gunner.pick(s.target, a.gun.reach);
      if (to) {
        const from = this._v.set(0, -1.0, 6.2).applyEuler(m.rotation).add(m.position).clone();
        s.kills += this.gunner.fire(from, to.clone(), a.gun) || 0;
      }
    }
  }
  if ((L.phase === 'station' || L.phase === 'transit')
    && (L.time > a.station || (L.rockets <= 0 && L.time > a.station * 0.8))) {
    L.phase = 'egress';
    L.out = 0;
    L.reported = true;
    if (this.onAirEvent) this.onAirEvent('offstation', { def: s.def, stones: s.stones, kills: s.kills });
  } else if (L.phase === 'egress') {
    L.out += dt;
    const back = this._v.copy(s.dir).multiplyScalar(-1).addScaledVector(s.side, 0.4).normalize();
    face(m.position.x + back.x * 100, m.position.z + back.z * 100, 1.2);
    const fwd = Math.min(a.speed, 8 + L.out * 9);
    m.position.x += Math.sin(m.rotation.y) * fwd * dt;
    m.position.z += Math.cos(m.rotation.y) * fwd * dt;
    m.position.y += Math.min(12, 2 + L.out * 2) * dt;
    m.rotation.x += (0.18 - m.rotation.x) * Math.min(1, dt * 1.5);
    if (L.out > 22) s.done = true;
  } else if (L.phase === 'down') {
    this._fallLoiter(s, dt, 2 + L.fall * 2.5);
  }
};

/** The gunship's orbit, and its guns. */
AirWing.prototype._updateOrbit = function _updateOrbit(s, dt) {
  const L = s.loiter, m = s.model, a = s.def.aircraft;
  const R = a.radius;
  const bank = -0.32;                            // left wing down, into the turn
  if (L.phase === 'inbound') {
    m.position.addScaledVector(L.tangent, a.speed * dt);
    const along = this._v.copy(L.entry).sub(m.position).dot(L.tangent);
    // Roll into the turn over the last few seconds of the run.
    m.rotation.z = bank * THREE.MathUtils.clamp(1 - along / (a.speed * 4), 0, 1);
    if (along <= 0) {
      L.phase = 'station';
      L.time = 0;
      if (this.onAirEvent) this.onAirEvent('onstation', { def: s.def, time: a.station });
    }
    return;
  }
  if (L.phase === 'station') {
    L.time += dt;
    // The centre of the orbit drifts after the target rather than jumping,
    // so a new designation is a gentle shift of the whole circle.
    L.centre.x += (s.target.x - L.centre.x) * Math.min(1, dt * 0.25);
    L.centre.z += (s.target.z - L.centre.z) * Math.min(1, dt * 0.25);
    const wantY = Math.max(s.target.y + a.height, s.alt);
    m.position.y += (wantY - m.position.y) * Math.min(1, dt * 0.3);
    L.theta -= (a.speed / R) * dt;
    m.position.x = L.centre.x + R * Math.cos(L.theta);
    m.position.z = L.centre.z + R * Math.sin(L.theta);
    m.rotation.y = Math.atan2(Math.sin(L.theta), -Math.cos(L.theta));
    m.rotation.x = 0;
    m.rotation.z = bank;
    // The 105: out of the port side, a straight line down to the mark.
    L.nextShell -= dt;
    if (L.shells > 0 && L.nextShell <= 0) {
      L.nextShell = a.every;
      L.shells--;
      this._gunshipShell(s);
    }
    if (L.time > a.station || L.shells <= 0) {
      L.phase = 'egress';
      L.out = 0;
      L.reported = true;
      if (this.onAirEvent) this.onAirEvent('offstation', { def: s.def, stones: s.stones, kills: s.kills });
    }
  } else if (L.phase === 'egress') {
    L.out += dt;
    m.rotation.z += (0 - m.rotation.z) * Math.min(1, dt * 0.8);
    const h = m.rotation.y;
    m.position.x += Math.sin(h) * a.speed * dt;
    m.position.z += Math.cos(h) * a.speed * dt;
    m.position.y += 6 * dt;
    if (L.out > 25) s.done = true;
  } else if (L.phase === 'down') {
    this._fallLoiter(s, dt, 0.4, a.speed * 0.6);
  }
};

/** Shot down: it spins or it dives, and it burns all the way in. */
AirWing.prototype._fallLoiter = function _fallLoiter(s, dt, spin, forward = 0) {
  const L = s.loiter, m = s.model, a = s.def.aircraft;
  const ground = (x, z) => (this.terrain ? this.terrain.heightAt(x, z) : 0);
  L.fall += dt;
  m.rotation.y += spin * dt;
  m.rotation.z = Math.max(-0.9, Math.min(0.9, m.rotation.z - dt * 0.3));
  if (forward) m.rotation.x = Math.min(0.6, m.rotation.x + dt * 0.12);
  L.vy = (L.vy || 0) - 9.81 * dt * 0.8;
  m.position.y += L.vy * dt;
  const v = L.vel || { x: 0, z: 0 };
  m.position.x += (forward ? Math.sin(m.rotation.y) * forward : v.x * 0.2) * dt;
  m.position.z += (forward ? Math.cos(m.rotation.y) * forward : v.z * 0.2) * dt;
  if (this.fx) this.fx.trail(m.position, 4.0);
  const g = ground(m.position.x, m.position.z);
  if (m.position.y <= g + 1.5 || L.fall > 20) {
    const p = m.position.clone(); p.y = Math.max(p.y, g);
    if (this.fx) this.fx.strikeBlast(p, a.orbit ? 2.4 : 1.6, { groundY: g });
    if (this.audio) this.audio.play('explosion', p, { gain: 0.8, rolloff: 900 });
    const fired = a.orbit ? L.shells < a.shells : L.rockets < a.rockets;
    if (this.onAirEvent && !L.reported && fired) this.onAirEvent('offstation', { def: s.def, stones: s.stones, kills: s.kills });
    m.visible = false;
    s.done = true;
  }
};

/** One 70 mm rocket from the pod on alternating sides, on a fast line to the mark. */
AirWing.prototype._loiterRocket = function _loiterRocket(s) {
  const m = s.model, a = s.def.aircraft, L = s.loiter;
  const podX = (L.pod++ % 2 === 0 ? 1 : -1) * 2.45;
  const from = new THREE.Vector3(podX, -0.52, 2.2).applyEuler(m.rotation).add(m.position);
  this._shoot(s, from, a.spread, a.muzzle);
  if (this.fx && this.fx.muzzleFlash) this.fx.muzzleFlash(from, this._v.copy(s.target).sub(from).normalize(), 0.8);
};

/** One 105 mm round from the gunship's howitzer, down to the mark. */
AirWing.prototype._gunshipShell = function _gunshipShell(s) {
  const m = s.model, a = s.def.aircraft;
  const from = new THREE.Vector3(4.7, -0.45, -5.6).applyEuler(m.rotation).add(m.position);
  this._shoot(s, from, a.spread, a.muzzle);
  if (this.fx && this.fx.muzzleFlash) this.fx.muzzleFlash(from, this._v.copy(s.target).sub(from).normalize(), 1.6);
  if (this.audio) this.audio.play('gun', m.position, { rate: 0.8, gain: 0.7, rolloff: 1600 });
};

/** A round on a ballistic line that lands on the mark, give or take `spread`. */
AirWing.prototype._shoot = function _shoot(s, from, spread, muzzle) {
  const p = s.def.projectile;
  const r = spread * Math.sqrt(Math.random()), t = Math.random() * Math.PI * 2;
  const to = s.target.clone();
  to.x += Math.cos(t) * r; to.y += (Math.random() - 0.5) * spread; to.z += Math.sin(t) * r;
  const d = to.clone().sub(from);
  const T = d.length() / muzzle;
  const vel = d.multiplyScalar(1 / T);
  vel.y += 0.5 * p.gravity * T;
  this.projectiles.fire({
    pos: from, vel, gravity: p.gravity, kind: 'bomb', drag: 0, speed: muzzle,
    warhead: s.def.warhead, owner: null, target: to, trail: p.trail,
    strikeDef: s.def, sortie: s,
  });
};

/**
 * What is on station, for the HUD: one entry per aircraft still working,
 * with the share of its time it has left. Inbound counts as all of it.
 */
AirWing.prototype.loiterStatus = function loiterStatus(out = []) {
  out.length = 0;
  for (const s of this.sorties) {
    const L = s.loiter;
    if (!L || s.done || L.phase === 'egress' || L.phase === 'down') continue;
    const a = s.def.aircraft;
    const left = L.phase === 'inbound' ? 1 : Math.max(0, 1 - L.time / a.station);
    out.push({ sortie: s, id: s.def.id, left, inbound: L.phase === 'inbound' });
  }
  return out;
};
