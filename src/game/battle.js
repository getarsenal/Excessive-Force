import * as THREE from 'three';
import { isReleased } from './campaign.js';
import { UNITS, UNITS_BY_ID, ModelLibrary, makeInfantryMesh } from './units.js';

/** How long a lift package stays open after the first unit is placed. */
const LIFT_WINDOW = 8;
import {
  solveArc, solveBallistic, solveBoosted, solveDirect, ProjectileManager, ROCKET_BOOST,
} from './projectiles.js';
import { TracerFX } from '../fx/tracers.js';
import { AirWing } from './aircraft.js';
import { lineOfSight } from '../structure/occupancy.js';

/**
 * The game itself: deployment, targeting, the economy, and the loss condition.
 *
 * The economic loop is the whole design. Money comes from masonry you actually
 * bring down, so the only way to afford the next tier is to do real damage with
 * the one you have. Units you lose are money you spent and won't get back,
 * which is what makes the defenders matter — parking an M777 inside sniper
 * range is not a small mistake, it's a third of a Paladin.
 */

const START_MONEY = 900;
const BASE_INCOME = 14;
const MONEY_PER_TONNE = 1.15;
const MONEY_PER_DEFENDER = 22;

export class Battle {
  constructor(ctx) {
    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.physics = ctx.physics;
    this.terrain = ctx.terrain;
    this.structures = ctx.structures;
    this.primary = ctx.primary;          // the structure that must come down
    this.turret = ctx.turret || null;    // a coastal gun that shoots back, if the level has one
    this.garrison = ctx.garrison;
    // Scratch for the free-fire aim point, so picking a target does not
    // allocate a vector per gun per second.
    this._aimPoint = new THREE.Vector3();
    this.fx = ctx.fx;
    this.quality = ctx.quality;
    this.engine = ctx.engine;
    this.audio = ctx.audio || null;
    this.level = ctx.level || null;
    this.onEvent = ctx.onEvent || (() => {});

    this.models = new ModelLibrary();
    // The airlift. A placed unit is flown in, not conjured: the tap opens a
    // package, anything placed in the next eight seconds joins it, and when it
    // closes the whole package goes out as one formation. Off for the
    // harness, which places a battery and expects it to be there.
    this.airlift = true;
    this.package = null;
    this.pending = [];
    this.projectiles = new ProjectileManager(this.scene, this.physics, this.quality);

    this.money = START_MONEY;
    this.spent = 0;
    this.score = 0;              // tonnes of masonry brought down
    this.defendersKilled = 0;
    this.unitsLost = 0;
    this.shotsFired = 0;
    this.elapsed = 0;

    this.units = [];
    this.selectedUnitId = null;
    this.target = null;
    this.state = 'playing';
    // How the battery lays its fire. `point` converges on the aim point;
    // `area` spreads the sheaf over a circle for a face or a pyramid step;
    // `delay` fuzes the shell to burst a couple of metres inside the stone it
    // hits, for depth rather than a crater on the surface.
    this.fireMode = 'point';
    this.smokeCooldown = 0;
    this.smokes = null;        // a SmokeScreens, if the level has one
    this.fires = null;         // Fires, likewise

    this.totalMass = this.structures.reduce((a, s) => a + s.totalMass, 0);
    this.startHeight = this.primary.standingHeight();
    this.originGround = ctx.groundY;
    // Resolved now rather than lazily: each objective records the height it
    // started at, and that has to be measured before anything has been shot.
    this._objectives = null;
    void this.objectives;

    this._lastDestroyedMass = 0;
    // Aim candidates on the primary, refreshed on a timer rather than per shot:
    // scanning every stone for every gun would be the most expensive thing in
    // the frame, and the building does not move between refreshes.
    this._aimCandidates = [];
    this._aimAge = 99;
    this.autoEngage = true;

    // Tuning knobs, all neutral by default. They exist so the test menu can
    // move every number that matters without a rebuild; the game itself never
    // changes them.
    this.freeBuild = false;
    this.unlockAll = false;
    this.invulnerable = false;
    this.incomeScale = 1;
    this.reloadScale = 1;
    this.dispersionScale = 1;
    this.powerScale = 1;

    this.tracerFX = new TracerFX(this.scene, this.quality);
    this.air = new AirWing({
      scene: this.scene, quality: this.quality, terrain: this.terrain,
      projectiles: this.projectiles, fx: this.fx, audio: this.audio, camera: this.camera,
    });
    // What the flak did, said out loud. The air wing raises these where the
    // flying consequence happens, because that is the only place that knows
    // a pilot has turned for home or a canopy has come apart.
    this.air.onAirEvent = (kind, data) => this.onEvent(kind, data);
    this._setupHealthBars();
    this._setupTargetMarker();
    this._setupGhost();
    this._setupStrikeReticle();
    this._setupConfirmRing();
    this._setupEmplacements();
  }

