// A proxy in front of the preview server that answers page navigations late
// when told to (`/__slow?ms=4000`, `/__slow?ms=0`), so a probe can see what
// the offline copy does on a slow connection (tools/updateprobe.mjs).
//   node tools/slowproxy.mjs [listen=5191] [upstream=5190]
import http from 'node:http';
const [listen = '5191', upstream = '5190'] = process.argv.slice(2);
let delay = 0;
http.createServer((req, res) => {
  if (req.url.startsWith('/__slow')) { delay = +(new URL(req.url, 'http://x').searchParams.get('ms') || 0); res.end(`delay ${delay}`); return; }
  const isPage = (req.headers.accept || '').includes('text/html') || req.url === '/' || req.url.endsWith('.html');
  const go = () => {
    const up = http.request({ host: 'localhost', port: +upstream, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${upstream}` } }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    up.on('error', () => { res.statusCode = 502; res.end(); });
    req.pipe(up);
  };
  if (isPage && delay) setTimeout(go, delay); else go();
}).listen(+listen, () => console.log(`slow proxy on ${listen} -> ${upstream}`));
