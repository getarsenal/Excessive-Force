import * as THREE from 'three';
import { box, cyl, PropSet, MATERIALS } from './detail.js';
import { halfWidth } from './streets.js';

/**
 * Field works.
 *
 * The garrison used to be a building full of men with a ring of sandbags round
 * the landmark's own feet, and everything more than a hundred metres out was
 * open lawn. That reads as a monument someone happens to be shooting from. An
 * objective that an army has had time to prepare does not look like that: it
 * looks like a belt — a trench line stood off from the thing it protects, cut
 * into bays so one shell takes one bay, with traverses between them, gun pits
 * behind the line where the ground gives a field of fire, and the same
 * treatment round every building in the perimeter rather than only the famous
 * one.
 *
 * Two decisions shape everything here.
 *
 * The works are scenery, not masonry. A trench is not something the tower
 * stands on, nothing bears on it, and making it a `Structure` would buy a
 * support graph nobody queries at the cost of a physics body per sandbag. It
 * goes into the same merged prop buckets as the lamp posts, which is a handful
 * of triangles and no draw calls of its own.
 *
 * And a trench here is a parapet rather than a hole. The terrain is a heightmap
 * shared with the physics and the water mask, so cutting into it is a much
 * larger change than it looks; but a trench you can see from a gun position is
 * mostly its own spoil anyway — the bank thrown up in front, the revetment
 * behind it, the men's heads above the parapet. Building the bank and standing
 * the men behind it gives the same picture from every angle the camera has.
 */

/** Dug earth, sandbags, and the revetting boards behind them. */
const SPOIL = 0x6d6048;
const BAG = 0x8f8464;
const BOARD = 0x5d5240;
const GUNMETAL = 0x4a5238;

/**
 * Where the works go.
 *
 * Laid as a belt round each thing worth defending: four runs, one per side,
 * stood off far enough that a shell landing on the trench is not also landing
 * on the building. The standoff is a fraction of the building's own size
 * rather than a fixed distance, because the same rule has to produce something
 * sensible round a 130 m tower and round an 18 m terrace house.
 *
 * Returns the geometry plan and the list of positions to man, so the garrison
 * can post men into works it did not have to know how to build.
 */
