/**
 * Hand fixes to a level's street plan.
 *
 * The passes in realstreets.js get the survey right nearly everywhere, and
 * where they do not the owner can say so here, in metres on the level's own
 * ground (the game prints the ground under a tap as `x, z` on the status line
 * with `&xz=1` on the URL; `tools/streetaudit.mjs` prints the faults it can
 * find). Applied after the automatic passes and before the plan is drawn.
 *
 *   drop:   [x, z]      the road passing nearest this point (within 9 m) is not built
 *   narrow: [x, z]      the road passing nearest this point is one class narrower
 *   weld:   [x, z, r]   every junction within r metres of the point becomes one, at their centre
 *
 * Keyed by level id. An entry is a list under each key; any key may be missing.
 */
export const STREET_FIXES = {
  // redfort: { drop: [[-536, -139]], weld: [[-576, -143, 24]] },
};

const NARROWER = { avenue: 'street', street: 'mews', mews: 'mews' };

function nearestEdge(edges, x, z, within) {
  let best = null, bd = within;
  for (const e of edges) {
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const p = e.pts[i], q = e.pts[i + 1];
      const dx = q.x - p.x, dz = q.z - p.z, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / L2));
      const d = Math.hypot(x - p.x - dx * t, z - p.z - dz * t);
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}

/** Apply the level's fixes in place. Returns what it did, for the console line. */
export function applyStreetFixes(levelId, nodes, edges, terrain) {
  const F = levelId && STREET_FIXES[levelId];
  const did = { drop: 0, narrow: 0, weld: 0 };
  if (!F) return did;
  for (const [x, z] of F.drop || []) {
    const e = nearestEdge(edges, x, z, 9);
    if (!e) continue;
    edges.splice(edges.indexOf(e), 1);
    did.drop++;
  }
  for (const [x, z] of F.narrow || []) {
    const e = nearestEdge(edges, x, z, 9);
    if (!e) continue;
    e.cls = NARROWER[e.cls] || e.cls;
    did.narrow++;
  }
  for (const [x, z, r] of F.weld || []) {
    const idx = [];
    nodes.forEach((n, i) => { if (n.links.length && Math.hypot(n.x - x, n.z - z) <= r) idx.push(i); });
    if (idx.length < 2) continue;
    let cx = 0, cz = 0;
    for (const i of idx) { cx += nodes[i].x; cz += nodes[i].z; }
    cx /= idx.length; cz /= idx.length;
    const keep = idx[0];
    const set = new Set(idx);
    nodes[keep].x = cx; nodes[keep].z = cz; nodes[keep].y = terrain.heightAt(cx, cz);
    for (const e of edges) {
      if (set.has(e.a)) { e.a = keep; e.pts[0] = { x: cx, z: cz, y: nodes[keep].y }; }
      if (set.has(e.b)) { e.b = keep; e.pts[e.pts.length - 1] = { x: cx, z: cz, y: nodes[keep].y }; }
    }
    did.weld++;
  }
  // Loops and twins the welds made, and every node's links, afresh.
  for (let k = edges.length - 1; k >= 0; k--) if (edges[k].a === edges[k].b) edges.splice(k, 1);
  for (const n of nodes) n.links = [];
  for (const e of edges) {
    nodes[e.a].links.push({ other: e.b, edge: e, at: 0 });
    nodes[e.b].links.push({ other: e.a, edge: e, at: 1 });
  }
  return did;
}
