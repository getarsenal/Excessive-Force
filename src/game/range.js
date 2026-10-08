/**
 * The Range: a live-fire range for every weapon in the game, out on the
 * Mojave hardpan at Fort Irwin, on the normal battle pipeline (level
 * `range`, src/game/levels.js), so a gun laid here is laid the way it is
 * laid in a fight.
 *
 * Open sky over it, so a mortar's arc and an aircraft overhead are seen
 * whole (an indoor hall's ceiling cut both off). A graded floor three
 * hundred metres wide painted with the lanes, the distances and the firing
 * line, fading into the sand at its edges; low earth berms down both
 * sides; distance boards on posts; the range control tower and the red
 * flag behind the line; creosote and rock beyond. The firing line is the
 * level's origin; the lanes run down -z to the bullet trap, an earth berm
 * five hundred and sixty metres out (the level's one Structure, so the
 * pipeline has a monument to hang its readouts on, hidden here).
 *
 * Four lanes, by what they are for:
 *   A  paper silhouettes on target gantries at 50, 100 and 150: hit, they
 *      flip flat and rise again a few seconds later
 *   B  knock-down steel poppers at 100, 200 and 300: a hinge at the base,
 *      down with a clang, back up after five seconds
 *   C  gongs on chains at 300, 400 and 500: hit, they swing and ring, and
 *      never stop being targets
 *   D  the block shack at 180: a hundred and sixty cinder blocks, every one
 *      its own body; a blast near it throws them (the engine's own debris
 *      budget takes them from there), and when they have settled it
 *      rebuilds itself, the blocks flying back to their courses
 * and over the far third of the range two target drones on a racetrack,
 * for the machine guns (they are published to `battle.enemyAir`, so a team
 * engages them on its own, and the hand-laid burst finds them through
 * `battle.extraTargets`); a shell that passes within a few metres of one
 * takes it down too.
 *
 * Hits arrive from the battle: `hit(owner, point, w)` for a round into a
 * target's collider (every collider's owner carries `range`), and
 * `blast(point, w)` for every impact on the map, which is what moves the
 * shack and knocks a popper over from a near miss. `update(dt)` runs the
 * targets, the drones and the rebuild, and keeps the board.
 */
import * as THREE from 'three';
import { PhysicsWorld } from '../core/physics.js';

// Four lanes seventy metres apart, and the graded floor they are painted on.
const LANE = { A: -105, B: -35, C: 35, D: 105 };
const FIELD = { x: 150, zFront: 60, zBack: -600 };
const BLOCK = { hx: 1.0, hy: 0.5, hz: 0.5 };   // a block of the shack, half extents: big, as everything on this map is

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3(), _q2 = new THREE.Quaternion();

