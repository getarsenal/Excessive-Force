import { hasWasmSimd } from './quality.js';

/**
 * Rapier wrapper with a hard ceiling on *awake* bodies.
 *
 * The trick that makes a 7,000-stone tower playable on a phone: a stone spends
 * almost all of its life as a fixed body, which Rapier stores in the broad
 * phase but never integrates. Only stones that are actually moving cost
 * anything. So we:
 *
 *   1. build the whole structure as fixed bodies,
 *   2. promote a stone to dynamic when it's blasted or loses support,
 *   3. watch it fall, and once it has been asleep for `settleFrames`,
 *      demote it back to fixed — it becomes rubble geometry you can drive
 *      shells into, at zero simulation cost.
 *
 * Step 3 is what bounds the cost of a full collapse. Without it a toppling
 * tower ends with every stone it ever owned still integrating.
 */

let RAPIER = null;

export async function initPhysics() {
  if (RAPIER) return RAPIER;
  const mod = hasWasmSimd()
    ? await import('@dimforge/rapier3d-simd-compat')
    : await import('@dimforge/rapier3d-compat');
  await mod.default.init();
  RAPIER = mod.default;
  return RAPIER;
}

export function R() {
  if (!RAPIER) throw new Error('physics not initialised');
  return RAPIER;
}

