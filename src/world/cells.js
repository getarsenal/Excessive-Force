import * as THREE from 'three';

/**
 * The town is merged in cells of this many metres a side.
 *
 * One mesh a material was right for the draw calls and wrong for the GPU:
 * a mesh that is the whole map is always in view, so every building in
 * the town was transformed every frame whichever way the camera looked —
 * on Boudhanath, 12,000 of them for a frame that could see a third. Cut
 * into cells, each with its own bounding sphere, three's own frustum test
 * drops the cells behind the camera and off its sides. A building's pieces
 * all go in the building's cell, so `plotRanges` still names where it is
 * and cityfire can still fold it.
 */
export const CELL = 250;

/**
 * Cut one built geometry into cells by triangle, for the meshes that are
 * not merged from pieces: the street surface, the block ground, the
 * surround. Every attribute is carried over; the index is resolved. The
 * mesh's material, name, shadows and render order are kept on each cell;
 * the source geometry is disposed unless `keep`.
 *
 * @returns {THREE.Mesh[]}
 */
export function splitMesh(mesh, cell = CELL, keep = false) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length : pos.count;
  if (n < 3 * 2000) return [mesh];
  const cells = new Map();
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const key = `${Math.floor(cx / cell)},${Math.floor(cz / cell)}`;
    let list = cells.get(key);
    if (!list) cells.set(key, list = []);
    list.push(a, b, c);
  }
  if (cells.size < 2) return [mesh];
  const names = Object.keys(g.attributes);
  const out = [];
  for (const [, tri] of cells) {
    const geo = new THREE.BufferGeometry();
    for (const name of names) {
      const src = g.attributes[name];
      const k = src.itemSize;
      const arr = new src.array.constructor(tri.length * k);
      for (let i = 0; i < tri.length; i++) {
        const o = tri[i] * k, d = i * k;
        for (let j = 0; j < k; j++) arr[d + j] = src.array[o + j];
      }
      geo.setAttribute(name, new THREE.BufferAttribute(arr, k, src.normalized));
    }
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mesh.material);
    m.name = mesh.name;
    m.position.copy(mesh.position);
    m.quaternion.copy(mesh.quaternion);
    m.scale.copy(mesh.scale);
    m.castShadow = mesh.castShadow;
    m.receiveShadow = mesh.receiveShadow;
    m.renderOrder = mesh.renderOrder;
    m.frustumCulled = true;
    out.push(m);
  }
  if (!keep) g.dispose();
  return out;
}
