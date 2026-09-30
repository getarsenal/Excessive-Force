import * as THREE from 'three';
import { UNITS_BY_ID } from '../game/units.js';
import { Typewriter } from './typewriter.js';

/**
 * Boot Camp: the guided first level.
 *
 * Short on words by design. Each step puts a pulsing ring on the real control
 * — the dock button, the card, the readout, or the spot on the map to tap —
 * and a two-line card beside it: what it is, and what it does. A step moves
 * on when the player actually does the thing (opens the drawer, arms the gun,
 * puts it down, designates the tower), or on GOT IT where there is nothing to
 * do but look. SKIP ends it at any point.
 *
 * It is written against the HUD as it is. Anything that changes the dock, the
 * drawers, the cards, targeting or the strikes changes a step here in the same
 * commit (CLAUDE.md says so), and the tutorial level's suite run is how that
 * is caught when it is forgotten.
 */

const DONE_KEY = 'tt.tutorial';

/** Has this browser been offered Boot Camp yet? */
export function tutorialSeen() {
  try { return !!localStorage.getItem(DONE_KEY); } catch { return true; }
}
export function markTutorialSeen(v = 'offered') {
  try { if (localStorage.getItem(DONE_KEY) !== 'done') localStorage.setItem(DONE_KEY, v); } catch { /* private mode */ }
}

