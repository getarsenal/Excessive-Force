import { buildEdgeIndex, dissolveThroughNodes, GRID_YAW } from './streets.js';

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

  landBridges(edges, nodes, terrain);
  layDecks(edges, nodes, terrain);
  dissolveThroughNodes(nodes, edges, { surveyed: true });

  const net = {
    nodes, edges, blocks,
    pitch: 104, reach: terrain.span * 0.94,
    real: true,
    debug: { source: 'overture', streets: edges.length, blocks: blocks.length },
  };
  buildEdgeIndex(net);
  return net;
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
 * Put every bridge on a deck.
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
 * An ordinary crossing takes the higher of its two banks, six metres clear of
 * the water at worst: that is Westminster Bridge and every other street that
 * happens to have water under it. A long crossing cannot. It is not a street
 * with a river beneath it, it is a span, and a span is high or it is not
 * buildable: the Harbour Bridge carries its deck forty-nine metres over the
 * water for half a kilometre, and laid flat at six it reads as a causeway
 * cutting the harbour in two. Past four hundred metres of open water the deck
 * is lifted on the length of the crossing. That number is a guess where every
 * other number in this file is surveyed, and it is a better guess than the
 * causeway.
 */
function layDecks(edges, nodes, terrain) {
  const bridges = edges.filter((e) => e.bank);
  if (!bridges.length) return;

  // Weld the pieces: union-find over the nodes a bridge edge touches.
  const parent = new Map();
  const find = (k) => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(k) !== r) { const n = parent.get(k); parent.set(k, r); k = n; }
    return r;
  };
  for (const e of bridges) {
    for (const k of [e.a, e.b]) if (!parent.has(k)) parent.set(k, k);
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const runs = new Map();
  for (const e of bridges) {
    const key = find(e.a);
    let run = runs.get(key);
    if (!run) runs.set(key, run = { edges: [], wet: 0, bank: -Infinity });
    run.edges.push(e);
    for (let i = 0; i < e.pts.length - 1; i++) {
      const p = e.pts[i], q = e.pts[i + 1];
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      if (terrain.isWater(mx, mz)) run.wet += Math.hypot(q.x - p.x, q.z - p.z);
      else run.bank = Math.max(run.bank, p.y, q.y);
    }
  }

  for (const run of runs.values()) {
    // Level with the road that joins it.
    //
    // Six metres over the water was a floor, and on the Thames — whose surface
    // the DEM puts at 1.9 m and whose embankment stands at 5 — it is three
    // metres *above* both banks. The deck then hung over the approach at each
    // end and Westminster Bridge read as a slab of tarmac floating in the
    // river, joined to nothing. A bridge is level with what it carries: it
    // takes the higher bank, and only clears the water by three metres where
    // there is no bank to take.
    let deck = Math.max(run.bank, terrain.waterLevel + 3.0);
    if (run.wet > 400) {
      deck = Math.max(deck, terrain.waterLevel + Math.min(50, run.wet * 0.09));
    }
    for (const e of run.edges) {
      for (const p of e.pts) p.y = deck;
      for (const k of [e.a, e.b]) if (nodes[k]) nodes[k].y = deck;
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
