import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * One soldier, for both armies.
 *
 * The garrison used to draw a downloaded figure flattened in its rest pose,
 * and a character's rest pose is a T: every defender on the map stood with
 * both arms held straight out to the sides and the rifle somewhere in the
 * middle of them. The player's teams were boxes with no arms at all and their
 * launchers lying sideways across their shoulders, ninety degrees off the way
 * they were facing. Both armies are built here now, from the same parts, in
 * poses a soldier actually takes: a rifle in the shoulder with both hands on
 * it, down on one knee, flat behind a machine gun on its bipod, a launcher
 * on the shoulder pointing where he is looking.
 *
 * Everything faces +Z and stands on y = 0, a man about 1.8 m tall. Parts carry
 * a tone rather than a colour, so the same figure can be one instanced mesh
 * with the uniform as the instance colour (the garrison) or a handful of
 * plain meshes in the player's own olive (the teams).
 *
 *   uniform  the instance or team colour itself
 *   gear     webbing, pack and belt: a shade darker
 *   helmet   a touch darker than the cloth
 *   boots    near black
 *   skin     face and hands
 *   steel    the weapon
 */

/** Tones, as multipliers of the uniform colour, for the instanced garrison. */
export const TONE_MULT = {
  uniform: [1, 1, 1],
  gear: [0.62, 0.6, 0.55],
  helmet: [0.82, 0.84, 0.8],
  boots: [0.32, 0.3, 0.28],
  skin: [1.6, 1.2, 1.0],
  steel: [0.34, 0.34, 0.34],
};

/** Tones as plain colours, for the player's teams. */
export const TONE_COLOUR = {
  gear: 0x353a2b,
  helmet: 0x434b37,
  boots: 0x211f1b,
  skin: 0x8d6a4f,
  steel: 0x23251f,
};

const UP = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

/** A collector of parts, each a geometry and a tone. */
class Kit {
  constructor() { this.parts = []; }
  add(geo, tone) { this.parts.push({ geo, tone }); return geo; }
  box(w, h, d, x, y, z, tone, rx = 0, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return this.add(g, tone);
  }
  ball(r, x, y, z, tone, sy = 1) {
    const g = new THREE.SphereGeometry(r, 8, 6);
    if (sy !== 1) g.scale(1, sy, 1);
    g.translate(x, y, z);
    return this.add(g, tone);
  }
  /** A limb or a barrel: a cylinder from `a` to `b`. */
  rod(a, b, r, tone, seg = 6) {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return this.add(g, tone);
  }
  /** A rod from `a` toward `b` and a fist at the end of it. */
  arm(shoulder, elbow, hand) {
    // The joints rounded, so an arm reads as an arm and not as two sticks.
    this.ball(0.075, shoulder.x, shoulder.y, shoulder.z, 'uniform');
    this.ball(0.056, elbow.x, elbow.y, elbow.z, 'uniform');
    this.rod(shoulder, elbow, 0.062, 'uniform');
    this.rod(elbow, hand, 0.052, 'uniform');
    this.ball(0.05, hand.x, hand.y, hand.z, 'skin');
  }
}

/**
 * The body from the hips up, at `h` metres of hip height and `lean` forward.
 * Returns the shoulder points so the pose can hang its arms off them.
 */
function upperBody(k, hip, lean = 0.1) {
  // Belt and hips.
  k.box(0.36, 0.14, 0.24, 0, hip + 0.02, 0, 'gear');
  // The torso, leaning into the gun.
  const chestY = hip + 0.34;
  const fwd = Math.sin(lean) * 0.34;
  k.box(0.4, 0.5, 0.24, 0, chestY, fwd * 0.5, 'uniform', lean);
  // Chest rig and the pack: the two shapes that make a soldier out of a man.
  k.box(0.42, 0.26, 0.3, 0, chestY + 0.02, fwd * 0.6 + 0.01, 'gear', lean);
  k.box(0.3, 0.34, 0.16, 0, chestY + 0.04, -0.2 + fwd * 0.3, 'gear', lean);
  // Head and helmet with its brim: the helmet is what reads at range.
  const headY = chestY + 0.4, headZ = fwd + 0.03;
  k.ball(0.105, 0.03, headY, headZ, 'skin', 1.12);
  k.ball(0.14, 0.03, headY + 0.05, headZ - 0.01, 'helmet', 0.72);
  const brim = new THREE.CylinderGeometry(0.16, 0.165, 0.025, 10);
  brim.translate(0.03, headY + 0.01, headZ - 0.01);
  k.add(brim, 'helmet');
  const shY = chestY + 0.2;
  return {
    left: v(-0.22, shY, fwd),
    right: v(0.22, shY, fwd),
    head: v(0, headY, headZ),
  };
}

