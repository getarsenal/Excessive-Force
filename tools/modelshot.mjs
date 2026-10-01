// Render a procedural unit model alone, from three sides, to a PNG.
//
//   node tools/modelshot.mjs makeApache makeStryker      -> /tmp/out/<name>.png
//   TT_PORT=5181 OUT=/tmp/out-a node tools/modelshot.mjs makeTomahawk
//   VIEWS='[[1,0.1,0],[0,-1,0.2],[-1,0.3,1]]' ZOOM=0.5 AT='[0,1.3,-3]' node tools/modelshot.mjs makeWarthog
//     three camera directions, a closer distance, and a point to look at
//
// Needs the dev server up. It puts a bare probe page in `public/` for the
// duration and takes it away after, so do not run it while a suite is in
// flight: the dev server reloads every client when the file appears.
// Views: three-quarter front from above, the side, and straight down.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const names = process.argv.slice(2);
if (!names.length) { console.error('name at least one builder, e.g. makeApache'); process.exit(1); }
const out = process.env.OUT || '/tmp/out';
const port = process.env.TT_PORT || 5177;
fs.mkdirSync(out, { recursive: true });

// Which module each builder lives in.
const MODULE = (fn) => (fn === 'makeStryker' ? 'vehicles' : 'aircraft');

const probe = path.resolve('public/probe.html');
fs.writeFileSync(probe, '<!doctype html><html><body style="margin:0"><canvas id="c" width="1500" height="500"></canvas></body></html>');
try {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 500 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(`http://localhost:${port}/probe.html`, { waitUntil: 'load' });
  for (const fn of names) {
    await page.evaluate(async ([mod, fn, viewsEnv, zoom, atEnv]) => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const M = await import(`/src/game/${mod}.js`);
      if (typeof M[fn] !== 'function') throw new Error(`${mod}.js has no ${fn}`);
      const model = M[fn]();
      const canvas = document.getElementById('c');
      const r = new THREE.WebGLRenderer({ canvas, antialias: true });
      r.setSize(1500, 500, false);
      r.setScissorTest(true);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x8fb3d9);
      scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x5a5040, 0.9));
      const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
      sun.position.set(30, 50, 20);
      scene.add(sun);
      scene.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const R = Math.max(size.x, size.y, size.z) * 1.15 * zoom;
      if (atEnv) c.fromArray(JSON.parse(atEnv));
      const views = viewsEnv ? JSON.parse(viewsEnv) : [[0.8, 0.5, 1.0], [1.4, 0.15, 0.0], [0.05, 1.5, 0.05]];
      views.forEach((v, k) => {
        const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
        cam.position.set(c.x + v[0] * R, c.y + v[1] * R, c.z + v[2] * R);
        cam.lookAt(c);
        r.setViewport(k * 500, 0, 500, 500);
        r.setScissor(k * 500, 0, 500, 500);
        r.render(scene, cam);
      });
      r.dispose();
    }, [MODULE(fn), fn, process.env.VIEWS || '', +(process.env.ZOOM || 1), process.env.AT || '']);
    const file = `${out}/${fn}${process.env.TAG ? '-' + process.env.TAG : ''}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
} finally {
  fs.rmSync(probe, { force: true });
}
