// Local dev server (no Vercel CLI needed). Reads PIMLICO_API_KEY from env; never logs it.
import http from 'node:http';
import { handle } from '../lib/handler.js';
const port = Number(process.env.PORT ?? 8787);
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const url = new URL(req.url, `http://localhost:${port}`);
  const m = url.pathname.match(/^\/api\/bundler\/([^/]+)$/);
  if (!m) { res.writeHead(404).end(); return; }
  const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), m[1]);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`proxy on http://localhost:${port}/api/bundler/84532`));
