// Follow one strike's bomb from the rail to the ground: where it was let go,
// where it went, where it landed, what the game said about it, and what came
// down.
//
//   node tools/bombtrace.mjs <level> [id=gbu28] [pre=0]
//
// `pre` knocks that share of the primary down first (by deleting stones from
// the middle out), to try the strike on a ruin rather than a fresh building.
import { chromium } from 'playwright';
const [level = 'borobudur', id = 'gbu28', pre = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (/error|warn/i.test(m.type()) && !/GPU|WebGL|swiftshader/i.test(t)) console.log('CONSOLE', m.type(), t.slice(0, 200)); });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(async ([id, pre]) => {
  const B = window.battle, THREE = window.THREE, ff = window.__fastForward;
  B.unlockAll = true; B.freeBuild = true; B.airlift = false; B.airborne.auto = false;
  ff(2);
  const S = B.primary, o = S.origin;
  if (pre > 0) {
    // Hollow the middle out: the stones nearest the centre line go first.
    const idx = [];
    for (let i = 0; i < S.count; i++) if (S.isAlive(i)) idx.push([Math.hypot(S.px[i] - o.x, S.pz[i] - o.z), i]);
    idx.sort((a, b2) => a[0] - b2[0]);
    const n = Math.floor(idx.length * pre);
    for (let k = 0; k < n; k++) S.destroyChunk(idx[k][1]);
    ff(8);
  }
  B.garrison.fireEnabled = false;
  // Aim the way a tap on the middle of the building does: the top of the
  // highest standing stone within fifteen metres of its centre.
  let best = -1, bestY = -Infinity;
  for (let i = 0; i < S.count; i++) {
    if (!S.isAlive(i) || Math.hypot(S.px[i] - o.x, S.pz[i] - o.z) > 15) continue;
    const top = S.py[i] + S.hy[i];
    if (top > bestY) { bestY = top; best = i; }
  }
  const aim = best >= 0 ? new THREE.Vector3(S.px[best], bestY, S.pz[best]) : new THREE.Vector3(o.x, S.groundY, o.z);
  const events = [];
  const say = B.onEvent;
  B.onEvent = (k, d) => { if (/strike|bomb|abort|underfire|shotdown|bigimpact|flak/.test(k)) events.push([k, d?.destroyed ?? d?.point?.y?.toFixed?.(1) ?? '']); return say(k, d); };
  const before = S.destroyedCount;
  const fired = [];
  const orig = B.projectiles.fire.bind(B.projectiles);
  B.projectiles.fire = (o2) => { const p = orig(o2); fired.push({ o: o2, p }); return p; };
  const impacts = [];
  const oi = B._onImpact.bind(B);
  B._onImpact = (h) => { impacts.push({ at: h.point ? [h.point.x, h.point.y, h.point.z].map((v) => +v.toFixed(1)) : null, structure: !!h.structureHit, kind: h.proj?.kind || h.kind, owner: h.owner ?? null }); return oi(h); };
  const sortie = B.callStrike(id, aim);
  if (!sortie) return { err: 'refused' };
  const track = [];
  for (let t = 0; t < 60; t += 0.5) {
    ff(0.5);
    const live = B.projectiles.list ? B.projectiles.list : B.projectiles.active || [];
    const bomb = (Array.isArray(live) ? live : []).find((q) => q.kind === 'bomb' || q.strikeDef);
    if (bomb) track.push([+t.toFixed(1), +bomb.pos.x.toFixed(0), +bomb.pos.y.toFixed(0), +bomb.pos.z.toFixed(0)]);
    if (sortie.done && impacts.length) break;
  }
  return {
    aim: [aim.x, aim.y, aim.z].map((v) => +v.toFixed(1)), standing: +S.standingHeight().toFixed(1), groundY: +S.groundY.toFixed(1),
    released: !!sortie.released, aborted: !!sortie.aborted, hp: sortie.hp, alt: +(sortie.alt ?? 0).toFixed(0),
    releaseAt: +(sortie.releaseAt ?? 0).toFixed(1), target: sortie.target ? [sortie.target.x, sortie.target.y, sortie.target.z].map((v) => +v.toFixed(1)) : null,
    projectilesFired: fired.length, bombKinds: fired.map((f) => f.o.kind),
    track: track.slice(0, 40), impacts, events, stones: S.destroyedCount - before,
    projKeys: Object.keys(B.projectiles).slice(0, 20),
  };
}, [id, +pre]);
console.log(JSON.stringify(r, null, 0));
await b.close();
