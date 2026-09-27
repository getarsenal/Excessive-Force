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
    id: 'm120', name: 'M120 MORTAR', full: 'M120 120 mm Mortar Team', tier: 'INF',
    cost: 240, unlockFrac: 0.0,
    tint: 0x5a6a52, model: 'infantry',
    range: 620, reload: 7.0, setup: 3.0,
    crew: 3, health: 120,
    // Indirect and slow: a high arc that comes down on a roof or a terrace the
    // guns cannot see, with a fifth of a howitzer's punch.
    projectile: { kind: 'arc', speed: 150, gravity: 9.81, trail: 0.6 },
    warhead: { lethal: 1.2, radius: 5.5, power: 3600, fx: 1.4, kinetic: 0.5 },
    dispersion: 7.0,
    blurb: '120 mm on a baseplate. Drops in from above onto whatever the guns cannot see.',
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
    id: 'stryker', name: 'STRYKER MGS', full: 'M1128 Stryker Mobile Gun System', tier: 'AFV',
    cost: 1800, unlockFrac: 0.06,
    tint: ARTILLERY_GREEN, model: 'M1128', modelLength: 8.6,
    range: 1200, reload: 3.2, setup: 2.0,
    crew: 0, health: 520,
    // A tank gun, not a howitzer: nine hundred metres a second on the lowest
    // arc there is, a small hole punched straight into one face, three times
    // a minute. The undercutting weapon.
    projectile: { kind: 'arc', speed: 900, gravity: 9.81, trail: 0.7, flat: true },
    warhead: { lethal: 1.6, radius: 5.0, power: 6000, fx: 1.6, kinetic: 0.95 },
    dispersion: 2.4,
    blurb: '105 mm tank gun, flat and fast. Puts a small hole exactly where you point, three times a minute.',
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
  // mortar out of two hundred feet of shaft above it, so a single $100k
  // 500-pounder laid the Elizabeth Tower flat — a tenth of the building on
  // paper, all of it in practice. Held to a bite and a short shock it takes
  // its tenth and the tower stands. The Lancer has neither, which is what the
  // extra $150k buys: the MOAB still fells a tower in one pass.
  {
    id: 'f15', name: 'F-15E', full: 'F-15E Strike Eagle · GBU-12 500 lb', tier: 'AIR',
    cost: 100000, unlockFrac: 0.12,
    model: 'aircraft', strike: { frac: 0.10, maxR: 64, minR: 9, fx: 4.6, bite: 0.62, shock: 1.2 },
    aircraft: { kind: 'eagle', speed: 230, height: 110, clearance: 45, runIn: 2400, offset: 40 },
    range: 2600, reload: 0, setup: 0, crew: 0, health: 1,
    projectile: { kind: 'bomb', speed: 230, gravity: 9.81, drag: 0.04, trail: 0.8 },
    warhead: { lethal: 30, radius: 40, power: 90000, fx: 4.6, kinetic: 0.35 },
    dispersion: 0,
    blurb: 'One pass, one 500-pounder, a tenth of the building. It will not fell a tower on its own.',
  },
  {
    id: 'b1', name: 'B-1 LANCER', full: 'B-1B Lancer · GBU-43/B MOAB', tier: 'AIR',
    cost: 250000, unlockFrac: 0.25,
    model: 'aircraft', strike: { frac: 0.35, maxR: 120, minR: 18, fx: 9.5 },
    aircraft: { kind: 'lancer', speed: 210, height: 330, clearance: 150, runIn: 3200, offset: 60 },
    range: 2600, reload: 0, setup: 0, crew: 0, health: 1,
    projectile: { kind: 'bomb', speed: 210, gravity: 9.81, drag: 0.11, trail: 1.4 },
    warhead: { lethal: 90, radius: 110, power: 400000, fx: 9.5, kinetic: 0.4 },
    dispersion: 0,
    blurb: 'Eleven tonnes of high explosive on a parachute. A third of anything.',
  },
  {
    id: 'ah64', name: 'APACHE', full: 'AH-64E Apache · Hydra 70 rockets and 30 mm', tier: 'AIR',
    cost: 40000, unlockFrac: 0.05,
    // Not a bomber. It comes in low, stops at a stand-off off the camera's
    // side of the target, and works it for as long as it has time on
    // station: 70 mm rockets in pairs, small and accurate, and the 30 mm
    // chain gun on whoever is near the aim point. It is in the garrison's
    // airspace the whole time, so it can be shot down, and if it is, it
    // comes down. `strike` sizes each rocket, not the sortie.
    model: 'aircraft', strike: { loiter: true, frac: 0.01, maxR: 5, minR: 2, fx: 1.1, bite: 0.6, shock: 0.6 },
    aircraft: {
      kind: 'apache', speed: 80, height: 30, clearance: 25, runIn: 900, offset: 60,
      station: 30,          // seconds it stays
      standoff: 300,        // metres out from the aim point it hovers
      rockets: 38, pair: 2, every: 1.5, spread: 1.2, muzzle: 480,
      gun: { every: 2.6, burst: 12, reach: 45, radius: 2.4, power: 2600 },
    },
    range: 2600, reload: 0, setup: 0, crew: 0, health: 1,
    projectile: { kind: 'bomb', speed: 480, gravity: 9.81, drag: 0, trail: 0.8 },
    warhead: { lethal: 4, radius: 6, power: 5200, fx: 1.1, kinetic: 0.5 },
    dispersion: 0,
    blurb: 'Hovers off the target for thirty seconds: rockets in pairs on your point, the chain gun on the garrison. Can be shot down.',
  },
  {
    id: 'ac130', name: 'AC-130', full: 'AC-130J Ghostrider · 105 mm rake', tier: 'AIR',
    cost: 120000, unlockFrac: 0.14,
    // A salvo: eight shells laid in a line along the run, each a tenth of a
    // second behind the last, so the pass rakes a face rather than cratering
    // a point.
    model: 'aircraft', strike: { frac: 0.03, maxR: 30, minR: 6, fx: 2.0, bite: 0.55, shock: 0.9, salvo: { n: 8, spread: 14 } },
    aircraft: { kind: 'ghostrider', speed: 130, height: 240, clearance: 100, runIn: 2400, offset: 50 },
    range: 2600, reload: 0, setup: 0, crew: 0, health: 1,
    projectile: { kind: 'bomb', speed: 130, gravity: 9.81, drag: 0.03, trail: 0.7 },
    warhead: { lethal: 6, radius: 11, power: 14000, fx: 2.0, kinetic: 0.7 },
    dispersion: 0,
    blurb: 'Eight rounds of 105 mm walked along a line in one pass. A wall, not a hole.',
  },
  {
    id: 'tomahawk', name: 'TOMAHAWK', full: 'BGM-109 Tomahawk · 450 kg unitary', tier: 'SEA',
    cost: 180000, unlockFrac: 0.2,
    model: 'aircraft', strike: { frac: 0.16, maxR: 44, minR: 6, fx: 5.0, bite: 0.7, shock: 1.1 },
    aircraft: { kind: 'tomahawk', speed: 240, height: 60, clearance: 26, runIn: 2800, offset: 20, consumed: true },
    range: 2600, reload: 0, setup: 0, crew: 0, health: 1,
    projectile: { kind: 'bomb', speed: 240, gravity: 9.81, drag: 0.02, trail: 1.0 },
    warhead: { lethal: 40, radius: 34, power: 150000, fx: 5.0, kinetic: 0.5 },
    dispersion: 0,
    blurb: 'Comes in from the sea at sixty metres and puts half a tonne exactly where you said.',
  },
  {
    id: 'gbu28', name: 'F-15E GBU-28', full: 'F-15E Strike Eagle · GBU-28 5000 lb', tier: 'AIR',
    cost: 160000, unlockFrac: 0.2,
    // Penetrating: a small radius and a very large charge, so it goes deep
    // into a solid monument instead of scorching its face.
    model: 'aircraft', strike: { frac: 0.14, maxR: 30, minR: 6, fx: 5.0, bite: 1.0, shock: 0.4 },
    aircraft: { kind: 'eagle', store: 'gbu28', speed: 230, height: 160, clearance: 60, runIn: 2400, offset: 40 },
    range: 2600, reload: 0, setup: 0, crew: 0, health: 1,
    projectile: { kind: 'bomb', speed: 230, gravity: 9.81, drag: 0.03, trail: 0.9 },
    warhead: { lethal: 45, radius: 24, power: 220000, fx: 5.0, kinetic: 0.9 },
    dispersion: 0,
    blurb: 'Two and a half tonnes that goes in before it goes off. For the things that will not fall over.',
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

  /**
   * A model built in code rather than loaded: already at true scale, so it
   * is only centred in plan and put on the ground, and cached under its
   * unit id like the files are.
   */
  wrap(root, id) {
    const key = `proc:${id}`;
    if (this.cache.has(key)) return this.cache.get(key);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const centre = box.getCenter(new THREE.Vector3());
    root.position.x -= centre.x;
    root.position.z -= centre.z;
    root.position.y -= box.min.y;
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
/**
 * A man, and what he is carrying.
 *
 * Every infantry team was two identical figures with the same anonymous tube
 * on the shoulder, so a line of AT4s and a line of Javelins were the same
 * picture: there was no way to look at the ground and know what was on it,
 * which is a problem when four of the eleven cards in the build bar are
 * infantry and they differ by a factor of three in what they cost and do.
 *
 * They are still two men. What changes is the kit, and it is drawn to read as
 * a silhouette rather than as detail — at the distance this game is played at
 * a green man is a green man, and what carries is the shape against the sky:
 *
 *   AT4       one thin disposable tube, the other man watching through glasses
 *   GUSTAF    a fat tube with the venturi cone flared behind the shoulder
 *   RPG-32    a short tube with the warhead bulging out in front of it
 *   JAVELIN   a square box on the shoulder and the command unit under it,
 *             fired from the knee
 *
 * `weapon` is the unit's own id, so a new launcher gets a silhouette by being
 * added to the table below rather than by threading anything new through.
 */
/** A cylinder from `a` to `b`: limbs, bipod legs, anything that is a line. */
function rod(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 7), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

export function makeInfantryMesh(colour = 0x4a5340, opts = {}) {
  const weapon = typeof opts === 'string' ? opts : (opts.weapon || null);
  const role = (typeof opts === 'object' && opts.role) || 'gunner';
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92, metalness: 0.02 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d6a4f, roughness: 0.85 });
  // The launcher's own colour, because shape stops carrying at forty metres
  // and a tone does not: the AT4's olive fibreglass, the Gustaf's grey alloy,
  // the RPG's brown composite, the Javelin's pale green case.
  const TUBE = { at4: 0x3b4230, gustaf: 0x6a6f63, rpg32: 0x4a3a2a, javelin: 0x8b9382 };
  const steel = new THREE.MeshStandardMaterial({
    color: TUBE[weapon] ?? 0x33382c, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.6, metalness: 0.15 });
  const parts = [];

  // The Javelin is shot off the knee: a low, wide shape next to a standing
  // man, which is the strongest silhouette cue any of them has.
  // So is the mortar's gunner, down on one knee at the sight.
  const kneeling = (weapon === 'javelin' || weapon === 'm120') && role === 'gunner';
  const rise = kneeling ? 0.38 : 0;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), mat);
  torso.position.y = 1.12 - rise;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skin);
  head.position.y = 1.63 - rise;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.175, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.58), mat);
  helmet.position.y = 1.66 - rise;
  parts.push(torso, head, helmet);

  if (kneeling) {
    // One knee down, the other up under the elbow. The thigh of the kneeling
    // leg has to be there or the shin reads as a plank lying on the grass
    // beside a man with no legs.
    const thighDown = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.46), mat);
    thighDown.position.set(-0.13, 0.42, -0.06);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.5), mat);
    shin.position.set(-0.13, 0.12, -0.18);
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.2), mat);
    knee.position.set(-0.13, 0.32, 0.12);
    const thighUp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.2), mat);
    thighUp.position.set(0.13, 0.46, 0.14);
    const shinUp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.2), mat);
    shinUp.position.set(0.13, 0.23, 0.3);
    parts.push(thighDown, shin, knee, thighUp, shinUp);
  } else {
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.2), mat);
    legL.position.set(-0.13, 0.39, 0);
    const legR = legL.clone(); legR.position.x = 0.13;
    parts.push(legL, legR);
  }

  // ── What he is holding.
  const shoulder = 1.34 - rise;
  const tube = (r, len, m, y = shoulder, z = 0.2, x = 0.1) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m);
    t.rotation.z = Math.PI / 2;
    t.rotation.y = 0.16;
    t.position.set(x, y, z);
    return t;
  };

  if (weapon === 'm120') {
    // A mortar crew's hands are on the mortar, which stands between them and
    // is built by `makeMortarTeam`: the gunner's forward on the sight and the
    // traverse, the loader's up at the muzzle with the round.
    const up = role !== 'gunner';
    for (const sx of [-1, 1]) {
      const from = new THREE.Vector3(sx * 0.2, shoulder + 0.02, 0.04);
      const to = up
        ? new THREE.Vector3(sx * 0.07, 2.02, 0.44)
        : new THREE.Vector3(sx * 0.09, shoulder + 0.04, 0.4);
      parts.push(rod(from, to, 0.055, mat));
    }
  } else if (role !== 'gunner') {
    // The second man. He is not a copy of the first: he is watching, or he is
    // holding the next round, and either reads as a team rather than as two
    // riflemen standing near each other.
    if (weapon === 'at4' || weapon === 'javelin') {
      // Glasses up at his eyes, held there: two barrels and the arms angled
      // up to them. A single wide bar across the chest — which is what this
      // was — reads as a plank through the man, not as a man observing.
      for (const sx of [-0.075, 0.075]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 7), dark);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(sx, 1.6 - rise, 0.21);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), mat);
        arm.position.set(sx * 2.4, 1.38 - rise, 0.14);
        arm.rotation.x = -0.5;
        arm.rotation.z = sx > 0 ? -0.35 : 0.35;
        parts.push(barrel, arm);
      }
    } else {
      // The next round, up on his shoulder: a rocket thick enough to be one.
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.52, 8), steel);
      body.rotation.z = Math.PI / 2;
      body.rotation.y = -0.4;
      body.position.set(-0.04, 1.2 - rise, 0.24);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.26, 8), dark);
      nose.rotation.z = -Math.PI / 2;
      nose.rotation.y = -0.4;
      nose.position.set(0.32, 1.2 - rise, 0.13);
      const hands = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), mat);
      hands.rotation.y = -0.4;
      hands.position.set(-0.02, 1.08 - rise, 0.2);
      parts.push(body, nose, hands);
    }
  } else if (weapon === 'gustaf') {
    // Fat tube, and the venturi flared out behind the shoulder — the one
    // shape no other launcher here has.
    parts.push(tube(0.095, 1.15, steel));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 8, 1, true), steel);
    cone.rotation.z = Math.PI / 2;
    cone.rotation.y = 0.16;
    cone.position.set(-0.5, shoulder - 0.01, 0.12);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.08), dark);
    sight.position.set(0.05, shoulder + 0.14, 0.22);
    parts.push(cone, sight);
  } else if (weapon === 'rpg32') {
    // Short tube, and the warhead standing out in front of it.
    parts.push(tube(0.1, 0.86, steel, shoulder, 0.2, 0.02));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), dark);
    bulb.position.set(0.5, shoulder + 0.02, 0.27);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 8), dark);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.72, shoulder + 0.03, 0.3);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), dark);
    grip.position.set(0.02, shoulder - 0.19, 0.22);
    parts.push(bulb, nose, grip);
  } else if (weapon === 'javelin') {
    // A box, not a tube, and the command launch unit slung under it.
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.26, 0.26), steel);
    box.rotation.y = 0.16;
    box.position.set(0.12, shoulder + 0.06, 0.22);
    const clu = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.2), dark);
    clu.rotation.y = 0.16;
    clu.position.set(-0.04, shoulder - 0.16, 0.26);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), skin);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0.12, shoulder - 0.14, 0.37);
    parts.push(box, clu, lens);
  } else {
    // The AT4, and anything that has not asked for a shape of its own: one
    // thin disposable tube, which is what the old mesh drew for everybody.
    parts.push(tube(0.07, 1.0, steel));
    if (weapon === 'at4') {
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.05), dark);
      sight.position.set(0.16, shoulder + 0.11, 0.2);
      parts.push(sight);
    }
  }

  for (const m of parts) { m.castShadow = true; g.add(m); }
  g.userData.weapon = weapon || 'none';
  g.userData.role = role;
  return g;
}

