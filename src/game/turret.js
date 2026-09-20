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
    this.scale = opts.scale ?? 1.4;
    const S = this.scale;
    this.R = 5.2 * S;                       // dome radius
    this.barrelL = 12.5 * S;
    this.barrelR = 0.45 * S;
    this.range = opts.range ?? 950;
    this.minRange = opts.minRange ?? 110;
    this.turnRate = opts.turnRate ?? 0.22;   // rad/s: a quarter turn in seven seconds
    this.rof = opts.rof ?? 10.5;
    this.hp = opts.hp ?? 16;
    this.hpMax = this.hp;
    this.alive = true;
    this.deflect = opts.deflect ?? 0.75;
    this.yaw = opts.yaw ?? 0;
    this.cooldown = 4.0;
    this.salvo = 0;                         // shells left in the current salvo
    this.salvoGap = 0;
    this.recoil = [0, 0];
    this.fired = 0;
    this.deflected = 0;
    this.bites = 0;

    const gy = terrain.heightAt(x, z);
    this.pos = new THREE.Vector3(x, gy, z);
    // Dug in. The dome's centre is half a radius under the apron, so what
    // shows is the cap — the photograph is a low steel hump on a paved
    // platform with the guns coming out of its face at knee height, not a
    // globe standing on a drum.
    this.domeCentre = new THREE.Vector3(x, gy - 0.5 * this.R, z);
    this.trunnionY = 0.85 * this.R;         // above the dome centre: just over the apron
    this.pitchTarget = 0.25;
    this.pitch = 0.25;

    // ── The mounting.
    const g = new THREE.Group();
    g.position.copy(this.pos);
    this.group = g;
    const R = this.R;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9789, roughness: 0.95 });
    const cracked = new THREE.MeshStandardMaterial({ color: 0x7e7b70, roughness: 0.97 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8e9498, roughness: 0.42, metalness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3c3f42, roughness: 0.6, metalness: 0.4 });
    const paint = new THREE.MeshStandardMaterial({ color: 0xd8c23a, roughness: 0.7 });
    const bag = new THREE.MeshStandardMaterial({ color: 0x6b6a4e, roughness: 1.0 });
    const rust = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9, metalness: 0.3 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.95 });
    const rnd = (() => { let t = 0x9e3779b9; return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296); })();

    // The apron: a flush concrete platform, flagged with the yellow lines the
    // photograph has, cracked and patched.
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(R * 2.3, R * 2.4, 0.5, 24), concrete);
    apron.position.y = 0.05;
    g.add(apron);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.22, R * 1.32, 40), paint);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.32;
    g.add(ring);
    for (const sgn of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, R * 3.6), paint);
      line.position.set(sgn * R * 1.75, 0.32, 0);
      g.add(line);
    }
    for (let i = 0; i < 9; i++) {
      // Cracks: thin dark slivers across the apron.
      const len = 1.5 + rnd() * 4;
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, len), cracked);
      const a = rnd() * Math.PI * 2, r = R * (1.4 + rnd() * 0.85);
      crack.position.set(Math.cos(a) * r, 0.31, Math.sin(a) * r);
      crack.rotation.y = rnd() * Math.PI;
      g.add(crack);
    }
    // Two patched slabs, a shade off.
    for (let i = 0; i < 2; i++) {
      const patch = new THREE.Mesh(new THREE.BoxGeometry(2.4 + rnd() * 2, 0.06, 2 + rnd() * 2), cracked);
      const a = rnd() * Math.PI * 2, r = R * (1.6 + rnd() * 0.6);
      patch.position.set(Math.cos(a) * r, 0.31, Math.sin(a) * r);
      patch.rotation.y = rnd() * Math.PI;
      g.add(patch);
    }

    // The turret proper turns as one, on the sunk centre.
    const turret = new THREE.Group();
    turret.position.y = this.domeCentre.y - gy;
    g.add(turret);
    this.turret = turret;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), steel);
    turret.add(dome);
    // A seam ring round the cap where the armour plates meet.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(R * 0.86, 0.09, 6, 40), dark);
    seam.rotation.x = Math.PI / 2; seam.position.y = R * 0.5;
    turret.add(seam);
    // The collar the dome turns in, flush with the apron.
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.06, R * 1.06, 0.35, 32), dark);
    collar.position.y = 0.5 * R + 0.35;
    turret.add(collar);

    // Two guns, on a common trunnion just over the apron, coming out of the
    // dome's face.
    const trunnion = new THREE.Group();
    trunnion.position.set(0, this.trunnionY, 0);
    turret.add(trunnion);
    this.trunnion = trunnion;
    this.barrels = [];
    const root = R * 0.42;                  // where the tube leaves the dome
    for (const sgn of [-1, 1]) {
      const b = new THREE.Group();
      b.position.x = sgn * R * 0.30;
      trunnion.add(b);
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(this.barrelR * 0.82, this.barrelR, this.barrelL, 14), rust);
      tube.rotation.x = Math.PI / 2;
      tube.position.z = root + this.barrelL / 2;
      b.add(tube);
      const shroud = new THREE.Mesh(
        new THREE.CylinderGeometry(this.barrelR * 1.7, this.barrelR * 1.9, 2.2 * this.scale, 14), steel);
      shroud.rotation.x = Math.PI / 2;
      shroud.position.z = root + 1.1 * this.scale;
      b.add(shroud);
      const muzzle = new THREE.Mesh(
        new THREE.CylinderGeometry(this.barrelR * 1.1, this.barrelR * 1.1, 0.6 * this.scale, 14), dark);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.z = root + this.barrelL - 0.3 * this.scale;
      b.add(muzzle);
      this.barrels.push(b);
    }
    this.barrelRoot = root;

    // ── Dug in round it: a sandbag parapet on the sides and the rear, barbed
    // wire outside that, broken concrete, an ammunition hatch and crates by
    // the rear entrance. The front — the way the guns fire — is left open.
    const front = this.yaw;                 // bearing the guns face at rest
    const rearward = (a) => {
      let d = a - (front + Math.PI);
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d);
    };
    const bagR = R * 2.55;
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const toFront = Math.PI - rearward(a);
      if (toFront < 0.75) continue;                       // the embrasure
      if (rearward(a) < 0.22) continue;                   // the way in
      for (let row = 0; row < 2; row++) {
        const rr = bagR + (row === 1 ? 0.15 : 0);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 0.55), bag);
        m.position.set(Math.cos(a + row * 0.035) * rr, 0.5 + 0.21 + row * 0.4, Math.sin(a + row * 0.035) * rr);
        m.rotation.y = -a + Math.PI / 2 + (rnd() - 0.5) * 0.15;
        m.rotation.z = (rnd() - 0.5) * 0.08;
        g.add(m);
      }
    }
    // Barbed wire: posts with three strands, a gap at the rear.
    const wireR = R * 3.1;
    const POSTS = 14;
    const postAt = [];
    for (let i = 0; i < POSTS; i++) {
      const a = (i / POSTS) * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * wireR, 0, Math.sin(a) * wireR);
      p.y = terrain.heightAt(x + p.x, z + p.z) - gy;
      postAt.push({ a, p, gap: rearward(a) < 0.25 });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 6), timber);
      post.position.set(p.x, p.y + 0.75, p.z);
      post.rotation.z = (rnd() - 0.5) * 0.12;
      g.add(post);
    }
    for (let i = 0; i < POSTS; i++) {
      const a = postAt[i], b = postAt[(i + 1) % POSTS];
      if (a.gap || b.gap) continue;
      for (const h of [0.45, 0.85, 1.3]) {
        const seg = b.p.clone().sub(a.p);
        const L = seg.length();
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 4), dark);
        const mid = a.p.clone().lerp(b.p, 0.5);
        wire.position.set(mid.x, mid.y + h - 0.04 * Math.sin(h), mid.z);
        wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), seg.clone().normalize());
        g.add(wire);
      }
    }
    // Broken concrete, half sunk, at odd angles.
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2, r = R * (2.4 + rnd() * 0.9);
      if (rearward(a) < 0.3) continue;
      const w = 1.2 + rnd() * 2.2, h = 0.6 + rnd() * 0.9, d = 1.0 + rnd() * 1.8;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cracked);
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      m.position.set(px, terrain.heightAt(x + px, z + pz) - gy + h * 0.25, pz);
      m.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
      g.add(m);
    }
    // The way in: a steel hatch flush in the apron, crates beside it.
    {
      const a = front + Math.PI;
      const hx = Math.cos(a) * R * 1.75, hz = Math.sin(a) * R * 1.75;
      const hatch = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 2.2), dark);
      hatch.position.set(hx, 0.38, hz); hatch.rotation.y = -a;
      g.add(hatch);
      for (let i = 0; i < 5; i++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.7), bag);
        const off = (i - 2) * 1.25;
        crate.position.set(hx + Math.cos(a + Math.PI / 2) * off + Math.cos(a) * 2.6,
          0.5 + 0.25 + (i === 2 ? 0.5 : 0), hz + Math.sin(a + Math.PI / 2) * off + Math.sin(a) * 2.6);
        crate.rotation.y = -a + (rnd() - 0.5) * 0.3;
        g.add(crate);
      }
    }
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(g);

    // ── The body. Kinematic, so the guns' colliders turn with the guns and a
    // ray still finds them; a ball for the dome, a box for each barrel.
    const rapier = physics.rapier;
    const desc = rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, this.domeCentre.y, z);
    this.body = physics.world.createRigidBody(desc);
    physics.world.createCollider(rapier.ColliderDesc.ball(this.R).setFriction(0.3), this.body);
    this.barrelCols = [];
    for (const sgn of [-1, 1]) {
      const col = physics.world.createCollider(
        rapier.ColliderDesc.cuboid(this.barrelR * 1.3, this.barrelR * 1.3, this.barrelL / 2), this.body);
      this.barrelCols.push({ col, s: sgn });
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
      const local = new THREE.Vector3(s * this.R * 0.30, this.trunnionY, 0);
      const along = new THREE.Vector3(0, 0, this.barrelRoot + this.barrelL / 2).applyQuaternion(pitchQ);
      local.add(along).applyQuaternion(q);
      const rot = q.clone().multiply(pitchQ);
      col.setTranslationWrtParent({ x: local.x, y: local.y, z: local.z });
      col.setRotationWrtParent({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
    }
  }

  /** Muzzle position of barrel `i` in world space. */
  muzzle(i) {
    const s = i === 0 ? -1 : 1;
    const p = new THREE.Vector3(s * this.R * 0.30, this.trunnionY, 0);
    const pitchQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.pitch, 0, 0));
    p.add(new THREE.Vector3(0, 0, this.barrelRoot + this.barrelL).applyQuaternion(pitchQ));
    p.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0)));
    return p.add(this.domeCentre);
  }

  /** The direction the barrels point, in world space. */
  barrelDir() {
    const pitchQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.pitch, 0, 0));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
    return new THREE.Vector3(0, 0, 1).applyQuaternion(pitchQ).applyQuaternion(q);
  }

  /**
   * The firing solution for a target from the guns as they are now: the
   * bearing, the elevation and the speed. Just over the least speed that
   * reaches, so the high solution is a proper arc — fifty, sixty degrees —
   * that lands in ten seconds. At a fixed muzzle velocity the high solution
   * for a target three hundred metres away was a seventy-seven-degree lob
   * that took fifty seconds to come down, which is a firework, not a gun.
   */
  solution(aim) {
    const from = this.muzzle(0).lerp(this.muzzle(1), 0.5);
    const dx = aim.x - from.x, dz = aim.z - from.z, h = aim.y - from.y;
    const d = Math.hypot(dx, dz);
    const vMin = Math.sqrt(Math.max(1, 9.81 * (h + Math.hypot(h, d))));
    const speed = Math.max(55, vMin * 1.18);
    const vel = solveArc(from, aim, speed, 9.81, true);
    if (!vel) return null;
    return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(vel.y, Math.hypot(vel.x, vel.z)), speed };
  }

  update(dt, units, projectiles, battle) {
    // Recoil settles whatever else is happening.
    for (let i = 0; i < 2; i++) {
      this.recoil[i] = Math.max(0, this.recoil[i] - dt * 2.4);
      this.barrels[i].position.z = -this.recoil[i] * 1.3 * this.scale;
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

    // Both axes slew, slowly, to the solution — the mounting weighs what it
    // weighs — and the guns fire only when they are pointing where the shell
    // is going, so the round leaves the muzzle along the tube.
    let wantYaw = this.yaw, wantPitch = 0.25;
    if (best) {
      const sol = this.solution(best.pos);
      if (sol) { wantYaw = sol.yaw; wantPitch = THREE.MathUtils.clamp(sol.pitch, 0.12, 1.25); this._speed = sol.speed; }
    }
    let dy = wantYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += Math.sign(dy) * Math.min(Math.abs(dy), this.turnRate * dt);
    const dp = wantPitch - this.pitch;
    this.pitch += Math.sign(dp) * Math.min(Math.abs(dp), this.turnRate * 0.8 * dt);
    this.onTarget = !!best && Math.abs(dy) < 0.04 && Math.abs(dp) < 0.03;

    this.turret.rotation.y = this.yaw;
    this.trunnion.rotation.x = -this.pitch;
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
    // Out of the tube, along the tube: the guns are already laid on the
    // solution, so the shell is the solution's speed along the barrel's own
    // line, with a little scatter — a heavy gun suppresses a position.
    const from = this.muzzle(i);
    const dir = this.barrelDir();
    dir.x += (Math.random() - 0.5) * 0.02;
    dir.z += (Math.random() - 0.5) * 0.02;
    dir.normalize();
    const speed = (this._speed || 120) * (0.995 + Math.random() * 0.01);
    const vel = dir.clone().multiplyScalar(speed);
    // Spawned a little past the muzzle, and owned by the mounting, so the
    // first thing the round's ray finds is not the barrel it came out of.
    projectiles.fire({
      pos: from.clone().addScaledVector(dir, 1.5), vel, gravity: 9.81, kind: 'arc', speed,
      warhead: { lethal: 2.4, radius: 24, power: 9000, fx: 2.6 },
      owner: this, target: target.pos.clone(), trail: 1.3, hostile: true,
    });
    this.recoil[i] = 1;
    this.fired++;
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
      const root = new THREE.Vector3(s * this.R * 0.30, this.trunnionY, 0).applyQuaternion(q).add(this.domeCentre);
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
    this.turret.position.y -= 0.9 * this.scale;
    this.turret.rotation.x = 0.22;
    this.turret.rotation.z = -0.16;
    this.pitch = -0.1;
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
