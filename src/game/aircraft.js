import { decorate } from './noseart.js';
import * as THREE from 'three';
import { releaseTree } from '../core/release.js';
import { flyby, crack } from '../core/synth.js';

/**
 * The air wing.
 *
 * Two aircraft the player can call rather than place: a Strike Eagle on a
 * low pass with a 500 lb bomb, and a Lancer at height with the MOAB. Each
 * call is a sortie — the aircraft comes in from behind the camera so the
 * player sees it cross the target, releases where the ballistics say the
 * bomb will land on the point, flies through, pulls up and leaves.
 *
 * The aircraft are built here rather than loaded. They are seen for a few
 * seconds at a few hundred metres, and what carries an airframe at that
 * range is its silhouette against the sky: the F-15 is twin tails over a
 * flat tunnel between square intakes, the B-1 a long blended spindle with
 * the wings pinned right back. So the bodies are lofted — a run of cross
 * sections down the length, skinned — rather than assembled from cylinders,
 * because the shape between the sections is where an aircraft stops looking
 * like plumbing. Both are under a thousand triangles.
 *
 * Real dimensions throughout, in metres: the Eagle is 19.4 long on a 13.1
 * span, the Lancer 44.5 on 24.1 with the wings swept.
 *
 * Both are built nose along +Z, which is the axis the sortie flies down.
 */

/** The pitch of the roar for each airframe: the rocket clip slowed down. */
/** Half-spans, for the vapour off the wings. */
const WINGSPAN = { eagle: 6.5, lancer: 12, warthog: 8.5 };
const STRIKE_RATE = { lancer: 0.42, ghostrider: 0.38, apache: 0.3, tomahawk: 0.62, warthog: 0.48 };

import { part, loft, twoTone, surface, solid, mirrorX, pair, engine, cachedSkin, bakeAirframe } from './airframes/geo.js';
export { part, loft, twoTone, surface, mirrorX, pair };

export { makeEagle } from './airframes/eagle.js';
import { makeEagle } from './airframes/eagle.js';

/**
 * The Warthog's paint, drawn once onto a canvas and wrapped round the body.
 *
 * `loft` with `uv` unwraps the fuselage so that u runs round the section
 * from the port side (0) over the top (0.25) to starboard (0.5) and under
 * the belly (0.75), and v runs from the tail (0) to the nose (1). On the
 * canvas the nose is the top edge. What is painted on: the two greys of the
 * Compass Ghost scheme, dark above and light below; the false canopy on the
 * belly under the real one, which is there to confuse a gunner about which
 * way the aircraft is about to turn; the anti-glare panel ahead of the
 * windscreen; low-visibility stars on the shoulders; and, because it is the
 * most recognisable nose art of the last fifty years, the shark mouth and
 * eyes that the 23rd Wing has worn since the Flying Tigers.
 */
export const warthogSkin = (z0, z1) => cachedSkin(`warthog:${z0}:${z1}`, () => paintWarthogSkin(z0, z1));
function paintWarthogSkin(z0, z1) {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // Length to canvas row: the nose at the top.
  const row = (z) => (1 - (z - z0) / (z1 - z0)) * H;
  const col = (u) => u * W;

  ctx.fillStyle = '#878e93';                 // the lighter grey, FS 36375
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#5a6166';                 // the darker, FS 36118
  ctx.fillRect(0, 0, col(0.52), H);          // the upper half, port round to starboard
  ctx.fillRect(col(0.98), 0, W, H);          // and the sliver past the seam
  // A soft edge where the two meet, as the real demarcation is sprayed.
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = `rgba(90,97,102,${0.5 - k * 0.08})`;
    ctx.fillRect(col(0.52) + k * 3, 0, 3, H);
    ctx.fillRect(col(0.98) - (k + 1) * 3, 0, 3, H);
  }

  // The anti-glare panel on the nose ahead of the windscreen.
  ctx.fillStyle = '#34383c';
  ctx.beginPath();
  ctx.ellipse(col(0.25), (row(6.5) + row(7.5)) / 2, col(0.07), (row(6.5) - row(7.5)) / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // The false canopy on the belly: the same dark glass shape as the real one
  // on top, under the nose where a gunner looking up sees it.
  ctx.fillStyle = '#3d4247';
  ctx.beginPath();
  ctx.ellipse(col(0.75), (row(4.2) + row(5.6)) / 2, col(0.06), (row(4.2) - row(5.6)) / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // The mouth. In side view it is a wedge: the upper lip runs straight back
  // along the side at about the height of the gun, the lower jaw sweeps from
  // under the chin down and back, and the two meet at the corner of the jaw
  // under the windscreen. Unwrapped, that is a region bounded by the angle
  // round the body below the side — nought at the upper lip, ninety at the
  // keel — which opens from nothing at the corner to the whole chin at the
  // nose, where the two halves join. `side` is +1 for starboard (u from 0.5
  // down to 0.75) and -1 for port (u from 1.0 down to 0.75).
  const zt = 7.95, zc = 5.75;
  const uAt = (side, deg) => (side > 0 ? 0.5 + deg / 360 : 1.0 - deg / 360);
  const jaw = (z) => 8 + 82 * Math.pow(THREE.MathUtils.clamp((z - zc) / (zt - zc), 0, 1), 0.55);
  const lip = -4;                                    // the upper lip, a touch above the side
  const face = (side) => {
    ctx.beginPath();
    ctx.moveTo(col(uAt(side, lip)), row(zt));
    for (let i = 0; i <= 30; i++) ctx.lineTo(col(uAt(side, lip)), row(zt - (zt - zc) * (i / 30)));
    for (let i = 30; i >= 0; i--) {
      const z = zt - (zt - zc) * (i / 30);
      ctx.lineTo(col(uAt(side, jaw(z))), row(z));
    }
    ctx.closePath();
    ctx.fillStyle = '#a3121c';
    ctx.fill();
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 4;
    ctx.stroke();
    // Teeth. Down from the upper lip, a row of white triangles pointing
    // into the mouth; up from the lower jaw, another, smaller toward the
    // corner where the jaw closes.
    ctx.fillStyle = '#f2f0ea';
    ctx.lineWidth = 2;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const za = zt - (zt - zc) * (i / n) * 0.92, zb = zt - (zt - zc) * ((i + 1) / n) * 0.92;
      const zm = (za + zb) / 2;
      const open = jaw(zm) - lip;
      ctx.beginPath();
      ctx.moveTo(col(uAt(side, lip)), row(za));
      ctx.lineTo(col(uAt(side, lip)), row(zb));
      ctx.lineTo(col(uAt(side, lip + open * 0.42)), row(zm));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(col(uAt(side, jaw(za))), row(za));
      ctx.lineTo(col(uAt(side, jaw(zb))), row(zb));
      ctx.lineTo(col(uAt(side, jaw(zm) - open * 0.38)), row(zm));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // The eye, above and ahead of the corner of the jaw, glaring forward.
    {
    const x = col(uAt(side, -26)), y = row(6.55);
    const rx = col(0.034), ry = (row(6.25) - row(6.85)) / 2;
    ctx.fillStyle = '#f2f0ea';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 4; ctx.stroke();
    // The pupil toward the nose, which on the canvas is up.
    ctx.fillStyle = '#141414';
    ctx.beginPath(); ctx.ellipse(x, y - ry * 0.35, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    // The brow, cutting across the top of the eye toward the nose: an angry
    // eye rather than a surprised one.
    ctx.fillStyle = '#5a6166';
    ctx.beginPath();
    const top = side > 0 ? -1 : 1;                    // which way is up the side
    ctx.moveTo(x + top * rx * 1.3, y - ry * 1.3);
    ctx.lineTo(x + top * rx * 1.3, y + ry * 0.2);
    ctx.lineTo(x + top * rx * 0.1, y - ry * 1.3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + top * rx * 1.25, y + ry * 0.15); ctx.lineTo(x + top * rx * 0.05, y - ry * 1.25); ctx.stroke();
  }
  };
  // Port runs across the seam at u = 1, so it is drawn a turn to the left as
  // well and whatever falls off one edge comes back on the other.
  face(1);
  face(-1);
  ctx.save(); ctx.translate(-W, 0); face(-1); ctx.restore();

  // Low-visibility national insignia on the shoulders, above the wing root:
  // the star in its disc with a bar either side, the bars running fore and
  // aft. Drawn in metres — the canvas has about six times as many pixels a
  // metre round the body as along it, so a star drawn in pixels comes out
  // as a tall thin letter.
  const around = W / 5.4, along = H / (z1 - z0);
  const star = (side, zc, deg, r) => {
    ctx.save();
    // p metres along the body toward the nose, q metres up the side.
    const sgn = side > 0 ? -1 : 1;
    ctx.transform(0, -along, sgn * around, 0, col(uAt(side, -deg)), row(zc));
    ctx.fillStyle = '#7d858a';
    ctx.fillRect(-r * 2.4, -r * 0.42, r * 4.8, r * 0.84);               // the bars
    ctx.fillStyle = '#5a6166';
    ctx.fillRect(-r * 2.4, -r * 0.12, r * 4.8, r * 0.24);               // the stripe through them
    ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2); ctx.fill(); // the disc
    ctx.fillStyle = '#7d858a';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;                       // point up the side
      const rr = i % 2 ? r * 0.38 : r * 0.92;
      ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a));
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  star(1, 2.6, -14, 0.36);
  star(-1, 2.6, -14, 0.36);
  ctx.save(); ctx.translate(-W, 0); star(-1, 2.6, -14, 0.36); ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The two letters on the fin: the 23rd Wing's tail code. */
const tailCode = (text) => cachedSkin(`warthog-tail:${text}`, () => paintTailCode(text));
function paintTailCode(text) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a6166'; ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#2b2f33';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A-10C Thunderbolt II. 16.3 m long, 17.5 m span, nose along +Z; port is +X.
 *
 * Nothing else in the sky looks like it, which is why it is worth getting
 * right rather than roughly right. What makes it: a slab-sided tub of a
 * fuselage with a great bubble canopy up front and the seven barrels of the
 * gun out of the nose, off-centre so the one that fires is on the
 * centreline; a straight, thick, low wing with the main-gear pods hanging
 * off its leading edge and the tips turned down; two high-bypass fans in
 * pods up on the back, set between the wing and the tail so the tailplane
 * hides the hot end; and square twin fins on the ends of the stabiliser,
 * hanging below it as well as standing above. The TF34 does not glow — it
 * is an airliner engine — so there is no flame here, only a dark fan face
 * at the front and a tail cone at the back. Everything about it is
 * subsonic and deliberate, and it is drawn that way.
 */
export function makeWarthog() {
  const g = new THREE.Group();
  const UPPER = 0x5a6166, LOWER = 0x878e93;
  const skinTex = warthogSkin(-8.1, 8.13);
  const skin = skinTex
    ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.72, metalness: 0.2 })
    : new THREE.MeshStandardMaterial({ color: LOWER, roughness: 0.72, metalness: 0.2 });
  // Flying surfaces: dark on top, light underneath, by vertex colour.
  const surf = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0.2 });
  const upper = new THREE.MeshStandardMaterial({ color: UPPER, roughness: 0.72, metalness: 0.2 });
  const lower = new THREE.MeshStandardMaterial({ color: LOWER, roughness: 0.72, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3c4044, roughness: 0.45, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x27394c, roughness: 0.15, metalness: 0.75 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x5e6b3a, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd9dad4, roughness: 0.55, metalness: 0.2 });

  // The fuselage: a blunt nose, flat sides where the titanium tub is, and a
  // long gentle taper to a tail that keeps its depth until the last metre.
  g.add(part(loft([
    { z: 8.13, w: 0.34, h: 0.34, y: -0.04, n: 2.0 },
    { z: 7.85, w: 0.78, h: 0.80, y: -0.04, n: 2.2 },
    { z: 7.20, w: 1.18, h: 1.24, y: 0.00, n: 2.6 },
    { z: 6.40, w: 1.46, h: 1.58, y: 0.08, n: 3.0 },
    { z: 4.80, w: 1.56, h: 1.72, y: 0.12, n: 3.2 },
    { z: 2.60, w: 1.56, h: 1.68, y: 0.10, n: 3.2 },
    { z: 0.00, w: 1.50, h: 1.56, y: 0.08, n: 3.2 },
    { z: -2.60, w: 1.34, h: 1.40, y: 0.12, n: 3.1 },
    { z: -5.00, w: 1.14, h: 1.20, y: 0.20, n: 3.0 },
    { z: -7.00, w: 0.86, h: 0.92, y: 0.30, n: 2.8 },
    { z: -8.10, w: 0.42, h: 0.50, y: 0.36, n: 2.4 },
  ], 16, { uv: true }), skin, 0, 0, 0));

  // The gun. Seven barrels in a ring with the muzzle clamp round them,
  // offset to port so the barrel in the firing position sits on the
  // centreline — which is why the nose gear is on the other side.
  for (let k = 0; k < 7; k++) {
    const a = (k / 6) * Math.PI * 2;
    const r = k < 6 ? 0.1 : 0;
    g.add(part(new THREE.CylinderGeometry(0.042, 0.042, 1.1, 6).rotateX(Math.PI / 2), steel,
      0.2 + Math.cos(a) * r, -0.36 + Math.sin(a) * r, 8.2));
  }
  g.add(part(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 12).rotateX(Math.PI / 2), dark, 0.2, -0.36, 8.52));

  // The canopy: a bubble, high and well forward, with the windscreen bow
  // ahead of it and the frame it closes against behind.
  g.add(part(loft([
    { z: 6.55, w: 0.36, h: 0.14, y: 0.98, n: 2.4 },
    { z: 6.00, w: 0.98, h: 0.80, y: 1.22, n: 2.4 },
    { z: 5.20, w: 1.10, h: 1.00, y: 1.32, n: 2.6 },
    { z: 4.50, w: 1.04, h: 0.92, y: 1.30, n: 2.6 },
    { z: 3.90, w: 0.64, h: 0.36, y: 1.10, n: 2.6 },
  ], 12), glass, 0, 0, 0));
  g.add(part(loft([
    { z: 6.10, w: 1.02, h: 0.84, y: 1.22, n: 2.4 },
    { z: 5.96, w: 1.06, h: 0.88, y: 1.24, n: 2.4 },
  ], 12), dark, 0, 0, 0));
  g.add(part(loft([
    { z: 4.02, w: 0.74, h: 0.46, y: 1.13, n: 2.6 },
    { z: 3.88, w: 0.62, h: 0.30, y: 1.08, n: 2.6 },
  ], 12), dark, 0, 0, 0));

  // The wing: a flat centre section the gear pods hang from, outer panels
  // with a little dihedral and a taper mostly on the trailing edge, and the
  // Hoerner tips turned down at the end.
  const wy = -0.46, wz = 1.55;
  // 47 m² on a 17.5 m span: a 3.1 m chord at the root, 1.75 m at the tip.
  pair(g, twoTone(surface({ span: 3.4, root: 3.1, tip: 3.1, sweep: 0, thick: 0.5 }), UPPER, LOWER), surf, 0, wy, wz);
  pair(g, twoTone(surface({ span: 4.6, root: 3.1, tip: 1.75, sweep: 0.25, thick: 0.4, dihedral: 0.06 }), UPPER, LOWER), surf, 3.4, wy, wz);
  pair(g, twoTone(surface({ span: 0.78, root: 1.75, tip: 1.5, sweep: 0.08, thick: 0.2, dihedral: -0.62 }), UPPER, LOWER), surf,
    8.0, wy + Math.sin(0.06) * 4.6, wz - 0.25);
  // The main-gear pods, out ahead of the leading edge, with the wheels half
  // out of them: the A-10 lands on its tyres with the gear up.
  for (const sx of [-1, 1]) {
    g.add(part(loft([
      { z: 3.00, w: 0.30, h: 0.30, n: 2.2 },
      { z: 2.40, w: 0.80, h: 0.78, n: 2.6 },
      { z: 1.20, w: 0.90, h: 0.86, n: 2.8 },
      { z: -0.80, w: 0.86, h: 0.80, y: 0.05, n: 2.8 },
      { z: -1.80, w: 0.50, h: 0.50, y: 0.10, n: 2.4 },
    ], 10), lower, sx * 2.6, -0.75, 0));
    g.add(part(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14).rotateZ(Math.PI / 2), dark, sx * 2.6, -0.98, 1.9));
    g.add(part(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 10).rotateZ(Math.PI / 2), lower, sx * 2.6, -0.98, 1.9));
  }

  // The engines: two TF34 fans in fat short pods up on the back, each on a
  // pylon off the fuselage shoulder, pitched up a few degrees. A dark fan
  // face behind the lip with the spinner in it; a nozzle and a tail cone
  // behind, and nothing burning.
  for (const sx of [-1, 1]) {
    const n = new THREE.Group();
    n.add(part(loft([
      { z: 2.00, w: 1.24, h: 1.24, n: 2.0 },
      { z: 1.60, w: 1.34, h: 1.34, n: 2.0 },
      { z: 0.00, w: 1.36, h: 1.36, n: 2.0 },
      { z: -1.30, w: 1.26, h: 1.26, n: 2.0 },
      { z: -1.95, w: 0.98, h: 0.98, n: 2.0 },
    ], 16), lower, 0, 0, 0));
    n.add(part(new THREE.CylinderGeometry(0.56, 0.56, 0.06, 20).rotateX(Math.PI / 2), dark, 0, 0, 1.88));
    n.add(part(new THREE.ConeGeometry(0.15, 0.4, 10).rotateX(Math.PI / 2), lower, 0, 0, 2.02));
    n.add(part(new THREE.CylinderGeometry(0.44, 0.49, 0.26, 16).rotateX(Math.PI / 2), dark, 0, 0, -1.98));
    n.add(part(new THREE.ConeGeometry(0.2, 0.7, 10).rotateX(-Math.PI / 2), steel, 0, 0, -2.2));
    n.position.set(sx * 1.24, 1.56, -2.9);
    n.rotation.x = -0.08;
    g.add(n);
    // The pylon: a thin fairing from the fuselage's shoulder up and out to
    // the inboard underside of the pod, so there is sky between the two.
    const py = part(new THREE.BoxGeometry(0.14, 0.8, 2.4), upper, sx * 0.62, 0.93, -3.2);
    py.rotation.z = -sx * 0.785;
    g.add(py);
  }

  // The tail: an unswept stabiliser low on the aft body, and a square fin on
  // each end of it that goes below as well as above.
  const ty = 0.42, tz = -6.05;
  pair(g, twoTone(surface({ span: 2.87, root: 1.95, tip: 1.55, sweep: 0.25, thick: 0.24 }), UPPER, LOWER), surf, 0, ty, tz);
  const fin = surface({ span: 2.6, root: 1.95, tip: 1.35, sweep: 0.55, thick: 0.2 });
  const code = tailCode('FT');
  const codeMat = code ? new THREE.MeshStandardMaterial({ map: code, roughness: 0.75 }) : null;
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(sx > 0 ? fin : mirrorX(fin), upper);
    m.position.set(sx * 2.87, ty - 0.5, tz + 0.1);
    m.rotation.z = sx * (Math.PI / 2);
    m.castShadow = true;
    g.add(m);
    if (codeMat) {
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), codeMat);
        c.position.set(sx * 2.87 + side * 0.11, ty + 1.15, tz - 0.95);
        c.rotation.y = side * Math.PI / 2;
        g.add(c);
      }
    }
  }

  // The load, which is what the aircraft is for. Pylons under the wing with
  // a typical A-10C fit: a rack of three Mk 82s inboard, a Maverick on its
  // rail, a rocket pod, and on the outer stations the jamming pod to port
  // and a pair of Sidewinders to starboard; a targeting pod under the
  // belly on the starboard side.
  const pylon = (x, z, len = 1.3) => g.add(part(new THREE.BoxGeometry(0.14, 0.42, len), lower, x, -0.9, z));
  const bomb = (x, y, z) => {
    g.add(part(new THREE.CylinderGeometry(0.135, 0.135, 1.5, 10).rotateX(Math.PI / 2), olive, x, y, z));
    g.add(part(new THREE.ConeGeometry(0.135, 0.5, 10).rotateX(Math.PI / 2), olive, x, y, z + 1.0));
    g.add(part(new THREE.CylinderGeometry(0.1, 0.135, 0.5, 10).rotateX(Math.PI / 2), olive, x, y, z - 1.0));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.add(part(new THREE.BoxGeometry(0.02, 0.2, 0.36), olive, x + Math.cos(a) * 0.17, y + Math.sin(a) * 0.17, z - 1.05, 0, 0, a - Math.PI / 2));
    }
  };
  for (const sx of [-1, 1]) {
    // Triple ejector rack with three Mk 82s.
    pylon(sx * 3.35, 0.35, 1.5);
    g.add(part(new THREE.BoxGeometry(0.46, 0.22, 1.9), dark, sx * 3.35, -1.2, 0.35));
    bomb(sx * 3.35, -1.52, 0.3);
    bomb(sx * 3.35 - 0.3, -1.3, 0.3);
    bomb(sx * 3.35 + 0.3, -1.3, 0.3);
    // The Maverick: a grey tube with a glass nose and the big delta fins.
    pylon(sx * 4.5, 0.25);
    g.add(part(new THREE.BoxGeometry(0.16, 0.18, 1.7), dark, sx * 4.5, -1.18, 0.1));
    g.add(part(new THREE.CylinderGeometry(0.15, 0.15, 2.3, 12).rotateX(Math.PI / 2), white, sx * 4.5, -1.42, 0.1));
    g.add(part(new THREE.SphereGeometry(0.15, 12, 8), glass, sx * 4.5, -1.42, 1.25));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.add(part(new THREE.BoxGeometry(0.02, 0.34, 0.7), white, sx * 4.5 + Math.cos(a) * 0.3, -1.42 + Math.sin(a) * 0.3, 0.2, 0, 0, a - Math.PI / 2));
      g.add(part(new THREE.BoxGeometry(0.02, 0.22, 0.3), white, sx * 4.5 + Math.cos(a) * 0.24, -1.42 + Math.sin(a) * 0.24, -0.9, 0, 0, a - Math.PI / 2));
    }
    // A seven-tube rocket pod.
    pylon(sx * 5.6, 0.15, 1.1);
    g.add(part(new THREE.CylinderGeometry(0.21, 0.21, 1.7, 12).rotateX(Math.PI / 2), lower, sx * 5.6, -1.33, 0.1));
    g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12).rotateX(Math.PI / 2), dark, sx * 5.6, -1.33, 0.96));
  }
  // Outer stations: the jamming pod and the Sidewinders.
  pylon(6.7, 0.0, 1.1);
  g.add(part(loft([
    { z: 1.4, w: 0.2, h: 0.24, n: 2.4 }, { z: 1.0, w: 0.42, h: 0.5, n: 3.4 },
    { z: -1.0, w: 0.42, h: 0.5, n: 3.4 }, { z: -1.4, w: 0.2, h: 0.3, n: 2.4 },
  ], 10), lower, 6.7, -1.36, 0.0));
  pylon(-6.7, 0.0, 1.1);
  g.add(part(new THREE.BoxGeometry(0.5, 0.12, 1.4), dark, -6.7, -1.16, 0.0));
  for (const dx of [-0.18, 0.18]) {
    g.add(part(new THREE.CylinderGeometry(0.065, 0.065, 2.6, 8).rotateX(Math.PI / 2), white, -6.7 + dx, -1.3, 0.0));
    g.add(part(new THREE.ConeGeometry(0.065, 0.4, 8).rotateX(Math.PI / 2), glass, -6.7 + dx, -1.3, 1.5));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.add(part(new THREE.BoxGeometry(0.015, 0.2, 0.3), white, -6.7 + dx + Math.cos(a) * 0.14, -1.3 + Math.sin(a) * 0.14, -1.1, 0, 0, a - Math.PI / 2));
    }
  }
  // The targeting pod under the belly.
  g.add(part(new THREE.BoxGeometry(0.14, 0.3, 1.0), lower, -0.95, -0.82, 0.6));
  g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 1.9, 12).rotateX(Math.PI / 2), lower, -0.95, -1.1, 0.5));
  g.add(part(new THREE.SphereGeometry(0.2, 12, 8), glass, -0.95, -1.1, 1.45));

  // The nose art: behind the shark's mouth, on the flat side under the
  // canopy, so the two pictures do not crowd each other.
  g.userData.noseArt = { z: 3.75, y: 0.22, w: 1.55 };
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return bakeAirframe(g);
}

