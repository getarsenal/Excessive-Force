import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Surrounding London.
 *
 * None of this is destructible — it exists so the Elizabeth Tower reads as
 * standing in a city rather than alone on a plain, and so the mid-distance has
 * something in it before the fog takes over. Everything is merged into a
 * handful of geometries, so the entire skyline is a few draw calls and costs
 * nothing against the physics budget.
 *
 * Layout is placed by hand from the real map: Westminster Bridge crossing the
 * river to the north-east, the Victoria Embankment opposite, Parliament Square
 * to the west, and blocks of period terraces filling the rest.
 */

// Shared with the OSM city builder, so the fallback layout and the real
// footprints are the same city rather than two different ones.
import { FACADE_PALETTE as PALETTE, ROOF_PALETTE as ROOF } from './city.js';
import { valueNoise } from './terrain.js';
import { PropSet, MATERIALS, cyl, addStreetFurniture, addBuildingDetail,
  addRiverEdge, addRoofAndFrontage } from './detail.js';
import { buildPrecinct, buildOutskirts, fillOpenBlock, buildHorizon,
  buildRailway, BLOCK_PROGRAMMES } from './places.js';
import { buildStreetNetwork, buildStreetSurface, addStreetMarkings,
  addNetworkFurniture, halfWidth, blockInterior, quadFrame, quadPoint,
  GRID_YAW, ROAD_CLASS, SURFACE_LIFT } from './streets.js';

