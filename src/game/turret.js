import * as THREE from 'three';
import { solveArc } from './projectiles.js';

/**
 * A coastal gun turret: the twin 305 mm mounting at the Forte de Copacabana,
 * dug into the summit beside the statue.
 *
 * It is the one thing on the map that shoots *back* with real weight. The
 * garrison's mortars harass a battery; this puts two shells the size of a man
 * into a high arc and drops them on it with a twenty-odd metre burst, every
 * ten seconds or so, for as long as it has a target and a turret to fire from.
 * It turns slowly — a mounting of this weight does — so a battery that keeps
 * moving stays ahead of it, and one that digs in does not.
 *
 * It can be destroyed, and it is meant to be a problem to destroy: it is a
 * turret, and a turret is a shape designed to make shells go somewhere else.
 * Three of every four rounds that hit the dome or the barrels glance off and
 * carry on — the round is not lost, it is *deflected*, and it lands somewhere
 * else with most of its charge — and the fourth one bites. Sixteen bites and
 * the mounting is a wreck: the dome sinks and tilts, the guns droop, and a
 * fire burns in it for the rest of the match. Air strikes, which arrive from
 * above, are not deflected.
 *
 * Not masonry. The landmarks are stones on a support solver; a turret is a
 * machine, and it is drawn as one — a hemisphere and two cylinders on a
 * concrete ring — with a kinematic body under it whose colliders turn with the
 * guns, and a hit count for its health.
 */
