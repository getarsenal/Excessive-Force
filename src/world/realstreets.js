import * as THREE from 'three';
import { buildEdgeIndex, dissolveThroughNodes, halfWidth, GRID_YAW, SURFACE_LIFT }
  from './streets.js';

/**
 * The real street plan.
 *
 * `buildStreetNetwork` invents a city: an irregular grid, turned a few degrees,
 * cut at the water. It is a good city and it is nobody's city. This reads the
 * one that is actually there — every junction and every carriageway between
 * them, baked from Overture Maps by `tools/bake_overture.py` — and hands back
 * the same object, so everything downstream draws the real plan without knowing
 * anything changed: surfaces, kerbs, junction pads, markings, lamps, block
 * ground, street furniture, and the field works that lay the defence out along
 * the roads.
 *
 * That interchangeability is the whole point. The plan of a place is most of
 * what makes it recognisable — the twelve avenues off the Etoile, the wedge of
 * Circular Quay, the ring roads round the Kremlin — and none of it survives
 * being approximated. Handing the real graph to the existing generator gets all
 * of it for the price of a loader.
 *
 * Two things are done to the baked graph on the way in, and both exist in the
 * procedural builder for the same reasons:
 *
 *  - streets that run into the water are cut at the bank, because the DEM and
 *    the road data disagree about where the shoreline is by a few metres and a
 *    carriageway laid over the river is the one error nobody forgives;
 *  - nodes where two streets simply carry on through are dissolved, because a
 *    junction pad is built from the crossing of its arms' kerb lines and two
 *    parallel kerbs have no crossing — which draws a road pinching to a wedge
 *    and opening out again.
 */

/**
 * @param {object} data  the `roads` block of a baked city file
 * @param {object} terrain
 * @param {object} opts  { exclude } radius round the origin kept clear
 * @returns {object|null} a network, or null if the file carries no usable one
 */
