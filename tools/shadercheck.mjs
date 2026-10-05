// Boot a level and print every console error and warning: a shader that
// failed to compile shows up here and nowhere else.
//   node tools/shadercheck.mjs [level=westminster]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 800, height: 500 } });
const bad = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') bad.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => bad.push(`pageerror: ${e.message.slice(0, 300)}`));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
// A unit and a strike, so their materials compile too.
await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true;
  for (let k = 0; k < 40; k++) {
    const a = k * 0.5, q = new T.Vector3(o.x + Math.sin(a) * 160, 0, o.z + Math.cos(a) * 160);
    q.y = B.terrain.heightAt(q.x, q.z);
    if (B.validPlacement(q).ok && await B.deploy('m119', q)) break;
  }
  for (let k = 0; k < 120; k++) window.__fastForward(0.1, 0.1);
});
await page.waitForTimeout(1500);
console.log(JSON.stringify({ level, problems: [...new Set(bad)].slice(0, 12) }, null, 1));
await b.close();
