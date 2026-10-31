#!/usr/bin/env node
/*
 * Optional real-browser smoke test. Boots the built index.html in headless
 * Chromium and fails on any uncaught page error or console error during load.
 * This is the deepest check — it actually runs the game's JavaScript.
 *
 *   npm run smoke          # needs Playwright (devDependency)
 *
 * verify.js already catches syntax errors without a browser; this additionally
 * catches runtime errors that only surface when the page actually boots.
 */
const path = require('path');

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.error('Playwright not installed — run `npm install` first. Skipping smoke test.'); process.exit(0); }

  const url = 'file://' + path.join(process.cwd(), 'index.html');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  // Resource-load failures depend on network/sandbox connectivity, not on the
  // game's code — the game is offline-first (PWA), so a blocked CDN/font fetch
  // is expected. We only care about real JavaScript errors.
  const isNetworkNoise = t => /Failed to load resource|ERR_|net::|ERR_TUNNEL/i.test(t);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push('console.error: ' + m.text()); });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1500); // let boot() and any deferred init run

  // The terminal should have rendered the game shell.
  const hasApp = await page.$('.app');
  if (!hasApp) errors.push('no .app element rendered — game did not boot');

  await browser.close();

  if (errors.length) {
    console.error('SMOKE FAILED:');
    errors.forEach(e => console.error('  ✗ ' + e));
    process.exit(1);
  }
  console.log('  ✓ Game boots clean (no page or console errors).');
  console.log('\nSMOKE OK.');
})();