export function realNetwork(data, terrain, opts = {}) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
  if (data.edges.length < 8) return null;

  const exclude = opts.exclude || 0;
  // The landmark's own ground. A surveyed street runs where the surveyed
  // building is, and this level's building is twice life size and standing on
  // top of it: Bridge Street is real and so is a carriageway through the
  // Palace of Westminster's east front.
  const reserved = opts.reserved || [];
  const inReserved = (x, z) => reserved.some(
    (r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2);
  // `y` is not decoration: the junction pads are laid at it and the ribbons
  // ease up to it at each end, so a node without one draws every pad and every
  // street end at NaN — which is a road mesh that renders as nothing at all.
  const nodes = data.nodes.map((p) => ({
    x: p[0], z: p[1], y: terrain.heightAt(p[0], p[1]), links: [],
  }));
  const edges = [];

  /**
   * Dry enough for a road.
   *
   * A bridge is exempt — it is meant to be over the water, and the deck is
   * built for it — but only where the bank it starts from is real ground.
   */
  const dry = (x, z) => !terrain.isWater(x, z)
    && terrain.heightAt(x, z) > terrain.waterLevel + 0.35;

  /** Ground this level's game has taken for itself. */
  const clear = (x, z) => !(exclude > 0 && Math.hypot(x, z) < exclude)
    && !(reserved.length && inReserved(x, z));

  /**
   * Cut a street where it is not allowed to go. Do not delete it.
   *
   * This was three `continue`s: any carriageway with one point in the water,
   * one point inside the landmark's precinct, or one point within the exclusion
   * radius was thrown away whole. On a surveyed plan that is catastrophic and
   * it is invisible in the count, because what is lost is never the whole road
   * — it is the two hundred metres of Bridge Street that happen to pass the
   * Palace, and the approach ramp that happens to start on a mask pixel the DEM
   * calls river. Westminster came out with five hundred and sixty-one of nine
   * hundred and forty-eight junctions joined to nothing at all, and a bridge
   * whose western end was a dead stop standing in the Thames.
   *
   * A road that runs into somewhere it may not go stops there, which is what
   * the comment at the top of this file always claimed happened. The longest
   * usable stretch is kept and given its own end node, carried half a sample
   * past the last good point so the tarmac reaches the bank rather than
   * stopping short of it.
   */
  const keepRun = (pts, ok) => {
    let best = null, i = 0;
    while (i < pts.length) {
      if (!ok[i]) { i++; continue; }
      let j = i;
      while (j + 1 < pts.length && ok[j + 1]) j++;
      if (!best || j - i > best[1] - best[0]) best = [i, j];
      i = j + 1;
    }
    return best;
  };

  for (const e of data.edges) {
    if (!Array.isArray(e.pts) || e.pts.length < 2) continue;
    const pts = e.pts.map((p) => ({ x: p[0], z: p[1], y: terrain.heightAt(p[0], p[1]) }));
    const ok = pts.map((p) => clear(p.x, p.z) && (e.bridge || dry(p.x, p.z)));
    const run = keepRun(pts, ok);
    if (!run) continue;
    let [i0, i1] = run;
    if (i1 - i0 < 1) continue;
    let line = pts.slice(i0, i1 + 1);
    // Reach out toward the ground that was refused, so the street ends at the
    // water or the precinct wall rather than a sample short of it.
    const reach = (from, toward) => {
      const a = pts[from], b = pts[toward];
      const x = a.x + (b.x - a.x) * 0.5, z = a.z + (b.z - a.z) * 0.5;
      return { x, z, y: terrain.heightAt(x, z) };
    };
    if (i0 > 0) line = [reach(i0, i0 - 1), ...line];
    if (i1 < pts.length - 1) line = [...line, reach(i1, i1 + 1)];
    let len = 0;
    for (let k = 0; k < line.length - 1; k++) {
      len += Math.hypot(line[k + 1].x - line[k].x, line[k + 1].z - line[k].z);
    }
    // Only a *cut* stretch has to justify its length. A surveyed plan is full
    // of six-metre carriageways between two junctions a car's length apart, and
    // throwing those away takes an arm off the junction at each end — which
    // turns a crossroads into a bend, and the dissolve pass then straightens
    // the bend out of existence. Three hundred and seventy-three edges and a
    // hundred junctions went that way.
    const whole = i0 === 0 && i1 === pts.length - 1;
    if (!whole && len < 11) continue;
    // Whole stretches keep the surveyed junctions at each end; cut ones get a
    // new node of their own, which is a dead end, which is what it is.
    const cut = (idx, at) => {
      const p = line[at];
      nodes.push({ x: p.x, z: p.z, y: p.y, links: [] });
      return nodes.length - 1;
    };
    const ai = i0 === 0 ? e.a : cut(e.a, 0);
    const bi = i1 === pts.length - 1 ? e.b : cut(e.b, line.length - 1);
    const a = nodes[ai], b = nodes[bi];
    if (!a || !b || ai === bi) continue;
    const edge = { a: ai, b: bi, cls: e.cls || 'street', pts: line };
    // Both flags, and they mean different things downstream: `bridge` is what
    // makes the road surface follow the deck's own height and lay tarmac over
    // water at all, and `bank` is what stops the dissolve pass straightening a
    // crossing into the street it meets.
    if (e.bridge) { edge.bridge = true; edge.bank = true; }
    edges.push(edge);
    a.links.push({ other: bi, edge, at: 0 });
    b.links.push({ other: ai, edge, at: 1 });
  }

  if (edges.length < 8) return null;

  // Blocks first: a block is found by asking whether its corners are linked,
  // and dissolving replaces two of those links with one the corners cannot see.
  // The baker already cut them from the same graph, so they only need reshaping.
  const blocks = [];
  for (const b of (data.blocks || [])) {
    if (!Array.isArray(b.poly) || b.poly.length !== 4) continue;
    if (exclude > 0 && Math.hypot(b.x, b.z) < exclude) continue;
    blocks.push({
      poly: b.poly.map((p) => ({ x: p[0], z: p[1] })),
      sides: b.sides && b.sides.length === 4 ? b.sides
        : ['street', 'street', 'street', 'street'],
      x: b.x, z: b.z,
      cells: Math.max(1, Math.round((b.area || 4000) / 9000)),
    });
  }

  // One junction where the survey has a cluster of them, one road where it
  // has two carriageways. Before the bridges, because a bridge that lands on
  // a cluster should land on the junction the cluster becomes.
  // Twin carriageways whose junctions do not line up: put every junction of
  // one onto the other, and the two become the same road. Welding again after
  // each pass, because a snapped junction has moved.
  let welded = 0, snapped = 0;
  for (let pass = 0; pass < 3; pass++) {
    welded += weldJunctions(nodes, edges);
    dedupeEdges(nodes, edges, terrain);
    const n = snapNodesToRoads(nodes, edges, terrain);
    snapped += n;
    dedupeEdges(nodes, edges, terrain);
    if (!n && pass > 0) break;
  }
  landBridges(edges, nodes, terrain);
  // Whole roads before loose ends. A surveyed road arrives in pieces of a few
  // dozen metres, and a dead-end rule applied to pieces eats a long road one
  // bite at a time from its open end; applied to the road it has become, it
  // takes the stub and leaves the street. And loose ends before the ramps, so
  // a stub about to go does not get an abutment built under it on the way.
  dissolveThroughNodes(nodes, edges, { surveyed: true, limit: -1 });
  dedupeEdges(nodes, edges, terrain);
  const ends = resolveDeadEnds(nodes, edges, terrain, { exclude, inReserved });
  const bridges = [];
  layDecks(edges, nodes, terrain, bridges);
  // Every bend that is not a junction is a bend in one road, whatever its
  // angle: a corner is drawn by rounding the road, not by paving a junction
  // with two arms.
  dissolveThroughNodes(nodes, edges, { surveyed: true, limit: -1 });
  dedupeEdges(nodes, edges, terrain);
  const more = resolveDeadEnds(nodes, edges, terrain, { exclude, inReserved });
  ends.joined += more.joined; ends.pruned += more.pruned;
  dissolveThroughNodes(nodes, edges, { surveyed: true, limit: -1 });
  dedupeEdges(nodes, edges, terrain);
  smoothRoads(edges, terrain);

  const net = {
    nodes, edges, blocks, bridges,
    pitch: 104, reach: terrain.span * 0.94,
    real: true,
    debug: { source: 'overture', streets: edges.length, blocks: blocks.length,
      welded, snapped, ...ends, bridges: bridges.length },
  };
  buildEdgeIndex(net);
  return net;
}

const RANK = { avenue: 3, street: 2, mews: 1 };

/**
 * One junction where the survey has several.
 *
 * A survey draws a dual carriageway as two roads, one per direction, eight to
 * eighteen metres apart, and draws the place where two of them cross as four
 * junctions: each carriageway of one against each carriageway of the other,
 * plus whatever slip lanes and pedestrian islands sit between. Parliament
 * Square arrived as nine junctions inside a forty-metre patch, all of them
 * avenues, each with its own twenty-three-metre paved pad — and nine pads in
 * a forty-metre patch is one black blob. That blob is what the roads looked
 * like from above, at every major crossing in the city.
 *
 * The rule is the one a draughtsman would use: two junctions closer together
 * than the road is wide are one junction. Nodes are welded when they are
 * within the widest road at either of them, and a weld is refused once the
 * cluster it would make grows wider than two of those, so a line of
 * connectors down a long street cannot chain into one node swallowing the
 * street. The welded node stands at the cluster's centre, every road that
 * met any member now meets it, and the roads that only ran between members
 * — the ten-metre links across the central reservation — are gone.
 */
