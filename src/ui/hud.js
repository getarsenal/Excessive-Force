import { UNITS } from '../game/units.js';
import { unitIcon } from './icons.js';

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
    this.onToggleSound = opts.onToggleSound || (() => {});
    this.onNextTarget = opts.onNextTarget || (() => {});
    this.onKeepGoing = opts.onKeepGoing || (() => {});
    this.onPickTarget = opts.onPickTarget || (() => {});
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
      tcClear: document.getElementById('tc-clear'),
      feed: document.getElementById('feed'),
      endcard: document.getElementById('endcard'),
      ecTitle: document.getElementById('ec-title'),
      ecSub: document.getElementById('ec-sub'),
      ecStats: document.getElementById('ec-stats'),
      ecAgain: document.getElementById('ec-again'),
      ecNext: document.getElementById('ec-next'),
      ecKeep: document.getElementById('ec-keep'),
      ecTargets: document.getElementById('ec-targets'),
      targetsBtn: document.getElementById('targets-btn'),
    };

    if (this.el.target && battle.level) this.el.target.textContent = battle.level.target;

    this.cards = new Map();
    this._buildBar();

    this.el.tcClear.addEventListener('click', () => this.onClearTarget());
    this.soundOn = true;
    this.el.sound = document.getElementById('sound-toggle');
    if (this.el.sound) {
      this.el.sound.addEventListener('click', () => {
        this.soundOn = !this.soundOn;
        this.el.sound.textContent = this.soundOn ? 'SOUND ON' : 'SOUND OFF';
        this.el.sound.classList.toggle('off', !this.soundOn);
        this.onToggleSound(this.soundOn);
      });
    }
    this.el.ecAgain.addEventListener('click', () => this.onRestart());
    if (this.el.ecNext) this.el.ecNext.addEventListener('click', () => this.onNextTarget());
    if (this.el.ecKeep) {
      this.el.ecKeep.addEventListener('click', () => {
        this.el.endcard.hidden = true;
        this.onKeepGoing();
      });
    }
    if (this.el.ecTargets) this.el.ecTargets.addEventListener('click', () => this.onPickTarget());
    if (this.el.targetsBtn) {
      this.el.targetsBtn.addEventListener('click', () => this.onPickTarget());
    }

    this._promptTimer = 0;
    this._lastUnlocked = new Set();
    this._setupRipples();
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

  _buildBar() {
    const frag = document.createDocumentFragment();
    for (const u of UNITS) {
      const card = document.createElement('button');
      card.className = 'unit-card locked';
      card.dataset.id = u.id;
      card.title = `${u.full} — ${u.blurb}`;

      card.innerHTML = `
        <div class="uc-tier">${u.tier}</div>
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

    if (this._promptTimer > 0) {
      this._promptTimer -= dt;
      if (this._promptTimer <= 0) this.hidePrompt();
    }

    this.el.money.textContent = `$${Math.floor(b.money).toLocaleString()}`;
    this.el.income.textContent = `$${b.income.toFixed(0)}/s`;

    // The bar is the whole job, not just the landmark. A level with a second
    // garrisoned building in it is not four fifths finished because the tower
    // has gone.
    const objs = b.objectives;
    const done = b.objectiveProgress;
    const integ = 1 - done;
    const pct = Math.round(done * 100);
    this.el.integrity.style.width = `${Math.max(0, integ * 100)}%`;
    this.el.integrityPct.textContent = `${pct}%`;
    this.el.integrity.className = `integrity-fill${integ < 0.45 ? ' critical' : integ < 0.78 ? ' hurt' : ''}`;

    // Per-objective breakdown, so "what is left to do" is never a guess. Only
    // drawn when there is more than one thing to bring down.
    if (this.el.objectives) {
      if (objs.length < 2) {
        this.el.objectives.hidden = true;
      } else {
        this.el.objectives.hidden = false;
        const sig = objs.map((o) => `${o.label}:${Math.round(o.structure.monumentIntegrity * 100)}`).join('|');
        if (sig !== this._objSig) {
          this._objSig = sig;
          this.el.objectives.innerHTML = objs.map((o) => {
            const ok = b.objectiveDone(o);
            const p = Math.round(o.structure.monumentIntegrity * 100);
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
    this.el.height.textContent = lean > 0.15
      ? `${h.toFixed(1)} m · ${lean.toFixed(1)}° OUT OF PLUMB`
      : `${h.toFixed(1)} m standing`;
    this.el.height.classList.toggle('leaning', lean > 0.15);
    if (lean > 1.2 && !this._leanWarned) {
      this._leanWarned = true;
      this.feed('STRUCTURE LEANING', 'big');
    }
    if (lean < 0.2) this._leanWarned = false;

    this.el.defenders.textContent = String(b.garrison.aliveCount);
    this.el.units.textContent = String(b.units.filter((u) => u.alive).length);

    // Build bar state.
    for (const u of UNITS) {
      const card = this.cards.get(u.id);
      const unlocked = b.isUnlocked(u);
      const affordable = b.money >= u.cost;

      card.classList.toggle('locked', !unlocked);
      card.classList.toggle('unaffordable', unlocked && !affordable);
      card.classList.toggle('selected', b.selectedUnitId === u.id);

      if (!unlocked) {
        // Shown against the same scaled progress the gate uses, or the
        // number on the card is not the number being tested.
        const scale = b.level?.unlockScale ?? 1;
        const need = Math.max(1, Math.round(((u.unlockFrac ?? 0) / scale) * 100));
        card.querySelector('.uc-lock').textContent = `${need}% DAMAGE`;
      } else if (!this._lastUnlocked.has(u.id)) {
        this._lastUnlocked.add(u.id);
        this.feed(`${u.full} AVAILABLE`, 'big');
      }
    }

    // Target card. Shown whenever anything is engaging, since guns now pick
    // their own aim point when nothing has been designated — a silent card
    // would read as "nothing is shooting", which is the opposite of the truth.
    const guns = b.gunsOnTarget;
    if (b.target || guns > 0) {
      this.el.targetcard.hidden = false;
      this.el.tcSection.textContent = b.target
        ? (b.targetLabel || 'structure').toUpperCase()
        : 'FREE FIRE';
      this.el.tcHeight.textContent = b.target
        ? `${(b.target.y - b.originGround).toFixed(1)} m`
        : '—';
      this.el.tcGuns.textContent = String(guns);
    } else {
      this.el.targetcard.hidden = true;
    }
  }

  showEnd(kind, summary) {
    this.el.endcard.hidden = false;
    const won = kind === 'win';
    this.el.ecTitle.textContent = won ? 'TARGET DOWN' : 'ASSAULT STALLED';
    this.el.ecTitle.className = `ec-title ${won ? 'win' : 'lose'}`;
    const site = this.battle.level?.subtitle ?? '';
    this.el.ecSub.textContent = won ? site : 'Out of funds with the target still standing';

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
  }
}
