import * as THREE from 'three';
import { part, loft, surface, pair, cachedSkin, bakeAirframe } from './geo.js';

/**
 * AH-64E Apache. 15.1 m of fuselage under a 14.6 m rotor, nose along +Z;
 * port is +X.
 *
 * What makes it an Apache: a narrow, slab-sided body with the two crew
 * stepped one behind and above the other under a canopy of flat, angled
 * panes; the avionics bays bulging along both sides of the cockpit, with
 * the main gear struck out of them on trailing arms; the small sensor
 * turret on the very nose, and under the chin the chain gun on its own
 * turret, which swings to whatever it is shooting at; the engines high on
 * the shoulders with their exhausts turned out; the mast with the Longbow
 * radome on top; the stub wings with their stores; and the long boom to a
 * swept fin with the tail rotor high on its left and the stabilator at its
 * foot.
 *
 * Parts the sortie drives: `rotorA` (spun on y), `tailrotor` (spun on x),
 * the first Hellfire is `bomb`, and `userData.gun` is the gun turret (its
 * rotation.y slews it; `userData.pitch` elevates the barrel; `userData.muzzle`
 * is where a round leaves).
 */

const Z0 = -8.35, Z1 = 7.3;
const DRAB = 0x3a3f36;

/**
 * The paint, drawn once and wrapped round the body: helicopter drab with
 * the panel lines, the anti-glare ahead of the gunner, the low-visibility
 * U.S. ARMY on the boom and the serial on the tail, the walkways on the
 * engine deck.
 */
