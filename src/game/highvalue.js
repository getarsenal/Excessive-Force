/**
 * The high-value targets beyond the SAMs and the command post, run together:
 * the ammunition depot, the enemy artillery battery, the road checkpoint and
 * the columns of trucks it lets through, the general's convoy, and the
 * rewards that come of a run of them — the radar-first bonus is the SAMs'
 * own (sam.js); the kill streak and its fire mission are here.
 *
 * Built by main once the town and the SAMs are sited, never in Boot Camp or
 * under the harness. The battle asks it about every burst (`blast`), steps
 * it every frame (`update`) and asks it what to mark (`points`).
 */
import * as THREE from 'three';
import { AmmoDepot, Checkpoint, Convoy, roadRoute, TARGETS } from './targets.js';

/** A run of high-value kills inside this window earns a fire mission. */
export const STREAK = { window: 60, need: 3, rounds: 12, seconds: 8, spread: 16,
  warhead: { lethal: 1.9, radius: 6.6, power: 6400, fx: 2.2, kinetic: 0.85 } };

export class HighValue {
  constructor({ battle, scene, terrain, fx, net, garrison, desert, origin, exclude, sites, onEvent }) {
    this.battle = battle; this.scene = scene; this.terrain = terrain; this.fx = fx;
    this.net = net; this.garrison = garrison; this.desert = desert;
    this.origin = origin; this.exclude = exclude;
    this.onEvent = onEvent || (() => {});
    this.t = 0;
    this.kills = [];
    this.mission = [];
    this.convoys = [];
    this.general = { state: 'waiting', convoy: null };
    this.columns = { sent: 0, next: 0, route: null, along: 0 };
    const say = (kind, data) => this.onEvent(kind, data);

    if (sites.depot) {
      this.depot = new AmmoDepot({ scene, terrain, fx, site: sites.depot, desert, onEvent: say });
      this.depot.guard(garrison);
    }
    if (sites.battery) this._battery(sites.battery);
    this._roads(sites.avoid || []);
  }

  // ── The battery: three howitzers dug in, a crew round them.
  _battery(site) {
    const g = this.garrison;
    this.guns = [];
    const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
    for (const [lx, lz] of [[-12, 0], [0, 4], [12, 0]]) {
      const x = site.x + lx * c + lz * s, z = site.z - lx * s + lz * c;
      const n0 = g.defenders.length;
      g.place('howitzer', new THREE.Vector3(x, this.terrain.heightAt(x, z), z), site.yaw + Math.PI, 4,
        { cover: 'ground', emplaced: true, sandbags: true, pool: 'hvt' });
      if (g.defenders.length > n0) this.guns.push(g.defenders[g.defenders.length - 1]);
    }
    for (const [type, lx, lz] of [['mg', 0, -12], ['rifleman', -18, -6], ['rifleman', 18, -6], ['spotter', 0, -20]]) {
      const x = site.x + lx * c + lz * s, z = site.z - lx * s + lz * c;
      g.place(type, new THREE.Vector3(x, this.terrain.heightAt(x, z), z), site.yaw + Math.PI, 4,
        { cover: 'ground', emplaced: true, sandbags: true, pool: 'hvt' });
    }
    this.batteryUp = this.guns.length > 0;
    this.batterySite = site;
  }

