// The ground course of every structure a level lays, as rectangles, for
// tools/footcheck.py to lay over the baked ground. No browser.
//
//   node tools/footprint.mjs <id> [tier=low]   -> JSON on stdout
import { LEVELS } from '../src/game/levels.js';
import { SPECS } from '../src/game/atlas_specs.js';
const [id, tierName = 'low'] = process.argv.slice(2);
const SCALE = { low: 1.55, medium: 1.2, high: 1.0, ultra: 0.85 };
const quality = { name: tierName, blockScale: SCALE[tierName] ?? 1.55, groundClutter: false };
const lv = LEVELS[id];
// FOOT_MUL scales a catalogue building on top of its game scale, for
// tools/footcheck.py --fit to search for the largest that stands on its ground.
const mul = +(process.env.FOOT_MUL || 1);
if (mul !== 1 && SPECS[id]) { SPECS[id].S *= mul; if (SPECS[id].clear) SPECS[id].clear *= mul; }
const specs = typeof lv.structures === 'function' ? lv.structures(quality) : lv.structures;
const out = { id, origin: lv.origin || null, padRadius: lv.padRadius ?? null, structures: [] };
for (const sp of specs) {
  const rects = [];
  for (const b of sp.blocks.blocks) {
    // The course that sits on the ground: its foot within half a metre of it.
    const foot = b.y - b.hy;
    if (foot > 0.5 || b.y + b.hy <= 0) continue;
    const c = Math.abs(Math.cos(b.ry || 0)), s = Math.abs(Math.sin(b.ry || 0));
    rects.push([+b.x.toFixed(2), +b.z.toFixed(2), +(b.hx * c + b.hz * s).toFixed(2), +(b.hx * s + b.hz * c).toFixed(2), +foot.toFixed(2)]);
  }
  out.structures.push({ key: sp.key, label: sp.label, primary: !!sp.primary, offset: sp.offset || null, onSlope: !!sp.onSlope, rects });
}
console.log(JSON.stringify(out));