/**
 * The airframe a strike flies, by its record: `aircraft.kind` picks the
 * builder and `aircraft.store` what the Eagle carries. Exported so the card
 * icons are rendered from exactly what the sortie draws.
 */
export function makeAirframe(def) {
  const a = def.aircraft || {};
  switch (a.kind) {
    case 'lancer': return makeLancer();
    case 'apache': return makeApache();
    case 'ghostrider': return makeGhostrider();
    case 'tomahawk': return makeTomahawk();
    case 'warthog': return makeWarthog();
    default: return makeEagle({ store: a.store });
  }
}

export { makeLancer } from './airframes/lancer.js';
import { makeLancer } from './airframes/lancer.js';

/**
 * Where to let go.
 *
 * Simulates the bomb's fall from the release height with the aircraft's
 * forward speed and its own drag until it is down at the target's height,
 * and returns how far along the run it travelled. Release that far short
 * of the target and it lands on the target.
 */
export function solveRelease(dropHeight, forwardSpeed, gravity, drag) {
  let x = 0, y = 0, vx = forwardSpeed, vy = 0, t = 0;
  const dt = 0.02;
  while (y > -dropHeight && t < 60) {
    vx -= vx * drag * dt;
    vy -= (gravity + vy * drag) * dt;
    x += vx * dt; y += vy * dt; t += dt;
  }
  return { distance: x, time: t };
}

export class AirWing {
  constructor(o) {
    this.scene = o.scene;
    this.quality = o.quality;
    this.terrain = o.terrain;
    this.projectiles = o.projectiles;
    this.fx = o.fx;
    this.audio = o.audio || null;
    this.camera = o.camera;
    this.sorties = [];
    this._v = new THREE.Vector3();
  }

  /**
   * Send one aircraft at a point.
   * @param {object} def   the unit definition, with `strike` and `aircraft`
   * @param {THREE.Vector3} target
   * @param {number} ceiling  the highest standing masonry near the run, so a
   *                          low pass is low but not through the tower
   */
  call(def, target, ceiling, opts = {}) {
    if (def.aircraft?.station) return this._callLoiter(def, target, ceiling, opts);
    if (def.strike?.strafe) return this._callStrafe(def, target, ceiling, opts);
    const a = def.aircraft;
    const p = def.projectile;
    // Run in from behind the camera, across the target, and out the far side.
    const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
    // Offset the run a touch to one side so it never flies straight down
    // the camera's own line and vanishes behind the HUD.
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const alt = Math.max(target.y + a.height, ceiling + a.clearance);
    const drop = alt - target.y;
    const rel = solveRelease(drop, a.speed, p.gravity, p.drag || 0);
    const model = makeAirframe(def);
    if (def.aircraft?.kind !== 'tomahawk') decorate(model, def.aircraft?.kind);
    // Yaw first, then pitch about the aircraft's own lateral axis, then roll
    // about its nose. In the default order the pitch is about the world's x
    // axis, which is nose-up flying north, a roll flying east and nose-down
    // flying south — the jets climbing away with their noses on the ground.
    model.rotation.order = 'YXZ';
    // The start is pushed off the camera's line; the run is then re-aimed
    // from there straight through the target, so the bomb still lands on
    // it and the aircraft crosses it at a slight angle to the view.
    model.position.copy(target).addScaledVector(dir, -a.runIn).addScaledVector(side, a.offset || 0);
    dir.set(target.x - model.position.x, 0, target.z - model.position.z).normalize();
    side.set(-dir.z, 0, dir.x);
    model.rotation.y = Math.atan2(dir.x, dir.z);
    model.position.y = alt;
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    this.scene.add(model);
    const runLen = Math.hypot(target.x - model.position.x, target.z - model.position.z);
    const s = {
      def, model, dir, side, alt, target: target.clone(),
      speed: a.speed, t: 0, released: false,
      releaseAt: (runLen - rel.distance) / a.speed,   // seconds into the run
      pullUpAt: runLen / a.speed + 1.2,
      climb: 0, roar: 0, life: 0,
      fall: rel.time,
      // Flak.
      //
      // Until the garrison had guns that could reach up, the two most expensive
      // cards in the arsenal were also the two safest: the aircraft flew
      // through a defended objective as though the airspace were empty and put
      // its bomb exactly where it was told to.
      //
      // It used to be a single roll taken before the aircraft was even in the
      // air — count the guns, spoil the run or do not. That was the right
      // effect arrived at the wrong way: the guns that decided it were the
      // ones near the aim point rather than the ones the run actually passed
      // over, nothing was drawn, and shooting one of them down between the
      // call and the release changed nothing. Now the aircraft flies through
      // real tracer from real crews and carries what it has been hit with:
      // every point of damage walks the bomb further off the point the player
      // marked, and a pilot who has taken enough of it leaves without
      // dropping at all. Killing the flak first is worth doing, and now it is
      // worth doing *while the aircraft is on its run*.
      flak: opts.flak || 0,
      hp: AIRFRAME.jet, hits: 0, jink: 0,
      // Which way the bomb walks. Fixed at the start, so a run that takes fire
      // all the way in does not wander: it goes further off the same way.
      jinkAt: Math.random() * Math.PI * 2,
    };
    this.sorties.push(s);
    return s;
  }

