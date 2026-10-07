/**
 * The reticles the lay looks through (main.js, `#lay-sight`), one per kind
 * of sight a weapon says it has (`def.sight.kind` in units.js). Each is the
 * glass of the real instrument, near enough: not a decoration over the
 * picture but the thing the gunner lays with, so the centre of every one is
 * where the round goes, and the marks round it are the ones the real sight
 * carries. Drawn as SVG in a square of two hundred units, centred on zero;
 * the overlay scales it to the shorter side of the screen.
 *
 *   tank   the Stryker's gunner's primary sight: a fine cross, a centre
 *          dot, a range ladder down the lower limb and stadia either side
 *   pano   a howitzer's panoramic telescope: a mil scale across the middle,
 *          a post up from the bottom
 *   optic  a rocket launcher's optic: a chevron, a range ladder under it
 *   iron   the machine gun's: a front post in its hood, the rear aperture
 *   clu    the Javelin's command launch unit: track gates and a cross on a
 *          thermal-green glass
 *   glass  the mortar observer's binoculars: a mil cross in twin circles
 */
export const SIGHT_KINDS = ['tank', 'pano', 'optic', 'iron', 'clu', 'glass', 'plot', 'gunship', 'tads'];

const line = (x1, y1, x2, y2, w = 1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`;
const text = (x, y, t, size = 6, anchor = 'middle') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${t}</text>`;

function tank() {
  let s = '';
  // The cross, open round the centre so the dot is on the aiming point alone.
  s += line(-80, 0, -10, 0, 1.2) + line(10, 0, 80, 0, 1.2) + line(0, -80, 0, -10, 1.2) + line(0, 10, 0, 80, 1.2);
  s += `<circle cx="0" cy="0" r="1.6" class="fill"/>`;
  // Stadia: the width of a target at its range.
  for (const x of [-60, -40, -20, 20, 40, 60]) s += line(x, -4, x, 4, 1);
  // The range ladder down the lower limb, in hundreds of metres.
  for (let i = 1; i <= 6; i++) {
    const y = 18 + i * 10, w = i % 2 ? 6 : 12;
    s += line(-w, y, w, y, 1);
    if (i % 2 === 0) s += text(w + 4, y + 2, i * 2, 6, 'start');
  }
  // The frame's corners: a boxed field, the way a gunner's sight is.
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    s += line(sx * 96, sy * 96, sx * 96, sy * 80, 1.5) + line(sx * 96, sy * 96, sx * 80, sy * 96, 1.5);
  }
  return s;
}

function pano() {
  let s = '';
  // The horizontal mil scale, every ten mils, numbered every fifty.
  s += line(-90, 0, 90, 0, 1);
  for (let m = -8; m <= 8; m++) {
    if (!m) continue;
    const x = m * 10, big = m % 5 === 0;
    s += line(x, big ? -7 : -4, x, big ? 7 : 4, 1);
    if (big) s += text(x, -10, Math.abs(m) * 10, 6);
  }
  // The post from the bottom to the centre, and the cross-hair's upper limb.
  s += line(0, 90, 0, 6, 2.2) + line(0, -90, 0, -6, 0.8);
  s += `<circle cx="0" cy="0" r="92" fill="none" stroke-width="1.5"/>`;
  return s;
}

function optic() {
  let s = '';
  // The chevron, point on the aiming mark.
  s += `<path d="M -9 7 L 0 -3 L 9 7" fill="none" stroke-width="1.8"/>`;
  s += line(-80, 0, -16, 0, 1) + line(16, 0, 80, 0, 1);
  // The range ladder: shorter rungs for further, the way the drop stacks.
  const rungs = [[14, 24], [22, 19], [29, 15], [35, 12], [40, 10]];
  rungs.forEach(([y, w], i) => {
    s += line(-w, y, w, y, 1.2);
    s += text(w + 4, y + 2, (i + 1) * 100, 6, 'start');
  });
  s += line(0, 14, 0, 44, 0.8);
  s += `<circle cx="0" cy="0" r="92" fill="none" stroke-width="1.5"/>`;
  return s;
}

function iron() {
  let s = '';
  // Small, as irons are at arm's length: the hood and the post in it,
  // rising to just under the centre, and the rear aperture round them,
  // a ring the width of a man at a hundred metres rather than the whole
  // of the picture.
  s += `<path d="M -8 -1 A 8 8 0 0 1 8 -1" fill="none" stroke-width="1.4"/>`;
  s += `<rect x="-0.9" y="0" width="1.8" height="13" class="fill"/>`;
  s += line(-8, -1, -8, 13, 1.4) + line(8, -1, 8, 13, 1.4);
  s += `<circle cx="0" cy="0" r="30" fill="none" stroke-width="3"/>`;
  return s;
}

