/**
 * Optics: the picture through something other than the eye.
 *
 * DAY is the game as it is drawn. THERMAL is the gunship's sensor turret,
 * white-hot: grey, hard contrast, scan lines, a reticle and its readouts.
 * NIGHT VISION is the green tube, a round eyepiece with grain crawling over
 * it. None of it is another render pass: the canvas takes a CSS filter, and
 * the chrome over it is a layer the page draws once — a compositor job that
 * costs nothing in the frame the GPU is already drawing.
 *
 * Chosen from the MENU or with T, kept between sessions, and never on while
 * the screen is cleared for a photograph.
 */

const MODES = ['day', 'thermal', 'nv'];
const LABEL = { day: 'DAY', thermal: 'THERMAL', nv: 'NIGHT VISION' };
let mode = 'day';
let el = null;
let clock = null;

function read() {
  try { const m = localStorage.getItem('tt.optics'); if (MODES.includes(m)) return m; } catch { /* private mode */ }
  return 'day';
}

function build() {
  el = document.createElement('div');
  el.id = 'optics';
  el.innerHTML = `<div class="op-grain"></div><div class="op-ret"><i></i><i></i><i></i><i></i></div>
    <span class="op-tl"></span><span class="op-tr">NFOV · 12×</span>
    <span class="op-bl" data-k="clock"></span><span class="op-br">ARMED</span>`;
  document.body.appendChild(el);
}

function apply() {
  if (!el) build();
  document.body.classList.remove('optics-thermal', 'optics-nv');
  if (mode !== 'day') document.body.classList.add(`optics-${mode}`);
  el.querySelector('.op-tl').textContent = mode === 'thermal' ? 'WHT HOT · IR' : 'NVG · GEN III';
  if (mode !== 'day' && !clock) {
    const c = el.querySelector('[data-k="clock"]');
    clock = setInterval(() => {
      const d = new Date();
      c.textContent = `${d.toISOString().slice(11, 19)}Z`;
    }, 1000);
  } else if (mode === 'day' && clock) { clearInterval(clock); clock = null; }
}

export function initOptics() {
  mode = read();
  apply();
  return mode;
}

export function opticsLabel() { return `OPTICS: ${LABEL[mode]}`; }

/** The next mode round. Returns its label. */
export function cycleOptics() {
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  try { localStorage.setItem('tt.optics', mode); } catch { /* private mode */ }
  apply();
  return LABEL[mode];
}
