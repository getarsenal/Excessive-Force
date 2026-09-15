// Drives the game in a real browser: loads it, optionally fires a scripted
// sequence of actions, and writes screenshots plus the console log.
// Usage: node tools/shot.mjs <outPrefix> [scenarioFile]
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] || '/tmp/shots/shot';
const scenarioPath = process.argv[3];
fs.mkdirSync(out.substring(0, out.lastIndexOf('/')) || '.', { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--disable-gpu-sandbox',
    '--no-sandbox', '--ignore-gpu-blocklist',
    // Let Web Audio start without a real gesture so audio can be tested.
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// Force a quality tier so tests can check what a desktop actually gets; the
// software rasteriser here would otherwise always be detected as "low".
await page.addInitScript((tier) => {
  try {
    localStorage.setItem('tt.quality', tier);
    // Skip the target-select screen. A fresh browser profile has never chosen
    // a level, so without this every run would sit on the front door waiting
    // for a click that is never coming.
    localStorage.setItem('tt.autostart', '1');
  } catch { /* private mode */ }
}, process.env.TT_TIER || 'high');

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}\n${e.stack || ''}`));
page.on('requestfailed', (r) => logs.push(`[REQFAIL] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[HTTP ${r.status()}] ${r.url()}`); });

const url = process.env.TT_URL || 'http://localhost:5173/';
await page.goto(url, { waitUntil: 'load', timeout: 120000 });

// Wait until the loading overlay is gone, or bail with whatever we have.
let ready = false;
try {
  await page.waitForFunction(
    () => document.getElementById('loading')?.style.display === 'none',
    { timeout: 180000 },
  );
  ready = true;
} catch {
  logs.push('[WARN] loading overlay never cleared');
}

await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}-01-initial.png` });

if (ready && scenarioPath && fs.existsSync(scenarioPath)) {
  const scenario = fs.readFileSync(scenarioPath, 'utf8');
  const results = await page.evaluate(scenario);
  logs.push(`[SCENARIO] ${JSON.stringify(results, null, 2)}`);
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${out}-02-after.png` });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${out}-03-settled.png` });
}

const perf = ready ? await page.evaluate(() => document.getElementById('perf')?.textContent) : null;
logs.push(`[PERF] ${perf}`);

fs.writeFileSync(`${out}-console.txt`, logs.join('\n'));
console.log(logs.join('\n'));
await browser.close();
