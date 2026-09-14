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

export function buildContext(terrain, quality) {
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

  /** A period block: body plus a flat roof slab, sat on the real terrain. */
  const block = (x, z, w, d, h, ry = 0) => {
    if (terrain.isWater(x, z)) return;
    const g = terrain.heightAt(x, z);
    const body = new THREE.BoxGeometry(w, h, d);
    // Rescale the UVs to world size so the facade texture gives one window bay
    // roughly every 3.5 m regardless of how big the block is. Without this the
    // window grid stretches and every building reads as a different scale.
    scaleBoxUVs(body, w, h, d, 3.5);
    push(bodies, body, x, g + h / 2, z, ry);
    push(roofs, new THREE.BoxGeometry(w + 0.7, 1.1, d + 0.7), x, g + h + 0.5, z, ry);
  };

  // ── Parliament Square and the government blocks west of the tower.
  const west = [
    [-88, 6, 46, 34, 26], [-92, -52, 40, 40, 22], [-150, 30, 54, 44, 30],
    [-58, 96, 38, 52, 24], [-140, -70, 48, 36, 28], [-196, -20, 44, 58, 26],
  ];
  for (const [x, z, w, d, h] of west) block(x, z, w, d, h);

  // Westminster Abbey stand-in: a long nave with towers at the west front.
  block(-128, 118, 30, 86, 26);
  block(-128, 78, 42, 22, 34);
  for (const sx of [-1, 1]) block(-128 + sx * 15, 72, 12, 12, 52);

  // ── Portcullis House / the northern blocks.
  block(-14, -104, 62, 44, 30);
  block(-96, -128, 52, 40, 26);

  // ── Across the river: the South Bank. Placed beyond the far bank so the
  // river always has a built edge on both sides.
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = 340 + rng() * 120;
    const z = -560 + t * 1180 + rng() * 40;
    block(x, z, 34 + rng() * 34, 30 + rng() * 36, 20 + rng() * 34);
  }

  // ── The rest of the city, laid out as blocks and streets.
  //
  // The previous filler was ninety boxes scattered on a circle, which from the
  // bird's-eye camera left the entire map outside the landmark's plot as bare
  // ground — the single biggest reason the level read as a diorama on a lawn
  // rather than as a place. A city seen from above is mostly *streets*: what
  // the eye reads is the grid, not the individual buildings.
  //
  // So: a grid of blocks on a real Georgian pitch, each ringed with terraces
  // around a courtyard, skipping water, parks and the landmark's own plot. It
  // costs nothing at runtime — every box lands in the same merged mesh.
  const PITCH = 86;          // block centre to block centre
  const BLOCK = 68;          // built footprint within it; the rest is street
  const reach = terrain.span * 0.94;
  const dense = quality.groundClutter ? 1.0 : 0.55;
  for (let bx = -reach; bx <= reach; bx += PITCH) {
    for (let bz = -reach; bz <= reach; bz += PITCH) {
      const jx = bx + (rng() - 0.5) * 9;
      const jz = bz + (rng() - 0.5) * 9;
      const r = Math.hypot(jx, jz);
      if (r < 96) continue;                        // the landmark's own plot
      if (terrain.isWater(jx, jz)) continue;
      const m = terrain.maskAt(jx, jz);
      if (m.park > 0.42) continue;                 // leave the parks open
      // Thin with distance, so the near blocks are solid and the far ones
      // break up before the fog takes them.
      if (rng() > dense * (1 - Math.min(0.55, r / (terrain.span * 2.2)))) continue;

      // Terraces around the block's edge, each side one run with a gap.
      const h0 = 11 + rng() * 20;
      const depth = 13 + rng() * 5;
      const half = BLOCK / 2;
      const yaw = (rng() - 0.5) * 0.12;
      for (const [dx, dz, along] of [[0, 1, 'x'], [0, -1, 'x'], [1, 0, 'z'], [-1, 0, 'z']]) {
        if (rng() < 0.16) continue;                // a gap onto the courtyard
        const runs = 1 + (rng() < 0.45 ? 1 : 0);
        for (let k = 0; k < runs; k++) {
          const span = (BLOCK - 6) / runs;
          const off = -half + 3 + span * (k + 0.5);
          const cx = jx + dx * (half - depth / 2) + (along === 'x' ? off : 0);
          const cz = jz + dz * (half - depth / 2) + (along === 'z' ? off : 0);
          const w = along === 'x' ? span - 2 : depth;
          const d = along === 'x' ? depth : span - 2;
          block(cx, cz, w, d, h0 * (0.8 + rng() * 0.45), yaw);
        }
      }
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

  group.add(buildBridge(terrain, quality));
  group.add(buildEmbankment(terrain));

  return group;
}

/** Merge a pile of box geometries into one mesh, tinting each per-vertex. */
function mergeTinted(geos, material, palette, rng, quality) {
  for (const g of geos) {
    const n = g.attributes.position.count;
    const c = new THREE.Color(palette[Math.floor(rng() * palette.length)]);
    c.multiplyScalar(0.84 + rng() * 0.3);
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

/** Westminster Bridge, crossing where the real one does. */
function buildBridge(terrain, quality) {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x5f6b5c, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x4a5548, roughness: 0.8 });

  // Runs roughly east-north-east from the embankment by the tower. The line is
  // fixed, but the deck is trimmed to where the water actually is (plus short
  // approaches) — otherwise the bridge runs hundreds of metres over dry land.
  const lineA = new THREE.Vector3(35, 0, -150);
  const lineB = new THREE.Vector3(430, 0, -255);
  let first = null, last = null;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const p = lineA.clone().lerp(lineB, t);
    if (terrain.isWater(p.x, p.z)) {
      if (first === null) first = t;
      last = t;
    }
  }
  if (first === null) return g; // no crossing on this line
  const pad = 0.055;
  const from = lineA.clone().lerp(lineB, Math.max(0, first - pad));
  const to = lineA.clone().lerp(lineB, Math.min(1, last + pad));
  const len = from.distanceTo(to);
  const mid = from.clone().lerp(to, 0.5);
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  const deckY = terrain.waterLevel + 9.5;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(19, 1.8, len), deckMat);
  deck.position.set(mid.x, deckY, mid.z);
  deck.rotation.y = yaw;
  deck.receiveShadow = quality.shadowMapSize > 0;
  g.add(deck);

  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, len), trimMat);
    rail.position.set(mid.x + Math.cos(yaw) * sx * 9.2, deckY + 1.6, mid.z - Math.sin(yaw) * sx * 9.2);
    rail.rotation.y = yaw;
    g.add(rail);
  }

  // Piers down to the riverbed.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x6e6a5f, roughness: 0.95 });
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const p = from.clone().lerp(to, t);
    const bed = terrain.heightAt(p.x, p.z);
    const h = deckY - bed;
    if (h <= 0.5) continue;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(7, h, 15), pierMat);
    pier.position.set(p.x, bed + h / 2, p.z);
    pier.rotation.y = yaw;
    pier.castShadow = quality.shadowMapSize > 0;
    g.add(pier);
  }
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
