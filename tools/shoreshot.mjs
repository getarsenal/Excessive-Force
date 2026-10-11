// The waterfront, photographed: walks out from the landmark in a spiral to
// the nearest few points where dry ground meets the water, and shoots each
// from sixty metres and from a hundred and sixty, looking along the shore.
// Writes /tmp/out/shore/<level>-<k>-near.png and -far.png.
//   node tools/shoreshot.mjs [level=sydney] [count=3] [port=5177]   TIER=low|medium
import { chromium } from 'playwright';
import fs from 'node:fs';
const level = process.argv[2] || 'sydney', count = +(process.argv[3] || 3), port = process.argv[4] || process.env.TT_PORT || 5177;
const out = '/tmp/out/shore';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 852, height: 480 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript((tier) => { try { localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, process.env.TIER || 'medium');
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.addStyleTag({ content: '#ui, #hud, .hud, #topbar, #dock { display: none !important; }' });
const spots = await page.evaluate((count) => {
  const t = window.terrain, o = window.battle.primary.origin, found = [];
  for (let r = 60; r < 900 && found.length < count; r += 15) {
    for (let k = 0; k < 48 && found.length < count; k++) {
      const a = (k / 48) * Math.PI * 2, x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r;
      if (t.isWater(x, z)) continue;
      // Wet within ten metres, and which way.
      let wx = 0, wz = 0, n = 0;
      for (let j = 0; j < 8; j++) { const b = (j / 8) * Math.PI * 2; if (t.isWater(x + Math.cos(b) * 10, z + Math.sin(b) * 10)) { wx += Math.cos(b); wz += Math.sin(b); n++; } }
      if (!n) continue;
      if (found.some((f) => Math.hypot(f.x - x, f.z - z) < 200)) continue;
      found.push({ x, z, y: t.heightAt(x, z), yaw: Math.atan2(wx, wz) });
    }
  }
  return found;
}, count);
for (let i = 0; i < spots.length; i++) {
  for (const [name, dist, pitch] of [['near', 60, 0.38], ['far', 160, 0.55]]) {
    await page.evaluate(({ s, dist, pitch }) => {
      const rig = window.__rig, T = window.THREE;
      rig.desiredTarget.set(s.x, s.y, s.z); rig.target?.copy?.(rig.desiredTarget);
      rig.desiredDistance = rig.distance = dist;
      rig.desiredPitch = rig.pitch = pitch;
      // Look along the shore: the water off to one side.
      rig.desiredYaw = rig.yaw = s.yaw + Math.PI / 2;
      if (window.__frame) for (let k = 0; k < 4; k++) window.__frame();
    }, { s: spots[i], dist, pitch });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${level}-${i}-${name}.png`, timeout: 120000 });
  }
  console.log(i, JSON.stringify(spots[i]));
}
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close();
