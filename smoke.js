#!/usr/bin/env node
/*
 * Optional real-browser smoke test. Serves the built app over localhost so
 * every browser gets a normal HTTP origin (file:// has an opaque "null"
 * origin and triggers WebKit CORS errors for local resources).
 *
 *   npm run smoke          # needs Playwright (devDependency)
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

(async () => {
  let engines;
  try { engines = require('playwright'); }
  catch { console.error('Playwright not installed — run `npm install` first. Skipping smoke test.'); process.exit(0); }

  const indexPath = path.join(process.cwd(), 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error('index.html is missing; run npm run build first');

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname !== '/' && pathname !== '/index.html') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(indexPath).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const engine = engines[browserName];
  if (!engine) {
    server.close();
    throw new Error('PLAYWRIGHT_BROWSER must be chromium, firefox, or webkit');
  }

  let browser;
  try {
    browser = await engine.launch();
    const page = await browser.newPage();
    const errors = [];
    // Network failures such as blocked optional CDN assets are not app errors.
    const isNetworkNoise = t => /Failed to load resource|ERR_|net::|ERR_TUNNEL|Access-Control-Allow-Origin/i.test(t);
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push('console.error: ' + m.text());
    });

    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const hasApp = await page.$('.app');
    if (!hasApp) errors.push('no .app element rendered — game did not boot');

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
