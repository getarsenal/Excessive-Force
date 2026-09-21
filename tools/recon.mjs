// Recon photographs for the campaign HQ: each level from its own opening
// camera, 640x360 JPEG, into public/assets/recon/<level>.jpg.
//
//   npx vite --port 5177 --strictPort &
//   node tools/recon.mjs [westminster,paris,...]
import { chromium } from 'playwright';
const ids = (process.argv[2] || 'westminster,paris,agra,giza,chichen,pisa,sydney,moscow,rio').split(',');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const id of ids) {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'high'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); } catch {} });
  await page.goto(`http://localhost:5177/?level=${id}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
  await page.evaluate(() => { window.hud.setClearView(true); document.getElementById('restore-btn').style.display = 'none'; const r = window.rig; r.desiredDistance *= 0.92; });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `public/assets/recon/${id}.jpg`, type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: 1280, height: 720 }, scale: 'css' });
  await page.close();
  console.log('shot', id);
}
await b.close();
