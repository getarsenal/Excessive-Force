import * as THREE from 'three';
import { UNITS_BY_ID } from '../game/units.js';

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
    const towerH = (L.camera?.height ?? 40) * 1.2;
    // Where to tap: the tower's middle, and open ground between it and the
    // camera, a gun's comfortable distance out.
    this.towerAt = new THREE.Vector3(o.origin.x, o.groundY + Math.min(towerH, 30), o.origin.z - 6);
    const yaw = L.camera?.yaw ?? 0.5;
    // Inside the ground the town was cleared from, just off the buildings.
    const out = Math.max(45, (L.cityExcludeRadius ?? 80) - 28);
    this.groundAt = new THREE.Vector3(o.origin.x + Math.sin(yaw) * out, o.groundY, o.origin.z + Math.cos(yaw) * out);
    this.yaw0 = null;
    this.i = -1;
    this._build();
    this.steps = this._steps();
    this.next();
  }

  _steps() {
    const h = this.hud, b = this.battle;
    const armedGun = () => !!b.selectedUnitId && !this._isStrike(b.selectedUnitId);
    return [
      { el: '#topbar .tb-center', title: 'TARGET', text: 'The range tower. The bar is what still stands — get it under 10%.', ok: true },
      { el: null, title: 'LOOK AROUND', text: 'Drag to orbit. Pinch or scroll to zoom.', ok: true,
        done: () => this.yaw0 != null && Math.abs(this.rig.yaw - this.yaw0) > 0.35 },
      { el: '#topbar .tb-block:first-child', title: 'FUNDS', text: 'Pays for guns and strikes. Damage earns it back.', ok: true },
      { el: '#dock-units', title: 'UNITS', text: 'Your guns and troops. Tap to open.', done: () => h.openDrawer === 'units' || armedGun() },
      { el: '#buildbar .unit-card[data-id="m119"]', fallback: '#dock-units', title: 'M119 HOWITZER',
        text: 'Cheapest gun. Light shell, fast reload. Tap to arm.', done: () => armedGun() || this._deployed() },
      { world: () => this.groundAt, fallback: '#dock-units', title: 'DEPLOY',
        text: 'Tap open ground. The ring is its reach.', done: () => this._deployed() },
      { world: () => this.towerAt, title: 'DESIGNATE', text: 'Tap the tower. Every gun lays on that spot.', done: () => !!b.target },
      { el: '#targetcard', title: 'TARGET CARD', text: 'What you hit, how high, and how many guns are on it.', ok: true },
      { el: '#survey-btn', title: 'SURVEY', text: 'Paints the load. Red stone holds the rest up — cut it.', done: () => h.survey },
      { el: '#survey-btn', title: 'SURVEY OFF', text: 'Tap again to see the stone. V on a keyboard.', done: () => !h.survey, ok: true },
      { el: '#dock-orders', title: 'ORDERS', text: 'How the guns shoot. Tap to open.', done: () => h.openDrawer === 'orders' },
      { el: '#orders-modes', fallback: '#dock-orders', title: 'FIRE MODE',
        text: 'POINT: tight group. AREA: walked over it. DELAY: bursts inside the stone.', ok: true },
      { el: '#orders-smoke', fallback: '#dock-orders', title: 'SMOKE', text: 'Blinds the garrison so your guns are not shot at.', ok: true },
      { el: '#dock-strikes', title: 'STRIKES', text: 'Aircraft and a cruise missile. Paid once. Tap to open.',
        done: () => h.openDrawer === 'strikes' || this._striking() },
      { el: '#strikebar .unit-card:not(.locked)', fallback: '#dock-strikes', title: 'CALL A STRIKE',
        text: 'LOITERING stays on station; SINGLE USE is one pass. Tap one, then the tower.', done: () => this._striking() },
      { el: '#topbar .tb-block.right', title: 'DEFENDERS', text: 'They shoot your guns and flak hits aircraft. Hit their posts.', ok: true },
      { el: '#dock-menu', title: 'MENU', text: 'Pause, sound, quality, and back to the map.', ok: true },
      { el: '.integrity-wrap', title: 'BRING IT DOWN', text: 'Keep firing. It counts when it falls.', done: () => b.state === 'won' },
    ];
  }

  _isStrike(id) { return !!UNITS_BY_ID[id]?.strike; }
  _deployed() { return this.battle.units.some((u) => u.alive); }
  _striking() {
    const a = this.battle.air;
    return !!a && (a.sorties.some((s) => !s.lift) || (a.loiterStatus && a.loiterStatus().length > 0));
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'tut';
    root.innerHTML = `
      <div class="tut-ring" hidden></div>
      <div class="tut-card">
        <div class="tut-head"><b class="tut-title"></b><span class="tut-count"></span><button type="button" class="tut-skip">SKIP</button></div>
        <div class="tut-text"></div>
        <button type="button" class="tut-ok" hidden>GOT IT</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.ring = root.querySelector('.tut-ring');
    this.card = root.querySelector('.tut-card');
    root.querySelector('.tut-skip').addEventListener('click', () => this.finish('skipped'));
    root.querySelector('.tut-ok').addEventListener('click', () => this.next());
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
  }

  /** Where the current step points, as a screen rectangle, or null. */
  _rect(s) {
    if (s.world) {
      const p = this._v.copy(s.world()).project(this.camera);
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
    if (this.root) this.root.remove();
    this.root = null;
    if (how === 'done') this.hud.feed('BOOT CAMP COMPLETE', 'big');
  }
}
