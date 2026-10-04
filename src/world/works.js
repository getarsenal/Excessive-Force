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
 * And the ground is not cut. The terrain is a heightmap shared with the
 * physics and the water mask, so digging into it is a much larger change than
 * it looks. A trench seen from a gun position is a dark slot between two banks
 * with a wall of sandbags along the near lip and heads over the bags, and all
 * of that can be built on top of the ground: the slot's floor laid over the
 * grass, the banks bedded vertex by vertex either side of it, and the men
 * stood half a metre into the ground so the terrain takes their legs.
 */

/** Dug earth, sandbags, and the revetting boards behind them. */
const SPOIL = 0x6d6048;
const BAG = 0x8f8464;
const BOARD = 0x5d5240;
const GUNMETAL = 0x4a5238;
/** The floor of the slot: shaded earth, read from a distance as a hole. */
const CUT = 0x2b241b;

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
  // The half-diagonal: half the long side left the corners of a square
  // block outside the keep-out, and trench bays were dug in them.
  const footprints = plots.map((p) => ({
    x: p.x, z: p.z, r: Math.hypot(p.ax || p.w, p.az || p.d) / 2 + 2.5,
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
    // (every vertex of it is bedded on its own ground) and the limit put back up to a quarter, which is a
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
      // Men to a bay, and not all of the same thing.
      //
      // Mostly rifles, a gun group in about one bay in three, and the odd
      // sniper or AT team — roughly the mix a rifle section carries and, more
      // to the point, it means the line does not answer every attack the same
      // way. An AT team in a trench is the reason walking a gun up to the line
      // at close range is a bad idea.
      // Four men to a bay. Two was a picket, not a trench line: from a gun
      // position the belt read as empty ditches with the odd head in them.
      for (let m = 0; m < 4; m++) {
        const g = (m + 0.5) / 4 - 0.5;
        const px = x + tx * g * bayLen * 0.9 - nx * 0.12;
        const pz = z + tz * g * bayLen * 0.9 - nz * 0.12;
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
          x: px, z: pz, y: terrain.heightAt(px, pz) - 0.46, yaw: face, type, kind: 'trench',
        });
      }
    }
    return laid;
  };

  /** A gun pit behind the line, with something heavy in it. */
  const pit = (x, z, nx, nz, type) => {
    if (!siteOk(x, z)) return false;
    // Room for the pit itself, which is six metres across its bank, and for
    // flak a sky to shoot at. A pit sited only clear of a building's footprint
    // could be dug with its bank against the wall, and at Karnak the one flak
    // gun on the map stood seven metres from an eight-metre house that hid the
    // whole south-eastern sky: an aircraft came in over it on every run and
    // the gun never fired a round.
    const room = type === 'aa' ? 12 : 6;
    for (const f of footprints) {
      const dx = f.x - x, dz = f.z - z;
      if (dx * dx + dz * dz < (f.r + room) ** 2) return false;
    }
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
    // Two flak pits on opposite diagonals, and the other two diagonals if
    // one of those is built on or faces a friend — further out along the same
    // bearing, too, since a flak gun is worth walking forty metres for open
    // sky. A belt with no flak at all hands the sky to the player's strikes.
    let flak = 0;
    for (const [ax, az] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (flak >= 2) break;
      const [nx, nz] = rot(ax * 0.7071, az * 0.7071);
      if (facesFriend(nx, nz)) continue;
      for (const out of [6, 18, 30, 44, 60]) {
        if (pit(L.x + nx * (stand + out), L.z + nz * (stand + out), nx, nz, 'aa')) { flak++; break; }
      }
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
      // The face normal in the world, turned the way the building's mesh is.
      const nx = ax * Math.cos(py) + az * Math.sin(py);
      const nz = -ax * Math.sin(py) + az * Math.cos(py);
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
 * Sandbags are boxes and the earth is swept profiles tinted per vertex, so the
 * whole belt — a hundred bays, a dozen gun pits and the guns in them — merges
 * into a handful of meshes. `courses` is how high the bags go: two on a phone,
 * three everywhere else.
 */
function addFieldWorks(props, terrain, plan, rng, courses) {
  let bays = 0, pits = 0;
  for (const L of plan.lines) {
    if (L.pit) { gunPit(props, terrain, L, rng, courses); pits++; continue; }
    parapet(props, terrain, L, rng, courses);
    bays++;
  }
  return { trenchBays: bays, gunPits: pits };
}

/** One sandbag: 66 cm long, a quarter of a metre high, filled and slumped. */
const BAG_L = 0.66, BAG_H = 0.24, BAG_D = 0.42;

/**
 * One bay, dug.
 *
 * It used to be a row of spoil boxes standing on the grass with men sunk
 * behind it, and from a gun position that read as a line of elevated cubes —
 * which is what it was. A trench seen from two hundred metres is three things:
 * a dark slot in the ground, a low bank of thrown earth in front of it with a
 * wall of sandbags along its lip, and heads and shoulders over the bags. So
 * that is what is built. The ground itself is not cut (it is a heightmap
 * shared with the physics and the water mask); the channel is its dark floor
 * laid a hair over the grass, the banks either side are swept profiles bedded
 * vertex by vertex on the ground they stand on, and the men stand half a metre
 * into the ground in the middle of it, so the terrain takes their legs and the
 * bags come up to their chests.
 *
 * In the line's own frame: `d` is metres out toward the enemy from the fire
 * step, where the men stand; `s` is metres along the bay.
 */
function parapet(props, terrain, L, rng, courses) {
  const { x, z, yaw, len } = L;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const tx = -nz, tz = nx;
  const at = (s, d) => ({ x: x + tx * s + nx * d, z: z + tz * s + nz * d });
  const half = len / 2;
  // The spoil: low and sloped, the way earth thrown out of a hole lands.
  const BERM = [[2.9, -0.06], [1.9, 0.16], [1.15, 0.3], [0.62, 0.27], [0.56, -0.06]];
  const PARADOS = [[-0.7, -0.06], [-0.76, 0.2], [-1.35, 0.27], [-2.2, -0.06]];
  sweep(props, terrain, 'stone', SPOIL, at, -half, half, BERM, rng);
  sweep(props, terrain, 'stone', SPOIL, at, -half, half, PARADOS, rng);
  // The slot: dark floor from lip to lip, and duckboards down the middle of it.
  sweep(props, terrain, 'cut', CUT, at, -half - 0.3, half + 0.3, [[0.6, 0.02], [-0.74, 0.02]], rng, true);
  sweep(props, terrain, 'markings', BOARD, at, -half, half, [[0.12, 0.03], [-0.36, 0.03]], rng, true);
  // The bags along the lip, laid in running bond and each a little off square
  // the way they go up in a hurry. The crest is chest-high to the man on the
  // fire step, and that is what he shoots over.
  const n = Math.max(2, Math.floor(len / BAG_L));
  const step = len / n;
  for (let c = 0; c < courses; c++) {
    const shift = (c % 2) * step / 2;
    for (let i = 0; i < n - (c % 2); i++) {
      const p = at(-half + shift + (i + 0.5) * step, 0.84 - c * 0.05);
      const g = terrain.heightAt(p.x, p.z);
      props.add('stone', bag(step * 0.96, BAG_H, BAG_D, p.x, g + 0.26 + BAG_H * 0.5 + c * BAG_H * 0.9, p.z,
        yaw + (rng() - 0.5) * 0.1), BAG, 0.84 + rng() * 0.24);
    }
  }
  // A traverse at the end of the bay: a block of bags across the slot, so one
  // shell takes one bay.
  if (L.traverse) {
    for (let c = 0; c < courses + 1; c++) {
      for (let k = 0; k < 3; k++) {
        const p = at(half + 0.5, 0.45 - k * 0.55 + (c % 2) * 0.12);
        const g = terrain.heightAt(p.x, p.z);
        props.add('stone', bag(BAG_L, BAG_H, BAG_D, p.x, g + BAG_H * 0.5 + c * BAG_H * 0.9, p.z,
          yaw + Math.PI / 2 + (rng() - 0.5) * 0.1), BAG, 0.84 + rng() * 0.22);
      }
    }
  }
}

/**
 * Sweep a cross-section along a bay, every vertex bedded on the ground under
 * it. `profile` is [[offset across the line, height over the ground]], walked
 * in order; `flat` lays a one-sided ribbon (a floor, a duckboard).
 */
function sweep(props, terrain, bucket, colour, at, s0, s1, profile, rng, flat = false) {
  const segs = Math.max(2, Math.round((s1 - s0) / 1.6));
  const rows = profile.length;
  const pos = [];
  const idx = [];
  for (let k = 0; k <= segs; k++) {
    const s = s0 + ((s1 - s0) * k) / segs;
    for (let r = 0; r < rows; r++) {
      const [d, h] = profile[r];
      const p = at(s, d);
      const wob = (!flat && h > 0.05) ? (rng() - 0.5) * 0.07 : 0;
      pos.push(p.x, terrain.heightAt(p.x, p.z) + h + wob, p.z);
    }
  }
  for (let k = 0; k < segs; k++) {
    for (let r = 0; r < rows - 1; r++) {
      const a = k * rows + r, b = a + 1, c = a + rows, e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
  }
  props.add(bucket, surface(pos, idx, !flat), colour, 0.94 + rng() * 0.1);
}

/**
 * An indexed surface with the attributes a box has, so it merges into the same
 * bucket as one. `twoSided` adds every triangle again reversed: the banks are
 * seen from both sides, whichever way their profile happened to be walked.
 */
function surface(pos, idx, twoSided) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (twoSided) {
    // Lit from the side that faces the sky, which is the side anyone sees;
    // the normals are taken before the reversed faces go in, or the two
    // would cancel and the bank would render black.
    const nm = g.attributes.normal;
    for (let i = 0; i < nm.count; i++) if (nm.getY(i) < 0) nm.setXYZ(i, -nm.getX(i), -nm.getY(i), -nm.getZ(i));
    const all = idx.slice();
    for (let i = 0; i < idx.length; i += 3) all.push(idx[i], idx[i + 2], idx[i + 1]);
    g.setIndex(all);
  }
  return g;
}

/** A sandbag: a box with its top edges drawn in, so a row of them reads as bags. */
function bag(w, h, d, x, y, z, ry) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.9);
      p.setZ(i, p.getZ(i) * 0.8);
    }
  }
  g.computeVertexNormals();
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/**
 * A gun pit: a dug floor, a round wall of sandbags open to the front with the
 * spoil banked against the outside of it, and the piece in the middle.
 */