/** Standing legs, the left a half pace forward. */
function standingLegs(k) {
  for (const [x, z0, z1] of [[-0.11, 0, 0.14], [0.11, 0, -0.12]]) {
    k.rod(v(x, 0.92, z0), v(x * 1.15, 0.12, z1), 0.085, 'uniform');
    k.box(0.13, 0.12, 0.28, x * 1.15, 0.06, z1 + 0.05, 'boots');
  }
}

/** Down on the right knee, the left foot planted forward. */
function kneelingLegs(k) {
  // Left: thigh forward and level, shin straight down.
  k.rod(v(-0.11, 0.52, 0), v(-0.13, 0.5, 0.42), 0.085, 'uniform');
  k.rod(v(-0.13, 0.5, 0.42), v(-0.13, 0.1, 0.44), 0.08, 'uniform');
  k.box(0.13, 0.12, 0.28, -0.13, 0.06, 0.5, 'boots');
  // Right: thigh down to the knee on the ground, shin back along it.
  k.rod(v(0.11, 0.52, 0), v(0.13, 0.08, 0.1), 0.085, 'uniform');
  k.rod(v(0.13, 0.08, 0.1), v(0.13, 0.08, -0.36), 0.08, 'uniform');
  k.box(0.12, 0.2, 0.12, 0.13, 0.1, -0.44, 'boots');
}

/** A rifle along +Z, butt at `butt`: stock, receiver, magazine, barrel. */
function rifle(k, butt, length = 0.95, scoped = false) {
  const b = butt;
  k.box(0.05, 0.1, 0.24, b.x, b.y - 0.02, b.z + 0.12, 'steel');
  k.box(0.06, 0.11, 0.3, b.x, b.y + 0.01, b.z + 0.38, 'steel');
  k.box(0.045, 0.14, 0.07, b.x, b.y - 0.1, b.z + 0.42, 'steel', -0.2);
  k.rod(v(b.x, b.y + 0.03, b.z + 0.52), v(b.x, b.y + 0.03, b.z + length), 0.018, 'steel', 5);
  if (scoped) k.rod(v(b.x, b.y + 0.1, b.z + 0.3), v(b.x, b.y + 0.1, b.z + 0.55), 0.03, 'steel', 6);
}

/**
 * A man aiming a rifle: the butt in his right shoulder, the right hand on the
 * grip, the left out along the handguard, his cheek down on the stock.
 */
function aimingRifle(k, hipY, opts = {}) {
  const sh = upperBody(k, hipY, 0.12);
  const butt = v(0.12, sh.right.y - 0.02, sh.right.z + 0.02);
  rifle(k, butt, opts.long ? 1.15 : 0.95, opts.scoped);
  k.arm(sh.right, v(0.3, butt.y - 0.2, butt.z + 0.06), v(0.12, butt.y - 0.06, butt.z + 0.26));
  k.arm(sh.left, v(-0.16, butt.y - 0.22, butt.z + 0.22), v(0.1, butt.y - 0.04, butt.z + 0.58));
}

/** A launcher on the right shoulder, pointing forward. */
function shoulderTube(k, hipY, weapon) {
  const sh = upperBody(k, hipY, 0.08);
  const y = sh.right.y + 0.06, x = 0.17, z = sh.right.z;
  launcher(k, x, y, z, weapon);
  k.arm(sh.right, v(0.32, y - 0.32, z + 0.02), v(x, y - 0.14, z + 0.14));
  k.arm(sh.left, v(-0.12, y - 0.3, z + 0.22), v(x - 0.03, y - 0.09, z + 0.42));
}