export class PhysicsWorld {
  constructor(quality) {
    const rapier = R();
    this.rapier = rapier;
    this.quality = quality;
    this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });

    this.fixedStep = 1 / quality.physicsHz;
    this.world.integrationParameters.dt = this.fixedStep;
    // Structures need stiff contacts or tall stacks visibly sag. Trading a
    // little solver time for stack rigidity is the right call here.
    this.world.integrationParameters.numSolverIterations = 6;
    this.world.numAdditionalFrictionIterations = 2;

    this.accumulator = 0;
    this.activeBudget = quality.activeBodies;

    /** @type {Map<number, object>} rigid body handle -> owning game object */
    this.owners = new Map();
    /** bodies currently dynamic, tracked so we can recycle them */
    this.dynamicSet = new Set();

    this.eventQueue = new rapier.EventQueue(true);
    this.contactListeners = [];
    this.stepCount = 0;
  }

  get awakeCount() {
    let n = 0;
    for (const b of this.dynamicSet) if (!b.isSleeping()) n++;
    return n;
  }

  /** Register a callback fired when a tracked body lands a hard hit. */
  onImpact(fn) { this.contactListeners.push(fn); }

  createFixedBox(pos, halfExtents, quat, owner, opts = {}) {
    const rapier = this.rapier;
    const desc = rapier.RigidBodyDesc.fixed()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(quat);
    const body = this.world.createRigidBody(desc);
    const col = rapier.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setFriction(opts.friction ?? 0.92)
      .setRestitution(opts.restitution ?? 0.02)
      .setDensity(opts.density ?? 2.2);
    this.world.createCollider(col, body);
    if (owner) this.owners.set(body.handle, owner);
    return body;
  }

  /**
   * Flip a stone from fixed to dynamic. Rapier keeps the collider, so this is
   * far cheaper than destroying and recreating the body.
   */
  promote(body, impulse) {
    if (body.bodyType() !== this.rapier.RigidBodyType.Fixed) {
      if (impulse) body.applyImpulse(impulse, true);
      return true;
    }
    if (this.dynamicSet.size >= this.activeBudget) return false;

    body.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
    body.setLinearDamping(0.08);
    body.setAngularDamping(0.22);
    // Debris that settles should stay settled; a low threshold means stones
    // jitter forever in a rubble pile.
    body.setSoftCcdPrediction?.(1.0);
    if (impulse) body.applyImpulse(impulse, true);
    this.dynamicSet.add(body);
    const owner = this.owners.get(body.handle);
    if (owner) { owner.dynamic = true; owner.settleTimer = 0; }
    return true;
  }

  /** Freeze settled debris back into scenery, reclaiming simulation budget. */
  demote(body) {
    if (body.bodyType() === this.rapier.RigidBodyType.Fixed) return;
    body.setBodyType(this.rapier.RigidBodyType.Fixed, false);
    this.dynamicSet.delete(body);
    const owner = this.owners.get(body.handle);
    if (owner) { owner.dynamic = false; owner.settled = true; }
  }

  remove(body) {
    this.dynamicSet.delete(body);
    this.owners.delete(body.handle);
    this.world.removeRigidBody(body);
  }

  /**
   * Recycle the longest-settled debris when we're at budget and something more
   * interesting wants to move. Returns how many slots were freed.
   */
  reclaim(wanted) {
    if (this.dynamicSet.size + wanted <= this.activeBudget) return wanted;
    let freed = 0;
    const need = this.dynamicSet.size + wanted - this.activeBudget;
    for (const body of this.dynamicSet) {
      if (freed >= need) break;
      if (body.isSleeping()) { this.demote(body); freed++; }
    }
    return Math.min(wanted, this.activeBudget - this.dynamicSet.size);
  }

  setBudget(n) { this.activeBudget = n; }

  /**
   * Fixed-timestep stepping with a bounded catch-up. If a frame takes 200 ms
   * we deliberately drop the extra sub-steps rather than spiral.
   */
  step(dt) {
    this.accumulator += Math.min(dt, 0.1);
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < 3) {
      this.world.step(this.eventQueue);
      this.accumulator -= this.fixedStep;
      steps++;
      this.stepCount++;
    }
    if (steps === 0) return 0;

    if (this.contactListeners.length) {
      this.eventQueue.drainContactForceEvents((e) => {
        const mag = e.totalForceMagnitude();
        if (mag < 4000) return;
        const c1 = this.world.getCollider(e.collider1());
        const c2 = this.world.getCollider(e.collider2());
        const o1 = c1 && this.owners.get(c1.parent()?.handle);
        const o2 = c2 && this.owners.get(c2.parent()?.handle);
        for (const fn of this.contactListeners) fn(o1, o2, mag);
      });
    }
    return steps;
  }

  /** Sweep settled dynamic bodies back to fixed. Call once per rendered frame. */
  recycleSettled(settleFrames) {
    const toDemote = [];
    for (const body of this.dynamicSet) {
      const owner = this.owners.get(body.handle);
      if (!owner) continue;
      if (body.isSleeping()) {
        owner.settleTimer = (owner.settleTimer || 0) + 1;
        if (owner.settleTimer > settleFrames) toDemote.push(body);
      } else {
        owner.settleTimer = 0;
      }
    }
    for (const b of toDemote) this.demote(b);
    return toDemote.length;
  }

  castRay(origin, dir, maxToi, filter) {
    const rapier = this.rapier;
    const ray = new rapier.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxToi, true, undefined, undefined, undefined, undefined, filter);
    if (!hit) return null;

    // Rapier has returned the collider as an object in some versions and as a
    // handle in others; accept either rather than depending on the build.
    let collider = hit.collider;
    if (typeof collider === 'number') collider = this.world.getCollider(collider);
    if (!collider && hit.colliderHandle !== undefined) {
      collider = this.world.getCollider(hit.colliderHandle);
    }

    const toi = hit.timeOfImpact ?? hit.toi;
    return {
      toi,
      collider,
      owner: collider ? this.owners.get(collider.parent()?.handle) : null,
    };
  }

  /** Bodies whose centre lies within `radius` of `center`. */
  queryBall(center, radius, cb) {
    const rapier = this.rapier;
    const shape = new rapier.Ball(radius);
    const seen = new Set();
    this.world.intersectionsWithShape(
      center, { x: 0, y: 0, z: 0, w: 1 }, shape,
      (handle) => {
        const collider = this.world.getCollider(handle);
        const parent = collider?.parent();
        if (!parent || seen.has(parent.handle)) return true;
        seen.add(parent.handle);
        const owner = this.owners.get(parent.handle);
        if (owner) cb(owner, parent);
        return true;
      },
    );
  }
}
