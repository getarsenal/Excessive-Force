import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { valueNoise } from './terrain.js';

/**
 * City detail.
 *
 * Everything in here exists for one reason: from a bird's-eye camera a city is
 * read from its *small* features. The eye works out how big a building is from
 * the kerb beside it, how far away a block is from whether it can still see the
 * cars, and whether it is looking at a place or at a diagram from whether the
 * edges are straight and empty. Blocks and roofs establish the massing; this
 * establishes the scale.
 *
 * Everything is merged into a handful of meshes by material, so the whole lot —
 * several thousand objects — costs a dozen draw calls and nothing per frame.
 * Nothing here is destructible, collidable, or known to the simulation.
 *
 * The one rule that matters when adding to it: a prop must be *legible at
 * playing distance or invisible*. Detail that turns into noise at 200 m makes
 * the picture worse, not better, so things here are either big enough to read
 * as a shape (a bus shelter, a lamp standard, an arch) or dark enough to read
 * as a mark (a crossing, a road patch, a grime streak).
 */

/** Collects geometry per material and merges once at the end. */
export class PropSet {
  constructor(quality) {
    this.quality = quality;
    this.buckets = new Map();
  }

  /** @param {string} key material bucket; `geo` is consumed. */
  add(key, geo, colour, jitter = 1) {
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, b = []);
    if (colour !== undefined) tint(geo, colour, jitter);
    b.push(geo);
    return geo;
  }

  /** Build the merged meshes into `group`. */
  flush(group, materials) {
    const shadows = this.quality.shadowMapSize > 0;
    for (const [key, geos] of this.buckets) {
      if (!geos.length) continue;
      const merged = BufferGeometryUtils.mergeGeometries(geos, false);
      if (!merged) continue;
      const spec = materials[key] || {};
      const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: spec.roughness ?? 0.92,
        metalness: spec.metalness ?? 0.0,
        transparent: !!spec.transparent,
        opacity: spec.opacity ?? 1,
        depthWrite: spec.depthWrite !== false,
        polygonOffset: !!spec.offset,
        polygonOffsetFactor: spec.offset ? -2 : 0,
        polygonOffsetUnits: spec.offset ? -2 : 0,
      }));
      mesh.name = key;
      mesh.castShadow = shadows && spec.cast !== false;
      mesh.receiveShadow = shadows && spec.receive !== false;
      if (spec.renderOrder) mesh.renderOrder = spec.renderOrder;
      mesh.frustumCulled = false;
      group.add(mesh);
      this.buckets.set(key, []);
    }
  }
}

