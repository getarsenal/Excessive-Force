import * as THREE from 'three';
import { part, loft, surface, pair, cachedSkin, bakeAirframe } from './geo.js';

/**
 * B-1B Lancer, wings swept. 44.5 m long, 24.1 m span, nose along +Z; port
 * is +X.
 *
 * One long blended spindle, waisted where the wings come out of it and
 * drawn to a point at both ends; the chines carrying the blend out
 * sideways so the planform is broad while the side view stays slim; the
 * four windows of the flight deck low on the nose with the little vanes
 * under it; the wings pinned right back into their gloves; four engines in
 * two pods under the blend with their splitter intakes; the tall fin with
 * the stabilators low on it. Gunship grey all over, which is why the panel
 * lines on it are drawn light rather than dark.
 */

const GREY = 0x3a3e43;
const Z0 = -22.3, Z1 = 22.2;

const lancerSkin = () => cachedSkin('lancer', paintLancerSkin);
function paintLancerSkin() {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const row = (z) => (1 - (z - Z0) / (Z1 - Z0)) * H;
  const col = (u) => u * W;
  g.fillStyle = '#3a3e43'; g.fillRect(0, 0, W, H);
  // The radome, a shade lighter and warmer; the tip darker.
  g.fillStyle = '#464a4f'; g.fillRect(0, 0, W, row(18.2));
  g.fillStyle = '#2b2e32'; g.fillRect(0, 0, W, row(21.0));
  // Anti-glare on top ahead of the windscreen.
  g.fillStyle = '#1e2124';
  g.beginPath(); g.ellipse(col(0.25), (row(17.8) + row(20.2)) / 2, col(0.07), (row(17.8) - row(20.2)) / 2, 0, 0, Math.PI * 2); g.fill();
  // Panel lines, light on the dark paint; frames every two metres and the
  // long seams, plus the outlines of the three weapons bays on the belly
  // and the gear doors.
  g.strokeStyle = 'rgba(200,210,220,0.13)'; g.lineWidth = 1.5;
  for (let z = 20; z > -22; z -= 2) { g.beginPath(); g.moveTo(0, row(z)); g.lineTo(W, row(z)); g.stroke(); }
  for (const u of [0.08, 0.17, 0.33, 0.42, 0.58, 0.67, 0.83, 0.92]) { g.beginPath(); g.moveTo(col(u), row(18)); g.lineTo(col(u), H); g.stroke(); }
  g.strokeStyle = 'rgba(200,210,220,0.3)'; g.lineWidth = 2;
  const box = (u0, u1, z0, z1) => g.strokeRect(col(u0), row(z1), col(u1 - u0), row(z0) - row(z1));
  box(0.68, 0.82, 4.0, 10.0); box(0.68, 0.82, -3.0, 3.0); box(0.68, 0.82, -10.0, -4.0);   // the bays
  box(0.72, 0.78, 12.0, 15.0);                                                             // nose gear
  box(0.60, 0.66, -1.0, 4.0); box(0.84, 0.90, -1.0, 4.0);                                  // main gear
  // Darker stains behind the gear and along the bay seams.
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(col(0.68), row(10.0), col(0.14), row(-10.0) - row(10.0));
  // Low-visibility star and bar on the aft sides, and a serial on the
  // forward fuselage, both well behind and ahead of the nose-art panel.
  const star = (cx, cy, r) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.fillRect(cx - r * 2.4, cy - r * 0.45, r * 4.8, r * 0.9);
  };
  g.fillStyle = '#50555b';
  for (const u of [0.02, 0.48]) { g.save(); g.translate(col(u) + (u < 0.1 ? 26 : -26), (row(-6) + row(-9)) / 2); g.rotate(Math.PI / 2); star(0, 0, 24); g.restore(); }
  g.fillStyle = '#5a6066'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
  for (const u of [0.04, 0.46]) { g.save(); g.translate(col(u), (row(0.5) + row(-2.5)) / 2); g.rotate(Math.PI / 2); g.fillText('86-0110', 0, 8); g.restore(); }
  // Formation light strips.
  g.fillStyle = 'rgba(190,220,170,0.5)';
  for (const u of [0.015, 0.485]) { g.fillRect(col(u) - 4, row(-12), 8, row(-15) - row(-12)); g.fillRect(col(u) - 4, row(8), 8, row(5) - row(8)); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const finSkin = (code) => cachedSkin(`lancer-fin:${code}`, () => paintFinSkin(code));
function paintFinSkin(code) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3e43'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#5a6066'; g.font = 'bold 110px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(code, 128, 110);
  g.fillRect(40, 190, 176, 4);
  g.font = 'bold 26px sans-serif'; g.fillText('AF 86 110', 128, 225);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeLancer() {
  const g = new THREE.Group();
  const skinTex = lancerSkin();
  const skin = skinTex
    ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.6, metalness: 0.35 })
    : new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.6, metalness: 0.35 });
  const grey = new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.6, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.5, metalness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x44484d, roughness: 0.4, metalness: 0.75 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.2, metalness: 0.75 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff9a3c, toneMapped: false });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3030 }), green = new THREE.MeshBasicMaterial({ color: 0x40ff70 }), wht = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // One long blended body, squarer through the middle than a spindle so
  // the sides under the flight deck are flat enough to carry the nose art.
  g.add(part(loft([
    { z: 22.2, w: 0.08, h: 0.08, n: 2.0 },
    { z: 20.6, w: 0.70, h: 0.66, n: 2.0 },
    { z: 19.4, w: 1.20, h: 1.08, n: 2.2 },
    { z: 17.6, w: 1.85, h: 1.60, y: 0.03, n: 2.5 },
    { z: 16.0, w: 2.35, h: 2.00, y: 0.05, n: 2.8 },
    { z: 14.0, w: 2.75, h: 2.35, y: 0.05, n: 3.0 },
    { z: 12.0, w: 3.05, h: 2.60, y: 0.05, n: 3.1 },
    { z: 9.0, w: 3.45, h: 2.90, y: 0.02, n: 3.1 },
    { z: 6.0, w: 3.80, h: 3.10, n: 3.1 },
    { z: 0.0, w: 4.35, h: 3.30, n: 3.1 },
    { z: -6.0, w: 4.10, h: 3.15, n: 3.0 },
    { z: -12.0, w: 3.20, h: 2.80, y: 0.10, n: 2.8 },
    { z: -17.0, w: 2.10, h: 2.05, y: 0.25, n: 2.5 },
    { z: -20.0, w: 1.20, h: 1.30, y: 0.33, n: 2.2 },
    { z: -22.3, w: 0.20, h: 0.24, y: 0.35, n: 2.0 },
  ], 16, { uv: true }), skin, 0, 0, 0));
  // Pitot and the refuelling receptacle doors on the nose.
  g.add(part(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 6).rotateX(Math.PI / 2), steel, 0, 0, 22.7));
  g.add(part(new THREE.BoxGeometry(0.9, 0.05, 1.3), grey, 0, 1.02, 18.6));
  // The SMCS vanes under the nose, canted down and out.
  for (const s of [-1, 1]) {
    const v = part(new THREE.BoxGeometry(1.5, 0.08, 0.9), grey, s * 0.95, -0.55, 17.2);
    v.rotation.z = -s * 0.55; g.add(v);
  }

  // The chines: flat shelves that carry the blend out sideways.
  pair(g, surface({ span: 3.4, root: 15.0, tip: 6.5, sweep: 8.5, thick: 0.55 }), skinTex ? grey : grey, 1.9, -0.35, 9.0);

  // Flight deck: a low windscreen rather than a bubble, its four panes
  // framed; the eyebrow windows above.
  g.add(part(loft([
    { z: 17.6, w: 0.5, h: 0.24, y: 1.02, n: 2.6 },
    { z: 16.4, w: 1.55, h: 0.62, y: 1.16, n: 3.0 },
    { z: 14.6, w: 1.95, h: 0.74, y: 1.26, n: 3.2 },
    { z: 12.8, w: 1.70, h: 0.52, y: 1.28, n: 3.4 },
  ], 12), glass, 0, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.08, 0.7, 0.06), dark, 0, 1.3, 16.5));
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.06, 0.66, 0.08), dark, s * 0.8, 1.32, 16.0, 0, 0, s * 0.25));
    g.add(part(new THREE.BoxGeometry(0.06, 0.62, 0.08), dark, s * 0.97, 1.36, 14.6));
  }
  g.add(part(new THREE.BoxGeometry(2.0, 0.08, 0.06), dark, 0, 1.6, 14.6));
  // The dorsal spine, from behind the flight deck to the fin.
  g.add(part(loft([
    { z: 12.5, w: 0.6, h: 0.3, y: 1.45, n: 3.0 },
    { z: 6.0, w: 1.3, h: 0.5, y: 1.62, n: 3.4 },
    { z: -4.0, w: 1.3, h: 0.5, y: 1.62, n: 3.4 },
    { z: -10.0, w: 0.9, h: 0.4, y: 1.5, n: 3.0 },
  ], 10), grey, 0, 0, 0));

  // Wings pinned right back into their gloves, which is how it crosses a
  // target; the gloves are the fairings the wing swings inside.
  pair(g, surface({ span: 9.7, root: 8.2, tip: 2.6, sweep: 18.2, thick: 0.62, dihedral: -0.02 }), grey, 2.25, 0.25, 6.4);
  pair(g, surface({ span: 2.9, root: 9.5, tip: 5.0, sweep: 4.0, thick: 0.9 }), grey, 1.8, 0.35, 8.8);
  // Control surface hinge lines along the wing.
  for (const s of [-1, 1]) {
    const h = part(new THREE.BoxGeometry(7.0, 0.04, 0.06), dark, s * 7.0, 0.3, 6.4 - 12.5);
    h.rotation.y = -s * 1.05; g.add(h);
  }

  // Four engines in two pods under the blend: the splitter intakes at the
  // front, each a dark mouth either side of a plate, the petal nozzles aft.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 2.2, w: 3.55, h: 1.95, n: 3.4 },
      { z: 0.0, w: 3.70, h: 2.05, n: 3.6 },
      { z: -6.5, w: 3.60, h: 2.00, n: 3.6 },
      { z: -8.6, w: 3.40, h: 1.86, n: 3.4 },
      { z: -10.4, w: 3.20, h: 1.70, n: 3.2 },
    ], 12), grey, s * 3.5, -2.05, 0));
    for (const k of [0, 1]) {
      const x = s * (2.6 + k * 1.85);
      // The mouth, with its lip and the splitter wedge.
      g.add(part(new THREE.BoxGeometry(1.5, 1.6, 0.1), black, x, -2.05, 2.2));
      g.add(part(new THREE.BoxGeometry(0.1, 1.6, 1.4), grey, x + s * 0.72, -2.05, 2.6));
      g.add(part(new THREE.BoxGeometry(1.6, 0.08, 0.6), steel, x, -1.25, 2.4, -0.3));
      // The nozzle: the can, its petals and the burner lit.
      g.add(part(new THREE.CylinderGeometry(0.62, 0.72, 1.2, 14).rotateX(Math.PI / 2), dark, x, -2.05, -10.9));
      for (let p = 0; p < 12; p++) {
        const a = p / 12 * Math.PI * 2;
        g.add(part(new THREE.BoxGeometry(0.2, 0.05, 0.5), steel, x + Math.cos(a) * 0.62, -2.05 + Math.sin(a) * 0.62, -11.5, 0, 0, a + Math.PI / 2));
      }
      g.add(part(new THREE.CylinderGeometry(0.5, 0.55, 0.08, 14).rotateX(Math.PI / 2), black, x, -2.05, -11.6));
      const f = new THREE.ConeGeometry(0.58, 5.4, 8);
      f.rotateX(-Math.PI / 2);
      g.add(part(f, glow, x, -2.05, -14.0));
    }
    // The main gear fairing between the pod and the body.
    g.add(part(new THREE.BoxGeometry(0.9, 0.5, 5.0), grey, s * 1.75, -1.75, 0.5));
  }

  // The fin with its code, and the stabilators low on its root; the
  // fairing on the fin tip.
  const fin = surface({ span: 6.6, root: 8.0, tip: 3.0, sweep: 6.2, thick: 0.45 });
  const fm = new THREE.Mesh(fin, grey);
  fm.position.set(0, 1.5, -10.6);
  fm.rotation.z = Math.PI / 2;
  fm.castShadow = true;
  g.add(fm);
  const codeTex = finSkin('EL');
  if (codeTex) {
    const codeMat = new THREE.MeshStandardMaterial({ map: codeTex, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), codeMat);
      c.position.set(side * 0.2, 1.5 + 4.2, -10.6 - 3.9 - 2.0);
      c.rotation.y = side * Math.PI / 2;
      g.add(c);
    }
  }
  g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 10).rotateX(Math.PI / 2), grey, 0, 1.5 + 6.6, -10.6 - 6.2 - 1.3));
  pair(g, surface({ span: 5.3, root: 4.6, tip: 1.8, sweep: 3.9, thick: 0.34 }), grey, 0.9, 1.9, -14.6);
  // Aerials along the spine and under the belly.
  for (const [x, y, z, h] of [[0, 1.9, 2.0, 0.45], [0, 1.85, -6.0, 0.35], [0.6, -1.65, 14.0, 0.3], [-0.6, -1.7, 11.0, 0.3]]) g.add(part(new THREE.BoxGeometry(0.05, h, 0.5), grey, x, y, z));
  // Lights: wingtips, the tail, the beacon on the spine.
  g.add(part(new THREE.SphereGeometry(0.1, 6, 4), red, 11.9, 0.1, 6.4 - 18.2 - 1.3));
  g.add(part(new THREE.SphereGeometry(0.1, 6, 4), green, -11.9, 0.1, 6.4 - 18.2 - 1.3));
  g.add(part(new THREE.SphereGeometry(0.1, 6, 4), wht, 0, 0.5, -22.4));
  g.add(part(new THREE.SphereGeometry(0.09, 6, 4), red, 0, 1.9, 8.0));

  // The nose art: on the flat side under the flight deck, sized to the
  // body's depth there so the picture does not wrap under the belly.
  g.userData.noseArt = { z: 14.0, y: 0.1, w: 3.4 };
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return bakeAirframe(g);
}