export function buildContext(terrain, quality, opts = {}) {
  const group = new THREE.Group();
  group.name = 'context';

  const rng = mulberry32(0x7e57c0de);
  const bodies = [];
  const roofs = [];

  const push = (arr, geo, x, y, z, ry) => {
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    arr.push(geo);
  };

  /**
   * Every building's footprint, kept so nothing is laid on top of anything
   * else and so the game can find the roofs later.
   * @type {Array<{x:number,z:number,w:number,d:number,h:number,top:number}>}
   */
  const plots = [];

  const reach = terrain.span * 0.94;
  const dense = quality.groundClutter ? 1.0 : 0.55;
  // The landmark's own precinct.
  //
  // Eighty metres of radius is a hundred and sixty of bare paving with a
  // building in the middle of it, which from above reads as a car park with a
  // monument parked on it. Sixty-six brings the city up to the edge of the
  // square, which is where a city stands in relation to a landmark.
  // A level whose landmark is a quarter of a kilometre across says so through
  // `contextExclude`: Giza keeps the whole plateau clear, because a pyramid
  // with a terrace of houses against its casing is not Giza.
  //
  // Deliberately *not* `cityExcludeRadius`, which belongs to the baked-OSM
  // path. Wiring that one through here instead moved Westminster's exclusion
  // from 66 m to 150 m, which reshapes the entire street network — and took
  // four assertions down with it, none of which looked like they had anything
  // to do with the city.
  const EXCLUDE = opts.exclude || 66;
  const DOWNTOWN = opts.downtown || null;

  // ── The bridge comes first, because the street network has to know where it
  // lands: a crossing with no road to it is the thing that made the old layout
  // read as scenery rather than as a place.
  const bridge = bridgeLine(terrain, EXCLUDE);

  /**
   * The civic set, placed by hand from the real map — Parliament Square, the
   * abbey, the government blocks. These are reserved before the network is
   * laid, so the streets grow *around* them the way they do in a real city.
   */
  const CIVIC = [
    { x: -88, z: 6, w: 46, d: 34, h: 26 },
    { x: -92, z: -52, w: 40, d: 40, h: 22 },
    { x: -150, z: 30, w: 54, d: 44, h: 30 },
    { x: -58, z: 96, w: 38, d: 52, h: 24 },
    { x: -140, z: -70, w: 48, d: 36, h: 28 },
    { x: -196, z: -20, w: 44, d: 58, h: 26 },
    // Westminster Abbey stand-in: a long nave with towers at the west front.
    { x: -128, z: 118, w: 30, d: 86, h: 26 },
    { x: -128, z: 78, w: 42, d: 22, h: 34 },
    { x: -143, z: 72, w: 12, d: 12, h: 52 },
    { x: -113, z: 72, w: 12, d: 12, h: 52 },
    // Portcullis House and the northern blocks.
    { x: -14, z: -104, w: 62, d: 44, h: 30 },
    { x: -96, z: -128, w: 52, d: 40, h: 26 },
    // And enough of a quarter around them that the landmark stands in a city
    // rather than in a field. Anything that clashes with a street or with its
    // neighbours is dropped when it is placed.
    { x: -210, z: 92, w: 46, d: 40, h: 24 },
    { x: -186, z: 152, w: 52, d: 36, h: 22 },
    { x: -74, z: -158, w: 46, d: 40, h: 26 },
    { x: -172, z: -132, w: 44, d: 44, h: 24 },
    { x: -36, z: 158, w: 42, d: 46, h: 22 },
    { x: -244, z: -62, w: 42, d: 50, h: 26 },
    { x: -252, z: 24, w: 40, d: 42, h: 20 },
    { x: -118, z: -18, w: 34, d: 40, h: 28 },
    { x: -60, z: 40, w: 30, d: 36, h: 24 },
    { x: -66, z: -70, w: 34, d: 32, h: 22 },
  ];

  // Only the abbey gets a precinct of its own. Reserving the whole civic set
  // kept the streets out of a quarter of the map and left the landmark
  // standing in a field — so the rest take their chances with the grid, and
  // any of them that a street runs through simply is not built.
  // The landmarks' real footprints, with a margin, kept clear of streets and of
  // buildings alike. A circle round the origin cannot describe two structures
  // of very different shapes sharing one, and using one big enough for the
  // longest of them is what emptied the middle of the map.
  const LANDMARK_PAD = 16;
  const precinct = (opts.landmarks || []).map((l) => ({
    x: l.x, z: l.z, w: l.w + LANDMARK_PAD * 2, d: l.d + LANDMARK_PAD * 2,
  }));
  const inPrecinct = (x, z) => precinct.some(
    (r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2);

  const net = buildStreetNetwork(terrain, rng, {
    pitch: 104, reach, exclude: EXCLUDE, bridge,
    reserved: [...CIVIC.slice(6, 10), ...precinct],
  });

  // ── Where a building may and may not go.
  //
  // Three separate mistakes used to be visible from the opening camera: houses
  // standing in the carriageway, houses hanging over the water on the outside
  // of the river bank, and a row of houses sitting across the end of the
  // bridge. All three are the same failure — placing a box and only asking
  // about the single point at its centre — so all three are answered the same
  // way, by testing the whole footprint.

  /** The four corners and four edge midpoints of a rotated footprint. */
  const footprintPoints = (x, z, w, d, ry) => {
    const ca = Math.cos(ry), sa = Math.sin(ry);
    const pts = [];
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1],
      [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
      const lx = u * w / 2, lz = v * d / 2;
      pts.push({ x: x + lx * ca + lz * sa, z: z - lx * sa + lz * ca });
    }
    return pts;
  };

  /** Dry, well clear of the waterline, all the way round. */
  const onDryLand = (pts) => {
    for (const p of pts) {
      if (terrain.isWater(p.x, p.z)) return false;
      if (terrain.heightAt(p.x, p.z) < terrain.waterLevel + 1.6) return false;
      // And a margin outside the footprint, so nothing overhangs the bank.
      for (let a = 0; a < 4; a++) {
        const th = (a / 4) * Math.PI * 2;
        if (terrain.isWater(p.x + Math.cos(th) * 4.5, p.z + Math.sin(th) * 4.5)) return false;
      }
    }
    return true;
  };

  /** Clear of the carriageway, the pavement and the junction paving. */
  const offStreet = (pts) => {
    for (const p of pts) {
      if (net.roadClearance(p.x, p.z) < 1.0) return false;
      if (net.nodeClearance(p.x, p.z) < 1.0) return false;
    }
    return true;
  };

  /** Clear of the landmarks themselves. */
  const offLandmark = (pts) => {
    if (!precinct.length) return true;
    for (const p of pts) if (inPrecinct(p.x, p.z)) return false;
    return true;
  };

  /** Clear of the bridge and of the ramps at either end of it. */
  const offBridge = (pts) => {
    if (!bridge) return true;
    for (const p of pts) {
      if (distToSegment(p.x, p.z, bridge.far.a, bridge.far.b) < 17) return false;
    }
    return true;
  };

  /**
   * Would this footprint land on one already placed?
   *
   * A proper oriented-box test, not the bounding boxes. Buildings now face the
   * street they were set back from, so a terrace of houses along a road at
   * forty degrees is a row of forty-degree rectangles — and the axis-aligned
   * box round one of those is nearly half again as large as the building,
   * which made every second house in the row reject its neighbour. The
   * separating-axis test is a dozen lines and lets a terrace sit nose to tail
   * the way a terrace should.
   */
  const overlaps = (x, z, w, d, ry, gap = 1.2) => {
    const ca = Math.cos(ry), sa = Math.sin(ry);
    // Local axes of the candidate, in world space.
    const ux = { x: ca, z: -sa }, uz = { x: sa, z: ca };
    const hw = w / 2 + gap / 2, hd = d / 2 + gap / 2;
    for (const p of plots) {
      // Cheap reject first: the circumscribed circles.
      const dx = p.x - x, dz = p.z - z;
      const rr = Math.hypot(hw, hd) + Math.hypot(p.w, p.d) / 2;
      if (dx * dx + dz * dz > rr * rr) continue;
      const pca = Math.cos(p.yaw || 0), psa = Math.sin(p.yaw || 0);
      const pux = { x: pca, z: -psa }, puz = { x: psa, z: pca };
      const phw = p.w / 2, phd = p.d / 2;
      let separated = false;
      for (const axis of [ux, uz, pux, puz]) {
        const dist = Math.abs(dx * axis.x + dz * axis.z);
        const ra = hw * Math.abs(ux.x * axis.x + ux.z * axis.z)
          + hd * Math.abs(uz.x * axis.x + uz.z * axis.z);
        const rb = phw * Math.abs(pux.x * axis.x + pux.z * axis.z)
          + phd * Math.abs(puz.x * axis.x + puz.z * axis.z);
        if (dist > ra + rb) { separated = true; break; }
      }
      if (!separated) return true;
    }
    return false;
  };

  /**
   * A period block: body, roof, and whatever shape it has decided to be.
   *
   * Every building being an extruded rectangle with a flat slab on top is the
   * single biggest reason a procedural city reads as a diagram. Three cheap
   * variations fix most of it, and all three change the *silhouette*, which is
   * what the eye actually compares:
   *
   *   - a pitched roof, which from above is two sloping planes and a ridge line
   *     instead of one flat grey rectangle;
   *   - a setback upper storey on the taller blocks, which gives the skyline a
   *     step instead of a wall;
   *   - a rear wing, turning the plan into an L.
   *
   * Only flat-roofed plots are offered to the player for deployment, so the
   * roof style has to be recorded rather than inferred.
   */
  const rejects = { water: 0, street: 0, bridge: 0, overlap: 0, placed: 0 };
  const block = (x, z, w, d, h, ry = 0, opts = {}) => {
    const pts = footprintPoints(x, z, w, d, ry);
    if (!onDryLand(pts)) { rejects.water++; return false; }
    if (!offStreet(pts)) { rejects.street++; return false; }
    if (!offBridge(pts)) { rejects.bridge++; return false; }
    if (!offLandmark(pts)) { rejects.landmark = (rejects.landmark || 0) + 1; return false; }
    if (overlaps(x, z, w, d, ry)) { rejects.overlap++; return false; }
    rejects.placed++;
    // Founded on the lowest corner, not on the middle.
    //
    // Taking the ground height at the centre and standing a box on it is what
    // put a visible gap under the downhill end of every long building on a
    // slope — the houses that looked like they were hovering. A building makes
    // up the difference the way a real one does: it is taller at its low end,
    // its base is cut into the high end, and none of it is off the ground.
    let gLo = Infinity, gHi = -Infinity;
    for (const p of pts) {
      const gp = terrain.heightAt(p.x, p.z);
      if (gp < gLo) gLo = gp;
      if (gp > gHi) gHi = gp;
    }
    const fall = Math.min(7, Math.max(0, gHi - gLo));
    // Past that cap the trick stops working: the block is bedded to the low
    // corner and made `fall` taller, so on ground that drops more than seven
    // metres across the plot the uphill side is buried by the difference, and
    // on a real slope — Corcovado's flanks, where the ground falls forty-five
    // degrees — the whole building disappears into the hill and its roof comes
    // out level with the grass. Nobody builds a flat-roofed block on a cliff.
    // Leave the ground empty instead; there is a forest on it.
    if (gHi - gLo > 10.0) return false;
    const g = gLo - 0.3;
    const roll = rng();
    const pitched = roll < (opts.pitchChance ?? 0.42) && Math.min(w, d) < 26;
    const setback = !pitched && roll > 0.82 && h > 20 && Math.min(w, d) > 14;

    const bodyH = (setback ? h * 0.72 : h) + fall + 0.3;
    const body = new THREE.BoxGeometry(w, bodyH, d);
    // Rescale the UVs to world size so the facade texture gives one window bay
    // roughly every 3.5 m regardless of how big the block is. Without this the
    // window grid stretches and every building reads as a different scale.
    scaleBoxUVs(body, w, bodyH, d, 3.5);
    push(bodies, body, x, g + bodyH / 2, z, ry);

    // A plinth at the pavement and a string course under the eaves.
    //
    // Two boxes, forty centimetres proud of the wall. Without them a building
    // is a rectangle of facade texture that meets the ground on a line and the
    // sky on a line, which is why the city read as a tray of blocks however
    // much the roofs were varied: a real elevation is banded, and the bands
    // are what catch the light and tell you which way is up. The plinth also
    // does the work a contact shadow would — the wall no longer appears to
    // float a few centimetres over its own pavement.
    if (Math.min(w, d) > 5) {
      push(roofs, new THREE.BoxGeometry(w + 0.5, Math.min(1.5, 0.9 + fall), d + 0.5),
        x, g + Math.min(1.5, 0.9 + fall) / 2, z, ry);
      if (bodyH > 9) {
        push(roofs, new THREE.BoxGeometry(w + 0.45, 0.7, d + 0.45),
          x, g + bodyH - 1.4, z, ry);
      }
    }

    let top = g + bodyH;
    if (setback) {
      const sw = w * 0.66, sd = d * 0.66, sh = Math.max(3, h - (bodyH - fall - 0.3));
      const upper = new THREE.BoxGeometry(sw, sh, sd);
      scaleBoxUVs(upper, sw, sh, sd, 3.5);
      push(bodies, upper, x, g + bodyH + sh / 2, z, ry);
      push(roofs, new THREE.BoxGeometry(sw + 0.6, 1.0, sd + 0.6),
        x, g + bodyH + sh + 0.5, z, ry);
      // The setback leaves a terrace, which is a real roof and a real place to
      // put a gun.
      push(roofs, new THREE.BoxGeometry(w + 0.7, 0.9, d + 0.7), x, g + bodyH + 0.45, z, ry);
      top = g + bodyH + sh + 1.0;
    } else if (pitched) {
      // Two slopes and a ridge, built as a prism. The ridge runs along the
      // building's long axis, as it does on every terrace ever built.
      const alongX = w >= d;
      const rise = Math.min(6.5, Math.max(2.6, Math.min(w, d) * 0.34));
      const prism = new THREE.CylinderGeometry(
        (alongX ? d : w) * 0.72, (alongX ? d : w) * 0.72, alongX ? w : d, 3, 1);
      prism.rotateX(Math.PI / 2);
      if (alongX) prism.rotateY(Math.PI / 2);
      prism.scale(1, rise / ((alongX ? d : w) * 0.72 * 1.5), 1);
      push(roofs, prism, x, g + bodyH + rise * 0.34, z, ry);
      top = g + bodyH + rise;
    } else {
      push(roofs, new THREE.BoxGeometry(w + 0.7, 1.1, d + 0.7), x, g + bodyH + 0.5, z, ry);
      top = g + bodyH + 1.1;
    }

    const ca = Math.abs(Math.cos(ry)), sa = Math.abs(Math.sin(ry));
    plots.push({ x, z, w, d, h: bodyH, top, base: g, yaw: ry, flat: !pitched, pitched,
      ax: w * ca + d * sa, az: w * sa + d * ca,
      front: opts.front || null });
    return true;
  };

  // ── The civic set, on its reserved ground.
  //
  // Turned to face the street grid, which it was not. Twenty-two hand-placed
  // government blocks stood square to the map while every road around them ran
  // thirteen degrees off it, so each one met its own frontage at an angle and
  // the whole quarter read as boxes dropped from a height — "off angle
  // buildings", exactly. The positions are still the ones taken from the real
  // map; only the bearing changes, and the buildings now line up with the roads
  // that serve them.
  //
  // Subject to the same road test as everything else: the reserved footprints
  // keep the ordinary streets off them, but the bridge approach outranks them,
  // and a government office standing in the carriageway is still a government
  // office standing in the carriageway.
  // These are Westminster's own civic buildings at Westminster's own
  // coordinates — the Abbey at (-128, 118), Portcullis House at (-14, -104)
  // — and on every other map they land wherever those numbers happen to fall.
  // On Agra two of them stood inside the Taj's precinct wall. Anything within
  // the exclusion or inside a precinct is not built; on Westminster, where the
  // exclusion is 66 m and all of these sit further out, nothing changes.
  for (const c of CIVIC) {
    if (Math.hypot(c.x, c.z) < EXCLUDE + Math.max(c.w, c.d) / 2) continue;
    if (inPrecinct(c.x, c.z)) continue;
    block(c.x, c.z, c.w, c.d, c.h, GRID_YAW, { pitchChance: 0.1 });
  }

  // ── The blocks the street network leaves behind.
  //
  // This is the part that used to be guesswork. Buildings were laid on their
  // own grid and streets on another, and where the two drifted out of phase a
  // terrace ended up standing in the road. Now the block *is* the hole in the
  // network: its sides are the streets that bound it, and every building is
  // set back from one of those sides by a real distance, facing it.
  let terraces = 0, squares = 0, civics = 0, yards = 0, works = 0;

  /**
   * The block as a rectangle: centre, the angle its long side runs at, and how
   * much of it is left once the pavements are taken off each edge.
   */
  const blockFrame = (b) => {
    const e0 = { x: b.poly[1].x - b.poly[0].x, z: b.poly[1].z - b.poly[0].z };
    const e1 = { x: b.poly[2].x - b.poly[1].x, z: b.poly[2].z - b.poly[1].z };
    const L0 = Math.hypot(e0.x, e0.z), L1 = Math.hypot(e1.x, e1.z);
    const in0 = halfWidth(b.sides[0]) + halfWidth(b.sides[2]) + 8;
    const in1 = halfWidth(b.sides[1]) + halfWidth(b.sides[3]) + 8;
    return { yaw: Math.atan2(e0.x, e0.z), L0, L1, in0, in1,
      free0: L0 - in0, free1: L1 - in1 };
  };

  for (const b of net.blocks) {
    const r = Math.hypot(b.x, b.z);
    if (r < EXCLUDE || inPrecinct(b.x, b.z)) { b.use = 'precinct'; continue; }
    const m = terrain.maskAt(b.x, b.z);
    const f = blockFrame(b);

    // What is this block *for*?
    //
    // Every block is for something. The version before this one left about
    // half of them as bare ground on the grounds that a city needs open space,
    // which is true of squares and false of everything else: from above, an
    // unbuilt block with no reason to be unbuilt reads as a hole in the map.
    // So the choice here is between uses, never between building and not.
    const roll = rng();
    let use = 'terrace';
    if (m.park > 0.40) use = 'park';
    else if (roll < 0.09) use = 'park';
    else if (roll < 0.15) use = 'carpark';
    else if (roll < 0.25 && r > terrain.span * 0.42) use = 'works';
    else if (roll < 0.34 && r < terrain.span * 0.6) use = 'civic';
    if (f.free0 < 26 || f.free1 < 26) use = use === 'park' ? 'park' : 'carpark';
    b.use = use;
    b.open = use === 'park' || use === 'carpark';
    // An open block still needs a reason to be open. A city of nothing but
    // garden squares and car parks is a diagram with the interesting parts left
    // out, so each one is given a programme — a market, a pitch, a graveyard, a
    // school, allotments, a builder's yard — and the detail pass lays out what
    // that actually looks like from the air.
    if (b.open && use === 'park' && f.free0 > 34 && f.free1 > 34 && rng() < 0.72) {
      b.programme = BLOCK_PROGRAMMES[Math.floor(rng() * BLOCK_PROGRAMMES.length)];
    }
    if (b.open) { squares++; continue; }        // the detail pass builds these

    // District character: taller in the middle of town, lower out at the edges,
    // with a slow drift across the map so neighbourhoods differ.
    const drift = valueNoise(b.x * 0.0026 + 5.1, b.z * 0.0026 - 2.3);
    let baseH = (10 + 20 * (1 - Math.min(1, r / (terrain.span * 0.8)))) * (0.7 + drift * 0.9);

    // A downtown, where a level has one.
    //
    // "Taller in the middle, lower at the edges" is how a European river city
    // is shaped and is not how a harbour city is: Sydney's tall quarter is a
    // kilometre of towers packed against the water on one side of the cove,
    // and the thing you actually see behind the Opera House. Without it the
    // Opera House stands in front of a village.
    if (DOWNTOWN) {
      const dd = Math.hypot(b.x - DOWNTOWN.x, b.z - DOWNTOWN.z);
      const f = Math.max(0, 1 - dd / DOWNTOWN.radius);
      if (f > 0) {
        // Squared, so the core is dense and the fall-off to the suburbs is
        // quick — a skyline has an edge.
        const lift = (DOWNTOWN.peak / 30) * f * f * (0.55 + drift * 0.9);
        baseH = Math.max(baseH, 10 + lift * 20);
      }
    }

    // ── One building, filling the block. Offices, a department store, a
    // ministry: the thing a terrace of houses is not.
    if (use === 'civic') {
      const w = Math.min(f.free1, 16 + rng() * 26);
      const d = Math.min(f.free0, 24 + rng() * 40);
      if (block(b.x, b.z, w, d, baseH * (1.25 + rng() * 0.75), f.yaw,
        { pitchChance: 0.08, front: null })) civics++;
      // Whatever is left of the block goes to a yard building or two.
      for (let k = 0; k < 2; k++) {
        const ox = (rng() - 0.5) * f.free1, oz = (rng() - 0.5) * f.free0;
        const px = b.x + ox * Math.cos(f.yaw) + oz * Math.sin(f.yaw);
        const pz = b.z - ox * Math.sin(f.yaw) + oz * Math.cos(f.yaw);
        if (block(px, pz, 8 + rng() * 8, 8 + rng() * 12, baseH * (0.4 + rng() * 0.3),
          f.yaw, { pitchChance: 0.5 })) yards++;
      }
      continue;
    }

    // ── A works: long sheds in a row, with a yard between them. Reads as
    // industry from above because of the roof pitch and the repetition.
    if (use === 'works') {
      const bays = 2 + Math.floor(rng() * 3);
      const shedW = Math.min(f.free1 / bays - 3, 16);
      for (let k = 0; k < bays; k++) {
        const ox = (k - (bays - 1) / 2) * (shedW + 3.5);
        const px = b.x + ox * Math.cos(f.yaw);
        const pz = b.z - ox * Math.sin(f.yaw);
        if (shedW < 7) break;
        if (block(px, pz, shedW, Math.min(f.free0, 26 + rng() * 34),
          7 + rng() * 6, f.yaw, { pitchChance: 0.85 })) works++;
      }
      continue;
    }

    // ── Terraces round the edge, facing the street they were set back from.
    const depth = 13 + rng() * 7;
    for (let s = 0; s < 4; s++) {
      const p = b.poly[s], q = b.poly[(s + 1) % 4];
      const dx = q.x - p.x, dz = q.z - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 24) continue;
      const dir = { x: dx / len, z: dz / len };
      // Inward normal: the one that points at the middle of the block.
      let nx = -dir.z, nz = dir.x;
      if ((b.x - p.x) * nx + (b.z - p.z) * nz < 0) { nx = -nx; nz = -nz; }
      // Keep off the corners, where the next street's own frontage runs.
      const t0 = halfWidth(b.sides[(s + 3) % 4]) + 4;
      const t1 = len - halfWidth(b.sides[(s + 1) % 4]) - 4;
      const yaw = Math.atan2(dir.x, dir.z);
      const front = (c, off) => ({
        x: p.x + dir.x * c + nx * off, z: p.z + dir.z * c + nz * off,
      });

      let t = t0;
      while (t < t1 - 9) {
        const run = Math.min(t1 - t, 9 + rng() * 15);
        if (run < 8.5) break;
        if (rng() < 0.08) { t += run + 2; continue; }   // a way through to the yard
        const c = t + run / 2;

        // Set back from the *road*, not from the block's nominal edge. The two
        // are not always the same — a junction's paving is wider than the
        // street that leads to it — so walk the frontage outward until the
        // whole of it is genuinely clear, and give up on this run if the
        // street has taken the ground.
        let off = halfWidth(b.sides[s]) + 2.4 + rng() * 2.0;
        let clear = -Infinity;
        for (let k = 0; k < 5; k++) {
          clear = Infinity;
          for (const u of [-run / 2 + 1, 0, run / 2 - 1]) {
            const g2 = front(c + u, off);
            clear = Math.min(clear, net.roadClearance(g2.x, g2.z),
              net.nodeClearance(g2.x, g2.z));
          }
          if (clear >= 2.0) break;
          off += (2.0 - clear) + 0.4;
        }
        if (clear < 2.0 || off > 34) { t += run + 2; continue; }

        const mid = front(c, off + depth / 2);
        const corner = (t < t0 + 12 || t + run > t1 - 12) ? 1.22 : 1.0;
        const h = baseH * corner * (0.78 + rng() * 0.5);
        if (block(mid.x, mid.z, depth, run - 0.9, h, yaw,
          { front: { x: -nx, z: -nz }, pitchChance: h < 18 ? 0.55 : 0.2 })) terraces++;
        t += run + (rng() < 0.3 ? 1.4 + rng() * 2.6 : 0.5);
      }
    }

    // And the middle of the block: mews, workshops, the back of a pub. Blocks
    // that are a ring of terraces round a void read as a stage set from above;
    // real ones are built into.
    const fills = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < fills; k++) {
      const mw = 9 + rng() * 14, md = 8 + rng() * 14;
      const ox = (rng() - 0.5) * Math.max(0, f.free1 - depth * 2 - mw);
      const oz = (rng() - 0.5) * Math.max(0, f.free0 - depth * 2 - md);
      const px = b.x + ox * Math.cos(f.yaw) + oz * Math.sin(f.yaw);
      const pz = b.z - ox * Math.sin(f.yaw) + oz * Math.cos(f.yaw);
      // Square to the block, with no random wobble. A tenth of a radian of
      // jitter reads as sloppiness rather than as variety from directly above,
      // and it is the one place in the plan where a building is deliberately
      // out of line with everything around it.
      if (block(px, pz, mw, md, baseH * (0.45 + rng() * 0.45), f.yaw,
        { pitchChance: 0.7 })) yards++;
    }
  }

  const facade = makeFacadeTexture(64);
  const lit = makeWindowEmissive(64);
  for (const t of [facade, lit]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = quality.anisotropy;
  }

  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.93, metalness: 0.01,
    map: facade,
    emissive: new THREE.Color(0xffd9a0),
    emissiveMap: lit,
    emissiveIntensity: 0.16,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0.02,
  });

  if (bodies.length) group.add(mergeTinted(bodies, bodyMat, PALETTE, rng, quality));
  if (roofs.length) group.add(mergeTinted(roofs, roofMat, ROOF, rng, quality));

  group.add(buildBlockGround(terrain, net, quality, inPrecinct));
  // The paved forecourt is a Westminster thing — a stone apron in front of
  // the Palace. Laid at the exclusion radius on every map it put three
  // hundred metres of paving under the Taj's garden and a disc of it on the
  // Giza plateau, and the levelled ground the monument stands on read as a
  // bald plate. Where the precinct says its ground is lawn, garden or sand,
  // the ground is the ground.
  const paved = !['lawn', 'charbagh', 'sand'].includes(opts.precinct?.ground);
  if (paved) group.add(buildForecourt(terrain, EXCLUDE, quality));
  group.add(buildStreetSurface(net, terrain, quality));
  group.add(buildBridge(terrain, quality, bridge));
  group.add(buildEmbankment(terrain));
  group.add(buildStreetDetail(terrain, quality, plots, net, rng));

  // ── The detail pass. Everything that makes the massing read as a place
  // rather than as a diagram: street furniture on a rhythm, the parts of a
  // building that are not the box, the river's own edge, and paint on the road.
  const props = new PropSet(quality);
  const detail = new THREE.Group();
  detail.name = 'citydetail';
  const counts = { terraces, squares, civics, works, yards,
    junctions: net.nodes.length, streets: net.edges.length };
  Object.assign(counts, addStreetFurniture(props, terrain, plots, rng, dense));
  Object.assign(counts, addBuildingDetail(props, terrain, plots, rng, dense));
  Object.assign(counts, addRoofAndFrontage(props, terrain, plots, rng, dense));
  Object.assign(counts, addRiverEdge(props, terrain, rng, opts.precinct || {}));
  Object.assign(counts, addNetworkFurniture(props, net, terrain, rng, dense));
  // Paint stays on at every quality tier, thinned rather than dropped: a
  // crossing and a centre line are two of the few things that read as a city
  // from directly above, and they cost a handful of flat quads.
  Object.assign(counts, addStreetMarkings(props, net, terrain, rng, dense));
  Object.assign(counts, buildPrecinct(props, terrain, rng, {
    precinct: opts.precinct, radius: EXCLUDE - 4, net,
    landmarks: opts.landmarks || [], yaw: GRID_YAW,
  }));
  // Forest inside the playfield as well as beyond it.
  //
  // The outskirts start where the town stops, which on a map with a town on it
  // is the right place for them and on a mountain is a kilometre past anything
  // the player can see. El Castillo stands in a clearing and the Corcovado is
  // rainforest from the benches to the sea, so the canopy has to come in as
  // far as the precinct — off the roads, off the plots, and off the landmark's
  // own ground.
  if (opts.hinterland === 'jungle' || opts.hinterland === 'forest') {
    const tall = opts.hinterland === 'jungle';
    // Big trees, widely spaced. A canopy is a texture at this distance and the
    // cost of it is geometry: at a thirty-metre pitch this is seventeen
    // thousand trees, thirty-four thousand meshes to merge, and the level
    // never finishes loading. Sixty metres of pitch and a twenty-five metre
    // tree reads as continuous forest from anywhere a player stands.
    const step = 62 / Math.max(0.5, opts.canopy || 1) * (dense < 1 ? 1.3 : 1);
    const net = group.userData.network;
    const inner = opts.canopyFrom || EXCLUDE * 1.04;
    const near = (x, z) => plots.some((p) => Math.abs(x - p.x) < p.ax / 2 + 7
      && Math.abs(z - p.z) < p.az / 2 + 7);
    for (let gx = -reach; gx <= reach; gx += step) {
      for (let gz = -reach; gz <= reach; gz += step) {
        const x = gx + (rng() - 0.5) * step * 0.9;
        const z = gz + (rng() - 0.5) * step * 0.9;
        const r = Math.hypot(x, z);
        // Where the forest starts. Not `contextExclude`, which is how far the
        // *town* is held off the landmark and on a mountain is four hundred
        // metres of bare hillside: trees grow right up to the terrace wall.
        if (r < inner || r > reach) continue;
        if (terrain.isWater(x, z)) continue;
        if (net && net.roadClearance && net.roadClearance(x, z) < 9) continue;
        if (near(x, z)) continue;
        if (rng() < 0.14) continue;
        const g = terrain.heightAt(x, z);
        if (g < terrain.waterLevel + 1.0) continue;
        const h = (tall ? 21 : 17) + rng() * (tall ? 15 : 12);
        const w = h * (0.30 + rng() * 0.13);
        props.add('dark', cyl(0.8, 1.3, h * 0.46, 4, x, g + h * 0.22, z),
          0x46352a, 1);
        // Broad at the top and narrower under it. A rainforest crown is an
        // umbrella; a cone is a Christmas tree, and two thousand Christmas
        // trees on the Corcovado is a garden centre.
        props.add('foliage', cyl(w, w * 0.55, h * 0.62, 6, x, g + h * 0.68, z),
          rng() < 0.45 ? 0x2c4a22 : 0x37582a, 0.76 + rng() * 0.38);
        counts.canopy = (counts.canopy || 0) + 1;
      }
    }
  }

  const nearCanopy = counts.canopy || 0;
  Object.assign(counts, buildOutskirts(props, terrain, rng, {
    inner: reach * 1.02,
    hinterland: opts.hinterland,
    canopyFar: opts.canopyFar || (opts.canopy || 1) * 0.55,
  }));
  // Both passes count trees under the same name and the outskirts run second.
  counts.canopy = (counts.canopy || 0) + nearCanopy;
  Object.assign(counts, buildHorizon(props, terrain, rng));
  Object.assign(counts, buildRailway(props, terrain, rng, { yaw: GRID_YAW, net }));
  // Whatever each open block is for, laid out in the block's own frame.
  counts.programmes = 0;
  for (const b of net.blocks) {
    if (!b.programme) continue;
    const quad = blockInterior(b, 2.0);
    const fr = quadFrame(quad);
    if (fr.w < 26 || fr.d < 26) continue;
    if (terrain.isWater(fr.cx, fr.cz)) continue;
    Object.assign(counts, fillOpenBlock(props, terrain, rng, b.programme,
      { cx: fr.cx, cz: fr.cz, w: fr.w - 4, d: fr.d - 4, yaw: fr.yaw }));
    counts.programmes++;
  }
  props.flush(detail, {
    ...MATERIALS,
    // Lamps, lit windows, signals: emissive, so they carry at distance and
    // pick up the bloom. A street with lamps that are merely pale grey reads
    // as a street at noon whatever the sun is doing.
    glow: { roughness: 0.4, cast: false, emissive: 0xffd9a0, emissiveIntensity: 1.5 },
    // Grime is a wash over the facade, not a solid: it has to read as dirt on
    // the stone rather than as a dark panel bolted to it.
    grime: { roughness: 0.99, cast: false, transparent: true, opacity: 0.34 },
  });
  group.add(detail);
  group.userData.detail = counts;
  group.userData.network = net;
  // The frame the whole place is laid out on. The field works read it so the
  // defence line is square to the streets it is dug beside.
  group.userData.gridYaw = GRID_YAW;
  group.userData.layout = rejects;
  group.userData.bridge = bridge;

  // The flat roofs, for deployment. A gun on a roof has the sightlines the
  // ground does not, which is worth the climb.
  group.userData.roofs = plots.filter((p) => {
    if (p.flat === false || Math.min(p.w, p.d) <= 12 || p.h <= 8) return false;
    // And it has to actually be a roof. A building is bedded to the ground at
    // its own centre, so on a slope that climbs across its footprint the top
    // of a nine-metre block can be level with the hillside behind it — and a
    // gun deployed "on the roof" is a gun standing in a field. Corcovado's
    // summit is ringed by ground like that and it is where this was found.
    let hi = -Infinity;
    // Over the plot's *rotated* extent, which is what it actually covers: a
    // yawed footprint reaches past the corners of its own w by d box, and the
    // high ground that makes a roof useless is exactly the bit outside it.
    const hx = (p.ax || p.w) / 2, hz = (p.az || p.d) / 2;
    for (const fx of [-1, 0, 1]) {
      for (const fz of [-1, 0, 1]) {
        hi = Math.max(hi, terrain.heightAt(p.x + fx * hx, p.z + fz * hz));
      }
    }
    return p.base + p.h - hi > 5.0;
  });
  group.userData.plots = plots;
  return group;
}

