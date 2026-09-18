import * as THREE from 'three';
import { box, cyl, PropSet, MATERIALS } from './detail.js';

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
  const { terrain, landmarks = [], plots = [], exclude = 66, budget = 90 } = opts;
  const rnd = mulberry(0x31f2a7);
  const lines = [];
  const posts = [];

  /**
   * One run of trench, `len` long, centred at (cx, cz) and facing outward
   * along (nx, nz).
   *
   * Broken into bays with a traverse between each pair. That is not decoration:
   * a straight trench is one long room, and the whole reason a real one zigzags
   * is that a shell landing anywhere in it would otherwise sweep the lot. It is
   * also the thing that makes a line read as a trench at two hundred metres
   * rather than as a hedge.
   */
  const run = (cx, cz, nx, nz, len, weight) => {
    const yaw = Math.atan2(nx, nz);
    const tx = -nz, tz = nx;                  // along the line
    const bays = Math.max(2, Math.round(len / 19));
    for (let b = 0; b < bays; b++) {
      const f = ((b + 0.5) / bays) * 2 - 1;
      const step = (b % 2) * 1.8;             // the zigzag, one bay in two
      const x = cx + tx * f * len / 2 + nx * step;
      const z = cz + tz * f * len / 2 + nz * step;
      if (terrain.isWater(x, z)) continue;
      const bayLen = len / bays - 1.6;
      lines.push({ x, z, yaw, len: bayLen, traverse: b < bays - 1 });
      // Two men to a bay, and not two of the same thing.
      //
      // Mostly rifles, a gun group in about one bay in three, and the odd
      // sniper or AT team — which is roughly the mix a rifle section carries
      // and, more to the point, means the line does not answer every attack
      // the same way. An AT team in a trench is the reason walking a gun up to
      // the line at close range is a bad idea.
      const men = weight > 1 ? 2 : 2;
      for (let m = 0; m < men; m++) {
        const g = ((m + 0.5) / men) * 2 - 1;
        const px = x + tx * g * bayLen * 0.4 - nx * 1.15;
        const pz = z + tz * g * bayLen * 0.4 - nz * 1.15;
        const roll = rnd();
        const type = (m === 0 && b % 3 === 0) ? 'mg'
          : roll < 0.09 ? 'sniper'
            : roll < 0.15 && weight > 1 ? 'at'
              : 'rifleman';
        // Standing *in* it, not beside it. A man at full height behind a
        // knee-high bank reads as someone who happens to be near a wall; drop
        // him two thirds of a metre and the bank takes his legs, which is the
        // whole picture the word "dug in" is doing.
        posts.push({
          x: px, z: pz, y: terrain.heightAt(px, pz) - 0.62, yaw, type, kind: 'trench',
        });
      }
    }
  };

  /** A gun pit behind the line, with something heavy in it. */
  const pit = (x, z, nx, nz, type) => {
    if (terrain.isWater(x, z)) return;
    const yaw = Math.atan2(nx, nz);
    lines.push({ x, z, yaw, pit: true, weapon: type });
    posts.push({ x, z, y: terrain.heightAt(x, z) + 0.3, yaw, type, kind: 'pit' });
  };

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
    const near = clusters.find(
      (c) => Math.hypot(c.x - L.x, c.z - L.z) < 200);
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
    // And still nothing facing another objective. Giza's pyramids are half a
    // kilometre apart, which is far too far to share a perimeter and close
    // enough that Khufu's western line would be looking straight at Khafre.
    //
    // On the bearing, not merely on that side of the line. A bare sign test
    // says a cluster one metre to the east is "east", so the Palais de
    // Chaillot — 210 m up the Champ de Mars and a metre off its axis — took
    // the Eiffel's eastern run, its eastern gun and both of its flak pits with
    // it, and the level went up with no anti-aircraft gun on it at all.
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
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (facesFriend(nx, nz)) continue;
      run(L.x + nx * stand, L.z + nz * stand, nx, nz, len, 2);
      // A field gun behind the middle of each run, and flak on two corners.
      pit(L.x + nx * (stand + 13), L.z + nz * (stand + 13), nx, nz, 'fieldgun');
    }
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      if (facesFriend(sx, sz)) continue;
      pit(L.x + sx * (stand + 6), L.z + sz * (stand + 6), sx * 0.7, sz * 0.7, 'aa');
    }
    // An observer, far enough back to see the whole approach — and on land.
    // Westminster's landmarks sit on a river bend, and the first corner tried
    // put both observers in the Thames.
    for (const [sx, sz] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
      const ox = L.x + sx * stand * 1.6, oz = L.z + sz * stand * 1.6;
      if (terrain.isWater(ox, oz)) continue;
      posts.push({ x: ox, z: oz, y: terrain.heightAt(ox, oz) + 0.3,
        yaw: Math.atan2(-sx, -sz), type: 'spotter', kind: 'pit' });
      break;
    }
  }

  // ── And every other building in the perimeter.
  //
  // "All the buildings" is the point, but it is also two hundred terraces on a
  // map that can carry a couple of hundred defenders in total. So the belt
  // thins with distance: every block near the objective is dug in, and it
  // falls away to the odd corner position at the edge of the city, which is
  // also what a defence in depth actually looks like from the air.
  const ranked = plots
    .map((p) => ({ p, r: Math.hypot(p.x, p.z) }))
    .filter((e) => e.r > exclude - 10)
    .sort((a, b) => a.r - b.r);
  const far = ranked.length ? ranked[ranked.length - 1].r : 1;
  let dug = 0;
  for (const { p, r } of ranked) {
    if (dug >= budget) break;
    // Near the objective everything is dug in; at the edge of the map one in
    // six is.
    const t = Math.min(1, Math.max(0, (r - exclude) / Math.max(1, far - exclude)));
    if (rnd() > 1 - t * 0.86) continue;
    const half = Math.max(p.ax || p.w, p.az || p.d) / 2;
    const stand = half + 7;
    // On the outward side only: the men are defending the objective, so they
    // are looking away from it.
    const nx = p.x / (r || 1), nz = p.z / (r || 1);
    run(p.x + nx * stand, p.z + nz * stand, nx, nz, Math.min(half * 2 + 8, 30), 1);
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

/** One bay: the bank in front, the fire step behind it, and a traverse. */
function parapet(props, terrain, L, rng) {
  const { x, z, yaw, len } = L;
  const tx = -Math.sin(yaw + Math.PI / 2), tz = -Math.cos(yaw + Math.PI / 2);
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const n = Math.max(2, Math.round(len / 2.6));
  for (let i = 0; i < n; i++) {
    const f = ((i + 0.5) / n) * 2 - 1;
    const px = x + tx * f * len / 2, pz = z + tz * f * len / 2;
    const g = terrain.heightAt(px, pz);
    const h = 1.15 + rng() * 0.3;
    // The bank, thrown a little unevenly the way spoil lands.
    props.add('stone', box(2.7, h, 1.9,
      px + nx * 0.85, g + h / 2 - 0.35, pz + nz * 0.85, yaw), SPOIL, 0.94 + rng() * 0.12);
    // Sandbags along the crest of every second length, so the line has a
    // rhythm rather than being one long mound.
    if (i % 2 === 0) {
      props.add('stone', box(2.5, 0.36, 0.7,
        px + nx * 1.3, g + h - 0.16, pz + nz * 1.3, yaw), BAG, 0.92 + rng() * 0.16);
    }
    // The parados behind the trench, which is both what a real one has and
    // what stops the men reading as sunk into bare grass when the camera comes
    // round to the objective's side.
    props.add('stone', box(2.6, 0.75, 0.75,
      px - nx * 1.25, g + 0.02, pz - nz * 1.25, yaw), SPOIL, 0.9 + rng() * 0.1);
    props.add('dark', box(2.6, 0.62, 0.14,
      px - nx * 0.78, g - 0.12, pz - nz * 0.78, yaw), BOARD, 1);
  }
  if (L.traverse) {
    const ex = x + tx * (len / 2 + 0.9), ez = z + tz * (len / 2 + 0.9);
    const g = terrain.heightAt(ex, ez);
    props.add('stone', box(1.2, 1.0, 3.2, ex, g + 0.44, ez, yaw), SPOIL, 0.96);
  }
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
    props.add('stone', box(1.5, h, 1.2, px, terrain.heightAt(px, pz) + h / 2 - 0.15, pz,
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
