#!/usr/bin/env node
/*
 * Staleness guard for every generated deployable application entry point.
 * Rebuild from source and fail if committed artifacts drift from that output.
 * Requires a git working tree (uses git diff); CI runs this after build.
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const build = require('../build.js');

build(); // regenerate root index.html and service-worker.js from src/

const networkBuild = spawnSync(process.execPath, [path.join(__dirname, '..', 'network-trainer', 'build-ui.js')], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
});
if (networkBuild.status !== 0) {
  console.error('  ✗ Network Trainer generated bundle could not be rebuilt.');
  console.error(networkBuild.stderr || networkBuild.stdout || 'Unknown build failure.');
  process.exit(networkBuild.status || 1);
}

try {
  execSync('git diff --exit-code -- index.html service-worker.js network-trainer/index.html', { stdio: 'pipe' });
  console.log('  ✓ root app, service worker, and Network Trainer bundle are in sync with their sources.');
} catch (e) {
  const diff = (e.stdout || Buffer.from('')).toString();
  console.error('  ✗ Generated files are STALE.');
  console.error('    index.html, service-worker.js, or network-trainer/index.html differ from a fresh build.');
  console.error('    Edit source files, run npm run build and npm run build:net, then commit generated output.');
  console.error('    Never edit generated files by hand.\n');
  if (diff.trim()) console.error(diff.split('\n').slice(0, 60).join('\n'));
  process.exit(1);
}
