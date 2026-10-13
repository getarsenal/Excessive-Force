// The studio (ui/studio.js) driven on a phone: STUDIO on the dock opens
// the band over the game (the dock stays and a unit can be deployed under
// it), HUD takes the interface off and back, the clock is
// slowed and the physics step follows, a strike is called and FOLLOW
// cycles onto the aircraft, ORBIT turns the view, a move is set from A to B
// and played, the lens changes, a still is taken, two seconds are recorded
// and the clip's size read, then EXIT puts everything back. Photographs
// the band upright and on its side.
//
//   node tools/studioprobe.mjs [level]      -> /tmp/out/studio/*.png
//   SANDBOX=1 node tools/studioprobe.mjs    the run off the title's MODES: free build, nothing counted, ENEMY on the band
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
mkdirSync('/tmp/out/studio', { recursive: true });
let fails = 0;
// Frames are driven, not waited for: on a software rasteriser a frame is
// seconds, and a check that waits a second of the wall clock sees none.
// Chips are clicked from inside the page: Playwright's own click waits for
// the chip to hold still over two frames, and at eight times a frame is work.
const tap = (page, sel) => page.evaluate((sel) => document.querySelector(sel).click(), sel);
// Paced: the battery saver (on by default on a phone) skips a frame that
// comes under a thirtieth of a second after the last, so back-to-back
// calls would be mostly skipped.
const frames = (page, n) => page.evaluate((n) => window.__drive(n), n);
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const SANDBOX = !!process.env.SANDBOX;
await page.addInitScript(([tier, sandbox, level]) => { try {
  localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done');
  if (sandbox) sessionStorage.setItem('tt.studiorun', JSON.stringify({ level })); } catch {} }, [process.env.TIER || 'low', SANDBOX, level]);
