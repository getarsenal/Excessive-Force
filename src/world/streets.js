import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { valueNoise } from './terrain.js';

/**
 * The street network: a city's actual skeleton.
 *
 * What was here before was not a network at all. It was two families of
 * perfectly straight lines drawn at a fixed pitch across the whole map, and a
 * separate grid of buildings laid out on the same pitch, in the hope that the
 * two would interleave. From the air it read exactly as what it was: infinite
 * parallel stripes, buildings standing in the carriageway where the phases
 * drifted apart, roads charging into the river and stopping dead, and a bridge
 * with no road leading to it.
 *
 * This builds the thing properly, in the order a city grows:
 *
 *   1. a graph of junctions and the streets between them, laid on a grid that
 *      is then pushed around by a smooth noise field, so streets bend and
 *      blocks come out in a hundred different shapes while the topology stays
 *      simple enough to reason about;
 *   2. every street checked along its whole length against the water, so the
 *      network *ends* at the river instead of driving into it, and the only
 *      way across is the bridge — which gets its own approach roads, joined to
 *      the nearest junctions on each bank;
 *   3. an embankment road following the bank itself, which is what a real
 *      riverside looks like from above;
 *   4. blocks derived from the graph rather than guessed, so the buildings can
 *      be placed *inside* them and can never land in the road.
 *
 * Everything downstream — surfaces, markings, furniture, building plots — is
 * generated from this graph, so there is only ever one city.
 */

/** Road classes, in metres. The hierarchy is most of what makes a plan legible. */
export const ROAD_CLASS = {
  avenue: { road: 13.0, pave: 4.4, kerb: 0.8, dashes: true, trees: true, lamp: 24 },
  street: { road: 8.8, pave: 3.2, kerb: 0.6, dashes: false, trees: false, lamp: 30 },
  mews: { road: 6.0, pave: 1.9, kerb: 0.45, dashes: false, trees: false, lamp: 46 },
};

/** Which class outranks which, for merging two pieces of the same road. */
const KIND_RANK = { avenue: 3, street: 2, mews: 1 };

export function halfWidth(cls) {
  const c = ROAD_CLASS[cls];
  return c.road / 2 + c.pave + c.kerb;
}

/**
 * The angle the whole plan is turned through.
 *
 * Exported because everything that stands in this city has to agree with it.
 * The hand-placed civic set did not — it was laid out on the map's own axes
 * while the streets ran thirteen degrees off them, so a government block sat at
 * thirteen degrees to the road in front of it and the quarter read as a pile of
 * boxes dropped from a height.
 */
export const GRID_YAW = 0.23;

/**
 * Lay out the graph.
 *
 * `opts`: { pitch, reach, exclude (radius kept clear for the landmark),
 *           bridge: { a, b, half } | null }
 */
