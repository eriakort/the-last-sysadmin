#!/usr/bin/env node
/*
 * Optional real-browser smoke test. Serves the built app over localhost so
 * browsers use a normal HTTP origin and can load its complete local shell.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

(async () => {
  let engines;
  try { engines = require('playwright'); }
  catch { console.error('Playwright not installed — run `npm install` first. Skipping smoke test.'); process.exit(0); }

  const root = process.cwd();
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('index.html is missing; run npm run build first');

  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  };

  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.stat(file, (statError, stat) => {
      if (statError || !stat.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(file).pipe(res);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const engine = engines[browserName];
  if (!engine) {
    await new Promise(resolve => server.close(resolve));
    throw new Error('PLAYWRIGHT_BROWSER must be chromium, firefox, or webkit');
  }

  let browser;
  try {
    browser = await engine.launch();
    const page = await browser.newPage();
    const errors = [];
    const isNetworkNoise = t => /Failed to load resource|ERR_|net::|ERR_TUNNEL|Access-Control-Allow-Origin/i.test(t);
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push('console.error: ' + m.text());
    });

    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    if (!await page.$('.app')) errors.push('no .app element rendered — game did not boot');

    if (errors.length) {
      console.error('SMOKE FAILED:');
      errors.forEach(e => console.error('  ✗ ' + e));
      process.exitCode = 1;
    } else {
      console.log('  ✓ Game boots clean (no page or console errors).');
      console.log('\\nSMOKE OK.');
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error('SMOKE FAILED:', error);
  process.exitCode = 1;
});
