/**
 * Ground cleared after the town is built.
 *
 * The SAM compounds and the command post are sited on the finished town,
 * because they need its plots and its streets to stay out of; the forest on
 * a mountain map is grown before them, and on the Corcovado a compound came
 * out with trees standing in its ring. The town's props are merged into a
 * few big meshes, so the trees cannot be taken out one by one: instead every
 * triangle whose middle lies inside a cleared circle is dropped from the
 * index. Only trees, hedges and benches are there to drop, since the sites
 * are kept off the plots and the roads to begin with.
 *
 * @param {THREE.Object3D} group  the context group
 * @param {Array<{x:number,z:number,r:number}>} circles
 * @returns {number} triangles dropped
 */
export function clearGround(group, circles) {
  if (!group || !circles.length) return 0;
  group.updateMatrixWorld(true);
  let dropped = 0;
  const inside = (x, z) => circles.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);
  group.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || !m.geometry?.attributes?.position) return;
    // A multi-material merge keeps index ranges per material: left alone.
    if (m.geometry.groups && m.geometry.groups.length > 1) return;
    const g = m.geometry, pos = g.attributes.position, e = m.matrixWorld.elements;
    const n = pos.count;
    // World x and z of every vertex, once.
    const wx = new Float32Array(n), wz = new Float32Array(n), inn = new Uint8Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      wx[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      wz[i] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (inside(wx[i], wz[i])) { inn[i] = 1; any = true; }
    }
    if (!any) return;
    const src = g.index ? g.index.array : null;
    const tris = src ? src.length : n;
    const keep = [];
    for (let t = 0; t < tris; t += 3) {
      const a = src ? src[t] : t, b = src ? src[t + 1] : t + 1, c = src ? src[t + 2] : t + 2;
      // A triangle with any corner in, and its middle in: a crown wider than
      // the gap between the ring and the trees is still taken whole.
      if ((inn[a] || inn[b] || inn[c])
          && inside((wx[a] + wx[b] + wx[c]) / 3, (wz[a] + wz[b] + wz[c]) / 3)) { dropped++; continue; }
      keep.push(a, b, c);
    }
    if (keep.length === tris) return;
    g.setIndex(keep);
    g.clearGroups();
  });
  return dropped;
}