page.on('pageerror', (e) => { console.log('page error:', String(e).slice(0, 200)); fails++; });
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('navigated:', f.url()); });
page.on('crash', () => { console.log('page crashed'); fails++; });
page.on('console', (m) => { if (m.type() === 'error' || /reload|\[vite\]/.test(m.text())) console.log('console:', m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.__studio, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__drive = async (n) => { for (let k = 0; k < n; k++) { window.__frame(); await new Promise((r) => setTimeout(r, 36)); } }; });
await page.evaluate(() => { const B = window.battle; B.airborne.auto = false; B.assault.auto = false; B.invulnerable = true; B.freeBuild = true; B.unlockAll = true; if (B.garrison) B.garrison.fireEnabled = false; if (B.sams) B.sams._engage = () => {}; });

// In through STUDIO on the dock (a sandbox run opens it by itself).
let r = await page.evaluate(() => ({ studio: document.body.classList.contains('studio'), run: !!window.battle.studioRun, free: !!window.battle.freeBuild, unlocked: !!window.battle.unlockAll, hold: !!window.battle.holdEnd, enemy: !document.getElementById('st-enemy').hidden }));
if (SANDBOX) check(r.studio && r.run && r.free && r.unlocked && r.hold && r.enemy, `the sandbox run: band up, free build, unlocked, never ending, ENEMY on the band (${JSON.stringify(r)})`);
else {
  check(!r.studio && !r.run && !r.hold && !r.enemy, `a battle: no band yet, the battle can end, no ENEMY chip (${JSON.stringify(r)})`);
  await page.click('#dock-view');
  await page.waitForTimeout(300);
}
r = await page.evaluate(() => ({ studio: document.body.classList.contains('studio'), clear: document.body.classList.contains('clear-view'), band: !document.getElementById('studio').hidden, dock: getComputedStyle(document.getElementById('dock')).display, over: (() => { const b = document.getElementById('studio').getBoundingClientRect(), d = document.getElementById('dock').getBoundingClientRect(); return b.bottom <= d.top + 1; })() }));
check(r.studio && !r.clear && r.band && r.dock !== 'none' && r.over, `STUDIO opens the band over the game: dock still there, band above it, interface on (${JSON.stringify(r)})`);
// The game goes on under it: a gun deployed while the band is up.
r = await page.evaluate(() => {
  const B = window.battle, o = B.primary.origin, T = window.THREE, terrain = window.terrain;
  const before = B.units.length + B.pending.length;
  // Somewhere a gun can stand: round the landmark at a hundred and fifty
  // metres, the first spot the battle takes (the river takes the rest).
  let at = null;
  for (let k = 0; k < 16 && !at; k++) {
    const a = k * Math.PI / 8, x = o.x + Math.cos(a) * 150, z = o.z + Math.sin(a) * 150;
    const y = terrain?.heightAt ? terrain.heightAt(x, z) : B.originGround;
    B.deploy('m777', new T.Vector3(x, y, z));
    if (B.units.length + B.pending.length > before) at = [Math.round(x), Math.round(z)];
  }
  return { before, after: B.units.length + B.pending.length, at };
});
check(r.after > r.before, `a gun deploys under the band (${r.before} -> ${r.after} at ${JSON.stringify(r.at)})`);
// HUD takes the interface off and back; the band stays.
await tap(page, '#st-hud');
r = await page.evaluate(() => ({ clear: document.body.classList.contains('clear-view'), band: !document.getElementById('studio').hidden && getComputedStyle(document.getElementById('studio')).display !== 'none', dock: getComputedStyle(document.getElementById('dock')).display, label: document.getElementById('st-hud').textContent }));
check(r.clear && r.band && r.dock === 'none' && r.label === 'HUD OFF', `HUD OFF: interface gone, band stays (${JSON.stringify(r)})`);
await page.screenshot({ path: '/tmp/out/studio/band-clean.png', timeout: 180000, animations: 'disabled' });
await tap(page, '#st-hud');
r = await page.evaluate(() => ({ clear: document.body.classList.contains('clear-view'), dock: getComputedStyle(document.getElementById('dock')).display }));
check(!r.clear && r.dock !== 'none', `HUD ON: interface back (${JSON.stringify(r)})`);
if (SANDBOX) {
  await tap(page, '#st-enemy');
  r = await page.evaluate(() => ({ fire: window.battle.garrison?.fireEnabled, auto: window.battle.airborne?.auto, label: document.getElementById('st-enemy').textContent }));
  check(r.fire === false && r.auto === false && r.label === 'ENEMY OFF', `ENEMY OFF holds the garrison and the airborne (${JSON.stringify(r)})`);
  await tap(page, '#st-enemy');
}
await page.screenshot({ path: '/tmp/out/studio/band-portrait.png' });

// A recorder whose stop never comes (an iPhone did this) is finished by the timer.
r = await page.evaluate(() => {
  const S = window.__studio;
  S.recording = true; S.recT0 = performance.now() - 3000; S._chunks = [new Blob([new Uint8Array(1000)])]; S._mimeUsed = 'video/webm';
  S.rec = { state: 'recording', stop() { /* never fires onstop */ }, requestData() {} };
  S._stream = null; S.lastClip = null; S._got = S._got || []; S._deliver = async () => { S._got.push('x'); };
  S.stopRecording();
  return { still: S.recording };
});
await page.waitForFunction(() => !window.__studio.recording && !!window.__studio.lastClip, null, { timeout: 15000 }).catch(() => {});
r = await page.evaluate(() => ({ rec: window.__studio.recording, clip: !!window.__studio.lastClip, label: document.getElementById('st-rec').textContent }));
check(!r.rec && r.clip && r.label === '● REC', `a stop that never fires is finished by the timer in four seconds (${JSON.stringify(r)})`);
await page.evaluate(() => { window.__studio.lastClip = null; window.__studio._got = []; delete window.__studio._deliver; window.__studio._paint(); });

// On its side, while the page is still fresh enough to photograph.
await page.setViewportSize({ width: 852, height: 393 });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/out/studio/band-landscape.png', timeout: 180000, animations: 'disabled' });
r = await page.evaluate(() => { const q = document.getElementById('studio').getBoundingClientRect(); return { top: Math.round(q.top), bottom: Math.round(q.bottom), h: innerHeight }; });
check(r.bottom <= r.h && r.top > r.h * 0.5, `landscape: the band sits in the lower half (${r.top}..${r.bottom} of ${r.h})`);
await page.setViewportSize({ width: 393, height: 852 });
await page.waitForTimeout(400);

// Targets 44 points a side.
const small = await page.evaluate(() => [...document.querySelectorAll('#studio button')].filter((b) => !b.hidden).map((b) => { const q = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(q.width), Math.round(q.height)]; }).filter((x) => x[1] < 44 || x[2] < 44));
check(small.length === 0, `every chip at least 44 points a side${small.length ? ': ' + JSON.stringify(small) : ''}`);