function weldJunctions(nodes, edges) {
  const live = [];
  for (let i = 0; i < nodes.length; i++) if (nodes[i].links.length) live.push(i);
  // Each junction's half-width: the widest road at it. Two junctions weld when
  // they are closer than the sum of their half-widths, less a fifth — which is
  // to say when their paving overlaps. Two avenues: eighteen metres.
  const reach = new Map();
  for (const i of live) {
    let r = 0;
    for (const l of nodes[i].links) r = Math.max(r, halfWidth(l.edge.cls));
    reach.set(i, r);
  }
  const weldAt = (i, j) => (reach.get(i) + reach.get(j)) * 0.8;
  const parent = new Map(live.map((i) => [i, i]));
  const box = new Map(live.map((i) => [i, {
    x0: nodes[i].x, x1: nodes[i].x, z0: nodes[i].z, z1: nodes[i].z, r: reach.get(i) * 1.6 }]));
  const find = (k) => {
    while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); }
    return k;
  };
  const CELL = 24;
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const i of live) {
    const k = key(nodes[i].x, nodes[i].z);
    let cell = grid.get(k);
    if (!cell) grid.set(k, cell = []);
    cell.push(i);
  }
  let welds = 0;
  for (const i of live) {
    const n = nodes[i];
    const gx = Math.floor(n.x / CELL), gz = Math.floor(n.z / CELL);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const cell = grid.get(`${gx + a},${gz + b}`);
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          const m = nodes[j];
          const d = Math.hypot(m.x - n.x, m.z - n.z);
          if (d >= weldAt(i, j)) continue;
          const ri = find(i), rj = find(j);
          if (ri === rj) continue;
          const A = box.get(ri), B = box.get(rj);
          const x0 = Math.min(A.x0, B.x0), x1 = Math.max(A.x1, B.x1);
          const z0 = Math.min(A.z0, B.z0), z1 = Math.max(A.z1, B.z1);
          const r = Math.max(A.r, B.r);
          if (Math.max(x1 - x0, z1 - z0) > r * 2.2) continue;   // would swallow a street
          const root = Math.min(ri, rj), other = Math.max(ri, rj);
          parent.set(other, root);
          box.set(root, { x0, x1, z0, z1, r });
          welds++;
        }
      }
    }
  }
  if (!welds) return 0;

  // Where each cluster stands, and how big it is.
  const members = new Map();
  for (const i of live) {
    const r = find(i);
    let list = members.get(r);
    if (!list) members.set(r, list = []);
    list.push(i);
  }
  const radius = new Map();
  for (const [r, list] of members) {
    if (list.length < 2) continue;
    let x = 0, z = 0, y = 0;
    for (const i of list) { x += nodes[i].x; z += nodes[i].z; y += nodes[i].y; }
    x /= list.length; z /= list.length; y /= list.length;
    let far = 0;
    for (const i of list) far = Math.max(far, Math.hypot(nodes[i].x - x, nodes[i].z - z));
    const rep = nodes[r];
    rep.x = x; rep.z = z; rep.y = y;
    radius.set(r, far + 1.5);
  }

  // Re-point every road at the welded node and cut its first few metres back
  // to it, so the carriageway leaves the junction's centre rather than jogging
  // out to where its own connector used to be.
  const kept = [];
  for (const e of edges) {
    const a = find(e.a), b = find(e.b);
    if (a === b) continue;                    // ran between two members
    e.a = a; e.b = b;
    const trim = (pts, node, rad) => {
      let k = 0;
      while (k < pts.length - 1 && Math.hypot(pts[k].x - node.x, pts[k].z - node.z) < rad) k++;
      return [{ x: node.x, z: node.z, y: node.y }, ...pts.slice(k)];
    };
    let pts = e.pts;
    if (radius.has(a)) pts = trim(pts, nodes[a], radius.get(a));
    if (radius.has(b)) pts = trim(pts.slice().reverse(), nodes[b], radius.get(b)).reverse();
    if (pts.length < 2) pts = [{ x: nodes[a].x, z: nodes[a].z, y: nodes[a].y },
      { x: nodes[b].x, z: nodes[b].z, y: nodes[b].y }];
    e.pts = pts;
    kept.push(e);
  }
  edges.length = 0;
  for (const e of kept) edges.push(e);
  relink(nodes, edges);
  return welds;
}

/**
 * Put every junction that stands on a road onto that road.
 *
 * `weldJunctions` merges junctions that are on top of each other, and that
 * takes care of a dual carriageway wherever both of its halves have a junction
 * at the same place. Mostly they do not: a side street joins one carriageway
 * and not the other, so one half has a node there and the other runs past it
 * ten metres away, and the two halves never share a node to be merged at.
 * From above that is two roads with a strip of pavement down the middle — the
 * "medians" — on every main road in the city.
 *
 * The rule is the one the welding used, applied to a road instead of a node:
 * a junction closer to a carriageway than the two of them are wide is *on*
 * that carriageway. The road is split there and the split welded to the
 * junction, so after a pass both halves of a dual carriageway have a node at
 * every place either of them had one — and between consecutive nodes they are
 * two roads joining the same two junctions, which `dedupeEdges` makes one.
 */
