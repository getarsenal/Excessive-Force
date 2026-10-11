// What a level opens when: each ground unit's place on the bar (the battle's
// own `unlockAt`, on the bar's scale), its cost, and whether it is open at
// the first shot, beside the money a player starts with. With `c` the arsenal
// is the one the campaign hands over by then, as a challenge link's is.
//   node tools/unlockprobe.mjs <level>... [port via TT_PORT=5178]
import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5178;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const level of process.argv.slice(2)) {
  const page = await b.newPage({ viewport: { width: 393, height: 852 } });
  await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
  await page.goto(`http://localhost:${port}/?level=${level}&c=999`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  const r = await page.evaluate(async () => {
    const B = window.battle, UM = await import('/src/game/units.js');
    return { money: Math.round(B.money), income: B.income ?? null, rows: UM.UNITS.filter((u) => !u.strike).map((u) => [u.id, B.costOf(u), +(B.unlockAt(u) * 100).toFixed(1), B.isUnlocked(u)]) };
  });
  console.log(`${level}: start $${r.money}`);
  console.log('  ' + r.rows.map(([id, c, at, open]) => `${id} $${c} @${at}%${open ? ' open' : ''}`).join(' · '));
  await page.close();
}
await b.close();
