import * as THREE from 'three';
import { HQ } from './hq.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part, loft, surface, pair, makeHercules } from './aircraft.js';
import { soldierGeometry } from './soldier.js';
import { DEFENDER_OF } from './cast.js';
import { DEFENDER_TYPES } from './defenders.js';
import { FLAG_SITES, patternTexture } from '../world/flags.js';

/**
 * The enemy's airborne.
 *
 * Somewhere about halfway down the bar the defender stops waiting for the
 * player to run out of shells and sends for help: half as many men again as
 * the garrison started with, flown in over the building and dropped on top
 * of it. They come down on the open ground round the monument, a few metres
 * to a few dozen from its walls, and dig in where they land — riflemen, gun
 * teams, a few tubes and a few long rifles, and a mortar or two that can
 * reach the battery.
 *
 * Every nation sends what it would send, or what a cartoon of it would. The
 * Russians and the Chinese come in Il-76s, four jets on a drooping wing; the
 * old Warsaw Pact and its friends in An-12s with a glazed nose and a gunner
 * in the tail; North Korea and Cuba in a swarm of An-2 biplanes; the Germans,
 * the Austrians and the Swiss in corrugated Ju 52s; Britain in Dakotas with
 * the D-Day stripes on; the European middle powers in Transalls; and the
 * Hercules for everyone who bought American. Each one carries its flag on
 * the fin and on the wings.
 *
 * The whole of it is a target. A transport crossing the map is a big slow
 * thing at two hundred metres, and the M240 teams reach up for it the way
 * the garrison reaches up for the player's: a transport shot down takes the
 * men still aboard with it, and a man under a canopy that is shot through
 * comes down a great deal faster than he meant to.
 */

/** When it comes: this far along the bar that wins the level. */
export const AIRBORNE_AT = 0.45;
/** How big it is, as a share of the garrison the level started with. */
const SHARE = 0.75;
/**
 * How many aircraft carry it. A drop is a fleet, not a flight: ten to
 * fifteen transports in a loose stream, so the guns that reach up cannot
 * put all their fire on two or three of them and have the job done. The
 * load is shared between them, never fewer than four men to an aircraft.
 */
const FLEET = { min: 10, max: 15, minLoad: 4 };

/**
 * The airframes. `cap` is men a load, `hp` what it takes to bring one down
 * (the M240 does about six a second at range), `speed` in metres a second,
 * `alt` the drop height above the ground under the building. Four M240
 * teams dug in before it comes should bring down about one aircraft in
 * three, and every man still aboard goes with it.
 */
/**
 * What small arms do to an aeroplane.
 *
 * A 7.62 round through a transport's skin makes a hole and very little else:
 * what brings one down is a hit on an engine, a fuel line or the crew, and
 * that takes time under fire, not a lot of guns at once. `armour` is the
 * share of a hit that counts, and `soak` the rate the airframe can lose it
 * at, in its own hit points a second — a battery of thirty machine guns on
 * one Il-76 brought it down in a second and a half, and every transport in
 * the drop with it, before anyone had jumped. Held to a ninth of its
 * strength a second, the most fire there is takes nine seconds: it can
 * catch a transport late in its pass, after most of its stick is out.
 */
const SMALL_ARMS = { armour: 0.35, soak: 1 / 9 };

const FRAMES = {
  il76: { name: 'IL-76 CANDID', cap: 40, hp: 230, speed: 84, alt: 190 },
  an12: { name: 'AN-12 CUB', cap: 30, hp: 190, speed: 74, alt: 175 },
  an2: { name: 'AN-2 COLT', cap: 10, hp: 45, speed: 46, alt: 120 },
  ju52: { name: 'JU 52 TANTE JU', cap: 16, hp: 110, speed: 58, alt: 140 },
  dc3: { name: 'C-47 DAKOTA', cap: 24, hp: 115, speed: 62, alt: 150 },
  transall: { name: 'C-160 TRANSALL', cap: 32, hp: 180, speed: 76, alt: 170 },
  c130: { name: 'C-130 HERCULES', cap: 36, hp: 190, speed: 78, alt: 170 },
};

/**
 * Who flies what, painted how. `body` is the airframe, `chute` the canopies.
 * Anybody not listed gets a Transall in NATO grey.
 */
const NATION = {
  ru: { frame: 'il76', body: 0x5f6e78, chute: 0xe4e1d4 },
  cn: { frame: 'il76', body: 0x7c8789, chute: 0x7d8758 },
  in: { frame: 'il76', body: 0x6f7b6c },
  ir: { frame: 'il76', body: 0xb59c6c, chute: 0xc8b48c },
  iq: { frame: 'il76', body: 0xa38c63, chute: 0xc8b48c },
  kz: { frame: 'an12', body: 0x6c7563 }, uz: { frame: 'an12', body: 0x6c7563 },
  az: { frame: 'an12', body: 0x6c7563 }, vn: { frame: 'an12', body: 0x5d6b4e },
  eg: { frame: 'an12', body: 0xb09a72, chute: 0xc8b48c }, hu: { frame: 'an12', body: 0x6a7266 },
  mm: { frame: 'an12', body: 0x5d6b4e },
  kp: { frame: 'an2', body: 0x3f5236, chute: 0x7b8a56 }, cu: { frame: 'an2', body: 0x5f6a4a },
  pl: { frame: 'an2', body: 0x55613f }, rs: { frame: 'an2', body: 0x5a6544 },
  kh: { frame: 'an2', body: 0x5d6b4e }, np: { frame: 'an2', body: 0x6f7764 },
  de: { frame: 'ju52', body: 0x3d4835 }, at: { frame: 'ju52', body: 0x6b6e66 },
  ch: { frame: 'ju52', body: 0xa9aba6, chute: 0xc8352a },
  uk: { frame: 'dc3', body: 0x4e5034, stripes: true },
  mx: { frame: 'dc3', body: 0x5a5c44 }, gt: { frame: 'dc3', body: 0x5a5c44 },
  co: { frame: 'dc3', body: 0x5a5c44 }, pe: { frame: 'dc3', body: 0x5a5c44 },
  ar: { frame: 'dc3', body: 0x8d9093 }, br: { frame: 'dc3', body: 0x5a5c44 },
  gr: { frame: 'dc3', body: 0x8a8f93 }, dk: { frame: 'dc3', body: 0x7e8488 },
  no: { frame: 'dc3', body: 0x5c6150 }, se: { frame: 'dc3', body: 0x4b5a46 },
  fi: { frame: 'dc3', body: 0x5c6150 }, is: { frame: 'dc3', body: 0xb7bbbd },
  ma: { frame: 'dc3', body: 0xa08c66, chute: 0xc8b48c }, ci: { frame: 'dc3', body: 0x6a6c4c },
  lb: { frame: 'dc3', body: 0x8a8f93 },
  fr: { frame: 'transall', body: 0x6e7268 }, be: { frame: 'transall', body: 0x6e7268 },
  it: { frame: 'transall', body: 0x6e7268 }, es: { frame: 'transall', body: 0x6e7268 },
  pt: { frame: 'transall', body: 0x6e7268 }, tr: { frame: 'transall', body: 0x6e7268 },
  jp: { frame: 'transall', body: 0x7d8488 }, cz: { frame: 'transall', body: 0x5f6a55 },
  ro: { frame: 'transall', body: 0x6e7268 }, lt: { frame: 'transall', body: 0x6e7268 },
  id: { frame: 'transall', body: 0x6e7268 },
  au: { frame: 'c130', body: 0x6d7378 }, nz: { frame: 'c130', body: 0x6d7378 },
  ca: { frame: 'c130', body: 0x6d7378 }, sa: { frame: 'c130', body: 0xb79f72, chute: 0xc8b48c },
  ae: { frame: 'c130', body: 0xb79f72, chute: 0xc8b48c }, kw: { frame: 'c130', body: 0xb79f72, chute: 0xc8b48c },
  my: { frame: 'c130', body: 0x6d7378 }, kr: { frame: 'c130', body: 0x5f6a55 },
  tw: { frame: 'c130', body: 0x6d7378 }, pk: { frame: 'c130', body: 0x5f6a55 },
  th: { frame: 'c130', body: 0x6d7378 }, lk: { frame: 'c130', body: 0x5f6a55 },
};
const DEFAULT_NATION = { frame: 'transall', body: 0x6e7268 };
const DEFAULT_CHUTE = 0x737a55;

/** What jumps, out of every hundred. */
const MIX = [['rifleman', 58], ['mg', 16], ['at', 10], ['sniper', 8], ['mortar', 8]];

/** How the men come down. */
const JUMP = { freeFall: 0.9, open: 0.7, rate: 9.5, maxUnder: 17, steer: 16, stick: 0.2 };

