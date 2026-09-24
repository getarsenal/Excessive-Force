import * as THREE from 'three';
import { WING } from '../structure/landmarks/bigben.js';
import { EIFFEL } from '../structure/landmarks/eiffel.js';
import { TAJ } from '../structure/landmarks/tajmahal.js';
import { CASTILLO } from '../structure/landmarks/chichen.js';
import { PISA, axisAt as pisaAxisAt } from '../structure/landmarks/pisa.js';
import { OPERA } from '../structure/landmarks/sydney.js';
import { BASIL, KREMLIN } from '../structure/landmarks/moscow.js';
import { REDEEMER } from '../structure/landmarks/rio.js';
import { PARTHENON } from '../structure/landmarks/parthenon.js';
import { SOPHIA } from '../structure/landmarks/hagiasophia.js';
import { DOM } from '../structure/landmarks/cologne.js';
import { HIMEJI } from '../structure/landmarks/himeji.js';
import { BURJ } from '../structure/landmarks/burj.js';
import { PETRONAS } from '../structure/landmarks/petronas.js';
import { POTALA } from '../structure/landmarks/potala.js';

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
  chichen: [
    // On the roof of the temple of Kukulcán, which is the highest stone on
    // the site and comes down with the crown of the pyramid.
    { key: 'castillo', x: CASTILLO.templeHalf - 1.4,
      y: CASTILLO.platform + CASTILLO.templeH + 2.6, z: 0,
      pattern: 'mexico', w: 9, h: 5, pole: 9 },
  ],
  pisa: [
    // On the bell chamber, at the top of the campanile. Its foot is set on the
    // tower's own axis rather than on the base centre: five and a half metres
    // of lean separate the two by the time you are up there.
    { key: 'campanile', x: PISA.bellR - 1.2,
      y: PISA.bellY + PISA.bellH * 0.9, z: pisaAxisAt(PISA.bellY + PISA.bellH),
      pattern: 'italy', w: 8, h: 5, pole: 8 },
  ],
  sydney: [
    // On the deck at the head of the monumental steps, which is where the
    // flagpoles actually stand and the first thing anyone coming up sees.
    { key: 'opera', x: -OPERA.stepsW * 0.28, y: OPERA.deck + 1.0,
      z: -OPERA.podiumZ + 6, pattern: 'australia', w: 10, h: 6, pole: 12 },
    { key: 'opera', x: OPERA.stepsW * 0.28, y: OPERA.deck + 1.0,
      z: -OPERA.podiumZ + 6, pattern: 'australia', w: 10, h: 6, pole: 12 },
  ],
  moscow: [
    // On the Spasskaya Tower, over the gate, which is where it flies.
    { key: 'kremlin', x: 0, y: KREMLIN.towers[0].h * 0.62 + 2.0, z: 0,
      pattern: 'russia', w: 10, h: 6, pole: 11 },
    // And on the deck of the basement, at the corner of the gallery.
    { key: 'basils', x: BASIL.podHalf - 3.0, y: BASIL.podH + 3.0,
      z: -BASIL.podHalf + 3.0, pattern: 'russia', w: 8, h: 5, pole: 9 },
  ],
  rio: [
    // On the bottom terrace, either side of the stair, which is where a flag
    // on a mountain goes: high enough to be seen from the city below and low
    // enough that it is not competing with the statue.
    { key: 'redeemer', x: -REDEEMER.terraces[0].half + 4.0,
      y: REDEEMER.terraces[0].h + 1.4, z: REDEEMER.terraces[0].half - 4.0,
      pattern: 'brazil', w: 9, h: 6, pole: 10 },
    { key: 'redeemer', x: REDEEMER.terraces[0].half - 4.0,
      y: REDEEMER.terraces[0].h + 1.4, z: REDEEMER.terraces[0].half - 4.0,
      pattern: 'brazil', w: 9, h: 6, pole: 10 },
  ],
  // The third five read their site from the builder's own constants, so a
  // builder that moves its roof moves its flag.
  athens: [{ key: 'parthenon', ...PARTHENON.flag, pattern: 'greece', w: 9, h: 6, pole: 9 }],
  istanbul: [{ key: 'sophia', ...SOPHIA.flag, pattern: 'turkey', w: 9, h: 6, pole: 9 }],
  cologne: [{ key: 'dom', ...DOM.flag, pattern: 'germany', w: 8, h: 5, pole: 9 }],
  himeji: [{ key: 'keep', ...HIMEJI.flag, pattern: 'japan', w: 8, h: 5.5, pole: 9 }],
  dubai: [{ key: 'burj', ...BURJ.flag, pattern: 'uae', w: 9, h: 4.5, pole: 9 }],
  petronas: [{ key: 'petronas', ...PETRONAS.flag, pattern: 'malaysia', w: 9, h: 4.5, pole: 9 }],
  potala: [{ key: 'potala', ...POTALA.flag, pattern: 'china', w: 9, h: 6, pole: 10 }],
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
  mexico(ctx, w, h) {
    ctx.fillStyle = '#006847'; ctx.fillRect(0, 0, w / 3, h);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(w / 3, 0, w / 3, h);
    ctx.fillStyle = '#ce1126'; ctx.fillRect((w * 2) / 3, 0, w / 3, h);
    // The eagle, at this size, is a dark mark in the middle band.
    ctx.fillStyle = '#5c4326';
    ctx.beginPath(); ctx.ellipse(w / 2, h / 2, h * 0.13, h * 0.10, 0, 0, Math.PI * 2); ctx.fill();
  },
  italy(ctx, w, h) {
    ctx.fillStyle = '#008c45'; ctx.fillRect(0, 0, w / 3, h);
    ctx.fillStyle = '#f4f5f0'; ctx.fillRect(w / 3, 0, w / 3, h);
    ctx.fillStyle = '#cd212a'; ctx.fillRect((w * 2) / 3, 0, w / 3, h);
  },
  russia(ctx, w, h) {
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h / 3);
    ctx.fillStyle = '#0039a6'; ctx.fillRect(0, h / 3, w, h / 3);
    ctx.fillStyle = '#d52b1e'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
  },
  australia(ctx, w, h) {
    ctx.fillStyle = '#00247d'; ctx.fillRect(0, 0, w, h);
    // The canton, drawn as the Union's crosses at a quarter size.
    const cw = w * 0.5, ch = h * 0.5;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.clip();
    ctx.strokeStyle = '#f2f2ec'; ctx.lineWidth = ch * 0.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cw, ch); ctx.moveTo(cw, 0); ctx.lineTo(0, ch); ctx.stroke();
    ctx.strokeStyle = '#c8202f'; ctx.lineWidth = ch * 0.07;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cw, ch); ctx.moveTo(cw, 0); ctx.lineTo(0, ch); ctx.stroke();
    ctx.fillStyle = '#f2f2ec';
    ctx.fillRect(cw * 0.5 - ch * 0.17, 0, ch * 0.34, ch);
    ctx.fillRect(0, ch * 0.5 - ch * 0.17, cw, ch * 0.34);
    ctx.fillStyle = '#c8202f';
    ctx.fillRect(cw * 0.5 - ch * 0.1, 0, ch * 0.2, ch);
    ctx.fillRect(0, ch * 0.5 - ch * 0.1, cw, ch * 0.2);
    ctx.restore();
    // The Commonwealth Star under the canton, and the Southern Cross on the fly.
    ctx.fillStyle = '#f2f2ec';
    const star = (x, y, r) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    star(cw * 0.5, ch + (h - ch) * 0.45, h * 0.075);
    for (const [fx, fy, fr] of [[0.76, 0.22, 0.05], [0.70, 0.50, 0.062],
      [0.80, 0.66, 0.045], [0.88, 0.40, 0.05], [0.755, 0.40, 0.028]]) {
      star(w * fx, h * fy, h * fr);
    }
  },
  brazil(ctx, w, h) {
    ctx.fillStyle = '#009739'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fedd00';
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.12); ctx.lineTo(w * 0.88, h / 2);
    ctx.lineTo(w / 2, h * 0.88); ctx.lineTo(w * 0.12, h / 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#012169';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f4f2ec'; ctx.lineWidth = h * 0.045;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.64, h * 0.30, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  },
  egypt(ctx, w, h) {
    ctx.fillStyle = '#cf2231'; ctx.fillRect(0, 0, w, h / 3);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, h / 3, w, h / 3);
    ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
    ctx.fillStyle = '#c9a227';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.11, 0, Math.PI * 2); ctx.fill();
  },
};

