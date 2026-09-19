/**
 * The city, as something a shell can hit.
 *
 * Every building in the game was scenery: geometry in the scene graph with
 * nothing in the physics world behind it. A round fired at a gun standing
 * behind a terrace flew through the terrace, through the office block behind
 * it and into the monument — which is not a difficulty setting, it is the city
 * not being there. Rubble fell through roofs. A section of tower landing on a
 * street came to rest in the middle of a department store.
 *
 * So the city gets colliders: one fixed rigid body for the whole town, with a
 * box per building on it. One body rather than nine hundred because Rapier
 * charges per body for the island-management it does not need to do for
 * anything that will never move, and the masonry already works this way.
 *
 * The boxes are the plots' own rectangles. For a surveyed building that was
 * extruded as its true outline, the rectangle is a little larger than the
 * building at a re-entrant corner — a courtyard block's yard is inside its own
 * bounding box — and that is the error to make: a round that stops a metre
 * early against a building is a round that stopped against a building, and a
 * round that sails through the courtyard of one is the bug this fixes.
 */

/**
 * @param {object} physics PhysicsWorld
 * @param {Array}  plots   `contextGroup.userData.plots`
 * @returns {object|null}  { body, blocks(a, b) }
 */
export function buildCityBodies(physics, plots) {
  if (!plots || !plots.length) return null;
  const rapier = physics.rapier;
  const body = physics.world.createRigidBody(rapier.RigidBodyDesc.fixed());

  const boxes = [];
  for (const p of plots) {
    const h = Math.max(1.5, p.h) / 2;
    const yaw = p.yaw || 0;
    const half = Math.sin(yaw * 0.5);
    const cd = rapier.ColliderDesc.cuboid(p.w / 2, h, p.d / 2)
      .setTranslation(p.x, p.base + h, p.z)
      .setRotation({ x: 0, y: half, z: 0, w: Math.cos(yaw * 0.5) })
      .setFriction(0.9)
      .setRestitution(0.02);
    physics.world.createCollider(cd, body);
    boxes.push({
      x: p.x, z: p.z, y0: p.base, y1: p.base + Math.max(1.5, p.h),
      hw: p.w / 2, hd: p.d / 2, ca: Math.cos(yaw), sa: Math.sin(yaw),
      r: Math.hypot(p.w, p.d) / 2,
    });
  }

  // A grid over the boxes, because the firing solution asks "is there a
  // building in the way" a dozen times per shot per gun, and a thousand
  // buildings times a dozen segments times every unit on the map is a walk
  // nobody can afford at sixty frames a second.
  const CELL = 64;
  const grid = new Map();
  const key = (cx, cz) => cx * 8192 + cz;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const x0 = Math.floor((b.x - b.r) / CELL), x1 = Math.floor((b.x + b.r) / CELL);
    const z0 = Math.floor((b.z - b.r) / CELL), z1 = Math.floor((b.z + b.r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let bucket = grid.get(k);
        if (!bucket) grid.set(k, bucket = []);
        bucket.push(i);
      }
    }
  }

  const seen = new Set();

  /** Does the segment a→b pass through any building? */
  const blocks = (a, b) => {
    // Everything below the lowest roof in town, or nothing at all: a shell at
    // two hundred metres is over the whole city and there is no point walking
    // the grid for it.
    const lo = Math.min(a.y, b.y);
    const dx = b.x - a.x, dz = b.z - a.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / CELL));
    seen.clear();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.floor((a.x + dx * t) / CELL);
      const cz = Math.floor((a.z + dz * t) / CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const bucket = grid.get(key(cx + ox, cz + oz));
          if (!bucket) continue;
          for (const bi of bucket) {
            if (seen.has(bi)) continue;
            seen.add(bi);
            const box = boxes[bi];
            if (lo > box.y1) continue;
            if (hitsBox(a, b, box)) return true;
          }
        }
      }
    }
    return false;
  };

  return { body, blocks, count: boxes.length };
}

/**
 * Segment against an oriented box, by slabs in the box's own frame.
 *
 * The box never rolls or pitches — buildings stand up — so the frame change is
 * one rotation about y and the y axis needs no transform at all.
 */
function hitsBox(a, b, box) {
  const ax = a.x - box.x, az = a.z - box.z;
  const bx = b.x - box.x, bz = b.z - box.z;
  // Into the box's frame. The plot's yaw turns its width axis to
  // (cos y, -sin y), so the inverse is this.
  const a0 = ax * box.ca - az * box.sa;
  const a1 = ax * box.sa + az * box.ca;
  const b0 = bx * box.ca - bz * box.sa;
  const b1 = bx * box.sa + bz * box.ca;

  let t0 = 0, t1 = 1;
  const slab = (p, q, lo, hi) => {
    const d = q - p;
    if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
    let n = (lo - p) / d, f = (hi - p) / d;
    if (n > f) { const s = n; n = f; f = s; }
    if (n > t0) t0 = n;
    if (f < t1) t1 = f;
    return t0 <= t1;
  };
  if (!slab(a0, b0, -box.hw, box.hw)) return false;
  if (!slab(a1, b1, -box.hd, box.hd)) return false;
  if (!slab(a.y, b.y, box.y0, box.y1)) return false;
  return true;
}
