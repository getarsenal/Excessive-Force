// Does a belfry fall when the shaft under it is shot away? Cuts a band out
// of a section on a level, all of it, all but the stones touching another
// section, or all but one corner column, and counts what is still standing
// above the cut every three seconds after. Before the local balance check
// in the support solver, St. Vitus's west belfries stood on one column.
//
//   node tools/hangcheck.mjs [all|touch|col] [level=stvitus] [tier=low] [tag=towers] [y0=305] [y1=345]
import { chromium } from 'playwright';
const [mode = 'all', level = 'stvitus', tier = 'low', tag = 'towers', y0 = '305', y1 = '345'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 500, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript((t) => { try {
  localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.suite', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(([tag, y0, y1, mode]) => {
  const B = window.battle;
  const count = () => { let ring = 0, spire = 0; for (const s of B.structures) for (let i = 0; i < s.count; i++) {
    if (s.tagOf[i] !== tag || !(s.flags[i] & 1) || (s.flags[i] & 2) || (s.flags[i] & 8)) continue;
    if (s.py[i] >= 347 && s.py[i] < 354) ring++; else if (s.py[i] >= 354) spire++; } return { ring, spire }; };
  const before = count();
  // The shaft cut out under both belfries, all round.
  let cut = 0;
  for (const s of B.structures) {
    const keep = (i) => {
      if (mode === 'touch') { for (let a = s.adjStart[i]; a < s.adjStart[i + 1]; a++) if (s.tagOf[s.adjList[a]] !== tag) return true; return false; }
      if (mode === 'col') {
        // One column at each tower's corner nearest the nave.
        const E = s.px[i] > 0;
        return Math.abs(s.px[i]) < (E ? 999 : 999) && s.__corner && s.__corner.has(i);
      }
      return false;
    };
    if (mode === 'col') {
      s.__corner = new Set();
      for (const E of [true, false]) {
        let best = null, bd = -1e9;
        for (let i = 0; i < s.count; i++) if (s.tagOf[i] === tag && (s.px[i] > 0) === E && s.py[i] > y0 && s.py[i] < y0 + 4) { const d = -s.pz[i] - Math.abs(s.px[i]) * 0.5; if (d > bd) { bd = d; best = i; } }
        for (let i = 0; i < s.count; i++) if (s.tagOf[i] === tag && Math.hypot(s.px[i] - s.px[best], s.pz[i] - s.pz[best]) < 1.5) s.__corner.add(i);
      }
    }
    for (let i = 0; i < s.count; i++) if (s.tagOf[i] === tag && (s.flags[i] & 1) && s.py[i] > y0 && s.py[i] < y1 && !keep(i)) { s.destroyChunk(i); cut++; }
    s.stabilityDirty = true;
  }
  const t = [];
  for (let k = 0; k < 6; k++) { window.__fastForward(3, 1 / 30); t.push(count()); }
  return { before, cut, t };
}, [tag, Number(y0), Number(y1), mode]);
console.log(JSON.stringify(r));
await b.close();
