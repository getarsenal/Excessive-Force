import { LEVELS } from '../game/levels.js';
import { loadProgress } from './levelselect.js';
import {
  campaignState, objectivesFor, freeDeploy, setFreeDeploy, pendingBurn, markBurnSeen,
} from '../game/campaign.js';
import { TAP } from './pointer.js';

/**
 * The map.
 *
 * The front door is a world, not a list of four cards. That is partly because a
 * campaign wants a board to be fought over, and partly because of what happens
 * when a contract closes: the country burns out. A ring of fire runs from the
 * building to the border and leaves the place charred, and it stays charred —
 * so the map is the scoreboard, and by the end of the game it is four black
 * holes in the world.
 *
 * Drawn from real borders rather than from a picture of a map. Natural Earth's
 * 110m outlines are public domain and about forty kilobytes over the wire, and
 * having the actual polygons is what makes the fire possible at all: with an
 * image every country would need a hand-cut mask before it could be set alight,
 * and the flame would stop at whatever line somebody drew rather than at the
 * coast. See `tools/make_world.py`.
 *
 * Plate carrée, because it is the projection whose arithmetic is two
 * subtractions and because the alternative — Mercator — spends a third of its
 * height on Greenland and Siberia, neither of which is a contract. Latitude is
 * clipped to the inhabited band for the same reason.
 */

const LAT0 = 78, LAT1 = -56;          // the band the map draws
const W = 1000;                        // viewBox units; the SVG scales to fit
const H = Math.round(W * (LAT0 - LAT1) / 360);

