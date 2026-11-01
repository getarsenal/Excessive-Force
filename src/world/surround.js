import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACADE_PALETTE, ROOF_PALETTE } from './city.js';
import { splitMesh } from './detail.js';

/**
 * The city past the edge of the map.
 *
 * A playfield is 1.7 km across and the place it is cut out of is not. London
 * does not stop at Lambeth Bridge, Paris does not stop at the Champ de Mars,
 * and stopping the buildings at the boundary leaves every level as a town that
 * ends in a clean line with farmland beyond it — which is the single thing that
 * most gives away how small the map is.
 *
 * So the survey is read out to two and a quarter spans and everything past the
 * edge is built here. Not as it is built inside: out there nothing is shot at,
 * nothing is stood on, nothing is deployed on and nothing is closer than eight
 * hundred metres, so a building is a box on the ground, and the baker ships it
 * as six numbers rather than as an outline. Fifteen thousand outlines is four
 * megabytes; fifteen thousand boxes is three hundred kilobytes.
 *
 * Two meshes come out, walls and roofs, which is two draw calls for a city of
 * nine thousand buildings.
 */

/** How much of the surround each tier draws, largest first. */
const BUDGET = { low: 2200, medium: 4500, high: 7000, ultra: 9000 };

/**
 * The surveyed buildings that stand just past the edge, as surround boxes
 * (x, z, w, d, yaw in degrees, height), nearest the edge first.
 *
 * The bake files a building whose outline comes within five per cent of the
 * span of the map in the map's own list, and the map builds only those whose
 * centre is on it: everything from the boundary to sixty metres out was in
 * neither set, and every level had a bare strip of ground round its edge (a
 * third of a thousand buildings at Agra) that drew the boundary as a line.
 */
export function edgeBoxes(buildings, inner) {
  const out = [];
  for (const b of buildings || []) {
    const pts = b.pts;
    if (!pts || pts.length < 3) continue;
    let cx = 0, cz = 0;
    for (const q of pts) { cx += q[0]; cz += q[1]; }
    cx /= pts.length; cz /= pts.length;
    const past = Math.max(Math.abs(cx), Math.abs(cz)) - inner;
    if (past <= 0) continue;
    // The tightest rectangle on one of the outline's own edges.
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const ex = c[0] - a[0], ez = c[1] - a[1], L = Math.hypot(ex, ez);
      if (L < 0.4) continue;
      const ux = ex / L, uz = ez / L;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const q of pts) {
        const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      const area = (u1 - u0) * (v1 - v0);
      if (!best || area < best.area) best = { area, ux, uz, u0, u1, v0, v1 };
    }
    if (!best) continue;
    const { ux, uz, u0, u1, v0, v1 } = best;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const w = u1 - u0, d = v1 - v0;
    if (Math.min(w, d) < 2.5) continue;
    out.push({ past, box: [cu * ux - cv * uz, cu * uz + cv * ux, w, d, Math.atan2(-uz, ux) * 180 / Math.PI, b.h || 9] });
  }
  out.sort((p, q) => p.past - q.past);
  return out.flatMap((e) => e.box);
}