const pickType = (r, mix = MIX) => {
  let acc = 0;
  for (const [t, w] of mix) { acc += w / 100; if (r < acc) return t; }
  return 'rifleman';
};

/**
 * The counter-attack: the second wave, at three quarters.
 *
 * The first airborne is help; this is the brigade. Twice the men the
 * garrison started with, heavy on the tubes, and only half of them on the
 * building: the rest come down in squads all over the map, wherever there is
 * open ground, the nearer ones within mortar reach of the battery. Each squad
 * has its own tubes and every other one an observer to walk the bombs onto
 * the guns. Three S-300 launchers come down with it on heavy-drop pallets and
 * own the sky again for three and a half minutes after they land. It is
 * warned of — signals intercept it at two thirds — and a player who has dug
 * nothing in and spread nothing out by then is going to have a bad minute.
 */
export const ASSAULT = {
  kind: 'assault',
  warnAt: 0.66,
  at: 0.75,
  share: 2.0,
  pool: 'wave',
  spread: 0.55,
  sams: 3,
  // Round the building: the same men as before, with more tubes.
  mix: [['rifleman', 52], ['mg', 18], ['at', 12], ['sniper', 8], ['mortar', 10]],
  // In the squads across the map, after each squad's own tube or two and its
  // spotter: the men to guard them.
  squad: [['rifleman', 48], ['mg', 26], ['at', 18], ['sniper', 6], ['mortar', 2]],
  fleet: { min: 14, max: 22, minLoad: 4 },
};

// ──────────────────────────────────────────────────────────── airframes ──

function mats(body) {
  return {
    body: new THREE.MeshStandardMaterial({ color: body, roughness: 0.72, metalness: 0.22 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.18, metalness: 0.8 }),
  };
}

/** A propeller, named so the flight spins it about its own Z. */
function prop(m, r, blades) {
  const p = new THREE.Group();
  p.add(part(new THREE.ConeGeometry(r * 0.16, r * 0.34, 10).rotateX(Math.PI / 2), m.dark, 0, 0, r * 0.12));
  for (let k = 0; k < blades; k++) {
    const holder = new THREE.Group();
    holder.add(part(new THREE.BoxGeometry(r * 0.13, r, 0.05), m.black, 0, r * 0.5, 0));
    holder.rotation.z = (k / blades) * Math.PI * 2;
    p.add(holder);
  }
  p.add(part(new THREE.CylinderGeometry(r, r, 0.04, 20).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.26, depthWrite: false }), 0, 0, 0));
  p.name = 'prop';
  return p;
}

/** The flag painted on both faces of a fin, and on top of each wing. */
function markings(g, tex, fin, wing) {
  const flag = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2 });
  if (fin) {
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(fin.w, fin.h), flag);
      f.position.set(s * fin.t, fin.y, fin.z);
      f.rotation.y = s * Math.PI / 2;
      g.add(f);
    }
  }
  if (wing) {
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(wing.w, wing.h), flag);
      f.position.set(s * wing.x, wing.y, wing.z);
      f.rotation.x = -Math.PI / 2;
      f.rotation.z = Math.PI / 2;
      g.add(f);
    }
  }
}

/** A tall fin, as the other airframes build it: a surface stood on edge. */
function fin(g, mat, o) {
  const m = new THREE.Mesh(surface({ span: o.h, root: o.root, tip: o.tip, sweep: o.sweep, thick: o.thick }), mat);
  m.position.set(0, o.y, o.z);
  m.rotation.z = Math.PI / 2;
  m.castShadow = true;
  g.add(m);
}

/**
 * A high-wing military transport, scaled off the Hercules' own body: the
 * Il-76, the An-12 and the Transall are all the same idea at different sizes,
 * and what tells them apart is the engines, the nose and the tail.
 */
function makeTransport(o, m, tex) {
  const g = new THREE.Group();
  const L = o.len / 29.8, W = o.wid / 4.3;
  g.add(part(loft([
    { z: 14.9 * L, w: 0.12, h: 0.12, y: 0.15 * W, n: 2.0 },
    { z: 13.7 * L, w: 2.3 * W, h: 2.3 * W, y: 0.15 * W, n: 2.2 },
    { z: 12.0 * L, w: 3.7 * W, h: 3.8 * W, y: 0.02 * W, n: 2.6 },
    { z: 9.8 * L, w: 4.3 * W, h: 4.4 * W, n: 3.0 },
    { z: -4.5 * L, w: 4.3 * W, h: 4.4 * W, n: 3.2 },
    { z: -7.5 * L, w: 4.0 * W, h: 3.6 * W, y: 0.55 * W, n: 3.0 },
    { z: -10.5 * L, w: 3.1 * W, h: 2.4 * W, y: 1.45 * W, n: 2.7 },
    { z: -13.2 * L, w: 1.8 * W, h: 1.3 * W, y: 2.25 * W, n: 2.3 },
    { z: -14.9 * L, w: 0.5 * W, h: 0.4 * W, y: 2.6 * W, n: 2.0 },
  ], 14), m.body, 0, 0, 0));
  // The flight deck, and the navigator's glasshouse under it.
  g.add(part(new THREE.BoxGeometry(3.3 * W, 0.7 * W, 1.6), m.glass, 0, 1.25 * W, 11.9 * L));
  if (o.glazedNose) {
    g.add(part(new THREE.SphereGeometry(1.15 * W, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.5),
      m.glass, 0, -0.55 * W, 13.4 * L));
  }
  // The tail gunner: a glazed box under the fin with two barrels out of it.
  if (o.tailTurret) {
    g.add(part(new THREE.BoxGeometry(1.1, 1.0, 1.4), m.glass, 0, 2.2 * W, -15.4 * L));
    for (const s of [-0.18, 0.18]) {
      g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5).rotateX(Math.PI / 2), m.dark, s, 2.1 * W, -16.6 * L));
    }
  }
  // Gear sponsons down the belly.
  for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(1.1 * W, 1.3 * W, 6.8 * L), m.body, s * 2.55 * W, -1.55 * W, 1.0 * L));

  // The wing, high on the tube: straight on a turboprop, swept and drooping
  // on the Ilyushin, which sits on the ground looking sorry for itself.
  const half = o.span / 2 - o.wid * 0.45;
  const wing = surface({ span: half, root: o.chord, tip: o.chord * 0.45, sweep: o.sweep, thick: o.chord * 0.15,
    dihedral: o.droop ? -0.06 : 0.03 });
  const wy = 1.95 * W, wz = 3.1 * L + o.chord * 0.3;
  pair(g, wing, m.body, o.wid * 0.45, wy, wz);
  g.add(part(new THREE.BoxGeometry(o.wid * 1.05, 0.75 * W, o.chord), m.body, 0, wy, wz - o.chord * 0.5));

  for (const x of o.engines) {
    const ax = Math.abs(x);
    const back = o.sweep * (ax - o.wid * 0.45) / half;
    const drop = Math.sin(o.droop ? -0.06 : 0.03) * (ax - o.wid * 0.45);
    if (o.jets) {
      // A podded turbofan slung forward of the wing on a pylon.
      const z0 = wz - back + 1.8;
      g.add(part(loft([
        { z: 3.2, w: 1.7, h: 1.7, n: 2.0 },
        { z: 2.4, w: 1.95, h: 1.95, n: 2.0 },
        { z: -1.6, w: 1.7, h: 1.7, n: 2.0 },
        { z: -2.6, w: 1.0, h: 1.0, n: 2.0 },
      ], 12), m.body, x, wy + drop - 1.5, z0));
      g.add(part(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 12).rotateX(Math.PI / 2), m.black, x, wy + drop - 1.5, z0 + 3.22));
      g.add(part(new THREE.BoxGeometry(0.3, 1.2, 3.4), m.body, x, wy + drop - 0.7, z0 - 0.6));
    } else {
      const z0 = wz - back;
      g.add(part(loft([
        { z: 3.6, w: 1.0, h: 1.0, n: 2.2 },
        { z: 2.6, w: 1.45, h: 1.55, y: -0.05, n: 2.6 },
        { z: -1.2, w: 1.45, h: 1.55, y: -0.05, n: 2.8 },
        { z: -3.6, w: 0.9, h: 1.2, y: 0.05, n: 2.6 },
      ], 10), m.body, x, wy + drop - 0.6, z0));
      const p = prop(m, o.prop, 4);
      p.position.set(x, wy + drop - 0.6, z0 + 3.8);
      g.add(p);
    }
  }

  // The tail. A T-tail puts the tailplane on top of the fin.
  const fz = -9.9 * L, fy = 2.5 * W;
  fin(g, m.body, { h: o.finH, root: o.chord * 1.3, tip: o.chord * 0.7, sweep: o.chord * 0.75, thick: 0.5, y: fy, z: fz });
  const tail = surface({ span: o.span * 0.2, root: o.chord * 0.75, tip: o.chord * 0.4, sweep: o.chord * 0.4, thick: 0.4 });
  if (o.tTail) pair(g, tail, m.body, 0.3, fy + o.finH - 0.2, fz - o.chord * 0.75 - 0.3);
  else pair(g, tail, m.body, 0.5, fy + 0.2, fz - o.chord * 0.9);
  markings(g, tex,
    { w: o.chord * 0.75, h: o.finH * 0.3, t: 0.3, y: fy + o.finH * 0.5, z: fz - o.chord * 0.75 },
    { w: o.chord * 0.55, h: o.chord * 0.8, x: half * 0.75 + o.wid * 0.45, y: wy + 0.42, z: wz - o.chord * 0.55 });
  return g;
}

