#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const targets = [
  {
    label: 'Linux platform',
    file: 'index.html',
    gzipBudget: 240 * 1024,
    brotliBudget: 200 * 1024
  },
  {
    label: 'Network Trainer',
    file: 'network-trainer/index.html',
    // Raised 192/156 -> 208/168 for roadmap Phase 1-3: design-from-requirements,
    // the curriculum tier layer, and the decision/tradeoff + incident-command
    // mission types. Current page ~192 KiB gzip / ~155 KiB Brotli; ~16 KiB headroom.
    gzipBudget: 208 * 1024,
    brotliBudget: 168 * 1024
  }
];

const format = bytes => `${(bytes / 1024).toFixed(1)} KiB`;
const isWithinBudget = (actual, budget) => actual <= budget;

function checkBudget(label, encoding, actual, budget) {
  const status = isWithinBudget(actual, budget) ? 'PASS' : 'FAIL';
  console.log(`${status} ${label} ${encoding}: ${format(actual)} / ${format(budget)} budget`);
  if (!isWithinBudget(actual, budget)) {
    console.error(`PERFORMANCE BUDGET EXCEEDED: ${label} ${encoding} is ${format(actual - budget)} over budget`);
    return false;
  }
  return true;
}

function run() {
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

    console.log(`Performance baseline — ${target.label}: raw ${format(content.length)}`);
    if (!checkBudget(target.label, 'gzip-9', gzip.length, target.gzipBudget)) failed = true;
    if (!checkBudget(target.label, 'Brotli-11', brotli.length, target.brotliBudget)) failed = true;
  }

  if (failed) process.exitCode = 1;
}

if (require.main === module) run();

module.exports = { isWithinBudget, targets };
