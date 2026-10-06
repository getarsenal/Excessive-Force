import * as THREE from 'three';
import { part, loft, twoTone, surface, pair, cachedSkin, bakeAirframe } from './geo.js';

/**
 * C-130J Hercules, 29.8 m long, 40.4 m span, nose along +Z; port is +X.
 * And the AC-130J Ghostrider, which is the same airframe with its hold shut,
 * painted gunship grey and armed down the port side.
 *
 * A fat straight tube under a straight wing with four turboprops on it, the
 * flight deck's greenhouse of windows wrapped over the nose, the gear in
 * long blisters down both sides of the belly, a tail that sweeps up to a
 * tall fin — and, on a drop run, the ramp open under it. The props are
 * direct children named `prop`, spun on z by the sortie; the ramp is down
 * for the transport and up for the gunship.
 */

const TRANSPORT = { grey: 0x6d7378, hex: '#6d7378', lines: 'rgba(20,22,26,0.22)', marks: '#4a5057' };
const GUNSHIP = { grey: 0x484e53, hex: '#484e53', lines: 'rgba(200,210,220,0.14)', marks: '#5e646b' };
const Z0 = -14.9, Z1 = 14.9;

const herculesSkin = (S, gunship) => cachedSkin(`hercules:${gunship ? 'gunship' : 'lift'}`, () => paintHerculesSkin(S, gunship));
function paintHerculesSkin(S, gunship) {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 768;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const row = (z) => (1 - (z - Z0) / (Z1 - Z0)) * H;
  const col = (u) => u * W;
  g.fillStyle = S.hex; g.fillRect(0, 0, W, H);
  // The radome, a shade off the body; the anti-glare on top ahead of the
  // windscreen; a darker belly under the hold where the exhaust streaks.
  g.fillStyle = gunship ? '#3f444a' : '#5f656b'; g.fillRect(0, 0, W, row(12.4));
  g.fillStyle = '#2a2d31';
  g.beginPath(); g.ellipse(col(0.25), (row(12.2) + row(13.6)) / 2, col(0.09), (row(12.2) - row(13.6)) / 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(col(0.62), row(9), col(0.26), row(-8) - row(9));
  // Panel lines: the frames every metre and a half and the long stringers.
  g.strokeStyle = S.lines; g.lineWidth = 1.5;
  for (let z = 13; z > -14.9; z -= 1.5) { g.beginPath(); g.moveTo(0, row(z)); g.lineTo(W, row(z)); g.stroke(); }
  for (const u of [0.06, 0.14, 0.2, 0.3, 0.36, 0.44, 0.56, 0.64, 0.7, 0.8, 0.86, 0.94]) { g.beginPath(); g.moveTo(col(u), row(12.4)); g.lineTo(col(u), H); g.stroke(); }
  // Doors, outlined heavier: the crew door forward to port behind the
  // nose-art panel, the paratroop doors aft on both sides, the cargo door
  // and ramp seams under the tail, the gear doors on the blisters.
  const box = (u0, u1, z0, z1) => g.strokeRect(col(u0), row(z1), col(u1 - u0), row(z0) - row(z1));
  g.strokeStyle = gunship ? 'rgba(200,210,220,0.3)' : 'rgba(20,22,26,0.45)'; g.lineWidth = 2;
  box(0.02, 0.08, 5.2, 7.1);
  box(0.02, 0.08, -4.2, -2.2); box(0.42, 0.48, -4.2, -2.2);
  box(0.66, 0.84, -9.6, -5.2);
  // Cabin windows: a row of small ports down each side.
  g.fillStyle = gunship ? '#15181c' : '#1d2126';
  for (let z = 4.0; z > -1.5; z -= 1.4) { g.fillRect(col(0.045) - 5, row(z) - 5, 10, 10); g.fillRect(col(0.455) - 5, row(z) - 5, 10, 10); }
  // The low-visibility star and bar on the aft sides, and the serial on the
  // forward fuselage, both clear of the nose-art panel.
  const star = (cx, cy, r) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.fillRect(cx - r * 2.4, cy - r * 0.45, r * 4.8, r * 0.9);
  };
  g.fillStyle = S.marks;
  for (const u of [0.05, 0.45]) { g.save(); g.translate(col(u), (row(0.5) + row(-1.5)) / 2); g.rotate(Math.PI / 2); star(0, 0, 20); g.restore(); }
  g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const u of [0.05, 0.45]) { g.save(); g.translate(col(u), (row(-5.0) + row(-6.8)) / 2); g.rotate(Math.PI / 2); g.fillText(gunship ? 'USAF' : 'U.S. AIR FORCE', 0, 0); g.restore(); }
  // Walkway lines along the top over the wing.
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.setLineDash([12, 8]);
  for (const u of [0.21, 0.29]) { g.beginPath(); g.moveTo(col(u), row(6)); g.lineTo(col(u), row(-6)); g.stroke(); }
  g.setLineDash([]);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const finSkin = (S, code, serial) => cachedSkin(`hercules-fin:${code}:${serial}`, () => paintFinSkin(S, code, serial));
