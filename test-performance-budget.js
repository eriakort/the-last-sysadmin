'use strict';

const assert = require('node:assert/strict');
const { isWithinBudget, targets } = require('./tools/check-performance-budget');

assert.equal(isWithinBudget(100, 100), true, 'a size exactly at the limit should pass');
assert.equal(isWithinBudget(99, 100), true, 'a size below the limit should pass');
assert.equal(isWithinBudget(101, 100), false, 'a size above the limit should fail');

assert.deepEqual(
  targets.map(({ file, gzipBudget, brotliBudget }) => ({ file, gzipBudget, brotliBudget })),
  [
    { file: 'index.html', gzipBudget: 240 * 1024, brotliBudget: 200 * 1024 },
    { file: 'network-trainer/index.html', gzipBudget: 180 * 1024, brotliBudget: 145 * 1024 }
  ],
  'both generated pages should retain explicit compressed-transfer budgets'
);

console.log('Performance budget boundary tests passed.');
