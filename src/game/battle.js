import { newCrew } from './crews.js';
import * as THREE from 'three';

// Points on a hand-laid shell's drawn flight: 0.04 s each, twelve seconds.
const LAY_PTS = 300;
// Seconds from a mortar round let go at the muzzle to the shell leaving the tube.
const MORTAR_DROP = 0.32;
/**
 * A held gun's barrel. Held, an automatic weapon fires round after round
 * at its own rate (no bursts) for as long as the trigger is down; every
 * round heats the barrel, it does not cool while firing, and run to the
 * top it locks. `mgRound` is about fifty-five rounds of the M240, under
 * five seconds held; the seat's cannon heats by `seatSecs` seconds of
 * fire whatever its rate. Then four seconds of nothing, and the gun opens
 * again at the reset line, so held on it gets a couple more seconds
 * before it locks again; let go, it cools a tenth a second.
 */
const HEAT = { mgRound: 0.018, seatSecs: 5, cool: 0.1, lock: 4.0, reset: 0.45 };
import { barrelTip, poseBarrel } from './barrel.js';
import { bombWhistle, carAlarm, crack } from '../core/synth.js';
import { isReleased } from './campaign.js';
import { UNITS, UNITS_BY_ID, ModelLibrary, makeInfantryMesh, makeMortarTeam, flattenModel, MORTAR } from './units.js';
import { releaseTree } from '../core/release.js';

/** How long a lift package stays open after the first unit is placed. */
const LIFT_WINDOW = 8;
import {
  solveArc, solveBallistic, solveBoosted, solveDirect, ProjectileManager, ROCKET_BOOST,
} from './projectiles.js';
import { TracerFX } from '../fx/tracers.js';
import { AirWing } from './aircraft.js';
import { EnemyAirborne, ASSAULT } from './reinforce.js';
import { HQ } from './hq.js';
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
/** The dearest strike a SAM compound's free strike covers: anything up to the F-15. */
const FREE_STRIKE_CAP = 100000;
// The job, in tonnes, that the rubble rate is quoted for (see payScale).
const JOB_REF_TONNES = 600000;

