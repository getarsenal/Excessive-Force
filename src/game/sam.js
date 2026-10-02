/**
 * The enemy's surface-to-air missiles: an S-300 battery dug in round the
 * objective, which owns the sky for the first few minutes of a fight.
 *
 * What it is for. Air strikes are the most expensive cards in the arsenal,
 * and until now the worst the garrison could do to one was flak: tracer that
 * walked a bomb off its mark or drove a pilot home with it. The opening of a
 * battle had no gravity in the air at all. A real defended objective has a
 * long-range SAM over it, and a strike flown into its envelope before it has
 * been dealt with is a strike that might not come back. So: about one in
 * four or five aeroplanes sent in while the battery is up is brought down,
 * and every one of them is shot at — the misses are half the picture.
 *
 * What it looks like. Two launchers on MAZ-543 eight-wheelers with their four
 * canisters stood upright, and a flat-faced engagement radar turning on its
 * mast. A missile is cold-launched: blown thirty metres straight up out of
 * the tube on a puff of gas, then the motor lights and it pitches over in a
 * hard curve onto the aeroplane, drawing a white trail across the sky that
 * hangs there for the best part of ten seconds. A hit is a fireball beside
 * the airframe and the wreck going down burning. A miss streaks past the
 * aeroplane and keeps climbing until the motor burns out and the trail ends
 * high in the sky.
 *
 * What stops it. A battery has eight rounds, and its crews do not stay on one
 * spot under artillery: after `SAM.window` seconds the sites go quiet. The
 * launchers can be shelled — a near miss wrecks one and its rounds cook off —
 * and a battery whose radar is gone guesses. Killing the SAMs first is the
 * way to buy the sky early; waiting buys it late.
 */
import * as THREE from 'three';
import { BillboardParticles, makeSmokeTexture } from '../fx/particles.js';

export const SAM = {
  /** Seconds from the start of the battle the battery is up for. */
  window: 210,
  /** Rounds per launcher: four canisters. */
  rounds: 4,
  /** Horizontal reach of the battery, metres. */
  range: 5200,
  /** Height over the ground an aeroplane has to be to be engaged. */
  minAlt: 45,
  /** Chance an aeroplane in reach is shot at at all. */
  engage: 0.85,
  /** Seconds between launches from one launcher. */
  cooldown: 5,
  /** Money for a launcher, and for the radar. */
  bounty: 260,
};

const OLIVE = 0x4d5733, SAND = 0xb09468, DARK = 0x1d2023, TYRE = 0x161616;