  /**
   * A gun run down a line: the A-10.
   *
   * The player draws the line, from where the stream should start to where
   * it should end; a tap with no drag is a line through the point, running
   * away from the camera. The aircraft comes in low along that line from well
   * behind its start, opens fire at a slant range of about seven hundred
   * metres, and walks a stream of 30 mm from the start of the line to its end
   * over a second and a half or so: a hundred-odd real rounds, each one a
   * projectile that stops against whatever it meets first. Then it pulls up
   * and away. Each round is a small high-explosive burst: lethal to a man
   * within a couple of metres of it, trench or not, and nothing that troubles
   * masonry beyond the face it chips.
   */
  _callStrafe(def, target, ceiling, opts = {}) {
    const a = def.aircraft, st = def.strike;
    let from = target.clone();
    let to = opts.to ? opts.to.clone() : null;
    if (!to || Math.hypot(to.x - from.x, to.z - from.z) < 12) {
      // A tap: a line through the point, along the camera's look.
      const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
      const l = Math.hypot(dx, dz) || 1;
      const half = st.defaultLen / 2;
      from = target.clone().set(target.x - dx / l * half, 0, target.z - dz / l * half);
      to = target.clone().set(target.x + dx / l * half, 0, target.z + dz / l * half);
    }
    // Not shorter than the stream needs, not longer than one burst covers.
    const len0 = Math.hypot(to.x - from.x, to.z - from.z);
    const len = THREE.MathUtils.clamp(len0, st.minLen, st.maxLen);
    const dir = new THREE.Vector3((to.x - from.x) / len0, 0, (to.z - from.z) / len0);
    to.set(from.x + dir.x * len, 0, from.z + dir.z * len);
    from.y = this.terrain.heightAt(from.x, from.z);
    to.y = this.terrain.heightAt(to.x, to.z);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);

    // The run is a dive, and the gun fires along the aircraft, not out of
    // its belly.
    //
    // It used to come in level at whatever height cleared the tallest thing
    // on the map and fire down at the line from there; at Westminster that
    // was two hundred and thirty metres over the tower's shoulder, and by the
    // end of the burst the aircraft was nearly over the line and the stream
    // went straight down out of it. A gun run is flown the other way: roll in
    // from height, settle into a twenty-degree dive with the pipper on the
    // start of the line, open at six or seven hundred metres slant, walk the
    // stream down the line with the nose, and pull off before the ground
    // gets interesting. The rounds leave a dozen degrees below the
    // fuselage's axis and meet the ground at a little over thirty — steep
    // enough to reach a trench dug in a street, which a shallower stream is
    // not, because the first block in front of it takes the burst.
    const D = THREE.MathUtils.degToRad(st.dive ?? 20);
    const G = THREE.MathUtils.degToRad(st.depression ?? 12);
    const theta = D + G;
    const v = a.speed, T = st.burst;
    const preDive = st.preDive ?? 2.6;
    const drop = v * Math.sin(D) * T;          // height given up while firing
    const sink = 25;                           // and in the pull-out
    const backFor = (R) => R * Math.cos(theta) + v * Math.cos(D) * preDive;
    const ceilOn = (R) => this.ceilingAlong(
      from.x - dir.x * (backFor(R) + a.runIn), from.z - dir.z * (backFor(R) + a.runIn),
      to.x + dir.x * 500, to.z + dir.z * 500);
    let R = st.slant ?? 650;
    // Opened further out, on the same angles, when something tall stands
    // under the run: the bottom of the pull-out clears it.
    for (let k = 0; k < 3; k++) {
      const top = Math.max(from.y, to.y, ceilOn(R));
      const need = (top + a.clearance + drop + sink - from.y) / Math.sin(theta);
      if (need <= R) break;
      R = need;
    }
    const open = from.clone().addScaledVector(dir, -R * Math.cos(theta));
    open.y = from.y + R * Math.sin(theta);
    const rollY = open.y + v * Math.sin(D) * preDive;
    const model = makeAirframe(def);
    if (def.aircraft?.kind !== 'tomahawk') decorate(model, def.aircraft?.kind);
    model.rotation.order = 'YXZ';
    model.position.copy(from).addScaledVector(dir, -(backFor(R) + a.runIn));
    model.position.y = rollY;
    model.rotation.y = Math.atan2(dir.x, dir.z);
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    this.scene.add(model);
    const corner = a.runIn / v;
    const openAt = corner + preDive;
    const s = {
      def, model, dir, side, alt: rollY, target: from.clone(),
      speed: v, t: 0, released: false,
      releaseAt: openAt, fall: T,
      pullUpAt: openAt + T + 0.25,
      climb: 0, roar: 0, life: 0,
      flak: opts.flak || 0,
      hp: AIRFRAME.jet * 2.2, hits: 0, jink: 0, jinkAt: Math.random() * Math.PI * 2,
      strafe: { from, to, fired: 0, rounds: st.rounds, burst: T, brrt: false,
        corner, dive: D, depression: G, nose: 0, slant: R },
    };
    this.sorties.push(s);
    return s;
  }

  /**
   * Fly the gun run: level to the roll-in, a push over into the dive, the
   * dive, and the pull-off once the burst is out. The path is one thing and
   * the nose another: through the dive the pilot holds the pipper on the
   * point the stream is walking, so the nose sits a dozen degrees above the
   * line to it and comes up as the stream walks away.
   */
  _flyStrafe(s, dt) {
    const S = s.strafe, m = s.model, D = S.dive;
    let path;
    if (s.t < S.corner - 0.45) path = 0;
    else if (s.t < S.corner + 0.45) path = -D * (s.t - (S.corner - 0.45)) / 0.9;
    else path = -D;
    if (s.t > s.pullUpAt) s.climb = Math.min(1, s.climb + dt * 0.75);
    path += (0.42 - path) * s.climb;
    m.position.x += s.dir.x * Math.cos(path) * s.speed * dt;
    m.position.z += s.dir.z * Math.cos(path) * s.speed * dt;
    m.position.y += Math.sin(path) * s.speed * dt;
    const g = this.terrain.heightAt(m.position.x, m.position.z);
    if (m.position.y < g + 20) m.position.y = g + 20;

    // Where the nose wants to be.
    let want = path;
    if (s.t > S.corner && s.t < s.pullUpAt) {
      const f = S.fired / Math.max(1, S.rounds - 1);
      const aim = this._v2 || (this._v2 = new THREE.Vector3());
      aim.copy(S.from).lerp(S.to, f);
      const h = Math.hypot(aim.x - m.position.x, aim.z - m.position.z);
      const down = Math.atan2(m.position.y - aim.y, Math.max(1, h));
      want = -(down - S.depression);
    }
    S.nose += (want - S.nose) * Math.min(1, dt * 3.5);
    m.rotation.x = -S.nose;
    // Rolled a little into the pull-off so it reads as a turn away.
    m.rotation.z = s.climb * 0.55;
  }

  /** The rounds due by now, each from the gun to its point on the line. */
  _strafeFire(s) {
    const S = s.strafe, m = s.model;
    const since = s.t - s.releaseAt;
    const due = Math.min(S.rounds, Math.floor((since / S.burst) * S.rounds) + 1);
    const nose = this._v.set(0.2, -0.36, 8.6).applyQuaternion(m.quaternion).add(m.position);
    for (; S.fired < due; S.fired++) {
      const f = S.fired / Math.max(1, S.rounds - 1);
      // The stream walks the line, with the scatter of a gun firing from a
      // moving aircraft: a few metres either side and a little long or short.
      // Flak on the way in shakes the run off the line, but a pilot holding a
      // gun on a point corrects as he goes: a fraction of what the same hits
      // do to a bomb released blind, and never more than half a bay's width.
      const off = Math.min(3, s.jink * 0.05);
      const p = S.from.clone().lerp(S.to, f);
      p.addScaledVector(s.side, (Math.random() - 0.5) * 5.0 + Math.cos(s.jinkAt) * off);
      p.addScaledVector(s.dir, (Math.random() - 0.5) * 4.0 + Math.sin(s.jinkAt) * off);
      p.y = this.terrain.heightAt(p.x, p.z);
      const v = p.clone().sub(nose).normalize().multiplyScalar(1050);
      this.projectiles.fire({
        pos: nose.clone(), vel: v, gravity: 0, kind: 'direct', speed: 1050,
        warhead: s.def.warhead, owner: null, target: p, trail: 0, quiet: true, priority: true,
      });
      if (this.tracers) this.tracers.fire(nose, p, { look: 'gau8' }, true);
    }
    if (this.fx) this.fx.trail(nose, 2.8);
    // Tried again on the next frames if it could not be scheduled, until the
    // first third of the burst is gone and the recording would be out of step.
    if (!S.brrt && this.audio && S.fired < S.rounds * 0.33) {
      // One recording, heard from where the rounds land: the impacts first,
      // then — the gun being a long way off and the rounds being faster than
      // sound — the tearing note of the gun itself arriving after them. It
      // starts when the first rounds do, and the engine adds the time the
      // sound takes to reach the camera from the line.
      // The clip has three tenths of a second of lead-in before the first
      // impact, so it starts that much before the first round lands.
      const flight = nose.distanceTo(S.from) / 1050;
      // A retry starts that much later into the burst, so it takes off the
      // time already gone.
      S.brrt = this.audio.play('brrt', S.from.clone().lerp(S.to, 0.35),
        { gain: 1.0, rolloff: 2600, delay: Math.max(0, flight - 0.3 - since), exact: true, priority: true });
    }
  }

  /**
   * Everything of the player's that is in the air and can be shot at.
   *
   * Filled into a caller-owned array rather than allocating one a frame: the
   * garrison asks for this every tick of every battle.
   */
  /**
   * Flares. Every airframe here carries a dispenser, and any of them taking
   * fire empties some of it: no more than a burst every two and a half
   * seconds, so a long engagement is a run of pops rather than a fountain.
   */
  _popFlares(s) {
    if (!this.fx?.flourish || !s.model) return;
    if (s.def?.aircraft?.consumed) return;
    if (s.t - (s._flareT ?? -9) < 2.5) return;
    s._flareT = s.t;
    const dir = s.dir || this._v.set(Math.sin(s.model.rotation.y), 0, Math.cos(s.model.rotation.y));
    const big = !!(s.lift || s.def?.aircraft?.kind === 'lancer');
    this.fx.flourish.flares(s.model.position, dir, s.speed || 80, big ? 10 : 6);
    if (this.audio) for (let k = 0; k < 4; k++) crack(this.audio, s.model.position, k * 0.09, 0.22, 2600, 0.05);
  }

  /**
   * A jet going over the camera: the tear of it, swelling and falling away
   * and crossing from one ear to the other. Once a run, when it first comes
   * within a few hundred metres.
   */
  _passBy(s) {
    if (s._passed || !this.audio) return;
    const p = s.model.position, c = this.camera.position;
    const d = p.distanceTo(c);
    if (d > 420) return;
    s._passed = true;
    const right = this._v.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const now = (p.x - c.x) * right.x + (p.z - c.z) * right.z;
    const next = now + ((s.dir?.x ?? 0) * right.x + (s.dir?.z ?? 0) * right.z) * 300;
    const pan = (v) => Math.max(-0.9, Math.min(0.9, v / 200));
    flyby(this.audio, 0.22 + 0.4 * (1 - d / 420), pan(now), pan(next), s.def?.aircraft?.kind === 'lancer' ? 3.4 : 2.4);
  }

  airTargets(out = []) {
    out.length = 0;
    for (const s of this.sorties) {
      if (s.done || s.gone || s.downed) continue;
      // The airframe itself. A jet that has already pulled up and is climbing
      // out is left alone — the shooting is about the run, and tracer chasing
      // a dot at three thousand metres is noise.
      if (!(s.climb > 0.9)) {
        // A helicopter is low and slow enough for anything with a barrel to
        // have a go at; the fixed-wing aircraft are the AA gun's alone.
        const heli = !!(s.heli || (s.loiter && !s.loiter.orbit));
        out.push({ kind: 'aircraft', sortie: s, pos: s.model.position,
          transport: !!(s.lift || s.heli), heli,
          hover: heli && !!(s.loiter ? s.loiter.phase === 'station' : s.heli.phase === 'hover' || s.heli.phase === 'lower' || s.heli.phase === 'hold') });
      }
      if (!s.lift) continue;
      for (const L of s.lift.loads) {
        for (const c of L.chutes) {
          if (c.phase === 'landed' || c.dead) continue;
          out.push({ kind: 'chute', sortie: s, load: L, chute: c, pos: c.g.position, seed: c.seed });
        }
      }
    }
    return out;
  }

  /**
   * A round has gone into something in the air.
   *
   * The garrison does the shooting and the deciding; this does the flying
   * consequences, which is the only half of it the aircraft knows about.
   */
  hitAir(t, damage) {
    if (!t) return;
    if (t.kind === 'chute') return this._hitChute(t, damage);
    const s = t.sortie;
    if (s.hp === undefined) return;
    s.hits++;
    this._popFlares(s);
    s.hp -= damage;
    // A helicopter's lift has no dumping branch: it was told it had been
    // hit, the feed said so, and it carried on and landed the gun anyway.
    if (s.heli) return;
    if (s.lift) {
      // A transport does not abort — it is already over the drop zone and the
      // load is no use to anybody still in the aeroplane. It dumps the rest of
      // the sticks where it is and turns away, and the men come down wherever
      // that puts them.
      if (s.hp <= 0 && !s.dumping) {
        s.dumping = true;
        s.smoking = true;
        if (this.onAirEvent) this.onAirEvent('transporthit', { def: s.def });
      }
      return;
    }
    if (s.loiter) {
      if (s.hits === 1 && this.onAirEvent) this.onAirEvent('underfire', { def: s.def, loiter: true });
      if (s.hp <= 0 && s.loiter.phase !== 'down') {
        s.loiter.phase = 'down';
        s.loiter.fall = 0;
        s.smoking = true;
        if (this.onAirEvent) this.onAirEvent('shotdown', { def: s.def });
      }
      return;
    }
    if (s.released) { if (s.hp <= 0) s.smoking = true; return; }
    // Still carrying. The bomb walks off the point, and a pilot who has taken
    // enough goes home with it.
    s.jink += damage * JINK_PER_HP;
    if (s.hits === 1 && this.onAirEvent) this.onAirEvent('underfire', { def: s.def });
    if (s.hp <= 0 && !s.aborted) {
      s.aborted = true;
      s.smoking = true;
      s.pullUpAt = Math.min(s.pullUpAt, s.t);
      if (this.onAirEvent) this.onAirEvent('aborted', { def: s.def });
    }
  }

  /**
   * A missile has found it.
   *
   * Not damage: a surface-to-air warhead is fifty kilos of fragmentation a
   * few metres off the airframe, and what is left is a fireball and the
   * pieces. A strike jet that has not let go never does — its bomb goes down
   * with it — and the wreck falls burning and goes in where it lands. The
   * gunship goes down the way it already does when the flak gets it; a
   * transport loses an engine, dumps what it is carrying where it is and
   * turns for home on fire. Returns whether anything happened.
   */
  destroy(s) {
    // Not twice: a transport already dumping and a gunship already going
    // down are lost aircraft, and a second missile does not lose them again.
    if (!s || s.done || s.downed || s.dumping || s.loiter?.phase === 'down') return false;
    const m = s.model;
    if (this.fx) this.fx.detonate(m.position, 2.6, { ground: false });
    // The transports go down with what is still aboard (see _downLift).
    if (s.lift) return this._downLift(s);
    if (s.heli) return this._downHeli(s);
    if (s.wrecked) return false;
    if (s.loiter) {
      this.hitAir({ kind: 'aircraft', sortie: s }, 1e6);
      return true;
    }
    if (!s.released) {
      s.released = true;
      s.aborted = true;
      const bomb = m.getObjectByName('bomb');
      if (bomb) bomb.visible = false;
    }
    if (s.strafe) s.strafe.fired = s.strafe.rounds;
    const fwd = s.dir ? s.dir.clone() : new THREE.Vector3(Math.sin(m.rotation.y), 0, Math.cos(m.rotation.y));
    s.downed = {
      vel: fwd.multiplyScalar((s.speed || 150) * 0.65).setY(-6),
      spin: (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 2.2),
      dive: 0.35 + Math.random() * 0.5, t: 0, fire: 0,
    };
    s.smoking = true;
    if (this.onAirEvent) this.onAirEvent('missiled', { def: s.def, point: m.position.clone() });
    return true;
  }

  /**
   * A transport brought down by a missile. Not a hit it can limp home from:
   * the airframe goes in, and every load not yet out of the door goes with
   * it. Sticks already under canopy come down where they are. The player is
   * told what was lost, because it was paid for.
   */
  _downLift(s) {
    if (s.wrecked || s.done) return false;
    const m = s.model;
    s.wrecked = {
      vel: s.dir.clone().multiplyScalar((s.speed || 100) * 0.6).setY(-5),
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random()), dive: 0.3 + Math.random() * 0.3,
      t: 0, fire: 0, down: false,
    };
    s.smoking = true;
    s.dumping = true;
    const lost = [];
    for (const L of s.lift.loads) {
      if (L.out >= L.toGo) continue;
      if (L.out === 0) {
        L.toGo = 0;
        L.landed = true;
        L.drop.lost = true;
        lost.push(L.drop.def?.name || 'LOAD');
        if (s.lift.onLand) s.lift.onLand(L.drop);
      } else {
        L.toGo = L.out;
      }
    }
    if (this.onAirEvent) this.onAirEvent('liftdown', { kind: 'C-130', lost, point: m.position.clone() });
    return true;
  }

  /** A Chinook brought down: it goes in, and the gun on the sling with it. */
  _downHeli(s) {
    if (s.downed || s.done) return false;
    const H = s.heli, m = s.model;
    const lost = [];
    if (!H.released) {
      H.released = true;
      if (H.sling?.parent) H.sling.parent.remove(H.sling);
      H.drop.lost = true;
      lost.push(H.drop.def?.name || 'GUN');
      if (H.onLand) H.onLand(H.drop);
    }
    const v = H.vel.clone();
    s.downed = { vel: v.setY(-4), spin: (Math.random() < 0.5 ? -1 : 1) * 2.4, dive: 0.5, t: 0, fire: 0 };
    s.smoking = true;
    if (this.onAirEvent) this.onAirEvent('liftdown', { kind: 'CHINOOK', lost, point: m.position.clone() });
    return true;
  }

  /** A transport's fall: as _fall, but the sortie stays up for its canopies. */
  _liftFall(s, dt) {
    const m = s.model, d = s.wrecked;
    if (d.down) return;
    d.t += dt;
    d.vel.y -= 9.8 * dt;
    d.vel.multiplyScalar(1 - 0.05 * dt);
    m.position.addScaledVector(d.vel, dt);
    m.rotation.z += d.spin * dt;
    m.rotation.x = Math.min(1.0, m.rotation.x + d.dive * dt);
    if (this.fx) this.fx.trail(m.position, 9);
    const g = this.terrain.surfaceAt ? this.terrain.surfaceAt(m.position.x, m.position.z)
      : this.terrain.heightAt(m.position.x, m.position.z);
    if (m.position.y <= g + 1 || d.t > 40) {
      m.position.y = g;
      d.down = true;
      m.visible = false;
      if (this.onAirEvent) this.onAirEvent('wreck', { def: s.def, point: m.position.clone() });
    }
  }

  /** The wreck: ballistic, rolling, nose dropping, on fire, until the ground. */
  _fall(s, dt) {
    const m = s.model, d = s.downed;
    d.t += dt;
    d.vel.y -= 9.8 * dt;
    d.vel.multiplyScalar(1 - 0.06 * dt);
    m.position.addScaledVector(d.vel, dt);
    m.rotation.z += d.spin * dt;
    m.rotation.x = Math.min(1.2, m.rotation.x + d.dive * dt);
    if (this.fx) {
      this.fx.trail(m.position, 7);
      d.fire -= dt;
      if (d.fire <= 0 && this.fx.fire) {
        d.fire = 0.05;
        this.fx.fire.spawn({
          x: m.position.x, y: m.position.y, z: m.position.z,
          vx: -d.vel.x * 0.05, vy: 1.5, vz: -d.vel.z * 0.05,
          life: 0.5 + Math.random() * 0.4, size0: 3, size1: 7,
          color0: this.fx._c.fireHot, color1: this.fx._c.fireMid,
          drag: 2, grav: -1, spin: (Math.random() - 0.5) * 3, alpha: 0.95,
        });
      }
    }
    const g = this.terrain.surfaceAt ? this.terrain.surfaceAt(m.position.x, m.position.z)
      : this.terrain.heightAt(m.position.x, m.position.z);
    if (m.position.y <= g + 1 || d.t > 40) {
      m.position.y = g;
      if (this.onAirEvent) this.onAirEvent('wreck', { def: s.def, point: m.position.clone() });
      s.done = true;
    }
  }

  /** A canopy takes a burst. Enough of them and it stops being a canopy. */
  _hitChute(t, damage) {
    const c = t.chute;
    if (c.dead || c.streaming) return;
    c.hp -= damage;
    if (c.hp > 0) return;
    c.streaming = true;
    // A man whose canopy has gone does not survive the ground. A platform
    // does: it lands hard, and whatever was lashed to it gets up damaged.
    c.dead = t.load.troops;
    if (this.onAirEvent) {
      this.onAirEvent('canopy', { def: t.load.drop.def, troops: t.load.troops });
    }
  }

  update(dt) {
    for (const s of this.sorties) {
      s.t += dt;
      const m = s.model;
      if (s.downed) { this._fall(s, dt); continue; }
      if (s.lift) {
        this._updateLift(s, dt);
      } else if (s.heli) {
        this._updateHeli(s, dt);
      } else if (s.loiter) {
        this._updateLoiter(s, dt);
      } else if (s.strafe) {
        this._flyStrafe(s, dt);
      } else {
        // Straight and level, then a climbing turn away once past the target.
        if (s.t > s.pullUpAt) {
          s.climb = Math.min(1, s.climb + dt * 0.5);
        }
        const pitch = s.climb * 0.42;
        const vx = s.dir.x * Math.cos(pitch), vz = s.dir.z * Math.cos(pitch), vy = Math.sin(pitch);
        m.position.x += vx * s.speed * dt;
        m.position.z += vz * s.speed * dt;
        m.position.y += vy * s.speed * dt;
        m.rotation.x = -pitch;
        // A little bank into the pull-up so it reads as a turn, not a lift.
        m.rotation.z = s.climb * 0.5;
        // The pull-up is hard enough to pull vapour off the wings.
        if (s.climb > 0 && s.climb < 0.75 && !s.def.aircraft.consumed && this.fx?.flourish) {
          this.fx.flourish.vapour(m.position, s.dir, WINGSPAN[s.def.aircraft.kind] ?? 6.5, 1 - s.climb / 0.75);
        }
      }
      if (!s.lift && !s.heli && !s.loiter) this._passBy(s);
      // A jet running in over guns that are already firing lets its flares
      // go before the first round reaches it; one that is hit lets more go.
      if (s.flak && !s._flared && !s.lift && !s.heli && s.t > s.releaseAt - 3.5) {
        s._flared = true;
        this._popFlares(s);
      }

      // A gun run fires for the length of its burst, unless it was driven off.
      if (s.strafe && !s.aborted && s.t >= s.releaseAt && s.strafe.fired < s.strafe.rounds) {
        s.released = true;
        this._strafeFire(s);
      }
      // Driven off: the bomb stays on the rail and the aircraft goes home.
      if (s.aborted && !s.released) s.released = true;

      // Let go.
      if (!s.released && s.t >= s.releaseAt && !s.lift && !s.heli && !s.strafe) {
        s.released = true;
        // Where it actually goes. The aim point walks off by what the pilot
        // has been hit with on the way in, and a pilot under fire lets go
        // early rather than late, so the error is short of the mark as often
        // as it is wide of it.
        if (s.jink > 0) {
          s.harried = s.jink;
          s.target.x += Math.cos(s.jinkAt) * s.jink;
          s.target.z += Math.sin(s.jinkAt) * s.jink;
        }
        const bomb = m.getObjectByName('bomb');
        if (bomb) bomb.visible = false;
        // A cruise missile has nothing to let go of: the airframe is the
        // round, and from here the projectile is what the player watches.
        if (s.def.aircraft.consumed) { m.visible = false; s.done = true; }
        const p = s.def.projectile;
        // A salvo goes out as one release of `n` rounds spaced back along the
        // run, so they arrive one after another along a line through the
        // target: the gunship's rake rather than a single crater.
        const salvo = s.def.strike?.salvo;
        const n = salvo ? salvo.n : 1, spread = salvo ? salvo.spread : 0;
        for (let k = 0; k < n; k++) {
          const back = k * spread;
          const along = (k - (n - 1) / 2) * spread * 0.7;
          this.projectiles.fire({
            pos: m.position.clone().addScaledVector(s.dir, -back).setY(m.position.y - 1.6),
            vel: new THREE.Vector3(s.dir.x * s.speed, 0, s.dir.z * s.speed),
            gravity: p.gravity, kind: 'bomb', drag: p.drag || 0, speed: s.speed, guided: !!p.guided,
            warhead: s.def.warhead, owner: null,
            target: n > 1 ? s.target.clone().addScaledVector(s.dir, along) : s.target, trail: p.trail,
            strikeDef: s.def,
          });
        }
        if (this.audio) this.audio.play('rocket', m.position, { rate: 0.7, gain: 0.5, rolloff: 900 });
      }

      // Rotors and props turn on a strike airframe. The lift and the Chinook
      // turn their own in their own updates; doing it here as well ran them
      // at twice the speed.
      if (!s.lift && !s.heli) for (const c of m.children) {
        if (c.name === 'prop') c.rotation.z += 38 * dt;
        else if (c.name === 'rotorA') c.rotation.y += 22 * dt;
        else if (c.name === 'tailrotor') c.rotation.x += 60 * dt;
      }

      // Engine smoke and the roar. The roar is the rocket clip pitched down,
      // played on a short cycle while the aircraft is anywhere near.
      if (this.fx && this.quality.name !== 'low') {
        this._v.copy(m.position).addScaledVector(s.dir, -10);
        this._v.y -= 0.5;
        // An aircraft that has been hit trails properly, so a player who was
        // looking somewhere else can still read what happened to his strike.
        this.fx.trail(this._v, s.smoking ? 5.0 : 1.6);
        if (s.smoking) {
          this._v.copy(m.position).addScaledVector(s.dir, -22);
          this.fx.trail(this._v, 3.4);
        }
      }
      s.roar -= dt;
      if (s.roar <= 0 && this.audio) {
        s.roar = 1.1;
        const d = this.camera.position.distanceTo(m.position);
        if (d < 2400) {
          this.audio.play('rocket', m.position, {
            rate: s.heli ? 0.3 : s.lift ? 0.36 : STRIKE_RATE[s.def.aircraft.kind] ?? 0.55,
            gain: s.heli || s.loiter ? 0.42 : s.lift ? 0.4 : 0.55, rolloff: s.heli || s.loiter ? 900 : 1400,
          });
        }
      }

      // Gone once it is well past and climbing away — and, for a transport,
      // once its loads are down and the canopies are gone.
      if (!s.lift && !s.heli && !s.loiter) s.life = s.t - s.pullUpAt;
      if (s.lift) {
        if (s.life > 22 && s.lift.allDown) s.done = true;
        else if (s.life > 30) m.visible = false;
      } else if (s.heli || s.loiter) {
        // Ends itself.
      } else if (s.life > 14 || m.position.y > s.alt + 1600) s.done = true;
    }
    for (const s of this.sorties) {
      if (s.done) this._dropSortie(s);
    }
    this.sorties = this.sorties.filter((s) => !s.done);
  }


  get active() { return this.sorties.length; }
}

