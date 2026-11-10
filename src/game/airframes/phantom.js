import * as THREE from 'three';
import { part, loft, twoTone, surface, mirrorX, pair, engine, cachedSkin, bakeAirframe } from './geo.js';

/**
 * F-4E Phantom II. 19.2 m long, 11.7 m span; nose along +Z, port is +X.
 *
 * What makes it: a long nose with the gun faired under its chin, a tandem
 * canopy running back into a hump down the spine, big D-shaped intakes with
 * their splitter plates stood off the sides beside the back seat, a low wing
 * whose outer panels turn up twelve degrees past a dog-tooth, the
 * stabilators turned down twenty-three degrees at the tail, one swept fin,
 * and the two J79s' cans under the tail cone. In the South-East Asia scheme:
 * tan and two greens over a pale grey belly.
 *
 * Four napalm canisters on the wing pylons (`can0`..`can3`, dropped port,
 * starboard, port, starboard), a centreline tank and a pair of Sparrows in
 * their belly wells. The side of the nose under the front seat is left for
 * the art.
 */

const TAN = 0x9c8360, GREEN = 0x3e4a33, MEDIUM = 0x5a6542, BELLY = 0xcfcfc6;
const Z0 = -9.4, Z1 = 9.6;

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
/** A fixed shuffle, so every Phantom wears the same pattern. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const phantomSkin = () => cachedSkin('phantom', paintPhantomSkin);
function paintPhantomSkin() {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const row = (z) => (1 - (z - Z0) / (Z1 - Z0)) * H;
  const col = (u) => u * W;
  // The belly grey everywhere, then the camouflage over the top half with a
  // hard, wavy demarcation down each side.
  g.fillStyle = hex(BELLY); g.fillRect(0, 0, W, H);
  const r = rng(4217);
  g.fillStyle = hex(TAN);
  g.beginPath();
  g.moveTo(col(0.0), 0);
  for (let y = 0; y <= H; y += 32) g.lineTo(col(0.035 + r() * 0.025), y);
  for (let y = H; y >= 0; y -= 32) g.lineTo(col(0.465 + r() * 0.025), y);
  g.closePath(); g.fill();
  // The greens: big soft-edged lobes over the tan, the way the pattern was
  // sprayed freehand to a template.
  const blob = (colr, n) => {
    g.fillStyle = colr;
    for (let k = 0; k < n; k++) {
      const u = 0.06 + r() * 0.38, y = r() * H, rw = 40 + r() * 70, rh = 50 + r() * 120;
      g.beginPath();
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
        const w = 0.75 + r() * 0.5;
        g.lineTo(col(u) + Math.cos(a) * rw * w, y + Math.sin(a) * rh * w);
      }
      g.closePath(); g.fill();
    }
  };
  blob(hex(GREEN), 16);
  blob(hex(MEDIUM), 12);
  // The radome is dark, and the anti-glare panel ahead of the screen.
  g.fillStyle = '#34372f'; g.fillRect(0, 0, W, row(8.1));
  g.fillStyle = '#23251f';
  g.beginPath(); g.ellipse(col(0.25), (row(6.2) + row(7.6)) / 2, col(0.07), (row(6.2) - row(7.6)) / 2, 0, 0, Math.PI * 2); g.fill();
  // Panel lines, faint.
  g.strokeStyle = 'rgba(15,16,12,0.22)'; g.lineWidth = 1.5;
  for (const z of [8.1, 7.2, 6.3, 4.6, 3.2, 1.8, 0.4, -1.2, -2.8, -4.4, -5.8, -7.2, -8.4]) {
    g.beginPath(); g.moveTo(0, row(z)); g.lineTo(W, row(z)); g.stroke();
  }
  // The national insignia on the intakes' flanks, aft of the nose-art
  // panel: the star and bar, toned down.
  const star = (cx, cy, rr) => {
    g.fillStyle = '#d8d8d0'; g.beginPath(); g.arc(cx, cy, rr * 1.15, 0, Math.PI * 2); g.fill();
    g.fillRect(cx - rr * 2.4, cy - rr * 0.45, rr * 4.8, rr * 0.9);
    g.fillStyle = '#2a3550'; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? rr * 0.42 : rr; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
    g.closePath(); g.fill();
  };
  for (const u of [0.02, 0.48]) {
    g.save(); g.translate(col(u), row(-3.2)); g.rotate(Math.PI / 2); star(0, 0, 16); g.restore();
  }
  // USAF on the side, just ahead of it, small and black.
  g.fillStyle = 'rgba(15,15,12,0.85)'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
  for (const u of [0.02, 0.48]) { g.save(); g.translate(col(u), row(-0.6)); g.rotate(Math.PI / 2); g.fillText('U.S. AIR FORCE', 0, 6); g.restore(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The fin's code and serial, on a clear ground: the fin's own paint shows round them. */
