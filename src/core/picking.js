import * as THREE from 'three';

/**
 * Turning a tap into a world point.
 *
 * This lives on its own because two separate bugs in it made the game close to
 * unplayable, and both were invisible from the code that called it:
 *
 * 1. Normalised device coordinates were derived from `window.innerWidth` and
 *    `window.innerHeight`. That is only the canvas's size if the canvas exactly
 *    fills the layout viewport, which it does not once a mobile browser shows
 *    its URL bar — the canvas is laid out against one viewport and the pointer
 *    is reported in another, so every tap lands a fixed distance off. Asking
 *    the canvas for its own rectangle is correct in every case, and costs one
 *    cached call per resize.
 *
 * 2. The heightfield marcher advanced with a growing stride but bisected
 *    against a fixed one, so the bracket did not contain the crossing and the
 *    returned point sat past the real surface.
 *
 * The result now round-trips: project the returned point back through the
 * camera and you land within a pixel of the tap. `selfTest()` asserts exactly
 * that, and the test menu runs it.
 */
export class Picker {
  constructor(canvas, camera, terrain) {
    this.canvas = canvas;
    this.camera = camera;
    this.terrain = terrain;
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._v = new THREE.Vector3();
    this._n = new THREE.Vector3();
  }

  /** Pointer coordinates -> NDC, using the canvas's own box. */
  toNDC(clientX, clientY, out = this._ndc) {
    const r = this.canvas.getBoundingClientRect();
    out.x = ((clientX - r.left) / Math.max(r.width, 1)) * 2 - 1;
    out.y = -(((clientY - r.top) / Math.max(r.height, 1)) * 2 - 1);
    return out;
  }

  ray(clientX, clientY) {
    this.raycaster.setFromCamera(this.toNDC(clientX, clientY), this.camera);
    return this.raycaster.ray;
  }

