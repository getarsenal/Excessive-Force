import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 640, height: 400 } });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); } catch {} });
await page.goto(`http://localhost:5177/?level=${process.argv[2]}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const out = [];
  for (const s of window.structures) {
    const tagOf = (i) => { for (const [k, [a, b]] of Object.entries(s.tagRanges || {})) if (i >= a && i < b) return k; return '?'; };
    for (let i = 0; i < s.count; i++) {
      if (!((s.flags[i] & 1) && (s.flags[i] & 10))) continue;
      out.push([tagOf(i), +(s.px[i] - s.origin.x).toFixed(1), +(s.py[i] - s.groundY).toFixed(1), +(s.pz[i] - s.origin.z).toFixed(1), [s.hx[i], s.hy[i], s.hz[i]].map(v => +v.toFixed(2)).join('x'), s.flags[i], s.mat ? s.mat[i] : -1]);
    }
  }
  return out;
});
for (const row of r) console.log(row.join('  '));
await b.close();
