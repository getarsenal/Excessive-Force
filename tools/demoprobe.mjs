// Bring a level's landmark down the way a battery would, on a phone's tier,
// and watch what the phone would feel: a charge on the lowest standing stone
// of the scored sections every few seconds, the fight stepped and drawn
// between, and after each the bar, the bodies the physics is carrying
// (simulated and awake), the worst physics step, the JS heap, the renderer's
// geometries and textures and draw calls, a lost context, and every error.
// Stops at the win, at a hundred charges, or when the page dies.
//   node tools/demoprobe.mjs [level=segovia] [tier=low]
import { chromium } from 'playwright';
const level = process.argv[2] || 'segovia', tier = process.argv[3] || 'low';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--enable-precise-memory-info'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
let crashed = false;
page.on('crash', () => { crashed = true; });
page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 400)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_CERT') && !t.includes('Failed to load resource')) errors.push(t.slice(0, 400)); });
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const ce = console.error.bind(console);
  console.error = (...a) => { ce(...a.map((x) => (x instanceof Error ? `${x.message} @ ${(x.stack || '').split('\n').slice(1, 4).join(' | ')}` : x))); };
  const gl = window.__engine.renderer.getContext();
  window.__lost = false;
  gl.canvas.addEventListener('webglcontextlost', () => { window.__lost = true; });
  const B = window.battle;
  B.invulnerable = true;
  if (B.garrison) B.garrison.fireEnabled = false;
});
const info = await page.evaluate(() => {
  const B = window.battle, s = B.primary;
  return { stones: s.count, tags: [...new Set(Array.from({ length: s.count }, (_, i) => s.tagOf?.[i]))].slice(0, 12), budget: B.physics?.activeBudget };
});
console.log('level', level, tier, JSON.stringify(info));
let worstStep = 0;
for (let n = 0; n < 100 && !crashed; n++) {
  let r;
  try {
    r = await page.evaluate(async (n) => {
      const B = window.battle, s = B.primary, P = B.physics;
      // The lowest standing scored stone, from a sweep along the structure so
      // the charges walk the length of it as a battery's fall of shot does.
      let best = -1, by = Infinity;
      const mask = s._winMask;
      const off = (n * 0.137) % 1;
      const start = Math.floor(off * s.count);
      for (let k = 0; k < s.count; k++) {
        const i = (start + k) % s.count;
        if (!(s.flags[i] & 1) || (mask && !mask[i])) continue;
        if (s.py[i] < by - 0.5) { by = s.py[i]; best = i; if (k > s.count * 0.05) break; }
      }
      if (best < 0) return { done: true };
      const at = { x: s.px[best], y: s.py[best], z: s.pz[best] };
      s.explode(at, 4, 9, 60000, { dir: { x: 0, y: 0.1, z: 1 }, kinetic: 0.8 });
      let worst = 0;
      const t0 = performance.now();
      for (let k = 0; k < 12; k++) {
        const a = performance.now();
        window.__fastForward(0.25, 1 / 30);
        worst = Math.max(worst, performance.now() - a);
        window.__frame();
        await new Promise((r) => setTimeout(r, 2));
      }
      const ri = window.__engine.renderer.info;
      return {
        n, bar: +(B.progress ?? (1 - s.monumentIntegrity)).toFixed(3), integ: +s.monumentIntegrity.toFixed(3),
        state: B.state, bodies: P?.dynamicSet?.size, awake: P?.awakeCount, culled: P?.runawaysCulled || 0,
        worstQuarterMs: Math.round(worst), wallMs: Math.round(performance.now() - t0),
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        geo: ri.memory.geometries, tex: ri.memory.textures, calls: ri.render.calls, lost: window.__lost,
      };
    }, n);
  } catch (e) { errors.push('probe: ' + String(e).slice(0, 300)); break; }
  if (r.done) { console.log('nothing scored left standing'); break; }
  worstStep = Math.max(worstStep, r.worstQuarterMs);
  console.log(JSON.stringify(r));
  if (r.state !== 'playing' || r.lost) break;
}
console.log('crashed', crashed, 'worst quarter-second', worstStep, 'ms');
console.log('errors', errors.length);
for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ', e);
await b.close();
