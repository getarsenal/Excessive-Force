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
    // Marked before the removal, and checked by anything that keeps its own
    // reference to a body. Rapier hands out wrappers around raw indices, so
    // calling any method on one after its body is gone traps in wasm — and a
    // wasm trap leaves the world permanently borrowed, so every `step` after
    // it throws "recursive use of an object detected" and the simulation is
    // over. There is no API to ask a body whether it still exists, so we have
    // to remember.
    body.__removed = true;
    this.world.removeRigidBody(body);
  }

  /** Is this body still in the world? */
  static alive(body) { return !!body && body.__removed !== true; }

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

    // Second pass: bodies that have stopped without being asleep.
    //
    // Rapier only sleeps a body that has been still for a while, and the debris
    // from a collapse is a heap of several hundred pieces jostling each other —
    // each nudge resets its neighbours' timers, so a pile can shuffle gently for
    // a very long time without a single body ever qualifying. Waiting for sleep
    // therefore meant the budget stayed full of settled rubble, nothing could
    // be reclaimed, and the fragmenter had no room to break up the sections
    // that were still welded: on a phone that left a four-hundred-stone piece
    // of tower lying on the ground in one piece.
    //
    // A third of a metre a second is slow enough that freezing it there is
    // invisible, and nothing in free fall stays under it for more than a frame
    // or two.
    if (freed < need) {
      for (const body of this.dynamicSet) {
        if (freed >= need) break;
        const v = body.linvel(), w = body.angvel();
        if (Math.hypot(v.x, v.y, v.z) > 0.34) continue;
        if (Math.hypot(w.x, w.y, w.z) > 0.5) continue;
        this.demote(body);
        freed++;
      }
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
      // Collect first, dispatch after.
      //
      // `drainContactForceEvents` holds a Rust borrow on the whole world for as
      // long as it is running, and wasm-bindgen enforces that: touching the
      // world from inside the callback aborts the process with "recursive use
      // of an object detected which would lead to unsafe aliasing". The
      // listeners on the other side of this are not passive — a hard landing
      // shatters a welded section, which destroys one rigid body and builds
      // several more — so calling them in place is calling into the world from
      // inside the borrow, and it takes the whole simulation down with it.
      //
      // Nothing is resolved inside the callback either, not even a collider
      // lookup: the handles are numbers, and numbers can be carried out.
      const raw = this._contactBuf || (this._contactBuf = []);
      raw.length = 0;
      this.eventQueue.drainContactForceEvents((e) => {
        const mag = e.totalForceMagnitude();
        if (mag < 4000) return;
        raw.push(e.collider1(), e.collider2(), mag);
      });
      for (let i = 0; i < raw.length; i += 3) {
        const c1 = this.world.getCollider(raw[i]);
        const c2 = this.world.getCollider(raw[i + 1]);
        const o1 = c1 && this.owners.get(c1.parent()?.handle);
        const o2 = c2 && this.owners.get(c2.parent()?.handle);
        for (const fn of this.contactListeners) fn(o1, o2, raw[i + 2]);
      }
      raw.length = 0;
    }
    return steps;
  }

  /** Sweep settled dynamic bodies back to fixed. Call once per rendered frame. */
  /**
   * Catch debris that has run away.
   *
   * A stone wedged inside another when it is promoted to dynamic gets a
   * penetration-recovery push that can be enormous, and once one piece is doing
   * four hundred metres a second it takes whatever it touches with it. Every so
   * often the whole map ends up with masonry kilometres from where it started —
   * invisible in play, but it wrecks anything that reasons about where the
   * building *is*, and it is a fair amount of simulation spent on nothing.
   *
   * Nothing legitimate in this game moves faster than a rocket, so anything
   * that does is clamped, and anything that has left the map is removed.
   */
  cullRunaways(bounds) {
    const dead = [];
    let clamped = 0;
    for (const body of this.dynamicSet) {
      if (body.isSleeping()) continue;
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      // 120 m/s is comfortably above anything a blast legitimately imparts —
      // the heaviest warhead in the game throws stone at about ninety.
      if (speed > 120) {
        const k = 120 / speed;
        body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
        clamped++;
      }
      const t = body.translation();
      if (!isFinite(t.x) || !isFinite(t.y) || !isFinite(t.z)
          || t.y < -240 || t.y > 900
          || Math.abs(t.x) > bounds || Math.abs(t.z) > bounds) {
        dead.push(body);
      }
    }
    for (const b of dead) {
      const owner = this.owners.get(b.handle);
      if (owner && owner.structure && owner.chunk !== undefined) {
        owner.structure.destroyChunk(owner.chunk);
      } else {
        this.remove(b);
      }
    }
    this.runawaysCulled = (this.runawaysCulled || 0) + dead.length;
    this.runawaysClamped = (this.runawaysClamped || 0) + clamped;
    return dead.length;
  }

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
