// Separate origin/storage for a disposable two-day browser evaluation.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { twoDayFixture } from './two-day-fixture.mjs';
const root = resolve('.');
const port = Number(process.env.FLOWWEEK_QA_PORT || 4174);
const seed = twoDayFixture();
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1:4174');
      let data;
      if (url.pathname === '/js/state/persistence.js') {
        const original = await readFile(resolve(root, 'js/state/persistence.js'), 'utf8');
        data = original.replace(
          'if (!raw) return createState();',
          `if (!raw) return ${JSON.stringify(seed)};`,
        );
      } else {
        const path = resolve(
          root,
          '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
        );
        if (!path.startsWith(root + sep)) throw Error('path');
        data = await readFile(path);
      }
      const extension = extname(url.pathname === '/' ? 'index.html' : url.pathname);
      res.writeHead(200, {
        'Content-Type':
          {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
          }[extension] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Isolated UX scenario: http://127.0.0.1:${port}`));