/**
 * The M120 team as it looks firing: the tube between the two men on its
 * baseplate and bipod, laid toward the target (+Z) at about sixty degrees,
 * the gunner down on one knee at the sight on its left, the loader standing
 * on its right with the next round held up over the muzzle, and the open
 * ammunition crate at his feet. True size: a 1.76 m barrel, a 0.7 m plate.
 */
export function makeMortarTeam() {
  const g = new THREE.Group();
  const gun = new THREE.MeshStandardMaterial({ color: 0x2e332b, roughness: 0.6, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e1a, roughness: 0.55, metalness: 0.4 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.7 });
  const band = new THREE.MeshStandardMaterial({ color: 0xc9a92a, roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4d4a33, roughness: 0.85 });
  const add = (m) => { m.castShadow = true; g.add(m); return m; };

  const e = 62 * Math.PI / 180;
  const dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
  const breech = new THREE.Vector3(0, 0.12, 0.05);
  const at = (t) => breech.clone().addScaledVector(dir, t);

  // Baseplate and the ball socket the breech sits in.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.06, 18), gun)).position.set(0, 0.04, 0.05);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), dark)).position.copy(breech);
  // The tube, with the thicker breech end and a ring at the muzzle.
  add(rod(at(0), at(1.76), 0.075, gun));
  add(rod(at(0), at(0.35), 0.09, gun));
  add(rod(at(1.7), at(1.77), 0.088, dark));
  // The bipod: a collar a metre up the tube, two legs splayed forward to the
  // ground, a spreader between them, the elevating screw up the middle.
  const collar = at(1.05);
  add(rod(collar.clone().setX(-0.2), collar.clone().setX(0.2), 0.05, dark));
  const feet = [new THREE.Vector3(-0.42, 0.02, 1.02), new THREE.Vector3(0.42, 0.02, 1.02)];
  for (const f of feet) {
    add(rod(collar, f, 0.028, gun));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), dark)).position.copy(f);
  }
  const spread = (k) => collar.clone().lerp(feet[k], 0.6);
  add(rod(spread(0), spread(1), 0.015, dark));
  add(rod(collar, spread(0).clone().lerp(spread(1), 0.5), 0.025, dark));
  // The sight on the left of the collar, where the gunner's eye is.
  const sight = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.1), dark));
  sight.position.set(-0.24, collar.y + 0.1, collar.z);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), dark)).position.set(-0.24, collar.y + 0.22, collar.z);

  // The gunner, kneeling on the left, facing the sight.
  const gunner = makeInfantryMesh(0x4a5340, { weapon: 'm120', role: 'gunner' });
  gunner.position.set(-0.66, 0, collar.z - 0.02);
  gunner.rotation.y = Math.PI / 2;
  g.add(gunner);
  // The loader, standing on the right, the round up over the muzzle.
  const loader = makeInfantryMesh(0x3f4738, { weapon: 'm120', role: 'loader' });
  loader.position.set(0.56, 0, 1.02);
  loader.rotation.y = -Math.PI / 2;
  g.add(loader);
  // A hand's width clear of the muzzle and into his hands, so it reads as a
  // round being held rather than as more tube.
  const held = new THREE.Vector3(0.07, 0, 0);
  const r0 = at(1.95).add(held), r1 = at(2.47).add(held);
  add(rod(r0, r1, 0.06, olive));
  add(rod(r0.clone().lerp(r1, 0.62), r0.clone().lerp(r1, 0.7), 0.062, band));
  const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), olive));
  nose.position.copy(r0).addScaledVector(dir, -0.08);
  nose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
  // Fins at the top, which is the tail: the round goes in nose first.
  add(rod(r1, r1.clone().addScaledVector(dir, 0.1), 0.075, dark));

  // The ready rounds: an open crate by the loader's feet, three in it.
  add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.34), wood)).position.set(0.95, 0.1, 0.35);
  for (let k = 0; k < 3; k++) {
    const a = new THREE.Vector3(0.78 + k * 0.12, 0.23, 0.2), b = a.clone().setZ(0.52);
    add(rod(a, b, 0.05, olive));
  }
  g.userData.weapon = 'm120';
  return g;
}
