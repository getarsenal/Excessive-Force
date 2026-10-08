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
  brass: [1.5, 1.15, 0.5],
};

/** Tones as plain colours, for the player's teams. */
export const TONE_COLOUR = {
  gear: 0x353a2b,
  helmet: 0x434b37,
  boots: 0x211f1b,
  skin: 0x8d6a4f,
  steel: 0x23251f,
  brass: 0xb5893a,
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

/**
 * An M240-class gun from its butt at `b`: stock, receiver with its feed
 * tray cover, pistol grip, the belt bag on its left, barrel with the gas
 * tube under it, front sight post and flash hider, and the bipod at the
 * gas block with its feet on `ground` (the figure's ground, or, drawn
 * under the gunner's own eye, the ground as far below the gun as a prone
 * gun's is; `null`, folded out of the way, as the gunner's own eye has
 * it). Returns the mouth of the feed tray, for the belt.
 */
function machineGun(k, b, ground = 0.02) {
  const y = b.y + 0.04;   // the bore
  k.box(0.07, 0.12, 0.26, b.x, b.y, b.z, 'steel');
  // Receiver, the feed cover standing a little proud of it, the grip and guard.
  k.box(0.1, 0.14, 0.38, b.x, b.y + 0.02, b.z + 0.32, 'steel');
  k.box(0.12, 0.03, 0.26, b.x, b.y + 0.105, b.z + 0.36, 'steel');
  k.box(0.03, 0.1, 0.05, b.x, b.y - 0.1, b.z + 0.22, 'steel', 0.3);
  k.box(0.012, 0.012, 0.09, b.x, b.y - 0.07, b.z + 0.3, 'steel');
  // The hundred-round bag hung under the left of the feed tray (a figure
  // facing +Z has its left at +X; the M240 feeds from the left).
  k.box(0.08, 0.13, 0.16, b.x + 0.11, b.y - 0.07, b.z + 0.34, 'gear');
  // Barrel and gas tube, the front sight post behind the flash hider.
  k.rod(v(b.x, y, b.z + 0.5), v(b.x, y, b.z + 1.16), 0.024, 'steel', 8);
  k.rod(v(b.x, y - 0.04, b.z + 0.5), v(b.x, y - 0.04, b.z + 0.98), 0.012, 'steel', 6);
  k.box(0.05, 0.03, 0.06, b.x, y - 0.025, b.z + 0.98, 'steel');
  k.box(0.01, 0.055, 0.01, b.x, y + 0.048, b.z + 1.04, 'steel');
  k.box(0.034, 0.012, 0.012, b.x, y + 0.075, b.z + 1.04, 'steel');
  const hider = new THREE.CylinderGeometry(0.03, 0.02, 0.1, 8);
  hider.rotateX(Math.PI / 2); hider.translate(b.x, y, b.z + 1.2);
  k.add(hider, 'steel');
  // The bipod, legs splayed from the gas block down to the ground.
  if (ground !== null) for (const sx of [-1, 1]) {
    k.rod(v(b.x, y - 0.03, b.z + 0.98), v(b.x + sx * 0.17, ground, b.z + 1.04), 0.011, 'steel', 5);
  }
  return v(b.x + 0.06, b.y + 0.075, b.z + 0.36);
}

/**
 * A belt of linked 7.62, hanging out of the bag in a sag and up into the
 * feed tray: brass rounds on a dark run of links, laid along a curve whose
 * belly is on a damped spring. At rest it hangs and settles; fired through,
 * every round pulled into the tray snaps it toward the gun and shakes it,
 * so a long burst is a belt jumping and rattling under the receiver.
 *
 *   userData.advance(n)  n rounds pulled in: the rounds walk a link each
 *                        and the belt is yanked
 *   userData.update(dt)  the spring, and the belt laid again on it
 */
export function ammoBelt(from, to, colour) {
  const g = new THREE.Group();
  g.name = 'belt';
  const out = Math.sign(from.x - to.x || 1);
  // Rest shape: out of the bag outward and down, a belly, up into the tray.
  const c1r = from.clone().add(new THREE.Vector3(out * 0.04, -0.07, 0));
  const c2r = to.clone().add(new THREE.Vector3(out * 0.07, -0.08, 0));
  const curve = new THREE.CubicBezierCurve3(from.clone(), c1r.clone(), c2r.clone(), to.clone());
  const len0 = curve.getLength();
  const pitch = 0.016, n = Math.max(2, Math.floor(len0 / pitch) + 2);
  const brass = colour ?? TONE_COLOUR.brass;
  const rounds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.062, 6),
    new THREE.MeshStandardMaterial({ color: brass, roughness: 0.45, metalness: 0.25, emissive: brass, emissiveIntensity: 0.45 }), n);
  const links = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.008, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x2a2c27, roughness: 0.7, metalness: 0.3, emissive: 0x2a2c27, emissiveIntensity: 0.55 }), n);
  for (const im of [rounds, links]) { im.frustumCulled = false; g.add(im); }
  const p = new THREE.Vector3(), t = new THREE.Vector3(), side = new THREE.Vector3(), m = new THREE.Matrix4(),
    q = new THREE.Quaternion(), qL = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Z = new THREE.Vector3(0, 0, 1);
  // The belly's spring: an offset from rest and its velocity, in the belt's plane and across it.
  const off = new THREE.Vector3(), vel = new THREE.Vector3();
  let phase = 0, rattle = 0;
  const lay = () => {
    curve.v1.copy(c1r).addScaledVector(off, 0.6);
    curve.v2.copy(c2r).add(off);
    curve.updateArcLengths();
    const len = curve.getLength();
    for (let i = 0; i < n; i++) {
      const s = (i * pitch + phase) % len;
      const u = s / len;
      curve.getPointAt(u, p); curve.getTangentAt(u, t);
      // A round lies along the bore (the belt runs across it), a link square on the belt.
      side.crossVectors(t, Z);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      q.setFromUnitVectors(UP, Z);
      m.compose(p, q, one); rounds.setMatrixAt(i, m);
      qL.setFromUnitVectors(new THREE.Vector3(1, 0, 0), t);
      p.addScaledVector(side.normalize(), 0.004);
      m.compose(p, qL, one); links.setMatrixAt(i, m);
    }
    rounds.instanceMatrix.needsUpdate = true;
    links.instanceMatrix.needsUpdate = true;
  };
  lay();
  g.userData.advance = (k) => {
    if (!k) return;
    phase = (phase + k * pitch) % len0;
    // Pulled in: the belly snaps toward the tray and up, and jumps about.
    vel.x += -out * 0.18 * k + (Math.random() - 0.5) * 0.25;
    vel.y += 0.22 * k + (Math.random() - 0.5) * 0.2;
    vel.z += (Math.random() - 0.5) * 0.16;
    rattle = Math.min(1, rattle + 0.35 * k);
  };
  g.userData.update = (dt) => {
    if (dt <= 0) return;
    // Stiff enough to swing back within a quarter second, loose enough to
    // overshoot; gravity's sag is the rest shape, so the spring pulls to nought.
    const K = 260, C = 9;
    const st = Math.min(dt, 1 / 30);
    vel.addScaledVector(off, -K * st).multiplyScalar(Math.max(0, 1 - C * st));
    // The rattle: small fast shakes while it is being fired through, dying away.
    if (rattle > 0.01) { vel.x += (Math.random() - 0.5) * 3 * rattle * st * 60 * 0.02; vel.y += (Math.random() - 0.5) * 3 * rattle * st * 60 * 0.02; }
    rattle *= Math.exp(-dt * 6);
    off.addScaledVector(vel, st);
    off.clampLength(0, 0.05);
    lay();
  };
  return g;
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
  // His hands are up at the muzzle, round the round the team itself carries
  // (units.js makeMortarTeam `round`), which the lay moves between the
  // crate and the tube; the pose draws no round of its own.
  const r = v(0.02, 2.02, 0.44);
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
  opts = { ...opts, selfLit: true };
  const k = new Kit();
  if (weapon === 'm240') {
    // Seen from the gunner's cheek on the stock: the receiver and its feed
    // cover low at the bottom of the frame, the barrel running away from it
    // up to the front sight post just under the cross, the belt coming up
    // into the tray on the left. The bipod is under the barrel, out of his
    // sight, so it is not drawn.
    const b = v(0, -0.04, 0.26);
    const tray = machineGun(k, b, null);
    const g = partsToGroup(k.parts, colour, opts);
    const belt = ammoBelt(v(b.x + 0.15, b.y + 0.0, b.z + 0.36), tray, opts.tones?.brass);
    g.add(belt);
    g.userData.belt = belt;
    // The muzzle flash at the flash hider, the gun's own (the world's flash
    // is at the team's real muzzle, not where this gun is drawn): star
    // petals along the bore and a disc across it, lit for a frame a round.
    const flash = muzzleStar(0.48, 0.13);
    flash.position.set(b.x, b.y + 0.04, b.z + 1.27);
    flash.visible = false;
    g.add(flash);
    g.userData.flash = flash;
    return g;
  }
  launcher(k, 0, 0, 0, weapon);
  return partsToGroup(k.parts, colour, opts);
}