// The clock.
const baseHz = await page.evaluate(() => Math.round(1 / window.battle.physics.fixedStep));
await tap(page, '#studio [data-speed="0.25"]');
r = await page.evaluate(() => ({ ts: window.__testMenu?.timeScale ?? window.__studio.testMenu.timeScale, hz: Math.round(1 / window.battle.physics.fixedStep), paused: window.__studio.testMenu.paused }));
check(r.ts === 0.25 && r.hz === baseHz * 4 && !r.paused, `quarter speed: timeScale ${r.ts}, physics ${r.hz} Hz (was ${baseHz})`);
await tap(page, '#studio [data-speed="8"]');
r = await page.evaluate(() => ({ ts: window.__studio.testMenu.timeScale, hz: Math.round(1 / window.battle.physics.fixedStep), max: window.battle.physics.maxSteps, maxDt: window.battle.physics.maxDt }));
check(r.ts === 8 && r.hz === baseHz && r.max === 24 && r.maxDt === 0.5, `time lapse: timeScale ${r.ts}, ${r.max} steps a frame, ${r.maxDt} s banked`);
// The guns and the stones in the same time: eight seconds of the clock in a second of frames.
r = await page.evaluate(async () => {
  const B = window.battle, t0 = B.elapsed, s0 = B.physics.stepCount, f0 = performance.now();
  await window.__drive(10);
  return { clock: B.elapsed - t0, steps: B.physics.stepCount - s0, real: (performance.now() - f0) / 1000 };
});
// Eight seconds of battle a second of frames, and a physics step a
// sixtieth of each of them, so the guns and the stones agree.
// Ten frames are at least ten thirtieths of a second of the frame's
// clock (paced at a thirtieth, capped at a twentieth), so eight times is
// at least two and a half seconds of battle; and a physics step for
// every fiftieth or sixtieth of it, so the stones keep up with the guns.
check(r.clock > 2.4 && Math.abs(r.steps - r.clock * baseHz) < 12, `ten frames at 8x: the battle ran ${r.clock.toFixed(1)} s (${r.real.toFixed(2)} s on this box), ${r.steps} physics steps (${(r.clock * baseHz).toFixed(0)} due)`);
await tap(page, '#studio [data-speed="0"]');
r = await page.evaluate(async () => { const B = window.battle, t0 = B.elapsed; await window.__drive(5); return { d: B.elapsed - t0, label: document.querySelector('#studio [data-speed="0"]').textContent }; });
check(r.d === 0 && r.label === '▶', `held: the clock stood still, the chip offers play (${JSON.stringify(r)})`);
await tap(page, '#studio [data-speed="0"]');
r = await page.evaluate(() => window.__studio.speed);
check(r === 1, `the hold chip again is play (${r}x)`);

