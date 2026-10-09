// The shadow map on the battery saver (main.js `placeSun`): a level at the
// phone's tier with the saver on, the frames drawn and the shadow redraws
// counted while it stands quiet, while a battery deployed on it swings and
// fires, and while the camera pans; then the same view with the saver off,
// photographed beside the saver's for the shadows to be compared; and how
// many elements on the page still wear a frosted-glass backdrop filter.
//   TIER=medium node tools/shadowprobe.mjs [level=westminster]  -> /tmp/out/shadow-{saver,full}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const run = async (saver) => {
  const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(([tier, sv]) => { try {
    localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.saver', sv);
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
  } catch {} }, [process.env.TIER || 'medium', saver ? 'on' : 'off']);
  await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  await page.waitForTimeout(2500);
  const read = () => page.evaluate(() => window.__shadows());
  const phase = async (name, ms, fn) => {
    const a = await read();
    if (fn) await page.evaluate(fn);
    await page.waitForTimeout(ms);
    const z = await read();
    const f = z.frames - a.frames, d = z.draws - a.draws;
    console.log(`${saver ? 'saver' : 'full '} ${name.padEnd(8)} frames ${String(f).padStart(4)}  shadow redraws ${String(saver ? d : f).padStart(4)}  (${f ? Math.round(100 * (saver ? d : f) / f) : 0}%)  onDemand ${z.onDemand}  frosted ${await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const f = getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter; return f && f !== 'none'; }).length)}`);
  };
  await phase('quiet', 8000);
  await page.screenshot({ path: `/tmp/out/shadow-${saver ? 'saver' : 'full'}.png`, timeout: 120000 }).catch(() => {});
  await phase('battery', 8000, () => {
    const B = window.battle, T = window.THREE, o = B.primary.origin;
    B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
    B.setTarget(new T.Vector3(o.x, B.originGround + 25, o.z), 'tower');
    for (let a = 0; a < 360; a += 60) { const x = o.x + Math.cos(a * Math.PI / 180) * 260, z = o.z + Math.sin(a * Math.PI / 180) * 260, p = new T.Vector3(x, window.terrain.heightAt(x, z), z); if (B.validPlacement(p, null).ok) B.deploy('m777', p); }
  });
  await phase('pan', 6000, () => { const R = window.rig; let k = 0; const t = setInterval(() => { R.desiredTarget.x += 6; R.target.x += 6; if (++k > 60) clearInterval(t); }, 90); });
  console.log('errors', errors.length ? errors : 'none');
  await page.close();
};
await run(true);
await run(false);
await b.close();
