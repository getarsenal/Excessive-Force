import * as THREE from 'three';

/**
 * The airframe vocabulary: what every aircraft in the game is built from.
 *
 * `loft` skins a run of cross-sections down the length into one body, with
 * an optional unwrap for a painted skin; `surface` is a flying surface
 * from span, chords, sweep and thickness; `twoTone` colours it dark above
 * and light below by vertex; `pair` mirrors a part to both sides; `part`
 * places anything. Nose along +Z, port is +X, metres throughout.
 */
export function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
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
export function loft(stations, seg = 12, { uv = false } = {}) {
  const pos = [], idx = [], uvs = [];
  // A textured body needs the seam vertex twice — once at u = 0 and once at
  // u = 1 — or the last quad of each ring carries the whole picture back
  // across itself. An untextured one shares it.
  const per = uv ? seg + 1 : seg;
  const zs = stations.map((st) => st.z);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const ring = (st) => {
    for (let k = 0; k < per; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const p = 2 / (st.n ?? 2.6);
      pos.push(
        Math.sign(c) * Math.abs(c) ** p * st.w * 0.5,
        Math.sign(s) * Math.abs(s) ** p * st.h * 0.5 + (st.y ?? 0),
        st.z,
      );
      if (uv) uvs.push(k / seg, (st.z - z0) / Math.max(1e-6, z1 - z0));
    }
  };
  for (const st of stations) ring(st);
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * per + k, b = i * per + (uv ? k + 1 : (k + 1) % seg);
      idx.push(a, b, a + per, b, b + per, a + per);
    }
  }
  // Cap both ends so the body is closed from any angle, including the one
  // the player gets when it goes over the top of the camera.
  for (const end of [0, stations.length - 1]) {
    const base = pos.length / 3;
    const st = stations[end];
    pos.push(0, st.y ?? 0, st.z);
    if (uv) uvs.push(0.5, (st.z - z0) / Math.max(1e-6, z1 - z0));
    for (let k = 0; k < seg; k++) {
      const a = end * per + k, b = end * per + (uv ? k + 1 : (k + 1) % seg);
      if (end === 0) idx.push(base, b, a); else idx.push(base, a, b);
    }
  }
  // Outward, whichever way the stations run. Every body here was written
  // nose first, down -Z, and that order wound every triangle inward: the
  // near wall of each fuselage was culled, the inside of the far wall drawn
  // in its place and lit from the wrong side — which is why an aircraft in
  // full sun read as a black cut-out and a pylon inside an engine pod showed
  // through it. The signed volume of a closed body says which way it is
  // wound; a negative one is turned round.
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Two colours on one flying surface: the upper skin one grey, the lower
 * another, for a material with `vertexColors` on. `surface` lays its twelve
 * points out as six upper then six lower, which is what makes this a
 * one-liner rather than a normal test.
 */
export function twoTone(geo, upper, lower) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const u = new THREE.Color(upper), l = new THREE.Color(lower);
  for (let i = 0; i < n; i++) {
    const c = i < 6 ? u : l;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
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
export function surface(o) {
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
export function solid(pos, idx) {
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
export function mirrorX(geo) {
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
export function pair(group, geo, mat, x, y, z) {
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
export function engine(group, mat, glow, x, y, z, r, len, flame) {
  for (const s of x ? [-1, 1] : [0]) {
    group.add(part(new THREE.CylinderGeometry(r, r * 1.08, len, 12).rotateX(Math.PI / 2), mat, s * x, y, z));
    const f = new THREE.ConeGeometry(r * 0.72, flame, 8);
    f.rotateX(-Math.PI / 2);
    group.add(part(f, glow, s * x, y, z - len * 0.5 - flame * 0.45));
  }
}

/** F-15E Strike Eagle. 19.4 m long, 13.1 m span, nose along +Z. */