// ─────────────────────────────────────────────────────────── the airlift ──

export { makeHercules, makeGhostrider } from './airframes/hercules.js';
import { makeHercules, makeGhostrider } from './airframes/hercules.js';

/** A parachute canopy: a dome, open below, with its rigging to the load. */
function makeCanopy(radius, colour, loadY, loadHalf = 0.35) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
    // Lit a little from within: the underside of a canopy is what the
    // player mostly sees, and a dome shaded only by the sun is black there.
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.95, side: THREE.DoubleSide,
      emissive: new THREE.Color(colour), emissiveIntensity: 0.38, transparent: true }),
  );
  dome.position.y = -radius * 0.12;
  dome.castShadow = true;
  g.add(dome);
  // Rigging lines from the skirt to the load's corners.
  const pts = [];
  const rimY = dome.position.y + radius * Math.cos(Math.PI * 0.52);
  const rimR = radius * Math.sin(Math.PI * 0.52);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR));
    pts.push(new THREE.Vector3(Math.cos(a) * loadHalf, loadY, Math.sin(a) * loadHalf));
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xd8d4c8, transparent: true, opacity: 0.8 }),
  );
  g.add(lines);
  g.userData.dome = dome;
  return g;
}

/**
 * The airlift.
 *
 * The battery does not appear where the player taps: it is flown in. A
 * package of drops goes out as a formation of Hercules, one aircraft a drop,
 * in from behind the camera the way the strike aircraft come, and each puts
 * its load out of the ramp short of its own point. Infantry come down as a
 * stick of men under their own canopies; a gun or a vehicle comes down on
 * a platform under a cluster of four. The chutes steer onto the point —
 * the player paid for that placement — and on touchdown the canopies
 * collapse and the load becomes the unit, whose setup starts there.
 *
 * Nothing in the air can be hit, and nothing on the ground can hit it.
 */
