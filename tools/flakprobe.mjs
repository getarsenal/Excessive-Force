// The suite's flak check on its own, with the reasons: an F-15 called 900 m
// off the landmark, three seconds run, and each quarter second what the
// live flak sees — the air targets, the slant range against its reach,
// whether the town blocks it — and the garrison's air shots.
//   TT_PORT=5177 node tools/flakprobe.mjs sydney
import { chromium } from 'playwright';
const level = process.argv[2] || 'sydney';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 600 } });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.__fastForward, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const B = window.battle, g = B.garrison, T = window.THREE;
  B.airborne.auto = false; B.assault.auto = false;
  const flak = g.defenders.filter((d) => d.alive && d.def.flak);
  const out = { flak: flak.map((d) => ({ pos: d.pos.toArray().map((v) => +v.toFixed(1)), muzzle: d.muzzle?.toArray().map((v) => +v.toFixed(1)), air: d.def.air, reach: d.def.airRange || d.def.range, cover: d.cover })), ticks: [] };
  B.unlockAll = true; B.freeBuild = true;
  const away = new T.Vector3(B.primary.origin.x + 900, B.originGround, B.primary.origin.z + 900);
  const before = g.airShots;
  const sortie = B.callStrike('f15', away);
  out.sortie = !!sortie;
  if (sortie) sortie.releaseAt = Infinity;
  for (let k = 0; k < 12; k++) {
    window.__fastForward(0.25);
    const targets = B.air?.airTargets ? B.air.airTargets([]) : [];
    const d = flak[0];
    const t = targets.map((t) => {
      const dx = t.pos.x - d.muzzle.x, dy = t.pos.y - d.muzzle.y, dz = t.pos.z - d.muzzle.z;
      return { kind: t.kind, heli: !!t.heli, slant: Math.round(Math.hypot(dx, dy, dz)), dy: Math.round(dy),
        blocked: g.city ? !!g.city.blocks(d.muzzle, t.pos) : null };
    });
    out.ticks.push({ k, shots: g.airShots - before, alive: d.alive, targets: t, sortieAlive: sortie ? !!sortie.alive : null, sPos: sortie?.pos ? sortie.pos.toArray().map((v) => Math.round(v)) : null });
  }
  return out;
});
console.log(JSON.stringify(r.flak)); console.log('sortie', r.sortie);
for (const t of r.ticks) console.log(t.k, 'shots', t.shots, 'alive', t.alive, 'sortie', t.sortieAlive, t.sPos, JSON.stringify(t.targets));
await b.close();
