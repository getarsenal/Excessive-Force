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
    /** bodies frozen back into scenery, swept for lost footing */
    this.frozen = [];
    this._auditCursor = 0;

    this.dead = false;
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
    body.__frozen = false;
    const owner = this.owners.get(body.handle);
    if (owner) { owner.dynamic = true; owner.settleTimer = 0; }
    return true;
  }

  /**
   * Freeze settled debris back into scenery, reclaiming simulation budget.
   *
   * Refuses to freeze anything that is not touching the world. A stone at the
   * top of its arc is momentarily as slow as a stone on the ground, and Rapier
   * will occasionally sleep one that is wedged in clear air, so without this
   * test a bombardment leaves blooms of masonry hanging over the site —
   * motionless, un-fallable, and still solid enough to shoot at.
   *
   * Returns whether the body was actually frozen.
   */
  demote(body, force = false) {
    if (body.bodyType() === this.rapier.RigidBodyType.Fixed) return false;
    // Two callers, two rules.
    //
    // Ordinary settling refuses to freeze anything that is not touching the
    // world: that is the whole point, and it is what stops blooms of masonry
    // hanging over the site. But when the *budget* is the caller — when a
    // collapsing tower needs somewhere to put four hundred stones and every
    // slot is taken — refusing costs more than it saves. A building that
    // cannot be given bodies stands there with its base shot out, which is the
    // worst bug in the game, and a stone frozen where it should not be is on
    // the sweep's list a moment later: it gets released when there is room, or
    // deleted when there is not. So the budget takes what it needs.
    if (!force && !this._standsOnSomething(body)) return false;
    body.setBodyType(this.rapier.RigidBodyType.Fixed, false);
    this.dynamicSet.delete(body);
    const owner = this.owners.get(body.handle);
    if (owner) { owner.dynamic = false; owner.settled = true; }
    // Remember it so the sweeps above can catch it if the ground it froze onto
    // is later blown out from under it.
    body.__frozen = true;
    body.__frozenAt = this.stepCount;
    this.frozen.push(body);
    return true;
  }

  /**
   * Is this body standing on anything?
   *
   * Rays, deliberately, and as few of them as possible. The first version of
   * this asked Rapier for shape intersections around every collider of every
   * frozen body, several thousand times a second — and somewhere in that
   * traffic the wasm side eventually tripped, which poisons the world: every
   * later `step` throws, the bodies stop being simulated, and the transforms
   * that come back are garbage. Garbage quaternions are not merely wrong, they
   * are *huge*, and a box drawn with one fills the screen. That is what the
   * enormous floating slabs were.
   *
   * So: at most three rays, cast down from the body's own origin, ignoring the
   * body's own colliders. The offsets matter — a stone lying on the edge of a
   * rubble pile has its centre out over thin air, and a single central ray
   * calls it hanging when it is not.
   */
  _standsOnSomething(body) {
    const t = body.translation();
    if (!isFinite(t.x) || !isFinite(t.y) || !isFinite(t.z)) return true;
    const reach = this._reachOf(body);
    // The cheap answer first, and it is the answer nearly every time: almost
    // all settled rubble is lying on the ground, and the ground's height is
    // arithmetic rather than a query. Only stone that has come to rest *above*
    // the ground — on a pile, on a ledge, on what is left of a wall — needs
    // Rapier's opinion, and there is far less of that.
    if (this.groundAt) {
      const g = this.groundAt(t.x, t.z);
      if (isFinite(g) && t.y - reach <= g + 0.8) return true;
    }
    const ray = this._ray || (this._ray = new this.rapier.Ray(
      { x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 },
    ));
    const r = Math.min(1.2, reach * 0.55);
    ray.dir.x = 0; ray.dir.y = -1; ray.dir.z = 0;
    for (const [ox, oz] of [[0, 0], [r, r], [-r, -r]]) {
      ray.origin.x = t.x + ox; ray.origin.y = t.y; ray.origin.z = t.z + oz;
      const hit = this.world.castRay(
        ray, reach + 0.6, true, undefined, undefined, undefined, body, undefined,
      );
      if (hit) return true;
    }
    // Nothing underneath — but a stone wedged against a wall is not hanging in
    // the air either, and if we call it hanging we free it, it falls half a
    // metre back into the wall, and we refuse to freeze it again: it burns a
    // simulation slot forever. So look sideways too before giving up.
    ray.origin.x = t.x; ray.origin.y = t.y; ray.origin.z = t.z;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ray.dir.x = dx; ray.dir.y = 0; ray.dir.z = dz;
      const hit = this.world.castRay(
        ray, reach + 0.35, true, undefined, undefined, undefined, body, undefined,
      );
      if (hit) return true;
    }
    ray.dir.x = 0; ray.dir.y = -1; ray.dir.z = 0;
    return false;
  }

  /** How far the body reaches below its own origin. Cached: it never changes. */
  _reachOf(body) {
    if (body.__reach !== undefined) return body.__reach;
    let r = 0.6;
    const n = body.numColliders();
    if (n > 0) {
      const bt = body.translation();
      const step = Math.max(1, Math.floor(n / 4));
      for (let c = 0; c < n; c += step) {
        const col = body.collider(c);
        if (!col) continue;
        const he = col.halfExtents?.();
        const ct = col.translation();
        const span = he ? Math.hypot(he.x, he.y, he.z) : 0.6;
        r = Math.max(r, Math.hypot(ct.x - bt.x, ct.y - bt.y, ct.z - bt.z) + span);
      }
    }
    body.__reach = Math.min(r, 40);
    return body.__reach;
  }

  /**
   * Let go of frozen rubble near a blast.
   *
   * The event-driven half of the same problem: rubble that settled honestly on
   * a wall, and then had the wall shot out from under it, is a fixed body with
   * nothing holding it up and nothing to notice. A blast is the only thing that
   * can create that situation, so a blast is where to look for it — one query
   * per explosion rather than a sweep every frame.
   */
  wakeNear(center, radius, limit = 48) {
    if (this.dead || !this.frozen.length) return 0;
    // Capped, hard. A blast in a rubble field can have several hundred frozen
    // stones inside it, and testing every one of them costs three rays each —
    // which turned a blast into thousands of queries and slowed the game to a
    // crawl during exactly the moment it should be at its most exciting. The
    // nearest two dozen are the ones that were holding anything up; the sweep
    // picks up whatever is left, a few frames later.
    const hits = [];
    this.queryBall(center, radius, (owner, parent) => {
      if (hits.length >= limit * 3) return;
      if (parent.bodyType() === this.rapier.RigidBodyType.Fixed
        && parent.__frozen) hits.push(parent);
    });
    hits.sort((a, b) => {
      const ta = a.translation(), tb = b.translation();
      return (Math.hypot(ta.x - center.x, ta.y - center.y, ta.z - center.z)
        - Math.hypot(tb.x - center.x, tb.y - center.y, tb.z - center.z));
    });
    let woke = 0, tested = 0;
    for (const body of hits) {
      if (tested >= limit) break;
      if (!PhysicsWorld.alive(body)) continue;
      tested++;
      if (this._standsOnSomething(body)) continue;
      if (this.dynamicSet.size >= this.activeBudget) this.reclaim(1);
      if (!this.promote(body)) break;
      woke++;
    }
    return woke;
  }

  /**
   * Walk the frozen debris a slice at a time and let go of anything whose
   * footing has gone. The backstop for whatever `wakeNear` misses — a section
   * that leaned away, a pile that shifted — kept deliberately slow, because
   * every query into the physics world is a query that can go wrong.
   */
  auditFrozen(slice = 0) {
    if (this.dead) return 0;
    const list = this.frozen;
    const st = this.sweepStats || (this.sweepStats = {
      passes: 0, checked: 0, standing: 0, woke: 0, culled: 0, noRoom: 0, stale: 0,
    });
    if (!list.length) return 0;
    // Scaled to the size of the field. Most of these answers are arithmetic
    // now, so a big rubble field can afford to be walked in a couple of
    // seconds rather than a couple of minutes — which is the difference
    // between a stone that hangs for a moment and one that hangs all game.
    if (!slice) slice = Math.max(12, Math.min(160, list.length >> 4));
    // Make room once, up front. Without this the sweep spends its whole budget
    // failing to promote the first thing it finds.
    if (this.dynamicSet.size >= this.activeBudget) this.reclaim(8);
    let checked = 0, woke = 0;
    while (checked < slice && list.length) {
      if (this._auditCursor >= list.length) this._auditCursor = 0;
      const idx = this._auditCursor;
      const body = list[idx];
      checked++;
      // Drop anything that is gone or has been promoted by some other route.
      st.checked++;
      if (!PhysicsWorld.alive(body)
          || body.bodyType() !== this.rapier.RigidBodyType.Fixed) {
        st.stale++;
        if (body) body.__frozen = false;
        list[idx] = list[list.length - 1];
        list.pop();
        continue;
      }
      if (this._standsOnSomething(body)) {
        st.standing++;
        body.__hangStrikes = 0;
        this._auditCursor++;
        continue;
      }
      // Something hanging in the sky is a better use of a slot than a stone
      // that has already come to rest.
      if (this.dynamicSet.size >= this.activeBudget) this.reclaim(1);
      if (!this.promote(body)) {
        // No room. Keep going rather than stopping the sweep here — stopping
        // is how the cursor ends up advancing one place a frame, taking half a
        // minute to cross a list of two thousand.
        //
        // And if there is *still* no room after a couple of passes, give up
        // and delete the stone. On a phone the budget can be genuinely full for
        // long stretches, and then a stone that has lost its footing can never
        // be released at all: it hangs there for the rest of the match. One
        // brick vanishing out of a rubble field is not something anyone will
        // notice; one brick hanging in the sky is the thing people photograph.
        body.__hangStrikes = (body.__hangStrikes || 0) + 1;
        st.noRoom++;
        if (body.__hangStrikes < 2) { this._auditCursor++; continue; }
        const owner = this.owners.get(body.handle);
        list[idx] = list[list.length - 1];
        list.pop();
        if (owner && owner.structure && owner.chunk !== undefined) {
          owner.structure.destroyChunk(owner.chunk);
        } else {
          this.remove(body);
        }
        st.culled++;
        this.hangingCulled = (this.hangingCulled || 0) + 1;
        continue;
      }
      body.__hangStrikes = 0;
      list[idx] = list[list.length - 1];
      list.pop();
      woke++; st.woke++;
      // A nudge, so a stone that froze perfectly balanced actually topples
      // rather than dropping in a dead straight line.
      body.applyTorqueImpulse(
        { x: (Math.random() - 0.5) * 8, y: 0, z: (Math.random() - 0.5) * 8 }, true,
      );
    }
    return woke;
  }

  remove(body) {
    this.dynamicSet.delete(body);
    this.owners.delete(body.handle);
    body.__frozen = false;
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

    // Three passes, in order of how happy we are about the outcome.
    //
    // First, bodies Rapier has put to sleep, standing on something: freezing
    // one of those is free of consequence.
    for (const body of this.dynamicSet) {
      if (freed >= need) break;
      if (body.isSleeping() && this.demote(body)) freed++;
    }

    // Second, bodies that have stopped without being asleep.
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
    const slow = [];
    if (freed < need) {
      let tried = 0;
      for (const body of this.dynamicSet) {
        if (freed >= need || tried >= 240) break;
        const v = body.linvel(), w = body.angvel();
        if (Math.hypot(v.x, v.y, v.z) > 0.34) continue;
        if (Math.hypot(w.x, w.y, w.z) > 0.5) continue;
        tried++;
        if (this.demote(body)) freed++;
        else slow.push(body);
      }
    }

    // Third, and only if the first two could not find enough: freeze the slow
    // ones that are *not* standing on anything. This is the pass nobody wants
    // — it is how a stone ends up frozen where it should not be — but the
    // alternative is worse. A collapsing tower needs somewhere to put four
    // hundred stones at once, and a building that cannot be given bodies
    // stands there with its base shot out. Anything frozen here is on the
    // sweep's list immediately, and gets released as soon as there is room.
    for (let i = 0; i < slow.length && freed < need; i++) {
      if (this.demote(slow[i], true)) freed++;
    }
    return Math.min(wanted, this.activeBudget - this.dynamicSet.size);
  }

  setBudget(n) { this.activeBudget = n; }

  /**
   * Fixed-timestep stepping with a bounded catch-up. If a frame takes 200 ms
   * we deliberately drop the extra sub-steps rather than spiral.
   */
  step(dt) {
    // A world that has trapped stays trapped.
    //
    // Once the wasm side throws, the Rust borrow is never released: every
    // later call throws "recursive use of an object", the bodies stop being
    // integrated, and — worse — the transforms that come back are whatever is
    // in that memory. Rendering those is how a trap turns into slabs of
    // masonry the size of a city block hanging over the map. So the moment it
    // happens, stop touching the world at all and leave the scene standing.
    if (this.dead) return 0;
    this.accumulator += Math.min(dt, 0.1);
    let steps = 0;
    try {
      while (this.accumulator >= this.fixedStep && steps < 3) {
        this.world.step(this.eventQueue);
        this.accumulator -= this.fixedStep;
        steps++;
        this.stepCount++;
      }
    } catch (err) {
      this.dead = true;
      this.deadReason = String(err && err.message ? err.message : err);
      console.error('[tumble] physics world trapped, simulation halted:',
        this.deadReason);
      return 0;
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
    if (this.dead) return 0;
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
    if (this.dead) return 0;
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
    let n = 0;
    // Also bounded: a collapse settles in waves, and the rest of a wave can
    // just as well be frozen on the next frame.
    if (toDemote.length > 160) toDemote.length = 160;
    for (const b of toDemote) {
      if (this.demote(b)) { n++; continue; }
      // Refused: asleep in clear air, which is not settled but stuck. Wake it
      // and let gravity have another go, then re-test after another spell.
      const owner = this.owners.get(b.handle);
      if (owner) owner.settleTimer = 0;
      b.wakeUp();
    }
    return n;
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
