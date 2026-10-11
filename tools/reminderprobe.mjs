// The daily reminder, against the built game (the worker is a built game's
// only): notifications granted, the page's note written as the title writes
// it, the worker asked to decide now, and the notifications it is showing
// read back — once with the strike not flown (one reminder), once with it
// flown (none), once with a reminder already given today (none again).
//   npx vite build && npx vite preview --port 5190 &  node tools/reminderprobe.mjs [port=5190]
import { chromium } from 'playwright';
const port = process.argv[2] || 5190;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
await ctx.grantPermissions(['notifications'], { origin: `http://localhost:${port}` });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => navigator.serviceWorker.controller || false, null, { timeout: 60000 }).catch(() => {});
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60000 }); }
const run = (mode) => page.evaluate(async (mode) => {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = ymd(new Date());
  const note = { remind: true, hour: 0, date: day, target: 'ELIZABETH TOWER', mod: 'WAR CHEST', streak: 4,
    done: mode === 'flown' ? day : null, told: mode === 'told' ? day : null };
  const c = await caches.open('ef-state');
  await c.put(new URL('./__ef-state', location.href).href, new Response(JSON.stringify(note)));
  const reg = await navigator.serviceWorker.ready;
  for (const n of await reg.getNotifications()) n.close();
  await new Promise((r) => {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data === 'ef-remind-done') r(); }, { once: true });
    navigator.serviceWorker.controller.postMessage('ef-remind-now');
    setTimeout(r, 5000);
  });
  return (await reg.getNotifications()).map((n) => `${n.title}: ${n.body}`);
}, mode);
console.log('not flown     ', JSON.stringify(await run('due')));
console.log('flown today   ', JSON.stringify(await run('flown')));
console.log('already told  ', JSON.stringify(await run('told')));
console.log('periodic sync on this browser', await page.evaluate(() => typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype));
console.log('errors', JSON.stringify(errors));
await b.close();
