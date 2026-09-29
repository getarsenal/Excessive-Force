import { feedback } from './feedback.js';
import { UNITS, UNITS_BY_ID } from '../game/units.js';
import { unitIcon } from './icons.js';
import { introsEnabled, setIntrosEnabled } from './standoff.js';
import { openingEnabled, setOpeningEnabled } from './opening.js';
export { TAP } from './pointer.js';




/**
 * HUD.
 *
 * Deliberately thin: it reads battle state once per frame and writes text.
 * Nothing here owns game state, so there is exactly one source of truth and no
 * chance of the bar and the simulation disagreeing about what you can afford.
 */

export class HUD {
  constructor(battle, opts = {}) {
    this.battle = battle;
    this.onSelect = opts.onSelect || (() => {});
    this.onClearTarget = opts.onClearTarget || (() => {});
    this.onRestart = opts.onRestart || (() => {});
    // Returns whether it actually had anything to put away.
    this.onDisarm = opts.onDisarm || (() => false);
    this.onToggleSound = opts.onToggleSound || (() => {});
    this.onNextTarget = opts.onNextTarget || (() => {});
    this.onKeepGoing = opts.onKeepGoing || (() => {});
    this.onPickTarget = opts.onPickTarget || (() => {});
    this.onHome = opts.onHome || (() => this.onPickTarget());
    this.onFireMode = opts.onFireMode || (() => {});
    this.onSmoke = opts.onSmoke || (() => {});
    this.onPause = opts.onPause || (() => {});
    this.onQuality = opts.onQuality || (() => {});
    this.onSurvey = opts.onSurvey || (() => {});
    // The readouts are buttons too: the target's name flies the camera back
    // to it, UNITS flies it to the battery.
    this.onFocusTarget = opts.onFocusTarget || (() => {});
    this.onFocusUnits = opts.onFocusUnits || (() => {});
    this.picker = opts.picker || null;
    this.qualityId = opts.qualityId || null;
    this.nextTargetLabel = null;

    this.el = {
      money: document.getElementById('hud-money'),
      income: document.getElementById('hud-income'),
      integrity: document.getElementById('hud-integrity'),
      integrityPct: document.getElementById('hud-integrity-pct'),
      height: document.getElementById('hud-height'),
      defenders: document.getElementById('hud-defenders'),
      units: document.getElementById('hud-units'),
      target: document.getElementById('hud-target'),
      objectives: document.getElementById('hud-objectives'),
      buildbar: document.getElementById('buildbar'),
      strikebar: document.getElementById('strikebar'),
      prompt: document.getElementById('prompt'),
      targetcard: document.getElementById('targetcard'),
      loiters: document.getElementById('loiters'),
      tcSection: document.getElementById('tc-section'),
      tcHeight: document.getElementById('tc-height'),
      tcGuns: document.getElementById('tc-guns'),
      tcToggle: document.getElementById('tc-toggle'),
      tcBriefSection: document.getElementById('tc-brief-section'),
      tcBriefGuns: document.getElementById('tc-brief-guns'),
      feed: document.getElementById('feed'),
      endcard: document.getElementById('endcard'),
      ecMarks: document.getElementById('ec-marks'),
      ecTitle: document.getElementById('ec-title'),
      ecSub: document.getElementById('ec-sub'),
      ecStats: document.getElementById('ec-stats'),
      ecRelease: document.getElementById('ec-release'),
      ecAgain: document.getElementById('ec-again'),
      ecNext: document.getElementById('ec-next'),
      ecKeep: document.getElementById('ec-keep'),
      ecTargets: document.getElementById('ec-targets'),
      targetsBtn: document.getElementById('targets-btn'),
      ticks: document.getElementById('hud-ticks'),
      smokeBtn: document.getElementById('orders-smoke'),
      dock: document.getElementById('dock'),
      dockUnits: document.getElementById('dock-units'),
      dockUnitsIcon: document.getElementById('dock-units-icon'),
      dockStrikes: document.getElementById('dock-strikes'),
      dockStrikesIcon: document.getElementById('dock-strikes-icon'),
      dockOrders: document.getElementById('dock-orders'),
      dockView: document.getElementById('dock-view'),
      dockMenu: document.getElementById('dock-menu'),
      ordersClear: document.getElementById('orders-clear'),
      surveyBtn: document.getElementById('survey-btn'),
      surveyKey: document.getElementById('survey-key'),
      ordersModes: document.getElementById('orders-modes'),
      menuBtn: document.getElementById('dock-menu'),
      menu: document.getElementById('menu'),
    };

    if (this.el.target && battle.level) this.el.target.textContent = battle.level.target;

    this._measureTopBar();

    this.cards = new Map();
    this._buildBar();

    if (this.el.ordersClear) this.el.ordersClear.addEventListener('click', () => this.onClearTarget());
    this._setupTargetCard();
    this._setupDock();

    // Clear view: the whole interface off, for watching rather than playing.
    // The way back is a single dim pill at the bottom — present enough to
    // find, faint enough not to be in the shot.
    this.el.clearBtn = document.getElementById('dock-view');
    this.el.restoreBtn = document.getElementById('restore-btn');
    this.setClearView = (on) => {
      this.clearView = !!on;
      document.body.classList.toggle('clear-view', this.clearView);
      if (this.el.restoreBtn) this.el.restoreBtn.hidden = !this.clearView;
    };
    this.el.clearBtn?.addEventListener('click', () => this.setClearView(true));
    this.el.restoreBtn?.addEventListener('click', () => this.setClearView(false));

    // The survey. `onSurvey` is handed to the structures by `main`; the HUD
    // owns only the button, the key and the legend, because the legend is the
    // difference between a coloured building and a readable one.
    this.survey = false;
    this.setSurvey = (on) => {
      this.survey = !!on;
      this.el.surveyBtn?.classList.toggle('on', this.survey);
      if (this.el.surveyKey) this.el.surveyKey.hidden = !this.survey;
      this.onSurvey?.(this.survey);
    };
    this.el.surveyBtn?.addEventListener('click', () => this.setSurvey(!this.survey));
    window.addEventListener('keydown', (e) => {
      // Not over the report or the menu: the clear-view rule hides them too,
      // and left only the faint SHOW UI pill on a screen the player thought
      // had frozen.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.body.classList.contains('ended')) return;
      if (this.el.menu && !this.el.menu.hidden) return;
      if (e.code === 'KeyH') this.setClearView(!this.clearView);
      if (e.code === 'KeyV') this.setSurvey(!this.survey);
    });
    this.soundOn = true;
    this.el.sound = document.getElementById('sound-toggle');
    // One place writes both labels, so the menu never says ON while the rail
    // says MUTED.
    this.syncSound = () => {
      if (this.el.sound) {
        this.el.sound.textContent = this.soundOn ? 'SOUND' : 'MUTED';
        this.el.sound.classList.toggle('off', !this.soundOn);
      }
      const snd = this.el.menu && this.el.menu.querySelector('#menu-sound');
      if (snd) snd.textContent = this.soundOn ? 'SOUND: ON' : 'SOUND: OFF';
    };
    if (this.el.sound) {
      this.el.sound.addEventListener('click', () => {
        this.soundOn = !this.soundOn;
        this.syncSound();
        this.onToggleSound(this.soundOn);
      });
    }
    this.el.ecAgain.addEventListener('click', () => this.onRestart());
    const fr = document.getElementById('fault-restart');
    if (fr) fr.addEventListener('click', () => this.onRestart());
    const ft = document.getElementById('fault-targets');
    if (ft) ft.addEventListener('click', () => this.onPickTarget());
    if (this.el.ecNext) this.el.ecNext.addEventListener('click', () => this.onNextTarget());
    if (this.el.ecKeep) {
      this.el.ecKeep.addEventListener('click', () => {
        this.el.endcard.hidden = true;
        document.body.classList.remove('ended');
        // A pause pressed while the report was coming up would otherwise
        // strand the resumed game frozen with no menu on screen.
        if (this.el.menu) this.el.menu.hidden = true;
        this.onPause(false);
        this.onKeepGoing();
      });
    }
    if (this.el.ecTargets) this.el.ecTargets.addEventListener('click', () => this.onPickTarget());

    this._promptTimer = 0;
    this._lastUnlocked = new Set();
    this._setupRipples();
    this._setupTicks();
    this._setupModes();
    this._setupMenu();
    this._setupPopups();
  }

