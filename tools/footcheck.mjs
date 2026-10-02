// How far the ground falls away under a level's structures: for every
// stone's footprint, the terrain under it against the structure's own
// ground, so masonry built over a drop is found before it is seen hanging.
//
//   node tools/footcheck.mjs <level>   (dev server on 5177)
import { chromium } from 'playwright';
const level = process.argv[2] || 'machupicchu';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 800, height: 500 } });
await page.addInitScript(() => { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
console.log(JSON.stringify(await page.evaluate(() => {
  const t = window.terrain, out = [];
  for (const s of window.battle.structures) {
    if (s.groundAt) continue;                       // laid on the slope already
    const bySec = {};
    for (let i = 0; i < s.count; i++) {
      if (s.py[i] - s.hy[i] > s.groundY + 0.6) continue;       // the bottom course only
      const g = t.heightAt(s.px[i], s.pz[i]) - s.groundY;
      const tag = s.tagOf[i] || '-';
      const r = bySec[tag] || (bySec[tag] = { n: 0, over2: 0, worst: 0, at: null });
      r.n++;
      if (g < -2) r.over2++;
      if (g < r.worst) { r.worst = +g.toFixed(1); r.at = [Math.round(s.px[i]), Math.round(s.pz[i])]; }
    }
    out.push({ key: s.key, groundY: +s.groundY.toFixed(1), sections: bySec });
  }
  return out;
}), null, 1));
await b.close();
