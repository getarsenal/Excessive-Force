// The blow of a landing section: brings a landmark down with charges at its
// foot (as demoprobe does) and records what the phone would feel — every
// vibration pattern the page asks for, by size, and every hit-stop.
//   node tools/hitstopprobe.mjs [level=westminster] [port=5178]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', port = process.argv[3] || process.env.TT_PORT || 5178;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => {
  try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {}
  window.__buzz = [];
  navigator.vibrate = (p) => { window.__buzz.push({ t: performance.now(), p: Array.isArray(p) ? p : [p] }); return true; };
});
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const B = window.battle; B.invulnerable = true; if (B.garrison) B.garrison.fireEnabled = false; window.__buzz.length = 0;
  // Every hard contact an island makes, by force: what the landing beat sees.
  window.__isl = [];
  B.physics.onImpact((a, b, force) => { for (const o of [a, b]) if (o && o.island !== undefined) { const isl = o.structure.islands.get(o.island); window.__isl.push([Math.round(force), isl ? isl.members.length : -1]); } });
});
let stops = 0, lastStop = -1e9, last = null;
for (let n = 0; n < (+process.env.CHARGES || 70); n++) {
  const r = await page.evaluate(async (n) => {
    const B = window.battle, s = B.primary;
    let best = -1, by = Infinity;
    const start = Math.floor(((n * 0.137) % 1) * s.count);
    for (let k = 0; k < s.count; k++) {
      const i = (start + k) % s.count;
      if (!(s.flags[i] & 1) || (s._winMask && !s._winMask[i])) continue;
      if (s.py[i] < window.terrain.heightAt(s.px[i], s.pz[i]) + 0.4) continue;
      if (s.py[i] < by - 0.5) { by = s.py[i]; best = i; if (k > s.count * 0.05) break; }
    }
    if (best < 0) return { done: true };
    s.explode({ x: s.px[best], y: s.py[best], z: s.pz[best] }, 4, 9, 60000, { dir: { x: 0, y: 0.1, z: 1 }, kinetic: 0.8 });
    for (let k = 0; k < 12; k++) {
      for (let j = 0; j < 8; j++) {
        window.__fastForward(1 / 30, 1 / 30);
        // The islands as they fall: the biggest, and the fastest a 60-stone one drops.
        for (const isl of s.islands.values()) {
          window.__islMax = Math.max(window.__islMax || 0, isl.members.length);
          if (isl.members.length >= 60 && isl.body) {
            try {
              const vy = isl.body.linvel().y;
              window.__vyMin = Math.min(window.__vyMin || 0, vy);
              // The sharpest one-frame loss of downward speed a big section shows.
              if (isl.__pv !== undefined && isl.__pv < -2) window.__dvMax = Math.max(window.__dvMax || 0, vy - isl.__pv);
              isl.__pv = vy;
            } catch {}
          }
        }
      }
      await new Promise((r) => setTimeout(r, 2));
    }
    return { bar: +(B.progress ?? 0).toFixed(3), state: B.state, stop: window.__hitStops().last };
  }, n);
  if (r.done) break;
  if (r.stop > lastStop) { stops++; lastStop = r.stop; }
  last = r;
  if (r.state !== 'playing') break;
}
console.log('hooked', await page.evaluate(() => typeof window.battle.primary.onSectionLanded), '· islands seen with a speed', await page.evaluate(() => [...window.battle.primary.islands.values()].filter((i) => i.vyPrev !== undefined).length), 'of', await page.evaluate(() => window.battle.primary.islands.size));
console.log('biggest island', await page.evaluate(() => window.__islMax), 'stones · fastest fall of a 60+ one', await page.evaluate(() => (window.__vyMin || 0).toFixed(1)), 'm/s · sharpest one-frame stop', await page.evaluate(() => (window.__dvMax || 0).toFixed(2)), 'm/s');
console.log('end', JSON.stringify(last), 'landings (stones each)', JSON.stringify(await page.evaluate(() => window.__hitStops().landings)));
const buzz = await page.evaluate(() => window.__buzz);
const slams = buzz.filter((x) => x.p.length === 5 && x.p[1] === 25);
console.log(level, 'vibrations', buzz.length, '· slams', slams.length, '· hit-stops', stops);
if (process.env.ALL) for (const x of buzz) console.log('  buzz', JSON.stringify(x.p));
for (const s of slams.slice(0, 12)) console.log('  slam', JSON.stringify(s.p), 'total', s.p.reduce((a, v) => a + v, 0), 'ms');
const isl = await page.evaluate(() => window.__isl);
const big = isl.filter(([, n]) => n >= 60);
console.log('island contacts', isl.length, '· of 60+ stones', big.length, '· their forces', JSON.stringify(big.map(([f]) => f).sort((x, y) => y - x).slice(0, 12)));
console.log('errors', JSON.stringify(errors));
await b.close();