/** Merge a pile of box geometries into one mesh, tinting each per-vertex. */
function mergeTinted(geos, material, palette, rng, quality) {
  for (const g of geos) {
    const n = g.attributes.position.count;
    // Value jitter, not hue jitter: multiplying a colour scales every channel,
    // so this separates neighbouring buildings without ever inventing a colour
    // that is not in the palette.
    const c = new THREE.Color(palette[Math.floor(rng() * palette.length)]);
    c.multiplyScalar(0.80 + rng() * 0.36);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = quality.shadowMapSize > 0;
  mesh.receiveShadow = quality.shadowMapSize > 0;
  return mesh;
}

/** The colour of each kind of block's own ground. */
const BLOCK_SURFACE = {
  park: 0x4f7336,
  carpark: 0x3a3d42,
  works: 0x8d8471,
  civic: 0xa39b89,
  terrace: 0x8a8170,
  precinct: null,          // the forecourt covers this
};

/**
 * Ground cover, by the block.
 *
 * The version this replaces laid seventeen-metre squares of grass, gravel and
 * paving across the whole map on a jittered lattice, each one flat and at the
 * height of its own centre. On anything but level ground every tile cut into
 * the slope on one side and hung off it on the other, neighbours overlapped at
 * different heights, and none of them lined up with anything — which is what
 * "weird grass blocks" was. It was a way of covering bare terrain without
 * having to know what the terrain was *for*.
 *
 * Now the ground belongs to the plan. Every block has a use, and the use says
 * what its floor is: lawn in a garden square, tarmac in a car park, gravel in a
 * works yard, paving in a civic block, a worn yard behind a terrace. Each floor
 * is the block's own shape, pulled in behind the kerbs, and subdivided so it
 * follows the ground rather than sitting on top of it. Between the blocks there
 * is nothing left to cover: streets have surfaces, the landmark has a
 * forecourt, the river has an embankment, and past the edge of town the map's
 * own colouring is the right answer.
 */
function buildBlockGround(terrain, net, quality, inPrecinct) {
  const g = new THREE.Group();
  g.name = 'blockground';
  const pos = [];
  const col = [];
  const tmp = new THREE.Color();
  const base = new THREE.Color();
  const CELL = 8;

  const vert = (p, y) => {
    pos.push(p.x, y, p.z);
    col.push(tmp.r, tmp.g, tmp.b);
  };

  for (const b of net.blocks) {
    const hue = BLOCK_SURFACE[b.use];
    if (!hue) continue;
    const quad = blockInterior(b, 0.4);
    const f = quadFrame(quad);
    if (f.w < 6 || f.d < 6) continue;
    base.setHex(hue);
    const nu = Math.max(1, Math.round(f.w / CELL));
    const nv = Math.max(1, Math.round(f.d / CELL));
    for (let iv = 0; iv < nv; iv++) {
      for (let iu = 0; iu < nu; iu++) {
        const p00 = quadPoint(quad, iu / nu, iv / nv);
        const p10 = quadPoint(quad, (iu + 1) / nu, iv / nv);
        const p11 = quadPoint(quad, (iu + 1) / nu, (iv + 1) / nv);
        const p01 = quadPoint(quad, iu / nu, (iv + 1) / nv);
        // Never over the water, and never over a road: a block corner can
        // overhang the bank where the grid meets the river, and one quad of
        // lawn floating over the Thames is more noticeable than a missing one.
        if (terrain.isWater(p00.x, p00.z) || terrain.isWater(p10.x, p10.z)
          || terrain.isWater(p11.x, p11.z) || terrain.isWater(p01.x, p01.z)) continue;
        const mx = (p00.x + p11.x) / 2, mz = (p00.z + p11.z) / 2;
        if (net.roadClearance(mx, mz) < 0.5 || net.nodeClearance(mx, mz) < 0.5) continue;
        if (inPrecinct && inPrecinct(mx, mz)) continue;
        tmp.copy(base).multiplyScalar(
          0.86 + 0.26 * valueNoise(mx * 0.035 + 7.1, mz * 0.035 - 3.4));
        const y = (p) => terrain.heightAt(p.x, p.z) + 0.10;
        vert(p00, y(p00)); vert(p10, y(p10)); vert(p11, y(p11));
        vert(p00, y(p00)); vert(p11, y(p11)); vert(p01, y(p01));
      }
    }
  }
  if (!pos.length) return g;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // Its own depth-offset tier, between the terrain and the roads: the
  // ground's layers are terrain, then this, then tarmac, then paint, and each
  // is pushed a step nearer the eye than the one under it.
  const mesh = new THREE.Mesh(geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  mesh.receiveShadow = quality.shadowMapSize > 0;
  mesh.frustumCulled = false;
  g.add(mesh);
  return g;
}

/**
 * The landmark's forecourt.
 *
 * The middle of the map is held clear for the monument, and an empty circle in
 * the centre of a city reads as a bomb site rather than as a setting. Paving it
 * turns the hole into a square — the thing a landmark actually stands in — and
 * gives the streets that stop at its edge something to stop at.
 *
 * Built as rings of triangles that follow the ground, like the junction pads,
 * because a flat disc laid on anything but a billiard table buries one side of
 * itself and hangs in the air on the other.
 */
function buildForecourt(terrain, radius, quality) {
  const g = new THREE.Group();
  g.name = 'forecourt';
  const RINGS = [0, 0.38, 0.7, 0.88, 1.0];
  const SEGS = 48;
  const pos = [];
  const col = [];
  const paving = new THREE.Color(0xb6ae9b);
  const edge = new THREE.Color(0x9a927f);
  const tmp = new THREE.Color();
  const at = (r, th) => {
    const x = Math.cos(th) * r * radius, z = Math.sin(th) * r * radius;
    return { x, z, y: terrain.heightAt(x, z) + 0.16 };
  };
  const put = (p, t) => {
    pos.push(p.x, p.y, p.z);
    const j = 0.9 + 0.2 * valueNoise(p.x * 0.05, p.z * 0.05);
    tmp.copy(paving).lerp(edge, t).multiplyScalar(j);
    col.push(tmp.r, tmp.g, tmp.b);
  };
  for (let ri = 0; ri < RINGS.length - 1; ri++) {
    const r0 = RINGS[ri], r1 = RINGS[ri + 1];
    for (let s = 0; s < SEGS; s++) {
      const th0 = (s / SEGS) * Math.PI * 2, th1 = ((s + 1) / SEGS) * Math.PI * 2;
      // Nibble the outer edge so the forecourt is not a drawn-compass circle.
      const wob = (t) => 1 - 0.06 * valueNoise(Math.cos(t) * 3.1, Math.sin(t) * 3.1);
      const k0 = ri === RINGS.length - 2 ? wob(th0) : 1;
      const k1 = ri === RINGS.length - 2 ? wob(th1) : 1;
      const a = at(r0, th0), b = at(r1 * k0, th0), c = at(r1 * k1, th1), d = at(r0, th1);
      put(a, r0); put(c, r1); put(b, r1);
      put(a, r0); put(d, r0); put(c, r1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  mesh.receiveShadow = quality.shadowMapSize > 0;
  mesh.frustumCulled = false;
  g.add(mesh);
  return g;
}

/**
 * The line Westminster Bridge takes, worked out before anything else is built.
 *
 * The street network needs this: a crossing is only a crossing if roads reach
 * it, and buildings have to be kept out of the corridor it lands in. The line
 * itself is fixed from the real map, but the deck is trimmed to where the
 * water actually is, plus a short approach either side — otherwise the bridge
 * runs hundreds of metres over dry land.
 */
function bridgeLine(terrain, exclude = 66) {
  // Found from the river, not written down.
  //
  // This used to be two hard-coded points — Westminster Bridge's own line,
  // which is exactly right on the one map it was measured from and arbitrary
  // on every other. On Agra it crossed the Yamuna at whatever angle that line
  // happened to make with it, a long way from anything, so the bridge read as
  // an aqueduct abandoned in a field: no road came near it and nothing
  // explained why it was there.
  const span = terrain.span;
  // Candidates: wet cells, nearest to the monument first. Each is tried as a
  // crossing and kept only if *both landings* clear the exclusion — which is
  // the test that matters, and not the one this used to make. Measuring the
  // water's distance from the monument let the Yamuna, whose bank is fifty
  // metres from the Taj's terrace, put the south abutment inside the garden:
  // the crossing itself was four hundred metres out, and the bridge simply
  // reached back across the river to land in the precinct.
  const cands = [];
  for (let z = -span * 0.75; z <= span * 0.75; z += 10) {
    for (let x = -span * 0.75; x <= span * 0.75; x += 10) {
      if (!terrain.isWater(x, z)) continue;
      const d = Math.hypot(x, z);
      if (d < exclude) continue;
      cands.push({ x, z, d });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.d - b.d);

  const crossingAt = (near) => {
    // Which way the channel runs here: the heading along which the water goes
    // furthest. Crossing square to that is what a bridge does.
    let dir = { x: 1, z: 0 }, longest = -1;
    for (let a = 0; a < Math.PI - 1e-6; a += Math.PI / 24) {
      const dx = Math.sin(a), dz = Math.cos(a);
      let run = 0;
      for (let t = -420; t <= 420; t += 7) {
        if (terrain.isWater(near.x + dx * t, near.z + dz * t)) run++;
      }
      if (run > longest) { longest = run; dir = { x: dx, z: dz }; }
    }
    const nx = -dir.z, nz = dir.x;
    // Out to dry land on both sides, and a little beyond.
    const bank = (sign) => {
      let last = 0;
      for (let t = 0; t < 900; t += 4) {
        if (terrain.isWater(near.x + nx * sign * t, near.z + nz * sign * t)) last = t;
        else if (t > last + 26) break;
      }
      const d = last + 16;
      return new THREE.Vector3(near.x + nx * sign * d, 0, near.z + nz * sign * d);
    };
    return { from: bank(-1), to: bank(1) };
  };

  // The approach roads run about eighty metres past each landing before they
  // meet the grid, so the landings themselves want that much clearance too.
  //
  // Wanted, not required. The Thames passes within a hundred metres of the
  // Palace, so the eighty nearest wet cells are all in that one bend and every
  // crossing tried from them lands too close — and a search that stopped
  // there gave Westminster no bridge at all. So the search runs the whole
  // river, and if nothing clears the full approach it takes the crossing that
  // comes nearest to doing so: a bridge that lands a little tight beats a
  // river with no way over it.
  let pick = null, fallback = null, fallbackLo = -1;
  for (let i = 0; i < cands.length && !pick; i += 2) {
    const c = crossingAt(cands[i]);
    const L = c.from.distanceTo(c.to);
    if (L < 40 || L > span * 1.6) continue;
    const lo = Math.min(Math.hypot(c.from.x, c.from.z), Math.hypot(c.to.x, c.to.z));
    if (lo >= exclude + 80) { pick = c; break; }
    if (lo >= exclude + 24 && lo > fallbackLo) { fallback = c; fallbackLo = lo; }
    if (i >= 600) break;
  }
  if (!pick) pick = fallback;
  if (!pick) return null;
  const { from, to } = pick;
  const len = from.distanceTo(to);
  if (len < 40 || len > span * 1.6) return null;
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  const out = { x: (to.x - from.x) / len, z: (to.z - from.z) / len };
  const RUN = 46;                       // metres of ramp at each end
  const deckY = terrain.waterLevel + 9.5;
  const DECK_T = 1.8;
  const deckTop = deckY + DECK_T / 2;

  // The running surface, end to end: down one ramp, across the deck, up the
  // other. One profile, shared by the street network — which draws the road on
  // it — and by the structure below it, so the two cannot disagree about where
  // the bridge is. That disagreement is the whole reason the bridge used to
  // meet the road in a seam: the deck was built by code that had never heard of
  // the street network, and a second road generator is a second answer.
  const RAMP_STEPS = 7;
  const profile = [];
  const rampPoint = (end, sign, t) => {
    const x = end.x + out.x * sign * RUN * t;
    const z = end.z + out.z * sign * RUN * t;
    const ground = terrain.heightAt(x, z);
    // Eased as t², so the ramp leaves the deck level and lands flat.
    const y = deckTop + (ground + 0.22 - deckTop) * (t * t);
    return { x, z, y };
  };
  for (let i = RAMP_STEPS; i >= 1; i--) profile.push(rampPoint(from, -1, i / RAMP_STEPS));
  profile.push({ x: from.x, z: from.z, y: deckTop });
  const spans = Math.max(4, Math.round(len / 26));
  for (let i = 1; i < spans; i++) {
    profile.push({ x: from.x + (to.x - from.x) * (i / spans),
      z: from.z + (to.z - from.z) * (i / spans), y: deckTop });
  }
  profile.push({ x: to.x, z: to.z, y: deckTop });
  for (let i = 1; i <= RAMP_STEPS; i++) profile.push(rampPoint(to, 1, i / RAMP_STEPS));

  return {
    a: { x: from.x, z: from.z }, b: { x: to.x, z: to.z },
    from, to, out, yaw, len, run: RUN,
    deckY, deckT: DECK_T, deckTop, profile,
    // The whole corridor, ramps included: nothing may be built in it.
    far: {
      a: { x: from.x - out.x * RUN, z: from.z - out.z * RUN },
      b: { x: to.x + out.x * RUN, z: to.z + out.z * RUN },
    },
  };
}

/** Distance from a point to a line segment, in the ground plane. */
function distToSegment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

/** Westminster Bridge, built along the line worked out above. */
function buildBridge(terrain, quality, line) {
  const g = new THREE.Group();
  if (!line) return g;                    // no crossing on this map
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x7d8676, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x5f6a5b, roughness: 0.8 });

  const { from, to, len, yaw, deckY, deckTop, profile } = line;
  const mid = from.clone().lerp(to, 0.5);

  // The structure only. The running surface across this bridge is drawn by the
  // street network, from the same profile these boxes are built under, because
  // the bridge is an edge of that network like any other street. It was not,
  // and a second road generator is a second answer: the deck arrived four
  // metres narrower than the road that met it, in its own colour, with no
  // markings, its surface two metres above the tarmac — and where the two met
  // there was a seam, because neither knew the other was there.
  const DECK_W = halfWidth('avenue') * 2;
  const DECK_T = line.deckT ?? 1.8;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, DECK_T, len), deckMat);
  deck.position.set(mid.x, deckTop - DECK_T / 2, mid.z);
  deck.rotation.y = yaw;
  deck.receiveShadow = quality.shadowMapSize > 0;
  g.add(deck);

  // ── Balustrade. A solid slab either side reads as a kerb; what makes a
  // bridge look like a bridge from above is the *gap* between the balusters —
  // a dotted line of shadow the whole way across.
  const railBits = [];
  for (const sx of [-1, 1]) {
    const ox = Math.cos(yaw) * sx * (DECK_W / 2 - 0.4);
    const oz = -Math.sin(yaw) * sx * (DECK_W / 2 - 0.4);
    // Base course and handrail, with posts between them.
    const base = new THREE.BoxGeometry(0.62, 0.42, len);
    base.rotateY(yaw); base.translate(mid.x + ox, deckTop + 0.2, mid.z + oz);
    railBits.push(base);
    const cap = new THREE.BoxGeometry(0.8, 0.26, len);
    cap.rotateY(yaw); cap.translate(mid.x + ox, deckTop + 1.4, mid.z + oz);
    railBits.push(cap);
    const posts = Math.max(6, Math.round(len / 2.4));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts - 0.5;
      const px = mid.x + ox + Math.sin(yaw) * len * t;
      const pz = mid.z + oz + Math.cos(yaw) * len * t;
      const post = new THREE.BoxGeometry(0.34, 0.9, 0.34);
      post.rotateY(yaw); post.translate(px, deckTop + 0.85, pz);
      railBits.push(post);
      // A lamp standard every sixth post.
      if (i % 6 === 3) {
        const col = new THREE.CylinderGeometry(0.1, 0.15, 5.0, 6);
        col.translate(px, deckTop + 3.9, pz);
        railBits.push(col);
        const head = new THREE.BoxGeometry(0.6, 0.5, 0.6);
        head.translate(px, deckTop + 6.5, pz);
        railBits.push(head);
      }
    }
  }
  const rails = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(railBits, false), trimMat);
  rails.castShadow = quality.shadowMapSize > 0;
  g.add(rails);

  // ── The ramps, built straight from the profile the road is drawn on. Each
  // pair of profile points becomes one box under that stretch of surface, with
  // the wedge between it and the ground filled in as an abutment.
  for (let i = 0; i < profile.length - 1; i++) {
    const p0 = profile[i], p1 = profile[i + 1];
    if (p0.y >= deckTop - 0.01 && p1.y >= deckTop - 0.01) continue;   // the deck
    const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    if (segLen < 0.5) continue;
    const cx = (p0.x + p1.x) / 2, cz = (p0.z + p1.z) / 2;
    const top = (p0.y + p1.y) / 2;
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(DECK_W, DECK_T, segLen + 0.6), deckMat);
    seg.position.set(cx, top - DECK_T / 2, cz);
    seg.rotation.y = yaw;
    seg.rotation.x = Math.atan2(p0.y - p1.y, segLen)
      * (Math.sign((p1.x - p0.x) * Math.sin(yaw) + (p1.z - p0.z) * Math.cos(yaw)) || 1);
    seg.receiveShadow = quality.shadowMapSize > 0;
    g.add(seg);

    const ground = terrain.heightAt(cx, cz);
    const fillH = (top - DECK_T) - ground;
    if (fillH > 0.4) {
      const fill = new THREE.Mesh(
        new THREE.BoxGeometry(DECK_W - 3, fillH, segLen * 0.98), pierMatShared(),
      );
      fill.position.set(cx, ground + fillH / 2, cz);
      fill.rotation.y = yaw;
      fill.receiveShadow = quality.shadowMapSize > 0;
      g.add(fill);
    }
  }

  // Piers down to the riverbed, with cutwaters and the arches between them.
  const pierMat = pierMatShared();
  const spanBits = [];
  // Sized off the deck rather than in absolute metres, and slimmer than it was.
  //
  // The old numbers — piers seven metres thick and fifteen deep under a
  // spandrel fifteen and a half wide — were a pier of the Thames embankment
  // and made the whole thing read as a rigid block of masonry with holes in
  // it. A river crossing is mostly air: what you should see under the deck is
  // a run of arches on slender piers, with the water behind them.
  const PIER_W = DECK_W * 0.30;          // across the current
  const PIER_D = DECK_W * 0.62;          // along the deck
  const SOFFIT = DECK_W * 0.66;          // width of the arch barrel
  const piers = Math.max(3, Math.min(9, Math.round(len / 34)));
  const pierAt = [];
  for (let i = 1; i <= piers; i++) {
    const t = i / (piers + 1);
    const p = from.clone().lerp(to, t);
    const bed = terrain.heightAt(p.x, p.z);
    const h = deckY - bed;
    if (h <= 0.5) continue;
    pierAt.push({ p, bed, h, t });
    const pier = new THREE.BoxGeometry(PIER_W, h, PIER_D);
    pier.rotateY(yaw); pier.translate(p.x, bed + h / 2, p.z);
    spanBits.push(pier);
    // Cutwater: a wedge on each face, so the pier parts the water rather than
    // sitting in it like a post. Carried up as a pilaster to just under the
    // deck, the way a real one is, which is what gives the elevation its
    // vertical rhythm instead of leaving it a band of holes.
    for (const sgn of [-1, 1]) {
      const nose = new THREE.CylinderGeometry(PIER_W * 0.62, PIER_W * 0.62, h, 3);
      nose.rotateY(yaw + Math.PI / 2);
      nose.translate(p.x, bed + h / 2, p.z);
      const off = (PIER_D / 2 + PIER_W * 0.18) * sgn;
      nose.translate(Math.sin(yaw) * off, 0, Math.cos(yaw) * off);
      spanBits.push(nose);

      // The pilaster above it, and the corbelled cap it dies into.
      const col = new THREE.BoxGeometry(PIER_W * 0.86, Math.min(h, 4.2), PIER_W * 0.9);
      col.rotateY(yaw);
      col.translate(p.x + Math.sin(yaw) * off, deckY - 2.4, p.z + Math.cos(yaw) * off);
      spanBits.push(col);
      const cap = new THREE.BoxGeometry(PIER_W * 1.05, 0.5, PIER_W * 1.1);
      cap.rotateY(yaw);
      cap.translate(p.x + Math.sin(yaw) * off, deckY - 0.2, p.z + Math.cos(yaw) * off);
      spanBits.push(cap);
    }
  }

  // ── Arches. Stepped voussoirs springing between the piers: a stack of boxes
  // whose width follows a circular profile. Cheap, and from any angle that can
  // see under the deck it is the difference between a bridge and a plank.
  const ends = [{ t: 0 }, ...pierAt.map((q) => ({ t: q.t })), { t: 1 }];
  for (let i = 0; i < ends.length - 1; i++) {
    const t0 = ends[i].t, t1 = ends[i + 1].t;
    const a = from.clone().lerp(to, t0);
    const bmid = from.clone().lerp(to, t1);
    const sLen = a.distanceTo(bmid);
    if (sLen < 6) continue;
    const c = a.clone().lerp(bmid, 0.5);
    const springY = deckY - 1.6;
    const rise = Math.min(sLen * 0.40, 9.0);
    // Finer than it was: nine boxes across a thirty-metre arch is a staircase,
    // and the eye reads a staircase as a mistake rather than as masonry.
    const steps = 18;
    for (let k = 0; k < steps; k++) {
      const u = (k + 0.5) / steps;             // 0..1 across the arch
      const dy = Math.sin(u * Math.PI) * rise; // circular-ish profile
      const segW = (sLen / steps) + 0.25;
      const px2 = c.x + Math.sin(yaw) * (u - 0.5) * sLen;
      const pz2 = c.z + Math.cos(yaw) * (u - 0.5) * sLen;
      const soffit = springY - rise + dy;
      // The spandrel above the arch line, filling up to the deck.
      const fillH = Math.max(0.4, (deckY - 1.8) - soffit);
      const seg = new THREE.BoxGeometry(SOFFIT, fillH, segW);
      seg.rotateY(yaw);
      seg.translate(px2, soffit + fillH / 2, pz2);
      spanBits.push(seg);

      // The arch ring: a band of voussoirs standing slightly proud of the
      // spandrel on both elevations. This is the single detail that stops a
      // masonry arch reading as a hole punched in a wall — from any angle that
      // can see the side of the bridge, it is the arch.
      for (const sgn of [-1, 1]) {
        const ring = new THREE.BoxGeometry(PIER_W * 0.30, 1.5, segW);
        ring.rotateY(yaw);
        ring.translate(
          px2 + Math.cos(yaw) * sgn * (SOFFIT / 2 + PIER_W * 0.12),
          soffit + 0.55,
          pz2 - Math.sin(yaw) * sgn * (SOFFIT / 2 + PIER_W * 0.12));
        spanBits.push(ring);
      }
    }

    // A keystone over the crown of each arch, dropped below the string course.
    for (const sgn of [-1, 1]) {
      const key = new THREE.BoxGeometry(PIER_W * 0.34, 2.6, 1.5);
      key.rotateY(yaw);
      key.translate(
        c.x + Math.cos(yaw) * sgn * (SOFFIT / 2 + PIER_W * 0.14),
        springY - rise + rise - 0.5,
        c.z - Math.sin(yaw) * sgn * (SOFFIT / 2 + PIER_W * 0.14));
      spanBits.push(key);
    }
  }

  // A string course the whole length, just under the parapet, tying the
  // elevation together.
  for (const sgn of [-1, 1]) {
    const band = new THREE.BoxGeometry(PIER_W * 0.34, 0.7, len);
    band.rotateY(yaw);
    band.translate(
      mid.x + Math.cos(yaw) * sgn * (SOFFIT / 2 + PIER_W * 0.13),
      deckY - 0.9,
      mid.z - Math.sin(yaw) * sgn * (SOFFIT / 2 + PIER_W * 0.13));
    spanBits.push(band);
  }
  const spans = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(spanBits, false), pierMat);
  spans.castShadow = quality.shadowMapSize > 0;
  spans.receiveShadow = quality.shadowMapSize > 0;
  g.add(spans);
  return g;
}

