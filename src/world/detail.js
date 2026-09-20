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

  /**
   * @param {string} key material bucket; `geo` is consumed.
   *
   * While `this.plot` is set, every piece added belongs to that building —
   * its cornice, its parapet, its stoop, the tank on its roof — and burns
   * with it.
   */
  add(key, geo, colour, jitter = 1) {
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, b = []);
    if (colour !== undefined) tint(geo, colour, jitter);
    if (this.plot !== undefined) geo.userData.plot = this.plot;
    b.push(geo);
    return geo;
  }

  /** Build the merged meshes into `group`. */
  flush(group, materials) {
    const shadows = this.quality.shadowMapSize > 0;
    for (const [key, geos] of this.buckets) {
      if (!geos.length) continue;
      const ranges = plotRanges(geos);
      const merged = BufferGeometryUtils.mergeGeometries(geos, false);
      if (!merged) continue;
      if (ranges.size) markBurnable(merged, ranges);
      const spec = materials[key] || {};
      const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: spec.roughness ?? 0.92,
        metalness: spec.metalness ?? 0.0,
        emissive: spec.emissive !== undefined ? new THREE.Color(spec.emissive) : 0x000000,
        emissiveIntensity: spec.emissiveIntensity ?? 1,
        transparent: !!spec.transparent,
        opacity: spec.opacity ?? 1,
        depthWrite: spec.depthWrite !== false,
        polygonOffset: !!spec.offset,
        polygonOffsetFactor: spec.offset ? -(spec.offsetLevel ?? 2) : 0,
        polygonOffsetUnits: spec.offset ? -(spec.offsetLevel ?? 2) : 0,
      }));
      mesh.name = key;
      if (ranges.size) { burnable(mesh.material); mesh.userData.plotRanges = ranges; }
      mesh.castShadow = shadows && spec.cast !== false;
      mesh.receiveShadow = shadows && spec.receive !== false;
      if (spec.renderOrder) mesh.renderOrder = spec.renderOrder;
      mesh.frustumCulled = false;
      group.add(mesh);
      this.buckets.set(key, []);
    }
  }
}

/**
 * Where each building's pieces end up in a merge, by vertex: the merge lays
 * the geometries end to end in order, so this is a running count over the
 * ones tagged with a plot.
 */
export function plotRanges(geos) {
  const ranges = new Map();
  let off = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    if (g.userData.plot !== undefined) {
      let r = ranges.get(g.userData.plot);
      if (!r) ranges.set(g.userData.plot, r = []);
      r.push([off, n]);
    }
    off += n;
  }
  return ranges;
}

/** Give a merged geometry its burn channel: nothing has burnt yet. */
export function markBurnable(merged) {
  const burn = new THREE.BufferAttribute(new Float32Array(merged.attributes.position.count), 1);
  burn.setUsage(THREE.DynamicDrawUsage);
  merged.setAttribute('aBurn', burn);
  return merged;
}

/**
 * Teach a material to burn.
 *
 * `aBurn` is one on a gutted building and zero everywhere else. It takes the
 * surface to soot and puts any emissive light out — the lit windows, which
 * the vertex colour alone could never do: emissive light is added after the
 * tint, and a burnt-out block with its windows still glowing is a block that
 * is not burnt out.
 */
export function burnable(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBurn;\nvarying float vBurn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBurn = aBurn;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBurn;')
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n'
        + 'if (vBurn > 0.0) {\n'
        + '  float soot = 0.07 + 0.05 * fract(sin(dot(floor(gl_FragCoord.xy / 3.0), vec2(12.9898, 78.233))) * 43758.5453);\n'
        + '  vec3 charred = vec3(soot * 1.15, soot * 0.98, soot * 0.88);\n'
        + '  diffuseColor.rgb = mix(diffuseColor.rgb, charred, vBurn);\n'
        + '}')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= (1.0 - vBurn);');
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => `${key}|burnable`;
  return material;
}

