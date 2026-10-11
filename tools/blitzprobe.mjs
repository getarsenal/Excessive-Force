// A Blitz played through: started the way the front door starts one, the
// clock read before the first gun and after it, a battery deployed and left
// to fire, the battle run past the three minutes, and the end card read
// (title, line, stars) with what was banked for the landmark. Prints errors.
//   node tools/blitzprobe.mjs [level=westminster]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript((lv) => {
  try {
    localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1');
    if (!sessionStorage.getItem('probe.once')) { sessionStorage.setItem('probe.once', '1'); sessionStorage.setItem('tt.blitzrun', JSON.stringify({ level: lv })); }
  } catch {}
}, level);
await page.goto(`http://localhost:${port}/?level=${level}&plan=${process.env.PLAN || ''}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(800);
if (process.env.SHOT) {
  // The bar as a phone shows it: one gun down, the clock running.
  await page.evaluate(async () => {
    const B = window.battle, T = window.THREE, o = B.primary.origin;
    for (let a = 0; a < 360; a += 13) {
      const x = o.x + Math.cos(a * Math.PI / 180) * 150, z = o.z + Math.sin(a * Math.PI / 180) * 150;
      if (await B.deploy('m119', new T.Vector3(x, window.terrain.heightAt(x, z), z))) break;
    }
    window.__fastForward(37, 1 / 30); window.__frame();
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/out/blitz-bar.png' });
  console.log('shot /tmp/out/blitz-bar.png');
  await b.close();
  process.exit(0);
}
const r = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  const bar = document.getElementById('blitzbar');
  const before = { shown: !bar.hidden, clock: bar.querySelector('.bz-clock').textContent, airlift: B.airlift, money: B.money,
    airborne: B.airborne?.enabled, saved: !!localStorage.getItem('tt.battles') && JSON.parse(localStorage.getItem('tt.battles'))[B.level?.id] };
  window.__fastForward(5, 1 / 30); window.__frame();
  const notStarted = bar.querySelector('.bz-clock').textContent;
  // A keen player: the tower designated, and every dollar spent on guns as
  // soon as it comes in, the heaviest the purse allows (PLAN=m777 etc. to
  // try one kind).
  B.setTarget?.(new T.Vector3(o.x, B.originGround + 12, o.z), 'tower');
  const plan = (new URLSearchParams(location.search).get('plan') || 'm109,m270,m777,m119').split(',');
  let ang = 0, spent = 0;
  const COST = { m109: 2200, m270: 1800, m777: 1300, m119: 700, m240: 40, stryker: 1800, m142: 5200, m120: 240 };
  const buy = async () => {
    for (let tries = 0; tries < 40; tries++) {
      const afford = plan.filter((k) => B.money >= COST[k]);
      if (!afford.length) return;
      ang += 11;
      const rad = 140 + (ang % 90);
      const x = o.x + Math.cos(ang * Math.PI / 180) * rad, z = o.z + Math.sin(ang * Math.PI / 180) * rad;
      const p = new T.Vector3(x, terrain.heightAt(x, z), z);
      const m0 = B.money;
      if (await B.deploy(afford[0], p)) spent += m0 - B.money;
    }
  };
  await buy();
  window.__fastForward(1, 1 / 30); window.__frame();
  const started = bar.querySelector('.bz-clock').textContent;
  let units = B.units.length;
  const trace = [];
  for (let t = 0; t < 200 && !document.body.classList.contains('ended'); t += 2) {
    window.__fastForward(2, 1 / 30);
    if (t % 10 === 0) { await buy(); units = Math.max(units, B.units.length); }
    if (t % 30 === 0) { window.__frame(); trace.push(`${t}s ${Math.round(B.objectiveProgress * 100)}% ${B.units.length}u $${Math.round(B.money)}`); }
    await new Promise((res) => setTimeout(res, 5));
  }
  window.__trace = trace;
  for (let k = 0; k < 20 && !document.body.classList.contains('ended'); k++) await new Promise((res) => setTimeout(res, 500));
  const ec = document.getElementById('endcard');
  return {
    before, notStarted, started, units, ended: document.body.classList.contains('ended'),
    title: document.querySelector('.ec-title')?.textContent, sub: document.querySelector('.ec-sub, #ec-sub')?.textContent,
    stars: [...document.querySelectorAll('#ec-stars .ecs')].map((e) => `${e.classList.contains('on') ? '★' : '☆'} ${e.textContent.replace('★', '').trim()}`),
    next: document.getElementById('ec-next')?.textContent, nextHidden: document.getElementById('ec-next')?.hidden,
    record: JSON.parse(localStorage.getItem('tt.blitz') || '{}'), state: B.state, bar: Math.round(B.objectiveProgress * 100),
    endVisible: !!ec && !ec.hidden, trace: window.__trace, spent,
  };
});
console.log(JSON.stringify(r, null, 1));
console.log('errors', JSON.stringify(errors));
await b.close();