const apacheSkin = () => cachedSkin('apache', paintApacheSkin);
function paintApacheSkin() {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const row = (z) => (1 - (z - Z0) / (Z1 - Z0)) * H;
  const col = (u) => u * W;
  g.fillStyle = '#3a3f36'; g.fillRect(0, 0, W, H);
  // The nose a shade darker; the anti-glare on top ahead of the windscreen.
  g.fillStyle = '#30352d'; g.fillRect(0, 0, W, row(6.5));
  g.fillStyle = '#1c1f1b';
  g.beginPath(); g.ellipse(col(0.25), (row(6.5) + row(7.0)) / 2, col(0.09), (row(6.5) - row(7.0)) / 2, 0, 0, Math.PI * 2); g.fill();
  // Panel lines: frames and the long seams.
  g.strokeStyle = 'rgba(10,12,10,0.28)'; g.lineWidth = 1.5;
  for (let z = 6.2; z > -8.3; z -= 1.05) { g.beginPath(); g.moveTo(0, row(z)); g.lineTo(W, row(z)); g.stroke(); }
  for (const u of [0.1, 0.4, 0.6, 0.9]) { g.beginPath(); g.moveTo(col(u), row(6.5)); g.lineTo(col(u), H); g.stroke(); }
  const box = (u0, u1, z0, z1) => g.strokeRect(col(u0), row(z1), col(u1 - u0), row(z0) - row(z1));
  g.strokeStyle = 'rgba(10,12,10,0.4)'; g.lineWidth = 1.2;
  box(0.04, 0.1, -3.6, -1.4); box(0.4, 0.46, -3.6, -1.4);
  // Walkways on the engine deck.
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(col(0.2), row(2.6), col(0.1), row(0.0) - row(2.6));
  // U.S. ARMY on the boom and the serial on the tail, low visibility.
  g.fillStyle = '#5a6054'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const u of [0.05, 0.45]) { g.save(); g.translate(col(u), (row(-3.0) + row(-5.8)) / 2); g.rotate(Math.PI / 2); g.fillText('U.S. ARMY', 0, 0); g.restore(); }
  g.font = 'bold 18px sans-serif';
  for (const u of [0.05, 0.45]) { g.save(); g.translate(col(u), (row(-6.3) + row(-7.6)) / 2); g.rotate(Math.PI / 2); g.fillText('0-05588', 0, 0); g.restore(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeApache() {
  const g = new THREE.Group();
  const drab = new THREE.MeshStandardMaterial({ color: DRAB, roughness: 0.8, metalness: 0.2 });
  const skinTex = apacheSkin();
  const skin = skinTex ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.8, metalness: 0.2 }) : drab;
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.55, metalness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e53, roughness: 0.4, metalness: 0.75 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x4a6276, roughness: 0.06, metalness: 0.35, flatShading: true });
  const sensor = new THREE.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.08, metalness: 0.9 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4d5445, roughness: 0.75, metalness: 0.2 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3030 }), green = new THREE.MeshBasicMaterial({ color: 0x40ff70 }), wht = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // ── The body ───────────────────────────────────────────────────────────
  // Narrow and deep, slab-sided, the nose drawn down to the sensor turret,
  // the boom long and slim with a rise to the fin.
  g.add(part(loft([
    { z: 7.30, w: 0.30, h: 0.34, y: -0.02, n: 2.4 },
    { z: 7.00, w: 0.66, h: 0.78, y: 0.02, n: 3.0 },
    { z: 6.50, w: 0.92, h: 1.18, y: 0.08, n: 3.4 },
    { z: 5.60, w: 1.04, h: 1.46, y: 0.12, n: 3.6 },
    { z: 4.60, w: 1.08, h: 1.62, y: 0.18, n: 3.8 },
    { z: 3.20, w: 1.12, h: 1.72, y: 0.22, n: 3.8 },
    { z: 1.60, w: 1.18, h: 1.74, y: 0.26, n: 3.8 },
    { z: 0.20, w: 1.10, h: 1.56, y: 0.30, n: 3.6 },
    { z: -1.40, w: 0.82, h: 1.12, y: 0.42, n: 3.2 },
    { z: -3.00, w: 0.60, h: 0.84, y: 0.52, n: 3.0 },
    { z: -6.00, w: 0.48, h: 0.66, y: 0.62, n: 2.8 },
    { z: -7.60, w: 0.42, h: 0.60, y: 0.72, n: 2.6 },
    { z: -8.35, w: 0.28, h: 0.42, y: 0.78, n: 2.4 },
  ], 16, { uv: true }), skin, 0, 0, 0));

  // The fairing behind the pilot that carries the mast and the engine deck,
  // so the canopy runs back into the body instead of ending in a step.
  g.add(part(loft([
    { z: 3.55, w: 0.90, h: 0.72, y: 1.34, n: 3.0 },
    { z: 2.80, w: 1.02, h: 0.92, y: 1.42, n: 3.2 },
    { z: 1.60, w: 1.08, h: 1.02, y: 1.40, n: 3.4 },
    { z: 0.20, w: 1.02, h: 0.92, y: 1.34, n: 3.2 },
    { z: -1.20, w: 0.70, h: 0.52, y: 1.12, n: 3.0 },
    { z: -2.20, w: 0.30, h: 0.20, y: 0.94, n: 2.6 },
  ], 14), drab, 0, 0, 0));

  // ── The canopy ─────────────────────────────────────────────────────────
  // One run of flat, angled panes: low over the gunner, stepping up over the
  // pilot, and sloping back into the fairing. Eight sides, flat-shaded, so
  // every pane is a flat plate of glass catching its own light.
  g.add(part(loft([
    { z: 6.75, w: 0.46, h: 0.20, y: 0.66, n: 2.0 },
    { z: 6.30, w: 0.92, h: 0.78, y: 0.92, n: 2.0 },
    { z: 5.30, w: 1.00, h: 0.92, y: 1.00, n: 2.0 },
    { z: 5.00, w: 1.00, h: 0.96, y: 1.02, n: 2.0 },
    { z: 4.75, w: 1.02, h: 1.36, y: 1.22, n: 2.0 },
    { z: 3.90, w: 1.02, h: 1.42, y: 1.25, n: 2.0 },
    { z: 3.40, w: 0.90, h: 1.00, y: 1.20, n: 2.0 },
  ], 8), glass, 0, 0, 0));
  // The frames: the windscreen bow, the bow between the seats, the sill
  // along each side and the frame the pilot's glass closes against.
  for (const [z, w, h, y] of [[6.32, 0.95, 0.81, 0.92], [5.02, 1.03, 0.99, 1.02], [4.77, 1.05, 1.39, 1.22], [3.42, 0.93, 1.03, 1.20]]) {
    g.add(part(loft([{ z: z + 0.04, w, h, y, n: 2.0 }, { z: z - 0.04, w, h, y, n: 2.0 }], 8), dark, 0, 0, 0));
  }
  for (const s of [-1, 1]) {
    // The sills, one per seat, stepping up with the canopy.
    g.add(part(new THREE.BoxGeometry(0.05, 0.05, 1.32), dark, s * 0.5, 0.98, 5.65));
    g.add(part(new THREE.BoxGeometry(0.05, 0.05, 1.36), dark, s * 0.51, 1.2, 4.1));
    // The posts that divide each side into its panes.
    g.add(part(new THREE.BoxGeometry(0.04, 0.42, 0.04), dark, s * 0.49, 1.18, 5.7));
    g.add(part(new THREE.BoxGeometry(0.04, 0.62, 0.04), dark, s * 0.5, 1.52, 4.3));
  }
  // The crew: two helmets under the glass, the gunner low, the pilot high.
  for (const [y, z] of [[1.0, 5.6], [1.44, 4.1]]) {
    g.add(part(new THREE.SphereGeometry(0.14, 10, 8), olive, 0, y, z));
    g.add(part(new THREE.BoxGeometry(0.4, 0.42, 0.18), black, 0, y - 0.24, z - 0.24));
  }
  // The wire cutters: a blade on the roof over the pilot, one under the chin.
  g.add(part(new THREE.BoxGeometry(0.04, 0.42, 0.12), dark, 0, 2.08, 4.5, -0.5, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.04, 0.3, 0.1), dark, 0, -0.62, 6.4, 0.6, 0, 0));

  // ── The nose ───────────────────────────────────────────────────────────
  // TADS/PNVS: a compact turret on the very nose, the targeting drum below
  // with its windows in the face and the night sensor in a small dome above.
  g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.46, 16).rotateZ(Math.PI / 2), dark, 0, -0.1, 7.36));
  g.add(part(new THREE.BoxGeometry(0.15, 0.12, 0.08), sensor, -0.1, -0.07, 7.55));
  g.add(part(new THREE.BoxGeometry(0.11, 0.1, 0.08), sensor, 0.11, -0.13, 7.55));
  // The night sensor: a small cone of a dome on top, its window forward.
  g.add(part(new THREE.SphereGeometry(0.12, 12, 10), dark, 0, 0.18, 7.3));
  g.add(part(new THREE.CircleGeometry(0.06, 10), sensor, 0, 0.18, 7.425));
  // Pitot probes either side of the nose.
  for (const s of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6).rotateX(Math.PI / 2), steel, s * 0.38, 0.5, 6.9));

  // ── The avionics bays ──────────────────────────────────────────────────
  // The cheeks: boxes along both sides of the cockpit from just behind the
  // nose back to the wing root, which is what makes the E look so broad
  // head-on. The main gear comes out of them.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 5.70, w: 0.06, h: 0.24, y: -0.10, n: 2.4 },
      { z: 5.25, w: 0.40, h: 0.74, y: -0.12, n: 4.0 },
      { z: 4.50, w: 0.46, h: 0.88, y: -0.12, n: 5.0 },
      { z: 1.40, w: 0.46, h: 0.88, y: -0.10, n: 5.0 },
      { z: 0.60, w: 0.34, h: 0.62, y: -0.06, n: 4.0 },
      { z: 0.15, w: 0.06, h: 0.20, y: 0.00, n: 2.4 },
    ], 16), drab, s * 0.62, 0, 0));
    // A hatch line and the vents on each bay.
    g.add(part(new THREE.BoxGeometry(0.02, 0.62, 0.02), dark, s * 0.86, -0.1, 2.4));
    for (let k = 0; k < 4; k++) g.add(part(new THREE.BoxGeometry(0.02, 0.05, 0.36), black, s * 0.86, 0.12 - k * 0.09, 1.0));
  }

  // ── The gun ────────────────────────────────────────────────────────────
  // The M230 on its turret under the chin. The turret turns on its ring and
  // the barrel elevates in it, so it can point at what it shoots at.
  const gun = new THREE.Group();
  gun.add(part(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 14), dark, 0, 0, 0));
  const elev = new THREE.Group();
  elev.position.set(0, -0.2, 0);
  elev.add(part(new THREE.BoxGeometry(0.3, 0.26, 0.56), dark, 0, 0, 0.1));
  elev.add(part(new THREE.BoxGeometry(0.12, 0.16, 0.5), steel, 0.2, 0.02, -0.05));
  elev.add(part(new THREE.CylinderGeometry(0.05, 0.055, 1.2, 10).rotateX(Math.PI / 2), black, 0, 0, 0.92));
  elev.add(part(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10).rotateX(Math.PI / 2), dark, 0, 0, 1.48));
  // The feed chute from the magazine down to the receiver.
  elev.add(part(new THREE.BoxGeometry(0.1, 0.32, 0.12), steel, -0.18, 0.16, -0.08, 0, 0, 0.3));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 1.56);
  elev.add(muzzle);
  elev.rotation.x = 0.12;
  gun.add(elev);
  gun.position.set(0, -0.78, 5.35);
  gun.name = 'gun';
  gun.userData.pitch = elev;
  gun.userData.muzzle = muzzle;
  g.add(gun);
  g.userData.gun = gun;
  // The turret's fairing under the body.
  g.add(part(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 14), drab, 0, -0.62, 5.35));

  // ── The undercarriage ──────────────────────────────────────────────────
  // Each main leg comes out of the bottom of its bay as one piece: a fairing
  // at the root, the oleo down and out to the wheel on its trailing arm,
  // and the drag brace back to the body. The tail wheel sits on its own
  // short leg under the fin.
  for (const s of [-1, 1]) {
    const rootX = s * 0.78, rootY = -0.5, rootZ = 4.35;
    const wx = s * 1.18, wy = -1.62, wz = 4.0;
    g.add(part(new THREE.BoxGeometry(0.22, 0.2, 0.42), drab, rootX, rootY, rootZ));
    const leg = new THREE.Vector3(wx - rootX, wy + 0.18 - rootY, wz - rootZ);
    const len = leg.length();
    const strut = part(new THREE.CylinderGeometry(0.065, 0.08, len, 10), steel, (rootX + wx) / 2, (rootY + wy + 0.18) / 2, (rootZ + wz) / 2);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), leg.clone().normalize());
    g.add(strut);
    // The oleo's chrome showing below its sleeve.
    const ol = part(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), steel, rootX + leg.x * 0.78, rootY + leg.y * 0.78, rootZ + leg.z * 0.78);
    ol.quaternion.copy(strut.quaternion); g.add(ol);
    // The drag brace, from the body aft of the leg to its middle.
    const b0 = new THREE.Vector3(s * 0.7, -0.42, 3.35), b1 = new THREE.Vector3(rootX + leg.x * 0.55, rootY + leg.y * 0.55, rootZ + leg.z * 0.55);
    const bd = b1.clone().sub(b0);
    const brace = part(new THREE.CylinderGeometry(0.035, 0.035, bd.length(), 8), steel, (b0.x + b1.x) / 2, (b0.y + b1.y) / 2, (b0.z + b1.z) / 2);
    brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bd.normalize());
    g.add(brace);
    // The trailing arm and the wheel on the outside of it.
    g.add(part(new THREE.BoxGeometry(0.08, 0.1, 0.5), steel, wx - s * 0.02, wy + 0.12, wz + 0.2, 0.4, 0, 0));
    g.add(part(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 18).rotateZ(Math.PI / 2), rubber, wx + s * 0.1, wy, wz));
    g.add(part(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 12).rotateZ(Math.PI / 2), steel, wx + s * 0.1, wy, wz));
  }
  g.add(part(new THREE.BoxGeometry(0.16, 0.5, 0.2), steel, 0, 0.2, -6.95));
  g.add(part(new THREE.BoxGeometry(0.08, 0.3, 0.3), steel, 0, -0.08, -7.02, 0.3, 0, 0));
  g.add(part(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12).rotateZ(Math.PI / 2), rubber, 0, -0.2, -7.12));

  // ── The engines ────────────────────────────────────────────────────────
  // Two nacelles high on the shoulders, faired into the deck, a dark intake
  // in each nose, and the suppressors at the back turning the exhaust out.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 2.95, w: 0.66, h: 0.66, n: 2.4 },
      { z: 2.60, w: 0.82, h: 0.84, n: 2.6 },
      { z: 0.60, w: 0.84, h: 0.86, n: 2.8 },
      { z: -0.80, w: 0.74, h: 0.78, n: 2.6 },
      { z: -1.20, w: 0.60, h: 0.64, n: 2.4 },
    ], 14), drab, s * 1.02, 1.02, 0));
    g.add(part(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 14).rotateX(Math.PI / 2), black, s * 1.02, 1.02, 2.96));
    g.add(part(new THREE.ConeGeometry(0.09, 0.2, 10).rotateX(Math.PI / 2), dark, s * 1.02, 1.02, 3.02));
    // The pylon tying it to the body.
    g.add(part(new THREE.BoxGeometry(0.5, 0.36, 3.0), drab, s * 0.7, 0.86, 0.9));
    // The suppressor: a box angled out and up, its outlet a dark slot.
    const ex = new THREE.Group();
    ex.add(part(new THREE.BoxGeometry(0.5, 0.42, 0.9), dark, 0, 0, 0));
    ex.add(part(new THREE.BoxGeometry(0.42, 0.32, 0.04), black, 0, 0, -0.46));
    for (let k = 0; k < 3; k++) ex.add(part(new THREE.BoxGeometry(0.52, 0.03, 0.5), steel, 0, -0.12 + k * 0.12, 0.05));
    ex.position.set(s * 1.24, 1.08, -1.55);
    ex.rotation.set(0.2, s * 0.6, 0);
    g.add(ex);
  }

  // ── The mast, the radar and the rotor ──────────────────────────────────
  g.add(part(new THREE.CylinderGeometry(0.15, 0.2, 0.7, 12), dark, 0, 2.1, 1.6));
  // The Longbow radome on its own short mast over the head.
  g.add(part(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), dark, 0, 2.8, 1.6));
  const dome = part(new THREE.SphereGeometry(0.5, 18, 12), drab, 0, 3.12, 1.6);
  dome.scale.set(1, 0.42, 1);
  g.add(dome);
  const rotor = new THREE.Group();
  rotor.add(part(new THREE.CylinderGeometry(0.34, 0.4, 0.36, 14), dark, 0, 0, 0));
  rotor.add(part(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 12), steel, 0, 0.26, 0));
  for (let k = 0; k < 4; k++) {
    const holder = new THREE.Group();
    // The grip and its pitch horn, then the blade, then the swept tip.
    holder.add(part(new THREE.BoxGeometry(0.7, 0.16, 0.26), dark, 0.55, 0.02, 0));
    holder.add(part(new THREE.BoxGeometry(0.06, 0.18, 0.06), steel, 0.4, -0.12, 0.16));
    holder.add(part(new THREE.BoxGeometry(6.4, 0.07, 0.53), black, 4.1, 0.06, 0));
    const tip = part(new THREE.BoxGeometry(0.62, 0.06, 0.4), black, 7.55, 0.06, -0.14);
    tip.rotation.y = 0.35;
    holder.add(tip);
    holder.rotation.y = (k / 4) * Math.PI * 2;
    rotor.add(holder);
  }
  rotor.add(part(new THREE.CylinderGeometry(7.4, 7.4, 0.04, 28),
    new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0.06, 0));
  rotor.position.set(0, 2.42, 1.6);
  rotor.name = 'rotorA';
  g.add(rotor);

  // ── The stub wings and the stores ──────────────────────────────────────
  // A four-round Hellfire rack inboard, a nineteen-shot rocket pod outboard;
  // the sortie fires the rockets from the outboard pylons.
  pair(g, surface({ span: 2.05, root: 1.10, tip: 0.86, sweep: 0.12, thick: 0.17, ridge: 0.4 }), drab, 0.70, 0.22, 1.85);
  for (const s of [-1, 1]) {
    // The chaff and flare dispensers on the wing root, and the tip lights.
    g.add(part(new THREE.BoxGeometry(0.3, 0.12, 0.4), dark, s * 1.0, 0.34, 1.2));
    g.add(part(new THREE.SphereGeometry(0.05, 6, 4), s > 0 ? red : green, s * 2.78, 0.22, 1.6));
  }
  let hellfire = 0;
  for (const s of [-1, 1]) {
    for (const [x, outboard] of [[1.55, false], [2.45, true]]) {
      g.add(part(new THREE.BoxGeometry(0.14, 0.52, 0.86), drab, s * x, -0.10, 1.35));
      if (!outboard) {
        g.add(part(new THREE.BoxGeometry(0.62, 0.16, 1.30), dark, s * x, -0.40, 1.30));
        for (const dx of [-0.22, 0.22]) {
          for (const dy of [-0.16, -0.60]) {
            const round = new THREE.Group();
            round.add(part(new THREE.CylinderGeometry(0.09, 0.09, 1.63, 10), olive, s * x + dx, -0.40 + dy, 1.20, Math.PI / 2, 0, 0));
            round.add(part(new THREE.SphereGeometry(0.09, 10, 8), sensor, s * x + dx, -0.40 + dy, 2.02));
            for (let k = 0; k < 4; k++) {
              const a = k * Math.PI / 2 + Math.PI / 4;
              round.add(part(new THREE.BoxGeometry(0.02, 0.16, 0.22), dark,
                s * x + dx + Math.cos(a) * 0.14, -0.40 + dy + Math.sin(a) * 0.14, 0.50, 0, 0, a));
              round.add(part(new THREE.BoxGeometry(0.02, 0.12, 0.18), dark,
                s * x + dx + Math.cos(a) * 0.13, -0.40 + dy + Math.sin(a) * 0.13, 1.72, 0, 0, a));
            }
            if (hellfire++ === 0) round.name = 'bomb';
            g.add(round);
          }
        }
      } else {
        g.add(part(new THREE.CylinderGeometry(0.24, 0.24, 1.68, 14), olive, s * x, -0.52, 1.20, Math.PI / 2, 0, 0));
        g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 14), black, s * x, -0.52, 2.05, Math.PI / 2, 0, 0));
        g.add(part(new THREE.CylinderGeometry(0.245, 0.245, 0.06, 14), dark, s * x, -0.52, 1.9, Math.PI / 2, 0, 0));
      }
    }
  }

  // ── The tail ───────────────────────────────────────────────────────────
  // A swept fin standing on the end of the boom, the stabilator across its
  // foot, and the tail rotor high on the port side in the Apache's
  // scissored X, on its gearbox.
  const finMesh = new THREE.Mesh(surface({ span: 2.15, root: 1.6, tip: 0.85, sweep: 0.62, thick: 0.22 }), drab);
  finMesh.position.set(0, 0.95, -6.85);
  finMesh.rotation.z = Math.PI / 2;
  finMesh.castShadow = true;
  g.add(finMesh);
  pair(g, surface({ span: 1.70, root: 0.92, tip: 0.66, sweep: 0.20, thick: 0.14 }), drab, 0.22, 0.72, -7.25);
  const tail = new THREE.Group();
  tail.add(part(new THREE.CylinderGeometry(0.14, 0.14, 0.26, 10), dark, 0, 0, 0, 0, 0, Math.PI / 2));
  for (const a of [0, 0.96, Math.PI, Math.PI + 0.96]) {
    const holder = new THREE.Group();
    holder.add(part(new THREE.BoxGeometry(0.05, 1.38, 0.24), black, 0, 0.72, 0));
    holder.rotation.x = a;
    tail.add(holder);
  }
  tail.add(part(new THREE.CylinderGeometry(1.42, 1.42, 0.04, 20),
    new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, 0, 0, Math.PI / 2));
  tail.position.set(0.34, 2.62, -7.6);
  tail.name = 'tailrotor';
  g.add(tail);
  g.add(part(new THREE.BoxGeometry(0.26, 0.42, 0.62), drab, 0.12, 2.62, -7.6));

  // ── The fuzz ───────────────────────────────────────────────────────────
  // Aerials, the lights, the step on the side.
  for (const [x, y, z, h] of [[0, 1.1, -2.6, 0.32], [0.3, -0.18, -1.6, 0.22], [0, 1.85, 0.3, 0.2]]) g.add(part(new THREE.BoxGeometry(0.04, h, 0.18), dark, x, y, z));
  g.add(part(new THREE.SphereGeometry(0.05, 6, 4), wht, 0, 0.86, -8.38));
  g.add(part(new THREE.SphereGeometry(0.06, 6, 4), red, 0, 1.2, -3.2));
  g.add(part(new THREE.SphereGeometry(0.06, 6, 4), red, 0, -0.32, -0.6));

  // Where the nose art goes: the flat outer face of the avionics bay, behind
  // the gear leg and ahead of the stub wing.
  g.userData.noseArt = { z: 3.15, y: -0.12, w: 1.35 };
  g.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  return bakeAirframe(g);
}