  /**
   * Marks on the progress bar where each weapon unlocks, and where the level
   * is won. The bar used to be a plain fill: how far the next gun was, and
   * how far the win, were numbers you had to remember from the cards.
   */
  _setupTicks() {
    const el = this.el.ticks;
    if (!el) return;
    const b = this.battle;
    const scale = b.level?.unlockScale ?? 1;
    // The bar and the unlocks measure different things. Unlocks are a
    // fraction of all the mass on the map; the bar is each objective's share
    // of the way to its own threshold. Unlock marks are converted onto the
    // bar's scale, and the win mark sits where the win actually fires.
    const win = document.createElement('i');
    win.className = 'tick win';
    win.style.left = `${(b.constructor.WIN_AT * 100).toFixed(0)}%`;
    win.title = 'Level won';
    el.appendChild(win);
    const denom = b.objectives.reduce(
      (a, o) => a + o.structure.totalMass * (1 - o.win.integrity), 0) / Math.max(1, b.totalMass);
    // Kept, because the cards have to quote the same number the bar is showing.
    this._unlockDenom = denom;
    const seen = new Set();
    for (const u of UNITS) {
      const frac = Math.min(1, ((u.unlockFrac ?? 0) / scale) / Math.max(0.05, denom));
      if (frac <= 0.001 || frac >= 0.97) continue;
      const key = frac.toFixed(3);
      if (seen.has(key)) continue;
      seen.add(key);
      const t = document.createElement('i');
      t.className = 'tick unlock';
      t.style.left = `${(frac * 100).toFixed(2)}%`;
      t.title = `${u.name} unlocks`;
      el.appendChild(t);
    }
  }

