import * as THREE from 'three';
import { WING } from '../structure/landmarks/bigben.js';
import { EIFFEL } from '../structure/landmarks/eiffel.js';
import { TAJ } from '../structure/landmarks/tajmahal.js';

/**
 * Flags on the landmarks.
 *
 * A still building is a model of a building. One thing moving on it — a
 * flag lifting and dropping in the wind — is what says there is weather, and
 * scale, and that the thing is really there. Each flag is a cloth with a
 * wave run through it in the vertex shader, on a pole standing on a stone;
 * and it belongs to that stone, so when the masonry under it is shot away or
 * goes over, the flag goes with it.
 */

const ALIVE = 1, FREE = 2, ISLAND = 8;

/** Where each level's flags stand: on which structure, and where on it. */
export const FLAG_SITES = {
  westminster: [
    // On the ridge of the Palace wing's roof.
    { key: 'wing', x: 0, y: WING.height + 12.2, z: WING.z0 + WING.len / 2,
      pattern: 'union', w: 12, h: 7, pole: 11 },
  ],
  paris: [
    // On the summit deck, beside the lantern.
    { key: 'eiffel', x: EIFFEL.thirdDeckHalf - 1.0, y: EIFFEL.thirdFloor, z: 0,
      pattern: 'tricolore', w: 8, h: 5, pole: 8 },
  ],
  agra: [
    // On the roofs of the mosque and the jawab, between the domes.
    { key: 'mosque', x: -TAJ.mosqueX, y: TAJ.mosqueRoof + 4, z: 8.5 * TAJ.scale,
      pattern: 'india', w: 9, h: 6, pole: 9 },
    { key: 'jawab', x: TAJ.mosqueX, y: TAJ.mosqueRoof + 4, z: -8.5 * TAJ.scale,
      pattern: 'india', w: 9, h: 6, pole: 9 },
  ],
  giza: [
    // On the Sphinx's back.
    { key: 'sphinx', x: 0, y: 16, z: 18, pattern: 'egypt', w: 8, h: 5, pole: 8 },
  ],
};

/** The cloth's pattern, drawn once into a small canvas. */
const PATTERNS = {
  union(ctx, w, h) {
    ctx.fillStyle = '#1b3a7a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2f2ec'; ctx.lineWidth = h * 0.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
    ctx.strokeStyle = '#c8202f'; ctx.lineWidth = h * 0.07;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
    ctx.fillStyle = '#f2f2ec';
    ctx.fillRect(w * 0.5 - h * 0.17, 0, h * 0.34, h);
    ctx.fillRect(0, h * 0.5 - h * 0.17, w, h * 0.34);
    ctx.fillStyle = '#c8202f';
    ctx.fillRect(w * 0.5 - h * 0.1, 0, h * 0.2, h);
    ctx.fillRect(0, h * 0.5 - h * 0.1, w, h * 0.2);
  },
  tricolore(ctx, w, h) {
    ctx.fillStyle = '#1f4fa3'; ctx.fillRect(0, 0, w / 3, h);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(w / 3, 0, w / 3, h);
    ctx.fillStyle = '#d3232f'; ctx.fillRect((w * 2) / 3, 0, w / 3, h);
  },
  india(ctx, w, h) {
    ctx.fillStyle = '#f2963a'; ctx.fillRect(0, 0, w, h / 3);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, h / 3, w, h / 3);
    ctx.fillStyle = '#2d8a4b'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
    ctx.strokeStyle = '#1e3f8c'; ctx.lineWidth = h * 0.03;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.13, 0, Math.PI * 2); ctx.stroke();
  },
  egypt(ctx, w, h) {
    ctx.fillStyle = '#cf2231'; ctx.fillRect(0, 0, w, h / 3);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, h / 3, w, h / 3);
    ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
    ctx.fillStyle = '#c9a227';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.11, 0, Math.PI * 2); ctx.fill();
  },
};

