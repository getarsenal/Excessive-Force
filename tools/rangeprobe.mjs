// The hangar's live-fire range on a phone: open the hangar, pick an airframe
// with a gun (KIND, the AH-64E by default), hold FIRE for three seconds, tap
// a board, fire again, and read the count. WPN=1 changes to the second gun
// (the gunship's 105) first.
//   KIND=warthog node tools/rangeprobe.mjs  -> /tmp/out/range-<kind>-{ready,firing,after}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const port = process.env.TT_PORT || 5177;
const HOLD = +(process.env.HOLD || 3000);
const KIND = process.env.KIND || 'apache';
const shot = (n) => `/tmp/out/range-${KIND}${process.env.WPN ? '-w' + process.env.WPN : ''}-${n}.png`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const W = +(process.env.W || 393), H = +(process.env.H || 852);
const page = await b.newPage({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
} catch {} });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title .tt-menu', { timeout: 120000 });
await page.waitForTimeout(2000);
await page.click('#title [data-act="hangar"]');
await page.waitForTimeout(2500);
await page.click(`.hg-chip[data-kind="${KIND}"]`);
await page.waitForTimeout(2000);
for (let i = 0; i < +(process.env.WPN || 0); i++) { await page.click('.hg-wpn'); await page.waitForTimeout(200); }
const ready = await page.evaluate(() => ({ wpn: document.querySelector('.hg-wpn')?.hidden ? null : document.querySelector('.hg-wpn')?.textContent, fire: !document.querySelector('.hg-fire')?.hidden, ammo: document.querySelector('.hg-ammo')?.innerText.replace(/\n/g, ' '), hint: document.querySelector('.hg-hint')?.textContent, btn: (() => { const r = document.querySelector('.hg-fire').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })() }));
await page.screenshot({ path: shot('ready') });
const btn = await page.$('.hg-fire');
const box = await btn.boundingBox();
const fire = async (ms) => {
  await page.evaluate(() => { const f = document.querySelector('.hg-fire'); f.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, cancelable: true, isPrimary: true, pointerType: 'touch' })); });
  await page.waitForTimeout(ms);
};
await fire(HOLD);
await page.screenshot({ path: shot('firing') });
await page.evaluate(() => document.querySelector('.hg-fire').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true, pointerType: 'touch' })));
const mid = await page.evaluate(() => document.querySelector('.hg-ammo')?.innerText.replace(/\n/g, ' '));
// Tap the canvas a little right of centre to move the aim, fire again.
const cv = await (await page.$('.hg-canvas')).boundingBox();
await page.mouse.click(cv.x + cv.width * +(process.env.TX || 0.3), cv.y + cv.height * +(process.env.TY || 0.4));
await page.waitForTimeout(600);
await fire(1500);
await page.evaluate(() => document.querySelector('.hg-fire').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true, pointerType: 'touch' })));
await page.waitForTimeout(800);
await page.screenshot({ path: shot('after') });
const after = await page.evaluate(() => ({ ammo: document.querySelector('.hg-ammo')?.innerText.replace(/\n/g, ' '), on: document.querySelector('.hg-fire')?.classList.contains('on') }));
// Off the Apache the trigger goes away.
await page.click('.hg-chip[data-kind="lancer"]');
await page.waitForTimeout(800);
const lancer = await page.evaluate(() => ({ fire: !document.querySelector('.hg-fire')?.hidden, ammo: !document.querySelector('.hg-ammo')?.hidden }));
console.log(JSON.stringify({ ready, mid, after, lancer, box, errors }));
await b.close();
