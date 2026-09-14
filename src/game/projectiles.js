import * as THREE from 'three';

/**
 * Projectiles and firing solutions.
 *
 * Shells are integrated, not lerped along a path: each one is a position and a
 * velocity under gravity, so a round that clears the parapet by a metre really
 * did clear it, and a short round really does fall in the river. Guns solve for
 * the launch angle that puts the shell on the aim point, then apply dispersion
 * to the *solution*, which is why a howitzer's misses scatter along the line of
 * fire rather than in a circle.
 */

/**
 * Launch angle for a ballistic arc.
 *
 * Solving v⁴ - g(g·d² + 2·h·v²) for θ gives the two classic solutions; we take
 * the high arc for howitzers because plunging fire is both correct and far more
 * useful against a tower — a flat trajectory just hits the near wall.
 *
 * @returns {THREE.Vector3|null} launch velocity, or null if out of range
 */
export function solveArc(from, to, speed, gravity, high = true) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  const h = to.y - from.y;

  if (d < 0.001) {
    return new THREE.Vector3(0, high ? speed : -speed, 0);
  }

  const v2 = speed * speed;
  const disc = v2 * v2 - gravity * (gravity * d * d + 2 * h * v2);
  if (disc < 0) return null; // genuinely beyond the gun's reach

  const root = Math.sqrt(disc);
  const tanTheta = (v2 + (high ? root : -root)) / (gravity * d);
  const theta = Math.atan(tanTheta);

  const horiz = Math.cos(theta) * speed;
  const vert = Math.sin(theta) * speed;
  return new THREE.Vector3((dx / d) * horiz, vert, (dz / d) * horiz);
}

/**
 * Pick a firing solution the way a gun crew would.
 *
 * Firing a 175 m/s howitzer at a target 170 m away on the high arc throws the
 * shell almost straight up and it is gone for the better part of a minute.
 * Real crews don't do that — they drop to a lower charge so the trajectory
 * suits the range. So: work out the minimum velocity that reaches the target,
 * load slightly above it, and take the high arc. That gives the plunging fire
 * you want against a tower, with a sane time of flight.
 *
 * If even that leaves the shell hanging too long (long shots, where the
 * minimum-energy arc is genuinely slow), switch to full charge on the flat
 * arc instead.
 *
 * @returns {{vel: THREE.Vector3, speed: number, time: number}|null}
 */
export function solveBallistic(from, to, maxSpeed, gravity, maxFlight = 8.5) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  const h = to.y - from.y;

  // Minimum-energy launch speed for this range and height difference.
  const vMin = Math.sqrt(Math.max(1, gravity * (h + Math.hypot(h, d))));
  if (vMin > maxSpeed) return null; // genuinely out of range

  const attempt = (speed, high) => {
    const vel = solveArc(from, to, speed, gravity, high);
    if (!vel) return null;
    const horiz = Math.hypot(vel.x, vel.z);
    const time = horiz > 0.01 ? d / horiz : 0;
    return { vel, speed, time };
  };

  const charge = Math.min(maxSpeed, vMin * 1.16);
  const high = attempt(charge, true);
  if (high && high.time <= maxFlight) return high;

  const flat = attempt(maxSpeed, false);
  if (flat && flat.time > 0.05) return flat;

  return high || flat;
}

/** Flat-ish direct fire: aim straight, with a small lead for the drop. */
export function solveDirect(from, to, speed, gravity) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const dist = delta.length();
  const flight = dist / speed;
  // Aim above the target by the drop it will accrue.
  const aim = to.clone();
  aim.y += 0.5 * gravity * flight * flight;
  return aim.sub(from).normalize().multiplyScalar(speed);
}

let PROJ_ID = 0;

export class Projectile {
  constructor(opts) {
    this.id = ++PROJ_ID;
    this.pos = opts.pos.clone();
    this.vel = opts.vel.clone();
    this.gravity = opts.gravity ?? 9.81;
    this.kind = opts.kind ?? 'arc';
    this.warhead = opts.warhead;
    this.owner = opts.owner ?? null;
    this.hostile = !!opts.hostile;
    this.target = opts.target ? opts.target.clone() : null;
    this.trailRate = opts.trail ?? 0.6;
    this.age = 0;
    this.alive = true;
    this._trailAcc = 0;
    this._prev = this.pos.clone();

    // Top-attack missiles climb to an apex above the target, then dive. The
    // profile is scripted because that is what the real seeker does.
    if (this.kind === 'topattack' && this.target) {
      this.apexY = Math.max(this.pos.y, this.target.y) + 55;
      this.phase = 'climb';
      this.vel.set(0, opts.speed ?? 145, 0);
      this.speed = opts.speed ?? 145;
    }
    if (this.kind === 'rocket') {
      this.boostTime = 0.85;
      this.boostAccel = 95;
      this.boostDir = this.vel.clone().normalize();
    }
  }

