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

  for (const e of data.edges) {
    if (!Array.isArray(e.pts) || e.pts.length < 2) continue;
    const pts = e.pts.map((p) => ({ x: p[0], z: p[1], y: terrain.heightAt(p[0], p[1]) }));
    if (!e.bridge && !pts.every((p) => dry(p.x, p.z))) continue;
    // A street through the middle of the landmark is a street through the
    // middle of the landmark whoever surveyed it: the precinct is the game's,
    // not the city's, and the monument is standing where the road was.
    if (exclude > 0 && pts.some((p) => Math.hypot(p.x, p.z) < exclude)) continue;
    if (reserved.length && pts.some((p) => inReserved(p.x, p.z))) continue;
    const a = nodes[e.a], b = nodes[e.b];
    if (!a || !b || a === b) continue;
    const edge = { a: e.a, b: e.b, cls: e.cls || 'street', pts };
    // Both flags, and they mean different things downstream: `bridge` is what
    // makes the road surface follow the deck's own height and lay tarmac over
    // water at all, and `bank` is what stops the dissolve pass straightening a
    // crossing into the street it meets.
    if (e.bridge) { edge.bridge = true; edge.bank = true; }
    edges.push(edge);
    a.links.push({ other: e.b, edge, at: 0 });
    b.links.push({ other: e.a, edge, at: 1 });
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

  layDecks(edges, nodes, terrain);
  dissolveThroughNodes(nodes, edges);

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
    let deck = Math.max(run.bank, terrain.waterLevel + 6);
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