/** Antonov An-2: a single radial, two wings, and a hundred and twenty knots downhill. */
function makeAn2(m, tex) {
  const g = new THREE.Group();
  g.add(part(loft([
    { z: 5.6, w: 1.45, h: 1.45, n: 2.0 },
    { z: 4.4, w: 1.6, h: 1.8, y: 0.1, n: 2.6 },
    { z: 2.5, w: 1.75, h: 2.25, y: 0.2, n: 3.0 },
    { z: -1.5, w: 1.6, h: 2.0, y: 0.25, n: 3.0 },
    { z: -5.6, w: 0.45, h: 0.7, y: 0.65, n: 2.4 },
  ], 12), m.body, 0, 0, 0));
  g.add(part(new THREE.CylinderGeometry(0.8, 0.78, 1.1, 14).rotateX(Math.PI / 2), m.dark, 0, 0, 5.9));
  g.add(part(new THREE.BoxGeometry(1.3, 0.55, 0.9), m.glass, 0, 1.15, 3.6));
  const p = prop(m, 1.8, 4);
  p.position.set(0, 0, 6.55);
  g.add(p);
  const upper = surface({ span: 8.6, root: 2.45, tip: 2.45, sweep: 0, thick: 0.26 });
  const lower = surface({ span: 6.3, root: 2.0, tip: 2.0, sweep: 0, thick: 0.22 });
  pair(g, upper, m.body, 0.4, 1.6, 3.5);
  g.add(part(new THREE.BoxGeometry(0.9, 0.26, 2.45), m.body, 0, 1.6, 2.28));
  pair(g, lower, m.body, 0.8, -0.85, 3.2);
  // The struts between the wings, and the bracing wires that read as a cross.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.14, 2.45, 0.3), m.dark, s * 5.6, 0.38, 2.3));
    g.add(part(new THREE.BoxGeometry(0.06, 3.3, 0.06), m.dark, s * 5.0, 0.38, 2.3, 0, 0, s * 0.62));
    // The gear, down and fixed.
    g.add(part(new THREE.BoxGeometry(0.16, 1.4, 0.2), m.dark, s * 1.4, -1.5, 3.0, 0, 0, s * 0.3));
    g.add(part(new THREE.CylinderGeometry(0.45, 0.45, 0.28, 12).rotateZ(Math.PI / 2), m.black, s * 1.6, -2.2, 3.0));
  }
  fin(g, m.body, { h: 2.6, root: 2.2, tip: 1.2, sweep: 1.0, thick: 0.18, y: 0.7, z: -3.6 });
  pair(g, surface({ span: 3.6, root: 1.7, tip: 1.2, sweep: 0.3, thick: 0.16 }), m.body, 0.2, 0.7, -4.1);
  markings(g, tex, { w: 1.4, h: 0.9, t: 0.12, y: 2.0, z: -4.5 }, { w: 1.6, h: 2.1, x: 6.6, y: 1.76, z: 2.3 });
  return g;
}

/**
 * Junkers Ju 52: three engines, a fixed undercarriage in spats, and a skin
 * of corrugated metal that is the whole of its character.
 */
function makeJu52(m, tex) {
  const g = new THREE.Group();
  g.add(part(loft([
    { z: 8.6, w: 1.5, h: 1.5, n: 2.0 },
    { z: 7.0, w: 2.0, h: 2.3, y: 0.1, n: 3.2 },
    { z: 3.0, w: 2.2, h: 2.7, y: 0.2, n: 4.0 },
    { z: -3.0, w: 2.0, h: 2.4, y: 0.3, n: 4.0 },
    { z: -9.3, w: 0.4, h: 0.6, y: 0.9, n: 2.6 },
  ], 14), m.body, 0, 0, 0));
  // The corrugations: ridges down both sides of the body.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      g.add(part(new THREE.BoxGeometry(0.06, 0.06, 10.5), m.body, s * 1.12, -0.7 + k * 0.42, 0.6));
    }
  }
  g.add(part(new THREE.BoxGeometry(1.7, 0.5, 1.2), m.glass, 0, 1.2, 6.2));
  const engines = [[0, 0.1, 9.0], [-4.7, -0.55, 4.2], [4.7, -0.55, 4.2]];
  for (const [x, y, z] of engines) {
    g.add(part(new THREE.CylinderGeometry(0.72, 0.62, 1.4, 12).rotateX(Math.PI / 2), m.dark, x, y, z));
    if (x) g.add(part(new THREE.BoxGeometry(0.9, 0.8, 2.6), m.body, x, y, z - 1.8));
    const p = prop(m, 1.65, 3);
    p.position.set(x, y, z + 0.8);
    g.add(p);
  }
  const wing = surface({ span: 13.4, root: 4.8, tip: 2.0, sweep: 1.6, thick: 0.7, dihedral: 0.05 });
  pair(g, wing, m.body, 1.0, -1.0, 4.8);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      g.add(part(new THREE.BoxGeometry(5.0, 0.05, 0.05), m.body, s * (4 + 2.5), -0.62, 4.0 - k * 0.8));
    }
    // The spat over each main wheel.
    g.add(part(new THREE.BoxGeometry(0.22, 1.6, 0.3), m.dark, s * 2.6, -1.9, 3.4, 0, 0, s * 0.2));
    g.add(part(loft([
      { z: 0.8, w: 0.1, h: 0.1, n: 2 }, { z: 0.3, w: 0.55, h: 1.1, n: 2.2 },
      { z: -0.6, w: 0.5, h: 0.9, n: 2.2 }, { z: -1.0, w: 0.1, h: 0.2, n: 2 },
    ], 8), m.body, s * 2.9, -2.65, 3.4));
  }
  fin(g, m.body, { h: 3.4, root: 3.4, tip: 1.6, sweep: 1.6, thick: 0.3, y: 1.0, z: -5.9 });
  pair(g, surface({ span: 4.6, root: 2.6, tip: 1.5, sweep: 0.6, thick: 0.24 }), m.body, 0.3, 1.0, -6.6);
  markings(g, tex, { w: 2.0, h: 1.3, t: 0.2, y: 2.8, z: -7.5 }, { w: 2.0, h: 2.8, x: 10, y: -0.25, z: 3.6 });
  return g;
}

/**
 * Douglas C-47: the Dakota. Round body, two radials, the tail on the ground
 * — and for the British, the black and white bands painted on in a night
 * so the Navy would not shoot at it.
 */
