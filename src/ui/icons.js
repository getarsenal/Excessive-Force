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
 * So each unit is a side-profile silhouette built from the handful of features
 * that make that weapon recognisable and nothing else — the Carl Gustaf's
 * venturi cone, the Javelin's boxed sight under the tube, the M777's long
 * barrel and four spread trails against the M119's stub and box trail, HIMARS
 * on six wheels where the M270 is on tracks. Every muzzle points left, so a row
 * of them reads as one armoury rather than a shelf.
 *
 * Two things were missing from the first set and they were the two that made it
 * read as "ok but not really what they are".
 *
 *   1. Scale. A Javelin and an M777 both filled their box, so the build bar
 *      said they were the same size of thing. Everything here now stands on a
 *      ground line with a crewman beside it, drawn at the same metres-per-pixel
 *      as the weapon he is serving. That one figure is what says a howitzer is
 *      a machine three men tall and a Carl Gustaf is a tube on a shoulder, and
 *      it does it without a word of text.
 *   2. Room. At a 40x24 box a muzzle brake is two pixels and there is nowhere
 *      to put a trail, a wheel and a breech without them touching. The box is
 *      64x40 now — the same size on screen, four times the drawing room — and
 *      the shapes have space to be different from each other.
 *
 * The palette carries information: infantry are steel, guns are the same olive
 * drab the models wear in the field, aircraft are a paler grey so the two air
 * cards read as a different kind of thing altogether, and the warhead on each
 * shoulder-launched round is tipped in its own colour — which is the real
 * difference between them.
 */

const C = {
  steel: '#aebdd0',
  steelDark: '#5d6c80',
  olive: '#8d9a63',
  oliveDark: '#4f5b36',
  air: '#c3ccd8',
  airDark: '#6b7686',
  crew: '#7d8698',
  ground: '#3a4149',
  optic: '#5fa8e0',
  heat: '#d9653f',
  thermo: '#c96fd0',
  tandem: '#e0a33c',
};

const GY = 35;          // the ground line every unit stands on

/** The strip of dirt under the unit, so nothing floats. */
const GROUND = `<rect x="0" y="${GY}" width="64" height="1.6" rx="0.8" fill="${C.ground}"/>`;

/**
 * A crewman, `h` pixels tall, standing at `x` and facing left with the gun.
 *
 * The one piece of scale information on the card. Drawn at whatever height the
 * unit's own drawing scale makes 1.8 m, so on the infantry cards he is most of
 * the picture and on the howitzer cards he comes up to the breech — which is
 * exactly the comparison the player needs and cannot get from the model render.
 */
function crew(x, h, fill = C.crew) {
  const u = h / 18;     // one unit = a tenth of a metre at this figure's scale
  const y = GY;
  return `<g fill="${fill}">
    <circle cx="${(x).toFixed(2)}" cy="${(y - 16 * u).toFixed(2)}" r="${(2.1 * u).toFixed(2)}"/>
    <path d="M${(x - 3.1 * u).toFixed(2)} ${(y - 13.9 * u).toFixed(2)}
      h${(6.2 * u).toFixed(2)} l${(0.4 * u).toFixed(2)} ${(6.7 * u).toFixed(2)}
      h${(-7 * u).toFixed(2)} Z"/>
    <rect x="${(x - 2.2 * u).toFixed(2)}" y="${(y - 7.2 * u).toFixed(2)}"
      width="${(1.8 * u).toFixed(2)}" height="${(7.2 * u).toFixed(2)}" rx="${(0.8 * u).toFixed(2)}"/>
    <rect x="${(x + 0.5 * u).toFixed(2)}" y="${(y - 7.2 * u).toFixed(2)}"
      width="${(1.8 * u).toFixed(2)}" height="${(7.2 * u).toFixed(2)}" rx="${(0.8 * u).toFixed(2)}"/>
  </g>`;
}

