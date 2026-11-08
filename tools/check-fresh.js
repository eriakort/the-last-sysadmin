#!/usr/bin/env node
/*
 * Staleness guard. This is the check that would have caught the build-drift bug:
 * index.html stopped being regenerated from src/ while the sources kept changing,
 * so the deployed page silently fell behind.
 *
 * It rebuilds from src/ and fails if the committed index.html / service-worker.js
 * differ from what a fresh build produces — i.e. someone edited the generated
 * files by hand, or forgot to run `npm run build` after editing src/.
 *
 * Requires a git working tree (uses `git diff`). In CI this runs after build.
 */
const { execSync } = require('child_process');
const build = require('../build.js');

build(); // regenerate index.html and service-worker.js from src/

try {
  execSync('git diff --exit-code -- index.html service-worker.js', { stdio: 'pipe' });
  console.log('  ✓ index.html / service-worker.js are in sync with src/.');
} catch (e) {
  const diff = (e.stdout || Buffer.from('')).toString();
  console.error('  ✗ Generated files are STALE.');
  console.error('    index.html or service-worker.js differ from a fresh build of src/.');
  console.error('    Edit the sources under src/, run `npm run build`, and commit the result.');
  console.error('    Never edit index.html or service-worker.js by hand.\n');
  if (diff.trim()) console.error(diff.split('\n').slice(0, 40).join('\n'));
  process.exit(1);
}
