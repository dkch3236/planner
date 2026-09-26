import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.');
http
  .createServer(async (req, res) => {
    try {
      const path = resolve(
        root,
        '.' +
          decodeURIComponent(
            new URL(req.url, 'http://localhost').pathname === '/'
              ? '/index.html'
              : new URL(req.url, 'http://localhost').pathname,
          ),
      );
      if (!path.startsWith(root + sep)) throw Error();
      const data = await readFile(path);
      res.writeHead(200, {
        'Content-Type':
          {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
          }[extname(path)] || 'text/plain',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(4173, '127.0.0.1', () => console.log('FlowWeek: http://127.0.0.1:4173'));
