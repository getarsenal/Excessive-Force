// Boot Camp's first shot: a battery already laid when the level opens, a
// tap on the tower's cab, and what comes down. Loads the tutorial with the
// walkthrough skipped, puts KIND x N on the ground (no airlift), designates
// the stones of one tag, steps the fight and prints, a second at a time, the
// rounds fired, impacts, stones of that tag still standing and the bar.
//   KIND=m777 N=4 TAG=cab AIM=base|middle SECS=30 node tools/firstboomprobe.mjs [port=5178]
import { chromium } from 'playwright';
const port = process.argv[2] || process.env.TT_PORT || 5178;
const kind = process.env.KIND || 'm777', n = +(process.env.N || 4), tag = process.env.TAG || 'cab', secs = +(process.env.SECS || 30);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=tutorial`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1000);
const out = await page.evaluate(async ({ kind, n, tag, secs, aimAt }) => {
  window.__tutorial?.finish?.('skipped');
  const B = window.battle, T = window.THREE, s = B.primary;
  const t = window.__tutorial;
  B.airlift = false; B.invulnerable = true;
  if (B.garrison) B.garrison.fireEnabled = false;
  const of = [];
  for (let i = 0; i < s.count; i++) if (s.tagOf[i] === tag) of.push(i);
  // Standing is still where it was laid: fallen stone lives on as rubble.
  const rest = new Map(of.map((i) => [i, s.py[i]]));
  const standing = () => of.filter((i) => (s.flags[i] & 1) && Math.abs(s.py[i] - rest.get(i)) < 1).length;
  let cx = 0, cy = 0, cz = 0;
  for (const i of of) { cx += s.px[i]; cy += s.py[i]; cz += s.pz[i]; }
  // AIM=base lays on the foot of it, two metres up, where a shell cuts it.
  let ylo = Infinity;
  for (const i of of) ylo = Math.min(ylo, s.py[i]);
  const aim = new T.Vector3(cx / of.length, aimAt === 'base' ? ylo + 2 : cy / of.length, cz / of.length);
  // The battery where the walkthrough would put one: a row off the tower's flank.
  const o = s.origin, yaw = window.__level?.camera?.yaw ?? 0.5;
  const sx = Math.cos(yaw), sz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
  let placed = 0;
  for (let k = 0; placed < n && k < 40; k++) {
    const r = -150 - placed * 14, f = 40 + (k % 3) * 10;
    const x = o.x + fx * f + sx * r, z = o.z + fz * f + sz * r;
    if (await B.deploy(kind, new T.Vector3(x, window.terrain.heightAt(x, z), z))) placed++;
  }
  const rows = [];
  const fired0 = B.roundsFired || 0;
  let first = null;
  B.setTarget(aim, 'cab');
  for (let sec = 0; sec < secs; sec++) {
    for (let k = 0; k < 4; k++) window.__fastForward(0.25, 1 / 30);
    if (sec % 10 === 9) window.__frame();
    const st = standing();
    if (first == null && st < of.length) first = sec + 1;
    rows.push({ t: sec + 1, fired: (B.roundsFired || 0) - fired0, ready: B.units.filter((u) => u.state === 'ready').length, standing: st, bar: +(B.progress ?? 0).toFixed(3) });
    await new Promise((r) => setTimeout(r, 2));
  }
  return { tagStones: of.length, aim: aim.toArray().map((v) => +v.toFixed(1)), placed, firstLoss: first, rows };
}, { kind, n, tag, secs, aimAt: process.env.AIM || 'middle' });
console.log(kind, 'x', out.placed, 'on', tag, out.tagStones, 'stones at', JSON.stringify(out.aim), '· first stone lost at', out.firstLoss, 's');
for (const r of out.rows) if (r.t % 3 === 0) console.log(JSON.stringify(r));
console.log('errors', JSON.stringify(errors));
await b.close();