function planFieldWorks(opts = {}) {
  const {
    terrain, landmarks = [], plots = [], net = null, yaw = 0,
    exclude = 66, budget = 90,
  } = opts;
  const rnd = mulberry(0x31f2a7);
  const lines = [];
  const posts = [];

  // ── Where a work may go.
  //
  // One predicate, asked everywhere, rather than a list of special cases per
  // level. Everything that has ever looked wrong in this belt — a parapet
  // through a road, a gun pit half in the Thames, a trench climbing the Taj's
  // plinth, a bay hanging off the side of a cutting — is the same question
  // asked in a different place, and a map that has not been written yet will
  // ask it again. So it lives here, and the levels get it for free.
  const roads = [];
  if (net && net.edges) {
    for (const e of net.edges) {
      const r = halfWidth(e.cls) + 2.5;
      for (let i = 0; i < e.pts.length - 1; i++) {
        roads.push({ x0: e.pts[i].x, z0: e.pts[i].z, x1: e.pts[i + 1].x, z1: e.pts[i + 1].z, r });
      }
    }
  }
  const footprints = plots.map((p) => ({
    x: p.x, z: p.z, r: Math.max(p.ax || p.w, p.az || p.d) / 2 + 2.5,
  }));

  /** Distance from a point to a segment, squared. */
  const segD2 = (px, pz, s) => {
    const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((px - s.x0) * dx + (pz - s.z0) * dz) / L)) : 0;
    const qx = s.x0 + dx * t - px, qz = s.z0 + dz * t - pz;
    return qx * qx + qz * qz;
  };

  const siteOk = (x, z) => {
    if (terrain.isWater(x, z)) return false;
    // Ground you could actually dig in. A bay laid across a cutting or down an
    // embankment has half its length buried and the other half in mid-air,
    // which is most of what "they do not line up with the terrain" looks like.
    const g = terrain.heightAt(x, z);
    const slope = Math.max(
      Math.abs(terrain.heightAt(x + 4, z) - g),
      Math.abs(terrain.heightAt(x - 4, z) - g),
      Math.abs(terrain.heightAt(x, z + 4) - g),
      Math.abs(terrain.heightAt(x, z - 4) - g),
    ) / 4;
    // Nought-point-three was measured wrong and set too high, and the Acropolis
    // is what proved it. A grade of 0.30 over eight metres is a seventeen-degree
    // hillside, and a bay is nineteen metres long: laid down one, its ends
    // differ by five and a half metres and the bank — which is a row of boxes,
    // each one bedded to its own patch of ground and each one square — comes
    // out as a flight of black steps standing on the slope with daylight under
    // the nose of every tread. The photograph of it is unmistakable and it is
    // exactly what "the trenches at the base of the hill are floating" means.
    // Sixteen hundredths is about nine degrees, which is ground a man with a
    // spade would actually choose — and it is also most of the Corcovado's
    // garrison, because a mountain top has no such ground within two hundred
    // metres of itself. So the bank was taught to lie along the slope instead
    // (see `pitchedBox`) and the limit put back up to a quarter, which is a
    // fourteen-degree hillside: steep for a trench, but it is a trench that
    // now follows the hill rather than stepping down it.
    if (slope > 0.25) return false;
    // And ground nobody has already built on or paved.
    for (const f of footprints) {
      const dx = f.x - x, dz = f.z - z;
      if (dx * dx + dz * dz < f.r * f.r) return false;
    }
    for (const r of roads) {
      if (segD2(x, z, r) < r.r * r.r) return false;
    }
    return true;
  };

  /**
   * One run of trench, `len` long, centred at (cx, cz) and facing outward
   * along (nx, nz).
   *
   * Broken into bays with a traverse between each pair. That is not decoration:
   * a straight trench is one long room, and the whole reason a real one zigzags
   * is that a shell landing anywhere in it would otherwise sweep the lot. It is
   * also what makes a line read as a trench at two hundred metres rather than
   * as a hedge.
   *
   * A bay whose ground will not take it is skipped rather than moved. The line
   * then has gaps in it where the river, the road or the terrace is, which is
   * what a real one does and is far better than a continuous line that walks
   * through all three.
   */
  const run = (cx, cz, nx, nz, len, weight) => {
    const face = Math.atan2(nx, nz);
    const tx = -nz, tz = nx;                  // along the line
    const bays = Math.max(2, Math.round(len / 19));
    let laid = 0;
    for (let b = 0; b < bays; b++) {
      const f = ((b + 0.5) / bays) * 2 - 1;
      const step = (b % 2) * 1.8;             // the zigzag, one bay in two
      const x = cx + tx * f * len / 2 + nx * step;
      const z = cz + tz * f * len / 2 + nz * step;
      const bayLen = len / bays - 1.6;
      // Both ends and the middle, so a bay never straddles a kerb or a bank —
      // and the bank and the parados with them, because those stand a metre
      // and a half either side of the line and a cross-slope puts one of them
      // in the air whatever the ground under the line itself is doing.
      const ends = [[0, 0], [tx * bayLen * 0.45, tz * bayLen * 0.45],
        [-tx * bayLen * 0.45, -tz * bayLen * 0.45]];
      let sited = true;
      for (const [ox, oz] of ends) {
        if (!siteOk(x + ox, z + oz)
          || !siteOk(x + ox + nx * 1.4, z + oz + nz * 1.4)
          || !siteOk(x + ox - nx * 1.4, z + oz - nz * 1.4)) { sited = false; break; }
      }
      if (!sited) continue;
      // And level enough end to end. The slope rule above is a gradient at a
      // point; this is the fall across the whole bay, and a bay that drops
      // four metres in nineteen is a flight of stairs whatever its boxes do.
      const hA = terrain.heightAt(x + ends[1][0], z + ends[1][1]);
      const hB = terrain.heightAt(x + ends[2][0], z + ends[2][1]);
      if (Math.abs(hA - hB) > 3.4) continue;
      lines.push({ x, z, yaw: face, len: bayLen, traverse: b < bays - 1 });
      laid++;
      // Two men to a bay, and not two of the same thing.
      //
      // Mostly rifles, a gun group in about one bay in three, and the odd
      // sniper or AT team — roughly the mix a rifle section carries and, more
      // to the point, it means the line does not answer every attack the same
      // way. An AT team in a trench is the reason walking a gun up to the line
      // at close range is a bad idea.
      for (let m = 0; m < 2; m++) {
        const g = (m + 0.5) - 1;
        const px = x + tx * g * bayLen * 0.8 - nx * 1.15;
        const pz = z + tz * g * bayLen * 0.8 - nz * 1.15;
        const roll = rnd();
        const type = (m === 0 && b % 3 === 0) ? 'mg'
          : roll < 0.09 ? 'sniper'
            : roll < 0.15 && weight > 1 ? 'at'
              : 'rifleman';
        // Standing *in* it, not beside it. A man at full height behind a
        // knee-high bank reads as someone who happens to be near a wall; drop
        // him two thirds of a metre and the bank takes his legs, which is the
        // whole picture the words "dug in" are doing.
        posts.push({
          x: px, z: pz, y: terrain.heightAt(px, pz) - 0.62, yaw: face, type, kind: 'trench',
        });
      }
    }
    return laid;
  };

  /** A gun pit behind the line, with something heavy in it. */
  const pit = (x, z, nx, nz, type) => {
    if (!siteOk(x, z)) return false;
    // A horseshoe of spoil is eight metres across, so the ground under the ring
    // has to be as level as the ground under its centre: the same staircase
    // happens round a gun pit, it is just harder to name.
    const gc = terrain.heightAt(x, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (Math.abs(terrain.heightAt(x + Math.sin(a) * 4, z + Math.cos(a) * 4) - gc) > 1.2) {
        return false;
      }
    }
    const face = Math.atan2(nx, nz);
    lines.push({ x, z, yaw: face, pit: true, weapon: type });
    posts.push({ x, z, y: terrain.heightAt(x, z) + 0.3, yaw: face, type, kind: 'pit' });
    return true;
  };

  // The frame the place is laid out on, not the compass.
  //
  // The city, its streets and its precinct are all built square to `GRID_YAW`,
  // and a defence line that ignores it crosses every road it meets at whatever
  // angle the map happens to make — which is the other half of "they do not
  // line up with the buildings". Rotating the four outward normals into the
  // same frame puts the belt square to the place it is defending.
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rot = (nx, nz) => [nx * cy - nz * sy, nx * sy + nz * cy];

  // ── The landmarks. The belt that matters, and the only one the player can
  // see from the opening camera.
  //
  // Laid round groups rather than round buildings. The Taj, its mosque and its
  // jawab stand within a hundred metres of each other, and four runs round each
  // of the three gives two belts dug between two of the buildings, facing each
  // other, with the inner half of the garrison looking at a wall — which is
  // what the field-of-fire check found the first time this ran. Anything within
  // a couple of hundred metres shares one perimeter.
  const clusters = [];
  for (const L of landmarks) {
    const near = clusters.find((c) => Math.hypot(c.x - L.x, c.z - L.z) < 200);
    if (near) {
      const x0 = Math.min(near.x - near.w / 2, L.x - L.w / 2);
      const x1 = Math.max(near.x + near.w / 2, L.x + L.w / 2);
      const z0 = Math.min(near.z - near.d / 2, L.z - L.d / 2);
      const z1 = Math.max(near.z + near.d / 2, L.z + L.d / 2);
      near.x = (x0 + x1) / 2; near.z = (z0 + z1) / 2;
      near.w = x1 - x0; near.d = z1 - z0;
    } else {
      clusters.push({ x: L.x, z: L.z, w: L.w, d: L.d });
    }
  }
  for (const L of clusters) {
    const half = Math.max(L.w, L.d) / 2;
    const stand = half * 1.22 + 26;
    const len = Math.min(half * 2.4 + 40, stand * 1.9);
    // Nothing facing another objective. Giza's pyramids are half a kilometre
    // apart, which is far too far to share a perimeter and close enough that
    // Khufu's western line would be looking straight at Khafre.
    //
    // On the bearing, not merely on that side of the line: a bare sign test
    // says a cluster one metre to the east is "east", and the Palais de
    // Chaillot — 210 m up the Champ de Mars and a metre off its axis — took the
    // Eiffel's eastern run, its eastern gun and both of its flak pits with it.
    const facesFriend = (nx, nz) => {
      const nl = Math.hypot(nx, nz) || 1;
      return clusters.some((o) => {
        if (o === L) return false;
        const dx = o.x - L.x, dz = o.z - L.z;
        const dist = Math.hypot(dx, dz) || 1;
        if ((dx * nx + dz * nz) / (dist * nl) < 0.55) return false;
        return dist - Math.max(o.w, o.d) / 2 < stand * 2.6;
      });
    };
    for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const [nx, nz] = rot(ax, az);
      if (facesFriend(nx, nz)) continue;
      // A line that could not be dug at all — the whole side is river, or road,
      // or the terrace — gets no gun behind it either.
      if (!run(L.x + nx * stand, L.z + nz * stand, nx, nz, len, 2)) continue;
      pit(L.x + nx * (stand + 13), L.z + nz * (stand + 13), nx, nz, 'fieldgun');
    }
    for (const [ax, az] of [[1, 1], [-1, -1]]) {
      const [nx, nz] = rot(ax * 0.7071, az * 0.7071);
      if (facesFriend(nx, nz)) continue;
      pit(L.x + nx * (stand + 6), L.z + nz * (stand + 6), nx, nz, 'aa');
    }
    // An observer, far enough back to see the whole approach — and on land.
    for (const [ax, az] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
      const [nx, nz] = rot(ax * 0.7071, az * 0.7071);
      const ox = L.x + nx * stand * 2.2, oz = L.z + nz * stand * 2.2;
      if (!siteOk(ox, oz)) continue;
      posts.push({ x: ox, z: oz, y: terrain.heightAt(ox, oz) + 0.3,
        yaw: Math.atan2(-nx, -nz), type: 'spotter', kind: 'pit' });
      break;
    }
  }

  // ── And every other building in the perimeter.
  //
  // "All the buildings" is the point, but it is also two hundred terraces on a
  // map that can carry a couple of hundred defenders in total. So the belt
  // thins with distance: every block near the objective is dug in, and it falls
  // away to the odd corner position at the edge of the city, which is also what
  // a defence in depth looks like from the air.
  const ranked = plots
    .map((p) => ({ p, r: Math.hypot(p.x, p.z) }))
    .filter((e) => e.r > exclude - 10)
    .sort((a, b) => a.r - b.r);
  const far = ranked.length ? ranked[ranked.length - 1].r : 1;
  let dug = 0;
  for (const { p, r } of ranked) {
    if (dug >= budget) break;
    const t = Math.min(1, Math.max(0, (r - exclude) / Math.max(1, far - exclude)));
    if (rnd() > 1 - t * 0.86) continue;
    // Along the building's own frontage, not along a compass bearing. A terrace
    // stands square to its street, so the line in front of it should too.
    const half = Math.max(p.ax || p.w, p.az || p.d) / 2;
    const stand = half + 7;
    const py = p.yaw || yaw;
    // Whichever of the building's four faces points furthest from the
    // objective: the men are defending it, so they are looking away from it.
    const away = Math.hypot(p.x, p.z) || 1;
    const ux = p.x / away, uz = p.z / away;
    let bestN = null, bestDot = -Infinity;
    for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = ax * Math.cos(py) - az * Math.sin(py);
      const nz = ax * Math.sin(py) + az * Math.cos(py);
      const dot = nx * ux + nz * uz;
      if (dot > bestDot) { bestDot = dot; bestN = [nx, nz]; }
    }
    const [nx, nz] = bestN;
    if (!run(p.x + nx * stand, p.z + nz * stand, nx, nz, Math.min(half * 2 + 8, 30), 1)) continue;
    if (t < 0.3 && dug % 3 === 0) {
      pit(p.x + nx * (stand + 9), p.z + nz * (stand + 9), nx, nz, 'fieldgun');
    }
    dug++;
  }

  return { lines, posts };
}

