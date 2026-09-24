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
    this.onFireMode = opts.onFireMode || (() => {});
    this.onSmoke = opts.onSmoke || (() => {});
    this.onPause = opts.onPause || (() => {});
    this.onQuality = opts.onQuality || (() => {});
    this.onSurvey = opts.onSurvey || (() => {});
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
      prompt: document.getElementById('prompt'),
      targetcard: document.getElementById('targetcard'),
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
        if (btn.dataset.drawer === 'units' && this.openDrawer !== 'units'
          && this.onDisarm()) return;
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
   * What the UNITS button is holding.
   *
   * With the drawer shut this is the only place the armed weapon shows, so it
   * wears the unit's own icon and its name — a player who has just picked a
   * Paladin and closed the drawer to look at the map must not have to reopen
   * it to find out what a tap is about to cost them.
   */
  syncDock(id) {
    const btn = this.el.dockUnits, icon = this.el.dockUnitsIcon;
    if (!btn || !icon) return;
    const u = id ? UNITS_BY_ID[id] : null;
    btn.classList.toggle('armed', !!u);
    const label = btn.querySelector('.db-label');
    if (label) label.textContent = u ? u.name : 'UNITS';
    if (this._dockIconId === (u ? u.id : null)) return;
    this._dockIconId = u ? u.id : null;
    // Nothing when nothing is armed: the badge underneath is the picture then,
    // and a second drawing behind it would only be something to go wrong.
    icon.innerHTML = u ? (unitIcon(u.id) || '') : '';
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
    const snd = menu.querySelector('#menu-sound');
    snd.addEventListener('click', () => {
      if (this.el.sound) this.el.sound.click();
      else { this.soundOn = !this.soundOn; this.syncSound(); this.onToggleSound(this.soundOn); }
    });
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

  _buildBar() {
    const frag = document.createDocumentFragment();
    for (const u of UNITS) {
      const card = document.createElement('button');
      card.className = 'unit-card locked';
      card.dataset.id = u.id;
      card.title = `${u.full} — ${u.blurb}`;

      card.innerHTML = `
        <div class="uc-tier">${u.tier}</div>
        <div class="uc-key">${this.cards.size + 1}</div>
        <div class="uc-icon">${unitIcon(u.id) || ''}</div>
        <div class="uc-name">${u.name}</div>
        <div class="uc-cost">$${u.cost.toLocaleString()}</div>
        <div class="uc-lock">LOCKED</div>`;

      card.addEventListener('click', () => {
        if (card.classList.contains('locked')) return;
        this.onSelect(u.id);
      });

      this.cards.set(u.id, card);
      frag.appendChild(card);
    }
    this.el.buildbar.appendChild(frag);
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
    this.el.prompt.className = kind;
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

    setText(this.el.money, `$${Math.floor(b.money).toLocaleString()}`);
    setText(this.el.income, `$${b.income.toFixed(0)}/s`);

    // The bar is the whole job, not just the landmark. A level with a second
    // garrisoned building in it is not four fifths finished because the tower
    // has gone.
    const objs = b.objectives;
    const done = b.objectiveProgress;
    const integ = 1 - done;
    const pct = Math.round(done * 100);
    const w = `${Math.max(0, integ * 100).toFixed(2)}%`;
    if (this.el.integrity.__w !== w) { this.el.integrity.__w = w; this.el.integrity.style.width = w; }
    setText(this.el.integrityPct, `${pct}%`);
    const cls = `integrity-fill${integ < 0.45 ? ' critical' : integ < 0.78 ? ' hurt' : ''}`;
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

  showEnd(kind, summary, opts = {}) {
    this.el.endcard.hidden = false;
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
      ['Spent', `$${summary.spent.toLocaleString()}`],
      ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
    ];
    this.el.ecStats.innerHTML = rows
      .map(([k, v]) => `<div class="ec-stat"><span>${k}</span><b>${v}</b></div>`)
      .join('');
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
