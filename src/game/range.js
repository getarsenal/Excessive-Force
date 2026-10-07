/**
 * The Range: an indoor live-fire range for every weapon in the game, on the
 * normal battle pipeline (level `range`, src/game/levels.js), so a gun laid
 * here is laid the way it is laid in a fight.
 *
 * A dark hall, three hundred and forty metres wide and eight hundred long,
 * with a girder ceiling ninety-five metres up, pendant lamps on their drops
 * every forty metres, baffles over the lanes and the overhead cable runs
 * the paper targets ride on. The firing line is the level's origin; the
 * lanes run down -z to the bullet trap, an earth berm five hundred and
 * sixty metres out (the level's one Structure, so the pipeline has a
 * monument to hang its readouts on, hidden here).
 *
 * Four lanes, by what they are for:
 *   A  paper silhouettes on overhead carriers at 50, 100 and 150: hit, they
 *      flip flat and rise again a few seconds later
 *   B  knock-down steel poppers at 100, 200 and 300: a hinge at the base,
 *      down with a clang, back up after five seconds
 *   C  gongs on chains at 300, 400 and 500: hit, they swing and ring, and
 *      never stop being targets
 *   D  the block shack at 180: a hundred and sixty cinder blocks, every one
 *      its own body; a blast near it throws them (the engine's own debris
 *      budget takes them from there), and when they have settled it
 *      rebuilds itself, the blocks flying back to their courses
 * and over the far third of the hall two target drones on a racetrack,
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

// Narrow enough that a phone held upright sees the walls and the ceiling
// from the firing line, not a floor in a void.
const LANE = { A: -66, B: -22, C: 22, D: 66 };
const HALL = { x: 90, zFront: 110, zBack: -640, h: 170 };
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
    this.time = 0;
    this._board = null;
    this._boardText = '';
    this._buildHall();
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

  // ── The hall ────────────────────────────────────────────────────────

  _buildHall() {
    const g = this.group;
    const W = HALL.x * 2, L = HALL.zFront - HALL.zBack, H = HALL.h, zc = (HALL.zFront + HALL.zBack) / 2;
    // The shell: five planes facing in (a box seen from inside through a
    // back-face material did not survive the renderer's depth pass).
    const wallMat = mat(0x565b63, 0.95, 0.0), ceilMat = mat(0x3d4147, 0.95, 0.0);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat); side.position.set(-HALL.x, H / 2, zc); side.rotation.y = Math.PI / 2; g.add(side);
    const side2 = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat); side2.position.set(HALL.x, H / 2, zc); side2.rotation.y = -Math.PI / 2; g.add(side2);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); far.position.set(0, H / 2, HALL.zBack); g.add(far);
    const near = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); near.position.set(0, H / 2, HALL.zFront); near.rotation.y = Math.PI; g.add(near);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), ceilMat); ceil.position.set(0, H, zc); ceil.rotation.x = Math.PI / 2; g.add(ceil);
    for (const m of [side, side2, far, near, ceil]) m.receiveShadow = true;
    // Columns up the side walls and the girders across the ceiling, every forty metres.
    const steel = mat(0x6b727a, 0.6, 0.35), dark = mat(0x2a2d31, 0.9, 0.1);
    const colGeo = new THREE.BoxGeometry(1.6, H, 1.6);
    const girderGeo = new THREE.BoxGeometry(W, 2.2, 0.9);
    const flangeGeo = new THREE.BoxGeometry(W, 0.3, 2.4);
    for (let z = HALL.zFront - 20; z > HALL.zBack; z -= 40) {
      for (const sx of [-1, 1]) { const c = new THREE.Mesh(colGeo, steel); c.position.set(sx * (HALL.x - 0.8), H / 2, z); g.add(c); }
      const gd = new THREE.Mesh(girderGeo, steel); gd.position.set(0, H - 1.6, z); g.add(gd);
      const fl = new THREE.Mesh(flangeGeo, steel); fl.position.set(0, H - 2.8, z); g.add(fl);
    }
    // Purlins the long way, and the cable runs over the lanes.
    const purlinGeo = new THREE.BoxGeometry(0.6, 0.6, L);
    for (const x of [-72, -24, 24, 72]) { const p = new THREE.Mesh(purlinGeo, steel); p.position.set(x, H - 3.3, zc); g.add(p); }
    // Baffles: angled plates over the first two hundred metres, the way an
    // indoor range keeps a high round in the building.
    const baffleGeo = new THREE.BoxGeometry(W - 20, 0.4, 14);
    for (let z = -30; z > -230; z -= 50) {
      const b = new THREE.Mesh(baffleGeo, dark); b.position.set(0, 70 + (z + 30) * -0.08, z); b.rotation.x = 0.55; g.add(b);
    }
    // The lamps: pendants on their drops, three rows, an emissive disc under a shade.
    const LAMP = 56;   // the pendants hang to here, on drops from the roof
    const dropGeo = new THREE.CylinderGeometry(0.08, 0.08, H - 3.3 - LAMP, 5);
    const shadeGeo = new THREE.ConeGeometry(3.2, 2.6, 12, 1, true);
    const bulbGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.3, 12);
    const shadeMat = mat(0x202326, 0.7, 0.3, { side: THREE.DoubleSide });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffe9c4, emissiveIntensity: 2.6, roughness: 1 });
    for (const x of [-52, 0, 52]) {
      for (let z = HALL.zFront - 40; z > HALL.zBack + 20; z -= 40) {
        const drop = new THREE.Mesh(dropGeo, dark); drop.position.set(x, (H - 3.3 + LAMP) / 2, z); g.add(drop);
        const shade = new THREE.Mesh(shadeGeo, shadeMat); shade.position.set(x, LAMP + 1.3, z); g.add(shade);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.set(x, LAMP, z); g.add(bulb);
      }
    }
    // Nothing on the line itself: a bench there stood between a prone gun
    // and its target. A red lamp over the line, lit while the range is hot (always).
    const hot = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 3 }));
    hot.position.set(0, 30, 2); g.add(hot);
    // The boards on the left wall at every distance.
    for (const d of [50, 100, 150, 200, 300, 400, 500]) {
      const tex = textTexture(256, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f2ead6'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#14161a'; ctx.font = 'bold 92px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(d), w / 2, h / 2 + 4);
      });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      board.position.set(-HALL.x + 2.2, 9, -d); board.rotation.y = Math.PI / 2; g.add(board);
      const board2 = board.clone(); board2.position.x = HALL.x - 2.2; board2.rotation.y = -Math.PI / 2; g.add(board2);
    }
  }

  _buildFloor() {
    const W = HALL.x * 2, L = HALL.zFront - HALL.zBack;
    const tex = textTexture(1024, 2048, (ctx, w, h) => {
      ctx.fillStyle = '#5b5e63'; ctx.fillRect(0, 0, w, h);
      // The apron behind the line, where the guns stand, is a pale pour: a
      // dark gun on a dark floor could not be seen where it was put down.
      const X0 = (x) => (x + HALL.x) / W * w, Y0 = (z) => (z - HALL.zBack) / L * h;
      ctx.fillStyle = '#a9aaa6'; ctx.fillRect(0, Y0(1.5), w, Y0(HALL.zFront) - Y0(1.5));
      void X0;
      // Slabs: a faint grid of pours.
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
      for (let i = 0; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, h); ctx.stroke(); }
      for (let j = 0; j <= 40; j++) { ctx.beginPath(); ctx.moveTo(0, j * h / 40); ctx.lineTo(w, j * h / 40); ctx.stroke(); }
      // The plane lies with its top edge down-range: canvas row nought is the far end.
      const X = (x) => (x + HALL.x) / W * w, Y = (z) => (z - HALL.zBack) / L * h;
      // Lane dividers, yellow, the length of the range.
      ctx.strokeStyle = '#d9b43a'; ctx.lineWidth = 6;
      for (const x of [-44, 0, 44]) { ctx.beginPath(); ctx.moveTo(X(x), Y(-10)); ctx.lineTo(X(x), Y(-540)); ctx.stroke(); }
      // The firing line, red, and its legend.
      ctx.fillStyle = '#c8321e'; ctx.fillRect(0, Y(1.5), w, Y(-1.5) - Y(1.5));
      ctx.fillStyle = '#e8e2d0'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FIRING LINE', w / 2, Y(8));
      // Distance stripes and their figures, read from the line.
      for (const d of [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]) {
        ctx.fillStyle = 'rgba(232,226,208,0.7)'; ctx.fillRect(0, Y(-d + 0.6), w, Y(-d - 0.6) - Y(-d + 0.6));
        ctx.fillStyle = '#e8e2d0'; ctx.font = 'bold 56px sans-serif';
        for (const x of Object.values(LANE)) ctx.fillText(String(d), X(x), Y(-d + 7));
      }
      // The lanes' names at the line.
      ctx.font = 'bold 40px sans-serif'; ctx.fillStyle = '#d9b43a';
      for (const [k, x] of Object.entries(LANE)) ctx.fillText(k, X(x), Y(-4));
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.08, (HALL.zFront + HALL.zBack) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  // ── The targets ───────────────────────────────────────────────────

  _buildLanes() {
    // Lane A: the overhead cable and the paper silhouettes riding it.
    const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(LANE.A - 12, 11.5, 0), new THREE.Vector3(LANE.A + 12, 11.5, -170)]),
      new THREE.LineBasicMaterial({ color: 0x8a8f94 }));
    this.group.add(cable);
    for (const [z, dx] of [[-50, -12], [-100, 0], [-150, 12]]) this._paper(LANE.A + dx, z);
    // Lane B: the poppers.
    for (const [z, dx] of [[-100, -14], [-200, 0], [-300, 14]]) this._popper(LANE.B + dx, z);
    // Lane C: the gongs on their frames.
    for (const [z, size, dx] of [[-300, 3.4, -16], [-400, 4.2, 0], [-500, 5.2, 16]]) this._gong(LANE.C + dx, z, size);
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
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 0.2), mat(0x6a6f74, 0.6, 0.4)); g.add(bar);
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
    if (thrown) { S.lastBlast = this.time; S.built = false; S.hits++; this.score.hits++; }
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
    this.drones.push(make(0, 30, 1), make(Math.PI, 42, -1));
  }

  /** The racetrack over the far third of the hall: two straights across the lanes and two turns. */
  _dronePlace(d, dt) {
    // Lower than the ceiling by a good margin, and inside the walls.
    const speed = 38, R = 34, straight = 70;
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
    this.score.hits++;
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
        this.score.hits++; this.score.paper++;
        this._clang(t, 0.5, 1.6);
        return;
      case 'popper':
        if (t.down > 0) return;
        t.down = 5.0; t.body.setEnabled(false);
        this.score.hits++; this.score.poppers++;
        this._clang(t, 0.8, 0.9);
        return;
      case 'gong': {
        const power = Math.max(40, w?.power || 400);
        const kick = THREE.MathUtils.clamp(power / 900, 0.6, 3.2) * (t.tank ? 0.6 : 1);
        // Hit on a side, it swings away from the shooter: the line is +z toward the firing line.
        t.swingV -= kick;
        t.ring = 1;
        this.score.hits++; this.score.gongs++;
        this._clang(t, 1.0, t.tank ? 0.55 : 1.1 - t.size * 0.12);
        return;
      }
      default:
    }
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
    const txt = `HITS ${s.hits} · PAPER ${s.paper} · POPPERS ${s.poppers} · GONGS ${s.gongs} · DRONES ${s.drones} · SHACK ${s.shacks}`;
    if (txt !== this._boardText) { this._boardText = txt; this._board.textContent = txt; }
  }
}
