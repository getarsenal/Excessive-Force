// What each weapon buys: fired at a level's primary from a clean load, how
// much of the win bar and how many tonnes come down, and how much of its
// price the rubble pays back at the game's own rate per tonne.
//
//   node tools/strikeprobe.mjs <level>[,<level>...] [ids] [tier=low] [live|quiet]   (dev server on 5177)
//
// `quiet` silences the garrison for the strikes too: what the weapon does
// when nothing is shooting at the aircraft.
//
// A strike is called once on the base of the primary with the garrison live,
// so the flak counts, and the sim runs until the sortie is over and the
// rubble has settled. A gun is a reference, not a purchase of the same kind:
// one of it, laid on the same point with the garrison silenced, for sixty
// seconds of fire. One page load per weapon, so every shot is at an
// untouched building. Prints one JSON line per run.
import { chromium } from 'playwright';
const [levels = 'westminster', ids = '', tier = 'low', mode = 'live'] = process.argv.slice(2);
const STRIKES = ['ah64', 'f15', 'ac130', 'gbu28', 'tomahawk', 'b1'];
const GUNS = ['m120', 'm119', 'm777', 'stryker', 'm109', 'm270', 'm142'];
const list = ids ? ids.split(',') : [...STRIKES, ...GUNS];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const level of levels.split(',')) {
  for (const id of list) {
    const page = await b.newPage({ viewport: { width: 640, height: 400 } });
    page.on('pageerror', (e) => console.error('PAGEERROR', level, id, e.message.slice(0, 160)));
    await page.addInitScript((tier) => { try {
      localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
      localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
      localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} }, tier);
    try {
      await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
      await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
      const r = await page.evaluate(async ([id, isStrike, quiet]) => {
        const { UNITS_BY_ID } = await import('/src/game/units.js');
        const B = window.battle, T = window.testMenu, THREE = window.THREE, ff = window.__fastForward;
        B.unlockAll = true; B.freeBuild = true; B.airlift = false;
        ff(3);                                  // let the load settle before counting
        const S = B.primary;
        const h = S.standingHeight() - S.groundY;
        const aim = new THREE.Vector3(S.origin.x, S.groundY + Math.min(6, h * 0.08), S.origin.z);
        const mass0 = B.structures.reduce((a, s) => a + s.demolishedMass, 0);
        const obj0 = B.objectiveProgress, pr0 = B.progress;
        const def = UNITS_BY_ID[id];
        let secs = 0, shotDown = false, placed = 0;
        let released = false;
        if (isStrike) {
          if (quiet) B.garrison.fireEnabled = false;
          const sortie = B.callStrike(id, aim);
          if (!sortie) return { err: 'strike refused' };
          const eta = sortie.loiter ? sortie.loiter.eta + (def.aircraft.station || 0) : (sortie.releaseAt || 0) + (sortie.fall || 0);
          secs = Math.ceil(eta + 25);
          for (let t = 0; t < secs; t += 5) { ff(5); if (sortie.hp <= 0 || sortie.aborted) shotDown = true; if (sortie.released || sortie.loiter) released = true; }
        } else {
          B.garrison.fireEnabled = false;
          B.setTarget(aim.clone(), 'probe');
          const range = Math.max((def.minRange || 0) + 60, Math.min(def.range * 0.5, 320));
          placed = T.spawnAt(id, 1, 2.2, range);
          if (!placed) return { err: 'no ground for the gun' };
          secs = 60;
          ff(secs + 15);
        }
        const mass1 = B.structures.reduce((a, s) => a + s.demolishedMass, 0);
        const tonnes = (mass1 - mass0) / 1000;
        return {
          secs, shotDown, released, placed,
          winBar: +(B.objectiveProgress - obj0).toFixed(4),
          massShare: +(B.progress - pr0).toFixed(5),
          tonnes: Math.round(tonnes), won: B.state === 'won',
          targetTonnes: Math.round(S.totalMass / 1000),
          winAt: B.objectives[0]?.win?.integrity,
        };
      }, [id, STRIKES.includes(id), mode === 'quiet']);
      console.log(JSON.stringify({ level, id, ...r }));
    } catch (e) {
      console.log(JSON.stringify({ level, id, err: String(e.message || e).slice(0, 160) }));
    }
    await page.close();
  }
}
await b.close();