const LIFT = { speed: 108, height: 96, clearance: 45, runIn: 520, spacing: 82, stagger: 0.9, perAircraft: 6, cluster: 150 };
/**
 * How the load comes down.
 *
 * A man under a round canopy falls at six or seven metres a second and a
 * heavy platform rather less, and those were the numbers here. Measured from
 * the tap: fifteen seconds of run-in, eighteen and a half under the canopy —
 * half a minute of watching before the gun exists, every time, on top of a
 * delivery the player has already paid for. Eleven and a half is faster than
 * anybody jumps, and it is the difference between an airlift and a wait.
 *
 * `maxUnder` is the backstop for a drop that has to be let go from high up:
 * the aircraft clears whatever is on its run, and where that cannot be flown
 * around — a stick put down at the foot of the Burj — the canopy comes down
 * at whatever rate gets it there in the time, rather than at its own.
 */
const CHUTE = { troopRate: 11.5, cargoRate: 10.0, freeFall: 0.7, open: 0.5, stick: 0.3, maxUnder: 13 };

/**
 * What it takes to hurt something in the air.
 *
 * These are not hit points in the sense the ground units have them: nothing
 * up here is meant to be killed outright by a lucky burst. They are how long
 * a thing can stay in a cone of tracer before the pilot stops flying the run
 * he was briefed and starts flying away from the guns — which is what air
 * defence has always actually done, and is the effect worth modelling.
 *
 * A jet crossing at two hundred and forty knots is in range for a few
 * seconds and its number is small to match. A transport is slower, lower and
 * straighter, and has to stay that way until the last man is off the ramp,
 * so it is tougher and still the one that suffers. A canopy is a canopy: it
 * takes a while to shoot away with small arms, and no time at all under flak.
 */
// The Apache is built to be shot at and stays in the flak for half a minute;
// it takes about twice what the Chinook does before it goes down.
const AIRFRAME = { jet: 100, transport: 220, heli: 170, gunship: 480, ac130: 900 };
const CANOPY = { troop: 195, cargo: 340 };
/** How far off a bomb goes, in metres, per point of damage taken before release. */
const JINK_PER_HP = 0.55;
/** A streaming canopy: no steering, and down at this rate instead of its own. */
const STREAM_RATE = 23;

/**
 * Load the package onto aircraft. Drops close together go out of the same
 * ramp on one run, in the order the run reaches them; a package spread
 * across the map takes as many aircraft as it needs, no more.
 */
function loadAircraft(drops) {
  const left = drops.slice();
  const groups = [];
  while (left.length) {
    const g = [left.shift()];
    const c = { x: g[0].pos.x, z: g[0].pos.z };
    for (let i = 0; i < left.length && g.length < LIFT.perAircraft;) {
      const d = left[i];
      if (Math.hypot(d.pos.x - c.x, d.pos.z - c.z) < LIFT.cluster) {
        g.push(d); left.splice(i, 1);
        c.x = g.reduce((a, q) => a + q.pos.x, 0) / g.length;
        c.z = g.reduce((a, q) => a + q.pos.z, 0) / g.length;
      } else i++;
    }
    groups.push(g);
  }
  return groups;
}

AirWing.prototype.deliver = function deliver(drops, ceiling, onLand, ceilingAlong = null) {
  // What stands under a line across the map: the monument, the town. The
  // battle answers it; the aircraft fly over it.
  this.ceilingAlong = ceilingAlong || (() => -Infinity);
  // The towed guns come under Chinooks; everything else goes out of a
  // Hercules.
  const guns = drops.filter((d) => d.def.tier === 'GUN');
  const rest = drops.filter((d) => d.def.tier !== 'GUN');
  const groups = loadAircraft(rest);
  const n = groups.length;
  let eta = guns.length ? this._deliverHelis(guns, onLand, n) : 0;
  this.lastLift = { hercs: n, helis: guns.length };
  groups.forEach((group, i) => {
    // The run goes through the middle of the group, in from behind the camera.
    const target = new THREE.Vector3(
      group.reduce((a, d) => a + d.pos.x, 0) / group.length, 0,
      group.reduce((a, d) => a + d.pos.z, 0) / group.length);
    target.y = group.reduce((a, d) => Math.max(a, d.pos.y), -Infinity);
    const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const model = makeHercules();
    decorate(model, 'hercules');
    // Formation: each aircraft off to its own side of the camera's line and
    // a little behind the last, then aimed through its own group.
    const lateral = (i - (n - 1) / 2) * LIFT.spacing + 30;
    const behind = LIFT.runIn + i * LIFT.stagger * LIFT.speed;

    // The way in: a line that does not have to climb.
    //
    // The run came in from behind the camera, always, and had to clear
    // whatever stood along it — which on a level with a six-hundred-metre
    // tower in it is the tower. The altitude that clears it is the altitude
    // the men leave from: a drop two hundred and sixty metres from the Burj
    // put the stick out at seven hundred and eight metres and left the player
    // watching canopies for a minute and a half, for a gun he had already
    // paid for. A transport flies round a thing like that. The camera's own
    // bearing is still the one it wants, and is kept unless another is
    // materially lower, so on a level with nothing in the way the run comes in
    // over the player's shoulder exactly as before.
    // Scored on the line itself. A drop's own `ceiling` — the tower, when the
    // drop is within two hundred metres of it — is what `_launch` hands over
    // as a floor, and taking it as one here made every bearing equal: the
    // aircraft was flown over the Burj because the *landing point* was near
    // the Burj, whichever way it came in. The line answers the question the
    // floor was standing in for, because a run to a point beside the tower
    // passes beside the tower.
    // The line a given bearing actually produces — start point, the heading
    // from it through the drop, and the stretch flown past. Scored on exactly
    // the geometry that will be flown, because the aircraft's own heading is
    // not the bearing: it is aimed from a start point set off to one side of
    // it, and those three degrees were the difference between a run passing
    // a hundred and eighty-four metres from the Burj and one passing a
    // hundred and seventy-eight, which is inside its corridor. Scoring one
    // line and flying another chose a clear approach and then climbed over
    // the tower anyway.
    const lineFor = (bear) => {
      const ux = Math.sin(bear), uz = Math.cos(bear);
      const sx = target.x - ux * behind - uz * lateral;
      const sz = target.z - uz * behind + ux * lateral;
      let fx = target.x - sx, fz = target.z - sz;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      return { sx, sz, fx, fz, ex: target.x + fx * 700, ez: target.z + fz * 700 };
    };
    const ceilOn = (L) => this.ceilingAlong(L.sx, L.sz, L.ex, L.ez);
    const camBear = Math.atan2(dir.x, dir.z);
    let line = lineFor(camBear), low = ceilOn(line);
    for (let k = 1; k < 12 && low > target.y + LIFT.height; k++) {
      const l2 = lineFor(camBear + (k / 12) * Math.PI * 2);
      const c2 = ceilOn(l2);
      // Materially lower, not merely lower: a run swung round the compass for
      // ten metres of clearance is a run that no longer comes from where the
      // player is looking.
      if (c2 < low - 25) { low = c2; line = l2; }
    }

    model.position.set(line.sx, 0, line.sz);
    dir.set(line.fx, 0, line.fz);
    side.set(-dir.z, 0, dir.x);
    model.rotation.y = Math.atan2(dir.x, dir.z);
    // High enough for the whole run, and the stretch past it: the Hercules
    // flew through the Great Pyramid because the drop was clear of it and
    // the run was not.
    const alt = Math.max(target.y + LIFT.height, low + LIFT.clearance);
    model.position.y = alt;
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    this.scene.add(model);
    const runLen = Math.hypot(target.x - model.position.x, target.z - model.position.z);
    const overAt = runLen / LIFT.speed;
    // Each load goes out where the run passes its point, in that order, a
    // stick's spacing apart at least; the chutes steer the rest of the way.
    const loads = group.map((d) => {
      const troops = d.def.model === 'infantry';
      // Its own rate, or whatever gets it down in the time when the run had to
      // be flown high: a canopy is not worth watching for a minute.
      const drop = Math.max(1, alt - d.pos.y);
      const rate = Math.max(troops ? CHUTE.troopRate : CHUTE.cargoRate, drop / CHUTE.maxUnder);
      const along = (d.pos.x - target.x) * dir.x + (d.pos.z - target.z) * dir.z;
      const lead = troops ? 1.0 : 1.3;
      const fall = CHUTE.freeFall + (alt - d.pos.y - 9.81 * CHUTE.freeFall * CHUTE.freeFall * 0.5) / rate;
      return { drop: d, releaseAt: overAt + along / LIFT.speed - lead, troops, rate, fall,
        chutes: [], out: 0, toGo: troops ? Math.max(1, d.def.crew) : 1, nextAt: 0, landed: false };
    }).sort((a, b) => a.releaseAt - b.releaseAt);
    // Spaced a stick apart — by bringing the earlier loads forward, never by
    // holding the later ones past their point. A man let go a hundred metres
    // past his drop zone has to fly the whole way back under the canopy, and
    // that is where the sticks that landed far from the ring came from.
    for (let k = loads.length - 2; k >= 0; k--) {
      const gap = loads[k + 1].releaseAt - 0.45;
      if (loads[k].releaseAt > gap) loads[k].releaseAt = gap;
    }
    const last = loads[loads.length - 1];
    const s = {
      def: group[0].def, model, dir, side, alt, target, speed: LIFT.speed, t: 0,
      releaseAt: loads[0].releaseAt,
      pullUpAt: last.releaseAt + last.toGo * CHUTE.stick + 2.0,
      climb: 0, roar: 0, life: 0, released: true, flak: 0, turn: 0, bank: 0, pitch: 0,
      hp: AIRFRAME.transport, hits: 0,
      // Away from the camera's side of the line, so the turn opens the view
      // rather than crossing it.
      turnDir: lateral >= 0 ? 1 : -1,
      lift: { loads, onLand },
    };
    this.sorties.push(s);
    for (const L of loads) eta = Math.max(eta, L.releaseAt + L.fall);
  });
  return eta;
};

/** Put the next load out of the ramp. */
AirWing.prototype._release = function _release(s, L) {
  if (L.troops) {
    // The team goes out together, side by side off the ramp, so both men
    // come down on the same point at the same time.
    while (L.out < L.toGo) this._releaseOne(s, L);
    return;
  }
  this._releaseOne(s, L);
};

AirWing.prototype._releaseOne = function _releaseOne(s, L) {
  const d = L.drop, m = s.model;
  const k = L.out++;
  const g = new THREE.Group();
  let load, canopies = [], landAt;
  if (L.troops) {
    // A man under a round canopy, the figure the unit will be built from.
    load = d.figure ? d.figure(k) : new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x4a5340 }));
    load.position.y = 0;
    g.add(load);
    const c = makeCanopy(3.4, 0x76835c, 1.6, 0.3);
    c.position.y = 6.2;
    g.add(c);
    canopies.push(c);
    // Where he lands: the crew's own offsets round the point.
    landAt = d.pos.clone();
    landAt.x += (k - 0.5) * 1.3; landAt.z += (k % 2) * 0.7;
    if (!d.pos.onRoof && !d.pos.onDeck) landAt.y = this.terrain.heightAt(landAt.x, landAt.z);
  } else {
    // A platform with the load lashed to it, under four canopies.
    const size = Math.max(4, (d.def.modelLength || 6) * 0.85);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(size * 0.8, 0.35, size * 1.15),
      new THREE.MeshStandardMaterial({ color: 0x4c4a44, roughness: 0.9 }));
    platform.position.y = 0.17;
    g.add(platform);
    load = d.group || new THREE.Group();
    load.position.set(0, 0.35, 0);
    // Facing the way it will stand: the platform turns with the aircraft's
    // heading, so the load's own turn is the difference, or a Paladin came
    // down backwards and swung round on landing.
    load.rotation.y = (d.yaw || 0) - m.rotation.y;
    g.add(load);
    const R = size > 8 ? 6.2 : 5.6;
    const spots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    if (size > 8) spots.push([0, 0]);
    for (const [ox, oz] of spots) {
      const c = makeCanopy(R, 0xd9d3c2, -8.5 + 0.35, size * 0.4);
      c.position.set(ox * 3.4, 9.6 + (ox === 0 && oz === 0 ? 2.2 : 0), oz * 3.8);
      g.add(c);
      canopies.push(c);
    }
    // The extraction chute that pulled the platform out of the ramp,
    // streaming behind it until the mains take over.
    const drogue = makeCanopy(2.3, 0xc9c2ae, 0, 0.3);
    drogue.rotation.x = Math.PI / 2;
    drogue.position.set(0, 1.6, -size * 0.9);
    g.add(drogue);
    g.userData.drogue = drogue;
    landAt = d.pos.clone();
  }
  for (const c of canopies) c.scale.setScalar(0.12);
  g.position.copy(m.position);
  g.position.y -= 2.2;
  g.position.addScaledVector(s.dir, -9);
  if (L.troops) g.position.addScaledVector(s.side, (k - (L.toGo - 1) / 2) * 2.6);
  g.rotation.y = m.rotation.y;
  this.scene.add(g);
  L.chutes.push({
    g, load, canopies, landAt, landY: landAt.y,
    vel: new THREE.Vector3(s.dir.x * s.speed * 0.9, -1.5, s.dir.z * s.speed * 0.9),
    t: 0, phase: 'free', sway: Math.random() * Math.PI * 2, rate: L.rate,
    hp: L.troops ? CANOPY.troop : CANOPY.cargo, seed: Math.random(),
  });
  L.nextAt = s.t + CHUTE.stick;
};

/**
 * Fly one load's chutes down. Returns true when all of it is on the ground.
 *
 * The tally is kept on the load rather than counted out of `L.chutes` each
 * tick, because that list is not the load: `_collapse` takes a canopy out of
 * it a second after it lands. That was harmless while every man of a stick
 * came down together at the same seven and a half metres a second. A canopy
 * that has been shot away falls at three times that, so the man who was hit
 * is on the ground and swept up long before his partner — and a count of
 * what was still in the list could never reach the size of the stick again.
 * The load hung in `pending` for the rest of the battle and the unit it was
 * carrying never arrived.
 */