export class Tutorial {
  /**
   * @param {object} o
   * @param {object} o.hud  @param {object} o.battle  @param {object} o.rig
   * @param {THREE.Camera} o.camera  @param {THREE.Vector3} o.origin
   * @param {number} o.groundY  @param {object} o.level
   */
  constructor(o) {
    Object.assign(this, o);
    const L = o.level;
    // Where to tap: the tower's shaft, and open ground between it and the
    // camera, a gun's comfortable distance out.
    const aim = L.tutorialAim || { x: 0, y: 30, z: -6 };
    this.towerAt = new THREE.Vector3(o.origin.x + aim.x, o.groundY + aim.y, o.origin.z + aim.z);
    const yaw = L.camera?.yaw ?? 0.5;
    // Inside the ground the town was cleared from, just off the buildings.
    // Open ground off to one side, clear of the trench line round the tower
    // and the garden inside it, still well inside the cleared practice ground.
    const R = Math.max(60, (L.cityExcludeRadius ?? 80) - 20);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);        // toward the camera
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);       // to the camera's right
    const at = (f, r) => {
      const x = o.origin.x + fx * f + sx * r, z = o.origin.z + fz * f + sz * r;
      return new THREE.Vector3(x, o.groundY, z);
    };
    // Level with the tower, out to its side: on screen that is the middle
    // band, clear of the dock — a ring nearer the camera sits under the
    // buttons, and a tap on it is a tap on UNITS.
    this.groundAt = at(0, R * 0.7);
    // The battery: a row on the other flank.
    this.rowFrom = at(0, -R * 0.4);
    this.rowTo = at(0, -R * 0.8);
    this.yaw0 = null;
    this.i = -1;
    this._build();
    this.steps = this._steps();
    if (typeof window !== 'undefined') window.__tutorial = this;   // for the harness and the console
    this.next();
  }

  _steps() {
    const h = this.hud, b = this.battle;
    const armedGun = () => !!b.selectedUnitId && !this._isStrike(b.selectedUnitId);
    return [
      { el: '#topbar .tb-center', title: 'TARGET', text: 'The range tower. The bar is what still stands — get it under 10%. Tap its name to fly back to it.', ok: true,
        say: "Welcome to Fort Irwin, maggot. That tower cost the taxpayer eleven million dollars. Let's waste it." },
      { el: null, title: 'LOOK AROUND', text: 'Drag to orbit. Pinch or scroll to zoom.', ok: true,
        done: () => this.yaw0 != null && Math.abs(this.rig.yaw - this.yaw0) > 0.35 },
      { el: '#topbar .tb-block:first-child', title: 'FUNDS', text: 'Pays for guns and strikes; damage earns more. Everything is free in Boot Camp.', ok: true,
        say: "It's all free today. Don't get used to it. Congress reads the receipts like a hawk with a hangover." },
      { el: '#dock-units', title: 'UNITS', text: 'Your guns and troops. Tap to open.', done: () => h.openDrawer === 'units' || armedGun() },
      { el: '#buildbar .unit-card[data-id="m119"]', fallback: '#dock-units', title: 'M119 HOWITZER',
        text: 'Cheapest gun. Light shell, fast reload. Tap to arm.', done: () => armedGun() || this._placed(),
        say: 'A howitzer. The loud end goes toward the building. Even a second lieutenant can manage that.' },
      { world: () => this.groundAt, fallback: '#dock-units', title: 'DEPLOY',
        text: 'Tap open ground. The ring is its reach.', done: () => this._placed() },
      { world: () => this._dropAt(), title: 'AIRLIFT',
        text: 'Guns come by air. Everything placed in the next 8 s ships on one aircraft — place more now.',
        done: () => this._inbound() || this._deployed() },
      { world: () => this._liftAt() || this._dropAt(), title: 'INBOUND',
        text: 'A C-130 drops it by parachute; heavy guns hang under a Chinook. Flak can shoot them down.',
        done: () => this._deployed(),
        say: "Watch the Herc. If they shoot it down, it comes out of your pay. You don't get paid. Figure it out." },
      // A row of guns in one gesture: arm, press on open ground, pull.
      { world: () => this.rowFrom, world2: () => this.rowTo, title: 'A BATTERY',
        text: 'M119 is armed again. Press on open ground and drag: one gun every 11 m, all in one lift.',
        enter: () => { if (!armedGun()) { b.selectUnit('m119'); } h.closeDrawer?.(); },
        done: () => this._count() >= 3,
        say: 'One gun is a hobby. A row of them is a foreign policy.' },
      // A gun stays armed after it is placed, and a tap with one armed is a
      // placement: put it away, so the tap on the tower is a designation.
      { world: () => this.towerAt, title: 'DESIGNATE', text: 'Tap the tower. Every gun lays on that spot.', done: () => !!b.target,
        enter: () => { b.selectedUnitId = null; h.closeDrawer?.(); h.hidePrompt?.(); } },
      { el: '#targetcard', title: 'TARGET CARD', text: 'What you hit, how high, and how many guns are on it.', ok: true },
      { el: '#survey-btn', title: 'SURVEY', text: 'Paints the load. Red stone holds the rest up — cut it.', done: () => h.survey,
        say: 'Red is holding the rest up. Shoot the red. They taught you colours in basic, right?' },
      { el: '#survey-btn', title: 'SURVEY OFF', text: 'Tap again to see the stone. V on a keyboard.', done: () => !h.survey, ok: true },
      { el: '#dock-orders', title: 'ORDERS', text: 'How the guns shoot. Tap to open.', done: () => h.openDrawer === 'orders' },
      { el: '#orders-modes', fallback: '#dock-orders', title: 'FIRE MODE',
        text: 'POINT: tight group. AREA: walked over it. DELAY: bursts inside the stone.', ok: true },
      { el: '#orders-smoke', fallback: '#dock-orders', title: 'SMOKE', text: 'Blinds the garrison so your guns are not shot at.', ok: true },
      { el: '#dock-strikes', title: 'STRIKES', text: 'Aircraft and a cruise missile. Paid once. Tap to open.',
        say: 'Air power. For when you can\'t be bothered to aim.',
        done: () => h.openDrawer === 'strikes' || this._striking() },
      { el: '#strikebar .unit-card:not(.locked)', fallback: '#dock-strikes', title: 'CALL A STRIKE',
        text: 'Cheapest first. LOITER stays on station; the rest make one pass. Tap one, then the tower.', done: () => this._striking() },
      { el: '#topbar .tb-block.right', title: 'DEFENDERS', text: 'They shoot your guns and flak hits aircraft. Hit their posts: the crates and drums by their guns go up.', ok: true },
      { el: '#dock-menu', title: 'MENU', text: 'Pause, sound, haptics, the map, and MAIN MENU. Leave mid-fight and the battle is saved: CONTINUE picks it up.', ok: true },
      { el: '.integrity-wrap', title: 'BRING IT DOWN', text: 'Keep firing. It counts when it falls.', done: () => b.state === 'won',
        say: "Stop admiring it and knock the damn thing over. I've got a tee time." },
    ];
  }

  _isStrike(id) { return !!UNITS_BY_ID[id]?.strike; }
  _deployed() { return this.battle.units.some((u) => u.alive); }
  _placed() { return this.battle.pending.length > 0 || this._deployed(); }
  _count() { return this.battle.units.filter((u) => u.alive).length + this.battle.pending.length; }
  _inbound() { return !!this.battle.air?.sorties.some((s) => s.lift); }
  _dropAt() { const d = this.battle.pending[0]; return d ? d.pos : this.groundAt; }
  _liftAt() {
    const s = this.battle.air?.sorties.find((x) => x.lift);
    return s?.model ? s.model.getWorldPosition(this._w || (this._w = new THREE.Vector3())) : null;
  }
  _striking() {
    const a = this.battle.air;
    return !!a && (a.sorties.some((s) => !s.lift) || (a.loiterStatus && a.loiterStatus().length > 0));
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'tut';
    root.innerHTML = `
      <div class="tut-ring" hidden></div>
      <div class="tut-gen" hidden>
        <img class="tut-gen-face" src="assets/characters/us-general.png" alt="">
        <div class="tut-gen-body"><b>GEN. BUCK HOLLISTER</b><span class="tut-gen-line"></span>
          <button type="button" class="tut-gen-ok">CARRY ON</button></div>
      </div>
      <div class="tut-ring tut-ring2" hidden></div>
      <div class="tut-card">
        <div class="tut-head"><b class="tut-title"></b><span class="tut-count"></span><button type="button" class="tut-skip">SKIP</button></div>
        <div class="tut-text"></div>
        <button type="button" class="tut-ok" hidden>GOT IT</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.ring = root.querySelector('.tut-ring');
    this.card = root.querySelector('.tut-card');
    this.ring2 = root.querySelector('.tut-ring2');
    this.gen = root.querySelector('.tut-gen');
    this.genLine = root.querySelector('.tut-gen-line');
    root.querySelector('.tut-skip').addEventListener('click', () => this.finish('skipped'));
    root.querySelector('.tut-ok').addEventListener('click', () => this.next());
    root.querySelector('.tut-gen-ok').addEventListener('click', () => this.hush());
    this._v = new THREE.Vector3();
  }

  next() {
    this.i++;
    if (this.i >= this.steps.length) { this.finish('done'); return; }
    const s = this.steps[this.i];
    this.root.querySelector('.tut-title').textContent = s.title;
    this.root.querySelector('.tut-text').textContent = s.text;
    this.root.querySelector('.tut-count').textContent = `${this.i + 1}/${this.steps.length}`;
    this.root.querySelector('.tut-ok').hidden = !s.ok;
    if (s.title === 'LOOK AROUND') this.yaw0 = this.rig.yaw;
    if (s.enter) s.enter();
    if (s.say) this.say(s.say);
  }

  /**
   * The General has something to add, and he gets the floor: the step's
   * card and ring wait until he has finished (CARRY ON, or long enough to
   * read it), so the two are never on screen together.
   */
  say(line, after = null) {
    // Typed out under the keys, like the stand-offs: see typewriter.js.
    this.tw = this.tw || new Typewriter(this.audio || null);
    this.tw.resume();
    clearInterval(this._typeT);
    this.genLine.textContent = '';
    this.genLine.classList.add('typing');
    let n = 0;
    this._typeT = setInterval(() => {
      n++;
      this.genLine.textContent = line.slice(0, n);
      this.tw.key(line[n - 1]);
      if (n >= line.length) {
        clearInterval(this._typeT);
        this.genLine.classList.remove('typing');
        this.tw.ding();
      }
    }, 25);
    this.gen.hidden = false;
    this.talking = true;
    this._after = after;
    clearTimeout(this._genT);
    this._genT = setTimeout(() => this.hush(), 3500 + line.length * 45);
  }

  hush() {
    clearTimeout(this._genT);
    clearInterval(this._typeT);
    if (this.genLine) this.genLine.classList.remove('typing');
    if (this.gen) this.gen.hidden = true;
    this.talking = false;
    const after = this._after;
    this._after = null;
    if (after) after();
  }

  /** Where the current step points, as a screen rectangle, or null. */
  _rect(s, second = false) {
    const w = second ? s.world2 : s.world;
    if (second && !w) return null;
    if (w) {
      const p = this._v.copy(w()).project(this.camera);
      if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return null;
      const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight;
      return { left: x - 34, top: y - 34, width: 68, height: 68, round: true };
    }
    for (const sel of [s.el, s.fallback]) {
      if (!sel) continue;
      const el = document.querySelector(sel);
      if (!el || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return r;
    }
    return null;
  }

  /** Called every frame from the render loop. */
  update() {
    if (!this.root) return;
    const s = this.steps[this.i];
    if (!s) return;
    // Brought down before the walkthrough got there: that is the point of it.
    if (this.battle.state === 'won') { this.finish('done'); return; }
    // One voice at a time: while the General talks, the step waits.
    this.card.hidden = this.ring.hidden = this.talking;
    if (this.talking) { this.ring2.hidden = true; return; }
    if (s.done && s.done()) { this.next(); return; }
    const r = this._rect(s);
    const pad = 6;
    if (r) {
      this.ring.hidden = false;
      this.ring.classList.toggle('round', !!r.round);
      this.ring.style.transform = `translate(${r.left - pad}px, ${r.top - pad}px)`;
      this.ring.style.width = `${r.width + pad * 2}px`;
      this.ring.style.height = `${r.height + pad * 2}px`;
    } else {
      this.ring.hidden = true;
    }
    // A drag has two ends: a second ring where it should finish.
    const r2 = this._rect(s, true);
    this.ring2.hidden = !r2;
    if (r2) {
      this.ring2.classList.add('round');
      this.ring2.style.transform = `translate(${r2.left - pad}px, ${r2.top - pad}px)`;
      this.ring2.style.width = `${r2.width + pad * 2}px`;
      this.ring2.style.height = `${r2.height + pad * 2}px`;
    }
    // The card sits beside what it is about: under it when that is in the
    // top half of the screen, over it when it is in the bottom half, and in
    // the middle when the step points at nothing.
    const cw = this.card.offsetWidth, ch = this.card.offsetHeight;
    let x, y;
    if (r) {
      x = r.left + r.width / 2 - cw / 2;
      y = r.top + r.height / 2 < innerHeight / 2 ? r.top + r.height + pad + 14 : r.top - pad - 14 - ch;
    } else {
      x = innerWidth / 2 - cw / 2; y = innerHeight * 0.3;
    }
    x = Math.max(10, Math.min(innerWidth - cw - 10, x));
    y = Math.max(10, Math.min(innerHeight - ch - 10, y));
    this.card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  finish(how) {
    markTutorialSeen(how === 'done' ? 'done' : 'skipped');
    if (how === 'done') {
      this.hud.feed('BOOT CAMP COMPLETE', 'big');
      const root = this.root;
      this.ring.hidden = true; this.ring2.hidden = true; this.card.hidden = true;
      this.root = null;
      this.say("Well, hell. You broke it. Your mother would be proud, or at least not surprised. Now go start a war.",
        () => root.remove());
      return;
    }
    if (this.root) this.root.remove();
    this.root = null;
  }
}
