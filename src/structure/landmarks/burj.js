import * as THREE from 'three';
import { BlockList, MATERIALS as M } from '../builder.js';

/**
 * The Burj Khalifa: a concrete core and glass, stepping back as it climbs.
 *
 * STUB. This file is the placeholder the level was wired with: one block so
 * the map loads and the campaign, cast and flag tables can be checked. The
 * masonry is built by the map's own pass; see docs/NEW_MAP_PLAYBOOK.md §2–4.
 */
export const BURJ = {
  scale: 0.6,
  // Where the flag flies: on a stone that falls when the building does.
  flag: { x: 0, y: 12 * 0.6, z: 0 },
};

export function buildBurjKhalifa(quality) {
  const B = new BlockList();
  const s = quality.blockScale;
  const S = BURJ.scale;
  B.section('burj', () => {
    B.slab(0, 0, 0, 10 * S, 12 * S, 10 * S, 2.0 * s, M.CONCRETE);
  });
  return B;
}

/** The garrison: positions read from the constants above. */
export function populateBurjKhalifa(g, origin, groundY) {
  const S = BURJ.scale;
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.place('rifleman', new THREE.Vector3(origin.x + nx * 5 * S, groundY + 12 * S + 1.2, origin.z + nz * 5 * S),
      Math.atan2(nx, nz), 7, { cover: 'roof' });
  }
}