export function buildStreetNetwork(terrain, rng, opts) {
  const pitch = opts.pitch;
  const reach = opts.reach;
  const exclude = opts.exclude || 0;
  const bridge = opts.bridge || null;

  const nodes = [];
  const edges = [];

  // Footprints the network must keep out of: the abbey, the government
  // blocks, the landmark's own precinct. A city grows around those, and a
  // street driven through the middle of one is the same mistake as a street
  // driven into the river.
  const reserved = opts.reserved || [];
  const inReserved = (x, z) => {
    for (const r of reserved) {
      if (Math.abs(x - r.x) < r.w / 2 + 11 && Math.abs(z - r.z) < r.d / 2 + 11) return true;
    }
    return false;
  };

  /** Is this point properly on dry land, with `margin` metres to spare? */
  const onLand = (x, z, margin = 0, ignoreReserved = false) => {
    if (terrain.isWater(x, z)) return false;
    if (!ignoreReserved && inReserved(x, z)) return false;
    if (terrain.heightAt(x, z) < terrain.waterLevel + 1.1) return false;
    for (let a = 0; a < 8 && margin > 0; a++) {
      const th = (a / 8) * Math.PI * 2;
      const px = x + Math.cos(th) * margin, pz = z + Math.sin(th) * margin;
      if (terrain.isWater(px, pz)) return false;
      if (terrain.heightAt(px, pz) < terrain.waterLevel + 0.4) return false;
    }
    return true;
  };

  // ── 1. Junctions on a straight, irregular grid.
  //
  // Streets are straight. An earlier version pushed every junction around with
  // a noise field, which bent the streets — and a whole map of gently wandering
  // roads reads as *noise*, not as a city: nothing lines up, nothing points at
  // anything, and the eye has nothing to measure against. Real cities are
  // straight lines with reasons for the exceptions.
  //
  // So the variety comes from the spacing rather than the shape. The column and
  // row lines are laid at irregular intervals — a short block here, a long one
  // there — and every junction sits exactly on the intersection of two of them,
  // so an entire street runs dead straight from one side of the map to the
  // other while no two blocks are the same size. The whole grid is then turned
  // a few degrees off the map axes, which is what stops it reading as graph
  // paper and lets the river cut across it at an angle.
  //
  // The curves that are left are the ones with a reason: the road along the
  // river follows the bank, and the bridge approaches point at the bridge.
  const gca = Math.cos(GRID_YAW), gsa = Math.sin(GRID_YAW);
  const span = reach * 1.45;                 // laid out past the corners
  const lineSet = () => {
    const out = [];
    for (let u = -span; u <= span; u += pitch * (0.68 + rng() * 0.7)) out.push(u);
    return out;
  };
  const colU = lineSet();
  const rowV = lineSet();
  const cols = colU.length, rows = rowV.length;
  const idx = new Int32Array(cols * rows).fill(-1);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = colU[i] * gca - rowV[j] * gsa;
      const z = colU[i] * gsa + rowV[j] * gca;
      if (Math.abs(x) > reach || Math.abs(z) > reach) continue;
      if (Math.hypot(x, z) < exclude) continue;
      if (!onLand(x, z, 7)) continue;
      // Avenues every third line, in both directions: the through routes.
      const avenue = (i % 3 === 0) || (j % 3 === 0);
      idx[j * cols + i] = nodes.length;
      nodes.push({ x, z, y: terrain.heightAt(x, z), avenue, links: [], i, j });
    }
  }

  /** Walk a straight line and report whether a road could be built along it. */
  const lineClear = (a, b, margin, ignoreReserved = false, ignoreExclusion = false) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.ceil(d / 7));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (!onLand(x, z, margin, ignoreReserved)) return false;
      if (!ignoreExclusion && Math.hypot(x, z) < exclude) return false;
    }
    return true;
  };

  /**
   * One street, as a straight run cut into a few pieces.
   *
   * The pieces are there to follow the ground, not to bend the road: every
   * point lies exactly on the line between the two junctions, so the street is
   * straight in plan and stepped in section.
   */
  const addEdge = (na, nb, cls, margin, minLen, ignoreReserved, ignoreExclusion) => {
    const a = nodes[na], b = nodes[nb];
    if (!lineClear(a, b, margin ?? halfWidth(cls) + 1.5, ignoreReserved, ignoreExclusion)) return null;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < (minLen ?? pitch * 0.35)) return null;
    const SEGS = Math.max(2, Math.min(6, Math.round(len / 26)));
    const pts = [];
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS;
      const x = a.x + dx * t, z = a.z + dz * t;
      if (!onLand(x, z, Math.min(5, margin ?? 5), ignoreReserved)) return null;
      pts.push({ x, z, y: terrain.heightAt(x, z) });
    }
    const e = { a: na, b: nb, cls, pts, len };
    edges.push(e);
    a.links.push({ edge: e, other: nb, at: 0 });
    b.links.push({ edge: e, other: na, at: 1 });
    return e;
  };

  // ── 2. Streets between neighbouring junctions.
  const pending = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const here = idx[j * cols + i];
      if (here < 0) continue;
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        const ni = i + di, nj = j + dj;
        if (ni >= cols || nj >= rows) continue;
        const there = idx[nj * cols + ni];
        if (there < 0) continue;
        const bothAvenue = nodes[here].avenue && nodes[there].avenue;
        // An avenue only runs *along* its own line, not across the grain.
        const alongAvenue = bothAvenue
          && ((di === 1 && j % 3 === 0) || (dj === 1 && i % 3 === 0));
        pending.push([here, there, alongAvenue ? 'avenue' : 'street']);
      }
    }
  }
  for (const [a, b, cls] of pending) addEdge(a, b, cls);

  // ── 3. Break the grid.
  //
  // A complete lattice still reads as a lattice however much the nodes wander.
  // Dropping a tenth of the minor streets leaves L-shaped blocks, dead ends
  // and the odd long block, which is what stops it looking machine-made — but
  // only where both junctions keep three ways out, so nothing is stranded.
  for (let k = edges.length - 1; k >= 0; k--) {
    const e = edges[k];
    if (e.cls !== 'street') continue;
    if (rng() > 0.07) continue;
    const a = nodes[e.a], b = nodes[e.b];
    if (a.links.length < 3 || b.links.length < 3) continue;
    a.links = a.links.filter((l) => l.edge !== e);
    b.links = b.links.filter((l) => l.edge !== e);
    edges.splice(k, 1);
  }
  // And a few of the survivors are narrow mews rather than full streets.
  for (const e of edges) {
    if (e.cls === 'street' && rng() < 0.14) e.cls = 'mews';
  }

  // ── 4. The embankment: a road that follows the water instead of ignoring it.
  const bank = traceBank(terrain, reach);
  const bankNodes = [];
  for (const p of bank) {
    if (Math.hypot(p.x, p.z) < exclude) { bankNodes.push(-1); continue; }
    if (!onLand(p.x, p.z, 8)) { bankNodes.push(-1); continue; }
    const n = nodes.length;
    nodes.push({ x: p.x, z: p.z, y: terrain.heightAt(p.x, p.z),
      avenue: true, links: [], bank: true });
    bankNodes.push(n);
  }
  for (let i = 0; i < bankNodes.length - 1; i++) {
    if (bankNodes[i] < 0 || bankNodes[i + 1] < 0) continue;
    // The one road that is allowed to wander: it follows the water, which is
    // a reason. Flagged so the straightness check knows the difference.
    const e = addEdge(bankNodes[i], bankNodes[i + 1], 'avenue');
    if (e) e.bank = true;
  }
  // Tie the embankment back into the grid, or it is a road to nowhere.
  for (let i = 0; i < bankNodes.length; i += 2) {
    const n = bankNodes[i];
    if (n < 0) continue;
    const near = nearestNode(nodes, nodes[n], 1.6 * pitch, (m) => !m.bank);
    if (near >= 0) addEdge(n, near, 'street');
  }

  // ── 5. The bridge, and the roads that actually reach it.
  //
  // The old map had a bridge standing in the river with no road within a
  // hundred metres of either end. Here each abutment gets a junction of its
  // own, placed past the ramp on ground that can carry a road, and joined into
  // the network in two directions — plus the approach itself, which runs from
  // that junction straight at the bridge. The margin on those two roads is
  // deliberately slack: an approach road *is* meant to come near the water.
  const approaches = [];
  const debug = { bridge: [] };
  if (bridge) {
    // One street, all the way across.
    //
    // The bridge used to be built entirely outside the network: its own deck,
    // its own ramps, its own surface, meeting the street plan at a node that
    // knew nothing about it. Two road generators means two answers about where
    // the road is, how wide it is and how high it is, and where they meet you
    // get a seam — which is what the join at the abutment was.
    //
    // So the crossing is an edge like any other. Its polyline is the running
    // surface the bridge builder will put its structure under, carrying a height
    // per point, and it runs from a junction inland on one bank to a junction
    // inland on the other. The ramps are part of it, so there is no node at the
    // foot of a ramp for the two to disagree at, and both ends are ordinary
    // junctions that the grid joins into in the ordinary way.
    const heads = [];
    for (const [end, sign] of [[bridge.a, -1], [bridge.b, 1]]) {
      let head = null;
      // The reserved precincts are ignored here, deliberately. The ground
      // behind an abutment belongs to the abbey, to Portcullis House, to
      // whatever else the map has put there — and the bridge still has to be
      // reachable, so the approach takes precedence and anything reserved that
      // it happens to cross simply does not get built.
      for (let t = bridge.run + 30; t <= 260; t += 6) {
        const x = end.x + bridge.out.x * sign * t;
        const z = end.z + bridge.out.z * sign * t;
        if (onLand(x, z, 9, true)) { head = { x, z }; break; }
      }
      debug.bridge.push({ sign, head: head ? [Math.round(head.x), Math.round(head.z)] : null });
      if (!head) { heads.push(-1); continue; }
      // Land on a street if there is one to land on.
      //
      // A junction of its own, dropped on the bank a fixed distance inland, has
      // to be tied into the grid afterwards by roads invented for the purpose —
      // and those are the roads that kept coming out as folds, two of them
      // leaving the head a few degrees apart because the only junctions in
      // reach were in the same direction. A bridge that arrives at a junction
      // that already exists needs no such roads: the crossing is simply another
      // arm of a junction the grid already built and already got right.
      let existing = -1, bestD = Infinity;
      for (let mi = 0; mi < nodes.length; mi++) {
        const m = nodes[mi];
        if (!m.links.length || m.approach) continue;
        const d = Math.hypot(m.x - head.x, m.z - head.z);
        if (d > pitch * 1.15 || d >= bestD) continue;
        // And the run from it to the ramp has to be buildable.
        const foot = { x: end.x + bridge.out.x * sign * bridge.run,
          z: end.z + bridge.out.z * sign * bridge.run };
        if (!lineClear(m, foot, 6, true)) continue;
        bestD = d; existing = mi;
      }
      if (existing >= 0) { heads.push(existing); continue; }
      const n = nodes.length;
      nodes.push({ x: head.x, z: head.z, y: terrain.heightAt(head.x, head.z),
        avenue: true, links: [], approach: true });
      approaches.push(n);
      heads.push(n);
    }

    if (heads[0] >= 0 && heads[1] >= 0) {
      const A = nodes[heads[0]], B = nodes[heads[1]];
      const pts = [{ x: A.x, z: A.z, y: A.y + SURFACE_LIFT }];
      for (const q of bridge.profile) pts.push({ x: q.x, z: q.z, y: q.y });
      pts.push({ x: B.x, z: B.z, y: B.y + SURFACE_LIFT });
      let len = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      }
      const e = { a: heads[0], b: heads[1], cls: 'avenue', pts, len,
        approach: true, bridge: true };
      edges.push(e);
      A.links.push({ edge: e, other: heads[1], at: 0 });
      B.links.push({ edge: e, other: heads[0], at: 1 });
    }

    // Join each bank's junction into the grid, in more than one direction.
    for (const n of approaches) {
      let joined = 0;
      const tried = new Set();
      for (let k = 0; k < 8 && joined < 2; k++) {
        const near = nearestNode(nodes, nodes[n], 2.6 * pitch,
          (m, mi) => !tried.has(mi) && mi !== n && !m.approach);
        if (near < 0) break;
        tried.add(near);
        const join = addEdge(n, near, 'avenue', 5, undefined, true);
        if (join) { join.approach = true; joined++; }
      }
    }
  }

  // ── 6. Tidy the graph before anything is drawn from it.
  //
  // Every street above can fail to be built — the line runs into the water, or
  // across the abbey, or off the edge — and what that leaves behind is the
  // thing the plan reads worst as: stubs that go a hundred metres and stop at
  // nothing, and the occasional pocket of road with no connection to the rest
  // of the city at all. A road exists to get somewhere. So:
  //
  //   - repeatedly drop any street with a dead end, until none is left;
  //   - then keep only the largest connected piece of what remains.
  //
  // Both are just graph work, and between them they are the difference between
  // a plan and a scattering of tarmac.
  pruneNetwork(nodes, edges);

  // A bridge has to land somewhere.
  //
  // The tidy-up above can take the last street off a bridge head — two roads
  // tying it into the grid on similar bearings are a fold like any other, and
  // dropping one of them can leave the other prunable. What that produces is a
  // crossing that arrives on the far bank and stops, which is the one thing a
  // bridge must never do. So after the graph is tidy, any head still holding
  // nothing but the crossing goes looking again, further out and less fussily.
  for (const n of approaches) {
    if (nodes[n].links.length >= 2) continue;
    const tried = new Set();
    // Further out than the first pass, and then further still. On a map
    // where the river runs along the edge — Agra's Yamuna, the Seine past the
    // Champ de Mars — one bank has no grid within four pitches, and a bridge
    // that reaches it and stops is the one thing a bridge must never be. A
    // long approach road across open ground is what the real one would have.
    for (let k = 0; k < 14 && nodes[n].links.length < 2; k++) {
      const reach = k < 6 ? 4.5 * pitch : 11 * pitch;
      const near = nearestNode(nodes, nodes[n], reach,
        (m, mi) => !tried.has(mi) && mi !== n && m.links.length > 0);
      if (near < 0) break;
      tried.add(near);
      // The exclusion is a circle round the monument and the crossing sits
      // just outside it, so every straight road from the abutment into town
      // clips the circle and was refused. The circle is the coarse guard; the
      // precinct rectangle is the precise one, and the approach still honours
      // that — it may skirt the monument, it may not cross its garden.
      const join = addEdge(n, near, 'avenue', 4, 8, false, true);
      if (!join) continue;
      join.approach = true;
      // This runs after the tidy-up, so nothing downstream will notice if the
      // road it just added leaves on the same bearing as one already there —
      // at *either* end of it. Check both before keeping it.
      let fold = false;
      for (const k2 of [n, near]) {
        const here = nodes[k2];
        const added = here.links[here.links.length - 1];
        const da = linkDir(here, added);
        for (const l of here.links) {
          if (l === added) continue;
          const db = linkDir(here, l);
          if (da.x * db.x + da.z * db.z > 0.78) { fold = true; break; }
        }
        if (fold) break;
      }
      if (!fold) continue;
      nodes[n].links = nodes[n].links.filter((l) => l.edge !== join);
      nodes[near].links = nodes[near].links.filter((l) => l.edge !== join);
      edges.splice(edges.indexOf(join), 1);
    }
  }

  // ── 7. Blocks: the holes in the network, which is where buildings go.
  //
  // Not one per grid cell. A cell whose four sides are not all there is not a
  // block — and the version before this one simply skipped it, which is why the
  // map had bald patches: every street that failed to build, and every street
  // deliberately dropped to break up the lattice, punched a hole in the city
  // that nothing ever filled.
  //
  // What belongs there is a *bigger* block. Where the street between two cells
  // is missing, the two cells are one plot of land, and that is what a long
  // block is. So the cells are swept into maximal rectangles: grow right while
  // the divider to the right is missing, then grow down while every divider
  // along the bottom is missing, and take the result as one block bounded by
  // the streets that really do run around it.
  const blocks = [];
  const linked = (a, b) => (a >= 0 && b >= 0
    && nodes[a].links.some((l) => l.other === b));
  const at = (i, j) => (i >= 0 && j >= 0 && i < cols && j < rows ? idx[j * cols + i] : -1);
  // Is the cell at (i, j) real ground — four corners, and not the precinct?
  const corners = (i, j) => {
    const c00 = at(i, j), c10 = at(i + 1, j), c01 = at(i, j + 1), c11 = at(i + 1, j + 1);
    return (c00 < 0 || c10 < 0 || c01 < 0 || c11 < 0) ? null : { c00, c10, c01, c11 };
  };
  // Does a street run along the given side of cell (i, j)?
  const topOf = (i, j) => { const c = corners(i, j); return !!c && linked(c.c00, c.c10); };
  const botOf = (i, j) => { const c = corners(i, j); return !!c && linked(c.c01, c.c11); };
  const leftOf = (i, j) => { const c = corners(i, j); return !!c && linked(c.c00, c.c01); };
  const rightOf = (i, j) => { const c = corners(i, j); return !!c && linked(c.c10, c.c11); };

  const taken = new Uint8Array(cols * rows);
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      if (taken[j * cols + i]) continue;
      if (!corners(i, j)) continue;
      // The block must be walled on the two sides it starts against.
      if (!topOf(i, j) || !leftOf(i, j)) continue;
      // Grow right while the divider between this column and the next is gone
      // and the next column is real ground with a street along its top.
      let i1 = i;
      while (i1 + 1 < cols - 1 && !taken[j * cols + i1 + 1]
        && !rightOf(i1, j) && corners(i1 + 1, j) && topOf(i1 + 1, j)) i1++;
      // Then down, but only in whole rows: every column of the next row has to
      // be free of a divider, or the rectangle would swallow a street.
      let j1 = j;
      for (;;) {
        if (j1 + 1 >= rows - 1) break;
        let ok = true;
        for (let k = i; k <= i1; k++) {
          if (taken[(j1 + 1) * cols + k] || botOf(k, j1) || !corners(k, j1 + 1)
            || !leftOf(i, j1 + 1) || !rightOf(i1, j1 + 1)) { ok = false; break; }
        }
        if (!ok) break;
        j1++;
      }
      // Closed on the far sides, or this is not an enclosed block at all.
      if (!rightOf(i1, j) || !botOf(i, j1)) {
        // A rectangle open on one side is still land, provided its outline is
        // made of real junctions — it is a corner plot rather than a block, and
        // leaving it bare is the hole this whole pass exists to remove. Accept
        // it if at least three of its four sides are streets.
        const sidesPresent = (topOf(i, j) ? 1 : 0) + (leftOf(i, j) ? 1 : 0)
          + (rightOf(i1, j) ? 1 : 0) + (botOf(i, j1) ? 1 : 0);
        if (sidesPresent < 3) continue;
      }
      for (let b = j; b <= j1; b++) for (let a = i; a <= i1; a++) taken[b * cols + a] = 1;
      const c00 = at(i, j), c10 = at(i1 + 1, j);
      const c01 = at(i, j1 + 1), c11 = at(i1 + 1, j1 + 1);
      if (c00 < 0 || c10 < 0 || c01 < 0 || c11 < 0) continue;
      const poly = [nodes[c00], nodes[c10], nodes[c11], nodes[c01]]
        .map((n) => ({ x: n.x, z: n.z }));
      const sides = [
        sideClass(nodes, c00, c10), sideClass(nodes, c10, c11),
        sideClass(nodes, c11, c01), sideClass(nodes, c01, c00),
      ];
      let cx = 0, cz = 0;
      for (const p of poly) { cx += p.x / 4; cz += p.z / 4; }
      blocks.push({ poly, sides, x: cx, z: cz, cells: (i1 - i + 1) * (j1 - j + 1) });
    }
  }

  // ── 8. Now that the blocks are cut, join up the streets the grid split.
  //
  // It has to be this way round: a block is found by asking whether its four
  // corners are directly linked, and dissolving a node replaces two of those
  // links with one long street that no corner can see.
  debug.dissolved = dissolveThroughNodes(nodes, edges);

  const net = { nodes, edges, blocks, pitch, reach, debug };
  buildEdgeIndex(net);
  return net;
}

