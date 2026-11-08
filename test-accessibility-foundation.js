'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = fs.readFileSync('src/game.html', 'utf8');
const network = fs.readFileSync('network-trainer/ui.js', 'utf8');
const rootCss = root.slice(0, root.indexOf('</style>'));
const networkCss = fs.readFileSync('network-trainer/workstation.css', 'utf8');

assert.match(root, /<nav class="apptabs" aria-label="Application navigation">/);
assert.match(root, /<a class="apptab on" href="\." aria-current="page">/);
assert.doesNotMatch(root, /<nav class="apptabs" role="tablist">/);
assert.match(rootCss, /:where\(a,button,input,select,textarea,\[tabindex\]\):focus-visible/);
assert.match(rootCss, /\.tline input:focus-visible/);
assert.match(rootCss, /\.race-modal input\[type=text\]:focus-visible/);

assert.match(network, /<nav class="apptabs" aria-label="Application navigation">/);
assert.match(network, /<a class="apptab on" href="#" aria-current="page">/);
assert.doesNotMatch(network, /<nav class="apptabs" role="tablist">/);
assert.match(networkCss, /:where\(a,button,input,select,textarea,\[tabindex\]\):focus-visible/);
assert.match(networkCss, /\.knowledge-command:focus-visible\s*\{[^}]*outline:2px solid var\(--focus\)/s);
assert.match(networkCss, /\.palette-search-row input:focus-visible/);

console.log('Accessibility foundation source checks passed.');