/** The signed shortest turn from `b` to `a`, radians. */
function angleDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

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
    //
    // It is scratch and it is never null. The strike sight briefly borrowed
    // this field to remember where it was pointing, and put a null back in it
    // on the way out — so the first gun afterwards that laid on a defender
    // called `.copy` on nothing, threw, and went on throwing every frame for
    // the rest of the level. A player's fault panel named it: `null is not an
    // object (evaluating 'this._aimPoint.copy')`, in `_updateUnits`. The
    // sight keeps its own field below.
    this._aimPoint = new THREE.Vector3();
    // Where the air-strike sight is pointing, or null when it is put away.
    this._strikeAt = null;
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
    // The player on a gun (see `startLay`): none until they take one.
    this.lay = null;
    this.handShots = 0;
    this.layLine = null;
    this.smokeCooldown = 0;
    this.smokes = null;        // a SmokeScreens, if the level has one
    this.fires = null;         // Fires, likewise
    this.stores = null;        // the garrison's dumps, set by main
    this.sams = null;          // the S-300 battery, set by main (see sam.js)
    this.hq = null;            // the enemy command post, set by main (see hq.js)
    // In-battle rewards for the high-value targets. A SAM compound wrecked
    // earns a free air strike; the command post cuts the garrison's comms.
    this.strikeCredits = 0;
    this.commsDownUntil = -1;
    // The rest of the high-value targets (see highvalue.js), set by main; and
    // the counter-battery reward, a faster reload for a while.
    this.hv = null;
    this.counterBatteryUntil = -1;

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
    // What the enemy has in the air — transports on their run, men under
    // canopies — for the player's machine guns. Each is { pos, alive, hit(dmg) }.
    this.enemyAir = [];
    // The Range (src/game/range.js) when this is the range: its targets
    // and the drones it flies. `extraTargets` is anything else a hand-laid
    // burst may hit: {pos, r, alive, hit(dmg, unit)}.
    this.range = null;
    this.extraTargets = [];
    // The gunner's seat on an aircraft on station (see `startSeat`).
    this.seat = null;
    this.air = new AirWing({
      scene: this.scene, quality: this.quality, terrain: this.terrain,
      projectiles: this.projectiles, fx: this.fx, audio: this.audio, camera: this.camera,
    });
    // What the flak did, said out loud. The air wing raises these where the
    // flying consequence happens, because that is the only place that knows
    // a pilot has turned for home or a canopy has come apart.
    this.air.onAirEvent = (kind, data) => {
      if (kind === 'wreck') this._wreckDown(data.point);
      this.onEvent(kind, data);
    };
    // What the town stands to along a line, for a helicopter picking a
    // height: the airlift is handed it per delivery, the Apache needs it on
    // any call.
    this.air.ceilingAlong = (ax, az, bx, bz) => this.ceilingAlong(ax, az, bx, bz);
    // The Apache's chain gun: the air wing knows where the helicopter is
    // and when it fires; the garrison is here. `pick` is the live defender
    // nearest the aim point, `fire` is one burst on it.
    // The A-10's stream is drawn as tracer the same way the garrison's is.
    this.air.tracers = this.tracerFX;
    // The enemy's airborne: half the garrison again, flown in over the
    // building when the bar is about halfway to the win.
    this.airborne = new EnemyAirborne(this);
    // And at three quarters, the counter-attack: twice the garrison again,
    // all over the map, with tubes and a SAM battery of its own.
    this.assault = new EnemyAirborne(this, ASSAULT);
    this.air.gunner = {
      pick: (c, reach) => {
        let best = null, bd = reach * reach;
        for (const d of this.garrison.defenders) {
          if (!d.alive) continue;
          const dd = d.pos.distanceToSquared(c);
          if (dd < bd) { bd = dd; best = d; }
        }
        return best ? best.pos : null;
      },
      fire: (from, to, g) => {
        // A burst is three tracers on the point; one round of a held gun, one.
        for (let k = 0; k < (g.one ? 1 : 3); k++) this.tracerFX.fire(from, to, { look: 'chaingun' }, k === 0);
        const killed = this.garrison.splash(to, g.radius, g.power);
        if (killed) {
          this.defendersKilled += killed;
          this.money += killed * MONEY_PER_DEFENDER;
          this.onEvent('bounty', { point: to, amount: killed * MONEY_PER_DEFENDER, kind: 'kill' });
        }
        if (this.audio) this.audio.play('mg', from, { gain: 0.34, rolloff: 500, rate: 0.62, cooldown: g.one ? 0.09 : 0.2 });
        return killed;
      },
    };
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
      // Not round the gun the player is on: from the gunner's eye the
      // sandbag ring was a wall across the bottom of the picture.
      if (!u.alive || !u.dugIn || u.handHeld || w >= 64) continue;
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
  // ──────────────────────────────────────────────────────── hand laying ──

  /**
   * The player on the gun.
   *
   * Everything else the player does is an order: place, designate, call.
   * This is the one thing they do with their own hands. LAY on a gun's card
   * takes it off its crew; the camera stands behind the breech; a drag
   * turns and elevates it, with the shell's flight drawn out to where it
   * lands and a ring on the spot; FIRE sends one round, exactly along that
   * line, no dispersion — the skill is the laying. The gun is the player's
   * until DONE, and reloads at its own rate meanwhile. A hand-laid round
   * that does damage pays a bonus and its own stamp (see `_onImpact`).
   *
   * Anything with a sight to look through: the guns, the mortar, the rocket
   * teams, the machine gun (FIRE held is a stream, see `_handMG`) and the
   * Javelin (the CLU's crosshair designates, the missile flies its own
   * path). Not the ripple launchers: six rockets on a timer is a battery
   * order, not a hand on a gun.
   */
  canLay(u) {
    const p = u?.def?.projectile;
    return !!(u && u.alive && !u.def.salvo && p);
  }

  startLay(unit) {
    if (!this.canLay(unit)) return false;
    if (this.lay) this.endLay();
    const p = unit.def.projectile;
    const from = this._layMuzzle(unit);
    // Laid where the crew had it, so the first picture is a gun on its target.
    let yaw = unit.yaw, elev = p.mortar ? 1.05 : p.kind === 'direct' || p.kind === 'topattack' ? 0 : 0.3;
    // The machine gun's own man first, then whatever the battery is laid on.
    const aim = (unit.def.mg && this._mgTarget(unit)?.pos) || this.aimFor(unit) || this.target;
    if (aim) {
      yaw = Math.atan2(aim.x - from.x, aim.z - from.z);
      // The crew's own solution: a gun's low shot, a mortar's high one, a
      // straight shooter's line of sight.
      const sol = p.mortar ? solveBallistic(from, aim, p.speed, p.gravity, 12.0, null)?.vel
        : p.gravity > 0 ? solveArc(from, aim, p.speed, p.gravity, false) : null;
      if (sol) elev = Math.atan2(sol.y, Math.hypot(sol.x, sol.z));
      else if (p.gravity <= 0) elev = Math.atan2(aim.y - from.y, Math.hypot(aim.x - from.x, aim.z - from.z));
    }
    this.lay = { unit, yaw, elev, from, impact: new THREE.Vector3(), masonry: false, hit: false, range: 0, pts: [], tof: 0,
      // What the crew had it laid on: the spotter's reference when nothing is designated.
      ref: aim ? aim.clone() : null,
      // The whole reload, for the clock on the trigger; the kick of the last shot, for the eye;
      // the barrel's heat and its lock, for the machine gun.
      reloadTotal: unit.def.reload * this.reloadFactor, kick: 0, heat: 0, over: 0, rounds: 0, streaming: false };
    this.trigger = false;
    unit.handHeld = true;
    // The gun is handed over loaded: the crew's own reload and the burst
    // they were in the middle of are theirs, not the player's. The trigger
    // is the player's from the first moment, after a half-second handover
    // that lets the ring be seen filling.
    unit.cooldown = Math.min(unit.cooldown || 0, 0.5);
    unit.burstLeft = 0;
    unit.burstTimer = 0;
    unit.hold = null;
    if (p.mortar) {
      // A mortar is laid by range, not by elevation: the crew pick the charge
      // that makes the arc, and the tube's angle follows (see _mortarSolve).
      // At full charge even eighty-five degrees carries four hundred metres,
      // which is no use against a wall a hundred and fifty metres off.
      this.lay.rangeWant = aim ? Math.hypot(aim.x - from.x, aim.z - from.z) : 220;
      this._mortarSolve(this.lay);
      // Its crew is seen working while the player has it (see _mortarLive).
      this._mortarLive(unit, true);
    }
    this._layBuild();
    this.layTurn(0, 0);
    // The crew's solution was to a man in a window; the drawn line should
    // end on the wall he is standing in, not go through the window and off
    // the map, and not on the skirting under it, where a flat round only
    // skips. Elevate until the line meets stone that counts.
    const counts = () => this.lay.masonry && this.lay.impact.y > this.originGround + 4.5;
    // Into the house next door: the crew would have lofted over it, so start
    // from their solution rather than a wall.
    if (aim && this.lay.blocked && p.gravity > 0) {
      const lofted = solveBallistic(from, aim, p.speed, p.gravity, 9.0, (vv) => this._trajectoryClear(from, vv, p.gravity));
      if (lofted) this.layTurn(0, Math.atan2(lofted.vel.y, Math.hypot(lofted.vel.x, lofted.vel.z)) - this.lay.elev);
    }
    // A mortar's high solution already lands on the point; elevating it
    // further only shortens the shot.
    // A straight shooter is on what it is pointed at: the machine gun on a
    // man, the Javelin on a mark.
    if (!p.mortar && !unit.def.mg && p.kind !== 'topattack') for (let k = 0; k < 40 && !counts(); k++) this.layTurn(0, 0.015);
    this.layLine.visible = true;
    this.layRing.visible = true;
    return true;
  }

  endLay() {
    this.trigger = false;
    if (!this.lay) return;
    this.lay.unit.handHeld = false;
    this.lay.unit.wantYaw = this.lay.unit.yaw;
    this._mortarLive(this.lay.unit, false);
    this.lay = null;
    if (this.layLine) { this.layLine.visible = false; this.layRing.visible = false; }
  }

  /**
   * The mortar's crew, live, while the player has the tube: the baked team
   * is hidden and an articulated one stands in, its tube pivoting to the
   * lay's elevation, the loader reaching a round out of the crate and up to
   * the muzzle over the reload, the gunner leaning into the traverse. The
   * baked team comes back when the crew get it back.
   */
  _mortarLive(unit, on) {
    // A round already let go is fired whatever happens to the crew next.
    if (!on && unit.live?.pending) this._mortarLaunch(unit);
    if (on) {
      if (unit.live) return;
      const g = makeMortarTeam({ live: true });
      const hidden = [...unit.group.children];
      for (const c of hidden) c.visible = false;
      unit.group.add(g);
      unit.live = { g, ...g.userData.parts, crate: g.userData.crateOffset, tubeDir: g.userData.tubeDir, heldAt: g.userData.heldAt, hands: g.userData.hands, hidden, lean: 0, pending: null, drop: null, t: 0 };
      return;
    }
    if (!unit.live) return;
    unit.group.remove(unit.live.g);
    releaseTree(unit.live.g, this.scene);
    for (const c of unit.live.hidden) c.visible = true;
    unit.live = null;
  }

  /**
   * A gun's barrel: laid where the player has it (the lay's elevation, at
   * once), else slewed to the last shot's at fifty degrees a second, and
   * run back on its recoil, home again over seven tenths of a second.
   */
  _updateBarrel(u, dt) {
    const B = u.barrelB;
    if (this.lay && this.lay.unit === u) u.barrelElev = u.barrelWant = this.lay.elev;
    else {
      const d = (u.barrelWant ?? u.barrelElev) - u.barrelElev, step = 0.9 * dt;
      u.barrelElev += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }
    u.recoilT = Math.max(0, (u.recoilT || 0) - dt * 1.4);
    poseBarrel(u.barrel, B, u.barrelElev, B.recoil * u.recoilT * u.recoilT);
  }

  /**
   * A gun's muzzle after the shot: a thread of smoke out of the bore,
   * thick at first and thinning over four and a half seconds, drifting
   * out along the barrel's line. Not drawn for a gun too far off to see it.
   */
  _muzzleSmoke(u, dt) {
    u.smokeT -= dt;
    if (!this.fx?.wisp || !u.group.visible || this.camera.position.distanceToSquared(u.pos) > 360 * 360) return;
    const k = Math.max(0, u.smokeT / 4.5);
    u.smokeAcc = (u.smokeAcc || 0) + dt * (2 + 12 * k * k) * (this.fx.quality?.name === 'low' ? 0.5 : 1);
    if (u.smokeAcc < 1) return;
    u.smokeAcc -= 1;
    const tip = this._muzzle(u);
    const size = u.def.projectile?.mortar ? 0.35 : 0.55;
    this.fx.wisp(tip, size + 0.6 * size * k, 0.16 + 0.24 * k, { x: Math.sin(u.yaw) * 0.6 * k, z: Math.cos(u.yaw) * 0.6 * k });
  }

  /** A crew turning its gun to `wantYaw` at its own rate (`def.traverse`, radians a second). */
  _traverse(u, dt) {
    const d = angleDiff(u.wantYaw, u.yaw);
    if (Math.abs(d) < 1e-4) return;
    const step = (u.def.traverse ?? (u.def.model === 'infantry' ? 4 : 2)) * dt;
    u.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
    u.group.rotation.y = u.yaw;
  }

  /**
   * While the gun traverses, its barrel comes up toward the shot: the low
   * arc to the aim over flat ground, near enough for the eye; the shot sets
   * it exactly when it goes.
   */
  _leadBarrel(u, aim) {
    if (!u.barrelB) return;
    const p = u.def.projectile, d = Math.hypot(aim.x - u.pos.x, aim.z - u.pos.z);
    const v2 = p.speed * p.speed, g = p.gravity || 9.81;
    const low = 0.5 * Math.asin(THREE.MathUtils.clamp(g * d / v2, 0, 1));
    const lift = Math.atan2(aim.y - (u.pos.y + 2), Math.max(1, d));
    u.barrelWant = THREE.MathUtils.clamp(low + lift, u.barrelB.min, u.barrelB.max);
  }

  /** The round has struck the pin: the shell leaves the tube on the lay it was let go on. */
  _mortarLaunch(u) {
    const A = u.live, P = A?.pending;
    if (!P) return;
    A.pending = null;
    const ok = this._fireOne(u, P.impact, { vel: P.vel, hand: true, from: P.from });
    if (ok) this._armSpot(u, P.tof, P.ref);
    if (!ok) return;
    if (this.lay && this.lay.unit === u) this.lay.kick = 1;
    this.handShots++;
    this.onEvent('handshot', { unit: u, point: P.impact.clone() });
  }

  _animateMortar(u, dt) {
    const A = u.live, L = this.lay && this.lay.unit === u ? this.lay : null;
    A.t += dt;
    // The tube follows the lay.
    const elev = L ? L.elev : MORTAR.e0;
    A.tube.rotation.x += ((MORTAR.e0 - elev) - A.tube.rotation.x) * Math.min(1, dt * 9);
    // The loader: a round out of the crate and up to the muzzle over the
    // reload, held there until it is fired; then he reaches for the next.
    const total = Math.max(0.01, L?.reloadTotal || u.def.reload * this.reloadFactor);
    const k = 1 - Math.max(0, u.cooldown) / total;   // 0 just fired, 1 loaded
    // The shot: let go, the round slides down the tube, slowly and then
    // fast, and the shell leaves when it strikes the pin at the bottom
    // (`MORTAR_DROP` seconds). The loader lets go and ducks at once.
    if (A.drop != null) {
      A.drop += dt;
      const d = Math.min(1, A.drop / MORTAR_DROP);
      A.round.visible = d < 1;
      A.round.position.copy(A.tubeDir).multiplyScalar(-1.5 * d * d);
      if (d >= 1) { A.drop = null; this._mortarLaunch(u); }
    }
    const ease = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const FACE = -Math.PI / 2;   // the loader faces the tube
    // One motion through the reload, never upright at the tube with empty
    // hands: down and turned from the blast, round to the crate still low,
    // the round taken out of it, then up and back round to the muzzle with
    // it, and held there over the mouth until it is let go.
    const DUCK = { y: -0.48, rx: 0.55, ry: FACE + 0.7 };
    const CRATE = { y: -0.5, rx: 0.45, ry: FACE + Math.PI };
    if (k < 0.22) {
      if (A.drop == null) A.round.visible = false;
      const e = ease(k / 0.08);
      A.loader.position.y = DUCK.y * e;
      A.loader.rotation.x = DUCK.rx * e;
      A.loader.rotation.y = FACE + (DUCK.ry - FACE) * e;
    } else if (k < 0.5) {
      // Still crouched, he turns on round to the crate behind him and
      // reaches into it; the round is in his hands as he takes hold.
      const t = ease((k - 0.22) / 0.28);
      A.loader.position.y = DUCK.y + (CRATE.y - DUCK.y) * t;
      A.loader.rotation.x = DUCK.rx + (CRATE.rx - DUCK.rx) * t;
      A.loader.rotation.y = DUCK.ry + (CRATE.ry - DUCK.ry) * t;
      A.round.visible = t > 0.85;
      if (A.round.visible) this._roundInHands(A);
    } else if (k < 0.9) {
      // Back round to the tube, straightening, the round coming up with his hands.
      const t = ease((k - 0.5) / 0.4);
      A.loader.rotation.y = CRATE.ry + (FACE - CRATE.ry) * t;
      A.loader.position.y = CRATE.y * (1 - t);
      A.loader.rotation.x = CRATE.rx * (1 - t);
      A.round.visible = true;
      this._roundInHands(A);
    } else {
      // Over the muzzle, the fins in the tube's mouth, held until it is let go.
      const t = ease((k - 0.9) / 0.1);
      A.loader.rotation.y = FACE; A.loader.position.y = 0; A.loader.rotation.x = 0;
      A.round.visible = true;
      if (t < 1) { this._roundInHands(A); A.round.position.multiplyScalar(1 - t); } else A.round.position.set(0, 0, 0);
    }
    // The gunner leans into a traverse and settles back on the sight.
    A.lean *= Math.max(0, 1 - dt * 4);
    A.gunner.rotation.z = A.lean * 0.5;
    A.gunner.position.y = Math.sin(A.t * 2.2) * 0.006;
  }

  /**
   * The round where the loader's hands are: his hands in his own frame,
   * through his pose and the team's frame, into the tube's, less where the
   * round's tail sits when it is over the muzzle (`round` lives under the
   * tube so that it elevates with it).
   */
  _roundInHands(A) {
    if (!A.hands || !A.heldAt) return;
    const v = this._handsV || (this._handsV = new THREE.Vector3());
    v.copy(A.hands).applyEuler(A.loader.rotation).add(A.loader.position);
    A.g.localToWorld(v);
    A.tube.worldToLocal(v);
    A.round.position.copy(v).sub(A.heldAt);
  }

  /**
   * How far a hand-laid round may land from the ring: nothing for a gun
   * laid over its own sights, and for a mortar a share of the range, the
   * way a dropped round's dispersion grows with the charge behind it.
   */
  laySpread(L = this.lay) {
    if (!L || !L.unit.def.projectile.mortar) return 0;
    return Math.max(4, L.range * 0.035);
  }

  // ── The gunner's seat ────────────────────────────────────────────────
  //
  // An aircraft on station (the AC-130 in its orbit, the Apache at its
  // hover) flies itself; the player takes its guns. The seat holds the
  // sensor's aim point on the ground, which the finger drags, and the
  // weapon in hand: the gunship's 105 and its 30 mm, the Apache's rocket
  // pairs and its chin gun. While the seat is held the sortie's own fire
  // stops (`loiter.hand`), and the Apache's turret follows the aim.

  /** The sorties a gunner could sit in now, most time left first. */
  seatable() {
    const out = [];
    for (const s of this.air.sorties) {
      const L = s.loiter;
      if (!L || s.done || L.phase === 'egress' || L.phase === 'down') continue;
      out.push(s);
    }
    out.sort((a, b) => (a.loiter.time || 0) - (b.loiter.time || 0));
    return out;
  }

  /** What a seat's aircraft can fire by hand. */
  seatWeapons(s) {
    const a = s.def.aircraft;
    return a.orbit
      // The cannon's `reload` is the interval between rounds held on: the
      // gunship's GAU-23 at two hundred a minute, the Apache's M230 at six
      // hundred and twenty-five.
      ? [{ kind: 'shell', name: '105 MM', reload: a.every, hold: false }, { kind: 'gun', name: '30 MM', reload: 0.3, hold: true, power: 0.6 }]
      : [{ kind: 'rocket', name: 'ROCKETS', reload: 1.4, hold: false }, { kind: 'gun', name: '30 MM', reload: 0.096, hold: true, power: 0.3 }];
  }

  startSeat(s) {
    if (!s || !s.loiter || s.done) return false;
    if (this.lay) this.endLay();
    if (this.seat) this.endSeat();
    const aim = s.target.clone();
    aim.y = this.terrain.heightAt(aim.x, aim.z) + 0.3;
    // `aim` is the point on the ground the finger drags; `look` is where the
    // sensor's line to it first meets something (a roof, the tower), which
    // is where the cross sits and where the round goes.
    this.seat = { sortie: s, aim, look: aim.clone(), weapon: 0, cooldown: 0.4, reloadTotal: 0.4, kick: 0, fired: 0, heat: 0, over: 0, gunTimer: 0, streaming: false };
    this.trigger = false;
    this._seatLook();
    s.loiter.hand = true;
    s.loiter.gunAim = aim;
    this.onEvent('seat', { def: s.def, on: true });
    return true;
  }

  endSeat() {
    this.trigger = false;
    const S = this.seat;
    if (!S) return;
    const L = S.sortie.loiter;
    if (L) { L.hand = false; L.gunAim = null; L.gunAimFor = undefined; }
    this.seat = null;
    this.onEvent('seat', { def: S.sortie.def, on: false });
  }

  /** Move the aim over the ground by a world offset, kept within the aircraft's reach. */
  seatMove(dx, dz) {
    const S = this.seat;
    if (!S) return;
    const s = S.sortie, a = s.def.aircraft, L = s.loiter;
    S.aim.x += dx; S.aim.z += dz;
    // Inside the orbit and a little beyond it, or within the Apache's reach of its station.
    const cx = L.orbit ? L.centre.x : (L.station?.x ?? s.target.x), cz = L.orbit ? L.centre.z : (L.station?.z ?? s.target.z);
    const reach = L.orbit ? a.radius * 1.5 : 420;
    const ox = S.aim.x - cx, oz = S.aim.z - cz, d = Math.hypot(ox, oz);
    if (d > reach) { S.aim.x = cx + ox / d * reach; S.aim.z = cz + oz / d * reach; }
    S.aim.y = this.terrain.heightAt(S.aim.x, S.aim.z) + 0.3;
  }

  seatSwitch() {
    const S = this.seat;
    if (!S) return;
    S.weapon = (S.weapon + 1) % this.seatWeapons(S.sortie).length;
    S.cooldown = Math.min(S.cooldown, 0.5);
  }

  /** One round (or one burst) of the weapon in hand at the aim. False while reloading. */
  seatFire() {
    const S = this.seat;
    if (!S || this.state !== 'playing') return false;
    if (S.cooldown > 0) return false;
    const s = S.sortie, a = s.def.aircraft;
    const w = this.seatWeapons(s)[S.weapon];
    // The cannon is held, not pulled: `_updateSeat` fires it while `trigger` is down.
    if (w.hold) return S.over <= 0;
    this._seatLook();
    const aim = S.look.clone();
    if (w.kind === 'shell') {
      this.air._gunshipShell(s, aim, true);
      this.engine.addShake(0.08);
    } else if (w.kind === 'rocket') {
      if (s.loiter.rockets <= 0) { S.cooldown = 0.3; return false; }
      for (let k = 0; k < Math.min(a.pair || 2, s.loiter.rockets); k++) { this._seatRocketLater(s, aim, k * 0.12); s.loiter.rockets--; }
      if (this.audio) this.audio.play('rocket', s.model.position, { rate: 1.35, gain: 0.5, rolloff: 900 });
    }
    S.cooldown = w.reload; S.reloadTotal = w.reload; S.kick = 1; S.fired++;
    this.shotsFired++; this.handShots++;
    return true;
  }

  /**
   * One round of the seat's cannon on the cross, a little off it (a 30 mm
   * from a turning aircraft walks a metre or so round its point), with a
   * share of a burst's weight, `w.power`.
   */
  _seatRound(s, w) {
    const S = this.seat, a = s.def.aircraft;
    this._seatLook();
    const aim = S.look.clone();
    aim.x += gauss() * 0.9; aim.z += gauss() * 0.9;
    const g = { ...a.gun, power: a.gun.power * w.power, one: true };
    const from = this.air.seatMuzzle(s, 'gun');
    const killed = this.air.gunner.fire(from, aim, g) || 0;
    s.kills += killed;
    const r2 = (a.gun.radius + 1.5) ** 2;
    for (const x of this.extraTargets) if (x.alive && x.pos.distanceToSquared(aim) < r2 + x.r * x.r) x.hit(g.power / 200, null);
    if (this.range) this.range.blast(aim, { power: g.power * 0.25, radius: a.gun.radius });
    S.kick = Math.min(1, S.kick + 0.35); S.fired++;
    if (this.engine) this.engine.addShake(0.015);
  }

  _seatRocketLater(s, aim, delay) {
    if (delay <= 0) { this.air._loiterRocket(s, 0, aim, true); return; }
    setTimeout(() => { if (this.seat && this.seat.sortie === s && !s.done) this.air._loiterRocket(s, 0, aim, true); }, delay * 1000);
  }

  /** Each frame: the clock, the Apache's turret on the aim, and the seat given up when the aircraft goes. */
  _updateSeat(dt) {
    const S = this.seat;
    if (!S) return;
    const s = S.sortie, L = s.loiter;
    if (s.done || !L || L.phase === 'egress' || L.phase === 'down' || this.state !== 'playing') { this.endSeat(); return; }
    S.cooldown = Math.max(0, S.cooldown - dt);
    S.kick = Math.max(0, S.kick - dt * 2.5);
    // The cannon held: a round every `reload`, each heating the barrel by its
    // share of `HEAT.seatSecs`, until the trigger is let go or the gun locks.
    const w = this.seatWeapons(s)[S.weapon];
    const on = !!w.hold && this.trigger && S.over <= 0;
    if (on) {
      if (!S.streaming) { S.streaming = true; S.gunTimer = 0; this.shotsFired++; this.handShots++; }
      S.gunTimer -= dt;
      while (S.gunTimer <= 0) {
        S.gunTimer += w.reload;
        this._seatRound(s, w);
        S.heat = Math.min(1, (S.heat || 0) + w.reload / HEAT.seatSecs);
        if (S.heat >= 1) { S.over = HEAT.lock; S.streaming = false; this.onEvent('overheat', { def: s.def }); break; }
      }
    } else S.streaming = false;
    this._cool(S, dt, on);
    this._seatLook();
    if (!L.orbit) L.gunAim = S.look;
  }

  /** A barrel's heat, cooling when it is not firing; a locked gun opens again once it is down to the reset line. */
  _cool(H, dt, firing = false) {
    if (!H) return;
    if (!firing) H.heat = Math.max(0, (H.heat || 0) - dt * HEAT.cool);
    if (H.over > 0) { H.over = Math.max(0, H.over - dt); if (H.over <= 0 && H.heat > HEAT.reset) H.heat = HEAT.reset; }
  }

  /** Where the sensor's line to the aim first meets the world: the cross, and the round's mark. */
  _seatLook() {
    const S = this.seat;
    if (!S) return;
    const eye = this.air.seatEye(S.sortie, this._seatEyeV || (this._seatEyeV = new THREE.Vector3()));
    const dir = this._seatDirV || (this._seatDirV = new THREE.Vector3());
    dir.subVectors(S.aim, eye);
    const dist = dir.length();
    if (dist < 1) { S.look.copy(S.aim); return; }
    dir.multiplyScalar(1 / dist);
    const res = this.physics.castRay({ x: eye.x, y: eye.y, z: eye.z }, { x: dir.x, y: dir.y, z: dir.z }, dist - 0.5);
    if (res) S.look.copy(eye).addScaledVector(dir, Math.max(0, res.toi - 0.3));
    else S.look.copy(S.aim);
  }

  /** Turn and elevate, in radians; the arc is redrawn. */
  layTurn(dyaw, delev) {
    const L = this.lay;
    if (!L) return;
    const p = L.unit.def.projectile;
    // A direct-fire gun has a mount, not a howitzer's elevation; a mortar
    // has nothing under forty-five degrees in it.
    const straight = p.kind === 'direct' || p.kind === 'topattack';
    // A tank gun's mount stops under twenty degrees; a howitzer goes to seventy.
    // A gun with its own barrel (barrel.js) stops where that barrel does.
    const BB = L.unit.barrelB;
    const top = BB ? BB.max : L.unit.def.sight?.kind === 'tank' ? 0.33 : straight ? 0.6 : 1.25;
    // Down the hill: a rocket or a burst goes where the man can look.
    const lo = BB ? BB.min : straight ? -0.7 : -0.08;
    L.yaw += dyaw;
    if (p.mortar) {
      // Up is further: the drag walks the range and the solve sets the tube.
      const maxR = 0.92 * p.speed * p.speed / p.gravity;
      L.rangeWant = THREE.MathUtils.clamp(L.rangeWant + delev * 420, 45, maxR);
      this._mortarSolve(L);
    } else {
      L.elev = THREE.MathUtils.clamp(L.elev + delev, lo, top);
    }
    if (L.unit.live) L.unit.live.lean = THREE.MathUtils.clamp(L.unit.live.lean + dyaw * 6, -0.35, 0.35);
    L.unit.yaw = L.yaw;
    L.unit.group.rotation.y = L.yaw;
    this._layArc();
  }

  _layMuzzle(unit) {
    return this._muzzle(unit, this.lay && this.lay.unit === unit ? this.lay.elev : null);
  }

  /**
   * Where a unit's round leaves it. A gun's barrel ends well forward of the
   * plot its crew stands on and above it (`def.muzzle`: forward along the
   * facing, and up); a man's rocket leaves his shoulder; the mortar's round
   * leaves the top of a tube laid at an elevation, which the lay sets and
   * the crew keeps at sixty-two degrees. Every round used to start two
   * metres over the middle of the plot, which for a howitzer was inside the
   * breech and for a mortar the ground beside it.
   */
  _muzzle(unit, elev = null) {
    const def = unit.def, p = unit.pos, yaw = unit.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // A gun with its barrel cut out of its model: the end of that barrel, at
    // this elevation (or where it is laid now), through the model's own turn
    // in the unit and the unit's on the ground.
    if (unit.barrelB && unit.model) {
      const t = barrelTip(unit.barrelB, elev ?? unit.barrelElev, this._tipV || (this._tipV = new THREE.Vector3()));
      const my = unit.model.rotation.y, c = Math.cos(my), s = Math.sin(my);
      const lx = t.x * c + t.z * s, lz = -t.x * s + t.z * c;
      return new THREE.Vector3(p.x + lx * fz + lz * fx, p.y + unit.model.position.y + t.y, p.z - lx * fx + lz * fz);
    }
    if (def.projectile?.mortar) {
      const e = elev ?? MORTAR.e0;
      const f = MORTAR.breech.z + Math.cos(e) * MORTAR.len, h = MORTAR.breech.y + Math.sin(e) * MORTAR.len;
      return new THREE.Vector3(p.x + fx * f, p.y + h, p.z + fz * f);
    }
    const m = def.muzzle || (def.model === 'infantry' ? { f: 0.7, h: 1.3 } : { f: 0, h: 2.2 });
    // And to the right (`s`): a fire team's gunner stands beside the plot, not on it.
    const sd = m.s || 0;
    return new THREE.Vector3(p.x + fx * m.f - Math.cos(yaw) * sd, p.y + m.h, p.z + fz * m.f + Math.sin(yaw) * sd);
  }

  /**
   * Where the gunner stands: behind the trail, a step to the right of it,
   * eye at standing height. The step back is the gun's own half-length and
   * a pace, shortened when the house behind the gun is nearer than that
   * (the ray from the breech says), and the eye never goes under the
   * ground it stands on.
   */
  layEye(out) {
    const L = this.lay;
    const u = L.unit;
    const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
    // Forward is (sin yaw, cos yaw); forward crossed with up is the right hand.
    const rx = -Math.cos(L.yaw), rz = Math.sin(L.yaw);
    // A weapon can say where its gunner's eye is (`def.eye`: the step back,
    // the step to the right, the height, and how far up to look): a vehicle's
    // commander stands in his hatch over the turret, where a man behind the
    // hull would see nothing but hull and slat armour; a mortar's gunner
    // looks at the tube and the loader, not up the arc into the sky.
    const E = u.def.eye || null;
    const want = E ? E.back : (u.def.modelLength || 6) * 0.5 + 2.2;
    let back = want;
    const res = this.physics.castRay({ x: u.pos.x, y: u.pos.y + 1.6, z: u.pos.z }, { x: -fx, y: 0, z: -fz }, want + 0.8);
    if (res && !(res.owner && res.owner === u)) back = Math.max(E ? 0.8 : 1.6, res.toi - 0.8);
    const side = E ? E.side : 1.5;
    let up = E ? E.up : 1.75;
    if (E && E.hatch) {
      // In the hatch: a head and shoulders over the top of the vehicle as
      // the model actually stands, measured once, rather than a height
      // guessed from the real thing and found inside the turret.
      // Remembered once the model is there to measure; a vehicle laid while
      // its model is still loading gets a guess this once.
      if (!(u._layTop > 0.5)) {
        // The world matrices first: a unit laid the tick it was placed has
        // its model still at the origin, and measured there the top of a
        // five-metre vehicle came out a metre over the plot.
        u.group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(u.model || u.group);
        const top = box.max.y - u.pos.y;
        if (Number.isFinite(top) && top > 0.5) u._layTop = top;
      }
      up = (u._layTop > 0.5 ? u._layTop : 3) + 0.75;
    }
    out.set(u.pos.x - fx * back + rx * side, 0, u.pos.z - fz * back + rz * side);
    const g = this.terrain.heightAt(out.x, out.z);
    // `h` is the eye's own height over the plot, a man's eye in his head
    // (standing, kneeling or prone); `up` the older reckoning from the
    // gun's top, floored at a standing eye.
    out.y = E && E.h > 0 ? Math.max(g + E.h * 0.9, u.pos.y + E.h) : Math.max(g + Math.min(1.2, up), u.pos.y - 0.6 + up);
    return out;
  }

  _layVel(L) {
    if (L.vel) return L.vel.clone();
    const s = L.unit.def.projectile.speed, c = Math.cos(L.elev);
    return new THREE.Vector3(Math.sin(L.yaw) * c * s, Math.sin(L.elev) * s, Math.cos(L.yaw) * c * s);
  }

  /**
   * The mortar's solution for the range the player has walked to: the
   * high arc on the charge that makes it, to the ground at that range along
   * the line of fire. The tube's elevation comes out of it, between
   * forty-five and eighty-five degrees, and the muzzle moves with the tube.
   */
  _mortarSolve(L) {
    const p = L.unit.def.projectile;
    const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
    const from = this._muzzle(L.unit, L.elev);
    const tx = from.x + fx * L.rangeWant, tz = from.z + fz * L.rangeWant;
    const to = new THREE.Vector3(tx, this.terrain.heightAt(tx, tz), tz);
    let sol = solveBallistic(from, to, p.speed, p.gravity, 30, null);
    if (!sol) sol = { vel: solveArc(from, to, p.speed, p.gravity, true) };
    if (!sol.vel) { const c = Math.cos(L.elev); sol.vel = new THREE.Vector3(fx * c * p.speed, Math.sin(L.elev) * p.speed, fz * c * p.speed); }
    const v = sol.vel;
    let elev = Math.atan2(v.y, Math.hypot(v.x, v.z));
    // The tube has nothing under forty-five degrees in it: a solution that
    // wants less is re-solved on the high arc at the same charge.
    if (elev < 0.785) {
      const speed = Math.hypot(v.x, v.y, v.z);
      const hi = solveArc(from, to, speed, p.gravity, true);
      if (hi) { v.copy(hi); elev = Math.atan2(v.y, Math.hypot(v.x, v.z)); }
    }
    L.elev = THREE.MathUtils.clamp(elev, 0.785, 1.48);
    // Along the lay's yaw exactly, at the solved speed and the clamped angle.
    const speed = Math.hypot(v.x, v.y, v.z), c = Math.cos(L.elev);
    L.vel = new THREE.Vector3(fx * c * speed, Math.sin(L.elev) * speed, fz * c * speed);
  }

  /**
   * The shell's flight from this lay, stepped until it meets something: the
   * same ray through the physics world the round itself will cast, segment
   * by segment (the town's boxes, the monument's stones, the turret), with
   * the terrain as the backstop. A line that only knew the ground and the
   * masonry drew straight through the house next door, and the shell did
   * not. What it met says what the ring means: the monument's stone, or
   * something else — the street, a roof, the town — which is a wasted round.
   */
  _layArc() {
    const L = this.lay;
    const g = L.unit.def.projectile.gravity;
    L.from = this._layMuzzle(L.unit);
    const v = this._layVel(L);
    const prev = L.from.clone(), pos = L.from.clone(), dir = new THREE.Vector3();
    const pts = [prev.clone()];
    const edge = (this.terrain?.span || 900) * 1.6;
    L.hit = false; L.masonry = false; L.blocked = false;
    // Enough of the flight to land: three hundred steps of a twenty-fifth of
    // a second is twelve seconds, and a mortar's lob on reduced charge is in
    // the air for seventeen. The line ended in mid-air and said the round
    // would land there; the round carried on. The step is sized to the
    // flight, down to the ground the muzzle stands on and a good way below.
    const drop = Math.max(30, L.from.y - this.terrain.heightAt(L.from.x, L.from.z) + 120);
    const speed = Math.max(1, Math.hypot(v.x, v.y, v.z));
    const tFlight = g > 0 ? (v.y + Math.sqrt(v.y * v.y + 2 * g * drop)) / g : edge * 2 / speed;
    const step = THREE.MathUtils.clamp((tFlight * 1.1) / (LAY_PTS - 2), 0.04, 0.25);
    let t = 0;
    for (let i = 1; i < LAY_PTS; i++) {
      t += step;
      pos.set(L.from.x + v.x * t, L.from.y + v.y * t - 0.5 * g * t * t, L.from.z + v.z * t);
      dir.subVectors(pos, prev);
      const len = dir.length();
      let hit = null;
      if (len > 1e-4) {
        dir.multiplyScalar(1 / len);
        const res = this.physics.castRay({ x: prev.x, y: prev.y, z: prev.z }, { x: dir.x, y: dir.y, z: dir.z }, len);
        if (res && !(res.owner && res.owner === L.unit)) hit = prev.clone().addScaledVector(dir, Math.max(0, res.toi - 0.05));
      }
      if (!hit && pos.y <= this.terrain.heightAt(pos.x, pos.z)) { hit = pos.clone(); hit.y = this.terrain.heightAt(pos.x, pos.z); }
      if (hit) {
        pts.push(hit);
        L.hit = true;
        L.masonry = this._inMasonry(hit) || this._inMasonry(hit.clone().addScaledVector(dir, 0.6));
        break;
      }
      pts.push(pos.clone());
      prev.copy(pos);
      if (Math.abs(pos.x) > edge || Math.abs(pos.z) > edge) break;
    }
    L.pts = pts;
    L.tof = t;
    L.impact.copy(pts[pts.length - 1]);
    L.range = Math.hypot(L.impact.x - L.from.x, L.impact.z - L.from.z);
    // Met the town inside forty metres: the barrel is pointing at a wall.
    L.blocked = L.hit && !L.masonry && L.range < 40;
    const arr = this.layLine.geometry.attributes.position.array;
    for (let i = 0; i < LAY_PTS; i++) {
      const q = pts[Math.min(i, pts.length - 1)];
      arr[i * 3] = q.x; arr[i * 3 + 1] = q.y + 0.15; arr[i * 3 + 2] = q.z;
    }
    this.layLine.geometry.attributes.position.needsUpdate = true;
    this.layRing.position.copy(L.impact);
    this.layRing.position.y += 0.3;
    // The ring is the round's dispersion on the ground where there is any.
    const sp = this.laySpread(L);
    this.layRing.scale.setScalar(sp > 0 ? sp / 2.6 : 1);
    const col = L.masonry ? 0xffb020 : L.blocked ? 0xe8604c : L.hit ? 0x9fd2ff : 0x8a98a6;
    this.layRing.material.color.setHex(col);
    this.layLine.material.color.setHex(col);
  }

  _layBuild() {
    if (this.layLine) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LAY_PTS * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9, depthTest: false }));
    line.renderOrder = 30; line.frustumCulled = false; line.visible = false;
    this.scene.add(line);
    this.layLine = line;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 31; ring.frustumCulled = false; ring.visible = false;
    this.scene.add(ring);
    this.layRing = ring;
    // Where the last round fell: a red cross and a ring on the ground, so
    // the next one is laid off the last and not off the drawn line alone.
    const mark = new THREE.Group();
    const red = new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide });
    const bar = new THREE.PlaneGeometry(4.2, 0.45);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const m = new THREE.Mesh(bar, red);
      m.rotation.set(-Math.PI / 2, 0, a);
      m.renderOrder = 31; m.frustumCulled = false;
      mark.add(m);
    }
    const o = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.95, 28), red);
    o.rotation.x = -Math.PI / 2; o.renderOrder = 31; o.frustumCulled = false;
    mark.add(o);
    mark.visible = false;
    this.scene.add(mark);
    this.fallMark = mark;
  }

  /** One round down the drawn line. False if the gun is not ready. */
  handFire() {
    const L = this.lay;
    if (!L || this.state !== 'playing') return false;
    const u = L.unit;
    if (!u.alive || u.state !== 'ready' || u.cooldown > 0) return false;
    this._layArc();
    // A machine gun's trigger is held, not pulled: the stream is `_handMG`'s.
    if (u.def.mg) return L.over <= 0;
    // The Javelin flies its own path to the mark; everything else goes down the drawn line.
    const top = u.def.projectile.kind === 'topattack';
    let vel = top ? null : this._layVel(L);
    const sp = this.laySpread(L);
    if (sp > 0 && !top) {
      // A mortar round lands somewhere in its ring: the same lay, solved
      // again a little off in line and in range.
      const L2 = { unit: u, yaw: L.yaw + gauss() * (sp / 2) / Math.max(30, L.range), rangeWant: L.rangeWant + gauss() * (sp / 2), elev: L.elev };
      this._mortarSolve(L2);
      if (L2.vel) vel = L2.vel;
    }
    // A mortar with its crew live is fired by letting the round go: it
    // slides down the tube and the shell leaves when it strikes the pin
    // (`_animateMortar`), a third of a second after the press.
    if (u.live && u.def.projectile.mortar) {
      if (u.live.pending) return false;
      u.live.pending = { impact: L.impact.clone(), vel, from: L.from.clone(), tof: L.tof, ref: L.ref };
      u.live.drop = 0;
      u.cooldown = u.def.reload * this.reloadFactor;
      L.reloadTotal = u.cooldown;
      return true;
    }
    const ok = this._fireOne(u, L.impact.clone(), { vel, hand: true, from: L.from });
    if (ok) {
      u.cooldown = u.def.reload * this.reloadFactor;
      L.reloadTotal = u.cooldown;
      L.kick = 1;
      this.handShots++;
      this._armSpot(u, L.tof, L.ref);
      this.onEvent('handshot', { unit: u, point: L.impact.clone() });
    }
    return ok;
  }

  /**
   * Whether anything that throws a shadow is moving: an aircraft, a
   * parachute, a gun swinging, laying, recoiling or being set up. On a
   * phone the shadow map is drawn only when something has moved (main.js,
   * `power.shadows`), and often only while this says so.
   */
  shadowBusy() {
    if (this.air?.sorties?.length || this.airborne?.planes?.length || this.airborne?.men?.length) return true;
    // A building in the town gutted since the last look: its shell is a new shadow.
    const burnt = this.cityFire?.burnt || 0;
    if (burnt !== this._shadowBurnt) { this._shadowBurnt = burnt; return true; }
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.state === 'setup' || u.recoilT > 0.01) return true;
      if (u.wantYaw != null && Math.abs(angleDiff(u.wantYaw, u.yaw)) > 0.004) return true;
      if (u.barrelB && Math.abs((u.barrelWant ?? 0) - (u.barrelElev ?? 0)) > 0.003) return true;
    }
    return false;
  }

  /**
   * The round just fired by the gunner's hand is watched: it carries the
   * spotter's note (`proj.spot`), and `handRound` is the clock the gunner
   * reads it by, the drawn line's time of flight counting down to SPLASH.
   */
  _armSpot(u, tof, ref) {
    const p = this._lastProj;
    if (!p) return;
    p.spot = { unit: u, from: u.pos.clone(), ref: ref ? ref.clone() : null };
    this.handRound = { unit: u, proj: p, eta: tof || 0, t: 0 };
  }

  /**
   * Where the gunner's round fell, called the way an observer calls it:
   * OVER or SHORT along the line from the gun to the target and LEFT or
   * RIGHT of it, in metres, or ON TARGET. The target is the designated
   * point, or what the crew had the gun laid on. The fall is kept on the
   * gun (`u.lastFall`) and marked on the ground while it is laid.
   */
  _spotFall(spot, point, on) {
    const u = spot.unit;
    u.lastFall = point.clone();
    if (this.handRound && this.handRound.unit === u) this.handRound = null;
    let text = 'ON TARGET', along = 0, across = 0;
    if (on === 'deflect') text = 'DEFLECTED';
    else if (!on) {
      const ref = this.target || spot.ref;
      const dx = point.x - spot.from.x, dz = point.z - spot.from.z;
      if (!ref) text = `SPLASH · ${Math.round(Math.hypot(dx, dz))} M`;
      else {
        const fx = ref.x - spot.from.x, fz = ref.z - spot.from.z, R = Math.max(1, Math.hypot(fx, fz));
        along = (dx * fx + dz * fz) / R - R;
        across = (dz * fx - dx * fz) / R;
        const parts = [];
        if (Math.abs(along) >= 4) parts.push(`${along > 0 ? 'OVER' : 'SHORT'} ${Math.round(Math.abs(along))}`);
        if (Math.abs(across) >= 4) parts.push(`${across > 0 ? 'RIGHT' : 'LEFT'} ${Math.round(Math.abs(across))}`);
        text = parts.length ? parts.join(' · ') : 'ON THE MARK';
      }
    }
    this.onEvent('spot', { unit: u, text, on: on === true, along, across, point: point.clone() });
  }

  /** The gunner's watched round and the mark of the last one's fall, each frame. */
  _spotUpdate(dt) {
    const H = this.handRound;
    // A round that left the map, or a deflection's second flight, is let go;
    // one that never came down anywhere is called lost.
    if (H && ((H.t += dt) > H.eta + 6 || !H.proj.alive)) {
      this.handRound = null;
      if (H.proj.spot) { H.proj.spot = null; this.onEvent('spot', { unit: H.unit, text: 'LOST', on: false, along: 0, across: 0, point: null }); }
    }
    const M = this.fallMark;
    if (!M) return;
    const f = this.lay?.unit.lastFall;
    M.visible = !!f;
    if (f) {
      M.position.set(f.x, f.y + 0.35, f.z);
      M.scale.setScalar(THREE.MathUtils.clamp(this.lay.range / 120, 1, 4));
    }
  }

  /**
   * The laid machine gun while the player holds it: round after round at
   * the gun's own rate for as long as `trigger` is down (main.js sets it
   * from FIRE), each on the point under the cross, each heating the barrel
   * (`HEAT`). Run hot, it locks until it has cooled; let go, it cools. The
   * sheaf walks round the point as the gun is held on it (`_mgRound`).
   */
  _handMG(u, L, dt) {
    const mg = u.def.mg;
    const on = this.trigger && L.over <= 0 && u.state === 'ready' && this.state === 'playing';
    if (!on) {
      if (L.streaming) { L.streaming = false; u.burstLeft = 0; }
      u.burstTimer = 0;
      this._cool(L, dt, false);
      return;
    }
    if (!L.streaming) {
      // A press is a shot, for the tally and the save, however long it is held.
      L.streaming = true;
      this.shotsFired++; this.handShots++;
      u.mgTarget = { hand: true, fresh: true, pos: L.impact.clone() };
      u.idle = false;
    }
    u.mgTarget.pos.copy(L.impact);
    u.burstTimer -= dt;
    while (u.burstTimer <= 0) {
      u.burstTimer += mg.interval;
      L.rounds = (L.rounds || 0) + 1;
      // Every third round speaks and kicks dust, as in a crew's burst.
      u.burstLeft = 3 - (L.rounds % 3);
      this._mgRound(u);
      L.heat = Math.min(1, L.heat + HEAT.mgRound);
      if (L.heat >= 1) {
        L.over = HEAT.lock; L.streaming = false; u.burstLeft = 0; u.burstTimer = 0;
        this.onEvent('overheat', { unit: u });
        break;
      }
    }
  }


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

  /**
   * The rubble already down counts as paid for. A resumed battle restores
   * its stones, its money and its tonnage from the save; without this the
   * first frame saw all of that rubble as new, paid for it again and counted
   * its tonnes twice.
   */
  rebaseEconomy() {
    this._lastDestroyedMass = this.structures.reduce((a, s) => a + s.demolishedMass, 0);
    this._paidMass = new Map(this.structures.map((s) => [s, s.demolishedMass]));
  }

  /** Sell a placed unit back for half its price. */
  sellUnit(unit) {
    // Not after the battle is decided: selling between the win and the report
    // lowered the spend the report and the medals read.
    if (!unit || !unit.alive || this.state !== 'playing') return false;
    // Nothing was charged in free build, so nothing comes back.
    const refund = this.freeBuild ? 0 : Math.round(unit.def.cost * 0.5);
    this.money += refund;
    this.spent -= refund;
    unit.alive = false;
    this._dropUnit(unit);
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
    this._strikeAt = point;
  }

  hideStrikeAim() {
    if (this.strikeReticle) this.strikeReticle.visible = false;
    this._strikeAt = null;
    if (this._strafeLine) this._strafeLine.visible = false;
    this._strafeArgs = null;
  }

  /**
   * The line a gun run will walk, while it is being drawn.
   *
   * Drawn as the overlay a forward air controller would draw it, not as a
   * strip of paint: a dashed gun-target line down the middle, solid rails
   * either side as wide as the beaten zone the stream will scatter over,
   * a cross-bar where the stream starts and one where it stops, chevrons
   * along the run that flow the way the aircraft will fly it, and the
   * run-in axis dashed back the way it will come. Amber on a dark outline,
   * so it reads on sand, stone, grass or sky, and drawn over everything —
   * the line goes through a town, and a line hidden by the town is no use
   * to the player laying it. Each piece sits on the ground under it.
   *
   * Clamped to what one burst covers, so what is drawn is the run the
   * player will actually get.
   */
  showStrafe(from, to, def) {
    if (!this._strafeLine) {
      const g = new THREE.Group();
      const mk = (colour, opacity, order) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3 * 600), 3));
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: colour, transparent: true, opacity, depthTest: false, depthWrite: false,
          side: THREE.DoubleSide, toneMapped: false, fog: false,
        }));
        m.renderOrder = order;
        m.frustumCulled = false;
        g.add(m);
        return m;
      };
      this._strafeOutline = mk(0x0b0d0e, 0.55, 30);
      this._strafeInk = mk(0xffb020, 0.95, 31);
      this._strafeLine = g;
      this.scene.add(g);
    }
    const st = def.strike;
    let dx = to.x - from.x, dz = to.z - from.z;
    let len = Math.hypot(dx, dz);
    if (len < 12) {
      // Not drawn yet: the default run through the point, away from the camera.
      dx = from.x - this.camera.position.x; dz = from.z - this.camera.position.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l; len = st.defaultLen;
      from = new THREE.Vector3(from.x - dx * len / 2, from.y, from.z - dz * len / 2);
    } else {
      dx /= len; dz /= len;
      len = THREE.MathUtils.clamp(len, st.minLen, st.maxLen);
    }
    this._strafeArgs = { x: from.x, z: from.z, dx, dz, len };
    this._drawStrafe();
    this._strafeLine.visible = true;
  }

  /** Lay the gun-run overlay's ribbons down for the current line and moment. */
  _drawStrafe() {
    const A = this._strafeArgs;
    if (!A) return;
    const { x: x0, z: z0, dx, dz, len } = A;
    const nx = -dz, nz = dx;                         // across the run
    const ink = [], line = [];
    // One flat quad from (u0, v0) to (u1, v1) in run coordinates, `w` wide.
    const seg = (out, u0, v0, u1, v1, w) => {
      const ax = x0 + dx * u0 + nx * v0, az = z0 + dz * u0 + nz * v0;
      const bx = x0 + dx * u1 + nx * v1, bz = z0 + dz * u1 + nz * v1;
      let px = -(bz - az), pz = bx - ax;
      const pl = Math.hypot(px, pz) || 1;
      px = px / pl * w / 2; pz = pz / pl * w / 2;
      const ay = this.terrain.heightAt(ax, az) + 0.8, by = this.terrain.heightAt(bx, bz) + 0.8;
      out.push(ax + px, ay, az + pz, ax - px, ay, az - pz, bx + px, by, bz + pz,
        bx + px, by, bz + pz, ax - px, ay, az - pz, bx - px, by, bz - pz);
    };
    // Widths are metres on the ground, but from the opening camera a metre
    // is under a pixel: a floor of two pixels for the thinnest stroke at the
    // middle of the run keeps it legible zoomed out.
    const cam = this.camera;
    const mx = x0 + dx * len / 2, mz = z0 + dz * len / 2;
    const d = Math.hypot(cam.position.x - mx, cam.position.y - this.terrain.heightAt(mx, mz), cam.position.z - mz);
    const perPx = 2 * d * Math.tan((cam.fov || 50) * Math.PI / 360) / Math.max(1, window.innerHeight || 720);
    const k = Math.max(1, 2 * perPx / 0.9);
    const both = (u0, v0, u1, v1, w) => { seg(ink, u0, v0, u1, v1, w * k); seg(line, u0, v0, u1, v1, (w + 1.6) * k); };
    const half = 5;                                   // the beaten zone, either side
    // Rails, the gun-target line in dashes down the middle, and the bars.
    both(0, -half, len, -half, 0.9);
    both(0, half, len, half, 0.9);
    for (let u = 0; u < len; u += 14) both(u, 0, Math.min(len, u + 8), 0, 1.1);
    both(0, -half - 4, 0, half + 4, 1.6);
    both(len, -half - 4, len, half + 4, 1.6);
    // Chevrons along the run, flowing the way it will be flown.
    const phase = ((this.elapsed || 0) * 22) % 30;
    for (let u = 6 + phase; u < len - 4; u += 30) {
      both(u - 5, -3.2, u, 0, 1.0);
      both(u - 5, 3.2, u, 0, 1.0);
    }
    // The arrowhead off the end: the way the aircraft leaves.
    both(len + 4, -6, len + 14, 0, 1.4);
    both(len + 4, 6, len + 14, 0, 1.4);
    // The run-in axis, dashed back the way it comes in.
    for (let u = -16; u > -90; u -= 12) both(u, 0, u + 6, 0, 0.9);
    const put = (mesh, arr) => {
      const at = mesh.geometry.attributes.position;
      const n = Math.min(arr.length, at.array.length);
      at.array.set(arr.length > at.array.length ? arr.slice(0, n) : arr);
      at.needsUpdate = true;
      mesh.geometry.setDrawRange(0, n / 3);
    };
    put(this._strafeInk, ink);
    put(this._strafeOutline, line);
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
   * Where on the bar a weapon unlocks, nought to one.
   *
   * The cards and the tick marks have always quoted this, on the bar's own
   * scale, while the gate itself read a different number: the fraction of
   * all the stone on the map. They agree only where the objectives are most
   * of the map. At the Forbidden City the marble terrace and the galleries
   * are four fifths of it and are scored against nobody, so the bar read 6 %
   * under a card that said "AT 2 %" and stayed locked. The gate reads the
   * bar now, so whatever a card says is what happens.
   *
   * And on a whole number. The threshold used to be wherever the arithmetic
   * put it — 4.4 % — while the card and the bar both rounded: the bar read
   * 4 % under a card saying "AT 4 %" and the gun stayed locked. Thresholds
   * are rounded up to the whole per cent the card quotes, and the bar's
   * number is rounded down, so the gun opens on the frame the number first
   * reads what the card says, and never before.
   */
  unlockAt(u) {
    if (this._unlockDenom == null) {
      this._unlockDenom = this.objectives.reduce(
        (a, o) => a + o.structure.totalMass * (1 - o.win.integrity), 0) / Math.max(1, this.totalMass);
    }
    const scale = this.level?.unlockScale ?? 1;
    const frac = u.unlockFrac ?? 0;
    if (frac <= 0) return 0;
    const raw = Math.min(0.99, (frac / scale) / Math.max(0.05, this._unlockDenom));
    return Math.max(1, Math.ceil(raw * 100 - 1e-6)) / 100;
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
    return this.objectiveProgress >= this.unlockAt(u) - 1e-6;
  }

  /** Released by the campaign but not yet earned here, for the build bar. */
  isReleased(u) { return this.unlockAll || isReleased(u.id); }
  canAfford(u) { return this.freeBuild || this.money >= this.costOf(u); }

  /**
   * A round landing near a high-value target: the SAM launchers and radars
   * and the command post take it as damage, and what is wrecked pays.
   */
  _samBlast(point, radius, power = 3000) {
    let pay = 0;
    if (this.sams) pay += this.sams.blast(point, radius, power);
    if (this.hq) pay += this.hq.blast(point, radius, power);
    if (this.hv) pay += this.hv.blast(point, radius, power);
    if (pay > 0) {
      this.money += pay;
      this.onEvent('bounty', { point, amount: Math.round(pay), kind: 'kill' });
    }
  }

  /**
   * An aeroplane brought down goes in where it lands: a fireball, a crater,
   * the fire, and the street round it if it lands in the town.
   */
  _wreckDown(point) {
    if (!point) return;
    const g = this.terrain.heightAt(point.x, point.z);
    if (Math.abs(point.x) > this.terrain.span || Math.abs(point.z) > this.terrain.span) {
      if (this.fx) this.fx.strikeBlast(point, 3.2, { groundY: point.y });
      return;
    }
    if (this.fx) {
      this.fx.strikeBlast(point, 4.2, { groundY: g });
      this.fx.dustColumn(point.x, g, point.z, 2.0);
    }
    if (this.craters) this.craters.add(point.x, g, point.z, 9);
    if (this.fires) this.fires.ignite(point.x, g, point.z, 4.5, 90);
    if (this.cityFire) this.cityFire.blast(point, 18, 30);
    // Paid like every other kill.
    this._creditKills(this.garrison.splash(point, 22, 400), point);
    const d = this.camera.position.distanceTo(point);
    this.engine?.addShake?.(THREE.MathUtils.clamp(140 / Math.max(d, 60), 0.1, 0.9));
  }

  /**
   * What a weapon costs: its list price, on every map.
   *
   * Strikes used to be priced by the size of the target — a third of list on
   * a small monument, three times it at Giza — because the rubble was paid
   * by the tonne and a bomb takes a share of whatever it lands on, so the
   * same strike paid back a tenth of its price on one map and twice it on the
   * next. Pricing the strike to the map fixed the return and moved the price
   * instead, which is worse: a player cannot learn what an F-15 is worth if
   * it costs $35,000 here and $300,000 there. The price is now the price,
   * and it is the pay that is evened out (`payScale`).
   */
  costOf(def) {
    if (def?.strike && this.strikeCredits > 0 && def.cost <= FREE_STRIKE_CAP) return 0;
    // The Air Power doctrine (see doctrine.js) takes a share off every strike.
    if (def?.strike && this.strikeScale && this.strikeScale !== 1) return Math.round(def.cost * this.strikeScale);
    return def?.cost ?? 0;
  }

  /** Is this strike on the house? A SAM compound's reward (see `onSamSite`). */
  isFreeStrike(def) { return !!def?.strike && this.strikeCredits > 0 && def.cost <= FREE_STRIKE_CAP; }

  /** A SAM compound wrecked: one air strike, any up to the F-15, free. */
  onSamSite() { this.strikeCredits++; }

  /** The command post down: the garrison without its orders for a while. */
  cutComms() { this.commsDownUntil = this.elapsed + HQ.commsCut; }

  get commsDown() { return this.elapsed < this.commsDownUntil; }

  /** The reload, with the counter-battery reward while it lasts. */
  get reloadFactor() {
    return this.reloadScale * (this.elapsed < this.counterBatteryUntil ? 0.75 : 1);
  }

  /** The high-value targets still standing, for the markers. */
  hvtPoints(out = []) {
    out.length = 0;
    if (this.sams) for (const p of this.sams.points) out.push(p);
    if (this.hq?.alive) out.push({ x: this.hq.x, y: this.hq.y + 2, z: this.hq.z, kind: 'hq' });
    if (this.hv) this.hv.points(out);
    return out;
  }

  /**
   * What a tonne of rubble pays, against the list rate.
   *
   * Paid by the share of the job rather than by the tonne. The job is the
   * objectives' mass, divided by the level's `unlockScale` — the same "how
   * much of this counts as getting going" the unlock bar reads — and it is
   * quoted at six hundred thousand tonnes, an ordinary landmark. Machu
   * Picchu's temples are twenty-one thousand tonnes and the Potala twenty-six
   * million; per tonne one pays far more than the other, and per share of
   * the bar they pay the same. So whatever a strike unlocks at, the player
   * arriving there has earned the same money on every map — about
   * $6,900 for each point of the unlock bar — and one list price for each
   * strike holds everywhere: the A-10 and the Apache are affordable as soon
   * as they unlock, the F-15 and the AC-130 shortly after, the GBU-28, the
   * Tomahawk and the B-1 have to be saved for.
   *
   * The scenery and the town are paid at no more than half again the list
   * rate, however small the job: Machu Picchu's town is two and a half times
   * the weight of its temples, and at the temples' rate it would be a mint.
   */
  get payScale() {
    if (this._payScale == null) {
      const objT = this.objectives.reduce((a, o) => a + o.structure.totalMass, 0) / 1000;
      const job = objT / Math.max(1, this.level?.unlockScale ?? 1);
      this._payScale = job > 0 ? Math.min(100, Math.max(0.02, JOB_REF_TONNES / job)) : 1;
    }
    return this._payScale;
  }

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
  /**
   * Whether any of a structure's stones stands within `pad` of a point, in
   * plan. A grid of the stones' positions is made the first time it is
   * asked; a stone shot away since still counts, which errs toward caution.
   */
  /** Is a point inside a standing stone of any structure? */
  _inMasonry(p) {
    const CELL = 8;
    for (const s of this.structures) {
      if (!s._planGrid) this._nearStones(s, p, 0);
      const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const a = s._planGrid.get(`${cx + dx},${cz + dz}`);
          if (!a) continue;
          for (const i of a) {
            if (!(s.flags[i] & 1)) continue;
            if (Math.abs(s.px[i] - p.x) <= s.hx[i] && Math.abs(s.py[i] - p.y) <= s.hy[i]
              && Math.abs(s.pz[i] - p.z) <= s.hz[i]) return true;
          }
        }
      }
    }
    return false;
  }

  _nearStones(s, point, pad) {
    const CELL = 8;
    if (!s._planGrid) {
      const g = new Map();
      for (let i = 0; i < s.count; i++) {
        const k = `${Math.floor(s.px[i] / CELL)},${Math.floor(s.pz[i] / CELL)}`;
        let a = g.get(k);
        if (!a) g.set(k, a = []);
        a.push(i);
      }
      s._planGrid = g;
    }
    const r = Math.ceil((pad + 4) / CELL);
    const cx = Math.floor(point.x / CELL), cz = Math.floor(point.z / CELL);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const a = s._planGrid.get(`${cx + dx},${cz + dz}`);
        if (!a) continue;
        for (const i of a) {
          const ex = Math.max(0, Math.abs(s.px[i] - point.x) - s.hx[i]);
          const ez = Math.max(0, Math.abs(s.pz[i] - point.z) - s.hz[i]);
          if (ex * ex + ez * ez < pad * pad) return true;
        }
      }
    }
    return false;
  }

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
        // A ring of galleries round a court is not a building: its box is
        // the whole court, and a gun in the middle of the court is nowhere
        // near it. Asked of the stones instead.
        if (s.open && !this._nearStones(s, point, PAD)) continue;
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
    // The plots are axis-aligned and the town's colliders are not: a block
    // on the skew, or one whose box runs on under the slope it stands on,
    // can hold a gun's muzzle without holding its plot — and a round fired
    // from inside a collider dies at the muzzle, every round, the crew's
    // included. The physics world is the one that knows, so it is asked:
    // a ray that starts inside a solid comes back at zero.
    if (!onRoof && this.physics?.cityBody) {
      const inside = this.physics.castRay({ x: point.x, y: point.y + 2.2, z: point.z }, { x: 0, y: 1, z: 0 }, 0.05);
      if (inside && inside.toi <= 1e-3 && !inside.owner) return { ok: false, reason: 'inside a building' };
    }
    return { ok: true };
  }

  /**
   * Call an air strike on a point. Paid for on the call; the aircraft comes
   * in from behind the camera and the bomb lands a few seconds later.
   */
  callStrike(id, point, opts = {}) {
    const def = UNITS_BY_ID[id];
    if (!def || !def.strike) return null;
    if (!this.isUnlocked(def)) return null;
    if (!point) { this.onEvent('needtarget', def); return null; }
    const price = this.costOf(def);
    if (!this.freeBuild && this.money < price) { this.onEvent('poor', { ...def, cost: price }); return null; }
    if (!this.freeBuild) {
      this.money -= price;
      this.spent += price;
    }
    this.strikesCalled = (this.strikesCalled || 0) + 1;
    // The free strike is spent on the call.
    if (this.isFreeStrike(def)) {
      this.strikeCredits--;
      this.onEvent('freestrike', { def, left: this.strikeCredits });
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
    const sortie = this.air.call(def, at, ceiling, { flak, to: opts.to || null });
    this.shotsFired++;
    this.selectedUnitId = null;
    if (flak > 0) this.onEvent('flak', { def, guns: flak });
    this.onEvent('strike', { def, point: at, eta: sortie.loiter ? sortie.loiter.eta : sortie.releaseAt + sortie.fall });
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
      // Under the canopy a mortarman is just a man: the kneel and the raised
      // round belong to the emplacement, which forms up when he lands.
      // A machine gunner is not prone under a canopy either.
      figure: (k) => makeInfantryMesh(k === 0 ? 0x4a5340 : 0x3f4738,
        (def.id === 'm120' || def.id === 'm240') ? { weapon: null, role: 'second' }
          : { weapon: def.id, role: k === 0 ? 'gunner' : 'second' }),
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
  /**
   * The top of the tallest thing standing on the map, plus a margin, for the
   * projectiles (`skyFloor`): above it a shell's physics ray is skipped. The
   * monument's standing height, the town's roofs and the ground itself all
   * count; a hill is sampled rather than assumed. Every two seconds, since
   * buildings only get shorter.
   */
  _refreshSkyFloor() {
    if (this._skyAt !== undefined && this.elapsed - this._skyAt < 2) return;
    this._skyAt = this.elapsed;
    let top = -Infinity;
    for (const st of this.structures) top = Math.max(top, st.standingHeight());
    const cf = this.cityFire;
    if (cf && cf.plots) for (const p of cf.plots) top = Math.max(top, p.top ?? (p.base + p.h));
    if (this.terrain?.heightAt) {
      if (this._terrainTop === undefined) {
        const span = this.terrain.span || 900;
        let g = -Infinity;
        for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) g = Math.max(g, this.terrain.heightAt(-span + (2 * span * i) / 24, -span + (2 * span * j) / 24));
        this._terrainTop = g;
      }
      top = Math.max(top, this._terrainTop);
    }
    this.projectiles.skyFloor = Number.isFinite(top) ? top + 40 : Infinity;
  }

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
      health: def.health * (this.unitHealthScale || 1), maxHealth: def.health * (this.unitHealthScale || 1),
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
      // Veteran crews from the Armor doctrine start a chevron up.
      rank: this.startRank || 0,
      crew: newCrew(),
      age: 0,
      dugIn: false,
      damageDealt: 0,
    };
    unit.group.position.copy(pos);
    this.scene.add(unit.group);
    this.units.push(unit);

    // Face the primary target immediately so it reads as deliberate.
    const aim = this.target || new THREE.Vector3(this.primary.origin.x, y, this.primary.origin.z);
    unit.yaw = unit.wantYaw = Math.atan2(aim.x - pos.x, aim.z - pos.z);
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

  /** Where a saved unit was standing, as a deploy point. See battlesave.js. */
  restorePoint(u) {
    const p = new THREE.Vector3(u.x, u.y, u.z);
    p.onRoof = u.r === 1;
    p.onDeck = u.k === 1;
    return p;
  }

  /** A saved unit, back on the ground: no money, no lift, no placement check. */
  restoreUnit(id, pos) {
    const def = UNITS_BY_ID[id];
    if (!def || def.strike) return null;
    return this._spawn(def, pos);
  }

  async _attachModel(unit) {
    const def = unit.def;
    if (def.id === 'm120') {
      // A mortar is a crew and a tube, not two men carrying something: the
      // whole emplacement, laid toward the target like the unit.
      unit.group.add(flattenModel(makeMortarTeam()));
      return;
    }
    if (def.model === 'infantry') {
      // A fire team: the gunner and his number two, carrying this unit's own
      // weapon, so a line of AT4s and a line of Javelins are not the same
      // picture on the ground.
      // Baked into one mesh a material: see `flattenModel`.
      const team = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const m = makeInfantryMesh(i === 0 ? 0x4a5340 : 0x3f4738,
          { weapon: def.id, role: i === 0 ? 'gunner' : 'second' });
        m.position.set((i - 0.5) * 1.3, 0, (i % 2) * 0.7);
        m.rotation.y = (Math.random() - 0.5) * 0.3;
        team.add(m);
      }
      unit.group.add(flattenModel(team));
      return;
    }
    const wrapper = def.build
      ? this.models.wrap(def.build(), def.id)
      : await this.models.load(def.modelFile || def.model, def.modelLength, { tint: def.tint, barrel: def.barrel, modelYaw: def.modelYaw });
    if (!unit.alive) return;
    const inst = this.models.instance(wrapper);
    inst.rotation.y = def.modelYaw ?? 0;
    unit.group.add(inst);
    unit.model = inst;
    // A gun whose barrel was cut out of its model: laid to each shot, the
    // round leaving its end, and recoiling (barrel.js, `_updateBarrel`).
    if (inst.userData.barrel) {
      unit.barrel = inst.getObjectByName('barrel');
      unit.barrelB = inst.userData.barrel;
      unit.barrelElev = unit.barrelWant = unit.barrelB.rest;
      unit.recoilT = 0;
    }
    if (unit.drop) unit.drop.model = inst;
  }

  removeUnit(unit) {
    unit.alive = false;
    this._dropUnit(unit);
  }

  /**
   * A unit out of the scene and off the GPU. The cached model wrappers are
   * pinned: every gun of a type is a clone sharing their buffers.
   */
  _dropUnit(unit) {
    if (unit.live) this._mortarLive(unit, false);
    this.scene.remove(unit.group);
    releaseTree(unit.group, this.scene, this.models?.cache?.values());
  }

  /**
   * A town building has been gutted, and its roof has gone down with it.
   *
   * A rooftop is a firing position like any other, and burning the building
   * under it used to change nothing about the gun on top: the floors folded
   * to a heap at the base and the battery went on shooting from the height
   * where the roof had been, standing in the air over its own rubble. Anyone
   * up there goes with the building — health to zero rather than a removal of
   * their own, so the loss runs through the one path that counts it, pays out
   * the wreck and tells the feed. A stick still under its canopies over that
   * roof has nowhere left to land, and is lost on the drop.
   *
   * The test is the plot's own box, not a radius: a long terrace is long.
   */
  cityCollapse(p) {
    if (!p) return;
    const top = p.top ?? (p.base + p.h);
    const ca = Math.cos(p.yaw || 0), sa = Math.sin(p.yaw || 0);
    const onIt = (x, y, z) => {
      if (y < p.base + 1 || y > top + 3) return false;
      const dx = x - p.x, dz = z - p.z;
      return Math.abs(dx * ca - dz * sa) < p.w / 2 + 1.5
          && Math.abs(dx * sa + dz * ca) < p.d / 2 + 1.5;
    };
    for (const u of this.units) {
      if (!u.alive || !u.onRoof || u.health <= 0) continue;
      if (!onIt(u.pos.x, u.pos.y, u.pos.z)) continue;
      u.health = 0;
      u.fell = true;
    }
    for (const d of this.pending) {
      if (d.lost || !d.pos.onRoof) continue;
      if (!onIt(d.pos.x, d.pos.y, d.pos.z)) continue;
      d.lost = true;
    }
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
    // Whatever is on station goes to it.
    if (this.air) this.air.retarget(this.target);
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

  _fireOne(unit, aimPoint, opts = {}) {
    const def = unit.def;
    // A crew's shot: the gun is on the bearing already (it traversed to it,
    // `_traverse`) bar the last degree or two, taken up here before the
    // muzzle is read, so the round leaves the barrel where it now points.
    if (!opts.from) {
      unit.yaw = unit.wantYaw = Math.atan2(aimPoint.x - unit.pos.x, aimPoint.z - unit.pos.z);
      unit.group.rotation.y = unit.yaw;
    }
    const from = opts.from ? opts.from.clone() : this._muzzle(unit);

    // Dispersion is applied to the aim point, so error grows along the line of
    // fire the way real gun dispersion does. A crew that has landed rounds
    // shoots tighter: veterancy is a smaller sheaf.
    const spread = def.dispersion * this.dispersionScale * (1 - 0.14 * (unit.rank || 0));
    const aim = aimPoint.clone();
    // A hand-laid round goes where it was laid: no sheaf, no area walk.
    if (!opts.vel && !opts.hand) {
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
    }

    let vel;
    const p = def.projectile;
    if (opts.vel) {
      vel = opts.vel.clone();
    } else if (p.mortar) {
      // A mortar has no flat shot in it: the round goes up the tube and comes
      // down on the point, on the charge that makes the arc. The low
      // solution a gun takes when the way is clear was a mortar shooting
      // horizontally at something fifty feet away.
      const sol = solveBallistic(from, aim, p.speed, p.gravity, 12.0, null);
      if (!sol) { unit.hold = 'out of range'; return false; }
      vel = sol.vel;
    } else if (p.flat || p.kind === 'arc') {
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
        // A gun whose barrel cannot be laid that high (the Stryker's 105
        // stops at twenty degrees) cannot lob: it fires the low line, into
        // whatever is in the way, as a direct-fire gun does.
        const top = unit.barrelB?.max;
        if (top != null && lofted && Math.atan2(vel.y, Math.hypot(vel.x, vel.z)) > top + 0.01) {
          if (!low) { unit.hold = 'out of elevation'; return false; }
          vel = low;
        }
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

    // A gun with its own barrel is laid to this shot, the round leaves the
    // barrel's end, and the barrel runs back on its recoil.
    if (unit.barrelB) {
      const e = Math.atan2(vel.y, Math.hypot(vel.x, vel.z));
      unit.barrelElev = unit.barrelWant = e;
      if (!opts.from) from.copy(this._muzzle(unit, e));
      unit.recoilT = p.kind === 'rocket' ? 0 : 1;
      // A launcher's rockets leave its cells in turn, across the face.
      const C = unit.barrelB.cells;
      if (C && !opts.from) {
        const k = unit.cell = ((unit.cell ?? -1) + 1) % (C.cols * C.rows);
        const col = k % C.cols - (C.cols - 1) / 2, row = Math.floor(k / C.cols) - (C.rows - 1) / 2;
        const fx = Math.sin(unit.yaw), fz = Math.cos(unit.yaw), ce = Math.cos(e), se = Math.sin(e);
        from.x += -fz * col * C.dx + (-se * fx) * row * C.dy;
        from.y += ce * row * C.dy;
        from.z += fx * col * C.dx + (-se * fz) * row * C.dy;
      }
    }

    this._lastProj = this.projectiles.fire({
      pos: from, vel, gravity: p.gravity, kind: p.kind, speed: p.speed,
      warhead: def.warhead, owner: unit, target: aim, trail: p.trail, hand: !!opts.hand,
    });

    // A gun's barrel, or a mortar's tube, goes on smoking for a few seconds after the shot.
    if ((unit.barrelB || p.mortar) && p.kind !== 'rocket') unit.smokeT = 4.5;
    const dir = vel.clone().normalize();
    this.fx.muzzleFlash(from, dir, def.warhead.fx * (opts.hand ? 0.3 : 1));
    if (p.kind !== 'rocket' && this.fx.flourish && !opts.hand) {
      // The blast flattens the ground in front of a heavy gun, and now and
      // then a big one blows a smoke ring.
      if (def.warhead.fx >= 0.7) this.fx.flourish.muzzleDust(from, dir, this.terrain.heightAt(from.x, from.z), def.warhead.fx);
      if (def.warhead.fx >= 0.9 && Math.random() < 0.14) this.fx.flourish.smokeRing(from, dir, def.warhead.fx);
    }
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
        this._dropUnit(u);
        this.fx.detonate(u.pos.clone().setY(u.pos.y + 1), 0.55, {
          ground: true, groundY: u.pos.y,
        });
        this.onEvent('unitlost', u);
        continue;
      }

      if (this.invulnerable) u.health = u.maxHealth;
      if (u.barrel) this._updateBarrel(u, dt);
      if (u.smokeT > 0) this._muzzleSmoke(u, dt);
      if (u.wantYaw != null && !u.handHeld) this._traverse(u, dt);

      // Time in place. After half a minute the crew has dug in.
      u.age += dt;
      if (!u.dugIn && u.age > 28) { u.dugIn = true; this.onEvent('dugin', u); }

      if (u.state === 'setup') {
        u.setupLeft -= dt;
        if (u.setupLeft <= 0) { u.state = 'ready'; u.cooldown = 0; }
        continue;
      }

      // The player's hand on it: the crew holds, the breech reloads.
      if (u.handHeld) {
        if (u.def.mg) {
          if (this.lay && this.lay.unit === u) this._handMG(u, this.lay, dt); else this._updateMG(u, dt);
          continue;
        }
        u.cooldown = Math.max(0, u.cooldown - dt); if (u.live) this._animateMortar(u, dt); continue;
      }

      // A machine-gun team fires bursts of its own, not shells.
      if (u.def.mg) { this._updateMG(u, dt); continue; }

      // Mid-salvo: keep loosing rockets on the interval.
      if (u.salvoLeft > 0) {
        u.salvoTimer -= dt;
        if (u.salvoTimer <= 0) {
          const aim = u.salvoAim || this.aimFor(u);
          if (aim) this._fireOne(u, aim);
          u.salvoLeft--;
          u.salvoTimer = u.def.salvo.interval;
          if (u.salvoLeft === 0) {
            u.cooldown = u.def.reload * this.reloadFactor;
            u.salvoAim = null;
          }
        }
        continue;
      }

      u.cooldown -= dt;
      if (u.cooldown > 0) continue;

      const aim = this.aimFor(u);
      if (!aim) {
        u.idle = true; u.cooldown = 0.5;
        // Nothing to shoot at for a while: the barrel comes down to ready.
        u.idleT = (u.idleT || 0) + 0.5;
        if (u.barrelB && u.idleT > 8) u.barrelWant = u.barrelB.ready;
        continue;
      }
      u.idle = false; u.idleT = 0;
      // On the bearing first: the crew traverses (`_traverse`) and the barrel
      // comes up toward the shot while it does; it fires when it is laid.
      u.wantYaw = Math.atan2(aim.x - u.pos.x, aim.z - u.pos.z);
      if (Math.abs(angleDiff(u.wantYaw, u.yaw)) > 0.035) {
        this._leadBarrel(u, aim);
        u.cooldown = 0.2;
        continue;
      }

      if (u.def.salvo) {
        // A ripple stays on the aim point it was laid for; re-solving between
        // rockets would walk the sheaf around as the target list refreshes.
        u.salvoAim = aim.clone();
        u.salvoLeft = u.def.salvo.count;
        u.salvoTimer = 0;
      } else {
        if (this._fireOne(u, aim)) u.cooldown = u.def.reload * this.reloadFactor;
        else u.cooldown = 1.0;
      }
    }
    this.units = this.units.filter((u) => u.alive || u.group.parent);
  }

  // ──────────────────────────────────────────────────────── machine guns ──

  /**
   * A machine-gun team: a burst, a pause, a burst.
   *
   * Hitscan, because a 7.62 round crosses three hundred metres in a third of a
   * second and a projectile that slow would read as a slow round; what the
   * player sees is the tracer, which flies. The air comes first, the way it
   * does for the garrison's own gunners: anything of the enemy's that is in
   * the sky — a transport on its run, men under canopies — will not be there
   * in ten seconds, and the trench will.
   */
  _updateMG(u, dt) {
    const mg = u.def.mg;
    if (u.burstLeft > 0) {
      u.burstTimer -= dt;
      if (u.burstTimer > 0) return;
      u.burstTimer = mg.interval;
      u.burstLeft--;
      this._mgRound(u);
      if (u.burstLeft === 0 && !u.handHeld) u.cooldown = u.def.reload * this.reloadFactor * (0.85 + Math.random() * 0.3);
      if (!u.handHeld) return;
    }
    u.cooldown -= dt;
    if (u.cooldown > 0) return;
    // The player's gun waits for the player's thumb.
    if (u.handHeld) { u.cooldown = 0; return; }
    const t = this._mgTarget(u);
    if (!t) { u.idle = true; u.cooldown = 0.5; u.mgTarget = null; return; }
    u.idle = false;
    u.mgTarget = t;
    u.burstLeft = mg.burst;
    // A burst is a shot, for the tally and for the save's "has this battle
    // started": a battle fought with machine guns alone fired nothing.
    this.shotsFired++;
    u.burstTimer = 0;
    // The team turns to its target; the gun is laid along the group's +Z.
    const p = t.pos;
    u.yaw = Math.atan2(p.x - u.pos.x, p.z - u.pos.z);
    u.group.rotation.y = u.yaw;
  }

  /** What a machine-gun team fires at: the enemy in the air, else the nearest man it can see. */
  _mgTarget(u) {
    const mg = u.def.mg;
    const from = this._mgFrom || (this._mgFrom = new THREE.Vector3());
    from.copy(u.pos).y += 0.6;
    for (const a of this.enemyAir) {
      if (!a.alive) continue;
      if (a.pos.y < from.y + 8) continue;
      if (a.pos.distanceToSquared(from) > mg.air * mg.air) continue;
      return { air: a, pos: a.pos };
    }
    const g = this.garrison;
    if (!g) return null;
    const r2 = u.def.range * u.def.range;
    // The designated man first, if this gun can see him.
    const td = this.targetDefender;
    if (td && td.alive && td.pos.distanceToSquared(u.pos) < r2
      && this._mgSees(from, td)) return { d: td, pos: td.muzzle };
    // Otherwise the nearest few, nearest first, until one is in sight.
    const near = [];
    for (const d of g.defenders) {
      if (!d.alive) continue;
      const dd = d.pos.distanceToSquared(u.pos);
      if (dd < r2) near.push([dd, d]);
    }
    near.sort((a, b) => a[0] - b[0]);
    // Nearest first, but not only the nearest: in a town the six closest men
    // are as often as not behind the same block, and a gun that gave up after
    // them sat silent with thirty-five others in plain view. Twenty-four
    // sight lines once a burst is nothing.
    for (let i = 0; i < Math.min(24, near.length); i++) {
      const d = near[i][1];
      if (this._mgSees(from, d)) return { d, pos: d.muzzle };
    }
    // Then a sample of the rest, so the far edge of the range is not out of
    // reach just because the near edge is crowded.
    for (let i = 24; i < near.length; i += Math.max(1, Math.floor((near.length - 24) / 16))) {
      const d = near[i][1];
      if (this._mgSees(from, d)) return { d, pos: d.muzzle };
    }
    return null;
  }

  _mgSees(from, d) {
    const to = d.muzzle;
    if (this.cityBlocker && this.cityBlocker.blocks(from, to)) return false;
    return lineOfSight(this.structures, from, to, 1.0, 1.2);
  }

  /** One round of a burst: the tracer, the hit, and the pinning. */
  _mgRound(u) {
    // On the range every round is counted, and the board says how many found something.
    if (!this.range) { this._mgRound1(u); return; }
    this.range.open();
    this._mgRound1(u);
    this.range.close();
  }

  _mgRound1(u) {
    const mg = u.def.mg;
    const t = u.mgTarget;
    if (!t) return;
    const from = this._muzzle(u);
    // Seen from the gunner's own eye, a foot behind the muzzle, the flash
    // the camera sees from fifty metres is a wall of light: the hand's
    // rounds carry a small, dim one (`hand`, tracers.js).
    const look = this.lay && this.lay.unit === u ? { look: 'm240', hand: true } : { look: 'm240' };
    if (t.hand) {
      // Laid by hand on a point: the sheaf walks round it as it does round
      // a man, and whoever is standing in it is hit. The round's end is
      // tested against the men near the point, not the point against a man.
      const to = t.pos.clone();
      const dist = Math.max(1, to.distanceTo(from));
      const spread = u.def.dispersion * (0.4 + dist / u.def.range) * 0.8;
      const w = u.walk || (u.walk = { x: 0, y: 0, z: 0, n: 0 });
      if (t.fresh || u.burstLeft === mg.burst - 1) { t.fresh = false; w.x = gauss() * spread * 0.4; w.z = gauss() * spread * 0.4; w.y = 0; w.n = 0; }
      w.x += gauss() * spread * 0.2; w.z += gauss() * spread * 0.2; w.y += spread * 0.05;
      // Held on for a hundred rounds the wander stays round the point: the
      // gunner is leaning on it, not letting it climb away.
      const wl = spread * 0.8;
      w.x = THREE.MathUtils.clamp(w.x, -wl, wl); w.z = THREE.MathUtils.clamp(w.z, -wl, wl); w.y = Math.min(w.y, spread * 0.5);
      to.x += w.x + gauss() * spread * 0.3; to.z += w.z + gauss() * spread * 0.3; to.y += w.y + gauss() * spread * 0.15;
      const g = this.garrison;
      let victim = null, best = 0.9 * 0.9;
      const seg = this._mgSeg || (this._mgSeg = new THREE.Vector3()), ab = this._mgAB || (this._mgAB = new THREE.Vector3());
      ab.subVectors(to, from);
      const ab2 = Math.max(1e-6, ab.lengthSq());
      // How far a point stands off the round's path, over its last stretch.
      const offPath = (pt) => {
        const tt = THREE.MathUtils.clamp(seg.subVectors(pt, from).dot(ab) / ab2, 0, 1);
        if (tt < 0.6) return Infinity;
        return seg.copy(from).addScaledVector(ab, tt).distanceToSquared(pt);
      };
      if (g) {
        for (const d of g.defenders) {
          if (!d.alive) continue;
          if (d.pos.distanceToSquared(from) > (dist + 6) * (dist + 6)) continue;
          const dd = offPath(d.muzzle);
          if (dd < best) { best = dd; victim = d; }
        }
      }
      // The range's plates and drones, and anything else that asks to be hit.
      let extra = null, bestX = Infinity;
      for (const x of this.extraTargets) {
        if (!x.alive) continue;
        if (x.pos.distanceToSquared(from) > (dist + 12) * (dist + 12)) continue;
        const dd = offPath(x.pos) - x.r * x.r;
        if (dd < 0.9 * 0.9 && dd < bestX) { bestX = dd; extra = x; }
      }
      if (extra && (!victim || bestX < best)) {
        this.tracerFX.fire(from, extra.pos, look, true);
        extra.hit(mg.damage, u);
        if (this.lay && this.lay.unit === u) this.lay.kick = Math.min(0.6, this.lay.kick + 0.1);
        return;
      }
      const cover = victim ? (victim.cover === 'trench' ? 0.5 : victim.cover === 'window' || victim.cover === 'arcade' ? 0.6 : victim.sandbags ? 0.7 : 1) : 0;
      const hit = !!victim && Math.random() < 0.8 * cover;
      this.tracerFX.fire(from, hit ? victim.muzzle : to, look, hit);
      if (hit) {
        victim.health -= mg.damage;
        if (victim.health <= 0) {
          victim.alive = false;
          u.kills = (u.kills || 0) + 1;
          this._creditKills(1, victim.pos);
          this.onEvent('handshot', { unit: u, point: victim.pos.clone(), kill: true });
        }
      } else if (this.fx?.impactDust && u.burstLeft % 3 === 0) {
        this.fx.impactDust(to.x, to.y, to.z, 0.35);
      }
      if (g) {
        const until = g.time + mg.pin;
        const pr2 = mg.pinRadius * mg.pinRadius;
        for (const o of g.defenders) {
          if (!o.alive) continue;
          if (o.pos.distanceToSquared(to) < pr2 && (o.pinned || 0) < until) o.pinned = until;
        }
      }
      if (this.lay && this.lay.unit === u) this.lay.kick = Math.min(0.6, this.lay.kick + 0.1);
    } else if (t.air) {
      if (!t.air.alive) { u.burstLeft = 0; return; }
      const dist = t.air.pos.distanceTo(from);
      const hit = Math.random() < 0.5 * (1 - 0.6 * dist / mg.air) * (t.air.exposure ?? 1);
      // Leading a moving aircraft by eye: the stream hoses round it.
      const aim = t.air.pos.clone();
      const sp = dist * (hit ? 0.006 : 0.03);
      aim.x += gauss() * sp; aim.y += gauss() * sp; aim.z += gauss() * sp;
      this.tracerFX.fire(from, aim, look, hit);
      if (hit) t.air.hit(mg.airDamage * (t.air.armour ?? 1), u);
    } else {
      const d = t.d;
      if (!d.alive) { u.burstLeft = 0; return; }
      const to = d.muzzle.clone();
      const dist = to.distanceTo(from);
      // The sheaf: tight near, wider far — and the burst walks. A machine
      // gun on a bipod does not put nine rounds through one hole: the point
      // of aim wanders round the man as the gunner holds it down, and climbs
      // a little with every round. `u.walk` is that wander, started fresh
      // with each burst and carried from round to round within it.
      const spread = u.def.dispersion * (0.4 + dist / u.def.range);
      const w = u.walk || (u.walk = { x: 0, y: 0, z: 0, n: 0 });
      if (u.burstLeft === mg.burst - 1) { w.x = gauss() * spread * 0.5; w.z = gauss() * spread * 0.5; w.y = 0; w.n = 0; }
      w.x += gauss() * spread * 0.22;
      w.z += gauss() * spread * 0.22;
      w.y += spread * 0.06;
      to.x += w.x + gauss() * spread * 0.3;
      to.z += w.z + gauss() * spread * 0.3;
      to.y += w.y + gauss() * spread * 0.15;
      // Cover is most of what a burst is up against: a man below a parapet
      // shows a head and shoulders, a man at a window a little more.
      const cover = d.cover === 'trench' ? 0.4
        : d.cover === 'window' || d.cover === 'arcade' ? 0.5
          : d.sandbags ? 0.65 : d.cover === 'roof' ? 0.75 : 1;
      const hit = Math.random() < 0.45 * (1 - 0.5 * dist / u.def.range) * cover;
      this.tracerFX.fire(from, to, look, hit);
      if (hit) {
        d.health -= mg.damage;
        if (d.health <= 0) {
          d.alive = false;
          u.kills = (u.kills || 0) + 1;
          this._creditKills(1, d.pos);
        }
      }
      // Pinned: every man near where the burst is landing, hit or not.
      const g = this.garrison;
      const until = g.time + mg.pin;
      const pr2 = mg.pinRadius * mg.pinRadius;
      for (const o of g.defenders) {
        if (!o.alive) continue;
        if (o.pos.distanceToSquared(to) < pr2 && (o.pinned || 0) < until) o.pinned = until;
      }
    }
    if (this.audio && u.burstLeft % 3 === 0) {
      this.audio.play('mg', from, { gain: 0.3, rolloff: 380, rate: 1.05, cooldown: 0.05 });
    }
  }

  /** The garrison men killed: the tally, the pay and the bounty text. */
  _creditKills(n, at) {
    if (!n) return;
    this.defendersKilled += n;
    this.money += n * MONEY_PER_DEFENDER;
    this.onEvent('bounty', { point: at, amount: n * MONEY_PER_DEFENDER, kind: 'kill' });
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
   * take a third of whatever it lands on in one pass. That is what four
   * times the Eagle's price buys.
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
  /**
   * A dump going up: the blast on the masonry and the men round it, fire if
   * it was fuel, a scar in the ground, and the bounty for the position.
   */
  _storeBoom(dump, spec) {
    const p = dump.pos.clone(); p.y += 0.6;
    if (dump.kind !== 'fuel' && this.fx.flourish) this.fx.flourish.cookOff(p.x, dump.pos.y, p.z, 7 + Math.random() * 4, this.audio, crack);
    for (const st of this.structures) {
      st.explode(p, spec.lethal, spec.radius, spec.power * this.powerScale, { dir: { x: 0, y: 1, z: 0 }, kinetic: 0.3 });
    }
    const killed = this.garrison.splash(p, spec.splash, spec.power);
    this.defendersKilled += killed;
    const pay = killed * MONEY_PER_DEFENDER + spec.bounty;
    this.money += pay;
    this.onEvent('bounty', { point: p, amount: pay, kind: 'kill' });
    this.fx.detonate(p, spec.fx, { ground: true, groundY: dump.pos.y });
    if (dump.kind === 'fuel' && this.fires) this.fires.ignite(p.x, dump.pos.y + 0.4, p.z, 2.2, 45);
    if (this.craters) this.craters.add(p.x, dump.pos.y, p.z, spec.radius * 0.45);
    if (this.audio) this.audio.play('explosion', p, { rate: dump.kind === 'fuel' ? 0.8 : 1.05, gain: 0.8, rolloff: 400 });
    const cd = this.camera.position.distanceTo(p);
    this.engine.addShake(THREE.MathUtils.clamp(spec.fx * 22 / Math.max(cd, 30), 0.02, 0.5));
    this.onEvent('secondary', { kind: dump.kind, point: p, killed });
  }

  _strikeImpact(hit) {
    const { proj } = hit;
    let point = hit.point;
    const w = proj.warhead;
    const st = proj.strikeDef.strike;
    const down = { x: 0, y: -1, z: 0 };
    // A penetrator goes in before it goes off. It carried no such thing: the
    // GBU-28 burst on the face it touched, and on the stupa at the summit of
    // Borobudur that face is a few metres across, so the bite rule sized a
    // two-and-a-half-tonne bomb to it and it took seventy stones. It now
    // carries on along its line for `penetrate` metres — never below the
    // ground — and bursts in there, where the masonry is wide.
    //
    // Through stone, not air. Borobudur's crown is a hollow bell, and
    // fourteen metres straight down from its pinnacle is its empty chamber:
    // a burst there was capped to the bell's thin wall and took fourteen
    // stones. The depth is counted only while the line is inside masonry,
    // so the bomb crosses a chamber, a gallery or a void and goes on into
    // the fill beyond.
    if (st.penetrate && proj.vel.lengthSq() > 1) {
      const dir = proj.vel.clone().normalize();
      const p2 = point.clone();
      let solid = 0;
      for (let k = 0; k < st.penetrate * 4; k++) {
        p2.addScaledVector(dir, 1);
        if (p2.y < this.terrain.heightAt(p2.x, p2.z) + 1) { p2.addScaledVector(dir, -1); break; }
        if (this._inMasonry(p2)) solid += 1;
        if (solid >= st.penetrate) break;
      }
      point = p2;
    }
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
        // is most of what the player is paying the B-1's price to see.
        { dir: down, kinetic: w.kinetic ?? 0.35, shock: st.shock ?? 2.4, eject: 0.34 });
    }
    if (this.stores) this.stores.blast(point, rMax * 1.5);
    this._samBlast(point, rMax * 1.5, w.power * this.powerScale);
    const killed = this.garrison.splash(point, rMax * 1.5, w.power);
    if (killed) {
      this.defendersKilled += killed;
      this.money += killed * MONEY_PER_DEFENDER;
      this.onEvent('bounty', { point, amount: killed * MONEY_PER_DEFENDER, kind: 'kill' });
    }
    // The bomb on the spot it was sent to, said as a stamp.
    if (!st.loiter && proj.target && Math.hypot(hit.point.x - proj.target.x, hit.point.z - proj.target.z) < 4) {
      this.onEvent('stamp', { text: 'DIRECT HIT', point: hit.point, kind: 'hit' });
    } else if (killed >= 3) {
      this.onEvent('stamp', { text: `MULTI-KILL ×${killed}`, point, kind: 'kill' });
    }
    const groundY = this.terrain.heightAt(point.x, point.z);
    const nearGround = point.y - groundY < 6.0;
    this._lastImpact = point.clone();
    // Everything under the bomb burns, and the town round it. The masonry
    // radius above is sized on the monument and falls to `minR` in the
    // street, which in town was a circle smaller than one house: a bomb into
    // a terrace took the one building it went through. In the town the
    // circle goes as the cube root of the charge, as blast does, and never
    // under the warhead's own radius: forty metres for the F-15's 500 lb,
    // forty-eight for the Tomahawk, fifty-four for the GBU-28's 5,000 lb, a
    // hundred and ten for the MOAB. Past it a ring is scorched and loosened
    // rather than gutted. A loitering gunship's rounds are shells, and keep
    // to the building they hit.
    if (this.cityFire) {
      const cityR = st.loiter ? rMax * 0.8
        : Math.max(rMax * 0.8, w.radius || 0, 0.9 * Math.cbrt(w.power || 0));
      const gutted = this.cityFire.blast(point, cityR, st.loiter ? cityR : cityR * 1.6);
      if (gutted >= 4) this.onEvent('collateral', { n: gutted, point: hit.point });
      this._streetBlast(point, st.loiter ? Math.max(8, cityR * 1.5) : cityR, !st.loiter);
    }
    // The blast is seen where the bomb went in, not fourteen metres inside
    // the stone where a penetrator actually goes off.
    this.fx.strikeBlast(hit.point, w.fx, { groundY });
    // The one bomb big enough for it gets the mushroom cloud and the white
    // shell of condensation racing out round it, and the screen whites out.
    if (w.fx >= 9 && this.fx.flourish) {
      this.fx.flourish.mushroom(point.x, groundY, point.z, w.fx / 9.5);
      this.fx.flourish.wilson(point.x, groundY, point.z, 60 + w.radius * 1.3);
      this.onEvent('megablast', { point: hit.point, fx: w.fx });
    }
    // The column stands over the site for the rest of the level, and it is
    // the thing you see from across the map. A bomb earns a bigger one than a
    // shell does, so this is not clamped to the shell's ceiling.
    // Not for a rocket: thirty-eight standing columns is a fog, not a picture.
    if (!st.loiter) {
      this.fx.dustColumn(point.x, Math.max(point.y, groundY), point.z, w.fx * 0.52);
      if (this.fires) this.fires.ignite(point.x, point.y, point.z, 3 + st.frac * 6, 40 + st.frac * 80);
    }
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
    // Rounds from a sortie that fires many add up and are reported when it
    // leaves; a bomb reports itself.
    if (proj.sortie) { proj.sortie.stones = (proj.sortie.stones || 0) + destroyed; proj.sortie.kills = (proj.sortie.kills || 0) + killed; }
    else this.onEvent('strikehit', { def: proj.strikeDef, point, destroyed, radius: rMax });
  }

  _onImpact(hit) {
    const { point, proj } = hit;
    const w = proj.warhead;
    // The gunner's own round: the spotter calls where it fell (`_spotFall`).
    const spot = proj.spot;
    if (spot) proj.spot = null;
    if (this._splash(hit, w) && !(proj.kind === 'bomb' && proj.strikeDef)) { if (spot) this._spotFall(spot, point, false); return; }
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
      if (r === 'deflect' || r === 'bite') { this._lastImpact = point.clone(); if (spot) this._spotFall(spot, point, 'deflect'); return; }
    }
    // The range's targets: a round into one, and the blast near any of them.
    if (this.range) {
      if (proj.owner && !proj.hostile) this.range.open();
      if (hit.owner && hit.owner.range) this.range.hit(hit.owner, point, w, proj.owner || null);
      this.range.blast(point, w);
      this.range.close();
    }
    // A round into a launcher or a radar itself (their colliders carry the
    // record as owner): the hit is the hit, over and above the blast that
    // follows. A revetment wall takes the round and gives nothing.
    if (this.sams && hit.owner && hit.owner.sam) {
      const pay = this.sams.directHit(hit.owner, w.power * this.powerScale);
      if (pay > 0) {
        this.money += pay;
        this.onEvent('bounty', { point, amount: Math.round(pay), kind: 'kill' });
      }
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
    // Cars in the street, whoever's round it was.
    if (w.radius >= 2) this._streetBlast(point, Math.max(6, w.radius * 1.4), false);

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

    if (this.stores) this.stores.blast(at, splashR);
    this._samBlast(at, splashR, blastPower);
    const killed = this.garrison.splash(at, splashR, power);
    if (spot) this._spotFall(spot, at, destroyed > 0 || killed > 0 || !!(hit.owner && (hit.owner.range || hit.owner.sam)));
    if (killed) {
      this.defendersKilled += killed;
      const bounty = Math.round(killed * MONEY_PER_DEFENDER * (this.bountyScale || 1));
      this.money += bounty;
      if (proj.owner) proj.owner.kills += killed;
      this.onEvent('bounty', { point: at, amount: bounty, kind: 'kill' });
    }
    if (killed >= 3) this.onEvent('stamp', { text: killed >= 6 ? `MASSACRE ×${killed}` : `MULTI-KILL ×${killed}`, point: at, kind: 'kill' });
    // The crew's record. Rounds that actually took stone out count toward
    // the next chevron; the sheaf tightens as they earn them.
    if (proj.owner && (destroyed > 0 || killed > 0)) {
      const u = proj.owner;
      u.hits += 1;
      const rank = Math.min(3, Math.floor((u.hits + u.kills * 3) / 10));
      if (rank > u.rank) { u.rank = rank; this.onEvent('rank', u); }
      // The player's own round, on the money.
      if (proj.hand) {
        const bonus = destroyed > 0 ? 500 : 250;
        this.money += bonus;
        this.onEvent('handhit', { point: at, destroyed, killed, bonus });
      }
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
      // A quiet round (the A-10's) is heard in its own recording; a hundred
      // and ten bangs of its own would only take every voice the mixer has.
      if (!proj.quiet) this.audio.play('explosion', point, {
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

  /**
   * A round into the river is a round into the river: a column of white
   * water and a ring of spray, not a fireball on the riverbed with a crater
   * under three metres of the Thames. True if it was.
   */
  _splash(hit, w) {
    const t = this.terrain, p = hit.point;
    if (!hit.groundHit) return false;
    if (!t.pondAt(p.x, p.z) && (t.hasWater === false || !Number.isFinite(t.waterLevel))) return false;
    if (!t.isWater(p.x, p.z)) return false;
    // A pond stands at a level of its own: the plume goes up off its surface.
    const wl = t.waterLevelAt(p.x, p.z);
    if (p.y > wl + 0.3) return false;
    if (this.fx.flourish) this.fx.flourish.waterPlume(p.x, wl, p.z, w.fx || 1);
    if (this.audio && !hit.proj?.quiet) this.audio.play('explosion', p, { rate: 0.62, gain: 0.45, rolloff: 300 });
    if (this.life) this.life.startle(p.x, p.z, 80);
    return true;
  }

  /**
   * A blast in the street: the cars near it are thrown and burn, and the
   * alarms on the ones further off go. A few alarms at once and no more —
   * twelve whooping at the same time is not a street, it is a fault.
   */
  _streetBlast(point, radius, big) {
    if (!this.life || !this.life.cars) return;
    const wrecks = this.life.wreck(point.x, point.z, radius);
    for (let i = 0; i < wrecks.length && i < 6; i++) {
      const q = wrecks[i];
      if (this.fires) this.fires.ignite(q.x, q.y + 0.6, q.z, 0.8, 30 + Math.random() * 30);
      // The fuel tank, a second after it lands.
      if (i < 3) this.fx.flourish?.later?.(0.6 + Math.random() * 1.4, () => {
        this._v3 = this._v3 || new THREE.Vector3();
        this.fx.detonate(this._v3.set(q.x, q.y + 0.8, q.z), 0.55, { ground: true, groundY: q.y });
      });
    }
    if (!this.audio) return;
    // Car alarms: only where a car was actually thrown, one at a time
    // across the whole town, and not for long. Every round into a street
    // used to set off up to three, four at once for up to sixteen seconds,
    // and a bombardment of a city was a wall of square-wave whooping.
    this._alarms = (this._alarms || []).filter((t) => t > this.elapsed);
    const want = wrecks.length && this._alarms.length < 1 && Math.random() < 0.5 ? 1 : 0;
    for (let k = 0; k < want; k++) {
      const a = Math.random() * Math.PI * 2, r = radius * (1.2 + Math.random() * 1.6);
      const at = { x: point.x + Math.cos(a) * r, y: point.y, z: point.z + Math.sin(a) * r };
      const dur = 3.5 + Math.random() * 3, delay = 0.3 + Math.random() * 1.8;
      carAlarm(this.audio, at, delay, dur, Math.floor(Math.random() * 3));
      this._alarms.push(this.elapsed + delay + dur);
    }
  }

  /**
   * A bomb whistles on its way down. Not the real sound of a modern bomb —
   * which is nothing, until it is everything — but the one every film has
   * taught the ear to listen for, and the last three seconds of warning
   * that something is coming are what make the arrival land. Timed from the
   * bomb's own height and speed to end on the impact.
   */
  _whistles() {
    if (!this.audio || !this.projectiles) return;
    const now = this.elapsed;
    for (const p of this.projectiles.list) {
      if (p._whistle || !p.strikeDef || p.kind !== 'bomb' || p.vel.y > -12) continue;
      const floor = p.target ? p.target.y : this.terrain.heightAt(p.pos.x, p.pos.z);
      const h = p.pos.y - floor;
      const v = -p.vel.y, g = p.drag > 0.08 ? 0 : (p.gravity ?? 9.81);
      const t = g > 0 ? (-v + Math.sqrt(v * v + 2 * g * Math.max(0, h))) / g : h / v;
      if (!(t < 3.2)) continue;
      p._whistle = true;
      // A stick of them is one whistle.
      if (now - (this._whistleAt ?? -9) < 0.9) continue;
      this._whistleAt = now;
      const d = this.camera.position.distanceTo(p.pos);
      const big = p.drag > 0.08;
      bombWhistle(this.audio, t, t, 0.13 * Math.min(1, 700 / (d + 250)), big ? 1100 : 1900, big ? 240 : 380);
    }
  }

  update(dt) {
    if (this.lay && (!this.lay.unit.alive || this.state !== 'playing')) this.endLay();
    this._spotUpdate(dt);
    this._updateSeat(dt);
    if (this.state !== 'playing') {
      // The fight is over; the sky is not. Transports still in the air fly
      // on and their loads come down, rounds in flight land, the fires burn
      // and the smoke drifts — under the collapse and behind the report,
      // rather than freezing in mid-air the moment the bar filled.
      this.air.update(dt);
      if (this.sams) this.sams.update(dt, this.elapsed);
      if (this.hq) this.hq.update(dt);
      if (this.hv) this.hv.update(dt);
      this.enemyAir.length = 0;
      this.airborne.update(dt);
      this.assault.update(dt);
      if (this.range) this.range.update(dt);
      this._refreshSkyFloor();
    this.projectiles.update(dt, this.fx, this.terrain, (h) => this._onImpact(h));
      if (this.stores) this.stores.update(dt, (st, spec) => this._storeBoom(st, spec));
      if (this.smokes) this.smokes.update(dt);
      if (this.fires) this.fires.update(dt);
      if (this.cityFire) this.cityFire.update(dt);
      if (this.tracerFX) this.tracerFX.update(dt);
      // The men on the falling masonry fall with it, and the dead lie down:
      // the garrison was frozen, standing in the air, behind the report.
      if (this.garrison) { this.garrison.reconcileStructure(this.originGround); this.garrison.sync(); }
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
    this._whistles();
    this.air.update(dt);
    if (this.sams) this.sams.update(dt, this.elapsed);
    if (this.hq) this.hq.update(dt);
    if (this.hv) this.hv.update(dt);
    if (this.garrison) {
      this.garrison.commsDown = this.commsDown;
      this.garrison.commsRof = HQ.rof;
    }
    this.enemyAir.length = 0;
    this.airborne.update(dt);
    this.assault.update(dt);
    if (this.range) this.range.update(dt);
    this._refreshSkyFloor();
    this.projectiles.update(dt, this.fx, this.terrain, (h) => this._onImpact(h));
    if (this.stores) this.stores.update(dt, (st, spec) => this._storeBoom(st, spec));

    // Money and unlocks track masonry actually brought down. Using the
    // standing-mass figure means you are paid for collapse, not for cosmetic
    // chipping — which is the behaviour the whole economy is meant to reward.
    const destroyedMass = this.structures.reduce((a, s) => a + s.demolishedMass, 0);
    const delta = destroyedMass - this._lastDestroyedMass;
    if (delta > 0) {
      // Each structure's new rubble at its own rate: the job's, or the
      // scenery's (see payScale).
      let earned = 0;
      const job = this.payScale, other = Math.min(job, 1.5);
      if (!this._paidMass) this._paidMass = new Map();
      for (const s of this.structures) {
        const m = s.demolishedMass, was = this._paidMass.get(s) ?? 0;
        if (m <= was) continue;
        this._paidMass.set(s, m);
        const rate = (s.required || s === this.primary) ? job : other;
        earned += ((m - was) / 1000) * MONEY_PER_TONNE * rate;
      }
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
    if (this.cityFire) this.cityFire.update(dt);

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
    // The turret is the garrison's heaviest gun, and holds its fire with the
    // rest of it: a test that has silenced the garrison to watch the battery
    // work had the One O'Clock Gun still shelling it to pieces.
    if (this.turret) {
      if (this.garrison?.fireEnabled === false) this.turret.update(dt, [], this.projectiles, this);
      else this.turret.update(dt, this.units, this.projectiles, this);
    }
    this.garrison.sync();
    this.tracerFX.update(dt);
    this._updateRings(dt);
    this._updateHealthBars();
    this._updateEmplacements();

    if (this._strafeLine && this._strafeLine.visible) this._drawStrafe();
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
    // Where the fire that is hurting the battery is coming from, for the
    // screen-edge flash. One report a quarter second is plenty; the flash
    // itself is what says "still".
    if (this.elapsed - (this._hitAt || -1) > 0.25) {
      const s = shots.find((k) => k.hit && k.unit);
      if (s) { this._hitAt = this.elapsed; this.onEvent('unithit', { from: s.from, unit: s.unit, damage: s.damage }); }
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
  /**
   * How far one objective has come towards its own line, nought to one.
   *
   * Lifted out of the bar's own arithmetic so that the readout beside the bar
   * can say the same kind of number the bar does. It used to print integrity
   * instead — a hundred per cent for a building nobody had touched — which
   * sat directly under a bar reading nought per cent and counted the other
   * way. Two figures, side by side, in opposite directions, neither labelled.
   * A finished objective is finished, whichever rule finished it: one brought
   * down by height counts in full, whatever its mass reads.
   */
  objectiveShare(o) {
    if (this.objectiveDone(o)) return 1;
    const need = 1 - o.win.integrity;
    return Math.max(0, Math.min(1,
      (1 - o.structure.monumentIntegrity) / Math.max(0.01, need)));
  }

  get objectiveProgress() {
    let done = 0, total = 0;
    for (const o of this.objectives) {
      const w = o.structure.totalMass;
      total += w;
      done += w * this.objectiveShare(o);
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

  /** Men of a drop still in the fight while the building is down: the win waits on them. */
  get dropsHolding() { return this._held ? [this.airborne, this.assault].reduce((n, a) => n + (a ? a.outstanding : 0), 0) : 0; }

  /** Has every objective been brought to nothing? For the readouts. */
  get flattened() { return !!this._flattened; }

  _checkEnd() {
    // A sandbox (the range) is never won or lost, and nor is a battle the
    // performance test is running in (src/ui/perftest.js).
    if (this.level?.sandbox || this.holdEnd) return;
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
    //
    // Not while a drop is in: the airborne and the counter-attack, once sent
    // for, are part of the fight until every man of them is down, whatever
    // is left of the building. The bar can be full with a brigade dug in round
    // the rubble, and the level holds until it is cleared; the survivors are
    // marked over their heads until they are down, so the last can be found.
    if (this.objectiveProgress >= Battle.WIN_AT
        || this.objectives.every((o) => this.objectiveDone(o))) {
      const drops = [this.airborne, this.assault].filter((a) => a && a.outstanding > 0);
      const left = drops.reduce((n, a) => n + a.outstanding, 0);
      // A boss is not beaten while the warlord is in his bunker (see
      // operations.js): the building down is half of it.
      const bossUp = !!(this.boss && this.hq && this.hq.alive);
      if (bossUp && !this._bossHeld) {
        this._bossHeld = true;
        this.onEvent('bossheld', { warlord: this.boss.warlord });
      }
      if (!left && !bossUp) {
        this._held = null;
        this.state = 'won';
        this.onEvent('win', this.summary());
        return;
      }
      if (!this._held) {
        this._held = { at: this.elapsed, next: this.elapsed, flush: this.elapsed };
        this.onEvent('winheld', { left });
      }
      // The ones dug in behind a block or in a gutted house are behind three
      // walls from every gun on the map; they are sent out into the open,
      // and again every few seconds for any who have gone to ground since.
      if (this.elapsed >= this._held.flush) {
        this._held.flush = this.elapsed + 8;
        for (const a of drops) a.flush();
      }
      if (this.elapsed >= this._held.next) {
        this._held.next = this.elapsed + 6;
        const points = drops.flatMap((a) => a.survivors(24));
        this.onEvent('dropsleft', { left, points });
      }
    } else if (this._held) {
      this._held = null;
    }
    // Not lost while the win only waits on the drop: the objectives are met,
    // and the income will buy something to finish it with.
    if (this._held) return;

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

  /**
   * How much masonry the player brought down for every tonne they shot, over
   * every structure that counts towards the contract.
   *
   * Summed across the objectives rather than averaged, because the question is
   * about the battle and not about each building: a player who finds the load
   * path in the campanile and then grinds the Duomo has done one clever thing
   * and one dull one, and the figure should say so.
   */
  get leverage() {
    let down = 0, shot = 0;
    for (const o of this.objectives) {
      down += o.structure.demolishedMass;
      shot += o.structure.blastMass;
    }
    if (!(shot > 1000)) return 1;
    return Math.max(1, down / shot);
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
      leverage: this.leverage,
      // For the stars (see operations.js): what the battle asked of the
      // player besides the building.
      strikes: this.strikesCalled || 0,
      samSites: this.sams?.sites?.length || 0,
      samSitesDown: this.sams?.sites ? this.sams.sites.filter((st) => st.down).length : 0,
      hqDown: !!this.hq && !this.hq.alive,
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
