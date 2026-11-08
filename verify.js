#!/usr/bin/env node
/*
 * Fast, browser-free verification of the built index.html.
 * Catches the failure modes that bit us before: JavaScript syntax errors that
 * break the whole page, and missing key features. Runs in CI with just Node.
 *
 *   node verify.js        # checks ./index.html
 *
 * For a deeper, real-browser boot test, see smoke.js (optional, needs Playwright).
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
let failures = 0;
const fail = m => { console.error('  ✗ ' + m); failures++; };
const ok = m => console.log('  ✓ ' + m);

// 1. Required markers / features must be present in the built page.
const required = [
  ['boot(load())', 'game boots'],
  ['function repairWorld', 'soft-lock resilience fix'],
  ['id="btnSettings"', 'Settings button'],
  ['function openClassroom', 'classroom UI (M2)'],
  ['function playAuthored', 'authored-mission playback (M10)'],
  ['data-theme="amber"', 'appearance themes'],
  ['const MISSIONS', 'missions defined'],
  ['service-worker.js', 'service-worker registration'],
];
for (const [needle, label] of required) {
  if (html.includes(needle)) ok(`present: ${label}`);
  else fail(`missing: ${label}  (looked for "${needle}")`);
}

// 2. Every inline <script> must be syntactically valid JS.
//    new Function() compiles (throws on SyntaxError) without running the code.
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (!scripts.length) fail('no inline <script> found');
scripts.forEach((code, i) => {
  if (!code.trim()) return;
  try { new Function(code); ok(`inline script #${i + 1} parses (${code.length} bytes)`); }
  catch (e) { fail(`inline script #${i + 1} has a syntax error: ${e.message}`); }
});

if (failures) { console.error(`\nVERIFY FAILED: ${failures} problem(s).`); process.exit(1); }
console.log('\nVERIFY OK.');