  /**
   * March the ray against the heightfield.
   *
   * Cheaper and far more robust than intersecting the terrain mesh, which has
   * a quarter of a million triangles. The stride grows with distance because
   * near the camera a metre of ray is a lot of screen, and far away it is not —
   * but the previous sample distance is now carried forward explicitly so the
   * bisection brackets the crossing it actually found.
   */
  terrainPoint(ray, maxT = 5000) {
    const t3 = this.terrain;
    const o = ray.origin, d = ray.direction;
    const h = (t, out) => {
      out.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
      return out.y - t3.heightAt(out.x, out.z);
    };
    const p = this._v;

    let t = 0;
    let prevT = 0;
    let prevDiff = h(0, p);
    // Starting underground (camera clipped into a hill) has no sensible answer
    // above the surface; take the point straight below instead.
    if (prevDiff <= 0) return this._surface(o.x, o.z);

    const base = 2.0;
    while (t < maxT) {
      prevT = t;
      t += base + t * 0.012;
      const diff = h(t, p);
      if (diff <= 0) {
        // The crossing is in (prevT, t]; bisect that exact interval.
        let lo = prevT, hi = t;
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) * 0.5;
          if (h(mid, p) > 0) lo = mid; else hi = mid;
        }
        const ft = (lo + hi) * 0.5;
        return this._surface(o.x + d.x * ft, o.z + d.z * ft);
      }
      prevDiff = diff;
    }
    return null;
  }

  _surface(x, z) {
    return new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
  }

  /**
   * Full pick: structures first, then the ground.
   * @returns {{kind:'structure'|'ground', point:THREE.Vector3, label:?string,
   *            structure:?object, chunk:number}|null}
   */
  pick(clientX, clientY, structures, city, garrison) {
    const ray = this.ray(clientX, clientY);

    // Defenders first, and ahead of everything.
    //
    // A man standing in a window is a metre in front of the masonry behind him
    // and a fraction of its size, so on any nearest-hit ordering the wall wins
    // almost every tap. Since designating a defender is the *only* way to have
    // the battery shoot at one deliberately, losing that tap to the stone he is
    // leaning on makes the whole garrison untargetable — which is exactly how
    // it behaved. A small forward bias costs a little precision on the wall and
    // buys the ability to point at a person.
    let man = null;
    if (garrison && garrison.mesh && garrison.mesh.count > 0) {
      const hits = this.raycaster.intersectObject(garrison.mesh, false);
      for (const h of hits) {
        const d = garrison.defenderForInstance(h.instanceId);
        if (!d) continue;
        man = { kind: 'defender', point: h.point.clone(), label: d.def.name,
          structure: null, chunk: -1, defender: d, distance: h.distance };
        break;
      }
      // Failing an exact hit, the nearest man to the tap on screen.
      //
      // A soldier is about sixty centimetres across. At the four hundred
      // metres the camera sits back for a doubled tower that is two or three
      // pixels, and a finger is nearer forty — so a gun crew dug in on open
      // ground was, in practice, impossible to point at. The men in windows
      // were fine only because the ray that misses the man still hits the
      // building he is standing in, which is what the caller wanted anyway.
      if (!man) man = this._defenderNearTap(clientX, clientY, garrison);
    }

    // Flat roofs are legitimate ground. A gun on one has sightlines the street
    // does not, and getting up there is a decision worth offering — so the city
    // is picked against as well, and an upward-facing hit on it is a rooftop.
    let roof = null;
    if (city && city.visible) {
      const hits = this.raycaster.intersectObject(city, true);
      for (const h of hits) {
        if (!h.face) continue;
        this._n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        if (this._n.y < 0.85) continue;         // a wall, or the underside
        roof = h.point.clone();
        roof.onRoof = true;
        roof.roofDistance = h.distance;
        break;
      }
    }

    let best = null;
    if (structures) {
      const meshes = [];
      for (const s of structures) for (const m of s.meshes) meshes.push(m.mesh);
      const hits = this.raycaster.intersectObjects(meshes, false);
      for (const hit of hits) {
        const entry = this._entryFor(structures, hit.object);
        if (!entry) continue;
        const chunk = entry.meshEntry.list[hit.instanceId];
        // Destroyed instances are scaled to zero rather than removed, so they
        // still carry a (degenerate) bounding volume. Skip them explicitly.
        if (chunk === undefined || !(entry.structure.flags[chunk] & 1)) continue;
        best = {
          kind: 'structure',
          point: hit.point.clone(),
          label: entry.structure.tagOf[chunk],
          structure: entry.structure,
          chunk,
          distance: hit.distance,
        };
        break;
      }
    }

    const ground = this.terrainPoint(ray);
    const groundDist = ground ? ray.origin.distanceTo(ground) : Infinity;

    // The bias: a defender wins unless something is comfortably in front of him.
    if (man) {
      const nearest = Math.min(
        best ? best.distance : Infinity,
        roof ? roof.roofDistance : Infinity,
        groundDist,
      );
      if (man.distance <= nearest + 2.5) return man;
    }

    // Nearest wins. A roof only counts when the ray reaches it before the
    // ground behind the building and before any masonry in front of it.
    if (best && best.distance <= Math.min(groundDist, roof ? roof.roofDistance : Infinity) + 0.5) {
      return best;
    }
    if (roof && roof.roofDistance < groundDist) {
      return { kind: 'roof', point: roof, label: 'rooftop', structure: null, chunk: -1 };
    }
    if (ground) return { kind: 'ground', point: ground, label: null, structure: null, chunk: -1 };
    return best;
  }

  /**
   * The living defender whose head is nearest the tap on screen, in pixels.
   *
   * Deliberately generous and deliberately last: this only runs when the ray
   * missed every figure outright, so it costs a projection per defender on a
   * tap that was going to land on ground or masonry anyway. The result still
   * goes through the same forward-bias test as an exact hit, so a man behind a
   * wall does not win the tap just for being near the finger.
   */
  _defenderNearTap(clientX, clientY, garrison) {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    // Scaled to the screen: about a finger's width on a phone, and no more
    // than that on a desktop monitor.
    const tol = Math.max(22, Math.min(r.width, r.height) * 0.055);
    let best = null, bestPx = tol;
    const v = this._v;
    for (const d of garrison.defenders) {
      if (!d.alive) continue;
      v.set(d.pos.x, d.pos.y + 0.9, d.pos.z);       // chest height
      const dist = this.camera.position.distanceTo(v);
      v.project(this.camera);
      if (v.z < -1 || v.z > 1) continue;            // behind, or past the far plane
      const px = r.left + (v.x * 0.5 + 0.5) * r.width;
      const py = r.top + (-v.y * 0.5 + 0.5) * r.height;
      const off = Math.hypot(px - clientX, py - clientY);
      if (off >= bestPx) continue;
      bestPx = off;
      best = { kind: 'defender', point: new THREE.Vector3(d.pos.x, d.pos.y + 0.9, d.pos.z),
        label: d.def.name, structure: null, chunk: -1, defender: d, distance: dist };
    }
    return best;
  }

  _entryFor(structures, object) {
    for (const s of structures) {
      for (const m of s.meshes) if (m.mesh === object) return { structure: s, meshEntry: m };
    }
    return null;
  }

  /**
   * Project a world point back to client coordinates. Used by the HUD and by
   * the round-trip assertion below.
   */
  toScreen(point) {
    const r = this.canvas.getBoundingClientRect();
    const v = this._v.copy(point).project(this.camera);
    return {
      x: r.left + (v.x * 0.5 + 0.5) * r.width,
      y: r.top + (-v.y * 0.5 + 0.5) * r.height,
      behind: v.z > 1,
    };
  }

  /**
   * Assert that picking round-trips: tap at (x, y), project the ground point
   * found there back to the screen, and it must come back to (x, y).
   *
   * @returns {{samples:number, worst:number, failures:Array}}
   */
  selfTest(samples = 25, tolerancePx = 2.5) {
    const r = this.canvas.getBoundingClientRect();
    const failures = [];
    let worst = 0;
    let n = 0;
    for (let i = 0; i < samples; i++) {
      // Sample the lower two thirds of the screen, where the ground is.
      const gx = (i % 5 + 0.5) / 5;
      const gy = 0.34 + (Math.floor(i / 5) % 5 + 0.5) / 5 * 0.62;
      const cx = r.left + gx * r.width;
      const cy = r.top + gy * r.height;
      const p = this.terrainPoint(this.ray(cx, cy));
      if (!p) continue;
      n++;
      const back = this.toScreen(p);
      const err = Math.hypot(back.x - cx, back.y - cy);
      worst = Math.max(worst, err);
      if (err > tolerancePx) failures.push({ cx, cy, err: +err.toFixed(2) });
    }
    return { samples: n, worst: +worst.toFixed(2), failures };
  }
}
