/**
 * Look straight down at the street plan.
 *
 *   node tools/roadview.mjs <level> <out> [dist] [tx] [tz]
 */
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const out = process.argv[3] || '/tmp/out/roads';
const dist = Number(process.argv[4] ?? 320);
const tx = Number(process.argv[5] ?? 0);
const tz = Number(process.argv[6] ?? 0);
const pitch = Number(process.argv[7] ?? 1.45);
const yaw = Number(process.argv[8] ?? 0);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 250)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); } catch {} });
await page.goto(`http://localhost:5177/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none',
  null, { timeout: 400000 });
await page.evaluate(() => window.hud.setClearView(true));
await page.evaluate(([d, x, z, pi, ya]) => {
  const r = window.rig, T = window.terrain;
  r.target.set(x, T.heightAt(x, z), z);
  r.desiredTarget.copy(r.target);
  r.yaw = r.desiredYaw = ya; r.pitch = r.desiredPitch = pi;
  r.distance = r.desiredDistance = d;
}, [dist, tx, tz, pitch, yaw]);
await page.waitForTimeout(4200);
await page.screenshot({ path: `${out}.png` });
console.log(JSON.stringify(await page.evaluate(() => {
  const net = window.cityGroup.userData.network;
  const deg = {};
  for (const n of net.nodes) { const k = n.links.length; deg[k] = (deg[k] || 0) + 1; }
  // Why the two-arm nodes survived the dissolve.
  const why = {};
  const dir = (n, l) => {
    const pts = l.edge.pts;
    const p = l.at === 0 ? pts[1] : pts[pts.length - 2];
    const dx = p.x - n.x, dz = p.z - n.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  };
  const turns = [];
  for (const n of net.nodes) {
    if (n.links.length !== 2) continue;
    const a = n.links[0], b2 = n.links[1];
    let r = 'straightness';
    if (a.edge === b2.edge) r = 'loop';
    else if (a.other === b2.other) r = 'parallel pair';
    else if (!!a.edge.bank !== !!b2.edge.bank) r = 'bank mismatch';
    else if (a.edge.approach || b2.edge.approach) r = 'approach';
    else {
      const da = dir(n, a), db = dir(n, b2);
      turns.push(Math.round(Math.acos(Math.max(-1, Math.min(1,
        -(da.x * db.x + da.z * db.z)))) * 180 / Math.PI));
    }
    why[r] = (why[r] || 0) + 1;
  }
  turns.sort((x, y) => x - y);
  const decks = window.cityGroup.getObjectByName('decks');
  const deckInfo = decks ? decks.children.map((m) => {
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    return { tris: m.geometry.attributes.position.count / 3,
      y: [+bb.min.y.toFixed(1), +bb.max.y.toFixed(1)] };
  }) : null;
  return { decks: deckInfo, edges: net.edges.length, nodes: net.nodes.length, degrees: deg,
    bridges: net.edges.filter((e) => e.bridge).length, why,
    turnDeg: [turns[0], turns[turns.length >> 2], turns[turns.length >> 1],
      turns[Math.floor(turns.length * 0.9)], turns[turns.length - 1]] };
})));
await b.close();
