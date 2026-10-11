// How long a phone waits: the built game served as the live site serves it,
// loaded on a throttled mid-range phone profile (4G-ish network, CPU slowed
// four times), from the first byte to the battle being playable, and how
// many bytes it took. Cold (empty cache) and warm (second visit).
//   npx vite preview --port 5190 &  node tools/loadprobe.mjs [level=tutorial] [port=5190]
//   QS=shadercheck adds a query (here: three's synchronous shader checks back on).
import { chromium } from 'playwright';
const level = process.argv[2] || 'tutorial', port = process.argv[3] || 5190;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
let bytes = 0, reqs = 0;
const marks = [];
page.on('console', (m) => { const t = m.text(); if (/\b\d+ ?ms\b/.test(t) && t.includes('[tumble]')) marks.push(t.replace('[tumble] ', '').slice(0, 110)); });
cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.autostart', '1'); } catch {} });
const run = async (label) => {
  bytes = 0; reqs = 0; marks.length = 0;
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/?level=${level}${process.env.QS ? '&' + process.env.QS : ''}`, { waitUntil: 'load', timeout: 600000 });
  const tLoad = Date.now() - t0;
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 900000 });
  const tPlay = Date.now() - t0;
  // And the first two frames actually drawn after it: shader compiles not
  // waited for during the load are waited for there.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const tFrame = Date.now() - t0;
  console.log(JSON.stringify({ label, level, pageLoadS: +(tLoad / 1000).toFixed(1), playableS: +(tPlay / 1000).toFixed(1), firstFrameS: +(tFrame / 1000).toFixed(1), MB: +(bytes / 1048576).toFixed(1), requests: reqs }));
  if (process.env.MARKS) for (const m of marks) console.log('   ', m);
};
await run('cold');
await run('warm');
await b.close();
