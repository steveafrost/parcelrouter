const http = require('http');
const fs = require('fs');
const path = require('path');

const siteRoot = path.resolve(__dirname, '../../site');
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(siteRoot, `.${requestedPath}`);

  if (!filePath.startsWith(siteRoot + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    res.writeHead(200, {
      'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    res.end(req.method === 'HEAD' ? undefined : contents);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ParcelRouter site at http://127.0.0.1:${port}`);
});