function clu() {
  let s = '';
  // The track gates: four brackets that close on the target when it is locked.
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    s += line(sx * 30, sy * 30, sx * 30, sy * 18, 1.8) + line(sx * 30, sy * 30, sx * 18, sy * 30, 1.8);
  }
  s += line(-10, 0, 10, 0, 1.2) + line(0, -10, 0, 10, 1.2);
  // The display's own frame and its legends.
  s += `<rect x="-96" y="-96" width="192" height="192" fill="none" stroke-width="1.5"/>`;
  s += text(-90, -86, 'DAY', 6, 'start') + text(90, -86, 'ATK TOP', 6, 'end');
  s += text(-90, 92, 'SEEK', 6, 'start') + text(90, 92, 'RDY', 6, 'end');
  return s;
}

function glass() {
  let s = '';
  // The mil cross: ticks every five mils, numbered every ten.
  s += line(-70, 0, 70, 0, 1) + line(0, -70, 0, 70, 1);
  for (let m = -6; m <= 6; m++) {
    if (!m) continue;
    const p = m * 10, big = m % 2 === 0;
    s += line(p, big ? -5 : -3, p, big ? 5 : 3, 1) + line(big ? -5 : -3, p, big ? 5 : 3, p, 1);
    if (big) s += text(p, -8, Math.abs(m) * 10 / 2, 6);
  }
  // Two glasses, overlapping: what binoculars see.
  s += `<circle cx="-16" cy="0" r="80" fill="none" stroke-width="1.5"/><circle cx="16" cy="0" r="80" fill="none" stroke-width="1.5"/>`;
  return s;
}

/**
 * The mortar's plot: a bullseye on the fall of shot, seen from above. Its
 * outer ring is the round's dispersion at this range (main.js sizes the
 * overlay to it each frame), so the circle grows as the shot gets longer.
 */
function plot() {
  let s = '';
  s += `<circle cx="0" cy="0" r="70" fill="none" stroke-width="2.2"/>`;
  s += `<circle cx="0" cy="0" r="44" fill="none" stroke-width="1.2"/>`;
  s += `<circle cx="0" cy="0" r="18" fill="none" stroke-width="1.2"/>`;
  s += `<circle cx="0" cy="0" r="2.2" class="fill"/>`;
  for (const [x1, y1, x2, y2] of [[-96, 0, -74, 0], [74, 0, 96, 0], [0, -96, 0, -74], [0, 74, 0, 96]]) s += line(x1, y1, x2, y2, 1.6);
  return s;
}

/** The gunship's sensor: the TV operator's cross, open at the centre, in a boxed field with the data corners. */
function gunship() {
  let s = '';
  s += line(-60, 0, -8, 0, 1.4) + line(8, 0, 60, 0, 1.4) + line(0, -60, 0, -8, 1.4) + line(0, 8, 0, 60, 1.4);
  s += `<circle cx="0" cy="0" r="1.4" class="fill"/>`;
  for (const t of [-40, -20, 20, 40]) s += line(t, -3, t, 3, 1) + line(-3, t, 3, t, 1);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s += line(sx * 96, sy * 96, sx * 96, sy * 82, 1.6) + line(sx * 96, sy * 96, sx * 82, sy * 96, 1.6);
  s += text(-92, -84, 'TV', 6, 'start') + text(92, -84, '105 / 30', 6, 'end') + text(-92, 92, 'SENSOR', 6, 'start') + text(92, 92, 'GUN', 6, 'end');
  return s;
}
/** The Apache's TADS: a box round the mark with a cross in it, the gun's bars either side. */
function tads() {
  let s = '';
  s += `<rect x="-24" y="-24" width="48" height="48" fill="none" stroke-width="1.6"/>`;
  s += line(-12, 0, 12, 0, 1.2) + line(0, -12, 0, 12, 1.2);
  s += line(-80, 0, -40, 0, 2.2) + line(40, 0, 80, 0, 2.2);
  s += line(0, 40, 0, 80, 1.2);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s += line(sx * 96, sy * 96, sx * 96, sy * 84, 1.4) + line(sx * 96, sy * 96, sx * 84, sy * 96, 1.4);
  s += text(-92, -84, 'TADS', 6, 'start') + text(92, -84, 'FLIR', 6, 'end');
  return s;
}

const DRAW = { tank, pano, optic, iron, clu, glass, plot, gunship, tads };

/** The reticle's SVG for a kind of sight, as markup to drop into the overlay. */
export function sightSVG(kind) {
  const draw = DRAW[kind] || DRAW.optic;
  return `<svg viewBox="-100 -100 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${draw()}</svg>`;
}