/**
 * Join up streets that only stop because the grid said so.
 *
 * This is the jank. A junction pad is built from the kerb lines of the streets
 * that meet it — for each neighbouring pair of arms, the point where their kerbs
 * cross — and that construction is right for three arms or more and degenerate
 * for two that run straight on: the kerb lines are then *parallel*, there is no
 * crossing point, and the fallback pinches the pad to a point at the node. What
 * that draws is a road narrowing to a wedge and opening out again, which is what
 * a lane looks like when it appears to merge into nothing, and the riverside had
 * ten of them in a row because the embankment is a chain of such nodes.
 *
 * The real answer is not a better fallback. A node with two arms running through
 * it is not a junction at all — it is a point in the middle of a street — so the
 * two streets are joined into one and the node is dropped. Bends keep their
 * node, because a bend really is a corner and the kerb lines really do cross.
 *
 * Runs after the blocks are cut, which need the grid's own links to find their
 * four sides, and before anything is drawn from the graph.
 */
/**
 * @param {Array} nodes
 * @param {Array} edges
 * @param {object} opts `{ surveyed }` — a real street plan bends, and the
 *        straightness this looks for is a property of the generator, not of
 *        any actual road.
 */
export function dissolveThroughNodes(nodes, edges, opts = {}) {
  const surveyed = !!opts.surveyed;
  const indexOf = new Map();
  const reindex = () => {
    indexOf.clear();
    for (let i = 0; i < nodes.length; i++) indexOf.set(nodes[i], i);
  };
  reindex();
  let merged = 0;
  for (let pass = 0; pass < 6; pass++) {
    let did = 0;
    for (let ni = 0; ni < nodes.length; ni++) {
      const n = nodes[ni];
      if (n.links.length !== 2) continue;
      const la = n.links[0], lb = n.links[1];
      const ea = la.edge, eb = lb.edge;
      if (ea === eb) continue;                       // a loop back to itself
      // A road changing class stops here — except on a surveyed plan, where a
      // street becomes a service road for forty metres and then goes back to
      // being a street, and the graph says so at every change. Splitting on
      // that leaves a junction in the middle of a road.
      if (ea.cls !== eb.cls && !surveyed) continue;
      if (ea.approach || eb.approach) continue;      // the bridge's own geometry
      if (!!ea.bank !== !!eb.bank) continue;
      const da = linkDir(n, la), db = linkDir(n, lb);
      // +1 when the second arm carries straight on from the first.
      const straight = -(da.x * db.x + da.z * db.z);
      // The embankment is allowed to be a curve; a street is not, and a street
      // merged across a real kink would fail the straightness test it exists to
      // satisfy.
      //
      // Nought point nine nine eight is three and a half degrees, which is the
      // right test for an invented city because its streets are ruled lines.
      // It is the wrong test for a real one: a surveyed street carries a bend
      // of a degree or two at nearly every node, so five hundred and
      // twenty-eight of Westminster's nine hundred and forty-eight junctions
      // survived this — and a junction pad at a two-arm node is built from the
      // crossing of two parallel kerb lines, which has no crossing, so every
      // one of them drew a wedge. That is what the roads looked like.
      //
      // A bend of up to thirty-five degrees is a bend in a street. Past that it
      // is a corner, and a corner really is a junction with two arms.
      const limit = surveyed ? 0.82 : (ea.bank ? 0.86 : 0.998);
      if (straight < limit) continue;

      // Orient both so `ea` ends at n and `eb` leaves it.
      const aPts = la.at === 0 ? ea.pts.slice().reverse() : ea.pts.slice();
      const bPts = lb.at === 0 ? eb.pts.slice() : eb.pts.slice().reverse();
      const farA = la.at === 0 ? ea.b : ea.a;
      const farB = lb.at === 0 ? eb.b : eb.a;
      if (farA === farB) continue;                   // would close a two-edge loop
      const pts = aPts.concat(bPts.slice(1));
      let len = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      }
      // The bigger road wins the merged piece: a street that becomes a service
      // lane for one block is a street with a narrow bit, not a service lane.
      const cls = KIND_RANK[ea.cls] >= KIND_RANK[eb.cls] ? ea.cls : eb.cls;
      const e = { a: farA, b: farB, cls, pts, len };
      if (ea.bank || eb.bank) e.bank = true;
      // And `bridge`, which is not the same flag: `bank` says the road may
      // curve and must not be straightened away, `bridge` says the surface
      // follows the deck's own height and may be laid over water. Losing it in
      // the merge meant a crossing made of two surveyed pieces got its deck and
      // its parapet and no carriageway at all — the tarmac was culled for being
      // over the river, which is where a bridge is.
      if (ea.bridge || eb.bridge) e.bridge = true;

      // Swap the two old edges out of the graph.
      for (const k of [farA, farB]) {
        nodes[k].links = nodes[k].links.filter((l) => l.edge !== ea && l.edge !== eb);
      }
      nodes[farA].links.push({ edge: e, other: farB, at: 0 });
      nodes[farB].links.push({ edge: e, other: farA, at: 1 });
      n.links = [];
      for (let k = edges.length - 1; k >= 0; k--) {
        if (edges[k] === ea || edges[k] === eb) edges.splice(k, 1);
      }
      edges.push(e);
      merged++; did++;
    }
    if (!did) break;
  }
  return merged;
}

/**
 * Take the stubs and the orphans out of a finished graph.
 *
 * Nodes are never removed or reordered — the block sweep indexes into the same
 * array — so a junction left with nothing attached simply has no links, and
 * every consumer already skips those.
 *
 * Two rules:
 *
 *   - a street with a dead end at either end is not a street, it is a stub, and
 *     it goes. Repeatedly, because removing one makes its neighbour a stub too:
 *     a failed line can leave a chain of three or four of them trailing off
 *     across the map.
 *   - a handful of streets joined only to each other, a long way from anything,
 *     is a fragment. It goes as well. Not by "keep the largest": the far bank of
 *     the river is a legitimate second component joined only by the bridge, and
 *     keeping the largest deletes half the city.
 *
 * Bridge approaches and the embankment are exempt from the first rule. Both are
 * meant to end where they end — one at the abutment, the other at the edge of
 * the map — and pruning them is how the bridge loses its road again.
 */
function pruneNetwork(nodes, edges) {
  const keep = (e) => e.approach || e.bank;

  // Folds first: two streets leaving a junction on nearly the same bearing.
  //
  // That is not a fork, it is one road drawn twice — and it is the worst input
  // the junction geometry can be given, because the corner between two arms
  // twenty degrees apart has nowhere sensible to go. Measured on this map: a
  // pair at two degrees on a five-way node, another at eleven, and a two-armed
  // node at twenty-eight, which is a road doubling back on itself and is the
  // spike by the tower. The shorter of the two goes; there is nowhere it went
  // that its twin does not.
  for (const n of nodes) {
    for (let guard = 0; guard < 4 && n.links.length > 1; guard++) {
      let drop = null;
      for (let i = 0; i < n.links.length && !drop; i++) {
        for (let j = i + 1; j < n.links.length; j++) {
          const a = linkDir(n, n.links[i]), b = linkDir(n, n.links[j]);
          if (a.x * b.x + a.z * b.z < 0.78) continue;        // over ~39° apart
          const ea = n.links[i].edge, eb = n.links[j].edge;
          // Only the crossing itself is sacred here. The two roads that tie a
          // bridge head into the grid are ordinary streets and are perfectly
          // capable of leaving it eight degrees apart, which is a fork onto the
          // same destination and the sharpest corner on the map.
          const fixed = (e) => !!e.bridge;
          if (fixed(ea) && fixed(eb)) continue;
          const cand = fixed(ea) ? eb : (fixed(eb) ? ea : (ea.len <= eb.len ? ea : eb));
          // Removing a fold must not strand a bridge.
          //
          // Everywhere else it is fine and usually right: dropping one arm of a
          // two-armed fold leaves a dead-end stub, and the dead-end pass below
          // removes that too, which is exactly what should happen to a road
          // that doubles back on itself. A bridge head is the exception — its
          // crossing cannot be moved or removed, so a head cut down to nothing
          // but the crossing is a bridge that arrives and stops.
          const carriesBridge = (k) => nodes[k].links.some((l) => l.edge.bridge);
          const strands = (k) => carriesBridge(k) && nodes[k].links.length < 3;
          if (strands(cand.a) || strands(cand.b)) continue;
          drop = cand;
          break;
        }
      }
      if (!drop) break;
      nodes[drop.a].links = nodes[drop.a].links.filter((l) => l.edge !== drop);
      nodes[drop.b].links = nodes[drop.b].links.filter((l) => l.edge !== drop);
      const k = edges.indexOf(drop);
      if (k >= 0) edges.splice(k, 1);
    }
  }

  for (;;) {
    let cut = 0;
    for (let k = edges.length - 1; k >= 0; k--) {
      const e = edges[k];
      if (keep(e)) continue;
      const a = nodes[e.a], b = nodes[e.b];
      if (a.links.length > 1 && b.links.length > 1) continue;
      a.links = a.links.filter((l) => l.edge !== e);
      b.links = b.links.filter((l) => l.edge !== e);
      edges.splice(k, 1);
      cut++;
    }
    if (!cut) break;
  }

  // Components, by flood fill over what is left.
  const comp = new Int32Array(nodes.length).fill(-1);
  let nc = 0;
  const sizes = [];
  for (let i = 0; i < nodes.length; i++) {
    if (comp[i] >= 0 || !nodes[i].links.length) continue;
    const id = nc++;
    let n = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const k = stack.pop();
      n++;
      for (const l of nodes[k].links) {
        if (comp[l.other] < 0) { comp[l.other] = id; stack.push(l.other); }
      }
    }
    sizes.push(n);
  }
  for (let k = edges.length - 1; k >= 0; k--) {
    const e = edges[k];
    const id = comp[e.a];
    if (id < 0 || sizes[id] >= 5 || keep(e)) continue;
    nodes[e.a].links = nodes[e.a].links.filter((l) => l.edge !== e);
    nodes[e.b].links = nodes[e.b].links.filter((l) => l.edge !== e);
    edges.splice(k, 1);
  }
}

