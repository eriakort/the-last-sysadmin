#!/usr/bin/env node
/*
 * Unit tests for the pure modules under src/ (helpers.js, checkers.js).
 * No DOM, no browser, no game state — just Node. Run with `npm test`.
 *
 * These are the functions that decide whether a ticket passes, how paths
 * resolve, and how output is formatted, so a regression here is a gameplay bug.
 */
const assert = require('assert');
const H = require('./src/helpers');
const C = require('./src/checkers');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const eq = (a, b, msg) => assert.strictEqual(a, b, msg);
const deep = (a, b, msg) => assert.deepStrictEqual(a, b, msg);

/* ---------- helpers.js ---------- */

test('pad', () => {
  eq(H.pad(3), '03');
  eq(H.pad(3, 3), '003');
  eq(H.pad(42), '42');
  eq(H.pad(100, 2), '100'); // never truncates
});

test('esc escapes HTML metacharacters', () => {
  eq(H.esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  eq(H.esc('plain'), 'plain');
});

test('md renders inline code and bold after escaping', () => {
  eq(H.md('run `ls -l`'), 'run <code>ls -l</code>');
  eq(H.md('**bold**'), '<b>bold</b>');
  // escaping happens first, so a tag in input never becomes real markup
  eq(H.md('<script>'), '&lt;script&gt;');
});

test('reEsc escapes regex metacharacters', () => {
  eq(H.reEsc('a.b*c'), 'a\\.b\\*c');
  // the escaped string, used as a RegExp, matches the literal
  assert.ok(new RegExp(H.reEsc('a.b')).test('a.b'));
  assert.ok(!new RegExp(H.reEsc('a.b')).test('axb'));
});

test('splitLines drops a single trailing newline', () => {
  deep(H.splitLines('a\nb\n'), ['a', 'b']);
  deep(H.splitLines('a\nb'), ['a', 'b']);
  deep(H.splitLines(''), []);
  deep(H.splitLines('\n'), ['']);
});

test('mulberry32 is deterministic for a given seed', () => {
  const r1 = H.mulberry32(12345);
  const r2 = H.mulberry32(12345);
  const a = [r1(), r1(), r1()];
  const b = [r2(), r2(), r2()];
  deep(a, b);
  assert.ok(a.every(x => x >= 0 && x < 1));
});

test('ticketId is 1-based and zero-padded', () => {
  eq(H.ticketId(0), 'INC-1025-01');
  eq(H.ticketId(9), 'INC-1025-10');
});

test('norm resolves ~, .., and relative paths', () => {
  eq(H.norm('~', '/root', '/home/ops'), '/home/ops');
  eq(H.norm('~/logs', '/root', '/home/ops'), '/home/ops/logs');
  eq(H.norm('a/b/../c', '/var', '/home/ops'), '/var/a/c');
  eq(H.norm('/etc/./passwd', '/var', '/home/ops'), '/etc/passwd');
  eq(H.norm('..', '/var/log', '/home/ops'), '/var');
});

test('basename / dirname', () => {
  eq(H.basename('/var/log/app.log'), 'app.log');
  eq(H.basename('/'), '/');
  eq(H.dirname('/var/log/app.log'), '/var/log');
  eq(H.parentOf('/var/log/app.log'), '/var/log');
});

test('permStr formats a regular file and a directory', () => {
  eq(H.permStr({ type: 'file', mode: 0o644 }), '-rw-r--r--');
  eq(H.permStr({ type: 'dir', mode: 0o755 }), 'drwxr-xr-x');
  // setuid bit shows as 's' when owner-exec is set
  eq(H.permStr({ type: 'file', mode: 0o4755 }), '-rwsr-xr-x');
});

test('permission bit checks', () => {
  assert.ok(H.canRead(0o400) && !H.canRead(0o200));
  assert.ok(H.canWrite(0o200) && !H.canWrite(0o400));
  assert.ok(H.canExec(0o100) && !H.canExec(0o200));
});

test('human-readable sizes', () => {
  eq(H.human(512), '512');
  eq(H.human(1024), '1.0K');
  eq(H.human(1536), '1.5K');
  eq(H.human(1048576), '1.0M');
});

/* ---------- checkers.js (pure mission checks on an fs snapshot) ---------- */

// Minimal fs snapshot shaped like the game's virtual filesystem.
const fsFix = () => ({
  type: 'dir',
  children: {
    etc: {
      type: 'dir',
      children: {
        passwd: { type: 'file', mode: 0o644, owner: 'root', content: 'root:x:0:0\nops:x:1000:1000\n' },
      },
    },
    home: {
      type: 'dir',
      children: {
        ops: {
          type: 'dir', owner: 'ops',
          children: {
            'deploy.sh': { type: 'file', mode: 0o755, owner: 'ops', content: '#!/bin/sh\necho deploying\n' },
            'notes.txt': { type: 'file', mode: 0o644, owner: 'ops', content: 'TODO: rotate keys' },
          },
        },
      },
    },
  },
});

test('walk + fileExists', () => {
  const fs = fsFix();
  assert.ok(C.fileExists(fs, '/etc/passwd'));
  assert.ok(C.fileExists(fs, '/home/ops'));
  assert.ok(!C.fileExists(fs, '/etc/nope'));
  assert.ok(!C.fileExists(fs, '/etc/passwd/deeper')); // can't descend into a file
});

test('fileMode / fileOwner / fileSize', () => {
  const fs = fsFix();
  eq(C.fileMode(fs, '/home/ops/deploy.sh'), 0o755);
  eq(C.fileMode(fs, '/nope'), null);
  eq(C.fileOwner(fs, '/etc/passwd'), 'root');
  eq(C.fileSize(fs, '/home/ops/notes.txt'), 'TODO: rotate keys'.length);
  eq(C.fileSize(fs, '/home/ops'), null); // directories have no size
});

test('checkExecutable', () => {
  const fs = fsFix();
  deep(C.checkExecutable(fs, '/home/ops/deploy.sh'), { ok: true });
  eq(C.checkExecutable(fs, '/home/ops/notes.txt').ok, false);
  eq(C.checkExecutable(fs, '/nope').ok, false);
});

test('checkContains / checkMatches', () => {
  const fs = fsFix();
  deep(C.checkContains(fs, '/home/ops/notes.txt', 'rotate'), { ok: true });
  eq(C.checkContains(fs, '/home/ops/notes.txt', 'absent').ok, false);
  eq(C.checkContains(fs, '/home/ops', 'x').ok, false); // not a file
  deep(C.checkMatches(fs, '/home/ops/deploy.sh', /^#!\/bin\/sh/), { ok: true });
  eq(C.checkMatches(fs, '/home/ops/deploy.sh', /python/).ok, false);
});

test('checkOwner', () => {
  const fs = fsFix();
  deep(C.checkOwner(fs, '/etc/passwd', 'root'), { ok: true });
  eq(C.checkOwner(fs, '/etc/passwd', 'ops').ok, false);
  eq(C.checkOwner(fs, '/nope', 'root').ok, false);
});

test('checkIsDir', () => {
  const fs = fsFix();
  deep(C.checkIsDir(fs, '/home/ops'), { ok: true });
  eq(C.checkIsDir(fs, '/etc/passwd').ok, false);
});

test('checkMinSize', () => {
  const fs = fsFix();
  deep(C.checkMinSize(fs, '/etc/passwd', 10), { ok: true });
  eq(C.checkMinSize(fs, '/etc/passwd', 10000).ok, false);
  eq(C.checkMinSize(fs, '/nope', 1).ok, false);
});

/* ---------- runner ---------- */
let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); }
}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