function patternTexture(name, w, h) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = Math.round(128 * (h / w));
  const ctx = c.getContext('2d');
  (PATTERNS[name] || PATTERNS.tricolore)(ctx, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Flags {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.list = [];
    this.uTime = { value: 0 };
    this._poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.6 });
  }

  /**
   * Raise every flag a level asks for, each on the structure it names.
   * @param {object[]} sites   entries from `FLAG_SITES`
   * @param {Map<string, object>} structures   by key
   */
  raise(sites, structures) {
    for (const s of sites) {
      const st = structures[s.key];
      if (!st) continue;
      const base = snapToStone(st, st.origin.x + s.x, st.groundY + s.y, st.origin.z + s.z);
      if (!base) continue;
      this._add(st, base.chunk, base.x, base.y, base.z, s);
    }
  }

  _add(structure, chunk, x, y, z, s) {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, s.pole, 8), this._poleMat);
    pole.position.y = s.pole / 2;
    pole.castShadow = this.quality.shadowMapSize > 0;
    g.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xe2b446, roughness: 0.3, metalness: 0.8 }));
    knob.position.y = s.pole + 0.25;
    g.add(knob);

    // The cloth: hung from its left edge at the pole top, waving in local z.
    const geo = new THREE.PlaneGeometry(s.w, s.h, 18, 8);
    geo.translate(s.w / 2, -s.h / 2, 0);
    const mat = new THREE.MeshStandardMaterial({
      map: patternTexture(s.pattern, s.w, s.h), side: THREE.DoubleSide,
      roughness: 0.88, metalness: 0,
    });
    const uTime = this.uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          // Free at the fly, pinned at the hoist: the wave grows with uv.x.
          float fl = uv.x;
          float wv = sin(fl * 5.5 - uTime * 6.0) * 0.28
                   + sin(fl * 12.0 - uTime * 9.5 + uv.y * 3.0) * 0.09;
          transformed.z += wv * fl * fl * ${(s.w * 0.55).toFixed(2)};
          transformed.y += sin(fl * 3.0 - uTime * 4.0) * 0.07 * fl * ${s.h.toFixed(2)};
        `);
    };
    mat.customProgramCacheKey = () => `flag-${s.w}-${s.h}`;
    const cloth = new THREE.Mesh(geo, mat);
    cloth.position.y = s.pole - 0.1;
    cloth.castShadow = this.quality.shadowMapSize > 0;
    cloth.frustumCulled = false;
    g.add(cloth);

    // Fly downwind: the sky's clouds drift toward +x.
    g.rotation.y = 0.35;
    this.scene.add(g);
    this.list.push({ group: g, structure, chunk });
  }

  update(dt) {
    this.uTime.value += dt;
    for (const f of this.list) {
      const fl = f.structure.flags[f.chunk];
      const standing = (fl & ALIVE) && !(fl & (FREE | ISLAND));
      if (f.group.visible !== !!standing) f.group.visible = !!standing;
    }
  }
}

/**
 * The top of the highest stone under a point, and which stone it is.
 *
 * A flagpole stands on masonry; asking for a height and hoping a stone is
 * there leaves the pole floating when the tier's course grid puts the roof a
 * metre lower. Snapping to the stone that is actually there is what makes the
 * same site work at every quality setting.
 */
function snapToStone(st, x, y, z) {
  let best = -1, bestTop = -Infinity;
  for (let i = 0; i < st.count; i++) {
    if (!(st.flags[i] & ALIVE)) continue;
    if (Math.abs(st.px[i] - x) > st.hx[i] + 0.3 || Math.abs(st.pz[i] - z) > st.hz[i] + 0.3) continue;
    const top = st.py[i] + st.hy[i];
    if (top > y + 6 || top < y - 30) continue;
    if (top > bestTop) { bestTop = top; best = i; }
  }
  if (best < 0) return null;
  return { chunk: best, x, y: bestTop, z };
}
