#!/usr/bin/env node
/* Verify the browser application consumes the same canonical helper module tested by Node. */
const assert = require('assert');
const fs = require('fs');
const app = fs.readFileSync(require.resolve('./src/app.js'), 'utf8');
const helpers = require('./src/helpers');
const browserHelpers = /globalThis\.LSAHelpers/.test(app);
assert.ok(browserHelpers, 'Application must consume the canonical LSAHelpers module');
for (const name of ['esc', 'md', 'reEsc', 'splitLines', 'mulberry32', 'norm', 'permStr', 'human', 'lsDate']) {
  assert.strictEqual(typeof helpers[name], 'function', 'Canonical helper missing: ' + name);
}
console.log('Canonical browser/Node helper module integration passed.');
