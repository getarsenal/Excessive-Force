// The postcard: the level from where the photographs of the place are taken.
//
//   node tools/postcard.mjs <id> [--yaw R] [--pitch R] [--dist M] [--height M] [--survey] [--out DIR]
//
// Loads the level against the dev server on 5177 (TT_PORT to change), clears
// the HUD, sets the rig to the level's own camera — or the override given —
// and writes <out>/<id>-postcard.png. With --survey the load painter is on,
// which is the picture that says where the building is actually standing.
//
// This is the loop the suite cannot replace. The suite says whether it
// stands; only a picture beside the photograph says whether it is the place.
// The Potala went through nine of these and the suite once. It used to be a
// scratch probe rewritten every time; it is this now.
import { chromium } from 'playwright';
import { statSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
if (!id) { console.error('usage: node tools/postcard.mjs <id> [--yaw R] [--pitch R] [--dist M] [--height M] [--survey] [--out DIR]'); process.exit(2); }
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const num = (k) => (opt(k) !== undefined ? Number(opt(k)) : undefined);
const outDir = opt('out') || '/tmp/out';
const survey = args.includes('--survey');
const port = process.env.TT_PORT || 5177;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 160)));
await page.addInitScript(() => {
  try {
    localStorage.setItem('tt.quality', 'low');
    localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0');
    localStorage.setItem('tt.opening', '0');
  } catch { /* private mode */ }
});
await page.goto(`http://localhost:${port}/?level=${id}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
await page.waitForTimeout(2000);

const info = await page.evaluate(({ yaw, pitch, dist, height, survey }) => {
  const c = window.testMenu.ctx;
  const cam = c.battle.level.camera;
  const g = c.battle.originGround;
  const r = window.rig;
  const y = yaw ?? cam.yaw, p = pitch ?? cam.pitch, d = dist ?? cam.distance, h = height ?? cam.height;
  r.target.set(0, g + h, 0); r.desiredTarget.copy(r.target);
  r.yaw = r.desiredYaw = y; r.pitch = r.desiredPitch = p; r.distance = r.desiredDistance = d;
  document.body.classList.add('clear-view');
  if (survey) c.hud.setSurvey(true);
  const st = c.battle.primary;
  return `${c.battle.level.name}: yaw ${y} pitch ${p} distance ${d} height ${h}; `
    + `${st.count} stones, standing ${(st.standingHeight() - g).toFixed(0)} m`;
}, { yaw: num('yaw'), pitch: num('pitch'), dist: num('dist'), height: num('height'), survey });
console.log(info);

mkdirSync(outDir, { recursive: true });
const file = `${outDir}/${id}-postcard${survey ? '-survey' : ''}.png`;
let size = 0;
for (let a = 0; a < 6 && size < 20000; a++) {
  await page.waitForTimeout(1800);
  try { await page.screenshot({ path: file, timeout: 60000 }); size = statSync(file).size; } catch { /* rasteriser busy */ }
}
console.log(size > 20000 ? `wrote ${file}` : `FAILED to render ${file}`);
await b.close();
process.exit(size > 20000 ? 0 : 1);
