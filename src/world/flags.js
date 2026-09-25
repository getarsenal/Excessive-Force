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
import { COLOSSEUM } from '../structure/landmarks/colosseum.js';
import { TOWERBRIDGE } from '../structure/landmarks/towerbridge.js';
import { FLORENCE } from '../structure/landmarks/florence.js';
import { SEGOVIA } from '../structure/landmarks/segovia.js';
import { ATOMIUM } from '../structure/landmarks/atomium.js';
import { TOKYOTOWER } from '../structure/landmarks/tokyotower.js';
import { BUDAPEST } from '../structure/landmarks/budapest.js';
import { SAGRADA } from '../structure/landmarks/sagrada.js';
import { EDINBURGH } from '../structure/landmarks/edinburgh.js';
import { NEUSCHWANSTEIN } from '../structure/landmarks/neuschwanstein.js';
import { MONTSTMICHEL } from '../structure/landmarks/montstmichel.js';
import { PENA } from '../structure/landmarks/pena.js';
import { HASSAN } from '../structure/landmarks/hassan.js';
import { KUWAIT } from '../structure/landmarks/kuwait.js';
import { KARNAK } from '../structure/landmarks/karnak.js';
import { FORBIDDEN } from '../structure/landmarks/forbidden.js';
import { GYEONGBOK } from '../structure/landmarks/gyeongbok.js';
import { WATARUN } from '../structure/landmarks/watarun.js';
import { SHWEDAGON } from '../structure/landmarks/shwedagon.js';
import { ANGKOR } from '../structure/landmarks/angkor.js';
import { BOROBUDUR } from '../structure/landmarks/borobudur.js';
import { TIKAL } from '../structure/landmarks/tikal.js';
import { TEOTIHUACAN } from '../structure/landmarks/teotihuacan.js';
import { MACHUPICCHU } from '../structure/landmarks/machupicchu.js';
import { GREATWALL } from '../structure/landmarks/greatwall.js';

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
  colosseum: [{ key: 'colosseum', ...COLOSSEUM.flag, pattern: 'italy', w: 9, h: 6, pole: 10 }],
  towerbridge: [{ key: 'towerbridge', ...TOWERBRIDGE.flag, pattern: 'union', w: 9, h: 6, pole: 10 }],
  florence: [{ key: 'florence', ...FLORENCE.flag, pattern: 'italy', w: 9, h: 6, pole: 10 }],
  segovia: [{ key: 'segovia', ...SEGOVIA.flag, pattern: 'spain', w: 9, h: 6, pole: 10 }],
  atomium: [{ key: 'atomium', ...ATOMIUM.flag, pattern: 'belgium', w: 9, h: 6, pole: 10 }],
  tokyotower: [{ key: 'tokyotower', ...TOKYOTOWER.flag, pattern: 'japan', w: 9, h: 6, pole: 10 }],
  budapest: [{ key: 'budapest', ...BUDAPEST.flag, pattern: 'hungary', w: 9, h: 6, pole: 10 }],
  sagrada: [{ key: 'sagrada', ...SAGRADA.flag, pattern: 'spain', w: 9, h: 6, pole: 10 }],
  edinburgh: [{ key: 'edinburgh', ...EDINBURGH.flag, pattern: 'saltire', w: 9, h: 6, pole: 10 }],
  neuschwanstein: [{ key: 'neuschwanstein', ...NEUSCHWANSTEIN.flag, pattern: 'germany', w: 9, h: 6, pole: 10 }],
  montstmichel: [{ key: 'montstmichel', ...MONTSTMICHEL.flag, pattern: 'tricolore', w: 9, h: 6, pole: 10 }],
  pena: [{ key: 'pena', ...PENA.flag, pattern: 'portugal', w: 9, h: 6, pole: 10 }],
  hassan: [{ key: 'hassan', ...HASSAN.flag, pattern: 'morocco', w: 9, h: 6, pole: 10 }],
  kuwait: [{ key: 'kuwait', ...KUWAIT.flag, pattern: 'kuwait', w: 9, h: 6, pole: 10 }],
  karnak: [{ key: 'karnak', ...KARNAK.flag, pattern: 'egypt', w: 9, h: 6, pole: 10 }],
  forbidden: [{ key: 'forbidden', ...FORBIDDEN.flag, pattern: 'china', w: 9, h: 6, pole: 10 }],
  gyeongbok: [{ key: 'gyeongbok', ...GYEONGBOK.flag, pattern: 'korea', w: 9, h: 6, pole: 10 }],
  watarun: [{ key: 'watarun', ...WATARUN.flag, pattern: 'thailand', w: 9, h: 6, pole: 10 }],
  shwedagon: [{ key: 'shwedagon', ...SHWEDAGON.flag, pattern: 'myanmar', w: 9, h: 6, pole: 10 }],
  angkor: [{ key: 'angkor', ...ANGKOR.flag, pattern: 'cambodia', w: 9, h: 6, pole: 10 }],
  borobudur: [{ key: 'borobudur', ...BOROBUDUR.flag, pattern: 'indonesia', w: 9, h: 6, pole: 10 }],
  tikal: [{ key: 'tikal', ...TIKAL.flag, pattern: 'guatemala', w: 9, h: 6, pole: 10 }],
  teotihuacan: [{ key: 'teotihuacan', ...TEOTIHUACAN.flag, pattern: 'mexico', w: 9, h: 6, pole: 10 }],
  machupicchu: [{ key: 'machupicchu', ...MACHUPICCHU.flag, pattern: 'peru', w: 9, h: 6, pole: 10 }],
  greatwall: [{ key: 'greatwall', ...GREATWALL.flag, pattern: 'china', w: 9, h: 6, pole: 10 }],
};

