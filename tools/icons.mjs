// Render the unit card icons from the game's own models.
//
//   npx vite --port 5177 --strictPort &
//   node tools/icons.mjs [m119,m777,...]
//
// Writes public/assets/icons/<id>.png, 512x320, transparent, cropped to the
// model with a margin, lit and framed the same for every unit.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const ids = (process.argv[2] || 'm119,m777,m109,m270,m142,f15,b1').split(',');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'high'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); } catch {} });
await page.goto('http://localhost:5177/?level=westminster', { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
const out = await page.evaluate(async (ids) => {
  const B = window.battle, THREE = window.THREE, R = window.engine.renderer;
  const air = await import('/src/game/aircraft.js');
  const { UNITS_BY_ID } = await import('/src/game/units.js');
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe6eef8, 0x5a5248, 2.0));
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.4); sun.position.set(-3, 5, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4); rim.position.set(4, 2.5, -3); scene.add(rim);
  const W = 1024, H = 640;
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 2000);
  const res = {};
  for (const id of ids) {
    const def = UNITS_BY_ID[id];
    let obj;
    if (def.model === 'aircraft') obj = id === 'b1' ? air.makeLancer() : air.makeEagle();
    else obj = B.models.instance(await B.models.load(def.model, def.modelLength, { tint: def.tint }));
    obj.rotation.y = def.modelYaw ?? 0;
    const g = new THREE.Group(); g.add(obj); scene.add(g); g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.hypot(size.x, size.z) * 0.5 + size.y * 0.25;
    const az = def.model === 'aircraft' ? -0.95 : -0.78, el = def.model === 'aircraft' ? 0.42 : 0.3;
    const d = (r / Math.tan((cam.fov * Math.PI) / 360)) * 0.98;
    cam.position.set(c.x + Math.sin(az) * Math.cos(el) * d, c.y + Math.sin(el) * d, c.z + Math.cos(az) * Math.cos(el) * d);
    cam.lookAt(c); cam.updateProjectionMatrix();
    const prevRT = R.getRenderTarget(); const prevAlpha = R.getClearAlpha(); const prevCol = R.getClearColor(new THREE.Color());
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(scene, cam);
    const px = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, px);
    R.setRenderTarget(prevRT); R.setClearColor(prevCol, prevAlpha);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    // crop to content with a margin, keeping 16:10
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img.data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1; const m = 0.06;
    let bw = cw * (1 + 2 * m), bh = ch * (1 + 2 * m);
    if (bw / bh < 1.6) bw = bh * 1.6; else bh = bw / 1.6;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const o = document.createElement('canvas'); o.width = 512; o.height = 320;
    o.getContext('2d').drawImage(cv, cx - bw / 2, cy - bh / 2, bw, bh, 0, 0, 512, 320);
    res[id] = o.toDataURL('image/png');
    scene.remove(g);
  }
  return res;
}, ids);
for (const [id, url] of Object.entries(out)) writeFileSync(`public/assets/icons/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', Object.keys(out).join(' '));
await b.close();