function mat(color, rough = 0.85, metal = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/**
 * A 5P85 launcher on its MAZ-543: thirteen metres of eight-wheeler, the two
 * split cabs either side of the engine at the front, and at the back the
 * four canisters stood on end in a two-by-two pack, eight metres tall.
 * Nose along +z. Returns the group and the canister mouths, in its own frame.
 */
export function makeLauncher(desert = false) {
  const g = new THREE.Group();
  const body = mat(desert ? SAND : OLIVE), dark = mat(DARK, 0.6, 0.3), tyre = mat(TYRE, 0.95, 0);
  const add = (geo, m, x, y, z, rx = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.rotation.x = rx; o.rotation.z = rz;
    o.castShadow = true; o.receiveShadow = true;
    g.add(o);
    return o;
  };
  // Chassis and wheels: four axles a side.
  add(new THREE.BoxGeometry(2.9, 0.9, 12.6), body, 0, 1.35, 0);
  const wheel = new THREE.CylinderGeometry(0.78, 0.78, 0.5, 14);
  for (const z of [4.6, 2.9, -2.4, -4.2]) {
    for (const x of [-1.3, 1.3]) add(wheel, tyre, x, 0.78, z, 0, Math.PI / 2);
  }
  // The split cabs and the engine between them.
  for (const x of [-1.0, 1.0]) {
    add(new THREE.BoxGeometry(1.0, 1.5, 2.1), body, x, 2.5, 5.0);
    add(new THREE.BoxGeometry(1.02, 0.55, 0.06), dark, x, 2.85, 6.06);
  }
  add(new THREE.BoxGeometry(0.9, 1.0, 2.6), body, 0, 2.3, 4.8);
  // Equipment boxes along the bed.
  add(new THREE.BoxGeometry(2.8, 1.1, 3.4), body, 0, 2.35, 1.6);
  // The erector and the pack, stood up at the tail.
  add(new THREE.BoxGeometry(2.4, 0.5, 2.0), dark, 0, 2.05, -5.4);
  add(new THREE.BoxGeometry(0.25, 7.6, 0.4), dark, -1.25, 5.6, -5.0);
  add(new THREE.BoxGeometry(0.25, 7.6, 0.4), dark, 1.25, 5.6, -5.0);
  const tube = new THREE.CylinderGeometry(0.37, 0.37, 7.8, 12);
  const cap = new THREE.CylinderGeometry(0.39, 0.39, 0.12, 12);
  const mouths = [];
  for (const x of [-0.42, 0.42]) {
    for (const z of [-4.98, -5.82]) {
      add(tube, body, x, 6.2, z);
      const c = add(cap, dark, x, 10.15, z);
      c.name = 'cap';
      mouths.push({ x, y: 10.2, z, cap: c });
    }
  }
  // Outriggers down to the ground at each corner.
  for (const x of [-1.6, 1.6]) {
    for (const z of [-5.8, 3.6]) add(new THREE.BoxGeometry(0.3, 1.4, 0.3), dark, x, 0.7, z);
  }
  return { group: g, mouths };
}

/**
 * The engagement radar: a 30N6 on its truck — the "Flap Lid", a flat square
 * array three metres across tilted back on a mast — turning slowly.
 */
export function makeRadar(desert = false) {
  const g = new THREE.Group();
  const body = mat(desert ? SAND : OLIVE), dark = mat(DARK, 0.6, 0.3), tyre = mat(TYRE, 0.95, 0);
  const add = (geo, m, x, y, z, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(2.6, 0.8, 9.4), body, 0, 1.25, 0);
  const wheel = new THREE.CylinderGeometry(0.62, 0.62, 0.45, 12);
  for (const z of [3.4, 1.6, -2.2, -3.6]) {
    for (const x of [-1.15, 1.15]) {
      const w = add(wheel, tyre, x, 0.62, z);
      w.rotation.z = Math.PI / 2;
    }
  }
  add(new THREE.BoxGeometry(2.5, 1.8, 2.2), body, 0, 2.55, 3.7);
  add(new THREE.BoxGeometry(2.5, 2.0, 4.6), body, 0, 2.65, -0.6);
  add(new THREE.CylinderGeometry(0.22, 0.3, 5.5, 10), dark, 0, 6.3, -0.6);
  const head = new THREE.Group();
  head.position.set(0, 9.2, -0.6);
  head.name = 'head';
  g.add(head);
  const face = add(new THREE.BoxGeometry(3.2, 3.2, 0.35), body, 0, 0, 0, head);
  face.rotation.x = -0.35;
  add(new THREE.BoxGeometry(2.9, 2.9, 0.05), dark, 0, 0.06, 0.2, head).rotation.x = -0.35;
  return { group: g, head };
}

/**
 * Where a battery goes: open, dry, level ground a few hundred metres out from
 * the objective, clear of the streets, the buildings and the monument, on
 * two different sides of it. Deterministic for a level.
 */
export function siteSams(terrain, o = {}) {
  const span = terrain.span;
  const exclude = o.exclude || 120;
  const plots = o.plots || [];
  const net = o.net || null;
  const landmarks = o.landmarks || [];
  let seed = 0x5a3 + Math.round(span);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let tol = 1.6;
  const clear = (x, z, r) => {
    if (Math.abs(x) > span - 70 || Math.abs(z) > span - 70) return false;
    const g = terrain.heightAt(x, z);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (terrain.isWater(px, pz)) return false;
      if (Math.abs(terrain.heightAt(px, pz) - g) > tol) return false;
      if (net && net.roadClearance && net.roadClearance(px, pz) < 2) return false;
    }
    if (terrain.isWater(x, z)) return false;
    for (const p of plots) {
      const pr = Math.hypot(p.w || 0, p.d || 0) / 2;
      if (Math.hypot(p.x - x, p.z - z) < pr + r + 3) return false;
    }
    for (const L of landmarks) {
      if (Math.hypot(L.x - x, L.z - z) < Math.max(L.w || 0, L.d || 0) / 2 + r + 25) return false;
    }
    return true;
  };
  const r0 = Math.max(150, Math.min(span * 0.6, exclude * 1.35));
  const rings = [r0, r0 * 1.3, r0 * 1.65, r0 * 2.0, r0 * 2.5, r0 * 3.1].filter((r) => r < span - 90);
  if (!rings.length || rings[rings.length - 1] < span - 160) rings.push(span - 120);
  const turn = rnd() * Math.PI * 2;
  const found = [];
  // Level ground first; on a mountain, whatever a crew could dig a launcher
  // into. The Corcovado has nothing within two metres of flat for a quarter
  // of a kilometre in any direction, and a battery is still there.
  for (const t of [1.6, 2.6, 4.2]) {
    tol = t;
    for (const r of rings) {
      for (let k = 0; k < 48; k++) {
        const a = turn + (k / 48) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (found.some((f) => Math.hypot(f.x - x, f.z - z) < Math.max(220, r * 0.8))) continue;
        if (!clear(x, z, 12)) continue;
        found.push({ x, z, a });
        if (found.length >= 2) break;
      }
      if (found.length >= 2) break;
    }
    if (found.length >= 2) break;
  }
  // Bedded on the low side, so nothing hangs off a slope.
  const low = (x, z) => {
    let g = terrain.heightAt(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g = Math.min(g, terrain.heightAt(x + Math.cos(a) * 6, z + Math.sin(a) * 6));
    }
    return g;
  };
  return found.map((f) => ({ x: f.x, z: f.z, y: low(f.x, f.z), yaw: Math.atan2(f.x, f.z) }));
}