function snapNodesToRoads(nodes, edges, terrain) {
  const CELL = 40;
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const e of edges) {
    if (e.bank || e.approach) continue;
    const cells = new Set();
    for (const p of e.pts) cells.add(key(p.x, p.z));
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i], b = e.pts[i + 1];
      cells.add(key((a.x + b.x) / 2, (a.z + b.z) / 2));
    }
    for (const k of cells) {
      let list = grid.get(k);
      if (!list) grid.set(k, list = []);
      list.push(e);
    }
  }
  const splits = new Map();          // edge -> [{ t, i, x, z, node }]
  let snaps = 0;
  for (let ni = 0; ni < nodes.length; ni++) {
    const n = nodes[ni];
    if (!n.links.length) continue;
    if (n.links.some((l) => l.edge.bank || l.edge.approach)) continue;
    let wn = 0;
    for (const l of n.links) wn = Math.max(wn, halfWidth(l.edge.cls));
    const gx = Math.floor(n.x / CELL), gz = Math.floor(n.z / CELL);
    let best = null;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const list = grid.get(`${gx + a},${gz + b}`);
        if (!list) continue;
        for (const e of list) {
          if (e.a === ni || e.b === ni) continue;
          const reach = (wn + halfWidth(e.cls)) * 0.8;
          for (let i = 0; i < e.pts.length - 1; i++) {
            const p = e.pts[i], q = e.pts[i + 1];
            const dx = q.x - p.x, dz = q.z - p.z;
            const l2 = dx * dx + dz * dz;
            if (l2 < 1) continue;
            let t = ((n.x - p.x) * dx + (n.z - p.z) * dz) / l2;
            if (t < 0 || t > 1) continue;
            const x = p.x + dx * t, z = p.z + dz * t;
            const d = Math.hypot(n.x - x, n.z - z);
            if (d >= reach) continue;
            // Not at the road's own ends: that is the welding's business.
            if (Math.hypot(x - e.pts[0].x, z - e.pts[0].z) < reach * 0.6) continue;
            const last = e.pts[e.pts.length - 1];
            if (Math.hypot(x - last.x, z - last.z) < reach * 0.6) continue;
            if (!best || d < best.d) best = { e, i, t, x, z, d };
          }
        }
      }
    }
    if (!best) continue;
    // The junction moves half way to the road; the road will be split to it.
    n.x = (n.x + best.x) / 2; n.z = (n.z + best.z) / 2;
    n.y = terrain.heightAt(n.x, n.z);
    let list = splits.get(best.e);
    if (!list) splits.set(best.e, list = []);
    list.push({ i: best.i, t: best.t, node: ni });
    snaps++;
  }
  if (!snaps) return 0;

  // Cut each road at its splits, in order along it.
  const out = [];
  for (const e of edges) {
    const list = splits.get(e);
    if (!list) { out.push(e); continue; }
    list.sort((p, q) => (p.i - q.i) || (p.t - q.t));
    let from = e.a;
    let pts = [e.pts[0]];
    let li = 0;
    for (let i = 0; i < e.pts.length - 1; i++) {
      while (li < list.length && list[li].i === i) {
        const sp = list[li++];
        const node = nodes[sp.node];
        pts.push({ x: node.x, z: node.z, y: node.y });
        if (from !== sp.node && pts.length >= 2) {
          out.push({ ...e, a: from, b: sp.node, pts });
        }
        from = sp.node;
        pts = [{ x: node.x, z: node.z, y: node.y }];
      }
      pts.push(e.pts[i + 1]);
    }
    if (from !== e.b && pts.length >= 2) out.push({ ...e, a: from, b: e.b, pts });
  }
  edges.length = 0;
  for (const e of out) edges.push(e);
  relink(nodes, edges);
  return snaps;
}

/**
 * No road dies for no reason.
 *
 * A dead end on a surveyed plan is nearly always ours: a street cut where it
 * ran into the water, or into the landmark's precinct, or a twin carriageway's
 * slip lane left over from the welding. A real cul-de-sac is rare and, from
 * the air, indistinguishable from a mistake — so it is treated as one. Each
 * loose end looks ahead along its own bearing for a road to join; if one is
 * there within seventy metres over ground it may cross, the road is carried on
 * to it and joined. If not, the stub is taken out, and whatever that leaves
 * loose is looked at again. A road that reaches the edge of the map is not a
 * dead end — it leaves.
 */
