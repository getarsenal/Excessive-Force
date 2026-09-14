import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The real city, extruded from OpenStreetMap footprints.
 *
 * `tools/bake_buildings.py` writes one JSON per level containing every building
 * polygon around the site, in metres from the level origin, with heights from
 * the `height` / `building:levels` tags where they exist. This turns those
 * polygons into geometry.
 *
 * The reason this is footprints rather than Google's Photorealistic 3D Tiles:
 * those tiles are one fused photogrammetry mesh with no separable buildings and
 * no interiors — beautiful, and impossible to take apart. A footprint is a
 * polygon, and a polygon can be laid up out of stone by the same masonry
 * builder the tower uses. Keeping the city as geometry we generate is what
 * leaves the door open to making it destructible on the same terms.
 *
 * If no baked file is present the game falls back to the hand-placed layout in
 * `context.js`, which approximates Westminster rather than reproducing it.
 */

export async function loadCity(levelId) {
  try {
    const res = await fetch(`assets/city/${levelId}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.buildings) || data.buildings.length === 0) return null;
    return data;
  } catch {
    return null; // not baked yet; the caller falls back
  }
}

/**
 * Facade and roof colours.
 *
 * Westminster is not beige. It is Portland stone next to London stock brick
 * next to red Victorian terracotta next to post-war concrete, under slate and
 * oxidised copper. The old palette was nine samples of the same warm grey,
 * which made a thousand buildings read as one undifferentiated mass — you
 * could not tell where one ended and the next began, which is most of why the
 * city looked flat.
 */
/*
 * Weighted, and quieter than it was.
 *
 * The first version of this list gave every colour on it the same chance, and
 * a third of them were brick. A third of a thousand buildings in saturated
 * terracotta, under a warm sun, through a grade that adds saturation again, is
 * not Westminster — it is a bowl of satsumas, and from the air the whole city
 * read as a toy. Brick and copper are *accents*: the mass of a British city is
 * stone, render and concrete, and what separates one building from the next is
 * mostly value, not hue.
 *
 * So the quiet tones are repeated and the loud ones are not, every entry is
 * pulled toward neutral from where it started, and the range runs from near
 * white to a dark brick — which is where the reading of one building against
 * another actually comes from.
 */
export const FACADE_PALETTE = [
  0xdcd3bf, 0xe6ddc9, 0xcdc3ae, 0xdcd3bf, 0xe6ddc9,   // Portland stone ×5
  0xb3b0a6, 0xa3a199, 0xb3b0a6, 0x9b9a93,             // concrete ×4
  0xc8bd9d, 0xbdb192, 0xc8bd9d,                       // render ×3
  0xa87a5e, 0x9c6d53,                                 // London stock ×2
  0x8e6150,                                           // darker brick ×1
];
// Muted at source: the grade adds saturation globally, so a palette that
// already reads correctly on its own comes out as poster paint on screen.
export const ROOF_PALETTE = [
  0x5e6773, 0x525a66, 0x6b7381, 0x59616d, 0x646c78,   // slate ×5
  0x4a4f57, 0x53585f,                                 // lead and bitumen ×2
  0x7a6154, 0x856a5b,                                 // clay tile ×2
  0x4f6b63,                                           // oxidised copper ×1
];
const PALETTE = FACADE_PALETTE;
const ROOF = ROOF_PALETTE;

/** Buildings kept, by quality tier. The baker sorts largest-first. */
const BUDGET = { low: 320, medium: 700, high: 1200, ultra: 2000 };

/**
 * @param {object} city    parsed output of bake_buildings.py
 * @param {object} terrain Terrain instance, for ground height and water
 * @param {object} quality tier
 * @param {object} opts    { excludeRadius } metres around the origin to leave clear
 */
export function buildCity(city, terrain, quality, opts = {}) {
  const group = new THREE.Group();
  group.name = 'city';

  const exclude = opts.excludeRadius ?? 70;
  const span = terrain.span;
  const budget = BUDGET[quality.name] ?? 700;
  const rng = mulberry32(0x5eed1234);

  const walls = [];
  const roofs = [];
  let used = 0;

  for (const b of city.buildings) {
    if (used >= budget) break;

    const pts = b.pts;
    if (!pts || pts.length < 3) continue;

    // Centroid, for siting and for the exclusion test.
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cz += p[1]; }
    cx /= pts.length; cz /= pts.length;

    if (Math.hypot(cx, cz) < exclude) continue;          // the landmark's own plot
    if (Math.abs(cx) > span * 0.98 || Math.abs(cz) > span * 0.98) continue;
    if (terrain.isWater(cx, cz)) continue;

    // Build the outline as a 2D shape. The extrusion runs along +Z and is then
    // stood upright, so a world point (x, z) becomes shape point (x, -z).
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0] - cx, -(pts[0][1] - cz));
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i][0] - cx, -(pts[i][1] - cz));
    }
    shape.closePath();

    const height = Math.max(3, b.h || 12);
    let geo;
    try {
      geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
    } catch {
      continue; // self-intersecting trace that the triangulator refuses
    }
    geo.rotateX(-Math.PI / 2);

    const ground = terrain.heightAt(cx, cz);
    geo.translate(cx, ground, cz);

    tint(geo, PALETTE, rng);
    walls.push(geo);

    // A thin parapet slab reading as the roof line, inset slightly so it sits
    // like a cornice rather than a lid.
    try {
      const cap = new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: false, curveSegments: 1 });
      cap.rotateX(-Math.PI / 2);
      cap.translate(cx, ground + height, cz);
      tint(cap, ROOF, rng);
      roofs.push(cap);
    } catch { /* cap is optional */ }

    used++;
  }

  if (walls.length === 0) return null;

  const shadows = quality.shadowMapSize > 0;
  const facade = makeFacadeTexture(64);
  const lit = makeWindowEmissive(64);
  for (const t of [facade, lit]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // ExtrudeGeometry's default UV generator works in world units, so one
    // texture tile per 3.5 m gives a consistent window bay at any footprint size.
    t.repeat.set(1 / 3.5, 1 / 3.5);
    t.anisotropy = quality.anisotropy;
  }

  const wallMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.93, metalness: 0.01,
    map: facade,
    emissive: new THREE.Color(0xffd9a0),
    emissiveMap: lit,
    emissiveIntensity: 0.16,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0.02,
  });

  const wallMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(walls, false), wallMat);
  wallMesh.castShadow = shadows;
  wallMesh.receiveShadow = shadows;
  group.add(wallMesh);

  if (roofs.length) {
    const roofMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(roofs, false), roofMat);
    roofMesh.castShadow = shadows;
    roofMesh.receiveShadow = shadows;
    group.add(roofMesh);
  }

  group.userData.built = used;
  group.userData.available = city.buildings.length;
  return group;
}

function tint(geo, palette, rng) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(palette[Math.floor(rng() * palette.length)]);
  c.multiplyScalar(0.86 + rng() * 0.28);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** One window bay: a recessed opening in a stone field. */
function makeFacadeTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2ece1';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < size; y += 8) ctx.fillRect(0, y, size, 1);

  const m = size * 0.26;
  const ww = size - m * 2;
  const wh = size * 0.46;
  const wy = size * 0.26;
  ctx.fillStyle = '#cdc4b4'; ctx.fillRect(m - 2, wy - 2, ww + 4, wh + 4);
  ctx.fillStyle = '#4d525c'; ctx.fillRect(m, wy, ww, wh);
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(m, wy, ww, wh * 0.36);
  ctx.fillStyle = '#b8ae9d';
  ctx.fillRect(m + ww / 2 - 1, wy, 2, wh);
  ctx.fillRect(m, wy + wh * 0.45, ww, 2);
  ctx.fillStyle = '#e4dccd'; ctx.fillRect(m - 3, wy + wh, ww + 6, 3);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeWindowEmissive(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const m = size * 0.26;
  ctx.fillStyle = '#6a5230';
  ctx.fillRect(m, size * 0.26, size - m * 2, size * 0.46);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
