import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, publicFiles, root } from './build.mjs';

export async function serve({ port = 4173, host = '127.0.0.1' } = {}) {
  const { site } = await build();
  const allowed = new Set(publicFiles);
  const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow:'GET, HEAD' }); return response.end(); }
    try {
      let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
      if (!allowed.has(path)) { response.writeHead(404); return response.end('Página não encontrada.'); }
      const file = await realpath(resolve(site, path));
      if (!file.startsWith(site + sep)) { response.writeHead(404); return response.end(); }
      const bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'text/plain', 'Content-Length':bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(404); response.end('Página não encontrada.'); }
  });
  await new Promise((res, rej) => { server.once('error', rej); server.listen(port, host, res); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await serve();
  console.log(`Farol: http://127.0.0.1:${server.address().port}/pratica.html`);
}
