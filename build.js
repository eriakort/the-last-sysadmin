#!/usr/bin/env node
/*
 * Build step for The Last Sysadmin.
 *
 * The deployed files are GENERATED — never edit index.html or service-worker.js
 * by hand. Edit the sources under src/ and run `node build.js` (or `npm run build`).
 *
 *   src/shell-head.html   fixed <head> boilerplate (doctype, metas, manifest links)
 *   src/game.html         THE game — title, CSS, <body>, and the game <script> (edit this)
 *   src/shell-tail.html   fixed tail (service-worker registration + </body></html>)
 *   src/service-worker.js service-worker template; __VERSION__ is filled from src/version.txt
 *   src/version.txt       the cache version number — bump it to force clients to refresh
 *
 * Output: index.html, service-worker.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

function build() {
  const head = read('shell-head.html');
  const game = read('game.html');
  const tail = read('shell-tail.html');
  const swTemplate = read('service-worker.js');
  const version = read('version.txt').trim();

  // guards — fail loudly rather than ship something broken
  if (!/^\d+$/.test(version)) throw new Error(`src/version.txt must be a number, got "${version}"`);
  if (!game.includes('<div class="app">')) throw new Error('src/game.html is missing <div class="app"> — wrong source?');
  if (!game.includes('boot(load())')) throw new Error('src/game.html is missing boot(load()) — wrong source?');
  if (!head.includes('<link rel="manifest"')) throw new Error('src/shell-head.html is missing the manifest link');
  if (!swTemplate.includes('__VERSION__')) throw new Error('src/service-worker.js is missing the __VERSION__ placeholder');

  const indexHtml = head + game + tail;
  const serviceWorker = swTemplate.replace(/__VERSION__/g, version);

  fs.writeFileSync(path.join(__dirname, 'index.html'), indexHtml);
  fs.writeFileSync(path.join(__dirname, 'service-worker.js'), serviceWorker);
  console.log(`Built index.html (${indexHtml.length} bytes) and service-worker.js (cache last-sysadmin-v${version}).`);
}

if (require.main === module) {
  try { build(); } catch (e) { console.error('BUILD FAILED:', e.message); process.exit(1); }
}
module.exports = build;
