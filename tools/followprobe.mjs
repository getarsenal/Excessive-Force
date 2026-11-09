// FOLLOW on an aircraft against no follow: the same strike called twice,
// the camera on it once, the sortie's flight read every frame.
//   FOLLOW=0|1 KIND=f15 node tools/followprobe.mjs [level]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const KIND = process.env.KIND || 'f15';
const MODE = process.env.FOLLOW ?? '1';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript((tier) => { try {
  localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} }, process.env.TIER || 'low');
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 200)));
page.on('crash', () => console.log('page crashed'));
page.on('close', () => console.log('page closed'));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('navigated:', f.url()); });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.__studio, null, { timeout: 400000 });
await page.evaluate(() => { window.__drive = async (n) => { for (let k = 0; k < n; k++) { window.__frame(); await new Promise((r) => setTimeout(r, 36)); } }; });
await page.evaluate((q) => { window.__quiet = q; }, !!process.env.QUIET);
await page.evaluate(() => { const B = window.battle; B.airborne.auto = false; B.assault.auto = false; B.invulnerable = true; B.unlockAll = true; B.money = 1e7; const q = window.__quiet; if (q) { if (B.garrison) B.garrison.fireEnabled = false; if (B.sams) B.sams._engage = () => {}; } });
await page.click('#dock-view');
await page.evaluate(([kind]) => { const B = window.battle, o = B.primary.origin, T = window.THREE; window.__call = B.callStrike(kind, new T.Vector3(o.x, B.originGround, o.z)); }, [KIND]);
if (MODE !== '0') await page.evaluate((m) => { const S = window.__studio; S.followTap(); S.followTap(); if (m === 'air') {} ; for (let i = 1; i < +m; i++) S.chaseTap(); }, MODE);
const r = await page.evaluate(async () => {
  const B = window.battle, S = window.__studio, R = window.__rig, out = [];
  const s0 = B.air.sorties[B.air.sorties.length - 1];
  for (let k = 0; k < 140; k++) {
    await window.__drive(1);
    const s = s0; if (!s.model) break;
    const p = s.model.position;
    out.push([k, +s.t.toFixed(2), Math.round(p.x), Math.round(p.y), Math.round(p.z), s.released ? 1 : 0, s.aborted ? 1 : 0, +(s.climb || 0).toFixed(2), Math.round(s.hp ?? -1), S.mode, S.target?.kind || '-', Math.round(window.__engine.camera.position.distanceTo(p))]);
    if (!B.air.sorties.includes(s)) break;
  }
  return { out, target: s0.target && [Math.round(s0.target.x), Math.round(s0.target.y), Math.round(s0.target.z)], releaseAt: s0.releaseAt, pullUpAt: s0.pullUpAt };
});
console.log(JSON.stringify({ target: r.target, releaseAt: r.releaseAt, pullUpAt: r.pullUpAt }));
for (const row of r.out) if (row[0] % 4 === 0 || row[5] || row[6]) console.log(row.join('\t'));
await b.close();