// FOLLOW an aircraft.
await page.evaluate(() => { const B = window.battle, o = B.primary.origin, T = window.THREE; B.callStrike('f15', new T.Vector3(o.x, B.originGround, o.z)); });
await page.waitForTimeout(400);
await tap(page, '#st-follow');
await tap(page, '#st-follow');   // armed, then cycle onto the first thing in the air
r = await page.evaluate(() => { const S = window.__studio; return { mode: S.mode, kind: S.target?.kind, name: S.target?.name, hint: document.getElementById('studio-hint').textContent }; });
check(r.mode === 'follow' && r.kind === 'sortie', `FOLLOW cycles onto the aircraft: ${r.kind} ${r.name} · "${r.hint}"`);
r = await page.evaluate(async () => {
  const S = window.__studio, R = window.__rig;
  const a = R.target.clone(); await window.__drive(12);
  const p = S.target?.ref?.model?.position; const moved = R.target.distanceTo(a);
  return { moved, gap: p ? R.desiredTarget.distanceTo(p) : -1, lag: p ? R.target.distanceTo(p) : -1 };
});
check(r.moved > 20 && r.gap < 1, `the focus moved ${r.moved.toFixed(0)} m with it, ${r.gap.toFixed(2)} m off the aircraft (${r.lag.toFixed(0)} m behind it)`);
// Tap to follow: a tap on the landmark.
await tap(page, '#st-follow');  // off
await tap(page, '#st-follow');  // armed
r = await page.evaluate(() => {
  const B = window.battle, o = B.primary.origin, T = window.THREE, cam = window.__engine.camera;
  const v = new T.Vector3(o.x, o.y + 20, o.z).project(cam); const c = document.querySelector('canvas').getBoundingClientRect();
  return { x: c.left + (v.x + 1) / 2 * c.width, y: c.top + (1 - v.y) / 2 * c.height };
});
await page.touchscreen.tap(r.x, r.y);
await page.waitForTimeout(300);
r = await page.evaluate(() => { const S = window.__studio; return { mode: S.mode, kind: S.target?.kind, name: S.target?.name }; });
// The nearest thing within forty-four points of the tap wins, and in a
// sandbox the lift may be hanging over the building just then.
check(r.mode === 'follow' && ['point', 'unit', 'drop', 'sortie', 'shell'].includes(r.kind), `a tap on the building follows what is there: ${r.kind} ${r.name}`);

// ORBIT.
await tap(page, '#st-orbit');
r = await page.evaluate(async () => { const R = window.__rig, y0 = R.yaw, f0 = performance.now(); await window.__drive(12); return { turn: R.yaw - y0, real: (performance.now() - f0) / 1000 }; });
// Twelve driven frames are at least twelve twentieths of a second of
// camera time (the frame's clock is capped there whatever the box took),
// so the slow orbit has turned at least three degrees.
check(Math.abs(r.turn) > 0.045, `the slow orbit turned ${(r.turn * 180 / Math.PI).toFixed(1)}° over twelve frames (${r.real.toFixed(1)} s on this box)`);
await tap(page, '#st-orbit'); await tap(page, '#st-orbit'); await tap(page, '#st-orbit');  // back to off
r = await page.evaluate(() => window.__studio.orbitIx);
check(r === 0, 'orbit cycles back to off');

// A → B.
await tap(page, '#st-follow');  // free camera
// A frame here is seconds, so the eight-second move is run as a two-second one.
await page.evaluate(() => { window.__studio.dollySecs = 2; });
await tap(page, '#st-dolly');   // A
await page.evaluate(() => { const R = window.__rig; R.desiredYaw = R.yaw = R.yaw + 1.2; R.desiredDistance = R.distance = R.distance * 0.6; R.desiredPitch = R.pitch = 0.5; });
await tap(page, '#st-dolly');   // B
// The poses, read before PLAY: the move clears them when it is done.
await page.evaluate(() => { const d = window.__studio.dolly; window.__ab = { a: { ...d.a, target: d.a.target.clone() }, b: { ...d.b, target: d.b.target.clone() } }; });
await tap(page, '#st-dolly');   // play
r = await page.evaluate(() => ({ t: window.__studio.dolly.t, label: document.getElementById('st-dolly').textContent, enabled: window.__rig.enabled }));
check(r.t >= 0 && r.label === 'STOP' && !r.enabled, `the move is rolling (${r.label})`);
r = await page.evaluate(async () => {
  const S = window.__studio, R = window.__rig, { a, b } = window.__ab;
  // Part way in: still on the way. Then until it is done.
  await window.__drive(2);
  const mid = { t: S.dolly.t, yaw: R.yaw };
  for (let k = 0; k < 10 && S.dolly.t >= 0; k++) await window.__drive(10);
  return { t: S.dolly.t, dy: Math.abs(R.yaw - b.yaw), dd: Math.abs(R.distance - b.distance), enabled: R.enabled, mid, a: a.yaw, b: b.yaw };
});
check(r.t < 0 && r.enabled && r.dy < 0.01 && r.dd < 0.5, `the move finished on B and gave the rig back (yaw off ${r.dy.toFixed(3)}, distance off ${r.dd.toFixed(1)}; after two frames it was ${r.mid.t < 0 ? 'already done on this box' : `${(r.mid.t * 100).toFixed(0)}% along, yaw ${r.mid.yaw.toFixed(2)} between ${r.a.toFixed(2)} and ${r.b.toFixed(2)}`})`);

