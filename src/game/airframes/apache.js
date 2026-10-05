import * as THREE from 'three';
import { part, loft, surface, pair } from './geo.js';

const Z0 = -8.3, Z1 = 7.25;

/**
 * The Apache's paint, drawn once and wrapped round the body: helicopter
 * drab with the panel lines, the dark anti-glare ahead of the gunner's
 * windscreen, the low-visibility U.S. ARMY on the boom and the serial on
 * the tail, the walkways on the engine deck. Nothing on the cockpit sides,
 * which carry the nose art.
 */
function apacheSkin() {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const row = (z) => (1 - (z - Z0) / (Z1 - Z0)) * H;
  const col = (u) => u * W;
  g.fillStyle = '#3a3f36'; g.fillRect(0, 0, W, H);
  // The sensor nose is darker; the anti-glare ahead of the windscreen.
  g.fillStyle = '#2a2e29'; g.fillRect(0, 0, W, row(6.4));
  g.fillStyle = '#1c1f1b';
  g.beginPath(); g.ellipse(col(0.25), (row(6.0) + row(6.9)) / 2, col(0.08), (row(6.0) - row(6.9)) / 2, 0, 0, Math.PI * 2); g.fill();
  // Panel lines: frames every metre or so and the long seams.
  g.strokeStyle = 'rgba(10,12,10,0.28)'; g.lineWidth = 1.5;
  for (let z = 6; z > -8.3; z -= 1.1) { g.beginPath(); g.moveTo(0, row(z)); g.lineTo(W, row(z)); g.stroke(); }
  for (const u of [0.1, 0.4, 0.6, 0.9]) { g.beginPath(); g.moveTo(col(u), row(6.4)); g.lineTo(col(u), H); g.stroke(); }
  // Access panels on the sides of the engine bay and the boom, and the
  // avionics bays each side of the gunner, aft of the nose-art patch.
  const box = (u0, u1, z0, z1) => g.strokeRect(col(u0), row(z1), col(u1 - u0), row(z0) - row(z1));
  g.strokeStyle = 'rgba(10,12,10,0.4)'; g.lineWidth = 1.2;
  box(0.03, 0.12, 0.2, 2.3); box(0.38, 0.47, 0.2, 2.3); box(0.04, 0.1, -3.6, -1.4); box(0.4, 0.46, -3.6, -1.4);
  // Walkways on the engine deck.
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(col(0.2), row(2.6), col(0.1), row(0.0) - row(2.6));
  // U.S. ARMY on the boom and the serial on the tail, low visibility.
  g.fillStyle = '#5a6054'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const u of [0.05, 0.45]) { g.save(); g.translate(col(u), (row(-2.6) + row(-5.4)) / 2); g.rotate(Math.PI / 2); g.fillText('U.S. ARMY', 0, 0); g.restore(); }
  g.font = 'bold 18px sans-serif';
  for (const u of [0.05, 0.45]) { g.save(); g.translate(col(u), (row(-6.2) + row(-7.6)) / 2); g.rotate(Math.PI / 2); g.fillText('0-05588', 0, 0); g.restore(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * AH-64E Apache. 15.1 m of fuselage under a 14.6 m rotor, nose along +Z.
 *
 * What makes it read as an Apache from the game's distance: the two stepped
 * cockpits in flat-paned glass, the sensor turret on the nose with the chain
 * gun under it, the engines slung high either side of the body with their
 * exhausts turned out, the mast with the Longbow radome on top, the stub
 * wings hung with Hellfire racks and rocket pods, and the tail rotor set
 * high on the left of the fin. Painted the Army's helicopter drab.
 *
 * `rotorA` and `tailrotor` are spun by the sortie; the first Hellfire is
 * named `bomb` and is the one that leaves the rail.
 */
export function makeApache() {
  const g = new THREE.Group();
  const drab = new THREE.MeshStandardMaterial({ color: 0x3a3f36, roughness: 0.8, metalness: 0.2 });
  const skinTex = apacheSkin();
  const skin = skinTex ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.8, metalness: 0.2 }) : drab;
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.55, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.16, metalness: 0.82 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4d5445, roughness: 0.75, metalness: 0.2 });

  // The body: a narrow, deep fuselage. The sensor nose, the two cockpits
  // stepping up, the engine bay where it is widest, and the boom drawn out
  // to the fin with a rise in it.
  g.add(part(loft([
    { z: 7.25, w: 0.42, h: 0.50, y: -0.10, n: 2.2 },
    { z: 6.40, w: 0.98, h: 1.30, y: 0.00, n: 2.6 },
    { z: 5.10, w: 1.14, h: 1.78, y: 0.16, n: 3.0 },
    { z: 3.70, w: 1.22, h: 2.10, y: 0.34, n: 3.2 },
    { z: 2.30, w: 1.40, h: 2.00, y: 0.28, n: 3.2 },
    { z: 0.20, w: 1.32, h: 1.70, y: 0.24, n: 3.0 },
    { z: -2.00, w: 1.00, h: 1.22, y: 0.36, n: 2.8 },
    { z: -4.60, w: 0.70, h: 0.86, y: 0.52, n: 2.6 },
    { z: -7.00, w: 0.56, h: 0.70, y: 0.70, n: 2.4 },
    { z: -8.30, w: 0.40, h: 0.56, y: 0.80, n: 2.2 },
  ], 16, { uv: true }), skin, 0, 0, 0));

  // The cockpits: flat panes, the gunner low and forward, the pilot behind
  // and above him, a windscreen leaning back over the gunner.
  g.add(part(new THREE.BoxGeometry(1.10, 0.74, 1.30), glass, 0, 0.78, 5.55));
  g.add(part(new THREE.BoxGeometry(1.16, 0.80, 1.40), glass, 0, 1.14, 3.95));
  const screen = part(new THREE.BoxGeometry(1.00, 0.08, 0.95), glass, 0, 0.92, 6.30);
  screen.rotation.x = -0.75;
  g.add(screen);
  // The canopy frame between the two seats, and the roof over the pilot;
  // the frames round each flat pane, which are what make the glazing read
  // as panes rather than two glass boxes.
  g.add(part(new THREE.BoxGeometry(1.18, 0.86, 0.14), drab, 0, 1.0, 4.72));
  g.add(part(new THREE.BoxGeometry(1.16, 0.10, 1.50), drab, 0, 1.56, 3.95));
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.05, 0.78, 0.06), dark, s * 0.56, 0.78, 6.18));
    g.add(part(new THREE.BoxGeometry(0.05, 0.78, 0.06), dark, s * 0.56, 0.78, 4.92));
    g.add(part(new THREE.BoxGeometry(0.05, 0.84, 0.06), dark, s * 0.59, 1.14, 3.26));
    g.add(part(new THREE.BoxGeometry(0.05, 0.06, 1.42), dark, s * 0.59, 1.54, 3.95));
    g.add(part(new THREE.BoxGeometry(0.05, 0.06, 1.32), dark, s * 0.56, 1.14, 5.55));
    // The side-window sills and the door hinge line.
    g.add(part(new THREE.BoxGeometry(0.05, 0.05, 1.32), dark, s * 0.56, 0.42, 5.55));
  }
  // The windscreen's centre post and the wiper.
  g.add(part(new THREE.BoxGeometry(0.06, 0.1, 1.0), dark, 0, 0.98, 6.3, -0.75));
  // Lights: red to port, green to starboard, white on the tail, the beacon.
  g.add(part(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 2.7, 0.22, 1.3));
  g.add(part(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0x40ff70 }), -2.7, 0.22, 1.3));
  g.add(part(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.85, -8.35));
  g.add(part(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 1.05, -3.9));

  // The nose: the TADS/PNVS turret, a drum across the nose with the sensor
  // windows in its face, and the M230 chain gun on its cradle under it.
  g.add(part(new THREE.CylinderGeometry(0.44, 0.44, 0.86, 14), dark, 0, -0.08, 6.95, 0, 0, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.34, 0.30, 0.22), glass, -0.22, -0.02, 7.32));
  g.add(part(new THREE.BoxGeometry(0.30, 0.26, 0.22), glass, 0.24, -0.06, 7.32));
  g.add(part(new THREE.BoxGeometry(0.46, 0.34, 0.90), dark, 0, -0.98, 4.90));
  g.add(part(new THREE.CylinderGeometry(0.05, 0.06, 1.70, 8), black, 0, -1.02, 5.85, Math.PI / 2 - 0.04, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.16, 0.20, 0.24), dark, 0, -1.02, 6.60));

  // The engines: two nacelles high on the shoulders behind the cockpit, an
  // intake screen on the front of each, the exhaust turned out through the
  // infrared suppressor at the back.
  for (const s of [-1, 1]) {
    g.add(part(loft([
      { z: 3.00, w: 0.74, h: 0.74, n: 2.3 },
      { z: 1.60, w: 0.86, h: 0.88, n: 2.6 },
      { z: -0.40, w: 0.80, h: 0.82, n: 2.6 },
      { z: -1.30, w: 0.66, h: 0.70, n: 2.4 },
    ], 10), drab, s * 1.18, 0.92, 0));
    g.add(part(new THREE.CylinderGeometry(0.30, 0.30, 0.10, 12), black, s * 1.18, 0.92, 3.02, Math.PI / 2, 0, 0));
    const ex = part(new THREE.BoxGeometry(0.62, 0.50, 0.70), dark, s * 1.42, 0.92, -1.60);
    ex.rotation.y = s * 0.55;
    g.add(ex);
    // The fairing that ties the nacelle to the body.
    g.add(part(new THREE.BoxGeometry(0.60, 0.70, 3.40), drab, s * 0.78, 0.85, 0.80));
  }

  // The mast, the rotor head and the Longbow radome on top of it.
  g.add(part(new THREE.CylinderGeometry(0.16, 0.22, 1.10, 10), dark, 0, 1.85, 1.60));
  g.add(part(new THREE.CylinderGeometry(0.62, 0.66, 0.34, 16), drab, 0, 2.86, 1.60));
  const rotor = new THREE.Group();
  rotor.add(part(new THREE.CylinderGeometry(0.34, 0.40, 0.44, 12), dark, 0, 0, 0));
  for (let k = 0; k < 4; k++) {
    const holder = new THREE.Group();
    holder.add(part(new THREE.BoxGeometry(6.90, 0.07, 0.53), black, 3.75, 0.06, 0));
    // The swept tips, which are the one thing that says Apache from above.
    const tip = part(new THREE.BoxGeometry(0.60, 0.06, 0.40), black, 7.35, 0.06, -0.14);
    tip.rotation.y = 0.35;
    holder.add(tip);
    holder.rotation.y = (k / 4) * Math.PI * 2;
    rotor.add(holder);
  }
  rotor.add(part(new THREE.CylinderGeometry(7.4, 7.4, 0.04, 28),
    new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0.06, 0));
  rotor.position.set(0, 2.42, 1.60);
  rotor.name = 'rotorA';
  g.add(rotor);

  // The stub wings and what hangs off them: a four-round Hellfire rack on
  // each inboard pylon, a nineteen-shot rocket pod on each outboard one.
  const wing = surface({ span: 2.05, root: 1.10, tip: 0.86, sweep: 0.12, thick: 0.17, ridge: 0.4 });
  pair(g, wing, drab, 0.70, 0.22, 1.85);
  let hellfire = 0;
  for (const s of [-1, 1]) {
    for (const [x, outboard] of [[1.55, false], [2.45, true]]) {
      // The pylon: a swept plate hanging from the wing.
      g.add(part(new THREE.BoxGeometry(0.14, 0.52, 0.86), drab, s * x, -0.10, 1.35));
      if (!outboard) {
        // The M299 rail: a beam with the four missiles two over two.
        g.add(part(new THREE.BoxGeometry(0.62, 0.16, 1.30), dark, s * x, -0.40, 1.30));
        for (const dx of [-0.22, 0.22]) {
          for (const dy of [-0.16, -0.60]) {
            const m = part(new THREE.CylinderGeometry(0.09, 0.09, 1.63, 10), olive, s * x + dx, -0.40 + dy, 1.20, Math.PI / 2, 0, 0);
            // Seeker dome, fins fore and aft.
            const round = new THREE.Group();
            round.add(m);
            round.add(part(new THREE.SphereGeometry(0.09, 10, 8), glass, s * x + dx, -0.40 + dy, 2.02));
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
        // The M261 pod: a drum with the nineteen tubes read as a dark face.
        g.add(part(new THREE.CylinderGeometry(0.24, 0.24, 1.68, 14), olive, s * x, -0.52, 1.20, Math.PI / 2, 0, 0));
        g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 14), black, s * x, -0.52, 2.05, Math.PI / 2, 0, 0));
      }
    }
  }

  // The tail: the fin standing up from the end of the boom, the stabilator
  // at its foot, and the tail rotor high on the left of the fin.
  const fin = surface({ span: 2.05, root: 1.55, tip: 0.85, sweep: 0.55, thick: 0.22 });
  const finMesh = new THREE.Mesh(fin, drab);
  finMesh.position.set(0, 0.95, -6.90);
  finMesh.rotation.z = Math.PI / 2;
  finMesh.castShadow = true;
  g.add(finMesh);
  const stab = surface({ span: 1.70, root: 0.92, tip: 0.66, sweep: 0.20, thick: 0.14 });
  pair(g, stab, drab, 0.22, 0.70, -7.20);
  const tail = new THREE.Group();
  tail.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.30, 10), dark, 0, 0, 0, 0, 0, Math.PI / 2));
  // Four blades in the Apache's off-square X, two pairs fifty-five degrees apart.
  for (const a of [0, 0.96, Math.PI, Math.PI + 0.96]) {
    const holder = new THREE.Group();
    holder.add(part(new THREE.BoxGeometry(0.06, 1.38, 0.24), black, 0, 0.72, 0));
    holder.rotation.x = a;
    tail.add(holder);
  }
  tail.add(part(new THREE.CylinderGeometry(1.42, 1.42, 0.04, 20),
    new THREE.MeshBasicMaterial({ color: 0x1c1e20, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, 0, 0, Math.PI / 2));
  tail.position.set(-0.36, 2.55, -7.55);
  tail.name = 'tailrotor';
  g.add(tail);
  // The gearbox fairing the tail rotor sits on.
  g.add(part(new THREE.BoxGeometry(0.30, 0.50, 0.70), drab, -0.10, 2.55, -7.55));

  // The undercarriage: two tall struts forward with the wheels on the
  // outside of them, a drag brace back to the belly, and the tail wheel.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.CylinderGeometry(0.06, 0.07, 1.30, 8), dark, s * 1.10, -1.05, 4.10, 0, 0, s * 0.18));
    g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 1.70, 8), dark, s * 0.95, -1.05, 3.30, 0.95, 0, s * 0.12));
    g.add(part(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14), black, s * 1.28, -1.68, 4.10, 0, 0, Math.PI / 2));
    g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 10), dark, s * 1.28, -1.68, 4.10, 0, 0, Math.PI / 2));
  }
  g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 0.60, 8), dark, 0, 0.05, -6.40));
  g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10), black, 0, -0.30, -6.40, 0, 0, Math.PI / 2));

  // Pitot, wire cutters, antennas: the fuzz that stops it looking moulded.
  g.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), dark, 0.42, 0.55, 7.10, Math.PI / 2, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.06, 0.55, 0.10), dark, 0, 1.98, 3.00, -0.6, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.06, 0.32, 0.20), dark, 0, 1.05, -3.60));
  g.add(part(new THREE.BoxGeometry(0.06, 0.22, 0.18), dark, 0.30, -0.55, -1.40));

  // Where the nose art goes: the fuselage side under the two cockpits, above
  // the gun and ahead of the stub wing; the rotor disc would otherwise put it
  // on the gunner's glass.
  g.userData.noseArt = { z: 4.25, y: -0.05, w: 1.6 };
  g.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
  return g;
}

