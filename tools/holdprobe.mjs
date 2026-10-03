// The win waits for the drop: launch the counter-attack, bring the building
// down, and check the level holds until the last man of the drop is gone.
//
//   node tools/holdprobe.mjs [level=versailles]
import { chromium } from 'playwright';
const level = process.argv[2] || 'versailles';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(() => {
  const B = window.battle, ff = window.__fastForward, out = {};
  B.airborne.auto = false; B.assault.auto = false; B.invulnerable = true;
  const ev = []; const say = B.onEvent; B.onEvent = (k, d) => { if (['winheld', 'dropsleft', 'win'].includes(k)) ev.push([k, d.left ?? '']); return say(k, d); };
  ff(2);
  B.assault.launch();
  ff(6);
  out.outstandingInbound = B.assault.outstanding;
  for (const ob of B.objectives) { const S = ob.structure; for (let i = 0; i < S.count; i++) if (S.isAlive(i)) S.destroyChunk(i); }
  ff(8);
  out.stateWhileInbound = B.state;
  let t = 0; while (B.assault.state === 'inbound' && t < 120) { ff(2); t += 2; }
  ff(8);
  out.stateAfterLanding = B.state; out.left = B.assault.outstanding;
  for (const d of B.garrison.defenders) if (d.pool === 'wave') d.alive = false;
  ff(2);
  out.stateCleared = B.state;
  out.events = ev.slice(0, 6);
  return out;
});
console.log(JSON.stringify({ level, ...r, errors }));
await b.close();
