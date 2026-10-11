// The line of guns after a lost finger. Loads a level on a phone, arms the
// AT4, plants a phantom touch (a pointerdown whose pointerup never comes, as
// when the system takes a gesture), then drags a line with a fresh touch and
// counts what went down. Before the fix the phantom made every later drag a
// two-finger gesture and the line placed nothing.
//   node tools/lineprobe.mjs [level=westminster] [port=5177]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', port = process.argv[3] || process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(async (NOLIFT) => {
  const B = window.battle, T = window.THREE, cam = window.__engine.camera, canvas = window.__engine.renderer.domElement;
  B.airlift = !NOLIFT; B.money = 1e6; B.invulnerable = true;
  const U = (await import('/src/game/units.js')).UNITS_BY_ID.at4;
  const rig = window.__rig;
  const r = canvas.getBoundingClientRect();
  // Open ground on screen, in the band the thumb works: two points eighty
  // pixels apart that are both ground the AT4 may stand on.
  const okAt = (x, y) => { const g = rig._screenToGround(x, y, new T.Vector3()); return g && B.validPlacement(new T.Vector3(g.x, window.terrain.heightAt(g.x, g.z), g.z), U).ok; };
  // Three rows, well apart, each a 200-pixel strip of open ground.
  const rows = [];
  for (let y = r.top + r.height * 0.8; y > r.top + r.height * 0.25 && rows.length < 3; y -= 12) {
    if (rows.length && rows[rows.length - 1].y - y < 70) continue;
    for (let x = r.left + 20; x < r.right - 220; x += 20) {
      if ([0, 50, 100, 150, 200].every((k) => okAt(x + k, y))) { rows.push({ x, y }); break; }
    }
  }
  const a = rows[0];
  if (!a) return { error: 'no open ground on screen' };
  const fire = (type, id, x, y, primary) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: primary, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  const drag = async (id, row, primary = true) => {
    const a = row, bpt = { x: row.x + 200, y: row.y };
    const before = B.units.length + B.pending.length;
    fire('pointerdown', id, a.x, a.y, primary);
    for (let k = 1; k <= 8; k++) { fire('pointermove', id, a.x + (bpt.x - a.x) * k / 8, a.y + (bpt.y - a.y) * k / 8, primary); await new Promise((r) => setTimeout(r, 400)); }
    await new Promise((r) => setTimeout(r, 200));
    fire('pointerup', id, bpt.x, bpt.y, primary);
    await new Promise((r) => setTimeout(r, 1500));
    return B.units.length + B.pending.length - before;
  };
  const dbg = { lp: [], moves: 0 };
  const lp0 = B.linePlacements.bind(B); B.linePlacements = (...a) => { const r = lp0(...a); dbg.lp.push(r.length); return r; };
  canvas.addEventListener('pointermove', () => dbg.moves++);
  B.selectedUnitId = 'at4';
  if (rows.length < 3) return { error: 'three rows of open ground not found', rows };
  const clean = await drag(11, rows[0]);
  // The phantom: down, and no up, ever.
  fire('pointerdown', 21, 30, 400, true);
  B.selectedUnitId = 'at4';
  const afterPhantom = await drag(22, rows[1]);
  // The browser too thinks the stolen finger is down, so the next touch is
  // not primary; the glass then reports itself empty.
  fire('pointerdown', 31, 30, 420, true);
  canvas.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
  B.selectedUnitId = 'at4';
  const again = await drag(23, rows[2], false);
  return { rows, clean, afterPhantom, again, dbg };
}, !!process.env.NOLIFT);
console.log(JSON.stringify(out));
const ok = out.clean > 1 && out.afterPhantom > 1 && out.again > 1;
console.log(ok ? 'PASS a line goes down after a lost finger' : 'FAIL');
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close();
process.exit(ok ? 0 : 1);
