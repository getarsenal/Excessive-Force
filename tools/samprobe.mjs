// The SAM sites, counted over a long fight: how many launchers each level
// gets and where, and then strikes flown one after another from minute five
// on, to see that the battery is still firing, firing more than once at an
// aeroplane it can reach, reloading, and bringing down about one in three.
//
//   node tools/samprobe.mjs [runs=12] level...
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const runs = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : 12;
const levels = args.length ? args : ['westminster'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const level of levels) {
  const page = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try {
    localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
  await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  const r = await page.evaluate((runs) => {
    const B = window.battle, S = B.sams, ff = window.__fastForward;
    if (!S) return { sams: 0 };
    B.unlockAll = true; B.freeBuild = true; B.airborne.auto = false; B.assault.auto = false;
    B.garrison.fireEnabled = false; B.invulnerable = true;
    const o = B.primary.origin;
    const out = {
      sams: S.launchers.length, radar: !!S.radar,
      at: S.launchers.map((l) => [Math.round(l.x), Math.round(l.z), Math.round(Math.hypot(l.x - o.x, l.z - o.z))]),
      bearings: S.launchers.map((l) => Math.round((Math.atan2(l.x - o.x, l.z - o.z) * 180) / Math.PI)),
    };
    const ev = { samlaunch: 0, samkill: 0, sammiss: 0 };
    const prev = S.onEvent;
    S.onEvent = (k, d) => { if (k in ev) ev[k]++; prev(k, d); };
    // Five minutes in: past where the battery used to go quiet.
    ff(300, 1 / 10);
    let reloads = 0, perPlane = [];
    const wasEmpty = new Set();
    for (let i = 0; i < runs; i++) {
      const aim = o.clone(); aim.y = B.primary.groundY + 10;
      const before = ev.samlaunch;
      const s = B.callStrike(i % 3 === 2 ? 'b1' : 'f15', aim);
      for (let k = 0; k < 40 * 15; k++) {
        ff(1 / 15, 1 / 15);
        S.launchers.forEach((l, j) => { if (l.rounds <= 0) wasEmpty.add(j); else if (wasEmpty.has(j)) { wasEmpty.delete(j); reloads++; } });
        if (s && (s.done || s.downed) && !S.missiles.length) break;
      }
      perPlane.push(ev.samlaunch - before);
      ff(6, 1 / 10);
    }
    return { ...out, runs, ...ev, reloads, perPlane: perPlane.join(','), quiet: S.quiet, elapsed: Math.round(B.elapsed) };
  }, runs);
  console.log(JSON.stringify({ level, ...r, errors }));
  await page.close();
}
await b.close();
