/* Minimal static server for Playwright's local app tests. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { ensureStaticAssets } = require('./ensure_static_assets.cjs');

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

function resolvePath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
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

function createStaticServer(root = process.cwd()) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const filePath = resolvePath(root, req.url || '/');
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
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

function startServer({ root = process.cwd(), port = 8000, host = '127.0.0.1' } = {}) {
  const server = createStaticServer(root);
  server.listen(port, host, () => {
    console.log(`Serving ${root} at http://${host}:${port}/`);
  });
  return server;
}

if (require.main === module) {
  const assets = ensureStaticAssets(process.cwd());
  for (const relPath of assets.restored) {
    console.log(`Restored static asset from git: ${relPath}`);
  }
  if (assets.failures.length) {
    for (const failure of assets.failures) console.error(`Static asset: ${failure}`);
    process.exit(1);
  }

  startServer({
    root: process.cwd(),
    port: Number(process.argv[2] || 8000),
    host: process.argv[3] || '127.0.0.1',
  });
}

module.exports = {
  createStaticServer,
  resolvePath,
  startServer,
  types,
};
