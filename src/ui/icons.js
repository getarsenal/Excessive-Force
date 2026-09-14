/**
 * Unit icons.
 *
 * Drawn rather than photographed, for two reasons.
 *
 * The four infantry tiers used to share one generic stick figure, so the build
 * bar showed the same picture four times and the only thing distinguishing an
 * AT4 from a Javelin was the text under it. And the five artillery cards used
 * the FIREBASE menu renders, which are 3/4 photographs of grey models: at the
 * thirty pixels a card actually gives them they turn into a smudge, and five
 * smudges look alike too.
 *
 * So each unit gets a side-profile silhouette, built from the handful of
 * features that make that weapon recognisable at a glance and nothing else —
 * the Carl Gustaf's venturi cone, the Javelin's boxed sight, the M777's long
 * barrel and spread trails, HIMARS on wheels where the M270 is on tracks.
 * Vector, so they are crisp at any density and free to recolour; every muzzle
 * points left, so a row of them reads as one armoury rather than a shelf.
 *
 * The palette carries information: infantry are steel, guns are the same olive
 * drab the models wear in the field, and the warhead on each shoulder-launched
 * round is tipped in its own colour — which is the real difference between
 * them.
 */

const C = {
  steel: '#aebdd0',
  steelDark: '#5d6c80',
  olive: '#8d9a63',
  oliveDark: '#4f5b36',
  optic: '#5fa8e0',
  heat: '#d9653f',
  thermo: '#c96fd0',
  tandem: '#e0a33c',
};

/** Road wheels and a track band, shared by the two tracked vehicles. */
function tracks(y = 17.4) {
  return `
    <rect x="3.4" y="${y - 2.6}" width="26" height="5.2" rx="2.6" fill="${C.oliveDark}"/>
    <g fill="${C.olive}">
      <circle cx="7.4" cy="${y}" r="1.5"/><circle cx="12.4" cy="${y}" r="1.5"/>
      <circle cx="17.4" cy="${y}" r="1.5"/><circle cx="22.4" cy="${y}" r="1.5"/>
      <circle cx="27" cy="${y}" r="1.5"/>
    </g>`;
}