AirWing.prototype._updateChutes = function _updateChutes(L, dt) {
  const touch = (c) => {
    c.phase = 'landed';
    c.landedAt = c.t;
    L.down = (L.down || 0) + 1;
    if (c.dead) L.deadMen = (L.deadMen || 0) + 1;
    if (c.streaming) L.streamed = (L.streamed || 0) + 1;
  };
  for (const c of L.chutes) {
    if (c.phase === 'landed') continue;
    c.t += dt;
    if (c.phase === 'free' && c.t > CHUTE.freeFall) c.phase = 'open';
    const p = c.g.position;
    if (c.streaming) {
      // Shot away. The canopy is a rag over his head, there is no steering
      // any more, and the only question left is how hard the ground is.
      for (const k of c.canopies) {
        k.scale.set(Math.max(0.06, k.scale.x - dt * 1.8), Math.max(0.06, k.scale.y - dt * 2.4), 1);
      }
      c.vel.y += (-STREAM_RATE - c.vel.y) * Math.min(1, dt * 2.2);
      c.vel.x -= c.vel.x * 0.9 * dt;
      c.vel.z -= c.vel.z * 0.9 * dt;
      c.g.rotation.x = Math.sin(c.t * 5.0) * 0.5;
      c.g.rotation.z = Math.cos(c.t * 4.1) * 0.45;
      p.addScaledVector(c.vel, dt);
      if (p.y <= c.landY) {
        p.y = c.landY;
        touch(c);
        if (this.fx) this.fx.impactDust(p.x, p.y, p.z, L.troops ? 1.1 : 2.6);
      }
      continue;
    }
    if (c.phase === 'free') {
      c.vel.y -= 9.81 * dt;
      c.vel.x -= c.vel.x * 1.4 * dt; c.vel.z -= c.vel.z * 1.4 * dt;
    } else {
      // The canopy fills, the fall is caught, the forward speed bleeds off,
      // and from there it steers onto the point: whatever is left to cover,
      // over the time left to cover it in.
      const open = Math.min(1, (c.t - CHUTE.freeFall) / CHUTE.open);
      for (const k of c.canopies) k.scale.setScalar(0.12 + 0.88 * open);
      if (c.g.userData.drogue) c.g.userData.drogue.scale.setScalar(Math.max(0.01, 1 - open));
      const want = -c.rate;
      c.vel.y += (want - c.vel.y) * Math.min(1, dt * 4.5);
      c.vel.x -= c.vel.x * 1.6 * dt; c.vel.z -= c.vel.z * 1.6 * dt;
      // Onto the point: what is left to cover over the time left to cover
      // it, a little ahead of that so the last metres are not a dash, and
      // with enough reach that the last man out of a full stick still gets
      // there. The player paid for the placement.
      const left = Math.max(0.5, (p.y - c.landY) / c.rate * 0.85);
      const sx = (c.landAt.x - p.x) / left, sz = (c.landAt.z - p.z) / left;
      const cap = 21;
      const sm = Math.hypot(sx, sz);
      const k = sm > cap ? cap / sm : 1;
      c.vel.x += (sx * k - c.vel.x) * Math.min(1, dt * 3.2);
      c.vel.z += (sz * k - c.vel.z) * Math.min(1, dt * 3.2);
      // A little swing under the canopy.
      const sw = Math.sin(c.t * 1.7 + c.sway) * 0.08 * open;
      c.g.rotation.x = sw; c.g.rotation.z = Math.cos(c.t * 1.3 + c.sway) * 0.06 * open;
    }
    p.addScaledVector(c.vel, dt);
    if (p.y <= c.landY) {
      p.y = c.landY;
      c.g.rotation.set(0, c.g.rotation.y, 0);
      touch(c);
      if (this.fx && this.quality.name !== 'low') this.fx.impactDust(p.x, p.y, p.z, L.troops ? 0.4 : 1.6);
    }
  }
  return (L.down || 0) >= L.toGo && L.out === L.toGo;
};

/** Let the canopies fall over the load and take them away. */
AirWing.prototype._collapse = function _collapse(L, dt) {
  for (const c of L.chutes) {
    if (c.phase !== 'landed') continue;
    // The clock keeps running on the ground: the canopy has a second to
    // fall, and the chute is forgotten after it. (It used to stop with the
    // descent, and the collapsed canopies stayed on the ground for ever.)
    c.t += dt;
    const k = Math.min(1, (c.t - c.landedAt) / 1.0);
    for (const cn of c.canopies) {
      cn.scale.set(1 + k * 0.45, Math.max(0.03, 1 - k * 1.3), 1 + k * 0.45);
      cn.position.y *= (1 - Math.min(1, dt * 4.0));
      if (cn.userData.dome) cn.userData.dome.material.opacity = 1 - k * 0.6;
    }
    if (k >= 1) { this.scene.remove(c.g); releaseTree(c.g, this.scene); c.gone = true; }
  }
  L.chutes = L.chutes.filter((c) => !c.gone);
};

/**
 * The transport's own business on the run: props, the sticks, the chutes,
 * and after the last load a proper departure — a gentle climbing turn away
 * from the camera's side that levels out, not the jet's pull-up held for
 * ever. A Hercules does not leave a drop zone at twenty-four degrees nose
 * up with thirty degrees of bank on.
 */
AirWing.prototype._updateLift = function _updateLift(s, dt) {
  const m = s.model;
  for (const p of m.children) if (p.name === 'prop') p.rotation.z += 38 * dt;
  let allDown = true;
  for (const L of s.lift.loads) {
    // Hit hard enough: everything still on board goes now, wherever the
    // aeroplane happens to be. A stick dumped short has the whole descent to
    // fly back to its mark and generally cannot, which is the cost.
    if (s.dumping && !L.dumped && L.out < L.toGo) {
      L.dumped = true;
      L.releaseAt = Math.min(L.releaseAt, s.t);
      L.nextAt = Math.min(L.nextAt, s.t);
    }
    if (L.out < L.toGo && s.t >= L.releaseAt && s.t >= L.nextAt) this._release(s, L);
    if (L.out > 0 && !L.landed && this._updateChutes(L, dt)) {
      L.landed = true;
      // How it arrives. A load whose canopies were shot away comes in hard;
      // a stick that lost men arrives short-handed; a stick that lost all of
      // them does not arrive at all.
      const dead = L.deadMen || 0;
      const streamed = L.streamed || 0;
      // Already lost stays lost: a roof that burned under the drop.
      L.drop.lost = L.drop.lost || (L.troops && dead >= L.toGo);
      L.drop.arrivalHealth = L.troops
        ? Math.max(0.2, 1 - dead / Math.max(1, L.toGo))
        : (streamed ? 0.45 : 1);
      if (s.lift.onLand) s.lift.onLand(L.drop);
    }
    if (L.out > 0) this._collapse(L, dt);
    if (!L.landed || L.chutes.length) allDown = false;
  }
  s.lift.allDown = allDown;
  if (s.wrecked) {
    this._liftFall(s, dt);
    s.life = s.wrecked.down ? 99 : 0;
    return;
  }

  // Flight. Straight and level on the run; past the last load, ease into a
  // turn away and a shallow climb, hold the turn a while, roll out.
  const past = s.t - s.pullUpAt;
  let wantBank = 0, wantPitch = 0;
  if (past > 0) {
    const turning = past < 7.5;
    wantBank = turning ? 0.36 : 0;
    wantPitch = 0.085;
    // Whatever stands ahead on the way out, climb over it.
    s.lookAhead = (s.lookAhead || 0) - dt;
    if (s.lookAhead <= 0) {
      s.lookAhead = 0.4;
      s.needAlt = this.ceilingAlong(m.position.x, m.position.z, m.position.x + s.dir.x * 520, m.position.z + s.dir.z * 520) + LIFT.clearance;
    }
    if (s.needAlt > m.position.y) wantPitch = THREE.MathUtils.clamp((s.needAlt - m.position.y) / 45, 0.085, 0.34);
    if (turning) {
      const rate = 0.16 * s.bank / 0.36;
      const a = rate * dt * s.turnDir;
      const x = s.dir.x * Math.cos(a) - s.dir.z * Math.sin(a);
      const z = s.dir.x * Math.sin(a) + s.dir.z * Math.cos(a);
      s.dir.set(x, 0, z);
    }
  }
  s.bank += (wantBank - s.bank) * Math.min(1, dt * 1.1);
  s.pitch += (wantPitch - s.pitch) * Math.min(1, dt * 0.8);
  m.position.x += s.dir.x * Math.cos(s.pitch) * s.speed * dt;
  m.position.z += s.dir.z * Math.cos(s.pitch) * s.speed * dt;
  m.position.y += Math.sin(s.pitch) * s.speed * dt;
  // Into the turn. A positive turn of the heading about +Y takes a nose on
  // +Z toward -X, which from behind is the right; a positive roll about the
  // nose drops the -X wing. Same sign, then, or it turns right banked left.
  m.rotation.set(-s.pitch, Math.atan2(s.dir.x, s.dir.z), s.turnDir * s.bank, 'YXZ');
  s.life = past;
};

/** Everything in the air, brought down and forgotten: the harness resets. */
AirWing.prototype.abortLifts = function abortLifts() {
  for (const s of this.sorties) {
    if (!s.lift && !s.heli) continue;
    if (s.lift) for (const L of s.lift.loads) for (const c of L.chutes) { this.scene.remove(c.g); releaseTree(c.g, this.scene); }
    this._dropSortie(s);
    s.done = true;
  }
  this.sorties = this.sorties.filter((s) => !s.done);
};

/**
 * A sortie out of the scene and off the GPU: every airframe is built fresh
 * for its flight, skin, nose art and all, and the sling under a Chinook with
 * it. Nothing of theirs is shared with anything that stays.
 */
AirWing.prototype._dropSortie = function _dropSortie(s) {
  this.scene.remove(s.model);
  releaseTree(s.model, this.scene);
  if (s.heli && s.heli.sling) { this.scene.remove(s.heli.sling); releaseTree(s.heli.sling, this.scene); }
};

// ─────────────────────────────────────────────────────────── the Chinook ──

export { makeChinook } from './airframes/chinook.js';
import { makeChinook } from './airframes/chinook.js';

const HELI = { speed: 56, height: 62, runIn: 640, hover: 17, sling: 11.5, lower: 1.7, spacing: 70, stagger: 1.6 };

/**
 * Send the towed guns in under Chinooks: one gun a helicopter, in trail.
 * The gun hangs on a sling under the hook, its model already on it. The
 * helicopter comes in fast, flares and slows over the last two hundred
 * metres, settles into a hover over the point, lowers until the gun is on
 * the ground, lets go, and climbs away.
 */
AirWing.prototype._deliverHelis = function _deliverHelis(drops, onLand, formationIndex = 0) {
  let eta = 0;
  drops.forEach((d, i) => {
    const target = d.pos.clone();
    const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const model = makeChinook();
    decorate(model, 'chinook');
    const lateral = -40 - (i + formationIndex) * 26;
    const behind = HELI.runIn + i * HELI.stagger * HELI.speed;
    model.position.copy(target).addScaledVector(dir, -behind).addScaledVector(side, lateral);
    dir.set(target.x - model.position.x, 0, target.z - model.position.z).normalize();
    model.rotation.y = Math.atan2(dir.x, dir.z);
    const cruise = Math.max(target.y + HELI.height, (d.ceiling ?? 0) + 24,
      this.ceilingAlong(model.position.x, model.position.z, target.x, target.z) + 24);
    model.position.y = cruise;
    this.scene.add(model);
    // The load, on its sling.
    const sling = new THREE.Group();
    const load = d.group || new THREE.Group();
    load.position.set(0, 0, 0);
    load.rotation.y = 0;
    sling.add(load);
    const pts = [];
    for (const [ox, oz] of [[-1.4, -1.6], [1.4, -1.6], [-1.4, 1.6], [1.4, 1.6]]) {
      pts.push(new THREE.Vector3(0, HELI.sling, 0), new THREE.Vector3(ox, 1.4, oz));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x3a3a38 }));
    sling.add(lines);
    sling.rotation.y = model.rotation.y;
    this.scene.add(sling);
    const dist0 = Math.hypot(target.x - model.position.x, target.z - model.position.z);
    const s = {
      def: d.def, model, dir, side, alt: cruise, target, speed: HELI.speed, t: 0, roar: 0, life: 0,
      released: true, flak: 0, bank: 0, pitch: 0, turnDir: 1,
      hp: AIRFRAME.heli, hits: 0,
      heli: { drop: d, onLand, sling, lines, phase: 'approach', hold: 0, wash: 0, cruise, vel: new THREE.Vector3(dir.x * HELI.speed, 0, dir.z * HELI.speed), yaw: model.rotation.y },
    };
    this.sorties.push(s);
    // Roughly: the run at speed less the slow-down, a hover, the lowering.
    eta = Math.max(eta, dist0 / HELI.speed + 6 + (HELI.hover - HELI.sling) / HELI.lower + 3);
  });
  return eta;
};