/** The launcher alone, its axis through (x, y, z) along +Z: on a shoulder, or in the firer's own view. */
function launcher(k, x, y, z, weapon) {
  if (weapon === 'javelin') {
    k.box(0.26, 0.26, 1.15, x, y + 0.04, z + 0.12, 'steel');
    k.box(0.22, 0.22, 0.3, x - 0.08, y - 0.14, z + 0.18, 'gear');
  } else if (weapon === 'gustaf') {
    k.rod(v(x, y, z - 0.5), v(x, y, z + 0.6), 0.09, 'steel', 8);
    const cone = new THREE.ConeGeometry(0.16, 0.26, 8, 1, true);
    cone.rotateX(Math.PI / 2);
    cone.translate(x, y, z - 0.58);
    k.add(cone, 'steel');
    k.box(0.08, 0.12, 0.16, x - 0.11, y + 0.04, z + 0.18, 'steel');
  } else if (weapon === 'rpg32') {
    k.rod(v(x, y, z - 0.35), v(x, y, z + 0.45), 0.09, 'steel', 8);
    k.ball(0.15, x, y + 0.02, z + 0.6, 'steel');
    const nose = new THREE.ConeGeometry(0.11, 0.26, 8);
    nose.rotateX(Math.PI / 2);
    nose.translate(x, y + 0.02, z + 0.84);
    k.add(nose, 'steel');
  } else {
    // AT4: one thin olive tube, longer behind than in front.
    k.rod(v(x, y, z - 0.45), v(x, y, z + 0.55), 0.068, 'steel', 8);
    k.box(0.04, 0.1, 0.05, x - 0.08, y + 0.1, z + 0.12, 'steel');
  }
}

/** The second man with binoculars up at his eyes. */
function observing(k, hipY) {
  const sh = upperBody(k, hipY, 0.04);
  const eye = v(sh.head.x, sh.head.y, sh.head.z + 0.12);
  for (const sx of [-0.05, 0.05]) {
    k.rod(v(eye.x + sx, eye.y, eye.z), v(eye.x + sx, eye.y, eye.z + 0.16), 0.034, 'steel', 6);
  }
  k.arm(sh.right, v(0.3, sh.right.y - 0.28, sh.right.z + 0.12), v(0.07, eye.y - 0.04, eye.z + 0.08));
  k.arm(sh.left, v(-0.3, sh.left.y - 0.28, sh.left.z + 0.12), v(-0.07, eye.y - 0.04, eye.z + 0.08));
  // A rifle slung across the back.
  k.rod(v(-0.2, sh.right.y - 0.5, -0.2), v(0.24, sh.right.y + 0.2, -0.2), 0.022, 'steel', 5);
}

/** The second man carrying the next round, held across his chest. */
function carryingRound(k, hipY) {
  const sh = upperBody(k, hipY, 0.06);
  const y = sh.right.y - 0.22, z = sh.right.z + 0.26;
  k.rod(v(-0.24, y, z), v(0.24, y + 0.06, z), 0.08, 'steel', 8);
  k.arm(sh.right, v(0.3, y - 0.06, z - 0.1), v(0.18, y + 0.02, z));
  k.arm(sh.left, v(-0.3, y - 0.06, z - 0.1), v(-0.18, y, z));
}

/**
 * Under a canopy: both hands up on the risers, legs together and a little
 * bent for the landing, the rifle slung across the chest. The enemy's
 * airborne, coming down.
 */
function hanging(k) {
  for (const x of [-0.09, 0.09]) {
    k.rod(v(x, 0.92, 0), v(x, 0.5, 0.12), 0.085, 'uniform');
    k.rod(v(x, 0.5, 0.12), v(x, 0.14, 0.02), 0.08, 'uniform');
    k.box(0.13, 0.12, 0.28, x, 0.08, 0.07, 'boots');
  }
  const sh = upperBody(k, 0.92, 0);
  k.arm(sh.right, v(0.3, sh.right.y + 0.24, 0.02), v(0.2, sh.right.y + 0.56, 0));
  k.arm(sh.left, v(-0.3, sh.left.y + 0.24, 0.02), v(-0.2, sh.left.y + 0.56, 0));
  k.rod(v(-0.2, sh.right.y - 0.42, 0.16), v(0.22, sh.right.y - 0.02, 0.16), 0.022, 'steel', 5);
}

/**
 * Flat on the ground behind a machine gun on its bipod, propped on the
 * elbows: the gunner. Head toward +Z, feet back along -Z.
 */
