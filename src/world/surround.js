import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACADE_PALETTE, ROOF_PALETTE } from './city.js';

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

export function buildSurround(terrain, quality, outer, opts = {}) {
  if (!outer || outer.length < 6) return null;
  const span = terrain.span;
  const inner = opts.inner ?? span;
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
  group.add(merge(walls, FACADE_PALETTE, rng, 0.93));
  group.add(merge(roofs, ROOF_PALETTE, rng, 0.82));
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
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
  }
  const mesh = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(geos, false),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0.01 }),
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
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