function tint(geo, hex, jitter) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex).multiplyScalar(jitter);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** A box, placed and yawed in one call. */
function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function cyl(rt, rb, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

export const MATERIALS = {
  stone:   { roughness: 0.94 },
  metal:   { roughness: 0.45, metalness: 0.6 },
  dark:    { roughness: 0.85 },
  paint:   { roughness: 0.62, metalness: 0.15 },
  glass:   { roughness: 0.18, metalness: 0.35 },
  foliage: { roughness: 0.9, cast: true },
  // Flat marks laid on the road: never cast, always offset so they do not
  // z-fight with the surface they are painted on.
  markings: { roughness: 0.97, cast: false, offset: true, renderOrder: 2 },
};

/**
 * Street furniture along a frontage.
 *
 * Placed along the building's *front*, which the layout now knows: every plot
 * records which way it faces, because it was set back from a particular street
 * rather than dropped on a grid. That is the difference between a bench on the
 * pavement and a bench in somebody's back garden — and it is why the lamps and
 * the parked cars have moved out of here and into the street network, where
 * they can follow the kerb instead of guessing at it.
 */
export function addStreetFurniture(props, terrain, plots, rng, dense) {
  let bollards = 0, benches = 0, bins = 0, boxes = 0, planters = 0, shelters = 0;

  for (const p of plots) {
    if (Math.min(p.w, p.d) < 8) continue;
    // Which way the building faces, and the line of its frontage.
    const f = p.front || { x: 0, z: 1 };
    const ax = f.z, az = -f.x;                        // along the frontage
    const halfAlong = (p.front ? p.d : p.w) / 2;
    const depth = (p.front ? p.w : p.d) / 2;
    const yaw = Math.atan2(f.x, f.z);
    const at = (s, off) => ({
      x: p.x + ax * s + f.x * (depth + off),
      z: p.z + az * s + f.z * (depth + off),
    });

    // Bollards along the edge of the forecourt on some frontages.
    if (rng() < 0.3) {
      for (let s = -halfAlong + 2; s < halfAlong - 1.5; s += 3.6) {
        const q = at(s, 2.0);
        if (terrain.isWater(q.x, q.z)) continue;
        props.add('dark', cyl(0.14, 0.17, 1.0, 6, q.x, terrain.heightAt(q.x, q.z) + 0.5, q.z),
          0x36302a, 0.9 + rng() * 0.25);
        bollards++;
      }
    }

    // One or two pieces of larger furniture, out on the pavement.
    for (let k = 0; k < 2; k++) {
      if (rng() > 0.5 * dense) continue;
      const q = at((rng() - 0.5) * halfAlong * 1.6, 2.4 + rng() * 1.2);
      if (terrain.isWater(q.x, q.z)) continue;
      const gy = terrain.heightAt(q.x, q.z);
      const r = rng();
      if (r < 0.2) {
        // Bus shelter: posts, roof, back panel.
        for (const sx of [-1.7, 1.7]) {
          props.add('dark', box(0.13, 2.4, 0.13, q.x + ax * sx, gy + 1.2, q.z + az * sx, yaw),
            0x353b42, 1);
        }
        props.add('dark', box(4.0, 0.14, 1.5, q.x, gy + 2.45, q.z, yaw), 0x3c434b, 1);
        props.add('glass', box(3.8, 1.9, 0.08, q.x - f.x * 0.7, gy + 1.3, q.z - f.z * 0.7, yaw),
          0x51606e, 1);
        shelters++;
      } else if (r < 0.42) {
        // Bench, facing the street.
        props.add('stone', box(2.2, 0.16, 0.55, q.x, gy + 0.46, q.z, yaw), 0x6b563c, 1);
        props.add('stone', box(2.2, 0.5, 0.1, q.x - f.x * 0.25, gy + 0.7, q.z - f.z * 0.25, yaw),
          0x6b563c, 1);
        benches++;
      } else if (r < 0.58) {
        props.add('dark', cyl(0.36, 0.3, 1.0, 8, q.x, gy + 0.5, q.z), 0x3a4038, 1);
        bins++;
      } else if (r < 0.74) {
        // Post box: the one saturated red in the whole palette, and small
        // enough that it reads as a spark of colour rather than as an object.
        props.add('paint', cyl(0.46, 0.5, 1.9, 10, q.x, gy + 0.95, q.z), 0x8e2b22, 1);
        props.add('paint', cyl(0.5, 0.5, 0.16, 10, q.x, gy + 1.96, q.z), 0x7a251d, 1);
        boxes++;
      } else if (r < 0.86) {
        // Telephone box.
        props.add('paint', box(0.95, 2.5, 0.95, q.x, gy + 1.25, q.z, yaw), 0x8e2b22, 1);
        props.add('paint', box(1.06, 0.18, 1.06, q.x, gy + 2.55, q.z, yaw), 0x7a251d, 1);
        boxes++;
      } else {
        props.add('stone', box(1.6, 0.6, 1.6, q.x, gy + 0.3, q.z, yaw), 0x8d8779, 1);
        props.add('foliage', cyl(0.7, 0.55, 0.9, 7, q.x, gy + 1.0, q.z), 0x416a2e,
          0.8 + rng() * 0.4);
        planters++;
      }
    }
  }
  return { bollards, benches, bins, boxes, planters, shelters };
}

/**
 * Steps, porches, cornices and sills.
 *
 * The parts of a building that are *not* the box. A flat extrusion reads as a
 * volume; a cornice at the roofline and a stoop at the door read as a
 * building, because they are the features that tell you where the ground is
 * and where the top is.
 */
export function addBuildingDetail(props, terrain, plots, rng, dense) {
  let porches = 0, cornices = 0;
  for (const p of plots) {
    const gy = terrain.heightAt(p.x, p.z);
    const yaw = p.yaw || 0;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);

    // Cornice: a band proud of the wall at the roofline, and a parapet above
    // it. This is the single most valuable piece of building detail from above
    // — it puts a hard bright edge on every roof.
    props.add('stone', box(p.w + 1.1, 0.55, p.d + 1.1, p.x, p.top - 0.45, p.z, yaw),
      0xcfc6b2, 0.88 + rng() * 0.2);
    cornices++;
    if (rng() < 0.55) {
      // Parapet: a low wall standing above the roof slab.
      const t = 0.5;
      for (const [ox, oz, bw, bd] of [
        [0, (p.d + t) / 2, p.w + t * 2, t], [0, -(p.d + t) / 2, p.w + t * 2, t],
        [(p.w + t) / 2, 0, t, p.d + t], [-(p.w + t) / 2, 0, t, p.d + t],
      ]) {
        props.add('stone', box(bw, 1.0, bd,
          p.x + ox * cs + oz * sn, p.top + 0.5, p.z - ox * sn + oz * cs, yaw),
          0xc6bda9, 0.85 + rng() * 0.22);
      }
    }

    // A string course partway up taller blocks, which breaks a blank wall into
    // storeys at a glance.
    if (p.h > 16 && rng() < 0.6) {
      const at = gy + p.h * (0.34 + rng() * 0.2);
      props.add('stone', box(p.w + 0.5, 0.3, p.d + 0.5, p.x, at, p.z, yaw),
        0xc9c0ab, 0.86 + rng() * 0.2);
    }

    // Ground-floor shopfront band: a plinth the building stands on, in a
    // different material to the storeys above. Kept only a little darker than
    // the facade — at 0x4a it read as a black void cut out of the bottom of
    // every building rather than as a row of shops.
    if (rng() < 0.55) {
      props.add('stone', box(p.w + 0.35, 2.8, p.d + 0.35, p.x, gy + 1.4, p.z, yaw),
        0x7d7468, 0.88 + rng() * 0.26);
      // And a sill course capping it.
      props.add('stone', box(p.w + 0.7, 0.28, p.d + 0.7, p.x, gy + 2.9, p.z, yaw),
        0xc0b7a3, 0.9 + rng() * 0.18);
    }

    // Steps and a porch on one frontage.
    if (rng() < 0.75 * dense) {
      const alongX = rng() < 0.5;
      const sgn = rng() < 0.5 ? 1 : -1;
      const s = (rng() - 0.5) * (alongX ? p.w : p.d) * 0.55;
      const off = (alongX ? p.d : p.w) / 2;
      const ox = alongX ? s : sgn * off;
      const oz = alongX ? sgn * off : s;
      const wx = p.x + ox * cs + oz * sn;
      const wz = p.z - ox * sn + oz * cs;
      const nx = alongX ? 0 : sgn, nz = alongX ? sgn : 0;
      const dx = nx * cs + nz * sn, dz = -nx * sn + nz * cs;
      const g2 = terrain.heightAt(wx, wz);
      // Three treads out from the wall.
      for (let k = 0; k < 3; k++) {
        const out = 0.45 + k * 0.42;
        props.add('stone', box(3.0, 0.32 * (3 - k), 0.5,
          wx + dx * out, g2 + 0.16 * (3 - k), wz + dz * out, yaw),
          0xbdb3a0, 0.9 + rng() * 0.18);
      }
      // Door surround: two pilasters and a lintel.
      for (const side of [-1.1, 1.1]) {
        props.add('stone', box(0.34, 3.1, 0.34,
          wx + dx * 0.3 - dz * side, g2 + 1.55, wz + dz * 0.3 + dx * side, yaw),
          0xd2c9b4, 0.92);
      }
      props.add('stone', box(2.9, 0.4, 0.42, wx + dx * 0.3, g2 + 3.3, wz + dz * 0.3, yaw),
        0xd2c9b4, 0.92);
      props.add('dark', box(1.5, 2.6, 0.18, wx + dx * 0.16, g2 + 1.3, wz + dz * 0.16, yaw),
        0x38302a, 0.9);
      porches++;
    }

    // Weathering: a grime wash down the lower third of one or two walls, and a
    // paler bloom where rain runs off the cornice. Painted as thin boxes
    // sitting just proud of the facade.
    if (rng() < 0.7) {
      const n = valueNoise(p.x * 0.05, p.z * 0.05);
      const alongX = rng() < 0.5;
      const sgn = rng() < 0.5 ? 1 : -1;
      const off = (alongX ? p.d : p.w) / 2 + 0.1;
      const ox = alongX ? 0 : sgn * off;
      const oz = alongX ? sgn * off : 0;
      const bw = alongX ? p.w * 0.92 : 0.06;
      const bd = alongX ? 0.06 : p.d * 0.92;
      const hh = p.h * (0.26 + n * 0.16);
      props.add('grime', box(bw, hh, bd,
        p.x + ox * cs + oz * sn, gy + hh / 2, p.z - ox * sn + oz * cs, yaw),
        0x3b352e, 0.9 + rng() * 0.3);
    }
  }
  return { porches, cornices };
}

