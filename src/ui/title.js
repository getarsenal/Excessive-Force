/**
 * The title screen: the game's front door, in front of the front door.
 *
 * The contract card and its tiles were a good answer to "what next" and a poor
 * one to everything else a player comes back for — the battle they left half
 * done, the other person who plays on this phone, what they have earned, what
 * is on today. So this is the room before it: the war going on behind glass,
 * the commander and their rank, and a menu with everything on it. The contract
 * card is still one tap away, exactly as it was.
 *
 * What moves behind the menu is cheap on purpose. The pictures are the recon
 * photographs every level already has, drifting and crossfading; the fire is
 * a few dozen particles on a small canvas, capped in pixels and stopped when
 * the page is hidden. It is the menu of a game that is about to ask a phone
 * for everything it has.
 */
import { ART, unlockedArt, artDataUrl } from '../game/noseart.js';
import { spentPoints } from '../game/doctrine.js';
import { LEVELS } from '../game/levels.js';
import { UNITS, STRIKES } from '../game/units.js';
import { THEATRES, campaignState, isReleased } from '../game/campaign.js';
import { loadProgress } from './levelselect.js';
import { listBattles, clearBattle } from '../game/battlesave.js';
import {
  commander, setCommanderName, insignia, SLOT_IDS, slotInfo, activeSlot,
  switchSlot, eraseSlot, dailyFor, dailyState, dailyDoneToday, startDailyRun, today,
} from '../game/career.js';
import { menuMusic, eagle } from './music.js';
import { career, gradeFor, dailyOrders, ordersResetIn, openCrate, medalCase, TIERS, COMMISSIONS, GRADES } from '../game/progress.js';
import { feedback } from './feedback.js';
import { crateStage } from './crateopen.js';
import { showWorldMap, HOME } from './worldmap.js';
import './title.css';