/** Which road class runs along this side of a block. */
function sideClass(nodes, a, b) {
  const l = nodes[a].links.find((k) => k.other === b);
  return l ? l.edge.cls : 'street';
}

function nearestNode(nodes, from, maxDist, ok) {
  let best = -1, bd = maxDist;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n === from) continue;
    if (ok && !ok(n, i)) continue;
    const d = Math.hypot(n.x - from.x, n.z - from.z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * Follow the near bank of the river, a fixed distance inland.
 *
 * Marching along z and stepping out to the waterline gives a line that is as
 * ragged as the mask; smoothing it three times gives one a road can run along.
 */
function traceBank(terrain, reach) {
  const raw = [];
  for (let z = -reach; z <= reach; z += 26) {
    let found = null;
    for (let x = -reach * 0.2; x < reach; x += 5) {
      if (terrain.isWater(x, z)) { found = x; break; }
    }
    if (found === null) continue;
    raw.push({ x: found - 21, z });
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < raw.length - 1; i++) {
      raw[i].x = (raw[i - 1].x + raw[i].x * 2 + raw[i + 1].x) / 4;
    }
  }
  // Thin it to junction spacing.
  const out = [];
  for (let i = 0; i < raw.length; i += 3) out.push(raw[i]);
  return out;
}

// ─────────────────────────────────────────────────────────────── lookups ──

/**
 * A grid of the segments, so "is this spot in the road?" is a handful of
 * distance tests rather than a walk over the whole network. Every building
 * placement asks that question, several times.
 */
export function buildEdgeIndex(net) {
  const CELL = 64;
  const map = new Map();
  const key = (cx, cz) => cx * 8192 + cz;
  const segs = [];
  for (const e of net.edges) {
    const half = halfWidth(e.cls);
    for (let i = 0; i < e.pts.length - 1; i++) {
      segs.push({ a: e.pts[i], b: e.pts[i + 1], half, cls: e.cls });
    }
  }
  for (let s = 0; s < segs.length; s++) {
    const { a, b, half } = segs[s];
    const x0 = Math.floor((Math.min(a.x, b.x) - half) / CELL);
    const x1 = Math.floor((Math.max(a.x, b.x) + half) / CELL);
    const z0 = Math.floor((Math.min(a.z, b.z) - half) / CELL);
    const z1 = Math.floor((Math.max(a.z, b.z) + half) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let bucket = map.get(k);
        if (!bucket) map.set(k, bucket = []);
        bucket.push(s);
      }
    }
  }
  net.segs = segs;
  /** Distance from (x,z) to the nearest carriageway edge; negative if inside. */
  net.roadClearance = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (let ax = cx - 1; ax <= cx + 1; ax++) {
      for (let az = cz - 1; az <= cz + 1; az++) {
        const bucket = map.get(key(ax, az));
        if (!bucket) continue;
        for (const si of bucket) {
          const s = segs[si];
          best = Math.min(best, pointSeg(x, z, s.a, s.b) - s.half);
        }
      }
    }
    return best;
  };
  // Junction pads are wider than the streets that meet them.
  //
  // Indexed on the same grid as the carriageways. A generated plan has a
  // couple of hundred junctions and a walk over all of them was free; a real
  // one has a thousand, and this is asked several times per building, per
  // ground quad and per tree — which is a hundred million distance tests and
  // several seconds of load time, on the frame where nothing is on screen yet.
  const pads = new Map();
  for (const n of net.nodes) {
    const r = padRadius(n);
    if (r <= 0) continue;
    const cx = Math.floor(n.x / CELL), cz = Math.floor(n.z / CELL);
    const k = key(cx, cz);
    let bucket = pads.get(k);
    if (!bucket) pads.set(k, bucket = []);
    bucket.push({ x: n.x, z: n.z, r });
  }
  net.nodeClearance = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (let ax = cx - 1; ax <= cx + 1; ax++) {
      for (let az = cz - 1; az <= cz + 1; az++) {
        const bucket = pads.get(key(ax, az));
        if (!bucket) continue;
        for (const n of bucket) best = Math.min(best, Math.hypot(n.x - x, n.z - z) - n.r);
      }
    }
    return best;
  };
}

function pointSeg(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

/**
 * How far the junction's paving reaches from its centre.
 *
 * Zero where there is no junction. A node with one street is the end of a road
 * and a node with none is a node the dissolve pass retired, and giving either of
 * them a six-metre pad meant the street was trimmed six metres short of its own
 * end and the gap filled with a triangle — a road stopping in a spike, with a
 * hole behind it that buildings and ground cover were also told to keep out of.
 */
export function padRadius(node) {
  // Two arms is a point in the middle of a street, not a junction — the pad is
  // built from where neighbouring arms' kerb lines cross, and two arms that
  // carry on through have no crossing. Trimming the ribbons back for one is how
  // a road came to narrow to a wedge and open out again. The dissolve pass
  // removes most of them; what is left is a corner, and a corner is drawn by
  // letting the two ribbons overlap round the inside of the bend.
  if (node.links.length < 3) return 0;
  let r = 6;
  for (const l of node.links) r = Math.max(r, halfWidth(l.edge.cls));
  return r;
}

/**
 * Unit direction leaving `node` along one of its links.
 *
 * Measured over the first few metres of the road rather than to the polyline's
 * next vertex, and that is not a refinement — it is the difference between a
 * street plan and a mess.
 *
 * A generated street is two points, so the next vertex is the far end and the
 * bearing is exact. A surveyed one is a traced polyline whose first vertex can
 * be twenty centimetres from the junction, because the node was welded onto a
 * grid and because a segment gets cut wherever a connector sits — and a bearing
 * taken across twenty centimetres is *noise*. Everything that reads a junction
 * reads this: the dissolve pass decides whether two arms carry straight on, the
 * pad geometry builds its outline from where neighbouring arms' kerbs cross,
 * the markings decide where a crossing goes. Given noise, four hundred and
 * fifty of Westminster's straight-through nodes read as ninety-degree corners
 * and kept their pads, and every pad built from noise drew a spike.
 */
function linkDir(node, link) {
  const pts = link.edge.pts;
  const fwd = link.at === 0;
  const n = pts.length;
  let dx = 0, dz = 0;
  for (let k = 1; k < n; k++) {
    const p = pts[fwd ? k : n - 1 - k];
    dx = p.x - node.x; dz = p.z - node.z;
    // Far enough along to be a bearing rather than a rounding error, and not
    // so far that a real bend in the road is averaged away.
    if (dx * dx + dz * dz > 16) break;
  }
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

// ─────────────────────────────────────────────────────────────── surface ──

/** How far every road surface sits above the ground it follows. */
export const SURFACE_LIFT = 0.22;

const ASPHALT = new THREE.Color(0x35383d);
const PAVE = new THREE.Color(0xa8a294);
const KERB = new THREE.Color(0xc4bdab);

/**
 * The outline of one junction's paving, as a ring of points about the node.
 *
 * Exported because the self-test checks the real thing rather than a copy of
 * it: the property that matters — that the ring goes round the node once,
 * without doubling back and without running away from it — is a property of
 * this function, and a test that reimplements it tests nothing.
 *
 * `widthOf` picks which edge of each street the ring follows: the outside of
 * its pavement, or the edge of its carriageway.
 */
export function junctionRing(n, widthOf) {
  const R = padRadius(n);
  const arms = n.links.map((l) => {
    const dir = linkDir(n, l);
    const c = ROAD_CLASS[l.edge.cls];
    return { dir, ang: Math.atan2(dir.z, dir.x),
      full: c.road / 2 + c.pave + c.kerb, road: c.road / 2 };
  }).sort((a, b) => a.ang - b.ang);
  if (arms.length < 2) return [];
  const build = (widthOf) => {
    const out = [];
    const arc = (from, to, radius, steps) => {
      let a0 = Math.atan2(from.z - n.z, from.x - n.x);
      let a1 = Math.atan2(to.z - n.z, to.x - n.x);
      let d = a1 - a0;
      while (d <= 0) d += Math.PI * 2;
      while (d > Math.PI * 2) d -= Math.PI * 2;
      for (let k = 1; k < steps; k++) {
        const a2 = a0 + (d * k) / steps;
        out.push({ x: n.x + Math.cos(a2) * radius, z: n.z + Math.sin(a2) * radius });
      }
    };
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i], b = arms[(i + 1) % arms.length];
      const wa = widthOf(a), wb = widthOf(b);
      const na = { x: -a.dir.z, z: a.dir.x };     // left of a
      const nb = { x: -b.dir.z, z: b.dir.x };
      // The two ends of this street's stop line.
      const right = { x: n.x + a.dir.x * R - na.x * wa, z: n.z + a.dir.z * R - na.z * wa };
      const left = { x: n.x + a.dir.x * R + na.x * wa, z: n.z + a.dir.z * R + na.z * wa };
      out.push(right);
      out.push(left);
      if (arms.length < 2) continue;
      const nextRight = { x: n.x + b.dir.x * R - nb.x * wb,
        z: n.z + b.dir.z * R - nb.z * wb };
      // How far apart are these two arms?
      let sep = b.ang - a.ang;
      while (sep < 0) sep += Math.PI * 2;
      if (sep < 0.87) {                       // under ~50°: no usable corner
        arc(left, nextRight, Math.max(wa, wb, R * 0.9), 4);
        continue;
      }
      const p1 = { x: n.x + na.x * wa, z: n.z + na.z * wa };
      const p2 = { x: n.x - nb.x * wb, z: n.z - nb.z * wb };
      const c = intersect(p1, a.dir, p2, b.dir);
      const lim = R * 1.4;
      if (!c || Math.hypot(c.x - n.x, c.z - n.z) > lim) {
        arc(left, nextRight, Math.max(wa, wb), 4);
        continue;
      }
      // A kerb return: round the corner off rather than mitring it to a
      // point, with a radius the smaller of the two roads can carry.
      const rad = Math.min(Math.min(wa, wb) * 0.7, 7,
        Math.hypot(c.x - left.x, c.z - left.z) * 0.8,
        Math.hypot(c.x - nextRight.x, c.z - nextRight.z) * 0.8);
      if (rad < 0.8) { out.push(c); continue; }
      const t1 = Math.hypot(c.x - left.x, c.z - left.z) || 1;
      const t2 = Math.hypot(c.x - nextRight.x, c.z - nextRight.z) || 1;
      const s1 = { x: c.x + (left.x - c.x) * (rad / t1),
        z: c.z + (left.z - c.z) * (rad / t1) };
      const s2 = { x: c.x + (nextRight.x - c.x) * (rad / t2),
        z: c.z + (nextRight.z - c.z) * (rad / t2) };
      out.push(s1);
      for (let k = 1; k < 4; k++) {
        const u = k / 4;
        // Quadratic Bézier through the mitre point: a clean fillet for two
        // straight kerbs, and three points is plenty at this scale.
        const iv = 1 - u;
        out.push({
          x: iv * iv * s1.x + 2 * iv * u * c.x + u * u * s2.x,
          z: iv * iv * s1.z + 2 * iv * u * c.z + u * u * s2.z,
        });
      }
      out.push(s2);
    }
    // Star-shaped, or the fan below cannot draw it.
    //
    // Sorted by bearing about the node and clamped in radius, so no vertex can
    // sit behind the node or beyond the pad, and no pair can cross. This is
    // the guard that makes the two cases above unable to produce a spike
    // however strangely the streets happen to meet.
    const lim2 = R * 1.4;
    for (const q of out) {
      const dx = q.x - n.x, dz = q.z - n.z;
      const r2 = Math.hypot(dx, dz);
      if (r2 > lim2) { q.x = n.x + (dx / r2) * lim2; q.z = n.z + (dz / r2) * lim2; }
      q.ang = Math.atan2(dz, dx);
    }
    out.sort((p2, q2) => p2.ang - q2.ang);
    return out;
  };
  return build(widthOf);
}

