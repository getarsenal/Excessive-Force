import * as THREE from 'three';
import { part, loft, cachedSkin, bakeAirframe } from './geo.js';

/**
 * CH-47F Chinook. 15.5 m fuselage, two 18.3 m rotors, nose along +Z; port
 * is +X.
 *
 * A box with a rotor at each end: the short pylon over the cockpit and the
 * tall one at the tail are the whole silhouette, with the two engines slung
 * either side of the rear pylon and the sponsons down the sides where the
 * fuel is. The rotor heads are the objects `rotorA` (front) and `rotorB`
 * (rear), spun opposite ways by the sortie; the hook the sling hangs from
 * is at (0, -1.5, -0.5) in the sortie's code and stays there.
 */

const Z0 = -7.8, Z1 = 7.7;

const chinookSkin = () => cachedSkin('chinook', paintChinookSkin);
function paintChinookSkin() {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const row = (z) => (1 - (z - Z0) / (Z1 - Z0)) * H;
  const col = (u) => u * W;
  g.fillStyle = '#4a5443'; g.fillRect(0, 0, W, H);
  // The nose a shade darker; the anti-glare ahead of the windscreen.
  g.fillStyle = '#3d4537'; g.fillRect(0, 0, W, row(6.6));
  g.fillStyle = '#23281f';
  g.beginPath(); g.ellipse(col(0.25), (row(6.6) + row(7.5)) / 2, col(0.09), (row(6.6) - row(7.5)) / 2, 0, 0, Math.PI * 2); g.fill();
  // Panel lines: frames and stringers.
  g.strokeStyle = 'rgba(12,14,10,0.3)'; g.lineWidth = 1.5;
  for (let z = 6; z > -7.8; z -= 1.2) { g.beginPath(); g.moveTo(0, row(z)); g.lineTo(W, row(z)); g.stroke(); }
  for (const u of [0.07, 0.15, 0.35, 0.43, 0.57, 0.65, 0.85, 0.93]) { g.beginPath(); g.moveTo(col(u), row(6.6)); g.lineTo(col(u), H); g.stroke(); }
  // Cabin windows down both sides, round ports; the doors outlined — the
  // forward door and the gun window aft of the nose-art panel.
  g.fillStyle = '#1b2026';
  for (let z = 2.2; z > -4.5; z -= 1.35) { g.beginPath(); g.arc(col(0.05), row(z), 7, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(col(0.45), row(z), 7, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(12,14,10,0.5)'; g.lineWidth = 2;
  const box = (u0, u1, z0, z1) => g.strokeRect(col(u0), row(z1), col(u1 - u0), row(z0) - row(z1));
  box(0.02, 0.09, 1.0, 2.6); box(0.41, 0.48, 1.0, 2.6);
  box(0.66, 0.84, -7.0, -5.0);
  // ARMY on the rear fuselage and the serial, low visibility.
  g.fillStyle = '#6a7360'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const u of [0.055, 0.445]) { g.save(); g.translate(col(u), (row(-2.0) + row(-4.0)) / 2); g.rotate(Math.PI / 2); g.fillText('ARMY', 0, 0); g.restore(); }
  g.font = 'bold 18px sans-serif';
  for (const u of [0.055, 0.445]) { g.save(); g.translate(col(u), (row(-5.0) + row(-6.4)) / 2); g.rotate(Math.PI / 2); g.fillText('08-08772', 0, 0); g.restore(); }
  // Exhaust staining down the rear pylon sides and the walkway on top.
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(col(0.21), row(4.0), col(0.08), row(-4.0) - row(4.0));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeChinook() {
  const g = new THREE.Group();
  const skinTex = chinookSkin();
  const olive = new THREE.MeshStandardMaterial({ color: 0x4a5443, roughness: 0.78, metalness: 0.2 });
  const skin = skinTex ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.78, metalness: 0.2 }) : olive;
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.55, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e53, roughness: 0.4, metalness: 0.75 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.18, metalness: 0.8 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3030 }), green = new THREE.MeshBasicMaterial({ color: 0x40ff70 }), wht = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // The body: the rounded nose, the box of the cabin, the upsweep to the
  // ramp under the rear pylon.
  g.add(part(loft([
    { z: 7.7, w: 0.6, h: 0.6, y: 0.1, n: 2.6 },
    { z: 7.1, w: 2.0, h: 1.9, y: 0.08, n: 2.8 },
    { z: 6.4, w: 3.0, h: 2.6, y: 0.05, n: 3.1 },
    { z: 5.3, w: 3.7, h: 2.9, n: 3.6 },
    { z: 0.0, w: 3.7, h: 2.9, n: 3.7 },
    { z: -5.4, w: 3.7, h: 2.9, n: 3.7 },
    { z: -7.0, w: 3.3, h: 2.6, y: 0.25, n: 3.4 },
    { z: -7.8, w: 2.6, h: 1.4, y: 0.75, n: 3.0 },
  ], 16, { uv: true }), skin, 0, 0, 0));
  // The cockpit: the glazing wrapped round the nose, framed, with the
  // chin windows under it and the wipers.
  g.add(part(loft([
    { z: 7.2, w: 1.6, h: 0.9, y: 0.9, n: 2.6 },
    { z: 6.6, w: 2.9, h: 1.1, y: 0.95, n: 3.0 },
    { z: 5.6, w: 3.2, h: 1.1, y: 0.95, n: 3.4 },
    { z: 5.3, w: 3.1, h: 1.0, y: 0.95, n: 3.4 },
  ], 12), glass, 0, 0, 0));
  for (const x of [-1.2, -0.4, 0.4, 1.2]) g.add(part(new THREE.BoxGeometry(0.07, 1.05, 0.07), dark, x, 0.95, 6.75 - Math.abs(x) * 0.25));
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.07, 1.05, 0.08), dark, s * 1.58, 0.95, 5.9));
    g.add(part(new THREE.BoxGeometry(0.6, 0.5, 0.08), glass, s * 0.8, -0.25, 7.45, 0.3));
  }
  g.add(part(new THREE.BoxGeometry(3.1, 0.08, 1.6), dark, 0, 1.5, 6.1));
  // FLIR turret under the nose and the pitot.
  g.add(part(new THREE.SphereGeometry(0.3, 12, 8), dark, 0.5, -1.1, 6.9));
  g.add(part(new THREE.CylinderGeometry(0.02, 0.03, 0.8, 6).rotateX(Math.PI / 2), steel, -0.6, 0.2, 8.0));
  // Sponsons: rounded fuel tanks down both sides, the main wheels under
  // the rear end of each and the forward wheels under the front.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 5.0, w: 0.5, h: 0.6, n: 2.4 },
      { z: 3.6, w: 1.0, h: 1.1, n: 2.8 },
      { z: -4.0, w: 1.0, h: 1.1, n: 2.8 },
      { z: -5.6, w: 0.5, h: 0.6, n: 2.4 },
    ], 10), olive, s * 2.3, -0.95, -0.4));
    g.add(part(new THREE.BoxGeometry(0.4, 0.14, 0.9), dark, s * 2.3, -0.4, 4.6));
  }
  for (const [x, z] of [[-1.6, 5.4], [1.6, 5.4], [-1.9, -4.6], [1.9, -4.6]]) {
    g.add(part(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 8), dark, x, -1.85, z));
    g.add(part(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12).rotateZ(Math.PI / 2), black, x, -2.3, z));
    g.add(part(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 10).rotateZ(Math.PI / 2), dark, x, -2.3, z));
  }
  // The ramp, up, with its hinge line, and the cargo hook's hatch.
  g.add(part(new THREE.BoxGeometry(2.6, 0.12, 1.6), olive, 0, -0.6, -7.2, 0.9));
  g.add(part(new THREE.BoxGeometry(0.8, 0.06, 0.8), dark, 0, -1.46, -0.5));
  // Pylons: the short one over the cockpit, the tall one at the tail with
  // the two engines slung either side and their exhausts.
  g.add(part(loft([
    { z: 5.6, w: 1.2, h: 0.3, y: 1.55, n: 3.0 },
    { z: 4.8, w: 1.7, h: 1.1, y: 1.95, n: 3.2 },
    { z: 3.6, w: 1.7, h: 1.1, y: 1.95, n: 3.2 },
    { z: 2.8, w: 1.2, h: 0.4, y: 1.6, n: 3.0 },
  ], 10), olive, 0, 0, 0));
  g.add(part(loft([
    { z: -3.4, w: 2.4, h: 0.3, y: 1.55, n: 3.5 },
    { z: -4.4, w: 2.4, h: 1.4, y: 2.1, n: 3.5 },
    { z: -5.6, w: 2.4, h: 2.8, y: 2.8, n: 3.6 },
    { z: -7.4, w: 2.2, h: 3.4, y: 3.2, n: 3.4 },
    { z: -8.2, w: 1.4, h: 2.4, y: 3.6, n: 3.0 },
  ], 12), olive, 0, 0, 0));
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: -3.6, w: 0.7, h: 0.7, n: 2.2 }, { z: -4.6, w: 1.05, h: 1.05, n: 2.4 },
      { z: -6.8, w: 1.0, h: 1.0, n: 2.4 }, { z: -7.6, w: 0.7, h: 0.7, n: 2.2 },
    ], 12), olive, s * 1.9, 2.3, 0));
    g.add(part(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 14).rotateX(Math.PI / 2), black, s * 1.9, 2.3, -3.6));
    g.add(part(new THREE.CylinderGeometry(0.3, 0.26, 0.6, 12).rotateX(Math.PI / 2), dark, s * 1.9, 2.3, -7.9, 0.15, s * 0.3));
    g.add(part(new THREE.BoxGeometry(0.5, 0.6, 2.4), olive, s * 1.3, 2.4, -5.6));
  }
  // Rotors: the head with its three blade grips and the blades, and the
  // disc they read as, at each end; a direct child under its name.
  const rotor = (y, z, name) => {
    const r = new THREE.Group();
    r.add(part(new THREE.CylinderGeometry(0.45, 0.5, 0.5, 12), dark, 0, 0, 0));
    r.add(part(new THREE.CylinderGeometry(0.18, 0.2, 0.5, 10), steel, 0, 0.4, 0));
    for (let k = 0; k < 3; k++) {
      const holder = new THREE.Group();
      holder.add(part(new THREE.BoxGeometry(0.9, 0.26, 0.32), dark, 0.75, 0.05, 0));
      holder.add(part(new THREE.BoxGeometry(0.12, 0.3, 0.12), steel, 0.5, 0.3, 0));
      holder.add(part(new THREE.BoxGeometry(8.1, 0.08, 0.55), black, 5.1, 0.1, 0));
      holder.add(part(new THREE.BoxGeometry(0.5, 0.06, 0.5), black, 9.2, 0.1, 0.02, 0, 0.3, 0));
      holder.rotation.y = (k / 3) * Math.PI * 2;
      r.add(holder);
    }
    r.add(part(new THREE.CylinderGeometry(9.15, 9.15, 0.04, 26),
      new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.2, depthWrite: false }), 0, 0.1, 0));
    r.position.set(0, y, z);
    r.name = name;
    g.add(r);
  };
  rotor(2.75, 4.4, 'rotorA');
  rotor(5.0, -6.6, 'rotorB');
  // The door gun forward to port, aerials, lights.
  g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 8).rotateZ(Math.PI / 2), black, 2.3, 0.3, 1.8, 0, 0.4));
  for (const [x, y, z, h] of [[0, 1.6, 1.5, 0.35], [0.5, 1.6, -1.5, 0.3], [0, -1.5, 3.0, 0.3]]) g.add(part(new THREE.BoxGeometry(0.05, h, 0.4), olive, x, y, z));
  g.add(part(new THREE.SphereGeometry(0.08, 6, 4), red, 2.75, -0.95, 4.6));
  g.add(part(new THREE.SphereGeometry(0.08, 6, 4), green, -2.75, -0.95, 4.6));
  g.add(part(new THREE.SphereGeometry(0.08, 6, 4), wht, 0, 3.6, -8.4));
  g.add(part(new THREE.SphereGeometry(0.08, 6, 4), red, 0, 1.62, -2.0));

  // Where the nose art goes: the flat cabin side behind the cockpit and
  // ahead of the forward door, clear of the sponson below it.
  g.userData.noseArt = { z: 3.95, y: 0.25, w: 2.4 };
  g.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  return bakeAirframe(g);
}