/** A launcher pod: a box of rocket tubes, tilted the way it would be laid. */
function pod(x, y, w, h, cols, rows) {
  let tubes = '';
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tubes += `<rect x="${(x + c * cw + cw * 0.22).toFixed(2)}"
        y="${(y + r * ch + ch * 0.22).toFixed(2)}"
        width="${(cw * 0.56).toFixed(2)}" height="${(ch * 0.56).toFixed(2)}"
        rx="${(Math.min(cw, ch) * 0.2).toFixed(2)}" fill="${C.oliveDark}"/>`;
    }
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.2"
    fill="${C.olive}"/>${tubes}`;
}

const BODY = {
  // ── Infantry: shoulder-launched, muzzle left ──────────────────────────────

  // Disposable single-shot tube. Nothing on it but a sight and a shoulder stop,
  // which is exactly what makes it read as an AT4.
  at4: `
    <rect x="5.5" y="10" width="28" height="4.6" rx="2.3" fill="${C.steel}"/>
    <path d="M5.5 8.2 L2.4 10.2 v4.2 l3.1 2 Z" fill="${C.steelDark}"/>
    <path d="M33.5 9 l3.6 2.2 v2.2 l-3.6 2.2 Z" fill="${C.steelDark}"/>
    <rect x="20.5" y="7.2" width="4.6" height="2.9" rx="0.8" fill="${C.steelDark}"/>
    <path d="M14.5 14.6 l-1.8 4.6 h3.8 Z" fill="${C.steelDark}"/>
    <circle cx="4.2" cy="12.3" r="1.5" fill="${C.heat}"/>`,

  // Recoilless rifle: the rear venturi cone is the whole silhouette, plus the
  // optic and two grips that mark it as a reusable weapon rather than a tube.
  gustaf: `
    <rect x="7.5" y="10.1" width="25" height="4.4" rx="2.2" fill="${C.steel}"/>
    <path d="M32.5 7.4 L37.6 10 v4.6 l-5.1 2.6 Z" fill="${C.steelDark}"/>
    <rect x="3.4" y="9.2" width="4.6" height="6.2" rx="1.1" fill="${C.steelDark}"/>
    <rect x="16.5" y="6.4" width="9.5" height="2.8" rx="0.9" fill="${C.steelDark}"/>
    <rect x="18.6" y="7.1" width="2.4" height="1.4" rx="0.4" fill="${C.optic}"/>
    <path d="M13.5 14.5 l-1.5 4.4 h3.2 Z" fill="${C.steelDark}"/>
    <path d="M25.5 14.5 l1.6 4.4 h-3.4 Z" fill="${C.steelDark}"/>
    <circle cx="5.7" cy="12.3" r="1.4" fill="${C.heat}"/>`,

  // Thermobaric: the round is bigger than the launcher, and it hangs out the
  // front. That overhanging warhead is the recognisable part.
  rpg32: `
    <rect x="11" y="10.2" width="22" height="4.6" rx="2.3" fill="${C.steel}"/>
    <path d="M11.5 8 c-3.6 0-7 1.9-8.8 4.5 c1.8 2.6 5.2 4.5 8.8 4.5 Z"
      fill="${C.thermo}"/>
    <rect x="9.8" y="8.6" width="2" height="7.4" rx="0.6" fill="${C.steelDark}"/>
    <rect x="18.5" y="6.6" width="8" height="2.8" rx="0.9" fill="${C.steelDark}"/>
    <rect x="20.4" y="7.3" width="2.2" height="1.4" rx="0.4" fill="${C.optic}"/>
    <path d="M21 14.8 l1.6 4.4 h-3.6 Z" fill="${C.steelDark}"/>
    <path d="M30.5 14.8 l1.4 3.6 h-3 Z" fill="${C.steelDark}"/>`,

  // Command launch unit under the tube, with the thermal sight facing forward.
  // The boxy CLU is what nobody mistakes for anything else.
  javelin: `
    <rect x="6" y="5.8" width="28" height="5.2" rx="2.6" fill="${C.steel}"/>
    <path d="M6 5.8 L2.6 7.6 v3.6 L6 11 Z" fill="${C.steelDark}"/>
    <rect x="11.5" y="11.4" width="14" height="6.6" rx="1.5" fill="${C.steelDark}"/>
    <rect x="13.2" y="13" width="5.4" height="3.6" rx="0.7" fill="${C.optic}"/>
    <rect x="20.5" y="13" width="3.4" height="1.3" rx="0.4" fill="${C.steel}"/>
    <path d="M24 18 l1.8 3.6 h-3.8 Z" fill="${C.steelDark}"/>
    <circle cx="31" cy="8.4" r="1.5" fill="${C.tandem}"/>`,

  // ── Towed guns: barrel left, split trails right ───────────────────────────

  // Light and short-barrelled, on a compact two-wheel carriage.
  m119: `
    <rect x="3.2" y="8.6" width="20" height="2.8" rx="1.4" fill="${C.olive}"/>
    <rect x="1.4" y="7.8" width="3" height="4.4" rx="0.9" fill="${C.oliveDark}"/>
    <path d="M20.5 6.6 h6.2 l1.4 7.4 h-8.4 Z" fill="${C.olive}"/>
    <path d="M26.5 13.4 L37.5 16.6" stroke="${C.olive}" stroke-width="2.3"
      stroke-linecap="round"/>
    <path d="M26.5 14.2 L36.4 20.6" stroke="${C.oliveDark}" stroke-width="2.3"
      stroke-linecap="round"/>
    <circle cx="23.8" cy="16" r="3.8" fill="${C.oliveDark}"/>
    <circle cx="23.8" cy="16" r="1.5" fill="${C.olive}"/>`,

  // Longer barrel with a muzzle brake, taller shield, trails spread wider —
  // the same gun as the M119, one size up, which is the point.
  m777: `
    <rect x="2.2" y="7.4" width="24" height="2.6" rx="1.3" fill="${C.olive}"/>
    <rect x="0.6" y="6.4" width="3.4" height="4.6" rx="0.9" fill="${C.oliveDark}"/>
    <rect x="5.6" y="6.9" width="1.6" height="3.6" rx="0.5" fill="${C.oliveDark}"/>
    <path d="M23.5 5.6 h6.6 l1.6 8.2 h-9 Z" fill="${C.olive}"/>
    <path d="M30 13 L39.4 13.8" stroke="${C.olive}" stroke-width="2.4"
      stroke-linecap="round"/>
    <path d="M30 13.8 L38.4 21" stroke="${C.oliveDark}" stroke-width="2.4"
      stroke-linecap="round"/>
    <circle cx="26.6" cy="15.6" r="3.5" fill="${C.oliveDark}"/>
    <circle cx="26.6" cy="15.6" r="1.4" fill="${C.olive}"/>`,

  // ── Self-propelled and rocket artillery ───────────────────────────────────

  // Armoured turret over tracks, barrel out the front.
  m109: `
    ${tracks(17.2)}
    <path d="M4.6 11.6 h25.4 l-0.8 3.6 h-24 Z" fill="${C.oliveDark}"/>
    <path d="M11 6.4 h15.4 l1.6 5.2 h-18.6 Z" fill="${C.olive}"/>
    <rect x="0.8" y="6.2" width="12" height="2.4" rx="1.2" fill="${C.oliveDark}"/>
    <rect x="0.4" y="5.6" width="2.4" height="3.6" rx="0.7" fill="${C.olive}"/>
    <rect x="18.5" y="4.2" width="3.4" height="2.4" rx="0.7" fill="${C.oliveDark}"/>`,

  // Twelve tubes in a boxed pod, laid back on a tracked chassis.
  m270: `
    ${tracks(17.2)}
    <path d="M4.6 11.6 h25.4 l-0.8 3.6 h-24 Z" fill="${C.oliveDark}"/>
    <g transform="rotate(-15 20 8)">${pod(11.5, 3.4, 17, 8, 3, 2)}</g>
    <path d="M3.6 8.6 h5.4 l1.6 3 v2.4 h-7 Z" fill="${C.olive}"/>`,

  // The same pod on a six-wheel truck: half the tubes, twice the reach, and
  // wheels rather than tracks is the only thing you need to tell them apart.
  m142: `
    <rect x="2.8" y="14.2" width="30" height="2.6" rx="1" fill="${C.oliveDark}"/>
    <g transform="rotate(-15 21 8)">${pod(14, 3.6, 14, 7.6, 2, 2)}</g>
    <path d="M2.8 8.2 h5.6 l1.8 3.2 v3 h-7.4 Z" fill="${C.olive}"/>
    <rect x="3.6" y="9" width="3.8" height="2.3" rx="0.5" fill="${C.optic}"/>
    <g fill="${C.oliveDark}">
      <circle cx="7.4" cy="18" r="2.9"/><circle cx="24.4" cy="18" r="2.9"/>
      <circle cx="30.6" cy="18" r="2.9"/>
    </g>
    <g fill="${C.olive}">
      <circle cx="7.4" cy="18" r="1.1"/><circle cx="24.4" cy="18" r="1.1"/>
      <circle cx="30.6" cy="18" r="1.1"/>
    </g>`,
};

/** Inline SVG markup for a unit id, or null if it has no icon. */
export function unitIcon(id) {
  const body = BODY[id];
  if (!body) return null;
  return `<svg class="uc-svg" viewBox="0 0 40 24" width="40" height="24"
    aria-hidden="true" focusable="false">${body}</svg>`;
}

export const ICON_IDS = Object.keys(BODY);
