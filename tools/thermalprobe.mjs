// The heat ladder, driven: a fake Thermal plugin planted on the page as the
// App Store build's would be, walked nominal → fair → serious → critical →
// nominal, and at each rung the pixel ratio, the particle fill budget, the
// frame cap and the shadow redraw cadence read back; then Low Power Mode on,
// which must switch the battery saver on.
//   node tools/thermalprobe.mjs [level=westminster]        (dev server on 5177; TT_PORT= for another)
import { chromium, devices } from 'playwright';
const level = process.argv[2] || 'westminster', port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['iPhone 14 Pro'].userAgent });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.addInitScript(() => {
  // The plugin as the app registers it: state() and change events.
  const listeners = [];
  window.__thermal = { thermal: 'nominal', lowPower: false, batteryLevel: 0.8, batteryState: 'unplugged' };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Thermal: {
    state: async () => ({ ...window.__thermal }),
    addListener: (name, fn) => { listeners.push(fn); return { remove() {} }; },
  } } };
  window.__setThermal = (patch) => { Object.assign(window.__thermal, patch); for (const fn of listeners) fn({ ...window.__thermal }); };
  try { localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.saver'); } catch {}
});
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.__heat, null, { timeout: 400000 });
await page.evaluate(() => { window.battle.freeBuild = true; window.testMenu.spawnAt('m777', 6, 1, 220); });
const read = async (label) => {
  for (let i = 0; i < 6; i++) await page.evaluate(() => window.__frame());
  const r = await page.evaluate(() => {
    const e = window.engine, h = window.__heat;
    const s0 = window.__shadows().draws;
    for (let i = 0; i < 12; i++) window.__frame();
    const s1 = window.__shadows().draws;
    return { heat: h.says, level: h.level, pixelRatio: +e.renderer.getPixelRatio().toFixed(3), fill: window.fx?.fillBudget ?? window.__fx?.fillBudget, gapMs: +window.__powerGap().toFixed(1), shadowDrawsIn12: s1 - s0, saver: window.__power.saver };
  });
  console.log(label.padEnd(10), JSON.stringify(r));
  return r;
};
const out = {};
out.nominal = await read('nominal');
for (const t of ['fair', 'serious', 'critical', 'nominal']) { await page.evaluate((t) => window.__setThermal({ thermal: t }), t); await page.waitForTimeout(200); out[t + (t === 'nominal' ? '2' : '')] = await read(t); }
await page.evaluate(() => window.__setThermal({ lowPower: true })); await page.waitForTimeout(200);
out.lowPower = await read('lowpower');
const ok = out.fair.pixelRatio < out.nominal.pixelRatio && out.serious.gapMs > out.nominal.gapMs && out.critical.shadowDrawsIn12 === 0
  && out.nominal2.pixelRatio === out.nominal.pixelRatio && out.lowPower.saver === true && out.fair.fill < out.nominal.fill;
console.log(ok ? 'HEAT LADDER OK' : 'HEAT LADDER WRONG');
await b.close();
process.exit(ok ? 0 : 1);
