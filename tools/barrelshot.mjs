// Each gun's barrel as the game cuts it out of the model (barrel.js): every
// cannon put down on the range, photographed from its left side at rest,
// level, at forty degrees (or its own top) and run back on its recoil, the
// barrel tinted red in the first frame so a bad cut shows; a contact sheet,
// and per gun the triangles cut, the rest elevation and where the round
// leaves against where the drawn barrel ends.
//   node tools/barrelshot.mjs [kinds=m119,m777,m109,stryker]  -> /tmp/out/barrels.png
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const kinds = (process.argv[2] || 'm119,m777,m109,stryker').split(',');
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.text().startsWith('[bs]')) console.log(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
await page.evaluate((c) => { globalThis.__CLOSE = c; }, !!process.env.CLOSE);
const url = await page.evaluate(async (kinds) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, E = window.__engine;
  B.freeBuild = true; B.unlockAll = true;
  const W = 300, H = 200, frames = [];
  // The renderer's own aspect (a phone, upright), and a band of it cropped out: no stretch.
  const cv0 = E.renderer.domElement;
  const cam = new T.PerspectiveCamera(56, cv0.width / cv0.height, 0.2, 800);
  let x = -130;
  for (const kind of kinds) {
    x += 55;
    const p = new T.Vector3(x, terrain.heightAt(x, 30), 30);
    B.deploy(kind, p); const u = B.units[B.units.length - 1];
    for (let k = 0; k < 120 && !(u.model && u.state === 'ready'); k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
    u.yaw = Math.PI; u.group.rotation.y = u.yaw;
    const BB = u.barrelB;
    if (!BB) { console.log('[bs] ' + kind + ' NO BARREL'); continue; }
    const len = u.def.modelLength;
    const shoot = (label, elev, recoil, red) => {
      u.barrelElev = u.barrelWant = elev; u.recoilT = recoil;
      B._updateBarrel(u, 0);
      const mats = [];
      if (red) u.barrel.traverse((m) => { if (m.isMesh) { mats.push([m, m.material]); m.material = new T.MeshBasicMaterial({ color: 0xff2020 }); } });
      u.group.updateMatrixWorld(true);
      // From the gun's left, square on, a little above.
      // CLOSE=1: the front half, three-quarter on from the left, for the joint at the trunnions.
      if (globalThis.__CLOSE) {
        cam.position.set(u.pos.x - len * 0.75, u.pos.y + len * 0.42, u.pos.z - len * 0.55);
        cam.lookAt(u.pos.x, u.pos.y + len * 0.22, u.pos.z - len * 0.12);
      } else {
        cam.position.set(u.pos.x - len * 2.3, u.pos.y + len * 0.3, u.pos.z - len * 0.12);
        cam.lookAt(u.pos.x, u.pos.y + len * 0.2, u.pos.z - len * 0.12);
      }
      E.renderer.setRenderTarget(null);
      E.renderer.render(E.scene, cam);
      // The round's start, drawn as a dot on the frame.
      const m = B._muzzle(u).project(cam);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const src = E.renderer.domElement;
      g.drawImage(src, 0, (src.height - src.width * H / W) / 2, src.width, src.width * H / W, 0, 0, W, H);
      const bandH = src.width * H / W, off = (src.height - bandH) / 2;
      g.fillStyle = '#00e5ff'; g.beginPath(); g.arc((m.x + 1) / 2 * W, ((1 - m.y) / 2 * src.height - off) * H / bandH, 4, 0, 6.3); g.fill();
      g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(`${kind} ${label}`, 4, 14);
      for (const [mm, mat] of mats) mm.material = mat;
      frames.push(cv);
    };
    shoot(`rest ${(BB.rest * 57.3).toFixed(0)}°`, BB.rest, 0, true);
    shoot('level', 0, 0, false);
    const top = Math.min(BB.max, 0.7);
    shoot(`${(top * 57.3).toFixed(0)}°`, top, 0, false);
    shoot('recoil', Math.min(BB.max, 0.35), 1, false);
    console.log('[bs] ' + JSON.stringify({ kind, cut: BB.cut, rest: +(BB.rest * 57.3).toFixed(1), len: u.def.barrel.len, pivot: BB.pivot.map((q) => +q.toFixed(2)) }));
  }
  const cols = 4, rows = Math.ceil(frames.length / cols);
  const sheet = document.createElement('canvas'); sheet.width = W * cols; sheet.height = H * rows;
  const g = sheet.getContext('2d');
  frames.forEach((f, i) => g.drawImage(f, (i % cols) * W, Math.floor(i / cols) * H));
  return sheet.toDataURL('image/png');
}, kinds);
writeFileSync('/tmp/out/barrels.png', Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote /tmp/out/barrels.png');
await b.close();
