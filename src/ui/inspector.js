import { UNITS_BY_ID, UNITS } from '../game/units.js';

/**
 * Two readouts the game was missing.
 *
 * The unit tip: what a weapon actually does before you have paid for it.
 * The cards showed a name and a price, and the difference between a
 * Carl Gustaf and an RPG-32 was something you found out by buying both.
 * Hover, or press and hold on a phone, and the card says.
 *
 * The unit card: a gun you have placed is a thing you can tap. It reports
 * its health, its record, and lets you sell it back — half price — when the
 * position has turned out to be a bad one.
 */

const GUNS = UNITS.filter((u) => !u.strike);
const MAX_POWER = Math.max(...GUNS.map((u) => u.warhead.power));
const MAX_RANGE = Math.max(...GUNS.map((u) => u.range));
const MAX_DISP = Math.max(...GUNS.map((u) => u.dispersion));

function bar(label, frac, cls = '') {
  const pct = Math.round(Math.max(0.04, Math.min(1, frac)) * 100);
  return `<div class="ut-bar ${cls}"><span>${label}</span><i><b style="width:${pct}%"></b></i></div>`;
}

/** The tooltip's body for one weapon. */
export function unitTipHTML(u, battle) {
  const w = u.warhead;
  const unlocked = battle ? battle.isUnlocked(u) : true;
  // The card's own number, from the gate's own arithmetic; and a weapon the
  // campaign has not released is not waiting on this bar at all.
  const need = battle ? Math.round(battle.unlockAt(u) * 100) : 0;
  const sealed = battle?.isReleased && !battle.isReleased(u);
  const lockLine = sealed ? 'Released by a later contract' : `Unlocks when the bar reads ${need}%`;
  if (u.strike) {
    return `
    <div class="ut-head"><b>${u.full}</b><span>$${(battle ? battle.costOf(u) : u.cost).toLocaleString()}</span></div>
    <div class="ut-blurb">${u.blurb}</div>
    ${bar('Vs stone', u.strike.frac / 0.35)}
    ${bar('Blast', 1)}
    ${bar('Accuracy', 1)}
    <div class="ut-foot">
      <span>called in</span><span>one bomb</span>
      <span>${Math.round(u.strike.frac * 100)}% of whatever it lands on</span>
    </div>
    ${unlocked ? '' : `<div class="ut-lock">${lockLine}</div>`}`;
  }
  return `
    <div class="ut-head"><b>${u.full}</b><span>$${(battle ? battle.costOf(u) : u.cost).toLocaleString()}</span></div>
    <div class="ut-blurb">${u.blurb}</div>
    ${bar('Range', u.range / MAX_RANGE)}
    ${bar('Vs stone', Math.pow(w.power / MAX_POWER, 0.6))}
    ${bar('Blast', w.radius / 12.5)}
    ${bar('Accuracy', 1 - u.dispersion / (MAX_DISP + 1))}
    ${bar('Rate of fire', Math.min(1, 4 / u.reload))}
    <div class="ut-foot">
      <span>${u.range} m</span><span>${u.reload.toFixed(1)} s reload</span>
      <span>${u.salvo ? `${u.salvo.count}-round ripple` : `${w.radius.toFixed(0)} m burst`}</span>
    </div>
    ${unlocked ? '' : `<div class="ut-lock">${lockLine}</div>`}`;
}

