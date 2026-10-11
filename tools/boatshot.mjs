// Every boat kind on one sheet, each on a patch of water at y 0 from the
// angle the game sees it (three-quarter, thirty degrees down), with its
// triangle count. Writes /tmp/out/boats.png (or OUT/boats-TAG.png).
//   node tools/boatshot.mjs [kinds...]      TAG=before  CLOSE=1 (a lower, nearer look)
// Needs the dev server; puts a bare probe page in public/ for the duration,
// so not while a suite runs against the same server.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const port = process.env.TT_PORT || 5177, out = process.env.OUT || '/tmp/out';
fs.mkdirSync(out, { recursive: true });
const probe = path.resolve('public/boatprobe.html');
fs.writeFileSync(probe, '<!doctype html><html><body style="margin:0;background:#000"><canvas id="c"></canvas></body></html>');
try {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const W = 1500, cols = 5, tile = W / cols;
  const page = await browser.newPage({ viewport: { width: W, height: 1200 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(`http://localhost:${port}/boatprobe.html`, { waitUntil: 'load' });
  const res = await page.evaluate(async ({ only, W, cols, tile, close }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const C = await import('/src/world/craft.js');
    const kinds = only.length ? only : C.CRAFT_KINDS;
    const rows = Math.ceil(kinds.length / cols);
    const H = rows * tile;
    const canvas = document.getElementById('c');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setSize(W, H, false);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    r.setScissorTest(true);
    const info = [];
    kinds.forEach((kind, k) => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xa9c4dc);
      scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x5a5040, 0.9));
      const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
      sun.position.set(30, 50, 20);
      scene.add(sun);
      const craft = C.buildCraft(kind);
      const mesh = new THREE.Mesh(craft.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, side: THREE.DoubleSide }));
      scene.add(mesh);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x2f5f7a, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.82 }));
      scene.add(water);
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const R = Math.max(size.x, size.y, size.z) * (close ? 1.0 : 1.35);
      const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 3000);
      const pitch = close ? 0.25 : 0.52;
      cam.position.set(c.x + R * 1.3 * Math.cos(pitch) * 0.7, c.y + R * 1.3 * Math.sin(pitch), c.z + R * 1.3 * Math.cos(pitch) * 0.7);
      cam.lookAt(c.x, Math.max(0, c.y * 0.5), c.z);
      const col = k % cols, row = Math.floor(k / cols);
      const y = H - (row + 1) * tile;
      r.setViewport(col * tile, y, tile, tile);
      r.setScissor(col * tile, y, tile, tile);
      r.render(scene, cam);
      const tris = (craft.geo.index ? craft.geo.index.count : craft.geo.attributes.position.count) / 3;
      info.push({ kind, tris, len: +size.z.toFixed(1), x: col * tile, y: row * tile });
    });
    // Labels.
    for (const i of info) {
      const d = document.createElement('div');
      d.textContent = `${i.kind} · ${i.tris} tris`;
      Object.assign(d.style, { position: 'absolute', left: i.x + 6 + 'px', top: i.y + 4 + 'px', font: '600 14px sans-serif', color: '#102030', background: 'rgba(255,255,255,0.6)', padding: '1px 4px' });
      document.body.appendChild(d);
    }
    return { H, info };
  }, { only: process.argv.slice(2), W, cols, tile, close: !!process.env.CLOSE });
  await page.setViewportSize({ width: W, height: Math.ceil(res.H) });
  const file = `${out}/boats${process.env.TAG ? '-' + process.env.TAG : ''}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
  for (const i of res.info) console.log(i.kind.padEnd(14), String(i.tris).padStart(5), 'tris', i.len, 'm');
  await browser.close();
} finally {
  fs.rmSync(probe, { force: true });
}
