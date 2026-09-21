import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * The arsenal.
 *
 * Progression runs light anti-armour -> heavy anti-armour -> towed guns ->
 * self-propelled -> rocket artillery, which is roughly how you would actually
 * escalate against a hardened structure. The important gameplay distinction is
 * not raw damage but *what kind of hole each weapon makes*:
 *
 *   - shoulder-launched HEAT punches a narrow deep hole — good for cutting a
 *     specific pier, useless for volume
 *   - HE artillery removes a wide shallow bite — good for collapsing a course
 *   - rocket artillery saturates an area with many small craters at once
 *
 * Against the stability solver those produce genuinely different collapses,
 * so the tier you pick is a tactical choice and not just a damage number.
 *
 * The 3D models are the accurate artillery pieces from the FIREBASE project,
 * recompressed here (Draco + WebP) from 38 MB down to about 3 MB so the whole
 * game loads over a phone connection.
 */

/**
 * Olive drab. Every gun in the battery wears it, so a mixed line reads as one
 * army rather than as a shelf of differently painted models.
 */
export const ARTILLERY_GREEN = 0x3c4a2a;

export const UNITS = [
  {
    id: 'at4', name: 'AT4', full: 'M136 AT4 Team', tier: 'INF',
    cost: 60, unlockFrac: 0.0,
    model: 'infantry', modelFile: 'Friendly_Machine_Gunner',
    range: 255, reload: 3.8, setup: 1.0,
    crew: 2, health: 165,
    projectile: { kind: 'direct', speed: 220, gravity: 3.2, trail: 0.35 },
    warhead: { lethal: 0.9, radius: 2.8, power: 1100, fx: 0.5, kinetic: 0.2 },
    dispersion: 2.4,
    blurb: '84 mm HEAT. Cheap, fast, barely scratches stone — but it kills defenders.',
  },
  {
    id: 'gustaf', name: 'CARL GUSTAF', full: 'M3 MAAWS Team', tier: 'INF',
    cost: 115, unlockFrac: 0.0,
    model: 'infantry', modelFile: 'Friendly_Machine_Gunner',
    range: 300, reload: 4.4, setup: 1.2,
    crew: 2, health: 185,
    projectile: { kind: 'direct', speed: 255, gravity: 3.6, trail: 0.4 },
    warhead: { lethal: 1.2, radius: 3.6, power: 1900, fx: 0.7, kinetic: 0.3 },
    dispersion: 2.0,
    blurb: '84 mm recoilless, HEDP round. Reusable tube, real bite on masonry.',
  },
  {
    id: 'rpg32', name: 'RPG-32', full: 'RPG-32 Thermobaric', tier: 'INF',
    cost: 195, unlockFrac: 0.006,
    model: 'infantry', modelFile: 'Cannon_Crew_Member',
    range: 290, reload: 5.2, setup: 1.2,
    crew: 2, health: 185,
    projectile: { kind: 'direct', speed: 195, gravity: 4.0, trail: 0.6 },
    warhead: { lethal: 1.5, radius: 5.2, power: 2600, fx: 1.0, kinetic: 0.08 },
    dispersion: 3.2,
    blurb: '105 mm thermobaric. Wide overpressure — clears rooms and rattles walls.',
  },
  {
    id: 'javelin', name: 'JAVELIN', full: 'FGM-148 Javelin CLU', tier: 'INF',
    cost: 330, unlockFrac: 0.018,
    model: 'infantry', modelFile: 'Cannon_Crew_Member',
    range: 420, reload: 8.5, setup: 2.0,
    crew: 2, health: 175,
    projectile: { kind: 'topattack', speed: 145, gravity: 0, trail: 0.5 },
    warhead: { lethal: 1.4, radius: 4.2, power: 3400, fx: 0.9, kinetic: 0.45 },
    dispersion: 0.5,
    blurb: 'Top-attack, fire-and-forget. Pinpoint — cut a named pier with it.',
  },
  {
    id: 'm119', name: 'M119A3', full: 'M119A3 105 mm Howitzer', tier: 'GUN',
    cost: 700, unlockFrac: 0.038,
    tint: ARTILLERY_GREEN, model: 'M119', modelLength: 6.1,
    // The two towed guns are modelled along X — trail to muzzle across the
    // model's own axis — while the self-propelled vehicles are modelled nose
    // forward along Z. So these two need a quarter turn clockwise to put the
    // barrel where the gun is actually pointing, and the others must not have
    // one. (Measured: the M119 and M777 bounding boxes are 3.4:1 and 2.3:1
    // along X; the M109, M270 and M142 are long along Z.)
    modelYaw: -Math.PI / 2,
    range: 1100, reload: 6.0, setup: 5.0,
    crew: 5, health: 340,
    // Direct-fire howitzer: a high muzzle velocity on the *low* arc, so the
    // shell crosses the map fast and arrives hard and flat rather than lobbing
    // over and dropping in. `flat` tells the solver to take the low solution.
    projectile: { kind: 'arc', speed: 400, gravity: 9.81, trail: 0.9, flat: true },
    // Bigger than it was, but deliberately narrower than the tower is wide:
    // a burst radius larger than the section it hits removes the whole course
    // in one round, and a building cannot be undercut on one side if every
    // shell cuts clean through it.
    warhead: { lethal: 1.9, radius: 6.6, power: 6400, fx: 2.2, kinetic: 0.85 },
    dispersion: 4.2,
    blurb: '105 mm over open sights. Flat, fast and violent — it hits before you hear it.',
  },
  {
    id: 'm777', name: 'M777', full: 'M777A2 155 mm Howitzer', tier: 'GUN',
    cost: 1300, unlockFrac: 0.085,
    tint: ARTILLERY_GREEN, model: 'M777', modelLength: 10.7,
    range: 1400, reload: 8.0, setup: 7.0,
    crew: 7, health: 420,
    // The opposite quarter turn to the M119, because the two towed guns are
    // modelled facing opposite ways along their own X axis. Measured, not
    // guessed: sampling the maximum radius from the spine in twenty slices
    // along the long axis finds the barrel as the thin end — the M119's is at
    // +X (mean radius 0.38 against 0.68 at the other end) and the M777's is at
    // -X (0.91 against 1.48). Giving both the same yaw left this one pointing
    // exactly backwards.
    modelYaw: Math.PI / 2,
    projectile: { kind: 'arc', speed: 360, gravity: 9.81, trail: 0.9 },
    warhead: { lethal: 2.6, radius: 8.4, power: 8200, fx: 1.8, kinetic: 0.7 },
    dispersion: 5.0,
    blurb: '155 mm towed. This is where stone starts leaving in lorry-loads.',
  },
  {
    id: 'm109', name: 'PALADIN', full: 'M109A7 Paladin SPH', tier: 'SPH',
    cost: 2200, unlockFrac: 0.15,
    tint: ARTILLERY_GREEN, model: 'M109', modelLength: 9.7,
    range: 1600, reload: 6.5, setup: 3.0,
    crew: 0, health: 620,
    projectile: { kind: 'arc', speed: 420, gravity: 9.81, trail: 1.0 },
    warhead: { lethal: 2.8, radius: 9.0, power: 9200, fx: 2.0, kinetic: 0.7 },
    dispersion: 4.0,
    blurb: 'Armoured, self-propelled, shrugs off small arms. Sets up in seconds.',
  },
  {
    id: 'm270', name: 'M270 MLRS', full: 'M270A2 MLRS', tier: 'MRL',
    cost: 3600, unlockFrac: 0.25,
    tint: ARTILLERY_GREEN, model: 'M270', modelLength: 7.0,
    // The launcher box points down +Z in the file; the game's forward is
    // the other way, and it was shooting out of its own back.
    modelYaw: Math.PI,
    minRange: 200, range: 2000, reload: 15.0, setup: 4.0,
    crew: 0, health: 480,
    projectile: { kind: 'rocket', speed: 300, gravity: 9.81, trail: 1.4 },
    warhead: { lethal: 2.2, radius: 7.0, power: 6200, fx: 1.6, kinetic: 0.5 },
    dispersion: 14.0,
    salvo: { count: 6, interval: 0.35 },
    blurb: 'Six-rocket ripple. Saturates a whole face at once — messy and superb.',
  },
  {
    id: 'm142', name: 'HIMARS', full: 'M142 HIMARS', tier: 'MRL',
    cost: 5200, unlockFrac: 0.37,
    tint: ARTILLERY_GREEN, model: 'M142', modelLength: 7.0,
    // The model is posed with its pod elevated over the rear, so laid nose
    // forward it reads from the bird's-eye camera as a truck driving away
    // from the target. Turned to put the cab toward the target, which is what
    // the player asked for; and it has no barrel for the facing test to find,
    // so that test is told not to look.
    modelYaw: 0,
    noBarrel: true,
    minRange: 200, range: 2600, reload: 18.0, setup: 3.5,
    crew: 0, health: 420,
    projectile: { kind: 'rocket', speed: 360, gravity: 9.81, trail: 1.6 },
    warhead: { lethal: 3.8, radius: 12.5, power: 17000, fx: 3.0, kinetic: 0.6 },
    dispersion: 3.0,
    salvo: { count: 2, interval: 1.1 },
    blurb: 'GPS-guided 227 mm. Precise, enormous, and it ends arguments.',
  },
  // ── Air. Called, not placed: the aircraft comes in from behind the camera,
  // drops on the point you tap, and leaves. `strike.frac` is the share of a
  // building the bomb takes: the blast radius is sized on arrival to enclose
  // that fraction of whatever it lands on, so it is ten per cent of a clock
  // tower and ten per cent of the Great Pyramid alike.
  //
  // `strike.bite` is how far across the masonry at that height the hole is
  // allowed to reach, and `strike.shock` how many blast radii the mortar is
  // shaken out to. Both are how the Eagle is kept to what its blurb promises:
  // a low hit used to sever a tower's whole cross section and shake the
  // mortar out of two hundred feet of shaft above it, so a single $200k
  // 500-pounder laid the Elizabeth Tower flat — a tenth of the building on
  // paper, all of it in practice. Held to a bite and a short shock it takes
  // its tenth and the tower stands. The Lancer has neither, which is what the
  // extra $300k buys: the MOAB still fells a tower in one pass.
  {
    id: 'f15', name: 'F-15E', full: 'F-15E Strike Eagle · GBU-12 500 lb', tier: 'AIR',
    cost: 200000, unlockFrac: 0.12,
    model: 'aircraft', strike: { frac: 0.10, maxR: 64, minR: 9, fx: 4.6, bite: 0.62, shock: 1.2 },
    aircraft: { kind: 'eagle', speed: 230, height: 110, clearance: 45, runIn: 2400, offset: 40 },
    range: 2600, reload: 0, setup: 0, crew: 0, health: 1,
    projectile: { kind: 'bomb', speed: 230, gravity: 9.81, drag: 0.04, trail: 0.8 },
    warhead: { lethal: 30, radius: 40, power: 90000, fx: 4.6, kinetic: 0.35 },
    dispersion: 0,
    blurb: 'One pass, one 500-pounder, a tenth of the building. It will not fell a tower on its own.',
  },
  {
    id: 'b1', name: 'MOAB', full: 'B-1B Lancer · GBU-43/B MOAB', tier: 'AIR',
    cost: 500000, unlockFrac: 0.25,
    model: 'aircraft', strike: { frac: 0.35, maxR: 120, minR: 18, fx: 9.5 },
    aircraft: { kind: 'lancer', speed: 210, height: 330, clearance: 150, runIn: 3200, offset: 60 },
    range: 2600, reload: 0, setup: 0, crew: 0, health: 1,
    projectile: { kind: 'bomb', speed: 210, gravity: 9.81, drag: 0.11, trail: 1.4 },
    warhead: { lethal: 90, radius: 110, power: 400000, fx: 9.5, kinetic: 0.4 },
    dispersion: 0,
    blurb: 'Eleven tonnes of high explosive on a parachute. A third of anything.',
  },
];

