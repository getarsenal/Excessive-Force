/**
 * The pay, on the after-action report, and the promotion when it comes.
 *
 * The report lists what the run earned a line at a time, each one landing
 * with a tick, while the bar under the commander's insignia fills toward
 * the next grade. If the bar fills, the screen is taken over: the new
 * insignia slams in, PROMOTED, the new name, and what the grade pays — a
 * supply crate, and every fifth grade a commission that stays. Then the
 * three daily orders with their bars, and the medal grade nearest to coming.
 *
 * The bar is the hook. The name of the next grade and the XP still to go are
 * always printed beside it, and when it is close the report says so.
 */
import { insignia } from '../game/career.js';
import { TIERS, GRADES, ordersResetIn } from '../game/progress.js';
import { fanfare, tick } from '../core/synth.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => Math.round(n).toLocaleString();

/**
 * Fill `el` with the report's pay and run it.
 * @param {HTMLElement} el
 * @param {object} rep     progress.award()'s report
 * @param {object} o       { audio, still } — still: no animation (the harness, reduced motion)
 */
export function renderXp(el, rep, o = {}) {
  if (!el || !rep) { if (el) el.hidden = true; return; }
  el.hidden = false;
  const g0 = rep.gradeBefore, g1 = rep.grade;
  const lines = rep.lines.map((l, i) => `<div class="ecx-line ${l.kind || ''}" style="--i:${i}">`
    + `<span>${esc(l.label)}</span><b>+${fmt(l.xp)}</b></div>`).join('');
  const orders = rep.orders.map((x) => `<div class="ecx-order${x.done ? ' done' : ''}">`
    + `<span>${esc(x.line)}</span><i><u style="width:${(Math.min(1, x.have / x.n) * 100).toFixed(1)}%"></u></i>`
    + `<b>${x.done ? 'DONE' : `${fmt(x.have)} / ${fmt(x.n)}`}</b></div>`).join('');
  const nr = rep.nearest;
  const near = nr ? `<div class="ecx-near"><span>NEXT MEDAL · ${TIERS[nr.tier - 1]} ${esc(nr.name)}</span>`
    + `<i><u style="width:${(nr.frac * 100).toFixed(1)}%"></u></i><b>${fmt(nr.have)} / ${fmt(nr.need)}${nr.unit === 't' ? ' t' : ''}</b></div>` : '';
  el.innerHTML = `
    <div class="ecx-head">
      <span class="ecx-ins">${insignia(g0, 'ecx-insig')}</span>
      <div class="ecx-who">
        <b class="ecx-rank">${esc(g0.name)}</b>
        <span class="ecx-bar"><u></u></span>
        <span class="ecx-to"></span>
      </div>
      <b class="ecx-total">+0 XP</b>
    </div>
    <div class="ecx-lines">${lines}</div>
    <div class="ecx-sec"><span>DAILY ORDERS</span><i>NEW ORDERS IN ${ordersResetIn().toUpperCase()}</i></div>
    <div class="ecx-orders">${orders}</div>
    ${near}
    ${rep.crates ? `<div class="ecx-crates">${rep.crates} SUPPLY CRATE${rep.crates > 1 ? 'S' : ''} WAITING · OPEN THEM AT THE FRONT DOOR</div>` : ''}`;

  const bar = el.querySelector('.ecx-bar u'), to = el.querySelector('.ecx-to');
  const rank = el.querySelector('.ecx-rank'), total = el.querySelector('.ecx-total');
  const ins = el.querySelector('.ecx-ins');
  const setBar = (xp) => {
    let i = 0;
    while (i < GRADES.length - 1 && xp >= GRADES[i + 1].at) i++;
    const g = GRADES[i], nx = GRADES[i + 1];
    const f = nx ? (xp - g.at) / nx.cost : 1;
    bar.style.width = `${(Math.max(0, Math.min(1, f)) * 100).toFixed(1)}%`;
    to.textContent = nx ? `${fmt(nx.at - xp)} XP TO ${nx.name}` : 'THE TOP OF THE LADDER';
    if (rank.textContent !== g.name) {
      rank.textContent = g.name;
      ins.innerHTML = insignia(g, 'ecx-insig');
      ins.classList.remove('up'); void ins.offsetWidth; ins.classList.add('up');
    }
  };

  if (o.still) {
    el.classList.add('still');
    setBar(rep.after);
    total.textContent = `+${fmt(rep.total)} XP`;
    return;
  }
  setBar(rep.before);
  // Each line lands, then the bar runs up to the total.
  const step = 260;
  rep.lines.forEach((l, i) => setTimeout(() => {
    el.querySelectorAll('.ecx-line')[i]?.classList.add('in');
    if (o.audio) tick(o.audio, 0.6 + i * 0.03);
  }, 500 + i * step));
  const t0 = 500 + rep.lines.length * step;
  const dur = 1300 + Math.min(1600, rep.crossed.length * 500);
  const start = performance.now() + t0;
  const ease = (u) => 1 - Math.pow(1 - u, 3);
  let lastGrade = g0.i;
  const run = (now) => {
    const u = Math.max(0, Math.min(1, (now - start) / dur));
    const k = ease(u);
    const xp = rep.before + (rep.after - rep.before) * k;
    setBar(xp);
    total.textContent = `+${fmt(rep.total * k)} XP`;
    let gi = 0;
    while (gi < GRADES.length - 1 && xp >= GRADES[gi + 1].at) gi++;
    if (gi > lastGrade && o.audio) tick(o.audio, 1.6);
    lastGrade = gi;
    if (u < 1) requestAnimationFrame(run);
    else {
      total.textContent = `+${fmt(rep.total)} XP`;
      if (rep.crossed.length || rep.prestiged) setTimeout(() => promote(rep, o), 350);
    }
  };
  setTimeout(() => requestAnimationFrame(run), t0);
  void g1;
}

/** The promotion: the whole screen, until it is tapped away. */
export function promote(rep, o = {}) {
  const top = rep.crossed[rep.crossed.length - 1];
  let el = document.getElementById('promotion');
  if (!el) { el = document.createElement('div'); el.id = 'promotion'; document.body.appendChild(el); }
  const crates = rep.crossed.reduce((a, c) => a + c.crates, 0);
  const comms = rep.crossed.filter((c) => c.commission).map((c) => c.commission.line);
  const g = top ? { kind: top.kind, n: top.n } : { kind: 'star', n: 5 };
  el.innerHTML = `<div class="pr-burst"></div>
    <div class="pr-inner">
      <span class="pr-ins">${insignia(g, 'pr-insig')}</span>
      <span class="pr-tag">${rep.prestiged ? 'PRESTIGE' : rep.crossed.length > 1 ? `PROMOTED ×${rep.crossed.length}` : 'PROMOTED'}</span>
      <b class="pr-name">${esc(rep.prestiged ? `PRESTIGE ${rep.prestige}` : top.name)}</b>
      <div class="pr-pay">
        ${crates ? `<span>+${crates} SUPPLY CRATE${crates > 1 ? 'S' : ''}</span>` : ''}
        ${comms.map((c) => `<span class="comm">COMMISSION · ${esc(c.toUpperCase())}</span>`).join('')}
      </div>
      <i class="pr-tap">TAP TO CONTINUE</i>
    </div>`;
  el.className = '';
  void el.offsetWidth;
  el.className = 'on';
  if (o.audio) fanfare(o.audio);
  const off = () => { el.className = ''; el.removeEventListener('click', off); };
  el.addEventListener('click', off);
}