/**
 * The road surface: every street a ribbon, every junction a paved pad.
 *
 * The pads are the part that was missing before. Two straight ribbons crossing
 * each other overlap in a square of double-drawn, z-fighting asphalt with the
 * pavement running straight through the middle of the crossing — which is
 * exactly what a grid of independent stripes gives you. Here each street stops
 * short of the junction and the junction itself is filled with a pad built
 * from the directions of the streets that meet it, so the paving is continuous
 * and the kerb lines turn the corner.
 */
export function buildStreetSurface(net, terrain, quality) {
  const LIFT = SURFACE_LIFT;
  const pos = [];
  const col = [];
  const tmp = new THREE.Color();

  const vert = (x, z, y, colour) => {
    pos.push(x, y, z);
    const j = 0.88 + 0.24 * valueNoise(x * 0.03, z * 0.03);
    tmp.copy(colour).multiplyScalar(j);
    col.push(tmp.r, tmp.g, tmp.b);
  };
  // The last word on where tarmac may go. A bridge approach is allowed to run
  // closer to the bank than any other road, and the graph only ever checks the
  // centre line — so the surface checks each corner, and simply does not lay
  // the piece that would end up in the river.
  const dry = (p) => !terrain.isWater(p.x, p.z);
  let overWater = false;          // true while laying a bridge deck
  const quad = (p0, p1, p2, p3, colour) => {
    if (!overWater && (!dry(p0) || !dry(p1) || !dry(p2) || !dry(p3))) return;
    vert(p0.x, p0.z, p0.y, colour); vert(p1.x, p1.z, p1.y, colour);
    vert(p2.x, p2.z, p2.y, colour);
    vert(p0.x, p0.z, p0.y, colour); vert(p2.x, p2.z, p2.y, colour);
    vert(p3.x, p3.z, p3.y, colour);
  };

  // ── Ribbons.
  for (const e of net.edges) {
    const c = ROAD_CLASS[e.cls];
    const lanes = [
      [-c.road / 2 - c.pave - c.kerb, -c.road / 2 - c.pave, KERB],
      [-c.road / 2 - c.pave, -c.road / 2, PAVE],
      [-c.road / 2, c.road / 2, ASPHALT],
      [c.road / 2, c.road / 2 + c.pave, PAVE],
      [c.road / 2 + c.pave, c.road / 2 + c.pave + c.kerb, KERB],
    ];
    const a = net.nodes[e.a], b = net.nodes[e.b];
    // Never trim a street out of existence. The pad radius is a fixed number
    // and a surveyed plan has junctions twenty metres apart — two pads at
    // eleven metres eat the whole street, and five hundred of London's
    // eight hundred roads were simply not drawn.
    let trimA = padRadius(a) * 0.98, trimB = padRadius(b) * 0.98;
    const run = polylineLength(e.pts);
    if (trimA + trimB > run * 0.7) {
      const k = (run * 0.7) / (trimA + trimB);
      trimA *= k; trimB *= k;
    }
    const line = trimPolyline(e.pts, trimA, trimB);
    if (line.length < 2) continue;
    // A bridge carries its own height and is allowed over the water. Its
    // polyline is the running surface itself, worked out once and shared with
    // the structure built under it.
    overWater = !!e.bridge;
    for (let i = 0; i < line.length - 1; i++) {
      const p = line[i], q = line[i + 1];
      const dx = q.x - p.x, dz = q.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = -dz / d, nz = dx / d;
      // Ease the ends up to the junction's own level so pad and ribbon meet.
      // The ribbon runs a little way under the junction pad, and where the
      // two share ground it sits three centimetres lower: the pad covers the
      // seam, and two surfaces on exactly the same plane are two surfaces
      // that flicker against each other.
      const yAt = (pt, w) => {
        // A bridge carries its own height, and so does the ramp up to it:
        // both were worked out once, together, and the structure is built
        // under exactly this line.
        if ((e.bridge || e.approach) && pt.y !== undefined) return pt.y;
        const g = terrain.heightAt(pt.x, pt.z) + LIFT;
        if (w <= 0) return g;
        return g * (1 - w) + w * ((pt.nearA ? a.y : b.y) + LIFT - 0.03);
      };
      const wp = endWeight(i, line.length - 1), wq = endWeight(i + 1, line.length - 1);
      p.nearA = i < line.length / 2; q.nearA = (i + 1) < line.length / 2;
      const py = yAt(p, wp), qy = yAt(q, wq);
      for (const [f0, f1, colour] of lanes) {
        quad(
          { x: p.x + nx * f0, z: p.z + nz * f0, y: py },
          { x: q.x + nx * f0, z: q.z + nz * f0, y: qy },
          { x: q.x + nx * f1, z: q.z + nz * f1, y: qy },
          { x: p.x + nx * f1, z: p.z + nz * f1, y: py },
          colour,
        );
      }
    }
  }

  // ── Junction pads.
  //
  // What a junction is: each street runs into it to a stop line, and the kerb
  // turns the corner between one street and the next. So the outline is built
  // from the streets themselves — two points per street at its stop line, and
  // between each neighbouring pair the corner where their kerbs meet.
  //
  // The corner is the part that has to be handled carefully, because the naive
  // answer breaks in two directions at once. Intersecting the two kerb lines is
  // right for arms that are well apart and wrong for arms that are close: the
  // crossing point runs away to infinity as they become parallel, and lands
  // *behind* the node once they are closer than a right angle or so. Either way
  // the vertex list stops going round the node in one direction — and a fan from
  // the centre needs exactly that. When it fails the pad either folds over
  // itself, which draws a spike, or fails to close, which leaves a wedge of bare
  // ground showing through the middle of a junction. Eighteen of two hundred and
  // fourteen were doing one or the other, with outlines sweeping anywhere from
  // 242° to 383° instead of 360°.
  //
  // Three things fix it, and the third makes the first two unable to fail:
  //
  //   - the corner is a *kerb radius*, an arc tangent to both kerb lines, not a
  //     mitred point. That is what a junction looks like from above and it is
  //     what stops an acute corner drawing a thin spit of pavement;
  //   - arms closer than about fifty degrees get no crossing point at all, just
  //     an arc swept round the node between their two stop lines;
  //   - and whatever comes out of that is then forced to be star-shaped: sorted
  //     by bearing from the node, clamped in radius, and stripped of anything
  //     that doubles back. A fan of it is then always a simple polygon.
  for (const n of net.nodes) {
    // Three arms or more, or there is nothing here to pave: with two the
    // ribbons run through and meet each other.
    if (n.links.length < 3) continue;
    const y = n.y + LIFT;
    // Star-shaped around the node, so a fan from the centre triangulates it.
    fan(junctionRing(n, (a) => a.full), n, y, PAVE, vert, dry);
    fan(junctionRing(n, (a) => a.road), n, y + 0.03, ASPHALT, vert, dry);
  }

  // Face every triangle upward.
  //
  // The ribbons are wound from the direction the street happens to run and the
  // junction pads from whatever order the hull came out in, so roughly half of
  // this mesh would otherwise be facing the ground — invisible, since the
  // material is single-sided. Flipping by the sign of the normal is simpler
  // and more robust than trying to keep every generator's winding consistent.
  for (let t = 0; t < pos.length; t += 9) {
    const ax = pos[t + 3] - pos[t], ay = pos[t + 4] - pos[t + 1], az = pos[t + 5] - pos[t + 2];
    const bx = pos[t + 6] - pos[t], by = pos[t + 7] - pos[t + 1], bz = pos[t + 8] - pos[t + 2];
    if (az * bx - ax * bz >= 0) continue;      // y component of a × b
    for (let k = 0; k < 3; k++) {
      const s = pos[t + 3 + k]; pos[t + 3 + k] = pos[t + 6 + k]; pos[t + 6 + k] = s;
      const c = col[t + 3 + k]; col[t + 3 + k] = col[t + 6 + k]; col[t + 6 + k] = c;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  mesh.receiveShadow = quality.shadowMapSize > 0;
  mesh.frustumCulled = false;
  mesh.name = 'streets';
  return mesh;
}

function polylineLength(pts) {
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return d;
}

/**
 * What holds a bridge up.
 *
 * The surveyed graph says where a crossing is and at what class; the deck is
 * worked out from its banks. Nothing said what was under it, so every real
 * bridge on every map was a ribbon of tarmac lying in the air over the water
 * with a shadow on the river and no structure at all — which is what "some
 * roads are floating with no supports" was.
 *
 * Piers to the bed at a spacing the class can span, an abutment where the deck
 * meets each bank, and a parapet down both sides so the deck has an edge. It is
 * not a cable-stayed anything; it is the shape every road bridge shares, and at
 * the distance these are seen that is the whole of what reads.
 */
export function buildDecks(net, terrain, quality) {
  const g = new THREE.Group();
  g.name = 'decks';
  // Only the crossings that could not be made into a proper bridge — a run
  // that genuinely curves, or one that never reaches a bank. Anything that
  // could be straightened is built with arches by `buildBridge` instead.
  const spans = net.edges.filter((e) => (e.bridge || e.bank) && !e.arched);
  if (!spans.length) return g;

  const piers = [];
  const deckParts = [];
  const rails = [];

  for (const e of spans) {
    const c = ROAD_CLASS[e.cls] || ROAD_CLASS.street;
    const half = c.road / 2 + c.pave + c.kerb;
    // A masonry arch spans about its own rise; a modern girder does more. Thirty
    // metres is the honest middle and it is what the eye counts.
    const SPACING = 30;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i], b = e.pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const ry = Math.atan2(-dz, dx);
      const y = ((a.y ?? 0) + (b.y ?? 0)) / 2;

      // The deck itself: a slab under the carriageway, so it has a thickness
      // seen from the side and from beneath.
      deckParts.push(box(len + 0.6, 1.5, half * 2 + 0.8, (a.x + b.x) / 2,
        y - 1.0, (a.z + b.z) / 2, ry));
      // And a parapet down each side.
      for (const sgn of [-1, 1]) {
        const nx = -dz / len * sgn * (half + 0.2), nz = dx / len * sgn * (half + 0.2);
        rails.push(box(len + 0.6, 1.1, 0.5, (a.x + b.x) / 2 + nx,
          y + 0.55, (a.z + b.z) / 2 + nz, ry));
      }

      // Piers, where there is water or a drop under the deck.
      const n = Math.max(1, Math.round(len / SPACING));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const px = a.x + dx * t, pz = a.z + dz * t;
        const gy = terrain.heightAt(px, pz);
        const drop = y - 1.75 - gy;
        if (drop < 1.0) continue;             // it is on the ground here
        piers.push(box(6.2, drop, half * 1.1, px, gy + drop / 2, pz, ry));
      }
    }
    // Abutments: the deck has to land on something at each end.
    for (const k of [e.a, e.b]) {
      const n2 = net.nodes[k];
      if (!n2) continue;
      const gy = terrain.heightAt(n2.x, n2.z);
      const drop = (n2.y ?? gy) - 1.75 - gy;
      if (drop < 1.2) continue;
      piers.push(box(half * 2.2, drop + 1.0, 10, n2.x, gy + (drop + 1.0) / 2, n2.z, 0));
    }
  }

  const shadows = quality.shadowMapSize > 0;
  const add = (parts, colour, roughness) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(parts, false),
      new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0.02 }),
    );
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = false;
    g.add(mesh);
  };
  add(deckParts, 0x8b8377, 0.95);
  add(piers, 0x8f8778, 0.96);
  add(rails, 0xb6ae9c, 0.9);
  return g;
}