AirWing.prototype._updateHeli = function _updateHeli(s, dt) {
  const H = s.heli, m = s.model, d = H.drop;
  const ra = m.getObjectByName('rotorA'), rb = m.getObjectByName('rotorB');
  if (ra) ra.rotation.y += 22 * dt;
  if (rb) rb.rotation.y -= 22 * dt;
  const tx = s.target.x, tz = s.target.z, gy = s.target.y;
  const dx = tx - m.position.x, dz = tz - m.position.z;
  const dist = Math.hypot(dx, dz);
  let wantAlt = m.position.y;
  let speedBefore = Math.hypot(H.vel.x, H.vel.z);

  if (H.phase === 'approach') {
    // Slow to arrive: the speed it should have for the distance left.
    const want = Math.min(HELI.speed, Math.max(1.5, dist / 3.6));
    const ux = dist > 0.01 ? dx / dist : s.dir.x, uz = dist > 0.01 ? dz / dist : s.dir.z;
    H.vel.x += (ux * want - H.vel.x) * Math.min(1, dt * 1.6);
    H.vel.z += (uz * want - H.vel.z) * Math.min(1, dt * 1.6);
    // Down from cruise to the hover height over the last stretch — but not
    // through whatever stands between here and there.
    const k = THREE.MathUtils.clamp((dist - 30) / 260, 0, 1);
    wantAlt = gy + HELI.hover + (H.cruise - gy - HELI.hover) * k;
    H.look = (H.look || 0) - dt;
    if (H.look <= 0) {
      H.look = 0.4;
      const reach = Math.min(dist, 220);
      H.need = this.ceilingAlong(m.position.x, m.position.z, m.position.x + ux0(H) * reach, m.position.z + uz0(H) * reach) + 22;
    }
    if (dist > 45 && H.need > wantAlt) wantAlt = H.need;
    if (dist < 1.2 && speedBefore < 1.8) { H.phase = 'hover'; H.hold = 0; }
  } else if (H.phase === 'hover') {
    H.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
    wantAlt = gy + HELI.hover;
    H.hold += dt;
    if (H.hold > 0.9) { H.phase = 'lower'; }
  } else if (H.phase === 'lower') {
    H.vel.set(0, 0, 0);
    // Until the load is on the ground: the hook is a metre and a half under
    // the belly, the sling below that, the load's own base at its origin.
    // Stepped directly, not eased: eased toward a target a step away it
    // crept down at a fraction of the rate and never arrived.
    m.position.y -= HELI.lower * dt;
    wantAlt = m.position.y;
    if (m.position.y - 1.5 - HELI.sling <= gy) {
      m.position.y = wantAlt = gy + 1.5 + HELI.sling;
      H.phase = 'hold'; H.hold = 0;
      // Let go: the load is the unit now.
      H.sling.remove(H.lines);
      if (H.onLand) H.onLand(d);
      H.released = true;
    }
  } else if (H.phase === 'hold') {
    H.hold += dt;
    wantAlt = m.position.y;
    if (H.hold > 1.3) { H.phase = 'away'; s.pullUpAt = s.t; s.turnDir = 1; }
  } else if (H.phase === 'away') {
    const past = s.t - s.pullUpAt;
    // Up first, then away: the climb-out has to clear the town it is in.
    H.look = (H.look || 0) - dt;
    if (H.look <= 0) {
      H.look = 0.4;
      H.need = this.ceilingAlong(m.position.x, m.position.z, m.position.x + s.dir.x * 360, m.position.z + s.dir.z * 360) + 26;
    }
    const clear = m.position.y >= H.need - 4;
    const want = clear ? Math.min(HELI.speed, 4 + past * 6) : Math.min(8, 2 + past * 2);
    if (past > 3 && past < 11) {
      const a = 0.14 * dt * s.turnDir;
      const x = s.dir.x * Math.cos(a) - s.dir.z * Math.sin(a);
      const z = s.dir.x * Math.sin(a) + s.dir.z * Math.cos(a);
      s.dir.set(x, 0, z);
    }
    H.vel.x += (s.dir.x * want - H.vel.x) * Math.min(1, dt * 1.2);
    H.vel.z += (s.dir.z * want - H.vel.z) * Math.min(1, dt * 1.2);
    wantAlt = m.position.y + (clear ? Math.min(6, 1.5 + past * 0.8) : 9) * dt;
    s.life = past;
  }

  m.position.x += H.vel.x * dt;
  m.position.z += H.vel.z * dt;
  if (H.phase === 'away' || H.phase === 'lower') m.position.y = wantAlt;
  else m.position.y += (wantAlt - m.position.y) * Math.min(1, dt * 2.4);
  // Attitude: nose down to accelerate, up to slow, a little roll into a turn,
  // and the heading follows the motion once there is any.
  const speed = Math.hypot(H.vel.x, H.vel.z);
  const accel = (speed - speedBefore) / Math.max(dt, 1e-3);
  const wantPitch = THREE.MathUtils.clamp(-accel * 0.03 - speed * 0.0025, -0.2, 0.2);
  s.pitch += (wantPitch - s.pitch) * Math.min(1, dt * 2.0);
  if (speed > 2) H.yaw = Math.atan2(H.vel.x, H.vel.z);
  const wantBank = H.phase === 'away' && s.life > 3 && s.life < 11 ? 0.22 : 0;
  s.bank += (wantBank - s.bank) * Math.min(1, dt * 1.4);
  // Nose down to go, up to stop: in YXZ a positive x is nose down, and the
  // pitch here is positive when the helicopter is slowing.
  m.rotation.set(-s.pitch, H.yaw, s.turnDir * s.bank, 'YXZ');

  // The load, hanging from the hook, trailing the motion a little.
  if (!H.released) {
    m.updateMatrixWorld(true);
    const hook = this._v.set(0, -1.5, -0.5).applyMatrix4(m.matrixWorld);
    // The gun hangs along the line of flight, barrel forward.
    H.sling.rotation.y = H.yaw;
    H.sling.position.set(hook.x - H.vel.x * 0.09, hook.y - HELI.sling, hook.z - H.vel.z * 0.09);
    H.sling.rotation.z = THREE.MathUtils.clamp(H.vel.x * 0.006, -0.25, 0.25);
    H.sling.rotation.x = THREE.MathUtils.clamp(-H.vel.z * 0.006, -0.25, 0.25);
  }
  // Rotor wash on the ground under a low hover.
  if (this.fx && this.quality.name !== 'low' && m.position.y - gy < 32 && dist < 40) {
    H.wash -= dt;
    if (H.wash <= 0) { H.wash = 0.22; this.fx.impactDust(tx + (Math.random() - 0.5) * 8, gy, tz + (Math.random() - 0.5) * 8, 0.45); }
  }
  if (H.phase === 'away' && s.life > 26) s.done = true;
};

function ux0(H) { const l = Math.hypot(H.vel.x, H.vel.z); return l > 0.5 ? H.vel.x / l : Math.sin(H.yaw); }
function uz0(H) { const l = Math.hypot(H.vel.x, H.vel.z); return l > 0.5 ? H.vel.z / l : Math.cos(H.yaw); }

export { makeApache } from './airframes/apache.js';
import { makeApache } from './airframes/apache.js';

/**
 * BGM-109 Tomahawk in cruise: 5.56 m of half-metre tube, the wings out,
 * the four tail fins in an X, the engine's inlet scooped from under the
 * belly, nose along +Z. White, with the dark seeker window on the nose and
 * the burner lit at the tail. There is nothing to release: at the aim
 * point the missile itself becomes the round.
 */
export function makeTomahawk() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xd9dbd6, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.55, metalness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.16, metalness: 0.82 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false });

  // The tube: an ogive nose, a constant half-metre body, a short boat-tail.
  g.add(part(loft([
    { z: 2.78, w: 0.04, h: 0.04, n: 2.0 },
    { z: 2.40, w: 0.24, h: 0.24, n: 2.0 },
    { z: 1.90, w: 0.44, h: 0.44, n: 2.0 },
    { z: 1.40, w: 0.52, h: 0.52, n: 2.0 },
    { z: -2.10, w: 0.52, h: 0.52, n: 2.0 },
    { z: -2.60, w: 0.42, h: 0.42, n: 2.0 },
    { z: -2.78, w: 0.30, h: 0.30, n: 2.0 },
  ], 16), white, 0, 0, 0));
  // The seeker window on the nose, and the panel lines of the payload bay.
  g.add(part(new THREE.CylinderGeometry(0.19, 0.24, 0.16, 16), glass, 0, 0, 2.22, Math.PI / 2, 0, 0));
  for (const z of [1.35, -0.55, -1.90]) g.add(part(new THREE.CylinderGeometry(0.265, 0.265, 0.03, 16), dark, 0, 0, z, Math.PI / 2, 0, 0));

  // The wings, swung out from the mid-body: 2.67 m across, thin and square.
  const wing = surface({ span: 1.08, root: 0.56, tip: 0.44, sweep: 0.10, thick: 0.05, ridge: 0.45 });
  pair(g, wing, white, 0.24, -0.03, 0.55);

  // The inlet: the scoop under the belly behind the wings that feeds the
  // turbofan, with the exhaust pipe out of the tail.
  g.add(part(loft([
    { z: -0.60, w: 0.30, h: 0.04, y: -0.26, n: 2.6 },
    { z: -0.95, w: 0.32, h: 0.24, y: -0.36, n: 2.8 },
    { z: -2.20, w: 0.30, h: 0.22, y: -0.34, n: 2.8 },
    { z: -2.50, w: 0.20, h: 0.12, y: -0.30, n: 2.4 },
  ], 10), white, 0, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.26, 0.16, 0.04), dark, 0, -0.37, -0.95));
  g.add(part(new THREE.CylinderGeometry(0.13, 0.15, 0.30, 14), dark, 0, 0, -2.85, Math.PI / 2, 0, 0));
  const flame = new THREE.ConeGeometry(0.11, 0.9, 10);
  flame.rotateX(-Math.PI / 2);
  g.add(part(flame, glow, 0, 0, -3.35));

  // Four tail fins in an X, each a small swept panel out of the boat-tail.
  const fin = surface({ span: 0.58, root: 0.46, tip: 0.30, sweep: 0.16, thick: 0.04 });
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Mesh(fin, white);
    f.position.set(0, 0, -2.25);
    f.rotation.z = Math.PI / 4 + k * Math.PI / 2;
    f.castShadow = true;
    g.add(f);
  }
  g.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  return bakeAirframe(g);
}

/**
 * Aircraft on station: the Apache and the AC-130.
 *
 * Everything else the air wing flies is a pass: in, drop, out. These two
 * stay, for `station` seconds, and work whatever the player has designated.
 * Designate something else and they go to it: `retarget` is called by the
 * battle whenever the target changes.
 *
 * The Apache hovers at a stand-off on the player's side of the target, each
 * one in its own slot around it so two of them never share the same air,
 * and when the target moves it climbs over whatever stands between here and
 * the new slot, crosses, and comes back down to work: 70 mm rockets in
 * pairs, small and accurate, and the 30 mm on the defender nearest the mark.
 *
 * The AC-130 flies a banked left-hand orbit high over the target with its
 * guns on the inside of the turn, which is the only way a gunship can shoot,
 * and puts 105 mm shells down its port side straight at the mark, with the
 * 30 mm on the defenders round it. Its orbit follows the target when it
 * changes.
 *
 * Both are in the garrison's airspace the whole time and can be shot down.
 */
AirWing.prototype._callLoiter = function _callLoiter(def, target, ceiling, opts = {}) {
  const a = def.aircraft;
  const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
  const dl = Math.hypot(dx, dz) || 1;
  const dir = new THREE.Vector3(dx / dl, 0, dz / dl);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const model = makeAirframe(def);
  if (def.aircraft?.kind !== 'tomahawk') decorate(model, def.aircraft?.kind);
  model.rotation.order = 'YXZ';
  model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  this.scene.add(model);
  const s = {
    def, model, dir, side, target: target.clone(),
    speed: a.speed, t: 0, released: true, climb: 0, roar: 0, life: 0,
    flak: opts.flak || 0, hits: 0, jink: 0, stones: 0, kills: 0,
    fall: 0, pullUpAt: Infinity,
  };
  if (a.orbit) {
    // Join the orbit on a tangent that runs away from the camera, so the
    // gunship arrives from behind the player and turns in over the target.
    const R = a.radius;
    const theta = Math.atan2(dir.x, -dir.z);
    const alt = Math.max(target.y + a.height, (ceiling || 0) + 150);
    const entry = new THREE.Vector3(target.x + R * Math.cos(theta), alt, target.z + R * Math.sin(theta));
    const tangent = new THREE.Vector3(Math.sin(theta), 0, -Math.cos(theta));
    model.position.copy(entry).addScaledVector(tangent, -a.runIn);
    model.rotation.y = Math.atan2(tangent.x, tangent.z);
    s.hp = AIRFRAME.ac130;
    s.alt = alt;
    s.loiter = {
      phase: 'inbound', orbit: true, centre: target.clone(), theta, entry, tangent,
      eta: a.runIn / a.speed, time: 0, shells: a.shells, nextShell: 1.0, nextGun: 2.0,
    };
  } else {
    s.slot = this.sorties.filter((o) => o.loiter && !o.loiter.orbit && !o.done
      && o.loiter.phase !== 'egress' && o.loiter.phase !== 'down').length;
    const station = this._stationFor(s, target);
    const start = station.clone().addScaledVector(dir, -a.runIn);
    const along = this.ceilingAlong || (() => -Infinity);
    const ground = (x, z) => (this.terrain ? this.terrain.heightAt(x, z) : 0);
    const cruise = Math.max(station.y, along(start.x, start.z, station.x, station.z) + 30, ground(start.x, start.z) + 60);
    start.y = cruise;
    model.position.copy(start);
    model.rotation.y = Math.atan2(dir.x, dir.z);
    s.hp = AIRFRAME.gunship;
    s.alt = cruise;
    s.loiter = {
      phase: 'inbound', station, cruise, eta: a.runIn / a.speed + 6, time: 0,
      vel: new THREE.Vector3(dir.x * a.speed, 0, dir.z * a.speed),
      rockets: a.rockets, nextRocket: 0.8, nextGun: 1.6, pod: 0,
    };
  }
  s.releaseAt = s.loiter.eta;
  this.sorties.push(s);
  return s;
};

/**
 * Where an Apache hovers to work `target`: out on the camera's side at the
 * stand-off, turned round the target by its slot so a second and a third
 * take the air beside the first rather than the same air, and high enough
 * to be clear of whatever the town has built under it.
 */
AirWing.prototype._stationFor = function _stationFor(s, target) {
  const a = s.def.aircraft;
  const dx = target.x - this.camera.position.x, dz = target.z - this.camera.position.z;
  const dl = Math.hypot(dx, dz) || 1;
  const turn = [0, 0.55, -0.55, 1.1, -1.1, 1.6][s.slot % 6] + (a.offset || 0) / a.standoff;
  const c = Math.cos(turn), sn = Math.sin(turn);
  const ux = dx / dl, uz = dz / dl;
  const rx = ux * c - uz * sn, rz = ux * sn + uz * c;
  const station = target.clone();
  station.x -= rx * a.standoff;
  station.z -= rz * a.standoff;
  const along = this.ceilingAlong || (() => -Infinity);
  const ground = this.terrain ? this.terrain.heightAt(station.x, station.z) : 0;
  station.y = Math.max(target.y + a.height, ground + 40,
    along(station.x, station.z, station.x, station.z) + a.clearance);
  return station;
};

/** The target has changed: everything on station goes to it. */
AirWing.prototype.retarget = function retarget(point) {
  if (!point) return;
  for (const s of this.sorties) {
    const L = s.loiter;
    if (!L || s.done || L.phase === 'egress' || L.phase === 'down') continue;
    s.target = point.clone();
    if (L.orbit) continue;                       // the orbit drifts after it
    L.station = this._stationFor(s, point);
    if (L.phase === 'station' || L.phase === 'transit') {
      L.phase = 'transit';
      L.vel = L.vel || new THREE.Vector3();
      L.route = 0;
    }
  }
};