export class SamSites {
  constructor(o) {
    this.scene = o.scene;
    this.terrain = o.terrain;
    this.fx = o.fx;
    this.audio = o.audio;
    this.air = o.air;
    this.camera = o.camera;
    this.onEvent = o.onEvent || (() => {});
    this.low = o.quality?.name === 'low';
    this.group = new THREE.Group();
    this.group.name = 'sams';
    this.scene.add(this.group);
    this.launchers = [];
    this.radar = null;
    this.missiles = [];
    this.quiet = false;
    this.announced = false;
    this.since = 0;            // aeroplanes engaged since the last one brought down
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    const desert = !!o.desert;
    (o.sites || []).forEach((p, i) => {
      const L = makeLauncher(desert);
      L.group.position.set(p.x, p.y, p.z);
      L.group.rotation.y = p.yaw;
      this.group.add(L.group);
      this.launchers.push({ ...L, x: p.x, z: p.z, y: p.y, yaw: p.yaw, rounds: SAM.rounds, cool: i * 2.5, alive: true });
      if (i === 0) {
        const R = makeRadar(desert);
        const side = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        const rx = p.x + side.x * 22, rz = p.z + side.z * 22;
        R.group.position.set(rx, this.terrain.heightAt(rx, rz), rz);
        R.group.rotation.y = p.yaw + 0.4;
        this.group.add(R.group);
        this.radar = { ...R, x: rx, z: rz, alive: true };
      }
    });
    // The trails are their own pool: a white column hanging in the sky for
    // ten seconds is a thousand puffs, and taking those from the explosions'
    // pool would starve every shell that lands while a missile is up.
    this.smoke = new BillboardParticles(this.low ? 900 : 2600, makeSmokeTexture(this.low ? 64 : 128),
      { blending: THREE.NormalBlending, emissive: 1.0, renderOrder: 11 });
    this.scene.add(this.smoke.mesh);
    this._white = new THREE.Color(0.93, 0.93, 0.92);
    this._grey = new THREE.Color(0.72, 0.72, 0.74);
    this._flame = new THREE.Color(2.4, 1.7, 0.9);
    this._time = 0;
  }