function box(w, h, d, x, y, z, ry = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}

function endWeight(i, last) {
  const t = i / last;
  if (t < 0.2) return 1 - t / 0.2;
  if (t > 0.8) return (t - 0.8) / 0.2;
  return 0;
}

/** Triangle fan from the centre of a junction out to its paved outline. */
function fan(ring, n, y, colour, vert, dry) {
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    if (dry && (!dry(p) || !dry(q))) continue;
    vert(n.x, n.z, y, colour);
    vert(p.x, p.z, y, colour);
    vert(q.x, q.z, y, colour);
  }
}

/** Where two lines (point + direction) cross, or null if they are parallel. */
function intersect(p1, d1, p2, d2) {
  const den = d1.x * d2.z - d1.z * d2.x;
  if (Math.abs(den) < 1e-4) return null;
  const t = ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / den;
  return { x: p1.x + d1.x * t, z: p1.z + d1.z * t };
}

/**
 * A block's usable ground: its own four corners, pulled in behind the kerbs.
 *
 * The single most visible fault in the old city came from not having this.
 * Every surface inside a block — the garden square's lawn, the car park's
 * tarmac, the yard behind a terrace — was built from the block's *axis-aligned
 * bounding box*: a rectangle square to the map, laid flat at one height, on a
 * plan turned thirteen degrees off the map's axes. So each one sat at an angle
 * to the block it belonged to, overhung the pavement at two corners, and either
 * buried itself in the hill or hung off it. From above that is a field of
 * mismatched green and grey rectangles, which is exactly what it looked like.
 *
 * The corners here are the intersections of the four kerb lines, so the surface
 * is the shape of the block, at the angle of the block, ending where the
 * pavement begins.
 */
export function blockInterior(b, extra = 0) {
  const lines = [];
  for (let s = 0; s < 4; s++) {
    const p = b.poly[s], q = b.poly[(s + 1) % 4];
    const dx = q.x - p.x, dz = q.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / len, z: dz / len };
    let nx = -dir.z, nz = dir.x;
    if ((b.x - p.x) * nx + (b.z - p.z) * nz < 0) { nx = -nx; nz = -nz; }
    const off = halfWidth(b.sides[s]) + extra;
    lines.push({ p: { x: p.x + nx * off, z: p.z + nz * off }, d: dir });
  }
  const out = [];
  for (let k = 0; k < 4; k++) {
    const a = lines[(k + 3) % 4], c = lines[k];
    out.push(intersect(a.p, a.d, c.p, c.d) || { x: b.poly[k].x, z: b.poly[k].z });
  }
  return out;
}

/**
 * A local frame for a quad: where its middle is, which way it runs, and how big
 * it is. Everything placed inside a block — bays, paths, railings, beds — is
 * laid out in this frame instead of in world axes, which is what stops a car
 * park's white lines running diagonally across the car park.
 */
export function quadFrame(quad) {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cz = (quad[0].z + quad[1].z + quad[2].z + quad[3].z) / 4;
  const ex = (quad[1].x - quad[0].x + quad[2].x - quad[3].x) / 2;
  const ez = (quad[1].z - quad[0].z + quad[2].z - quad[3].z) / 2;
  const fx = (quad[3].x - quad[0].x + quad[2].x - quad[1].x) / 2;
  const fz = (quad[3].z - quad[0].z + quad[2].z - quad[1].z) / 2;
  const w = Math.hypot(ex, ez), d = Math.hypot(fx, fz);
  // `yaw` turns +Z onto the block's first edge, matching how the buildings in
  // the block are oriented, so a slab and the terrace in front of it agree.
  return { cx, cz, w, d, yaw: Math.atan2(ex, ez) };
}

/** Bilinear point inside a quad, u along edge 0→1, v along edge 0→3. */
export function quadPoint(quad, u, v) {
  const ax = quad[0].x + (quad[1].x - quad[0].x) * u;
  const az = quad[0].z + (quad[1].z - quad[0].z) * u;
  const bx = quad[3].x + (quad[2].x - quad[3].x) * u;
  const bz = quad[3].z + (quad[2].z - quad[3].z) * u;
  return { x: ax + (bx - ax) * v, z: az + (bz - az) * v };
}

/** Cut `from` metres off the start of a polyline and `to` off the end. */
function trimPolyline(pts, from, to) {
  const total = polyLength(pts);
  if (total <= from + to + 1) return [];
  const out = [];
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    const s0 = walked, s1 = walked + seg;
    walked = s1;
    const lo = Math.max(from, s0), hi = Math.min(total - to, s1);
    if (hi <= lo) continue;
    const t0 = (lo - s0) / seg, t1 = (hi - s0) / seg;
    // Carry the height across the cut. A bridge's polyline *is* its running
    // surface, so a trim that drops `y` puts the deck back on the riverbed.
    const at = (t) => {
      const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (a.y !== undefined && b.y !== undefined) q.y = a.y + (b.y - a.y) * t;
      return q;
    };
    if (!out.length) out.push(at(t0));
    out.push(at(t1));
  }
  return out;
}

function polyLength(pts) {
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return d;
}

// ────────────────────────────────────────────────────────────── markings ──

/**
 * Paint. Centre lines, crossings, stop lines and parking bays.
 *
 * All of it hangs off the network, so a crossing is always at a junction and
 * always across the carriageway rather than wherever a fixed-pitch loop
 * happened to put it.
 */
