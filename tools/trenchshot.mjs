// Three close views of a manned trench bay, for looking at the field works.
//
//   node tools/trenchshot.mjs <level> [tier] [outdir]   → <outdir>/<level>-trench{0,1,2}.png
//
// From behind the men, obliquely along the line, and from the enemy's side.
import { chromium } from 'playwright';
const [id, tier = 'low', out = '/tmp/out'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 160)));
page.on('console', (m) => { const t = m.text(); if (/field works|error/i.test(t)) console.log(t.slice(0, 200)); });
await page.addInitScript((tier) => { localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); }, tier);
await page.goto(`http://localhost:5177/?level=${id}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
await page.waitForTimeout(1500);
const shots = [[0, 0.32, 22], [0.9, 0.55, 30], [Math.PI, 0.45, 20]];
for (let k = 0; k < shots.length; k++) {
  const info = await page.evaluate(([dy, p, d]) => {
    const c = window.testMenu.ctx;
    c.battle.garrison.fireEnabled = false;
    const all = c.battle.garrison.defenders; const ds = all.filter((x) => x.cover === 'trench' && x.alive); if (!ds.length) return JSON.stringify(all.reduce((a, x) => (a[x.cover] = (a[x.cover] || 0) + 1, a), {}));
    const t = ds[Math.floor(ds.length / 3)];
    const r = window.rig;
    r.target.set(t.pos.x, t.pos.y + 1, t.pos.z); r.desiredTarget.copy(r.target);
    // camera in front of the man: rig yaw convention — look along -facing
    r.yaw = r.desiredYaw = t.facing + dy; r.pitch = r.desiredPitch = p; r.distance = r.desiredDistance = d;
    document.body.classList.add('clear-view');
    return `${ds.length} trench men; at ${t.pos.x.toFixed(0)},${t.pos.z.toFixed(0)}`;
  }, shots[k]);
  console.log(info);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${id}-trench${k}.png` });
}
await b.close();