  /**
   * Sandbag rings round the guns that have dug in.
   *
   * A crew that has been in one place for half a minute has filled sandbags,
   * and from then on takes a third less from the garrison. The ring is what
   * tells the player which guns are worth leaving where they are.
   */
  _setupEmplacements() {
    const geo = new THREE.TorusGeometry(1, 0.16, 6, 28);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
      color: 0x8b8163, roughness: 0.96, metalness: 0,
    }), 64);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = this.quality.shadowMapSize > 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(m);
    this.emplacements = m;
    this._emQ = new THREE.Quaternion();
    this._emS = new THREE.Vector3();
    this._emV = new THREE.Vector3();
  }

  _updateEmplacements() {
    let w = 0;
    for (const u of this.units) {
      if (!u.alive || !u.dugIn || w >= 64) continue;
      const r = u.def.model === 'infantry' ? 2.6 : 4.4;
      this._emV.set(u.pos.x, u.pos.y + 0.45, u.pos.z);
      this._emS.set(r, 0.9, r);
      this._hpM4.compose(this._emV, this._emQ, this._emS);
      this.emplacements.setMatrixAt(w++, this._hpM4);
    }
    this.emplacements.count = w;
    this.emplacements.instanceMatrix.needsUpdate = true;
  }

  /** Cycle the battery's fire mode. */
  setFireMode(mode) {
    if (!['point', 'area', 'delay'].includes(mode)) return;
    this.fireMode = mode;
    this.onEvent('firemode', mode);
  }

  /**
   * Lay smoke on the designated point, or on the middle of the garrison's
   * fire if nothing is designated. Costs money and takes half a minute to
   * come round again, because a screen that is always available is a wall
   * the garrison can never see through.
   */
  static get SMOKE_COST() { return 120; }

  placeSmoke() {
    if (!this.smokes || this.state !== 'playing') return false;
    if (this.smokeCooldown > 0) { this.onEvent('smokewait', this.smokeCooldown); return false; }
    if (!this.freeBuild && this.money < Battle.SMOKE_COST) {
      this.onEvent('poor', { cost: Battle.SMOKE_COST });
      return false;
    }
    // Between the guns and the target, where a screen actually screens.
    let at = this.target ? this.target.clone() : null;
    if (!at) {
      const live = this.units.filter((u) => u.alive);
      if (!live.length) return false;
      const c = new THREE.Vector3();
      for (const u of live) c.add(u.pos);
      c.multiplyScalar(1 / live.length);
      at = c.lerp(this.primary.origin, 0.55);
      at.y = this.terrain.heightAt(at.x, at.z);
    } else {
      at.y = Math.max(at.y - 6, this.terrain.heightAt(at.x, at.z));
    }
    if (!this.freeBuild) { this.money -= Battle.SMOKE_COST; this.spent += Battle.SMOKE_COST; }
    this.smokes.place(at, 26, 30);
    this.smokeCooldown = 32;
    this.onEvent('smoke', at);
    return true;
  }

  /** Sell a placed unit back for half its price. */
  sellUnit(unit) {
    if (!unit || !unit.alive) return false;
    // Nothing was charged in free build, so nothing comes back.
    const refund = this.freeBuild ? 0 : Math.round(unit.def.cost * 0.5);
    this.money += refund;
    this.spent -= refund;
    unit.alive = false;
    this.scene.remove(unit.group);
    this.onEvent('sold', { unit, refund });
    return true;
  }

  /**
   * Damage readouts over the guns.
   *
   * A unit under fire gave no sign of it until it exploded, so losing an M777
   * to a sniper you never noticed felt arbitrary rather than like a mistake you
   * could have avoided. Two instanced quads — a dark backing and a coloured
   * fill — drawn only for units that have actually been hit.
   */
  _setupHealthBars() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0.5, 0, 0);            // grows from the left edge
    const mk = (colour, order) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity: 0.9,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      }), 64);
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = order;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
      this.scene.add(m);
      return m;
    };
    this.hpBack = mk(0xffffff, 26);
    this.hpFill = mk(0xffffff, 27);
    this._hpM4 = new THREE.Matrix4();
    this._hpV = new THREE.Vector3();
    this._hpS = new THREE.Vector3();
    this._hpC = new THREE.Color();
  }

  _updateHealthBars() {
    let w = 0;
    const camQ = this.camera.quaternion;
    for (const u of this.units) {
      if (!u.alive) continue;
      const frac = Math.max(0, Math.min(1, u.health / u.maxHealth));
      if (frac > 0.995 || w >= 64) continue;
      // Scaled with distance so the bar stays legible without ever growing
      // large enough to clutter a close-up.
      const dist = this.camera.position.distanceTo(u.pos);
      const width = Math.max(3.2, dist * 0.022);
      const height = width * 0.13;
      const y = u.pos.y + (u.def.model === 'infantry' ? 3.0 : 4.2);

      this._hpV.set(u.pos.x - width / 2, y, u.pos.z);
      this._hpS.set(width, height, 1);
      this._hpM4.compose(this._hpV, camQ, this._hpS);
      this.hpBack.setMatrixAt(w, this._hpM4);
      this.hpBack.instanceColor.setXYZ(w, 0.04, 0.05, 0.06);

      this._hpS.set(width * frac, height * 0.78, 1);
      this._hpM4.compose(this._hpV, camQ, this._hpS);
      this.hpFill.setMatrixAt(w, this._hpM4);
      this._hpC.setHex(frac > 0.6 ? 0x6fd08c : frac > 0.28 ? 0xe0a33c : 0xe8604c);
      this.hpFill.instanceColor.setXYZ(w, this._hpC.r, this._hpC.g, this._hpC.b);
      w++;
    }
    this.hpBack.count = w;
    this.hpFill.count = w;
    for (const m of [this.hpBack, this.hpFill]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  _setupTargetMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.22, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xff4d38, transparent: true, opacity: 0.95 }),
    );
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(5.0, 0.1, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xff4d38, transparent: true, opacity: 0.5 }),
    );
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 300, 6),
      new THREE.MeshBasicMaterial({
        color: 0xff4d38, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    beam.position.y = 150;
    g.add(ring, ring2, beam);
    g.visible = false;
    g.renderOrder = 20;
    this.targetMarker = g;
    this.scene.add(g);
  }

  /**
   * The strike reticle.
   *
   * An air strike used to be aimed with nothing at all: the ghost and the
   * range ring are both switched off for a strike unit, so the player tapped
   * a bare map and found out where the bomb was going when it arrived. What
   * goes here instead is a proper sight — and it is built flat, on the
   * ground plane, so it lies on the terrain and tracks across it as the
   * finger moves rather than floating as a billboard in front of it.
   *
   * It is sized to the warhead. The outer ring is the blast radius of the
   * thing being called, which for the MOAB is a hundred and ten metres, so
   * the reticle is big because the weapon is: the player can see, before
   * paying, exactly how much of the map is inside it.
   */
  _setupStrikeReticle() {
    const g = new THREE.Group();
    const mat = (opacity, colour = 0xff4d38) => new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide,
    });
    const flat = (geo) => { geo.rotateX(-Math.PI / 2); return geo; };

    // The blast edge, and a heavier inner ring at the lethal core.
    const rim = new THREE.Mesh(flat(new THREE.RingGeometry(0.965, 1.0, 96)), mat(0.85));
    const core = new THREE.Mesh(flat(new THREE.RingGeometry(0.3, 0.325, 64)), mat(0.5));
    g.add(rim, core);

    // Four brackets on the rim, at the diagonals, and the spinner they ride
    // on. A sight that turns reads as a thing that is tracking.
    const spin = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const a0 = i * (Math.PI / 2) + Math.PI / 4 - 0.17;
      // Thin: the whole sight scales with the warhead, and a bracket a
      // fifteenth of the radius across is a sixteen-metre orange slab on the
      // MOAB's hundred and ten.
      const arc = new THREE.Mesh(flat(new THREE.RingGeometry(0.945, 1.02, 28, 1, a0, 0.34)), mat(0.95));
      spin.add(arc);
    }
    spin.name = 'spin';
    g.add(spin);

    // The crosshair: four ticks in from the rim with a gap in the middle, so
    // what is under the aim point stays visible.
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2);
      const bar = new THREE.Mesh(flat(new THREE.PlaneGeometry(0.34, 0.022)), mat(0.8));
      bar.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
      bar.rotation.y = -a;
      g.add(bar);
    }

    // The aim point itself, and a column of light standing on it so the
    // reticle is findable when the camera is low and the ground is busy.
    const dot = new THREE.Mesh(flat(new THREE.CircleGeometry(0.055, 20)), mat(0.95));
    dot.name = 'dot';
    g.add(dot);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.05, 2.4, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff4d38, transparent: true, opacity: 0.17,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 1.2;
    beam.name = 'beam';
    g.add(beam);

    g.visible = false;
    g.renderOrder = 24;
    this.strikeReticle = g;
    this.scene.add(g);
  }

  /**
   * Put the reticle on a point, at the size of the warhead it is calling.
   *
   * The group is built at unit radius and scaled, so the one object serves an
   * F-15's forty metres and a MOAB's hundred and ten. Height is left alone in
   * the scale so the column does not become a searchlight on the big one.
   */
  showStrikeAim(point, def) {
    if (!this.strikeReticle) return;
    if (!point || !def) { this.strikeReticle.visible = false; return; }
    const r = Math.max(14, (def.warhead && def.warhead.radius) || 30);
    this.strikeReticle.position.set(point.x, point.y + 0.45, point.z);
    this.strikeReticle.scale.set(r, 1, r);
    const beam = this.strikeReticle.getObjectByName('beam');
    if (beam) { beam.scale.set(1 / r * 4, r * 0.9, 1 / r * 4); }
    this.strikeReticle.visible = true;
    this._aimPoint = point;
  }

  hideStrikeAim() {
    if (this.strikeReticle) this.strikeReticle.visible = false;
    this._aimPoint = null;
  }

  _setupGhost() {
    const g = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    g.visible = false;
    this.ghost = g;
    this.scene.add(g);

    // The range ring. Every unit has a range and until now the only way to
    // find out whether a position could reach the target was to buy the gun
    // and watch it sit there — which costs money you cannot get back.
    const ring = new THREE.RingGeometry(0.985, 1.0, 96);
    ring.rotateX(-Math.PI / 2);
    const rangeRing = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({
      color: 0x58a6ff, transparent: true, opacity: 0.45,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    rangeRing.visible = false;
    rangeRing.renderOrder = 18;
    this.rangeRing = rangeRing;
    this.scene.add(rangeRing);
  }

  /**
   * Where a drag would put a line of guns.
   *
   * A battery is several guns in a row and placing it was several taps, each
   * one an open drawer, a card, a tap on the ground and a wait. Pressing on
   * the map and pulling gives the whole line at once: the points are spaced
   * far enough apart to clear each other's exclusion — the placement rule
   * refuses anything within seven metres of a standing unit, so anything
   * tighter than that would lay a line that mostly refuses itself — and each
   * one is coloured by whether it would actually take.
   *
   * Returns the points, so the caller can deploy exactly what was drawn
   * rather than working it out a second time and getting a different answer.
   */
  linePlacements(from, to, def, maxCount = 14) {
    const out = [];
    if (!from || !def) return out;
    const gap = Math.max(11, (def.modelLength || 6) * 1.6);
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    // How many will fit, how many are wanted, and how many can be paid for.
    let n = Math.min(maxCount, 1 + Math.floor(len / gap));
    if (!this.freeBuild && def.cost > 0) {
      n = Math.min(n, Math.max(1, Math.floor(this.money / def.cost)));
    }
    const ux = len > 0.001 ? dx / len : 0, uz = len > 0.001 ? dz / len : 0;
    // Spread the line evenly over what was actually drawn rather than
    // stamping at the nominal gap and leaving a tail: a drag that asks for
    // four gets four, from the finger down to the finger up.
    const step = n > 1 ? Math.min(len / (n - 1), gap * 2.4) : 0;
    for (let i = 0; i < n; i++) {
      const x = from.x + ux * step * i;
      const z = from.z + uz * step * i;
      const p = new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
      // A line drawn across a roof is a line on the ground beside it: the
      // roof flag belongs to the picked point, not to the metres after it.
      if (i === 0 && from.onRoof) { p.y = from.y; p.onRoof = true; }
      p.ok = this.validPlacement(p, def).ok;
      // And not on top of one already in this line.
      if (p.ok) {
        for (const q of out) {
          if (Math.hypot(q.x - p.x, q.z - p.z) < 7.2) { p.ok = false; break; }
        }
      }
      out.push(p);
    }
    return out;
  }

  /**
   * Draw that line. A pool of flat discs, because a drag re-draws it sixty
   * times a second and building geometry per frame is how a preview becomes
   * a stutter.
   */
  showLine(points, def) {
    if (!this._lineGhosts) {
      this._lineGhosts = [];
      const geo = new THREE.CylinderGeometry(4, 4, 0.35, 20);
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0x58a6ff, transparent: true, opacity: 0.42, depthWrite: false,
        }));
        m.visible = false;
        m.renderOrder = 17;
        this._lineGhosts.push(m);
        this.scene.add(m);
      }
    }
    for (let i = 0; i < this._lineGhosts.length; i++) {
      const g = this._lineGhosts[i];
      const p = points && points[i];
      if (!p) { g.visible = false; continue; }
      g.position.set(p.x, p.y + 0.25, p.z);
      g.material.color.setHex(p.ok ? 0x6fd08c : 0xe8604c);
      g.visible = true;
    }
  }

  hideLine() {
    if (!this._lineGhosts) return;
    for (const g of this._lineGhosts) g.visible = false;
  }

  /**
   * Show where a unit placed here could reach.
   *
   * Drawn as a flat ring at the deployment point rather than a dome, because
   * the decision being made is a plan-view one: can this position cover the
   * face of the building I want to cut?
   */
  showRange(point, def) {
    if (!point || !def) { this.rangeRing.visible = false; return; }
    this.rangeRing.position.set(point.x, point.y + 0.4, point.z);
    this.rangeRing.scale.setScalar(def.range);
    const reaches = point.distanceTo(this.primary.origin) <= def.range;
    this.rangeRing.material.color.setHex(reaches ? 0x6fd08c : 0xe0a33c);
    this.rangeRing.visible = true;
  }

  /**
   * A ring that expands and fades wherever the player taps the world.
   *
   * The screen-space ripple in the HUD confirms the *touch*; this confirms the
   * *place* — which is the thing that was actually in doubt, since the whole
   * complaint about deployment was not knowing where a tap had landed.
   */
  _setupConfirmRing() {
    const geo = new THREE.RingGeometry(0.62, 1.0, 40);
    geo.rotateX(-Math.PI / 2);
    this._rings = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x9fd2ff, transparent: true, opacity: 0, depthWrite: false,
        depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.visible = false;
      m.renderOrder = 24;
      this.scene.add(m);
      this._rings.push({ mesh: m, age: 99, life: 0.62, size: 12, tilt: false });
    }
  }

  /** Kick off a world-space confirmation pulse at `point`. */
  pulse(point, colour = 0x9fd2ff, size = 13, tilt = false) {
    let slot = this._rings[0];
    for (const r of this._rings) if (r.age > slot.age) slot = r;
    slot.age = 0;
    slot.size = size;
    slot.tilt = tilt;
    slot.mesh.position.copy(point);
    slot.mesh.material.color.setHex(colour);
    slot.mesh.visible = true;
    // On a wall the ring should lie against the face, not flat on the ground.
    slot.mesh.rotation.set(tilt ? Math.PI / 2 : 0, 0, 0);
    if (tilt) slot.mesh.lookAt(this.camera.position);
  }

  _updateRings(dt) {
    for (const r of this._rings) {
      if (r.age > r.life) { if (r.mesh.visible) r.mesh.visible = false; continue; }
      r.age += dt;
      const t = Math.min(1, r.age / r.life);
      const s = 0.25 + t * t * 0.75;
      r.mesh.scale.setScalar(s * r.size);
      r.mesh.material.opacity = (1 - t) * 0.85;
    }
  }

  // ────────────────────────────────────────────────────────────── economy ──

  get progress() {
    const demolished = this.structures.reduce((a, s) => a + s.demolishedMass, 0);
    return Math.min(1, demolished / this.totalMass);
  }

  /**
   * How far through this level the player counts as being, for unlocks.
   *
   * Not the same number as `progress`, and it cannot be. Unlock thresholds are
   * fractions of the whole mass on the map, and that mass varies by three
   * orders of magnitude between levels: the Elizabeth Tower is thirty-two
   * thousand stones, the Giza plateau is two and a third million cubic metres
   * of limestone with two more pyramids beside it. At Giza a player would have
   * had to demolish 0.6 % of that — with an AT4, the only thing unlocked at
   * the start — to earn the RPG. It is not reachable, so nothing beyond the
   * two weakest weapons ever unlocked, and the level read as indestructible
   * because for that player it was.
   *
   * `unlockScale` lets a level say how much of it counts as getting going.
   */
  get unlockProgress() {
    return Math.min(1, this.progress * (this.level?.unlockScale ?? 1));
  }

  /**
   * Whether a weapon can be bought.
   *
   * Two gates, and they do different jobs. The campaign releases a weapon —
   * London's contract buys the 155, Paris's buys the Paladin and the air — and
   * that is progression across the war. The level then earns it, on the same
   * fraction-of-the-building rule as before, and that is progression inside one
   * afternoon. A weapon needs both, which is why arriving at the Great Pyramid
   * with a bomber released still means working up to it on the day.
   */
  isUnlocked(u) {
    if (this.unlockAll) return true;
    if (!isReleased(u.id)) return false;
    return this.unlockProgress >= (u.unlockFrac ?? 0);
  }

  /** Released by the campaign but not yet earned here, for the build bar. */
  isReleased(u) { return this.unlockAll || isReleased(u.id); }
  canAfford(u) { return this.freeBuild || this.money >= u.cost; }

  get income() {
    // Income rises as the assault succeeds, so a good opening snowballs.
    return BASE_INCOME * (1 + this.progress * 2.4) * this.incomeScale;
  }

  // ─────────────────────────────────────────────────────────── deployment ──

  selectUnit(id) {
    const u = UNITS_BY_ID[id];
    if (!u || !this.isUnlocked(u)) return false;
    this.selectedUnitId = this.selectedUnitId === id ? null : id;
    this.ghost.visible = false;
    return true;
  }

  /**
   * Can a unit stand here?
   *
   * `def` is optional — most callers only care about the ground — but a
   * launcher's near limit depends on what it is being asked to shoot, so
   * placing one is the moment to say no.
   */
  validPlacement(point, def = null) {
    if (!point) return { ok: false, reason: 'no ground' };
    // A rooftop has already been established as a flat surface by the picker;
    // what is underneath it — river, road, another building — is beside the
    // point once you are standing on top of it.
    const onRoof = point.onRoof === true;
    if (!onRoof && this.terrain.isWater(point.x, point.z)) {
      return { ok: false, reason: 'in the river' };
    }
    // There is no slope rule here, and there was.
    //
    // It refused ground that fell more than eight metres across the seven a gun
    // crew needs, on the reasoning that a howitzer cannot be bedded on a cliff.
    // That is true and it is not worth what it cost: eight metres across seven
    // is a *city on a hillside* as often as it is a mountainside, so the refusal
    // landed on the Trocadéro, on the streets above Circular Quay and on half
    // the ground round the Corcovado's benches — and what the player got for it
    // was a tap that did nothing and an error message, in places where the
    // ground plainly looked fine. A gun that looks slightly wrong on a steep
    // bank is a far smaller problem than a deployment that is refused for
    // reasons the player cannot see. The mountain's benches still matter,
    // because what makes them matter is the line of sight from them.

    // It has to be a roof worth climbing. A building is bedded to the
    // ground at its own centre, so where the ground climbs across its
    // footprint the top of it can finish level with the hillside behind —
    // which the picker still reports as a roof, because it is one, and the
    // player still pays the roof price for a gun standing in a field. Found
    // on the Corcovado, where the summit is ringed by ground like that.
    if (onRoof && point.y < this.terrain.heightAt(point.x, point.z) + 4.0) {
      return { ok: false, reason: 'level with the ground' };
    }
    // To the edge of the ground, near enough. Held to ninety-two percent of
    // the span this refused half of what the play camera looks at from the
    // Corcovado's summit, where everything is downhill and outward.
    const span = this.terrain.span;
    if (Math.abs(point.x) > span * 0.985 || Math.abs(point.z) > span * 0.985) {
      return { ok: false, reason: 'off map' };
    }
    // Keep clear of the structures themselves — measured against the ground
    // each one covers, not a circle around a point. A radius around the origin
    // let a gun stand inside the palace wing, whose origin is at the foot of
    // the tower seventy metres away; its first round then detonated against the
    // wall in front of the muzzle, which is what "the rounds explode instantly"
    // was.
    for (const s of this.structures) {
      const f = s.footprint;
      if (!f) continue;
      const PAD = 9;
      if (point.x > f.x0 - PAD && point.x < f.x1 + PAD
          && point.z > f.z0 - PAD && point.z < f.z1 + PAD) {
        return { ok: false, reason: 'too close' };
      }
    }
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.pos.distanceTo(point) < 7) return { ok: false, reason: 'occupied' };
    }
    for (const d of this.pending) {
      if (d.pos.distanceTo(point) < 7) return { ok: false, reason: 'drop zone taken' };
    }
    // A launcher has a near limit and this is where the player finds out.
    // Its rocket cannot come down closer than the motor carries it, so one
    // parked against the building it is meant to shell has no shot at all —
    // and saying so here beats a launcher that sits there silently, or the
    // old behaviour, which was to throw the rocket over the target and into
    // the next borough.
    if (def && def.minRange) {
      for (const s of this.structures) {
        const f = s.footprint;
        if (!f) continue;
        const dx = Math.max(f.x0 - point.x, 0, point.x - f.x1);
        const dz = Math.max(f.z0 - point.z, 0, point.z - f.z1);
        if (Math.hypot(dx, dz) < def.minRange) {
          return { ok: false, reason: 'inside minimum range' };
        }
      }
    }
    // And not inside a building. Nothing stopped this before, so a gun placed
    // on a street that happened to be a block would simply be swallowed — it
    // fired from inside the masonry, the camera followed it in, and the screen
    // went black.
    if (!onRoof && this.cityPlots) {
      for (const b2 of this.cityPlots) {
        if (Math.abs(b2.x - point.x) < b2.w / 2 + 2.5
            && Math.abs(b2.z - point.z) < b2.d / 2 + 2.5) {
          return { ok: false, reason: 'inside a building' };
        }
      }
    }
    return { ok: true };
  }

  /**
   * Call an air strike on a point. Paid for on the call; the aircraft comes
   * in from behind the camera and the bomb lands a few seconds later.
   */
  callStrike(id, point) {
    const def = UNITS_BY_ID[id];
    if (!def || !def.strike) return null;
    if (!this.isUnlocked(def)) return null;
    if (!point) { this.onEvent('needtarget', def); return null; }
    if (!this.freeBuild && this.money < def.cost) { this.onEvent('poor', def); return null; }
    if (!this.freeBuild) {
      this.money -= def.cost;
      this.spent += def.cost;
    }
    const at = point.clone();
    // Aim at the ground under the point if it is in the open, or at the
    // masonry itself: the bomb goes off where it first meets something.
    const ceiling = this.structures.reduce((a, st) => Math.max(a, st.standingHeight()), at.y);
    // Who is shooting back at it. This is a warning now, not a verdict: what
    // the run is worth is settled in the air, by the rounds that actually go
    // into the aircraft between here and the release. Saying so before the
    // aircraft arrives gives the player the few seconds he needs to put
    // something on those pits first, which is the whole point of them.
    const flak = this.garrison ? this.garrison.flakOver(at, 120) : 0;
    const sortie = this.air.call(def, at, ceiling, { flak });
    this.shotsFired++;
    this.selectedUnitId = null;
    if (flak > 0) this.onEvent('flak', { def, guns: flak });
    this.onEvent('strike', { def, point: at, eta: sortie.releaseAt + sortie.fall });
    return sortie;
  }

  async deploy(id, point) {
    const def = UNITS_BY_ID[id];
    if (!def) return null;
    if (def.strike) return this.callStrike(id, point);
    if (!this.isUnlocked(def)) return null;
    if (!this.freeBuild && this.money < def.cost) { this.onEvent('poor', def); return null; }
    const check = this.validPlacement(point, def);
    if (!check.ok) { this.onEvent('badplace', check); return null; }

    if (!this.freeBuild) {
      this.money -= def.cost;
      this.spent += def.cost;
    }

    // A roof carries the unit at its own height, and so does a road deck or a
    // pavement: a gun bedded at the heightfield under a road stands in it.
    const y = (point.onRoof || point.onDeck) ? point.y : this.terrain.heightAt(point.x, point.z);
    const pos = new THREE.Vector3(point.x, y, point.z);
    pos.onRoof = point.onRoof === true;
    pos.onDeck = point.onDeck === true;

    if (!this.airlift) return this._spawn(def, pos);

    // Into the lift. The spot is held, the money is spent, and the unit
    // arrives when the aircraft gets here.
    const aim = this.target || new THREE.Vector3(this.primary.origin.x, y, this.primary.origin.z);
    const drop = {
      def, pos, yaw: Math.atan2(aim.x - pos.x, aim.z - pos.z),
      group: new THREE.Group(), model: null, marker: null,
      figure: (k) => makeInfantryMesh(k === 0 ? 0x4a5340 : 0x3f4738),
    };
    if (def.model !== 'infantry') {
      // The vehicle or gun is loaded now, so it is on the platform when the
      // ramp opens rather than appearing on the ground.
      drop.loading = this._attachModel({ def, group: drop.group, alive: true, drop }).catch((e) => console.warn('model load failed', e));
    }
    drop.marker = this._dropMarker(pos);
    this.pending.push(drop);
    if (!this.package) {
      this.package = { closesAt: this.elapsed + LIFT_WINDOW, drops: [], tick: -1 };
      this.onEvent('package', { count: 1, wait: LIFT_WINDOW, first: true });
    } else {
      this.onEvent('package', { count: this.package.drops.length + 1, wait: this.package.closesAt - this.elapsed, first: false });
    }
    this.package.drops.push(drop);
    this.onEvent('queued', { def, count: this.package.drops.length });
    return drop;
  }

  /** The ring on the ground where a drop is coming down. */
  _dropMarker(pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.1, 28),
      new THREE.MeshBasicMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.25, pos.z);
    ring.renderOrder = 3;
    this.scene.add(ring);
    this.pulse(pos, 0x8fd6ff, 9, true);
    return ring;
  }

  /** The package closes: everything in it goes out on one lift. */
  _launch() {
    const drops = this.package.drops;
    this.package = null;
    // Low over the drop, unless the monument stands close enough to the
    // run to be flown through: the tower's height is only the ceiling for a
    // drop near the tower.
    for (const d of drops) {
      d.ceiling = 0;
      for (const st of this.structures) {
        const f = st.footprint;
        if (!f) continue;
        const dx = Math.max(f.x0 - d.pos.x, 0, d.pos.x - f.x1);
        const dz = Math.max(f.z0 - d.pos.z, 0, d.pos.z - f.z1);
        if (Math.hypot(dx, dz) < 220) d.ceiling = Math.max(d.ceiling, st.standingHeight());
      }
    }
    const eta = this.air.deliver(drops, 0, (d) => this._land(d),
      (ax, az, bx, bz) => this.ceilingAlong(ax, az, bx, bz));
    this.onEvent('lift', { count: drops.length, eta, ...(this.air.lastLift || {}) });
  }

  /**
   * The highest thing standing under a line across the map: the monument's
   * standing height where the line passes near its footprint, the town's
   * roofs where it passes over them. The aircraft fly above it.
   */
  ceilingAlong(ax, az, bx, bz) {
    let top = -Infinity;
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    const distTo = (x, z) => {
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
      return Math.hypot(ax + dx * t - x, az + dz * t - z);
    };
    for (const st of this.structures) {
      const f = st.footprint;
      if (!f) continue;
      const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
      const r = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2 + 70;
      if (distTo(cx, cz) < r) top = Math.max(top, st.standingHeight());
    }
    const cf = this.cityFire;
    if (cf && cf.plots.length) {
      const len = Math.sqrt(L2);
      const steps = Math.max(1, Math.ceil(len / cf.CELL));
      const seen = new Set();
      for (let i = 0; i <= steps; i++) {
        const x = ax + dx * (i / steps), z = az + dz * (i / steps);
        const cx = Math.floor(x / cf.CELL), cz = Math.floor(z / cf.CELL);
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const b = cf.grid.get((cx + ox) * 8192 + (cz + oz));
          if (!b) continue;
          for (const k of b) {
            if (seen.has(k)) continue;
            seen.add(k);
            const p = cf.plots[k];
            const t = p.top ?? (p.base + p.h);
            if (t <= top) continue;
            if (distTo(p.x, p.z) < Math.hypot(p.w, p.d) / 2 + 30) top = t;
          }
        }
      }
    }
    return top;
  }

  /** A drop is on the ground: it becomes the unit. */
  _land(d) {
    this.pending = this.pending.filter((x) => x !== d);
    if (d.marker) { this.scene.remove(d.marker); d.marker = null; }
    // Nothing got out of it. A stick whose canopies were all shot away does
    // not become a unit, and the player is told rather than left counting.
    if (d.lost) {
      if (d.group.parent) d.group.removeFromParent();
      this.onEvent('droplost', { def: d.def });
      return;
    }
    // The load that came down the platform or the sling is the unit's own
    // model; it leaves them for the ground it landed on.
    if (d.group.parent) d.group.removeFromParent();
    d.group.position.set(0, 0, 0);
    d.group.rotation.set(0, 0, 0);
    const unit = this._spawn(d.def, d.pos, d);
    // It arrived, and it arrived hurt: men lost on the way down, or a load
    // that came in under a streaming canopy.
    if (unit && d.arrivalHealth !== undefined && d.arrivalHealth < 1) {
      unit.health = Math.max(1, Math.round(unit.maxHealth * d.arrivalHealth));
      this.onEvent('dropmauled', { def: d.def, health: unit.health / unit.maxHealth });
    }
    return unit;
  }

  /** The unit itself, on the ground, setting up. */
  _spawn(def, pos, drop = null) {
    const y = pos.y;
    const unit = {
      def, pos,
      health: def.health, maxHealth: def.health,
      alive: true,
      state: 'setup',
      setupLeft: def.setup,
      cooldown: 0,
      salvoLeft: 0,
      salvoTimer: 0,
      group: drop ? drop.group : new THREE.Group(),
      onRoof: pos.onRoof,
      yaw: 0,
      kills: 0,
      hits: 0,
      rank: 0,
      age: 0,
      dugIn: false,
      damageDealt: 0,
    };
    unit.group.position.copy(pos);
    this.scene.add(unit.group);
    this.units.push(unit);

    // Face the primary target immediately so it reads as deliberate.
    const aim = this.target || new THREE.Vector3(this.primary.origin.x, y, this.primary.origin.z);
    unit.yaw = Math.atan2(aim.x - pos.x, aim.z - pos.z);
    unit.group.rotation.y = unit.yaw;

    // Model loads asynchronously; the unit is playable in the meantime. A
    // unit that came down the lift brought its model with it.
    if (drop && drop.model) {
      unit.model = drop.model;
      unit.model.rotation.y = def.modelYaw ?? 0;
    } else if (drop && drop.loading) {
      // Still on its way from the cache: it lands in this group when it
      // arrives, and starting a second load would put two in it.
      drop.loading.then(() => { if (unit.alive && drop.model && !unit.model) unit.model = drop.model; });
    } else {
      this._attachModel(unit).catch((e) => console.warn('model load failed', e));
    }
    this.onEvent('deployed', unit);
    return unit;
  }

  async _attachModel(unit) {
    const def = unit.def;
    if (def.model === 'infantry') {
      // A fire team: two figures, offset so they read as a crew at distance.
      for (let i = 0; i < 2; i++) {
        const m = makeInfantryMesh(i === 0 ? 0x4a5340 : 0x3f4738);
        m.position.set((i - 0.5) * 1.3, 0, (i % 2) * 0.7);
        m.rotation.y = (Math.random() - 0.5) * 0.3;
        unit.group.add(m);
      }
      return;
    }
    const wrapper = await this.models.load(
      def.modelFile || def.model, def.modelLength, { tint: def.tint },
    );
    if (!unit.alive) return;
    const inst = this.models.instance(wrapper);
    inst.rotation.y = def.modelYaw ?? 0;
    unit.group.add(inst);
    unit.model = inst;
    if (unit.drop) unit.drop.model = inst;
  }

  removeUnit(unit) {
    unit.alive = false;
    this.scene.remove(unit.group);
    unit.group.traverse((o) => {
      if (o.isMesh && o.geometry && o.userData.own !== false) { /* shared geo, leave it */ }
    });
  }

  // ───────────────────────────────────────────────────────────── targeting ──

  setTarget(point, label, defender = null) {
    this.target = point.clone();
    this.targetLabel = label || null;
    // Held so the designation can clear itself when the man is dead. A target
    // ring left hovering over a corpse would keep the whole battery firing at
    // an empty window.
    this.targetDefender = defender;
    this.targetMarker.position.copy(point);
    this.targetMarker.visible = true;
    this.pulse(point, 0xff6a4d, 9, true);
    this.onEvent('target', { point, label });
  }

  clearTarget() {
    this.target = null;
    this.targetLabel = null;
    this.targetDefender = null;
    this.targetMarker.visible = false;
    this.onEvent('target', null);
  }

  get gunsOnTarget() {
    let n = 0;
    for (const u of this.units) {
      if (!u.alive || u.state === 'setup') continue;
      if (this.aimFor(u)) n++;
    }
    return n;
  }

  /**
   * Rebuild the list of places on the primary worth shooting at.
   *
   * Stratified by height so the sample always includes something near the top
   * and something near the base, rather than clustering wherever the stones
   * happen to be densest.
   */
  _refreshAimCandidates() {
    const out = [];
    for (const st of this.structures) {
      const n = st.count;
      if (!n) continue;
      const want = st === this.primary ? 48 : 10;
      const bands = 8;
      const perBand = Math.max(1, Math.round(want / bands));
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        if (!(st.flags[i] & 1)) continue;
        if (st.py[i] < lo) lo = st.py[i];
        if (st.py[i] > hi) hi = st.py[i];
      }
      if (!isFinite(lo)) continue;
      const span = Math.max(1, hi - lo);
      const found = new Array(bands).fill(0);
      // One stride across the array per band target; a fixed step keeps this
      // O(n) regardless of how much of the building is left.
      const step = Math.max(1, Math.floor(n / (want * 12)));
      for (let i = 0; i < n; i += step) {
        if (!(st.flags[i] & 1)) continue;
        if (st.flags[i] & (2 | 8)) continue;   // falling stones aren't targets
        const b = Math.min(bands - 1, Math.floor(((st.py[i] - lo) / span) * bands));
        if (found[b] >= perBand) continue;
        found[b]++;
        const v = new THREE.Vector3(st.px[i], st.py[i], st.pz[i]);
        // Stones within a few metres of the ground are marked rather than
        // dropped: aiming at one means half the sheaf lands on the pavement in
        // front of the building, so free fire skips them — but they are still
        // the only thing left once a tower is down to its stump.
        v.lowly = st.py[i] - st.hy[i] < this.originGround + 4.5;
        out.push(v);
      }
    }
    this._aimCandidates = out;
    this._aimAge = 0;
  }

  /**
   * What this gun should shoot at right now.
   *
   * The designated target wins whenever it is in range. With none set, free
   * fire goes for the garrison first and the building second — which is both
   * what a gun crew with no orders would do and what the player expects,
   * because the defenders are the thing shooting back.
   *
   * The building half of it used to pick the nearest of a stratified sample of
   * stones, and the nearest stone to a gun standing outside the precinct is
   * almost always one at the very bottom of the near face. With dispersion on
   * top, most of the sheaf then landed on the ground *around* the tower rather
   * than on it: a shell aimed at a stone fifty centimetres above the pavement
   * misses low as often as it hits. So free fire now skips the bottom few
   * metres entirely and takes the nearest stone above it — falling back to the
   * skirting only once that is all a stump has left.
   */
  aimFor(unit) {
    const r = unit.def.range;
    // A launcher has a minimum range as well as a maximum, and the near limit
    // is the one that bites: its rocket cannot come down closer than the motor
    // carries it. Laying on something inside that is not a shot, so the crew
    // looks past it — and if there is nothing further out, it stands idle,
    // which at least reads as a unit in the wrong place rather than one
    // lobbing rockets over the far side of the map.
    const near = unit.def.minRange || 0;
    const near2 = near * near;
    const reaches = (x, y, z) => {
      const dx = x - unit.pos.x, dy = y - unit.pos.y, dz = z - unit.pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      return d <= r * r && d >= near2;
    };
    if (this.target && reaches(this.target.x, this.target.y, this.target.z)) return this.target;
    if (!this.autoEngage) return null;

    // ── Defenders first.
    const g = this.garrison;
    if (g && g.defenders && g.defenders.length) {
      let best = null, bestD = r * r;
      for (const d of g.defenders) {
        if (!d.alive) continue;
        const p = d.muzzle || d.pos;
        if (!p) continue;
        const dx = p.x - unit.pos.x, dy = p.y - unit.pos.y, dz = p.z - unit.pos.z;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < near2) continue;
        if (dd < bestD) { bestD = dd; best = p; }
      }
      // Every tier, not just the infantry. The garrison fires from the
      // building's own windows and parapets, so a shell sent at a defender is
      // a shell sent at the wall he is standing behind: laying on the men
      // costs the heavy guns nothing and it is what the player is watching.
      if (best) return this._aimPoint.copy(best);
    }

    // ── Otherwise the nearest part of the building that is worth hitting.
    let best = null, bestD = r * r;
    for (const c of this._aimCandidates) {
      if (c.lowly) continue;
      const dx = c.x - unit.pos.x, dy = c.y - unit.pos.y, dz = c.z - unit.pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < near2) continue;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) return best;
    // Nothing above the skirting left: take whatever is standing.
    for (const c of this._aimCandidates) {
      const dx = c.x - unit.pos.x, dy = c.y - unit.pos.y, dz = c.z - unit.pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < near2) continue;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // ──────────────────────────────────────────────────────────────── firing ──

  _fireOne(unit, aimPoint) {
    const def = unit.def;
    const muzzleHeight = def.model === 'infantry' ? 1.3 : 2.2;
    const from = unit.pos.clone().setY(unit.pos.y + muzzleHeight);

    // Dispersion is applied to the aim point, so error grows along the line of
    // fire the way real gun dispersion does. A crew that has landed rounds
    // shoots tighter: veterancy is a smaller sheaf.
    const spread = def.dispersion * this.dispersionScale * (1 - 0.14 * (unit.rank || 0));
    const aim = aimPoint.clone();
    const toward = new THREE.Vector3().subVectors(aim, from).setY(0).normalize();
    const across = new THREE.Vector3(-toward.z, 0, toward.x);
    aim.addScaledVector(toward, gauss() * spread * 1.6);
    aim.addScaledVector(across, gauss() * spread * 0.7);
    aim.y += gauss() * spread * 0.5;
    // Area fire: the sheaf is walked over a circle round the point rather
    // than converged on it, which is what you want against a face or a step
    // rather than a pier.
    if (this.fireMode === 'area' && this.target && aimPoint === this.target) {
      const r = 9 + def.warhead.radius * 0.8;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      aim.x += Math.cos(a) * d;
      aim.z += Math.sin(a) * d;
      aim.y += (Math.random() - 0.5) * r * 0.5;
    }

    let vel;
    const p = def.projectile;
    if (p.flat || p.kind === 'arc') {
      // Every gun shoots flat first, and lofts only when it has to.
      //
      // Artillery used to go straight to the minimum-energy lob, which is how
      // a Paladin ended up throwing its shell at ninety metres a second on an
      // eight-second arc — a 155 mm round drifting across the sky like a
      // mortar bomb, which is what "the shells are extremely slow" was. The
      // difference between a howitzer and a direct-fire gun in this game is
      // whether it *can* shoot over things, not whether its shells crawl.
      //
      // Full charge on the *low* solution. A howitzer laid over open sights is
      // not lobbing the shell over the target, it is driving it through the
      // wall, and the trajectory should read that way — fast, taut and
      // arriving while you are still watching the muzzle.
      //
      // Unless something is in the way. A crew that cannot see the target over
      // the roof in front of them elevates until they can; a gun that instead
      // fires flat into the nearest building is not a direct-fire gun, it is a
      // broken one. So: low arc if it is clear, high arc if it is not.
      const low = solveArc(from, aim, p.speed, p.gravity, false);
      if (low && this._trajectoryClear(from, low, p.gravity)) {
        vel = low;
      } else {
        // Elevate — but on a *reduced charge*. The high solution at full charge
        // is the classic trap: at short range it throws the shell very nearly
        // straight up, and it is still climbing when its flight time runs out.
        // The minimum-energy solver picks the charge a real crew would.
        const lofted = solveBallistic(from, aim, p.speed, p.gravity, 9.0,
          (v) => this._trajectoryClear(from, v, p.gravity));
        if (!lofted && !low) { unit.hold = 'no clear arc'; return false; }
        vel = lofted ? lofted.vel : low;
      }
    } else if (p.kind === 'rocket') {
      // The motor is part of the solve, not something that happens to the
      // shot afterwards. `solveBoosted` returns null for a target inside
      // minimum range, where the burn alone overshoots whatever the launch —
      // the crew holds its fire rather than throwing the rocket over the city.
      //
      // Flat first and loft only when it has to, the same rule the guns
      // follow: a compensated rocket is fast and shallow, which is right up
      // until there is a roof between the launcher and the target. The
      // clearance is tested against the speed the rocket will actually be
      // doing once the motor has finished with it, not the speed it leaves
      // the rail at, or every shot reads as blocked by the ground in front.
      // Every elevation from the flattest up, each tested for clearance on
      // the flight the motor actually gives it: the first that is clear and
      // lands is the quickest rocket that can be laid on the point. Past
      // the flight budget if it has to be; blind if there is nothing else.
      const clear = (v) => this._trajectoryClear(from, v, p.gravity);
      vel = solveBoosted(from, aim, p.speed, p.gravity, 9.0, clear)
        || solveBoosted(from, aim, p.speed, p.gravity, 20.0, clear)
        || solveBoosted(from, aim, p.speed, p.gravity, 20.0);
      if (!vel) { unit.hold = 'inside minimum range'; return false; }
    } else if (p.kind === 'arc') {
      const sol = solveBallistic(from, aim, p.speed, p.gravity, 9.0,
        (v) => this._trajectoryClear(from, v, p.gravity));
      if (!sol) { unit.hold = 'out of range'; return false; }
      vel = sol.vel;
    } else if (p.kind === 'topattack') {
      vel = new THREE.Vector3(0, p.speed, 0);
    } else {
      vel = solveDirect(from, aim, p.speed, p.gravity);
    }

    // Never fire into something a metre away. Placement keeps guns out of the
    // landmarks, but rubble piles up and the ground moves, and a crew that has
    // been buried should hold its fire rather than detonate its own round in
    // its own lap.
    if (vel && p.kind !== 'topattack') {
      const len = Math.hypot(vel.x, vel.y, vel.z);
      if (len > 1e-3) {
        // Rubble and masonry only. The city is in the physics world now, and a
        // gun limbered up two and a half metres from a wall is where a gun
        // goes — refusing to fire for that would mute half the batteries in
        // town, when what the shot actually needs is the loft the clearance
        // test above has already worked out.
        const blocked = this.physics.castRay(
          { x: from.x, y: from.y, z: from.z },
          { x: vel.x / len, y: vel.y / len, z: vel.z / len },
          2.6, null, this.physics.cityBody,
        );
        if (blocked) { unit.hold = 'muzzle blocked'; return false; }
      }
    }
    unit.hold = null;

    this.projectiles.fire({
      pos: from, vel, gravity: p.gravity, kind: p.kind, speed: p.speed,
      warhead: def.warhead, owner: unit, target: aim, trail: p.trail,
    });

    const dir = vel.clone().normalize();
    this.fx.muzzleFlash(from, dir, def.warhead.fx);
    if (p.kind === 'rocket') {
      // A rocket leaves a launcher, not a barrel: the blast goes out of the
      // back, and the round itself only starts to move.
      const back = dir.clone().negate();
      this.fx.muzzleFlash(from.clone().addScaledVector(back, 2.2), back, def.warhead.fx * 1.1);
      this.fx.impactDust(from.x + back.x * 6, from.y - 1.2, from.z + back.z * 6, 1.6);
      this.fx.impactDust(from.x + back.x * 3, from.y - 1.2, from.z + back.z * 3, 1.0);
    }
    if (this.audio) {
      const p = def.projectile;
      const heavy = def.warhead.fx;
      this.audio.play(p.kind === 'rocket' ? 'rocket' : 'gun', from, {
        // Pitch tracks calibre: the AT4 is a crack, the Paladin a thud.
        rate: THREE.MathUtils.clamp(1.35 - heavy * 0.22, 0.55, 1.4),
        gain: 0.45 + heavy * 0.25,
        rolloff: 260 + heavy * 140,
      });
    }
    this.engine.addShake(Math.min(0.13, def.warhead.fx * 0.035));
    this.shotsFired++;

    unit.yaw = Math.atan2(aim.x - unit.pos.x, aim.z - unit.pos.z);
    unit.group.rotation.y = unit.yaw;
    return true;
  }

  /**
   * Does this shell clear everything between the gun and the target?
   *
   * Walks the parabola in a handful of steps and tests each leg against the
   * structures' solidity grids, stopping short of the target so the building
   * being shot at doesn't count as an obstruction. Cheap enough to run on every
   * round, and it is only asked of direct-fire weapons, which are the only ones
   * with a trajectory flat enough for it to matter.
   */
  _trajectoryClear(from, vel, gravity) {
    const a = this._trajA || (this._trajA = new THREE.Vector3());
    const bpt = this._trajB || (this._trajB = new THREE.Vector3());
    // Time to the apex-or-target; sampling the first 85% avoids condemning the
    // shot because the last leg runs into the wall it is aimed at. The cap is
    // generous enough to cover a lofted shell, which is in the air far longer
    // than a flat one and spends most of that time over the ground it has to
    // clear.
    const flight = Math.max(0.1, (2 * Math.max(0, vel.y)) / gravity);
    const span = Math.min(flight, 14) * 0.85;
    const steps = 12;
    a.copy(from);
    for (let i = 1; i <= steps; i++) {
      const t = (span * i) / steps;
      bpt.set(
        from.x + vel.x * t,
        from.y + vel.y * t - 0.5 * gravity * t * t,
        from.z + vel.z * t,
      );
      if (!lineOfSight(this.structures, a, bpt, 0, 0)) return false;
      // And the city, which is now masonry as far as a shell is concerned. A
      // gun in a street has a roof in front of it, and a flat trajectory into
      // that roof is a round that detonates on somebody's chimney: the solver
      // has to know, or every battery deployed among the buildings spends the
      // match shelling the buildings.
      if (this.cityBlocker && this.cityBlocker.blocks(a, bpt)) return false;
      // And the ground, which this did not look at for a long time. Masonry
      // was the only thing that could block a shot, so a gun on the flank of a
      // mountain firing at something above it never discovered that its flat
      // trajectory went into the hillside forty metres in front of the muzzle:
      // it fired, the shell detonated at its own feet, and nothing up the hill
      // was ever touched. The first few metres are skipped because the muzzle
      // is standing on the ground by definition — metres from the gun, not
      // samples: skipping the first sample of twelve was a fifth of a low
      // arc's flight, and a battery posted on the slope under the Acropolis
      // fired half its rounds into the rock face thirty metres in front of it
      // with the check looking the other way.
      if (this.terrain && Math.hypot(bpt.x - from.x, bpt.z - from.z) > 8) {
        const g = this.terrain.heightAt(bpt.x, bpt.z);
        if (bpt.y < g + 1.5) return false;
      }
      a.copy(bpt);
    }
    return true;
  }

  _updateUnits(dt) {
    for (const u of this.units) {
      if (!u.alive) continue;

      if (u.health <= 0) {
        u.alive = false;
        this.unitsLost++;
        this.scene.remove(u.group);
        this.fx.detonate(u.pos.clone().setY(u.pos.y + 1), 0.55, {
          ground: true, groundY: u.pos.y,
        });
        this.onEvent('unitlost', u);
        continue;
      }

      if (this.invulnerable) u.health = u.maxHealth;

      // Time in place. After half a minute the crew has dug in.
      u.age += dt;
      if (!u.dugIn && u.age > 28) { u.dugIn = true; this.onEvent('dugin', u); }

      if (u.state === 'setup') {
        u.setupLeft -= dt;
        if (u.setupLeft <= 0) { u.state = 'ready'; u.cooldown = 0; }
        continue;
      }

      // Mid-salvo: keep loosing rockets on the interval.
      if (u.salvoLeft > 0) {
        u.salvoTimer -= dt;
        if (u.salvoTimer <= 0) {
          const aim = u.salvoAim || this.aimFor(u);
          if (aim) this._fireOne(u, aim);
          u.salvoLeft--;
          u.salvoTimer = u.def.salvo.interval;
          if (u.salvoLeft === 0) {
            u.cooldown = u.def.reload * this.reloadScale;
            u.salvoAim = null;
          }
        }
        continue;
      }

      u.cooldown -= dt;
      if (u.cooldown > 0) continue;

      const aim = this.aimFor(u);
      if (!aim) { u.idle = true; u.cooldown = 0.5; continue; }
      u.idle = false;

      if (u.def.salvo) {
        // A ripple stays on the aim point it was laid for; re-solving between
        // rockets would walk the sheaf around as the target list refreshes.
        u.salvoAim = aim.clone();
        u.salvoLeft = u.def.salvo.count;
        u.salvoTimer = 0;
      } else {
        if (this._fireOne(u, aim)) u.cooldown = u.def.reload * this.reloadScale;
        else u.cooldown = 1.0;
      }
    }
    this.units = this.units.filter((u) => u.alive || u.group.parent);
  }

  // ─────────────────────────────────────────────────────────────── impacts ──

  /**
   * The radius round `point` that encloses `frac` of this structure.
   *
   * The bombs are sized in *effect*, not in metres: a tenth of the building,
   * whatever the building. Stones are sorted by distance from the impact and
   * their mass summed outward until the fraction is met; the blast is then
   * exactly that big. A pyramid gets a crater a hundred metres across, a
   * clock tower loses a storey, and both have lost the same share.
   */
  _radiusForFraction(s, point, frac, maxR) {
    const need = frac * s.totalMass;
    const R2 = maxR * maxR;
    const near = [];
    for (let i = 0; i < s.count; i++) {
      if (!(s.flags[i] & 1) || (s.flags[i] & 2)) continue;   // alive, not loose
      const dx = s.px[i] - point.x, dy = s.py[i] - point.y, dz = s.pz[i] - point.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= R2) near.push(d2, s.mass[i]);
    }
    if (!near.length) return null;
    const idx = [];
    for (let k = 0; k < near.length; k += 2) idx.push(k);
    idx.sort((a, b2) => near[a] - near[b2]);
    let acc = 0;
    for (const k of idx) {
      acc += near[k + 1];
      if (acc >= need) return Math.sqrt(near[k]) + 0.6;
    }
    return maxR;
  }

  /**
   * How wide a hole this bomb is allowed to cut in what it hits.
   *
   * `frac` sizes a blast by its share of the whole building, which is the
   * right instinct for a pyramid and the wrong one for a tower: a tenth of
   * the Elizabeth Tower's stone, gathered round one point, is a sphere wider
   * than the tower. The bomb then takes the whole cross section, the load
   * solver correctly finds nothing under the next two hundred feet of it,
   * and one 500 lb bomb lays the entire tower in the road.
   *
   * So a bomb may only cut `bite` of the way across the masonry standing at
   * the height it goes off at. Under that the frac sizing is untouched, and
   * on anything broader than the blast — which is most things — this never
   * binds. Over it a spine is left on the far side, and what happens next is
   * the stress model's business: often a lean, sometimes a collapse anyway if
   * the hit was central enough, and never the guaranteed clean slice.
   *
   * It is also what separates the two aircraft. The Strike Eagle bites
   * (`bite` below 1) and cannot fell a tower alone; the Lancer's MOAB is
   * written with no bite at all, because eleven tonnes of it genuinely does
   * take a third of whatever it lands on in one pass. That is what the extra
   * $300k buys.
   */
  _sectionCap(s, point, bite) {
    const BAND = 6.0;                       // the course the bomb goes off in
    const d = [];
    for (let i = 0; i < s.count; i++) {
      if (!(s.flags[i] & 1) || (s.flags[i] & 2)) continue;   // alive, not loose
      if (Math.abs(s.py[i] - point.y) > BAND) continue;
      d.push(Math.hypot(s.px[i] - point.x, s.pz[i] - point.z));
    }
    if (d.length < 8) return Infinity;      // nothing to measure: don't cap
    // The 85th percentile rather than the far corner, so one outlying
    // buttress cannot argue the tower is twice as wide as it is.
    d.sort((a, b) => a - b);
    const span = d[Math.floor(d.length * 0.85)];
    return span * bite;
  }

  /** A bomb from the air wing has gone off. */
  _strikeImpact(hit) {
    const { point, proj } = hit;
    const w = proj.warhead;
    const st = proj.strikeDef.strike;
    const down = { x: 0, y: -1, z: 0 };
    // Sized on the building it lands on — the one with masonry nearest the
    // impact — and everything else in the sphere is collateral. Sizing each
    // structure separately had one bomb take its tenth of the tower and its
    // tenth of the palace wing alongside, which is two bombs' work.
    let struck = null, best = Infinity;
    for (const s of this.structures) {
      for (let i = 0; i < s.count; i += 3) {
        if (!(s.flags[i] & 1)) continue;
        const d2 = (s.px[i] - point.x) ** 2 + (s.py[i] - point.y) ** 2 + (s.pz[i] - point.z) ** 2;
        if (d2 < best) { best = d2; struck = s; }
      }
    }
    const r = struck && best < st.maxR * st.maxR
      ? this._radiusForFraction(struck, point, st.frac, st.maxR) : null;
    let rMax = Math.max(st.minR, r ?? st.minR);
    // Never wider than the masonry it lands in can afford to lose.
    if (struck && st.bite) rMax = Math.max(st.minR, Math.min(rMax, this._sectionCap(struck, point, st.bite)));
    let destroyed = 0;
    for (const s of this.structures) {
      destroyed += s.explode(point, rMax, rMax * 1.15, w.power * this.powerScale,
        // A third of the core comes out as stone rather than as dust. A bomb
        // this size does not make masonry vanish, it throws it, and the throw
        // is most of what the player is paying half a million dollars to see.
        { dir: down, kinetic: w.kinetic ?? 0.35, shock: st.shock ?? 2.4, eject: 0.34 });
    }
    const killed = this.garrison.splash(point, rMax * 1.5, w.power);
    if (killed) {
      this.defendersKilled += killed;
      this.money += killed * MONEY_PER_DEFENDER;
      this.onEvent('bounty', { point, amount: killed * MONEY_PER_DEFENDER, kind: 'kill' });
    }
    const groundY = this.terrain.heightAt(point.x, point.z);
    const nearGround = point.y - groundY < 6.0;
    this._lastImpact = point.clone();
    // Everything under the bomb burns.
    if (this.cityFire) this.cityFire.blast(point, rMax * 0.8);
    this.fx.strikeBlast(point, w.fx, { groundY });
    // The column stands over the site for the rest of the level, and it is
    // the thing you see from across the map. A bomb earns a bigger one than a
    // shell does, so this is not clamped to the shell's ceiling.
    this.fx.dustColumn(point.x, Math.max(point.y, groundY), point.z, w.fx * 0.52);
    if (this.fires) this.fires.ignite(point.x, point.y, point.z, 3 + st.frac * 6, 40 + st.frac * 80);
    if (this.life) this.life.startle(point.x, point.z, 300 + w.fx * 60);
    if (nearGround && this.craters) this.craters.add(point.x, groundY, point.z, rMax * 0.9);
    const camDist = this.camera.position.distanceTo(point);
    this.engine.addShake(THREE.MathUtils.clamp(w.fx * 52 / Math.max(camDist, 30), 0.12, 1.35));
    if (this.audio) {
      // Sound arrives late, and that is most of what sells the size.
      //
      // The flash reaches the camera instantly and the noise does not: at six
      // hundred metres the bang is the better part of two seconds behind it.
      // Playing both on the same frame is what makes a distant blast read as
      // a firework rather than as eleven tonnes going off a long way away, so
      // the report is delayed by the distance it has to travel.
      //
      // Three layers, because one sample cannot be both a crack and a boom:
      // the detonation itself, the same sample dropped an octave under it for
      // the body, and a longer, quieter tail for the echo off everything
      // around the site.
      const wait = Math.min(2600, (camDist / 343) * 1000);
      const deep = st.frac > 0.2;
      const boom = () => {
        this.audio.play('explosion', point, {
          rate: deep ? 0.42 : 0.6, gain: 1.0, rolloff: 1400,
        });
        this.audio.play('explosion', point, {
          rate: deep ? 0.26 : 0.36, gain: deep ? 0.95 : 0.7, rolloff: 2200,
        });
        this.audio.rumble(deep ? 1.6 : 1, point);
        setTimeout(() => this.audio?.play('explosion', point, {
          rate: deep ? 0.2 : 0.3, gain: deep ? 0.5 : 0.3, rolloff: 3000,
        }), deep ? 420 : 300);
      };
      if (wait > 60) setTimeout(boom, wait); else boom();
    }
    this.onEvent('strikehit', { def: proj.strikeDef, point, destroyed, radius: rMax });
  }

  _onImpact(hit) {
    const { point, proj } = hit;
    const w = proj.warhead;
    if (proj.kind === 'bomb' && proj.strikeDef) { this._strikeImpact(hit); return; }

    // Defensive mortar fire lands on the player's guns. It chips whatever it
    // touches on the way — a round that clips the parapet really does take the
    // parapet with it — but its business is the battery, not the building.
    if (proj.hostile) {
      for (const u of this.units) {
        if (!u.alive) continue;
        const d = u.pos.distanceTo(point);
        if (d > w.radius) continue;
        u.health -= w.power * (1 - d / w.radius) * 0.06 * (u.dugIn ? 0.65 : 1);
      }
      for (const s of this.structures) {
        s.explode(point, w.lethal * 0.5, w.radius * 0.5, w.power * 0.3, { kinetic: 0.2 });
      }
      const gy0 = this.terrain.heightAt(point.x, point.z);
      this.fx.detonate(point, w.fx, { ground: point.y - gy0 < 4.0, groundY: gy0 });
      if (this.audio) {
        this.audio.play('explosion', point, { rate: 1.25, gain: 0.42, rolloff: 260 });
      }
      const cd0 = this.camera.position.distanceTo(point);
      this.engine.addShake(THREE.MathUtils.clamp(w.fx * 20 / Math.max(cd0, 30), 0.01, 0.4));
      return;
    }

    // The turret first: three rounds in four glance off it and are re-fired
    // along their new line, so a round that has been deflected has not
    // arrived anywhere yet.
    if (this.turret && hit.owner === this.turret) {
      const r = this.turret.hit(hit, proj, this);
      if (r === 'deflect' || r === 'bite') { this._lastImpact = point.clone(); return; }
    }
    // A round that stopped against the town.
    //
    // `structureHit` means the ray found *a* collider, not that it found the
    // monument: the town's boxes are in the same physics world and are the
    // commonest thing a shell aimed over a tower actually meets. The old test
    // asked for `!structureHit`, which excluded every round that hit a
    // building and let through only the one case that certainly is not one —
    // a round that stopped against nothing and fell in the street. So a shell
    // through a roof registered on the town exactly when it missed the town,
    // and a block could take a battery's whole allotment without so much as
    // a scorch mark.
    //
    // Ownership is still the discriminator, because it is the one thing that
    // is exact: the turret and every loose stone carry an owner, and the
    // monument's standing masonry carries none — but neither does the town,
    // so `plotAt` settles it by asking whether a building is at the point.
    // Nothing of the monument's is, because the precinct keeps the survey
    // off it.
    if (this.cityFire && hit.owner == null) {
      this.cityFire.hit(point, w);
    }

    const power = w.power * this.powerScale;
    // The direction the round was travelling when it arrived, so the masonry
    // leaves the far side rather than puffing outward in a symmetric ball.
    const v = proj.vel;
    const speed = Math.hypot(v.x, v.y, v.z) || 1;
    const dir = { x: v.x / speed, y: v.y / speed, z: v.z / speed };
    const blast = { dir, kinetic: w.kinetic ?? 0.3 };

    // Delay fuze: the shell buries itself before it goes off, so the burst is
    // inside the wall rather than on it. Deeper damage to the masonry, less
    // blast on the men outside it, and a little of the energy spent on the
    // way in.
    let at = point;
    let lethal = w.lethal, radius = w.radius, blastPower = power, splashR = w.radius * 1.25;
    if (this.fireMode === 'delay' && hit.structureHit) {
      const depth = 1.4 + w.radius * 0.18;
      at = point.clone().addScaledVector(new THREE.Vector3(dir.x, dir.y, dir.z), depth);
      lethal *= 1.25; radius *= 1.05; blastPower *= 1.15; splashR *= 0.7;
    }

    let destroyed = 0;
    for (const s of this.structures) {
      destroyed += s.explode(at, lethal, radius, blastPower, blast);
    }

    const killed = this.garrison.splash(at, splashR, power);
    if (killed) {
      this.defendersKilled += killed;
      this.money += killed * MONEY_PER_DEFENDER;
      if (proj.owner) proj.owner.kills += killed;
      this.onEvent('bounty', { point: at, amount: killed * MONEY_PER_DEFENDER, kind: 'kill' });
    }
    // The crew's record. Rounds that actually took stone out count toward
    // the next chevron; the sheaf tightens as they earn them.
    if (proj.owner && (destroyed > 0 || killed > 0)) {
      const u = proj.owner;
      u.hits += 1;
      const rank = Math.min(3, Math.floor((u.hits + u.kills * 3) / 10));
      if (rank > u.rank) { u.rank = rank; this.onEvent('rank', u); }
    }
    // A heavy hit on masonry leaves a fire burning in the hole.
    if (this.fires && hit.structureHit && destroyed > 8) {
      this.fires.ignite(at.x, at.y, at.z, Math.min(3, destroyed / 22), 16 + Math.min(28, destroyed));
    }

    const groundY = this.terrain.heightAt(point.x, point.z);
    const nearGround = point.y - groundY < 4.0;
    this._lastImpact = point.clone();
    this.fx.detonate(point, w.fx, { ground: nearGround, groundY });
    if (this.life) this.life.startle(point.x, point.z, 60 + w.fx * 40);
    // A round that falls short leaves a mark. Cheap, and it turns a miss into
    // information: you can see where the sheaf is actually landing.
    if (nearGround && this.craters) this.craters.add(point.x, groundY, point.z, w.radius);

    // Shake falls off with distance from the camera so a hit across the map
    // doesn't rattle the viewport as hard as one under your nose.
    const camDist = this.camera.position.distanceTo(point);
    this.engine.addShake(THREE.MathUtils.clamp(w.fx * 26 / Math.max(camDist, 30), 0.02, 0.75));

    if (this.audio) {
      this.audio.play('explosion', point, {
        rate: THREE.MathUtils.clamp(1.3 - w.fx * 0.2, 0.55, 1.35),
        gain: 0.5 + w.fx * 0.2,
        rolloff: 300 + w.fx * 180,
      });
      // Masonry actually coming down gets its own low roar on top of the bang.
      if (destroyed > 10) this.audio.rumble(Math.min(1, destroyed / 90), point);
    }

    if (destroyed > 6) this.onEvent('bigimpact', { point, destroyed });
  }

  /**
   * A demolition charge going off, having been uncovered by shellfire.
   *
   * Far bigger than any round in the game and entirely local: the point is
   * that a pyramid, which has to be quarried rather than felled, occasionally
   * pays out a large piece of itself for having been dug into. Sized to take a
   * few per cent of the monument — a thirty-two metre radius is about ninety
   * thousand cubic metres, against Khufu's two and a third million.
   */
  demolitionCharge(point) {
    let destroyed = 0;
    for (const s of this.structures) {
      destroyed += s.explode(point, 20, 32, 52000, { kinetic: 0.12 });
    }
    const killed = this.garrison.splash(point, 38, 52000);
    if (killed) {
      this.defendersKilled += killed;
      this.money += killed * MONEY_PER_DEFENDER;
    }
    const groundY = this.terrain.heightAt(point.x, point.z);
    this.fx.detonate(point, 3.4, { ground: point.y - groundY < 4.0, groundY });
    if (this.life) this.life.startle(point.x, point.z, 160);
    const camDist = this.camera.position.distanceTo(point);
    this.engine.addShake(THREE.MathUtils.clamp(110 / Math.max(camDist, 30), 0.05, 0.95));
    if (this.audio) {
      this.audio.play('explosion', point, { rate: 0.5, gain: 0.95, rolloff: 900 });
      this.audio.rumble(1, point);
    }
    this.onEvent('charge', { point, destroyed });
  }

  // ────────────────────────────────────────────────────────────────── loop ──

  update(dt) {
    if (this.state !== 'playing') {
      // The fight is over; the sky is not. Transports still in the air fly
      // on and their loads come down, rounds in flight land, the fires burn
      // and the smoke drifts — under the collapse and behind the report,
      // rather than freezing in mid-air the moment the bar filled.
      this.air.update(dt);
      this.projectiles.update(dt, this.fx, this.terrain, (h) => this._onImpact(h));
      if (this.smokes) this.smokes.update(dt);
      if (this.fires) this.fires.update(dt);
      if (this.tracerFX) this.tracerFX.update(dt);
      return;
    }
    this.elapsed += dt;
    if (this.package) {
      const left = this.package.closesAt - this.elapsed;
      const tick = Math.ceil(left);
      if (tick !== this.package.tick && left > 0) {
        this.package.tick = tick;
        this.onEvent('packagetick', { left: tick, count: this.package.drops.length });
      }
      if (left <= 0) this._launch();
    }
    this.money += this.income * dt;

    this._aimAge += dt;
    if (this._aimAge > 0.6) this._refreshAimCandidates();

    this._updateUnits(dt);
    this.air.update(dt);
    this.projectiles.update(dt, this.fx, this.terrain, (h) => this._onImpact(h));

    // Money and unlocks track masonry actually brought down. Using the
    // standing-mass figure means you are paid for collapse, not for cosmetic
    // chipping — which is the behaviour the whole economy is meant to reward.
    const destroyedMass = this.structures.reduce((a, s) => a + s.demolishedMass, 0);
    const delta = destroyedMass - this._lastDestroyedMass;
    if (delta > 0) {
      const earned = (delta / 1000) * MONEY_PER_TONNE;
      this.money += earned;
      this.score += delta / 1000;
      this._lastDestroyedMass = destroyedMass;
      // Told in lumps, not a trickle: the readout collects what has come in
      // and announces it once it is worth announcing.
      this._bountyAcc = (this._bountyAcc || 0) + earned;
      if (this._bountyAcc >= 25) {
        this.onEvent('bounty', { point: this._lastImpact || this.primary.origin,
          amount: Math.round(this._bountyAcc), kind: 'stone' });
        this._bountyAcc = 0;
      }
    }
    if (this.smokeCooldown > 0) this.smokeCooldown -= dt;
    if (this.smokes) this.smokes.update(dt);
    if (this.fires) this.fires.update(dt);

    // Defenders.
    if (this.targetDefender && !this.targetDefender.alive) this.clearTarget();

    const lost = this.garrison.reconcileStructure(this.originGround);
    if (lost) {
      this.defendersKilled += lost;
      this.money += lost * MONEY_PER_DEFENDER;
      this.onEvent('crushed', lost);
    }
    const shots = [];
    // What of the player's is in the air this tick, for the crews that can
    // reach up. Filled into one array the battle owns rather than a new one
    // every frame, and empty on all but the few seconds a sortie is running.
    const air = this.air ? this.air.airTargets(this._air || (this._air = [])) : null;
    this.garrison.update(dt, this.units, shots, this.structures, air);
    this._pushTracers(shots);
    // The garrison decides what it hit; the air wing decides what that does
    // to an aeroplane or a canopy. Neither needs to know the other's business.
    for (const sh of shots) if (sh.air && sh.hit) this.air.hitAir(sh.air, sh.damage);
    this.garrison.updateMortars(dt, this.projectiles, this.units);
    if (this.turret) this.turret.update(dt, this.units, this.projectiles, this);
    this.garrison.sync();
    this.tracerFX.update(dt);
    this._updateRings(dt);
    this._updateHealthBars();
    this._updateEmplacements();

    if (this.targetMarker.visible) {
      this.targetMarker.rotation.y += dt * 0.7;
      this.targetMarker.children[0].rotation.x = Math.PI / 2;
      this.targetMarker.children[1].rotation.x = Math.PI / 2;
    }
    // The strike sight: the brackets turn and the aim point breathes, so a
    // reticle sitting still over a static piece of ground still reads as
    // something that is looking at it.
    if (this.strikeReticle && this.strikeReticle.visible) {
      const spin = this.strikeReticle.getObjectByName('spin');
      if (spin) spin.rotation.y -= dt * 0.9;
      const dot = this.strikeReticle.getObjectByName('dot');
      if (dot) {
        const k = 1 + Math.sin(this.elapsed * 6.0) * 0.28;
        dot.scale.set(k, 1, k);
      }
    }

    this._checkEnd();
  }

  _pushTracers(shots) {
    for (const s of shots) {
      this.tracerFX.fire(s.from, s.to, s.defender.def, s.hit);
    }
    if (this.audio && shots.length) {
      const s = shots[Math.floor(Math.random() * shots.length)];
      const kind = s.defender?.type;
      const mg = kind === 'mg';
      this.audio.play(mg ? 'mg' : 'enemy', s.from, {
        gain: mg ? 0.3 : 0.26, rolloff: 200,
        rate: kind === 'sniper' ? 0.82 : kind === 'at' ? 0.7 : 1.0,
        cooldown: mg ? 0.16 : 0.1,
      });
    }
  }

  /**
   * The objectives, and how far each has to go.
   *
   * The landmark the level is named after is judged on height as well as mass,
   * because a tower that has lost two thirds of its height is unambiguously
   * down however much rubble is piled at its foot. Anything else required —
   * a garrisoned wing, say — is judged on mass alone: it never had a topple in
   * it, so demanding one would be demanding something that cannot happen.
   */
  get objectives() {
    if (this._objectives) return this._objectives;
    // Ninety per cent of the monument, or it has gone over.
    //
    // One number, in one place, for every level. Both halves matter: a tower
    // lying on the ground is finished whatever fraction of its mass is still
    // in the rubble pile, which is what the height test is for; and a dome or
    // a pyramid, which never topples, is finished when there is almost nothing
    // of it left.
    const primaryWin = this.level?.win ?? { integrity: 0.10, heightFrac: 0.30 };
    // The other targets win on height too. A wing shelled into a pile keeps
    // its lowest courses intact under the rubble, so its mass reads a third
    // standing when nothing is; digging those out from under the heap is
    // not a game anyone wants to play. If it is under thirty per cent of its
    // height, it is down.
    const otherWin = this.level?.winSecondary ?? { integrity: 0.15, heightFrac: 0.30 };
    this._objectives = this.structures
      .filter((s) => s.required || s === this.primary)
      .map((s) => ({
        structure: s,
        label: s.label || (s === this.primary ? this.level?.target : 'STRUCTURE'),
        isPrimary: s === this.primary,
        startHeight: s.standingHeight(),
        win: s === this.primary ? primaryWin : otherWin,
      }));
    return this._objectives;
  }

  /** Is one objective satisfied? */
  objectiveDone(o) {
    const s = o.structure;
    if (s.monumentIntegrity < o.win.integrity) return true;
    if (o.win.heightFrac === undefined) return false;
    const start = o.startHeight - this.originGround;
    if (start <= 0.5) return false;
    return (s.standingHeight() - this.originGround) / start < o.win.heightFrac;
  }

  /** 0..1 across every objective, weighted by how much masonry each is. */
  get objectiveProgress() {
    let done = 0, total = 0;
    for (const o of this.objectives) {
      const w = o.structure.totalMass;
      total += w;
      // How far this one has come, as a fraction of what it takes to finish it.
      // A finished objective is finished, whichever rule finished it: one
      // brought down by height counts in full, whatever its mass reads.
      if (this.objectiveDone(o)) { done += w; continue; }
      const integ = o.structure.monumentIntegrity;
      const need = 1 - o.win.integrity;
      done += w * Math.max(0, Math.min(1, (1 - integ) / Math.max(0.01, need)));
    }
    return total > 0 ? done / total : 0;
  }

  /**
   * Carry on after the level is already won.
   *
   * The objectives stay met — the win is banked and recorded — but play
   * resumes, so a player who wants the other ten per cent can have it. The
   * flag is what stops `_checkEnd` firing the win again on the next frame.
   */
  resumeAfterWin() {
    if (this.state !== 'won') return false;
    this.state = 'playing';
    this._winAcknowledged = true;
    return true;
  }

  /** The share of the bar that wins the level. */
  static WIN_AT = 0.90;

  /** Has every objective been brought to nothing? For the readouts. */
  get flattened() { return !!this._flattened; }

  _checkEnd() {
    if (this._winAcknowledged) {
      // The win is banked and play went on. When there is nothing left of
      // any objective, say so once: a player who has taken the last ten per
      // cent down deserves a card for it, and without one the hundred looked
      // like a win that never came.
      if (!this._flattened && this.objectives.every((o) => o.structure.monumentIntegrity < 0.03)) {
        this._flattened = true;
        this.state = 'won';
        this.onEvent('flattened', this.summary());
      }
      return;
    }
    // Ninety per cent on the bar is the win. The bar is every objective's
    // progress towards its own threshold, weighted by its masonry, so the
    // whole job is a hundred; demanding that every last target also be over
    // its own line meant a player with the tower flat and the palace at
    // sixty per cent sat on 91% with nothing happening. The bar is the
    // promise, and now it is the rule too — and a level whose objectives are
    // all down is over whatever the arithmetic says.
    if (this.objectiveProgress >= Battle.WIN_AT
        || this.objectives.every((o) => this.objectiveDone(o))) {
      this.state = 'won';
      this.onEvent('win', this.summary());
      return;
    }

    // Loss: nothing deployed, nothing in flight, and not enough money for the
    // cheapest thing that could still make progress.
    // Nothing in the lift either: a package waiting to fly is a battery
    // waiting to arrive, and the sorties only exist once it has launched.
    const liveUnits = this.units.filter((u) => u.alive).length;
    const costs = UNITS.filter((u) => this.isUnlocked(u) && !u.strike).map((u) => u.cost);
    const cheapest = costs.length ? Math.min(...costs) : Infinity;
    if (liveUnits === 0 && this.projectiles.inFlight === 0 && this.air.active === 0
        && this.pending.length === 0 && !this.package
        && Number.isFinite(cheapest) && this.money < cheapest) {
      this.state = 'lost';
      this.onEvent('lose', this.summary());
    }
  }

  /** The placed unit nearest a world point, within `maxDist`. */
  unitNear(point, maxDist = 6) {
    let best = null, bestD = maxDist * maxDist;
    for (const u of this.units) {
      if (!u.alive) continue;
      const d = u.pos.distanceToSquared(point);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  summary() {
    return {
      score: Math.round(this.score),
      integrity: this.primary.monumentIntegrity,
      heightStanding: this.primary.standingHeight() - this.originGround,
      startHeight: this.startHeight - this.originGround,
      defendersKilled: this.defendersKilled,
      unitsLost: this.unitsLost,
      shotsFired: this.shotsFired,
      spent: Math.round(this.spent),
      time: this.elapsed,
    };
  }
}

/** Box–Muller, so dispersion is normally distributed rather than uniform. */
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.5;
}