const pad2 = (n) => String(n).padStart(2, '0');
const clock = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${pad2(Math.floor(s % 60))}`);
const ago = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
const recon = (id) => `assets/recon/${id}.jpg`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTons = (t) => (t >= 1e6 ? `${(t / 1e6).toFixed(t >= 1e7 ? 1 : 2)}M` : t >= 1e3 ? `${Math.round(t / 1e3)}k` : `${Math.round(t)}`);

/**
 * The whole front door: the title, and the campaign rooms behind it.
 * Resolves with a level id to load, or null to go back to the battle.
 */
export async function openFrontDoor({ current = null, canResume = false } = {}) {
  for (;;) {
    const act = await showTitle({ current, canResume });
    if ('level' in act) return act.level;
    const id = await showWorldMap({ current, canResume, view: act.world, home: true });
    if (id !== HOME) return id;
  }
}

let introPlayed = false;

/** The nose art: what is painted on the fleet, and how to earn the rest. */
function noseArtHtml(prog) {
  const have = new Set(unlockedArt(prog).map((a) => a.id));
  return `<div class="tt-art">${ART.map((a) => have.has(a.id)
    ? `<figure class="tt-art-i"><img src="${artDataUrl(a)}" alt=""><figcaption>${a.name}</figcaption></figure>`
    : `<figure class="tt-art-i locked"><div class="tt-art-q">?</div><figcaption>${a.how}</figcaption></figure>`).join('')}</div>`;
}

/** A short list of rows inside a sheet: TODAY and MORE. */
function listSheet(rows) {
  return `<div class="tt-list">${rows.filter(Boolean).map((r) => `<button class="tt-row" type="button" data-act="${r.act}">`
    + `<b>${r.name}${r.count ? ` <u>${r.count}</u>` : ''}</b><em>${r.sub || ''}</em><span>\u203a</span></button>`).join('')}</div>`;
}

export function showTitle({ current = null, canResume = false } = {}) {
  menuMusic.play();
  const state = campaignState();
  const prog = loadProgress();
  const cmd = commander();
  const tons = Object.values(prog).reduce((a, r) => a + (r.bestScore || 0), 0);
  // Rank is experience now, not the sum of best tonnages: every run pays.
  const car = career();
  const rank = gradeFor(car.xp);
  const orders = dailyOrders(car);
  const ordersDone = orders.filter((o) => o.done).length;
  const mc = medalCase();
  const careerTiers = mc.career.reduce((a, m) => a + m.tier, 0);
  const featsWon = mc.feats.filter((f) => f.won).length;
  const battles = listBattles().filter((b) => LEVELS[b.level]);
  const openIds = state.list.filter((t) => t.open && LEVELS[t.id]).map((t) => t.id);
  const daily = dailyFor(openIds);
  const dstate = dailyState();
  const dDone = dailyDoneToday();
  const next = state.next;
  const released = UNITS.filter((u) => isReleased(u.id)).length;
  const slot = activeSlot();
  const here = current && LEVELS[current];

  // The first thing on the list is the thing most likely wanted.
  let cont;
  if (canResume && here) {
    cont = { act: 'back', line: `BACK TO THE BATTLE · ${esc(here.target || here.name)}` };
  } else if (battles.length) {
    const b = battles[0];
    cont = { act: 'resume', id: b.level, line: `${esc(b.target)} · ${Math.round(b.integrity * 100)}% STANDING · ${clock(b.elapsed)}` };
  } else if (next) {
    // Where it sits in the war, not a contract number: the operation, the
    // battle in it, or the boss.
    const op = state.ops?.next?.op;
    const lv = LEVELS[next.id] || {};
    const where = op ? (state.ops.next.battle.boss ? `\u2620 BOSS \u00b7 ${op.name}` : `${op.name} \u00b7 ${op.battles.findIndex((b) => b.id === next.id) + 1} OF ${op.battles.length - 1}`) : 'SIDE OPERATION';
    cont = { act: 'deploy', id: next.id, line: `${esc((lv.target || next.city).toUpperCase())} \u00b7 ${where}` };
  } else {
    cont = { act: 'campaign', line: 'EVERY CONTRACT CLOSED' };
  }

  const dLv = daily && LEVELS[daily.level];
  const dT = daily && state.list.find((t) => t.id === daily.level);
  // Four rows. Everything else is one tap further in: TODAY holds what
  // resets every day, MORE holds what is looked at now and then.
  const crates = car.crates || 0;
  const todayCount = (daily && !dDone ? 1 : 0) + (3 - ordersDone) + crates;
  const pts = Math.max(0, (state.ops?.total || 0) - spentPoints());
  const items = [
    { act: cont.act, name: canResume ? 'RETURN' : 'CONTINUE', sub: cont.line, primary: true },
    { act: 'campaign', name: 'CAMPAIGN', sub: `\u2605 ${state.ops?.total || 0}${pts >= 2 ? ` \u00b7 DOCTRINE: ${pts} TO SPEND` : ''}` },
    { act: 'today', name: 'TODAY', sub: '', hot: todayCount > 0, count: todayCount },
    battles.length > 1 && { act: 'battles', name: 'BATTLES', sub: '', count: battles.length },
    { act: 'more', name: 'MORE', sub: '' },
  ].filter(Boolean);

  // The backdrop: what has been brought down, then what is next, then the rest.
  const pics = [];
  const push = (id) => { if (id && LEVELS[id] && !pics.includes(id)) pics.push(id); };
  if (cont.id) push(cont.id);
  push(next && next.id);
  for (const t of state.list) if (t.down) push(t.id);
  for (const t of state.list) if (pics.length < 10) push(t.id);

  // The menu's icons, for the tiles on a phone: one stroke, one colour.
  const IC = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    go: IC('<path d="M7 4.5v15l12-7.5z"/>'),
    campaign: IC('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
    daily: IC('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>'),
    battles: IC('<path d="M6 3h12v18l-6-4.5L6 21z"/>'),
    map: IC('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>'),
    armoury: IC('<path d="M3 16h12l3-3h3v-3h-6l-2-2H5v3H3z"/><path d="M8 16v3h3v-3"/>'),
    orders: IC('<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V2.5h6V4M8.5 10l2 2 4-4M8.5 16h7"/>'),
    crates: IC('<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>'),
    medals: IC('<path d="M8 2l4 7 4-7"/><circle cx="12" cy="15" r="6"/><path d="M12 12l1 2h2l-1.6 1.3.6 2-2-1.2-2 1.2.6-2L9 14h2z"/>'),
    boot: IC('<path d="M6 13l6-4 6 4M6 18l6-4 6 4"/>'),
    commanders: IC('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-7 8-7s7 2.5 8 7"/>'),
    records: IC('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    today: IC('<rect x="4" y="5" width="16" height="16" rx="1"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
    more: IC('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  };
  const iconFor = (it) => ICONS[it.primary ? 'go' : it.act] || '';

  const note = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>';
  const gear = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/></svg>';

  const root = document.createElement('div');
  root.id = 'title';
  root.className = introPlayed ? 'tt' : 'tt intro';
  root.innerHTML = `
    <div class="tt-bg"><div class="tt-slide a"></div><div class="tt-slide b"></div></div>
    <canvas class="tt-fx" aria-hidden="true"></canvas>
    <div class="tt-flash" aria-hidden="true"></div>
    <div class="tt-grain" aria-hidden="true"></div>
    <div class="tt-shell">
      <header class="tt-top">
        <button class="tt-cmdr" type="button" data-act="commanders" aria-label="Commander">
          ${insignia(rank, 'tt-ins')}
          <span class="tt-cmdr-t">
            <b>${esc(cmd.name)}</b>
            <i>${rank.name}${car.prestige ? ` · ${'★'.repeat(Math.min(5, car.prestige))}` : ''} · SLOT ${slot}</i>
            <span class="tt-xp"><span style="width:${(rank.frac * 100).toFixed(1)}%"></span></span>
            <small class="tt-xpto">${rank.next ? `${rank.need.toLocaleString()} XP TO ${rank.next}` : 'THE TOP OF THE LADDER'}</small>
          </span>
        </button>
        <div class="tt-tools">
          <button class="tt-tool${menuMusic.enabled ? '' : ' off'}" id="tt-music" type="button" aria-label="Music on or off">${note}</button>
          <button class="tt-tool" type="button" data-act="records" aria-label="Settings">${gear}</button>
        </div>
      </header>
      <div class="tt-hero">
        <img class="tt-logo" src="./logo-512.png" alt="" width="512" height="512">
        <h1 class="tt-name"><span>EXCESSIVE</span><span class="f">FORCE</span></h1>
        <p class="tt-tag">Real landmarks. Real ground. <em>Freedom, delivered.</em></p>
        <p class="tt-caption" aria-hidden="true"><span class="tt-cap-k">RECON</span> <span class="tt-cap-v"></span></p>
      </div>
      <nav class="tt-menu">
        ${items.map((it, k) => `
          <button class="tt-item${it.primary ? ' primary' : ''}${it.hot ? ' hot' : ''}" type="button" data-act="${it.act}" style="--k:${k}">
            <i class="tt-ic" aria-hidden="true">${iconFor(it)}</i>
            <span class="tt-lbl"><b>${it.name}${it.count ? ` <u>${it.count}</u>` : ''}</b>${it.sub ? `<em>${it.sub}</em>` : ''}</span>
            <span class="tt-arrow">›</span>
          </button>`).join('')}
      </nav>
      <aside class="tt-side">
        ${daily ? dailyCard(daily, dLv, dT, dstate, dDone) : ''}
        ${battles.length ? `<div class="tt-sk">BATTLES IN PROGRESS</div>${battles.slice(0, 3).map((b) => battleCard(b)).join('')}` : ''}
      </aside>
    </div>
    <div class="tt-wire" aria-label="War wire"><span class="tt-wire-k">WAR WIRE</span><div class="tt-wire-view"><div class="tt-wire-track"></div></div></div>
    <div class="tt-sheet" hidden><div class="tt-sheet-in"></div></div>`;
  document.body.appendChild(root);
  if (!introPlayed) {
    introPlayed = true;
    setTimeout(() => root.classList.remove('intro'), 2600);
  }

  // ── The backdrop.
  const slides = [...root.querySelectorAll('.tt-slide')];
  const cap = root.querySelector('.tt-cap-v');
  let slideAt = 0, which = 0;
  const showSlide = () => {
    const id = pics[slideAt % pics.length];
    slideAt++;
    if (!id) return;
    const lv = LEVELS[id];
    const t = state.list.find((k) => k.id === id);
    const img = new Image();
    img.onload = () => {
      const s = slides[which];
      which ^= 1;
      s.style.backgroundImage = `url(${img.src})`;
      s.classList.remove('on');
      void s.offsetWidth;          // restart the drift
      s.classList.add('on');
      s.dataset.drift = String(slideAt % 3);
      slides[which].classList.remove('on');
      if (cap) {
        cap.textContent = `${t ? `${pad2(t.no)} · ` : ''}${(lv.target || lv.name || '').toUpperCase()} · ${(t ? t.city : lv.place || '').toUpperCase()}${t && t.down ? ' · DOWN' : ''}`;
      }
    };
    img.src = recon(id);
  };
  showSlide();
  const slideTimer = setInterval(showSlide, 7500);

  // ── The war wire.
  root.querySelector('.tt-wire-track').innerHTML = wireHtml(state, prog, tons, daily, dT);

  // ── The fire behind the glass.
  const fx = startFx(root.querySelector('.tt-fx'), root.querySelector('.tt-flash'));

  // ── Sound: a thump under the finger. Built on the first tap, because a
  // browser will not start audio before one.
  const thump = makeThump();

  return new Promise((resolve) => {
    const done = (act) => {
      clearInterval(slideTimer);
      fx.stop();
      document.removeEventListener('keydown', onKey);
      root.classList.add('leaving');
      setTimeout(() => root.remove(), 260);
      if ('level' in act && act.level) menuMusic.stop();
      resolve(act);
    };
    // Into a battle: the eagle, a flash, and then the level.
    let launching = false;
    const go = (level, how) => {
      if (launching) return;
      launching = true;
      try {
        if (how === 'resume') sessionStorage.setItem('tt.resume', level);
      } catch { /* private mode */ }
      root.classList.add('launch');
      feedback.emit('strike');
      menuMusic.stop(900);
      eagle().then(() => done({ level }));
    };
    const sheet = root.querySelector('.tt-sheet');
    const sheetIn = root.querySelector('.tt-sheet-in');
    const openSheet = (title, html, cls = '') => {
      sheetIn.className = `tt-sheet-in ${cls}`;
      sheetIn.innerHTML = `<header class="tt-sh-top"><b>${title}</b><button class="tt-x" type="button" data-act="close" aria-label="Close">✕</button></header><div class="tt-sh-body">${html}</div>`;
      sheet.hidden = false;
      feedback.emit('open');
      requestAnimationFrame(() => sheet.classList.add('open'));
    };
    let crateUi = null;
    // A battle abandoned from the sheet leaves the menu behind it out of date
    // (CONTINUE, the count, the cards beside it): rebuilt when the sheet shuts.
    let stale = false;
    const closeSheet = () => {
      if (crateUi) { crateUi.destroy(); crateUi = null; }
      sheet.classList.remove('open');
      setTimeout(() => { sheet.hidden = true; }, 240);
      if (stale) setTimeout(() => done({ again: true }), 250);
    };

    const act = (a, el) => {
      // Nothing else while the eagle is flying: the level is already chosen.
      if (launching) return;
      thump();
      switch (a) {
        case 'back': done({ level: null }); break;
        case 'resume': go(el?.dataset.level || cont.id, 'resume'); break;
        case 'deploy': go(cont.id); break;
        case 'campaign': done({ world: 'door' }); break;
        case 'map': done({ world: 'map' }); break;
        case 'records': done({ world: 'records' }); break;
        case 'boot': go('tutorial'); break;
        case 'daily':
          if (!daily) break;
          openSheet('DAILY STRIKE', dailySheet(daily, dLv, dT, dstate, dDone), 'daily');
          break;
        case 'strike':
          if (!daily) break;
          startDailyRun({ level: daily.level, mod: daily.mod.id, date: today() });
          go(daily.level);
          break;
        case 'battles':
          openSheet('BATTLES IN PROGRESS', battles.map((b) => battleCard(b, true)).join(''), 'battles');
          break;
        case 'today':
          openSheet('TODAY', listSheet([
            daily && { act: 'daily', name: 'DAILY STRIKE', sub: dDone ? `DONE \u00b7 ${dstate.streak}-DAY STREAK` : `${daily.mod.name}${dstate.streak ? ` \u00b7 STREAK ${dstate.streak}` : ''}`, count: dDone ? 0 : 1 },
            { act: 'orders', name: 'DAILY ORDERS', sub: `${ordersDone} OF 3 DONE`, count: 3 - ordersDone },
            { act: 'crates', name: 'SUPPLY CRATES', sub: crates ? `${crates} TO OPEN` : 'NONE WAITING', count: crates },
          ]), 'list');
          break;
        case 'more':
          openSheet('MORE', listSheet([
            { act: 'armoury', name: 'ARMOURY', sub: `${released} OF ${UNITS.length} RELEASED` },
            { act: 'medals', name: 'MEDALS', sub: `${featsWon} OF ${mc.feats.length} FEATS` },
            { act: 'noseart', name: 'NOSE ART', sub: `${unlockedArt(prog).length} OF ${ART.length} PAINTED` },
            { act: 'commanders', name: 'COMMANDERS', sub: `SLOT ${slot}` },
            { act: 'boot', name: 'BOOT CAMP', sub: 'TRAINING' },
            { act: 'records', name: 'RECORDS & SETTINGS', sub: '' },
          ]), 'list');
          break;
        case 'discard': {
          const id = el.dataset.level;
          clearBattle(id);
          const k = battles.findIndex((b) => b.level === id);
          if (k >= 0) battles.splice(k, 1);
          stale = true;
          el.closest('.tt-bcard')?.remove();
          root.querySelectorAll(`.tt-side .tt-bcard[data-level="${id}"]`).forEach((n) => n.remove());
          break;
        }
        case 'armoury':
          openSheet('ARMOURY', armouryHtml(), 'armoury');
          break;
        case 'noseart':
          openSheet('NOSE ART', noseArtHtml(prog), 'noseart');
          break;
        case 'medals':
          openSheet('MEDALS', medalsHtml(), 'medals');
          break;
        case 'orders':
          openSheet('DAILY ORDERS', ordersHtml(), 'orders');
          break;
        case 'crates': {
          openSheet('SUPPLY CRATES', cratesHtml(), 'crates');
          if (crateUi) crateUi.destroy();
          crateUi = crateStage(sheetIn.querySelector('.cx-host'), {
            count: () => career().crates,
            open: () => openCrate(),
            onChange: () => {
              const perks = sheetIn.querySelector('.tt-crate-perks');
              if (perks) perks.innerHTML = perksHtml();
              markCrates();
            },
          });
          break;
        }
        case 'unit': {
          // One open at a time, brought into view whole.
          const was = el.classList.contains('open');
          sheetIn.querySelectorAll('.tt-unit.open').forEach((n) => n.classList.remove('open'));
          if (!was) {
            el.classList.add('open');
            requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
          }
          break;
        }
        case 'commanders':
          openSheet('COMMANDERS', commandersHtml(), 'cmdrs');
          break;
        case 'slot':
          if (switchSlot(el.dataset.slot)) window.location.reload();
          break;
        case 'rename': {
          const name = window.prompt('Callsign', commander().name);
          if (name != null) {
            setCommanderName(name);
            done({ world: null, again: true });
          }
          break;
        }
        case 'erase': {
          const id = el.dataset.slot;
          const info = slotInfo(id);
          if (window.confirm(`Erase commander ${info.name || id}? Every record, contract and saved battle in slot ${id} goes.`)) {
            eraseSlot(id);
            if (info.active) window.location.reload();
            else sheetIn.querySelector('.tt-sh-body').innerHTML = commandersInner();
          }
          break;
        }
        case 'close': closeSheet(); break;
        default: break;
      }
    };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !root.contains(b)) return;
      if (b.id === 'tt-music') return;
      if (b.dataset.act === 'sheet-bg') { if (e.target === b) closeSheet(); return; }
      e.stopPropagation();
      act(b.dataset.act, b);
    });
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
    root.querySelector('#tt-music').addEventListener('click', (e) => {
      const on = !menuMusic.enabled;
      menuMusic.enabled = on;
      e.currentTarget.classList.toggle('off', !on);
    });
    const onKey = (e) => {
      if (launching) return;
      if (e.key === 'Escape' && !sheet.hidden) closeSheet();
      else if (e.key === 'Enter' && sheet.hidden && document.activeElement === document.body) act(cont.act);
    };
    document.addEventListener('keydown', onKey);
  }).then((act) => (act.again ? showTitle({ current, canResume }) : act));

  function dailyCard(d, lv, t, ds, isDone) {
    return `<button class="tt-daily${isDone ? ' done' : ''}" type="button" data-act="daily" style="--img:url(${recon(d.level)})">
      <span class="tt-daily-k">DAILY STRIKE · ${d.date}</span>
      <b>${esc((lv && lv.target) || '')}</b>
      <i>${esc(t ? t.city : '')}</i>
      <span class="tt-mod">${d.mod.name}</span>
      <span class="tt-streak">${flame()} ${ds.streak} <small>DAY STREAK</small></span>
      ${isDone ? '<span class="tt-stamp">DONE</span>' : ''}
    </button>`;
  }

  function dailySheet(d, lv, t, ds, isDone) {
    return `<div class="tt-dsheet" style="--img:url(${recon(d.level)})">
      <div class="tt-dsheet-art"><span class="tt-mod big">${d.mod.name}</span></div>
      <h3>${esc((lv && lv.target) || '')}</h3>
      <p class="tt-dsheet-place">${esc(t ? `CONTRACT ${pad2(t.no)} · ${t.city}` : '')}</p>
      <p class="tt-dsheet-line">${d.mod.line}.</p>
      <div class="tt-dsheet-stats">
        <span><b>${ds.streak}</b>DAY STREAK</span>
        <span><b>${ds.best}</b>BEST STREAK</span>
        <span><b>${ds.total}</b>STRIKES FLOWN</span>
      </div>
      <p class="tt-dsheet-foot">Same target for everyone. Miss a day, lose the streak.</p>
      <button class="tt-big${isDone ? ' ghost' : ''}" type="button" data-act="strike">${isDone ? 'FLY IT AGAIN' : 'STRIKE'}</button>
    </div>`;
  }

  function battleCard(b, full = false) {
    const lv = LEVELS[b.level] || {};
    const t = state.list.find((k) => k.id === b.level);
    const pct = Math.round((b.integrity ?? 1) * 100);
    return `<div class="tt-bcard${full ? ' full' : ''}" data-level="${b.level}">
      <button class="tt-bmain" type="button" data-act="resume" data-level="${b.level}" style="--img:url(${recon(b.level)})">
        <span class="tt-bhead"><b>${esc(b.target || lv.target || lv.name)}</b><i>${esc(t ? `${pad2(t.no)} · ${t.city}` : b.place)}</i></span>
        <span class="tt-bbar"><span style="width:${pct}%"></span></span>
        <span class="tt-bstats">
          <span><b>${pct}%</b> STANDING</span>
          <span><b>$${Number(b.money).toLocaleString()}</b></span>
          <span><b>${b.units.length}</b> UNITS</span>
          <span><b>${clock(b.elapsed)}</b></span>
        </span>
        <span class="tt-bago">SAVED ${ago(b.at).toUpperCase()} · TAP TO RESUME</span>
      </button>
      ${full ? `<button class="tt-bx" type="button" data-act="discard" data-level="${b.level}" aria-label="Abandon">ABANDON</button>` : ''}
    </div>`;
  }

  function medalsHtml() {
    const m = medalCase();
    const fmtN = (v, u) => u === '$' ? `$${Math.round(v).toLocaleString()}` : `${Math.round(v).toLocaleString()}${u === 't' ? ' t' : ''}`;
    const careerHtml = m.career.map((c) => {
      const pips = TIERS.map((t, i) => `<i class="tt-pip t${i + 1}${c.tier > i ? ' on' : ''}" title="${t}"></i>`).join('');
      return `<div class="tt-cmedal${c.tier ? ` t${c.tier}` : ''}">
        <b>${esc(c.name)}</b><span class="tt-pips">${pips}</span>
        <span class="tt-cm-line">${esc(c.line)}</span>
        <span class="tt-cm-bar"><u style="width:${(c.frac * 100).toFixed(1)}%"></u></span>
        <i>${c.next ? `${fmtN(c.have, c.unit)} / ${fmtN(c.next, c.unit)} · NEXT: ${TIERS[c.tier]}` : `${fmtN(c.have, c.unit)} · PLATINUM`}</i>
      </div>`;
    }).join('');
    const featsHtml = m.feats.map((f) => {
      const where = f.won && LEVELS[f.won.level] ? ` · ${esc((LEVELS[f.won.level].target || '').toUpperCase())}` : '';
      return `<div class="tt-medal${f.won ? ' won' : ''}"><b>${f.won ? esc(f.name) : '?'.repeat(Math.min(12, f.name.length))}</b><span>${esc(f.line)}</span>`
        + `<i>${f.won ? `WON ${esc(f.won.at)}${where}` : 'NOT YET · 750 XP'}</i></div>`;
    }).join('');
    return `<p class="tt-arm-intro">Four grades each. Feats are won once.</p>
      <div class="tt-sk">CAREER</div><div class="tt-cmedals">${careerHtml}</div>
      <div class="tt-sk">FEATS</div><div class="tt-medals">${featsHtml}</div>`;
  }

  function ordersHtml() {
    const os = dailyOrders(career());
    const done = os.filter((o) => o.done).length;
    return `<p class="tt-arm-intro">750 XP each \u00b7 a crate for all three.</p>
      <div class="tt-orders">${os.map((o) => `<div class="tt-order${o.done ? ' done' : ''}">
        <b>${esc(o.line.toUpperCase())}</b>
        <span class="tt-cm-bar"><u style="width:${(Math.min(1, o.have / o.n) * 100).toFixed(1)}%"></u></span>
        <i>${o.done ? 'DONE · +750 XP' : `${Math.round(o.have).toLocaleString()} / ${Math.round(o.n).toLocaleString()} · 750 XP`}</i>
      </div>`).join('')}</div>
      <p class="tt-note">${done >= 3 ? 'All three done.' : `${3 - done} to go.`} New orders in ${ordersResetIn()}.</p>`;
  }

  function perksHtml() {
    const c = career();
    const pend = [];
    if (c.perks.funds) pend.push(`+$${c.perks.funds.toLocaleString()} FIELD FUNDS`);
    if (c.perks.income) pend.push(`+${Math.round(c.perks.income * 100)}% INCOME`);
    if (c.perks.double) pend.push(`DOUBLE XP × ${c.perks.double} WIN${c.perks.double > 1 ? 'S' : ''}`);
    return pend.length ? `<div class="tt-sk">READY FOR YOUR NEXT BATTLE</div><div class="tt-perks">${pend.map((p) => `<span>${p}</span>`).join('')}</div>` : '';
  }

  function cratesHtml() {
    return `<div class="cx-host"></div>
      <p class="tt-note">Used in your next battle.</p>
      <div class="tt-crate-perks">${perksHtml()}</div>`;
  }

  /**
   * The menu line's notice, kept to the count: the badge and the hot marker
   * go with the last crate. They used to stay lit after every crate was
   * open, until the page was next built.
   */
  function markCrates() {
    const n = career().crates;
    const item = root.querySelector('[data-act="crates"]');
    if (!item) return;
    item.classList.toggle('hot', n > 0);
    const em = item.querySelector('em');
    if (em) em.textContent = n ? `${n} TO OPEN · WHAT'S INSIDE IS FOR YOUR NEXT BATTLE` : 'ALL OPENED · MORE WITH EVERY GRADE';
    const badge = item.querySelector('b u');
    if (badge) { if (n) badge.textContent = n; else badge.remove(); }
  }

  function armouryHtml() {
    // Ground and air on their own scales, square-rooted: a MOAB on the same
    // bar as an AT4 leaves every rifle team a sliver.
    const ground = UNITS.filter((u) => !u.strike), air = UNITS.filter((u) => u.strike);
    const top = (list, f) => Math.max(1e-6, ...list.map(f));
    const maxRange = top(ground, (u) => u.range || 0);
    const maxPowG = top(ground, (u) => u.warhead?.power || 0), maxPowA = top(air, (u) => u.warhead?.power || 0);
    const maxRadG = top(ground, (u) => u.warhead?.radius || 0), maxRadA = top(air, (u) => u.warhead?.radius || 0);
    const bar = (k, v) => `<span class="tt-stat"><i>${k}</i><span><span style="width:${Math.max(4, Math.min(100, v * 100)).toFixed(0)}%"></span></span></span>`;
    // Sections in the order UNITS is, cheapest first; the aircraft and the
    // missile are one section, in the drawer's order: what loiters, then
    // what makes one pass, each cheapest first.
    const sec = (u) => (u.strike ? 'STRIKE' : u.tier);
    const tiers = [...new Set(UNITS.map(sec))];
    return `<p class="tt-arm-intro">Tap a card for the brief.</p>` + tiers.map((tier) => `
      <div class="tt-sk">${tierName(tier)}</div>
      <div class="tt-arm">${(tier === 'STRIKE' ? STRIKES : UNITS.filter((u) => sec(u) === tier)).map((u) => {
        const ok = isReleased(u.id);
        const by = THEATRES.find((t) => t.unlocks.includes(u.id));
        const pow = (u.warhead?.power || 0) / (u.strike ? maxPowA : maxPowG);
        const rad = (u.warhead?.radius || 0) / (u.strike ? maxRadA : maxRadG);
        return `<button class="tt-unit${ok ? '' : ' locked'}" type="button" data-act="unit">
          <span class="tt-unit-art"><img src="assets/icons/${u.id}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span>
          <span class="tt-unit-t"><b>${esc(u.name)}</b><i>${esc(u.full || '')}</i></span>
          <span class="tt-unit-cost">${u.cost ? `$${u.cost.toLocaleString()}` : 'FREE'}</span>
          <span class="tt-unit-stats">
            ${u.strike ? bar('PAYLOAD', Math.sqrt(pow)) : bar('RANGE', Math.sqrt((u.range || 0) / maxRange))}
            ${bar('PUNCH', Math.sqrt(pow))}
            ${bar('BLAST', Math.sqrt(rad))}
          </span>
          <span class="tt-unit-brief">${esc(u.blurb || '')}${!ok && by ? `<br><u>RELEASED BY CONTRACT ${pad2(by.no)} · ${esc(by.city.toUpperCase())}</u>` : ''}</span>
          ${ok ? '' : `<span class="tt-lock">LOCKED${by ? ` · ${pad2(by.no)}` : ''}</span>`}
        </button>`;
      }).join('')}</div>`).join('');
  }

  function commandersInner() {
    return SLOT_IDS.map((id) => {
      const s = slotInfo(id);
      const r = s.rank;
      if (s.empty && !s.active) {
        return `<div class="tt-slot empty"><span class="tt-slot-id">${id}</span>
          <span class="tt-slot-t"><b>EMPTY</b><i>A new commander starts from contract 01</i></span>
          <button class="tt-sbtn" type="button" data-act="slot" data-slot="${id}">ENLIST</button></div>`;
      }
      return `<div class="tt-slot${s.active ? ' active' : ''}">
        <span class="tt-slot-id">${id}</span>
        ${insignia(r, 'tt-ins')}
        <span class="tt-slot-t"><b>${esc(s.name || 'UNNAMED')}</b><i>${r.name}</i>
          <span class="tt-slot-figs">${fmtTons(s.tons)} T · ${s.closed} CLOSED · ${s.sorties} SORTIES${s.battles ? ` · ${s.battles} IN PROGRESS` : ''}${s.streak ? ` · STREAK ${s.streak}` : ''}</span>
        </span>
        <span class="tt-slot-btns">
          ${s.active ? `<button class="tt-sbtn" type="button" data-act="rename" data-slot="${id}">RENAME</button>` : `<button class="tt-sbtn go" type="button" data-act="slot" data-slot="${id}">SELECT</button>`}
          <button class="tt-sbtn warn" type="button" data-act="erase" data-slot="${id}">ERASE</button>
        </span>
      </div>`;
    }).join('');
  }

  function commandersHtml() {
    const r = gradeFor(career().xp);
    const ahead = Object.entries(COMMISSIONS).filter(([lv]) => +lv > r.i).slice(0, 3)
      .map(([lv, k]) => `<span>${esc(GRADES[+lv].name)} · ${esc(k.line.toUpperCase())}</span>`).join('');
    return `<div class="tt-career">
        ${insignia(r, 'tt-ins big')}
        <div><b>${esc(cmd.name)}</b><i>${r.name}</i>
        <span class="tt-xp wide"><span style="width:${(r.frac * 100).toFixed(1)}%"></span></span>
        <small>${r.next ? `${r.need.toLocaleString()} XP TO ${r.next} · GRADE ${r.i + 1} OF ${GRADES.length}` : 'THE TOP OF THE LADDER'}</small></div>
      </div>
      ${ahead ? `<div class="tt-sk">COMMISSIONS AHEAD</div><div class="tt-perks">${ahead}</div>` : ''}
      <div class="tt-sk">SAVE SLOTS</div>
      ${commandersInner()}
`;
  }
}