/**
 * Build what the plan describes into the city's prop buckets.
 *
 * Everything is a box or a short cylinder tinted per vertex, so the whole belt
 * — a hundred bays, a dozen gun pits and the guns in them — merges into the
 * meshes the street furniture already uses.
 */
function addFieldWorks(props, terrain, plan, rng) {
  let bays = 0, pits = 0;
  for (const L of plan.lines) {
    if (L.pit) { gunPit(props, terrain, L, rng); pits++; continue; }
    parapet(props, terrain, L, rng);
    bays++;
  }
  return { trenchBays: bays, gunPits: pits };
}

/**
 * A box laid along a slope rather than across it.
 *
 * `box` can only be turned about the upright, so a run of them down a grade
 * comes out as a flight of steps: every tread level, every nose hanging over
 * the ground in front of it. That is what the Acropolis showed — a black
 * staircase pinned to the side of the rock with daylight under it — and no
 * amount of sinking the boxes fixes it, because the fault is that the tops are
 * level and the hill is not. Pitching each box about its own cross axis by the
 * grade it stands on costs one rotation and makes the bank follow the ground.
 */
function pitchedBox(w, h, d, x, y, z, ry, pitch) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pitch) g.rotateZ(pitch);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** One bay: the bank in front, the fire step behind it, and a traverse. */
function parapet(props, terrain, L, rng) {
  const { x, z, yaw, len } = L;
  // Buried to the local ground, not to the bay's.
  //
  // Each box takes its own height off the terrain and is sunk far enough that
  // the lowest corner it could have is still under the surface. Sitting a
  // fixed-height box on a single sampled height is what left banks floating
  // over a slope on one side and half-swallowed on the other, and the ground
  // under a two-hundred-metre belt is never flat for all of it.
  const tx = -Math.sin(yaw + Math.PI / 2), tz = -Math.cos(yaw + Math.PI / 2);
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  // Where a box's own length points, in the world. `box` puts its width on the
  // local X axis, and a yaw of `yaw` swings that to the negative of the line's
  // tangent — so this is the direction the grade below has to be measured in.
  const ux = -tx, uz = -tz;
  const n = Math.max(2, Math.round(len / 2.6));
  /** The grade a box of length `l` centred here stands on, and its mid height. */
  const lie = (cx, cz, l) => {
    const a = terrain.heightAt(cx + ux * l / 2, cz + uz * l / 2);
    const b = terrain.heightAt(cx - ux * l / 2, cz - uz * l / 2);
    return { pitch: Math.atan2(a - b, l), mid: (a + b) / 2 };
  };
  /** How far the cross slope would leave one flank of a box in the air. */
  const flank = (cx, cz, mid, half) => Math.max(0.35, mid
    - Math.min(terrain.heightAt(cx + nx * half, cz + nz * half),
      terrain.heightAt(cx - nx * half, cz - nz * half)) + 0.3);
  for (let i = 0; i < n; i++) {
    const f = ((i + 0.5) / n) * 2 - 1;
    const px = x + tx * f * len / 2, pz = z + tz * f * len / 2;
    const bankX = px + nx * 0.85, bankZ = pz + nz * 0.85;
    const { pitch, mid } = lie(bankX, bankZ, 2.7);
    const h = 1.15 + rng() * 0.3;
    const sink = flank(bankX, bankZ, mid, 0.95);
    // The bank, thrown a little unevenly the way spoil lands.
    props.add('stone', pitchedBox(2.7, h + sink, 1.9,
      bankX, mid + (h - sink) / 2 - 0.05, bankZ, yaw, pitch), SPOIL, 0.94 + rng() * 0.12);
    // Sandbags along the crest of every second length, so the line has a
    // rhythm rather than being one long mound.
    if (i % 2 === 0) {
      const bag = lie(px + nx * 1.3, pz + nz * 1.3, 2.5);
      props.add('stone', pitchedBox(2.5, 0.36, 0.7,
        px + nx * 1.3, bag.mid + h - 0.2, pz + nz * 1.3, yaw, bag.pitch),
      BAG, 0.92 + rng() * 0.16);
    }
    // The parados behind the trench, which is both what a real one has and
    // what stops the men reading as sunk into bare grass when the camera comes
    // round to the objective's side.
    const backX = px - nx * 1.25, backZ = pz - nz * 1.25;
    const back = lie(backX, backZ, 2.6);
    const backSink = flank(backX, backZ, back.mid, 0.4);
    props.add('stone', pitchedBox(2.6, 0.75 + backSink, 0.75,
      backX, back.mid + (0.75 - backSink) / 2, backZ, yaw, back.pitch),
    SPOIL, 0.9 + rng() * 0.1);
    const stepX = px - nx * 0.78, stepZ = pz - nz * 0.78;
    const step = lie(stepX, stepZ, 2.6);
    props.add('dark', pitchedBox(2.6, 0.62, 0.14,
      stepX, step.mid - 0.12, stepZ, yaw, step.pitch), BOARD, 1);
  }
  if (L.traverse) {
    const ex = x + tx * (len / 2 + 0.9), ez = z + tz * (len / 2 + 0.9);
    const low = lowestUnder(terrain, ex, ez, 0.7, 1.7, yaw);
    const rise = terrain.heightAt(ex, ez) - low;
    props.add('stone', box(1.2, 1.0 + rise, 3.2, ex, low + (1.0 + rise) / 2 - 0.06, ez, yaw),
      SPOIL, 0.96);
  }
}

