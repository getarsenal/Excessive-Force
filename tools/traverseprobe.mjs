// A gun given a target off its bearing: it traverses at its own rate, its
// barrel comes up toward the shot as it turns, and it fires only when laid;
// the round leaves the barrel's end where the gun then points. Prints the
// yaw and barrel elevation every half second, the moment of the shot, and
// the shell's start against the drawn muzzle.
//   node tools/traverseprobe.mjs [kinds=m777,m109,m270] [offsetDeg=90]
import { chromium } from 'playwright';
const kinds = (process.argv[2] || 'm777,m109,m270').split(','), off = +(process.argv[3] || 90);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(async ([kinds, off]) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true;
  const shots = [];
  const of = B.projectiles.fire.bind(B.projectiles);
  B.projectiles.fire = (o) => { shots.push({ pos: o.pos.clone(), owner: o.owner, t: window.__t }); return of(o); };
  const out = [];
  let x = -100;
  for (const kind of kinds) {
    x += 60;
    const p = new T.Vector3(x, terrain.heightAt(x, 40), 40);
    B.deploy(kind, p); const u = B.units[B.units.length - 1];
    for (let k = 0; k < 160 && !(u.model && u.state === 'ready'); k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
    // Hold fire, face down the range, then give it a mark `off` degrees round.
    u.cooldown = 1e9; u.yaw = u.wantYaw = Math.PI; u.group.rotation.y = u.yaw;
    const a = Math.PI + off * Math.PI / 180, d = 420;
    const mark = new T.Vector3(p.x + Math.sin(a) * d, 0, p.z + Math.cos(a) * d); mark.y = terrain.heightAt(mark.x, mark.z) + 2;
    const keep = B.aimFor.bind(B); B.aimFor = (uu) => uu === u ? mark.clone() : keep(uu);
    u.cooldown = 0; window.__t = 0; const n0 = shots.length;
    const rows = []; let fired = null;
    for (let i = 0; i < 160 && !fired; i++) {
      window.__fastForward(0.05, 1 / 60); window.__t += 0.05;
      const s = shots.slice(n0).find((q) => q.owner === u);
      if (s) fired = s;
      if (i % 10 === 9) rows.push(`${window.__t.toFixed(1)}s yaw ${((u.yaw - Math.PI) * 57.3).toFixed(0)}° barrel ${u.barrelB ? (u.barrelElev * 57.3).toFixed(0) + "°" : "-"}`);
    }
    B.aimFor = keep;
    u.cooldown = 1e9;
    let gap = null;
    if (fired) { const m = B._muzzle(u); gap = +m.distanceTo(fired.pos).toFixed(2); }
    out.push({ kind, rate: u.def.traverse, firedAt: fired ? +fired.t.toFixed(2) : null, expect: +(off * Math.PI / 180 / (u.def.traverse || 2)).toFixed(2), startVsMuzzle: gap, rows });
  }
  return out;
}, [kinds, off]);
for (const row of r) { console.log(JSON.stringify({ ...row, rows: undefined })); console.log('  ' + row.rows.join(' | ')); }
await b.close();
