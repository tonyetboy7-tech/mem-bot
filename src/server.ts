import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { CFG } from './config';
import { feedPath } from './feed';
import { log } from './util';

const SITE = path.resolve(CFG.testMode ? 'site/test.html' : 'site/index.html');

/** serves the website at / and feed.json to anyone. In test mode, wallets that connect on the site register as test holders. */
export function serve(onRegister: (wallet: string) => { ok: boolean; error?: string }, onRunNow: () => { ok: boolean; error?: string }) {
  http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'OPTIONS') { res.end(); return; }
    if (url === '/feed.json') {
      try { res.setHeader('Content-Type', 'application/json'); res.end(fs.readFileSync(feedPath())); }
      catch { res.statusCode = 503; res.end('{"error":"no feed yet"}'); }
      return;
    }
    if (url === '/register' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 2000) req.destroy(); });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (!CFG.testMode) { res.statusCode = 403; res.end('{"ok":false,"error":"registration is only for test runs"}'); return; }
        let wallet = '';
        try { wallet = String(JSON.parse(body).wallet || ''); } catch { /* bad body */ }
        const r = onRegister(wallet);
        res.statusCode = r.ok ? 200 : 400;
        res.end(JSON.stringify(r));
      });
      return;
    }
    if (url === '/run-now' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json');
      if (!CFG.testMode) { res.statusCode = 403; res.end('{"ok":false,"error":"only for test runs"}'); return; }
      const r = onRunNow(); res.statusCode = r.ok ? 200 : 409; res.end(JSON.stringify(r)); return;
    }
    if (url === '/health') { res.end('ok'); return; }
    if (url === '/' || url === '/index.html') {
      try { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(SITE)); }
      catch { res.statusCode = 404; res.end('site/index.html missing'); }
      return;
    }
    res.statusCode = 404; res.end();
  }).listen(CFG.port, () => log(`site on http://localhost:${CFG.port}  (feed at /feed.json)`));
}