function resolveDeadEnds(nodes, edges, terrain, opts) {
  const span = terrain.span;
  const EDGE = span - 60;
  const clear = (x, z) => !terrain.isWater(x, z)
    && !(opts.exclude > 0 && Math.hypot(x, z) < opts.exclude)
    && !opts.inReserved(x, z);
  let joined = 0, pruned = 0;
  for (let pass = 0; pass < 6; pass++) {
    let did = 0;
    for (let ni = 0; ni < nodes.length; ni++) {
      const n = nodes[ni];
      if (n.links.length !== 1) continue;
      if (Math.abs(n.x) > EDGE || Math.abs(n.z) > EDGE) continue;    // leaves the map
      const l = n.links[0];
      const e = l.edge;
      if (e.bank || e.approach) continue;
      // The heading the road was on when it stopped.
      const pts = l.at === 0 ? e.pts : e.pts.slice().reverse();
      let k = 1;
      while (k < pts.length - 1 && Math.hypot(pts[k].x - n.x, pts[k].z - n.z) < 6) k++;
      const back = pts[Math.min(k, pts.length - 1)];
      let dx = n.x - back.x, dz = n.z - back.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      // Ahead of it: the nearest road crossing a cone of forty degrees either
      // side of the heading, within seventy metres.
      let hit = null;
      for (const f of edges) {
        if (f === e || f.bank || f.approach) continue;
        for (let i = 0; i < f.pts.length - 1; i++) {
          const p = f.pts[i], q = f.pts[i + 1];
          const c = raySegment(n.x, n.z, dx, dz, p, q);
          if (!c || c.t > 70) continue;
          if (!hit || c.t < hit.t) hit = { f, i, u: c.u, t: c.t, x: c.x, z: c.z };
        }
      }
      if (hit) {
        let ok = true;
        for (let t = 4; t < hit.t; t += 4) {
          if (!clear(n.x + dx * t, n.z + dz * t)) { ok = false; break; }
        }
        if (ok) {
          // Join: split the road there and run the stub on to the split.
          const f = hit.f;
          const j = { x: hit.x, z: hit.z, y: terrain.heightAt(hit.x, hit.z) };
          nodes.push({ x: j.x, z: j.z, y: j.y, links: [] });
          const ji = nodes.length - 1;
          const first = { ...f, a: f.a, b: ji, pts: [...f.pts.slice(0, hit.i + 1), { ...j }] };
          const second = { ...f, a: ji, b: f.b, pts: [{ ...j }, ...f.pts.slice(hit.i + 1)] };
          const idx = edges.indexOf(f);
          edges.splice(idx, 1, first, second);
          if (l.at === 0) { e.pts.unshift({ ...j }); e.a = ji; }
          else { e.pts.push({ ...j }); e.b = ji; }
          relink(nodes, edges);
          joined++; did++;
          continue;
        }
      }
      // Nothing to join: the stub goes, if it is short enough to be a mistake.
      let len = 0;
      for (let i = 0; i < e.pts.length - 1; i++) {
        len += Math.hypot(e.pts[i + 1].x - e.pts[i].x, e.pts[i + 1].z - e.pts[i].z);
      }
      if (len > 140) continue;
      edges.splice(edges.indexOf(e), 1);
      relink(nodes, edges);
      pruned++; did++;
    }
    if (!did) break;
  }
  return { joined, pruned };
}

/** Where a ray from (x, z) along (dx, dz) crosses the segment p–q, if it does. */
function raySegment(x, z, dx, dz, p, q) {
  const ex = q.x - p.x, ez = q.z - p.z;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p.x - x) * ez - (p.z - z) * ex) / den;
  const u = ((p.x - x) * dz - (p.z - z) * dx) / den;
  if (t < 0 || u < 0 || u > 1) return null;
  return { t, u, x: x + dx * t, z: z + dz * t };
}

/**
 * Round every bend.
 *
 * A surveyed polyline is a trace of the kerb, and the dissolve has just joined
 * those traces through every corner in the city, so a road is now a chain of
 * straight pieces with a kink at each vertex. Two rounds of corner-cutting —
 * each vertex replaced by two, a quarter and three quarters of the way along
 * the segments either side — turn the kinks into curves, and the ends are held
 * fixed so a road still arrives at its junction where the junction is. Only
 * where there is a bend: a vertex on a straight run is left alone, so a
 * straight road is still two points and the mesh does not double for nothing.
 */
function smoothRoads(edges, terrain) {
  for (const e of edges) {
    if (e.bank || e.approach || e.bridge) continue;
    let pts = e.pts;
    if (pts.length < 3) continue;
    for (let round = 0; round < 2; round++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const d1 = Math.hypot(b.x - a.x, b.z - a.z), d2 = Math.hypot(c.x - b.x, c.z - b.z);
        if (d1 < 0.5 || d2 < 0.5) { out.push(b); continue; }
        const dot = ((b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)) / (d1 * d2);
        if (dot > 0.995) { out.push(b); continue; }       // under six degrees: straight
        // Cut the corner, but never more than eight metres back along either
        // leg: a rounding is a kerb radius, not a new alignment.
        const k1 = Math.min(0.25, 8 / d1), k2 = Math.min(0.25, 8 / d2);
        out.push({ x: b.x - (b.x - a.x) * k1, z: b.z - (b.z - a.z) * k1 });
        out.push({ x: b.x + (c.x - b.x) * k2, z: b.z + (c.z - b.z) * k2 });
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    for (const p of pts) if (p.y === undefined) p.y = terrain.heightAt(p.x, p.z);
    e.pts = pts;
  }
}

/**
 * One road where the survey has two between the same pair of junctions.
 *
 * Once the junctions at each end of a dual carriageway have been welded, its
 * two carriageways run between the same two nodes, and a street plan with two
 * roads between the same two junctions is a street plan drawn twice. The
 * wider of the two survives, laid along the average of the two lines — the
 * middle of the central reservation, which is where the single road belongs.
 */
function dedupeEdges(nodes, edges, terrain) {
  const seen = new Map();
  const drop = new Set();
  for (const e of edges) {
    if (e.a === e.b) { drop.add(e); continue; }
    const k = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    const o = seen.get(k);
    if (!o) { seen.set(k, e); continue; }
    const keep = (RANK[e.cls] || 0) > (RANK[o.cls] || 0) ? e : o;
    const lose = keep === e ? o : e;
    // Two ordinary streets average to the middle; anything carrying a height
    // of its own — a bridge, a ramp — keeps its line.
    if (!keep.bridge && !lose.bridge && !keep.approach && !lose.approach) {
      keep.pts = averageLines(keep, lose, terrain);
    }
    if (lose.bridge) { keep.bridge = true; keep.bank = true; }
    drop.add(lose);
    seen.set(k, keep);
  }
  if (!drop.size) return 0;
  const kept = edges.filter((e) => !drop.has(e));
  edges.length = 0;
  for (const e of kept) edges.push(e);
  relink(nodes, edges);
  return drop.size;
}

/** The line midway between two roads joining the same two nodes. */
function averageLines(p, q, terrain) {
  const qp = q.a === p.a ? q.pts : q.pts.slice().reverse();
  const n = Math.max(p.pts.length, qp.length, 2);
  const resample = (pts) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    }
    const L = cum[cum.length - 1] || 1;
    const out = [];
    for (let k = 0; k < n; k++) {
      const s = (k / (n - 1)) * L;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t });
    }
    return out;
  };
  const A = resample(p.pts), B = resample(qp);
  return A.map((a, i) => {
    const x = (a.x + B[i].x) / 2, z = (a.z + B[i].z) / 2;
    return { x, z, y: terrain.heightAt(x, z) };
  });
}

