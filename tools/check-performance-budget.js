#!/usr/bin/env node
'use strict';

// Report deployable page sizes in raw, gzip, and Brotli form.
// Budgets are intentionally not enforced until CI measurements establish
// realistic limits for the current generated artifacts.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const targets = [
  { label: 'Linux platform', file: 'index.html' },
  { label: 'Network Trainer', file: 'network-trainer/index.html' }
];

const format = bytes => `${(bytes / 1024).toFixed(1)} KiB`;
let failed = false;

for (const target of targets) {
  const file = path.resolve(__dirname, '..', target.file);
  if (!fs.existsSync(file)) {
    console.error(`PERFORMANCE CHECK FAILED: missing generated page ${target.file}`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(file);
  const gzip = zlib.gzipSync(content, { level: 9 });
  const brotli = zlib.brotliCompressSync(content, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
  });
  console.log(
    `Performance baseline — ${target.label}: raw ${format(content.length)}, ` +
    `gzip-9 ${format(gzip.length)}, Brotli-11 ${format(brotli.length)}`
  );
}

if (failed) process.exit(1);
