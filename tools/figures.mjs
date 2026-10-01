// Render every soldier pose: node tools/figures.mjs [outdir] → figures-{side,front,top}.png
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/out';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1600, height: 560 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
// Two halves of the row, close enough to see the hands.
for (const view of ['side', 'front', 'top']) {
  for (const [i, x] of [-6.4, 6.4].entries()) {
    await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/tools/figures.html?view=${view}&x=${x}&d=14`);
    await page.waitForFunction(() => window.done, null, { timeout: 120000 });
    await page.screenshot({ path: `${out}/figures-${view}-${i}.png` });
  }
}
await b.close();
