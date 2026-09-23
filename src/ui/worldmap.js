import { LEVELS } from '../game/levels.js';
import { loadProgress } from './levelselect.js';
import {
  campaignState, objectivesFor, freeDeploy, setFreeDeploy, pendingBurn, markBurnSeen,
} from '../game/campaign.js';
import { CAST, DEFENDER_OF } from '../game/cast.js';
import { introsEnabled, setIntrosEnabled } from './standoff.js';
import { openingEnabled, setOpeningEnabled } from './opening.js';
import { QUALITY_IDS, setQuality, detectQuality } from '../core/quality.js';
import { IMAGE_ICONS } from './icons.js';
import { UNITS_BY_ID } from '../game/units.js';

/** 51.4994, -0.1246 → 51°29′58″N 0°07′29″W, the way a target folder has it. */
const dms = (lat, lon) => {
  const one = (v, pos, neg) => {
    const a = Math.abs(v);
    const d = Math.floor(a), m = Math.floor((a - d) * 60), sec = Math.round(((a - d) * 60 - m) * 60);
    return `${d}°${String(m).padStart(2, '0')}′${String(sec).padStart(2, '0')}″${v >= 0 ? pos : neg}`;
  };
  return `${one(lat, 'N', 'S')} ${one(lon, 'E', 'W')}`;
};

/**
 * The map.
 *
 * The front door is a world, and the world is the menu — not a picture of one
 * over a list. It pans, it zooms, the countries answer to a tap, and the camera
 * goes to whatever you pick. That matters beyond feel: four contracts on one
 * board is the shape of the game, and a board you can only look at is a
 * decoration on a list that is doing the real work.
 *
 * It is also the scoreboard. A contract closed is a country burnt out — a ring
 * of fire from the building to the border, and the place stays charred — so by
 * the end of the campaign the map is four black holes in the world.
 *
 * Drawn from real borders rather than from a picture. Natural Earth's 110m
 * outlines are public domain and about forty kilobytes over the wire, and
 * having the actual polygons is what makes the fire possible at all: with an
 * image every country would need a hand-cut mask before it could be set alight,
 * and the flame would stop at whatever line somebody drew rather than at the
 * coast. See `tools/make_world.py`.
 *
 * Plate carrée, because its arithmetic is two subtractions, and clipped to the
 * inhabited band because Mercator spends a third of its height on Greenland and
 * Siberia and neither of them is a contract.
 *
 * ── The camera ──
 *
 * The projection is fixed and a transform moves over it. The alternative —
 * fitting the SVG's own `viewBox` to whatever should be on screen — was what
 * this did first, and it makes every pixel on the map a function of the zoom:
 * the labels grew to four centimetres tall the moment the view was fitted to
 * Europe, and each of the sizes had to be divided back down by hand. Here one
 * unit is one pixel, always. The land sits inside a group that is translated
 * and scaled, and the pins are placed in screen coordinates on top of it — so
 * the coastline zooms and the furniture never does.
 */

const LAT0 = 78, LAT1 = -56;          // the band the map draws
const W = 2000;                        // projection units across the world
const H = Math.round(W * (LAT0 - LAT1) / 360);

const x = (lon) => (lon + 180) / 360 * W;
const y = (lat) => (LAT0 - lat) / (LAT0 - LAT1) * H;

