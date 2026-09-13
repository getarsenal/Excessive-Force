import * as THREE from 'three';
import { UNITS, UNITS_BY_ID, ModelLibrary, makeInfantryMesh } from './units.js';
import { solveBallistic, solveDirect, ProjectileManager } from './projectiles.js';

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
    this.garrison = ctx.garrison;
    this.fx = ctx.fx;
    this.quality = ctx.quality;
    this.engine = ctx.engine;
    this.audio = ctx.audio || null;
    this.level = ctx.level || null;
    this.onEvent = ctx.onEvent || (() => {});

    this.models = new ModelLibrary();
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

    this.totalMass = this.structures.reduce((a, s) => a + s.totalMass, 0);
    this.startHeight = this.primary.standingHeight();
    this.originGround = ctx.groundY;

    this._lastDestroyedMass = 0;
    this._setupTracers();
    this._setupTargetMarker();
    this._setupGhost();
  }

  // ─────────────────────────────────────────────────────────────── visuals ──

  _setupTracers() {
    const max = 220;
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(max * 6);
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracerGeo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffc978, transparent: true, opacity: 0.75, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.tracers = new THREE.LineSegments(this.tracerGeo, mat);
    this.tracers.frustumCulled = false;
    this.scene.add(this.tracers);
    this._tracerList = [];
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

  _setupGhost() {
    const g = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    g.visible = false;
    this.ghost = g;
    this.scene.add(g);
  }

  // ────────────────────────────────────────────────────────────── economy ──

  get progress() {
    const demolished = this.structures.reduce((a, s) => a + s.demolishedMass, 0);
    return Math.min(1, demolished / this.totalMass);
  }

  isUnlocked(u) { return this.progress >= (u.unlockFrac ?? 0); }
  canAfford(u) { return this.money >= u.cost; }

  get income() {
    // Income rises as the assault succeeds, so a good opening snowballs.
    return BASE_INCOME * (1 + this.progress * 2.4);
  }

  // ─────────────────────────────────────────────────────────── deployment ──

  selectUnit(id) {
    const u = UNITS_BY_ID[id];
    if (!u || !this.isUnlocked(u)) return false;
    this.selectedUnitId = this.selectedUnitId === id ? null : id;
    this.ghost.visible = false;
    return true;
  }

  /** Can a unit stand here? */
  validPlacement(point) {
    if (!point) return { ok: false, reason: 'no ground' };
    if (this.terrain.isWater(point.x, point.z)) return { ok: false, reason: 'in the river' };
    const span = this.terrain.span;
    if (Math.abs(point.x) > span * 0.92 || Math.abs(point.z) > span * 0.92) {
      return { ok: false, reason: 'off map' };
    }
    // Keep clear of the structures themselves.
    for (const s of this.structures) {
      const dx = point.x - s.origin.x, dz = point.z - s.origin.z;
      if (Math.hypot(dx, dz) < 26) return { ok: false, reason: 'too close' };
    }
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.pos.distanceTo(point) < 7) return { ok: false, reason: 'occupied' };
    }
    return { ok: true };
  }

  async deploy(id, point) {
    const def = UNITS_BY_ID[id];
    if (!def) return null;
    if (!this.isUnlocked(def)) return null;
    if (this.money < def.cost) { this.onEvent('poor', def); return null; }
    const check = this.validPlacement(point);
    if (!check.ok) { this.onEvent('badplace', check); return null; }

    this.money -= def.cost;
    this.spent += def.cost;

    const y = this.terrain.heightAt(point.x, point.z);
    const pos = new THREE.Vector3(point.x, y, point.z);

    const unit = {
      def, pos,
      health: def.health, maxHealth: def.health,
      alive: true,
      state: 'setup',
      setupLeft: def.setup,
      cooldown: 0,
      salvoLeft: 0,
      salvoTimer: 0,
      group: new THREE.Group(),
      yaw: 0,
      kills: 0,
      damageDealt: 0,
    };
    unit.group.position.copy(pos);
    this.scene.add(unit.group);
    this.units.push(unit);

    // Face the primary target immediately so it reads as deliberate.
    const aim = this.target || new THREE.Vector3(this.primary.origin.x, y, this.primary.origin.z);
    unit.yaw = Math.atan2(aim.x - pos.x, aim.z - pos.z);
    unit.group.rotation.y = unit.yaw;

    // Model loads asynchronously; the unit is playable in the meantime.
    this._attachModel(unit).catch((e) => console.warn('model load failed', e));
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
    const wrapper = await this.models.load(def.modelFile || def.model, def.modelLength);
    if (!unit.alive) return;
    const inst = this.models.instance(wrapper);
    inst.rotation.y = def.modelYaw ?? 0;
    unit.group.add(inst);
    unit.model = inst;
  }

  removeUnit(unit) {
    unit.alive = false;
    this.scene.remove(unit.group);
    unit.group.traverse((o) => {
      if (o.isMesh && o.geometry && o.userData.own !== false) { /* shared geo, leave it */ }
    });
  }

  // ───────────────────────────────────────────────────────────── targeting ──

  setTarget(point, label) {
    this.target = point.clone();
    this.targetLabel = label || null;
    this.targetMarker.position.copy(point);
    this.targetMarker.visible = true;
    this.onEvent('target', { point, label });
  }

  clearTarget() {
    this.target = null;
    this.targetMarker.visible = false;
    this.onEvent('target', null);
  }

  get gunsOnTarget() {
    if (!this.target) return 0;
    let n = 0;
    for (const u of this.units) {
      if (!u.alive || u.state === 'setup') continue;
      if (u.pos.distanceTo(this.target) <= u.def.range) n++;
    }
    return n;
  }

  // ──────────────────────────────────────────────────────────────── firing ──

  _fireOne(unit, aimPoint) {
    const def = unit.def;
    const muzzleHeight = def.model === 'infantry' ? 1.3 : 2.2;
    const from = unit.pos.clone().setY(unit.pos.y + muzzleHeight);

    // Dispersion is applied to the aim point, so error grows along the line of
    // fire the way real gun dispersion does.
    const spread = def.dispersion;
    const aim = aimPoint.clone();
    const toward = new THREE.Vector3().subVectors(aim, from).setY(0).normalize();
    const across = new THREE.Vector3(-toward.z, 0, toward.x);
    aim.addScaledVector(toward, gauss() * spread * 1.6);
    aim.addScaledVector(across, gauss() * spread * 0.7);
    aim.y += gauss() * spread * 0.5;

    let vel;
    const p = def.projectile;
    if (p.kind === 'arc' || p.kind === 'rocket') {
      // Rockets burn for their first second, so they need less launch energy;
      // the solver is given a correspondingly lower ceiling.
      const maxSpeed = p.kind === 'rocket' ? p.speed * 0.62 : p.speed;
      const sol = solveBallistic(from, aim, maxSpeed, p.gravity, 9.0);
      if (!sol) return false; // genuinely out of range
      vel = sol.vel;
    } else if (p.kind === 'topattack') {
      vel = new THREE.Vector3(0, p.speed, 0);
    } else {
      vel = solveDirect(from, aim, p.speed, p.gravity);
    }

    this.projectiles.fire({
      pos: from, vel, gravity: p.gravity, kind: p.kind, speed: p.speed,
      warhead: def.warhead, owner: unit, target: aim, trail: p.trail,
    });

    const dir = vel.clone().normalize();
    this.fx.muzzleFlash(from, dir, def.warhead.fx);
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

      if (u.state === 'setup') {
        u.setupLeft -= dt;
        if (u.setupLeft <= 0) { u.state = 'ready'; u.cooldown = 0; }
        continue;
      }

      // Mid-salvo: keep loosing rockets on the interval.
      if (u.salvoLeft > 0) {
        u.salvoTimer -= dt;
        if (u.salvoTimer <= 0 && this.target) {
          this._fireOne(u, this.target);
          u.salvoLeft--;
          u.salvoTimer = u.def.salvo.interval;
          if (u.salvoLeft === 0) u.cooldown = u.def.reload;
        }
        continue;
      }

      u.cooldown -= dt;
      if (u.cooldown > 0) continue;
      if (!this.target) continue;
      if (u.pos.distanceTo(this.target) > u.def.range) continue;

      if (u.def.salvo) {
        u.salvoLeft = u.def.salvo.count;
        u.salvoTimer = 0;
      } else {
        if (this._fireOne(u, this.target)) u.cooldown = u.def.reload;
        else u.cooldown = 1.0;
      }
    }
    this.units = this.units.filter((u) => u.alive || u.group.parent);
  }

  // ─────────────────────────────────────────────────────────────── impacts ──

  _onImpact(hit) {
    const { point, proj } = hit;
    const w = proj.warhead;

    let destroyed = 0;
    for (const s of this.structures) {
      destroyed += s.explode(point, w.lethal, w.radius, w.power);
    }

    const killed = this.garrison.splash(point, w.radius * 1.25, w.power);
    if (killed) {
      this.defendersKilled += killed;
      this.money += killed * MONEY_PER_DEFENDER;
      if (proj.owner) proj.owner.kills += killed;
    }

    const groundY = this.terrain.heightAt(point.x, point.z);
    const nearGround = point.y - groundY < 4.0;
    this.fx.detonate(point, w.fx, { ground: nearGround, groundY });

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

  // ────────────────────────────────────────────────────────────────── loop ──

  update(dt) {
    if (this.state !== 'playing') return;
    this.elapsed += dt;
    this.money += this.income * dt;

    this._updateUnits(dt);
    this.projectiles.update(dt, this.fx, this.terrain, (h) => this._onImpact(h));

    // Money and unlocks track masonry actually brought down. Using the
    // standing-mass figure means you are paid for collapse, not for cosmetic
    // chipping — which is the behaviour the whole economy is meant to reward.
    const destroyedMass = this.structures.reduce((a, s) => a + s.demolishedMass, 0);
    const delta = destroyedMass - this._lastDestroyedMass;
    if (delta > 0) {
      this.money += (delta / 1000) * MONEY_PER_TONNE;
      this.score += delta / 1000;
      this._lastDestroyedMass = destroyedMass;
    }

    // Defenders.
    const lost = this.garrison.reconcileStructure();
    if (lost) {
      this.defendersKilled += lost;
      this.money += lost * MONEY_PER_DEFENDER;
      this.onEvent('crushed', lost);
    }
    const shots = [];
    this.garrison.update(dt, this.units, shots);
    this._pushTracers(shots, dt);
    this.garrison.sync();

    if (this.targetMarker.visible) {
      this.targetMarker.rotation.y += dt * 0.7;
      this.targetMarker.children[0].rotation.x = Math.PI / 2;
      this.targetMarker.children[1].rotation.x = Math.PI / 2;
    }

    this._checkEnd();
  }

  _pushTracers(shots, dt) {
    for (const s of shots) {
      this._tracerList.push({ from: s.from.clone(), to: s.to.clone(), age: 0 });
    }
    if (this.audio && shots.length) {
      const s = shots[Math.floor(Math.random() * shots.length)];
      const mg = s.defender?.type === 'mg';
      this.audio.play(mg ? 'mg' : 'enemy', s.from, {
        gain: mg ? 0.3 : 0.26, rolloff: 200,
        cooldown: mg ? 0.16 : 0.1,
      });
    }

    const live = [];
    let w = 0;
    for (const t of this._tracerList) {
      t.age += dt;
      if (t.age > 0.07) continue;
      live.push(t);
      if (w >= 220) continue;
      this.tracerPos[w * 6] = t.from.x;
      this.tracerPos[w * 6 + 1] = t.from.y;
      this.tracerPos[w * 6 + 2] = t.from.z;
      this.tracerPos[w * 6 + 3] = t.to.x;
      this.tracerPos[w * 6 + 4] = t.to.y;
      this.tracerPos[w * 6 + 5] = t.to.z;
      w++;
    }
    this._tracerList = live;
    this.tracerGeo.setDrawRange(0, w * 2);
    this.tracerGeo.attributes.position.needsUpdate = true;
  }

  _checkEnd() {
    const standing = this.primary.standingHeight() - this.originGround;
    const start = this.startHeight - this.originGround;
    const heightFrac = standing / start;

    // Win when the tower is genuinely down: either most of its mass has left
    // the standing structure, or it has lost two thirds of its height.
    const win = this.level?.win ?? { integrity: 0.30, heightFrac: 0.34 };
    if (this.primary.monumentIntegrity < win.integrity || heightFrac < win.heightFrac) {
      this.state = 'won';
      this.onEvent('win', this.summary());
      return;
    }

    // Loss: nothing deployed, nothing in flight, and not enough money for the
    // cheapest thing that could still make progress.
    const liveUnits = this.units.filter((u) => u.alive).length;
    const cheapest = Math.min(...UNITS.filter((u) => this.isUnlocked(u)).map((u) => u.cost));
    if (liveUnits === 0 && this.projectiles.inFlight === 0 && this.money < cheapest) {
      this.state = 'lost';
      this.onEvent('lose', this.summary());
    }
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
