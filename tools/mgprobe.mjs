// What the M240 teams actually do: placed round the building at a few
// distances, how many bursts each fires in thirty seconds, at what, and
// how many garrison men each one could see at all.
//
//   node tools/mgprobe.mjs <level>[,<level>...] [tier=low]
//
// Dev server on 5177. The garrison is silenced so the guns live; nothing
// else changes.
import { chromium } from 'playwright';
const [levels = 'westminster', tier = 'low'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const level of levels.split(',')) {
  const page = await b.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.addInitScript((tier) => { try {
    localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} }, tier);
  await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  const r = await page.evaluate(async () => {
    const B = window.battle, THREE = window.THREE, ff = window.__fastForward;
    B.unlockAll = true; B.freeBuild = true; B.airlift = false;
    B.airborne.auto = false;
    B.garrison.fireEnabled = false;
    ff(2);
    const S = B.primary, o = S.origin;
    const out = [];
    for (const r of [120, 200, 280, 360]) {
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.4;
        let at = null;
        for (let j = 0; j < 12 && !at; j++) {
          const aa = a + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.12;
          const q = new THREE.Vector3(o.x + Math.sin(aa) * r, 0, o.z + Math.cos(aa) * r);
          q.y = window.terrain.heightAt(q.x, q.z);
          if (B.validPlacement(q).ok) at = q;
        }
        if (!at) continue;
        const n0 = B.units.length;
        await B.deploy('m240', at);
        const u = B.units[n0];
        if (u) { u.__r = r; u.__shots = 0; out.push(u); }
      }
    }
    // Count bursts: shotsFired goes up once a burst; tally per unit by wrapping.
    const orig = B._mgRound.bind(B);
    B._mgRound = (u) => { u.__rounds = (u.__rounds || 0) + 1; if (u.mgTarget?.air) u.__air = (u.__air || 0) + 1; return orig(u); };
    const kills0 = B.defendersKilled;
    ff(30);
    const g = B.garrison;
    const from = new THREE.Vector3();
    return out.map((u) => {
      from.copy(u.pos).y += 0.6;
      let inRange = 0, seen = 0;
      for (const d of g.defenders) {
        if (!d.alive || d.pos.distanceTo(u.pos) > u.def.range) continue;
        inRange++;
        if (B._mgSees(from, d)) seen++;
      }
      return { r: u.__r, state: u.state, rounds: u.__rounds || 0, inRange, seen, kills: u.kills || 0 };
    }).concat([{ total: B.defendersKilled - kills0 }]);
  });
  console.log(level, JSON.stringify(r));
  await page.close();
}
await b.close();
