// The mortar crew through one shot and one reload, as a contact sheet: an
// M120 laid, FIRE, then a frame from beside the team every `STEP` seconds
// until the round is back over the muzzle, each labelled with the time, the
// reload's fraction, whether a round is in the loader's hands, and whether
// the shell has left the tube. Prints the same per frame.
//   node tools/loaderstrip.mjs [level=westminster]  -> /tmp/out/loaderstrip.png
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const [level = 'westminster'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const STEP = +(process.env.STEP || 0.25);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.text().startsWith('[ls]')) console.log(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const url = await page.evaluate(async (STEP) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, E = window.__engine;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = false;
  if (B.garrison) B.garrison.fireEnabled = false;
  const o = B.primary.origin;
  B.setTarget(new T.Vector3(o.x, B.originGround + 20, o.z), 'tower');
  let u = null;
  for (const rad of [220, 260, 300]) for (let a = 0; a < 360 && !u; a += 20) {
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    B.deploy('m120', p); u = B.units[B.units.length - 1];
  }
  for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  window.__lay.enter(u);
  for (let k = 0; k < 60 && u.cooldown > 0; k++) window.__fastForward(0.2, 1 / 30);
  window.__fastForward(0.5, 1 / 30);
  const cam = new T.PerspectiveCamera(40, 1.2, 0.1, 500);
  const W = 240, H = 200, cols = 6;
  const shots = [];
  let launched = -1; const projBefore = B.projectiles ? B.projectiles.length : 0;
  const oi = B._fireOne.bind(B); let t = 0;
  B._fireOne = (...a) => { const r = oi(...a); if (r && launched < 0) launched = t; return r; };
  const snap = (label) => {
    const A = u.live;
    // Beside the team, square to the line of fire, a little above.
    const yaw = u.yaw ?? 0, side = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const c = u.pos.clone().add(new T.Vector3(0, 1.0, 0));
    cam.position.copy(c).addScaledVector(side, 4.2).add(new T.Vector3(0, 0.9, 0));
    cam.lookAt(c);
    E.renderer.setRenderTarget(null);
    E.renderer.render(E.scene, cam);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(E.renderer.domElement, 0, 0, E.renderer.domElement.width, E.renderer.domElement.width / 1.2, 0, 0, W, H);
    const total = Math.max(0.01, B.lay?.reloadTotal || 1);
    const k = 1 - Math.max(0, u.cooldown) / total;
    const info = `t=${t.toFixed(2)} k=${k.toFixed(2)} hands=${A && A.round.visible ? 'ROUND' : '-'} ${launched >= 0 ? 'OUT@' + launched.toFixed(2) : 'in tube'}${label ? ' ' + label : ''}`;
    console.log('[ls] ' + info);
    shots.push({ cv, info });
  };
  snap('ready');
  B.handFire();
  const end = (B.lay?.reloadTotal || 4) + 1.2;
  while (t < end) { window.__fastForward(STEP, 1 / 60); t += STEP; snap(''); }
  const rows = Math.ceil(shots.length / cols);
  const sheet = document.createElement('canvas'); sheet.width = W * cols; sheet.height = (H + 16) * rows;
  const g = sheet.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, sheet.width, sheet.height);
  shots.forEach((s, i) => { const x = (i % cols) * W, y = Math.floor(i / cols) * (H + 16); g.drawImage(s.cv, x, y); g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(s.info.slice(0, 40), x + 3, y + H + 12); });
  return sheet.toDataURL('image/png');
}, STEP);
writeFileSync('/tmp/out/loaderstrip.png', Buffer.from(url.split(',')[1], 'base64'));
await b.close();
