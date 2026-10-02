// The A-10's gun run, listened to: flies N runs and logs whether the gun
// recording was scheduled each time, with the mixer's voices before and
// after. LOUD=1 fills every voice first, as a busy fight does.
//
//   [LOUD=1] node tools/a10audio.mjs [level=westminster] [runs=8]
import { chromium } from 'playwright';
const [level = 'westminster', runs = '8'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (/a10|brrt|audio|tumble/i.test(t)) console.log('CONSOLE', t.slice(0, 200)); });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.mouse.click(400, 250);
await page.waitForFunction(() => window.battle.audio?.ready, null, { timeout: 60000 }).catch(() => console.log('audio never ready'));
const st = await page.evaluate(() => {
  const B = window.battle, A = B.audio;
  B.unlockAll = true; B.freeBuild = true;
  window.__log = [];
  const orig = A.play.bind(A);
  let n = 0;
  A.play = (name, pos, o = {}) => {
    n++;
    if (name === 'brrt') {
      const before = A.voices;
      const why = !A.ready ? 'not ready' : !A.enabled ? 'disabled' : !A.buffers.get('brrt') ? 'no buffer' : A.voices >= 24 ? 'VOICE CAP' : 'ok?';
      const res = orig(name, pos, o);
      window.__log.push({ res, ok: A.voices > before, t: B.elapsed.toFixed(1), voicesBefore: before, voicesAfter: A.voices, why, state: A.ctx.state });
      return res;
    }
    return orig(name, pos, o);
  };
  window.__calls = () => n;
  return A.status;
});
console.log(JSON.stringify(st));
if (process.env.LOUD) await page.evaluate(() => { const A = window.battle.audio; for (let k = 0; k < 40; k++) A.play('explosion', null, { rate: 0.2, gain: 0.0001, delay: 30 }); console.log('a10 loud voices ' + A.voices); });
for (let r = 0; r < Number(runs); r++) {
  const v = await page.evaluate(() => {
    const B = window.battle, o = B.primary.origin;
    const a = o.clone(); a.x += 40; a.y = B.primary.groundY;
    const t = a.clone(); t.z += 140;
    B.sams && (B.sams.quiet = true);
    window.__s = B.callStrike('a10', a, { to: t });
    return window.battle.audio.voices;
  });
  let peak = 0;
  let info;
  for (let k = 0; k < 60; k++) {
    await page.evaluate(() => window.__fastForward(0.5, 1 / 30));
    await page.waitForTimeout(100);
    info = await page.evaluate(() => { const s = window.__s; return { v: window.battle.audio.voices, t: s && s.t, rel: s && s.releaseAt, fired: s && s.strafe && s.strafe.fired, ab: s && s.aborted, el: window.battle.elapsed }; });
    peak = Math.max(peak, info.v);
    if (info.fired >= 110 && k > 4 && info.t > info.rel + 4) break;
  }
  console.log(JSON.stringify(info));
  const log = await page.evaluate(() => window.__log.splice(0));
  console.log(`run ${r}: voices at call ${v}, peak ${peak}, calls ${await page.evaluate(() => window.__calls())}`, JSON.stringify(log));
}
await b.close();