export function addStreetMarkings(props, net, terrain, rng, dense = 1) {
  const counts = { dashes: 0, crossings: 0, stopLines: 0, bays: 0 };
  const white = 0xd9d5c8;

  // Paint sits on the road, and the road is not the terrain.
  //
  // Every marking used to be laid at `heightAt(x, z) + 0.30`, which is right in
  // the middle of a street and wrong at every junction: a junction pad is a flat
  // slab at its own node's height, so on any slope the paint either sank into it
  // or floated over it. Box junctions came out as a scatter of yellow strips at
  // assorted heights, which is what "whatever the hell happened with the
  // intersections" was looking at.
  const paint = (x, z, w, d, ry, colour = white, y = null) => {
    const g = new THREE.BoxGeometry(w, 0.06, d);
    g.rotateY(ry);
    g.translate(x, (y ?? terrain.heightAt(x, z) + SURFACE_LIFT) + 0.08, z);
    props.add('markings', g, colour, 1);
  };

  for (const e of net.edges) {
    const c = ROAD_CLASS[e.cls];
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const line = trimPolyline(e.pts, padRadius(a) + 3, padRadius(b) + 3);
    if (line.length < 2) continue;

    // Centre line, dashed, on anything wide enough to have two lanes.
    if (c.dashes) {
      walkPolyline(line, 9 / dense, (x, z, dir) => {
        paint(x, z, 0.32, 3.4, Math.atan2(dir.x, dir.z));
        counts.dashes++;
      });
    }
    // Parking bays: a broken line just inside the kerb, which from above reads
    // as the cars that are not there.
    if (e.cls !== 'mews' && rng() < 0.5 * dense) {
      const side = rng() < 0.5 ? 1 : -1;
      walkPolyline(line, 13 / dense, (x, z, dir) => {
        const nx = -dir.z * side, nz = dir.x * side;
        paint(x + nx * (c.road / 2 - 0.5), z + nz * (c.road / 2 - 0.5),
          0.2, 4.6, Math.atan2(dir.x, dir.z), 0xd8c96a);
        counts.bays++;
      });
    }
  }

  // Crossings and stop lines on the approach to every real junction.
  for (const n of net.nodes) {
    if (n.links.length < 3) continue;
    const y = n.y + SURFACE_LIFT;
    // A crossing is a thing a town council pays for, not a decoration.
    //
    // Every junction of three arms or more used to get a zebra on every arm
    // whose carriageway was seven metres wide, which on a surveyed plan is
    // nearly every junction and nearly every arm: a hundred and ninety-four
    // junctions, five hundred-odd ladders of white paint, and London seen from
    // above read as a lattice of crossings with a city faintly behind it. The
    // markings were louder than the streets they were painted on.
    //
    // Two rules cut it to what a place actually has. A crossing goes where a
    // main road is involved — an avenue arm, or four arms meeting — because
    // that is where somebody has to be stopped to let somebody else over. And
    // it goes on the two busiest arms at most, not on all five: a junction with
    // a zebra on every approach is a pedestrianised square, and there are two
    // of those in this city, not two hundred.
    const hasMain = n.links.some((l) => l.edge.cls === 'avenue');
    if (!hasMain && n.links.length < 4) continue;
    const arms = n.links
      .map((l) => ({ l, w: ROAD_CLASS[l.edge.cls].road, dir: linkDir(n, l) }))
      .filter((a) => a.w >= 8)
      .sort((a, b) => b.w - a.w);
    const done = [];
    for (const arm of arms) {
      if (done.length >= 2) break;
      const c = ROAD_CLASS[arm.l.edge.cls];
      const dir = arm.dir;
      let clash = false;
      for (const d of done) {
        if (d.x * dir.x + d.z * dir.z > 0.82) { clash = true; break; }   // within ~35°
      }
      if (clash) continue;
      done.push(dir);
      const r = padRadius(n) + 2.6;
      const ry = Math.atan2(dir.x, dir.z);
      // Zebra: stripes across the carriageway, running with the road, and
      // strictly inside it — the last version spread them over the full road
      // width measured centre to centre, so the outer two overhung the kerb.
      // Wider bars and fewer of them: at playing distance a fine comb of paint
      // dissolves into a grey smear, and a real zebra is half stripe, half gap.
      const usable = c.road - 2.2;
      const stripes = Math.max(3, Math.round(usable / 2.6));
      for (let s = 0; s < stripes; s++) {
        const f = (s / (stripes - 1) - 0.5) * usable;
        paint(n.x + dir.x * r - dir.z * f, n.z + dir.z * r + dir.x * f,
          0.72, 2.6, ry, white, y);
      }
      counts.crossings++;
      // Stop line, on the far side of the crossing from the junction.
      const sr = r + 2.6;
      paint(n.x + dir.x * sr, n.z + dir.z * sr, c.road - 1.0, 0.4, ry, white, y);
      counts.stopLines++;
    }

    // Yellow box junction on the busiest crossings.
    //
    // Drawn as a box, which it was not before: five diagonals each way, spaced
    // by a fixed fraction of the junction and given a length by eye, with no
    // border and nothing holding them to a shape. From above that is a loose
    // yellow lattice lying across the crossroads — a scribble.
    //
    // A real one is a rectangle with a hatch inside it. Both are exact here: the
    // border is four strips round the square, and each diagonal is cut to the
    // chord it actually makes across that square, which for a 45° line at
    // perpendicular offset `o` from the centre of a square of half-size h is
    // 2(h√2 − |o|) long, centred at the point o along the other diagonal. So the
    // hatch ends at the border rather than running off down the street.
    // Only where two through routes genuinely cross.
    //
    // "Two avenue arms and three streets" described ninety-five of two hundred
    // and thirty-three junctions, which is not a box junction, it is a paint
    // scheme. A real one is at a crossroads where two main roads meet — so both
    // avenue arms have to run *opposite* each other, making one road that
    // carries on through, and there have to be four arms for it to be crossed
    // by. That leaves a handful, at the crossings that deserve them.
    const avArms = n.links.filter((l) => l.edge.cls === 'avenue');
    let crosses = false;
    for (let i = 0; i < avArms.length && !crosses; i++) {
      for (let j = i + 1; j < avArms.length; j++) {
        const p = linkDir(n, avArms[i]), q = linkDir(n, avArms[j]);
        if (p.x * q.x + p.z * q.z < -0.9) { crosses = true; break; }
      }
    }
    const avenues = crosses ? avArms.length : 0;
    if (avenues >= 2 && n.links.length >= 4) {
      const narrow = Math.min(...n.links.map((l) => ROAD_CLASS[l.edge.cls].road));
      const h = Math.min(padRadius(n) * 0.9, narrow * 0.92) / 2;
      const main = n.links.find((l) => l.edge.cls === 'avenue');
      const dir = linkDir(n, main);
      const base = Math.atan2(dir.x, dir.z);
      const YEL = 0xc8a13a;
      // Local axes: `u` along the main avenue, `v` across it.
      const ux = dir.x, uz = dir.z;
      const vx = -dir.z, vz = dir.x;
      const at = (u, v) => [n.x + ux * u + vx * v, n.z + uz * u + vz * v];
      // Border.
      for (const s of [-1, 1]) {
        let [bx, bz] = at(s * h, 0);
        paint(bx, bz, h * 2, 0.26, base, YEL, y);
        [bx, bz] = at(0, s * h);
        paint(bx, bz, 0.26, h * 2, base, YEL, y);
      }
      // Hatch, both diagonals, each clipped to the square.
      const diag = h * Math.SQRT2;
      const step = Math.max(2.0, diag / 3.2);
      for (let o = -diag + step * 0.5; o < diag; o += step) {
        const len = 2 * (diag - Math.abs(o));
        if (len < 1.2) continue;
        for (const s of [1, -1]) {
          // Offset point along the opposite diagonal.
          const [px, pz] = at(o / Math.SQRT2, -s * o / Math.SQRT2);
          paint(px, pz, 0.22, len, base + s * Math.PI / 4, YEL, y);
        }
      }
      counts.hatching = (counts.hatching || 0) + 1;
    }
  }

  // Patches of resurfaced road: a slightly different asphalt, laid over the
  // old. The cheapest possible cure for a perfectly uniform carriageway, and
  // at this range one of the most effective.
  counts.patches = 0;
  for (const e of net.edges) {
    if (rng() > 0.45) continue;
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const line = trimPolyline(e.pts, padRadius(a) + 4, padRadius(b) + 4);
    if (line.length < 2) continue;
    const c = ROAD_CLASS[e.cls];
    walkPolyline(line, 60, (x, z, dir) => {
      const w = 2.2 + rng() * (c.road - 2.5);
      const d = 3 + rng() * 7;
      const off = (rng() - 0.5) * (c.road - w);
      paint(x - dir.z * off, z + dir.x * off, w, d, Math.atan2(dir.x, dir.z),
        rng() < 0.5 ? 0x3d4046 : 0x2c2f34);
      counts.patches++;
    });
  }
  return counts;
}

/** Call `cb` every `spacing` metres along a polyline, with the local direction. */
function walkPolyline(pts, spacing, cb) {
  let carry = spacing * 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    const dir = { x: dx / len, z: dz / len };
    for (let s = carry; s < len; s += spacing) {
      cb(a.x + dir.x * s, a.z + dir.z * s, dir);
    }
    carry = Math.max(0, carry + Math.ceil((len - carry) / spacing) * spacing - len);
  }
}

// ───────────────────────────────────────────────────────────── furniture ──

/**
 * Everything that stands at the kerb.
 *
 * Driving this off the network rather than off the buildings is what puts a
 * lamp post on the pavement instead of in the middle of a garden, and lets the
 * spacing be a real rhythm down the street — which is what the eye reads at
 * this range, far more than any single object.
 */