  /** @returns {'flying'|'hit'} */
  step(dt, fx) {
    this.age += dt;
    this._prev.copy(this.pos);

    if (this.kind === 'topattack') {
      this._stepTopAttack(dt);
    } else {
      if (this.kind === 'rocket' && this.age < this.boostTime) {
        this.vel.addScaledVector(this.boostDir, this.boostAccel * dt);
      }
      this.vel.y -= this.gravity * dt;
      this.pos.addScaledVector(this.vel, dt);
    }

    if (fx && this.trailRate > 0) {
      this._trailAcc += dt;
      const interval = 0.026 / this.trailRate;
      while (this._trailAcc > interval) {
        this._trailAcc -= interval;
        fx.trail(this.pos, this.trailRate);
      }
    }

    if (this.age > 30) this.alive = false;
    return this.alive ? 'flying' : 'hit';
  }

  _stepTopAttack(dt) {
    const t = this.target;
    if (this.phase === 'climb') {
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y >= this.apexY) {
        this.phase = 'dive';
        // Pitch over onto the target from directly above.
        const above = new THREE.Vector3(t.x, this.pos.y, t.z);
        this.pos.copy(above);
        this.vel.set(0, -this.speed * 1.25, 0);
      }
      return;
    }
    // Dive: steer hard toward the aim point.
    const toTarget = new THREE.Vector3().subVectors(t, this.pos);
    const desired = toTarget.normalize().multiplyScalar(this.speed * 1.35);
    this.vel.lerp(desired, Math.min(1, dt * 7));
    this.pos.addScaledVector(this.vel, dt);
  }

  get segment() { return [this._prev, this.pos]; }
}

/**
 * Manages every shell in flight, including the swept collision test.
 *
 * Shells move far enough per frame (a HIMARS rocket covers ~6 m at 60 fps)
 * that a point test would tunnel straight through a wall, so each step is a
 * raycast along the segment actually travelled.
 */
export class ProjectileManager {
  constructor(scene, physics, quality) {
    this.scene = scene;
    this.physics = physics;
    this.list = [];

    const geo = new THREE.SphereGeometry(0.42, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, 256);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);
    this._m4 = new THREE.Matrix4();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._q = new THREE.Quaternion();
  }

  fire(opts) {
    if (this.list.length > 220) return null;
    const p = new Projectile(opts);
    this.list.push(p);
    return p;
  }

  /**
   * @param {(hit:{point:THREE.Vector3, proj:Projectile, structureHit:boolean, groundHit:boolean})=>void} onHit
   */
  update(dt, fx, terrain, onHit) {
    const rapier = this.physics.rapier;
    let write = 0;

    for (const p of this.list) {
      if (!p.alive) continue;
      p.step(dt, fx);

      const [a, b] = p.segment;
      const delta = new THREE.Vector3().subVectors(b, a);
      const dist = delta.length();

      let hitPoint = null;
      let structureHit = false;

      if (dist > 0.0001) {
        const dir = delta.clone().multiplyScalar(1 / dist);
        const res = this.physics.castRay(
          { x: a.x, y: a.y, z: a.z },
          { x: dir.x, y: dir.y, z: dir.z },
          dist,
        );
        if (res) {
          hitPoint = a.clone().addScaledVector(dir, Math.max(0, res.toi - 0.05));
          structureHit = true;
        }
      }

      // The heightfield is in the physics world too, but a shell can pass over
      // its edge; a direct terrain test is the backstop.
      if (!hitPoint && terrain) {
        const gh = terrain.heightAt(b.x, b.z);
        if (b.y <= gh) {
          const prevGh = terrain.heightAt(a.x, a.z);
          const t = (a.y - prevGh) / Math.max(1e-4, (a.y - prevGh) - (b.y - gh));
          hitPoint = a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1));
          hitPoint.y = terrain.heightAt(hitPoint.x, hitPoint.z);
        }
      }

      if (hitPoint) {
        p.alive = false;
        onHit({ point: hitPoint, proj: p, structureHit, groundHit: !structureHit });
        continue;
      }

      if (p.pos.y < -200) { p.alive = false; continue; }

      if (write < 256) {
        this._m4.compose(p.pos, this._q, this._scale);
        this.mesh.setMatrixAt(write, this._m4);
        // Incoming rounds burn red so the player can tell at a glance which
        // way a shell is going.
        if (p.hostile) this.mesh.instanceColor.setXYZ(write, 1.0, 0.34, 0.18);
        else this.mesh.instanceColor.setXYZ(write, 1.0, 0.85, 0.63);
        write++;
      }
    }

    this.mesh.count = Math.min(write, 256);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.list = this.list.filter((p) => p.alive);
  }

  get inFlight() { return this.list.length; }
}