function proneGunner(k, withGun = true) {
  // Legs splayed back, boots toes-down.
  for (const sx of [-1, 1]) {
    k.rod(v(sx * 0.1, 0.14, -0.15), v(sx * 0.3, 0.1, -1.05), 0.085, 'uniform');
    k.box(0.13, 0.2, 0.1, sx * 0.32, 0.12, -1.12, 'boots');
  }
  // Body along the ground, chest raised a little on the elbows.
  k.box(0.36, 0.16, 0.26, 0, 0.14, -0.08, 'gear');
  const torso = new THREE.BoxGeometry(0.4, 0.24, 0.62);
  torso.rotateX(-0.22);
  torso.translate(0, 0.24, 0.24);
  k.add(torso, 'uniform');
  k.box(0.3, 0.16, 0.34, 0, 0.42, 0.1, 'gear', -0.22);
  k.ball(0.105, 0.04, 0.48, 0.62, 'skin', 1.1);
  k.ball(0.14, 0.04, 0.53, 0.6, 'helmet', 0.72);
  const brim = new THREE.CylinderGeometry(0.16, 0.165, 0.025, 10);
  brim.translate(0.04, 0.49, 0.6);
  k.add(brim, 'helmet');
  // Elbows down, hands up on the gun.
  const grip = v(0.12, 0.42, 0.78);
  k.arm(v(0.22, 0.36, 0.44), v(0.26, 0.08, 0.66), grip);
  k.arm(v(-0.22, 0.36, 0.44), v(-0.24, 0.08, 0.7), v(0.05, 0.45, 0.92));
  if (withGun) machineGun(k, v(0.12, 0.44, 0.8));
}

/** An M240-class gun from its butt at `b`: stock, receiver, belt box, barrel, bipod. */
function machineGun(k, b) {
  k.box(0.07, 0.12, 0.26, b.x, b.y, b.z, 'steel');
  k.box(0.1, 0.14, 0.38, b.x, b.y + 0.02, b.z + 0.32, 'steel');
  k.box(0.14, 0.12, 0.14, b.x - 0.12, b.y - 0.02, b.z + 0.3, 'gear');
  k.rod(v(b.x, b.y + 0.04, b.z + 0.5), v(b.x, b.y + 0.04, b.z + 1.2), 0.026, 'steel', 6);
  for (const sx of [-1, 1]) {
    k.rod(v(b.x, b.y + 0.02, b.z + 0.95), v(b.x + sx * 0.18, 0.02, b.z + 1.05), 0.014, 'steel', 4);
  }
}

/** The assistant gunner, prone beside the gun and feeding the belt. */
function proneAssistant(k) {
  for (const sx of [-1, 1]) {
    k.rod(v(sx * 0.1, 0.14, -0.15), v(sx * 0.26, 0.1, -1.0), 0.085, 'uniform');
    k.box(0.13, 0.2, 0.1, sx * 0.28, 0.12, -1.07, 'boots');
  }
  k.box(0.36, 0.16, 0.26, 0, 0.14, -0.08, 'gear');
  const torso = new THREE.BoxGeometry(0.4, 0.22, 0.6);
  torso.rotateX(-0.14);
  torso.translate(0, 0.2, 0.22);
  k.add(torso, 'uniform');
  k.ball(0.105, -0.02, 0.4, 0.6, 'skin', 1.1);
  k.ball(0.14, -0.02, 0.45, 0.58, 'helmet', 0.72);
  // An ammunition can beside him and a hand on the belt.
  k.box(0.26, 0.18, 0.12, 0.36, 0.09, 0.62, 'gear');
  k.arm(v(0.2, 0.3, 0.42), v(0.32, 0.08, 0.56), v(0.38, 0.22, 0.72));
  k.arm(v(-0.2, 0.3, 0.42), v(-0.24, 0.06, 0.62), v(-0.08, 0.1, 0.8));
  // His own rifle lying beside him.
  k.rod(v(-0.4, 0.05, -0.2), v(-0.42, 0.05, 0.7), 0.025, 'steel', 5);
}

/** The mortar gunner, down on one knee at the sight, hands forward on it. */
function mortarGunner(k) {
  kneelingLegs(k);
  const sh = upperBody(k, 0.52, 0.32);
  k.arm(sh.right, v(0.3, sh.right.y - 0.28, sh.right.z + 0.2), v(0.1, sh.right.y - 0.12, sh.right.z + 0.42));
  k.arm(sh.left, v(-0.3, sh.left.y - 0.28, sh.left.z + 0.2), v(-0.06, sh.left.y - 0.14, sh.left.z + 0.44));
}

