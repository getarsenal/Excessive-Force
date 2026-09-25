// The builder, dry: what a landmark lays, in a second, with no browser.
//
//   node tools/blocks.mjs <id> [<tier>]            tier: low (default) | medium | high | ultra
//
// Imports the level record and calls its `structures(quality)` exactly as
// the game does, then reports on every BlockList that comes back: stone
// count, the box it fills (width x depth x height, and whether it is taller
// than it is wide), how many stones lie below the origin's ground, every
// section by name and count, and the share of the *visible* volume each
// material takes, with its colour.
//
// That last line is the one the Potala needed. Its base was `LIMESTONE`,
// 0xdcc99e, a warm tan, under a white palace, and it took nine renders to
// see it; this prints "58% LIMESTONE #dcc99e" before the first. And the
// stone count: the rebuild went 36k, 55k, 40k, 50k, 43k, each one learned
// from a seventy-second browser load. Here it is instant.
import { LEVELS } from '../src/game/levels.js';
import { MATERIALS, MATERIAL_PROPS } from '../src/structure/builder.js';

const [id, tierName = 'low'] = process.argv.slice(2);
if (!id || !LEVELS[id]) {
  console.error(`usage: node tools/blocks.mjs <id> [low|medium|high|ultra]\nlevels: ${Object.keys(LEVELS).join(' ')}`);
  process.exit(2);
}
// The tiers' block scales, as src/core/quality.js has them; the builders read
// nothing else off the quality object.
const SCALE = { low: 1.55, medium: 1.2, high: 1.0, ultra: 0.85 };
const quality = { name: tierName, blockScale: SCALE[tierName] ?? 1.55, groundClutter: tierName !== 'low' };
const lv = LEVELS[id];
const specs = typeof lv.structures === 'function' ? lv.structures(quality) : lv.structures;
const NAME = Object.fromEntries(Object.entries(MATERIALS).map(([k, v]) => [v, k]));
const hex = (m) => '#' + (MATERIAL_PROPS[m]?.color ?? 0).toString(16).padStart(6, '0');

let grand = 0;
for (const sp of specs) {
  const B = sp.blocks;
  const blocks = B.blocks;
  grand += blocks.length;
  // The box is measured on the stones above the origin's ground. The Potala's
  // footing is founded 126 m under the summit and is wider than anything it
  // carries, and measured on that the building read as wider than tall; what
  // shows above ground is what a photograph is of. On a hill the building
  // shows more than this — the ground falls away in front — so the height
  // here is a floor, not the postcard's number.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  let below = 0;
  const volVis = new Map();
  for (const b of blocks) {
    y0 = Math.min(y0, b.y - b.hy);
    if (b.y + b.hy <= 0) { below++; continue; }
    x0 = Math.min(x0, b.x - b.hx); x1 = Math.max(x1, b.x + b.hx);
    y1 = Math.max(y1, b.y + b.hy);
    z0 = Math.min(z0, b.z - b.hz); z1 = Math.max(z1, b.z + b.hz);
    volVis.set(b.mat, (volVis.get(b.mat) || 0) + 8 * b.hx * b.hy * b.hz);
  }
  const w = x1 - x0, d = z1 - z0, h = y1;
  const label = sp.label || sp.key || '?';
  console.log(`${label}${sp.primary ? '  (primary)' : ''}${sp.required ? '  required' : ''}`);
  console.log(`  ${blocks.length.toLocaleString()} stones at ${tierName}; ${below.toLocaleString()} below the origin's ground`
    + (y0 < -1 ? ` (footing to ${y0.toFixed(0)} m)` : ''));
  console.log(`  above ground: ${w.toFixed(0)} wide x ${d.toFixed(0)} deep x ${h.toFixed(0)} tall`
    + `  —  ${h > Math.min(w, d) ? 'taller than wide' : 'wider than tall'}, ${(h / Math.max(1, Math.min(w, d))).toFixed(2)}:1`
    + (below > 0 ? '  (on a hill the exposed footing adds to this)' : ''));
  const total = [...volVis.values()].reduce((a, v) => a + v, 0) || 1;
  const shares = [...volVis.entries()].sort((a, b) => b[1] - a[1])
    .map(([m, v]) => `${(100 * v / total).toFixed(0)}% ${NAME[m] || m} ${hex(m)}`);
  console.log(`  visible volume: ${shares.slice(0, 6).join(', ')}`);
  const tags = Object.entries(B.tagRanges || {}).map(([t, [a, z]]) => `${t} ${z - a}`);
  if (tags.length) console.log(`  sections: ${tags.join(', ')}`);
  if (blocks.length > 45000) console.log('  ! over 45k stones: the software rasteriser will struggle and so will a phone');
}
console.log(`${grand.toLocaleString()} stones in ${specs.length} structure${specs.length === 1 ? '' : 's'}`);
