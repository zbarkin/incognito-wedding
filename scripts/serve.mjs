// Serves docs/ at http://localhost:4174 for a local look, plus the shop API at /api/shop/*
// (against the stand-in BridalLive unless BRIDALLIVE_API_KEY is set). Run: node scripts/serve.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shopApiFromEnv } from '../server/index.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp' };
const port = Number(process.env.PORT) || 4174;
const shopApi = await shopApiFromEnv();

createServer(async (req, res) => {
  if (req.url.startsWith('/api/shop/')) return api(req, res);
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(site, path));
  if (!file.startsWith(site)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log('http://localhost:' + port));

// Node's request -> a web Request for the shop API, and its Response back.
async function api(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request('http://localhost:' + port + req.url, {
    method: req.method, headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
  });
  const r = (await shopApi(request)) || new Response('Not found', { status: 404 });
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}
