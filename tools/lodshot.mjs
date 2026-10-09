// The far models (units.js `lightModel`) against the full ones, on their
// own: each gun loaded as a deployed one is (barrel cut, far copy made),
// set on a plain ground in a lit scene of its own, and photographed full
// and far, from DIST metres (default 110, past LOD_DIST: what the game
// actually shows) and close (what it would look like if the switch were
// wrong). A contact sheet, one row a gun: full@DIST, far@DIST, full close,
// far close; and the triangles of each.
//   DIST=110 node tools/lodshot.mjs [kinds=m777,m109,stryker,m142,m270,m119]  -> /tmp/out/lod-sheet.png
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const kinds = (process.argv[2] || 'm777,m109,stryker,m142,m270,m119').split(',');
const DIST = +(process.env.DIST || 110);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 600, height: 400 } });
await page.addInitScript(() => { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const res = await page.evaluate(async ([kinds, D]) => {
  const B = window.battle, T = window.THREE, R = window.__engine.renderer;
  window.requestAnimationFrame = () => 0;   // the live loop stops; this is a studio
  const defs = Object.fromEntries((await import('/src/game/units.js')).UNITS.map((u) => [u.id, u]));
  const scene = new T.Scene();
  scene.background = new T.Color(0xb9c6cf);
  scene.add(new T.HemisphereLight(0xdfe8ef, 0x6b6150, 1.4));
  const sun = new T.DirectionalLight(0xfff0d8, 2.4); sun.position.set(-30, 50, 40); scene.add(sun);
  const ground = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ color: 0x8c8068, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const W = 260, H = 170, cols = 4;
  const sheet = document.createElement('canvas'); sheet.width = W * cols; sheet.height = H * kinds.length;
  const g = sheet.getContext('2d');
  const cam = new T.PerspectiveCamera(52, W / H, 0.5, 2000);
  const size = R.getSize(new T.Vector2());
  R.setSize(W, H, false);
  const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh && m.visible) { const ge = m.geometry; n += (ge.index ? ge.index.count : ge.attributes.position.count) / 3; } }); return Math.round(n); };
  const out = [];
  for (let r = 0; r < kinds.length; r++) {
    const d = defs[kinds[r]];
    const w = await B.models.load(d.modelFile || d.model, d.modelLength, { tint: d.tint, barrel: d.barrel, modelYaw: d.modelYaw });
    const lod = B.models.lodOf(w);
    const hi = B.models.instance(w); hi.rotation.y = (d.modelYaw ?? 0) + 0.7;
    const lo = lod ? B.models.instance(lod.low) : null; if (lo) lo.rotation.y = hi.rotation.y;
    const bt = (o) => { const b = o?.getObjectByName('barrel'); return b ? tris(b) : null; };
    out.push({ kind: d.id, full: tris(hi), far: lo ? tris(lo) : null, barrel: bt(hi), barrelFar: bt(lo) });
    const shots = [[hi, D, 52 * 30 / D], [lo, D, 52 * 30 / D], [hi, 16, 52], [lo, 16, 52]];
    for (let c = 0; c < cols; c++) {
      const [m, dist, fov] = shots[c];
      if (!m) continue;
      scene.add(m);
      // At DIST the lens is narrowed so the gun fills the cell: the pixels it
      // covers are counted honestly on the phone by LOD_DIST, not here.
      cam.fov = c < 2 ? 3.2 * (110 / D) : 52; cam.updateProjectionMatrix();
      cam.position.set(dist * 0.6, dist * 0.45, dist * 0.65);
      cam.lookAt(0, 1.4, 0);
      R.setRenderTarget(null);
      R.render(scene, cam);
      g.drawImage(R.domElement, 0, 0, W, H, c * W, r * H, W, H);
      g.fillStyle = '#000'; g.font = '12px monospace';
      g.fillText(`${d.id} ${['FULL', 'FAR', 'FULL', 'FAR'][c]} ${c < 2 ? D + ' m' : 'close'} ${tris(m)}`, c * W + 6, r * H + 14);
      scene.remove(m);
    }
  }
  R.setSize(size.x, size.y, false);
  return { out, png: sheet.toDataURL('image/png') };
}, [kinds, DIST]);
writeFileSync('/tmp/out/lod-sheet.png', Buffer.from(res.png.split(',')[1], 'base64'));
console.log(JSON.stringify(res.out));
await b.close();
