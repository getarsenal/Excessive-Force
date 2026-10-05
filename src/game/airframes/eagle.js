import * as THREE from 'three';
import { part, loft, twoTone, surface, mirrorX, pair, engine } from './geo.js';

/**
 * F-15E Strike Eagle. 19.4 m long, 13.1 m span, nose along +Z; port is +X.
 *
 * What makes it: a round radome running back into a body that squares off
 * and flattens, two square-jawed intakes stood out from it with the
 * conformal tanks on the shoulders above them, a big shoulder-mounted wing
 * cropped square at the tip, twin fins canted a shade outward on the ends
 * of the flat tail deck, and the two nozzles in the tunnel between them.
 * The E is the dark one: the Mod Eagle greys, a two-seat canopy, the tanks,
 * and a belly full of things to drop.
 *
 * The skin is painted onto a canvas and wrapped round the lofted body, the
 * way the Warthog's is: the two greys with a sprayed demarcation, panel
 * lines, the anti-glare panel, the radome, the low-visibility star, the
 * walkway lines on the spine. Nothing on the side under the cockpit, which
 * is where the nose art goes.
 */

const UPPER = 0x5f656d;   // FS 36176, the darker Mod Eagle grey
const LOWER = 0x858b92;   // FS 36251, the lighter
const Z0 = -9.7, Z1 = 9.7;