/** Rebuild every node's links from the edge list. */
function relink(nodes, edges) {
  for (const n of nodes) n.links = [];
  for (const e of edges) {
    nodes[e.a].links.push({ other: e.b, edge: e, at: 0 });
    nodes[e.b].links.push({ other: e.a, edge: e, at: 1 });
  }
}

/**
 * Bring every bridge ashore.
 *
 * A survey cuts a segment wherever another segment meets it, so the last piece
 * of a crossing ends at whatever connector the surveyor put nearest the bank —
 * and the DEM, which has never heard of the surveyor, quite often calls that
 * point river. Westminster Bridge arrived as two hundred and sixty metres of
 * carriageway whose western end was a node of degree one standing in the
 * Thames: tarmac over open water, stopping dead, joined to nothing. From the
 * air it is the single most obviously wrong thing on the map.
 *
 * So a dangling wet end walks on along its own bearing until it finds ground,
 * and then looks for a street to be part of. Both halves matter. Reaching the
 * bank stops the deck ending over the river; welding to the junction that is
 * already there is what makes the bridge a road you can drive off, rather than
 * a second road lying beside the first.
 */
function landBridges(edges, nodes, terrain) {
  const dry = (x, z) => !terrain.isWater(x, z)
    && terrain.heightAt(x, z) > terrain.waterLevel + 0.35;

  for (const e of edges) {
    if (!e.bridge) continue;
    for (const end of [0, 1]) {
      const key = end === 0 ? 'a' : 'b';
      const node = nodes[e[key]];
      if (!node || node.links.length !== 1) continue;      // already joined
      const pts = e.pts;
      const tip = end === 0 ? pts[0] : pts[pts.length - 1];
      if (dry(tip.x, tip.z)) continue;                     // already ashore
      // Measured over fifteen metres, not over whatever gap the surveyor left
      // between the last two vertices. A polyline from a survey carries pairs
      // of points a few centimetres apart, and a bearing taken across one of
      // those is noise — the same mistake that turned four hundred and
      // forty-seven of this city's junctions into false right angles.
      let dx = 0, dz = 0;
      for (let k = 1; k < pts.length; k++) {
        const q = end === 0 ? pts[k] : pts[pts.length - 1 - k];
        dx = tip.x - q.x; dz = tip.z - q.z;
        if (dx * dx + dz * dz > 225) break;
      }
      const d = Math.hypot(dx, dz);
      if (d < 0.5) continue;
      const ux = dx / d, uz = dz / d;
      // Walk on until the ground comes up. Two hundred metres is further than
      // any approach on any of these maps and short enough that a bridge
      // pointing out to sea gives up rather than crossing the whole harbour.
      let landed = null;
      for (let t = 5; t <= 200; t += 5) {
        const x = tip.x + ux * t, z = tip.z + uz * t;
        if (Math.abs(x) > terrain.span || Math.abs(z) > terrain.span) break;
        if (!dry(x, z)) continue;
        // Ten metres clear of the waterline, so the abutment sits on the bank
        // rather than in the shallows.
        landed = { x: x + ux * 10, z: z + uz * 10 };
        break;
      }
      if (!landed) continue;
      landed.y = terrain.heightAt(landed.x, landed.z);
      if (end === 0) pts.unshift(landed); else pts.push(landed);
      node.x = landed.x; node.z = landed.z; node.y = landed.y;

      // And join whatever is standing there. A junction within thirty-five
      // metres of the abutment is the road the bridge carries on into.
      let best = null, bd = 35 * 35;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n === node || !n.links.length) continue;
        if (Math.abs(n.y - landed.y) > 7) continue;
        const q = (n.x - landed.x) ** 2 + (n.z - landed.z) ** 2;
        if (q < bd) { bd = q; best = i; }
      }
      if (best === null) continue;
      const host = nodes[best];
      if (end === 0) pts[0] = { x: host.x, z: host.z, y: host.y };
      else pts[pts.length - 1] = { x: host.x, z: host.z, y: host.y };
      node.links.length = 0;
      e[key] = best;
      host.links.push({ other: end === 0 ? e.b : e.a, edge: e, at: end });
      const far = nodes[end === 0 ? e.b : e.a];
      const link = far && far.links.find((l) => l.edge === e);
      if (link) link.other = best;
    }
  }
}