/**
 * Roof plant, awnings and area railings.
 *
 * The roofscape is the surface this game is played over, so anything standing
 * on it is worth more than the same object at street level.
 */
export function addRoofAndFrontage(props, terrain, plots, rng, dense) {
  let tanks = 0, awnings = 0, railings = 0, escapes = 0;
  for (const p of plots) {
    const gy = terrain.heightAt(p.x, p.z);
    const yaw = p.yaw || 0;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);

    if (p.flat !== false) {
      // A water tank on legs — unmistakable from above, and it breaks the
      // silhouette of an otherwise blank roof.
      if (rng() < 0.22 && Math.min(p.w, p.d) > 14) {
        const x = p.x + (rng() - 0.5) * (p.w - 7);
        const z = p.z + (rng() - 0.5) * (p.d - 7);
        for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
          props.add('dark', box(0.22, 1.7, 0.22, x + lx, p.top + 0.85, z + lz), 0x4a4238, 1);
        }
        props.add('stone', cyl(1.6, 1.6, 2.0, 10, x, p.top + 2.7, z), 0x6d6257, 0.9 + rng() * 0.2);
        tanks++;
      }
      // Rooftop plant: a low louvred box.
      if (rng() < 0.3 && Math.min(p.w, p.d) > 12) {
        const w = 2.5 + rng() * 3, d = 2 + rng() * 2.5;
        props.add('metal', box(w, 1.3, d,
          p.x + (rng() - 0.5) * (p.w - w - 4), p.top + 0.65,
          p.z + (rng() - 0.5) * (p.d - d - 4), yaw), 0x878d91, 0.9 + rng() * 0.2);
      }
    }

    // An awning over the shopfront on one frontage: a bright sloped plane at
    // ground level, which is a rare spot of saturated colour in a stone city.
    if (rng() < 0.3 * dense) {
      const alongX = rng() < 0.5;
      const sgn = rng() < 0.5 ? 1 : -1;
      const off = (alongX ? p.d : p.w) / 2 + 0.9;
      const ox = alongX ? (rng() - 0.5) * p.w * 0.5 : sgn * off;
      const oz = alongX ? sgn * off : (rng() - 0.5) * p.d * 0.5;
      const len = 4 + rng() * 4;
      const g = alongX
        ? box(len, 0.16, 1.8, p.x + ox * cs + oz * sn, gy + 3.3, p.z - ox * sn + oz * cs, yaw)
        : box(1.8, 0.16, len, p.x + ox * cs + oz * sn, gy + 3.3, p.z - ox * sn + oz * cs, yaw);
      g.rotateX(0);
      props.add('paint', g,
        [0x8a4038, 0x35566b, 0x4a6a44, 0x7a6330][Math.floor(rng() * 4)], 1);
      awnings++;
    }

    // Area railings in front of the taller terraces — a run of thin verticals
    // between the pavement and the building.
    if (p.h > 14 && rng() < 0.35 * dense) {
      const alongX = rng() < 0.5;
      const sgn = rng() < 0.5 ? 1 : -1;
      const off = (alongX ? p.d : p.w) / 2 + 2.1;
      const halfAlong = (alongX ? p.w : p.d) / 2;
      for (let t = -halfAlong + 2; t < halfAlong - 2; t += 1.1) {
        const ox = alongX ? t : sgn * off;
        const oz = alongX ? sgn * off : t;
        const x = p.x + ox * cs + oz * sn, z = p.z - ox * sn + oz * cs;
        if (terrain.isWater(x, z)) continue;
        props.add('dark', box(0.07, 1.25, 0.07, x, terrain.heightAt(x, z) + 0.62, z),
          0x2b2f33, 1);
      }
      railings++;
    }

    // A fire escape zig-zagging up one flank of the occasional tall block.
    if (p.h > 22 && rng() < 0.18) {
      const sgn = rng() < 0.5 ? 1 : -1;
      const off = p.d / 2 + 0.7;
      const flights = Math.floor(p.h / 4.2);
      for (let k = 1; k < flights; k++) {
        const y = gy + k * 4.2;
        const ox = (k % 2 ? -1 : 1) * p.w * 0.16;
        const oz = sgn * off;
        props.add('metal', box(p.w * 0.3, 0.12, 1.2,
          p.x + ox * cs + oz * sn, y, p.z - ox * sn + oz * cs, yaw), 0x5d5348, 1);
      }
      escapes++;
    }
  }
  return { tanks, awnings, railings, escapes };
}

