import * as THREE from 'three';
import { UNITS, UNITS_BY_ID, ModelLibrary, makeInfantryMesh } from './units.js';
import { solveBallistic, solveDirect, ProjectileManager } from './projectiles.js';
import { TracerFX } from '../fx/tracers.js';

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
    this._setupTargetMarker();
    this._setupGhost();
    this._setupConfirmRing();
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

  isUnlocked(u) { return this.unlockAll || this.progress >= (u.unlockFrac ?? 0); }
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
    if (!this.freeBuild && this.money < def.cost) { this.onEvent('poor', def); return null; }
    const check = this.validPlacement(point);
    if (!check.ok) { this.onEvent('badplace', check); return null; }

    if (!this.freeBuild) {
      this.money -= def.cost;
      this.spent += def.cost;
    }

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
    this.pulse(point, 0xff6a4d, 9, true);
    this.onEvent('target', { point, label });
  }

  clearTarget() {
    this.target = null;
    this.targetLabel = null;
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
        out.push(new THREE.Vector3(st.px[i], st.py[i], st.pz[i]));
      }
    }
    this._aimCandidates = out;
    this._aimAge = 0;
  }

  /**
   * What this gun should shoot at right now.
   *
   * The designated target wins whenever it is in range. Otherwise the gun picks
   * the nearest standing masonry it can reach, which is what stops a freshly
   * deployed battery sitting silent because the player has not tapped the
   * tower yet — the original reason no friendly unit ever fired.
   */
  aimFor(unit) {
    const r = unit.def.range;
    if (this.target && unit.pos.distanceTo(this.target) <= r) return this.target;
    if (!this.autoEngage) return null;
    let best = null, bestD = r * r;
    for (const c of this._aimCandidates) {
      const dx = c.x - unit.pos.x, dy = c.y - unit.pos.y, dz = c.z - unit.pos.z;
      const d = dx * dx + dy * dy + dz * dz;
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
    // fire the way real gun dispersion does.
    const spread = def.dispersion * this.dispersionScale;
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

      if (this.invulnerable) u.health = u.maxHealth;

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

  _onImpact(hit) {
    const { point, proj } = hit;
    const w = proj.warhead;

    // Defensive mortar fire lands on the player's guns. It chips whatever it
    // touches on the way — a round that clips the parapet really does take the
    // parapet with it — but its business is the battery, not the building.
    if (proj.hostile) {
      for (const u of this.units) {
        if (!u.alive) continue;
        const d = u.pos.distanceTo(point);
        if (d > w.radius) continue;
        u.health -= w.power * (1 - d / w.radius) * 0.06;
      }
      for (const s of this.structures) s.explode(point, w.lethal * 0.5, w.radius * 0.5, w.power * 0.3);
      const gy0 = this.terrain.heightAt(point.x, point.z);
      this.fx.detonate(point, w.fx, { ground: point.y - gy0 < 4.0, groundY: gy0 });
      if (this.audio) {
        this.audio.play('explosion', point, { rate: 1.25, gain: 0.42, rolloff: 260 });
      }
      const cd0 = this.camera.position.distanceTo(point);
      this.engine.addShake(THREE.MathUtils.clamp(w.fx * 20 / Math.max(cd0, 30), 0.01, 0.4));
      return;
    }

    const power = w.power * this.powerScale;
    let destroyed = 0;
    for (const s of this.structures) {
      destroyed += s.explode(point, w.lethal, w.radius, power);
    }

    const killed = this.garrison.splash(point, w.radius * 1.25, power);
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

    this._aimAge += dt;
    if (this._aimAge > 0.6) this._refreshAimCandidates();

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
    this.garrison.update(dt, this.units, shots, this.structures);
    this._pushTracers(shots);
    this.garrison.updateMortars(dt, this.projectiles, this.units);
    this.garrison.sync();
    this.tracerFX.update(dt);
    this._updateRings(dt);

    if (this.targetMarker.visible) {
      this.targetMarker.rotation.y += dt * 0.7;
      this.targetMarker.children[0].rotation.x = Math.PI / 2;
      this.targetMarker.children[1].rotation.x = Math.PI / 2;
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
