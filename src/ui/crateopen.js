/**
 * A supply crate, opened.
 *
 * One component, used at the front door's SUPPLY CRATES sheet and from the
 * after-action report. The crate is a box in CSS 3D, olive drab with two
 * steel straps and a stencil, turning slowly while it waits. Opening it is a
 * sequence, not a swap of text: it rocks, then bucks, light leaking out of
 * its seams in the colour of what is inside; the straps snap; the lid goes
 * up and over end; a column of light and a ring of rays come out of it with
 * sparks thrown in the rarity's colour; and a card rises out of the box and
 * turns over to show what it was. A legendary shakes the whole screen and
 * whites it out for a moment.
 *
 *   crateStage(host, { count, open, onChange })
 *     count()      crates left to open
 *     open()       opens one: the loot ({ rarity, line, crates }) or null
 *     onChange(g)  after each reveal, with what came out, so the caller can
 *                  take its badges and notices down when the last one goes
 *
 * With two or more waiting, OPEN ALL opens the lot: one crate goes through
 * the sequence in the colour of the best thing in the pile, its card says
 * how many and the best of them, and the haul is tallied under the stage,
 * rarest first, like for like counted together.
 *
 * Returns { destroy }.
 */
import { feedback } from './feedback.js';
import './crateopen.css';