function eagleSkin() {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const row = (z) => (1 - (z - Z0) / (Z1 - Z0)) * H;
  const col = (u) => u * W;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

  g.fillStyle = hex(LOWER); g.fillRect(0, 0, W, H);
  // Darker above: from a little below the port side, over the top, to a
  // little below starboard; the seam is sprayed, so it is soft.
  g.fillStyle = hex(UPPER); g.fillRect(col(0.04), 0, col(0.42), H);
  for (let k = 0; k < 8; k++) {
    g.fillStyle = `rgba(95,101,109,${0.5 - k * 0.06})`;
    g.fillRect(col(0.04) - (k + 1) * 3, 0, 3, H);
    g.fillRect(col(0.46) + k * 3, 0, 3, H);
  }
  // The radome, a slightly warmer grey, with the tip darker.
  g.fillStyle = '#767b82'; g.fillRect(0, 0, W, row(7.5));
  g.fillStyle = '#4b5057'; g.fillRect(0, 0, W, row(9.1));
  // Anti-glare ahead of the windscreen, on top.
  g.fillStyle = '#2d3135';
  g.beginPath(); g.ellipse(col(0.25), (row(6.0) + row(7.6)) / 2, col(0.065), (row(6.0) - row(7.6)) / 2, 0, 0, Math.PI * 2); g.fill();

  // Panel lines: frames round the body every metre or so, and the long
  // seams along it. Faint; from the air they are texture, not drawing.
  g.strokeStyle = 'rgba(20,22,26,0.2)'; g.lineWidth = 1.5;
  for (const z of [8.4, 7.5, 6.6, 5.6, 4.6, 3.6, 2.4, 1.2, 0.0, -1.2, -2.4, -3.6, -4.8, -6.0, -7.2, -8.4]) {
    g.beginPath(); g.moveTo(0, row(z)); g.lineTo(W, row(z)); g.stroke();
  }
  for (const u of [0.11, 0.19, 0.31, 0.39, 0.61, 0.69, 0.81, 0.89]) {
    g.beginPath(); g.moveTo(col(u), row(7.4)); g.lineTo(col(u), 0 + H); g.stroke();
  }
  // Access panels on the belly and shoulders.
  g.strokeStyle = 'rgba(20,22,26,0.28)'; g.lineWidth = 1.2;
  const panel = (u0, u1, z0, z1) => g.strokeRect(col(u0), row(z1), col(u1 - u0), row(z0) - row(z1));
  panel(0.70, 0.80, 2.6, 4.0); panel(0.70, 0.80, -1.0, 0.6); panel(0.20, 0.30, -3.0, -1.0);
  panel(0.06, 0.12, 3.0, 4.2); panel(0.38, 0.44, 3.0, 4.2);
  // Walkway lines along the spine: two dark dashed rules.
  g.strokeStyle = 'rgba(20,22,26,0.5)'; g.lineWidth = 2; g.setLineDash([10, 8]);
  for (const u of [0.215, 0.285]) { g.beginPath(); g.moveTo(col(u), row(1.6)); g.lineTo(col(u), row(-6.2)); g.stroke(); }
  g.setLineDash([]);
  // Low-visibility star and bar on the aft sides, where the engine bays
  // are, well behind the nose-art panel.
  const star = (cx, cy, r, colr) => {
    g.fillStyle = colr; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.fillRect(cx - r * 2.4, cy - r * 0.45, r * 4.8, r * 0.9);
    g.fillStyle = colr === '#3a3f45' ? hex(UPPER) : colr;
  };
  for (const u of [0.035, 0.465]) {
    g.save(); g.translate(col(u), (row(-2.4) + row(-4.0)) / 2); g.rotate(Math.PI / 2);
    star(0, 0, 22, '#3a3f45'); g.restore();
  }
  // Formation light strips: the pale green panels on the sides, aft.
  g.fillStyle = 'rgba(190,220,170,0.55)';
  g.fillRect(col(0.02), row(-5.4), 10, row(-6.6) - row(-5.4)); g.fillRect(col(0.48) - 10, row(-5.4), 10, row(-6.6) - row(-5.4));
  g.fillRect(col(0.02), row(2.2), 10, row(1.0) - row(2.2)); g.fillRect(col(0.48) - 10, row(2.2), 10, row(1.0) - row(2.2));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The fin: the tail code and the serial, both sides. */
function finSkin(code, serial) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5f656d'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#2b2f33';
  g.font = 'bold 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(code, 128, 100);
  g.font = 'bold 30px sans-serif'; g.fillText(serial, 128, 190);
  g.fillStyle = '#9aa0a7'; g.fillRect(40, 150, 176, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeEagle({ store } = {}) {
  const g = new THREE.Group();
  const skinTex = eagleSkin();
  const skin = skinTex
    ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.66, metalness: 0.3 })
    : new THREE.MeshStandardMaterial({ color: LOWER, roughness: 0.66, metalness: 0.3 });
  const surf = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.66, metalness: 0.3 });
  const upper = new THREE.MeshStandardMaterial({ color: UPPER, roughness: 0.66, metalness: 0.3 });
  const lower = new THREE.MeshStandardMaterial({ color: LOWER, roughness: 0.66, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e53, roughness: 0.4, metalness: 0.75 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0f1113, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.16, metalness: 0.8 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x5e6b3a, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd9dad4, roughness: 0.55, metalness: 0.2 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3030 }), green = new THREE.MeshBasicMaterial({ color: 0x40ff70 }), wht = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // The body: a round radome that squares off as it runs back, ending flat
  // and wide in the tunnel the two nozzles sit either side of.
  g.add(part(loft([
    { z: 9.7, w: 0.06, h: 0.06, n: 2.0 },
    { z: 9.1, w: 0.42, h: 0.40, n: 2.0 },
    { z: 8.4, w: 0.72, h: 0.68, n: 2.1 },
    { z: 7.5, w: 0.98, h: 0.92, n: 2.2 },
    { z: 6.6, w: 1.12, h: 1.04, n: 2.3 },
    { z: 5.6, w: 1.34, h: 1.20, y: 0.03, n: 2.4 },
    { z: 4.6, w: 1.52, h: 1.30, y: 0.04, n: 2.5 },
    { z: 3.4, w: 1.72, h: 1.42, y: 0.04, n: 2.7 },
    { z: 2.4, w: 1.86, h: 1.48, y: 0.04, n: 2.8 },
    { z: 1.2, w: 2.10, h: 1.50, y: 0.02, n: 2.9 },
    { z: 0.4, w: 2.30, h: 1.52, n: 3.0 },
    { z: -2.0, w: 2.72, h: 1.44, y: -0.03, n: 3.4 },
    { z: -4.6, w: 2.92, h: 1.34, y: -0.05, n: 3.8 },
    { z: -7.0, w: 2.90, h: 1.20, y: -0.05, n: 4.0 },
    { z: -9.0, w: 2.70, h: 1.08, y: -0.05, n: 4.0 },
    { z: -9.7, w: 2.52, h: 1.00, y: -0.05, n: 4.0 },
  ], 16, { uv: true }), skin, 0, 0, 0));
  // Pitot out of the radome, and the small blade aerials.
  g.add(part(new THREE.CylinderGeometry(0.02, 0.03, 0.9, 6).rotateX(Math.PI / 2), steel, 0, 0, 10.1));
  g.add(part(new THREE.BoxGeometry(0.04, 0.22, 0.3), lower, 0.3, -0.72, 6.2));
  g.add(part(new THREE.BoxGeometry(0.04, 0.26, 0.4), upper, 0, 0.78, -1.2));
  g.add(part(new THREE.BoxGeometry(0.04, 0.2, 0.3), lower, -0.4, -0.78, -3.4));

  // The canopy, two seats long, with the windscreen bow ahead of it and the
  // frame between the seats; the dark coaming it sits in.
  g.add(part(loft([
    { z: 5.9, w: 0.20, h: 0.12, y: 0.62, n: 2.2 },
    { z: 4.8, w: 0.94, h: 0.56, y: 0.78, n: 2.4 },
    { z: 3.4, w: 1.16, h: 0.74, y: 0.86, n: 2.6 },
    { z: 1.8, w: 1.14, h: 0.70, y: 0.84, n: 2.8 },
    { z: 0.9, w: 0.86, h: 0.40, y: 0.76, n: 3.0 },
  ], 12), glass, 0, 0, 0));
  g.add(part(loft([
    { z: 4.92, w: 0.98, h: 0.60, y: 0.79, n: 2.4 },
    { z: 4.78, w: 1.00, h: 0.62, y: 0.80, n: 2.4 },
  ], 12), dark, 0, 0, 0));
  g.add(part(loft([
    { z: 3.46, w: 1.18, h: 0.76, y: 0.87, n: 2.6 },
    { z: 3.34, w: 1.18, h: 0.76, y: 0.87, n: 2.6 },
  ], 12), dark, 0, 0, 0));
  g.add(part(loft([
    { z: 1.0, w: 0.92, h: 0.44, y: 0.77, n: 3.0 },
    { z: 0.86, w: 0.86, h: 0.38, y: 0.75, n: 3.0 },
  ], 12), dark, 0, 0, 0));
  // Two seats' headrests, dark, under the glass.
  for (const z of [3.9, 2.4]) g.add(part(new THREE.BoxGeometry(0.34, 0.5, 0.28), black, 0, 0.86, z));

  // Intakes: square-jawed, stood out from the body, with the sharp lower
  // lip, the variable ramp hinged down at the top, and a dark throat.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 3.9, w: 1.02, h: 1.34, n: 4.0 },
      { z: 2.6, w: 1.06, h: 1.42, n: 4.0 },
      { z: -0.4, w: 1.10, h: 1.40, n: 4.0 },
      { z: -2.2, w: 1.06, h: 1.30, n: 4.0 },
    ], 10), skinTex ? lower : lower, s * 1.78, -0.12, 0, 0, 0, s * 0.05));
    g.add(part(new THREE.BoxGeometry(0.88, 1.16, 0.08), black, s * 1.78, -0.12, 3.86));
    g.add(part(new THREE.BoxGeometry(1.0, 0.06, 0.5), upper, s * 1.78, 0.52, 4.0, -0.18));
    g.add(part(new THREE.BoxGeometry(1.0, 0.05, 0.3), lower, s * 1.78, -0.78, 4.0));
    // The splitter plate between intake and body.
    g.add(part(new THREE.BoxGeometry(0.06, 1.2, 1.6), dark, s * 1.26, -0.12, 3.3));
    // Conformal tanks along the shoulders: what makes it an E and not a C.
    g.add(part(loft([
      { z: 2.9, w: 0.30, h: 0.34, n: 3.0 },
      { z: 1.6, w: 0.72, h: 0.78, n: 3.4 },
      { z: -2.6, w: 0.76, h: 0.82, n: 3.6 },
      { z: -4.8, w: 0.34, h: 0.42, n: 3.0 },
    ], 10), upper, s * 1.62, 0.30, 0));
  }
  // The speedbrake on the spine, a panel of its own.
  g.add(part(new THREE.BoxGeometry(1.1, 0.05, 2.9), lower, 0, 0.80, -2.1));
  // Gear doors: nose and the two mains, drawn as slightly proud panels.
  g.add(part(new THREE.BoxGeometry(0.5, 0.04, 1.3), lower, 0.15, -0.64, 5.0));
  for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.9, 0.04, 1.7), lower, s * 1.0, -0.76, -0.4));

  // Wing: 45 degrees on the leading edge, cropped square at the tip; dark
  // on top, light underneath. Flap and aileron hinge lines as thin ridges.
  const wing = twoTone(surface({ span: 5.05, root: 5.6, tip: 1.9, sweep: 4.9, thick: 0.34 }), UPPER, LOWER);
  pair(g, wing, surf, 1.42, 0.10, 0.7);
  for (const s of [-1, 1]) {
    const h = part(new THREE.BoxGeometry(2.6, 0.03, 0.05), dark, s * 3.0, 0.14, -2.2);
    h.rotation.y = -s * 0.42; g.add(h);
  }
  // Stabilators, set well aft and a touch below the wing line.
  pair(g, twoTone(surface({ span: 2.85, root: 3.2, tip: 1.1, sweep: 3.0, thick: 0.24 }), UPPER, LOWER), surf, 1.34, -0.18, -5.7);
  // Twin fins, canted out a shade, with the code on both faces and the pods
  // on the tips: the ECM fairing to port, the mass balance to starboard.
  const fin = surface({ span: 3.25, root: 3.5, tip: 1.5, sweep: 2.6, thick: 0.22 });
  const codeTex = finSkin('SJ', '87-0210');
  const codeMat = codeTex ? new THREE.MeshStandardMaterial({ map: codeTex, roughness: 0.7 }) : null;
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(s > 0 ? fin : mirrorX(fin), upper);
    m.position.set(s * 1.44, 0.58, -4.5);
    m.rotation.z = s * (Math.PI / 2 - 0.10);
    m.castShadow = true;
    g.add(m);
    if (codeMat) {
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), codeMat);
        // Up the fin, a little aft of the leading edge, on its cant.
        c.position.set(s * (1.44 + 0.10 * 1.9) + side * 0.12, 0.58 + 1.9, -4.5 - 2.9);
        c.rotation.set(0, side * Math.PI / 2, 0);
        c.rotateX(0); c.rotation.z = 0;
        g.add(c);
      }
    }
    g.add(part(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 10).rotateX(Math.PI / 2), s > 0 ? lower : upper, s * (1.44 + 0.10 * 3.2), 0.58 + 3.22, -4.5 - 2.6 - 0.5));
  }
  // The nozzles: dark cans with the petals round the lip, the burners lit.
  engine(g, dark, glow, 0.92, -0.08, -9.9, 0.60, 1.5, 3.8);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      g.add(part(new THREE.BoxGeometry(0.17, 0.05, 0.5), steel, s * 0.92 + Math.cos(a) * 0.6, -0.08 + Math.sin(a) * 0.6, -10.5, 0, 0, a + Math.PI / 2));
    }
    g.add(part(new THREE.CylinderGeometry(0.46, 0.5, 0.08, 14).rotateX(Math.PI / 2), black, s * 0.92, -0.08, -10.6));
  }
  // The arrester hook under the tail, and the tail boom between the nozzles.
  g.add(part(new THREE.BoxGeometry(0.1, 0.1, 2.2), dark, 0, -0.62, -8.6, 0.12));
  g.add(part(new THREE.BoxGeometry(0.5, 0.5, 2.4), lower, 0, -0.1, -10.2));
  // Lights: red to port, green to starboard, white on the tail, the beacon.
  g.add(part(new THREE.SphereGeometry(0.07, 6, 4), red, 6.4, 0.12, 0.7 - 4.9 - 0.6));
  g.add(part(new THREE.SphereGeometry(0.07, 6, 4), green, -6.4, 0.12, 0.7 - 4.9 - 0.6));
  g.add(part(new THREE.SphereGeometry(0.07, 6, 4), wht, 0, 0.0, -11.4));
  g.add(part(new THREE.SphereGeometry(0.06, 6, 4), red, 0, 0.82, 0.2));

  // The targeting pods under the intakes: a LANTIRN navigation pod to port
  // and the Sniper to starboard, each with a glass window forward.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.12, 0.26, 1.2), lower, s * 1.78, -0.92, 1.4));
    g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 12).rotateX(Math.PI / 2), lower, s * 1.78, -1.16, 1.3));
    g.add(part(new THREE.SphereGeometry(0.2, 12, 8), glass, s * 1.78, -1.16, 2.5));
  }
  // AIM-120s on the corners of the tanks, AIM-9s on the wing rails.
  const amraam = (x, y, z) => {
    g.add(part(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 10).rotateX(Math.PI / 2), white, x, y, z));
    g.add(part(new THREE.ConeGeometry(0.09, 0.5, 10).rotateX(Math.PI / 2), white, x, y, z + 2.05));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.add(part(new THREE.BoxGeometry(0.015, 0.26, 0.5), white, x + Math.cos(a) * 0.17, y + Math.sin(a) * 0.17, z - 1.5, 0, 0, a - Math.PI / 2));
      g.add(part(new THREE.BoxGeometry(0.015, 0.2, 0.5), white, x + Math.cos(a) * 0.15, y + Math.sin(a) * 0.15, z + 0.6, 0, 0, a - Math.PI / 2));
    }
  };
  for (const s of [-1, 1]) {
    amraam(s * 2.1, -0.62, 1.0);
    amraam(s * 2.1, -0.62, -2.6);
    // Wing pylon with the Sidewinder on its rail.
    g.add(part(new THREE.BoxGeometry(0.14, 0.5, 1.6), lower, s * 4.1, -0.2, -1.4));
    g.add(part(new THREE.BoxGeometry(0.12, 0.12, 2.0), dark, s * 4.1, -0.5, -1.3));
    g.add(part(new THREE.CylinderGeometry(0.065, 0.065, 2.8, 8).rotateX(Math.PI / 2), white, s * 4.1, -0.64, -1.0));
    g.add(part(new THREE.ConeGeometry(0.065, 0.4, 8).rotateX(Math.PI / 2), glass, s * 4.1, -0.64, 0.6));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.add(part(new THREE.BoxGeometry(0.015, 0.22, 0.34), white, s * 4.1 + Math.cos(a) * 0.14, -0.64 + Math.sin(a) * 0.14, -2.2, 0, 0, a - Math.PI / 2));
      g.add(part(new THREE.BoxGeometry(0.015, 0.16, 0.3), white, s * 4.1 + Math.cos(a) * 0.12, -0.64 + Math.sin(a) * 0.12, 0.1, 0, 0, a - Math.PI / 2));
    }
    // A 610-gallon tank on the inboard wing pylon.
    g.add(part(new THREE.BoxGeometry(0.16, 0.6, 1.8), lower, s * 2.95, -0.36, -0.2));
    g.add(part(loft([
      { z: 3.2, w: 0.1, h: 0.1, n: 2 }, { z: 2.4, w: 0.62, h: 0.62, n: 2 }, { z: 0.6, w: 0.84, h: 0.84, n: 2 },
      { z: -1.6, w: 0.82, h: 0.82, n: 2 }, { z: -3.0, w: 0.4, h: 0.4, n: 2 }, { z: -3.4, w: 0.12, h: 0.12, n: 2 },
    ], 12), lower, s * 2.95, -0.98, -0.2));
    for (const a of [Math.PI / 4, -Math.PI / 4]) g.add(part(new THREE.BoxGeometry(0.02, 0.4, 0.5), lower, s * 2.95 + Math.cos(a + Math.PI / 2) * 0.3, -0.98 + Math.sin(a + Math.PI / 2) * 0.3, -3.2, 0, 0, a));
  }

  // The bomb on a pylon under the belly, until it is dropped: the group the
  // sortie releases and reads its position from.
  const bomb = new THREE.Group();
  if (store === 'gbu28') {
    // GBU-28: 5.8 m of 0.37 m gun barrel bored out and filled, which is what
    // the first ones were. Longer than the Eagle's belly is deep, so it rides
    // the centreline further down and further forward, with the laser seeker
    // and its canards on the nose and four fins on the tail.
    bomb.add(part(loft([
      { z: 3.0, w: 0.10, h: 0.10, n: 2 }, { z: 2.55, w: 0.34, h: 0.34, n: 2 },
      { z: 2.2, w: 0.38, h: 0.38, n: 2 }, { z: -2.5, w: 0.38, h: 0.38, n: 2 },
      { z: -2.85, w: 0.28, h: 0.28, n: 2 },
    ], 12), olive, 0, 0, 0));
    bomb.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10).rotateX(Math.PI / 2), dark, 0, 0, 3.0));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      bomb.add(part(new THREE.BoxGeometry(0.03, 0.34, 0.36), dark, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 2.05, 0, 0, a - Math.PI / 2));
      bomb.add(part(new THREE.BoxGeometry(0.03, 0.62, 0.7), dark, Math.cos(a) * 0.42, Math.sin(a) * 0.42, -2.35, 0, 0, a - Math.PI / 2));
    }
    bomb.add(part(new THREE.BoxGeometry(0.10, 0.36, 2.2), dark, 0, 0.32, 0.2));
    // A yellow band round the nose: live.
    bomb.add(part(new THREE.CylinderGeometry(0.39, 0.39, 0.08, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8b32a, roughness: 0.6 }), 0, 0, 2.0));
    bomb.position.set(0, -1.15, 0.9);
  } else {
    // GBU-12: the Mk 82 with the Paveway seeker and its canards on the nose
    // and the folding fins on the tail, on its ejector rack.
    bomb.add(part(loft([
      { z: 1.6, w: 0.10, h: 0.10, n: 2 }, { z: 1.2, w: 0.34, h: 0.34, n: 2 },
      { z: -0.9, w: 0.36, h: 0.36, n: 2 }, { z: -1.5, w: 0.22, h: 0.22, n: 2 },
    ], 12), olive, 0, 0, 0));
    bomb.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10).rotateX(Math.PI / 2), dark, 0, 0, 1.62));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      bomb.add(part(new THREE.BoxGeometry(0.02, 0.22, 0.3), dark, Math.cos(a) * 0.22, Math.sin(a) * 0.22, 1.0, 0, 0, a - Math.PI / 2));
      bomb.add(part(new THREE.BoxGeometry(0.02, 0.34, 0.42), olive, Math.cos(a) * 0.3, Math.sin(a) * 0.3, -1.3, 0, 0, a - Math.PI / 2));
    }
    bomb.add(part(new THREE.CylinderGeometry(0.37, 0.37, 0.06, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8b32a, roughness: 0.6 }), 0, 0, 0.9));
    bomb.add(part(new THREE.BoxGeometry(0.10, 0.5, 0.9), dark, 0, 0.42, 0.1));
    bomb.position.set(0, -1.02, 0.4);
  }
  bomb.name = 'bomb';
  g.add(bomb);
  // The nose art: on the flat of the forward fuselage beside the front
  // seat, ahead of the intake, sized to the depth of the body there so the
  // picture does not wrap under the belly.
  g.userData.noseArt = { z: 5.3, y: 0.08, w: 1.9 };

  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

/** For the contact sheet: the Eagle with the bunker buster under it. */
export const makeEagleGbu28 = () => makeEagle({ store: 'gbu28' });