PATTERNS.greece = (ctx, w, h) => {
  for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#f4f2ec' : '#0d5eaf'; ctx.fillRect(0, (h * i) / 9, w, h / 9 + 1); }
  const q = (h * 5) / 9;
  ctx.fillStyle = '#0d5eaf'; ctx.fillRect(0, 0, q, q);
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(q * 0.4, 0, q * 0.2, q); ctx.fillRect(0, q * 0.4, q, q * 0.2);
};
PATTERNS.turkey = (ctx, w, h) => {
  ctx.fillStyle = '#e30a17'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.arc(w * 0.38, h / 2, h * 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e30a17'; ctx.beginPath(); ctx.arc(w * 0.44, h / 2, h * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.arc(w * 0.58, h / 2, h * 0.08, 0, Math.PI * 2); ctx.fill();
};
PATTERNS.germany = (ctx, w, h) => {
  ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, 0, w, h / 3);
  ctx.fillStyle = '#dd0000'; ctx.fillRect(0, h / 3, w, h / 3);
  ctx.fillStyle = '#ffce00'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
};
PATTERNS.japan = (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#bc002d'; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2); ctx.fill();
};
PATTERNS.malaysia = (ctx, w, h) => {
  // Fourteen stripes, red and white, with a blue canton over the first seven
  // and the crescent and star on it in gold.
  for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 2 ? '#f4f2ec' : '#cc0001'; ctx.fillRect(0, (h * i) / 14, w, h / 14 + 1); }
  const cw = w * 0.5, ch = (h * 8) / 14;
  ctx.fillStyle = '#010066'; ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath(); ctx.arc(cw * 0.42, ch / 2, ch * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#010066';
  ctx.beginPath(); ctx.arc(cw * 0.52, ch / 2, ch * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath(); ctx.arc(cw * 0.70, ch / 2, ch * 0.13, 0, Math.PI * 2); ctx.fill();
};
PATTERNS.china = (ctx, w, h) => {
  ctx.fillStyle = '#de2910'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffde00';
  ctx.beginPath(); ctx.arc(w * 0.17, h * 0.3, h * 0.13, 0, Math.PI * 2); ctx.fill();
  for (const [fx, fy] of [[0.30, 0.15], [0.36, 0.28], [0.34, 0.46], [0.27, 0.58]]) {
    ctx.beginPath(); ctx.arc(w * fx, h * fy, h * 0.045, 0, Math.PI * 2); ctx.fill();
  }
};
PATTERNS.uae = (ctx, w, h) => {
  ctx.fillStyle = '#00732f'; ctx.fillRect(0, 0, w, h / 3);
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, h / 3, w, h / 3);
  ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, w / 4, h);
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
