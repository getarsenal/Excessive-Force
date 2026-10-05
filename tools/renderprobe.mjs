// The render alone, on a scene that is the same every time: the level as
// loaded, nothing deployed, nothing burning. Three frames to compile, then
// the median of thirty. For an A/B of the shading between two servers:
//
//   TT_PORT=5178 node tools/renderprobe.mjs westminster; TT_PORT=5177 node tools/renderprobe.mjs westminster
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 600 } });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const B = window.battle; B.airborne.auto = false; B.assault.auto = false;
  const eng = window.engine;
  for (let k = 0; k < 3; k++) window.__frame();
  const rs = [];
  for (let k = 0; k < 30; k++) { const t = performance.now(); window.__frame(); rs.push(performance.now() - t); }
  rs.sort((a, b) => a - b);
  eng.renderer.info.autoReset = false; eng.renderer.info.reset(); window.__frame();
  const inf = eng.renderer.info;
  return { median: rs[15].toFixed(1), p20: rs[6].toFixed(1), p80: rs[24].toFixed(1), calls: inf.render.calls, tris: inf.render.triangles, programs: inf.programs?.length };
});
console.log(JSON.stringify({ port, level, ...r }));
await b.close();