export const UNITS_BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u]));

/** Shared GLB cache with Draco decoding. */
export class ModelLibrary {
  constructor() {
    const draco = new DRACOLoader();
    draco.setDecoderPath('assets/draco/');
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(draco);
    this.cache = new Map();
  }

  async load(file, targetLength, opts = {}) {
    const key = `${file}:${targetLength}:${opts.tint ?? ''}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const gltf = await this.loader.loadAsync(`assets/${file}.glb`);
    const root = gltf.scene;

    // Normalise: the source models come in at wildly different scales, so
    // rescale each to its real-world length and sit it on the ground plane.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0 && targetLength) root.scale.setScalar(targetLength / maxDim);

    root.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(root);
    const centre = box2.getCenter(new THREE.Vector3());
    root.position.x -= centre.x;
    root.position.z -= centre.z;
    root.position.y -= box2.min.y;

    /**
     * Repaint.
     *
     * The source models come in whatever livery they were authored with, which
     * across a mixed battery reads as a toy collection rather than an army.
     * Everything wearing a gun tube gets the same olive drab, with the original
     * material's luminance kept so panel lines, shadowed recesses and rubber
     * still read — a flat repaint would turn each vehicle into a silhouette.
     */
    const tint = opts.tint ? new THREE.Color(opts.tint) : null;
    const repainted = new Map();   // source material -> its repainted clone
    const convert = (src) => {
      let m = src;
      if (tint) {
        m = repainted.get(src);
        if (!m) {
          m = src.clone();
          const c = src.color;
          const lum = c ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : 0.5;
          // Keep the original's luminance so panel lines, shadowed recesses
          // and rubber still read; a flat repaint gives a silhouette.
          m.color = tint.clone().multiplyScalar(0.5 + Math.min(1.2, lum * 1.6));
          m.map = null;              // the factory livery fights the repaint
          repainted.set(src, m);
        }
      }
      m.side = THREE.FrontSide;
      // Source materials are often near-black metal; lift them so they read
      // against the terrain at bird's-eye distance.
      if (m.metalness !== undefined) {
        m.metalness = Math.min(m.metalness ?? 0, 0.28);
        m.roughness = Math.max(m.roughness ?? 0.7, 0.62);
      }
      return m;
    };

    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (!o.material) return;
      o.material = Array.isArray(o.material)
        ? o.material.map(convert)
        : convert(o.material);
    });

    // Wrap so callers can rotate the wrapper without fighting the normalisation.
    const wrapper = new THREE.Group();
    wrapper.add(root);
    this.cache.set(key, wrapper);
    return wrapper;
  }

  instance(wrapper) {
    const clone = wrapper.clone(true);
    clone.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    return clone;
  }
}

/** A crude but readable stand-in soldier, built from boxes. */
export function makeInfantryMesh(colour = 0x4a5340) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92, metalness: 0.02 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d6a4f, roughness: 0.85 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), mat);
  torso.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skin);
  head.position.y = 1.63;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.58), mat);
  helmet.position.y = 1.66;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.2), mat);
  legL.position.set(-0.13, 0.39, 0);
  const legR = legL.clone(); legR.position.x = 0.13;
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 1.0, 7),
    new THREE.MeshStandardMaterial({ color: 0x33382c, roughness: 0.7 }),
  );
  tube.rotation.z = Math.PI / 2;
  tube.rotation.y = 0.16;
  tube.position.set(0.1, 1.34, 0.2);

  for (const m of [torso, head, helmet, legL, legR, tube]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