const RARITY = {
  COMMON: { c: '#b9c3cf', n: 18 },
  UNCOMMON: { c: '#6fd08c', n: 26 },
  RARE: { c: '#58a6ff', n: 40 },
  LEGENDARY: { c: '#f3cf6a', n: 72 },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function crateStage(host, { count, open, onChange } = {}) {
  host.innerHTML = `
    <div class="cx-stage" data-state="idle">
      <div class="cx-rays"></div>
      <div class="cx-beam"></div>
      <div class="cx-floor"></div>
      <div class="cx-crate">
        <div class="cx-spin">
          <div class="cx-f cx-front"><i class="cx-st">SUPPLY</i><i class="cx-no">EF-${String(Math.floor(Math.random() * 9000) + 1000)}</i></div>
          <div class="cx-f cx-back"></div>
          <div class="cx-f cx-left"></div>
          <div class="cx-f cx-right"></div>
          <div class="cx-f cx-bottom"></div>
          <div class="cx-f cx-inside"></div>
          <div class="cx-lid"><div class="cx-f cx-top"></div></div>
          <div class="cx-strap cx-s1"><u></u><u></u></div>
          <div class="cx-strap cx-s2"><u></u><u></u></div>
        </div>
      </div>
      <div class="cx-sparks"></div>
      <div class="cx-card"><div class="cx-card-in">
        <div class="cx-cback"><b>?</b></div>
        <div class="cx-cfront"><span></span><b></b><i></i></div>
      </div></div>
    </div>
    <div class="cx-haul" hidden></div>
    <div class="cx-ctl">
      <button class="cx-btn" type="button"></button>
      <button class="cx-btn cx-all" type="button" hidden></button>
    </div>`;
  const stage = host.querySelector('.cx-stage');
  const btn = host.querySelector('.cx-btn');
  const allBtn = host.querySelector('.cx-all');
  const haul = host.querySelector('.cx-haul');
  const sparks = host.querySelector('.cx-sparks');
  const front = host.querySelector('.cx-cfront');
  const timers = [];
  let busy = false;

  const label = () => {
    const n = count();
    btn.disabled = busy || n <= 0;
    btn.textContent = n > 0 ? (stage.dataset.state === 'done' ? `OPEN ANOTHER · ${n} LEFT` : `OPEN · ${n} LEFT`) : 'ALL OPENED';
    allBtn.hidden = n < 2;
    allBtn.disabled = busy;
    allBtn.textContent = `OPEN ALL · ${n}`;
    stage.classList.toggle('empty', n <= 0 && stage.dataset.state !== 'done');
  };
  const at = (ms, f) => timers.push(setTimeout(f, ms));
  const set = (s) => { stage.dataset.state = s; };

  const burst = (col, n) => {
    sparks.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const d = 90 + Math.random() * 170;
      s.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;`
        + `--r:${(Math.random() * 720 - 360).toFixed(0)}deg;--t:${(0.7 + Math.random() * 0.8).toFixed(2)}s;`
        + `--w:${(3 + Math.random() * 6).toFixed(1)}px;`;
      const sc = Math.random() < 0.25 ? '#fff' : col;
      s.style.background = sc; s.style.color = sc;
      sparks.appendChild(s);
    }
  };

  const ORDER = ['LEGENDARY', 'RARE', 'UNCOMMON', 'COMMON'];

  /**
   * The sequence, for one crate's worth of loot or a pile of it: `got` is
   * what the card shows, `pile` (when there is one) is tallied underneath.
   */
  const play = (got, pile = null) => {
    busy = true;
    const R = RARITY[got.rarity] || RARITY.COMMON;
    stage.style.setProperty('--rc', R.c);
    stage.className = `cx-stage r-${got.rarity.toLowerCase()}`;
    haul.hidden = true;
    if (pile) {
      front.querySelector('span').textContent = `${pile.length} CRATES`;
      front.querySelector('b').innerHTML = esc(got.line.toUpperCase());
      front.querySelector('i').textContent = 'THE BEST OF THEM';
      const rows = new Map();
      for (const g of pile) {
        const k = g.id || g.line;
        const r = rows.get(k) || { g, n: 0 };
        r.n++;
        rows.set(k, r);
      }
      const list = [...rows.values()].sort((a, b) => ORDER.indexOf(a.g.rarity) - ORDER.indexOf(b.g.rarity) || b.n - a.n);
      haul.innerHTML = list.map(({ g, n }) => {
        const c = (RARITY[g.rarity] || RARITY.COMMON).c;
        return `<div class="cx-row" style="--rc:${c}"><span>${g.rarity}</span><b>${esc(g.line.toUpperCase())}</b><u>×${n}</u></div>`;
      }).join('');
    } else {
      front.querySelector('span').textContent = got.rarity;
      front.querySelector('b').innerHTML = esc(got.line.toUpperCase());
      front.querySelector('i').textContent = got.perk ? 'READY FOR YOUR NEXT BATTLE' : 'PAID NOW';
    }
    label();
    const reveal = () => {
      set('reveal');
      const big = got.rarity === 'LEGENDARY' || got.rarity === 'RARE';
      feedback.emit(got.rarity === 'LEGENDARY' ? 'jackpot' : big ? 'rank' : 'confirm');
      if (got.rarity === 'LEGENDARY') {
        const flash = document.createElement('div');
        flash.className = 'cx-whiteout';
        document.body.appendChild(flash);
        document.body.classList.add('cx-quake');
        at(900, () => { flash.remove(); document.body.classList.remove('cx-quake'); });
      }
    };
    const finish = () => { set('done'); busy = false; if (pile) haul.hidden = false; label(); if (onChange) onChange(got); };
    if (calm()) {
      set('open'); reveal(); at(200, finish);
      return;
    }
    set('rock'); feedback.emit('rattle');
    at(520, () => { set('buck'); feedback.emit('rattle', 1.3); });
    at(1050, () => { set('strain'); feedback.emit('rattle', 1.5); });
    at(1500, () => { set('open'); feedback.emit('burst'); burst(R.c, R.n); });
    at(1750, () => set('rise'));
    at(2350, reveal);
    at(2900, finish);
  };

  const go = () => {
    if (busy || count() <= 0) return;
    const got = open();
    if (!got) { label(); return; }
    play(got);
  };

  // Every crate there is, a crate's XP crossing a grade included (that pays
  // crates of its own), to a sane limit.
  const goAll = () => {
    if (busy || count() <= 0) return;
    const pile = [];
    for (let k = 0; k < 500 && count() > 0; k++) {
      const g = open();
      if (!g) break;
      pile.push(g);
    }
    if (!pile.length) { label(); return; }
    const best = pile.reduce((a, b) => (ORDER.indexOf(b.rarity) < ORDER.indexOf(a.rarity) ? b : a));
    play(best, pile.length > 1 ? pile : null);
  };

  btn.addEventListener('click', go);
  allBtn.addEventListener('click', goAll);
  stage.addEventListener('click', () => { if (stage.dataset.state === 'idle' || stage.dataset.state === 'done') go(); });
  set('idle');
  label();
  return {
    destroy() { for (const t of timers) clearTimeout(t); document.body.classList.remove('cx-quake'); },
  };
}

/**
 * The crates, opened over whatever is on screen: the after-action report's
 * way in. A dimmed sheet with the stage in it and a DONE button; `onClose`
 * hears when it is put away.
 */
export function crateOverlay({ count, open, onChange, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'cx-overlay';
  wrap.innerHTML = `<div class="cx-panel"><div class="cx-head"><b>SUPPLY CRATES</b><button type="button" class="cx-close">DONE</button></div><div class="cx-host"></div>
    <p class="cx-note">What comes out is spent in your next battle.</p></div>`;
  document.body.appendChild(wrap);
  const st = crateStage(wrap.querySelector('.cx-host'), { count, open, onChange });
  const close = () => { st.destroy(); wrap.remove(); if (onClose) onClose(); };
  wrap.querySelector('.cx-close').addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  feedback.emit('open');
  return { close };
}