/** Stone river wall along the near bank, so the ground doesn't just slope in. */
function buildEmbankment(terrain) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a7264, roughness: 0.95 });
  const pts = [];
  // Walk north along the near shore, finding where land meets water.
  for (let z = -820; z <= 860; z += 28) {
    let found = null;
    for (let x = 20; x < 420; x += 4) {
      if (terrain.isWater(x, z)) { found = x; break; }
    }
    if (found !== null) pts.push(new THREE.Vector3(found - 2, 0, z));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mid = a.clone().lerp(b, 0.5);
    const len = a.distanceTo(b) + 1.5;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const ground = terrain.heightAt(mid.x, mid.z);
    const h = Math.max(1.5, ground - terrain.waterLevel + 3.0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, len), mat);
    wall.position.set(mid.x, terrain.waterLevel - 3.0 + h / 2, mid.z);
    wall.rotation.y = yaw;
    g.add(wall);
  }
  return g;
}

/**
 * Rewrite a box's UVs so one texture tile covers `unit` metres of wall.
 * BoxGeometry lays its faces out in a fixed order (+X, -X, +Y, -Y, +Z, -Z),
 * four vertices each, which is what lets us pick the right pair of dimensions
 * per face.
 */
function scaleBoxUVs(geo, w, h, d, unit) {
  const uv = geo.attributes.uv;
  const spans = [
    [d, h], [d, h],   // +X, -X
    [w, d], [w, d],   // +Y, -Y  (roofs; texture barely matters)
    [w, h], [w, h],   // +Z, -Z
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    const ru = Math.max(1, Math.round(su / unit));
    const rv = Math.max(1, Math.round(sv / unit));
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    }
  }
  uv.needsUpdate = true;
}