/** The mortar loader, standing, the round held up over the muzzle. */
function mortarLoader(k) {
  standingLegs(k);
  const sh = upperBody(k, 0.92, 0.18);
  const r = v(0.02, 2.02, 0.44);
  k.rod(v(r.x, r.y - 0.25, r.z), v(r.x, r.y + 0.25, r.z), 0.06, 'steel', 8);
  k.arm(sh.right, v(0.26, sh.right.y + 0.12, sh.right.z + 0.2), v(0.07, r.y - 0.06, r.z));
  k.arm(sh.left, v(-0.26, sh.left.y + 0.12, sh.left.z + 0.2), v(-0.05, r.y - 0.16, r.z));
}

/**
 * Build the parts for a pose.
 *
 *   pose     'aim' | 'kneel-aim' | 'tube' | 'kneel-tube' | 'observe' |
 *            'carry' | 'prone-mg' | 'prone-ag' | 'mortar-gunner' | 'mortar-loader'
 *   weapon   the launcher, for the tube poses
 */
function build(pose, weapon, opts) {
  const k = new Kit();
  const kneel = pose.startsWith('kneel');
  if (pose === 'prone-mg') proneGunner(k);
  else if (pose === 'prone-ag') proneAssistant(k);
  else if (pose === 'mortar-gunner') mortarGunner(k);
  else if (pose === 'mortar-loader') mortarLoader(k);
  else if (pose === 'hang') hanging(k);
  else {
    if (kneel) kneelingLegs(k); else standingLegs(k);
    const hip = kneel ? 0.52 : 0.92;
    if (pose === 'tube' || pose === 'kneel-tube') shoulderTube(k, hip, weapon);
    else if (pose === 'observe') observing(k, hip);
    else if (pose === 'carry') carryingRound(k, hip);
    else aimingRifle(k, hip, opts);
  }
  return k.parts;
}

/** Normals and uv on every part, so they all merge. */
function tidy(g) {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}

/**
 * One geometry with the tones baked in as vertex colours, for an instanced
 * mesh whose instance colour is the uniform.
 */
export function soldierGeometry(pose = 'aim', weapon = null, opts = {}) {
  const geos = build(pose, weapon, opts).map(({ geo, tone }) => {
    const g = tidy(geo);
    const m = TONE_MULT[tone];
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = m[0]; col[i + 1] = m[1]; col[i + 2] = m[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return BufferGeometryUtils.mergeGeometries(geos, false);
}

/**
 * A figure as a group of plain meshes, one per tone, in the given uniform:
 * the player's teams.
 */
export function soldierFigure(colour, pose = 'aim', weapon = null, opts = {}) {
  return partsToGroup(build(pose, weapon, opts), colour, opts);
}

/**
 * The weapon alone, as the firer sees it from behind: the launcher's or the
 * machine gun's axis along +Z through the origin, the muzzle forward. The
 * lay stands this under the gunner's eye (main.js `layView`) in place of
 * the whole team, which from inside its own head is a helmet and a pack.
 */
export function weaponView(weapon, colour = 0x4a5340, opts = {}) {
  const k = new Kit();
  if (weapon === 'm240') machineGun(k, v(0, -0.04, -0.6));
  else launcher(k, 0, 0, 0, weapon);
  return partsToGroup(k.parts, colour, opts);
}

function partsToGroup(parts, colour, opts = {}) {
  const byTone = new Map();
  for (const { geo, tone } of parts) {
    if (!byTone.has(tone)) byTone.set(tone, []);
    byTone.get(tone).push(tidy(geo));
  }
  const g = new THREE.Group();
  for (const [tone, geos] of byTone) {
    const c = tone === 'uniform' ? colour : (opts.tones?.[tone] ?? TONE_COLOUR[tone]);
    const mat = new THREE.MeshStandardMaterial({
      color: c, roughness: tone === 'steel' ? 0.6 : 0.9, metalness: tone === 'steel' ? 0.2 : 0.02,
    });
    const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos, false), mat);
    m.castShadow = true;
    m.userData.tone = tone;
    g.add(m);
  }
  return g;
}