/**
 * The lowest ground under a box's footprint.
 *
 * Four corners and the middle. A box is axis-aligned about its own yaw and
 * cannot be pitched, so the only way to keep one from hanging over a slope is
 * to start it at the bottom of what it covers and make it tall enough to reach
 * the top. That is also what a real parapet is: the bank is thicker on the
 * downhill side because that is where the spoil went.
 */
function lowestUnder(terrain, cx, cz, hx, hz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let low = terrain.heightAt(cx, cz);
  for (const [ox, oz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    const x = cx + ox * c + oz * s;
    const z = cz - ox * s + oz * c;
    const g = terrain.heightAt(x, z);
    if (g < low) low = g;
  }
  return low;
}

/**
 * A gun pit: a horseshoe of spoil with the piece in it.
 *
 * Open to the front, which is both how one is built and what lets the gun in
 * the middle read as a gun rather than as a shape inside a ring.
 */
function gunPit(props, terrain, L, rng) {
  const { x, z, yaw } = L;
  const g = terrain.heightAt(x, z);
  const R = L.weapon === 'aa' ? 3.4 : 4.0;
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = yaw + Math.PI + (-0.76 + (i / (n - 1)) * 1.52) * Math.PI;
    const px = x + Math.sin(a) * R, pz = z + Math.cos(a) * R;
    const h = 0.95 + rng() * 0.25;
    const low = lowestUnder(terrain, px, pz, 0.75, 0.6, a);
    const rise = terrain.heightAt(px, pz) - low;
    props.add('stone', box(1.5, h + rise, 1.2, px, low + (h + rise) / 2 - 0.1, pz,
      a), SPOIL, 0.93 + rng() * 0.13);
  }
  if (L.weapon === 'fieldgun') {
    // A long barrel over a shield on two wheels, laid along the pit's facing.
    props.add('metal', box(0.22, 0.22, 4.6, x + Math.sin(yaw) * 1.9, g + 1.15,
      z + Math.cos(yaw) * 1.9, yaw), GUNMETAL, 1);
    props.add('metal', box(2.4, 1.15, 0.16, x, g + 0.85, z, yaw), GUNMETAL, 1);
    for (const s of [-1, 1]) {
      props.add('dark', cyl(0.5, 0.5, 0.22, 10,
        x + Math.cos(yaw) * s * 1.1, g + 0.5, z - Math.sin(yaw) * s * 1.1), 0x2e3228, 1);
    }
    props.add('metal', box(0.4, 0.4, 2.6, x - Math.sin(yaw) * 1.5, g + 0.4,
      z - Math.cos(yaw) * 1.5, yaw), GUNMETAL, 1);
  } else {
    // Flak: a short barrel cocked up on a pedestal, which is the one profile
    // that says "this one is shooting at the aircraft".
    props.add('metal', cyl(0.55, 0.7, 0.9, 8, x, g + 0.45, z), GUNMETAL, 1);
    const up = box(0.2, 2.6, 0.2, 0, 0, 0, 0);
    up.rotateX(-0.9);
    up.translate(x + Math.sin(yaw) * 0.5, g + 1.9, z + Math.cos(yaw) * 0.5);
    props.add('metal', up, GUNMETAL, 1);
    props.add('metal', box(1.5, 0.5, 1.5, x, g + 1.15, z, yaw), GUNMETAL, 1);
  }
}