/**
 * Put every bridge on a deck — a real one.
 *
 * The survey says where a bridge is and says nothing about how high it is, and
 * the ground under it is the river bed — so a deck laid on the terrain is a
 * raft of tarmac floating in the water.
 *
 * It has to be done a whole bridge at a time. Overture cuts a segment at every
 * junction, so the Sydney Harbour Bridge arrives as a dozen pieces of a couple
 * of hundred metres each, and a piece is no more able to say how long the
 * crossing is than one sleeper is. The pieces are welded back together first —
 * anything flagged as a bridge, joined through the nodes it shares with another
 * bridge — and the run decides its own height.
 *
 * Then it is made into the thing the invented city always had. That city's
 * bridge — arches on slender piers, a balustrade with lamps along it, ramps
 * easing the road up at each end — was switched off the moment a map had a
 * surveyed plan, and a flat slab with a parapet was drawn in its place: from
 * the river, a plank. Here the surveyed run is straightened onto its own chord
 * (a survey traces the kerb line and the welded landing can put a twenty-metre
 * kink in the last piece, which is what "the bridge comes down at a weird
 * angle" was), lifted clear of the water, and handed to that same builder as a
 * line it already knows how to build. The roads that meet it at each bank
 * carry the ramps, so there is no seam where the bridge becomes the street.
 *
 * A run that cannot be straightened — a crossing that genuinely curves — keeps
 * its polyline and its flat deck; nothing is built on a straight line the road
 * does not follow.
 */
function layDecks(edges, nodes, terrain, bridges) {
  const spans = edges.filter((e) => e.bank);
  if (!spans.length) return;

  // Weld the pieces: union-find over the nodes a bridge edge touches.
  const parent = new Map();
  const find = (k) => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(k) !== r) { const n = parent.get(k); parent.set(k, r); k = n; }
    return r;
  };
  for (const e of spans) {
    for (const k of [e.a, e.b]) if (!parent.has(k)) parent.set(k, k);
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const runs = new Map();
  for (const e of spans) {
    const key = find(e.a);
    let run = runs.get(key);
    if (!run) runs.set(key, run = { edges: [] });
    run.edges.push(e);
  }

  for (const run of runs.values()) {
    // A run is not a bridge: it is every piece of elevated road that touches
    // another, and a survey flags the Cahill Expressway as a bridge the same
    // as the Harbour Bridge it feeds. Welded, the two were one star of decks
    // meeting at the map's edge, so the expressway along Circular Quay was
    // lifted to the Harbour Bridge's forty-eight metres and neither could be
    // straightened into a line. So the run is cut at its junctions into
    // chains, and each chain is its own bridge: its own height from its own
    // water and banks, its own straight line, its own arches.
    const degree = new Map();
    const at = new Map();
    for (const e of run.edges) {
      for (const k of [e.a, e.b]) {
        degree.set(k, (degree.get(k) || 0) + 1);
        let list = at.get(k);
        if (!list) at.set(k, list = []);
        list.push(e);
      }
    }
    const isStop = (k) => degree.get(k) !== 2;
    const seen = new Set();
    const chains = [];
    const walk = (start, e) => {
      // Follow from `start` along `e` through two-edge nodes to the next stop.
      const chain = { edges: [], nodes: [start], pts: [] };
      let node = start, edge = e;
      for (;;) {
        seen.add(edge);
        const fwd = edge.a === node;
        chain.edges.push({ e: edge, fwd });
        const pts = fwd ? edge.pts : edge.pts.slice().reverse();
        for (let i = chain.pts.length ? 1 : 0; i < pts.length; i++) chain.pts.push(pts[i]);
        node = fwd ? edge.b : edge.a;
        chain.nodes.push(node);
        if (isStop(node) || node === start) break;
        const next = at.get(node).find((q) => q !== edge);
        if (!next || seen.has(next)) break;
        edge = next;
      }
      chains.push(chain);
    };
    for (const [k, d] of degree) {
      if (d === 2) continue;
      for (const e of at.get(k)) if (!seen.has(e)) walk(k, e);
    }
    // A loop with no stop on it at all.
    for (const e of run.edges) if (!seen.has(e)) walk(e.a, e);

    const DECK_T = 1.8;
    const nodeTop = new Map();
    for (const chain of chains) {
      let wet = 0, bank = -Infinity;
      for (const { e } of chain.edges) {
        for (let i = 0; i < e.pts.length - 1; i++) {
          const p = e.pts[i], q = e.pts[i + 1];
          const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
          if (terrain.isWater(mx, mz)) wet += Math.hypot(q.x - p.x, q.z - p.z);
          else bank = Math.max(bank, p.y, q.y);
        }
      }
      if (!isFinite(bank)) bank = terrain.waterLevel;
      // Level with the road that joins it, and clear of the water under it.
      //
      // Three metres over the higher bank: enough for the arches to read from
      // the river and for the deck to be a bridge rather than a causeway, and
      // little enough that the ramps on the approach roads are a gentle rise
      // rather than a hump. A span long enough to be a real crossing — past
      // six hundred metres of open water — is lifted on its length instead:
      // the Harbour Bridge carries its deck forty-nine metres up for half a
      // kilometre, and laid low it cuts the harbour in two. Six hundred, not
      // four: Waterloo Bridge is four hundred and sixty metres of Thames.
      let deckTop = Math.max(bank + 3.0, terrain.waterLevel + 7.5);
      if (wet > 600) deckTop = Math.max(deckTop, terrain.waterLevel + Math.min(50, wet * 0.09));
      chain.deckTop = deckTop;
      chain.wet = wet;
      for (const k of [chain.nodes[0], chain.nodes[chain.nodes.length - 1]]) {
        nodeTop.set(k, Math.max(nodeTop.get(k) || -Infinity, deckTop));
      }
    }

    for (const chain of chains) {
      const deckTop = chain.deckTop;
      const A = chain.pts[0], B = chain.pts[chain.pts.length - 1];
      const dx = B.x - A.x, dz = B.z - A.z;
      const len = Math.hypot(dx, dz);
      let dev = 0;
      for (const p of chain.pts) {
        dev = Math.max(dev, Math.abs((p.x - A.x) * -dz / (len || 1) + (p.z - A.z) * dx / (len || 1)));
      }
      // Straight enough to be one line. A survey traces the kerb and the
      // welded landing can put a twenty-metre kink in the last piece; onto
      // the chord it goes, junctions along it included. A crossing that
      // genuinely curves keeps its polyline and its flat deck.
      let line = null;
      if (len > 40 && dev < len * 0.12) {
        const ux = dx / len, uz = dz / len;
        const onto = (p) => {
          const t = ((p.x - A.x) * ux + (p.z - A.z) * uz);
          p.x = A.x + ux * t; p.z = A.z + uz * t;
        };
        for (const { e } of chain.edges) for (const p of e.pts) onto(p);
        for (let i = 1; i < chain.nodes.length - 1; i++) onto(nodes[chain.nodes[i]]);
        const from = new THREE.Vector3(A.x, 0, A.z), to = new THREE.Vector3(B.x, 0, B.z);
        line = {
          a: { x: A.x, z: A.z }, b: { x: B.x, z: B.z }, from, to, len,
          yaw: Math.atan2(dx, dz), out: { x: ux, z: uz },
          deckY: deckTop - DECK_T / 2, deckT: DECK_T, deckTop, wet: chain.wet,
          profile: [{ x: A.x, z: A.z, y: deckTop }, { x: B.x, z: B.z, y: deckTop }],
          ramps: [], run: 46,
        };
        for (const { e } of chain.edges) e.arched = true;
      }
      for (const { e } of chain.edges) for (const p of e.pts) p.y = deckTop;
      // The pads at the junctions are laid at the node's height plus the lift,
      // so the node sits one lift under the running surface.
      for (const k of chain.nodes) {
        const top = nodeTop.get(k) ?? deckTop;
        if (nodes[k]) nodes[k].y = top - SURFACE_LIFT;
      }

      // The ramps: every ordinary road leaving a landing rises to the deck
      // over its last forty-six metres, eased as t² so it leaves the ground
      // flat and arrives level. The road carries the height itself, the same
      // way the bridge does, so the structure built under it cannot disagree.
      for (const k of [chain.nodes[0], chain.nodes[chain.nodes.length - 1]]) {
        const landing = nodes[k];
        if (!landing) continue;
        for (const l of landing.links) {
          const e = l.edge;
          if (e.bank || e.approach) continue;
          const fwd = l.at === 0;
          const src = fwd ? e.pts : e.pts.slice().reverse();
          let total = 0;
          for (let i = 1; i < src.length; i++) {
            total += Math.hypot(src[i].x - src[i - 1].x, src[i].z - src[i - 1].z);
          }
          const top = nodeTop.get(k) ?? deckTop;
          const RUN = Math.min(46, total);
          const ground = (p) => terrain.heightAt(p.x, p.z) + SURFACE_LIFT;
          const ramp = [{ x: landing.x, z: landing.z, y: top }];
          let s = 0;
          for (let i = 1; i < src.length; i++) {
            const a = src[i - 1], b = src[i];
            const d = Math.hypot(b.x - a.x, b.z - a.z);
            if (s < RUN && s + d > RUN + 0.5) {
              const t = (RUN - s) / d;
              const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
              q.y = ground(q);
              ramp.push(q);
            }
            s += d;
            const q = { x: b.x, z: b.z };
            const g = ground(q);
            const t = Math.min(1, s / RUN);
            q.y = top + (g - top) * (t * t);
            ramp.push(q);
          }
          e.pts = fwd ? ramp : ramp.slice().reverse();
          e.approach = true;
          if (line) line.ramps.push({ pts: ramp, w: halfWidth(e.cls) * 2 });
        }
      }
      if (line) bridges.push(line);
    }
  }
}