function gunPit(props, terrain, L, rng, courses) {
  const { x, z, yaw } = L;
  const g = terrain.heightAt(x, z);
  const R = L.weapon === 'aa' ? 3.4 : 4.0;
  const seg = 16;
  const ringAt = (a, r, h) => {
    const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    return [px, terrain.heightAt(px, pz) + h, pz];
  };
  // The floor.
  const floor = [x, g + 0.02, z];
  const fIdx = [];
  for (let i = 0; i < seg; i++) {
    floor.push(...ringAt((i / seg) * Math.PI * 2, R - 0.1, 0.02));
    fIdx.push(0, 1 + i, 1 + ((i + 1) % seg));
  }
  props.add('cut', surface(floor, fIdx, false), CUT, 1);
  // The wall, in running bond, with a gap at the front for the barrel.
  const around = Math.round((Math.PI * 2 * R) / BAG_L);
  const facing = (a) => { const o = a - yaw; return Math.abs(Math.atan2(Math.sin(o), Math.cos(o))); };
  for (let c = 0; c < courses + 1; c++) {
    for (let i = 0; i < around; i++) {
      const a = ((i + (c % 2) * 0.5) / around) * Math.PI * 2;
      if (facing(a) < 0.5) continue;
      const [px, gy, pz] = ringAt(a, R - c * 0.04, 0);
      props.add('stone', bag(BAG_L, BAG_H, BAG_D, px, gy + BAG_H * 0.5 + c * BAG_H * 0.9, pz,
        a + Math.PI / 2 + (rng() - 0.5) * 0.1), BAG, 0.84 + rng() * 0.24);
    }
  }
  // The spoil banked against the outside, a ring of quads from the top of the
  // bags down to the grass.
  const bank = [];
  const bIdx = [];
  const top = BAG_H * (courses + 0.6);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    if (facing((a0 + a1) / 2) < 0.62) continue;
    const b = bank.length / 3;
    bank.push(...ringAt(a0, R + 0.25, top), ...ringAt(a1, R + 0.25, top),
      ...ringAt(a0, R + 1.7, -0.06), ...ringAt(a1, R + 1.7, -0.06));
    bIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  if (bIdx.length) props.add('stone', surface(bank, bIdx, true), SPOIL, 0.95);
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
    // The streets and the grid's bearing, which the caller gives and which
    // were never passed on: trenches were dug across the carriageways.
    net: opts.net || null,
    yaw: opts.yaw || 0,
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
  const counts = addFieldWorks(props, terrain, plan, rng, quality.name === 'low' ? 2 : 3);
  const group = new THREE.Group();
  group.name = 'fieldworks';
  // The trench floor is laid a hair over the grass: offset so it wins, and a
  // tier short of the road paint so a duckboard wins over it in turn.
  props.flush(group, { ...MATERIALS, cut: { roughness: 1, cast: false, offset: true, offsetLevel: 3, renderOrder: 1 } });
  return { group, posts: plan.posts, counts };
}