/** The same small deterministic PRNG the rest of the world layer uses. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plan the belt and build it, in one call.
 *
 * Owns its own prop set and its own mesh, rather than riding on the city's.
 * There are two ways a city gets built here — real baked footprints when they
 * exist, the hand-placed approximation when they do not — and the works belong
 * to the level rather than to either of them, so they are laid outside both
 * from whichever list of buildings turned up.
 *
 * @returns {{group: THREE.Group, posts: Array, counts: object}}
 */
export function buildFieldWorks(terrain, quality, opts = {}) {
  const plan = planFieldWorks({
    terrain,
    plots: opts.plots || [],
    exclude: opts.exclude || 70,
    landmarks: opts.landmarks || [],
    // How many buildings beyond the landmarks get a line of their own. A phone
    // carries the belt round the objective and a thinner one through the
    // streets; it does not go without, because the works are what the level is
    // about rather than clutter on it.
    budget: { low: 26, medium: 54, high: 80, ultra: 104 }[quality.name] ?? 54,
  });
  const props = new PropSet(quality);
  const rng = mulberry(0x77c41d);
  const counts = addFieldWorks(props, terrain, plan, rng);
  const group = new THREE.Group();
  group.name = 'fieldworks';
  props.flush(group, MATERIALS);
  return { group, posts: plan.posts, counts };
}
