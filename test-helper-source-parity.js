#!/usr/bin/env node
/* Keep Node-testable helpers aligned with their browser copies in src/game.html. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const H = require('./src/helpers');
const browserSource = fs.readFileSync(require.resolve('./src/game.html'), 'utf8');

function declaration(name) {
  const match = browserSource.match(new RegExp('^const ' + name + ' = .*;$', 'm'));
  if (match) return match[0] + '\n' + name;
  const start = browserSource.search(new RegExp('^function ' + name + '\\s*\\(', 'm'));
  assert.notStrictEqual(start, -1, 'Browser implementation missing: ' + name);
  const open = browserSource.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  for (let i = open; i < browserSource.length; i++) {
    const c = browserSource[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return browserSource.slice(start, i + 1) + '\n' + name;
  }
  throw new Error('Could not parse browser function: ' + name);
}

function browserFunction(name) {
  return vm.runInNewContext(declaration(name), { TextEncoder, Date, Math, String, pad: H.pad });
}

const cases = [
  ['pad', [3], [3, 3], [100, 2]],
  ['esc', ['<a href="x">&'], ['plain']],
  ['md', ['run `ls -l`'], ['**bold**'], ['<script>']],
  ['reEsc', ['a.b*c'], ['[x]/y']],
  ['splitLines', ['a\\nb\\n'], [''], ['\\n']],
  ['human', [512], [1024], [1536], [1048576]],
  ['permStr', [{ type: 'file', mode: 0o644 }], [{ type: 'dir', mode: 0o755 }], [{ type: 'file', mode: 0o4755 }], [{ type: 'dir', mode: 0o1777 }]],
  ['fmtLogTime', [Date.UTC(2026, 9, 22, 3, 47, 12)]]
];

let passed = 0;
for (const [name, ...args] of cases) {
  const browser = browserFunction(name);
  for (const input of args) {
    assert.deepStrictEqual(browser(...input), H[name](...input), name + ' differs between browser and Node implementations');
    passed++;
  }
}
const browserRandom = browserFunction('mulberry32')(12345);
const nodeRandom = H.mulberry32(12345);
for (let i = 0; i < 10; i++) {
  assert.strictEqual(browserRandom(), nodeRandom(), 'mulberry32 differs between browser and Node implementations');
  passed++;
}
console.log(passed + ' browser/Node helper parity cases passed.');
