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
export function solveBallistic(from, to, maxSpeed, gravity, maxFlight = 8.5,
  clear = null) {
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

  // `clear(vel)` is the caller's terrain-and-masonry test. Without it this is
  // the old behaviour exactly: minimum-energy loft if it lands inside the
  // flight budget, otherwise the flat shot at full charge.
  const ok = (sol) => !!sol && (!clear || clear(sol.vel));

  const charge = Math.min(maxSpeed, vMin * 1.16);
  const high = attempt(charge, true);
  if (ok(high) && high.time <= maxFlight) return high;

  const flat = attempt(maxSpeed, false);
  if (ok(flat) && flat.time > 0.05) return flat;

  // A shot that clears and takes a while beats a fast one into the hillside.
  // The flight budget is a matter of how long the player is willing to watch
  // the shell; the hill is a matter of whether there is a shot at all.
  if (ok(high)) return high;

  // Neither of the two standard charges gets over it. Walk the charge up from
  // minimum energy and take the first high arc that clears.
  //
  // Upward from the minimum and not downward from the standard loft, because
  // at exactly the minimum-energy speed the two solutions meet: that is the
  // flattest high arc there is, and every extra knot of charge makes the
  // high one steeper and longer in the air. The first arc that clears the
  // ridge is therefore also the quickest shell to arrive, which matters — a
  // battery on the flank of the Corcovado firing at the summit was putting
  // rounds up on a thirty-second flight and the match was over before the
  // first one landed.
  if (clear) {
    for (let k = 0; k <= 9; k++) {
      const sp = Math.min(maxSpeed, vMin * (1.004 + k * 0.042));
      const s = attempt(sp, true);
      if (ok(s)) return s;
    }
  }

  return high || flat;
}

/**
 * What a rocket's motor does to it after it leaves the rail.
 *
 * Shared with the projectile itself so the solver and the flight model can
 * never drift apart: a solution computed against one set of numbers and flown
 * against another is precisely the bug this pair of constants exists to stop.
 */
// A second and a half of motor at forty metres a second squared: sixty
// metres a second added after the rail, so the rocket leaves slow and is
// visibly still gathering speed a hundred metres out, which is what a rocket
// looks like and a shell does not. The total is the ceiling on how steep a
// shot can be: the minimum-energy speed at a kilometre is about a hundred,
// and whatever the motor adds is speed the rail cannot have. Ninety-odd
// left nothing on the rail for any lofted shot under thirteen hundred
// metres, and the launchers held fire at the ranges they exist for.
export const ROCKET_BOOST = { time: 1.5, accel: 40 };

/** The slowest a rocket can usefully leave the rail. Below this it is a prop. */
const MIN_LAUNCH = 18;

/**
 * Fly a boosted rocket and report where it comes down through `targetY`.
 *
 * The same integration the projectile runs, at a fixed step: the motor along
 * the launch line for its burn, then gravity alone.
 */
function flyBoosted(from, vel, gravity, targetY) {
  const dt = 1 / 60;
  let x = from.x, y = from.y, z = from.z;
  let vx = vel.x, vy = vel.y, vz = vel.z;
  const s = Math.hypot(vx, vy, vz) || 1;
  const bx = vx / s, by = vy / s, bz = vz / s;
  for (let t = 0; t < 40; t += dt) {
    if (t < ROCKET_BOOST.time) {
      const a = ROCKET_BOOST.accel * dt;
      vx += bx * a; vy += by * a; vz += bz * a;
    }
    vy -= gravity * dt;
    const prevY = y;
    x += vx * dt; y += vy * dt; z += vz * dt;
    if (vy < 0 && prevY >= targetY && y <= targetY) return { x, z, t };
  }
  return null;
}

/**
 * A firing solution for a rocket, which is not a shell.
 *
 * A rocket leaves the rail and then its motor adds eighty metres a second
 * along the launch line for the next second. Solving the trajectory
 * ballistically and lighting the motor afterwards is not an approximation, it
 * is a different shot: at a hundred metres the ballistic answer is 36 m/s at
 * sixty-six degrees, the motor turns that into 117 m/s at sixty-six degrees,
 * and the rocket lands a kilometre away. That is the launcher that "shoots up
 * in the air and lands far away", and it only does it when it is close enough
 * for the minimum-energy arc to be the steep one.
 *
 * So the burn is part of the solve. Work out the velocity the rocket needs to
 * *end the burn* with, launch it that much slower, then fly the result and
 * walk the aim point back by however far it went long — the burn also carries
 * it forward while it is running, which no closed form is going to capture.
 * Two or three passes settle it to within a couple of metres.
 *
 * Inside minimum range there is no answer: the motor alone carries the rocket
 * further than the target, and no launch speed can be low enough. The crew is
 * told so and holds its fire, which is what a real battery does with a target
 * inside its minimum range.
 */
