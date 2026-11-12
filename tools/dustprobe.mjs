// Where the stone goes: every stone deleted on a level, by the path that
// deleted it (a shell's crater, the crush under a landing section, the body
// budget's cull, a runaway, napalm), against how many stones were freed to
// fall. A building that evaporates instead of falling shows up here as
// deletions outnumbering falls.
//
//   node tools/dustprobe.mjs <level> [units=40] [seconds=40] [tier=low]
//   BUDGET=n  the physics body budget (default: the tier's own)
import { chromium } from 'playwright';
const [level = 'baalbek', nUnits = '40', secs = '40', tier = 'low'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 600, height: 400 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript((tier) => { try {
  localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const r = await page.evaluate(([n, secs, budget]) => {
  const B = window.battle, P = window.physics;
  if (budget) P.setBudget(budget);
  const why = {}, freed = { n: 0 };
  const classify = (from) => {
    if (typeof from === 'string') return from;
    const s = new Error().stack.split('\n').slice(3, 9).join(' ');
    for (const k of ['crushUnder', '_cullRubble', 'cullRunaways', '_discard', 'recycleSettled', 'explode', 'onImpact', 'napalm']) if (s.includes(k)) return k;
    return from && typeof from === 'object' ? 'point:' + (s.match(/at (\S+)/)?.[1] || '?') : 'other:' + (s.match(/at (\S+)/)?.[1] || '?');
  };
  for (const s of B.structures) {
    const d = s.destroyChunk.bind(s);
    s.destroyChunk = function (i, from) { if (this.isAlive(i)) { const k = classify(from); why[k] = (why[k] || 0) + 1; } return d(i, from); };
    const f = s.freeChunk.bind(s);
    s.freeChunk = function (...a) { const ok = f(...a); if (ok) freed.n++; return ok; };
  }
  const tm = window.testMenu;
  const kinds = ['m119', 'm777', 'm109', 'm120'];
  let placed = 0;
  for (let i = 0; placed < n && i < n * 3; i++) placed += tm.spawnAt(kinds[i % kinds.length], 1, (i * 2.39996) % (Math.PI * 2), 170 + (i % 5) * 35);
  B.airlift = false;
  const total = B.structures.reduce((a, s) => a + s.count, 0);
  const log = [];
  for (let t = 0; t < secs; t += 5) {
    window.__fastForward(5);
    const down = B.structures.reduce((a, s) => a + s.destroyedCount, 0);
    log.push({ t: t + 5, deleted: down, freed: freed.n, dyn: P.dynamicSet.size, budget: P.activeBudget, culled: P.rubbleCulled || 0, hanging: P.hangingCulled || 0, runaway: P.runawaysCulled || 0 });
  }
  return { total, placed, why, log };
}, [+nUnits, +secs, +(process.env.BUDGET || 0)]);
console.log(JSON.stringify({ level, tier, total: r.total, placed: r.placed }));
for (const l of r.log) console.log(JSON.stringify(l));
console.log('deleted by:', JSON.stringify(Object.entries(r.why).sort((a, b) => b[1] - a[1])));
await b.close();
