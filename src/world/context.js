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

  /**
   * Every building's footprint, kept so nothing is laid on top of anything
   * else and so the game can find the roofs later.
   * @type {Array<{x:number,z:number,w:number,d:number,h:number,top:number}>}
   */
  const plots = [];

  /**
   * Would this footprint land on one already placed?
   *
   * Axis-aligned and generous, because the point is not to pack the city
   * tightly — it is that two buildings sharing the same volume read as one
   * malformed lump with facades running through each other, which is exactly
   * what the skyline used to look like up close.
   */
  const overlaps = (x, z, w, d, gap = 2.0) => {
    for (const p of plots) {
      if (Math.abs(p.x - x) < (p.w + w) / 2 + gap
          && Math.abs(p.z - z) < (p.d + d) / 2 + gap) return true;
    }
    return false;
  };

  /** A period block: body plus a flat roof slab, sat on the real terrain. */
  const block = (x, z, w, d, h, ry = 0) => {
    if (terrain.isWater(x, z)) return false;
    if (overlaps(x, z, w, d)) return false;
    const g = terrain.heightAt(x, z);
    const body = new THREE.BoxGeometry(w, h, d);
    // Rescale the UVs to world size so the facade texture gives one window bay
    // roughly every 3.5 m regardless of how big the block is. Without this the
    // window grid stretches and every building reads as a different scale.
    scaleBoxUVs(body, w, h, d, 3.5);
    push(bodies, body, x, g + h / 2, z, ry);
    push(roofs, new THREE.BoxGeometry(w + 0.7, 1.1, d + 0.7), x, g + h + 0.5, z, ry);
    plots.push({ x, z, w, d, h, top: g + h + 1.1, yaw: ry });
    return true;
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
  group.add(buildStreetDetail(terrain, quality, plots, rng));

  // The flat roofs, for deployment. A gun on a roof has the sightlines the
  // ground does not, which is worth the climb.
  group.userData.roofs = plots.filter((p) => Math.min(p.w, p.d) > 15 && p.h > 8);
  group.userData.plots = plots;
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
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x7d8676, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x5f6a5b, roughness: 0.8 });

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

  // ── Approaches. The deck sits nine metres above the water, so without these
  // the bridge simply stopped in mid-air over each bank — a ribbon of road
  // floating clear of the ground it is supposed to connect. Each end now ramps
  // down to meet the terrain, on an abutment.
  for (const [end, sign] of [[from, -1], [to, 1]]) {
    const dir = new THREE.Vector3(
      Math.sin(yaw) * sign, 0, Math.cos(yaw) * sign,
    );
    const steps = 9;
    const run = 46;                       // metres of approach on each side
    let prevY = deckY;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const p2 = end.clone().addScaledVector(dir, run * t);
      const ground = terrain.heightAt(p2.x, p2.z);
      // Ease down to the ground, and stop once the road has reached it.
      const y = deckY + (ground + 1.2 - deckY) * (t * t);
      const segLen = run / steps + 0.6;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(19, 1.8, segLen), deckMat);
      seg.position.set(
        p2.x - dir.x * segLen * 0.5, (y + prevY) / 2, p2.z - dir.z * segLen * 0.5,
      );
      seg.rotation.y = yaw;
      // Pitch the segment so it meets the next one cleanly instead of stepping.
      seg.rotation.x = Math.atan2(prevY - y, segLen) * sign;
      seg.receiveShadow = quality.shadowMapSize > 0;
      g.add(seg);

      // Abutment: fill the wedge between the ramp and the ground under it.
      const fillH = Math.max(0, (y + prevY) / 2 - ground);
      if (fillH > 0.4) {
        const fill = new THREE.Mesh(
          new THREE.BoxGeometry(16, fillH, segLen * 0.98), pierMatShared(),
        );
        fill.position.set(
          p2.x - dir.x * segLen * 0.5, ground + fillH / 2, p2.z - dir.z * segLen * 0.5,
        );
        fill.rotation.y = yaw;
        fill.receiveShadow = quality.shadowMapSize > 0;
        g.add(fill);
      }
      prevY = y;
      if (y <= ground + 1.4) break;
    }
  }

  // Piers down to the riverbed.
  const pierMat = pierMatShared();
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

/**
 * Street furniture, planting and the things that make a city read as inhabited.
 *
 * A skyline of extruded boxes is legible but lifeless: at bird's-eye range the
 * eye reads *texture*, and a city's texture at that scale is trees, courtyards,
 * parked vehicles and the pale scars of squares between the blocks. Everything
 * here is merged into a handful of meshes, so the whole lot is a few draw calls
 * and none of it touches the physics world.
 */
