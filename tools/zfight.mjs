// Usage: node tools/zfight.mjs [tower|wing|eiffel|chaillot|khufu|sphinx|taj|mosque] [low|med|high|ultra]
// Offline: find pairs of stones that share volume, and pairs with exposed
// faces within a few millimetres of the same plane (z-fighting candidates).
import { buildEiffelTower, buildChaillotWing } from '../src/structure/landmarks/eiffel.js';
import { buildElizabethTower, buildPalaceWing } from '../src/structure/landmarks/bigben.js';
import { buildGreatPyramid, buildSphinx } from '../src/structure/landmarks/giza.js';
import { buildTajMahal, buildTajMosque } from '../src/structure/landmarks/tajmahal.js';

const WHICH = { tower: buildElizabethTower, wing: buildPalaceWing, eiffel: buildEiffelTower,
  chaillot: buildChaillotWing, khufu: buildGreatPyramid, sphinx: buildSphinx,
  taj: buildTajMahal, mosque: buildTajMosque };
const only = process.argv[2];
const tier = process.argv[3] || 'high';
const SCALE = { low: 1.55, med: 1.2, high: 1.0, ultra: 0.85 }[tier];

function aabb(b) {
  // Yawed stones: expand to the rotated bounding box (conservative).
  const c = Math.abs(Math.cos(b.ry)), s = Math.abs(Math.sin(b.ry));
  const hx = b.hx * c + b.hz * s, hz = b.hx * s + b.hz * c;
  return { x0: b.x - hx, x1: b.x + hx, y0: b.y - b.hy, y1: b.y + b.hy, z0: b.z - hz, z1: b.z + hz, yawed: Math.abs(b.ry) > 1e-6 };
}

for (const [name, fn] of Object.entries(WHICH)) {
  if (only && only !== name) continue;
  const B = fn({ id: tier, blockScale: SCALE });
  const bl = B.blocks;
  const boxes = bl.map(aabb);
  // Grid hash.
  const CELL = 6;
  const grid = new Map();
  const key = (i, j, k) => `${i},${j},${k}`;
  boxes.forEach((b, i) => {
    for (let x = Math.floor(b.x0 / CELL); x <= Math.floor(b.x1 / CELL); x++)
      for (let y = Math.floor(b.y0 / CELL); y <= Math.floor(b.y1 / CELL); y++)
        for (let z = Math.floor(b.z0 / CELL); z <= Math.floor(b.z1 / CELL); z++) {
          const k = key(x, y, z);
          let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
        }
  });
  const seen = new Set();
  let overlaps = 0, coplanar = 0;
  const byTag = {}, coTag = {};
  const EPS = 0.004, MIN_OVERLAP = 0.02;
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const i = list[a], j = list[b];
      const id = i < j ? i * 1e6 + j : j * 1e6 + i;
      if (seen.has(id)) continue; seen.add(id);
      const A = boxes[i], Bx = boxes[j];
      const ox = Math.min(A.x1, Bx.x1) - Math.max(A.x0, Bx.x0);
      const oy = Math.min(A.y1, Bx.y1) - Math.max(A.y0, Bx.y0);
      const oz = Math.min(A.z1, Bx.z1) - Math.max(A.z0, Bx.z0);
      if (ox > MIN_OVERLAP && oy > MIN_OVERLAP && oz > MIN_OVERLAP) {
        if (A.yawed || Bx.yawed) continue;   // conservative box; skip
        overlaps++;
        const t = `${bl[i].tag}/${bl[j].tag}`;
        (byTag[t] = byTag[t] || []).push(`(${bl[i].x.toFixed(1)},${bl[i].y.toFixed(1)},${bl[i].z.toFixed(1)})`);
        // Same-side coplanar faces within the overlap: the z-fight case.
        // Vertical faces only: horizontal ones share the course grid and are
        // hidden under the course above.
        const faces = [[A.x0, Bx.x0], [A.x1, Bx.x1], [A.z0, Bx.z0], [A.z1, Bx.z1]];
        if (faces.some(([p, q]) => Math.abs(p - q) < EPS)) {
          coplanar++;
          (coTag[t] = coTag[t] || []).push(`(${bl[i].x.toFixed(1)},${bl[i].y.toFixed(1)},${bl[i].z.toFixed(1)})`);
        }
      }
    }
  }
  console.log(`${name}/${tier}: ${bl.length} stones, ${overlaps} overlapping pairs, ${coplanar} with a shared face plane`);
  for (const [t, l] of Object.entries(byTag)) console.log(`   overlap ${t}: ${l.length}  e.g. ${l.slice(0, 4).join(' ')}`);
  for (const [t, l] of Object.entries(coTag)) console.log(`   coplanar ${t}: ${l.length}  e.g. ${l.slice(0, 4).join(' ')}`);
}
