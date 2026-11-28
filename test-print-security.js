#!/usr/bin/env node
'use strict';
// Regression tests for user-controlled content rendered into print documents.
const assert = require('assert');
const fs = require('fs');
const H = require('./src/helpers');
const app = fs.readFileSync(require.resolve('./src/app.js'), 'utf8');

const payload = '<img src=x onerror=alert(1)><script>alert(1)</script>&"';
const escaped = H.esc(payload);
assert.ok(!escaped.includes('<script>'), 'HTML tags must be escaped');
assert.ok(!escaped.includes('<img'), 'HTML elements must be escaped');
assert.ok(escaped.includes('&lt;script&gt;'), 'script tag should become text');
assert.ok(escaped.includes('&amp;'), 'ampersands should be escaped');

const printStart = app.indexOf('  function openPrintDocument(html) {');
const customClassStart = app.indexOf('  // Play custom (authored) class missions', printStart);
assert.ok(printStart >= 0 && customClassStart > printStart, 'print document helper and certificate renderer should exist');
const printSection = app.slice(printStart, customClassStart);
for (const field of ['esc(name)', 'esc(title)', 'esc(cls)']) {
  assert.ok(printSection.includes(field), 'certificate must HTML-escape ' + field);
}
assert.ok(printSection.includes('if (!w) return false;'), 'blocked print popups should fail safely');
assert.ok(printSection.includes('w.opener = null;'), 'print window must not retain an opener reference');
assert.ok(printSection.includes("w.addEventListener('load'"), 'printing should wait for the document to load');
assert.ok(!printSection.includes('window.print()'), 'print documents must not execute an injected inline print script');

const questionPrintStart = app.indexOf('  function printQB(withAns) {');
const questionPrintEnd = app.indexOf("  const qbTab =", questionPrintStart);
assert.ok(questionPrintStart >= 0 && questionPrintEnd > questionPrintStart, 'question-bank print renderer should exist');
const questionPrint = app.slice(questionPrintStart, questionPrintEnd);
for (const field of ['esc(x.question)', 'esc(x.category)', 'esc(x.difficulty)', 'esc(x.answer)']) {
  assert.ok(questionPrint.includes(field), 'question-bank print output must escape ' + field);
}
assert.ok(questionPrint.includes('openPrintDocument(html)'), 'question-bank printing should use the hardened print-window helper');
console.log('Print security tests passed.');
