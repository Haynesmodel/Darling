/* Minimal static server for Playwright's local app tests. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function normalizeBasePath(basePath = '/') {
  const stripped = String(basePath || '/').replace(/^\/+|\/+$/g, '');
  return stripped ? `/${stripped}/` : '/';
}

function splitUrlPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }

  return decoded;
}

function resolvePath(root, urlPath, basePath = '/') {
  let decoded = splitUrlPath(urlPath);
  if (decoded === null) return null;

  const normalizedBasePath = normalizeBasePath(basePath);
  if (normalizedBasePath !== '/') {
    const baseWithoutTrailingSlash = normalizedBasePath.slice(0, -1);
    if (decoded === baseWithoutTrailingSlash) decoded = normalizedBasePath;
    if (!decoded.startsWith(normalizedBasePath)) return null;
    decoded = `/${decoded.slice(normalizedBasePath.length)}`;
  }

  const requestPath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const normalized = path.normalize(requestPath);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`) || path.isAbsolute(normalized)) {
    return null;
  }

  const rootPath = path.resolve(root);
  const filePath = path.resolve(rootPath, normalized);
  if (filePath !== rootPath && !filePath.startsWith(rootPath + path.sep)) return null;
  return filePath;
}

function createStaticServer(root = process.cwd(), opts = {}) {
  const basePath = normalizeBasePath(opts.basePath || '/');

  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const decodedPath = splitUrlPath(req.url || '/');
    if (basePath !== '/' && decodedPath === '/') {
      const query = (req.url || '').includes('?') ? `?${(req.url || '').split('?').slice(1).join('?')}` : '';
      res.writeHead(302, { location: `${basePath}${query}` });
      res.end();
      return;
    }

    const filePath = resolvePath(root, req.url || '/', basePath);
    if (!filePath) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    fs.readFile(filePath, (err, body) => {
      if (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
        return;
      }

      res.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': body.length,
        'content-type': types[path.extname(filePath)] || 'application/octet-stream',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
    });
  });
}

function startServer({ root = process.cwd(), port = 8000, host = '127.0.0.1', basePath = '/' } = {}) {
  const server = createStaticServer(root, { basePath });
  server.listen(port, host, () => {
    console.log(`Serving ${root} at http://${host}:${port}${normalizeBasePath(basePath)}`);
  });
  return server;
}

if (require.main === module) {
  const server = startServer({
    root: process.argv[4] ? path.resolve(process.argv[4]) : process.cwd(),
    port: Number(process.argv[2] || 8000),
    host: process.argv[3] || '127.0.0.1',
    basePath: process.argv[5] || '/',
  });
  server.on('error', error => console.error(`[static-server:error] ${error.stack || error}`));
  server.on('close', () => console.error('[static-server:close] preview server closed'));
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      console.error(`[static-server:${signal}] shutting down`);
      server.close(() => process.exit(0));
    });
  }
}

module.exports = {
  createStaticServer,
  normalizeBasePath,
  resolvePath,
  startServer,
  types,
};