  // ── The road in: where the trucks and the general come from, and the
  // checkpoint that holds it.
  _roads(avoid) {
    const net = this.net, o = this.origin;
    if (!net?.nodes?.length) return;
    const span = this.terrain.span;
    // The entry: the node furthest out that is still on the map, on the side
    // away from where the player's guns usually stand (the camera's side).
    const nodes = net.nodes.filter((n) => n && Math.abs(n.x) < span * 0.93 && Math.abs(n.z) < span * 0.93
      && !this.terrain.isWater(n.x, n.z));
    if (nodes.length < 4) return;
    const far = [...nodes].sort((a, b) => Math.hypot(b.x - o.x, b.z - o.z) - Math.hypot(a.x - o.x, a.z - o.z));
    const dest = { x: o.x + (this.exclude + 40), z: o.z };
    for (const entry of far.slice(0, 12)) {
      const ang = Math.atan2(entry.x - o.x, entry.z - o.z);
      const goal = { x: o.x + Math.sin(ang) * (this.exclude + 30), z: o.z + Math.cos(ang) * (this.exclude + 30) };
      const route = roadRoute(net, entry, goal);
      if (!route) continue;
      let len = 0;
      for (let k = 1; k < route.length; k++) len += Math.hypot(route[k].x - route[k - 1].x, route[k].z - route[k - 1].z);
      if (len < 260) continue;
      this.columns.route = route;
      this.columns.length = len;
      // The checkpoint, a little under half way in, on dry ground clear of
      // the other targets.
      for (const f of [0.45, 0.38, 0.52, 0.3, 0.6]) {
        const p = this._along(route, len * f);
        if (this.terrain.isWater(p.x, p.z)) continue;
        if (avoid.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < 60)) continue;
        this.checkpoint = new Checkpoint({ scene: this.scene, terrain: this.terrain, fx: this.fx, desert: this.desert,
          site: { x: p.x, y: this.terrain.heightAt(p.x, p.z), z: p.z, yaw: p.yaw }, onEvent: (k, d) => this.onEvent(k, d) });
        this.checkpoint.guard(this.garrison);
        this.columns.along = len * f;
        break;
      }
      break;
    }
    void dest;
  }

  _along(route, d) {
    let acc = 0;
    for (let k = 1; k < route.length; k++) {
      const a = route[k - 1], b = route[k];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (acc + seg >= d) {
        const t = (d - acc) / Math.max(seg, 1e-3);
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
      }
      acc += seg;
    }
    const b = route[route.length - 1], a = route[route.length - 2];
    return { x: b.x, z: b.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  get supplyCut() { return !!this.depot && !this.depot.alive; }
  get roadCut() { return !!this.checkpoint && !this.checkpoint.alive; }

  update(dt) {
    this.t += dt;
    const b = this.battle;
    if (this.depot) this.depot.update(dt);
    if (this.checkpoint) this.checkpoint.update(dt);
    // What the depot's loss does to the garrison, every frame it holds.
    if (this.garrison) {
      this.garrison.supplyRof = this.supplyCut ? TARGETS.depot.rof : 1;
      this.garrison.tubeRof = this.supplyCut ? TARGETS.depot.tubes : 1;
    }
    // The battery, silenced: the last gun of it down.
    if (this.batteryUp && this.guns && !this.guns.some((d) => d.alive)) {
      this.batteryUp = false;
      b.money += TARGETS.battery.bounty;
      b.counterBatteryUntil = b.elapsed + TARGETS.battery.seconds;
      const s = this.batterySite;
      this.onEvent('batterydown', { point: new THREE.Vector3(s.x, s.y, s.z) });
      this.noteKill(new THREE.Vector3(s.x, s.y, s.z));
    }
    if (b.state === 'playing') {
      this._sendGeneral();
      this._sendColumns();
    }
    for (const c of this.convoys) c.update(dt);
    // The fire mission: its rounds arriving over a few seconds.
    while (this.mission.length && this.mission[0].at <= this.t) this._round(this.mission.shift());
  }

  // ── The general: once, a quarter of the way in, on the road to his post.
  _sendGeneral() {
    const G = this.general, b = this.battle;
    if (G.state !== 'waiting') return;
    if (b.objectiveProgress < TARGETS.general.at && b.elapsed < 300) return;
    G.state = 'skipped';
    const net = this.net;
    if (!net?.nodes?.length) return;
    const hq = b.hq && b.hq.alive ? b.hq : null;
    const goal = hq ? { x: hq.x, z: hq.z } : this.origin;
    // From the edge of the map on the side opposite the trucks' road.
    const span = this.terrain.span;
    const cr = this.columns.route;
    const avoidAng = cr ? Math.atan2(cr[0].x - this.origin.x, cr[0].z - this.origin.z) : 0;
    const nodes = net.nodes.filter((n) => n && Math.abs(n.x) < span * 0.93 && Math.abs(n.z) < span * 0.93
      && Math.hypot(n.x - goal.x, n.z - goal.z) > 450 && !this.terrain.isWater(n.x, n.z));
    nodes.sort((p, q) => {
      const da = (n) => Math.abs(Math.atan2(Math.sin(Math.atan2(n.x - this.origin.x, n.z - this.origin.z) - avoidAng),
        Math.cos(Math.atan2(n.x - this.origin.x, n.z - this.origin.z) - avoidAng)));
      return da(q) - da(p);
    });
    for (const start of nodes.slice(0, 10)) {
      const route = roadRoute(net, start, goal);
      if (!route) continue;
      const C = TARGETS.general;
      const convoy = new Convoy({ scene: this.scene, terrain: this.terrain, fx: this.fx, route,
        kinds: ['truck', 'car', 'truck'], speed: C.speed, hp: C.hp, desert: this.desert, name: 'general',
        onEvent: (k) => { if (k === 'arrive') this._generalArrives(); } });
      G.convoy = convoy;
      G.state = 'driving';
      this.convoys.push(convoy);
      this.onEvent('generalinbound', { eta: Math.round(convoy.length / C.speed), point: new THREE.Vector3(route[0].x, 0, route[0].z) });
      return;
    }
  }

  _generalArrives() {
    const G = this.general;
    if (G.state !== 'driving') return;
    const car = G.convoy.vehicles.find((v) => v.kind === 'car');
    if (!car || !car.alive) return;
    G.state = 'escaped';
    G.convoy.remove();
    this.onEvent('generalescaped', {});
  }

  // ── The columns: trucks up the road every few minutes while it is open.
  _sendColumns() {
    const C = TARGETS.column, col = this.columns, b = this.battle;
    if (!col.route || this.roadCut || col.sent >= C.max) return;
    if (b.objectiveProgress < C.first) return;
    if (this.t < col.next) return;
    col.next = this.t + C.every;
    col.sent++;
    const convoy = new Convoy({ scene: this.scene, terrain: this.terrain, fx: this.fx, route: col.route,
      kinds: ['truck', 'truck'], speed: C.speed, hp: C.hp, desert: this.desert, name: 'column',
      stopAt: col.length - 18,
      onEvent: (k, cv) => { if (k === 'arrive') this._unload(cv); } });
    convoy.men = C.men;
    this.convoys.push(convoy);
    this.onEvent('columninbound', { n: col.sent, eta: Math.round(convoy.stopAt / C.speed) });
  }

  /** The trucks halt and the men get down: at the objective, or at the
   *  roadblock if the road was cut behind them while they were on it. */
  _unload(cv) {
    const live = cv.vehicles.filter((v) => v.alive);
    if (!live.length) return;
    const g = this.garrison;
    const per = Math.ceil(cv.men / live.length);
    let n = 0;
    for (const v of live) {
      for (let k = 0; k < per; k++) {
        const a = (k / per) * Math.PI * 2 + v.i;
        const x = v.x + Math.sin(a) * (5 + (k % 3) * 2.5), z = v.z + Math.cos(a) * (5 + (k % 3) * 2.5);
        if (this.terrain.isWater(x, z)) continue;
        const face = Math.atan2(x - this.origin.x, z - this.origin.z);
        if (g.place(k % 4 === 3 ? 'mg' : 'rifleman', new THREE.Vector3(x, this.terrain.heightAt(x, z), z), face, 4,
          { cover: 'ground', emplaced: true, pool: 'column' })) n++;
      }
    }
    cv.men = 0;
    this.onEvent('columnlanded', { men: n, point: new THREE.Vector3(live[0].x, live[0].y, live[0].z) });
  }

  // ── A burst landing.
  blast(point, radius, power) {
    let pay = 0;
    if (this.depot) {
      const p = this.depot.blast(point, radius, power);
      if (p) { pay += p; this.noteKill(this.depot.point); }
    }
    if (this.checkpoint) {
      const p = this.checkpoint.blast(point, radius, power);
      if (p) {
        pay += p;
        this.noteKill(this.checkpoint.point);
        // Trucks still short of it stop at it.
        for (const c of this.convoys) {
          if (c.name === 'column' && !c.arrived && c.head < this.columns.along - 20) c.stopAt = this.columns.along - 20;
        }
      }
    }
    for (const c of this.convoys) {
      for (const v of c.blast(point, radius, power)) {
        if (c.name === 'general') {
          if (v.kind === 'car') {
            pay += TARGETS.general.car;
            this.general.state = 'killed';
            this.onEvent('generalkilled', { point: new THREE.Vector3(v.x, v.y, v.z) });
            this.noteKill(new THREE.Vector3(v.x, v.y, v.z));
          } else {
            pay += TARGETS.general.escort;
            this.onEvent('escortdown', { point: new THREE.Vector3(v.x, v.y, v.z) });
          }
        } else {
          pay += TARGETS.column.truck;
          // Men still aboard die with it.
          const aboard = c.men > 0 ? Math.ceil(c.men / c.vehicles.length) : 0;
          if (aboard) this.battle._creditKills(aboard, new THREE.Vector3(v.x, v.y, v.z));
          this.onEvent('truckdown', { point: new THREE.Vector3(v.x, v.y, v.z), aboard });
        }
      }
    }
    return pay;
  }

  /** What to mark: the depot, the checkpoint, the guns, the general. */
  points(out) {
    if (this.depot?.alive) out.push({ x: this.depot.x, y: this.depot.y + 2, z: this.depot.z, kind: 'depot' });
    if (this.checkpoint?.alive) out.push({ x: this.checkpoint.x, y: this.checkpoint.y + 2, z: this.checkpoint.z, kind: 'checkpoint' });
    if (this.guns) for (const d of this.guns) if (d.alive) out.push({ x: d.pos.x, y: d.pos.y, z: d.pos.z, kind: 'howitzer' });
    const G = this.general;
    if (G.state === 'driving') for (const v of G.convoy.vehicles) if (v.alive) out.push({ x: v.x, y: v.y, z: v.z, kind: v.kind });
    return out;
  }

  // ── Kill streaks: three high-value targets inside a minute is a fire
  // mission, twelve 155 mm rounds on the nearest one still standing.
  noteKill(point) {
    this.kills.push(this.t);
    this.kills = this.kills.filter((t) => this.t - t <= STREAK.window);
    if (this.kills.length < STREAK.need) return;
    this.kills.length = 0;
    const aim = this._missionTarget(point);
    if (!aim) return;
    for (let k = 0; k < STREAK.rounds; k++) {
      this.mission.push({ at: this.t + 2.5 + (k / STREAK.rounds) * STREAK.seconds + Math.random() * 0.3, aim });
    }
    this.onEvent('firemission', { point: aim.clone(), what: aim.what });
  }

  _missionTarget(from) {
    const b = this.battle;
    const pts = [];
    b.hvtPoints(pts);
    let best = null, bd = Infinity;
    for (const p of pts) {
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return null;
    const v = new THREE.Vector3(best.x, this.terrain.heightAt(best.x, best.z), best.z);
    v.what = best.kind;
    return v;
  }

  /** One round of it, falling from high up on a steep arc. */
  _round({ aim }) {
    const r = Math.sqrt(Math.random()) * STREAK.spread, a = Math.random() * Math.PI * 2;
    const tx = aim.x + Math.cos(a) * r, tz = aim.z + Math.sin(a) * r;
    const ty = this.terrain.heightAt(tx, tz);
    const pos = new THREE.Vector3(tx - 60, ty + 520, tz - 30);
    const vel = new THREE.Vector3(60 / 2.2, -230, 30 / 2.2);
    this.battle.projectiles.fire({
      pos, vel, gravity: 9.81, kind: 'arc', speed: 240, warhead: STREAK.warhead,
      owner: null, target: new THREE.Vector3(tx, ty, tz), trail: 1.2, priority: true,
    });
  }

  // ── Saved with the battle.
  save() {
    return {
      depot: this.depot ? Math.round(this.depot.alive ? this.depot.hp : 0) : null,
      checkpoint: this.checkpoint ? Math.round(this.checkpoint.alive ? this.checkpoint.hp : 0) : null,
      battery: this.batteryUp ? 1 : 0,
      general: this.general.state === 'driving' ? 'waiting' : this.general.state,
      columns: this.columns.sent,
    };
  }

  load(s) {
    if (!s) return;
    const quiet = (t, hp) => {
      if (!t || hp == null) return;
      if (hp > 0) { t.hp = hp; return; }
      const say = t.onEvent, fx = t.fx;
      t.onEvent = () => {}; t.fx = null;
      t.hp = 0.001;
      t.blast({ x: t.x, y: t.y, z: t.z }, 1, 1e6);
      t.onEvent = say; t.fx = fx;
    };
    quiet(this.depot, s.depot);
    quiet(this.checkpoint, s.checkpoint);
    if (!s.battery) this.batteryUp = false;
    if (s.general) this.general.state = s.general === 'skipped' ? 'skipped' : s.general;
    this.columns.sent = s.columns || 0;
  }
}