export function buildSurround(terrain, quality, outer, opts = {}) {
  const span = terrain.span;
  const inner = opts.inner ?? span;
  // The strip just past the edge first: it is the nearest and most seen, and
  // the budget below keeps the largest of the rest.
  if (opts.edge?.length) outer = [...opts.edge, ...(outer || [])];
  if (!outer || outer.length < 6) return null;
  const budget = BUDGET[quality.name] ?? 4500;
  const rng = mulberry32(0x5a1d0b0b);

  const walls = [];
  const roofs = [];
  // Where the surround stands, on a coarse grid. The outskirts lay fields,
  // hedgerows and farmsteads over the same ground, and a hedge through the
  // middle of Southwark is worse than no hedge at all.
  const CELL = 70;
  const taken = new Set();
  let built = 0;

  for (let k = 0; k + 5 < outer.length && built < budget; k += 6) {
    const x = outer[k], z = outer[k + 1];
    const w = outer[k + 2], d = outer[k + 3];
    const yaw = outer[k + 4] * Math.PI / 180;
    const h = Math.max(3, outer[k + 5]);

    // Inside the playfield the real thing is built, with an outline, a
    // collider and a roof somebody can put a gun on. Nothing here may stand
    // in the same ground.
    if (Math.abs(x) < inner && Math.abs(z) < inner) continue;
    if (terrain.isWater(x, z)) continue;
    const g = terrain.surfaceAt(x, z);
    if (!isFinite(g) || g < terrain.waterLevel + 0.6) continue;

    // Bedded to the lowest corner, the way the buildings inside the map are:
    // out here the ground is extrapolated rather than sampled, and a box stood
    // on the height of its own centre hangs in the air on a slope.
    const ca = Math.abs(Math.cos(yaw)), sa = Math.abs(Math.sin(yaw));
    const ax = (w * ca + d * sa) / 2, az = (w * sa + d * ca) / 2;
    let lo = g;
    for (const fx of [-1, 1]) {
      for (const fz of [-1, 1]) {
        lo = Math.min(lo, terrain.surfaceAt(x + fx * ax, z + fz * az));
      }
    }
    const fall = Math.min(9, g - lo);
    const bodyH = h + fall + 0.4;

    const body = new THREE.BoxGeometry(w, bodyH, d);
    if (yaw) body.rotateY(yaw);
    body.translate(x, lo - 0.2 + bodyH / 2, z);
    walls.push(body);

    // A cap, slightly proud. At this range the only thing that separates one
    // roof from the next is the line of shadow where they change height, and
    // a lid in a different colour is what draws it.
    const cap = new THREE.BoxGeometry(w + 0.7, 1.0, d + 0.7);
    if (yaw) cap.rotateY(yaw);
    cap.translate(x, lo - 0.2 + bodyH + 0.5, z);
    roofs.push(cap);
    taken.add(`${Math.round(x / CELL)},${Math.round(z / CELL)}`);
    built++;
  }

  if (!walls.length) return null;

  const group = new THREE.Group();
  group.name = 'surround';
  // In cells (world/detail.js `splitMesh`), so the view culls the ring
  // behind the camera: the whole of it was drawn every frame. The ring is
  // four kilometres across and a few thousand boxes, so its cells are
  // wide: at the town's 250 m it was five hundred draws for fifty
  // thousand triangles.
  for (const m of splitMesh(merge(walls, FACADE_PALETTE, rng, 0.93), 700)) group.add(m);
  for (const m of splitMesh(merge(roofs, ROOF_PALETTE, rng, 0.82), 700)) group.add(m);
  group.userData.built = built;
  group.userData.available = Math.floor(outer.length / 6);
  /** Is there surveyed city on this ground? */
  group.userData.occupied = (x, z) => {
    const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
    for (let ax = -1; ax <= 1; ax++) {
      for (let az = -1; az <= 1; az++) {
        if (taken.has(`${cx + ax},${cz + az}`)) return true;
      }
    }
    return false;
  };
  return group;
}

/**
 * One mesh, tinted per building.
 *
 * Flat-shaded and unlit by anything but the sun: these are never close enough
 * for a texture to resolve, and giving them one costs a second material and
 * every window in the distance drawn at the wrong scale.
 */
function merge(geos, palette, rng, roughness) {
  const c = new THREE.Color();
  for (const g of geos) {
    const n = g.attributes.position.count;
    c.setHex(palette[Math.floor(rng() * palette.length)]);
    c.multiplyScalar(0.80 + rng() * 0.34);
    // Darker at the foot, lighter at the crown (see world/look.js).
    const pa = g.attributes.position.array;
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < pa.length; i += 3) { if (pa[i] < lo) lo = pa[i]; if (pa[i] > hi) hi = pa[i]; }
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = hi > lo + 0.5 ? 0.82 + 0.18 * ((pa[i * 3 + 1] - lo) / (hi - lo)) : 1;
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
  }
  const mesh = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(geos, false),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0.01 }),
  );
  // Shadows like the town's, cast and taken: the town past the edge stood in
  // full sun beside streets in the shadow of their own buildings, and that
  // difference alone drew the boundary. The shadow map covers 680 m round
  // the focus, so only the boxes near the edge are ever in it.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'surround';
  return mesh;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