AirWing.prototype._updateLoiter = function _updateLoiter(s, dt) {
  if (s.loiter.orbit) { this._updateOrbit(s, dt); return; }
  const L = s.loiter, m = s.model, a = s.def.aircraft;
  const ground = (x, z) => (this.terrain ? this.terrain.heightAt(x, z) : 0);
  const along = this.ceilingAlong || (() => -Infinity);
  const face = (x, z, rate) => {
    const want = Math.atan2(x - m.position.x, z - m.position.z);
    let d = want - m.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    m.rotation.y += d * Math.min(1, dt * rate);
  };
  // Flying to a point: slow to arrive, nose down to go, and never lower
  // than what stands along the rest of the way.
  const flyTo = (st, top) => {
    const dx = st.x - m.position.x, dz = st.z - m.position.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.min(a.speed, Math.max(6, dist / 2.2));
    const ux = dist > 0.01 ? dx / dist : 0, uz = dist > 0.01 ? dz / dist : 0;
    L.vel.x += (ux * want - L.vel.x) * Math.min(1, dt * 1.4);
    L.vel.z += (uz * want - L.vel.z) * Math.min(1, dt * 1.4);
    // Climb first: it does not move sideways into something taller than it.
    const low = m.position.y < top - 4;
    const k = low ? 0.25 : 1;
    m.position.x += L.vel.x * dt * k;
    m.position.z += L.vel.z * dt * k;
    const fin = THREE.MathUtils.clamp((dist - 40) / 300, 0, 1);
    const alt = Math.max(st.y + (top - st.y) * fin, dist > 60 ? top : st.y);
    m.position.y += THREE.MathUtils.clamp(alt - m.position.y, -12 * dt, 16 * dt);
    const sp = Math.hypot(L.vel.x, L.vel.z);
    const pitch = THREE.MathUtils.clamp(sp / a.speed * 0.22, -0.12, 0.22);
    m.rotation.x += (pitch - m.rotation.x) * Math.min(1, dt * 2);
    face(dist > 60 ? st.x : s.target.x, dist > 60 ? st.z : s.target.z, 1.6);
    return dist;
  };

  if (L.phase === 'inbound' || L.phase === 'transit') {
    // The ceiling along what is left of the route, looked at twice a second.
    L.look = (L.look || 0) - dt;
    if (L.look <= 0) {
      L.look = 0.5;
      const st = L.station;
      L.top = Math.max(st.y, along(m.position.x, m.position.z, st.x, st.z) + a.clearance,
        ground(m.position.x, m.position.z) + 30);
    }
    if (L.phase === 'transit') L.time += dt;     // the clock runs on station, moving or not
    const dist = flyTo(L.station, L.top ?? L.station.y);
    if (dist < 25) {
      const first = L.phase === 'inbound';
      L.phase = 'station';
      if (first) {
        L.time = 0;
        if (this.onAirEvent) this.onAirEvent('onstation', { def: s.def, time: a.station });
      }
    }
  } else if (L.phase === 'station') {
    L.time += dt;
    const st = L.station;
    m.position.x += (st.x + Math.sin(L.time * 0.7) * 1.4 - m.position.x) * Math.min(1, dt * 1.5);
    m.position.z += (st.z + Math.cos(L.time * 0.53) * 1.1 - m.position.z) * Math.min(1, dt * 1.5);
    m.position.y += (st.y + Math.sin(L.time * 1.1) * 0.6 - m.position.y) * Math.min(1, dt * 1.5);
    m.rotation.x += (-0.03 - m.rotation.x) * Math.min(1, dt * 2);
    m.rotation.z = Math.sin(L.time * 0.9) * 0.03;
    face(s.target.x, s.target.z, 2.5);

    L.nextRocket -= dt;
    if (!L.hand && L.rockets > 0 && L.nextRocket <= 0) {
      L.nextRocket = a.every;
      for (let k = 0; k < a.pair && L.rockets > 0; k++, L.rockets--) this._loiterRocket(s, k);
      if (this.audio) this.audio.play('rocket', m.position, { rate: 1.35, gain: 0.5, rolloff: 900 });
    }
    L.nextGun -= dt;
    // The chin gun slews to what it is shooting at, or to the mark between
    // bursts, so it is seen to pick its targets; the burst goes when it is
    // laid on, from wherever the muzzle is.
    const gun = m.userData.gun;
    if (gun) this._layGun(m, gun, L.gunAim || s.target, dt);
    if (!L.hand && L.nextGun <= 0 && this.gunner) {
      L.nextGun = a.gun.every;
      const to = this.gunner.pick(s.target, a.gun.reach);
      if (to) {
        L.gunAim = to.clone();
        L.gunAimFor = 1.6;
        const from = gun
          ? gun.userData.muzzle.getWorldPosition(new THREE.Vector3())
          : this._v.set(0, -1.0, 6.2).applyEuler(m.rotation).add(m.position).clone();
        s.kills += this.gunner.fire(from, to.clone(), a.gun) || 0;
      }
    }
    if (L.gunAimFor !== undefined && (L.gunAimFor -= dt) <= 0) { L.gunAim = null; L.gunAimFor = undefined; }
  }
  if ((L.phase === 'station' || L.phase === 'transit')
    && (L.time > a.station || (L.rockets <= 0 && L.time > a.station * 0.8))) {
    L.phase = 'egress';
    L.out = 0;
    L.reported = true;
    if (this.onAirEvent) this.onAirEvent('offstation', { def: s.def, stones: s.stones, kills: s.kills });
  } else if (L.phase === 'egress') {
    L.out += dt;
    const back = this._v.copy(s.dir).multiplyScalar(-1).addScaledVector(s.side, 0.4).normalize();
    face(m.position.x + back.x * 100, m.position.z + back.z * 100, 1.2);
    const fwd = Math.min(a.speed, 8 + L.out * 9);
    m.position.x += Math.sin(m.rotation.y) * fwd * dt;
    m.position.z += Math.cos(m.rotation.y) * fwd * dt;
    m.position.y += Math.min(12, 2 + L.out * 2) * dt;
    m.rotation.x += (0.18 - m.rotation.x) * Math.min(1, dt * 1.5);
    if (L.out > 22) s.done = true;
  } else if (L.phase === 'down') {
    this._fallLoiter(s, dt, 2 + L.fall * 2.5);
  }
};

/**
 * Lay a chin turret on a point in the world: the turret turns, the barrel
 * elevates, both at the rate a real one slews and inside its real arcs —
 * a hundred and ten degrees either side, sixty down, eleven up.
 */
AirWing.prototype._layGun = function _layGun(m, gun, at, dt) {
  m.updateMatrixWorld(true);
  const local = m.worldToLocal(this._v.copy(at));
  const dx = local.x - gun.position.x, dy = local.y - gun.position.y, dz = local.z - gun.position.z;
  const yaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -1.92, 1.92);
  const pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.19, 1.05);
  const k = Math.min(1, dt * 3.2);
  gun.rotation.y += (yaw - gun.rotation.y) * k;
  const el = gun.userData.pitch;
  el.rotation.x += (pitch - el.rotation.x) * k;
};

/** The gunship's orbit, and its guns. */
AirWing.prototype._updateOrbit = function _updateOrbit(s, dt) {
  const L = s.loiter, m = s.model, a = s.def.aircraft;
  const R = a.radius;
  const bank = -0.32;                            // left wing down, into the turn
  if (L.phase === 'inbound') {
    m.position.addScaledVector(L.tangent, a.speed * dt);
    const along = this._v.copy(L.entry).sub(m.position).dot(L.tangent);
    // Roll into the turn over the last few seconds of the run.
    m.rotation.z = bank * THREE.MathUtils.clamp(1 - along / (a.speed * 4), 0, 1);
    if (along <= 0) {
      L.phase = 'station';
      L.time = 0;
      if (this.onAirEvent) this.onAirEvent('onstation', { def: s.def, time: a.station });
    }
    return;
  }
  if (L.phase === 'station') {
    L.time += dt;
    // The centre of the orbit drifts after the target rather than jumping,
    // so a new designation is a gentle shift of the whole circle.
    L.centre.x += (s.target.x - L.centre.x) * Math.min(1, dt * 0.25);
    L.centre.z += (s.target.z - L.centre.z) * Math.min(1, dt * 0.25);
    const wantY = Math.max(s.target.y + a.height, s.alt);
    m.position.y += (wantY - m.position.y) * Math.min(1, dt * 0.3);
    L.theta -= (a.speed / R) * dt;
    m.position.x = L.centre.x + R * Math.cos(L.theta);
    m.position.z = L.centre.z + R * Math.sin(L.theta);
    m.rotation.y = Math.atan2(Math.sin(L.theta), -Math.cos(L.theta));
    m.rotation.x = 0;
    m.rotation.z = bank;
    // The 105: out of the port side, a straight line down to the mark. Not
    // while the player has the gunner's seat: the shells are theirs then.
    L.nextShell -= dt;
    if (!L.hand && L.shells > 0 && L.nextShell <= 0) {
      L.nextShell = a.every;
      L.shells--;
      this._gunshipShell(s);
    }
    // The 30 mm, forward of the 105 on the same side: bursts on whoever is
    // nearest the mark, so the men round the building have the whole orbit
    // to keep their heads down in.
    L.nextGun -= dt;
    if (!L.hand && a.gun && L.nextGun <= 0 && this.gunner) {
      L.nextGun = a.gun.every * (0.85 + Math.random() * 0.3);
      const to = this.gunner.pick(s.target, a.gun.reach);
      if (to) {
        const from = new THREE.Vector3(3.77, -0.55, 6.2).applyEuler(m.rotation).add(m.position);
        s.kills += this.gunner.fire(from, to.clone(), a.gun) || 0;
        if (this.fx && this.fx.muzzleFlash) this.fx.muzzleFlash(from, this._v.copy(to).sub(from).normalize(), 0.7);
      }
    }
    if (L.time > a.station || L.shells <= 0) {
      L.phase = 'egress';
      L.out = 0;
      L.reported = true;
      if (this.onAirEvent) this.onAirEvent('offstation', { def: s.def, stones: s.stones, kills: s.kills });
    }
  } else if (L.phase === 'egress') {
    L.out += dt;
    m.rotation.z += (0 - m.rotation.z) * Math.min(1, dt * 0.8);
    const h = m.rotation.y;
    m.position.x += Math.sin(h) * a.speed * dt;
    m.position.z += Math.cos(h) * a.speed * dt;
    m.position.y += 6 * dt;
    if (L.out > 25) s.done = true;
  } else if (L.phase === 'down') {
    this._fallLoiter(s, dt, 0.4, a.speed * 0.6);
  }
};

/** Shot down: it spins or it dives, and it burns all the way in. */
AirWing.prototype._fallLoiter = function _fallLoiter(s, dt, spin, forward = 0) {
  const L = s.loiter, m = s.model, a = s.def.aircraft;
  const ground = (x, z) => (this.terrain ? this.terrain.heightAt(x, z) : 0);
  L.fall += dt;
  m.rotation.y += spin * dt;
  m.rotation.z = Math.max(-0.9, Math.min(0.9, m.rotation.z - dt * 0.3));
  if (forward) m.rotation.x = Math.min(0.6, m.rotation.x + dt * 0.12);
  L.vy = (L.vy || 0) - 9.81 * dt * 0.8;
  m.position.y += L.vy * dt;
  const v = L.vel || { x: 0, z: 0 };
  m.position.x += (forward ? Math.sin(m.rotation.y) * forward : v.x * 0.2) * dt;
  m.position.z += (forward ? Math.cos(m.rotation.y) * forward : v.z * 0.2) * dt;
  if (this.fx) this.fx.trail(m.position, 4.0);
  const g = ground(m.position.x, m.position.z);
  if (m.position.y <= g + 1.5 || L.fall > 20) {
    const p = m.position.clone(); p.y = Math.max(p.y, g);
    if (this.fx) this.fx.strikeBlast(p, a.orbit ? 2.4 : 1.6, { groundY: g });
    if (this.audio) this.audio.play('explosion', p, { gain: 0.8, rolloff: 900 });
    const fired = a.orbit ? L.shells < a.shells : L.rockets < a.rockets;
    if (this.onAirEvent && !L.reported && fired) this.onAirEvent('offstation', { def: s.def, stones: s.stones, kills: s.kills });
    m.visible = false;
    s.done = true;
  }
};

/** One 70 mm rocket from the pod on alternating sides, on a fast line to the mark. */
AirWing.prototype._loiterRocket = function _loiterRocket(s, k = 0, at = null, hand = false) {
  const m = s.model, a = s.def.aircraft, L = s.loiter;
  const podX = (L.pod++ % 2 === 0 ? 1 : -1) * 2.45;
  const from = new THREE.Vector3(podX, -0.52, 2.2).applyEuler(m.rotation).add(m.position);
  this._shoot(s, from, hand ? 0 : a.spread, a.muzzle, at, hand);
  if (this.fx && this.fx.muzzleFlash) this.fx.muzzleFlash(from, this._v.copy(at || s.target).sub(from).normalize(), hand ? 0.4 : 0.8);
};

/** One 105 mm round from the gunship's howitzer, down to the mark (or to a gunner's own point). */
AirWing.prototype._gunshipShell = function _gunshipShell(s, at = null, hand = false) {
  const m = s.model, a = s.def.aircraft;
  const from = new THREE.Vector3(4.7, -0.45, -5.6).applyEuler(m.rotation).add(m.position);
  this._shoot(s, from, hand ? 0 : a.spread, a.muzzle, at, hand);
  if (this.fx && this.fx.muzzleFlash) this.fx.muzzleFlash(from, this._v.copy(at || s.target).sub(from).normalize(), hand ? 0.6 : 1.6);
  if (this.audio) this.audio.play('gun', m.position, { rate: 0.8, gain: 0.7, rolloff: 1600 });
};

/**
 * The gunner's seat (battle.startSeat): where the sensor looks from, and
 * where each weapon's rounds leave. The gunship's ball is under the port
 * side, forward of the 105; the Apache's TADS is under the nose.
 */
AirWing.prototype.seatEye = function seatEye(s, out = new THREE.Vector3()) {
  const m = s.model, a = s.def.aircraft;
  // The TADS turret is on the very nose, ahead of the chin gun (which sits
  // at 5.35 and filled the picture from behind it).
  return a.orbit ? out.set(3.9, -1.6, 1.0).applyEuler(m.rotation).add(m.position)
    : out.set(0, -0.3, 7.6).applyEuler(m.rotation).add(m.position);
};
AirWing.prototype.seatMuzzle = function seatMuzzle(s, kind, out = new THREE.Vector3()) {
  const m = s.model, a = s.def.aircraft;
  if (a.orbit) return (kind === 'gun' ? out.set(3.77, -0.55, 6.2) : out.set(4.7, -0.45, -5.6)).applyEuler(m.rotation).add(m.position);
  const gun = m.userData.gun;
  if (kind === 'gun' && gun) return gun.userData.muzzle.getWorldPosition(out);
  return out.set(0, -0.52, 2.2).applyEuler(m.rotation).add(m.position);
};

/** A round on a ballistic line that lands on the mark, give or take `spread`; a gunner's round on his own point, dead on. */
AirWing.prototype._shoot = function _shoot(s, from, spread, muzzle, at = null, hand = false) {
  const p = s.def.projectile;
  const r = spread * Math.sqrt(Math.random()), t = Math.random() * Math.PI * 2;
  const to = (at || s.target).clone();
  to.x += Math.cos(t) * r; to.y += (Math.random() - 0.5) * spread; to.z += Math.sin(t) * r;
  const d = to.clone().sub(from);
  const T = d.length() / muzzle;
  const vel = d.multiplyScalar(1 / T);
  vel.y += 0.5 * p.gravity * T;
  this.projectiles.fire({
    pos: from, vel, gravity: p.gravity, kind: 'bomb', drag: 0, speed: muzzle,
    warhead: s.def.warhead, owner: null, target: to, trail: p.trail,
    strikeDef: s.def, sortie: s, hand,
  });
};

/**
 * What is on station, for the HUD: one entry per aircraft still working,
 * with the share of its time it has left. Inbound counts as all of it.
 */
AirWing.prototype.loiterStatus = function loiterStatus(out = []) {
  out.length = 0;
  for (const s of this.sorties) {
    const L = s.loiter;
    if (!L || s.done || L.phase === 'egress' || L.phase === 'down') continue;
    const a = s.def.aircraft;
    const left = L.phase === 'inbound' ? 1 : Math.max(0, 1 - L.time / a.station);
    out.push({ sortie: s, id: s.def.id, left, inbound: L.phase === 'inbound' });
  }
  return out;
};