// LENS.
const fov0 = await page.evaluate(() => window.__engine.camera.fov);
await tap(page, '#st-lens');
r = await page.evaluate(() => ({ fov: window.__engine.camera.fov, label: document.getElementById('st-lens').textContent }));
check(r.fov !== fov0 && r.fov === 30, `lens: ${r.label} is ${r.fov}°`);

// SNAP: the still is delivered as a JPEG of the canvas.
await page.evaluate(() => { const S = window.__studio; S._got = []; S._deliver = async (blob, name, type) => { S._got.push({ size: blob.size, name, type }); }; });
await tap(page, '#st-snap');
await frames(page, 1);
// The blob arrives when the encoder gets a turn, which on a busy box is a while.
await page.waitForFunction(() => window.__studio._got.length > 0, null, { timeout: 120000 }).catch(() => {});
r = await page.evaluate(() => window.__studio._got);
check(r.length === 1 && r[0].size > 20000 && r[0].type === 'image/jpeg', `SNAP delivered ${JSON.stringify(r)}`);

// REC two seconds.
const can = await page.evaluate(() => window.__studio.canRecord());
console.log(`recording ${can ? 'available' : 'not available'} here`);
if (can) {
  await tap(page, '#st-rec');
  await frames(page, 2);
  r = await page.evaluate(() => ({ rec: window.__studio.recording, band: !document.getElementById('studio').hidden, label: document.getElementById('st-rec').textContent, scale: window.__engine.renderScale }));
  check(r.rec && r.band && /STOP/.test(r.label) && r.scale === 1, `recording: band stays, REC reads STOP with the time, full size (${JSON.stringify(r)})`);
  // No photograph here: the recorder has the compositor, and a screenshot waits on it for minutes.
  await frames(page, 6);
  await page.waitForTimeout(800);
  await tap(page, '#st-rec');
  // The recorder's stop arrives once it has flushed, which with twelve
  // megabytes on a slow box is a while.
  await page.waitForFunction(() => !window.__studio.recording && window.__studio.lastClip, null, { timeout: 180000 });
  r = await page.evaluate(() => { const c = window.__studio.lastClip; return { size: c.blob.size, type: c.type, secs: c.secs, got: window.__studio._got.length, save: !document.getElementById('st-save').hidden }; });
  check(r.size > 50000 && r.secs >= 2 && r.got === 2 && r.save, `the clip: ${(r.size / 1024).toFixed(0)} kB ${r.type}, ${r.secs} s, delivered, SAVE CLIP on the band`);
}

// EXIT puts it all back.
await tap(page, '#st-exit');
await page.waitForTimeout(300);
r = await page.evaluate(() => ({ studio: document.body.classList.contains('studio'), clear: document.body.classList.contains('clear-view'), hz: Math.round(1 / window.battle.physics.fixedStep), ts: window.__studio.testMenu.timeScale, paused: window.__studio.testMenu.paused, fov: window.__engine.camera.fov, max: window.battle.physics.maxSteps, dock: getComputedStyle(document.getElementById('dock')).display }));
check(!r.studio && !r.clear && r.hz === baseHz && r.ts === 1 && !r.paused && r.fov === fov0 && r.max === 3 && r.dock !== 'none', `EXIT: band down, clock and lens and physics restored (${JSON.stringify(r)})`);
// The H key is still the plain clear view, and does not open the band.
await page.keyboard.press('KeyH');
await page.waitForTimeout(200);
r = await page.evaluate(() => ({ studio: document.body.classList.contains('studio'), clear: document.body.classList.contains('clear-view') }));
check(!r.studio && r.clear, `H is the clear view alone (${JSON.stringify(r)})`);
await page.keyboard.press('KeyH');
// STUDIO on the dock toggles the band.
await tap(page, '#dock-view'); await page.waitForTimeout(200);
r = await page.evaluate(() => document.body.classList.contains('studio'));
check(r, 'STUDIO on the dock opens the band again');
await tap(page, '#dock-view'); await page.waitForTimeout(200);
r = await page.evaluate(() => document.body.classList.contains('studio'));
check(!r, 'and a second tap closes it');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