function tierName(t) {
  return ({ INF: 'INFANTRY', GUN: 'TOWED GUNS', SPH: 'SELF-PROPELLED', AFV: 'ARMOUR', MRL: 'ROCKET ARTILLERY', AIR: 'AIR STRIKES', SEA: 'NAVAL', STRIKE: 'STRIKES · PAID ONCE' })[t] || t;
}

function flame() {
  return '<svg class="tt-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z" fill="currentColor"/></svg>';
}

/** The headlines along the bottom: the player's own war, and the world's opinion of it. */
function wireHtml(state, prog, tons, daily, dT) {
  const lines = [];
  const won = state.list.filter((t) => t.down && prog[t.id]);
  won.sort((a, b) => (prog[b.id].bestTime ?? 1e9) - (prog[a.id].bestTime ?? 1e9));
  for (const t of won.slice(-8)) {
    const lv = LEVELS[t.id] || {};
    lines.push(`<b>${esc(t.city.toUpperCase())}</b> ${esc((lv.target || t.title).toUpperCase())} DOWN IN ${clock(prog[t.id].bestTime)}`);
  }
  if (tons > 0) lines.push(`<b>LEDGER</b> ${Math.round(tons).toLocaleString()} TONNES OF MASONRY BROUGHT DOWN`);
  if (state.next) {
    const lv = LEVELS[state.next.id] || {};
    lines.push(`<b>INTELLIGENCE</b> ${esc((lv.target || state.next.title).toUpperCase())}, ${esc(state.next.city.toUpperCase())}, IS NEXT ON THE LIST`);
  }
  if (daily && dT) lines.push(`<b>TODAY</b> DAILY STRIKE ON ${esc(dT.city.toUpperCase())} · ${daily.mod.name}`);
  const flavour = [
    'INSURERS WITHDRAW COVER FROM EVERY LISTED BUILDING ON EARTH',
    'UNESCO CALLS EMERGENCY SESSION; SESSION VENUE ALSO ON THE LIST',
    'STONEMASONS REPORT RECORD ORDER BOOKS',
    'TOURIST BOARDS ADVISE: SEE IT WHILE IT IS STILL STANDING',
    'PRICE OF 155 MM SHELLS AT ALL-TIME HIGH',
    'POSTCARD SALES COLLAPSE, ALONG WITH THE SUBJECTS',
    'ARCHITECTS INSIST THE LOAD PATH WAS PERFECTLY ADEQUATE',
    'GARRISONS REQUEST HARD HATS',
    'FREEDOM NOW AVAILABLE IN 155 MM',
    'BALD EAGLE POPULATION REPORTS RECORD MORALE',
    'CONGRESS APPROVES ANOTHER ROUND. AND ANOTHER. AND ANOTHER',
    'LOCAL MAN CALLS IT "A BIT MUCH"; COMMANDER CALLS IT "A START"',
    'PENTAGON DENIES HAVING TOO MANY HOWITZERS; ORDERS MORE',
    'ALLIES ASK IF THIS IS STRICTLY NECESSARY. IT IS NOT',
    'SUBTLETY OFFICIALLY RETIRED WITH FULL HONOURS',
  ];
  const f = [...flavour].sort(() => Math.random() - 0.5).slice(0, 6);
  const all = [];
  for (let i = 0; i < Math.max(lines.length, f.length); i++) {
    if (lines[i]) all.push(lines[i]);
    if (f[i]) all.push(`<b>WIRE</b> ${f[i]}`);
  }
  const html = all.map((l) => `<span class="tt-wire-i">${l}</span>`).join('');
  // Twice, so the loop has no seam.
  return `<div class="tt-wire-run" style="--dur:${Math.max(40, all.length * 9)}s">${html}${html}</div>`;
}