function paintFinSkin(S, code, serial) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = S.hex; g.fillRect(0, 0, 256, 256);
  g.fillStyle = S.marks; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 96px sans-serif'; g.fillText(code, 128, 100);
  g.fillRect(36, 160, 184, 4);
  g.font = 'bold 30px sans-serif'; g.fillText(serial, 128, 200);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeHercules({ gunship = false } = {}) {
  const S = gunship ? GUNSHIP : TRANSPORT;
  const g = new THREE.Group();
  const skinTex = herculesSkin(S, gunship);
  const skin = skinTex
    ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.7, metalness: 0.25 })
    : new THREE.MeshStandardMaterial({ color: S.grey, roughness: 0.7, metalness: 0.25 });
  const grey = new THREE.MeshStandardMaterial({ color: S.grey, roughness: 0.7, metalness: 0.25 });
  const surf = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0.25 });
  const UP = gunship ? 0x40464b : 0x61676d, LO = gunship ? 0x4e5459 : 0x767c82;
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e53, roughness: 0.4, metalness: 0.75 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.18, metalness: 0.8 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3030 }), green = new THREE.MeshBasicMaterial({ color: 0x40ff70 }), wht = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // The body: radome, the flight deck stepping up to the full tube, the
  // tube, and the upsweep to the tail where the ramp is.
  g.add(part(loft([
    { z: 14.9, w: 0.12, h: 0.12, y: 0.15, n: 2.0 },
    { z: 14.2, w: 1.50, h: 1.50, y: 0.15, n: 2.1 },
    { z: 13.3, w: 2.60, h: 2.60, y: 0.12, n: 2.3 },
    { z: 12.0, w: 3.70, h: 3.80, y: 0.02, n: 2.6 },
    { z: 10.6, w: 4.20, h: 4.30, n: 2.9 },
    { z: 9.8, w: 4.30, h: 4.40, n: 3.0 },
    { z: 3.0, w: 4.30, h: 4.40, n: 3.2 },
    { z: -4.5, w: 4.30, h: 4.40, n: 3.2 },
    { z: -7.5, w: 4.00, h: 3.60, y: 0.55, n: 3.0 },
    { z: -10.5, w: 3.10, h: 2.40, y: 1.45, n: 2.7 },
    { z: -13.2, w: 1.80, h: 1.30, y: 2.25, n: 2.3 },
    { z: -14.9, w: 0.50, h: 0.40, y: 2.60, n: 2.0 },
  ], 16, { uv: true }), skin, 0, 0, 0));
  // The greenhouse: glazing wrapped over the nose, its frames as posts.
  g.add(part(loft([
    { z: 13.0, w: 1.9, h: 0.5, y: 1.15, n: 2.6 },
    { z: 12.3, w: 3.1, h: 0.9, y: 1.3, n: 3.0 },
    { z: 11.1, w: 3.5, h: 1.0, y: 1.35, n: 3.4 },
    { z: 10.6, w: 3.4, h: 0.9, y: 1.4, n: 3.4 },
  ], 12), glass, 0, 0, 0));
  for (const x of [-1.5, -0.95, -0.35, 0.35, 0.95, 1.5]) g.add(part(new THREE.BoxGeometry(0.07, 0.95, 0.07), dark, x, 1.32, 12.3 - Math.abs(x) * 0.22));
  for (const x of [-1.7, -1.0, 0, 1.0, 1.7]) g.add(part(new THREE.BoxGeometry(0.07, 0.95, 0.07), dark, x, 1.36, 11.2));
  g.add(part(new THREE.BoxGeometry(3.4, 0.07, 1.6), dark, 0, 1.86, 11.5));
  // The refuelling probe over the flight deck, to starboard.
  g.add(part(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8).rotateX(Math.PI / 2), steel, -1.0, 2.0, 13.6));
  // The open cargo hold and the ramp down under the tail. A gunship flies
  // with its ramp up: it is not delivering anything.
  if (!gunship) {
    g.add(part(new THREE.BoxGeometry(3.2, 2.5, 1.2), black, 0, 0.25, -7.6));
    const ramp = part(new THREE.BoxGeometry(3.3, 0.24, 4.4), grey, 0, -1.55, -9.6);
    ramp.rotation.x = -0.42;
    g.add(ramp);
    g.add(part(new THREE.BoxGeometry(3.2, 0.2, 1.4), dark, 0, 1.55, -8.9, 0.45));
  }
  // The main gear blisters down both sides of the belly, with the wheel
  // doors and the tyres showing under them.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 5.4, w: 0.4, h: 0.5, n: 2.4 },
      { z: 4.2, w: 1.15, h: 1.35, n: 2.8 },
      { z: -2.0, w: 1.15, h: 1.35, n: 2.8 },
      { z: -3.2, w: 0.5, h: 0.6, n: 2.4 },
    ], 10), grey, s * 2.5, -1.55, 0));
    for (const z of [2.2, 0.2]) g.add(part(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 14).rotateZ(Math.PI / 2), black, s * 2.5, -2.05, z));
  }

  // The wing: high, straight, a little dihedral, over the middle of the
  // tube; dark on top and light below, with the root fairing the body.
  pair(g, twoTone(surface({ span: 20.2, root: 4.9, tip: 2.7, sweep: 0.7, thick: 0.72, dihedral: 0.045 }), UP, LO), surf, 2.0, 1.95, 3.1);
  g.add(part(new THREE.BoxGeometry(4.6, 0.75, 4.9), grey, 0, 1.95, 0.65));
  for (const s of [-1, 1]) {
    const h = part(new THREE.BoxGeometry(14, 0.04, 0.05), dark, s * 11, 2.3, 3.1 - 3.6);
    h.rotation.y = -s * 0.03; g.add(h);
  }
  // Four turboprops: the nacelle ahead of the leading edge with its intake
  // scoop and the exhaust stub out of its side, the six-blade prop on the
  // nose behind a spinner. The prop is a direct child so the sortie finds it.
  for (const x of [-10.6, -5.1, 5.1, 10.6]) {
    g.add(part(loft([
      { z: 5.0, w: 1.10, h: 1.10, n: 2.2 },
      { z: 3.6, w: 1.55, h: 1.65, y: -0.05, n: 2.6 },
      { z: 0.0, w: 1.55, h: 1.65, y: -0.05, n: 2.8 },
      { z: -2.6, w: 1.05, h: 1.35, y: 0.05, n: 2.6 },
    ], 12), grey, x, 1.35, 0));
    g.add(part(new THREE.BoxGeometry(0.7, 0.4, 1.6), grey, x, 2.2, 3.4));
    g.add(part(new THREE.BoxGeometry(0.6, 0.3, 0.1), black, x, 2.2, 4.2));
    g.add(part(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 10).rotateX(Math.PI / 2), dark, x + Math.sign(x) * 0.6, 1.2, -2.6, 0.2));
    const prop = new THREE.Group();
    prop.add(part(new THREE.ConeGeometry(0.34, 0.9, 12).rotateX(Math.PI / 2), grey, 0, 0, 0.55));
    prop.add(part(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 12).rotateX(Math.PI / 2), dark, 0, 0, 0.05));
    for (let k = 0; k < 6; k++) {
      const holder = new THREE.Group();
      const blade = part(new THREE.BoxGeometry(0.34, 1.9, 0.05), black, 0.05, 1.3, 0.2);
      blade.rotation.y = 0.5;
      holder.add(blade);
      holder.rotation.z = (k / 6) * Math.PI * 2;
      prop.add(holder);
    }
    // The disc a spinning prop reads as at any distance.
    prop.add(part(new THREE.CylinderGeometry(2.05, 2.05, 0.05, 20).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.28, depthWrite: false }), 0, 0, 0.25));
    prop.position.set(x, 1.35, 5.1);
    prop.name = 'prop';
    g.add(prop);
  }
  // The external tanks between the engines.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.2, 0.7, 2.0), grey, s * 7.85, 1.2, 1.0));
    g.add(part(loft([
      { z: 4.4, w: 0.12, h: 0.12, n: 2 }, { z: 3.2, w: 1.1, h: 1.1, n: 2 }, { z: 0.0, w: 1.4, h: 1.4, n: 2 },
      { z: -3.0, w: 1.2, h: 1.2, n: 2 }, { z: -4.4, w: 0.2, h: 0.2, n: 2 },
    ], 12), grey, s * 7.85, 0.55, 1.0));
  }

  // The tail: a tall fin on the upswept tail with its rudder and code, the
  // tailplane at its foot, the tail cone.
  const fin = surface({ span: 7.0, root: 6.4, tip: 2.9, sweep: 3.6, thick: 0.5 });
  const finMesh = new THREE.Mesh(fin, grey);
  finMesh.position.set(0, 2.5, -9.9);
  finMesh.rotation.z = Math.PI / 2;
  finMesh.castShadow = true;
  g.add(finMesh);
  const codeTex = finSkin(S, gunship ? 'FT' : 'LR', gunship ? '09-5710' : '08-8601');
  if (codeTex) {
    const codeMat = new THREE.MeshStandardMaterial({ map: codeTex, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), codeMat);
      c.position.set(side * 0.2, 2.5 + 4.6, -9.9 - 2.4 - 2.2);
      c.rotation.y = side * Math.PI / 2;
      g.add(c);
    }
  }
  g.add(part(new THREE.BoxGeometry(0.06, 6.4, 0.05), dark, 0, 2.5 + 3.2, -9.9 - 1.8 - 4.2));
  g.add(part(new THREE.CylinderGeometry(0.2, 0.26, 1.4, 10).rotateX(Math.PI / 2), grey, 0, 2.5 + 7.0, -9.9 - 3.6 - 1.4));
  pair(g, twoTone(surface({ span: 8.0, root: 3.4, tip: 1.7, sweep: 1.3, thick: 0.42 }), UP, LO), surf, 0.5, 2.7, -11.8);
  // Aerials: the blades on the spine and under the belly, the wire's masts.
  for (const [x, y, z, h] of [[0, 2.3, 8.6, 0.4], [0, 2.3, 6.2, 0.3], [0.5, -2.25, 9.0, 0.3], [-0.5, -2.25, 4.0, 0.3], [0, 2.3, -3.0, 0.35]]) g.add(part(new THREE.BoxGeometry(0.05, h, 0.5), grey, x, y, z));
  // Lights: wingtips, tail, beacons top and bottom.
  g.add(part(new THREE.SphereGeometry(0.1, 6, 4), red, 22.1, 2.9, 3.1 - 0.7 - 1.3));
  g.add(part(new THREE.SphereGeometry(0.1, 6, 4), green, -22.1, 2.9, 3.1 - 0.7 - 1.3));
  g.add(part(new THREE.SphereGeometry(0.1, 6, 4), wht, 0, 2.7, -15.1));
  g.add(part(new THREE.SphereGeometry(0.1, 6, 4), red, 0, 2.3, 0.0));
  g.add(part(new THREE.SphereGeometry(0.1, 6, 4), red, 0, -2.25, 0.0));

  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return bakeAirframe(g);
}