export function solveBoosted(from, to, maxSpeed, gravity, maxFlight = 9.0, clear = null) {
  const dv = ROCKET_BOOST.accel * ROCKET_BOOST.time;
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 1) return null;
  const ux = dx / d, uz = dz / d;
  const hi = maxSpeed - dv;
  if (hi <= MIN_LAUNCH) return null;
  // The launch, at an elevation and a speed.
  const vel = (v, th) => new THREE.Vector3(ux * Math.cos(th) * v, Math.sin(th) * v, uz * Math.cos(th) * v);
  // Where the boosted rocket comes down, as a distance along the line.
  const reach = (v, th) => {
    const land = flyBoosted(from, vel(v, th), gravity, to.y);
    if (land) return { d: (land.x - from.x) * ux + (land.z - from.z) * uz, t: land.t };
    // No landing: either the rocket never climbed to the target's height —
    // too slow, count it as short — or it was still up after forty seconds
    // — too fast, count it as long. Both are the same bisection told which
    // way to go. (Judging by the boosted speed, not the launch speed.)
    const vy = Math.sin(th) * (v + dv);
    const apex = from.y + (vy * vy) / (2 * gravity);
    return { d: apex < to.y ? -Infinity : Infinity, t: Infinity };
  };
  // For a given elevation the range grows with the launch speed, so the speed
  // that lands on the point is a bisection. The elevations are tried from the
  // flattest up: the first that has the point inside its window is the
  // quickest rocket that can be laid on it. The old walk-back — take the
  // flat ballistic solution, fly it boosted, move the aim by the overshoot —
  // moved the aim to inside minimum range on any shot the flat solution
  // overshot by more than the range, which was every shot past eight
  // hundred metres, and the launchers held fire at the very ranges they
  // exist for.
  // Flattest first; the steep ones are for when something is in the way, and
  // `clear` is the caller's terrain-and-masonry test on the boosted flight.
  const angles = [0.07, 0.12, 0.2, 0.3, 0.42, 0.56, 0.72, 0.88, 1.02, 1.12];
  for (const th of angles) {
    const lo = reach(MIN_LAUNCH, th), up = reach(hi, th);
    if (lo.d > d + 2) continue;          // even the slowest launch overshoots at this elevation
    if (up.d < d - 2) continue;          // out of range at this elevation
    let a = MIN_LAUNCH, b = hi;
    for (let k = 0; k < 22; k++) {
      const m = (a + b) / 2;
      const r = reach(m, th);
      if (r.d < d) a = m; else b = m;
    }
    const v = (a + b) / 2;
    const r = reach(v, th);
    if (Math.abs(r.d - d) > 4) continue;
    if (r.t > maxFlight * 1.6) continue;
    const out = vel(v, th);
    if (clear && !clear(vel(v + dv, th))) continue;
    return out;
  }
  return null;
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
    // Bombs slow in the air: a light drag on a slick 500-pounder, a heavy one
    // on the MOAB under its parachute.
    this.drag = opts.drag ?? 0;
    // The unit definition behind an air-dropped bomb, for the strike logic.
    this.strikeDef = opts.strikeDef ?? null;
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
      this._lastRange = Infinity;
    }
    if (this.kind === 'rocket') {
      this.boostTime = ROCKET_BOOST.time;
      this.boostAccel = ROCKET_BOOST.accel;
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
      if (this.drag > 0) this.vel.addScaledVector(this.vel, -this.drag * dt);
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
    // Unguided once it is there, which is the whole of the fix for a round
    // that used to stop in mid-air.
    //
    // A designated point whose masonry has since been shot away is empty sky.
    // A seeker that keeps steering at it arrives, finds nothing to hit, and
    // then has its own guidance drive its velocity to zero against a target it
    // is already standing on — so the shell hangs there, on the targeting
    // marker, in the open. Past the aim point it is a falling object like any
    // other: it carries on and goes off against whatever is underneath.
    const toTarget = new THREE.Vector3().subVectors(t, this.pos);
    const range = toTarget.length();
    if (this.phase === 'free' || range < 2.5 || range > this._lastRange + 0.01) {
      this.phase = 'free';
      if (this.vel.lengthSq() < 4) this.vel.set(0, -this.speed, 0);
      this.vel.y -= this.gravity * dt;
      this.pos.addScaledVector(this.vel, dt);
      return;
    }
    this._lastRange = range;
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
      let owner = null;

      if (dist > 0.0001) {
        const dir = delta.clone().multiplyScalar(1 / dist);
        const res = this.physics.castRay(
          { x: a.x, y: a.y, z: a.z },
          { x: dir.x, y: dir.y, z: dir.z },
          dist,
        );
        // A round does not hit the thing that fired it: the turret's shells
        // leave from inside its own barrel collider.
        if (res && !(res.owner && res.owner === p.owner)) {
          hitPoint = a.clone().addScaledVector(dir, Math.max(0, res.toi - 0.05));
          structureHit = true;
          owner = res.owner || null;
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
        onHit({ point: hitPoint, proj: p, structureHit, groundHit: !structureHit, owner });
        continue;
      }

      if (p.pos.y < -200) { p.alive = false; continue; }

      if (write < 256) {
        this._scale.setScalar(p.kind === 'bomb' ? (p.drag > 0.08 ? 4.5 : 2.2) : 1);
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

// For the harness and a console session: the rocket solve, to hand.
if (typeof window !== 'undefined') Object.assign(window, { __solveBoosted: solveBoosted, __flyBoosted: flyBoosted, __ROCKET_BOOST: ROCKET_BOOST });