export class CoastalTurret {
  constructor(opts) {
    const { scene, physics, terrain, fx, audio, x, z } = opts;
    this.physics = physics;
    this.terrain = terrain;
    this.fx = fx;
    this.audio = audio;
    this.scale = opts.scale ?? 1.9;
    const S = this.scale;
    this.R = 5.2 * S;                       // dome radius
    this.barrelL = 12.5 * S;
    this.barrelR = 0.45 * S;
    this.range = opts.range ?? 950;
    this.minRange = opts.minRange ?? 110;
    this.turnRate = opts.turnRate ?? 0.32;   // rad/s
    this.rof = opts.rof ?? 10.5;
    this.hp = opts.hp ?? 16;
    this.hpMax = this.hp;
    this.alive = true;
    this.deflect = opts.deflect ?? 0.75;
    this.yaw = opts.yaw ?? 0;
    this.pitch = 0.62;
    this.cooldown = 4.0;
    this.salvo = 0;                         // shells left in the current salvo
    this.salvoGap = 0;
    this.recoil = [0, 0];
    this.fired = 0;
    this.deflected = 0;
    this.bites = 0;

    const gy = terrain.heightAt(x, z);
    this.pos = new THREE.Vector3(x, gy, z);
    this.domeCentre = new THREE.Vector3(x, gy + 1.0 * S, z);

    // ── The mounting.
    const g = new THREE.Group();
    g.position.copy(this.pos);
    this.group = g;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9789, roughness: 0.95 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8e9498, roughness: 0.42, metalness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3c3f42, roughness: 0.6, metalness: 0.4 });
    const paint = new THREE.MeshStandardMaterial({ color: 0xd8c23a, roughness: 0.7 });

    // Base ring, sunk into the platform, with a yellow safety ring painted on.
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(this.R * 1.45, this.R * 1.55, 1.2 * S, 28), concrete);
    ring.position.y = 0.6 * S - 0.2;
    g.add(ring);
    const mark = new THREE.Mesh(new THREE.RingGeometry(this.R * 1.2, this.R * 1.28, 32), paint);
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 1.2 * S - 0.18;
    g.add(mark);

    // The turret proper turns as one.
    const turret = new THREE.Group();
    turret.position.y = 1.0 * S;
    g.add(turret);
    this.turret = turret;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(this.R, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), steel);
    turret.add(dome);
    // A glacis ring where the dome meets the base.
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(this.R * 1.02, this.R * 1.1, 0.9 * S, 28), dark);
    skirt.position.y = -0.1 * S;
    turret.add(skirt);

    // Two guns, on a common trunnion so they elevate together.
    const trunnion = new THREE.Group();
    trunnion.position.set(0, this.R * 0.28, 0);
    turret.add(trunnion);
    this.trunnion = trunnion;
    this.barrels = [];
    for (const s of [-1, 1]) {
      const b = new THREE.Group();
      b.position.x = s * this.R * 0.34;
      trunnion.add(b);
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(this.barrelR * 0.85, this.barrelR, this.barrelL, 14), dark);
      tube.rotation.x = Math.PI / 2;
      tube.position.z = this.barrelL / 2 + this.R * 0.55;
      b.add(tube);
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(this.barrelR * 1.5, this.barrelR * 1.5, 1.6 * S, 14), steel);
      collar.rotation.x = Math.PI / 2;
      collar.position.z = this.R * 0.55 + 0.8 * S;
      b.add(collar);
      const muzzle = new THREE.Mesh(
        new THREE.CylinderGeometry(this.barrelR * 1.15, this.barrelR * 1.15, 0.7 * S, 14), steel);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.z = this.R * 0.55 + this.barrelL - 0.35 * S;
      b.add(muzzle);
      this.barrels.push(b);
    }
    for (const m of g.children) m.castShadow = m.receiveShadow = true;
    turret.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(g);

    // ── The body. Kinematic, so the guns' colliders turn with the guns and a
    // ray still finds them; a ball for the dome, a box for each barrel.
    const rapier = physics.rapier;
    const desc = rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, this.domeCentre.y, z);
    this.body = physics.world.createRigidBody(desc);
    physics.world.createCollider(rapier.ColliderDesc.ball(this.R).setFriction(0.3), this.body);
    physics.world.createCollider(
      rapier.ColliderDesc.cylinder(0.6 * S, this.R * 1.5).setTranslation(0, -0.6 * S, 0), this.body);
    this.barrelCols = [];
    for (const s of [-1, 1]) {
      const col = physics.world.createCollider(
        rapier.ColliderDesc.cuboid(this.barrelR * 1.3, this.barrelR * 1.3, this.barrelL / 2), this.body);
      this.barrelCols.push({ col, s });
    }
    physics.owners.set(this.body.handle, this);
    this._placeColliders();
  }

  /** Where each barrel's collider sits for the current yaw and pitch. */
  _placeColliders() {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
    const pitchQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.pitch, 0, 0));
    for (const { col, s } of this.barrelCols) {
      // In the turret's frame: out along +z from the trunnion, elevated.
      const local = new THREE.Vector3(s * this.R * 0.34, this.R * 0.28, 0);
      const along = new THREE.Vector3(0, 0, this.R * 0.55 + this.barrelL / 2).applyQuaternion(pitchQ);
      local.add(along).applyQuaternion(q);
      const rot = q.clone().multiply(pitchQ);
      col.setTranslationWrtParent({ x: local.x, y: local.y, z: local.z });
      col.setRotationWrtParent({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
    }
  }

  /** Muzzle position of barrel `i` in world space. */
  muzzle(i) {
    const s = i === 0 ? -1 : 1;
    const p = new THREE.Vector3(s * this.R * 0.34, this.R * 0.28, 0);
    const pitchQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.pitch, 0, 0));
    p.add(new THREE.Vector3(0, 0, this.R * 0.55 + this.barrelL).applyQuaternion(pitchQ));
    p.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0)));
    return p.add(this.domeCentre);
  }

  update(dt, units, projectiles, battle) {
    // Recoil settles whatever else is happening.
    for (let i = 0; i < 2; i++) {
      this.recoil[i] = Math.max(0, this.recoil[i] - dt * 2.4);
      this.barrels[i].position.z = -this.recoil[i] * 1.4 * this.scale;
    }
    if (!this.alive) return;

    // The target: the nearest gun it can reach, and nothing under its own
    // walls — a mounting this size cannot depress onto the terrace below it.
    let best = null, bd = this.range * this.range;
    for (const u of units) {
      if (!u.alive) continue;
      const d = u.pos.distanceToSquared(this.pos);
      if (d < this.minRange * this.minRange) continue;
      if (d < bd) { bd = d; best = u; }
    }
    this.target = best;
    if (best) {
      const want = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const step = Math.sign(d) * Math.min(Math.abs(d), this.turnRate * dt);
      this.yaw += step;
      this.onTarget = Math.abs(d) < 0.05;
    } else {
      this.onTarget = false;
      // Nothing to shoot at: the guns come down to rest.
      this.pitch += (0.38 - this.pitch) * Math.min(1, dt * 0.6);
    }
    this.turret.rotation.y = this.yaw;
    this.trunnion.rotation.x = -this.pitch;
    this.body.setNextKinematicRotation(new THREE.Quaternion());   // the ball does not care
    this._placeColliders();

    this.cooldown -= dt;
    if (this.salvo > 0) {
      this.salvoGap -= dt;
      if (this.salvoGap <= 0 && best) this._fire(best, projectiles, battle);
      return;
    }
    if (best && this.onTarget && this.cooldown <= 0) {
      this.salvo = 2;
      this.salvoGap = 0;
    }
  }

  _fire(target, projectiles, battle) {
    const i = 2 - this.salvo;
    this.salvo--;
    this.salvoGap = 0.45;
    if (this.salvo === 0) this.cooldown = this.rof * (0.85 + Math.random() * 0.3);
    // Lead a little and scatter a little: a heavy gun suppresses a position.
    const aim = target.pos.clone();
    aim.x += (Math.random() - 0.5) * 9;
    aim.z += (Math.random() - 0.5) * 9;
    const from = this.muzzle(i);
    // Just over the least speed that reaches: the high solution at that
    // speed is a proper arc — fifty, sixty degrees — that lands in ten
    // seconds. At a fixed muzzle velocity the high solution for a target
    // three hundred metres away was a seventy-seven-degree lob that took
    // fifty seconds to come down, which is a firework, not a gun.
    const dx = aim.x - from.x, dz = aim.z - from.z, h = aim.y - from.y;
    const d = Math.hypot(dx, dz);
    const vMin = Math.sqrt(Math.max(1, 9.81 * (h + Math.hypot(h, d))));
    const SPEED = Math.max(55, vMin * 1.18);
    const vel = solveArc(from, aim, SPEED, 9.81, true);
    if (!vel) { this.salvo = 0; this.cooldown = 3; return; }
    // Elevate the guns to the solution, so the tubes point where the shell goes.
    const horiz = Math.hypot(vel.x, vel.z);
    this.pitch = THREE.MathUtils.clamp(Math.atan2(vel.y, horiz), 0.15, 1.35);
    projectiles.fire({
      pos: from, vel, gravity: 9.81, kind: 'arc', speed: SPEED,
      warhead: { lethal: 2.4, radius: 24, power: 9000, fx: 2.6 },
      owner: null, target: aim, trail: 1.3, hostile: true,
    });
    this.recoil[i] = 1;
    this.fired++;
    const dir = vel.clone().normalize();
    this.fx.muzzleFlash(from, dir, 4.5);
    this.fx.impactDust(from.x, from.y, from.z, 2.5);
    if (this.audio) this.audio.play('gun', from, { rate: 0.5, gain: 1.0, rolloff: 520 });
    if (battle && battle.engine) {
      const cd = battle.camera.position.distanceTo(from);
      battle.engine.addShake(THREE.MathUtils.clamp(40 / Math.max(cd, 40), 0.02, 0.35));
    }
  }

  /** The surface normal at a hit, from the shape rather than from the ray. */
  normalAt(point) {
    const toC = point.clone().sub(this.domeCentre);
    if (toC.length() < this.R + 0.6) return toC.normalize();
    // On a barrel: the component of the offset perpendicular to the tube.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
    const pitchQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.pitch, 0, 0));
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(pitchQ).applyQuaternion(q);
    let bestN = null, bestD = Infinity;
    for (const s of [-1, 1]) {
      const root = new THREE.Vector3(s * this.R * 0.34, this.R * 0.28, 0).applyQuaternion(q).add(this.domeCentre);
      const rel = point.clone().sub(root);
      const along = rel.dot(axis);
      const perp = rel.clone().addScaledVector(axis, -along);
      if (perp.length() < bestD) { bestD = perp.length(); bestN = perp.normalize(); }
    }
    return bestN || toC.normalize();
  }

  /**
   * A friendly round has struck the mounting. Returns 'deflect' when it
   * glanced off (the round has been re-fired along its new line), 'bite' when
   * it went in, 'wreck' when there is nothing left to protect.
   */
  hit(h, proj, battle) {
    if (!this.alive) return 'wreck';
    const { point } = h;
    if (Math.random() < this.deflect && proj.kind !== 'bomb') {
      const n = this.normalAt(point);
      const v = proj.vel.clone();
      const refl = v.sub(n.clone().multiplyScalar(2 * v.dot(n)));
      // A glance loses speed and picks up a wobble; a round that arrived at
      // a shallow angle keeps more of it.
      refl.multiplyScalar(0.5 + 0.2 * Math.random());
      refl.x += (Math.random() - 0.5) * 18;
      refl.y += Math.random() * 12;
      refl.z += (Math.random() - 0.5) * 18;
      const w = proj.warhead;
      battle.projectiles.fire({
        pos: point.clone().addScaledVector(n, 0.8), vel: refl, gravity: proj.gravity,
        kind: 'arc', warhead: { ...w, power: w.power * 0.7, radius: w.radius * 0.85 },
        owner: proj.owner, trail: 0.9, hostile: false,
      });
      this.fx.impactDust(point.x, point.y, point.z, 1.6);
      this.fx.muzzleFlash(point, n, 0.9);
      if (this.audio) this.audio.play('mg', point, { rate: 0.42, gain: 0.5, rolloff: 260, cooldown: 0.05 });
      this.deflected++;
      return 'deflect';
    }
    this.hp -= 1;
    this.bites++;
    this.fx.detonate(point, Math.min(1.4, proj.warhead.fx), { ground: false });
    if (this.audio) this.audio.play('explosion', point, { rate: 1.1, gain: 0.5, rolloff: 300 });
    if (this.hp <= 0) this._destroy(battle);
    return 'bite';
  }

  _destroy(battle) {
    this.alive = false;
    this.target = null;
    // The dome sinks and tilts, the guns droop.
    this.turret.position.y -= 1.6 * this.scale;
    this.turret.rotation.x = 0.26;
    this.turret.rotation.z = -0.18;
    this.pitch = -0.12;
    this.trunnion.rotation.x = -this.pitch;
    this.turret.traverse((m) => {
      if (m.isMesh && m.material) {
        m.material = m.material.clone();
        m.material.color.multiplyScalar(0.45);
        m.material.roughness = 0.95;
        m.material.metalness = 0.1;
      }
    });
    const c = this.domeCentre;
    this.fx.strikeBlast(c, 1.8, {});
    this.fx.detonate(c, 2.2, { ground: true, groundY: this.pos.y });
    if (battle.fires) battle.fires.ignite(c.x, c.y + this.R * 0.4, c.z, 2.6, 240);
    if (this.audio) this.audio.play('explosion', c, { rate: 0.6, gain: 1.0, rolloff: 600 });
    if (battle.audio && battle.audio.rumble) battle.audio.rumble(1, c);
    battle.engine.addShake(0.6);
    if (battle.onEvent) {
      battle.money += 600;
      battle.onEvent('bounty', { point: c.clone(), amount: 600, kind: 'kill' });
    }
  }
}
