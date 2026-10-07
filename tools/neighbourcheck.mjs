// Two fire teams laid as close as the placement allows, the first taken
// in hand: is the second hidden from the gunner's eye, and back on DONE?
//   node tools/neighbourcheck.mjs [level=westminster] [kind=gustaf]
import { chromium } from 'playwright';
const [level = 'westminster', kind = 'gustaf'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const r = await page.evaluate(async (kind) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = false;
  if (B.garrison) B.garrison.fireEnabled = false;
  B.setTarget(new T.Vector3(o.x, B.originGround + 20, o.z), 'tower');
  let a = null, c = null;
  for (const rad of [180, 220, 260]) for (let ang = 0; ang < 360 && !c; ang += 15) {
    const x = o.x + Math.cos(ang * Math.PI / 180) * rad, z = o.z + Math.sin(ang * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    // The neighbour as near as the placement lets him stand, to the right of the line of fire.
    const yaw = Math.atan2(o.x - x, o.z - z), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let q = null;
    for (let d = 2.6; d < 4 && !q; d += 0.2) { const t = new T.Vector3(x + rx * d, 0, z + rz * d); t.y = terrain.heightAt(t.x, t.z); if (B.validPlacement(t, null).ok) q = t; }
    if (!q) continue;
    B.deploy(kind, p); a = B.units[B.units.length - 1];
    B.deploy(kind, q); c = B.units[B.units.length - 1];
  }
  if (!c) return { noUnit: true };
  for (let k = 0; k < 40 && (a.state !== 'ready' || c.state !== 'ready'); k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 20)); }
  window.__lay.enter(a); window.__frame();
  const eye = window.rig.camera.position.clone();
  const during = { ownHidden: !a.group.visible, neighbourHidden: !c.group.visible, dist: +c.pos.distanceTo(eye).toFixed(2) };
  window.__lay.exit(); window.__frame();
  return { during, after: { ownBack: a.group.visible, neighbourBack: c.group.visible } };
}, kind);
console.log(JSON.stringify(r));
await b.close();