export function tint(geo, hex, jitter) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex).multiplyScalar(jitter);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** A box, placed and yawed in one call. */
export function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function cyl(rt, rb, h, seg, x, y, z) {
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
  // A tier nearer the eye than the road they are painted on, which is itself
  // a tier nearer than the ground: paint at the road's own offset was the
  // shimmer on every crossing.
  markings: { roughness: 0.97, cast: false, offset: true, offsetLevel: 4, renderOrder: 2 },
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
    props.plot = p.index;
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
  props.plot = undefined;
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
    props.plot = p.index;
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
  props.plot = undefined;
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
export function addRiverEdge(props, terrain, rng, opts = {}) {
  const span = terrain.span;
  const step = 7;
  const counts = { wall: 0, stairs: 0, balusters: 0, lamps: 0, rings: 0, moorings: 0 };
  const level = terrain.waterLevel;
  const ghats = opts.river === 'ghats';

  /**
   * Find the bank: every point on the map where dry ground meets water.
   *
   * `axis` 0 walks lines of constant z and finds the shoreline east and west;
   * `axis` 1 does the same the other way round. Both are needed: a scan of
   * constant-z lines finds the *ends* of an east-west river and nothing along
   * its length, which is why Agra used to get two tips of embankment and eight
   * hundred metres of bare edge between them.
   *
   * The four sweeps are samples of one shoreline, not four shorelines, and that
   * is the whole of what was wrong with this. Each sweep used to be laid as its
   * own set of walls, with a nine-metre grid stopping a later sweep building
   * where an earlier one had — so a stretch of bank the north-south sweep had
   * sampled coarsely got its gaps *blocked* by the grid rather than filled by
   * the east-west sweep, and the Thames came out as a row of disconnected slabs
   * with the ground showing between them. The samples are pooled here instead,
   * thinned once, and chained into a single ordered line below.
   */
  const sweep = (axis, dir, out) => {
    const at = (along, across) => (axis === 0
      ? { x: across, z: along }
      : { x: along, z: across });
    for (let a = -span * 0.98; a < span * 0.98; a += step) {
      let found = null;
      for (let t = 0; t < span * 1.95; t += 3) {
        const c = dir > 0 ? -span * 0.98 + t : span * 0.98 - t;
        const p = at(a, c);
        if (terrain.isWater(p.x, p.z)) { found = c; break; }
      }
      if (found === null) continue;
      // Step back from the waterline until the ground is above the water,
      // rather than by a fixed metre and a half: the channel is cut with a
      // feathered shoulder, so the first few metres outside the wet mask are
      // still below the surface.
      for (let back = 1.6; back <= 26; back += 2.0) {
        const c = found - dir * back;
        const p = at(a, c);
        const g = terrain.heightAt(p.x, p.z);
        if (g >= level - 0.2) { out.push({ x: p.x, z: p.z, gy: g }); break; }
      }
    }
  };

  /**
   * Thread the samples into one line along the bank.
   *
   * Nearest-neighbour from each end, which is the right algorithm here for a
   * reason worth stating: the points are already dense along a curve, so the
   * nearest unused point is the next one along it, and the only way to be wrong
   * is at a place where two stretches of bank pass close to each other — which
   * on these maps is a river narrower than the sample spacing, and there isn't
   * one. A chain stops when the nearest unused point is further off than a
   * bank ever steps, and that break is a real break: the far side of a dock
   * mouth, or a different body of water altogether.
   */
  const chain = (pts) => {
    const CELL = 16;
    const grid = new Map();
    const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    // Thin first: four sweeps put two or three samples on the same few metres
    // of bank, and a chain that zig-zags between them is a chain of one-metre
    // pieces at forty degrees to the shore.
    const seen = new Set();
    const pool = [];
    for (const p of pts) {
      const k = `${Math.round(p.x / 6)},${Math.round(p.z / 6)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(p);
    }
    for (const p of pool) {
      const k = key(p.x, p.z);
      let b = grid.get(k);
      if (!b) grid.set(k, b = []);
      b.push(p);
    }
    const near = (p, max) => {
      let best = null, bd = max * max;
      const gx = Math.floor(p.x / CELL), gz = Math.floor(p.z / CELL);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const b = grid.get(`${gx + i},${gz + j}`);
          if (!b) continue;
          for (const q of b) {
            if (q.used) continue;
            const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
            if (d < bd) { bd = d; best = q; }
          }
        }
      }
      return best;
    };
    const REACH = step * 2.4;
    const runs = [];
    for (const seed of pool) {
      if (seed.used) continue;
      seed.used = true;
      const run = [seed];
      for (let dirn = 0; dirn < 2; dirn++) {
        let head = run[dirn === 0 ? run.length - 1 : 0];
        for (;;) {
          const q = near(head, REACH);
          if (!q) break;
          q.used = true;
          if (dirn === 0) run.push(q); else run.unshift(q);
          head = q;
        }
      }
      if (run.length >= 2) runs.push(run);
    }
    return runs;
  };

  /**
   * Lay one chained run as a continuous embankment.
   *
   * Three things were broken here and all three came from the same place: the
   * wall was built per *sample* rather than per *stretch*, on a grid that
   * refused to build twice in the same nine metres. So a piece was dropped
   * wherever two sweeps overlapped, the wall was laid square to the map rather
   * than along the water, and there was nothing to walk on — just a parapet
   * with grass behind it. What you saw from the Palace was a line of separate
   * slabs with the bank showing through.
   *
   * Now: one piece per segment of the chain, no grid and nothing dropped, each
   * piece turned to the segment it belongs to, with a paved walk behind the
   * parapet running the whole way. The walk is the point. An embankment is a
   * promenade with a wall on the river side of it, and the wall on its own is
   * a retaining structure in a field.
   */
  const lay = (run) => {
    if (run.length < 2) return;
    for (let k = 0; k < run.length - 1; k++) {
      const p0 = run[k], p1 = run[k + 1];
      const dx = p1.x - p0.x, dz = p1.z - p0.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.5 || len > step * 2.6) continue;
      const ux = dx / len, uz = dz / len;
      // `box` turns local +X to (cos ry, -sin ry), so this points the piece's
      // length along the bank.
      const ry = Math.atan2(-uz, ux);
      const cx = (p0.x + p1.x) / 2, cz = (p0.z + p1.z) / 2;
      const gy = (p0.gy + p1.gy) / 2;
      // Which side the water is on, asked of the water rather than inferred
      // from which way the sweep happened to be walking. A chained bank turns
      // through every bearing there is, and half of it would otherwise have
      // its parapet on the river side and its pavement in the Thames.
      let nx = -uz, nz = ux;
      if (!terrain.isWater(cx + nx * 9, cz + nz * 9)) { nx = -nx; nz = -nz; }
      if (!terrain.isWater(cx + nx * 9, cz + nz * 9)) continue;

      /** A box in the piece's own frame: `l` along the bank, `t` across it. */
      const piece = (kind, t, hgt, l, off, y, color, jitter) => {
        props.add(kind, box(l, hgt, t, cx + nx * off, y, cz + nz * off, ry),
          color, jitter);
      };
      const postAt = (kind, r0, r1, hgt, seg, s, off, y, color, jitter) => {
        props.add(kind, cyl(r0, r1, hgt, seg,
          cx + ux * s + nx * off, y, cz + uz * s + nz * off), color, jitter);
      };

      const h = Math.max(1.0, gy - level + 1.6);
      const top = level - 1.6 + h;
      // Overlapped by a metre and a half at each end, so consecutive pieces
      // meet through a bend instead of leaving a wedge of daylight at it.
      const L = len + 3.0;
      piece('stone', 2.6, h, L, 0, level - 1.6 + h / 2, 0x8f8778,
        0.86 + rng() * 0.2);
      // Coping: a paler cap along the top of the wall.
      piece('stone', 3.0, 0.32, L, 0, top + 0.16, 0xc3bba8,
        0.9 + rng() * 0.16);
      counts.wall++;

      if (ghats) {
        // The Yamuna side is steps down to the water, not a parapet: broad
        // shallow ghats running the length of the bank.
        for (let j = 0; j < 6; j++) {
          piece('stone', 1.6, 0.34, L, 1.6 + j * 1.5, top - j * 0.36,
            0xb2a68d, 0.88 + rng() * 0.2);
        }
        counts.stairs++;
        continue;
      }

      // ── The walk itself: six metres of paving behind the parapet, its
      // surface flush with the coping and its far edge bedded into whatever
      // the ground is doing, so there is no lip to trip the eye at either end.
      piece('stone', 6.4, 0.9, L, -4.5, top - 0.29, 0xa9a290, 0.92 + rng() * 0.1);
      counts.walk = (counts.walk || 0) + 1;

      // ── A parapet, and above it a stone balustrade: the thing that makes an
      // embankment read as an embankment from any distance is the *dotted*
      // line of light and shadow along its top, which a solid wall does not
      // give you.
      piece('stone', 0.55, 0.36, L, -0.9, top + 0.5, 0xbdb5a2, 0.94);
      piece('stone', 0.55, 0.3, L, -0.9, top + 1.42, 0xc7bfab, 0.94);
      const bal = Math.max(3, Math.round(len / 1.1));
      for (let j = 0; j < bal; j++) {
        const sOff = -len / 2 + (j + 0.5) * (len / bal);
        postAt('stone', 0.13, 0.19, 0.9, 6, sOff, -0.9, top + 1.0,
          0xc1b9a6, 0.9 + rng() * 0.14);
        counts.balusters++;
      }

      // Sturgeon lamps along the parapet, and mooring rings below them.
      if (k % 6 === 0) {
        postAt('metal', 0.3, 0.42, 1.1, 8, 0, -0.9, top + 2.1, 0x2c3a3a, 1);
        postAt('metal', 0.1, 0.16, 4.6, 6, 0, -0.9, top + 4.7, 0x30403f, 1);
        piece('metal', 0.72, 0.9, 0.72, -0.9, top + 7.3, 0x283634, 1);
        // The lamp itself, bright enough to read at dusk.
        piece('glow', 0.5, 0.62, 0.5, -0.9, top + 7.3, 0xffe6b4, 1);
        counts.lamps++;
      }
      if (rng() < 0.12) {
        postAt('metal', 0.28, 0.28, 0.12, 8, 0, 1.2, level + 0.9, 0x3b3f42, 1);
        counts.rings++;
      }
      // Occasional stair down to the water, with a landing at the bottom.
      if (rng() < 0.045) {
        for (let j = 0; j < 6; j++) {
          piece('stone', 2.0, 0.3, 1.0 + j * 0.2, 1.4 + j * 0.5,
            top - 0.2 - j * 0.42, 0xa39a88, 0.9);
        }
        piece('stone', 3.0, 0.3, 4.0, 4.4, level + 0.35, 0x9d9483, 0.92);
        counts.stairs++;
      }
      // A moored barge or launch, tied against the wall.
      if (rng() < 0.05) {
        piece('dark', 4.4, 1.5, 15, 5.5, level + 0.4, 0x3b4249,
          0.86 + rng() * 0.24);
        piece('paint', 3.4, 1.3, 5.5, 5.5, level + 1.6, 0xb8b2a2, 1);
      }
    }
  };

  const samples = [];
  for (const axis of [0, 1]) {
    for (const dir of [1, -1]) sweep(axis, dir, samples);
  }
  for (const run of chain(samples)) lay(run);
  return counts;
}
