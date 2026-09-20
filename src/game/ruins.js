import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The shell of a burnt-out building.
 *
 * A gutted building is not a black box. The roof is gone, the floors are
 * gone, and what stands is the outer wall alone: brick piers between window
 * openings that go straight through to the sky, soot fanned up the wall over
 * every opening, a parapet broken to a ragged line, and the whole of the
 * inside — floors, roof, fittings — as a heap of charred rubble on the
 * ground floor. Look through any window and you see the far wall's windows.
 *
 * Built from boxes, as the city is, so it costs one draw call a ruin: for
 * each wall a pier between every bay, a spandrel band between every floor,
 * and nothing where the windows were. Bays and floors are the facade
 * texture's own — one window every three and a half metres — so the shell
 * has the openings the building appeared to have.
 */
const BAY = 3.5;           // one window bay, as the facade texture draws them
const FLOOR = 3.5;
const WALL = 0.55;         // wall thickness
const SILL = 1.0;          // sill height within a floor
const HEAD = 0.55;         // depth of lintel below the next floor's sill

/**
 * @param {object} p   the plot: x, z, w, d, h, base, yaw
 * @param {() => number} rng
 * @returns {THREE.Mesh}
 */
export function buildRuin(p, rng = Math.random) {
  const geos = [];
  const H = Math.max(3.0, p.h);
  const w = p.w, d = p.d;
  const floors = Math.max(1, Math.round(H / FLOOR));
  const fh = H / floors;
  // How far the fire got: the shell stands, but not all of it to the same
  // height. Each wall has its own line, and one of them is well down.
  const fallen = Math.floor(rng() * 4);

  const push = (geo, x, y, z, colour, jitter = 1) => {
    tint(geo, colour, jitter);
    geo.translate(x, y, z);
    geos.push(geo);
  };

  // A wall runs along `len` at a distance `off` from the centre along the
  // other axis; `alongX` says which. Local coordinates, yawed at the end.
  const wall = (len, off, alongX, side) => {
    const bays = Math.max(1, Math.round(len / BAY));
    const bw = len / bays;
    const win = Math.min(bw * 0.5, 1.9);
    const pier = bw - win;
    const drop = side === fallen ? 0.45 + rng() * 0.25 : 0.9 + rng() * 0.1;
    const wallH = H * drop;
    const at = (u) => alongX ? [u, off] : [off, u];
    // Piers, each to its own ragged height; the corners a little higher.
    for (let i = 0; i <= bays; i++) {
      const u = -len / 2 + i * bw;
      const corner = i === 0 || i === bays;
      const ph = Math.min(H + 0.6, wallH * (0.88 + rng() * 0.16) + (corner ? 0.4 : 0));
      const pw = corner ? pier * 0.5 + WALL : pier;
      const [x, z] = at(u);
      // Brick below the first floor's windows, soot above: the fire went up.
      const lo = Math.min(ph, fh * 0.9);
      push(box(alongX ? pw : WALL, lo, alongX ? WALL : pw), x, lo / 2, z, 0x4a3a2e, 0.85 + rng() * 0.3);
      if (ph > lo) {
        push(box(alongX ? pw : WALL, ph - lo, alongX ? WALL : pw), x, lo + (ph - lo) / 2, z, 0x1a1512, 0.8 + rng() * 0.4);
      }
    }
    // Spandrels: the band of wall between one floor's window head and the
    // next floor's sill, the full length of the wall. Black with soot, since
    // the fire came out of every window under them.
    for (let f = 0; f <= floors; f++) {
      const y0 = f === 0 ? 0 : f * fh - HEAD;
      const y1 = f === floors ? Math.min(wallH, H) : Math.min(wallH, f * fh + SILL);
      if (y1 <= y0 + 0.05) continue;
      const [x, z] = at(0);
      const colour = f === 0 ? 0x3a2e25 : 0x141110;
      push(box(alongX ? len : WALL, y1 - y0, alongX ? WALL : len), x, (y0 + y1) / 2, z, colour, 0.85 + rng() * 0.3);
    }
    // Charred joist ends still in the wall, at every floor.
    for (let f = 1; f < floors; f++) {
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const u = (rng() - 0.5) * (len - 2);
        const [x, z] = at(u);
        const L = 1.2 + rng() * 2.4;
        const inward = off > 0 ? -1 : 1;
        push(box(alongX ? 0.25 : L, 0.3, alongX ? L : 0.25),
          x + (alongX ? 0 : inward * L / 2), f * fh - HEAD - 0.15, z + (alongX ? inward * L / 2 : 0), 0x0e0c0a, 1);
      }
    }
  };
  wall(w, d / 2 - WALL / 2, true, 0);
  wall(w, -d / 2 + WALL / 2, true, 1);
  wall(d, w / 2 - WALL / 2, false, 2);
  wall(d, -w / 2 + WALL / 2, false, 3);

  // The rubble: everything that was inside, as a heap on the ground floor —
  // a mound of charred beams and brick, highest in the middle, lapping the
  // walls.
  const heapH = Math.min(3.2, 0.9 + H * 0.12);
  push(box(w - WALL * 2, heapH * 0.5, d - WALL * 2), 0, heapH * 0.25, 0, 0x151210, 0.9);
  const lumps = 6 + Math.floor((w * d) / 40);
  for (let i = 0; i < lumps; i++) {
    const lw = 1 + rng() * Math.min(5, w * 0.35), ld = 1 + rng() * Math.min(5, d * 0.35);
    const lh = 0.4 + rng() * heapH * 0.8;
    const g = box(lw, lh, ld);
    g.rotateY(rng() * Math.PI);
    push(g, (rng() - 0.5) * (w - lw - WALL * 2), heapH * 0.25 + lh / 2 * (0.6 + rng() * 0.4),
      (rng() - 0.5) * (d - ld - WALL * 2), rng() < 0.3 ? 0x3d2f26 : 0x120f0d, 0.8 + rng() * 0.4);
  }
  // A few beams that fell across the heap on end.
  for (let i = 0; i < 3 + Math.floor(rng() * 3); i++) {
    const L = Math.min(H * 0.6, 3 + rng() * 5);
    const g = box(0.3, L, 0.3);
    g.rotateZ((rng() - 0.5) * 1.2);
    g.rotateY(rng() * Math.PI);
    push(g, (rng() - 0.5) * (w - 3), heapH * 0.5 + L * 0.3, (rng() - 0.5) * (d - 3), 0x0c0a09, 1);
  }

  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  const mesh = new THREE.Mesh(merged, ruinMaterial());
  mesh.rotation.y = p.yaw || 0;
  mesh.position.set(p.x, p.base, p.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

let MAT = null;
function ruinMaterial() {
  if (!MAT) MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0.0 });
  return MAT;
}

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

function tint(geo, hex, jitter) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex).multiplyScalar(jitter);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}
