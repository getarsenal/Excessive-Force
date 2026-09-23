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
await page.addInitScript(([tier, intro, opening, suite]) => {
  try {
    localStorage.setItem('tt.quality', tier);
    // Skip the target-select screen. A fresh browser profile has never chosen
    // a level, so without this every run would sit on the front door waiting
    // for a click that is never coming.
    localStorage.setItem('tt.autostart', '1');
    // And the stand-off before the level, unless a run wants to look at it
    // (TT_INTRO=1): the suites need guns on the ground, not a cutscene.
    localStorage.setItem('tt.intros', intro);
    // The opening waits on a tap by design — it has to, to unlock audio — so
    // a harness run would sit on the gate for ever. TT_OPENING=1 to see it.
    localStorage.setItem('tt.opening', opening);
    // And a regression run starts from a board nothing has happened on yet:
    // the page holds the clock until a test asks for time. See `tt.suite` in
    // main.js for why.
    localStorage.setItem('tt.suite', suite);
  } catch { /* private mode */ }
}, [process.env.TT_TIER || 'high', process.env.TT_INTRO === '1' ? '1' : '0',
    process.env.TT_OPENING === '1' ? '1' : '0',
    process.env.TT_SUITE === '1' ? '1' : '0']);

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

// `TT_SUITE=1` is the regression run: it wants the scenario's answer and
// nothing else. The three screenshots and the twelve and a half seconds of
// settling between them exist so a human can look at what happened, and under
// the software rasteriser a 1440x900 frame is most of a second — so on a
// nine-level pass that is two minutes of rendering pictures nobody opens.
const suiteOnly = process.env.TT_SUITE === '1';

if (!suiteOnly) {
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}-01-initial.png` });
}

if (ready && scenarioPath && fs.existsSync(scenarioPath)) {
  const scenario = fs.readFileSync(scenarioPath, 'utf8');
  const results = await page.evaluate(scenario);
  logs.push(`[SCENARIO] ${JSON.stringify(results, null, 2)}`);
  // And on its own, because the console log is not a data channel. Playwright
  // delivers console events asynchronously, so messages the page emitted during
  // *loading* can still be arriving when the scenario finishes — they then land
  // between the result and the `[PERF]` line that the reader used as the end
  // marker, and the reader chokes on them. It was masked by the twelve seconds
  // of screenshot waits, which gave the queue time to drain; taking those out
  // for the suite runs uncovered it on three levels in nine.
  fs.writeFileSync(`${out}-result.json`, JSON.stringify(results));
  if (!suiteOnly) {
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${out}-02-after.png` });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${out}-03-settled.png` });
  }
}

const perf = ready ? await page.evaluate(() => document.getElementById('perf')?.textContent) : null;
logs.push(`[PERF] ${perf}`);

fs.writeFileSync(`${out}-console.txt`, logs.join('\n'));
console.log(logs.join('\n'));
await browser.close();