const x = (lon) => (lon + 180) / 360 * W;
const y = (lat) => (LAT0 - lat) / (LAT0 - LAT1) * H;

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
      // that runs off the top of the map should end at the top of the map, not
      // disappear, and no contract is anywhere near the clamp.
      d += `M${ring.map(([lo, la]) =>
        `${x(lo).toFixed(1)} ${y(Math.max(LAT1, Math.min(LAT0, la))).toFixed(1)}`).join('L')}Z`;
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

  // Every country, with the contracts picked out of the crowd.
  const byIso = new Map(state.list.map((t) => [t.iso, t]));
  const land = world.map((c) => {
    const t = byIso.get(c.i);
    const cls = t
      ? `wm-land wm-target${t.down && t.iso !== burning ? ' burnt' : ''}`
      : 'wm-land';
    return `<path class="${cls}" d="${pathFor(c)}"${t ? ` data-iso="${c.i}"` : ''}/>`;
  }).join('');

  // And the fire, one clipped overlay per contract, idle until it is wanted.
  //
  // Each one carries how far it has to run: the distance from the building to
  // the furthest corner of its own country. Sized to the map instead — one
  // radius for all of them — the front crossed France in about a sixth of a
  // second and then spent two and a half more expanding into sea that was
  // clipped away, so the only thing anyone ever saw was the result.
  const burns = state.list.map((t) => {
    const c = world.find((w) => w.i === t.iso);
    if (!c) return '';
    const cx = x(t.lon), cy = y(t.lat);
    // The landmass the target is standing on, not the country's whole estate.
    //
    // France's outline includes French Guiana, so "furthest corner of France"
    // is four thousand miles across the Atlantic and the fire crossed the part
    // anyone was looking at in a sixth of a second. The reach is measured over
    // the one polygon the building is inside — the rest of the country goes
    // black at the end with everything else.
    let reach = 1, best = null, bestD = Infinity;
    for (const poly of c.p) {
      let near = Infinity, far = 0;
      for (const ring of poly) {
        for (const [lo, la] of ring) {
          const d = Math.hypot(x(lo) - cx, y(la) - cy);
          if (d < near) near = d;
          if (d > far) far = d;
        }
      }
      if (near < bestD) { bestD = near; best = far; }
    }
    reach = Math.max(6, best || 1);
    return `
      <clipPath id="wm-clip-${t.iso}"><path d="${pathFor(c)}"/></clipPath>
      <g class="wm-burn" data-iso="${t.iso}" data-reach="${reach.toFixed(1)}"
         clip-path="url(#wm-clip-${t.iso})">
        <circle class="wm-char" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="0"/>
        <circle class="wm-flame" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="0"
                stroke-width="${Math.max(3, reach * 0.16).toFixed(1)}"/>
      </g>`;
  }).join('');

  // The board is the theatre, not the planet.
  //
  // Plate carrée over the whole world puts four contracts inside one eighth of
  // the picture, and at phone width that is a map 190 px tall with London and
  // Paris in the same four pixels. The view is fitted to the contracts with a
  // wide margin and then opened out to the shape of the screen — so a phone
  // gets Europe to India at a readable size and a desktop still sees an ocean
  // either side of it. It opens out to the whole world on its own once the
  // contracts are spread that far.
  const view = (() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of state.list) {
      x0 = Math.min(x0, x(t.lon)); x1 = Math.max(x1, x(t.lon));
      y0 = Math.min(y0, y(t.lat)); y1 = Math.max(y1, y(t.lat));
    }
    if (!Number.isFinite(x0)) return { x: 0, y: 0, w: W, h: H };
    // Margin scaled to the spread of the contracts, with a floor — four pins
    // in one country still wants a continent round them.
    const padX = Math.max((x1 - x0) * 0.95, W * 0.09);
    const padY = Math.max((y1 - y0) * 1.5, H * 0.16);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const vw = Math.max(1, window.innerWidth || 1000);
    const aspect = Math.max(1.12, Math.min(2.6, vw / 470));
    let w = (x1 - x0) + padX * 2, h = (y1 - y0) + padY * 2;
    // The shape of the screen first.
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    // Then shrink to fit inside the world *keeping* that shape — clamping the
    // two sides independently is what letterboxed the phone into a strip.
    const k = Math.min(1, W / w, H / h);
    w *= k; h *= k;
    return {
      x: Math.max(0, Math.min(W - w, cx - w / 2)),
      y: Math.max(0, Math.min(H - h, cy - h / 2)),
      w,
      h,
    };
  })();

  /**
   * Map units per screen pixel.
   *
   * Everything drawn on top of the map — the names, the dots, the leaders — is
   * furniture and wants to be the same size whatever the view is showing. Sized
   * in map units instead, the labels grew to four centimetres tall the moment
   * the view was fitted to Europe. One number converts.
   */
  const u = view.w / Math.max(320, Math.min(1148, (window.innerWidth || 1000) - 32));

  const pins = state.list.map((t) => {
    const px = x(t.lon), py = y(t.lat);
    const anchor = (t.lx || 0) < 0 ? 'end' : 'start';
    const lx = px + (t.lx || 0) * u;
    const ly = Math.max(view.y + 10 * u,
      Math.min(view.y + view.h - 10 * u, py + (t.ly || 0) * u));
    const cls = `wm-pin${t.down ? ' down' : ''}${t.open ? '' : ' locked'}`
      + `${t.id === current ? ' here' : ''}`;
    // A leader from the dot to the name, because the name is not over the city
    // any more and a label floating in the Atlantic belongs to nothing.
    //
    // And an invisible disc over the dot, because a `<g>` has no fill and so
    // catches nothing: a tap between the circle and the letters went straight
    // through the pin to the sea behind it. The disc is small, though — London
    // and Paris are fifteen pixels apart on this map and two finger-sized
    // targets there would simply be one. The label is the target, which is
    // half of why the labels are pushed apart in the first place; the box over
    // it is added below, once the browser has said how big it is.
    return `
      <g class="${cls}" data-level="${t.id}" tabindex="0" role="button"
         aria-label="Contract ${t.no}, ${t.city}, ${t.title}">
        <line class="wm-lead" x1="${px.toFixed(1)}" y1="${py.toFixed(1)}"
              x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke-width="${(1.3 * u).toFixed(2)}"/>
        <circle class="wm-halo" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(13 * u).toFixed(2)}"
                stroke-width="${(1 * u).toFixed(2)}"/>
        <circle class="wm-hit" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(9 * u).toFixed(2)}"/>
        <circle class="wm-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(5 * u).toFixed(2)}"
                stroke-width="${(1.6 * u).toFixed(2)}"/>
        <text class="wm-city" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}"
              font-size="${(15 * u).toFixed(2)}" stroke-width="${(3.4 * u).toFixed(2)}"
              text-anchor="${anchor}">0${t.no} ${t.city}</text>
      </g>`;
  }).join('');

  root.innerHTML = `
    <div class="wm-inner">
      <div class="wm-head">
        <img class="wm-logo" src="./logo-512.png" alt="" width="512" height="512">
        <div class="wm-title">EXCESSIVE FORCE</div>
        <div class="wm-sub">${state.done} OF ${state.total} CONTRACTS CLOSED</div>
      </div>
      <div class="wm-stage">
        <svg class="wm-svg"
             viewBox="${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}"
             preserveAspectRatio="xMidYMid meet" role="img" aria-label="Campaign map">
          <rect class="wm-sea" x="0" y="0" width="${W}" height="${H}"/>
          <g class="wm-lands">${land}</g>
          <g class="wm-burns">${burns}</g>
          <g class="wm-pins">${pins}</g>
        </svg>
      </div>
      <div class="wm-panel" hidden></div>
      <div class="wm-foot">
        <button class="wm-free${state.free ? ' on' : ''}" id="wm-free" type="button">
          FREE DEPLOY${state.free ? ' · ON' : ''}</button>
        ${canResume ? '<button class="wm-back" id="wm-back" type="button">BACK TO THE MATCH</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(root);

  // Pull any label that has run off the edge back on, and bring its leader
  // with it.
  //
  // Measured rather than estimated. The offsets are written for a wide view and
  // a phone shows a third of it, so the same push in pixels walks a name off
  // the side — and working out where the edge of "01 LONDON" is from the number
  // of characters got it wrong by a fifth, which on a 430-point screen is the
  // first letter. The browser knows exactly how wide it drew the text.
  for (const el of root.querySelectorAll('.wm-city')) {
    let bb;
    try { bb = el.getBBox(); } catch { continue; }   // not laid out yet
    if (!bb || !bb.width) continue;
    const m = 5 * u;
    let dx = 0;
    if (bb.x < view.x + m) dx = (view.x + m) - bb.x;
    else if (bb.x + bb.width > view.x + view.w - m) {
      dx = (view.x + view.w - m) - (bb.x + bb.width);
    }
    if (dx) {
      el.setAttribute('x', (parseFloat(el.getAttribute('x')) + dx).toFixed(1));
      const lead = el.parentNode.querySelector('.wm-lead');
      if (lead) lead.setAttribute('x2', (parseFloat(lead.getAttribute('x2')) + dx).toFixed(1));
      bb = el.getBBox();
    }
    // The label's own hit box, generous and behind the letters.
    const pad = 5 * u;
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hit.setAttribute('class', 'wm-hit');
    hit.setAttribute('x', (bb.x - pad).toFixed(1));
    hit.setAttribute('y', (bb.y - pad).toFixed(1));
    hit.setAttribute('width', (bb.width + pad * 2).toFixed(1));
    hit.setAttribute('height', (bb.height + pad * 2).toFixed(1));
    el.parentNode.insertBefore(hit, el);
  }

  const panel = root.querySelector('.wm-panel');

  /** The dossier for one contract, under the map. */
  const show = (t) => {
    const rec = progress[t.id] || {};
    const objectives = objectivesFor(t.id).map((o) => {
      const met = o.key === 'primary' ? t.down : !!t.met[o.key];
      return `<li class="${met ? 'met' : ''}">${o.label}</li>`;
    }).join('');
    const stats = rec.runs
      ? `<div class="wm-stats"><span>Best ${Math.round(rec.bestScore || 0).toLocaleString()} t</span>`
        + `<span>${fmtTime(rec.bestTime)}</span>`
        + `<span>${rec.runs} attempt${rec.runs > 1 ? 's' : ''}</span></div>`
      : '';
    panel.hidden = false;
    panel.innerHTML = `
      <div class="wm-doss">
        <div class="wm-doss-no">CONTRACT 0${t.no}</div>
        <div class="wm-doss-target">${LEVELS[t.id]?.target || t.title}</div>
        <div class="wm-doss-place">${LEVELS[t.id]?.place || t.city}</div>
        <p class="wm-doss-brief">${t.brief}</p>
        <ul class="wm-doss-obj">${objectives}</ul>
        ${stats}
        <div class="wm-doss-go">
          ${t.open
    ? `<button class="wm-go" data-level="${t.id}" type="button">${t.down ? 'RETURN' : 'DEPLOY'}</button>`
    : '<div class="wm-sealed">SEALED — CLOSE THE CONTRACT BEFORE IT</div>'}
        </div>
      </div>`;
  };

  if (burning) {
    // After the pins are in the document, so the fire runs under them and the
    // city stays readable while its country goes black.
    burnCountry(root, burning, 2600).then(() => {
      markBurnSeen(burning);
      root.querySelector(`.wm-target[data-iso="${burning}"]`)?.classList.add('burnt');
    });
  }

  // Open on whatever is next, so the map answers "where am I" before it is asked.
  const opening = state.list.find((t) => t.id === current) || state.next || state.list[0];
  if (opening) {
    show(opening);
    root.querySelector(`.wm-pin[data-level="${opening.id}"]`)?.classList.add('sel');
  }

  return new Promise((resolve) => {
    const finish = (id) => { root.remove(); resolve(id); };

    const pick = (el) => {
      const id = el.getAttribute('data-level');
      const t = state.list.find((k) => k.id === id);
      if (!t) return;
      root.querySelectorAll('.wm-pin.sel').forEach((p) => p.classList.remove('sel'));
      el.classList.add('sel');
      show(t);
    };
    root.querySelectorAll('.wm-pin').forEach((el) => {
      el.addEventListener(TAP, () => pick(el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el); }
      });
    });

    panel.addEventListener('click', (e) => {
      const go = e.target.closest('.wm-go');
      if (go) finish(go.getAttribute('data-level'));
    });

    root.querySelector('#wm-free')?.addEventListener('click', () => {
      // Kept because the campaign order is the point and testing it is not: a
      // player who wants to go straight back to the Taj can, and the map says
      // out loud that it has been let off the leash.
      setFreeDeploy(!freeDeploy());
      root.remove();
      showWorldMap({ current, canResume }).then(resolve);
    });
    root.querySelector('#wm-back')?.addEventListener('click', () => finish(null));
  });
}

/**
 * Burn a country out.
 *
 * Run on the after-action screen, on the map the player is about to be sent
 * back to. The ring starts at the building and runs to whatever radius covers
 * the country, with the char following a little way behind it — so the fire
 * arrives at the border first and the black fills in after, which is the way a
 * fire actually crosses ground.
 *
 * Resolves when it has finished. Always resolves: a menu that can hang on an
 * animation is a menu that can strand the player.
 */
export function burnCountry(root, iso, ms = 2600) {
  return new Promise((resolve) => {
    const g = root && root.querySelector(`.wm-burn[data-iso="${iso}"]`);
    if (!g) { resolve(); return; }
    const char = g.querySelector('.wm-char');
    const flame = g.querySelector('.wm-flame');
    // As far as this country goes, and a little past it so the last corner
    // actually catches.
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