/**
 * The angle the place is laid out at, measured rather than declared.
 *
 * Everything that is not a building — the defensive belt, the blast walls, the
 * revetments — squares itself to the city, and a real city's grid is at
 * whatever angle its surveyor chose. Taking the commonest bearing of the big
 * streets, folded into a quarter turn, gives that angle: on a plan with no
 * grid at all it comes out arbitrary, which is the correct answer.
 */
export function measureYaw(net) {
  if (!net || !net.edges.length) return GRID_YAW;
  const bins = new Float64Array(90);
  for (const e of net.edges) {
    const w = e.cls === 'avenue' ? 3 : e.cls === 'street' ? 2 : 1;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const dx = e.pts[i + 1].x - e.pts[i].x;
      const dz = e.pts[i + 1].z - e.pts[i].z;
      const len = Math.hypot(dx, dz);
      if (len < 6) continue;
      // Same convention as every yaw in the world builder: a bearing of y
      // points along (cos y, -sin y), which is what `rotateY` gives.
      let deg = Math.atan2(dx, -dz) * 180 / Math.PI;
      deg = ((deg % 90) + 90) % 90;
      bins[Math.floor(deg) % 90] += len * w;
    }
  }
  let best = 0, bv = -1;
  for (let i = 0; i < 90; i++) {
    // A wide-ish window: a street plan is never exactly square to itself.
    let v = 0;
    for (let k = -2; k <= 2; k++) v += bins[(i + k + 90) % 90] * (3 - Math.abs(k));
    if (v > bv) { bv = v; best = i; }
  }
  return (best + 0.5) * Math.PI / 180;
}