const SVG = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(SVG, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let cache = null;

/** The outlines, fetched once per session. */
async function loadWorld() {
  if (cache) return cache;
  try {
    const res = await fetch('assets/world.json');
    if (!res.ok) throw new Error(res.status);
    cache = await res.json();
  } catch {
    cache = [];                        // the map still works, it is just empty
  }
  return cache;
}

/** One country as an SVG path, rings and all. */
function pathFor(country) {
  let d = '';
  for (const poly of country.p) {
    for (const ring of poly) {
      // Clip to the drawn band by clamping rather than by cutting: a country
      // that runs off the top should end at the top, not disappear, and no
      // contract is anywhere near the clamp.
      d += `M${ring.map(([lo, la]) =>
        `${x(lo).toFixed(1)} ${y(clamp(la, LAT1, LAT0)).toFixed(1)}`).join('L')}Z`;
    }
  }
  return d;
}

const fmtTime = (t) => {
  if (t == null) return '—';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Show the map and resolve with the level the player picked, or null if they
 * backed out to a match already in progress.
 */
export async function showWorldMap({ current = null, canResume = false } = {}) {
  const world = await loadWorld();
  const state = campaignState();
  const progress = loadProgress();
  // A country that has just fallen is drawn as it was and then set alight, so
  // the player watches the result happen rather than arriving to find it done.
  const burning = pendingBurn();

  const root = document.createElement('div');
  root.id = 'worldmap';
  // The ledger across the top: every contract as a lamp, and the campaign's
  // running totals from the record.
  const tonnage = Object.values(progress).reduce((a, r) => a + (r.bestScore || 0), 0);
  const sorties = Object.values(progress).reduce((a, r) => a + (r.runs || 0), 0);
  const strip = state.list.map((t) => {
    const cls = t.down ? 'done' : (t === state.next ? 'next' : (t.open ? 'open' : 'locked'));
    return `<span class="wm-seg ${cls}" data-level="${t.id}" title="${t.city}">${String(t.no).padStart(2, '0')}</span>`;
  }).join('');
  const tons = Math.round(tonnage).toLocaleString();
  const gear = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/></svg>';
  const chev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  root.innerHTML = `
    <div class="ef" data-view="door">
      <header class="ef-top">
        <div class="ef-ledger"><b>${String(state.done).padStart(2, '0')}</b> / ${state.total} CLOSED</div>
        <div class="ef-brand">
          <img class="ef-logo" src="./logo-512.png" alt="" width="512" height="512">
          <span>EXCESSIVE FORCE</span>
        </div>
        <button class="ef-gear" id="ef-gear" type="button" aria-label="Records and settings">${gear}</button>
      </header>
      <div class="ef-banner" id="ef-banner">NEXT CONTRACT</div>
      <main class="ef-body">

        <section class="ef-view" data-view="door">
          <button class="ef-hero" id="ef-hero" type="button"></button>
          <div class="ef-cards">
            <button class="ef-card" id="ef-tomap" type="button">
              <span class="ef-mini" id="ef-mini"></span>
              <span class="ef-card-name">MAP</span>
              <span class="ef-card-sub">${state.done} ${state.done === 1 ? 'country' : 'countries'} burnt · ${state.total - state.done} open</span>
            </button>
            <button class="ef-card" id="ef-torecords" type="button">
              <span class="ef-figs">
                <span class="ef-fig">${tons}<i>t</i></span>
                <span class="ef-card-sub">${sorties} sortie${sorties === 1 ? '' : 's'} flown</span>
              </span>
              <span class="ef-card-name">RECORDS</span>
              <span class="ef-card-sub" id="ef-last">and settings</span>
            </button>
          </div>
        </section>

        <section class="ef-view" data-view="map">
          <div class="wm-stage">
            <svg class="wm-svg" role="application" aria-label="Campaign map"></svg>
            <div class="wm-zoom">
              <button type="button" data-z="in" aria-label="Zoom in">+</button>
              <button type="button" data-z="out" aria-label="Zoom out">&minus;</button>
              <button type="button" data-z="fit" aria-label="Show the whole world">&#9974;</button>
            </div>
            <div class="wm-hint">DRAG TO PAN · PINCH OR SCROLL TO ZOOM</div>
          </div>
          <div class="ef-list-k">CONTRACTS</div>
          <div class="ef-list" id="ef-list"></div>
        </section>

        <section class="ef-view" data-view="dossier">
          <div class="wm-panel"></div>
        </section>

        <section class="ef-view" data-view="records">
          <div class="ef-tiles">
            <div class="ef-tile"><b>${tons}<i>t</i></b><span>MASONRY DOWN</span></div>
            <div class="ef-tile"><b>${sorties}</b><span>SORTIES FLOWN</span></div>
            <div class="ef-tile"><b>${state.done}<i>/${state.total}</i></b><span>CONTRACTS CLOSED</span></div>
            <div class="ef-tile"><b id="ef-best">—</b><span>BEST CLOSE</span></div>
          </div>
          <div class="ef-set-k">SETTINGS</div>
          <div class="ef-sets">
            <button class="ef-set" id="ef-free" type="button"><span>FREE DEPLOY</span><em></em></button>
            <button class="ef-set" id="ef-intros" type="button"><span>STAND-OFF INTROS</span><em></em></button>
            <button class="ef-set" id="ef-opening" type="button"><span>TITLE OPENING</span><em></em></button>
          </div>
          <div class="ef-set-k sub">QUALITY · RELOADS THE LEVEL</div>
          <div class="ef-qual" id="ef-qual"></div>
        </section>

      </main>
      <footer class="ef-foot">
        <button class="ef-back" id="ef-back" type="button" aria-label="Back">${chev}</button>
        <button class="ef-go" id="ef-go" type="button"></button>
        ${canResume ? '<button class="ef-resume" id="wm-back" type="button">BACK TO THE MATCH</button>' : ''}
      </footer>
    </div>`;
  document.body.appendChild(root);

  const svg = root.querySelector('.wm-svg');
  const stage = root.querySelector('.wm-stage');
  const panel = root.querySelector('.wm-panel');

  const sea = el('rect', { class: 'wm-sea', x: 0, y: 0, width: '100%', height: '100%' });
  const cam = el('g', { class: 'wm-cam' });
  const lands = el('g', { class: 'wm-lands' });
  const burnG = el('g', { class: 'wm-burns' });
  const pinG = el('g', { class: 'wm-pins' });
  cam.append(lands, burnG);
  svg.append(sea, cam, pinG);

  const byIso = new Map(state.list.map((t) => [t.iso, t]));
  for (const c of world) {
    const t = byIso.get(c.i);
    const p = el('path', {
      class: t ? `wm-land wm-target${t.down && t.iso !== burning ? ' burnt' : ''}` : 'wm-land',
      d: pathFor(c),
    });
    if (t) p.setAttribute('data-iso', c.i);
    lands.appendChild(p);
  }

  // The fire, one clipped overlay per contract, idle until it is wanted. Each
  // carries how far it has to run: the distance from the building to the far
  // side of the landmass it stands on — the landmass, not the country, because
  // France's outline includes French Guiana and "the far corner of France" is
  // four thousand miles across the Atlantic.
  const defs = el('defs', {});
  svg.appendChild(defs);
  for (const t of state.list) {
    const c = world.find((w) => w.i === t.iso);
    if (!c) continue;
    const cx = x(t.lon), cy = y(t.lat);
    let near = Infinity, reach = 1;
    for (const poly of c.p) {
      let n = Infinity, far = 0;
      for (const ring of poly) {
        for (const [lo, la] of ring) {
          const d = Math.hypot(x(lo) - cx, y(clamp(la, LAT1, LAT0)) - cy);
          if (d < n) n = d;
          if (d > far) far = d;
        }
      }
      if (n < near) { near = n; reach = far; }
    }
    reach = Math.max(12, reach);
    const clip = el('clipPath', { id: `wm-clip-${t.iso}` });
    clip.appendChild(el('path', { d: pathFor(c) }));
    defs.appendChild(clip);
    const g = el('g', {
      class: 'wm-burn', 'data-iso': t.iso, 'data-reach': reach.toFixed(1),
      'clip-path': `url(#wm-clip-${t.iso})`,
    });
    g.append(
      el('circle', { class: 'wm-char', cx, cy, r: 0 }),
      el('circle', { class: 'wm-flame', cx, cy, r: 0, 'stroke-width': (reach * 0.16).toFixed(1) }),
    );
    burnG.appendChild(g);
  }

  // ── Pins. Built once and moved every frame, because they live in screen
  // space: the coastline zooms and the names do not.
  const pins = state.list.map((t) => {
    const g = el('g', {
      class: `wm-pin${t.down ? ' down' : ''}${t.open ? '' : ' locked'}`
        + `${t.id === current ? ' here' : ''}`,
      'data-level': t.id, tabindex: '0', role: 'button',
      'aria-label': `Contract ${t.no}, ${t.city}, ${t.title}`,
    });
    const parts = {
      lead: el('line', { class: 'wm-lead' }),
      halo: el('circle', { class: 'wm-halo', r: 13 }),
      dot: el('circle', { class: 'wm-dot', r: 5 }),
      // Small, deliberately: London and Paris are a dozen pixels apart at the
      // opening zoom, and two finger-sized discs there would be one target.
      // The label is the thing to hit — which is half of why the labels are
      // pushed off their pins in the first place.
      hit: el('circle', { class: 'wm-hit', r: 11 }),
      box: el('rect', { class: 'wm-hit', rx: 4 }),
      text: el('text', { class: 'wm-city' }),
    };
    parts.text.textContent = `${String(t.no).padStart(2, '0')} ${t.city}`;
    g.append(parts.lead, parts.halo, parts.dot, parts.hit, parts.box, parts.text);
    pinG.appendChild(g);
    return { t, g, ...parts };
  });

  // ── The camera. `k` pixels per projection unit, `tx`/`ty` the world's origin
  // on screen.
  const view = { k: 1, tx: 0, ty: 0, w: 1, h: 1 };
  let kFit = 1;

  const measure = () => {
    const r = stage.getBoundingClientRect();
    view.w = Math.max(160, Math.round(r.width));
    view.h = Math.max(120, Math.round(r.height));
    svg.setAttribute('viewBox', `0 0 ${view.w} ${view.h}`);
    kFit = Math.min(view.w / W, view.h / H);
  };

  const clampView = () => {
    view.k = clamp(view.k, kFit, kFit * 14);
    const sw = W * view.k, sh = H * view.k;
    view.tx = sw <= view.w ? (view.w - sw) / 2 : clamp(view.tx, view.w - sw, 0);
    view.ty = sh <= view.h ? (view.h - sh) / 2 : clamp(view.ty, view.h - sh, 0);
  };

  const sx = (wx) => view.tx + wx * view.k;
  const sy = (wy) => view.ty + wy * view.k;

  const layout = () => {
    cam.setAttribute('transform', `translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.k.toFixed(5)})`);
    // Fitted to the screen, fourteen contracts' names do not fit over Europe
    // whatever the collision pass does with them. Until the map is zoomed in
    // or the contract is picked, a sealed one shows its number and nothing
    // else; the open and closed ones keep their names, which are the ones a
    // player is looking for.
    // "Crowded" is measured on screen, not read off the zoom: the nearest
    // other pin within ninety pixels.
    const at = pins.map((p) => [sx(x(p.t.lon)), sy(y(p.t.lat))]);
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      let near = Infinity;
      for (let j = 0; j < pins.length; j++) {
        if (j !== i) near = Math.min(near, Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1]));
      }
      const num = String(p.t.no).padStart(2, '0');
      const terse = near < 90 && !p.t.open && !p.t.down && !p.g.classList.contains('sel');
      const want = terse ? num : `${num} ${p.t.city}`;
      if (p.text.textContent !== want) p.text.textContent = want;
      const [px, py] = at[i];
      // The label is pushed off its pin, and then pulled back on if the push
      // has run it over the edge. Measured rather than estimated: working out
      // where the end of "01 LONDON" is from its character count was wrong by a
      // fifth, which on a phone is the first letter.
      const anchor = (p.t.lx || 0) < 0 ? 'end' : 'start';
      let lx = px + (p.t.lx || 0);
      const ly = clamp(py + (p.t.ly || 0), 14, view.h - 10);
      p.text.setAttribute('text-anchor', anchor);
      p.text.setAttribute('x', lx.toFixed(1));
      p.text.setAttribute('y', ly.toFixed(1));
      let bb = null;
      try { bb = p.text.getBBox(); } catch { /* not laid out yet */ }
      if (bb && bb.width) {
        const m = 6;
        let dx = 0;
        if (bb.x < m) dx = m - bb.x;
        else if (bb.x + bb.width > view.w - m) dx = (view.w - m) - (bb.x + bb.width);
        if (dx) { lx += dx; p.text.setAttribute('x', lx.toFixed(1)); bb = p.text.getBBox(); }
        p.box.setAttribute('x', (bb.x - 6).toFixed(1));
        p.box.setAttribute('y', (bb.y - 5).toFixed(1));
        p.box.setAttribute('width', (bb.width + 12).toFixed(1));
        p.box.setAttribute('height', (bb.height + 10).toFixed(1));
      }
      for (const c of [p.halo, p.dot, p.hit]) {
        c.setAttribute('cx', px.toFixed(1));
        c.setAttribute('cy', py.toFixed(1));
      }
      p.lead.setAttribute('x1', px.toFixed(1));
      p.lead.setAttribute('y1', py.toFixed(1));
      p.lead.setAttribute('x2', lx.toFixed(1));
      p.lead.setAttribute('y2', ly.toFixed(1));
      // A pin that has been panned off the edge stops taking taps.
      p.g.classList.toggle('off', px < -40 || px > view.w + 40 || py < -40 || py > view.h + 40);
      p._lx = lx; p._ly = ly; p._px = px; p._py = py;
    }
    // Labels off one another. Fitted to a phone, Europe is forty points wide
    // and six contracts' names land on top of each other; the later contract
    // gives way, down if there is room and up if there is not, and its
    // leader line follows. Two passes settle a stack of three.
    const boxes = pins.map((p) => { try { const b = p.text.getBBox(); return b && b.width ? b : null; } catch { return null; } });
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < pins.length; i++) {
        for (let j = i + 1; j < pins.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (!a || !c) continue;
          const ox = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x);
          const oy = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
          if (ox <= 2 || oy <= 2) continue;
          const q = pins[j];
          const down = c.y + c.height + oy + 6 < view.h - 10;
          q._ly += (down ? 1 : -1) * (oy + 6);
          q.text.setAttribute('y', q._ly.toFixed(1));
          try { boxes[j] = q.text.getBBox(); } catch { /* keep */ }
        }
      }
    }
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i], bb = boxes[i];
      if (!bb) continue;
      p.box.setAttribute('x', (bb.x - 6).toFixed(1));
      p.box.setAttribute('y', (bb.y - 5).toFixed(1));
      p.box.setAttribute('width', (bb.width + 12).toFixed(1));
      p.box.setAttribute('height', (bb.height + 10).toFixed(1));
      p.lead.setAttribute('x2', p._lx.toFixed(1));
      p.lead.setAttribute('y2', p._ly.toFixed(1));
    }
  };

  const apply = () => { clampView(); layout(); };

  /** Put a world point in the middle of the stage, at zoom `k`. */
  const centreOn = (wx, wy, k = view.k) => {
    view.k = k;
    view.tx = view.w / 2 - wx * view.k;
    view.ty = view.h / 2 - wy * view.k;
    apply();
  };

  /** Glide there instead, which is what makes picking a contract read as a move. */
  let gliding = 0;
  const glideTo = (wx, wy, k) => {
    const from = { k: view.k, tx: view.tx, ty: view.ty };
    view.k = k;
    view.tx = view.w / 2 - wx * k;
    view.ty = view.h / 2 - wy * k;
    clampView();
    const to = { k: view.k, tx: view.tx, ty: view.ty };
    Object.assign(view, from);
    const id = ++gliding;
    const t0 = performance.now();
    const tick = (now) => {
      if (id !== gliding) return;
      const u = Math.min(1, (now - t0) / 480);
      const e = 1 - Math.pow(1 - u, 3);
      view.k = from.k + (to.k - from.k) * e;
      view.tx = from.tx + (to.tx - from.tx) * e;
      view.ty = from.ty + (to.ty - from.ty) * e;
      layout();
      if (u < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /** Zoom about a point on the stage, so the thing under the finger stays put. */
  const zoomAt = (px, py, factor) => {
    const wx = (px - view.tx) / view.k, wy = (py - view.ty) / view.k;
    view.k = clamp(view.k * factor, kFit, kFit * 14);
    view.tx = px - wx * view.k;
    view.ty = py - wy * view.k;
    gliding++;                      // cancel any glide in flight
    apply();
  };

  // ── The opening framing: the contracts, with room round them. Run when the
  // map is first shown, not at build time: the stage has no size until its
  // view is, and a camera fitted to a box of nothing shows nothing.
  const frameContracts = () => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of state.list) {
      x0 = Math.min(x0, x(t.lon)); x1 = Math.max(x1, x(t.lon));
      y0 = Math.min(y0, y(t.lat)); y1 = Math.max(y1, y(t.lat));
    }
    if (Number.isFinite(x0)) {
      const padX = Math.max((x1 - x0) * 0.85, W * 0.06);
      const padY = Math.max((y1 - y0) * 1.4, H * 0.14);
      const k = Math.min(view.w / ((x1 - x0) + padX * 2), view.h / ((y1 - y0) + padY * 2));
      centreOn((x0 + x1) / 2, (y0 + y1) / 2, clamp(k, kFit, kFit * 6));
    } else {
      centreOn(W / 2, H / 2, kFit);
    }
  };

  /** The dossier for one contract, under the map. */
  const show = (t) => {
    const rec = progress[t.id] || {};
    const objectives = objectivesFor(t.id).map((o) => {
      const met = o.key === 'primary' ? t.down : !!t.met[o.key];
      return `<li class="${met ? 'met' : ''}">${o.label}</li>`;
    }).join('');
    const record = rec.runs
      ? `<div class="wm-rec">
           <div><span>Best</span><b>${Math.round(rec.bestScore || 0).toLocaleString()} t</b></div>
           <div><span>Time</span><b>${fmtTime(rec.bestTime)}</b></div>
           <div><span>Attempts</span><b>${rec.runs}</b></div>
         </div>`
      : '<div class="wm-rec none">NO ATTEMPTS ON RECORD</div>';
    const lv = LEVELS[t.id] || {};
    const status = t.down ? 'closed' : (t.open ? 'active' : 'sealed');
    const stamp = t.down ? 'CLOSED' : (t.open ? 'ACTIVE' : 'SEALED');
    const cmdr = CAST[DEFENDER_OF[t.id]];
    const unlockId = t.unlocks && t.unlocks[0];
    const unlockIcon = unlockId && IMAGE_ICONS.has(unlockId)
      ? `<img class="wm-rel-icon" src="assets/icons/${unlockId}.png" alt="">` : '';
    const unlockName = unlockId && UNITS_BY_ID[unlockId] ? UNITS_BY_ID[unlockId].full : '';
    panel.innerHTML = `
      <div class="wm-doss ${status}">
        <div class="wm-doss-top">
          <div class="wm-doss-no">CONTRACT ${String(t.no).padStart(2, '0')} <span class="wm-doss-file">· ${t.iso} · ${t.city}</span></div>
          <div class="wm-stamp">${stamp}</div>
        </div>
        <div class="wm-doss-grid">
          <div class="wm-doss-main">
            <div class="wm-doss-target">${lv.target || t.title}</div>
            <div class="wm-doss-place">${lv.place || t.city} <span class="wm-coord">${dms(t.lat, t.lon)}</span></div>
            <p class="wm-doss-brief">${t.brief}</p>
            <div class="wm-doss-cols">
              <div>
                <div class="wm-k">Objectives</div>
                <ul class="wm-doss-obj">${objectives}</ul>
              </div>
              <div>
                <div class="wm-k">Record</div>
                ${record}
              </div>
            </div>
            ${t.unlockLine ? `<div class="wm-release">${unlockIcon}<div><div class="wm-k">On close</div><div class="wm-rel-line">${t.unlockLine}</div>${unlockName ? `<div class="wm-rel-sub">${unlockName}</div>` : ''}</div></div>` : ''}
            <div class="wm-doss-go">
              ${t.open
    ? `<button class="wm-go" data-level="${t.id}" type="button">${t.down ? 'RETURN TO THE THEATRE' : 'DEPLOY'}</button>`
    : '<div class="wm-sealed">SEALED — CLOSE THE CONTRACT BEFORE IT</div>'}
            </div>
          </div>
          <aside class="wm-doss-side">
            <figure class="wm-recon">
              <img src="assets/recon/${t.id}.jpg" alt="" loading="lazy" onerror="this.closest('figure').hidden = true">
              <figcaption>RECON · ${(lv.target || t.title).toUpperCase()}</figcaption>
            </figure>
            ${cmdr ? `<div class="wm-cmdr">
              <img class="wm-cmdr-img" src="${cmdr.file}" alt="" loading="lazy">
              <div class="wm-cmdr-text">
                <div class="wm-k">Opposing commander</div>
                <div class="wm-cmdr-name">${cmdr.rank} ${cmdr.name}</div>
                <div class="wm-cmdr-nation">${cmdr.nation}</div>
                <div class="wm-flag" style="--a:${cmdr.colours[0]};--b:${cmdr.colours[1]};--c:${cmdr.colours[2]}"></div>
              </div>
            </div>` : ''}
          </aside>
        </div>
      </div>`;
  };

  // ── The shell.
  //
  // One grammar, four screens: the ledger top-left, the lockup top-centre, a
  // banner that names the question, the answers, and the primary action pinned
  // to the bottom of the viewport. The front door used to be the map with a
  // dossier stapled under it and DEPLOY below the fold on every phone made —
  // the most common action in the game was the hardest thing on the screen to
  // reach. The map is not a worse thing for being one room of four: fourteen
  // pins doing the work of a menu is what made it hard to pick from, and it
  // was always the trophy cabinet rather than the filing cabinet.
  const shell = root.querySelector('.ef');
  const banner = root.querySelector('#ef-banner');
  const goBtn = root.querySelector('#ef-go');
  const backBtn = root.querySelector('#ef-back');
  const hero = root.querySelector('#ef-hero');
  const listEl = root.querySelector('#ef-list');

  const BANNERS = { door: 'NEXT CONTRACT', map: 'THEATRE OF OPERATIONS', records: 'RECORDS' };
  let viewName = 'door';
  let mapReady = false;

  const setView = (name) => {
    viewName = name;
    shell.dataset.view = name;
    banner.textContent = name === 'dossier' && selected
      ? `CONTRACT ${String(selected.no).padStart(2, '0')} · ${selected.iso} · ${selected.city.toUpperCase()}`
      : BANNERS[name];
    backBtn.hidden = name === 'door';
    paintFoot();
    if (name === 'map') {
      // The stage has no size until its view is on screen, and the camera is
      // measured from the stage.
      measure();
      if (!mapReady) { mapReady = true; frameContracts(); }
      apply();
      requestAnimationFrame(layout);
    }
  };

  const paintFoot = () => {
    const t = selected;
    if (viewName === 'records') {
      goBtn.className = 'ef-go ghost';
      goBtn.innerHTML = 'DONE';
      return;
    }
    if (!t || !t.open) {
      goBtn.className = 'ef-go sealed';
      goBtn.innerHTML = t
        ? 'SEALED <em>close the contract before it</em>'
        : 'CHOOSE A TARGET';
      return;
    }
    goBtn.className = 'ef-go';
    goBtn.innerHTML = `${t.down ? 'RETURN' : 'DEPLOY'} <em>${String(t.no).padStart(2, '0')} · ${t.city.toUpperCase()}</em>`;
  };

  /** The hero: the contract itself, at the size the game is about. */
  const paintDoor = (t) => {
    const lv = LEVELS[t.id] || {};
    const objectives = objectivesFor(t.id).slice(0, 3).map((o) => {
      const met = o.key === 'primary' ? t.down : !!t.met[o.key];
      return `<span class="ef-obj${met ? ' met' : ''}">${o.label}</span>`;
    }).join('');
    hero.innerHTML = `
      <span class="ef-hero-art">
        <img src="assets/recon/${t.id}.jpg" alt="" loading="lazy" onerror="this.hidden = true">
        <span class="ef-hero-fade"></span>
        <span class="ef-hero-no">CONTRACT ${String(t.no).padStart(2, '0')} · ${t.iso}</span>
        ${t.down ? '<span class="ef-hero-stamp">CLOSED</span>' : ''}
        <span class="ef-hero-text">
          <span class="ef-hero-target">${lv.target || t.title}</span>
          <span class="ef-hero-place">${lv.place || t.city} <i>${dms(t.lat, t.lon)}</i></span>
        </span>
      </span>
      <span class="ef-hero-objs">${objectives}</span>`;
  };

  /** The whole board, small: the map card sells itself with the burning. */
  const paintMini = () => {
    const holder = root.querySelector('#ef-mini');
    if (!holder) return;
    const m = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ef-mini-svg', 'aria-hidden': 'true' });
    const g = el('g', {});
    for (const c of world) {
      const t = byIso.get(c.i);
      g.appendChild(el('path', {
        class: `ef-mini-land${t && t.down ? ' burnt' : ''}`, d: pathFor(c),
      }));
    }
    m.appendChild(g);
    for (const t of state.list) {
      m.appendChild(el('circle', {
        class: `ef-mini-pin${t.down ? ' down' : ''}${t === state.next ? ' next' : ''}`,
        cx: x(t.lon), cy: y(t.lat), r: t === state.next ? 26 : 16,
      }));
    }
    holder.replaceChildren(m);
  };

  /** The contracts as a list you can hit with a thumb. */
  const paintList = () => {
    listEl.innerHTML = state.list.map((t) => {
      const rec = progress[t.id] || {};
      const right = t.down
        ? `<em class="down">DOWN · ${fmtTime(rec.bestTime)}</em>`
        : (t === state.next ? '<em class="next">NEXT</em>'
          : (t.open ? '<em>OPEN</em>' : '<em class="locked">SEALED</em>'));
      return `<button class="ef-row${t.open ? '' : ' locked'}" type="button" data-level="${t.id}">
        <span class="ef-row-no">${String(t.no).padStart(2, '0')}</span>
        <span class="ef-row-name">${(LEVELS[t.id] || {}).target || t.title}</span>
        ${right}
      </button>`;
    }).join('');
  };

  const paintRecords = () => {
    const best = Object.values(progress).reduce(
      (a, r) => (r.bestTime != null && (a == null || r.bestTime < a) ? r.bestTime : a), null);
    root.querySelector('#ef-best').textContent = fmtTime(best);
    const flag = (id, on, onText, offText) => {
      const b = root.querySelector(id);
      b.querySelector('em').textContent = on ? onText : offText;
      b.classList.toggle('on', !!on);
    };
    flag('#ef-free', freeDeploy(), 'ON · every contract open', 'OFF · contracts in order');
    flag('#ef-intros', introsEnabled(), 'ON', 'OFF');
    flag('#ef-opening', openingEnabled(), 'ON', 'OFF');
    const now = detectQuality().id;
    root.querySelector('#ef-qual').innerHTML = QUALITY_IDS.map((q) => (
      `<button class="ef-q${q === now ? ' on' : ''}" type="button" data-q="${q}">${q.toUpperCase()}</button>`
    )).join('');
    const last = Object.entries(progress)
      .filter(([, r]) => r.runs)
      .map(([id, r]) => ({ id, r }))
      .pop();
    const lastEl = root.querySelector('#ef-last');
    if (last && lastEl) {
      const t = state.list.find((k) => k.id === last.id);
      if (t) lastEl.textContent = `LAST · ${t.city.toUpperCase()} ${fmtTime(last.r.bestTime)}`;
    }
  };

  let selected = null;
  const select = (id, { move = true } = {}) => {
    const t = state.list.find((k) => k.id === id);
    if (!t || t === selected) return;
    selected = t;
    for (const p of pins) p.g.classList.toggle('sel', p.t.id === id);
    for (const p of lands.querySelectorAll('.wm-target')) {
      p.classList.toggle('sel', p.getAttribute('data-iso') === t.iso);
    }
    if (mapReady) layout();
    show(t);
    paintDoor(t);
    if (viewName === 'dossier') {
      banner.textContent = `CONTRACT ${String(t.no).padStart(2, '0')} · ${t.iso} · ${t.city.toUpperCase()}`;
    }
    paintFoot();
    for (const r of listEl.querySelectorAll('.ef-row')) {
      r.classList.toggle('sel', r.dataset.level === id);
    }
    if (move && mapReady) {
      glideTo(x(t.lon), y(t.lat), Math.max(view.k, kFit * 2.4));
      // Bring the whole dossier on screen when it fits: on a desktop the map
      // takes the top of the page and the DEPLOY button would otherwise sit
      // just under the fold. On a phone it is taller than the screen, and
      // scrolling to it would take the map away from the finger that tapped.
    }
  };

  paintMini();
  paintList();
  paintRecords();
  const opening = state.list.find((t) => t.id === current) || state.next || state.list[0];
  if (opening) select(opening.id, { move: false });
  paintFoot();

  const burnT = burning ? byIso.get(burning) : null;
  if (burnT) {
    // A contract just closed, so the map is where the player wants to be: the
    // country going up is the whole reward and it does not play on a card.
    setView('map');
    // Go and look at it first, then light it.
    glideTo(x(burnT.lon), y(burnT.lat), Math.max(kFit * 3.2, view.k));
    setTimeout(() => {
      burnCountry(root, burning, 2600).then(() => {
        markBurnSeen(burning);
        lands.querySelector(`.wm-target[data-iso="${burning}"]`)?.classList.add('burnt');
      });
    }, 520);
  }

  return new Promise((resolve) => {
    const finish = (id) => { cleanup(); root.remove(); resolve(id); };

    // ── Panning, pinching, and telling a tap from a drag.
    //
    // The pointer is captured only once a drag has actually started, which is
    // the one thing holding both halves of this together. Capturing on every
    // pointerdown — the obvious way to write it — sends the matching pointerup
    // to the stage instead of to whatever was pressed, and a `click` only fires
    // where the press and the release agree: the zoom buttons did nothing and
    // neither did tapping a country, because the map was eating its own clicks.
    // Refusing to pan when the press landed on something clickable fixes that
    // too, and costs you the ability to drag the map by a place name, which is
    // most of what your thumb lands on. Waiting for the threshold gives both:
    // a press that never moves is a click on whatever is under it, and a press
    // that moves is a pan from wherever it started.
    const active = new Map();
    let moved = 0, pinch = 0, held = false;
    const onDown = (e) => {
      if (e.button != null && e.button > 0) return;
      if (active.size === 0) { moved = 0; held = false; }
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 2) {
        const [a, b] = [...active.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const grab = (id) => {
      if (held) return;
      held = true;
      try { stage.setPointerCapture(id); } catch { /* not capturable */ }
    };
    const onMove = (e) => {
      const p = active.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (active.size === 2 && pinch > 0) {
        const [a, b] = [...active.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = stage.getBoundingClientRect();
        if (d > 4) {
          grab(e.pointerId);
          zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch);
          pinch = d;
        }
        moved += 20;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 6) return;
      grab(e.pointerId);
      gliding++;
      view.tx += dx; view.ty += dy;
      apply();
    };
    const onUp = (e) => {
      active.delete(e.pointerId);
      if (active.size < 2) pinch = 0;
      if (active.size === 0) held = false;
      try { stage.releasePointerCapture(e.pointerId); } catch { /* never held */ }
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);

    const onWheel = (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0022));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });

    // A tap that was really a drag selects nothing.
    const onClick = (e) => {
      if (moved > 8) return;
      const pin = e.target.closest('.wm-pin');
      if (pin) { select(pin.getAttribute('data-level')); return; }
      const land = e.target.closest('.wm-target');
      if (land) {
        const t = state.list.find((k) => k.iso === land.getAttribute('data-iso'));
        if (t) select(t.id);
      }
    };
    svg.addEventListener('click', onClick);

    const onKey = (e) => {
      const step = 60;
      const at = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (at) {
        e.preventDefault(); gliding++;
        view.tx += at[0]; view.ty += at[1]; apply();
        return;
      }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(view.w / 2, view.h / 2, 1.3); }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(view.w / 2, view.h / 2, 1 / 1.3); }
    };
    root.addEventListener('keydown', onKey);

    for (const p of pins) {
      p.g.addEventListener('click', () => select(p.t.id));
      p.g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.t.id); }
      });
    }

    root.querySelector('.wm-zoom').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const z = btn.getAttribute('data-z');
      if (z === 'in') zoomAt(view.w / 2, view.h / 2, 1.45);
      else if (z === 'out') zoomAt(view.w / 2, view.h / 2, 1 / 1.45);
      else { gliding++; centreOn(W / 2, H / 2, kFit); }
    });

    panel.addEventListener('click', (e) => {
      const go = e.target.closest('.wm-go');
      if (go) finish(go.getAttribute('data-level'));
    });

    // ── The shell's own controls.
    hero.addEventListener('click', () => setView('dossier'));
    root.querySelector('#ef-tomap').addEventListener('click', () => setView('map'));
    root.querySelector('#ef-torecords').addEventListener('click', () => setView('records'));
    root.querySelector('#ef-gear').addEventListener('click', () => setView('records'));
    backBtn.addEventListener('click', () => {
      setView(viewName === 'dossier' ? 'map' : 'door');
    });
    goBtn.addEventListener('click', () => {
      if (viewName === 'records') { setView('door'); return; }
      if (!selected) { setView('map'); return; }
      if (!selected.open) { setView('map'); return; }
      finish(selected.id);
    });
    listEl.addEventListener('click', (e) => {
      const row = e.target.closest('.ef-row');
      if (!row) return;
      select(row.dataset.level);
      if (!row.classList.contains('locked')) setView('dossier');
    });
    root.querySelector('#ef-intros').addEventListener('click', () => {
      setIntrosEnabled(!introsEnabled()); paintRecords();
    });
    root.querySelector('#ef-opening').addEventListener('click', () => {
      setOpeningEnabled(!openingEnabled()); paintRecords();
    });
    root.querySelector('#ef-qual').addEventListener('click', (e) => {
      const q = e.target.closest('.ef-q');
      // The tier is a different world: a reload is the only honest switch, and
      // it is what the pause menu does too.
      if (q && setQuality(q.dataset.q)) window.location.reload();
    });
    root.querySelector('#ef-free')?.addEventListener('click', () => {
      // Kept because the campaign order is the point and testing it is not: a
      // player who wants to go straight back to the Taj can, and the map says
      // out loud that it has been let off the leash.
      setFreeDeploy(!freeDeploy());
      cleanup();
      root.remove();
      showWorldMap({ current, canResume }).then(resolve);
    });
    root.querySelector('#wm-back')?.addEventListener('click', () => finish(null));

    const onResize = () => { measure(); apply(); };
    window.addEventListener('resize', onResize);

    function cleanup() {
      gliding++;
      window.removeEventListener('resize', onResize);
      stage.removeEventListener('wheel', onWheel);
    }
  });
}

/**
 * Burn a country out.
 *
 * The ring starts at the building and runs to the far side of its landmass,
 * with the char following a little way behind it — so the fire reaches the
 * border first and the black fills in after, which is the way a fire actually
 * crosses ground.
 *
 * Always resolves: a menu that can hang on an animation is a menu that can
 * strand the player.
 */
export function burnCountry(root, iso, ms = 2600) {
  return new Promise((resolve) => {
    const g = root && root.querySelector(`.wm-burn[data-iso="${iso}"]`);
    if (!g) { resolve(); return; }
    const char = g.querySelector('.wm-char');
    const flame = g.querySelector('.wm-flame');
    const R = (parseFloat(g.getAttribute('data-reach')) || W * 0.3) * 1.12;
    g.classList.add('lit');
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      // Fast out of the gate and slowing, the way a fire front does once it has
      // eaten the easy ground.
      const e = 1 - Math.pow(1 - u, 2.2);
      flame.setAttribute('r', (R * e).toFixed(1));
      char.setAttribute('r', (R * Math.max(0, e - 0.16)).toFixed(1));
      if (u < 1) { requestAnimationFrame(step); return; }
      g.classList.add('done');
      resolve();
    };
    requestAnimationFrame(step);
  });
}