  /**
   * The target readout folds away.
   *
   * Expanded it is a title, three rows, three fire-mode buttons and CLEAR,
   * which is a sixth of a phone's screen standing over the city for the whole
   * battle — and most of it is settled once: the fire mode is chosen early
   * and rarely changed. Collapsed it keeps the two figures worth watching
   * while the guns are firing, the section they are on and how many are on
   * it, in one line.
   *
   * It starts folded on a narrow screen and open on a wide one, because that
   * is where the complaint is and where the room is; after that the player's
   * own choice is remembered and neither default applies again.
   */
  _setupTargetCard() {
    const card = this.el.targetcard, btn = this.el.tcToggle;
    if (!card || !btn) return;
    let open = null;
    try {
      const v = localStorage.getItem('tt.tcard');
      if (v === '0' || v === '1') open = v === '1';
    } catch { /* private mode */ }
    if (open === null) open = !window.matchMedia('(max-width: 560px)').matches;
    const apply = () => {
      card.classList.toggle('collapsed', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.title = open ? 'Collapse the target readout' : 'Expand the target readout';
    };
    apply();
    btn.addEventListener('click', () => {
      open = !open;
      apply();
      try { localStorage.setItem('tt.tcard', open ? '1' : '0'); } catch { /* private mode */ }
    });
  }

  /**
   * The dock: what opens, what closes it, and what the buttons say.
   *
   * One drawer at a time, and tapping the map closes whichever is open —
   * `closeDrawer` is called from the canvas handler in `main.js`, which also
   * swallows that tap so a player dismissing a drawer does not also plant a
   * howitzer under it.
   *
   * The two frames around `hidden` are the animation. A node that is
   * `display: none` has no transition to run from, so it has to be in the
   * layout for one frame at the closed transform before the open class goes
   * on; coming back, the class comes off and `hidden` waits for the
   * transition to finish. Without that the drawer simply appears.
   */
  _setupDock() {
    this.drawers = new Map();
    for (const el of document.querySelectorAll('.drawer')) {
      this.drawers.set(el.id.replace('drawer-', ''), el);
    }
    this.openDrawer = null;
    this._drawerTimer = 0;

    this.setDrawer = (name) => {
      const next = name && this.openDrawer === name ? null : name;
      for (const [key, el] of this.drawers) {
        const on = key === next;
        const btn = document.getElementById(`dock-${key}`);
        if (btn) btn.classList.toggle('open', on);
        if (on) {
          el.hidden = false;
          // Two frames: one to land in the layout closed, one to open.
          requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
        } else if (!el.hidden) {
          el.classList.remove('on');
          const hide = () => { if (!el.classList.contains('on')) el.hidden = true; };
          setTimeout(hide, 220);
        }
      }
      this.openDrawer = next;
      // The drawers glide up into the bottom-left corner, which is where the
      // survey switch lives, and the switch is above them in z — so with
      // UNITS open, the tap meant for the first gun card landed on SURVEY
      // instead. The switch steps aside while a drawer is up; the survey
      // itself stays on if it was on.
      document.body.classList.toggle('drawer-open', !!next);
    };
    this.closeDrawer = () => { if (this.openDrawer) this.setDrawer(null); };

    for (const btn of document.querySelectorAll('.dock-btn[data-drawer]')) {
      btn.addEventListener('click', () => {
        // Put the weapon down first.
        //
        // With something armed, every tap on the map spends money, and the
        // only way out of that was the Escape key — which a phone does not
        // have. The touch route was: open the drawer, find the card that is
        // already lit, tap it again. Two taps and a model of the state, to
        // undo something the player had already decided against. The button
        // is wearing the weapon's own icon and name by then, so tapping it to
        // put that weapon away is the reading it already suggests; the drawer
        // is one more tap, where it was before.
        //
        // Only the button that is wearing the weapon puts it away. With a
        // gun armed, STRIKES opens its drawer as it always does, and picking
        // an aircraft there swaps one weapon for the other.
        //
        // Read from the battle, not from the button's `armed` class: that is
        // painted on the next frame, and a tap straight after picking a
        // weapon opened the drawer instead of putting the weapon away.
        const held = this.battle.selectedUnitId && UNITS_BY_ID[this.battle.selectedUnitId];
        const mine = held && (held.strike ? 'strikes' : 'units') === btn.dataset.drawer;
        if (mine && this.openDrawer !== btn.dataset.drawer && this.onDisarm()) return;
        this.setDrawer(btn.dataset.drawer);
      });
    }
    if (this.el.ordersModes) {
      this.el.ordersModes.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => this.onFireMode(btn.dataset.mode));
      });
    }
  }

  /**
   * What the UNITS and STRIKES buttons are holding.
   *
   * With the drawer shut this is the only place the armed weapon shows, so
   * the button it came from wears the unit's own icon and its name — a player
   * who has just picked a Paladin and closed the drawer to look at the map
   * must not have to reopen it to find out what a tap is about to cost them.
   * The other button keeps its badge.
   */
  syncDock(id) {
    const u = id ? UNITS_BY_ID[id] : null;
    const holder = u ? (u.strike ? 'strikes' : 'units') : null;
    this._dockIconIds = this._dockIconIds || {};
    for (const [key, btn, icon] of [
      ['units', this.el.dockUnits, this.el.dockUnitsIcon],
      ['strikes', this.el.dockStrikes, this.el.dockStrikesIcon],
    ]) {
      if (!btn || !icon) continue;
      const mine = holder === key;
      btn.classList.toggle('armed', mine);
      const label = btn.querySelector('.db-label');
      if (label) label.textContent = mine ? u.name : key.toUpperCase();
      const want = mine ? u.id : null;
      if (this._dockIconIds[key] === want) continue;
      this._dockIconIds[key] = want;
      // Nothing when nothing is armed: the badge underneath is the picture
      // then, and a second drawing behind it would only be something to go
      // wrong.
      icon.innerHTML = mine ? (unitIcon(u.id) || '') : '';
    }
  }

  /**
   * The fire modes and smoke sit in the ORDERS drawer now, not on the target
   * card. They were on the card because the card was the only panel there
   * was; with the dock they belong with the other things a player *does*,
   * and the card goes back to being what it is called — a readout.
   */
  _setupModes() {
    if (this.el.smokeBtn) this.el.smokeBtn.addEventListener('click', () => this.onSmoke());
  }

  _setupMenu() {
    const btn = this.el.menuBtn, menu = this.el.menu;
    if (!btn || !menu) return;
    const open = (on) => {
      menu.hidden = !on;
      this.onPause(on);
    };
    btn.addEventListener('click', () => open(menu.hidden));
    menu.querySelector('#menu-resume').addEventListener('click', () => open(false));
    menu.querySelector('#menu-restart').addEventListener('click', () => this.onRestart());
    menu.querySelector('#menu-targets').addEventListener('click', () => { open(false); this.onPickTarget(); });
    menu.querySelector('#menu-home')?.addEventListener('click', () => { open(false); this.onHome(); });
    const snd = menu.querySelector('#menu-sound');
    snd.addEventListener('click', () => {
      if (this.el.sound) this.el.sound.click();
      else { this.soundOn = !this.soundOn; this.syncSound(); this.onToggleSound(this.soundOn); }
    });
    const hap = menu.querySelector('#menu-haptics');
    if (hap) {
      const label = () => { hap.textContent = feedback.haptics ? 'HAPTICS: ON' : 'HAPTICS: OFF'; };
      label();
      hap.addEventListener('click', () => { feedback.haptics = !feedback.haptics; label(); });
    }
    const opening = menu.querySelector('#menu-opening');
    if (opening) {
      const label = () => { opening.textContent = openingEnabled() ? 'OPENING: ON' : 'OPENING: OFF'; };
      label();
      opening.addEventListener('click', () => { setOpeningEnabled(!openingEnabled()); label(); });
    }
    const intros = menu.querySelector('#menu-intros');
    if (intros) {
      const label = () => { intros.textContent = introsEnabled() ? 'INTROS: ON' : 'INTROS: OFF'; };
      label();
      intros.addEventListener('click', () => { setIntrosEnabled(!introsEnabled()); label(); });
    }
    menu.querySelectorAll('[data-quality]').forEach((q) => {
      q.classList.toggle('on', q.dataset.quality === this.qualityId);
      q.addEventListener('click', () => this.onQuality(q.dataset.quality));
    });
    window.addEventListener('keydown', (e) => {
      // Not during the stand-off: the menu would open unseen under it.
      if (document.getElementById('ui')?.classList.contains('standoff')) return;
      if (e.code === 'KeyP' || (e.code === 'Escape' && !menu.hidden)) open(menu.hidden && e.code === 'KeyP');
    });
  }

  /**
   * Money floating up off the map where it was earned, and chevrons over the
   * crews that have earned theirs. Pooled DOM, projected through the picker.
   */
  _setupPopups() {
    const layer = document.createElement('div');
    layer.id = 'popups';
    this._popups = [];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'popup';
      layer.appendChild(s);
      this._popups.push({ el: s, age: 99 });
    }
    this._badges = [];
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('span');
      s.className = 'badge';
      s.hidden = true;
      layer.appendChild(s);
      this._badges.push(s);
    }
    document.body.appendChild(layer);
  }

  /** "+$120" rising from a world point. */
  popup(text, worldPoint, kind = '') {
    if (!this.picker || !worldPoint) return;
    const sc = this.picker.toScreen(worldPoint);
    if (sc.behind) return;
    let slot = this._popups[0];
    for (const p of this._popups) if (p.age > slot.age) slot = p;
    slot.age = 0;
    const el = slot.el;
    el.className = 'popup';
    void el.offsetWidth;
    el.textContent = text;
    el.style.left = `${sc.x}px`;
    el.style.top = `${sc.y}px`;
    el.className = `popup go ${kind}`;
  }

  /**
   * No. The prompt shakes its head; if it was the money, the funds flash red
   * and shake too, so the reason is where the eye already is.
   */
  deny(kind = '') {
    // The prompt's own shake comes with the warning it shows (showPrompt).
    if (kind === 'money' && this.el.money) {
      const m = this.el.money;
      m.classList.remove('broke'); void m.offsetWidth; m.classList.add('broke');
    }
  }

  /** The funds readout flares as a bounty lands on it. */
  flareMoney() {
    const el = this.el.money;
    if (!el) return;
    this._flare = this._flare === 'flare-a' ? 'flare-b' : 'flare-a';
    el.classList.remove('flare-a', 'flare-b');
    el.classList.add(this._flare);
  }

  /** The integrity bar marks a milestone: a white flash and the figure pops. */
  milestone() {
    const wrap = this.el.integrity?.closest('.integrity-wrap');
    if (!wrap) return;
    wrap.classList.remove('milestone');
    void wrap.offsetWidth;
    wrap.classList.add('milestone');
  }

  /**
   * A flash at the edge of the screen from the direction of a world point:
   * warm for a heavy hit on the masonry, red for fire landing on the battery.
   * Where the point is behind the camera the flash comes up from the bottom,
   * which is where "behind you" reads on a phone.
   */
  edgeFlash(kind, worldPoint) {
    const el = this._edge || (this._edge = document.getElementById('edgeflash'));
    if (!el || !this.picker || !worldPoint) return;
    const sc = this.picker.toScreen(worldPoint);
    let x = 50, y = 100;
    if (!sc.behind) {
      // Push the point out to the frame edge along the ray from the centre.
      const cx = innerWidth / 2, cy = innerHeight / 2;
      const dx = sc.x - cx, dy = sc.y - cy;
      const k = Math.max(Math.abs(dx) / cx, Math.abs(dy) / cy, 0.001);
      x = 50 + (dx / k) / innerWidth * 100;
      y = 50 + (dy / k) / innerHeight * 100;
    }
    el.style.setProperty('--ex', `${x.toFixed(1)}%`);
    el.style.setProperty('--ey', `${y.toFixed(1)}%`);
    el.className = '';
    void el.offsetWidth;
    el.className = `${kind} go`;
  }

  /** The figures on the end card count up to their values. */
  _countUp(root) {
    try { if (localStorage.getItem('tt.suite') === '1') return; } catch { /* private mode */ }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now(), dur = 950;
    const items = [];
    for (const b of root.querySelectorAll('b')) {
      const m = /^(\$?)([\d,]+)(.*)$/s.exec(b.textContent);
      if (!m) continue;
      const n = parseInt(m[2].replace(/,/g, ''), 10);
      if (!(n > 0)) continue;
      items.push({ b, pre: m[1], n, post: m[3] });
    }
    if (!items.length) return;
    // From nought, now, so the first frame already shows the roll starting.
    for (const it of items) it.b.textContent = `${it.pre}0${it.post}`;
    const finish = () => { for (const it of items) it.b.textContent = `${it.pre}${it.n.toLocaleString()}${it.post}`; };
    const step = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      for (const it of items) it.b.textContent = `${it.pre}${Math.round(it.n * e).toLocaleString()}${it.post}`;
      if (u < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    // Whatever the frame rate does, the figures are right a second from now.
    setTimeout(finish, dur + 120);
  }

  _updateBadges() {
    if (!this.picker) return;
    let w = 0;
    for (const u of this.battle.units) {
      if (!u.alive || !(u.rank > 0) || w >= this._badges.length) continue;
      const sc = this.picker.toScreen(u.pos.clone().setY(u.pos.y + (u.def.model === 'infantry' ? 3.6 : 5.0)));
      const el = this._badges[w++];
      if (sc.behind) { el.hidden = true; continue; }
      el.hidden = false;
      el.textContent = '★'.repeat(u.rank);
      el.style.left = `${sc.x}px`;
      el.style.top = `${sc.y}px`;
    }
    for (let i = w; i < this._badges.length; i++) this._badges[i].hidden = true;
  }

  /**
   * Touch confirmation.
   *
   * A pool of pre-made elements rather than one created per tap: on a phone,
   * creating and destroying a DOM node inside a pointer handler is enough to
   * cost a frame, and a ripple that stutters is worse than no ripple.
   */
  _setupRipples() {
    this._ripplePool = [];
    this._rippleNext = 0;
    const layer = document.createElement('div');
    layer.id = 'ripples';
    for (let i = 0; i < 8; i++) {
      const r = document.createElement('span');
      r.className = 'ripple';
      layer.appendChild(r);
      this._ripplePool.push(r);
    }
    document.body.appendChild(layer);
  }

  /**
   * Show a ripple at a screen position.
   * @param {'aim'|'deploy'|'ui'} kind changes the colour, so the feedback also
   *   says what the tap was going to mean.
   */
  ripple(x, y, kind = 'ui') {
    const el = this._ripplePool[this._rippleNext];
    this._rippleNext = (this._rippleNext + 1) % this._ripplePool.length;
    el.className = 'ripple';
    // Force a reflow so restarting the animation actually restarts it.
    void el.offsetWidth;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.className = `ripple go ${kind}`;
  }

  /**
   * Publish how far down the screen the top bar really reaches.
   *
   * Everything down either side used to be pinned to a guessed offset — 92,
   * 124, 156, and a 232 for the case where the target card was open. Those
   * numbers were measured on one phone in a browser tab. Add a notch, add
   * the home-screen app's taller status bar, or add a third objective line
   * to the bar, and the whole rail slides underneath the readouts it was
   * supposed to sit below. Measured, it cannot: the bar says how tall it is
   * and the rails follow.
   */
  _measureTopBar() {
    const bar = document.getElementById('topbar');
    if (!bar) return;
    const publish = () => {
      const h = Math.round(bar.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty('--hud-top', `${h}px`);
    };
    publish();
    if (typeof ResizeObserver === 'function') {
      this._topObserver = new ResizeObserver(publish);
      this._topObserver.observe(bar);
    } else {
      window.addEventListener('resize', publish);
      window.addEventListener('orientationchange', publish);
    }
  }

  /**
   * The cards, in two drawers: the guns and the teams on the ground under
   * UNITS, everything that comes in from outside the battery under STRIKES.
   * `bars` is each drawer's order, which is also what the number keys index:
   * the ground units by default, the strikes with Shift or with that drawer
   * open. Each card's number is its place in its own drawer.
   */
  _buildBar() {
    this.bars = { units: [], strikes: [] };
    const frags = { units: document.createDocumentFragment(), strikes: document.createDocumentFragment() };
    // The strikes in two groups: what stays on station, then what makes one
    // pass, each cheapest first. A label opens each group.
    const loiters = (u) => !!u.aircraft?.station;
    const strikes = UNITS.filter((u) => u.strike)
      .sort((a, b) => (loiters(b) - loiters(a)) || (a.cost - b.cost));
    const order = [...UNITS.filter((u) => !u.strike), ...strikes];
    let group = null;
    for (const u of order) {
      const bar = u.strike && this.el.strikebar ? 'strikes' : 'units';
      if (bar === 'strikes' && loiters(u) !== group) {
        group = loiters(u);
        const tag = document.createElement('div');
        tag.className = 'cb-group';
        tag.textContent = group ? 'LOITERING' : 'SINGLE USE';
        frags.strikes.appendChild(tag);
      }
      this.bars[bar].push(u.id);
      const card = document.createElement('button');
      card.className = 'unit-card locked';
      card.dataset.id = u.id;
      card.style.setProperty('--i', this.bars[bar].length - 1);
      card.title = `${u.full} — ${u.blurb}`;
      const n = this.bars[bar].length;

      card.innerHTML = `
        <div class="uc-tier">${u.tier}</div>
        <div class="uc-key">${bar === 'strikes' ? '⇧' : ''}${n}</div>
        <div class="uc-icon">${unitIcon(u.id) || ''}</div>
        <div class="uc-name${u.name.length > 7 ? ' long' : ''}">${u.name}</div>
        <div class="uc-cost">$${u.cost.toLocaleString()}</div>
        <div class="uc-lock">LOCKED</div>`;

      card.addEventListener('click', () => {
        if (card.classList.contains('locked')) {
          // A locked card says no out loud, and says when: the card shakes,
          // the phone buzzes, and the prompt gives the reason on its face.
          feedback.emit('deny');
          card.classList.remove('nope'); void card.offsetWidth; card.classList.add('nope');
          const why = card.classList.contains('sealed')
            ? `${u.name} · released by a later contract`
            : `${u.name} · unlocks ${card.querySelector('.uc-lock')?.textContent?.toLowerCase() || 'as the target falls'} demolished`;
          this.showPrompt(why, 'warn');
          return;
        }
        this.onSelect(u.id);
      });

      this.cards.set(u.id, card);
      frags[bar].appendChild(card);
    }
    this.el.buildbar.appendChild(frags.units);
    if (this.el.strikebar) this.el.strikebar.appendChild(frags.strikes);
  }

  /**
   * The quiet line under the readouts: what the lift is doing, what a tap
   * would do. Not the prompt band over the middle of the map, which is for
   * the things that need answering.
   */
  status(text, life = 3.5) {
    if (!this.el.status) {
      const el = document.createElement('div');
      el.id = 'status';
      document.getElementById('ui').appendChild(el);
      this.el.status = el;
    }
    // Re-writing the same line is a layout for nothing, and this is called
    // from a drag: the count under a line of guns holds steady for most of
    // it. The clock is still pushed out — the line is still there.
    if (text !== this._statusText) {
      this._statusText = text;
      this.el.status.textContent = text;
      this.el.status.classList.add('on');
    }
    this._statusTimer = life;
  }

  showPrompt(text, kind = '') {
    this.el.prompt.textContent = text;
    // A warning is a refusal, and a refusal shakes its head: restarted each
    // time, so a second no is seen as a second no.
    this.el.prompt.className = '';
    if (kind === 'warn') void this.el.prompt.offsetWidth;
    this.el.prompt.className = kind === 'warn' ? 'warn deny' : kind;
    this.el.prompt.hidden = false;
    this._promptTimer = kind === 'warn' ? 2.2 : 0;
  }

  hidePrompt() {
    this.el.prompt.hidden = true;
    this._promptTimer = 0;
  }

  feed(text, kind = '') {
    // On a phone the feed is off, and UNIT LOST, ON TARGET, SOLD and the
    // weapon releases were all feed-only: the lines that matter go to the
    // status row there instead.
    if ((kind === 'bad' || kind === 'big') && this.el.feed && getComputedStyle(this.el.feed).display === 'none') {
      this.status(text.toLowerCase(), 3.5);
    }
    const line = document.createElement('div');
    line.className = `feed-line ${kind}`;
    line.textContent = text;
    this.el.feed.appendChild(line);
    while (this.el.feed.children.length > 6) this.el.feed.firstChild.remove();
    setTimeout(() => {
      line.classList.add('fade');
      setTimeout(() => line.remove(), 520);
    }, 3600);
  }

  update(dt) {
    const b = this.battle;

    if (this._statusTimer > 0) {
      this._statusTimer -= dt;
      if (this._statusTimer <= 0 && this.el.status) {
        this.el.status.classList.remove('on');
        this._statusText = null;        // so the same line can be shown again
      }
    }
    if (this._promptTimer > 0) {
      this._promptTimer -= dt;
      if (this._promptTimer <= 0) this.hidePrompt();
    }
    for (const p of this._popups) p.age += dt;
    this._updateBadges();

    // Written on change only. Assigning the same string to textContent still
    // replaces the node and dirties layout, sixty times a second, for a dozen
    // readouts that change once a second at most.
    const setText = (el, t) => { if (el && el.__t !== t) { el.__t = t; el.textContent = t; } };
    if (this.el.ordersModes && this._lastOrdersMode !== b.fireMode) {
      this._lastOrdersMode = b.fireMode;
      this.el.ordersModes.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('on', btn.dataset.mode === b.fireMode);
      });
    }
    if (this.el.smokeBtn) {
      const cd = b.smokeCooldown;
      const canPay = b.freeBuild || b.money >= 120;
      setText(this.el.smokeBtn, cd > 0 ? `SMOKE ${Math.ceil(cd)}s` : 'SMOKE $120');
      this.el.smokeBtn.classList.toggle('wait', cd > 0);
      this.el.smokeBtn.classList.toggle('unaffordable', cd <= 0 && !canPay);
      this.el.smokeBtn.hidden = !b.smokes;
    }

    // The funds roll to the figure rather than jumping to it. A jump is a
    // number changing; a roll is money arriving.
    const money = Math.floor(b.money);
    if (this._moneyShown == null || Math.abs(money - this._moneyShown) > 4000) this._moneyShown = money;
    else if (Math.abs(money - this._moneyShown) < 1) this._moneyShown = money;
    else this._moneyShown += (money - this._moneyShown) * Math.min(1, dt * 8);
    setText(this.el.money, `$${Math.round(this._moneyShown).toLocaleString()}`);
    setText(this.el.income, `$${b.income.toFixed(0)}/s`);
    if (!this._flyBound) {
      this._flyBound = true;
      this.el.target?.addEventListener('click', () => this.onFocusTarget());
      this.el.units?.closest('.tb-block')?.addEventListener('click', () => this.onFocusUnits());
      this.el.target?.classList.add('tappable');
      this.el.units?.classList.add('tappable');
    }

    // The bar is the whole job, not just the landmark. A level with a second
    // garrisoned building in it is not four fifths finished because the tower
    // has gone.
    const objs = b.objectives;
    const done = b.objectiveProgress;
    const integ = 1 - done;
    const pct = Math.round(done * 100);
    const w = `${Math.max(0, integ * 100).toFixed(2)}%`;
    if (this.el.integrity.__w !== w) {
      // A sheen runs along the bar each time it drops: two identical
      // animations taken in turn, so a new hit restarts it without a reflow.
      if (this.el.integrity.__w) this._sheen = this._sheen === 'sheen-a' ? 'sheen-b' : 'sheen-a';
      this.el.integrity.__w = w; this.el.integrity.style.width = w;
    }
    setText(this.el.integrityPct, `${pct}%`);
    const cls = `integrity-fill${integ < 0.45 ? ' critical' : integ < 0.78 ? ' hurt' : ''}${this._sheen ? ` ${this._sheen}` : ''}`;
    if (this.el.integrity.className !== cls) this.el.integrity.className = cls;

    // Per-objective breakdown, so "what is left to do" is never a guess. Only
    // drawn when there is more than one thing to bring down.
    if (this.el.objectives) {
      if (objs.length < 2) {
        this.el.objectives.hidden = true;
      } else {
        this.el.objectives.hidden = false;
        // Keyed on the done state too: a wing brought down by height goes to
        // DOWN while its mass reading has not moved.
        // The same direction as the bar above it. These used to print
        // integrity — ELIZABETH TOWER 100% for a tower nobody had touched,
        // immediately under a bar reading 0% — so the two numbers a player
        // sees first ran opposite ways with nothing to say which was which.
        const sig = objs.map((o) => `${o.label}:${Math.round(b.objectiveShare(o) * 100)}`).join('|');
        if (sig !== this._objSig) {
          this._objSig = sig;
          this.el.objectives.innerHTML = objs.map((o) => {
            const ok = b.objectiveDone(o);
            const p = Math.round(b.objectiveShare(o) * 100);
            return `<span class="obj${ok ? ' done' : ''}">${o.label}
              <b>${ok ? 'DOWN' : `${p}%`}</b></span>`;
          }).join('');
        }
      }
    }

    const h = b.primary.standingHeight() - b.originGround;
    // The lean is the clearest signal the shelling is working, and for a while
    // it is the *only* one — the height barely moves while a tower goes four
    // degrees out of plumb. Worth its own readout.
    const lean = b.primary.leanDegrees;
    setText(this.el.height, lean > 0.15
      ? `${h.toFixed(1)} m · ${lean.toFixed(1)}° OUT OF PLUMB`
      : `${h.toFixed(1)} m standing`);
    this.el.height.classList.toggle('leaning', lean > 0.15);
    if (lean > 1.2 && !this._leanWarned) {
      this._leanWarned = true;
      this.feed('STRUCTURE LEANING', 'big');
    }
    if (lean < 0.2) this._leanWarned = false;

    setText(this.el.defenders, String(b.garrison.aliveCount));
    setText(this.el.units, String(b.units.filter((u) => u.alive).length));

    // What the dock is holding, and whether the ORDERS drawer has anything
    // worth opening for.
    this.syncDock(b.selectedUnitId);
    if (this.el.dockOrders) {
      this.el.dockOrders.classList.toggle('armed', !!b.target);
    }

    // Build bar state.
    for (const u of UNITS) {
      const card = this.cards.get(u.id);
      const unlocked = b.isUnlocked(u);
      const affordable = b.freeBuild || b.money >= u.cost;

      card.classList.toggle('locked', !unlocked);
      card.classList.toggle('unaffordable', unlocked && !affordable);
      card.classList.toggle('selected', b.selectedUnitId === u.id);

      if (!unlocked) {
        // Two ways to be locked and they want different words. A weapon the
        // campaign has not released yet is not going to appear however much of
        // this building comes down, and telling a player to reach 12% for it is
        // a promise the level cannot keep.
        if (b.isReleased && !b.isReleased(u)) {
          card.classList.add('sealed');
          setText(card.querySelector('.uc-lock'), 'CONTRACT');
        } else {
          card.classList.remove('sealed');
          // Quoted on the bar's scale, not on its own.
          //
          // The bar at the top is each objective's share of the way to its own
          // threshold; an unlock is a fraction of all the mass on the map, and
          // at Giza the two differ by a factor of sixteen. So the bar read 14 %
          // while a card said "UNLOCK 12 %" and stayed locked, which is the
          // game contradicting itself in two places a thumb's width apart.
          // Same conversion the tick marks on the bar already use.
          const scale = b.level?.unlockScale ?? 1;
          const denom = Math.max(0.05, this._unlockDenom ?? 1);
          const at = Math.min(0.999, ((u.unlockFrac ?? 0) / scale) / denom);
          setText(card.querySelector('.uc-lock'), `AT ${Math.max(1, Math.round(at * 100))}%`);
        }
      } else if (!this._lastUnlocked.has(u.id)) {
        card.classList.remove('sealed');
        this._lastUnlocked.add(u.id);
        // What was open at the start is not news.
        if (this._seeded) this.feed(`${u.full} AVAILABLE`, 'big');
      }
    }
    this._seeded = true;

    // Target card. Shown whenever anything is engaging, since guns now pick
    // their own aim point when nothing has been designated — a silent card
    // would read as "nothing is shooting", which is the opposite of the truth.
    const guns = b.gunsOnTarget;
    if (b.target || guns > 0) {
      this.el.targetcard.hidden = false;
      setText(this.el.tcSection, b.target
        ? (b.targetLabel || 'structure').toUpperCase()
        : 'FREE FIRE');
      setText(this.el.tcHeight, b.target
        ? `${(b.target.y - b.originGround).toFixed(1)} m`
        : '—');
      setText(this.el.tcGuns, String(guns));
      // The folded line says the same thing in half the words.
      setText(this.el.tcBriefSection, b.target
        ? (b.targetLabel || 'structure').toUpperCase()
        : 'FREE FIRE');
      setText(this.el.tcBriefGuns, `${guns} GUN${guns === 1 ? '' : 'S'}`);
    } else {
      this.el.targetcard.hidden = true;
    }
    this._syncLoiters(b);
  }

  /**
   * The aircraft on station, under the target card: one icon and one clock
   * each. Written five times a second rather than every frame — a clock
   * face moving a degree a frame is a style write for nothing.
   */
  _syncLoiters(b) {
    const box = this.el.loiters;
    if (!box || !b.air || !b.air.loiterStatus) return;
    const now = performance.now();
    if (now - (this._loiterAt || 0) < 200) return;
    this._loiterAt = now;
    const PER_ROW = 3;
    if (!this._loiterMore) {
      // Built once: the first row with its toggle, and a holder for the rest.
      const first = document.createElement('div');
      first.className = 'lo-row';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'lo-more';
      more.hidden = true;
      more.innerHTML = '<span></span><i aria-hidden="true"></i>';
      more.addEventListener('click', () => {
        this._loitersOpen = !this._loitersOpen;
        this._loiterSig = '';
        this._loiterAt = 0;
        this._syncLoiters(b);
      });
      box.appendChild(first);
      this._loiterFirst = first;
      this._loiterMore = more;
      this._loiterRows = [];
    }
    const list = b.air.loiterStatus(this._loiterList || (this._loiterList = []));
    const items = this._loiterItems || (this._loiterItems = new Map());
    const live = new Set();
    for (const e of list) {
      live.add(e.sortie);
      let el = items.get(e.sortie);
      if (!el) {
        el = document.createElement('div');
        el.className = 'lo-item';
        el.title = e.sortie.def.full;
        el.innerHTML = `<img src="assets/icons/${e.id}.png" alt="${e.sortie.def.name}" draggable="false"><span class="lo-clock"></span>`;
        items.set(e.sortie, el);
      }
      el.classList.toggle('inbound', e.inbound);
      el.classList.toggle('low', !e.inbound && e.left < 0.2);
      el.lastChild.style.setProperty('--f', e.left.toFixed(3));
    }
    for (const [s, el] of items) if (!live.has(s)) { el.remove(); items.delete(s); }

    // Rows, in call order: rebuilt only when who is on station changes, or
    // the toggle does, not five times a second.
    const open = !!this._loitersOpen && list.length > PER_ROW;
    const sig = `${open}|${list.map((e) => e.sortie.t0 ?? (e.sortie.t0 = Math.random())).join(',')}`;
    if (sig !== this._loiterSig) {
      this._loiterSig = sig;
      const first = this._loiterFirst, more = this._loiterMore;
      for (let i = 0; i < Math.min(PER_ROW, list.length); i++) first.appendChild(items.get(list[i].sortie));
      first.appendChild(more);
      const extra = list.length - PER_ROW;
      more.hidden = extra <= 0;
      if (extra > 0) more.firstChild.textContent = `+${extra}`;
      box.classList.toggle('open', open);
      const need = open ? Math.ceil(extra / PER_ROW) : 0;
      while (this._loiterRows.length < Math.ceil(Math.max(0, extra) / PER_ROW)) {
        const row = document.createElement('div');
        row.className = 'lo-row';
        box.appendChild(row);
        this._loiterRows.push(row);
      }
      this._loiterRows.forEach((row, r) => {
        row.hidden = r >= need;
        for (let i = PER_ROW * (r + 1); i < Math.min(list.length, PER_ROW * (r + 2)); i++) {
          row.appendChild(items.get(list[i].sortie));
        }
        if (r >= need) row.replaceChildren();
      });
      if (!open) {
        // Folded, the hidden ones are not in the page at all.
        for (let i = PER_ROW; i < list.length; i++) items.get(list[i].sortie).remove();
      }
    }
    box.hidden = items.size === 0;
    document.body.classList.toggle('loitering', items.size > 0);
    if (items.size) document.body.style.setProperty('--lo-bottom', `${Math.round(box.getBoundingClientRect().bottom)}px`);
  }

  /**
   * Say that a frame stopped working, and what stopped it.
   *
   * Called from the frame loop once it has seen half a second of nothing but
   * faults. Before this existed the same condition simply froze the picture
   * with the interface still alive on top of it, which is the least
   * informative way a game can break: everything the player can see says the
   * game is running. The message is printed rather than paraphrased so it can
   * be read off a photograph of the screen and turned into a fix.
   */
  showFault(message, at = '') {
    const el = document.getElementById('fault');
    if (!el || !el.hidden) return;
    const m = document.getElementById('fault-msg');
    const a = document.getElementById('fault-at');
    if (m) m.textContent = message;
    if (a) a.textContent = at;
    el.hidden = false;
  }

  /**
   * The collapse clip: a button over the dock for half a minute once one is
   * ready, and one on the report at the end for as long as there is a clip.
   */
  setClip(clip) {
    this.clip = clip;
    const btn = document.getElementById('clip-btn');
    const ec = document.getElementById('ec-clip');
    if (btn) btn.addEventListener('click', () => clip.open());
    if (ec) ec.addEventListener('click', () => clip.open());
    clip.onReady = () => {
      if (ec) ec.hidden = false;
      if (!btn || document.body.classList.contains('ended')) return;
      btn.hidden = false;
      clearTimeout(this._clipTimer);
      this._clipTimer = setTimeout(() => { btn.hidden = true; }, 30000);
    };
  }

  showEnd(kind, summary, opts = {}) {
    this.el.endcard.hidden = false;
    const ecClip = document.getElementById('ec-clip');
    if (ecClip) ecClip.hidden = !this.clip?.best;
    // Everything else goes away.
    //
    // The card is one more thing inside `#ui`, so the whole battle interface
    // stayed on screen behind it: the target readout, the fire-mode buttons,
    // SMOKE, TEST, and the "tap the target to call the strike" prompt, all
    // sitting over an after-action report for a battle that had finished. The
    // same rule the clear-view key uses hides the lot.
    document.body.classList.add('ended');
    const won = kind === 'win';
    this.el.ecTitle.textContent = opts.title ?? (won
      ? (this.battle.level?.victory ?? 'TARGET DOWN')
      : 'ASSAULT STALLED');
    // A five-word title at headline size stacks three deep; give it a step
    // down so it holds two lines.
    const long = this.el.ecTitle.textContent.length > 16;
    this.el.ecTitle.className = `ec-title ${won ? 'win' : 'lose'}${long ? ' long' : ''}`;
    const site = this.battle.level?.subtitle ?? '';
    this.el.ecSub.textContent = opts.sub ?? (won ? site : 'Out of funds with the target still standing');

    const mins = Math.floor(summary.time / 60);
    const secs = Math.floor(summary.time % 60);
    const rows = [
      ['Masonry brought down', `${summary.score.toLocaleString()} t`],
      ['Height remaining', `${summary.heightStanding.toFixed(1)} m of ${summary.startHeight.toFixed(1)} m`],
      ['Defenders neutralised', summary.defendersKilled],
      ['Units lost', summary.unitsLost],
      ['Rounds fired', summary.shotsFired],
      ...(this.battle.collapseRounds != null ? [['Came down in', `${this.battle.collapseRounds} rounds`]] : []),
      ...(this.challenge && won ? [['Challenge', this.battle.collapseRounds == null ? `— vs ${this.challenge.rounds}`
        : this.battle.collapseRounds < this.challenge.rounds ? `BEATEN · ${this.battle.collapseRounds} vs ${this.challenge.rounds}`
          : this.battle.collapseRounds === this.challenge.rounds ? `MATCHED · ${this.challenge.rounds}`
            : `${this.battle.collapseRounds} vs ${this.challenge.rounds}`]] : []),
      ['Spent', `$${summary.spent.toLocaleString()}`],
      ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
    ];
    this.el.ecStats.innerHTML = rows
      .map(([k, v]) => `<div class="ec-stat"><span>${k}</span><b>${v}</b></div>`)
      .join('');
    this._countUp(this.el.ecStats);
    // Only offer the next target when this one is actually down. After a
    // stalled assault the thing to do is run it again, not walk away.
    // Carrying on only makes sense when there is something still standing to
    // carry on against.
    if (this.el.ecKeep) this.el.ecKeep.hidden = !won || summary.heightStanding <= 0.5;
    if (this.el.ecNext) {
      this.el.ecNext.hidden = !won;
      this.el.ecNext.textContent = this.nextTargetLabel
        ? `NEXT: ${this.nextTargetLabel}` : 'NEXT TARGET';
    }
    // The marks.
    //
    // Closing a contract stops being interesting the first time; closing it
    // in nine rounds when it took forty stays interesting, and that is the
    // whole reason to run one again. Three of them rather than one medal,
    // each won on its own, because coming in under the round count and coming
    // in under budget are different skills and a single grade hides which one
    // a player has.
    if (this.el.ecMarks) {
      const marks = won ? (opts.marks || []) : [];
      this.el.ecMarks.hidden = !marks.length;
      this.el.ecMarks.innerHTML = marks.map((m) => {
        const fmt = (v) => (m.unit === '$' ? `$${v.toLocaleString()}`
          : m.unit === 's' ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`
            : m.unit === 'x' ? `${v}\u00d7`
              : v.toLocaleString());
        return `<div class="ec-mark${m.won ? ' won' : ''}${m.best ? ' best' : ''}">`
          + `<span class="em-label">${m.label}</span>`
          + `<b class="em-got">${fmt(m.got)}</b>`
          + `<span class="em-par">par ${m.high ? '\u2265' : ''}${fmt(m.par)}</span>`
          + `${m.best ? '<span class="em-best">BEST</span>' : ''}</div>`;
      }).join('');
    }

    // What closing the contract bought. Said here rather than on the map,
    // because this is the moment it was earned.
    if (this.el.ecRelease) {
      const r = won ? opts.release : null;
      this.el.ecRelease.hidden = !r;
      if (r) {
        this.el.ecRelease.innerHTML = `<span class="ec-rel-tag">CONTRACT CLOSED</span>`
          + `<span class="ec-rel-line">${r.unlockLine}</span>`;
      }
    }
  }
}
