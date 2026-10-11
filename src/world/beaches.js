import * as THREE from 'three';

/**
 * A beach with people's things on it.
 *
 * Where warm water meets low, gently shelving ground the town goes down to it:
 * parasols in a few loose rows with a lounger under each, the colours bought
 * by whoever runs that stretch. From the guns' distance a beach is otherwise
 * a band of sand, and a band of sand is a texture; a dozen coloured discs on
 * it are a beach in July. Only in the warm climates, never inside the
 * landmark's own ground, never on a road, a building or the water, and a few
 * dozen at most: a handful of triangles each, merged into the detail.
 */
const WARM = new Set(['mediterranean', 'subtropical', 'tropical', 'desert']);
const CANVAS = [0xd8452f, 0x2f78c4, 0xf2c94c, 0xf4f1e8, 0x3aa17e, 0xe07a2a];

function indexed(g) {
  if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); }
  return g;
}

export function addBeaches(props, terrain, plots, rng, clime, net) {
  if (!WARM.has(clime) || !terrain.hasWater) return { beaches: 0, parasols: 0 };
  const t = terrain, span = t.span * 0.9, W = t.waterLevel;
  const near = (x, z) => {
    // How far to the water, to eighteen metres, and which way.
    for (const r of [5, 10, 15, 18]) {
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        if (t.isWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) return { r, a };
      }
    }
    return null;
  };
  const builtAt = (x, z) => plots.some((p) => {
    if (Math.abs(p.x - x) > 60 || Math.abs(p.z - z) > 60) return false;
    const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0), dx = x - p.x, dz = z - p.z;
    return Math.abs(dx * c - dz * s) <= p.w / 2 + 14 && Math.abs(dx * s + dz * c) <= p.d / 2 + 14;
  });
  const spots = [];
  for (let x = -span; x <= span; x += 10) {
    for (let z = -span; z <= span; z += 10) {
      if (Math.hypot(x, z) < 170 || t.isWater(x, z)) continue;
      const h = t.heightAt(x, z);
      if (h < W + 0.25 || h > W + 3) continue;
      const slope = Math.abs(t.heightAt(x + 6, z) - t.heightAt(x - 6, z)) + Math.abs(t.heightAt(x, z + 6) - t.heightAt(x, z - 6));
      if (slope > 1.2) continue;
      const w = near(x, z);
      if (!w || w.r < 10) continue;
      // Facing open water, not a creek's far quay: still wet forty and
      // eighty metres further out the same way.
      const ca = Math.cos(w.a), sa = Math.sin(w.a);
      if (!t.isWater(x + ca * (w.r + 40), z + sa * (w.r + 40)) || !t.isWater(x + ca * (w.r + 80), z + sa * (w.r + 80))) continue;
      // Not a promenade, a road or a garden.
      const m = t.maskAt(x, z);
      if (m.road > 0.1 || m.park > 0.35) continue;
      if (net?.roadClearance && net.roadClearance(x, z) < 4) continue;
      if (builtAt(x, z)) continue;
      spots.push({ x, z, a: w.a, r: rng() });
    }
  }
  spots.sort((p, q) => p.r - q.r);
  const chosen = [];
  for (const s of spots) {
    if (chosen.length >= 6) break;
    if (chosen.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < 45)) continue;
    chosen.push(s);
  }
  let parasols = 0;
  for (const s of chosen) {
    // Rows along the waterline: the way along is square to the way to the water.
    const ax = -Math.sin(s.a), az = Math.cos(s.a), wx = Math.cos(s.a), wz = Math.sin(s.a);
    const hex = CANVAS[Math.floor(rng() * CANVAS.length)];
    const rows = 1 + Math.floor(rng() * 2), per = 3 + Math.floor(rng() * 4);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < per; k++) {
        const u = (k - (per - 1) / 2) * 5 + (rng() - 0.5), v = r * 5 - 2;
        const x = s.x + ax * u + wx * v, z = s.z + az * u + wz * v;
        if (t.isWater(x, z) || t.isWater(x + wx * 3, z + wz * 3)) continue;
        const y = t.heightAt(x, z);
        const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.3, 5, 1);
        pole.translate(x, y + 1.15, z);
        props.add('metal', indexed(pole), 0xd8d8d0, 1);
        const canopy = new THREE.ConeGeometry(1.35, 0.45, 8, 1, true);
        canopy.translate(x, y + 2.25, z);
        props.add('paint', indexed(canopy), hex, 0.9 + rng() * 0.2);
        const lounger = new THREE.BoxGeometry(0.7, 0.3, 1.9);
        lounger.rotateY(Math.atan2(wx, wz));
        lounger.translate(x + wx * 1.1, y + 0.18, z + wz * 1.1);
        props.add('paint', lounger, 0xf2efe6, 1);
        parasols++;
      }
    }
  }
  return { beaches: chosen.length, parasols };
}