/** Hook the tooltip onto the build bar's cards. */
export function attachUnitTips(hud, battle) {
  const tip = document.createElement('div');
  tip.id = 'unit-tip';
  tip.hidden = true;
  (document.getElementById('ui') || document.body).appendChild(tip);

  let holdTimer = 0;
  const show = (card) => {
    const u = UNITS_BY_ID[card.dataset.id];
    if (!u) return;
    tip.innerHTML = unitTipHTML(u, battle);
    tip.hidden = false;
    // Over the card, clamped to the viewport.
    const r = card.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 16);
    tip.style.width = `${w}px`;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    tip.style.left = `${left}px`;
    tip.style.bottom = `${window.innerHeight - r.top + 8}px`;
  };
  const hide = () => { tip.hidden = true; clearTimeout(holdTimer); };

  for (const card of hud.cards.values()) {
    card.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') show(card); });
    card.addEventListener('pointerleave', hide);
    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { card.__held = true; show(card); }, 380);
    });
    for (const ev of ['pointerup', 'pointercancel']) card.addEventListener(ev, () => { clearTimeout(holdTimer); hide(); });
    // Reading a weapon's stats is not choosing it: the click that follows a
    // long press is swallowed.
    card.addEventListener('click', (e) => {
      if (card.__held) { card.__held = false; e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  }
  return { show, hide, el: tip };
}

export class UnitCard {
  constructor(battle, opts = {}) {
    this.battle = battle;
    this.onSell = opts.onSell || (() => {});
    this.onFocus = opts.onFocus || (() => {});
    this.unit = null;
    const el = document.createElement('div');
    el.id = 'unit-card';
    el.hidden = true;
    el.innerHTML = `
      <div class="uc2-title">YOUR UNIT</div>
      <div class="uc2-name" id="uc2-name"></div>
      <div class="uc2-hp"><i id="uc2-hp"></i></div>
      <div class="uc2-rows">
        <div><span>Condition</span><b id="uc2-cond"></b></div>
        <div><span>Kills</span><b id="uc2-kills"></b></div>
        <div><span>Rounds on target</span><b id="uc2-hits"></b></div>
        <div><span>Crew</span><b id="uc2-rank"></b></div>
      </div>
      <div class="uc2-buttons">
        <button id="uc2-focus">FOCUS</button>
        <button id="uc2-sell">SELL</button>
        <button id="uc2-close">CLOSE</button>
      </div>`;
    // Inside #ui, so a clear view and the end-of-level report hide it with
    // everything else.
    (document.getElementById('ui') || document.body).appendChild(el);
    this.el = el;
    this.q = (id) => el.querySelector(`#${id}`);
    this.q('uc2-close').addEventListener('click', () => this.hide());
    this.q('uc2-focus').addEventListener('click', () => { if (this.unit) this.onFocus(this.unit); });
    this.q('uc2-sell').addEventListener('click', () => {
      if (!this.unit) return;
      this.onSell(this.unit);
      this.hide();
    });
  }

  show(unit) {
    this.unit = unit;
    this.el.hidden = false;
    this.q('uc2-name').textContent = unit.def.full;
    this._w = {};
    this._sell = null;
    this.update();
  }

  hide() { this.unit = null; this.el.hidden = true; }

  update() {
    const u = this.unit;
    if (!u) return;
    if (!u.alive) { this.hide(); return; }
    // Written only when they change: this runs every frame the card is up.
    const w = this._w || (this._w = {});
    const put = (id, v, prop = 'textContent') => {
      const k = id + prop;
      if (w[k] === v) return;
      w[k] = v;
      if (prop === 'width') this.q(id).style.width = v; else this.q(id)[prop] = v;
    };
    const frac = Math.max(0, u.health / u.maxHealth);
    put('uc2-hp', `${Math.round(frac * 100)}%`, 'width');
    put('uc2-hp', frac > 0.6 ? '' : frac > 0.28 ? 'hurt' : 'critical', 'className');
    put('uc2-cond', u.dugIn ? 'DUG IN' : u.state === 'setup' ? 'SETTING UP' : 'READY');
    put('uc2-kills', String(u.kills || 0));
    put('uc2-hits', String(u.hits || 0));
    const rank = u.rank || 0;
    put('uc2-rank', rank >= 3 ? 'ELITE ★★★' : rank === 2 ? 'VETERAN ★★' : rank === 1 ? 'SEASONED ★' : 'GREEN');
    const sell = this.battle?.freeBuild ? 'SELL' : `SELL $${Math.round(u.def.cost * 0.5).toLocaleString()}`;
    if (this._sell !== sell) { this._sell = sell; this.q('uc2-sell').textContent = sell; }
  }
}