/** One window bay: recessed opening in a stone field. */
function makeFacadeTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2ece1';
  ctx.fillRect(0, 0, size, size);

  // Faint coursing so the wall isn't a flat field.
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < size; y += 8) ctx.fillRect(0, y, size, 1);

  const m = size * 0.26;           // margin around the opening
  const ww = size - m * 2;
  const wh = size * 0.46;
  const wy = size * 0.26;

  ctx.fillStyle = '#cdc4b4';       // reveal
  ctx.fillRect(m - 2, wy - 2, ww + 4, wh + 4);
  ctx.fillStyle = '#4d525c';       // glass
  ctx.fillRect(m, wy, ww, wh);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(m, wy, ww, wh * 0.36);
  ctx.fillStyle = '#b8ae9d';       // mullion + transom
  ctx.fillRect(m + ww / 2 - 1, wy, 2, wh);
  ctx.fillRect(m, wy + wh * 0.45, ww, 2);
  ctx.fillStyle = '#e4dccd';       // sill
  ctx.fillRect(m - 3, wy + wh, ww + 6, 3);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Which part of the bay glows — only the glass. */
function makeWindowEmissive(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const m = size * 0.26;
  const ww = size - m * 2;
  const wh = size * 0.46;
  ctx.fillStyle = '#6a5230';
  ctx.fillRect(m, size * 0.26, ww, wh);
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

/**
 * Street furniture, planting and the things that make a city read as inhabited.
 *
 * A skyline of extruded boxes is legible but lifeless: at bird's-eye range the
 * eye reads *texture*, and a city's texture at that scale is trees, courtyards,
 * parked vehicles and the pale scars of squares between the blocks. Everything
 * here is merged into a handful of meshes, so the whole lot is a few draw calls
 * and none of it touches the physics world.
 */
function buildStreetDetail(terrain, quality, plots, net, rng) {
  const g = new THREE.Group();
  g.name = 'detail';
  const shadows = quality.shadowMapSize > 0;
  const dense = quality.groundClutter ? 1 : 0.45;

  // ── Trees.
  //
  // These were two stacked cones, and two stacked cones is a fir. London's
  // street trees are planes and limes: a bare trunk to head height and then a
  // broad, lumpy, roughly round crown. From the bird's-eye camera the crown is
  // the whole of what you see, and a field of little green spikes was one of
  // the most obviously wrong things in the frame.
  //
  // A crown is now three overlapping low-poly spheres, offset and squashed so
  // no two trees are the same shape and none of them is a perfect ball. Firs
  // still exist — a fifth of them, out in the woods and along the railway,
  // where a conifer belongs.
  const trunks = [];
  const crowns = [];
  const treeAt = (x, z, scale) => {
    if (terrain.isWater(x, z)) return;
    const y = terrain.heightAt(x, z);
    const h = (5 + rng() * 5) * scale;
    const conifer = rng() < 0.2;
    const t = new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale,
      h * (conifer ? 0.34 : 0.56), 5);
    t.translate(x, y + h * (conifer ? 0.17 : 0.28), z);
    trunks.push(t);

    if (conifer) {
      // Non-indexed, to match the icosahedra the broadleaf crowns are built
      // from: `mergeGeometries` refuses a list where some geometries carry an
      // index buffer and others do not, and the failure is a null return that
      // only surfaces as a crash inside the Mesh constructor.
      const lower = new THREE.ConeGeometry(h * 0.30, h * 0.58, 7).toNonIndexed();
      lower.translate(x, y + h * 0.50, z);
      const upper = new THREE.ConeGeometry(h * 0.21, h * 0.46, 7).toNonIndexed();
      upper.translate(x, y + h * 0.80, z);
      tintOne(lower, 0x355c28, 0.7 + rng() * 0.5);
      tintOne(upper, 0x406e2d, 0.7 + rng() * 0.5);
      crowns.push(lower, upper);
      return;
    }

    // Broadleaf: a clump of squashed spheres centred a little above the fork.
    const r = h * 0.34;
    const cy = y + h * 0.70;
    for (let k = 0; k < 3; k++) {
      const rr = r * (k === 0 ? 1 : 0.62 + rng() * 0.3);
      const lobe = new THREE.IcosahedronGeometry(rr, 0);
      lobe.scale(1, 0.82, 1);
      const a = rng() * Math.PI * 2;
      const off = k === 0 ? 0 : r * (0.4 + rng() * 0.4);
      lobe.translate(x + Math.cos(a) * off, cy + (k === 0 ? 0 : (rng() - 0.35) * r * 0.7),
        z + Math.sin(a) * off);
      tintOne(lobe, 0x4a7534, 0.72 + rng() * 0.5);
      crowns.push(lobe);
    }
  };

  // ── Garden squares.
  //
  // Every block the layout left open gets one, and they are worth more to the
  // plan than any building: a city read from above is a field of roofs with
  // green holes punched in it, and the holes are what give the roofs a shape.
  // Lawn, a gravel walk round the inside of the railings, and planting.
  // Every block's floor — the lawn of a square, the tarmac of a car park, the
  // yard behind a terrace — used to be laid here as one flat box the size of
  // the block's axis-aligned bounding box. `buildBlockGround` does it properly
  // now: the block's own shape, at the block's own angle, following the ground.
  // What is left for this pass is only what stands on top of it.
  const gravel = [];
  const railings = [];
  let squares = 0;
  const asphalt = [];
  let carparks = 0;

  for (const b of (net?.blocks || [])) {
    if (!b.open) continue;
    // Everything inside a block is laid out in the block's own frame.
    //
    // `u` runs along the block's first edge and `v` across it, so a rank of
    // parking bays is parallel to the street it is entered from and a garden's
    // railings follow its own boundary. Laid in world axes — which is what this
    // did — the bays ran diagonally across the tarmac and the railings crossed
    // the corners of the lawn, on every block in the city, because the plan is
    // turned thirteen degrees off the map.
    const quad = blockInterior(b, 1.0);
    const fr = quadFrame(quad);
    const cu = Math.cos(fr.yaw), su = Math.sin(fr.yaw);
    const put = (u, v) => ({ x: fr.cx + u * cu + v * su, z: fr.cz - u * su + v * cu });
    const w = fr.w - 4, d = fr.d - 4;
    if (w < 14 || d < 14) continue;
    if (terrain.isWater(fr.cx, fr.cz)) continue;
    if (net.roadClearance(fr.cx, fr.cz) < 4) continue;
    const gy = terrain.heightAt(fr.cx, fr.cz);

    if (b.use === 'carpark') {
      // Bays in two ranks with an aisle between them, and a few cars left in
      // them. The tarmac itself is the block's own ground, laid by
      // `buildBlockGround`; this is only what is painted and parked on it.
      for (let k = 0; k * 2.6 < w - 3; k++) {
        const u = -w / 2 + 1.5 + k * 2.6;
        for (const side of [-1, 1]) {
          const p = put(u, side * (d / 4));
          const line = new THREE.BoxGeometry(0.16, 0.06, 4.8);
          line.rotateY(fr.yaw);
          line.translate(p.x, terrain.heightAt(p.x, p.z) + 0.20, p.z);
          tintOne(line, 0xd7d2c2, 1);
          asphalt.push(line);
          if (rng() < 0.45) {
            const q = put(u + 1.3, side * (d / 4));
            const car = new THREE.BoxGeometry(1.8, 0.95, 4.2);
            car.rotateY(fr.yaw);
            car.translate(q.x, terrain.heightAt(q.x, q.z) + 0.62, q.z);
            tintOne(car, [0x9aa3ad, 0x2f3a45, 0x8c3a32, 0x3d5a46, 0xb8b2a4][
              Math.floor(rng() * 5)], 0.85 + rng() * 0.3);
            asphalt.push(car);
          }
        }
      }
      for (let k = 0; k < 4; k++) {
        const p = put((rng() - 0.5) * w, (rng() - 0.5) * d);
        treeAt(p.x, p.z, 0.9);
      }
      carparks++;
      continue;
    }

    // A block with a programme — a market, a pitch, a graveyard, a school —
    // gets its content from the detail pass instead, where the prop buckets
    // are. Trees round the edge of it still belong here.
    if (b.programme) {
      for (let k = 0; k < 4; k++) {
        const p = put((rng() - 0.5) * w, (rng() - 0.5) * d);
        if (Math.hypot(p.x - fr.cx, p.z - fr.cz) > Math.min(w, d) * 0.38) {
          treeAt(p.x, p.z, 1.0 + rng() * 0.4);
        }
      }
      squares++;
      continue;
    }

    // ── A garden square. Gravel walks inside the boundary, planting, railings
    // round the edge and something in the middle to look at: a square with a
    // centrepiece reads as a garden square, one without reads as a vacant lot.
    for (const [ou, ov, pw, pd] of [
      [0, -d / 2 + 2.2, w - 4, 2.4], [0, d / 2 - 2.2, w - 4, 2.4],
      [-w / 2 + 2.2, 0, 2.4, d - 4], [w / 2 - 2.2, 0, 2.4, d - 4]]) {
      const p = put(ou, ov);
      const path = new THREE.BoxGeometry(pw, 0.14, pd);
      path.rotateY(fr.yaw);
      path.translate(p.x, terrain.heightAt(p.x, p.z) + 0.15, p.z);
      tintOne(path, 0xb3a98f, 0.9 + rng() * 0.2);
      gravel.push(path);
    }
    const n = 3 + Math.floor(rng() * 6 * dense);
    for (let k = 0; k < n; k++) {
      const p = put((rng() - 0.5) * (w - 6), (rng() - 0.5) * (d - 6));
      treeAt(p.x, p.z, 1.1 + rng() * 0.4);
    }

    for (const [ou, ov, along] of [
      [0, -d / 2, true], [0, d / 2, true], [-w / 2, 0, false], [w / 2, 0, false]]) {
      const run = along ? w : d;
      const posts = Math.max(2, Math.round(run / 2.2));
      for (let k = 0; k < posts; k++) {
        const t = ((k + 0.5) / posts - 0.5) * run;
        const p = put(ou + (along ? t : 0), ov + (along ? 0 : t));
        const rail = new THREE.BoxGeometry(along ? 1.9 : 0.1, 1.05, along ? 0.1 : 1.9);
        rail.rotateY(fr.yaw);
        rail.translate(p.x, terrain.heightAt(p.x, p.z) + 0.55, p.z);
        tintOne(rail, 0x2f353b, 0.9 + rng() * 0.2);
        railings.push(rail);
      }
    }
    if (rng() < 0.45) {
      // A fountain: basin, plinth, and a pale figure on top.
      const basin = new THREE.CylinderGeometry(3.2, 3.4, 0.7, 12);
      basin.translate(fr.cx, gy + 0.35, fr.cz);
      tintOne(basin, 0xa9a290, 0.9 + rng() * 0.2);
      railings.push(basin);
      const plinth = new THREE.BoxGeometry(1.5, 2.2, 1.5);
      plinth.translate(fr.cx, gy + 1.8, fr.cz);
      tintOne(plinth, 0x9d9684, 1);
      railings.push(plinth);
      const figure = new THREE.CylinderGeometry(0.34, 0.5, 2.2, 6);
      figure.translate(fr.cx, gy + 4.0, fr.cz);
      tintOne(figure, 0xcfc9b6, 1);
      railings.push(figure);
    }
    squares++;
  }
  if (asphalt.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(asphalt, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }),
    );
    mesh.receiveShadow = shadows;
    g.add(mesh);
  }
  for (const [arr, rough] of [[gravel, 0.95]]) {
    if (!arr.length) continue;
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(arr, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough }),
    );
    mesh.receiveShadow = shadows;
    g.add(mesh);
  }
  if (railings.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(railings, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25 }),
    );
    mesh.castShadow = shadows;
    g.add(mesh);
  }

  // In the yards behind the terraces: a tree or two per plot, on the garden
  // side, which is the side away from the street.
  for (const p of plots) {
    if (rng() > 0.4 * dense) continue;
    const f = p.front || { x: 0, z: 1 };
    const back = 3 + rng() * 7;
    treeAt(p.x - f.x * (p.d / 2 + back) + (rng() - 0.5) * p.w * 0.6,
      p.z - f.z * (p.d / 2 + back) + (rng() - 0.5) * p.w * 0.6, 0.9);
  }
  // And scattered across the mapped parks, which are otherwise bare green.
  const span = terrain.span;
  const want = Math.round(900 * dense);
  for (let i = 0; i < want * 6 && crowns.length < want * 2; i++) {
    const x = (rng() * 2 - 1) * span * 0.95;
    const z = (rng() * 2 - 1) * span * 0.95;
    if (terrain.isWater(x, z)) continue;
    const m = terrain.maskAt(x, z);
    if (m.park < 0.35) continue;
    if (net && net.roadClearance(x, z) < 3) continue;
    treeAt(x, z, 0.9 + rng() * 0.5);
  }

  if (trunks.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(trunks, false),
      new THREE.MeshStandardMaterial({ color: 0x5a4432, roughness: 0.95 }),
    );
    mesh.castShadow = shadows;
    g.add(mesh);
  }
  if (crowns.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(crowns, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }),
    );
    mesh.castShadow = shadows;
    g.add(mesh);
  }

  // ── Roof furniture. From directly above, a bare extruded box reads as a
  // box; chimney stacks, lift housings and a parapet are what make it read as
  // a building. They are also the only detail on the surface the player spends
  // most of the game looking straight down at.
  const roofBits = [];
  for (const p of plots) {
    const stacks = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < stacks; k++) {
      const w = 0.9 + rng() * 1.1;
      const h = 1.6 + rng() * 1.8;
      const x = p.x + (rng() - 0.5) * (p.w - 3);
      const z = p.z + (rng() - 0.5) * (p.d - 3);
      const stack = new THREE.BoxGeometry(w, h, w * (0.8 + rng() * 1.6));
      stack.rotateY(p.yaw || 0);
      stack.translate(x, p.top + h / 2, z);
      tintOne(stack, 0x8d5a4a, 0.8 + rng() * 0.4);
      roofBits.push(stack);
    }
    // A lift overrun or stair head on the bigger blocks.
    if (Math.min(p.w, p.d) > 18 && rng() < 0.55) {
      const w = 4 + rng() * 3, d = 3 + rng() * 3, h = 2.4 + rng() * 1.4;
      const hut = new THREE.BoxGeometry(w, h, d);
      hut.rotateY(p.yaw || 0);
      hut.translate(p.x + (rng() - 0.5) * (p.w - w - 3), p.top + h / 2,
        p.z + (rng() - 0.5) * (p.d - d - 3));
      tintOne(hut, 0x9a958c, 0.85 + rng() * 0.3);
      roofBits.push(hut);
    }
  }
  if (roofBits.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(roofBits, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    );
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    g.add(mesh);
  }

  // ── Back gardens. The inside of a block is not paving: it is the yards
  // behind the terraces, and from above they are the green that stops a block
  // reading as one solid slab of roof and forecourt.
  const yards = [];
  for (const p of plots) {
    if (!p.front) continue;
    const back = 5 + rng() * 7;
    const yw = p.d * (0.8 + rng() * 0.2);
    const yard = new THREE.BoxGeometry(back, 0.2, yw);
    yard.rotateY(p.yaw || 0);
    const cx = p.x - p.front.x * (p.w / 2 + back / 2);
    const cz = p.z - p.front.z * (p.w / 2 + back / 2);
    if (terrain.isWater(cx, cz)) continue;
    yard.translate(cx, terrain.heightAt(cx, cz) + 0.1, cz);
    tintOne(yard, rng() < 0.3 ? 0x8f8368 : 0x4a6c33, 0.8 + rng() * 0.4);
    yards.push(yard);
  }
  if (yards.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(yards, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }),
    );
    mesh.receiveShadow = shadows;
    g.add(mesh);
  }

  // ── Forecourts. A pale apron between the building line and the pavement,
  // which is what makes a terrace sit *on* a street rather than float beside
  // one. Laid under the road surface, so where the two meet the road wins.
  const aprons = [];
  for (const p of plots) {
    const apron = new THREE.BoxGeometry(p.w + 3.4, 0.22, p.d + 3.4);
    apron.rotateY(p.yaw || 0);
    apron.translate(p.x, terrain.heightAt(p.x, p.z) + 0.11, p.z);
    tintOne(apron, 0xb9b3a4, 0.85 + rng() * 0.25);
    aprons.push(apron);
  }
  if (aprons.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(aprons, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }),
    );
    mesh.receiveShadow = shadows;
    g.add(mesh);
  }

  // ── River traffic. A couple of barges give the water a sense of scale and
  // of being *used*, and they move, which nothing else on the river does.
  const hulls = [];
  for (let i = 0; i < 9; i++) {
    // Walk out from the centre line until we find open water.
    let x = null, z = (rng() * 2 - 1) * span * 0.8;
    for (let probe = 40; probe < span * 0.9; probe += 14) {
      if (terrain.isWater(probe, z)) { x = probe + (rng() - 0.5) * 20; break; }
    }
    if (x === null || !terrain.isWater(x, z)) continue;
    const len = 16 + rng() * 22;
    const hull = new THREE.BoxGeometry(6.5, 2.6, len);
    hull.translate(x, terrain.waterLevel + 0.5, z);
    tintOne(hull, [0x4a4034, 0x3b4a52, 0x5a4a3a][Math.floor(rng() * 3)], 0.9);
    hulls.push(hull);
    const house = new THREE.BoxGeometry(4.6, 2.6, 5.5);
    house.translate(x, terrain.waterLevel + 3.1, z + len * 0.3);
    tintOne(house, 0xc9c2b2, 0.9);
    hulls.push(house);
  }
  if (hulls.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(hulls, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    );
    mesh.castShadow = shadows;
    g.add(mesh);
  }

  g.userData.squares = squares;
  g.userData.carparks = carparks;
  return g;
}

/** Paint one geometry a single colour, for the merged detail meshes. */
function tintOne(geo, hex, mul = 1) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex).multiplyScalar(mul);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}


/** Shared masonry material for bridge piers and abutments. */
let _pierMat = null;
function pierMatShared() {
  if (!_pierMat) {
    _pierMat = new THREE.MeshStandardMaterial({ color: 0x8a8272, roughness: 0.95 });
  }
  return _pierMat;
}