function mat(color, rough = 0.85, metal = 0.05, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

/** Text on a canvas, for the boards and the floor. */
function textTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Range {
  constructor({ scene, physics, terrain, battle, fx, audio = null, origin, groundY, quality = null }) {
    this.scene = scene; this.physics = physics; this.terrain = terrain; this.battle = battle;
    this.fx = fx; this.audio = audio; this.origin = origin.clone(); this.groundY = groundY;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.position.set(origin.x, groundY, origin.z);
    scene.add(this.group);
    this.targets = [];      // paper, poppers, gongs
    this.drones = [];
    this.score = { hits: 0, paper: 0, poppers: 0, gongs: 0, drones: 0, shacks: 0 };
    // Rounds fired down the range, and how many of them found something:
    // battle opens a round (`open`) before it lands or strikes, and the
    // first target it scores closes it on target (`_scored`).
    this.rounds = 0; this.onTarget = 0; this._open = false;
    this.time = 0;
    this._board = null;
    this._boardText = '';
    this._buildGrounds();
    this._buildFloor();
    this._buildLanes();
    this._buildShack();
    this._buildDrones();
    battle.range = this;
    battle.extraTargets = this.targets.map((t) => t.hitbox).concat(this.drones.map((d) => d.hitbox));
  }

  /** World position of a range-local point. */
  world(x, y, z, out = new THREE.Vector3()) {
    return out.set(this.origin.x + x, this.groundY + y, this.origin.z + z);
  }

  // ── The grounds ─────────────────────────────────────────────────

  _buildGrounds() {
    const g = this.group;
    const sand = mat(0xc9b28a, 1, 0), post = mat(0x5d5a52, 0.8, 0.2), white = mat(0xf2ead6, 0.9, 0);
    // Low earth berms down both sides of the floor, sloped, to frame the
    // lanes without hiding a single round in the sky.
    const shape = new THREE.Shape();
    shape.moveTo(-9, 0); shape.lineTo(-2.5, 4.2); shape.lineTo(2.5, 4.2); shape.lineTo(9, 0); shape.closePath();
    const L = FIELD.zFront - FIELD.zBack - 30;
    const bermGeo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(bermGeo, sand);
      b.position.set(sx * (FIELD.x + 12), 0, FIELD.zFront - 10 - L);
      b.receiveShadow = true; b.castShadow = true;
      g.add(b);
    }
    // The distance boards on their posts, both sides, facing the line.
    for (const d of [50, 100, 150, 200, 300, 400, 500]) {
      const tex = textTexture(256, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f2ead6'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#14161a'; ctx.font = 'bold 92px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(d), w / 2, h / 2 + 4);
      });
      const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      for (const sx of [-1, 1]) {
        const x = sx * (FIELD.x - 4);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), boardMat); board.position.set(x, 7, -d); g.add(board);
        for (const px of [-3.6, 3.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 0.3), post); p.position.set(x + px, 3.5, -d - 0.2); g.add(p); }
      }
    }
    // Range control behind the line on the left: a cab on legs, its
    // windows all round, and the red flag beside it (a range is hot while
    // the flag flies, and this one always is).
    const tx = -FIELD.x + 28, tz = 44;
    for (const [px, pz] of [[-3.6, -2.6], [3.6, -2.6], [-3.6, 2.6], [3.6, 2.6]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), post); leg.position.set(tx + px, 4, tz + pz); g.add(leg);
    }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(9, 4.6, 7), mat(0xd9cfb8, 0.9, 0)); cab.position.set(tx, 10.3, tz); cab.castShadow = true; g.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(9.1, 1.8, 7.1), mat(0x23303a, 0.25, 0.6)); glass.position.set(tx, 11, tz); g.add(glass);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 9), mat(0x6b5a48, 0.8, 0.1)); roof.position.set(tx, 12.85, tz); roof.castShadow = true; g.add(roof);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 9), post); deck.position.set(tx, 7.9, tz); g.add(deck);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 18, 8), mat(0xd6d6d0, 0.5, 0.6)); pole.position.set(tx + 12, 9, tz - 2); g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(5, 3.2, 8, 1); flagGeo.translate(2.5, 0, 0);
    this.flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0xd8261a, roughness: 0.9, side: THREE.DoubleSide }));
    this.flag.position.set(tx + 12, 16.2, tz - 2); g.add(this.flag);
    this._flagBase = Float32Array.from(flagGeo.attributes.position.array);
    // Lane numbers on posts at the line, either side of each lane.
    for (const [k, x] of Object.entries(LANE)) {
      const tex = textTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#d9b43a'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#14161a'; ctx.font = 'bold 96px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k, w / 2, h / 2 + 4);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      sign.position.set(x - 20, 3.6, -2); g.add(sign);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 0.25), post); p.position.set(x - 20, 1.8, -2.2); g.add(p);
    }
    void white;
    this._buildScrub();
  }

  /** Creosote and rock on the open desert round the graded floor, never on it. */
  _buildScrub() {
    const rnd = (() => { let a = 1234567; return () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(0x6f7552, 1, 0), 320);
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(0x9a8a72, 0.95, 0), 120);
    let nb = 0, nr = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < 2000 && (nb < 320 || nr < 120); i++) {
      const x = (rnd() - 0.5) * 1500, z = 160 - rnd() * 1000;
      // Off the floor and its berms, and off the apron behind the line.
      if (Math.abs(x) < FIELD.x + 26 && z < FIELD.zFront + 40 && z > FIELD.zBack - 30) continue;
      const w = this.world(x, 0, z);
      const y = (this.terrain?.heightAt ? this.terrain.heightAt(w.x, w.z) : this.groundY) - this.groundY;
      const isRock = rnd() < 0.27;
      if (isRock && nr < 120) {
        const r = 0.5 + rnd() * 1.6;
        e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e); sc.set(r * (1 + rnd()), r * 0.6, r);
        m.compose(p.set(x, y + r * 0.2, z), q, sc); rock.setMatrixAt(nr++, m);
      } else if (!isRock && nb < 320) {
        const r = 0.6 + rnd() * 1.1;
        q.setFromAxisAngle(UP, rnd() * 6.28); sc.set(r * 1.3, r * 0.8, r * 1.3);
        m.compose(p.set(x, y + r * 0.45, z), q, sc); bush.setMatrixAt(nb++, m);
      }
    }
    bush.count = nb; rock.count = nr;
    for (const im of [bush, rock]) { im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.frustumCulled = false; this.group.add(im); }
  }

  _buildFloor() {
    const W = FIELD.x * 2, L = FIELD.zFront - FIELD.zBack;
    const tex = textTexture(1024, 2048, (ctx, w, h) => {
      // The plane lies with its top edge down-range: canvas row nought is the far end.
      const X = (x) => (x + FIELD.x) / W * w, Y = (z) => (z - FIELD.zBack) / L * h;
      ctx.fillStyle = '#cdb994'; ctx.fillRect(0, 0, w, h);
      // Grader passes and speckle, so it reads as ground and not as paint.
      const rnd = (() => { let a = 99991; return () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
      for (let i = 0; i < 9000; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,100,70,0.10)' : 'rgba(255,245,220,0.10)'; ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 2 + rnd() * 5); }
      ctx.strokeStyle = 'rgba(110,92,64,0.16)'; ctx.lineWidth = 10;
      for (const x of Object.values(LANE)) for (const dx of [-6, 6]) { ctx.beginPath(); ctx.moveTo(X(x + dx), Y(0)); ctx.lineTo(X(x + dx), Y(-560)); ctx.stroke(); }
      // The apron behind the line, where the guns stand: a pale pad, so a
      // dark gun can be seen where it was put down.
      ctx.fillStyle = '#e4dccb'; ctx.fillRect(X(-FIELD.x + 10), Y(FIELD.zFront - 6), X(FIELD.x - 10) - X(-FIELD.x + 10), Y(1.5) - Y(FIELD.zFront - 6));
      // Lane dividers, white lime, the length of the range.
      ctx.strokeStyle = 'rgba(248,244,232,0.9)'; ctx.lineWidth = 6;
      for (const x of [-70, 0, 70]) { ctx.beginPath(); ctx.moveTo(X(x), Y(-6)); ctx.lineTo(X(x), Y(-560)); ctx.stroke(); }
      // The firing line, red, and its legend.
      ctx.fillStyle = '#c8321e'; ctx.fillRect(0, Y(1.5), w, Y(-1.5) - Y(1.5));
      ctx.fillStyle = '#7a1c12'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FIRING LINE', w / 2, Y(7));
      // Distance stripes and their figures, read from the line.
      for (const d of [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]) {
        ctx.fillStyle = 'rgba(248,244,232,0.55)'; ctx.fillRect(0, Y(-d + 0.6), w, Y(-d - 0.6) - Y(-d + 0.6));
        ctx.fillStyle = 'rgba(248,244,232,0.85)'; ctx.font = 'bold 52px sans-serif';
        for (const x of Object.values(LANE)) ctx.fillText(String(d), X(x), Y(-d + 7));
      }
      ctx.font = 'bold 40px sans-serif'; ctx.fillStyle = '#9a7a1c';
      for (const [k, x] of Object.entries(LANE)) ctx.fillText(k, X(x), Y(-4));
      // Into the sand at the edges: the floor is graded ground, not a slab.
      ctx.globalCompositeOperation = 'destination-in';
      const fx = ctx.createLinearGradient(0, 0, w, 0);
      fx.addColorStop(0, 'rgba(0,0,0,0)'); fx.addColorStop(0.06, 'rgba(0,0,0,1)'); fx.addColorStop(0.94, 'rgba(0,0,0,1)'); fx.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fx; ctx.fillRect(0, 0, w, h);
      const fz = ctx.createLinearGradient(0, 0, 0, h);
      fz.addColorStop(0, 'rgba(0,0,0,0)'); fz.addColorStop(0.05, 'rgba(0,0,0,1)'); fz.addColorStop(0.97, 'rgba(0,0,0,1)'); fz.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fz; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.97, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.08, (FIELD.zFront + FIELD.zBack) / 2);
    floor.receiveShadow = true;
    floor.renderOrder = 1;
    this.group.add(floor);
  }

  // ── The targets ───────────────────────────────────────────────────

  _buildLanes() {
    // Lane A: paper silhouettes on their gantries.
    for (const [z, dx] of [[-50, -14], [-100, 0], [-150, 14]]) this._paper(LANE.A + dx, z);
    // Lane B: the poppers.
    for (const [z, dx] of [[-100, -18], [-200, 0], [-300, 18]]) this._popper(LANE.B + dx, z);
    // Lane C: the gongs on their frames.
    for (const [z, size, dx] of [[-300, 3.4, -20], [-400, 4.2, 0], [-500, 5.2, 20]]) this._gong(LANE.C + dx, z, size);
    // The tank plate at the end of lane D, past the shack.
    this._gong(LANE.D, -460, 7.0, true);
  }

  _collider(x, y, z, hx, hy, hz, owner, kinematic = false) {
    const p = this.world(x, y, z);
    const body = this.physics.createFixedBox({ x: p.x, y: p.y, z: p.z }, { x: hx, y: hy, z: hz }, { x: 0, y: 0, z: 0, w: 1 }, owner, { density: 7.8 });
    if (kinematic) body.setBodyType(this.physics.rapier.RigidBodyType.KinematicPositionBased, true);
    return body;
  }

  /** A paper silhouette in a frame hanging from the cable: hit, it lies flat; it is back up in four seconds. */
  _paper(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 11.5, z);
    const gantry = mat(0x6a6f74, 0.6, 0.4);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 0.3), gantry); g.add(bar);
    // The gantry's legs, down to the ground either side of the target.
    for (const sx of [-3.1, 3.1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 11.5, 0.3), gantry); leg.position.set(sx, -11.5 / 2, 0); g.add(leg); }
    const pivot = new THREE.Group(); pivot.position.y = -0.2; g.add(pivot);
    const tex = textTexture(128, 192, (ctx, w, h) => {
      ctx.fillStyle = '#d8c9a5'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3e4a33';
      // The man: head, shoulders, body.
      ctx.beginPath(); ctx.arc(w / 2, 34, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w / 2 - 16, 50); ctx.lineTo(w / 2 + 16, 50); ctx.lineTo(w / 2 + 46, 78); ctx.lineTo(w / 2 + 46, h); ctx.lineTo(w / 2 - 46, h); ctx.lineTo(w / 2 - 46, 78); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1b1e22'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide }));
    sheet.position.y = -2.9; pivot.add(sheet);
    for (const sx of [-1.5, 1.5]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.8, 0.12), mat(0x6a6f74, 0.6, 0.4)); s.position.set(sx, -2.9, -0.08); pivot.add(s); }
    this.group.add(g);
    const t = { kind: 'paper', x, z, pivot, down: 0, angle: 0, body: null };
    t.body = this._collider(x, 11.5 - 3.1, z, 1.85, 2.8, 0.15, { range: 'paper', t });
    t.hitbox = { get alive() { return t.down <= 0; }, pos: this.world(x, 8.4, z), r: 2.6, hit: (dmg, u) => this.hit({ range: 'paper', t }, null, null, u) };
    this.targets.push(t);
  }

  /** A steel popper on its hinge: hit, it falls back; it stands again in five seconds. */
  _popper(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 3.2), mat(0x4a4e52, 0.7, 0.4)); base.position.y = 0.35; g.add(base);
    const pivot = new THREE.Group(); pivot.position.y = 0.7; g.add(pivot);
    const plateMat = mat(0xe9eef2, 0.5, 0.6);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.2), plateMat); stem.position.y = 1.2; pivot.add(stem);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.0, 4.0, 0.2), plateMat); plate.position.y = 2.4 + 2.0; pivot.add(plate);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 14), plateMat); head.rotation.x = Math.PI / 2; head.position.y = 2.4 + 4.0 + 1.0; pivot.add(head);
    this.group.add(g);
    const t = { kind: 'popper', x, z, pivot, down: 0, angle: 0, body: null };
    t.body = this._collider(x, 0.7 + 4.0, z, 1.5, 4.0, 0.3, { range: 'popper', t });
    t.hitbox = { get alive() { return t.down <= 0; }, pos: this.world(x, 5.0, z), r: 2.6, hit: (dmg, u) => this.hit({ range: 'popper', t }, null, null, u) };
    this.targets.push(t);
  }

  /** A gong on two chains from a frame: hit, it swings and rings. The tank plate is the same thing, bigger. */
  _gong(x, z, size, tank = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const steel = mat(0x4a4e52, 0.7, 0.4);
    const top = size * 1.9 + 1.2;
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, top, 0.6), steel); post.position.set(sx * (size * 0.9 + 0.6), top / 2, 0); g.add(post); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(size * 1.8 + 2.4, 0.6, 0.6), steel); bar.position.y = top; g.add(bar);
    const pivot = new THREE.Group(); pivot.position.y = top - 0.3; g.add(pivot);
    const chainMat = new THREE.LineBasicMaterial({ color: 0x9aa0a6 });
    const drop = size * 0.9;
    for (const sx of [-0.4, 0.4]) {
      const chain = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sx * size, 0, 0), new THREE.Vector3(sx * size, -drop, 0)]), chainMat);
      pivot.add(chain);
    }
    const plateMat = tank ? mat(0x6f7a66, 0.6, 0.5) : mat(0xe4e9ee, 0.45, 0.65);
    const plate = tank
      ? new THREE.Mesh(new THREE.BoxGeometry(size * 1.9, size * 1.2, 0.3), plateMat)
      : new THREE.Mesh(new THREE.CylinderGeometry(size, size, 0.25, 18), plateMat);
    if (!tank) plate.rotation.x = Math.PI / 2;
    plate.position.y = -drop - (tank ? size * 0.6 : size);
    pivot.add(plate);
    if (tank) {
      // A turret and a gun on the plate, so it reads as what it is.
      const tur = new THREE.Mesh(new THREE.BoxGeometry(size * 0.8, size * 0.4, 0.3), plateMat); tur.position.set(0, -drop - size * 0.2 + 0.1, 0); pivot.add(tur);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(size * 1.1, 0.3, 0.3), plateMat); gun.position.set(-size * 0.75, -drop - size * 0.2 + 0.1, 0); pivot.add(gun);
    }
    this.group.add(g);
    const cy = top - 0.3 - drop - (tank ? size * 0.6 : size);
    const t = { kind: 'gong', x, z, pivot, size, tank, swing: 0, swingV: 0, ring: 0, body: null, cy, top: top - 0.3 };
    const hx = tank ? size * 0.95 : size, hy = tank ? size * 0.6 : size;
    t.body = this._collider(x, cy, z, hx, hy, 0.2, { range: 'gong', t }, true);
    t.hitbox = { alive: true, pos: this.world(x, cy, z), r: Math.max(hx, hy), hit: (dmg, u) => this.hit({ range: 'gong', t }, null, { power: 60 }, u) };
    this.targets.push(t);
  }

  // ── The shack ─────────────────────────────────────────────────────

  _buildShack() {
    const x0 = LANE.D, z0 = -180;
    const homes = [];
    const bx = BLOCK.hx * 2, by = BLOCK.hy * 2, bz = BLOCK.hz * 2;
    const W = 18, D = 12, H = 8;
    const rows = Math.round(H / by);
    // Four walls in stretcher bond, a door in the front, a window in each side, and a roof of slabs.
    const place = (x, y, z, ry) => homes.push({ x, y, z, ry });
    for (let r = 0; r < rows; r++) {
      const y = BLOCK.hy + r * by, off = (r % 2) * bx * 0.5;
      // Front and back (along x), the door in the front.
      for (let x = -W / 2 + BLOCK.hx + off; x < W / 2; x += bx) {
        const door = Math.abs(x) < 1.6 && r < Math.round(5.0 / by);
        if (!door) place(x, y, D / 2 - BLOCK.hz, 0);
        place(x, y, -D / 2 + BLOCK.hz, 0);
      }
      // Sides (along z), a window each at mid height.
      for (let z = -D / 2 + bz * 1.2 + off; z < D / 2 - bz; z += bx) {
        const win = Math.abs(z) < 1.8 && r >= Math.round(3.0 / by) && r < Math.round(5.5 / by);
        if (!win) { place(W / 2 - BLOCK.hx + 0.0, y, z, Math.PI / 2); place(-W / 2 + BLOCK.hx, y, z, Math.PI / 2); }
      }
    }
    // The roof: slabs laid across, as blocks the width of the shack would be heavy; three courses of long blocks.
    for (let z = -D / 2 + BLOCK.hz; z < D / 2; z += bz) {
      for (let x = -W / 2 + BLOCK.hx; x < W / 2; x += bx) place(x, H + BLOCK.hy, z, 0);
    }
    const n = homes.length;
    const geo = new THREE.BoxGeometry(bx, by, bz);
    const m = new THREE.InstancedMesh(geo, mat(0x9a9590, 0.92, 0.0), n);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    const blocks = [];
    for (let i = 0; i < n; i++) {
      const h = homes[i];
      const pos = this.world(x0 + h.x, h.y, z0 + h.z);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, h.ry);
      _m.compose(pos, q, _s);
      m.setMatrixAt(i, _m);
      col.setHSL(0.08, 0.05, 0.52 + (Math.random() - 0.5) * 0.12);
      m.setColorAt(i, col);
      const owner = { range: 'shack', i };
      const body = this.physics.createFixedBox({ x: pos.x, y: pos.y, z: pos.z }, { x: BLOCK.hx, y: BLOCK.hy, z: BLOCK.hz }, { x: q.x, y: q.y, z: q.z, w: q.w }, owner, { density: 2.2 });
      blocks.push({ home: pos, q, body, owner, moved: false, from: null, fromQ: null });
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.scene.add(m);
    this.shack = { mesh: m, blocks, centre: this.world(x0, H / 2, z0), lastBlast: -1e9, rebuilding: 0, built: true, hits: 0 };
  }

  /** A blast near the shack: the blocks within reach are thrown. */
  _shackBlast(point, w) {
    const S = this.shack;
    if (!S || S.rebuilding > 0) return;
    const R = Math.max(9, (w?.radius || 3) * 1.8 + 7);
    if (point.distanceTo(S.centre) > R + 6) return;
    const power = Math.max(200, w?.power || 600);
    let thrown = 0;
    for (const b of S.blocks) {
      if (!PhysicsWorld.alive(b.body)) continue;
      const t = b.body.translation();
      const dx = t.x - point.x, dy = t.y - point.y, dz = t.z - point.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const v = THREE.MathUtils.clamp(power / 240 * (1 - d / R) + 3, 3, 19);
      // The block's own mass, from its density and volume: a fixed body
      // reports none until it is dynamic, and the throw is sized before.
      const mass = 2.2 * 8 * BLOCK.hx * BLOCK.hy * BLOCK.hz;
      const k = v * mass / (d || 1);
      this.physics.promote(b.body, { x: dx * k, y: Math.abs(dy) * k * 0.5 + 0.3 * v * mass, z: dz * k }, true);
      b.moved = true;
      thrown++;
    }
    if (thrown) { S.lastBlast = this.time; S.built = false; S.hits++; this._scored(); }
  }

  _shackUpdate(dt) {
    const S = this.shack;
    if (!S) return;
    const m = S.mesh;
    if (S.rebuilding > 0) {
      // The blocks fly home: each from where it lay, eased, to its course.
      S.rebuilding = Math.max(0, S.rebuilding - dt);
      const k = 1 - S.rebuilding / 1.4, e = k * k * (3 - 2 * k);
      for (let i = 0; i < S.blocks.length; i++) {
        const b = S.blocks[i];
        if (!b.from) continue;
        _p.lerpVectors(b.from, b.home, e);
        _p.y += Math.sin(e * Math.PI) * 3;
        _q2.slerpQuaternions(b.fromQ, b.q, e);
        _m.compose(_p, _q2, _s); m.setMatrixAt(i, _m);
        if (S.rebuilding <= 0) { b.from = null; b.fromQ = null; }
      }
      m.instanceMatrix.needsUpdate = true;
      if (S.rebuilding <= 0) { S.built = true; this.score.shacks++; }
      return;
    }
    // Follow the thrown blocks.
    let moving = 0, moved = 0;
    for (let i = 0; i < S.blocks.length; i++) {
      const b = S.blocks[i];
      if (!b.moved) continue;
      moved++;
      if (!PhysicsWorld.alive(b.body)) continue;
      const t = b.body.translation(), r = b.body.rotation();
      _p.set(t.x, t.y, t.z); _q2.set(r.x, r.y, r.z, r.w);
      _m.compose(_p, _q2, _s); m.setMatrixAt(i, _m);
      if (this.physics.dynamicSet.has(b.body)) { const v = b.body.linvel(); if (v.x * v.x + v.y * v.y + v.z * v.z > 0.05) moving++; }
    }
    if (moved) m.instanceMatrix.needsUpdate = true;
    // Settled, or long enough: the shack puts itself back together.
    const since = this.time - S.lastBlast;
    if (moved && ((moving === 0 && since > 2.5) || since > 9)) this._shackRebuild();
  }

  _shackRebuild() {
    const S = this.shack;
    const rapier = this.physics.rapier;
    for (let i = 0; i < S.blocks.length; i++) {
      const b = S.blocks[i];
      if (!b.moved) continue;
      // Where it lies now, for the flight home; then the body is home already.
      if (PhysicsWorld.alive(b.body)) {
        const t = b.body.translation(), r = b.body.rotation();
        b.from = new THREE.Vector3(t.x, t.y, t.z); b.fromQ = new THREE.Quaternion(r.x, r.y, r.z, r.w);
        this.physics.dynamicSet.delete(b.body);
        b.body.setBodyType(rapier.RigidBodyType.Fixed, true);
        b.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        b.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        b.body.setTranslation({ x: b.home.x, y: b.home.y, z: b.home.z }, true);
        b.body.setRotation({ x: b.q.x, y: b.q.y, z: b.q.z, w: b.q.w }, true);
        b.body.__frozen = false;
      } else {
        // Culled by the world (fallen off the map, recycled): a new body at home.
        b.from = b.home.clone().setY(b.home.y + 30); b.fromQ = b.q.clone();
        b.body = this.physics.createFixedBox({ x: b.home.x, y: b.home.y, z: b.home.z }, { x: BLOCK.hx, y: BLOCK.hy, z: BLOCK.hz }, { x: b.q.x, y: b.q.y, z: b.q.z, w: b.q.w }, b.owner, { density: 2.2 });
      }
      b.moved = false;
    }
    S.rebuilding = 1.4;
    if (this.audio) this.audio.play('gun', S.centre, { gain: 0.25, rate: 1.8, rolloff: 300 });
  }

  // ── The drones ────────────────────────────────────────────────────

  _buildDrones() {
    const make = (phase, y, dir) => {
      const g = new THREE.Group();
      const orange = mat(0xff6a1a, 0.6, 0.1), dark = mat(0x1d1f22, 0.7, 0.3);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.36, 5.2, 8), orange); body.rotation.x = Math.PI / 2; g.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 8), orange); nose.rotation.x = Math.PI / 2; nose.position.z = 3.1; g.add(nose);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.14, 1.1), orange); wing.position.z = 0.4; g.add(wing);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.9), orange); fin.position.set(0, 0.7, -2.2); g.add(fin);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.8), orange); tail.position.set(0, 0.2, -2.2); g.add(tail);
      const prop = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.08), dark); prop.position.z = -2.8; g.add(prop);
      // The tow and the sleeve behind it, the classic banner target.
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 6.0, 8, 1, true), mat(0xffd23a, 0.9, 0, { side: THREE.DoubleSide })); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = -16; g.add(sleeve);
      const tow = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 0, -13)]), new THREE.LineBasicMaterial({ color: 0xbbbbbb })); g.add(tow);
      this.scene.add(g);
      const d = { g, prop, phase, y0: y, dir, alive: true, health: 24, exposure: 1, armour: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        dead: false, respawn: 0, spin: 0, smoke: 0, trail: null };
      d.hit = (dmg, u) => this._droneHit(d, dmg, u);
      d.hitbox = { get alive() { return d.alive; }, pos: d.pos, r: 4.5, hit: (dmg, u) => this._droneHit(d, dmg * 2, u) };
      this._dronePlace(d, 0);
      return d;
    };
    this.drones.push(make(0, 45, 1), make(Math.PI, 62, -1));
  }

  /** The racetrack over the far third of the range: two straights across the lanes and two turns. */
  _dronePlace(d, dt) {
    // Across all four lanes, inside the berms.
    const speed = 40, R = 40, straight = 140;
    const per = (2 * straight + 2 * Math.PI * R) / speed;
    d.phase = (d.phase + d.dir * dt / per * Math.PI * 2 + Math.PI * 2) % (Math.PI * 2);
    // Position on a stadium: parametrised by angle for simplicity, scaled.
    const a = d.phase;
    const cx = 0, cz = -430;
    const x = Math.cos(a) * (straight / 2 + R), z = Math.sin(a) * (R + 40) * 1.5;
    const y = d.y0 + Math.sin(a * 2 + d.y0) * 6;
    const prev = _v.copy(d.pos);
    this.world(cx + x, y, cz + z, d.pos);
    if (dt > 0) d.vel.subVectors(d.pos, prev).multiplyScalar(1 / dt);
    d.g.position.copy(d.pos);
    if (dt > 0 && d.vel.lengthSq() > 1) {
      _p.copy(d.pos).add(d.vel);
      d.g.lookAt(_p);
      d.g.rotateZ(-d.dir * 0.35);
    }
  }

  _droneHit(d, dmg, u) {
    if (!d.alive) return;
    d.health -= dmg;
    this._scored();
    this.fx?.impactDust?.(d.pos.x, d.pos.y, d.pos.z, 0.3);
    if (d.health <= 0) {
      d.alive = false; d.dead = true; d.spin = 0; d.respawn = 7;
      this.score.drones++;
      this.fx?.detonate?.(d.pos.clone(), 0.5, { air: true });
      if (this.audio) this.audio.play('explosion', d.pos, { gain: 0.5, rate: 1.3, rolloff: 400 });
      if (u) u.kills = (u.kills || 0) + 1;
      this.battle.onEvent?.('rangedrone', { point: d.pos.clone(), unit: u || null });
    }
  }

  _dronesUpdate(dt) {
    for (const d of this.drones) {
      if (d.dead) {
        // Down it comes, spinning, smoking, and goes off on the floor.
        d.spin += dt;
        d.vel.y -= 9.81 * dt;
        d.vel.x *= 0.995; d.vel.z *= 0.995;
        d.pos.addScaledVector(d.vel, dt);
        d.g.position.copy(d.pos);
        d.g.rotation.z += dt * 5; d.g.rotation.x += dt * 2.2;
        d.smoke -= dt;
        if (d.smoke <= 0) { d.smoke = 0.07; this.fx?.trail?.(d.pos, 1.3); }
        if (d.pos.y <= this.groundY + 0.5) {
          d.dead = false; d.g.visible = false;
          this.fx?.detonate?.(d.pos.clone(), 0.8);
          if (this.audio) this.audio.play('explosion', d.pos, { gain: 0.6, rate: 1.0, rolloff: 400 });
        }
        continue;
      }
      if (!d.alive) {
        d.respawn -= dt;
        if (d.respawn <= 0) { d.alive = true; d.health = 24; d.g.visible = true; d.g.rotation.set(0, 0, 0); this._dronePlace(d, 0); }
        continue;
      }
      this._dronePlace(d, dt);
      d.prop.rotation.z += dt * 40;
    }
    // A shell through a drone takes it down: the rounds in the air, against each drone.
    const list = this.battle.projectiles?.list;
    if (list) {
      for (const p of list) {
        if (!p.alive || p.pos.y < this.groundY + 20) continue;
        for (const d of this.drones) {
          if (!d.alive) continue;
          if (p.pos.distanceToSquared(d.pos) < 6 * 6) {
            this._droneHit(d, 100, p.owner || null);
            p.alive = false;
            this.fx?.detonate?.(p.pos.clone(), 0.6, { air: true });
          }
        }
      }
    }
  }

  // ── Hits ──────────────────────────────────────────────────────────

  /** A round into a target's collider (`owner.range`), or a hand burst's find. */
  hit(owner, point, w, unit = null) {
    const t = owner.t;
    switch (owner.range) {
      case 'shack':
        // The blast that follows the round (`blast`) throws the blocks;
        // counting the round as well threw them twice as hard.
        return;
      case 'paper':
        if (t.down > 0) return;
        t.down = 4.0; t.body.setEnabled(false);
        this._scored(); this.score.paper++;
        this._clang(t, 0.5, 1.6);
        return;
      case 'popper':
        if (t.down > 0) return;
        t.down = 5.0; t.body.setEnabled(false);
        this._scored(); this.score.poppers++;
        this._clang(t, 0.8, 0.9);
        return;
      case 'gong': {
        const power = Math.max(40, w?.power || 400);
        const kick = THREE.MathUtils.clamp(power / 900, 0.6, 3.2) * (t.tank ? 0.6 : 1);
        // Hit on a side, it swings away from the shooter: the line is +z toward the firing line.
        t.swingV -= kick;
        t.ring = 1;
        this._scored(); this.score.gongs++;
        this._clang(t, 1.0, t.tank ? 0.55 : 1.1 - t.size * 0.12);
        return;
      }
      default:
    }
  }

  /** A round down the range, landing or striking now. */
  open() { this.rounds++; this._open = true; }
  close() { this._open = false; }
  _scored() {
    this.score.hits++;
    if (this._open) { this._open = false; this.onTarget++; }
  }

  _clang(t, gain, rate) {
    if (!this.audio) return;
    this.audio.play('gun', this.world(t.x, 2, t.z), { gain: gain * 0.35, rate: Math.max(0.3, rate) * 1.6, rolloff: 320 });
  }

  /** Every impact on the map: the shack within reach is thrown, a popper close enough goes over. */
  blast(point, w) {
    this._shackBlast(point, w);
    const r = (w?.radius || 2) * 1.2 + 1.5;
    for (const t of this.targets) {
      if (t.kind === 'gong') {
        const d = point.distanceTo(t.hitbox.pos);
        if (d < r * 2.5) { t.swingV -= THREE.MathUtils.clamp((w?.power || 400) / 1200, 0.2, 1.5) * (1 - d / (r * 2.5)); t.ring = Math.max(t.ring, 0.6); }
        continue;
      }
      if (t.down > 0) continue;
      if (point.distanceTo(t.hitbox.pos) < r) this.hit({ range: t.kind, t }, point, w);
    }
  }

  // ── The frame ─────────────────────────────────────────────────────

  update(dt) {
    // The red flag in the desert wind.
    if (this.flag) {
      const a = this.flag.geometry.attributes.position, b = this._flagBase, t = this.time;
      for (let k = 0; k < a.count; k++) { const x = b[k * 3]; a.setZ(k, Math.sin(t * 5.5 - x * 1.3) * 0.32 * (x / 5)); }
      a.needsUpdate = true;
    }
    this.time += dt;
    for (const t of this.targets) {
      if (t.kind === 'gong') {
        // A pendulum on its chains, damped; the plate's collider rides it.
        const L = t.size * 0.9 + t.size;
        const acc = -(9.81 / L) * Math.sin(t.swing) - t.swingV * 0.35;
        t.swingV += acc * dt;
        t.swing += t.swingV * dt;
        t.pivot.rotation.x = t.swing;
        t.ring = Math.max(0, t.ring - dt * 0.6);
        if (Math.abs(t.swing) > 0.002 || Math.abs(t.swingV) > 0.002) {
          const dy = t.top - (t.top - t.cy) * Math.cos(t.swing), dz = (t.top - t.cy) * Math.sin(t.swing);
          const p = this.world(t.x, dy, t.z + dz, _p);
          t.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
          _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.swing);
          t.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
          t.hitbox.pos.copy(p);
        }
        continue;
      }
      // Paper and poppers: down, and back up.
      if (t.down > 0) {
        t.down -= dt;
        const target = t.kind === 'paper' ? -Math.PI / 2 : -Math.PI / 2 + 0.1;
        t.angle += (target - t.angle) * Math.min(1, dt * (t.kind === 'paper' ? 7 : 10));
        if (t.down <= 0) { t.down = 0; t.body.setEnabled(true); }
      } else if (t.angle < -0.001) {
        t.angle += (0 - t.angle) * Math.min(1, dt * 3.5);
        if (t.angle > -0.001) t.angle = 0;
      }
      t.pivot.rotation.x = t.angle;
    }
    this._shackUpdate(dt);
    this._dronesUpdate(dt);
    // The machine guns' sky: the drones, for the teams that pick their own targets.
    const air = this.battle.enemyAir;
    if (air) for (const d of this.drones) if (d.alive) air.push(d);
    this._boardUpdate();
  }

  /** The tally, on the top bar where the monument's readout would be. */
  _boardUpdate() {
    if (!this._board) {
      const host = document.querySelector('#topbar .tb-center');
      if (!host) return;
      const el = document.createElement('div');
      el.id = 'range-board';
      host.appendChild(el);
      this._board = el;
    }
    const s = this.score;
    const acc = this.rounds ? Math.round(100 * this.onTarget / this.rounds) : 0;
    const txt = `ROUNDS ${this.rounds} · ${acc}% ON TARGET · PAPER ${s.paper} · POPPERS ${s.poppers} · GONGS ${s.gongs} · DRONES ${s.drones} · SHACK ${s.shacks}`;
    if (txt !== this._boardText) { this._boardText = txt; this._board.textContent = txt; }
  }
}