function buildStreetDetail(terrain, quality, plots, rng) {
  const g = new THREE.Group();
  g.name = 'detail';
  const shadows = quality.shadowMapSize > 0;
  const dense = quality.groundClutter ? 1 : 0.45;

  // ── Trees. Two cheap cones on a trunk, varied in height and hue, standing in
  // the courtyards the terraces enclose and along the park edges.
  const trunks = [];
  const crowns = [];
  const treeAt = (x, z, scale) => {
    const y = terrain.heightAt(x, z);
    const h = (5 + rng() * 5) * scale;
    const t = new THREE.CylinderGeometry(0.18 * scale, 0.26 * scale, h * 0.42, 5);
    t.translate(x, y + h * 0.21, z);
    trunks.push(t);
    const lower = new THREE.ConeGeometry(h * 0.32, h * 0.55, 7);
    lower.translate(x, y + h * 0.55, z);
    const upper = new THREE.ConeGeometry(h * 0.23, h * 0.45, 7);
    upper.translate(x, y + h * 0.82, z);
    tintOne(lower, 0x3f6b2c, 0.7 + rng() * 0.55);
    tintOne(upper, 0x4c7d33, 0.7 + rng() * 0.55);
    crowns.push(lower, upper);
  };

  // In the courtyards: each block encloses one, and a garden is what is in it.
  for (const p of plots) {
    if (rng() > 0.5 * dense) continue;
    for (let k = 0; k < 2; k++) {
      treeAt(p.x + (rng() - 0.5) * p.w * 0.7, p.z + (rng() - 0.5) * p.d * 0.7, 1);
    }
  }
  // And scattered across the mapped parks, which are otherwise bare green.
  const span = terrain.span;
  const want = Math.round(900 * dense);
  for (let i = 0; i < want * 6 && crowns.length < want * 2; i++) {
    const x = (rng() * 2 - 1) * span * 0.95;
    const z = (rng() * 2 - 1) * span * 0.95;
    if (terrain.isWater(x, z)) continue;
    const m = terrain.maskAt(x, z);
    if (m.park < 0.35 || m.road > 0.3) continue;
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
      stack.translate(x, p.top + h / 2, z);
      tintOne(stack, 0x8d5a4a, 0.8 + rng() * 0.4);
      roofBits.push(stack);
    }
    // A lift overrun or stair head on the bigger blocks.
    if (Math.min(p.w, p.d) > 18 && rng() < 0.55) {
      const w = 4 + rng() * 3, d = 3 + rng() * 3, h = 2.4 + rng() * 1.4;
      const hut = new THREE.BoxGeometry(w, h, d);
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

  // ── Kerbs. A pale strip round each block turns "boxes on a field" into
  // "buildings on streets", which is most of what the eye uses to read a plan
  // from above. One flat quad per block, laid just proud of the terrain.
  const kerbs = [];
  for (const p of plots) {
    const kerb = new THREE.BoxGeometry(p.w + 5.5, 0.24, p.d + 5.5);
    kerb.translate(p.x, terrain.heightAt(p.x, p.z) + 0.12, p.z);
    tintOne(kerb, 0xb9b3a4, 0.85 + rng() * 0.25);
    kerbs.push(kerb);
  }
  if (kerbs.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(kerbs, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }),
    );
    mesh.receiveShadow = shadows;
    mesh.renderOrder = 1;
    g.add(mesh);
  }

  // ── Street lamps. Barely a pixel each at playing distance, but a regular
  // rhythm of verticals along a frontage is what makes a street read as a
  // street rather than as a gap between two blocks.
  const lamps = [];
  for (const p of plots) {
    if (rng() > 0.6 * dense) continue;
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const alongX = rng() < 0.5;
      const off = (rng() - 0.5) * (alongX ? p.w : p.d) * 0.8;
      const side = rng() < 0.5 ? 1 : -1;
      const x = p.x + (alongX ? off : side * (p.w / 2 + 2.6));
      const z = p.z + (alongX ? side * (p.d / 2 + 2.6) : off);
      if (terrain.isWater(x, z)) continue;
      const y = terrain.heightAt(x, z);
      const post = new THREE.CylinderGeometry(0.1, 0.14, 6.2, 5);
      post.translate(x, y + 3.1, z);
      lamps.push(post);
      const head = new THREE.BoxGeometry(0.8, 0.3, 0.4);
      head.translate(x, y + 6.2, z);
      lamps.push(head);
    }
  }
  if (lamps.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(lamps, false),
      new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.6, metalness: 0.35 }),
    );
    mesh.castShadow = shadows;
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

  // ── Parked vehicles along the street frontages. Tiny, but they are the thing
  // that fixes the scale of everything else in the frame.
  const cars = [];
  const CAR_COLOURS = [0x9aa3ad, 0x2f3a45, 0x8c3a32, 0x3d5a46, 0xb8b2a4, 0x24303a];
  for (const p of plots) {
    if (rng() > 0.75 * dense) continue;
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const alongX = rng() < 0.5;
      const off = (rng() - 0.5) * (alongX ? p.w : p.d) * 0.8;
      const side = rng() < 0.5 ? 1 : -1;
      const x = p.x + (alongX ? off : side * (p.w / 2 + 3.4));
      const z = p.z + (alongX ? side * (p.d / 2 + 3.4) : off);
      if (terrain.isWater(x, z)) continue;
      const y = terrain.heightAt(x, z);
      const body = new THREE.BoxGeometry(alongX ? 4.3 : 1.9, 1.5, alongX ? 1.9 : 4.3);
      body.translate(x, y + 0.75, z);
      tintOne(body, CAR_COLOURS[Math.floor(rng() * CAR_COLOURS.length)], 0.85 + rng() * 0.3);
      cars.push(body);
    }
  }
  if (cars.length) {
    const mesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(cars, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 }),
    );
    mesh.castShadow = shadows;
    g.add(mesh);
  }

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