const finSkin = () => cachedSkin('phantom-fin', paintFinSkin);
function paintFinSkin() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#16170f';
  g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('EF', 128, 104);
  g.font = 'bold 28px sans-serif'; g.fillText('AF 67 291', 128, 186);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _canGeo = null, _canMat = null, _canBand = null;
/**
 * A BLU-27 fire bomb: a finless aluminium tank, round at the nose, tapered
 * at the tail, with the igniter's yellow band. It tumbles when it falls.
 * Geometry and materials are shared by every canister in the battle.
 */
export function makeCanister() {
  if (!_canGeo) {
    _canGeo = loft([
      { z: 1.72, w: 0.08, h: 0.08, n: 2 }, { z: 1.55, w: 0.34, h: 0.34, n: 2 },
      { z: 1.25, w: 0.47, h: 0.47, n: 2 }, { z: -0.9, w: 0.48, h: 0.48, n: 2 },
      { z: -1.45, w: 0.34, h: 0.34, n: 2 }, { z: -1.72, w: 0.1, h: 0.1, n: 2 },
    ], 12);
    _canMat = new THREE.MeshStandardMaterial({ color: 0xb9bcbe, roughness: 0.38, metalness: 0.65 });
    _canBand = new THREE.MeshStandardMaterial({ color: 0xd8b32a, roughness: 0.6 });
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(_canGeo, _canMat);
  body.castShadow = true;
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.1, 12).rotateX(Math.PI / 2), _canBand);
  band.position.z = 1.1;
  g.add(band);
  return g;
}