  get alive() { return this.launchers.filter((l) => l.alive).length; }

  /** Is the battery still a threat to anything sent in now? */
  get threat() {
    return !this.quiet && this.launchers.some((l) => l.alive && l.rounds > 0);
  }

  /** The launchers' and radar's positions, for the HUD and the harness. */
  get points() {
    const out = this.launchers.filter((l) => l.alive).map((l) => ({ x: l.x, y: l.y, z: l.z, kind: 'launcher' }));
    if (this.radar?.alive) out.push({ x: this.radar.x, y: this.terrain.heightAt(this.radar.x, this.radar.z), z: this.radar.z, kind: 'radar' });
    return out;
  }

  /**
   * Shells and bombs landing. A launcher within the blast is wrecked and its
   * remaining rounds go up with it; so is the radar. Returns the money the
   * kills are worth.
   */
  blast(point, radius) {
    let pay = 0;
    const hit = (x, z) => Math.hypot(point.x - x, point.z - z) < radius + 5
      && Math.abs(point.y - this.terrain.heightAt(x, z)) < radius + 12;
    for (const l of this.launchers) {
      if (!l.alive || !hit(l.x, l.z)) continue;
      l.alive = false;
      pay += SAM.bounty;
      this._wreck(l.group);
      // What was left in the tubes goes off: the rest of the pack lifts out
      // of the wreck in every direction and climbs away to nowhere.
      for (const m of l.mouths) {
        if (l.rounds <= 0) break;
        l.rounds--;
        if (Math.random() < 0.6) this._launch(l, m, null, false, true);
      }
      if (this.fx) this.fx.detonate(this._v.set(l.x, l.y + 3, l.z), 3.2, { ground: true, groundY: l.y });
      this.onEvent('samdown', { point: new THREE.Vector3(l.x, l.y, l.z), left: this.alive });
    }
    if (this.radar?.alive && hit(this.radar.x, this.radar.z)) {
      this.radar.alive = false;
      pay += SAM.bounty * 0.6;
      this._wreck(this.radar.group);
      if (this.fx) this.fx.detonate(this._v.set(this.radar.x, this.terrain.heightAt(this.radar.x, this.radar.z) + 3, this.radar.z), 2.2, { ground: true });
      this.onEvent('samradar', { point: new THREE.Vector3(this.radar.x, 0, this.radar.z) });
    }
    return pay;
  }

