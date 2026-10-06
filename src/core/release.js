import * as THREE from 'three';

/**
 * Give a removed subtree's GPU memory back.
 *
 * `scene.remove(group)` takes a thing out of the picture and leaves its
 * geometry, materials and textures on the GPU: three.js never disposes
 * anything on its own. A unit lost, a sortie flown, a parachute landed
 * each left their buffers behind, and a long fight with a big battery
 * grew by a dozen geometries a unit until a phone killed the page.
 *
 * What may be disposed is what nothing else uses. The removed tree's
 * resources are collected, then everything still in the scene (and in
 * `pinned`: the model cache, whose wrappers live outside the scene and
 * are cloned into every unit) crosses off what it shares; the rest goes.
 * A texture goes only when no material left in the scene has it, and one
 * marked `userData.keep` never does; materials stay (see below: their
 * programs are the shared thing). Disposing something still wanted is
 * not fatal in three.js — it is re-uploaded on its next draw — so the
 * cost of a wrong guess is a hitch, not a hole; the cost of never
 * disposing was the crash.
 *
 * Call it after `scene.remove(root)`.
 */
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap'];
const mats = (o) => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []);

export function releaseTree(root, scene, pinned = null) {
  if (!root) return 0;
  const geos = new Set(), materials = new Set();
  root.traverse((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
    if (o.geometry) geos.add(o.geometry);
    for (const m of mats(o)) materials.add(m);
  });
  if (!geos.size && !materials.size) return 0;
  const live = (o) => {
    if (o.geometry) geos.delete(o.geometry);
    for (const m of mats(o)) materials.delete(m);
  };
  scene.traverse(live);
  if (pinned) for (const p of pinned) if (p && p.traverse) p.traverse(live);
  let n = 0;
  for (const g of geos) { g.dispose(); n++; }
  // The materials themselves are left alone. A material's GPU footprint is
  // its shader program, and that is shared by every material like it;
  // dispose the last one and the program goes with it, and the next sortie
  // of that type compiles it again — a fifth of a second here, a hitch on a
  // phone, on every lift. What a material holds that is worth having back
  // is its textures: an airframe's skin is painted afresh for every flight.
  if (materials.size) {
    const texs = new Set();
    for (const m of materials) {
      for (const k of TEX_KEYS) if (m[k] && m[k].isTexture && !m[k].userData?.keep) texs.add(m[k]);
    }
    if (texs.size) {
      const used = new Set();
      const mark = (o) => { for (const m of mats(o)) for (const k of TEX_KEYS) if (m[k]) used.add(m[k]); };
      scene.traverse(mark);
      if (pinned) for (const p of pinned) if (p && p.traverse) p.traverse(mark);
      for (const t of texs) if (!used.has(t)) { t.dispose(); n++; }
    }
  }
  return n;
}

/** The three.js version in play, for the record of what was released. */
export const THREE_REVISION = THREE.REVISION;