/**
 * The river wall, and the steps down to the water.
 *
 * Without an edge the ground simply stops being ground and starts being river,
 * which from the air reads as a painted line rather than as a bank. A parapet
 * gives the waterline a hard shadow and a known height, and it is what stops
 * the streets appearing to run straight into the Thames.
 */
export function addRiverEdge(props, terrain, rng) {
  const span = terrain.span;
  const step = 7;
  let wall = 0, stairs = 0;
  const level = terrain.waterLevel;

  for (let z = -span * 0.96; z < span * 0.96; z += step) {
    // Walk east until the shoreline, from both sides of the map.
    for (const dir of [1, -1]) {
      let found = null;
      for (let t = 0; t < span * 1.9; t += 3) {
        const x = dir > 0 ? -span * 0.96 + t : span * 0.96 - t;
        if (terrain.isWater(x, z)) { found = x; break; }
      }
      if (found === null) continue;
      const x = found - dir * 1.6;
      const gy = terrain.heightAt(x, z);
      if (gy < level - 0.5) continue;
      const h = Math.max(1.0, gy - level + 1.6);
      props.add('stone', box(2.6, h, step + 0.6, x, level - 1.6 + h / 2, z),
        0x8f8778, 0.86 + rng() * 0.2);
      // Coping: a paler cap along the top of the wall.
      props.add('stone', box(3.0, 0.32, step + 0.6, x, level - 1.6 + h + 0.16, z),
        0xc3bba8, 0.9 + rng() * 0.16);
      wall++;
      // Occasional stair down to the water.
      if (rng() < 0.05) {
        for (let k = 0; k < 5; k++) {
          props.add('stone', box(2.0, 0.3, 1.0 + k * 0.2,
            x + dir * (1.4 + k * 0.5), level - 1.4 + h - k * 0.42, z),
            0xa39a88, 0.9);
        }
        stairs++;
      }
    }
  }
  return { wall, stairs };
}