/** A soft star of light for a muzzle: two crossed petals along +Z, `len` long, and a disc of `r` across the bore. */
let _starTex = null;
function muzzleStar(len, r) {
  if (!_starTex && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.25, 'rgba(255,214,140,0.9)');
    gr.addColorStop(0.6, 'rgba(255,140,40,0.35)'); gr.addColorStop(1, 'rgba(255,90,10,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    _starTex = new THREE.CanvasTexture(c);
    _starTex.colorSpace = THREE.SRGBColorSpace;
    _starTex.userData = { keep: true };
  }
  // Past the tone mapper, so a flash in desert noon still reads as light.
  const mat = new THREE.MeshBasicMaterial({ map: _starTex, color: 0xfff0cc, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
  const g = new THREE.Group();
  g.name = 'flash';
  for (const rz of [0, Math.PI / 2]) {
    const petal = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.4, len), mat);
    petal.rotation.x = Math.PI / 2; petal.rotation.y = rz; petal.position.z = len / 2;
    g.add(petal);
  }
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.6, r * 2.6), mat);
  disc.position.z = 0.02;
  g.add(disc);
  g.traverse((o) => { o.renderOrder = 5; o.frustumCulled = false; });
  return g;
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
    // A weapon under the player's own eye carries a little of its own light:
    // a foot from the lens it is otherwise a black cut-out against the sky,
    // and in a dark hall nothing at all.
    if (opts.selfLit) { mat.emissive = new THREE.Color(c); mat.emissiveIntensity = 0.55; }
    const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos, false), mat);
    m.castShadow = true;
    m.userData.tone = tone;
    g.add(m);
  }
  return g;
}