/** The cloth's pattern, drawn once into a small canvas. */
const PATTERNS = {
  spain(ctx, w, h) {
    ctx.fillStyle = '#aa151b'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f1bf00'; ctx.fillRect(0, h * 0.25, w, h * 0.5);
  },
  belgium(ctx, w, h) {
    ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, w / 3, h);
    ctx.fillStyle = '#fdda24'; ctx.fillRect(w / 3, 0, w / 3, h);
    ctx.fillStyle = '#ef3340'; ctx.fillRect((w * 2) / 3, 0, w / 3, h);
  },
  hungary(ctx, w, h) {
    ctx.fillStyle = '#ce2939'; ctx.fillRect(0, 0, w, h / 3);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, h / 3, w, h / 3);
    ctx.fillStyle = '#477050'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
  },
  portugal(ctx, w, h) {
    ctx.fillStyle = '#046a38'; ctx.fillRect(0, 0, w * 0.4, h);
    ctx.fillStyle = '#da291c'; ctx.fillRect(w * 0.4, 0, w * 0.6, h);
    ctx.fillStyle = '#ffe900'; ctx.beginPath(); ctx.arc(w * 0.4, h / 2, h * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#da291c'; ctx.beginPath(); ctx.arc(w * 0.4, h / 2, h * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(w * 0.4 - h * 0.07, h * 0.38, h * 0.14, h * 0.24);
  },
  morocco(ctx, w, h) {
    ctx.fillStyle = '#c1272d'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#006233'; ctx.lineWidth = h * 0.045; ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = w / 2 + Math.cos(a) * h * 0.3, y = h / 2 + Math.sin(a) * h * 0.3;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  },
  kuwait(ctx, w, h) {
    ctx.fillStyle = '#007a3d'; ctx.fillRect(0, 0, w, h / 3);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, h / 3, w, h / 3);
    ctx.fillStyle = '#ce1126'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
    ctx.fillStyle = '#111111'; ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w * 0.25, h / 3); ctx.lineTo(w * 0.25, (h * 2) / 3); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  },
  korea(ctx, w, h) {
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h);
    const r = h * 0.25, cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#cd2e3a'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#cd2e3a'; ctx.beginPath(); ctx.arc(cx - r / 2, cy, r / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(cx + r / 2, cy, r / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111111';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let k = 0; k < 3; k++) {
        ctx.save(); ctx.translate(cx + sx * w * 0.3, cy + sy * h * 0.3); ctx.rotate(sx * sy * Math.PI / 4 + Math.PI / 2);
        ctx.fillRect(-h * 0.16, (k - 1) * h * 0.09 - h * 0.03, h * 0.32, h * 0.06); ctx.restore();
      }
    }
  },
  thailand(ctx, w, h) {
    ctx.fillStyle = '#a51931'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f5f8'; ctx.fillRect(0, h / 6, w, (h * 4) / 6);
    ctx.fillStyle = '#2d2a4a'; ctx.fillRect(0, h / 3, w, h / 3);
  },
  myanmar(ctx, w, h) {
    ctx.fillStyle = '#fecb00'; ctx.fillRect(0, 0, w, h / 3);
    ctx.fillStyle = '#34b233'; ctx.fillRect(0, h / 3, w, h / 3);
    ctx.fillStyle = '#ea2839'; ctx.fillRect(0, (h * 2) / 3, w, h / 3);
    ctx.fillStyle = '#f4f2ec'; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? h * 0.16 : h * 0.4;
      const x = w / 2 + Math.cos(a) * rr, y = h * 0.55 + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  },
  cambodia(ctx, w, h) {
    ctx.fillStyle = '#032ea1'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e00025'; ctx.fillRect(0, h * 0.25, w, h * 0.5);
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(w * 0.36, h * 0.52, w * 0.28, h * 0.16);
    for (const [x, t] of [[0.42, 0.38], [0.5, 0.31], [0.58, 0.38]]) ctx.fillRect(w * x - w * 0.025, h * t, w * 0.05, h * 0.68 - h * t);
  },
  indonesia(ctx, w, h) {
    ctx.fillStyle = '#ce1126'; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, h / 2, w, h / 2);
  },
  guatemala(ctx, w, h) {
    ctx.fillStyle = '#4997d0'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(w / 3, 0, w / 3, h);
    ctx.fillStyle = '#6a8f3f'; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.12, 0, Math.PI * 2); ctx.fill();
  },
  peru(ctx, w, h) {
    ctx.fillStyle = '#d91023'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(w / 3, 0, w / 3, h);
  },
  saltire(ctx, w, h) {
    ctx.fillStyle = '#0065bd'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f4f2ec'; ctx.lineWidth = h * 0.18;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
  },
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
