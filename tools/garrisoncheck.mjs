// Every defender on a level: what he stands on, whether he is inside a stone,
// and whether he can see out — the questions "the defenders are random" is
// asking, answered per man.
//
//   node tools/garrisoncheck.mjs <level> [tier]
import { chromium } from 'playwright';

const [level, tier = 'low'] = process.argv.slice(2);
if (!level) { console.error('usage: node tools/garrisoncheck.mjs <level> [tier]'); process.exit(2); }
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.addInitScript((t) => {
  localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.suite', '0');
}, tier);
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`);
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 300000 });
await page.waitForTimeout(3000);
const rows = await page.evaluate(() => {
  const { garrison, physics, terrain, structures, THREE } = window;
  const R = physics.rapier;
  const out = [];
  for (const d of garrison.defenders) {
    if (!d.alive && d.alive !== undefined) continue;
    const p = d.pos;
    // Down: the first thing under his feet.
    let under = Infinity;
    for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      const ray = new R.Ray({ x: p.x + ox, y: p.y + 0.4, z: p.z + oz }, { x: 0, y: -1, z: 0 });
      const hit = physics.world.castRay(ray, 60, true);
      if (hit) under = Math.min(under, (hit.timeOfImpact ?? hit.toi) - 0.4);
    }
    const ground = terrain.heightAt(p.x, p.z);
    // Inside a stone: any standing stone whose box contains his chest.
    let inside = false;
    for (const st of structures) {
      for (let i = 0; i < st.count && !inside; i++) {
        if (!(st.flags[i] & 1)) continue;
        const dx = p.x - st.px[i], dz = p.z - st.pz[i], dy = p.y + 1.0 - st.py[i];
        if (Math.abs(dy) > st.hy[i]) continue;
        const c = Math.cos(st.ry[i]), s = Math.sin(st.ry[i]);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < st.hx[i] - 0.05 && Math.abs(lz) < st.hz[i] - 0.05) inside = true;
      }
    }
    out.push({ type: d.type, cover: d.cover, x: +p.x.toFixed(1), y: +(p.y - ground).toFixed(1), z: +p.z.toFixed(1), under: +under.toFixed(2), inside, blind: !!d.blind });
  }
  return out;
});
let bad = 0;
for (const r of rows) {
  // A man at ground level is on the ground, whatever a ray makes of the trench he is in.
  const onGround = Math.abs(r.y) < 1.0;
  const floating = r.under > 0.6 && !onGround, sunk = r.under < -0.3 && !onGround;
  const flag = [floating && 'FLOATING', sunk && 'SUNK', r.inside && 'INSIDE STONE', r.blind && 'blind'].filter(Boolean).join(' ');
  if (floating || sunk || r.inside) bad++;
  console.log(`${r.type.padEnd(9)} ${String(r.cover).padEnd(7)} (${r.x}, ${r.z}) ${r.y} m over the ground, ${r.under} m to what is under him ${flag}`);
}
console.log(`${rows.length} defenders, ${bad} misplaced`);
await browser.close();
process.exit(bad ? 1 : 0);