/** A soft low thump for a tap, made rather than loaded. */
function makeThump() {
  let ctx = null;
  return () => {
    try {
      if (!menuMusic.enabled) return;
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.25);
    } catch { /* no audio */ }
  };
}

/**
 * The war behind the glass: tracers climbing out of the city, flak bursting
 * over it, embers, two searchlights, and now and then a gun flash lighting the
 * whole horizon. Forty-odd particles on a canvas at no more than one and a half
 * device pixels, and nothing at all when the page is hidden or the player has
 * asked the system for less motion.
 */
function startFx(canvas, flash) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, raf = 0, last = performance.now(), live = true;
  const size = () => {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size);
  const R = Math.random;
  const tracers = [], bursts = [], embers = [];
  const lights = [{ x: 0.22, a: -0.5, s: 0.23, p: R() * 6 }, { x: 0.78, a: 0.4, s: 0.17, p: R() * 6 }];
  let nextVolley = 0.4, nextFlak = 1.2, nextFlash = 3;

  const volley = () => {
    const x = W * (0.1 + R() * 0.8);
    const warm = R() < 0.55;
    const n = 3 + Math.floor(R() * 5);
    const ang = -Math.PI / 2 + (R() - 0.5) * 0.9;
    for (let i = 0; i < n; i++) {
      const sp = H * (0.55 + R() * 0.35);
      tracers.push({
        x: x + (R() - 0.5) * 10, y: H + 4 + i * 26,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1.4 + R() * 0.8, t: 0, c: warm ? '255,168,72' : '140,255,150',
      });
    }
  };
  const flak = () => {
    bursts.push({ x: W * (0.12 + R() * 0.76), y: H * (0.08 + R() * 0.32), r: 2, t: 0, life: 2.6 + R() * 1.4 });
  };
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    // Thirty frames: tracers and embers do not need more, and every frame of
    // this canvas is also a frame of the blurred glass over it.
    if (now - last < 30) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!live || document.hidden) return;
    g.clearRect(0, 0, W, H);
    const T = now / 1000;

    // Searchlights, additive and faint.
    g.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const a = L.a + Math.sin(T * L.s + L.p) * 0.55;
      const bx = W * L.x, by = H + 10;
      const len = H * 1.25, spread = 0.07;
      const grd = g.createLinearGradient(bx, by, bx + Math.sin(a) * len, by - Math.cos(a) * len);
      grd.addColorStop(0, 'rgba(210,225,255,0.10)');
      grd.addColorStop(1, 'rgba(210,225,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + Math.sin(a - spread) * len, by - Math.cos(a - spread) * len);
      g.lineTo(bx + Math.sin(a + spread) * len, by - Math.cos(a + spread) * len);
      g.closePath();
      g.fill();
    }

    // Tracers.
    nextVolley -= dt;
    if (nextVolley <= 0) { volley(); nextVolley = 0.5 + R() * 1.6; }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const p = tracers[i];
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += H * 0.08 * dt;
      if (p.t > p.life || p.y < -20) { tracers.splice(i, 1); continue; }
      const k = 1 - p.t / p.life;
      g.strokeStyle = `rgba(${p.c},${(0.85 * k).toFixed(3)})`;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
      g.stroke();
    }

    // Flak: a flash, then a dark puff that spreads and fades.
    nextFlak -= dt;
    if (nextFlak <= 0) { flak(); if (R() < 0.4) flak(); nextFlak = 0.9 + R() * 2.2; }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      if (b.t > b.life) { bursts.splice(i, 1); continue; }
      const u = b.t / b.life;
      if (b.t < 0.12) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,190,110,${(0.9 * (1 - b.t / 0.12)).toFixed(3)})`;
        g.beginPath(); g.arc(b.x, b.y, 3 + b.t * 60, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = `rgba(28,26,26,${(0.55 * (1 - u)).toFixed(3)})`;
      g.beginPath(); g.arc(b.x, b.y - u * 6, 4 + Math.sqrt(u) * 22, 0, Math.PI * 2); g.fill();
    }

    // Embers rising off the city.
    g.globalCompositeOperation = 'lighter';
    if (embers.length < 36 && R() < 0.5) {
      embers.push({ x: R() * W, y: H + 4, vy: -(18 + R() * 40), vx: (R() - 0.5) * 12, t: 0, life: 4 + R() * 5, s: 0.8 + R() * 1.6 });
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.t += dt;
      if (e.t > e.life) { embers.splice(i, 1); continue; }
      e.x += (e.vx + Math.sin(T * 2 + i) * 8) * dt; e.y += e.vy * dt;
      const k = Math.sin(Math.PI * e.t / e.life) * (0.6 + 0.4 * Math.sin(T * 9 + i));
      g.fillStyle = `rgba(255,${120 + (i % 5) * 18},50,${Math.max(0, k * 0.8).toFixed(3)})`;
      g.fillRect(e.x, e.y, e.s, e.s);
    }
    g.globalCompositeOperation = 'source-over';

    // A gun somewhere past the horizon.
    nextFlash -= dt;
    if (nextFlash <= 0 && flash) {
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.style.setProperty('--fx', `${(10 + R() * 80).toFixed(0)}%`);
      flash.classList.add('go');
      nextFlash = 4 + R() * 7;
    }
  };
  if (!reduce) raf = requestAnimationFrame(tick);
  return {
    stop() {
      live = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    },
  };
}
