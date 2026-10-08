// The spotter on a phone: two M777s near the tower, GUNNER on the first,
// a round laid short on purpose and FIRE; prints the spotter's line as the
// round flies (SPLASH countdown) and where it fell, whether the fall mark
// stands on the ground, then NEXT GUN to the second gun.
//   node tools/spotprobe.mjs [level=westminster]  -> /tmp/out/spot-{flight,fall,next}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const W = +(process.env.W || 393), H = +(process.env.H || 852);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1');
} catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const placed = await page.evaluate(() => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.autoEngage = false;
  const o = B.primary.origin;
  B.setTarget(new T.Vector3(o.x, B.originGround + 25, o.z), 'tower');
  const got = [];
  for (const rad of [300, 340, 380, 420]) for (let a = 0; a < 360 && got.length < 2; a += 20) {
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    const known = new Set(B.units), before = B.units.length + B.pending.length;
    B.deploy('m777', p);
    if (B.units.length + B.pending.length <= before) continue;
    let u = null;
    for (let k = 0; k < 90 && !(u && u.state === 'ready'); k++) { window.__fastForward(1, 1 / 30); u = B.units.find((q) => !known.has(q) && q.alive) || null; }
    if (!u) continue;
    B.startLay(u);
    const ok = B.lay && B.lay.masonry;
    B.endLay();
    if (ok) got.push(u.id); else B.removeUnit(u);
  }
  return got;
});
console.log('guns', JSON.stringify(placed));
await page.evaluate(() => { const B = window.battle; window.unitCard.show(B.units.find((x) => x.alive)); });
await page.waitForTimeout(300);
await page.click('#uc2-lay');
await page.waitForTimeout(1500);
const read = () => page.evaluate(() => {
  const s = document.getElementById('lay-spot'), n = document.getElementById('lay-next'), B = window.battle;
  const r = (e) => { if (!e || e.hidden) return null; const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].map(Math.round); };
  return { spot: s.hidden ? '' : s.textContent, cls: s.className, spotBox: r(s), readBox: r(document.getElementById('lay-read')), next: r(n), done: r(document.getElementById('lay-done')),
    mark: B.fallMark?.visible || false, markAt: B.fallMark?.visible ? B.fallMark.position.toArray().map(Math.round) : null,
    tof: +(B.lay?.tof || 0).toFixed(2), cd: +(B.lay?.unit.cooldown || 0).toFixed(1), unit: B.lay?.unit.id };
});
console.log('laid', JSON.stringify(await read()));
// Short on purpose: drop the barrel a little.
await page.evaluate(() => { const B = window.battle; B.layTurn(0.02, -0.02); B.lay.unit.cooldown = 0; });
await page.waitForTimeout(300);
await page.evaluate(() => { const B = window.battle, f = B.onEvent; window.__spots = []; B.onEvent = (k, d) => { if (k === 'spot' || k === 'handshot' || k === 'handhit') window.__spots.push(k + ':' + (d?.text || '')); return f(k, d); }; });
await page.tap('#lay-fire');
console.log('fired', JSON.stringify(await page.evaluate(() => { const B = window.battle; return { hr: !!B.handRound, eta: B.handRound?.eta, cd: B.lay.unit.cooldown, spots: window.__spots }; })));
const trace = [];
for (let k = 0; k < 14; k++) {
  await page.evaluate(() => window.__fastForward(0.33, 1 / 30));
  await page.waitForTimeout(120);
  const r = await read();
  trace.push(`${((k + 1) * 0.33).toFixed(1)}s:${r.spot}:cd${r.cd}`);
  if (k === 2) await page.screenshot({ path: '/tmp/out/spot-flight.png' });
}
console.log('trace', trace.join(' | '));
console.log('events', JSON.stringify(await page.evaluate(() => window.__spots)));
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/out/spot-fall.png' });
console.log('fall', JSON.stringify(await read()));
await page.tap('#lay-next');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/out/spot-next.png' });
console.log('next', JSON.stringify(await read()));
console.log('errors', errors.length ? errors : 'none');
await b.close();