function makeDakota(m, tex, stripes) {
  const g = new THREE.Group();
  g.add(part(loft([
    { z: 9.6, w: 0.3, h: 0.3, y: 0.1, n: 2.0 },
    { z: 8.6, w: 1.9, h: 1.9, y: 0.1, n: 2.0 },
    { z: 6.5, w: 2.4, h: 2.55, y: 0.05, n: 2.2 },
    { z: 0.0, w: 2.45, h: 2.6, n: 2.3 },
    { z: -5.0, w: 1.8, h: 2.0, y: 0.25, n: 2.2 },
    { z: -9.8, w: 0.35, h: 0.5, y: 0.8, n: 2.0 },
  ], 14), m.body, 0, 0, 0));
  g.add(part(new THREE.BoxGeometry(1.8, 0.5, 1.0), m.glass, 0, 0.9, 8.1));
  for (const s of [-1, 1]) {
    const x = s * 2.9;
    g.add(part(new THREE.CylinderGeometry(0.78, 0.7, 1.5, 14).rotateX(Math.PI / 2), m.dark, x, -0.45, 5.4));
    g.add(part(loft([
      { z: 0.6, w: 1.4, h: 1.4, n: 2.2 }, { z: -2.6, w: 1.0, h: 1.0, n: 2.4 },
    ], 10), m.body, x, -0.45, 4.6));
    const p = prop(m, 1.75, 3);
    p.position.set(x, -0.45, 6.25);
    g.add(p);
  }
  const wing = surface({ span: 13.3, root: 4.4, tip: 1.6, sweep: 2.4, thick: 0.6, dihedral: 0.09 });
  pair(g, wing, m.body, 1.1, -0.85, 5.0);
  g.add(part(new THREE.BoxGeometry(2.3, 0.6, 4.4), m.body, 0, -0.85, 2.8));
  g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10).rotateZ(Math.PI / 2), m.black, 0, -1.1, -8.4));
  fin(g, m.body, { h: 3.7, root: 3.8, tip: 1.3, sweep: 2.4, thick: 0.28, y: 0.9, z: -6.4 });
  pair(g, surface({ span: 4.8, root: 2.6, tip: 1.2, sweep: 0.9, thick: 0.24 }), m.body, 0.3, 0.55, -7.1);
  if (stripes) {
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.85 });
    const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
    for (let k = 0; k < 5; k++) {
      const mat = k % 2 ? black : white;
      // Round the rear fuselage, ahead of the tail.
      const z = -2.4 - k * 0.42;
      const r = 1.08 - k * 0.04;
      g.add(part(new THREE.CylinderGeometry(r, r, 0.42, 16, 1, true).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: mat.color, roughness: 0.85, side: THREE.DoubleSide }), 0, 0.1 + k * 0.03, z));
      // And chordwise across both wings, outboard of the engines.
      for (const s of [-1, 1]) {
        g.add(part(new THREE.BoxGeometry(0.46, 0.66, 3.6 - k * 0.12), mat, s * (5.4 + k * 0.46), -0.85 + Math.sin(0.09) * (4.3 + k * 0.46), 3.25 - k * 0.15));
      }
    }
  }
  markings(g, tex, { w: 1.8, h: 1.2, t: 0.18, y: 2.8, z: -8.0 }, { w: 1.7, h: 2.4, x: 10.5, y: 0.25, z: 2.4 });
  return g;
}

/** The Hercules the player flies, in the enemy's paint. */
function makeEnemyHercules(m, tex) {
  const g = makeHercules();
  const grey = new THREE.Color(0x6d7378);
  g.traverse((o) => {
    if (o.isMesh && o.material?.color && o.material.color.equals(grey)) o.material = m.body;
  });
  markings(g, tex, { w: 3.4, h: 2.0, t: 0.3, y: 6.4, z: -13.6 }, { w: 2.4, h: 3.4, x: 16.0, y: 2.55, z: 2.0 });
  return g;
}

const TRANSPORTS = {
  il76: { len: 46.6, wid: 4.9, span: 50.5, chord: 7.2, sweep: 7.0, droop: true, jets: true, tTail: true,
    glazedNose: true, tailTurret: true, finH: 7.8, engines: [-14.0, -8.0, 8.0, 14.0] },
  an12: { len: 33.1, wid: 4.1, span: 38.0, chord: 4.8, sweep: 1.2, glazedNose: true, tailTurret: true,
    finH: 6.6, prop: 2.25, engines: [-10.4, -5.0, 5.0, 10.4] },
  transall: { len: 32.4, wid: 4.0, span: 40.0, chord: 4.6, sweep: 0.8, finH: 7.6, prop: 2.75, engines: [-6.4, 6.4] },
};

/** Build the airframe a nation sends. Nose along +Z, as every airframe here. */
export function makeEnemyTransport(code, pattern) {
  const nat = NATION[code] || DEFAULT_NATION;
  const m = mats(nat.body);
  const tex = patternTexture(pattern || 'tricolore', 3, 2);
  let g;
  if (nat.frame === 'an2') g = makeAn2(m, tex);
  else if (nat.frame === 'ju52') g = makeJu52(m, tex);
  else if (nat.frame === 'dc3') g = makeDakota(m, tex, nat.stripes);
  else if (nat.frame === 'c130') g = makeEnemyHercules(m, tex);
  else g = makeTransport(TRANSPORTS[nat.frame], m, tex);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return g;
}

// ───────────────────────────────────────────────────────────── canopies ──

/** One canopy and its rigging, from the man's feet: the instanced chute. */
function canopyGeometry() {
  const R = 3.5, Y = 6.6;
  const parts = [];
  const dome = new THREE.SphereGeometry(R, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  dome.scale(1, 0.58, 1);
  dome.translate(0, Y, 0);
  parts.push([dome, 1]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * R * 0.97, Y, Math.sin(a) * R * 0.97);
    const bot = new THREE.Vector3(Math.cos(a) * 0.22, 1.85, Math.sin(a) * 0.22);
    const d = new THREE.Vector3().subVectors(top, bot);
    const c = new THREE.CylinderGeometry(0.02, 0.02, d.length(), 3);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    c.translate((top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2);
    parts.push([c, 0.55]);
  }
  const geos = parts.map(([g, k]) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.computeVertexNormals();
    const col = new Float32Array(n.attributes.position.count * 3).fill(k);
    n.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  return BufferGeometryUtils.mergeGeometries(geos, false);
}

// ────────────────────────────────────────────────────────────── the drop ──

/**
 * The town's buildings as rotated rectangles: which are near a point, whether
 * a point is inside one, and how many of the four sides of it are walled
 * within eighteen metres. For where a squad may land, and where it goes when
 * it has to come out.
 */
function cityGeom(plots) {
  const nearPlots = (x, z, r) => plots.filter((q) => Math.abs(q.x - x) < r + (q.w + q.d) / 2
    && Math.abs(q.z - z) < r + (q.w + q.d) / 2);
  const inside = (x, z, q, m) => {
    const c = Math.cos(q.yaw || 0), sn = Math.sin(q.yaw || 0);
    const dx = x - q.x, dz = z - q.z;
    return Math.abs(dx * c - dz * sn) < q.w / 2 + m && Math.abs(dx * sn + dz * c) < q.d / 2 + m;
  };
  const walledSides = (x, z, P) => {
    let n = 0;
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let r = 3; r <= 18; r += 2.5) {
        if (P.some((q) => inside(x + ux * r, z + uz * r, q, 0.4))) { n++; break; }
      }
    }
    return n;
  };
  return { nearPlots, inside, walledSides };
}