/**
 * AC-130J Ghostrider: a Hercules with its hold shut, painted gunship grey,
 * and armed down the left side, which is the side it fights from.
 *
 * The 30 mm GAU-23 is forward of the wheel well, the 105 mm howitzer aft of
 * the wing, both out of the port side at right angles to the run, so the
 * aircraft is seen to be shooting sideways while it rakes the line. The
 * sensor balls hang under the nose and off the port side by the crew door,
 * the satcom radome rides the spine behind the wing, and the wingtips carry
 * the Precision Strike Package pods. Props are named `prop` like the
 * transport's and spin the same way.
 */
export function makeGhostrider() {
  const g = makeHercules({ gunship: true });
  const grey = new THREE.MeshStandardMaterial({ color: 0x484e53, roughness: 0.68, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.55, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.16, metalness: 0.82 });

  // The 30 mm: a cradle through the skin, the barrel out past the fuselage
  // wall with its muzzle brake, a blast deflector plate on the skin aft of it.
  g.add(part(new THREE.BoxGeometry(0.6, 0.7, 0.9), dark, 2.05, -0.55, 6.2));
  g.add(part(new THREE.CylinderGeometry(0.075, 0.085, 1.6, 10), black, 2.95, -0.55, 6.2, 0, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10), dark, 3.62, -0.55, 6.2, 0, 0, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.08, 1.2, 1.6), dark, 2.24, -0.55, 5.1));

  // The 105 mm: the M102's barrel, longer and heavier, out of the aft port
  // side with the recoil housing inboard and a flared muzzle.
  g.add(part(new THREE.BoxGeometry(0.7, 0.9, 1.3), dark, 2.0, -0.45, -5.6));
  g.add(part(new THREE.CylinderGeometry(0.1, 0.12, 2.5, 12), black, 3.4, -0.45, -5.6, 0, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.16, 0.13, 0.4, 12), dark, 4.55, -0.45, -5.6, 0, 0, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.08, 1.4, 2.0), dark, 2.24, -0.45, -6.6));

  // Sensors: the ball under the chin, the second on the port side forward,
  // the flat panel of the electro-optical suite on the crew door.
  g.add(part(new THREE.SphereGeometry(0.52, 14, 10), dark, 0, -2.15, 11.6));
  g.add(part(new THREE.BoxGeometry(0.5, 0.3, 0.3), glass, 0, -2.2, 12.05));
  g.add(part(new THREE.SphereGeometry(0.46, 14, 10), dark, 2.45, -1.0, 8.4));
  g.add(part(new THREE.BoxGeometry(0.28, 0.24, 0.3), glass, 2.85, -1.0, 8.4));
  g.add(part(new THREE.BoxGeometry(0.1, 1.5, 1.0), dark, 2.2, 0.3, 8.6));

  // The satcom radome on the spine, and the antenna farm ahead of it.
  g.add(part(loft([
    { z: -1.0, w: 1.6, h: 0.1, y: 2.2, n: 2.4 },
    { z: -2.0, w: 1.9, h: 0.8, y: 2.35, n: 2.4 },
    { z: -3.2, w: 1.6, h: 0.5, y: 2.3, n: 2.4 },
    { z: -3.8, w: 0.6, h: 0.1, y: 2.2, n: 2.2 },
  ], 12), grey, 0, 0, 0));
  for (const z of [10.6, 9.2, 7.6, 4.8, -5.0, -6.2]) g.add(part(new THREE.BoxGeometry(0.06, 0.34, 0.26), dark, 0.2, 2.35, z));
  for (const z of [6.4, -4.2]) g.add(part(new THREE.BoxGeometry(0.06, 0.3, 0.22), dark, 0.4, -2.35, z));

  // Wingtip pods and the wing-mounted flare dispensers.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.CylinderGeometry(0.36, 0.3, 3.4, 12), grey, s * 22.0, 1.95, 1.2, Math.PI / 2, 0, 0));
    g.add(part(new THREE.SphereGeometry(0.3, 10, 8), dark, s * 22.0, 1.95, 2.9));
    g.add(part(new THREE.BoxGeometry(0.9, 0.36, 0.6), dark, s * 6.9, -1.6, -1.2));
  }
  // The nose art goes ahead of the sensor plate by the crew door, under the
  // flight deck: where the transport carries it, the gunship carries kit.
  g.userData.noseArt = { z: 10.3, y: 0.1, w: 2.5 };
  g.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  return bakeAirframe(g);
}
