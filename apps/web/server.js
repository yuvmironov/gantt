import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { request as proxyRequest } from 'node:http';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT ?? 3000);
const apiHost = process.env.API_GATEWAY_HOST ?? 'api-gateway';
const apiPort = Number(process.env.API_GATEWAY_PORT ?? 8080);
const publicDir = new URL('./public/', import.meta.url).pathname;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function proxy(request, response) {
  const upstream = proxyRequest(
    {
      hostname: apiHost,
      port: apiPort,
      path: request.url,
      method: request.method,
      headers: {
        ...request.headers,
        host: `${apiHost}:${apiPort}`,
        'x-forwarded-proto': request.headers['x-forwarded-proto'] ?? 'https',
        'x-forwarded-host': request.headers.host ?? '',
      },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    response.end(JSON.stringify({ error: 'api_gateway_unavailable' }));
  });
  request.pipe(upstream);
}

function staticFile(request, response) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"status":"ok"}');
    return;
  }
  const relative = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(publicDir, relative));
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  try {
    if (!statSync(filePath).isFile()) throw new Error('not a file');
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

createServer((request, response) => {
  if ((request.url ?? '').startsWith('/api/')) {
    proxy(request, response);
    return;
  }
  staticFile(request, response);
}).listen(port, '0.0.0.0');