/** Money for an enemy transport shot down, on top of the men aboard. */
export const TRANSPORT_BOUNTY = 2500;
export class EnemyAirborne {
  /** @param {import('./battle.js').Battle} battle */
  constructor(battle, o = {}) {
    this.cfg = { kind: 'airborne', at: AIRBORNE_AT, warnAt: null, share: SHARE, pool: 'air',
      spread: 0, sams: 0, mix: MIX, squad: MIX, fleet: FLEET, ...o };
    this.warned = false;
    this.battle = battle;
    this.scene = battle.scene;
    this.terrain = battle.terrain;
    const level = battle.level;
    this.code = level ? DEFENDER_OF[level.id] : null;
    // The tutorial is a range, not a war, and has no general to send for help.
    this.enabled = !!(level && level.id !== 'tutorial' && !level.sandbox && battle.garrison);
    // Whether the bar sets it off by itself. The harness turns this off and
    // calls `launch` when a test wants it.
    this.auto = true;
    this.state = 'waiting';     // → 'inbound' → 'done'
    this.planes = [];
    this.men = [];
    this.cargo = [];
    this.landed = 0;
    this.lost = 0;
    this.total = 0;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  get nation() { return NATION[this.code] || DEFAULT_NATION; }
  get frame() { return FRAMES[this.nation.frame]; }

  update(dt) {
    if (!this.enabled) return;
    if (this.walkers) this._walk(dt);
    const b = this.battle;
    if (this.state === 'waiting') {
      if (!this.auto || b.state !== 'playing') return;
      if (this.cfg.warnAt != null && !this.warned && b.objectiveProgress >= this.cfg.warnAt) {
        this.warned = true;
        b.onEvent(`${this.cfg.kind}warn`, { at: this.cfg.at, nation: this.code });
      }
      // Not when the shot that crossed the line also won the level: a drop
      // sent for in the frame the building fell held the win for a wave
      // nobody had been warned of.
      const won = b.objectiveProgress >= (b.constructor.WIN_AT ?? 0.9)
        || (b.objectives?.length && b.objectives.every((o) => b.objectiveDone(o)));
      if (b.objectiveProgress >= this.cfg.at && !won) this.launch();
      return;
    }
    if (this.state !== 'inbound') return;
    this._fly(dt);
    this._fall(dt);
    this._fallCargo(dt);
    this._publish();
    this._draw();
    if (!this.planes.length && !this.men.length && !this.cargo.length) this._finish();
  }

  /**
   * Send them. Returns what was sent, or null if there was nobody to send
   * or nowhere to put them.
   */
  launch() {
    if (this.state !== 'waiting' || !this.enabled) return null;
    const b = this.battle, g = b.garrison;
    this.state = 'done';
    const C = this.cfg;
    const base = g.defenders.filter((d) => d.pool === 'base' || d.pool === 'works' || !d.pool).length;
    const room = (g.pools[C.pool] || 0) - (g.used[C.pool] || 0);
    // With its command post gone the enemy cannot coordinate a full drop:
    // what is sent for afterwards comes a third short (see hq.js).
    const cut = b.hq && !b.hq.alive ? HQ.dropShare : 1;
    const want = Math.min(room, Math.round(base * C.share * cut));
    if (want < 1) return null;
    const near = Math.round(want * (1 - C.spread));
    const slots = this._slots(near);
    if (C.spread > 0) slots.push(...this._mapSlots(want - slots.length, slots));
    // Heavy drop: what comes down on pallets rather than under a man.
    if (C.sams && this.battle.samSites) {
      for (const p of this.battle.samSites(C.sams)) {
        slots.push({ pos: new THREE.Vector3(p.x, p.y, p.z), facing: p.yaw, type: 'sam', site: p });
      }
    }
    if (!slots.length) return null;
    this.state = 'inbound';
    this.total = slots.length;
    const F = this.frame;

    // The run crosses the player's view rather than coming at it, so the
    // whole formation is broadside on, and on whichever of the two
    // crossings has less in the way.
    const c = new THREE.Vector3();
    for (const s of slots) c.add(s.pos);
    c.multiplyScalar(1 / slots.length);
    const cam = b.camera.position;
    let fx = c.x - cam.x, fz = c.z - cam.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const groundY = this.terrain.heightAt(c.x, c.z);
    let best = null;
    for (const ang of [0, Math.PI, 0.5, Math.PI + 0.5, -0.5, Math.PI - 0.5]) {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      // The camera's right, turned.
      const rx = -fz, rz = fx;
      const dx = rx * ca - rz * sa, dz = rx * sa + rz * ca;
      const ceil = b.ceilingAlong(c.x - dx * 1400, c.z - dz * 1400, c.x + dx * 1400, c.z + dz * 1400);
      if (!best || ceil < best.ceil - 20) best = { dx, dz, ceil };
    }
    const dir = new THREE.Vector3(best.dx, 0, best.dz);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const alt = Math.max(groundY + F.alt, best.ceil + 60);

    // Into aircraft by where they are going across the run, so each load is
    // the men for one strip of the ground.
    const FL = C.fleet;
    const nPlanes = Math.max(1, Math.min(FL.max, Math.floor(slots.length / FL.minLoad),
      Math.max(FL.min, Math.ceil(slots.length / F.cap))));
    for (const s of slots) {
      s.across = (s.pos.x - c.x) * side.x + (s.pos.z - c.z) * side.z;
      s.along = (s.pos.x - c.x) * dir.x + (s.pos.z - c.z) * dir.z;
    }
    slots.sort((a, s2) => a.across - s2.across);
    const pattern = (FLAG_SITES[b.level.id] && FLAG_SITES[b.level.id][0]?.pattern) || null;
    const per = Math.ceil(slots.length / nPlanes);
    const runIn = Math.max(900, F.speed * 13);
    for (let i = 0; i < nPlanes; i++) {
      const load = slots.slice(i * per, (i + 1) * per);
      if (!load.length) continue;
      load.sort((a, s2) => a.along - s2.along);
      const lat = load.reduce((a, s) => a + s.across, 0) / load.length;
      const model = makeEnemyTransport(this.code, pattern);
      // A loose vic: the middle aircraft leads and the others hang back.
      // Fifteen of them in one vic is a line a kilometre deep; past the
      // first few the spacing closes up, so the stream is over the drop
      // zone inside half a minute.
      const back = Math.abs(i - (nPlanes - 1) / 2);
      const behind = runIn + F.speed * (Math.min(back, 3) * 1.4 + Math.max(0, back - 3) * 0.7);
      const start = c.clone().addScaledVector(dir, -behind).addScaledVector(side, lat);
      // Three heights, so wingtips in neighbouring strips never meet.
      start.y = alt + (i % 3) * 20;
      model.position.copy(start);
      model.rotation.y = Math.atan2(dir.x, dir.z);
      this.scene.add(model);
      const p = {
        model, dir, side, lat, along: -behind, speed: F.speed, hp: F.hp, alive: true, down: false,
        armour: SMALL_ARMS.armour, soakRate: F.hp * SMALL_ARMS.soak, soak: F.hp * SMALL_ARMS.soak,
        load, next: 0, nextAt: 0, t: 0, roar: 0, bank: 0,
        pos: model.position,
        hit: (dmg) => this._hitPlane(p, dmg),
      };
      this.planes.push(p);
    }
    this.center = c;
    this.groundY = groundY;
    this.alt = alt;
    this._ensureMeshes();
    const eta = runIn / F.speed;
    const sams = slots.filter((x) => x.type === 'sam').length;
    this.total -= sams;
    b.onEvent(C.kind, {
      name: F.name, frame: this.nation.frame, planes: this.planes.length, men: this.total,
      eta, nation: this.code, point: c, sams, squads: this.squads || 0,
    });
    return { planes: this.planes.length, men: this.total, eta };
  }

  /**
   * Where they can come down: open ground round the monument, nearest first.
   * Not in the water, not on a building or in the town, not on a slope a man
   * could not stand on, not on top of the battery, and not on another man.
   */
  _slots(n) {
    const b = this.battle, t = this.terrain, g = b.garrison;
    const f = b.primary.footprint;
    if (!f) return [];
    const span = t.span * 0.95;
    const taken = [];
    const near = (x, z, r) => {
      const r2 = r * r;
      for (const q of taken) if ((q.x - x) ** 2 + (q.z - z) ** 2 < r2) return true;
      return false;
    };
    const ground = g.defenders.filter((d) => d.alive && d.emplaced);
    const plots = b.cityPlots || [];
    const geom = cityGeom(plots);
    const units = b.units.filter((u) => u.alive);
    const ok = (x, z) => {
      if (Math.abs(x) > span || Math.abs(z) > span) return false;
      if (t.isWater(x, z)) return false;
      const h = t.heightAt(x, z);
      const slope = Math.max(Math.abs(t.heightAt(x + 1.5, z) - h), Math.abs(t.heightAt(x, z + 1.5) - h)) / 1.5;
      if (slope > 0.45) return false;
      const p = this._v.set(x, h + 1, z);
      for (const s of b.structures) {
        const sf = s.footprint;
        if (!sf) continue;
        if (x > sf.x0 - 3 && x < sf.x1 + 3 && z > sf.z0 - 3 && z < sf.z1 + 3) {
          if (s.open && !b._nearStones(s, p, 3)) continue;
          return false;
        }
      }
      // Turned with the building: an axis-aligned test let a man land inside
      // a block set at forty-five degrees.
      for (const q of geom.nearPlots(x, z, 2)) {
        if (geom.inside(x, z, q, 1.5)) return false;
      }
      for (const u of units) if ((u.pos.x - x) ** 2 + (u.pos.z - z) ** 2 < 144) return false;
      for (const d of ground) if ((d.pos.x - x) ** 2 + (d.pos.z - z) ** 2 < 4) return false;
      return true;
    };
    // Where the battery is, so the men face it when it is on their side.
    let bx = 0, bz = 0;
    for (const u of units) { bx += u.pos.x; bz += u.pos.z; }
    const haveBattery = units.length > 0;
    if (haveBattery) { bx /= units.length; bz /= units.length; }

    const out = [];
    let k = 0;
    for (let ring = 6; ring <= 90 && out.length < n; ring += 3) {
      const x0 = f.x0 - ring, x1 = f.x1 + ring, z0 = f.z0 - ring, z1 = f.z1 + ring;
      const per = 2 * ((x1 - x0) + (z1 - z0));
      const step = 3.1;
      const cand = [];
      for (let s = Math.random() * step; s < per; s += step) {
        let x, z;
        if (s < x1 - x0) { x = x0 + s; z = z0; }
        else if (s < (x1 - x0) + (z1 - z0)) { x = x1; z = z0 + s - (x1 - x0); }
        else if (s < 2 * (x1 - x0) + (z1 - z0)) { x = x1 - (s - (x1 - x0) - (z1 - z0)); z = z1; }
        else { x = x0; z = z1 - (s - 2 * (x1 - x0) - (z1 - z0)); }
        cand.push([x + (Math.random() - 0.5) * 1.6, z + (Math.random() - 0.5) * 1.6]);
      }
      // Shuffled, so a ring that is only partly needed is spread round the
      // building rather than piled on its first side.
      for (let i = cand.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cand[i], cand[j]] = [cand[j], cand[i]];
      }
      for (const [x, z] of cand) {
        if (out.length >= n) break;
        if (near(x, z, 2.7) || !ok(x, z)) continue;
        taken.push({ x, z });
        // Outward from the nearest point of the building.
        const nx0 = x - Math.max(f.x0, Math.min(f.x1, x));
        const nz0 = z - Math.max(f.z0, Math.min(f.z1, z));
        const nl = Math.hypot(nx0, nz0) || 1;
        const nx = nx0 / nl, nz = nz0 / nl;
        let facing = Math.atan2(nx, nz);
        if (haveBattery) {
          const tx = bx - x, tz = bz - z, tl = Math.hypot(tx, tz) || 1;
          if ((tx * nx + tz * nz) / tl > -0.2) facing = Math.atan2(tx, tz);
        }
        const type = pickType(((k++ * 0.6180339887) + 0.31) % 1, this.cfg.mix);
        out.push({ pos: new THREE.Vector3(x, t.heightAt(x, z), z), facing, type });
      }
    }
    return out;
  }

