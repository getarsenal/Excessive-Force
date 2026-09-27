import * as THREE from 'three';

/**
 * Ground vehicles built in code, at true scale, nose along +Z.
 *
 * The towed guns and the self-propelled pieces are GLB models; a unit that has
 * no file yet is built here from primitives the way the airframes are, so it
 * reads as itself from the camera distance the game plays at, and is replaced
 * by a model when one exists. Everything is in metres off the published
 * drawings; a wrapper centres it in plan and puts its wheels on the ground.
 */

function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * M1128 Stryker Mobile Gun System.
 *
 * Hull 6.95 m long, 2.72 m wide, 2.64 m to the turret roof; eight 1.1 m
 * wheels on four axles, the front pair closer together than the rear; a low
 * unmanned turret carrying the 105 mm M68A2 with its bore evacuator and
 * muzzle brake, the autoloader hump behind it; slat armour on the flanks,
 * smoke dischargers on the turret cheeks, two whip antennas, headlamps in the
 * glacis. Painted the Army's green-grey.
 */
export function makeStryker() {
  const g = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x4b5349, roughness: 0.78, metalness: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6, metalness: 0.4 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.95, metalness: 0.05 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f3c, roughness: 0.5, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.2, metalness: 0.8 });

  // ── Hull: a slab body, a sloped glacis, a shallower nose plate under it,
  // a raised driver's station forward left, and the rear ramp.
  const H = { w: 2.72, floor: 0.62, top: 1.95 };
  const hullH = H.top - H.floor;
  g.add(part(new THREE.BoxGeometry(H.w, hullH, 5.3), green, 0, (H.top + H.floor) / 2, -0.55));
  // Glacis: the front plate rising from the nose point back to the roof,
  // and the lower plate falling from the same point back to the wheels;
  // the wedge between them is filled so no light shows through.
  const glacis = part(new THREE.BoxGeometry(H.w, 0.16, 1.40), green, 0, 1.56, 2.72);
  glacis.rotation.x = 0.60;
  g.add(glacis);
  const nose = part(new THREE.BoxGeometry(H.w, 0.16, 0.62), green, 0, 0.95, 3.10);
  nose.rotation.x = -0.84;
  g.add(nose);
  g.add(part(new THREE.BoxGeometry(H.w - 0.02, 0.73, 0.62), green, 0, 1.085, 2.40));
  g.add(part(new THREE.BoxGeometry(H.w - 0.04, 0.28, 0.26), green, 0, 1.04, 2.82));
  g.add(part(new THREE.BoxGeometry(H.w - 0.04, 0.26, 0.20), green, 0, 0.79, 2.79));
  // Driver's hatch and periscopes, forward left.
  g.add(part(new THREE.BoxGeometry(0.7, 0.14, 0.7), dark, -0.85, H.top + 0.07, 1.75));
  for (let k = 0; k < 3; k++) g.add(part(new THREE.BoxGeometry(0.14, 0.1, 0.1), glass, -1.05 + k * 0.2, H.top + 0.12, 2.12));
  // Rear plate with the ramp seam and the exhaust on the right.
  g.add(part(new THREE.BoxGeometry(H.w * 0.9, hullH * 0.8, 0.1), dark, 0, (H.top + H.floor) / 2, -3.22));
  g.add(part(new THREE.BoxGeometry(0.5, 0.36, 0.8), steel, 1.15, H.top - 0.1, -2.9));
  // Side skirts and the slat armour cages along both flanks.
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.08, 0.5, 5.0), green, s * (H.w / 2 + 0.05), H.floor + 0.3, -0.5));
    for (let k = 0; k < 9; k++) {
      g.add(part(new THREE.BoxGeometry(0.03, hullH * 0.86, 0.05), steel, s * (H.w / 2 + 0.34), (H.top + H.floor) / 2 + 0.05, -2.75 + k * 0.56));
    }
    g.add(part(new THREE.BoxGeometry(0.03, 0.05, 4.7), steel, s * (H.w / 2 + 0.34), H.top - 0.15, -0.5));
    g.add(part(new THREE.BoxGeometry(0.03, 0.05, 4.7), steel, s * (H.w / 2 + 0.34), H.floor + 0.25, -0.5));
    // Stowage bins on the flanks aft.
    g.add(part(new THREE.BoxGeometry(0.22, 0.5, 1.3), green, s * (H.w / 2 + 0.13), H.top - 0.3, -2.2));
    // Headlamps in the glacis, mirrors on the cheeks.
    g.add(part(new THREE.BoxGeometry(0.26, 0.2, 0.1), glass, s * 1.0, 1.0, 3.16, -0.84, 0, 0));
    g.add(part(new THREE.BoxGeometry(0.06, 0.28, 0.2), dark, s * (H.w / 2 + 0.3), H.top + 0.25, 2.2));
  }

  // ── Eight wheels on four axles: the front pair close, the rear pair close,
  // the gap between them where the hull is deepest.
  const R = 0.55, tyre = 0.36;
  for (const z of [2.45, 1.3, -0.9, -2.1]) {
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.add(part(new THREE.CylinderGeometry(R, R, tyre, 20), rubber, 0, 0, 0, 0, 0, Math.PI / 2));
      w.add(part(new THREE.CylinderGeometry(R * 0.6, R * 0.6, tyre + 0.02, 14), steel, 0, 0, 0, 0, 0, Math.PI / 2));
      w.add(part(new THREE.CylinderGeometry(R * 0.2, R * 0.2, tyre + 0.08, 10), dark, 0, 0, 0, 0, 0, Math.PI / 2));
      w.position.set(s * (H.w / 2 - tyre / 2 + 0.02), R, z);
      w.name = 'wheel';
      g.add(w);
    }
    // The axle and the hub carrier between each pair.
    g.add(part(new THREE.CylinderGeometry(0.08, 0.08, H.w - 0.5, 8), dark, 0, R, z, 0, 0, Math.PI / 2));
  }

  // ── The turret: low and unmanned, set aft of centre, with the gun.
  const T = { y: H.top, h: 0.62, z: -0.6 };
  g.add(part(new THREE.BoxGeometry(2.3, T.h, 2.1), green, 0, T.y + T.h / 2, T.z));
  // Chamfered front cheeks.
  for (const s of [-1, 1]) {
    const cheek = part(new THREE.BoxGeometry(0.5, T.h, 0.7), green, s * 1.1, T.y + T.h / 2, T.z + 1.0);
    cheek.rotation.y = -s * 0.5;
    g.add(cheek);
    // Smoke dischargers: a bank of four tubes on each cheek.
    for (let k = 0; k < 4; k++) {
      g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), dark, s * (0.7 + k * 0.13), T.y + T.h + 0.1, T.z + 1.15, -0.6, 0, 0));
    }
  }
  // Autoloader hump and the commander's sight.
  g.add(part(new THREE.BoxGeometry(1.5, 0.42, 1.3), green, 0, T.y + T.h + 0.21, T.z - 0.5));
  g.add(part(new THREE.BoxGeometry(0.42, 0.34, 0.46), dark, 0.75, T.y + T.h + 0.17, T.z + 0.3));
  g.add(part(new THREE.BoxGeometry(0.3, 0.12, 0.2), glass, 0.75, T.y + T.h + 0.34, T.z + 0.48));
  // The mantlet and the 105 mm gun: 5.5 m of barrel with the bore evacuator
  // two thirds of the way out and a muzzle brake on the end.
  const gunY = T.y + T.h * 0.55;
  g.add(part(new THREE.BoxGeometry(0.6, 0.5, 0.6), dark, 0, gunY, T.z + 1.35));
  g.add(part(new THREE.CylinderGeometry(0.075, 0.09, 5.5, 12), dark, 0, gunY, T.z + 1.35 + 2.75, Math.PI / 2, 0, 0));
  g.add(part(new THREE.CylinderGeometry(0.11, 0.11, 0.55, 12), dark, 0, gunY, T.z + 1.35 + 3.8, Math.PI / 2, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.26, 0.22, 0.34), dark, 0, gunY, T.z + 1.35 + 5.5));
  // Coaxial gun and the antennas.
  g.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), dark, 0.42, gunY + 0.05, T.z + 1.6, Math.PI / 2, 0, 0));
  for (const [x, z] of [[-1.0, -1.4], [1.0, -1.5]]) {
    g.add(part(new THREE.CylinderGeometry(0.012, 0.02, 2.2, 6), dark, x, T.y + T.h + 1.1, z));
  }
  g.name = 'stryker';
  return g;
}