export function addNetworkFurniture(props, net, terrain, rng, dense) {
  const counts = { lamps: 0, streetTrees: 0, parked: 0, signals: 0, bollards: 0,
    busStops: 0, hydrants: 0, bins: 0 };
  const CAR_COLOURS = [0x9aa3ad, 0x2f3a45, 0x8c3a32, 0x3d5a46, 0xb8b2a4, 0x24303a];

  for (const e of net.edges) {
    const c = ROAD_CLASS[e.cls];
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const line = trimPolyline(e.pts, padRadius(a) + 2, padRadius(b) + 2);
    if (line.length < 2) continue;
    let flip = 1;

    // Lamps, alternating sides down the street.
    walkPolyline(line, c.lamp / dense, (x, z, dir) => {
      flip = -flip;
      const off = (c.road / 2 + c.pave * 0.55) * flip;
      const px = x - dir.z * off, pz = z + dir.x * off;
      if (terrain.isWater(px, pz)) return;
      const y = terrain.heightAt(px, pz);
      const post = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 5);
      post.translate(px, y + 3.2, pz);
      props.add('dark', post, 0x2b3138, 1);
      const arm = new THREE.BoxGeometry(0.9, 0.16, 0.24);
      arm.rotateY(Math.atan2(dir.x, dir.z));
      arm.translate(px - dir.z * off * 0.12, y + 6.4, pz + dir.x * off * 0.12);
      props.add('dark', arm, 0x2b3138, 1);
      const head = new THREE.BoxGeometry(0.7, 0.22, 0.34);
      head.translate(px, y + 6.5, pz);
      props.add('paint', head, 0xd9d2bd, 1);
      counts.lamps++;
    });

    // Street trees line the avenues. Nothing says "boulevard" faster.
    //
    // On a surveyed plan the ordinary streets get them too, thinner. Which of
    // the world's roads land in our "avenue" bucket is the world's business,
    // not ours: Agra's whole map holds a handful of them, so planting only
    // there gives a city with thirteen trees in it, while the real place is
    // lined with them along everything wider than a lane.
    const treeEvery = c.trees ? 19 / dense
      : (net.real && e.cls === 'street' ? 33 / dense : 0);
    if (treeEvery > 0) {
      walkPolyline(line, treeEvery, (x, z, dir) => {
        const side = rng() < 0.5 ? 1 : -1;
        const off = (c.road / 2 + c.pave * 0.5) * side;
        const px = x - dir.z * off, pz = z + dir.x * off;
        if (terrain.isWater(px, pz)) return;
        const y = terrain.heightAt(px, pz);
        const h = 6 + rng() * 3.4;
        const trunk = new THREE.CylinderGeometry(0.16, 0.24, h * 0.46, 5);
        trunk.translate(px, y + h * 0.23, pz);
        props.add('dark', trunk, 0x5a4432, 0.9 + rng() * 0.25);
        const crown = new THREE.SphereGeometry(h * 0.31, 6, 5);
        crown.scale(1, 0.82, 1);
        crown.translate(px, y + h * 0.72, pz);
        props.add('foliage', crown, 0x4a7a32, 0.78 + rng() * 0.44);
        // A tree pit in the pavement: a square of dark earth with a grate.
        const pit = new THREE.BoxGeometry(1.5, 0.08, 1.5);
        pit.translate(px, y + 0.27, pz);
        props.add('dark', pit, 0x3a332a, 1);
        counts.streetTrees++;
      });
    }

    // Parked cars, nose to tail along the kerb, aligned with the street. Kept
    // well back from the junction: nobody parks on a crossing.
    if (e.cls !== 'mews') {
      const parking = trimPolyline(e.pts, padRadius(a) + 10, padRadius(b) + 10);
      if (parking.length >= 2) walkPolyline(parking, 7.5 / dense, (x, z, dir) => {
        if (rng() > 0.5 * dense + 0.2) return;
        const side = rng() < 0.5 ? 1 : -1;
        const off = (c.road / 2 - 1.15) * side;
        const px = x - dir.z * off, pz = z + dir.x * off;
        if (terrain.isWater(px, pz)) return;
        const y = terrain.heightAt(px, pz);
        const ry = Math.atan2(dir.x, dir.z);
        const body = new THREE.BoxGeometry(1.86, 0.92, 4.3);
        body.rotateY(ry); body.translate(px, y + 0.62, pz);
        props.add('paint', body, CAR_COLOURS[Math.floor(rng() * CAR_COLOURS.length)], 0.85 + rng() * 0.3);
        const cabin = new THREE.BoxGeometry(1.7, 0.66, 2.2);
        cabin.rotateY(ry); cabin.translate(px, y + 1.34, pz);
        props.add('glass', cabin, 0x59626b, 1);
        counts.parked++;
      });
    }
  }

  // Junction kit: signals on the big crossings, bollards on the corners.
  for (const n of net.nodes) {
    const ways = n.links.length;
    if (!ways) continue;
    const y = n.y;
    const major = n.links.filter((l) => l.edge.cls === 'avenue').length >= 2;
    for (const l of n.links) {
      const dir = linkDir(n, l);
      const c = ROAD_CLASS[l.edge.cls];
      const r = padRadius(n) + 1.2;
      const side = c.road / 2 + c.pave * 0.6;
      for (const s of [-1, 1]) {
        const px = n.x + dir.x * r - dir.z * side * s;
        const pz = n.z + dir.z * r + dir.x * side * s;
        if (terrain.isWater(px, pz)) continue;
        const gy = terrain.heightAt(px, pz);
        if (major && ways >= 3 && s > 0) {
          const post = new THREE.CylinderGeometry(0.1, 0.12, 3.6, 5);
          post.translate(px, gy + 1.8, pz);
          props.add('dark', post, 0x2b3138, 1);
          const box = new THREE.BoxGeometry(0.34, 0.9, 0.3);
          box.rotateY(Math.atan2(dir.x, dir.z));
          box.translate(px, gy + 4.0, pz);
          props.add('dark', box, 0x23282d, 1);
          for (let k = 0; k < 3; k++) {
            const lens = new THREE.SphereGeometry(0.1, 5, 4);
            lens.translate(px, gy + 4.3 - k * 0.28, pz - 0.17);
            props.add('paint', lens, [0xd14b3a, 0xd7b23c, 0x4fa85a][k], 1);
          }
          counts.signals++;
        } else if (rng() < 0.5) {
          const b = new THREE.CylinderGeometry(0.13, 0.15, 0.95, 6);
          b.translate(px, gy + 0.48, pz);
          props.add('dark', b, 0x3b4148, 1);
          counts.bollards++;
        }
      }
    }
    // A bus stop on some of the through routes.
    if (major && rng() < 0.25) {
      const l = n.links[Math.floor(rng() * n.links.length)];
      const dir = linkDir(n, l);
      const off = ROAD_CLASS[l.edge.cls].road / 2 + 2.2;
      const px = n.x + dir.x * (padRadius(n) + 9) - dir.z * off;
      const pz = n.z + dir.z * (padRadius(n) + 9) + dir.x * off;
      if (!terrain.isWater(px, pz)) {
        const gy = terrain.heightAt(px, pz);
        const ry = Math.atan2(dir.x, dir.z);
        const roof = new THREE.BoxGeometry(4.2, 0.16, 1.7);
        roof.rotateY(ry); roof.translate(px, gy + 2.6, pz);
        props.add('metal', roof, 0x8e949a, 1);
        const back = new THREE.BoxGeometry(4.2, 2.4, 0.1);
        back.rotateY(ry); back.translate(px - Math.cos(ry) * 0.8, gy + 1.3, pz + Math.sin(ry) * 0.8);
        props.add('glass', back, 0x76838c, 1);
        counts.busStops++;
      }
    }
    if (rng() < 0.3) {
      const px = n.x + (rng() - 0.5) * 4, pz = n.z + (rng() - 0.5) * 4;
      const gy = terrain.heightAt(px, pz);
      const bin = new THREE.CylinderGeometry(0.33, 0.28, 1.0, 7);
      bin.translate(px + padRadius(n) * 0.9, gy + 0.5, pz);
      props.add('dark', bin, 0x3f4640, 1);
      counts.bins++;
    }

    // A street name plate on one corner, and guard rails on the busy ones so
    // the junction has something standing at it besides the signals.
    if (n.links.length >= 3 && rng() < 0.45) {
      const l = n.links[Math.floor(rng() * n.links.length)];
      const dir = linkDir(n, l);
      const off = ROAD_CLASS[l.edge.cls].road / 2 + 2.0;
      const px = n.x + dir.x * (padRadius(n) + 1.5) - dir.z * off;
      const pz = n.z + dir.z * (padRadius(n) + 1.5) + dir.x * off;
      if (!terrain.isWater(px, pz)) {
        const gy = terrain.heightAt(px, pz);
        const ry = Math.atan2(dir.x, dir.z);
        const post = new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5);
        post.translate(px, gy + 1.2, pz);
        props.add('dark', post, 0x50565c, 1);
        const plate = new THREE.BoxGeometry(1.15, 0.3, 0.05);
        plate.rotateY(ry); plate.translate(px, gy + 2.3, pz);
        props.add('paint', plate, 0xe6e2d6, 1);
        counts.signs = (counts.signs || 0) + 1;
      }
    }
    if (major && n.links.length >= 3) {
      for (const l of n.links) {
        const dir = linkDir(n, l);
        const c = ROAD_CLASS[l.edge.cls];
        for (const sgn of [-1, 1]) {
          if (rng() > 0.4) continue;
          for (let k = 0; k < 4; k++) {
            const along = padRadius(n) + 3 + k * 1.3;
            const off = (c.road / 2 + 0.5) * sgn;
            const px = n.x + dir.x * along - dir.z * off;
            const pz = n.z + dir.z * along + dir.x * off;
            if (terrain.isWater(px, pz)) continue;
            const gy = terrain.heightAt(px, pz);
            const rail = new THREE.BoxGeometry(0.08, 1.05, 1.25);
            rail.rotateY(Math.atan2(dir.x, dir.z));
            rail.translate(px, gy + 0.55, pz);
            props.add('metal', rail, 0x9aa0a6, 1);
            counts.guardRails = (counts.guardRails || 0) + 1;
          }
        }
      }
    }
  }

  // Drainage: a gully at the kerb every so often, and a manhole in the
  // carriageway. Both are flat and tiny and both are visible from straight
  // above, which is where this game is played from.
  counts.drains = 0;
  for (const e of net.edges) {
    const c = ROAD_CLASS[e.cls];
    const a = net.nodes[e.a], b = net.nodes[e.b];
    const line = trimPolyline(e.pts, padRadius(a) + 3, padRadius(b) + 3);
    if (line.length < 2) continue;
    walkPolyline(line, 34 / dense, (x, z, dir) => {
      const side = rng() < 0.5 ? 1 : -1;
      const off = (c.road / 2 - 0.35) * side;
      const px = x - dir.z * off, pz = z + dir.x * off;
      if (terrain.isWater(px, pz)) return;
      const gy = terrain.heightAt(px, pz);
      const gully = new THREE.BoxGeometry(0.5, 0.06, 0.8);
      gully.rotateY(Math.atan2(dir.x, dir.z));
      gully.translate(px, gy + 0.3, pz);
      props.add('markings', gully, 0x25282c, 1);
      counts.drains++;
      if (rng() < 0.45) {
        const mx = x + (rng() - 0.5) * c.road * 0.5;
        const mz = z + (rng() - 0.5) * c.road * 0.5;
        const cover = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 8);
        cover.translate(mx, terrain.heightAt(mx, mz) + 0.3, mz);
        props.add('markings', cover, 0x33373c, 1);
        counts.drains++;
      }
    });
  }
  return counts;
}