/** Road wheels and a track band, shared by the two tracked vehicles. */
function tracks(x, w, y, r) {
  const n = Math.max(4, Math.round(w / (r * 2.4)));
  let wheels = '';
  for (let i = 0; i < n; i++) {
    const cx = x + r * 1.4 + (i / (n - 1)) * (w - r * 2.8);
    wheels += `<circle cx="${cx.toFixed(2)}" cy="${y.toFixed(2)}" r="${(r * 0.62).toFixed(2)}"/>`;
  }
  return `<rect x="${x}" y="${(y - r).toFixed(2)}" width="${w}" height="${(r * 2).toFixed(2)}"
      rx="${r.toFixed(2)}" fill="${C.oliveDark}"/>
    <g fill="${C.olive}">${wheels}</g>`;
}

/** A launcher pod: a box of rocket tubes, seen end-on down the muzzles. */
function pod(x, y, w, h, cols, rows) {
  let tubes = '';
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tubes += `<rect x="${(x + c * cw + cw * 0.2).toFixed(2)}"
        y="${(y + r * ch + ch * 0.2).toFixed(2)}"
        width="${(cw * 0.6).toFixed(2)}" height="${(ch * 0.6).toFixed(2)}"
        rx="${(Math.min(cw, ch) * 0.18).toFixed(2)}" fill="${C.oliveDark}"/>`;
    }
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.4"
    fill="${C.olive}"/>${tubes}`;
}

const BODY = {
  // ── Infantry ──────────────────────────────────────────────────────────────
  //
  // The man is the subject and the weapon is on him. Drawn floating beside him
  // the first time round, which turned every infantry card into a picture of a
  // soldier standing next to a missile; drawn across his chest the second, which
  // turned it into a picture of a soldier run through with a pole. It sits on
  // the shoulder line with his head clear above it, and he is drawn after it, so
  // the tube passes behind him the way it actually does.

  // Disposable single-shot tube, a metre of it, with nothing on it but a flip
  // sight. The plainness is the identification.
  at4: `${GROUND}
    <rect x="10" y="15.4" width="33" height="3.4" rx="1.7" fill="${C.steel}"/>
    <path d="M10 13.9 L6.2 15.8 v2.6 l3.8 1.9 Z" fill="${C.steelDark}"/>
    <path d="M43 14.3 l3.6 2.2 v1.6 l-3.6 2.2 Z" fill="${C.steelDark}"/>
    <rect x="24" y="12.8" width="4.2" height="2.6" rx="0.7" fill="${C.steelDark}"/>
    <circle cx="7" cy="17.1" r="1.8" fill="${C.heat}"/>
    ${crew(36, 26)}
    <path d="M33.2 18.8 l-6.4 3.1 l1.1 2.2 l6.4 -3.1 Z" fill="${C.crew}"/>`,

  // Recoilless rifle: the flared venturi behind the firer is the whole
  // silhouette, and the optic and forward grip mark it as a weapon a crew keeps
  // rather than one it throws away.
  gustaf: `${GROUND}
    <rect x="8" y="15.4" width="38" height="3.6" rx="1.8" fill="${C.steel}"/>
    <path d="M46 12.4 L53.6 15.8 v2.8 l-7.6 3.4 Z" fill="${C.steelDark}"/>
    <rect x="3.6" y="14" width="4.8" height="6.4" rx="1.1" fill="${C.steelDark}"/>
    <rect x="21" y="11.4" width="10.4" height="3.2" rx="0.9" fill="${C.steelDark}"/>
    <rect x="23.6" y="12.2" width="2.8" height="1.6" rx="0.4" fill="${C.optic}"/>
    <path d="M17 19 l-1.8 4 h3.6 Z" fill="${C.steelDark}"/>
    <circle cx="6" cy="17.2" r="1.8" fill="${C.heat}"/>
    ${crew(37, 26)}
    <path d="M34.2 18.8 l-6.6 3.2 l1.1 2.2 l6.6 -3.2 Z" fill="${C.crew}"/>`,

  // Thermobaric: the round is fatter than the launcher and hangs out the front
  // of it. That bulb is the only thing anyone remembers about an RPG-32.
  rpg32: `${GROUND}
    <rect x="13" y="15.6" width="31" height="3.4" rx="1.7" fill="${C.steel}"/>
    <path d="M13.6 11.6 c-5.6 0-10.8 2.9-13.4 5.7 c2.6 2.8 7.8 5.7 13.4 5.7 Z"
      fill="${C.thermo}"/>
    <rect x="11.4" y="12.2" width="2.6" height="10.6" rx="0.7" fill="${C.steelDark}"/>
    <rect x="22" y="11.6" width="9.6" height="3.2" rx="0.9" fill="${C.steelDark}"/>
    <rect x="24.2" y="12.4" width="2.8" height="1.6" rx="0.4" fill="${C.optic}"/>
    <path d="M44 14.1 l3.4 2.1 v1.4 l-3.4 2.1 Z" fill="${C.steelDark}"/>
    ${crew(37, 26)}
    <path d="M34.2 19 l-6.6 3.2 l1.1 2.2 l6.6 -3.2 Z" fill="${C.crew}"/>`,

  // Command launch unit slung under the tube, thermal sight forward, and a
  // soft-launch tube much fatter than a rocket needs to be. The boxy CLU is
  // what nobody mistakes for anything else.
  javelin: `${GROUND}
    <rect x="11" y="14.2" width="31" height="5" rx="2.5" fill="${C.steel}"/>
    <path d="M11 14.2 L7 16 v3.4 L11 19.2 Z" fill="${C.steelDark}"/>
    <rect x="16.4" y="19.4" width="13.6" height="6" rx="1.4" fill="${C.steelDark}"/>
    <rect x="18" y="20.8" width="5.6" height="3.2" rx="0.6" fill="${C.optic}"/>
    <rect x="25" y="21" width="3.4" height="1.3" rx="0.4" fill="${C.steel}"/>
    <circle cx="39.4" cy="16.7" r="1.9" fill="${C.tandem}"/>
    ${crew(38, 26)}
    <path d="M35.2 19.2 l-5.8 2.8 l1.1 2.2 l5.8 -2.8 Z" fill="${C.crew}"/>`,

  // ── Towed guns ────────────────────────────────────────────────────────────
  //
  // About five pixels to the metre from here on, so the crewman at the breech
  // is a third the height of a road wheel and the card reads as a machine
  // rather than as a tool.

  // 105 mm: a short barrel over a box trail on two small wheels, five metres of
  // gun altogether. Next to the M777 it is a toy, which is what the card is for.
  m119: `${GROUND}
    ${crew(38, 9)}
    <rect x="6" y="19.6" width="21" height="2.6" rx="1.3" fill="${C.olive}"/>
    <rect x="4" y="18.8" width="3.2" height="4.2" rx="0.8" fill="${C.oliveDark}"/>
    <path d="M25 17.8 h5 l2 7.2 h-8 Z" fill="${C.olive}"/>
    <path d="M30 25 L44 28.6" stroke="${C.olive}" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M30 25.6 L42 32.4" stroke="${C.oliveDark}" stroke-width="2.3" stroke-linecap="round"/>
    <circle cx="27.6" cy="28.6" r="6.2" fill="${C.oliveDark}"/>
    <circle cx="27.6" cy="28.6" r="2.4" fill="${C.olive}"/>`,

  // 155 mm: ten metres of gun. A long thin barrel with a double-baffle muzzle
  // brake, a skeletal titanium cradle carrying no shield at all, and four
  // trails spread right across the card.
  m777: `${GROUND}
    <path d="M34 23.6 L52 31.4" stroke="${C.oliveDark}" stroke-width="2" stroke-linecap="round"/>
    <path d="M34 23.6 L49.6 33.4" stroke="${C.oliveDark}" stroke-width="2" stroke-linecap="round"/>
    <path d="M34 23.6 L53.4 26.6" stroke="${C.olive}" stroke-width="2" stroke-linecap="round"/>
    <path d="M34 23.6 L51.6 21" stroke="${C.olive}" stroke-width="2" stroke-linecap="round"/>
    ${crew(42, 9)}
    <rect x="3" y="13.8" width="31" height="2.8" rx="1.4" fill="${C.olive}"/>
    <rect x="1.4" y="12.6" width="4" height="5.2" rx="0.9" fill="${C.oliveDark}"/>
    <rect x="7.6" y="13.2" width="1.8" height="4" rx="0.5" fill="${C.oliveDark}"/>
    <path d="M29 13 h6 l2.6 11 h-9.6 Z" fill="${C.oliveDark}"/>
    <circle cx="33.4" cy="28.4" r="6.4" fill="${C.oliveDark}"/>
    <circle cx="33.4" cy="28.4" r="2.4" fill="${C.olive}"/>`,

  // ── Self-propelled and rocket artillery ───────────────────────────────────

  // Armoured turret over tracks, six metres of barrel out over the front deck,
  // and a fume extractor two thirds of the way along that nothing else in the
  // battery has.
  m109: `${GROUND}
    ${crew(50, 9)}
    ${tracks(6, 40, 30.2, 4.4)}
    <path d="M7 21.2 h38 l-1.2 4.8 h-36 Z" fill="${C.oliveDark}"/>
    <path d="M17 12.4 h21 l2.6 8.8 h-26 Z" fill="${C.olive}"/>
    <rect x="1.6" y="11.6" width="21" height="2.8" rx="1.4" fill="${C.oliveDark}"/>
    <rect x="10.4" y="10.8" width="3.2" height="4.4" rx="0.7" fill="${C.olive}"/>
    <rect x="0.8" y="10.8" width="2.8" height="4.4" rx="0.8" fill="${C.olive}"/>
    <rect x="28" y="8.8" width="4.4" height="3.6" rx="0.8" fill="${C.oliveDark}"/>`,

  // Twelve tubes in one boxed pod, elevated over the back of a tracked
  // chassis. Tracks and a full pod: that pair is the whole difference from
  // HIMARS, and it is the only thing anybody has to read.
  m270: `${GROUND}
    ${crew(52, 9)}
    ${tracks(3, 42, 30.2, 4.4)}
    <path d="M4 20.6 h41 l-1.2 4.8 h-39 Z" fill="${C.oliveDark}"/>
    <path d="M4.2 14.4 h9 l2.4 4.6 v3 h-11.4 Z" fill="${C.olive}"/>
    <rect x="5.4" y="15.4" width="5.6" height="3" rx="0.6" fill="${C.optic}"/>
    <rect x="17" y="16.4" width="9" height="5" rx="1" fill="${C.oliveDark}"/>
    <g transform="rotate(-15 22 18)">${pod(19, 8.6, 25, 11, 3, 2)}</g>`,

  // The same rockets on a five-tonne truck: half the tubes, twice the road
  // speed, and wheels rather than tracks is all you need to tell them apart.
  m142: `${GROUND}
    ${crew(52, 9)}
    <rect x="5" y="24.4" width="43" height="3.6" rx="1.2" fill="${C.oliveDark}"/>
    <path d="M4.6 13.6 h9 l2.8 5 v6 h-11.8 Z" fill="${C.olive}"/>
    <rect x="5.8" y="14.8" width="6" height="3.6" rx="0.6" fill="${C.optic}"/>
    <rect x="20" y="19.6" width="8" height="5" rx="1" fill="${C.oliveDark}"/>
    <g transform="rotate(-15 25 21)">${pod(22, 11.6, 20, 10, 2, 2)}</g>
    <g fill="${C.oliveDark}">
      <circle cx="11.6" cy="30" r="4.8"/><circle cx="36" cy="30" r="4.8"/>
      <circle cx="44.6" cy="30" r="4.8"/>
    </g>
    <g fill="${C.olive}">
      <circle cx="11.6" cy="30" r="1.9"/><circle cx="36" cy="30" r="1.9"/>
      <circle cx="44.6" cy="30" r="1.9"/>
    </g>`,

  // ── Air ───────────────────────────────────────────────────────────────────
  //
  // No ground line and no crewman: these two are the only cards that are not a
  // thing standing in a field, and taking the ground away is what says so at a
  // glance. Nose left, like every muzzle.

  // Strike Eagle: long nose, a small bubble canopy well forward, twin canted
  // tails and a pair of 2,000 lb bombs on the centreline. The bombs are the
  // point of the card.
  f15: `
    <path d="M3 19 L14 16.4 h30 l9 -2 v4.6 l-9 -1 h-30 Z" fill="${C.air}"/>
    <path d="M14.6 16.2 l4.4 -2.6 h3 l-1.6 2.6 Z" fill="${C.optic}"/>
    <path d="M41 16.4 l4.6 -8 h3 l-2 8 Z" fill="${C.airDark}"/>
    <path d="M36.6 16.4 l3.8 -6.4 h2.4 l-1.6 6.4 Z" fill="${C.airDark}"/>
    <path d="M23 19.4 h20 l2.6 3.4 h-24.6 Z" fill="${C.airDark}"/>
    <rect x="20" y="23.4" width="13" height="3" rx="1.5" fill="${C.oliveDark}"/>
    <path d="M20 24.9 l-3.4 -1.4 v2.8 Z" fill="${C.oliveDark}"/>
    <rect x="34" y="23.4" width="11" height="3" rx="1.5" fill="${C.oliveDark}"/>
    <path d="M34 24.9 l-3.2 -1.3 v2.6 Z" fill="${C.oliveDark}"/>
    <path d="M53 17.6 l5.4 1.2 l-5.4 1.2 Z" fill="${C.heat}"/>`,

  // Lancer: a long blended spindle with the wings swept flat back against it,
  // one tall fin, and a bomb bay the size of a bus. Drawn dark, because the one
  // people picture is black and flying low.
  b1: `
    <path d="M2 17.4 L12 15.6 h36 l7 -4.2 h2.6 l-4.2 5.2 l1 2.6 h-42 Z"
      fill="${C.airDark}"/>
    <path d="M20 17.6 h21 l9 2.6 h-30 Z" fill="${C.air}"/>
    <path d="M45 15.6 l3.2 -8.8 h3 l-1.2 8.8 Z" fill="${C.airDark}"/>
    <rect x="14" y="21.8" width="22" height="5" rx="2.5" fill="${C.oliveDark}"/>
    <path d="M14 24.3 l-4.6 -2 v4 Z" fill="${C.oliveDark}"/>
    <rect x="33" y="23" width="4.6" height="3.4" rx="0.8" fill="${C.tandem}"/>
    <path d="M55 15.8 l4.4 1.2 l-4.4 1.2 Z" fill="${C.heat}"/>`,
};

/**
 * The units with a real picture: the guns, the vehicles and the two aircraft
 * are rendered from the game's own models by `tools/icons.mjs`, so the card
 * shows exactly what lands; the four infantry teams are the artist's, a
 * soldier with the actual weapon, cropped to the same 512×320 slot. The
 * pictograms below stay as the fallback for anything without a file.
 */
export const IMAGE_ICONS = new Set(['at4', 'gustaf', 'rpg32', 'javelin', 'm119', 'm777', 'm109', 'm270', 'm142', 'f15', 'b1']);

/** Inline markup for a unit id, or null if it has no icon. */
export function unitIcon(id) {
  if (IMAGE_ICONS.has(id)) {
    return `<img class="uc-img" src="assets/icons/${id}.png" alt="" width="512" height="320" draggable="false">`;
  }
  const body = BODY[id];
  if (!body) return null;
  return `<svg class="uc-svg" viewBox="0 0 64 40" width="64" height="40"
    aria-hidden="true" focusable="false">${body}</svg>`;
}

export const ICON_IDS = Object.keys(BODY);
