// What one unit of each kind leaves on the GPU: geometries, textures and
// meshes before and after it is deployed (no airlift), then again after it
// has dug in, so anything made per unit (crews, emplacements, bars) shows.
//   node tools/unitmem.mjs [level=westminster] [tier=low]
import { chromium } from 'playwright';
const [level = 'westminster', tier = 'low'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const kinds = (process.env.KINDS || 'm777,m119,m109,m120,m240,at4').split(',');
for (const kind of kinds) {
  const r = await page.evaluate(async (kind) => {
    const B = window.battle, I = window.__engine.renderer.info, tm = window.testMenu;
    B.airlift = false; B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
    if (B.garrison) B.garrison.fireEnabled = false;
    const count = () => { let m = 0; window.__engine.scene.traverse((o) => { if (o.isMesh || o.isSprite) m++; }); window.__engine.render(); return { geos: I.memory.geometries, tex: I.memory.textures, meshes: m }; };
    const a = count();
    const n0 = B.units.length;
    tm.spawnAt(kind, 1, Math.random() * 6.28, 200 + Math.random() * 60);
    for (let k = 0; k < 30 && !B.units[n0]?.model; k++) await new Promise((r) => setTimeout(r, 200));
    window.__fastForward(1, 1 / 30);
    const bb = count();
    for (const u of B.units) u.cooldown = 999;
    window.__fastForward(40, 1 / 30);
    const c = count();
    const u = B.units[n0];
    let own = 0; u?.group.traverse((o) => { if (o.isMesh) own++; });
    return { placed: B.units.length - n0, dugIn: !!u?.dugIn, ownMeshes: own, onPlace: { geos: bb.geos - a.geos, tex: bb.tex - a.tex, meshes: bb.meshes - a.meshes }, afterDigIn: { geos: c.geos - bb.geos, tex: c.tex - bb.tex, meshes: c.meshes - bb.meshes } };
  }, kind);
  console.log(kind.padEnd(6), JSON.stringify(r));
}
await b.close();