  _wreck(group) {
    group.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.color.multiplyScalar(0.22);
    });
    group.rotation.z += (Math.random() - 0.5) * 0.18;
    group.position.y -= 0.5;
  }

  /**
   * Whether this one comes down. About one aeroplane in four or five that
   * the battery shoots at: never two in a row, and never a long run of
   * luck — the fifth since the last is the one that does not come back.
   */
  _decide() {
    this.since++;
    const p = this.since >= 6 ? 1 : this.since <= 1 ? 0.12 : 0.3;
    const hit = Math.random() < (this.radar && !this.radar.alive ? p * 0.5 : p);
    if (hit) this.since = 0;
    return hit;
  }

  update(dt, elapsed) {
    this._time += dt;
    if (this.radar?.alive) this.radar.head.rotation.y += dt * 0.9;
    if (!this.quiet && elapsed > SAM.window) {
      this.quiet = true;
      if (this.launchers.some((l) => l.alive)) this.onEvent('samquiet', {});
    }
    for (const l of this.launchers) l.cool -= dt;
    if (!this.quiet && this.air) this._engage();
    this._fly(dt);
    this.smoke.update(dt, this._time);
  }

  /** Every aeroplane coming into reach is looked at once. */
  _engage() {
    for (const s of this.air.sorties) {
      if (s._sam || s.done || s.downed || !s.model) continue;
      const a = s.def?.aircraft;
      if (!a || a.consumed) continue;
      if (s.heli || (s.loiter && !s.loiter.orbit)) continue;
      if (s.climb > 0.9) continue;
      const p = s.model.position;
      const g = this.terrain.heightAt(p.x, p.z);
      if (p.y - g < SAM.minAlt) continue;
      let best = null, bd = Infinity;
      for (const l of this.launchers) {
        if (!l.alive || l.rounds <= 0 || l.cool > 0) continue;
        const d = Math.hypot(p.x - l.x, p.z - l.z);
        if (d < SAM.range && d < bd) { bd = d; best = l; }
      }
      if (!best) continue;
      s._sam = true;
      if (!this.announced) { this.announced = true; this.onEvent('samactive', {}); }
      if (Math.random() > SAM.engage) continue;
      const kill = this._decide();
      const mouth = best.mouths[SAM.rounds - best.rounds] || best.mouths[0];
      best.rounds--;
      best.cool = SAM.cooldown;
      this._launch(best, mouth, s, kill, false);
      // A second round after a miss, if there is one to spare: a battery
      // fires a pair at anything it means to bring down.
      this.onEvent('samlaunch', { def: s.def, point: new THREE.Vector3(best.x, best.y, best.z) });
    }
  }

  _launch(l, mouth, sortie, kill, wild) {
    // The canister's mouth, in the world.
    const c = Math.cos(l.yaw), sn = Math.sin(l.yaw);
    const pos = new THREE.Vector3(l.x + mouth.x * c + mouth.z * sn, l.y + mouth.y, l.z - mouth.x * sn + mouth.z * c);
    if (mouth.cap) mouth.cap.visible = false;
    const m = makeMissile();
    m.position.copy(pos);
    this.group.add(m);
    // Where a miss goes: forty to seventy metres off the aeroplane, to one
    // side and a little high, so it visibly streaks past rather than through.
    const off = new THREE.Vector3(Math.random() - 0.5, 0.4 + Math.random() * 0.4, Math.random() - 0.5)
      .normalize().multiplyScalar(40 + Math.random() * 30);
    const dir = wild
      ? new THREE.Vector3(Math.random() - 0.5, 0.8, Math.random() - 0.5).normalize()
      : new THREE.Vector3(0, 1, 0);
    this.missiles.push({ mesh: m, pos, dir, speed: wild ? 120 : 34, t: 0, sortie, kill, off,
      lost: !sortie, wild, prev: null, gap: 0, done: false, burn: wild ? 3 : 9 });
    // The gas puff at the canister and the bang of the ejection charge.
    for (let k = 0; k < (this.low ? 10 : 22); k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2;
      this.smoke.spawn({ x: pos.x + Math.cos(a) * r, y: pos.y - 4 - Math.random() * 6, z: pos.z + Math.sin(a) * r,
        vx: Math.cos(a) * 3, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 3,
        life: 3 + Math.random() * 3, size0: 3, size1: 11, color0: this._white, color1: this._grey,
        drag: 0.8, grav: -0.2, turb: 0.6, alpha: 0.5 });
    }
    if (this.audio) this.audio.play('rocket', pos, { rate: 0.55, gain: 1.0, rolloff: 2400 });
  }

  _fly(dt) {
    for (const M of this.missiles) {
      if (M.done) continue;
      M.t += dt;
      const s = M.sortie;
      if (s && !M.lost && (s.done || s.downed)) M.lost = true;
      if (M.t < 0.55 && !M.wild) {
        // Out of the tube on gas: straight up, slowing.
        M.speed = Math.max(18, M.speed - 30 * dt);
      } else {
        // The motor: a few seconds to the best part of a kilometre a second.
        if (M.t < M.burn) M.speed = Math.min(1050, M.speed + (M.t < 2 ? 520 : 260) * dt);
        else M.speed = Math.max(200, M.speed - 40 * dt);
        let want;
        if (!M.lost) {
          const tp = s.model.position;
          const tv = M.prev ? this._v.copy(tp).sub(M.prev).divideScalar(Math.max(1e-3, dt)) : this._v.set(0, 0, 0);
          M.prev = (M.prev || new THREE.Vector3()).copy(tp);
          const rel = new THREE.Vector3().copy(tp).sub(M.pos);
          const dist = rel.length();
          const tgo = dist / Math.max(200, M.speed);
          const aim = new THREE.Vector3().copy(tp).addScaledVector(tv, Math.min(4, tgo));
          if (!M.kill) aim.add(M.off);
          want = aim.sub(M.pos).normalize();
          if (M.kill && dist < 16) {
            this._burst(M);
            if (this.air.destroy(s)) this.onEvent('samkill', { def: s.def, point: M.pos.clone() });
            continue;
          }
          // Past it and opening: it has missed, and it goes on.
          if (!M.kill && (dist < 70 && M.dir.dot(rel) < 0)) {
            M.lost = true;
            this.onEvent('sammiss', { def: s.def, point: M.pos.clone() });
          }
        }
        if (M.lost) want = this._v.copy(M.dir).add(new THREE.Vector3(0, 0.35, 0)).normalize();
        // Turn toward it at a rate a missile can pull: a hard curve, not a
        // snap.
        const rate = (M.lost ? 0.5 : 2.4) * dt;
        const ang = M.dir.angleTo(want);
        if (ang > 1e-4) M.dir.lerp(want, Math.min(1, rate / ang)).normalize();
      }
      M.pos.addScaledVector(M.dir, M.speed * dt);
      M.mesh.position.copy(M.pos);
      M.mesh.quaternion.setFromUnitVectors(this._up, M.dir);
      // The trail: a puff every few metres while the motor burns, thinning
      // out as it climbs away.
      if (M.t < M.burn + 0.5) {
        M.gap -= M.speed * dt;
        const step = this.low ? 7 : 4;
        while (M.gap <= 0) {
          M.gap += step;
          const back = -M.gap;
          this.smoke.spawn({ x: M.pos.x - M.dir.x * back, y: M.pos.y - M.dir.y * back, z: M.pos.z - M.dir.z * back,
            vx: (Math.random() - 0.5) * 0.6, vy: 0.4, vz: (Math.random() - 0.5) * 0.6,
            life: 8 + Math.random() * 4, size0: 8, size1: 22 + Math.random() * 8,
            color0: this._white, color1: this._grey, drag: 0.4, grav: -0.05, turb: 0.35, alpha: 0.78 });
        }
        // The flame at the nozzle.
        this.smoke.spawn({ x: M.pos.x - M.dir.x * 6, y: M.pos.y - M.dir.y * 6, z: M.pos.z - M.dir.z * 6,
          life: 0.1, size0: 7, size1: 2.5, color0: this._flame, color1: this._flame, alpha: 1 });
      }
      const g = this.terrain.heightAt(M.pos.x, M.pos.z);
      if (M.pos.y > g + 9000 || M.t > 22 || (M.t > 1 && M.pos.y < g)) {
        M.done = true;
        this.group.remove(M.mesh);
      }
    }
    this.missiles = this.missiles.filter((M) => !M.done);
  }

  /** The warhead: a fireball and a ring of fragments beside the aeroplane. */
  _burst(M) {
    M.done = true;
    this.group.remove(M.mesh);
    if (this.fx) this.fx.detonate(M.pos, 2.0, { ground: false });
    for (let k = 0; k < (this.low ? 12 : 26); k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.5).normalize();
      this.smoke.spawn({ x: M.pos.x, y: M.pos.y, z: M.pos.z, vx: v.x * 14, vy: v.y * 14, vz: v.z * 14,
        life: 4 + Math.random() * 3, size0: 4, size1: 14, color0: this._grey, color1: this._grey,
        drag: 1.6, grav: -0.1, turb: 0.5, alpha: 0.6 });
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.smoke.mesh);
  }
}

/**
 * The round: seven and a half metres of white body with a dark nose and four
 * fins at the tail, drawn at twice its real size so it reads at the range
 * it is watched from. Up its own +y.
 */
function makeMissile() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.6, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 6.4, 10), white);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.2, 10), dark);
  nose.position.y = 3.8;
  g.add(nose);
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.7), white);
    const a = (k / 4) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.45, -2.7, Math.sin(a) * 0.45);
    fin.rotation.y = -a;
    g.add(fin);
  }
  g.scale.setScalar(2.2);
  return g;
}
