// A street of the surveyed town from close in, as a player sees it with the
// camera down among the guns: the facade tile and its relief at the size
// they are judged by. Finds the tallest surveyed building within 150 m of
// the landmark, stands 28 m off its front, and photographs it; then the
// same from 90 m.
//
//   node tools/facadeshot.mjs [level]        -> /tmp/out/town/facade-<level>-{near,mid}.png
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 800, height: 450 } });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(3000);
for (const [name, dist] of [['near', 28], ['mid', 90]]) {
  const info = await page.evaluate((dist) => {
    const B = window.battle, rig = window.__rig, o = B.primary.origin, T = window.THREE;
    B.airborne.auto = false; B.assault.auto = false;
    document.getElementById('ui')?.style.setProperty('visibility', 'hidden');
    const ctx = window.__engine.scene.getObjectByName('context');
    // The tallest of the forty buildings nearest the landmark (the
    // exclusion radius can be three hundred metres).
    const plots = (ctx?.userData.plots || []).filter((p) => p.h > 6)
      .sort((a, b) => Math.hypot(a.x - o.x, a.z - o.z) - Math.hypot(b.x - o.x, b.z - o.z)).slice(0, 40);
    plots.sort((a, b) => b.h - a.h);
    const p = plots[0];
    if (!p) return null;
    // Stand on the side of the building that faces the landmark.
    const dx = o.x - p.x, dz = o.z - p.z, L = Math.hypot(dx, dz) || 1;
    const front = new T.Vector3(p.x + dx / L * (Math.max(p.w, p.d) / 2 + 2), p.base + Math.min(p.h, 12) * 0.5, p.z + dz / L * (Math.max(p.w, p.d) / 2 + 2));
    rig.focus(front, dist);
    rig.desiredYaw = rig.yaw = Math.atan2(dx, dz) + Math.PI;
    rig.desiredPitch = rig.pitch = 0.18;
    rig.update?.(5);
    for (let k = 0; k < 10; k++) window.__frame();
    return { name: p.name || '', h: Math.round(p.h), w: Math.round(p.w), d: Math.round(p.d) };
  }, dist);
  console.log(name, JSON.stringify(info));
  // The canvas read straight after a driven frame: a page screenshot waits
  // on the compositor, which the software rasteriser starves at close range.
  const data = await page.evaluate(() => { window.__frame(); return document.querySelector('canvas').toDataURL('image/png'); });
  writeFileSync(`/tmp/out/town/facade-${level}-${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
}
await b.close();