export function makePhantom() {
  const g = new THREE.Group();
  const skinTex = phantomSkin();
  const skin = skinTex
    ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.72, metalness: 0.2 })
    : new THREE.MeshStandardMaterial({ color: TAN, roughness: 0.72, metalness: 0.2 });
  const surf = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0.2 });
  const tan = new THREE.MeshStandardMaterial({ color: TAN, roughness: 0.72, metalness: 0.2 });
  const green = new THREE.MeshStandardMaterial({ color: GREEN, roughness: 0.72, metalness: 0.2 });
  const medium = new THREE.MeshStandardMaterial({ color: MEDIUM, roughness: 0.72, metalness: 0.2 });
  const belly = new THREE.MeshStandardMaterial({ color: BELLY, roughness: 0.6, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.5, metalness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x6b6a66, roughness: 0.42, metalness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0f100d, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.16, metalness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd9dad4, roughness: 0.55, metalness: 0.2 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3030 }), grn = new THREE.MeshBasicMaterial({ color: 0x40ff70 }), wht = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // The body: a pointed radome drooping a shade, a deep forward fuselage,
  // widest over the intakes and the wing, then tapering up and away to a
  // tail cone that sits over the engines.
  g.add(part(loft([
    { z: 9.6, w: 0.06, h: 0.06, y: -0.12, n: 2.0 },
    { z: 9.0, w: 0.44, h: 0.42, y: -0.1, n: 2.0 },
    { z: 8.0, w: 0.80, h: 0.78, y: -0.08, n: 2.1 },
    { z: 7.0, w: 1.02, h: 1.02, y: -0.05, n: 2.2 },
    { z: 6.0, w: 1.14, h: 1.18, y: -0.02, n: 2.3 },
    { z: 5.0, w: 1.22, h: 1.32, y: 0.02, n: 2.4 },
    { z: 4.0, w: 1.28, h: 1.44, y: 0.04, n: 2.6 },
    { z: 2.8, w: 1.34, h: 1.52, y: 0.04, n: 2.8 },
    { z: 1.5, w: 1.50, h: 1.52, y: 0.02, n: 3.0 },
    { z: 0.0, w: 1.72, h: 1.48, y: 0.0, n: 3.2 },
    { z: -2.0, w: 1.82, h: 1.42, y: -0.04, n: 3.3 },
    { z: -4.0, w: 1.72, h: 1.32, y: -0.04, n: 3.3 },
    { z: -5.6, w: 1.50, h: 1.16, y: 0.02, n: 3.0 },
    { z: -7.0, w: 1.08, h: 0.84, y: 0.2, n: 2.6 },
    { z: -8.4, w: 0.58, h: 0.48, y: 0.38, n: 2.4 },
    { z: -9.4, w: 0.16, h: 0.16, y: 0.46, n: 2.0 },
  ], 16, { uv: true }), skin, 0, 0, 0));
  // The pitot, and the M61's fairing under the chin with its muzzle.
  g.add(part(new THREE.CylinderGeometry(0.02, 0.03, 0.8, 6).rotateX(Math.PI / 2), metal, 0, -0.12, 10.0));
  g.add(part(loft([
    { z: 8.7, w: 0.12, h: 0.1, n: 2.2 }, { z: 8.3, w: 0.36, h: 0.3, n: 2.4 },
    { z: 5.6, w: 0.42, h: 0.34, n: 2.6 }, { z: 4.4, w: 0.12, h: 0.1, n: 2.2 },
  ], 10), belly, 0, -0.62, 0));
  g.add(part(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateX(Math.PI / 2), black, 0, -0.62, 8.72));
  g.userData.gunPort = { x: 0, y: -0.62, z: 8.75 };

  // The canopy: two seats in tandem, the back one a little higher, with the
  // frames across and the hump down the spine behind.
  g.add(part(loft([
    { z: 5.8, w: 0.18, h: 0.12, y: 0.64, n: 2.2 },
    { z: 5.0, w: 0.88, h: 0.54, y: 0.8, n: 2.4 },
    { z: 3.6, w: 0.98, h: 0.66, y: 0.88, n: 2.6 },
    { z: 2.4, w: 0.98, h: 0.72, y: 0.93, n: 2.7 },
    { z: 1.5, w: 0.86, h: 0.56, y: 0.9, n: 2.8 },
  ], 12), glass, 0, 0, 0));
  for (const z of [5.0, 3.6, 2.4]) g.add(part(loft([
    { z: z + 0.07, w: 0.94, h: 0.62, y: 0.86, n: 2.5 }, { z: z - 0.07, w: 0.94, h: 0.62, y: 0.86, n: 2.5 },
  ], 12), dark, 0, 0, 0));
  for (const z of [4.3, 2.9]) g.add(part(new THREE.BoxGeometry(0.32, 0.46, 0.26), black, 0, 0.9, z));
  g.add(part(loft([
    { z: 1.7, w: 0.5, h: 0.42, y: 0.84, n: 2.6 },
    { z: 0.0, w: 0.62, h: 0.46, y: 0.82, n: 2.8 },
    { z: -3.0, w: 0.56, h: 0.40, y: 0.72, n: 2.8 },
    { z: -5.4, w: 0.36, h: 0.3, y: 0.62, n: 2.6 },
    { z: -6.4, w: 0.12, h: 0.1, y: 0.58, n: 2.2 },
  ], 10), green, 0, 0, 0));

  // Intakes: D-shaped, beside the back seat, the splitter plate stood off
  // the body ahead of each with its holes, the dark throat inside.
  for (const s of [-1, 1]) {
    // Faired into the body: rounded on the outside, the top a shade under
    // the fuselage's shoulder, running back and in to nothing over the wing.
    g.add(part(loft([
      { z: 3.4, w: 0.74, h: 1.06, y: 0.0, n: 2.6 },
      { z: 2.4, w: 0.86, h: 1.12, y: -0.02, n: 2.7 },
      { z: 0.4, w: 0.84, h: 1.06, y: -0.06, n: 2.7 },
      { z: -1.6, w: 0.6, h: 0.84, y: -0.1, n: 2.6 },
      { z: -3.2, w: 0.2, h: 0.4, y: -0.14, n: 2.4 },
    ], 12), medium, s * 0.92, -0.16, 0));
    g.add(part(new THREE.BoxGeometry(0.56, 0.9, 0.06), black, s * 0.98, -0.16, 3.38));
    // The splitter plate stood off the body ahead of the mouth.
    g.add(part(new THREE.BoxGeometry(0.035, 1.02, 1.3), medium, s * 0.64, -0.14, 3.35, 0, s * 0.05, 0));
    g.add(part(new THREE.BoxGeometry(0.66, 0.04, 0.3), belly, s * 0.92, -0.68, 3.2));
  }

  // The wing: the inner panel flat with a straight trailing edge, the outer
  // panel kinked up past a dog-tooth, camouflaged above and pale below.
  const inner = twoTone(surface({ span: 2.95, root: 5.6, tip: 2.7, sweep: 2.95, thick: 0.4 }), MEDIUM, BELLY);
  pair(g, inner, surf, 0.82, -0.36, 1.6);
  const outer = twoTone(surface({ span: 2.2, root: 2.85, tip: 1.45, sweep: 2.0, thick: 0.22, dihedral: 0.21 }), GREEN, BELLY);
  pair(g, outer, surf, 3.75, -0.36, -1.1);
  // The stabilators, turned down, and the fin.
  pair(g, twoTone(surface({ span: 2.75, root: 2.6, tip: 1.05, sweep: 1.9, thick: 0.16, dihedral: -0.4 }), GREEN, BELLY), surf, 0.42, 0.32, -6.6);
  const finGeo = surface({ span: 3.1, root: 4.3, tip: 1.3, sweep: 3.1, thick: 0.18 });
  const fin = new THREE.Mesh(finGeo, tan);
  fin.position.set(0.0, 0.66, -4.3);
  fin.rotation.z = Math.PI / 2;
  fin.castShadow = true;
  g.add(fin);
  const codeTex = finSkin();
  if (codeTex) {
    const codeMat = new THREE.MeshStandardMaterial({ map: codeTex, roughness: 0.75, transparent: true, alphaTest: 0.4, depthWrite: false });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), codeMat);
      p.position.set(side * 0.1, 0.66 + 1.4, -4.3 - 2.6);
      p.rotation.y = side * Math.PI / 2;
      g.add(p);
    }
  }
  // The RWR bullet on the fin tip.
  g.add(part(new THREE.CylinderGeometry(0.11, 0.11, 1.2, 10).rotateX(Math.PI / 2), dark, 0, 0.66 + 3.08, -4.3 - 3.1 - 0.5));

  // The J79s: two cans under the tail cone, the burners lit; the smoke they
  // are famous for is the sortie's.
  engine(g, metal, glow, 0.55, -0.42, -8.3, 0.46, 1.3, 2.6);
  for (const s of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.4, 0.44, 0.08, 14).rotateX(Math.PI / 2), black, s * 0.55, -0.42, -8.95));
  // The hook, the gear doors, the lights.
  g.add(part(new THREE.BoxGeometry(0.1, 0.1, 2.0), dark, 0, -0.6, -7.4, 0.14));
  for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.8, 0.04, 1.5), belly, s * 1.9, -0.55, -0.6));
  g.add(part(new THREE.SphereGeometry(0.07, 6, 4), red, 6.0, 0.15, -3.8));
  g.add(part(new THREE.SphereGeometry(0.07, 6, 4), grn, -6.0, 0.15, -3.8));
  g.add(part(new THREE.SphereGeometry(0.07, 6, 4), wht, 0, 0.5, -9.5));
  g.add(part(new THREE.SphereGeometry(0.06, 6, 4), red, 0, 0.84, -1.0));

  // Under it: the centreline tank, the Sparrows in their wells, and the
  // pylons with the canisters.
  g.add(part(new THREE.BoxGeometry(0.16, 0.36, 1.6), belly, 0, -0.86, 0.3));
  g.add(part(loft([
    { z: 2.9, w: 0.1, h: 0.1, n: 2 }, { z: 2.1, w: 0.7, h: 0.7, n: 2 }, { z: 0.6, w: 0.86, h: 0.86, n: 2 },
    { z: -1.6, w: 0.84, h: 0.84, n: 2 }, { z: -2.6, w: 0.42, h: 0.42, n: 2 }, { z: -2.9, w: 0.1, h: 0.1, n: 2 },
  ], 12), belly, 0, -1.42, 0.2));
  for (const s of [-1, 1]) {
    g.add(part(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 10).rotateX(Math.PI / 2), white, s * 0.6, -0.78, -3.0));
    g.add(part(new THREE.ConeGeometry(0.1, 0.4, 10).rotateX(Math.PI / 2), white, s * 0.6, -0.78, -1.0));
  }
  const racks = [[2.2, -0.2], [-2.2, -0.2], [3.45, -0.75], [-3.45, -0.75]];
  racks.forEach(([x, z], k) => {
    g.add(part(new THREE.BoxGeometry(0.14, 0.46, 1.5), belly, x, -0.6, z));
    const can = makeCanister();
    can.name = `can${k}`;
    can.position.set(x, -1.12, z);
    g.add(can);
  });
  // The nose art: the flat of the nose under the front seat.
  g.userData.noseArt = { z: 6.0, y: -0.05, w: 1.6 };

  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return bakeAirframe(g);
}