  /**
   * Squads all over the map: five to eight men each, round a point of open
   * ground, a quarter of the points within mortar reach of the battery and the
   * rest spread round the compass at every distance out to the edge, none
   * of them within two hundred and fifty metres of a gun. A tube
   * in every squad and a second in every third; a spotter in every other
   * squad, and the mortars near him are the ones that hit. Facing the
   * guns if there are guns, the building if not.
   */
  _mapSlots(n, already) {
    if (n < 1) return [];
    const b = this.battle, t = this.terrain;
    const f = b.primary.footprint;
    if (!f) return [];
    const span = t.span * 0.86;
    const fc = { x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2 };
    const fr = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2;
    const units = b.units.filter((u) => u.alive);
    let bx = 0, bz = 0;
    for (const u of units) { bx += u.pos.x; bz += u.pos.z; }
    const haveBattery = units.length > 0;
    if (haveBattery) { bx /= units.length; bz /= units.length; }
    const taken = already.map((s) => ({ x: s.pos.x, z: s.pos.z }));
    const crowded = (x, z, r) => taken.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < r * r);
    const geom = cityGeom(b.cityPlots || []);
    // Out of rifle and machine-gun reach of the battery, and well inside a
    // mortar's: the squads near the guns shell them, they do not overrun them.
    // A man standing up four hundred metres off is the player's to find.
    let clearOfGuns = 250;
    const ok = (x, z) => {
      if (Math.abs(x) > span || Math.abs(z) > span) return false;
      if (Math.hypot(x - fc.x, z - fc.z) < fr + 40) return false;
      if (t.isWater(x, z)) return false;
      const h = t.heightAt(x, z);
      const slope = Math.max(Math.abs(t.heightAt(x + 1.5, z) - h), Math.abs(t.heightAt(x, z + 1.5) - h)) / 1.5;
      if (slope > 0.45) return false;
      // Not in a building, and not in a yard walled in on three sides: a
      // squad the guns can never see is one the player has to bomb out.
      const P = geom.nearPlots(x, z, 22);
      if (P.some((q) => geom.inside(x, z, q, 3))) return false;
      if (geom.walledSides(x, z, P) >= 3) return false;
      for (const u of units) if ((u.pos.x - x) ** 2 + (u.pos.z - z) ** 2 < clearOfGuns * clearOfGuns) return false;
      return true;
    };
    const squads = Math.max(4, Math.round(n / 6.5));
    const turn = Math.random() * Math.PI * 2;
    const out = [];
    let made = 0;
    for (let i = 0; i < squads && out.length < n; i++) {
      // The centre: near the guns for a third of them, anywhere for the rest.
      let cx = null, cz = null;
      for (let tries = 0; tries < 40 && cx === null; tries++) {
        let x, z;
        if (haveBattery && i % 4 === 0) {
          const a = Math.random() * Math.PI * 2, r = 360 + Math.random() * 200;
          x = bx + Math.cos(a) * r; z = bz + Math.sin(a) * r;
        } else {
          const a = turn + (i / squads) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
          const r = fr + 90 + Math.random() * (span - fr - 90);
          x = fc.x + Math.cos(a) * r; z = fc.z + Math.sin(a) * r;
        }
        if (ok(x, z) && !crowded(x, z, 30)) { cx = x; cz = z; }
      }
      if (cx === null) continue;
      made++;
      const size = Math.min(n - out.length, 5 + Math.floor(Math.random() * 4));
      const tx = haveBattery ? bx : fc.x, tz = haveBattery ? bz : fc.z;
      let k = 0;
      clearOfGuns = 230;
      for (let tries = 0; tries < size * 8 && k < size; tries++) {
        const a = Math.random() * Math.PI * 2, r = k === 0 ? 0 : 3 + Math.random() * 16;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (crowded(x, z, 2.8) || !ok(x, z)) continue;
        taken.push({ x, z });
        // Two tubes a squad first, then a spotter every other squad, then
        // whatever the mix gives.
        const type = k === 0 || (k === 1 && i % 3 === 0) ? 'mortar'
          : k === 2 && i % 2 === 0 ? 'spotter'
            : pickType(((made * 7 + k) * 0.6180339887) % 1, this.cfg.squad);
        out.push({ pos: new THREE.Vector3(x, t.heightAt(x, z), z), facing: Math.atan2(tx - x, tz - z), type, squad: i });
        k++;
      }
      clearOfGuns = 250;
    }
    this.squads = made;
    return out;
  }

  _ensureMeshes() {
    if (this.manMesh) return;
    const cap = Math.max(1, this.total);
    const shadows = this.battle.quality?.shadowMapSize > 0;
    const mk = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.castShadow = shadows;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.scene.add(m);
      return m;
    };
    this.manMesh = mk(soldierGeometry('hang'),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true }));
    const chute = this.nation.chute ?? DEFAULT_CHUTE;
    this.chuteMesh = mk(canopyGeometry(), new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide, vertexColors: true,
      emissive: new THREE.Color(chute), emissiveIntensity: 0.32,
    }));
    this.chuteColour = chute;
  }

  /** The aircraft along their runs, and the men out of the door. */
  _fly(dt) {
    const F = this.frame;
    for (let i = this.planes.length - 1; i >= 0; i--) {
      const p = this.planes[i];
      p.t += dt;
      p.soak = Math.min(p.soakRate, p.soak + p.soakRate * dt);
      const m = p.model;
      if (p.down) {
        // Going in: nose down, a wing dropping, and a lot of smoke.
        p.vy = (p.vy || 0) - 9.81 * dt * 0.55;
        m.position.addScaledVector(p.dir, p.speed * dt);
        m.position.y += p.vy * dt;
        p.bank = Math.min(1.1, p.bank + dt * 0.35);
        m.rotation.set(0, 0, 0);
        m.rotateY(Math.atan2(p.dir.x, p.dir.z));
        m.rotateX(Math.min(0.5, -p.vy * 0.02));
        m.rotateZ(p.bank * p.spin);
        if (this.battle.fx) this.battle.fx.trail(m.position, 5.5);
        const gy = this.terrain.heightAt(m.position.x, m.position.z);
        if (m.position.y <= gy + 2) {
          if (this.battle.fx) this.battle.fx.strikeBlast(m.position.clone().setY(gy), 1.6, { groundY: gy });
          if (this.battle.audio) this.battle.audio.play('explosion', m.position, { gain: 0.9, rolloff: 1200 });
          this._remove(p, i);
        }
        continue;
      }
      p.along += p.speed * dt;
      m.position.addScaledVector(p.dir, p.speed * dt);
      // The stick: each man goes when the run reaches his strip of ground,
      // a little short of it for the throw, and never two in the same breath.
      while (p.next < p.load.length && p.t >= p.nextAt
        && p.along >= p.load[p.next].along - p.speed * (JUMP.freeFall + 0.6)) {
        this._jump(p, p.load[p.next++]);
        p.nextAt = p.t + JUMP.stick * (F.cap < 15 ? 1.6 : 1);
      }
      for (const ch of m.children) if (ch.name === 'prop') ch.rotation.z += 34 * dt;
      p.roar -= dt;
      if (p.roar <= 0 && this.battle.audio) {
        p.roar = 1.3;
        const d = this.battle.camera.position.distanceTo(m.position);
        if (d < 2200) this.battle.audio.play('rocket', m.position, {
          rate: this.nation.frame === 'il76' ? 0.5 : 0.3, gain: 0.32, rolloff: 1400, cooldown: 0.4,
        });
      }
      if (p.along > 1500) {
        // Anybody still aboard is going home with it.
        this.lost += p.load.slice(p.next).filter((x) => x.type !== 'sam').length;
        this._remove(p, i);
      }
    }
  }

  _remove(p, i) {
    this.scene.remove(p.model);
    p.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    p.alive = false;
    this.planes.splice(i, 1);
  }

  _jump(p, slot) {
    if (slot.type === 'sam') { this._dropCargo(p, slot); return; }
    const m = p.model;
    const pos = m.position.clone().addScaledVector(p.dir, -8);
    pos.y -= 2.4;
    const drop = Math.max(10, pos.y - slot.pos.y);
    const man = {
      slot, pos,
      vel: new THREE.Vector3(p.dir.x * p.speed * 0.8, -1, p.dir.z * p.speed * 0.8),
      t: 0, open: 0, yaw: m.rotation.y, sway: Math.random() * 6.28,
      rate: Math.max(JUMP.rate, drop / JUMP.maxUnder),
      hp: 8, alive: true, dead: false,
      hitPos: new THREE.Vector3(),
    };
    man.hit = (dmg) => this._hitMan(man, dmg);
    man.pos.y = Math.max(man.pos.y, slot.pos.y + 20);
    this.men.push(man);
  }

  /** Under the canopies: steer onto the slot, land, become the garrison. */
  _fall(dt) {
    const g = this.battle.garrison;
    for (let i = this.men.length - 1; i >= 0; i--) {
      const man = this.men[i];
      man.t += dt;
      const s = man.slot.pos;
      if (man.dead) {
        man.vel.y = Math.max(-26, man.vel.y - 9.81 * dt);
        man.vel.x *= Math.exp(-dt); man.vel.z *= Math.exp(-dt);
        man.pos.addScaledVector(man.vel, dt);
        man.open = Math.max(0, man.open - dt * 2);
        const gy = this.terrain.heightAt(man.pos.x, man.pos.z);
        if (man.pos.y <= gy) {
          if (this.battle.fx && this.battle.quality?.name !== 'low') this.battle.fx.impactDust(man.pos.x, gy, man.pos.z, 0.5);
          this.men.splice(i, 1);
        }
        continue;
      }
      if (man.t < JUMP.freeFall) {
        man.vel.multiplyScalar(Math.exp(-2.6 * dt));
        man.vel.y -= 9.81 * dt;
      } else {
        man.open = Math.min(1, man.open + dt / JUMP.open);
        const left = Math.max(0.6, (man.pos.y - s.y) / man.rate);
        let wx = (s.x - man.pos.x) / left, wz = (s.z - man.pos.z) / left;
        const wl = Math.hypot(wx, wz);
        if (wl > JUMP.steer) { wx *= JUMP.steer / wl; wz *= JUMP.steer / wl; }
        const k = Math.min(1, dt * 2.4 * man.open);
        man.vel.x += (wx - man.vel.x) * k;
        man.vel.z += (wz - man.vel.z) * k;
        man.vel.y += (-man.rate - man.vel.y) * Math.min(1, dt * 3 * man.open);
      }
      man.pos.addScaledVector(man.vel, dt);
      man.hitPos.copy(man.pos).y += 5.5;
      if (man.pos.y <= s.y + 0.02 || (man.t > 4 && man.pos.y < this.terrain.heightAt(man.pos.x, man.pos.z))) {
        // Down. Dug in where he was meant to be, a scrape and a firing
        // position, facing the way he was told.
        const at = s.clone();
        const placed = g.place(man.slot.type, at, man.slot.facing, 4,
          { cover: 'ground', emplaced: true, pool: this.cfg.pool });
        if (placed) {
          this.landed++;
          // Off the canopy and into a scrape: a tube takes a while to set up.
          const d = g.defenders[g.defenders.length - 1];
          if (d && d.def.indirect && this.cfg.pool === 'wave') d.cooldown = 10 + Math.random() * 12;
        } else this.lost++;
        if (this.battle.fx && this.battle.quality?.name !== 'low') this.battle.fx.impactDust(s.x, s.y, s.z, 0.4);
        man.alive = false;
        this.men.splice(i, 1);
      }
    }
  }

  /**
   * A heavy-drop pallet: a launcher on a platform under three big canopies,
   * out of the back of the aircraft and down at eight metres a second onto
   * its site, where it becomes an S-300 launcher that is up for business.
   */
  _dropCargo(p, slot) {
    const m = p.model;
    const grp = new THREE.Group();
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 11),
      new THREE.MeshStandardMaterial({ color: 0x4d5733, roughness: 0.85 }));
    pallet.position.y = 1.2;
    grp.add(pallet);
    const chuteMat = new THREE.MeshStandardMaterial({ color: this.nation.chute ?? DEFAULT_CHUTE, roughness: 0.95,
      side: THREE.DoubleSide, emissive: new THREE.Color(this.nation.chute ?? DEFAULT_CHUTE), emissiveIntensity: 0.3 });
    const canopies = [];
    for (const [ox, oz] of [[-7, 0], [7, 0], [0, 7]]) {
      const c = new THREE.Mesh(canopyGeometry(), chuteMat);
      c.scale.set(0.01, 0.01, 0.01);
      c.position.set(ox, 2, oz);
      grp.add(c);
      canopies.push(c);
    }
    grp.position.copy(m.position).addScaledVector(p.dir, -10);
    grp.position.y -= 3;
    grp.rotation.y = m.rotation.y;
    this.scene.add(grp);
    this.cargo.push({ slot, grp, canopies, t: 0, vel: new THREE.Vector3(p.dir.x * p.speed * 0.7, -2, p.dir.z * p.speed * 0.7) });
  }

  _fallCargo(dt) {
    for (let i = this.cargo.length - 1; i >= 0; i--) {
      const c = this.cargo[i];
      c.t += dt;
      const s = c.slot.pos, P = c.grp.position;
      const open = Math.min(1, Math.max(0, (c.t - 1.2) / 1.4));
      for (const k of c.canopies) { const sc = 0.01 + open * 2.6; k.scale.set(sc, sc, sc); k.position.y = 2 + open * 24; }
      if (open <= 0) { c.vel.multiplyScalar(Math.exp(-1.5 * dt)); c.vel.y -= 9.81 * dt; }
      else {
        const left = Math.max(0.8, (P.y - s.y) / 8);
        let wx = (s.x - P.x) / left, wz = (s.z - P.z) / left;
        const wl = Math.hypot(wx, wz);
        if (wl > 22) { wx *= 22 / wl; wz *= 22 / wl; }
        const k = Math.min(1, dt * 2 * open);
        c.vel.x += (wx - c.vel.x) * k; c.vel.z += (wz - c.vel.z) * k;
        c.vel.y += (-8 - c.vel.y) * Math.min(1, dt * 2 * open);
      }
      P.addScaledVector(c.vel, dt);
      if (P.y <= s.y + 0.05 || (c.t > 5 && P.y < this.terrain.heightAt(P.x, P.z))) {
        this.scene.remove(c.grp);
        c.grp.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        this.cargo.splice(i, 1);
        if (this.battle.fx && this.battle.quality?.name !== 'low') this.battle.fx.impactDust(s.x, s.y, s.z, 1.4);
        if (this.battle.landSam) this.battle.landSam(c.slot.site);
        this.samsLanded = (this.samsLanded || 0) + 1;
      }
    }
  }

  _hitPlane(p, dmg) {
    if (!p.alive || p.down) return;
    // No faster than the airframe can actually be shot down.
    dmg = Math.min(dmg, p.soak);
    p.soak -= dmg;
    p.hp -= dmg;
    this.planeDamage = (this.planeDamage || 0) + dmg;
    if (p.hp > 0) return;
    p.down = true;
    p.alive = false;
    p.spin = Math.random() < 0.5 ? -1 : 1;
    const aboard = p.load.slice(p.next).filter((x) => x.type !== 'sam').length;
    p.next = p.load.length;
    this.lost += aboard;
    if (aboard) this.battle._creditKills(aboard, p.model.position.clone());
    // A transport is a target in its own right: paid for, whatever it carried.
    const at = p.model.position.clone();
    this.battle.money += TRANSPORT_BOUNTY;
    this.battle.onEvent('bounty', { point: at, amount: TRANSPORT_BOUNTY, kind: 'kill' });
    this.battle.onEvent('airbornedown', { name: this.frame.name, aboard, bounty: TRANSPORT_BOUNTY, point: at });
  }

  _hitMan(man, dmg) {
    if (!man.alive || man.dead) return;
    man.hp -= dmg;
    if (man.hp > 0) return;
    man.dead = true;
    man.alive = false;
    this.lost++;
    this.battle._creditKills(1, man.pos.clone());
  }

  /** What is up there, for the player's machine guns: the aircraft first. */
  _publish() {
    const list = this.battle.enemyAir;
    for (const p of this.planes) if (p.alive) list.push(p);
    for (const man of this.men) {
      // A man under a canopy is a small thing falling past at two hundred
      // metres: most of a burst goes through the silk or past him.
      // One target per man, alive for as long as he is: a gun holds its
      // target for a burst, and a copy made with \`alive: true\` kept a gun
      // firing at the point in the sky where a dead man had been.
      if (man.alive && man.open > 0.6) {
        list.push(man.target || (man.target = { pos: man.hitPos, hit: man.hit, exposure: 0.15, get alive() { return man.alive; } }));
      }
    }
  }

  _draw() {
    let w = 0, c = 0;
    const mm = this.manMesh, cm = this.chuteMesh;
    const man = this._manC || (this._manC = new THREE.Color(DEFENDER_TYPES.rifleman.colour));
    this._c.setHex(this.chuteColour);
    for (const m of this.men) {
      const sw = Math.sin(m.t * 1.7 + m.sway) * 0.12 * m.open;
      if (m.dead) {
        this._e.set(m.t * 3, m.yaw, m.t * 2);
      } else {
        this._e.set(sw * 0.6, m.yaw, sw);
      }
      this._q.setFromEuler(this._e);
      this._s.set(1, 1, 1);
      this._m4.compose(m.pos, this._q, this._s);
      mm.setMatrixAt(w, this._m4);
      mm.instanceColor.setXYZ(w, man.r, man.g, man.b);
      w++;
      if (m.open > 0.02) {
        const o = m.open;
        this._s.set(o, 0.3 + 0.7 * o, o);
        this._m4.compose(m.pos, this._q, this._s);
        cm.setMatrixAt(c, this._m4);
        cm.instanceColor.setXYZ(c, this._c.r, this._c.g, this._c.b);
        c++;
      }
    }
    mm.count = w;
    cm.count = c;
    for (const x of [mm, cm]) { x.instanceMatrix.needsUpdate = true; x.instanceColor.needsUpdate = true; }
  }

  _finish() {
    this.state = 'done';
    for (const x of [this.manMesh, this.chuteMesh]) if (x) x.count = 0;
    this.battle.onEvent(`${this.cfg.kind}landed`, { landed: this.landed, lost: this.lost, name: this.frame.name,
      sams: this.samsLanded || 0, squads: this.squads || 0 });
  }

  /** For a save: it has been and gone, whatever it achieved. */
  get spent() { return this.state !== 'waiting'; }

  /**
   * The men of this drop still in the fight: aboard a transport that is
   * still flying, under a canopy, or dug in and alive. The level is not won
   * while any are left (see `Battle._checkEnd`).
   */
  get outstanding() {
    if (this.state === 'waiting') return 0;
    let n = 0;
    for (const p of this.planes) {
      if (!p.alive) continue;
      for (let i = p.next; i < p.load.length; i++) if (p.load[i].type !== 'sam') n++;
    }
    for (const m of this.men) if (m.alive && !m.dead) n++;
    const g = this.battle.garrison;
    if (g) for (const d of g.defenders) if (d.alive && d.pool === this.cfg.pool) n++;
    return n;
  }

  /**
   * Out of the town and into the open, once the building is down.
   *
   * The squads came down on open ground, but open ground in a city is a yard
   * behind a block or the shell of a house the fire has gutted, and a man
   * there is behind three walls from every gun on the map: the player was
   * left calling in a bomber for each of the last few. With the objective
   * down and the level waiting on them, a survivor who is inside a building's
   * footprint, walled in on three sides, or behind a roof from the battery's
   * side too tall for a shell to come down over, gives up the position and makes
   * for the nearest open ground he can reach without walking through a wall,
   * on foot, where the battery can see him. Returns how many moved.
   */
  flush() {
    const b = this.battle, g = b.garrison, t = this.terrain;
    if (!g) return 0;
    const span = t.span * 0.93;
    const { nearPlots, inside, walledSides } = cityGeom(b.cityPlots || []);
    // Where the battery is: the middle of the guns on the ground. A man with
    // a block between him and that, close enough and tall enough that a shell
    // coming down at forty degrees meets the roof first, is out of reach of
    // every gun the player has, however open his own yard is — which is the
    // man at the back of the town the player could only get with a bomber.
    let cx = 0, cz = 0, cn = 0;
    for (const u of b.units || []) {
      if (!u.alive || !u.pos || u.def?.strike) continue;
      cx += u.pos.x; cz += u.pos.z; cn++;
    }
    if (cn) { cx /= cn; cz /= cn; }
    const shadowed = (x, z) => {
      if (!cn) return false;
      const L = Math.hypot(cx - x, cz - z);
      if (L < 30) return false;
      const ux = (cx - x) / L, uz = (cz - z) / L, y = t.heightAt(x, z) + 1.2;
      const P = nearPlots(x + ux * 24, z + uz * 24, 28);
      if (!P.length) return false;
      for (let r = 3; r <= 48; r += 3) {
        const px = x + ux * r, pz = z + uz * r;
        for (const q of P) {
          if (q.top - y > r * 0.84 && inside(px, pz, q, 0.3)) return true;
        }
      }
      return false;
    };
    const hemmed = (p) => {
      const P = nearPlots(p.x, p.z, 26);
      if (!P.length) return false;
      return P.some((q) => inside(p.x, p.z, q, 2.5)) || walledSides(p.x, p.z, P) >= 3 || shadowed(p.x, p.z);
    };
    const taken = [];
    const open = (x, z) => {
      if (Math.abs(x) > span || Math.abs(z) > span || t.isWater(x, z)) return false;
      const h = t.heightAt(x, z);
      if (Math.abs(t.heightAt(x + 2, z) - h) > 1.2 || Math.abs(t.heightAt(x, z + 2) - h) > 1.2) return false;
      const P = nearPlots(x, z, 24);
      if (P.some((q) => inside(x, z, q, 4))) return false;
      if (walledSides(x, z, P) > 1 || shadowed(x, z)) return false;
      return !taken.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 9);
    };
    const clearPath = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 3));
      const P = nearPlots((ax + bx) / 2, (az + bz) / 2, L / 2 + 6);
      let hits = 0;
      for (let i = 1; i < n; i++) {
        const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
        if (P.some((q) => inside(x, z, q, 0.3))) hits++;
      }
      return hits;
    };
    let moved = 0;
    for (const d of g.defenders) {
      if (!d.alive || d.pool !== this.cfg.pool || d.walk) continue;
      if (!hemmed(d.pos)) continue;
      // The nearest open ground, preferring a way there that does not go
      // through a building; failing that, the nearest at all.
      let best = null, bestScore = Infinity;
      for (let r = 8; r <= 150 && !best; r += 7) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + r * 0.071;
          const x = d.pos.x + Math.cos(a) * r, z = d.pos.z + Math.sin(a) * r;
          if (!open(x, z)) continue;
          const score = r + clearPath(d.pos.x, d.pos.z, x, z) * 25;
          if (score < bestScore) { bestScore = score; best = { x, z }; }
        }
      }
      if (!best) continue;
      taken.push(best);
      d.walk = new THREE.Vector3(best.x, t.heightAt(best.x, best.z), best.z);
      d.sandbags = false;
      d.cover = 'ground';
      moved++;
    }
    if (moved) {
      this.walkers = true;
      this.battle.onEvent('flushed', { n: moved });
    }
    return moved;
  }

  /** The men on their feet: three metres a second, holding fire till they are there. */
  _walk(dt) {
    const g = this.battle.garrison, t = this.terrain;
    let any = false;
    for (const d of g.defenders) {
      // This drop's men only: both drops step their walkers, and a man moved
      // by both went at twice the pace.
      if (!d.walk || d.pool !== this.cfg.pool) continue;
      if (!d.alive) { d.walk = null; continue; }
      any = true;
      const dx = d.walk.x - d.pos.x, dz = d.walk.z - d.pos.z;
      const L = Math.hypot(dx, dz);
      const step = 3.2 * dt;
      if (L <= step) {
        d.pos.set(d.walk.x, t.heightAt(d.walk.x, d.walk.z), d.walk.z);
        d.walk = null;
      } else {
        d.pos.x += (dx / L) * step;
        d.pos.z += (dz / L) * step;
        d.pos.y = t.heightAt(d.pos.x, d.pos.z);
        d.facing = Math.atan2(dx, dz);
        d.cooldown = Math.max(d.cooldown, 0.5);
      }
      d.muzzle.copy(d.pos).y += d.def.eye ?? 1.25;
      d.blocked = false;
    }
    if (!any) this.walkers = false;
  }

  /** Where the dug-in survivors are, for the markers. */
  survivors(max = 16) {
    const g = this.battle.garrison;
    if (!g) return [];
    const out = [];
    for (const d of g.defenders) {
      if (d.alive && d.pool === this.cfg.pool) out.push(d.pos);
      if (out.length >= max) break;
    }
    return out;
  }
}
